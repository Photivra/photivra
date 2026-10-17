# Production Image-Formation Plan

> **Release context.** This page was written for package 1.2.0 (root API 1.2.0) and has not been re-reviewed for later releases. The [changelog](../CHANGELOG.md) describes the current release. Model and subsystem version numbers on this page, and any dated records, are separate from the package version. See also the [developer guide](DEVELOPERS.md) and the [1.2.0 release contract](RELEASE_1_2_0.md).

The production composition layer decides, for one capture, which image-formation stages run, in what order, with which inputs, and what is missing. It is separate from the legacy `simulatePocCamera()` proof-of-concept (POC) API.

The plan is a browser-safe layer of meaning that does not depend on any particular renderer:

```text
prepared static context
  + immutable capture snapshot
  + authoritative image-formation graph
  -> deterministic production image-formation plan
```

It does not turn the TypeScript engine into a path tracer. It also does not let an application or renderer quietly change the scientific order of stages.

## Contract versions

The production plan has its own version numbers:

- `PRODUCTION_IMAGE_FORMATION_PLAN_VERSION`;
- `PREPARED_IMAGE_FORMATION_CONTEXT_VERSION`;
- `PRODUCTION_CAPTURE_SNAPSHOT_VERSION`;
- `RENDERER_CAPABILITY_SCHEMA_VERSION`;
- `IMAGE_FORMATION_FIDELITY_PROFILE_SCHEMA_VERSION`.

These are separate from:

- the npm package version;
- `ENGINE_API_VERSION`;
- `IMAGE_FORMATION_CONTRACT_VERSION`;
- `POC_SIMULATION_API_VERSION`.

A plan records all the engine and plan contract versions that affect it.

## Prepare once, evaluate many

Use `prepareImageFormationContext()` for inputs that change rarely:

- resolved exposure capabilities of the generic equipment;
- scene and provider identity;
- optical-throughput profile;
- output-geometry profile identity;
- renderer capability declaration;
- fidelity profile.

The returned context is copied, deeply frozen and fingerprinted. Later changes to UI objects or source profile objects cannot change it.

## Immutable capture snapshot

Use `createProductionCaptureSnapshot()` for the state of one capture:

- capture ID;
- release-frame ID;
- committed scene-state ID;
- physical scene time;
- aperture, shutter and ISO;
- output-state identity;
- deterministic capture seed;
- optionally, a scene-radiance request/result plus the focus and field input for optical throughput;
- optionally, a generic front-of-lens filter stack.

The snapshot is also copied, deeply frozen and fingerprinted. Once committed, later UI changes do not alter its plan identity.

## Fidelity is capability-based

A fidelity profile does not use labels such as `low`, `medium` or `high`. Instead it declares:

- which image-formation stages are required;
- which effects and model identities are required;
- the spectral capability required of the renderer;
- whether sensor-domain processing is required;
- what depth support is required.

Stage dependencies are expanded from `getImageFormationContract()`, which stays the source of truth for meaning.

Request order does not change identity. Stage and effect lists are treated as sets and sorted into the contract's order before fingerprinting.

## Stage and effect states

The plan uses five states:

- `active`;
- `modeled-zero`;
- `omitted-by-fidelity`;
- `unsupported`;
- `blocked`.

The difference matters. An effect that is modelled but happens to have no effect (`modeled-zero`) is not the same as one that is absent or unsupported.

The first composed effect was illumination vignetting:

- explicit unity throughput gives `modeled-zero`;
- declared throughput other than unity gives `active`;
- not requested gives `omitted-by-fidelity`.

You cannot supply a field-throughput input other than unity while the fidelity profile omits illumination vignetting. That becomes a structured blocker.

## Renderer capability declaration

A renderer declares what it can do in terms of meaning, not as raw WebGPU or Three.js objects. The declaration includes:

- consumer kind: optimised-interactive or reference;
- supported stages and effects;
- spectral support: wavelength-resolved or wavelength-independent;
- a limit on temporal samples;
- depth support;
- inverse field mapping;
- alpha representation;
- whether depth order is preserved;
- sensor-domain processing capability.

The plan never quietly lowers the requested fidelity. A capability mismatch becomes a structured blocker, such as:

- `renderer-stage-unsupported`;
- `renderer-effect-unsupported`;
- `renderer-spectral-capability-insufficient`;
- `renderer-sensor-domain-processing-unavailable`;
- `renderer-depth-capability-insufficient`.

## First physical composed path

Plan schema `0.5.0` composes the physical sample path through optical throughput.

For a fidelity profile that requires `lens-field-pupil-evaluation`, the dependencies expand to:

```text
scene-ray-projection
  -> scene-radiance-evaluation
  -> lens-field-pupil-evaluation
```

The plan takes one immutable scene-radiance request/result and evaluates optical throughput with:

- the prepared lens-throughput profile;
- the resolved equipment focal length;
- the committed aperture;
- an explicit focus state;
- an image-plane field point;
- the declared field throughput.

The plan stores the resulting spectral irradiance, before the sensor's optical stack.

This path never substitutes an RGB preview for physical spectral irradiance.

## Release-frame and white-balance capture binding

Plan contract `0.5.0` and capture snapshot `0.3.0` add the preferred handoff from release sequencing (the shutter-release model) into production composition.

Use `createProductionCaptureSnapshotFromReleaseFrame()` when a logical release frame has already been committed. The helper takes these from the release frame:

- release sequence and frame identity;
- aperture, shutter and ISO;
- focus state;
- AE/AF/AWB automation state (auto exposure, autofocus, auto white balance);
- exposure start and end, and scene time relative to the sequence;
- timing constraints;
- random-number seed for the frame;
- identity of the committed white-balance state.

When the release frame declares `whiteBalanceStateId`, you must supply the full resolved white-balance (WB) state, and its ID must match. A release frame with locked AWB requires a locked WB state.

The snapshot stores both the release binding and the resolved WB state inside its deterministic fingerprint. Later UI changes therefore cannot alter the committed capture.

The release frame's scene time (relative to the sequence) is kept separately from `sceneTimeSecondsFromExposureStart`. The latter is still the local time used by scene-radiance and optical-throughput evaluation within the exposure.

`createProductionCaptureSnapshot()` is still supported for lower-level callers. Its optional release and WB fields get the same validation when present.

## Front-of-lens filter capture state

Plan contract `0.5.0` and capture snapshot `0.3.0` keep an optional front-of-lens filter state in the immutable physical scene sample.

The filter stack is:

- parsed and validated when the capture snapshot is committed;
- included in the capture fingerprint;
- passed to optical-throughput evaluation exactly once;
- kept in the physical result as filter count, transmission factor, attenuation and evidence.

Changing only the filter stack changes the capture and plan identity, and the physical irradiance at the sensor plane. It does not change the committed aperture or f-number, focus geometry, depth of field or diffraction.

Filter transmission stays separate from lens transmission (T-stop) and from the sensor optical-stack response.

## Temporal capture composition

Plan contract `0.2.0` adds an immutable temporal-capture input. A capture can bind:

- an exposure-window input;
- a sensor readout declaration;
- the physical imaging area and capture orientation;
- an optional constant pure-camera-rotation velocity;
- a fixed number of temporal quadrature samples.

The planner evaluates exposure windows and sensor readout separately:

```text
exposure-window time reference:
  first-opening-boundary-phase

sensor readout phase:
  separate native-sensor timing contract

synchronization:
  not assumed
```

If pure rotation is supplied, the planner reuses `calculateCaptureRotationTemporalQuadrature()`. The committed sample count is part of the capture identity, and a renderer may not quietly reduce it.

Requested spatial camera rotation gives:

- nonzero rotation with resolved quadrature: `active`;
- explicit zero angular velocity: `modeled-zero`;
- no rotation model: `blocked`.

Requested rolling readout gives:

- rolling native readout: `active`;
- global timing, or timing with no spatial skew: `modeled-zero`;
- no readout declaration: `blocked`.

A renderer whose declared temporal-sampling limit is below the committed sample count gets a structured `renderer-temporal-sampling-insufficient` blocker.

The image-formation graph is still authoritative. `temporal-exposure-readout` depends on `field-wavelength-psf`. So on the sample-only route, useful temporal results can exist while the whole requested plan is still blocked. Plan 0.7.0 separately supports [bounded environment execution](PRODUCTION_ENVIRONMENT_CAPTURE.md), including an explicit modelled-zero or supported local PSF.

## Scientific assurance composition

Plan contract `0.4.0` records the cross-engine `scientificAssurance` summary whenever composed scientific results exist.

The physical path keeps separate required components for: scene radiance, optical throughput, the Photivra primary-optics bridge model, any selected front filters, and field throughput when it is not unity. Temporal composition adds its own explicit schedule-model component.

The summary:

- cannot be stronger than the weakest required component;
- drops to `unknown` when required evidence is missing;
- keeps each component's evidence and uncertainty declarations;
- reports quantified component uncertainty as `not-propagated`, unless a real propagation rule exists;
- never turns `not-quantified` into zero;
- is part of the plan fingerprint.

See [Scientific Assurance and Uncertainty Composition](SCIENTIFIC_ASSURANCE.md).

## Optimized and reference consumers

Use `createProductionPlanConsumerManifest()` to project one finished plan into either:

- `interactive-optimized`; or
- `reference`.

Both manifests keep the same:

- plan fingerprint;
- active and modelled stage identities;
- active and modelled effect identities;
- physical optical-throughput result;
- temporal capture result;
- capture seed;
- structured blockers;
- scientific assurance, evidence and uncertainty.

The consumer role only changes who is responsible for execution. It does not allow changing scientific inputs, reordering stages, replacing seeds or reducing committed temporal samples.

## V1 integration map

[V1 composition and consumer map](V1_COMPOSITION_MAP.md) links all 32 V1 items to their implemented primitives, consumers and representative tests. It also records the missing upstream RAW handoff and which ticket owned it at the time. Running the bounded standalone RAW/output adapters does not turn on production-plan stages. The explicitly bound plan 0.7.0 environment route, below, does.

## Executed environment capture and explicit unsupported capabilities

Plan 0.7.0 accepts an optional `environmentCapture` declaration. It runs `simulateEnvironmentSensorRawFrame()` inside the authoritative graph, instead of treating a RAW attachment from the caller as proof that the upstream work happened. With all required renderer declarations and an optional processing policy, this bounded route reaches all fourteen stages. The earlier sample-based and attached-RAW routes are still available, and keep their missing-stage blockers.

See [executed production capture](PRODUCTION_ENVIRONMENT_CAPTURE.md) for input ownership, exact event and profile binding, the optional output policy, replay, and the current supported scientific range.

- Stage activation means the bounded algorithms actually ran. It does not establish calibrated provider transport or physical visibility.
- An explicitly omitted PSF is a declared point-optics model, with its evidence and limitation. It is not proof of a physically perfect lens.

**Distortion (since 2.0).** The `geometric-distortion` effect is composed only through this route. The environment sites must declare a `lensFieldMapping` (see [environment capture](ENVIRONMENT_RAW_CAPTURE.md#lens-field-mapping-20)).

- Requested without a mapping: blocked with `missing-lens-field-mapping`.
- A mapping with active (non-zero) distortion that the fidelity profile did not request: execution is blocked before any callbacks, just as undeclared field attenuation already is.
- A declared zero distortion: reports `modeled-zero`.

The plan version stays 0.7.0. Existing requests that neither request the effect nor declare a mapping give bit-identical results. For requests that used to get `engine-effect-not-composed` for this effect, the change is additive.

Required effects that a route does not actually implement still report `engine-effect-not-composed`. The plan cannot quietly reinterpret a requested surface, depth, stabilisation, breathing or field-transport model as an ideal environment ray. Existing foundation APIs and their direct consumers stay valid. Unsupported combinations are not approved V1 deferrals.

## Structured blockers vs malformed input

These fail immediately: malformed schemas, non-finite numbers, invalid equipment settings, identity drift and tampered fingerprints.

A request that is structurally valid but scientifically incomplete returns a blocked plan with explicit blocker codes. Examples:

- missing optical-throughput profile;
- missing physical scene sample;
- renderer fidelity mismatch;
- a requested stage that is not composed yet;
- optical-throughput evaluation blocked by wavelength or applicability limits.

## Deterministic identity

Prepared contexts, capture snapshots and finished plans use canonical JSON serialisation plus an FNV-1a 32-bit fingerprint.

The fingerprint is explicitly:

```text
non-cryptographic
purpose: deterministic reproducibility key
```

It is not an integrity or security checksum.

`serializeProductionImageFormationPlan()` sorts keys canonically, so identical inputs serialise identically on all supported runtimes.

## Stochastic ownership

The capture snapshot owns one explicit unsigned 32-bit capture seed.

The plan records:

```text
backendRandomnessMayRedefineScientificResult = false
```

Future random stages must derive reproducible sub-seeds from an explicit policy owned by the engine. Randomness in a backend must never quietly change scientific results.

## POC compatibility

The production plan is additive. It does not call, rewrite or reinterpret `simulatePocCamera()`.

`POC_SIMULATION_API_VERSION` stays independent, and plan results report `legacyPocModified: false`.

Migration should be deliberate:

1. add or expand production plan stages;
2. add optimised and reference consumers;
3. migrate application consumers;
4. deprecate the POC only through an explicit compatibility decision.
