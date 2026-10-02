# sensor/raw-reconstruction.ts public contracts

Package **1.0.1**, root API **1.0.1**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## createSensorRawCaptureSample

Commit one validated native RAW sample with exact site/channel/event identity for declared
reconstruction.

Reconstruction consumes explicitly bound native post-ADC samples and declared normalized channel
kernels. Native CFA phase is absolute and orientation/crop remain downstream. This structural linear
reconstruction does not infer spectral sensor primaries, calibrated color or a complete arbitrary
demosaic algorithm.

```ts
export function createSensorRawCaptureSample(
  input:
    CreateSensorRawCaptureSampleInput
): SensorRawCaptureSample;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CreateSensorRawCaptureSampleInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CreateSensorRawCaptureSampleInput {
  rawCode:
    SensorRawCodeSample;
  contributors:
    ResolvedCaptureModeColorSamplingContributors;
}
```

## parseSensorRawReconstructionProfile

Validate an untrusted declaration and return the normalized typed contract. Unknown enum values,
missing required fields and incompatible scientific data fail at this boundary.

Reconstruction consumes explicitly bound native post-ADC samples and declared normalized channel
kernels. Native CFA phase is absolute and orientation/crop remain downstream. This structural linear
reconstruction does not infer spectral sensor primaries, calibrated color or a complete arbitrary
demosaic algorithm.

```ts
export function parseSensorRawReconstructionProfile(
  value: unknown
): SensorRawReconstructionProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## resolveSensorRawReconstruction

Gather exactly supplied native channel contributions through explicit normalized kernels while
preserving CFA identity and signed black-subtracted values.

Reconstruction consumes explicitly bound native post-ADC samples and declared normalized channel
kernels. Native CFA phase is absolute and orientation/crop remain downstream. This structural linear
reconstruction does not infer spectral sensor primaries, calibrated color or a complete arbitrary
demosaic algorithm.

```ts
export function resolveSensorRawReconstruction(
  input:
    ResolveSensorRawReconstructionInput
): CalculationResult<SensorRawReconstructedPixel>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ResolveSensorRawReconstructionInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolveSensorRawReconstructionInput {
  profile:
    SensorRawReconstructionProfile;
  colorSamplingProfile:
    SensorColorSamplingProfile;
  centerSite: {
    x: number;
    y: number;
  };
  samples:
    readonly SensorRawCaptureSample[];
}
```

## SENSOR_RAW_CAPTURE_SAMPLE_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
SENSOR_RAW_CAPTURE_SAMPLE_VERSION =
  "0.1.0" as const
```

## SENSOR_RAW_RECONSTRUCTION_PROFILE_SCHEMA_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
SENSOR_RAW_RECONSTRUCTION_PROFILE_SCHEMA_VERSION =
  "0.1.0" as const
```

## SensorRawCaptureSample

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorRawCaptureSample {
  version:
    typeof SENSOR_RAW_CAPTURE_SAMPLE_VERSION;
  captureModeId: string;
  modeSampleCoordinateSystem:
    "capture-mode-full-frame-effective-sample-index";
  modeSampleIndexFullFrame: {
    x: number;
    y: number;
  };
  colorSamplingProfileId: string;
  colorSamplingSite: {
    x: number;
    y: number;
  };
  channelId: string;
  rawCode: number;
  blackLevelCode: number;
  digitalSaturationCode: number;
  blackSubtractedNormalizedCode:
    number;
  readoutProfileId: string;
  readoutRegimeId: string;
  sourceChargeSeedUint32: number;
  sourceReadNoiseSeedUint32: number;
  physicalScalarSaturationApplied:
    boolean;
  digitalSaturationApplied:
    boolean;
  cfaPhasePreservedInNativeCoordinates:
    true;
  physicalOrientationApplied:
    false;
  outputRotationApplied:
    false;
  groupedModeCombinationApplied:
    false;
  reconstructionApplied: false;
  aliasingModeled: false;
  moireModeled: false;
}
```

## SensorRawReconstructedPixel

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorRawReconstructedPixel {
  reconstructionProfileId:
    string;
  reconstructionProfileVersion:
    string;
  captureModeId: string;
  colorSamplingProfileId: string;
  centerSite: {
    x: number;
    y: number;
  };
  outputChannels:
    readonly {
      channelId: string;
      linearBlackSubtractedNormalizedValue:
        number;
      sourceContributions:
        readonly {
          site: {
            x: number;
            y: number;
          };
          sourceChannelId: string;
          weight: number;
          sourceValue: number;
        }[];
    }[];
  method:
    "explicit-linear-native-neighborhood";
  cfaAware: true;
  captureModeAware: true;
  physicalOrientationApplied:
    false;
  outputRotationApplied: false;
  sharpeningApplied: false;
  denoisingApplied: false;
  aliasingModeled: false;
  moireModeled: false;
  preSamplingOpticalTransferAdequacyEstablished:
    false;
  reconstructionDoesNotModifyRawSamples:
    true;
}
```

## SensorRawReconstructionChannelKernel

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorRawReconstructionChannelKernel {
  outputChannelId: string;
  contributions:
    readonly SensorRawReconstructionKernelContribution[];
}
```

## SensorRawReconstructionKernelContribution

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorRawReconstructionKernelContribution {
  offsetX: number;
  offsetY: number;
  sourceChannelId: string;
  weight: number;
}
```

## SensorRawReconstructionProfile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorRawReconstructionProfile {
  schemaVersion:
    typeof SENSOR_RAW_RECONSTRUCTION_PROFILE_SCHEMA_VERSION;
  profileId: string;
  profileVersion: string;
  captureModeId: string;
  colorSamplingProfileId: string;
  scientificStatus:
    SensorSpectralResponseScientificStatus;
  method:
    "explicit-linear-native-neighborhood";
  normalization:
    "weights-sum-to-one-per-output-channel";
  negativeBlackSubtractedValuesAllowed:
    true;
  kernels:
    readonly SensorRawReconstructionChannelKernel[];
  evidence:
    readonly EvidenceProvenance[];
  limitations: readonly string[];
}
```
