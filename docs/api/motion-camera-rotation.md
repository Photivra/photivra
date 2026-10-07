# motion/camera-rotation.ts public contracts

Package **1.5.0**, root API **1.5.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## AxisSamplingPitchMicrometers

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface AxisSamplingPitchMicrometers {
  x: number;
  y: number;
}
```

## calculateCameraRotationImageMapping

Maps one stationary-world ray to its image-plane location after pure camera
rotation at an arbitrary physical time from exposure start.

The initial image point defines the world ray in the camera frame at t=0.
Constant angular velocity is integrated as one axis-angle rotation vector,
avoiding Euler-order dependence. The stationary world ray is then expressed
in the rotated camera frame using the inverse camera rotation and projected
rectilinearly back onto the image plane.

This function models rotation only. It deliberately excludes camera
translation because translational optical flow depends on scene depth.

```ts
export function calculateCameraRotationImageMapping(
  input: CalculateCameraRotationImageMappingInput
): CalculationResult<CameraRotationImageMapping>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateCameraRotationImageMappingInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
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
   * the right-hand rule: pitch about +X, yaw about +Y, roll about +Z.
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
```

## calculateInverseCameraRotationImageMapping

Maps a captured stationary-world ray at one non-negative capture time back
to its image-plane location at exposure start.

For the existing constant-axis pure-rotation model this inverse is analytic:
the captured ray is transformed by the forward camera rotation before
rectilinear projection. No iterative solver is required.

```ts
export function calculateInverseCameraRotationImageMapping(
  input: CalculateInverseCameraRotationImageMappingInput
): CalculationResult<InverseCameraRotationImageMapping>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateInverseCameraRotationImageMappingInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
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
```

## CameraAngularVelocityRadPerSec

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CameraAngularVelocityRadPerSec {
  /** Right-hand rotation rate about camera +X (right), in radians per second. */
  pitch: number;
  /** Right-hand rotation rate about camera +Y (up), in radians per second. */
  yaw: number;
  /** Right-hand rotation rate about camera +Z (forward), in radians per second. */
  roll: number;
}
```

## CameraRotationImageMapping

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
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
```

## ImagePlanePointMm

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ImagePlanePointMm {
  /** Image-plane X coordinate relative to the optical axis, in millimetres. */
  x: number;
  /** Image-plane Y coordinate relative to the optical axis, in millimetres. */
  y: number;
}
```

## InverseCameraRotationImageMapping

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
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
```
