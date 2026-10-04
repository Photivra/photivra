# output/print-region-statistics.ts public contracts

Package **1.4.0**, root API **1.4.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculatePrintRegionDifference

Measure registered processing changes; residual is not automatically compression/noise.

```ts
export function calculatePrintRegionDifference(value: PrintRegionDifferenceInput): CalculationResult<PrintRegionStatisticsAssessment<PrintRegionDifferenceInput, PrintRegionDifferenceMeasurement>>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## calculatePrintRegionNoise

Measure n-1 per-site temporal sample variance, independently of scene spatial texture.

```ts
export function calculatePrintRegionNoise(value: PrintRegionNoiseInput): CalculationResult<PrintRegionStatisticsAssessment<PrintRegionNoiseInput, PrintRegionNoiseMeasurement>>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## MAX_PRINT_REGION_STATISTICS_SAMPLES

Maximum scalar samples across every frame/reference in one request.

```ts
MAX_PRINT_REGION_STATISTICS_SAMPLES = MAX_PRINT_DETAIL_REGION_SAMPLES
```

## parsePrintRegionDifferenceInput

Parse/copy an untrusted paired scalar ROI request.

```ts
export function parsePrintRegionDifferenceInput(v: unknown): PrintRegionDifferenceInput;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## parsePrintRegionNoiseInput

Parse/copy an untrusted repeat-capture ensemble with a total scalar work bound.

```ts
export function parsePrintRegionNoiseInput(v: unknown): PrintRegionNoiseInput;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## PRINT_REGION_STATISTICS_MODEL_VERSION

Independent of the root distribution and coherent-detail protocol.

```ts
PRINT_REGION_STATISTICS_MODEL_VERSION = "0.1.0" as const
```

## PrintRegionDifferenceInput

Compare identical sample sites through processing, without mixing noise draws.
A known range is a declared reference signal range, never a clipping threshold.

```ts
export interface PrintRegionDifferenceInput {
  assessmentId: string;
  before: PrintRegionRaster;
  after: PrintRegionRaster;
  purpose: "processing-change" | "decoded-file-change";
  realizationPolicy: "same-noise-realization" | "deterministic-reference";
  referenceRange: { lowerRelativeLuminance: number; upperRelativeLuminance: number } | null;
}
```

## PrintRegionDifferenceMeasurement

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface PrintRegionDifferenceMeasurement {
  meanSignedDifferenceRelativeLuminance: number;
  rmsDifferenceRelativeLuminance: number;
  maximumAbsoluteDifferenceRelativeLuminance: number;
  /** Null unless the caller supplied a reference range; not a halo classifier. */
  rangeExcursions: {
    beforeBelowRangeCount: number;
    beforeAboveRangeCount: number;
    afterBelowRangeCount: number;
    afterAboveRangeCount: number;
    beforeMaximumUndershootRelativeLuminance: number;
    beforeMaximumOvershootRelativeLuminance: number;
    afterMaximumUndershootRelativeLuminance: number;
    afterMaximumOvershootRelativeLuminance: number;
  } | null;
}
```

## PrintRegionNoiseInput

Sample statistics at registered sites over independently acquired repeats.
Stationarity/independence are declarations; a single frame is never a noise ensemble.

```ts
export interface PrintRegionNoiseInput {
  assessmentId: string;
  ensembleId: string;
  stationarySceneId: string;
  repeatPolicy: "independent-stationary-captures";
  frames: readonly PrintRegionRaster[];
}
```

## PrintRegionNoiseMeasurement

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface PrintRegionNoiseMeasurement {
  frameCount: number;
  siteCount: number;
  meanRelativeLuminance: number;
  /** Mean of per-site sample variances with n-1 denominator, in squared linear units. */
  meanTemporalSampleVarianceRelativeLuminanceSquared: number;
  temporalRmsRelativeLuminance: number;
  /** Separately retained so scene texture/fixed pattern is not relabelled temporal noise. */
  perSiteMeansRelativeLuminance: readonly number[];
  perSiteSampleVariancesRelativeLuminanceSquared: readonly number[];
}
```

## PrintRegionRaster

Exact, unwarped scalar linear ROI; sample and hash verification remains external.

```ts
export interface PrintRegionRaster {
  print: PrintPlanInput;
  source: PrintDetailSource;
  region: PrintDetailRegion;
  samples: readonly number[];
}
```

## PrintRegionStatisticsAssessment

Measurements remain diagnostic. No physical-noise calibration or print verdict.

```ts
export interface PrintRegionStatisticsAssessment<TInput, TMeasurement> {
  assessmentId: string;
  engineApiVersion: string;
  modelVersion: typeof PRINT_REGION_STATISTICS_MODEL_VERSION;
  input: TInput;
  status: "diagnostic-only" | "blocked" | "unsupported";
  blockers: string[];
  print: PrintPlan;
  measurement: TMeasurement | null;
  sourceArtifactVerification: "caller-declared-unverified";
  acquisitionQualification: "unassessed";
  uncertainty: "not-quantified";
  overallPrintVerdict: "not-offered";
}
```
