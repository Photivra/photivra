// SPDX-License-Identifier: Apache-2.0
/**
 * exposure.standardExposureIlluminanceLux: the illuminance at which the settings used give the CIPA DC-004-2020 standard
 * exposure, E·L_ref(N, t, S)/L = E·2^Δ. A reflective scene's metered luminance L is proportional to illuminanceLux (its
 * radiance is reflectance × k(E)·S(λ)/π, k linear in E), so re-running at that illuminance gives Δ = 0. The metering
 * quadrature (16 × 16 zones, 5 nm luminance sums) is the same at both illuminances and cancels; only rounding is left
 * (|Δ| below 1e-12 stops here, tested at 1e-9).
 */
import { describe, expect, it } from "vitest";
import { simulateCapture, simulateDisplayView, type SimulateCaptureOptions, type SimulateCaptureResult } from "../src/index.js";

const output = { width: 4, height: 4 } as const;
const capture = (options: Partial<SimulateCaptureOptions>): Promise<SimulateCaptureResult> =>
  simulateCapture({ scene: { preset: "uniform" }, output, ...options } as SimulateCaptureOptions);
const TOLERANCE_STOPS = 1e-9;

describe("exposure.standardExposureIlluminanceLux", { timeout: 60_000 }, () => {
  it("is E·2^Δ, and re-running at it gives the standard exposure: the default request", async () => {
    const first = await capture({ lens: { fNumber: 11 } });
    const lux = first.exposure.standardExposureIlluminanceLux!;
    expect(Number.isFinite(lux)).toBe(true);
    expect(lux).toBeCloseTo(first.scene.illuminant.illuminanceLux * 2 ** first.exposure.standardExposureDeviationStops!, 6);
    const again = await capture({ lens: { fNumber: 11 }, illuminanceLux: lux });
    expect(Math.abs(again.exposure.standardExposureDeviationStops!)).toBeLessThan(TOLERANCE_STOPS);
    expect(again.exposure.standardExposureIlluminanceLux!).toBeCloseTo(lux, 6);
    // The defaults themselves: the 18 % grey at the default illuminance is at the standard exposure (to the quadrature, ~1e-5).
    const defaults = await capture({});
    expect(defaults.exposure.standardExposureIlluminanceLux! / defaults.scene.illuminant.illuminanceLux).toBeCloseTo(1, 4);
  });

  it("re-running a chart preset at it gives the standard exposure", async () => {
    const scene = { preset: "siemens-star", cycles: 24 } as const;
    const first = await capture({ scene, illuminant: { kind: "planckian", temperatureKelvin: 3200 }, illuminanceLux: 5000 });
    expect(first.exposure.standardExposureDeviationStops!).toBeGreaterThan(1);
    const lux = first.exposure.standardExposureIlluminanceLux!;
    expect(lux).toBeCloseTo(5000 * 2 ** first.exposure.standardExposureDeviationStops!, 6);
    const again = await capture({ scene, illuminant: { kind: "planckian", temperatureKelvin: 3200 }, illuminanceLux: lux });
    expect(Math.abs(again.exposure.standardExposureDeviationStops!)).toBeLessThan(TOLERANCE_STOPS);
  });

  it("is that of the settings used in every mode, and the display view reports it", async () => {
    const auto = await capture({ exposure: { mode: "aperture-priority", compensationStops: 1 }, illuminanceLux: 3000 });
    const { fNumber, shutterSeconds, iso } = auto.exposure.settings;
    const manual = await capture({ lens: { fNumber }, exposure: { shutterSeconds, iso }, illuminanceLux: 3000 });
    expect(auto.exposure.standardExposureIlluminanceLux!).toBeCloseTo(manual.exposure.standardExposureIlluminanceLux!, 6);
    for (const mode of ["shutter-priority", "program"] as const) {
      const r = await capture({ exposure: { mode, compensationStops: -1 / 3 }, illuminanceLux: 3000 });
      expect(r.exposure.standardExposureIlluminanceLux!).toBeCloseTo(3000 * 2 ** r.exposure.standardExposureDeviationStops!, 6);
    }
    const options = { scene: { preset: "uniform" }, output, lens: { fNumber: 11 } } as SimulateCaptureOptions;
    const [c, view] = await Promise.all([simulateCapture(options), simulateDisplayView(options, { width: 2, height: 2 })]);
    expect(view.exposure.standardExposureIlluminanceLux).toBe(c.exposure.standardExposureIlluminanceLux);
  });

  it("is null for a black scene and for a radiance scene, whose radiance does not follow the illuminance", async () => {
    const black = await capture({ scene: { kind: "reflectance-function", sceneId: "black", evaluate: () => 0 } } as Partial<SimulateCaptureOptions>);
    expect(black.exposure.standardExposureIlluminanceLux).toBeNull();
    const radiance = await capture({ scene: { kind: "radiance-function", sceneId: "glow", evaluate: () => 0.01 } } as Partial<SimulateCaptureOptions>);
    expect(radiance.exposure.standardExposureDeviationStops).not.toBeNull();
    expect(radiance.exposure.standardExposureIlluminanceLux).toBeNull();
    const reflectance = await capture({ scene: { kind: "reflectance-function", sceneId: "grey", evaluate: () => 0.5 } } as Partial<SimulateCaptureOptions>);
    expect(Number.isFinite(reflectance.exposure.standardExposureIlluminanceLux)).toBe(true);
  });
});
