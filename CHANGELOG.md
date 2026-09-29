# Changelog

Notable public changes to `@photivra/engine` are documented here.

## Unreleased

### Added

- Added a sensor spectral-response foundation linked to exact color-sampling channel IDs. It supports direct effective external QE, direct effective spectral responsivity in A/W, or explicitly separable channel-filter transmittance × detector EQE; requires reusable rights for embedded numeric curves; uses explicit air/vacuum/unspecified wavelength bases with piecewise-linear interpolation and fail-closed out-of-range behavior; preserves single-condition metadata without inventing angle/temperature/polarization dependence; and keeps spectral integration, photons/electrons, RAW values, and reconstruction separate.
- Added response-breakpoint-aware bounded sensor spectral quadrature. Requested range edges, response-curve knots, and optional caller-supplied continuous-spectrum/optics breakpoints form deterministic midpoint segments with explicit dλ and a maximum subinterval width; response scope/provenance are preserved while response application, source-spectrum integration, photon/electron/current calculation, and RAW output remain separate.
- Added pre-response spatio-spectral irradiance reduction over explicit E_lambda(x,y) samples in W/m^2/nm. The reducer validates exact spatial/spectral profile linkage, caps the Cartesian product, composes normalized AA/aperture spatial measures with dλ, and reports wavelength-integrated spatial-average irradiance plus geometric-aperture incident flux without applying sensor response or temporal exposure.
- Added a sensor-response application compatibility gate. It binds response data to exact color/sampling-aperture/optical-stack identities, validates response reference plane and incident-area normalization, requires explicit spatial response uniformity/separability before post-spatial application, checks declared reference conditions, blocks unresolved wavelength basis, and keeps signal conversion disabled pending a later typed EQE or A/W path.
- Added an evidence-backed sensor-response operating-range gate for instantaneous optical-input linearity. It preserves radiant-power vs irradiance calibration domains, wavelength applicability, reference conditions, uncertainty, and a declared maximum relative nonlinearity criterion while keeping exposure/full-well saturation and downstream electronics linearity explicitly separate.
- Added a photon-energy wavelength-basis foundation using exact SI Planck constant and vacuum light speed. Vacuum wavelengths map directly; air wavelengths require an exact-wavelength sourced phase refractive index plus explicit atmosphere compatibility, and refractive-index uncertainty is preserved without falsely claiming uncertainty propagation.
- Added typed EQE/filter×detector-EQE instantaneous electron-rate conversion. The converter validates structural and operating-range authorization, requires explicit spatial linear superposition and per-spectral-bin operating-range applicability, binds response evidence and evaluated bin inputs to the exact pre-response reduction, converts each wavelength-bin power contribution to photon rate with the photon-energy foundation, applies effective QE per wavelength, and returns expected electron rate without temporal integration.
- Tightened the operating-range gate so wavelength-dependent rate conversion now fails closed unless both geometric-aperture linear superposition and per-spectral-bin input applicability are explicitly established. Broadband-only range evidence remains diagnostic but cannot authorize EQE/A-W conversion.
- Added typed A/W spectral-responsivity conversion from per-wavelength geometric-aperture radiant power to detector-terminal photocurrent magnitude. The path requires the same structural/spatial/per-bin operating gates as EQE plus an explicit electrical applicability profile for detector bias and current-readout loading; transimpedance, voltage, temporal charge, saturation, noise, ADC and RAW remain downstream.

### Changed

- Engine API contract advances to `0.55.0`. The composed POC remains `0.20.0`; package version remains `0.6.0` until the next public release.

## 0.6.0 - 2026-09-29

### Added

- Added a standalone native-sensor readout scan timing foundation with separately evidenced seconds-valued capture data-readout duration and rolling spatial-sampling skew, native scan direction, active-capture support, pointwise native phase diagnostics, and independent mechanical/EFCS/electronic shutter-mechanism metadata. The first model is explicitly a uniform-linear single-axis approximation and does not infer physical readout lines from the effective image raster.
- Added a standalone capture exposure-window timing foundation with independent opening/closing boundary schedules, simultaneous or uniform-linear native scans, explicit mechanism-derived boundary actuators, evidence-backed timing/direction declarations, full-active-region positive-duration validation, and local exposure-window diagnostics relative to the first opening-boundary phase. Sensor readout remains a separate contract.
- Added a capture-rotation exposure trajectory foundation that maps native sensor points into the reference image plane and evaluates the existing pure-rotation camera model at each point's local exposure start/end. It preserves exposure-window and rotation provenance, excludes sensor readout timing, and explicitly stops short of claiming a rolling-shutter warp or integrated blur kernel.
- Added an analytic inverse pure-camera-rotation mapping plus an instantaneous capture-scan inverse mapping at an explicitly selected local-exposure phase. The capture mapping uses destination-native timing, reports native/oriented effective-sample displacement, does not clamp reference rays outside the active frame, and intentionally avoids iterative solving, sensor-readout coupling, and finite-exposure blur claims.
- Added an evidence-backed readout/exposure spatial-linkage assessment for declaring normalized native scan-phase relationships between rolling sensor readout and electronic exposure boundaries. It supports same/reversed spatial phase, preserves evidence-backed seconds facts, reports cadence ratios, and explicitly does not infer absolute temporal synchronization from shutter mechanism, scan direction, equal timing spans, or total data-readout duration.
- Added deterministic pure-rotation temporal quadrature over each destination point's local exposure window. The first model uses uniform midpoint nodes, preserves the #65 instantaneous inverse mapping as the geometry source of truth, reports both normalized time-average weights and seconds-valued integration measures, and deliberately does not calculate radiance, a blur kernel, or a geometry-only integration error estimate.
- Added the first capture-mode profile/resolution contract with orthogonal acquisition sequence, per-frame sampling, optional evidence-backed inter-frame sensor offsets, reconstruction stages, processed-image raster, and downstream dependency declarations. Grouped sampling preserves unknown vs charge-domain vs pre-conversion-analog vs post-conversion-digital combination semantics; processed/output resolution never mutates physical sensor identity or permits photosite-count inference.
- Added the first exact color-sampling topology contract. It supports monochrome and arbitrary periodic mosaics on an abstract native sensor sampling-site lattice, preserves sensor-anchored repeat phase, allows arbitrary semantic channel IDs without implying spectral calibration, and represents layered color as structural-only until per-layer spatial sampling is modeled. It intentionally does not bind color-sampling sites to `NativeImageRaster` or physical photodiodes.
- Added an evidence-backed native-effective-raster ↔ color-sampling-site-grid binding plus capture-mode structural-source resolution. The bridge binds one exact native effective raster to regular color-site blocks, requires separately evidenced grouped-mode phase, preserves absolute CFA phase, reports compact source rectangles and exact channel-site counts, keeps pixel-shift offsets from changing CFA assignment, and fails closed for declared-effective or layered relationships that are not explicitly mapped.
- Added a sensor optical-stack foundation that separates ordered physical stack-component metadata from effective anti-aliasing spatial response. Effective AA response may be explicitly absent, present-but-unresolved, or an arbitrary normalized point-splitting kernel in native sensor physical coordinates; microlens and cover/filter-stack presence remain descriptive until later angular/spectral/refraction models exist. Unknown AA response remains distinct from documented absence.
- Added a sensor sampling-aperture foundation that explicitly registers the color-site lattice in native sensor physical space and describes a first geometric photosensitive aperture as an optional uniform axis-aligned rectangle. Site pitch/origin and aperture geometry carry separate evidence, unresolved aperture stays fail-closed, geometric fill fraction is diagnostic only, and AA, microlens redistribution, charge diffusion/crosstalk, spectral response, QE, optical throughput, radiometric collection area, and physical photodiode truth remain outside the model.
- Added deterministic sensor spatial-sampling quadrature that combines the resolved geometric aperture with effective AA point splitting using inverse source mapping. It returns native-physical midpoint nodes, separate normalized-average and square-micrometre area measures, preserves destination CFA channel semantics, retains off-imaging-area pre-AA support without clamping/renormalization, and deliberately does not produce optical-field values, photons/electrons, RAW samples, or reconstruction.
- Added sensor spatial-sample reduction for explicitly identified quadrature-node values. It supports nonnegative relative-linear irradiance proxies and physical sensor-plane irradiance in W/m², preserves node identity independently of input ordering, returns normalized spatial averages plus geometric area integrals/incident flux, and keeps CFA spectral response, temporal integration, QE, noise, ADC, RAW code values, and reconstruction separate.

### Changed

- Engine API contract advances to `0.47.0`. The composed POC remains `0.20.0`; the engine can now reduce explicitly identified nonnegative linear spatial samples in either relative or physical irradiance domains without claiming CFA spectral filtering, temporal exposure, sensor conversion, or RAW output.

### Fixed

- Radial-distortion invertibility validation now uses scale-normalized, cancellation-resistant stationary-point solving so near-linear high-order profiles cannot hide an interior fold; unsafe derived normalized radii and malformed/sparse batch points fail closed as scientific input errors.
- Reverse image-plane coordinate mapping now uses a physical-scale floating-point edge tolerance instead of a fixed normalized-UV tolerance.

### Performance

- Inverse radial mapping resolves exact identity and mapped-boundary cases directly and stops deterministic bisection once IEEE-754 bounds can no longer narrow.
- The image-formation benchmark now warms and amplifies measured work, alternates scalar/batch ordering, reports paired median ratios, remains informational-only, and avoids a duplicate CI build.

## 0.5.1 - 2026-09-26

### Fixed

- Inverse radial distortion now tolerates only floating-point-scale overshoot at the validated mapped operating boundary and clamps the solver target to that boundary, preventing exact limiting coordinates from failing because of one-ULP polynomial rounding while keeping materially out-of-envelope destinations fail-closed.

## 0.5.0 - 2026-09-26

### Added

- `calculateInverseRadialDistortionMappings()` and `calculateInverseLateralChromaticAberrationMappings()` for multi-point inverse field sampling with one profile-validation/provenance boundary per batch; scalar APIs remain unchanged.
- `mapOrientedPhysicalUvToImagePlanePoint()` and `mapImagePlanePointToOrientedPhysicalUv()` for explicit round-trip conversion between normalized oriented physical raster regions (+Y down) and the pre-orientation optical image plane (+Y up), preserving all four capture orientations and asymmetric/off-axis bounds.

### Changed

- Engine API contract advances to `0.34.0`. The composed POC remains `0.20.0`; this release adds standalone coordinate and batch lens-field APIs without composing lens-field effects into the POC.

## 0.4.0 - 2026-09-25

### Added

- `getImageFormationContract()` and `IMAGE_FORMATION_CONTRACT_VERSION` defining public scientific ownership domains, coordinate spaces, hard stage dependencies, cross-stage couplings, temporal semantics, renderer warp/alpha/occlusion rules, and reserved sensor/reconstruction ordering.
- Explicit effect placement for focus breathing, distortion, lateral chromatic aberration, illumination/mechanical vignetting, non-circular diffraction, field-dependent PSF effects, time-parameterized camera rotation, rolling readout, CFA/photosite sampling, sensor statistics, and reconstruction.
- `calculateCameraRotationImageMapping()` for field-position-dependent, time-parameterized pure camera rotation using exact axis-angle integration of constant pitch/yaw/roll angular velocity.
- `calculateFocusBreathingProjection()` and `calculateFocusBreathingFieldOfView()` for an explicit caller-declared projection scale at the selected focus state, without mutating physical focal length or inventing a lens-specific breathing curve.
- `calculateRadialDistortionMapping()` plus `calculateInverseRadialDistortionMapping()` for generic optical-axis-centered radial field mapping with explicit normalization radius, declared operating envelope, and fail-closed monotonicity/invertibility validation.
- `calculateLateralChromaticAberrationMapping()` plus its inverse for green-reference channel field mapping: one common base distortion plus red/blue coefficient offsets, deterministic per-channel source sampling, and physical separation diagnostics.
- `calculateIlluminationVignetting()` for generic radial field-dependent linear throughput with full-envelope extrema validation, positive stop-loss reporting, and a strict separation from pupil/PSF vignetting.
- `getPsfFoundationContract()` and `calculatePsfFoundationComponents()` for explicit field/depth/wavelength/pupil context plus separately preserved geometric-defocus and circular-diffraction diagnostics, with future pupil/field contributions reserved but not implemented.

### Changed

- Engine API contract advances to `0.32.0`. The image-formation contract remains `0.2.0`; the new PSF/pupil foundation formalizes already-partial field/PSF ownership without changing composed POC semantics. The composed POC remains `0.20.0`.

### Fixed

- Tightened final output-raster aspect validation so only nearest-integer rounding from one isotropic scale is accepted; fixed-percentage tolerance no longer permits visible anisotropic stretching.
- Calculation-quality validation now fails closed on unknown runtime uncertainty `kind` and `source` values instead of treating unknown discriminants as valid metadata.

### Documentation

- Added the image-formation contract guide and synchronized architecture, physics, motion, API-style, and agent guidance around partial-order/coupled-stage semantics and reserved sensor stages.
- Documented the physical camera-rotation sign/axis conventions, field-dependent mapping, and compatibility boundary with the legacy stabilization-equivalent approximation.
- Documented the declared-scale focus-breathing model, its zero-breathing compatibility case, and the prohibition on inferring real-lens behavior from focal/focus metadata.
- Documented radial distortion normalization, forward/inverse mapping, operating-envelope monotonicity, and the boundary excluding tangential/decentered and named-lens behavior.
- Documented lateral CA as channel-dependent field mapping rather than RGB blur, including the non-spectral/non-CFA calibration boundary.
- Documented illumination vignetting as scene-linear/channel-linear throughput only, including full-envelope validity checks and the boundary excluding mechanical/pupil vignetting and PSF/bokeh changes.
- Added the PSF/pupil foundation guide, preserving defocus and circular diffraction as separate diagnostics and reserving future pupil clipping, non-circular diffraction, field curvature, aberration, and bokeh contributions without claiming a combined PSF.

## 0.3.0 - 2026-09-25

### Added

- `calculateSensorGeometryMetrics()` plus `SensorImagingArea` and `NativeImageRaster`, separating physical imaging geometry from native effective image resolution while deriving diagonal 35 mm crop factor, megapixels, and independent X/Y sampling pitch.
- Explicit provenance assumptions that prevent geometric sample spacing from being treated as photosite active area or photon-collection area.
- `resolveCaptureGeometry()` with invariant native sensor coordinates, active capture rectangles, physical camera orientation, digital output crop, and final output raster separation.
- `calculateActiveCaptureFieldOfView()`, which reuses the canonical field-of-view model and preserves diagonal FOV across 90° orientation changes.
- `calculateImagingAreaMetrics()` as the shared diagonal crop-factor primitive for physical imaging areas.
- `calculateEquivalentFocalLength35Mm()`, keeping physical focal length authoritative while deriving conventional diagonal-based 35 mm equivalence from the active physical capture area.
- `parseSensorArchitectureProfile()` plus evidence-backed independent metadata axes for illumination, stacking/integration, readout capabilities, and color-sampling family.
- `calculateFieldOfViewBounds()` for asymmetric/off-center sensor-plane angular bounds.
- Exact native↔oriented raster point/vector/rectangle transforms for all four physical camera rotations.
- `RasterDimensions` as the generic active/output raster contract while `NativeImageRaster` remains the semantic native-raster alias.
- Off-center active-capture optical-axis offsets/bounds, asymmetric FOV, and dual diagonal-corner angular spans.
- Output-raster aspect-ratio validation that rejects implicit geometric stretching.
- `calculateOutputFieldOfView()` plus explicit physical final-output bounds and output resampling scale.
- `parseRadiometryReadinessProfile()` and `assessRadiometryReadiness()` for explicit scene/optics/photosite/exposure/sensor-response prerequisite gating before any future photon simulation.

### Changed

- Engine API contract advances to `0.25.0`.
- Composed POC simulation API advances to `0.20.0`, preserving legacy requests while completing staged capture orientation/active/output geometry, final-output FOV, capture-mode viewing CoC, orientation-aware subject framing, and explicit output sampling scale.
- The composed POC exposes shared sensor-geometry metrics while retaining backwards-compatible representative pitch fields.
- Capture-geometry mode continues to reject stacking legacy `crop.factor` with staged capture, while subject framing and equivalent-viewing CoC now use explicit staged output/viewing semantics.
- The composed POC continues to expose X/Y sample pitch diagnostics and rejects sensor geometry whose X/Y geometric pitch differs by more than 1% until all pixel-domain calculations are axis-aware.
- Unreleased sensor-architecture schema advances to `0.2.0`: source origin and reuse rights are independent, scalar facts accept multiple evidence records, and each readout capability carries its own evidence.
- `InvalidConfigurationError` now lives in the core dependency layer and remains re-exported from the existing public surface.
- Radiometry readiness distinguishes `not-ready`, `approximate-only`, and `calibrated-ready`; assessment never enables composed photon output by itself.

### Documentation

- Synchronized human and agent guidance with the post-0.2 sensor/capture foundations, evidence/reuse-rights model, radiometry readiness gate, independent API-version surfaces, composed-POC integration boundary, and coordinate/sampling invariants.

## 0.2.0 - 2026-09-21

### Added

- `calculateRelativeRenderedExposure()`, a deterministic relative rendering relation that combines aperture/shutter optical exposure with nominal ISO gain relative to declared reference settings.
- Public input and result types for the relative rendered exposure calculation.

### Documentation

- Added usage guidance and scientific limitations for relative rendered exposure.
- Synchronized package, lockfile, README, and citation version metadata for the release.

## 0.1.0 - 2026-09-20

- Initial public release of the Photivra engine package.
