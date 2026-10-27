// SPDX-License-Identifier: Apache-2.0
/**
 * #445: the expected signal's window lookup count (`windowLookups`, which `diagnostics.sceneLookups` sums for filled windows)
 * after its equal-geometry, prefix/suffix and full-window shortcuts. It must be the count of the lattice points the lazy window
 * caches would look up, exactly as before: compared over seeded random window and group geometries with a copy of the
 * previous algorithm kept below and with a brute-force count of the definition.
 */
import { describe, expect, it } from "vitest";
import { createDisplayViewExpectedSignal, type DisplayViewExpectedSignalInput, type DisplayViewQueryOffset } from "../src/facade/expected-signal.js";

/** A group's window cache geometry: rectangle size (cw, ch) and cache size (cpw, cph). */
interface Geometry { cw: number; ch: number; cpw: number; cph: number }

/**
 * The previous `windowLookups` (before #445), unchanged but for its inputs: the computed sites of the window (`computed`,
 * sw × sh, row-major) and the outside sites (window coordinates, x, y pairs).
 */
function previousWindowLookups(groups: readonly Geometry[], sw: number, sh: number, computed: Uint8Array, outsideSites: readonly number[]): number {
  let filledCount = 0, fy0 = 0, fy1 = -1;
  const rowMask = new Int32Array(sh);
  for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) if (computed[j * sw + i]) {
    if (i < 31) rowMask[j] = rowMask[j]! | (1 << i);
    if (filledCount++ === 0) { fy0 = fy1 = j; continue; }
    if (j < fy0) fy0 = j; else if (j > fy1) fy1 = j;
  }
  let total = 0;
  if (outsideSites.length === 0 && filledCount === 0) return 0;
  if (outsideSites.length === 0 && sw <= 31) {
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
  let marks = new Uint8Array(0), cover = new Uint8Array(0);
  for (const group of groups) {
    const cw = group.cw, ch = group.ch, cpw = group.cpw, cph = group.cph, ew = cpw + cw - 1, eh = cph + ch - 1;
    if (marks.length < ew * eh) { marks = new Uint8Array(ew * eh); }
    let x0 = ew, x1 = -1, y0 = eh, y1 = -1;
    const mark = (ei: number, ej: number): void => {
      if (ei < 0 || ej < 0 || ei >= ew || ej >= eh) return;
      marks[ej * ew + ei] = 1;
      if (ei < x0) x0 = ei; if (ei > x1) x1 = ei; if (ej < y0) y0 = ej; if (ej > y1) y1 = ej;
    };
    for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) if (computed[j * sw + i]) mark(i + cw - 1, j + ch - 1);
    for (let k = 0; k < outsideSites.length; k += 2) mark(outsideSites[k]! + cw - 1, outsideSites[k + 1]! + ch - 1);
    if (x1 < 0) continue;
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

/** The definition: per group, the cache points [0, cpw) × [0, cph) inside a computed site's rectangle [i, i + cw) × [j, j + ch). */
function bruteForceWindowLookups(groups: readonly Geometry[], sw: number, sh: number, computed: Uint8Array, outsideSites: readonly number[]): number {
  let total = 0;
  for (const g of groups) {
    const covered = new Uint8Array(g.cpw * g.cph);
    const cover = (i: number, j: number): void => {
      for (let cj = Math.max(0, j); cj < Math.min(g.cph, j + g.ch); cj++) for (let ci = Math.max(0, i); ci < Math.min(g.cpw, i + g.cw); ci++) covered[cj * g.cpw + ci] = 1;
    };
    for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) if (computed[j * sw + i]) cover(i, j);
    for (let k = 0; k < outsideSites.length; k += 2) cover(outsideSites[k]!, outsideSites[k + 1]!);
    for (const c of covered) total += c;
  }
  return total;
}

/** Lattice points of an outside site's rectangles outside the window caches (counted on every outside read). */
function outsideLookups(groups: readonly Geometry[], i: number, j: number): number {
  let count = 0;
  for (const g of groups) {
    const w = Math.max(0, Math.min(i + g.cw, g.cpw) - Math.max(i, 0)), h = Math.max(0, Math.min(j + g.ch, g.cph) - Math.max(j, 0));
    count += g.cw * g.ch - w * h;
  }
  return count;
}

/** Seeded uniform stream (mulberry32). */
function stream(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** The groups' rectangle sizes as the signal forms them: offsets that differ by whole sites share a lattice. */
function rectangles(offsets: readonly DisplayViewQueryOffset[], radius: number): { cw: number; ch: number }[] {
  const frac = (v: number): number => { const f = v - Math.floor(v); return f > 1 - 1e-9 || f < 1e-9 ? 0 : f; };
  const groups: { fx: number; fy: number; minIx: number; maxIx: number; minIy: number; maxIy: number }[] = [];
  for (const o of offsets) {
    const fx = frac(o.x), fy = frac(o.y), ix = Math.round(o.x - fx), iy = Math.round(o.y - fy);
    let group = groups.find((q) => Math.abs(q.fx - fx) <= 1e-9 && Math.abs(q.fy - fy) <= 1e-9);
    if (!group) { group = { fx, fy, minIx: ix, maxIx: ix, minIy: iy, maxIy: iy }; groups.push(group); }
    group.minIx = Math.min(group.minIx, ix); group.maxIx = Math.max(group.maxIx, ix); group.minIy = Math.min(group.minIy, iy); group.maxIy = Math.max(group.maxIy, iy);
  }
  return groups.map((q) => ({ cw: q.maxIx - q.minIx + 2 * radius + 1, ch: q.maxIy - q.minIy + 2 * radius + 1 }));
}

const nodes = [500, 600];
function input(W: number, H: number, offsets: DisplayViewQueryOffset[], radius: number): DisplayViewExpectedSignalInput {
  const taps = (2 * radius + 1) ** 2, kernel = (scale: number): Float64Array => Float64Array.from({ length: taps }, (_, t) => (1 + ((t * 7) % 5)) * scale / taps);
  return {
    nativeWidth: W, nativeHeight: H, outputWidth: W, wavelengthsNm: nodes,
    electronsPerRadiance: [Float64Array.of(1, 2), Float64Array.of(3, 1), Float64Array.of(0.5, 4)], offsets,
    kernels: { radius, perNode: [kernel(1), kernel(0.8)] },
    scene: { kind: "materials", materialAt: (u, v) => ((Math.floor(u * 5) + Math.floor(v * 4)) & 1), materials: [{ neutral: 0.4 }, { radiance: Float64Array.of(0.2, 0.7) }], whiteRadiance: Float64Array.of(1, 1.2) },
    channelAt: (x, y) => ((y & 1) === 0 ? ((x & 1) === 0 ? 0 : 1) : ((x & 1) === 0 ? 1 : 2))
  };
}

// Offset patterns: all groups of one shape (four-spot anti-aliasing with the 2 × 2 box, as the app's Quality request), two-spot
// (non-square rectangles), groups of different shapes, and random offsets.
const quarter = [-0.25, 0.25];
const spot = (x: number, y: number, weight: number): DisplayViewQueryOffset => ({ x, y, weight });
function fourSpot(): DisplayViewQueryOffset[] {
  return quarter.flatMap((x) => quarter.flatMap((y) => [[0, 0], [1, 0], [0, 1], [1, 1]].map(([dx, dy]) => spot(x + dx! - 0.5, y + dy! - 0.5, 1 / 16))));
}
function twoSpot(): DisplayViewQueryOffset[] { return quarter.flatMap((y) => [0, 1].map((dx) => spot(0.25 + dx - 0.5, y, 0.25))); }
function differentShapes(): DisplayViewQueryOffset[] { return [spot(0.25, 0.25, 0.2), spot(2.25, 0.25, 0.2), spot(-0.25, 0.25, 0.2), spot(-0.25, 1.25, 0.2), spot(0.5, -0.5, 0.2)]; }
function randomOffsets(random: () => number): DisplayViewQueryOffset[] {
  return Array.from({ length: 1 + Math.floor(random() * 6) }, () => spot(Math.floor(random() * 5) - 2 + [0, 0.25, 0.5, 0.75][Math.floor(random() * 4)]!, Math.floor(random() * 5) - 2 + [0, 0.25, 0.5][Math.floor(random() * 3)]!, 0.2));
}
const PATTERNS: [string, (random: () => number) => DisplayViewQueryOffset[]][] = [
  ["four groups of one shape", fourSpot], ["two-spot, non-square", twoSpot], ["groups of different shapes", differentShapes], ["random offsets", randomOffsets]
];

describe("expected signal window lookup count (#445)", () => {
  it.each(PATTERNS)("%s: equals the previous algorithm and the definition on random windows", (name, offsetsOf) => {
    const random = stream(445 + name.length);
    const tally = { mask: 0, general: 0, full: 0, partial: 0, outside: 0, fallbackRows: 0, sharedShape: 0, windows: 0 };
    for (let trial = 0; trial < 12; trial++) {
      const W = 40 + Math.floor(random() * 40), H = 30 + Math.floor(random() * 30), radius = Math.floor(random() * 3), offsets = offsetsOf(random);
      const signal = createDisplayViewExpectedSignal(input(W, H, offsets, radius)), sizes = rectangles(offsets, radius);
      let expected = 0;
      for (let w = 0; w < 10; w++) {
        // Window widths on both sides of the 31-site bit-mask limit; windows at every raster edge.
        const sw = 1 + Math.floor(random() * Math.min(W, 40)), sh = 1 + Math.floor(random() * Math.min(H, 24));
        const x0 = random() < 0.2 ? 0 : random() < 0.25 ? W - sw : Math.floor(random() * (W - sw + 1)), y0 = random() < 0.2 ? 0 : random() < 0.25 ? H - sh : Math.floor(random() * (H - sh + 1));
        signal.window(x0, y0, x0 + sw, y0 + sh);
        expect(signal.marksReads).toBe(true);
        const groups = sizes.map(({ cw, ch }) => ({ cw, ch, cpw: sw + cw - 1, cph: sh + ch - 1 }));
        const computed = new Uint8Array(sw * sh), outside: number[] = [];
        // Reading modes: every site (the capture path's and a fully read window), a random fraction, a band of interior rows
        // (computed rows touching neither end of a cache row's span), and any of them with reads outside the window (as mirror
        // borders and the demosaic's reach make) and with repeated reads.
        const mode = Math.floor(random() * 4), fraction = random(), withOutside = random() < 0.35, viaMarks = random() < 0.4;
        const rowFrom = Math.floor(random() * sh), rowTo = rowFrom + Math.floor(random() * (sh - rowFrom));
        const reads: [number, number][] = [];
        for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) {
          const take = mode === 0 ? true : mode === 1 ? random() < fraction : mode === 2 ? j >= rowFrom && j <= rowTo && random() < 0.5 : random() < 0.08;
          if (take) reads.push([x0 + i, y0 + j]);
        }
        if (withOutside) for (let k = 0; k < 1 + Math.floor(random() * 4); k++) {
          const x = Math.floor(random() * W), y = Math.floor(random() * H);
          if (x < x0 || x >= x0 + sw || y < y0 || y >= y0 + sh) reads.push([x, y]);
        }
        for (let k = reads.length - 1; k > 0; k--) { const r = Math.floor(random() * (k + 1)); [reads[k], reads[r]] = [reads[r]!, reads[k]!]; }
        if (reads.length > 0 && random() < 0.5) reads.push(reads[0]!);
        // Some inside sites are recorded with markReads (as the display view's site ring does), with the values `site` gives.
        const xs: number[] = [], ys: number[] = [], vs: number[] = [], ms: number[] = [];
        for (const [x, y] of reads) {
          const i = x - x0, j = y - y0, inside = i >= 0 && j >= 0 && i < sw && j < sh;
          if (inside && viaMarks && random() < 0.5 && !computed[j * sw + i]) {
            const twin = createDisplayViewExpectedSignal(input(W, H, offsets, radius));
            twin.window(x0, y0, x0 + sw, y0 + sh);
            xs.push(x); ys.push(y); vs.push(twin.site(x, y)); ms.push(twin.uniformMaterial);
            computed[j * sw + i] = 1;
            continue;
          }
          signal.site(x, y);
          if (inside) computed[j * sw + i] = 1;
          else { outside.push(i, j); expected += outsideLookups(groups, i, j); }
        }
        if (xs.length > 0) signal.markReads(Int32Array.from(xs), Int32Array.from(ys), Float64Array.from(vs), Int32Array.from(ms), xs.length);
        const previous = previousWindowLookups(groups, sw, sh, computed, outside);
        expect(previous).toBe(bruteForceWindowLookups(groups, sw, sh, computed, outside));
        // The open window's count (the `lookups` getter) and, below, the closed window's.
        expect(signal.lookups).toBe(expected + previous);
        expected += previous;
        tally.windows++;
        const count = computed.reduce((a, b) => a + b, 0);
        if (outside.length > 0) tally.outside++; else if (count === sw * sh) tally.full++; else if (count > 0) tally.partial++;
        if (outside.length === 0 && count > 0 && count < sw * sh) {
          if (sw <= 31) {
            tally.mask++;
            let fy0 = sh, fy1 = -1;
            for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) if (computed[j * sw + i]) { fy0 = Math.min(fy0, j); fy1 = Math.max(fy1, j); }
            if (groups.some((g) => fy1 - fy0 + 1 > g.ch)) tally.fallbackRows++;
          } else tally.general++;
        }
        if (groups.some((g, k) => groups.slice(0, k).some((o) => o.cw === g.cw && o.ch === g.ch))) tally.sharedShape++;
      }
      signal.window(0, 0, 0, 0);
      expect(signal.lookups).toBe(expected);
    }
    // Every path was exercised: the full-window shortcut, partial windows in both branches, outside sites, the OR loop of a
    // cache row whose computed rows touch neither end, and groups that share a shape (always for four- and two-spot, never
    // for the different shapes, sometimes for random offsets).
    expect(tally.full).toBeGreaterThan(0);
    expect(tally.partial).toBeGreaterThan(0);
    expect(tally.outside).toBeGreaterThan(0);
    expect(tally.mask).toBeGreaterThan(0);
    expect(tally.general).toBeGreaterThan(0);
    expect(tally.fallbackRows).toBeGreaterThan(0);
    if (name === "groups of different shapes") expect(tally.sharedShape).toBe(0);
    else if (name === "random offsets") expect(tally.sharedShape).toBeGreaterThan(0);
    else expect(tally.sharedShape).toBe(tally.windows);
  });
});
