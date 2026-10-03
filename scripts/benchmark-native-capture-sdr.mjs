// SPDX-License-Identifier: Apache-2.0

/** Owned analytic source; sampled process peaks are host-specific, not allocation guarantees. */
import process from "node:process";
import console from "node:console";
import { performance } from "node:perf_hooks";
import { setImmediate } from "node:timers";
import { createHash } from "node:crypto";
import { ENGINE_API_VERSION, createSimulatedCapture, createNativeCaptureSdrTask, LINEAR_CAPTURE_RGB_PROFILE, resolveCaptureColorModel } from "../dist/index.js";
async function measure(width, height, bitDepth) {
const baseline = process.memoryUsage();
let peakRss = baseline.rss, peakHeap = baseline.heapUsed, peakArrayBuffers = baseline.arrayBuffers, largestTile = 0;
function sampleMemory() { const m = process.memoryUsage(); peakRss = Math.max(peakRss, m.rss); peakHeap = Math.max(peakHeap, m.heapUsed); peakArrayBuffers = Math.max(peakArrayBuffers, m.arrayBuffers); }
const capture = createSimulatedCapture({
  captureId: "native-example", sceneStateId: "analytic-scene", sceneTimeSeconds: 0,
  geometry: { imagingArea: { widthMm: 36, heightMm: 24 }, nativeRaster: { pixelWidth: width, pixelHeight: height }, orientation: "landscape" },
  exposure: { focalLengthMm: 50, aperture: 4, shutterSeconds: .01, iso: 100 }, focus: { kind: "infinity" },
  noise: { seedUint32: 0, realizationId: "none", model: { id: "analytic-noise-zero", version: "1" } },
  source: { kind: "color-transformed-linear-master", artifactId: "analytic-source", sha256: "a".repeat(64), dynamicRangeHistory: "no-loss-declared" },
  whiteBalanceIntent: null, adoptedWhiteXyz: null,
  models: [{ profile: LINEAR_CAPTURE_RGB_PROFILE, scientificStatus: "calculated", publicEvidenceIds: ["photivra:analytic-example"] }],
  planes: [{ id: "rgb", imageStateId: "linear-state", imageState: "color-transformed-linear-rgb", rasterBinding: "oriented-active-capture",
    pixelWidth: width, pixelHeight: height, channelIds: ["red", "green", "blue"], colorProfile: LINEAR_CAPTURE_RGB_PROFILE,
    encodingReferenceWhiteXyz: resolveCaptureColorModel().referenceWhiteXyz, referenceWhiteValue: 1, whiteBalanceApplication: "not-applicable",
    captureSaturation: { kind: "not-modeled" }, appliedTransforms: [{ kind: "linear-color", profile: LINEAR_CAPTURE_RGB_PROFILE }],
    storage: { kind: "external-float64", byteOrder: "little-endian", artifactId: "analytic-rgb", sha256: "b".repeat(64), sampleCount: width * height * 3 } }]
}).value;
// Digests here are synthetic identity placeholders, not verified artifacts.
const task = createNativeCaptureSdrTask({ capture, sourcePlaneId: "rgb", outputImageStateId: "sdr-state", maximumOutputBytes: width * height * 3 * bitDepth / 8,
  profile: { schemaVersion: "0.1.0", profileId: "neutral", profileVersion: "1", renderingExposureEv: 0, toneCurve: "identity",
    gamutHandling: "clip-components", outputDynamicRange: "sdr", transferFunction: "srgb", bitDepth, rounding: "nearest-ties-up", dither: "none" }
}, {
  async readTile(request) {
    const stride = request.width * 3, samples = new Float64Array(stride * request.height);
    for (let y = 0; y < request.height; y++) for (let x = 0; x < request.width; x++) {
      const offset = y * stride + x * 3;
      samples[offset] = (request.x + x) / (width - 1); samples[offset + 1] = .5; samples[offset + 2] = (request.y + y) / (height - 1);
    }
    largestTile = Math.max(largestTile, samples.byteLength); sampleMemory();
    return { ...request, rowStrideSamples: stride, samples };
  },
  async yieldControl() { sampleMemory(); await new Promise(resolve => setImmediate(resolve)); }
});
const started = performance.now();
await task.run();
const milliseconds = performance.now() - started;
const output = task.takeOutput();
if (output.integerSamples[0] !== 0 || output.integerSamples[1] !== (bitDepth === 8 ? 188 : 48192) || output.integerSamples.at(-1) !== (2 ** bitDepth - 1)) throw new Error("Benchmark pixel identity failed");
const hash = createHash("sha256").update(output.integerSamples).digest("hex");
sampleMemory();
console.log(JSON.stringify({ engineApiVersion: ENGINE_API_VERSION, width, height, bitDepth, milliseconds, hash, outputBytes: output.integerSamples.byteLength,
  largestTileBytes: largestTile, maximumScratchPayloadBytes: task.plan.maximumScratchPayloadBytes,
  baseline, sampledPeak: { rss: peakRss, heapUsed: peakHeap, arrayBuffers: peakArrayBuffers }, runtime: process.version, platform: process.platform, arch: process.arch }));
}
for (const [width, height, bitDepth] of [[3000, 2000, 8], [6000, 4000, 8], [3000, 2000, 16], [6000, 4000, 16]]) { globalThis.gc?.(); await measure(width, height, bitDepth); }
