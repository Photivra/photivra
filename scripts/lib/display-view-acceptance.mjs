// SPDX-License-Identifier: Apache-2.0

/**
 * Pure helpers of `scripts/accept-display-view-gpu.mjs` (#480), kept apart so `test/display-view-acceptance.test.mjs` can
 * check them: the per-pixel reduction of two display-view renders, its thresholds and the difference image.
 *
 * The colour science is the engine's, not re-implemented here: `createAcceptanceMetrics` takes the engine's CIEDE2000
 * (`deltaE2000`, the formula of `calculateColorDifference`, after Sharma, Wu and Dalal 2005 / CIE 142-2001), its CIELAB
 * conversion (`cielabOfXyz`, CIE 15) and the sRGB colour space of `resolveRgbColorSpace("srgb")` (the linear RGB → XYZ matrix
 * derived from the BT.709 primaries and D65, and the D65 white). The harness imports them from the build; the test from `src/`.
 */

/** 8-bit sRGB code value (continuous, not rounded) of a linear display value clamped to [0, 1] (IEC 61966-2-1 transfer). */
export const srgbCode8 = (linear) => { const v = Math.min(1, Math.max(0, linear)); return 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055); };

/** The default thresholds (#473, pending the owner's confirmation in #483). */
export const DEFAULT_THRESHOLDS = Object.freeze({ withinDeltaE: 1, withinFraction: 0.99, maximumDeltaE: 2.3, maximumSigma: 1 });

/**
 * The colour metrics bound to the engine's colour functions: `deltaE2000(lab1, lab2)` and `cielabOfXyz(xyz, white)` on
 * `{ lStar, aStar, bStar }` and `{ x, y, z }` records, and `srgb` with `rgbToXyz` (3 × 3 rows) and `whiteXyz`.
 */
export function createAcceptanceMetrics({ deltaE2000, cielabOfXyz, srgb }) {
  const m = srgb.rgbToXyz, white = srgb.whiteXyz;
  /** CIELAB (D65) of a linear sRGB display colour; components outside [0, 1] are clamped to the display range first, as the 8-bit code is. */
  const labOfLinearSrgb = (r, g, b) => {
    const R = Math.min(1, Math.max(0, r)), G = Math.min(1, Math.max(0, g)), B = Math.min(1, Math.max(0, b));
    return cielabOfXyz({ x: m[0][0] * R + m[0][1] * G + m[0][2] * B, y: m[1][0] * R + m[1][1] * G + m[1][2] * B, z: m[2][0] * R + m[2][1] * G + m[2][2] * B }, white);
  };
  /** CIEDE2000 (kL = kC = kH = 1) between two linear sRGB display colours given as [r, g, b]. */
  const deltaEOfLinearSrgb = (a, b) => deltaE2000(labOfLinearSrgb(a[0], a[1], a[2]), labOfLinearSrgb(b[0], b[1], b[2]));

  /**
   * Per-pixel comparison of two noise-free expected images (interleaved linear RGB, `Float64Array`) of `width × height`
   * display pixels. `referenceNoiseStd` is the reference's per-component noise standard deviation in linear light (the same
   * layout); the expected-value difference of each component is expressed in units of it (a zero σ with a zero difference
   * counts 0, with a non-zero difference Infinity). ΔE2000 is between the two pixels' sRGB display colours (continuous,
   * not quantized to 8 bits). Returns the metrics, the per-pixel ΔE and the per-pixel largest |Δ|/σ.
   */
  function compareExpectedImages({ width, height, reference, candidate, referenceNoiseStd, candidateNoiseStd, withinDeltaE = DEFAULT_THRESHOLDS.withinDeltaE }) {
    const n = width * height;
    for (const [name, a] of [["reference", reference], ["candidate", candidate], ["referenceNoiseStd", referenceNoiseStd]]) if (a.length !== 3 * n) throw new Error(`${name} has ${a.length} values, expected ${3 * n}.`);
    if (candidateNoiseStd && candidateNoiseStd.length !== 3 * n) throw new Error(`candidateNoiseStd has ${candidateNoiseStd.length} values, expected ${3 * n}.`);
    const deltaE = new Float64Array(n), sigma = new Float64Array(n);
    let within = 0, maxDeltaE = 0, sumDeltaE = 0, maxSigma = 0, identical = 0, maxCode8 = 0, maxNoiseRelative = 0, argMaxDeltaE = 0, argMaxSigma = 0;
    for (let i = 0; i < n; i++) {
      const o = 3 * i, r = reference, c = candidate;
      const de = deltaE2000(labOfLinearSrgb(r[o], r[o + 1], r[o + 2]), labOfLinearSrgb(c[o], c[o + 1], c[o + 2]));
      deltaE[i] = de; sumDeltaE += de;
      if (de <= withinDeltaE) within++;
      if (de > maxDeltaE) { maxDeltaE = de; argMaxDeltaE = i; }
      let s = 0, same = true;
      for (let k = 0; k < 3; k++) {
        const d = c[o + k] - r[o + k], sd = referenceNoiseStd[o + k];
        if (d !== 0) same = false;
        const ratio = d === 0 ? 0 : sd > 0 ? Math.abs(d) / sd : Infinity;
        if (ratio > s) s = ratio;
        maxCode8 = Math.max(maxCode8, Math.abs(srgbCode8(c[o + k]) - srgbCode8(r[o + k])));
        if (candidateNoiseStd) { const dn = candidateNoiseStd[o + k] - sd; if (dn !== 0) maxNoiseRelative = Math.max(maxNoiseRelative, sd > 0 ? Math.abs(dn) / sd : Infinity); }
      }
      sigma[i] = s;
      if (s > maxSigma) { maxSigma = s; argMaxSigma = i; }
      if (same) identical++;
    }
    const at = (i) => ({ x: i % width, y: Math.floor(i / width) });
    return { pixels: n, withinDeltaE, withinFraction: within / n, maxDeltaE, maxDeltaEAt: at(argMaxDeltaE), meanDeltaE: sumDeltaE / n, maxSigma, maxSigmaAt: at(argMaxSigma),
      maxCode8, identicalPixels: identical, identicalFraction: identical / n, maxNoiseStdRelativeDifference: candidateNoiseStd ? maxNoiseRelative : undefined, deltaE, sigma };
  }
  return { labOfLinearSrgb, deltaEOfLinearSrgb, compareExpectedImages };
}

/** Pass or fail of each threshold on a comparison's metrics. */
export function judge(metrics, thresholds = DEFAULT_THRESHOLDS) {
  const checks = [
    { id: "within", label: `at least ${(100 * thresholds.withinFraction).toFixed(2).replace(/\.?0+$/u, "")} % of pixels within ΔE2000 ${thresholds.withinDeltaE}`, value: metrics.withinFraction, pass: metrics.withinFraction >= thresholds.withinFraction },
    { id: "maxDeltaE", label: `no pixel above ΔE2000 ${thresholds.maximumDeltaE}`, value: metrics.maxDeltaE, pass: metrics.maxDeltaE <= thresholds.maximumDeltaE },
    { id: "maxSigma", label: `no pixel's expected value moves by more than ${thresholds.maximumSigma} × its noise σ`, value: metrics.maxSigma, pass: metrics.maxSigma <= thresholds.maximumSigma }
  ];
  return { checks, pass: checks.every((c) => c.pass) };
}

/**
 * The difference image: |candidate − reference| of each component in 8-bit sRGB code values, times `gain`, clamped to 255
 * (interleaved RGB, `Uint8Array`). Black means no difference; it is a diagnostic picture, not a capture or a display view.
 */
export function differenceImage8(reference, candidate, gain = 16) {
  if (reference.length !== candidate.length) throw new Error("The two images differ in size.");
  const out = new Uint8Array(reference.length);
  for (let i = 0; i < out.length; i++) out[i] = Math.min(255, Math.round(gain * Math.abs(srgbCode8(candidate[i]) - srgbCode8(reference[i]))));
  return out;
}

/** Reduces per-case comparison records to the run's verdict: every case must pass every threshold. */
export function summarize(records, thresholds = DEFAULT_THRESHOLDS) {
  const judged = records.map((r) => ({ ...r, verdict: judge(r.metrics, thresholds) }));
  return { cases: judged, pass: judged.length > 0 && judged.every((r) => r.verdict.pass), failing: judged.filter((r) => !r.verdict.pass).map((r) => r.id) };
}

/**
 * Why a candidate render does not count as a GPU render, or null when it does: the guard of `--gpu` (#480), so that a run
 * whose GPU did not render fails loudly instead of comparing the CPU with itself. `render` is the producer's result; its
 * `execution` is the render's `diagnostics.fast.execution` (`DisplayViewExecution`) and `softwareAdapter` whether the browser
 * reported a software adapter (SwiftShader). With `requireHardware` a software adapter is a failure too.
 */
export function gpuRenderProblem(render, { requireHardware = false } = {}) {
  const execution = render?.execution;
  if (!execution || typeof execution !== "object") return "the candidate reported no execution record, so nothing shows that the GPU rendered the view.";
  if (execution.backend !== "webgpu-f32") return `the candidate ran ${String(execution.backend)}, not webgpu-f32` + (execution.fallbackReason ? ` (fallback reason ${execution.fallbackReason})` : "") + ".";
  if (execution.fallbackReason !== null && execution.fallbackReason !== undefined) return `the candidate's render carries the fallback reason ${execution.fallbackReason}.`;
  if (execution.arithmetic !== "float32") return `the candidate's arithmetic is ${String(execution.arithmetic)}, not float32.`;
  if (!execution.conformance || execution.conformance.passed !== true) return "the device's run-time conformance self-check did not pass" + (execution.conformance?.failedCase ? ` (case ${execution.conformance.failedCase})` : "") + ".";
  if (!execution.errorBound) return "the candidate's GPU render reported no error bound.";
  if (requireHardware && render.softwareAdapter !== false) return `a hardware adapter was required, but the browser reported ${render.softwareAdapter === true ? "a software adapter" : "no adapter information"} (${JSON.stringify(execution.adapter)}).`;
  return null;
}

/**
 * Why a request cannot be sent to the browser page of the GPU producer, or null: the page receives it as JSON, so it must hold
 * no function (a caller scene function, which the GPU renderer refuses anyway: give the scene as `material-layers`).
 */
export function requestTransportProblem(options, path = "options") {
  if (typeof options === "function") return `${path} is a function; the GPU producer needs the request as data (give the scene as material-layers, not a caller scene function).`;
  if (options === null || typeof options !== "object") {
    if (typeof options === "number" && !Number.isFinite(options)) return `${path} is ${options}, which JSON cannot carry.`;
    return typeof options === "bigint" || typeof options === "symbol" ? `${path} is a ${typeof options}, which JSON cannot carry.` : null;
  }
  if (ArrayBuffer.isView(options)) return `${path} is a typed array, which this transport does not carry.`;
  for (const [key, value] of Object.entries(options)) { const problem = requestTransportProblem(value, Array.isArray(options) ? `${path}[${key}]` : `${path}.${key}`); if (problem) return problem; }
  return null;
}
