// SPDX-License-Identifier: Apache-2.0

/**
 * Display view (`simulateDisplayView`): the image that the real full-resolution capture of a `simulateCapture`
 * request would give after it is resized to a small display size by area averaging in linear light, computed
 * without rendering the full-resolution capture. Internal; the public entry point and its option parsing live in
 * `simulate-capture.ts`. The design and its error analysis are in docs/DISPLAY_VIEW.md.
 *
 * Definition (the reference this module estimates): let L_j be the linear-light value of output pixel j of the
 * real capture (its sRGB samples decoded with the sRGB EOTF). Display pixel P covers the rectangle F_P of
 * real output pixels [P_x·s_x, (P_x + 1)·s_x) × [P_y·s_y, (P_y + 1)·s_y), s = frame size ÷ view size, and
 *   D_P = Σ_j (w_j / A) · L_j,
 * w_j = the area of pixel j inside F_P, A = s_x·s_y (the "area" or box resampling filter). D_P is then
 * sRGB-encoded and rounded.
 *
 * Estimation, per display pixel:
 * 1. Expected value. The expectation E[D_P] = Σ_j (w_j/A)·E[L_j] is estimated by stratified Monte Carlo over the
 *    footprint: K × K strata, one uniformly jittered point in each (deterministic, seeded by the capture seed and the
 *    display pixel index); the real pixel containing the point is the sample. A point drawn uniformly in F_P lands in
 *    pixel j with probability w_j/A, so the sample mean is unbiased for E[D_P]. For each sampled pixel the module
 *    computes, at the real pitch, the exact expected electrons of the real sites its demosaic reads (the scene sampled
 *    at those sites, through the declared pixel aperture, anti-aliasing filter and diffraction kernels, so the real
 *    colour mosaic and its aliasing are kept), the moments of each site's normalized RAW value (shot, dark, read and
 *    ADC noise; clipped at the white level), the demosaic's linear kernels, the development (white balance,
 *    highlight clip, colour matrix) and the output rendering (tone curve, clip to [0, 1]). The non-linear steps act
 *    on the pixel's own distribution, approximated as normal with the propagated mean and variance, so a clipped
 *    noise floor or a clipped highlight moves the mean as it does in the real image.
 * 2. Noise. D_P − E[D_P] is a weighted sum of the independent site noises. Linearizing the non-linear steps with
 *    their expected slopes (Stein's lemma), its covariance is A·Γ·diag(B_c·σ_c²)·Γᵀ·Aᵀ, where σ_c² is the site
 *    variance of CFA channel c and B_c = Σ_k β_k² with β_k the total weight of site k in the display pixel after
 *    demosaicing and averaging. B_c holds the demosaic correlation exactly for the linear kernels and is computed in
 *    closed form from the footprint. The rest of each pixel's variance that the linearization misses (clipping) is
 *    added as independent per-pixel variance, weighted by Σ_j (w_j/A)², as is the output quantization (Δ²/12).
 *    One correlated normal draw per display pixel (the sum of hundreds of independent site noises) gives the noise.
 */

import { InvalidConfigurationError } from "../core/configuration-error.js";
import { createDeterministicUniformStream, deriveNativeSiteStreamSeedUint32, fmix32, sampleDeterministicStandardNormal } from "../sensor/stochastic-seed.js";
import { encodeSrgbComponent } from "../color/srgb-transfer.js";
import { createPoissonSampler } from "../sensor/raw-readout.js";

/** Stream IDs of the display view's two seeded streams, distinct from the native charge (0) and read-noise (1) streams. */
export const DISPLAY_VIEW_JITTER_STREAM_ID = 32 as const;
export const DISPLAY_VIEW_NOISE_STREAM_ID = 33 as const;
export const DISPLAY_VIEW_AHD_STREAM_ID = 34 as const;

/** A query offset from a site centre in sites (+x right, +y down) and its weight (pixel-aperture node × filter spot). */
export interface DisplayViewQueryOffset { x: number; y: number; weight: number }

/** Scene access for the expected signal: chart materials (fast tables) or a radiance function. */
export type DisplayViewScene =
  | { kind: "materials"; materialAt(u: number, v: number): number;
    /** Per material: `{ neutral: reflectance }` (radiance = reflectance × illuminant) or the spectral radiance at each node. */
    materials: readonly ({ neutral: number } | { radiance: Float64Array })[];
    /** Illuminant radiance of a perfect white diffuser at each spectral node: irradianceScale·shape(λ)/π. */
    whiteRadiance: Float64Array }
  | { kind: "radiance"; radianceAt(u: number, v: number, nm: number): number };

export interface DisplayViewExpectedSignalInput {
  nativeWidth: number;
  nativeHeight: number;
  /** Frame output width: plane coordinates are 2 / outputWidth frame units per site. */
  outputWidth: number;
  /** Spectral nodes and, per CFA channel (red, green, blue), the expected electrons per unit spectral radiance at each node. */
  wavelengthsNm: readonly number[];
  electronsPerRadiance: readonly [Float64Array, Float64Array, Float64Array];
  offsets: readonly DisplayViewQueryOffset[];
  /** Diffraction: per-node kernels on the site lattice, (2R + 1)² taps in row-major order, out(x) = Σ in(x − t)·K(t). */
  kernels?: { radius: number; perNode: readonly Float64Array[] };
  scene: DisplayViewScene;
  /** CFA channel index (0 red, 1 green, 2 blue) of native site (x, y). */
  channelAt(x: number, y: number): number;
  /**
   * Without diffraction: the plane point (frame units) that the environment queries for offset `o` of native site (x, y),
   * computed with the environment's own arithmetic, so points that fall exactly on a chart boundary resolve to the same
   * material as in the capture. With diffraction the facade's object-space convolution uses the lattice formula, as here.
   */
  queryPoint?(x: number, y: number, offset: number, out: Float64Array): void;
}

/** Expected photo electrons of real native sites. */
export interface DisplayViewExpectedSignal {
  /**
   * Starts a new cache window: native sites [x0, x1) × [y0, y1) that the following `site` calls mostly read. Sites and
   * scene lookups inside it are computed once; anything outside is computed without caching.
   */
  window(x0: number, y0: number, x1: number, y1: number): void;
  /** Expected photo electrons of native site (x, y) for its own CFA channel (x, y inside the native raster). */
  site(x: number, y: number): number;
  /** A cheap classifier value of the scene at plane point (u, v) frame units: the material, or the radiance at one node. */
  pilot(u: number, v: number): number;
  /** Scene lookups performed so far (material or radiance queries), for diagnostics. */
  readonly lookups: number;
  /**
   * The chart material that every kernel tap of the last `site` call read, when they all read one material (its value is
   * then a function of that material and the site's CFA channel only); −1 when unknown or mixed.
   */
  readonly uniformMaterial: number;
  /** Whether `uniformMaterial` is tracked in the current window (otherwise it is not meaningful). */
  readonly tracksMaterial: boolean;
}

const OFFSET_TOLERANCE = 1e-9;
/** Largest cache window, in sites or lattice points; larger windows are evaluated without caching. */
const CACHE_LIMIT = 1 << 22;
/** Largest band of looked-up lattice materials per group, in lattice points (a band that would be larger restarts at the window). */
const BAND_LIMIT = 1 << 22;

/**
 * Expected photo electrons per site: μ_c(i, j) = Σ_o w_o Σ_λ A_c(λ) Σ_t K_λ(t)·L(p_o(i, j) − t, λ), where p_o is the
 * query point of offset o and K the diffraction kernel (a single unit tap without diffraction). This is the sum the
 * facade's environment chain forms for a still, rectilinear, distortion-free planar scene, where the
 * radiance-to-irradiance factor is the same at every site (docs/DISPLAY_VIEW.md, "Expected signal").
 *
 * With diffraction, offsets that share a fractional shift read one lattice, and their kernels are combined in advance:
 * C_c(d) = Σ_members w·Σ_λ A_c(λ)·K_λ(t)·L(λ) over the taps t that reach lattice offset d. A neutral material's radiance
 * is its reflectance times the white radiance, so all neutral materials share one combined kernel per channel.
 */
export function createDisplayViewExpectedSignal(input: DisplayViewExpectedSignalInput): DisplayViewExpectedSignal {
  const W = input.nativeWidth, H = input.nativeHeight, g = 2 / input.outputWidth, nodes = input.wavelengthsNm.length;
  const R = input.kernels ? input.kernels.radius : 0, size = 2 * R + 1;
  if (input.kernels && input.kernels.perNode.length !== nodes) throw new InvalidConfigurationError("Display view kernels must match the spectral nodes.");
  if (!input.kernels && !input.queryPoint) throw new InvalidConfigurationError("Display view needs the environment query points without diffraction.");
  const A = input.electronsPerRadiance, scene = input.scene, offsets = input.offsets, channelAt = input.channelAt;
  const kernelAt = (node: number, t: number): number => (input.kernels ? input.kernels.perNode[node]![t]! : 1);
  // Materials: neutral ones by reflectance, spectral ones by index.
  let reflectance = new Float64Array(0), spectralIndex = new Int32Array(0);
  const spectral: Float64Array[] = [];
  if (scene.kind === "materials") {
    reflectance = new Float64Array(scene.materials.length); spectralIndex = new Int32Array(scene.materials.length).fill(-1);
    scene.materials.forEach((m, index) => { if ("neutral" in m) reflectance[index] = m.neutral; else { spectralIndex[index] = spectral.length; spectral.push(m.radiance); } });
  }
  // Offsets grouped by fractional shift: offsets that differ by whole sites share one lattice.
  const frac = (v: number): number => { const f = v - Math.floor(v); return f > 1 - OFFSET_TOLERANCE || f < OFFSET_TOLERANCE ? 0 : f; };
  interface Group { fx: number; fy: number; members: { ix: number; iy: number; weight: number }[]; minIx: number; maxIx: number; minIy: number; maxIy: number;
    cw: number; ch: number; neutral: Float64Array[]; spectral: Float64Array[][]; perNode: Float64Array[][]; cache: Int32Array | Float64Array; cx0: number; cy0: number; cpw: number; cph: number }
  const groups: Group[] = [];
  for (const o of offsets) {
    const fx = frac(o.x), fy = frac(o.y), ix = Math.round(o.x - fx), iy = Math.round(o.y - fy);
    let group = groups.find((q) => Math.abs(q.fx - fx) <= OFFSET_TOLERANCE && Math.abs(q.fy - fy) <= OFFSET_TOLERANCE);
    if (!group) { group = { fx, fy, members: [], minIx: ix, maxIx: ix, minIy: iy, maxIy: iy, cw: 0, ch: 0, neutral: [], spectral: [], perNode: [], cache: new Int32Array(0), cx0: 0, cy0: 0, cpw: 0, cph: 0 }; groups.push(group); }
    group.members.push({ ix, iy, weight: o.weight });
    group.minIx = Math.min(group.minIx, ix); group.maxIx = Math.max(group.maxIx, ix); group.minIy = Math.min(group.minIy, iy); group.maxIy = Math.max(group.maxIy, iy);
  }
  if (input.kernels) for (const group of groups) {
    // Combined kernel over lattice offsets d = (ix − tu, iy − tv), stored at (d − min + R).
    const cw = group.maxIx - group.minIx + size, ch = group.maxIy - group.minIy + size;
    group.cw = cw; group.ch = ch;
    const combine = (value: (c: number, node: number, t: number) => number): Float64Array[] => [0, 1, 2].map((c) => {
      const out = new Float64Array(cw * ch);
      for (const member of group.members) for (let tv = -R, t = 0; tv <= R; tv++) for (let tu = -R; tu <= R; tu++, t++) {
        let sum = 0;
        for (let n = 0; n < nodes; n++) sum += value(c, n, t);
        const index = (member.iy - tv - group.minIy + R) * cw + (member.ix - tu - group.minIx + R);
        out[index] = out[index]! + member.weight * sum;
      }
      return out;
    });
    if (scene.kind === "materials") {
      group.neutral = combine((c, n, t) => A[c]![n]! * kernelAt(n, t) * scene.whiteRadiance[n]!);
      const perMaterial = spectral.map((radiance) => combine((c, n, t) => A[c]![n]! * kernelAt(n, t) * radiance[n]!));
      group.spectral = [0, 1, 2].map((c) => perMaterial.map((tables) => tables[c]!));
    } else {
      // Radiance scenes: combined kernels per node, applied to the cached radiance at each node.
      group.perNode = Array.from({ length: nodes }, (_, n) => combine((c, node, t) => (node === n ? A[c]![n]! * kernelAt(n, t) : 0)));
    }
  }
  // Neutral tap-0 signal per channel and spectral per material, for the direct (no-kernel) path.
  const neutralDirect = scene.kind === "materials" ? [0, 1, 2].map((c) => { let s = 0; for (let n = 0; n < nodes; n++) s += A[c]![n]! * scene.whiteRadiance[n]!; return s; }) : [];
  const spectralDirect = [0, 1, 2].map((c) => spectral.map((radiance) => { let s = 0; for (let n = 0; n < nodes; n++) s += A[c]![n]! * radiance[n]!; return s; }));
  let lookups = 0;
  const point = new Float64Array(2);
  const materialSignalDirect = (m: number, c: number): number => {
    const si = spectralIndex[m];
    if (si === undefined) throw new InvalidConfigurationError("Unknown chart material.");
    return si < 0 ? reflectance[m]! * neutralDirect[c]! : spectralDirect[c]![si]!;
  };
  /** Without diffraction: one site from the environment's own query points. */
  function directSite(x: number, y: number): number {
    const c = channelAt(x, y);
    let sum = 0;
    for (let o = 0; o < offsets.length; o++) {
      input.queryPoint!(x, y, o, point);
      let value: number;
      if (scene.kind === "materials") { value = materialSignalDirect(scene.materialAt(point[0]!, point[1]!), c); lookups++; }
      else { value = 0; for (let n = 0; n < nodes; n++) value += A[c]![n]! * scene.radianceAt(point[0]!, point[1]!, input.wavelengthsNm[n]!); lookups += nodes; }
      sum += offsets[o]!.weight * value;
    }
    return sum;
  }
  // Lattice point (p, q) of a group: the facade's lattice formula (createDiffractedPlanarProvider).
  const latticeU = (group: Group, p: number): number => (group.fx === 0 ? (p + 0.5 - W / 2) * g : (p + 0.5 + group.fx - W / 2) * g);
  const latticeV = (group: Group, q: number): number => (group.fy === 0 ? -(q + 0.5 - H / 2) * g : -(q + 0.5 + group.fy - H / 2) * g);
  const radianceScratch = new Float64Array(nodes);
  /** Material (or radiance at each node, into radianceScratch) of a group's lattice point, from the window cache when it holds it. */
  function latticeMaterial(group: Group, p: number, q: number): number {
    const i = p - group.cx0, j = q - group.cy0, cached = i >= 0 && j >= 0 && i < group.cpw && j < group.cph;
    if (cached) { const m = group.cache[j * group.cpw + i]!; if (m >= 0) return m; }
    const m = (scene as Extract<DisplayViewScene, { kind: "materials" }>).materialAt(latticeU(group, p), latticeV(group, q));
    lookups++;
    if (cached) group.cache[j * group.cpw + i] = m;
    return m;
  }
  function latticeRadiance(group: Group, p: number, q: number): Float64Array {
    const i = p - group.cx0, j = q - group.cy0, cached = i >= 0 && j >= 0 && i < group.cpw && j < group.cph, cache = group.cache as Float64Array;
    if (cached && !Number.isNaN(cache[(j * group.cpw + i) * nodes]!)) { for (let n = 0; n < nodes; n++) radianceScratch[n] = cache[(j * group.cpw + i) * nodes + n]!; return radianceScratch; }
    const u = latticeU(group, p), v = latticeV(group, q);
    for (let n = 0; n < nodes; n++) radianceScratch[n] = (scene as Extract<DisplayViewScene, { kind: "radiance" }>).radianceAt(u, v, input.wavelengthsNm[n]!);
    lookups += nodes;
    if (cached) for (let n = 0; n < nodes; n++) cache[(j * group.cpw + i) * nodes + n] = radianceScratch[n]!;
    return radianceScratch;
  }
  /** With diffraction: one site through the combined kernels on each group's lattice. */
  function kernelSite(x: number, y: number): number {
    const c = channelAt(x, y);
    let sum = 0;
    for (const group of groups) {
      const p0 = x + group.minIx - R, q0 = y + group.minIy - R, cw = group.cw, ch = group.ch;
      if (scene.kind === "materials") {
        const nk = group.neutral[c]!, sk = group.spectral[c]!;
        for (let dy = 0; dy < ch; dy++) for (let dx = 0; dx < cw; dx++) {
          const m = latticeMaterial(group, p0 + dx, q0 + dy), si = spectralIndex[m];
          if (si === undefined) throw new InvalidConfigurationError("Unknown chart material.");
          sum += si < 0 ? reflectance[m]! * nk[dy * cw + dx]! : sk[si]![dy * cw + dx]!;
        }
      } else {
        for (let dy = 0; dy < ch; dy++) for (let dx = 0; dx < cw; dx++) {
          const radiance = latticeRadiance(group, p0 + dx, q0 + dy);
          for (let n = 0; n < nodes; n++) sum += group.perNode[n]![c]![dy * cw + dx]! * radiance[n]!;
        }
      }
    }
    return sum;
  }
  // Filled windows (chart materials with diffraction, every lattice point of the window cacheable): each group keeps a band of
  // looked-up lattice materials that covers the window's rows and grows to the right as the windows of a display row move
  // right, with summed-area tables of material changes. A site whose kernel reads one material only (each group's rectangle
  // uniform, the same material in all) takes the value of the same sum over that material, precomputed below in the same
  // order; other sites run the same sum from the band. Either way each site's value is the same sequence of operations as
  // kernelSite, so it is bit-identical. The scene lookup count stays the count kernelSite's lazy window cache makes (each
  // cache point a computed site reads counts once per window, points outside the cache once per read): the rectangles of
  // the sites computed in a window are counted when the window closes (windowLookups).
  const uniformSite = scene.kind === "materials" && input.kernels ? [0, 1, 2].map((c) => Float64Array.from(scene.materials, (_, m) => {
    const si = spectralIndex[m]!;
    let sum = 0;
    for (const group of groups) {
      const nk = group.neutral[c]!, sk = si < 0 ? nk : group.spectral[c]![si]!;
      for (let t = 0; t < group.cw * group.ch; t++) sum += si < 0 ? reflectance[m]! * nk[t]! : sk[t]!;
    }
    return sum;
  })) : [];
  const allNeutral = spectral.length === 0;
  /**
   * A group's band: lattice rows [y0, y0 + rows), columns [x0, x0 + filled) looked up, row stride `capacity`. `material`,
   * `reflectance` (neutral-only charts) and the summed-area tables of left changes (`changeLeft`, 1 where a point's material
   * differs from its left neighbour's) and upper changes (`changeUp`), (rows + 1) × (capacity + 1).
   */
  interface Band { x0: number; y0: number; rows: number; capacity: number; filled: number; material: Int32Array; reflectance: Float64Array; changeLeft: Int32Array; changeUp: Int32Array; v: Float64Array }
  const bands: Band[] = groups.map(() => ({ x0: 0, y0: 0, rows: 0, capacity: 0, filled: 0, material: new Int32Array(0), reflectance: new Float64Array(0),
    changeLeft: new Int32Array(0), changeUp: new Int32Array(0), v: new Float64Array(0) }));
  /** Makes the band of group g cover lattice columns [x0, x1) of rows [y0, y0 + rows), extending it to the right when it can. */
  function coverBand(g: number, x0: number, x1: number, y0: number, rows: number): void {
    const group = groups[g]!, band = bands[g]!, materials = scene as Extract<DisplayViewScene, { kind: "materials" }>;
    if (!(band.rows === rows && band.y0 === y0 && x0 >= band.x0 && x1 - band.x0 <= band.capacity)) {
      const capacity = Math.max(x1 - x0, Math.min(Math.floor(BAND_LIMIT / rows), W + 2 * (x1 - x0)));
      const size = rows * capacity, tables = (rows + 1) * (capacity + 1);
      band.x0 = x0; band.y0 = y0; band.rows = rows; band.capacity = capacity; band.filled = 0;
      if (band.material.length < size) { band.material = new Int32Array(size); band.reflectance = new Float64Array(allNeutral ? size : 0); }
      if (band.changeLeft.length < tables) { band.changeLeft = new Int32Array(tables); band.changeUp = new Int32Array(tables); }
      band.changeLeft.fill(0, 0, capacity + 1); band.changeUp.fill(0, 0, capacity + 1);
      for (let j = 0; j < rows; j++) { band.changeLeft[(j + 1) * (capacity + 1)] = 0; band.changeUp[(j + 1) * (capacity + 1)] = 0; }
      if (band.v.length < rows) band.v = new Float64Array(rows);
      for (let j = 0; j < rows; j++) band.v[j] = latticeV(group, y0 + j);
    }
    const stride = band.capacity, S1 = stride + 1, material = band.material, left = band.changeLeft, up = band.changeUp;
    for (let i = band.filled; i < x1 - band.x0; i++) {
      const u = latticeU(group, band.x0 + i);
      for (let j = 0; j < rows; j++) {
        const m = materials.materialAt(u, band.v[j]!);
        if (spectralIndex[m] === undefined) throw new InvalidConfigurationError("Unknown chart material.");
        material[j * stride + i] = m;
        if (allNeutral) band.reflectance[j * stride + i] = reflectance[m]!;
        const changedLeft = i > 0 && material[j * stride + i - 1] !== m ? 1 : 0, changedUp = j > 0 && material[(j - 1) * stride + i] !== m ? 1 : 0;
        left[(j + 1) * S1 + i + 1] = left[j * S1 + i + 1]! + left[(j + 1) * S1 + i]! - left[j * S1 + i]! + changedLeft;
        up[(j + 1) * S1 + i + 1] = up[j * S1 + i + 1]! + up[(j + 1) * S1 + i]! - up[j * S1 + i]! + changedUp;
      }
    }
    band.filled = Math.max(band.filled, x1 - band.x0);
  }
  const rectSum = (sat: Int32Array, S1: number, i0: number, j0: number, i1: number, j1: number): number =>
    sat[j1 * S1 + i1]! - sat[j0 * S1 + i1]! - sat[j1 * S1 + i0]! + sat[j0 * S1 + i0]!;
  let filled = false;
  /** Sites outside the site window computed in this window (x, y pairs in window coordinates); their rectangles count when the window closes. */
  let outsideSites: number[] = [];
  let marks = new Uint8Array(0), cover = new Uint8Array(0);
  /** A site of a filled window: (i, j) are its coordinates in the site window, inside or outside it. */
  function filledSite(x: number, y: number, i: number, j: number): number {
    const c = channelAt(x, y), inside = i >= 0 && j >= 0 && i < sw && j < sh;
    if (inside) {
      let m = -1;
      for (let g = 0; g < groups.length; g++) {
        const group = groups[g]!, band = bands[g]!, S1 = band.capacity + 1, bi = x + group.minIx - R - band.x0, bj = y + group.minIy - R - band.y0;
        if (rectSum(band.changeLeft, S1, bi + 1, bj, bi + group.cw, bj + group.ch) !== 0 || rectSum(band.changeUp, S1, bi, bj + 1, bi + group.cw, bj + group.ch) !== 0) { m = -2; break; }
        const own = band.material[bj * band.capacity + bi]!;
        if (m === -1) m = own; else if (own !== m) { m = -2; break; }
      }
      if (m >= 0) { lastMaterial = m; return uniformSite[c]![m]!; }
    }
    lastMaterial = -1;
    let sum = 0;
    for (let g = 0; g < groups.length; g++) {
      const group = groups[g]!, band = bands[g]!, cw = group.cw, ch = group.ch, nk = group.neutral[c]!, sk = group.spectral[c]!, stride = band.capacity;
      const p0 = x + group.minIx - R, q0 = y + group.minIy - R, bi = p0 - band.x0, bj = q0 - band.y0;
      if (inside && allNeutral) {
        const refl = band.reflectance;
        for (let dy = 0, t = 0; dy < ch; dy++) {
          const row = (bj + dy) * stride + bi;
          for (let dx = 0; dx < cw; dx++, t++) sum += refl[row + dx]! * nk[t]!;
        }
      } else if (inside) {
        const material = band.material;
        for (let dy = 0, t = 0; dy < ch; dy++) {
          const row = (bj + dy) * stride + bi;
          for (let dx = 0; dx < cw; dx++, t++) {
            const m = material[row + dx]!, si = spectralIndex[m]!;
            sum += si < 0 ? reflectance[m]! * nk[t]! : sk[si]![t]!;
          }
        }
      } else {
        for (let dy = 0; dy < ch; dy++) for (let dx = 0; dx < cw; dx++) {
          const ci = i + dx, cj = j + dy;
          let m: number;
          if (ci >= 0 && cj >= 0 && ci < group.cpw && cj < group.cph) m = band.material[(bj + dy) * stride + bi + dx]!;
          else m = (scene as Extract<DisplayViewScene, { kind: "materials" }>).materialAt(latticeU(group, p0 + dx), latticeV(group, q0 + dy));
          const si = spectralIndex[m];
          if (si === undefined) throw new InvalidConfigurationError("Unknown chart material.");
          sum += si < 0 ? reflectance[m]! * nk[dy * cw + dx]! : sk[si]![dy * cw + dx]!;
        }
      }
    }
    return sum;
  }
  /** Lattice points of an outside site's rectangles that lie outside the window caches (kernelSite looks these up on every read). */
  function outsideLookups(i: number, j: number): number {
    let count = 0;
    for (const group of groups) {
      const w = Math.max(0, Math.min(i + group.cw, group.cpw) - Math.max(i, 0)), h = Math.max(0, Math.min(j + group.ch, group.cph) - Math.max(j, 0));
      count += group.cw * group.ch - w * h;
    }
    return count;
  }
  // Site values of filled windows persist across windows (a site's value does not depend on the window): rows of native
  // sites in a ring of a power-of-two number of rows, row y in slot y mod ringRows. The window's site cache still holds the
  // sites read in the window, which is also what its lookup count needs.
  let ringRows = 0, ringOn = false, ring = new Float64Array(0), ringMaterial = new Int32Array(0), ringRowId = new Int32Array(0), windowMaterial = new Int32Array(0), lastMaterial = -1;
  /** A filled-window site read outside the site window: counted as kernelSite counts it. */
  function outsideRead(i: number, j: number): void { lookups += outsideLookups(i, j); outsideSites.push(i, j); }
  /** A site from the ring; on a miss (re)claims the row's slot when another row holds it, computes the site and stores it. */
  function ringRead(x: number, y: number, i: number, j: number): number {
    const slot = y & (ringRows - 1), q = slot * W + x;
    if (ringRowId[slot] === y) { const v = ring[q]!; if (v === v) { lastMaterial = ringMaterial[q]!; return v; } }
    else { ringRowId[slot] = y; ring.fill(NaN, slot * W, (slot + 1) * W); }
    const v = filledSite(x, y, i, j);
    ring[q] = v; ringMaterial[q] = lastMaterial;
    return v;
  }
  /** A site not in the window's site cache: from the ring, a filled window without the ring, the lazy window caches, or uncached. */
  function siteMiss(x: number, y: number, i: number, j: number, cached: boolean): number {
    if (ringOn) {
      if (!cached) { outsideRead(i, j); return ringRead(x, y, i, j); }
      const v = ringRead(x, y, i, j);
      siteCache[j * sw + i] = v; windowMaterial[j * sw + i] = lastMaterial;
      return v;
    }
    if (filled && !cached) outsideRead(i, j);
    const v = filled ? filledSite(x, y, i, j) : input.kernels ? kernelSite(x, y) : directSite(x, y);
    if (cached) siteCache[j * sw + i] = v;
    return v;
  }
  /**
   * Lattice points of the closing window that kernelSite's lazy cache would have looked up: per group, the window cache points
   * covered by the rectangles of the computed sites (the site cache's filled entries and the outside sites), a box dilation.
   */
  function windowLookups(): number {
    let total = 0;
    for (const group of groups) {
      const cw = group.cw, ch = group.ch, cpw = group.cpw, cph = group.cph, ew = cpw + cw - 1, eh = cph + ch - 1;
      // Top-left marks in extended coordinates (window coordinates + (cw − 1, ch − 1)), and their bounding box.
      if (marks.length < ew * eh) { marks = new Uint8Array(ew * eh); }
      let x0 = ew, x1 = -1, y0 = eh, y1 = -1;
      const mark = (ei: number, ej: number): void => {
        if (ei < 0 || ej < 0 || ei >= ew || ej >= eh) return;
        marks[ej * ew + ei] = 1;
        if (ei < x0) x0 = ei; if (ei > x1) x1 = ei; if (ej < y0) y0 = ej; if (ej > y1) y1 = ej;
      };
      for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) if (!Number.isNaN(siteCache[j * sw + i]!)) mark(i + cw - 1, j + ch - 1);
      for (let k = 0; k < outsideSites.length; k += 2) mark(outsideSites[k]! + cw - 1, outsideSites[k + 1]! + ch - 1);
      if (x1 < 0) continue;
      // Cache point (i, j) is covered when a mark lies in extended columns [i, i + cw) and rows [j, j + ch): a horizontal
      // then a vertical running count over the marks' box (outside it nothing is covered).
      const i0 = Math.max(0, x0 - cw + 1), i1 = Math.min(cpw - 1, x1), cwid = i1 - i0 + 1;
      if (cover.length < cwid * (y1 - y0 + 1)) cover = new Uint8Array(cwid * (y1 - y0 + 1));
      for (let r = y0; r <= y1; r++) {
        let run = 0;
        for (let e = i0; e <= i1 + cw - 1; e++) {
          run += marks[r * ew + e]!;
          if (e - cw >= i0) run -= marks[r * ew + e - cw]!;
          if (e >= i0 + cw - 1) cover[(r - y0) * cwid + e - cw + 1 - i0] = run > 0 ? 1 : 0;
        }
        marks.fill(0, r * ew + x0, r * ew + x1 + 1);
      }
      for (let i = 0; i < cwid; i++) {
        let run = 0;
        for (let r = y0; r <= y1 + ch - 1; r++) {
          if (r <= y1) run += cover[(r - y0) * cwid + i]!;
          if (r - ch >= y0 && r - ch <= y1) run -= cover[(r - ch - y0) * cwid + i]!;
          const j = r - ch + 1;
          if (j >= 0 && j < cph && run > 0) total++;
        }
      }
    }
    return total;
  }
  let sx0 = 0, sy0 = 0, sw = 0, sh = 0, siteCache = new Float64Array(0);
  const pilotNode = input.wavelengthsNm[Math.floor(nodes / 2)]!;
  return {
    get lookups(): number { return lookups + (filled ? windowLookups() : 0); },
    get uniformMaterial(): number { return lastMaterial; },
    get tracksMaterial(): boolean { return ringOn; },
    window(x0: number, y0: number, x1: number, y1: number): void {
      if (filled) lookups += windowLookups();
      filled = false; ringOn = false; outsideSites = [];
      sx0 = x0; sy0 = y0; sw = Math.max(0, x1 - x0); sh = Math.max(0, y1 - y0);
      if (sw * sh > CACHE_LIMIT) { sw = 0; sh = 0; }
      if (siteCache.length < sw * sh) siteCache = new Float64Array(sw * sh);
      siteCache.fill(NaN, 0, sw * sh);
      if (!input.kernels) return;
      for (const group of groups) {
        group.cx0 = x0 + group.minIx - R; group.cy0 = y0 + group.minIy - R;
        group.cpw = sw === 0 ? 0 : sw + group.cw - 1; group.cph = sh === 0 ? 0 : sh + group.ch - 1;
        if (group.cpw * group.cph * (scene.kind === "materials" ? 1 : nodes) > CACHE_LIMIT) { group.cpw = 0; group.cph = 0; }
      }
      // Chart materials whose every group caches the whole window: the filled path (bands). Otherwise the lazy window caches.
      if (scene.kind === "materials" && sw > 0 && groups.every((group) => group.cpw > 0)) {
        groups.forEach((group, g) => coverBand(g, group.cx0, group.cx0 + group.cpw, group.cy0, group.cph));
        filled = true;
        if (windowMaterial.length < sw * sh) windowMaterial = new Int32Array(sw * sh);
        // A ring of at least twice the window's rows keeps the rows of the previous display row's windows.
        if (ringRows < 2 * sh) {
          const rows = 2 ** Math.ceil(Math.log2(2 * sh));
          if (rows * W <= CACHE_LIMIT) { ringRows = rows; ring = new Float64Array(rows * W).fill(NaN); ringMaterial = new Int32Array(rows * W); ringRowId = new Int32Array(rows).fill(-1); }
        }
        ringOn = ringRows >= 2 * sh;
        return;
      }
      for (const group of groups) {
        const n = group.cpw * group.cph * (scene.kind === "materials" ? 1 : nodes);
        if (scene.kind === "materials") { if (group.cache.length < n || !(group.cache instanceof Int32Array)) group.cache = new Int32Array(n); group.cache.fill(-1, 0, n); }
        else { if (group.cache.length < n || !(group.cache instanceof Float64Array)) group.cache = new Float64Array(n); group.cache.fill(NaN, 0, n); }
      }
    },
    site(x: number, y: number): number {
      // The window's site cache first (with the ring: the sites read in this window, which its lookup count needs too).
      const i = x - sx0, j = y - sy0, cached = i >= 0 && j >= 0 && i < sw && j < sh;
      if (cached) { const w = j * sw + i, v = siteCache[w]!; if (v === v) { if (ringOn) lastMaterial = windowMaterial[w]!; return v; } }
      return siteMiss(x, y, i, j, cached);
    },
    pilot(u: number, v: number): number {
      lookups++;
      return scene.kind === "materials" ? scene.materialAt(u, v) : scene.radianceAt(u, v, pilotNode);
    }
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Normal-distribution helpers.

/** Standard normal density. */
function phi(z: number): number { return 0.3989422804014327 * Math.exp(-0.5 * z * z); }
/**
 * Standard normal distribution function, Φ(z) = 1 − Q(z), with Q from the rational approximation 26.2.17 of
 * Abramowitz & Stegun, Handbook of Mathematical Functions (NBS AMS 55, 1964; free, US government work):
 * absolute error below 7.5e-8.
 */
function bigPhi(z: number): number {
  const x = Math.abs(z), t = 1 / (1 + 0.2316419 * x);
  const q = phi(x) * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - q : q;
}
/** Beyond this many standard deviations from a clip level the clip changes the moments by less than 1e-15 of σ². */
const CLIP_REACH_SIGMA = 8.5;

/**
 * Internal (exported for tests). Moments of min(Y, top) for Y ~ N(m, v): mean, variance and the slope d E/d m = P(Y < top). Exact for a normal Y:
 * E[min(Y,t)] = m − s·(φ(z) − z·(1 − Φ(z))), z = (t − m)/s.
 */
export function upperClip(m: number, v: number, top: number, out: Float64Array): void {
  if (!(v > 0)) { const c = m < top ? m : top; out[0] = c; out[1] = 0; out[2] = m < top ? 1 : 0; return; }
  const s = Math.sqrt(v), z = (top - m) / s;
  if (z > CLIP_REACH_SIGMA) { out[0] = m; out[1] = v; out[2] = 1; return; }
  if (z < -CLIP_REACH_SIGMA) { out[0] = top; out[1] = 0; out[2] = 0; return; }
  const P = bigPhi(z), d = phi(z);
  const mean = m - s * (d - z * (1 - P));
  // E[min(Y,t)²] = m²Φ − 2msφ + s²(Φ − zφ) + t²(1 − Φ).
  const second = m * m * P - 2 * m * s * d + v * (P - z * d) + top * top * (1 - P);
  out[0] = mean; out[1] = Math.max(0, second - mean * mean); out[2] = P;
}
/**
 * Internal (exported for tests). Moments of clip(Y, 0, 1) for Y with mean m, variance v and standardized skewness γ
 * (default 0: normal, closed form). The mean carries the first-order Edgeworth term of a skewed Y: for
 * E[(Y − t)₊] it adds s·γ·z·φ(z)/6 at z = (t − m)/s, so E[clip] gains (s·γ/6)·(a·φ(a) − b·φ(b)) with a = −m/s,
 * b = (1 − m)/s (docs/DISPLAY_VIEW.md, "Readout"). |γ| is limited to 1, where the first-order term is still a small part.
 */
export function unitClip(m: number, v: number, out: Float64Array, skewness = 0): void {
  if (!(v > 0)) { const c = m < 0 ? 0 : m > 1 ? 1 : m; out[0] = c; out[1] = 0; out[2] = m > 0 && m < 1 ? 1 : 0; return; }
  const s = Math.sqrt(v), a = -m / s, b = (1 - m) / s;
  if (a < -CLIP_REACH_SIGMA && b > CLIP_REACH_SIGMA) { out[0] = m; out[1] = v; out[2] = 1; return; }
  const Pa = a < -CLIP_REACH_SIGMA ? 0 : bigPhi(a), Pb = b > CLIP_REACH_SIGMA ? 1 : bigPhi(b), da = a < -CLIP_REACH_SIGMA ? 0 : phi(a), db = b > CLIP_REACH_SIGMA ? 0 : phi(b);
  const inside = Pb - Pa, gamma = skewness > 1 ? 1 : skewness < -1 ? -1 : skewness;
  const mean = m * inside + s * (da - db) + (1 - Pb) + (gamma === 0 ? 0 : s * gamma / 6 * ((a < -CLIP_REACH_SIGMA ? 0 : a * da) - (b > CLIP_REACH_SIGMA ? 0 : b * db)));
  // E[Y² 1(0<Y<1)] = (m² + s²)(Φb − Φa) + 2ms(φa − φb) + s²(aφa − bφb); plus P(Y ≥ 1).
  const aa = a < -CLIP_REACH_SIGMA ? 0 : a * da, bb = b > CLIP_REACH_SIGMA ? 0 : b * db;
  const second = (m * m + v) * inside + 2 * m * s * (da - db) + v * (aa - bb) + (1 - Pb);
  out[0] = mean; out[1] = Math.max(0, second - mean * mean); out[2] = inside;
}
/** Gauss–Legendre nodes and weights on [−1, 1], 16 points (computed once by Newton iteration on P_16). */
const GL = ((): { x: Float64Array; w: Float64Array } => {
  const n = 16, x = new Float64Array(n), w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let z = Math.cos(Math.PI * (i + 0.75) / (n + 0.5)), dp = 0;
    for (let it = 0; it < 100; it++) {
      let p0 = 1, p1 = z;
      for (let k = 2; k <= n; k++) { const p2 = ((2 * k - 1) * z * p1 - (k - 1) * p0) / k; p0 = p1; p1 = p2; }
      dp = n * (z * p1 - p0) / (z * z - 1);
      const dz = p1 / dp;
      z -= dz;
      if (Math.abs(dz) < 1e-16) break;
    }
    x[i] = z; w[i] = 2 / ((1 - z * z) * dp * dp);
  }
  return { x, w };
})();
/** Internal (exported for tests). Positive Reinhard per channel then the clip to [0, 1]: h(x) = x/(1 + x) for x > 0, else 0 (its slope h' = 1/(1 + x)²). */
export function reinhardMoments(m: number, v: number, out: Float64Array): void {
  if (!(v > 0)) { out[0] = m > 0 ? m / (1 + m) : 0; out[1] = 0; out[2] = m > 0 ? 1 / ((1 + m) * (1 + m)) : 0; return; }
  const s = Math.sqrt(v), lo = Math.max(0, m - CLIP_REACH_SIGMA * s), hi = m + CLIP_REACH_SIGMA * s;
  if (!(hi > lo)) { out[0] = 0; out[1] = 0; out[2] = 0; return; }
  // Composite 16-point Gauss–Legendre over [lo, hi] in 4 panels; h is smooth there (the kink at 0 is an end point).
  let e1 = 0, e2 = 0, ed = 0;
  const panels = 4, width = (hi - lo) / panels;
  for (let p = 0; p < panels; p++) {
    const c = lo + (p + 0.5) * width, half = width / 2;
    for (let k = 0; k < 16; k++) {
      const x = c + half * GL.x[k]!, weight = half * GL.w[k]! * phi((x - m) / s) / s, h = x / (1 + x);
      e1 += weight * h; e2 += weight * h * h; ed += weight / ((1 + x) * (1 + x));
    }
  }
  out[0] = e1; out[1] = Math.max(0, e2 - e1 * e1); out[2] = ed;
}

// ---------------------------------------------------------------------------------------------------------------
// The display view renderer.

/** Per CFA channel: normalized RAW value = (code − black)/(white − black) of a site with e expected electrons. */
export interface DisplayViewChannelReadout {
  /** Normalized value per electron: digitalGain / (conversionGain·(white − black)). */
  perElectron: number;
  /** Mean dark electrons per site during the exposure. */
  darkElectrons: number;
  /** Variance of the normalized value not proportional to the electrons: read noise and ADC quantization. */
  constantVariance: number;
}

export interface DisplayViewSetup {
  frameWidth: number;
  frameHeight: number;
  /** Native site of output pixel (0, 0). */
  margin: number;
  nativeWidth: number;
  nativeHeight: number;
  viewWidth: number;
  viewHeight: number;
  region: { x: number; y: number; width: number; height: number };
  /** Samples per axis in display pixels whose pilot finds detail; uniform ones use a quarter (at least 1). */
  samplesPerAxis: number;
  /** Sites beyond the footprint that can affect its pixels (demosaic, filter and kernel reach), for the pilot. */
  reachSites: number;
  bitDepth: 8 | 16;
  seed: number;
  signal: DisplayViewExpectedSignal;
  readout: readonly [DisplayViewChannelReadout, DisplayViewChannelReadout, DisplayViewChannelReadout];
  /** Bilinear demosaic kernels per absolute CFA phase (phaseY·2 + phaseX): for each output channel, (dx, dy, weight) triples. */
  demosaic: readonly (readonly (readonly DisplayViewKernelTap[])[])[];
  /**
   * The demosaic whose pixel statistics the view reproduces, per phase: one candidate (bilinear) or AHD's two directional
   * linear candidates (`ahdCandidateKernels`), each a kernel per output channel. Default: the bilinear kernels.
   */
  candidates?: readonly (readonly (readonly (readonly DisplayViewKernelTap[])[])[])[];
  /** White-balance gains applied to the normalized camera channels and the highlight clip level (the smallest gain). */
  gains: readonly [number, number, number];
  clipLevel: number;
  /** Camera channels (after WB and the highlight clip) → linear sRGB: rows are output components. */
  matrix: readonly (readonly number[])[];
  toneCurve: "identity" | "positive-reinhard-per-channel";
  /**
   * AHD only: the low-signal correction. `labMatrix` is the camera → XYZ matrix AHD measures homogeneity with (the profile's
   * matrix times the white-balance gains); samples whose pixel variance (linear light) exceeds `thresholdVariance` add the
   * correction of a flat neighbourhood with their channel means, estimated once per quantized state with `drawsPerState` draws.
   */
  ahdCorrection?: { labMatrix: readonly (readonly number[])[]; drawsPerState: number; thresholdVariance: number };
  yieldControl(): Promise<void>;
  checkAbort(): void;
}

export interface DisplayViewRenderResult {
  samples: Uint8Array | Uint16Array;
  /** Mean linear-light value of each display pixel before the noise draw (diagnostics and validation). */
  expected: Float64Array;
  /** Noise standard deviation of each display pixel's components in linear light (square root of the covariance diagonal). */
  noiseStd: Float64Array;
  sampleCount: number;
  siteCount: number;
  /** Display pixels whose pilot found detail (full samples) and uniform ones (a quarter per axis). */
  detailPixelCount: number;
  uniformPixelCount: number;
  /** Display pixels whose expected value includes the AHD low-signal correction. */
  ahdCorrectedPixelCount: number;
}

/** One tap of a linear demosaic kernel: the site at (dx, dy) from the pixel, and its weight. */
export interface DisplayViewKernelTap { dx: number; dy: number; weight: number }

/**
 * AHD's two directional candidates (`createAhdDemosaicTask`, after Hirakawa & Parks 2005) as linear kernels, for a pixel of
 * CFA phase (phaseX, phaseY) of an RGGB mosaic: green along the rows (or columns) with the 5-tap filter
 * [−1/4, 1/2, 1/2, 1/2, −1/4], then red and blue from bilinearly interpolated colour differences against that green. Each
 * candidate is linear in the mosaic, so its kernel is its response to a unit site; AHD then picks one candidate per pixel
 * by homogeneity, which is the only non-linear step. Returns [horizontal, vertical], each [red, green, blue] kernels.
 */
export function ahdCandidateKernels(phaseX: number, phaseY: number): DisplayViewKernelTap[][][] {
  const role = (dx: number, dy: number): number => { const x = (phaseX + dx) & 1, y = (phaseY + dy) & 1; return y === 0 ? (x === 0 ? 0 : 1) : (x === 0 ? 1 : 2); };
  const evaluate = (site: (dx: number, dy: number) => number, horizontal: boolean): number[] => {
    const green = (dx: number, dy: number): number => {
      const c = site(dx, dy);
      if (role(dx, dy) === 1) return c;
      return horizontal ? (site(dx - 1, dy) + site(dx + 1, dy)) / 2 + (2 * c - site(dx - 2, dy) - site(dx + 2, dy)) / 4
        : (site(dx, dy - 1) + site(dx, dy + 1)) / 2 + (2 * c - site(dx, dy - 2) - site(dx, dy + 2)) / 4;
    };
    const diff = (dx: number, dy: number): number => site(dx, dy) - green(dx, dy);
    const out = [0, 0, 0], own = role(0, 0), g = green(0, 0);
    out[1] = g;
    if (own === 1) {
      const hRole = role(1, 0), vRole = 2 - hRole;
      out[hRole] = g + (diff(-1, 0) + diff(1, 0)) / 2;
      out[vRole] = g + (diff(0, -1) + diff(0, 1)) / 2;
    } else {
      out[own] = site(0, 0);
      out[2 - own] = g + (diff(-1, -1) + diff(1, -1) + diff(-1, 1) + diff(1, 1)) / 4;
    }
    return out;
  };
  return [true, false].map((horizontal) => {
    const kernels: DisplayViewKernelTap[][] = [[], [], []];
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const response = evaluate((x, y) => (x === dx && y === dy ? 1 : 0), horizontal);
      for (let c = 0; c < 3; c++) if (response[c] !== 0) kernels[c]!.push({ dx, dy, weight: response[c]! });
    }
    return kernels;
  });
}

/** 1-D overlaps of real output columns with one display column: first column index and the overlaps. */
function overlaps(start: number, end: number, limit: number): { first: number; w: Float64Array } {
  const first = Math.floor(start), last = Math.min(limit - 1, Math.ceil(end) - 1), w = new Float64Array(last - first + 1);
  for (let k = first; k <= last; k++) w[k - first] = Math.min(end, k + 1) - Math.max(start, k);
  return { first, w };
}
/**
 * Internal (exported for tests). Footprint sums along one axis, for the closed-form B_c (docs/DISPLAY_VIEW.md, "Demosaic correlation"). Native
 * coordinate parity decides the CFA: red columns/rows are even, blue odd. With w(k) the overlap of real column k:
 * - b(k) = w(k) + ½(w(k − 1) + w(k + 1)), the bilinear red/blue spread; sums of b² over even and odd native k;
 * - p(k) = w(k), q(k) = ¼(w(k − 1) + w(k + 1)) for green: sums of p², q² and p·q over even and odd native k;
 * - Σ w².
 */
export interface AxisSums { bEven: number; bOdd: number; ppEven: number; ppOdd: number; qqEven: number; qqOdd: number; pqEven: number; pqOdd: number; ww: number }
export function axisSums(start: number, end: number, limit: number, margin: number): AxisSums {
  const { first, w } = overlaps(start, end, limit);
  const at = (k: number): number => (k >= first && k < first + w.length ? w[k - first]! : 0);
  const s: AxisSums = { bEven: 0, bOdd: 0, ppEven: 0, ppOdd: 0, qqEven: 0, qqOdd: 0, pqEven: 0, pqOdd: 0, ww: 0 };
  for (let k = first - 1; k <= first + w.length; k++) {
    const p = at(k), q = (at(k - 1) + at(k + 1)) / 4, b = p + 2 * q, even = ((k + margin) & 1) === 0;
    if (even) { s.bEven += b * b; s.ppEven += p * p; s.qqEven += q * q; s.pqEven += p * q; } else { s.bOdd += b * b; s.ppOdd += p * p; s.qqOdd += q * q; s.pqOdd += p * q; }
    s.ww += p * p;
  }
  return s;
}
/** Internal (exported for tests). B for red, green and blue (Σ β² over the channel's sites, β normalized to unit sum) and Σ (w/A)². */
export function footprintWeights(x: AxisSums, y: AxisSums, area: number, out: Float64Array): void {
  const a2 = area * area;
  const green = (xpp: number, xqq: number, xpq: number, ypp: number, yqq: number, ypq: number): number =>
    xpp * ypp + xqq * ypp + xpp * yqq + 2 * xpq * ypp + 2 * xpp * ypq + 2 * xpq * ypq;
  out[0] = x.bEven * y.bEven / a2;
  // Green sites: (odd x, even y) and (even x, odd y).
  out[1] = (green(x.ppOdd, x.qqOdd, x.pqOdd, y.ppEven, y.qqEven, y.pqEven) + green(x.ppEven, x.qqEven, x.pqEven, y.ppOdd, y.qqOdd, y.pqOdd)) / a2;
  out[2] = x.bOdd * y.bOdd / a2;
  out[3] = x.ww * y.ww / a2;
}
/** AHD's dependence reach in sites (directional green ±2, colour differences ±1, homogeneity 4-neighbours and 3 × 3 sum). */
const AHD_REACH = 5, AHD_SIDE = 2 * AHD_REACH + 1;
/** Grid of flat-neighbourhood states for the AHD correction: steps per octave of the normalized channel mean, octaves below white. */
const AHD_KEY_STEPS = 8, AHD_KEY_OCTAVES = 12;
/** CFA role (0 red, 1 green, 2 blue) of each patch site (dy + 5)·11 + dx + 5, per phase (phaseY·2 + phaseX) of the centre. */
const AHD_ROLES = [0, 1, 2, 3].map((phase) => {
  const roles = new Uint8Array(AHD_SIDE * AHD_SIDE), px = phase & 1, py = phase >> 1;
  for (let dy = -AHD_REACH; dy <= AHD_REACH; dy++) for (let dx = -AHD_REACH; dx <= AHD_REACH; dx++) {
    const xx = (px + dx) & 1, yy = (py + dy) & 1;
    roles[(dy + AHD_REACH) * AHD_SIDE + dx + AHD_REACH] = yy === 0 ? (xx === 0 ? 0 : 1) : (xx === 0 ? 1 : 2);
  }
  return roles;
});
/**
 * 1 for the patch sites the AHD steps read (directional greens within 3 sites read 2 further along their axis, the candidates
 * within 2 read 1 further): |dy| ≤ 3 or |dx| ≤ 3. The 16 sites with |dx| ≥ 4 and |dy| ≥ 4 are never read.
 */
const AHD_READ = Uint8Array.from({ length: AHD_SIDE * AHD_SIDE }, (_, p) => {
  const dx = (p % AHD_SIDE) - AHD_REACH, dy = Math.floor(p / AHD_SIDE) - AHD_REACH;
  return Math.abs(dx) <= 3 || Math.abs(dy) <= 3 ? 1 : 0;
});
/** CIELAB's f(t) constants (CIE 15:2004): linear below (6/29)³ with slope (29/3)³/116. */
const LAB_EPSILON = 216 / 24389, LAB_KAPPA = 24389 / 27;
/** A 32-bit hash of a correction key (MurmurHash3 finalizer of the three quantized means). */
function fmixKey(a: number, b: number, c: number): number { return fmix32((Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 1, 0x85ebca77) ^ Math.imul(c + 1, 0xc2b2ae3d)) >>> 0); }
/** Grid levels per channel (indices 0 to AHD_KEY_OCTAVES·AHD_KEY_STEPS). */
const AHD_KEY_LEVELS = AHD_KEY_OCTAVES * AHD_KEY_STEPS + 1;
/** Correction states kept per setup, and setups kept (least recently used first out); about 100 bytes per state. */
const AHD_STATE_LIMIT = 1 << 16, AHD_SETUP_LIMIT = 4;
const ahdStateCache = new Map<string, Map<number, Float64Array>>();
/** Every input a correction state depends on besides its indices, as exact decimal text (JavaScript numbers round-trip). */
function correctionKey(seed: number, correction: NonNullable<DisplayViewSetup["ahdCorrection"]>, perElectron: readonly number[], constantVariance: readonly number[],
  gains: readonly number[], clipLevel: number, matrix: readonly (readonly number[])[], toneCurve: string): string {
  return [seed, correction.drawsPerState, ...perElectron, ...constantVariance, ...correction.labMatrix.flat(), ...gains, clipLevel, ...matrix.flat(), toneCurve].join(",");
}
/** Internal (exported for tests): the correction states kept across calls, and clearing them. */
export function displayViewCorrectionStateCount(): number { let n = 0; for (const states of ahdStateCache.values()) n += states.size; return n; }
export function clearDisplayViewCorrectionStates(): void { ahdStateCache.clear(); }
/** The state map of one setup (moved to the most recently used end). */
function correctionStates(key: string): Map<number, Float64Array> {
  let states = ahdStateCache.get(key);
  if (states) ahdStateCache.delete(key);
  else {
    states = new Map();
    if (ahdStateCache.size >= AHD_SETUP_LIMIT) ahdStateCache.delete(ahdStateCache.keys().next().value!);
  }
  ahdStateCache.set(key, states);
  return states;
}
/**
 * Recorded terms of a one-material sample: [0, 3) the channel site variances csv; [3, 21) per candidate d and channel c the
 * linear slopes a (3 + (3d + c)·3); [21, 27) per candidate the residual terms; [27, 30) the expected-value sums; [30, 33) the
 * AHD choice terms; 33 a 1 when the AHD correction applies and [34, 37) its values.
 */
const MEMO_SIZE = 37;
/** Pilot points per axis: about one per two sites of the footprint plus its reach, 4 to 16. */
function pilotCount(span: number): number { return Math.max(4, Math.min(16, Math.ceil(span / 2))); }

/** Renders the display view (docs/DISPLAY_VIEW.md). */
export async function renderDisplayView(setup: DisplayViewSetup): Promise<DisplayViewRenderResult> {
  const { frameWidth, frameHeight, margin, nativeWidth, nativeHeight, viewWidth, viewHeight, region, seed, reachSites } = setup;
  const sx = frameWidth / viewWidth, sy = frameHeight / viewHeight, area = sx * sy, g = 2 / frameWidth;
  const fullK = setup.samplesPerAxis, uniformK = Math.max(1, Math.round(fullK / 4));
  const maximum = setup.bitDepth === 8 ? 255 : 65535, step = 1 / maximum;
  const pixelCount = region.width * region.height;
  const samples = setup.bitDepth === 8 ? new Uint8Array(pixelCount * 3) : new Uint16Array(pixelCount * 3);
  const expected = new Float64Array(pixelCount * 3), noiseStd = new Float64Array(pixelCount * 3);
  const columns = Array.from({ length: region.width }, (_, i) => axisSums((region.x + i) * sx, (region.x + i + 1) * sx, frameWidth, margin));
  const M = setup.matrix, m00 = M[0]![0]!, m01 = M[0]![1]!, m02 = M[0]![2]!, m10 = M[1]![0]!, m11 = M[1]![1]!, m12 = M[1]![2]!, m20 = M[2]![0]!, m21 = M[2]![1]!, m22 = M[2]![2]!;
  const g0 = setup.gains[0], g1 = setup.gains[1], g2 = setup.gains[2], L = setup.clipLevel, reinhard = setup.toneCurve === "positive-reinhard-per-channel";
  const k = setup.readout.map((r) => r.perElectron), dark = setup.readout.map((r) => r.darkElectrons), c0 = setup.readout.map((r) => r.constantVariance);
  // Site window: 3 × 3 for the bilinear kernels, 7 × 7 when AHD's candidates read up to 3 sites away. Slot (dy + r)·(2r + 1) + dx + r.
  const candidates = setup.candidates ?? setup.demosaic.map((phase) => [phase]);
  const reach = Math.max(1, ...candidates.flat(3).map((t) => Math.max(Math.abs(t.dx), Math.abs(t.dy)))), side = 2 * reach + 1, slotsCount = side * side;
  const slotOf = (t: DisplayViewKernelTap): number => (t.dy + reach) * side + t.dx + reach;
  // Per phase: the bilinear kernels (for the site variance of each channel), the candidates, and the slots they read.
  const phaseSlots: Int32Array[][] = [], phaseWeights: Float64Array[][] = [], phaseW2: Float64Array[] = [], phaseList: Int32Array[] = [];
  const candidateSlots: Int32Array[][][] = [], candidateWeights: Float64Array[][][] = [], candidateDense: Float64Array[][] = [], candidateList: Int32Array[][] = [];
  for (let p = 0; p < 4; p++) {
    const kernels = setup.demosaic[p]!;
    phaseSlots[p] = kernels.map((list) => Int32Array.from(list, slotOf));
    phaseWeights[p] = kernels.map((list) => Float64Array.from(list, (t) => t.weight));
    phaseW2[p] = Float64Array.from(kernels, (list) => list.reduce((sum, t) => sum + t.weight * t.weight, 0));
    candidateSlots[p] = candidates[p]!.map((candidate) => candidate.map((list) => Int32Array.from(list, slotOf)));
    candidateDense[p] = candidates[p]!.map((candidate) => { const dense = new Float64Array(3 * slotsCount); candidate.forEach((list, c) => { for (const t of list) { const i = c * slotsCount + slotOf(t); dense[i] = dense[i]! + t.weight; } }); return dense; });
    candidateWeights[p] = candidates[p]!.map((candidate) => candidate.map((list) => Float64Array.from(list, (t) => t.weight)));
    const used = new Set<number>([...phaseSlots[p]!.flatMap((a) => Array.from(a)), ...candidateSlots[p]!.flat().flatMap((a) => Array.from(a))]);
    phaseList[p] = Int32Array.from([...used].sort((a, b) => a - b));
    // The slots of phaseList (same order) where a candidate has a non-zero weight in some channel. A sum over phaseList adds
    // ±0 at the other slots, which leaves a sum that starts at +0 unchanged, so the sums below skip them.
    candidateList[p] = candidateDense[p]!.map((dense) => phaseList[p]!.filter((slot) => dense[slot] !== 0 || dense[slotsCount + slot] !== 0 || dense[2 * slotsCount + slot] !== 0));
  }
  const siteElectrons = new Float64Array(slotsCount), siteMean = new Float64Array(slotsCount), siteVar = new Float64Array(slotsCount), siteThird = new Float64Array(slotsCount), siteChannel = new Int32Array(slotsCount), clip = new Float64Array(3), B = new Float64Array(4), C = new Float64Array(9);
  const cm = new Float64Array(3), cv = new Float64Array(3), csv = new Float64Array(3), bm = new Float64Array(3), bv = new Float64Array(3), bs = new Float64Array(3);
  const hm = new Float64Array(3), hv = new Float64Array(3), hs = new Float64Array(3), an = new Float64Array(9);
  const reach2 = CLIP_REACH_SIGMA * CLIP_REACH_SIGMA;
  // AHD low-signal correction: an 11 × 11 noisy neighbourhood (AHD reads up to 5 sites away) and the local AHD steps.
  const ahdCorrection = setup.ahdCorrection, windowReach = ahdCorrection ? Math.max(reach, AHD_REACH) : reach;
  const correction = new Float64Array(3), patch = new Float64Array(AHD_SIDE * AHD_SIDE), cmAverage = new Float64Array(3);
  let correctedPixels = 0;
  const readStd = c0.map((v) => Math.sqrt(v));
  // The correction of a flat neighbourhood whose sites of channel c have normalized mean μ_c, on a logarithmic grid of states
  // (AHD_KEY_STEPS per octave from 2^-AHD_KEY_OCTAVES of white); each grid state is computed once with draws seeded by the state
  // alone, so it is the same in every display pixel and region, and a pixel interpolates trilinearly between the 8 states
  // around its own channel means.
  // Grid states are shared across display pixels and across calls: a state depends only on its indices and on the inputs in
  // `correctionKey` (the seed, the draws, the readout scale and noise, the homogeneity matrix and the development), so a cached
  // state is the same value the draws would give again.
  const correctionCache = ahdCorrection ? correctionStates(correctionKey(seed, ahdCorrection, k, c0, setup.gains, L, M, setup.toneCurve)) : new Map<number, Float64Array>();
  function gridCorrection(i0: number, i1: number, i2: number): Float64Array {
    const key = (i0 * AHD_KEY_LEVELS + i1) * AHD_KEY_LEVELS + i2, cached = correctionCache.get(key);
    if (cached) return cached;
    const electrons = [i0, i1, i2].map((i, c) => 2 ** (i / AHD_KEY_STEPS - AHD_KEY_OCTAVES) / k[c]!);
    const random = createDeterministicUniformStream(deriveNativeSiteStreamSeedUint32(seed, fmixKey(i0, i1, i2), DISPLAY_VIEW_AHD_STREAM_ID));
    const sum = new Float64Array(3), draws = ahdCorrection!.drawsPerState, poisson = electrons.map((e) => createPoissonSampler(e));
    for (let draw = 0; draw < draws; draw++) {
      const phase = draw & 3, roles = AHD_ROLES[phase]!;
      for (let p = 0; p < AHD_SIDE * AHD_SIDE; p++) {
        const c = roles[p]!;
        if (AHD_READ[p] === 0) {
          // A site the AHD steps never read: its draws only advance the stream, by the uniforms the Poisson draw takes (a
          // variable number) and the normal's two.
          poisson[c]!(random); random.next(); random.next();
          continue;
        }
        const value = k[c]! * poisson[c]!(random) + readStd[c]! * sampleDeterministicStandardNormal(random);
        patch[p] = value < 1 ? value : 1;
      }
      ahdDifference(phase, correction);
      for (let comp = 0; comp < 3; comp++) sum[comp] = sum[comp]! + correction[comp]! / draws;
    }
    if (correctionCache.size >= AHD_STATE_LIMIT) correctionCache.clear();
    correctionCache.set(key, sum);
    return sum;
  }
  const interpolated = new Float64Array(3);
  const gridBase = new Float64Array(3), gridFrac = new Float64Array(3);
  function flatCorrection(m0: number, m1: number, m2: number): Float64Array {
    for (let i = 0; i < 3; i++) {
      const m = i === 0 ? m0 : i === 1 ? m1 : m2, g = (Math.log2(Math.min(1, Math.max(2 ** -AHD_KEY_OCTAVES, m))) + AHD_KEY_OCTAVES) * AHD_KEY_STEPS;
      const base = Math.min(Math.floor(g), AHD_KEY_OCTAVES * AHD_KEY_STEPS - 1);
      gridBase[i] = base; gridFrac[i] = g - base;
    }
    interpolated.fill(0);
    for (let corner = 0; corner < 8; corner++) {
      let weight = 1;
      for (let i = 0; i < 3; i++) weight *= (corner >> i) & 1 ? gridFrac[i]! : 1 - gridFrac[i]!;
      if (weight === 0) continue;
      const value = gridCorrection(gridBase[0]! + (corner & 1), gridBase[1]! + ((corner >> 1) & 1), gridBase[2]! + ((corner >> 2) & 1));
      for (let comp = 0; comp < 3; comp++) interpolated[comp] = interpolated[comp]! + weight * value[comp]!;
    }
    return interpolated;
  }
  const lab = ahdCorrection?.labMatrix ?? [[1, 0, 0], [0, 1, 0], [0, 0, 1]], labWhite = lab.map((row) => row[0]! + row[1]! + row[2]!);
  const l00 = lab[0]![0]!, l01 = lab[0]![1]!, l02 = lab[0]![2]!, l10 = lab[1]![0]!, l11 = lab[1]![1]!, l12 = lab[1]![2]!, l20 = lab[2]![0]!, l21 = lab[2]![1]!, l22 = lab[2]![2]!;
  const lw0 = labWhite[0]!, lw1 = labWhite[1]!, lw2 = labWhite[2]!;
  const gh = new Float64Array(49), gv = new Float64Array(49), cand = [new Float64Array(75), new Float64Array(75)], labs = [new Float64Array(75), new Float64Array(75)];
  const rgb = new Float64Array(3), rendered = new Float64Array(3), linear = new Float64Array(3);
  /** Develops one deterministic camera pixel and renders it: WB, highlight clip, colour matrix, tone curve, clip to [0, 1]. */
  function renderPixel(r: number, gr: number, b: number, out: Float64Array): void {
    const u0 = Math.min(L, g0 * r), u1 = Math.min(L, g1 * gr), u2 = Math.min(L, g2 * b);
    for (let comp = 0; comp < 3; comp++) {
      let v = comp === 0 ? m00 * u0 + m01 * u1 + m02 * u2 : comp === 1 ? m10 * u0 + m11 * u1 + m12 * u2 : m20 * u0 + m21 * u1 + m22 * u2;
      if (reinhard) v = v > 0 ? v / (1 + v) : v;
      out[comp] = v < 0 ? 0 : v > 1 ? 1 : v;
    }
  }
  /**
   * h(AHD) − ½(h(H) + h(V)) at the centre of the drawn neighbourhood (createAhdDemosaicTask's steps, centre pixel only). The
   * patch and the greens are read by flat index (patch (dy + 5)·11 + dx + 5, greens (dy + 3)·7 + dx + 3); every value is formed
   * with the same operations in the same order as the steps themselves, so the result is bit-identical to them.
   */
  function ahdDifference(phase: number, out: Float64Array): void {
    const roles = AHD_ROLES[phase]!;
    // 1. Directional greens within 3 sites.
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const i = (dy + 3) * 7 + dx + 3, p = (dy + AHD_REACH) * AHD_SIDE + dx + AHD_REACH, c = patch[p]!;
      if (roles[p] === 1) { gh[i] = c; gv[i] = c; continue; }
      gh[i] = (patch[p - 1]! + patch[p + 1]!) / 2 + (2 * c - patch[p - 2]! - patch[p + 2]!) / 4;
      gv[i] = (patch[p - AHD_SIDE]! + patch[p + AHD_SIDE]!) / 2 + (2 * c - patch[p - 2 * AHD_SIDE]! - patch[p + 2 * AHD_SIDE]!) / 4;
    }
    // 2. Candidates within 2 sites; 3. their CIELAB. The four corners (±2, ±2) are not read by step 4 and are skipped.
    for (let d = 0; d < 2; d++) {
      const g = d === 0 ? gh : gv, o = cand[d]!, ol = labs[d]!;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        if ((dx === -2 || dx === 2) && (dy === -2 || dy === 2)) continue;
        const i = (dy + 2) * 5 + dx + 2, p = (dy + AHD_REACH) * AHD_SIDE + dx + AHD_REACH, q = (dy + 3) * 7 + dx + 3, own = roles[p]!, gc = g[q]!;
        o[3 * i + 1] = gc;
        if (own === 1) {
          const hRole = roles[p + 1]!, vRole = 2 - hRole;
          o[3 * i + hRole] = gc + ((patch[p - 1]! - g[q - 1]!) + (patch[p + 1]! - g[q + 1]!)) / 2;
          o[3 * i + vRole] = gc + ((patch[p - AHD_SIDE]! - g[q - 7]!) + (patch[p + AHD_SIDE]! - g[q + 7]!)) / 2;
        } else {
          o[3 * i + own] = patch[p]!;
          o[3 * i + 2 - own] = gc + ((patch[p - AHD_SIDE - 1]! - g[q - 8]!) + (patch[p - AHD_SIDE + 1]! - g[q - 6]!) + (patch[p + AHD_SIDE - 1]! - g[q + 6]!) +
            (patch[p + AHD_SIDE + 1]! - g[q + 8]!)) / 4;
        }
        const R = o[3 * i]!, G = o[3 * i + 1]!, Bc = o[3 * i + 2]!;
        let tx = (l00 * R + l01 * G + l02 * Bc) / lw0, ty = (l10 * R + l11 * G + l12 * Bc) / lw1, tz = (l20 * R + l21 * G + l22 * Bc) / lw2;
        tx = tx > LAB_EPSILON ? Math.cbrt(tx) : (LAB_KAPPA * tx + 16) / 116;
        ty = ty > LAB_EPSILON ? Math.cbrt(ty) : (LAB_KAPPA * ty + 16) / 116;
        tz = tz > LAB_EPSILON ? Math.cbrt(tz) : (LAB_KAPPA * tz + 16) / 116;
        ol[3 * i] = 116 * ty - 16; ol[3 * i + 1] = 500 * (tx - ty); ol[3 * i + 2] = 200 * (ty - tz);
      }
    }
    // 4. Homogeneity within 1 site, with the adaptive tolerances (neighbours left, right, up, down); 5. the 3 × 3 sum selects
    // the candidate.
    const h = labs[0]!, v = labs[1]!;
    let sh = 0, sv = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const i = 3 * ((dy + 2) * 5 + dx + 2), j0 = i - 3, j1 = i + 3, j2 = i - 15, j3 = i + 15;
      const hL0 = Math.abs(h[i]! - h[j0]!), hL1 = Math.abs(h[i]! - h[j1]!), hL2 = Math.abs(h[i]! - h[j2]!), hL3 = Math.abs(h[i]! - h[j3]!);
      const vL0 = Math.abs(v[i]! - v[j0]!), vL1 = Math.abs(v[i]! - v[j1]!), vL2 = Math.abs(v[i]! - v[j2]!), vL3 = Math.abs(v[i]! - v[j3]!);
      const hC0 = (h[i + 1]! - h[j0 + 1]!) ** 2 + (h[i + 2]! - h[j0 + 2]!) ** 2, hC1 = (h[i + 1]! - h[j1 + 1]!) ** 2 + (h[i + 2]! - h[j1 + 2]!) ** 2;
      const hC2 = (h[i + 1]! - h[j2 + 1]!) ** 2 + (h[i + 2]! - h[j2 + 2]!) ** 2, hC3 = (h[i + 1]! - h[j3 + 1]!) ** 2 + (h[i + 2]! - h[j3 + 2]!) ** 2;
      const vC0 = (v[i + 1]! - v[j0 + 1]!) ** 2 + (v[i + 2]! - v[j0 + 2]!) ** 2, vC1 = (v[i + 1]! - v[j1 + 1]!) ** 2 + (v[i + 2]! - v[j1 + 2]!) ** 2;
      const vC2 = (v[i + 1]! - v[j2 + 1]!) ** 2 + (v[i + 2]! - v[j2 + 2]!) ** 2, vC3 = (v[i + 1]! - v[j3 + 1]!) ** 2 + (v[i + 2]! - v[j3 + 2]!) ** 2;
      const epsL = Math.min(Math.max(hL0, hL1), Math.max(vL2, vL3)), epsC = Math.min(Math.max(hC0, hC1), Math.max(vC2, vC3));
      sh += (hL0 <= epsL && hC0 <= epsC ? 1 : 0) + (hL1 <= epsL && hC1 <= epsC ? 1 : 0) + (hL2 <= epsL && hC2 <= epsC ? 1 : 0) + (hL3 <= epsL && hC3 <= epsC ? 1 : 0);
      sv += (vL0 <= epsL && vC0 <= epsC ? 1 : 0) + (vL1 <= epsL && vC1 <= epsC ? 1 : 0) + (vL2 <= epsL && vC2 <= epsC ? 1 : 0) + (vL3 <= epsL && vC3 <= epsC ? 1 : 0);
    }
    const centre = 12, a = cand[0]!, b = cand[1]!;
    for (let c = 0; c < 3; c++) rgb[c] = sh > sv ? a[3 * centre + c]! : sv > sh ? b[3 * centre + c]! : (a[3 * centre + c]! + b[3 * centre + c]!) / 2;
    renderPixel(rgb[0]!, rgb[1]!, rgb[2]!, rendered);
    renderPixel(a[3 * centre]!, a[3 * centre + 1]!, a[3 * centre + 2]!, linear);
    for (let c = 0; c < 3; c++) out[c] = rendered[c]! - linear[c]! / 2;
    renderPixel(b[3 * centre]!, b[3 * centre + 1]!, b[3 * centre + 2]!, linear);
    for (let c = 0; c < 3; c++) out[c] = out[c]! - linear[c]! / 2;
  }
  /** Normalized site value of a slot: normal with mean k·e and variance k²·e + constant, clipped at the white level (1). */
  function siteStatistics(slot: number, c: number, e: number): void {
    const kc = k[c]!, mean = kc * e, variance = kc * kc * e + c0[c]!, gap = 1 - mean;
    // Third cumulant of the normalized value: Poisson electrons have κ₃ = e (read and rounding noise add none).
    siteThird[slot] = kc * kc * kc * e;
    if (gap > 0 && gap * gap > reach2 * variance) { siteMean[slot] = mean; siteVar[slot] = variance; }
    else { upperClip(mean, variance, 1, clip); siteMean[slot] = clip[0]!; siteVar[slot] = clip[1]!; }
  }
  let siteCount = 0, sampleCount = 0, detail = 0, uniform = 0, lastYield = Date.now();
  /** Recorded terms of samples whose sites all read one chart material, by material·4 + CFA phase (layout: MEMO_SIZE). */
  const sampleMemo = new Map<number, Float64Array>();
  // Pilot: the scene at a deterministic grid over each display pixel's footprint widened by the reach; a pixel is uniform when
  // every point returns the same value. Pixels next to a detailed pixel count as detailed too, so an edge that only clips a
  // footprint's corner (too thin for the grid) still gets the full samples. The grid is fixed, so the sample count is not
  // random and the estimate stays unbiased either way.
  const pilotUniform = (vx: number, vy: number): boolean => {
    const ax0 = vx * sx + margin - reachSites, ax1 = (vx + 1) * sx + margin + reachSites, ay0 = vy * sy + margin - reachSites, ay1 = (vy + 1) * sy + margin + reachSites;
    const px = pilotCount(ax1 - ax0), py = pilotCount(ay1 - ay0);
    let first = NaN;
    for (let j = 0; j < py; j++) {
      const v = -(ay0 + (j + 0.5) * (ay1 - ay0) / py - nativeHeight / 2) * g;
      for (let i = 0; i < px; i++) {
        const value = setup.signal.pilot((ax0 + (i + 0.5) * (ax1 - ax0) / px - nativeWidth / 2) * g, v);
        if (i === 0 && j === 0) first = value; else if (value !== first) return false;
      }
    }
    return true;
  };
  // Pilot flags for the region and a one-pixel ring (clipped to the view), three rows at a time.
  const ringWidth = region.width + 2, flagRows: Uint8Array[] = [];
  const pilotRow = (vy: number): Uint8Array => {
    const row = new Uint8Array(ringWidth);
    if (vy < 0 || vy >= viewHeight) return row.fill(1);
    for (let i = 0; i < ringWidth; i++) { const vx = region.x - 1 + i; row[i] = vx < 0 || vx >= viewWidth ? 1 : pilotUniform(vx, vy) ? 1 : 0; }
    return row;
  };
  flagRows.push(pilotRow(region.y - 1), pilotRow(region.y));
  for (let ry = 0; ry < region.height; ry++) {
    const vy = region.y + ry, rows = axisSums(vy * sy, (vy + 1) * sy, frameHeight, margin);
    flagRows.push(pilotRow(vy + 1));
    if (flagRows.length > 3) flagRows.shift();
    for (let rx = 0; rx < region.width; rx++) {
      const vx = region.x + rx, index = vy * viewWidth + vx;
      footprintWeights(columns[rx]!, rows, area, B);
      let same = true;
      for (let j = 0; j < 3 && same; j++) for (let i = rx; i <= rx + 2; i++) if (flagRows[j]![i] === 0) { same = false; break; }
      const K = same ? uniformK : fullK, Q = K * K;
      if (same) uniform++; else detail++;
      setup.signal.window(Math.floor(vx * sx) + margin - windowReach, Math.floor(vy * sy) + margin - windowReach, Math.ceil((vx + 1) * sx) + margin + windowReach,
        Math.ceil((vy + 1) * sy) + margin + windowReach);
      const jitter = createDeterministicUniformStream(deriveNativeSiteStreamSeedUint32(seed, index, DISPLAY_VIEW_JITTER_STREAM_ID)), tracking = setup.signal.tracksMaterial;
      let s0 = 0, s1 = 0, s2 = 0, c00 = 0, c01 = 0, c02 = 0, c11 = 0, c12 = 0, c22 = 0, r0 = 0, r1 = 0, r2 = 0, pixelVariance = 0, corrected = false;
      for (let b = 0; b < K; b++) for (let a = 0; a < K; a++) {
        const fx = (vx + (a + jitter.next()) / K) * sx, fy = (vy + (b + jitter.next()) / K) * sy;
        const x = Math.min(frameWidth - 1, Math.floor(fx)) + margin, y = Math.min(frameHeight - 1, Math.floor(fy)) + margin;
        const phase = (y & 1) * 2 + (x & 1), list = phaseList[phase]!;
        let material = -2;
        // The expected electrons of the sites the demosaic reads (sites outside the raster, at mirror borders, are read
        // reflect-101); where the signal tracks it, whether they all read one chart material, with the statistics below only
        // when the sample is not replayed; otherwise the statistics at once.
        for (let li = 0; li < list.length; li++) {
          const slot = list[li]!;
          siteCount++;
          let sxs = x + (slot % side) - reach, sys = y + ((slot / side) | 0) - reach;
          if (sxs < 0) sxs = -sxs; else if (sxs >= nativeWidth) sxs = 2 * nativeWidth - 2 - sxs;
          if (sys < 0) sys = -sys; else if (sys >= nativeHeight) sys = 2 * nativeHeight - 2 - sys;
          const c = (sys & 1) === 0 ? ((sxs & 1) === 0 ? 0 : 1) : ((sxs & 1) === 0 ? 1 : 2);
          const e = setup.signal.site(sxs, sys) + dark[c]!;
          siteChannel[slot] = c;
          if (tracking) { siteElectrons[slot] = e; const own = setup.signal.uniformMaterial; material = material === -2 || material === own ? own : -1; continue; }
          siteStatistics(slot, c, e);
        }
        if (!tracking) material = -1;
        // A sample whose sites all read one chart material only has the statistics of every other such sample of that material
        // and CFA phase: replay its recorded terms (the same values added to the same sums in the same order).
        const memoKey = material >= 0 ? material * 4 + phase : -1, memo = memoKey >= 0 ? sampleMemo.get(memoKey) : undefined;
        const cs = candidateSlots[phase]!, cw = candidateWeights[phase]!, count = cs.length, share = 1 / count;
        if (memo) {
          for (let d = 0; d < count; d++) {
            for (let c = 0; c < 3; c++) {
              const o = 3 + (d * 3 + c) * 3, a0 = memo[o]!, a1 = memo[o + 1]!, a2 = memo[o + 2]!, wgt = share * B[c]! * memo[c]!;
              c00 += wgt * a0 * a0; c01 += wgt * a0 * a1; c02 += wgt * a0 * a2; c11 += wgt * a1 * a1; c12 += wgt * a1 * a2; c22 += wgt * a2 * a2;
            }
            r0 += memo[21 + d * 3]!; r1 += memo[22 + d * 3]!; r2 += memo[23 + d * 3]!;
          }
          s0 += memo[27]!; s1 += memo[28]!; s2 += memo[29]!;
          if (count === 2) { r0 += memo[30]!; r1 += memo[31]!; r2 += memo[32]!; }
          if (memo[33] === 1) { s0 += memo[34]!; s1 += memo[35]!; s2 += memo[36]!; corrected = true; }
          continue;
        }
        const record = memoKey >= 0 ? new Float64Array(MEMO_SIZE) : undefined;
        if (tracking) for (let li = 0; li < list.length; li++) { const slot = list[li]!; siteStatistics(slot, siteChannel[slot]!, siteElectrons[slot]!); }
        // Site variance of each channel through the bilinear kernels (for B_c), then the demosaic's own pixel statistics: the
        // mean and covariance of its camera channels, averaged over its candidates (AHD picks one per pixel).
        const slots = phaseSlots[phase]!, weights = phaseWeights[phase]!, w2 = phaseW2[phase]!;
        for (let c = 0; c < 3; c++) {
          const sl = slots[c]!, wt = weights[c]!;
          let variance = 0;
          for (let t = 0; t < sl.length; t++) variance += wt[t]! * wt[t]! * siteVar[sl[t]!]!;
          csv[c] = variance / w2[c]!;
        }
        // Each candidate of the demosaic (one for bilinear; AHD's horizontal and vertical ones, of which AHD picks one per pixel)
        // is propagated on its own: camera-channel mean and covariance, white balance and highlight clip, colour matrix and
        // rendering; the pixel's statistics are their average.
        let e0 = 0, e1 = 0, e2 = 0;
        for (let d = 0; d < count; d++) {
          for (let c = 0; c < 3; c++) {
            const sl = cs[d]![c]!, wt = cw[d]![c]!;
            let mean = 0;
            for (let t = 0; t < sl.length; t++) mean += wt[t]! * siteMean[sl[t]!]!;
            cm[c] = mean;
            cmAverage[c] = (d === 0 ? 0 : cmAverage[c]!) + mean * share;
          }
          // Covariance of channels i, j: Σ over the sites of w_i·w_j·Var(site), with the kernels as dense weights over the window.
          const dense = candidateDense[phase]![d]!, list = candidateList[phase]![d]!;
          let v00 = 0, v01 = 0, v02 = 0, v11 = 0, v12 = 0, v22 = 0;
          for (let li = 0; li < list.length; li++) {
            const slot = list[li]!, v = siteVar[slot]!, w0 = dense[slot]!, w1 = dense[slotsCount + slot]!, w2 = dense[2 * slotsCount + slot]!;
            v00 += w0 * w0 * v; v01 += w0 * w1 * v; v02 += w0 * w2 * v; v11 += w1 * w1 * v; v12 += w1 * w2 * v; v22 += w2 * w2 * v;
          }
          C[0] = v00; C[1] = v01; C[2] = v02; C[3] = v01; C[4] = v11; C[5] = v12; C[6] = v02; C[7] = v12; C[8] = v22;
          // White balance and the highlight clip at the smallest gain (per channel; covariances scaled by the expected slopes).
          for (let c = 0; c < 3; c++) {
            const mean = cm[c]!, variance = C[c * 4]!;
            cv[c] = variance;
            const gc = c === 0 ? g0 : c === 1 ? g1 : g2, um = gc * mean, uv = gc * gc * variance, gap = L - um;
            if (gap > 0 && gap * gap > reach2 * uv) { bm[c] = um; bv[c] = uv; bs[c] = gc; }
            else { upperClip(um, uv, L, clip); bm[c] = clip[0]!; bv[c] = clip[1]!; bs[c] = gc * clip[2]!; }
          }
          // Colour matrix, then the rendering of each component (tone curve, clip to [0, 1]).
          for (let comp = 0; comp < 3; comp++) {
            const r0m = comp === 0 ? m00 : comp === 1 ? m10 : m20, r1m = comp === 0 ? m01 : comp === 1 ? m11 : m21, r2m = comp === 0 ? m02 : comp === 1 ? m12 : m22;
            const mean = r0m * bm[0]! + r1m * bm[1]! + r2m * bm[2]!;
            const variance = r0m * r0m * bv[0]! + r1m * r1m * bv[1]! + r2m * r2m * bv[2]! +
              2 * (r0m * r1m * bs[0]! * bs[1]! * C[1]! + r0m * r2m * bs[0]! * bs[2]! * C[2]! + r1m * r2m * bs[1]! * bs[2]! * C[5]!);
            if (!reinhard && mean > 0 && mean < 1 && mean * mean > reach2 * variance && (1 - mean) * (1 - mean) > reach2 * variance) { hm[comp] = mean; hv[comp] = variance; hs[comp] = 1; }
            else if (reinhard) { reinhardMoments(mean, variance, clip); hm[comp] = clip[0]!; hv[comp] = clip[1]!; hs[comp] = clip[2]!; }
            else {
              // The component is a linear combination of the sites: κ₃ = Σ (Σ_c M·Γ_c·w_c,site)³·κ₃(site).
              const dense = candidateDense[phase]![d]!, list = candidateList[phase]![d]!;
              let third = 0;
              for (let li = 0; li < list.length; li++) {
                const slot = list[li]!, coefficient = r0m * bs[0]! * dense[slot]! + r1m * bs[1]! * dense[slotsCount + slot]! + r2m * bs[2]! * dense[2 * slotsCount + slot]!;
                third += coefficient * coefficient * coefficient * siteThird[slot]!;
              }
              unitClip(mean, variance, clip, variance > 0 ? third / (variance * Math.sqrt(variance)) : 0);
              hm[comp] = clip[0]!; hv[comp] = clip[1]!; hs[comp] = clip[2]!;
            }
          }
          e0 += share * hm[0]!; e1 += share * hm[1]!; e2 += share * hm[2]!;
          // Linear (Stein) part: a_c = J ∘ M[:, c]·Γ_c, accumulated with B_c·σ_c² (site variance of channel c); the pixel's own
          // linear variance (aᵀ·C·a, full channel covariance) for the residual.
          let l0 = 0, l1 = 0, l2 = 0;
          for (let c = 0; c < 3; c++) {
            const a0 = hs[0]! * (c === 0 ? m00 : c === 1 ? m01 : m02) * bs[c]!, a1 = hs[1]! * (c === 0 ? m10 : c === 1 ? m11 : m12) * bs[c]!, a2 = hs[2]! * (c === 0 ? m20 : c === 1 ? m21 : m22) * bs[c]!;
            const wgt = share * B[c]! * csv[c]!;
            c00 += wgt * a0 * a0; c01 += wgt * a0 * a1; c02 += wgt * a0 * a2; c11 += wgt * a1 * a1; c12 += wgt * a1 * a2; c22 += wgt * a2 * a2;
            an[c] = a0; an[3 + c] = a1; an[6 + c] = a2;
            if (record) { const o = 3 + (d * 3 + c) * 3; record[o] = a0; record[o + 1] = a1; record[o + 2] = a2; }
          }
          for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const cij = C[i * 3 + j]!; l0 += an[i]! * an[j]! * cij; l1 += an[3 + i]! * an[3 + j]! * cij; l2 += an[6 + i]! * an[6 + j]! * cij; }
          const t0 = share * Math.max(0, hv[0]! - l0), t1 = share * Math.max(0, hv[1]! - l1), t2 = share * Math.max(0, hv[2]! - l2);
          r0 += t0; r1 += t1; r2 += t2;
          if (record) { record[21 + d * 3] = t0; record[22 + d * 3] = t1; record[23 + d * 3] = t2; }
          pixelVariance = Math.max(pixelVariance, hv[0]!, hv[1]!, hv[2]!);
        }
        s0 += e0; s1 += e1; s2 += e2;
        if (record) { record[0] = csv[0]!; record[1] = csv[1]!; record[2] = csv[2]!; record[27] = e0; record[28] = e1; record[29] = e2; }
        if (count === 2) {
          // AHD's per-pixel choice between the candidates adds independent variance: with a noise-driven choice each pixel
          // deviates from the candidates' average by ±½(H − V), variance ¼·Var(H − V) (linear in the sites, at the last
          // candidate's slopes).
          const dh = candidateDense[phase]![0]!, dv = candidateDense[phase]![1]!, list = phaseList[phase]!;
          let x0 = 0, x1 = 0, x2 = 0;
          for (let li = 0; li < list.length; li++) {
            const slot = list[li]!, d0 = bs[0]! * (dh[slot]! - dv[slot]!), d1 = bs[1]! * (dh[slotsCount + slot]! - dv[slotsCount + slot]!), d2 = bs[2]! * (dh[2 * slotsCount + slot]! - dv[2 * slotsCount + slot]!);
            const v = siteVar[slot]!, a = hs[0]! * (m00 * d0 + m01 * d1 + m02 * d2), b = hs[1]! * (m10 * d0 + m11 * d1 + m12 * d2), c = hs[2]! * (m20 * d0 + m21 * d1 + m22 * d2);
            x0 += a * a * v; x1 += b * b * v; x2 += c * c * v;
          }
          r0 += x0 / 4; r1 += x1 / 4; r2 += x2 / 4;
          if (record) { record[30] = x0 / 4; record[31] = x1 / 4; record[32] = x2 / 4; }
        }
        // AHD at low signal: its homogeneity choice reacts to the noise, which the linear candidates cannot express. A sample
        // whose pixel noise exceeds the threshold adds the correction of a flat neighbourhood with its channel means, from the
        // shared grid of states (flatCorrection): there AHD and the two linear candidates run on the same drawn neighbourhoods
        // and the difference of the rendered results is averaged, a control variate whose expectation is the AHD bias
        // (docs/DISPLAY_VIEW.md).
        if (ahdCorrection && pixelVariance > ahdCorrection.thresholdVariance) {
          const fix = flatCorrection(cmAverage[0]!, cmAverage[1]!, cmAverage[2]!);
          s0 += fix[0]!; s1 += fix[1]!; s2 += fix[2]!; corrected = true;
          if (record) { record[33] = 1; record[34] = fix[0]!; record[35] = fix[1]!; record[36] = fix[2]!; }
        }
        if (record) sampleMemo.set(memoKey, record);
        pixelVariance = 0;
      }
      sampleCount += Q;
      if (corrected) correctedPixels++;
      const mean0 = s0 / Q, mean1 = s1 / Q, mean2 = s2 / Q, pixels = B[3]!;
      // The real pixels' output rounding (Δ²/12 in the encoded domain), mapped to linear light at the mean.
      const q0 = quantizationVariance(mean0, step), q1 = quantizationVariance(mean1, step), q2 = quantizationVariance(mean2, step);
      // Covariance in linear light: the linear part plus the independent per-pixel residuals and rounding.
      const v00 = c00 / Q + pixels * (r0 / Q + q0), v01 = c01 / Q, v02 = c02 / Q, v11 = c11 / Q + pixels * (r1 / Q + q1), v12 = c12 / Q, v22 = c22 / Q + pixels * (r2 / Q + q2);
      const noise = createDeterministicUniformStream(deriveNativeSiteStreamSeedUint32(seed, index, DISPLAY_VIEW_NOISE_STREAM_ID));
      const z0 = sampleDeterministicStandardNormal(noise), z1 = sampleDeterministicStandardNormal(noise), z2 = sampleDeterministicStandardNormal(noise);
      // Cholesky factor of the 3 × 3 covariance (positive semidefinite; tiny negative pivots are treated as 0).
      const l00 = Math.sqrt(Math.max(0, v00)), l10 = l00 > 0 ? v01 / l00 : 0, l20 = l00 > 0 ? v02 / l00 : 0;
      const l11 = Math.sqrt(Math.max(0, v11 - l10 * l10)), l21 = l11 > 0 ? (v12 - l20 * l10) / l11 : 0;
      const l22 = Math.sqrt(Math.max(0, v22 - l20 * l20 - l21 * l21));
      const o = (ry * region.width + rx) * 3;
      // The drawn value is clipped to [0, 1] like any light level; where the noise reaches a bound, the normal's centre is
      // moved so that the clipped draw keeps the expected value (the mean of real pixels in [0, 1] is in [0, 1] already).
      const n0 = clipCentre(mean0, v00) + l00 * z0, n1 = clipCentre(mean1, v11) + l10 * z0 + l11 * z1, n2 = clipCentre(mean2, v22) + l20 * z0 + l21 * z1 + l22 * z2;
      samples[o] = Math.round(encodeSrgbComponent(n0 < 0 ? 0 : n0 > 1 ? 1 : n0) * maximum);
      samples[o + 1] = Math.round(encodeSrgbComponent(n1 < 0 ? 0 : n1 > 1 ? 1 : n1) * maximum);
      samples[o + 2] = Math.round(encodeSrgbComponent(n2 < 0 ? 0 : n2 > 1 ? 1 : n2) * maximum);
      expected[o] = mean0; expected[o + 1] = mean1; expected[o + 2] = mean2;
      noiseStd[o] = Math.sqrt(Math.max(0, v00)); noiseStd[o + 1] = Math.sqrt(Math.max(0, v11)); noiseStd[o + 2] = Math.sqrt(Math.max(0, v22));
      if (Date.now() - lastYield >= 8) { await setup.yieldControl(); setup.checkAbort(); lastYield = Date.now(); }
    }
  }
  return { samples, expected, noiseStd, sampleCount, siteCount, detailPixelCount: detail, uniformPixelCount: uniform, ahdCorrectedPixelCount: correctedPixels };
}

/**
 * The centre c of a normal of variance v whose clip to [0, 1] has mean `target` (bisection; c = target when the noise does
 * not reach a bound, or when the target lies outside (0, 1)).
 */
function clipCentre(target: number, v: number): number {
  if (!(v > 0) || !(target > 0 && target < 1)) return target;
  const s = Math.sqrt(v);
  if (target > 4 * s && 1 - target > 4 * s) return target;
  const moments = new Float64Array(3);
  let lo = target - 10 * s, hi = target + 10 * s;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; unitClip(mid, v, moments); if (moments[0]! < target) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
/** Variance in linear light of rounding an sRGB-encoded value to steps of `step`: (dEOTF/de)²·step²/12 at the encoded mean. */
function quantizationVariance(linear: number, step: number): number {
  const e = encodeSrgbComponent(linear < 0 ? 0 : linear > 1 ? 1 : linear), slope = e <= 0.04045 ? 1 / 12.92 : 2.4 / 1.055 * ((e + 0.055) / 1.055) ** 1.4;
  return slope * slope * step * step / 12;
}
