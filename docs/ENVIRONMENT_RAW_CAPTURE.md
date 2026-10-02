# Executed environment capture to native RAW

`calculateEnvironmentSensorPhotoSignal()` executes one destination site's
bounded environment exposure. `simulateEnvironmentSensorRawFrame()` applies that
path to a complete reference native frame and hands its photo/dark expectations
to the existing charge, capacity, seeded noise and ADC producer. Its resulting
RAW frame can be reconstructed and exported with the existing paired DNG/JPEG
API. These are additive execution APIs; they do not activate the general
production-plan capability registry or implement surface rendering.

## Execution and ownership

The caller supplies a synchronous `evaluateRadiance(request)` function that
returns `SceneRadianceEvaluationResult`. The engine generates each request,
invokes that function and validates the result. Invocation is established;
physical correctness of the provider's transport is not. The engine performs no
file/network access and installs no renderer or new runtime dependency.

For every local shutter midpoint, spectral midpoint and pre-AA/aperture support:

1. Resolve the optional sampled lens PSF at the destination/wavelength.
2. Enumerate its complete inverse support, including zero-weight taps, or use
   the destination point when PSF is explicitly omitted.
3. Convert native +Y-down to image-plane +Y-up and reuse focus-aware ideal
   projection plus analytic inverse camera rotation to derive each environment
   look direction. Request propagation toward camera is its negative.
4. Invoke the provider separately at each source point, wavelength and time.
   Validate identity, units, basis, evidence and scene/profile bindings.
5. Apply the existing paraxial radiance-to-irradiance bridge at that source point.
   Optional normalized PSF shape redistributes those physical irradiances once.
6. Apply sensor response applicability/range and EQE separately at each instant,
   then integrate with seconds-valued uniform midpoint measures.
7. Commit a temporal photo signal. Full-frame execution computes dark charge
   for the exact same event and reuses the existing completeness, capacity,
   Poisson, signed read-noise and ADC contracts.

The destination site's channel owns every source tap; source coordinates do not
reassign CFA phase. No crop clipping, missing-support renormalization, averaging
of scene light before response validation, duplicated area, exposure duration or
throughput is introduced. Source points outside active capture remain valid if
the declared optical/provider envelope covers them.

## Declared operating envelope

- Environment-only scene targets; no surface intersection or occlusion solver.
- Ideal rectilinear, focus-aware projection and constant-axis pure rotation in
  exposure-start camera axes. The existing forward-reference-hemisphere limit
  remains. Translation/parallax, world pose, breathing and distortion are absent.
- Wavelength-resolved radiance with explicit air/vacuum basis. Any air photon
  energy context remains the existing sensor contract's responsibility.
- Explicit unity field throughput with evidence and a limitation. Spatial
  vignetting is not silently synthesized. Existing lens transmission/front-filter
  inputs remain upstream of normalized PSF shape.
- PSF is explicitly `not-applied` with evidence/limitation or `sampled-local`
  with the existing evidence-backed wavelength basis and local spatial model.
  Focal length, aperture and focus must match the optical bridge. The optional
  PSF remains a destination-local shift-invariance approximation. Its separate
  relative pupil throughput is reported by child diagnostics and remains
  unapplied; no global energy-conservation proof is claimed.
- One-to-one native/color-site timing registration and 1..256 local midpoints.
  No temporal stationarity declaration is inferred.
- At most 100,000 provider evaluations per site and per full frame, counted
  before callbacks. The reference RAW producer's 4,096 native-site ceiling also
  remains. This path does not claim 24/45/60 MP support.

## Frame commitment

`simulateEnvironmentSensorRawFrame()` requires full native row-major site order,
including sites outside an active/output crop. Each site's aperture geometry,
color profile, binding profile and complete shutter declaration must match the
committed frame. Physical focal length, aperture and focus must match too.
Scene/provider declarations, optical/filter state, motion, PSF selection and
field-throughput declarations must be shared across sites; a single frame cannot
silently combine different camera/scene models.
Evidence/profile comparisons use canonical field ordering; object property
insertion order does not change a binding.

`sceneBinding` explicitly relates the capture's `sceneStateId` to the provider's
`sceneId` with evidence. This first adapter supports committed `sceneTimeSeconds`
zero at the first opening boundary. It cannot silently add an arbitrary scene
clock offset. Every site's `temporalIntegrationId` must be distinct; generated
request IDs append temporal/node/tap identity and pass the public-ID parser.

The shared exposure schedule owns each site's actual start/end and duration.
Rolling openings/closings are not replaced by global midpoints or readout time.
Completeness and any additional charge declarations must already cover that exact
event; the composer does not rewrite them to make a mismatched declaration pass.
Readout regime and ISO remain separately declared through the existing producer.

## Provider contract and failure

Requests are owned, recursively frozen plain data. Their nested target cannot be
mutated to change geometry or identity. Caller input data is snapshotted before
execution; provider results are parsed into owned values immediately. The same
provider and seed produce the same output only if supplied provider code is
itself deterministic. The engine does not certify caller code determinism.

Promises, malformed results, stale IDs, negative radiance, incompatible basis,
provider exceptions and mutation attempts reject. No partial successful result
or RAW frame is returned. This is not a transaction over arbitrary callback side
effects: callbacks already invoked cannot be undone. Use pure local evaluators;
no remote calls, persistence or external side effects are provided by this API.

Geometric coverage, PSF evidence and aggregate work are preflighted before any
callback. Provider result, optical validity, response range and downstream
charge/readout validity are checked during execution. A late validation failure
can therefore follow earlier provider calls. The API does not claim that every
possible invalid input is rejected before supplied code runs.

Temporal illumination profile bindings are preserved when declared by the
provider. They describe source behavior; invocation and parsing do not establish
that supplied code obeys its own transport/source declaration.

## Paired export handoff

Use the actual produced frame as the reconstruction input. This complete helper
keeps reconstruction configuration explicit and feeds both outputs from the
same realized native RAW codes:

```ts
import {
  simulateEnvironmentSensorRawFrame,
  createPhotographicExportPair,
  type SimulateEnvironmentSensorRawFrameInput,
  type PhotographicExportInput,
  type PhotographicExportPair
} from "@photivra/engine";

type OutputConfiguration = Omit<PhotographicExportInput, "reconstruction"> & {
  reconstruction: Omit<PhotographicExportInput["reconstruction"], "rawFrame">;
};

export async function captureEnvironmentPair(
  input: SimulateEnvironmentSensorRawFrameInput,
  output: OutputConfiguration
): Promise<PhotographicExportPair> {
  const capture = simulateEnvironmentSensorRawFrame(input);
  return createPhotographicExportPair({
    ...output,
    reconstruction: {
      ...output.reconstruction,
      rawFrame: capture.value.raw.value.frame
    }
  });
}
```

Color development, WB, correction, rendering, output crop/orientation, metadata
and file encoding retain their existing explicit ownership. The RAW path does
not bake JPEG processing into sensor codes. The export's independent-reader/editor
acceptance remains unchanged.

## Evidence and verification

The tests use owned synthetic profiles and an explicitly declared illumination
ramp, not licensed commercial calibration or measured scene data. Independent SI
expectations check the optical factor, wavelength measures, geometric area,
photon energy, EQE and temporal integral. Angular gradients exercise distinct
rotated PSF rays and asymmetric kernel weighting. Global and rolling frame tests
exercise optional PSF through dark/noise/ADC and deterministic paired export;
decoded DNG strips equal the exact realized native codes.

Malformed preflight, aggregate budgets, stale provider returns, callback mutation,
Promise returns, provider errors and frame commitment drift fail closed. Existing
PSF regressions continue using the same fixture and shared inverse-support rule.

Results distinguish `providerCallbackExecuted` from `providerTransportVerified`.
Legacy child origin flags remain conservative because their older contracts do
not carry the new execution evidence. No calibrated accuracy, combined
uncertainty, quadrature/support convergence, general visibility, production-plan
activation or full-resolution/editor readiness is inferred.

Root engine API **0.114.0**, new model envelopes **0.1.0**. npm/POC/schema versions
remain independent. This is partial #16/#178 integration coordinated with #112;
V1 remains **25/32**. #131 final science conformance and #180 documentation/1.0
preparation remain separate closure work.
