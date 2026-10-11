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
3. Preserve backward compatibility of public APIs and schemas unless a deliberate, documented breaking change is made; a breaking change ships only through an owner-approved release.
4. Keep the root public package browser-safe and keep Node-only tooling out of the published package surface.
5. Never weaken CI, security, provenance, licensing, SPDX, identity, browser-surface, or package-surface gates to make a change pass.
6. Never commit secrets, credentials, private keys, private datasets, or restricted material.
7. Call out any new monetary cost before adopting a paid service, dependency, dataset, or infrastructure component.

## Agent permissions

The owner's approval policy (October 11, 2026) controls. Once the owner has asked for the work, everything outside the approval column needs no further approval.

| Agents may do without asking | Needs the owner's approval for that action | Never |
| --- | --- | --- |
| Read-only inspection; tests; code, docs and test changes; branches and pull requests; merging (a merge to `main` publishes nothing; npm publishing runs only from a release tag); CI; issues; migrations; refactors; dependency changes; public API or schema changes, including breaking ones, before release; persistence, telemetry, network, upload, account or hosted-service work that is not yet released; third-party material that is not yet released; adding the owner's DCO `Signed-off-by` to commits in owner-directed pull requests; deleting a merged pull request's branch | Changes to `AGENTS.md`, `CLAUDE.md` or shared agent rules; anything that goes to production: a release, a release tag (it triggers npm publishing), package publication, production data or infrastructure, production DNS/routing; spending: a new paid service or spending beyond an approved budget; credentials: creating, rotating, granting or deleting tokens, keys or secrets; destructive or irreversible actions: deleting data or resources, rewriting history, force-pushing, deleting protected or unmerged branches | Introduce copied, restricted or ambiguously licensed code, data, calibration material or protected expression; fabricate accuracy, calibration, uncertainty or performance claims; weaken a CI, security, provenance, licensing, SPDX, identity, browser-surface or package-surface gate or a coverage threshold; put Node-only tooling in the published package; commit secrets or private datasets |

### Required evidence in the release request

Scientific, legal, rights, privacy and design/security checks happen at the release gate, not before. Every release or publication request must document, with sources:

- **Science:** each changed model, equation or assumption follows accepted science from reputable sources and is evidence-based; cite those sources in the request. The owner is not a scientist, so the request carries the evidence.
- **Rights and licensing:** provenance and license compatibility for any incorporated third-party material, recorded in `THIRD_PARTY.md`, with SPDX and DCO gates green.
- **Privacy and security:** a design/security review of any persistence, telemetry, external network call, upload, account, remote code or hosted-service dependency.
- **Compatibility:** any breaking public API or schema change, its version bump and migration notes.
- **Release gates:** the full release check results on the exact tagged commit.

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
- `docs/SCIENTIFIC_ASSURANCE.md` — cross-engine status/evidence/uncertainty composition rules.
- `docs/API_STYLE.md` — public API and versioning conventions.
- `docs/NUMERICAL_CORRECTNESS.md` — physical-unit, finite-number, tolerance, rounding, and numerical-determinism rules.
- `scripts/` — CI, package-surface, license, identity, and browser-boundary gates.

## Sources of truth

- Scientific equations and behavior are defined by implementation plus tests; documentation must agree with them.
- Public API shape and semantics are defined by exported TypeScript contracts, tests, and `docs/API_STYLE.md`.
- Root engine compatibility is versioned by `ENGINE_API_VERSION`; the composed `simulatePocCamera()` request/response contract is separately versioned by `POC_SIMULATION_API_VERSION`. From 1.0.1, ENGINE_API_VERSION must equal the npm package version; the POC contract stays independent.
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

## Detailed domain implementation rules — read by scope

The full previously binding scientific, sensor, image-formation, optics, exposure, radiometry, temporal, capture, processing and runtime-boundary requirements now reside verbatim in [docs/AGENT_DOMAIN_RULES.md](docs/AGENT_DOMAIN_RULES.md). **They remain mandatory** for relevant changes; this edit does not relax any scientific model, unit, provenance, API, public package or release check. Before changing a domain, read its matching headings and their named canonical specification files; when changing multiple domains, read all affected sections.

For efficient task-scoped retrieval, consult the relevant headings rather than reading unrelated rules:
- **Sensor/coordinates/capture:** sensor/capture/coordinate-system rules; image-formation contract; production image-formation, linear capture, SDR output and composition.
- **Scene light/exposure/radiometry:** scene radiance, shared spectral composition, temporal illumination, metering, mode-specific exposure and scene-to-sensor irradiance boundaries.
- **Optics/focus:** PSF/pupil, diffraction-related image formation, vignetting, CA, radial distortion, focus breathing and related source coverage.
- **Motion/timing:** temporal production composition, rotation, stabilization and moving-source boundaries.
- **Public interfaces/tooling:** public API/compatibility, runtime and browser/package boundaries, version requirements and linked tests.

Retain the root non-negotiable rules, compatibility, privacy, licensing, DCO, and test requirements for every task. Do not treat a moved rule as historical, optional, superseded or satisfied merely because it is not in the root file.

## Security and privacy

- Never commit credentials, API keys, tokens, private keys, secrets, private datasets, or restricted calibration material.
- Treat external JSON and other untrusted inputs as untrusted at runtime; TypeScript types are not validation.
- Keep the local POC server loopback-oriented and unauthenticated-development-only.
- Persistence, telemetry, external network calls, uploads, accounts, remote code, or hosted-service dependencies may be developed freely; their design/security review is required evidence in the release request. A hosted or paid service still needs spending approval.
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

### Evidence-first execution (existing issue and CI only)

For any nontrivial work unit, first identify the governing implementation/API and domain-specific rules, the existing issue/PR owner, matching merged or in-flight work, exact still-valid accepted evidence, and the smallest missing behavior/proof. Keep one short current state **in the existing owner ticket**, updated in place: accepted source/commit, exact missing result, next action, actual blocker and evidence links. Preserve history in issue edits/comments and immutable proof. This is not a new form, approval or mandatory CI gate.

- Classify states precisely: source-complete, hosted-unverified, verified, blocked, invalidated or release-qualified. Reuse exact-source/engine/tool/asset/backend-bound passing evidence only while applicable and current. Re-run what changed; new scientific assumptions, source, runtime, lock, numeric tolerances, package behavior or revoked evidence invalidate their affected checks.
- Follow task-scoped owner approval for its normal engineering substeps; do not repeatedly solicit the same settled scope decision. External costs and published release authority remain separate approvals; rights/provenance, security/science assurance and any public API break are required evidence in the release request. A prior consent does not establish independent verification.
- After repeated same-boundary failures, diagnose logs, relevant contracts and prior commits before another attempt. Use safe deterministic regression fixtures where useful; avoid speculative near-duplicate patches, uncontrolled gigantic numeric events, and a fake success achieved by weakening assertions. Do not use fixed retry counts instead of identifying the cause.
- Keep one reusable engine model per physical phenomenon. Prefer existing API/helpers and deterministic tests, and parallelize only independent owners (e.g., existing #251 → #235 → #224 Focus reference chain, not simultaneous competing solvers). Distinguish local source/analytic proof from real browser/device-qualified capture.
- Run scoped tests during development and retain the existing exact-head full coverage, packaging, provenance, DCO, security and license gates for merges/releases. Avoid a second CI implementation or duplicate wrappers where one accepted check already covers the input.
- Close with the actual tested SHA, genuine results, unsatisfied obligations and next existing owner. Skip blocked tasks for independent work, without inventing qualification or new umbrella tickets.

- After a pull request is merged, delete its source branch promptly. If the environment cannot delete branches (the Claude Code cloud git proxy refuses it), say so and leave the deletion to the owner or the repository's automatic head-branch deletion. Do not delete the default branch, protected/release branches, or a branch that is still required by another open PR or documented active dependency. Any retained merged-PR branch must have the reason documented and must be deleted when that dependency ends.
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
