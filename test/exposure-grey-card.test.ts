// SPDX-License-Identifier: Apache-2.0
/**
 * 2.14: exposure.greyCardDeviationStops, the deviation of the exposure used from the CIPA DC-004-2020 standard exposure of
 * an 18 % Lambertian grey card under the request's illuminance E (incident metering):
 * Δ_grey = log2(L_ref(N, t, S) / (0.18·E/π)), L_ref = 10·N²/(0.65·t·S) (S = 10/H, §3.2; H = 0.65·L·t/N², §5.5 (4)).
 *
 * Independent expectations: the closed form evaluated here; exactly 0 at the defaults, because the default illuminance is
 * defined as π·L_ref(f/8, 1/125 s, ISO 100)/0.18; and exact one-stop steps, because each factor of 2 in N², 1/t, S or E
 * is a factor of 2 inside the logarithm.
 */
import { describe, expect, it } from "vitest";
import { SIMULATE_CAPTURE_DEFAULT_ILLUMINANCE_LUX, simulateCapture, simulateDisplayView, type SimulateCaptureOptions, type SimulateCaptureResult } from "../src/index.js";

const output = { width: 4, height: 4 } as const;
const capture = (options: Partial<SimulateCaptureOptions>): Promise<SimulateCaptureResult> =>
  simulateCapture({ scene: { preset: "uniform" }, output, ...options } as SimulateCaptureOptions);
const grey = async (options: Partial<SimulateCaptureOptions>): Promise<number> => (await capture(options)).exposure.greyCardDeviationStops!;
/** log2 of an exact factor of 2 is exact; the closed form's other operations round, so steps agree to a few ulps of a stop. */
const STEP_TOLERANCE_STOPS = 1e-12;

describe("exposure.greyCardDeviationStops (2.14)", { timeout: 60_000 }, () => {
  it("is exactly 0 at the default settings and illuminance, in the capture and the display view", async () => {
    const options = { scene: { preset: "uniform" }, output } as SimulateCaptureOptions;
    const [c, view] = await Promise.all([simulateCapture(options), simulateDisplayView(options, { width: 2, height: 2 })]);
    expect(c.scene.illuminant.illuminanceLux).toBe(SIMULATE_CAPTURE_DEFAULT_ILLUMINANCE_LUX);
    expect(c.exposure.greyCardDeviationStops).toBe(0);
    expect(view.exposure.greyCardDeviationStops).toBe(0);
  });

  it("follows the closed form and moves exactly one stop per stop of shutter, aperture, ISO and illuminance", async () => {
    const base = await grey({});
    expect(await grey({ exposure: { shutterSeconds: 1 / 250 } }) - base).toBeCloseTo(1, 12);
    expect(Math.abs(await grey({ exposure: { shutterSeconds: 1 / 62.5 } }) - base + 1)).toBeLessThanOrEqual(STEP_TOLERANCE_STOPS);
    expect(Math.abs(await grey({ lens: { fNumber: 8 * Math.SQRT2 } }) - base - 1)).toBeLessThanOrEqual(STEP_TOLERANCE_STOPS);
    expect(Math.abs(await grey({ lens: { fNumber: 4 } }) - base + 2)).toBeLessThanOrEqual(STEP_TOLERANCE_STOPS);
    expect(Math.abs(await grey({ exposure: { iso: 200 } }) - base + 1)).toBeLessThanOrEqual(STEP_TOLERANCE_STOPS);
    expect(Math.abs(await grey({ exposure: { iso: 400 } }) - base + 2)).toBeLessThanOrEqual(STEP_TOLERANCE_STOPS);
    for (const k of [1, 2, 3]) {
      const lux = SIMULATE_CAPTURE_DEFAULT_ILLUMINANCE_LUX * 2 ** k;
      expect(Math.abs(await grey({ illuminanceLux: lux }) - base + k)).toBeLessThanOrEqual(STEP_TOLERANCE_STOPS);
    }
    // The closed form for marked settings at an arbitrary illuminance.
    const r = await capture({ lens: { fNumber: 11 }, exposure: { shutterSeconds: 1 / 60, iso: 400 }, illuminanceLux: 3200 });
    const reference = 10 * 11 ** 2 / (0.65 * (1 / 60) * 400);
    expect(r.exposure.greyCardDeviationStops!).toBeCloseTo(Math.log2(reference / (0.18 * 3200 / Math.PI)), 12);
  });

  it("does not depend on the scene's reflectances, unlike the metered deviation", async () => {
    const scenes = [{ preset: "uniform", reflectance: 0.05 }, { preset: "uniform", reflectance: 0.9 }, { preset: "siemens-star", cycles: 24 },
      { preset: "patches", patches: [{ patchId: "a", reflectance: 0.9 }, { patchId: "b", reflectance: { kind: "tabulated", samples: [
        { wavelengthNanometers: 380, value: 0.1 }, { wavelengthNanometers: 780, value: 0.8 }] } }] }] as const;
    const results = await Promise.all(scenes.map((scene) => capture({ scene, lens: { fNumber: 5.6 }, illuminanceLux: 4000 } as Partial<SimulateCaptureOptions>)));
    for (const r of results) expect(r.exposure.greyCardDeviationStops).toBe(results[0]!.exposure.greyCardDeviationStops);
    expect(new Set(results.map((r) => r.exposure.standardExposureDeviationStops)).size).toBe(results.length);
    // With chartSize the surround enters the meter, not the grey card.
    const sized = await capture({ scene: { preset: "uniform", reflectance: 0.9 }, chartSize: { widthM: 0.5, surroundReflectance: 0.05 }, lens: { fNumber: 5.6 }, illuminanceLux: 4000 });
    expect(sized.exposure.greyCardDeviationStops).toBe(results[0]!.exposure.greyCardDeviationStops);
  });

  it("reports where an automatic mode's scene-metered exposure sits against the grey card; the modes are unchanged", async () => {
    // Aperture priority meters the scene: a 90 % white field is rendered at the standard exposure for its own luminance,
    // which the grey card reads as log2(0.9/0.18) ≈ 2.32 stops under (the meter's quantization aside).
    const white = await capture({ scene: { preset: "uniform", reflectance: 0.9 }, exposure: { mode: "aperture-priority" } });
    const { fNumber, shutterSeconds, iso } = white.exposure.settings;
    const expected = Math.log2(10 * fNumber ** 2 / (0.65 * shutterSeconds * iso) / (0.18 * white.scene.illuminant.illuminanceLux / Math.PI));
    expect(white.exposure.greyCardDeviationStops!).toBeCloseTo(expected, 12);
    expect(white.exposure.greyCardDeviationStops! - white.exposure.standardExposureDeviationStops!).toBeCloseTo(Math.log2(0.9 / 0.18), 3);
    for (const mode of ["shutter-priority", "program"] as const) {
      const r = await capture({ exposure: { mode, iso: "auto" }, illuminanceLux: 3000 });
      const s = r.exposure.settings;
      expect(r.exposure.greyCardDeviationStops!).toBeCloseTo(Math.log2(10 * s.fNumber ** 2 / (0.65 * s.shutterSeconds * s.iso) / (0.18 * 3000 / Math.PI)), 12);
    }
  });

  it("is null for a radiance scene, whose radiance does not follow the illuminance", async () => {
    const radiance = await capture({ scene: { kind: "radiance-function", sceneId: "glow", evaluate: () => 0.01 } } as Partial<SimulateCaptureOptions>);
    expect(radiance.exposure.greyCardDeviationStops).toBeNull();
    const black = await capture({ scene: { kind: "reflectance-function", sceneId: "black", evaluate: () => 0 } } as Partial<SimulateCaptureOptions>);
    expect(black.exposure.standardExposureDeviationStops).toBeNull();
    expect(black.exposure.greyCardDeviationStops).toBe(0);
  });
});
