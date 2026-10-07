# capture/focus-control.ts public contracts

Package **1.5.0**, root API **1.5.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## assessFocusReleaseGate

Report whether release may proceed under focus-priority or release-priority policy; this does not
operate a shutter.

Focus is a longitudinal plane or explicit infinity state, never a screen-space distance. The ideal
actuator resolves supplied target observations; it does not infer a commercial AF sensor, focus-ring
scale or acquisition latency. Target loss, reacquisition, focus lock and release priority remain
separate state transitions.

```ts
export function assessFocusReleaseGate(
  input:
    AssessFocusReleaseGateInput
): FocusReleaseGateAssessment;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## AssessFocusReleaseGateInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface AssessFocusReleaseGateInput {
  state:
    FocusControlState;
  profile:
    FocusControlProfile;
  priority:
    FocusReleasePriority;
}
```

## createFocusControlState

Create the initial ideal focus-controller state from an explicit profile, focus plane and public
state identity.

Focus is a longitudinal plane or explicit infinity state, never a screen-space distance. The ideal
actuator resolves supplied target observations; it does not infer a commercial AF sensor, focus-ring
scale or acquisition latency. Target loss, reacquisition, focus lock and release priority remain
separate state transitions.

```ts
export function createFocusControlState(
  input:
    CreateFocusControlStateInput
): FocusControlState;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CreateFocusControlStateInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CreateFocusControlStateInput {
  stateId: string;
  profile:
    FocusControlProfile;
  mode:
    FocusControlMode;
  initialFocus:
    FocusPlane;
  initialTimeSeconds?: number;
}
```

## FOCUS_CONTROL_PROFILE_SCHEMA_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
FOCUS_CONTROL_PROFILE_SCHEMA_VERSION =
  "0.1.0" as const
```

## FOCUS_CONTROL_STATE_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
FOCUS_CONTROL_STATE_VERSION =
  "0.1.0" as const
```

## FocusAcquisitionState

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type FocusAcquisitionState =
  | "idle"
  | "acquiring"
  | "acquired"
  | "target-lost"
  | "locked";
```

## FocusControlMode

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type FocusControlMode =
  | "manual"
  | "single-af"
  | "continuous-af";
```

## FocusControlProfile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface FocusControlProfile {
  schemaVersion:
    typeof FOCUS_CONTROL_PROFILE_SCHEMA_VERSION;
  profileId: string;
  profileVersion: string;
  scientificStatus: "approximation";
  supportedModes:
    readonly FocusControlMode[];
  actuator: {
    kind: "ideal-instantaneous";
    evidence:
      readonly EvidenceProvenance[];
  };
  continuousTargetLossPolicy:
    "hold-last-focus-require-explicit-reacquisition";
  supportedReleasePriorities:
    readonly FocusReleasePriority[];
  evidence:
    readonly EvidenceProvenance[];
  limitations: readonly string[];
}
```

## FocusControlState

Immutable logical MF/single-AF/continuous-AF state. Resolved focus remains a
finite longitudinal distance in metres or explicit infinity. Acquisition, loss,
reacquisition and lock records explain why a target is usable; a focus-release
gate remains separate from shutter sequencing. The ideal actuator does not model
commercial AF measurement accuracy or physical acquisition time.

```ts
export interface FocusControlState {
  version:
    typeof FOCUS_CONTROL_STATE_VERSION;
  stateId: string;
  sourceProfile: {
    profileId: string;
    profileVersion: string;
  };
  profileLimitations:
    readonly string[];
  mode:
    FocusControlMode;
  acquisitionState:
    FocusAcquisitionState;
  focus:
    FocusPlane;
  activeTargetId?: string;
  activeFocusAreaId?: string;
  lastEventTimeSeconds: number;
  focusResolvedAtSeconds:
    number;
  locked: boolean;
  lock?: {
    lockedAtSeconds: number;
    resumeAcquisitionState:
      Exclude<
        FocusAcquisitionState,
        "locked"
      >;
  };
  actuatorModel:
    "ideal-instantaneous";
  continuousTargetLossPolicy:
    "hold-last-focus-require-explicit-reacquisition";
  exposureModified: false;
  meteringModified: false;
  whiteBalanceModified: false;
  subjectTrackingRecognitionModeled:
    false;
  rendererCoordinatesConsumed:
    false;
  limitations:
    readonly string[];
}
```

## FocusReleaseGateAssessment

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface FocusReleaseGateAssessment {
  priority:
    FocusReleasePriority;
  releaseAuthorized: boolean;
  reason:
    | "manual-focus-state"
    | "focus-acquired"
    | "focus-locked"
    | "release-priority-bypasses-focus-gate"
    | "focus-not-acquired"
    | "balanced-policy-not-modeled";
  requiresProfileSpecificBalancedPolicy:
    boolean;
  opticalFocusModified: false;
  exposureModified: false;
}
```

## FocusReleasePriority

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type FocusReleasePriority =
  | "focus-priority"
  | "release-priority"
  | "balanced";
```

## FocusTargetControlEvent

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type FocusTargetControlEvent =
  | "acquire"
  | "update";
```

## FocusTargetLossReason

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type FocusTargetLossReason =
  | "occluded"
  | "out-of-frame"
  | "identity-lost"
  | "outside-focus-area";
```

## FocusTargetObservation

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type FocusTargetObservation =
  | (FocusTargetObservationBase & {
      kind: "finite-surface";
      /**
       * Longitudinal camera-space/conjugate distance from #103, not renderer
       * ray length.
       */
      longitudinalDistanceM: number;
    })
  | (FocusTargetObservationBase & {
      kind:
        "infinity-environment";
    })
  | (FocusTargetObservationBase & {
      kind: "unavailable";
      reason:
        FocusTargetLossReason;
    });
```

## FocusTargetResolution

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface FocusTargetResolution {
  state:
    FocusControlState;
  targetObservationApplied:
    boolean;
  focusChanged: boolean;
  acquisitionEvent:
    FocusTargetControlEvent;
  actuatorModel:
    "ideal-instantaneous";
  silentRetargetingPerformed:
    false;
}
```

## parseFocusControlProfile

Validate an untrusted declaration and return the normalized typed contract. Unknown enum values,
missing required fields and incompatible scientific data fail at this boundary.

Focus is a longitudinal plane or explicit infinity state, never a screen-space distance. The ideal
actuator resolves supplied target observations; it does not infer a commercial AF sensor, focus-ring
scale or acquisition latency. Target loss, reacquisition, focus lock and release priority remain
separate state transitions.

```ts
export function parseFocusControlProfile(
  value: unknown
): FocusControlProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## resolveFocusTargetObservation

Resolve an explicit available/lost target observation under the selected single/continuous AF
policy, retaining acquisition and reacquisition disposition.

Focus is a longitudinal plane or explicit infinity state, never a screen-space distance. The ideal
actuator resolves supplied target observations; it does not infer a commercial AF sensor, focus-ring
scale or acquisition latency. Target loss, reacquisition, focus lock and release priority remain
separate state transitions.

```ts
export function resolveFocusTargetObservation(
  input:
    ResolveFocusTargetObservationInput
): FocusTargetResolution;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ResolveFocusTargetObservationInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolveFocusTargetObservationInput {
  state:
    FocusControlState;
  stateId: string;
  event:
    FocusTargetControlEvent;
  observation:
    FocusTargetObservation;
}
```

## setFocusLock

Return an explicit lock/unlock transition without changing the underlying physical focus plane.

Focus is a longitudinal plane or explicit infinity state, never a screen-space distance. The ideal
actuator resolves supplied target observations; it does not infer a commercial AF sensor, focus-ring
scale or acquisition latency. Target loss, reacquisition, focus lock and release priority remain
separate state transitions.

```ts
export function setFocusLock(
  input:
    SetFocusLockInput
): FocusControlState;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## SetFocusLockInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SetFocusLockInput {
  state:
    FocusControlState;
  stateId: string;
  locked: boolean;
  eventTimeSeconds: number;
}
```

## setManualFocusState

Return a manual focus transition to the supplied finite/infinity plane without inventing a lens
actuator or focus-ring conversion.

Focus is a longitudinal plane or explicit infinity state, never a screen-space distance. The ideal
actuator resolves supplied target observations; it does not infer a commercial AF sensor, focus-ring
scale or acquisition latency. Target loss, reacquisition, focus lock and release priority remain
separate state transitions.

```ts
export function setManualFocusState(
  input:
    SetManualFocusStateInput
): FocusControlState;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## SetManualFocusStateInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SetManualFocusStateInput {
  state:
    FocusControlState;
  stateId: string;
  focus:
    FocusPlane;
  eventTimeSeconds: number;
  commandId?: string;
}
```
