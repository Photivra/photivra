// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  CHART_RADIANCE_BATCH_LIMITS, FULL_RESOLUTION_CEILING_PIXELS, FULL_RESOLUTION_DEFAULT_PIXELS, InvalidConfigurationError, IRRADIANCE_CONVOLUTION_LIMITS,
  NATIVE_CAPTURE_SDR_LIMITS, NATIVE_RAW_LIMITS, PACKED_SENSOR_RAW_LIMITS, PNG_ENCODER_LIMITS, PRINT_JPEG_LIMITS, TEMPORAL_EXPOSURE_SUM_LIMITS,
  calculateChartRadianceBatch, calculateIrradianceConvolution, calculateIrradianceConvolutionPlan, calculateNativeCaptureSdrPlan, calculateNativeRawPlan,
  calculatePackedSensorRawPlan, calculateTemporalExposureSumPlan, createNativeEnvironmentRawTask, createSimulatedCapture, parsePrintJpegInput,
  resolveCaptureColorModel, serializePngImage, simulateCapture, LINEAR_CAPTURE_RGB_PROFILE,
  type NativeCaptureSdrInput, type NativeEnvironmentRawInput, type PrintJpegInput
} from "../src/index.js";
import { nativeRawMaximumProviderEvaluations } from "../src/capture/native-raw.js";
import { resolveRaisedLimit, scaleBudgetCeiling } from "../src/core/pixel-limits.js";
import { loadLinearCaptureInput } from "./helpers/linear-capture-fixture.js";
import { nativeRawFixture } from "./helpers/native-raw-fixture.js";
import { sensorStageInput } from "./helpers/sensor-stage-fixtures.js";
import { scaledTimeout } from "./helpers/test-timeout.js";

const CEILING = FULL_RESOLUTION_CEILING_PIXELS;
/** 100 MP sensor rasters from the owner's goal, and one native raster just above the 24 MP default. */
const TARGETS = [[12_252, 8_168], [11_552, 8_664]] as const;
const ABOVE_DEFAULT = [6_000, 4_001] as const;
const EVIDENCE = [{ sourceOrigin: "photivra", sourceReference: "test:full-resolution-limits", reuseStatus: "photivra-owned" }] as const;
const INVALID = [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, CEILING + 1, "1000", null, 2 ** 53] as const;

describe("opt-in full-resolution pixel limits", () => {
  it("keeps every default and exposes one 2^27 ceiling", () => {
    expect(CEILING).toBe(2 ** 27);
    expect(CEILING).toBe(NATIVE_RAW_LIMITS.maximumDimension * 8_192);
    expect(FULL_RESOLUTION_DEFAULT_PIXELS).toBe(24_000_000);
    for (const limits of [NATIVE_RAW_LIMITS, NATIVE_CAPTURE_SDR_LIMITS, IRRADIANCE_CONVOLUTION_LIMITS, TEMPORAL_EXPOSURE_SUM_LIMITS, PRINT_JPEG_LIMITS]) {
      expect(limits.maximumPixels).toBe(24_000_000);
      expect(limits.ceilingPixels).toBe(CEILING);
    }
    expect([PACKED_SENSOR_RAW_LIMITS.maximumRegionSites, PACKED_SENSOR_RAW_LIMITS.ceilingRegionSites]).toEqual([24_000_000, CEILING]);
    expect([CHART_RADIANCE_BATCH_LIMITS.maximumQueries, CHART_RADIANCE_BATCH_LIMITS.ceilingQueries]).toEqual([24_000_000, CEILING]);
    expect([PNG_ENCODER_LIMITS.maximumPixels, PNG_ENCODER_LIMITS.ceilingPixels]).toEqual([100_000_000, CEILING]);
    // Both 100 MP targets fit with their one-site demosaic margin and stay within the per-side limit.
    for (const [w, h] of TARGETS) {
      expect((w + 2) * (h + 2)).toBeLessThan(CEILING);
      expect(Math.max(w, h) + 2).toBeLessThanOrEqual(NATIVE_RAW_LIMITS.maximumDimension);
      expect((w + 2) * (h + 2)).toBeGreaterThan(PNG_ENCODER_LIMITS.maximumPixels);
    }
  });

  it("validates a raised limit strictly", () => {
    expect(resolveRaisedLimit(undefined, 24_000_000, CEILING, "bad")).toBe(24_000_000);
    expect(resolveRaisedLimit(1, 24_000_000, CEILING, "bad")).toBe(1);
    expect(resolveRaisedLimit(CEILING, 24_000_000, CEILING, "bad")).toBe(CEILING);
    for (const value of INVALID) expect(() => resolveRaisedLimit(value, 24_000_000, CEILING, "bad")).toThrow(InvalidConfigurationError);
  });

  it("scales budget ceilings exactly in proportion and never below their default", () => {
    expect(scaleBudgetCeiling(2_000_000_000, 24_000_000)).toBe(2_000_000_000);
    expect(scaleBudgetCeiling(2_000_000_000, 1)).toBe(2_000_000_000);
    expect(scaleBudgetCeiling(2_000_000_000, 48_000_000)).toBe(4_000_000_000);
    expect(scaleBudgetCeiling(2_000_000_000, CEILING)).toBe(11_184_810_666);
    expect(scaleBudgetCeiling(256_000_000, CEILING)).toBe(1_431_655_765);
  });
});

describe("native RAW", () => {
  for (const [w, h] of TARGETS) {
    it(`admits a ${w} x ${h} sensor only when the caller raises maximumPixels`, () => {
      const { input } = nativeRawFixture(w + 2, h + 2);
      input.maximumOutputBytes = (w + 2) * (h + 2) * 7;
      expect(() => calculateNativeRawPlan(input)).toThrow("Native RAW raster exceeds output admission budget.");
      const plan = calculateNativeRawPlan({ ...input, maximumPixels: CEILING });
      expect(plan.pixelCount).toBe((w + 2) * (h + 2));
      expect(plan.maximumPixels).toBe(CEILING);
      expect(nativeRawMaximumProviderEvaluations(plan)).toBe(11_184_810_666);
      // The byte budget still applies.
      expect(() => calculateNativeRawPlan({ ...input, maximumPixels: CEILING, maximumOutputBytes: plan.outputBytes - 1 })).toThrow(InvalidConfigurationError);
    });
  }

  it("keeps the default plan shape and rejects invalid limits", () => {
    const { input } = nativeRawFixture(4, 4), plan = calculateNativeRawPlan(input);
    expect(Object.hasOwn(plan, "maximumPixels")).toBe(false);
    expect(nativeRawMaximumProviderEvaluations(plan)).toBe(2_000_000_000);
    expect(() => calculateNativeRawPlan({ ...input, maximumPixels: 15 })).toThrow("Native RAW raster exceeds output admission budget.");
    expect(calculateNativeRawPlan({ ...input, maximumPixels: 16 }).maximumPixels).toBe(16);
    for (const value of INVALID) {
      expect(() => calculateNativeRawPlan({ ...input, maximumPixels: value as number })).toThrow("Native RAW maximumPixels must be an integer from 1 to 134217728.");
    }
    // The per-side limit is unchanged.
    const wide = nativeRawFixture(16_385, 2).input;
    expect(() => calculateNativeRawPlan({ ...wide, maximumPixels: CEILING })).toThrow(InvalidConfigurationError);
  });

  it("raises the native environment query budget ceiling with the pixel limit", () => {
    const { input } = nativeRawFixture(2, 2);
    const unused = (): never => { throw new Error("not called"); };
    const provider = { readTile: unused, evaluateRadiance: unused, yieldControl: async (): Promise<void> => {} };
    const environment = (raw: typeof input, maximumProviderEvaluations: number): NativeEnvironmentRawInput => ({ raw: { ...raw, exposure: { ...raw.exposure, sceneTimeSeconds: 0 },
      exposureWindow: { shutterMechanism: "electronic", nominalExposureDurationSeconds: { value: raw.exposure.exposure.shutterSeconds, unit: "s", evidence: EVIDENCE },
        opening: { kind: "simultaneous" }, closing: { kind: "simultaneous" } } },
    sceneBinding: { sceneStateId: raw.exposure.sceneStateId, providerSceneId: "scene", evidence: EVIDENCE }, maximumProviderEvaluations } as unknown as NativeEnvironmentRawInput);
    const budget = "Native environment requires opening-reference scene binding, an explicit shutter event and bounded full-event query budget.";
    expect(() => createNativeEnvironmentRawTask(environment(input, 2_000_000_000), provider)).not.toThrow();
    expect(() => createNativeEnvironmentRawTask(environment(input, 2_000_000_001), provider)).toThrow(budget);
    const raised = { ...input, maximumPixels: 48_000_000 };
    expect(() => createNativeEnvironmentRawTask(environment(raised, 4_000_000_000), provider)).not.toThrow();
    expect(() => createNativeEnvironmentRawTask(environment(raised, 4_000_000_001), provider)).toThrow(budget);
  });
});

describe("native capture SDR", () => {
  function sdrInput(width: number, height: number): NativeCaptureSdrInput {
    const raw = loadLinearCaptureInput();
    raw.geometry = { imagingArea: { widthMm: 36, heightMm: 24 }, nativeRaster: { pixelWidth: width, pixelHeight: height }, orientation: "landscape" };
    raw.planes = [{ ...raw.planes[0]!, pixelWidth: width, pixelHeight: height, rasterBinding: "oriented-active-capture", imageState: "color-transformed-linear-rgb",
      channelIds: ["red", "green", "blue"], colorProfile: LINEAR_CAPTURE_RGB_PROFILE, encodingReferenceWhiteXyz: resolveCaptureColorModel().referenceWhiteXyz,
      appliedTransforms: [{ kind: "linear-color", profile: LINEAR_CAPTURE_RGB_PROFILE }],
      storage: { kind: "external-float32", artifactId: "rgb-master", sha256: "b".repeat(64), sampleCount: width * height * 3, byteOrder: "little-endian" } }];
    return { capture: createSimulatedCapture(raw).value, sourcePlaneId: "source", outputImageStateId: "sdr-state", maximumOutputBytes: width * height * 6,
      profile: { schemaVersion: "0.1.0", profileId: "neutral", profileVersion: "1", renderingExposureEv: 0, toneCurve: "identity", gamutHandling: "clip-components",
        outputDynamicRange: "sdr", transferFunction: "srgb", bitDepth: 8, rounding: "nearest-ties-up", dither: "none" } };
  }
  it("plans 100 MP rasters only with a raised limit, without allocating", () => {
    const rejected = "Native SDR raster/output exceeds declared admission limits.";
    expect(() => calculateNativeCaptureSdrPlan(sdrInput(...ABOVE_DEFAULT))).toThrow(rejected);
    for (const [w, h] of TARGETS) {
      const input = sdrInput(w, h);
      expect(() => calculateNativeCaptureSdrPlan(input)).toThrow(rejected);
      expect(calculateNativeCaptureSdrPlan({ ...input, maximumPixels: CEILING }).outputBytes).toBe(w * h * 3);
      expect(() => calculateNativeCaptureSdrPlan({ ...input, maximumPixels: CEILING, maximumOutputBytes: w * h * 3 - 1 })).toThrow(rejected);
    }
    for (const value of INVALID) {
      expect(() => calculateNativeCaptureSdrPlan({ ...sdrInput(2, 1), maximumPixels: value as number })).toThrow("Native SDR maximumPixels must be an integer from 1 to 134217728.");
    }
  });
});

describe("grid kernels, packed sensor RAW and chart radiance", () => {
  const tiny = new Float32Array(1);
  it("irradiance convolution and temporal sum admit large grids only with a raised limit", () => {
    const [w, h] = ABOVE_DEFAULT;
    const convolution = { schemaVersion: "0.1.0" as const, width: w, height: h, samples: tiny, kernelRadius: 0, patchWidth: w, patchHeight: h,
      kernels: new Float64Array([1]), boundary: "zero-outside-grid" as const };
    expect(() => calculateIrradianceConvolutionPlan(convolution)).toThrow("Irradiance convolution grid exceeds the pixel limit.");
    // Past the pixel limit, the next check is the array size: nothing large was allocated.
    expect(() => calculateIrradianceConvolutionPlan({ ...convolution, maximumPixels: CEILING })).toThrow("Irradiance convolution arrays do not match the declared geometry.");
    const temporal = { schemaVersion: "0.1.0" as const, width: w, height: h, samples: tiny, displacements: new Float64Array(2), rowWeights: new Float64Array(h),
      boundary: "zero-outside-grid" as const };
    expect(() => calculateTemporalExposureSumPlan(temporal)).toThrow("Temporal exposure sum grid exceeds the pixel limit.");
    expect(() => calculateTemporalExposureSumPlan({ ...temporal, maximumPixels: CEILING })).toThrow("Temporal exposure sum arrays do not match the declared geometry.");
    for (const value of INVALID) {
      expect(() => calculateIrradianceConvolutionPlan({ ...convolution, maximumPixels: value as number })).toThrow("Irradiance convolution maximumPixels must be an integer from 1 to 134217728.");
      expect(() => calculateTemporalExposureSumPlan({ ...temporal, maximumPixels: value as number })).toThrow("Temporal exposure sum maximumPixels must be an integer from 1 to 134217728.");
    }
  });

  it("packed sensor RAW admits large regions only with a raised limit", () => {
    const base = sensorStageInput({ width: 1, height: 1, photo: () => 10 });
    const [w, h] = ABOVE_DEFAULT, large = { ...base, nativeWidth: w, nativeHeight: h, region: { x: 0, y: 0, width: w, height: h } };
    expect(() => calculatePackedSensorRawPlan(large)).toThrow("Packed sensor RAW region exceeds the site limit.");
    expect(() => calculatePackedSensorRawPlan({ ...large, maximumRegionSites: CEILING })).toThrow("Packed sensor RAW electron arrays must match the region size.");
    expect(calculatePackedSensorRawPlan({ ...base, maximumRegionSites: 1 }).region).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    for (const value of INVALID) {
      expect(() => calculatePackedSensorRawPlan({ ...base, maximumRegionSites: value as number })).toThrow("Packed sensor RAW maximumRegionSites must be an integer from 1 to 134217728.");
    }
  });

  it("chart radiance batch applies a caller limit and returns the same values", () => {
    const input = { schemaVersion: "0.1.0" as const, scene: { preset: "slanted-edge" as const }, illuminant: "cie-a" as const, illuminanceLux: 1000, aspect: 1,
      points: new Float64Array([-0.5, 0.2, 0.5, -0.2, 0, 0]), wavelengthsNanometers: [550], wavelengthIndices: new Uint8Array(3) };
    expect(() => calculateChartRadianceBatch({ ...input, maximumQueries: 2 })).toThrow("points must be an interleaved Float32Array or Float64Array of (u, v) pairs.");
    expect(Array.from(calculateChartRadianceBatch({ ...input, maximumQueries: CEILING }).values)).toEqual(Array.from(calculateChartRadianceBatch(input).values));
    for (const value of INVALID) {
      expect(() => calculateChartRadianceBatch({ ...input, maximumQueries: value as number })).toThrow("Chart radiance batch maximumQueries must be an integer from 1 to 134217728.");
    }
  });

  it("convolves a real grid above the 24 MP default when the limit is raised", { timeout: scaledTimeout(60_000) }, () => {
    // The cheapest stage: an identity kernel over 24 010 000 sites (96 MB in, 192 MB out). Larger real runs are in the quick-start table.
    const w = 4_900, h = 4_900, samples = new Float32Array(w * h);
    for (let i = 0; i < samples.length; i++) samples[i] = (i % 1_009) / 8;
    const input = { schemaVersion: "0.1.0" as const, width: w, height: h, samples, kernelRadius: 0, patchWidth: w, patchHeight: h,
      kernels: new Float64Array([1]), boundary: "zero-outside-grid" as const };
    expect(w * h).toBeGreaterThan(IRRADIANCE_CONVOLUTION_LIMITS.maximumPixels);
    expect(() => calculateIrradianceConvolutionPlan(input)).toThrow("Irradiance convolution grid exceeds the pixel limit.");
    const result = calculateIrradianceConvolution({ ...input, maximumPixels: w * h });
    expect(result.values.length).toBe(w * h);
    expect(result.values[0]).toBe(0);
    expect(result.values[w * h - 1]).toBe(samples[w * h - 1]);
    expect(result.values[12_345_678]).toBe(samples[12_345_678]);
  });
});

describe("PNG and print JPEG", () => {
  it("PNG admits a 100.07 MP image only with a raised limit, before allocating", () => {
    const [w, h] = TARGETS[0];
    const input = { width: w, height: h, bitDepth: 8 as const, samples: new Uint8Array(3), colourEncoding: { kind: "srgb" as const, renderingIntent: "perceptual" as const } };
    expect(() => serializePngImage(input)).toThrow("PNG encoder: dimensions are out of range.");
    expect(() => serializePngImage({ ...input, maximumPixels: CEILING })).toThrow("PNG encoder: samples must hold width x height RGB triples.");
    const small = { ...input, width: 2, height: 2, samples: new Uint8Array(12).fill(7) };
    expect(serializePngImage({ ...small, maximumPixels: CEILING })).toEqual(serializePngImage(small));
    expect(() => serializePngImage({ ...small, maximumPixels: 3 })).toThrow("PNG encoder: dimensions are out of range.");
    for (const value of INVALID) {
      expect(() => serializePngImage({ ...small, maximumPixels: value as number })).toThrow("PNG encoder: maximumPixels must be an integer from 1 to 134217728.");
    }
  });

  it("print JPEG admits 100 MP sources and a proportional byte budget only with a raised limit", () => {
    const [w, h] = TARGETS[1];
    const input: PrintJpegInput = { source: { captureId: "c", imageStateId: "s", artifactId: "a", sha256: "a".repeat(64), width: w, height: h, encoding: "encoded-srgb-8-rgb" },
      crop: { x: 0, y: 0, width: w, height: h }, outputWidth: w, outputHeight: h, quantizationStep: 2, maximumEncodedBytes: 256_000_000, maximumProviderReads: 20_000 };
    const rejected = "Print requires bounded native/downsampled aspect-preserving crop output.";
    expect(() => parsePrintJpegInput(input)).toThrow(rejected);
    const parsed = parsePrintJpegInput({ ...input, maximumPixels: CEILING });
    expect(parsed.maximumPixels).toBe(CEILING);
    expect(Object.hasOwn(parsePrintJpegInput({ ...input, source: { ...input.source, width: 64, height: 64 }, crop: { x: 0, y: 0, width: 64, height: 64 },
      outputWidth: 64, outputHeight: 64 }), "maximumPixels")).toBe(false);
    expect(parsePrintJpegInput({ ...input, maximumPixels: CEILING, maximumEncodedBytes: 1_431_655_765 }).maximumEncodedBytes).toBe(1_431_655_765);
    expect(() => parsePrintJpegInput({ ...input, maximumPixels: CEILING, maximumEncodedBytes: 1_431_655_766 })).toThrow(rejected);
    const small = { ...input, source: { ...input.source, width: 64, height: 64 }, crop: { x: 0, y: 0, width: 64, height: 64 }, outputWidth: 64, outputHeight: 64 };
    expect(() => parsePrintJpegInput({ ...small, maximumEncodedBytes: 256_000_001 })).toThrow(rejected);
    for (const value of INVALID) {
      expect(() => parsePrintJpegInput({ ...small, maximumPixels: value as number })).toThrow("Print maximumPixels must be an integer from 1 to 134217728.");
    }
  });
});

describe("simulateCapture output.maximumPixels", () => {
  const scene = { preset: "slanted-edge" as const };
  it("rejects invalid or insufficient limits before any radiance work", async () => {
    await expect(simulateCapture({ scene, output: { width: 4095, height: 8 } })).rejects.toThrow("output.width must be an integer from 1 to 4094.");
    for (const value of INVALID) {
      await expect(simulateCapture({ scene, output: { width: 8, height: 8, maximumPixels: value as number } })).rejects.toThrow("output.maximumPixels must be an integer from 1 to 134217728.");
    }
    await expect(simulateCapture({ scene, output: { width: 8, height: 8, maximumPixels: 99 } }))
      .rejects.toThrow("output.maximumPixels (99) must cover the native sensor raster of 10 × 10 sites (the output plus the demosaic margin), at most 16384 per side.");
    await expect(simulateCapture({ scene, output: { width: 16_384, height: 8, maximumPixels: CEILING } })).rejects.toThrow("output.maximumPixels (134217728) must cover the native sensor raster of 16386 × 10 sites");
    await expect(simulateCapture({ scene, output: { width: 16_385, height: 8, maximumPixels: CEILING } })).rejects.toThrow("output.width must be an integer from 1 to 16384.");
    await expect(simulateCapture({ scene, output: { width: 9_000, height: 8_000, demosaic: "ahd", maximumPixels: CEILING } }))
      .rejects.toThrow("output.demosaic \"ahd\" admits at most 67108864 native sites.");
  });

  it("changes no output when given for a small capture", { timeout: scaledTimeout(30_000) }, async () => {
    for (const format of ["srgb-8", "png", "jpeg", "dng"] as const) {
      const plain = await simulateCapture({ scene, output: { width: 8, height: 6, format } });
      const raised = await simulateCapture({ scene, output: { width: 8, height: 6, format, maximumPixels: CEILING } });
      expect(raised.request.environmentRaw.raw.maximumPixels).toBe(CEILING);
      expect(raised.plan.maximumPixels).toBe(CEILING);
      expect(Object.hasOwn(plain.plan, "maximumPixels")).toBe(false);
      expect(raised.scene.sourceSha256).toBe(plain.scene.sourceSha256);
      expect(Array.from(raised.raw.codes)).toEqual(Array.from(plain.raw.codes));
      expect(Array.from(raised.image.samples)).toEqual(Array.from(plain.image.samples));
      expect(raised.image.png).toEqual(plain.image.png);
      expect(raised.image.jpeg).toEqual(plain.image.jpeg);
      expect(raised.image.dng).toEqual(plain.image.dng);
    }
  });
});
