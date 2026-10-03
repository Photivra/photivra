# Bounded native capture SDR execution

`calculateNativeCaptureSdrPlan` and `createNativeCaptureSdrTask` are additive schema 0.1.0 APIs for authoritative external linear RGB manifests. They do not widen the unchanged `calculateCaptureSdr` or `calculateSdrRendering` reference guards. This is engine-declared tiling, with whole-capture identity and explicit ownership, rather than consumer request splitting.

## Supported domain

The selected `SimulatedCapture` plane must already be color-transformed linear sRGB/D65, exact profile version 0.1.0, co-sited RGB with resolved upstream WB or no WB required. All planes in the manifest must use external float32/float64 storage. The provider decodes declared little-endian bytes to the matching native typed numeric array. Precision is preserved; float32 is not promoted to a claim of original float64 fidelity. Reference white, signed values, headroom, capture saturation and source dynamic-range history stay distinct.

XYZ, unresolved sensor/virtual RGB, pending WB, HDR, resampling, lens corrections and RAW generation are unsupported here. Complete color/WB through the engine-owned upstream contract before handing over this master. This executor never applies WB twice or generates a source from a preview. The upstream renderer/source still needs qualification; structural metadata is not proof of correct pixels or calibration.

Coordinates are absolute top-left, +X right/+Y down in the plane's declared `oriented-active-capture` or `output` raster. Crop and physical orientation are already committed in the capture geometry and represented by the provider's plane. The executor preserves them without re-cropping, rotating, padding image edges or resampling. The output dimensions exactly equal the selected plane. Geometry includes later output intent even when the selected active-capture plane precedes that intent; this call does not execute that later crop.

## Limits and ownership

Maximum raster is 24,000,000 pixels, each dimension at most 16,384. Every tile is at most 256 × 32 pixels; right/bottom tiles use their actual remaining dimensions. A tile has RGB row stride in component samples, at least width × 3. Its length must exactly equal stride × height. Padding is ignored. The entire backing buffer, including offset/slack, is bounded to 32,768 components in the declared float precision. SharedArrayBuffer is rejected; provider must not mutate, detach or reuse its returned tile. No tile/output network, persistence or decoder is built into the engine.

A task allocates one tightly packed Uint8Array or Uint16Array output only after admission planning. `maximumOutputBytes` must admit the exact width × height × 3 × bytes-per-code. The maximum retained output is 72 MB at 8 bits or 144 MB at 16 bits, decimal units. The input master remains external and is not retained/copied wholesale. At most one tile read is in flight.

`maximumScratchPayloadBytes` is 1,441,792 bytes: one maximum float64 provider payload plus six bounded double-array payloads (packed input, parsed input, tone, gamut, transfer, codes). This counts logical numeric payloads, not JS array headers, temporary validation booleans, GC retention, decoder/GPU memory or platform overhead. It is **not** a heap/process/device peak guarantee. Callers must budget output plus measured runtime/decoder/source retention and reject unsupported devices before starting. No full-size floating-point diagnostic arrays are retained.

## Processing and identity

Each tile delegates to the unchanged bounded SDR reference. Exposure normalization → selected tone curve → gamut policy → sRGB transfer → nearest-ties-up integer quantization is pointwise, so tiling adds no halo, seam, altered rounding or second camera-science implementation. Counts are aggregated over actual image components; capture saturation is preserved in the plan and remains `not-consumed` in downstream rendering diagnostics. The reference's output encoding and external display-adaptation declaration accompany the output.

The frozen plan retains the full parsed capture: creator/schema, source artifact/hash/history, scene/time, seed/noise/model/evidence, exposure/focus/WB, geometry/plane/color/transform identities, new output state ID and complete rendering profile. Every request and response must match capture ID, plane ID, source artifact/hash and exact rectangle. A digest match is an identity declaration, not verification of sample bytes: the provider owns authenticating the external artifact against its whole-file hash before decoding. No partial-file hash is relabeled as a full source hash.

## Task lifecycle

`ready → running → completed → transferred` is single-use. `run()` resolves without publishing a buffer. `takeOutput()` transfers the retained buffer once, along with its plan/encoding/diagnostics. Caller owns the returned mutable integer array; an immutable capture manifest does not make output bytes immutable. Dispose/cancel cannot revoke a transferred buffer.

Before transfer, cancel/dispose aborts the provider signal, clears/releases any engine output, and prevents publication. `run()` rejects after a pending read/yield settles; providers must honor abort and release their resources. A non-cooperative pending callback cannot be forcibly stopped by this API. Caller must await settlement before reclaiming shared provider resources or launching replacement work on them. Failed tasks release partial output and abort the provider signal. A fresh admitted task is the recovery path; no automatic retry/fallback exists.

The provider's required `yieldControl(signal)` must yield to the host event loop between tiles (for example an abort-aware timer, scheduler or worker handoff). A resolved promise alone does not let browser input/timer cancellation run. Host scheduling is external to the scientific package. Check current application capture identity before transferring/installing a completed output; a disposed older task cannot publish late.

## Acceptance and release

`test/native-capture-sdr.test.ts` compares the unchanged capture reference across tile edges, row padding, 8/16-bit encoding, upstream WB and all four committed orientations/off-center crops. It checks invalid/stale/oversized domains, finite image data, float precision, pending-read cancellation, between-tile cancellation, disposal, ownership transfer and recovery, plus independently predicted pixels in a 1.2 MP synthetic raster.

See [the validation record](NATIVE_CAPTURE_SDR_VALIDATION.md) for measured host-specific evidence and [the technical review](NATIVE_CAPTURE_SDR_REVIEW.md) for the remaining human/source certification gates. Run `node --expose-gc scripts/benchmark-native-capture-sdr.mjs` after build for deterministic 6 MP/24 MP timing and sampled process memory at both 8 and 16 bits. Measurements are host-specific and use owned analytic samples, not licensed photographs or calibration. The packed example below runs through the real root package during consumer acceptance.

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

Human review, merge, version/tag and npm publication are separate release steps. Consumer activation requires the published reviewed contract, a qualified native producer and measured device budgets. This API does not activate a production plan or qualify app fixtures, Print/JPEG delivery, GPU rendering or devices.
