# output/print-plan.ts public contracts

The package and root API versions are recorded once in [Navigation](../API_REFERENCE.md) · [Developer guide](https://github.com/Photivra/photivra/blob/main/docs/DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculatePrintPlan

Finds the smallest file, at the exact native aspect ratio, that meets the declared sampling and lab constraints.
The angular guidance is an approximate rule of thumb; the geometry itself is calculated exactly.
It does not assess source detail, perceived quality, file writing or available resources.

```ts
export function calculatePrintPlan(value: PrintPlanInput): CalculationResult<PrintPlan>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## calculatePrintSizeLimit

Calculates the largest print size under the stated conditions. Lab constraints need individual plans,
so this size query reports them as unsupported rather than ignoring them.

```ts
export function calculatePrintSizeLimit(value: PrintSizeLimitInput): CalculationResult<PrintSizeLimit>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## parsePrintPlanInput

Validates and copies an untrusted print request. It never assumes the source is native if that is not declared.

```ts
export function parsePrintPlanInput(value: unknown): PrintPlanInput;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## PrintedImageSize

The flat printed image area. It excludes paper margins, borders and canvas wraps.

```ts
export interface PrintedImageSize { width: number; height: number; unit: PrintLength["unit"] }
```

## PrintLength

A physical length. Not to be confused with image pixels or printer dots.

```ts
export interface PrintLength { value: number; unit: "mm" | "cm" | "inches" | "m" }
```

## PrintNativeSource

The declared native source geometry. Not a preview or a resampled pixel count.

```ts
export type PrintNativeSource =
  | { kind: "native-retained"; captureId: string; geometry: ResolveCaptureGeometryInput }
  | { kind: "unavailable"; reason: "missing-native-raster" | "unverified-native-identity" };
```

## PrintPlan

A plan, valid only under its stated conditions. A null recommendation never means it is fine to upscale.

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

Plan input. The output keeps the exact native aspect ratio; the allowed physical aspect error is explicit and reported.

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

Print lab requirements supplied by the caller. There is no vendor catalogue and no guarantee of what a lab will accept.

```ts
export interface PrintProviderConstraints {
  minimumRaster?: RasterDimensions;
  exactRaster?: RasterDimensions;
  minimumPpi?: number;
  exactPpi?: number;
}
```

## PrintRasterSampling

Pixel density and angular pixel pitch for each axis. The angles are pure geometry, not a measure of visual acuity.

```ts
export interface PrintRasterSampling {
  raster: RasterDimensions;
  pixelsPerInch: { x: number; y: number };
  angularPixelPitchArcminutes: { x: number; y: number };
}
```

## PrintSamplingCriterion

How to choose pixel density: one of three angular criteria at the viewing distance, or a manual PPI (pixels per inch), which gives a different kind of plan.

```ts
export type PrintSamplingCriterion =
  | { kind: "angular-pixel-pitch"; maximumArcminutesPerPixel: number }
  | { kind: "angular-stroke"; strokeWidthArcminutes: number; samplesPerStroke: number }
  | { kind: "angular-line-pair"; periodArcminutes: number; samplesPerPeriod: number }
  | { kind: "manual-ppi"; pixelsPerInch: number };
```

## PrintSizeLimit

Result of the size query. A status says "unbounded" rather than using Infinity. "no-positive-size" is a valid answer, not an input error.

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

Input for the largest-print-size query. It keeps the reference plan's aspect ratio and criterion.
With proportional viewing, the reference viewing distance scales with the image size.

```ts
export interface PrintSizeLimitInput {
  plan: PrintPlanInput;
  viewingDistancePolicy: "fixed" | "proportional-to-image-size";
}
```
