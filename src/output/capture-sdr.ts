// SPDX-License-Identifier: Apache-2.0

/**
 * SDR (standard dynamic range) output from a simulated capture: capture → explicit colour and
 * white balance (WB) → SDR rendering.
 *
 * It does no resampling, lens correction, physical exposure, metering or external I/O, and it
 * does not run the production image-formation plan.
 * @see docs/PROCESSED_OUTPUT.md for equations, coordinate/unit conventions, blockers and support
 * limits.
 */

import { requireAllowlistedRecord } from "../core/record-validation.js";
import { calculatedResult, approximationResult, type CalculationResult } from "../core/calculation-result.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";
import { parseSimulatedCapture, type SimulatedCapture, type CaptureLinearPlane } from "../capture/simulated-capture.js";
import { calculateCaptureColorTransform, parseCaptureColorTransformInput, LINEAR_CAPTURE_RGB_PROFILE,
  resolveCaptureColorModel, type CaptureColorTransformInput, type CaptureColorTransformResult } from "../color/capture-color.js";
import { calculateSdrRendering, parseSdrRenderingProfile, type SdrRenderingProfile, type SdrRenderingResult } from "./sdr-rendering.js";

export const CAPTURE_SDR_SCHEMA_VERSION = "0.1.0" as const;
/** Either select an existing RGB image state or derive one explicitly. White balance is never estimated here. */
export interface CaptureSdrInput {
  capture: SimulatedCapture;
  sourcePlaneId: string;
  color: { kind: "already-transformed" } | {
    kind: "transform";
    outputPlaneId: string;
    outputImageStateId: string;
    whiteBalance: CaptureColorTransformInput["whiteBalance"];
  };
  profile: SdrRenderingProfile;
}
/** Result. The source capture history, the optional colour derivation and the SDR diagnostics are kept separate. */
export interface CaptureSdrResult {
  schemaVersion: typeof CAPTURE_SDR_SCHEMA_VERSION;
  captureId: string;
  sourcePlaneId: string;
  sourceImageStateId: string;
  rasterBinding: CaptureLinearPlane["rasterBinding"];
  sourceCaptureSaturation: CaptureLinearPlane["captureSaturation"];
  sourceDynamicRangeHistory: SimulatedCapture["source"]["dynamicRangeHistory"];
  noiseRealizationId: string;
  whiteBalance: "applied-here" | "already-applied-upstream" | "not-required";
  color: CalculationResult<CaptureColorTransformResult> | null;
  rendering: CalculationResult<SdrRenderingResult>;
}
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  return requireAllowlistedRecord(value, keys, "Invalid capture-SDR fields.");
}
/** Validates untrusted input: the capture and the explicit colour and rendering choices. */
export function parseCaptureSdrInput(value: unknown): CaptureSdrInput {
  const r = object(value, ["capture", "sourcePlaneId", "color", "profile"]);
  const capture = parseSimulatedCapture(r.capture);
  if (typeof r.sourcePlaneId !== "string" || !capture.planes.some((p) => p.id === r.sourcePlaneId)) {
    throw new InvalidConfigurationError("Capture-SDR source plane must exist.");
  }
  const c = object(r.color, ["kind", "outputPlaneId", "outputImageStateId", "whiteBalance"]);
  let color: CaptureSdrInput["color"];
  if (c.kind === "already-transformed" && Object.keys(c).length === 1) color = { kind: c.kind };
  else if (c.kind === "transform") {
    const parsed = parseCaptureColorTransformInput({ capture, sourcePlaneId: r.sourcePlaneId,
      outputPlaneId: c.outputPlaneId, outputImageStateId: c.outputImageStateId, whiteBalance: c.whiteBalance });
    color = { kind: c.kind, outputPlaneId: parsed.outputPlaneId, outputImageStateId: parsed.outputImageStateId,
      whiteBalance: parsed.whiteBalance };
  } else throw new InvalidConfigurationError("Unsupported capture-SDR color choice.");
  return { capture, sourcePlaneId: r.sourcePlaneId, color, profile: parseSdrRenderingProfile(r.profile) };
}
/**
 * Renders a bounded capture to SDR via an explicit colour/WB step.
 *
 * No resampling, lens correction, physical exposure, metering or external I/O
 * happens, and the production image-formation plan is not run.
 */
export function prepareCaptureSdrSource(input: CaptureSdrInput): {
  value: CaptureSdrInput; source: CaptureLinearPlane; plane: CaptureLinearPlane;
  color: CalculationResult<CaptureColorTransformResult> | null; applied: boolean;
} {
  const value = parseCaptureSdrInput(input), source = value.capture.planes.find((p) => p.id === value.sourcePlaneId)!;
  if (source.storage.kind !== "inline-float64" || source.storage.samples.length > 262144 || source.channelIds.length !== 3) {
    throw new InvalidConfigurationError("Capture-SDR requires a bounded inline three-channel plane; no implicit loading or tiling.");
  }
  const color = value.color.kind === "transform" ? calculateCaptureColorTransform({ capture: value.capture,
    sourcePlaneId: value.sourcePlaneId, outputPlaneId: value.color.outputPlaneId,
    outputImageStateId: value.color.outputImageStateId, whiteBalance: value.color.whiteBalance }) : null;
  const plane = color?.value.plane ?? source, white = resolveCaptureColorModel().referenceWhiteXyz;
  if (plane.imageState !== "color-transformed-linear-rgb" || plane.colorProfile?.id !== LINEAR_CAPTURE_RGB_PROFILE.id ||
      plane.colorProfile.version !== LINEAR_CAPTURE_RGB_PROFILE.version || JSON.stringify(plane.channelIds) !== '["red","green","blue"]' ||
      plane.encodingReferenceWhiteXyz?.x !== white.x || plane.encodingReferenceWhiteXyz.y !== white.y ||
      plane.encodingReferenceWhiteXyz.z !== white.z || plane.whiteBalanceApplication === "intent-only" ||
      (plane.whiteBalanceApplication === "not-applicable" && value.capture.whiteBalanceIntent !== null)) {
    throw new InvalidConfigurationError("Capture-SDR requires exact linear-sRGB/D65 and resolved WB; intent is not application.");
  }
  // The derived-colour parser guarantees inline storage, so no external source reaches this point.
  if (plane.storage.kind !== "inline-float64") throw new InvalidConfigurationError("Inline RGB required.");
  const applied = plane.whiteBalanceApplication !== "not-applicable";
  return { value, source, plane, color, applied };
}
/** Renders the validated capture color state without correction or resampling. */
export function calculateCaptureSdr(input: CaptureSdrInput): CalculationResult<CaptureSdrResult> {
  const { value, source, plane, color, applied } = prepareCaptureSdrSource(input);
  if (plane.storage.kind !== "inline-float64") throw new InvalidConfigurationError("Inline RGB required.");
  const rendering = calculateSdrRendering({ sourceImageStateId: plane.imageStateId,
    inputImageState: "color-transformed-linear-rgb", inputColorSpace: "linear-srgb-d65",
    whiteBalanceHandling: applied ? "already-applied-upstream" : "not-required",
    pixelWidth: plane.pixelWidth, pixelHeight: plane.pixelHeight, referenceWhiteValue: plane.referenceWhiteValue,
    samples: plane.storage.samples, profile: value.profile });
  const result: CaptureSdrResult = { schemaVersion: CAPTURE_SDR_SCHEMA_VERSION, captureId: value.capture.captureId,
    sourcePlaneId: source.id, sourceImageStateId: source.imageStateId, rasterBinding: source.rasterBinding,
    sourceCaptureSaturation: source.captureSaturation, sourceDynamicRangeHistory: value.capture.source.dynamicRangeHistory,
    noiseRealizationId: value.capture.noise.realizationId,
    whiteBalance: applied ? color ? "applied-here" : "already-applied-upstream" : "not-required", color, rendering };
  const assumptions = ["Exact declared inline co-sited RGB raster; no crop/resampling or source IO",
    "Color/WB delegates to the authoritative capture color model; no estimator or repeated WB",
    "Capture saturation/history and downstream tone/gamut clipping remain distinct",
    "Standalone adapter only; correction and production-plan integration remain explicit"];
  return value.color.kind === "transform" && value.color.whiteBalance.kind === "adopted-white-xyz-scaling"
    ? approximationResult(result, "capture-sdr-adapter", CAPTURE_SDR_SCHEMA_VERSION, assumptions)
    : calculatedResult(result, "capture-sdr-adapter", CAPTURE_SDR_SCHEMA_VERSION, assumptions);
}
