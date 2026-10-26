// SPDX-License-Identifier: Apache-2.0

/**
 * Repository-only display-view cost measurements (docs/DISPLAY_VIEW.md, "Cost"). Informational only: host-dependent,
 * no CI threshold.
 *
 * Whole-view rows (the 2.6.0 table): `simulateDisplayView` of a whole view against the 2.5 whole-frame view, a
 * `simulateCapture` at pitch = sensor width ÷ view width, which no caller renders any more and is kept as a historical
 * baseline. One fresh Node process per row, a 16 × 16 warm-up capture, then REPEATS timed runs of each (median).
 * Environment: REPEATS (default 1), ROWS (comma-separated subset of row ids).
 *
 *   node scripts/benchmark-display-view.mjs
 *
 * App-request rows (`--app`, #454): the request shape of an interactive viewer that renders a device-pixel view of a
 * 24 MP frame in parts. A 6 µm 6000 × 4000 sensor with the 2 × 2 box pixel aperture, a caller material scene (a composite
 * chart with a stand-in printed label), a 2028 × 1352 view prepared once with `prepareDisplayView` and rendered in
 * 96 × 96 parts, centre first; every k-th part of that order is timed (PARTS of them). At 2028 wide a display pixel covers
 * about 2.96 × 2.96 real pixels, so every part takes the exact area mean. One fresh Node process per row, build and
 * repeat; with a second build (DIST_B) the two run interleaved, the order alternating per repeat (A B, B A, ...).
 * Environment: REPEATS (default 2), PARTS (default 30), ROWS (subset of app row ids), DIST_B (path to another build's
 * `dist/index.js`; default: this checkout's `dist`).
 *
 *   node scripts/benchmark-display-view.mjs --app
 *   DIST_B=/path/to/other/dist/index.js node scripts/benchmark-display-view.mjs --app
 */
import "./require-fresh-dist.mjs";
import console from "node:console";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { loadavg } from "node:os";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL, URL } from "node:url";
import { NATIVE_RAW_LIMITS, simulateCapture, simulateDisplayView } from "../dist/index.js";

const SENSORS = { ff: { width: 6000, height: 4000, pitch: 6 }, phone: { width: 4000, height: 3000, pitch: 1.4 }, mf: { width: 11648, height: 8736, pitch: 3.76 } };
const rows = [];
for (const preset of ["siemens-star", "dead-leaves"]) for (const sensor of ["ff", "phone", "mf"]) for (const options of ["speed", "quality"]) for (const width of [96, 192, 384, 800]) {
  if (preset === "dead-leaves" && width !== 384) continue;
  rows.push({ id: rows.length, preset, sensor, options, width });
}
const repeats = Number(process.env.REPEATS ?? 1);
const median = (values) => { const s = [...values].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

async function measure(row) {
  const s = SENSORS[row.sensor], quality = row.options === "quality", height = Math.round(row.width * s.height / s.width);
  const lens = { prime: 50, fNumber: 8, ...(quality ? { diffraction: "circular-aperture" } : {}) }, aa = quality ? { antiAliasing: { kind: "four-spot" } } : {};
  const demosaic = quality ? { demosaic: "ahd" } : {}, scene = { preset: row.preset };
  await simulateCapture({ scene, output: { width: 16, height: 16 } });
  const viewTimes = [], wholeTimes = [];
  let samples = 0;
  for (let r = 0; r < repeats; r++) {
    let t = performance.now();
    const view = await simulateDisplayView({ scene, lens, sensor: { pixelPitchMicrometers: s.pitch, ...aa }, output: { width: s.width, height: s.height, maximumPixels: NATIVE_RAW_LIMITS.ceilingPixels, ...demosaic } },
      { width: row.width, height });
    viewTimes.push(performance.now() - t); samples = view.diagnostics.sampleCount;
    t = performance.now();
    await simulateCapture({ scene, lens, sensor: { pixelPitchMicrometers: s.width * s.pitch / row.width, ...aa }, output: { width: row.width, height, ...demosaic } });
    wholeTimes.push(performance.now() - t);
  }
  return { ...row, height, viewSeconds: median(viewTimes) / 1000, wholeFrameSeconds: median(wholeTimes) / 1000, samples };
}

// ---- App-request rows (#454) ----

export const APP_VIEW = { width: 2028, height: 1352 };
export const APP_PART_SIDE = 96;
export const APP_ROWS = [];
for (const options of ["speed", "quality"]) for (const fNumber of [8, 11]) APP_ROWS.push({ id: APP_ROWS.length, options, fNumber });

/**
 * The composite chart of the app-request rows: an engine-authored layout of the engine's presets (not any caller's
 * chart), so the materials path, the chart's element lookups and a realistic share of edges are exercised.
 */
const APP_CHART = { preset: "composite", background: { preset: "line-grid", spacing: 1 / 6, lineWidth: 0.004, lineReflectance: 0.42, backgroundReflectance: 0.6 },
  elements: [
    { scene: { preset: "siemens-star", profile: "sine", cycles: 64, darkReflectance: 0.08, lightReflectance: 0.72, backgroundReflectance: 0.18 }, centerU: 0, centerV: 0, width: 0.64, height: 0.64, mask: "ellipse" },
    { scene: { preset: "dead-leaves", seed: 454, minimumReflectance: 0.2, maximumReflectance: 0.6 }, centerU: -0.76, centerV: -0.13, width: 0.32, height: 0.32 },
    { scene: { preset: "zone-plate", darkReflectance: 0.1, lightReflectance: 0.7, backgroundReflectance: 0.18 }, centerU: 0.76, centerV: -0.1, width: 0.32, height: 0.32, mask: "ellipse" },
    { scene: { preset: "step-wedge", steps: 12, minimumReflectance: 0.03, maximumReflectance: 0.9 }, centerU: 0.04, centerV: -0.57, width: 0.96, height: 0.12 },
    ...[[-0.43, 0.19], [0.43, 0.19], [-0.78, 0.27], [0.78, 0.27]].map(([centerU, centerV]) => ({ scene: { preset: "slanted-squares", columns: 1, rows: 1, sizeFraction: 0.5, angleDegrees: 5, darkReflectance: 0.15, lightReflectance: 0.6 }, centerU, centerV, width: 0.26, height: 0.26 })),
    { scene: { preset: "bar-groups", lineWidthsPerPictureHeight: [400, 800, 1200, 1600] }, centerU: 0.04, centerV: 0.5, width: 0.6, height: 0.14 }
  ] };

/**
 * A stand-in for a printed label: a rectangle near the bottom-left corner with a background and rows of ink bars. It
 * costs a few comparisons per lookup, so it under-reports a caller label tested by polygon winding (in one caller's
 * profile its label test was about 3 % of self time; docs/DISPLAY_VIEW.md, "Cost").
 */
function labelInk(u, v) {
  const minU = -0.95, maxU = -0.45, minV = -0.64, maxV = -0.56;
  if (u < minU || u > maxU || v < minV || v > maxV) return -1;
  const x = (u - minU) / (maxU - minU), y = (v - minV) / (maxV - minV);
  const row = Math.floor(y * 3), inRow = y * 3 - row;
  return inRow > 0.2 && inRow < 0.8 && Math.floor(x * 40 + row) % 3 !== 0 ? 1 : 0;
}

/** The app-request options for a row (`engine` is the build's module). */
export function appRequestOptions(engine, row) {
  const aspect = APP_VIEW.height / APP_VIEW.width, chart = engine.resolveChartScene({ scene: APP_CHART, aspect });
  const materials = chart.materials.map((m) => m.reflectance), background = materials.length, ink = materials.length + 1;
  const scene = { kind: "material-function", sceneId: "benchmark:app-request", materials: [...materials, 0.85, 0.06],
    materialAt: (p) => { const u = p.chartU ?? p.u, v = p.chartV ?? p.v, label = labelInk(u, v); return label < 0 ? chart.materialAt(u, v) : label === 1 ? ink : background; } };
  const quality = row.options === "quality";
  return { scene, chartSize: { widthM: 0.42, heightM: 0.28 }, subjectDistanceM: 0.63,
    lens: { prime: 50, fNumber: row.fNumber, ...(quality ? { diffraction: "circular-aperture" } : {}) },
    exposure: { mode: "manual", iso: 100, shutterSeconds: (1 / 125) * (row.fNumber / 11) ** 2 },
    sensor: { pixelPitchMicrometers: 6, pixelAperture: { kind: "box", samplesPerAxis: 2 }, ...(quality ? { antiAliasing: { kind: "four-spot" } } : {}) },
    output: { width: 6000, height: 4000, format: "srgb-8", maximumPixels: NATIVE_RAW_LIMITS.ceilingPixels, ...(quality ? { demosaic: "ahd" } : {}) } };
}

/** The parts of the view, about `side` square, centre first (ties by grid index). */
export function appParts(width, height, side) {
  const columns = Math.max(1, Math.round(width / side)), rows = Math.max(1, Math.round(height / side)), edge = (i, n, len) => Math.round((i * len) / n), parts = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
    const x = edge(c, columns, width), y = edge(r, rows, height);
    parts.push({ index: r * columns + c, x, y, width: edge(c + 1, columns, width) - x, height: edge(r + 1, rows, height) - y });
  }
  const distance = (t) => Math.hypot(t.x + t.width / 2 - width / 2, t.y + t.height / 2 - height / 2);
  return parts.sort((a, b) => distance(a) - distance(b) || a.index - b.index);
}

/** Every k-th part of the centre-first order, `count` of them (all when count ≥ the part count). */
export const sampledParts = (parts, count) => { const k = Math.max(1, Math.floor(parts.length / count)), out = []; for (let i = 0; i < parts.length && out.length < count; i += k) out.push(parts[i]); return out; };

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
const commit = () => { const r = spawnSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8", cwd: fileURLToPath(new URL("..", import.meta.url)) }); return r.status === 0 ? r.stdout.trim() : "unknown"; };

async function appRow(id, distPath, count) {
  const engine = await import(pathToFileURL(distPath).href), row = APP_ROWS[id], load = loadavg()[0];
  const options = appRequestOptions(engine, row), parts = appParts(APP_VIEW.width, APP_VIEW.height, APP_PART_SIDE), timed = sampledParts(parts, count);
  let t = performance.now();
  const view = await engine.prepareDisplayView(options);
  const prepareMs = performance.now() - t, ms = [], usPerPixel = [], estimation = new Set();
  let ahdCorrected = 0;
  for (const region of timed) {
    t = performance.now();
    const result = await view.render({ ...APP_VIEW, region: { x: region.x, y: region.y, width: region.width, height: region.height } });
    const elapsed = performance.now() - t;
    ms.push(elapsed); usPerPixel.push(1000 * elapsed / (region.width * region.height));
    ahdCorrected = Math.max(ahdCorrected, result.diagnostics.ahdCorrectedPixelCount);
    estimation.add(result.assumptions.find((a) => a.id === "view.estimation")?.value?.method ?? "unknown");
  }
  const sortedMs = [...ms].sort((a, b) => a - b), sortedUs = [...usPerPixel].sort((a, b) => a - b), mean = ms.reduce((a, b) => a + b, 0) / ms.length;
  return { ...row, dist: distPath, prepareMs, parts: ms.length, of: parts.length, firstMs: ms[0], medianMs: quantile(sortedMs, 0.5), maxMs: sortedMs.at(-1),
    usPerPixel: { min: sortedUs[0], median: quantile(sortedUs, 0.5), max: sortedUs.at(-1) }, wholeViewCpuSecondsExtrapolated: mean * parts.length / 1000,
    estimation: [...estimation], ahdCorrectedPixelCount: ahdCorrected, loadAverage: load, node: process.version, commit: commit() };
}

async function appRequest() {
  const argv = process.argv, count = Number(process.env.PARTS ?? 30);
  const child = argv.indexOf("--app-row");
  if (child >= 0) { console.log(JSON.stringify(await appRow(Number(argv[child + 1]), argv[argv.indexOf("--dist") + 1], count))); return; }
  const a = fileURLToPath(new URL("../dist/index.js", import.meta.url)), b = process.env.DIST_B, builds = b ? [["A", a], ["B", b]] : [["A", a]];
  const repeats = Number(process.env.REPEATS ?? 2), selected = process.env.ROWS ? process.env.ROWS.split(",").map(Number) : APP_ROWS.map((r) => r.id), results = [];
  console.error(`app-request rows: ${selected.length} × ${builds.length} build(s) × ${repeats} repeat(s), ${count} parts each; A = ${a}${b ? `, B = ${b}` : ""}`);
  for (const id of selected) for (let r = 0; r < repeats; r++) for (const [label, dist] of r % 2 === 0 ? builds : [...builds].reverse()) {
    const run = spawnSync(process.execPath, ["--max-old-space-size=6000", argv[1], "--app-row", String(id), "--dist", dist], { encoding: "utf8", env: { ...process.env, PARTS: String(count) } });
    if (run.status !== 0) { console.error(`app row ${id} (${label}) failed:\n${run.stderr}`); continue; }
    const result = { build: label, repeat: r, ...JSON.parse(run.stdout.trim().split("\n").pop()) };
    results.push(result); console.log(JSON.stringify(result));
  }
  if (!results.length) { process.exitCode = 1; return; }
  const range = (values, digits = 0) => { const lo = Math.min(...values), hi = Math.max(...values); return lo.toFixed(digits) === hi.toFixed(digits) ? lo.toFixed(digits) : `${lo.toFixed(digits)}–${hi.toFixed(digits)}`; };
  console.log("");
  console.log("| Options | f | Build | Prepare | Part median | Part max | µs per display pixel, median (min–max) | Whole view CPU, extrapolated | Estimation | AHD-corrected pixels |");
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const id of selected) for (const [label] of builds) {
    const rs = results.filter((r) => r.id === id && r.build === label);
    if (!rs.length) continue;
    const row = APP_ROWS[id];
    console.log(`| ${row.options === "speed" ? "Speed" : "Quality"} | f/${row.fNumber} | ${label} | ${range(rs.map((r) => r.prepareMs))} ms | ${range(rs.map((r) => r.medianMs))} ms | ${range(rs.map((r) => r.maxMs))} ms | ` +
      `${range(rs.map((r) => r.usPerPixel.median), 1)} (${Math.min(...rs.map((r) => r.usPerPixel.min)).toFixed(1)}–${Math.max(...rs.map((r) => r.usPerPixel.max)).toFixed(1)}) | ${range(rs.map((r) => r.wholeViewCpuSecondsExtrapolated), 1)} s from ${rs[0].parts} of ${rs[0].of} parts | ` +
      `${[...new Set(rs.flatMap((r) => r.estimation))].join(", ")} | ${Math.max(...rs.map((r) => r.ahdCorrectedPixelCount))} |`);
  }
  console.log("");
  console.log(`Node ${process.version}, commit ${results[0]?.commit ?? "unknown"}, load average ${range(results.map((r) => r.loadAverage), 1)}, ${repeats} repeat(s) per build; whole-view CPU is extrapolated from the sampled parts, not measured.`);
}

const one = process.argv.indexOf("--row");
if (process.argv.includes("--app") || process.argv.includes("--app-row")) await appRequest();
else if (one >= 0) console.log(JSON.stringify(await measure(rows[Number(process.argv[one + 1])])));
else {
  const selected = process.env.ROWS ? process.env.ROWS.split(",").map(Number) : rows.map((r) => r.id);
  console.log("| Chart | Sensor | Options | View | Display view | Whole-frame view (2.5, historical baseline) | Ratio |");
  console.log("| --- | --- | --- | --- | --- | --- | --- |");
  for (const id of selected) {
    const run = spawnSync(process.execPath, ["--max-old-space-size=6000", process.argv[1], "--row", String(id)], { encoding: "utf8" });
    if (run.status !== 0) { console.log(`| row ${id} failed: ${run.stderr.split("\n")[0]} |`); continue; }
    const r = JSON.parse(run.stdout.trim().split("\n").pop());
    console.log(`| ${r.preset} | ${r.sensor} | ${r.options} | ${r.width} × ${r.height} | ${r.viewSeconds.toFixed(1)} s | ${r.wholeFrameSeconds.toFixed(1)} s | ${(r.viewSeconds / r.wholeFrameSeconds).toFixed(2)}× |`);
  }
}
