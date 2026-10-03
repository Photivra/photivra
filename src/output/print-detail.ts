// SPDX-License-Identifier: Apache-2.0

/** Bounded regional Fourier diagnostic, not a perceived-quality or captured-MTF verdict.
 * @see docs/PRINT_DETAIL_ASSESSMENT.md and docs/PRINT_DETAIL_VALIDATION.md.
 */
import { calculatedResult, type CalculationResult } from "../core/calculation-result.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";
import { parseEvidenceList, type EvidenceProvenance } from "../core/evidence-provenance.js";
import { freezeOwnedData } from "../core/owned-data.js";
import { requireAllowlistedRecord, requirePublicOpaqueId } from "../core/record-validation.js";
import { composeScientificAssurance, type ComposedScientificAssurance } from "../core/scientific-assurance.js";
import { requirePositiveInteger } from "../core/validation.js";
import { ENGINE_API_VERSION } from "../core/version.js";
import type { RasterDimensions } from "../sensor/sensor-geometry.js";
import { mapOrientedPhysicalUvToImagePlanePoint, resolveCaptureGeometry, type RasterRect } from "./capture-geometry.js";
import { calculatePrintPlan, parsePrintPlanInput, type PrintPlan, type PrintPlanInput } from "./print-plan.js";

/** Metric/protocol identity; independent of the root creator version. */
export const PRINT_REGION_DETAIL_MODEL_VERSION = "0.1.0" as const;
/** Work bound for one dense ROI, not an actual-device capability claim. */
export const MAX_PRINT_DETAIL_REGION_SAMPLES = 65536;

/** Exact represented source; content hash and decoding are caller assertions. */
export interface PrintDetailSource {
  captureId: string;
  representationId: string;
  contentSha256: string;
  raster: RasterDimensions;
  stage: "native-retained-linear" | "post-resampling-linear" | "post-encoding-decoded-linear";
  domain: "relative-linear-luminance" | "transfer-encoded-luma" | "unknown";
  registration: "oriented-retained-unwarped" | "correction-or-warp-unqualified";
  processing: { id: string; version: string };
  noiseRealizationId: string | null;
  evidence: readonly EvidenceProvenance[];
}
/** Selected half-open rectangle in the represented oriented retained raster.
 * Depth is descriptive, in metres; null explicitly means unknown.
 */
export interface PrintDetailRegion {
  id: string;
  rect: RasterRect;
  role: "selected-subject" | "field-diagnostic" | "intentional-defocus";
  subjectDistanceM: number | null;
  focusDistanceM: number | null;
}
/** Coherent integer Fourier mode; x right/y down, arbitrary phase at first ROI sample.
 * Input modulation is dimensionless, positive and at most one.
 */
export interface PrintSinusoidalTarget {
  id: string;
  version: string;
  kind: "coherent-sinusoid";
  cyclesAcrossRegion: { x: number; y: number };
  referenceModulation: number;
}
/** Own/reusable scalar relative-linear ROI samples; no RGB/luma conversion is inferred. */
export interface PrintRegionDetailInput {
  assessmentId: string;
  print: PrintPlanInput;
  source: PrintDetailSource;
  region: PrintDetailRegion;
  target: PrintSinusoidalTarget;
  samples: readonly number[];
}
/** Calculated coefficients for one declared grating; residual is not a noise metric. */
export interface PrintSinusoidalMeasurement {
  meanRelativeLuminance: number;
  fundamentalAmplitudeRelativeLuminance: number;
  fundamentalModulation: number;
  declaredGratingTransfer: number;
  unexplainedResidualRmsRelativeToMean: number;
}
/** Immutable snapshot with no full-system, artifact, perception or print-quality pass. */
export interface PrintRegionDetailAssessment {
  assessmentId: string;
  engineApiVersion: string;
  modelVersion: typeof PRINT_REGION_DETAIL_MODEL_VERSION;
  input: PrintRegionDetailInput;
  status: "diagnostic-only" | "blocked" | "unsupported";
  blockers: string[];
  print: PrintPlan;
  measurement: PrintSinusoidalMeasurement | null;
  projection: {
    fieldPointMm: { x: number; y: number };
    frequencyCyclesPerMm: { x: number; y: number };
    physicalPeriodMm: number;
    angularPeriodAtImageCenterDegrees: number;
  } | null;
  assessedRasterMatchesRecommendation: boolean;
  sourceArtifactVerification: "caller-declared-unverified";
  assurance: ComposedScientificAssurance;
  unassessed: readonly ("captured-system-mtf" | "optical-motion-attribution" | "noise" | "aliasing" | "halos" | "compression" | "color" | "perceived-quality" | "printer-substrate")[];
  overallPrintVerdict: "not-offered";
}

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  return requireAllowlistedRecord(value, keys, "Invalid or unknown Print detail fields.");
}
function finite(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new InvalidConfigurationError("Print detail quantities must be finite numbers.");
  return value;
}
function positive(value: unknown): number {
  const v = finite(value); if (v <= 0) throw new InvalidConfigurationError("Print detail quantity must be positive."); return v;
}
function integer(value: unknown, nonnegative = false): number {
  const v = finite(value);
  if (!Number.isSafeInteger(v) || (nonnegative && v < 0)) throw new InvalidConfigurationError("Print detail coordinates/counts must be safe integers.");
  return v === 0 ? 0 : v;
}
function id(value: unknown): string { return requirePublicOpaqueId(value, "Invalid public Print detail identity."); }
function choice<T extends string>(value: unknown, options: readonly T[]): T {
  if (typeof value !== "string" || !options.includes(value as T)) throw new InvalidConfigurationError("Unknown Print detail enum.");
  return value as T;
}
function raster(value: unknown): RasterDimensions {
  const r = record(value, ["pixelWidth", "pixelHeight"]);
  const pixelWidth = integer(r.pixelWidth), pixelHeight = integer(r.pixelHeight);
  requirePositiveInteger("pixelWidth", pixelWidth); requirePositiveInteger("pixelHeight", pixelHeight);
  return { pixelWidth, pixelHeight };
}
function nullableDistance(value: unknown): number | null { return value === null ? null : positive(value); }

/** Parse/copy bounded, untrusted region/source/target data and existing Print geometry.
 * Unknowns, sparse arrays and factual-reference-only numeric samples fail closed.
 */
export function parsePrintRegionDetailInput(value: unknown): PrintRegionDetailInput {
  const r = record(value, ["assessmentId", "print", "source", "region", "target", "samples"]);
  const s = record(r.source, ["captureId", "representationId", "contentSha256", "raster", "stage", "domain", "registration", "processing", "noiseRealizationId", "evidence"]);
  if (typeof s.contentSha256 !== "string" || !/^[a-f0-9]{64}$/.test(s.contentSha256)) throw new InvalidConfigurationError("Print detail source requires a lowercase SHA-256 declaration.");
  const processing = record(s.processing, ["id", "version"]);
  if (!Array.isArray(s.evidence) || s.evidence.length > 16) throw new InvalidConfigurationError("Print detail evidence must be a bounded nonempty array.");
  for (const entry of s.evidence) record(entry, ["sourceOrigin", "sourceReference", "reuseStatus", "license", "note"]);
  const evidence = parseEvidenceList(s.evidence, "printDetail.source.evidence");
  if (evidence.some(e => e.reuseStatus === "factual-reference-only")) throw new InvalidConfigurationError("Numeric sample data require owned/reusable provenance.");
  const source: PrintDetailSource = {
    captureId: id(s.captureId), representationId: id(s.representationId), contentSha256: s.contentSha256,
    raster: raster(s.raster), stage: choice(s.stage, ["native-retained-linear", "post-resampling-linear", "post-encoding-decoded-linear"]),
    domain: choice(s.domain, ["relative-linear-luminance", "transfer-encoded-luma", "unknown"]),
    registration: choice(s.registration, ["oriented-retained-unwarped", "correction-or-warp-unqualified"]),
    processing: { id: id(processing.id), version: id(processing.version) },
    noiseRealizationId: s.noiseRealizationId === null ? null : id(s.noiseRealizationId), evidence
  };
  const regionRecord = record(r.region, ["id", "rect", "role", "subjectDistanceM", "focusDistanceM"]);
  const rr = record(regionRecord.rect, ["x", "y", "width", "height"]);
  const rect = { x: integer(rr.x, true), y: integer(rr.y, true), width: integer(rr.width), height: integer(rr.height) };
  requirePositiveInteger("region.width", rect.width); requirePositiveInteger("region.height", rect.height);
  // Subtraction avoids overflowing a safe-integer edge sum.
  if (rect.x > source.raster.pixelWidth - rect.width || rect.y > source.raster.pixelHeight - rect.height) throw new InvalidConfigurationError("Print region must fit the represented raster.");
  const sampleCount = rect.width * rect.height;
  if (!Number.isSafeInteger(sampleCount) || sampleCount > MAX_PRINT_DETAIL_REGION_SAMPLES || !Array.isArray(r.samples) || r.samples.length !== sampleCount) throw new InvalidConfigurationError("Print detail requires a bounded exact row-major ROI array.");
  const samples = Array.from({ length: sampleCount }, (_, i) => {
    if (!Object.hasOwn(r.samples as object, i)) throw new InvalidConfigurationError("Sparse Print detail sample arrays are unsupported.");
    return finite((r.samples as unknown[])[i]);
  });
  const region: PrintDetailRegion = { id: id(regionRecord.id), rect, role: choice(regionRecord.role, ["selected-subject", "field-diagnostic", "intentional-defocus"]), subjectDistanceM: nullableDistance(regionRecord.subjectDistanceM), focusDistanceM: nullableDistance(regionRecord.focusDistanceM) };
  const t = record(r.target, ["id", "version", "kind", "cyclesAcrossRegion", "referenceModulation"]);
  const cycles = record(t.cyclesAcrossRegion, ["x", "y"]);
  const referenceModulation = positive(t.referenceModulation);
  if (referenceModulation > 1) throw new InvalidConfigurationError("Reference modulation must be at most one.");
  const target: PrintSinusoidalTarget = { id: id(t.id), version: id(t.version), kind: choice(t.kind, ["coherent-sinusoid"]), cyclesAcrossRegion: { x: integer(cycles.x), y: integer(cycles.y) }, referenceModulation };
  return { assessmentId: id(r.assessmentId), print: parsePrintPlanInput(r.print), source, region, target, samples };
}

/** Compensated sum of normalized bounded values; no image transformation is applied. */
class Sum {
  value = 0;
  correction = 0;
  add(value: number): void { const adjusted = value - this.correction; const next = this.value + adjusted; this.correction = (next - this.value) - adjusted; this.value = next; }
}
function phase(x: number, y: number, width: number, height: number, kx: number, ky: number): number {
  return 2 * Math.PI * ((kx * x / width + ky * y / height) % 1);
}
function finiteValues(...values: number[]): boolean { return values.every(v => Number.isFinite(v)); }

/** Calculate one coherent regional fundamental and its print reference scale.
 * Acquisition remains unknown; no MTF, noise, compression or perceptual pass is produced.
 */
export function calculatePrintRegionDetail(value: PrintRegionDetailInput): CalculationResult<PrintRegionDetailAssessment> {
  const input = parsePrintRegionDetailInput(value), print = calculatePrintPlan(input.print).value;
  const result: PrintRegionDetailAssessment = {
    assessmentId: input.assessmentId, engineApiVersion: ENGINE_API_VERSION, modelVersion: PRINT_REGION_DETAIL_MODEL_VERSION,
    input, print, status: "blocked", blockers: [], measurement: null, projection: null, assessedRasterMatchesRecommendation: false,
    sourceArtifactVerification: "caller-declared-unverified",
    assurance: composeScientificAssurance({ components: [{ componentId: "region-acquisition", role: "source-target-stage-registration", required: true,
      sourceIdentity: { kind: "result", id: input.source.representationId, version: input.source.processing.version },
      basisKind: "evidence-backed-fact", scientificStatus: "unknown", evidenceRequirement: "required", evidence: input.source.evidence,
      uncertainty: { kind: "unknown", limitation: "Acquisition, decoding, target truth and physical applicability are not independently verified by this diagnostic." },
      limitations: ["Evidence and SHA-256 are declarations; analytic conformance is not renderer qualification."] }] }),
    unassessed: ["captured-system-mtf", "optical-motion-attribution", "noise", "aliasing", "halos", "compression", "color", "perceived-quality", "printer-substrate"], overallPrintVerdict: "not-offered"
  };
  const finish = (): CalculationResult<PrintRegionDetailAssessment> => freezeOwnedData(calculatedResult(result, "regional-coherent-print-detail", PRINT_REGION_DETAIL_MODEL_VERSION, ["Known coherent grating, scalar linear luminance and explicit unwarped region registration are caller declarations.", "Fourier modulation is a directional regional diagnostic, not an overall quality or visibility score.", "Angular period is at the normal image-center reference, not a field-dependent retinal metric."]));
  const unsupported = (reason: string): CalculationResult<PrintRegionDetailAssessment> => { result.status = "unsupported"; result.blockers.push(reason); return finish(); };
  if (input.print.source.kind === "unavailable") { result.blockers.push("missing-authoritative-native-geometry"); return finish(); }
  if (print.status === "unsupported") return unsupported("print-geometry-unsupported");
  if (print.status === "crop-confirmation-required") { result.blockers.push("print-crop-confirmation-required"); return finish(); }
  if (input.source.captureId !== input.print.source.captureId) { result.blockers.push("capture-identity-mismatch"); return finish(); }
  if (input.source.domain !== "relative-linear-luminance") return unsupported("linear-luminance-domain-required");
  if (input.source.registration !== "oriented-retained-unwarped") return unsupported("correction-warp-registration-unqualified");
  const geometry = resolveCaptureGeometry(input.print.source.geometry).value;
  const native = { pixelWidth: geometry.output.cropRect.width, pixelHeight: geometry.output.cropRect.height }, actual = input.source.raster;
  if (input.source.stage === "native-retained-linear" && (actual.pixelWidth !== native.pixelWidth || actual.pixelHeight !== native.pixelHeight)) { result.blockers.push("native-representation-raster-mismatch"); return finish(); }
  if (actual.pixelWidth > native.pixelWidth || actual.pixelHeight > native.pixelHeight) { result.blockers.push("represented-native-upscale-unsupported"); return finish(); }
  if (BigInt(actual.pixelWidth) * BigInt(native.pixelHeight) !== BigInt(actual.pixelHeight) * BigInt(native.pixelWidth)) { result.blockers.push("represented-retained-aspect-mismatch"); return finish(); }
  const { width, height } = input.region.rect, { x: kx, y: ky } = input.target.cyclesAcrossRegion;
  if ((kx === 0 && ky === 0) || Math.abs(kx) >= width / 2 || Math.abs(ky) >= height / 2) return unsupported("dc-nyquist-or-aliased-frequency-unsupported");
  let scale = 0; for (const v of input.samples) scale = Math.max(scale, Math.abs(v));
  if (scale === 0) return unsupported("nonpositive-region-mean");
  if (input.samples.some(v => v !== 0 && v / scale === 0)) return unsupported("measurement-dynamic-range-unsupported");
  const dc = new Sum(), cosine = new Sum(), sine = new Sum(), count = input.samples.length;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const v = input.samples[y * width + x]! / scale, angle = phase(x, y, width, height, kx, ky);
    dc.add(v); cosine.add(v * Math.cos(angle)); sine.add(v * Math.sin(angle));
  }
  const mean = dc.value / count;
  if (mean <= 0) return unsupported("nonpositive-region-mean");
  const a = 2 * cosine.value / count, b = 2 * sine.value / count, amplitude = Math.hypot(a, b);
  let residualNorm = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const angle = phase(x, y, width, height, kx, ky);
    const r = input.samples[y * width + x]! / scale - mean - a * Math.cos(angle) - b * Math.sin(angle);
    residualNorm = Math.hypot(residualNorm, r);
  }
  const measurement = { meanRelativeLuminance: scale * mean, fundamentalAmplitudeRelativeLuminance: scale * amplitude,
    fundamentalModulation: amplitude / mean, declaredGratingTransfer: amplitude / mean / input.target.referenceModulation,
    unexplainedResidualRmsRelativeToMean: residualNorm / Math.sqrt(count) / mean };
  if (!finiteValues(...Object.values(measurement)) || measurement.meanRelativeLuminance <= 0 || (amplitude > 0 && measurement.fundamentalAmplitudeRelativeLuminance === 0)) return unsupported("measurement-numeric-range-unsupported");
  const image = print.printedImageMm!, distance = print.viewingDistanceMm!;
  const fx = kx / (width / actual.pixelWidth * image.width), fy = ky / (height / actual.pixelHeight * image.height);
  const frequency = Math.hypot(fx, fy), period = 1 / frequency;
  const angularPeriod = 2 * Math.atan((period / distance) / 2) * 180 / Math.PI;
  if (!finiteValues(fx, fy, period, angularPeriod) || period <= 0 || angularPeriod <= 0) return unsupported("projection-numeric-range-unsupported");
  const rect = input.region.rect;
  const fieldPointMm = mapOrientedPhysicalUvToImagePlanePoint({ uv: { u: (rect.x + width / 2) / actual.pixelWidth, v: (rect.y + height / 2) / actual.pixelHeight }, orientation: input.print.source.geometry.orientation, orientedPhysicalBoundsFromOpticalAxisMm: geometry.output.physicalBoundsFromOpticalAxisMm });
  result.measurement = measurement;
  result.projection = { fieldPointMm, frequencyCyclesPerMm: { x: fx === 0 ? 0 : fx, y: fy === 0 ? 0 : fy }, physicalPeriodMm: period, angularPeriodAtImageCenterDegrees: angularPeriod };
  result.assessedRasterMatchesRecommendation = print.recommended !== null && actual.pixelWidth === print.recommended.raster.pixelWidth && actual.pixelHeight === print.recommended.raster.pixelHeight;
  result.status = "diagnostic-only"; return finish();
}
