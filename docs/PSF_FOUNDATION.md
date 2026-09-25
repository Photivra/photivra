# PSF and Pupil Foundation

Photivra's PSF/pupil foundation keeps optical blur contributions **separate and explicitly contextualized** until a defensible composition model exists.

Use:

```ts
import {
  calculatePsfFoundationComponents,
  getPsfFoundationContract
} from "@photivra/engine";

const contract = getPsfFoundationContract();

const components = calculatePsfFoundationComponents({
  focalLengthMm: 85,
  aperture: 2.8,
  focusDistanceM: 10,
  subjectDistanceM: 20,
  fieldPointMm: { x: 12, y: 8 },
  fieldNormalizationRadiusMm: 21.6,
  spectralBasis: {
    kind: "monochromatic",
    wavelengthNm: 550
  }
});
```

## What is implemented

The current foundation evaluates two existing diagnostics in one explicit context:

- **geometric defocus circle** — the existing thin-lens defocus-circle diameter;
- **circular diffraction first-zero diameter** — the existing ideal circular-pupil Airy diagnostic.

Each contribution retains the provenance of its underlying primitive.

The foundation records:

- physical image-plane field position;
- normalized field radius for comparison;
- focus and subject depth;
- monochromatic wavelength basis;
- ideal circular f-number-derived pupil diameter.

## What is deliberately not calculated

The foundation does **not** currently calculate:

- a combined PSF;
- a convolution kernel;
- MTF;
- one combined blur diameter;
- a lens-sharpness score.

Defocus and diffraction are independent diagnostics. A future combined PSF must document the mathematical composition method and assumptions rather than adding their diameters or scores ad hoc.

## Reserved contributions

The public contract reserves ownership for:

- non-circular diffraction;
- mechanical/pupil clipping;
- field curvature;
- field-dependent aberration/PSF structure;
- field-dependent bokeh.

A reserved contribution is not an implemented capability.

## Field position

Field position uses physical image-plane coordinates:

- optical axis at the origin;
- +X right;
- +Y up;
- millimetres.

`fieldNormalizationRadiusMm` exists only to make center/mid/edge/corner comparisons reproducible. It is not a real-lens calibration or model-validity limit by itself.

The current defocus and circular Airy diagnostics are field invariant. Recording field position now gives future field-dependent contributions a stable context without changing those existing calculations.

## Spectral basis

The current foundation accepts an explicit monochromatic wavelength because the circular Airy diagnostic is wavelength dependent.

This does not create:

- a spectral lens model;
- longitudinal chromatic aberration;
- sensor spectral response;
- CFA/color calibration.

Future wavelength-dependent PSFs must declare their basis explicitly.

## Pupil boundary

The current context records an ideal circular, f-number-derived pupil diameter because the existing defocus/Airy diagnostics use circular-pupil assumptions.

Polygon aperture geometry is not automatically a non-circular diffraction PSF.

Mechanical/pupil vignetting is also separate from illumination vignetting:

- illumination vignetting changes throughput only;
- pupil clipping can change throughput **and** PSF/bokeh shape.

## Preview and reference fidelity

Browser preview and higher-fidelity reference implementations may use different numerical approximations or sampling budgets.

They must preserve the same:

- contribution identities;
- field/depth/spectral context;
- pupil semantics;
- engine-owned parameters;
- scientific limitations.

A preview approximation must not redefine the science merely because it is cheaper to render.

## Test Fixture relationship

Test Fixture v0.3 provides deterministic center/mid/edge/corner detail and point-highlight targets for integration regression.

It does not establish:

- calibrated MTF;
- a measured real-lens PSF;
- spectral lens behavior;
- calibrated mechanical vignetting;
- named-lens performance.

Engine analytical/reference tests remain the scientific source of truth.
