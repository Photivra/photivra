# optics/psf-foundation.ts public contracts

Package **1.5.0**, root API **1.5.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculatePsfFoundationComponents

Evaluates the currently implemented PSF-related diagnostics in one explicit
field/depth/spectral/pupil context without combining them into a synthetic
PSF or blur radius.

Field position is recorded even though the current defocus-circle and
circular-Airy diagnostics are not field dependent. Future field-dependent
contributions can consume the same context without changing these existing
primitives.

```ts
export function calculatePsfFoundationComponents(
  input: CalculatePsfFoundationComponentsInput
): CalculationResult<PsfFoundationComponents>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculatePsfFoundationComponentsInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CalculatePsfFoundationComponentsInput {
  focalLengthMm: number;
  aperture: number;
  focusDistanceM: number;
  subjectDistanceM: number;
  /**
   * Image-plane field position relative to the optical axis, in millimetres.
   * +X is right and +Y is up.
   */
  fieldPointMm: LensFieldPointMm;
  /**
   * Physical image-plane radius used only to normalize field position for
   * cross-case diagnostics. It is not a lens calibration or validity bound.
   */
  fieldNormalizationRadiusMm: number;
  spectralBasis: {
    kind: "monochromatic";
    wavelengthNm: number;
  };
}
```

## getPsfFoundationContract

Returns the public PSF/pupil foundation contract.

The contract describes current diagnostics plus reserved future contribution
ownership. It does not imply that reserved contributions are implemented.

```ts
export function getPsfFoundationContract(): PsfFoundationContract;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## PSF_FOUNDATION_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
PSF_FOUNDATION_VERSION = "0.3.0" as const
```

## PsfContributionContract

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface PsfContributionContract {
  id: PsfContributionId;
  status: PsfContributionStatus;
  dependsOn: readonly (
    | "field-position"
    | "focus-depth"
    | "pupil"
    | "wavelength"
  )[];
  note: string;
}
```

## PsfContributionId

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type PsfContributionId =
  | "geometric-defocus-circle"
  | "circular-diffraction-first-zero"
  | "non-circular-diffraction"
  | "mechanical-pupil-clipping"
  | "field-curvature"
  | "field-dependent-aberration"
  | "field-dependent-bokeh";
```

## PsfContributionStatus

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type PsfContributionStatus =
  | "implemented-diagnostic"
  | "implemented-framework"
  | "reserved-contract";
```

## PsfFoundationComponents

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface PsfFoundationComponents {
  context: {
    field: {
      imagePointMm: LensFieldPointMm;
      radiusMm: number;
      normalizationRadiusMm: number;
      normalizedRadius: number;
    };
    depth: {
      focusDistanceM: number;
      subjectDistanceM: number;
    };
    spectralBasis: {
      kind: "monochromatic";
      wavelengthNm: number;
    };
    pupil: {
      kind: "ideal-circular-f-number-derived";
      apertureFNumber: number;
      diameterMm: number;
    };
  };
  contributions: {
    geometricDefocus: {
      id: "geometric-defocus-circle";
      diameterMm: number;
      provenance: CalculationProvenance;
    };
    circularDiffraction: {
      id: "circular-diffraction-first-zero";
      firstZeroDiameterMicrometers: number;
      provenance: CalculationProvenance;
    };
  };
  composition: {
    status: "not-composed";
    note: string;
  };
}
```

## PsfFoundationContract

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface PsfFoundationContract {
  version: typeof PSF_FOUNDATION_VERSION;
  coordinateSpace: "image-plane-metric";
  fieldAxes: "+X right, +Y up";
  compositionPolicy:
    "separate-diagnostics-plus-explicit-profiled-combined-psf";
  contributions: readonly PsfContributionContract[];
  previewReferencePolicy: {
    previewMayApproximate: true;
    referenceMayUseHigherFidelity: true;
    mustPreserveContributionSemantics: true;
  };
  notes: readonly string[];
}
```
