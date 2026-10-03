# Processed camera output

Release context: **package 1.1.0 candidate / root API 1.1.0**. Subsystem/model versions and dated introduction or measurement records below are independent historical identities; they are not distribution versions. See [developer navigation](DEVELOPERS.md) and [release contract](RELEASE_1_1_0.md).

Root API 0.115.0 completes the bounded SDR post-capture handoff for #112.
Production plan 0.6.0 adds explicit committed RAW processing. At introduction, package 0.6.0,
POC 0.20.0, capture, RAW, color, correction and SDR schemas remain unchanged.
This is the engine boundary used by preview and file consumers; integrating
commercial UI controls and browser presentation belongs to the apps repository.

## Entry points and domains

| Authoritative input | Entry point | Semantic checks |
| --- | --- | --- |
| Scene-referred XYZ, virtual-camera channels or already transformed linear RGB | `calculateCaptureSdr()` | Exact #15 plane, profile/version, WB application history, channel order, reference white and raster binding |
| Capture-bound linear plane with selected corrections | `calculateCaptureCorrectedSdr()` | Same color/WB checks, exact capture/lens/time/geometry state, compatible correction domains and explicit sampling/support policy |
| Attached post-ADC native RAW | `calculateProcessedSensorRaw()` | Revalidated frame, explicit reconstruction kernels and coverage, registered RGB interpretation, resolved sensor gains, oriented crop and optional native correction |
| RAW plus file metadata/encoder policy | `createPhotographicExportPair()` | Uses `calculateProcessedSensorRaw()` for JPEG pixels; preserves exact native RAW for DNG |
| Committed production snapshot plus RAW policy | `createProductionImageFormationPlan()` | Optional `processedOutput: { outputStateId, processing }` binds attached capture, scene clock, seed, physical exposure, WB and available focus commits |

There is no untyped "linear RGB" input or screenshot/canvas source. A caller
with capture-linear data uses its declared #15 state. A RAW preview and paired
JPEG use the same explicit `ProcessedSensorRawInput`: reconstruction,
`ExportSensorColorProfile`, white-balance policy, `SdrRenderingProfile` and
optional correction. Metadata and JPEG quantization are separate file choices.
The returned arrays are high fidelity values before lossy JPEG packing, so a
JPEG decoder is not expected to reproduce them bit for bit.

The RAW result records input/output domains, color profile/evidence, WB policy
and disposition, child reconstruction/rendering/correction envelopes, native
DNG crop and processed output view. It owns copies of input values. Standalone
results are ordinary owned values; a production plan deep-freezes its copy.
Physical capture and actual display adaptation are explicitly unchanged.

## Ordered processing

RAW processing delegates to existing implementations:

1. Reconstruct exact attached native post-ADC codes; preserve signed normalized
   shadows and per-site capture/readout diagnostics.
2. Apply the explicit approximate sensor-channel interpretation and resolved
   sensor WB gains once; develop XYZ/linear sRGB/D65.
3. Without correction, map the committed orientation and 1:1 output crop. With
   correction, build the oriented full-active linear RGB view, then delegate
   native optical correction, joint-valid retained view and orientation to the
   capture correction executor.
4. Apply rendering exposure, declared tone curve, explicit component gamut
   handling, sRGB transfer encoding and quantization through the SDR renderer.
5. Return output-referred encoding to the consumer. File packing and platform
   display/view adaptation remain distinct downstream operations.

The current correction executor supports its explicitly compatible RGB
geometry/CA mapping followed by linear gain. It rejects unsupported domains or
orders; it does not silently coerce reconstruction-adjacent channel correction
into post-color RGB. Existing #118 mapping/resampling diagnostics retain crop,
local Jacobian/stretch, support mask, interpolation/filter identity, gain/noise
costs, residual assumptions and clipping. RAW correction intent is informational;
DNG sensor codes are unchanged. Native prefiltering cannot be declared without
an implemented source prefilter.

Rendering controls never change aperture, shutter, ISO, focus, geometry,
photo/dark charge, noise realization, physical saturation or RAW codes. Metering
remains upstream: this API has no meter input, exposure resolver or feedback
path. Consumers must identify whether histograms/zebras analyze capture data or
these output-referred samples.

## Encoding, clipping and future modes

The existing SDR profile fully declares deterministic exposure EV, identity or
positive per-channel Reinhard tone curve, clipping or rejection of out-of-range
components, sRGB transfer, 8/16-bit nearest-ties-up quantization and no dither.
Output explicitly records sRGB primaries, D65 and 80 cd/m² reference white.
Component clipping is range handling, not a perceptual wide-gamut transform.
See [SDR rendering](SDR_RENDERING.md) for equations and limitations.

RAW preview supports both SDR bit depths. Baseline JPEG requires 8 bits and
rejects a 16-bit profile; it never silently reduces the requested bit depth.
Full-well/ADC flags stay in RAW samples, correction-gain clipping stays in the
correction envelope, and rendering/tone/gamut counts stay in SDR diagnostics.
Actual display saturation is unknown because display adaptation is external.

HDR/PQ/HLG profiles fail validation. Future HDR encoding needs a separately
versioned transfer/primaries/reference/mastering contract and explicit display
semantics. Source float headroom does not become an HDR output declaration.
Picture styles, restoration, sharpening and denoise remain future rendering
choices, separately identified from sensor/optical quality.

## Production plan and compatibility

With a valid attached RAW policy and declared renderer support, the existing
contract graph activates four executed downstream stages: `reconstruction`,
`physical-orientation-transform`, `output-crop-resample`, `display-processing`.
Each records model `processed-sensor-raw-sdr` 0.1.0 and attached frame identity.
The plan retains the complete processed result, profile identity, requested
output domain and approximate scientific status in its fingerprint. Scientific
assurance includes the approximate processing component and unpropagated
uncertainty, retaining color evidence and child results.

Missing or mismatched processing records `processed-output-evaluation-blocked`;
renderer stage declarations still gate each active stage. A request without an
attachment preserves prior unsupported downstream behavior. Existing inputs
remain valid; plan version and resulting fingerprints intentionally change.
Serialized consumers must understand plan 0.6.0 and its optional result field.

`outputStateId` explicitly binds numerical attached crop/raster policy to the
snapshot's committed output identity; it is a caller assertion, not an invented
geometry lookup. The RAW frame remains independently attached authoritative
capture data. Matching IDs do not prove its upstream source transport. PSF,
sensor-stack, photosite, charge, read-noise and ADC composition are still
separate upstream work: their missing-stage blockers remain. An executed
post-capture boundary does not make the whole production plan ready.

## Bounded operating envelope

Existing reconstruction permits at most 4,096 native sites, registered dense
reference kernels, and complete required support. RAW output crop remains 1:1;
source reconstruction must cover it, or the whole active region for correction.
The color interpretation is explicit RGB-channel approximation, not sensor
calibration. General resizing, streaming/native camera resolution, arbitrary CFA
color models and external-editor qualification remain #16/#178 requirements.
This boundary introduces no renderer/provider, file IO or network dependency.

## Acceptance evidence

| #112 requirement | Regression evidence |
| --- | --- |
| Tone/render EV cannot alter capture/noise/settings | `processed-sensor-raw.test.ts`, `raw-output-conformance.test.ts` |
| WB applied once; preserved RAW intent; upstream balanced state | `capture-sdr.test.ts`, `photographic-export-correction.test.ts` |
| Explicit image-state identity; reject unresolved/wrong domain | `capture-sdr.test.ts`, `sdr-rendering.test.ts`, `processed-sensor-raw.test.ts` |
| Separate tone/gamut/transfer/quantization; deterministic SDR | `sdr-rendering.test.ts`, `processed-sensor-raw.test.ts` |
| Primaries/reference white and explicit out-of-range policy | `sdr-rendering.test.ts`, `processed-sensor-raw.test.ts` |
| RAW/correction/output clipping remain distinct | `raw-output-conformance.test.ts`, `capture-corrected-sdr.test.ts`, `processed-sensor-raw.test.ts` |
| Metering remains pre-display | No processing API calls the upstream meter; `metering-equipment-integration.test.ts` preserves its separate domain |
| Same rendering intent for preview/JPEG without screenshots | `processed-sensor-raw.test.ts`, four-orientation/WB checks in `photographic-export-correction.test.ts` |
| HDR remains distinct; no implicit SDR reinterpretation | Profile rejection tests in `sdr-rendering.test.ts`, `processed-sensor-raw.test.ts` |
| Correction domains/support/costs and immutable plan binding | `capture-corrected-sdr.test.ts`, `production-image-formation-plan.test.ts` |

RAW/linear fixtures use the #130 canonical camera/seed through documented tiny
owned derived variants; test pixels and ideal color profiles are synthetic,
not measured/calibrated scene truth. Acceptance demonstrates the declared bounded
post-capture foundation, not Adobe compatibility or complete physical rendering.

This contribution independently composes existing Photivra APIs; it introduces
no new scientific equation, third-party code/data, look assets or dependency.
AI-assisted draft requires substantive owner review and contribution-specific
DCO certification before merge. External editor/high-resolution acceptance and
upstream physical activation retain their existing issue owners.

## Executed upstream production handoff

Plan 0.7.0 additionally supports `environmentCapture.processing`. Its
reconstruction policy omits `rawFrame`: the plan supplies only the exact RAW
returned by its executed source-to-ADC pipeline. This route cannot be combined
with `processedOutput` or an independent physical scene sample. Existing
attached-RAW plan inputs and their conservative origin limitations remain valid.
See [production environment capture](PRODUCTION_ENVIRONMENT_CAPTURE.md) for
binding, replay, stage activation and migration details.
