# Architecture

Photivra separates a reusable scientific core from optional composition and transport layers.

## Current root package

The browser-safe root package currently owns:

- unit-explicit camera, sensor, lens, exposure, focus, scene, and motion contracts;
- additive sensor-foundation contracts that separate physical imaging area from native effective image raster;
- deterministic camera/optics/exposure/crop calculations;
- the explicitly approximate stabilization-equivalent camera-shake model;
- sensor signal/noise primitives;
- schema/runtime validation;
- provenance and optional uncertainty/quality contracts;
- the composed `simulatePocCamera()` proof-of-concept calculation.

The root package has no runtime npm dependencies. CI walks the root import graph and fails if Node-only modules or the `src/api` transport layer become reachable from it.

Comparison, optimization, real-camera calibration databases, renderer effects, and full optical simulation are **not** current root-package capabilities.

The sensor foundation intentionally keeps physical image-formation geometry separate from digital sampling. `SensorImagingArea` represents the photosensitive imaging dimensions used for image formation; `NativeImageRaster` represents effective image samples and does not imply one image sample equals one physical photodiode. Derived sampling pitch is geometric spacing only, not fill factor or photon-collection area.

Capture geometry builds on that foundation without mutating native sensor identity:

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

Native coordinates use a top-left origin with +X right and +Y down and remain invariant under physical camera rotation. Exact point, vector, and half-open rectangle transforms map between native and oriented capture coordinates for 0°/90°/180°/270° rotations. This keeps later CFA phase, rolling-readout direction, motion-vector transforms, and camera-shake transforms anchored to one stable sensor coordinate system. Display/file transforms remain separate from physical capture orientation.

Active capture retains its physical bounds and center offset relative to the optical axis. Off-center crops therefore use asymmetric angular bounds instead of being silently recentered. Output raster resampling must preserve the output-crop aspect ratio; implicit geometric stretching is rejected.

Equivalent focal length is also layered on top of physical capture geometry rather than stored as lens identity. The engine keeps physical `focalLengthMm` authoritative and derives diagonal-based 35 mm equivalence from the active physical capture area. Focus distance and final digital/output crop do not redefine this conventional capture-equivalent quantity.

Sensor architecture is a separate descriptive layer. Illumination (FSI/BSI), integration/stacking, readout capabilities, and color-sampling family are independent evidence-backed facts. Their presence alone has no image-quality effect in the engine. Evidence origin is modeled independently from reuse rights, scalar facts may cite multiple evidence records, and multi-valued capabilities carry evidence per value. Omitted facts remain unknown rather than being inferred. Capture-mode semantics, readout timing, reconstruction, and calibrated radiometry consume these facts only through later explicit models.

Exact color-sampling topology is a separate layer again. `SensorColorSamplingProfile` can describe monochrome or an arbitrary periodic mosaic on an abstract native sensor sampling-site lattice, while layered color uses a separate unresolved spatial reference and remains structural-only until per-layer spatial sampling is modeled. This lattice is intentionally not `NativeImageRaster`; a future binding must establish how capture-mode effective samples relate to color-sampling sites. Active crop/orientation/output transforms therefore cannot reset periodic CFA phase, and architecture-family metadata cannot synthesize an exact tile.

That binding is now explicit through the native-effective-raster/color-site foundation. One evidence-backed profile ties one exact canonical native effective raster to regular sensor-anchored color-site blocks; a second resolver composes that relationship with a selected capture mode. Grouped modes require separately evidenced full-frame grouping phase, use absolute full-frame mode indices, and return compact pre-reconstruction source rectangles plus channel-site counts. Matching dimensions alone never create a binding. Pixel-shift metadata does not re-phase the CFA because the sensor/filter structure moves together; its optical-registration effect remains a later spatial-sampling concern. Declared-effective capture modes and unresolved layered layouts fail closed rather than receiving inferred mappings.

Sensor optical-stack metadata is a separate upstream layer. `SensorOpticalStackProfile` records ordered physical component roles and microlens presence independently from the effective anti-aliasing spatial response. Unknown AA response, documented absence/cancellation, unresolved presence, and an explicit normalized point-splitting kernel remain distinct. The first kernel is native-sensor-physical, field/wavelength/polarization-invariant, and spatial-only; it does not include throughput, spectral filtering, cover-glass refraction, microlens collection, or whole-stack PSF composition. This prevents OLPF presence from becoming a universal Gaussian/four-ray blur and prevents descriptive filter/microlens metadata from silently changing image formation.

Physical sampling aperture is a separate downstream prerequisite for CFA/site sampling. `SensorSamplingApertureProfile` explicitly registers the regular color-site center lattice in native sensor physical coordinates and can declare the first geometric sensitive-region approximation as a uniform rectangle. Site pitch/origin is never derived from `NativeImageRaster`, and aperture dimensions/offset are never inferred from pitch or a scalar fill fraction. The derived geometric sensitive-area fraction is diagnostic only. AA redistribution, microlenses, charge diffusion/crosstalk, spectral response, QE, optical throughput, radiometric collection area, and physical photodiode geometry remain separate models so spatial sampling can later compose them deliberately rather than double-count them.

The spatial-quadrature foundation now performs that first explicit composition of AA redistribution and geometric aperture support. It inverse-samples the pre-AA optical field, keeps the destination CFA channel authoritative, returns both normalized-average and geometric-area measures, and preserves off-imaging-area optical support without clamping. It still evaluates no optical/radiometric values and remains separate from temporal quadrature, microlens response, diffusion/crosstalk, RAW generation, and reconstruction.

The spatial-sample reducer now evaluates those quadrature weights against explicitly supplied nonnegative linear values. It supports either a dimensionless relative irradiance proxy or physical sensor-plane irradiance in W/m², matches values by node identity rather than position, and preserves both average and area-integral semantics. CFA channel labeling remains metadata until a later spectral response model; temporal exposure, photons/electrons, noise, ADC and RAW/reconstruction remain downstream.

The spectral-response foundation now supplies that next channel-specific metadata layer. It binds exact topology channel IDs to reusable wavelength-dependent effective EQE, A/W responsivity, or explicitly separable channel-filter×detector-EQE data. Wavelength basis/range/interpolation and response scope remain explicit, direct effective response is not decomposed without evidence, and condition dependence plus wavelength/temporal/photon integration remain unimplemented.

The spectral-quadrature foundation now plans the next wavelength dimension without performing signal integration. It partitions an explicitly requested response-supported interval at sensor-response knots plus optional caller-supplied continuous-spectrum/optics breakpoints, then uses bounded equal-width midpoint subintervals with dλ expressed in nanometres. The result preserves response kind, scope, uncertainty and evidence but does not apply response values, establish common scene/optics/sensor spectral coverage, or calculate photons, electrons, current or RAW values. QE and A/W therefore remain separate downstream signal paths, response scope must later match the source plane, and discrete line spectra remain outside the continuous-density quadrature contract.

The spatio-spectral reducer now composes the spatial and wavelength measures against explicitly supplied E_lambda(x,y) in W/m²/nm. Spatial plans carry their exact colorSamplingProfileId so composition can require profile identity rather than channel-name coincidence. The reducer validates the full spatial × spectral Cartesian product, caps it independently, reports per-wavelength spatial averages and geometric-aperture spectral flux density, and integrates those pre-response quantities over dλ. It still applies no QE, A/W responsivity, channel-filter transmission, temporal exposure, effective collection-area correction, photon/electron conversion or RAW processing.

The response-application compatibility gate binds the response profile/channel to the exact sampling-aperture and optical-stack identities used by the spatial plan, matches response scope to an evidence-backed source reference plane, distinguishes geometric-sensitive-aperture from full-site/effective-collection-area normalization, requires explicit spatial response uniformity/separability before allowing post-spatial response, and handles response reference conditions without treating omitted dependence as invariance.

The response operating-range gate follows that structural assessment. It preserves whether linearity was characterized in incident radiant power or irradiance, requires the current wavelength basis/range and operating conditions to remain inside the declared calibration applicability, records the allowed relative nonlinearity criterion, and distinguishes broadband-only evidence from per-spectral-bin applicability with an explicit maximum bin width. Wavelength-dependent conversion requires per-bin validity and spatial linear superposition; broadband total power alone cannot authorize it. Exposure/full-well saturation, accumulated-charge linearity and downstream electronics linearity remain separate because they depend on temporal integration and later signal stages.

The photon-energy wavelength foundation supplies the unit bridge for photon-domain response. Vacuum wavelengths use exact SI h and c directly. Air wavelengths require an exact-wavelength sourced phase refractive index to obtain vacuum wavelength, plus explicit atmosphere compatibility because refractive index varies with conditions. Refractive-index uncertainty is preserved as input metadata but is not yet propagated into photon-energy uncertainty.

The EQE electron-rate foundation performs the photon-domain response conversion. It requires the structural and operating-range gates, including explicit geometric-aperture linear superposition and per-spectral-bin input validity; binds the operating-range bin identities/values back to the exact reduction; requires an exact canonical response-channel data binding so changed numeric calibration samples cannot hide behind the same IDs/evidence; evaluates response per wavelength node; converts each spectral power contribution to photon rate through hν; and applies direct or explicitly separable effective EQE to produce expected electron rate. Wavelength contributions use compensated summation.

The sibling A/W foundation remains a separate current-domain path. It applies spectral responsivity per wavelength bin directly to radiant-power contributions and returns detector-terminal photocurrent magnitude. It uses the same exact canonical response-channel binding so A/W sample drift cannot be substituted under unchanged provenance. A separate electrical applicability profile binds detector bias and current-readout load semantics to the calibration. It deliberately does not infer electron rate or circuit polarity, and it stops before transimpedance gain, voltage, temporal charge, saturation/noise, ADC or RAW processing.

Both response paths therefore converge only at a later temporal/electrical composition boundary; neither is allowed to reinterpret the other's signal domain.

The local exposure-binding foundation begins that temporal boundary without integrating signal. Engine-produced rate results preserve their color-site identity. The binding validates the site/channel, resolves the existing color-site/native-effective-raster relationship, and recomputes the shutter window at the mapped native sample center. The first binding accepts only one-to-one site/sample registration; grouped multi-site blocks do not prove sub-sample timing coordinates.

The constant-rate temporal-integration foundation then requires an evidence-backed stationarity declaration tied to that exact rate domain, site, binding ID and local start/end window. Only then may rate × duration be evaluated. EQE produces expected photon/electron counts without stochastic sampling; A/W produces photocurrent charge magnitude without carrier-count inference.

The dark-current foundation begins charge completion for the EQE path only. It integrates evidence-backed pre-compensation thermal electron rate over the exact local exposure and keeps temperature applicability explicit. Exact-reference values and measured piecewise-linear temperature tables are supported; no universal exponential temperature law is inferred. Population-mean dark current remains an approximation and does not imply DCNU/hot-pixel modeling. A/W photocharge remains outside electron-storage/full-well semantics until a separate carrier/storage mapping exists.

The accumulated-charge foundation then rebinds photo signal, dark charge, and every explicitly incremental additional stored-electron contributor to one exact local exposure event. A separate evidence-backed completeness profile must enumerate the supplied additional-component IDs and assert that all material stored-electron contributors are accounted for.

The physical charge-capacity foundation compares that complete **expected** stored-electron total to an evidence-backed storage-capacity profile tied to site, operating state and temperature applicability. It reports ratio/headroom and whether the unsaturated expected charge lies below, at or above capacity. It does not clamp charge, calculate nonlinear post-saturation storage, infer blooming/neighbor transfer, or claim the stochastic saturation state is known.

The camera saturation-capacity foundation separately compares dark-corrected photo-generated electron-equivalent signal against an evidence-backed camera response-chain saturation capacity. It deliberately does not use total stored charge or physical full-well capacity. The capacity may reflect an earlier analog/digital limit, but the first contract does not infer the limiting stage, ADC code, or post-saturation transfer behavior.

Physical storage capacity and camera saturation are therefore parallel assessments in different calibrated domains, not one shared clamp.


## Image-formation ownership and ordering

The root package exports `getImageFormationContract()` as the canonical semantic map for current and future image-formation work.

It defines six scientific domains:

1. scene/ray geometry;
2. scene-radiance formation;
3. lens mapping plus pupil/throughput;
4. field- and wavelength-dependent PSF;
5. time-dependent exposure/readout;
6. sensor sampling through orientation/output/display.

The graph is a **dependency/ownership graph**, not a literal renderer filter list. Hard upstream dependencies are acyclic; explicit couplings record interactions that must not be split into scientifically independent post-effects.

Important consequences:

- illumination-source metadata is upstream input to scene-radiance formation, not a sensor shortcut or post-render RGB overlay;
- outgoing scene spectral radiance is distinct from `SceneRadiometry` luminance anchors, source spectra, and sensor-plane irradiance;
- focus breathing is projection/lens mapping;
- lateral CA is wavelength/channel-dependent field mapping;
- illumination vignetting is throughput-only;
- mechanical/pupil vignetting can affect both throughput and PSF/bokeh;
- diffraction belongs to the pupil/PSF domain;
- camera rotation should be time-parameterized so global and rolling readout consume one motion model;
- exposure duration and readout timing remain independent;
- future sensor ordering is reserved from optical stack/CFA sampling through charge/noise/ADC/reconstruction before oriented/output transforms.

Renderer implementations may optimize or approximate only when they preserve the engine-owned semantics. Geometric warps use inverse destination-to-source sampling, premultiplied alpha, and stable depth/occlusion order.

See `docs/IMAGE_FORMATION.md`.

The standalone `parseSceneIlluminationProfile()` foundation now provides stable renderer-independent point/spot/area/directional/environment source identities, scene-object binding, source-specific magnitude semantics, continuous-spectrum provenance, and explicit approximation boundaries. It intentionally stops before material/visibility/transport evaluation, so the `scene-radiance-evaluation` stage remains only partially founded. See `docs/SCENE_RADIANCE_AND_ILLUMINATION.md`.

The additive scene-radiance provider boundary now defines material-response metadata, provider fidelity, exact surface/environment evaluation requests, and validated outgoing spectral-radiance results. The engine validates identities, units, provenance, wavelength/time/direction semantics and declared fidelity, but does not implement the renderer or recompute the provider's transport result. Provider/result schema 0.1.0 is approximation-only even when calibrated spectral material inputs are present; it therefore cannot satisfy a calibrated scene-radiance claim by itself. RGB/PBR material inputs remain explicit approximation data, while wavelength-changing material behavior, emission, volumetrics and polarization remain unmodeled.

The shared spectral-composition foundation now separates two mathematical domains. Continuous spectral factors declare a resolved air/vacuum basis, finite wavelength support and interpolation breakpoints; composition intersects support and unions breakpoints without applying values. Delta-like discrete lines instead carry normalized wavelength-integrated line weights and are integrated by summing line contributions with no dλ multiplier. A sensor-response adapter exposes existing response support/knots to the shared continuous plan, and the illumination layer exposes continuous source support or discrete-line source measures without broadening one representation into the other.

The temporal illumination foundation overlays time-varying relative source modulation on the existing static illumination profile without changing that base schema. Waveforms are aperiodic or periodic piecewise-linear multiplier data with evidence and uncertainty. Each time-varying source requires an explicit registration mapping waveform-local t=0 onto the existing capture reference `first-opening-boundary-phase`. Evaluation and local-exposure integration consume physical seconds from that reference; sensor data-readout timing remains independent. The temporal layer never chooses shutter/aperture/ISO, so downstream metering/automatic-exposure consumers can observe changed pre-exposure light without creating a display-brightness feedback loop.

The first exposure-metering foundation consumes an explicitly relative **pre-exposure linear signal** sample set over the physically oriented active capture frame. It is approximation-only and does not reinterpret those samples as calibrated luminance, spectral radiance or sensor-plane irradiance. Generic multi-zone, center-weighted, spot and highlight-weighted profiles state their weighting policy directly; the declared relative target is profile policy rather than a universal gray-card truth. The meter returns a stable measurement/scene-state identity plus the stop offset required to reach that target, while final output crop, tone mapping/display gamma, exposure compensation and automatic aperture/shutter/ISO resolution remain separate. #99 should consume this typed result rather than renderer-specific buffers.

The additive #85→#100 bridge validates that a relative meter sample set is bound to one scene-radiance provider, illumination profile, material-response profile and derivation profile. The scalar reduction remains explicitly renderer/provider supplied because spectral scene radiance cannot be collapsed into a camera exposure-meter scalar without a declared spectral/color weighting model. Schema 0.1.0 therefore labels the reduction uncalibrated/approximate instead of inventing photopic or camera-specific weighting. If the provider binds temporal illumination, each sample set also requires a finite capture time on the shared `first-opening-boundary-phase` reference. A separate temporal-metering function may combine multiple such measurements only under an explicit positive normalized weighted-time-average policy; it averages the linear meter signal first and derives the stop offset afterward. Mixed scene-state/provider/geometry contexts fail closed.

The meter-target seam then freezes a spatial or temporal metering result into a stable value object for #99. The frozen snapshot preserves measurement ID, scene-state ID and metering-profile ID so AE lock can intentionally keep one target while later scene states change. Exposure compensation is a separate absolute-stop transform over that frozen base target; it never rewrites the source meter measurement, and a changed compensation state receives a new target ID. Positive compensation requests more exposure. No-signal remains unresolved rather than becoming infinity. Aperture/shutter/ISO selection still belongs entirely to #99.

## Radiometry readiness boundary

Radiometry prerequisites are represented separately from the composed POC and from low-level signal/noise primitives. `parseRadiometryReadinessProfile()` validates declared scene spectral radiance, optical transmission, pupil/vignetting behavior, photosite collection-area semantics, exposure integration, and sensor response together with evidence and uncertainty declarations.

`assessRadiometryReadiness()` distinguishes:

- `not-ready`: one or more required components are absent;
- `approximate-only`: all required components exist, but one or more are approximate or lack quantified uncertainty;
- `calibrated-ready`: every required component is declared calibrated and carries quantified uncertainty.

These states describe the declared prerequisite package only. They do **not** prove that cited evidence is scientifically correct, do not derive photon counts, and never enable photon/noise output in `simulatePocCamera()` automatically.

Geometric sample pitch is explicitly insufficient as a photosite photon-collection area. A radiometric profile must supply either an effective collection area or a geometric cell area plus explicit fill factor. Calibration artifacts are identified by stable IDs and SHA-256 checksums rather than being embedded implicitly in geometry metadata.

## Composition boundary at POC API 0.20

The sensor/capture/architecture/radiometry modules are public root-engine foundations. POC simulation API 0.20 composes the geometry foundation through final output/viewing semantics while keeping older callers valid.

The POC now composes:

- physical sensor width/height plus native effective raster dimensions;
- shared sensor-geometry metrics, including physical crop factor, raster-derived megapixels, and X/Y geometric sampling pitch;
- the legacy same-aspect centered `crop.factor` path for compatibility;
- an opt-in staged `capture` path for physical orientation, native active-capture rectangle, oriented digital/output crop, and final output raster;
- active-capture and final-output FOV, including asymmetric bounds for off-center physical or digital crop;
- diagonal-based 35 mm-equivalent focal length derived from active physical capture while physical focal length remains authoritative;
- capture-mode equivalent-viewing CoC based on the final retained physical viewing area rather than output pixel count;
- orientation-aware post-output subject framing with explicit retained physical bounds/FOV;
- additive image-plane→native-raster conversion plus oriented-capture and final-output motion/camera-shake vector diagnostics;
- explicit oriented-capture→output pixel scale for renderer sampling/blur conversion;
- one representative horizontal-pitch path for existing blur/sampling calculations, with a fail-closed guard for materially non-square sampling;
- the established projection, DOF/defocus, diffraction, motion, exposure, aperture-shape, and camera-shake models.

Compatibility boundaries remain explicit:

- staged capture geometry cannot be combined with legacy `crop.factor` other than `1`;
- legacy `subjectCrop` response remains for legacy mode, while staged capture reports post-output framing under `capture.subjectFraming`;
- explicit physical CoC remains caller-owned; equivalent-viewing CoC is a separately labeled approximation based on final retained physical viewing area;
- existing legacy motion/camera-shake fields retain their image-plane (+X right, +Y up) meaning rather than being reinterpreted; capture diagnostics explicitly convert to native raster (+Y down) before orientation.

The POC still does **not** consume:

- `SensorArchitectureProfile`;
- `SensorColorSamplingProfile`;
- `NativeEffectiveRasterColorSamplingBindingProfile`;
- `SensorOpticalStackProfile`;
- `SensorSamplingApertureProfile`;
- `CaptureModeProfile`;
- `RadiometryReadinessProfile` or calibrated photon/noise output.

That separation is deliberate. Further foundation APIs should remain independently testable and only enter the POC through explicit contract/version changes and migration review.

## PSF/pupil foundation

The field/wavelength PSF domain now has an explicit public foundation through `getPsfFoundationContract()` and `calculatePsfFoundationComponents()`.

The foundation provides:
- stable contribution IDs and implementation/reservation status;
- field/depth/spectral/pupil context;
- existing geometric-defocus and circular-Airy diagnostics with their original provenance;
- an explicit `not-composed` policy.

It does not invent a combined PSF, MTF, or lens-sharpness score.

Future non-circular diffraction, mechanical pupil clipping, field curvature, field-dependent aberration, and bokeh models should extend this contribution/context model rather than replacing existing defocus/diffraction APIs.

Preview and reference render paths may use different computational fidelity, but must preserve contribution identities and engine-owned semantics.

## Standalone illumination-throughput foundation

The lens-field/pupil domain now includes generic illumination vignetting as field-dependent linear throughput.

The engine owns:
- physical field-radius normalization;
- the declared operating envelope;
- full-envelope extrema validation;
- the linear throughput factor and stop-loss diagnostic.

Renderer backends consume that factor in a linear working domain. They must not reinterpret this stage as gamma-space darkening, coordinate warp, or pupil clipping.

Mechanical/pupil vignetting remains part of future pupil/PSF work because it can change both throughput and bokeh/PSF shape.

## Standalone lateral-CA field-mapping foundation

The lens-field domain also exposes generic red/green/blue channel-dependent radial mapping.

The green channel is the reference/common geometric field map. A shared base distortion is combined with explicit red/blue coefficient offsets, so ordinary distortion and chromatic separation remain semantically distinct without requiring two renderer warps.

The engine owns both forward per-channel coordinates and inverse per-channel destination-to-source sampling. Backends should not implement lateral CA as arbitrary finished-image channel offsets or apply the same base distortion twice.

This is deliberately not a spectral/CFA/colorimetric model. Wavelength-dependent optics, longitudinal CA, wavelength-dependent PSFs, and calibrated lens profiles remain separate future work.

## Standalone radial field-mapping foundation

The lens-field/pupil domain now also exposes generic radial distortion through paired forward and inverse mappings.

The engine, rather than a renderer backend, owns:
- coefficient normalization against a declared physical image-plane radius;
- the valid maximum normalized field radius;
- strict monotonicity/invertibility checks;
- deterministic inverse destination-to-source mapping.

This prevents WebGPU/WebGL2 implementations from inventing separate distortion equations.

The radial-distortion slice is optical-axis-centered only. Tangential/decentered distortion and calibrated lens profiles remain future work. Lateral chromatic aberration and illumination vignetting are implemented as separate standalone foundations and are not part of the radial-distortion model.

## Standalone focus-breathing foundation

The lens-field/pupil domain now has a partial standalone foundation through `calculateFocusBreathingProjection()` and `calculateFocusBreathingFieldOfView()`.

These functions apply an explicit caller-declared scale to the ideal thin-lens projection for one focus state. They do not infer a breathing curve, identify a real lens, or mutate physical focal length.

The model remains standalone and is not composed into `simulatePocCamera()` yet. Generic radial distortion, lateral chromatic aberration, and illumination vignetting are separately implemented standalone foundations and must not be silently coupled into focus breathing. Mechanical/pupil vignetting, pupil/PSF coupling, and calibrated lens profiles remain future work.

## Standalone spatial camera-rotation foundation

The root engine exposes `calculateCameraRotationImageMapping()` as a low-level implementation of the image-formation contract's time-parameterized camera-rotation placement.

It is intentionally **not** composed into `simulatePocCamera()` yet. The existing POC and `estimateCameraShakeBlur()` retain their backwards-compatible global shake approximation.

The new primitive provides deterministic yaw/pitch/roll rotation geometry only. It does not model camera translation, stabilization control laws, rolling-readout scheduling, or scene-depth-dependent parallax.

## Repository-local Node POC transport

The repository contains a minimal Node-only HTTP transport under `src/api` for contributor integration testing.

It wraps `simulatePocCamera()` with an unauthenticated localhost server. The HTTP layer adds structural request validation and transport behavior; it does not define new camera-science equations.

This transport is intentionally **not** part of the public `@photivra/engine` package surface and is excluded from the npm tarball. The POC server is not the intended production architecture.

## Optional/future capability modules

Future capabilities should compose onto the scientific core rather than silently widening unrelated models. Examples include:

- composed use of the standalone spatial camera-rotation model plus future depth-aware camera translation;
- panning and rolling/global shutter;
- flash;
- spectral/color modeling;
- macro/high-magnification calibration;
- non-circular diffraction PSFs;
- computational capture;
- lens calibration profiles;
- advanced/calibrated sensor profiles;
- comparison and optimization systems;
- renderer-specific effects.

Capabilities should remain discoverable and explicitly versioned rather than being assumed present for every scene or runtime.

## Repository scope

This repository contains the Apache-2.0 scientific/business-logic package together with its tests, documentation, schemas, validation, and contributor tooling.

The published npm package intentionally exposes only the browser-safe scientific root surface; repository-local development tooling such as the Node POC transport remains outside the published package.

## Version surfaces

The root library contract and the composed POC simulation contract are versioned independently. `ENGINE_API_VERSION` describes the root browser-safe engine surface. `POC_SIMULATION_API_VERSION` describes the request/response behavior of `simulatePocCamera()` and the repository-local POC HTTP transport. Package versioning remains separate from both.
