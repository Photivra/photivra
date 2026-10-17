# optics/sensor-environment-query.ts public contracts

The package and root API versions are recorded once in [Navigation](../API_REFERENCE.md) · [Developer guide](https://github.com/Photivra/photivra/blob/main/docs/DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

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
  /** Optional 2.0 lens field mapping; omitted keeps the ideal rectilinear, distortion-free query. */
  lensFieldMapping?: EnvironmentLensFieldMapping;
}
```

## EnvironmentLensFieldMapping

Lens field mapping between the physical (distorted) sensor point and the scene ray (2.0).
`radiometricAreaCorrection` makes ownership of the distortion area factor explicit: the
environment photo signal multiplies irradiance by 1 / det(d distorted / d ideal) exactly once,
so a supplied field-throughput profile must not also contain it.

```ts
export interface EnvironmentLensFieldMapping {
  projectionModel: LensProjectionModel;
  distortion:
    | { kind: "none" }
    | { kind: "radial"; profile: RadialDistortionProfile }
    | { kind: "brown-conrady"; profile: BrownConradyDistortionProfile };
  radiometricAreaCorrection: "inverse-distortion-jacobian";
}
```

## SensorEnvironmentLensFieldMappingResult

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorEnvironmentLensFieldMappingResult {
  projectionModel: LensProjectionModel;
  distortionKind: "none" | "radial" | "brown-conrady";
  /** Ideal (undistorted) image-plane point, +X right / +Y up, mm. */
  idealImagePointMm: { x: number; y: number };
  /** Projection scale: thin-lens image distance at finite focus, focal length at infinity, mm. */
  projectionScaleMm: number;
  /** 1 / det(d distorted / d ideal) at this point; 1 without distortion. */
  distortionAreaFactor: number;
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
  /** Rectilinear rotation mapping; null when a non-rectilinear lens field mapping is used. */
  projection: ReturnType<typeof calculateInverseCameraRotationImageMapping> | null;
  /** Present only when the input declared a lens field mapping. */
  lensFieldMapping?: SensorEnvironmentLensFieldMappingResult;
  targetMeaning: "environment-direction-in-exposure-start-camera-axes";
  directionConvention: "outgoing-radiance-toward-camera";
  geometricRayProjectionCalculated: true;
  sceneIntersectionCalculated: false;
  visibilityCalculated: false;
  providerExecuted: false;
}
```
