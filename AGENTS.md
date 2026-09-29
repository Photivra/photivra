# AGENTS.md

These instructions apply to the entire Photivra engine repository.

## Project identity

- Project: **Photivra**
- Pronunciation (IPA): /foʊˈtɪvɹə/
- Package: `@photivra/engine`
- License: Apache-2.0

Treat this repository as a complete, standalone open-source scientific/business-logic project. Do not add references or dependencies that require access to private repositories or private product code.


## Non-negotiable rules

1. Never introduce copied, restricted, or ambiguously licensed source code, data, calibration material, model weights, or protected expression.
2. Never fabricate scientific accuracy, calibration, uncertainty, confidence, or physical-performance claims.
3. Preserve backward compatibility of public APIs and schemas unless an explicit breaking change is approved.
4. Keep the root public package browser-safe and keep Node-only tooling out of the published package surface.
5. Never weaken CI, security, provenance, licensing, SPDX, identity, browser-surface, or package-surface gates to make a change pass.
6. Never commit secrets, credentials, private keys, private datasets, or restricted material.
7. Call out any new monetary cost before adopting a paid service, dependency, dataset, or infrastructure component.

## Repository map

- `src/` — scientific implementation, schemas, validation, and composed engine logic.
- `src/camera/` — projection, field-of-view, and equivalent-focal-length primitives.
- `src/sensor/` — sensor geometry, architecture metadata, radiometry readiness, sampling, and signal/noise primitives.
- `src/output/` — capture/orientation/output geometry and crop/framing calculations.
- `src/core/` — shared result metadata, errors, and evidence/provenance contracts; lower layers must not depend on schema/UI code.
- `src/api/` — repository-only local Node transport; not a public package surface.
- `test/` — deterministic unit, regression, invariant, fuzz/property, parser, and integration tests.
- `docs/USAGE.md` — canonical public API examples.
- `docs/PHYSICS_FOUNDATION.md` — geometry/optics model assumptions and coordinate conventions.
- `docs/MOTION_AND_SIGNAL.md` — motion/exposure/signal boundaries, including radiometry gating.
- `docs/PROVENANCE.md` — scientific/source evidence and reuse-rights rules.
- `docs/API_STYLE.md` — public API and versioning conventions.
- `scripts/` — CI, package-surface, license, identity, and browser-boundary gates.

## Sources of truth

- Scientific equations and behavior are defined by implementation plus tests; documentation must agree with them.
- Public API shape and semantics are defined by exported TypeScript contracts, tests, and `docs/API_STYLE.md`.
- Root engine compatibility is versioned by `ENGINE_API_VERSION`; the composed `simulatePocCamera()` request/response contract is separately versioned by `POC_SIMULATION_API_VERSION`. Never conflate either with the npm package version.
- If documentation, tests, and implementation disagree, do not guess. Determine the intended contract, fix the stale source, and add a regression test when behavior is involved.
- UI or downstream clients are never authoritative sources for camera science.

## Priorities

In descending order:

1. Scientific correctness and explicit assumptions.
2. Legal/source provenance and license cleanliness.
3. Security, privacy, and package-boundary integrity.
4. Backward compatibility of public APIs and schemas.
5. Deterministic tests and reproducibility.
6. Minimal, maintainable implementation.
7. Performance where measurements show material value.
8. Documentation that is complete, concise, and current.

Do not weaken an existing release, provenance, licensing, browser-surface, or package-surface gate to make a change pass.

## Scientific integrity

- Use explicit physical units in names and contracts.
- Keep equations, coordinate conventions, assumptions, and valid ranges documented.
- Prefer established analytical relations and independently derived tests.
- Never fabricate calibration values, uncertainty, confidence, error bars, or physical accuracy claims.
- Label results honestly as calculated, calibrated, estimated, or approximation.
- Keep independent physical effects separate unless a documented model justifies combining them.
- Do not claim performance for named commercial cameras, lenses, stabilization systems, or sensors without defensible licensed calibration data.
- Treat public standards, papers, patents, and web references as references, not permission to copy protected expression or data.

## Sensor, capture, and coordinate-system rules

The sensor/capture foundation has explicit semantics. Preserve them.

- `SensorImagingArea` is the physical photosensitive imaging area used for image formation, not die/package dimensions.
- `NativeImageRaster` describes the effective native image-sampling grid. It does not assert one image sample equals one physical photodiode.
- Exact color-sampling topology must not be indexed directly by `NativeImageRaster` unless a separate explicit binding establishes that relationship. The color-sampling-site lattice is a distinct native sensor coordinate contract.
- Periodic color-sampling phase is anchored to absolute native sensor site indices; active crop, physical orientation, and output crop/resampling must never silently reset the repeat phase.
- Color-sampling channel IDs are semantic identifiers only. They do not establish wavelength response, quantum efficiency, colorimetry, or calibrated sensor primaries.
- Do not infer an exact CFA tile from descriptive `SensorArchitectureProfile.colorSamplingFamily`; exact layouts require their own evidence-backed topology profile.
- Layered-color schema 0.1.0 uses a separate unresolved spatial-reference marker and is structural-only. Do not expose per-site layered mapping until per-layer spatial sampling density/registration is explicit.
- Periodic mosaic schema 0.1.0 does not model sparse overrides such as phase-detect sites, masked pixels, defects, or other non-periodic exceptions.
- A native-effective-raster ↔ color-site-grid binding is a separate evidence-backed contract. Never infer 1:1 correspondence from matching dimensions, aspect ratio, CFA family, or output megapixels.
- Bindings apply only to the exact native effective raster dimensions they were evidenced for; do not reuse a binding against another sensor/grid silently.
- Grouped capture-mode phase/origin is separate evidence. Do not assume grouped samples begin at native `(0,0)` merely because grouping factors divide the raster.
- Capture/color structural-source resolution uses absolute full-frame mode-sample indices. Do not pass crop-local coordinates without an explicit translation back to the full-frame mode grid.
- Sensor-shift/pixel-shift offsets move the sensor and CFA together relative to the optical image; do not change CFA channel assignment or convert those offsets into CFA-phase shifts in the binding layer.
- Structural source rectangles/channel counts are pre-reconstruction topology only. Do not treat them as signal-combination weights, a complete downstream reconstructed-pixel dependency graph, spectral response, photon/electron values, or physical photodiode counts.
- `declared-effective-raster` capture modes and layered color remain unbound until separate mode/layer-specific spatial mappings are explicitly modeled.
- Sensor optical-stack physical component metadata and effective anti-aliasing spatial response are separate facts; do not infer one from the other.
- Omitted effective AA response means unknown/unasserted. Explicit `absent` means no intentional AA point-splitting term in this model, not that the whole stack is optically identity or that aliasing cannot occur.
- Do not model OLPF behavior as a universal Gaussian or fixed four-ray kernel. A declared point-splitting kernel may have arbitrary component count/geometry and must use normalized spatial weights in native sensor physical coordinates.
- AA point-splitting weights are spatial redistribution only, not optical throughput or photon efficiency. Keep spectral transmission, cover/filter attenuation, microlens collection, QE, fill factor, and radiometry separate.
- Physical low-pass-related elements may coexist with an effectively absent/cancelled AA response; do not reject that combination as contradictory.
- Microlens presence/absence and cover/filter-stack component roles remain descriptive until explicit angular/spectral/refraction models exist.
- Color-site physical pitch/origin is a separate evidence-backed registration contract; never derive it from `NativeImageRaster`, raster megapixels, aspect ratio, or CFA family.
- Geometric sensitive-aperture dimensions/offset are separate from site pitch. Do not infer aperture shape from fill fraction or derive fill fraction as a substitute for exact footprint geometry.
- Schema 0.1.0 rectangular geometric sensitive apertures must remain within one regular lattice cell. Charge diffusion, optical/electrical crosstalk, and overlapping effective response require later explicit models rather than widening this geometric rectangle.
- A geometric sensitive-area fraction is not QE, effective radiometric collection area, throughput, spectral response, or physical photodiode truth. Do not use it to enable calibrated photon/noise claims automatically.
- Microlens spatial redistribution and AA point splitting are upstream/separate from the geometric aperture; do not fold them into site aperture dimensions unless a later versioned effective-response contract explicitly says so.
- Spatial sensor quadrature composes AA point splitting with geometric aperture integration by inverse sampling: a +delta AA displacement reads pre-AA optical field at destination - delta.
- The destination site's CFA channel applies to every spatial quadrature node. Never reassign CFA channel from the pre-AA source coordinate.
- Preserve both dimensionless normalized spatial-average weights and square-micrometre geometric area measures; do not reinterpret either as throughput, QE, photon count, or calibrated collection area.
- Pre-AA source points may validly lie outside the active imaging area near edges. Do not clamp, drop, or renormalize them; downstream optical-source coverage owns that policy.
- Spatial quadrature and temporal quadrature remain separate until an explicit versioned composition multiplies their measures and evaluates a downstream optical/radiometric field.
- Do not call generic spatial-reduction inputs an optical field amplitude. The current AA/aperture model consumes nonnegative additive irradiance-like scalars only; coherent complex field/phase interference is outside scope.
- Physical spatial reduction uses sensor-plane irradiance in W/m². Radiance, RGB renderer values, gamma-encoded values, spectral irradiance, exposure, photons/electrons, and RAW code values are different domains and must not be substituted silently.
- A destination CFA channel ID is metadata until an explicit spectral filter/sensor-response model is applied; channel tagging alone is not mosaiced color measurement.
- Spatial node values must be matched by explicit quadrature-node identity. Do not rely on array position, auto-fill missing edge support, or renormalize away unsupplied nodes.
- CFA/color channel IDs are semantic labels, not spectral curves. Never infer wavelength response from names such as red, green, blue, clear, Bayer, Quad Bayer, or X-Trans-like family metadata.
- Embedded multi-point spectral curve data requires reusable-data or Photivra-owned provenance. Factual-reference-only sources may inform research/metadata but do not authorize copying numeric curves into the public engine.
- Direct effective spectral response and separable channel-filter × detector response are different evidence models. Do not force decomposition when only combined response is established, and do not multiply a combined effective response by the same upstream components again.
- External QE and spectral responsivity (A/W) are distinct physical representations. Never convert between them implicitly or treat equal numeric values as equivalent.
- Spectral wavelength basis is explicit. Air, vacuum, and unspecified wavelength coordinates must not be silently converted or mixed; calibrated curves cannot use an unspecified basis.
- Spectral response is valid only over its declared sampled wavelength interval in schema 0.1.0. Do not extrapolate or assume response is zero outside that interval.
- First spectral-response profiles are single-condition only. Optional reference temperature/incidence/polarization metadata does not create field-angle, temperature, or polarization dependence models.
- Spectral-quadrature wavelength measures are explicit d-lambda in nanometres, not response, throughput, probability, photon, electron, or current weights. A later integrand must use compatible per-nanometre spectral-density units or perform an explicit unit conversion first.
- A spectral-quadrature requested range must remain wholly inside the selected sensor-response support. Do not clip, extrapolate, or zero-fill response support, and do not treat sensor-response coverage as proof that scene-spectrum or optical-transmission data cover the same interval.
- Response knots plus explicit caller-supplied continuous-spectrum/optics breakpoints may partition spectral quadrature, and a maximum subinterval width may bound node spacing. Neither breakpoint alignment nor bounded spacing proves convergence or supplies an integration-error estimate.
- Spectral quadrature is a wavelength-measure plan only. Do not apply sensor response in the planner or collapse EQE and A/W responsivity into one downstream signal formula.
- Future spectral signal composition must match responseScope to the source plane and collection-area semantics so upstream transmission is neither omitted nor double-counted.
- The first spectral-quadrature contract is for continuous spectral densities. Discrete/delta-like line spectra require a separate explicit representation rather than hidden point-mass approximations.
- Spatio-spectral reduction requires exact colorSamplingProfileId and channelId agreement between spatial and spectral plans. Never compose plans merely because their channel labels happen to match.
- Spatio-spectral source values use W/m^2/nm at every explicit spatial × spectral node. Multiply by d-lambda in nm directly; do not introduce a 1e-9 factor unless the spectral-density wavelength unit is also converted from per-nanometre to per-metre.
- The spatial × spectral Cartesian product has its own safety bound. Individual spatial/spectral plans being below their own caps does not make their product safe to materialize.
- Spatio-spectral geometric aperture integration remains a geometric incident-flux calculation. Do not relabel geometric aperture area as effective radiometric collection area.
- The first spatio-spectral reducer stops before response application. It may consume a response-derived wavelength plan, but must not apply QE, A/W responsivity, channel-filter transmission, temporal exposure, photons/electrons, current, noise, ADC, or RAW conversion.
- Response scope/source-plane matching remains an explicit gate. Do not infer that a pre-AA source field automatically satisfies site-incident or sensor-package-incident response scope.
- A wavelength-only sensor response may be applied after spatial reduction only when its spatial response is explicitly established or declared as uniform/separable over the integrated aperture. Otherwise response must remain spatially varying and be applied before spatial reduction.
- Response incident-area normalization is part of the physical contract. Geometric-sensitive-aperture, full-site-cell, and effective-collection-area bases are not interchangeable.
- Total-pixel QE definitions that include fill factor or microlens behavior must not be applied to geometric-sensitive-aperture flux unless the calibration's area basis explicitly matches that geometric aperture.
- Exact sampling-aperture profile, optical-stack profile, color-sampling profile, channel, response profile, response reference plane, and area basis must be linked before response application.
- Reference temperature/incidence-angle/polarization conditions must either match exactly when required or be covered by an explicit approximation/limitation; omitted condition dependence is not invariance.
- The response-application compatibility assessment is structural only. Even a compatible result does not authorize signal conversion; operating-range/linearity validity and the typed EQE-vs-A/W conversion path remain separate gates.
- Instantaneous detector-response linearity and exposure-domain/full-well saturation are different validity domains. Do not use an optical-input linearity range as evidence that accumulated charge, conversion gain, readout electronics, ADC, or RAW output remain linear after temporal integration.
- Operating-range applicability must preserve the calibration's optical input quantity (radiant power vs irradiance), wavelength basis/range, reference conditions, uncertainty, and stated nonlinearity criterion. Do not substitute power for irradiance or generalize a calibration outside its supported wavelength range.
- Broadband-integrated operating-range evidence cannot authorize wavelength-dependent response conversion by itself. EQE/A-W paths require explicit per-spectral-bin applicability, including a supported maximum bin width, and every spectral bin must remain inside the calibrated input range.
- Post-spatial response conversion requires both response spatial uniformity/separability and operating-range linear superposition over the integrated geometric aperture. A valid total input level must not hide a locally nonlinear sub-aperture distribution.
- A successful operating-range assessment may authorize only an instantaneous response-rate conversion. It does not authorize temporal integration, saturation/full-well claims, noise, ADC, or RAW processing.
- Sensor-signal ordering is strict: per-bin response validity → typed response-rate conversion → temporal integration → accumulated-charge/full-well validity → stochastic signal/noise → analog/digital conversion → RAW. Do not skip a stage or reinterpret an upstream authorization as satisfying a downstream one.
- Photon energy is computed from optical frequency/vacuum wavelength using exact SI h and c. Never substitute an air wavelength directly into hc/lambda as though it were a vacuum wavelength.
- Air-basis wavelength conversion requires an explicit sourced phase refractive index at that exact wavelength, using n = lambda_vacuum / lambda_air. Do not silently assume n = 1.
- Air refractive-index reference atmosphere matters. Require either exact matching of temperature/pressure and any declared humidity/CO2 conditions, or an explicit evidence-backed compatibility approximation.
- Refractive-index uncertainty must remain visible; do not claim photon-energy uncertainty has been propagated unless a future explicit uncertainty model actually performs that propagation.
- Post-spatial EQE application additionally requires the operating-range model to establish linear superposition over the same geometric aperture; otherwise arbitrary sub-aperture illumination may hide local nonlinear behavior.
- EQE must be applied per wavelength quadrature node to spectral radiant-power contributions after photon-energy conversion. Never multiply broadband integrated power by an average QE.
- Direct effective EQE and explicitly separable channel-filter × detector-EQE remain distinct provenance/composition cases; only the existing spectral-response resolver may compose the separable case.
- Response application must bind to the exact parsed response-channel data carried forward from spectral planning, not merely matching profile IDs, channel names, or evidence references. Same provenance with changed numeric curve samples must fail closed.
- The response-channel binding is an exact canonical-data identity, not a cryptographic integrity claim; it prevents accidental/stale calibration substitution but does not replace source-file checksums where adversarial integrity matters.
- A response-rate authorization must bind its evaluated per-bin identities and values back to the exact reduction; stale authorization must fail after spectral power, wavelength, bin width, or identity changes.
- EQE conversion at this stage produces photon/electron rates only. Do not multiply by exposure duration, label rates as counts, apply shot noise, test full-well saturation, or generate RAW values until the temporal/saturation stages are explicitly composed.
- A/W responsivity must never enter the EQE photon-rate→electron-rate path; it remains a separate radiant-power→current path.
- A/W conversion yields detector-terminal photocurrent magnitude only. Do not infer circuit polarity/sign, electron rate, accumulated charge, transimpedance voltage, conversion gain, ADC code, or RAW value from A/W alone.
- A/W calibration applicability must bind explicit detector electrical conditions. Preserve zero-bias vs reverse-bias state and current-readout load semantics; exact-match mode must fail on differences, while any compatibility approximation must carry evidence and a limitation.
- Current-to-voltage conversion is downstream of detector photocurrent. Transimpedance gain, offset, input impedance, electronics linearity, and ADC behavior require their own contracts and must not be folded into spectral responsivity.
- Capture-mode profiles must preserve that distinction: do not relabel `NativeImageRaster` as a photosite raster or infer physical photosite count from native, processed, or final output megapixels.
- Model capture modes on orthogonal axes (acquisition sequence, per-frame sampling, optional inter-frame sensor offsets, reconstruction stages, processed raster, dependencies) rather than one mutually exclusive marketing-style mode enum.
- Grouped sampling does not establish charge-domain binning; the combination domain stays unknown unless separately evidenced as charge-domain, pre-conversion analog, or post-conversion digital.
- Inter-frame sensor offsets use units of native effective sampling pitch, not asserted photodiode pitch.
- Capture-mode processed-image raster is pre-output and does not redefine physical active area, crop factor, field of view, or final output raster semantics.
- `RasterDimensions` is the generic raster-size type for active/output rasters; do not misuse `NativeImageRaster` for non-native outputs.
- Geometric sampling pitch has separate X/Y values. Do not silently collapse materially non-square sampling to one pitch.
- Native raster coordinates use top-left origin, +X right, +Y down, with integer half-open rectangles.
- Native coordinates remain invariant under physical camera rotation. Use the exported point/vector/rectangle transforms rather than ad-hoc width/height swaps.
- Active capture and digital/output crop are different stages. Do not treat a later output crop as a smaller physical sensor.
- Off-center active capture must preserve its optical-axis offset and asymmetric angular bounds; do not recenter it for convenience.
- Output resampling must not imply geometric stretching unless a future explicit pixel-aspect/transform contract supports it.
- 35 mm-equivalent focal length is diagonal-based from the active physical capture area. Physical focal length remains authoritative and digital output crop does not redefine it.

## Image-formation contract rules

Cross-cutting optics, motion, sensor, and output work must follow `getImageFormationContract()` and `docs/IMAGE_FORMATION.md`.

- Do not implement future lens/sensor effects as arbitrary renderer post-processes when the contract assigns them to another scientific domain.
- Hard upstream dependencies and coupled-stage relationships are different concepts.
- Focus breathing is projection/lens mapping.
- Lateral CA is wavelength/channel-dependent field mapping.
- Illumination vignetting is throughput-only; mechanical/pupil vignetting can also modify PSF/bokeh.
- Diffraction belongs to the pupil/PSF domain.
- Time-dependent camera mapping uses seconds from exposure start; normalized shutter time is derived convenience only.
- Exposure duration and readout timing remain independent.
- Capture exposure-window opening/closing timing remains independent from sensor data-readout timing; never equate a readout phase with an exposure boundary without an explicit integration model.
- An explicit readout/exposure link may establish normalized native spatial phase/order only unless separate evidence establishes absolute temporal synchronization; equal direction, equal timing span, or shutter mechanism alone are never sufficient.
- `unlinked` means no relationship is asserted by Photivra, not that physical independence has been proven.
- Preserve units/evidence for readout duration, rolling spatial skew, exposure-boundary traversal, and the relationship itself; derived cadence ratios must not upgrade provenance or calibration status.
- When local exposure start varies spatially, use the exposure-window contract's explicit first-opening-boundary reference rather than silently redefining the existing camera-rotation `timeSecondsFromExposureStart` semantic.
- Camera rotation should be time-parameterized before rolling-readout integration; do not fold depth-dependent translation into a depth-independent screen flow.
- Geometric renderer warps use inverse sampling, premultiplied alpha, and must preserve scene occlusion order.
- Reserved sensor/ADC/reconstruction stages are not implemented capabilities and must not be advertised as such.

## Radiometry and sensor-metadata rules

- Sensor architecture metadata is descriptive and scientifically inert until a separate downstream model consumes it.
- Unknown sensor facts must remain unknown; do not infer BSI, stacking, CFA, readout, or performance from adjacent marketing claims.
- Evidence source origin and reuse rights are separate concepts. Public availability is not reuse permission.
- Multi-valued capabilities must carry evidence per value when sources differ.
- Geometric sample pitch is not photosite photon-collection area. Radiometry requires explicit collection-area semantics.
- `assessRadiometryReadiness()` is a gate, not a photon model. `calibrated-ready` does not prove the calibration is factually correct and never enables composed photon/noise output by itself.
- Approximate representations must remain labeled approximation; never upgrade them to calibrated merely because all prerequisite categories are present.
- Calibration/data artifacts must retain stable identifiers, hashes, evidence, reuse status, and uncertainty/limitation metadata.

## Public API and compatibility

Backward compatibility matters.

- Preserve existing public exports, argument semantics, units, return shapes, error behavior, and schema meaning unless an explicit breaking change is approved.
- Prefer typed/config-object inputs for multi-parameter functions.
- Follow the conventions in `docs/API_STYLE.md`.
- Keep result/provenance structures consistent across modules.
- Keep `ENGINE_API_VERSION`, `POC_SIMULATION_API_VERSION`, package version, and any schema version semantically distinct.
- Runtime parsers must fail closed on unknown enum/string values; TypeScript unions are not validation.
- Do not silently reinterpret an existing field or unit.
- If behavior must change, add regression tests and document compatibility impact.

## Composition boundary

Do not assume every public root-engine foundation is already part of the composed POC.

As of POC simulation API 0.20:

- `simulatePocCamera()` preserves the legacy sensor + centered `crop.factor` request and adds an opt-in staged `capture` request for physical orientation, native active-capture rectangle, oriented output crop, and final output raster.
- The POC staged `capture` geometry request must not silently stack legacy crop semantics: `crop.factor` must remain `1` when `capture` is present.
- The POC staged `capture` geometry request owns final output/viewing semantics: output physical bounds/FOV, post-output subject framing, and equivalent-viewing CoC against the final retained physical image region. Do not confuse this geometry object with the separate sensor/capture-mode profile contract.
- The response exposes shared sensor-geometry metrics plus an optional capture block with active/output FOV, active-capture 35 mm-equivalent focal length, output sampling scale, subject framing, and oriented/output motion diagnostics.
- Equivalent focal length remains informational and never replaces physical focal length inside POC physics; final digital/output crop does not redefine it.
- Existing motion/camera-shake X/Y fields retain their legacy image-plane meaning (+X right, +Y up). Capture raster coordinates are +X right, +Y down; additive diagnostics must expose the explicit basis conversion before orientation/output scaling.
- Sensor-architecture metadata, color-sampling topology profiles, native-effective-raster/color-site bindings, sensor optical-stack profiles, sensor sampling-aperture profiles, capture-mode profiles, sensor readout timing, capture exposure-window timing, and radiometry-readiness profiles remain standalone and are not composed unless an explicit versioned integration is added.
- The POC reports X/Y pitch diagnostics but still uses one representative horizontal pitch internally and fails closed above a 1% axis difference.
- Radiometry readiness never enables photon/noise output by itself.

Any further foundation composition still requires an explicit `POC_SIMULATION_API_VERSION` review/change, migration analysis, regression tests, and documentation. Do not silently reinterpret existing POC fields.

## PSF/pupil foundation rules

`getPsfFoundationContract()` and `calculatePsfFoundationComponents()` define the current PSF contribution boundary.

- Keep geometric defocus and circular diffraction separately named; do not add their diameters or convert them into one undocumented blur/sharpness scalar.
- Do not call the current diagnostics a complete PSF or MTF.
- Field position, focus/subject depth, wavelength basis, and pupil semantics are explicit context.
- The current field position is context only for defocus/Airy; do not invent field dependence until a corresponding model is implemented.
- Non-circular diffraction, mechanical pupil clipping, field curvature, field-dependent aberration, and field-dependent bokeh remain reserved until implemented.
- Illumination vignetting remains throughput-only and outside the PSF contribution list.
- Polygon aperture geometry does not by itself implement non-circular diffraction.
- Preview/reference renderers may differ in bounded fidelity but must preserve engine-owned contribution semantics.
- Test Fixture optics/highlight targets are regression evidence, not calibrated MTF or real-lens PSF data.
- Real-lens PSF profiles require defensible provenance, compatible reuse rights, and explicit limitations/uncertainty.

## Illumination-vignetting boundary

`calculateIlluminationVignetting()` is the engine-owned generic field-throughput model.

- Apply `linearThroughputFactor` only in scene-linear/channel-linear space, before display/gamma encoding.
- Optical-axis throughput is normalized to 1; generic illumination vignetting may attenuate but must not amplify above that reference.
- Respect `maximumNormalizedRadius` and the full-envelope validity gate.
- Do not use this model to warp coordinates, change focus, clip the pupil, alter PSF shape, or synthesize cat's-eye bokeh.
- Mechanical/pupil vignetting belongs to the separate pupil/PSF foundation.
- Test Fixture neutral patches provide regression evidence only; they are not calibrated radiometry.
- Do not infer named-lens coefficients or calibrated transmission from public images/specs.
- Do not compose this standalone model into the POC/app without an explicit contract/version review.

## Lateral-CA boundary

`calculateLateralChromaticAberrationMapping()` and its inverse are engine-owned channel field mappings.

- Treat red/green/blue as representative renderer channels, not wavelengths or CFA calibration.
- Green is the reference/common base distortion. Red and blue use coefficient offsets added to that base.
- Do not apply the same base distortion again as a separate renderer pass.
- All combined channel profiles share one physical normalization radius/operating envelope and must satisfy the radial invertibility contract.
- Renderers should inverse-map each destination channel to the engine-derived source coordinate; do not substitute an RGB blur or arbitrary post-output pixel offset.
- Longitudinal CA, spectral PSFs, sensor color response, and named-lens calibration are outside this model.
- Test Fixture RGB edges can verify renderer behavior but are not spectral calibration evidence.
- Do not compose this standalone model into the POC/app without an explicit contract/version review.

## Radial-distortion boundary

`calculateRadialDistortionMapping()` and `calculateInverseRadialDistortionMapping()` are the engine-owned generic radial field-mapping primitives.

- Coefficients are meaningful only with the declared `normalizationRadiusMm`; never copy coefficients into a different normalization silently.
- Respect `maximumNormalizedRadius` as the profile operating envelope.
- Profiles must remain strictly monotonic over the declared envelope so inverse mapping stays single-valued.
- Renderers should consume the inverse mapping semantics for destination-to-source sampling; do not define backend-specific distortion equations.
- This slice is optical-axis-centered and radial-only. Do not pretend it includes tangential/decentering, anamorphic, CA, or calibrated named-lens behavior.
- Test Fixture visual grids are regression evidence, not calibration data.
- Do not compose distortion into the POC or app camera science without an explicit contract/version review.

## Focus-breathing boundary

`calculateFocusBreathingProjection()` and `calculateFocusBreathingFieldOfView()` are generic declared-scale approximations.

- Never infer `breathingProjectionScale` from focal length, focus distance, sensor crop, lens brand/model, or adjacent metadata.
- Scale `1` must reproduce the existing focus-aware thin-lens projection exactly.
- Physical focal length remains authoritative; do not relabel effective projection distance as focal length.
- Digital/output crop must remain downstream and must not be folded into the breathing scale.
- A real-lens breathing profile requires defensible provenance, compatible reuse rights, and explicit limitations/uncertainty.
- Keep distortion, CA, pupil magnification, vignetting, and PSF effects separate unless a later documented model couples them.
- Do not compose this standalone model into the POC without a POC API/version review.

## Spatial camera-rotation boundary

`calculateCameraRotationImageMapping()` is the engine-owned low-level model for pure rotational field flow.

- It uses physical camera rotation signs (right-hand pitch/yaw/roll about +X/+Y/+Z at exposure start).
- It returns image-plane +Y-up displacement; do not treat optional sample displacement as native-raster +Y-down without an explicit transform.
- It is time-parameterized in seconds from exposure start.
- It integrates simultaneous angular velocity as one axis-angle vector rather than ordered Euler steps.
- Do not add translation to this depth-independent primitive; translation/parallax requires scene depth.
- Do not silently replace `estimateCameraShakeBlur()`; that older function keeps its legacy global-vector/stabilization approximation and sign semantics.
- Do not add stabilization stops to the pure rotation primitive without a separate documented control/stabilization model.
- Rolling readout must consume the same time-parameterized rotation semantics rather than defining another camera-motion equation.
- Capture rotation trajectories may bind the exposure-window `first-opening-boundary-phase` to the existing rotation model's t=0 only inside an explicit integration layer; do not silently redefine the low-level time origin.
- Do not call forward local-exposure trajectory endpoints a rolling-shutter warp or blur kernel. Renderer-ready rolling-shutter geometry must solve capture-location-dependent timing consistently and exposure blur requires integration over the local interval.
- Sensor data-readout timing must not enter capture-motion geometry unless a separate explicit capture-mode/link contract establishes that relationship.
- For the current constant-axis pure-rotation model, prefer the analytic inverse mapping over an iterative/fixed-point solver; do not introduce numerical convergence machinery when the inverse is closed-form.
- Any instantaneous capture-scan mapping must require an explicit local-exposure phase. Never silently choose midpoint/start/end and present it as the finite-exposure result.
- Finite-exposure temporal geometry must preserve separate dimensionless time-average weights and seconds-valued integration measures; do not conflate either with shutter transmission, radiometric throughput, photon count, or sensor response.
- The first finite-exposure rotation model uses deterministic uniform midpoint quadrature and must reuse the existing instantaneous inverse mapping rather than copy camera-motion equations.
- Do not average geometric coordinates and call the result motion blur. Blur/radiance accumulation belongs to downstream scene sampling and must account for visibility/radiance over time.
- Do not invent a geometry-only quadrature error bound; convergence evidence must be measured in the downstream quantity being integrated.
- Do not clamp reference rays that leave the active source frame under motion; expose the geometry and let renderer/source-coverage policy handle missing samples.

## Runtime and package boundary

- The root package must remain browser-safe and ESM-only.
- Node-only code must not become reachable from the root public export.
- The repository-local POC HTTP code under `src/api` is contributor tooling, not a supported package subpath or production architecture.
- Keep the published npm tarball limited to the intended root scientific surface.
- Do not add runtime dependencies without a concrete need, provenance/license review, and explicit approval.
- Reuse existing helpers/modules before adding parallel abstractions.

## Security and privacy

- Never commit credentials, API keys, tokens, private keys, secrets, private datasets, or restricted calibration material.
- Treat external JSON and other untrusted inputs as untrusted at runtime; TypeScript types are not validation.
- Keep the local POC server loopback-oriented and unauthenticated-development-only.
- Do not introduce persistence, telemetry, external network calls, uploads, accounts, remote code, or hosted-service dependencies without an explicit design/security review.
- Fail safely on malformed or non-finite scientific inputs.

## Legal, IP, and provenance

- Maintain Apache-2.0 and SPDX requirements.
- Follow `DCO`, `docs/PROVENANCE.md`, and `THIRD_PARTY.md`.
- Do not copy or adapt third-party code, prose, tables, diagrams, datasets, model weights, calibration files, waveform files, or protected technical expression without explicit compatible rights.
- Record third-party material and licenses when incorporated.
- Do not use third-party logos, trademarks, trade dress, or source-identifying branded designs except where a narrow factual/nominative reference is necessary and reviewed.
- AI-assisted work is draft material until substantively human-reviewed; an AI claim of originality or license compatibility is not provenance evidence.

## Testing and verification

For meaningful changes, run the smallest relevant tests first, then the full release checks before merge:

```sh
npm ci
npm run check
npm run coverage
npm run build
npm run pack:check
```

Requirements:

- Add deterministic tests for equations, invariants, parsing, edge cases, and regressions where they materially increase confidence.
- For coordinate/geometry changes, include round-trip/invariance tests for all four orientations and off-center cases where applicable.
- For provenance/readiness parsers, test malformed input, contradictory claims, duplicate facts, missing evidence, and approximation/calibration boundaries.
- Preserve fixed seeds for fuzz/property tests.
- Do not reduce coverage thresholds to land a change.
- Keep browser-surface, dependency-license, SPDX, identity, and package-surface gates green.

## Documentation

Update documentation in the same change when public behavior, equations, assumptions, limitations, schemas, APIs, provenance, or release requirements change.

Documentation must:

- match actual code;
- distinguish exact calculations from approximations;
- use concise examples that compile against the public API;
- avoid marketing claims unsupported by the model;
- preserve the canonical Photivra identity and pronunciation.

## Change discipline

- After a pull request is merged, delete its source branch promptly. Do not delete the default branch, protected/release branches, or a branch that is still required by another open PR or documented active dependency. Any retained merged-PR branch must have the reason documented and must be deleted when that dependency ends.
- Prefer the smallest change that fully solves the problem.
- Avoid unrelated refactors, formatting churn, dependency upgrades, and file movement.
- Preserve existing architecture unless there is evidence that changing it materially improves correctness, safety, maintainability, or performance.
- Investigate root causes rather than masking failing tests.
- Review the final diff for accidental API, security, licensing, or package-surface changes.
- Treat material scientific, security, licensing, provenance, trademark, package-boundary, and unsupported-claim findings as release blockers.

## Cost control

Cost is a project constraint.

Before introducing anything that may cost money—paid APIs, hosted services, storage, CDN features, SaaS, licensed datasets, commercial dependencies, or recurring infrastructure—explicitly call out:

- what would cost money;
- expected fixed and usage-based cost at realistic usage;
- a no-cost or lower-cost alternative when practical.

Do not commit the project to a paid service without explicit approval.
