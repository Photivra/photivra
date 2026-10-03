// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from "vitest";
import { createNativeCaptureSdrTask, calculateNativeCaptureSdrPlan, createSimulatedCapture, calculateCaptureSdr,
  calculateCaptureColorTransform, LINEAR_CAPTURE_RGB_PROFILE, resolveCaptureColorModel,
  type NativeCaptureSdrInput, type NativeCaptureSdrProvider, type NativeCaptureSdrTileRequest,
  type NativeCaptureSdrTile, type SimulatedCaptureInput } from "../src/index.js";
import { loadLinearCaptureInput } from "./helpers/linear-capture-fixture.js";

function raw(width = 2, height = 1): SimulatedCaptureInput {
  const input = loadLinearCaptureInput();
  input.geometry = { imagingArea: { widthMm: 36, heightMm: 24 }, nativeRaster: { pixelWidth: width, pixelHeight: height }, orientation: "landscape" };
  input.planes = [{ ...input.planes[0]!, pixelWidth: width, pixelHeight: height, rasterBinding: "oriented-active-capture",
    imageState: "color-transformed-linear-rgb", channelIds: ["red", "green", "blue"], colorProfile: LINEAR_CAPTURE_RGB_PROFILE,
    encodingReferenceWhiteXyz: resolveCaptureColorModel().referenceWhiteXyz,
    appliedTransforms: [{ kind: "linear-color", profile: LINEAR_CAPTURE_RGB_PROFILE }],
    storage: { kind: "external-float64", artifactId: "rgb-master", sha256: "b".repeat(64), sampleCount: width * height * 3, byteOrder: "little-endian" } }];
  return input;
}
function input(width = 2, height = 1): NativeCaptureSdrInput {
  return { capture: createSimulatedCapture(raw(width, height)).value, sourcePlaneId: "source", outputImageStateId: "sdr-state",
    maximumOutputBytes: width * height * 6, profile: { schemaVersion: "0.1.0", profileId: "neutral", profileVersion: "1", renderingExposureEv: 0,
      toneCurve: "identity", gamutHandling: "clip-components", outputDynamicRange: "sdr", transferFunction: "srgb", bitDepth: 8, rounding: "nearest-ties-up", dither: "none" } };
}
const values = [-.25, 0, .0031308, .18, .5, 1, 2, .00313081, .7];
function tile(request: NativeCaptureSdrTileRequest, precision: 32 | 64 = 64): NativeCaptureSdrTile {
  const stride = request.width * 3 + 2;
  const samples = precision === 32 ? new Float32Array(stride * request.height) : new Float64Array(stride * request.height);
  samples.fill(NaN); // Padding is ignored; finite image values are required.
  for (let y = 0; y < request.height; y++) for (let x = 0; x < request.width; x++) for (let c = 0; c < 3; c++) {
    samples[y * stride + x * 3 + c] = values[((request.y + y) * 13 + request.x + x + c) % values.length]!;
  }
  return { ...request, rowStrideSamples: stride, samples };
}
function provider(precision: 32 | 64 = 64): NativeCaptureSdrProvider {
  return { readTile: async (r): Promise<NativeCaptureSdrTile> => tile(r, precision), yieldControl: async (): Promise<void> => {} };
}
async function execute(v: NativeCaptureSdrInput, p = provider()): Promise<ReturnType<ReturnType<typeof createNativeCaptureSdrTask>["takeOutput"]>> {
  const task = createNativeCaptureSdrTask(v, p); await task.run(); return task.takeOutput();
}
describe("bounded native capture SDR", () => {
  it.each([8, 16] as const)("matches the unchanged capture reference at %i bits across tile edges and stride", async (bits) => {
    const v = input(259, 33); v.profile.bitDepth = bits; v.profile.renderingExposureEv = .25;
    const samples = tile({ captureId: "ignored", sourcePlaneId: "ignored", artifactId: "ignored", sha256: "ignored", x: 0, y: 0, width: 259, height: 33 });
    const packed: number[] = [];
    for (let y = 0; y < 33; y++) for (let x = 0; x < 259 * 3; x++) packed.push(samples.samples[y * samples.rowStrideSamples + x]!);
    const reference = createSimulatedCapture({ ...raw(259, 33), planes: [{ ...v.capture.planes[0]!, storage: { kind: "inline-float64", samples: packed } }] }).value;
    const expected = calculateCaptureSdr({ capture: reference, sourcePlaneId: "source", color: { kind: "already-transformed" }, profile: v.profile }).value;
    const actual = await execute(v);
    expect(Array.from(actual.integerSamples)).toEqual(expected.rendering.value.integerSamples);
    expect(actual.diagnostics).toEqual(expected.rendering.value.diagnostics);
    expect(actual.outputEncoding).toEqual(expected.rendering.value.outputEncoding);
    expect(actual.plan.capture).toEqual(v.capture); expect(actual.plan.tileCount).toBe(4);
  });
  it.each([32, 64] as const)("matches reference pixels and diagnostics for float%i across tone/gamut policies", async (precision) => {
    for (const bitDepth of [8, 16] as const) for (const toneCurve of ["identity", "positive-reinhard-per-channel"] as const) {
      for (const gamutHandling of ["clip-components", "reject-out-of-range"] as const) {
        const r = raw(259, 33);
        r.planes = [{ ...r.planes[0]!, referenceWhiteValue: 2,
          storage: { kind: precision === 32 ? "external-float32" : "external-float64", artifactId: "rgb-master",
            sha256: "b".repeat(64), sampleCount: 259 * 33 * 3, byteOrder: "little-endian" } }];
        const v = { ...input(259, 33), capture: createSimulatedCapture(r).value };
        v.profile = { ...v.profile, bitDepth, toneCurve, gamutHandling, renderingExposureEv: -.25 };
        const readTile = async (request: NativeCaptureSdrTileRequest): Promise<NativeCaptureSdrTile> => {
          const t = tile(request, precision);
          if (gamutHandling === "reject-out-of-range") {
            for (let y = 0; y < request.height; y++) for (let x = 0; x < request.width * 3; x++) {
              const i = y * t.rowStrideSamples + x;
              t.samples[i] = Math.max(0, t.samples[i]!);
            }
          }
          return t;
        };
        const full = await readTile({ captureId: "ignored", sourcePlaneId: "ignored", artifactId: "ignored", sha256: "ignored",
          x: 0, y: 0, width: 259, height: 33 });
        const packed = Array.from({ length: 259 * 33 * 3 }, (_, i) => full.samples[Math.floor(i / (259 * 3)) * full.rowStrideSamples + i % (259 * 3)]!);
        const reference = createSimulatedCapture({ ...r, planes: [{ ...r.planes[0]!, storage: { kind: "inline-float64", samples: packed } }] }).value;
        const expected = calculateCaptureSdr({ capture: reference, sourcePlaneId: "source", color: { kind: "already-transformed" }, profile: v.profile }).value.rendering.value;
        const actual = await execute(v, { readTile, yieldControl: provider().yieldControl });
        expect(Array.from(actual.integerSamples)).toEqual(expected.integerSamples);
        expect(actual.diagnostics).toEqual(expected.diagnostics);
        expect(actual.outputEncoding).toEqual(expected.outputEncoding);
        expect(actual.displayAdaptation).toEqual(expected.displayAdaptation);
      }
    }
  });
  it("keeps upstream color/WB, saturation and crop/orientation commitments intact", async () => {
    const source = loadLinearCaptureInput(); source.whiteBalanceIntent = { stateId: "wb", source: "manual-gains", locked: true,
      channelGains: { red: 2, green: 1, blue: .5 }, sourceProfile: null };
    const capture = createSimulatedCapture(source).value;
    const derived = calculateCaptureColorTransform({ capture, sourcePlaneId: "source", outputPlaneId: "rgb", outputImageStateId: "rgb-state",
      whiteBalance: { kind: "apply-resolved-rgb-gains", channelBasis: { id: "photivra-colorimetric-rgb-d65", version: "0.1.0" } } }).value.plane;
    const v = input();
    v.capture = createSimulatedCapture({ ...source, planes: [{ ...derived, storage: { kind: "external-float64", artifactId: "rgb-master", sha256: "c".repeat(64), sampleCount: 6, byteOrder: "little-endian" } }] }).value;
    v.sourcePlaneId = "rgb";
    const expected = calculateCaptureSdr({ capture: createSimulatedCapture({ ...source, planes: [derived] }).value,
      sourcePlaneId: "rgb", color: { kind: "already-transformed" }, profile: v.profile }).value;
    const actual = await execute(v, { readTile: async (r): Promise<NativeCaptureSdrTile> => ({ ...r, rowStrideSamples: 6,
      samples: new Float64Array(derived.storage.kind === "inline-float64" ? derived.storage.samples : []) }), yieldControl: provider().yieldControl });
    expect(Array.from(actual.integerSamples)).toEqual(expected.rendering.value.integerSamples);
    expect(actual.plan.capture.whiteBalanceIntent).toEqual(source.whiteBalanceIntent);
    for (const orientation of ["landscape", "portrait-clockwise", "landscape-inverted", "portrait-counter-clockwise"] as const) {
      const r = raw(10, 8), portrait = orientation.startsWith("portrait");
      r.geometry = { ...r.geometry, orientation, activeCaptureRect: { x: 1, y: 2, width: 6, height: 4 },
        outputCropRect: { x: 1, y: 1, width: 2, height: 2 } };
      r.planes = [{ ...r.planes[0]!, pixelWidth: portrait ? 4 : 6, pixelHeight: portrait ? 6 : 4,
        captureSaturation: { kind: "declared-virtual-white", whiteLevel: 4, upstreamClippedSampleCount: 1 },
        storage: { kind: "external-float64", artifactId: "rgb-master", sha256: "b".repeat(64), sampleCount: 72, byteOrder: "little-endian" } }];
      const c = createSimulatedCapture(r).value;
      const result = await execute({ ...input(), capture: c, maximumOutputBytes: 144 });
      expect(result.plan.capture).toEqual(c); expect(result.integerSamples.length).toBe(72);
      const width = c.planes[0]!.pixelWidth, height = c.planes[0]!.pixelHeight;
      const t = tile({ captureId: c.captureId, sourcePlaneId: "source", artifactId: "rgb-master", sha256: "b".repeat(64), x: 0, y: 0, width, height });
      const samples = Array.from({ length: width * height * 3 }, (_, i) => t.samples[Math.floor(i / (width * 3)) * t.rowStrideSamples + i % (width * 3)]!);
      const reference = createSimulatedCapture({ ...r, planes: [{ ...r.planes[0]!, storage: { kind: "inline-float64", samples } }] }).value;
      expect(Array.from(result.integerSamples)).toEqual(calculateCaptureSdr({ capture: reference, sourcePlaneId: "source",
        color: { kind: "already-transformed" }, profile: input().profile }).value.rendering.value.integerSamples);
    }
  });
  it("supports float32 precision and positive Reinhard without changing producer samples", async () => {
    const r = raw(); r.planes = [{ ...r.planes[0]!, storage: { ...r.planes[0]!.storage, kind: "external-float32" } as typeof r.planes[0]["storage"] }];
    const v = { ...input(), capture: createSimulatedCapture(r).value }; v.profile.toneCurve = "positive-reinhard-per-channel";
    const out = await execute(v, provider(32));
    expect(out.diagnostics.toneChangedSampleCount).toBeGreaterThan(0); expect(out.integerSamples).toBeInstanceOf(Uint8Array);
  });
  it("rejects unsupported metadata and resource admission before reader/allocation", () => {
    const v = input();
    for (const patch of [{ maximumOutputBytes: 0 }, { maximumOutputBytes: Infinity }, { sourcePlaneId: "missing" },
      { outputImageStateId: "source-state" }, { debug: "private" }, { profile: { ...v.profile, transferFunction: "pq" } }]) {
      expect(() => calculateNativeCaptureSdrPlan({ ...v, ...patch } as NativeCaptureSdrInput)).toThrow();
    }
    expect(() => calculateNativeCaptureSdrPlan(input(6000, 5000))).toThrow();
    expect(() => calculateNativeCaptureSdrPlan(input(16385, 1))).toThrow();
    expect(() => calculateNativeCaptureSdrPlan(null as unknown as NativeCaptureSdrInput)).toThrow();
    expect(() => createNativeCaptureSdrTask(v, null as unknown as NativeCaptureSdrProvider)).toThrow();
    for (const patch of [{ imageState: "scene-referred-xyz" }, { colorProfile: { id: "linear-srgb-d65", version: "2" } },
      { encodingReferenceWhiteXyz: { x: 1, y: 1, z: 1 } }, { storage: { kind: "inline-float64", samples: [0, 0, 0, 0, 0, 0] } }]) {
      expect(() => calculateNativeCaptureSdrPlan({ ...v, capture: { ...v.capture, planes: [{ ...v.capture.planes[0]!, ...patch }] } } as NativeCaptureSdrInput)).toThrow();
    }
  });
  it("rejects stale/malformed tiles, nonfinite data, precision and oversized backing buffers", async () => {
    const patches = [ (t: NativeCaptureSdrTile): NativeCaptureSdrTile => ({ ...t, captureId: "stale" }),
      (t: NativeCaptureSdrTile): NativeCaptureSdrTile => ({ ...t, x: 1 }),
      (t: NativeCaptureSdrTile): NativeCaptureSdrTile => ({ ...t, rowStrideSamples: 1 }),
      (t: NativeCaptureSdrTile): NativeCaptureSdrTile => ({ ...t, samples: new Float32Array(t.samples) }),
      (t: NativeCaptureSdrTile): NativeCaptureSdrTile => ({ ...t, samples: new Float64Array(new ArrayBuffer(300000), 0, t.samples.length) }),
      (t: NativeCaptureSdrTile): NativeCaptureSdrTile => ({ ...t, samples: new Float64Array(new SharedArrayBuffer(t.samples.byteLength)) }),
      (t: NativeCaptureSdrTile): NativeCaptureSdrTile => { t.samples[0] = Infinity; return t; } ];
    for (const patch of patches) {
      const task = createNativeCaptureSdrTask(input(), { ...provider(), readTile: async (r): Promise<NativeCaptureSdrTile> => patch(tile(r)) });
      await expect(task.run()).rejects.toThrow(); expect(task.state).toBe("failed"); expect(() => task.takeOutput()).toThrow();
    }
    const v = input(); v.profile.gamutHandling = "reject-out-of-range";
    await expect(execute(v)).rejects.toThrow();
  });
  it("rejects resolved WB intent without application before provider work", () => {
    for (const whiteBalanceApplication of ["intent-only", "not-applicable"] as const) {
      const r = raw();
      r.whiteBalanceIntent = { stateId: "wb", source: "manual-gains", locked: true,
        channelGains: { red: 2, green: 1, blue: .5 }, sourceProfile: null };
      r.planes = [{ ...r.planes[0]!, whiteBalanceApplication }];
      const capture = createSimulatedCapture(r).value;
      // This is a valid container, but it is not a render-ready WB state.
      expect(() => createNativeCaptureSdrTask({ ...input(), capture }, provider())).toThrow("resolved linear-sRGB/D65");
    }
  });
  it("cancels/disposes pending reads and rejects late completion; a fresh task recovers", async () => {
    for (const action of ["cancel", "dispose"] as const) {
      let settle: ((t: NativeCaptureSdrTile) => void) | undefined, request: NativeCaptureSdrTileRequest | undefined, signal: AbortSignal | undefined;
      const task = createNativeCaptureSdrTask(input(), { ...provider(), readTile: (r, s): Promise<NativeCaptureSdrTile> => {
        request = r; signal = s; return new Promise(resolve => { settle = resolve; });
      } });
      const running = task.run(); task[action](); expect(signal!.aborted).toBe(true);
      settle!(tile(request!)); await expect(running).rejects.toThrow();
      expect(task.state).toBe(action === "cancel" ? "cancelled" : "disposed"); expect(task.completedTileCount).toBe(0);
      expect(() => task.takeOutput()).toThrow(); await expect(task.run()).rejects.toThrow();
    }
    expect((await execute(input())).integerSamples.length).toBe(6);
  });
  it("cancels between tiles and owns output until one explicit transfer", async () => {
    const task = createNativeCaptureSdrTask(input(300, 33), { ...provider(), yieldControl: async (): Promise<void> => { task.cancel(); } });
    await expect(task.run()).rejects.toThrow(); expect(task.completedTileCount).toBe(1); expect(() => task.takeOutput()).toThrow();
    const completed = createNativeCaptureSdrTask(input(), provider()); await completed.run(); completed.cancel();
    expect(() => completed.takeOutput()).toThrow(); completed.dispose(); expect(completed.state).toBe("disposed");
    const ready = createNativeCaptureSdrTask(input(), provider()); ready.dispose(); await expect(ready.run()).rejects.toThrow();
    const retained = createNativeCaptureSdrTask(input(), provider()); await retained.run();
    const out = retained.takeOutput(); retained.dispose(); retained.cancel(); expect(retained.state).toBe("transferred");
    expect(out.integerSamples.length).toBe(6); expect(() => retained.takeOutput()).toThrow();
  });
  it("snapshots metadata/profile and callbacks before acquisition", async () => {
    const v = input(), p = provider(), task = createNativeCaptureSdrTask(v, p);
    v.profile.renderingExposureEv = 32; p.readTile = async (): Promise<NativeCaptureSdrTile> => { throw new Error("replacement"); };
    await task.run(); expect(task.takeOutput().plan.profile.renderingExposureEv).toBe(0);
  });
  it("rejects late host-yield settlement after disposal and allows actual timer cancellation", async () => {
    let settle: (() => void) | undefined;
    const pending = createNativeCaptureSdrTask(input(), { ...provider(), yieldControl: (): Promise<void> => new Promise(resolve => { settle = resolve; }) });
    const running = pending.run();
    await Promise.resolve();
    expect(pending.completedTileCount).toBe(1);
    pending.dispose(); settle!();
    await expect(running).rejects.toThrow(); expect(pending.state).toBe("disposed"); expect(() => pending.takeOutput()).toThrow();
    const task = createNativeCaptureSdrTask(input(300, 33), { ...provider(), yieldControl: async (): Promise<void> => {
      await new Promise<void>(resolve => setTimeout(() => { task.cancel(); resolve(); }, 0));
    } });
    await expect(task.run()).rejects.toThrow(); expect(task.completedTileCount).toBe(1); expect(task.state).toBe("cancelled");
    expect(() => task.takeOutput()).toThrow();
  });
  it("rejects unrepresentable scale before acquisition and clears failures in host yielding", async () => {
    const r = raw(); r.planes = [{ ...r.planes[0]!, referenceWhiteValue: Number.MIN_VALUE }];
    expect(() => calculateNativeCaptureSdrPlan({ ...input(), capture: createSimulatedCapture(r).value })).toThrow();
    const task = createNativeCaptureSdrTask(input(), { ...provider(), yieldControl: async (): Promise<void> => { throw new Error("host failure"); } });
    await expect(task.run()).rejects.toThrow("host failure"); expect(task.state).toBe("failed"); expect(() => task.takeOutput()).toThrow();
    const completed = createNativeCaptureSdrTask(input(), provider()); await completed.run(); completed.dispose();
    expect(() => completed.takeOutput()).toThrow();
    const ready = createNativeCaptureSdrTask(input(), provider()); ready.cancel(); await expect(ready.run()).rejects.toThrow();
    for (const bits of [8, 16] as const) {
      const v = input(); v.profile.bitDepth = bits;
      const code = .5 / (2 ** bits - 1), sample = code / 12.92;
      const out = await execute(v, { ...provider(), readTile: async (r): Promise<NativeCaptureSdrTile> => ({ ...r,
        rowStrideSamples: 6, samples: new Float64Array([sample, sample, sample, -0, 1, 2]) }) });
      expect(Array.from(out.integerSamples)).toEqual([1, 1, 1, 0, 2 ** bits - 1, 2 ** bits - 1]);
    }
  });
  it("executes a deterministic megapixel raster with bounded tile reads", async () => {
    let maxBytes = 0, reads = 0;
    const v = input(1200, 1000), task = createNativeCaptureSdrTask(v, { ...provider(), readTile: async (r): Promise<NativeCaptureSdrTile> => {
      const t = tile(r); maxBytes = Math.max(maxBytes, t.samples.byteLength); reads++; return t;
    } });
    await task.run(); const out = task.takeOutput();
    expect(reads).toBe(task.plan.tileCount); expect(maxBytes).toBeLessThanOrEqual(32768 * 8);
    expect(out.integerSamples.byteLength).toBe(3_600_000);
    // Independent transfer equation and row/column/channel addressing, including far edge.
    for (const [x, y, c] of [[0, 0, 0], [256, 32, 1], [1199, 999, 2]]) {
      const linear = Math.max(0, Math.min(1, values[(y! * 13 + x! + c!) % values.length]!));
      const encoded = linear <= .0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - .055;
      expect(out.integerSamples[(y! * 1200 + x!) * 3 + c!]).toBe(Math.floor(encoded * 255 + .5));
    }
  });
});
