# optics/lens-psf-profile.ts public contracts

Package **1.3.0**, root API **1.3.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## assessMtfOnlyPsfRenderability

Explain why MTF-only evidence cannot determine a unique renderable PSF; return blockers instead of
fabricating phase information.

Sampled lens PSF shapes bind exact generic optical state, field, wavelength and signed defocus
support. Interpolation stays within declared applicability and preserves normalized shape separately
from throughput. MTF-only data lacks phase/spatial information and does not authorize rendering a
unique PSF.

```ts
export function assessMtfOnlyPsfRenderability(
  profile:
    LensMtfDiagnosticProfile
): MtfOnlyPsfRenderabilityAssessment;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## LENS_MTF_DIAGNOSTIC_PROFILE_SCHEMA_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
LENS_MTF_DIAGNOSTIC_PROFILE_SCHEMA_VERSION =
  "0.1.0" as const
```

## LENS_SAMPLED_PSF_PROFILE_SCHEMA_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
LENS_SAMPLED_PSF_PROFILE_SCHEMA_VERSION =
  "0.1.0" as const
```

## LensMtfDiagnosticProfile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface LensMtfDiagnosticProfile {
  schemaVersion:
    typeof LENS_MTF_DIAGNOSTIC_PROFILE_SCHEMA_VERSION;
  profileId: string;
  profileVersion: string;
  opticalDomain:
    "lens-primary-optical-path-only";
  phaseInformationAvailable:
    false;
  magnitudeMeaning:
    "mtf-magnitude-only";
  fieldPointMm: {
    x: number;
    y: number;
  };
  focalLengthMm: number;
  focus: FocusPlane;
  apertureFNumber: number;
  wavelengthNm: number | null;
  samples:
    readonly LensMtfDiagnosticSample[];
  evidence:
    readonly EvidenceProvenance[];
  limitations: readonly string[];
}
```

## LensMtfDiagnosticSample

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface LensMtfDiagnosticSample {
  spatialFrequencyCyclesPerMm:
    number;
  sagittalMagnitude: number;
  tangentialMagnitude: number;
}
```

## LensPsfGridAxes

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface LensPsfGridAxes {
  focalLengthMm:
    readonly number[];
  focusDiopters:
    readonly number[];
  apertureFNumber:
    readonly number[];
  fieldXmm:
    readonly number[];
  fieldYmm:
    readonly number[];
  wavelengthNm:
    readonly number[];
  signedDefocusImagePlaneMicrometers:
    readonly number[];
}
```

## LensPsfKernel

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface LensPsfKernel {
  widthSamples: number;
  heightSamples: number;
  samplePitchMicrometersX: number;
  samplePitchMicrometersY: number;
  centerSampleX: number;
  centerSampleY: number;
  normalizedIntensity:
    readonly number[];
}
```

## LensPsfScientificStatus

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type LensPsfScientificStatus =
  | "calibrated"
  | "approximation";
```

## LensPsfUncertainty

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type LensPsfUncertainty =
  | {
      kind: "relative";
      fraction: number;
      basis: string;
    }
  | {
      kind: "not-quantified";
      limitation: string;
    };
```

## LensSampledPsfGridCoordinate

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface LensSampledPsfGridCoordinate {
  focalLengthMm: number;
  focusDiopters: number;
  apertureFNumber: number;
  fieldXmm: number;
  fieldYmm: number;
  wavelengthNm: number;
  signedDefocusImagePlaneMicrometers:
    number;
}
```

## LensSampledPsfGridNode

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface LensSampledPsfGridNode {
  nodeId: string;
  coordinate:
    LensSampledPsfGridCoordinate;
  kernel: LensPsfKernel;
  bestFocusImagePlaneOffsetMicrometers:
    number;
  relativePupilThroughputFactor:
    number;
  evidence:
    readonly EvidenceProvenance[];
  uncertainty:
    LensPsfUncertainty;
}
```

## LensSampledPsfProfile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface LensSampledPsfProfile {
  schemaVersion:
    typeof LENS_SAMPLED_PSF_PROFILE_SCHEMA_VERSION;
  profileId: string;
  profileVersion: string;
  scientificStatus:
    LensPsfScientificStatus;
  opticalDomain:
    "lens-primary-optical-path-only";
  coordinateSystem:
    "image-plane-metric";
  fieldAxes:
    "+X right, +Y up";
  kernelEnergyNormalization:
    "unit-energy-shape";
  interpolation:
    "bounded-regular-grid-multilinear";
  throughputOwnership:
    "separate-relative-pupil-throughput-factor";
  responseIncludes: {
    diffraction: boolean;
    aberration: boolean;
    defocus: boolean;
    pupilClippingShape:
      boolean;
  };
  sensorOpticalStackIncluded:
    false;
  sensorSamplingIncluded:
    false;
  reconstructionIncluded:
    false;
  strayLightIncluded: false;
  axes: LensPsfGridAxes;
  nodes:
    readonly LensSampledPsfGridNode[];
  evidence:
    readonly EvidenceProvenance[];
  limitations: readonly string[];
}
```

## MtfOnlyPsfRenderabilityAssessment

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface MtfOnlyPsfRenderabilityAssessment {
  profileId: string;
  psfReconstructionAuthorized:
    false;
  reason:
    "mtf-magnitude-lacks-phase-and-does-not-uniquely-determine-psf";
  diagnosticUseAuthorized: true;
}
```

## parseLensMtfDiagnosticProfile

Validate an untrusted declaration and return the normalized typed contract. Unknown enum values,
missing required fields and incompatible scientific data fail at this boundary.

Sampled lens PSF shapes bind exact generic optical state, field, wavelength and signed defocus
support. Interpolation stays within declared applicability and preserves normalized shape separately
from throughput. MTF-only data lacks phase/spatial information and does not authorize rendering a
unique PSF.

```ts
export function parseLensMtfDiagnosticProfile(
  value: unknown
): LensMtfDiagnosticProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## parseLensSampledPsfProfile

Validate an untrusted declaration and return the normalized typed contract. Unknown enum values,
missing required fields and incompatible scientific data fail at this boundary.

Sampled lens PSF shapes bind exact generic optical state, field, wavelength and signed defocus
support. Interpolation stays within declared applicability and preserves normalized shape separately
from throughput. MTF-only data lacks phase/spatial information and does not authorize rendering a
unique PSF.

```ts
export function parseLensSampledPsfProfile(
  value: unknown
): LensSampledPsfProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ResolvedLensSampledPsf

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolvedLensSampledPsf {
  profileId: string;
  profileVersion: string;
  scientificStatus:
    LensPsfScientificStatus;
  resolutionStatus:
    | "exact-grid-sample"
    | "interpolated";
  coordinate:
    LensSampledPsfGridCoordinate;
  focus: FocusPlane;
  kernel: LensPsfKernel;
  bestFocusImagePlaneOffsetMicrometers:
    number;
  relativePupilThroughputFactor:
    number;
  sourceNodes:
    readonly {
      nodeId: string;
      weight: number;
      evidence:
        readonly EvidenceProvenance[];
      uncertainty:
        LensPsfUncertainty;
    }[];
  responseIncludes:
    LensSampledPsfProfile["responseIncludes"];
  throughputOwnership:
    "separate-relative-pupil-throughput-factor";
  longitudinalChromaticFocusMayVaryWithWavelength:
    true;
  fieldCurvatureMayVaryWithFieldPosition:
    true;
  geometricDistortionModified:
    false;
  lateralChromaticPositionShiftApplied:
    false;
  sensorOpticalStackIncluded:
    false;
  sensorSamplingIncluded: false;
  reconstructionIncluded: false;
  strayLightIncluded: false;
  scalarSharpnessScoreProduced:
    false;
}
```

## resolveLensSampledPsf

Resolve the bounded sampled PSF for a declared optical state and support point without extrapolation
or silently inventing missing dimensions.

Sampled lens PSF shapes bind exact generic optical state, field, wavelength and signed defocus
support. Interpolation stays within declared applicability and preserves normalized shape separately
from throughput. MTF-only data lacks phase/spatial information and does not authorize rendering a
unique PSF.

```ts
export function resolveLensSampledPsf(
  input:
    ResolveLensSampledPsfInput
): CalculationResult<ResolvedLensSampledPsf>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ResolveLensSampledPsfInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolveLensSampledPsfInput {
  profile:
    LensSampledPsfProfile;
  focalLengthMm: number;
  focus: FocusPlane;
  apertureFNumber: number;
  fieldPointMm: {
    x: number;
    y: number;
  };
  wavelengthNm: number;
  signedDefocusImagePlaneMicrometers:
    number;
}
```
