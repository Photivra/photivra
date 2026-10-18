// SPDX-License-Identifier: Apache-2.0
/* global performance, console, process */
// Temporary CI timing for the internal scene evaluator pull request; removed before merge.
// Usage: node trim.mjs <dist/index.js> <label> <case: region|preview>
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
const e = await import(pathToFileURL(process.argv[2]).href);
const quality = { antiAliasing: { kind: "four-spot" }, pixelAperture: { kind: "box", samplesPerAxis: 2 } };
const opts = process.argv[4] === "region" ?
  { scene: { preset: "siemens-star" }, sensor: { pixelPitchMicrometers: 6, ...quality }, lens: { fNumber: 16, diffraction: "circular-aperture" },
    output: { width: 6000, height: 4000, maximumPixels: e.NATIVE_RAW_LIMITS.ceilingPixels, region: { x: 2904, y: 1936, width: 192, height: 128 }, demosaic: "ahd" } } :
  { scene: { preset: "siemens-star" }, lens: { prime: 50, fNumber: 16, diffraction: "circular-aperture" }, chartSize: { widthM: 0.42 }, subjectDistanceM: 3,
    sensor: { pixelPitchMicrometers: 375, ...quality }, output: { width: 96, height: 64, demosaic: "ahd" } };
const t0 = performance.now();
const r = await e.simulateCapture(opts);
console.log(JSON.stringify({ label: process.argv[3], case: process.argv[4], seconds: +((performance.now() - t0) / 1000).toFixed(2),
  rawS: +(r.diagnostics.timingsMs.raw / 1000).toFixed(2), diffractionS: +(r.diagnostics.timingsMs.diffraction / 1000).toFixed(2), sha: createHash("sha256").update(r.image.samples).digest("hex").slice(0, 16) }));
