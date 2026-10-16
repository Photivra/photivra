# exposure/metering.ts public contracts

The package and root API versions are recorded once in [Navigation](../API_REFERENCE.md) · [Developer guide](https://github.com/Photivra/photivra/blob/main/docs/DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateHighlightPriorityPlacementSignal

Relative signal at which a highlight-priority profile places its highlight
percentile: `saturationRelativeSignal * 2^-headroomStops`.

```ts
export function calculateHighlightPriorityPlacementSignal(
  saturationRelativeSignal: number,
  headroomStops: number
): number;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## EXPOSURE_METERING_PROFILE_SCHEMA_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
EXPOSURE_METERING_PROFILE_SCHEMA_VERSION =
  "0.1.0" as const
```

## ExposureMeteringPolicy

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type ExposureMeteringPolicy =
  | {
      kind: "multi-zone-uniform";
    }
  | {
      kind: "center-weighted-radial";
      edgeWeight: number;
      exponent: number;
    }
  | {
      kind: "spot";
      centerOrientedCaptureUv:
        NormalizedRasterUv;
      radiusFractionOfCaptureDiagonal:
        number;
    }
  | {
      /**
       * Highlight-emphasis weighted average (unchanged since 1.x). Brighter samples
       * receive weight `minimumWeightFraction + (1 - minimumWeightFraction) *
       * (signal / maximum)^exponent`; the weighted mean is then placed at the
       * profile target. It is NOT highlight protection: no sample is placed
       * relative to saturation, so in a mostly mid-grey scene with a small bright
       * area it underexposes the mid-tones relative to uniform metering without
       * guaranteeing headroom. Use `highlight-priority` to place highlights below
       * saturation.
       */
      kind: "highlight-weighted";
      minimumWeightFraction: number;
      exponent: number;
    }
  | {
      /**
       * Highlight-priority placement. The area-weighted `highlightPercentile`
       * quantile of the relative pre-exposure signal is placed `headroomStops`
       * below `saturationRelativeSignal`. The profile target must declare that
       * placement exactly: `targetRelativeSignal = saturationRelativeSignal *
       * 2^-headroomStops` (see {@link calculateHighlightPriorityPlacementSignal}).
       */
      kind: "highlight-priority";
      /** Area-weighted quantile in (0, 1]; 1 places the brightest sample. */
      highlightPercentile: number;
      /** Relative pre-exposure signal at which the declared output saturates. */
      saturationRelativeSignal: number;
      /** Non-negative headroom in stops between the placed highlight and saturation. */
      headroomStops: number;
    };
```

## ExposureMeteringProfile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ExposureMeteringProfile {
  schemaVersion:
    typeof EXPOSURE_METERING_PROFILE_SCHEMA_VERSION;
  profileId: string;
  scientificStatus: "approximation";
  inputDomain:
    "relative-pre-exposure-linear-signal";
  captureRegion:
    "oriented-active-capture";
  policy: ExposureMeteringPolicy;
  target: {
    kind: "relative-signal-reference";
    targetRelativeSignal: number;
    evidence: readonly EvidenceProvenance[];
  };
  evidence: readonly EvidenceProvenance[];
  limitations: readonly string[];
}
```

## ExposureMeteringResult

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type ExposureMeteringResult =
  | (ExposureMeteringResultBase & {
      status: "resolved";
      requiredExposureScaleToTarget:
        number;
      exposureOffsetStopsToTarget:
        number;
    })
  | (ExposureMeteringResultBase & {
      status: "no-signal";
      requiredExposureScaleResolved:
        false;
      exposureOffsetStopsResolved:
        false;
    });
```

## ExposureMeteringSampleSet

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ExposureMeteringSampleSet {
  measurementId: string;
  sceneStateId: string;
  inputDomain:
    "relative-pre-exposure-linear-signal";
  captureRegion:
    "oriented-active-capture";
  captureGeometry:
    ResolvedCaptureGeometry;
  processingState: {
    exposureSettingsApplied: false;
    whiteBalanceApplied: false;
    toneMappingApplied: false;
    displayGammaApplied: false;
    sharpeningApplied: false;
  };
  samples:
    readonly ExposureMeteringZoneSample[];
}
```

## ExposureMeteringZoneSample

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ExposureMeteringZoneSample {
  sampleId: string;
  positionOrientedCaptureUv:
    NormalizedRasterUv;
  relativeLinearSignal: number;
  areaWeight: number;
}
```

## HighlightPriorityMeteringDiagnostics

Diagnostics reported only for the highlight-priority policy.

```ts
export interface HighlightPriorityMeteringDiagnostics {
  highlightPercentile: number;
  /** Lower area-weighted quantile (inverse empirical CDF) of the samples. */
  percentileRelativeSignal: number;
  saturationRelativeSignal: number;
  headroomStops: number;
  placementRelativeSignal: number;
  quantileDefinition:
    "area-weighted-lower-quantile-inverse-empirical-cdf";
}
```

## meterRelativeExposure

Meters relative pre-exposure linear signal over the actual oriented active
capture frame.

The first contract is an educational/relative approximation. It is
intentionally independent of final output crop, display/tone mapping,
exposure compensation, and automatic exposure setting resolution.

```ts
export function meterRelativeExposure(
  input:
    MeterRelativeExposureInput
): CalculationResult<ExposureMeteringResult>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## MeterRelativeExposureInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface MeterRelativeExposureInput {
  profile: ExposureMeteringProfile;
  sampleSet: ExposureMeteringSampleSet;
}
```

## parseExposureMeteringProfile

Parses one generic relative exposure-metering profile.

Schema 0.1.0 is approximation-only and consumes relative pre-exposure
linear signal. It deliberately does not claim luminance, spectral radiance,
sensor-plane irradiance, or a specific manufacturer's meter calibration.

```ts
export function parseExposureMeteringProfile(
  value: unknown
): ExposureMeteringProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.
