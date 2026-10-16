# stabilization/camera-shake.ts public contracts

The package and root API versions are recorded once in [Navigation](../API_REFERENCE.md) · [Developer guide](https://github.com/Photivra/photivra/blob/main/docs/DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## CameraShakeBlurSample

Optical-axis image displacement of a stationary world point over the
exposure, in the image-plane basis (+X right, +Y up). For a single axis it
equals calculateCameraRotationImageMapping() deltaMm at the optical axis.

```ts
export interface CameraShakeBlurSample {
  /** +X-right image displacement in millimetres: +d·tan(yaw·t). */
  deltaXmm: number;
  /** +Y-up image displacement in millimetres: -d·tan(pitch·t). */
  deltaYmm: number;
  distanceMm: number;
  distancePixels?: number;
  deltaXPixels?: number;
  deltaYPixels?: number;
}
```

## CameraShakeEstimate

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CameraShakeEstimate {
  residualMotionFactor: number;
  projectionDistanceMm: number;
  unstabilized: CameraShakeBlurSample;
  stabilized: CameraShakeBlurSample;
}
```

## estimateCameraShakeBlur

Estimates sensor-plane blur from a controlled constant-angular-velocity
handheld shake profile, with optional equivalent stabilization attenuation.

With focusDistanceM supplied, angular motion is projected using the same
ideal thin-lens sensor-plane distance as the other focus-aware projection
primitives; otherwise nominal focal length preserves the prior approximation.

The optical projection is physically calculated, but mapping a stabilization
rating in stops to residual angular motion by 2^-stops is an educational
approximation. It is not a CIPA DC-011 measurement or a real-camera rating.
Each axis's rotation over the exposure must stay below a quarter turn (π/2 rad).

```ts
export function estimateCameraShakeBlur(
  input: EstimateCameraShakeBlurInput
): CalculationResult<CameraShakeEstimate>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## EstimateCameraShakeBlurInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface EstimateCameraShakeBlurInput {
  focalLengthMm: number;
  shutterSeconds: number;
  /**
   * Constant camera angular velocity in radians per second, with the same
   * physical right-hand sign convention as calculateCameraRotationImageMapping()
   * (camera +X right, +Y up, +Z forward; that basis is left-handed):
   * positive yaw turns the optical axis left and moves stationary image content
   * toward +X; positive pitch tilts the optical axis up and moves stationary
   * image content toward -Y.
   */
  angularVelocityRadPerSec: {
    yaw: number;
    pitch: number;
  };
  stabilizationStopsEquivalent: number;
  /** Optional focus distance in metres for focus-aware sensor-plane projection. */
  focusDistanceM?: number;
  pixelPitchMicrometers?: number;
}
```
