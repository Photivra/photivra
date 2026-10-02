# Call-local geometry preparation reuse: #43

`calculateGeometricSamplingPlan()` already parses and copies a complete transform
list at its public boundary. It previously called the public scalar mapping API
for every destination pixel, reparsing/copying that same list and rebuilding its
preparation provenance each time. This change uses one private point evaluator
for the call-owned mapping. The public scalar API still prepares external input
on every call and uses that same evaluator.

This is a bounded internal optimization against merged main
`c1374c31473f893310d1ce4f0d5a737aaba43ab5`, not a new prepared/cache API. It consumes
no pending export/tier/POC draft. Root API 0.103.0, geometry schema/model versions,
POC, package and production contracts stay unchanged.

## Whole-consumer measurements

[Recorded evidence](benchmarks/2026-10-02-geometric-preparation-reuse.json) contains
two independent ordinary paired runs and one GC-assisted run. Both source trees
were built with `tsc`. Context is Node 24.19.0/V8 13.6.233.17-node.51, Linux x64,
AMD EPYC 9V74 and 9 logical CPUs on shared execution infrastructure. Each run
records the reference commit and candidate source-file SHA-256; the source/build
labels are operator-attested, and the fingerprint identifies the runtime change.

The consumers are merged `calculateGeometricSamplingPlan()` and the whole
`calculateLensCorrectedCapture()` executor: common radial map, channel-specific
CA, affine map, joint support, actual resampling, and peripheral gain. Both use
the same owned synthetic capture/noise identity. The sampled linear plane spans
24×24 mm, with explicit pitch and a separate physical profile normalization
radius. Nearest sampling is explicit; the bounded compressing coordinate maps
have no source-prefilter requirement. No prefilter is claimed or fabricated.
These are real bounded engine consumers, not a copied equation microbenchmark
or a complete physical production renderer.

| Consumer | Reference ms, ordinary run 1 | Candidate ms, run 1 | Candidate/reference, run 1 | Ratio, run 2 | GC-assisted ratio |
| --- | ---: | ---: | ---: | ---: | ---: |
| Plan 1×1 | 0.035 | 0.025 | 0.716 | 0.702 | 0.969 |
| Correction 1×1 | 0.303 | 0.261 | 0.864 | 0.833 | 0.869 |
| Plan 5×5 | 0.476 | 0.267 | 0.560 | 0.593 | 0.603 |
| Correction 5×5 | 3.364 | 2.124 | 0.631 | 0.635 | 0.651 |
| Plan 17×17 | 5.566 | 2.987 | 0.537 | 0.568 | 0.646 |
| Correction 17×17 | 39.255 | 24.333 | 0.620 | 0.612 | 0.606 |
| Plan 33×33 | 22.461 | 11.942 | 0.532 | 0.584 | 0.625 |
| Correction 33×33 | 155.051 | 100.624 | 0.649 | 0.618 | 0.642 |
| Plan 65×65 | 90.566 | 59.639 | 0.659 | 0.691 | 0.599 |
| Correction 65×65 | 640.165 | 468.194 | 0.731 | 0.740 | 0.749 |

There are five measured blocks, alternating reference/candidate order and rotating
scenario order. The 1×1/5×5 cases use 100 warmup calls and 100 calls per block;
larger cases use two warmups and one whole call per block. Raw block timing and
retained-heap deltas are preserved. Final runs occurred after release checks,
without concurrent task benchmarks/tests. Shared host activity is uncontrolled.
GC-assisted distributions are separate; do not infer GC causality from ratios.

The two ordinary runs show 26–39% shorter corrected-capture calls at 17×17 through
65×65. Corresponding sampling plans are about 31–47% shorter. Small cases also
improve in these runs, but microsecond-scale results have more timing noise.
These are not portable speed constants, browser frame times, observed product
traffic, full-resolution throughput or proof of an end-user latency benefit.

The decision is to retain this small internal candidate for review. The result
justifies removal of duplicate preparation in this concrete consumer, not a
public mutable prepared engine, extra solver, vignetting/rotation abstraction or
cross-input cache. #45's POC result is independent and not its evidence basis.
No browser-motivated public API is introduced; no browser performance claim is
made. The public implementation remains browser-safe, with the existing package
and static gates required.

## Preparation, profiling and memory

Separate preparation loops measured about 7–8 µs to parse/copy the three-transform
mapping; that cost remains at every public boundary. There is no new preparation
stage or long-lived state. The sampling-plan result still owns its normal mapping
and all per-pixel diagnostics. Call-local reuse avoids repeating the same work
for every point. Small grids above include one-off/amortization evidence rather
than assuming a prepared path is always free.

Separate CPU and allocation sampling used five whole 65×65 corrected captures
per path. Reference CPU stacks included `prepareGeometricMapping` in 882 of 2,657
samples inside the consumer (about 33%). Candidate had 1 of 1,779. This is sampled
inclusive attribution, not exact elapsed time or a claim that preparation costs
33% everywhere. Recursive finite checks, radial work and other categories overlap;
do not sum the category counts. Inlining and sampling affect attribution.

V8 Inspector heap sampling, at 32 KiB intervals and requesting inclusion of
objects collected by major/minor GC, estimated 6,946,184,128 sampled bytes for
reference and 4,840,744,824 for candidate over five captures (about 30% lower).
Preparation-inclusive estimates fell from 2,075,859,720 to 656,240 bytes. These are
statistical allocation estimates, not exact allocation counters, retained live
memory or GC-pause measurements. Instrumented runs are separate from all timing
comparisons. No raw inspector profiles/private paths are stored. Raw net retained
heap deltas are also retained; they are not allocation counts or context sizes.

## Correctness and copy boundary

External prepared objects remain untrusted: every public entry parses/copies the
current input before evaluating it. There is no persistent context or cache to
invalidate. The private evaluator is reached only with that call-owned mapping.
It retains per-point finite checks, every intermediate radial operating-envelope
check, arithmetic order, full Jacobians/principal stretches and the ordinary
point-result validation/provenance. Scalar and batch points use the same equation
implementation. No numerical tolerance is relaxed and no inverse iteration bound
is changed.

Affine derivative arrays are copied per result point. They must not alias another
pixel, the returned mapping, the caller or another call. This preserves the prior
copy semantics despite sharing the internal parsed mapping. Existing masks,
joint crops, source coverage, prefilter requirements, resampler identities and
retained-ray/FOV diagnostics are unchanged.

`test/geometric-preparation-reuse.test.ts` compares every point in a fixed 32-case
corpus (seed `0x43c1374c`) against scalar evaluation, covering all four quarter
turns, off-center lattices, noncommuting affine/radial order and varied coefficients.
It also tests mutation isolation, revalidation after prior success, folded/singular
input and intermediate-domain failure. Existing correction/geometry tests retain
noise/capture identity and blur/resampling guarantees. The paired benchmark checks
complete result/provenance equality with the unchanged reference for every measured
scenario before timing. The canonical #130 fixture is unchanged and is not used
as performance evidence.

## Reproduction and review

Build an independent reference checkout of the recorded main commit with
`npm ci` / `npm run build`, and build this candidate checkout. Run sequentially
without concurrent task checks or benchmarks; replace the reference-root below.

```sh
node scripts/benchmark-geometric-consumers.mjs --reference-root=/path/to/reference --reference-commit=c1374c31473f893310d1ce4f0d5a737aaba43ab5
node --expose-gc scripts/benchmark-geometric-consumers.mjs --reference-root=/path/to/reference --reference-commit=c1374c31473f893310d1ce4f0d5a737aaba43ab5 --profile=sample
```

Repeat ordinary runs separately. Profiling is optional and separate from timing.
There is no timing CI threshold, new runtime dependency, third-party data, paid
service or production-stage activation. Human scientific/provenance review and
contribution-specific DCO certification remain required before merge; measurements
are not scientific or legal certification.
