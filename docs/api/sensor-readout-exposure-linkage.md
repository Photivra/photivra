# sensor/readout-exposure-linkage.ts public contracts

Package **1.0.1**, root API **1.0.1**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

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
