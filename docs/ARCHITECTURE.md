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

The spatio-spectral reducer now composes the spatial and wavelength measures against explicitly supplied E_lambda(x,y) in W/m²/nm. Spatial plans carry their exact colorSamplingProfileId so composition can require profile identity rather than channel-name coincidence. The reducer validates the full spatial × spectral Cartesian product, caps it independently, reports per-wavelength spatial averages and geometric-aperture spectral flux density, and integrates those pre-response quantities over dλ. It still applies no QE, A/W responsivity, channel-filter transmission, temporal exposure, effective collection-area correction, photon/electron conversion or RAW processing. Response-scope/source-plane matching therefore remains the next explicit gate rather than an inferred property of these pre-response values.


## Image-formation ownership and ordering

The root package exports `getImageFormationContract()` as the canonical semantic map for current and future image-formation work.

It defines five scientific domains:

1. scene/ray geometry;
2. lens mapping plus pupil/throughput;
3. field- and wavelength-dependent PSF;
4. time-dependent exposure/readout;
5. sensor sampling through orientation/output/display.

The graph is a **dependency/ownership graph**, not a literal renderer filter list. Hard upstream dependencies are acyclic; explicit couplings record interactions that must not be split into scientifically independent post-effects.

Important consequences:

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
