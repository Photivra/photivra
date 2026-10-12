# 2.0.0 release candidate

> **Candidate record, prepared October 12, 2026.** This document records the `@photivra/engine@2.0.0` release candidate. Preparing it does not tag, publish or create a GitHub release. **Tagging `v2.0.0` triggers npm publishing and requires the owner's explicit approval.**

**Proposed version:** `@photivra/engine@2.0.0`, with `ENGINE_API_VERSION = "2.0.0"`. The owner directed a single major release that contains correctness fixes and performance work with bit-identical output. Several fixes change numerical outputs, change serialized identities, or reject input that 1.x accepted. Under the 1.0 root-package compatibility policy, that requires a major version.

**Candidate base:** `origin/main` at `d01d04b` (#288), plus this preparation change. `npm run release:prepare -- 2.0.0` aligned `package.json`, both lockfile root versions, `ENGINE_API_VERSION`, `CITATION.cff`, the current-release mentions in `README.md` and `docs/DEVELOPERS.md`, and the generated `docs/api`. `POC_SIMULATION_API_VERSION` stays `0.20.0` (see [Pending owner decisions](#pending-owner-decisions)). No citation release date is asserted before publication.

## Summary

Changes since `v1.5.0`, all merged to `main` before this candidate:

| PR | Issue | Change | Kind |
| --- | --- | --- | --- |
| [#278](https://github.com/Photivra/photivra/pull/278) | #274 | Print JPEG pixels-per-inch (optional `PrintJpegInput.pixelsPerInch`) and mandatory ExifVersion | Fix, additive API |
| [#279](https://github.com/Photivra/photivra/pull/279) | #271 | Exact thin-lens depth-of-field limits | Breaking (values) |
| [#280](https://github.com/Photivra/photivra/pull/280) | #273 | Capacity assessments bound to their charge; `>=` digital saturation flag | Fix (stricter validation) |
| [#281](https://github.com/Photivra/photivra/pull/281) | #272 | Auto-ISO priority modes match exact grid values | Fix |
| [#283](https://github.com/Photivra/photivra/pull/283) | #270 | Independent per-site RAW noise seeding (noise model 0.3.0, seed schedule v2) | Breaking (values, identities) |
| [#284](https://github.com/Photivra/photivra/pull/284) | #276 | Camera rotation sign on all three axes, shake pitch sign; complex-pupil PSF zero padding and sampling guard | Breaking (values, geometry, rejection) |
| [#282](https://github.com/Photivra/photivra/pull/282) | #276 | Crop rounding, canonical JSON, key-order comparisons, result contract, POC server status codes | Breaking (values, strictness) |
| [#285](https://github.com/Photivra/photivra/pull/285) | #275 | Validation, clone and PSF-parse reductions on the native path | Performance, bit-identical |
| [#286](https://github.com/Photivra/photivra/pull/286) | #275 | Typed-array native SDR kernel, faster exact-order JPEG encoder | Performance, bit-identical |
| [#287](https://github.com/Photivra/photivra/pull/287) | #275, #276 | Linear-time stabilization evaluation, time-budgeted native tile yields | Performance, bit-identical |
| [#288](https://github.com/Photivra/photivra/pull/288) | #275 | Opt-in optical-stage reuse API | Performance, additive API |

The other commits between `v1.5.0` and `d01d04b` (#243–#267) are agent and contributor guidance, CI, documentation, git hooks, `release:prepare`, and repository-internal browser-native reference work under #233/#234/#249/#250. The browser-native reference modules (`src/capture/browser-native-reference-*`) are internal: they are not root exports, and the root API reference and export manifest list no symbols from them. Those commits change no public root contract.

The full release notes, with migration steps for each breaking change, are in the [changelog](../CHANGELOG.md).

## Science evidence

Each row covers a change that affects science. Sources are the ones cited and used in the source PRs. The tests named are deterministic and committed.

| Change | Model and version | Accepted science and sources | Evidence in the repository |
| --- | --- | --- | --- |
| RAW noise seeding (#283) | `photivra-native-raw-noise` 0.3.0; seed schedule `murmur3-capture-seed-native-index-stream-v2`; charge realization 2.0.0; stochastic readout 3.0.0 | The linear camera model of EMVA Standard 1288 §2: Poisson signal electrons plus independent Gaussian read noise, then gain and quantization, with per-pixel code variance σ_y² = K²(μ_e + σ_d²) + σ_q². J. R. Janesick, *Photon Transfer: DN → λ* (SPIE Press, 2007): photon-transfer analysis assumes shot noise that is Poisson and independent from pixel to pixel, which the old correlated streams violated. The Poisson sampler (W. Hörmann, "The transformed rejection method for generating Poisson random variables," *Insurance: Mathematics and Economics* 12(1), 39–45, 1993; PTRS) and Box–Muller are **unchanged**. Seeds come from MurmurHash3_x86_32/`fmix32` (Austin Appleby, SMHasher; public domain). This is non-cryptographic seed ownership. Stream independence is shown statistically, not assumed from the hash. | `test/sensor-raw-noise-independence.test.ts`: on the production native RAW path at μ_e = 0, 10, 100 and 800 e⁻, it checks per-phase mean and variance against Poisson and Poisson + read noise, spatial and same-CFA-colour correlation, cross-seed and index-shift independence, and MurmurHash3 reference vectors, all within 5σ bands declared before the run. The old code fails these tests: lag correlation 0.84 against a bound of 0.078. |
| Depth of field (#279) | `thin-lens-depth-of-field` 1.1.0 | The exact thin-lens limits, derived from the blur-circle condition c(d) = f²\|s − d\|/(N·d·(s − f)). Near = s(H − f)/(H + s − 2f); far = s(H − f)/(H − s), infinite when s ≥ H. S. F. Ray, *Applied Photographic Optics*, 3rd ed. (Focal Press, 2002), chapter on depth of field and hyperfocal distance. The model is geometric only: no diffraction, aberrations, pupil magnification, focus breathing or macro effects. | `test/optics.test.ts`: exact hand-derived rational references, a property test of more than 300 cases showing `calculateDefocusCircle` equals c at both limits within a relative 1e-9, and hyperfocal tests (far limit `null` at H, H + 25 mm and 3H; near limit H/2 at H). |
| Camera rotation sign (#284) | `spatial-camera-rotation-mapping`, `inverse-spatial-camera-rotation-mapping` (and focus-aware variants), `constant-angular-velocity-stabilization-equivalent` (and focus-aware variant): all 2.0.0 | Rigid rotation by the right-hand rule, using the standard rotation matrices. The camera basis (+X right, +Y up, +Z forward) is left-handed, so the physical rotation matrix in that basis is the transpose of the component Rodrigues formula. The rectilinear projection x = d·X/Z is unchanged. | `test/camera-rotation-sign-consistency.test.ts`: forward and inverse mappings against an independent rotation in a right-handed basis, using the textbook right-hand rotation matrix (5 rotation vectors × 3 field points, 1e-11). It also checks the stated physical meaning of each axis, that `estimateCameraShakeBlur()` equals the mapping at the optical axis for ±yaw and ±pitch, and that aperture rays agree with the inverse mapping. |
| Complex-pupil PSF sampling (#284) | complex-pupil PSF model 2.0.0 | The incoherent PSF is \|FT{pupil}\|², and its OTF is the pupil autocorrelation, cut off at D/(λz). Nyquist sampling of the intensity therefore needs Q = λN/pitch ≥ 2: J. W. Goodman, *Introduction to Fourier Optics*, 4th ed. (W. H. Freeman, 2017). The Q = λFN/p notation follows R. D. Fiete, "Image quality and λFN/p for remote sensing systems," *Opt. Eng.* 38(7), 1229–1240 (1999). The discrete no-wrap condition M ≥ 2S − 1 follows from the circular-convolution property of the DFT. | `test/lens-psf-framework.test.ts`: an independent separable Dirichlet kernel; an analytic Airy comparison (64×64 grid, 63-sample pupil, f/4, 550 nm, padded to 125, observed error 3.7e-4 against a 2e-3 tolerance); and a rejection test for support wider than f/N. The print-detail Python references are regenerated with matching padding, and the tier acceptance report is regenerated. |
| Print JPEG metadata (#278) | Output metadata; pixels unchanged | JFIF 1.02 APP0 (units 0 or 1, uint16 densities). TIFF 6.0 (RATIONAL XResolution/YResolution, SHORT ResolutionUnit = 2, ascending tags, aligned offsets). Exif 2.32 (CIPA DC-008-2019): ExifVersion is mandatory, UNDEFINED[4] `"0232"`. | `test/print-jpeg.test.ts` parses APP0 and both IFDs: tag order, types, counts, offsets, exact rationals, and the omitted-density case. The pixel path is checked against an independent linear-light area reference within 1 code. |
| Capacity binding and saturation flag (#280) | Readout model unchanged (2.0.0) | A consistency fix. A sample is reported as digitally saturated exactly when its quantized code reaches the declared white level and the RAW code is clamped there. Physical full-well, pre-ADC and digital saturation stay separate. | `test/sensor-raw-pipeline.test.ts` (mismatched assessments are rejected; exact white-level boundary on both paths); the regenerated `readout-backend-reference.json` oracle. |
| Auto-ISO grid matching (#281) | No model change | A numerical-tolerance fix: the existing `settingEquals` (32·EPS) tolerance is applied to the two directional grid selectors. | `test/priority-auto-iso-resolver.test.ts`: grid-aligned exact-match cases that fail on the old code. |
| Crop rounding, canonical JSON, result contract (#282) | No physics change | Exact integer rounding, serialization and validation fixes. | `test/crop-integer-rounding.test.ts` (exact BigInt oracle, exhaustive subject heights), `test/canonical-json.test.ts`, `test/calculation-quality.test.ts`, responsivity and EQE key-order tests. |
| Performance (#285–#288) | No model, equation or unit change | Outputs are bit-identical. | `test/native-environment-bit-identity.test.ts`, `test/calculation-result-finite.test.ts`, `test/native-capture-sdr-kernel-parity.test.ts`, `test/export-jpeg-byte-identity.test.ts` (against a frozen pre-change encoder), `test/stabilization-evaluation-identity.test.ts` (digests from the old code), `test/native-yield-cadence.test.ts`, `test/native-environment-optical-stage.test.ts` (reuse equals a full recompute). |

Nothing in this release establishes calibrated physical accuracy for any camera, lens or sensor. The bounded and synthetic limits recorded in earlier release records still apply.

## Compatibility and migration

This is a breaking major release. The [changelog](../CHANGELOG.md#breaking-changes) gives each break with its migration. In summary:

- **RAW noise:** realized codes and per-site seeds change for every seed. Noise model 0.1.0/0.2.0 replays fail closed. Determinism and tile-width invariance are kept. Re-capture; 1.x realizations cannot be reproduced.
- **Depth of field:** near and far limits change for every input, and the far limit is infinite from H onward. Update stored expectations.
- **Camera rotation:** the sign of all three axes is reversed in the rotation mappings and everything built on them. To reproduce 1.x mapping results, negate pitch, yaw and roll rates. `estimateCameraShakeBlur()` changes only the pitch sign (`deltaYmm`/`deltaYPixels`); negate the pitch rate to reproduce 1.x.
- **Complex-pupil PSF:** grid-filling pupils now get larger, padded kernels with different values. Support wider than f/N is rejected. Read geometry from the returned kernel.
- **Crop:** the longer axis can be 1 px smaller; subject framing no longer clips subjects that fit.
- **Canonical JSON, result factories, responsivity:** non-plain objects and holes are rejected, factories require quality and provenance identity, and electrical conditions are always validated and returned parsed.
- **Spectral channel binding:** sorted-key serialization; 1.x bindings fail closed.
- **POC server:** returns 413, 500, a fixed-message 400 and a bodiless 204.
- **Composed POC response:** `simulatePocCamera()` output changes through `depthOfField`, `crop.*` and `cameraShake.*.deltaYmm` (pitch). Its request and response shapes are unchanged. Whether `POC_SIMULATION_API_VERSION` should be bumped is an open owner decision.
- **Additive:** optical-stage reuse, `PrintJpegInput.pixelsPerInch`, and the `LensComplexPupilPsf.sampling` field with the `LensComplexPupilPsfSampling` type. No root export was removed: comparing the generated `docs/api/exports.json` against `v1.5.0` shows seven added symbols and none removed.

New captures and plans record creator identity 2.0.0. Existing archives keep their original creator identities and fail closed where an identity they bind has changed.

## Rights and licensing

- **MurmurHash3:** `src/sensor/stochastic-seed.ts` is an independent implementation of the public-domain MurmurHash3_x86_32 algorithm and `fmix32` finalizer by Austin Appleby (SMHasher). The upstream `MurmurHash3.cpp` places the algorithm in the public domain. No upstream file is vendored. The provenance is recorded in [THIRD_PARTY.md](../THIRD_PARTY.md), and the implementation is checked against published test vectors.
- No other third-party code, data, tables, model weights or calibration material is added. `test/helpers/legacy-export-jpeg.ts` (#286) is a frozen copy of this repository's own Apache-2.0 encoder, used as a test oracle.
- No new runtime dependency. Development dependencies are unchanged by this preparation.
- The SPDX header, licence, identity and browser-surface gates run in `npm run check` (results below). Every included commit carries the owner's DCO `Signed-off-by`, added on owner-directed PRs under the owner's October 11, 2026 policy. AI-assisted material still needs the owner's substantive human review before release.

## Privacy and security

- The only change relevant to security is error handling in the repository-only POC server (#282). It now returns 413 for oversized bodies, closing the connection; a fixed 500 message with no internal error text; and a fixed malformed-JSON 400 message with no parser text. It also removes the 204 body. This **reduces** what the server reveals. The server stays loopback-oriented, unauthenticated, development-only and outside the published package.
- Canonical JSON now rejects non-plain objects instead of silently hashing them as `{}`. That removes a way for different inputs to bind identically.
- No new network access, persistence, telemetry, upload, account, remote code or hosted service. The new yield cadence uses `performance.now()`, which is browser-safe. The browser-surface gate covers the root package.

## Known historical evidence not regenerated

These committed records are dated evidence bound to pre-2.0.0 outputs. They are kept as written and are **not** regenerated in this candidate:

- **`test/fixtures/producer-export-acceptance/` and `test/fixtures/paired-export-acceptance/`.** These hold RAW, DNG and JPEG artifacts made with the 1.x noise seed schedule, and they are bound to external LibRaw/Adobe/editor review records. Regenerating them would invalidate that external evidence. CI does not regenerate them, and their tests verify the committed artifacts, not a fresh capture. Any new external review needs fresh artifacts from 2.0.0.
- **`docs/validation/` records made with pre-2.0.0 noise, rotation or PSF behaviour**, such as `docs/validation/native-raw-print-2026-10-04/`. They stay valid as records of the code that produced them, but they are not 2.0.0 evidence. `docs/validation/tier-acceptance-report-v1.json` *was* regenerated in #284. The native SDR validation hashes (`docs/validation/native-capture-sdr-*.jsonl`) are still reproduced exactly after #286.
- **`docs/validation/print-196-candidate-evidence.json` (the 1.2.0 #196 candidate inventory).** It pins pre-change hashes of the print-detail generators and fixtures that #280 (readout reference) and #284 (depth and pupil-convergence references) regenerated. No gate reads it. It is an immutable candidate record. Re-recording it, if it is still in use, is up to its owner (#196). It is not proof for the 2.0.0 code.

## Deferred items

These are left out of 2.0.0 on purpose and stay with their existing issues:

- **#276:** dark-current exponential interpolation; consistency between error classes (`InvalidConfigurationError` and `InvalidScientificInputError`); freezing result envelopes, which was not done because a deep freeze adds a cost to every result on hot paths.
- **#275:** planning once per CFA phase; a lean per-site executor that avoids the validated per-site parsing still on the reuse path; worker parallelism.
- **#277:** the GPU execution path.

## Pending owner decisions

1. **`POC_SIMULATION_API_VERSION`.** `simulatePocCamera()` response values change (`depthOfField`, `crop.*`, and the pitch sign of `cameraShake.*.deltaYmm`), but the shape does not. This candidate leaves the version at `0.20.0`. The owner decides whether it should be bumped before tagging.
2. **`docs/AGENT_DOMAIN_RULES.md`, spatial camera rotation section.** It still says `estimateCameraShakeBlur()` "keeps its legacy … sign semantics", which is now out of date for pitch. That file holds shared agent rules, so changing it needs the owner's approval. This candidate does not edit it.

## Release gate results

Run locally on this candidate (base `d01d04b` plus this preparation change) under Node 24.21.0 and npm 11.19.0 on linux/x64 (4 vCPU). These are local results; exact-head GitHub CI on the PR remains the authoritative multi-Node run.

| Command | Result |
| --- | --- |
| `npm ci` | Passed: 143 packages added. `npm audit` reports one high-severity advisory in the transitive **development-only** `source-map-js` 1.0.0–1.2.1 ([GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q), event-loop denial of service from crafted source maps). The published package has no runtime dependencies (`npm ls --omit=dev` is empty), so it does not ship. The lockfile is unchanged apart from the root version; any dependency update belongs in a separate PR. |
| `npm run check` | Passed. Static gates: eslint, tsc, dependency licences (Apache-2.0 15, BlueOak-1.0.0 1, BSD-2-Clause 6, BSD-3-Clause 2, ISC 7, MIT 125, MPL-2.0 12), SPDX headers for src and scripts, project identity, and the browser surface across 153 reachable modules. Vitest: 189 files passed, 1 skipped; **2,377 tests passed, 1 skipped**. |
| `npm run coverage` | Passed: 189 files passed, 1 skipped; 2,377 tests passed, 1 skipped. All files: **92.16% statements, 88.58% branches, 98.86% functions, 92.32% lines**, above the existing thresholds. |
| `npm run build` | Passed (`tsc -p tsconfig.build.json`). |
| `npm run pack:check` | Passed: 916 files, root export only, local POC API excluded. |
| `npm run docs:check` | Passed: API reference regenerated with no drift (1,234 root symbols across 138 modules); 240 Markdown files, 2,482 repository and local links, 68 complete importing examples and 26 explicit fragments. |
| `npm run release:consumer-check` | Passed: packed `@photivra/engine@2.0.0`; 68 strict typed and running documentation snippets, plus the quick-start and production/paired-export consumers, passed without a source checkout or dependencies. |

All gates passed on their first run. None timed out or needed a rerun.

## Remaining release checklist

- [x] Version surfaces aligned with `npm run release:prepare -- 2.0.0`; `POC_SIMULATION_API_VERSION` and independent schema and model versions are not changed by the preparation.
- [x] 2.0.0 changelog entry with breaking changes and migration, fixes, performance and new API.
- [x] Generated API reference regenerated, with no drift.
- [x] Local release checks run on this candidate (above).
- [ ] Owner decisions: `POC_SIMULATION_API_VERSION`; the `AGENT_DOMAIN_RULES.md` shake-sign sentence.
- [ ] Owner's substantive human review of the included AI-assisted changes and of this record.
- [ ] Green exact-head CI on the release PR, then green CI on `main` after merge.
- [ ] **The owner's explicit approval to tag `v2.0.0`.** The tag triggers npm publishing. Confirm first that 2.0.0 is not already on npm, and never move or overwrite `v1.5.0`.
- [ ] After publication: verify the npm version, dist-tag, tarball integrity and provenance; publish matching GitHub release notes; update publication dates in `CHANGELOG.md`, `README.md`, `docs/DEVELOPERS.md`, `SECURITY.md` and this record. Downstream adoption is a separate step.
