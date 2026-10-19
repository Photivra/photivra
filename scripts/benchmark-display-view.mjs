// SPDX-License-Identifier: Apache-2.0

/**
 * Repository-only cost comparison of `simulateDisplayView` with the 2.5 whole-frame view (a `simulateCapture` at pitch =
 * sensor width ÷ view width) for the same scene, lens, exposure and options (docs/DISPLAY_VIEW.md, "Cost"). One fresh
 * Node process per row, a 16 × 16 warm-up capture, then REPEATS timed runs of each (median). Informational only:
 * host-dependent, no CI threshold. Environment: REPEATS (default 1), ROWS (comma-separated subset of row ids).
 *
 *   node scripts/benchmark-display-view.mjs
 */
import "./require-fresh-dist.mjs";
import console from "node:console";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
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

const one = process.argv.indexOf("--row");
if (one >= 0) console.log(JSON.stringify(await measure(rows[Number(process.argv[one + 1])])));
else {
  const selected = process.env.ROWS ? process.env.ROWS.split(",").map(Number) : rows.map((r) => r.id);
  console.log("| Chart | Sensor | Options | View | Display view | Whole-frame view (2.5) | Ratio |");
  console.log("| --- | --- | --- | --- | --- | --- | --- |");
  for (const id of selected) {
    const run = spawnSync(process.execPath, ["--max-old-space-size=6000", process.argv[1], "--row", String(id)], { encoding: "utf8" });
    if (run.status !== 0) { console.log(`| row ${id} failed: ${run.stderr.split("\n")[0]} |`); continue; }
    const r = JSON.parse(run.stdout.trim().split("\n").pop());
    console.log(`| ${r.preset} | ${r.sensor} | ${r.options} | ${r.width} × ${r.height} | ${r.viewSeconds.toFixed(1)} s | ${r.wholeFrameSeconds.toFixed(1)} s | ${(r.viewSeconds / r.wholeFrameSeconds).toFixed(2)}× |`);
  }
}
