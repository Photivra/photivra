# motion/camera-rotation.ts public contracts

The package and root API versions are recorded once in [Navigation](../API_REFERENCE.md) · [Developer guide](https://github.com/Photivra/photivra/blob/main/docs/DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

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

Camera angular velocity in radians per second about the exposure-start
camera axes (+X right, +Y up, +Z forward along the optical axis).

Signs follow the physical right-hand rule about each named axis. That basis
is left-handed, so a positive rotation is the mirror of what the plain
component Rodrigues/cross-product formula would give in it:

- positive pitch tilts the optical axis up; stationary scene content moves
  toward image -Y (down);
- positive yaw turns the optical axis to the left (counter-clockwise seen
  from above); stationary scene content moves toward image +X (right);
- positive roll rotates the camera clockwise as seen by the photographer
  looking along +Z; stationary scene content rotates counter-clockwise in the
  +X-right/+Y-up image plane.

```ts
export interface CameraAngularVelocityRadPerSec {
  /** Right-hand rotation rate about camera +X (right): positive tilts the optical axis up. */
  pitch: number;
  /** Right-hand rotation rate about camera +Y (up): positive turns the optical axis left. */
  yaw: number;
  /** Right-hand rotation rate about camera +Z (forward): positive rolls the camera clockwise as seen from behind it. */
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
