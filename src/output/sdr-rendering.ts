// SPDX-License-Identifier: Apache-2.0

import { requireAllowlistedRecord, requirePublicOpaqueId } from "../core/record-validation.js";
import { calculatedResult, type CalculationResult } from "../core/calculation-result.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";
import { InvalidScientificResultError } from "../core/validation.js";

export const SDR_RENDERING_SCHEMA_VERSION = "0.1.0" as const;
/** First-party rendering choices, independent of physical exposure and display calibration. */
export interface SdrRenderingProfile {
  schemaVersion: typeof SDR_RENDERING_SCHEMA_VERSION;
  profileId: string;
  profileVersion: string;
  renderingExposureEv: number;
  toneCurve: "identity" | "positive-reinhard-per-channel";
  gamutHandling: "clip-components" | "reject-out-of-range";
  outputDynamicRange: "sdr";
  transferFunction: "srgb";
  bitDepth: 8 | 16;
  rounding: "nearest-ties-up";
  dither: "none";
}
/** Only an explicitly color-transformed, co-sited linear-sRGB/D65 raster is accepted. */
export interface SdrRenderingInput {
  sourceImageStateId: string;
  inputImageState: "color-transformed-linear-rgb";
  inputColorSpace: "linear-srgb-d65";
  whiteBalanceHandling: "already-applied-upstream" | "not-required";
  pixelWidth: number;
  pixelHeight: number;
  referenceWhiteValue: number;
  /** Relative linear RGB, row-major tightly interleaved red/green/blue. */
  samples: readonly number[];
  profile: SdrRenderingProfile;
}
function object(v: unknown, keys: readonly string[]): Record<string, unknown> {
  return requireAllowlistedRecord(v, keys, "Invalid SDR fields.");
}
function publicId(v: unknown): string {
  return requirePublicOpaqueId(v, "Invalid public SDR identity.");
}
/** Validates every explicit rendering/encoding policy; unknown HDR/display modes fail. */
export function parseSdrRenderingProfile(value: unknown): SdrRenderingProfile {
  const r = object(value, ["schemaVersion", "profileId", "profileVersion", "renderingExposureEv", "toneCurve", "gamutHandling",
    "outputDynamicRange", "transferFunction", "bitDepth", "rounding", "dither"]);
  if (r.schemaVersion !== SDR_RENDERING_SCHEMA_VERSION || typeof r.renderingExposureEv !== "number" ||
      !Number.isFinite(r.renderingExposureEv) || Math.abs(r.renderingExposureEv) > 32 ||
      (r.toneCurve !== "identity" && r.toneCurve !== "positive-reinhard-per-channel") ||
      (r.gamutHandling !== "clip-components" && r.gamutHandling !== "reject-out-of-range") ||
      r.outputDynamicRange !== "sdr" || r.transferFunction !== "srgb" || (r.bitDepth !== 8 && r.bitDepth !== 16) ||
      r.rounding !== "nearest-ties-up" || r.dither !== "none") throw new InvalidConfigurationError("Unsupported SDR rendering profile.");
  return { schemaVersion: SDR_RENDERING_SCHEMA_VERSION, profileId: publicId(r.profileId), profileVersion: publicId(r.profileVersion),
    renderingExposureEv: Object.is(r.renderingExposureEv, -0) ? 0 : r.renderingExposureEv, toneCurve: r.toneCurve,
    gamutHandling: r.gamutHandling, outputDynamicRange: r.outputDynamicRange, transferFunction: r.transferFunction,
    bitDepth: r.bitDepth, rounding: r.rounding, dither: r.dither };
}
/** Validates declared image state and a bounded finite inline raster; never resolves WB/color. */
export function parseSdrRenderingInput(value: unknown): SdrRenderingInput {
  const r = object(value, ["sourceImageStateId", "inputImageState", "inputColorSpace", "whiteBalanceHandling",
    "pixelWidth", "pixelHeight", "referenceWhiteValue", "samples", "profile"]);
  const samples = r.samples;
  if (r.inputImageState !== "color-transformed-linear-rgb" || r.inputColorSpace !== "linear-srgb-d65" ||
      (r.whiteBalanceHandling !== "already-applied-upstream" && r.whiteBalanceHandling !== "not-required") ||
      typeof r.pixelWidth !== "number" || !Number.isSafeInteger(r.pixelWidth) || r.pixelWidth <= 0 ||
      typeof r.pixelHeight !== "number" || !Number.isSafeInteger(r.pixelHeight) || r.pixelHeight <= 0 ||
      typeof r.referenceWhiteValue !== "number" || !Number.isFinite(r.referenceWhiteValue) || r.referenceWhiteValue <= 0 ||
      !Array.isArray(samples) || samples.length !== r.pixelWidth*r.pixelHeight*3 || samples.length > 262144 ||
      Array.from({ length: samples.length }, (_, i) => i in samples).includes(false) ||
      samples.some((v) => typeof v !== "number" || !Number.isFinite(v))) throw new InvalidConfigurationError("Unsupported SDR input domain/raster.");
  return { sourceImageStateId: publicId(r.sourceImageStateId), inputImageState: r.inputImageState, inputColorSpace: r.inputColorSpace,
    whiteBalanceHandling: r.whiteBalanceHandling, pixelWidth: r.pixelWidth, pixelHeight: r.pixelHeight,
    referenceWhiteValue: r.referenceWhiteValue, samples: samples.map((v: number) => Object.is(v, -0) ? 0 : v),
    profile: parseSdrRenderingProfile(r.profile) };
}
export interface SdrRenderingResult {
  schemaVersion: typeof SDR_RENDERING_SCHEMA_VERSION;
  sourceImageStateId: string;
  profile: SdrRenderingProfile;
  pixelWidth: number;
  pixelHeight: number;
  channelOrder: readonly ["red", "green", "blue"];
  whiteBalanceHandling: SdrRenderingInput["whiteBalanceHandling"];
  /** Relative normalized linear samples after exposure/tone, before gamut handling. */
  toneMappedLinearSamples: readonly number[];
  outputLinearSamples: readonly number[];
  outputEncodedSamples: readonly number[];
  integerSamples: readonly number[];
  outputEncoding: {
    imageState: "output-referred-sdr";
    colorSpace: "srgb";
    primariesXy: { red: readonly [number, number]; green: readonly [number, number]; blue: readonly [number, number] };
    whitePointXy: readonly [number, number];
    referenceWhiteLuminanceCdM2: 80;
    codeMinimum: 0;
    codeMaximum: number;
  };
  diagnostics: {
    renderingNegativeSampleCount: number;
    renderingAboveReferenceSampleCount: number;
    toneChangedSampleCount: number;
    gamutClippedLowSampleCount: number;
    gamutClippedHighSampleCount: number;
    /** Upstream full-well/ADC/RAW saturation is unavailable, never inferred from output. */
    captureSaturation: "not-consumed";
  };
  /** Platform color management follows this encoded output; no actual display is assessed. */
  displayAdaptation: { kind: "external-platform"; applied: false; displayCapabilities: "unknown" };
}
/**
 * Standalone SDR rendering: rendering exposure → tone → gamut → sRGB transfer → quantization.
 * No physical capture, metering, WB/color/correction integration or display adaptation runs.
 */
export function calculateSdrRendering(input: SdrRenderingInput): CalculationResult<SdrRenderingResult> {
  const value = parseSdrRenderingInput(input), p = value.profile;
  const scale = 2**p.renderingExposureEv/value.referenceWhiteValue;
  if (!Number.isFinite(scale) || scale <= 0) throw new InvalidScientificResultError("Rendering scale is non-finite/unrepresentable.");
  let negative = 0, above = 0, changed = 0, low = 0, high = 0;
  const tone = value.samples.map((sample) => {
    const exposed = sample*scale;
    if (!Number.isFinite(exposed)) throw new InvalidScientificResultError("Rendering exposure produced a non-finite sample.");
    if (exposed < 0) negative++;
    if (exposed > 1) above++;
    const mapped = p.toneCurve === "positive-reinhard-per-channel" && exposed > 0 ? exposed/(1+exposed) : exposed;
    if (mapped !== exposed) changed++;
    return Object.is(mapped, -0) ? 0 : mapped;
  });
  const linear = tone.map((sample) => {
    if (sample < 0 || sample > 1) {
      if (p.gamutHandling === "reject-out-of-range") throw new InvalidConfigurationError("Tone output exceeds the declared SDR gamut range.");
      if (sample < 0) { low++; return 0; }
      high++; return 1;
    }
    return sample;
  });
  const encoded = linear.map((sample) => sample === 1 ? 1 : sample <= .0031308 ? sample*12.92 : 1.055*sample**(1/2.4)-.055);
  const maximum = 2**p.bitDepth-1;
  const codes = encoded.map((sample) => Math.floor(sample*maximum+.5));
  return calculatedResult({ schemaVersion: SDR_RENDERING_SCHEMA_VERSION, sourceImageStateId: value.sourceImageStateId,
    profile: p, pixelWidth: value.pixelWidth, pixelHeight: value.pixelHeight, channelOrder: ["red", "green", "blue"],
    whiteBalanceHandling: value.whiteBalanceHandling, toneMappedLinearSamples: tone, outputLinearSamples: linear,
    outputEncodedSamples: encoded, integerSamples: codes,
    outputEncoding: { imageState: "output-referred-sdr", colorSpace: "srgb", primariesXy: { red: [.64, .33], green: [.30, .60], blue: [.15, .06] },
      whitePointXy: [.3127, .3290], referenceWhiteLuminanceCdM2: 80, codeMinimum: 0, codeMaximum: maximum },
    diagnostics: { renderingNegativeSampleCount: negative, renderingAboveReferenceSampleCount: above,
      toneChangedSampleCount: changed, gamutClippedLowSampleCount: low, gamutClippedHighSampleCount: high, captureSaturation: "not-consumed" },
    displayAdaptation: { kind: "external-platform", applied: false, displayCapabilities: "unknown" } },
  "generic-sdr-rendering-reference", SDR_RENDERING_SCHEMA_VERSION,
  ["Deterministic first-party rendering choice, not a calibrated camera look or scene-light model",
    "Per-channel positive Reinhard can change chromaticity; component clipping is not perceptual gamut mapping",
    "Input WB/color completion is a producer declaration; capture/correction adapter and production activation remain pending",
    "sRGB reference encoding assumptions do not establish actual display luminance, saturation or viewing conditions"]);
}
