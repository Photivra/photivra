// SPDX-License-Identifier: Apache-2.0
/*
 * #504: the automatic slowest preferred shutter for Auto ISO, derived from estimateCameraShakeBlur(): the exposure time at
 * which the stabilized on-axis shake blur v·hypot(tan(r·ω_yaw·t), tan(r·ω_pitch·t)) equals the blur budget, r = 2^−stops.
 * One axis has the closed form t = atan(budget / v) / (r·|ω|); the expected values below follow from it.
 */
import { describe, expect, it } from "vitest";

import {
  calculateThinLensImageDistance, estimateAutoIsoSlowestShutter, estimateCameraShakeBlur, GENERIC_HANDHELD_ANGULAR_VELOCITY_RAD_PER_SEC,
  InvalidConfigurationError, InvalidScientificInputError, type AutoIsoSlowestShutterEstimate, type CalculationResult, type EstimateAutoIsoSlowestShutterInput
} from "../src/index.js";

const omega = GENERIC_HANDHELD_ANGULAR_VELOCITY_RAD_PER_SEC;
const base: EstimateAutoIsoSlowestShutterInput = { focalLengthMm: 50, angularVelocityRadPerSec: { ...omega },
  blurBudget: { kind: "pixels", pixels: 1, pixelPitchMicrometers: 6 } };
const estimate = (overrides: Partial<EstimateAutoIsoSlowestShutterInput> = {}): CalculationResult<AutoIsoSlowestShutterEstimate> => estimateAutoIsoSlowestShutter({ ...base, ...overrides });
const twoAxis = { yaw: 0.05, pitch: -0.08 };

describe("the generic hand-shake default (#504)", () => {
  it("is 4.39 °/s on yaw, frozen", () => {
    expect(omega.yaw).toBeCloseTo(0.0766199, 6);
    expect(omega.yaw).toBe((4.39 * Math.PI) / 180);
    expect(omega.pitch).toBe(0);
    expect(Object.isFrozen(omega)).toBe(true);
  });
});

describe("estimateAutoIsoSlowestShutter (#504)", () => {
  it("one axis: the closed form, and the shake model's blur at it equals the budget", () => {
    const r = estimate();
    expect(r.provenance.kind).toBe("approximation");
    expect(r.value.derivedShutterSeconds).toBe(Math.atan(0.006 / 50) / omega.yaw);
    expect(r.value.derivedShutterSeconds).toBeCloseTo(1 / 638.5, 6);
    const blur = estimateCameraShakeBlur({ focalLengthMm: 50, shutterSeconds: r.value.derivedShutterSeconds, angularVelocityRadPerSec: { ...omega },
      stabilizationStopsEquivalent: 0, pixelPitchMicrometers: 6 }).value.stabilized;
    expect(blur.distanceMm).toBeCloseTo(0.006, 15);
    expect(r.value.blurAtDerivedShutterMm).toBe(blur.distanceMm);
    expect(r.value.blurAtShutterPixels).toBeCloseTo(1, 12);
    expect(r.value).toMatchObject({ fasterByStops: 0, projectionDistanceMm: 50, residualMotionFactor: 1, stabilizationStopsEquivalent: 0, blurBudgetPixels: 1,
      shutterResolution: { kind: "unconstrained", quantized: false, clamped: false } });
    expect(r.value.shutterSeconds).toBe(r.value.derivedShutterSeconds);
  });
  it("two axes: bisection lands on the budget", () => {
    const r = estimate({ angularVelocityRadPerSec: twoAxis, blurBudget: { kind: "pixels", pixels: 3, pixelPitchMicrometers: 4 } });
    expect(r.value.blurAtDerivedShutterMm / 0.012).toBeCloseTo(1, 12);
    // Small angles: t ≈ budget / (v·|ω|).
    expect(r.value.derivedShutterSeconds).toBeCloseTo(0.012 / (50 * Math.hypot(0.05, 0.08)), 7);
  });
  it("longer focal lengths give strictly faster thresholds", () => {
    const times = [14, 24, 35, 50, 85, 135, 200, 400, 800].map((focalLengthMm) => estimate({ focalLengthMm }).value.shutterSeconds);
    for (let i = 1; i < times.length; i++) expect(times[i]!).toBeLessThan(times[i - 1]!);
    // Close to inversely proportional (small angles): 400 mm is 8 times faster than 50 mm.
    expect(times[3]! / times[7]!).toBeCloseTo(8, 6);
  });
  it("a focus distance projects through the thin-lens image distance, a little faster", () => {
    const v = calculateThinLensImageDistance({ focalLengthMm: 50, objectDistanceM: 2 }).value.imageDistanceMm;
    const r = estimate({ focusDistanceM: 2 });
    expect(r.value.projectionDistanceMm).toBe(v);
    expect(r.value.derivedShutterSeconds).toBe(Math.atan(0.006 / v) / omega.yaw);
  });
  it("stabilization stops lengthen the threshold by exactly 2^stops", () => {
    for (const angularVelocityRadPerSec of [{ ...omega }, twoAxis]) {
      const t0 = estimate({ angularVelocityRadPerSec }).value.derivedShutterSeconds;
      for (const stops of [0.5, 1, 2, 3, 5]) {
        const t = estimate({ angularVelocityRadPerSec, stabilizationStopsEquivalent: stops }).value;
        expect(t.residualMotionFactor).toBe(2 ** -stops);
        expect(t.derivedShutterSeconds / t0).toBeCloseTo(2 ** stops, 9);
      }
    }
  });
  it("the bias moves the threshold by exact whole stops", () => {
    const derived = estimate().value.derivedShutterSeconds;
    for (const fasterByStops of [-2, -1, 0, 1, 2]) {
      const r = estimate({ fasterByStops }).value;
      expect(r.derivedShutterSeconds).toBe(derived);
      expect(r.biasedShutterSeconds).toBe(derived * 2 ** -fasterByStops);
      expect(Math.log2(derived / r.shutterSeconds)).toBe(fasterByStops);
    }
  });
  it("a blur budget as a fraction of the image diagonal", () => {
    const r = estimate({ blurBudget: { kind: "image-diagonal-fraction", fraction: 1 / 1500, imageWidthMm: 36, imageHeightMm: 24 } });
    expect(r.value.blurBudgetMm).toBeCloseTo(Math.hypot(36, 24) / 1500, 15);
    expect(r.value).not.toHaveProperty("blurBudgetPixels");
    expect(r.value.derivedShutterSeconds).toBe(Math.atan(r.value.blurBudgetMm / 50) / omega.yaw);
  });
  it("snaps to a discrete shutter grid, never longer, and holds at the ends", () => {
    const shutterCapability = { minimumSeconds: 1 / 4000, maximumSeconds: 30, settingGrid: { kind: "discrete-values" as const,
      values: [1 / 4000, 1 / 2000, 1 / 1000, 1 / 500, 1 / 250, 1 / 125, 1 / 60, 1 / 30, 1 / 15, 30] } };
    const snapped = estimate({ shutterCapability }).value;
    expect(snapped.shutterSeconds).toBe(1 / 1000);
    expect(snapped.shutterResolution).toEqual({ kind: "discrete", selectionPolicy: "not-longer-than-target", quantized: true, clamped: false });
    expect(snapped.blurAtShutterMm).toBeLessThan(snapped.blurBudgetMm);
    const fastest = estimate({ shutterCapability, focalLengthMm: 2000 }).value;
    expect(fastest.shutterSeconds).toBe(1 / 4000);
    expect(fastest.shutterResolution.clamped).toBe("minimum");
    expect(fastest.blurAtShutterMm).toBeGreaterThan(fastest.blurBudgetMm);
    const continuous = estimate({ shutterCapability: { minimumSeconds: 1 / 8000, maximumSeconds: 1 / 1000, settingGrid: { kind: "continuous-within-range" } } }).value;
    expect(continuous.shutterSeconds).toBe(1 / 1000);
    expect(continuous.shutterResolution.clamped).toBe("maximum");
  });
  it("no NaN or Infinity across a sweep", () => {
    for (const focalLengthMm of [8, 50, 600, 5000]) for (const stops of [0, 2, 4]) for (const fasterByStops of [-2, 2]) {
      const r = estimate({ focalLengthMm, stabilizationStopsEquivalent: stops, fasterByStops, angularVelocityRadPerSec: twoAxis });
      for (const value of Object.values(r.value)) if (typeof value === "number") expect(Number.isFinite(value)).toBe(true);
    }
  });
  const scientific: [string, Partial<EstimateAutoIsoSlowestShutterInput>][] = [
    ["no shake", { angularVelocityRadPerSec: { yaw: 0, pitch: 0 } }],
    ["a NaN angular velocity", { angularVelocityRadPerSec: { yaw: NaN, pitch: 0 } }],
    ["an infinite angular velocity", { angularVelocityRadPerSec: { yaw: Infinity, pitch: 0 } }],
    ["a zero focal length", { focalLengthMm: 0 }],
    ["negative stabilization", { stabilizationStopsEquivalent: -1 }],
    ["a fractional bias", { fasterByStops: 0.5 }],
    ["a bias beyond two stops", { fasterByStops: 3 }],
    ["a zero pixel budget", { blurBudget: { kind: "pixels", pixels: 0, pixelPitchMicrometers: 6 } }],
    ["a diagonal fraction of 1", { blurBudget: { kind: "image-diagonal-fraction", fraction: 1, imageWidthMm: 36, imageHeightMm: 24 } }],
    ["a quarter turn before stabilization", { angularVelocityRadPerSec: { yaw: 0.0766, pitch: 0 }, stabilizationStopsEquivalent: 20 }]
  ];
  for (const [name, overrides] of scientific) it(name + " fails with InvalidScientificInputError", () => {
    expect(() => estimate(overrides)).toThrow(InvalidScientificInputError);
  });
  const configuration: [string, unknown][] = [
    ["an unknown input field", { ...base, shutterSecondsHint: 1 }],
    ["an unknown angular axis", { ...base, angularVelocityRadPerSec: { yaw: 0.1, pitch: 0, roll: 1 } }],
    ["an unknown budget kind", { ...base, blurBudget: { kind: "arcseconds", value: 1 } }],
    ["an unknown budget field", { ...base, blurBudget: { kind: "pixels", pixels: 1, pixelPitchMicrometers: 6, pitchMm: 0.006 } }],
    ["a missing budget", { focalLengthMm: 50, angularVelocityRadPerSec: { ...omega } }]
  ];
  for (const [name, input] of configuration) it(name + " fails with InvalidConfigurationError", () => {
    expect(() => estimateAutoIsoSlowestShutter(input as EstimateAutoIsoSlowestShutterInput)).toThrow(InvalidConfigurationError);
  });
});
