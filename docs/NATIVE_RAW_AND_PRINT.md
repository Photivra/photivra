# Native RAW and Print candidate contracts

These native RAW and Print contracts are part of version 1.4.0. The optional execution chunk control described below is an unreleased additive change and is not available in the published 1.4.0 package. Production adoption requires separate downstream qualification.

The separate `createNativeRawTask` contract accepts metadata without an inline image plane, then produces exact owned native codes, black levels, digital saturation codes and independent physical/pre-ADC/digital flags. Admission is limited to 24 million sites, 16,384 pixels per dimension, 256 sites per tile, and an explicitly admitted seven-byte-per-site payload. The reference 4,096-site RAW path is unchanged. Absolute CFA coordinates and absolute-index charge/read-noise seeds preserve reference arithmetic across tile boundaries.

`createNativeEnvironmentRawTask` invokes actual source radiance callbacks through shared projection, shutter, optical throughput, pupil/PSF and EQE calculations. It admits no more than 100,000 source evaluations per tile and requires a whole-event budget no greater than two billion. Source visibility, measured radiometry, convergence and physical transport remain provider responsibilities. The optional immutable photo-tile observer exposes bounded expectation values before noise or clipping. Observers receive the event AbortSignal for pending resource work. Source callbacks stop immediately when the event is aborted; observer failures and cancellation withhold output. `productionPlanActivated` and transport verification remain false.

`createNativeRawDevelopmentTask` snapshots one exact packed RAW and applies the shared reconstruction kernels, declared camera RGB-to-XYZ approximation, white balance exactly once, and shared SDR rendering. Every used phase and kernel halo must lie inside actual native support: no padding or weight renormalization. Output crop and orientation are bound to the capture geometry; this stage supports 1:1 output sampling. Retained payload admission counts the owned RAW copy and integer output, not caller buffers, JavaScript heap or GPU storage.

All tasks require host yields, publish only whole successful outputs, distinguish failure/cancellation/disposal, and transfer output ownership once. Typed storage must have an exact owned ArrayBuffer; shared buffers and hidden larger parent allocations are rejected. Metadata provenance and declared hashes do not establish producer authenticity.

RAW acquisition and development await the host `yieldControl` at a tile boundary once about 8 ms of work has elapsed since the previous yield, and always after the final tile. Every tile is still read, validated and committed separately, and cancellation is checked before each tile, after each read and after each yield, so a host event can cancel within about one budget plus one tile. Yield cadence never changes tile requests, absolute CFA/seed indexing or any output value. Earlier releases yielded after every tile (about 96,000 yields for a 6000×4000 raster), which cost minutes of idle time under a clamped browser `setTimeout(0)`.

Native environment acquisition also applies that budget between sites inside a tile, during both planning and radiance execution, sharing one budget with the tile loop. Cancellation is checked after each of those yields, so `cancel()` takes effect after at most about one site's work (one site with a large sampled PSF can still take hundreds of milliseconds). The engine owns a private clone of each environment tile, so supplied code running during these yields cannot change the data being processed. Native RAW without an environment keeps yielding only at tile boundaries: its sites remain supplier-owned until they are parsed, so a 256-site tile is still read, parsed, validated and computed in one step (a median of about 10 ms in Node on the repository fixture; host-dependent). Callers that need shorter blocks can pass a smaller explicit `tileWidth`.

Within one native environment event every site must declare the same shared source, optics, motion, PSF, pupil and field-throughput state. A site whose cloned shared state is strictly equal to the first admitted site's (same plain records and arrays, keys in the same order, `Object.is` primitives) reuses that site's engine-owned copy, so a sampled PSF is parsed and frozen once per event instead of once per site. Any other site is compared by canonical serialization as before, which decides acceptance and the error. This changes no value, callback or error. Because native environment execution reads only each planned query's frozen provider request and image-plane point, its per-site plans keep just those two parts of every query once it is computed and validated at plan time, instead of the complete query envelope. With a 375-node 31×31 sampled PSF (15,376 queries per site) this lowers a site plan from about 25 MB to about 8 MB of JavaScript heap (Node; host-dependent). `simulateEnvironmentSensorRawFrame` and the other full-record paths keep the complete envelopes.


### Optional smaller execution chunks (unreleased)

`NativeRawInput.tileWidth` may explicitly select an integer from 1 through 256 native sites. Omission retains the original 256-site execution and original plan shape. An explicit width is copied into the immutable plan and changes only tile count and provider request widths; host yields follow the time budget above. Absolute native CFA coordinates, noise seeds, rolling exposure windows and all output codes/flags are unchanged. This control does not change physical sampling or quadrature.

Smaller chunks can admit an unchanged high-query-per-site optical event under the existing 100,000-query tile cap. The two-billion whole-event cap and 24-million-site/output-byte limits remain unchanged; a smaller tile never establishes convergence, qualified source transport or production activation. For example, 64 sites with 1,024 source queries per site need 65,536 queries in a tile, while 256 sites would exceed the tile cap. The caller must still satisfy the full-event budget and qualify the source and result independently.

### Reusing the optical stage for post-optics edits (unreleased)

Native environment capture spends almost all of its time in the scene-radiance → optics → EQE stage. For an unchanged optical event, `createNativeEnvironmentRawTask` can retain that stage's per-site result and `createNativeEnvironmentSensorStageTask` can re-run only the sensor stage from it, without invoking any radiance callback. Both are opt-in; omitting `NativeEnvironmentRawInput.opticalStage` keeps the original behavior and output shape.

```ts
const prepared = createNativeEnvironmentRawTask({ ...input, opticalStage: { maximumRetainedBytes } }, provider);
await prepared.run();
const { raw, opticalStage } = prepared.takeOutput();
// Later: new seed, ISO/readout gain, dark profile or WB intent; same optical inputs.
const edit = createNativeEnvironmentSensorStageTask({ raw: editedRawInput, sceneBinding: input.sceneBinding }, opticalStage!,
  { readTile: provider.readTile, yieldControl: provider.yieldControl });
await edit.run();
const edited = edit.takeOutput(); // develop with createNativeRawDevelopmentTask as usual
opticalStage!.dispose();
```

**What is retained.** The optical stage ends at each site's photo-signal expectation: the midpoint times, incident-photon and generated-electron rates, their exact midpoint sums, and the local exposure window. These are retained as float64 values and handed back to the unchanged sensor code (dark charge, accumulated charge, capacity, Poisson/read-noise realization, ADC). The values are the exact numbers the optical stage produced, so RAW codes, black levels, saturation codes and flags, and therefore developed output, are bit-identical to a full `createNativeEnvironmentRawTask` with the same final inputs. This relies on one assumption the full path also makes: the radiance provider is a deterministic function of its request under the bound provider scene and profile identities. The engine cannot inspect supplied code.

**Which settings are reusable.** The optical stage never reads the capture's noise seed or realization, ISO metadata, white-balance intent, adopted white, capture identity, source-artifact metadata or declared models, nor the per-site readout profile/regime (conversion gain, read noise, ADC), charge sampling, capacity, completeness or dark-current profile and temperature. Changing only those reuses the stage. White balance and rendering exposure act in `createNativeRawDevelopmentTask`, which consumes RAW only.

**Which settings refuse reuse.** Everything else is part of the binding, compared by strict structural equality (`Object.is` on every number, so `0` and `-0` differ; identical key sets): scene state and time, geometry including orientation and imaging area, focal length, aperture, shutter time and the exposure window (global or rolling scan), focus, frame/mode/CFA/binding profiles, the scene binding with its provider scene, and every field of every site's environment: provider, illumination, temporal-illumination and material profiles, optical profile, motion, PSF selection and profile, field throughput and vignetting, pupil sampling, spectral and spatial sampling, spectral response (EQE) and temporal sample count. A capture-level difference refuses when the reuse task is created, before any tile is read; a site-environment difference refuses when its tile is read, before that tile is executed. Either withholds all output. There is no fallback recompute: the caller runs `createNativeEnvironmentRawTask` again.

**Why shutter time is not reusable.** Shutter time sets the local exposure window and therefore the midpoint query times. Those times enter every radiance request, the motion rotation and the temporal-illumination waveforms, and the midpoint weight is `duration / temporalSampleCount`. A static scene would give time-independent irradiance, but the engine cannot prove that a supplied provider ignores request time, and scaling the stored counts by a duration ratio would not reproduce the full path's arithmetic. A shutter change therefore needs a full recompute.

**Memory.** Retention stores `NATIVE_ENVIRONMENT_OPTICAL_STAGE_LIMITS.fixedBytesPerSite` (58) plus `bytesPerTemporalSamplePerSite` (24) per temporal midpoint for every native site: 106 bytes per site with two midpoints, about 2.5 GB for 24 million sites. `maximumRetainedBytes` must admit `pixelCount × (58 + 24 × temporalSampleCount)`; the check runs after the first tile is planned and before any radiance callback. One temporal sample count per event is required. Distinct site environments (ignoring the absolute site and integration ID) and distinct photo identity/evidence records are interned, each capped at 256. `retainedBytes` reports the typed-array total. `dispose()` zeroes and releases the storage; a disposed or forged stage is refused, and disposal during a running reuse stops it at the next tile. Cancelling, disposing or failing the producing task before `takeOutput()` releases the stage; after transfer the caller owns it. A stage can be reused any number of times.

`createNativeEnvironmentSensorStageTask` reports `providerEvaluationCount: 0`; `opticalStage.providerEvaluationCount` records the producing task's count. `test/native-environment-optical-stage.test.ts` checks reuse against full recomputes for PSF with radial field, flat emitter, pupil rays and eight temporal midpoints across seed, ISO with readout gain, white balance, rendering exposure and dark-current edits, and checks refusal for every optical input listed above, the memory bound and disposal.

## Print stage

`createPrintJpegTask` accepts explicitly encoded sRGB 8-bit RGB in an already oriented output raster. It crops only within actual source support and rejects enlargement, stretching and unsupported aspect ratios. Original area filtering decodes this declared post-SDR stage to linear values, integrates exact pixel overlap, then encodes and quantizes sRGB. This does not recover sensor headroom or reprocess RAW. Source reads are bounded to 256 × 32 pixels; JPEG coding uses 8 × 8 blocks. Edge replication is restricted to final JPEG coding blocks, not reconstruction or crop support.

The original baseline JPEG encoder embeds an original ICC v4.3 sRGB matrix/TRC profile, EXIF orientation 1, ExifVersion `0232` (Exif 2.32), sRGB ColorSpace and final pixel dimensions. An optional `pixelsPerInch` (1–65535) from the caller's print plan is written as IFD0 XResolution/YResolution RATIONALs with ResolutionUnit 2 (inches), exact for integers and otherwise the nearest decimal rational, and as JFIF 1.02 APP0 units 1 (dots per inch); JFIF density is a 16-bit integer, so APP0 carries the nearest integer and EXIF keeps the fractional value. Without `pixelsPerInch` the file claims no physical size: APP0 keeps units 0 with a 1:1 aspect ratio and IFD0 omits the resolution tags rather than inventing a default (readers typically assume 72 ppi). Its XMP records the immutable Print plan and declares source bytes unverified. Encoded output is explicitly budgeted to at most 256 MB and provider reads to one million. The caller owns the final file and must separately qualify browser save/share, byte-size requirements and printer/substrate appearance.

The ICC serializer uses the existing engine sRGB primaries and transfer function, standard numerical Bradford adaptation to D50 PCS and original ICC tag serialization. This profile adaptation does not introduce a shooting white-balance model. Numerical facts and format references: [ICC sRGB interpretation](https://registry.color.org/rgb-registry/files/sRGB.pdf), [ICC profile specification](https://www.color.org/icc34.pdf). No third-party ICC profile bytes or implementation were redistributed.

## Reproducible validation

`test/native-raw.test.ts`, `test/native-environment-raw.test.ts`, `test/native-environment-optical-stage.test.ts`, `test/native-raw-development.test.ts` and `test/print-jpeg.test.ts` cover small-reference parity, absolute odd-width phase/seed boundaries, orientation, signed below-black noise, whole-output budgets, corrupt providers, support halos and cancellation/ownership.

Run the optional actual megapixel test with `PHOTIVRA_VALIDATE_MEGAPIXEL_RAW=1 PHOTIVRA_RAW_REPORT=/tmp/native-raw-report.json npx vitest run test/native-raw-megapixel.test.ts`. It executes every one of a million native sites, develops that exact RAW and downsamples to a 500 × 500 ICC JPEG. The constructed count inputs are not a qualified megapixel scene-radiance capture.

Generate the separate original color, checker, asymmetric fractional crop, gray ramp and one-megapixel JPEG controls with `node scripts/generate-native-print-jpeg.mjs /tmp/native-print`. Validate actual bytes using `python scripts/verify-native-print-jpeg.py /tmp/native-print /tmp/native-print/validation.json` in an environment with NumPy and Pillow/LittleCMS. The independent area oracle expects 188 for a half-black/half-white sRGB checker reduction, rather than an encoded-value average. JPEG tolerance is four encoded codes; the original ICC is compared against LittleCMS sRGB over a 17³ color cube with a one-code budget.

These controls do not qualify all product fixtures, calibrated sensor/lens behavior, diffraction, full production depth composition, physical phone/tablet resources, printer appearance, platform save/share or substantive human review.

## Standalone bounded Print example

This executable control declares a constant encoded RGB source. The zero digest is a placeholder declaration and is not authenticated by the engine; a product should bind its actual retained artifact and enforce qualification before offering export.

```ts
import { createPrintJpegTask, createSrgbIccProfile } from '@photivra/engine';
const source = { captureId: 'owned-control', imageStateId: 'encoded-control', artifactId: 'constant-gray',
  sha256: '0'.repeat(64), width: 16, height: 16, encoding: 'encoded-srgb-8-rgb' as const };
const task = createPrintJpegTask({ source, crop: { x: 0, y: 0, width: 16, height: 16 },
  outputWidth: 8, outputHeight: 8, quantizationStep: 1, maximumEncodedBytes: 16000, maximumProviderReads: 100 }, {
  readTile: async request => ({ ...request, samples: new Uint8Array(request.width * request.height * 3).fill(128) }),
  yieldControl: async () => { await new Promise<void>(resolve => setTimeout(resolve, 0)); }
});
await task.run();
const jpeg = task.takeOutput();
if (jpeg.bytes.length === 0 || jpeg.width !== 8 || createSrgbIccProfile().length === 0) throw new Error('Control failed');
```
