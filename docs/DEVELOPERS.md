# Developer guide

This is the entry point for **@photivra/engine 1.3.0 candidate**, root API contract **1.3.0**. The candidate becomes an installable 1.3.0 distribution only after the owner tags and publishes it. Repository `main` may later describe newer development; use a published release's packaged docs or its exact tag for the stable contract. [Release notes and migration](RELEASE_1_3_0.md) explain the transition to aligned package/root versions.

Photivra is an Apache-2.0 ESM TypeScript calculation library with no runtime npm dependencies. It exposes explicit units, deterministic data, provenance and bounded scientific approximations. The package supplies no hosted API, renderer installation, UI, commercial camera calibration or automatic agent service. [Photivra's public site](https://photivra.com) is separate from the engine's license; public engine documentation is available here without an application account.

## Install and calculate

After publication, install `npm install @photivra/engine@1.3.0`. During candidate review, use the verified tarball described in [release preparation](RELEASE_1_3_0.md).

```ts
import { calculateFieldOfView, ENGINE_API_VERSION } from "@photivra/engine";

const horizontal = calculateFieldOfView({ focalLengthMm: 50, sensorDimensionMm: 36 });
console.log(ENGINE_API_VERSION); // 1.3.0: matches the package version
console.log(horizontal.value.degrees); // approximately 39.60, ideal infinity-focus geometry
console.log(horizontal.provenance); // read assumptions/status with the value
```

The root is browser-safe. Supported Node execution/tooling is Node 22.13+ within the maintained 22 line, the maintained 24 line, and Node 26 Current; prefer patched Node 24. The broad manifest minimum does not qualify untested or EOL lines. A browser backend must supply the documented ES APIs (including `structuredClone`, typed arrays and Web Crypto where used); a browser-safe import graph is not a promise about every browser version or rendering speed. See [runtime policy](../NODE_SUPPORT.md).

Primitive calculations normally return `CalculationResult<T>` with `value`, `provenance` and optional `quality`. Parsers return validated values; plans/snapshots return their independently versioned records; assessments return explicit blockers; paired export returns a Promise because hashing is asynchronous. Do not infer calibrated accuracy from successful parsing, a complete stage graph, a generic tier name or deterministic replay.

## Find the operation by scientific task

Every row applies to package/root API 1.3.0. Direct calculations are synchronous/browser-safe unless the row says otherwise. A listed primitive is not automatically an app feature or supported in every production combination. The [API reference](API_REFERENCE.md) resolves all root exports and exact signatures; the linked guides own equations, inputs, defaults, errors and limits.

| Task | Start here / executable evidence | Qualified boundary |
| --- | --- | --- |
| FOV, focus, depth of field, subject size | [Usage: field of view](USAGE.md#field-of-view), [physics](PHYSICS_FOUNDATION.md), [quick start](examples/quick-start.mjs) | Ideal paraxial/thin-lens geometry; explicit mm/metres/axes |
| Aperture, diffraction, sampled PSF | [PSF foundation](PSF_FOUNDATION.md), [usage](USAGE.md#real-lens-psf-profiles-and-complex-pupil-reference) | Shape and throughput separate; explicit support; no inferred commercial calibration |
| Metering and exposure modes | [Usage: relative metering](USAGE.md#relative-pre-exposure-metering), [API conventions](API_STYLE.md) | Relative pre-exposure linear signal; compensated target before control; ISO does not create photons |
| Rigid/depth motion and stabilization | [Motion](MOTION_AND_SIGNAL.md), [stabilization](STABILIZATION.md) | Declared constant-motion/generic control models; visibility remains external |
| Continuous or discrete spectral measures | [Scene/illumination](SCENE_RADIANCE_AND_ILLUMINATION.md) | Continuous dλ in nm versus wavelength-integrated line fractions; `distribute*` preserves quantity domain |
| Sampling, response validity, photon/electron expectations | [Usage](USAGE.md#sensor-spectral-response), [temporal EQE](SENSOR_EQE_TEMPORAL_EXPOSURE.md) | Exact source-plane/area/profile/wavelength/time bindings; no implicit QE/collection area |
| Execute declared environment → production RAW → output | [Production envelope](PRODUCTION_ENVIRONMENT_CAPTURE.md), [complete packed example](examples/production-capture.mjs) | Node example loads owned data; engine callback is synchronous; 4,096 native sites / 100,000 provider evaluations |
| Qualify browser-first dense-pupil Focus/Depth native capture | [#224 qualification envelope](BROWSER_NATIVE_CAPTURE_ENVELOPE.md), [numerical evidence matrix](BROWSER_NATIVE_CAPTURE_NUMERICAL_ACCEPTANCE.md), [prepared-state contract](BROWSER_NATIVE_CAPTURE_PREPARED_STATE.md), [robust-geometry contract](BROWSER_NATIVE_CAPTURE_ROBUST_GEOMETRY.md), [resource-accounting contract](BROWSER_NATIVE_CAPTURE_RESOURCE_ACCOUNTING.md), [dense-pupil evidence](DENSE_PUPIL_QUALIFICATION.md) | Frozen source/camera/stage, numerical acceptance, prepared-state, robust geometry/fallback, and whole-event resource-accounting contracts for #233; documentation-only until separately implemented and qualified |
| Preserve/reconstruct RAW and develop preview | [RAW envelope](RAW_FRAME_ENVELOPE.md), [processed output](PROCESSED_OUTPUT.md) | Signed shadows, absolute CFA phase, explicit sensor-channel color/WB; rendering does not redraw noise |
| Pair native CFA DNG with processed JPEG | [Photographic export](PHOTOGRAPHIC_EXPORT.md), [acceptance](EXPORT_ACCEPTANCE.md) | Async Web Crypto; registered Bayer reference; 1:1 output crop; caller saves bytes |
| Commit capture, ideal virtual-camera color, linear encoding | [Capture](SIMULATED_CAPTURE.md), [ideal color](CAPTURE_COLOR.md), [encoding](LINEAR_CAPTURE_ENCODING.md) | Ideal XYZ encoding differs from approximate sensor-channel development |
| Generic tiers and correction cost | [Presets](GENERIC_TIER_PRESETS.md), [tier acceptance](TIER_ACCEPTANCE.md), [correction](DIGITAL_OPTICS_FOUNDATION.md) | Versioned owned synthetic assets; no universal quality ranking |
| Reproduce conformance/performance | [Scientific suite](SCIENTIFIC_CONFORMANCE.md), [performance disposition](V1_PERFORMANCE_DISPOSITION.md) | CI science gates; Node measurements do not establish browser or megapixel performance |
| Optional local HTTP development transport | [Repository POC](POC_API.md) | Node-only checkout tooling, excluded from root/package; unauthenticated loopback |

## Complete packed examples

The package includes `docs/examples/quick-start.mjs` and `production-capture.mjs`. In a Node ESM consumer directory with the candidate installed, copy these files and `production-request.json` from `node_modules/@photivra/engine/docs/examples/` into that directory and run them. The quick start asserts independent geometry/exposure invariants. The production example executes the same owned 2×2 narrow-band synthetic fixture used in final conformance through all fourteen production stages and paired byte export, retaining the exact RAW codes and deterministic replay. It writes no files and installs no renderer.

The JSON data is explicitly synthetic: uniform angular radiance `1e-9 * (1 + 200t)` W/m²/sr/nm; 540–560 nm band; independently declared 800×600 µm sensitive aperture and package-incident EQE 0.4; registered opening-reference time; fixed seed and generic consumer profiles. This is a controlled regression laboratory, not a real scene, native camera pixel pitch, calibrated color/visibility, PSF transport proof or convergence bound. Production supports only the envelope linked above. The tiny DNG demonstrates byte serialization/lineage; external-reader acceptance uses separate larger fixtures.

The [Usage Guide](USAGE.md) includes both complete snippets and clearly marked composition fragments that require earlier validated bindings. The release checker typechecks and executes complete importing snippets against the packed artifact; it inventories fragment dependencies without pretending missing calibration data exists.

## Contracts and support

Use only `import ... from "@photivra/engine"`. Deep paths and repository transport/scripts/test helpers are unsupported. TypeScript declarations describe shape; parse untrusted JSON before scientific execution. Keep native +Y-down, optical +Y-up and half-open raster rectangles explicit. Preserve domain distinctions between radiance, irradiance, rates, expected counts, realized charge, RAW codes and processed SDR.

Malformed configurations/non-finite values throw the established domain errors. Scientifically incomplete but well-formed assessments/plans expose structured blockers. Trusted provider callback exceptions propagate; no silent fallback renderer runs. The exact return contract and independent model versions are visible in the reference and declarations.

See [provenance](PROVENANCE.md), [license](../LICENSE), [NOTICE](../NOTICE), [third-party inventory](../THIRD_PARTY.md), [contributing](../CONTRIBUTING.md) and [security reporting](../SECURITY.md). Engine code/docs do not license the commercial application or its private assets. Report reproducible engine defects through [public issues](https://github.com/Photivra/photivra/issues).

Website navigation/documentation hosting belongs to [the app-side discovery ticket #45](https://github.com/Photivra/photivra-apps/issues/45), with navigation #298 and environments #300. Handoff: link the public engine repository, this developer guide, the verified npm release package and capability examples from the public site. No unpublished `/developers` destination is linked here. Website launch is not an engine release prerequisite; access to the site returned HTTP 403 during this audit, so its content/navigation was not verified.

## Print planning

The published 1.2.0 release added [registered linear statistics](PRINT_REGION_STATISTICS.md) and a separate [static contrast model reference](PRINT_CONTRAST_REFERENCE.md). The [combined #195/#196 review](PRINT_195_196_REVIEW.md) and [candidate ledger](validation/print-196-candidate-capabilities.json) list executed public-backend experiments and the remaining full release gates. None of these diagnostics supplies a universal quality score.

Use [native-only Print planning](PRINT_PLANNING.md) for independently specified image size/viewing distance, explicit angular conventions, confirmed native crop and lab constraints. It returns no upscale recommendation and does not certify perceived quality or activate an exporter.

The [regional Print detail diagnostic](PRINT_DETAIL_ASSESSMENT.md) measures one declared coherent sinusoidal fundamental in a selected linear-luminance ROI and records its exact source stage. Its [validation protocol](PRINT_DETAIL_VALIDATION.md) and [capability ledger](validation/print-detail-capabilities.json) distinguish mathematical conformance from blocked acquired-image, renderer and perceived-quality qualification.
