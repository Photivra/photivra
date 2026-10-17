# Bounded native capture SDR execution

`calculateNativeCaptureSdrPlan` and `createNativeCaptureSdrTask` render a large linear capture to an SDR (standard dynamic range) image, one tile at a time. They are additional APIs at schema 0.1.0, for authoritative linear RGB image manifests stored outside the engine.

- They do not loosen the unchanged guards on the reference functions `calculateCaptureSdr` and `calculateSdrRendering`.
- The engine decides the tiling. Identity stays tied to the whole capture, and ownership is explicit. This is not the consumer splitting a request into pieces.

## Supported domain

**What the input must be.**

- The selected `SimulatedCapture` plane must already be colour-transformed linear sRGB/D65, with exact profile version 0.1.0.
- RGB must be co-sited, with white balance (WB) already resolved upstream, or not required.
- All planes in the manifest must use external float32 or float64 storage.
- The provider decodes the declared little-endian bytes into the matching native typed array.
- Precision is kept as is; float32 is never presented as if it had original float64 fidelity.
- Reference white, signed values, headroom, capture saturation and source dynamic-range history stay separate.

**Not supported here:** XYZ, unresolved sensor or virtual-camera RGB, pending WB, HDR, resampling, lens corrections and RAW generation.

Complete colour and WB through the engine's own upstream contract before handing over this master image. This executor never applies WB twice, and never generates a source from a preview. The upstream renderer or source still needs validating; structural metadata does not prove the pixels or calibration are correct.

**Coordinates.** Absolute, from the top left, +X right and +Y down, in the plane's declared `oriented-active-capture` or `output` raster.

- Crop and physical orientation are already committed in the capture geometry, and are already reflected in the provider's plane.
- The executor keeps them as they are. It does not re-crop, rotate, pad edges or resample.
- The output dimensions are exactly those of the selected plane.
- The geometry includes later output intent even when the selected active-capture plane comes before that intent. This call does not apply that later crop.

## Limits and ownership

**Size limits.**

- Maximum raster: 24,000,000 pixels by default, with each dimension at most 16,384. From 2.2 the optional
  `maximumPixels` input raises the pixel limit up to `NATIVE_CAPTURE_SDR_LIMITS.ceilingPixels` (2^27); see the
  quick start's [Large images](QUICK_START.md#large-images).
- Every tile is at most 256 × 32 pixels. Right and bottom edge tiles use whatever size remains.

**Tile format.**

- A tile has an RGB row stride, counted in component samples, of at least width × 3.
- Its length must be exactly stride × height. Padding is ignored.
- The whole backing buffer, including offset and slack, is limited to 32,768 components at the declared float precision.
- SharedArrayBuffer is rejected. The provider must not change, detach or reuse a tile after returning it.
- The engine has no built-in network, persistence or decoder for tiles or output.

**Output memory.** A task allocates one tightly packed Uint8Array or Uint16Array for output, and only after planning has accepted the job.

- `maximumOutputBytes` must allow exactly width × height × 3 × bytes-per-code.
- The largest retained output is 72 MB at 8 bits, or 144 MB at 16 bits (decimal units).
- The input master stays outside the engine and is never kept or copied as a whole.
- At most one tile read is in progress at a time.

**Scratch memory.** `maximumScratchPayloadBytes` is 1,441,792 bytes. That is one maximum float64 provider payload plus six bounded double-array payloads (packed input, parsed input, tone, gamut, transfer, codes).

- This declared bound is unchanged from the earlier executor that delegated to the reference. The typed-array tile kernel now keeps only the provider payload, so the bound is conservative.
- It counts logical numeric payloads only. It does not count JavaScript array headers, temporary validation booleans, garbage-collector retention, decoder or GPU memory, or platform overhead.
- It is **not** a guarantee of peak heap, process or device memory.

Callers must budget for the output plus measured runtime, decoder and source memory, and reject unsupported devices before starting. No full-size floating-point diagnostic arrays are kept.

## Processing and identity

**The kernel.** Each tile runs a typed-array kernel owned by the engine. It applies the equations of the bounded SDR reference (`calculateSdrRendering`), with the same per-sample floating-point order of operations and the same error precedence. It writes integer codes straight into the packed output.

- Validation happens once, at the task boundary (tile identity, precision, stride and finite image samples), instead of through the generic deep result walker.
- The steps are: exposure normalisation → selected tone curve → gamut policy → sRGB transfer → integer quantisation (nearest, ties up). Each step works on one sample at a time, so tiling adds no halo, seam or change in rounding.
- `test/native-capture-sdr-kernel-parity.test.ts` proves identical codes, diagnostics and error precedence against the unchanged reference.
- Counts are totalled over actual image components.
- Capture saturation is kept in the plan, and stays `not-consumed` in downstream rendering diagnostics.
- The reference's output encoding, and its declaration about external display adaptation, come with the output.

**The plan.** The frozen plan keeps the full parsed capture:

- creator and schema;
- source artifact, hash and history;
- scene and time;
- seed, noise, model and evidence;
- exposure, focus and WB;
- identities of geometry, plane, colour and transform;
- the new output state ID;
- the complete rendering profile.

**Matching.** Every request and response must match the capture ID, plane ID, source artifact and hash, and exact rectangle. A digest match only declares identity; it does not verify the sample bytes. The provider is responsible for authenticating the external artifact against its whole-file hash before decoding. A hash of part of a file is never relabelled as a full source hash.

## Task lifecycle

**States.** `ready → running → completed → transferred`. Each task is used once.

- `run()` resolves without publishing a buffer.
- `takeOutput()` hands over the retained buffer once, with its plan, encoding and diagnostics.
- The caller owns the returned integer array and can change it. An immutable capture manifest does not make the output bytes immutable.
- Dispose or cancel cannot take back a buffer that has been handed over.

**Cancelling.** Before the handover, cancel or dispose aborts the provider's signal, clears and releases any engine output, and prevents publication.

- `run()` rejects after a pending read or yield settles. Providers must respect the abort and release their resources.
- This API cannot forcibly stop a pending callback that does not cooperate. The caller must wait for it to settle before reusing shared provider resources or starting replacement work on them.
- A failed task releases partial output and aborts the provider signal.
- To recover, create a fresh task. There is no automatic retry or fallback.

**Yielding.** The provider's required `yieldControl(signal)` must give control back to the host event loop between tiles, for example with an abort-aware timer, a scheduler or a worker handoff. A resolved promise alone does not let browser input or timer-based cancellation run. Host scheduling is outside the scientific package.

Before using a completed output, check that it still belongs to the application's current capture. A disposed older task cannot publish late.

## Acceptance and release

`test/native-capture-sdr.test.ts` and `test/native-capture-sdr-kernel-parity.test.ts` compare against the unchanged capture/SDR reference across:

- tile edges and row padding;
- 8- and 16-bit encoding;
- upstream WB;
- all four committed orientations, and off-centre crops.

They also check invalid, stale and oversized inputs, finite image data, float precision, cancellation during a pending read and between tiles, disposal, ownership transfer and recovery. Pixels in a 1.2 MP synthetic raster are predicted independently.

**More evidence.**

- [The validation record](NATIVE_CAPTURE_SDR_VALIDATION.md) has measured, host-specific evidence.
- [The technical review](NATIVE_CAPTURE_SDR_REVIEW.md) lists the remaining human and source certification steps.
- After building, run `node --expose-gc scripts/benchmark-native-capture-sdr.mjs` for deterministic 6 MP and 24 MP timings and sampled process memory, at 8 and 16 bits. Measurements depend on the host, and use analytic samples owned by Photivra, not licensed photographs or calibration.

The packed example below runs against the real root package during consumer acceptance testing.

```ts
import { createSimulatedCapture, createNativeCaptureSdrTask, LINEAR_CAPTURE_RGB_PROFILE, resolveCaptureColorModel } from "@photivra/engine";
const capture = createSimulatedCapture({
  captureId: "native-example", sceneStateId: "analytic-scene", sceneTimeSeconds: 0,
  geometry: { imagingArea: { widthMm: 36, heightMm: 24 }, nativeRaster: { pixelWidth: 2, pixelHeight: 1 }, orientation: "landscape" },
  exposure: { focalLengthMm: 50, aperture: 4, shutterSeconds: .01, iso: 100 }, focus: { kind: "infinity" },
  noise: { seedUint32: 0, realizationId: "none", model: { id: "analytic-noise-zero", version: "1" } },
  source: { kind: "color-transformed-linear-master", artifactId: "analytic-source", sha256: "a".repeat(64), dynamicRangeHistory: "no-loss-declared" },
  whiteBalanceIntent: null, adoptedWhiteXyz: null,
  models: [{ profile: LINEAR_CAPTURE_RGB_PROFILE, scientificStatus: "calculated", publicEvidenceIds: ["photivra:analytic-example"] }],
  planes: [{ id: "rgb", imageStateId: "linear-state", imageState: "color-transformed-linear-rgb", rasterBinding: "oriented-active-capture",
    pixelWidth: 2, pixelHeight: 1, channelIds: ["red", "green", "blue"], colorProfile: LINEAR_CAPTURE_RGB_PROFILE,
    encodingReferenceWhiteXyz: resolveCaptureColorModel().referenceWhiteXyz, referenceWhiteValue: 1, whiteBalanceApplication: "not-applicable",
    captureSaturation: { kind: "not-modeled" }, appliedTransforms: [{ kind: "linear-color", profile: LINEAR_CAPTURE_RGB_PROFILE }],
    storage: { kind: "external-float64", byteOrder: "little-endian", artifactId: "analytic-rgb", sha256: "b".repeat(64), sampleCount: 6 } }]
}).value;
// Digests here are synthetic identity placeholders, not verified artifacts.
const task = createNativeCaptureSdrTask({ capture, sourcePlaneId: "rgb", outputImageStateId: "sdr-state", maximumOutputBytes: 6,
  profile: { schemaVersion: "0.1.0", profileId: "neutral", profileVersion: "1", renderingExposureEv: 0, toneCurve: "identity",
    gamutHandling: "clip-components", outputDynamicRange: "sdr", transferFunction: "srgb", bitDepth: 8, rounding: "nearest-ties-up", dither: "none" }
}, {
  async readTile(request) { return { ...request, rowStrideSamples: 6, samples: new Float64Array([0, .5, 1, 1, .5, 0]) }; },
  async yieldControl() { await new Promise<void>(resolve => setTimeout(resolve, 0)); }
});
await task.run();
const output = task.takeOutput();
if (output.integerSamples.join(",") !== "0,188,255,255,188,0") throw new Error("Native SDR example failed");
```

Human review, merge, versioning and tagging, and npm publication are separate release steps. Using this in a product needs the published, reviewed contract, a validated native producer, and measured device budgets. This API does not turn on a production plan, and does not validate app fixtures, Print/JPEG delivery, GPU rendering or devices.
