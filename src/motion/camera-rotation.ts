// SPDX-License-Identifier: Apache-2.0

/**
 * Module boundary and integration notes.
 * Maps one stationary-world ray to its image-plane location after pure camera rotation at an arbitrary
 * physical time from exposure start. The initial image point defines the world ray in the camera frame
 * at t=0. Constant angular velocity is integrated as one axis-angle rotation vector, avoiding
 * Euler-order dependence. The stationary world ray is then expressed in the rotated camera frame using
 * the inverse camera rotation and projected rectilinearly back onto the image plane. This function
 * models rotation only. It deliberately excludes camera translation because translational optical flow
 * depends on scene depth.
 * Maps a captured stationary-world ray at one non-negative capture time back to its image-plane
 * location at exposure start. For the existing constant-axis pure-rotation model this inverse is
 * analytic: the captured ray is transformed by the forward camera rotation before rectilinear
 * projection. No iterative solver is required.
 * @see docs/MOTION_AND_SIGNAL.md for equations, coordinate/unit conventions, blockers and support
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
import { calculateThinLensImageDistance } from "../optics/thin-lens.js";

/**
 * Camera angular velocity in radians per second about the exposure-start
 * camera axes (+X right, +Y up, +Z forward along the optical axis).
 *
 * Signs follow the physical right-hand rule about each named axis. That basis
 * is left-handed, so a positive rotation is the mirror of what the plain
 * component Rodrigues/cross-product formula would give in it:
 *
 * - positive pitch tilts the optical axis up; stationary scene content moves
 *   toward image -Y (down);
 * - positive yaw turns the optical axis to the left (counter-clockwise seen
 *   from above); stationary scene content moves toward image +X (right);
 * - positive roll rotates the camera clockwise as seen by the photographer
 *   looking along +Z; stationary scene content rotates counter-clockwise in the
 *   +X-right/+Y-up image plane.
 */
export interface CameraAngularVelocityRadPerSec {
  /** Right-hand rotation rate about camera +X (right): positive tilts the optical axis up. */
  pitch: number;
  /** Right-hand rotation rate about camera +Y (up): positive turns the optical axis left. */
  yaw: number;
  /** Right-hand rotation rate about camera +Z (forward): positive rolls the camera clockwise as seen from behind it. */
  roll: number;
}

export interface ImagePlanePointMm {
  /** Image-plane X coordinate relative to the optical axis, in millimetres. */
  x: number;
  /** Image-plane Y coordinate relative to the optical axis, in millimetres. */
  y: number;
}

export interface AxisSamplingPitchMicrometers {
  x: number;
  y: number;
}

export interface CalculateCameraRotationImageMappingInput {
  /** Physical focal length in millimetres. */
  focalLengthMm: number;
  /**
   * Stationary-world-ray image-plane position at exposure start.
   *
   * Image-plane coordinates use optical-axis origin, +X right, +Y up.
   */
  imagePointMm: ImagePlanePointMm;
  /**
   * Time in seconds from exposure start. Must be greater than or equal to zero.
   */
  timeSecondsFromExposureStart: number;
  /**
   * Constant camera angular-velocity vector in radians per second.
   *
   * Components are resolved in the camera axes at exposure start and follow
   * the physical right-hand rule: pitch about +X (positive tilts up, content
   * moves toward image -Y), yaw about +Y (positive turns left, content moves
   * toward image +X), roll about +Z (positive is clockwise seen from behind
   * the camera). See CameraAngularVelocityRadPerSec.
   */
  angularVelocityRadPerSec: CameraAngularVelocityRadPerSec;
  /** Optional focus distance in metres for thin-lens projection distance. */
  focusDistanceM?: number;
  /**
   * Optional axis-aware geometric sampling pitch for reporting sample-domain
   * displacement. This is geometric sample spacing, not photosite collection
   * area.
   */
  samplingPitchMicrometers?: AxisSamplingPitchMicrometers;
}

export interface CameraRotationImageMapping {
  projectionDistanceMm: number;
  timeSecondsFromExposureStart: number;
  angularDisplacementRad: {
    pitch: number;
    yaw: number;
    roll: number;
    magnitude: number;
  };
  startImagePointMm: ImagePlanePointMm;
  mappedImagePointMm: ImagePlanePointMm;
  deltaMm: {
    x: number;
    y: number;
    distance: number;
  };
  /**
   * Optional geometric sample displacement in the image-plane basis
   * (+X right, +Y up). This is not a native-raster vector.
   */
  deltaImagePlaneSamples?: {
    x: number;
    y: number;
    distance: number;
  };
}

export interface CalculateInverseCameraRotationImageMappingInput {
  /** Physical focal length in millimetres. */
  focalLengthMm: number;
  /**
   * Captured image-plane location of a stationary world ray at the requested
   * time. Coordinates use optical-axis origin, +X right and +Y up.
   */
  imagePointMm: ImagePlanePointMm;
  /**
   * Capture time in seconds from exposure start. Must be greater than or equal
   * to zero.
   */
  timeSecondsFromExposureStart: number;
  /**
   * Constant camera angular-velocity vector in radians per second, with the
   * same sign/axis semantics as calculateCameraRotationImageMapping().
   */
  angularVelocityRadPerSec: CameraAngularVelocityRadPerSec;
  /** Optional focus distance in metres for thin-lens projection distance. */
  focusDistanceM?: number;
  /**
   * Optional axis-aware geometric sampling pitch for reporting sample-domain
   * inverse displacement.
   */
  samplingPitchMicrometers?: AxisSamplingPitchMicrometers;
}

export interface InverseCameraRotationImageMapping {
  projectionDistanceMm: number;
  timeSecondsFromExposureStart: number;
  angularDisplacementRad: {
    pitch: number;
    yaw: number;
    roll: number;
    magnitude: number;
  };
  capturedImagePointMm: ImagePlanePointMm;
  referenceImagePointMm: ImagePlanePointMm;
  /**
   * Reference-minus-captured displacement in the image-plane basis.
   */
  deltaMm: {
    x: number;
    y: number;
    distance: number;
  };
  deltaImagePlaneSamples?: {
    x: number;
    y: number;
    distance: number;
  };
}

interface Vector3 {
  x: number;
  y: number;
  z: number;
}

function requireFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new InvalidScientificInputError(`${name} must be finite.`);
  }
}

function requireNonNegativeFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new InvalidScientificInputError(
      `${name} must be finite and greater than or equal to zero.`
    );
  }
}

/**
 * Internal component-form Rodrigues rotation (v cos a + (k x v) sin a +
 * k (k . v)(1 - cos a)), with the cross product evaluated by its usual
 * component formula. In the left-handed camera basis this is a physical
 * left-hand rotation; camera-rotation callers must use
 * applyPhysicalCameraRotation() instead so the right-hand sign convention
 * stays in one place.
 */
export function rotateVectorByAxisAngle(
  vector: Vector3,
  axis: Vector3,
  angleRad: number
): Vector3 {
  if (angleRad === 0) {
    return { ...vector };
  }

  const cosine = Math.cos(angleRad);
  const sine = Math.sin(angleRad);
  const oneMinusCosine = 1 - cosine;
  const dot =
    axis.x * vector.x +
    axis.y * vector.y +
    axis.z * vector.z;
  const cross = {
    x: axis.y * vector.z - axis.z * vector.y,
    y: axis.z * vector.x - axis.x * vector.z,
    z: axis.x * vector.y - axis.y * vector.x
  };

  return {
    x:
      vector.x * cosine +
      cross.x * sine +
      axis.x * dot * oneMinusCosine,
    y:
      vector.y * cosine +
      cross.y * sine +
      axis.y * dot * oneMinusCosine,
    z:
      vector.z * cosine +
      cross.z * sine +
      axis.z * dot * oneMinusCosine
  };
}

/**
 * Internal: applies the physical camera rotation for one right-hand angular
 * displacement (pitch/yaw/roll about camera +X/+Y/+Z, radians) to a vector in
 * camera components.
 *
 * - "camera-to-reference" applies R: a ray expressed in the rotated camera
 *   frame is re-expressed in the exposure-start (reference) camera frame.
 * - "reference-to-camera" applies R^-1: a stationary reference ray is
 *   expressed in the rotated camera frame.
 *
 * Because the camera basis is left-handed, the physical right-hand rotation R
 * is the component Rodrigues formula with the angle negated.
 */
export function applyPhysicalCameraRotation(
  vector: Vector3,
  angularDisplacementRad: { pitch: number; yaw: number; roll: number },
  direction: "camera-to-reference" | "reference-to-camera"
): Vector3 {
  const magnitude = Math.hypot(
    angularDisplacementRad.pitch,
    angularDisplacementRad.yaw,
    angularDisplacementRad.roll
  );
  if (magnitude === 0) {
    return { ...vector };
  }
  const axis = {
    x: angularDisplacementRad.pitch / magnitude,
    y: angularDisplacementRad.yaw / magnitude,
    z: angularDisplacementRad.roll / magnitude
  };
  return rotateVectorByAxisAngle(
    vector,
    axis,
    direction === "camera-to-reference" ? -magnitude : magnitude
  );
}

function resolveProjectionDistanceMm(
  focalLengthMm: number,
  focusDistanceM: number | undefined
): {
  projectionDistanceMm: number;
  focusAware: boolean;
} {
  const projection =
    focusDistanceM === undefined
      ? undefined
      : calculateThinLensImageDistance({
          focalLengthMm,
          objectDistanceM: focusDistanceM
        });

  return {
    projectionDistanceMm:
      projection?.value.imageDistanceMm ?? focalLengthMm,
    focusAware: projection !== undefined
  };
}

/**
 * Maps one stationary-world ray to its image-plane location after pure camera
 * rotation at an arbitrary physical time from exposure start.
 *
 * The initial image point defines the world ray in the camera frame at t=0.
 * Constant angular velocity is integrated as one axis-angle rotation vector,
 * avoiding Euler-order dependence. The stationary world ray is then expressed
 * in the rotated camera frame using the inverse camera rotation and projected
 * rectilinearly back onto the image plane.
 *
 * This function models rotation only. It deliberately excludes camera
 * translation because translational optical flow depends on scene depth.
 *
 * @returns Field-position-dependent image-plane mapping and displacement.
 */
export function calculateCameraRotationImageMapping(
  input: CalculateCameraRotationImageMappingInput
): CalculationResult<CameraRotationImageMapping> {
  requirePositiveFinite("focalLengthMm", input.focalLengthMm);
  requireFinite("imagePointMm.x", input.imagePointMm.x);
  requireFinite("imagePointMm.y", input.imagePointMm.y);
  requireNonNegativeFinite(
    "timeSecondsFromExposureStart",
    input.timeSecondsFromExposureStart
  );
  requireFinite(
    "angularVelocityRadPerSec.pitch",
    input.angularVelocityRadPerSec.pitch
  );
  requireFinite(
    "angularVelocityRadPerSec.yaw",
    input.angularVelocityRadPerSec.yaw
  );
  requireFinite(
    "angularVelocityRadPerSec.roll",
    input.angularVelocityRadPerSec.roll
  );

  if (input.samplingPitchMicrometers !== undefined) {
    requirePositiveFinite(
      "samplingPitchMicrometers.x",
      input.samplingPitchMicrometers.x
    );
    requirePositiveFinite(
      "samplingPitchMicrometers.y",
      input.samplingPitchMicrometers.y
    );
  }

  const { projectionDistanceMm, focusAware } =
    resolveProjectionDistanceMm(
      input.focalLengthMm,
      input.focusDistanceM
    );

  const angularDisplacementRad = {
    pitch:
      input.angularVelocityRadPerSec.pitch *
      input.timeSecondsFromExposureStart,
    yaw:
      input.angularVelocityRadPerSec.yaw *
      input.timeSecondsFromExposureStart,
    roll:
      input.angularVelocityRadPerSec.roll *
      input.timeSecondsFromExposureStart
  };
  const angularMagnitude = Math.hypot(
    angularDisplacementRad.pitch,
    angularDisplacementRad.yaw,
    angularDisplacementRad.roll
  );

  const initialRay: Vector3 = {
    x: input.imagePointMm.x / projectionDistanceMm,
    y: input.imagePointMm.y / projectionDistanceMm,
    z: 1
  };

  const mappedRay = applyPhysicalCameraRotation(
    initialRay,
    angularDisplacementRad,
    "reference-to-camera"
  );

  if (!Number.isFinite(mappedRay.z) || mappedRay.z <= 0) {
    throw new InvalidScientificInputError(
      "Camera rotation maps the requested world ray to or behind the camera plane."
    );
  }

  const mappedImagePointMm = {
    x: projectionDistanceMm * (mappedRay.x / mappedRay.z),
    y: projectionDistanceMm * (mappedRay.y / mappedRay.z)
  };
  const deltaMm = {
    x: mappedImagePointMm.x - input.imagePointMm.x,
    y: mappedImagePointMm.y - input.imagePointMm.y,
    distance: Math.hypot(
      mappedImagePointMm.x - input.imagePointMm.x,
      mappedImagePointMm.y - input.imagePointMm.y
    )
  };

  let deltaImagePlaneSamples:
    | {
        x: number;
        y: number;
        distance: number;
      }
    | undefined;
  if (input.samplingPitchMicrometers !== undefined) {
    const pitchXmm = input.samplingPitchMicrometers.x / 1000;
    const pitchYmm = input.samplingPitchMicrometers.y / 1000;
    const sampleX = deltaMm.x / pitchXmm;
    const sampleY = deltaMm.y / pitchYmm;
    deltaImagePlaneSamples = {
      x: sampleX,
      y: sampleY,
      distance: Math.hypot(sampleX, sampleY)
    };
  }

  return calculatedResult(
    {
      projectionDistanceMm,
      timeSecondsFromExposureStart:
        input.timeSecondsFromExposureStart,
      angularDisplacementRad: {
        ...angularDisplacementRad,
        magnitude: angularMagnitude
      },
      startImagePointMm: { ...input.imagePointMm },
      mappedImagePointMm,
      deltaMm,
      ...(deltaImagePlaneSamples === undefined
        ? {}
        : { deltaImagePlaneSamples })
    },
    focusAware
      ? "focus-aware-spatial-camera-rotation-mapping"
      : "spatial-camera-rotation-mapping",
    "2.0.0",
    [
      "Ideal rectilinear projection",
      focusAware
        ? "Thin-lens image distance for the selected focus plane is used as the projection distance"
        : "Nominal focal length is used as the infinity-focus projection distance",
      "Camera angular velocity is constant during the evaluated interval",
      "Angular velocity components are resolved in the camera axes at exposure start and integrated as one axis-angle vector",
      "Positive pitch/yaw/roll follow the physical right-hand rule about camera +X/+Y/+Z (pitch up, yaw left, roll clockwise seen from behind); the camera basis is left-handed",
      "The world ray is stationary; subject motion is not included",
      "Camera translation and depth-dependent parallax are not modeled",
      "The stationary world ray is transformed by the inverse camera rotation before rectilinear projection"
    ]
  );
}


/**
 * Maps a captured stationary-world ray at one non-negative capture time back
 * to its image-plane location at exposure start.
 *
 * For the existing constant-axis pure-rotation model this inverse is analytic:
 * the captured ray is transformed by the forward camera rotation before
 * rectilinear projection. No iterative solver is required.
 */
export function calculateInverseCameraRotationImageMapping(
  input: CalculateInverseCameraRotationImageMappingInput
): CalculationResult<InverseCameraRotationImageMapping> {
  requirePositiveFinite("focalLengthMm", input.focalLengthMm);
  requireFinite("imagePointMm.x", input.imagePointMm.x);
  requireFinite("imagePointMm.y", input.imagePointMm.y);
  requireNonNegativeFinite(
    "timeSecondsFromExposureStart",
    input.timeSecondsFromExposureStart
  );
  requireFinite(
    "angularVelocityRadPerSec.pitch",
    input.angularVelocityRadPerSec.pitch
  );
  requireFinite(
    "angularVelocityRadPerSec.yaw",
    input.angularVelocityRadPerSec.yaw
  );
  requireFinite(
    "angularVelocityRadPerSec.roll",
    input.angularVelocityRadPerSec.roll
  );

  if (input.samplingPitchMicrometers !== undefined) {
    requirePositiveFinite(
      "samplingPitchMicrometers.x",
      input.samplingPitchMicrometers.x
    );
    requirePositiveFinite(
      "samplingPitchMicrometers.y",
      input.samplingPitchMicrometers.y
    );
  }

  const { projectionDistanceMm, focusAware } =
    resolveProjectionDistanceMm(
      input.focalLengthMm,
      input.focusDistanceM
    );

  const angularDisplacementRad = {
    pitch:
      input.angularVelocityRadPerSec.pitch *
      input.timeSecondsFromExposureStart,
    yaw:
      input.angularVelocityRadPerSec.yaw *
      input.timeSecondsFromExposureStart,
    roll:
      input.angularVelocityRadPerSec.roll *
      input.timeSecondsFromExposureStart
  };
  const angularMagnitude = Math.hypot(
    angularDisplacementRad.pitch,
    angularDisplacementRad.yaw,
    angularDisplacementRad.roll
  );

  const capturedRay: Vector3 = {
    x: input.imagePointMm.x / projectionDistanceMm,
    y: input.imagePointMm.y / projectionDistanceMm,
    z: 1
  };

  const referenceRay = applyPhysicalCameraRotation(
    capturedRay,
    angularDisplacementRad,
    "camera-to-reference"
  );

  if (!Number.isFinite(referenceRay.z) || referenceRay.z <= 0) {
    throw new InvalidScientificInputError(
      "Inverse camera rotation maps the requested captured ray to or behind the reference camera plane."
    );
  }

  const referenceImagePointMm = {
    x: projectionDistanceMm * (referenceRay.x / referenceRay.z),
    y: projectionDistanceMm * (referenceRay.y / referenceRay.z)
  };
  const deltaMm = {
    x: referenceImagePointMm.x - input.imagePointMm.x,
    y: referenceImagePointMm.y - input.imagePointMm.y,
    distance: Math.hypot(
      referenceImagePointMm.x - input.imagePointMm.x,
      referenceImagePointMm.y - input.imagePointMm.y
    )
  };

  let deltaImagePlaneSamples:
    | {
        x: number;
        y: number;
        distance: number;
      }
    | undefined;
  if (input.samplingPitchMicrometers !== undefined) {
    const pitchXmm = input.samplingPitchMicrometers.x / 1000;
    const pitchYmm = input.samplingPitchMicrometers.y / 1000;
    const sampleX = deltaMm.x / pitchXmm;
    const sampleY = deltaMm.y / pitchYmm;
    deltaImagePlaneSamples = {
      x: sampleX,
      y: sampleY,
      distance: Math.hypot(sampleX, sampleY)
    };
  }

  return calculatedResult(
    {
      projectionDistanceMm,
      timeSecondsFromExposureStart:
        input.timeSecondsFromExposureStart,
      angularDisplacementRad: {
        ...angularDisplacementRad,
        magnitude: angularMagnitude
      },
      capturedImagePointMm: { ...input.imagePointMm },
      referenceImagePointMm,
      deltaMm,
      ...(deltaImagePlaneSamples === undefined
        ? {}
        : { deltaImagePlaneSamples })
    },
    focusAware
      ? "focus-aware-inverse-spatial-camera-rotation-mapping"
      : "inverse-spatial-camera-rotation-mapping",
    "2.0.0",
    [
      "Ideal rectilinear projection",
      focusAware
        ? "Thin-lens image distance for the selected focus plane is used as the projection distance"
        : "Nominal focal length is used as the infinity-focus projection distance",
      "Camera angular velocity is constant during the evaluated interval",
      "Angular velocity components are resolved in the camera axes at exposure start and integrated as one axis-angle vector",
      "Positive pitch/yaw/roll follow the physical right-hand rule about camera +X/+Y/+Z (pitch up, yaw left, roll clockwise seen from behind); the camera basis is left-handed",
      "The inverse is analytic under the same constant-axis pure-rotation model; no iterative solve is used",
      "The captured stationary-world ray is transformed by the forward camera rotation to recover its exposure-start reference ray",
      "Camera translation, scene depth parallax and subject motion are not modeled"
    ]
  );
}
