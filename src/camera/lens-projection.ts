// SPDX-License-Identifier: Apache-2.0

/**
 * Module boundary and integration notes.
 * Ideal lens projection (mapping) functions between a scene direction and an image-plane point.
 * A radial projection maps the field angle theta (angle from the optical axis) to image radius r:
 *   rectilinear       r = f tan(theta)          (gnomonic / pinhole)
 *   equidistant       r = f theta               ("f-theta" fisheye)
 *   equisolid-angle   r = 2 f sin(theta / 2)    (equal-area fisheye)
 *   stereographic     r = 2 f tan(theta / 2)    (conformal fisheye)
 *   orthographic      r = f sin(theta)
 * The azimuth of the image point equals the azimuth of the direction about the optical axis, so
 * every radial projection is rotationally symmetric. Equirectangular (spherical, cylindrical
 * equidistant) is not radial: x = f * longitude, y = f * latitude, where f is the image distance per
 * radian.
 * Sources: Miyamoto 1964 (JOSA 54:1060, fish-eye projection functions); Kingslake 1989 (A History of
 * the Photographic Lens, ch. on fish-eye lenses); Ray 2002 (Applied Photographic Optics, 3rd ed.,
 * ch. 6 and 47); Kannala & Brandt 2006 (IEEE TPAMI 28:1335, generic camera model listing these
 * projections); Snyder 1987 (Map Projections - A Working Manual, USGS PP 1395) for the equirectangular
 * and stereographic projections. These are ideal mapping functions; real fisheye lenses deviate and
 * would need a calibrated polynomial (for example Kannala-Brandt) with defensible provenance.
 * Camera frame: +X right, +Y up, +Z along the optical axis toward the scene. Image-plane coordinates
 * use the same non-inverted +X right / +Y up convention as the rest of the engine.
 * @see docs/PHYSICS_FOUNDATION.md for equations, coordinate/unit conventions, blockers and support
 * limits.
 */

import {
  calculatedResult,
  type CalculationResult
} from "../core/calculation-result.js";
import {
  InvalidScientificInputError,
  requirePositiveFinite
} from "../core/validation.js";

/** Ideal projection model discriminator. `rectilinear` is the engine default. */
export type LensProjectionModel =
  | "rectilinear"
  | "fisheye-equidistant"
  | "fisheye-equisolid-angle"
  | "fisheye-stereographic"
  | "fisheye-orthographic"
  | "equirectangular";

/** Radial (rotationally symmetric) projection models. */
export type RadialLensProjectionModel = Exclude<
  LensProjectionModel,
  "equirectangular"
>;

export const LENS_PROJECTION_MODELS: readonly LensProjectionModel[] =
  Object.freeze([
    "rectilinear",
    "fisheye-equidistant",
    "fisheye-equisolid-angle",
    "fisheye-stereographic",
    "fisheye-orthographic",
    "equirectangular"
  ]);

export interface LensDirection {
  /** Camera-frame direction component, +X right. Any positive length. */
  x: number;
  /** Camera-frame direction component, +Y up. */
  y: number;
  /** Camera-frame direction component along the optical axis toward the scene. */
  z: number;
}

export interface CalculateLensProjectionImagePointInput {
  projectionModel: LensProjectionModel;
  /**
   * Projection scale in millimetres: the focal length f of the mapping function, or for
   * equirectangular the image distance per radian.
   */
  focalLengthMm: number;
  /** Scene direction in the camera frame. Need not be normalized; must be non-zero. */
  direction: LensDirection;
}

export interface LensProjectionImagePoint {
  projectionModel: LensProjectionModel;
  imagePointMm: { x: number; y: number };
  /** Angle between the direction and the optical axis, in radians. */
  fieldAngleRadians: number;
  /** Distance of the image point from the optical axis, in millimetres. */
  imageRadiusMm: number;
}

export interface CalculateLensProjectionDirectionInput {
  projectionModel: LensProjectionModel;
  focalLengthMm: number;
  /** Image-plane point relative to the optical axis, in millimetres. */
  imagePointMm: { x: number; y: number };
}

export interface LensProjectionDirection {
  projectionModel: LensProjectionModel;
  /** Unit direction in the camera frame. */
  direction: LensDirection;
  fieldAngleRadians: number;
  imageRadiusMm: number;
}

export interface CalculateLensProjectionFieldOfViewInput {
  projectionModel: LensProjectionModel;
  focalLengthMm: number;
  /** Centred sensor/capture dimension along one axis through the optical axis, in mm. */
  sensorDimensionMm: number;
}

export interface CalculateLensProjectionFieldOfViewBoundsInput {
  projectionModel: LensProjectionModel;
  focalLengthMm: number;
  /** Signed minimum sensor coordinate along one axis through the optical axis, in mm. */
  minimumSensorCoordinateMm: number;
  /** Signed maximum sensor coordinate along the same axis, in mm. */
  maximumSensorCoordinateMm: number;
}

export interface LensProjectionFieldOfView {
  projectionModel: LensProjectionModel;
  degrees: number;
  radians: number;
  /** Projection scale used by the mapping, in millimetres. */
  projectionDistanceMm: number;
}

export interface LensProjectionFieldOfViewBounds {
  projectionModel: LensProjectionModel;
  minimumRadians: number;
  maximumRadians: number;
  radians: number;
  minimumDegrees: number;
  maximumDegrees: number;
  degrees: number;
  projectionDistanceMm: number;
}

const HALF_PI = Math.PI / 2;

/** Fail-closed runtime parser for the projection discriminator. */
export function parseLensProjectionModel(
  value: unknown
): LensProjectionModel {
  if (
    typeof value !== "string" ||
    !(LENS_PROJECTION_MODELS as readonly string[]).includes(value)
  ) {
    throw new InvalidScientificInputError(
      "projectionModel must be one of " +
        LENS_PROJECTION_MODELS.join(", ") +
        "."
    );
  }
  return value as LensProjectionModel;
}

function requireRecord(name: string, value: unknown): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidScientificInputError(`${name} must be an object.`);
  }
}

function requireFinite(name: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new InvalidScientificInputError(`${name} must be a finite number.`);
  }
  return value;
}

/**
 * Largest field angle (radians) a radial model maps, and whether that limit is attainable.
 * Rectilinear, stereographic and equidistant/equisolid exclude the limit (infinite radius or an
 * undefined azimuth for the backward direction); orthographic attains 90 degrees.
 */
function radialFieldAngleLimit(model: RadialLensProjectionModel): {
  radians: number;
  inclusive: boolean;
} {
  switch (model) {
    case "rectilinear":
      return { radians: HALF_PI, inclusive: false };
    case "fisheye-orthographic":
      return { radians: HALF_PI, inclusive: true };
    default:
      return { radians: Math.PI, inclusive: false };
  }
}

/** Image radius r(theta) for one radial model. */
export function radialProjectionImageRadius(
  model: RadialLensProjectionModel,
  focalLengthMm: number,
  fieldAngleRadians: number
): number {
  switch (model) {
    case "rectilinear":
      return focalLengthMm * Math.tan(fieldAngleRadians);
    case "fisheye-equidistant":
      return focalLengthMm * fieldAngleRadians;
    case "fisheye-equisolid-angle":
      return 2 * focalLengthMm * Math.sin(fieldAngleRadians / 2);
    case "fisheye-stereographic":
      return 2 * focalLengthMm * Math.tan(fieldAngleRadians / 2);
    case "fisheye-orthographic":
      return focalLengthMm * Math.sin(fieldAngleRadians);
  }
}

/**
 * Largest image radius a radial model reaches inside its field-angle domain, in mm
 * (Infinity for rectilinear and stereographic).
 */
function radialImageRadiusLimit(
  model: RadialLensProjectionModel,
  focalLengthMm: number
): { radiusMm: number; inclusive: boolean } {
  switch (model) {
    case "rectilinear":
    case "fisheye-stereographic":
      return { radiusMm: Number.POSITIVE_INFINITY, inclusive: false };
    case "fisheye-equidistant":
      return { radiusMm: Math.PI * focalLengthMm, inclusive: false };
    case "fisheye-equisolid-angle":
      return { radiusMm: 2 * focalLengthMm, inclusive: false };
    case "fisheye-orthographic":
      return { radiusMm: focalLengthMm, inclusive: true };
  }
}

/** Inverse theta(r) for one radial model; throws outside the image circle. */
export function radialProjectionFieldAngle(
  model: RadialLensProjectionModel,
  focalLengthMm: number,
  imageRadiusMm: number
): number {
  const limit = radialImageRadiusLimit(model, focalLengthMm);
  if (
    imageRadiusMm < 0 ||
    imageRadiusMm > limit.radiusMm ||
    (!limit.inclusive && imageRadiusMm === limit.radiusMm)
  ) {
    throw new InvalidScientificInputError(
      `Image radius lies outside the ${model} image circle.`
    );
  }
  switch (model) {
    case "rectilinear":
      return Math.atan(imageRadiusMm / focalLengthMm);
    case "fisheye-equidistant":
      return imageRadiusMm / focalLengthMm;
    case "fisheye-equisolid-angle":
      return 2 * Math.asin(imageRadiusMm / (2 * focalLengthMm));
    case "fisheye-stereographic":
      return 2 * Math.atan(imageRadiusMm / (2 * focalLengthMm));
    case "fisheye-orthographic":
      return Math.asin(Math.min(1, imageRadiusMm / focalLengthMm));
  }
}

function assumptions(model: LensProjectionModel): readonly string[] {
  const common = [
    "Ideal mapping function of a perfect projection; real lenses deviate from it and need calibrated distortion data",
    "Camera frame +X right, +Y up, +Z toward the scene; image plane +X right, +Y up (non-inverted)"
  ];
  if (model === "equirectangular") {
    return [
      "Equirectangular (spherical) projection: x = f * longitude, y = f * latitude, longitude measured about +Y from +Z",
      ...common
    ];
  }
  return [
    `Radial projection ${model}; image azimuth equals scene azimuth about the optical axis`,
    ...common
  ];
}

function validateCommon(
  input: { projectionModel: unknown; focalLengthMm: number },
  name: string
): LensProjectionModel {
  requireRecord(name, input);
  const model = parseLensProjectionModel(input.projectionModel);
  requirePositiveFinite("focalLengthMm", input.focalLengthMm);
  return model;
}

/**
 * Maps one camera-frame scene direction to its ideal image-plane point under the declared
 * projection model.
 */
export function calculateLensProjectionImagePoint(
  input: CalculateLensProjectionImagePointInput
): CalculationResult<LensProjectionImagePoint> {
  const model = validateCommon(input, "input");
  requireRecord("direction", input.direction);
  const x = requireFinite("direction.x", input.direction.x);
  const y = requireFinite("direction.y", input.direction.y);
  const z = requireFinite("direction.z", input.direction.z);
  const length = Math.hypot(x, y, z);
  if (!(length > 0) || !Number.isFinite(length)) {
    throw new InvalidScientificInputError(
      "direction must be a finite non-zero vector."
    );
  }
  const f = input.focalLengthMm;
  const transverse = Math.hypot(x, y);
  const fieldAngleRadians = Math.atan2(transverse, z);

  let imagePointMm: { x: number; y: number };
  if (model === "equirectangular") {
    const latitude = Math.asin(Math.max(-1, Math.min(1, y / length)));
    const horizontal = Math.hypot(x, z);
    if (horizontal === 0) {
      // Poles have an undefined longitude; the projection is singular there.
      throw new InvalidScientificInputError(
        "Equirectangular projection is undefined at the poles (direction parallel to +/-Y)."
      );
    }
    const longitude = Math.atan2(x, z);
    imagePointMm = { x: f * longitude, y: f * latitude };
  } else {
    const limit = radialFieldAngleLimit(model);
    if (
      fieldAngleRadians > limit.radians ||
      (!limit.inclusive && fieldAngleRadians === limit.radians)
    ) {
      throw new InvalidScientificInputError(
        `direction lies outside the ${model} projection domain.`
      );
    }
    const radius = radialProjectionImageRadius(model, f, fieldAngleRadians);
    imagePointMm =
      transverse === 0
        ? { x: 0, y: 0 }
        : { x: (radius * x) / transverse, y: (radius * y) / transverse };
  }

  return calculatedResult(
    {
      projectionModel: model,
      imagePointMm,
      fieldAngleRadians,
      imageRadiusMm: Math.hypot(imagePointMm.x, imagePointMm.y)
    },
    `${model}-lens-projection`,
    "1.0.0",
    assumptions(model)
  );
}

/**
 * Inverse-maps one image-plane point to its unit camera-frame scene direction under the declared
 * projection model. Points outside the model's image circle (or outside +/-pi longitude and
 * +/-pi/2 latitude for equirectangular) are rejected.
 */
export function calculateLensProjectionDirection(
  input: CalculateLensProjectionDirectionInput
): CalculationResult<LensProjectionDirection> {
  const model = validateCommon(input, "input");
  requireRecord("imagePointMm", input.imagePointMm);
  const px = requireFinite("imagePointMm.x", input.imagePointMm.x);
  const py = requireFinite("imagePointMm.y", input.imagePointMm.y);
  const f = input.focalLengthMm;
  const imageRadiusMm = Math.hypot(px, py);

  let direction: LensDirection;
  if (model === "equirectangular") {
    const longitude = px / f;
    const latitude = py / f;
    if (Math.abs(longitude) > Math.PI || Math.abs(latitude) > HALF_PI) {
      throw new InvalidScientificInputError(
        "imagePointMm lies outside the equirectangular longitude/latitude domain."
      );
    }
    const cosLatitude = Math.cos(latitude);
    direction = {
      x: cosLatitude * Math.sin(longitude),
      y: Math.sin(latitude),
      z: cosLatitude * Math.cos(longitude)
    };
  } else {
    const theta = radialProjectionFieldAngle(model, f, imageRadiusMm);
    const sinTheta = Math.sin(theta);
    direction =
      imageRadiusMm === 0
        ? { x: 0, y: 0, z: 1 }
        : {
            x: (sinTheta * px) / imageRadiusMm,
            y: (sinTheta * py) / imageRadiusMm,
            z: Math.cos(theta)
          };
  }

  return calculatedResult(
    {
      projectionModel: model,
      direction,
      fieldAngleRadians: Math.atan2(
        Math.hypot(direction.x, direction.y),
        direction.z
      ),
      imageRadiusMm
    },
    `inverse-${model}-lens-projection`,
    "1.0.0",
    assumptions(model)
  );
}

/** Signed angle subtended along one axis through the optical axis for a signed coordinate. */
function signedAxisAngle(
  model: LensProjectionModel,
  focalLengthMm: number,
  coordinateMm: number
): number {
  if (model === "equirectangular") {
    // Along a horizontal or vertical line through the centre the angle is linear in position.
    return coordinateMm / focalLengthMm;
  }
  const theta = radialProjectionFieldAngle(
    model,
    focalLengthMm,
    Math.abs(coordinateMm)
  );
  return coordinateMm < 0 ? -theta : theta;
}

/**
 * Angular field of view across a centred sensor dimension along one axis through the optical
 * axis: 2 * theta(d / 2) for radial models and d / f for equirectangular.
 *
 * For equirectangular the result is the longitude span when the dimension is horizontal and the
 * latitude span when it is vertical. Sensor dimensions larger than a fisheye's image circle are
 * rejected rather than clipped.
 */
export function calculateLensProjectionFieldOfView(
  input: CalculateLensProjectionFieldOfViewInput
): CalculationResult<LensProjectionFieldOfView> {
  const model = validateCommon(input, "input");
  requirePositiveFinite("sensorDimensionMm", input.sensorDimensionMm);
  const radians =
    2 *
    signedAxisAngle(model, input.focalLengthMm, input.sensorDimensionMm / 2);
  if (model === "equirectangular" && radians > 2 * Math.PI) {
    throw new InvalidScientificInputError(
      "sensorDimensionMm exceeds the full 360-degree equirectangular span."
    );
  }
  return calculatedResult(
    {
      projectionModel: model,
      radians,
      degrees: (radians * 180) / Math.PI,
      projectionDistanceMm: input.focalLengthMm
    },
    `${model}-field-of-view`,
    "1.0.0",
    [
      ...assumptions(model),
      "Field of view is measured along one axis through the optical axis"
    ]
  );
}

/**
 * Asymmetric angular span between two signed sensor coordinates on one axis through the optical
 * axis, for off-centre crops.
 */
export function calculateLensProjectionFieldOfViewBounds(
  input: CalculateLensProjectionFieldOfViewBoundsInput
): CalculationResult<LensProjectionFieldOfViewBounds> {
  const model = validateCommon(input, "input");
  const minimum = requireFinite(
    "minimumSensorCoordinateMm",
    input.minimumSensorCoordinateMm
  );
  const maximum = requireFinite(
    "maximumSensorCoordinateMm",
    input.maximumSensorCoordinateMm
  );
  if (maximum <= minimum) {
    throw new InvalidScientificInputError(
      "maximumSensorCoordinateMm must be greater than minimumSensorCoordinateMm."
    );
  }
  const minimumRadians = signedAxisAngle(model, input.focalLengthMm, minimum);
  const maximumRadians = signedAxisAngle(model, input.focalLengthMm, maximum);
  const radians = maximumRadians - minimumRadians;
  if (model === "equirectangular" && radians > 2 * Math.PI) {
    throw new InvalidScientificInputError(
      "Sensor bounds exceed the full 360-degree equirectangular span."
    );
  }
  return calculatedResult(
    {
      projectionModel: model,
      minimumRadians,
      maximumRadians,
      radians,
      minimumDegrees: (minimumRadians * 180) / Math.PI,
      maximumDegrees: (maximumRadians * 180) / Math.PI,
      degrees: (radians * 180) / Math.PI,
      projectionDistanceMm: input.focalLengthMm
    },
    `asymmetric-${model}-field-of-view`,
    "1.0.0",
    [
      ...assumptions(model),
      "Signed sensor-plane bounds are measured relative to the optical axis along one axis through it"
    ]
  );
}
