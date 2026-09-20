import { describe, expect, it } from "vitest";

import { calculateThinLensImageDistance } from "../src/index.js";

describe("thin-lens image distance", () => {
  it("calculates focus extension for a 50 mm lens focused at 0.5 m", () => {
    const result = calculateThinLensImageDistance({
      focalLengthMm: 50,
      objectDistanceM: 0.5
    });

    expect(result.value.imageDistanceMm).toBeCloseTo(55.555555556, 9);
    expect(result.value.magnification).toBeCloseTo(1 / 9, 12);
    expect(result.value.infinityProjectionScale).toBeCloseTo(10 / 9, 12);
    expect(result.provenance.model).toBe(
      "gaussian-thin-lens-image-distance"
    );
  });

  it("approaches focal length at long focus distances", () => {
    const result = calculateThinLensImageDistance({
      focalLengthMm: 200,
      objectDistanceM: 22
    });

    expect(result.value.imageDistanceMm).toBeCloseTo(201.834862385, 9);
    expect(result.value.infinityProjectionScale - 1).toBeLessThan(0.01);
  });

  it("rejects object planes at or inside the focal length", () => {
    expect(() =>
      calculateThinLensImageDistance({
        focalLengthMm: 100,
        objectDistanceM: 0.1
      })
    ).toThrow("must place the object plane beyond the focal length");
  });
});
