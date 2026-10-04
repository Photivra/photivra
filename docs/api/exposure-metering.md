# exposure/metering.ts public contracts

Package **1.4.0**, root API **1.4.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

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
      kind: "highlight-weighted";
      minimumWeightFraction: number;
      exponent: number;
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
