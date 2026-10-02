# Executed environment production capture

Release context: **package 1.0.1 candidate / root API 1.0.1**. Subsystem/model versions and dated introduction or measurement records below are independent historical identities; they are not distribution versions. See [developer navigation](DEVELOPERS.md) and [release contract](RELEASE_1_0_1.md).

Introduced at root API 0.116.0 and production plan 0.7.0, this adds a bounded source-to-RAW route
inside the existing authoritative image-formation graph. Consumer manifest
0.2.0 exposes the same immutable executed capture and processed-output results.
At introduction, package 0.6.0, POC 0.20.0, capture snapshot 0.3.0 and the image-formation
ordering contract 0.4.0 remain unchanged.

## Inputs and ownership

`createProductionImageFormationPlan()` accepts `environmentCapture` with:

- `capture`: the existing `SimulateEnvironmentSensorRawFrameInput`, including
  a complete native frame, owned per-site sensor/readout profiles, shared scene
  and optical state, exact local shutter schedule and synchronous evaluator;
- optional `processing`: the existing processed-RAW policy, with
  `reconstruction.rawFrame` omitted. The plan supplies its executed RAW frame.

The declaration cannot be combined with `processedOutput` or an independently
declared `physicalSceneSample`. These are separate supported input routes,
not interchangeable evidence of upstream execution.

The immutable snapshot must match capture/event identity, scene state/time,
seed, aperture/shutter/ISO, resolved WB identity/gains and release focus. The
prepared context additionally binds provider scene/profile, the complete
optical bridge profile and selected physical focal length. Native raster,
imaging area, orientation and the opening/closing schedule must match the
temporal snapshot. This producer executes a full-native shutter schedule: an
explicit temporal active rectangle must cover the full native raster. Cropped
timing cannot be silently substituted for it; output/physical capture geometry
keeps its separate downstream meaning. Motion and sample count must match
its rotation declaration; omitted rotation authorizes only zero angular motion.
Readout diagnostics remain independent of exposure timing.

Requested stages are expanded from `getImageFormationContract()`. Renderer
stage support, wavelength-resolved capability, sensor-domain support, inverse
mapping, temporal sample budget and existing effect constraints must pass
before provider code is invoked. The ADC stage must be requested, directly or
through downstream dependencies. Known output crop/resampling incompatibilities
also fail before provider calls, using the same envelope check as attached-RAW
processing. Pixel-dependent reconstruction/correction checks still run on the
actual realized RAW; preflight is not a proof of complete output readiness.

The provider receives owned frozen requests at each wavelength/local-time/PSF
support node. Execution snapshots all capture data and optional output policy
before invoking provider code. Callback mutation of the original caller objects
cannot change execution or its post-capture policy. No function, file IO,
network request, renderer installation or runtime dependency enters the plan's
serialized representation.

## Execution and consumers

The existing environment producer generates focus-aware inverse rays, invokes
the supplied provider, evaluates optical throughput and optional local sampled
PSF support, then applies the existing optical-stack/spatial/spectral response
and temporal EQE integration. Existing dark-current, charge-completeness,
capacity, seeded noise, signed readout and ADC APIs create native CFA codes.
There is no alternate RAW producer, RGB-to-RAW conversion or new seed schedule.

With complete declarations and a valid processing policy, all fourteen graph
stages have executed bounded consumers. An explicitly omitted PSF is recorded
as `modeled-zero` for the declared point-optics model, with its supplied evidence
and limitation; it is not a physical assertion of zero lens blur. Unrequested
stages remain omitted by fidelity. A failed source preflight leaves requested
stages blocked rather than advertising execution.

`environmentCaptureResult` retains the full executed lineage and child results.
`environmentCaptureRequestFingerprint` commits the capture data, excluding
callback identity. The plan fingerprint includes that commitment, returned
provider values, realized RAW and optional processing result. Replay requires
the same inputs **and** provider responses. Different source results, even from
the same callback, change plan identity. These FNV keys are not cryptographic
integrity or provenance certificates.

Optional processing reuses `calculateProcessedSensorRaw()` on the exact returned
frame: reconstruction, channel-basis color/WB once, selected native correction,
physical orientation, digital crop and SDR rendering retain their existing
order. Rendering changes do not rewrite physical capture, charge/noise or RAW.
The resulting source frame can also feed the existing paired DNG/JPEG exporter;
the plan itself performs no file serialization.

`createProductionPlanConsumerManifest()` carries the same capture/output result
references for interactive and reference consumers. Neither consumer may change
seed, committed inputs, sample count or stage order. Existing manifests without
the new optional execution fields retain their old data shape apart from the
explicit manifest/plan versions.

## Scientific envelope and remaining ownership

This route preserves the existing adapter's limits: at most 4,096 native sites
and 100,000 aggregate provider evaluations; one-to-one native CFA timing;
opening-reference scene time zero; ideal focus-aware environment projection;
constant-axis rotation; explicit unity field throughput; and optional
destination-local sampled PSF. Continuous spectral density, source-plane and
response-area bindings are mandatory. The output reference route keeps its
explicit topology, reconstruction support and 1:1 output-crop constraints.

Execution is approximation-only. Supplied provider invocation does not verify
physical transport, visibility, world pose/translation, calibration, convergence
or global field-energy conservation. Child `providerTransportVerified`,
`upstreamRadiometryVerified`, `producerOriginVerified` and standalone
`productionPlanActivated` fields retain their original conservative meanings.
The parent plan records what actually executed; it never upgrades those flags.
Child evidence/limitations remain inspectable, and combined uncertainty remains
unquantified rather than inferred from a count of successful stages.

Required unsupported effects or combinations still block. No wider scientific
capability, supported megapixel limit or V1 deferral is approved by this route.
The [32-item composition map](V1_COMPOSITION_MAP.md) retains the specific
foundation/consumer/acceptance owners. Broader same-scene equipment-tier
acceptance is #116/#119, final performance remeasurement is #43/#45, final
science conformance is #131, and the exhaustive release documentation/source
audit is #180. #165 C2PA remains post-V1.

## Migration and verification

Consumers of serialized plans must recognize plan 0.7.0 and consumer manifest
0.2.0. New fields are optional; existing attached-RAW and sample-only callers
need no input migration. The current root API retains the additive
`ProductionEnvironmentCaptureInput` type. The standalone environment producer
and processed-output model versions, hashes and seed schedule are unchanged.

`test/production-image-formation-plan.test.ts` covers complete graph execution,
global/rolling shutter, sampled/omitted PSF, source-response replay, caller
mutation, rejected context/event/profile/renderer bindings before callbacks,
all four physical orientations with an output crop, incompatible resampling,
resolved WB and selected correction with exact native RAW preservation.
Existing SI-count, phase/support, noise/ADC, file-byte and correction suites
remain the independent domain oracles.
