// SPDX-License-Identifier: Apache-2.0
/**
 * #449 (part 1, item 3): the expected signal's chart-material tables are kept by content across input objects, the last
 * EXPECTED_SIGNAL_TABLE_CACHE_SIZE. Inputs of equal numbers share them and give the values and lookup counts of freshly built
 * tables; any changed number misses; each signal keeps its own window state, so signals of equal inputs used interleaved (two
 * captures or a capture and a display view awaited together) give the values of sequential use. Radiance scenes are not kept.
 * Through the facade: region parts of one request build the tables once, and changed settings miss and match a cold run.
 */
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { prepareDisplayView, simulateCapture, type DisplayViewResult, type SimulateCaptureOptions, type SimulateCaptureResult } from "../src/index.js";
import { clearExpectedSignalTableCache, createDisplayViewExpectedSignal, expectedSignalTableCacheState, EXPECTED_SIGNAL_TABLE_CACHE_SIZE,
  type DisplayViewExpectedSignalInput } from "../src/facade/expected-signal.js";
import { scaledTimeout as testTimeout } from "./helpers/test-timeout.js";

const W = 24, H = 18;
const checker = (u: number, v: number): number => ((Math.floor(u * 3) + Math.floor(v * 3)) & 1) + (u > 0.6 ? 2 : 0);
/** A 24 × 18 raster of a four-material chart (neutral and spectral), two query offsets of different fractional shifts. */
function input(kernels: boolean, change: (i: DisplayViewExpectedSignalInput) => void = () => undefined): DisplayViewExpectedSignalInput {
  const i: DisplayViewExpectedSignalInput = {
    nativeWidth: W, nativeHeight: H, outputWidth: W, wavelengthsNm: [500, 600],
    electronsPerRadiance: [Float64Array.of(1, 2), Float64Array.of(3, 1), Float64Array.of(0.5, 4)],
    offsets: [{ x: -0.25, y: 0.25, weight: 0.5 }, { x: 0.25, y: -0.25, weight: 0.5 }],
    ...(kernels ? { kernels: { radius: 1, perNode: [Float64Array.of(0, 0.1, 0, 0.1, 0.6, 0.1, 0, 0.1, 0), Float64Array.of(0.05, 0.1, 0.05, 0.1, 0.4, 0.1, 0.05, 0.1, 0.05)] } } : {}),
    // A new function per input: the tables may be shared, the rings (which depend on materialAt) may not.
    scene: { kind: "materials", materialAt: (u, v) => checker(u, v), materials: [{ neutral: 0.4 }, { radiance: Float64Array.of(0.2, 0.7) }, { neutral: 0.9 }, { radiance: Float64Array.of(0.6, 0.1) }],
      whiteRadiance: Float64Array.of(1, 1.2) },
    channelAt: (x, y) => ((y & 1) === 0 ? ((x & 1) === 0 ? 0 : 1) : ((x & 1) === 0 ? 1 : 2)),
    ...(kernels ? {} : { queryPoint: (x: number, y: number, o: number, out: Float64Array): void => { out[0] = (x + 0.5 + (o === 0 ? -0.25 : 0.25) - W / 2) * 2 / W; out[1] = -(y + 0.5 + (o === 0 ? 0.25 : -0.25) - H / 2) * 2 / W; } })
  };
  change(i);
  return i;
}
const WINDOWS: [number, number, number, number][] = [[0, 0, 8, 7], [3, 1, 11, 8], [8, 0, 16, 7], [16, 11, 24, 18], [0, 0, 24, 18]];
type Signal = ReturnType<typeof createDisplayViewExpectedSignal>;
/** Every site of each window (and one outside it), with the uniform material and the lookup count after each window. */
function* readAll(signal: Signal): Generator<number[], void> {
  for (const [x0, y0, x1, y1] of WINDOWS) {
    signal.window(x0, y0, x1, y1);
    const out: number[] = [];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) out.push(signal.site(x, y), signal.uniformMaterial);
    out.push(signal.site((x1 + 3) % W, (y1 + 2) % H), signal.lookups);
    yield out;
  }
}
const sequential = (signal: Signal): number[][] => [...readAll(signal)];
/** Values as their bits (so -0 and 0 differ). */
const bits = (values: number[][]): string => values.map((v) => Buffer.from(Float64Array.from(v).buffer).toString("hex")).join("|");
/** The values of an input whose tables are built afresh (the cache emptied first). */
function cold(i: DisplayViewExpectedSignalInput): string { clearExpectedSignalTableCache(); return bits(sequential(createDisplayViewExpectedSignal(i))); }

describe("expected-signal tables kept by content (#449)", () => {
  it.each([true, false])("kernels %s: equal inputs share the tables, read interleaved, and match freshly built ones bit for bit", (kernels) => {
    const reference = cold(input(kernels));
    const before = expectedSignalTableCacheState();
    const a = createDisplayViewExpectedSignal(input(kernels)), b = createDisplayViewExpectedSignal(input(kernels));
    expect(expectedSignalTableCacheState()).toMatchObject({ builds: before.builds, hits: before.hits + 2 });
    // Two signals of equal inputs, their windows interleaved (as two captures awaited together): each keeps its own window state.
    const ra = readAll(a), rb = readAll(b), va: number[][] = [], vb: number[][] = [];
    for (;;) { const x = ra.next(), y = rb.next(); if (x.done || y.done) break; va.push(x.value); vb.push(y.value); }
    expect(bits(va)).toBe(reference);
    expect(bits(vb)).toBe(reference);
    // A second signal of one input (as a prepared view's next render) reads that input's rings.
    expect(bits(sequential(createDisplayViewExpectedSignal(input(kernels))))).toBe(reference);
  });

  const changes: [string, (i: DisplayViewExpectedSignalInput) => void][] = [
    ["a wavelength", (i): void => { i.wavelengthsNm = [500, 610]; }],
    ["a channel response", (i): void => { i.electronsPerRadiance[1][0] = 3.0000000000000004; }],
    ["an offset", (i): void => { (i.offsets as unknown as { x: number }[])[1]!.x = 0.3; }],
    ["an offset weight", (i): void => { (i.offsets as unknown as { weight: number }[])[0]!.weight = 0.25; }],
    ["a kernel tap", (i): void => { i.kernels!.perNode[1]![4] = 0.41; }],
    ["a kernel tap's sign of zero", (i): void => { i.kernels!.perNode[0]![0] = -0; }],
    ["the kernel radius and taps", (i): void => { i.kernels = { radius: 0, perNode: [Float64Array.of(1), Float64Array.of(0.9)] }; }],
    ["a neutral reflectance", (i): void => { (i.scene as unknown as { materials: unknown[] }).materials[2] = { neutral: 0.91 }; }],
    ["a material radiance", (i): void => { (i.scene as unknown as { materials: { radiance: Float64Array }[] }).materials[1]!.radiance[1] = 0.71; }],
    ["a neutral material made spectral", (i): void => { (i.scene as unknown as { materials: unknown[] }).materials[0] = { radiance: Float64Array.of(0.4, 0.48) }; }],
    ["the material list", (i): void => { (i.scene as unknown as { materials: unknown[] }).materials.push({ neutral: 0.05 }); }],
    ["the white radiance", (i): void => { (i.scene as unknown as { whiteRadiance: Float64Array }).whiteRadiance[0] = 1.01; }]
  ];
  it.each(changes)("a changed %s misses and matches freshly built tables", (_, change) => {
    clearExpectedSignalTableCache();
    createDisplayViewExpectedSignal(input(true));
    const before = expectedSignalTableCacheState();
    const changed = bits(sequential(createDisplayViewExpectedSignal(input(true, change))));
    expect(expectedSignalTableCacheState()).toMatchObject({ builds: before.builds + 1, hits: before.hits, size: 2 });
    expect(changed).toBe(cold(input(true, change)));
  });

  it("keeps the last few, least recently used out first; radiance scenes are not kept", () => {
    clearExpectedSignalTableCache();
    const variant = (k: number): DisplayViewExpectedSignalInput => input(true, (i) => { (i.scene as unknown as { materials: unknown[] }).materials[2] = { neutral: 0.5 + k / 100 }; });
    for (let k = 0; k < EXPECTED_SIGNAL_TABLE_CACHE_SIZE; k++) createDisplayViewExpectedSignal(variant(k));
    createDisplayViewExpectedSignal(variant(0)); // most recently used now: variant 1 is the oldest
    const start = expectedSignalTableCacheState();
    expect(start.size).toBe(EXPECTED_SIGNAL_TABLE_CACHE_SIZE);
    createDisplayViewExpectedSignal(variant(EXPECTED_SIGNAL_TABLE_CACHE_SIZE));
    expect(expectedSignalTableCacheState()).toMatchObject({ size: EXPECTED_SIGNAL_TABLE_CACHE_SIZE, builds: start.builds + 1 });
    createDisplayViewExpectedSignal(variant(0));
    expect(expectedSignalTableCacheState()).toMatchObject({ builds: start.builds + 1, hits: start.hits + 1 });
    createDisplayViewExpectedSignal(variant(1));
    expect(expectedSignalTableCacheState()).toMatchObject({ size: EXPECTED_SIGNAL_TABLE_CACHE_SIZE, builds: start.builds + 2 });
    for (let k = 0; k < 20; k++) createDisplayViewExpectedSignal(variant(10 + k));
    expect(expectedSignalTableCacheState().size).toBe(EXPECTED_SIGNAL_TABLE_CACHE_SIZE);
    // Radiance scenes: built per input object, never kept by content.
    const radiance = (): DisplayViewExpectedSignalInput => ({ ...input(true), scene: { kind: "radiance", radianceAt: (u, v, nm) => 0.01 * (1.5 + Math.sin(9 * u + nm / 100) * Math.cos(7 * v)) } });
    clearExpectedSignalTableCache();
    const r0 = expectedSignalTableCacheState();
    const first = bits(sequential(createDisplayViewExpectedSignal(radiance()))), second = bits(sequential(createDisplayViewExpectedSignal(radiance())));
    expect(second).toBe(first);
    expect(expectedSignalTableCacheState()).toMatchObject({ size: 0, builds: r0.builds + 2, hits: r0.hits });
  });
});

/** SHA-256 of a capture's RAW codes, samples, diagnostics without timings and assumptions. */
function captureHash(result: SimulateCaptureResult): string {
  const diagnostics: Partial<SimulateCaptureResult["diagnostics"]> = { ...result.diagnostics };
  delete diagnostics.timingsMs;
  const hash = createHash("sha256");
  for (const a of [result.raw.codes, result.image.samples]) hash.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  return hash.update(JSON.stringify([diagnostics, result.assumptions])).digest("hex");
}
function viewHash(result: DisplayViewResult): string {
  const diagnostics: Partial<DisplayViewResult["diagnostics"]> = { ...result.diagnostics };
  delete diagnostics.timingsMs;
  return createHash("sha256").update(Buffer.from(result.image.samples.buffer, result.image.samples.byteOffset, result.image.samples.byteLength))
    .update(JSON.stringify([diagnostics, result.assumptions])).digest("hex");
}

// A caller material scene (the app's shape, scaled down) with the Quality options: diffraction, four-spot anti-aliasing, the box.
const stripes = (p: { u: number; v: number; chartU?: number; chartV?: number }): number => {
  const u = p.chartU ?? p.u, v = p.chartV ?? p.v;
  return u < -0.4 && v < -0.3 ? 3 + (Math.floor(u * 40) & 1) : (Math.floor(6 * u) + Math.floor(6 * v)) & 1 ? 1 : (u * u + v * v < 0.2 ? 2 : 0);
};
const QUALITY: SimulateCaptureOptions = {
  scene: { kind: "material-function", sceneId: "test:table-cache", materials: [0.18, 0.7, 0.05, 0.85, 0.06], materialAt: stripes },
  chartSize: { widthM: 0.12, heightM: 0.08 }, subjectDistanceM: 0.5,
  lens: { prime: 50, fNumber: 11, diffraction: "circular-aperture" }, exposure: { mode: "manual", iso: 100, shutterSeconds: 1 / 125 },
  sensor: { pixelPitchMicrometers: 6, pixelAperture: { kind: "box", samplesPerAxis: 2 }, antiAliasing: { kind: "four-spot" } },
  output: { width: 96, height: 64, format: "srgb-8", demosaic: "ahd" }
};
const at = (options: SimulateCaptureOptions, region: { x: number; y: number; width: number; height: number }): SimulateCaptureOptions => ({ ...options, output: { ...options.output!, region } });
const A = { x: 40, y: 24, width: 16, height: 12 }, B = { x: 8, y: 40, width: 20, height: 14 };
/** The capture with its tables built afresh. */
async function coldCapture(options: SimulateCaptureOptions): Promise<string> { clearExpectedSignalTableCache(); return captureHash(await simulateCapture(options)); }

describe("expected-signal tables through simulateCapture (#449)", () => {
  it("region parts of one request build the tables once, with the bytes of a cold run", async () => {
    clearExpectedSignalTableCache();
    const s0 = expectedSignalTableCacheState();
    await simulateCapture(at(QUALITY, A));
    const s1 = expectedSignalTableCacheState();
    expect(s1.builds).toBe(s0.builds + 1);
    const second = captureHash(await simulateCapture(at(QUALITY, B)));
    expect(expectedSignalTableCacheState()).toMatchObject({ builds: s1.builds, hits: s1.hits + 1 });
    expect(second).toBe(await coldCapture(at(QUALITY, B)));
  }, testTimeout(120_000));

  const changed: [string, SimulateCaptureOptions][] = [
    ["f-number", { ...QUALITY, lens: { ...QUALITY.lens!, fNumber: 8 } }],
    ["pixel pitch", { ...QUALITY, sensor: { ...QUALITY.sensor!, pixelPitchMicrometers: 5 } }],
    ["wavelength set", { ...QUALITY, sensor: { ...QUALITY.sensor!, spectralStepNanometers: 25 } }],
    ["material list", { ...QUALITY, scene: { kind: "material-function", sceneId: "test:table-cache", materials: [0.18, 0.7, 0.05, 0.85, 0.07], materialAt: stripes } }]
  ];
  it.each(changed)("a changed %s misses and matches a cold run bit for bit", async (_, options) => {
    clearExpectedSignalTableCache();
    await simulateCapture(at(QUALITY, A));
    const before = expectedSignalTableCacheState();
    const warm = captureHash(await simulateCapture(at(options, B)));
    expect(expectedSignalTableCacheState()).toMatchObject({ builds: before.builds + 1, hits: before.hits });
    expect(warm).toBe(await coldCapture(at(options, B)));
  }, testTimeout(120_000));

  it("two captures and a display view awaited together give the bytes of sequential runs", async () => {
    const view = { width: 32, height: 21, region: { x: 10, y: 6, width: 12, height: 9 } };
    clearExpectedSignalTableCache();
    const sequentialA = captureHash(await simulateCapture(at(QUALITY, A))), sequentialB = captureHash(await simulateCapture(at(QUALITY, B)));
    const sequentialView = viewHash(await (await prepareDisplayView(QUALITY)).render(view));
    const prepared = await prepareDisplayView(QUALITY);
    const before = expectedSignalTableCacheState();
    const [a, b, v] = await Promise.all([simulateCapture(at(QUALITY, A)), simulateCapture(at(QUALITY, B)), prepared.render(view)]);
    expect(expectedSignalTableCacheState().hits).toBeGreaterThanOrEqual(before.hits + 2);
    expect(captureHash(a)).toBe(sequentialA);
    expect(captureHash(b)).toBe(sequentialB);
    expect(viewHash(v)).toBe(sequentialView);
  }, testTimeout(180_000));
});
