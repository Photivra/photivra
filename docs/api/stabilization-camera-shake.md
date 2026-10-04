# stabilization/camera-shake.ts public contracts

Package **1.3.0**, root API **1.3.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## CameraShakeBlurSample

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CameraShakeBlurSample {
  deltaXmm: number;
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
