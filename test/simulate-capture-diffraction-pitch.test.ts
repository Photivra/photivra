// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { calculateSensorGeometryMetrics, createDiffractionLimitedPsfProfile, resolveLensPsfConvolutionKernels, resolveLensSampledPsf,
  simulateCapture } from "../src/index.js";
import { scaledTimeout } from "./helpers/test-timeout.js";

/*
 * 2.2.1 regression: `lens.diffraction` threw "Diffraction kernels must sample the site pitch exactly." or "The kernel radius
 * is too small for the PSF support; no tap is dropped." for 182 of the 545 combinations of the app pitches below with f/4–f/16.
 * resolveLensPsfConvolutionKernels mapped kernel tap n to the site displacement (n·p)/p, which differs from n by one unit in
 * the last place for some p and n (for example 3·1.6/1.6 = 3.0000000000000004). Just below n the tap was split bilinearly (no exact site
 * sampling); just above n a near-zero weight landed one site beyond the window (a reach of R + 1 for the outer ring).
 */

/** The 107 pitches of test/simulate-capture-pitch.test.ts: nine sensor formats at twelve resolutions (≥ 0.5 µm). */
const MEGAPIXELS = [100, 60, 50, 45, 32, 24, 20, 15, 12, 10, 5, 1] as const;
const FORMATS = [[44, 33, "4:3"], [36, 24, "3:2"], [23.5, 15.6, "3:2"], [22.3, 14.9, "3:2"], [17.3, 13, "4:3"], [13.2, 8.8, "3:2"], [9.8, 7.4, "4:3"],
  [6.4, 4.8, "4:3"], [5.6, 4.2, "4:3"]] as const;
const raster = (megapixels: number, aspect: "3:2" | "4:3"): [number, number] => {
  const k = 4 * Math.round(Math.sqrt(megapixels * 1e6 / (aspect === "3:2" ? 6 : 12)) / 4);
  return aspect === "3:2" ? [3 * k, 2 * k] : [4 * k, 3 * k];
};
const pitchOf = (widthMm: number, heightMm: number, pixelWidth: number, pixelHeight: number): number =>
  calculateSensorGeometryMetrics({ imagingArea: { widthMm, heightMm }, nativeRaster: { pixelWidth, pixelHeight } }).value.sampling.pitchXMicrometers;
const SWEEP_PITCHES = FORMATS.flatMap(([w, h, aspect]) => MEGAPIXELS.map((mp) => pitchOf(w, h, ...raster(mp, aspect)))).filter((pitch) => pitch >= 0.5);

/** The app's 41 current format/resolution pairs, with its exact rasters (40 MP is 7740 × 5160 and 7296 × 5472). */
const APP_RASTERS = {
  "3:2": { 100: [12252, 8168], 60: [9492, 6328], 50: [8664, 5776], 45: [8220, 5480], 40: [7740, 5160], 32: [6924, 4616], 24: [6000, 4000], 20: [5472, 3648],
    15: [4740, 3160], 12: [4248, 2832], 10: [3876, 2584] },
  "4:3": { 100: [11552, 8664], 60: [8944, 6708], 50: [8160, 6120], 45: [7744, 5808], 40: [7296, 5472], 32: [6528, 4896], 24: [5664, 4248], 20: [5168, 3876],
    15: [4480, 3360], 12: [4000, 3000], 10: [3648, 2736] }
} as const;
const APP_FORMATS = [[44, 33, "4:3", [100, 50, 40, 32]], [36, 24, "3:2", [60, 50, 45, 32, 24, 20, 12]], [23.5, 15.6, "3:2", [40, 32, 24, 20, 15, 12]],
  [22.3, 14.9, "3:2", [32, 24, 20, 15, 12, 10]], [17.3, 13, "4:3", [24, 20, 15, 12, 10]], [13.2, 8.8, "3:2", [20, 15, 12, 10]], [9.8, 7.4, "4:3", [100, 50, 12]],
  [6.4, 4.8, "4:3", [50, 32, 12]], [5.6, 4.2, "4:3", [50, 32, 12]]] as const;
const APP_PAIR_PITCHES = APP_FORMATS.flatMap(([w, h, aspect, mps]) => mps.map((mp) => {
  const [pw, ph] = APP_RASTERS[aspect][mp as keyof (typeof APP_RASTERS)[typeof aspect]];
  return pitchOf(w, h, pw, ph);
}));
const APP_PITCHES = [...new Set([...SWEEP_PITCHES, ...APP_PAIR_PITCHES])];
/** Fixed-seed pitches in 0.5–100 µm (the facade's admitted range). */
const RANDOM_PITCHES = ((): number[] => {
  let state = 0x6d2b79f5;
  return Array.from({ length: 200 }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return 0.5 + 99.5 * state / 2 ** 32;
  });
})();
const F_NUMBERS = [4, 5.6, 8, 11, 16] as const;
/** The facade's default reach (third dark ring at 780 nm, capped at 32 sites) for a lens focused at 5 m; 50 mm lens. */
const AIRY_THIRD_ZERO_PER_LAMBDA_N = 10.173468135062722 / Math.PI;
const defaultRadius = (pitch: number, fNumber: number): number => {
  const imageDistanceMm = 1 / (1 / 50 - 1 / 5000);
  return Math.min(32, Math.max(1, Math.ceil(AIRY_THIRD_ZERO_PER_LAMBDA_N * 0.78 * fNumber * imageDistanceMm / 50 / pitch)));
};

describe("lens.diffraction kernels sample the site pitch exactly at every pixel pitch", () => {
  it("covers the app's pitches and the 2.2.0 failures", () => {
    expect(SWEEP_PITCHES).toHaveLength(107);
    expect(APP_PAIR_PITCHES).toHaveLength(41);
    expect(APP_PITCHES).toHaveLength(109);
    for (const failed of [3.808864265927978, 6.740196078431373, 3.3939919121894855, 3.8616071428571432, 2.45, 1.6, 1.4, 0.6862745098039215]) {
      expect(APP_PITCHES).toContain(failed);
    }
    expect(pitchOf(23.5, 15.6, 7740, 5160)).toBe(3.036175710594315);
  });

  it("maps every tap to an integer site displacement within the window for all pitches and f-numbers", () => {
    // The facade's kernel construction at one wavelength (the tap-to-site mapping does not depend on the kernel values).
    let roundingCases = 0;
    for (const pitch of [...APP_PITCHES, ...RANDOM_PITCHES]) for (const fNumber of F_NUMBERS) {
      const R = defaultRadius(pitch, fNumber);
      for (let n = 1; n <= R; n++) if (n * pitch / pitch !== n) roundingCases++;
      const profile = createDiffractionLimitedPsfProfile({ aperture: "circular", focalLengthMm: 50, apertureFNumber: fNumber, focus: { kind: "finite", distanceM: 5 },
        wavelengthsNm: [780], samplePitchMicrometers: pitch, kernelRadiusSamples: R, fieldHalfExtentMm: { x: 0.1, y: 0.1 }, profileId: "pitch-sweep" }).value;
      const psf = { profile: profile.profile, focalLengthMm: 50, focus: { kind: "finite" as const, distanceM: 5 }, apertureFNumber: fNumber, signedDefocusImagePlaneMicrometers: 0 };
      const kernels = resolveLensPsfConvolutionKernels({ schemaVersion: "0.1.0", spectralWeights: [{ wavelengthNm: 780, weight: 1 }], psf,
        grid: { width: 1, height: 1, sitePitchMicrometers: { x: pitch, y: pitch }, opticalAxisSite: { x: 0.5, y: 0.5 } }, patchWidth: 1, patchHeight: 1,
        kernelRadius: R }).value;
      if (!kernels.exactSiteSampling || kernels.kernelRadius !== R) throw new Error(`pitch ${pitch} f/${fNumber}: not exactly site-sampled`);
      // Each tap of the resolved PSF lands, unsplit, on its own site (rows flip: the profile's +Y is up, sites' +y down).
      const resolved = resolveLensSampledPsf({ ...psf, fieldPointMm: { x: 0, y: 0 }, wavelengthNm: 780 }).value.kernel.normalizedIntensity, size = 2 * R + 1;
      for (let ky = 0; ky < size; ky++) for (let kx = 0; kx < size; kx++) {
        if (kernels.kernels[(2 * R - ky) * size + kx] !== resolved[ky * size + kx]) throw new Error(`pitch ${pitch} f/${fNumber}: tap (${kx}, ${ky}) moved`);
      }
    }
    // The sweep exercises the rounding case: (n·p)/p ≠ n for 413 of these taps.
    expect(roundingCases).toBeGreaterThan(300);
  }, scaledTimeout(120_000));

  it("passes the facade's first RAW tile at every app pitch and f-number with diffraction on", async () => {
    // The kernels are built before the first RAW tile; the capture is aborted once the second tile is requested.
    const run = async (pitch: number, fNumber: number): Promise<void> => {
      const controller = new AbortController();
      await expect(simulateCapture({ scene: { preset: "slanted-edge" }, lens: { fNumber, diffraction: "circular-aperture" },
        sensor: { pixelPitchMicrometers: pitch, spectralStepNanometers: 100 }, signal: controller.signal, output: { width: 32, height: 32 },
        onProgress: (p) => { if (p.stage === "raw" && p.completedTileCount >= 2) controller.abort(); } }), `pitch ${pitch} f/${fNumber}`).rejects.toThrow("simulateCapture aborted.");
    };
    for (const pitch of APP_PITCHES) for (const fNumber of F_NUMBERS) await run(pitch, fNumber);
    for (const [i, pitch] of RANDOM_PITCHES.entries()) await run(pitch, F_NUMBERS[i % F_NUMBERS.length]!);
  }, scaledTimeout(600_000));

  it("completes a capture at a pitch that failed in 2.2.0, with the truncated tail energy reported", async () => {
    const capture = await simulateCapture({ scene: { preset: "slanted-edge" }, lens: { fNumber: 16, diffraction: "circular-aperture" },
      sensor: { pixelPitchMicrometers: 0.6862745098039215, spectralStepNanometers: 100 }, output: { width: 32, height: 32 } });
    const diffraction = capture.request.diffraction!;
    expect(diffraction.execution).toBe("object-space-convolution");
    expect(diffraction.profile.kernelRadiusSamples).toBe(32);
    // At the 32-site cap the window ends inside the third dark ring: more tail energy than the 2–6 % of an uncapped default window,
    // listed per wavelength and stated in the explanation.
    expect(diffraction.profile.maximumTruncatedEnergyFraction).toBeCloseTo(0.093, 3);
    const assumption = capture.assumptions.find((a) => a.id === "lens.diffraction")!;
    expect((assumption.value as { truncatedEnergyByWavelength: unknown[] }).truncatedEnergyByWavelength).toHaveLength(4);
    expect(assumption.explanation).toContain("(capped at 32 sites; the third dark ring at the longest node needs 56)");
    expect(Array.from(capture.image.samples).every(Number.isFinite)).toBe(true);
  }, scaledTimeout(120_000));
});
