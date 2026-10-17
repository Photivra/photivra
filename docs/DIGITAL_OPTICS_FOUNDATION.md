# Stray light and digital lens correction foundations

> **Release context.** This page was written for package 1.2.0 (root API 1.2.0) and has not been re-reviewed for later releases. The [changelog](../CHANGELOG.md) describes the current release. Model and subsystem version numbers on this page, and any dated records, are separate from the package version. See also the [developer guide](DEVELOPERS.md) and the [1.2.0 release contract](RELEASE_1_2_0.md).

This page covers three groups of standalone, browser-safe primitives (from issues #114, #118 and #117):

- **stray light**: ghosts and veiling glare added to the image-plane irradiance;
- **geometric mapping**: one shared description of digital warps (distortion correction, crop, rotation, stabilisation) and how to resample through it honestly;
- **camera correction profiles**: generic in-camera lens corrections and how they are applied.

None of these turns on a production-plan stage, changes the POC (proof-of-concept simulation API) or supplies a calibrated camera or lens preset.

Versions: these primitives moved the public root API from 0.94.0 to 0.95.0. Each new profile and prepared-map schema is 0.1.0. The package, POC, production-plan and PSF versions did not change.

## Applicability and evidence

**Exact binding.** Each stray-light or correction profile is bound to one exact combination of:

- generic body and lens identity and version;
- focal length, aperture and a finite focus distance;
- still or video mode;
- output dimensions, frame rate and stabilisation mode.

Any mismatch fails. No interpolation or extrapolation is inferred. For stills, `frameRateHz` is zero; for video it is positive. Infinity focus, interpolated zoom or focus states, and crop paths that change over time need future schemas.

**Evidence.** Only generic-parametric evidence is accepted.

- Source records go through the existing `EvidenceProvenance` parser.
- `basis` and `residualNote` must be explicit.
- Parameters can be synthetic approximations written independently. Source metadata does not prove measured accuracy.
- These first parsers do not accept calibrated profiles or invented quantified uncertainty.
- No tier or manufacturer identity determines the coefficients.

## Additive stray-light irradiance

`calculateLensStrayLightIrradiance()` evaluates one instant, one image-plane point and one exact wavelength slice (air or vacuum).

**Coordinates.**

- Source field angles are in degrees, +X right and +Y up. The declared domain is the Euclidean norm of these two angles, not a great-circle angle on a sphere.
- The image plane is in millimetres, measured from the optical axis.
- Sources outside the frame are still inputs, even when their primary images fall outside the active crop.

**Source power.** Each source gives its incident spectral power in W/nm, integrated over the profile's declared reference entrance area. The caller must derive this from the source's illumination and that area. It is not pixel brightness, and it is not W/m².

**Admitted fraction.** `admittedFraction` is an explicit per-source, per-path result saying how much light gets in. A future physical solver for lens hoods and flags may provide it; the engine never infers a global "hood" slider.

**Ghost and veil responses.** Ghosts (reflection images) and veil (veiling glare) have separate identities and outputs.

- Both use Gaussian templates, parameterised independently and normalised over the infinite plane.
- Their centroids are explicit affine functions of the source field angles. Sigma is in mm.
- A response's power fraction is F(0) × (1 + angularSlope × rho²), where rho is the source-angle norm divided by the declared maximum.
- The parser checks that fractions are nonnegative, and checks the total response fraction at both angular ends. Because the sum is affine in rho², checking the ends bounds the whole range.

This bounds the stray paths only. To claim whole-system energy conservation, the caller must budget primary transmission and stray power together.

**Units.** The normalised template density is exp(−distance²/(2 sigma²))/(2π sigma²), in 1/mm². Multiply by 10⁶ to get 1/m². Then:

source power × admitted fraction × response fraction × density = W/m²/nm.

A finite frame never renormalises it. The model does not trace lens surfaces, and does not infer any brand's ghost signature.

**Output.** `totalSpectralIrradianceWPerM2PerNm` is primary + ghost + veil. It is ready for the same downstream spectral, spatial and exposure integration as any other incident light.

- Saturation and sensor noise happen after the addition.
- The integration test uses the existing photon-energy, photoelectron and Poisson/read-noise primitives with declared exposure, area and QE (quantum efficiency). It does not show radiometry readiness for a real device.
- `meterDomain` explicitly chooses primary-only or primary-plus-stray metering.

**Other rules.**

- When disabled, the primary irradiance is returned exactly. Profiles are still validated when disabled.
- Diffraction, primary PSFs and lens contamination are excluded.
- A `sensor-lens-reflections` declaration binds the combined body-and-lens state explicitly.
- One static instant is not an exposure average. Callers must integrate over time and wavelength separately.
- There is no display or cosmetic flare mode.

## One mapping and honest sampling

The idea: every digital warp is described once, in one validated mapping. Every consumer uses that same mapping, and resampling never claims more detail or coverage than the source supports.

**Preparing a mapping.** `prepareGeometricMapping()` stores canonical transforms, a deterministic semantic key and contiguous groups by image domain. It copies the parsed transform data. The returned record can be serialised. It is revalidated and re-prepared when used, so callers cannot get around validation by editing a cached record.

**Transform order and kinds.** Transforms are listed from destination to source.

- **Affine** maps represent breathing, rotation, crop and digital stabilisation with a full matrix and offset.
- **Radial** maps reuse the existing monotonic radial-distortion evaluator. For correction, the ideal destination coordinate maps to the physical, distorted source data.

A declared correction polynomial is independent of the physical optical polynomial. It can deliberately leave some distortion uncorrected. No implicit correction strength or ideal-lens inversion is assumed.

Mapping schema 0.2.0 (2.0) adds two transform kinds; see the [contract review](PHYSICS_FOUNDATION.md#lens-geometry-wiring-contract-review-20):

- `brown-conrady` (purpose `distortion`): like `radial`, the ideal destination coordinate maps to physical distorted source data, here through the validated Brown–Conrady forward map. Its analytic Jacobian enters the composed derivative, and the forward bridge uses the Newton inverse.
- `projection-remap` (purpose `projection`, used by no other kind): the destination point is unprojected with `destinationProjection` and reprojected with `sourceProjection`. Each is an ideal projection model plus a mapping scale. An example is a rectilinear or equirectangular view resampled from a fisheye capture. Its Jacobian is the analytic chain d(source)/d(direction) · d(direction)/d(destination).

A mapping that uses only `affine` and `radial` keeps `schemaVersion` and model version 0.1.0, and gives identical output, semantic key and Jacobians. Lens-correction profiles parse transforms through the same parser, so they can carry the new kinds too.

`calculateGeometricSamplingPlan()` accepts an optional `sourceProjectionModel`. With it, the captured-FOV and retained-ray angles of a fisheye source use that source's mapping function. Omitting it, or passing `"rectilinear"`, keeps `atan(mm / distance)` exactly.

**Domain barriers.** Raw-channel, reconstructed-linear and processed-output data are separate domains, and a pass cannot cross between them. Compatible contiguous transforms can share one resampling pass. Incompatible groups are kept in the prepared mapping, but a fused pixel pass rejects them. Prepared maps are specific to one frame and time, in seconds from the start of exposure. They imply no averaging over a trajectory and no crop guarantee for a whole video.

**Jacobians and reverse mapping.**

- `calculateComposedGeometricMapping()` returns each component's local Jacobian, and the full product d(source mm)/d(destination mm) with its determinant, singular values and anisotropy.
- `calculateForwardGeometricMapping()` reverses the same mapping for focus, meter and overlay coordinates.

No app should reverse-engineer the warp on its own.

**Rasters.** `GeometricRaster` describes pixel centres with square pitch on an optical plane: +X right, +Y up, rows ordered downward. Raster orientation and crop are explicit affine transforms, not an implicit axis swap. The maximum raster is 65,536 samples and the maximum number of composed transforms is 32. This is a bounded foundation, not a megapixel production renderer.

**Sampling plan.** `calculateGeometricSamplingPlan()` computes exact support at every destination pixel centre for the declared nearest or bilinear filter.

- It keeps a validity mask, and finds the largest axis-aligned rectangle of all-valid pixels using one composed map. Ties are broken deterministically by row and stack order.
- Because it uses one composed map, transforms that pull in opposite directions do not use up the crop margin twice.
- These claims apply to this pixel lattice and filter. The mask does not certify continuous support between pixels.
- Each component's intermediate source point and derivative stay available, so you can inspect margins for a specific feature. Intermediate points are not cropped separately.

The plan reports the physical captured edge FOV from the declared physical projection distance and source bounds. Separately, it reports the angular range of the retained, mapped pixel-centre rays. That range is deliberately not a continuous retained edge FOV. Off-centre capture is preserved.

**Prefiltering.** Singular values multiplied by the destination/source pixel pitch show local sampling compression. Any value above one means the source data must be declared as prefiltered. With `antialias=none`, the plan can still be inspected, but it cannot run a compressing resample. The caller owns the prefilter and must supply data suited to the largest footprint. This module does not implement or certify that prefilter. The filter or profile ID stays separate from the mapping identity.

**Resampling.** `calculateGeometricResampling()` performs one nearest or bilinear pass on a scalar image.

- It returns null where support is invalid. It never extends, copies or mirrors edges.
- Pixel centres exactly on the boundary do not need bilinear neighbours that do not exist.
- It warps blur, bokeh and noise that are already in the image. Stretching cannot create optical detail or recompute a better PSF. The full Jacobian explains how blur and sampling density change locally.

## Generic camera correction profiles

**Resolving a plan.** `resolveLensCorrectionPlan()` resolves each component separately, in the profile's application order. For each, it records why it is on or off: toggled or default, mandatory, required by stabilisation, or required by another component.

- Dependencies can refer only to earlier components, so there are no cycles.
- A required component can override a dependent component's requested Off, with an explicit `component-dependency` reason.
- Mandatory camera corrections cannot be turned off through a camera setting. `reference-bypass` is a separately labelled educational comparison.

**Components.** Each component declares its image domain, identity and version, residual limits, availability and dependencies.

- Supported families: geometry, lateral channel registration and scalar peripheral illumination.
- Separate, unsupported families: colour shading, longitudinal chromatic aberration (CA), and diffraction or deconvolution restoration.
- RAW-like output keeps the metadata and intent without applying ("baking") the correction. Processed output bakes in the supported downstream operations.

**Peripheral illumination.** `calculatePeripheralIlluminationCorrection()` uses the existing positive, bounded illumination profile, with gain = throughput^(−strength) and strength in [0,1].

- Signal gain is g and variance gain is g². The variance is explicitly before clipping.
- This does not restore photons, and does not restore the capture's true SNR.
- Clipping is reported.
- The residual gain strength does not change the physical lens throughput.

**Applying corrections.** `calculateLensCorrectedCapture()` is a bounded executor for reconstructed linear RGB.

- The capture carries its camera, lens and acquisition state, which must match the profile binding.
- Capture ID, time and noise-realisation ID are kept. The physical source arrays are not modified.
- Common geometry and per-channel lateral CA are composed in reverse application order, and each channel is sampled once.
- All channel masks are intersected before output, so a missing channel never fakes a valid colour.
- A joint crop is resolved over that intersection. Per-channel sampling and crop diagnostics can also be inspected.

**Order rules.** The executor supports geometry/CA followed by gain.

- It rejects geometry placed after an intervening gain, and rejects raw or processed domains, instead of silently reordering stages. Other consumers must follow the resolved profile order through the production pipeline.
- In this executor, gain is defined on the corrected output coordinates. It does not silently reuse an upstream physical field position.
- RAW-like, metadata-only output keeps the original capture geometry and samples.
- For processed output, Off and reference-bypass disable correction transforms and gains. An explicit destination crop or sampling lattice still applies, through the neutral geometric map. If the source and destination lattices are identical, samples are kept without resampling. If the lattice changes, the usual filter, support, crop and prefilter diagnostics are shown.
- Output dimensions must match the exact profile binding.

This replaced an earlier unmerged draft's unconditional Off passthrough; no released API changed.

## Verification and provenance

Tests independently check:

- Gaussian power integration;
- source linearity and admitted fraction;
- response to off-frame sources;
- use of the sensor and noise primitives;
- exact applicability;
- Jacobians against centred differences;
- inverse/forward round trips;
- all quarter-turn orientations and off-centre capture;
- anisotropy;
- linear-ramp interpolation;
- missing support;
- joint crop;
- prefilter gating;
- channel registration;
- RAW intent;
- mandatory, bypass and dependency resolution;
- residual gain, noise and clipping;
- stretching of an already blurred image.

The implementation, test parameters and equations were written independently. No third-party source code, calibration data, numerical tables or protected prose is included. Factual research:

- [ZEISS, Taking care of the unwanted light](https://lenspire.zeiss.com/cine/en/article/taking-care-of-the-unwanted-light): reflection ghosts and unwanted light motivate treating stray paths separately.
- [Canon EOS R5 Mark II manual, Lens Aberration Correction](https://cam.start.canon/en/C017/manual/html/UG-03_Shooting-1_0220.html): noise from peripheral correction, and crop and resolution limits from distortion correction, motivate reporting downstream costs.
- [Sony ILCE-1M2 guide, Lens Compensation](https://helpguide.sony.net/ilc/2440/v1/en/contents/0414M_lens_comp.html): per-component controls, forced distortion correction, and the angle and quality limits of breathing compensation motivate resolved states and explicit costs.

These references justify the scope and distinctions, not the synthetic coefficients. AI-assisted drafts still need substantive human review of science and provenance, and contributor DCO certification under CONTRIBUTING.md and PROVENANCE.md, before inclusion.
