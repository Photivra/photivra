# capture/release-sequence.ts public contracts

Package **1.0.1**, root API **1.0.1**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## CancelledReleaseSequence

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CancelledReleaseSequence {
  version:
    typeof RELEASE_SEQUENCE_VERSION;
  sequenceId: string;
  status: "cancelled";
  cancelledAtSeconds: number;
  completedFrameCount: number;
  omittedFrameCount: number;
  completedFrames:
    readonly ResolvedReleaseFrame[];
  sourceSequenceFrameCount: number;
  sourceSequenceUnmodified: true;
}
```

## CancelReleaseSequenceInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CancelReleaseSequenceInput {
  sequence:
    ResolvedReleaseSequence;
  completedFrameCount: number;
  cancelledAtSeconds: number;
}
```

## createCancelledReleaseSequence

Produces an explicit cancelled sequence state without mutating the scheduled
source sequence or leaving the completed/omitted frame boundary ambiguous.

```ts
export function createCancelledReleaseSequence(
  input:
    CancelReleaseSequenceInput
): CancelledReleaseSequence;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## RELEASE_SEQUENCE_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
RELEASE_SEQUENCE_VERSION =
  "0.1.0" as const
```

## ReleaseAutomationState

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type ReleaseAutomationState =
  | "manual"
  | "locked"
  | "continuous";
```

## ReleaseBaseCaptureState

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ReleaseBaseCaptureState {
  exposure: {
    aperture: number;
    shutterSeconds: number;
    iso: number;
  };
  focus: FocusPlane;
  whiteBalanceStateId?: string;
  automation: {
    ae: ReleaseAutomationState;
    af: ReleaseAutomationState;
    awb: ReleaseAutomationState;
  };
}
```

## ReleaseBracketPolicy

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type ReleaseBracketPolicy =
  | {
      kind: "none";
    }
  | {
      kind: "exposure";
      axis:
        GenericExposureBracketAxis;
      offsetsStops:
        readonly number[];
    }
  | {
      kind: "focus";
      focusStates:
        readonly FocusPlane[];
    };
```

## ReleaseDrivePolicy

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type ReleaseDrivePolicy =
  | {
      kind: "single";
    }
  | {
      kind: "burst";
      frameCount: number;
    }
  | {
      kind: "self-timer";
      delaySeconds: number;
      frameCount: number;
    };
```

## ReleaseTimingConstraint

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type ReleaseTimingConstraint =
  | "requested-cadence"
  | "body-maximum-cadence"
  | "exposure-duration"
  | "minimum-inter-frame-gap";
```

## ResolvedReleaseFrame

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolvedReleaseFrame {
  sequenceId: string;
  frameIndex: number;
  releaseFrameId: string;
  exposureStartTimeSeconds: number;
  exposureEndTimeSeconds: number;
  sceneTimeSecondsFromSequenceStart:
    number;
  startIntervalFromPreviousSeconds:
    number | null;
  timingConstraints:
    readonly ReleaseTimingConstraint[];
  stochasticSeedUint32: number;
  exposure: {
    aperture: number;
    shutterSeconds: number;
    iso: number;
  };
  focus: FocusPlane;
  exposureBracketOffsetStops?:
    number;
  automation:
    ReleaseBaseCaptureState["automation"];
  whiteBalanceStateId?: string;
}
```

## ResolvedReleaseSequence

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolvedReleaseSequence {
  version:
    typeof RELEASE_SEQUENCE_VERSION;
  sequenceId: string;
  status: "scheduled";
  releaseRequestTimeSeconds: number;
  selfTimerDelaySeconds: number;
  requestedCadenceFps:
    number | null;
  capabilityMaximumCadenceFps:
    number;
  minimumInterFrameGapSeconds:
    number;
  requestedFrameCount: number;
  actualFrameCount: number;
  sequenceSeedUint32: number;
  baseStateSnapshot:
    ReleaseBaseCaptureState;
  frames:
    readonly ResolvedReleaseFrame[];
  sensorCaptureModeOwnership:
    "separate-logical-capture-contract";
  whiteBalanceBracketingPhysicalCaptures:
    false;
  preReleaseCaptureModeled:
    false;
  bufferMediaThermalSlowdownModeled:
    false;
}
```

## resolveReleaseSequence

Resolves one deterministic logical still-release sequence.

Sensor capture-mode internals remain separate. This function schedules
logical exposures only and never uses render speed/frame rate as capture
timing.

```ts
export function resolveReleaseSequence(
  input:
    ResolveReleaseSequenceInput
): ResolvedReleaseSequence;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ResolveReleaseSequenceInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolveReleaseSequenceInput {
  sequenceId: string;
  releaseRequestTimeSeconds: number;
  sequenceSeedUint32: number;
  drive: ReleaseDrivePolicy;
  bracket: ReleaseBracketPolicy;
  requestedCadenceFps?: number;
  baseState:
    ReleaseBaseCaptureState;
  releaseCapabilities:
    GenericReleaseCapabilityProfile;
  exposureCapabilities:
    ResolvedGenericEquipmentExposureCapabilities;
}
```
