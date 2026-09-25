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

## Composition boundary after 0.2.0

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
- `RadiometryReadinessProfile` or calibrated photon/noise output.

That separation is deliberate. Further foundation APIs should remain independently testable and only enter the POC through explicit contract/version changes and migration review.

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
