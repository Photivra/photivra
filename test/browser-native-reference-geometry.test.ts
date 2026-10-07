// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  BROWSER_NATIVE_REFERENCE_GEOMETRY_VERSION,
  intersectBrowserNativeReferenceGeometry,
  prepareBrowserNativeReferenceGeometry,
  type BrowserNativeReferencePrimitive
} from "../src/capture/browser-native-reference-geometry.js";

const rectangle = (
  primitiveId = "rect",
  z = 5
): BrowserNativeReferencePrimitive => ({
  kind: "axis-aligned-rectangle",
  primitiveId,
  minimumM: { x: -1, y: -1, z },
  maximumM: { x: 1, y: 1, z }
});

const box = (
  primitiveId = "box",
  minimumZ = 4,
  maximumZ = 6
): BrowserNativeReferencePrimitive => ({
  kind: "axis-aligned-box",
  primitiveId,
  minimumM: { x: -1, y: -1, z: minimumZ },
  maximumM: { x: 1, y: 1, z: maximumZ }
});

const prepare = (
  primitives: readonly BrowserNativeReferencePrimitive[]
): ReturnType<typeof prepareBrowserNativeReferenceGeometry> =>
  prepareBrowserNativeReferenceGeometry({
    schemaVersion: BROWSER_NATIVE_REFERENCE_GEOMETRY_VERSION,
    sourceStateId: "owned-reference-scene",
    providerSceneId: "room",
    sourceRevision: "fixture-v1",
    primitives
  });

describe("repository-internal browser native reference geometry", () => {
  it("hits and misses a bounded rectangle with closed edge semantics", () => {
    const prepared = prepare([rectangle()]);

    expect(
      intersectBrowserNativeReferenceGeometry(prepared, {
        originM: { x: 0, y: 0, z: 0 },
        directionUnitVector: { x: 0, y: 0, z: 1 }
      })
    ).toEqual({
      kind: "hit",
      primitiveId: "rect",
      rayParameter: 5,
      distanceM: 5,
      pointM: { x: 0, y: 0, z: 5 }
    });

    expect(
      intersectBrowserNativeReferenceGeometry(prepared, {
        originM: { x: 2, y: 0, z: 0 },
        directionUnitVector: { x: 0, y: 0, z: 1 }
      })
    ).toEqual({ kind: "miss" });

    expect(
      intersectBrowserNativeReferenceGeometry(prepared, {
        originM: { x: 1, y: 1, z: 0 },
        directionUnitVector: { x: 0, y: 0, z: 1 }
      })
    ).toEqual({
      kind: "hit",
      primitiveId: "rect",
      rayParameter: 5,
      distanceM: 5,
      pointM: { x: 1, y: 1, z: 5 }
    });
  });

  it("reports physical distance without renormalizing the supplied direction", () => {
    expect(
      intersectBrowserNativeReferenceGeometry(prepare([rectangle()]), {
        originM: { x: 0, y: 0, z: 0 },
        directionUnitVector: { x: 0, y: 0, z: 2 }
      })
    ).toEqual({
      kind: "hit",
      primitiveId: "rect",
      rayParameter: 2.5,
      distanceM: 5,
      pointM: { x: 0, y: 0, z: 5 }
    });
  });

  it("hits box faces and preserves same-primitive edge/corner crossings", () => {
    const prepared = prepare([box()]);

    expect(
      intersectBrowserNativeReferenceGeometry(prepared, {
        originM: { x: 0, y: 0, z: 0 },
        directionUnitVector: { x: 0, y: 0, z: 1 }
      })
    ).toEqual({
      kind: "hit",
      primitiveId: "box",
      rayParameter: 4,
      distanceM: 4,
      pointM: { x: 0, y: 0, z: 4 }
    });

    const corner = intersectBrowserNativeReferenceGeometry(prepared, {
      originM: { x: -2, y: -2, z: 3 },
      directionUnitVector: { x: 1, y: 1, z: 1 }
    });
    expect(corner.kind).toBe("hit");
    if (corner.kind === "hit") {
      expect(corner.primitiveId).toBe("box");
      expect(corner.rayParameter).toBe(1);
      expect(corner.distanceM).toBe(Math.sqrt(3));
      expect(corner.pointM).toEqual({ x: -1, y: -1, z: 4 });
    }
  });

  it("uses the declared forward exit when the ray origin is strictly inside a box", () => {
    expect(
      intersectBrowserNativeReferenceGeometry(prepare([box()]), {
        originM: { x: 0, y: 0, z: 5 },
        directionUnitVector: { x: 0, y: 0, z: 1 }
      })
    ).toEqual({
      kind: "hit",
      primitiveId: "box",
      rayParameter: 1,
      distanceM: 1,
      pointM: { x: 0, y: 0, z: 6 }
    });
  });

  it("selects the first primitive independently of caller array order", () => {
    const near = rectangle("near", 3);
    const far = rectangle("far", 5);
    const ray = {
      originM: { x: 0, y: 0, z: 0 },
      directionUnitVector: { x: 0, y: 0, z: 1 }
    };

    for (const primitives of [
      [far, near],
      [near, far]
    ] as const) {
      expect(
        intersectBrowserNativeReferenceGeometry(prepare(primitives), ray)
      ).toEqual({
        kind: "hit",
        primitiveId: "near",
        rayParameter: 3,
        distanceM: 3,
        pointM: { x: 0, y: 0, z: 3 }
      });
    }
  });

  it("fails closed for exact distinct first-hit ties", () => {
    const prepared = prepare([
      rectangle("a", 5),
      {
        ...rectangle("b", 5),
        minimumM: { x: -2, y: -2, z: 5 },
        maximumM: { x: 2, y: 2, z: 5 }
      }
    ]);

    expect(
      intersectBrowserNativeReferenceGeometry(prepared, {
        originM: { x: 0, y: 0, z: 0 },
        directionUnitVector: { x: 0, y: 0, z: 1 }
      })
    ).toEqual({
      kind: "unsupported",
      reason: "coincident-distinct-first-hit"
    });
  });

  it("fails closed for coplanar rays and origins on primitive boundaries", () => {
    expect(
      intersectBrowserNativeReferenceGeometry(prepare([rectangle()]), {
        originM: { x: 0, y: 0, z: 5 },
        directionUnitVector: { x: 1, y: 0, z: 0 }
      })
    ).toEqual({
      kind: "unsupported",
      reason: "coplanar-rectangle-ray"
    });

    expect(
      intersectBrowserNativeReferenceGeometry(prepare([box()]), {
        originM: { x: 0, y: 0, z: 4 },
        directionUnitVector: { x: 0, y: 0, z: 1 }
      })
    ).toEqual({
      kind: "unsupported",
      reason: "ray-origin-on-primitive-boundary"
    });
  });

  it.each([
    {
      label: "micrometre-scale plane distance",
      primitive: rectangle("small", 1e-6),
      expected: 1e-6
    },
    {
      label: "large metric plane distance",
      primitive: rectangle("large", 1e6),
      expected: 1e6
    }
  ])("keeps simple analytical results across $label", ({ primitive, expected }) => {
    const result = intersectBrowserNativeReferenceGeometry(prepare([primitive]), {
      originM: { x: 0, y: 0, z: 0 },
      directionUnitVector: { x: 0, y: 0, z: 1 }
    });
    expect(result.kind).toBe("hit");
    if (result.kind === "hit") {
      expect(result.rayParameter).toBe(expected);
      expect(result.distanceM).toBe(expected);
    }
  });

  it("owns, sorts, and freezes geometry independently of caller mutation", () => {
    const input = {
      schemaVersion: BROWSER_NATIVE_REFERENCE_GEOMETRY_VERSION,
      sourceStateId: "owned-source",
      providerSceneId: "room",
      sourceRevision: "fixture-v1",
      primitives: [rectangle("z", 5), rectangle("a", 6)]
    };
    const prepared = prepareBrowserNativeReferenceGeometry(input);
    input.primitives[0]!.minimumM.x = -99;

    expect(prepared.primitives.map((primitive) => primitive.primitiveId)).toEqual([
      "a",
      "z"
    ]);
    expect(
      prepared.primitives.find((primitive) => primitive.primitiveId === "z")!
        .minimumM.x
    ).toBe(-1);
    expect(Object.isFrozen(prepared)).toBe(true);
    expect(Object.isFrozen(prepared.primitives)).toBe(true);
    expect(Object.isFrozen(prepared.primitives[0]!.minimumM)).toBe(true);
  });

  it("rejects malformed geometry and invalid rays without inventing an epsilon", () => {
    expect(() => prepare([rectangle("same"), rectangle("same", 6)])).toThrow(
      "unique"
    );
    expect(() =>
      prepare([
        {
          kind: "axis-aligned-box",
          primitiveId: "flat-box",
          minimumM: { x: 0, y: 0, z: 0 },
          maximumM: { x: 1, y: 1, z: 0 }
        }
      ])
    ).toThrow("positive extents");
    expect(() =>
      prepare([
        {
          kind: "axis-aligned-rectangle",
          primitiveId: "line-not-rectangle",
          minimumM: { x: 0, y: 0, z: 0 },
          maximumM: { x: 0, y: 1, z: 0 }
        }
      ])
    ).toThrow("one zero-thickness axis");
    expect(() =>
      prepare([
        {
          ...rectangle("nan"),
          maximumM: { x: Number.NaN, y: 1, z: 5 }
        }
      ])
    ).toThrow("finite");
    expect(() =>
      prepareBrowserNativeReferenceGeometry({
        schemaVersion: BROWSER_NATIVE_REFERENCE_GEOMETRY_VERSION,
        sourceStateId: "scene",
        providerSceneId: "room",
        sourceRevision: " ",
        primitives: [rectangle()]
      })
    ).toThrow("revision");

    const prepared = prepare([rectangle()]);
    expect(() =>
      intersectBrowserNativeReferenceGeometry(prepared, {
        originM: { x: 0, y: 0, z: 0 },
        directionUnitVector: { x: 0, y: 0, z: 0 }
      })
    ).toThrow("nonzero");
  });

  it("returns miss for parallel/off-plane and behind-ray cases", () => {
    const prepared = prepare([rectangle()]);
    expect(
      intersectBrowserNativeReferenceGeometry(prepared, {
        originM: { x: 0, y: 0, z: 0 },
        directionUnitVector: { x: 1, y: 0, z: 0 }
      })
    ).toEqual({ kind: "miss" });
    expect(
      intersectBrowserNativeReferenceGeometry(prepared, {
        originM: { x: 0, y: 0, z: 10 },
        directionUnitVector: { x: 0, y: 0, z: 1 }
      })
    ).toEqual({ kind: "miss" });
  });
});
