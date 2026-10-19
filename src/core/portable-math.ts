// SPDX-License-Identifier: Apache-2.0

/**
 * Floating-point helpers that give bit-identical results in every JavaScript engine.
 *
 * ECMAScript requires `+ - * /` and `Math.sqrt` to be correctly rounded IEEE 754 binary64
 * (double-precision) operations. A fixed sequence of them gives the same bits in every
 * conforming engine. `Math.hypot`, `Math.exp`, `Math.atan`, `Math.cos` and the other
 * transcendental functions are "implementation-approximated" (ECMA-262 §21.3.2). They can
 * differ in the last bit between V8, JavaScriptCore and SpiderMonkey.
 *
 * So any value that is stored and later recomputed for an exact identity check must use
 * only the correctly rounded operations.
 * @see docs/NUMERICAL_CORRECTNESS.md §Cross-engine determinism
 */

const LARGE = 2 ** 500;
const SMALL = 2 ** -500;
const SCALE_DOWN = 2 ** -600;
const SCALE_UP = 2 ** 600;

/**
 * Euclidean norm (vector length) of the components. Unlike `Math.hypot`, it uses only correctly
 * rounded IEEE operations, so the result is bit-identical in every JavaScript engine.
 *
 * Components are summed in argument order. Inputs far from 1 are first rescaled by an exact power
 * of two, so squaring cannot overflow or underflow. Non-finite input gives a non-finite result;
 * callers validate inputs first.
 */
export function portableHypot(...values: readonly number[]): number {
  let maximum = 0;
  for (const value of values) {
    const magnitude = Math.abs(value);
    if (!(magnitude <= maximum)) maximum = magnitude;
  }
  if (maximum === 0 || !Number.isFinite(maximum)) return maximum;
  const scale = maximum > LARGE ? SCALE_DOWN : maximum < SMALL ? SCALE_UP : 1;
  let sum = 0;
  for (const value of values) {
    const scaled = value * scale;
    sum += scaled * scaled;
  }
  return Math.sqrt(sum) / scale;
}

/**
 * True when two finite numbers differ by at most `maximumUlps` ULPs (units in the last place).
 * One ULP here is `Number.EPSILON` times the larger magnitude. Use it to accept an archived value
 * that another engine or an earlier release computed with an implementation-approximated function.
 */
export function equalWithinUlps(a: number, b: number, maximumUlps: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (a === b) return true;
  return Math.abs(a - b) <= maximumUlps * Number.EPSILON * Math.max(Math.abs(a), Math.abs(b));
}

// ---------------------------------------------------------------------------------------------------------------
// Portable logarithm, exponential, power, cube root and cosine/sine of 2πu.
//
// Each function below is a fixed sequence of correctly rounded binary64 operations (+, −, ×, ÷, exact
// power-of-two scaling through the IEEE 754 bit pattern, Math.round/Math.floor and integer operations), with
// every constant written as a decimal literal of at most 17 significant digits (ECMAScript converts these
// exactly to the nearest double). The bits of every result are therefore the same in every conforming
// JavaScript engine, unlike Math.pow, Math.exp, Math.log, Math.cbrt and Math.cos, which ECMA-262 leaves
// "implementation-approximated" (docs/NUMERICAL_CORRECTNESS.md, "Cross-engine determinism").
//
// Methods (textbook; no code copied):
// - Error-free transformations (double-double arithmetic): TwoSum (Knuth, The Art of Computer Programming
//   vol. 2, §4.2.2), FastTwoSum and TwoProduct with Veltkamp's splitting (Dekker, "A floating-point technique
//   for extending the available precision", Numerische Mathematik 18, 1971). Exact barring overflow and
//   underflow, which the arguments here cannot reach.
// - log2(x): x = m·2^e with m in [√½, √2); ln m = 2·atanh(s) = 2(s + s³/3 + s⁵/5 + …), s = (m − 1)/(m + 1),
//   |s| ≤ 0.1716 (J.-M. Muller, Elementary Functions: Algorithms and Implementation, 3rd ed., 2016, ch. 11).
//   s carries a double-double correction; the series runs to s²³ (truncation below 2^-62 relative).
// - 2^t: t = n + r with n = round(t), |r| ≤ ½; 2^r = e^(r·ln 2) by its Taylor series to degree 14 (truncation
//   below 2^-57 relative), then an exact scaling by 2^n (Muller, ch. 11, "additive range reduction").
// - x^y = 2^(y·log2 x) with log2 x and y·log2 x carried as double-double; e^x = 2^(x·log2 e) and
//   ∛x = 2^(log2 x / 3) likewise; ln x = log2 x · ln 2; e^x − 1 by its Taylor series for |x| < 1.
// - cos(2πu), sin(2πu): u = q/4 + r with q = round(4u) and |r| ≤ ⅛ (exact), then the Taylor series of cos and
//   sin of 2πr to degrees 18 and 19 (truncation below 2^-66).
//
// Error bounds (from the operation counts above): portableExp2, portableExp, portableLog, portableLog2 and
// portableCbrt within 1 ulp; portableExpm1 within 2 ulps; portablePow within 1 ulp for |y| ≤ 4 (the double-double
// logarithm has relative error below 2^-56, so the error of y·log2 x adds at most |y|·2^-57·ln 2 relative);
// portableCosTwoPi and portableSinTwoPi within 2 ulps. Checked against 60-digit decimal references (Python decimal)
// on 2·10⁵ pseudo-random arguments per function (6·10⁵ for portableLog; |y| ≤ 4 and y = 1/2.4, 1.4 for portablePow):
// largest errors 0.53 ulp (log, log2), 0.86 (exp2), 0.94 (exp, cbrt, pow), 0.97 (pow with y = 1/2.4), 1.59 (cos,
// sin of 2πu) and 1.66 (e^x − 1); spot values are in test/portable-math.test.ts. These are accuracy bounds;
// determinism does not depend on them.

/** Bit access to a double: the high 32-bit word is at index HIGH of the view (detected once, so either byte order works). */
const BITS = new Float64Array(1), WORDS = new Uint32Array(BITS.buffer);
const HIGH = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1 ? 1 : 0, LOW = 1 - HIGH;
/** 2^k for every integer k in [−1074, 1023] at POW2[k + 1074], built by exact halving and doubling. */
const POW2 = new Float64Array(2098);
POW2[1074] = 1;
for (let k = 1; k <= 1023; k++) POW2[1074 + k] = POW2[1073 + k]! * 2;
for (let k = 1; k <= 1074; k++) POW2[1074 - k] = POW2[1075 - k]! / 2;
/** v·2^k for an integer k in [−1100, 1100]: one exact multiplication (a single rounding only when the result is subnormal). */
function scaleByPowerOfTwo(v: number, k: number): number {
  if (k > 1023) return v * POW2[2097]! * POW2[1074 + k - 1023]!;
  if (k < -1074) return v * POW2[1074 + k + 1074]! * POW2[0]!; // exact first factor (v·2^(k+1074) is normal), one rounding
  return v * POW2[1074 + k]!;
}
// Double-double arithmetic, written out inline below (local variables only, which keeps it fast):
// - FastTwoSum (|a| ≥ |b| or a = 0): s = a + b, err = b − (s − a), so a + b = s + err exactly;
// - TwoSum (any a, b): s = a + b, b' = s − a, err = (a − (s − b')) + (b − b');
// - TwoProduct: p = a·b, err = ((ah·bh − p) + ah·bl + al·bh) + al·bl, with Veltkamp's split
//   ah = c − (c − a), al = a − ah, c = (2^27 + 1)·a (and likewise for b), so a·b = p + err exactly.
const SPLITTER = 134217729; // 2^27 + 1 (Veltkamp)
const LN2_HI = 0.6931471805599453, LN2_LO = 2.3190468138462996e-17;
const LOG2E_HI = 1.4426950408889634, LOG2E_LO = 2.0355273740931033e-17;
const SQRT2 = 1.4142135623730951, TWO_POW_54 = 18014398509481984, MIN_NORMAL = 2.2250738585072014e-308;
/** Veltkamp halves of a constant (the same values the split gives at each use). */
function splitHigh(a: number): number { const c = SPLITTER * a; return c - (c - a); }
const LN2_HI_H = splitHigh(LN2_HI), LN2_HI_L = LN2_HI - LN2_HI_H, LOG2E_HI_H = splitHigh(LOG2E_HI), LOG2E_HI_L = LOG2E_HI - LOG2E_HI_H;
/** The low part of the last double-double result (its high part is the return value). */
const LOW_PART = new Float64Array(1);

/**
 * log2 m for m in [√½, √2] by the atanh series to s²³ (no table): builds LOG2_TABLE once. Returns the high part, the low
 * part in LOW_PART[0]; relative error below 2^-56.
 */
function log2SeriesDoubleDouble(x: number): number {
  let e = 0;
  if (x < MIN_NORMAL) { x *= TWO_POW_54; e = -54; }
  BITS[0] = x;
  const high = WORDS[HIGH]!;
  e += (high >>> 20) - 1023;
  let m = x * POW2[1074 - ((high >>> 20) - 1023)]!; // exact: m in [1, 2)
  if (m > SQRT2) { m *= 0.5; e += 1; }
  // s = f/(2 + f) with f = m − 1 (exact), as sHi + sLo: 2 + f = dh + dl exactly (FastTwoSum), then the residual
  // f − sHi·(dh + dl) with sHi·dh = p + pe exactly (TwoProduct).
  const f = m - 1, dh = 2 + f, dl = f - (dh - 2), sHi = f / dh, p = sHi * dh;
  let c = SPLITTER * sHi;
  const ah = c - (c - sHi), al = sHi - ah;
  c = SPLITTER * dh;
  const bh = c - (c - dh), bl = dh - bh, pe = ((ah * bh - p) + ah * bl + al * bh) + al * bl;
  const sLo = (((f - p) - pe) - sHi * dl) / dh;
  const z = sHi * sHi;
  const tail = sHi * z * (0.6666666666666666 + z * (0.4 + z * (0.2857142857142857 + z * (0.2222222222222222 + z * (0.18181818181818182 + z * (0.15384615384615385 +
    z * (0.13333333333333333 + z * (0.11764705882352941 + z * (0.10526315789473684 + z * (0.09523809523809523 + z * 0.08695652173913043))))))))));
  // ln m = 2sHi + (2sLo + tail) = lh + ll (FastTwoSum); times log2 e = LOG2E_HI + LOG2E_LO (TwoProduct of the high parts); plus e (TwoSum).
  const a1 = 2 * sHi, b1 = 2 * sLo + tail, lh = a1 + b1, ll = b1 - (lh - a1), q = lh * LOG2E_HI;
  c = SPLITTER * lh;
  const ch = c - (c - lh), cl = lh - ch, qe = ((ch * LOG2E_HI_H - q) + ch * LOG2E_HI_L + cl * LOG2E_HI_H) + cl * LOG2E_HI_L;
  const pl = qe + (lh * LOG2E_LO + ll * LOG2E_HI);
  const t = e + q, tb = t - e, te = (e - (t - tb)) + (q - tb), b2 = te + pl, hi = t + b2;
  LOW_PART[0] = b2 - (hi - t);
  return hi;
}
/** log2(k/128) for k = 90 … 182 (the table's range of k = round(128·m), m in [√½, √2]) as double-doubles. */
const LOG2_TABLE_HI = new Float64Array(183), LOG2_TABLE_LO = new Float64Array(183);
for (let k = 90; k <= 182; k++) { LOG2_TABLE_HI[k] = log2SeriesDoubleDouble(k / 128); LOG2_TABLE_LO[k] = LOW_PART[0]!; }
/**
 * log2 x as a double-double for finite x > 0: returns the high part, the low part in LOW_PART[0]. x = m·2^e with m in
 * [√½, √2]; m = F·(1 + f/F) with F = k/128, k = round(128·m), so log2 m = log2 F (table) + 2·atanh(s)·log2 e with
 * s = f/(m + F), |s| < 2^-8.4, by its series to s⁷ (truncation below 2^-70 relative). Relative error below 2^-56.
 */
function log2DoubleDouble(x: number): number {
  let e = 0;
  if (x < MIN_NORMAL) { x *= TWO_POW_54; e = -54; }
  BITS[0] = x;
  const high = WORDS[HIGH]!;
  e += (high >>> 20) - 1023;
  let m = x * POW2[1074 - ((high >>> 20) - 1023)]!; // exact: m in [1, 2)
  if (m > SQRT2) { m *= 0.5; e += 1; }
  // F = k/128 (exact) and f = m − F (exact, F/2 ≤ m ≤ 2F); m + F = dh + dl exactly (TwoSum); s = f/(dh + dl) as sHi + sLo
  // from the residual f − sHi·(dh + dl), with sHi·dh = p + pe exactly (TwoProduct).
  const k = Math.round(m * 128), F = k / 128, f = m - F, dh = m + F, db = dh - m, dl = (m - (dh - db)) + (F - db);
  const sHi = f / dh, p = sHi * dh;
  let c = SPLITTER * sHi;
  const ah = c - (c - sHi), al = sHi - ah;
  c = SPLITTER * dh;
  const bh = c - (c - dh), bl = dh - bh, pe = ((ah * bh - p) + ah * bl + al * bh) + al * bl;
  const sLo = (((f - p) - pe) - sHi * dl) / dh, z = sHi * sHi;
  const tail = sHi * z * (0.6666666666666666 + z * (0.4 + z * 0.2857142857142857));
  // ln(m/F) = 2sHi + (2sLo + tail) = lh + ll (FastTwoSum); times log2 e = LOG2E_HI + LOG2E_LO (TwoProduct of the high
  // parts); plus log2 F (TwoSum with the table's high part), then plus e (TwoSum).
  const a1 = 2 * sHi, b1 = 2 * sLo + tail, lh = a1 + b1, ll = b1 - (lh - a1), q = lh * LOG2E_HI;
  c = SPLITTER * lh;
  const ch = c - (c - lh), cl = lh - ch, qe = ((ch * LOG2E_HI_H - q) + ch * LOG2E_HI_L + cl * LOG2E_HI_H) + cl * LOG2E_HI_L;
  const pl = qe + (lh * LOG2E_LO + ll * LOG2E_HI), th = LOG2_TABLE_HI[k]!;
  const t = th + q, tb = t - th, low = ((th - (t - tb)) + (q - tb)) + (pl + LOG2_TABLE_LO[k]!);
  const u = e + t, ub = u - e, b2 = ((e - (u - ub)) + (t - ub)) + low, hi = u + b2;
  LOW_PART[0] = b2 - (hi - u);
  return hi;
}
/** 2^(th + tl) for a double-double exponent; within 1 ulp (plus the error the exponent carries). */
function exp2DoubleDouble(th: number, tl: number): number {
  if (th !== th) return NaN;
  if (th > 1024) return Infinity;
  if (th < -1080) return 0;
  // th = n + r exactly (|r| ≤ ½); w = r·ln 2 = wh + wl (TwoProduct with LN2_HI, plus r·LN2_LO).
  const n = Math.round(th), r = (th - n) + tl, wh = r * LN2_HI, c = SPLITTER * r, ah = c - (c - r), al = r - ah;
  const wl = (((ah * LN2_HI_H - wh) + ah * LN2_HI_L + al * LN2_HI_H) + al * LN2_HI_L) + r * LN2_LO;
  const q = 0.5 + wh * (0.16666666666666666 + wh * (0.041666666666666664 + wh * (0.008333333333333333 + wh * (0.001388888888888889 + wh * (0.0001984126984126984 +
    wh * (2.48015873015873e-05 + wh * (2.7557319223985893e-06 + wh * (2.755731922398589e-07 + wh * (2.505210838544172e-08 + wh * (2.08767569878681e-09 +
    wh * (1.6059043836821613e-10 + wh * 1.1470745597729725e-11)))))))))));
  return scaleByPowerOfTwo(1 + (wh + (wl + wh * wh * q)), n);
}

/** log2 x, bit-identical in every JavaScript engine (within 1 ulp). 0 → −∞; negative or NaN → NaN; +∞ → +∞. */
export function portableLog2(x: number): number {
  if (!(x > 0)) return x === 0 ? -Infinity : NaN;
  if (x === Infinity) return Infinity;
  const h = log2DoubleDouble(x);
  return h + LOW_PART[0]!;
}
/** ln(k/128) for k = 90 … 182 as double-doubles (log2(k/128)·ln 2, TwoProduct with LN2_HI plus the small products). */
const LN_TABLE_HI = new Float64Array(183), LN_TABLE_LO = new Float64Array(183);
for (let k = 90; k <= 182; k++) {
  const h = LOG2_TABLE_HI[k]!, l = LOG2_TABLE_LO[k]!, p = h * LN2_HI, c = SPLITTER * h, ah = c - (c - h), al = h - ah;
  const pe = ((ah * LN2_HI_H - p) + ah * LN2_HI_L + al * LN2_HI_H) + al * LN2_HI_L, lo = pe + (h * LN2_LO + l * LN2_HI), hi = p + lo;
  LN_TABLE_HI[k] = hi; LN_TABLE_LO[k] = lo - (hi - p);
}
/** ln 2 = LN2_E_HI + LN2_E_LO with the low 32 bits of LN2_E_HI zero, so e·LN2_E_HI is exact for every exponent e here. */
const LN2_E_HI = ((): number => { BITS[0] = LN2_HI; WORDS[LOW] = 0; return BITS[0]!; })(), LN2_E_LO = (LN2_HI - LN2_E_HI) + LN2_LO;
/**
 * Natural logarithm, bit-identical in every JavaScript engine (within 1 ulp). 0 → −∞; negative or NaN → NaN; +∞ → +∞.
 * x = m·2^e, m in [√½, √2]; ln x = e·ln 2 + ln F (table, F = k/128, k = round(128·m)) + 2·atanh(s), s = (m − F)/(m + F),
 * with s as a double-double and the three terms added with TwoSum.
 */
export function portableLog(x: number): number {
  if (!(x > 0)) return x === 0 ? -Infinity : NaN;
  if (x === Infinity) return Infinity;
  let e = 0;
  if (x < MIN_NORMAL) { x *= TWO_POW_54; e = -54; }
  BITS[0] = x;
  const high = WORDS[HIGH]!;
  e += (high >>> 20) - 1023;
  let m = x * POW2[1074 - ((high >>> 20) - 1023)]!; // exact: m in [1, 2)
  if (m > SQRT2) { m *= 0.5; e += 1; }
  const k = Math.round(m * 128), F = k / 128, f = m - F, dh = m + F, db = dh - m, dl = (m - (dh - db)) + (F - db);
  const sHi = f / dh, p = sHi * dh;
  let c = SPLITTER * sHi;
  const ah = c - (c - sHi), al = sHi - ah;
  c = SPLITTER * dh;
  const bh = c - (c - dh), bl = dh - bh, pe = ((ah * bh - p) + ah * bl + al * bh) + al * bl;
  const sLo = (((f - p) - pe) - sHi * dl) / dh, z = sHi * sHi;
  const tail = sHi * z * (0.6666666666666666 + z * (0.4 + z * 0.2857142857142857));
  // (e·LN2_E_HI + ln F) + 2sHi with TwoSum errors, then the low parts.
  const A = e * LN2_E_HI, B = LN_TABLE_HI[k]!, t = A + B, tb = t - A, te = (A - (t - tb)) + (B - tb);
  const a2 = 2 * sHi, u = t + a2, ub = u - t, ue = (t - (u - ub)) + (a2 - ub);
  return u + ((te + ue) + ((e * LN2_E_LO + LN_TABLE_LO[k]!) + (2 * sLo + tail)));
}
/** 2^x, bit-identical in every JavaScript engine (within 1 ulp). */
export function portableExp2(x: number): number { return exp2DoubleDouble(x, 0); }
/** e^x, bit-identical in every JavaScript engine (within 1 ulp). */
export function portableExp(x: number): number {
  if (x !== x) return NaN;
  if (x > 710) return Infinity;
  if (x < -746) return 0;
  // x·log2 e = th + tl: x·LOG2E_HI = th + te exactly (TwoProduct), plus x·LOG2E_LO.
  const th = x * LOG2E_HI, c = SPLITTER * x, ah = c - (c - x), al = x - ah;
  const te = ((ah * LOG2E_HI_H - th) + ah * LOG2E_HI_L + al * LOG2E_HI_H) + al * LOG2E_HI_L;
  return exp2DoubleDouble(th, te + x * LOG2E_LO);
}
/**
 * e^x − 1, bit-identical in every JavaScript engine (within 2 ulps): the Taylor series to degree 20 for |x| < 1
 * (truncation below 2^-60 relative), else portableExp(x) − 1.
 */
export function portableExpm1(x: number): number {
  if (x !== x) return NaN;
  if (x === 0) return x;
  if (!(x > -1 && x < 1)) return portableExp(x) - 1;
  return x + x * x * (0.5 + x * (0.16666666666666666 + x * (0.041666666666666664 + x * (0.008333333333333333 + x * (0.001388888888888889 + x * (0.0001984126984126984 +
    x * (2.48015873015873e-05 + x * (2.7557319223985893e-06 + x * (2.755731922398589e-07 + x * (2.505210838544172e-08 + x * (2.08767569878681e-09 +
    x * (1.6059043836821613e-10 + x * (1.1470745597729725e-11 + x * (7.647163731819816e-13 + x * (4.779477332387385e-14 + x * (2.8114572543455206e-15 +
    x * (1.5619206968586225e-16 + x * (8.22063524662433e-18 + x * 4.110317623312165e-19))))))))))))))))));
}
/**
 * x^y for x ≥ 0 and finite y, bit-identical in every JavaScript engine (within 1 ulp for |y| ≤ 4). x = 0 gives 0 for
 * y > 0, 1 for y = 0 and +∞ for y < 0; negative x or a non-finite argument gives NaN (the callers never pass them).
 */
export function portablePow(x: number, y: number): number {
  if (!(x >= 0) || !Number.isFinite(x) || !Number.isFinite(y)) return NaN;
  if (y === 0 || x === 1) return 1;
  if (x === 0) return y > 0 ? 0 : Infinity;
  // y·(lh + ll): lh·y = p + pe exactly (TwoProduct), then FastTwoSum(p, pe + ll·y).
  const lh = log2DoubleDouble(x), ll = LOW_PART[0]!, p = lh * y;
  let c = SPLITTER * lh;
  const ah = c - (c - lh), al = lh - ah;
  c = SPLITTER * y;
  const bh = c - (c - y), bl = y - bh, pe = ((ah * bh - p) + ah * bl + al * bh) + al * bl;
  const b = pe + ll * y, th = p + b;
  return exp2DoubleDouble(th, b - (th - p));
}
/** ∛(2^r) for r = 0, 1, 2 (only scale the cube root's starting value, so their last bits do not matter). */
const CBRT_POWERS_OF_TWO = [1, 1.2599210498948732, 1.5874010519681994];
/**
 * Cube root, bit-identical in every JavaScript engine (within 1 ulp; exact for ±0, ±∞ and cubes of powers of two).
 * |x| = m·2^(3q + r) with m in [1, 2) and r in {0, 1, 2}, w = m·2^r: a cubic fit to ∛m (within 1.7·10⁻⁴) times ∛(2^r),
 * one Halley step y ← y(y³ + 2w)/(2y³ + w) (cubic convergence: below 10⁻¹¹), then one Newton step y + (w − y³)/(3y²)
 * with w − y³ formed exactly (TwoProduct), which leaves only the final rounding and errors near 10⁻²².
 */
export function portableCbrt(x: number): number {
  if (x === 0 || x !== x || !Number.isFinite(x)) return x;
  let a = x < 0 ? -x : x, shift = 0;
  if (a < MIN_NORMAL) { a *= TWO_POW_54; shift = -18; }
  BITS[0] = a;
  const high = WORDS[HIGH]!, e = (high >>> 20) - 1023, q = Math.floor(e / 3), r = e - 3 * q;
  const m = a * POW2[1074 - e]!, w = m * CBRT_SCALE[r]!; // exact: m in [1, 2)
  let y = (0.5561432746078446 + m * (0.5806821751356804 + m * (-0.15894786280039686 + m * 0.022291567104952514))) * CBRT_POWERS_OF_TWO[r]!;
  const y3 = y * y * y;
  y = y * (y3 + 2 * w) / (2 * y3 + w);
  // y² = p + pe exactly; y³ = p·y + pe·y = t + te (TwoProduct of p and y, plus pe·y); w − y³ = (w − t) − te.
  const p = y * y;
  let c = SPLITTER * y;
  const yh = c - (c - y), yl = y - yh, pe = ((yh * yh - p) + yh * yl + yl * yh) + yl * yl, t = p * y;
  c = SPLITTER * p;
  const ph = c - (c - p), pll = p - ph, te = (((ph * yh - t) + ph * yl + pll * yh) + pll * yl) + pe * y;
  const root = scaleByPowerOfTwo(y + ((w - t) - te) / (3 * p), q + shift);
  return x < 0 ? -root : root;
}
/** 2^r for r = 0, 1, 2. */
const CBRT_SCALE = [1, 2, 4];
/** cos(2πr) and sin(2πr) for |r| ≤ ⅛ (Taylor series in z = r²). */
function cosTwoPiReduced(r: number): number {
  const z = r * r;
  return 1 + z * (-19.739208802178716 + z * (64.9393940226683 + z * (-85.45681720669373 + z * (60.24464137187666 + z * (-26.4262567833744 + z * (7.903536371318469 +
    z * (-1.714390711088672 + z * (0.28200596845579123 + z * -0.03638284114254567))))))));
}
function sinTwoPiReduced(r: number): number {
  const z = r * r;
  return r * (6.283185307179586 + z * (-41.34170224039976 + z * (81.60524927607506 + z * (-76.70585975306139 + z * (42.058693944897655 + z * (-15.09464257682299 +
    z * (3.819952584848282 + z * (-0.7181223017785006 + z * (0.10422916220813984 + z * -0.012031585942120627)))))))));
}
/** cos(2πu) for finite u (u in turns), bit-identical in every JavaScript engine (within 2 ulps). */
export function portableCosTwoPi(u: number): number {
  if (!Number.isFinite(u)) return NaN;
  const t = 4 * u, q = Math.round(t), r = (t - q) / 4, quadrant = ((q % 4) + 4) % 4;
  return quadrant === 0 ? cosTwoPiReduced(r) : quadrant === 1 ? -sinTwoPiReduced(r) : quadrant === 2 ? -cosTwoPiReduced(r) : sinTwoPiReduced(r);
}
/** sin(2πu) for finite u (u in turns), bit-identical in every JavaScript engine (within 2 ulps). */
export function portableSinTwoPi(u: number): number {
  if (!Number.isFinite(u)) return NaN;
  const t = 4 * u, q = Math.round(t), r = (t - q) / 4, quadrant = ((q % 4) + 4) % 4;
  return quadrant === 0 ? sinTwoPiReduced(r) : quadrant === 1 ? cosTwoPiReduced(r) : quadrant === 2 ? -sinTwoPiReduced(r) : -cosTwoPiReduced(r);
}
