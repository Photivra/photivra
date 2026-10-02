# Final V1 performance disposition: #43 / #45

Release context: **package 1.0.1 candidate / root API 1.0.1**. Subsystem/model versions and dated introduction or measurement records below are independent historical identities; they are not distribution versions. See [developer navigation](DEVELOPERS.md) and [release contract](RELEASE_1_0_1.md).

Final measured main is `edc20e61538152fa758f3cce4b41cc34d1e8ba03` (#204), root API 0.116.0, POC API 0.20.0. #175 and #176 already merged the justified private optimizations. PR #205 merged this final remeasurement after human review/DCO; both issues are closed. The recorded engine commit identifies the measured build, not the latest release candidate. It adds no runtime optimization, public abstraction, dependency, numerical tolerance change or timing CI gate.

## Context and reproducibility

All measurements used Node 24.19.0 / V8 13.6.233.17-node.51, macOS arm64, Apple M5 Pro, 18 logical CPUs. The host is shared; ambient activity, thermals and power state are uncontrolled. Runs were sequential with no concurrent task tests/benchmarks. Both trees were compiled with canonical `tsc`. The independent pre-optimization reference is `c1374c31473f893310d1ce4f0d5a737aaba43ab5`; comparisons isolate the retained #43/#45 paths, not the entire intervening V1 feature set. Candidate source SHA-256 commitments are retained in every paired artifact. `candidateBaseCommit` now records the actual measured final main independently of the reference. Labels are operator-attested, not automatically git-verified.

Two ordinary paired runs and one separate forced-GC/profile run reuse the existing owned benchmarks unchanged in workload/equivalence semantics. Reference/candidate order alternates, scenario order rotates. POC: 500 warmups and nine blocks of 1,000 requests per shape. Geometry: five blocks, 100 warmup/block calls for 1×1/5×5, two warmups/one block call for larger grids. Whole response/result including provenance must match the independent reference before timing. See [projection method](POC_PROJECTION_REUSE.md) and [geometry method](GEOMETRIC_PREPARATION_REUSE.md).

Raw artifacts: [geometry ordinary 1](benchmarks/2026-10-02-v1-geometry-ordinary-1.json), [ordinary 2](benchmarks/2026-10-02-v1-geometry-ordinary-2.json), [GC/profile](benchmarks/2026-10-02-v1-geometry-gc-profile.json); [POC ordinary 1](benchmarks/2026-10-02-v1-poc-ordinary-1.json), [ordinary 2](benchmarks/2026-10-02-v1-poc-ordinary-2.json), [GC/profile](benchmarks/2026-10-02-v1-poc-gc-profile.json). Raw block timing and retained-heap deltas are preserved. GC-assisted timings are separate distributions and do not establish GC causality.

## #43 decision: retain call-owned geometry reuse; no further prepared API

| Whole consumer | Reference ms/call, run 1 | Final main ms/call, run 1 | Ratio run 1 | Ratio run 2 |
| --- | ---: | ---: | ---: | ---: |
| sampling-plan-1x1 | 0.0146 | 0.0117 | 0.799 | 0.796 |
| corrected-capture-1x1 | 0.1264 | 0.1069 | 0.846 | 0.815 |
| sampling-plan-5x5 | 0.2004 | 0.1157 | 0.577 | 0.594 |
| corrected-capture-5x5 | 1.3817 | 0.8879 | 0.643 | 0.649 |
| sampling-plan-17x17 | 2.3222 | 1.2968 | 0.558 | 0.566 |
| corrected-capture-17x17 | 16.0390 | 10.2372 | 0.638 | 0.608 |
| sampling-plan-33x33 | 8.6810 | 5.0144 | 0.578 | 0.577 |
| corrected-capture-33x33 | 62.3895 | 39.9700 | 0.641 | 0.662 |
| sampling-plan-65x65 | 34.3922 | 20.1464 | 0.586 | 0.557 |
| corrected-capture-65x65 | 244.6844 | 165.3251 | 0.676 | 0.660 |

For 17×17 through 65×65, ordinary sampling plans are approximately 41–44% shorter and whole corrected captures 32–39% shorter in these two runs. The current merged paths execute actual inverse support, joint masks/crops, three-channel nearest resampling and gain on an explicitly declared 24×24 mm synthetic field. These are bounded consumer measurements, not full-resolution or browser rendering. The gain remains material after the V1 processing/tier work stabilized.

Separate geometry preparation medians are 3.129 µs reference and 3.298 µs final main; preparation stays at the untrusted public boundary. There is no persistent prepared state or added lifecycle to measure. A returned mapping still owns its transform data and per-point diagnostics. Small grids above measure amortization including boundary overhead rather than assuming preparation is free. No portable break-even grid size is asserted.

At 65×65 correction, separate CPU sampling counted `prepareGeometricMapping` in 307/881 reference consumer stacks versus 2/599 final-main stacks. Heap sampling estimated 6,923,905,856 versus 4,842,216,576 allocated bytes over five captures (about 30% lower). Preparation-inclusive estimates were 2,070,409,472 versus 426,720 bytes. These are overlapping inclusive CPU categories and statistical allocation estimates, not exact counters, retained context size or GC-pause measurements. Large cumulative allocation is not simultaneous live memory.

Acceptance reuses the existing 32-case deterministic scalar oracle corpus, mutation isolation, fresh-call revalidation and folded/intermediate-domain failures. No inverse iteration bound or scalar API behavior changes. The final disposition is to retain #176 and the existing radial/CA batch surface, and add no generic mutable prepared engine, vignetting/rotation cache or extra solver. The new production profile below supplies no evidence that such an abstraction would materially improve its whole request.

## #45 decision: retain request-local defocus projection reuse; no broader context

| Whole POC request | Reference µs, run 1 | Final main µs, run 1 | Ratio run 1 | Ratio run 2 |
| --- | ---: | ---: | ---: | ---: |
| 24mp-base | 5.330 | 5.388 | 1.011 | 0.997 |
| 24mp-defocus-1 | 5.813 | 5.548 | 0.954 | 0.950 |
| 24mp-defocus-2 | 6.317 | 5.801 | 0.918 | 0.924 |
| 24mp-defocus-4 | 7.077 | 6.423 | 0.908 | 0.912 |
| 24mp-defocus-8 | 8.877 | 7.589 | 0.855 | 0.866 |
| 24mp-defocus-16 | 12.361 | 9.792 | 0.792 | 0.785 |
| 24mp-mixed-16-per-kind | 26.267 | 23.470 | 0.894 | 0.897 |
| 24mp-staged-portrait-mixed | 44.816 | 42.584 | 0.950 | 0.957 |

The 16-defocus request is 20.8–21.5% shorter, mixed sweeps 10.3–10.6% shorter and staged portrait mixed requests 4.3–5.0% shorter in the two ordinary runs. Base and single-sample changes are small and noisy. No universal benefit or portable break-even count is claimed. The 6000×4000 sensor is analytical request context; the POC does not render 24 million samples. It remains a public compatibility/developer consumer, not observed private-product traffic or the production composer.

Preparation creates a frozen three-scalar object only for a nonempty defocus sweep, borrowing the validated projection from the same request. The separate isolated probe median was 19.851 ns, with the existing escape/JIT caveat. No-sweep requests allocate no context; no context is retained across calls, exposed publicly or stored in the result. Net post-GC retained heap is not an object-size/allocation measurement.

Separate sampled allocations for 2,000 staged requests were 605,749,360 bytes reference and 564,364,680 final main (about 7% lower); thin-lens-inclusive estimates were 175,036,920 versus 138,980,832 (about 21% lower). Whole-request distributions and the unchanged 64-case independent complete-response SHA corpus support keeping #175. Alternating focal/focus inputs, invalid input and stale-context rejection remain required. No additional FOV/motion/sampling context, cross-request cache or public projection API is justified.

## Current V1 executed environment-to-RAW consumer

The new repository-only `scripts/benchmark-v1-environment.mjs` reuses the owned sensor/environment fixtures and canonical TypeScript build in a disposable directory. Setup/compilation is outside timed calls. It executes the current full environment capture adapter: rolling local windows, rotated environment queries, spatial/spectral/temporal integration, optional sampled PSF, EQE, dark charge, capacity, seeded noise and ADC. Every scenario checks executed provider count and deterministic whole-result SHA replay before timing. Two warmups and five rotating one-call blocks are recorded.

Four native sites are intentionally held constant while actual work increases from 128 to 36,864 provider evaluations. This is representative of bounded dense quadrature workloads in the supported executor, not full-native throughput, observed traffic or a performance conclusion based on the tiny canonical #130 raster. No 24/45/60 MP or complete physical renderer performance is claimed. The declared synthetic radiance callback is cheap; external provider transport/visibility cost is absent.

| Temporal samples / aperture grid / PSF | Provider evaluations/call | Ordinary median ms | Separate GC-assisted median ms |
| --- | ---: | ---: | ---: |
| 4 / 2×2 / not applied | 128 | 7.987 | 8.795 |
| 16 / 4×4 / not applied | 2,048 | 70.555 | 76.885 |
| 16 / 2×2 / 9 taps | 4,608 | 183.633 | 195.540 |
| 32 / 4×4 / 9 taps | 36,864 | 1448.311 | 1478.752 |

[Ordinary evidence](benchmarks/2026-10-02-v1-environment-ordinary.json) and [GC/profile evidence](benchmarks/2026-10-02-v1-environment-gc-profile.json) include raw heap/RSS deltas, work counts and result commitments. The separate heaviest-case profile counted thin-lens calculation in 10/1,090 whole-consumer CPU stacks, geometric preparation in zero, and recursive finite validation in 889/1,090. Categories overlap, inlining can hide frames, and zero observed samples do not prove zero work. The adapter calls a private internal executor, so the public photo-signal wrapper need not appear in stacks.

The independent allocation pass estimated 6,458,745,904 bytes cumulatively for one dense capture, not 6.46 GB retained live memory. Net RSS/heap deltas do not measure peak memory; no peak claim is made. Detailed diagnostic/provenance materialization and fail-closed validation have real cost. This descriptive baseline has no before/after candidate and cannot establish an optimization benefit. It supports an explicit no-further-change decision within #43/#45: no evidence shows their duplicate projection/preparation targets dominate this current consumer, and removing provenance/validation is outside their acceptance. A future narrowly evidenced diagnostic/budget optimization would need its own scope and equivalence. No new V1 deferral or feature is invented.

## Browser boundary, acceptance and reproduction

No browser-motivated public API or browser timing claim is proposed. Current root APIs stay browser-safe; existing browser-surface/package checks remain required. Node/macOS measurements do not establish browser, worker, WebGPU or end-user frame-time behavior. This finite disposition covers the merged Node-measured internal optimizations and current supported public consumer shapes. Browser-motivated future work requires real browser evidence.

The paired POC script additionally compares every complete response in the existing 64-case corpus directly against the independent pre-optimization reference on this runtime and records their hashes. All 64 agree exactly, including the case whose Linux-authored golden SHA differs on this Mac. No golden is regenerated or tolerance relaxed. Local supported-Node check/coverage pass 1,581 tests with that previously reproduced unchanged-main Mac `equivalence-38` golden-hash difference; static/policy, build and package gates pass. Required Linux CI remains the unchanged release gate. Existing analytical/fuzz/copy-safety/provenance gates remain the correctness oracle. All runtime sources, API/schema versions, asset commitments, scalar errors, reference hashes, inverse limits and coverage thresholds are unchanged. #131 still owns final scientific conformance and #180 final documentation/release audit. PR #205 reviewed/merged this evidence and closed #43/#45; PR #206 closed final conformance.

Build current main and the independent reference with `npm ci` and `npm run build`, using a supported Node runtime. Run sequentially without concurrent task tests. Replace the reference path below; repeat ordinary runs independently. Add `--expose-gc` before the script plus `--allocation=sample` (POC) or `--profile=sample` (geometry/environment) for a separate profile run.

```sh
node scripts/benchmark-poc-projection-reuse.mjs --reference-root=/path/to/reference --reference-commit=c1374c31473f893310d1ce4f0d5a737aaba43ab5 --candidate-commit=edc20e61538152fa758f3cce4b41cc34d1e8ba03
node scripts/benchmark-geometric-consumers.mjs --reference-root=/path/to/reference --reference-commit=c1374c31473f893310d1ce4f0d5a737aaba43ab5 --candidate-commit=edc20e61538152fa758f3cce4b41cc34d1e8ba03
node scripts/benchmark-v1-environment.mjs --commit=edc20e61538152fa758f3cce4b41cc34d1e8ba03
```

No raw inspector profiles/private paths are committed. Performance is informational, with no new dependency or third-party code/data. Human review and contribution-specific DCO certification are required for inclusion.
