// SPDX-License-Identifier: Apache-2.0

import { requireAllowlistedRecord, requirePublicOpaqueId } from "../core/record-validation.js";
import { stringifyCanonicalJson } from "../core/canonical-json.js";
import { freezeOwnedData } from "../core/owned-data.js";
import { calculatedResult, type CalculationResult, type ProvenanceKind } from "../core/calculation-result.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";
import { ENGINE_API_VERSION } from "../core/version.js";
import { parseResolvedWhiteBalanceState, type ResolvedWhiteBalanceState, type WhiteBalanceChannelGains } from "../color/white-balance.js";
import { calculateEquivalentFocalLength35Mm } from "../camera/equivalent-focal-length.js";
import { parseFocusPlane, type FocusPlane } from "../optics/focus-state.js";
import { resolveCaptureGeometry, type ResolveCaptureGeometryInput, type ResolvedCaptureGeometry } from "../output/capture-geometry.js";

export const SIMULATED_CAPTURE_SCHEMA_VERSION = "0.2.0" as const;
/** Distinct linear domains, not one interchangeable 'linear' flag. */
export type CaptureLinearImageState = "scene-referred-xyz" | "virtual-sensor-channels" | "color-transformed-linear-rgb";
export interface CapturePublicProfileReference { id: string; version: string }
/** Normalized tristimulus white; Y=1. This is not a spectrum or Kelvin value. */
export interface CaptureWhiteXyz { x: number; y: 1; z: number }
/** A resolved #108 choice, sanitized for public metadata. No estimator is rerun. */
export interface CaptureWhiteBalanceIntent {
  stateId: string;
  source: ResolvedWhiteBalanceState["source"];
  locked: boolean;
  channelGains: WhiteBalanceChannelGains;
  sourceProfile: CapturePublicProfileReference | null;
}
/** External bytes are caller-owned; the engine never reads a path or URL. */
export type CaptureFloatStorage =
  | { kind: "inline-float64"; samples: readonly number[] }
  | { kind: "external-float32" | "external-float64"; byteOrder: "little-endian"; artifactId: string; sha256: string; sampleCount: number };
/** Linear float plane; all channels are co-sited and interleaved in row-major order. */
export interface CaptureLinearPlane {
  id: string;
  imageStateId: string;
  imageState: CaptureLinearImageState;
  rasterBinding: "oriented-active-capture" | "output";
  pixelWidth: number;
  pixelHeight: number;
  channelIds: readonly string[];
  colorProfile: CapturePublicProfileReference | null;
  /** Defined for colorimetric/RGB encodings; null for unresolved sensor channels. */
  encodingReferenceWhiteXyz: CaptureWhiteXyz | null;
  /** Value normalization, independent of capture saturation or eventual integer white. */
  referenceWhiteValue: number;
  whiteBalanceApplication: "intent-only" | "applied-rgb-gains" | "applied-chromatic-adaptation" | "not-applicable";
  captureSaturation:
    | { kind: "not-modeled" }
    | { kind: "declared-virtual-white"; whiteLevel: number; upstreamClippedSampleCount: number };
  appliedTransforms: readonly { profile: CapturePublicProfileReference; kind: "linear-color" | "chromatic-adaptation" | "digital-lens-correction" }[];
  storage: CaptureFloatStorage;
}
/** Format-neutral input from an upstream master/capture provider, not a preview image. */
export interface SimulatedCaptureInput {
  captureId: string;
  sceneStateId: string;
  /** Seconds on the declared scene clock, not an embedded wall-clock timestamp. */
  sceneTimeSeconds: number;
  geometry: ResolveCaptureGeometryInput;
  exposure: { focalLengthMm: number; aperture: number; shutterSeconds: number; iso: number };
  focus: FocusPlane;
  noise: { seedUint32: number; realizationId: string; model: CapturePublicProfileReference };
  source: {
    kind: "scene-linear-master" | "sensor-derived-linear" | "color-transformed-linear-master";
    artifactId: string;
    sha256: string;
    dynamicRangeHistory: "unknown" | "no-loss-declared" | "upstream-clipped";
  };
  whiteBalanceIntent: CaptureWhiteBalanceIntent | null;
  /** Adopted/WB white is a camera choice, not automatically the encoding white. */
  adoptedWhiteXyz: CaptureWhiteXyz | null;
  models: readonly { profile: CapturePublicProfileReference; scientificStatus: ProvenanceKind; publicEvidenceIds: readonly string[] }[];
  planes: readonly CaptureLinearPlane[];
}
/** Immutable committed value. Geometry/focal equivalence are derived, never caller overrides. */
export interface SimulatedCapture extends SimulatedCaptureInput {
  schemaVersion: typeof SIMULATED_CAPTURE_SCHEMA_VERSION;
  engineApiVersion: string;
  resolvedGeometry: ResolvedCaptureGeometry;
  equivalentFocalLength35Mm: number;
}

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  return requireAllowlistedRecord(value, keys, "Invalid or non-allowlisted capture metadata.");
}
function enumValue<T extends string>(value: unknown, values: readonly T[]): T {
  if (!values.includes(value as T)) throw new InvalidConfigurationError("Unknown capture state.");
  return value as T;
}
function number(value: unknown, positive = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || (positive && value <= 0)) throw new InvalidConfigurationError("Capture number must be finite with valid sign.");
  return Object.is(value, -0) ? 0 : value;
}
function integer(value: unknown, minimum = 1): number {
  const n = number(value);
  if (!Number.isSafeInteger(n) || n < minimum) throw new InvalidConfigurationError("Invalid capture integer.");
  return n;
}
function array(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum ||
      Array.from({ length: value.length }, (_, i) => i in value).includes(false)) throw new InvalidConfigurationError("Expected a bounded dense capture array.");
  return value;
}
function id(value: unknown): string {
  return requirePublicOpaqueId(value, "Expected a public opaque ID, not a path or URL.");
}
function digest(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new InvalidConfigurationError("Expected a lowercase SHA-256 digest.");
  return value;
}
function profile(value: unknown): CapturePublicProfileReference {
  const r = object(value, ["id", "version"]); return { id: id(r.id), version: id(r.version) };
}
function white(value: unknown): CaptureWhiteXyz | null {
  if (value === null) return null;
  const r = object(value, ["x", "y", "z"]);
  if (r.y !== 1) throw new InvalidConfigurationError("White XYZ requires Y=1.");
  return { x: number(r.x, true), y: 1, z: number(r.z, true) };
}
function wb(value: unknown): CaptureWhiteBalanceIntent | null {
  if (value === null) return null;
  const r = object(value, ["stateId", "source", "locked", "channelGains", "sourceProfile"]);
  const g = object(r.channelGains, ["red", "green", "blue"]);
  if (typeof r.locked !== "boolean") throw new InvalidConfigurationError("WB lock must be boolean.");
  return { stateId: id(r.stateId), source: enumValue(r.source, ["preset", "manual-gains", "custom-measurement", "auto-white-balance"]),
    locked: r.locked, channelGains: { red: number(g.red, true), green: number(g.green, true), blue: number(g.blue, true) },
    sourceProfile: r.sourceProfile === null ? null : profile(r.sourceProfile) };
}
/** Converts validated shooting WB into a public metadata allowlist, discarding private extras. */
export function createCaptureWhiteBalanceIntent(input: { state: ResolvedWhiteBalanceState }): CaptureWhiteBalanceIntent {
  const state = parseResolvedWhiteBalanceState(input.state);
  return wb({ stateId: state.stateId, source: state.source, locked: state.locked, channelGains: state.channelGains,
    sourceProfile: state.sourceProfile ? { id: state.sourceProfile.profileId, version: state.sourceProfile.profileVersion } : null })!;
}
function geometry(value: unknown): ResolveCaptureGeometryInput {
  const r = object(value, ["imagingArea", "nativeRaster", "orientation", "activeCaptureRect", "outputCropRect", "outputRaster"]);
  const area = object(r.imagingArea, ["widthMm", "heightMm"]), native = object(r.nativeRaster, ["pixelWidth", "pixelHeight"]);
  const rect = (value: unknown): { x: number; y: number; width: number; height: number } => {
    const p = object(value, ["x", "y", "width", "height"]);
    return { x: integer(p.x, 0), y: integer(p.y, 0), width: integer(p.width), height: integer(p.height) };
  };
  const output = r.outputRaster === undefined ? undefined : object(r.outputRaster, ["pixelWidth", "pixelHeight"]);
  return { imagingArea: { widthMm: number(area.widthMm, true), heightMm: number(area.heightMm, true) },
    nativeRaster: { pixelWidth: integer(native.pixelWidth), pixelHeight: integer(native.pixelHeight) },
    orientation: enumValue(r.orientation, ["landscape", "portrait-clockwise", "landscape-inverted", "portrait-counter-clockwise"]),
    ...(r.activeCaptureRect === undefined ? {} : { activeCaptureRect: rect(r.activeCaptureRect) }),
    ...(r.outputCropRect === undefined ? {} : { outputCropRect: rect(r.outputCropRect) }),
    ...(output === undefined ? {} : { outputRaster: { pixelWidth: integer(output.pixelWidth), pixelHeight: integer(output.pixelHeight) } }) };
}
function plane(value: unknown, resolved: ResolvedCaptureGeometry, intent: CaptureWhiteBalanceIntent | null): CaptureLinearPlane {
  const r = object(value, ["id", "imageStateId", "imageState", "rasterBinding", "pixelWidth", "pixelHeight", "channelIds", "colorProfile",
    "encodingReferenceWhiteXyz", "referenceWhiteValue", "whiteBalanceApplication", "captureSaturation", "appliedTransforms", "storage"]);
  const state = enumValue(r.imageState, ["scene-referred-xyz", "virtual-sensor-channels", "color-transformed-linear-rgb"]);
  const binding = enumValue(r.rasterBinding, ["oriented-active-capture", "output"]);
  const dimensions = binding === "output" ? resolved.output.raster : resolved.orientedCapture.raster;
  const width = integer(r.pixelWidth), height = integer(r.pixelHeight), channels = array(r.channelIds, 32).map(id);
  const count = width*height*channels.length;
  if (width !== dimensions.pixelWidth || height !== dimensions.pixelHeight || !channels.length ||
      new Set(channels).size !== channels.length || !Number.isSafeInteger(count)) throw new InvalidConfigurationError("Plane raster/channel identity mismatch.");
  const requiredChannels = state === "scene-referred-xyz" ? ["X", "Y", "Z"] : state === "color-transformed-linear-rgb" ? ["red", "green", "blue"] : null;
  if (requiredChannels && JSON.stringify(channels) !== JSON.stringify(requiredChannels)) throw new InvalidConfigurationError("Channels do not match image state.");
  const colorProfile = r.colorProfile === null ? null : profile(r.colorProfile), referenceWhite = white(r.encodingReferenceWhiteXyz);
  if (state === "virtual-sensor-channels" ? referenceWhite !== null || colorProfile === null : referenceWhite === null || colorProfile === null) {
    throw new InvalidConfigurationError("Color metadata does not match image state.");
  }
  if (state === "scene-referred-xyz" && (colorProfile!.id !== "cie-1931-2-degree-xyz" || colorProfile!.version !== "1.0.0")) {
    throw new InvalidConfigurationError("XYZ planes require the explicit CIE 1931 2-degree identity.");
  }
  const application = enumValue(r.whiteBalanceApplication, ["intent-only", "applied-rgb-gains", "applied-chromatic-adaptation", "not-applicable"]);
  if (((application === "intent-only" || application === "applied-rgb-gains") && intent === null) ||
      (application === "applied-rgb-gains" && JSON.stringify(channels) !== JSON.stringify(["red", "green", "blue"]))) {
    throw new InvalidConfigurationError("WB application must refer to a resolved compatible RGB intent.");
  }
  const s = object(r.storage, ["kind", "samples", "artifactId", "sha256", "sampleCount", "byteOrder"]);
  const kind = enumValue(s.kind, ["inline-float64", "external-float32", "external-float64"]);
  let storage: CaptureFloatStorage;
  if (kind === "inline-float64") {
    if (s.artifactId !== undefined || s.sha256 !== undefined || s.sampleCount !== undefined || s.byteOrder !== undefined) throw new InvalidConfigurationError("Inline plane cannot contain external storage fields.");
    const samples = array(s.samples, 1_000_000).map((v) => number(v));
    if (samples.length !== count) throw new InvalidConfigurationError("Plane sample count mismatch.");
    storage = { kind, samples };
  } else {
    if (s.samples !== undefined || integer(s.sampleCount) !== count) throw new InvalidConfigurationError("External plane sample count/fields mismatch.");
    storage = { kind, byteOrder: enumValue(s.byteOrder, ["little-endian"]), artifactId: id(s.artifactId), sha256: digest(s.sha256), sampleCount: count };
  }
  const saturation = object(r.captureSaturation, ["kind", "whiteLevel", "upstreamClippedSampleCount"]);
  const saturationKind = enumValue(saturation.kind, ["not-modeled", "declared-virtual-white"]);
  let captureSaturation: CaptureLinearPlane["captureSaturation"];
  if (saturationKind === "not-modeled") {
    if (saturation.whiteLevel !== undefined || saturation.upstreamClippedSampleCount !== undefined) throw new InvalidConfigurationError("Unmodeled saturation cannot assert a white level.");
    captureSaturation = { kind: saturationKind };
  } else {
    const clipped = integer(saturation.upstreamClippedSampleCount, 0);
    if (clipped > count) throw new InvalidConfigurationError("Invalid clipped sample count.");
    captureSaturation = { kind: saturationKind, whiteLevel: number(saturation.whiteLevel, true), upstreamClippedSampleCount: clipped };
  }
  const transforms = array(r.appliedTransforms, 64).map((value): CaptureLinearPlane["appliedTransforms"][number] => {
    const t = object(value, ["profile", "kind"]);
    return { profile: profile(t.profile), kind: enumValue(t.kind, ["linear-color", "chromatic-adaptation", "digital-lens-correction"]) };
  });
  if (state === "color-transformed-linear-rgb" && !transforms.some((t) => t.kind === "linear-color")) throw new InvalidConfigurationError("Transformed RGB requires explicit color-transform history.");
  if (application === "applied-chromatic-adaptation" && (state !== "color-transformed-linear-rgb" ||
      !transforms.some((t) => t.kind === "chromatic-adaptation"))) throw new InvalidConfigurationError("Applied adaptation requires transformed RGB and adaptation history.");
  return { id: id(r.id), imageStateId: id(r.imageStateId), imageState: state, rasterBinding: binding, pixelWidth: width, pixelHeight: height,
    channelIds: channels, colorProfile, encodingReferenceWhiteXyz: referenceWhite, referenceWhiteValue: number(r.referenceWhiteValue, true),
    whiteBalanceApplication: application, captureSaturation, appliedTransforms: transforms, storage };
}
function normalize(value: unknown, apiVersion: string): SimulatedCapture {
  const r = object(value, ["captureId", "sceneStateId", "sceneTimeSeconds", "geometry", "exposure", "focus", "noise", "source",
    "whiteBalanceIntent", "adoptedWhiteXyz", "models", "planes"]);
  const g = geometry(r.geometry), resolved = resolveCaptureGeometry(g).value;
  const e = object(r.exposure, ["focalLengthMm", "aperture", "shutterSeconds", "iso"]);
  const exposure = { focalLengthMm: number(e.focalLengthMm, true), aperture: number(e.aperture, true),
    shutterSeconds: number(e.shutterSeconds, true), iso: number(e.iso, true) };
  const f = object(r.focus, ["kind", "distanceM"]), focus = parseFocusPlane(f);
  const noise = object(r.noise, ["seedUint32", "realizationId", "model"]), seed = integer(noise.seedUint32, 0);
  if (seed > 0xffffffff) throw new InvalidConfigurationError("Noise seed must be uint32.");
  const source = object(r.source, ["kind", "artifactId", "sha256", "dynamicRangeHistory"]);
  const time = number(r.sceneTimeSeconds), intent = wb(r.whiteBalanceIntent);
  if (time < 0) throw new InvalidConfigurationError("Scene time must be nonnegative.");
  const models = array(r.models, 128).map((value): SimulatedCapture["models"][number] => {
    const m = object(value, ["profile", "scientificStatus", "publicEvidenceIds"]), evidence = array(m.publicEvidenceIds, 128).map(id);
    if (!evidence.length || new Set(evidence).size !== evidence.length) throw new InvalidConfigurationError("Public evidence IDs must be nonempty/unique.");
    return { profile: profile(m.profile), scientificStatus: enumValue(m.scientificStatus, ["calculated", "calibrated", "estimated", "approximation"]), publicEvidenceIds: evidence };
  });
  const planes = array(r.planes, 32).map((p) => plane(p, resolved, intent));
  const adoptedWhite = white(r.adoptedWhiteXyz);
  if (planes.some((p) => p.whiteBalanceApplication === "applied-chromatic-adaptation") && adoptedWhite === null) {
    throw new InvalidConfigurationError("Applied adaptation requires an adopted white.");
  }
  if (!models.length || !planes.length || new Set(models.map((m) => m.profile.id)).size !== models.length ||
      new Set(planes.map((p) => p.id)).size !== planes.length || new Set(planes.map((p) => p.imageStateId)).size !== planes.length ||
      planes.reduce((n, p) => n+(p.storage.kind === "inline-float64" ? p.storage.samples.length : 0), 0) > 1_000_000) {
    throw new InvalidConfigurationError("Capture needs unique models/planes/states and a bounded inline sample budget.");
  }
  return freezeOwnedData({ schemaVersion: SIMULATED_CAPTURE_SCHEMA_VERSION, engineApiVersion: id(apiVersion),
    captureId: id(r.captureId), sceneStateId: id(r.sceneStateId), sceneTimeSeconds: time, geometry: g, resolvedGeometry: resolved,
    exposure, equivalentFocalLength35Mm: calculateEquivalentFocalLength35Mm({ focalLengthMm: exposure.focalLengthMm, activeImagingArea: resolved.activeCapture.imagingArea }).value.equivalentFocalLength35Mm,
    focus, noise: { seedUint32: seed, realizationId: id(noise.realizationId), model: profile(noise.model) },
    source: { kind: enumValue(source.kind, ["scene-linear-master", "sensor-derived-linear", "color-transformed-linear-master"]),
      artifactId: id(source.artifactId), sha256: digest(source.sha256), dynamicRangeHistory: enumValue(source.dynamicRangeHistory, ["unknown", "no-loss-declared", "upstream-clipped"]) },
    whiteBalanceIntent: intent, adoptedWhiteXyz: adoptedWhite, models, planes });
}
/** Commits a format-neutral float master manifest; no radiance generation, clamp, WB or export encoding. */
export function createSimulatedCapture(input: SimulatedCaptureInput): CalculationResult<SimulatedCapture> {
  return calculatedResult(normalize(input, ENGINE_API_VERSION), "authoritative-linear-capture-container", "0.1.0",
    ["Structural commitment only; upstream scientific statuses remain independent", "Master/source declarations do not prove source fidelity", "No tone mapping, recovered headroom, physical sensor calibration or serializer inferred"]);
}
/** Parses an archived capture, recomputing and checking all derived geometry/focal metadata. */
export function parseSimulatedCapture(value: unknown): SimulatedCapture {
  const r = object(value, ["schemaVersion", "engineApiVersion", "captureId", "sceneStateId", "sceneTimeSeconds", "geometry", "resolvedGeometry",
    "equivalentFocalLength35Mm", "exposure", "focus", "noise", "source", "whiteBalanceIntent", "adoptedWhiteXyz", "models", "planes"]);
  if (r.schemaVersion !== SIMULATED_CAPTURE_SCHEMA_VERSION && r.schemaVersion !== "0.1.0") throw new InvalidConfigurationError("Unsupported capture schema.");
  if (r.schemaVersion === "0.1.0" && Array.isArray(r.planes) && r.planes.some((p: CaptureLinearPlane) => p?.whiteBalanceApplication === "applied-chromatic-adaptation")) {
    throw new InvalidConfigurationError("Legacy capture schema cannot declare the new adaptation state.");
  }
  const { schemaVersion: _schemaVersion, engineApiVersion, resolvedGeometry, equivalentFocalLength35Mm, ...input } = r;
  const result = normalize(input, id(engineApiVersion));
  if (canonical(resolvedGeometry) !== canonical(result.resolvedGeometry) || equivalentFocalLength35Mm !== result.equivalentFocalLength35Mm) {
    throw new InvalidConfigurationError("Archived derived capture metadata is inconsistent.");
  }
  // _schemaVersion is already checked, not copied as an unchecked discriminator.
  void _schemaVersion;
  return result;
}
function canonical(value: unknown): string {
  return stringifyCanonicalJson(value, {
    undefinedObjectProperties: "reject",
    nonFiniteNumberMessage: "Capture number must be finite with valid sign.",
    unsupportedValueMessage: "Derived capture metadata must be finite JSON."
  });
}

/** Canonical allowlisted JSON, including semantic samples/IDs, not private caches or file layout. */
export function serializeSimulatedCapture(input: { capture: SimulatedCapture }): string {
  return JSON.stringify(parseSimulatedCapture(input.capture));
}
/** Requires an exact plane image state; callers may not substitute another kind of 'linear'. */
export function resolveSimulatedCapturePlane(input: {
  capture: SimulatedCapture; planeId: string; requiredImageState: CaptureLinearImageState;
}): CaptureLinearPlane {
  const capture = parseSimulatedCapture(input.capture);
  const state = enumValue(input.requiredImageState, ["scene-referred-xyz", "virtual-sensor-channels", "color-transformed-linear-rgb"]);
  const result = capture.planes.find((p) => p.id === id(input.planeId));
  if (!result || result.imageState !== state) throw new InvalidConfigurationError("Capture plane missing or incompatible image state.");
  return result;
}
