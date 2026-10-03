# output/print-contrast-reference.ts public contracts

Package **1.2.0**, root API **1.2.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculatePrintContrastReference

Estimate the restricted published-model threshold; no individual invisibility claim.

```ts
export function calculatePrintContrastReference(value: PrintContrastReferenceInput): CalculationResult<PrintContrastReference>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## parsePrintContrastReferenceInput

Strictly parse/copy explicit reference conditions; no defaults infer an observer.

```ts
export function parsePrintContrastReferenceInput(value: unknown): PrintContrastReferenceInput;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## PRINT_CONTRAST_REFERENCE_MODEL_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
PRINT_CONTRAST_REFERENCE_MODEL_VERSION = "0.1.0" as const
```

## PRINT_CONTRAST_REFERENCE_UPSTREAM_REVISION

Exact MIT-licensed numerical-model source, not a local calibration identity.

```ts
PRINT_CONTRAST_REFERENCE_UPSTREAM_REVISION = "f4b0b722af83001d7af979281e06ca642d36e4e8" as const
```

## PrintContrastReference

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface PrintContrastReference {
  referenceId: string;
  engineApiVersion: string;
  modelVersion: typeof PRINT_CONTRAST_REFERENCE_MODEL_VERSION;
  upstreamRevision: typeof PRINT_CONTRAST_REFERENCE_UPSTREAM_REVISION;
  input: PrintContrastReferenceInput;
  status: "model-estimate" | "unsupported";
  blockers: string[];
  estimate: { contrastSensitivity: number; thresholdModulationMichelson: number; suppliedModulationToModelThresholdRatio: number } | null;
  observerApplicability: "population-reference-unverified-for-individual";
  naturalImageVisibility: "unassessed";
  printStimulusMatch: "unassessed";
  uncertainty: "not-quantified";
  overallPrintVerdict: "not-offered";
}
```

## PrintContrastReferenceInput

Narrow reference stimulus, separate from any measured photographic ROI.
Positive but out-of-domain quantities return unsupported rather than extrapolation.

```ts
export interface PrintContrastReferenceInput {
  referenceId: string;
  stimulus: "static-neutral-d65-gabor";
  observer: "published-binocular-natural-pupil-reference";
  /** Uniform D65 background/carrier mean; not the average of a finite photographic ROI. */
  meanLuminanceCdPerSquareMeter: number;
  spatialFrequencyCyclesPerDegree: number;
  gaussianEnvelopeSigmaDegrees: number;
  temporalFrequencyHz: number;
  eccentricityDegrees: number;
  /** Neutral carrier fractional amplitude before the Gaussian envelope; not arbitrary ROI extrema. */
  modulationMichelson: number;
}
```
