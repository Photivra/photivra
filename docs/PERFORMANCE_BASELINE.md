# Measured-performance baseline: #43 / #45

Release context: **package 1.0.0 candidate / root API 0.116.0**. Subsystem/model versions and dated introduction or measurement records below are independent historical identities; they are not distribution versions. See [developer navigation](DEVELOPERS.md) and [release contract](RELEASE_1_0.md).

This independent first slice records merged main `83a99a4c1ec525fd1add7cccff134fcee0f5159b`, root API 0.93.0, POC API 0.20.0, in `docs/benchmarks/2026-10-01-main-baseline.json`. No pending capture/output/correction/preset implementation is consumed. It does not close either issue or justify an optimization by itself.

## Context and method

Measurements used Node 24.19.0/V8 13.6.233.17-node.51 on shared Linux x64 execution infrastructure reporting AMD EPYC 9V74 and 9 logical CPUs. This is not the user's Mac, a browser frame-time result or a dedicated machine. Local source was restored to the recorded main snapshot and transpiled with Node's type stripper because canonical TypeScript tooling is unavailable locally; this build method is explicit in the artifact. The script's source commit/build label is operator-attested, not independently verified by the script. CI separately verifies the canonical build/gates.

The existing #43 sampling benchmark retains its 33x33 field and 5 temporal samples, alternating scalar/batch pairs, nine measured repeats and five inner repeats. It is reused unchanged. New `scripts/benchmark-composed-baseline.mjs` measures four whole POC request shapes against #130: base, 16 defocus samples, 16 samples each of defocus/size/motion, and the same mixed set with portrait/off-center staged capture. Each scenario has 200 warmup requests and nine 100-request blocks; scenario order rotates. Both ordinary and forced-GC-assisted runs are recorded, not combined. Net post-GC retained heap is **not** allocation count or GC-pause evidence.

| POC scenario | Ordinary median µs/request | Forced-GC-assisted median µs/request |
| --- | ---: | ---: |
| Base | 13.17 | 16.88 |
| Defocus 16 | 29.20 | 36.77 |
| Mixed 16 per kind | 62.46 | 76.05 |
| Staged portrait mixed | 124.76 | 130.16 |

These distributions establish reproducible request shapes, not portable speed constants or ordinary-vs-GC causality. Raw timing/heap samples are retained in the artifact.

## Findings and disposition

For #43, existing lateral-CA batch/scalar median ratio was 0.628 (about 37% shorter in this run); radial batch ratio 1.019 showed no benefit in this run. Vignetting and temporal rotation remain recorded microbenchmark candidates, not demonstrated consumer hotspots. This supports retaining the existing narrow CA batch surface, not adding a generic prepared engine abstraction now.

For #45, a separate ordinary V8 CPU-profile run had 250 sampled stacks inside `simulatePocCamera`; 83 included `calculateThinLensImageDistance` (33.2%). 157 included recursive finite-result validation (62.8%). These are **overlapping inclusive sampled stacks** and cannot be summed or equated to exact time/savings. Zero samples attributed to `requirePositiveFinite` do not imply zero validation work; sampling/inlining can hide frames. Startup/outside-call samples are excluded from the fraction denominator. The profiled run's timings are not used in the unprofiled timing table.

Repeated projection/result validation is therefore a plausible bounded investigation target, but no reuse candidate, amortization break-even, retained prepared-state cost, exact equivalence corpus, actual consumer frequency or browser behavior has been demonstrated. **No runtime optimization is implemented and neither issue receives a final no-change closure.** After representative V1 composition/output paths merge, repeat profiling with those paths and relevant browser/worker consumers; then compare the smallest internal request-scoped reuse candidate, or record a supported no-change decision. No public context/cache or API/version change is justified here.

## Reproduction

Use a checkout of the commit being measured and build it before measuring; retain runtime/hardware/commit context for every comparison. The new script is developer tooling, not the browser root. Example after `npm ci` / `npm run build`, replacing the commit with the exact source revision used:

```sh
node scripts/benchmark-composed-baseline.mjs --commit=83a99a4c1ec525fd1add7cccff134fcee0f5159b --build-method=tsc
node --expose-gc scripts/benchmark-composed-baseline.mjs --commit=83a99a4c1ec525fd1add7cccff134fcee0f5159b --build-method=tsc
node --expose-gc scripts/benchmark-image-formation.mjs
node --cpu-prof --cpu-prof-name=poc.cpuprofile scripts/benchmark-composed-baseline.mjs --commit=83a99a4c1ec525fd1add7cccff134fcee0f5159b --build-method=tsc
node scripts/summarize-composed-cpu-profile.mjs poc.cpuprofile
```

To reproduce this historical engine baseline after the tooling lands, use the recorded engine checkout plus these tooling scripts, rather than labeling a newer engine build with the old SHA. Do not commit raw CPU profiles: they can contain private local paths. The summary emits fixed public function categories only. The archived artifact contains no raw profile/path or source-private metadata.

Scripts and scenarios are independently authored using the owned canonical fixture and existing benchmark. No third-party code/data or dependency is incorporated. AI-assisted draft remains subject to human review and DCO certification; performance evidence is not scientific/provenance certification.

## Subsequent bounded #45 experiment

The baseline conclusions above are historical. [POC_PROJECTION_REUSE.md](POC_PROJECTION_REUSE.md) records the main 0.103.0 request-local defocus candidate, paired whole-request timing, preparation, separate allocation sampling and complete-response equivalence. It advances #45 independently; it does not change #43's disposition or establish browser performance.

## Subsequent bounded #43 experiment

The baseline conclusions above are historical. [GEOMETRIC_PREPARATION_REUSE.md](GEOMETRIC_PREPARATION_REUSE.md) records the main 0.103.0 call-local geometry-preparation candidate, real merged sampling/correction consumers, separate CPU/allocation evidence and scalar/copy-safety tests. It advances #43 independently and does not establish browser performance or #45's conclusion.

## Final V1 remeasurement

[Final V1 performance disposition](V1_PERFORMANCE_DISPOSITION.md) records current main #204, fresh paired timing/equivalence, preparation/memory profiles and dense executed environment-to-RAW evidence. PR #205 merged the final reviewed/signed no-further-change disposition; PR #206 merged final conformance. The measured engine commit remains the historical benchmark identity. Earlier candidate and pending-remeasurement statements above are historical.
