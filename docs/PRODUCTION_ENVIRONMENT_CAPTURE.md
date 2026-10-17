# Executed environment production capture

> **Release context.** This page was written for package 1.2.0 (root API 1.2.0) and has not been re-reviewed for later releases. The [changelog](../CHANGELOG.md) describes the current release. Model and subsystem version numbers on this page, and any dated records, are separate from the package version. See also the [developer guide](DEVELOPERS.md) and the [1.2.0 release contract](RELEASE_1_2_0.md).

This route lets a production plan actually run a capture, from the light source to RAW codes, inside the existing authoritative image-formation graph. It was introduced at root API 0.116.0 and production plan 0.7.0.

- Consumer manifest 0.2.0 exposes the same immutable executed capture and processed-output results.
- At introduction, package 0.6.0, POC 0.20.0, capture snapshot 0.3.0 and the image-formation ordering contract 0.4.0 did not change.

## Inputs and ownership

`createProductionImageFormationPlan()` accepts `environmentCapture` with:

- `capture`: the existing `SimulateEnvironmentSensorRawFrameInput`. It includes a complete native frame, owned sensor and readout profiles for each site, shared scene and optical state, the exact local shutter schedule, and a synchronous evaluator.
- optional `processing`: the existing processed-RAW policy, with `reconstruction.rawFrame` left out. The plan supplies the RAW frame it executed.

This declaration cannot be combined with `processedOutput`, or with an independently declared `physicalSceneSample`. These are separate supported input routes; one is not evidence that another's upstream work ran.

**Bindings that must match.**

- The immutable snapshot must match: capture and event identity, scene state and time, seed, aperture, shutter and ISO, resolved white-balance (WB) identity and gains, and release focus.
- The prepared context also binds: the provider's scene and profile, the complete optical bridge profile, and the selected physical focal length.
- Native raster, imaging area, orientation, and the opening and closing schedule must match the temporal snapshot.

**Full-native timing.** This producer runs a shutter schedule over the full native sensor. An explicit temporal active rectangle must cover the whole native raster. Cropped timing cannot be quietly used instead. Output and physical capture geometry keep their own separate downstream meaning.

**Motion.** Motion and sample count must match the rotation declaration. If rotation is omitted, only zero angular motion is allowed. Readout diagnostics stay independent of exposure timing.

**Checks before any provider call.** Requested stages are expanded from `getImageFormationContract()`. All of these must pass before provider code runs:

- renderer stage support;
- wavelength-resolved capability;
- sensor-domain support;
- inverse mapping;
- the temporal sample budget;
- existing effect constraints;
- the ADC stage must be requested, directly or through a downstream dependency;
- known output crop and resampling incompatibilities, using the same check as attached-RAW processing.

Checks that depend on pixels (reconstruction and correction) still run on the RAW actually produced. Passing the up-front checks does not prove the output will be complete.

**Provider isolation.**

- The provider receives owned, frozen requests at each wavelength, local time and PSF support node.
- All capture data, and the optional output policy, are copied before any provider code runs. So a callback that changes the caller's original objects cannot change the execution or the post-capture policy.
- No function, file IO, network request, renderer installation or runtime dependency enters the plan's serialised form.

## Execution and consumers

**What runs.** The existing environment producer:

1. generates focus-aware inverse rays;
2. calls the supplied provider;
3. evaluates optical throughput, and optional local sampled-PSF support;
4. applies the existing optical-stack, spatial and spectral response, and temporal EQE (external quantum efficiency) integration.

Then the existing dark-current, charge-completeness, capacity, seeded noise, signed readout and ADC APIs create native CFA (colour filter array) codes. There is no alternative RAW producer, no RGB-to-RAW conversion and no new seed schedule.

**Stages.** With complete declarations and a valid processing policy, all fourteen graph stages run, each with a bounded consumer.

- An explicitly omitted PSF is recorded as `modeled-zero` for the declared point-optics model, with its evidence and limitation. It is not a physical claim that the lens has zero blur.
- Stages that were not requested are omitted by fidelity.
- If the source checks fail up front, requested stages stay blocked, rather than being reported as executed.

**Identity and replay.**

- `environmentCaptureResult` keeps the full executed lineage and the child results.
- `environmentCaptureRequestFingerprint` commits the capture data, excluding the callback's identity.
- The plan fingerprint includes that commitment, the values the provider returned, the realised RAW and the optional processing result.
- Replaying needs the same inputs **and** the same provider responses. Different source results, even from the same callback, change the plan identity.
- These FNV keys are not cryptographic integrity or provenance certificates.

**Optional processing.** Processing reuses `calculateProcessedSensorRaw()` on the exact returned frame. The existing order is kept: reconstruction, channel-basis colour and WB (once), selected native correction, physical orientation, digital crop and SDR rendering. Rendering changes never rewrite the physical capture, charge, noise or RAW. The resulting source frame can also feed the existing paired DNG/JPEG exporter; the plan itself writes no files.

**Consumers.** `createProductionPlanConsumerManifest()` carries the same capture and output result references for interactive and reference consumers. Neither consumer may change the seed, committed inputs, sample count or stage order. Existing manifests without the new optional execution fields keep their old data shape, apart from the explicit manifest and plan versions.

## Scientific envelope and remaining ownership

**Limits.** This route keeps the existing adapter's limits:

- at most 4,096 native sites;
- at most 100,000 provider evaluations in total;
- one-to-one native CFA timing;
- scene time zero at the opening reference;
- ideal focus-aware environment projection;
- rotation about a constant axis;
- explicit unity field throughput;
- optional destination-local sampled PSF.

Continuous spectral density, and source-plane and response-area bindings, are required. The output reference route keeps its explicit topology, reconstruction support and 1:1 output-crop constraints.

**Approximation only.** Calling the supplied provider does not verify physical transport, visibility, world pose or translation, calibration, convergence, or overall field-energy conservation.

- Child flags `providerTransportVerified`, `upstreamRadiometryVerified`, `producerOriginVerified` and the standalone `productionPlanActivated` keep their original conservative meanings.
- The parent plan records what actually ran; it never upgrades those flags.
- Child evidence and limitations stay available to inspect.
- Combined uncertainty stays unquantified. It is never inferred from how many stages succeeded.

**Still blocked.** Required effects or combinations that are unsupported still block. This route does not approve any wider scientific capability, supported megapixel limit or V1 deferral.

**Where other work lives.**

- The [32-item composition map](V1_COMPOSITION_MAP.md) keeps the owners of each foundation, consumer and acceptance item.
- Broader same-scene acceptance of equipment tiers: issues #116 and #119.
- Final performance remeasurement: #43 and #45.
- Final science conformance: #131.
- The exhaustive release documentation and source audit: #180.
- C2PA (#165) stays after V1.

## Migration and verification

**Migration.**

- Consumers of serialised plans must recognise plan 0.7.0 and consumer manifest 0.2.0.
- The new fields are optional. Existing attached-RAW and sample-only callers need no input changes.
- The current root API keeps the additional `ProductionEnvironmentCaptureInput` type.
- The standalone environment producer and processed-output model versions, hashes and seed schedule are unchanged.

**Tests.** `test/production-image-formation-plan.test.ts` covers:

- complete graph execution;
- global and rolling shutter;
- sampled and omitted PSF;
- replay of source responses;
- callers changing their objects;
- rejection of context, event, profile and renderer bindings before any callback;
- all four physical orientations with an output crop;
- incompatible resampling;
- resolved WB, and selected correction, with the native RAW kept exactly.

The existing suites for SI counts, phase and support, noise and ADC, file bytes and correction remain the independent references for each domain.
