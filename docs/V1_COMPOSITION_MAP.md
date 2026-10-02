# OpenSource V1 composition and consumer map

Source review baseline: main `99db04fa980cc35577ebb8c556f58182d0f69822`,
2026-10-01. Scope/status comes from [V1 #129](https://github.com/Photivra/photivra/issues/129).
This map addresses [defect #178](https://github.com/Photivra/photivra/issues/178)
findings 1 and 2. It records implemented consumers and missing handoffs; it does
not activate a production stage, close a feature ticket or approve a deferral.

The tracker has 25 closed and seven open feature/science items. A closed
foundation ticket establishes its approved primitive scope, not automatic
availability in every production composition. Test links below are representative
regression evidence for the named consumer; a unit/adapter test is not a claim
of complete scene-to-file integration.

## All 32 scoped items

Source paths identify the main primitive/boundary, not every helper in that
feature. The consumer column distinguishes direct foundations, production-plan
results and bounded capture/output adapters. Existing tickets retain ownership
of missing composition; no competing RAW writer or second scientific graph is
needed.

| Ticket / feature | Tracker | Primitive or boundary | Current entry point / consumer | Representative evidence | Required handoff / owner |
| --- | --- | --- | --- | --- | --- |
| [#1](https://github.com/Photivra/photivra/issues/1) Non-circular diffraction | closed | [polygon-diffraction.ts](../src/optics/polygon-diffraction.ts) | Direct polygon PSF; production PSF execution absent | [polygon-diffraction.test.ts](../test/polygon-diffraction.test.ts) | #16/#178: compose declared pupil support without double diffraction |
| [#3](https://github.com/Photivra/photivra/issues/3) Extended-object motion | closed | [extended-object-projection.ts](../src/motion/extended-object-projection.ts) | Direct temporal projection; production radiance accumulation absent | [extended-object-projection.test.ts](../test/extended-object-projection.test.ts) | #16/#178: retain depth/visibility/time at requested nodes |
| [#7](https://github.com/Photivra/photivra/issues/7) ISO and signal chain | closed | [iso-signal-chain.ts](../src/sensor/iso-signal-chain.ts) | Explicit regime bindings; RAW producer consumes readout profiles | [generic-tier-output-acceptance.test.ts](../test/generic-tier-output-acceptance.test.ts) | #16: bind committed ISO to explicit regime; preserve physical charge |
| [#12](https://github.com/Photivra/photivra/issues/12) Readout and shutter | closed | [exposure-window.ts](../src/sensor/exposure-window.ts) | Production temporal diagnostics; RAW local-window handoff | [sensor-raw-local-exposure.test.ts](../test/sensor-raw-local-exposure.test.ts) | #16: integrate scene signal over those windows; no inferred synchronization |
| [#14](https://github.com/Photivra/photivra/issues/14) Sensor pipeline | closed | [eqe-electron-rate.ts](../src/sensor/eqe-electron-rate.ts) | Bounded irradiance→EQE local exposure composition; charge-to-RAW adapter | [sensor-raw-pipeline.test.ts](../test/sensor-raw-pipeline.test.ts) | #16/#178: bind committed scene/optics/PSF origin to physical irradiance nodes |
| [#15](https://github.com/Photivra/photivra/issues/15) Linear capture and color | closed | [simulated-capture.ts](../src/capture/simulated-capture.ts) | Immutable capture; ideal XYZ color and linear encoding; sensor adapter distinct | [capture-color.test.ts](../test/capture-color.test.ts) | #112/#16: bind physical capture origin; preserve color-channel basis |
| [#16](https://github.com/Photivra/photivra/issues/16) Paired RAW DNG/JPEG | open | [photographic-export.ts](../src/capture/photographic-export.ts) | Exact attached-RAW reconstruction → development → correction/SDR → files | [raw-output-conformance.test.ts](../test/raw-output-conformance.test.ts) | Authoritative upstream origin, production activation, editor/resolution acceptance |
| [#43](https://github.com/Photivra/photivra/issues/43) Prepared/batch performance | open | [geometric-transforms.ts](../src/output/geometric-transforms.ts) | Call-owned prepared geometric mapping reused by sampling execution | [geometric-preparation-reuse.test.ts](../test/geometric-preparation-reuse.test.ts) | Relevant remeasurement after V1 processing stabilizes; do not invent a cache |
| [#45](https://github.com/Photivra/photivra/issues/45) POC projection reuse | open | [poc-simulation.ts](../src/simulation/poc-simulation.ts) | Private prepared projection in legacy POC defocus sweeps | [poc-projection-reuse.test.ts](../test/poc-projection-reuse.test.ts) | Relevant final remeasurement; POC remains a separate compatibility surface |
| [#95](https://github.com/Photivra/photivra/issues/95) Stable support | closed | [camera-shake.ts](../src/stabilization/camera-shake.ts) | Direct ideal stable-support boundary, independent of correction | [camera-shake.test.ts](../test/camera-shake.test.ts) | #16/#178: requested shake/stabilization must preserve physical ownership |
| [#97](https://github.com/Photivra/photivra/issues/97) IBIS/OIS | closed | [system.ts](../src/stabilization/system.ts) | Explicit disturbance/trajectory temporal sampling | [stabilization-system.test.ts](../test/stabilization-system.test.ts) | #16/#178: consume selected trajectory in physical sampling, not a blur-quality scalar |
| [#98](https://github.com/Photivra/photivra/issues/98) Sensor architecture | closed | [architecture.ts](../src/sensor/architecture.ts) | Declared technology metadata and related standalone profile boundaries | [sensor-architecture.test.ts](../test/sensor-architecture.test.ts) | #16: preserve selected architecture/bindings; metadata alone is not signal execution |
| [#100](https://github.com/Photivra/photivra/issues/100) Metering | closed | [metering.ts](../src/exposure/metering.ts) | Relative pre-exposure meter → exposure target/equipment resolver | [metering-equipment-integration.test.ts](../test/metering-equipment-integration.test.ts) | #16/#112: retain pre-display signal and do not infer calibrated spectral weighting |
| [#103](https://github.com/Photivra/photivra/issues/103) Finite/infinity focus | closed | [focus-state.ts](../src/optics/focus-state.ts) | Explicit focus state consumed by optics and committed capture | [focus-state.test.ts](../test/focus-state.test.ts) | #16/#178: preserve focus in field/depth/PSF evaluations |
| [#104](https://github.com/Photivra/photivra/issues/104) Focus control | closed | [focus-control.ts](../src/capture/focus-control.ts) | MF/AF state and release gate; tier body acceptance | [generic-tier-body-acceptance.test.ts](../test/generic-tier-body-acceptance.test.ts) | #16: carry committed focus; no undocumented tracking renderer |
| [#105](https://github.com/Photivra/photivra/issues/105) Release sequencing | closed | [release-sequence.ts](../src/capture/release-sequence.ts) | Release frame → production snapshot binding; deterministic ownership | [production-capture-release-binding.test.ts](../test/production-capture-release-binding.test.ts) | #16: carry frame timing/settings/seed to physical execution |
| [#106](https://github.com/Photivra/photivra/issues/106) Manual flash/sync | closed | [flash.ts](../src/exposure/flash.ts) | Declared sync and illumination overlay; no full production radiance integration | [flash.test.ts](../test/flash.test.ts) | #16/#178: apply physical-time light transport when selected; no exposure-duration shortcut |
| [#108](https://github.com/Photivra/photivra/issues/108) WB/custom/AWB | closed | [white-balance.ts](../src/color/white-balance.ts) | Resolved WB → release/production binding; RAW intent and one-time sensor development | [photographic-export.test.ts](../test/photographic-export.test.ts) | #112/#16: preserve matching basis; never re-estimate from rendered output |
| [#111](https://github.com/Photivra/photivra/issues/111) Production plan | closed | [image-formation-plan.ts](../src/composition/image-formation-plan.ts) | Authoritative graph expansion; physical sample/temporal results and blockers | [production-image-formation-plan.test.ts](../test/production-image-formation-plan.test.ts) | #178/#16/#112: intentionally add downstream stages with contract/version review |
| [#112](https://github.com/Photivra/photivra/issues/112) Processed camera output | open | [capture-corrected-sdr.ts](../src/output/capture-corrected-sdr.ts) | Capture-bound color/correction → oriented view/SDR; paired RAW consumer | [photographic-export-correction.test.ts](../test/photographic-export-correction.test.ts) | Complete production handoff/activation; preserve declared SDR semantics and HDR future seam |
| [#113](https://github.com/Photivra/photivra/issues/113) Lens PSF/bokeh | closed | [lens-psf-profile.ts](../src/optics/lens-psf-profile.ts) | Declared sampled PSF/MTF; separate complex-pupil model | [lens-psf-framework.test.ts](../test/lens-psf-framework.test.ts) | #16/#178: wavelength/field/depth sampling and finite support; MTF-only is not renderable PSF |
| [#114](https://github.com/Photivra/photivra/issues/114) Stray light | closed | [stray-light.ts](../src/optics/stray-light.ts) | Separate declared ghost/veiling irradiance foundation | [stray-light.test.ts](../test/stray-light.test.ts) | #16/#178: add only explicitly selected incremental light; never fold into primary PSF |
| [#116](https://github.com/Photivra/photivra/issues/116) Generic tiers | open | [generic-tier-presets.ts](../src/equipment/generic-tier-presets.ts) | Exact-version selection; body and lens profile resolution | [generic-tier-presets.test.ts](../test/generic-tier-presets.test.ts) | Broader coherent scene/PSF/body/output acceptance; no calibrated tier ranking |
| [#117](https://github.com/Photivra/photivra/issues/117) Lens corrections | closed | [lens-corrections.ts](../src/output/lens-corrections.ts) | Capture-bound selected correction; RAW informational intent/JPEG processing | [generic-tier-correction-acceptance.test.ts](../test/generic-tier-correction-acceptance.test.ts) | #112/#16: connect authoritative upstream capture while preserving residual/crop/noise costs |
| [#118](https://github.com/Photivra/photivra/issues/118) Composed geometry/resampling | closed | [geometric-transforms.ts](../src/output/geometric-transforms.ts) | Domain-compatible joint mapping/sampling → bounded correction executor | [geometric-transforms.test.ts](../test/geometric-transforms.test.ts) | #112/#16: preserve full Jacobian/filter/support and existing domain order |
| [#119](https://github.com/Photivra/photivra/issues/119) Tier acceptance | open | [generic-tier-assets.ts](../src/equipment/generic-tier-assets.ts) | Matched synthetic body/correction/readout-to-file fixture consumers | [generic-tier-output-acceptance.test.ts](../test/generic-tier-output-acceptance.test.ts) | Physical scene/PSF acceptance and applicable final output evidence with same scenario |
| [#130](https://github.com/Photivra/photivra/issues/130) Canonical fixture | closed | [basic-reference-fixture.ts](../test/helpers/basic-reference-fixture.ts) | Shared deterministic laboratory and minimal declared variants | [basic-reference-scene.test.ts](../test/basic-reference-scene.test.ts) | #131: reuse without treating tiny/synthetic raster as performance or calibration evidence |
| [#131](https://github.com/Photivra/photivra/issues/131) Final conformance | open | [raw-output-conformance.test.ts](../test/raw-output-conformance.test.ts) | Incremental geometry/signal/capture-output suites; final gate remains open | [cross-stage-conformance.test.ts](../test/cross-stage-conformance.test.ts) | Final integrated path, tier and performance dispositions; last feature/science ticket |
| [#132](https://github.com/Photivra/photivra/issues/132) Numerics/units | closed | [validation.ts](../src/core/validation.ts) | Typed input/result guards plus shared units/finite conventions | [numerical-correctness-contract.test.ts](../test/numerical-correctness-contract.test.ts) | Apply throughout new composition; existing guards do not establish physical validity |
| [#133](https://github.com/Photivra/photivra/issues/133) API conventions | closed | [API_STYLE.md](../docs/API_STYLE.md) | Root public naming/compatibility/version policy | [api-style-compatibility.test.ts](../test/api-style-compatibility.test.ts) | Review new public handoffs and relevant independent versions before activation |
| [#134](https://github.com/Photivra/photivra/issues/134) Evidence/uncertainty | closed | [scientific-assurance.ts](../src/core/scientific-assurance.ts) | Production assurance composition retains weakest required status and unpropagated uncertainty | [scientific-assurance.test.ts](../test/scientific-assurance.test.ts) | #16/#112: preserve child evidence/status; no invented combined uncertainty |
| [#135](https://github.com/Photivra/photivra/issues/135) Front filters | closed | [front-of-lens-filter.ts](../src/optics/front-of-lens-filter.ts) | Capture snapshot → #110 throughput exactly once | [front-of-lens-filter.test.ts](../test/front-of-lens-filter.test.ts) | #16/#178: distinguish lens/filter/sensor response scope to avoid double transmission |

## Actual production-plan boundary

[`getImageFormationContract()`](../src/core/image-formation.ts) owns required
upstream dependencies and coupling. The production composer must expand that
graph, not invent a parallel renderer/app ordering. The present
[`COMPOSER_SUPPORTED_STAGES`](../src/composition/image-formation-plan.ts) contains
exactly these four stages:

| Stage | Implemented plan behavior | Remaining distinction |
| --- | --- | --- |
| `scene-ray-projection` | Projection/geometry ownership in the semantic plan | Does not execute a renderer or a full irradiance field |
| `scene-radiance-evaluation` | Validates the bound physical scene sample request/result | Provider declaration/result identity is not proof of measured source truth |
| `lens-field-pupil-evaluation` | Reuses #110 for the declared physical sample, including selected filters/field throughput | Pre-sensor-stack irradiance sample is not a full PSF-convolved sensor exposure |
| `temporal-exposure-readout` | Exposure-window/readout diagnostics and optional pure-rotation quadrature | PSF dependency can still block the whole plan; useful timing is not completed temporal radiance integration |

Requested `field-wavelength-psf`, `sensor-optical-stack`,
`photosite-cfa-sampling`, `sensor-charge-statistics`, `read-noise-conversion`,
`adc-quantization`, `reconstruction`, `physical-orientation-transform`,
`output-crop-resample` and `display-processing` remain uncomposed by this planner.
They report `engine-stage-not-composed` rather than becoming active because a
standalone function exists. Omitted-by-fidelity and explicitly modeled-zero
states keep their current separate meanings.

[`createProductionPlanConsumerManifest()`](../src/composition/image-formation-plan.ts)
projects the same committed plan into interactive/reference roles. It does not
execute these absent stages or authorize changing inputs, samples or seeds.

## Existing RAW and output execution to retain

[`simulateSensorRawFrame()`](../src/capture/sensor-raw-producer.ts) already owns
charge completeness/capacity → seeded charge/noise → ADC → native CFA attachment.
It consumes declared per-site EQE photo and dark exposure results, including the
optional engine timing binding. `upstreamRadiometryVerified` remains false.

[`resolveRawFrameReconstruction()`](../src/capture/raw-frame-reconstruction.ts)
uses only attached RAW codes and explicit phase kernels. Its
`producerOriginVerified` remains false: structural attachment validation cannot
prove a caller's execution history. Independent captured float planes are never
an alternative source of the paired JPEG.

[`createPhotographicExportPair()`](../src/capture/photographic-export.ts) already
connects that reconstruction to the internal sensor-color adapter, one-time WB,
optional capture-bound native correction, oriented output and SDR/JPEG. The DNG
preserves exact native codes; correction intent does not rewrite RAW. These
adapters are reusable execution, but do not activate the corresponding reserved
production-plan stages.

[`raw-output-conformance.test.ts`](../test/raw-output-conformance.test.ts),
[`sensor-raw-producer.test.ts`](../test/sensor-raw-producer.test.ts) and tier output
acceptance establish this bounded path. They supply synthetic upstream exposure
expectations. They are not a scene/spectral-response-to-exposure origin test.
See [RAW frame envelope](RAW_FRAME_ENVELOPE.md): 4,096 full native sites remain
the reference execution limit, independently of the larger attachment budget.

## Implemented bounded sensor handoff

[`calculateSensorEqeLocalExposure()`](../src/sensor/eqe-local-exposure.ts) now
composes explicit irradiance nodes, response application/range, EQE and stationary
local exposure. [Acceptance](../test/eqe-local-exposure.test.ts) reaches the existing
RAW and paired-file path with owned synthetic fields. See
[SENSOR_EQE_LOCAL_EXPOSURE.md](SENSOR_EQE_LOCAL_EXPOSURE.md). Scene/optics origin
remains declared; nonstationary RAW handoff remains absent; production gates
and the 25/32 tracker count are unchanged.

[`calculateSceneToSensorIrradianceQuadrature()`](../src/optics/scene-to-sensor-quadrature.ts)
now evaluates the existing #85/#110 bridge at each exact pre-AA node, retaining
provider/profile/wavelength/time bindings. [Acceptance](../test/scene-to-sensor-quadrature.test.ts)
reaches package-incident EQE, RAW and paired files with declared synthetic radiance.
See [SCENE_SENSOR_QUADRATURE.md](SCENE_SENSOR_QUADRATURE.md). Target projection,
provider execution, PSF and temporal integration remain unverified/unapplied;
this adapter does not activate production stages.

[`calculateSensorEqeTemporalExposure()`](../src/sensor/eqe-temporal-exposure.ts)
adds bounded nonstationary sensor-rate quadrature with response validity checked
at every local shutter midpoint. [Acceptance](../test/eqe-temporal-exposure.test.ts)
checks SI counts, stationary equivalence, quadratic convergence, rolling offsets
and rejection of an out-of-range bright instant even when its average is valid.
See [SENSOR_EQE_TEMPORAL_EXPOSURE.md](SENSOR_EQE_TEMPORAL_EXPOSURE.md). Source
transport/PSF remain declared. The explicit [temporal photo-signal handoff](TEMPORAL_PHOTO_RAW.md)
now connects independently validated midpoint expectations to dark/charge/RAW and
paired files, with [global/rolling acceptance](../test/temporal-photo-raw.test.ts). No production activation or
umbrella closure is claimed.

[`calculateSceneSensorEqeTemporalExposure()`](../src/sensor/scene-eqe-temporal-exposure.ts)
now composes the declared scene/optical bridge at each local shutter midpoint
with the existing temporal EQE path. Sensor-owned plans remove caller plan drift;
the explicit package plane and opening-boundary time reference remain enforced.
[Acceptance](../test/scene-eqe-temporal-exposure.test.ts) checks SI counts, rolling
offsets, instantaneous validity and exact RAW/file handoff. See
[SCENE_SENSOR_TEMPORAL_EXPOSURE.md](SCENE_SENSOR_TEMPORAL_EXPOSURE.md).
Provider/projection/PSF execution and production activation remain open; 25/32 is unchanged.

## Remaining upstream handoff into the existing producer

The missing handoff belongs to #16/#178, with processed output and plan
activation coordinated with #112. It should produce the existing per-site
producer inputs through the scientific APIs below, retaining child envelopes;
it must not accept an independently rendered RGB plane and relabel it sensor
signal. The table retains the full origin/production acceptance requirements; the bounded
adapters above implement declared scene/optics nodes and stationary/nonstationary sensor exposure.

| Handoff | Reuse / authoritative owner | Binding and acceptance requirement |
| --- | --- | --- |
| Committed execution request | Production prepared context/capture snapshot and authoritative graph | Exact scene/release/capture/profile/fidelity/time/seed identities; immutable owned state; requested missing capabilities block |
| Per-node pre-sensor irradiance | #85 scene radiance + #110 optical throughput, selected #113 PSF/pupil and temporal contributions | Evaluate every requested field/depth/wavelength/time node with declared geometry/support; no copying one scalar sample across a raster without an explicit uniform-field model |
| Sensor stack and photosite support | `sensor/optical-stack.ts`, `sampling-aperture.ts`, `spatial-sampling-quadrature.ts`, `spectral-quadrature.ts` | Destination CFA channel stays fixed across spatial nodes; area and response scope are explicit; AA redistributes support without silently applying response twice |
| Spatial/spectral reduction | `reduceSensorSpatioSpectralIrradiance()` | Exactly identified Cartesian-product node values in W/m²/nm, declared wavelength basis/measure and geometric aperture area; coverage alone is not detector validity |
| Validity and EQE rate | `assessSensorResponseApplicationCompatibility()`, `assessSensorResponseOperatingRange()`, `calculateSensorEqeElectronRate()` | Match source plane, profile/channel/site/area/reference conditions; preserve per-bin operating validity before rate conversion; an A/W current result cannot be substituted for EQE electrons |
| Local exposure expectation | `bindSensorRateToLocalExposure()` and `integrateStationarySensorRateOverLocalExposure()` | Bind the correct local opening/closing window and establish stationarity separately before using rate × duration; nonstationary light/motion uses the bounded explicit temporal photo-signal handoff |
| Dark and incremental charge | Existing dark-current, accumulated-charge completeness and capacity primitives | Preserve operating temperature/window; dark and other stored charge remain separate; no total-charge/full-well authorization from photo-only expectation |
| RAW realization | Existing `simulateSensorRawFrame()` | Feed engine-computed photo/dark exposure inputs without changing the native per-site seed schedule, noise/readout model or code semantics; retain origin limitations honestly |
| Processed/file consumers | Existing reconstruction, sensor-color, corrected-SDR and paired exporter | Same attached RAW supplies JPEG; basis/WB once, crop/orientation/support and physical-versus-display clipping stay inspectable |

Engine-computed execution lineage must remain distinct from measured source
truth and calibrated response accuracy. A future origin manifest/field requires
its own reviewed contract and replay evidence; never flip the existing false
origin flags merely because a wrapper called several APIs.

The implemented bounded sensor composition uses explicit stationary continuous
spectral inputs and supported single-frame native CFA geometry. Such a slice
must state its assumptions and reject requests outside its implemented envelope;
it cannot close a broader approved V1 acceptance criterion by quietly declaring
flash, motion, unsupported response domains or required resolution work deferred.
Discrete spectral lines retain their separate integrated-measure semantics and
must not be converted to continuous densities merely to fit this path.

## Ordered implementation and final gates

1. #16/#178: implement bounded PSF/field/time/sensor sampling and the typed
   irradiance → response validity → EQE rate → local exposure handoff. Bind node
   identities/provenance and preserve explicit blockers instead of claiming all
   models are integrated.
2. #16/#112/#178: compose those results into the existing RAW/output adapters
   through the authoritative graph. Review relevant plan/capture/root contract
   versions and compatibility when activation or new public fields change.
3. #116/#119: extend matched tier acceptance through that merged physical path,
   preserving same-scene inputs and declared generic-profile limitations.
4. #16: finish applicable high-resolution/memory/performance and independent
   external-editor acceptance. Existing LibRaw reference evidence is useful but
   does not fulfill all editor gates. Do not raise limits without measured work.
5. #43/#45: remeasure relevant completed execution paths; preserve equivalent
   output/identity and record evidence-backed dispositions.
6. #131: final scientific conformance after integration/tier/performance work.
   Require independent unit/arithmetic/ordering oracles, replay, rejected stale
   node/profile/time bindings, response scope/area correctness, RAW preservation
   and physically separate capture/rendering clipping.
7. #180: final documentation/source-comment audit and package 1.0 repository
   preparation after required defects and feature/science gates. The owner tags
   and releases; this map authorizes no publication. #165 remains post-V1.

None of these outstanding requirements is an approved deferral. Existing
issue acceptance and provenance/DCO review requirements remain authoritative.
The private app/Blue Wall fixture is a separate consumer; it must not become the
owner of missing public-engine scientific ordering.
