# Stray light and digital lens correction foundations

Issues #114, #118 and #117 add standalone browser-safe primitives. They do not enable a production-plan stage, change the POC, or supply a calibrated camera/lens preset. The public root API advances from 0.93.0 to 0.94.0; each new profile/prepared-map schema is 0.1.0. Package, POC, production-plan and PSF versions are unchanged. This branch starts from main independently of pending polygon-diffraction PR #157. Resolve the root API version against the final merged sequence before merging both branches.

## Applicability and evidence

Stray-light and correction profiles bind an exact generic body/lens identity/version, focal length, aperture, finite focus distance, still/video mode, output dimensions, frame rate and stabilization mode. A mismatch fails; no interpolation or extrapolation is inferred. Still frameRateHz is zero; video is positive. Infinity focus, interpolated zoom/focus states and temporal crop trajectories require future schemas.

Only generic-parametric evidence is accepted. Its source records use the existing EvidenceProvenance parser, and its basis and residualNote must be explicit. Parameters can be independently authored synthetic approximations; source metadata does not establish measured accuracy. Calibrated profiles and invented quantified uncertainty are not accepted by these first parsers. No tier or manufacturer identity determines coefficients.

## Additive stray-light irradiance

calculateLensStrayLightIrradiance() evaluates one instant, image-plane point and exact air/vacuum wavelength slice. Source field angles use +X right, +Y up, in degrees; the declared domain is the Euclidean norm of these two field-angle coordinates, not a spherical great-circle angle. The image plane uses millimetres about the optical axis. Off-frame sources remain inputs even when their primary images lie outside the active crop.

Each source provides incident spectral power in W/nm integrated over the profile's declared reference entrance area. The caller must derive this power from source illumination and that area; it is neither pixel brightness nor W/m². admittedFraction is an explicit per-source/path admission result. A future physical hood/flag solver may provide it, but a global hood slider is not inferred.

Ghost and veil responses have separate identities and outputs. Both use independently parameterized, infinite-plane normalized Gaussian templates. Centroids are explicit affine responses to source field angles; sigma is in mm. A response's power fraction is F(0) × (1 + angularSlope × rho²), with rho equal to source coordinate norm divided by the declared maximum. Nonnegative fractions and total response fractions at both angular endpoints are validated. Since their sum is affine in rho², this bounds the whole envelope. This bounds stray paths only; the caller must budget primary transmission and stray power together when asserting whole-system energy conservation.

The normalized template density is exp(−distance²/(2 sigma²))/(2π sigma²), in 1/mm². Multiplying by 10⁶ converts to 1/m². Source power times admitted fraction times response fraction times this density gives W/m²/nm. A finite frame never renormalizes it. This does not trace lens surfaces or infer a branded ghost signature.

The returned totalSpectralIrradianceWPerM2PerNm is primary plus ghost plus veil, ready for the same downstream spectral/spatial/exposure integration as other incident light. Saturation and sensor noise occur after addition. The integration test uses the existing photon-energy, photoelectron and Poisson/read-noise primitives with declared exposure/area/QE; it does not establish radiometry-readiness for a real device. meterDomain explicitly selects primary-only or primary-plus-stray.

Disabled evaluation preserves the primary irradiance exactly. Profiles remain validated even when disabled. Diffraction, primary PSFs and contamination are excluded. A sensor-lens-reflections declaration binds the combined body/lens state explicitly. One static instant does not approximate an exposure average: callers must evaluate time and wavelength quadrature separately. No display/cosmetic flare mode is supplied.

## One mapping and honest sampling

prepareGeometricMapping() stores canonical transforms, a deterministic semantic key and contiguous image-domain groups. It clones parsed transform data. The returned record is serializable and is revalidated/reprepared on consumption, so callers cannot bypass validation by mutating a cache record.

Transforms are listed in destination-to-source order. Affine maps represent breathing, rotation, crop and digital stabilization with a full matrix and offset. Radial maps reuse the existing monotonic radial-distortion evaluator; for correction the destination ideal coordinate maps to physical distorted source data. A declared correction polynomial is independent from a physical optical polynomial and can intentionally leave residual distortion. No implicit correction strength or ideal-lens inversion is assumed.

Raw-channel, reconstructed-linear and processed-output domains are barriers. Compatible contiguous transforms can share a resampling pass; incompatible groups are retained by the prepared mapping but a fused pixel pass rejects them. Prepared maps are frame/time specific in seconds from exposure start; no trajectory averaging or full-video crop guarantee is implied.

calculateComposedGeometricMapping() emits each component's local Jacobian and the full product d(source mm)/d(destination mm), determinant, singular values and anisotropy. calculateForwardGeometricMapping() reverses the same authoritative mapping for focus, meter and overlay coordinates. No app should independently reverse-engineer the warp.

GeometricRaster describes square-pitch pixel centers on an optical plane: +X right, +Y up, row order down. Raster orientation/crop is an explicit affine transform rather than an implicit axis swap. The maximum raster is 65,536 samples, maximum composed transform count 32. This is a bounded foundation, not a megapixel production renderer.

calculateGeometricSamplingPlan() builds exact support at every destination pixel center for the declared nearest/bilinear filter. It preserves a mask and finds the largest all-valid axis-aligned pixel rectangle using one composed map, with deterministic row/stack tie-breaking. Opposing transforms therefore do not spend the crop margin twice. These claims concern this sampling lattice/filter; the mask does not certify continuous between-pixel support. Each component's intermediate source point and derivative remain available for feature-specific margin inspection; intermediate points are not separately cropped.

The plan reports physical captured edge FOV from the declared physical projection distance and source bounds. It separately reports the angular envelope of retained mapped pixel-center rays. That envelope is deliberately not a continuous retained edge FOV. Off-center capture is preserved.

Singular values multiplied by destination/source pixel pitch diagnose local sampling compression. Any value above one requires declared source-prefiltered data. With antialias=none the plan remains inspectable but cannot execute a compressing resample. The caller owns the prefilter and must provide data appropriate to the maximum footprint; this module does not implement or certify that prefilter. The filter/profile ID remains separate from mapping identity.

calculateGeometricResampling() performs one nearest or bilinear scalar pass, emits null for invalid support, and never extends/clones/mirrors edges. Exact boundary centers do not require nonexistent bilinear neighbors. It warps already-formed blur/bokeh and noise. Stretching cannot create optical detail or recalculate a better PSF. The full Jacobian explains local transformed blur and sampling density.

## Generic camera correction profiles

resolveLensCorrectionPlan() resolves each component independently in profile application order. It records toggled/default, mandatory, stabilization-required and component-dependency reasons. Dependencies refer only to earlier components, preventing cycles. Required components may override a dependent component's requested Off with an explicit component-dependency reason. Mandatory camera corrections cannot be turned Off through a camera setting; reference-bypass is a separately labeled educational comparison.

Each component declares its image domain, identity/version, residual limits, availability and dependencies. Supported families are geometry, lateral channel registration and scalar peripheral illumination. Color shading, longitudinal CA and diffraction/deconvolution restoration are distinct unsupported families. RAW-like output preserves metadata/intent without baking; processed output bakes supported downstream operations.

calculatePeripheralIlluminationCorrection() uses the existing positive bounded illumination profile and gain = throughput^(−strength), with strength in [0,1]. Its signal and variance gains are g and g²; variance is explicitly pre-clip. This does not restore photons or authoritative capture SNR. Clipping is reported. Residual gain strength does not change physical lens throughput.

calculateLensCorrectedCapture() is a bounded reconstructed-linear RGB executor. Capture ID, time and noise realization ID are retained; physical source arrays are not mutated. Common geometry and per-channel lateral CA are composed in inverse application order and sampled once per channel. All channel masks intersect before output, so a missing channel never fabricates a valid color. Per-channel sampling/crop diagnostics remain inspectable.

The executor supports geometry/CA followed by gain. It rejects geometry across an intervening gain, or raw/processed domains, instead of silently reordering stages. Other consumers must honor the resolved profile order through production #111/#112. Gain is defined on corrected output coordinates in this executor; it does not silently reuse an upstream physical field position. Off/RAW/reference-bypass preserve original capture geometry and samples, even when a different processed destination was requested. Output dimensions must match the exact profile binding.

## Verification and provenance

Tests independently check Gaussian power integration, source linearity/admission, off-frame response, sensor/noise primitive consumption, exact applicability, Jacobian centered differences, inverse/forward round trips, all quarter-turn orientations and off-center capture, anisotropy, linear-ramp interpolation, missing support, joint crop, prefilter gating, channel registration, RAW intent, mandatory/bypass/dependency resolution, residual gain/noise/clipping and already-blurred image stretch.

Implementation/test parameters and equations were independently authored. No third-party source code, calibration data, numerical tables or protected prose was incorporated. Factual research:

- [ZEISS, Taking care of the unwanted light](https://lenspire.zeiss.com/cine/en/article/taking-care-of-the-unwanted-light): reflection ghosts and unwanted light motivate separate stray-path ownership.
- [Canon EOS R5 Mark II manual, Lens Aberration Correction](https://cam.start.canon/en/C017/manual/html/UG-03_Shooting-1_0220.html): peripheral correction noise and distortion crop/resolution limitations motivate downstream cost reporting.
- [Sony ILCE-1M2 guide, Lens Compensation](https://helpguide.sony.net/ilc/2440/v1/en/contents/0414M_lens_comp.html): component controls, forced distortion and breathing angle/quality limitations motivate resolved states and explicit costs.

These references justify scope and distinctions, not the synthetic coefficients. AI-assisted drafts still require substantive human scientific/provenance review and contributor DCO certification under CONTRIBUTING.md and PROVENANCE.md before inclusion.
