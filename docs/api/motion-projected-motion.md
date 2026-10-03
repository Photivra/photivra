# motion/projected-motion.ts public contracts

Package **1.2.0**, root API **1.2.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateProjectedMotionBlur

Calculates sensor-plane motion during an exposure using ideal rectilinear
projection and constant linear object velocity.

Without focusDistanceM, nominal focal length is the backwards-compatible
pinhole projection distance. With focusDistanceM, the selected thin-lens
sensor-plane image distance is used.

The calculation projects the object's shutter-open and shutter-close
positions onto the image plane and measures the displacement between them.
It therefore handles lateral and depth-direction motion without relying on a
generic "subject speed" category.

```ts
export function calculateProjectedMotionBlur(
  input: CalculateProjectedMotionBlurInput
): CalculationResult<ProjectedMotionBlur>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateProjectedMotionBlurInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CalculateProjectedMotionBlurInput {
  /** Lens focal length in millimetres. */
  focalLengthMm: number;
  /** Shutter-open duration in seconds. */
  shutterSeconds: number;
  /** Object position at shutter open, in camera-relative metres. +z is away from the camera. */
  positionM: Vector3;
  /** Constant world-space velocity during the exposure, in metres per second. */
  velocityMps: Vector3;
  /** Optional focus distance in metres for focus-aware sensor-plane projection. */
  focusDistanceM?: number;
  /** Optional sensor pixel pitch in micrometres for pixel-domain blur reporting. */
  pixelPitchMicrometers?: number;
}
```

## ProjectedMotionBlur

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ProjectedMotionBlur {
  deltaXMm: number;
  deltaYMm: number;
  distanceMm: number;
  projectionDistanceMm: number;
  distancePixels?: number;
}
```
