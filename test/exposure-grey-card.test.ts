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
import { InvalidConfigurationError, SIMULATE_CAPTURE_DEFAULT_ILLUMINANCE_LUX, simulateCapture, simulateDisplayView, simulateIdealReference, type SimulateCaptureOptions,
  type SimulateCaptureResult } from "../src/index.js";

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

/**
 * 2.14 (owner decision): exposure.metering "grey-card" makes the automatic modes meter the 18 % grey card under the
 * scene's illuminance, so they land on greyCardDeviationStops = 0 up to their steps and limits. The default stays the
 * scene-average meter.
 */
describe("exposure.metering (2.14)", { timeout: 120_000 }, () => {
  /** A bright chart: a 90 % white field with a dark star, which the scene meter reads well above the grey card. */
  const scene = { preset: "siemens-star", cycles: 24, lightReflectance: 0.9, backgroundReflectance: 0.9 } as const;
  const run = (exposure: NonNullable<SimulateCaptureOptions["exposure"]>, illuminanceLux?: number): Promise<SimulateCaptureResult> =>
    capture({ scene, exposure, ...(illuminanceLux === undefined ? {} : { illuminanceLux }) });

  it("defaults to the scene average, reports it, and an explicit scene-average is the same capture", async () => {
    const omitted = await run({ mode: "aperture-priority" }), explicit = await run({ mode: "aperture-priority", metering: "scene-average" });
    expect(omitted.exposure.metering).toBe("scene-average");
    expect(explicit.exposure.metering).toBe("scene-average");
    expect(Buffer.from(explicit.image.samples).equals(Buffer.from(omitted.image.samples))).toBe(true);
    expect(explicit.exposure.settings).toEqual(omitted.exposure.settings);
    expect(explicit.assumptions).toEqual(omitted.assumptions);
    // The scene meter exposes this bright chart darker than the grey card.
    expect(omitted.exposure.greyCardDeviationStops!).toBeGreaterThan(1);
  });

  it("rejects unknown metering and a radiance scene with grey-card metering", async () => {
    for (const metering of ["spot", "incident", "", 18, null]) {
      await expect(run({ mode: "program", metering: metering as never })).rejects.toThrow(InvalidConfigurationError);
    }
    await expect(capture({ scene: { kind: "radiance-function", sceneId: "glow", evaluate: () => 0.01 }, exposure: { mode: "program", metering: "grey-card" } } as Partial<SimulateCaptureOptions>))
      .rejects.toThrow(InvalidConfigurationError);
  });

  it("each automatic mode lands on a grey-card deviation of 0 when nothing limits it", async () => {
    // 10 000 lx keeps every mode inside its ranges (shutter priority at 1/125 s needs f/5.5; at 5000 lx it would need about
    // f/3.9 and stop at the lens's f/4, 0.10 stop under).
    for (const lux of [SIMULATE_CAPTURE_DEFAULT_ILLUMINANCE_LUX, 10_000]) {
      for (const mode of ["aperture-priority", "shutter-priority", "program"] as const) {
        const r = await run({ mode, metering: "grey-card" }, lux);
        expect(r.exposure.metering).toBe("grey-card");
        // The resolvers set a continuous shutter or aperture: only rounding is left.
        expect(Math.abs(r.exposure.greyCardDeviationStops!), mode + " at " + lux + " lx").toBeLessThan(1e-6);
        expect(r.assumptions.find((a) => a.id === "exposure.meteringSource")?.value).toMatchObject({ metering: "grey-card", greyCardReflectance: 0.18 });
      }
    }
    // Compensation moves it by exactly the compensation.
    const plus = await run({ mode: "aperture-priority", metering: "grey-card", compensationStops: 2 / 3 }, 5000);
    expect(plus.exposure.greyCardDeviationStops!).toBeCloseTo(-2 / 3, 6);
  });

  it("does not depend on the scene's reflectances", async () => {
    const settings = await Promise.all([0.05, 0.18, 0.9].map(async (reflectance) =>
      (await capture({ scene: { preset: "uniform", reflectance }, exposure: { mode: "aperture-priority", metering: "grey-card" }, illuminanceLux: 5000 })).exposure.settings));
    for (const s of settings) expect(s).toEqual(settings[0]);
  });

  it("Auto ISO: the deviation left is the report's residual, within half an ISO step, or a reported limit", async () => {
    const cases: [NonNullable<SimulateCaptureOptions["exposure"]>, number][] = [
      [{ mode: "aperture-priority", iso: "auto", metering: "grey-card", autoIso: { slowestPreferredShutterSeconds: 1 / 60 } }, 300],
      [{ mode: "shutter-priority", iso: "auto", metering: "grey-card" }, 300],
      [{ mode: "program", iso: "auto", metering: "grey-card" }, 40],
      [{ mode: "manual", iso: "auto", metering: "grey-card" }, 300],
      [{ mode: "manual", iso: "auto", metering: "grey-card" }, 40]
    ];
    for (const [exposure, lux] of cases) {
      const r = await run(exposure, lux), report = r.exposure.autoIso!;
      expect(r.exposure.isoControl).toBe("automatic");
      expect(Math.abs(r.exposure.greyCardDeviationStops! - report.residualStops), exposure.mode + " at " + lux + " lx").toBeLessThan(1e-9);
      if (report.limitingConstraint === "iso-grid-quantization") expect(Math.abs(report.residualStops)).toBeLessThanOrEqual(0.5);
      else if (report.limitingConstraint === "none") expect(Math.abs(report.residualStops)).toBeLessThan(1e-9);
    }
    // At 40 lx, ISO 25 600 is not enough for f/8 at 1/125 s: the residual is the limit, and the report names it.
    const limited = await run({ mode: "manual", iso: "auto", metering: "grey-card" }, 40);
    expect(limited.exposure.autoIso!.limitingConstraint).toBe("iso-maximum");
    expect(limited.exposure.greyCardDeviationStops!).toBeGreaterThan(0.5);
  });

  it("the display view and the ideal reference resolve the same settings", async () => {
    const options = { scene, output, exposure: { mode: "program", iso: "auto", metering: "grey-card" }, illuminanceLux: 300 } as SimulateCaptureOptions;
    const [c, view, ideal] = await Promise.all([simulateCapture(options), simulateDisplayView(options, { width: 2, height: 2 }), simulateIdealReference(options)]);
    expect(view.exposure.settings).toEqual(c.exposure.settings);
    expect(ideal.exposure.settings).toEqual(c.exposure.settings);
    expect(view.exposure.metering).toBe("grey-card");
    expect(view.exposure.greyCardDeviationStops).toBe(c.exposure.greyCardDeviationStops);
  });
});
