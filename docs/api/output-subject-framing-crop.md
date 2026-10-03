# output/subject-framing-crop.ts public contracts

Package **1.1.0**, root API **1.1.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateSubjectFramingCrop

Calculates the same-aspect-ratio crop needed for a subject to occupy a
requested fraction of frame height.

This calculation assumes a centered/positionable crop with enough spatial
margin around the subject. It does not validate subject position against
image edges.

```ts
export function calculateSubjectFramingCrop(
  input: CalculateSubjectFramingCropInput
): CalculationResult<SubjectFramingCrop>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateSubjectFramingCropInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CalculateSubjectFramingCropInput {
  /** Source image width in pixels. */
  pixelWidth: number;
  /** Source image height in pixels. */
  pixelHeight: number;
  /** Projected subject height in source-image pixels. */
  subjectHeightPixels: number;
  /** Desired subject height as a fraction of output frame height, >0 and <=1. */
  targetSubjectHeightFraction: number;
}
```

## SubjectFramingCrop

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SubjectFramingCrop {
  cropFactor: number;
  pixelWidth: number;
  pixelHeight: number;
  megapixels: number;
  /**
   * Actual subject height divided by cropped frame height.
   * Values greater than 1 mean the subject is taller than the output frame.
   */
  subjectHeightFraction: number;
  /** Whether the projected subject exceeds the cropped frame height. */
  subjectClipped: boolean;
  /** Whether achieving the target required an additional crop. */
  cropped: boolean;
}
```
