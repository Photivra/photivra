// SPDX-License-Identifier: Apache-2.0

/**
 * Repository-only validation of `simulateDisplayView` against its definition (docs/DISPLAY_VIEW.md, "Validation"):
 * for each case, a block of the real full-resolution capture is rendered with `output.region` (byte-identical to the
 * whole render) as 16-bit sRGB, decoded and area-averaged in linear light, and compared with the display view's same
 * block (`view.region`, 16-bit). Prints one JSON line per case; `--report` prints the Markdown tables from such lines.
 *
 *   node scripts/validate-display-view.mjs [--workers 4] [--set A] [--out results.jsonl]
 *   node scripts/validate-display-view.mjs --report results.jsonl
 *
 * Informational only: no CI gate. A full run (155 cases, the largest references are about a million real sites)
 * took about two hours on 4 cores.
 */
import "./require-fresh-dist.mjs";
import console from "node:console";
import process from "node:process";
import { performance } from "node:perf_hooks";
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { NATIVE_RAW_LIMITS, simulateCapture, simulateIdealReference } from "../dist/index.js";
import { simulateDisplayViewWithInternals } from "../dist/facade/simulate-capture.js";

const SENSORS = {
  ff: { label: "full frame 24 MP, 6 µm", width: 6000, height: 4000, pitch: 6 },
  phone: { label: "phone 12 MP, 1.4 µm", width: 4000, height: 3000, pitch: 1.4 },
  mf: { label: "medium format 100 MP, 3.76 µm", width: 11648, height: 8736, pitch: 3.76 }
};
const OPTIONS = { speed: {}, quality: { diffraction: true, demosaic: "ahd", antiAliasing: true } };
const decode = (code, maximum) => { const e = code / maximum; return e <= 0.04045 ? e / 12.92 : ((e + 0.055) / 1.055) ** 2.4; };
const code8 = (l) => { const v = Math.min(1, Math.max(0, l)); return 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055); };
const channel = (a, k) => { const out = []; for (let i = k; i < a.length; i += 3) out.push(a[i]); return out; };
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const std = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
const shutter = (f, iso) => (1 / 125) * (f / 8) ** 2 * (100 / iso);
const viewHeight = (sensor, vw) => Math.round(vw * SENSORS[sensor].height / SENSORS[sensor].width);

function captureOptions(c) {
  const s = SENSORS[c.sensor], q = OPTIONS[c.options];
  return { scene: c.scene, lens: { prime: 50, fNumber: c.fNumber, ...(q.diffraction ? { diffraction: "circular-aperture" } : {}) },
    exposure: { mode: "manual", iso: c.iso, shutterSeconds: shutter(c.fNumber, c.iso) }, subjectDistanceM: 5,
    sensor: { pixelPitchMicrometers: s.pitch, ...(q.antiAliasing ? { antiAliasing: { kind: "four-spot" } } : {}) },
    output: { width: s.width, height: s.height, maximumPixels: NATIVE_RAW_LIMITS.ceilingPixels, ...(q.demosaic ? { demosaic: q.demosaic } : {}) } };
}

/** Luma SSIM over 7 × 7 uniform windows (Wang et al. 2004; K1 = 0.01, K2 = 0.03, L = 255). */
function ssim(a8, b8, w, h) {
  const luma = (img) => Float64Array.from({ length: w * h }, (_, i) => 0.2126 * img[3 * i] + 0.7152 * img[3 * i + 1] + 0.0722 * img[3 * i + 2]);
  const A = luma(a8), B = luma(b8), C1 = (0.01 * 255) ** 2, C2 = (0.03 * 255) ** 2, r = 3;
  let sum = 0, count = 0;
  for (let y = r; y < h - r; y++) for (let x = r; x < w - r; x++) {
    let ma = 0, mb = 0;
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { ma += A[(y + j) * w + x + i]; mb += B[(y + j) * w + x + i]; }
    ma /= 49; mb /= 49;
    let va = 0, vb = 0, cab = 0;
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { const da = A[(y + j) * w + x + i] - ma, db = B[(y + j) * w + x + i] - mb; va += da * da; vb += db * db; cab += da * db; }
    va /= 48; vb /= 48; cab /= 48;
    sum += ((2 * ma * mb + C1) * (2 * cab + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2)); count++;
  }
  return count ? sum / count : NaN;
}
const falseColour = (img8, n) => { let s = 0; for (let i = 0; i < n; i++) s += Math.abs(img8[3 * i] - img8[3 * i + 1]) + Math.abs(img8[3 * i + 2] - img8[3 * i + 1]); return s / n; };
/** Slanted-edge MTF50 in cycles per display pixel (Burns 2000): edge centroids, a fitted line, a 4× ESF, Hamming window. */
function mtf50(lin, w, h) {
  const Y = Float64Array.from({ length: w * h }, (_, i) => 0.2126 * lin[3 * i] + 0.7152 * lin[3 * i + 1] + 0.0722 * lin[3 * i + 2]);
  const xs = [], ys = [];
  for (let y = 0; y < h; y++) {
    let num = 0, den = 0;
    for (let x = 1; x < w - 1; x++) { const d = Math.abs(Y[y * w + x + 1] - Y[y * w + x - 1]); num += d * x; den += d; }
    if (den > 0) { xs.push(num / den); ys.push(y); }
  }
  const my = mean(ys), mx = mean(xs);
  let sxy = 0, syy = 0;
  for (let i = 0; i < xs.length; i++) { sxy += (ys[i] - my) * (xs[i] - mx); syy += (ys[i] - my) ** 2; }
  const slope = sxy / syy, cos = 1 / Math.sqrt(1 + slope * slope), bins = new Map();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const b = Math.round((x - (mx + slope * (y - my))) * cos * 4), e = bins.get(b) ?? [0, 0];
    e[0] += Y[y * w + x]; e[1]++; bins.set(b, e);
  }
  const keys = [...bins.keys()].sort((a, b) => a - b), lo = Math.max(keys[0], -4 * Math.floor(w / 2) + 4), hi = Math.min(keys[keys.length - 1], 4 * Math.floor(w / 2) - 4);
  const esf = [];
  for (let b = lo; b <= hi; b++) { const e = bins.get(b); esf.push(e ? e[0] / e[1] : NaN); }
  for (let i = 0; i < esf.length; i++) if (Number.isNaN(esf[i])) esf[i] = i > 0 ? esf[i - 1] : esf.find((v) => !Number.isNaN(v));
  const lsf = esf.map((_, i) => (i === 0 || i === esf.length - 1 ? 0 : (esf[i + 1] - esf[i - 1]) / 2));
  const N = lsf.length, c = lsf.reduce((a, v, i) => a + v * i, 0) / lsf.reduce((a, v) => a + v, 0);
  const win = lsf.map((v, i) => v * (0.54 + 0.46 * Math.cos(Math.PI * (i - c) / (N / 2))));
  const mtf = [];
  for (let k = 0; k < N / 2; k++) { let re = 0, im = 0; for (let i = 0; i < N; i++) { re += win[i] * Math.cos(2 * Math.PI * k * i / N); im -= win[i] * Math.sin(2 * Math.PI * k * i / N); } mtf.push(Math.hypot(re, im)); }
  for (let k = 1; k < mtf.length; k++) { const a = mtf[k - 1] / mtf[0], b = mtf[k] / mtf[0]; if (b <= 0.5) return (k - 1 + (a - 0.5) / (a - b)) * 4 / N; }
  return NaN;
}

/** One case: the display view's block, the reference block, and the metrics. */
async function runCase(c) {
  const s = SENSORS[c.sensor], opts = captureOptions(c), vw = c.viewWidth, vh = viewHeight(c.sensor, vw), sx = s.width / vw, sy = s.height / vh, b = c.block;
  const t0 = performance.now();
  const { result, internals } = await simulateDisplayViewWithInternals(opts, { width: vw, height: vh, region: b, format: "srgb-16" });
  const tView = performance.now() - t0;
  const rx0 = Math.floor(b.x * sx), ry0 = Math.floor(b.y * sy), rx1 = Math.min(s.width, Math.ceil((b.x + b.width) * sx)), ry1 = Math.min(s.height, Math.ceil((b.y + b.height) * sy));
  const t1 = performance.now();
  const ref = await simulateCapture({ ...opts, output: { ...opts.output, format: "srgb-16", region: { x: rx0, y: ry0, width: rx1 - rx0, height: ry1 - ry0 } } });
  const tRef = performance.now() - t1, rw = rx1 - rx0, n = b.width * b.height, refLin = new Float64Array(n * 3), viewLin = new Float64Array(n * 3);
  for (let j = 0; j < b.height; j++) for (let i = 0; i < b.width; i++) {
    const X0 = (b.x + i) * sx, X1 = (b.x + i + 1) * sx, Y0 = (b.y + j) * sy, Y1 = (b.y + j + 1) * sy, o = (j * b.width + i) * 3;
    for (let y = Math.floor(Y0); y < Math.ceil(Y1); y++) {
      const wy = Math.min(Y1, y + 1) - Math.max(Y0, y);
      for (let x = Math.floor(X0); x < Math.ceil(X1); x++) {
        const w = wy * (Math.min(X1, x + 1) - Math.max(X0, x)) / (sx * sy), p = ((y - ry0) * rw + (x - rx0)) * 3;
        for (let k = 0; k < 3; k++) refLin[o + k] += w * decode(ref.image.samples[p + k], 65535);
      }
    }
    for (let k = 0; k < 3; k++) viewLin[o + k] = decode(result.image.samples[o + k], 65535);
  }
  const to8 = (lin) => Float64Array.from(lin, code8), ref8 = to8(refLin), view8 = to8(viewLin), exp8 = to8(internals.expected);
  const out = { id: c.id, set: c.set, sensor: c.sensor, options: c.options, preset: c.scene.preset, reflectance: c.scene.reflectance, fNumber: c.fNumber, iso: c.iso, viewWidth: vw,
    block: b, s: sx, tView, tRef, refSites: (rx1 - rx0) * (ry1 - ry0), viewSamples: result.diagnostics.sampleCount };
  const mlin = (a, k) => mean(channel(a, k));
  out.meanErrLin8 = [0, 1, 2].map((k) => code8(mlin(viewLin, k)) - code8(mlin(refLin, k)));
  out.se8 = [0, 1, 2].map((k) => { const m = mlin(refLin, k), se = Math.sqrt((std(channel(refLin, k)) ** 2 + std(channel(viewLin, k)) ** 2) / n); return code8(m + se) - code8(m); });
  let sq = 0, mx = 0;
  for (let i = 0; i < 3 * n; i++) { const d = exp8[i] - ref8[i]; sq += d * d; mx = Math.max(mx, Math.abs(d)); }
  out.rmsExp8 = Math.sqrt(sq / (3 * n)); out.maxExp8 = mx;
  out.stdRefLin = [0, 1, 2].map((k) => std(channel(refLin, k))); out.stdViewLin = [0, 1, 2].map((k) => std(channel(viewLin, k)));
  out.predStdLin = [0, 1, 2].map((k) => Math.sqrt(mean(channel(internals.noiseStd, k).map((v) => v * v))));
  if (b.width >= 8 && b.height >= 8) out.ssim = ssim(view8, ref8, b.width, b.height);
  out.falseColourRef = falseColour(ref8, n); out.falseColourView = falseColour(view8, n);
  if (c.scene.preset === "slanted-edge" && b.width >= 24) { out.mtf50Ref = mtf50(refLin, b.width, b.height); out.mtf50View = mtf50(viewLin, b.width, b.height); }
  return out;
}

/** The most detailed block of a chart in the view (luma variance of the ideal reference at the view size). */
async function busiest(sensor, preset, vw, bw, bh) {
  const H = viewHeight(sensor, vw), s = SENSORS[sensor];
  const r = await simulateIdealReference({ scene: { preset }, sensor: { pixelPitchMicrometers: s.width * s.pitch / vw }, output: { width: vw, height: H, format: "srgb-8" } });
  let best = null, bestV = -1;
  for (let y = 0; y + bh <= H; y += Math.max(1, bh >> 2)) for (let x = 0; x + bw <= vw; x += Math.max(1, bw >> 2)) {
    let m = 0, m2 = 0;
    for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) { const v = r.image.samples[3 * ((y + j) * vw + x + i) + 1]; m += v; m2 += v * v; }
    const v = m2 / (bw * bh) - (m / (bw * bh)) ** 2;
    if (v > bestV) { bestV = v; best = { x, y, width: bw, height: bh }; }
  }
  return best;
}
async function cases() {
  const list = [], centre = (sensor, vw, bw, bh) => ({ x: Math.floor(vw / 2 - bw / 2), y: Math.floor(viewHeight(sensor, vw) / 2 - bh / 2), width: bw, height: bh });
  const add = async (set, sensor, options, preset, fNumber, iso, vw, bw, bh, where, scene) =>
    list.push({ id: list.length, set, sensor, options, scene: scene ?? { preset }, fNumber, iso, viewWidth: vw, block: where === "centre" ? centre(sensor, vw, bw, bh) : await busiest(sensor, preset, vw, bw, bh) });
  for (const sensor of ["ff", "phone", "mf"]) for (const options of ["speed", "quality"]) {
    const big = sensor === "mf" ? 24 : 32;
    await add("A", sensor, options, "slanted-edge", 8, 100, 384, big, big, "centre");
    await add("A", sensor, options, "siemens-star", 8, 100, 384, 16, 16, "centre");
    for (const preset of ["bar-groups", "dead-leaves", "step-wedge"]) await add("A", sensor, options, preset, 8, 100, 384, 16, 16, "busiest");
  }
  for (const sensor of ["ff", "phone"]) for (const options of ["speed", "quality"]) for (const f of [2.8, 16]) {
    await add("B", sensor, options, "slanted-edge", f, 100, 384, 32, 32, "centre");
    await add("B", sensor, options, "siemens-star", f, 100, 384, 16, 16, "centre");
  }
  for (const sensor of ["ff", "phone", "mf"]) for (const options of ["speed", "quality"]) {
    await add("C", sensor, options, "step-wedge", 8, 6400, 384, 16, 16, "busiest");
    await add("C", sensor, options, "dead-leaves", 8, 6400, 384, 16, 16, "busiest");
    await add("C", sensor, options, "slanted-edge", 8, 6400, 384, sensor === "mf" ? 24 : 32, sensor === "mf" ? 24 : 32, "centre");
  }
  for (const options of ["speed", "quality"]) {
    await add("C", "phone", options, "uniform", 8, 1600, 384, 16, 16, "centre", { preset: "uniform", reflectance: 0.18 });
    await add("C", "phone", options, "slanted-edge", 8, 1600, 384, 32, 32, "centre");
    await add("C", "phone", options, "dead-leaves", 8, 1600, 384, 16, 16, "busiest");
  }
  for (const sensor of ["ff", "phone", "mf"]) for (const options of ["speed", "quality"]) for (const vw of [96, 192, 800]) {
    if (sensor === "mf" && vw === 96 && options === "quality") continue;
    const edge = vw === 96 ? 8 : vw === 192 ? 24 : 32, star = vw === 96 ? 8 : 16;
    await add("D", sensor, options, "slanted-edge", 8, 100, vw, edge, edge, "centre");
    await add("D", sensor, options, "siemens-star", 8, 100, vw, star, star, "centre");
  }
  for (const sensor of ["ff", "phone", "mf"]) for (const options of ["speed", "quality"]) for (const vw of [96, 384, 800]) for (const [reflectance, iso] of [[0.18, 100], [0.18, 6400], [0.03, 6400]]) {
    if (sensor === "mf" && vw === 96 && options === "quality") continue;
    const b = vw === 96 ? 8 : 16;
    await add("E", sensor, options, "uniform", 8, iso, vw, b, b, "centre", { preset: "uniform", reflectance });
  }
  return list;
}

function report(path) {
  const rows = readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => !r.error).sort((a, b) => a.id - b.id);
  const f = (x, d = 2) => (x === undefined || Number.isNaN(x) ? "—" : x.toFixed(d));
  console.log("| Set | Sensor | Options | Chart | f | ISO | Width | s | Mean error R / G / B (± SE) | Expected RMS / max | Noise: drawn / predicted ÷ ref | SSIM | False colour ref → view | MTF50 ref → view | View s |");
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const r of rows) {
    const noise = r.preset === "uniform" ? r.stdViewLin.map((v, k) => f(v / r.stdRefLin[k])).join("/") + " · " + r.predStdLin.map((v, k) => f(v / r.stdRefLin[k])).join("/") : "—";
    console.log(`| ${r.set} | ${r.sensor} | ${r.options} | ${r.preset}${r.reflectance ? " " + r.reflectance : ""} | ${r.fNumber} | ${r.iso} | ${r.viewWidth} | ${f(r.s, 1)} | ` +
      `${r.meanErrLin8.map((x) => f(x)).join(" / ")} (± ${f(Math.max(...r.se8))}) | ${f(r.rmsExp8)} / ${f(r.maxExp8, 1)} | ${noise} | ${f(r.ssim, 4)} | ` +
      `${f(r.falseColourRef)} → ${f(r.falseColourView)} | ${f(r.mtf50Ref, 3)} → ${f(r.mtf50View, 3)} | ${f(r.tView / 1000, 1)} |`);
  }
}

const argv = process.argv.slice(2), arg = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : fallback; };
if (argv.includes("--report")) report(arg("--report"));
else if (argv.includes("--case")) {
  const c = JSON.parse(arg("--case"));
  try { console.log(JSON.stringify(await runCase(c))); } catch (error) { console.log(JSON.stringify({ id: c.id, error: String(error?.stack ?? error) })); }
} else {
  const out = arg("--out", "display-view-validation.jsonl"), workers = Number(arg("--workers", "4")), set = arg("--set");
  const done = new Set(existsSync(out) ? readFileSync(out, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => !r.error).map((r) => r.id) : []);
  const cost = (c) => { const s = SENSORS[c.sensor].width / c.viewWidth; return c.block.width * c.block.height * s * s * (c.options === "speed" ? 1 : 3.5); };
  const queue = (await cases()).filter((c) => (!set || c.set === set) && !done.has(c.id)).sort((a, b) => cost(b) - cost(a));
  const next = () => {
    const c = queue.shift();
    if (!c) return;
    const child = spawn(process.execPath, ["--max-old-space-size=6000", process.argv[1], "--case", JSON.stringify(c)], { stdio: ["ignore", "pipe", "inherit"] });
    let text = "";
    child.stdout.on("data", (d) => { text += d; });
    child.on("close", () => { appendFileSync(out, text); console.error("done", c.id, c.set, c.sensor, c.options, c.scene.preset, "left", queue.length); next(); });
  };
  for (let i = 0; i < workers; i++) next();
}
