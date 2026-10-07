// SPDX-License-Identifier: Apache-2.0

/**
 * Repository-only #234 float64 geometry foundation.
 *
 * This module is intentionally not exported from the package root. It establishes
 * immutable prepared source ownership and independently testable analytic geometry
 * before the compact native reference executor is integrated.
 *
 * Initial scope is deliberately narrower than the final frozen source envelope:
 * local-space axis-aligned metric rectangles/boxes with rigid translation/rotation.
 * Scale/shear and a defensible near-coincident float64 ambiguity bound remain later
 * #234 work.
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

export interface BrowserNativeReferenceQuaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface BrowserNativeReferenceRigidTransform {
  /** World-space translation of the local primitive frame. */
  translationM: BrowserNativeReferenceVector3;
  /**
   * Rotation from local to world coordinates. Preparation normalizes this
   * quaternion and canonicalizes its sign; zero quaternions are invalid.
   */
  rotationQuaternion: BrowserNativeReferenceQuaternion;
}

export interface BrowserNativeAxisAlignedRectangle {
  kind: "axis-aligned-rectangle";
  primitiveId: string;
  /**
   * Closed metric bounds. Exactly one axis must have minimum === maximum;
   * that zero-thickness axis is the supporting plane.
   */
  minimumM: BrowserNativeReferenceVector3;
  maximumM: BrowserNativeReferenceVector3;
  /** Optional rigid local-to-world transform; omission is identity. */
  worldFromLocal?: BrowserNativeReferenceRigidTransform;
}

export interface BrowserNativeAxisAlignedBox {
  kind: "axis-aligned-box";
  primitiveId: string;
  /** Closed metric bounds; every maximum must be strictly greater. */
  minimumM: BrowserNativeReferenceVector3;
  maximumM: BrowserNativeReferenceVector3;
  /** Optional rigid local-to-world transform; omission is identity. */
  worldFromLocal?: BrowserNativeReferenceRigidTransform;
}

export type BrowserNativeReferencePrimitive =
  | BrowserNativeAxisAlignedRectangle
  | BrowserNativeAxisAlignedBox;

export interface PrepareBrowserNativeReferenceGeometryInput {
  schemaVersion: typeof BROWSER_NATIVE_REFERENCE_GEOMETRY_VERSION;
  sourceStateId: string;
  primitives: readonly BrowserNativeReferencePrimitive[];
}

export interface PreparedBrowserNativeReferenceGeometry {
  schemaVersion: typeof BROWSER_NATIVE_REFERENCE_GEOMETRY_VERSION;
  sourceStateId: string;
  coordinateUnit: "m";
  primitiveBoundaryRule: "closed";
  forwardHitRule: "strict-positive-ray-parameter";
  primitiveOrderMeaning: "none";
  primitives: readonly BrowserNativeReferencePrimitive[];
  limitations: readonly [
    "Local-space axis-aligned rectangles/boxes support rigid translation/rotation only; scale and shear are not implemented.",
    "Float64 computation is a reference arithmetic choice, not exact real arithmetic.",
    "Near-coincident distinct-hit ambiguity bounds are not yet qualified; exact distinct ties fail closed."
  ];
}

export interface BrowserNativeReferenceRay {
  originM: BrowserNativeReferenceVector3;
  /**
   * Existing aperture-ray callers own the unit-vector contract. This foundation
   * preserves the supplied direction exactly and never renormalizes it.
   */
  directionUnitVector: BrowserNativeReferenceVector3;
}

export type BrowserNativeReferenceHitResult =
  | {
      kind: "hit";
      primitiveId: string;
      rayParameter: number;
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
    throw new InvalidScientificInputError(`${label} must contain finite metric coordinates.`);
  }
  return { x: value.x, y: value.y, z: value.z };
}

function prepareRigidTransform(
  value: BrowserNativeReferenceRigidTransform | undefined
): BrowserNativeReferenceRigidTransform | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null) {
    throw new InvalidScientificInputError("Reference rigid transform must be an object.");
  }
  const translationM = requireFiniteVector(
    value.translationM,
    "Reference rigid transform translation"
  );
  const q = value.rotationQuaternion;
  if (
    typeof q !== "object" ||
    q === null ||
    !Number.isFinite(q.x) ||
    !Number.isFinite(q.y) ||
    !Number.isFinite(q.z) ||
    !Number.isFinite(q.w)
  ) {
    throw new InvalidScientificInputError(
      "Reference rigid transform quaternion must contain finite values."
    );
  }
  const length = Math.hypot(q.x, q.y, q.z, q.w);
  if (!Number.isFinite(length) || length === 0) {
    throw new InvalidScientificInputError(
      "Reference rigid transform quaternion must be finite and nonzero."
    );
  }
  let rotationQuaternion = {
    x: q.x / length,
    y: q.y / length,
    z: q.z / length,
    w: q.w / length
  };
  const firstNonzero = [
    rotationQuaternion.w,
    rotationQuaternion.x,
    rotationQuaternion.y,
    rotationQuaternion.z
  ].find((component) => component !== 0);
  if (firstNonzero !== undefined && firstNonzero < 0) {
    rotationQuaternion = {
      x: -rotationQuaternion.x,
      y: -rotationQuaternion.y,
      z: -rotationQuaternion.z,
      w: -rotationQuaternion.w
    };
  }
  return { translationM, rotationQuaternion };
}

function validatePrimitive(
  primitive: BrowserNativeReferencePrimitive
): BrowserNativeReferencePrimitive {
  if (typeof primitive !== "object" || primitive === null) {
    throw new InvalidScientificInputError("Reference geometry primitive must be an object.");
  }
  const primitiveId = requirePublicOpaqueId(
    primitive.primitiveId,
    "Reference geometry primitive requires a public opaque ID."
  );
  const minimumM = requireFiniteVector(primitive.minimumM, "Primitive minimum");
  const maximumM = requireFiniteVector(primitive.maximumM, "Primitive maximum");
  const worldFromLocal = prepareRigidTransform(primitive.worldFromLocal);

  const equalAxes = AXES.filter((axis) => minimumM[axis] === maximumM[axis]);
  for (const axis of AXES) {
    if (minimumM[axis] > maximumM[axis]) {
      throw new InvalidScientificInputError("Reference primitive bounds must not be reversed.");
    }
  }

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
    return {
      kind: primitive.kind,
      primitiveId,
      minimumM,
      maximumM,
      ...(worldFromLocal === undefined ? {} : { worldFromLocal })
    };
  }

  if (primitive.kind === "axis-aligned-box") {
    if (equalAxes.length !== 0 || AXES.some((axis) => !(minimumM[axis] < maximumM[axis]))) {
      throw new InvalidScientificInputError(
        "Reference box requires three strictly positive extents."
      );
    }
    return {
      kind: primitive.kind,
      primitiveId,
      minimumM,
      maximumM,
      ...(worldFromLocal === undefined ? {} : { worldFromLocal })
    };
  }

  throw new InvalidScientificInputError("Unsupported reference geometry primitive kind.");
}

/**
 * Validate, copy, sort by stable primitive ID, and freeze repository-only source geometry.
 * Sorting removes caller array order as a hidden visibility semantic.
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
  const ids = new Set<string>();
  const primitives = input.primitives.map((value) => {
    const primitive = validatePrimitive(value);
    if (ids.has(primitive.primitiveId)) {
      throw new InvalidScientificInputError("Reference primitive IDs must be unique.");
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
    coordinateUnit: "m" as const,
    primitiveBoundaryRule: "closed" as const,
    forwardHitRule: "strict-positive-ray-parameter" as const,
    primitiveOrderMeaning: "none" as const,
    primitives,
    limitations: [
      "Local-space axis-aligned rectangles/boxes support rigid translation/rotation only; scale and shear are not implemented.",
      "Float64 computation is a reference arithmetic choice, not exact real arithmetic.",
      "Near-coincident distinct-hit ambiguity bounds are not yet qualified; exact distinct ties fail closed."
    ] as const
  });
}

function validateRay(ray: BrowserNativeReferenceRay): BrowserNativeReferenceRay {
  if (typeof ray !== "object" || ray === null) {
    throw new InvalidScientificInputError("Reference ray must be an object.");
  }
  const originM = requireFiniteVector(ray.originM, "Reference ray origin");
  const directionUnitVector = requireFiniteVector(
    ray.directionUnitVector,
    "Reference ray direction"
  );
  const normSquared =
    directionUnitVector.x * directionUnitVector.x +
    directionUnitVector.y * directionUnitVector.y +
    directionUnitVector.z * directionUnitVector.z;
  if (!Number.isFinite(normSquared) || normSquared <= 0) {
    throw new InvalidScientificInputError(
      "Reference ray direction must be finite and nonzero."
    );
  }
  return { originM, directionUnitVector };
}

function rotateVectorByUnitQuaternion(
  vector: BrowserNativeReferenceVector3,
  quaternion: BrowserNativeReferenceQuaternion
): BrowserNativeReferenceVector3 {
  const tx = 2 * (quaternion.y * vector.z - quaternion.z * vector.y);
  const ty = 2 * (quaternion.z * vector.x - quaternion.x * vector.z);
  const tz = 2 * (quaternion.x * vector.y - quaternion.y * vector.x);
  return {
    x:
      vector.x +
      quaternion.w * tx +
      (quaternion.y * tz - quaternion.z * ty),
    y:
      vector.y +
      quaternion.w * ty +
      (quaternion.z * tx - quaternion.x * tz),
    z:
      vector.z +
      quaternion.w * tz +
      (quaternion.x * ty - quaternion.y * tx)
  };
}

function rayInPrimitiveLocalSpace(
  ray: BrowserNativeReferenceRay,
  transform: BrowserNativeReferenceRigidTransform | undefined
): BrowserNativeReferenceRay | null {
  if (transform === undefined) return ray;
  const inverse = {
    x: -transform.rotationQuaternion.x,
    y: -transform.rotationQuaternion.y,
    z: -transform.rotationQuaternion.z,
    w: transform.rotationQuaternion.w
  };
  const shiftedOrigin = {
    x: ray.originM.x - transform.translationM.x,
    y: ray.originM.y - transform.translationM.y,
    z: ray.originM.z - transform.translationM.z
  };
  const originM = rotateVectorByUnitQuaternion(shiftedOrigin, inverse);
  const directionUnitVector = rotateVectorByUnitQuaternion(
    ray.directionUnitVector,
    inverse
  );
  if (
    !Number.isFinite(originM.x) ||
    !Number.isFinite(originM.y) ||
    !Number.isFinite(originM.z) ||
    !Number.isFinite(directionUnitVector.x) ||
    !Number.isFinite(directionUnitVector.y) ||
    !Number.isFinite(directionUnitVector.z)
  ) {
    return null;
  }
  return { originM, directionUnitVector };
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

function rectanglePlaneAxis(
  primitive: BrowserNativeAxisAlignedRectangle
): Axis {
  return AXES.find(
    (axis) => primitive.minimumM[axis] === primitive.maximumM[axis]
  )!;
}

function intersectRectangle(
  primitive: BrowserNativeAxisAlignedRectangle,
  ray: BrowserNativeReferenceRay
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
    return { kind: "unsupported", reason: "ray-origin-on-primitive-boundary" };
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

  return {
    kind: "hit",
    primitiveId: primitive.primitiveId,
    rayParameter,
    pointM
  };
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
  ray: BrowserNativeReferenceRay
): BrowserNativeReferenceHitResult {
  if (isInsideInclusive(primitive, ray.originM) && !isInsideStrict(primitive, ray.originM)) {
    return { kind: "unsupported", reason: "ray-origin-on-primitive-boundary" };
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
    return { kind: "unsupported", reason: "ray-origin-on-primitive-boundary" };
  }

  const pointM = pointAt(ray, rayParameter);
  if (pointM === null) {
    return { kind: "unsupported", reason: "non-finite-intersection" };
  }
  return {
    kind: "hit",
    primitiveId: primitive.primitiveId,
    rayParameter,
    pointM
  };
}

/**
 * Intersect an exact supplied ray against the immutable prepared geometry.
 *
 * This first float64 foundation intentionally fails closed for exact distinct
 * first-hit ties and for unresolved boundary/coplanar states. It does not yet
 * claim the BNCE-GEO-002 near-coincident ambiguity bound required for full
 * lower-precision/backend qualification.
 */
export function intersectBrowserNativeReferenceGeometry(
  prepared: PreparedBrowserNativeReferenceGeometry,
  rayInput: BrowserNativeReferenceRay
): BrowserNativeReferenceHitResult {
  if (
    prepared.schemaVersion !== BROWSER_NATIVE_REFERENCE_GEOMETRY_VERSION ||
    prepared.coordinateUnit !== "m" ||
    prepared.primitiveBoundaryRule !== "closed" ||
    prepared.forwardHitRule !== "strict-positive-ray-parameter"
  ) {
    throw new InvalidScientificInputError(
      "Unsupported prepared reference geometry contract."
    );
  }
  const ray = validateRay(rayInput);
  let best: Extract<BrowserNativeReferenceHitResult, { kind: "hit" }> | null =
    null;

  for (const primitive of prepared.primitives) {
    const localRay = rayInPrimitiveLocalSpace(ray, primitive.worldFromLocal);
    if (localRay === null) {
      return { kind: "unsupported", reason: "non-finite-intersection" };
    }
    const localResult =
      primitive.kind === "axis-aligned-rectangle"
        ? intersectRectangle(primitive, localRay)
        : intersectBox(primitive, localRay);

    if (localResult.kind === "unsupported") return localResult;
    if (localResult.kind === "miss") continue;

    const pointM = pointAt(ray, localResult.rayParameter);
    if (pointM === null) {
      return { kind: "unsupported", reason: "non-finite-intersection" };
    }
    const result = { ...localResult, pointM };

    if (best === null || result.rayParameter < best.rayParameter) {
      best = result;
      continue;
    }
    if (
      result.rayParameter === best.rayParameter &&
      result.primitiveId !== best.primitiveId
    ) {
      return { kind: "unsupported", reason: "coincident-distinct-first-hit" };
    }
  }

  return best ?? { kind: "miss" };
}
