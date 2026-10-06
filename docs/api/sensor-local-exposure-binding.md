# sensor/local-exposure-binding.ts public contracts

Package **1.5.0**, root API **1.5.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## bindSensorRateToLocalExposure

Binds one engine-produced sensor response-rate result to the local exposure
window at the same color-sampling site.

This first temporal binding supports only the explicit one-to-one
native-effective-sample ↔ color-site relationship. A multi-site block
binding proves contributor membership but does not prove each color site's
sub-sample timing coordinate, so spatially varying shutter timing fails
closed rather than inventing fractional positions.

The result establishes timing only. It deliberately does not establish that
the optical/electrical rate is stationary through the local exposure window,
so rate×duration integration remains unauthorized.

```ts
export function bindSensorRateToLocalExposure(
  input:
    BindSensorRateToLocalExposureInput
): CalculationResult<SensorRateLocalExposureBinding>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## BindSensorRateToLocalExposureInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface BindSensorRateToLocalExposureInput {
  rate:
    SensorInstantaneousRateResult;
  colorSamplingProfile:
    SensorColorSamplingProfile;
  bindingProfile:
    NativeEffectiveRasterColorSamplingBindingProfile;
  /**
   * One capture/exposure event. samplePointsNative is owned by this binding
   * function and therefore intentionally excluded.
   */
  exposureWindowInput:
    Omit<
      CalculateCaptureExposureWindowsInput,
      "samplePointsNative"
    >;
}
```

## SensorInstantaneousRateResult

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorInstantaneousRateResult =
  | SensorEqeElectronRate
  | SensorResponsivityPhotocurrent;
```

## SensorRateLocalExposureBinding

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorRateLocalExposureBinding {
  rateDomain:
    | "eqe-electron-rate"
    | "responsivity-photocurrent";
  rateIdentity: {
    responseProfileId: string;
    responseApplicationProfileId: string;
    operatingRangeProfileId: string;
    electricalApplicabilityProfileId?: string;
  };
  colorSamplingProfileId: string;
  channelId: string;
  site: {
    x: number;
    y: number;
  };
  bindingId: string;
  bindingRelationship:
    "one-native-effective-sample-to-one-color-site";
  timingCoordinateRule:
    "one-to-one-color-site-center-equals-native-effective-sample-center";
  nativeRasterPoint: {
    x: number;
    y: number;
  };
  shutterMechanism:
    CalculateCaptureExposureWindowsInput["shutterMechanism"];
  timeReference:
    "first-opening-boundary-phase";
  localExposureWindow:
    CaptureExposureWindowSample;
  localExposureDurationSeconds:
    number;
  exposureEventMeaning:
    "single-capture-local-exposure-window";
  nativeImageRasterBindingEstablished: true;
  channelAtSiteValidated: true;
  physicalPhotodiodeTimingRegistrationEstablished:
    false;
  multiFrameSequenceBindingEstablished:
    false;
  timeStationarityEstablished: false;
  constantRateTemporalIntegrationAuthorized:
    false;
  temporalIntegrationApplied: false;
  componentEvidence: {
    binding:
      readonly EvidenceProvenance[];
    colorSamplingProfile:
      readonly EvidenceProvenance[];
    nominalExposureDuration:
      readonly EvidenceProvenance[];
    openingBoundary:
      readonly EvidenceProvenance[];
    closingBoundary:
      readonly EvidenceProvenance[];
  };
}
```
