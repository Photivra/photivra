// SPDX-License-Identifier: Apache-2.0

import {
  calculatedResult,
  type CalculationResult
} from "../core/calculation-result.js";
import {
  InvalidScientificInputError,
  requirePositiveFinite
} from "../core/validation.js";
import { calculateThinLensImageDistance } from "../optics/thin-lens.js";

export interface CameraAngularVelocityRadPerSec {
  /** Right-hand rotation rate about camera +X (right), in radians per second. */
  pitch: number;
  /** Right-hand rotation rate about camera +Y (up), in radians per second. */
  yaw: number;
  /** Right-hand rotation rate about camera +Z (forward), in radians per second. */
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
   * Components follow the right-hand rule around the initial camera axes:
   * pitch about +X, yaw about +Y, roll about +Z.
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
  deltaSamples?: {
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

function rotateVectorByAxisAngle(
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

  let mappedRay = initialRay;
  if (angularMagnitude !== 0) {
    const inverseAxis = {
      x: angularDisplacementRad.pitch / angularMagnitude,
      y: angularDisplacementRad.yaw / angularMagnitude,
      z: angularDisplacementRad.roll / angularMagnitude
    };
    mappedRay = rotateVectorByAxisAngle(
      initialRay,
      inverseAxis,
      -angularMagnitude
    );
  }

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

  let deltaSamples:
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
    deltaSamples = {
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
      ...(deltaSamples === undefined ? {} : { deltaSamples })
    },
    focusAware
      ? "focus-aware-spatial-camera-rotation-mapping"
      : "spatial-camera-rotation-mapping",
    "1.0.0",
    [
      "Ideal rectilinear projection",
      focusAware
        ? "Thin-lens image distance for the selected focus plane is used as the projection distance"
        : "Nominal focal length is used as the infinity-focus projection distance",
      "Camera angular velocity is constant during the evaluated interval",
      "Angular velocity is integrated as one axis-angle vector about the initial camera axes",
      "Positive pitch/yaw/roll follow the right-hand rule about camera +X/+Y/+Z",
      "The world ray is stationary; subject motion is not included",
      "Camera translation and depth-dependent parallax are not modeled",
      "The stationary world ray is transformed by the inverse camera rotation before rectilinear projection"
    ]
  );
}
