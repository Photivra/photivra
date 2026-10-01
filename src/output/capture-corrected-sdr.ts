// SPDX-License-Identifier: Apache-2.0

import { approximationResult, type CalculationResult } from "../core/calculation-result.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";
import { calculateFieldOfView } from "../camera/field-of-view.js";
import { parseOpticalProfileState, type OpticalProfileState } from "../optics/profile-contract.js";
import { prepareCaptureSdrSource, parseCaptureSdrInput, type CaptureSdrInput, type CaptureSdrResult } from "./capture-sdr.js";
import { resolveLensCorrectionPlan, calculateLensCorrectedCapture, parseGenericLensCorrectionProfile,
  type GenericLensCorrectionProfile, type ResolvedLensCorrectionPlan } from "./lens-corrections.js";
import { calculateValidSourceCrop, type GeometricRaster, type GeometricResampler } from "./geometric-transforms.js";
import { mapOrientedPhysicalUvToImagePlanePoint, transformNativeRasterPointToOriented,
  type PhysicalBoundsFromOpticalAxisMm, type RasterRect, type CaptureOrientation } from "./capture-geometry.js";
import { calculateSdrRendering } from "./sdr-rendering.js";

export const CAPTURE_CORRECTED_SDR_SCHEMA_VERSION = "0.1.0" as const;
/** Explicit native-optical correction binding. Body/lens/mode identities remain producer declarations. */
export interface CaptureCorrectedSdrInput extends CaptureSdrInput {
  correction: {
    profile: GenericLensCorrectionProfile;
    state: OpticalProfileState;
    /** Native optical +X right/+Y up, RGB basis after the selected color/WB operation. */
    coordinateFrame: "native-optical-linear-srgb-d65";
    selections: Readonly<Record<string, "on" | "off" | "auto">>;
    selectionKind: ResolvedLensCorrectionPlan["selectionKind"];
    /** Seconds from exposure start, not the capture's scene-clock time. */
    frameTimeSeconds: number;
    resampler: GeometricResampler;
    clippingLevel: number;
    invalidSupport: "reject" | "joint-valid-crop";
    outputImageStateId: string;
  };
}
/** Derived output view, never a replacement for the committed capture's physical geometry. */
export interface CaptureCorrectedSdrResult extends Omit<CaptureSdrResult, "schemaVersion"> {
  schemaVersion: typeof CAPTURE_CORRECTED_SDR_SCHEMA_VERSION;
  sceneTimeSeconds: number;
  plan: CalculationResult<ResolvedLensCorrectionPlan>;
  correction: ReturnType<typeof calculateLensCorrectedCapture>;
  projection: ReturnType<typeof calculateFieldOfView>;
  /** Oriented full-output support; child correction plans retain native optical coordinates. */
  validSourceMask: readonly boolean[];
  outputView: { imageStateId: string; rect: RasterRect; pixelWidth: number; pixelHeight: number; samples: readonly number[] };
}
function fields(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some((k) => !allowed.includes(k))) throw new InvalidConfigurationError("Invalid capture correction fields.");
  return value as Record<string, unknown>;
}
/** Strict boundary; execution also checks capture optics, native raster binding and source history. */
export function parseCaptureCorrectedSdrInput(input: unknown): CaptureCorrectedSdrInput {
  const r = fields(input, ["capture", "sourcePlaneId", "color", "profile", "correction"]);
  const base = parseCaptureSdrInput({ capture: r.capture, sourcePlaneId: r.sourcePlaneId, color: r.color, profile: r.profile });
  const c = fields(r.correction, ["profile", "state", "coordinateFrame", "selections", "selectionKind", "frameTimeSeconds",
    "resampler", "clippingLevel", "invalidSupport", "outputImageStateId"]);
  const profile = parseGenericLensCorrectionProfile(c.profile), state = parseOpticalProfileState(c.state);
  const selections = fields(c.selections, profile.components.map((v) => v.id));
  if (Object.values(selections).some((v) => v !== "on" && v !== "off" && v !== "auto") ||
      c.coordinateFrame !== "native-optical-linear-srgb-d65" ||
      (c.selectionKind !== "camera-selectable" && c.selectionKind !== "reference-bypass") ||
      (c.invalidSupport !== "reject" && c.invalidSupport !== "joint-valid-crop") ||
      typeof c.frameTimeSeconds !== "number" || !Number.isFinite(c.frameTimeSeconds) || c.frameTimeSeconds < 0 ||
      typeof c.clippingLevel !== "number" || !Number.isFinite(c.clippingLevel) || c.clippingLevel <= 0 ||
      typeof c.outputImageStateId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(c.outputImageStateId) ||
      base.capture.planes.some((p) => p.imageStateId === c.outputImageStateId) ||
      (base.color.kind === "transform" && base.color.outputImageStateId === c.outputImageStateId)) {
    throw new InvalidConfigurationError("Invalid correction choice, clock, threshold or derived state identity.");
  }
  const s = fields(c.resampler, ["id", "version", "filter", "antialias"]);
  if (typeof s.id !== "string" || !s.id.trim() || typeof s.version !== "string" || !s.version.trim() ||
      (s.filter !== "nearest" && s.filter !== "bilinear") || (s.antialias !== "none" && s.antialias !== "source-prefiltered")) {
    throw new InvalidConfigurationError("Invalid correction resampler.");
  }
  resolveLensCorrectionPlan({ profile, state, selections: selections as CaptureCorrectedSdrInput["correction"]["selections"],
    outputKind: "processed", selectionKind: c.selectionKind });
  return { ...base, correction: { profile, state, coordinateFrame: c.coordinateFrame,
    selections: selections as CaptureCorrectedSdrInput["correction"]["selections"], selectionKind: c.selectionKind,
    frameTimeSeconds: c.frameTimeSeconds, clippingLevel: c.clippingLevel, invalidSupport: c.invalidSupport,
    outputImageStateId: c.outputImageStateId, resampler: { id: s.id, version: s.version, filter: s.filter, antialias: s.antialias } } };
}
function nativeRaster(bounds: PhysicalBoundsFromOpticalAxisMm, width: number, height: number,
  orientation: CaptureOrientation): GeometricRaster {
  const corners = [0, 1].flatMap((u) => [0, 1].map((v) => mapOrientedPhysicalUvToImagePlanePoint({
    uv: { u, v }, orientation, orientedPhysicalBoundsFromOpticalAxisMm: bounds })));
  const x = corners.map((p) => p.x), y = corners.map((p) => p.y);
  const quarter = orientation === "portrait-clockwise" || orientation === "portrait-counter-clockwise";
  const w = quarter ? height : width, h = quarter ? width : height;
  const pitchX = (Math.max(...x)-Math.min(...x))/w, pitchY = (Math.max(...y)-Math.min(...y))/h;
  if (Math.abs(pitchX-pitchY) > 1e-12*Math.max(pitchX, pitchY)) {
    throw new InvalidConfigurationError("Correction executor requires square physical pixel pitch; no implicit stretching.");
  }
  return { width: w, height: h, pitchMm: pitchX,
    centerMm: { x: (Math.min(...x)+Math.max(...x))/2, y: (Math.min(...y)+Math.max(...y))/2 } };
}
/** Exact quarter-turn index permutation through the capture geometry contract, not another resampling pass. */
function orientedIndices(raster: GeometricRaster, orientation: CaptureOrientation, orientedWidth: number): number[] {
  return Array.from({ length: raster.width*raster.height }, (_, i): number => {
    const p = transformNativeRasterPointToOriented({ point: { x: i%raster.width+.5, y: Math.floor(i/raster.width)+.5 },
      nativeRaster: { pixelWidth: raster.width, pixelHeight: raster.height }, orientation });
    return Math.floor(p.y)*orientedWidth+Math.floor(p.x);
  });
}
/** Bounded committed capture → color/WB → native correction → oriented output view → SDR. No physical stage activation. */
export function calculateCaptureCorrectedSdr(input: CaptureCorrectedSdrInput): CalculationResult<CaptureCorrectedSdrResult> {
  const v = parseCaptureCorrectedSdrInput(input), c = v.correction;
  const { value, source, plane, color, applied } = prepareCaptureSdrSource({
    capture: v.capture, sourcePlaneId: v.sourcePlaneId, color: v.color, profile: v.profile });
  if (plane.storage.kind !== "inline-float64" || plane.pixelWidth*plane.pixelHeight > 65536 ||
      plane.appliedTransforms.some((t) => t.kind === "digital-lens-correction")) {
    throw new InvalidConfigurationError("Requires bounded inline RGB without prior digital lens correction; no implicit loading or double correction.");
  }
  const capture = value.capture, g = capture.resolvedGeometry, orientation = g.orientedCapture.orientation;
  const sourceBounds = plane.rasterBinding === "output" ? g.output.physicalBoundsFromOpticalAxisMm : g.orientedCapture.physicalBoundsFromOpticalAxisMm;
  const src = nativeRaster(sourceBounds, plane.pixelWidth, plane.pixelHeight, orientation);
  const dst = nativeRaster(g.output.physicalBoundsFromOpticalAxisMm, g.output.raster.pixelWidth, g.output.raster.pixelHeight, orientation);
  if (c.state.focalLengthMm !== capture.exposure.focalLengthMm || c.state.aperture !== capture.exposure.aperture ||
      capture.focus.kind !== "finite" || c.state.focusDistanceM !== capture.focus.distanceM ||
      c.state.outputWidth !== dst.width || c.state.outputHeight !== dst.height || c.frameTimeSeconds > capture.exposure.shutterSeconds) {
    throw new InvalidConfigurationError("Correction state differs from committed optics/native output raster or local exposure interval.");
  }
  const plan = resolveLensCorrectionPlan({ profile: c.profile, state: c.state, selections: c.selections,
    selectionKind: c.selectionKind, outputKind: "processed" });
  const samples = plane.storage.samples, sourceIndices = orientedIndices(src, orientation, plane.pixelWidth);
  const channels = { red: sourceIndices.map((i) => samples[3*i]!), green: sourceIndices.map((i) => samples[3*i+1]!),
    blue: sourceIndices.map((i) => samples[3*i+2]!) };
  // Existing engine projection owns finite-focus distance; never substitute scene-clock time or focal length.
  const projection = calculateFieldOfView({ focalLengthMm: capture.exposure.focalLengthMm,
    sensorDimensionMm: g.activeCapture.imagingArea.widthMm, focusDistanceM: c.state.focusDistanceM });
  const correction = calculateLensCorrectedCapture({ plan: plan.value, capture: { state: c.state,
    captureId: capture.captureId, noiseRealizationId: capture.noise.realizationId, timeSeconds: c.frameTimeSeconds, raster: src, channels },
    destinationRaster: dst, resampler: c.resampler, clippingLevel: c.clippingLevel,
    physicalProjectionDistanceMm: projection.value.projectionDistanceMm });
  const width = g.output.raster.pixelWidth, height = g.output.raster.pixelHeight;
  const indices = orientedIndices(dst, orientation, width), mask = Array<boolean>(width*height).fill(false);
  const rgb = Array<number | null>(width*height*3).fill(null);
  indices.forEach((index, i) => {
    mask[index] = correction.value.validSourceMask[i]!;
    rgb[3*index] = correction.value.channels.red[i]!;
    rgb[3*index+1] = correction.value.channels.green[i]!;
    rgb[3*index+2] = correction.value.channels.blue[i]!;
  });
  if (c.invalidSupport === "reject" && mask.some((valid) => !valid)) throw new InvalidConfigurationError("Corrected output has unavailable channel support.");
  const rect = c.invalidSupport === "reject" ? { x: 0, y: 0, width, height } : calculateValidSourceCrop(mask, width, height);
  if (rect === null) throw new InvalidConfigurationError("No joint-valid corrected output crop.");
  const outputSamples: number[] = [];
  for (let y = rect.y; y < rect.y+rect.height; y++) for (let x = rect.x; x < rect.x+rect.width; x++) {
    const offset = 3*(y*width+x);
    outputSamples.push(rgb[offset]!, rgb[offset+1]!, rgb[offset+2]!);
  }
  const rendering = calculateSdrRendering({ sourceImageStateId: c.outputImageStateId,
    inputImageState: "color-transformed-linear-rgb", inputColorSpace: "linear-srgb-d65",
    whiteBalanceHandling: applied ? "already-applied-upstream" : "not-required", pixelWidth: rect.width, pixelHeight: rect.height,
    referenceWhiteValue: plane.referenceWhiteValue, samples: outputSamples, profile: value.profile });
  return approximationResult({ schemaVersion: CAPTURE_CORRECTED_SDR_SCHEMA_VERSION, captureId: capture.captureId,
    sourcePlaneId: source.id, sourceImageStateId: source.imageStateId, rasterBinding: source.rasterBinding,
    sourceCaptureSaturation: source.captureSaturation, sourceDynamicRangeHistory: capture.source.dynamicRangeHistory,
    noiseRealizationId: capture.noise.realizationId, sceneTimeSeconds: capture.sceneTimeSeconds,
    whiteBalance: applied ? color ? "applied-here" : "already-applied-upstream" : "not-required",
    color, plan, correction, projection, validSourceMask: mask,
    outputView: { imageStateId: c.outputImageStateId, rect, pixelWidth: rect.width, pixelHeight: rect.height, samples: outputSamples }, rendering },
  "capture-corrected-sdr-adapter", CAPTURE_CORRECTED_SDR_SCHEMA_VERSION, [
    "Generic corrections are explicitly declared for native optical coordinates and the post-color/WB linear-sRGB basis",
    "Body/lens identity, acquisition mode, stabilization and prefilter adequacy remain producer declarations, not verified calibration",
    "Quarter-turn permutations reuse capture geometry; crop never rewrites physical capture or focal equivalence",
    "Gain clipping events, upstream saturation and SDR gamut clipping remain distinct; no covariance/noise regeneration",
    "Bounded reference integration only; no production-plan activation, RAW correction bake, streaming or external IO"]);
}
