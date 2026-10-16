# optics/polygon-diffraction.ts public contracts

The package and root API versions are recorded once in [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

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

## calculatePolygonPupilFraunhoferPsf

Continuous monochromatic Fraunhofer PSF density for a uniformly illuminated, zero-phase,
arbitrary simple polygon pupil (for example a mechanically vignetted cat's-eye pupil). Uses the
same analytic divergence-theorem boundary integral as the regular-polygon model, so there is no
pupil-grid aliasing. A pupil offset from the axis only adds a linear phase and leaves the
intensity unchanged. Density = A |F/A|² / (lambda z)², with unit integral over the infinite plane.

```ts
export function calculatePolygonPupilFraunhoferPsf(
  input: CalculatePolygonPupilFraunhoferPsfInput
): CalculationResult<PolygonPupilFraunhoferPsf>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculatePolygonPupilFraunhoferPsfInput

On-axis scalar Fraunhofer diffraction of one arbitrary simple polygon pupil.

```ts
export interface CalculatePolygonPupilFraunhoferPsfInput {
  /**
   * Simple (non-self-intersecting) pupil polygon in pupil-plane millimetres, +X right / +Y up,
   * 3 through 4096 vertices; for example the cat's-eye pupil from calculateMechanicalVignetting().
   */
  pupilVerticesMm: readonly { x: number; y: number }[];
  /** Paraxial pupil-to-image propagation scale; not silently inferred from focus. */
  pupilToImageDistanceMm: number;
  /** Wavelength in the declared propagation medium; no air/vacuum conversion. */
  wavelengthNm: number;
  wavelengthBasis: Exclude<SpectralWavelengthBasis, "unspecified">;
  /** Displacements from the PSF centre (the geometric image point), +X right / +Y up; at most 4096. */
  imagePointsMicrometers: readonly { x: number; y: number }[];
}
```

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

## PolygonPupilFraunhoferPsf

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface PolygonPupilFraunhoferPsf {
  pupilAreaSquareMm: number;
  pupilToImageDistanceMm: number;
  wavelengthNm: number;
  wavelengthBasis: Exclude<SpectralWavelengthBasis, "unspecified">;
  fieldAxes: "+X right, +Y up";
  energyNormalization: "unit-integral-over-infinite-image-plane";
  throughputApplied: false;
  samples: readonly {
    imagePointMicrometers: { x: number; y: number };
    /** |F/A|²; unity at the origin. */
    peakNormalizedIntensity: number;
    /** Density integrating to unity over the full image plane, in 1/µm². */
    intensityDensityPerSquareMicrometer: number;
  }[];
}
```
