# Photivra

Photivra is an open TypeScript engine for the science and mathematics of photography and digital imaging.

**Pronunciation (IPA):** /foʊˈtɪvɹə/

Photivra provides a reusable, tested API for camera geometry, optics, focus and depth of field, exposure, subject and camera motion, sensor sampling, diffraction, cropping and framing, stabilization approximations, and signal/noise calculations.

Its calculations use explicit units, documented assumptions, validation, provenance, and clearly labeled approximations so results are reproducible and their limitations are understandable.

The source is licensed under Apache-2.0.

## Quick start

Install the ESM package:

```sh
npm install @photivra/engine
```

Calculate horizontal field of view for a 36 mm sensor dimension and 50 mm focal length:

```ts
import { calculateFieldOfView } from "@photivra/engine";

const horizontal = calculateFieldOfView({
  focalLengthMm: 50,
  sensorDimensionMm: 36
});

console.log(horizontal.value.degrees);
console.log(horizontal.provenance);
```

See the [Usage Guide](docs/USAGE.md) for the complete public API.

## Documentation

- [Usage Guide](docs/USAGE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Contributor Guide](CONTRIBUTING.md)
- [Agent Instructions](AGENTS.md)
- [Changelog](CHANGELOG.md)
- [Public API Style](docs/API_STYLE.md)
- [Physics Foundation](docs/PHYSICS_FOUNDATION.md)
- [Image-Formation Contract](docs/IMAGE_FORMATION.md)
- [PSF and Pupil Foundation](docs/PSF_FOUNDATION.md)
- [Motion and Signal Foundation](docs/MOTION_AND_SIGNAL.md)
- [Camera Shake and Stabilization](docs/STABILIZATION.md)
- [Scientific and Source Provenance](docs/PROVENANCE.md)
- [Local POC HTTP API](docs/POC_API.md)

## Getting help

Use [GitHub Issues](https://github.com/photivra/photivra/issues) for reproducible bugs, documentation problems, and feature discussions. For security vulnerabilities, follow [SECURITY.md](SECURITY.md).

## What is implemented

The root package exports deterministic or explicitly labeled approximate models across four areas.

### Optics and geometry

- [centered and asymmetric rectilinear field of view, with optional focus-aware thin-lens projection](docs/USAGE.md#field-of-view);
- [physical vs diagonal-based 35 mm-equivalent focal length](docs/USAGE.md#actual-and-35-mm-equivalent-focal-length);
- [caller-declared focus-breathing projection/FOV approximation](docs/USAGE.md#focus-breathing-projection);
- [generic invertible radial distortion mapping](docs/USAGE.md#radial-lens-distortion-mapping), including multi-point inverse batch sampling;
- [generic RGB-channel lateral chromatic-aberration field mapping](docs/USAGE.md#lateral-chromatic-aberration-mapping);
- [generic linear-light illumination-vignetting approximation](docs/USAGE.md#illumination-vignetting);
- [Gaussian thin-lens image distance and magnification](docs/USAGE.md#thin-lens-image-distance-and-magnification);
- [geometric depth of field and defocus-circle diameter](docs/USAGE.md#depth-of-field-and-defocus);
- [ideal circular-aperture first-zero Airy diameter](docs/USAGE.md#circular-aperture-diffraction);
- [separated PSF/pupil contribution foundation](docs/USAGE.md#psf-and-pupil-foundation);
- [ideal regular-polygon aperture geometry and sunstar direction symmetry](docs/USAGE.md#aperture-geometry-and-sunstar-directions).

### Exposure and motion

- [EV100, relative optical exposure, relative rendered exposure, and equivalent ISO compensation](docs/USAGE.md#exposure-and-iso-relations);
- [constant-velocity projected point motion](docs/USAGE.md#projected-subject-motion);
- [time-parameterized spatial camera-rotation mapping](docs/USAGE.md#spatial-camera-rotation-mapping) for yaw/pitch/roll;
- [the existing controlled yaw/pitch camera-shake and stabilization-equivalent approximation](docs/USAGE.md#camera-shake-and-stabilization-equivalent-approximation).

### Sensor and output

- [projected fronto-parallel object size and sensor-pixel sampling](docs/USAGE.md#projected-object-size-and-sensor-sampling);
- [pixel pitch](docs/USAGE.md#pixel-pitch);
- [sensor imaging-area, native-raster, crop-factor, megapixel, and 2D sampling metrics](docs/USAGE.md#sensor-imaging-area-and-native-raster);
- [provenance-aware sensor architecture/capability metadata](docs/USAGE.md#sensor-architecture-metadata);
- [capture orientation, active sensor area, and output geometry](docs/USAGE.md#capture-orientation-active-area-and-output-geometry);
- explicit oriented-physical-raster ↔ pre-orientation image-plane metric coordinate transforms for renderer/lens-field integration;
- [centered crop and subject-height framing crop](docs/USAGE.md#centered-crop-and-subject-framing-crop);
- [radiometry prerequisite/readiness assessment](docs/USAGE.md#radiometry-readiness);
- [mean photoelectron conversion and basic shot-noise/read-noise SNR primitives](docs/USAGE.md#photoelectron-and-snr-primitives).

### Data, validation, and composition

- [image-formation ownership/order contract](docs/IMAGE_FORMATION.md), including coordinate, temporal, renderer, and reserved sensor-stage semantics;
- [camera/scene schemas and runtime validation](docs/USAGE.md#camera-and-scene-schema-validation);
- [provenance plus optional uncertainty/quality metadata](docs/USAGE.md#provenance-uncertainty-and-quality-metadata);
- [the composed `simulatePocCamera()` proof-of-concept calculation](docs/USAGE.md#composed-poc-simulation).

The package has no runtime npm dependencies.

## Sensor/capture integration status

The sensor/capture foundations are intentionally **additive**.

The root engine now exposes standalone APIs for:

- physical sensor imaging area and native raster metrics;
- independent X/Y geometric sampling pitch;
- active-capture rectangles and physical camera orientation;
- native↔oriented point/vector/rectangle transforms;
- off-center/asymmetric active-capture FOV;
- diagonal-based 35 mm-equivalent focal length;
- evidence-backed sensor architecture metadata;
- radiometry prerequisite/readiness assessment.

These contracts are **not all composed into `simulatePocCamera()` yet**. POC API 0.20 now composes staged capture geometry through final output/viewing semantics: orientation, active-capture rectangles, output crop/raster, active/output FOV, active-capture 35 mm-equivalent focal length, viewing-based CoC against the final retained physical area, orientation-aware subject framing, and explicit output pixel scaling. Sensor-architecture metadata and radiometry-readiness profiles remain standalone and are not yet composed.

The POC exposes X/Y sampling diagnostics but still uses one representative horizontal pitch internally for several pixel-domain calculations; it therefore rejects geometry whose X/Y pitch differs by more than 1% rather than silently producing directional error.

Likewise, radiometry readiness does not enable photon/noise output in the POC. Integration of these foundations is separate future work and should happen explicitly rather than by silently changing existing request semantics.

## Sample use case

A developer wants to model how a change in camera settings affects an image.

Using Photivra, the application can provide camera and scene parameters—such as sensor dimensions, focal length, aperture, shutter speed, focus distance, subject distance, and motion—and receive structured scientific results describing effects such as:

- field of view;
- projected subject size;
- depth of field and defocus;
- diffraction;
- subject-motion blur;
- camera-shake blur;
- pixel sampling;
- crop and framing;
- exposure relationships;
- basic signal and noise behavior.

Each result includes explicit units and model provenance, with approximations clearly identified rather than presented as exact physical measurements.

```ts
import {
  calculateFieldOfView,
  calculateDepthOfField,
  calculateProjectedMotionBlur
} from "@photivra/engine";

const fieldOfView = calculateFieldOfView({
  focalLengthMm: 200,
  sensorDimensionMm: 36,
  focusDistanceM: 22
});

const depthOfField = calculateDepthOfField({
  focalLengthMm: 200,
  aperture: 5.6,
  focusDistanceM: 22,
  circleOfConfusionMm: 0.03
});

const motion = calculateProjectedMotionBlur({
  focalLengthMm: 200,
  shutterSeconds: 1 / 1000,
  positionM: { x: 0, y: 1, z: 22 },
  velocityMps: { x: 10, y: 0, z: 0 },
  focusDistanceM: 22,
  pixelPitchMicrometers: 6
});

console.log(fieldOfView.value);
console.log(depthOfField.value);
console.log(motion.value);
```

The calling application can then use those results while keeping the underlying photography calculations centralized, tested, and reproducible.

## Status

- Repository package version: `0.5.1`
- Engine API contract: `0.34.0`
- Composed POC simulation API contract: `0.20.0`
- Stability: pre-1.0 / proof of concept

Package version and engine API version are intentionally separate. Public APIs may evolve before 1.0 while the scientific models and composition contracts are validated.

Creating a GitHub release/tag and publishing `@photivra/engine` are separate release actions. The tag-triggered publish workflow verifies that the `vX.Y.Z` tag matches the package version before publishing.

## Image-formation integration boundary

The root engine now exports `getImageFormationContract()` as a descriptive public contract for scientific domain ownership, coordinate spaces, stage dependencies/couplings, temporal basis, renderer warp/compositing semantics, and reserved sensor ordering.

The contract does **not** claim that every listed stage is implemented. Reserved stages remain future work, and `simulatePocCamera()` is unchanged at API 0.20. See [Image-Formation Contract](docs/IMAGE_FORMATION.md).

## Important scientific limits

Photivra deliberately avoids claiming more than the current models support.

- Focus-aware projection is ideal paraxial thin-lens geometry by default. A separate declared-scale focus-breathing approximation can alter projection/framing for one focus state, but Photivra does not infer a breathing curve or claim named-lens calibration.
- Generic radial distortion is a caller-parameterized field mapping with an explicit physical normalization radius and invertible operating envelope. Decentering/tangential distortion and named-lens calibration are not yet modeled.
- Generic illumination vignetting is a field-dependent scene-linear/channel-linear attenuation model only; it does not model pupil clipping, cat's-eye bokeh, PSF changes, or calibrated lens radiometry.
- Generic lateral CA is represented as independent radial field mapping for abstract RGB renderer channels. It is not a spectral lens model, sensor-CFA calibration, longitudinal-CA model, or named-lens profile.
- Projected subject motion follows a representative point under constant linear velocity. It does not yet model scale blur of an extended object moving substantially along the optical axis.
- The legacy stabilization-equivalent camera-shake API remains one global yaw/pitch image-plane vector. A separate low-level rotation-only mapping now models field-position-dependent yaw/pitch/roll image motion; camera translation/parallax, real IBIS/OIS behavior, and composed rolling-readout integration remain unmodeled.
- The Airy diagnostic assumes an ideal circular pupil. The PSF foundation keeps circular diffraction and geometric defocus as separately named diagnostics; it does not calculate a combined PSF, and polygon aperture geometry does not produce a polygon diffraction PSF.
- Signal/noise primitives require caller-supplied photon/electron quantities. The radiometry-readiness API can assess declared prerequisites, but it does not derive photons or enable photon/noise output in the composed POC.
- The composed POC still uses one representative pixel-pitch path internally and therefore rejects sensor geometry whose X/Y sample pitch differs by more than 1%; lower-level geometry APIs already preserve independent X/Y pitch.
- No named commercial camera or lens performance is claimed.

See [Physics Foundation](docs/PHYSICS_FOUNDATION.md), [Motion and Signal Foundation](docs/MOTION_AND_SIGNAL.md), and [Camera Shake and Stabilization](docs/STABILIZATION.md) for details.

## Principles

- Independently implement established photography, optics, sensor, motion, and imaging mathematics.
- Do not copy code, datasets, calibration tables, model weights, or protected technical expression unless reuse rights are explicit and compatible with Apache-2.0 distribution.
- Treat publicly viewable material as reference material only; public availability is not permission to copy, and independent implementation does not by itself resolve third-party patent rights.
- Keep calculations deterministic and testable where the model itself is deterministic.
- Prefer explicit units, versioned schemas, consistent public APIs, and reproducible results.
- Label results by provenance: calculated, calibrated, estimated, or approximation.
- Report uncertainty/accuracy metadata only when it is defensible; never invent aggregate confidence or error bars.
- Keep the repository focused on reusable scientific/business logic, validation, schemas, tests, documentation, and contributor tooling.

## Runtime surfaces

The package is ESM-only.

The root export is the runtime-neutral scientific surface:

```ts
import {
  calculateFieldOfView,
  simulatePocCamera
} from "@photivra/engine";
```

The root dependency graph is checked in CI so Node-only modules and the repository-local HTTP POC server cannot become reachable from that browser-facing surface.

The open repository still contains a minimal Node HTTP POC server under `src/api` for contributor integration testing. It is deliberately **not** exported by `@photivra/engine` and is excluded from the published npm package. It is unauthenticated and is **not** a production hosting recommendation.

When the package is installed directly from a Git repository using normal npm lifecycle scripts, `prepare` builds `dist` before consumption.

## Development

Development and Node-only tooling require Node.js 22.13 or newer. CI verifies Node.js 22.13 and Node.js 24; both are LTS release lines as of this documentation audit.

The reproducible npm workflow uses the committed lockfile:

```sh
npm ci
npm run check
npm run coverage
npm run build
npm run pack:check
```

Coverage gates are currently:

- 90% lines;
- 90% statements;
- 90% functions;
- 80% branches.

The deterministic fuzz/property suite uses fixed seeds so failures are reproducible.

Yarn and pnpm may be used for development, but the repository's release/CI dependency resolution is defined by `package-lock.json` and `npm ci`.

## Validation boundaries

TypeScript types are not treated as validation for untrusted data.

- Use `parseCameraConfiguration()`, `parseSceneDefinition()`, `parseSensorArchitectureProfile()`, and `parseRadiometryReadinessProfile()` for their respective external JSON/configuration boundaries.
- The repository-local Node POC HTTP layer has its own structural request parser before invoking `simulatePocCamera()`.
- Scientific range/domain validation remains in the calculation modules.
- Public `CalculationResult<T>` envelopes reject non-finite numeric output.

## Citation

GitHub can generate citation text from [CITATION.cff](CITATION.cff). Use that metadata when citing Photivra in research, technical documentation, or reproducible analyses.

## Licensing

Source code in this repository is licensed under Apache-2.0 unless a file clearly states otherwise. See [LICENSE](LICENSE), [NOTICE](NOTICE), and [THIRD_PARTY.md](THIRD_PARTY.md).

The Apache license does not grant trademark rights to the Photivra name, logos, or branding except as allowed by applicable law and the license itself.
