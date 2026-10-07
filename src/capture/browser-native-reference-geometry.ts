// SPDX-License-Identifier: Apache-2.0

/**
 * Repository-internal #234 float64 geometry foundation.
 *
 * This module is intentionally not exported from the package root. It owns a
 * compact immutable geometry representation for the Path-A reference executor.
 *
 * Initial scope is deliberately narrower than the final frozen source envelope:
 * axis-aligned metric rectangles and boxes only. Arbitrary transforms/orientation
 * and a defensible near-coincident float64 ambiguity bound remain later #234 work.
 */
import { freezeOwnedData } from "../core/owned-data.js";
import { requirePublicOpaqueId } from "../core/record-validation.js";
import { InvalidScientificInputError } from "../core/validation.js";

export const BROWSER_NATIVE_REFERENCE_GEOMETRY_VERSION = "0.1.0" as const;

export interface BrowserNativeReferenceVector3 {
  x: number;
  y: number;
  z: number;
}

export interface BrowserNativeAxisAlignedRectangle {
  kind: "axis-aligned-rectangle";
  primitiveId: string;
  /**
   * Closed metric bounds. Exactly one axis has minimum === maximum; that
   * zero-thickness axis is the supporting plane.
   */
  minimumM: BrowserNativeReferenceVector3;
  maximumM: BrowserNativeReferenceVector3;
}

export interface BrowserNativeAxisAlignedBox {
  kind: "axis-aligned-box";
  primitiveId: string;
  /** Closed metric bounds; every maximum is strictly greater. */
  minimumM: BrowserNativeReferenceVector3;
  maximumM: BrowserNativeReferenceVector3;
}

export type BrowserNativeReferencePrimitive =
  | BrowserNativeAxisAlignedRectangle
  | BrowserNativeAxisAlignedBox;

export interface PrepareBrowserNativeReferenceGeometryInput {
  schemaVersion: typeof BROWSER_NATIVE_REFERENCE_GEOMETRY_VERSION;
  sourceStateId: string;
  providerSceneId: string;
  sourceRevision: string;
  primitives: readonly BrowserNativeReferencePrimitive[];
}

export interface PreparedBrowserNativeReferenceGeometry {
  schemaVersion: typeof BROWSER_NATIVE_REFERENCE_GEOMETRY_VERSION;
  sourceStateId: string;
  providerSceneId: string;
  sourceRevision: string;
  coordinateUnit: "m";
  primitiveBoundaryRule: "closed";
  forwardHitRule: "strict-positive-ray-parameter";
  boxInsideOriginRule: "first-forward-exit-surface";
  primitiveOrderMeaning: "none";
  primitives: readonly BrowserNativeReferencePrimitive[];
  limitations: readonly [
    "Axis-aligned rectangles and boxes only; arbitrary transforms/orientation are not implemented in this foundation.",
    "Float64 computation is a reference arithmetic choice, not exact real arithmetic.",
    "Near-coincident distinct-hit ambiguity bounds are not yet qualified; exact distinct ties fail closed."
  ];
}

export interface BrowserNativeReferenceRay {
  originM: BrowserNativeReferenceVector3;
  /**
   * Existing aperture-ray callers normally supply a unit vector. This reference
   * foundation preserves the supplied direction exactly and never renormalizes it.
   * distanceM is derived using the actual finite vector magnitude.
   */
  directionUnitVector: BrowserNativeReferenceVector3;
}

export type BrowserNativeReferenceHitResult =
  | {
      kind: "hit";
      primitiveId: string;
      rayParameter: number;
      distanceM: number;
      pointM: BrowserNativeReferenceVector3;
    }
  | { kind: "miss" }
  | {
      kind: "unsupported";
      reason:
        | "ray-origin-on-primitive-boundary"
        | "coplanar-rectangle-ray"
        | "coincident-distinct-first-hit"
        | "non-finite-intersection";
    };

type Axis = "x" | "y" | "z";
const AXES: readonly Axis[] = ["x", "y", "z"];

function requireFiniteVector(
  value: BrowserNativeReferenceVector3,
  label: string
): BrowserNativeReferenceVector3 {
  if (
    typeof value !== "object" ||
    value === null ||
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    !Number.isFinite(value.z)
  ) {
    throw new InvalidScientificInputError(
      `${label} must contain finite metric coordinates.`
    );
  }
  return { x: value.x, y: value.y, z: value.z };
}

function requireNonEmptyRevision(value: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidScientificInputError(
      "Reference geometry requires a non-empty source revision."
    );
  }
  return value.trim();
}

function validatePrimitive(
  primitive: BrowserNativeReferencePrimitive
): BrowserNativeReferencePrimitive {
  if (typeof primitive !== "object" || primitive === null) {
    throw new InvalidScientificInputError(
      "Reference geometry primitive must be an object."
    );
  }
  const primitiveId = requirePublicOpaqueId(
    primitive.primitiveId,
    "Reference geometry primitive requires a public opaque ID."
  );
  const minimumM = requireFiniteVector(primitive.minimumM, "Primitive minimum");
  const maximumM = requireFiniteVector(primitive.maximumM, "Primitive maximum");

  for (const axis of AXES) {
    if (minimumM[axis] > maximumM[axis]) {
      throw new InvalidScientificInputError(
        "Reference primitive bounds must not be reversed."
      );
    }
  }

  const equalAxes = AXES.filter(
    (axis) => minimumM[axis] === maximumM[axis]
  );

  if (primitive.kind === "axis-aligned-rectangle") {
    if (
      equalAxes.length !== 1 ||
      AXES.some(
        (axis) =>
          minimumM[axis] !== maximumM[axis] &&
          !(minimumM[axis] < maximumM[axis])
      )
    ) {
      throw new InvalidScientificInputError(
        "Reference rectangle requires exactly one zero-thickness axis and two positive extents."
      );
    }
    return { kind: primitive.kind, primitiveId, minimumM, maximumM };
  }

  if (primitive.kind === "axis-aligned-box") {
    if (
      equalAxes.length !== 0 ||
      AXES.some((axis) => !(minimumM[axis] < maximumM[axis]))
    ) {
      throw new InvalidScientificInputError(
        "Reference box requires three strictly positive extents."
      );
    }
    return { kind: primitive.kind, primitiveId, minimumM, maximumM };
  }

  throw new InvalidScientificInputError(
    "Unsupported reference geometry primitive kind."
  );
}

/**
 * Validate, copy, canonicalize by stable primitive ID, and freeze repository-
 * internal source geometry. Sorting removes caller array order as a hidden
 * visibility semantic. It is not a tie-break rule: exact distinct first-hit ties
 * remain unsupported.
 */
export function prepareBrowserNativeReferenceGeometry(
  input: PrepareBrowserNativeReferenceGeometryInput
): PreparedBrowserNativeReferenceGeometry {
  if (
    typeof input !== "object" ||
    input === null ||
    input.schemaVersion !== BROWSER_NATIVE_REFERENCE_GEOMETRY_VERSION ||
    !Array.isArray(input.primitives) ||
    input.primitives.length < 1
  ) {
    throw new InvalidScientificInputError(
      "Reference geometry requires schema 0.1.0 and at least one primitive."
    );
  }

  const sourceStateId = requirePublicOpaqueId(
    input.sourceStateId,
    "Reference geometry requires a public source-state ID."
  );
  const providerSceneId = requirePublicOpaqueId(
    input.providerSceneId,
    "Reference geometry requires a public provider-scene ID."
  );
  const sourceRevision = requireNonEmptyRevision(input.sourceRevision);

  const ids = new Set<string>();
  const primitives = input.primitives.map((value) => {
    const primitive = validatePrimitive(value);
    if (ids.has(primitive.primitiveId)) {
      throw new InvalidScientificInputError(
        "Reference primitive IDs must be unique."
      );
    }
    ids.add(primitive.primitiveId);
    return primitive;
  });
  primitives.sort((first, second) =>
    first.primitiveId.localeCompare(second.primitiveId)
  );

  return freezeOwnedData({
    schemaVersion: BROWSER_NATIVE_REFERENCE_GEOMETRY_VERSION,
    sourceStateId,
    providerSceneId,
    sourceRevision,
    coordinateUnit: "m" as const,
    primitiveBoundaryRule: "closed" as const,
    forwardHitRule: "strict-positive-ray-parameter" as const,
    boxInsideOriginRule: "first-forward-exit-surface" as const,
    primitiveOrderMeaning: "none" as const,
    primitives,
    limitations: [
      "Axis-aligned rectangles and boxes only; arbitrary transforms/orientation are not implemented in this foundation.",
      "Float64 computation is a reference arithmetic choice, not exact real arithmetic.",
      "Near-coincident distinct-hit ambiguity bounds are not yet qualified; exact distinct ties fail closed."
    ] as const
  });
}

function validateRay(ray: BrowserNativeReferenceRay): {
  ray: BrowserNativeReferenceRay;
  directionMagnitude: number;
} {
  if (typeof ray !== "object" || ray === null) {
    throw new InvalidScientificInputError("Reference ray must be an object.");
  }
  const originM = requireFiniteVector(ray.originM, "Reference ray origin");
  const directionUnitVector = requireFiniteVector(
    ray.directionUnitVector,
    "Reference ray direction"
  );
  const directionMagnitude = Math.hypot(
    directionUnitVector.x,
    directionUnitVector.y,
    directionUnitVector.z
  );
  if (!Number.isFinite(directionMagnitude) || directionMagnitude <= 0) {
    throw new InvalidScientificInputError(
      "Reference ray direction must be finite and nonzero."
    );
  }
  return {
    ray: { originM, directionUnitVector },
    directionMagnitude
  };
}

function pointAt(
  ray: BrowserNativeReferenceRay,
  rayParameter: number
): BrowserNativeReferenceVector3 | null {
  const point = {
    x: ray.originM.x + rayParameter * ray.directionUnitVector.x,
    y: ray.originM.y + rayParameter * ray.directionUnitVector.y,
    z: ray.originM.z + rayParameter * ray.directionUnitVector.z
  };
  return Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    Number.isFinite(point.z)
    ? point
    : null;
}

function hit(
  primitiveId: string,
  ray: BrowserNativeReferenceRay,
  directionMagnitude: number,
  rayParameter: number
): BrowserNativeReferenceHitResult {
  const pointM = pointAt(ray, rayParameter);
  const distanceM = rayParameter * directionMagnitude;
  if (
    pointM === null ||
    !Number.isFinite(distanceM) ||
    !(distanceM > 0)
  ) {
    return { kind: "unsupported", reason: "non-finite-intersection" };
  }
  return {
    kind: "hit",
    primitiveId,
    rayParameter,
    distanceM,
    pointM
  };
}

function rectanglePlaneAxis(
  primitive: BrowserNativeAxisAlignedRectangle
): Axis {
  return AXES.find(
    (axis) => primitive.minimumM[axis] === primitive.maximumM[axis]
  )!;
}

function intersectRectangle(
  primitive: BrowserNativeAxisAlignedRectangle,
  ray: BrowserNativeReferenceRay,
  directionMagnitude: number
): BrowserNativeReferenceHitResult {
  const planeAxis = rectanglePlaneAxis(primitive);
  const planeCoordinate = primitive.minimumM[planeAxis];
  const originCoordinate = ray.originM[planeAxis];
  const directionCoordinate = ray.directionUnitVector[planeAxis];

  if (directionCoordinate === 0) {
    return originCoordinate === planeCoordinate
      ? { kind: "unsupported", reason: "coplanar-rectangle-ray" }
      : { kind: "miss" };
  }

  const rayParameter =
    (planeCoordinate - originCoordinate) / directionCoordinate;
  if (!Number.isFinite(rayParameter)) {
    return { kind: "unsupported", reason: "non-finite-intersection" };
  }
  if (rayParameter < 0) return { kind: "miss" };
  if (rayParameter === 0) {
    return {
      kind: "unsupported",
      reason: "ray-origin-on-primitive-boundary"
    };
  }

  const pointM = pointAt(ray, rayParameter);
  if (pointM === null) {
    return { kind: "unsupported", reason: "non-finite-intersection" };
  }

  for (const axis of AXES) {
    if (axis === planeAxis) continue;
    if (
      pointM[axis] < primitive.minimumM[axis] ||
      pointM[axis] > primitive.maximumM[axis]
    ) {
      return { kind: "miss" };
    }
  }

  return hit(
    primitive.primitiveId,
    ray,
    directionMagnitude,
    rayParameter
  );
}

function isInsideInclusive(
  primitive: BrowserNativeAxisAlignedBox,
  point: BrowserNativeReferenceVector3
): boolean {
  return AXES.every(
    (axis) =>
      point[axis] >= primitive.minimumM[axis] &&
      point[axis] <= primitive.maximumM[axis]
  );
}

function isInsideStrict(
  primitive: BrowserNativeAxisAlignedBox,
  point: BrowserNativeReferenceVector3
): boolean {
  return AXES.every(
    (axis) =>
      point[axis] > primitive.minimumM[axis] &&
      point[axis] < primitive.maximumM[axis]
  );
}

function intersectBox(
  primitive: BrowserNativeAxisAlignedBox,
  ray: BrowserNativeReferenceRay,
  directionMagnitude: number
): BrowserNativeReferenceHitResult {
  if (
    isInsideInclusive(primitive, ray.originM) &&
    !isInsideStrict(primitive, ray.originM)
  ) {
    return {
      kind: "unsupported",
      reason: "ray-origin-on-primitive-boundary"
    };
  }

  let entry = Number.NEGATIVE_INFINITY;
  let exit = Number.POSITIVE_INFINITY;

  for (const axis of AXES) {
    const origin = ray.originM[axis];
    const direction = ray.directionUnitVector[axis];
    const minimum = primitive.minimumM[axis];
    const maximum = primitive.maximumM[axis];

    if (direction === 0) {
      if (origin < minimum || origin > maximum) return { kind: "miss" };
      continue;
    }

    const first = (minimum - origin) / direction;
    const second = (maximum - origin) / direction;
    if (!Number.isFinite(first) || !Number.isFinite(second)) {
      return { kind: "unsupported", reason: "non-finite-intersection" };
    }
    const near = Math.min(first, second);
    const far = Math.max(first, second);
    entry = Math.max(entry, near);
    exit = Math.min(exit, far);
    if (entry > exit) return { kind: "miss" };
  }

  if (exit < 0) return { kind: "miss" };

  let rayParameter: number;
  if (entry > 0) {
    rayParameter = entry;
  } else if (isInsideStrict(primitive, ray.originM) && exit > 0) {
    rayParameter = exit;
  } else {
    return {
      kind: "unsupported",
      reason: "ray-origin-on-primitive-boundary"
    };
  }

  return hit(
    primitive.primitiveId,
    ray,
    directionMagnitude,
    rayParameter
  );
}

/**
 * Intersect one exact supplied ray against immutable prepared geometry.
 *
 * This first float64 foundation intentionally fails closed for exact distinct
 * first-hit ties and unresolved boundary/coplanar states. It does not yet claim
 * the BNCE-GEO-002 near-coincident ambiguity bound required for later backend
 * qualification.
 */
export function intersectBrowserNativeReferenceGeometry(
  prepared: PreparedBrowserNativeReferenceGeometry,
  rayInput: BrowserNativeReferenceRay
): BrowserNativeReferenceHitResult {
  if (
    prepared.schemaVersion !== BROWSER_NATIVE_REFERENCE_GEOMETRY_VERSION ||
    prepared.coordinateUnit !== "m" ||
    prepared.primitiveBoundaryRule !== "closed" ||
    prepared.forwardHitRule !== "strict-positive-ray-parameter" ||
    prepared.boxInsideOriginRule !== "first-forward-exit-surface" ||
    prepared.primitiveOrderMeaning !== "none"
  ) {
    throw new InvalidScientificInputError(
      "Unsupported prepared reference geometry contract."
    );
  }
  const { ray, directionMagnitude } = validateRay(rayInput);
  let best: Extract<BrowserNativeReferenceHitResult, { kind: "hit" }> | null =
    null;

  for (const primitive of prepared.primitives) {
    const result =
      primitive.kind === "axis-aligned-rectangle"
        ? intersectRectangle(primitive, ray, directionMagnitude)
        : intersectBox(primitive, ray, directionMagnitude);

    if (result.kind === "unsupported") return result;
    if (result.kind === "miss") continue;

    if (best === null || result.rayParameter < best.rayParameter) {
      best = result;
      continue;
    }
    if (
      result.rayParameter === best.rayParameter &&
      result.primitiveId !== best.primitiveId
    ) {
      return {
        kind: "unsupported",
        reason: "coincident-distinct-first-hit"
      };
    }
  }

  return best ?? { kind: "miss" };
}
