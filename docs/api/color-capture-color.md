# color/capture-color.ts public contracts

Package **1.0.0**, root API **0.116.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateCaptureColorTransform

Converts a bounded inline XYZ/ideal-camera plane to unclamped linear sRGB.
Reuses resolved WB intent; never estimates illumination or changes exposure/noise.
XYZ diagonal adaptation is explicitly an approximation, distinct from RGB gains.

```ts
export function calculateCaptureColorTransform(input: CaptureColorTransformInput): CalculationResult<CaptureColorTransformResult>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CAPTURE_COLOR_MODEL_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
CAPTURE_COLOR_MODEL_VERSION = "0.1.0" as const
```

## CaptureColorModel

Profile data exposes complete row-major matrices and domain conditions to consumers.

```ts
export interface CaptureColorModel {
  version: typeof CAPTURE_COLOR_MODEL_VERSION;
  cameraProfile: CapturePublicProfileReference;
  outputProfile: CapturePublicProfileReference;
  referenceIlluminant: "D65";
  observer: "cie-1931-2-degree";
  referenceWhiteXyz: { x: number; y: 1; z: number };
  cameraRgbToXyz: Matrix;
  xyzToCameraRgb: Matrix;
  scientificStatus: "calculated";
  validConditions: readonly string[];
  publicEvidenceIds: readonly string[];
}
```

## CaptureColorTransformInput

IDs identify a new derived plane; source capture stays immutable.

```ts
export interface CaptureColorTransformInput {
  capture: SimulatedCapture;
  sourcePlaneId: string;
  outputPlaneId: string;
  outputImageStateId: string;
  whiteBalance: CaptureColorWhiteBalance;
}
```

## CaptureColorTransformResult

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CaptureColorTransformResult {
  plane: CaptureLinearPlane;
  colorModel: CaptureColorModel;
  sourcePlaneId: string;
  sourceImageStateId: string;
  whiteBalance: CaptureColorWhiteBalance;
  /** Matrix on CIE XYZ, identity when no adaptation; row-major, dimensionless. */
  chromaticAdaptationMatrix: Matrix;
  /** False: even adopted-white scaling is a camera choice under mixed illumination. */
  claimsUniqueSceneWhite: false;
}
```

## CaptureColorWhiteBalance

One explicit color interpretation; gains and adaptation cannot silently double-apply WB.

```ts
export type CaptureColorWhiteBalance =
  | { kind: "preserve-intent" }
  | { kind: "apply-resolved-rgb-gains"; channelBasis: CapturePublicProfileReference }
  | { kind: "adopted-white-xyz-scaling" };
```

## LINEAR_CAPTURE_RGB_PROFILE

Linear light, sRGB primaries/D65; no sRGB transfer curve is applied.

```ts
LINEAR_CAPTURE_RGB_PROFILE = Object.freeze({ id: "linear-srgb-d65", version: CAPTURE_COLOR_MODEL_VERSION })
```

## parseCaptureColorTransformInput

Validates the entire capture and explicit transform policy across untrusted JSON boundaries.

```ts
export function parseCaptureColorTransformInput(value: unknown): CaptureColorTransformInput;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## resolveCaptureColorModel

Returns the versioned ideal camera basis, independent of rendering/serializer state.

```ts
export function resolveCaptureColorModel(): CaptureColorModel;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## VIRTUAL_COLOR_CAMERA_PROFILE

Explicit ideal colorimetric camera, not measured spectral sensor channels.

```ts
VIRTUAL_COLOR_CAMERA_PROFILE = Object.freeze({ id: "photivra-colorimetric-rgb-d65", version: CAPTURE_COLOR_MODEL_VERSION })
```
