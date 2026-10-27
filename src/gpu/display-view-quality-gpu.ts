// SPDX-License-Identifier: Apache-2.0

/**
 * Host side of the display view's Quality path on the GPU (#479): the support check, the float64 tables (the lattice groups
 * and their combined diffraction kernels per material and channel, as the reference forms them; the bilinear and AHD
 * candidate kernels; the footprint geometry), the three passes per band of display rows (lattice materials, site moments,
 * display pixels; `wgsl-display-view-quality-kernel.ts`), the low-signal correction states (computed on the host with the
 * reference's own `computeDisplayViewCorrectionStates`, #447, uploaded as a sorted table and grown from the grid keys the
 * kernel records), and the reference's own float64 finishing per display pixel (`finishDisplayViewPixel` of the Speed host:
 * the quantization term, the seeded noise draw, the Cholesky factor, the clipped centre, the sRGB encode and the rounding),
 * so the noise draw is bit-identical to the CPU's.
 *
 * The float64 reference is `renderDisplayView` (facade/display-view.ts) on the exact-area-mean path with
 * `createDisplayViewExpectedSignal` (facade/expected-signal.ts), chart materials, with or without diffraction kernels,
 * the bilinear or the AHD candidates and the low-signal correction. Internal: not exported from the package.
 *
 * Flagged display pixels (an uncertain lattice material among the sites read, a missing correction state after the
 * states were computed, a correction-threshold decision within its bound, a non-finite output) are recomputed with the
 * reference, so they are exact. Every stage's wall-clock time is reported (`stageMilliseconds`); on a software adapter it
 * is not GPU performance.
 */
import { AHD_KEY_LEVELS, EXACT_AREA_MEAN_MAX_PIXELS, axisSums, computeDisplayViewCorrectionStates, createDisplayViewExpectedSignal, displayViewCorrectionKey, overlaps, renderDisplayView,
  ahdCandidateKernels, type AxisSums, type DisplayViewCorrectionSetup, type DisplayViewKernelTap, type DisplayViewRenderResult, type DisplayViewSetup } from "../facade/display-view.js";
import { displayViewSignalTables, type DisplayViewExpectedSignalInput, type GroupTables } from "../facade/expected-signal.js";
import type { DisplayViewGpuSetup } from "../facade/display-view.js";
import { resolvePortableChartScene } from "../facade/chart-scenes.js";
import { createDisplayViewMaterialModules, type DisplayViewMaterialModules } from "./display-view-composite-material-module.js";
import { setDisplayViewGpuRendererFactory, type DisplayViewGpuConformanceCase, type DisplayViewGpuPart, type DisplayViewGpuRenderOutput, type DisplayViewGpuRenderer,
  type DisplayViewGpuRendererFactory, type DisplayViewGpuRequest, type DisplayViewGpuRuntimeHandle } from "../facade/display-view-gpu.js";
import { chartPresetMaterialModule } from "./display-view-chart-material-module.js";
import { DISPLAY_VIEW_SPEED_CONFORMANCE_CASE, axisRecord, displayViewSpeedGpuSupports, displayViewSpeedGpuUnsupportedReason, finishDisplayViewPixel, gaussLegendre16, queryGeometry,
  renderDisplayViewSpeedOnGpu, type DisplayViewGpuMaterialModule } from "./display-view-speed-gpu.js";
import { createHostYieldGate } from "../capture/host-yield-cadence.js";
import { ImageKernelExecutionError, WEBGPU_F32_UNIT_ROUNDOFF, webGpuExecution, type ImageKernelExecution, type ImageKernelRelativeErrorBound } from "./image-kernel-execution.js";
import { BUFFER_USAGE, GpuResourceScope, abortedError, createComputePipeline, linearDispatch, runComputePass, type WebGpuRuntime } from "./webgpu-runtime.js";
import { DISPLAY_VIEW_QUALITY_AUX, DISPLAY_VIEW_QUALITY_BITMAP_WORDS, DISPLAY_VIEW_QUALITY_CANDIDATE_ENTRIES, DISPLAY_VIEW_QUALITY_CANDIDATE_FLOATS, DISPLAY_VIEW_QUALITY_FLAG,
  DISPLAY_VIEW_QUALITY_GEOMETRY_STRIDE, DISPLAY_VIEW_QUALITY_GROUP_WORDS, DISPLAY_VIEW_QUALITY_MAXIMUM_PIXELS_PER_AXIS, DISPLAY_VIEW_QUALITY_OUTPUT_FLOATS, DISPLAY_VIEW_QUALITY_PARAM_WORDS,
  DISPLAY_VIEW_QUALITY_PIXELS_WGSL, DISPLAY_VIEW_QUALITY_SITES_WGSL, DISPLAY_VIEW_QUALITY_SITE_FLOATS, DISPLAY_VIEW_QUALITY_TAP_WORDS, DISPLAY_VIEW_QUALITY_WORKGROUP_SIZE,
  assembleDisplayViewQualityLatticeWgsl } from "./wgsl-display-view-quality-kernel.js";

type PipelineSource = (label: string, code: string) => Promise<GPUComputePipeline>;
type YieldControl = ((signal: AbortSignal) => Promise<void>) | undefined;

/** One WGSL rounding of + − × in either direction (W3C WGSL "Floating Point Accuracy"; #471, #487): twice the binary32 unit roundoff. */
const E = 2 * WEBGPU_F32_UNIT_ROUNDOFF;
/** Every reported bound is doubled: the kernel's running bounds are first order, and their own float32 arithmetic rounds. */
const MARGIN = 2;
/** The reference's own float64 rounding of its chains, relative. */
const CPU_RELATIVE = 2 ** -40;
/** Table values above this are outside the float32 domain. */
const FLOAT32_SAFE_MAGNITUDE = 2 ** 120;
/** Largest demosaic reach (AHD's candidates read 3 sites away) and lattice group count the tables hold. */
const MAXIMUM_REACH = 3, MAXIMUM_GROUPS = 64;
/** Candidate table entries per phase: the (2·reach + 1)² window. */
const WINDOW_SLOTS = (2 * MAXIMUM_REACH + 1) ** 2;
/**
 * The host's output quantization term q(m) = s(e)²·Δ²/12 (`quantizationVariance`, s the sRGB EOTF's slope at the encoded mean e)
 * is evaluated at the GPU's mean, so it moves with the mean's error: dq/dm = 2·s′(e)·Δ²/12 (de/dm = 1/s), with
 * s′(e) = (2.4/1.055)·(1.4/1.055)·((e + 0.055)/1.055)^0.4 ≤ 3.02 on [0, 1] and 0 on the linear segment and outside [0, 1];
 * q is non-decreasing in m, with a jump of (s₊² − s₋²)·Δ²/12 ≤ 2.1·10⁻⁴·Δ²/12 at the segment join (linear m = 0.0031308).
 */
const QUANTIZATION_SLOPE = 6.04, QUANTIZATION_JOIN_JUMP = 2.1e-4, QUANTIZATION_JOIN = 0.0031308;
/** Bytes per display pixel in the output buffers (moments plus the flag word). */
const OUTPUT_BYTES_PER_PIXEL = 4 * DISPLAY_VIEW_QUALITY_OUTPUT_FLOATS + 4;
const SITE_BYTES = 4 * DISPLAY_VIEW_QUALITY_SITE_FLOATS;

/** What a GPU render of a Quality display view needs: the reference's own setup and expected-signal input, plus the material module. */
export interface DisplayViewQualityGpuInput {
  setup: DisplayViewSetup;
  signalInput: DisplayViewExpectedSignalInput;
  material: DisplayViewGpuMaterialModule;
  /** Recompute flagged display pixels with the reference. Default true. */
  recomputeFlagged?: boolean;
  /** The states this renderer holds for the setup's correction key (grown by the render); a fresh store when absent. */
  states?: CorrectionStateStore;
}

/** Wall-clock milliseconds per stage of one render (upload, dispatch and readback of each pass; host work apart). */
export interface DisplayViewQualityStageTimings {
  /** Pass 1: the lattice materials (the material module per lattice point). */
  lattice: number;
  /** Pass 2: the site electrons through the combined kernels, the readout moments and the white clip. */
  sites: number;
  /** Pass 3: the display pixels (demosaic candidates, development, covariance, correction), every dispatch of it. */
  pixels: number;
  /** The low-signal correction states computed on the host (the reference's own draws) and the table uploads. */
  states: number;
  /** The host finishing (quantization term, noise draw, Cholesky, encode) of every display pixel. */
  finishing: number;
  /** The reference's recomputation of flagged display pixels. */
  recompute: number;
  /** Pass 3 dispatches that were repeated because a correction state was missing. */
  pixelRedispatches: number;
}

/** A GPU Quality display view of one region: the reference's result fields plus the execution label, the bounds, the flags and the timings. */
export interface DisplayViewQualityGpuResult extends DisplayViewRenderResult {
  execution: ImageKernelExecution;
  /** |E_gpu − E_cpu| ≤ relative·|E_cpu| + absolute for every component of every display pixel (linear light); `absolute` is the largest per-pixel term. */
  expectedValueBound: ImageKernelRelativeErrorBound;
  /** |V_gpu − V_cpu| ≤ relative·V_cpu + absolute for every covariance entry (linear light squared). */
  varianceBound: ImageKernelRelativeErrorBound;
  /** Per display pixel: the absolute terms of the two bounds (the kernel's running bounds, doubled). */
  expectedValueAbsoluteBound: Float32Array;
  varianceAbsoluteBound: Float32Array;
  /** Display pixels (region row-major) the kernel flagged, and those the host recomputed with the reference. */
  flaggedPixelIndices: Uint32Array;
  hostRecomputedPixelIndices: Uint32Array;
  /** The kernel's flag word per display pixel (`DISPLAY_VIEW_QUALITY_FLAG` bits). */
  pixelFlags: Uint32Array;
  /** Correction states the render computed on the host (new to the store), and the states the table held at the end. */
  statesComputed: number;
  statesHeld: number;
  /** Taps per native site of the expected-signal gather (over every lattice group). */
  tapsPerSite: number;
  stageMilliseconds: DisplayViewQualityStageTimings;
}

/**
 * The low-signal correction states a renderer holds for one correction key, as the GPU table reads them: grid keys ascending
 * with three float32 values each (the host keeps the float64 values; the table is their single rounding).
 */
export class CorrectionStateStore {
  readonly #known = new Map<number, [number, number, number]>();
  #keys: Int32Array<ArrayBuffer> = new Int32Array(0);
  #values: Float32Array<ArrayBuffer> = new Float32Array(0);
  #dirty = false;
  get size(): number { return this.#known.size; }
  has(key: number): boolean { return this.#known.has(key); }
  add(gridKeys: Int32Array, values: Float64Array): void {
    for (let i = 0; i < gridKeys.length; i++) {
      if (this.#known.has(gridKeys[i]!)) continue;
      this.#known.set(gridKeys[i]!, [values[3 * i]!, values[3 * i + 1]!, values[3 * i + 2]!]);
      this.#dirty = true;
    }
  }
  /** The sorted table (rebuilt when states were added since the last call). */
  table(): { keys: Int32Array<ArrayBuffer>; values: Float32Array<ArrayBuffer> } {
    if (this.#dirty) {
      const keys = Int32Array.from(this.#known.keys()).sort(), values = new Float32Array(3 * keys.length);
      keys.forEach((key, i) => { const v = this.#known.get(key)!; values[3 * i] = v[0]; values[3 * i + 1] = v[1]; values[3 * i + 2] = v[2]; });
      this.#keys = keys; this.#values = values; this.#dirty = false;
    }
    return { keys: this.#keys, values: this.#values };
  }
}

function checkAbort(signal: AbortSignal): void {
  if (signal.aborted) throw abortedError();
}

/**
 * Waits until the queue has finished the work submitted so far (`GPUQueue.onSubmittedWorkDone`), so a pass that reads nothing
 * back is timed with its own execution, not the next pass's wait. The passes depend on each other in order anyway.
 */
async function queueIdle(runtime: WebGpuRuntime, signal: AbortSignal): Promise<void> {
  const queue = runtime.device.queue as { onSubmittedWorkDone?: () => Promise<undefined> };
  if (typeof queue.onSubmittedWorkDone === "function") await runtime.guard(queue.onSubmittedWorkDone(), signal);
}

/** The footprint shape of a view: real pixels per display pixel along each axis, and whether the exact area mean applies. */
function footprintShape(setup: DisplayViewSetup): { sx: number; sy: number; exact: boolean; maximumColumns: number; maximumRows: number } {
  const sx = setup.frameWidth / setup.viewWidth, sy = setup.frameHeight / setup.viewHeight, area = sx * sy;
  const exact = area <= Math.min(EXACT_AREA_MEAN_MAX_PIXELS, setup.samplesPerAxis * setup.samplesPerAxis);
  let maximumColumns = 0, maximumRows = 0;
  for (let i = 0; i < setup.region.width; i++) maximumColumns = Math.max(maximumColumns, overlaps((setup.region.x + i) * sx, (setup.region.x + i + 1) * sx, setup.frameWidth).w.length);
  for (let j = 0; j < setup.region.height; j++) maximumRows = Math.max(maximumRows, overlaps((setup.region.y + j) * sy, (setup.region.y + j + 1) * sy, setup.frameHeight).w.length);
  return { sx, sy, exact, maximumColumns, maximumRows };
}

/** The demosaic candidates of a setup (the bilinear kernels when it has none) and their reach in sites. */
function candidatesOf(setup: DisplayViewSetup): { candidates: readonly (readonly (readonly (readonly DisplayViewKernelTap[])[])[])[]; count: number; reach: number } {
  const candidates = setup.candidates ?? setup.demosaic.map((phase) => [phase]), count = candidates[0]?.length ?? 0;
  const reach = Math.max(1, ...candidates.flat(3).map((t) => Math.max(Math.abs(t.dx), Math.abs(t.dy))));
  return { candidates, count, reach };
}

/** Fractional bits of a float64 (the smallest b with c·2^b an integer), or Infinity beyond 60. */
function fractionalBits(c: number): number {
  for (let b = 0; b <= 60; b++) if (Number.isInteger(c * 2 ** b)) return b;
  return Infinity;
}
/** Whether p + c is exact in float32 for every integer p with |p| ≤ `span` (c has b fractional bits and |p + c| < 2^(24 − b)). */
function exactLatticeConstant(c: number, span: number): boolean {
  const b = fractionalBits(c);
  return Math.fround(c) === c && b <= 22 && span + Math.abs(c) + 1 < 2 ** (24 - b);
}

/**
 * Why the Quality kernels do not cover a request, or null when they do: chart materials, the exact area mean (footprints of
 * at most 25 real pixels and 6 per axis), the identity or positive Reinhard tone curve, demosaic candidates within 3 sites
 * (1 or 2 per phase), at most 64 lattice groups, lattice constants exact in float32, no collect pass, and a raster at least
 * 2·reach + 2 sites on each axis (so a reflected border site lies in the band's window).
 */
export function displayViewQualityGpuUnsupportedReason(setup: DisplayViewSetup, signalInput: DisplayViewExpectedSignalInput): string | null {
  if (signalInput.scene.kind !== "materials") return "radiance scenes (caller functions) are not on the GPU";
  if (!signalInput.kernels && !signalInput.queryPoint) return "the expected signal has no query points";
  if (setup.ahdCollect) return "a collect pass of the correction states runs on the CPU";
  if (setup.toneCurve !== "identity" && setup.toneCurve !== "positive-reinhard-per-channel") return "unsupported tone curve " + String(setup.toneCurve);
  if (setup.region.width < 1 || setup.region.height < 1) return "an empty region";
  if (signalInput.kernels && (signalInput.kernels.radius < 0 || signalInput.kernels.radius > 32)) return "a diffraction kernel radius above 32";
  const shape = footprintShape(setup);
  if (!shape.exact) return "the stratified estimator (footprints above 25 real pixels) is not on the GPU";
  if (shape.maximumColumns > DISPLAY_VIEW_QUALITY_MAXIMUM_PIXELS_PER_AXIS || shape.maximumRows > DISPLAY_VIEW_QUALITY_MAXIMUM_PIXELS_PER_AXIS)
    return "a footprint touches more than " + DISPLAY_VIEW_QUALITY_MAXIMUM_PIXELS_PER_AXIS + " real pixels along an axis";
  const { candidates, count, reach } = candidatesOf(setup);
  if (candidates.length !== 4 || (count !== 1 && count !== 2) || candidates.some((p) => p.length !== count || p.some((d) => d.length !== 3))) return "each CFA phase needs 1 or 2 demosaic candidates with a kernel per channel";
  if (reach > MAXIMUM_REACH) return "demosaic kernels reaching more than " + MAXIMUM_REACH + " sites";
  // The kernel treats a channel whose sites are all exactly at white as exact: its weights must sum exactly in float32 (dyadic, denominators to 256, magnitudes below 2^10).
  for (const t of candidates.flat(3)) if (!Number.isInteger(t.weight * 256) || Math.abs(t.weight) >= 1024) return "demosaic weights that are not dyadic rationals (denominators to 256)";
  for (let p = 0; p < 4; p++) for (let c = 0; c < 3; c++) {
    const taps = setup.demosaic[p]?.[c];
    if (!taps || taps.length < 1 || taps.length > 4 || taps.some((t) => Math.abs(t.dx) > 1 || Math.abs(t.dy) > 1)) return "the site-variance kernels are not the bilinear kernels (at most 4 taps within one site)";
  }
  if (setup.nativeWidth < 2 * reach + 2 || setup.nativeHeight < 2 * reach + 2) return "a raster smaller than 2·reach + 2 sites";
  const tables = displayViewSignalTables(signalInput);
  if (tables.groups.length < 1 || tables.groups.length > MAXIMUM_GROUPS) return "the kernel holds 1 to " + MAXIMUM_GROUPS + " lattice groups";
  const W = signalInput.nativeWidth, H = signalInput.nativeHeight, R = signalInput.kernels ? signalInput.kernels.radius : 0;
  if (!signalInput.kernels) {
    // Without diffraction the reference queries each offset's own point; the lattice pass forms it as (x + ix + c)·scale with the
    // group's shift, which is the same number only when ix + f equals the offset exactly (the grouping tolerates 1e-9).
    for (const group of tables.groups) for (const member of group.members) {
      const exact = signalInput.offsets.some((o) => o.x === member.ix + group.fx && o.y === member.iy + group.fy && o.weight === member.weight);
      if (!exact) return "a query offset that its lattice group does not reproduce exactly";
    }
  }
  for (const group of tables.groups) {
    const spanX = Math.max(Math.abs(group.minIx), Math.abs(group.maxIx)) + R + W, spanY = Math.max(Math.abs(group.minIy), Math.abs(group.maxIy)) + R + H;
    if (!exactLatticeConstant(0.5 + group.fx - W / 2, spanX) || !exactLatticeConstant(0.5 + group.fy - H / 2, spanY)) return "a query offset whose lattice constant is not exact in float32";
  }
  return null;
}

/** The lattice groups, taps and the value table of the expected signal (see the module comment). */
interface SignalGather {
  /** Per group: dpMin, dqMin, dpSpan, dqSpan (lattice extent beyond the site window), cu, cv. */
  groups: { dpMin: number; dqMin: number; dpSpan: number; dqSpan: number; cu: number; cv: number }[];
  /** Per tap: group, dp − dpMin, dq − dqMin. */
  taps: Uint32Array<ArrayBuffer>;
  tapCount: number;
  /** Per material m, channel c and tap t: the value at (m·3 + c)·T + t, float64 rounded once. */
  table: Float32Array<ArrayBuffer>;
  /** Per channel c and tap t: the largest difference between two materials' values at that tap (at c·T + t), rounded up. */
  spread: Float32Array<ArrayBuffer>;
  materials: number;
}
function signalGather(signalInput: DisplayViewExpectedSignalInput): SignalGather {
  const tables = displayViewSignalTables(signalInput), scene = signalInput.scene as Extract<DisplayViewExpectedSignalInput["scene"], { kind: "materials" }>;
  const W = signalInput.nativeWidth, H = signalInput.nativeHeight, R = signalInput.kernels ? signalInput.kernels.radius : 0, materials = scene.materials.length;
  const perTap: { g: number; dp: number; dq: number; value: (m: number, c: number) => number }[] = [];
  const groups: SignalGather["groups"] = [];
  const direct = (m: number, c: number): number => { const si = tables.spectralIndex[m]!; return si < 0 ? tables.reflectance[m]! * tables.neutralDirect[c]! : tables.spectralDirect[c]![si]!; };
  tables.groups.forEach((group: GroupTables, g) => {
    const first = perTap.length;
    if (signalInput.kernels) {
      for (let dy = 0; dy < group.ch; dy++) for (let dx = 0; dx < group.cw; dx++) {
        const t = dy * group.cw + dx;
        perTap.push({ g, dp: group.minIx - R + dx, dq: group.minIy - R + dy, value: (m, c) => { const si = tables.spectralIndex[m]!; return si < 0 ? tables.reflectance[m]! * group.neutral[c]![t]! : group.spectral[c]![si]![t]!; } });
      }
    } else for (const member of group.members) perTap.push({ g, dp: member.ix, dq: member.iy, value: (m, c) => member.weight * direct(m, c) });
    const own = perTap.slice(first);
    const dpMin = Math.min(...own.map((t) => t.dp)), dpMax = Math.max(...own.map((t) => t.dp)), dqMin = Math.min(...own.map((t) => t.dq)), dqMax = Math.max(...own.map((t) => t.dq));
    groups.push({ dpMin, dqMin, dpSpan: dpMax - dpMin, dqSpan: dqMax - dqMin, cu: 0.5 + group.fx - W / 2, cv: 0.5 + group.fy - H / 2 });
  });
  const T = perTap.length, taps = new Uint32Array(T * DISPLAY_VIEW_QUALITY_TAP_WORDS), table = new Float32Array(materials * 3 * T), spread = new Float32Array(3 * T);
  perTap.forEach((tap, t) => {
    const group = groups[tap.g]!;
    taps[t * DISPLAY_VIEW_QUALITY_TAP_WORDS] = tap.g; taps[t * DISPLAY_VIEW_QUALITY_TAP_WORDS + 1] = tap.dp - group.dpMin; taps[t * DISPLAY_VIEW_QUALITY_TAP_WORDS + 2] = tap.dq - group.dqMin;
    for (let c = 0; c < 3; c++) {
      let low = Infinity, high = -Infinity;
      for (let m = 0; m < materials; m++) {
        const value = tap.value(m, c);
        if (!(Math.abs(value) <= FLOAT32_SAFE_MAGNITUDE)) throw new ImageKernelExecutionError("unsupported-float32-domain", "A material's channel signal exceeds the float32 domain.");
        table[(m * 3 + c) * T + t] = value;
        low = Math.min(low, value); high = Math.max(high, value);
      }
      // The spread rounded up (a float32 rounding of the two values and of the difference).
      spread[c * T + t] = Math.fround((high - low) * (1 + 4 * E));
    }
  });
  return { groups, taps, tapCount: T, table, spread, materials };
}

/** The aux table: bilinear kernels and 1/Σw², the Gauss–Legendre rule, and the dense candidate weights per phase. */
function auxTable(setup: DisplayViewSetup): Float32Array<ArrayBuffer> {
  const aux = new Float32Array(DISPLAY_VIEW_QUALITY_AUX.size), words = new Uint32Array(aux.buffer);
  for (let p = 0; p < 4; p++) for (let c = 0; c < 3; c++) {
    const taps = setup.demosaic[p]![c]!, base = DISPLAY_VIEW_QUALITY_AUX.bilinear + (p * 3 + c) * 16;
    let w2 = 0;
    taps.forEach((t, i) => { aux[base + 4 * i] = t.dx; aux[base + 4 * i + 1] = t.dy; aux[base + 4 * i + 2] = t.weight; w2 += t.weight * t.weight; });
    aux[DISPLAY_VIEW_QUALITY_AUX.inverseW2 + p * 3 + c] = 1 / w2;
  }
  const gl = gaussLegendre16();
  aux.set(gl.x, DISPLAY_VIEW_QUALITY_AUX.gaussLegendre); aux.set(gl.w, DISPLAY_VIEW_QUALITY_AUX.gaussLegendre + 16);
  const { candidates, count, reach } = candidatesOf(setup), side = 2 * reach + 1;
  for (let p = 0; p < 4; p++) {
    // Dense weights per slot and candidate, as the reference accumulates them (taps at one slot add).
    const dense = new Float64Array(2 * 3 * WINDOW_SLOTS);
    candidates[p]!.forEach((candidate, d) => candidate.forEach((list, c) => { for (const t of list) { const slot = (t.dy + reach) * side + t.dx + reach; { const at = (d * 3 + c) * WINDOW_SLOTS + slot; dense[at] = dense[at]! + t.weight; } } }));
    const base = DISPLAY_VIEW_QUALITY_AUX.candidates + p * DISPLAY_VIEW_QUALITY_AUX.candidatePhaseStride;
    let n = 0;
    for (let slot = 0; slot < side * side; slot++) {
      let used = false;
      for (let k = 0; k < 2 * 3 && !used; k++) if (dense[k * WINDOW_SLOTS + slot] !== 0) used = true;
      if (!used) continue;
      const entry = base + 4 + n * DISPLAY_VIEW_QUALITY_CANDIDATE_FLOATS;
      aux[entry] = (slot % side) - reach; aux[entry + 1] = Math.floor(slot / side) - reach;
      for (let k = 0; k < 6; k++) aux[entry + 2 + k] = dense[k * WINDOW_SLOTS + slot]!;
      n++;
    }
    if (n > DISPLAY_VIEW_QUALITY_CANDIDATE_ENTRIES) throw new ImageKernelExecutionError("unsupported-on-backend", "The demosaic candidates read more slots than the table holds.");
    words[base] = n;
  }
  void count;
  return aux;
}

/** The uniform parameters shared by the three passes (per-pass words are set per dispatch). */
function constants(setup: DisplayViewSetup, signalInput: DisplayViewExpectedSignalInput, gather: SignalGather, reach: number, count: number): { params: ArrayBuffer; words: Uint32Array; ints: Int32Array; floats: Float32Array } {
  const params = new ArrayBuffer(4 * DISPLAY_VIEW_QUALITY_PARAM_WORDS), words = new Uint32Array(params), ints = new Int32Array(params), floats = new Float32Array(params);
  words[2] = setup.region.width; words[3] = setup.region.x; words[4] = setup.region.y; words[5] = setup.margin; words[6] = setup.nativeWidth; words[7] = setup.nativeHeight;
  words[8] = setup.region.width; words[9] = setup.toneCurve === "positive-reinhard-per-channel" ? 1 : 0; words[10] = reach; words[11] = count;
  words[16] = setup.ahdCorrection ? 1 : 0; words[18] = gather.tapCount; words[19] = gather.groups.length;
  for (let c = 0; c < 3; c++) words[21 + c] = setup.gains[c] === setup.clipLevel ? 1 : 0;
  for (let c = 0; c < 3; c++) { floats[24 + c] = setup.readout[c]!.perElectron; floats[28 + c] = setup.readout[c]!.darkElectrons; floats[32 + c] = setup.readout[c]!.constantVariance; floats[36 + c] = setup.gains[c]!; }
  floats[27] = 8.5 * 8.5; floats[31] = setup.clipLevel; floats[35] = setup.ahdCorrection ? setup.ahdCorrection.thresholdVariance : 0;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) floats[40 + r * 3 + c] = setup.matrix[r]![c]!;
  if (signalInput.kernels) { const g = 2 / signalInput.outputWidth; floats[39] = g; floats[49] = -g; }
  else {
    // Without diffraction the reference queries the environment's own points; the lattice model (x + c)·scale is checked against them (queryGeometry).
    const geometry = queryGeometry(signalInput);
    floats[39] = geometry.scaleU; floats[49] = geometry.scaleV;
  }
  floats[50] = (gather.tapCount + 3) * E;
  return { params, words, ints, floats };
}

/** The reference's correction setup of a display-view setup with the AHD correction. */
function correctionSetup(setup: DisplayViewSetup): DisplayViewCorrectionSetup {
  return { seed: setup.seed, readout: setup.readout, gains: setup.gains, clipLevel: setup.clipLevel, matrix: setup.matrix, toneCurve: setup.toneCurve, ahdCorrection: setup.ahdCorrection! };
}

/** How far the host's quantization term Σ(w/A)²·q(m) can move with a mean bound Δm (see QUANTIZATION_SLOPE), doubled. */
function quantizationBound(moments: Float32Array, o: number, meanBound: number, pixels: number, step: number): number {
  let join = 0;
  for (let c = 0; c < 3; c++) { const m = moments[o + c]!; if (m - meanBound <= QUANTIZATION_JOIN && m + meanBound >= QUANTIZATION_JOIN) join = QUANTIZATION_JOIN_JUMP; }
  return MARGIN * pixels * (QUANTIZATION_SLOPE * meanBound + join) * step * step / 12;
}

/** Renders one region of a Quality display view on the GPU (see the module comment). */
export async function renderDisplayViewQualityOnGpu(runtime: WebGpuRuntime, bandBytes: number, input: DisplayViewQualityGpuInput, abort: AbortController,
  yieldControl: YieldControl, pipelines: PipelineSource): Promise<DisplayViewQualityGpuResult> {
  const { setup, signalInput, material } = input;
  const reason = displayViewQualityGpuUnsupportedReason(setup, signalInput);
  if (reason) throw new ImageKernelExecutionError("unsupported-on-backend", "webgpu-f32 display view (Quality): " + reason + "; use cpu-reference.");
  const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const timings: DisplayViewQualityStageTimings = { lattice: 0, sites: 0, pixels: 0, states: 0, finishing: 0, recompute: 0, pixelRedispatches: 0 };
  const { region, margin } = setup, shape = footprintShape(setup), { reach, count } = candidatesOf(setup);
  const gather = signalGather(signalInput), aux = auxTable(setup), { params, words, ints, floats } = constants(setup, signalInput, gather, reach, count);
  void floats;
  const stride = DISPLAY_VIEW_QUALITY_GEOMETRY_STRIDE, geometry = new Float32Array((region.width + region.height) * stride);
  const columnSums: AxisSums[] = [], rowSums: AxisSums[] = [];
  for (let i = 0; i < region.width; i++) { axisRecord(geometry, i * stride, (region.x + i) * shape.sx, (region.x + i + 1) * shape.sx, setup.frameWidth, margin, shape.sx); columnSums.push(axisSums((region.x + i) * shape.sx, (region.x + i + 1) * shape.sx, setup.frameWidth, margin)); }
  for (let j = 0; j < region.height; j++) { axisRecord(geometry, (region.width + j) * stride, (region.y + j) * shape.sy, (region.y + j + 1) * shape.sy, setup.frameHeight, margin, shape.sy); rowSums.push(axisSums((region.y + j) * shape.sy, (region.y + j + 1) * shape.sy, setup.frameHeight, margin)); }
  const area = shape.sx * shape.sy, pixelCount = region.width * region.height;
  // The band's site window: the region's native columns plus the reach, clamped to the raster (border sites are reflected into it).
  const siteX0 = Math.max(0, Math.floor(region.x * shape.sx) + margin - reach), siteX1 = Math.min(setup.nativeWidth - 1, Math.min(setup.frameWidth - 1, Math.ceil((region.x + region.width) * shape.sx) - 1) + margin + reach);
  const siteW = siteX1 - siteX0 + 1;
  const siteRows = (row0: number, row1: number): { y0: number; y1: number } => ({ y0: Math.max(0, Math.floor((region.y + row0) * shape.sy) + margin - reach),
    y1: Math.min(setup.nativeHeight - 1, Math.min(setup.frameHeight - 1, Math.ceil((region.y + row1) * shape.sy) - 1) + margin + reach) });
  const bandBytesOf = (rows: number): number => {
    const { y0, y1 } = siteRows(0, rows), siteH = y1 - y0 + 1;
    let lattice = 0;
    for (const g of gather.groups) lattice += (siteW + g.dpSpan) * (siteH + g.dqSpan) * 4;
    return lattice + siteW * siteH * SITE_BYTES + rows * region.width * OUTPUT_BYTES_PER_PIXEL;
  };
  let rows = region.height;
  while (rows > 1 && bandBytesOf(rows) > bandBytes) rows = Math.ceil(rows / 2);
  const largestBinding = Math.max(bandBytesOf(rows), geometry.byteLength, gather.table.byteLength, 4 * DISPLAY_VIEW_QUALITY_BITMAP_WORDS);
  if (largestBinding > runtime.maximumStorageBindingBytes) throw new ImageKernelExecutionError("insufficient-limits", "One display-view band exceeds the device's storage binding limit.");
  const latticePipeline = await pipelines("photivra-display-view-quality-lattice:" + material.id, assembleDisplayViewQualityLatticeWgsl(material.wgsl));
  const sitesPipeline = await pipelines("photivra-display-view-quality-sites", DISPLAY_VIEW_QUALITY_SITES_WGSL);
  const pixelsPipeline = await pipelines("photivra-display-view-quality-pixels", DISPLAY_VIEW_QUALITY_PIXELS_WGSL);
  const moments = new Float32Array(pixelCount * DISPLAY_VIEW_QUALITY_OUTPUT_FLOATS), pixelFlags = new Uint32Array(pixelCount);
  const states = input.states ?? new CorrectionStateStore(), correction = setup.ahdCorrection ? correctionSetup(setup) : null;
  let statesComputed = 0;
  const scope = new GpuResourceScope(runtime);
  try {
    const auxBuffer = scope.upload("photivra-display-view-aux", aux, BUFFER_USAGE.STORAGE);
    const geometryBuffer = scope.upload("photivra-display-view-geometry", geometry, BUFFER_USAGE.STORAGE);
    const tapsBuffer = scope.upload("photivra-display-view-taps", gather.taps, BUFFER_USAGE.STORAGE);
    const tableBuffer = scope.upload("photivra-display-view-table", gather.table, BUFFER_USAGE.STORAGE);
    const spreadBuffer = scope.upload("photivra-display-view-spread", gather.spread, BUFFER_USAGE.STORAGE);
    // A module's binding is data uploaded per render or a buffer the module already holds on the device (#491: scene records).
    const materialEntries = material.bindings.map((b) => ({ binding: b.binding, resource: { buffer: b.buffer ??
      scope.upload("photivra-display-view-material-" + b.binding, b.data, b.kind === "uniform" ? BUFFER_USAGE.UNIFORM : BUFFER_USAGE.STORAGE) } }));
    const materialGroup = runtime.device.createBindGroup({ layout: latticePipeline.getBindGroupLayout(1), entries: materialEntries });
    const gate = createHostYieldGate();
    for (let row0 = 0; row0 < region.height; row0 += rows) {
      checkAbort(abort.signal);
      const row1 = Math.min(region.height, row0 + rows), count = (row1 - row0) * region.width, first = row0 * region.width;
      const { y0: siteY0, y1: siteY1 } = siteRows(row0, row1), siteH = siteY1 - siteY0 + 1;
      // Lattice windows per group, and the group records.
      const groupWords = new Uint32Array(gather.groups.length * DISPLAY_VIEW_QUALITY_GROUP_WORDS), groupInts = new Int32Array(groupWords.buffer), groupFloats = new Float32Array(groupWords.buffer);
      let latticeTotal = 0;
      gather.groups.forEach((g, index) => {
        const base = index * DISPLAY_VIEW_QUALITY_GROUP_WORDS, lw = siteW + g.dpSpan, lh = siteH + g.dqSpan;
        groupInts[base] = siteX0 + g.dpMin; groupInts[base + 1] = siteY0 + g.dqMin; groupWords[base + 2] = lw; groupWords[base + 3] = lh; groupWords[base + 4] = latticeTotal;
        groupFloats[base + 6] = g.cu; groupFloats[base + 7] = g.cv;
        latticeTotal += lw * lh;
      });
      words[1] = row0; ints[12] = siteX0; ints[13] = siteY0; words[14] = siteW; words[15] = siteH; words[20] = latticeTotal;
      const band = new GpuResourceScope(runtime);
      try {
        const groupBuffer = band.upload("photivra-display-view-groups", groupWords, BUFFER_USAGE.STORAGE);
        const latticeBuffer = band.buffer("photivra-display-view-lattice", latticeTotal * 4, BUFFER_USAGE.STORAGE);
        const siteBuffer = band.buffer("photivra-display-view-sites", siteW * siteH * SITE_BYTES, BUFFER_USAGE.STORAGE);
        // Pass 1: lattice materials.
        let t0 = now();
        words[0] = latticeTotal;
        const latticeParams = band.upload("photivra-display-view-params-lattice", new Uint8Array(params.slice(0)), BUFFER_USAGE.UNIFORM);
        const latticeGroup = runtime.device.createBindGroup({ layout: latticePipeline.getBindGroupLayout(0), entries: [
          { binding: 0, resource: { buffer: latticeParams } }, { binding: 1, resource: { buffer: groupBuffer } }, { binding: 2, resource: { buffer: latticeBuffer } }] });
        await runComputePass(runtime, band, latticePipeline, [latticeGroup, materialGroup], linearDispatch(latticeTotal, DISPLAY_VIEW_QUALITY_WORKGROUP_SIZE, runtime.maximumWorkgroupsPerDimension), [], abort.signal);
        await queueIdle(runtime, abort.signal);
        timings.lattice += now() - t0;
        // Pass 2: site moments.
        t0 = now();
        words[0] = siteW * siteH;
        const siteParams = band.upload("photivra-display-view-params-sites", new Uint8Array(params.slice(0)), BUFFER_USAGE.UNIFORM);
        const siteGroup = runtime.device.createBindGroup({ layout: sitesPipeline.getBindGroupLayout(0), entries: [
          { binding: 0, resource: { buffer: siteParams } }, { binding: 1, resource: { buffer: groupBuffer } }, { binding: 2, resource: { buffer: tapsBuffer } },
          { binding: 3, resource: { buffer: tableBuffer } }, { binding: 4, resource: { buffer: latticeBuffer } }, { binding: 5, resource: { buffer: siteBuffer } }, { binding: 6, resource: { buffer: spreadBuffer } }] });
        await runComputePass(runtime, band, sitesPipeline, siteGroup, linearDispatch(siteW * siteH, DISPLAY_VIEW_QUALITY_WORKGROUP_SIZE, runtime.maximumWorkgroupsPerDimension), [], abort.signal);
        await queueIdle(runtime, abort.signal);
        timings.sites += now() - t0;
        // Pass 3: display pixels, repeated once when a correction state was missing and has been computed.
        words[0] = count;
        const out = band.buffer("photivra-display-view-moments", count * 4 * DISPLAY_VIEW_QUALITY_OUTPUT_FLOATS, BUFFER_USAGE.STORAGE | BUFFER_USAGE.COPY_SRC);
        const flagBuffer = band.buffer("photivra-display-view-flags", count * 4, BUFFER_USAGE.STORAGE | BUFFER_USAGE.COPY_SRC);
        const bitmapBuffer = band.buffer("photivra-display-view-bitmap", 4 * DISPLAY_VIEW_QUALITY_BITMAP_WORDS, BUFFER_USAGE.STORAGE | BUFFER_USAGE.COPY_SRC);
        for (let attempt = 0; ; attempt++) {
          checkAbort(abort.signal);
          t0 = now();
          const table = states.table(), stateKeys = table.keys.length > 0 ? table.keys : new Int32Array(1), stateValues = table.values.length > 0 ? table.values : new Float32Array(3);
          words[17] = table.keys.length;
          const pass = new GpuResourceScope(runtime);
          let data: ArrayBuffer, flagData: ArrayBuffer, bitmapData: ArrayBuffer;
          try {
            const pixelParams = pass.upload("photivra-display-view-params-pixels", new Uint8Array(params.slice(0)), BUFFER_USAGE.UNIFORM);
            const keysBuffer = pass.upload("photivra-display-view-state-keys", stateKeys, BUFFER_USAGE.STORAGE);
            const valuesBuffer = pass.upload("photivra-display-view-state-values", stateValues, BUFFER_USAGE.STORAGE);
            const pixelGroup = runtime.device.createBindGroup({ layout: pixelsPipeline.getBindGroupLayout(0), entries: [
              { binding: 0, resource: { buffer: pixelParams } }, { binding: 1, resource: { buffer: auxBuffer } }, { binding: 2, resource: { buffer: geometryBuffer } },
              { binding: 3, resource: { buffer: siteBuffer } }, { binding: 4, resource: { buffer: keysBuffer } }, { binding: 5, resource: { buffer: valuesBuffer } },
              { binding: 6, resource: { buffer: bitmapBuffer } }, { binding: 7, resource: { buffer: out } }, { binding: 8, resource: { buffer: flagBuffer } }] });
            [data, flagData, bitmapData] = await runComputePass(runtime, pass, pixelsPipeline, pixelGroup, linearDispatch(count, DISPLAY_VIEW_QUALITY_WORKGROUP_SIZE, runtime.maximumWorkgroupsPerDimension),
              [{ buffer: out, bytes: count * 4 * DISPLAY_VIEW_QUALITY_OUTPUT_FLOATS }, { buffer: flagBuffer, bytes: count * 4 }, { buffer: bitmapBuffer, bytes: 4 * DISPLAY_VIEW_QUALITY_BITMAP_WORDS }], abort.signal) as [ArrayBuffer, ArrayBuffer, ArrayBuffer];
          } finally { pass.release(); }
          timings.pixels += now() - t0;
          const bandFlags = new Uint32Array(flagData, 0, count);
          let missing = false;
          for (let i = 0; i < count && !missing; i++) if ((bandFlags[i]! & DISPLAY_VIEW_QUALITY_FLAG.stateMissing) !== 0) missing = true;
          if (missing && correction && attempt === 0) {
            // The grid keys the band needs that the store lacks: compute them with the reference (the realm's cache serves known ones), then dispatch again.
            t0 = now();
            const bitmap = new Uint32Array(bitmapData, 0, DISPLAY_VIEW_QUALITY_BITMAP_WORDS), needed: number[] = [];
            for (let w = 0; w < DISPLAY_VIEW_QUALITY_BITMAP_WORDS; w++) {
              let bitsWord = bitmap[w]!;
              while (bitsWord !== 0) { const bit = 31 - Math.clz32(bitsWord); bitsWord &= ~(1 << bit); const key = w * 32 + bit; if (key < AHD_KEY_LEVELS ** 3 && !states.has(key)) needed.push(key); }
            }
            if (needed.length > 0) {
              const computed = await computeDisplayViewCorrectionStates({ ...correction, yieldControl: async () => { if (yieldControl) await yieldControl(abort.signal); }, checkAbort: () => checkAbort(abort.signal) }, Int32Array.from(needed));
              states.add(computed.gridKeys, computed.values);
              statesComputed += needed.length;
            }
            timings.states += now() - t0;
            timings.pixelRedispatches++;
            continue;
          }
          moments.set(new Float32Array(data, 0, count * DISPLAY_VIEW_QUALITY_OUTPUT_FLOATS), first * DISPLAY_VIEW_QUALITY_OUTPUT_FLOATS);
          pixelFlags.set(bandFlags, first);
          break;
        }
      } finally {
        band.release();
      }
      if (yieldControl && gate.due()) { await yieldControl(abort.signal); gate.restart(); }
    }
  } finally {
    scope.release();
  }
  checkAbort(abort.signal);
  // The reference's finishing per display pixel (float64).
  let t0 = now();
  const maximum = setup.bitDepth === 8 ? 255 : 65535, step = 1 / maximum;
  const samples = setup.bitDepth === 8 ? new Uint8Array(pixelCount * 3) : new Uint16Array(pixelCount * 3);
  const expected = new Float64Array(pixelCount * 3), noiseStd = new Float64Array(pixelCount * 3);
  const meanBound = new Float32Array(pixelCount), varianceBound = new Float32Array(pixelCount);
  const flagged: number[] = [];
  let largestMean = 0, largestVariance = 0, sampleCount = 0, siteCount = 0, corrected = 0;
  const counts = new Int32Array(geometry.buffer);
  for (let ry = 0, i = 0; ry < region.height; ry++) {
    const rowWw = rowSums[ry]!.ww, ny = counts[(region.width + ry) * stride + 1]!;
    for (let rx = 0; rx < region.width; rx++, i++) {
      const pixels = columnSums[rx]!.ww * rowWw / (area * area), vy = region.y + ry, vx = region.x + rx, o = i * DISPLAY_VIEW_QUALITY_OUTPUT_FLOATS;
      let flag = (pixelFlags[i]! & DISPLAY_VIEW_QUALITY_FLAG.recompute) !== 0;
      for (let k = 0; k < DISPLAY_VIEW_QUALITY_OUTPUT_FLOATS && !flag; k++) if (!Number.isFinite(moments[o + k]!)) flag = true;
      if (flag) { flagged.push(i); continue; }
      finishDisplayViewPixel(moments.subarray(o, o + 9), pixels, setup.seed, vy * setup.viewWidth + vx, step, maximum, samples, expected, noiseStd, i * 3);
      meanBound[i] = MARGIN * moments[o + 9]!;
      varianceBound[i] = MARGIN * moments[o + 10]! + quantizationBound(moments, o, meanBound[i]!, pixels, step);
      largestMean = Math.max(largestMean, meanBound[i]!); largestVariance = Math.max(largestVariance, varianceBound[i]!);
      if ((pixelFlags[i]! & DISPLAY_VIEW_QUALITY_FLAG.corrected) !== 0) corrected++;
      const nx = counts[rx * stride + 1]!;
      sampleCount += nx * ny; siteCount += (nx + 2 * reach) * (ny + 2 * reach);
    }
  }
  timings.finishing = now() - t0;
  // Flagged display pixels: the reference's own pixel (a one-pixel region render is byte-identical to the whole view's pixel).
  t0 = now();
  const recomputed: number[] = [];
  if (flagged.length > 0) {
    if (input.recomputeFlagged === false) {
      // Without recomputation a flagged pixel keeps the kernel's values where they are finite (its bound then does not hold).
      for (const i of flagged) {
        const o = i * DISPLAY_VIEW_QUALITY_OUTPUT_FLOATS;
        let finite = true;
        for (let k = 0; k < DISPLAY_VIEW_QUALITY_OUTPUT_FLOATS && finite; k++) if (!Number.isFinite(moments[o + k]!)) finite = false;
        if (!finite) continue;
        const rx = i % region.width, ry = (i - rx) / region.width, pixels = columnSums[rx]!.ww * rowSums[ry]!.ww / (area * area);
        finishDisplayViewPixel(moments.subarray(o, o + 9), pixels, setup.seed, (region.y + ry) * setup.viewWidth + region.x + rx, step, maximum, samples, expected, noiseStd, i * 3);
        meanBound[i] = MARGIN * moments[o + 9]!; varianceBound[i] = MARGIN * moments[o + 10]! + quantizationBound(moments, o, meanBound[i]!, pixels, step);
      }
    } else {
      const signal = createDisplayViewExpectedSignal(signalInput);
      for (const i of flagged) {
        checkAbort(abort.signal);
        const rx = i % region.width, ry = (i - rx) / region.width;
        const pixel = await renderDisplayView({ ...setup, signal, region: { x: region.x + rx, y: region.y + ry, width: 1, height: 1 } });
        samples.set(pixel.samples, i * 3); expected.set(pixel.expected, i * 3); noiseStd.set(pixel.noiseStd, i * 3);
        meanBound[i] = 0; varianceBound[i] = 0;
        corrected += pixel.ahdCorrectedPixelCount; sampleCount += pixel.sampleCount; siteCount += pixel.siteCount;
        recomputed.push(i);
      }
    }
  }
  timings.recompute = now() - t0;
  const relative = MARGIN * CPU_RELATIVE;
  const expectedValueBound: ImageKernelRelativeErrorBound = { kind: "relative-to-reference", relative, absolute: largestMean };
  const uncertain = flagged.length - recomputed.length;
  return { samples, expected, noiseStd, sampleCount, siteCount, detailPixelCount: pixelCount, uniformPixelCount: 0, ahdCorrectedPixelCount: corrected, estimation: "exact-area-mean",
    execution: webGpuExecution(expectedValueBound, uncertain), expectedValueBound, varianceBound: { kind: "relative-to-reference", relative, absolute: largestVariance },
    expectedValueAbsoluteBound: meanBound, varianceAbsoluteBound: varianceBound, flaggedPixelIndices: Uint32Array.from(flagged), hostRecomputedPixelIndices: Uint32Array.from(recomputed),
    pixelFlags, statesComputed, statesHeld: states.size, tapsPerSite: gather.tapCount, stageMilliseconds: timings };
}

/** #492: `lens.defocus` out of focus needs the defocus disc's gather, which no GPU kernel has yet (#492 step 2c). */
const DEFOCUS_REFUSAL = "lens.defocus out of focus (the geometric defocus disc) is not on the GPU (#492)";

/**
 * The GPU setup the material modules read for a Quality render (#491's `createDisplayViewMaterialModules`). The composite module
 * recovers the exact lattice point from the kernel's float32 point with the request's query offsets and the scale of its own
 * query points. With diffraction kernels the reference has no query points: it evaluates each lattice group's points with the
 * lattice formula (p + 0.5 + f − W/2)·g, −(q + 0.5 + f − H/2)·g (`createDisplayViewExpectedSignal`). The lattice pass forms
 * exactly that point per group, so the module is given the groups as its offsets and that formula as the query points; the
 * module's own checks (the model at the frame's corners within 2⁻⁴⁸, the offsets' separation, at most 16 offsets) then apply to
 * them as to a Speed lattice. Without diffraction the request's own offsets and query points are the lattice already (each
 * group member's point is checked to be its offset's, `displayViewQualityGpuUnsupportedReason`).
 */
export function qualityMaterialSetup(gpu: DisplayViewGpuSetup): DisplayViewGpuSetup {
  const input = gpu.signalInput;
  if (!input.kernels) return gpu;
  const groups = displayViewSignalTables(input).groups, W = input.nativeWidth, H = input.nativeHeight, g = 2 / input.outputWidth;
  const offsets = groups.map((group) => ({ x: group.fx, y: group.fy, weight: 1 / groups.length }));
  const queryPoint = (x: number, y: number, o: number, out: Float64Array): void => {
    const group = groups[o]!;
    out[0] = (group.fx === 0 ? (x + 0.5 - W / 2) : (x + 0.5 + group.fx - W / 2)) * g;
    out[1] = -(group.fy === 0 ? (y + 0.5 - H / 2) : (y + 0.5 + group.fy - H / 2)) * g;
  };
  const { kernels: _kernels, ...rest } = input;
  void _kernels;
  return { ...gpu, signalInput: { ...rest, offsets, queryPoint } };
}

/** The material module of a Quality render's scene (see `qualityMaterialSetup`). */
export function qualityMaterialModule(modules: DisplayViewMaterialModules, gpu: DisplayViewGpuSetup, signal: AbortSignal): Promise<DisplayViewGpuMaterialModule> {
  return modules.moduleFor(qualityMaterialSetup(gpu), signal);
}

/** The pixel-aperture samples per axis and anti-aliasing spots of a request. */
function offsetCount(request: DisplayViewGpuRequest): number { return request.boxSamples * request.boxSamples * (request.antiAliasing ? 4 : 1); }

/**
 * Why the Quality renderer does not support a prepared request (`DisplayViewGpuRenderer.supports`), or true: engine charts and
 * declared `material-layers` scenes (the material modules of `createDisplayViewMaterialModules`, #491), the identity or Reinhard
 * tone curve and at most 64 query offsets (lattice groups), never `lens.defocus` out of focus (#492: no GPU defocus gather yet);
 * whether a view's footprints take the exact area mean, and whether the device passes the composite probe, is known only per render.
 */
export function displayViewQualityGpuSupports(request: DisplayViewGpuRequest): true | string {
  if (request.defocus) return DEFOCUS_REFUSAL;
  if (request.scene !== "chart" && request.scene !== "material-layers") return "the scene is a caller " + request.scene + "; the GPU material lookup covers engine charts and declared material-layers scenes (describe the scene as material-layers)";
  if (request.toneCurve !== "identity" && request.toneCurve !== "positive-reinhard-per-channel") return "unsupported tone curve " + String(request.toneCurve);
  if (offsetCount(request) > MAXIMUM_GROUPS) return "more than " + MAXIMUM_GROUPS + " query offsets per site";
  return true;
}

/** A normalized, symmetric site kernel of radius R for the self-check (a binned Gaussian of width `sigma` sites). */
function syntheticKernel(radius: number, sigma: number): Float64Array {
  const size = 2 * radius + 1, kernel = new Float64Array(size * size);
  let sum = 0;
  for (let v = -radius; v <= radius; v++) for (let u = -radius; u <= radius; u++) { const w = Math.exp(-0.5 * (u * u + v * v) / (sigma * sigma)); kernel[(v + radius) * size + u + radius] = w; sum += w; }
  for (let t = 0; t < kernel.length; t++) kernel[t] = kernel[t]! / sum;
  return kernel;
}

/**
 * The renderer's run-time self-check (`DisplayViewGpuRenderer.conformanceCases`): a 38 × 26 checkerboard frame of 6 µm sites shown
 * at 13 × 9 (2.9 real pixels per display pixel) with the 2 × 2 box and a four-spot filter (16 offsets, four lattice groups),
 * synthetic radius-1 diffraction kernels at three spectral nodes, the AHD candidates and the low-signal correction (few electrons
 * per site, so the correction applies; 64 draws per state keep the check short), the GPU against `renderDisplayView` within
 * the a-priori bounds, every flagged pixel recomputed.
 */
export const DISPLAY_VIEW_QUALITY_CONFORMANCE_CASE: DisplayViewGpuConformanceCase = { id: "display-view:quality:checkerboard-13x9-diffraction-ahd", async run(handle, signal): Promise<true | string> {
  const runtime = handle as WebGpuRuntime;
  const nativeWidth = 40, nativeHeight = 28, margin = 1, frameWidth = 38, frameHeight = 26, nodes = [450, 550, 650];
  const chart = resolvePortableChartScene({ scene: { preset: "checkerboard", squaresAcross: 6 }, aspect: frameHeight / frameWidth });
  const offsets: { x: number; y: number; weight: number }[] = [];
  for (const [nx, ny] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]] as const) for (const [ax, ay] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]] as const) offsets.push({ x: nx - ax, y: ny - ay, weight: 1 / 16 });
  const signalInput: DisplayViewExpectedSignalInput = { nativeWidth, nativeHeight, outputWidth: frameWidth, wavelengthsNm: nodes,
    electronsPerRadiance: [Float64Array.of(900, 3000, 400), Float64Array.of(600, 4200, 900), Float64Array.of(3000, 900, 300)], offsets,
    kernels: { radius: 1, perNode: [syntheticKernel(1, 0.6), syntheticKernel(1, 0.7), syntheticKernel(1, 0.8)] },
    scene: { kind: "materials", materialAt: (u, v) => chart.materialAt(u, v), materials: chart.materials.map((m) => ({ neutral: m.kind === "neutral" ? m.reflectance : 0.5 })), whiteRadiance: Float64Array.of(0.5, 0.9, 0.7) },
    channelAt: (x, y) => ((y & 1) === 0 ? ((x & 1) === 0 ? 0 : 1) : ((x & 1) === 0 ? 1 : 2)) };
  const readout = { perElectron: 1 / 4000, darkElectrons: 0.07, constantVariance: 2.5e-7 };
  const bilinear = bilinearKernels();
  const setup: DisplayViewSetup = { frameWidth, frameHeight, margin, nativeWidth, nativeHeight, viewWidth: 13, viewHeight: 9, region: { x: 0, y: 0, width: 13, height: 9 },
    samplesPerAxis: 16, reachSites: 5, bitDepth: 8, seed: 479, signal: createDisplayViewExpectedSignal(signalInput), readout: [readout, readout, readout], demosaic: bilinear,
    candidates: [0, 1, 2, 3].map((p) => ahdCandidateKernels(p % 2, Math.floor(p / 2))),
    ahdCorrection: { labMatrix: [[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]].map((row) => row.map((v, c) => v * [1.1, 1, 1.6][c]!)), drawsPerState: 64, thresholdVariance: 1e-4 },
    gains: [1.1, 1, 1.6], clipLevel: 1, matrix: [[3.08, -1.54, -0.54], [-0.92, 1.88, 0.045], [0.053, -0.2, 1.15]], toneCurve: "identity",
    yieldControl: async () => undefined, checkAbort: () => { if (signal?.aborted) throw abortedError(); } };
  const reference = await renderDisplayView(setup);
  const abort = new AbortController(), onAbort = (): void => abort.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    if (signal?.aborted) abort.abort();
    const gpu = await renderDisplayViewQualityOnGpu(runtime, 1 << 20, { setup, signalInput, material: chartPresetMaterialModule(chart) }, abort, undefined,
      (label, code) => createComputePipeline(runtime, label, code, abort.signal));
    if (gpu.ahdCorrectedPixelCount === 0 || reference.ahdCorrectedPixelCount === 0) return "the self-check did not exercise the low-signal correction.";
    for (let i = 0; i < reference.expected.length; i++) {
      const p = Math.floor(i / 3), e0 = reference.expected[i]!, e1 = gpu.expected[i]!, v0 = reference.noiseStd[i]! * reference.noiseStd[i]!, v1 = gpu.noiseStd[i]! * gpu.noiseStd[i]!;
      const expectedLimit = gpu.expectedValueBound.relative * Math.abs(e0) + gpu.expectedValueAbsoluteBound[p]!, varianceLimit = gpu.varianceBound.relative * v0 + gpu.varianceAbsoluteBound[p]!;
      if (!(Math.abs(e1 - e0) <= expectedLimit)) return "component " + i + ": expected value " + e1 + " differs from the reference " + e0 + " by more than the a-priori bound " + expectedLimit + ".";
      if (!(Math.abs(v1 - v0) <= varianceLimit)) return "component " + i + ": variance " + v1 + " differs from the reference " + v0 + " by more than the a-priori bound " + varianceLimit + ".";
      if (Math.abs(gpu.samples[i]! - reference.samples[i]!) > 1) return "component " + i + ": sample " + gpu.samples[i] + " differs from the reference " + reference.samples[i] + " by more than one code.";
    }
    return true;
  } finally { signal?.removeEventListener("abort", onAbort); }
} };

/** The bilinear RGGB demosaic kernels per phase (phaseY·2 + phaseX) and channel, as `bilinearPhaseProfiles` gives them. */
function bilinearKernels(): DisplayViewKernelTap[][][] {
  const cross = [[1, 0], [-1, 0], [0, 1], [0, -1]], diagonal = [[1, 1], [1, -1], [-1, 1], [-1, -1]], horizontal = [[1, 0], [-1, 0]], vertical = [[0, 1], [0, -1]];
  const average = (offsets: number[][]): DisplayViewKernelTap[] => offsets.map(([dx, dy]) => ({ dx: dx!, dy: dy!, weight: 1 / offsets.length })), self = [{ dx: 0, dy: 0, weight: 1 }];
  return [[self, average(cross), average(diagonal)], [average(horizontal), self, average(vertical)], [average(vertical), self, average(horizontal)], [average(diagonal), average(cross), self]];
}

/**
 * The display view's GPU renderer on one runtime (#481's `DisplayViewGpuRenderer`): the Speed kernel for requests it covers
 * (no diffraction, no AHD, at most 16 offsets) and the Quality kernels for the rest. One pipeline cache per device, one set of
 * material modules (#491: chart presets, composite charts, the 2.3 elements and material-layers scenes; `dispose` releases their
 * uploaded scene records), one correction-state store per correction key. `render` renders the part's region (`setup.gpu`
 * carries the expected signal's input and the chart; a setup without it, a coarse view or a frame the kernels do not cover
 * throws `unsupported-on-backend`), and throws `aborted` and `device-lost` as the accelerator's operations do.
 */
export function createDisplayViewGpuRenderer(runtime: WebGpuRuntime, options: { maximumBandBytes?: number; yieldControl?: YieldControl } = {}): DisplayViewGpuRenderer {
  const pipelines = new Map<string, Promise<GPUComputePipeline>>(), stores = new Map<string, CorrectionStateStore>();
  const bandBytes = options.maximumBandBytes ?? Math.min(64 * 1024 * 1024, runtime.maximumStorageBindingBytes);
  const source: PipelineSource = (label, code) => {
    let pending = pipelines.get(label);
    if (!pending) { pending = createComputePipeline(runtime, label, code, undefined); pipelines.set(label, pending); pending.catch(() => pipelines.delete(label)); }
    return pending;
  };
  // #491: one set of material modules per device for both kernels (the preset module per chart; the composite module, its probe
  // and its uploaded scene records), released by `dispose`.
  const modules = createDisplayViewMaterialModules(runtime, source);
  return {
    id: "photivra-display-view",
    supports(request: DisplayViewGpuRequest): true | string {
      if (request.defocus) return DEFOCUS_REFUSAL;
      const speed = displayViewSpeedGpuSupports(request);
      if (speed === true) return true;
      return displayViewQualityGpuSupports(request);
    },
    conformanceCases: [DISPLAY_VIEW_SPEED_CONFORMANCE_CASE, DISPLAY_VIEW_QUALITY_CONFORMANCE_CASE],
    async render(part: DisplayViewGpuPart): Promise<DisplayViewGpuRenderOutput> {
      const { setup, signal } = part;
      if (!setup.gpu) throw new ImageKernelExecutionError("unsupported-on-backend", "The display-view setup carries no GPU inputs (setup.gpu); use cpu-reference.");
      const abort = new AbortController(), onAbort = (): void => abort.abort();
      if (signal?.aborted) throw abortedError();
      signal?.addEventListener("abort", onAbort, { once: true });
      try {
        const signalInput = setup.gpu.signalInput;
        let result: DisplayViewRenderResult & { expectedValueBound: ImageKernelRelativeErrorBound; execution: ImageKernelExecution };
        if (displayViewSpeedGpuUnsupportedReason(setup, signalInput) === null) {
          const material = await modules.moduleFor(setup.gpu, abort.signal);
          result = await renderDisplayViewSpeedOnGpu(runtime, bandBytes, { setup, signalInput, material }, abort, options.yieldControl, source);
        } else {
          const material = await qualityMaterialModule(modules, setup.gpu, abort.signal);
          const key = displayViewCorrectionKey(setup);
          let states = key === null ? undefined : stores.get(key);
          if (key !== null && !states) { states = new CorrectionStateStore(); stores.set(key, states); }
          result = await renderDisplayViewQualityOnGpu(runtime, bandBytes, { setup, signalInput, material, ...(states ? { states } : {}) }, abort, options.yieldControl, source);
        }
        return { samples: result.samples, expected: result.expected, noiseStd: result.noiseStd, sampleCount: result.sampleCount, siteCount: result.siteCount, detailPixelCount: result.detailPixelCount,
          uniformPixelCount: result.uniformPixelCount, ahdCorrectedPixelCount: result.ahdCorrectedPixelCount, estimation: result.estimation, errorBound: result.expectedValueBound,
          diagnosticUncertaintySampleCount: result.execution.diagnosticUncertaintySampleCount };
      } finally { signal?.removeEventListener("abort", onAbort); }
    },
    dispose(): void { modules.release(); stores.clear(); }
  };
}

/** The factory `prepareDisplayView` creates the renderer with (one per device): the Speed and Quality kernels behind one renderer. */
export const displayViewGpuRendererFactory: DisplayViewGpuRendererFactory = (handle: DisplayViewGpuRuntimeHandle) => createDisplayViewGpuRenderer(handle as WebGpuRuntime);

/** Registers the combined renderer as the display view's GPU renderer and returns the factory registered before. */
export function registerDisplayViewGpuRenderer(): DisplayViewGpuRendererFactory | null {
  return setDisplayViewGpuRendererFactory(displayViewGpuRendererFactory);
}
