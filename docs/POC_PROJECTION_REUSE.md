# Request-local defocus projection reuse: #45

Release context: **package 1.2.0 candidate / root API 1.2.0**. Subsystem/model versions and dated introduction or measurement records below are independent historical identities; they are not distribution versions. See [developer navigation](DEVELOPERS.md) and [release contract](RELEASE_1_2_0.md).

The measured candidate reuses the focus-plane image distance already calculated
inside `simulatePocCamera()` for its subject and defocus sweep. It is a small
private optimization against merged main
`c1374c31473f893310d1ce4f0d5a737aaba43ab5`. It consumes no pending tier/export draft.
Root API 0.103.0, POC API 0.20.0 and public scalar signatures/semantics stay unchanged.

## Measurement and decision

[Recorded evidence](benchmarks/2026-10-02-poc-projection-reuse.json) contains two
independent ordinary paired runs and one GC-assisted paired run, all built with
`tsc`. Each path/scenario has 500 warmup calls and nine blocks of 1,000 whole
requests. Reference/candidate order alternates, scenario order rotates, and the
final recorded runs were performed after local tests finished, without concurrent
task benchmarks. Shared host activity remains uncontrolled.

Runtime was Node 24.19.0/V8 13.6.233.17-node.51 on Linux x64, reporting AMD EPYC 9V74
and 9 logical CPUs. Every run records runtime/hardware, baseline commit and SHA-256
fingerprints of both candidate runtime source files. The source identity is
operator-attested; fingerprints allow verification after commit. These are
public POC developer-consumer request shapes, not observed product traffic or
browser frame-time evidence.

| Whole request | Ordinary reference µs, run 1 | Candidate µs, run 1 | Candidate/reference, run 1 | Ratio, run 2 | GC-assisted ratio |
| --- | ---: | ---: | ---: | ---: | ---: |
| Base, no sweep | 11.11 | 11.29 | 1.017 | 1.014 | 0.989 |
| 1 defocus sample | 12.16 | 11.89 | 0.978 | 0.942 | 0.974 |
| 2 defocus samples | 13.20 | 11.85 | 0.897 | 0.950 | 0.980 |
| 4 defocus samples | 14.69 | 13.50 | 0.919 | 0.906 | 0.941 |
| 8 defocus samples | 18.37 | 16.67 | 0.907 | 0.856 | 0.952 |
| 16 defocus samples | 27.10 | 19.97 | 0.737 | 0.819 | 0.857 |
| 16 each defocus/size/motion | 56.33 | 50.52 | 0.897 | 0.902 | 0.880 |
| Portrait/off-center staged mixed | 95.54 | 90.79 | 0.950 | 0.924 | 0.970 |

A ratio below one means a shorter measured request. The two ordinary runs show
18–26% improvement on the 16-defocus shape, about 10% on mixed samples and 5–8%
on staged capture. The base shape is about 0.16–0.18 µs slower (1.4–1.7%) in those
runs; no universal speedup or zero overhead is claimed. GC-assisted timings are
separate distributions and do not establish ordinary-vs-GC causality. Earlier
exploratory runs are excluded from the final evidence.

The decision is to retain this bounded private reuse candidate for human review.
The repeatable sweep/mixed improvement justifies it, with the small base-path
tradeoff explicitly visible. Further FOV/motion/sampling reuse or a generic
prepared public API is not justified by this experiment. #43 retains its separate
measurement/decision gate; this result does not establish its conclusion.

## Preparation and memory

Context creation copies three scalar numbers into a frozen object only when a
non-empty defocus sweep is present. It adds no new thin-lens resolution: it borrows
the same request's existing calculated projection. It cannot survive the request,
is not returned in the response and has no global cache or cross-input lifetime.
No-sweep requests allocate no context. An isolated object/freeze probe measured
about 42–46 ns per preparation; its JIT/escape behavior can differ inside the
whole call, so it is not an independent cost/error bound.

Short sweeps are explicitly measured above; benefits increase enough at 16
samples to amortize the context in these workloads. A single sample is close to
noise, so no portable break-even count is asserted. Raw net retained-heap deltas
are preserved but are not allocation counts or persistent-context size estimates.

A separate V8 Inspector allocation-sampling pass measured 2,000 staged requests
per path at 32 KiB sampling intervals, requesting inclusion of objects collected
by both major and minor GC. Estimated sampled bytes were 593,837,880 for reference
and 551,945,312 for candidate (about 7% lower); inclusive thin-lens sampled bytes
were 177,301,960 and 138,224,096 (about 22% lower). These are statistical sampling
estimates, not exact allocation counters, GC-pause measurements or latency
attribution. Instrumented allocations are separate from all timing comparisons.
No raw inspector profile/private path is stored.

The sensor dimensions are an explicit 36×24 mm, 6000×4000 raster. This POC computes
analytical diagnostics; it does not execute 24 million image samples. Raster
size is therefore context, not a claim of full image-rendering throughput. The
canonical tiny #130 fixture is used only for correctness, never as the runtime
performance basis.

## Correctness and boundary

The public scalar `calculateDefocusCircle()` uses the same shared implementation
without a borrowed projection. Its validation, arithmetic, result model,
assumptions and provenance remain authoritative. The internal borrowed context
requires exact physical focal/focus identity and positive finite projection.
The POC constructs it from its already validated thin-lens result, never from
serialized user projection values. Subject-plane projection still uses the
ordinary thin-lens calculation; no equation or scientific stage is replaced.

`test/fixtures/poc-projection-reuse-reference.json` stores 64 owned deterministic
inputs and complete response/provenance SHA-256 commitments generated from the
unchanged main reference build. The corpus includes all four orientations,
off-center captures, legacy crops, varied focal/focus/aperture state and sample
counts. Seed is `0x45c1374c`. Do not regenerate expectations from the candidate to
hide drift. #130 remains unchanged. Additional tests compare the scalar oracle,
invalid-input errors, stale context rejection and alternating request identities.

Browser-surface and package gates remain required. This is a Node-measured POC
optimization, not a browser-motivated public API; no browser performance or private
application claim is made. It does not activate production rendering/radiometry
or change capture/output/version contracts. Scientific/provenance review and
contribution-specific DCO certification remain required before merge.

## Reproduction

Create an independent checkout of the recorded reference commit and build it with
`npm ci` / `npm run build`. Build the candidate checkout too. Run only the
benchmark during timing; replace the example reference-root with that checkout.
The tooling consumes the reference's `dist/index.js` and first verifies complete
response equivalence for every measured scenario.

```sh
node scripts/benchmark-poc-projection-reuse.mjs --reference-root=/path/to/reference --reference-commit=c1374c31473f893310d1ce4f0d5a737aaba43ab5
node --expose-gc scripts/benchmark-poc-projection-reuse.mjs --reference-root=/path/to/reference --reference-commit=c1374c31473f893310d1ce4f0d5a737aaba43ab5 --allocation=sample
```

Repeat ordinary runs separately. Build labels are not independently attested by
the script. There is no timing CI threshold, paid service, runtime dependency or
new third-party material. This tooling is Node-only and outside the public root.

## Final V1 remeasurement

[Final V1 performance disposition](V1_PERFORMANCE_DISPOSITION.md) records current main #204, fresh paired timing/equivalence, preparation/memory profiles and dense executed environment-to-RAW evidence. PR #205 merged the final reviewed/signed no-further-change disposition; PR #206 merged final conformance. The measured engine commit remains the historical benchmark identity. Earlier candidate and pending-remeasurement statements above are historical.
