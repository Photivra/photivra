// SPDX-License-Identifier: Apache-2.0

/**
 * Repository-internal #234 binary64 geometry conditioning evidence.
 *
 * This records operation/request-specific values around the authoritative
 * float64 reference. It deliberately does not define a universal epsilon,
 * error interval, or lower-precision backend acceptance criterion.
 */
import {
  intersectBrowserNativeReferenceGeometry,
  type BrowserNativeReferenceHitResult,
  type BrowserNativeReferenceRay,
  type PreparedBrowserNativeReferenceGeometry
} from "./browser-native-reference-geometry.js";

export type BrowserNativeReferenceUnsupportedClassification =
  | "source-semantic-unsupported"
  | "numeric-reference-unsupported";

export interface BrowserNativeReferenceGeometryConditioningEvidence {
  precision: "binary64";
  result: BrowserNativeReferenceHitResult;
  classification:
    | "resolved"
    | BrowserNativeReferenceUnsupportedClassification;
  directionMagnitude: number;
  minimumNonzeroDirectionComponentMagnitude: number;
  finiteHitCandidates: readonly {
    primitiveId: string;
    rayParameter: number;
    distanceM: number;
  }[];
  /**
   * Raw representable distance separation between the first two distinct finite
   * hit distances when present. This is evidence only, not a tolerance/bound.
   */
  firstDistinctHitDistanceSeparationM: number | null;
  conditioningClaim:
    "observed-binary64-values-only-not-a-universal-error-bound";
}

function classifyUnsupported(
  result: Extract<BrowserNativeReferenceHitResult, { kind: "unsupported" }>
): BrowserNativeReferenceUnsupportedClassification {
  return result.reason === "non-finite-intersection"
    ? "numeric-reference-unsupported"
    : "source-semantic-unsupported";
}

function singlePrimitiveGeometry(
  prepared: PreparedBrowserNativeReferenceGeometry,
  primitive: PreparedBrowserNativeReferenceGeometry["primitives"][number]
): PreparedBrowserNativeReferenceGeometry {
  return {
    ...prepared,
    primitives: [primitive]
  };
}

/**
 * Run the authoritative full-scene reference and isolated primitive probes.
 *
 * Isolated probes are diagnostic only; they never replace the full-scene result.
 */
export function evaluateBrowserNativeReferenceGeometryConditioning(
  prepared: PreparedBrowserNativeReferenceGeometry,
  ray: BrowserNativeReferenceRay
): BrowserNativeReferenceGeometryConditioningEvidence {
  const result = intersectBrowserNativeReferenceGeometry(prepared, ray);
  const directionMagnitude = Math.hypot(
    ray.directionUnitVector.x,
    ray.directionUnitVector.y,
    ray.directionUnitVector.z
  );
  const nonzeroComponents = [
    Math.abs(ray.directionUnitVector.x),
    Math.abs(ray.directionUnitVector.y),
    Math.abs(ray.directionUnitVector.z)
  ].filter((value) => value > 0);
  const minimumNonzeroDirectionComponentMagnitude =
    nonzeroComponents.length === 0
      ? 0
      : Math.min(...nonzeroComponents);

  const finiteHitCandidates: {
    primitiveId: string;
    rayParameter: number;
    distanceM: number;
  }[] = [];

  for (const primitive of prepared.primitives) {
    const candidate = intersectBrowserNativeReferenceGeometry(
      singlePrimitiveGeometry(prepared, primitive),
      ray
    );
    if (candidate.kind === "hit") {
      finiteHitCandidates.push({
        primitiveId: candidate.primitiveId,
        rayParameter: candidate.rayParameter,
        distanceM: candidate.distanceM
      });
    }
  }

  finiteHitCandidates.sort((first, second) =>
    first.rayParameter < second.rayParameter
      ? -1
      : first.rayParameter > second.rayParameter
        ? 1
        : first.primitiveId < second.primitiveId
          ? -1
          : first.primitiveId > second.primitiveId
            ? 1
            : 0
  );

  let firstDistinctHitDistanceSeparationM: number | null = null;
  if (finiteHitCandidates.length >= 2) {
    const first = finiteHitCandidates[0]!;
    const second = finiteHitCandidates.find(
      (candidate) => candidate.distanceM !== first.distanceM
    );
    if (second !== undefined) {
      firstDistinctHitDistanceSeparationM =
        second.distanceM - first.distanceM;
    } else if (
      finiteHitCandidates.some(
        (candidate) => candidate.primitiveId !== first.primitiveId
      )
    ) {
      firstDistinctHitDistanceSeparationM = 0;
    }
  }

  return {
    precision: "binary64",
    result,
    classification:
      result.kind === "unsupported"
        ? classifyUnsupported(result)
        : "resolved",
    directionMagnitude,
    minimumNonzeroDirectionComponentMagnitude,
    finiteHitCandidates,
    firstDistinctHitDistanceSeparationM,
    conditioningClaim:
      "observed-binary64-values-only-not-a-universal-error-bound"
  };
}
