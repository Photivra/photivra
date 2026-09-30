import { describe, expect, it } from "vitest";

import {
  calculateFocusPlaneImageDistance,
  calculateThinLensImageDistance,
  parseFocusPlane
} from "../src/index.js";

describe("explicit focus-plane state", () => {
  it("round-trips finite and infinity states through JSON", () => {
    const finite = parseFocusPlane(
      JSON.parse(
        JSON.stringify({
          kind: "finite",
          distanceM: 5
        })
      )
    );
    const infinity = parseFocusPlane(
      JSON.parse(
        JSON.stringify({
          kind: "infinity"
        })
      )
    );

    expect(finite).toEqual({
      kind: "finite",
      distanceM: 5
    });
    expect(infinity).toEqual({
      kind: "infinity"
    });
  });

  it("preserves the existing finite thin-lens result exactly", () => {
    const existing = calculateThinLensImageDistance({
      focalLengthMm: 50,
      objectDistanceM: 5
    });
    const tagged = calculateFocusPlaneImageDistance({
      focalLengthMm: 50,
      focus: {
        kind: "finite",
        distanceM: 5
      }
    });

    expect(tagged).toEqual(existing);
  });

  it("represents optical infinity without a fabricated distance", () => {
    const result = calculateFocusPlaneImageDistance({
      focalLengthMm: 85,
      focus: {
        kind: "infinity"
      }
    });

    expect(result.value).toEqual({
      imageDistanceMm: 85,
      magnification: 0,
      infinityProjectionScale: 1
    });
    expect(result.provenance.model).toBe(
      "ideal-infinity-focus-image-distance"
    );
    expect(Number.isFinite(result.value.imageDistanceMm)).toBe(true);
    expect(Number.isFinite(result.value.magnification)).toBe(true);
    expect(Number.isFinite(result.value.infinityProjectionScale)).toBe(true);
  });

  it("fails closed on invalid finite focus and unknown/missing focus", () => {
    expect(() =>
      parseFocusPlane({
        kind: "finite",
        distanceM: 0
      })
    ).toThrow("finite number greater than zero");

    expect(() =>
      parseFocusPlane({
        kind: "infinity",
        distanceM: 1e9
      })
    ).toThrow("must not include distanceM");

    expect(() =>
      parseFocusPlane({})
    ).toThrow('must be "finite" or "infinity"');

    expect(() =>
      parseFocusPlane(undefined)
    ).toThrow("must be an object");
  });

  it("keeps finite focus constrained by the existing thin-lens physical boundary", () => {
    expect(() =>
      calculateFocusPlaneImageDistance({
        focalLengthMm: 100,
        focus: {
          kind: "finite",
          distanceM: 0.1
        }
      })
    ).toThrow("must place the object plane beyond the focal length");
  });
});
