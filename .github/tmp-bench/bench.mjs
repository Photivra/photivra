// SPDX-License-Identifier: Apache-2.0
/* global performance, console, process */
// Temporary CI timing for the region-limited diffraction pull request; removed before merge.
// Usage: node bench.mjs <dist/index.js> <label>
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
const e = await import(pathToFileURL(process.argv[2]).href);
const mode = process.env.MODE, box = process.env.BOX;
const region = { x: 2904, y: 1936, width: 192, height: 128 };
const quality = mode !== "speed";
const opts = { scene: { preset: "siemens-star" },
  sensor: { pixelPitchMicrometers: 6, ...(quality ? { antiAliasing: { kind: "four-spot" } } : {}), ...(box === "2" ? { pixelAperture: { kind: "box", samplesPerAxis: 2 } } : box === "4" ? { pixelAperture: "box" } : {}) },
  lens: { fNumber: 16, ...(quality ? { diffraction: "circular-aperture" } : {}) },
  output: { width: 6000, height: 4000, maximumPixels: e.NATIVE_RAW_LIMITS.ceilingPixels, region, ...(quality ? { demosaic: "ahd" } : {}) } };
const t0 = performance.now();
const r = await e.simulateCapture(opts);
const seconds = (performance.now() - t0) / 1000;
console.log(JSON.stringify({ label: process.argv[3], mode, box: box ?? "0", seconds: +seconds.toFixed(2), diffractionS: +((r.diagnostics.timingsMs.diffraction ?? 0) / 1000).toFixed(2),
  rssMB: Math.round(process.memoryUsage().rss / 1e6), sha: createHash("sha256").update(r.image.samples).digest("hex").slice(0, 16) }));
