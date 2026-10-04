# output/print-plan.ts public contracts

Package **1.3.0**, root API **1.3.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculatePrintPlan

Resolve the minimum exact-native-ratio file under declared sampling/lab constraints.
Angular guidance is approximate as a usage criterion; geometry is calculated.
No source detail, perceived quality, serializer or resource availability is assessed.

```ts
export function calculatePrintPlan(value: PrintPlanInput): CalculationResult<PrintPlan>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## calculatePrintSizeLimit

Calculate a conditional size bound. Lab constraints require individual plans;
this first size-query contract reports them as unsupported rather than ignoring them.

```ts
export function calculatePrintSizeLimit(value: PrintSizeLimitInput): CalculationResult<PrintSizeLimit>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## parsePrintPlanInput

Validate and copy an untrusted Print request; never infer native authority.

```ts
export function parsePrintPlanInput(value: unknown): PrintPlanInput;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## PrintedImageSize

Flat printed image area; excludes paper, borders and wraps.

```ts
export interface PrintedImageSize { width: number; height: number; unit: PrintLength["unit"] }
```

## PrintLength

Physical length, separate from raster pixels and printer dots.

```ts
export interface PrintLength { value: number; unit: "mm" | "cm" | "inches" | "m" }
```

## PrintNativeSource

Declared authoritative geometry, not a preview or resampled pixel count.

```ts
export type PrintNativeSource =
  | { kind: "native-retained"; captureId: string; geometry: ResolveCaptureGeometryInput }
  | { kind: "unavailable"; reason: "missing-native-raster" | "unverified-native-identity" };
```

## PrintPlan

Finite conditional plan. Null recommendation never authorizes an upscale.

```ts
export interface PrintPlan {
  engineApiVersion: string;
  input: PrintPlanInput;
  status: "ready" | "insufficient-native-pixels" | "provider-conflict" | "crop-confirmation-required" | "cannot-assess" | "unsupported";
  nativePixelSufficiency: "sufficient" | "insufficient" | "cannot-assess";
  reasons: string[];
  printedImageMm: { width: number; height: number } | null;
  viewingDistanceMm: number | null;
  guidance: CalculationResult<{ derivedPixelsPerInch: number; maximumPixelPitchMm: number; maximumArcminutesPerPixel: number | null }> | null;
  relativeAspectError: number | null;
  native: PrintRasterSampling | null;
  minimumSamplingRaster: RasterDimensions | null;
  recommended: PrintRasterSampling | null;
  resamplingScale: { x: number; y: number } | null;
  alternatives: { maximumImageMmAtCurrentDistance: { width: number; height: number }; minimumViewingDistanceMmAtCurrentSize: number | null } | null;
  capturedDetailAssessment: "unassessed";
  deliveryAssessment: "unassessed";
}
```

## PrintPlanInput

Exact-ratio output policy. Physical aspect tolerance is explicit and reported.

```ts
export interface PrintPlanInput {
  source: PrintNativeSource;
  printedImage: PrintedImageSize;
  viewingDistance: PrintLength;
  sampling: PrintSamplingCriterion;
  fit: { kind: "confirmed-native-aspect"; maximumRelativeAspectError: number };
  provider?: PrintProviderConstraints;
}
```

## PrintProviderConstraints

Caller-supplied lab constraints; no vendor catalog or delivery guarantee.

```ts
export interface PrintProviderConstraints {
  minimumRaster?: RasterDimensions;
  exactRaster?: RasterDimensions;
  minimumPpi?: number;
  exactPpi?: number;
}
```

## PrintRasterSampling

Per-axis density and angular pitch; angular values are geometry, not acuity.

```ts
export interface PrintRasterSampling {
  raster: RasterDimensions;
  pixelsPerInch: { x: number; y: number };
  angularPixelPitchArcminutes: { x: number; y: number };
}
```

## PrintSamplingCriterion

Explicit angular convention; manual PPI starts a different plan.

```ts
export type PrintSamplingCriterion =
  | { kind: "angular-pixel-pitch"; maximumArcminutesPerPixel: number }
  | { kind: "angular-stroke"; strokeWidthArcminutes: number; samplesPerStroke: number }
  | { kind: "angular-line-pair"; periodArcminutes: number; samplesPerPeriod: number }
  | { kind: "manual-ppi"; pixelsPerInch: number };
```

## PrintSizeLimit

Semantic bounds avoid Infinity sentinels; no-positive-size differs from invalid input.

```ts
export interface PrintSizeLimit {
  engineApiVersion: string;
  status: "finite" | "unbounded" | "no-positive-size" | "cannot-assess" | "unsupported";
  maximumImageMm: { width: number; height: number } | null;
  reasons: string[];
  referencePlan: PrintPlan;
}
```

## PrintSizeLimitInput

Size-limit query retains the reference image aspect and criterion.
Proportional viewing scales the supplied reference distance with both image axes.

```ts
export interface PrintSizeLimitInput {
  plan: PrintPlanInput;
  viewingDistancePolicy: "fixed" | "proportional-to-image-size";
}
```
