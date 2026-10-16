# sensor/readout-exposure-linkage.ts public contracts

The package and root API versions are recorded once in [Navigation](../API_REFERENCE.md) · [Developer guide](https://github.com/Photivra/photivra/blob/main/docs/DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## assessReadoutExposureTimingLinkage

Assesses an explicitly declared relationship between rolling sensor readout
spatial phase and one or more electronic exposure-boundary scans.

This contract is deliberately weaker than temporal synchronization. It can
establish that two schedules traverse the same native spatial phase ordering
(or its reverse), but it does not establish when sensor data readout occurs
relative to exposure start/end.

The total capture data-readout duration is preserved diagnostically and is
never used to validate the relationship. Different rolling-readout spatial
skew and exposure-boundary traversal durations are allowed; their ratio is
reported without implying a shared clock origin.

```ts
export function assessReadoutExposureTimingLinkage(
  input: AssessReadoutExposureTimingLinkageInput
): CalculationResult<ReadoutExposureTimingLinkageAssessment>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## AssessReadoutExposureTimingLinkageInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface AssessReadoutExposureTimingLinkageInput {
  nativeRaster: NativeImageRaster;
  activeCaptureRect?: RasterRect;
  shutterMechanism: CaptureShutterMechanism;
  readout: SensorReadoutTimingDeclaration;
  nominalExposureDurationSeconds: SourcedCaptureTimingSeconds;
  opening: ExposureBoundarySchedule;
  closing: ExposureBoundarySchedule;
  linkage: ReadoutExposureTimingLinkageDeclaration;
  samplePointsNative?: readonly RasterPoint[];
}
```

## createRollingShutterCaptureExposureSchedule

The exposure-schedule fields of a derived rolling-shutter schedule, without model metadata.

```ts
export function createRollingShutterCaptureExposureSchedule(
  schedule: ElectronicRollingShutterExposureSchedule
): Pick<CalculateCaptureExposureWindowsInput, "shutterMechanism" | "nominalExposureDurationSeconds" | "opening" | "closing">;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ELECTRONIC_ROLLING_SHUTTER_MODEL

Model identity of the electronic rolling-shutter (line reset → line read) exposure schedule.

```ts
ELECTRONIC_ROLLING_SHUTTER_MODEL = Object.freeze({
  id: "electronic-rolling-shutter-line-reset-read",
  version: "1.0.0"
} as const)
```

## ElectronicRollingShutterExposureSchedule

Exposure-window schedule of an electronic rolling shutter. Its `shutterMechanism`,
`nominalExposureDurationSeconds`, `opening` and `closing` fields form a complete exposure schedule, so
they can be passed as a native RAW / environment `exposureWindow` or spread into a production
`temporalCapture.exposureWindowInput` (see {@link createRollingShutterCaptureExposureSchedule}).

```ts
export interface ElectronicRollingShutterExposureSchedule {
  modelId: typeof ELECTRONIC_ROLLING_SHUTTER_MODEL.id;
  modelVersion: typeof ELECTRONIC_ROLLING_SHUTTER_MODEL.version;
  shutterMechanism: "electronic";
  nominalExposureDurationSeconds: SourcedCaptureTimingSeconds;
  /** Line-reset scan: a native point at normalized scan position s starts integrating at s·τ. */
  opening: UniformLinearExposureBoundarySchedule;
  /** Line-read scan: the same point stops integrating at T + s·τ. */
  closing: UniformLinearExposureBoundarySchedule;
  /** Explicit linkage declaration accepted by {@link assessReadoutExposureTimingLinkage}. */
  linkage: Extract<ReadoutExposureTimingLinkageDeclaration, { kind: "spatial-phase-linked" }>;
  /** τ: first-to-last exposure-start offset (equal to the readout spatial sampling skew). */
  lineScanSkewSeconds: number;
  /** Every point integrates for exactly the nominal exposure duration T. */
  localExposureDurationSeconds: number;
  limitations: readonly string[];
}
```

## ReadoutExposureBoundaryId

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type ReadoutExposureBoundaryId = "opening" | "closing";
```

## ReadoutExposureBoundarySpatialLink

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ReadoutExposureBoundarySpatialLink {
  boundary: ReadoutExposureBoundaryId;
  /**
   * Relationship between normalized rolling-readout scan phase and the
   * selected electronic exposure-boundary scan phase.
   *
   * "same": boundary normalized phase = readout normalized phase.
   * "reversed": boundary normalized phase = 1 - readout normalized phase.
   *
   * This does not establish absolute temporal synchronization.
   */
  phaseOrientation: ReadoutExposureSpatialPhaseOrientation;
  /**
   * Evidence supporting the relationship itself.
   *
   * The readout direction/timing and exposure-boundary direction/timing retain
   * their own separate evidence.
   */
  evidence: readonly EvidenceProvenance[];
}
```

## ReadoutExposureBoundarySpatialLinkAssessment

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ReadoutExposureBoundarySpatialLinkAssessment {
  boundary: ReadoutExposureBoundaryId;
  boundaryActuator: "electronic";
  phaseOrientation: ReadoutExposureSpatialPhaseOrientation;
  normalizedPhaseRelationship:
    | "boundary-phase-equals-readout-phase"
    | "boundary-phase-equals-one-minus-readout-phase";
  relationshipEvidence: readonly EvidenceProvenance[];
  readoutDirectionNative: NativeSensorReadoutScanDirection;
  boundaryDirectionNative: NativeSensorReadoutScanDirection;
  /**
   * First-to-last rolling sensor spatial sampling skew.
   */
  readoutSpatialSamplingSkewSeconds: SourcedSensorTimingSeconds;
  /**
   * First-to-last exposure-boundary traversal duration.
   */
  boundaryTraversalDurationSeconds: SourcedCaptureTimingSeconds;
  /**
   * Derived descriptive ratio only. A value of 1 does not prove temporal
   * synchronization or a common clock origin.
   */
  boundaryTraversalToReadoutSpatialSkewRatio: number;
  absoluteTemporalAlignment: "not-established";
}
```

## ReadoutExposureSpatialPhaseOrientation

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type ReadoutExposureSpatialPhaseOrientation =
  | "same"
  | "reversed";
```

## ReadoutExposureTimingLinkageAssessment

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ReadoutExposureTimingLinkageAssessment {
  linkageKind: ReadoutExposureTimingLinkageDeclaration["kind"];
  relationshipMeaning:
    | "no-readout-exposure-relationship-asserted"
    | "normalized-spatial-phase-relationship-asserted";
  readoutMode: "rolling" | "global";
  shutterMechanism: CaptureShutterMechanism;
  activeCaptureRect: RasterRect;
  absoluteTemporalAlignment: "not-established";
  /**
   * Capture data-readout duration is preserved for diagnostics but is not used
   * to validate any exposure-boundary linkage.
   */
  captureReadoutDurationSeconds: SourcedSensorTimingSeconds;
  links: readonly ReadoutExposureBoundarySpatialLinkAssessment[];
  componentProvenance: {
    sensorReadout: CalculationProvenance;
    exposureWindows: CalculationProvenance;
  };
}
```

## ReadoutExposureTimingLinkageDeclaration

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type ReadoutExposureTimingLinkageDeclaration =
  | {
      /**
       * Photivra asserts no readout↔exposure relationship for this capture.
       * This is not evidence that the physical processes are independent.
       */
      kind: "unlinked";
      links?: never;
    }
  | {
      /**
       * One or more exposure boundaries are explicitly related to rolling
       * readout by normalized native-sensor spatial phase.
       */
      kind: "spatial-phase-linked";
      links: readonly ReadoutExposureBoundarySpatialLink[];
    };
```

## resolveElectronicRollingShutterExposureSchedule

Derives the exposure-window schedule of a fully electronic rolling shutter from its rolling readout
declaration.

In a line-sequential CMOS rolling shutter each line is reset, integrates for the exposure time T and
is then read; the reset pointer leads the read pointer by T and both advance at the line rate
(El Gamal & Eltoukhy 2005; Liang, Chang & Chen 2008). With the uniform-linear scan used throughout
this engine, a native point at normalized scan position s ∈ [0, 1] (measured along the declared scan
direction over the active capture) integrates over [s·τ, s·τ + T], where τ is the declared
first-to-last spatial sampling skew. Both boundaries therefore become uniform-linear scans in the
readout direction with traversal τ. Feeding this schedule to the per-site exposure windows makes every
consumer that samples motion, moving sources or temporal illumination at local exposure times
(environment RAW, rotation quadrature, temporal illumination integration) form rolling-shutter skew,
wobble, partial exposure and flicker banding.

Approximation: uniform line rate, no line-reset jitter, no global-reset/mechanical-close hybrid, and
the active-capture skew is caller-declared (never scaled from a full-frame value).

```ts
export function resolveElectronicRollingShutterExposureSchedule(
  input: ResolveElectronicRollingShutterExposureScheduleInput
): ElectronicRollingShutterExposureSchedule;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ResolveElectronicRollingShutterExposureScheduleInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolveElectronicRollingShutterExposureScheduleInput {
  /** Rolling readout declaration whose scan direction and spatial skew drive both exposure boundaries. */
  readout: RollingSensorReadoutTimingDeclaration;
  /** Per-line integration time between line reset and line read. */
  nominalExposureDurationSeconds: SourcedCaptureTimingSeconds;
  /**
   * Evidence that this capture uses a fully electronic line-sequential (rolling) shutter whose reset
   * scan runs at the readout line rate. This is the explicit linkage contract the domain rules require
   * before sensor readout timing may drive exposure-window timing.
   */
  linkageEvidence: readonly EvidenceProvenance[];
}
```
