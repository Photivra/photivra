# schema/illumination-temporal.ts public contracts

Package **1.0.1**, root API **1.0.1**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## evaluateSceneIlluminationTemporalMultiplier

Evaluates one explicitly registered time-varying source multiplier at one
physical capture time.

Capture time is seconds from the first opening-boundary phase. Sensor data
readout timing is not used as a time surrogate.

```ts
export function evaluateSceneIlluminationTemporalMultiplier(
  input:
    EvaluateSceneIlluminationTemporalMultiplierInput
): SceneIlluminationTemporalMultiplierEvaluation;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## EvaluateSceneIlluminationTemporalMultiplierInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface EvaluateSceneIlluminationTemporalMultiplierInput {
  illuminationProfile:
    SceneIlluminationProfile;
  temporalProfile:
    SceneIlluminationTemporalProfile;
  sourceId: string;
  captureTimeSecondsFromReference: number;
}
```

## IntegrateSceneIlluminationTemporalMultiplierInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface IntegrateSceneIlluminationTemporalMultiplierInput {
  illuminationProfile:
    SceneIlluminationProfile;
  temporalProfile:
    SceneIlluminationTemporalProfile;
  sourceId: string;
  exposureWindows: CaptureExposureWindows;
  sampleIndex: number;
  temporalSampleCount: number;
}
```

## integrateSceneIlluminationTemporalMultiplierOverExposureWindow

Integrates one time-varying source multiplier over one authoritative local
exposure window from #12 using deterministic midpoint quadrature.

This integrates relative temporal modulation only. It does not apply source
magnitude, scene transport, optics, sensor response, or metering policy.

```ts
export function integrateSceneIlluminationTemporalMultiplierOverExposureWindow(
  input:
    IntegrateSceneIlluminationTemporalMultiplierInput
): SceneIlluminationTemporalExposureIntegration;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## parseSceneIlluminationTemporalProfile

Parses time-varying illumination metadata as an additive overlay on one
existing illumination profile.

The base source magnitude/spectrum remain authoritative. Each binding applies
one relative temporal multiplier waveform to one source. Unbound sources
remain time-invariant.

```ts
export function parseSceneIlluminationTemporalProfile(
  value: unknown
): SceneIlluminationTemporalProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## SCENE_ILLUMINATION_TEMPORAL_PROFILE_SCHEMA_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
SCENE_ILLUMINATION_TEMPORAL_PROFILE_SCHEMA_VERSION =
  "0.1.0" as const
```

## SceneIlluminationTemporalExposureIntegration

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SceneIlluminationTemporalExposureIntegration {
  sourceId: string;
  sourceEnabled: boolean;
  temporalProfileId: string;
  bindingId: string;
  waveformId: string;
  timeReference:
    "first-opening-boundary-phase";
  localExposureWindow: {
    startSecondsFromCaptureReference: number;
    endSecondsFromCaptureReference: number;
    durationSeconds: number;
  };
  quadratureScheme: "uniform-midpoint";
  temporalSampleCount: number;
  nodes:
    readonly SceneIlluminationTemporalIntegrationNode[];
  averageRelativeMagnitudeMultiplier:
    number;
  integratedRelativeMagnitudeSeconds:
    number;
  averageEffectiveRelativeMagnitudeMultiplier:
    number;
  integratedEffectiveRelativeMagnitudeSeconds:
    number;
  sourceMagnitudeApplied: false;
  materialTransportApplied: false;
  sceneRadianceCalculated: false;
  sensorReadoutTimingUsed: false;
  automaticExposureResolved: false;
  convergenceErrorEstimated: false;
}
```

## SceneIlluminationTemporalIntegrationNode

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SceneIlluminationTemporalIntegrationNode {
  temporalSampleIndex: number;
  localExposurePhase: number;
  captureTimeSecondsFromReference: number;
  waveformTimeSecondsFromWaveformReference:
    number;
  relativeMagnitudeMultiplier: number;
  effectiveRelativeMagnitudeMultiplier:
    number;
  normalizedTimeWeight: number;
  timeMeasureSeconds: number;
}
```

## SceneIlluminationTemporalMultiplierEvaluation

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SceneIlluminationTemporalMultiplierEvaluation {
  sourceId: string;
  sourceEnabled: boolean;
  temporalProfileId: string;
  bindingId: string;
  waveformId: string;
  captureTimeReference:
    "first-opening-boundary-phase";
  captureTimeSecondsFromReference: number;
  waveformTimeSecondsFromWaveformReference:
    number;
  waveformKind:
    SceneIlluminationTemporalWaveform["kind"];
  relativeMagnitudeMultiplier: number;
  effectiveRelativeMagnitudeMultiplier:
    number;
  sourceMagnitudeApplied: false;
  materialTransportApplied: false;
  sceneRadianceCalculated: false;
  sensorReadoutTimingUsed: false;
  automaticExposureResolved: false;
}
```

## SceneIlluminationTemporalProfile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SceneIlluminationTemporalProfile {
  schemaVersion:
    typeof SCENE_ILLUMINATION_TEMPORAL_PROFILE_SCHEMA_VERSION;
  profileId: string;
  sceneId: string;
  illuminationProfileId: string;
  evidence: readonly EvidenceProvenance[];
  waveforms:
    readonly SceneIlluminationTemporalWaveform[];
  sourceBindings:
    readonly SceneIlluminationTemporalSourceBinding[];
  baseIlluminationProfileRemainsAuthoritative:
    true;
  sensorReadoutTimingUsedAsExposureTiming:
    false;
  automaticExposurePolicyIncluded: false;
}
```

## SceneIlluminationTemporalRegistrationUncertainty

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SceneIlluminationTemporalRegistrationUncertainty =
  | {
      kind: "absolute-seconds";
      plusMinusSeconds: number;
      basis: string;
    }
  | {
      kind: "not-quantified";
      limitation: string;
    };
```

## SceneIlluminationTemporalScientificStatus

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SceneIlluminationTemporalScientificStatus =
  | "calibrated"
  | "approximation";
```

## SceneIlluminationTemporalSourceBinding

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SceneIlluminationTemporalSourceBinding {
  bindingId: string;
  sourceId: string;
  waveformId: string;
  captureTimeReference:
    "first-opening-boundary-phase";
  /**
   * Capture-reference time at which waveform-local t=0 occurs.
   *
   * waveformTime = captureTime - waveformTimeZeroSecondsFromCaptureReference
   */
  waveformTimeZeroSecondsFromCaptureReference:
    number;
  scientificStatus:
    SceneIlluminationTemporalScientificStatus;
  timingUncertainty:
    SceneIlluminationTemporalRegistrationUncertainty;
  evidence: readonly EvidenceProvenance[];
}
```

## SceneIlluminationTemporalWaveform

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SceneIlluminationTemporalWaveform =
  | (SceneIlluminationTemporalWaveformBase & {
      kind:
        "aperiodic-relative-multiplier";
      outsideSupportBehavior: "zero";
    })
  | (SceneIlluminationTemporalWaveformBase & {
      kind:
        "periodic-relative-multiplier";
      periodSeconds: number;
      endpointContinuityRequired: true;
    });
```

## SceneIlluminationTemporalWaveformSample

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SceneIlluminationTemporalWaveformSample {
  timeSecondsFromWaveformReference: number;
  relativeMagnitudeMultiplier: number;
}
```
