# Architecture

Release context (dated historical note): this page was written for the **package 1.2.0 candidate / root API 1.2.0**. It has not been re-reviewed for later releases; see the [changelog](../CHANGELOG.md) for the current release. Subsystem and model versions, and dated introduction or measurement records below, are independent historical identities. They are not distribution versions. See [developer navigation](DEVELOPERS.md) and the [release contract](RELEASE_1_2_0.md).

Photivra keeps a reusable scientific core separate from optional composition and transport layers. This page describes those layers and the boundaries between them.

## Current root package

The browser-safe root package owns:

- camera, sensor, lens, exposure, focus, scene and motion contracts, each with explicit units;
- additive sensor-foundation contracts that keep the physical imaging area separate from the native effective image raster;
- deterministic camera, optics, exposure and crop calculations;
- the explicitly approximate stabilization-equivalent camera-shake model;
- sensor signal/noise primitives;
- schema and runtime validation;
- provenance and optional uncertainty/quality contracts;
- the composed `simulatePocCamera()` proof-of-concept (POC) calculation.

The root package has no runtime npm dependencies. CI walks the root import graph and fails if Node-only modules or the `src/api` transport layer become reachable from it.

Outside the root package: a complete optical renderer, a real-camera calibration database, and a hosted comparison or optimization service. Measured private reuse and explicit generic correction and PSF (point-spread function) primitives are implemented, within their documented limits.

### Physical geometry versus digital sampling

The sensor foundation keeps physical image-formation geometry separate from digital sampling.

- `SensorImagingArea` is the light-sensitive imaging area used for image formation.
- `NativeImageRaster` is the grid of effective image samples. One image sample does not have to be one physical photodiode.
- Derived sampling pitch is geometric spacing only. It is not fill factor and not photon-collection area.

Capture geometry builds on that foundation without changing the native sensor's identity:

```text
physical imaging area + native raster
              ↓
native active-capture rectangle
              ↓
physical camera orientation
              ↓
oriented active capture
              ↓
digital/output crop
              ↓
output raster
```

Native coordinates have a top-left origin, +X right and +Y down. They do not change when the camera is physically rotated. Exact point, vector and half-open rectangle transforms map between native and oriented capture coordinates for 0°/90°/180°/270° rotations. This keeps CFA (colour filter array) phase, rolling-readout direction, motion vectors and camera-shake transforms tied to one stable sensor coordinate system. Display and file transforms stay separate from physical capture orientation.

Active capture keeps its physical bounds and its center offset from the optical axis. Off-center crops therefore get asymmetric angular bounds; they are not silently recentered. Output raster resampling must keep the output crop's aspect ratio; hidden geometric stretching is rejected.

Equivalent focal length is also derived from physical capture geometry, not stored as part of the lens identity. Physical `focalLengthMm` stays authoritative. Diagonal-based 35 mm equivalence is derived from the active physical capture area. Focus distance and the final digital/output crop do not change this conventional equivalent value.

### Sensor architecture metadata

Sensor architecture is a separate descriptive layer. Illumination (FSI/BSI — front- or back-side illuminated), integration/stacking, readout capabilities and colour-sampling family are independent facts, each backed by evidence.

- These facts alone have no effect on image quality in the engine.
- Where evidence came from is modelled separately from the right to reuse it.
- Scalar facts may cite several evidence records. Capabilities with several values carry evidence per value.
- Omitted facts stay unknown; they are not guessed.

Capture-mode behaviour, readout timing, reconstruction and calibrated radiometry use these facts only through later, explicit models.

### Colour-sampling topology

Exact colour-sampling topology is yet another separate layer.

`SensorColorSamplingProfile` can describe monochrome, or any periodic mosaic, on an abstract lattice of native sensor sampling sites. Layered colour uses a separate, unresolved spatial reference and stays structural-only until per-layer spatial sampling is modelled.

This lattice is deliberately not `NativeImageRaster`. A separate, evidence-backed binding says how capture-mode effective samples relate to colour-sampling sites. As a result, active crop, orientation and output transforms cannot reset the periodic CFA phase, and architecture-family metadata cannot make up an exact tile.

### Raster-to-colour-site binding

That binding is explicit in the native-effective-raster / colour-site foundation.

- One evidence-backed profile ties one exact canonical native effective raster to regular, sensor-anchored blocks of colour sites.
- A second resolver combines that relationship with a selected capture mode.
- Grouped modes need a separately evidenced full-frame grouping phase. They use absolute full-frame mode indices and return compact pre-reconstruction source rectangles plus channel-site counts.
- Matching dimensions alone never create a binding.
- Pixel-shift metadata does not re-phase the CFA, because the sensor and its filter move together. Its effect on optical registration is a later spatial-sampling concern.
- Declared-effective capture modes and unresolved layered layouts fail closed; they do not get guessed mappings.

### Sensor optical stack

Sensor optical-stack metadata is a separate layer earlier in the chain.

`SensorOpticalStackProfile` records the ordered roles of physical components and whether microlenses are present. This is kept separate from the effective anti-aliasing (AA) spatial response. Four AA states stay distinct: unknown, documented absent/cancelled, present but unresolved, and an explicit normalized point-splitting kernel.

The first kernel is defined in native sensor physical space, does not vary with field, wavelength or polarization, and is spatial only. It does not include throughput, spectral filtering, cover-glass refraction, microlens collection or whole-stack PSF composition.

This prevents an OLPF (optical low-pass filter) from turning into a universal Gaussian or four-ray blur, and prevents descriptive filter or microlens metadata from quietly changing image formation.

### Sampling aperture

The physical sampling aperture is a separate prerequisite for CFA/site sampling, later in the chain.

`SensorSamplingApertureProfile` explicitly registers the regular lattice of colour-site centers in native sensor physical coordinates. It can declare a first geometric approximation of the sensitive region as a uniform rectangle.

- Site pitch and origin are never derived from `NativeImageRaster`.
- Aperture dimensions and offset are never guessed from pitch or a scalar fill fraction.
- The derived geometric sensitive-area fraction is a diagnostic only.
- AA redistribution, microlenses, charge diffusion/crosstalk, spectral response, QE (quantum efficiency), optical throughput, radiometric collection area and physical photodiode geometry stay separate models. Spatial sampling can then combine them deliberately, without counting anything twice.

### Spatial quadrature and reduction

The spatial-quadrature foundation is the first explicit combination of AA redistribution and geometric aperture support. ("Quadrature" means numerical integration with chosen sample points and weights.)

- It samples the pre-AA optical field in reverse (inverse sampling).
- The destination CFA channel stays authoritative.
- It returns both normalized-average and geometric-area measures.
- Optical support that falls off the imaging area is kept, not clamped.

It still evaluates no optical or radiometric values, and stays separate from temporal quadrature, microlens response, diffusion/crosstalk, RAW generation and reconstruction.

The spatial-sample reducer applies those quadrature weights to explicitly supplied non-negative linear values.

- Values can be a dimensionless relative irradiance proxy, or physical sensor-plane irradiance in W/m².
- Values are matched by node identity, not by position.
- Both average and area-integral meanings are preserved.

CFA channel labels stay metadata until a later spectral-response model. Temporal exposure, photons/electrons, noise, ADC and RAW/reconstruction come later.

### Spectral response and spectral quadrature

The spectral-response foundation adds the next, channel-specific metadata layer. It binds exact topology channel IDs to reusable wavelength-dependent data, in one of three forms:

- effective EQE (external quantum efficiency);
- A/W responsivity (amps of photocurrent per watt of light);
- explicitly separable channel-filter × detector-EQE.

Wavelength basis, range, interpolation and response scope stay explicit. A direct effective response is not decomposed without evidence. Response that depends on conditions is not modelled. Separate spectral, EQE and temporal APIs do the explicit integration, without widening this profile resolver.

The spectral-quadrature foundation plans the wavelength dimension without integrating any signal.

- It splits an explicitly requested, response-supported interval at the sensor-response knots, plus optional caller-supplied breakpoints from the continuous spectrum or optics.
- It then uses bounded, equal-width midpoint subintervals, with dλ in nanometres.
- The result keeps the response kind, scope, uncertainty and evidence.

It does not apply response values, establish common scene/optics/sensor spectral coverage, or calculate photons, electrons, current or RAW values. So QE and A/W remain separate downstream signal paths, response scope must later match the source plane, and discrete line spectra stay outside the continuous-density quadrature contract.

### Spatio-spectral reduction

The spatio-spectral reducer combines the spatial and wavelength measures against explicitly supplied E_lambda(x,y) in W/m²/nm.

- Spatial plans carry their exact `colorSamplingProfileId`, so composition can require matching profile identity rather than matching channel names by coincidence.
- The reducer validates the full spatial × spectral Cartesian product and caps its size independently.
- It reports per-wavelength spatial averages and geometric-aperture spectral flux density, and integrates those pre-response quantities over dλ.

It still applies no QE, A/W responsivity, channel-filter transmission, temporal exposure, effective collection-area correction, photon/electron conversion or RAW processing.

### Response gates

The **response-application compatibility gate** checks that a response may be applied:

- It binds the response profile/channel to the exact sampling-aperture and optical-stack identities used by the spatial plan.
- It matches the response scope to an evidence-backed source reference plane.
- It distinguishes normalization to the geometric sensitive aperture from normalization to the full site or effective collection area.
- It requires explicit spatial response uniformity/separability before allowing response to be applied after spatial reduction.
- It handles response reference conditions without treating "not stated" as "does not vary".

The **response operating-range gate** comes after that structural check.

- It keeps whether linearity was characterized in incident radiant power or in irradiance.
- It requires the current wavelength basis/range and operating conditions to stay inside the declared calibration applicability.
- It records the allowed relative nonlinearity criterion.
- It distinguishes broadband-only evidence from per-spectral-bin applicability with an explicit maximum bin width.

Wavelength-dependent conversion needs per-bin validity and spatial linear superposition; broadband total power alone cannot authorize it. Exposure/full-well saturation, accumulated-charge linearity and downstream electronics linearity stay separate, because they depend on temporal integration and later signal stages.

### Photon energy and the two signal paths

The photon-energy wavelength foundation is the unit bridge for photon-domain response.

- Vacuum wavelengths use the exact SI values of h and c directly.
- Air wavelengths need a sourced phase refractive index at that exact wavelength to get the vacuum wavelength, plus explicit atmosphere compatibility, because the refractive index varies with conditions.
- Refractive-index uncertainty is kept as input metadata but is not yet propagated into photon-energy uncertainty.

The **EQE electron-rate foundation** converts photon-domain response:

- It requires the structural and operating-range gates, including explicit geometric-aperture linear superposition and per-spectral-bin input validity.
- It binds the operating-range bin identities and values back to the exact reduction.
- It requires an exact canonical binding to the response-channel data, so changed calibration numbers cannot hide behind unchanged IDs or evidence.
- It evaluates response at each wavelength node, converts each spectral power contribution to a photon rate through hν, and applies direct or explicitly separable effective EQE to get the expected electron rate.
- Wavelength contributions are added with compensated summation.

The sibling **A/W foundation** is a separate current-domain path.

- It applies spectral responsivity per wavelength bin directly to radiant-power contributions, and returns the photocurrent magnitude at the detector terminal.
- It uses the same exact canonical response-channel binding, so drifted A/W samples cannot be substituted under unchanged provenance.
- A separate electrical applicability profile binds detector bias and current-readout load to the calibration.
- It does not infer electron rate or circuit polarity. It stops before transimpedance gain, voltage, temporal charge, saturation/noise, ADC or RAW processing.

The two response paths meet only at a later temporal/electrical composition boundary. Neither may reinterpret the other's signal domain.

### From rate to charge

The **local exposure-binding foundation** starts that temporal boundary without integrating signal.

- Rate results produced by the engine keep their colour-site identity.
- The binding validates the site and channel, resolves the existing colour-site / native-effective-raster relationship, and recomputes the shutter window at the mapped native sample center.
- The first binding accepts only one-to-one site/sample registration. Grouped multi-site blocks do not prove timing coordinates below one sample.

The **constant-rate temporal-integration foundation** then requires an evidence-backed declaration that the rate is stationary, tied to that exact rate domain, site, binding ID and local start/end window. Only then may rate × duration be evaluated.

- EQE gives expected photon/electron counts, without random sampling.
- A/W gives photocurrent charge magnitude, without guessing a carrier count.

The **dark-current foundation** starts completing the charge picture, for the EQE path only.

- It integrates an evidence-backed thermal electron rate (before any compensation) over the exact local exposure, and keeps temperature applicability explicit.
- Exact reference values and measured piecewise-linear temperature tables are supported. No universal exponential temperature law is assumed.
- Population-mean dark current is an approximation. It does not imply modelling of DCNU (dark-current non-uniformity) or hot pixels.
- A/W photocharge stays outside electron-storage/full-well meanings until a separate carrier/storage mapping exists.

The **accumulated-charge foundation** binds the photo signal, dark charge, and every explicitly incremental extra stored-electron contributor to one exact local exposure event. A separate evidence-backed completeness profile must list the supplied extra-component IDs and assert that every material stored-electron contributor is accounted for.

### Two kinds of saturation

The **physical charge-capacity foundation** compares that complete **expected** stored-electron total with an evidence-backed storage-capacity profile, tied to site, operating state and temperature applicability.

- It reports the ratio and headroom, and whether the unsaturated expected charge is below, at or above capacity.
- It does not clamp charge, calculate nonlinear storage after saturation, infer blooming or transfer to neighbours, or claim the random saturation state is known.

The **camera saturation-capacity foundation** separately compares the dark-corrected, photo-generated electron-equivalent signal with an evidence-backed saturation capacity of the camera's response chain.

- It deliberately does not use total stored charge or physical full-well capacity.
- The capacity may reflect an earlier analog or digital limit, but the first contract does not infer which stage limits, the ADC code, or behaviour after saturation.

Physical storage capacity and camera saturation are therefore parallel assessments in different calibrated domains. They are not one shared clamp.


## Image-formation ownership and ordering

The root package exports `getImageFormationContract()`. It is the canonical map of meaning for current and future image-formation work.

It defines six scientific domains:

1. scene/ray geometry;
2. scene-radiance formation;
3. lens mapping plus pupil/throughput;
4. field- and wavelength-dependent PSF;
5. time-dependent exposure/readout;
6. sensor sampling through orientation/output/display.

The graph shows **dependencies and ownership**. It is not a literal list of renderer filters. Hard upstream dependencies have no cycles. Explicit couplings record interactions that must not be split into independent post-effects.

Important consequences:

- Illumination-source metadata is an upstream input to scene-radiance formation. It is not a sensor shortcut or an RGB overlay after rendering.
- Outgoing scene spectral radiance is different from `SceneRadiometry` luminance anchors, from source spectra, and from sensor-plane irradiance.
- Focus breathing belongs to projection/lens mapping.
- Lateral CA (chromatic aberration) is a wavelength- and channel-dependent field mapping.
- Illumination vignetting affects throughput only.
- Mechanical/pupil vignetting can affect both throughput and PSF/bokeh.
- Diffraction belongs to the pupil/PSF domain.
- Camera rotation should be parameterized by time, so global and rolling readout use one motion model.
- Exposure duration and readout timing stay independent.
- Sensor ordering runs from optical stack/CFA sampling through charge, noise, ADC and reconstruction, before oriented/output transforms. Plan 0.7.0 runs this bounded, declared environment route; unsupported effects still block.

Renderers may optimize or approximate only if they keep the engine-owned meaning. Geometric warps use inverse destination-to-source sampling, premultiplied alpha, and stable depth/occlusion order.

See `docs/IMAGE_FORMATION.md`.

### Scene light

The standalone `parseSceneIlluminationProfile()` foundation provides:

- stable, renderer-independent identities for point, spot, area, directional and environment sources;
- binding to scene objects;
- source-specific meanings for magnitude;
- continuous-spectrum provenance;
- explicit approximation boundaries.

It stops before material, visibility and light-transport evaluation, so the `scene-radiance-evaluation` stage is only partly founded. See `docs/SCENE_RADIANCE_AND_ILLUMINATION.md`.

The additive **scene-radiance provider boundary** defines material-response metadata, provider fidelity, exact surface/environment evaluation requests, and validated outgoing spectral-radiance results.

- The engine validates identities, units, provenance, wavelength/time/direction meanings and declared fidelity.
- It does not implement the renderer and does not recompute the provider's transport result.
- Provider/result schema 0.1.0 is approximation-only, even when calibrated spectral material inputs are present. On its own it cannot satisfy a calibrated scene-radiance claim.
- RGB/PBR material inputs stay explicit approximation data. Wavelength-changing material behaviour, emission, volumetrics and polarization are not modelled.

The **shared spectral-composition foundation** separates two mathematical domains:

- **Continuous spectral factors** declare a resolved air/vacuum basis, finite wavelength support and interpolation breakpoints. Composition intersects the supports and unions the breakpoints, without applying values.
- **Delta-like discrete lines** carry normalized, wavelength-integrated line weights. They are integrated by summing line contributions, with no dλ multiplier.

A sensor-response adapter exposes the existing response support and knots to the shared continuous plan. The illumination layer exposes continuous source support, or discrete-line source measures, without stretching one representation into the other.

The **temporal illumination foundation** adds time-varying relative source modulation on top of the existing static illumination profile, without changing that base schema.

- Waveforms are aperiodic or periodic piecewise-linear multiplier data, with evidence and uncertainty.
- Each time-varying source needs an explicit registration that maps the waveform's local t=0 onto the existing capture reference `first-opening-boundary-phase`.
- Evaluation and local-exposure integration use physical seconds from that reference. Sensor data-readout timing stays independent.
- The temporal layer never chooses shutter, aperture or ISO. Downstream metering and automatic exposure can see the changed light before exposure without creating a display-brightness feedback loop.

### Metering

The first **exposure-metering foundation** reads an explicitly relative **pre-exposure linear signal** sample set over the physically oriented active capture frame.

- It is approximation-only. It does not reinterpret the samples as calibrated luminance, spectral radiance or sensor-plane irradiance.
- Generic multi-zone, center-weighted, spot and highlight-weighted profiles state their weighting policy directly.
- The declared relative target is a profile policy, not a universal grey-card truth.
- The meter returns a stable measurement/scene-state identity, plus the stop offset needed to reach that target.

Final output crop, tone mapping/display gamma, exposure compensation, and automatic aperture/shutter/ISO resolution stay separate. Exposure control (#99) should read this typed result, not renderer-specific buffers.

The additive bridge from the scene-radiance provider (#85) to metering (#100) checks that a relative meter sample set is bound to one scene-radiance provider, illumination profile, material-response profile and derivation profile.

- The scalar reduction stays explicitly supplied by the renderer or provider. Spectral scene radiance cannot be collapsed into a camera exposure-meter scalar without a declared spectral/colour weighting model.
- Schema 0.1.0 therefore labels the reduction uncalibrated/approximate, instead of inventing photopic or camera-specific weighting.
- If the provider binds temporal illumination, each sample set also needs a finite capture time on the shared `first-opening-boundary-phase` reference.
- A separate temporal-metering function may combine several such measurements, but only under an explicit positive, normalized, weighted time-average policy. It averages the linear meter signal first and derives the stop offset afterwards.
- Mixed scene-state, provider or geometry contexts fail closed.

### Scene radiance to sensor irradiance

`calculateSceneRadianceToSensorIrradiance()` (#110) is the first physical primary-optics bridge. It takes one validated outgoing spectral-radiance sample from the scene-radiance provider and returns spectral irradiance before the sensor stack.

- It keeps the request/result time and wavelength identity.
- It applies a paraxial circular-pupil acceptance term using an explicit working f-number.
- It then applies exactly one transmission path and at most one field-throughput result.
- Wavelength-resolved transmission and an effective working T-stop are mutually exclusive, so transmission loss cannot be counted twice.

Finite focus is handled explicitly:

- Infinity focus uses the nominal f-number.
- The ideal symmetric thin-lens approximation may use `N_working = N(1+m)` (m = magnification), but only with unity pupil magnification declared.
- Real or generic profiles may instead supply an evidence-backed working f-number.

The bridge deliberately adds no universal cos^4 falloff, no distortion/Jacobian brightness correction, no PSF energy redistribution, no sensor optical-stack/microlens/CFA/QE response, and no stray light. Its output is wavelength-resolved incident irradiance at the sensor plane, in W/m²/nm, for the sensor stages (#14) and other downstream users.

### Meter target and compensation

The meter-target step freezes a spatial or temporal metering result into a stable value object for exposure control.

- The frozen snapshot keeps the measurement ID, scene-state ID and metering-profile ID. AE (auto-exposure) lock can then deliberately keep one target while later scene states change.
- Exposure compensation is a separate absolute-stop shift applied to that frozen base target. It never rewrites the original meter measurement, and a changed compensation state gets a new target ID.
- Positive compensation asks for more exposure.
- No signal stays unresolved; it does not become infinity.

Choosing aperture, shutter and ISO is entirely the job of exposure control.

### Equipment capabilities

The first equipment-capability layer (#109) adds separate generic Photivra body and lens exposure profiles, instead of extending the legacy selected-state `CameraConfiguration`.

- Body profiles own shutter-duration and ISO capability ranges/grids, and Auto ISO availability.
- Lens profiles own focal-length capability and aperture capability, including the widest available f-number at each focal length.
- `resolveGenericEquipmentExposureCapabilities()` combines them at one selected focal length and returns an immutable exposure envelope for exposure control.

It does not choose aperture, shutter or ISO, model ISO noise/gain topology, infer shutter mechanism or readout, or claim to emulate named commercial equipment. A generic product profile's identity and version is the normal way to state applicability.

### Exposure modes

Exposure control (#99) is built in layers. Each one reads the capability envelope and the frozen meter target.

**Manual and Manual + Auto ISO.**

- Aperture and shutter are always manual.
- ISO is either kept as set (manual), or automatic.
- The relative meter target does not define an absolute ISO by itself. The resolver therefore needs an explicit reference exposure anchor `(aperture, shutter, ISO)`. The target scale and the current manual optical exposure are both measured relative to that anchor.
- Auto ISO then resolves only ISO, applies the declared equipment range/grid, and reports the signed residual in stops plus the limiting constraint.
- Manual ISO never changes when compensation changes; only its meter-residual diagnostic changes.
- ISO stays a nominal exposure-index/gain-control decision. It does not imply sensor noise, conversion gain, photons or analog topology.

**Aperture Priority with manual ISO** adds no new exposure equation.

- Aperture and ISO are validated manual axes; shutter is the only automatic axis.
- The ideal shutter duration comes from the same relative target and reference anchor used by Manual + Auto ISO, then is limited by the shutter envelope.
- Continuous grids keep the ideal duration. Discrete grids quantize in log2 duration space; ties go to the shorter duration.
- Shutter limits and grid quantization report signed residual stops.
- Exposure compensation is already inside the typed target and is never applied again.

**Other priority combinations** are added before Program/Full Auto. When more than one axis is automatic, behaviour is declared policy:

- A + Auto ISO uses the minimum selectable ISO until a named slowest-preferred shutter threshold, then raises ISO, with an explicit fallback after maximum ISO.
- S + Auto ISO picks aperture first at minimum ISO, choosing a discrete aperture no wider than the ideal, so ISO can fill the remaining exposure.
- S + manual ISO resolves only aperture.

These are generic educational/product policies, not physical laws or claims about a named camera. Every mode still resolves to the same physical variables (aperture, shutter, ISO) and reuses the common target, reference and capability maths.

**Program Auto and Full Auto** use versioned generic exposure program lines.

- A line is a sequence of control-policy nodes `(optical stops from reference, aperture, shutter)`. Each node must agree with the explicit reference exposure and the current capability envelope.
- Between nodes, aperture and shutter interpolate in log2 space, so optical exposure stops interpolate linearly before equipment quantization.
- Program Auto may keep ISO manual, or use Auto ISO to absorb residuals from line endpoints or quantization.
- Full Auto uses the same line with Auto ISO, but covers exposure only: AF, WB, flash, drive, scene recognition and stabilization are explicitly unresolved.

Program lines are product policy approximations. They are not scientific laws, and they do not claim to emulate a commercial camera.

**Fixed duration, Bulb and Time** are treated only as ways of controlling duration.

- `resolveExposureDurationControl()` returns either an active, unfinished control or a concrete positive elapsed duration.
- Only a resolved result may be bound into the authoritative exposure-window input, `CalculateCaptureExposureWindowsInput` (#12). The adapter replaces only `nominalExposureDurationSeconds`, and leaves the shutter mechanism and opening/closing schedules untouched.
- No universal 30 s limit is introduced.
- Once the seconds are known, a long exposure follows the same local exposure-window, temporal integration, motion, charge, dark-current and saturation paths as any other duration.
- Bulb and Time do not imply a mechanical shutter, tripod support, a stabilization state, long-exposure noise reduction or sensor-temperature behaviour.

## Radiometry readiness boundary

Radiometry prerequisites are kept separate from the composed POC and from the low-level signal/noise primitives. `parseRadiometryReadinessProfile()` validates declared scene spectral radiance, optical transmission, pupil/vignetting behaviour, photosite collection-area meaning, exposure integration and sensor response, together with evidence and uncertainty declarations.

`assessRadiometryReadiness()` returns one of:

- `not-ready`: one or more required components are missing;
- `approximate-only`: all required components exist, but at least one is approximate or has no quantified uncertainty;
- `calibrated-ready`: every required component is declared calibrated and carries quantified uncertainty.

These states describe only the declared package of prerequisites. They do **not** prove that the cited evidence is scientifically correct, do not derive photon counts, and never switch on photon/noise output in `simulatePocCamera()` automatically.

Geometric sample pitch is explicitly not enough to stand for a photosite's photon-collection area. A radiometric profile must supply either an effective collection area, or a geometric cell area plus an explicit fill factor. Calibration artifacts are identified by stable IDs and SHA-256 checksums, not embedded implicitly in geometry metadata.

## Composition boundary at POC API 0.20

The sensor, capture, architecture and radiometry modules are public root-engine foundations. POC simulation API 0.20 composes the geometry foundation through to final output/viewing, while keeping older callers valid.

The POC composes:

- physical sensor width/height plus native effective raster dimensions;
- shared sensor-geometry metrics, including physical crop factor, raster-derived megapixels and X/Y geometric sampling pitch;
- the legacy same-aspect centered `crop.factor` path, for compatibility;
- an opt-in staged `capture` path for physical orientation, the native active-capture rectangle, the oriented digital/output crop, and the final output raster;
- active-capture and final-output FOV, including asymmetric bounds for an off-center physical or digital crop;
- diagonal-based 35 mm-equivalent focal length derived from active physical capture, with physical focal length still authoritative;
- capture-mode equivalent-viewing CoC (circle of confusion) based on the final retained physical viewing area, not the output pixel count;
- orientation-aware subject framing after output, with explicit retained physical bounds and FOV;
- additive image-plane → native-raster conversion, plus motion and camera-shake vector diagnostics for oriented capture and final output;
- an explicit oriented-capture → output pixel scale, for renderer sampling and blur conversion;
- one representative horizontal-pitch path for existing blur/sampling calculations, with a fail-closed guard for clearly non-square sampling;
- the established projection, DOF/defocus, diffraction, motion, exposure, aperture-shape and camera-shake models.

Compatibility boundaries stay explicit:

- Staged capture geometry cannot be combined with a legacy `crop.factor` other than `1`.
- The legacy `subjectCrop` response remains for legacy mode. Staged capture reports framing after output under `capture.subjectFraming`.
- An explicit physical CoC stays the caller's choice. Equivalent-viewing CoC is a separately labelled approximation based on the final retained physical viewing area.
- Existing legacy motion and camera-shake fields keep their image-plane meaning (+X right, +Y up). Capture diagnostics explicitly convert to native raster (+Y down) before orientation.

The POC still does **not** use:

- `SensorArchitectureProfile`;
- `SensorColorSamplingProfile`;
- `NativeEffectiveRasterColorSamplingBindingProfile`;
- `SensorOpticalStackProfile`;
- `SensorSamplingApertureProfile`;
- `CaptureModeProfile`;
- `RadiometryReadinessProfile`, or calibrated photon/noise output.

That separation is deliberate. New foundation APIs should stay independently testable, and should enter the POC only through an explicit contract/version change and migration review.

## PSF/pupil foundation

The field/wavelength PSF domain has an explicit public foundation: `getPsfFoundationContract()` and `calculatePsfFoundationComponents()`.

The foundation provides:
- stable contribution IDs and their implementation/reservation status;
- field, depth, spectral and pupil context;
- the existing geometric-defocus and circular-Airy diagnostics, with their original provenance;
- an explicit `not-composed` policy.

It does not invent a combined PSF, an MTF (modulation transfer function) or a lens-sharpness score.

Future models for non-circular diffraction, mechanical pupil clipping, field curvature, field-dependent aberration and bokeh should extend this contribution/context model, not replace the existing defocus and diffraction APIs.

Preview and reference render paths may use different computational fidelity, but must keep the contribution identities and the engine-owned meaning.

## Standalone illumination-throughput foundation

The lens-field/pupil domain includes generic illumination vignetting as a field-dependent linear throughput.

The engine owns:
- physical field-radius normalization;
- the declared operating range;
- validation of the extremes across the full range;
- the linear throughput factor and the stop-loss diagnostic.

Renderers apply that factor in a linear working space. They must not reinterpret this stage as gamma-space darkening, a coordinate warp or pupil clipping.

Mechanical/pupil vignetting belongs to future pupil/PSF work, because it can change both throughput and the shape of bokeh/PSF.

## Standalone lateral-CA field-mapping foundation

The lens-field domain also provides a generic radial mapping that differs for the red, green and blue channels.

Green is the reference, shared geometric field map. A shared base distortion is combined with explicit red/blue coefficient offsets. Ordinary distortion and chromatic separation therefore stay distinct, without needing two renderer warps.

The engine owns both the forward per-channel coordinates and the inverse per-channel destination-to-source sampling. Renderers should not implement lateral CA as arbitrary channel offsets on the finished image, and should not apply the same base distortion twice.

This is deliberately not a spectral, CFA or colorimetric model. Wavelength-dependent optics, longitudinal CA, wavelength-dependent PSFs and calibrated lens profiles are separate future work.

## Standalone radial field-mapping foundation

The lens-field/pupil domain also provides generic radial distortion through paired forward and inverse mappings.

The engine — not a renderer — owns:
- coefficient normalization against a declared physical image-plane radius;
- the valid maximum normalized field radius;
- strict checks that the mapping is monotonic and invertible;
- deterministic inverse destination-to-source mapping.

This stops WebGPU/WebGL2 implementations from inventing their own distortion equations.

The radial-distortion model is centered on the optical axis only. Tangential/decentered distortion and calibrated lens profiles are future work. Lateral chromatic aberration and illumination vignetting are separate standalone foundations and are not part of the radial-distortion model.

## Standalone focus-breathing foundation

The lens-field/pupil domain has a partial standalone foundation: `calculateFocusBreathingProjection()` and `calculateFocusBreathingFieldOfView()`.

These functions apply an explicit, caller-declared scale to the ideal thin-lens projection for one focus state. They do not infer a breathing curve, identify a real lens, or change the physical focal length.

The model is standalone and is not composed into `simulatePocCamera()` yet. Generic radial distortion, lateral chromatic aberration and illumination vignetting are separate standalone foundations, and must not be silently coupled into focus breathing. Mechanical/pupil vignetting, pupil/PSF coupling and calibrated lens profiles are future work.

## Standalone spatial camera-rotation foundation

The root engine exports `calculateCameraRotationImageMapping()`. It is a low-level implementation of the image-formation contract's time-parameterized camera-rotation step.

It is deliberately **not** composed into `simulatePocCamera()` yet. The existing POC and `estimateCameraShakeBlur()` keep their backwards-compatible global shake approximation.

The primitive provides deterministic yaw/pitch/roll rotation geometry only. It does not model camera translation, stabilization control laws, rolling-readout scheduling, or parallax that depends on scene depth.

## Production image-formation composition

The production composition contract is additive and separate from `simulatePocCamera()`.

`prepareImageFormationContext()` owns fairly static, validated context:

- resolved equipment capability identity;
- scene/provider identity;
- the optical-throughput profile for the scene-radiance-to-sensor bridge (#110);
- output-geometry profile identity;
- the renderer capability declaration;
- fidelity requirements.

`createProductionCaptureSnapshot()` commits the state of one capture:

- capture, release-frame and scene-state identity;
- scene time;
- aperture, shutter and ISO;
- a deterministic capture seed;
- optional scene-radiance input (#85) plus field/focus input for the optical bridge (#110).

Prepared context and capture snapshots are copied, deeply frozen and fingerprinted. Later UI changes cannot alter a committed plan.

`createProductionImageFormationPlan()` expands required dependencies from `getImageFormationContract()`. It does not keep a second, hidden stage order. Every contract stage and effect stays visible in the plan as active, modelled-zero, omitted by fidelity, unsupported, or blocked.

The initial composer deliberately integrates only a conservative subset:

```text
scene-ray-projection semantic binding
  -> #85 scene-radiance result
  -> #110 lens/pupil/throughput evaluation
```

Asking for later stages, such as PSF, the sensor optical stack, or CFA/charge/ADC/reconstruction, produces structured `engine-stage-not-composed` blockers until those standalone foundations are deliberately integrated.

### Temporal capture

The next production-composition step adds temporal capture behaviour without inventing a new timing model. The immutable capture snapshot may now carry:

- the authoritative exposure-window input (#12);
- an invariant native sensor readout declaration;
- the physical imaging area and orientation;
- optionally, a pure camera-rotation velocity and a deterministic temporal sample count.

The plan evaluates local exposure windows and sensor readout separately. It does **not** assume those two clocks are synchronized. When rotation is supplied, it hands temporal geometry to the existing pure-rotation midpoint quadrature, and keeps the committed temporal sample count.

This does not weaken the image-formation dependency graph. `temporal-exposure-readout` still depends on `field-wavelength-psf`. Until PSF is deliberately production-composed, a fidelity profile that requires the full temporal stage can carry useful timing/rotation results while the overall plan stays blocked on that upstream stage.

A separate consumer-manifest API projects the same finalized plan into either an `interactive-optimized` or a `reference` execution role. The consumer role cannot change scientific inputs, stage order, the capture seed, or the committed temporal sample count.

### Renderers, fingerprints and seeds

Renderer declarations are capability metadata only. The plan accepts no React, Three.js or WebGPU objects. Optimized and reference renderers use the same stage/effect meanings, and must declare their spectral, depth, warp, alpha and sensor-domain capabilities.

Plan fingerprints use canonical serialization plus FNV-1a 32-bit, only as deterministic reproducibility keys. They are not security or integrity hashes.

The capture seed is explicit. Backend randomness may not redefine the scientific result. Future random stages must derive deterministic sub-seeds through an engine-owned policy.

See [Production Image-Formation Plan](PRODUCTION_COMPOSITION.md).

## Repository-local Node POC transport

The repository contains a minimal, Node-only HTTP transport under `src/api` for contributor integration testing.

It wraps `simulatePocCamera()` in an unauthenticated localhost server. The HTTP layer adds structural request validation and transport behaviour. It does not define any new camera-science equations.

This transport is deliberately **not** part of the public `@photivra/engine` package surface, and is excluded from the npm tarball. The POC server is not the intended production architecture.

## Boundaries beyond the 1.0 route

The root package already has direct primitives for extended-object motion, depth-aware translation/parallax quadrature, manual flash/sync, generic stabilization, spectral response/colour, and polygon/complex-pupil PSFs. Having these primitives does not make every combination available to the production composer.

The bounded production environment route uses declared environment radiance, ideal projection, constant-axis rotation, explicit spatial/spectral/temporal EQE, and seeded native RAW with optional output.

Outside that route: general surface intersection/visibility, world translation, calibrated commercial profiles, computational multi-frame image combination, full field-dependent PSF transport, and megapixel execution. See the [production envelope](PRODUCTION_ENVIRONMENT_CAPTURE.md) and the [composition map](V1_COMPOSITION_MAP.md).

## Repository scope

This repository contains the Apache-2.0 scientific/business-logic package, plus its tests, documentation, schemas, validation and contributor tooling.

The published npm package deliberately exposes only the browser-safe scientific root surface. Repository-local development tooling, such as the Node POC transport, stays outside the published package.

## Version surfaces

The root library, the image-formation graph, the production composition plan and the composed POC simulation are versioned independently:

| Constant | Describes |
| --- | --- |
| `ENGINE_API_VERSION` | the root browser-safe engine surface |
| `IMAGE_FORMATION_CONTRACT_VERSION` | ownership and ordering semantics |
| `PRODUCTION_IMAGE_FORMATION_PLAN_VERSION` | the production composition result contract |
| `POC_SIMULATION_API_VERSION` | `simulatePocCamera()` plus the repository-local POC HTTP transport |

Prepared-context, capture-snapshot, renderer-capability and fidelity-profile schemas also keep their own versions. Package versioning is separate from all of them.
