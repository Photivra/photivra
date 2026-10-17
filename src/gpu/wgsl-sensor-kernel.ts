// SPDX-License-Identifier: Apache-2.0

/**
 * WGSL kernel for the `webgpu-f32` sensor stage (#277), one invocation per native site. It evaluates the
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
 *
 * The bounds use u = 2^-24 and the WGSL accuracy table (W3C WGSL, "Floating Point Accuracy"): correctly
 * rounded + − ×, division 2.5 ULP, sqrt inherited from 1/inverseSqrt (≤ 4.5 ULP), exp 3 + 2|x| ULP,
 * log 3 ULP or 2^-21 absolute on [0.5, 2]. WGSL's built-in cos has only a 2^-11 absolute bound, so
 * the kernel uses its own range-reduced Taylor polynomials. Every margin is doubled (`MARGIN`).
 * See docs/WEBGPU.md.
 */

/** Output word: code in bits 0–15, saturation flags in bits 16–19, the flagged (uncertain) bit 20. */
export const SENSOR_OUTPUT = Object.freeze({ codeMask: 0xffff, flagShift: 16, uncertainBit: 1 << 20 });
/** Auxiliary table layout (float32 words). */
export const SENSOR_AUX = Object.freeze({ stirlingRemainder: 0, sigma: 256, inversePieces: 272, digitalPieces: 276, knots: 280 });
export const SENSOR_WORKGROUP_SIZE = 256;
/** Per-site packed means: 4 words (photo word, photo fraction bits, dark word, dark fraction bits). */
export const SENSOR_SITE_WORDS = 4;
/** Mean categories in bits 30–31 of a mean word, mirroring `samplePoisson`'s branches. */
export const SENSOR_MEAN_CATEGORY = Object.freeze({ zero: 0, multiplication: 1, transformedRejection: 2, normal: 3 });

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
const U: f32 = 5.9604644775390625e-8;
const INV32: f32 = 2.3283064365386963e-10;
const TWO_PI_INV32: f32 = ${literal(2 * Math.PI / 2 ** 32)};
const MARGIN: f32 = 2.0;
const CPU_REL: f32 = 7.105427357601002e-15;
struct Params {
  count: u32, row0: u32, region_w: u32, native_w: u32,
  region_x: u32, region_y: u32, seed: u32, components: u32,
  knots: u32, digital: u32, saturation: u32, adc_max: u32,
  capacity_floor: u32, threshold_floor: u32, black: u32, sat_quantized: i32,
  capacity_frac: f32, threshold_frac: f32, inv_gain: f32, inv_residual: f32,
  digital_gain: f32, digital_residual: f32, inl_slope: f32, inl_offset: f32,
};
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> means: array<vec4<u32>>;
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
fn unit(bits: u32) -> f32 { return (f32(bits) + 0.5) * INV32; }
fn check(distance: f32, margin: f32) { if (abs(distance) <= margin) { uncertain = true; } }

// ln((bits + 0.5)/2^32), relative error <= 12u: WGSL log below 1/2, else 2·atanh(r) on the exact 1 - u.
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
// cos(2π (bits + 0.5)/2^32): exact octant reduction on the integer, Taylor polynomials on [0, π/4].
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
// Box–Muller, one value per two uniforms; |z_f32 − z_f64| <= 24u·radius.
fn std_normal() -> f32 {
  let b1 = next_bits();
  let b2 = next_bits();
  radius = sqrt(-2.0 * ln_unit(b1));
  return radius * cos_unit(b2);
}
fn poisson_small(mean: f32) -> u32 {
  let threshold = exp(-mean);
  var product = 1.0;
  var count = 0u;
  loop {
    count = count + 1u;
    product = product * unit(next_bits());
    check(product - threshold, MARGIN * (3.0 * f32(count) + 130.0) * U * max(product, threshold));
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
    let scale = 2.0 * a / us + b;
    let t = scale * u;
    let x = (t + mf) + 0.43;
    let fl = floor(x);
    let ex = MARGIN * (abs(t) * 40.0 * U + 2.0 * U * (abs(t) + 1.0) + 4.5e-16 * (abs(t) + mean + 1.0));
    if (x - fl <= ex || fl + 1.0 - x <= ex) { uncertain = true; }
    if (fl <= -1073741824.0 || fl >= 1073741824.0) { continue; }
    let k = i32(mi) + i32(fl);
    if (m >= ${uniformThresholdInteger(0.07)}u) {
      if (k >= 0) { check(v - v_r, MARGIN * (16.0 * U + 2.0 * U * v)); }
      if (v <= v_r && k >= 0) { return u32(k); }
    }
    if (k < 0 || (m < ${uniformThresholdInteger(0.013)}u && sv > m)) { continue; }
    let lhs = log(v * inv_alpha / (a / (us * us) + b));
    let dl = 60.0 * U + 4.76837158203125e-7 + 4.0 * U * abs(lhs);
    var rhs: f32;
    var dr: f32;
    if (k == 0) {
      rhs = -mean;
      dr = 2.0 * U * mean + CPU_REL * mean;
    } else {
      let kf = f32(k);
      let dd = f32(i32(mi) - k) + mf;
      let t2 = dd / kf;
      var kg: f32;
      var dk: f32;
      if (abs(t2) <= 0.5) {
        kg = kf * log1p_minus(t2);
        dk = 20.0 * U * abs(kg);
      } else {
        let lr = log(mean / kf);
        kg = kf * lr - dd;
        dk = kf * (8.0 * U + 4.76837158203125e-7 + 5.0 * U * abs(lr)) + 3.0 * U * abs(dd) + U * abs(kg);
      }
      let lnk = log(kf);
      var corr: f32;
      if (k < 256) { corr = aux[u32(k)]; } else { corr = 1.0 / (12.0 * kf) - 1.0 / (360.0 * kf * kf * kf); }
      rhs = ((kg - 0.5 * lnk) - 0.91893853320467274) - corr;
      dr = dk + 2.384185791015625e-7 + 2.0 * U * lnk + U + 0.6 * U + 3.0 * U * (abs(kg) + 0.5 * lnk + 1.0) +
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
// Adds an exact non-negative float32 value split into integer and fractional parts.
fn accumulate(value: f32) {
  let f = floor(value);
  ip = ip + i32(f);
  fp = fp + (value - f);
}
// n·(p0 + p1 + p2 + p3) for an integer 0 <= n < 2^24 and 12-bit pieces: every product is exact.
fn scaled(n: u32, base: u32) {
  let hi = f32(n >> 12u);
  let lo = f32(n & 0xfffu);
  for (var j = 0u; j < 4u; j = j + 1u) {
    let piece = aux[base + j];
    accumulate(hi * piece * 4096.0);
    accumulate(lo * piece);
  }
}
fn normalize() {
  let f = floor(fp);
  ip = ip + i32(f);
  fp = fp - f;
}
fn inl_offset(code: f32) -> f32 {
  let n = params.knots;
  let base = ${"280u"};
  if (code <= aux[base]) { return aux[base + n]; }
  if (code >= aux[base + n - 1u]) { return aux[base + 2u * n - 1u]; }
  var low = 0u;
  var high = n - 1u;
  loop {
    if (high - low <= 1u) { break; }
    let middle = (low + high) >> 1u;
    if (aux[base + middle] <= code) { low = middle; } else { high = middle; }
  }
  let ac = aux[base + low];
  let ao = aux[base + n + low];
  return ao + ((code - ac) / (aux[base + high] - ac)) * (aux[base + n + high] - ao);
}
@compute @workgroup_size(${SENSOR_WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) groups: vec3<u32>) {
  let i = gid.x + gid.y * groups.x * ${SENSOR_WORKGROUP_SIZE}u;
  if (i >= params.count) { return; }
  let row = params.row0 + i / params.region_w;
  let index = (params.region_y + row) * params.native_w + params.region_x + i % params.region_w;
  uncertain = false;
  let site = means[i];
  start(site_seed(params.seed, index, 0u));
  let photo = poisson(site.x, bitcast<f32>(site.y));
  let dark = poisson(site.z, bitcast<f32>(site.w));
  let realized = photo + dark;
  start(site_seed(params.seed, index, 1u));
  var noise = 0.0;
  var noise_bound = 0.0;
  for (var c = 0u; c < params.components; c = c + 1u) {
    let sigma = aux[256u + c];
    if (sigma != 0.0) {
      let z = std_normal();
      noise = noise + z * sigma;
      noise_bound = noise_bound + sigma * radius * (28.0 + f32(params.components)) * U;
    }
  }
  var flags = 0u;
  var a_int = realized;
  var a_frac = 0.0;
  if (realized > params.capacity_floor) { flags = 1u; a_int = params.capacity_floor; a_frac = params.capacity_frac; }
  // Pre-ADC limit: afterPhysical + noise > threshold.
  let whole = f32(i32(a_int) - i32(params.threshold_floor));
  let diff = (whole + (a_frac - params.threshold_frac)) + noise;
  check(diff, MARGIN * (noise_bound + 3.0 * U + 2.0 * U * (abs(whole) + abs(noise) + 2.0) + CPU_REL * (f32(a_int) + abs(noise))));
  var q: i32;
  if (diff > 0.0) {
    flags = flags | 2u;
    q = params.sat_quantized;
  } else {
    // ideal = (afterPhysical + noise)/gain + black, as an exact integer part plus a float32 fraction.
    ip = i32(params.black);
    fp = 0.0;
    scaled(a_int, 272u);
    let noise_codes = noise * params.inv_gain;
    fp = fp + a_frac * params.inv_gain + noise_codes;
    let a_codes = f32(a_int) * params.inv_gain;
    var margin = MARGIN * (10.0 * U * (10.0 + abs(noise_codes)) + 4.0 * U * a_frac * params.inv_gain + 3.0 * U * abs(noise_codes) +
      noise_bound * params.inv_gain + f32(a_int) * params.inv_residual + 2.0 * U +
      CPU_REL * (a_codes + abs(noise_codes) + f32(params.black)));
    normalize();
    if (params.knots > 0u) {
      let ideal = f32(ip) + fp;
      let offset = inl_offset(ideal);
      fp = fp + offset;
      margin = margin * (1.0 + params.inl_slope) + MARGIN * (params.inl_slope * 2.0 * U * (abs(ideal) + 1.0) +
        8.0 * U * (params.inl_offset + 1.0) + CPU_REL * (abs(ideal) + params.inl_offset) * (1.0 + params.inl_slope));
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
      scaled(u32(abs(delta)), 276u);
      if ((params.digital & 2u) == 0u) { check(fp - floor(fp) - 0.5, MARGIN * (40.0 * U * 9.0 + f32(abs(delta)) * params.digital_residual + CPU_REL * (abs(estimate) + f32(params.black)))); }
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
