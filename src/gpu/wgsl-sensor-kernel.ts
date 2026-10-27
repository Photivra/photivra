// SPDX-License-Identifier: Apache-2.0

/**
 * WGSL kernel for the `webgpu-f32` sensor stage (#277, #471), one invocation per native site. It evaluates the
 * reference `simulatePackedSensorSite` (packed-sensor-raw.ts) with the same seeded noise model
 * (`photivra-native-raw-noise` 0.4.0):
 * - the MurmurHash3_x86_32 site seeds, fmix32 scrambling and xorshift32 streams are 32-bit integer
 *   arithmetic, so every random state is bit-identical to the reference;
 * - every comparison against a uniform value is made exactly on the integer state where the reference
 *   value is an exact dyadic rational;
 * - every other decision (Poisson multiplication-method threshold, PTRS floor and acceptance tests,
 *   physical and pre-ADC limits, ADC and digital-gain rounding) is evaluated in float32 together with an
 *   a-priori bound on how far the float32 value can be from the float64 reference value. A site where any
 *   decision falls inside its bound is flagged. An unflagged site therefore makes every decision exactly
 *   as the reference does, and its code and flags equal the reference.
 * - Fixed-pattern noise and additional stored-charge components (2.0): the host evaluates the
 *   fixed-pattern values in float64 with the model's own functions and packs, per site, the Poisson means
 *   already multiplied by the PRNU and dark factors (exactly the reference's products), the pre-ADC limit
 *   minus the readout offset and the offset in codes. Additional Poisson components are drawn from the
 *   charge stream after photo and dark charge, in declaration order; deterministic components enter as an
 *   exact integer part plus a float32 fraction, with their own bounds.
 *
 * Arithmetic assumptions (W3C WGSL, "Floating Point Accuracy" and "Reassociation and Fusion"; every margin
 * is derived in docs/WEBGPU.md, "Sensor-stage margins"):
 * - E = 2^-23. WGSL specifies no rounding direction, so a "correctly rounded" operation (+ − ×, floor, f32(u32))
 *   is within one ULP of the exact value, that is ≤ E relative; `/` is 2.5 ULP (≤ 2.5E); `sqrt` inherits
 *   1.0 / inverseSqrt(x) (≤ 4.5E); `exp` is (3 + 2|x|) ULP; `log` is 3 ULP outside [0.5, 2] and 2^-21
 *   absolute inside. WGSL's `cos` has only a 2^-11 absolute bound, so the kernel uses its own
 *   octant-reduced polynomials.
 * - No decision depends on correctly rounded division: 1/gain and the digital gain arrive from the host as
 *   exact 12-bit pieces, INL segments as host-computed slopes, and every quotient that remains (Box–Muller
 *   logarithm, PTRS) carries the 2.5 ULP bound.
 * - WGSL lets an implementation reassociate. The integer parts of the ADC input are therefore formed in
 *   integer arithmetic, and every floating-point sum carries the order-independent bound
 *   (n − 1)·E·Σ|terms| (Higham, Accuracy and Stability of Numerical Algorithms, 2nd ed., §4.2), so the
 *   sums' margins hold under any association. Fusing a multiply and an add only removes a rounding.
 * - Every margin is then doubled (`MARGIN`), which covers the second-order terms dropped in the derivations.
 */

/** Output word: code in bits 0–15, saturation flags in bits 16–19, the flagged (uncertain) bit 20. */
export const SENSOR_OUTPUT = Object.freeze({ codeMask: 0xffff, flagShift: 16, uncertainBit: 1 << 20 });
/**
 * Auxiliary table layout (float32 words). A gain's four 12-bit pieces are stored as `SENSOR_PIECE_WORDS` words
 * each: the integer mantissa m (< 2^12), the exponent s and the exact scale 2^s, so that piece = m·2^s. The INL
 * table holds the knot codes, the knot offsets and the host-computed segment slopes.
 */
export const SENSOR_AUX = Object.freeze({ stirlingRemainder: 0, sigma: 256, inversePieces: 272, digitalPieces: 284, knots: 296 });
export const SENSOR_PIECE_WORDS = 3;
export const SENSOR_WORKGROUP_SIZE = 256;
/**
 * Per-site packed words: photo word, photo fraction bits, dark word, dark fraction bits; then 2 words per
 * additional Poisson component; then, with deterministic components, their sum (integer part, fraction
 * bits); then, with fixed-pattern noise, (threshold − offset) and offset/gain as (floor, fraction bits).
 */
export const SENSOR_SITE_WORDS = 4;
/** Bits of `Params.extras`. */
export const SENSOR_EXTRAS = Object.freeze({ deterministic: 1, fixedPattern: 2 });
/** Partial charge sums saturate here: above every supported capacity (2^24), so no decision changes. */
export const SENSOR_REALIZED_CLAMP = 2 ** 30;
/** Mean categories in bits 30–31 of a mean word, mirroring `samplePoisson`'s branches. */
export const SENSOR_MEAN_CATEGORY = Object.freeze({ zero: 0, multiplication: 1, transformedRejection: 2, normal: 3 });
/** One WGSL rounding (one ULP, either direction) is at most this relative error: 2^-23. */
export const SENSOR_ROUNDING = 2 ** -23;
/** |z_f32 − z_f64| ≤ SENSOR_NORMAL_ERROR·E·radius for the Box–Muller normal (docs/WEBGPU.md). */
export const SENSOR_NORMAL_ERROR = 20;

/** Smallest integer m with (m + 0.5)/2^32 ≥ t, so `uS ≥ t` ⇔ `m ≥ result` exactly. */
export function uniformThresholdInteger(t: number): number {
  return Math.ceil(t * 2 ** 32 - 0.5);
}

const SIN_COEFFICIENTS = [-1 / 6, 1 / 120, -1 / 5040, 1 / 362880, -1 / 39916800];
const COS_COEFFICIENTS = [-1 / 2, 1 / 24, -1 / 720, 1 / 40320, -1 / 3628800, 1 / 479001600];
const literal = (value: number): string => {
  const text = String(Math.fround(value));
  return /[.e]/u.test(text) ? text : `${text}.0`;
};

export const SENSOR_RAW_WGSL = /* wgsl */ `
const E: f32 = 1.1920928955078125e-7;
const INV32: f32 = 2.3283064365386963e-10;
const TWO_PI_INV32: f32 = ${literal(2 * Math.PI / 2 ** 32)};
const MARGIN: f32 = 2.0;
const CPU_REL: f32 = 7.105427357601002e-15;
const LOG_ABS: f32 = 4.76837158203125e-7;
const Z_ERR: f32 = ${literal(SENSOR_NORMAL_ERROR)};
struct Params {
  count: u32, row0: u32, region_w: u32, native_w: u32,
  region_x: u32, region_y: u32, seed: u32, components: u32,
  knots: u32, digital: u32, saturation: u32, adc_max: u32,
  capacity_floor: u32, threshold_floor: u32, black: u32, sat_quantized: i32,
  capacity_frac: f32, threshold_frac: f32, inv_gain: f32, inv_residual: f32,
  digital_gain: f32, digital_residual: f32, inl_slope: f32, inl_offset: f32,
  site_words: u32, poisson_count: u32, extras: u32, pad0: u32,
  fpn_e_slack: f32, fpn_c_slack: f32, inl_knot: f32, pad2: f32,
};
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> means: array<u32>;
@group(0) @binding(2) var<storage, read> aux: array<f32>;
@group(0) @binding(3) var<storage, read_write> out: array<u32>;

var<private> state: u32;
var<private> uncertain: bool;
var<private> radius: f32;
var<private> ip: i32;
var<private> fp: f32;

fn fmix(value: u32) -> u32 {
  var h = value;
  h = h ^ (h >> 16u); h = h * 0x85ebca6bu; h = h ^ (h >> 13u); h = h * 0xc2b2ae35u; h = h ^ (h >> 16u);
  return h;
}
fn mix_block(hash: u32, block: u32) -> u32 {
  var k = block * 0xcc9e2d51u;
  k = (k << 15u) | (k >> 17u);
  k = k * 0x1b873593u;
  var h = hash ^ k;
  h = (h << 13u) | (h >> 19u);
  return h * 5u + 0xe6546b64u;
}
fn site_seed(seed: u32, index: u32, stream: u32) -> u32 {
  return fmix(mix_block(mix_block(mix_block(0u, seed), index), stream) ^ 12u);
}
fn start(seed: u32) {
  state = fmix(seed ^ 0x9e3779b9u);
  if (state == 0u) { state = 0x6d2b79f5u; }
}
fn next_bits() -> u32 {
  state = state ^ (state << 13u); state = state ^ (state >> 17u); state = state ^ (state << 5u);
  return state;
}
// (bits + 0.5)/2^32 with two roundings (the conversion and the sum; the power-of-two scale is exact): ≤ 2E.
fn unit(bits: u32) -> f32 { return (f32(bits) + 0.5) * INV32; }
fn check(distance: f32, margin: f32) { if (abs(distance) <= margin) { uncertain = true; } }

// ln((bits + 0.5)/2^32), relative error ≤ 11E: WGSL log below 1/2 (≤ 6E), else 2·atanh(r) with r = −w/(2 − w)
// on the exact 1 − unit (division 2.5E; ≤ 10.5E in all).
fn ln_unit(bits: u32) -> f32 {
  if (bits < 0x80000000u) { return log(unit(bits)); }
  let w = (f32(0xffffffffu - bits) + 0.5) * INV32;
  let r = -w / (2.0 - w);
  let r2 = r * r;
  var p = ${literal(1 / 23)};
  ${[21, 19, 17, 15, 13, 11, 9, 7, 5, 3].map(n => `p = p * r2 + ${literal(1 / n)};`).join(" ")}
  p = p * r2 + 1.0;
  return 2.0 * r * p;
}
// cos(2π (bits + 0.5)/2^32): exact octant reduction on the integer, Taylor polynomials on [0, π/4]; absolute error ≤ 8E.
fn cos_unit(bits: u32) -> f32 {
  let octant = bits >> 29u;
  let low = bits & 0x1fffffffu;
  let even = (octant & 1u) == 0u;
  var g = (f32(0x1fffffffu - low) + 0.5) * TWO_PI_INV32;
  if (even) { g = (f32(low) + 0.5) * TWO_PI_INV32; }
  let g2 = g * g;
  var c = ${literal(COS_COEFFICIENTS[5]!)};
  ${[4, 3, 2, 1, 0].map(j => `c = c * g2 + ${literal(COS_COEFFICIENTS[j]!)};`).join(" ")}
  c = c * g2 + 1.0;
  var s = ${literal(SIN_COEFFICIENTS[4]!)};
  ${[3, 2, 1, 0].map(j => `s = s * g2 + ${literal(SIN_COEFFICIENTS[j]!)};`).join(" ")}
  s = g * (s * g2 + 1.0);
  let cb = select(s, c, even);
  let sb = select(c, s, even);
  let q = octant >> 1u;
  if (q == 0u) { return cb; }
  if (q == 1u) { return -sb; }
  if (q == 2u) { return -cb; }
  return sb;
}
// Box–Muller, one value per two uniforms: radius = sqrt(−2 ln u1) (≤ 10E relative), times cos (≤ 8E absolute),
// one product rounding: |z_f32 − z_f64| ≤ Z_ERR·E·radius with Z_ERR = 20 (derivation in docs/WEBGPU.md).
fn std_normal() -> f32 {
  let b1 = next_bits();
  let b2 = next_bits();
  radius = sqrt(-2.0 * ln_unit(b1));
  return radius * cos_unit(b2);
}
// Multiplication method: product of uniforms (3E per factor) against exp(−mean), whose relative error is
// (3 + 2·mean) ULP plus the float32 mean's absolute error E·(mean + 1): ≤ (4 + 3·mean)·E.
fn poisson_small(mean: f32) -> u32 {
  let threshold = exp(-mean);
  var product = 1.0;
  var count = 0u;
  loop {
    count = count + 1u;
    product = product * unit(next_bits());
    check(product - threshold, MARGIN * (3.0 * f32(count) + 4.0 + 3.0 * mean) * E * max(product, threshold));
    if (!(product > threshold)) { break; }
    if (count >= 1000u) { uncertain = true; break; }
  }
  return count - 1u;
}
// g(t) = ln(1 + t) − t for |t| <= 1/2 without cancellation: −t²/(2+t) + 2(s³/3 + s⁵/5 + …), s = t/(2+t).
fn log1p_minus(t: f32) -> f32 {
  let d = 2.0 + t;
  let s = t / d;
  let s2 = s * s;
  var p = ${literal(1 / 25)};
  ${[23, 21, 19, 17, 15, 13, 11, 9, 7, 5].map(n => `p = p * s2 + ${literal(1 / n)};`).join(" ")}
  p = p * s2 + ${literal(1 / 3)};
  return -(t * t) / d + 2.0 * s * s2 * p;
}
fn poisson_ptrs(mi: u32, mf: f32) -> u32 {
  // mean: ≤ 2.1E relative; sq: ≤ 5.6E; b: ≤ 8.7E; a: ≤ 14E; inv_alpha: ≤ 3.5E; v_r: ≤ 6E absolute (docs/WEBGPU.md).
  let mean = f32(mi) + mf;
  let sq = sqrt(mean);
  let b = 0.931 + 2.53 * sq;
  let a = -0.059 + 0.02483 * b;
  let inv_alpha = 1.1239 + 1.1328 / (b - 3.4);
  let v_r = 0.9277 - 3.6224 / (b - 2.0);
  let ln_mean = log(mean);
  for (var iteration = 0u; iteration < 64u; iteration = iteration + 1u) {
    let su = next_bits();
    let sv = next_bits();
    var m = su;
    var sign = -1.0;
    if (su >= 0x80000000u) { m = 0xffffffffu - su; sign = 1.0; }
    let us = unit(m);
    let u = sign * unit(0x7fffffffu - m);
    let v = unit(sv);
    // scale ≤ 19.5E, t = scale·u ≤ 22.5E relative; x = (t + mf) + 0.43 in any order adds 2E·(|t| + 1.43) + 2E.
    let scale = 2.0 * a / us + b;
    let t = scale * u;
    let x = (t + mf) + 0.43;
    let fl = floor(x);
    let ex = MARGIN * (25.0 * E * abs(t) + 4.0 * E + 4.5e-16 * (abs(t) + mean + 1.0));
    if (x - fl <= ex || fl + 1.0 - x <= ex) { uncertain = true; }
    if (fl <= -1073741824.0 || fl >= 1073741824.0) { continue; }
    let k = i32(mi) + i32(fl);
    if (m >= ${uniformThresholdInteger(0.07)}u) {
      if (k >= 0) { check(v - v_r, MARGIN * (7.0 * E + 2.0 * E * v)); }
      if (v <= v_r && k >= 0) { return u32(k); }
    }
    if (k < 0 || (m < ${uniformThresholdInteger(0.013)}u && sv > m)) { continue; }
    // lhs: the argument carries ≤ 31.5E (two divisions), the logarithm 3 ULP or 2^-21.
    let lhs = log(v * inv_alpha / (a / (us * us) + b));
    let dl = 32.0 * E + LOG_ABS + 3.0 * E * abs(lhs);
    var rhs: f32;
    var dr: f32;
    if (k == 0) {
      rhs = -mean;
      dr = 3.0 * E * mean + CPU_REL * mean;
    } else {
      let kf = f32(k);
      let dd = f32(i32(mi) - k) + mf;
      let t2 = dd / kf;
      var kg: f32;
      var dk: f32;
      if (abs(t2) <= 0.5) {
        kg = kf * log1p_minus(t2);
        dk = 25.0 * E * abs(kg) + E;
      } else {
        let lr = log(mean / kf);
        kg = kf * lr - dd;
        dk = kf * (6.0 * E + LOG_ABS + 5.0 * E * abs(lr)) + 2.0 * E * abs(dd) + E + E * abs(kg);
      }
      let lnk = log(kf);
      var corr: f32;
      if (k < 256) { corr = aux[u32(k)]; } else { corr = 1.0 / (12.0 * kf) - 1.0 / (360.0 * kf * kf * kf); }
      rhs = ((kg - 0.5 * lnk) - 0.91893853320467274) - corr;
      dr = dk + 0.5 * LOG_ABS + 1.5 * E * lnk + 2.0 * E + 3.0 * E * (abs(kg) + 0.5 * lnk + 1.0) +
        CPU_REL * (mean + kf * (abs(ln_mean) + lnk + 1.0));
    }
    check(lhs - rhs, MARGIN * (dl + dr));
    if (lhs <= rhs) { return u32(k); }
  }
  uncertain = true;
  return mi;
}
fn poisson(word: u32, frac: f32) -> u32 {
  let category = word >> 30u;
  let mi = word & 0x3fffffffu;
  if (category == 0u) { return 0u; }
  if (category == 1u) { return poisson_small(f32(mi) + frac); }
  if (category == 2u) { return poisson_ptrs(mi, frac); }
  // Means of 1e9 and above: the draw always exceeds the capacity (<= 2^24), so the code does not depend on it.
  let z = std_normal();
  let y = sqrt(f32(mi) + frac) * z + frac + 0.5;
  return u32(max(0, i32(mi) + i32(floor(y))));
}
// Adds product·2^s for an exact integer product < 2^24: the integer part by an integer shift, the fraction as
// an exact float32 below 1 (the masked low bits times the exact power of two). No float split depends on order.
fn add_scaled(product: u32, s: i32, scale: f32) {
  if (product == 0u) { return; }
  // product·2^s is below 2^30 by the host's domain check, so the shift count is below 31.
  if (s >= 0) { ip = ip + i32(product << u32(s)); return; }
  if (s <= -24) { fp = fp + f32(product) * scale; return; }
  let shift = u32(-s);
  ip = ip + i32(product >> shift);
  fp = fp + f32(product & ((1u << shift) - 1u)) * scale;
}
// n·(p0 + p1 + p2 + p3) for an integer 0 <= n < 2^24 and pieces p_j = m_j·2^(s_j) with m_j < 2^12: the
// products hi·m_j and lo·m_j are exact 32-bit integers.
fn scaled(n: u32, base: u32) {
  let hi = n >> 12u;
  let lo = n & 0xfffu;
  for (var j = 0u; j < 4u; j = j + 1u) {
    let m = u32(aux[base + ${SENSOR_PIECE_WORDS}u * j]);
    let s = i32(aux[base + ${SENSOR_PIECE_WORDS}u * j + 1u]);
    let scale = aux[base + ${SENSOR_PIECE_WORDS}u * j + 2u];
    add_scaled(hi * m, s + 12, scale * 4096.0);
    add_scaled(lo * m, s, scale);
  }
}
fn normalize() {
  let f = floor(fp);
  ip = ip + i32(f);
  fp = fp - f;
}
// Piecewise-linear INL offset with host-computed segment slopes (no division): ao + (code − ac)·slope.
fn inl_offset(code: f32) -> f32 {
  let n = params.knots;
  let base = ${SENSOR_AUX.knots}u;
  if (code <= aux[base]) { return aux[base + n]; }
  if (code >= aux[base + n - 1u]) { return aux[base + 2u * n - 1u]; }
  var low = 0u;
  var high = n - 1u;
  loop {
    if (high - low <= 1u) { break; }
    let middle = (low + high) >> 1u;
    if (aux[base + middle] <= code) { low = middle; } else { high = middle; }
  }
  return aux[base + n + low] + (code - aux[base + low]) * aux[base + 2u * n + low];
}
@compute @workgroup_size(${SENSOR_WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) groups: vec3<u32>) {
  let i = gid.x + gid.y * groups.x * ${SENSOR_WORKGROUP_SIZE}u;
  if (i >= params.count) { return; }
  let row = params.row0 + i / params.region_w;
  let index = (params.region_y + row) * params.native_w + params.region_x + i % params.region_w;
  uncertain = false;
  let base = i * params.site_words;
  start(site_seed(params.seed, index, 0u));
  let photo = poisson(means[base], bitcast<f32>(means[base + 1u]));
  let dark = poisson(means[base + 2u], bitcast<f32>(means[base + 3u]));
  // Saturating sums: any total above the clamp is above every supported capacity, as in the reference.
  var realized = min(photo + dark, ${SENSOR_REALIZED_CLAMP}u);
  for (var k = 0u; k < params.poisson_count; k = k + 1u) {
    realized = min(realized + poisson(means[base + 4u + 2u * k], bitcast<f32>(means[base + 5u + 2u * k])), ${SENSOR_REALIZED_CLAMP}u);
  }
  var cursor = base + 4u + 2u * params.poisson_count;
  let deterministic = (params.extras & ${SENSOR_EXTRAS.deterministic}u) != 0u;
  let pattern = (params.extras & ${SENSOR_EXTRAS.fixedPattern}u) != 0u;
  var r_frac = 0.0;
  var det_slack = 0.0;
  if (deterministic) {
    realized = min(realized + means[cursor], ${SENSOR_REALIZED_CLAMP}u);
    r_frac = bitcast<f32>(means[cursor + 1u]);
    det_slack = E;
    cursor = cursor + 2u;
  }
  var t_floor = i32(params.threshold_floor);
  var t_frac = params.threshold_frac;
  var fpn_e_slack = 0.0;
  if (pattern) {
    t_floor = bitcast<i32>(means[cursor]);
    t_frac = bitcast<f32>(means[cursor + 1u]);
    fpn_e_slack = params.fpn_e_slack;
  }
  start(site_seed(params.seed, index, 1u));
  var noise = 0.0;
  var noise_bound = 0.0;
  for (var c = 0u; c < params.components; c = c + 1u) {
    let sigma = aux[256u + c];
    if (sigma != 0.0) {
      let z = std_normal();
      noise = noise + z * sigma;
      // z's error, sigma's rounding, the product, and the order-independent sum over the component count.
      noise_bound = noise_bound + sigma * radius * (Z_ERR + 2.0 + f32(params.components)) * E;
    }
  }
  var flags = 0u;
  var a_int = realized;
  var a_frac = r_frac;
  if (!deterministic) {
    if (realized > params.capacity_floor) { flags = 1u; a_int = params.capacity_floor; a_frac = params.capacity_frac; }
  } else {
    // realized > capacity with a non-integer total: a three-term float32 sum (any order) with its bound.
    let w = f32(i32(realized) - i32(params.capacity_floor));
    let dcap = w + (r_frac - params.capacity_frac);
    check(dcap, MARGIN * (3.0 * E * abs(w) + 6.0 * E + CPU_REL * (f32(realized) + 1.0)));
    if (dcap > 0.0) { flags = 1u; a_int = params.capacity_floor; a_frac = params.capacity_frac; }
  }
  // Pre-ADC limit: afterPhysical + noise + offset > threshold, as afterPhysical − (threshold − offset) + noise > 0,
  // a four-term float32 sum (any order).
  let whole = f32(i32(a_int) - t_floor);
  let diff = (whole + (a_frac - t_frac)) + noise;
  check(diff, MARGIN * (noise_bound + 4.0 * E * abs(whole) + 3.0 * E * abs(noise) + 8.0 * E + CPU_REL * (f32(a_int) + abs(noise)) +
    fpn_e_slack + det_slack));
  var q: i32;
  if (diff > 0.0) {
    flags = flags | 2u;
    q = params.sat_quantized;
  } else {
    // ideal = (afterPhysical + noise + offset)/gain + black, as an exact integer part plus a float32 fraction.
    ip = i32(params.black);
    fp = 0.0;
    var fpn_c_slack = 0.0;
    if (pattern) {
      ip = ip + bitcast<i32>(means[cursor + 2u]);
      fp = bitcast<f32>(means[cursor + 3u]);
      fpn_c_slack = params.fpn_c_slack;
    }
    scaled(a_int, ${SENSOR_AUX.inversePieces}u);
    let noise_codes = noise * params.inv_gain;
    let frac_codes = a_frac * params.inv_gain;
    fp = fp + frac_codes + noise_codes;
    let a_codes = f32(a_int) * params.inv_gain;
    // The fraction sum (eleven terms below 1, frac_codes and noise_codes), the two normalizations and the
    // half-code comparison in any association: 13E·Σ|terms|; then the term errors, the pieces' residual,
    // the reference's float64 rounding and the packed fractions' rounding.
    var margin = MARGIN * (13.0 * E * (13.0 + frac_codes + abs(noise_codes)) + 3.0 * E * frac_codes + 2.0 * E * abs(noise_codes) +
      noise_bound * params.inv_gain + f32(a_int) * params.inv_residual +
      CPU_REL * (a_codes + abs(noise_codes) + f32(params.black)) + fpn_c_slack + det_slack * params.inv_gain);
    normalize();
    if (params.knots > 0u) {
      let ideal = f32(ip) + fp;
      let offset = inl_offset(ideal);
      fp = fp + offset;
      margin = margin * (1.0 + params.inl_slope) + MARGIN * (params.inl_slope * 2.0 * E * (abs(ideal) + 1.0 + params.inl_knot) +
        11.0 * E * (params.inl_offset + 1.0) + CPU_REL * (abs(ideal) + params.inl_offset) * (1.0 + params.inl_slope));
      normalize();
    }
    if ((params.digital & 4u) == 0u) { check(fp - 0.5, margin); }
    q = ip + select(0, 1, fp >= 0.5);
  }
  if ((params.digital & 1u) != 0u) {
    let adc = clamp(q, 0, i32(params.adc_max));
    let delta = adc - i32(params.black);
    let estimate = f32(delta) * params.digital_gain;
    if (estimate >= 16777216.0) {
      q = 16777216;
    } else if (estimate <= -16777216.0) {
      q = -16777216;
    } else {
      ip = 0;
      fp = 0.0;
      scaled(u32(abs(delta)), ${SENSOR_AUX.digitalPieces}u);
      // Eight exact fractions summed in any order, the floor split and the half comparison: ≤ 10 roundings on
      // values below 9; the pieces' residual; the reference's float64 product.
      if ((params.digital & 2u) == 0u) { check(fp - floor(fp) - 0.5, MARGIN * (90.0 * E + f32(abs(delta)) * params.digital_residual + CPU_REL * (abs(estimate) + f32(params.black)))); }
      normalize();
      var whole_part = ip;
      var fraction = fp;
      if (delta < 0) {
        whole_part = -ip;
        if (fp > 0.0) { whole_part = -ip - 1; fraction = 1.0 - fp; }
      }
      q = whole_part + i32(params.black) + select(0, 1, fraction >= 0.5);
    }
  }
  if (q >= i32(params.saturation)) { flags = flags | 4u; }
  if (q < 0) { flags = flags | 8u; }
  let code = u32(clamp(q, 0, i32(params.saturation)));
  out[i] = code | (flags << 16u) | select(0u, ${1 << 20}u, uncertain);
}
`;
