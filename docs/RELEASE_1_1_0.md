# 1.1.0 candidate review and migration

This is an additive, unpublished candidate after the 1.0.1 baseline. Package version and root `ENGINE_API_VERSION` are both 1.1.0. New standalone Print APIs are documented in [Print planning](PRINT_PLANNING.md). No existing scientific API is removed or reinterpreted; POC, capture schemas, formation graph and production-plan versions remain unchanged.

New capture/plan records created by this candidate carry root creator identity 1.1.0 and their hashes may change. Historical captures, qualified fixture files, measured artifacts and earlier release documents retain their original identities. A version bump is not renewed scientific qualification or printer-quality evidence. Use the exact reviewed release and its packaged documentation; this candidate is not yet available on npm.

Required review: public contract and exact-ratio policy, angular convention, independent numerical/geometry evidence, source/reuse rights, native-authority binding, no-upscale provider conflicts, backward compatibility and substantive human review of AI-assisted draft material. Review all DCO sign-offs before inclusion. Print planning does not activate exporting, perceived-quality assessment or production rendering.

Run the existing release gates without weakening them:

```sh
npm ci
npm run check
npm run coverage
npm run build
npm run pack:check
npm run docs:check
npm run release:consumer-check
```

Regenerate the root reference with `node scripts/generate-api-reference.mjs`. Strict examples run from an isolated packed ESM consumer with no source deep imports or runtime dependencies. Review CI across supported Node versions and inspect the actual package before owner tag/publication. The prior [1.0.1 procedure](RELEASE_1_0_1.md) remains historical; use 1.1.0 identities for this candidate and do not republish an existing version. Merge, tag and npm publication are separate owner decisions. No such action is performed by preparing this draft.

## Bounded diagnostic extension

The stacked #196 first slice adds the [regional coherent-grating diagnostic](PRINT_DETAIL_ASSESSMENT.md) and [independent protocol](PRINT_DETAIL_VALIDATION.md) to this unpublished candidate without changing Print model 0.1.0 or existing contracts. It validates mathematical coefficients and reference geometry only; acquired-image/backend, noise/artifact/perception and full scoped Print-release acceptance remain blocked in the ledger. Preparing or publishing the diagnostic must not imply those qualifications are complete. Reconcile candidate contents and human review before tagging; no 1.1.0 distribution has been published by this work.
