// SPDX-License-Identifier: Apache-2.0
/**
 * Float32 JavaScript emulations (Math.fround after every operation; correctly rounded transcendentals) of
 * the sensor-stage and temporal-sum WGSL kernels, for the in-process fake WebGPU device. They mirror the
 * WGSL line by line; real-device conformance lives in test/webgpu.
 */
import { SENSOR_AUX, uniformThresholdInteger } from "../../src/gpu/wgsl-sensor-kernel.js";

const f = Math.fround;
const U = 2 ** -24, INV32 = f(2 ** -32), TWO_PI_INV32 = f(2 * Math.PI / 2 ** 32), MARGIN = 2, CPU_REL = f(2 ** -47);
const M07 = uniformThresholdInteger(0.07), M013 = uniformThresholdInteger(0.013);
const SIN = [-1 / 6, 1 / 120, -1 / 5040, 1 / 362880, -1 / 39916800].map(f), COS = [-1 / 2, 1 / 24, -1 / 720, 1 / 40320, -1 / 3628800, 1 / 479001600].map(f);

function fmix(value: number): number {
  let h = value >>> 0;
  h = (h ^ (h >>> 16)) >>> 0; h = Math.imul(h, 0x85ebca6b) >>> 0; h = (h ^ (h >>> 13)) >>> 0; h = Math.imul(h, 0xc2b2ae35) >>> 0; h = (h ^ (h >>> 16)) >>> 0;
  return h;
}
function mixBlock(hash: number, block: number): number {
  let k = Math.imul(block, 0xcc9e2d51) >>> 0;
  k = ((k << 15) | (k >>> 17)) >>> 0;
  k = Math.imul(k, 0x1b873593) >>> 0;
  let h = (hash ^ k) >>> 0;
  h = ((h << 13) | (h >>> 19)) >>> 0;
  return (Math.imul(h, 5) + 0xe6546b64) >>> 0;
}

export function emulateSensor(u32: Uint32Array, i32: Int32Array, pf: Float32Array, means: Uint32Array, meanFloats: Float32Array, aux: Float32Array, out: Uint32Array): void {
  const [count, row0, regionW, nativeW, regionX, regionY, seed, components, knots, digital, saturation, adcMax, capacityFloor, thresholdFloor, black] =
    Array.from(u32.subarray(0, 15)) as number[];
  const satQuantized = i32[15]!;
  const [capacityFrac, thresholdFrac, invGain, invResidual, digitalGain, digitalResidual, inlSlope, inlOffsetMax] = Array.from(pf.subarray(16, 24)) as number[];
  let state = 0, radius = 0, ip = 0, fp = 0, uncertain!: boolean;
  const start = (s: number): void => { state = fmix((s ^ 0x9e3779b9) >>> 0); if (state === 0) state = 0x6d2b79f5; };
  const next = (): number => { state = (state ^ (state << 13)) >>> 0; state = (state ^ (state >>> 17)) >>> 0; state = (state ^ (state << 5)) >>> 0; return state; };
  const unit = (bits: number): number => f(f(f(bits) + .5) * INV32);
  const check = (distance: number, margin: number): void => { if (Math.abs(distance) <= margin) uncertain = true; };
  const lnUnit = (bits: number): number => {
    if (bits < 0x80000000) return f(Math.log(unit(bits)));
    const w = f(f(f(0xffffffff - bits) + .5) * INV32), r = f(-w / f(2 - w)), r2 = f(r * r);
    let p = f(1 / 23);
    for (const n of [21, 19, 17, 15, 13, 11, 9, 7, 5, 3]) p = f(f(p * r2) + f(1 / n));
    p = f(f(p * r2) + 1);
    return f(f(2 * r) * p);
  };
  const cosUnit = (bits: number): number => {
    const octant = bits >>> 29, low = bits & 0x1fffffff, even = (octant & 1) === 0;
    const g = even ? f(f(f(low) + .5) * TWO_PI_INV32) : f(f(f(0x1fffffff - low) + .5) * TWO_PI_INV32), g2 = f(g * g);
    let c = COS[5]!;
    for (const j of [4, 3, 2, 1, 0]) c = f(f(c * g2) + COS[j]!);
    c = f(f(c * g2) + 1);
    let s = SIN[4]!;
    for (const j of [3, 2, 1, 0]) s = f(f(s * g2) + SIN[j]!);
    s = f(g * f(f(s * g2) + 1));
    const cb = even ? c : s, sb = even ? s : c, q = octant >>> 1;
    return q === 0 ? cb : q === 1 ? -sb : q === 2 ? -cb : sb;
  };
  const stdNormal = (): number => { const b1 = next(), b2 = next(); radius = f(Math.sqrt(f(-2 * lnUnit(b1)))); return f(radius * cosUnit(b2)); };
  const poissonSmall = (mean: number): number => {
    const threshold = f(Math.exp(-mean));
    let product = 1, n = 0;
    for (;;) {
      n++;
      product = f(product * unit(next()));
      check(f(product - threshold), MARGIN * (3 * n + 130) * U * Math.max(product, threshold));
      if (!(product > threshold)) break;
      if (n >= 1000) { uncertain = true; break; }
    }
    return n - 1;
  };
  const log1pMinus = (t: number): number => {
    const d = f(2 + t), s = f(t / d), s2 = f(s * s);
    let p = f(1 / 25);
    for (const n of [23, 21, 19, 17, 15, 13, 11, 9, 7, 5]) p = f(f(p * s2) + f(1 / n));
    p = f(f(p * s2) + f(1 / 3));
    return f(f(-f(t * t) / d) + f(f(f(2 * s) * s2) * p));
  };
  const ptrs = (mi: number, mf: number): number => {
    const mean = f(f(mi) + mf), sq = f(Math.sqrt(mean)), b = f(f(.931) + f(f(2.53) * sq)), a = f(f(-.059) + f(f(.02483) * b));
    const invAlpha = f(f(1.1239) + f(f(1.1328) / f(b - f(3.4)))), vR = f(f(.9277) - f(f(3.6224) / f(b - 2))), lnMean = f(Math.log(mean));
    for (let iteration = 0; iteration < 64; iteration++) {
      const su = next(), sv = next();
      let m = su, sign = -1;
      if (su >= 0x80000000) { m = 0xffffffff - su; sign = 1; }
      const us = unit(m), u = f(sign * unit(0x7fffffff - m)), v = unit(sv);
      const scale = f(f(f(2 * a) / us) + b), t = f(scale * u), x = f(f(t + mf) + f(.43)), fl = Math.floor(x);
      const ex = MARGIN * (Math.abs(t) * 40 * U + 2 * U * (Math.abs(t) + 1) + f(4.5e-16) * (Math.abs(t) + mean + 1));
      if (f(x - fl) <= ex || f(f(fl + 1) - x) <= ex) uncertain = true;
      if (fl <= -1073741824 || fl >= 1073741824) continue;
      const k = mi + fl;
      if (m >= M07) {
        if (k >= 0) check(f(v - vR), MARGIN * (16 * U + 2 * U * v));
        if (v <= vR && k >= 0) return k;
      }
      if (k < 0 || (m < M013 && sv > m)) continue;
      const lhs = f(Math.log(f(f(v * invAlpha) / f(f(a / f(us * us)) + b))));
      const dl = 60 * U + 2 ** -21 + 4 * U * Math.abs(lhs);
      let rhs: number, dr: number;
      if (k === 0) { rhs = -mean; dr = 2 * U * mean + CPU_REL * mean; } else {
        const kf = f(k), dd = f(f(mi - k) + mf), t2 = f(dd / kf);
        let kg: number, dk: number;
        if (Math.abs(t2) <= .5) { kg = f(kf * log1pMinus(t2)); dk = 20 * U * Math.abs(kg); } else {
          const lr = f(Math.log(f(mean / kf)));
          kg = f(f(kf * lr) - dd);
          dk = kf * (8 * U + 2 ** -21 + 5 * U * Math.abs(lr)) + 3 * U * Math.abs(dd) + U * Math.abs(kg);
        }
        const lnk = f(Math.log(kf));
        const corr = k < 256 ? aux[k]! : f(f(1 / f(12 * kf)) - f(1 / f(f(f(360 * kf) * kf) * kf)));
        rhs = f(f(f(kg - f(.5 * lnk)) - f(0.5 * Math.log(2 * Math.PI))) - corr);
        dr = dk + 2 ** -22 + 2 * U * lnk + U + .6 * U + 3 * U * (Math.abs(kg) + .5 * lnk + 1) + CPU_REL * (mean + kf * (Math.abs(lnMean) + lnk + 1));
      }
      check(f(lhs - rhs), MARGIN * (dl + dr));
      if (lhs <= rhs) return k;
    }
    uncertain = true;
    return mi;
  };
  const poisson = (word: number, frac: number): number => {
    const category = word >>> 30, mi = word & 0x3fffffff;
    if (category === 0) return 0;
    if (category === 1) return poissonSmall(f(f(mi) + frac));
    if (category === 2) return ptrs(mi, frac);
    const z = stdNormal(), y = f(f(f(f(Math.sqrt(f(f(mi) + frac))) * z) + frac) + .5);
    return Math.max(0, mi + Math.floor(y));
  };
  const accumulate = (value: number): void => { const fl = Math.floor(value); ip += fl; fp = f(fp + f(value - fl)); };
  const scaled = (n: number, base: number): void => {
    const hi = f(n >>> 12), lo = f(n & 0xfff);
    for (let j = 0; j < 4; j++) { const piece = aux[base + j]!; accumulate(f(f(hi * piece) * 4096)); accumulate(f(lo * piece)); }
  };
  const normalize = (): void => { const fl = Math.floor(fp); ip += fl; fp = f(fp - fl); };
  const inlOffset = (code: number): number => {
    const base = SENSOR_AUX.knots, n = knots!;
    if (code <= aux[base]!) return aux[base + n]!;
    if (code >= aux[base + n - 1]!) return aux[base + 2 * n - 1]!;
    let low = 0, high = n - 1;
    while (high - low > 1) { const middle = (low + high) >>> 1; if (aux[base + middle]! <= code) low = middle; else high = middle; }
    const ac = aux[base + low]!, ao = aux[base + n + low]!;
    return f(ao + f(f(f(code - ac) / f(aux[base + high]! - ac)) * f(aux[base + n + high]! - ao)));
  };
  for (let i = 0; i < count!; i++) {
    const row = row0! + Math.floor(i / regionW!), index = ((regionY! + row) * nativeW! + regionX! + i % regionW!) >>> 0;
    uncertain = false;
    start(fmix((mixBlock(mixBlock(mixBlock(0, seed!), index), 0) ^ 12) >>> 0));
    const photo = poisson(means[i * 4]!, meanFloats[i * 4 + 1]!), dark = poisson(means[i * 4 + 2]!, meanFloats[i * 4 + 3]!);
    const realized = photo + dark;
    start(fmix((mixBlock(mixBlock(mixBlock(0, seed!), index), 1) ^ 12) >>> 0));
    let noise = 0, noiseBound = 0;
    for (let c = 0; c < components!; c++) {
      const sigma = aux[SENSOR_AUX.sigma + c]!;
      if (sigma !== 0) { const z = stdNormal(); noise = f(noise + f(z * sigma)); noiseBound = noiseBound + sigma * radius * (28 + components!) * U; }
    }
    let flags = 0, aInt = realized, aFrac = 0;
    if (realized > capacityFloor!) { flags = 1; aInt = capacityFloor!; aFrac = capacityFrac!; }
    const whole = f(aInt - thresholdFloor!), diff = f(f(whole + f(aFrac - thresholdFrac!)) + noise);
    check(diff, MARGIN * (noiseBound + 3 * U + 2 * U * (Math.abs(whole) + Math.abs(noise) + 2) + CPU_REL * (aInt + Math.abs(noise))));
    let q: number;
    if (diff > 0) { flags |= 2; q = satQuantized; } else {
      ip = black!; fp = 0;
      scaled(aInt, SENSOR_AUX.inversePieces);
      const noiseCodes = f(noise * invGain!);
      fp = f(f(fp + f(aFrac * invGain!)) + noiseCodes);
      const aCodes = f(f(aInt) * invGain!);
      let margin = MARGIN * (10 * U * (10 + Math.abs(noiseCodes)) + 4 * U * aFrac * invGain! + 3 * U * Math.abs(noiseCodes) + noiseBound * invGain! +
        aInt * invResidual! + 2 * U + CPU_REL * (aCodes + Math.abs(noiseCodes) + black!));
      normalize();
      if (knots! > 0) {
        const ideal = f(f(ip) + fp), offset = inlOffset(ideal);
        fp = f(fp + offset);
        margin = margin * (1 + inlSlope!) + MARGIN * (inlSlope! * 2 * U * (Math.abs(ideal) + 1) + 8 * U * (inlOffsetMax! + 1) +
          CPU_REL * (Math.abs(ideal) + inlOffsetMax!) * (1 + inlSlope!));
        normalize();
      }
      if ((digital! & 4) === 0) check(f(fp - .5), margin);
      q = ip + (fp >= .5 ? 1 : 0);
    }
    if ((digital! & 1) !== 0) {
      const adc = Math.min(Math.max(q, 0), adcMax!), delta = adc - black!, estimate = f(f(delta) * digitalGain!);
      if (estimate >= 16777216) q = 16777216;
      else if (estimate <= -16777216) q = -16777216;
      else {
        ip = 0; fp = 0;
        scaled(Math.abs(delta), SENSOR_AUX.digitalPieces);
        if ((digital! & 2) === 0) check(f(f(fp - Math.floor(fp)) - .5), MARGIN * (40 * U * 9 + Math.abs(delta) * digitalResidual! + CPU_REL * (Math.abs(estimate) + black!)));
        normalize();
        let wholePart = ip, fraction = fp;
        if (delta < 0) { wholePart = -ip; if (fp > 0) { wholePart = -ip - 1; fraction = f(1 - fp); } }
        q = wholePart + black! + (fraction >= .5 ? 1 : 0);
      }
    }
    if (q >= saturation!) flags |= 4;
    if (q < 0) flags |= 8;
    out[i] = (Math.min(Math.max(q, 0), saturation!) | (flags << 16) | (uncertain ? 1 << 20 : 0)) >>> 0;
  }
}

export function emulateTemporalSum(p: Uint32Array, source: Float32Array, nodeData: ArrayBuffer, weights: Float32Array, result: Float32Array): void {
  const [width, height, nodes, outRow0, outRows, inRow0] = Array.from(p.subarray(0, 6)) as number[];
  const ints = new Int32Array(nodeData), floats = new Float32Array(nodeData);
  const sample = (sx: number, sy: number): number => source[(sy - inRow0!) * width! + sx]!;
  for (let ly = 0; ly < outRows!; ly++) for (let x = 0; x < width!; x++) {
    const y = outRow0! + ly;
    let sum = 0;
    for (let k = 0; k < nodes!; k++) {
      const sx = x + ints[k * 8]!, sy = y + ints[k * 8 + 1]!, b = floats.subarray(k * 8 + 4, k * 8 + 8);
      const left = sx >= 0 && sx < width!, right = sx + 1 >= 0 && sx + 1 < width!, top = sy >= 0 && sy < height!, bottom = sy + 1 >= 0 && sy + 1 < height!;
      let inner = 0;
      if (top && left) inner = f(inner + f(b[0]! * sample(sx, sy)));
      if (top && right) inner = f(inner + f(b[1]! * sample(sx + 1, sy)));
      if (bottom && left) inner = f(inner + f(b[2]! * sample(sx, sy + 1)));
      if (bottom && right) inner = f(inner + f(b[3]! * sample(sx + 1, sy + 1)));
      sum = f(sum + f(weights[k * outRows! + ly]! * inner));
    }
    result[ly * width! + x] = sum;
  }
}
