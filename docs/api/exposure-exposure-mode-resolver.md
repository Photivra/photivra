# exposure/exposure-mode-resolver.ts public contracts

Package **1.1.0**, root API **1.1.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## AperturePriorityAutoIsoExposureModeResolution

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type AperturePriorityAutoIsoExposureModeResolution =
  | {
      resolverVersion:
        typeof EXPOSURE_MODE_RESOLVER_VERSION;
      mode:
        "aperture-priority";
      status: "resolved";
      axisOwnership: {
        aperture: "manual";
        shutter: "automatic";
        iso: "automatic";
      };
      targetId: string;
      targetSourceMeterSnapshot:
        ExposureMeterTarget["sourceMeterSnapshot"];
      referenceExposure:
        RelativeExposureControlAnchor;
      manualAperture: number;
      policy:
        AperturePriorityAutoIsoPolicy;
      baselineIso: number;
      idealShutterAtBaselineIsoSeconds:
        number;
      preferredShutterSeconds:
        number;
      afterMaximumIsoFallbackUsed:
        boolean;
      resolvedSettings: {
        aperture: number;
        shutterSeconds: number;
        iso: number;
      };
      shutterResolution: {
        kind:
          | "continuous"
          | "discrete";
        quantized: boolean;
        clamped:
          | false
          | "minimum"
          | "maximum";
        selectionPolicy:
          | "not-longer-than-target"
          | "nearest-log2-shorter-on-tie";
      };
      isoResolution:
        PriorityAutoIsoResolutionCommon["isoResolution"];
      idealIsoBeforeConstraints: number;
      targetResidual:
        Extract<
          ExposureTargetResidual,
          { status: "resolved" }
        >;
      apertureMutatedByResolver: false;
      shutterResolvedByResolver: true;
      isoResolvedByResolver: true;
      exposureCompensationAppliedByResolver:
        false;
      meterRecomputedByResolver: false;
      flashPolicyApplied: false;
      safetyShiftApplied: false;
    }
  | {
      resolverVersion:
        typeof EXPOSURE_MODE_RESOLVER_VERSION;
      mode:
        "aperture-priority";
      status: "blocked";
      axisOwnership: {
        aperture: "manual";
        shutter: "automatic";
        iso: "automatic";
      };
      targetId: string;
      targetSourceMeterSnapshot:
        ExposureMeterTarget["sourceMeterSnapshot"];
      referenceExposure:
        RelativeExposureControlAnchor;
      manualAperture: number;
      policy:
        AperturePriorityAutoIsoPolicy;
      resolvedSettings: {
        aperture: number;
      };
      blocker:
        | "auto-iso-unsupported"
        | "auto-iso-unknown"
        | "target-no-signal";
      targetResidual: {
        status:
          "target-unresolved";
        state:
          "target-unresolved";
        reason:
          | "no-signal-target"
          | "auto-iso-unavailable";
      };
      apertureMutatedByResolver: false;
      exposureCompensationAppliedByResolver:
        false;
      meterRecomputedByResolver: false;
      flashPolicyApplied: false;
      safetyShiftApplied: false;
    };
```

## AperturePriorityAutoIsoPolicy

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface AperturePriorityAutoIsoPolicy
  extends AutoIsoBaselinePolicy {
  kind:
    "minimum-iso-until-slowest-preferred-shutter";
  slowestPreferredShutterSeconds:
    number;
  shutterSelectionPolicy:
    "not-longer-than-target";
  afterMaximumIso:
    | "allow-slower-shutter"
    | "hold-preferred-shutter";
}
```

## AperturePriorityExposureModeResolution

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type AperturePriorityExposureModeResolution =
  | (AperturePriorityExposureResolutionBase & {
      status: "resolved";
      resolvedSettings: {
        aperture: number;
        shutterSeconds: number;
        iso: number;
      };
      idealShutterSecondsBeforeConstraints:
        number;
      shutterResolution: {
        kind:
          | "continuous"
          | "discrete";
        quantizationPolicy:
          "nearest-log2-shorter-on-tie";
        quantized: boolean;
        clamped:
          | false
          | "minimum"
          | "maximum";
      };
      targetResidual: {
        status: "resolved";
        state:
          | "matched"
          | "under-target"
          | "over-target";
        targetExposureStops: number;
        achievedExposureStops: number;
        residualStops: number;
        limitingConstraint:
          ExposureResolutionConstraint;
      };
    })
  | (AperturePriorityExposureResolutionBase & {
      status: "blocked";
      resolvedSettings: {
        aperture: number;
        iso: number;
      };
      idealShutterSecondsBeforeConstraints:
        null;
      blocker: "target-no-signal";
      targetResidual: {
        status: "target-unresolved";
        state: "target-unresolved";
        reason: "no-signal-target";
      };
    });
```

## AutoIsoBaselinePolicy

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface AutoIsoBaselinePolicy {
  isoBaseline: "minimum-selectable";
  isoQuantizationPolicy:
    "nearest-log2-lower-on-tie";
}
```

## EXPOSURE_MODE_RESOLVER_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
EXPOSURE_MODE_RESOLVER_VERSION =
  "0.5.0" as const
```

## ExposureResolutionConstraint

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type ExposureResolutionConstraint =
  | "none"
  | "iso-minimum"
  | "iso-maximum"
  | "iso-grid-quantization"
  | "shutter-minimum"
  | "shutter-maximum"
  | "shutter-grid-quantization"
  | "aperture-widest"
  | "aperture-narrowest"
  | "aperture-grid-quantization";
```

## ExposureTargetResidual

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type ExposureTargetResidual =
  | {
      status: "resolved";
      state:
        | "matched"
        | "under-target"
        | "over-target";
      targetExposureStops: number;
      achievedExposureStops: number;
      residualStops: number;
      limitingConstraint:
        ExposureResolutionConstraint;
    }
  | {
      status:
        "target-unresolved";
      state:
        "target-unresolved";
      reason:
        "no-signal-target";
    };
```

## ExposureTargetResidualState

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type ExposureTargetResidualState =
  | "matched"
  | "under-target"
  | "over-target"
  | "target-unresolved";
```

## FullAutoExposureModeResolution

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type FullAutoExposureModeResolution =
  | (ProgramExposureResolutionBase & {
      mode:
        "full-auto-exposure";
      status: "resolved";
      axisOwnership: {
        aperture: "automatic";
        shutter: "automatic";
        iso: "automatic";
      };
      policy:
        FullAutoExposurePolicy;
      baselineIso: number;
      idealIsoBeforeConstraints:
        number;
      isoResolution:
        PriorityAutoIsoResolutionCommon["isoResolution"];
      resolvedSettings: {
        aperture: number;
        shutterSeconds: number;
        iso: number;
      };
      targetResidual:
        Extract<
          ExposureTargetResidual,
          { status: "resolved" }
        >;
      autofocusResolved: false;
      whiteBalanceResolved: false;
      flashResolved: false;
      driveResolved: false;
      sceneRecognitionResolved: false;
      stabilizationPolicyResolved:
        false;
    })
  | {
      resolverVersion:
        typeof EXPOSURE_MODE_RESOLVER_VERSION;
      mode:
        "full-auto-exposure";
      status: "blocked";
      axisOwnership: {
        aperture: "automatic";
        shutter: "automatic";
        iso: "automatic";
      };
      policy:
        FullAutoExposurePolicy;
      targetId: string;
      targetSourceMeterSnapshot:
        ExposureMeterTarget["sourceMeterSnapshot"];
      referenceExposure:
        RelativeExposureControlAnchor;
      blocker:
        | "target-no-signal"
        | "auto-iso-unsupported"
        | "auto-iso-unknown";
      targetResidual: {
        status: "target-unresolved";
        state: "target-unresolved";
        reason:
          | "no-signal-target"
          | "auto-iso-unavailable";
      };
      exposureCompensationAppliedByResolver:
        false;
      meterRecomputedByResolver: false;
      flashPolicyApplied: false;
      safetyShiftApplied: false;
      autofocusResolved: false;
      whiteBalanceResolved: false;
      flashResolved: false;
      driveResolved: false;
      sceneRecognitionResolved: false;
      stabilizationPolicyResolved:
        false;
    };
```

## FullAutoExposurePolicy

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface FullAutoExposurePolicy {
  kind:
    "generic-program-line-minimum-iso";
  programLine:
    ExposureProgramLineProfile;
  isoBaseline:
    "minimum-selectable";
  isoQuantizationPolicy:
    "nearest-log2-lower-on-tie";
}
```

## ManualExposureModeResolution

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type ManualExposureModeResolution =
  | (ManualExposureResolutionBase & {
      status: "resolved";
      isoControl: "manual";
      resolvedSettings: {
        aperture: number;
        shutterSeconds: number;
        iso: number;
      };
      idealIsoBeforeConstraints:
        null;
      isoResolution: {
        kind: "manual-preserved";
        quantized: false;
        clamped: false;
      };
      targetResidual:
        ExposureTargetResidual;
    })
  | (ManualExposureResolutionBase & {
      status: "resolved";
      isoControl: "automatic";
      resolvedSettings: {
        aperture: number;
        shutterSeconds: number;
        iso: number;
      };
      idealIsoBeforeConstraints:
        number;
      isoResolution: {
        kind:
          | "continuous"
          | "discrete";
        quantizationPolicy:
          "nearest-log2-lower-on-tie";
        quantized: boolean;
        clamped:
          | false
          | "minimum"
          | "maximum";
      };
      targetResidual: {
        status: "resolved";
        state:
          | "matched"
          | "under-target"
          | "over-target";
        targetExposureStops: number;
        achievedExposureStops: number;
        residualStops: number;
        limitingConstraint:
          ExposureResolutionConstraint;
      };
    })
  | (ManualExposureResolutionBase & {
      status: "blocked";
      isoControl: "automatic";
      resolvedSettings: {
        aperture: number;
        shutterSeconds: number;
      };
      idealIsoBeforeConstraints:
        null;
      blocker:
        | "auto-iso-unsupported"
        | "auto-iso-unknown"
        | "target-no-signal";
      targetResidual: {
        status:
          "target-unresolved";
        state:
          "target-unresolved";
        reason:
          "no-signal-target" |
          "auto-iso-unavailable";
      };
    });
```

## ManualIsoControl

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type ManualIsoControl =
  | {
      kind: "manual";
      iso: number;
    }
  | {
      kind: "automatic";
      quantizationPolicy:
        "nearest-log2-lower-on-tie";
    };
```

## ProgramAutoExposureModeResolution

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type ProgramAutoExposureModeResolution =
  | (ProgramExposureResolutionBase & {
      mode: "program-auto";
      status: "resolved";
      axisOwnership: {
        aperture: "automatic";
        shutter: "automatic";
        iso: "manual";
      };
      isoControl: "manual";
      manualIso: number;
      resolvedSettings: {
        aperture: number;
        shutterSeconds: number;
        iso: number;
      };
      targetResidual:
        Extract<
          ExposureTargetResidual,
          { status: "resolved" }
        >;
    })
  | (ProgramExposureResolutionBase & {
      mode: "program-auto";
      status: "resolved";
      axisOwnership: {
        aperture: "automatic";
        shutter: "automatic";
        iso: "automatic";
      };
      isoControl: "automatic";
      baselineIso: number;
      idealIsoBeforeConstraints:
        number;
      isoResolution:
        PriorityAutoIsoResolutionCommon["isoResolution"];
      resolvedSettings: {
        aperture: number;
        shutterSeconds: number;
        iso: number;
      };
      targetResidual:
        Extract<
          ExposureTargetResidual,
          { status: "resolved" }
        >;
    })
  | {
      resolverVersion:
        typeof EXPOSURE_MODE_RESOLVER_VERSION;
      mode: "program-auto";
      status: "blocked";
      axisOwnership: {
        aperture: "automatic";
        shutter: "automatic";
        iso: "manual" | "automatic";
      };
      isoControl: "manual" | "automatic";
      targetId: string;
      targetSourceMeterSnapshot:
        ExposureMeterTarget["sourceMeterSnapshot"];
      referenceExposure:
        RelativeExposureControlAnchor;
      blocker:
        | "target-no-signal"
        | "auto-iso-unsupported"
        | "auto-iso-unknown";
      targetResidual: {
        status: "target-unresolved";
        state: "target-unresolved";
        reason:
          | "no-signal-target"
          | "auto-iso-unavailable";
      };
      exposureCompensationAppliedByResolver:
        false;
      meterRecomputedByResolver: false;
      flashPolicyApplied: false;
      safetyShiftApplied: false;
    };
```

## ProgramAutoIsoControl

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type ProgramAutoIsoControl =
  | {
      kind: "manual";
      iso: number;
    }
  | {
      kind: "automatic";
      isoBaseline:
        "minimum-selectable";
      isoQuantizationPolicy:
        "nearest-log2-lower-on-tie";
    };
```

## ProgramLineSelectionDiagnostics

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ProgramLineSelectionDiagnostics {
  profileId: string;
  profileVersion: string;
  requestedOpticalExposureStopsFromReference:
    number;
  selectedOpticalExposureStopsFromReference:
    number;
  position:
    | "within-line"
    | "below-line"
    | "above-line";
  interpolationPhase:
    number | null;
  idealAperture: number;
  idealShutterSeconds: number;
  resolvedAperture: number;
  resolvedShutterSeconds: number;
  apertureQuantized: boolean;
  shutterQuantized: boolean;
  apertureClamped:
    | false
    | "widest"
    | "narrowest";
  shutterClamped:
    | false
    | "minimum"
    | "maximum";
}
```

## RelativeExposureControlAnchor

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface RelativeExposureControlAnchor {
  aperture: number;
  shutterSeconds: number;
  iso: number;
}
```

## resolveAperturePriorityAutoIsoExposureMode

Hold aperture fixed, follow the declared minimum-shutter policy and use bounded Auto ISO to absorb
remaining target residual.

Exposure modes apply control policy to one shared relative exposure equation and an explicit
reference anchor. Compensation is already included in the immutable meter target. Manual axes remain
unchanged; automatic axes use declared setting grids and expose signed residual stops and limit
diagnostics. A zero-signal target cannot authorize an invented exposure.

```ts
export function resolveAperturePriorityAutoIsoExposureMode(
  input:
    ResolveAperturePriorityAutoIsoExposureModeInput
): AperturePriorityAutoIsoExposureModeResolution;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ResolveAperturePriorityAutoIsoExposureModeInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolveAperturePriorityAutoIsoExposureModeInput {
  target: ExposureMeterTarget;
  capabilities:
    ResolvedGenericEquipmentExposureCapabilities;
  referenceExposure:
    RelativeExposureControlAnchor;
  manualAperture: number;
  policy: AperturePriorityAutoIsoPolicy;
}
```

## resolveAperturePriorityExposureMode

Resolves Aperture Priority with manual ISO.

Aperture and ISO remain caller-owned. Shutter is the only automatic axis.
The target/reference relationship is the same relative exposure model used
by Manual + Auto ISO; no new mode-specific exposure equation is introduced.

```ts
export function resolveAperturePriorityExposureMode(
  input:
    ResolveAperturePriorityExposureModeInput
): AperturePriorityExposureModeResolution;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ResolveAperturePriorityExposureModeInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolveAperturePriorityExposureModeInput {
  target: ExposureMeterTarget;
  capabilities:
    ResolvedGenericEquipmentExposureCapabilities;
  referenceExposure:
    RelativeExposureControlAnchor;
  manualAperture: number;
  manualIso: number;
  shutterQuantizationPolicy:
    "nearest-log2-shorter-on-tie";
}
```

## resolveFullAutoExposureMode

Resolve aperture, shutter and ISO under an explicit generic Full Auto exposure policy. Autofocus,
WB, flash, drive and scene recognition remain unresolved.

Exposure modes apply control policy to one shared relative exposure equation and an explicit
reference anchor. Compensation is already included in the immutable meter target. Manual axes remain
unchanged; automatic axes use declared setting grids and expose signed residual stops and limit
diagnostics. A zero-signal target cannot authorize an invented exposure.

```ts
export function resolveFullAutoExposureMode(
  input:
    ResolveFullAutoExposureModeInput
): FullAutoExposureModeResolution;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ResolveFullAutoExposureModeInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolveFullAutoExposureModeInput {
  target: ExposureMeterTarget;
  capabilities:
    ResolvedGenericEquipmentExposureCapabilities;
  referenceExposure:
    RelativeExposureControlAnchor;
  policy:
    FullAutoExposurePolicy;
}
```

## resolveManualExposureMode

Resolves Manual exposure with either manual ISO or Auto ISO.

Aperture and shutter are always caller-owned and are never changed.
The relative meter target is normalized by an explicit reference exposure
anchor; no ISO-100 or other hidden absolute calibration is assumed.

```ts
export function resolveManualExposureMode(
  input:
    ResolveManualExposureModeInput
): ManualExposureModeResolution;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ResolveManualExposureModeInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolveManualExposureModeInput {
  target: ExposureMeterTarget;
  capabilities:
    ResolvedGenericEquipmentExposureCapabilities;
  referenceExposure:
    RelativeExposureControlAnchor;
  manualAperture: number;
  manualShutterSeconds: number;
  isoControl: ManualIsoControl;
}
```

## resolveProgramAutoExposureMode

Evaluate the declared generic program line in log2 exposure space, quantize aperture/shutter and
optionally use Auto ISO for residual exposure.

Exposure modes apply control policy to one shared relative exposure equation and an explicit
reference anchor. Compensation is already included in the immutable meter target. Manual axes remain
unchanged; automatic axes use declared setting grids and expose signed residual stops and limit
diagnostics. A zero-signal target cannot authorize an invented exposure.

```ts
export function resolveProgramAutoExposureMode(
  input:
    ResolveProgramAutoExposureModeInput
): ProgramAutoExposureModeResolution;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ResolveProgramAutoExposureModeInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolveProgramAutoExposureModeInput {
  target: ExposureMeterTarget;
  capabilities:
    ResolvedGenericEquipmentExposureCapabilities;
  referenceExposure:
    RelativeExposureControlAnchor;
  programLine:
    ExposureProgramLineProfile;
  isoControl:
    ProgramAutoIsoControl;
}
```

## resolveShutterPriorityExposureMode

Hold shutter fixed and resolve aperture plus optional Auto ISO against the exact capability
envelope.

Exposure modes apply control policy to one shared relative exposure equation and an explicit
reference anchor. Compensation is already included in the immutable meter target. Manual axes remain
unchanged; automatic axes use declared setting grids and expose signed residual stops and limit
diagnostics. A zero-signal target cannot authorize an invented exposure.

```ts
export function resolveShutterPriorityExposureMode(
  input:
    ResolveShutterPriorityExposureModeInput
): ShutterPriorityExposureModeResolution;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ResolveShutterPriorityExposureModeInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolveShutterPriorityExposureModeInput {
  target: ExposureMeterTarget;
  capabilities:
    ResolvedGenericEquipmentExposureCapabilities;
  referenceExposure:
    RelativeExposureControlAnchor;
  manualShutterSeconds: number;
  isoControl:
    | {
        kind: "manual";
        iso: number;
        apertureQuantizationPolicy:
          "nearest-log2-narrower-on-tie";
      }
    | {
        kind: "automatic";
        policy:
          ShutterPriorityAutoIsoPolicy;
      };
}
```

## ShutterPriorityAutoIsoPolicy

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ShutterPriorityAutoIsoPolicy
  extends AutoIsoBaselinePolicy {
  kind:
    "minimum-iso-aperture-first";
  apertureSelectionPolicy:
    "not-wider-than-target";
}
```

## ShutterPriorityExposureModeResolution

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type ShutterPriorityExposureModeResolution =
  | (ShutterPriorityResolutionBase & {
      status: "resolved";
      axisOwnership: {
        aperture: "automatic";
        shutter: "manual";
        iso: "manual";
      };
      isoControl: "manual";
      manualIso: number;
      idealApertureBeforeConstraints:
        number;
      resolvedSettings: {
        aperture: number;
        shutterSeconds: number;
        iso: number;
      };
      apertureResolution: {
        kind:
          | "continuous"
          | "discrete";
        quantizationPolicy:
          "nearest-log2-narrower-on-tie";
        quantized: boolean;
        clamped:
          | false
          | "widest"
          | "narrowest";
      };
      targetResidual:
        Extract<
          ExposureTargetResidual,
          { status: "resolved" }
        >;
    })
  | (ShutterPriorityResolutionBase & {
      status: "resolved";
      axisOwnership: {
        aperture: "automatic";
        shutter: "manual";
        iso: "automatic";
      };
      isoControl: "automatic";
      policy:
        ShutterPriorityAutoIsoPolicy;
      baselineIso: number;
      idealApertureAtBaselineIso:
        number;
      resolvedSettings: {
        aperture: number;
        shutterSeconds: number;
        iso: number;
      };
      apertureResolution: {
        kind:
          | "continuous"
          | "discrete";
        quantized: boolean;
        clamped:
          | false
          | "widest"
          | "narrowest";
        selectionPolicy:
          "not-wider-than-target";
      };
      idealIsoBeforeConstraints: number;
      isoResolution:
        PriorityAutoIsoResolutionCommon["isoResolution"];
      targetResidual:
        Extract<
          ExposureTargetResidual,
          { status: "resolved" }
        >;
    })
  | (ShutterPriorityResolutionBase & {
      status: "blocked";
      axisOwnership: {
        aperture: "automatic";
        shutter: "manual";
        iso: "manual" | "automatic";
      };
      isoControl: "manual" | "automatic";
      resolvedSettings: {
        shutterSeconds: number;
      };
      blocker:
        | "auto-iso-unsupported"
        | "auto-iso-unknown"
        | "target-no-signal";
      targetResidual: {
        status:
          "target-unresolved";
        state:
          "target-unresolved";
        reason:
          | "no-signal-target"
          | "auto-iso-unavailable";
      };
    });
```
