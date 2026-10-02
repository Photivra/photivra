// SPDX-License-Identifier: Apache-2.0

import { approximationResult, type CalculationResult } from "../core/calculation-result.js";
import { InvalidScientificInputError } from "../core/validation.js";
import { calculateInverseCameraRotationImageMapping,
  type CameraAngularVelocityRadPerSec } from "../motion/camera-rotation.js";
import { parseSceneRadianceEvaluationRequest, type SceneRadianceEvaluationRequest } from "../schema/scene-radiance.js";
import { parseFocusPlane, type FocusPlane } from "./focus-state.js";

export interface CalculateSensorEnvironmentRadianceQueryInput {
  /** Pre-AA or pre-PSF optical support, native +X right/+Y down, mm about optical axis. */
  sourcePointNativeSensorMm: { x: number; y: number };
  focalLengthMm: number;
  focus: FocusPlane;
  angularVelocityRadPerSec: CameraAngularVelocityRadPerSec;
  /** Explicitly maps the shutter opening boundary to the rotation model's t=0. */
  timeReference: "first-opening-boundary-phase";
  timeSecondsFromOpeningReference: number;
  /** Environment request uses radiance propagation toward the camera, opposite the look ray. */
  environmentDirectionConvention: "outgoing-radiance-toward-camera";
  request: Omit<SceneRadianceEvaluationRequest, "target" | "timeSecondsFromExposureStart">;
}

export interface SensorEnvironmentRadianceQuery {
  request: SceneRadianceEvaluationRequest;
  sourcePointNativeSensorMm: { x: number; y: number };
  sourcePointImagePlaneMm: { x: number; y: number };
  referenceLookDirectionUnitVector: { x: number; y: number; z: number };
  projection: ReturnType<typeof calculateInverseCameraRotationImageMapping>;
  targetMeaning: "environment-direction-in-exposure-start-camera-axes";
  directionConvention: "outgoing-radiance-toward-camera";
  geometricRayProjectionCalculated: true;
  sceneIntersectionCalculated: false;
  visibilityCalculated: false;
  providerExecuted: false;
}

/**
 * Generate an environment radiance request from physical sensor support using
 * the existing focus-aware ideal projection and analytic inverse camera rotation.
 * Native Y is explicitly inverted; the provider direction is opposite the
 * exposure-start look ray. No scene intersection, radiance or renderer executes.
 */
export function calculateSensorEnvironmentRadianceQuery(
  input: CalculateSensorEnvironmentRadianceQueryInput
): CalculationResult<SensorEnvironmentRadianceQuery> {
  if (input.timeReference !== "first-opening-boundary-phase" ||
    input.environmentDirectionConvention !== "outgoing-radiance-toward-camera") {
    throw new InvalidScientificInputError("Environment projection requires explicit opening-boundary time and outgoing-toward-camera direction conventions.");
  }
  const focus = parseFocusPlane(input.focus);
  const sourcePointImagePlaneMm = { x: input.sourcePointNativeSensorMm.x, y: -input.sourcePointNativeSensorMm.y };
  const projection = calculateInverseCameraRotationImageMapping({ focalLengthMm: input.focalLengthMm,
    imagePointMm: sourcePointImagePlaneMm, angularVelocityRadPerSec: input.angularVelocityRadPerSec,
    timeSecondsFromExposureStart: input.timeSecondsFromOpeningReference,
    ...(focus.kind === "finite" ? { focusDistanceM: focus.distanceM } : {}) });
  const point = projection.value.referenceImagePointMm, z = projection.value.projectionDistanceMm;
  const length = Math.hypot(point.x, point.y, z);
  const referenceLookDirectionUnitVector = { x: point.x/length, y: point.y/length, z: z/length };
  const ray = referenceLookDirectionUnitVector;
  const request = parseSceneRadianceEvaluationRequest({ ...input.request,
    timeSecondsFromExposureStart: input.timeSecondsFromOpeningReference,
    target: { kind: "environment-direction", outgoingDirectionUnitVector: { x: -ray.x, y: -ray.y, z: -ray.z } } });
  return approximationResult({ request, sourcePointNativeSensorMm: { ...input.sourcePointNativeSensorMm },
    sourcePointImagePlaneMm, referenceLookDirectionUnitVector, projection,
    targetMeaning: "environment-direction-in-exposure-start-camera-axes", directionConvention: "outgoing-radiance-toward-camera",
    geometricRayProjectionCalculated: true, sceneIntersectionCalculated: false, visibilityCalculated: false, providerExecuted: false
  }, "sensor-environment-radiance-query", "0.1.0", [
    "Ideal focus-aware rectilinear projection and constant-axis pure camera rotation; reference ray must stay in the forward hemisphere.",
    "The environment and rotation reference axes coincide with camera axes at the first opening boundary by explicit convention.",
    "Lens distortion, breathing, chromatic field mapping, translation/parallax and scene intersections remain separate."
  ]);
}
