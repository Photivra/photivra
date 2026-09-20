import { describe, expect, it } from "vitest";

import {
  estimateEquivalentViewingCircleOfConfusion
} from "../src/index.js";

describe("equivalent-viewing circle of confusion", () => {
  it("returns the reference criterion for the reference sensor", () => {
    const result = estimateEquivalentViewingCircleOfConfusion({
      sensorWidthMm: 36,
      sensorHeightMm: 24,
      referenceSensorWidthMm: 36,
      referenceSensorHeightMm: 24,
      referenceCircleOfConfusionMm: 0.03
    });

    expect(result.provenance.kind).toBe("approximation");
    expect(result.value.scaleFactor).toBeCloseTo(1, 12);
    expect(result.value.circleOfConfusionMm).toBeCloseTo(0.03, 12);
  });

  it("scales the criterion with sensor diagonal", () => {
    const result = estimateEquivalentViewingCircleOfConfusion({
      sensorWidthMm: 18,
      sensorHeightMm: 12,
      referenceSensorWidthMm: 36,
      referenceSensorHeightMm: 24,
      referenceCircleOfConfusionMm: 0.03
    });

    expect(result.value.scaleFactor).toBeCloseTo(0.5, 12);
    expect(result.value.circleOfConfusionMm).toBeCloseTo(0.015, 12);
  });
});
