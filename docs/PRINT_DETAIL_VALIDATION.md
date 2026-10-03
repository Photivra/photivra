# Regional Print detail independent validation protocol 0.1.0

This protocol tests the mathematical domain in [the model specification](PRINT_DETAIL_ASSESSMENT.md). Passing does not qualify arbitrary photographed targets, renderers, lenses, printers or perceptual decisions. [The capability ledger](validation/print-detail-capabilities.json) must retain these limits.

## Public analytic evidence

Procedural targets are owned test data, with known mean, modulation, integer spatial frequencies and phase. Reference derivations use finite orthogonality and discrete convolution identities, independently of the implementation's coefficient accumulator.

| Case | Independent expected behavior |
| --- | --- |
| Exact quarter-cycle sequence | Mean 1 and declared fundamental modulation 0.5; derive from explicit repeated values, not engine output |
| DC/gain/phase variants | Gain preserves modulation; changed mean changes relative modulation; arbitrary phase preserves amplitude |
| Isotropic symmetric filtering | Known separable symmetric kernel attenuates axial x/y targets equally |
| Directional filtering | Apply owned `[1/4,1/2,1/4]` in x only: response is `(1+cos(2 pi f_x))/2`; orthogonal target is unchanged |
| Equal-PPI, different detail | Same geometry and raster; independent filtered/unfiltered sample arrays have different coefficients |
| Subject versus deliberate defocus | Select separate regions/roles; retain each result; no whole-frame minimum or score |
| Crop and physical enlargement | Actual ROI/retained raster stay explicit; samples/modulation do not change when only print size/distance changes |
| Four orientations, off-center capture | Existing coordinate transforms predict optical field location; no ad hoc axis conversion |
| Independent extra harmonic/noise realization | Fundamental/residual responses follow orthogonality; noise/artifact dimensions remain unassessed |
| Post-resampling versus decoded encoding | Bind actual raster/stage/content/decoder; pre-encode cannot imply JPEG qualification |
| Invalid/unsupported input | Reject unknown keys/enums/IDs, holes/nonfinite samples and invalid bounds; block identity/domain/registration mismatch and unsupported Nyquist/DC |

For normalized analytic coefficients and relative residuals, use an absolute tolerance of 1e-10 for small bounded arrays (up to 4096 samples). This accommodates trigonometric and accumulation error while remaining far below the deliberately tested contrast differences (at least 0.01). Exact identities/integers/statuses are checked exactly. A separate upper-bound sample test verifies the 65,536-sample work cap and documented float range; it does not infer a device performance or memory envelope. Fixed seeds remain committed. Tolerances must be reviewed when algorithm/domain changes, never loosened merely to pass a failure.

Run focused tests, then existing full check, coverage, build, package, browser, license/SPDX, identity, documentation and isolated packed-example gates. Record exact metric/protocol/target/test-source/engine versions and commit, test counts and CI head. Preserve previous assessment/evidence records; do not relabel old qualification with a new creator version. A metric or source change invalidates affected downstream evidence until rechecked.

## Uncompleted acquisition and release qualification

Before claiming measured regional image detail in the new UI, independently qualify actual target/ROI truth, visible depth/occlusion, source and target licensing, coherent-frequency registration, native/crop/correction mapping, field/phase/orientation coverage, actual renderer/backend and source-stage/processing/decoder identity. Test the active backend against the independent analytic references, not against a second call to this engine. Record supported device/raster limits and source/destination artifacts with verified hashes. Procedural target generation and parser success alone are insufficient.

Noise requires separate linear/high-bit and same-realization versus ensemble evidence. Clipping requires explicit stage. Motion requires qualified trajectory/temporal accumulation. Halos, aliasing, compression and color require their own metric/protocol and stage-qualified evidence. Perceived visibility needs a reviewed contrast/perception model, luminance/contrast/observer domain, independently usable evidence and uncertainty treatment. No such capability is qualified by this first diagnostic.

For gallery, small-print, poster and distant-sign uses, verify immutable capture, same-scale physical proof geometry and actual output stage. These are scenarios within qualified envelopes, not one new chart per print size. Product accessibility, actual-device evidence and full consumer qualification remain separate. Public engine validation must stay runnable without private scenes.

Release remains blocked for every missing scoped capability. Publish the reviewed geometry/diagnostic contract before integration. Keep #196 open until full scoped evidence and human review are complete; this protocol does not close it or silently defer required assessment.
