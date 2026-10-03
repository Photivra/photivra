# Native capture SDR candidate review

Technical review date: 2026-10-03. Initial PR #216 head: `1bfdb87c6111299dda4649b03d787e6aff60cf15`; base: `a57bdecd73e1b64ab404415ae95494423756286a`. This record and its follow-up tests are AI-assisted draft material. They support, but do not supply, the substantive human review required by [repository instructions](../AGENTS.md) and [provenance policy](PROVENANCE.md#ai-assisted-work).

## Scientific and execution assessment

The new executor calls the existing `calculateSdrRendering` for every tile. Its supported exposure normalization, tone curve, gamut policy, transfer and quantization are component-local; no operation needs neighboring pixels or full-frame statistics. Consequently a tile partition preserves the reference arithmetic. The reference implementation and its 262,144-component guard are unchanged. New parity tests compare every integer component and aggregate diagnostics across 256-column/32-row boundaries using both declared float precisions, both bit depths, both tone curves and both gamut policies. Float32 comparisons use the actual float32-rounded source values; they do not assert float64 fidelity. Independent endpoint/tie and megapixel-coordinate tests supplement shared-implementation parity.

The source parser enforces RGB channel order, plane dimensions/binding, transform history, external layout, finite positive reference white and capture identities. Planning adds the exact linear-sRGB/D65 profile/reference white, completed WB state, fresh output state, representable rendering scale, raster caps and output admission. A valid capture containing pending WB intent is deliberately rejected. Four oriented off-center active-capture cases now compare actual reference pixels as well as retained geometry. Later output crop intent stays in the capture; this API does not execute that crop on an active-capture plane.

The [ICC sRGB registry](https://registry.color.org/rgb-registry/srgb), checked on the review date, supports the unchanged transfer constants, primary/white coordinates and 80 cd/m² encoding reference. These are mathematical/encoding facts, not a calibrated camera, perceptual gamut mapping or a display measurement. Exposure is post-capture rendering scale; positive per-channel Reinhard can alter chromaticity. Capture saturation, noise, source range history and physical exposure are retained separately from output clipping. No new physical equation, WB estimator, serializer, correction/resampler or production stage is introduced.

## Source and resource assessment

The change introduces no runtime dependency or copied third-party image, profile binary, calibration dataset or implementation. The benchmark generates a coordinate ramp directly into bounded tiles. Its source SHA declarations are explicitly synthetic placeholders. The ICC reference is used to check numerical facts; no reference prose/code/data is incorporated by this review. These observations do not certify original authorship, rights to distribute or absence of patent claims. Contributor review and DCO remain required.

Admission precedes retained output allocation and tile acquisition. Provider backing storage is bounded, not just its visible view. Precision/rectangle/source identifiers and exact stride length are checked; padding is ignored and nonfinite image values fail. SharedArrayBuffer rejection now has a regression. Logical scratch is provider storage plus packed input, parser copy and four reference output arrays: `32768 × 8 + 256 × 32 × 3 × 8 × 6 = 1,441,792` bytes. JS allocation/GC overhead and provider/device memory are excluded. Retained output limits are 72 MB at 8 bits and 144 MB at 16 bits.

The task keeps partial output private, clears it on failure/cancel/dispose, and transfers it once. Activity is checked after both acquisition and host yield. Added tests cover disposal while a yield is pending, late settlement, and real timer cancellation. A provider that ignores abort can still delay settlement; caller resource reuse requires draining the pending run. Host scheduling, artifact authentication and source/device admission remain caller responsibilities. Identity declarations do not authenticate supplied samples.

## Compatibility and release assessment

Package, lock root, citation and engine API are aligned at 1.2.0. Schema, model, POC and plan identities remain independent. The runtime diff adds a root module/export and version increment; it does not alter existing rendering equations or API contracts. Archived JPEG fixtures, manifest bytes/hashes and independent decoder evidence are unchanged. Golden replay uses the recorded creator, while a separate current-creator regression checks current exports and identical integer pixels.

The follow-up corrects 49 current release-context headers to 1.2.0 and links them to the current release procedure. Historical introduction/measurement values are retained. The additional 24 MP/16-bit benchmark measures the maximum retained code buffer; see [validation evidence](NATIVE_CAPTURE_SDR_VALIDATION.md). No universal performance threshold follows from those measurements.

Full local check and coverage passed with 1,739 tests on Node 26.8.1. Coverage: statements 91.94%, branches 88.36%, functions 99.62%, lines 91.89%. Build, generated reference/docs, packed typed consumers, package surface and image-formation benchmark passed. Local HTTP tests required port access outside the sandbox; package dry-run used a writable temporary npm cache. The original head passed all four Node CI jobs. Follow-up-head CI must also pass before merge. Repository search found no other open engine PR requiring version reconciliation. Public npm lists 1.1.0 as its newest version and no 1.2.0; the remote `v1.2.0` tag is absent as of this review.

## Remaining owner gates

- Substantive human scientific/source review of the final diff, supported domains, provider obligations and evidence. No human review submission was present during the initial inspection.
- Contribution-specific DCO certification. Neither original PR commit contains `Signed-off-by`; this AI-assisted follow-up does not assert the contributor's certification. Resolve the complete candidate's certification before inclusion, without fabricating or silently rewriting sign-offs.
- Green supported Node CI at the final reviewed head, then mark ready and merge through repository protections.
- Verify final-main CI/tree, main/tag protections and npm trusted-publishing configuration before separately approved tagging/publication. Repository workflow checks those release prerequisites; this review does not verify account-side configuration.
- Keep #215 publication acceptance and downstream producer/device activation pending until the reviewed distribution exists and their separate evidence is supplied.

No merge, tag or publication is authorized by this review record. Follow [the release procedure](RELEASE_1_2_0.md) after the required owner gates.
