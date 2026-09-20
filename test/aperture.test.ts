import { describe, expect, it } from "vitest";

import { calculateIdealApertureGeometry } from "../src/index.js";

describe("ideal aperture geometry", () => {
  it("produces six sunstar rays for a six-blade aperture", () => {
    const result = calculateIdealApertureGeometry({
      bladeCount: 6,
      firstBladeEdgeAngleDegrees: 0
    });

    expect(result.provenance.kind).toBe("calculated");
    expect(result.value.sunstarRayCount).toBe(6);
    expect(result.value.sunstarRayAnglesDegrees).toEqual([
      30,
      90,
      150,
      210,
      270,
      330
    ]);
    expect(result.value.normalizedVertices).toHaveLength(6);
  });

  it("produces ten sunstar rays for a five-blade aperture", () => {
    const result = calculateIdealApertureGeometry({
      bladeCount: 5,
      firstBladeEdgeAngleDegrees: 0
    });

    expect(result.value.sunstarRayCount).toBe(10);
    expect(result.value.sunstarRayAnglesDegrees).toHaveLength(10);
  });

  it("rejects fewer than three blades", () => {
    expect(() =>
      calculateIdealApertureGeometry({
        bladeCount: 2
      })
    ).toThrow("bladeCount must be greater than or equal to 3.");
  });

  it("rejects non-finite aperture orientation", () => {
    expect(() =>
      calculateIdealApertureGeometry({
        bladeCount: 7,
        firstBladeEdgeAngleDegrees: Number.NaN
      })
    ).toThrow("firstBladeEdgeAngleDegrees must be finite.");
  });

  it("normalizes negative aperture orientation", () => {
    const result = calculateIdealApertureGeometry({
      bladeCount: 7,
      firstBladeEdgeAngleDegrees: -15
    });

    expect(
      result.value.sunstarRayAnglesDegrees.every(
        (angle) => angle >= 0 && angle < 360
      )
    ).toBe(true);
  });

  it("rejects unbounded blade counts before allocating geometry", () => {
    expect(() =>
      calculateIdealApertureGeometry({
        bladeCount: 1025
      })
    ).toThrow("bladeCount must be less than or equal to 1024.");
  });

  it("normalizes very large finite orientations before generating vertices", () => {
    const result = calculateIdealApertureGeometry({
      bladeCount: 7,
      firstBladeEdgeAngleDegrees: 1e308
    });

    for (const vertex of result.value.normalizedVertices) {
      expect(Number.isFinite(vertex.x)).toBe(true);
      expect(Number.isFinite(vertex.y)).toBe(true);
    }
    expect(
      result.value.sunstarRayAnglesDegrees.every(Number.isFinite)
    ).toBe(true);
  });

  it("rotates sunstar directions with the blade-edge orientation", () => {
    const base = calculateIdealApertureGeometry({
      bladeCount: 8,
      firstBladeEdgeAngleDegrees: 0
    });
    const rotated = calculateIdealApertureGeometry({
      bladeCount: 8,
      firstBladeEdgeAngleDegrees: 15
    });

    expect(rotated.value.sunstarRayAnglesDegrees[0]).toBeCloseTo(
      (base.value.sunstarRayAnglesDegrees[0] ?? 0) + 15,
      12
    );
  });
});
