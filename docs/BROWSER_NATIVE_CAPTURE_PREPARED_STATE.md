# Browser-Native Capture Prepared-State, Ownership, and Invalidation Contract

Status: **frozen prepared-execution contract for Photivra engine issue #233,
deliverable 3**.

This document defines the semantic prepared-state boundary for the browser-first
dense-pupil native-capture work tracked by #224.

It complements:

- [Browser-First Dense-Pupil Native Capture Qualification Envelope](BROWSER_NATIVE_CAPTURE_ENVELOPE.md);
- [Browser-Native Capture Numerical Acceptance and Evidence Matrix](BROWSER_NATIVE_CAPTURE_NUMERICAL_ACCEPTANCE.md);
- [Browser-Native Capture Robust Geometry and Precision Fallback Contract](BROWSER_NATIVE_CAPTURE_ROBUST_GEOMETRY.md);
- [Browser-Native Capture Whole-Event, Batch, Memory, and Failure Accounting Contract](BROWSER_NATIVE_CAPTURE_RESOURCE_ACCOUNTING.md);
- [Browser-Native Capture Path-B Adoption and Version Gate](BROWSER_NATIVE_CAPTURE_PATH_B_ADOPTION.md);
- [Browser-Native Capture Path-A Reference Executor Handoff](BROWSER_NATIVE_CAPTURE_REFERENCE_EXECUTOR_HANDOFF.md);
- [Numerical Correctness and Physical Units](NUMERICAL_CORRECTNESS.md);
- [Image-Formation Contract](IMAGE_FORMATION.md);
- [Executed environment capture to native RAW](ENVIRONMENT_RAW_CAPTURE.md).

This is a **governing implementation contract**, not a public API declaration.
It does not add an exported type, cache, worker, GPU backend, renderer, package
version, or runtime behavior.

## Core rule

Preparation may remove repeated parsing, cloning, canonicalization, planning, or
coefficient construction only where the prepared value is mathematically and
scientifically invariant for every use that consumes it.

Preparation must never:

- change the physical model;
- change Path-A committed spatial, temporal, pupil, or wavelength samples/weights;
- turn a site/ray/time/wavelength-dependent value into a global constant;
- bypass local operating-range/applicability checks;
- alter absolute native-site/CFA identity or seed schedules;
- hide actual work by relabeling it as preparation;
- silently reuse state after one of its scientific dependencies changes.

A cache hit is an execution optimization, not scientific evidence.

## Prepared-state lifecycle

The reference executor planned by #234 should use three explicit lifecycle phases.

### 1. Validate and own

At preparation time the engine:

1. parses/validates the applicable governing contracts;
2. copies caller-owned plain data that must remain stable;
3. validates identity and cross-contract compatibility;
4. establishes engine ownership;
5. recursively freezes owned plain-data state where the existing ownership helper
   is applicable;
6. records the dependency identity required to prove later reuse.

`freezeOwnedData()` is not a parser or clone. The engine must copy and validate
caller-owned values before freezing them.

Mutation of caller input after preparation must not affect a prepared execution.
This is required by **BNCE-MUTATE-001**.

### 2. Prepare invariant structures

The engine may construct compact immutable numerical structures from the owned
validated state. Examples include:

- analytic primitive representations and optional acceleration metadata;
- normalized pupil quadrature definitions;
- committed spectral wavelength nodes and measures;
- wavelength-dependent source/optical/sensor coefficient tables where the exact
  dependencies permit precomputation;
- native-raster/site metadata and immutable frame/capture identities;
- shutter schedule descriptors;
- deterministic work/admission metadata.

Preparation must not materialize the full
`spatial × temporal × pupil × spectral` event product.

### 3. Execute bounded event/batches

Execution supplies the remaining site/ray/time/wavelength-dependent values,
performs source visibility and physical composition, then hands the resulting
noise-free expected signal to the existing stochastic sensor/noise/ADC stages.

Prepared state is read-only for the entire event.

No late callback, observer, cancellation path, backend, or worker may mutate it.

## Semantic prepared-state identity

A prepared state must have a deterministic **semantic identity** sufficient to
prove that it belongs to the exact scientific contract being executed.

The initial prepared identity must bind at least the following groups.

### Contract identity

- prepared-state contract/version identity;
- Path-A integrator/method identity;
- engine/scientific-contract identity required by the implementation;
- precision policy;
- supported source/camera/stage envelope revision;
- BNCE acceptance-matrix revision.

These fields prevent cached state prepared under one algorithm/precision contract
from being silently consumed by another.

### Source identity

- source representation kind/version;
- source/scene state identity;
- complete owned analytic primitive definitions;
- primitive IDs;
- coordinate-system/units identity;
- source spectrum/radiance definitions;
- wavelength basis and source spectral support;
- provider/source profile identities and applicable evidence identities.

For the frozen #224 envelope, source visibility is wavelength-independent and the
source is static during one event. Those assumptions are dependencies and must
therefore participate in the prepared identity.

A source content hash may be used as an implementation key only if its
serialization rules are themselves governed and tested. A hash is not a
substitute for validation, evidence, or source identity.

### Camera/optical identity

- physical focal length;
- focus state/distance;
- f-number/aperture;
- ideal circular-pupil definition and exact Path-A pupil sample identity;
- projection/coordinate convention;
- applicable field-throughput declaration;
- any optical coefficient/profile identity consumed by this envelope;
- explicit absence/modeling state of unsupported stages such as sampled PSF.

Changing focus or aperture is an invalidation event even if the scene is unchanged.

### Sensor and sampling identity

- native raster and imaging-area geometry;
- color-sampling profile and absolute phase;
- native-effective-raster/color-site binding;
- spatial sampling/aperture/AA inputs used by the path;
- sensor spectral-response profile and response scope;
- wavelength support/interpolation knots used by the committed spectral nodes;
- response operating-range/linearity profile and reference conditions;
- any physical area basis or response normalization consumed by the calculation.

A prepared spectral coefficient table for one sensor channel/profile cannot be
reused for another merely because wavelengths happen to match.

### Capture/event identity

The event-level prepared plan must additionally bind:

- capture ID/frame ID where existing exact contracts require them;
- scene state/time convention;
- global/native-scan shutter schedule and opening-reference convention;
- native-site timing registration;
- exact spatial/temporal/pupil/spectral sample identities/counts/weights;
- admission ceilings and chosen legal batch/tile configuration;
- seed-schedule **algorithm identity**.

The base source/optical preparation may be reusable across multiple capture events
only when all of its dependencies remain identical. Event identity itself is not
globally reusable.

The stochastic capture seed is **not** a justification for recomputing deterministic
source geometry or spectral coefficient tables. Conversely, a cache must never
reuse realized stochastic charge/read-noise results across different seeds or
native sites.

## Preparation layers and allowed reuse

Prepared state is conceptually layered so invalidation can be precise without
silently broadening reuse.

| Prepared layer | May contain | May be reused when | Must remain execution-time |
| --- | --- | --- | --- |
| **Source representation** | validated opaque analytic primitives, metric transforms, primitive bounds/acceleration metadata, source spectra | source representation/version/content, scene state, units/coordinates and source assumptions are identical | actual ray intersection/visible primitive for each distinct geometric request |
| **Optical/sample basis** | focal/focus/aperture contract, pupil sample basis/weights, invariant throughput coefficients | all optical identity and sample identities are identical | site-specific ray construction, aperture-origin visibility, any field/local applicability dependent on the actual request |
| **Spectral/response basis** | committed wavelength nodes/measures, spectrum interpolation tables, sensor response coefficients where valid | wavelength basis/support, source spectrum identity, optical spectral identity, sensor response/profile/channel identity and reference conditions match | visible-primitive selection, local source value, per-bin operating-range/linearity checks, accumulation |
| **Sensor/native frame basis** | native raster/site mapping, CFA phase/binding, immutable sensor/readout profile identity | exact frame-independent sensor/profile geometry is identical | absolute native index, site channel assignment where derived from the index, site-local signal, stochastic realization |
| **Exposure schedule basis** | validated shutter declaration and reusable schedule coefficients | the complete schedule/reference convention is identical | local exposure window/time nodes when they vary by native site |
| **Event plan** | exact committed sample identities, work admission, batch/tile plan, capture/frame identities | only within the same event identity | actual attempted work, cancellation/failure state, produced signal/RAW |
| **Batch scratch** | bounded temporary numeric arrays/queues | never promoted to cross-event scientific state | all values; clear/release after batch/event as specified |

This table defines allowed ownership, not a requirement to implement seven runtime
objects. #234 should use the smallest structure that preserves these semantics.

## Values that must not be globally cached

The following are request-dependent under the frozen contract and must not be
treated as source-global prepared constants unless a later governing proof narrows
their dependency set:

- visible primitive/surface result;
- intersection position/distance;
- ray direction or aperture-origin visibility result;
- site-specific source coordinate;
- native index/CFA identity;
- local shutter time/window when native scan changes it;
- local source radiance after visible-primitive selection;
- operating-range/linearity pass/fail for the actual local/bin input;
- accumulated expected photon/electron signal;
- dark-current result when temperature/exposure dependencies differ;
- stochastic charge/noise realizations;
- RAW codes, clipping/saturation state;
- cancellation/failure/progress state.

Identical-looking numeric values do not prove identity of these states.

## Exact invalidation rules

A prepared layer must be invalidated when **any dependency used to construct or
interpret that layer changes**.

At minimum:

### Source invalidation

Invalidate affected source preparation when any of the following changes:

- source representation kind/schema/version;
- primitive geometry, transform, bounds, material/source assignment, or primitive ID;
- scene/source state identity;
- coordinate basis or physical unit convention;
- emitted spectral-radiance data;
- wavelength basis/support;
- provider/source/illumination/material identity;
- a source assumption needed for separability or static visibility.

Do not reuse source geometry across scene versions merely because their public
display name is the same.

### Optical invalidation

Invalidate affected optical/sample preparation when any of these changes:

- focal length;
- focus;
- aperture/f-number;
- pupil definition, pupil sample count/positions/weights;
- projection convention;
- field-throughput model/profile/evidence;
- optical spectral coefficient/profile identity;
- modeled-zero/unsupported state of a stage that participates in qualification.

### Sensor invalidation

Invalidate affected sensor/spectral preparation when any of these changes:

- imaging area or native raster geometry;
- color-sampling topology/phase/binding;
- spatial sampling aperture/AA model;
- channel or response profile;
- wavelength basis/support or interpolation knots;
- response scope/normalization/area basis;
- operating-range/linearity evidence or reference conditions;
- sensor/readout profile values that are actually precomputed into the layer.

### Exposure/event invalidation

Invalidate the event plan when any of these changes:

- capture/frame/event identity;
- scene time/reference convention;
- shutter duration or opening/closing schedule;
- native-scan direction/traversal timing;
- temporal sample count/nodes/weights;
- spatial sample identity;
- pupil sample identity;
- spectral node identity;
- native tile/batch configuration when it participates in deterministic ordering or
  bounded resource behavior;
- admission budgets;
- integrator/method/version or precision policy.

Changing only a legal chunk width must not change **BNCE-RAW-001** or
**BNCE-CHUNK-001** scientific output identity, but it can require a new event/batch
execution plan.

### Stochastic-stage invalidation

Any cached/retained stochastic realization or downstream RAW state is invalid when:

- capture seed changes;
- absolute native index changes;
- noise model/version changes;
- expected charge changes;
- readout/regime/capacity/ADC configuration changes.

Prepared deterministic source/optical/spectral state does not need invalidation
solely because the physical-noise seed changes, provided no seed is an actual
dependency of that deterministic layer.

This separation prevents unnecessary preparation while preserving
**BNCE-SEED-001**.

## Dependency-key requirements

Implementation may use structural comparison, versioned content IDs, canonical
serialization, hashes, or direct immutable object identity, but every reuse decision
must be equivalent to the full scientific dependency set.

Requirements:

- cache keys must be collision-safe for the correctness claim they support;
- non-cryptographic fingerprints may optimize lookup only if equality is confirmed
  where collision could change scientific behavior;
- omission/default semantics must be explicit;
- array order remains meaningful wherever sample/order identity is meaningful;
- `-0`, finite-number, undefined-property, and serialization semantics follow the
  owning numerical/identity contract;
- private downstream IDs or proprietary scene metadata must not become required
  public-engine root dependencies;
- callback function identity is not scientific source identity.

The existing canonical-JSON utility is serialization mechanics, not automatic
permission to make every input part of a string key. #234 should remove measured
canonicalization from hot paths where immutable prepared identity can replace it.

## Cache lifetime and resource ownership

The reference path must be correct with **no persistent cross-event cache**.

A cache may improve performance, but correctness must not require previous
executions or hidden process-global state.

Default lifetime rules:

- event-plan and batch caches die with the task/event;
- batch scratch is released/reused only within bounded event ownership;
- source/optical/spectral prepared state may outlive one event only through an
  explicit owner with bounded capacity and exact dependency identity;
- caches require deterministic eviction that cannot alter scientific output;
- cancellation, failure, disposal, worker termination, or device loss must not make
  partial results reusable as completed prepared scientific state;
- no cache may retain caller-mutable references;
- no cache may retain private app data in public-engine global state.

Memory consumed by preparation/cache/scratch counts toward the later #233 resource
accounting contract. A cache is not “free” because it avoids arithmetic.

## Cross-site, cross-time, and cross-event reuse

### Cross-site

Reusable coefficients may be shared across sites only if site is absent from their
dependency set.

Intersection/visibility results may be reused only for an **exact identical
geometric request** under the same source state. Similar neighboring rays are not
identical.

Absolute native-site/CFA identity is never inferred from another site.

### Cross-time

The frozen source is static, so static source representation may be reused across
time nodes.

A geometric visibility result may be reused across time nodes only if the complete
geometric request, including origin/direction and all time-dependent dependencies,
is identical.

If a later envelope introduces source/camera motion, the reuse contract must be
revisited before implementation.

### Cross-wavelength

The frozen envelope declares wavelength-independent visibility. This permits one
geometry result to serve multiple wavelength nodes for the **same geometric ray/time
request**.

It does not permit skipping wavelength-dependent:

- source spectral radiance;
- optical transmission;
- sensor response;
- response applicability/range checks;
- photon-energy conversion;
- spectral measures.

This is the central allowed Path-A factorization and must remain visible in work
accounting.

### Cross-event

No cross-event reuse is assumed by scientific correctness.

Explicit prepared source/optical/spectral state may be reused only when the full
dependency identity matches. Event output, work counters, cancellation state,
stochastic realizations and RAW are never cross-event cache entries.

## Interaction with BNCE evidence

Prepared-state implementation must satisfy at least:

- **BNCE-ID-001** — exact binding identities;
- **BNCE-CFA-001** — absolute native/CFA identity;
- **BNCE-SEED-001** — seed schedule unchanged;
- **BNCE-SAMPLE-001** — committed Path-A samples unchanged;
- **BNCE-WORK-001** — actual reuse/work accounted truthfully;
- **BNCE-RAW-001** — exact required RAW;
- **BNCE-CHUNK-001** — output invariant to legal chunking;
- **BNCE-MUTATE-001** — caller mutation cannot alter prepared state;
- **BNCE-SERIAL-001** — versioned deterministic prepared identity where serialized;
- **BNCE-FAIL-001** and **BNCE-CANCEL-001** — no failed/partial state becomes
  authoritative output.

Add explicit invalidation tests for every dependency category before #234 can claim
prepared-state completion.

## Noise and stage-order boundary

Preparation ends before stochastic sensor realization.

The deterministic prepared/reference path may produce the noise-free expected
incident-photon/generated-electron signal using the existing image-formation order.

Then the existing sensor stages own:

1. dark/charge completeness and capacity;
2. physical shot/charge realization;
3. read noise/conversion;
4. ADC/clipping/quantization;
5. authoritative native RAW.

Numerical integration randomness, if a future Path-B method introduces it, uses a
separate method/seed identity and cannot be cached or interpreted as physical
sensor randomness.

No deterministic cache may store a noisy realization and later reuse it as though
it were an expected signal.

## Public/package boundary

The first #234 implementation may remain repository-only while this execution
architecture is qualified.

This contract does not authorize a new root export.

Any later public prepared-state API must separately define:

- public type/schema/version;
- serialization and migration behavior;
- browser/package size impact;
- compatibility with the legacy provider API;
- safe ownership/transfer semantics for workers;
- evidence/provenance handling;
- SemVer impact.

A private app-specific scene representation must not become a public-engine
dependency merely because it is convenient for one consumer.

## Acceptance for #233 deliverable 3

This contract is complete only when the reviewed governing documentation freezes:

- [x] semantic prepared-state lifecycle;
- [x] source/camera/optical/sensor/event dependency groups;
- [x] reusable versus execution-time values;
- [x] exact invalidation categories;
- [x] cache-key correctness rules;
- [x] bounded lifetime/ownership rules;
- [x] cross-site/time/wavelength/event reuse boundaries;
- [x] separation of deterministic preparation from stochastic sensor realization;
- [x] BNCE evidence obligations;
- [x] public/package boundary.

This checklist records the **definition** in this document, not runtime
implementation evidence.

The robust-geometry, resource-accounting, and Path-B governance contracts are now
merged. The
[reference-executor handoff](BROWSER_NATIVE_CAPTURE_REFERENCE_EXECUTOR_HANDOFF.md)
reconciles their requirements with this prepared-state contract and freezes the
implementation target for #234.

This document does not itself claim runtime implementation evidence.
