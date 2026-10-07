// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  evaluateBrowserNativeReferenceGeometryConditioning
} from "../src/capture/browser-native-reference-conditioning.js";
import {
  BROWSER_NATIVE_REFERENCE_GEOMETRY_VERSION,
  prepareBrowserNativeReferenceGeometry,
  type BrowserNativeReferencePrimitive
} from "../src/capture/browser-native-reference-geometry.js";

const rectangle = (
  primitiveId: string,
  z: number,
  halfExtent = 1
): BrowserNativeReferencePrimitive => ({
  kind: "axis-aligned-rectangle",
  primitiveId,
  minimumM: { x: -halfExtent, y: -halfExtent, z },
  maximumM: { x: halfExtent, y: halfExtent, z }
});

const prepare = (
  primitives: readonly BrowserNativeReferencePrimitive[]
): ReturnType<typeof prepareBrowserNativeReferenceGeometry> =>
  prepareBrowserNativeReferenceGeometry({
    schemaVersion: BROWSER_NATIVE_REFERENCE_GEOMETRY_VERSION,
    sourceStateId: "conditioning-scene",
    providerSceneId: "room",
    sourceRevision: "conditioning-v1",
    primitives
  });

describe("browser-native float64 geometry conditioning evidence", () => {
  it("records representable near-coincident separation without treating it as a tolerance", () => {
    const separation = Number.EPSILON;
    const evidence = evaluateBrowserNativeReferenceGeometryConditioning(
      prepare([
        rectangle("near", 1),
        rectangle("far", 1 + separation)
      ]),
      {
        originM: { x: 0, y: 0, z: 0 },
        directionUnitVector: { x: 0, y: 0, z: 1 }
      }
    );

    expect(evidence.result).toEqual({
      kind: "hit",
      primitiveId: "near",
      rayParameter: 1,
      distanceM: 1,
      pointM: { x: 0, y: 0, z: 1 }
    });
    expect(evidence.classification).toBe("resolved");
    expect(evidence.finiteHitCandidates.map((candidate) => candidate.primitiveId))
      .toEqual(["near", "far"]);
    expect(evidence.firstDistinctHitDistanceSeparationM).toBe(separation);
    expect(evidence.conditioningClaim).toBe(
      "observed-binary64-values-only-not-a-universal-error-bound"
    );
  });

  it("classifies source values that collapse to an exact binary64 tie as source-semantic unsupported", () => {
    const collapsed = 1 + Number.EPSILON / 2;
    expect(collapsed).toBe(1);

    const evidence = evaluateBrowserNativeReferenceGeometryConditioning(
      prepare([
        rectangle("a", 1),
        rectangle("b", collapsed)
      ]),
      {
        originM: { x: 0, y: 0, z: 0 },
        directionUnitVector: { x: 0, y: 0, z: 1 }
      }
    );

    expect(evidence.result).toEqual({
      kind: "unsupported",
      reason: "coincident-distinct-first-hit"
    });
    expect(evidence.classification).toBe("source-semantic-unsupported");
    expect(evidence.firstDistinctHitDistanceSeparationM).toBe(0);
  });

  it("resolves a very near-parallel representable rectangle request without a global epsilon", () => {
    const prepared = prepare([
      {
        kind: "axis-aligned-rectangle",
        primitiveId: "x-plane",
        minimumM: { x: 1, y: -2, z: -2 },
        maximumM: { x: 1, y: 2, z: 2 }
      }
    ]);
    const evidence = evaluateBrowserNativeReferenceGeometryConditioning(
      prepared,
      {
        originM: { x: 0, y: 0, z: 0 },
        directionUnitVector: { x: 1e-300, y: 0, z: 0 }
      }
    );

    expect(evidence.result.kind).toBe("hit");
    if (evidence.result.kind === "hit") {
      expect(evidence.result.primitiveId).toBe("x-plane");
      expect(evidence.result.distanceM).toBeCloseTo(1, 14);
    }
    expect(evidence.minimumNonzeroDirectionComponentMagnitude).toBe(1e-300);
    expect(evidence.classification).toBe("resolved");
  });

  it("fails closed as numeric-reference unsupported when the binary64 intersection becomes non-finite", () => {
    const prepared = prepare([
      {
        kind: "axis-aligned-rectangle",
        primitiveId: "x-plane",
        minimumM: { x: 1, y: -2, z: -2 },
        maximumM: { x: 1, y: 2, z: 2 }
      }
    ]);
    const evidence = evaluateBrowserNativeReferenceGeometryConditioning(
      prepared,
      {
        originM: { x: 0, y: 0, z: 0 },
        directionUnitVector: { x: Number.MIN_VALUE, y: 0, z: 0 }
      }
    );

    expect(evidence.result).toEqual({
      kind: "unsupported",
      reason: "non-finite-intersection"
    });
    expect(evidence.classification).toBe("numeric-reference-unsupported");
    expect(evidence.minimumNonzeroDirectionComponentMagnitude)
      .toBe(Number.MIN_VALUE);
  });

  it("retains a translated subpixel-scale sliver as an exact primitive identity case", () => {
    const sliver = {
      ...rectangle("sliver", 0, 5e-13),
      worldFromLocal: {
        translationM: { x: 2e-12, y: 0, z: 5 },
        rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 }
      }
    };
    const evidence = evaluateBrowserNativeReferenceGeometryConditioning(
      prepare([sliver]),
      {
        originM: { x: 2e-12, y: 0, z: 0 },
        directionUnitVector: { x: 0, y: 0, z: 1 }
      }
    );

    expect(evidence.result.kind).toBe("hit");
    if (evidence.result.kind === "hit") {
      expect(evidence.result.primitiveId).toBe("sliver");
      expect(evidence.result.distanceM).toBe(5);
    }
    expect(evidence.classification).toBe("resolved");
  });
});
