// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from "node:fs";
import { cpus, platform, arch } from "node:os";
import process from "node:process";
import { URL } from "node:url";
import { ENGINE_API_VERSION, POC_SIMULATION_API_VERSION, simulatePocCamera } from "../dist/index.js";

const commit = process.argv.find((v) => v.startsWith("--commit="))?.slice(9);
const buildMethod = process.argv.find((v) => v.startsWith("--build-method="))?.slice(15);
if (!commit || !/^[a-f0-9]{40}$/.test(commit) || !["tsc", "node-type-strip"].includes(buildMethod)) {
  throw new Error("Declare --commit=<40-hex-source-sha> --build-method=tsc|node-type-strip. Context is operator-attested, not verified by this script.");
}
const f = JSON.parse(readFileSync(new URL("../test/fixtures/basic-reference-scene.json", import.meta.url), "utf8"));
const base = { sensor: { ...f.sensor.imagingArea, ...f.sensor.nativeRaster },
  lens: { focalLengthMm: f.lens.focalLengthMm, aperture: f.lens.aperture }, exposure: f.exposure,
  focus: { focusDistanceM: f.focus.distanceM, circleOfConfusionMm: f.focus.circleOfConfusionMm }, crop: { factor: 1 },
  diffraction: { wavelengthNm: f.illumination.wavelengthNm }, motion: { positionM: f.target.centerM, velocityMps: f.target.velocityMps },
  subject: { widthM: f.target.widthM, heightM: f.target.heightM, distanceM: f.target.distanceM } };
const heavy = { ...base, defocusSamples: Array.from({ length: 16 }, (_, i) => ({ id: `depth-${i}`, distanceM: 2+i })) };
const mixed = { ...heavy,
  samplingSamples: Array.from({ length: 16 }, (_, i) => ({ id: `size-${i}`, widthM: 1, heightM: 1, distanceM: 2+i })),
  motionSamples: Array.from({ length: 16 }, (_, i) => ({ id: `motion-${i}`, positionM: { x: .1, y: .2, z: 2+i }, velocityMps: { x: 1, y: .2, z: 0 } })) };
const staged = { ...mixed, capture: { orientation: "portrait-clockwise", activeCaptureRect: { x: 50, y: 50, width: 500, height: 300 },
  outputCropRect: { x: 20, y: 30, width: 250, height: 450 }, outputRaster: { pixelWidth: 250, pixelHeight: 450 } } };
const scenarios = [{ name: "base", input: base }, { name: "defocus-16", input: heavy },
  { name: "mixed-16-per-kind", input: mixed }, { name: "staged-portrait-mixed", input: staged }];
const repeats = 9, iterations = 100;
let sink = 0;
function run(input) {
  for (let i = 0; i < iterations; i++) sink += simulatePocCamera(input).projection.imageDistanceMm;
}
for (const scenario of scenarios) { run(scenario.input); run(scenario.input); }
const measurements = scenarios.map(() => []);
// Rotate scenario order to reduce consistent ordering bias; GC outside timed blocks.
for (let repeat = 0; repeat < repeats; repeat++) for (let offset = 0; offset < scenarios.length; offset++) {
  const index = (offset+repeat)%scenarios.length;
  globalThis.gc?.(); const before = process.memoryUsage().heapUsed;
  const start = process.hrtime.bigint(); run(scenarios[index].input);
  const durationMs = Number(process.hrtime.bigint()-start)/1e6;
  globalThis.gc?.();
  measurements[index].push({ durationMs, retainedHeapDeltaBytes: process.memoryUsage().heapUsed-before });
}
const results = scenarios.map((s, i) => {
  const sorted = measurements[i].map((v) => v.durationMs).sort((a, b) => a-b);
  return { scenario: s.name, requestsPerRepeat: iterations, repeats, warmupRequests: 2*iterations,
    minimumMs: sorted[0], medianMs: sorted[4], maximumMs: sorted[8], medianMicrosecondsPerRequest: sorted[4]*1000/iterations,
    measurements: measurements[i] };
});
process.stdout.write(JSON.stringify({ benchmark: "composed-poc-baseline", benchmarkVersion: 1, sourceCommit: commit,
  buildMethod, engineApiVersion: ENGINE_API_VERSION, pocApiVersion: POC_SIMULATION_API_VERSION,
  fixtureId: f.fixtureId, nodeVersion: process.version, v8Version: process.versions.v8, platform: platform(), arch: arch(),
  cpuModel: cpus()[0]?.model ?? "unknown", logicalCpuCount: cpus().length, forcedGc: typeof globalThis.gc === "function",
  measurementPolicy: "informational-only-no-ci-threshold", results, sink,
  limitations: ["Shared execution environment; not a consumer-device or browser frame-time result",
    "Net post-GC retained heap is not allocation count or GC pause measurement",
    "No prepared/projection-reuse candidate compared; this is baseline only",
    "No capture/output draft or complete production renderer measured"] }, null, 2)+"\n");
