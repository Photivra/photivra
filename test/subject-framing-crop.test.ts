import { describe, expect, it } from "vitest";

import { calculateSubjectFramingCrop } from "../src/index.js";

describe("subject framing crop", () => {
  it("calculates a same-aspect crop for a target subject fraction", () => {
    const result = calculateSubjectFramingCrop({
      pixelWidth: 6000,
      pixelHeight: 4000,
      subjectHeightPixels: 1000,
      targetSubjectHeightFraction: 0.5
    });

    expect(result.value.cropFactor).toBeCloseTo(2, 12);
    expect(result.value.pixelWidth).toBe(3000);
    expect(result.value.pixelHeight).toBe(2000);
    expect(result.value.megapixels).toBeCloseTo(6, 12);
    expect(result.value.subjectHeightFraction).toBeCloseTo(0.5, 12);
    expect(result.value.subjectClipped).toBe(false);
  });

  it("rejects target subject fractions above 1", () => {
    expect(() =>
      calculateSubjectFramingCrop({
        pixelWidth: 6000,
        pixelHeight: 4000,
        subjectHeightPixels: 1000,
        targetSubjectHeightFraction: 1.1
      })
    ).toThrow("targetSubjectHeightFraction must be less than or equal to 1.");
  });

  it("does not enlarge when the subject already exceeds the target fraction", () => {
    const result = calculateSubjectFramingCrop({
      pixelWidth: 6000,
      pixelHeight: 4000,
      subjectHeightPixels: 2400,
      targetSubjectHeightFraction: 0.5
    });

    expect(result.value.cropFactor).toBe(1);
    expect(result.value.cropped).toBe(false);
    expect(result.value.subjectHeightFraction).toBeCloseTo(0.6, 12);
    expect(result.value.subjectClipped).toBe(false);
  });

  it("reports overfill instead of clamping the subject fraction to 1", () => {
    const result = calculateSubjectFramingCrop({
      pixelWidth: 3000,
      pixelHeight: 2000,
      subjectHeightPixels: 2800,
      targetSubjectHeightFraction: 0.9
    });

    expect(result.value.cropFactor).toBe(1);
    expect(result.value.cropped).toBe(false);
    expect(result.value.subjectHeightFraction).toBeCloseTo(1.4, 12);
    expect(result.value.subjectClipped).toBe(true);
  });
});
