# core/calculation-result.ts public contracts

Package **1.4.0**, root API **1.4.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## AbsoluteUncertaintyEstimate

Absolute symmetric uncertainty around a result quantity.

```ts
export interface AbsoluteUncertaintyEstimate extends UncertaintyEstimateBase {
  kind: "absolute";
  /** Symmetric ± magnitude in the explicitly named unit. */
  plusMinus: number;
  /** Explicit unit such as mm, m, px, or "1" for dimensionless values. */
  unit: string;
}
```

## approximationResult

Creates an approximation-result envelope.

```ts
export function approximationResult<T>(
  value: T,
  model: string,
  modelVersion: string,
  assumptions: readonly string[],
  quality?: CalculationQuality
): CalculationResult<T>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## calculatedResult

Creates a deterministic calculated-result envelope.

```ts
export function calculatedResult<T>(
  value: T,
  model: string,
  modelVersion: string,
  assumptions?: readonly string[],
  quality?: CalculationQuality
): CalculationResult<T>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculationProvenance

Metadata describing how a numerical result was produced.

```ts
export interface CalculationProvenance {
  /** Classification of the result's scientific origin. */
  kind: ProvenanceKind;
  /** Stable identifier for the model or equation set. */
  model: string;
  /** Version of the model, independent of the package version. */
  modelVersion: string;
  /** Concise assumptions that materially affect interpretation. */
  assumptions?: readonly string[];
}
```

## CalculationQuality

Optional quality metadata for a calculation result.

Components remain separate by default. Callers must not add, combine in
quadrature, or otherwise collapse uncertainty components unless a
scientifically justified composition method explicitly documents
independence/correlation assumptions.

```ts
export interface CalculationQuality {
  uncertainty?: readonly UncertaintyEstimate[];
  validRanges?: readonly CalculationValidRange[];
  notes?: readonly string[];
}
```

## CalculationResult

Standard result envelope for public scientific calculations.

Deterministic analytical results remain lightweight: quality is omitted when
there is no defensible uncertainty/accuracy metadata to report.

```ts
export interface CalculationResult<T> {
  value: T;
  provenance: CalculationProvenance;
  quality?: CalculationQuality;
}
```

## CalculationValidRange

Documented parameter range over which a model/calibration is considered
valid. This is model applicability metadata, not a statistical interval.

```ts
export interface CalculationValidRange {
  /** JSON-style input/model parameter path, e.g. input.focusDistanceM. */
  parameterPath: string;
  /** Explicit unit such as m, mm, ISO, or "1" for dimensionless values. */
  unit: string;
  minimum?: number;
  maximum?: number;
  note?: string;
}
```

## calibratedResult

Creates a calibrated-result envelope with explicit quality metadata.

```ts
export function calibratedResult<T>(
  value: T,
  model: string,
  modelVersion: string,
  assumptions: readonly string[],
  quality: CalculationQuality
): CalculationResult<T>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## estimatedResult

Creates an estimated-result envelope with explicit quality metadata.

```ts
export function estimatedResult<T>(
  value: T,
  model: string,
  modelVersion: string,
  assumptions: readonly string[],
  quality: CalculationQuality
): CalculationResult<T>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ProvenanceKind

Scientific provenance labels used throughout the public API.

```ts
export type ProvenanceKind =
  | "calculated"
  | "calibrated"
  | "estimated"
  | "approximation";
```

## RelativeUncertaintyEstimate

Relative symmetric uncertainty around a result quantity.

```ts
export interface RelativeUncertaintyEstimate extends UncertaintyEstimateBase {
  kind: "relative";
  /** Symmetric ± fractional magnitude; 0.05 means ±5%. */
  fraction: number;
}
```

## UncertaintyConfidence

Optional confidence metadata for a quantified uncertainty estimate.

A confidence level is only meaningful when the basis can be stated. It must
not be used as a generic subjective confidence score.

```ts
export interface UncertaintyConfidence {
  /** Confidence/coverage level as a fraction in the interval (0, 1]. */
  level: number;
  /** Concise description of the statistical/empirical basis. */
  basis: string;
}
```

## UncertaintyEstimate

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type UncertaintyEstimate =
  | AbsoluteUncertaintyEstimate
  | RelativeUncertaintyEstimate;
```

## UncertaintySource

Source category for a quantified uncertainty estimate.

```ts
export type UncertaintySource =
  | "measurement"
  | "model-approximation"
  | "calibration";
```

## validateCalculationQuality

Validates result-quality metadata before it enters a public result envelope.

```ts
export function validateCalculationQuality(
  quality: CalculationQuality | undefined
): void;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.
