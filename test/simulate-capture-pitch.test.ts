// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { calculateSensorGeometryMetrics, resolveSensorSamplingAperture, simulateCapture, type SimulateCaptureOptions,
  type SimulateCaptureResult } from "../src/index.js";
import { scaledTimeout } from "./helpers/test-timeout.js";

/*
 * Pixel pitches a downstream app derives with calculateSensorGeometryMetrics: nine sensor formats at twelve resolutions, less the one
 * combination below the facade's 0.5 µm minimum (5.6 × 4.2 mm at 100 MP, 0.485 µm), which the app excludes.
 * 3:2 rasters are 3k × 2k and 4:3 rasters 4k × 3k, with k the multiple of 4 nearest √(MP·10⁶/6) or √(MP·10⁶/12).
 */
const MEGAPIXELS = [100, 60, 50, 45, 32, 24, 20, 15, 12, 10, 5, 1] as const;
const FORMATS = [[44, 33, "4:3"], [36, 24, "3:2"], [23.5, 15.6, "3:2"], [22.3, 14.9, "3:2"], [17.3, 13, "4:3"], [13.2, 8.8, "3:2"], [9.8, 7.4, "4:3"],
  [6.4, 4.8, "4:3"], [5.6, 4.2, "4:3"]] as const;
const raster = (megapixels: number, aspect: "3:2" | "4:3"): [number, number] => {
  const k = 4 * Math.round(Math.sqrt(megapixels * 1e6 / (aspect === "3:2" ? 6 : 12)) / 4);
  return aspect === "3:2" ? [3 * k, 2 * k] : [4 * k, 3 * k];
};
const pitchOf = (widthMm: number, heightMm: number, megapixels: number, aspect: "3:2" | "4:3"): number => {
  const [pixelWidth, pixelHeight] = raster(megapixels, aspect);
  return calculateSensorGeometryMetrics({ imagingArea: { widthMm, heightMm }, nativeRaster: { pixelWidth, pixelHeight } }).value.sampling.pitchXMicrometers;
};
const APP_PITCHES = FORMATS.flatMap(([w, h, aspect]) => MEGAPIXELS.map((mp) => pitchOf(w, h, mp, aspect))).filter((pitch) => pitch >= 0.5);
/** Fixed-seed pitches in 0.5–100 µm (the facade's admitted range). */
const RANDOM_PITCHES = ((): number[] => {
  let state = 0x2545f491;
  return Array.from({ length: 200 }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return 0.5 + 99.5 * state / 2 ** 32;
  });
})();
const OUTPUT_SIZES = [32, 48, 64, 96] as const;
/** Native border per side: bilinear with margin borders 1 site, AHD with margin borders 5 sites, mirror borders 0. */
const BORDERS = [1, 5, 0] as const;

describe("simulateCapture accepts every pixel pitch whose apertures fit exactly", () => {
  it("covers the app's 107 pitches and the 2.1.0 failures", () => {
    expect(APP_PITCHES).toHaveLength(107);
    expect(Math.min(...APP_PITCHES)).toBeCloseTo(0.554, 3);
    expect(raster(24, "3:2")).toEqual([6000, 4000]);
    expect(raster(100, "4:3")).toEqual([11552, 8664]);
    expect([raster(50, "3:2"), raster(12, "3:2"), raster(50, "4:3"), raster(12, "4:3")]).toEqual([[8664, 5776], [4248, 2832], [8160, 6120], [4000, 3000]]);
    expect(APP_PITCHES).toContain(9.287925696594426);
  });

  it("fits the facade's lattice and square apertures at every pitch, output size and border", () => {
    // The facade builds widthMm = nativeWidth · pitch / 1000, sites at pitch/2 + i·pitch and a pitch-wide aperture (see
    // simulate-capture.ts). Resolve the far-corner site, whose check covers the complete site grid, for every case.
    let roundingMisses = 0;
    for (const pitch of [...APP_PITCHES, ...RANDOM_PITCHES]) for (const size of OUTPUT_SIZES) for (const border of BORDERS) {
      const sites = size + 2 * border, nativeRaster = { pixelWidth: sites, pixelHeight: sites };
      const imagingArea = { widthMm: sites * pitch / 1000, heightMm: sites * pitch / 1000 };
      if (pitch / 2 + (sites - 1) * pitch + pitch / 2 > imagingArea.widthMm * 1000) roundingMisses++;
      const evidence = [{ sourceOrigin: "photivra" as const, sourceReference: "test:pitch-sweep", reuseStatus: "photivra-owned" as const }];
      const resolved = resolveSensorSamplingAperture({ imagingArea, nativeRaster, site: { x: sites - 1, y: sites - 1 },
        colorSamplingProfile: { schemaVersion: "0.1.0", profileId: "cfa", evidence, coordinateSystem: "native-sensor-color-sampling-site-index",
          layout: { kind: "periodic-mosaic", repeatWidthSites: 2, repeatHeightSites: 2, siteChannelIds: ["red", "green", "green", "blue"], anchor: "native-sensor-top-left-site" } },
        colorSamplingBindingProfile: { schemaVersion: "0.1.0", bindingId: "binding", colorSamplingProfileId: "cfa", nativeRaster, evidence,
          relationship: { kind: "regular-native-effective-sample-blocks", sitesPerNativeSampleX: 1, sitesPerNativeSampleY: 1, anchor: "shared-native-top-left" } },
        samplingApertureProfile: { schemaVersion: "0.1.0", profileId: "sampling", colorSamplingProfileId: "cfa", colorSamplingBindingId: "binding", evidence,
          siteCenterLattice: { kind: "regular-rectangular-site-center-lattice", coordinateSystem: "native-sensor-physical", pitchXMicrometers: pitch, pitchYMicrometers: pitch,
            firstSiteCenterFromImagingAreaTopLeftMicrometers: { x: pitch / 2, y: pitch / 2 }, evidence },
          geometricSensitiveAperture: { kind: "uniform-axis-aligned-rectangle", widthMicrometers: pitch, heightMicrometers: pitch,
            centerOffsetFromSiteCenterMicrometers: { x: 0, y: 0 }, evidence } } });
      expect(resolved.geometricSensitiveAperture.areaSquareMicrometers).toBe(pitch * pitch);
    }
    // The sweep exercises the rounding case: a strict comparison rejects a large share of these exact fits.
    expect(roundingMisses).toBeGreaterThan(100);
  });

  it("passes the facade's first RAW tile at every app pitch with both borders and both demosaics", async () => {
    // The fit check runs when the first site is planned, inside the first RAW tile; the capture is aborted once the
    // second tile is requested, so no full image is rendered. Each run covers two output sizes (width and height).
    const combos = [{}, { borderHandling: "mirror" }, { demosaic: "ahd" }, { demosaic: "ahd", borderHandling: "mirror" }] as const;
    const sizePairs = [[32, 96], [48, 64]] as const;
    const cases: [number, (typeof combos)[number], readonly [number, number]][] = [[9.287925696594426, {}, [32, 32]], [5.199306759098787, {}, [48, 48]]];
    APP_PITCHES.forEach((pitch, i) => {
      cases.push([pitch, combos[i % 4]!, sizePairs[i % 2]!], [pitch, combos[(i + 2) % 4]!, sizePairs[(i + 1) % 2]!]);
    });
    for (const [pitch, combo, [width, height]] of cases) {
      const controller = new AbortController();
      await expect(simulateCapture({ scene: { preset: "uniform" }, sensor: { pixelPitchMicrometers: pitch, spectralStepNanometers: 100 },
        signal: controller.signal, output: { width, height, ...combo } as NonNullable<SimulateCaptureOptions["output"]>,
        onProgress: (p) => { if (p.stage === "raw" && p.completedTileCount >= 2) controller.abort(); } })).rejects.toThrow("simulateCapture aborted.");
    }
  }, scaledTimeout(120_000));
});

const meanOf = (samples: ArrayLike<number>): number => Array.from(samples).reduce((s, v) => s + v, 0) / samples.length;

/** Mean and standard deviation of the black-subtracted RAW codes of the green sites inside the active area. */
function greenRawStatistics(capture: SimulateCaptureResult): { mean: number; sd: number } {
  const geometry = capture.plan.exposure.geometry, width = geometry.nativeRaster.pixelWidth, active = geometry.activeCaptureRect!;
  let sum = 0, sum2 = 0, count = 0;
  for (let y = active.y; y < active.y + active.height; y++) for (let x = active.x; x < active.x + active.width; x++) {
    if ((x + y) % 2 !== 1) continue; // RGGB: green where x + y is odd
    const i = y * width + x, value = capture.raw.codes[i]! - capture.raw.blackLevels[i]!;
    sum += value; sum2 += value * value; count++;
  }
  const mean = sum / count;
  return { mean, sd: Math.sqrt(sum2 / count - mean * mean) };
}

describe("simulateCapture ISO calibration does not depend on pixel size", () => {
  const capture = (pitch?: number): Promise<SimulateCaptureResult> => simulateCapture({ scene: { preset: "uniform" }, output: { width: 48, height: 48 },
    ...(pitch === undefined ? {} : { sensor: { pixelPitchMicrometers: pitch } }) });

  it("gives the same output brightness at every pitch for the same exposure, with noise rising as pixels shrink", async () => {
    const reference = await capture(6), referenceRaw = greenRawStatistics(reference);
    const referenceMean = meanOf(reference.image.samples);
    const results: { pitch: number; mean: number; srgbMean: number; sd: number }[] = [];
    for (const pitch of [0.554, 1, 1.5, 2.2, 3.8, 6, 9.287925696594426, 15, 30]) {
      const r = await capture(pitch), raw = greenRawStatistics(r);
      results.push({ pitch, mean: raw.mean, sd: raw.sd, srgbMean: meanOf(r.image.samples) });
    }
    for (const r of results) {
      // Linear RAW mean: within 1 % (0.554 µm sites collect about 66 e⁻ of signal, so the mean of 1152 green sites varies ~0.4 %).
      expect(Math.abs(r.mean / referenceRaw.mean - 1)).toBeLessThan(0.01);
      // 8-bit sRGB mean: within 1 code; below 1 µm within 1.5, because strong per-pixel noise passed through the concave
      // sRGB transfer (and the clip at 0) lowers the mean of the encoded values although the linear mean is unchanged.
      expect(Math.abs(r.srgbMean - referenceMean)).toBeLessThan(r.pitch < 1 ? 1.5 : 1);
    }
    for (let i = 1; i < results.length; i++) expect(results[i]!.sd).toBeLessThan(results[i - 1]!.sd);
    // Shot-noise limited: code noise ∝ 1/pitch at the same exposure (electrons ∝ pitch², codes per electron ∝ 1/pitch²).
    const at = (pitch: number): number => results.find((r) => r.pitch === pitch)!.sd;
    expect(at(1) / at(6)).toBeGreaterThan(5);
    expect(at(1) / at(6)).toBeLessThan(7);
    expect(at(6) / at(30)).toBeGreaterThan(3.5);
    expect(at(6) / at(30)).toBeLessThan(6.5);
  }, scaledTimeout(120_000));

  it("scales the readout's charge-domain values with the aperture area and records the model", async () => {
    const small = await capture(3), large = await capture(12), base = await capture();
    const regime = (r: SimulateCaptureResult): { systemConversionGainElectronsPerCode: { value: number }; preAdcSaturationElectronEquivalent: { value: number }; readNoiseComponents: { rmsElectrons: { value: number } }[] } => {
      const site = r.request.siteInput(0) as unknown as { readout: { readoutProfile: { regimes: { regimeId: string; systemConversionGainElectronsPerCode: { value: number };
        preAdcSaturationElectronEquivalent: { value: number }; readNoiseComponents: { rmsElectrons: { value: number } }[] }[] }; regimeId: string } };
      return site.readout.readoutProfile.regimes.find((g) => g.regimeId === site.readout.regimeId)!;
    };
    expect(regime(small).systemConversionGainElectronsPerCode.value / regime(base).systemConversionGainElectronsPerCode.value).toBeCloseTo(0.25, 12);
    expect(regime(large).preAdcSaturationElectronEquivalent.value / regime(base).preAdcSaturationElectronEquivalent.value).toBeCloseTo(4, 12);
    expect(regime(small).readNoiseComponents[0]!.rmsElectrons.value).toBe(regime(base).readNoiseComponents[0]!.rmsElectrons.value);
    expect(large.assumptions.find((a) => a.id === "sensor.capacityElectrons")!.value).toBeCloseTo(240_000, 6);
    const record = small.assumptions.find((a) => a.id === "sensor.isoAreaNormalization")!;
    expect(record.kind).toBe("model");
    expect(record.value).toEqual({ referenceApertureAreaSquareMicrometers: 36, apertureAreaSquareMicrometers: 9, areaScale: 0.25 });
    expect(record.explanation).toMatch(/Approximation/);
    // At the 6 µm anchor nothing changes: no record, and the explicit pitch gives the default's exact bytes.
    expect(base.assumptions.some((a) => a.id === "sensor.isoAreaNormalization")).toBe(false);
    const explicit = await capture(6);
    expect(Array.from(explicit.raw.codes)).toEqual(Array.from(base.raw.codes));
    expect(Array.from(explicit.image.samples)).toEqual(Array.from(base.image.samples));
  }, scaledTimeout(120_000));
});
