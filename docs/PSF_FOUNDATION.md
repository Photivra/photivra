# PSF and Pupil Foundation

Release context: **package 1.1.0 candidate / root API 1.1.0**. Subsystem/model versions and dated introduction or measurement records below are independent historical identities; they are not distribution versions. See [developer navigation](DEVELOPERS.md) and [release contract](RELEASE_1_1_0.md).

Photivra has two complementary PSF layers.

The legacy foundation keeps the ideal **geometric defocus-circle** and **circular Airy first-zero** diagnostics separately named and independently testable. The #113 real-lens framework adds explicitly profiled or pupil-derived **combined primary-optical PSFs** without converting those older diagnostics into a synthetic blur score.

## Legacy diagnostics

Use `getPsfFoundationContract()` and `calculatePsfFoundationComponents()` for the established diagnostics and common field/depth/wavelength/pupil context.

The foundation contract is version `0.3.0`.

Implemented diagnostic contributions:

- geometric defocus circle;
- circular diffraction first-zero diameter.

Implemented framework contributions:

- ideal regular-polygon diffraction density (on-axis, in focus);
- mechanical pupil clipping / cat-eye PSF shape;
- field curvature;
- field-dependent aberration;
- field-dependent bokeh / signed-defocus response.

Arbitrary curved-blade, off-axis and clipped-pupil diffraction is not inferred by the ideal polygon API.

The legacy component calculator still returns no combined PSF. That is intentional: a combined PSF is available only when an explicit #113 profile or complex pupil supplies the information needed to justify one.

## Ideal polygon diffraction

`calculateIdealPolygonDiffractionPsf()` reuses the regular-polygon geometry and image-plane conventions, but evaluates its continuous Fourier transform analytically rather than rasterizing the pupil into the bounded #113 DFT grid. This avoids a second sampled approximation of the same ideal aperture; #113 still owns arbitrary complex sampled pupils and aberration phase.

Inputs are explicit: equal-area physical pupil diameter, pupil-to-image propagation distance, wavelength and resolved air/vacuum basis, blade count/orientation, and image-plane displacements in micrometres (+X right, +Y up). A nonzero displacement is a location within the **on-axis PSF**, not an off-axis source field position. There is no implicit wavelength conversion or focus-to-propagation-distance conversion.

For unit-circumradius area `A_unit = n sin(2π/n)/2`, the physical radius is `sqrt(A/A_unit)`, with `A = π(D_equal_area/2)²`. This fixes equal area, not equal circumradius/inradius. Under a declared nominal-area convention, a caller may use `D_equal_area = f/N`; that convention is not an inferred real-lens pupil calibration.

For dimensionless pupil coordinates `u`, the independently derived boundary integral follows the divergence theorem:

`F(q) = i/|q|² Σ_edges (qx Δy − qy Δx) exp(−i q·midpoint) sinc(q·edge/2)`.

The phase coordinate is `q = 2π R x/(λ L)`. The center uses the exact area limit. Subtracting each edge's constant term (which sums to zero on a closed contour), a cancellation-safe sinc-minus-one series and `cos(t)−1 = −2 sin²(t/2)` keep near-origin evaluation stable. There is no FFT, pupil rasterization or hidden pupil-grid convergence parameter.

Output gives both `|F/A_unit|²` (unity at center) and continuous intensity density `A |F/A_unit|²/(λ L)²`, converted from 1/mm² to **1/µm²**. Parseval's identity gives unit integral over the infinite image plane. Neither the density nor the peak-normalized intensity is a discrete probability weight. A finite point list is **not** renormalized to sum to one. Renderer quadrature must multiply density by image-plane area, measure support truncation and convergence, and explicitly own any finite-kernel normalization. Throughput stays separate.

Bounds: 3–1024 blades, 1–4096 image points per request, finite positive scales and dimensionless phase radius at most `1e6` (a computational envelope, not a calibrated accuracy claim). Unsupported fields, including aberration/clipping/field inputs, fail closed. Uniform unit amplitude and zero phase are fixed ideal-model assumptions; there is no defocus, curved-blade, field, polarization, sensor, stray-light or polychromatic claim. No quantified physical uncertainty is asserted.

Validation independently checks square sinc-squared response (absolute tolerance `5e-13`), rotated odd/even apertures, direct triangular-pupil quadrature refinement, the equal-area many-blade circular limit (absolute intensity tolerance `1e-7` at the tested points), and finite-support energy integration/refinement. Those tolerances describe test evidence, not universal real-lens accuracy bounds.

Mathematical reference: [Sillitto, Fraunhofer diffraction at straight-edged apertures (1979)](https://doi.org/10.1364/JOSA.69.000765), whose abstract establishes analytical polygon Fourier methods. The implementation and tests are independently authored from Fourier integration, the divergence theorem and Parseval's identity; no third-party implementation, tabulated data or protected exposition is incorporated. AI-assisted draft work still requires substantive human provenance/science review under `PROVENANCE.md` and DCO certification before inclusion.

The circular Airy diagnostic remains separate and unchanged. Do not convolve this diffraction PSF over a #113 kernel that already includes diffraction. This standalone API does not enable an uncomposed production-plan stage or change the POC.

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
