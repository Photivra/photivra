# sensor/capture-mode-timing.ts public contracts

Package **1.3.0**, root API **1.3.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## CAPTURE_MODE_TIMING_PROFILE_SCHEMA_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
CAPTURE_MODE_TIMING_PROFILE_SCHEMA_VERSION =
  "0.1.0" as const
```

## CaptureModeTimingProfile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CaptureModeTimingProfile {
  schemaVersion:
    typeof CAPTURE_MODE_TIMING_PROFILE_SCHEMA_VERSION;
  profileId: string;
  profileVersion: string;
  captureModeId: string;
  scientificStatus: "approximation";
  scheduleFamily:
    "global-or-uniform-linear-native-scan";
  shutterMechanism:
    CaptureShutterMechanism;
  opening:
    ExposureBoundarySchedule;
  closing:
    ExposureBoundarySchedule;
  readout:
    SensorReadoutTimingDeclaration;
  nonUniformScheduleModeled: false;
  evidence: readonly EvidenceProvenance[];
  limitations: readonly string[];
}
```

## parseCaptureModeTimingProfile

Parses timing facts that are explicitly bound to one exact capture mode.

Schema 0.1.0 intentionally admits only the timing schedule families already
owned by #12: simultaneous/global or uniform-linear native scans. Unsupported
non-uniform/segmented schedules fail closed instead of being approximated.

```ts
export function parseCaptureModeTimingProfile(
  value: unknown
): CaptureModeTimingProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## resolveCaptureModeTiming

Resolves the authoritative exposure/readout timing for one exact capture
mode and timing-profile identity.

Readout timing remains distinct from exposure-boundary timing. No absolute
readout/exposure synchronization is inferred.

```ts
export function resolveCaptureModeTiming(
  input:
    ResolveCaptureModeTimingInput
): ResolvedCaptureModeTiming;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ResolveCaptureModeTimingInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolveCaptureModeTimingInput {
  captureMode:
    ResolvedCaptureMode;
  timingProfile:
    CaptureModeTimingProfile;
  nominalExposureDurationSeconds:
    SourcedCaptureTimingSeconds;
  activeCaptureRect?: RasterRect;
  samplePointsNative?:
    readonly RasterPoint[];
}
```

## ResolvedCaptureModeTiming

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolvedCaptureModeTiming {
  schemaVersion:
    typeof CAPTURE_MODE_TIMING_PROFILE_SCHEMA_VERSION;
  timingProfileId: string;
  timingProfileVersion: string;
  captureModeId: string;
  captureModeTimingIdentity:
    "exact-mode-and-profile";
  nativeRaster: NativeImageRaster;
  modeDeclaresTimingDependency:
    boolean;
  scheduleFamily:
    "global-or-uniform-linear-native-scan";
  exposureWindows:
    CaptureExposureWindows;
  readoutTiming:
    SensorReadoutTiming;
  timeReference:
    "first-opening-boundary-phase";
  readoutExposureSynchronization:
    "not-assumed";
  nonUniformScheduleModeled: false;
  evidence: readonly EvidenceProvenance[];
  limitations: readonly string[];
}
```
