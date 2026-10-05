# 1.5.0 release preparation — review-ready draft

Review snapshot: 2026-10-05. This document prepares the next engine release; it does not certify, merge, tag, publish or activate a downstream application.

**Proposed version:** `@photivra/engine@1.5.0`, with `ENGINE_API_VERSION = "1.5.0"`. The backward-compatible public `NativeRawInput.tileWidth` option warrants a minor release rather than describing the entire change as a patch-only fix. This is an engine release identity, not the separate application's public Beta label.

**Metadata has not yet been bumped.** The latest draft code and this preparation branch still identify as 1.4.0. Do not publish either with that already released version. Version alignment, regenerated references and final-candidate validation are outstanding gates below.

## Published baseline and exact candidate inputs

- Published GitHub release: [v1.4.0](https://github.com/Photivra/photivra/releases/tag/v1.4.0), published on 2026-10-04.
- At this review, `main` and `v1.4.0` both identify commit `240340ec9e23ef79b6a0d729f494b2a531dd6df4`; their comparison contains no new commits or changed files.
- [PR #223](https://github.com/Photivra/photivra/pull/223), head `04baece1a8d1a133db3e7a2f0c9daa0d662bb826`: optional native RAW execution chunks and preservation of the exact acquisition plan during same-RAW development.
- [PR #225](https://github.com/Photivra/photivra/pull/225), head `70f55f5e27795d2fa51d112fbee1b14ee097b6ce`: experimental separable ideal-emission work, stacked on #223.
- This preparation branch starts at the #225 snapshot so neither draft is silently omitted from the review. That ancestry is not approval to ship either change. Reconcile this document whenever a source PR changes, is excluded, or is rebased.

The v1.4.0 GitHub release is verified here. A fresh direct npm-registry check was unavailable in this review; do not infer current registry dist-tags or integrity values from the GitHub release alone.

## Proposed release notes, subject to the gates below

### Bounded native RAW execution and development

Add an explicit integer `NativeRawInput.tileWidth` from 1 through 256 native sites. Omission preserves the existing 256-site execution and the original plan shape. The option controls provider request width, tile count and host-yield frequency; it is not a physical sampling or quality control.

Preserve that acquisition width when validating and developing an owned native RAW result. Reject invalid widths, inconsistent tile counts and stale plans rather than silently reconstructing the default-width plan. Existing CFA coordinates, absolute-index noise seeds, shutter timing and RAW/developed values remain the intended invariant.

The existing 100,000 logical-query tile bound, two-billion arbitrary-provider event bound and native raster/output-byte limits remain in force. Smaller chunks can solve a tile-admission problem; they do not solve an over-budget whole event or establish optical convergence.

### Experimental source work is not a supported release feature

#225 explores an explicit uniform-spectrum, achromatic ideal-emission factorization with separately counted geometry evaluations and spectral compositions. It does not establish that an external source satisfies separability, that a full native fixture is qualified, or that a device meets time/memory requirements. See [the draft contract](SEPARABLE_EMISSION_DRAFT.md).

Do not advertise or expose this as a supported public API. At the current #225 head the prototype lives under `src/api/`, which is built for repository checks but excluded by the npm package manifest and unreachable from the root browser/package graph. Promotion out of that repository-only boundary would be a separate reviewed public-contract change. A successful test suite alone remains insufficient for scientific or production qualification.

## Blocking findings

### Resolved prerequisite: experimental distribution boundary

#225 now restores the published `src/capture/native-environment-raw.ts` implementation unchanged and moves the separable-emission prototype under `src/api/`. The repository's existing package-surface check excludes `dist/api/`, and the browser/root reachability check does not traverse the prototype. The 128-ray correctness regression also carries an explicit 15-second test budget so Node 24 timing variance is not misreported as a scientific failure.

This boundary must remain verified on the final candidate. Moving the prototype into a published module or root dependency graph would reopen the release blocker.

### 1. Scientific/source and resource qualification remain unresolved

[Issue #224](https://github.com/Photivra/photivra/issues/224) requires bounded full-event evidence and no hidden source assumption or raised safety ceiling. #225 proposes a distinct, four-billion scalar spectral-composition ceiling while preserving the two-billion legacy provider ceiling. Review whether this new source/work domain satisfies the approved scope; do not treat preserving the old ceiling as automatic approval of the new one.

Full-native depth/visibility/refinement results, independently checked output and measured resource evidence remain prerequisites for any newly claimed full-native capability. Keep source separability and transport unverified until evidence establishes them. Excluding the prototype from this release is valid; silently presenting partial-tile or synthetic controls as full-event qualification is not.

### 2. Substantive human review and contribution-specific DCO

Both input PRs are drafts and explicitly say their human review and contributor certification are pending. This preparation request and automated CI do not substitute for either. Follow [CONTRIBUTING](../CONTRIBUTING.md). This preparation document is also AI-assisted draft material and must be reviewed and certified before inclusion; no human sign-off is asserted here.

## Validation already available for the code snapshots

- #223 records 2,151 passing tests and one existing skip at `04baece`, with CI [37216829043](https://github.com/Photivra/photivra/actions/runs/37216829043).
- #225's corrected package-isolated head `70f55f5` passed CI [37384286949](https://github.com/Photivra/photivra/actions/runs/37384286949). The prior Node 24 timeout was addressed by an explicit correctness-test budget rather than changing scientific assertions or resource limits.
- The test counts above are taken from the source PR records, not a new local test execution. The inspected CI job outcomes establish those jobs' success, not review approval or scientific qualification.
- Neither snapshot is the final version-bumped release candidate. These results must not be reported as final 1.5.0 release verification. This preparation branch must rerun the matrix after every stacked-base or release-document change.

## Remaining release checklist

- [x] Isolate the experimental implementation from the published package/root dependency graph; keep package/browser-surface checks green on the final candidate.
- [ ] Explicitly settle source-model, separate-work-budget and qualification scope for any retained experimental work; keep unsupported full-native and production claims out of the release.
- [ ] Complete substantive human review and contribution-specific DCO certification for every included contribution.
- [ ] Reconcile the stacked PRs in dependency order. Retain branches while open dependent PRs need them; delete them only when their dependency ends.
- [ ] Set `package.json`, both root version fields in `package-lock.json`, `src/core/version.ts` and `CITATION.cff` to the approved next version. Set citation release date only to the actual intended release date.
- [ ] Add the final changelog entry, update live release-context prose and regenerate API documentation/`docs/api/exports.json`. Preserve historical release records, checksums and independently versioned POC/schema/model identities.
- [ ] Run the complete existing checks on the exact version-bumped candidate and inspect its actual npm tarball and root/declaration import graph.
- [ ] Review the complete final diff; merge only approved, certified work. Require green final-main CI and an approved final SHA/tree.
- [ ] Verify protected main/tag configuration and trusted publishing, confirm the next npm version is absent, then authorize the separate tag/publish step. Never move v1.4.0 or attempt to overwrite its package.
- [ ] After publication, independently verify the npm version, dist-tag, tarball integrity and provenance, and publish matching GitHub release notes. Downstream dependency adoption and application qualification remain separate.

## Candidate preparation and verification

After resolving the inclusion/review decisions, use a clean checkout of the approved candidate. The existing release contract remains authoritative for guarded owner publication; see [release procedure](RELEASE_1_0_1.md#owner-release-procedure). The commands below perform preparation and checks only, not a tag or publication:

```sh
npm version 1.5.0 --no-git-tag-version --ignore-scripts
# Align src/core/version.ts and CITATION.cff, finalize CHANGELOG.md and
# current release-context prose; do not rewrite historical evidence.
npm ci --ignore-scripts
node scripts/generate-api-reference.mjs
node --test .github/test-node-lts-policy.mjs
node .github/node-lts-policy.mjs
npm run check
npm run coverage
npm run build
npm run docs:check
npm run release:consumer-check
npm run pack:check
npm run bench:image-formation:built
npm pack --ignore-scripts --json
```

Inspect the resulting tarball, its emitted declarations/imports and its recorded hashes. Keep temporary archives/build evidence untracked unless an existing evidence policy explicitly requires them. Review current [Node support](../NODE_SUPPORT.md); do not reuse a dated runtime snapshot as proof of future support. Any source, version, documentation, exclusion or generated-file change requires checks against that changed candidate.

**Stop before tagging or publishing while any release blocker remains.** No release tag, npm publication, GitHub release, application dependency change, automation or safety-cap change is performed by this preparation.
