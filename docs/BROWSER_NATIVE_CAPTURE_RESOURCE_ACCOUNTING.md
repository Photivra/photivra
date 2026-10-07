# Browser-Native Capture Whole-Event, Batch, Memory, and Failure Accounting Contract

Status: **frozen resource/accounting contract for Photivra engine issue #233**.

This document defines the resource-accounting boundary for the browser-first
dense-pupil native-capture work tracked by #224.

It complements:

- [Browser-First Dense-Pupil Native Capture Qualification Envelope](BROWSER_NATIVE_CAPTURE_ENVELOPE.md);
- [Browser-Native Capture Numerical Acceptance and Evidence Matrix](BROWSER_NATIVE_CAPTURE_NUMERICAL_ACCEPTANCE.md);
- [Browser-Native Capture Prepared-State, Ownership, and Invalidation Contract](BROWSER_NATIVE_CAPTURE_PREPARED_STATE.md);
- [Browser-Native Capture Robust Geometry and Precision Fallback Contract](BROWSER_NATIVE_CAPTURE_ROBUST_GEOMETRY.md);
- [Browser-Native Capture Path-B Adoption and Version Gate](BROWSER_NATIVE_CAPTURE_PATH_B_ADOPTION.md);
- [Numerical Correctness and Physical Units](NUMERICAL_CORRECTNESS.md).

This is a **governing accounting contract**, not a runtime implementation, public
API, new safety ceiling, or performance claim.

## Core rule

A scientifically equivalent optimization may reduce **executed** work, but it may
not erase the **logical support** of the approved Path-A calculation or evade an
existing resource limit by:

- renaming work;
- splitting one capture event into multiple budget-reset events;
- shrinking execution batches while leaving aggregate work excessive;
- hiding work in preparation or caches;
- ignoring failed or fallback attempts;
- converting a rejected four-billion spectral ceiling into another counter.

Every authoritative event must make both the scientific support and the actual
executed work auditable.

## Existing limits preserved

This contract does not raise existing limits.

Current committed limits relevant to this lane include:

- native RAW maximum raster: **24,000,000 native sites**;
- native RAW maximum dimension: **16,384**;
- native RAW execution tile width: **1–256 native sites**, with height 1;
- native RAW packed output payload: **7 bytes per native site** for the current
  codes/black-level/digital-saturation/saturation-flag arrays;
- legacy native-environment whole-event provider-evaluation maximum:
  **2,000,000,000**;
- existing per-source-tile logical provider-evaluation maximum: **100,000**.

The caller-supplied `maximumOutputBytes` is an output-payload admission budget.
It is **not** a total-memory limit.

The repository-only separable-emission experiment contains a proposed
four-billion `maximumSpectralCompositions` ceiling. That ceiling is **not adopted**
for #224 qualification by this contract.

A future public/resource-policy change requires separate review.

## Logical support versus executed work

The accounting record must separate at least two concepts.

### Logical scientific support

Logical support records the complete committed Path-A quadrature/sample demand
before implementation-specific reuse.

For each event, record enough information to reconstruct:

- native site count;
- spatial support per site or total spatial-node support;
- temporal support;
- pupil support;
- spectral support;
- complete Cartesian committed source-sample support where applicable.

For the frozen 2048×1366 base case:

- native sites: **2,797,568**;
- spatial nodes: **4**;
- temporal nodes: **1**;
- pupil samples: **128**;
- spectral nodes: **2**;
- complete committed source-sample support:
  **2,864,709,632**.

That number remains visible even if scientifically justified factorization reduces
actual geometry/source execution.

### Executed work

Executed work records actual attempted operations after preparation/reuse.

At minimum, #234's reference accounting must distinguish:

- candidate geometry attempts, if a non-reference candidate is involved;
- float64 reference geometry attempts;
- float64 fallback geometry attempts caused by candidate ambiguity;
- spectral/optical composition attempts;
- sensor/native-site processing attempts;
- provider/metadata tile-read attempts;
- observer/reporting attempts where failure can abort the event;
- completed versus failed attempts where meaningful.

No single aggregate counter may replace these categories.

## Stable accounting fields

Names may evolve before a public API exists, but semantics must remain equivalent
to the following conceptual record.

### Event identity

- capture/event ID;
- frame ID;
- source/prepared-state identity;
- integrator/method/version;
- backend/precision identity;
- raster and sample counts;
- legal tile/batch configuration;
- applicable admission budgets.

### Logical support

- `nativeSiteCount`;
- `logicalSpatialNodeCount`;
- `logicalTemporalNodeCount`;
- `logicalPupilSampleCount`;
- `logicalSpectralNodeCount`;
- `logicalCommittedSourceSampleCount`.

Counts must be safe integers or the event is unsupported.

### Planned executed work

Before authoritative scientific execution, record or conservatively bound:

- planned unique geometry requests;
- planned spectral/optical compositions;
- planned sensor-site processing;
- planned provider/metadata reads;
- maximum per-batch work by relevant category;
- planned fallback allowance if fallback can occur.

A conservative upper bound may be used where exact actual work depends on runtime
ambiguity/cache hits, but the bound must be explicit.

### Actual attempted work

During execution, monotonically record:

- candidate geometry attempts;
- candidate ambiguous outcomes;
- float64 reference/fallback attempts;
- spectral/optical composition attempts;
- sensor-site processing attempts;
- provider/metadata read attempts;
- completed batch/tile count.

An attempted operation increments **before** entering the operation/callback that
may throw.

A thrown operation is still attempted work.

## Geometry fallback accounting

The robust-geometry contract requires ambiguity fallback to be visible.

If one candidate geometry attempt returns ambiguous and one float64 fallback is
then performed, accounting records:

- one candidate attempt;
- one ambiguity outcome;
- one float64 fallback attempt.

This is not one geometry evaluation.

If the candidate confidently returns a wrong result, qualification fails; a hidden
reference shadow pass may not be used to convert the defect into a normal cache
or fallback hit.

## Reuse and cache accounting

Scientifically justified reuse is allowed, but it must remain auditable.

At minimum record:

- logical requests that demanded a value;
- actual computations performed;
- cache/reuse hits where material to the optimization claim;
- cache/reuse misses;
- applicable prepared-state identity.

A cache hit may reduce actual computation, but it does not reduce logical support.

A value reused across two wavelength nodes because visibility is proven
wavelength-independent still represents two logical spectral contributions.

Preparation that computes reusable spectral/optical coefficients is preparation
work, not a reason to remove the committed spectral-node support from evidence.

## Whole-event admission

### Admission happens before scientific source execution

The #234 Path-A reference must establish whole-event admission before the first
authoritative geometry/radiance execution.

The event plan must know, or conservatively bound, all counts required to prove
that the event can remain inside governing work and memory limits.

A bounded metadata/preparation pass may occur first when needed to validate site
profiles and derive the event plan.

That preparation pass must itself be bounded and accounted.

If the executor cannot determine a safe whole-event bound without already running
the scientific source calculation, the compact path is not admitted.

### Existing two-billion ceiling

The existing public native-environment provider work ceiling remains
**2,000,000,000** whole-event evaluations.

Decomposing one legacy provider evaluation into new internal categories does not
authorize assigning a replacement scientific-work category a larger ceiling merely
because its name changed.

In particular, the rejected four-billion spectral-composition proposal is not an
accepted way to admit the 2,864,709,632-composition base event.

For #224 Path-A qualification, #234 must either:

1. use scientifically justified preparation/factorization so the **actual dynamic
   work governed by the existing limit** remains within the accepted ceiling while
   preserving the full logical support;
2. produce a documented resource obstruction that may activate #236; or
3. remain explicitly unqualified/unsupported.

This contract does not approve a higher ceiling.

## Per-batch admission

Batching exists to bound latency and memory, not to reset whole-event work.

Every execution batch must have explicit maximums for:

- native sites or work items;
- geometry attempts;
- spectral/optical operations;
- temporary/scratch bytes;
- in-flight provider/source bytes;
- backend/device buffers where applicable.

The existing **100,000 per-source-tile logical provider-evaluation limit** remains
binding for the legacy path.

A smaller tile/batch may make one batch admissible while preserving the same
whole-event count. That is valid.

A sequence of individually admissible batches is not valid if the enclosing event
exceeds its whole-event admission.

## No split-event loophole

One committed capture event may not be represented as multiple pseudo-events solely
to reset work counters or safety budgets and then be reassembled as one
authoritative capture.

Event identity follows the committed capture/frame/source contract, not an
implementation's scheduling preference.

The required pupil and temporal refinements are separate complete qualification
events, as already frozen in the qualification envelope.

They do not borrow unused budget from another event.

## Preparation accounting

Preparation may include:

- input parsing/validation;
- caller-data copying and ownership;
- primitive validation;
- acceleration metadata construction;
- coefficient-table construction;
- canonicalization/fingerprinting where still required;
- event-plan construction;
- metadata/provider reads needed only for admission.

Do not invent a generic “operation count” for unlike preparation work.

Instead, qualification evidence should record meaningful quantities such as:

- primitive count;
- prepared coefficient/table entry count;
- provider/metadata reads;
- preparation elapsed time;
- explicit allocated buffer capacities;
- prepared-state retained bytes where deterministically knowable.

Preparation time is not geometry time.

## Memory accounting classes

Memory evidence must distinguish deterministic byte accounting from runtime/process
measurements.

### Contract-accounted bytes

For storage with known byte capacity, record exact or conservative bytes by owner.

Categories include:

- packed output payload;
- immutable prepared numeric buffers;
- event-plan buffers;
- batch scratch;
- cache capacity;
- in-flight provider/source buffers;
- fallback scratch;
- staging/readback/device buffers for later backends;
- retained diagnostic/evidence buffers.

Do not count the same allocation in two owners.

### Output payload

For the existing packed native RAW output, the payload is currently:

`7 * nativeSiteCount` bytes.

This covers the committed typed-array payload only.

It does not include:

- JavaScript object/header overhead;
- provider-owned tiles;
- prepared state;
- caches;
- scratch;
- runtime/GC overhead;
- browser/worker overhead;
- GPU/device memory.

### Peak accounted live bytes

Define **peak accounted live bytes** as the maximum sum of simultaneously live,
engine-owned explicitly sized capture buffers during the event.

It must include the output buffer while it is engine-owned before transfer.

A buffer whose ownership transfers to the caller after `takeOutput()` is no
longer engine-retained after transfer, but the event evidence still records its
payload size.

### Retained bytes

Define **retained bytes after event completion** separately.

An ordinary completed task before output transfer may retain its completed output.

After transfer/dispose/failure/cancellation, only explicitly allowed prepared-state
cache ownership may remain.

Failed/partial output is not retained as authoritative capture data.

### Runtime memory observations

Heap/process/RSS/device-memory measurements are empirical evidence and must be
reported separately from contract-accounted bytes.

Do not claim an exact JavaScript object-memory size from field counts.

Measurements must state runtime/device, measurement method, sampling interval when
relevant, and whether GC/device allocator behavior makes the number approximate.

## Memory admission

The executor must establish bounded capacities for all engine-owned event memory
before or during bounded preparation.

No authoritative event may depend on unbounded growth of:

- per-ray objects;
- full Cartesian sample arrays;
- caches;
- pending observers;
- command queues;
- readback queues;
- fallback queues.

The whole Cartesian
`spatial × temporal × pupil × spectral` event must not be materialized merely
because arithmetic support fits a safe integer.

The subsequent implementation chooses concrete internal capacities within the
existing resource policy; this document does not introduce a larger memory limit.

## Failure accounting

Failure does not erase work.

### Provider/source failure

Increment the attempted provider/geometry/source counter before invoking the
operation.

If it throws:

- the attempt remains counted;
- no later dependent operation is counted unless it actually starts;
- event state becomes failed;
- authoritative partial output remains unavailable.

This preserves existing native-environment behavior.

### Spectral/optical failure

If a spectral/optical composition begins and fails validation/arithmetic:

- count the attempted composition;
- do not count later sensor work that did not start;
- fail the event atomically.

### Sensor/readout failure

If site processing begins and fails:

- count the attempted site processing;
- withhold all event output;
- retain prior work counters for evidence.

### Observer/reporting failure

An observer is not scientific source work.

If an observer failure aborts the event, record the observer attempt/failure
separately and preserve all scientific work counts already executed.

Do not relabel observer failure as source failure.

## Cancellation and disposal

Cancellation/disposal must stop new work at a bounded checkpoint.

Rules:

- work already attempted remains counted;
- work not yet started is not counted;
- pending provider/observer/backend operations receive abort/cancel signaling when
  the runtime supports it;
- late results after cancellation/disposal are rejected;
- partial RAW/output remains unavailable;
- owned output/scratch resources are released according to the task lifecycle;
- event counters remain available for qualification evidence where the task
  contract exposes them.

A cancellation request is not proof that cancellation took effect instantly.

Qualification must measure/request the checkpoint at which new work stops.

## Backend/device failure and drain

For a future browser/GPU candidate, device/worker/backend failure must distinguish:

- work submitted;
- work known completed;
- work whose completion is unknown;
- readback pending;
- fallback/retry work started after failure.

Unknown-completion work must not be reported as completed scientific work.

If the event safely restarts on the float64 reference, all work already attempted
by the failed backend remains in the resource evidence.

A retry does not reset the event budget.

## Time accounting

Performance timing is evidence, not an admission substitute.

At minimum, measured #234/#235 evidence should separate where observable:

- preparation;
- source/geometry;
- spectral/optical arithmetic;
- sensor processing;
- batch/yield overhead;
- backend compilation/upload;
- readback;
- export/downstream work when included in an end-to-end measurement.

Report cold and warm states separately when caches/compilation materially differ.

Do not convert a small-event timing extrapolation into a native qualification
result.

## Full-native base accounting checkpoint

The frozen base case is:

- 2048 × 1366 native sites;
- 4 spatial nodes;
- 1 temporal node;
- 128 pupil nodes;
- 2 spectral nodes.

Existing bounded evidence establishes:

- native sites: **2,797,568**;
- full committed source support: **2,864,709,632**;
- factorized geometry demand in the separable prototype:
  **1,432,354,816**;
- prototype spectral compositions:
  **2,864,709,632**.

Interpretation:

- the geometry count fits below two billion;
- the current prototype spectral-composition count does not become accepted merely
  because the repository experiment allows a proposed four-billion value;
- this is exactly the scalar-work obstruction #234 must reduce through approved
  exact factorization/preparation or report as a trigger candidate for #236.

No performance conclusion follows from these counts alone.

## Refinement accounting

For each required refinement event, record a complete independent event plan and
actual result.

At minimum:

- 256-pupil refinement;
- 2-temporal-node refinement;
- focus/aperture variants;
- robust geometry boundary cases.

Do not extrapolate the base event's counters when the refinement changes reuse,
fallback frequency, support, or cache behavior.

A rejected refinement remains a rejected event; it is not a successful
qualification result.

## Stable resource evidence IDs

The following accounting evidence labels extend the BNCE record.

| Evidence ID | Requirement |
| --- | --- |
| **BNCE-RES-001** | Whole-event logical support and planned executed-work record exists before authoritative source execution. |
| **BNCE-RES-002** | Existing two-billion whole-event provider/scientific-work policy is not evaded by counter renaming or event splitting. |
| **BNCE-RES-003** | Every execution batch has explicit work and memory bounds; batch size does not reset event totals. |
| **BNCE-RES-004** | Packed output, prepared, cache, scratch, in-flight, fallback and retained memory ownership are separately accounted. |
| **BNCE-RES-005** | Attempted failing source/geometry/spectral/sensor work remains counted and partial output is withheld. |
| **BNCE-RES-006** | Cancellation/disposal stops new work at bounded checkpoints and preserves attempted-work evidence. |
| **BNCE-RES-007** | Candidate ambiguity plus float64 fallback records both attempts. |
| **BNCE-RES-008** | Legal chunk/batch changes preserve authoritative output and logical support while exposing changed batch counts/overhead. |
| **BNCE-RES-009** | Full-native base and required refinements record complete event-level work/memory outcomes, including explicit rejection. |
| **BNCE-RES-010** | Runtime memory/timing measurements identify environment and remain distinct from deterministic contract byte accounting. |

These IDs are evidence targets, not public API identifiers.

## Acceptance for this #233 accounting deliverable

This governing slice is complete when reviewed and merged with:

- [x] logical-support versus executed-work distinction;
- [x] stable executed-work categories;
- [x] whole-event admission before scientific execution;
- [x] preserved two-billion whole-event policy;
- [x] rejected four-billion spectral ceiling remains rejected;
- [x] per-batch bounds without budget reset;
- [x] no split-event loophole;
- [x] preparation/cache accounting;
- [x] exact versus empirical memory evidence;
- [x] output/peak/retained memory ownership definitions;
- [x] attempted-work failure semantics;
- [x] cancellation/disposal/device-failure accounting;
- [x] timing evidence separation;
- [x] full-native/refinement accounting requirements;
- [x] stable BNCE-RES evidence IDs.

This checklist freezes governance only; it is not proof that #224 fits the resource
envelope.

After this slice, #233 still owns:

1. preserve the final Path-B adoption/version gate once reviewed and merged;
2. final governing-contract reconciliation and #234 implementation handoff.
