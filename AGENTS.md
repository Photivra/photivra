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

The post-0.2 sensor/capture foundation has explicit semantics. Preserve them.

- `SensorImagingArea` is the physical photosensitive imaging area used for image formation, not die/package dimensions.
- `NativeImageRaster` describes the effective native image-sampling grid. It does not assert one image sample equals one physical photodiode.
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
- Capture mode must not silently stack legacy crop semantics: `crop.factor` must remain `1` when `capture` is present.
- Capture mode owns final output/viewing semantics: output physical bounds/FOV, post-output subject framing, and equivalent-viewing CoC against the final retained physical image region.
- The response exposes shared sensor-geometry metrics plus an optional capture block with active/output FOV, active-capture 35 mm-equivalent focal length, output sampling scale, subject framing, and oriented/output motion diagnostics.
- Equivalent focal length remains informational and never replaces physical focal length inside POC physics; final digital/output crop does not redefine it.
- Existing motion/camera-shake X/Y fields retain their legacy image-plane meaning (+X right, +Y up). Capture raster coordinates are +X right, +Y down; additive diagnostics must expose the explicit basis conversion before orientation/output scaling.
- Sensor-architecture metadata and radiometry-readiness profiles remain standalone and are not composed.
- The POC reports X/Y pitch diagnostics but still uses one representative horizontal pitch internally and fails closed above a 1% axis difference.
- Radiometry readiness never enables photon/noise output by itself.

Any further foundation composition still requires an explicit `POC_SIMULATION_API_VERSION` review/change, migration analysis, regression tests, and documentation. Do not silently reinterpret existing POC fields.

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
