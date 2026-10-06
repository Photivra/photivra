# optics/sensor-environment-query.ts public contracts

Package **1.5.0**, root API **1.5.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateSensorEnvironmentRadianceQuery

Generate an environment radiance request from physical sensor support using
the existing focus-aware ideal projection and analytic inverse camera rotation.
Native Y is explicitly inverted; the provider direction is opposite the
exposure-start look ray. No scene intersection, radiance or renderer executes.

```ts
export function calculateSensorEnvironmentRadianceQuery(
  input: CalculateSensorEnvironmentRadianceQueryInput
): CalculationResult<SensorEnvironmentRadianceQuery>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateSensorEnvironmentRadianceQueryInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
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
```

## SensorEnvironmentRadianceQuery

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
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
```
