# Processed camera output

> **Release context.** This page was written for package 1.2.0 (root API 1.2.0) and has not been re-reviewed for later releases. The [changelog](../CHANGELOG.md) describes the current release. Model and subsystem version numbers on this page, and any dated records, are separate from the package version. See also the [developer guide](DEVELOPERS.md) and the [1.2.0 release contract](RELEASE_1_2_0.md).

This page describes the step after capture: turning captured data (a linear image or a RAW) into a finished SDR image for preview or for a file.

Root API 0.115.0 completed this bounded SDR post-capture handoff (issue #112). Production plan 0.6.0 added explicit processing of a committed RAW. At that point, the package (0.6.0), POC (0.20.0), and the capture, RAW, colour, correction and SDR schemas did not change.

This is the engine boundary that preview and file consumers use. Wiring it to commercial UI controls and browser display belongs to downstream applications.

## Entry points and domains

| Authoritative input | Entry point | Semantic checks |
| --- | --- | --- |
| Scene-referred XYZ, virtual-camera channels or already transformed linear RGB | `calculateCaptureSdr()` | Exact #15 plane, profile/version, WB application history, channel order, reference white and raster binding |
| Capture-bound linear plane with selected corrections | `calculateCaptureCorrectedSdr()` | Same color/WB checks, exact capture/lens/time/geometry state, compatible correction domains and explicit sampling/support policy |
| Attached post-ADC native RAW | `calculateProcessedSensorRaw()` | Revalidated frame, explicit reconstruction kernels and coverage, registered RGB interpretation, resolved sensor gains, oriented crop and optional native correction |
| RAW plus file metadata/encoder policy | `createPhotographicExportPair()` | Uses `calculateProcessedSensorRaw()` for JPEG pixels; preserves exact native RAW for DNG |
| Committed production snapshot plus RAW policy | `createProductionImageFormationPlan()` | Optional `processedOutput: { outputStateId, processing }` binds attached capture, scene clock, seed, physical exposure, WB and available focus commits |

(In the table, "#15 plane" means the simulated-capture linear plane described in [Authoritative simulated capture](SIMULATED_CAPTURE.md).)

**No untyped inputs.** There is no untyped "linear RGB" input, and no screenshot or canvas source. A caller with linear capture data uses its declared capture state.

**Preview and JPEG match.** A RAW preview and the paired JPEG use the same explicit `ProcessedSensorRawInput`:

- reconstruction;
- `ExportSensorColorProfile`;
- white-balance (WB) policy;
- `SdrRenderingProfile`;
- optional correction.

Metadata and JPEG quantisation are separate file choices. The returned arrays are full-precision values before lossy JPEG packing, so a JPEG decoder will not reproduce them bit for bit.

**What the result records.** The RAW result records:

- input and output domains;
- colour profile and evidence;
- WB policy and what was done;
- the detailed reconstruction, rendering and correction records;
- the native DNG crop and the processed output view.

It owns copies of its input values. Standalone results are ordinary owned values; a production plan deep-freezes its copy. Physical capture and real display adaptation are explicitly unchanged.

## Ordered processing

RAW processing reuses existing implementations, in this order:

1. Reconstruct the exact attached native codes (after the ADC). Keep signed, normalised shadow values and the per-site capture and readout diagnostics.
2. Apply the explicit, approximate interpretation of sensor channels and the resolved sensor WB gains, once. Develop to XYZ / linear sRGB / D65.
3. Geometry:
   - Without correction: map the committed orientation and the 1:1 output crop.
   - With correction: build the oriented linear RGB view of the full active area. Then hand native optical correction, the jointly valid retained view, and orientation to the capture correction executor.
4. Apply rendering exposure, the declared tone curve, explicit handling of out-of-gamut components, sRGB transfer encoding and quantisation, through the SDR renderer.
5. Return the output-referred encoding to the consumer. File packing, and the platform's display or view adaptation, are separate later steps.

**Correction rules.** The current correction executor supports its compatible RGB geometry and chromatic-aberration (CA) mapping, followed by linear gain.

- It rejects unsupported domains or orders. It does not quietly turn channel correction that belongs next to reconstruction into post-colour RGB correction.
- The existing mapping and resampling diagnostics keep the crop, local Jacobian and stretch, support mask, interpolation and filter identity, gain and noise costs, residual assumptions and clipping.
- RAW correction intent is informational only; DNG sensor codes do not change.
- Native prefiltering cannot be declared unless a source prefilter is actually implemented.

**Rendering never changes the capture.** Rendering controls never change aperture, shutter, ISO, focus, geometry, photo or dark charge, noise realisation, physical saturation or RAW codes.

Metering happens before this step. This API has no meter input, exposure resolver or feedback path. Consumers must say whether their histograms or zebras analyse capture data or these output-referred samples.

## Encoding, clipping and future modes

The existing SDR profile fully declares:

- a deterministic exposure in EV;
- an identity tone curve, or a positive per-channel Reinhard tone curve;
- whether out-of-range components are clipped or rejected;
- sRGB transfer;
- 8- or 16-bit quantisation, rounding to nearest with ties up;
- no dither.

The output explicitly records sRGB primaries, D65 white and an 80 cd/m² reference white. Component clipping is range handling, not a perceptual wide-gamut transform. See [SDR rendering](SDR_RENDERING.md) for equations and limitations.

**Bit depth.** RAW preview supports both SDR bit depths. Baseline JPEG needs 8 bits and rejects a 16-bit profile; it never quietly lowers the requested bit depth.

**Where each kind of clipping is reported.**

- Full-well and ADC flags stay in the RAW samples.
- Clipping from correction gain stays in the correction record.
- Rendering, tone and gamut counts stay in the SDR diagnostics.

Real display saturation is unknown, because display adaptation happens outside the engine.

**HDR.** HDR, PQ and HLG profiles fail validation here. Future HDR encoding needs its own versioned contract for transfer, primaries, reference and mastering, with explicit display meaning. Spare float headroom in the source does not become an HDR output declaration.

Picture styles, restoration, sharpening and denoising are future rendering choices. They will be identified separately from sensor and optical quality.

## Production plan and compatibility

With a valid attached-RAW policy and declared renderer support, the existing contract graph runs four downstream stages:

- `reconstruction`;
- `physical-orientation-transform`;
- `output-crop-resample`;
- `display-processing`.

Each records model `processed-sensor-raw-sdr` 0.1.0 and the attached frame identity. The plan's fingerprint covers the complete processed result, profile identity, requested output domain and approximate scientific status. Scientific assurance includes the approximate processing component and unpropagated uncertainty, and keeps the colour evidence and detailed results.

**Blocking.** Missing or mismatched processing records `processed-output-evaluation-blocked`. Renderer stage declarations still gate each active stage. A request with no attachment keeps the earlier unsupported downstream behaviour. Existing inputs stay valid; the plan version and resulting fingerprints change on purpose. Consumers that read serialised plans must understand plan 0.6.0 and its optional result field.

**Output identity.** `outputStateId` explicitly ties the numeric crop and raster policy of the attachment to the snapshot's committed output identity. It is an assertion by the caller, not a geometry lookup the engine invents.

The RAW frame is still independently attached, authoritative capture data. Matching IDs do not prove how it was produced upstream. Composition of PSF, sensor stack, photosite, charge, read noise and ADC is separate upstream work, and their missing-stage blockers remain. Running the post-capture step does not make the whole production plan ready.

## Bounded operating envelope

- Reconstruction allows at most 4,096 native sites, registered dense reference kernels and complete required support.
- RAW output crop stays 1:1. Source reconstruction must cover it, or cover the whole active region when correction is used.
- The colour interpretation is an explicit RGB-channel approximation, not sensor calibration.
- General resizing, streaming or native camera resolution, arbitrary CFA (colour filter array) colour models, and validation in external editors remain open requirements (issues #16 and #178).
- This step adds no renderer or provider, file IO or network dependency.

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

RAW and linear fixtures use the canonical camera and seed of the shared fixture (issue #130), through small documented derived variants owned by Photivra. Test pixels and ideal colour profiles are synthetic; they are not measured or calibrated scene truth. The acceptance tests demonstrate the declared bounded post-capture foundation, not Adobe compatibility or complete physical rendering.

This work combines existing Photivra APIs. It adds no new scientific equation, third-party code or data, look assets or dependency. As AI-assisted draft material, it needs substantive owner review and DCO certification for the contribution before merge. Acceptance in external editors and at high resolution, and upstream physical activation, keep their existing issue owners.

## Executed upstream production handoff

Plan 0.7.0 also supports `environmentCapture.processing`.

- Its reconstruction policy leaves out `rawFrame`. The plan supplies only the exact RAW that its own executed source-to-ADC pipeline returned.
- This route cannot be combined with `processedOutput`, or with an independent physical scene sample.
- Existing attached-RAW plan inputs, and their conservative limits on origin, stay valid.

See [production environment capture](PRODUCTION_ENVIRONMENT_CAPTURE.md) for binding, replay, stage activation and migration details.
