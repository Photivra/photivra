// SPDX-License-Identifier: Apache-2.0
/* global performance, console, process */
// Temporary CI timing for the diffraction kernel reuse pull request; removed before merge.
// Usage: node kernels.mjs <dist/index.js> <label>
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
const e = await import(pathToFileURL(process.argv[2]).href);
for (const [name, widthMm] of [["full frame", 36], ["medium format", 43.8]]) for (const [w, h, box] of [[48, 32, false], [96, 64, true]]) {
  const opts = { scene: { preset: "siemens-star" }, lens: { prime: 50, fNumber: 16, diffraction: "circular-aperture" }, chartSize: { widthM: 0.42 }, subjectDistanceM: 3,
    sensor: { pixelPitchMicrometers: widthMm * 1000 / w, antiAliasing: { kind: "four-spot" }, ...(box ? { pixelAperture: { kind: "box", samplesPerAxis: 2 } } : {}) },
    output: { width: w, height: h, demosaic: "ahd" } };
  const t0 = performance.now();
  const r = await e.simulateCapture(opts);
  const first = performance.now() - t0, t1 = performance.now();
  const again = await e.simulateCapture({ ...opts, exposure: { mode: "manual", iso: 200, shutterSeconds: 1 / 250 } });
  const repeat = performance.now() - t1;
  console.log(JSON.stringify({ label: process.argv[3], name, w, h, box, pitch: +(widthMm * 1000 / w).toFixed(2),
    firstS: +(first / 1000).toFixed(2), firstOutsideRawS: +((first - r.diagnostics.timingsMs.raw) / 1000).toFixed(2),
    repeatS: +(repeat / 1000).toFixed(2), repeatOutsideRawS: +((repeat - again.diagnostics.timingsMs.raw) / 1000).toFixed(2), sha: createHash("sha256").update(r.image.samples).digest("hex").slice(0, 16) }));
}
