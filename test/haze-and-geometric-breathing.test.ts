// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import {
  calculateAtmosphericHaze,
  calculateExtinctionFromVisibility,
  calculateFieldOfView,
  calculateFocusBreathingFieldOfView,
  calculateGeometricFocusBreathing,
  calculateThinLensImageDistance
} from "../src/index.js";

const extinction = {
  referenceWavelengthNm: 550,
  rayleighExtinctionPerMeter: 1.2e-5,
  aerosolExtinctionPerMeter: 1e-4,
  angstromExponent: 1.3
};

describe("Koschmieder atmospheric haze", () => {
  it("evaluates L = L0 t + L_air (1 - t) with Rayleigh and Angstrom extinction", () => {
    const result = calculateAtmosphericHaze({ pathLengthM: 5000, wavelengthNm: 450, sceneRadiance: 10, airlightRadiance: 40, extinction }).value;
    const beta = 1.2e-5 * (450 / 550) ** -4 + 1e-4 * (450 / 550) ** -1.3;
    const t = Math.exp(-beta * 5000);
    expect(result.extinctionPerMeter).toBeCloseTo(beta, 18);
    expect(result.transmittance).toBeCloseTo(t, 14);
    expect(result.hazedRadiance).toBeCloseTo(10 * t + 40 * (1 - t), 12);
    expect(result.attenuatedSceneRadiance + result.airlightContribution).toBe(result.hazedRadiance);
  });

  it("has the right limits: no haze at zero distance, airlight at infinite optical depth", () => {
    expect(calculateAtmosphericHaze({ pathLengthM: 0, wavelengthNm: 550, sceneRadiance: 7, airlightRadiance: 40, extinction }).value.hazedRadiance).toBe(7);
    const far = calculateAtmosphericHaze({ pathLengthM: 1e7, wavelengthNm: 550, sceneRadiance: 7, airlightRadiance: 40, extinction }).value;
    expect(far.hazedRadiance).toBeCloseTo(40, 10);
    // An object as bright as the horizon is unchanged at every distance.
    expect(calculateAtmosphericHaze({ pathLengthM: 3000, wavelengthNm: 500, sceneRadiance: 40, airlightRadiance: 40, extinction }).value.hazedRadiance).toBeCloseTo(40, 12);
  });

  it("scatters blue more strongly (Rayleigh lambda^-4) and makes distant dark objects bluer", () => {
    const pure = { ...extinction, aerosolExtinctionPerMeter: 0 };
    const blue = calculateAtmosphericHaze({ pathLengthM: 1000, wavelengthNm: 450, sceneRadiance: 0, airlightRadiance: 1, extinction: pure }).value;
    const red = calculateAtmosphericHaze({ pathLengthM: 1000, wavelengthNm: 650, sceneRadiance: 0, airlightRadiance: 1, extinction: pure }).value;
    expect(blue.extinctionPerMeter / red.extinctionPerMeter).toBeCloseTo((650 / 450) ** 4, 12);
    expect(blue.hazedRadiance).toBeGreaterThan(red.hazedRadiance);
    // Angstrom exponent 0 is wavelength-neutral (grey haze).
    const grey = { ...extinction, rayleighExtinctionPerMeter: 0, angstromExponent: 0 };
    expect(calculateAtmosphericHaze({ pathLengthM: 100, wavelengthNm: 400, sceneRadiance: 1, airlightRadiance: 0, extinction: grey }).value.transmittance)
      .toBe(calculateAtmosphericHaze({ pathLengthM: 100, wavelengthNm: 700, sceneRadiance: 1, airlightRadiance: 0, extinction: grey }).value.transmittance);
  });

  it("converts meteorological visibility with Koschmieder's relation", () => {
    expect(calculateExtinctionFromVisibility({ visibilityM: 10_000 }).value.extinctionPerMeter).toBeCloseTo(3.912023005428146 / 10_000, 15);
    expect(calculateExtinctionFromVisibility({ visibilityM: 10_000, contrastThreshold: 0.05 }).value.extinctionPerMeter).toBeCloseTo(-Math.log(0.05) / 10_000, 15);
    // A black target at the visibility distance has apparent contrast equal to the threshold.
    const beta = calculateExtinctionFromVisibility({ visibilityM: 8000 }).value.extinctionPerMeter;
    const contrast = calculateAtmosphericHaze({ pathLengthM: 8000, wavelengthNm: 550, sceneRadiance: 0, airlightRadiance: 1, extinction: { referenceWavelengthNm: 550, rayleighExtinctionPerMeter: 0, aerosolExtinctionPerMeter: beta, angstromExponent: 0 } }).value.contrastTransmittance;
    expect(contrast).toBeCloseTo(0.02, 12);
  });

  it("validates inputs", () => {
    expect(() => calculateAtmosphericHaze({ pathLengthM: -1, wavelengthNm: 550, sceneRadiance: 1, airlightRadiance: 1, extinction })).toThrow(/pathLengthM/);
    expect(() => calculateAtmosphericHaze({ pathLengthM: 1, wavelengthNm: 550, sceneRadiance: 1, airlightRadiance: 1, extinction: { ...extinction, angstromExponent: 9 } })).toThrow(/angstromExponent/);
    expect(() => calculateAtmosphericHaze({ pathLengthM: 1, wavelengthNm: 550, sceneRadiance: 1, airlightRadiance: 1, extinction: null as never })).toThrow(/object/);
    expect(() => calculateExtinctionFromVisibility({ visibilityM: 1, contrastThreshold: 1 })).toThrow(/\(0, 1\)/);
    expect(() => calculateAtmosphericHaze(null as never)).toThrow(/object/);
  });
});

describe("geometric (unit-focus / internal-focus) focus breathing", () => {
  it("unit focus reproduces the thin-lens focus-aware projection and declared scale 1", () => {
    const result = calculateGeometricFocusBreathing({ focalLengthMm: 50, subjectToSensorDistanceM: 1, sensorDimensionMm: 36, focusingMethod: "unit-focus" }).value;
    expect(result.objectDistanceMm + result.imageDistanceMm).toBeCloseTo(1000, 10);
    const thin = calculateThinLensImageDistance({ focalLengthMm: 50, objectDistanceM: result.objectDistanceMm / 1000 }).value;
    expect(result.imageDistanceMm).toBeCloseTo(thin.imageDistanceMm, 10);
    expect(result.magnification).toBeCloseTo(thin.magnification, 12);
    expect(result.equivalentBreathingProjectionScale).toBe(1);
    expect(result.fieldOfViewDegrees).toBeCloseTo(calculateFieldOfView({ focalLengthMm: 50, sensorDimensionMm: 36, focusDistanceM: result.objectDistanceMm / 1000 }).value.degrees, 10);
    expect(result.deltaDegrees).toBeLessThan(0);
    // The 1:1 limit: L = 4 f gives v = u = 2 f and magnification 1.
    const macro = calculateGeometricFocusBreathing({ focalLengthMm: 50, subjectToSensorDistanceM: 0.2, sensorDimensionMm: 36, focusingMethod: "unit-focus" }).value;
    expect(macro.imageDistanceMm).toBeCloseTo(100, 9);
    expect(macro.magnification).toBeCloseTo(1, 9);
    expect(() => calculateGeometricFocusBreathing({ focalLengthMm: 50, subjectToSensorDistanceM: 0.19, sensorDimensionMm: 36, focusingMethod: "unit-focus" })).toThrow(/4 x focal length/);
  });

  it("accounts for the principal-plane separation (hiatus)", () => {
    const thin = calculateGeometricFocusBreathing({ focalLengthMm: 50, subjectToSensorDistanceM: 1, sensorDimensionMm: 36, focusingMethod: "unit-focus" }).value;
    const thick = calculateGeometricFocusBreathing({ focalLengthMm: 50, subjectToSensorDistanceM: 1.01, sensorDimensionMm: 36, focusingMethod: "unit-focus", principalPlaneSeparationMm: 10 }).value;
    expect(thick.imageDistanceMm).toBeCloseTo(thin.imageDistanceMm, 9);
  });

  it("idealised internal focus keeps the angular field and shortens the focal length", () => {
    const result = calculateGeometricFocusBreathing({ focalLengthMm: 100, subjectToSensorDistanceM: 1, sensorDimensionMm: 36, focusingMethod: "fixed-image-distance-internal-focus" }).value;
    expect(result.imageDistanceMm).toBe(100);
    expect(result.objectDistanceMm).toBeCloseTo(900, 10);
    expect(result.effectiveFocalLengthMm).toBeCloseTo(90, 10);
    expect(1 / result.objectDistanceMm + 1 / result.imageDistanceMm).toBeCloseTo(1 / result.effectiveFocalLengthMm, 15);
    expect(result.deltaDegrees).toBe(0);
    expect(result.magnification).toBeCloseTo(100 / 900, 14);
    // The bridge scale reproduces the result through the declared-scale model.
    const declared = calculateFocusBreathingFieldOfView({ focalLengthMm: 100, focusDistanceM: result.objectDistanceMm / 1000, sensorDimensionMm: 36, breathingProjectionScale: result.equivalentBreathingProjectionScale }).value;
    expect(declared.effectiveDegrees).toBeCloseTo(result.fieldOfViewDegrees, 10);
    expect(result.equivalentBreathingProjectionScale).toBeLessThan(1);
  });

  it("validates inputs", () => {
    expect(() => calculateGeometricFocusBreathing({ focalLengthMm: 50, subjectToSensorDistanceM: 1, sensorDimensionMm: 36, focusingMethod: "rear-focus" as never })).toThrow(/focusingMethod/);
    expect(() => calculateGeometricFocusBreathing({ focalLengthMm: 50, subjectToSensorDistanceM: 0.09, sensorDimensionMm: 36, focusingMethod: "fixed-image-distance-internal-focus" })).toThrow(/focal length/);
    expect(() => calculateGeometricFocusBreathing({ focalLengthMm: 50, subjectToSensorDistanceM: 1, sensorDimensionMm: 36, focusingMethod: "unit-focus", principalPlaneSeparationMm: Number.NaN })).toThrow(/finite/);
    expect(() => calculateGeometricFocusBreathing(null as never)).toThrow(/object/);
  });
});
