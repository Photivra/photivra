# 1.0.0 release contract and owner handoff

**Distribution:** `@photivra/engine@1.0.0` candidate. **Root API identity:** `0.116.0`. **Feature/science predecessor:** reviewed/signed main `34c6d9aca1c2e365b253c1562734d11bc8e0235f` (PR #206), tree `fa74373967843a1942206c26f5baa004e9a466fd`. Its post-merge CI 37032338620 passed Node 22.13.0/24 with 1,598 tests / 142 files. The release-preparation PR/CI identifies the exact new candidate; after signed squash merge, verify its tree equality and record final main SHA in the issue/PR handoff. A commit cannot contain its own cryptographic commit/tree identifier without a circular dependency.

## What 1.0 contains

The V1 feature/science checklist is 32/32 and required defect #178 is closed. The root includes explicit camera/sensor/capture geometry, optics, focus, exposure control, registered illumination, bounded motion/stabilization, spectral/response/charge/noise/readout foundations, generic tier assets, immutable production plans, linear/color/SDR processing, and same-RAW paired DNG/JPEG export. See [developer navigation](DEVELOPERS.md) and [composition/consumer map](V1_COMPOSITION_MAP.md) for actual entry points and supported combinations.

The declared environment production route can execute all fourteen graph stages through native RAW and optional output. It retains a full-native 4,096-site budget and 100,000-provider-evaluation aggregate cap, exact one-to-one CFA timing, scene time zero, ideal environment projection/constant-axis rotation, explicit unity field throughput and optional destination-local sampled PSF. Paired reference export supports registered Bayer and 1:1 output cropping. Structural RAW attachment has a separate 65,536-site ceiling and does not authorize larger execution.

The package does not supply a general surface renderer/visibility solution, calibrated commercial profiles, full field-dependent PSF transport, megapixel processing, HDR output, multi-frame computational image combination, C2PA, hosted API or MCP server. Generic assets and provider output remain approximations. A stable API does not establish calibrated physical accuracy, universal tier ranking, combined uncertainty, browser frame time or typical-resolution peak memory. Export/editor evidence and limits remain in [acceptance](EXPORT_ACCEPTANCE.md).

## Migration and independent identities

The distribution moves from 0.6.0 to 1.0.0. Root contract **0.116.0 is retained**, rather than mechanically reset to 1.0.0: no exported operation shape, scientific arithmetic, default, seed schedule or serialized capture identity changes in this preparation. This is an intentional independent contract identity under the package's new stable policy, not permission to keep making undocumented pre-1.0 breaks. Existing 0.116 callers require no code/data migration for this release preparation.

Users of earlier development contracts must apply their actual intervening migrations. In particular, old producer noise model 0.1.0 cannot silently replay the signed-shadow correction: current producer noise model is 0.2.0, readout provenance model 2.0.0. Deliberate recomputation preserves historical artifacts and records new identity. Capture schema 0.1.0 archives normalize to 0.2.0 while retaining creator API identity; normalized bytes change. Production plan 0.7.0 / consumer manifest 0.2.0 add bounded environment execution fields. See the governing capture/producer/composition guides and historical changelog. Do not compare version strings from different contracts as though they form one global schema version.

POC API 0.20.0, image-formation ordering 0.4.0, production capture snapshot 0.3.0, tier assets 1.0.0 and every other schema/model keep their existing independent values. Root API 0.116.0 still exports all original scientific operations. Documentation-only comments and reference generation do not authorize recomputation of historical calibrated data or fixture hashes.

After 1.0, compatible additions use package minor releases, compatible fixes/docs use patches, and breaking root exports, semantics or unsupported reinterpretation of previously valid data require a documented package major transition and relevant independent contract changes. Prefer additive deprecation with an explicit migration and documented removal version. No fixed deprecation duration is promised. Necessary scientific/security corrections must be explicit even when preserving incorrect behavior would appear easier. No substantial optional public-engine feature work starts by default after V1; maintenance, corrective science, validation and security continue.

## Exact candidate verification

Use the lockfile and maintained Node 22/24 CI policy, preferably patched Node 24 for tooling:

```sh
npm ci
npm run check
npm run coverage
npm run build
npm run pack:check
npm run docs:check
npm run release:consumer-check
npm run bench:image-formation:built
```

`docs:check` verifies reference synchronization, local/public repository links, imported symbols and explicitly recorded complete/fragment examples. The consumer check packs once into a temporary directory, installs the tarball with scripts disabled, validates declarations with strict TypeScript and executes complete examples plus the bounded production/export example without a source checkout. CI runs these release-specific checks on both supported runtimes. Existing science/license/SPDX/browser/package/coverage gates remain unchanged.

Local macOS full tests retain the previously reproduced unchanged-main `equivalence-38` exact hash difference. No reference was regenerated. Linux CI is the exact-head full-suite authority; recorded cross-platform deterministic limitations must remain visible rather than weakening that assertion. Existing performance and external-editor acceptance evidence applies because runtime arithmetic and independent models are unchanged; release comments/version metadata are additionally checked against the packed artifact.

## Owner-only tag and publish procedure

This ticket prepares the repository; it creates no tag, npm publication or GitHub release. First substantively review the release contribution and certify DCO 1.1 for the signed merge. Merge only the tested candidate, verify final-main CI and record its commit/tree. Confirm current main still equals that final commit immediately before tagging; keep it unchanged through workflow verification.

The current `.github/workflows/publish.yml` triggers on pushed `v*` tags. It requires **`v1.0.0`**, matching package/lock/citation metadata, at **current main**, with protected main and a protected tag. Public API inspection on 2026-10-02 confirmed main protected and an active tag ruleset applying to `refs/tags/v*`, blocking creation/update/deletion except authorized bypass. Only an authorized owner can create the release tag; do not weaken those controls.

From a clean owner checkout, replace `FINAL_MAIN_SHA` with the verified merged commit:

```sh
git fetch origin main --tags
git switch main
git pull --ff-only origin main
test "$(git rev-parse HEAD)" = "FINAL_MAIN_SHA"
test "$(git rev-parse origin/main)" = "FINAL_MAIN_SHA"
test "$(node -p "require('./package.json').version")" = "1.0.0"
git tag -a v1.0.0 FINAL_MAIN_SHA -m "Photivra engine 1.0.0"
git push origin refs/tags/v1.0.0
```

The **tag push automatically starts npm publication**; publishing a GitHub release alone does not. The workflow checks the maintained LTS policy, installs locked dependencies with scripts disabled, verifies science/coverage/static/docs/consumer/build/package gates, then packs the verified artifact. A separate minimal OIDC job downloads it, checks SHA-256 and publishes public npm only if that exact version is absent. It requires npm >=11.5.1 and the configured trusted publisher for this repository/workflow. That npm account-side configuration is not inspectable through the repository connector and is an owner account prerequisite; no credential or publishing identity is used during this ticket.

Watch the publish workflow until success. Verify npm reports 1.0.0 and record the published tarball integrity. Then create the owner GitHub release at `v1.0.0`, using these release notes and the final commit/check evidence. If verification fails, retain the failure and investigate; do not force-move a protected tag or bypass science/provenance gates.

The site-side handoff is in [developer navigation](DEVELOPERS.md); no website deployment or unpublished route is required. #165 remains post-V1.
