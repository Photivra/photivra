import { describe, expect, it } from "vitest";

import {
  calculateDefocusCircle,
  calculateProjectedMotionBlur
} from "../src/index.js";
import { loadBasicReferenceFixture } from "./helpers/basic-reference-fixture.js";

const fixture = loadBasicReferenceFixture();

describe("basic reference scene derived variants", () => {
  it("produces the independently derived off-focus blur for a 4 m target", () => {
    const result = calculateDefocusCircle({
      focalLengthMm: fixture.lens.focalLengthMm,
      aperture: fixture.lens.aperture,
      focusDistanceM: fixture.focus.distanceM,
      subjectDistanceM: 4
    }).value;

    expect(result.diameterMm).toBeCloseTo(
      0.031565656565656484,
      12
    );
    expect(result.diameterMm).toBeGreaterThan(0);
  });

  it("produces the independently derived lateral motion for a 1 m/s target", () => {
    const result = calculateProjectedMotionBlur({
      focalLengthMm: fixture.lens.focalLengthMm,
      shutterSeconds: fixture.exposure.shutterSeconds,
      positionM: fixture.target.centerM,
      velocityMps: {
        x: 1,
        y: 0,
        z: 0
      },
      focusDistanceM: fixture.focus.distanceM,
      pixelPitchMicrometers: fixture.expected.sensor.pitchXMicrometers
    }).value;

    expect(result.deltaXMm).toBeCloseTo(
      0.08080808080808081,
      12
    );
    expect(result.deltaYMm).toBeCloseTo(0, 12);
    expect(result.distancePixels).toBeCloseTo(
      1.3468013468013469,
      12
    );
  });

  it("keeps a minus-one-EV illumination override exactly half the base Lambertian radiance", () => {
    const baseRadiance =
      (fixture.illumination.spectralIrradianceWattsPerSquareMeterNanometer *
        fixture.target.reflectance) /
      Math.PI;
    const darkerRadiance =
      ((fixture.illumination.spectralIrradianceWattsPerSquareMeterNanometer /
        2) *
        fixture.target.reflectance) /
      Math.PI;

    expect(darkerRadiance / baseRadiance).toBe(0.5);
    expect(Math.log2(darkerRadiance / baseRadiance)).toBe(-1);
  });
});
