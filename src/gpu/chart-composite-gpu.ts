// SPDX-License-Identifier: Apache-2.0

/**
 * Host side of the composite-chart radiance kernel (#477, wgsl-chart-composite-kernel.ts): packs a resolved
 * chart's geometry (`chartGeometry`) and a declared scene's mask layers into the kernel's record arrays,
 * keeps the packed records and their GPU buffers per scene so a prepared view uploads them once, probes the
 * device's double-float32 arithmetic, dispatches in bands, and recomputes flagged points with the float64
 * reference. Internal; the public entry point is `ImageKernelAccelerator.evaluateChartRadiance`.
 */
import { createHostYieldGate } from "../capture/host-yield-cadence.js";
import type { ChartRadianceBatchPlan } from "../facade/chart-radiance-batch.js";
import { chartGeometry, type ChartGeometry, type ResolvedChartScene } from "../facade/chart-scenes.js";
import type { ResolvedChartMaskLayer } from "../facade/chart-material-layers.js";
import { ImageKernelExecutionError, webGpuExecution, type ImageKernelExecution } from "./image-kernel-execution.js";
import type { ChartRadianceResult } from "./image-kernel-accelerator.js";
import { BUFFER_USAGE, GpuResourceScope, abortedError, linearDispatch, runComputePass, type WebGpuRuntime } from "./webgpu-runtime.js";
import { CHART_COMPOSITE_LABEL, CHART_COMPOSITE_PROBE_LABEL, CHART_COMPOSITE_PROBE_WGSL, CHART_COMPOSITE_WGSL, CHART_COMPOSITE_WORKGROUP_SIZE, CHART_ELEMENT_KIND,
  CHART_PLACEMENT, CHART_RECORD_STRIDE } from "./wgsl-chart-composite-kernel.js";

type PipelineSource = (label: string, code: string) => Promise<GPUComputePipeline>;
type YieldControl = ((signal: AbortSignal) => Promise<void>) | undefined;

const f = Math.fround;
const FLOAT32_SAFE_MAGNITUDE = 2 ** 120;
/** Frame-unit magnitude limit for GPU points (shared with the preset kernel). */
const MAXIMUM_COORDINATE = 2 ** 20;
/** The rough angle's allowance when the star's sector window is sized: the WGSL atan2 bound (4096 ULP, about 2^-10 rad) with a 4× margin. */
const STAR_ANGLE_ALLOWANCE = 2 ** -8;

// --- double-float32 in JavaScript (Math.fround after every operation): the probe's expected values and the test emulation ---
export type Dw = readonly [hi: number, lo: number];
export function dwSplit(x: number): Dw { const hi = f(x), lo = f(x - hi); return [hi, lo]; }
export function twoSum(a: number, b: number): Dw { const s = f(a + b), bb = f(s - a); return [s, f(f(a - f(s - bb)) + f(b - bb))]; }
export function quickTwoSum(a: number, b: number): Dw { const s = f(a + b); return [s, f(b - f(s - a))]; }
function veltkamp(a: number): Dw { const t = f(4097 * a), h = f(t - f(t - a)); return [h, f(a - h)]; }
export function twoProd(a: number, b: number): Dw {
  const p = f(a * b), [ah, al] = veltkamp(a), [bh, bl] = veltkamp(b);
  const e = f(f(f(f(f(ah * bh) - p) + f(ah * bl)) + f(al * bh)) + f(al * bl));
  return [p, e];
}
export function dwAdd(a: Dw, b: Dw): Dw {
  const s = twoSum(a[0], b[0]), t = twoSum(a[1], b[1]);
  const c = f(s[1] + t[0]), v = quickTwoSum(s[0], c);
  const w = f(v[1] + t[1]);
  return quickTwoSum(v[0], w);
}
export function dwSub(a: Dw, b: Dw): Dw { return dwAdd(a, [-b[0], -b[1]]); }
export function dwMul(a: Dw, b: Dw): Dw {
  const p = twoProd(a[0], b[0]), t = f(f(a[0] * b[1]) + f(a[1] * b[0])), l = f(p[1] + t);
  return quickTwoSum(p[0], l);
}

/**
 * Probe inputs (x, y, z, w): pairs whose TwoSum and TwoProduct low parts are non-zero, double words to add and multiply, and sums and
 * products that a directed (truncating or upward) rounding would place on the other neighbour than round-to-nearest: 1 + 3·2^-26
 * rounds up to 1 + 2^-23 (nearest) but down to 1 (truncation); −1 − 3·2^-26 the mirror; 1.25 · (1 + 2^-23) likewise.
 */
export const PROBE_INPUTS: readonly (readonly [number, number, number, number])[] = Object.freeze([
  [1, 2 ** -30, 1.5, 2 ** -29], [3.7, 1e-8, -2.25, 3e-9], [0.1, 0.7, 12345.678, -0.0001], [1e6, 1e-3, 1e-6, 1e-9], [-5.5, 2 ** -26, 7, -(2 ** -27)],
  [0.3333333, 0.6666667, 1.0000001, 0.99999994], [1024.5, 1e-5, 0.0078125, 3e-10], [2.5e-3, 4.1e-11, 999.75, 2 ** -40],
  [1, 3 * 2 ** -26, 1.25, 1 + 2 ** -23], [-1, -3 * 2 ** -26, -1.25, 1 + 2 ** -23], [1 + 2 ** -23, 1.25, 1, 5 * 2 ** -26], [0.75, 2 ** -25 + 2 ** -27, 3, 2 ** -24 + 2 ** -26]
]);
/** The probe's expected output (s.l, m.l, a.l, q.l) per input, from the JavaScript double-float32. */
export function probeExpectation(input: readonly [number, number, number, number]): [number, number, number, number] {
  const [x, y, z, w] = input.map(f) as [number, number, number, number];
  return [twoSum(x, y)[1], twoProd(x, y)[1], dwAdd([x, y], [z, w])[1], dwMul([x, y], [z, w])[1]];
}

/** Packed records of one scene: the kernel's float and integer arrays and its material count. */
export interface PackedChartScene { af: Float32Array<ArrayBuffer>; ai: Uint32Array<ArrayBuffer>; materials: number; elementCount: number; layerCount: number }

class Packer {
  readonly af: number[] = [];
  readonly ai: number[] = [];
  floats(values: readonly number[]): number { const at = this.af.length; for (const x of values) this.af.push(x); return at; }
  ints(values: readonly number[]): number { const at = this.ai.length; for (const x of values) this.ai.push(x); return at; }
  reserveInts(count: number): number { const at = this.ai.length; for (let i = 0; i < count; i++) this.ai.push(0); return at; }
}

/** Sector boundary table of a Siemens star (bar or sine profile): directions, per-sector levels from the reference, bucket index and search window. */
export function starSectorTable(chart: ResolvedChartScene, g: Extract<ChartGeometry, { kind: "siemens-star" }>):
  { thetas: Float64Array; levels: Uint32Array; buckets: Uint32Array; window: number } {
  const set = new Set<number>(), normalize = (t: number): number => { let x = t; while (x <= -Math.PI) x += 2 * Math.PI; while (x > Math.PI) x -= 2 * Math.PI; return x; };
  if (g.profile === "bar") {
    for (let k = 1; k <= 2 * g.cycles; k++) set.add(normalize(Math.PI * (k / g.cycles - 1)));
  } else {
    for (let L = 1; L < 1024; L++) {
      const a = Math.asin(L / 512 - 1);
      for (let m = 0; m < g.cycles; m++) { set.add(normalize((a + 2 * Math.PI * m) / g.cycles - Math.PI)); set.add(normalize((Math.PI - a + 2 * Math.PI * m) / g.cycles - Math.PI)); }
    }
  }
  const thetas = Float64Array.from(set).sort(), n = thetas.length, rho = g.r / 2;
  const levels = new Uint32Array(n);
  for (let k = 0; k < n; k++) {
    const next = k + 1 < n ? thetas[k + 1]! : thetas[0]! + 2 * Math.PI, mid = (thetas[k]! + next) / 2;
    levels[k] = chart.materialAt(rho * Math.cos(mid), rho * Math.sin(mid));
  }
  const buckets = new Uint32Array(n);
  for (let j = 0; j < n; j++) {
    const start = -Math.PI + 2 * Math.PI * j / n;
    let lo = 0, hi = n;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (thetas[mid]! >= start) hi = mid; else lo = mid + 1; }
    buckets[j] = lo;
  }
  // The window: the most boundaries any angular interval of the allowance (plus two buckets) can hold, capped so the window spans under a half turn.
  const reach = STAR_ANGLE_ALLOWANCE + 4 * Math.PI / n;
  let window = 1;
  for (let k = 0; k < n; k++) {
    let count = 0;
    for (let i = 1; i <= n; i++) { const t = k + i < n ? thetas[k + i]! : thetas[(k + i) % n]! + 2 * Math.PI; if (t - thetas[k]! <= 2 * reach) count++; else break; }
    window = Math.max(window, count + 1);
  }
  window = Math.min(window, Math.max(0, Math.floor(n / 4) - 1));
  return { thetas, levels, buckets, window };
}

function packElement(p: Packer, chart: ResolvedChartScene, offset: number, header: number, placement: { mode: number; cu: number; cv: number; hw: number; hh: number; scale: number }): void {
  const g = chartGeometry(chart);
  const [cuH, cuL] = dwSplit(placement.cu), [cvH, cvL] = dwSplit(placement.cv), [sH, sL] = dwSplit(placement.scale);
  const foff = p.floats([cuH, cuL, cvH, cvL, placement.hw, placement.hh, sH, sL, 0, 0]);
  const kindName = g.kind === "composite" ? null : g.kind;
  if (kindName === null) throw new ImageKernelExecutionError("unsupported-on-backend", "A composite cannot be a composite element.");
  const kind = CHART_ELEMENT_KIND[kindName];
  let ioff = 0;
  switch (g.kind) {
    case "uniform": break;
    case "slanted-edge": p.floats([g.c, g.s]); break;
    case "siemens-star": {
      const table = starSectorTable(chart, g), n = table.thetas.length;
      const dirs: number[] = [];
      for (let k = 0; k < n; k++) { const t = table.thetas[k]!, c = dwSplit(Math.cos(t)), s = dwSplit(Math.sin(t)); dirs.push(c[0], c[1], s[0], s[1]); }
      p.floats([g.r * g.r]);
      const dirsOff = p.floats(dirs), levelsOff = p.ints(Array.from(table.levels)), bucketsOff = p.ints(Array.from(table.buckets));
      ioff = p.ints([n, dirsOff, levelsOff, bucketsOff, n, table.window, chart.materials.length - 1]);
      break;
    }
    case "step-wedge": ioff = p.ints([g.steps]); break;
    case "checkerboard": p.floats([g.size, chart.aspect]); break;
    case "point-grid": {
      p.floats([g.cellW, g.cellH, chart.aspect, g.radius * g.radius]);
      const centers = p.floats(g.centers.flatMap((c) => [c.u, c.v]));
      ioff = p.ints([g.columns, g.rows, centers]);
      break;
    }
    case "patches": p.floats([g.cellW, g.cellH, chart.aspect, g.gap / 2, 1 - g.gap / 2]); ioff = p.ints([g.columns, g.rows, g.count, g.backgroundIndex]); break;
    case "dead-leaves": {
      p.floats([g.u0, g.v0, g.cell]);
      const cells = g.nx * g.ny, csr = p.reserveInts(cells + 1), entries: number[] = [];
      for (let c = 0; c < cells; c++) {
        p.ai[csr + c] = entries.length;
        for (let e = g.head[c]!; e >= 0; e = g.next[e]!) entries.push(g.entryDisk[e]!);
      }
      p.ai[csr + cells] = entries.length;
      const entriesOff = p.ints(entries), disks: number[] = [];
      for (let d = 0; d < g.diskCount; d++) disks.push(g.X[d]!, g.Y[d]!, g.R2[d]!, g.level[d]!);
      const disksOff = p.floats(disks);
      ioff = p.ints([g.nx, g.ny, csr, entriesOff, disksOff, g.mean]);
      break;
    }
    case "bar-groups": {
      const digits: number[] = [], rows: number[] = [];
      for (const group of g.groups) {
        const b = group.verticalBars, h = group.horizontalBars, label = group.label;
        let digitIndex = 0;
        if (label) { digitIndex = digits.length; digits.push(label.text.length, ...Array.from(label.text, (ch) => ch.charCodeAt(0) - 48)); }
        rows.push(group.cell.u0, group.cell.u1, b.u0, b.v0, b.u1, b.v1, h.u0, h.v0, h.u1, h.v1, group.lineWidth, label ? 1 : 0,
          label?.u0 ?? 0, label?.v0 ?? 0, label?.height ?? 0, digitIndex);
      }
      const gf = p.floats(rows), digitsOff = p.ints(digits.length ? digits : [0]);
      ioff = p.ints([g.groups.length, gf, digitsOff]);
      break;
    }
    case "hyperbolic-wedge": p.floats([chart.aspect, g.ph, g.lw0, g.lw1 - g.lw0, 2 * chart.aspect]); ioff = p.ints([g.orientation === "horizontal" ? 0 : 1, g.lines]); break;
    case "zone-plate": { const [kH, kL] = dwSplit(g.k); p.floats([g.r * g.r, kH, kL]); break; }
    case "slanted-squares": p.floats([g.cellW, g.cellH, chart.aspect, g.c, g.s, g.half]); ioff = p.ints([g.columns, g.rows]); break;
    case "line-grid": p.floats([g.spacing, g.half]); break;
    case "fiducial": p.floats([g.r * g.r, g.inner * g.inner]); ioff = p.ints([g.inverted ? 1 : 0]); break;
    default: throw new ImageKernelExecutionError("unsupported-on-backend", "Unsupported chart element.");
  }
  p.ai[header] = kind; p.ai[header + 1] = offset; p.ai[header + 2] = ioff; p.ai[header + 3] = foff; p.ai[header + 4] = placement.mode;
}

function packLayer(p: Packer, layer: ResolvedChartMaskLayer, header: number): void {
  const r = layer.rectangle;
  const foff = p.floats([r.u0, r.v0, r.u1, r.v1, layer.scaleX, layer.scaleY, layer.cellWidth, layer.cellHeight]);
  const shapesOff = p.reserveInts(CHART_RECORD_STRIDE.shape * layer.shapes.length);
  layer.shapes.forEach((shape, k) => {
    const h = shapesOff + CHART_RECORD_STRIDE.shape * k;
    if (shape.kind === "annulus") {
      p.ai[h] = 1; p.ai[h + 1] = p.floats([...shape.box, shape.centerX, shape.centerY, shape.inner2, shape.outer2]); p.ai[h + 2] = 0;
    } else {
      const data = p.floats([...shape.box]), edges = shape.edges.length / 4;
      for (let e = 0; e < edges; e++) p.floats([shape.edges[4 * e]!, shape.edges[4 * e + 1]!, shape.edges[4 * e + 2]!, shape.edges[4 * e + 3]!]);
      p.ai[h] = 0; p.ai[h + 1] = data; p.ai[h + 2] = edges;
    }
  });
  const cells = layer.cellsX * layer.cellsY, cellStart = p.reserveInts(cells + 1), list: number[] = [];
  for (let c = 0; c < cells; c++) { p.ai[cellStart + c] = list.length; list.push(...layer.cells[c]!); }
  p.ai[cellStart + cells] = list.length;
  const cellList = p.ints(list.length ? list : [0]);
  const words = [layer.cellsX, layer.cellsY, cellStart, cellList, shapesOff, layer.shapes.length, foff, layer.backgroundMaterial, layer.inkMaterial];
  words.forEach((w, i) => { p.ai[header + i] = w; });
}

/** Packs the plan's chart (a composite, an element preset, or the chart under layers) and its layers into the kernel's record arrays. */
export function packChartScene(plan: ChartRadianceBatchPlan): PackedChartScene {
  const p = new Packer(), chart = plan.chart, g = chartGeometry(chart), layers = plan.layers?.layers ?? [];
  const elements = g.kind === "composite" ? g.elements : [];
  const elementCount = elements.length + 1;
  p.reserveInts(4);
  const he = p.reserveInts(CHART_RECORD_STRIDE.element * elementCount), hl = p.reserveInts(CHART_RECORD_STRIDE.layer * layers.length);
  const frame = { mode: CHART_PLACEMENT.frame, cu: 0, cv: 0, hw: 0, hh: 0, scale: 1 };
  packElement(p, g.kind === "composite" ? g.background : chart, 0, he, frame);
  elements.forEach((e, i) => packElement(p, e.chart, e.offset, he + CHART_RECORD_STRIDE.element * (i + 1),
    { mode: e.ellipse ? CHART_PLACEMENT.ellipse : CHART_PLACEMENT.rectangle, cu: e.cu, cv: e.cv, hw: e.hw, hh: e.hh, scale: e.scale }));
  layers.forEach((layer, l) => packLayer(p, layer, hl + CHART_RECORD_STRIDE.layer * l));
  p.ai[0] = elementCount; p.ai[1] = layers.length; p.ai[2] = he; p.ai[3] = hl;
  for (const x of p.af) if (!(Math.abs(x) <= FLOAT32_SAFE_MAGNITUDE)) throw new ImageKernelExecutionError("unsupported-float32-domain", "A chart constant exceeds the float32 domain.");
  for (const x of p.ai) if (!(Number.isInteger(x) && x >= 0 && x <= 0xffffffff)) throw new ImageKernelExecutionError("unsupported-on-backend", "Chart records exceed the kernel's index range.");
  return { af: Float32Array.from(p.af), ai: Uint32Array.from(p.ai), materials: plan.materials.length, elementCount, layerCount: layers.length };
}

/** Per-material values in float64 (the reference's operations), rounded once; a failing spectrum is NaN and its points are recomputed. */
export function chartMaterialTable(plan: ChartRadianceBatchPlan): Float32Array<ArrayBuffer> {
  const nm = plan.wavelengthsNanometers, stride = plan.mode === "radiance" ? nm.length : plan.columns, materials = plan.materials.length;
  const table = new Float32Array(materials * stride);
  for (let m = 0; m < materials; m++) {
    for (let c = 0; c < stride; c++) {
      let value: number;
      try {
        if (plan.mode === "radiance") value = plan.materialRadiance(m, nm[c]!);
        else { value = 0; const row = plan.channelWeights![c]!; for (let j = 0; j < nm.length; j++) value += row[j]! * plan.materialRadiance(m, nm[j]!); }
      } catch { value = Number.NaN; }
      if (Math.abs(value) > FLOAT32_SAFE_MAGNITUDE) throw new ImageKernelExecutionError("unsupported-float32-domain", "Chart values exceed the float32 domain.");
      table[m * stride + c] = value;
    }
  }
  return table;
}

/** The scene key of a batch input: the scene's data and the aspect (every record derives from them). */
export function chartSceneKey(scene: unknown, aspect: number): string { return aspect + "|" + JSON.stringify(scene); }

/**
 * The device's double-float32 probe (`CHART_COMPOSITE_PROBE_WGSL`): rejects with `unsupported-on-backend` on a device whose
 * compiled arithmetic differs from the round-to-nearest, written-order evaluation. Run once per accelerator by
 * `ChartSceneUploads.probe`, and once per display-view renderer by the composite material module (#491).
 */
export async function probeChartCompositeDevice(runtime: WebGpuRuntime, pipelines: PipelineSource, signal: AbortSignal): Promise<void> {
  const pipeline = await pipelines(CHART_COMPOSITE_PROBE_LABEL, CHART_COMPOSITE_PROBE_WGSL), scope = new GpuResourceScope(runtime);
  try {
    const input = scope.upload("photivra-chart-probe-in", Float32Array.from(PROBE_INPUTS.flat()), BUFFER_USAGE.STORAGE);
    const output = scope.buffer("photivra-chart-probe-out", 16 * PROBE_INPUTS.length, BUFFER_USAGE.STORAGE | BUFFER_USAGE.COPY_SRC);
    const bindGroup = runtime.device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: input } }, { binding: 1, resource: { buffer: output } }] });
    const [data] = await runComputePass(runtime, scope, pipeline, bindGroup, [PROBE_INPUTS.length, 1], [{ buffer: output, bytes: 16 * PROBE_INPUTS.length }], signal);
    const got = new Float32Array(data!, 0, 4 * PROBE_INPUTS.length);
    PROBE_INPUTS.forEach((row, i) => {
      const want = probeExpectation(row);
      for (let k = 0; k < 4; k++) {
        if (!Object.is(got[4 * i + k], want[k])) {
          throw new ImageKernelExecutionError("unsupported-on-backend", "This device does not evaluate the composite chart kernel's double-float32 arithmetic as written (reassociated or fused); use cpu-reference for composite charts, 2.3 elements and material-layers scenes.");
        }
      }
    });
  } finally { scope.release(); }
}

interface UploadedScene { key: string; scope: GpuResourceScope; af: GPUBuffer; ai: GPUBuffer; packed: PackedChartScene }

/** Per accelerator: the uploaded records of recent scenes (a prepared view's scene is uploaded once) and the device probe. */
export class ChartSceneUploads {
  readonly #entries: UploadedScene[] = [];
  #probed: Promise<void> | null = null;
  constructor(private readonly runtime: WebGpuRuntime, private readonly keep = 4) {}
  /** The device's double-float32 probe, run once per accelerator; rejects with `unsupported-on-backend` on a device that reassociates it. */
  probe(pipelines: PipelineSource, signal: AbortSignal): Promise<void> {
    this.#probed ??= probeChartCompositeDevice(this.runtime, pipelines, signal).catch((error: unknown) => { this.#probed = null; throw error; });
    return this.#probed;
  }
  get(plan: ChartRadianceBatchPlan, scene: unknown, aspect: number): UploadedScene {
    const key = chartSceneKey(scene, aspect), index = this.#entries.findIndex((e) => e.key === key);
    if (index >= 0) { const [entry] = this.#entries.splice(index, 1); this.#entries.push(entry!); return entry!; }
    const packed = packChartScene(plan);
    if (Math.max(packed.af.byteLength, packed.ai.byteLength) > this.runtime.maximumStorageBindingBytes) {
      throw new ImageKernelExecutionError("insufficient-limits", "Chart records exceed the device's storage binding limit.");
    }
    const scope = new GpuResourceScope(this.runtime);
    const entry: UploadedScene = { key, scope, af: scope.upload("photivra-chart-floats", packed.af, BUFFER_USAGE.STORAGE), ai: scope.upload("photivra-chart-records", packed.ai, BUFFER_USAGE.STORAGE), packed };
    this.#entries.push(entry);
    while (this.#entries.length > this.keep) this.#entries.shift()!.scope.release();
    return entry;
  }
  /** Scenes currently uploaded (for tests). */
  get size(): number { return this.#entries.length; }
  release(): void { for (const entry of this.#entries.splice(0)) entry.scope.release(); }
}

function checkAbort(signal: AbortSignal): void { if (signal.aborted) throw abortedError(); }

/** Points as float32 pairs (hi, lo) per coordinate: the float64 point to 2^-48. */
export function splitPoints(points: Float32Array | Float64Array): Float32Array<ArrayBuffer> {
  const out = new Float32Array(points.length * 2);
  for (let i = 0; i < points.length; i++) { const hi = f(points[i]!); out[2 * i] = hi; out[2 * i + 1] = f(points[i]! - hi); }
  return out;
}

export async function evaluateChartCompositeOnGpu(runtime: WebGpuRuntime, bandBytes: number, plan: ChartRadianceBatchPlan, scene: unknown, points: Float32Array | Float64Array,
  indices: Uint8Array | Uint16Array | undefined, abort: AbortController, yieldControl: YieldControl, pipelines: PipelineSource, uploads: ChartSceneUploads): Promise<ChartRadianceResult> {
  for (let i = 0; i < points.length; i++) {
    if (Math.abs(points[i]!) > MAXIMUM_COORDINATE) throw new ImageKernelExecutionError("unsupported-float32-domain", "Chart points beyond 2^20 frame units are outside the float32 domain.");
  }
  await uploads.probe(pipelines, abort.signal);
  const uploaded = uploads.get(plan, scene, plan.chart.aspect), table = chartMaterialTable(plan), radianceMode = plan.mode === "radiance";
  const columns = plan.columns, stride = radianceMode ? plan.wavelengthsNanometers.length : columns, count = plan.queryCount;
  const bytesPerQuery = 16 + 4 * columns + 4 + 4, rows = Math.max(1, Math.floor(bandBytes / bytesPerQuery));
  if (Math.max(table.byteLength, Math.min(rows, count) * 4 * columns) > runtime.maximumStorageBindingBytes) {
    throw new ImageKernelExecutionError("insufficient-limits", "Chart tables or bands exceed the device's storage binding limit.");
  }
  const params = new ArrayBuffer(16), words = new Uint32Array(params);
  words[1] = stride; words[2] = radianceMode ? 1 : 0;
  const pipeline = await pipelines(CHART_COMPOSITE_LABEL, CHART_COMPOSITE_WGSL);
  const values = new Float32Array(count * columns), recomputed: number[] = [], split = splitPoints(points);
  const scope = new GpuResourceScope(runtime);
  try {
    const tableBuffer = scope.upload("photivra-chart-table", table, BUFFER_USAGE.STORAGE), gate = createHostYieldGate();
    for (let first = 0; first < count; first += rows) {
      checkAbort(abort.signal);
      const n = Math.min(rows, count - first);
      words[0] = n;
      const band = new GpuResourceScope(runtime);
      try {
        const pointBuffer = band.upload("photivra-chart-points", split.subarray(4 * first, 4 * (first + n)), BUFFER_USAGE.STORAGE);
        const selectors = band.upload("photivra-chart-selectors", indices ? Uint32Array.from(indices.subarray(first, first + n)) : new Uint32Array(1), BUFFER_USAGE.STORAGE);
        const out = band.buffer("photivra-chart-values", n * 4 * columns, BUFFER_USAGE.STORAGE | BUFFER_USAGE.COPY_SRC);
        const flagBuffer = band.buffer("photivra-chart-flags", n * 4, BUFFER_USAGE.STORAGE | BUFFER_USAGE.COPY_SRC);
        const uniform = band.upload("photivra-chart-params", new Uint8Array(params), BUFFER_USAGE.UNIFORM);
        const bindGroup = runtime.device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [
          { binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: { buffer: pointBuffer } }, { binding: 2, resource: { buffer: tableBuffer } },
          { binding: 3, resource: { buffer: uploaded.af } }, { binding: 4, resource: { buffer: uploaded.ai } }, { binding: 5, resource: { buffer: selectors } },
          { binding: 6, resource: { buffer: out } }, { binding: 7, resource: { buffer: flagBuffer } }] });
        const [valueData, flagData] = await runComputePass(runtime, band, pipeline, bindGroup, linearDispatch(n, CHART_COMPOSITE_WORKGROUP_SIZE, runtime.maximumWorkgroupsPerDimension),
          [{ buffer: out, bytes: n * 4 * columns }, { buffer: flagBuffer, bytes: n * 4 }], abort.signal);
        values.set(new Float32Array(valueData!, 0, n * columns), first * columns);
        const bandFlags = new Uint32Array(flagData!, 0, n);
        for (let i = 0; i < n; i++) {
          let recompute = bandFlags[i] !== 0;
          for (let c = 0; c < columns && !recompute; c++) if (!Number.isFinite(values[(first + i) * columns + c]!)) recompute = true;
          if (recompute) recomputed.push(first + i);
        }
      } finally { band.release(); }
      if (yieldControl && gate.due()) { await yieldControl(abort.signal); gate.restart(); }
    }
  } finally { scope.release(); }
  checkAbort(abort.signal);
  for (const q of recomputed) for (let c = 0; c < columns; c++) values[q * columns + c] = plan.queryValue(points, indices, q, c);
  const execution: ImageKernelExecution = webGpuExecution({ kind: "relative-to-reference", relative: 2 ** -24, absolute: 2 ** -126 }, 0);
  return { plan, values, columns, execution, hostRecomputedQueryIndices: Uint32Array.from(recomputed) };
}
