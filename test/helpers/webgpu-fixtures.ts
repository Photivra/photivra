// SPDX-License-Identifier: Apache-2.0
/** Fixed-seed corpora shared by the image-kernel unit tests and the real-GPU conformance suite. */
import { calculateNativeRawPlan, createSimulatedCapture, LINEAR_CAPTURE_RGB_PROFILE, resolveCaptureColorModel, type CaptureOrientation,
  type ExportSensorColorProfile, type IrradianceConvolutionInput, type NativeCaptureSdrInput, type NativeRawDevelopmentInput, type NativeRawOutput,
  type SdrRenderingProfile } from "../../src/index.js";
import { decodeSrgbComponent } from "../../src/color/srgb-transfer.js";
import { loadLinearCaptureInput } from "./linear-capture-fixture.js";
import { nativeRawFixture } from "./native-raw-fixture.js";
import { loadPhotographicExportInput } from "./photographic-export-fixture.js";

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sdrProfile(bitDepth: 8 | 16, toneCurve: "identity" | "positive-reinhard-per-channel",
  gamutHandling: SdrRenderingProfile["gamutHandling"], renderingExposureEv: number): SdrRenderingProfile {
  return { schemaVersion: "0.1.0", profileId: "webgpu", profileVersion: "1", renderingExposureEv, toneCurve, gamutHandling,
    outputDynamicRange: "sdr", transferFunction: "srgb", bitDepth, rounding: "nearest-ties-up", dither: "none" };
}

export function sdrInput(width: number, height: number, precision: 32 | 64, referenceWhiteValue: number, profile: SdrRenderingProfile): NativeCaptureSdrInput {
  const raw = loadLinearCaptureInput();
  raw.geometry = { imagingArea: { widthMm: 36, heightMm: 24 }, nativeRaster: { pixelWidth: width, pixelHeight: height }, orientation: "landscape" };
  raw.planes = [{ ...raw.planes[0]!, pixelWidth: width, pixelHeight: height, rasterBinding: "oriented-active-capture", referenceWhiteValue,
    imageState: "color-transformed-linear-rgb", channelIds: ["red", "green", "blue"], colorProfile: LINEAR_CAPTURE_RGB_PROFILE,
    encodingReferenceWhiteXyz: resolveCaptureColorModel().referenceWhiteXyz, appliedTransforms: [{ kind: "linear-color", profile: LINEAR_CAPTURE_RGB_PROFILE }],
    storage: { kind: precision === 32 ? "external-float32" : "external-float64", artifactId: "rgb-master", sha256: "b".repeat(64),
      sampleCount: width * height * 3, byteOrder: "little-endian" } }];
  return { capture: createSimulatedCapture(raw).value, sourcePlaneId: "source", outputImageStateId: "sdr-state",
    maximumOutputBytes: width * height * 3 * profile.bitDepth / 8, profile };
}

/**
 * Linear raster whose exposed values hit code centres, near-ties, transfer breakpoints, ±0, both clip
 * directions and uniform values. Reject-mode rasters are kept in range.
 */
export function sdrCorpus(width: number, height: number, precision: 32 | 64, profile: SdrRenderingProfile, referenceWhiteValue: number,
  seed: number): Float32Array | Float64Array {
  const next = mulberry32(seed), maximum = 2 ** profile.bitDepth - 1, scale = 2 ** profile.renderingExposureEv / referenceWhiteValue;
  const packed = precision === 32 ? new Float32Array(width * height * 3) : new Float64Array(width * height * 3);
  for (let i = 0; i < packed.length; i++) {
    const k = Math.floor(next() * (maximum + 1)), kind = Math.floor(next() * 10);
    let linear: number;
    switch (kind) {
      case 0: linear = decodeSrgbComponent(k / maximum); break;
      case 1: linear = decodeSrgbComponent(Math.min(1, (k + .5) / maximum)); break;
      case 2: linear = [0, -0, .0031308, .0031308 + 2 ** -60, .04045 / 12.92, 1, 1 - 2 ** -52, 1 + 2 ** -52][k % 8]!; break;
      case 3: linear = next() * 4 - 1; break;
      default: linear = next();
    }
    packed[i] = linear / scale;
    if (profile.gamutHandling === "reject-out-of-range" &&
        (!(packed[i]! * scale >= 0) || (profile.toneCurve === "identity" && packed[i]! * scale > 1))) packed[i] = 0;
  }
  return packed;
}

/**
 * Linear RGB pixels for the luminance tone curves: colours whose luminance spans eight decades
 * (1e-6 to 100 after exposure), greys, exact zeros and both clip directions. With `mixed`, a third of
 * the pixels also have negative components, some with luminance cancelling to near zero.
 */
export function luminanceCorpus(width: number, height: number, precision: 32 | 64, scale: number, seed: number, mixed: boolean): Float32Array | Float64Array {
  const next = mulberry32(seed), packed = precision === 32 ? new Float32Array(width * height * 3) : new Float64Array(width * height * 3);
  for (let p = 0; p < width * height; p++) {
    const level = 10 ** (8 * next() - 6), kind = Math.floor(next() * 8);
    let rgb: number[];
    if (kind === 0) rgb = [0, 0, 0];
    else if (kind === 1) rgb = [level, level, level];
    else if (mixed && kind >= 5) {
      const a = level * (0.2 + next()), b = level * (0.2 + next());
      rgb = kind === 7 ? [a, -a * 0.2126 / 0.7152 * (1 + 1e-9 * next()), 0] : [a, -b * 0.3, b];
    } else rgb = [level * next(), level * next(), level * next()];
    for (let c = 0; c < 3; c++) packed[p * 3 + c] = rgb[c]! / scale;
  }
  return packed;
}

/** Owned test camera whose D65 neutral is [0.45, 1, 0.65] (not white-normalized), so WB gains and clipping are active. */
export function nonSrgbColorProfile(): ExportSensorColorProfile {
  const base = loadPhotographicExportInput().colorProfile, cw = [.45, 1, .65];
  return { ...base, profileId: "owned-non-normalized-test",
    normalizedCameraChannelsToXyz: resolveCaptureColorModel().cameraRgbToXyz.map(r => r.map((v, i) => v / cw[i]!)) };
}

export interface SyntheticRaw { width: number; height: number; orientation: CaptureOrientation; seed: number; gains?: [number, number, number] }
/** Synthetic packed RAW (random codes, black levels, flags and per-phase white levels) on the fixture's Bayer plan. */
export function syntheticRawDevelopment(o: SyntheticRaw, rendering: SdrRenderingProfile, colorProfile: ExportSensorColorProfile,
  highlightMode: "clip" | "reconstruct"): NativeRawDevelopmentInput {
  const f = nativeRawFixture(o.width, o.height), policy = loadPhotographicExportInput(), random = mulberry32(o.seed), portrait = o.orientation.startsWith("portrait");
  f.input.exposure.geometry = { ...f.input.exposure.geometry, orientation: o.orientation,
    outputRaster: portrait ? { pixelWidth: o.height, pixelHeight: o.width } : { pixelWidth: o.width, pixelHeight: o.height } };
  if (o.gains) f.input.exposure.whiteBalanceIntent = { stateId: "wb", source: "manual-gains", locked: true,
    channelGains: { red: o.gains[0], green: o.gains[1], blue: o.gains[2] }, sourceProfile: null };
  const plan = calculateNativeRawPlan(f.input), n = plan.pixelCount, white = Uint16Array.from({ length: 4 }, () => 600 + Math.floor(random() * 424));
  const raw: NativeRawOutput = { plan, codes: new Uint16Array(n), blackLevels: new Uint16Array(n), digitalSaturationCodes: new Uint16Array(n).fill(1023),
    saturationFlags: new Uint8Array(n), effectiveSaturationCodes: white };
  for (let i = 0; i < n; i++) {
    raw.blackLevels[i] = 60 + Math.floor(random() * 8); raw.codes[i] = Math.floor(random() * 1024);
    raw.saturationFlags[i] = random() < .05 ? 1 + Math.floor(random() * 7) : 0;
  }
  return { raw, phaseProfiles: policy.reconstruction.phaseProfiles, colorProfile, whiteBalance: o.gains ? "apply-resolved-sensor-gains" : "not-required",
    rendering, highlightMode, maximumRetainedPayloadBytes: n * 16 };
}

export function copyRawDevelopmentInput(v: NativeRawDevelopmentInput): NativeRawDevelopmentInput {
  const raw = v.raw;
  return { ...structuredClone({ ...v, raw: undefined }), raw: { plan: raw.plan, codes: raw.codes.slice(), blackLevels: raw.blackLevels.slice(),
    digitalSaturationCodes: raw.digitalSaturationCodes.slice(), saturationFlags: raw.saturationFlags.slice(),
    effectiveSaturationCodes: raw.effectiveSaturationCodes.slice() } } as NativeRawDevelopmentInput;
}

/**
 * Irradiance grid spanning nine decades (with exact zeros) and per-patch normalized, field-varying,
 * anisotropic Gaussian kernels scaled by a transmission in [0.7, 1].
 */
export function convolutionCorpus(width: number, height: number, radius: number, patchWidth: number, patchHeight: number,
  seed: number, precision: 32 | 64 = 64): IrradianceConvolutionInput {
  const next = mulberry32(seed), samples = precision === 32 ? new Float32Array(width * height) : new Float64Array(width * height);
  for (let i = 0; i < samples.length; i++) samples[i] = next() < .05 ? 0 : 10 ** (next() * 9 - 6);
  const cols = Math.ceil(width / patchWidth), rows = Math.ceil(height / patchHeight), size = 2 * radius + 1, taps = size * size;
  const kernels = new Float64Array(cols * rows * taps);
  for (let p = 0; p < cols * rows; p++) {
    const sx = .3 + next() * Math.max(.3, radius / 2), sy = .3 + next() * Math.max(.3, radius / 2), transmission = .7 + .3 * next();
    let sum = 0;
    for (let v = -radius; v <= radius; v++) for (let u = -radius; u <= radius; u++) {
      const w = Math.exp(-.5 * ((u / sx) ** 2 + (v / sy) ** 2));
      kernels[p * taps + (v + radius) * size + u + radius] = w; sum += w;
    }
    for (let t = 0; t < taps; t++) kernels[p * taps + t] = kernels[p * taps + t]! / sum * transmission;
  }
  return { schemaVersion: "0.1.0", width, height, samples, kernelRadius: radius, patchWidth, patchHeight, kernels, boundary: "zero-outside-grid" };
}
