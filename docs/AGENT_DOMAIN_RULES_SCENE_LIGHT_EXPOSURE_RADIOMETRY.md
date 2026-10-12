# Photivra engine agent rules: Scene light, exposure and radiometry

These rules moved verbatim from [the domain rules index](AGENT_DOMAIN_RULES.md) and **remain binding** for scene radiance, spectral composition, temporal illumination, metering, exposure-control, scene-to-sensor irradiance and radiometry/sensor-metadata changes and their tests, reviews, documentation and APIs. The index's scientific-integrity rules apply to every domain; for cross-domain work, also read every other affected domain file. This file is not a substitute for the canonical API, scientific, provenance or numerical specifications.

## Scene-radiance provider boundary

- `SceneMaterialResponseProfile` is metadata for provider inputs, not a rendered material result. RGB/PBR representations are approximation-only and must never be described as measured spectral reflectance.
- Spectral material data in schema 0.1.0 is wavelength-preserving provider input. Fluorescence/wavelength-changing behavior and material emission remain explicitly unmodeled.
- Provider output is outgoing spectral radiance in W/m²/sr/nm. Do not substitute source irradiance, luminance, RGB values, or sensor-plane irradiance.
- Scene-radiance provider/result schema 0.1.0 is approximation-only even when some input artifacts are calibrated. Do not promote provider output to calibrated radiometry.
- Provider fidelity must keep spectral, material, visibility, direct-transport, and indirect-transport axes separate. Do not collapse them into one vague quality level.
- Evaluation requests use scene targets, unit outgoing directions, seconds from exposure start, and explicit air/vacuum wavelength basis. Do not use display/raster coordinates as the scene-radiance reference frame.
- Surface requests must bind a declared materialResponseId. Result sample/provider/scene/wavelength identity must match the request exactly.
- `validateSceneRadianceEvaluationBindings()` validates identities and declared fidelity only. It does not verify the renderer's numerical transport result.
- The scene-radiance provider boundary remains upstream of optics. It must not calculate or claim sensor-plane irradiance, photon/electron values, or sensor response.
- Renderer implementation remains external. Browser preview, Blender reference, or future spectral renderers may differ in computation while preserving the same engine-owned request/result semantics.

## Shared spectral composition boundary

- Continuous spectral coverage and discrete line spectra are different mathematical representations. Never broaden a discrete/delta-like line into an arbitrary continuous bump merely to reuse continuous quadrature.
- Continuous spectral-coverage participants must use one explicit resolved air/vacuum wavelength basis. Do not silently convert or mix bases.
- Continuous composition intersects participant wavelength support and unions interpolation breakpoints only. It does not apply response/transmission/radiance values and does not prove numerical convergence.
- Breakpoints are interpolation structure, not quadrature weights, spectral values, uncertainty, or evidence of physical significance.
- A discrete line weight is a wavelength-integrated fraction. It is not a per-nanometre spectral-density sample.
- Discrete line integration sums already wavelength-integrated line quantities. Never multiply a discrete line by d-lambda or invent a line width unless a separate physical line-shape model explicitly requires it.
- Discrete line IDs and wavelengths must be unique/ordered, weights must be positive and normalized to one, and wavelength basis must be resolved.
- A broadband physical illumination magnitude may be distributed across normalized line fractions in the same source quantity domain. Do not reinterpret point W/sr, area W/m²/sr, directional W/m², or relative magnitude as one another.
- Calibrated source magnitude plus calibrated relative line weights still does not automatically authorize calibrated outgoing scene radiance. Material/visibility/transport fidelity and combined uncertainty remain separate.
- Sensor-response spectral coverage exposes support/knots only. It must not be treated as response application, photon conversion, or proof that scene/optics share the same coverage.
- RGB, blackbody approximations, unresolved spectra, and discrete lines must not enter the continuous-coverage adapter by silent conversion.

## Temporal illumination boundary

- The existing `SceneIlluminationProfile` remains the static/base source definition. Time-varying emission is an additive temporal overlay; do not mutate base source magnitude/spectrum to encode flash or flicker.
- Source waveforms use physical seconds and relative non-negative magnitude multipliers. Do not encode display brightness, EV compensation, ISO, aperture, or shutter-setting policy into a waveform.
- A time-varying source must have an explicit source↔waveform registration to the capture `first-opening-boundary-phase` reference. Do not infer synchronization from readout direction, shutter mechanism, waveform frequency, or timestamps from another clock.
- Sensor data-readout timing is not exposure timing. Never use total readout duration as a flash/flicker phase proxy.
- Aperiodic waveforms are zero outside declared support in schema 0.1.0. Periodic waveforms must close continuously at exactly one declared period.
- Numeric waveform samples require reusable-data or Photivra-owned evidence. Calibrated waveforms require quantified relative uncertainty; calibrated registration requires quantified absolute timing uncertainty in seconds.
- Local exposure integration consumes authoritative `CaptureExposureWindows` samples and uses deterministic midpoint quadrature. It integrates relative modulation only; source magnitude, material/visibility transport, optics, sensor response, and photon/electron formation remain separate.
- Source enabled/disabled state is separate from waveform value. Do not use zero waveform magnitude as the only representation of a disabled source.
- Temporal quadrature convergence/error is a downstream radiance-domain question. Do not invent a waveform-only error bound for the final image.
- Temporal illumination must not choose ISO/aperture/shutter or implement metering/automatic-exposure policy. It supplies upstream light-state evidence only.
- A scene-radiance provider that declares `illuminationTemporalProfileId` must bind the matching temporal profile; a provider without that declaration must not silently consume one.

## Exposure metering boundary

- Exposure metering must consume a declared pre-exposure domain. Schema 0.1.0 supports only `relative-pre-exposure-linear-signal` and is approximation-only; never relabel it calibrated luminance, scene spectral radiance, or sensor-plane irradiance.
- Metering coordinates are normalized over the physically oriented **active capture** frame. Final output crop/CSS/display geometry must not silently redefine the metering frame.
- Sample `areaWeight` is producer-supplied spatial measure; metering policy weights multiply it rather than replace it.
- Multi-zone, center-weighted, spot, and highlight-weighted profiles are generic explicit policies. Do not use manufacturer names or claim they reproduce a specific camera without calibration/evidence.
- A relative target value is profile policy. Do not hard-code or describe one target (including 18% gray) as universal camera truth.
- Metering must occur before exposure settings, white balance, tone mapping, display gamma, sharpening, and final-display brightness. Never feed final preview brightness back into the authoritative meter.
- Exposure compensation is downstream of the base meter result. Do not mutate sampled scene measurements when compensation changes.
- #100 metering does not choose aperture, shutter or ISO. #99 owns exposure-mode/control resolution.
- A zero-signal meter result must remain an explicit no-signal state; do not emit infinity/NaN or fabricate a reachable exposure.
- `measurementId` and `sceneStateId` are stable identity seams for future AE lock and stale-result rejection. Do not overwrite a newer scene-light result with an older meter result merely because it completed later.
- Controlled relative-light invariant: uniform 0.5× scene signal must shift the meter by exactly +1 stop to the same declared target.
- Flash/TTL metering remains separate from ambient exposure metering. Time-varying ambient inputs require an explicit temporal sampling policy rather than silent averaging.

## Scene-radiance metering bridge

- Spectral scene radiance does not become a scalar exposure-meter signal by type conversion. A scalar relative reduction must declare an explicit approximation derivation; schema 0.1.0 does not authorize calibrated spectral weighting, photopic luminance, or camera-specific meter response.
- Scene-radiance-derived meter samples must bind one exact provider, scene, illumination profile, material-response profile and derivation profile. Provider material fidelity must match the supplied material profile.
- If a provider declares `illuminationTemporalProfileId`, a metering sample must supply the matching temporal profile and an explicit finite capture time on `first-opening-boundary-phase`. Static providers must not silently consume temporal profiles/timestamps.
- Temporal source bindings referenced by the temporal profile must exist in the supplied base illumination profile.
- Time-varying metering must not silently average snapshots. Use an explicit temporal policy.
- The first temporal policy is a positive normalized weighted average of **linear pre-exposure meter signals**. Average signals first; do not average EV/stop offsets.
- All samples in one temporal average must share the same committed `sceneStateId`, provider/material/derivation context, temporal profile, and active-capture geometry. This is also the stale-result boundary.
- Temporal sample weights are caller-declared measurement policy. Do not infer them from flicker frequency, source waveform shape, shutter/readout duration, or renderer frame cadence.
- Flash/TTL metering remains separate from ambient/time-varying exposure metering.
- Calibrated meter spectral weighting remains future work and requires an explicit spectral-response/photometric model plus evidence; do not infer it from RGB or scene-radiance wavelength samples.

## Generic equipment exposure-capability boundary

- Keep equipment **capability** separate from selected camera state and from #99 exposure-control resolution. Capability profiles describe what settings are available; they do not choose a setting.
- Do not repurpose or silently reinterpret the legacy `CameraConfiguration` / `parseCameraConfiguration()` contract. New #109 profiles are additive and versioned.
- Normal product body/lens profiles are generic Photivra identities, not named commercial equipment emulations. Real-world evidence may inform profile design, but named manufacturer/model identity is not required for the engine contract.
- Body exposure capability owns shutter-duration capability and ISO capability. ISO range/grid does not imply noise, analog gain topology, photon count, conversion gain, or sensor performance.
- Auto ISO availability must preserve `supported`, `unsupported`, and `unknown` as distinct states. Unknown must not be treated as supported.
- Shutter-duration capability does not imply shutter mechanism, rolling/global readout, exposure-boundary schedule, or flash-sync behavior.
- Lens aperture capability uses **widest available f-number** (smallest f-number) and **narrowest available f-number** (largest f-number) to avoid ambiguous max/min-aperture language.
- Focal-dependent widest f-number is an explicit capability curve. Do not infer it from zoom range, focal length, or lens class.
- Discrete setting grids must be strictly increasing and stay inside the declared capability range. Continuous grids mean the downstream resolver may choose any finite value within the range; they do not imply a physical infinitely precise control mechanism.
- Resolve aperture capability at the selected focal length before #99 validates/quantizes settings. A discrete aperture grid may be filtered by the resolved wide-open limit.
- Source equipment profiles are immutable inputs. Resolvers must not mutate them when focal length or selected state changes.
- #109 capability resolution does not select aperture/shutter/ISO. #99 consumes the resolved envelope and owns manual/automatic axis policy, quantization choice, clamping, and residual exposure diagnostics.

## Manual / Auto ISO exposure-control boundary

- #99 exposure modes are control policy over the existing aperture/shutter/ISO exposure variables; do not add a second exposure equation per named mode.
- In the first Manual slice, aperture and shutter are always manual axes and must never be changed, clamped, or safety-shifted by the resolver. Unsupported manual settings fail closed.
- Manual ISO is likewise preserved exactly after #109 capability validation. A changed meter target or exposure compensation may change the residual diagnostic but must not change the manual ISO value.
- Auto ISO may change only ISO. It must consume the typed #100 meter target and the resolved #109 ISO capability; it must not re-meter the scene or reapply exposure compensation.
- The relative meter target does not define an absolute ISO. Require an explicit reference exposure anchor `(aperture, shutter, ISO)`; do not assume ISO 100, a universal gray calibration, or any hidden camera baseline.
- Reference-anchor aperture/shutter/ISO must themselves be valid settings in the same resolved equipment capability envelope.
- Auto ISO ideal value is solved from target exposure scale divided by the manual optical-exposure factor relative to the reference anchor. ISO does not create photons and this resolver must not infer noise, conversion gain, or sensor topology.
- For discrete ISO grids, quantize in log2 exposure space. The first policy is nearest value with lower ISO on an exact tie; do not silently use a universal 1/3-EV or 1/2-EV grid.
- Auto ISO limit/quantization diagnostics must preserve signed residual stops: positive residual means the resolved settings are still under target and need more exposure; negative means over target.
- `unsupported` and `unknown` Auto ISO capability both block automatic ISO; unknown must never be treated as supported.
- A no-signal meter target blocks Auto ISO rather than selecting maximum ISO or infinity. Manual settings may still be returned with an unresolved target diagnostic.
- Flash behavior, minimum-shutter Auto ISO policy for modes with automatic shutter, safety shift, Program lines, aperture priority, shutter priority, and Full Auto remain outside this first resolver slice.

## Aperture Priority exposure-control boundary

- In the first Aperture Priority slice, aperture and ISO are manual axes and must never be changed, clamped, or safety-shifted by the resolver. Unsupported manual settings fail closed.
- Shutter is the only automatic axis. Reuse the same relative target/reference exposure model as Manual + Auto ISO; do not add a mode-specific exposure equation.
- The resolver consumes exposure compensation only through the already-compensated #100 target. Never apply compensation a second time.
- Continuous shutter capability returns the ideal finite duration when it lies inside the #109 range.
- Discrete shutter grids quantize in log2 duration/exposure space. The first policy is nearest duration with the **shorter shutter on an exact tie**.
- Shutter residual diagnostics use the same sign convention as ISO: positive residual means still under target / needs more exposure; negative residual means over target.
- A required shutter shorter than the minimum duration clamps to the shortest available duration and reports `shutter-minimum`; longer than maximum clamps to the longest duration and reports `shutter-maximum`.
- A no-signal meter target blocks automatic shutter rather than selecting the longest shutter or infinity.
- Aperture Priority + Auto ISO is a separate later policy because two automatic axes require an explicit minimum-shutter/selection rule. Do not assume ISO always moves first.

## Multi-axis priority-mode boundary

- When two exposure axes are automatic, require an explicit versioned selection policy. Do not hide axis order inside a mode name.
- Aperture Priority + Auto ISO first uses minimum selectable ISO. Shutter may lengthen only to the declared `slowestPreferredShutterSeconds`; after that ISO fills exposure. Behavior after ISO maximum must be explicit: either allow slower shutter or hold the preferred shutter and report residual underexposure.
- A+Auto ISO discrete shutter selection before ISO fill must not choose a shutter longer than the target/preferred duration, because that would require ISO below the declared minimum to undo overexposure.
- Shutter Priority + manual ISO keeps shutter and ISO fixed and resolves only aperture.
- Shutter Priority + Auto ISO first uses minimum selectable ISO and resolves aperture. For discrete aperture grids, choose an aperture no wider than the ideal so Auto ISO can add remaining exposure instead of requiring ISO below minimum.
- Automatic aperture limits use `aperture-widest`, `aperture-narrowest`, or `aperture-grid-quantization` diagnostics; do not infer lens behavior beyond #109.
- These policies are generic product/control approximations, not optical laws and not emulations of named manufacturers.
- All priority modes must reuse the typed #100 target, explicit reference exposure anchor, and #109 resolved capability envelope; never re-meter or reapply compensation.
- Flash policy, safety shift, Program lines, Full Auto policy, Bulb/Time, and manufacturer-specific mode behavior remain separate.

## Program / Full Auto exposure boundary

- Program Auto and Full Auto require an explicit versioned program-line policy. There is no unique physically correct aperture/shutter pair for a target exposure.
- Program-line nodes declare optical exposure stops relative to the same explicit reference exposure anchor used by other #99 modes. Validate every node's aperture/shutter pair against its declared stop coordinate and the current #109 capability envelope.
- Interpolate program-line aperture and shutter in log2 space so intermediate optical exposure stops remain mathematically consistent before equipment quantization.
- Program-line nodes may describe ideal continuous policy points; downstream #109 grids still own actual selectable settings. Quantization/clamping must remain visible in diagnostics.
- Program Auto with manual ISO resolves aperture+shutter only. Program Auto with Auto ISO and Full Auto exposure start from minimum selectable ISO and let Auto ISO absorb program-line endpoint/quantization residual when possible.
- A program line is generic product/control policy labeled approximation. Do not describe it as a scientific law or a named manufacturer's program behavior without evidence for that exact profile.
- Full Auto **exposure** means automatic aperture+shutter+ISO only. It must not imply or report autofocus, white balance, flash, drive, scene recognition, or stabilization resolution.
- Program/Full Auto must consume the already-compensated #100 target and must not re-meter or reapply exposure compensation.
- Identical resolved aperture/shutter/ISO values must feed identical downstream physics regardless of whether they came from Program or Full Auto.
- Flash-aware program shifts, safety shift, and broader application Full Auto behavior remain separate.

## Bulb / Time and long-exposure boundary

- Bulb and Time are shutter-duration **control behaviors**, not alternate exposure equations and not shutter mechanisms.
- A physical exposure calculation must receive a concrete positive elapsed duration. An active Bulb/Time control with no terminating release/stop event is not authorized for image-formation integration.
- Bulb duration is release time minus press/start time; Time duration is stop action minus start action. Control timestamps use one explicit monotonic-seconds reference and must be finite/ordered.
- Do not encode Bulb as an arbitrary enormous fixed shutter speed and do not impose a universal 30 s limit on Bulb/Time.
- Binding a resolved duration into #12 may set only the nominal seconds-valued exposure duration. Preserve the independently supplied shutter mechanism and opening/closing boundary schedules.
- Bulb/Time must not imply mechanical shutter, focal-plane curtains, tripod support, stabilization off, long-exposure noise reduction, sensor heating/temperature, or flash behavior.
- Once resolved, long duration flows through the same existing/future local exposure-window, temporal motion/radiance, electron accumulation, dark-current, saturation, and downstream models. Do not create Bulb-specific physics shortcuts.
- Equal elapsed durations with equal physical camera/scene inputs must produce equal downstream timing/physics regardless of fixed/Bulb/Time control vocabulary.
- More generally, shooting-mode names are control policy only: identical resolved aperture/shutter/ISO values must produce identical downstream physical exposure results.

## Meter target / compensation boundary

- Freeze meter results into a separate target object before #99 control resolution; do not pass mutable renderer/app state as the authoritative exposure target.
- Preserve source measurement ID, scene-state ID, and metering-profile ID by value so AE lock can intentionally reuse a prior meter snapshot after recomposition or scene-light changes.
- Exposure compensation is downstream of the base meter measurement. Never mutate `meteredRelativeSignal` or the source meter result when compensation changes.
- Compensation is an absolute control setting, not an incremental delta accumulator. Re-derive from the uncompensated base target on every update.
- Positive compensation means **more requested exposure**; negative compensation means less.
- A compensation change must receive a new target ID so changed control state cannot hide behind the same identity.
- No-signal remains unresolved under compensation; do not manufacture infinity/NaN or a fake reachable target.
- #100 target/compensation code must not choose aperture, shutter, or ISO. #99 owns axis resolution and capability constraints.

## Scene-radiance → sensor-irradiance optical bridge

- #110 owns the primary intended optical-radiometry path from outgoing scene spectral radiance to **pre-sensor-stack sensor-plane spectral irradiance**. Do not reinterpret relative RGB preview values as this physical quantity.
- The first model is a declared paraxial circular-pupil approximation. Its geometric acceptance is `pi / (4 * N_working^2)`; keep this labeled approximation and do not promote it to a full ray-traced pupil solution.
- Nominal f-number, working f-number, optical transmission, and T-stop are distinct. Do not infer real transmission from f-number.
- Wavelength-resolved transmission and effective working-T-stop approximation are mutually exclusive input paths. Never apply both.
- An effective **working** T-stop must not be smaller than the geometric working f-number in this passive-optics approximation.
- At finite focus, do not silently use infinity-focus f-number. The ideal symmetric thin-lens path may use `N(1+m)` only with unity pupil magnification explicitly declared; otherwise consume an evidence-backed supplied working f-number/profile.
- Optical spectral curves are numeric reusable data. Their provenance must be reusable-data or Photivra-owned; factual-reference-only evidence is insufficient for copied numeric curves.
- Preserve the exact wavelength basis. Do not implicitly convert air ↔ vacuum coordinates.
- Field throughput/vignetting is applied at most once. The bridge does not add a universal `cos^4(theta)` term on top of a supplied field-throughput result.
- Geometric distortion area/Jacobian radiometry is not silently corrected here. A later composition must own it exactly once.
- PSF/diffraction redistributes energy downstream; do not use a non-normalized PSF as an extra throughput scalar after #110 transmission/vignetting.
- The bridge stops before sensor cover glass/OLPF/microlens/CFA/QE/responsivity. Sensor optical-stack collection remains #14 ownership.
- Flare, ghosts, veiling glare and scatter are stray-light contributions, not primary transmission; keep them outside #110.
- Current #85 scene-radiance results remain approximation-only, so even calibrated lens-transmission data cannot authorize a calibrated final sensor-plane irradiance claim yet.
- Identical physical/time/wavelength inputs must produce deterministic output. Do not time-average time-varying radiance inside this static sample bridge.

## Radiometry and sensor-metadata rules

- Sensor architecture metadata is descriptive and scientifically inert until a separate downstream model consumes it.
- Unknown sensor facts must remain unknown; do not infer BSI, stacking, CFA, readout, or performance from adjacent marketing claims.
- Evidence source origin and reuse rights are separate concepts. Public availability is not reuse permission.
- Multi-valued capabilities must carry evidence per value when sources differ.
- Geometric sample pitch is not photosite photon-collection area. Radiometry requires explicit collection-area semantics.
- `assessRadiometryReadiness()` is a gate, not a photon model. `calibrated-ready` does not prove the calibration is factually correct and never enables composed photon/noise output by itself.
- Approximate representations must remain labeled approximation; never upgrade them to calibrated merely because all prerequisite categories are present.
- Calibration/data artifacts must retain stable identifiers, hashes, evidence, reuse status, and uncertainty/limitation metadata.
