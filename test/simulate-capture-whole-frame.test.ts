// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { calculatePackedSensorRawPlan, calculateSubjectDistanceForFraming, createImageKernelAccelerator, ImageKernelExecutionError, InvalidConfigurationError,
  simulateCapture, simulatePackedSensorRaw, type PackedSensorRawInput, type SimulateCaptureOptions, type SimulateCaptureResult } from "../src/index.js";
import { sensorGpuConstants } from "../src/gpu/sensor-stage-gpu.js";
import { scaledTimeout } from "./helpers/test-timeout.js";

/*
 * 2.5: whole-frame views. A pitch above 100 µm (up to 1000 µm) simulates a whole sensor frame at a small output size: 44 mm ÷ 48 pixels
 * is 917 µm. The same equations apply at every pitch; these tests check that they still hold there.
 */

type Options = SimulateCaptureOptions;
const merge = (a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = { ...a };
  for (const [key, value] of Object.entries(b)) {
    out[key] = value !== null && typeof value === "object" && !Array.isArray(value) ? merge((a[key] ?? {}) as Record<string, unknown>, value as Record<string, unknown>) : value;
  }
  return out;
};
const withOptions = (base: Options, extra: Record<string, unknown>): Options => merge(base as unknown as Record<string, unknown>, extra) as unknown as Options;

/** Black-subtracted RAW statistics of one CFA phase (0 R, 1 G on red rows, 2 G on blue rows, 3 B) inside the active area. */
function phaseStatistics(capture: SimulateCaptureResult, phase: number): { mean: number; variance: number; count: number; min: number; max: number } {
  const geometry = capture.plan.exposure.geometry, width = geometry.nativeRaster.pixelWidth, active = geometry.activeCaptureRect!;
  let sum = 0, sum2 = 0, count = 0, min = Infinity, max = -Infinity;
  for (let y = active.y; y < active.y + active.height; y++) for (let x = active.x; x < active.x + active.width; x++) {
    if ((y % 2) * 2 + (x % 2) !== phase) continue;
    const i = y * width + x, value = capture.raw.codes[i]! - capture.raw.blackLevels[i]!;
    sum += value; sum2 += value * value; count++; min = Math.min(min, value); max = Math.max(max, value);
  }
  const mean = sum / count;
  return { mean, variance: (sum2 - count * mean * mean) / (count - 1), count, min, max };
}
const meanOf = (samples: ArrayLike<number>): number => Array.from(samples).reduce((s, v) => s + v, 0) / samples.length;
const meanAbsoluteDifference = (a: ArrayLike<number>, b: ArrayLike<number>): number => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]! - b[i]!);
  return sum / a.length;
};
type Regime = { systemConversionGainElectronsPerCode: { value: number }; readNoiseComponents: { rmsElectrons: { value: number } }[] };
function siteReadout(capture: SimulateCaptureResult, index: number): { regime: Regime; regimeId: string; readoutProfile: unknown; capacityElectrons: number } {
  const site = capture.request.siteInput(index) as unknown as { readout: { readoutProfile: { regimes: (Regime & { regimeId: string })[] }; regimeId: string;
    capacityProfile: { capacityElectrons: number } } };
  return { regime: site.readout.readoutProfile.regimes.find((g) => g.regimeId === site.readout.regimeId)!, regimeId: site.readout.regimeId,
    readoutProfile: site.readout.readoutProfile, capacityElectrons: site.readout.capacityProfile.capacityElectrons };
}

describe("simulateCapture whole-frame views (2.5): pitches up to 1000 µm", () => {
  it("accepts 0.5-1000 µm, records the whole-frame view above 100 µm and keeps the frame's prime and framing", async () => {
    const view = await simulateCapture({ scene: { preset: "uniform" }, lens: { prime: 50 }, sensor: { pixelPitchMicrometers: 36000 / 48 }, output: { width: 48, height: 32 } });
    const record = view.assumptions.find((a) => a.id === "sensor.wholeFrameView")!;
    expect(record.kind).toBe("model");
    expect(record.value).toEqual({ pixelPitchMicrometers: 750, frameWidthMm: 36, frameHeightMm: 24 });
    expect(record.explanation).toMatch(/binned, downsized view, not the real sensor's per-pixel noise/);
    // The frame is 36 × 24 mm, so the 50 mm-equivalent prime is a 50 mm lens with its 0.383 m minimum focus.
    const prime = view.assumptions.find((a) => a.id === "lens.prime")!.value as { focalLengthMm: number; minimumFocusDistanceM: number };
    expect(prime.focalLengthMm).toBeCloseTo(50, 9);
    expect(prime.minimumFocusDistanceM).toBeCloseTo(0.05 * (1 + 1 / 0.15), 9);
    expect(view.assumptions.find((a) => a.id === "sensor.isoAreaNormalization")!.value).toMatchObject({ areaScale: 750 * 750 / 36 });
    // calculateSubjectDistanceForFraming on the same 36 × 24 mm frame gives the distance at which a fixed-size chart fills the width.
    const fit = calculateSubjectDistanceForFraming({ sensor: { widthMm: 36, heightMm: 24 }, equivalentFocalLengthMm: 50, chart: { widthM: 0.42, heightM: 0.28 } });
    const framed = await simulateCapture({ scene: { preset: "siemens-star" }, lens: { prime: 50 }, chartSize: { widthM: 0.42, heightM: 0.28 }, subjectDistanceM: fit.subjectDistanceM,
      sensor: { pixelPitchMicrometers: 750, spectralStepNanometers: 100 }, output: { width: 48, height: 32 } });
    expect(framed.scene.chart!.frameWidthFraction).toBeCloseTo(1, 12);
    expect(framed.scene.chart!.imageWidthPixels).toBeCloseTo(48, 9);
    // At 100 µm and below nothing new is recorded; above 1000 µm the request is refused.
    const at100 = await simulateCapture({ scene: { preset: "uniform" }, sensor: { pixelPitchMicrometers: 100, spectralStepNanometers: 100 }, output: { width: 4, height: 4 } });
    expect(at100.assumptions.some((a) => a.id === "sensor.wholeFrameView")).toBe(false);
    const at1000 = await simulateCapture({ scene: { preset: "uniform" }, sensor: { pixelPitchMicrometers: 1000, spectralStepNanometers: 100 }, output: { width: 4, height: 4 } });
    expect(at1000.assumptions.some((a) => a.id === "sensor.wholeFrameView")).toBe(true);
    for (const pitch of [1000.0001, 0.49]) {
      await expect(simulateCapture({ scene: { preset: "uniform" }, sensor: { pixelPitchMicrometers: pitch }, output: { width: 4, height: 4 } })).rejects.toThrow(InvalidConfigurationError);
    }
    await expect(simulateCapture({ scene: { preset: "uniform" }, sensor: { pixelPitchMicrometers: 1001 } })).rejects.toThrow("sensor.pixelPitchMicrometers must be 0.5-1000.");
  }, scaledTimeout(60_000));

  it("keeps the RAW and image brightness of a small pitch at area ratios up to 27 778, without overflow or precision loss", async () => {
    // 6 µm reference over 64 × 64 sites; its per-phase mean has a standard error of sd/√1024.
    const reference = await simulateCapture({ scene: { preset: "uniform" }, output: { width: 64, height: 64 } });
    const referenceSrgb = meanOf(reference.image.samples);
    for (const pitch of [150, 458, 917, 1000]) {
      const capture = await simulateCapture({ scene: { preset: "uniform" }, sensor: { pixelPitchMicrometers: pitch }, output: { width: 24, height: 16 } });
      for (let phase = 0; phase < 4; phase++) {
        const ref = phaseStatistics(reference, phase), large = phaseStatistics(capture, phase);
        // Large pitches round a nearly noise-free expected code, so ±0.5 code plus four standard errors of the reference mean.
        expect(Math.abs(large.mean - ref.mean), `pitch ${pitch} phase ${phase}`).toBeLessThan(0.5 + 4 * Math.sqrt(ref.variance / ref.count));
        // Shot noise of 1.6e8 e⁻ is under 0.2 code at 917 µm: the codes are the rounded expected value, so they agree within 2 codes.
        if (pitch >= 917) expect(large.max - large.min).toBeLessThanOrEqual(2);
      }
      expect(Math.abs(meanOf(capture.image.samples) - referenceSrgb)).toBeLessThan(1);
      const capacity = siteReadout(capture, 0).capacityElectrons;
      expect(capacity).toBeCloseTo(60_000 * pitch * pitch / 36, 3);
      expect(Number.isSafeInteger(Math.round(capacity))).toBe(true);
    }
    // Saturation: a 64× overexposure clips at the same effective white code at 6 µm and 1000 µm (1.67e9 e⁻ capacity, the normal-approximation Poisson branch).
    const over = async (pitch: number): Promise<SimulateCaptureResult> => simulateCapture({ scene: { preset: "uniform" }, illuminanceLux: 21_481 * 64,
      sensor: { pixelPitchMicrometers: pitch, spectralStepNanometers: 100 }, output: { width: 8, height: 8 } });
    const small = await over(6), large = await over(1000);
    expect(Array.from(large.raw.effectiveSaturationCodes)).toEqual(Array.from(small.raw.effectiveSaturationCodes));
    for (let phase = 0; phase < 4; phase++) expect(phaseStatistics(large, phase).max).toBe(phaseStatistics(small, phase).max);
    expect(large.raw.saturationFlags.every((flags) => flags !== 0)).toBe(true);
    expect(Array.from(large.image.samples)).toEqual(Array.from(small.image.samples));
  }, scaledTimeout(120_000));

  it("gives the per-pixel noise of a photosite of that size: Poisson photon transfer, SNR proportional to the pitch", async () => {
    // ISO 12800 (0.0305 e⁻/code at 6 µm, 1.1 e⁻ read noise) with the light reduced 128×, so the noise exceeds the code step even at 917 µm.
    // Photon transfer (EMVA 1288 Release 4.0, §2): variance in codes = μ_e/K² + σ_read²/K² + 1/12 (quantization), μ_e = mean code × K.
    const electrons: number[] = [];
    for (const pitch of [150, 458, 917]) {
      const capture = await simulateCapture({ scene: { preset: "uniform" }, exposure: { iso: 12800 }, illuminanceLux: 21_481 / 128,
        sensor: { pixelPitchMicrometers: pitch, spectralStepNanometers: 40 }, output: { width: 64, height: 48 } });
      const green = [phaseStatistics(capture, 1), phaseStatistics(capture, 2)], { regime } = siteReadout(capture, 1);
      const gain = regime.systemConversionGainElectronsPerCode.value, read = regime.readNoiseComponents[0]!.rmsElectrons.value;
      for (const g of green) {
        const predicted = g.mean / gain + (read / gain) ** 2 + 1 / 12;
        // 1536 sites per green phase: the variance has a relative standard error of √(2/1536) = 3.6 %.
        expect(g.variance / predicted, `pitch ${pitch}`).toBeGreaterThan(0.88);
        expect(g.variance / predicted, `pitch ${pitch}`).toBeLessThan(1.12);
      }
      electrons.push(green[0]!.mean * gain);
    }
    // Signal electrons ∝ pitch², so the shot-noise SNR √μ_e ∝ pitch: a 917 µm pixel has 6.1× the SNR of a 150 µm pixel.
    expect(electrons[1]! / electrons[0]!).toBeCloseTo((458 / 150) ** 2, 1);
    expect(electrons[2]! / electrons[0]!).toBeCloseTo((917 / 150) ** 2, 0);
    expect(electrons[2]!).toBeGreaterThan(1e6);
  }, scaledTimeout(120_000));

  it("applies diffraction kernels far smaller than one pixel: exact site sampling, energy kept, no NaN, in about a second", async () => {
    const base: Options = { scene: { preset: "slanted-edge" }, lens: { prime: 50, fNumber: 1.4 }, sensor: { pixelPitchMicrometers: 917 }, output: { width: 24, height: 16 } };
    const started = Date.now();
    const diffracted = await simulateCapture(withOptions(base, { lens: { diffraction: "circular-aperture" } }));
    expect(Date.now() - started).toBeLessThan(scaledTimeout(20_000));
    const sharp = await simulateCapture(base), d = diffracted.request.diffraction!;
    expect(d.execution).toBe("object-space-convolution");
    expect(d.profile.kernelRadiusSamples).toBe(1);
    expect(d.profile.quadrature.method).toBe("real-space-encircled-energy-gauss-legendre");
    for (const w of d.profile.wavelengths) {
      // Airy disk of a few µm in a 917 µm cell: the centre cell keeps 1 − 8√2/(π³β) of the energy (β = p·f_c), within 1e-3 of the leakage.
      const beta = 917 * w.cutoffFrequencyCyclesPerMicrometer, leak = 8 * Math.SQRT2 / Math.PI ** 3 / beta;
      expect(Math.abs(1 - w.centreSampleFraction * w.capturedEnergyFraction - leak) / leak).toBeLessThan(2e-3);
      expect(Number.isFinite(w.truncatedEnergyFraction) && w.truncatedEnergyFraction > 0 && w.truncatedEnergyFraction < 1e-3).toBe(true);
    }
    expect(Array.from(diffracted.image.samples).every(Number.isFinite)).toBe(true);
    // The blur is a fraction of a pixel: the image changes by at most a few codes at the edge.
    expect(meanAbsoluteDifference(diffracted.image.samples, sharp.image.samples)).toBeLessThan(0.5);
    // A unit-sum kernel keeps the energy of a uniform field; an explicit wider window and f/8 (β from 147 to 301: mixed quadrature) also work.
    const uniform: Options = { scene: { preset: "uniform" }, sensor: { pixelPitchMicrometers: 917, spectralStepNanometers: 40 }, output: { width: 12, height: 8 } };
    const plain = await simulateCapture(uniform);
    const wide = await simulateCapture(withOptions(uniform, { lens: { diffraction: { aperture: "circular-aperture", kernelRadiusSamples: 2 } } }));
    const wideDiffraction = wide.request.diffraction!.profile;
    expect(wideDiffraction.kernelRadiusSamples).toBe(2);
    expect(wideDiffraction.quadrature.method).toBe("frequency-domain-and-real-space");
    expect(wideDiffraction.quadrature.realSpaceWavelengthsNm!.length).toBeGreaterThan(0);
    for (let phase = 0; phase < 4; phase++) expect(Math.abs(phaseStatistics(wide, phase).mean - phaseStatistics(plain, phase).mean)).toBeLessThan(0.5);
    expect(Array.from(wide.image.samples)).toEqual(Array.from(plain.image.samples));
    // Within the 2.4.1 range (100 µm, widest f/1.4) every wavelength still uses the 2.1 frequency-domain cells.
    const at100 = await simulateCapture({ scene: { preset: "uniform" }, lens: { prime: 50, fNumber: 1.4, diffraction: "circular-aperture" },
      sensor: { pixelPitchMicrometers: 100, spectralStepNanometers: 10 }, output: { width: 4, height: 4 } });
    expect(at100.request.diffraction!.profile.quadrature.method).toBe("polar-frequency-domain-trapezoid-gauss-legendre");
  }, scaledTimeout(120_000));

  it("matches the same framing at 1/100 of the pitch with the prime scaled: point and box apertures, four-spot filter, AHD, motion and rolling shutter", async () => {
    // Same output, same 50 mm-equivalent prime: at 917 µm the frame is 22 × 14.7 mm (f ≈ 25 mm), at 9.17 µm 0.22 × 0.147 mm (f ≈ 0.25 mm). Every site
    // sees the same direction, so the images agree up to the small pitch's own noise (0.5 code mean absolute difference) and a 0.01 % framing difference.
    const base: Options = { scene: { preset: "dead-leaves" }, lens: { prime: 50 }, subjectDistanceM: 200, sensor: { spectralStepNanometers: 40 }, output: { width: 24, height: 16 } };
    const cases: [string, Record<string, unknown>, number][] = [
      ["point aperture", {}, 1],
      ["box 2 × 2", { sensor: { pixelAperture: { kind: "box", samplesPerAxis: 2 } } }, 1],
      ["box 4 × 4", { sensor: { pixelAperture: { kind: "box", samplesPerAxis: 4 } } }, 1],
      ["four-spot anti-aliasing filter", { sensor: { antiAliasing: { kind: "four-spot" } } }, 1],
      // AHD is non-linear: the small pitch's noise flips some edge pixels' direction choice.
      ["AHD demosaic", { output: { demosaic: "ahd" } }, 2.5],
      // A 0.2 rad/s yaw over 1/4 s sweeps 50 mrad, 2.8 pixels of 18 mrad.
      ["camera rotation blur", { motion: { angularVelocityRadPerSec: { yaw: 0.2 } }, exposure: { shutterSeconds: 0.25 }, illuminanceLux: 21_481 / 32 }, 1],
      ["rolling shutter", { motion: { angularVelocityRadPerSec: { yaw: 2, pitch: 1 }, shutter: "rolling" } }, 1]
    ];
    const still = await simulateCapture(withOptions(base, { sensor: { pixelPitchMicrometers: 917 } }));
    for (const [name, extra, tolerance] of cases) {
      const large = await simulateCapture(withOptions(base, { ...extra, sensor: { ...(extra.sensor as object | undefined), pixelPitchMicrometers: 917 } }));
      const small = await simulateCapture(withOptions(base, { ...extra, sensor: { ...(extra.sensor as object | undefined), pixelPitchMicrometers: 9.17 } }));
      expect(meanAbsoluteDifference(large.image.samples, small.image.samples), name).toBeLessThan(tolerance);
      if (name !== "point aperture") expect(meanAbsoluteDifference(large.image.samples, still.image.samples), name + " changes the image").toBeGreaterThan(2);
    }
  }, scaledTimeout(240_000));

  it("keeps output.region tiles byte-identical to the whole render", async () => {
    const cases: Options[] = [
      { scene: { preset: "zone-plate" }, lens: { prime: 35, fNumber: 2, diffraction: "circular-aperture" }, sensor: { pixelPitchMicrometers: 917, spectralStepNanometers: 40,
        antiAliasing: { kind: "four-spot" }, pixelAperture: { kind: "box", samplesPerAxis: 2 } }, output: { width: 14, height: 10, demosaic: "ahd" } },
      { scene: { preset: "slanted-edge" }, sensor: { pixelPitchMicrometers: 640, temporalSampleCount: 2, spectralStepNanometers: 40 }, output: { width: 14, height: 10 },
        motion: { angularVelocityRadPerSec: { yaw: 0.5, pitch: 0.2 }, shutter: "rolling" } }
    ];
    for (const options of cases) {
      const whole = await simulateCapture(options), samples = new Array<number>(14 * 10 * 3).fill(-1);
      for (const region of [{ x: 0, y: 0, width: 5, height: 3 }, { x: 5, y: 0, width: 9, height: 3 }, { x: 0, y: 3, width: 7, height: 7 }, { x: 7, y: 3, width: 7, height: 7 }]) {
        const tile = await simulateCapture({ ...options, output: { ...options.output, region } });
        for (let y = 0; y < region.height; y++) for (let x = 0; x < region.width * 3; x++) samples[((region.y + y) * 14 + region.x) * 3 + x] = tile.image.samples[y * region.width * 3 + x]!;
      }
      expect(samples).toEqual(Array.from(whole.image.samples));
    }
  }, scaledTimeout(120_000));

  it("fails closed on the webgpu-f32 sensor stage above its 2^24 e⁻ capacity domain; the cpu-reference backend runs it", async () => {
    // simulateCapture runs on the CPU. The optional accelerator's sensor stage accepts capacities up to 2^24 e⁻: 16.7 million at 100 µm (the tier's
    // 60 000 e⁻ × 277.8), 1.4e9 at 917 µm. The convolution, temporal-sum and chart stages work in sites and frame units, so the pitch does not enter them.
    const packed = async (pitch: number): Promise<PackedSensorRawInput> => {
      const capture = await simulateCapture({ scene: { preset: "uniform" }, sensor: { pixelPitchMicrometers: pitch, spectralStepNanometers: 100 }, output: { width: 4, height: 4 } });
      const readout = siteReadout(capture, 0), gain = readout.regime.systemConversionGainElectronsPerCode.value, sites = capture.raw.codes.length;
      const photo = new Float64Array(sites);
      for (let i = 0; i < sites; i++) photo[i] = (capture.raw.codes[i]! - capture.raw.blackLevels[i]!) * gain;
      const width = capture.plan.exposure.geometry.nativeRaster.pixelWidth;
      return { schemaVersion: "0.1.0", nativeWidth: width, nativeHeight: sites / width, region: { x: 0, y: 0, width, height: sites / width }, captureSeedUint32: 7,
        photoElectrons: photo, darkElectrons: new Float64Array(sites), physicalChargeCapacityElectrons: readout.capacityElectrons,
        readoutProfile: readout.readoutProfile as PackedSensorRawInput["readoutProfile"], regimeId: readout.regimeId };
    };
    const inRange = await packed(100), whole = await packed(917);
    expect(() => sensorGpuConstants(calculatePackedSensorRawPlan(inRange))).not.toThrow();
    let failure: unknown;
    try { sensorGpuConstants(calculatePackedSensorRawPlan(whole)); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(ImageKernelExecutionError);
    expect((failure as ImageKernelExecutionError).reason).toBe("unsupported-float32-domain");
    const accelerator = await createImageKernelAccelerator({ backend: "cpu-reference" });
    try {
      const result = await accelerator.simulateSensorRaw(whole);
      expect(Array.from(result.codes)).toEqual(Array.from(simulatePackedSensorRaw(whole).codes));
    } finally {
      accelerator.dispose();
    }
  }, scaledTimeout(60_000));
});
