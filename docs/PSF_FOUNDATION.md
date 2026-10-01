# PSF and Pupil Foundation

Photivra has two complementary PSF layers.

The legacy foundation keeps the ideal **geometric defocus-circle** and **circular Airy first-zero** diagnostics separately named and independently testable. The #113 real-lens framework adds explicitly profiled or pupil-derived **combined primary-optical PSFs** without converting those older diagnostics into a synthetic blur score.

## Legacy diagnostics

Use `getPsfFoundationContract()` and `calculatePsfFoundationComponents()` for the established diagnostics and common field/depth/wavelength/pupil context.

The foundation contract is version `0.2.0`.

Implemented diagnostic contributions:

- geometric defocus circle;
- circular diffraction first-zero diameter.

Implemented framework contributions:

- mechanical pupil clipping / cat-eye PSF shape;
- field curvature;
- field-dependent aberration;
- field-dependent bokeh / signed-defocus response.

Still reserved here:

- non-circular diffraction generation, owned by #1.

The legacy component calculator still returns no combined PSF. That is intentional: a combined PSF is available only when an explicit #113 profile or complex pupil supplies the information needed to justify one.

## Sampled real-lens PSFs

`LensSampledPsfProfile` stores full 2D intensity PSFs on an explicit regular calibration/simulation grid.

Profile axes:

- focal length;
- focus diopters (`0` = #103 optical infinity);
- f-number;
- image-plane field X/Y;
- wavelength;
- signed image-plane defocus.

Every node declares a unit-energy PSF kernel with physical X/Y sample pitch. All nodes in one interpolated profile must share the same kernel grid geometry.

`resolveLensSampledPsf()` reports either:

- `exact-grid-sample`; or
- `interpolated`.

No extrapolation is permitted.

The full 2D kernel preserves image-plane +X right / +Y up orientation, allowing off-axis sagittal/tangential/asymmetric structure instead of forcing radial symmetry.

## Field curvature and longitudinal chromatic focus

Each sampled node carries `bestFocusImagePlaneOffsetMicrometers`.

That quantity may vary with:

- field position — field curvature;
- wavelength — longitudinal/axial chromatic focus;
- focal/aperture/focus configuration.

It is a focus/PSF quantity. It does not modify geometric distortion, lateral CA, or the selected camera focus-control state.

## Complex pupil / wavefront reference

`LensComplexPupilProfile` represents one explicit primary-optical state as:

- relative pupil amplitude; and
- optical-path difference in micrometres.

`calculateLensComplexPupilPsf()` performs deterministic scalar Fraunhofer propagation of that complex pupil.

This path evaluates diffraction and aberration in one pupil calculation. Do not stack another independent Airy or diffraction blur over its output.

The output intensity PSF is normalized to unit energy.

## Pupil clipping and throughput

PSF energy normalization and optical throughput are separate.

A clipped pupil can change:

1. the pupil/PSF shape; and
2. the relative amount of transmitted light.

The #113 profiles therefore keep `relativePupilThroughputFactor` separate from the normalized PSF kernel. The throughput factor belongs in the optical-throughput path (including #110 integration) and must be applied exactly once.

The existing illumination-vignetting primitive remains a separate throughput-only approximation; it does not become pupil clipping automatically.

## MTF boundary

MTF magnitude is useful validation evidence, including sagittal/tangential trends.

It does **not** uniquely determine a PSF without phase.

`assessMtfOnlyPsfRenderability()` therefore always blocks unique PSF reconstruction from magnitude-only MTF data while allowing diagnostic use.

## Sensor and stray-light boundaries

V1 lens PSF profiles are `lens-primary-optical-path-only`.

They exclude:

- sensor OLPF;
- microlens response;
- CFA/spectral sensor response;
- sensor crosstalk;
- sensor sampling;
- RAW reconstruction/demosaic;
- sharpening/denoise;
- ghosting, flare and veiling glare.

A future combined camera-system response must be labeled separately rather than silently stored as a lens PSF.

#114 owns stray light.

## Preview and reference use

The sampled-profile contract can be consumed by both preview and reference paths.

The complex-pupil scalar Fraunhofer evaluator is a deterministic reference calculation. A preview implementation may use a validated approximation, but it must preserve the same profile semantics, field orientation, throughput ownership and limitations.

## No scalar lens quality

Photivra does not produce a universal lens sharpness or bokeh-quality score.

Real optical response remains field-, focus-, aperture-, wavelength-, pupil- and defocus-dependent. Generic equipment tiers may later choose different versioned profiles, but the tier label is not itself an optical algorithm.
