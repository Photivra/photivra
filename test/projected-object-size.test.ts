import { describe, expect, it } from "vitest";

import { calculateProjectedObjectSize } from "../src/index.js";

describe("projected object size", () => {
  it("calculates pixels on a 1.85 m subject at 22 m with a 200 mm lens", () => {
    const result = calculateProjectedObjectSize({
      focalLengthMm: 200,
      objectWidthM: 0.7,
      objectHeightM: 1.85,
      distanceM: 22,
      pixelPitchMicrometers: 6
    });

    expect(result.value.heightMm).toBeCloseTo(16.818181818, 9);
    expect(result.value.heightPixels).toBeCloseTo(2803.03030303, 8);
  });

  it("returns physical sensor dimensions without pixel output when pitch is omitted", () => {
    const result = calculateProjectedObjectSize({
      focalLengthMm: 50,
      objectWidthM: 1,
      objectHeightM: 2,
      distanceM: 10
    });

    expect(result.value.widthMm).toBeCloseTo(5, 12);
    expect(result.value.heightMm).toBeCloseTo(10, 12);
    expect(result.value.widthPixels).toBeUndefined();
    expect(result.value.heightPixels).toBeUndefined();
  });

  it("uses the focus-plane image distance for near-field sensor sampling", () => {
    const result = calculateProjectedObjectSize({
      focalLengthMm: 200,
      objectWidthM: 0.7,
      objectHeightM: 1.85,
      distanceM: 22,
      focusDistanceM: 22,
      pixelPitchMicrometers: 6
    });

    expect(result.value.projectionDistanceMm).toBeCloseTo(
      201.834862385,
      9
    );
    expect(result.value.heightMm).toBeCloseTo(16.972477064, 9);
    expect(result.value.heightPixels).toBeCloseTo(2828.74617737, 8);
    expect(result.provenance.model).toBe(
      "focus-aware-thin-lens-object-size"
    );
  });

  it("keeps distant focus-aware sampling within one percent of pinhole", () => {
    const pinhole = calculateProjectedObjectSize({
      focalLengthMm: 200,
      objectWidthM: 0.7,
      objectHeightM: 1.85,
      distanceM: 22,
      pixelPitchMicrometers: 6
    }).value.heightPixels ?? 0;
    const focused = calculateProjectedObjectSize({
      focalLengthMm: 200,
      objectWidthM: 0.7,
      objectHeightM: 1.85,
      distanceM: 22,
      focusDistanceM: 22,
      pixelPitchMicrometers: 6
    }).value.heightPixels ?? 0;

    expect(Math.abs(focused - pinhole) / pinhole).toBeLessThan(0.01);
  });

  it("scales linearly with focal length for a fixed scene", () => {
    const wide = calculateProjectedObjectSize({
      focalLengthMm: 24,
      objectWidthM: 0.7,
      objectHeightM: 1.85,
      distanceM: 22,
      pixelPitchMicrometers: 6
    });
    const tele = calculateProjectedObjectSize({
      focalLengthMm: 600,
      objectWidthM: 0.7,
      objectHeightM: 1.85,
      distanceM: 22,
      pixelPitchMicrometers: 6
    });

    expect(
      (tele.value.heightPixels ?? 0) / (wide.value.heightPixels ?? 1)
    ).toBeCloseTo(25, 12);
  });
});
