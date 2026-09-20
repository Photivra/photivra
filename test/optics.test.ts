import { describe, expect, it } from "vitest";

import {
  calculateAiryDisk,
  calculateDefocusCircle,
  calculateDepthOfField
} from "../src/index.js";

describe("optics foundation", () => {
  it("calculates the first-zero Airy diameter for 550 nm at f/8", () => {
    const result = calculateAiryDisk({
      wavelengthNm: 550,
      aperture: 8
    });

    expect(result.value.firstZeroDiameterMicrometers).toBeCloseTo(10.736, 12);
  });

  it("calculates conventional thin-lens depth-of-field limits", () => {
    const result = calculateDepthOfField({
      focalLengthMm: 50,
      aperture: 8,
      focusDistanceM: 5,
      circleOfConfusionMm: 0.03
    });

    expect(result.value.hyperfocalDistanceM).toBeCloseTo(10.466666667, 9);
    expect(result.value.nearLimitM).toBeCloseTo(3.394594595, 9);
    expect(result.value.farLimitM).toBeCloseTo(9.486404834, 9);
  });

  it("produces zero geometric defocus on the focus plane", () => {
    const result = calculateDefocusCircle({
      focalLengthMm: 200,
      aperture: 2.8,
      focusDistanceM: 10,
      subjectDistanceM: 10
    });

    expect(result.value.diameterMm).toBeCloseTo(0, 12);
  });
});
