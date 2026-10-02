# Final 1.0.0 preparation audit

**Historical 1.0.0 record.** The 1.0.0 release is published. This document preserves its preparation evidence and original policy snapshot. For current Node support, aligned package/root versions and the next owner release procedure, use [1.0.1 release preparation](RELEASE_1_0_1.md) and [NODE_SUPPORT.md](../NODE_SUPPORT.md).
Package **1.0.0 candidate**, root API **0.116.0**, based on reviewed/signed main **34c6d9aca1c2e365b253c1562734d11bc8e0235f**. No tag, npm publication or GitHub release is performed by this contribution. The review PR and exact-head CI identify the candidate; the final signed squash commit/tree and post-merge CI belong in the issue/PR handoff after owner approval. [Owner release steps](RELEASE_1_0.md) specify that boundary.

## Inventory and corrections

[The audit inventory](validation/release-audit-inventory.json) records all **62 pre-existing human/agent Markdown documents** and **141 source modules**. It includes document hashes and normalized source-syntax hashes, not private filesystem paths. All source syntax is identical to the feature/science baseline when comments are removed. Source JSDoc grows from 814 to 1,060 blocks, including module integration notes, previously undocumented exported operations, central state records and non-obvious internal execution algorithms. Existing member unit/coordinate documentation is retained. [The generated reference](API_REFERENCE.md) resolves **1,130 root symbols across 126 modules**, including exact accepted unions, fields, signatures and independent constants; it is regenerated/checked against the compiler's actual root exports.

| Reviewed surface | Findings and disposition |
| --- | --- |
| README, usage and onboarding | Corrected pending SDR integration, closed editor acceptance, extended-motion/stabilization scope and obsolete package/stability statements. Added one developer entry point with capabilities, qualified models/runtime and executable packed examples. |
| Architecture, physics, stage/production contracts | Reconciled static broad foundation/reserved metadata versus route-specific plan 0.7.0 execution; preserved sample/attached-RAW blockers and all source/area/wavelength/time/calibration limits. No broader capability is inferred. |
| Capture, RAW, processing, export, color | Corrected unmerged-draft/old issue status; preserved same native RAW lineage, signed shadows, separate ideal virtual-camera versus sensor-channel interpretation, one-time WB, correction/order and bounded export envelope. |
| Tier/conformance/performance evidence | Reconciled reviewed/merged #116/#119/#43/#45/#131 and 32/32 status. Introduction IDs and measured commits remain historical; no fixture/golden/benchmark data is relabeled as new measurements. |
| External export evidence | Carried forward PR #201 owner Lightroom orientation/as-shot/exposure/WB and landscape Photoshop/Chrome screenshots. User-Mac hashes/builds and JPEG-variant coverage remain explicitly limited; templates remain templates. No new commercial tool installation or external result is claimed. |
| Source public/internal contracts | Added plain-language purpose/input/return/stage-limit explanations and non-obvious RNG/Poisson/normal, signed readout, compensated temporal sums, provider preflight, evidence composition, color conditioning and TIFF/JPEG encoding notes. 141-module comment-free syntax comparison confirms no runtime changes. |
| AGENTS/contributing/security/support | Removed obsolete pending integration ownership, aligned 1.0 compatibility and maintained Node policy, retained human review/DCO/science/provenance/private-data boundaries and loopback-only contributor transport. |
| Distribution/legal/provenance | Coordinated package/lock/citation 1.0.0, retained every independent contract version, kept no runtime dependencies and Apache/DNG notices, completed pinned artifact-action inventory, shipped readable policies and npm-safe README links. Existing license/SPDX/package/browser gates remain unchanged. |
| Automation/publishing/discovery | Added docs/packed-consumer verification to existing CI/publish verification jobs; retained separate minimal OIDC publish job, protected exact-main tag and tarball checksum controls. Confirmed public protected main and active v* tag ruleset. Account-side npm trusted publisher remains an owner publication prerequisite. |
| Site handoff | Engine repository/package/docs are public navigation destinations. Site-side discovery #45/navigation #298/environments #300 own hosting and links; no unpublished route/deployment is invented. Site content was not verified after HTTP 403. |

## Examples, paths and package verification

The automated documentation checker validates **2,096 repository/local links** in the current Markdown tree and generated reference synchronization. It verifies every importing snippet's actual root symbols. **63 complete importing snippets** typecheck strictly and execute in an isolated ESM consumer installed from the real packed candidate, plus quick-start and production/paired-export examples. The latter uses the existing final-conformance fixture through the actual public package, not copied runtime algorithms or test-helper imports.

**26 composition fragments** have explicit prior-binding captions and [a dependency inventory](validation/documentation-fragments.json). These illustrate joining previously validated domain values; they are not claimed to run without those inputs. The public complete production example supplies actual owned synthetic data without inventing calibration or implicit defaults. Repository/local navigation is verified against actual paths/anchors, including public main-source links; external standards and archived references are citations rather than runtime fetches.

Pack checks retain root-only ESM/declaration surface and exclude `src/api`, source, tests and tooling. The package includes README, docs, examples, LICENSE/NOTICE and the referenced policy files so consumer links do not require a checkout. Documentation hosting and application implementation remain outside the package license boundary.

## Validation and exact candidate evidence

- Exact locked dependencies; maintained Node policy unchanged, official lifecycle reviewed 2026-10-02 (22 Maintenance LTS / 24 Active LTS; 26 still Current).
- Static/type/lint, license allowlist, SPDX, identity and browser graph pass; 138 browser-reachable modules.
- Local full check and coverage: **1,597 passing / 1 known unchanged-main Mac `equivalence-38` exact hash failure**, 142 files. No golden, assertion, threshold, scientific tolerance or seed schedule is changed. Exact-head Linux CI on Node 22.13/24 remains the required passing full-suite authority; attach its outcome to the review PR before merge.
- Build, root/package-content check, documentation/reference check and real packed-consumer declaration/runtime checks pass. The informational existing image-formation benchmark completes. Recorded tier/performance/independent-reader/editor acceptance remains applicable within its prior explicit limits because runtime syntax and model identities are unchanged.
- Final diff preserves scientific execution syntax across all 141 modules. Source comments, distribution metadata, docs and release-verification tooling are the changes.

Substantive owner review and contribution-specific DCO 1.1 certification are still required for this release-preparation contribution. After signed merge, final-main CI and tested-tree equality must be recorded before #180 closes and the owner tags `v1.0.0`. This audit does not certify an untested later commit or publish any artifact.
