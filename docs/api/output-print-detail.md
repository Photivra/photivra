# output/print-detail.ts public contracts

Package **1.1.0**, root API **1.1.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculatePrintRegionDetail

Calculate one coherent regional fundamental and its print reference scale.
Acquisition remains unknown; no MTF, noise, compression or perceptual pass is produced.

```ts
export function calculatePrintRegionDetail(value: PrintRegionDetailInput): CalculationResult<PrintRegionDetailAssessment>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## MAX_PRINT_DETAIL_REGION_SAMPLES

Work bound for one dense ROI, not an actual-device capability claim.

```ts
MAX_PRINT_DETAIL_REGION_SAMPLES = 65536
```

## parsePrintRegionDetailInput

Parse/copy bounded, untrusted region/source/target data and existing Print geometry.
Unknowns, sparse arrays and factual-reference-only numeric samples fail closed.

```ts
export function parsePrintRegionDetailInput(value: unknown): PrintRegionDetailInput;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## PRINT_REGION_DETAIL_MODEL_VERSION

Metric/protocol identity; independent of the root creator version.

```ts
PRINT_REGION_DETAIL_MODEL_VERSION = "0.1.0" as const
```

## PrintDetailRegion

Selected half-open rectangle in the represented oriented retained raster.
Depth is descriptive, in metres; null explicitly means unknown.

```ts
export interface PrintDetailRegion {
  id: string;
  rect: RasterRect;
  role: "selected-subject" | "field-diagnostic" | "intentional-defocus";
  subjectDistanceM: number | null;
  focusDistanceM: number | null;
}
```

## PrintDetailSource

Exact represented source; content hash and decoding are caller assertions.

```ts
export interface PrintDetailSource {
  captureId: string;
  representationId: string;
  contentSha256: string;
  raster: RasterDimensions;
  stage: "native-retained-linear" | "post-resampling-linear" | "post-encoding-decoded-linear";
  domain: "relative-linear-luminance" | "transfer-encoded-luma" | "unknown";
  registration: "oriented-retained-unwarped" | "correction-or-warp-unqualified";
  processing: { id: string; version: string };
  noiseRealizationId: string | null;
  evidence: readonly EvidenceProvenance[];
}
```

## PrintRegionDetailAssessment

Immutable snapshot with no full-system, artifact, perception or print-quality pass.

```ts
export interface PrintRegionDetailAssessment {
  assessmentId: string;
  engineApiVersion: string;
  modelVersion: typeof PRINT_REGION_DETAIL_MODEL_VERSION;
  input: PrintRegionDetailInput;
  status: "diagnostic-only" | "blocked" | "unsupported";
  blockers: string[];
  print: PrintPlan;
  measurement: PrintSinusoidalMeasurement | null;
  projection: {
    fieldPointMm: { x: number; y: number };
    frequencyCyclesPerMm: { x: number; y: number };
    physicalPeriodMm: number;
    angularPeriodAtImageCenterDegrees: number;
  } | null;
  assessedRasterMatchesRecommendation: boolean;
  sourceArtifactVerification: "caller-declared-unverified";
  assurance: ComposedScientificAssurance;
  unassessed: readonly ("captured-system-mtf" | "optical-motion-attribution" | "noise" | "aliasing" | "halos" | "compression" | "color" | "perceived-quality" | "printer-substrate")[];
  overallPrintVerdict: "not-offered";
}
```

## PrintRegionDetailInput

Own/reusable scalar relative-linear ROI samples; no RGB/luma conversion is inferred.

```ts
export interface PrintRegionDetailInput {
  assessmentId: string;
  print: PrintPlanInput;
  source: PrintDetailSource;
  region: PrintDetailRegion;
  target: PrintSinusoidalTarget;
  samples: readonly number[];
}
```

## PrintSinusoidalMeasurement

Calculated coefficients for one declared grating; residual is not a noise metric.

```ts
export interface PrintSinusoidalMeasurement {
  meanRelativeLuminance: number;
  fundamentalAmplitudeRelativeLuminance: number;
  fundamentalModulation: number;
  declaredGratingTransfer: number;
  unexplainedResidualRmsRelativeToMean: number;
}
```

## PrintSinusoidalTarget

Coherent integer Fourier mode; x right/y down, arbitrary phase at first ROI sample.
Input modulation is dimensionless, positive and at most one.

```ts
export interface PrintSinusoidalTarget {
  id: string;
  version: string;
  kind: "coherent-sinusoid";
  cyclesAcrossRegion: { x: number; y: number };
  referenceModulation: number;
}
```
