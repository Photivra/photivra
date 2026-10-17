# Executed environment capture to native RAW

> **Release context.** This page was written for package 1.2.0 (root API 1.2.0) and has not been re-reviewed for later releases. The [changelog](../CHANGELOG.md) describes the current release. Model and subsystem version numbers on this page, and any dated records, are separate from the package version. See also the [developer guide](DEVELOPERS.md) and the [1.2.0 release contract](RELEASE_1_2_0.md).

See also: [ideal pupil rays](SENSOR_APERTURE_RAYS.md), a follow-up that adds an evaluator for rays from different points in the pupil, selected explicitly. It keeps the limits below and does not turn on production depth or visibility composition.

This page describes how Photivra simulates a RAW capture of a scene environment (a "sky dome" of light coming from every direction), using radiance values supplied by your code.

- `calculateEnvironmentSensorPhotoSignal()` runs the bounded environment exposure for one destination site (photosite).
- `simulateEnvironmentSensorRawFrame()` applies that to a complete reference native frame. It hands the photo and dark-charge expectations to the existing producer for charge, capacity, seeded noise and ADC.

The resulting RAW frame can be reconstructed and exported with the existing paired DNG/JPEG API. These are additional execution APIs. They do not turn on the general production-plan capability registry, and do not implement surface rendering.

## Execution and ownership

**The provider.** The caller supplies a synchronous `evaluateRadiance(request)` function that returns a `SceneRadianceEvaluationResult`. The engine builds each request, calls that function and validates the result. This proves the function was called; it does not prove the provider's light transport is physically correct. The engine does no file or network access, and installs no renderer or new runtime dependency.

**The steps.** For every local shutter midpoint, every spectral midpoint, and every support point (before anti-aliasing, over the aperture):

1. Resolve the optional sampled lens PSF (point-spread function) at the destination and wavelength.
2. List its complete inverse support, including zero-weight taps. If the PSF is explicitly omitted, use the destination point.
3. Convert from native +Y-down to image-plane +Y-up. Reuse the focus-aware ideal projection and the analytic inverse camera rotation to get each environment look direction. The request's propagation direction (toward the camera) is the negative of this.
4. Call the provider separately for each source point, wavelength and time. Validate identity, units, wavelength basis, evidence and scene/profile bindings.
5. Apply the existing paraxial radiance-to-irradiance bridge at that source point. An optional normalised PSF shape then redistributes those physical irradiances, once.
6. Apply sensor-response applicability and range checks, and EQE (external quantum efficiency), separately at each instant. Then integrate using uniform midpoint measures in seconds.
7. Commit a temporal photo signal. Full-frame execution computes dark charge for exactly the same event, and reuses the existing completeness, capacity, Poisson, signed read-noise and ADC contracts.

**Rules.**

- The destination site's colour channel owns every source tap. Source coordinates never reassign the CFA (colour filter array) phase.
- Nothing is added that would distort the result: no clipping to the crop, no renormalisation for missing support, no averaging of scene light before the response is validated, and no duplicated area, exposure duration or throughput.
- Source points outside the active capture area stay valid, as long as the declared optical and provider ranges cover them.

## Declared operating envelope

These are the limits the model works within:

- **Scene:** environment-only targets. There is no surface intersection or occlusion solver.
- **Geometry:** ideal rectilinear, focus-aware projection, and pure rotation about a constant axis in the camera axes at the start of exposure. The existing limit to the forward reference hemisphere still applies. Translation and parallax, world pose, breathing and distortion are absent (see [Lens field mapping](#lens-field-mapping-20) for the 2.0 addition).
- **Wavelength:** radiance resolved by wavelength, with an explicit air or vacuum basis. Any photon-energy context for air is still the existing sensor contract's job.
- **Field throughput:** explicitly `unity`, or `radial-illumination-vignetting`, with evidence and a limitation.
  - The radial option reuses the existing bounded radial profile. It applies attenuation once, at every physical inverse-PSF source point, before the normalised PSF redistribution.
  - Camera motion changes the scene direction, not the position in the lens field.
  - Every tap, including zero-weight taps, must lie within the declared profile range before any provider call.
  - Existing lens-transmission and front-filter inputs stay upstream of the normalised PSF shape.
  - This is an approximation owned by Photivra, not calibrated lens throughput or pupil vignetting.
  - Production composition requires the explicit `illumination-vignetting` fidelity effect, including for a modelled-zero profile.
- **PSF:** explicitly `not-applied` (with evidence and a limitation), or `sampled-local` (with the existing evidence-backed wavelength basis and local spatial model).
  - Focal length, aperture and focus must match the optical bridge.
  - The optional PSF assumes the blur is the same in a small neighbourhood of each destination (a local shift-invariance approximation).
  - Its separate relative pupil throughput is reported in the detailed diagnostics, and is not applied. No proof of overall energy conservation is claimed.
- **Timing:** one-to-one timing registration between native and colour sites, and 1 to 256 local midpoints. No assumption that the scene is constant over time is inferred.
- **Work limits:** at most 100,000 provider evaluations per site and per full frame, counted before any calls. The reference RAW producer's ceiling of 4,096 native sites also applies. This path does not claim support for 24, 45 or 60 MP.

## Frame commitment

`simulateEnvironmentSensorRawFrame()` requires every native site, in row-major order, including sites outside an active or output crop.

- Each site's aperture geometry, colour profile, binding profile and complete shutter declaration must match the committed frame. Physical focal length, aperture and focus must match too.
- Scene and provider declarations, optical and filter state, motion, PSF selection and field-throughput declarations must be the same for all sites. A single frame cannot quietly mix different camera or scene models.
- Evidence and profile comparisons use canonical field ordering, so the order in which object properties were inserted does not affect a binding.

**Scene binding.** `sceneBinding` explicitly links the capture's `sceneStateId` to the provider's `sceneId`, with evidence. This first adapter supports a committed `sceneTimeSeconds` of zero at the first opening edge. It cannot quietly add an arbitrary scene clock offset. Every site's `temporalIntegrationId` must be distinct. Generated request IDs append the temporal, node and tap identity, and pass the public-ID parser.

**Exposure schedule.** The shared exposure schedule owns each site's actual start, end and duration. Rolling openings and closings are not replaced by global midpoints or by readout time. Completeness declarations, and any additional charge declarations, must already cover that exact event; the composer does not rewrite them to make a mismatched declaration pass. Readout regime and ISO are still declared separately, through the existing producer.

## Provider contract and failure

**Data ownership.**

- Requests are owned, recursively frozen plain data. Their nested target cannot be changed to alter geometry or identity.
- Caller input is copied before execution. Provider results are parsed into owned values immediately.
- The same provider and seed give the same output only if the supplied provider code is itself deterministic. The engine does not certify that.

**Failures.** These are rejected: Promises, malformed results, stale IDs, negative radiance, an incompatible wavelength basis, provider exceptions, and attempts to change the request. No partial result or RAW frame is returned.

This is not a transaction over side effects in your callbacks: calls already made cannot be undone. Use pure local evaluators. This API provides no remote calls, persistence or external side effects.

**What is checked when.**

- Before any call: geometric coverage, PSF evidence and total work.
- During execution: each provider result, optical validity, response range, and downstream charge and readout validity.

So a late validation failure can follow earlier provider calls. The API does not claim that every possible invalid input is rejected before supplied code runs.

Temporal illumination profile bindings are kept when the provider declares them. They describe how the light source behaves. Calling the provider and parsing its result do not prove that the supplied code follows its own transport or source declaration.

## Paired export handoff

Use the frame that was actually produced as the reconstruction input. This complete helper keeps the reconstruction configuration explicit, and feeds both output files from the same realised native RAW codes:

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

Colour development, white balance, correction, rendering, output crop and orientation, metadata and file encoding keep their existing explicit owners. The RAW path does not bake JPEG processing into sensor codes. The export's acceptance by independent readers and editors is unchanged.

## Evidence and verification

The tests use synthetic profiles owned by Photivra and an explicitly declared illumination ramp. They do not use licensed commercial calibration or measured scene data.

- Independent SI calculations check the optical factor, wavelength measures, geometric area, photon energy, EQE and the time integral.
- Angular gradients exercise distinct rotated PSF rays and asymmetric kernel weights.
- Global and rolling frame tests run the optional PSF through dark charge, noise and ADC, and deterministic paired export. Decoded DNG strips equal the exact realised native codes.
- These fail closed: malformed input caught up front, total work budgets, stale provider results, changes to requests by callbacks, Promise results, provider errors and drift in the frame commitment.
- Existing PSF regression tests still use the same fixture and the same shared inverse-support rule.

Results distinguish `providerCallbackExecuted` from `providerTransportVerified`. Older child origin flags stay conservative, because their older contracts do not carry the new execution evidence. Nothing is inferred about calibrated accuracy, combined uncertainty, quadrature or support convergence, general visibility, production-plan activation, or readiness for full resolution or editors.

When introduced, this was root engine API **0.114.0**, with new model records at **0.1.0**. The npm, POC and schema versions are independent.

## Authoritative production consumer

Plan 0.7.0 can call this adapter through an explicitly committed `environmentCapture` declaration. See [production environment capture](PRODUCTION_ENVIRONMENT_CAPTURE.md).

The standalone adapter still reports `productionPlanActivated: false`, because it cannot know whether a parent composer called it. The parent plan's actual stage results and executed lineage establish the bounded activation. No child's source-truth flag is overwritten.

## Additive field-throughput candidate

Photo integration model 0.2.0 adds a radial field-throughput input. The unity arithmetic, the provider and RAW resource limits, and the conservative verification flags are unchanged.

`test/environment-field-throughput.test.ts` checks:

- independent SI photon counts integrated with radial attenuation;
- PSF weighting of source taps;
- exact parity with a unity profile;
- that the physical field position does not change with motion;
- profile ownership;
- full-frame up-front checks;
- replayable paired RAW/JPEG output.

The production planner reports requested field attenuation as `active` or `modeled-zero`, and blocks undeclared attenuation before any calls.

When written, this candidate had not been tagged or published, and the distribution version stayed 1.2.0 until the next release. External chart or backend evidence belongs to its provider; it does not become an engine calibration claim.

## Lens field mapping (2.0)

`CalculateEnvironmentSensorPhotoSignalInput.lensFieldMapping` is optional, and shared by every site of a frame. It declares how a physical sensor point becomes a scene ray:

```text
sensor point (distorted) --inverse radial/Brown–Conrady--> ideal image point
  --inverse ideal projection (rectilinear, fisheye, equirectangular)--> camera ray
  --constant-axis camera rotation--> exposure-start environment direction
```

- **Projection scale.** The same focus-aware projection distance as the rectilinear path: the thin-lens image distance at finite focus, or the focal length at infinity.
- **Area correction.** `radiometricAreaCorrection: "inverse-distortion-jacobian"` is required. Irradiance at each tap is multiplied exactly once by `1 / det(d distorted / d ideal)`, because distortion moves the same light onto a different sensor area. Field throughput and sampled PSFs are still evaluated at the physical sensor point, and must not also include that factor.
- **Incompatible features.** A mapping cannot be combined with ideal pupil rays, which use the rectilinear, distortion-free projection. Browser-native prepared sites also reject it, because their executor integrates irradiance separately.
- **Compatibility.** Without the field, plans, queries, photo signals and RAW frames are unchanged. With an identity mapping (rectilinear, `distortion: { kind: "none" }`), the photo signal and RAW are bit-identical; only the photo-signal model version (0.4.0) and the query model id record that a mapping was used.
