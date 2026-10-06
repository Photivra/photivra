# optics/polygon-diffraction.ts public contracts

Package **1.5.0**, root API **1.5.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## CalculateIdealPolygonDiffractionInput

On-axis, in-focus scalar diffraction of one ideal regular polygon pupil.

```ts
export interface CalculateIdealPolygonDiffractionInput extends CalculateIdealApertureInput {
  /** Diameter of a circle with the SAME AREA as the physical polygon opening. */
  equivalentAreaPupilDiameterMm: number;
  /** Paraxial pupil-to-image propagation scale; not silently inferred from focus. */
  pupilToImageDistanceMm: number;
  /** Wavelength in the declared propagation medium; no air/vacuum conversion. */
  wavelengthNm: number;
  wavelengthBasis: Exclude<SpectralWavelengthBasis, "unspecified">;
  /** Displacements from the on-axis PSF center, +X right / +Y up; at most 4096. */
  imagePointsMicrometers: readonly { x: number; y: number }[];
}
```

## calculateIdealPolygonDiffractionPsf

Calculates continuous monochromatic Fraunhofer PSF density for a uniformly
illuminated, zero-phase, on-axis ideal straight-edged regular polygon.
Physical area is explicit; f/N may supply the equal-area diameter only under
a declared nominal-area convention. No phase aberration, clipping, field
dependence, curved blades, defocus or polychromatic behavior is inferred.

Density = A |F/A|² / (lambda * propagationDistance)². Parseval normalization
is over the infinite plane, NOT over the supplied point list. Downstream
quadrature must preserve density × area and report truncation/convergence.

```ts
export function calculateIdealPolygonDiffractionPsf(
  input: CalculateIdealPolygonDiffractionInput
): CalculationResult<IdealPolygonDiffraction>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## IdealPolygonDiffraction

Continuous unit-energy PSF samples, not a normalized finite convolution kernel.

```ts
export interface IdealPolygonDiffraction {
  bladeCount: number;
  firstBladeEdgeAngleDegrees: number;
  pupilToImageDistanceMm: number;
  wavelengthNm: number;
  wavelengthBasis: Exclude<SpectralWavelengthBasis, "unspecified">;
  pupilAreaSquareMm: number;
  pupilCircumradiusMm: number;
  pupilNormalization: "equal-area-circle";
  fieldAxes: "+X right, +Y up";
  energyNormalization: "unit-integral-over-infinite-image-plane";
  throughputApplied: false;
  samples: readonly {
    imagePointMicrometers: { x: number; y: number };
    /** |F/A|²; unity at the origin. Not an energy/probability weight. */
    peakNormalizedIntensity: number;
    /** Density integrating to unity over the full image plane, in 1/µm². */
    intensityDensityPerSquareMicrometer: number;
  }[];
}
```
