# Browser-Native Capture Robust Geometry and Precision Fallback Contract

Status: **frozen robust-geometry and precision-fallback contract for Photivra
engine issue #233**.

This document defines the geometry-correctness boundary for the browser-first
dense-pupil native-capture work tracked by #224.

It complements:

- [Browser-First Dense-Pupil Native Capture Qualification Envelope](BROWSER_NATIVE_CAPTURE_ENVELOPE.md);
- [Browser-Native Capture Numerical Acceptance and Evidence Matrix](BROWSER_NATIVE_CAPTURE_NUMERICAL_ACCEPTANCE.md);
- [Browser-Native Capture Prepared-State, Ownership, and Invalidation Contract](BROWSER_NATIVE_CAPTURE_PREPARED_STATE.md);
- [Browser-Native Capture Whole-Event, Batch, Memory, and Failure Accounting Contract](BROWSER_NATIVE_CAPTURE_RESOURCE_ACCOUNTING.md);
- [Numerical Correctness and Physical Units](NUMERICAL_CORRECTNESS.md).

This is a **governing implementation contract**, not a public API declaration.
It does not add geometry code, choose a GPU backend, set a universal epsilon, or
claim that any lower-precision implementation is already qualified.

## Core rule

For the frozen #224 source envelope, the authoritative visibility result is the
identity of the first supported opaque analytic primitive intersected by the exact
committed aperture-origin ray under the declared source geometry.

A backend may use lower precision or a different execution architecture only when
it can preserve that visibility result under the acceptance rules below.

A backend must never replace uncertainty with a plausible-looking surface.

If the implementation cannot establish an unambiguous supported result, it must
use the qualified float64 reference path or fail closed as unsupported.

## Scope

This contract applies to the initial engine-owned analytic source envelope:

- bounded planar rectangles;
- boxes represented by an explicit metric primitive definition and transform;
- opaque first-visible-surface semantics;
- static source geometry during one qualification capture event;
- wavelength-independent visibility for this initial envelope.

It does not authorize:

- triangle meshes or arbitrary polygon soups;
- curved implicit surfaces;
- transparency or transmissive intersections;
- refractive scene transport;
- volumetric media;
- wavelength-dependent geometry;
- arbitrary shader-driven displacement;
- moving source geometry during exposure;
- hardware ray-tracing extensions as an assumed dependency.

Those domains require separate governing review before they enter #224
qualification.

## Reference ray and hit semantics

The prepared source and committed optical plan own the ray.

A geometric request must bind:

- finite scene-metric ray origin;
- finite normalized direction under the existing aperture-ray contract;
- source/scene state identity;
- primitive-set identity;
- transform/coordinate convention;
- exact time identity when geometry could depend on time in a later envelope.

The reference ray is conceptually:

`r(t) = origin + t * direction`.

The initial source representation must define its valid forward-hit domain
explicitly. Geometry code may not introduce a hidden “self-intersection epsilon”
that changes the source contract.

For the current camera-to-static-source qualification lane, any primitive result
used as visible source must be a finite forward intersection under the declared
primitive semantics.

## Authoritative geometry outputs

### Exact outputs

The following are exact semantic identities where applicable:

- hit versus miss;
- visible primitive ID;
- source/scene identity;
- primitive representation/schema identity;
- request/ray identity;
- supported versus ambiguous versus unsupported disposition.

A lower-precision backend selecting a different primitive is not a tolerable
floating-point difference.

### Tolerance-governed outputs

The following may be floating-point quantities:

- hit distance/parameter;
- intersection point coordinates;
- local primitive coordinates;
- derived face/boundary coordinates when required for validation.

Their numerical acceptance must follow BNCE-GEO-001/002 and the repository
numerical-correctness policy.

A numeric distance that is “close” is not sufficient if it changes visible
primitive identity.

## Float64 reference ownership

The #234 CPU reference path owns the primary computational geometry reference for
Path A.

The reference implementation must use binary64 arithmetic for its analytic
primitive calculations and must remain independently testable from any lower-
precision backend.

The float64 reference is a **computational reference**, not a claim of exact real
arithmetic.

Therefore the reference itself requires:

- independently derived analytical fixtures;
- explicit degeneracy handling;
- exact primitive-identity checks;
- tests across scale and boundary conditions;
- no hidden global epsilon.

Where the declared source itself is semantically degenerate or ambiguous, binary64
must not invent source meaning.

## Primitive reference requirements

### Planar rectangles

The reference rectangle representation must own enough information to determine:

- its supporting plane;
- finite bounded extent;
- coordinate/basis convention;
- primitive identity;
- inside/outside boundary convention.

The implementation may use any stable analytic formulation, but qualification must
independently verify:

- clear front-facing hit;
- clear miss outside each bounded edge;
- translated/subpixel-scale sliver hit;
- edge and corner boundary cases;
- near-parallel/grazing rays;
- large and small supported coordinate magnitudes;
- deterministic result under batch/chunk reordering.

A denominator that is numerically difficult to classify must not be silently
treated as zero or nonzero by an arbitrary global threshold.

### Boxes

The reference box representation must own:

- explicit metric bounds in its canonical local representation;
- transform/orientation identity where applicable;
- deterministic inside/outside semantics;
- primitive identity.

An implementation may use a slab-style or equivalent analytic method, but
qualification must independently verify:

- clear face hit;
- clear miss;
- edge and corner crossings;
- grazing/near-parallel directions;
- origin-inside behavior according to the declared source semantics;
- transformed/oriented cases if transforms are part of the supported source
  representation;
- near-coincident competing primitives.

No box face ordering may leak into visible primitive identity between distinct
source primitives.

## Distinct-primitive tie behavior

Two distinct primitives may not be ordered merely by:

- array order;
- memory address;
- hash order;
- primitive ID lexical order;
- GPU invocation order;
- batch/chunk order.

If two distinct supported primitives have the same first-hit distance under the
declared source semantics, the initial source contract must either:

1. provide an explicit, reviewed, versioned physical/source priority rule; or
2. classify the request as ambiguous/unsupported.

The initial #224 qualification does **not** gain such a priority rule merely from
this document.

Near-coincident primitives whose ordering cannot be established safely follow the
ambiguity/fallback rules below.

## Same-primitive face/boundary behavior

A box edge or corner can be represented by multiple mathematical faces of the
same primitive.

For the initial source envelope, **primitive identity** is the authoritative
visibility identity.

Face identity is not made authoritative unless a later source/radiance contract
requires it.

This prevents implementation-specific face ordering from creating false
cross-backend disagreement when the same primitive is unambiguously visible.

## Candidate result classes

A non-reference backend must classify every geometry request into one of these
internal semantic outcomes:

1. **unambiguous miss** — the backend can establish that no supported primitive is
   intersected;
2. **unambiguous hit** — the backend can establish one first-visible primitive,
   with a bounded numerical hit result;
3. **ambiguous** — finite precision cannot safely establish hit/miss, boundary
   inclusion, or first-visible ordering;
4. **unsupported** — the request/source/backend combination is outside the
   qualified precision/domain.

These are semantic states even if the implementation uses a different internal
representation.

A backend is not qualified if it has only “hit/miss” with no way to surface cases
where its precision assumptions are invalid.

## Precision certification

There is no universal geometry epsilon.

A lower-precision result may be accepted without reference recomputation only when
the backend has a reviewed error/conditioning argument sufficient for that exact
operation and request.

The argument must cover all decisions that can affect visibility, including where
applicable:

- plane-denominator sign/near-zero classification;
- forward-hit classification;
- bounded-rectangle inclusion;
- box near/far interval ordering;
- transform error;
- hit-distance ordering between competing primitives;
- finite-number/overflow/underflow behavior.

A backend-specific bound may depend on:

- arithmetic precision;
- operation sequence;
- coordinate magnitude;
- ray direction;
- transform conditioning;
- primitive dimensions;
- hit distance.

It may not be a fixed world-space epsilon chosen because screenshots look correct.

## Interval/separation requirement

Where an implementation uses an error interval or equivalent conservative bound,
the first-visible result is unambiguous only if the bound proves all required
decisions.

For competing hit candidates, the selected first hit must be separated from every
competitor strongly enough that their admissible distance/error regions do not
permit an ordering reversal.

Conceptually, if the selected candidate owns a possible distance interval
`I_selected` and another candidate owns `I_other`, then accepting the selected
primitive requires a strict ordering proof equivalent to:

`max(I_selected) < min(I_other)`.

The implementation does not have to expose literal intervals, but its proof must
be at least this conservative for visible-surface ordering.

Overlapping uncertainty regions are **ambiguous**, not “close enough”.

For rectangle/box boundary tests, the same principle applies to inside/outside
classification: a point whose uncertainty region straddles a semantic boundary is
ambiguous unless the source contract defines that boundary in a way the backend
can prove.

## Miss certification

A lower-precision **miss** is just as important as a hit.

A candidate may report an unambiguous miss only when its error analysis proves
that no supported primitive could contain a valid forward intersection.

If a near-parallel, edge, transform, overflow, or distance-bound condition could
turn the miss into a hit, the result is ambiguous and must follow fallback.

This prevents “precision lost the object” from being accepted as empty space.

## Fallback chain

The runtime fallback contract is:

1. execute the candidate geometry operation;
2. if the candidate returns **unambiguous hit/miss**, use it;
3. if it returns **ambiguous**, recompute that exact geometric request using the
   qualified float64 reference;
4. if the float64 reference returns a unique supported result, use that result;
5. if the source/request remains semantically degenerate or unsupported, fail
   closed for authoritative capture.

Fallback is per exact request unless later evidence justifies a broader safe
decision.

A fallback must preserve the original request/source identity. It may not rebuild
a slightly modified ray or geometry to make the case easier.

## Backend disagreement rule

Qualification distinguishes a self-declared ambiguity from a wrong “confident”
answer.

If a candidate marks a case ambiguous and the reference resolves it, normal
fallback behavior is allowed.

If a candidate claims **unambiguous** hit/miss but the qualified reference
disagrees on hit/miss or primitive identity, that is a backend correctness defect.

The implementation must not hide such a defect by silently shadow-running the
reference and replacing the answer.

The affected backend/domain remains unqualified until the error bound,
classification logic, or implementation is corrected.

This rule is required by BNCE-BACKEND-001.

## Reference ambiguity and unsupported source state

The float64 reference may not invent semantics for a source configuration that is
itself ambiguous.

Examples include:

- exact coincident first surfaces of distinct primitives with no declared priority;
- invalid/degenerate rectangle basis;
- singular or invalid primitive transform;
- non-finite geometry;
- unsupported zero-volume/zero-area primitive semantics;
- a representation whose inside/outside rule is missing.

Such input must be rejected during preparation where possible.

If the condition can arise only for a specific ray, execution must fail closed
without publishing an authoritative partial result.

## Boundary ownership

The source representation must explicitly own whether mathematically exact
primitive boundaries are closed/open/half-open as needed to make its semantics
deterministic.

Geometry code may not choose boundary inclusion ad hoc per backend.

For two distinct primitives that intentionally share a boundary, a source-level
rule is required if that boundary can alter primitive identity.

Absent such a rule, exact shared-boundary first-hit cases are unsupported for
authoritative #224 qualification.

## Coordinate scale and normalization

Normalizing every scene into an arbitrary hidden scale is not an acceptable way
to conceal precision problems.

A backend may use a documented coordinate transform or local primitive space when:

- the transform is part of prepared-state identity;
- the transformation is mathematically equivalent to the declared source geometry;
- conditioning is included in the numerical error argument;
- returned primitive identity remains exact;
- transformed arithmetic cannot silently change the physical unit interpretation.

Qualification must include more than one supported coordinate scale so that a
backend is not accidentally validated only near unit magnitude.

## Lower-precision browser backends

For a runtime using arithmetic materially different from the float64 reference:

- qualification is operation- and domain-specific;
- “uses IEEE-like floats” is not sufficient evidence;
- shader/compiler behavior must be checked against the platform specification
  current at implementation time;
- mixed-precision approaches must identify where precision changes;
- CPU accumulation cannot repair an earlier wrong surface selection;
- backend/device capability admission must be explicit.

A device may be supported through the float64 CPU/reference path even when its
GPU geometry path is not qualified.

This is not a scientific downgrade.

## Determinism and ordering

For identical validated inputs, candidate ambiguity classification and float64
reference results must not depend on:

- batch size;
- legal tile/chunk width;
- worker scheduling;
- primitive iteration order where the source semantics do not define an order;
- unrelated source objects;
- current device load.

Parallel reduction or traversal may change execution order only when the resulting
visibility semantics remain identical.

## Work and fallback accounting

Geometry work must remain truthful.

At minimum, later #233 accounting must be capable of distinguishing:

- candidate geometry attempts;
- candidate ambiguity outcomes;
- float64 reference fallback recomputations;
- unsupported/rejected geometry requests;
- completed unique geometry evaluations.

A candidate attempt followed by float64 recomputation is **two pieces of executed
work**, not one.

Fallback frequency is also qualification evidence: a backend that is formally
correct but falls back on a material fraction of ordinary supported cases may be
scientifically valid yet unsuitable for the intended performance role.

The exact work/memory ceilings remain owned by the subsequent #233 accounting
deliverable.

## Cancellation and failure

Cancellation/failure semantics remain atomic.

If cancellation, device loss, or backend failure occurs:

- no ambiguous candidate answer may be promoted to final visibility;
- no partially resolved source result may become authoritative output;
- any completed reference fallback remains ordinary attempted work;
- the existing no-partial-RAW rule remains in force.

A candidate backend may fall back to CPU after a recoverable backend-specific
failure only if the event/task contract permits that transition without changing
scientific identity or violating its resource/cancellation contract.

The later accounting contract must bound this behavior.

## Required geometry evidence cases

The following stable subcases refine BNCE-GEO-001/002. They are evidence labels,
not public API identifiers.

| Evidence case | Required behavior |
| --- | --- |
| **BNCE-GEO-001-A** | Clear centered rectangle hit; exact primitive identity and independently checked float64 hit geometry. |
| **BNCE-GEO-001-B** | Clear rectangle miss outside each finite edge. |
| **BNCE-GEO-001-C** | Clear box face hit and miss. |
| **BNCE-GEO-001-D** | Translated/subpixel-scale visible sliver with exact visible primitive identity. |
| **BNCE-GEO-001-E** | Deterministic same-primitive box edge/corner crossing. |
| **BNCE-GEO-002-A** | Near-parallel/grazing rectangle ray; candidate either certifies result or marks ambiguous and falls back. |
| **BNCE-GEO-002-B** | Near-parallel box slab/face case; no silent hit-to-miss change. |
| **BNCE-GEO-002-C** | Two distinct primitives with very small positive depth separation; candidate must prove ordering or fall back. |
| **BNCE-GEO-002-D** | Exact coincident first surfaces of distinct primitives without source priority; explicit unsupported result. |
| **BNCE-GEO-002-E** | Boundary uncertainty where candidate precision straddles rectangle/box inclusion; fallback required. |
| **BNCE-GEO-002-F** | Multiple supported coordinate magnitudes and transformed primitives where applicable. |
| **BNCE-GEO-002-G** | Candidate claims unambiguous result but reference disagrees; backend qualification fails. |
| **BNCE-GEO-002-H** | Legal chunk/batch/order changes do not alter hit/miss, primitive identity, or ambiguity classification. |

Each implemented evidence record must bind the source fixture/revision, exact ray,
primitive definitions, backend/precision, reference implementation revision, and
acceptance result.

## Independent analytical references

The geometry test oracle must not be only another call into the production
intersection function.

Constructed fixtures should use independently derived relations with values chosen
so expected results are simple and inspectable where possible.

Examples include:

- axis-aligned plane intersections with exact/simple distances;
- centered rectangle bounds;
- boxes with analytically obvious entry/exit distances;
- symmetric aperture-origin rays;
- deliberately controlled depth separations.

Hard boundary/conditioning cases may compare against the float64 reference, but
the reference itself must first be anchored by independent analytical tests.

## Relationship to BNCE acceptance

This contract completes the missing semantics behind:

- **BNCE-GEO-001** — exact visible primitive identity plus tolerance-governed
  intersection geometry;
- **BNCE-GEO-002** — precision-sensitive boundary/ordering behavior;
- **BNCE-BACKEND-001** — candidate backend may not claim equivalence when it
  confidently disagrees with the reference;
- **BNCE-FALLBACK-001** — unsupported precision uses qualified fallback or explicit
  unsupported behavior.

It does not change BNCE-RAW-001: if a geometry difference propagates into a
different required deterministic RAW code, Path-A equivalence still fails.

## Public/package boundary

This contract does not require a new public geometry API.

The first implementation may be repository-internal to the #234 reference and
later #235 candidate comparison.

Any future public primitive/intersection contract requires separate review for:

- schema/versioning;
- units and coordinate semantics;
- boundary/tie behavior;
- serialization;
- compatibility;
- provenance;
- SemVer impact.

## Acceptance for this #233 geometry deliverable

This governing slice is complete when reviewed and merged with:

- [x] exact hit/miss and primitive-identity semantics;
- [x] float64 reference ownership;
- [x] rectangle/box reference requirements;
- [x] no arbitrary distinct-primitive tie ordering;
- [x] candidate ambiguity state;
- [x] quantity/request-specific precision certification;
- [x] conservative hit and miss certification;
- [x] float64 fallback chain;
- [x] backend-disagreement failure rule;
- [x] source-semantic ambiguity/unsupported behavior;
- [x] deterministic boundary ownership;
- [x] scale/transform conditioning requirements;
- [x] work/fallback accounting handoff;
- [x] cancellation/failure rules;
- [x] stable BNCE geometry evidence subcases.

This checklist freezes governance only; it is not evidence that an implementation
already satisfies the cases.

After this slice, #233 still owns:

1. preserve the whole-event/batch/memory/failure accounting contract once reviewed and merged;
2. final Path-B adoption/version gate;
3. final governing-contract reconciliation and #234 implementation handoff.
