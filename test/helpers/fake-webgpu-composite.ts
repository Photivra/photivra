// SPDX-License-Identifier: Apache-2.0
/**
 * Float32 JavaScript emulation (Math.fround after every operation) of the composite chart kernel
 * (src/gpu/wgsl-chart-composite-kernel.ts) and its double-float32 probe, for the fake WebGPU device. A
 * line-by-line port: the same bound arithmetic, the same decisions, the same flags.
 */
import { DIGIT_SEGMENTS, NUMERAL_ADVANCE, SEGMENTS } from "../../src/facade/chart-scenes.js";
import { dwAdd, dwMul, dwSub, probeExpectation, type Dw } from "../../src/gpu/chart-composite-gpu.js";
import { CHART_RECORD_STRIDE } from "../../src/gpu/wgsl-chart-composite-kernel.js";

const f = Math.fround;
const E = f(2 ** -23), DW = f(2 ** -40), TINY = f(2 ** -120), SAFETY = 4, SLACK = f(1e-14), PI = f(3.14159265358979), HALF_PI = f(1.5707963267948966), QUARTER_PI = f(0.7853981633974483);
const SEGMENT_ORDER = "abcdefg";
const SEGMENT_BOX = SEGMENT_ORDER.split("").map((s) => SEGMENTS[s]!.map((x) => f(Number(x.toFixed(2)))) as [number, number, number, number]);
const DIGIT_MASK = DIGIT_SEGMENTS.map((segments) => segments.split("").reduce((mask, s) => mask | (1 << SEGMENT_ORDER.indexOf(s)), 0));

interface B { v: number; e: number }

let corruptProbe = false;
/** Makes the probe return zeros (a device that reassociates the double-float32 arithmetic) until turned off again. */
export function setCompositeProbeCorruption(corrupt: boolean): void { corruptProbe = corrupt; }

/** Dispatches the composite kernel or its probe by pipeline label; false for any other label. */
export function emulateComposite(label: string, data: (binding: number) => ArrayBuffer): boolean {
  const u32 = (b: number): Uint32Array => new Uint32Array(data(b)), f32 = (b: number): Float32Array => new Float32Array(data(b));
  if (label === "photivra-chart-composite") { emulateCompositeChart(u32(0), f32(1), f32(2), f32(3), u32(4), u32(5), f32(6), u32(7)); return true; }
  if (label === "photivra-chart-composite-probe") { emulateCompositeProbe(f32(0), f32(1)); if (corruptProbe) f32(1).fill(0); return true; }
  return false;
}

export function emulateCompositeProbe(input: Float32Array, output: Float32Array): void {
  for (let i = 0; i < input.length / 4; i++) {
    const want = probeExpectation([input[4 * i]!, input[4 * i + 1]!, input[4 * i + 2]!, input[4 * i + 3]!]);
    output.set(want, 4 * i);
  }
}

export function emulateCompositeChart(p: Uint32Array, points: Float32Array, table: Float32Array, af: Float32Array, ai: Uint32Array, selectors: Uint32Array,
  values: Float32Array, flags: Uint32Array): void {
  const [count, columns, wavelengthMode] = [p[0]!, p[1]!, p[2]!];
  let flagged!: boolean;
  // --- bound arithmetic ---
  const bds = (a: Dw, scale: number): B => ({ v: a[0], e: f(f(f(Math.abs(a[1]) + f(DW * f(f(Math.abs(a[0]) + Math.abs(a[1])) + scale))) + TINY)) });
  const bd = (a: Dw): B => bds(a, 0);
  const bc = (c: number): B => ({ v: c, e: f(f(E * Math.abs(c)) + TINY) });
  const bx = (c: number): B => ({ v: c, e: 0 });
  const badd = (a: B, b: B): B => { const v = f(a.v + b.v); return { v, e: f(f(a.e + b.e) + f(E * Math.abs(v))) }; };
  const bsub = (a: B, b: B): B => { const v = f(a.v - b.v); return { v, e: f(f(a.e + b.e) + f(E * Math.abs(v))) }; };
  const bmul = (a: B, b: B): B => { const v = f(a.v * b.v); return { v, e: f(f(f(f(Math.abs(a.v) * b.e) + f(Math.abs(b.v) * a.e)) + f(a.e * b.e)) + f(E * Math.abs(v))) }; };
  const bneg = (a: B): B => ({ v: -a.v, e: a.e });
  const babs = (a: B): B => ({ v: Math.abs(a.v), e: a.e });
  const bdiv = (a: B, b: B): B => {
    const v = f(a.v / b.v), d = f(Math.abs(b.v) - f(SAFETY * b.e));
    if (!(d > 0)) { flagged = true; return { v, e: f(3e38) }; }
    const e = f(f(f(a.e + f(f(f(Math.abs(a.v) + a.e) * b.e) / d)) / Math.abs(b.v)) + f(f(2.5 * E) * Math.abs(v)));
    return { v, e };
  };
  const margin = (x: B): number => f(f(SAFETY * x.e) + f(SLACK * f(Math.abs(x.v) + 1)));
  const ge0 = (x: B): boolean => { if (!(Math.abs(x.v) > margin(x))) flagged = true; return x.v >= 0; };
  const ge = (a: B, b: B): boolean => ge0(bsub(a, b)), gt = (a: B, b: B): boolean => !ge0(bsub(b, a)), lt = (a: B, b: B): boolean => !ge0(bsub(a, b)), le = (a: B, b: B): boolean => ge0(bsub(b, a));
  const bfloor = (x: B, lo: number, hi: number): number => {
    const n = Math.floor(x.v), m = wgslRound(x.v), g = margin(x);
    if (g >= 0.5) { flagged = true; return n; }
    if (m >= lo && m <= hi && !(Math.abs(f(x.v - m)) > g)) flagged = true;
    return n;
  };
  const parityEven = (i: number, j: number): boolean => (((i | 0) + (j | 0)) & 1) === 0;
  const toI32 = (x: number): number => Math.max(-2147483648, Math.min(2147483647, Math.trunc(x)));
  // --- Taylor cos / sin ---
  const horner = (coefficients: number[], t: B): B => {
    let q = bc(coefficients[0]!);
    for (let k = 1; k < coefficients.length; k++) q = badd(bmul(q, t), bc(coefficients[k]!));
    return q;
  };
  const bcosPoly = (y: B): B => {
    const q = horner([2.08767569878681e-9, -2.755731922398589e-7, 2.48015873015873e-5, -0.001388888888888889, 0.041666666666666664, -0.5, 1].map(f), bmul(y, y));
    return { v: q.v, e: f(q.e + f(4e-13)) };
  };
  const bsinPoly = (z: B): B => {
    const q = horner([1.605904383682161e-10, -2.505210838544172e-8, 2.7557319223985893e-6, -0.0001984126984126984, 0.008333333333333333, -0.16666666666666666, 1].map(f), bmul(z, z));
    const s = bmul(q, z);
    return { v: s.v, e: f(s.e + f(2e-14)) };
  };
  const bcos = (x: B): B => {
    let y = babs(x), negate = false;
    if (y.v > HALF_PI) { y = bsub(bc(PI), y); negate = true; }
    let c = y.v > QUARTER_PI ? bsinPoly(bsub(bc(HALF_PI), y)) : bcosPoly(y);
    if (negate) c = bneg(c);
    return c;
  };
  const barsMaterial = (x: B, origin: number, w: number): number => {
    const n = bfloor(bdiv(bsub(x, bc(origin)), bc(w)), -3e38, 3e38);
    return parityEven(toI32(n), 0) ? 0 : 1;
  };
  const numeralInk = (u: B, v: B, lu0: number, lv0: number, h: number, digits: number): boolean => {
    const x = bdiv(bsub(u, bc(lu0)), bc(h)), y = bdiv(bsub(v, bc(lv0)), bc(h));
    if (lt(y, bx(0)) || gt(y, bx(1)) || lt(x, bx(0))) return false;
    const n = ai[digits]!, k = bfloor(bdiv(x, bc(f(NUMERAL_ADVANCE))), 0, n);
    if (k >= n) return false;
    const cx = bsub(x, bmul(bx(k), bc(f(NUMERAL_ADVANCE)))), mask = DIGIT_MASK[ai[digits + 1 + k]!]!;
    for (let s = 0; s < 7; s++) {
      if ((mask & (1 << s)) === 0) continue;
      const box = SEGMENT_BOX[s]!;
      if (ge(cx, bc(box[0])) && le(cx, bc(box[2])) && ge(y, bc(box[1])) && le(y, bc(box[3]))) return true;
    }
    return false;
  };
  const starCross = (dirs: number, k: number, x: Dw, y: Dw): B => {
    const o = dirs + 4 * k, cx: Dw = [af[o]!, af[o + 1]!], sx: Dw = [af[o + 2]!, af[o + 3]!];
    return bds(dwSub(dwMul(cx, y), dwMul(sx, x)), f(Math.abs(f(cx[0] * y[0])) + Math.abs(f(sx[0] * x[0]))));
  };
  const mod = (a: number, n: number): number => ((a % n) + n) % n;
  const classify = (kind: number, ioff: number, foff: number, xd: Dw, yd: Dw): number => {
    const u = bd(xd), v = bd(yd);
    switch (kind) {
      case 0: return 0;
      case 1: return ge0(bsub(bmul(u, bc(af[foff]!)), bmul(v, bc(af[foff + 1]!)))) ? 1 : 0;
      case 2: {
        const n = ai[ioff]!, dirs = ai[ioff + 1]!, levels = ai[ioff + 2]!, buckets = ai[ioff + 3]!, m = ai[ioff + 4]!, w = ai[ioff + 5]!;
        const q = bd(dwAdd(dwMul(xd, xd), dwMul(yd, yd)));
        if (gt(q, bc(af[foff]!))) return ai[ioff + 6]!;
        const a = f(Math.atan2(yd[0], xd[0]));
        const j = Math.min(m - 1, Math.max(0, Math.floor(f(f(f(a + PI) * m) / f(2 * PI)))));
        const k0 = ai[buckets + j]!;
        let lo = k0 - w, hi = k0 + w + 1;
        const clo = starCross(dirs, mod(lo, n), xd, yd), chi = starCross(dirs, mod(hi, n), xd, yd);
        if (!ge0(clo) || ge0(chi)) { flagged = true; return 0; }
        for (let step = 0; step < 32 && hi - lo > 1; step++) {
          const mid = Math.trunc((lo + hi) / 2), c = starCross(dirs, mod(mid, n), xd, yd);
          if (c.v >= 0) lo = mid; else hi = mid;
        }
        if (hi - lo > 1) flagged = true;
        const kl = mod(lo, n), kh = mod(hi, n);
        if (!ge0(starCross(dirs, kl, xd, yd)) || ge0(starCross(dirs, kh, xd, yd))) flagged = true;
        return ai[levels + kl]!;
      }
      case 3: {
        const steps = ai[ioff]!, t = bmul(bmul(badd(u, bx(1)), bx(0.5)), bx(steps));
        return Math.min(steps - 1, Math.max(0, bfloor(t, 1, steps - 1)));
      }
      case 5: {
        const size = bc(af[foff]!), aspect = bc(af[foff + 1]!);
        const i = bfloor(bdiv(badd(u, bx(1)), size), -3e38, 3e38), j = bfloor(bdiv(bsub(aspect, v), size), -3e38, 3e38);
        return parityEven(toI32(i), toI32(j)) ? 1 : 0;
      }
      case 6: {
        const columns = ai[ioff]!, rows = ai[ioff + 1]!, centers = ai[ioff + 2]!;
        const i = Math.min(columns - 1, Math.max(0, bfloor(bdiv(badd(u, bx(1)), bc(af[foff]!)), 1, columns - 1)));
        const j = Math.min(rows - 1, Math.max(0, bfloor(bdiv(bsub(bc(af[foff + 2]!), v), bc(af[foff + 1]!)), 1, rows - 1)));
        const c = centers + 2 * (j * columns + i), dx = bsub(u, bc(af[c]!)), dy = bsub(v, bc(af[c + 1]!));
        return le(badd(bmul(dx, dx), bmul(dy, dy)), bc(af[foff + 3]!)) ? 1 : 0;
      }
      case 7: {
        const columns = ai[ioff]!, rows = ai[ioff + 1]!, n = ai[ioff + 2]!, background = ai[ioff + 3]!;
        const fx = bdiv(badd(u, bx(1)), bc(af[foff]!)), fy = bdiv(bsub(bc(af[foff + 2]!), v), bc(af[foff + 1]!));
        const i = bfloor(fx, -3e38, 3e38), j = bfloor(fy, -3e38, 3e38);
        if (i < 0 || j < 0 || i >= columns || j >= rows) return background;
        const index = j * columns + i, x = bsub(fx, bx(i)), y = bsub(fy, bx(j)), g0 = bc(af[foff + 3]!), g1 = bc(af[foff + 4]!);
        if (index >= n || lt(x, g0) || gt(x, g1) || lt(y, g0) || gt(y, g1)) return background;
        return index;
      }
      case 8: {
        const nx = ai[ioff]!, ny = ai[ioff + 1]!, csr = ai[ioff + 2]!, entries = ai[ioff + 3]!, disks = ai[ioff + 4]!, mean = ai[ioff + 5]!, cell = bc(af[foff + 2]!);
        const i = bfloor(bdiv(bsub(u, bc(af[foff]!)), cell), -3e38, 3e38), j = bfloor(bdiv(bsub(v, bc(af[foff + 1]!)), cell), -3e38, 3e38);
        if (i < 0 || j < 0 || i >= nx || j >= ny) return mean;
        const c = j * nx + i;
        for (let e = ai[csr + c]!; e < ai[csr + c + 1]!; e++) {
          const d = disks + 4 * ai[entries + e]!, dx = bsub(u, bc(af[d]!)), dy = bsub(v, bc(af[d + 1]!));
          if (le(badd(bmul(dx, dx), bmul(dy, dy)), bc(af[d + 2]!))) return af[d + 3]!;
        }
        return mean;
      }
      case 9: {
        const groups = ai[ioff]!, gf = ai[ioff + 1]!, digits = ai[ioff + 2]!;
        for (let g = 0; g < groups; g++) {
          const o = gf + CHART_RECORD_STRIDE.barGroupFloats * g, a = (k: number): number => af[o + k]!;
          if (lt(u, bc(a(0))) || gt(u, bc(a(1)))) continue;
          if (ge(u, bc(a(2))) && lt(u, bc(a(4))) && ge(v, bc(a(3))) && le(v, bc(a(5)))) return barsMaterial(u, a(2), a(10));
          if (ge(u, bc(a(6))) && le(u, bc(a(8))) && gt(v, bc(a(7))) && le(v, bc(a(9)))) {
            const n = bfloor(bdiv(bsub(bc(a(9)), v), bc(a(10))), -3e38, 3e38);
            return parityEven(toI32(n), 0) ? 0 : 1;
          }
          if (a(11) !== 0 && numeralInk(u, v, a(12), a(13), a(14), digits + a(15))) return 0;
          return 1;
        }
        return 1;
      }
      case 10: {
        const horizontal = ai[ioff] === 0, lines = ai[ioff + 1]!;
        let s: B, y: B;
        if (horizontal) { s = bmul(badd(u, bx(1)), bx(0.5)); y = v; } else { s = bdiv(badd(v, bc(af[foff]!)), bc(af[foff + 4]!)); y = u; }
        if (lt(s, bx(0)) || gt(s, bx(1))) return 1;
        const w = bdiv(bc(af[foff + 1]!), badd(bc(af[foff + 2]!), bmul(bc(af[foff + 3]!), s))), half = bmul(w, bx(f(f(2 * lines - 1) * 0.5)));
        if (lt(y, bneg(half)) || ge(y, half)) return 1;
        const n = bfloor(bdiv(badd(y, half), w), -3e38, 3e38);
        return parityEven(toI32(n), 0) ? 0 : 1;
      }
      case 11: {
        const q = dwAdd(dwMul(xd, xd), dwMul(yd, yd));
        if (gt(bd(q), bc(af[foff]!))) return 1024;
        const psi = dwMul(q, [af[foff + 1]!, af[foff + 2]!]);
        if (!(Math.abs(psi[0]) < 1048576)) { flagged = true; return 0; }
        const n = f(2 * wgslRound(f(psi[0] * 0.5))), r = f(f(psi[0] - n) + psi[1]);
        const phase: B = { v: r, e: f(f(f(DW * f(Math.abs(psi[0]) + Math.abs(psi[1]))) + f(E * Math.abs(r))) + TINY) };
        const c = bcos(bmul(bc(PI), phase)), t = bmul(bx(512), badd(bx(1), c));
        return Math.min(1023, Math.max(0, bfloor(t, 1, 1023)));
      }
      case 12: {
        const columns = ai[ioff]!, rows = ai[ioff + 1]!, cellW = bc(af[foff]!), cellH = bc(af[foff + 1]!), aspect = bc(af[foff + 2]!);
        const i = Math.min(columns - 1, Math.max(0, bfloor(bdiv(badd(u, bx(1)), cellW), 1, columns - 1)));
        const j = Math.min(rows - 1, Math.max(0, bfloor(bdiv(bsub(aspect, v), cellH), 1, rows - 1)));
        const du = bsub(u, badd(bx(-1), bmul(bx(f(i + 0.5)), cellW))), dv = bsub(v, bsub(aspect, bmul(bx(f(j + 0.5)), cellH)));
        const c = bc(af[foff + 3]!), s = bc(af[foff + 4]!), half = bc(af[foff + 5]!);
        const x = bsub(bmul(du, c), bmul(dv, s)), y = badd(bmul(du, s), bmul(dv, c));
        return le(babs(x), half) && le(babs(y), half) ? 0 : 1;
      }
      case 13: {
        const spacing = bc(af[foff]!), half = bc(af[foff + 1]!);
        const nu = wgslRound(f(u.v / spacing.v)), nv = wgslRound(f(v.v / spacing.v));
        const du = babs(bsub(u, bmul(spacing, bx(nu)))), dv = babs(bsub(v, bmul(spacing, bx(nv))));
        return le(du, half) || le(dv, half) ? 1 : 0;
      }
      case 14: {
        const inverted = ai[ioff] !== 0, q = badd(bmul(u, u), bmul(v, v));
        if (gt(q, bc(af[foff]!))) return 2;
        if (gt(q, bc(af[foff + 1]!))) return 0;
        const same = ge0(u) === ge0(v);
        return same !== inverted ? 0 : 1;
      }
      default: flagged = true; return 0;
    }
  };
  const shapeContains = (shape: number, x: B, y: B): boolean => {
    const kind = ai[shape]!, data = ai[shape + 1]!, edges = ai[shape + 2]!, mx = margin(x), my = margin(y);
    if (f(x.v + mx) < af[data]! || f(x.v - mx) > af[data + 2]! || f(y.v + my) < af[data + 1]! || f(y.v - my) > af[data + 3]!) return false;
    if (kind === 1) {
      const dx = bsub(x, bc(af[data + 4]!)), dy = bsub(y, bc(af[data + 5]!)), d2 = badd(bmul(dx, dx), bmul(dy, dy));
      return ge(d2, bc(af[data + 6]!)) && le(d2, bc(af[data + 7]!));
    }
    let winding = 0;
    for (let k = 0; k < edges; k++) {
      const o = data + 4 + 4 * k, x0 = bc(af[o]!), y0 = bc(af[o + 1]!), x1 = bc(af[o + 2]!), y1 = bc(af[o + 3]!);
      if (ge(y, y0)) {
        if (gt(y1, y)) { const side = bsub(bmul(bsub(x1, x0), bsub(y, y0)), bmul(bsub(x, x0), bsub(y1, y0))); if (gt(side, bx(0))) winding++; }
      } else if (le(y1, y)) {
        const side = bsub(bmul(bsub(x1, x0), bsub(y, y0)), bmul(bsub(x, x0), bsub(y1, y0)));
        if (lt(side, bx(0))) winding--;
      }
    }
    return winding !== 0;
  };
  const material = (px: number, pxl: number, py: number, pyl: number): number => {
    const ud: Dw = [px, pxl], vd: Dw = [py, pyl], u = bd(ud), v = bd(vd), layers = ai[1]!, hl = ai[3]!;
    for (let l = layers; l > 0; l--) {
      const h = hl + CHART_RECORD_STRIDE.layer * (l - 1), fo = ai[h + 6]!;
      const u0 = bc(af[fo]!), v0 = bc(af[fo + 1]!), u1 = bc(af[fo + 2]!), v1 = bc(af[fo + 3]!);
      if (lt(u, u0) || gt(u, u1) || lt(v, v0) || gt(v, v1)) continue;
      const x = bmul(bsub(u, u0), bc(af[fo + 4]!)), y = bmul(bsub(v1, v), bc(af[fo + 5]!)), cellsX = ai[h]!, cellsY = ai[h + 1]!;
      const i = Math.min(cellsX - 1, Math.max(0, Math.floor(f(x.v / af[fo + 6]!)))), j = Math.min(cellsY - 1, Math.max(0, Math.floor(f(y.v / af[fo + 7]!))));
      const cell = j * cellsX + i, start = ai[ai[h + 2]! + cell]!, end = ai[ai[h + 2]! + cell + 1]!;
      for (let e = start; e < end; e++) {
        const shape = ai[h + 4]! + CHART_RECORD_STRIDE.shape * ai[ai[h + 3]! + e]!;
        if (shapeContains(shape, x, y)) return ai[h + 8]!;
      }
      return ai[h + 7]!;
    }
    const elements = ai[0]!, he = ai[2]!;
    for (let i = elements; i > 0; i--) {
      const h = he + CHART_RECORD_STRIDE.element * (i - 1), kind = ai[h]!, offset = ai[h + 1]!, ioff = ai[h + 2]!, foff = ai[h + 3]!, placement = ai[h + 4]!;
      if (placement === 0) return offset + classify(kind, ioff, foff + CHART_RECORD_STRIDE.placementFloats, ud, vd);
      const du = dwSub(ud, [af[foff]!, af[foff + 1]!]), dv = dwSub(vd, [af[foff + 2]!, af[foff + 3]!]), hw = bc(af[foff + 4]!), hh = bc(af[foff + 5]!);
      const bu = bds(du, f(Math.abs(ud[0]) + Math.abs(af[foff]!))), bv = bds(dv, f(Math.abs(vd[0]) + Math.abs(af[foff + 2]!)));
      if (lt(bu, bneg(hw)) || gt(bu, hw) || lt(bv, bneg(hh)) || gt(bv, hh)) continue;
      if (placement === 2) { const a = bdiv(bu, hw), b = bdiv(bv, hh); if (gt(badd(bmul(a, a), bmul(b, b)), bx(1))) continue; }
      const scale: Dw = [af[foff + 6]!, af[foff + 7]!];
      return offset + classify(kind, ioff, foff + CHART_RECORD_STRIDE.placementFloats, dwMul(du, scale), dwMul(dv, scale));
    }
    flagged = true;
    return 0;
  };
  for (let i = 0; i < count; i++) {
    flagged = false;
    const m = material(points[4 * i]!, points[4 * i + 1]!, points[4 * i + 2]!, points[4 * i + 3]!);
    if (wavelengthMode !== 0) values[i] = table[m * columns + selectors[i]!]!;
    else for (let c = 0; c < columns; c++) values[i * columns + c] = table[m * columns + c]!;
    flags[i] = flagged ? 1 : 0;
  }
}

/** WGSL `round`: the nearest integer, halves to even (Math.round takes halves up). */
function wgslRound(x: number): number {
  if (Math.abs(x - Math.trunc(x)) === 0.5) return 2 * Math.round(x / 2);
  return Math.round(x);
}
