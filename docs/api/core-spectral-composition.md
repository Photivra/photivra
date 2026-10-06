# core/spectral-composition.ts public contracts

Package **1.5.0**, root API **1.5.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## composeSpectralCoverage

Intersects continuous spectral support and unions all interpolation
breakpoints inside the common range.

Air/vacuum conversion is never implicit. Discrete lines are deliberately
excluded because delta-like line measures require a different integration
path from continuous per-nanometre densities.

```ts
export function composeSpectralCoverage(
  input: ComposeSpectralCoverageInput
): SpectralCoverageComposition;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ComposeSpectralCoverageInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ComposeSpectralCoverageInput {
  participants:
    readonly SpectralCoverageParticipant[];
}
```

## DiscreteSpectralLineMeasure

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface DiscreteSpectralLineMeasure {
  wavelengthBasis:
    ResolvedSpectralWavelengthBasis;
  quantityUnit:
    DiscreteSpectralLineQuantityUnit;
  lineModel: "delta-like-integrated";
  lines:
    readonly DiscreteSpectralLineMeasureEntry[];
  continuousSpectralDensityAssumed: false;
  wavelengthMeasureMultiplicationRequired:
    false;
}
```

## DiscreteSpectralLineMeasureEntry

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface DiscreteSpectralLineMeasureEntry {
  lineId: string;
  wavelengthNanometers: number;
  integratedQuantity: number;
}
```

## DiscreteSpectralLineQuantityUnit

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type DiscreteSpectralLineQuantityUnit =
  | "relative"
  | "W/sr"
  | "W/m^2"
  | "W/m^2/sr";
```

## DistributeIntegratedQuantityAcrossDiscreteLinesInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface DistributeIntegratedQuantityAcrossDiscreteLinesInput {
  distribution:
    NormalizedDiscreteSpectralLineDistribution;
  totalIntegratedQuantity: number;
  quantityUnit:
    DiscreteSpectralLineQuantityUnit;
}
```

## distributeIntegratedQuantityAcrossDiscreteSpectralLines

Distributes one wavelength-integrated quantity across normalized discrete
line fractions without inventing a continuous line width.

```ts
export function distributeIntegratedQuantityAcrossDiscreteSpectralLines(
  input:
    DistributeIntegratedQuantityAcrossDiscreteLinesInput
): DiscreteSpectralLineMeasure;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## IntegratedDiscreteSpectralLineMeasure

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface IntegratedDiscreteSpectralLineMeasure {
  wavelengthBasis:
    ResolvedSpectralWavelengthBasis;
  quantityUnit:
    DiscreteSpectralLineQuantityUnit;
  integratedQuantity: number;
  lineCount: number;
  continuousQuadratureApplied: false;
  wavelengthMeasureMultiplicationApplied:
    false;
}
```

## integrateDiscreteSpectralLineMeasure

Integrates a discrete line measure by summing already wavelength-integrated
line contributions. No d-lambda factor is applied.

```ts
export function integrateDiscreteSpectralLineMeasure(
  measure:
    DiscreteSpectralLineMeasure
): IntegratedDiscreteSpectralLineMeasure;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## NormalizedDiscreteSpectralLine

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface NormalizedDiscreteSpectralLine {
  lineId: string;
  wavelengthNanometers: number;
  normalizedIntegratedWeight: number;
}
```

## NormalizedDiscreteSpectralLineDistribution

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface NormalizedDiscreteSpectralLineDistribution {
  wavelengthBasis:
    ResolvedSpectralWavelengthBasis;
  lineModel: "delta-like-integrated";
  normalization:
    "sum-normalized-integrated-weight-to-one";
  lines:
    readonly NormalizedDiscreteSpectralLine[];
}
```

## parseNormalizedDiscreteSpectralLineDistribution

Parses a normalized set of delta-like discrete spectral lines.

Each weight is an integrated line fraction, not a per-nanometre spectral
density sample. The weights must sum to one.

```ts
export function parseNormalizedDiscreteSpectralLineDistribution(
  value: unknown,
  path =
    "discreteSpectralLineDistribution"
): NormalizedDiscreteSpectralLineDistribution;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## parseSpectralCoverageParticipant

Parses one continuous spectral-coverage participant.

This contract describes support and interpolation breakpoints only. It does
not carry spectral values, transmission, response, radiance, or uncertainty.

```ts
export function parseSpectralCoverageParticipant(
  value: unknown,
  path = "spectralCoverageParticipant"
): SpectralCoverageParticipant;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ResolvedSpectralWavelengthBasis

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type ResolvedSpectralWavelengthBasis =
  Exclude<SpectralWavelengthBasis, "unspecified">;
```

## SpectralCoverageComposition

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SpectralCoverageComposition {
  wavelengthBasis:
    ResolvedSpectralWavelengthBasis;
  commonWavelengthRangeNanometers:
    SpectralWavelengthRangeNanometers;
  /**
   * Common-range endpoints plus every participant breakpoint that falls
   * strictly inside the common overlap.
   */
  segmentBoundariesNanometers:
    readonly number[];
  participantIds: readonly string[];
  participantRoles:
    readonly SpectralCoverageParticipantRole[];
  continuousCoverageIntersectionEstablished:
    true;
  breakpointUnionEstablished: true;
  responseValuesApplied: false;
  spectralDensityIntegrated: false;
  discreteLinesIncluded: false;
  airVacuumConversionPerformed: false;
}
```

## SpectralCoverageParticipant

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SpectralCoverageParticipant {
  participantId: string;
  role: SpectralCoverageParticipantRole;
  wavelengthBasis:
    ResolvedSpectralWavelengthBasis;
  wavelengthRangeNanometers:
    SpectralWavelengthRangeNanometers;
  /**
   * Internal piecewise-continuous breakpoints. Range endpoints are carried
   * separately and must not be duplicated here.
   */
  breakpointsNanometers:
    readonly number[];
}
```

## SpectralCoverageParticipantRole

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SpectralCoverageParticipantRole =
  | "illumination-source"
  | "scene-radiance"
  | "material-response"
  | "optical-transmission"
  | "sensor-response"
  | "other";
```
