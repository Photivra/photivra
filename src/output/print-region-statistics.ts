// SPDX-License-Identifier: Apache-2.0

/** Bounded linear-region processing differences and repeat-capture statistics.
 * @see docs/PRINT_REGION_STATISTICS.md for the model, protocol and exclusions.
 */
import { calculatedResult, type CalculationResult } from "../core/calculation-result.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";
import { freezeOwnedData } from "../core/owned-data.js";
import { requireAllowlistedRecord, requirePublicOpaqueId } from "../core/record-validation.js";
import { ENGINE_API_VERSION } from "../core/version.js";
import { parsePrintDetailSource, parsePrintDetailRegion, MAX_PRINT_DETAIL_REGION_SAMPLES,
  type PrintDetailSource, type PrintDetailRegion } from "./print-detail.js";
import { resolveCaptureGeometry } from "./capture-geometry.js";
import { calculatePrintPlan, parsePrintPlanInput, type PrintPlan, type PrintPlanInput } from "./print-plan.js";

/** Independent of the root distribution and coherent-detail protocol. */
export const PRINT_REGION_STATISTICS_MODEL_VERSION = "0.1.0" as const;
/** Maximum scalar samples across every frame/reference in one request. */
export const MAX_PRINT_REGION_STATISTICS_SAMPLES = MAX_PRINT_DETAIL_REGION_SAMPLES;

/** Exact, unwarped scalar linear ROI; sample and hash verification remains external. */
export interface PrintRegionRaster {
  print: PrintPlanInput;
  source: PrintDetailSource;
  region: PrintDetailRegion;
  samples: readonly number[];
}

/** Compare identical sample sites through processing, without mixing noise draws.
 * A known range is a declared reference signal range, never a clipping threshold.
 */
export interface PrintRegionDifferenceInput {
  assessmentId: string;
  before: PrintRegionRaster;
  after: PrintRegionRaster;
  purpose: "processing-change" | "decoded-file-change";
  realizationPolicy: "same-noise-realization" | "deterministic-reference";
  referenceRange: { lowerRelativeLuminance: number; upperRelativeLuminance: number } | null;
}

/** Sample statistics at registered sites over independently acquired repeats.
 * Stationarity/independence are declarations; a single frame is never a noise ensemble.
 */
export interface PrintRegionNoiseInput {
  assessmentId: string;
  ensembleId: string;
  stationarySceneId: string;
  repeatPolicy: "independent-stationary-captures";
  frames: readonly PrintRegionRaster[];
}

export interface PrintRegionDifferenceMeasurement {
  meanSignedDifferenceRelativeLuminance: number;
  rmsDifferenceRelativeLuminance: number;
  maximumAbsoluteDifferenceRelativeLuminance: number;
  /** Null unless the caller supplied a reference range; not a halo classifier. */
  rangeExcursions: {
    beforeBelowRangeCount: number;
    beforeAboveRangeCount: number;
    afterBelowRangeCount: number;
    afterAboveRangeCount: number;
    beforeMaximumUndershootRelativeLuminance: number;
    beforeMaximumOvershootRelativeLuminance: number;
    afterMaximumUndershootRelativeLuminance: number;
    afterMaximumOvershootRelativeLuminance: number;
  } | null;
}

export interface PrintRegionNoiseMeasurement {
  frameCount: number;
  siteCount: number;
  meanRelativeLuminance: number;
  /** Mean of per-site sample variances with n-1 denominator, in squared linear units. */
  meanTemporalSampleVarianceRelativeLuminanceSquared: number;
  temporalRmsRelativeLuminance: number;
  /** Separately retained so scene texture/fixed pattern is not relabelled temporal noise. */
  perSiteMeansRelativeLuminance: readonly number[];
  perSiteSampleVariancesRelativeLuminanceSquared: readonly number[];
}

/** Measurements remain diagnostic. No physical-noise calibration or print verdict. */
export interface PrintRegionStatisticsAssessment<TInput, TMeasurement> {
  assessmentId: string;
  engineApiVersion: string;
  modelVersion: typeof PRINT_REGION_STATISTICS_MODEL_VERSION;
  input: TInput;
  status: "diagnostic-only" | "blocked" | "unsupported";
  blockers: string[];
  print: PrintPlan;
  measurement: TMeasurement | null;
  sourceArtifactVerification: "caller-declared-unverified";
  acquisitionQualification: "unassessed";
  uncertainty: "not-quantified";
  overallPrintVerdict: "not-offered";
}

function record(v: unknown, keys: readonly string[]): Record<string, unknown> {
  return requireAllowlistedRecord(v, keys, "Invalid or unknown Print region statistics fields.");
}
function id(v: unknown): string { return requirePublicOpaqueId(v, "Invalid public Print region statistics identity."); }
function finite(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new InvalidConfigurationError("Print region statistics require finite numbers.");
  return v;
}
function choice<T extends string>(v: unknown, options: readonly T[]): T {
  if (typeof v !== "string" || !options.includes(v as T)) throw new InvalidConfigurationError("Unknown Print region statistics enum.");
  return v as T;
}
function parseRaster(v: unknown): PrintRegionRaster {
  const r = record(v, ["print", "source", "region", "samples"]), source = parsePrintDetailSource(r.source);
  const { region, samples } = parsePrintDetailRegion(r.region, source, r.samples);
  return { print: parsePrintPlanInput(r.print), source, region, samples };
}

/** Parse/copy an untrusted paired scalar ROI request. */
export function parsePrintRegionDifferenceInput(v: unknown): PrintRegionDifferenceInput {
  const r = record(v, ["assessmentId", "before", "after", "purpose", "realizationPolicy", "referenceRange"]);
  const before = parseRaster(r.before), after = parseRaster(r.after);
  if (before.samples.length + after.samples.length > MAX_PRINT_REGION_STATISTICS_SAMPLES) throw new InvalidConfigurationError("Print paired ROI sample budget exceeded.");
  let referenceRange: PrintRegionDifferenceInput["referenceRange"] = null;
  if (r.referenceRange !== null) {
    const range = record(r.referenceRange, ["lowerRelativeLuminance", "upperRelativeLuminance"]);
    referenceRange = { lowerRelativeLuminance: finite(range.lowerRelativeLuminance), upperRelativeLuminance: finite(range.upperRelativeLuminance) };
    if (referenceRange.lowerRelativeLuminance >= referenceRange.upperRelativeLuminance) throw new InvalidConfigurationError("Reference range must be strictly increasing.");
  }
  return { assessmentId: id(r.assessmentId), before, after, referenceRange,
    purpose: choice(r.purpose, ["processing-change", "decoded-file-change"]),
    realizationPolicy: choice(r.realizationPolicy, ["same-noise-realization", "deterministic-reference"]) };
}

/** Parse/copy an untrusted repeat-capture ensemble with a total scalar work bound. */
export function parsePrintRegionNoiseInput(v: unknown): PrintRegionNoiseInput {
  const r = record(v, ["assessmentId", "ensembleId", "stationarySceneId", "repeatPolicy", "frames"]);
  if (!Array.isArray(r.frames) || r.frames.length < 2 || r.frames.length > 256) throw new InvalidConfigurationError("Print noise statistics require 2 to 256 repeat frames.");
  const frames: PrintRegionRaster[] = [];
  let count = 0;
  for (let i = 0; i < r.frames.length; i++) {
    if (!Object.hasOwn(r.frames, i)) throw new InvalidConfigurationError("Sparse Print noise ensembles are unsupported.");
    const frame = parseRaster(r.frames[i]);
    count += frame.samples.length;
    if (count > MAX_PRINT_REGION_STATISTICS_SAMPLES) throw new InvalidConfigurationError("Print noise ensemble sample budget exceeded.");
    frames.push(frame);
  }
  return { assessmentId: id(r.assessmentId), ensembleId: id(r.ensembleId), stationarySceneId: id(r.stationarySceneId),
    repeatPolicy: choice(r.repeatPolicy, ["independent-stationary-captures"]), frames };
}

function applicability(frame: PrintRegionRaster): string[] {
  const reasons: string[] = [], p = calculatePrintPlan(frame.print).value;
  if (frame.source.domain !== "relative-linear-luminance") reasons.push("linear-luminance-domain-required");
  if (frame.source.registration !== "oriented-retained-unwarped") reasons.push("correction-warp-registration-unqualified");
  if (frame.print.source.kind !== "native-retained") return [...reasons, "missing-authoritative-native-geometry"];
  if (frame.source.captureId !== frame.print.source.captureId) reasons.push("capture-identity-mismatch");
  if (p.status === "unsupported" || p.status === "crop-confirmation-required") reasons.push("print-geometry-unavailable");
  const geometry = resolveCaptureGeometry(frame.print.source.geometry).value, crop = geometry.output.cropRect, raster = frame.source.raster;
  if (raster.pixelWidth > crop.width || raster.pixelHeight > crop.height) reasons.push("represented-native-upscale-unsupported");
  if (BigInt(raster.pixelWidth) * BigInt(crop.height) !== BigInt(raster.pixelHeight) * BigInt(crop.width)) reasons.push("represented-retained-aspect-mismatch");
  if (frame.source.stage === "native-retained-linear" && (raster.pixelWidth !== crop.width || raster.pixelHeight !== crop.height)) reasons.push("native-representation-raster-mismatch");
  return reasons;
}
// Parsed records have canonical field order; the comparison deliberately retains every
// geometry/region/print condition, while allowing acquisition/processing identities to differ.
function registrationKey(frame: PrintRegionRaster): string {
  return JSON.stringify({ geometry: frame.print.source.kind === "native-retained" ? frame.print.source.geometry : null,
    print: { ...frame.print, source: null }, raster: frame.source.raster, region: frame.region });
}
function base<I, M>(assessmentId: string, input: I, frame: PrintRegionRaster): PrintRegionStatisticsAssessment<I, M> {
  return { assessmentId, engineApiVersion: ENGINE_API_VERSION, modelVersion: PRINT_REGION_STATISTICS_MODEL_VERSION,
    input, status: "blocked", blockers: [], print: calculatePrintPlan(frame.print).value, measurement: null,
    sourceArtifactVerification: "caller-declared-unverified", acquisitionQualification: "unassessed",
    uncertainty: "not-quantified", overallPrintVerdict: "not-offered" };
}
function finish<I, M>(result: PrintRegionStatisticsAssessment<I, M>): CalculationResult<PrintRegionStatisticsAssessment<I, M>> {
  return freezeOwnedData(calculatedResult(result, "regional-linear-print-statistics", PRINT_REGION_STATISTICS_MODEL_VERSION,
    ["Scalar linear samples, exact source identities and registration are caller declarations.",
      "Repeat stationarity/independence and deterministic or shared realization policies need independent acquisition evidence.",
      "No clipping mechanism, artifact visibility, physical sensor noise or overall print pass is inferred."]));
}
class Sum {
  private total = 0;
  private correction = 0;
  add(v: number): void {
    const next = this.total + v;
    this.correction += Math.abs(this.total) >= Math.abs(v) ? (this.total - next) + v : (v - next) + this.total;
    this.total = next;
  }
  get value(): number { return this.total + this.correction; }
}

function finiteMean(values: readonly number[]): number | null {
  let scale = 0, subnormalTerms = false;
  const raw = new Sum(), normalized = new Sum();
  for (const v of values) scale = Math.max(scale, Math.abs(v));
  if (scale === 0) return 0;
  for (const v of values) {
    if (v !== 0 && v / scale === 0) return null;
    const term = v / values.length;
    raw.add(term); normalized.add(v / scale / values.length);
    if (v !== 0 && Math.abs(term) < 2 ** -1022) subnormalTerms = true;
  }
  const mean = subnormalTerms ? normalized.value * scale : raw.value;
  return Number.isFinite(mean) ? mean : null;
}

/** Measure registered processing changes; residual is not automatically compression/noise. */
export function calculatePrintRegionDifference(value: PrintRegionDifferenceInput): CalculationResult<PrintRegionStatisticsAssessment<PrintRegionDifferenceInput, PrintRegionDifferenceMeasurement>> {
  const input = parsePrintRegionDifferenceInput(value), { before, after } = input;
  const result = base<PrintRegionDifferenceInput, PrintRegionDifferenceMeasurement>(input.assessmentId, input, after);
  result.blockers.push(...applicability(before), ...applicability(after));
  if (registrationKey(before) !== registrationKey(after)) result.blockers.push("paired-site-registration-mismatch");
  if (before.source.captureId !== after.source.captureId) result.blockers.push("paired-capture-identity-mismatch");
  if (before.source.representationId === after.source.representationId && (before.source.contentSha256 !== after.source.contentSha256 || before.source.stage !== after.source.stage || JSON.stringify(before.source.processing) !== JSON.stringify(after.source.processing))) result.blockers.push("representation-identity-conflict");
  if (input.realizationPolicy === "same-noise-realization" && (before.source.noiseRealizationId === null || before.source.noiseRealizationId !== after.source.noiseRealizationId)) result.blockers.push("same-noise-realization-required");
  if (input.realizationPolicy === "deterministic-reference" && (before.source.noiseRealizationId !== null || after.source.noiseRealizationId !== null)) result.blockers.push("deterministic-reference-has-noise-realization");
  if (input.purpose === "decoded-file-change" && (before.source.stage !== "post-resampling-linear" || after.source.stage !== "post-encoding-decoded-linear")) result.blockers.push("exact-pre-encode-and-decoded-stages-required");
  if (result.blockers.length) return finish(result);
  let scale = 0;
  for (const samples of [before.samples, after.samples]) for (const v of samples) scale = Math.max(scale, Math.abs(v));
  const sum = new Sum(), rawMeanSum = new Sum(), count = before.samples.length;
  let finiteDifferences = true, subnormalMeanTerms = false;
  let norm = 0, maximum = 0;
  for (let i = 0; i < count; i++) {
    const raw = after.samples[i]! - before.samples[i]!;
    if (Number.isFinite(raw)) {
      rawMeanSum.add(raw / count);
      if (raw !== 0 && Math.abs(raw / count) < 2 ** -1022) subnormalMeanTerms = true;
    } else finiteDifferences = false;
    const d = scale === 0 ? 0 : Number.isFinite(raw) ? raw / scale : after.samples[i]! / scale - before.samples[i]! / scale;
    if (raw !== 0 && d === 0) { result.status = "unsupported"; result.blockers.push("difference-dynamic-range-unsupported"); return finish(result); }
    sum.add(d / count); norm = Math.hypot(norm, d); maximum = Math.max(maximum, Math.abs(d));
  }
  const measurement: PrintRegionDifferenceMeasurement = { meanSignedDifferenceRelativeLuminance: finiteDifferences && !subnormalMeanTerms ? rawMeanSum.value : sum.value * scale,
    rmsDifferenceRelativeLuminance: norm / Math.sqrt(count) * scale, maximumAbsoluteDifferenceRelativeLuminance: maximum * scale, rangeExcursions: null };
  if (input.referenceRange) {
    const { lowerRelativeLuminance: lo, upperRelativeLuminance: hi } = input.referenceRange;
    const excursions = (samples: readonly number[]): { below: number; above: number; under: number; over: number } => {
      let below = 0, above = 0, under = 0, over = 0;
      for (const v of samples) { if (v < lo) { below++; under = Math.max(under, lo - v); } if (v > hi) { above++; over = Math.max(over, v - hi); } }
      return { below, above, under, over };
    };
    const b = excursions(before.samples), a = excursions(after.samples);
    measurement.rangeExcursions = { beforeBelowRangeCount: b.below, beforeAboveRangeCount: b.above, afterBelowRangeCount: a.below, afterAboveRangeCount: a.above,
      beforeMaximumUndershootRelativeLuminance: b.under, beforeMaximumOvershootRelativeLuminance: b.over,
      afterMaximumUndershootRelativeLuminance: a.under, afterMaximumOvershootRelativeLuminance: a.over };
  }
  if (![measurement.meanSignedDifferenceRelativeLuminance, measurement.rmsDifferenceRelativeLuminance, measurement.maximumAbsoluteDifferenceRelativeLuminance,
    ...Object.values(measurement.rangeExcursions ?? {})].every(Number.isFinite) || (norm > 0 && measurement.rmsDifferenceRelativeLuminance === 0)) {
    result.status = "unsupported"; result.blockers.push("difference-numeric-range-unsupported"); return finish(result);
  }
  result.status = "diagnostic-only"; result.measurement = measurement; return finish(result);
}

/** Measure n-1 per-site temporal sample variance, independently of scene spatial texture. */
export function calculatePrintRegionNoise(value: PrintRegionNoiseInput): CalculationResult<PrintRegionStatisticsAssessment<PrintRegionNoiseInput, PrintRegionNoiseMeasurement>> {
  const input = parsePrintRegionNoiseInput(value), first = input.frames[0]!;
  const result = base<PrintRegionNoiseInput, PrintRegionNoiseMeasurement>(input.assessmentId, input, first);
  const captureIds = new Set<string>(), representations = new Set<string>(), realizations = new Set<string>();
  for (const frame of input.frames) {
    result.blockers.push(...applicability(frame));
    if (registrationKey(frame) !== registrationKey(first) || frame.source.stage !== first.source.stage || JSON.stringify(frame.source.processing) !== JSON.stringify(first.source.processing)) result.blockers.push("repeat-acquisition-registration-or-processing-mismatch");
    if (captureIds.has(frame.source.captureId) || representations.has(frame.source.representationId)) result.blockers.push("repeat-acquisition-identity-reused");
    if (frame.source.noiseRealizationId === null || realizations.has(frame.source.noiseRealizationId)) result.blockers.push("distinct-repeat-noise-realizations-required");
    captureIds.add(frame.source.captureId); representations.add(frame.source.representationId);
    if (frame.source.noiseRealizationId !== null) realizations.add(frame.source.noiseRealizationId);
  }
  if (result.blockers.length) return finish(result);
  const frameCount = input.frames.length, siteCount = first.samples.length, means: number[] = [], variances: number[] = [];
  let pooledRms = 0;
  for (let site = 0; site < siteCount; site++) {
    let scale = 0;
    for (const frame of input.frames) scale = Math.max(scale, Math.abs(frame.samples[site]!));
    const meanSum = new Sum(), rawMeanSum = new Sum(), normalizedMeanSum = new Sum(), anchor = first.samples[site]!, offsets: number[] = [];
    let subnormalMeanTerms = false;
    for (const frame of input.frames) {
      const v = frame.samples[site]!;
      rawMeanSum.add(v / frameCount);
      if (v !== 0 && Math.abs(v / frameCount) < 2 ** -1022) subnormalMeanTerms = true;
      if (v !== 0 && v / scale === 0) { result.status = "unsupported"; result.blockers.push("noise-dynamic-range-unsupported"); return finish(result); }
      normalizedMeanSum.add(scale === 0 ? 0 : v / scale / frameCount);
      const raw = v - anchor;
      const offset = scale === 0 ? 0 : Number.isFinite(raw) ? raw / scale : v / scale - anchor / scale;
      if (raw !== 0 && offset === 0) { result.status = "unsupported"; result.blockers.push("noise-dynamic-range-unsupported"); return finish(result); }
      offsets.push(offset); meanSum.add(offset / frameCount);
    }
    // Center in the offset domain: rounding a restored large DC mean must not inflate
    // variance when the mathematical mean lies between adjacent binary64 values.
    const meanOffset = meanSum.value, mean = subnormalMeanTerms ? normalizedMeanSum.value * scale : rawMeanSum.value;
    let norm = 0;
    for (const offset of offsets) norm = Math.hypot(norm, offset - meanOffset);
    const rms = norm / Math.sqrt(frameCount - 1) * scale, variance = rms * rms;
    if (![mean, rms, variance].every(Number.isFinite) || (norm > 0 && (rms === 0 || variance === 0))) { result.status = "unsupported"; result.blockers.push("noise-numeric-range-unsupported"); return finish(result); }
    means.push(mean); variances.push(variance); pooledRms = Math.hypot(pooledRms, rms / Math.sqrt(siteCount));
  }
  const mean = finiteMean(means), variance = finiteMean(variances);
  if (mean === null || variance === null || (pooledRms > 0 && variance === 0)) {
    result.status = "unsupported"; result.blockers.push("noise-numeric-range-unsupported"); return finish(result);
  }
  const measurement: PrintRegionNoiseMeasurement = { frameCount, siteCount, meanRelativeLuminance: mean,
    meanTemporalSampleVarianceRelativeLuminanceSquared: variance, temporalRmsRelativeLuminance: pooledRms,
    perSiteMeansRelativeLuminance: means, perSiteSampleVariancesRelativeLuminanceSquared: variances };
  if (![measurement.meanRelativeLuminance, measurement.meanTemporalSampleVarianceRelativeLuminanceSquared, pooledRms].every(Number.isFinite)) { result.status = "unsupported"; result.blockers.push("noise-numeric-range-unsupported"); return finish(result); }
  result.status = "diagnostic-only"; result.measurement = measurement; return finish(result);
}
