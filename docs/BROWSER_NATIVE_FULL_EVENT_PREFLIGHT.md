# #224 / #251 — frozen full-native Path-A work-admission preflight

**Status: repository-only static obstruction evidence, not native execution or
qualification.** This contract precedes the implementation. It reads the
unchanged #233 [resource and failure accounting](BROWSER_NATIVE_CAPTURE_RESOURCE_ACCOUNTING.md),
the [reference-executor handoff](BROWSER_NATIVE_CAPTURE_REFERENCE_EXECUTOR_HANDOFF.md),
the actual `browser-native-reference-executor.ts` work gate, and the frozen
#251 base/refinement requirements. It does not supersede those sources, change
their science, or authorize a new Path B method.

## Objective and division of ownership

The next numerical qualification is **#250 / PR #253** (progressive complete
events). PR #253 is technically green and substantively owner-approved, but
its *contribution-specific DCO* has not been recorded; its approved merge
is a prerequisite to #251 final qualification. The independent preflight
below can be authored and tested without merging #253 or running #251 final
cases; it does **not** close #250, #251 or parent #224.

The full #251 frozen base is 2048 × 1366 native sites with four spatial
nodes/site, one temporal node, 128 committed pupil rays and two spectral
nodes. The refinements require 256 pupil rays separately and two temporal
nodes separately; the combined 256×2 case is **conditional on independent
convergence evidence**. The microscope-size #250 ladder is not a substitute
for this fixed native raster, geometry, or workload.

Compute whole-event support using **exact integer arithmetic** before
building full site arrays or running scene/optics/sensor operations:

```
native sites          = native width × native height
unique geometry       = sites × spatial × temporal × pupil
spectral/source logic = unique geometry × spectral
RAW output payload    = sites × 7 bytes
```

Both **logical** source support and the **current reference executor's
dynamic spectral/source work** must be retained in the evidence. Do not
rename spectral compositions to geometry requests, reset an aggregate
budget on each tile, round a big integer to floating point, or project
measured runtime from a tiny pilot.

## Actual existing limits and resulting static disposition

The current Path-A executor compares complete
`committedSourceSampleCount` with `maximumProviderEvaluations`. The
existing public whole-event bound is **2,000,000,000** dynamic provider/
scientific evaluations; the unchanged per-source-tile logical bound is
**100,000**. Native RAW limits of 24,000,000 sites, 16,384 per dimension
and a 7-byte/site packed output are unchanged. The output-byte budget is
**not** a total memory budget.

| #251 case | Committed pupil / temporal | Logical spectral/source work | Geometry requests | Current Path-A admission |
| --- | --- | ---: | ---: | --- |
| Frozen base | 128 / 1 | 2,864,709,632 | 1,432,354,816 | Rejected: exceeds 2B |
| Pupil refinement | 256 / 1 | 5,729,419,264 | 2,864,709,632 | Rejected: exceeds 2B |
| Temporal refinement | 128 / 2 | 5,729,419,264 | 2,864,709,632 | Rejected: exceeds 2B |
| Combined *conditional* | 256 / 2 | 11,458,838,528 | 5,729,419,264 | Rejected; **not a mandatory run** |

The fixed RAW payload is **19,582,976 bytes** in every listed case, not a
measured whole-process/worker/GPU peak. The base therefore exceeds the
current executor's work budget **despite geometry requests below 2B**.
A smaller batch or better scheduling cannot make the aggregate disappear.

## Implementation

`scripts/lib/browser-native-full-event-preflight.mjs` implements a
pure **repository-only** BigInt checker for the exact frozen suite, plus
strict validation of the work-policy ceiling, raster/sample parameters,
and source-native output limits. Invalid/stale parameters fail closed.
`scripts/assess-browser-native-full-event.mjs` emits machine-readable
frozen case dispositions with `fullNativeQualified:false`, no reported
full-native completion time, no claimed memory peak, and no backend
selection. `npm run assess:native-full-event` is an inexpensive diagnostic,
not a production admission or test of actual event execution.
`test/browser-native-full-event-preflight.test.mjs` asserts the exact
counts and rejections, malformed/oversized input refusals, conditional
combined semantics, whole-event invariance under smaller batches, and
source-work budget correspondence to the actual current reference executor.

The numerical result must be read as **current implementation obstruction**,
not proof that the full-native photographic model cannot ever qualify.

## Unblock the real full-native work, without weakening the model

1. Explicit contribution-specific DCO certification for #253, then
   merge its exact tested head, close #250, and confirm #251 prerequisite.
2. Engineer a **separately reviewed, exact Path-A factorization/reuse**
   of actual dynamic source/optical work under 2B **while preserving
   committed logical spectral/pupil/time support**, local operating-range
   checks, the same physical model, independent oracles, full RAW/CFA/
   absolute-seed/batch invariance and output atomicity. No speculative
   throughput/precision equivalence is sufficient.
3. Record the material resource/accuracy obstruction if the exact Path-A
   optimization remains impossible within approved bounds. Such measured
   evidence may activate **#236** under its existing reviewed method-change
   policy, but this arithmetic preflight alone does not authorize alternate
   sampling, relaxed exactness or a four-billion ceiling.
4. Run the actual full-native #251 base and required separate refinements
   on frozen engine/source/camera identities and collect **measured**
   cold/warm memory/work/latency/cancellation/RAW and independent SI and
   difficult visibility evidence. Unsupported is a valid *reported*
   outcome, not a passing full-native qualification.
5. Only after the durable #251 float64 reference handoff proceed to
   #235 real browser WebGPU/raster candidates; parent #224 and app
   Focus/Depth #305 stay open until full backend/device/source acceptance.

Do **not** construct or execute a huge event just to rediscover a
known pre-admission failure. A rejected work plan must prevent work from
starting, not consume hours of CI or allocate a full-frame site graph.
The initial instrument is a work-policy diagnostic, **not a performance
benchmark**, public export, runtime fallback, scientific result, or app
source/device admission. No package version, resource/sampling limit,
registered runtime, production functionality or scientific model changes.
