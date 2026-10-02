# Production Image-Formation Plan

Photivra's production composition layer is separate from the legacy
`simulatePocCamera()` proof-of-concept API.

The plan contract is a renderer-neutral, browser-safe semantic layer:

```text
prepared static context
  + immutable capture snapshot
  + authoritative image-formation graph
  -> deterministic production image-formation plan
```

It does not turn the TypeScript engine into a path tracer and it does not
permit an application or renderer to silently redefine scientific ordering.

## Contract versions

The production plan has independent version surfaces:

- `PRODUCTION_IMAGE_FORMATION_PLAN_VERSION`;
- `PREPARED_IMAGE_FORMATION_CONTEXT_VERSION`;
- `PRODUCTION_CAPTURE_SNAPSHOT_VERSION`;
- `RENDERER_CAPABILITY_SCHEMA_VERSION`;
- `IMAGE_FORMATION_FIDELITY_PROFILE_SCHEMA_VERSION`.

Those remain distinct from:

- npm package version;
- `ENGINE_API_VERSION`;
- `IMAGE_FORMATION_CONTRACT_VERSION`;
- `POC_SIMULATION_API_VERSION`.

A plan records all of these materially relevant engine/plan contract versions.

## Prepare once, evaluate many

Use `prepareImageFormationContext()` for relatively static semantic inputs:

- resolved generic equipment exposure capabilities;
- scene/provider identity;
- #110 optical-throughput profile;
- output-geometry profile identity;
- renderer capability declaration;
- fidelity profile.

The returned context is cloned, deeply frozen, and fingerprinted.

Later mutation of UI objects or source profile objects cannot change the
prepared context.

## Immutable capture snapshot

Use `createProductionCaptureSnapshot()` for per-capture dynamic state:

- capture ID;
- release-frame ID;
- committed scene-state ID;
- physical scene time;
- aperture/shutter/ISO;
- output-state identity;
- deterministic capture seed;
- optional #85 scene-radiance request/result plus #110 focus/field input;
- optional generic front-of-lens filter stack.

The snapshot is also cloned, deeply frozen, and fingerprinted.

Once committed, later UI state changes do not mutate its plan identity.

## Fidelity is capability-based

A fidelity profile does not use labels such as `low`, `medium`, or `high`.

It declares:

- required image-formation stages;
- required effects and model identities;
- required renderer spectral capability;
- sensor-domain requirement;
- depth requirement.

Stage dependencies are expanded from `getImageFormationContract()`, which
remains the semantic source of truth.

Request order does not change semantic identity: set-like stage/effect lists
are normalized into authoritative contract order before fingerprinting.

## Stage and effect states

The plan distinguishes:

- `active`;
- `modeled-zero`;
- `omitted-by-fidelity`;
- `unsupported`;
- `blocked`.

This matters because a numerically neutral modeled effect is not the same as
an absent or unsupported effect.

The first composed effect is illumination vignetting:

- explicit unity throughput -> `modeled-zero`;
- non-unity declared throughput -> `active`;
- not requested -> `omitted-by-fidelity`.

A non-unity field-throughput input cannot be supplied while the fidelity
profile omits illumination vignetting; that becomes a structured blocker.

## Renderer capability declaration

A renderer declares semantic capability, not raw WebGPU/Three.js objects.

The declaration includes:

- optimized-interactive vs reference consumer kind;
- supported stages/effects;
- wavelength-resolved vs wavelength-independent spectral support;
- temporal-sampling bound;
- depth support;
- inverse field mapping;
- alpha representation;
- depth-order preservation;
- sensor-domain processing capability.

The plan does not silently degrade requested fidelity.

Capability mismatch becomes a structured blocker such as:

- `renderer-stage-unsupported`;
- `renderer-effect-unsupported`;
- `renderer-spectral-capability-insufficient`;
- `renderer-sensor-domain-processing-unavailable`;
- `renderer-depth-capability-insufficient`.

## First physical composed path

Current plan schema `0.5.0` composes the #110 physical sample path.

For a fidelity profile requiring `lens-field-pupil-evaluation`, dependencies
expand to:

```text
scene-ray-projection
  -> scene-radiance-evaluation
  -> lens-field-pupil-evaluation
```

The plan consumes one immutable #85 scene-radiance request/result and evaluates
#110 with:

- prepared lens-throughput profile;
- resolved equipment focal length;
- committed aperture;
- explicit focus state;
- image-plane field point;
- declared field throughput.

The plan stores the resulting pre-sensor-stack spectral irradiance result.

This path never substitutes an RGB preview for physical spectral irradiance.

## Release-frame and white-balance capture binding

Plan contract `0.5.0` / capture snapshot `0.3.0` add the preferred handoff from #105 release sequencing into production composition.

Use `createProductionCaptureSnapshotFromReleaseFrame()` when a logical release frame has already been committed. The helper takes ownership from the release frame for:

- release sequence/frame identity;
- aperture, shutter and ISO;
- focus state;
- AE/AF/AWB automation state;
- exposure start/end and sequence-relative scene time;
- timing constraints;
- stochastic frame seed;
- committed white-balance state identity.

When the release frame declares `whiteBalanceStateId`, the full resolved #108 WB state must be supplied and its ID must match. A release frame with locked AWB requires a locked WB state.

The snapshot stores both the release binding and resolved WB state inside its deterministic fingerprint. Later UI changes therefore cannot alter the committed capture.

The release-frame sequence-relative scene time is preserved separately from `sceneTimeSecondsFromExposureStart`: the latter remains the local time used by #85/#110 scene-radiance evaluation within the exposure.

Existing `createProductionCaptureSnapshot()` remains supported for lower-level callers. Its optional release/WB fields receive the same validation when present.

## Front-of-lens filter capture state

Plan contract `0.5.0` / capture snapshot `0.3.0` preserve optional #135 front-of-lens filter state in the immutable physical scene sample.

The filter stack is:

- parsed/validated when the capture snapshot is committed;
- included in the capture fingerprint;
- forwarded to #110 exactly once;
- preserved in the #110 physical result as filter count, transmission factor, attenuation and evidence.

Changing only the selected filter stack changes capture/plan identity and the physical sensor-plane irradiance result, but it does not alter committed aperture/f-number, focus geometry, DOF or diffraction.

Filter transmission remains separate from lens transmission/T-stop and from sensor optical-stack response.

## Temporal capture composition

Plan contract `0.2.0` adds immutable temporal-capture input.

A capture may bind:

- #12 exposure-window input;
- sensor readout declaration;
- physical imaging area and capture orientation;
- optional constant pure-camera-rotation velocity;
- deterministic temporal quadrature sample count.

The planner evaluates exposure windows and sensor readout separately:

```text
exposure-window time reference:
  first-opening-boundary-phase

sensor readout phase:
  separate native-sensor timing contract

synchronization:
  not assumed
```

If pure rotation is supplied, the planner reuses `calculateCaptureRotationTemporalQuadrature()`. The committed quadrature count is part of capture identity and a renderer may not silently reduce it.

Requested spatial-camera-rotation distinguishes:

- nonzero rotation with resolved quadrature -> `active`;
- explicit zero angular velocity -> `modeled-zero`;
- missing rotation model -> `blocked`.

Requested rolling-readout distinguishes:

- rolling native readout -> `active`;
- global/no-spatial-skew timing -> `modeled-zero`;
- missing readout declaration -> `blocked`.

A renderer whose declared temporal-sampling capacity is below the committed quadrature count receives a structured `renderer-temporal-sampling-insufficient` blocker.

The image-formation graph is still authoritative. Because `temporal-exposure-readout` depends on `field-wavelength-psf`, useful temporal results may exist while the whole requested fidelity plan remains blocked until PSF composition lands.

## Scientific assurance composition

Plan contract `0.4.0` records the cross-engine #134 `scientificAssurance` summary whenever composed scientific results exist.

The physical path preserves distinct required components for scene radiance, optical throughput, the Photivra primary-optics bridge model, selected front filters, and non-unity field throughput when present. Temporal composition adds its own explicit schedule-model component.

The summary:

- cannot exceed the weakest required component status;
- degrades to `unknown` when required evidence is missing;
- preserves component evidence and uncertainty declarations;
- reports quantified component uncertainty as `not-propagated` unless a real propagation rule exists;
- never converts `not-quantified` into zero;
- participates in the plan fingerprint.

See [Scientific Assurance and Uncertainty Composition](SCIENTIFIC_ASSURANCE.md).

## Optimized and reference consumers

Use `createProductionPlanConsumerManifest()` to project one finalized semantic plan into either:

- `interactive-optimized`; or
- `reference`.

Both manifests retain the same:

- plan fingerprint;
- active/modeled stage identities;
- active/modeled effect identities;
- #110 physical result;
- temporal capture result;
- capture seed;
- structured blockers;
- scientific assurance/evidence/uncertainty.

The consumer role changes execution responsibility only. It does not authorize changing scientific inputs, reordering stages, replacing seeds, or reducing committed temporal samples.

## V1 integration map

[V1 composition and consumer map](V1_COMPOSITION_MAP.md) links all 32 scoped
items to their implemented primitives/consumers and representative tests, and
records the missing upstream RAW handoff and existing ticket ownership. Bounded
RAW/output adapter execution does not activate production-plan stages.

## Unsupported stages remain visible

Current plan schema `0.6.0` deliberately does not claim full downstream sensor
composition.

If a fidelity profile requests a stage that the production composer has not
yet integrated, the plan reports `engine-stage-not-composed`.

Examples include the still-uncomposed portions of:

- PSF evaluation;
- temporal radiance accumulation beyond the implemented timing/rotation diagnostics;
- sensor optical stack;
- CFA/photosite sampling;
- charge/noise/ADC;
- reconstruction/orientation/crop/display when no committed RAW processing policy is attached.

Plan 0.6.0 explicitly composes those four post-RAW stages from `processedOutput`,
without removing missing upstream blockers. See [processed output](PROCESSED_OUTPUT.md)
for exact binding, rendering intent, domain/order and migration requirements.

The existence of standalone primitives does not mean the production composer
may silently mark those stages active.

This is how #111 can grow incrementally without turning the application into
the de facto scientific integration layer.

## Structured blockers vs malformed input

Malformed schemas, non-finite numbers, invalid equipment settings, identity
drift, and tampered fingerprints fail fast.

Scientifically incomplete but structurally valid requests return a blocked
plan with explicit blocker codes, for example:

- missing #110 optical profile;
- missing physical scene sample;
- renderer fidelity mismatch;
- requested stage not yet composed;
- #110 evaluation blocked by wavelength/applicability constraints.

## Deterministic identity

Prepared contexts, capture snapshots, and finished plans use canonical JSON
serialization plus an FNV-1a 32-bit fingerprint.

The fingerprint is explicitly:

```text
non-cryptographic
purpose: deterministic reproducibility key
```

It is not an integrity/security checksum.

`serializeProductionImageFormationPlan()` emits canonical key ordering so
identical semantic inputs serialize identically across supported runtimes.

## Stochastic ownership

The capture snapshot owns one explicit unsigned 32-bit capture seed.

The plan records:

```text
backendRandomnessMayRedefineScientificResult = false
```

Future stochastic stages must derive reproducible sub-seeds from an explicit
engine-owned policy rather than allowing backend randomness to silently change
scientific results.

## POC compatibility

The production plan is additive.

It does not call, rewrite, or reinterpret `simulatePocCamera()`.

`POC_SIMULATION_API_VERSION` remains independent, and plan results report
`legacyPocModified: false`.

Migration should happen deliberately:

1. add/expand production plan stages;
2. add optimized/reference consumers;
3. migrate application consumers;
4. deprecate POC only through an explicit compatibility decision.
