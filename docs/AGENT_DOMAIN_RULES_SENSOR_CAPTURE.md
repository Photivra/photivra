# Photivra engine agent rules: Sensor, coordinates and capture

These rules moved verbatim from [the domain rules index](AGENT_DOMAIN_RULES.md) and **remain binding** for sensor, capture, coordinate-system, image-formation, production image-formation, linear capture, processed/SDR output and composition changes and their tests, reviews, documentation and APIs. The index's scientific-integrity rules apply to every domain; for cross-domain work, also read every other affected domain file. This file is not a substitute for the canonical API, scientific, provenance or numerical specifications.

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
- Dark current is a separate pre-compensation thermal electron-rate contract in e-/s. Do not fold dark offset, compensation, defects/hot pixels, leakage, injection, or photo-signal into that rate.
- Do not impose a universal exponential/doubling-temperature law on dark current. Exact-temperature data or explicitly sampled temperature curves may be used; interpolation must fail closed outside the measured range.
- A population-mean dark current must remain labeled approximation and must not claim dark-current nonuniformity is modeled.
- Dark-current accumulation currently composes only with the EQE electron-count path. A/W photocharge must not be reinterpreted as stored electrons without a separate carrier/storage mapping.
- A/W responsivity must never enter the EQE photon-rate→electron-rate path; it remains a separate radiant-power→current path.
- A/W photocurrent conversion is quasi-static/steady-state only until a detector temporal-response/bandwidth model exists. Do not use the spectral A/W curve as an impulse/frequency-response model.
- Stored-charge completeness is exposure-event specific. Photo, dark, and every additional stored-electron component must bind to the same color site, channel, local-exposure binding ID, and exact start/end window; equal duration is not enough.
- Additional stored-electron components must be explicitly incremental beyond both modeled photo signal and modeled dark current. Never double-count hot-pixel/leakage terms already represented by the dark-current model.
- An empty list of additional charge components is not proof of completeness. Physical full-well assessment may be authorized only by an explicit evidence-backed completeness declaration that all material stored-electron contributors are accounted for.
- A/W integrated charge is not stored-electron count and must remain outside the physical full-well electron-storage path until an explicit carrier/storage mapping exists.
- Physical charge-storage capacity is a source-specific electrons limit and must never be substituted with EMVA camera saturation capacity, analog clipping, ADC clipping, or RAW-code maximum.
- Physical capacity assessment compares total expected stored electrons to capacity. Expected charge below capacity does not prove a stochastic realization avoided saturation; expected charge above capacity means only that the unsaturated linear expectation exceeds the declared capacity.
- Do not clamp at physical capacity or invent overflow/blooming charge without a separate nonlinear storage/overflow/neighbor-transfer model.
- Physical capacity must be bound to exact sensor site/applicability, operating state and temperature applicability. Do not infer capacity from ISO, gain labels, capture mode names, pixel pitch, or nearby specifications.
- Camera saturation capacity is a dark-corrected photo-signal electron-equivalent response-chain quantity, not total stored charge and not physical full-well capacity.
- When assessing camera saturation capacity, compare only the calibrated signal domain. Dark/other stored electrons may be relevant to physical storage accounting but must not be silently added to a dark-corrected camera-signal capacity.
- Camera saturation capacity alone does not identify the limiting stage. Do not infer analog clipping, ADC clipping, bit-depth ceiling, or physical-well limitation unless separate evidence establishes that mechanism.
- Camera saturation assessment is also expectation-domain only until stochastic/noise behavior is composed; do not clamp or invent post-saturation output codes.
- `reverse-biased` electrical applicability requires a strictly positive reverse-bias magnitude; zero bias belongs to `zero-bias-photovoltaic`. `finite-input-impedance` likewise requires a strictly positive impedance; zero-ohm semantics must not be smuggled into that category.
- Temporal integration must bind a response-rate result to its exact color-sampling site and then through an explicit color-site ↔ native-effective-raster relationship before selecting a local exposure window. Never assume site indices are native-raster coordinates.
- The first local-exposure binding supports only one-to-one color-site/native-effective-sample registration. Multi-site blocks establish contributor membership but not sub-sample timing position; fail closed for spatially varying timing until that registration is explicitly modeled.
- A local exposure window does not establish time-stationary signal. Do not multiply a rate by duration until a separate temporal-stationarity contract explicitly authorizes the constant-rate approximation.
- Constant-rate temporal integration must bind stationarity evidence to the exact rate domain, site, binding ID, and local start/end offsets; do not reuse a stationarity declaration across a different shutter window.
- Nonstationary EQE handoff uses the explicit validated temporal photo-signal record. Preserve midpoint-rate/count agreement and exact temporal event identity through dark/charge/RAW; never fabricate stationarity. Dark rate remains evaluated at one supplied operating temperature, without intra-exposure heating. Source truth and convergence remain unverified.
- EQE temporal integration produces expected photon/electron counts and must preserve fractional expectation values; do not round or sample shot noise at this stage.
- A/W temporal integration produces photocurrent charge magnitude in coulombs only. Do not infer electron/carrier count or circuit polarity from A/W current integration.
- Photo-signal accumulation is not total sensor charge. Dark current, leakage/defect/injection terms and other accumulated contributors remain separate, so photo-signal-only results cannot authorize physical full-well assessment.
- Physical full-well capacity and camera/digital saturation capacity are distinct concepts. Do not collapse them into one clamp or infer one from the other.
- Local exposure binding represents one capture/exposure event. Multi-frame, pixel-shift, HDR-bracket and computational sequence timing/combination remain separate.
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
- Static reserved-stage metadata alone is not an implemented capability. Plan 0.7.0 explicitly executes bounded declared environment sampling/charge/noise/ADC/reconstruction; preserve its per-route blockers rather than widening support from a registry label.

## Production image-formation plan boundary

- The production plan is additive and separate from `simulatePocCamera()`. Do not widen POC behavior merely because a stage becomes available to the production composer.
- `getImageFormationContract()` remains the authoritative stage/dependency/coupling graph. The production planner may expand that graph; it must not invent a second hidden ordering.
- Separate prepared static context from immutable per-capture state. Do not reparse/rebind unchanged equipment/renderer/fidelity profiles for every capture.
- Capture snapshots are committed values: copy/freeze them so later UI changes cannot mutate capture identity or plan results.
- Fidelity profiles are defined by required stage/effect capabilities and renderer requirements, never vague `low/medium/high` labels.
- Every requested stage/effect must be explicit as active, modeled-zero, omitted-by-fidelity, unsupported, or blocked. Numerically zero is not the same as absent.
- Unsupported composer stages and renderer capability mismatches must return structured blockers. Do not silently skip requested effects or fall back to renderer/app glue.
- Renderer capability declarations are semantic metadata only. Do not place React, Three.js, WebGPU, DOM, server, or transport objects in the public scientific plan.
- The first physical production path consumes #85 + #110 spectral quantities. Do not substitute RGB preview values for a physical sensor-irradiance request.
- A non-unity field-throughput input must correspond to an explicitly requested illumination-vignetting effect; hidden active effects are blockers.
- Requesting downstream sensor/RAW stages before they are intentionally composed must block rather than synthesize a shortcut.
- Preserve static/capture/model/version identities in the plan for reproducibility.
- Canonical FNV-1a plan fingerprints are deterministic non-cryptographic reproducibility keys only; never present them as cryptographic integrity hashes.
- Capture stochastic seed ownership is explicit. Backend randomness must not silently change scientific results.
- Performance caching/preparation (#43/#45) may optimize execution but must preserve exact semantic plan identity.

## Production processed-output boundary

- Plan 0.7.0 may execute reconstruction, physical orientation, output crop and display processing only from explicit `processedOutput` attachment/state and declared renderer support. See `docs/PROCESSED_OUTPUT.md`.
- Share `calculateProcessedSensorRaw()` between RAW preview and paired JPEG; file metadata/packing and platform viewing adaptation remain separate.
- Retain the authoritative RAW, explicit color/WB/tone/gamut/transfer/quantization identities, child correction costs and distinct clipping domains. Rendering changes cannot mutate capture, noise or upstream metering.
- An attached RAW identity is not verification of its physical origin. Preserve every missing upstream-stage blocker; downstream execution does not make the full production plan ready.
- Preserve legacy no-attachment unsupported behavior and fail closed on unsupported HDR/correction domains or source prefilter claims.

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

## Authoritative linear capture container

- #15A `SimulatedCapture` is a standalone immutable data commitment, not a radiance generator, virtual-camera color transform, quantizer, file serializer or production-stage activation.
- Follow `docs/SIMULATED_CAPTURE.md`. Preserve distinct image states, float headroom/negative values, source dynamic-range history, capture saturation, reference white, adopted white and resolved WB intent/application.
- Reuse geometry/focal/focus/WB contracts. Digital/output crop never changes active-capture focal equivalence. External plane references are public IDs plus SHA-256 and declared IEEE float layout; no runtime file/network access is introduced.
- Allowlist public metadata; reject paths, URLs, private/debug fields and LDR/tonemapped state declarations. Producer IDs must remain public and non-personal. An ID grammar is not a provenance/privacy audit.
- #15B owns actual color transforms/validity; #15C owns total quantization behavior; #112 owns rendering and #16 file mapping. Do not infer serializer readiness from container validity. #15 and its prerequisites are merged. Container validity alone still does not establish serializer or calibration readiness.
- Follow `docs/CAPTURE_COLOR.md` for #15B. The ideal colorimetric virtual RGB profile is an explicit XYZ encoding, never inferred for arbitrary spectral/commercial sensor channels. Resolved RGB gains require the exact camera-basis binding; adopted-white XYZ scaling is a separately selected approximation. Preserve float range and source capture history; reject double application and do not claim a physically unique global white under mixed illumination.
- Follow `docs/LINEAR_CAPTURE_ENCODING.md` for #15C. Linear uint16 encoding requires explicit black/reference codes, negative and range policies and nearest-ties-up rounding. Use the plane's reference value; preserve float source data and color/WB/capture-saturation identity. Integer code limits never redefine capture saturation or display white. No serializer tags, gamma/tone mapping or implicit color conversion belongs here.

## Standalone SDR rendering primitives

- Follow `docs/SDR_RENDERING.md` for #112A. Accept only explicitly color-transformed linear-sRGB/D65 input with completed/not-required WB; unresolved scene/sensor/WB states fail closed. This low-level primitive does not itself activate production display-processing. The merged capture/RAW adapters and plan 0.7.0 own explicit integration.
- Rendering exposure is post-capture relative scaling. Keep tone, gamut handling, transfer encoding, quantization and external display adaptation separately inspectable; no processing result rewrites metering, noise, physical exposure or upstream saturation.
- Positive per-channel Reinhard is a named generic rendering choice that can change chromaticity. Component clipping is explicit, not perceptual gamut mapping. SDR source headroom never establishes HDR output or actual display capability.
- #112 integration is merged. Preserve its shared processed-RAW/paired-JPEG path, #111 ordering and #108/#15 WB; do not introduce a second estimator/composer.
