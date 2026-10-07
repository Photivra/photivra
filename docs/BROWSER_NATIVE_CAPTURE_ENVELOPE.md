# Browser-First Dense-Pupil Native Capture Qualification Envelope

Status: **frozen qualification scope for Photivra engine issue #233, phase-1 deliverable 1**.

This document freezes the source, camera, and image-formation stage envelope used to
qualify the browser-first dense-pupil native-capture work tracked by #224.

It is a **qualification contract**, not a new public API, a new renderer, a package
release, or a claim that the listed full-native cases already pass. Runtime behavior
remains unchanged until separately reviewed implementation work satisfies this
contract.

The governing rule is:

> Preserve the physical model and demonstrated scientific accuracy. A weaker
> device may take longer or report an explicitly unsupported capture; it must
> not silently receive weaker authoritative science.

This document is intentionally narrower than the complete Photivra engine. An effect
being outside this envelope does not remove or weaken that effect elsewhere in the
engine.

## Ownership and relationship to existing contracts

This envelope is subordinate to the existing engine contracts:

- [Image-Formation Contract](IMAGE_FORMATION.md) owns scientific stage ordering,
  coordinate spaces, and coupling.
- [Numerical Correctness and Physical Units](NUMERICAL_CORRECTNESS.md) owns units,
  exactness/tolerance rules, deterministic behavior, and numerical-change policy.
- [Browser-Native Capture Numerical Acceptance and Evidence Matrix](BROWSER_NATIVE_CAPTURE_NUMERICAL_ACCEPTANCE.md)
  freezes #233 quantity-specific exactness/tolerance classes and stable evidence IDs.
- [Browser-Native Capture Prepared-State, Ownership, and Invalidation Contract](BROWSER_NATIVE_CAPTURE_PREPARED_STATE.md)
  freezes #233 preparation ownership, reuse, cache lifetime, and invalidation semantics.
- [Browser-Native Capture Robust Geometry and Precision Fallback Contract](BROWSER_NATIVE_CAPTURE_ROBUST_GEOMETRY.md)
  freezes #233 visible-surface identity, ambiguity, reference fallback, and unsupported-precision semantics.
- [Browser-Native Capture Whole-Event, Batch, Memory, and Failure Accounting Contract](BROWSER_NATIVE_CAPTURE_RESOURCE_ACCOUNTING.md)
  freezes #233 logical/executed work, admission, memory ownership, and failure/cancellation accounting.
- [Browser-Native Capture Path-B Adoption and Version Gate](BROWSER_NATIVE_CAPTURE_PATH_B_ADOPTION.md)
  freezes #233 Path-A versus Path-B classification, alternative-method evidence, versioning, migration, and adoption approval.
- [Scientific Assurance and Uncertainty Composition](SCIENTIFIC_ASSURANCE.md) owns
  scientific status, evidence, uncertainty, and limitation propagation.
- [Executed environment capture to native RAW](ENVIRONMENT_RAW_CAPTURE.md) owns the
  existing source-to-photo-signal-to-RAW ordering and fail-closed behavior.
- [Dense-pupil qualification](DENSE_PUPIL_QUALIFICATION.md) preserves the existing
  #232 measurements and their limitations.

Nothing here authorizes changing the legacy provider limits, the existing seed
schedule, public package surface, stage semantics, or downstream app behavior.

## Frozen qualification source envelope

The #224 Path-A reference and any backend claiming equivalent execution are qualified
only against a self-contained, engine-owned generic source representation satisfying
all of the following.

### Geometry and visibility

Supported qualification geometry is a finite collection of explicit metric
**opaque analytic primitives** sufficient to express the Focus/Depth laboratory,
initially bounded planar rectangles and boxes.

Each primitive has:

- stable engine-owned identity;
- explicit scene-metric placement and dimensions;
- deterministic front/inside/outside semantics;
- deterministic first-visible-surface intersection for an exact ray;
- no dependency on renderer/UI display coordinates.

Visibility must be evaluated from the actual aperture-origin ray. A single pinhole
depth image followed by screen-space blur is not an authoritative substitute.

The qualification source is static during one capture event. Camera/subject motion
belongs to separate motion qualification and is not silently introduced here.

### Radiance

Every visible primitive supplies explicit nonnegative outgoing **spectral radiance**
with an explicit wavelength basis and coverage.

For this initial envelope:

- visibility and primitive identity are wavelength-independent;
- the visible primitive's declared spectrum may vary with wavelength;
- source radiance is deterministic for identical validated input;
- source data is local and side-effect-free;
- RGB renderer values, display colors, textures, baked lighting, and tone-mapped
  values are not substitutes for spectral radiance.

This permits exact reuse only where the owning calculation proves an invariant.
Wavelength-independent visibility does **not** by itself establish that lens
throughput, pupil weighting, sensor response, operating-range applicability, or
other downstream terms are separable.

The source may be a Photivra model assumption or evidence-backed fact according to
the existing assurance contract. This envelope does not claim calibrated real-world
radiometry.

### Explicitly unsupported source behavior

The initial #224 envelope excludes:

- transparency or alpha coverage as physical transmission;
- refraction through scene objects;
- participating media or volumetric transport;
- fluorescence or wavelength conversion;
- wavelength-dependent geometry/visibility;
- indirect/global illumination transport;
- arbitrary shader/material programs;
- arbitrary private scene callbacks as the optimized representation;
- moving scene geometry during the exposure;
- network, file, persistence, or other side-effecting source evaluation.

Unsupported input must fail closed or use an independently qualified existing path.
It must not be coerced into this envelope.

## Frozen camera and capture envelope

The qualification camera consumes existing Photivra camera/sensor contracts rather
than defining a second camera model.

Supported camera behavior for #224 is:

- ideal rectilinear, focus-aware projection in the existing coordinate conventions;
- physical focal length, f-number/aperture, and explicit finite or infinity focus;
- an ideal circular pupil represented by the committed aperture-origin samples;
- full-native sensor-raster execution with absolute native-site identity preserved;
- one-to-one native/color-site timing registration where required by the existing
  RAW path;
- existing explicit global or native-scan/local shutter schedule semantics;
- zero scene motion for the Focus/Depth qualification source;
- the existing sensor spectral-response, EQE, charge, dark-current, seeded noise,
  read-noise, capacity, and ADC contracts.

The primary Focus/Depth qualification uses zero camera translation and zero camera
rotation. Existing motion/rotation contracts remain valid elsewhere; they are not
silently folded into the first #224 qualification claim.

### Explicitly unsupported camera behavior in this first envelope

The #224 reference/backend qualification does not claim support for:

- camera translation/parallax during exposure;
- focus breathing;
- radial/tangential distortion or lateral chromatic mapping;
- non-circular/mechanically clipped pupil shapes;
- sampled local PSF execution;
- diffraction or aberration terms through this dense-pupil executor;
- dispersive ray directions or wavelength-dependent scene visibility;
- autofocus actuator dynamics or subject-recognition behavior;
- arbitrary real-lens or real-camera calibration.

Those capabilities retain their existing owners. If later #224 work needs one of
them, the governing envelope must be versioned/reviewed before implementation or
qualification claims expand.

## Frozen image-formation stage envelope

The authoritative #224 capture is evaluated through the following existing
scientific domains.

| Image-formation domain | #224 qualification disposition |
| --- | --- |
| Scene / ray geometry | **Executed.** Aperture-origin rays intersect the supported analytic source geometry with depth and occlusion preserved. |
| Scene radiance formation | **Executed.** The visible primitive supplies explicit outgoing spectral radiance in the declared wavelength basis. |
| Lens mapping + pupil / throughput | **Executed in the supported ideal envelope.** Focus-aware projection and committed circular-pupil samples are retained. Throughput terms may be reused only when proven invariant. |
| Field- and wavelength-dependent PSF | **Explicitly not applied in this first envelope.** No screen-space or post-process blur substitutes for it. |
| Time-dependent exposure / readout | **Executed.** Existing local shutter-window and temporal-measure semantics are retained even when the qualification source is static. |
| Native sensor sampling | **Executed through native RAW.** Existing spatial/spectral response, photon/electron, dark-current, stochastic-noise, readout, and ADC ordering remains authoritative. |
| Orientation / reconstruction / processed output / display | **Downstream, outside #224 executor qualification.** Existing consumers may use the exact completed RAW but do not redefine this capture. |

Every physical contribution represented by this envelope is applied exactly once.
An optimization may fuse execution stages only when it is mathematically equivalent
under the governing contracts and preserves their observable scientific meaning.

## Authoritative output boundary

The #224 executor's authoritative product is a **complete native RAW result** with
its committed capture/source identity and work/accounting evidence.

The following remain exact where the existing contracts require exactness:

- native raster and site identity;
- CFA/color-site phase and absolute index;
- shutter/event identity;
- stochastic seed schedule;
- RAW clipping, rounding, and ADC code behavior;
- completed-versus-canceled/failed state;
- no partial output publication.

Processed JPEG, Print, Compare, display rendering, and UI state consume completed
capture output under their existing contracts. They are not part of the executor's
scientific qualification and cannot be used as substitute evidence for it.

## Required qualification cases

The following cases are frozen as required evidence targets. They are **not**
performance claims or universal public limits.

### Historical/small reference cases

Retain the #232 complete synthetic 2×2 cases at 32, 64, and 128 pupil samples for
global and native-scan shutters as regression/reference evidence.

### Full-native base case

The current base evidence target is:

- native raster: **2048 × 1366**;
- spatial support: **4 nodes per destination site**;
- temporal support: **1 node**;
- pupil support: **128 aperture-origin samples**;
- spectral support: **2 nodes**;
- complete event, not a partial tile.

The historical work accounting for this case is retained as evidence, not assumed to
be the optimized implementation's executed-work count.

### Required refinement evidence

At minimum, qualification must include complete-event evidence for:

1. pupil refinement from 128 to **256** aperture samples with other base dimensions
   held fixed;
2. temporal refinement from 1 to **2** temporal nodes with other base dimensions
   held fixed;
3. changed focus and aperture states over the same metric depth/occlusion source;
4. boundary controls for translated/subpixel occluders, narrow visible slivers,
   grazing/near-coincident intersections, and aperture-origin visibility changes.

A combined 256-pupil × 2-temporal full-native case is required only if the
subsequent #233 accuracy/convergence contract establishes that combined refinement
is necessary for the supported scientific claim. It must not be omitted merely
because it is expensive.

## Resource and admission boundary

This envelope does not redefine work accounting.

In particular:

- the existing public task's whole-event and tile limits remain unchanged;
- the draft four-billion spectral-composition ceiling is **not adopted**;
- smaller tiles do not make excessive aggregate work acceptable;
- a faster processor does not make logically unsupported work scientifically valid;
- exact reuse/factorization may reduce executed work only when its invariants are
  independently justified and its accounting remains truthful;
- the later #233 accounting deliverable must distinguish logical support from
  actually executed geometry/intersection, optical/spectral arithmetic,
  preparation, memory, and failed/attempted work.

A case rejected by admission remains rejected. Rejection is not successful
full-native qualification.

## Scientific claim boundary

Successful execution inside this envelope can establish a qualified Photivra model
result for the declared source/camera assumptions. It does not by itself establish:

- calibrated real-camera or real-lens behavior;
- verified external scene transport;
- quantified total model uncertainty;
- general-purpose path tracing;
- general spectral rendering;
- 24/45/60/100 MP support;
- browser/device performance outside measured candidates;
- consumer source qualification;
- product-device/human usability acceptance;
- public package promotion or production release readiness.

Those claims require their separately owned evidence.

## Change discipline

This envelope is frozen for #233 phase-1 work.

A proposed implementation optimization may change internal execution while preserving
this envelope and the existing numerical contract.

A proposed change that alters supported source behavior, camera physics, stage
semantics, committed sample meaning, or authoritative output meaning is **not** a
mere optimization. It requires a reviewed governing-contract change and the
appropriate API/schema/model/version decision before adoption.

The next #233 deliverables may add the quantity-specific accuracy/precision matrix,
prepared-state interface, and detailed work accounting. They may not silently widen
this source/camera/stage envelope.
