// SPDX-License-Identifier: Apache-2.0

/**
 * The tabulated expected signal (2.6 display view; #394 also the capture's tabulated RAW path): expected photo electrons of
 * real native sites for a still, rectilinear, distortion-free planar scene. Kept apart from display-view.ts so a bundle that
 * only captures does not contain the display view or the portable functions it uses (issue #380).
 */

import { InvalidConfigurationError } from "../core/configuration-error.js";

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
  /**
   * Whether the current window caches its sites: a second `site` call for a site inside the window then returns the stored
   * value without any work or lookup (#392).
   */
  readonly cachesSites: boolean;
}

const OFFSET_TOLERANCE = 1e-9;
/** Largest cache window, in sites or lattice points; larger windows are evaluated without caching. */
const CACHE_LIMIT = 1 << 22;
/** Largest band of looked-up lattice materials per group, in lattice points (a band that would be larger restarts at the window). */
const BAND_LIMIT = 1 << 22;
/**
 * Lattice-row ring (refinement windows): rows kept per group, the tallest band that uses it, and the columns kept beyond each
 * raster edge (kernel radius, demosaic reach and query offsets; columns beyond it are looked up directly).
 */
const LATTICE_RING_ROWS = 128, LATTICE_RING_MAXIMUM_BAND_ROWS = 64, LATTICE_RING_MARGIN = 64;

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
  // Lattice rows of material indices per group, kept across windows (filled windows only): rows LATTICE_RING_ROWS apart share a
  // slot; columns from −LATTICE_RING_MARGIN. Int16 when every index fits (about 3 MB for four groups of a 6000-site row).
  const ringWide = scene.kind === "materials" && scene.materials.length <= 32767;
  const rings: ({ width: number; material: Int16Array | Int32Array; rowId: Int32Array } | undefined)[] = groups.map(() => undefined);
  function latticeRing(g: number): { width: number; material: Int16Array | Int32Array; rowId: Int32Array } {
    let ring = rings[g];
    if (!ring) {
      const width = W + 2 * LATTICE_RING_MARGIN, size = LATTICE_RING_ROWS * width;
      ring = rings[g] = { width, material: ringWide ? new Int16Array(size) : new Int32Array(size), rowId: new Int32Array(LATTICE_RING_ROWS).fill(-2147483648) };
    }
    return ring;
  }
  /** Makes the band of group g cover lattice columns [x0, x1) of rows [y0, y0 + rows), extending it to the right when it can. */
  function coverBand(g: number, x0: number, x1: number, y0: number, rows: number): void {
    const group = groups[g]!, band = bands[g]!, materials = scene as Extract<DisplayViewScene, { kind: "materials" }>;
    if (!(y0 >= band.y0 && y0 + rows <= band.y0 + band.rows && x0 >= band.x0 && x1 - band.x0 <= band.capacity)) {
      // A band with the ring is built twice as tall, so the next display rows' windows (a few lattice rows lower) reuse its
      // filled columns; a lattice point's material and the change counts inside a rectangle do not depend on the band's origin.
      if (rows <= LATTICE_RING_MAXIMUM_BAND_ROWS) rows *= 2;
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
    rows = band.rows; y0 = band.y0;
    const ring = rows <= 2 * LATTICE_RING_MAXIMUM_BAND_ROWS ? latticeRing(g) : undefined;
    for (let i = band.filled; i < x1 - band.x0; i++) {
      const p = band.x0 + i, u = latticeU(group, p), column = p + LATTICE_RING_MARGIN;
      for (let j = 0; j < rows; j++) {
        let m: number;
        if (ring && column >= 0 && column < ring.width) {
          // A lattice point's material is a function of the point alone, so one looked up for an earlier window (the rows a
          // display row shares with the next) is the same material; the ring only spares the repeated lookup.
          const q = y0 + j, slot = q & (LATTICE_RING_ROWS - 1), index = slot * ring.width + column;
          if (ring.rowId[slot] !== q) { ring.rowId[slot] = q; ring.material.fill(-1, slot * ring.width, (slot + 1) * ring.width); }
          m = ring.material[index]!;
          if (m < 0) { m = materials.materialAt(u, band.v[j]!); ring.material[index] = m; }
        } else m = materials.materialAt(u, band.v[j]!);
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
  // Without diffraction (#392): site values persist across windows the same way, in their own ring (a site's value does not
  // depend on the window). A ring hit counts the lookups directSite would have made, so `lookups` is unchanged.
  let directRows = 0, directOn = false, directRing = new Float64Array(0), directRowId = new Int32Array(0);
  const directLookups = offsets.length * (scene.kind === "materials" ? 1 : nodes);
  function directRead(x: number, y: number): number {
    const slot = y & (directRows - 1), q = slot * W + x;
    if (directRowId[slot] === y) { const v = directRing[q]!; if (v === v) { lookups += directLookups; return v; } }
    else { directRowId[slot] = y; directRing.fill(NaN, slot * W, (slot + 1) * W); }
    const v = directSite(x, y);
    directRing[q] = v;
    return v;
  }
  /** A site not in the window's site cache: from a ring, a filled window without the ring, the lazy window caches, or uncached. */
  function siteMiss(x: number, y: number, i: number, j: number, cached: boolean): number {
    if (directOn) {
      const v = directRead(x, y);
      if (cached) siteCache[j * sw + i] = v;
      return v;
    }
    if (ringOn) {
      if (!cached) { outsideRead(i, j); return ringRead(x, y, i, j); }
      const v = ringRead(x, y, i, j);
      siteCache[j * sw + i] = v; windowMaterial[j * sw + i] = lastMaterial; markFilled(i, j);
      return v;
    }
    if (filled && !cached) outsideRead(i, j);
    const v = filled ? filledSite(x, y, i, j) : input.kernels ? kernelSite(x, y) : directSite(x, y);
    if (cached) { siteCache[j * sw + i] = v; if (filled) markFilled(i, j); }
    return v;
  }
  /**
   * Lattice points of the closing window that kernelSite's lazy cache would have looked up: per group, the window cache points
   * covered by the rectangles of the computed sites (the site cache's filled entries and the outside sites), a box dilation.
   */
  function windowLookups(): number {
    let total = 0;
    if (outsideSites.length === 0 && filledCount === 0) return 0;
    if (outsideSites.length === 0 && sw <= 31) {
      // Computed sites as a bit mask per window row. Cache point (ci, cj) is covered when a computed site (i, j) has
      // i ≤ ci < i + cw and j ≤ cj < j + ch; a union of dilations is the dilation of the union, so per cache row the
      // covered columns are the dilation of the OR of the masks of window rows cj − ch + 1 … cj.
      for (const group of groups) {
        const cw = group.cw, ch = group.ch, cpw = group.cpw, cph = group.cph, last = Math.min(cph - 1, fy1 + ch - 1);
        let previous = -1, width = 0;
        for (let cj = fy0; cj <= last; cj++) {
          let m = 0;
          for (let j = Math.max(fy0, cj - ch + 1), top = Math.min(fy1, cj); j <= top; j++) m |= rowMask[j]!;
          if (m !== previous) {
            previous = m; width = 0;
            let end = -1;
            for (let i = 0; m >>> i !== 0; i++) {
              if (((m >>> i) & 1) === 0) continue;
              const to = Math.min(i + cw - 1, cpw - 1);
              if (i > end) width += to - i + 1; else if (to > end) width += to - end;
              if (to > end) end = to;
            }
          }
          total += width;
        }
      }
      return total;
    }
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
  // The computed entries of a filled window's site cache (windowLookups): their count, bounding box and a bit mask per row
  // (columns below 31).
  let filledCount = 0, fx0 = 0, fx1 = -1, fy0 = 0, fy1 = -1;
  let rowMask = new Int32Array(0);
  function markFilled(i: number, j: number): void {
    if (i < 31) rowMask[j] = rowMask[j]! | (1 << i);
    if (filledCount++ === 0) { fx0 = fx1 = i; fy0 = fy1 = j; return; }
    if (i < fx0) fx0 = i; else if (i > fx1) fx1 = i;
    if (j < fy0) fy0 = j; else if (j > fy1) fy1 = j;
  }
  const pilotNode = input.wavelengthsNm[Math.floor(nodes / 2)]!;
  return {
    get lookups(): number { return lookups + (filled ? windowLookups() : 0); },
    get uniformMaterial(): number { return lastMaterial; },
    get tracksMaterial(): boolean { return ringOn; },
    get cachesSites(): boolean { return sw > 0; },
    window(x0: number, y0: number, x1: number, y1: number): void {
      if (filled) lookups += windowLookups();
      filled = false; ringOn = false; outsideSites = []; filledCount = 0; rowMask.fill(0, 0, sh);
      sx0 = x0; sy0 = y0; sw = Math.max(0, x1 - x0); sh = Math.max(0, y1 - y0);
      if (sw * sh > CACHE_LIMIT) { sw = 0; sh = 0; }
      if (siteCache.length < sw * sh) siteCache = new Float64Array(sw * sh);
      if (rowMask.length < sh) rowMask = new Int32Array(sh);
      siteCache.fill(NaN, 0, sw * sh);
      if (!input.kernels) {
        // A ring of at least twice the window's rows keeps the rows of the previous display row's windows.
        if (sh > 0 && directRows < 2 * sh) {
          let rows = 1;
          while (rows < 2 * sh) rows *= 2;
          if (rows * W <= CACHE_LIMIT) { directRows = rows; directRing = new Float64Array(rows * W).fill(NaN); directRowId = new Int32Array(rows).fill(-1); }
        }
        directOn = sh > 0 && directRows >= 2 * sh;
        return;
      }
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
          let rows = 1;
          while (rows < 2 * sh) rows *= 2;
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
