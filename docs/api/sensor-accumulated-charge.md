# sensor/accumulated-charge.ts public contracts

Package **1.5.0**, root API **1.5.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## composeSensorAccumulatedCharge

Compose photo, independently evaluated dark and explicitly incremental charge by exact local
exposure identity, retaining completeness assessment before capacity/noise.

Photo, dark and explicitly incremental stored-electron components must share the exact
site/channel/local shutter event. Completeness is an evidence-backed declaration, not the
consequence of an empty component array. Expected stored charge remains distinct from a stochastic
realization or nonlinear full-well clamp.

```ts
export function composeSensorAccumulatedCharge(
  input: Omit<ComposeSensorAccumulatedChargeInput, "photoSignal" | "darkCharge"> & {
    photoSignal: SensorEqeExposureIntegration; darkCharge: SensorDarkCurrentCharge;
  }
): CalculationResult<SensorAccumulatedChargeComposition>;
```

```ts
export function composeSensorAccumulatedCharge(
  input: Omit<ComposeSensorAccumulatedChargeInput, "photoSignal" | "darkCharge"> & {
    photoSignal: SensorEqeTemporalPhotoSignal; darkCharge: SensorTemporalDarkCurrentCharge;
  }
): CalculationResult<SensorAccumulatedChargeComposition<SensorEqeTemporalPhotoSignal, SensorTemporalDarkCurrentCharge>>;
```

```ts
export function composeSensorAccumulatedCharge(
  input: ComposeSensorPhotoAccumulatedChargeInput
): CalculationResult<SensorPhotoAccumulatedChargeComposition>;
```

```ts
export function composeSensorAccumulatedCharge(
  input: ComposeSensorPhotoAccumulatedChargeInput
): CalculationResult<SensorPhotoAccumulatedChargeComposition>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ComposeSensorAccumulatedChargeInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ComposeSensorAccumulatedChargeInput<
  Photo extends SensorEqePhotoExposure = SensorEqeExposureIntegration,
  Dark extends SensorPhotoDarkCurrentCharge = SensorDarkCurrentCharge
> {
  photoSignal:
    Photo;
  darkCharge:
    Dark;
  additionalChargeComponents?:
    readonly SensorAdditionalStoredChargeComponent[];
  completenessProfile:
    SensorAccumulatedChargeCompletenessProfile;
}
```

## ComposeSensorPhotoAccumulatedChargeInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type ComposeSensorPhotoAccumulatedChargeInput = ComposeSensorAccumulatedChargeInput<SensorEqePhotoExposure, SensorPhotoDarkCurrentCharge>;
```

## parseSensorAccumulatedChargeCompletenessProfile

Validate an untrusted declaration and return the normalized typed contract. Unknown enum values,
missing required fields and incompatible scientific data fail at this boundary.

Photo, dark and explicitly incremental stored-electron components must share the exact
site/channel/local shutter event. Completeness is an evidence-backed declaration, not the
consequence of an empty component array. Expected stored charge remains distinct from a stochastic
realization or nonlinear full-well clamp.

```ts
export function parseSensorAccumulatedChargeCompletenessProfile(
  value: unknown
): SensorAccumulatedChargeCompletenessProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## parseSensorAdditionalStoredChargeComponent

Validate an untrusted declaration and return the normalized typed contract. Unknown enum values,
missing required fields and incompatible scientific data fail at this boundary.

Photo, dark and explicitly incremental stored-electron components must share the exact
site/channel/local shutter event. Completeness is an evidence-backed declaration, not the
consequence of an empty component array. Expected stored charge remains distinct from a stochastic
realization or nonlinear full-well clamp.

```ts
export function parseSensorAdditionalStoredChargeComponent(
  value: unknown
): SensorAdditionalStoredChargeComponent;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## SensorAccumulatedChargeCompletenessProfile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorAccumulatedChargeCompletenessProfile {
  schemaVersion: "0.1.0";
  profileId: string;
  colorSamplingProfileId: string;
  channelId: string;
  site: {
    x: number;
    y: number;
  };
  bindingId: string;
  timeReference:
    "first-opening-boundary-phase";
  startOffsetSecondsFromOpeningReference:
    number;
  endOffsetSecondsFromOpeningReference:
    number;
  darkCurrentProfileId: string;
  includedAdditionalComponentIds:
    readonly string[];
  coverageMeaning:
    "all-material-stored-electron-contributors-accounted-for";
  scientificStatus:
    SensorSpectralResponseScientificStatus;
  evidence:
    readonly EvidenceProvenance[];
  limitation?: string;
}
```

## SensorAccumulatedChargeComposition

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorAccumulatedChargeComposition<
  Photo extends SensorEqePhotoExposure = SensorEqeExposureIntegration,
  Dark extends SensorPhotoDarkCurrentCharge = SensorDarkCurrentCharge
> {
  completenessProfileId: string;
  colorSamplingProfileId: string;
  channelId: string;
  site: {
    x: number;
    y: number;
  };
  bindingId: string;
  timeReference:
    "first-opening-boundary-phase";
  startOffsetSecondsFromOpeningReference:
    number;
  endOffsetSecondsFromOpeningReference:
    number;
  localExposureDurationSeconds:
    number;
  photoExpectedElectronCount:
    number;
  darkExpectedElectronCount:
    number;
  additionalExpectedElectronCount:
    number;
  totalExpectedStoredElectronCount:
    number;
  additionalComponents:
    readonly {
      componentId: string;
      kind:
        SensorAdditionalStoredChargeKind;
      expectedElectronCount: number;
      scientificStatus:
        SensorSpectralResponseScientificStatus;
      uncertainty:
        SensorSpectralResponseUncertainty;
      evidence:
        readonly EvidenceProvenance[];
    }[];
  accumulatedChargeCompleteness:
    "complete-for-physical-storage-capacity-assessment";
  completenessScientificStatus:
    SensorSpectralResponseScientificStatus;
  allCountsAreExpectationValues: true;
  integerChargeSampled: false;
  photoSignalIncluded: true;
  darkChargeIncluded: true;
  otherChargeIncluded: boolean;
  darkShotNoiseApplied: false;
  photoShotNoiseApplied: false;
  readNoiseApplied: false;
  physicalFullWellAssessmentAuthorized:
    true;
  cameraSaturationAssessmentAuthorized:
    false;
  saturationAssessed: false;
  bloomingModeled: false;
  adcQuantizationApplied: false;
  rawCodeValueProduced: false;
  componentEvidence: {
    completeness:
      readonly EvidenceProvenance[];
    photoSignal:
      Photo["componentEvidence"];
    darkCurrent:
      Dark["componentEvidence"];
  };
}
```

## SensorAdditionalStoredChargeComponent

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorAdditionalStoredChargeComponent {
  componentId: string;
  kind:
    SensorAdditionalStoredChargeKind;
  colorSamplingProfileId: string;
  channelId: string;
  site: {
    x: number;
    y: number;
  };
  bindingId: string;
  timeReference:
    "first-opening-boundary-phase";
  startOffsetSecondsFromOpeningReference:
    number;
  endOffsetSecondsFromOpeningReference:
    number;
  accountingMeaning:
    "incremental-stored-electrons-beyond-photo-and-modeled-dark-current";
  expectedElectronCount: number;
  scientificStatus:
    SensorSpectralResponseScientificStatus;
  uncertainty:
    SensorSpectralResponseUncertainty;
  evidence:
    readonly EvidenceProvenance[];
}
```

## SensorAdditionalStoredChargeKind

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorAdditionalStoredChargeKind =
  | "hot-pixel-defect-excess"
  | "leakage"
  | "charge-injection"
  | "clock-induced-charge"
  | "other";
```

## SensorPhotoAccumulatedChargeComposition

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorPhotoAccumulatedChargeComposition = SensorAccumulatedChargeComposition<SensorEqePhotoExposure, SensorPhotoDarkCurrentCharge>;
```
