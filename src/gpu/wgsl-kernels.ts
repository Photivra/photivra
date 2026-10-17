// SPDX-License-Identifier: Apache-2.0

/**
 * The project's own WGSL (WebGPU shader language) compute kernels for the `webgpu-f32` image-kernel
 * backend. Each kernel evaluates the same equations, in the same order, as its float64 CPU reference:
 * - SDR: `calculateSdrRendering` / native capture SDR (exposure → tone → gamut → sRGB → nearest-ties-up);
 * - RAW development: `createNativeRawDevelopmentTask` (CFA kernel sums → WB gains → camera→XYZ →
 *   XYZ→linear sRGB → SDR);
 * - irradiance convolution: `convolveIrradianceRows` (source-indexed isoplanatic-patch gather).
 * The host packers in image-kernel-accelerator.ts use matching uniform layouts.
 */

/** Counter slots shared by the SDR-producing kernels. */
export const SDR_COUNTER = Object.freeze({ negative: 0, above: 1, changed: 2, low: 3, high: 4, outOfGamut: 5, uncertain: 6, gamutUncertain: 7,
  saturatedPixels: 8, whiteBalanceClipped: 9, reconstructedPixels: 10 });
export const SDR_COUNTER_SLOTS = 12;
export const LINEAR_WORKGROUP_SIZE = 256;
/** RAW_HIGHLIGHT_RECONSTRUCTION_START as a WGSL literal (rounded once to float32 by the compiler). */
const RAW_HIGHLIGHT_START_WGSL = "0.8";
export const CONVOLUTION_WORKGROUP_EDGE = 16;

/**
 * Shared SDR sample renderer. `band0`/`band1` are absolute classification bands around 0 and 1 inside
 * which the float32 decision may differ from float64; such samples increment the uncertainty counter.
 * A zero result from a non-zero source (underflow) and tiny positive Reinhard inputs are also uncertain.
 */
const SDR_FUNCTIONS = /* wgsl */ `
var<workgroup> local_counters: array<atomic<u32>, ${SDR_COUNTER_SLOTS}>;
fn count(slot: u32) { atomicAdd(&local_counters[slot], 1u); }
fn encode_srgb(x: f32) -> f32 {
  if (x == 1.0) { return 1.0; }
  if (x <= 0.0031308) { return x * 12.92; }
  return 1.055 * pow(x, 1.0 / 2.4) - 0.055;
}
fn render_sample(e: f32, source_nonzero: bool, band0: f32, band1: f32, reinhard: bool, reject: bool, maximum: f32) -> u32 {
  // Gamut decisions (mapped < 0, mapped > 1) depend only on the sign band and, for identity tone, the band at 1.
  var gamut_uncertain = (e == 0.0 && source_nonzero) || (!reinhard && abs(e - 1.0) <= band1);
  if (band0 > 0.0 && abs(e) <= band0) { gamut_uncertain = true; }
  var uncertain = gamut_uncertain || abs(e - 1.0) <= band1;
  if (reinhard && e > 0.0 && e < 9.5367431640625e-7) { uncertain = true; }
  if (uncertain) { count(${SDR_COUNTER.uncertain}u); }
  if (gamut_uncertain) { count(${SDR_COUNTER.gamutUncertain}u); }
  if (e < 0.0) { count(${SDR_COUNTER.negative}u); }
  if (e > 1.0) { count(${SDR_COUNTER.above}u); }
  var mapped = e;
  if (reinhard && e > 0.0) { mapped = e / (1.0 + e); }
  if (mapped != e) { count(${SDR_COUNTER.changed}u); }
  var linear = mapped;
  if (mapped < 0.0 || mapped > 1.0) {
    if (reject) { count(${SDR_COUNTER.outOfGamut}u); }
    else if (mapped < 0.0) { count(${SDR_COUNTER.low}u); linear = 0.0; }
    else { count(${SDR_COUNTER.high}u); linear = 1.0; }
  }
  let code = floor(encode_srgb(linear) * maximum + 0.5);
  return u32(clamp(code, 0.0, maximum));
}
fn clear_counters(local_index: u32) {
  if (local_index < ${SDR_COUNTER_SLOTS}u) { atomicStore(&local_counters[local_index], 0u); }
  workgroupBarrier();
}
fn flush_counters(local_index: u32) {
  workgroupBarrier();
  if (local_index < ${SDR_COUNTER_SLOTS}u) {
    let value = atomicLoad(&local_counters[local_index]);
    if (value > 0u) { atomicAdd(&counters[local_index], value); }
  }
}
`;

/** Pointwise SDR over a packed float32 band; one invocation per sample. */
export const SDR_WGSL = /* wgsl */ `
struct Params { count: u32, reinhard: u32, reject: u32, pad0: u32, scale: f32, maximum: f32, band1: f32, pad1: f32 };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> source: array<f32>;
@group(0) @binding(2) var<storage, read_write> codes: array<u32>;
@group(0) @binding(3) var<storage, read_write> counters: array<atomic<u32>, ${SDR_COUNTER_SLOTS}>;
${SDR_FUNCTIONS}
@compute @workgroup_size(${LINEAR_WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(local_invocation_index) local_index: u32,
        @builtin(num_workgroups) groups: vec3<u32>) {
  clear_counters(local_index);
  let i = gid.x + gid.y * groups.x * ${LINEAR_WORKGROUP_SIZE}u;
  if (i < params.count) {
    let s = source[i];
    codes[i] = render_sample(s * params.scale, s != 0.0, 0.0, params.band1, params.reinhard != 0u, params.reject != 0u, params.maximum);
  }
  flush_counters(local_index);
}
`;

/**
 * Packed native RAW development of one band of output rows; one invocation per output pixel.
 * `normalized` holds the host's float64 site values, rounded once to float32. A saturated site
 * (flagged, or at or above its phase white level) is exactly 1. Any other site is
 * (code − black)/(white − black) ≤ 1 − 1/65535. So a saturated contributing site is recognised exactly.
 * Highlight handling matches `prepareSensorColorDevelopment` (clip at the smallest applied gain, or the
 * declared neutral blend).
 */
export const RAW_DEVELOPMENT_WGSL = /* wgsl */ `
struct Params {
  width: u32, count: u32, row0: u32, reinhard: u32,
  reject: u32, repeat_w: u32, repeat_h: u32, region_w: u32,
  origin_x: i32, origin_y: i32, axx: i32, axy: i32,
  ayx: i32, ayy: i32, region_x: i32, region_y: i32,
  scale: f32, maximum: f32, band0: f32, band1: f32,
  clip_level: f32, reconstruct: u32, band_u: f32, band_s: f32,
  gains: vec4<f32>,
  m0: vec4<f32>, m1: vec4<f32>, m2: vec4<f32>,
  x0: vec4<f32>, x1: vec4<f32>, x2: vec4<f32>,
};
struct Tap { ox: i32, oy: i32, w: f32, pad: f32 };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> normalized: array<f32>;
@group(0) @binding(2) var<storage, read> taps: array<Tap>;
@group(0) @binding(3) var<storage, read> phases: array<vec2<u32>>;
@group(0) @binding(4) var<storage, read_write> codes: array<u32>;
@group(0) @binding(5) var<storage, read_write> counters: array<atomic<u32>, ${SDR_COUNTER_SLOTS}>;
${SDR_FUNCTIONS}
var<private> saturated: bool;
fn channel(phase: u32, c: u32, nx: i32, ny: i32) -> f32 {
  let range = phases[phase * 3u + c];
  var value = 0.0;
  for (var k = 0u; k < range.y; k++) {
    let t = taps[range.x + k];
    let sx = nx + t.ox - params.region_x;
    let sy = ny + t.oy - params.region_y;
    let site = normalized[u32(sy) * params.region_w + u32(sx)];
    if (site == 1.0) { saturated = true; }
    value = value + site * t.w;
  }
  return value;
}
fn row3(m: vec4<f32>, v: vec3<f32>) -> f32 { return ((0.0 + m.x * v.x) + m.y * v.y) + m.z * v.z; }
fn max3(v: vec3<f32>) -> f32 {
  if (v.x > v.y) { if (v.x > v.z) { return v.x; } return v.z; }
  if (v.y > v.z) { return v.y; }
  return v.z;
}
@compute @workgroup_size(${LINEAR_WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(local_invocation_index) local_index: u32,
        @builtin(num_workgroups) groups: vec3<u32>) {
  clear_counters(local_index);
  let i = gid.x + gid.y * groups.x * ${LINEAR_WORKGROUP_SIZE}u;
  if (i < params.count) {
    let col = i32(i % params.width);
    let row = i32(params.row0 + i / params.width);
    let nx = params.origin_x + params.axx * col + params.axy * row;
    let ny = params.origin_y + params.ayx * col + params.ayy * row;
    let phase = (u32(ny) % params.repeat_h) * params.repeat_w + u32(nx) % params.repeat_w;
    saturated = false;
    let c = vec3<f32>(channel(phase, 0u, nx, ny), channel(phase, 1u, nx, ny), channel(phase, 2u, nx, ny));
    if (saturated) { count(${SDR_COUNTER.saturatedPixels}u); }
    let u = vec3<f32>(c.x * params.gains.x, c.y * params.gains.y, c.z * params.gains.z);
    let clip = params.clip_level;
    let k = vec3<f32>(select(u.x, clip, u.x > clip), select(u.y, clip, u.y > clip), select(u.z, clip, u.z > clip));
    var b = k;
    if (params.reconstruct == 0u) {
      for (var j = 0u; j < 3u; j++) {
        if (u[j] > clip) { count(${SDR_COUNTER.whiteBalanceClipped}u); }
        if (abs(u[j] - clip) <= params.band_u) { count(${SDR_COUNTER.uncertain}u); }
      }
    } else {
      let s = max3(c);
      if (abs(s - ${RAW_HIGHLIGHT_START_WGSL}) <= params.band_s) { count(${SDR_COUNTER.uncertain}u); }
      if (s > ${RAW_HIGHLIGHT_START_WGSL}) {
        var t = 1.0;
        if (s < 1.0) { t = (s - ${RAW_HIGHLIGHT_START_WGSL}) / (1.0 - ${RAW_HIGHLIGHT_START_WGSL}); }
        let n = max3(k);
        b = (1.0 - t) * u + t * vec3<f32>(n, n, n);
        count(${SDR_COUNTER.reconstructedPixels}u);
      } else {
        b = u;
      }
    }
    let xyz = vec3<f32>(row3(params.m0, b), row3(params.m1, b), row3(params.m2, b));
    let rgb = vec3<f32>(row3(params.x0, xyz), row3(params.x1, xyz), row3(params.x2, xyz));
    let reinhard = params.reinhard != 0u;
    let reject = params.reject != 0u;
    for (var j = 0u; j < 3u; j++) {
      codes[i * 3u + j] = render_sample(rgb[j] * params.scale, false, params.band0, params.band1, reinhard, reject, params.maximum);
    }
  }
  flush_counters(local_index);
}
`;

/** Source-indexed isoplanatic-patch convolution of one output-row band; one invocation per output site. */
export const IRRADIANCE_CONVOLUTION_WGSL = /* wgsl */ `
struct Params {
  width: u32, height: u32, radius: u32, size: u32,
  patch_w: u32, patch_h: u32, cols: u32, rows: u32,
  out_row0: u32, out_rows: u32, in_row0: u32, taps: u32,
};
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> source: array<f32>;
@group(0) @binding(2) var<storage, read> kernels: array<f32>;
@group(0) @binding(3) var<storage, read_write> result: array<f32>;
@compute @workgroup_size(${CONVOLUTION_WORKGROUP_EDGE}, ${CONVOLUTION_WORKGROUP_EDGE})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let x = gid.x;
  let local_y = gid.y;
  if (x >= params.width || local_y >= params.out_rows) { return; }
  let y = i32(params.out_row0 + local_y);
  let r = i32(params.radius);
  var sum = 0.0;
  for (var v = -r; v <= r; v++) {
    let sy = y - v;
    if (sy < 0 || sy >= i32(params.height)) { continue; }
    let patch_row = min(u32(sy) / params.patch_h, params.rows - 1u) * params.cols;
    let kernel_row = (v + r) * i32(params.size) + r;
    let source_row = (u32(sy) - params.in_row0) * params.width;
    for (var u = -r; u <= r; u++) {
      let sx = i32(x) - u;
      if (sx < 0 || sx >= i32(params.width)) { continue; }
      let patch_index = patch_row + min(u32(sx) / params.patch_w, params.cols - 1u);
      sum = sum + source[source_row + u32(sx)] * kernels[patch_index * params.taps + u32(kernel_row + u)];
    }
  }
  result[local_y * params.width + x] = sum;
}
`;
