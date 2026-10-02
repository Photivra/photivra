// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { cpus, platform, arch } from "node:os";
import { pathToFileURL, URL } from "node:url";
import process from "node:process";
import { resolve } from "node:path";
import { Session } from "node:inspector";
import { simulatePocCamera, ENGINE_API_VERSION, POC_SIMULATION_API_VERSION } from "../dist/index.js";

const argument = (name) => process.argv.find((v) => v.startsWith(`--${name}=`))?.slice(name.length+3);
const referenceRoot = argument("reference-root"), referenceCommit = argument("reference-commit");
if (!referenceRoot || !/^[a-f0-9]{40}$/.test(referenceCommit ?? "")) throw new Error("Provide --reference-root and exact --reference-commit; build both with tsc first.");
if (argument("candidate-commit") && !/^[a-f0-9]{40}$/.test(argument("candidate-commit"))) throw new Error("candidate-commit must be an exact SHA.");
const reference = await import(pathToFileURL(resolve(referenceRoot, "dist/index.js")));
if (reference.POC_SIMULATION_API_VERSION !== POC_SIMULATION_API_VERSION) throw new Error("POC versions differ.");
const equivalenceCorpus = JSON.parse(readFileSync(new URL("../test/fixtures/poc-projection-reuse-reference.json", import.meta.url), "utf8"));
const corpusHashes = equivalenceCorpus.cases.map(fixture => {
  const current = JSON.stringify(simulatePocCamera(fixture.input));
  if (current !== JSON.stringify(reference.simulatePocCamera(fixture.input))) throw new Error(`Independent whole-response mismatch: ${fixture.id}`);
  return createHash("sha256").update(current).digest("hex");
});
const candidateSources = ["src/optics/depth-of-field.ts", "src/simulation/poc-simulation.ts"].map((path) => ({ path,
  sha256: createHash("sha256").update(readFileSync(new URL(`../${path}`, import.meta.url))).digest("hex") }));
const base = { sensor: { widthMm: 36, heightMm: 24, pixelWidth: 6000, pixelHeight: 4000 },
  lens: { focalLengthMm: 50, aperture: 4 }, exposure: { shutterSeconds: .008, iso: 100 },
  focus: { focusDistanceM: 5, circleOfConfusionMm: .03 }, crop: { factor: 1 }, diffraction: { wavelengthNm: 550 },
  motion: { positionM: { x: .1, y: .2, z: 5 }, velocityMps: { x: 1, y: .2, z: 0 } },
  subject: { widthM: 2, heightM: 1.5, distanceM: 5 } };
const defocus = { ...base, defocusSamples: Array.from({ length: 16 }, (_, i) => ({ id: `depth-${i}`, distanceM: 2+i })) };
const mixed = { ...defocus,
  samplingSamples: Array.from({ length: 16 }, (_, i) => ({ id: `size-${i}`, widthM: 1, heightM: 1, distanceM: 2+i })),
  motionSamples: Array.from({ length: 16 }, (_, i) => ({ id: `motion-${i}`, positionM: { x: .1, y: .2, z: 2+i }, velocityMps: { x: 1, y: .2, z: 0 } })) };
const staged = { ...mixed, capture: { orientation: "portrait-clockwise", activeCaptureRect: { x: 500, y: 500, width: 5000, height: 3000 },
  outputCropRect: { x: 200, y: 300, width: 2500, height: 4500 }, outputRaster: { pixelWidth: 2500, pixelHeight: 4500 } } };
const scenarios = [{ name: "24mp-base", input: base },
  ...[1, 2, 4, 8].map((count) => ({ name: `24mp-defocus-${count}`, input: { ...base, defocusSamples: defocus.defocusSamples.slice(0, count) } })),
  { name: "24mp-defocus-16", input: defocus },
  { name: "24mp-mixed-16-per-kind", input: mixed }, { name: "24mp-staged-portrait-mixed", input: staged }];
const paths = [{ name: "reference", run: reference.simulatePocCamera }, { name: "candidate", run: simulatePocCamera }];
const iterations = 1000, repeats = 9, warmup = 500;
let sink = 0;
function run(path, input, count) { for (let i = 0; i < count; i++) sink += path.run(input).projection.imageDistanceMm; }
for (const scenario of scenarios) {
  if (JSON.stringify(paths[0].run(scenario.input)) !== JSON.stringify(paths[1].run(scenario.input))) throw new Error("Whole response/provenance differs.");
  for (const path of paths) run(path, scenario.input, warmup);
}
const measurements = scenarios.map(() => paths.map(() => []));
for (let repeat = 0; repeat < repeats; repeat++) for (let offset = 0; offset < scenarios.length; offset++) {
  const i = (repeat+offset)%scenarios.length;
  for (let order = 0; order < paths.length; order++) {
    const p = (repeat+order)%paths.length;
    globalThis.gc?.(); const before = process.memoryUsage().heapUsed;
    const start = process.hrtime.bigint(); run(paths[p], scenarios[i].input, iterations);
    const durationMs = Number(process.hrtime.bigint()-start)/1e6;
    globalThis.gc?.(); measurements[i][p].push({ durationMs, retainedHeapDeltaBytes: process.memoryUsage().heapUsed-before });
  }
}
const median = (values) => [...values].sort((a,b) => a-b)[Math.floor(values.length/2)];
const results = scenarios.map((scenario,i) => ({ scenario: scenario.name, requestsPerRepeat: iterations, repeats, warmupRequestsPerPath: warmup,
  paths: paths.map((path,p) => ({ name: path.name, medianMicrosecondsPerRequest: median(measurements[i][p].map((m) => m.durationMs))*1000/iterations,
    measurements: measurements[i][p] })),
  candidateToReferenceMedianRatio: median(measurements[i][1].map((m) => m.durationMs))/median(measurements[i][0].map((m) => m.durationMs)) }));

// Isolated preparation probe; not a whole-request or optimizer-independent cost bound.
const preparationProbe = [];
for (let repeat = 0; repeat < 9; repeat++) {
  const start = process.hrtime.bigint();
  for (let i = 0; i < 100000; i++) {
    const context = Object.freeze({ focalLengthMm: 50, focusDistanceM: 5, imageDistanceMm: 50.505050505050505 });
    sink += context.imageDistanceMm;
  }
  preparationProbe.push(Number(process.hrtime.bigint()-start)/100000);
}

// Sampling instrumentation is separate from every timing comparison above.
const allocationProfiles = [];
if (argument("allocation") === "sample") {
  const session = new Session(); session.connect();
  const post = (method, params = {}) => new Promise((resolve, reject) => session.post(method, params, (error, result) => error ? reject(error) : resolve(result)));
  for (const path of paths) {
    globalThis.gc?.();
    await post("HeapProfiler.startSampling", { samplingInterval: 32768, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
    run(path, staged, 2000);
    const { profile } = await post("HeapProfiler.stopSampling");
    let sampledBytes = 0, thinLensSampledBytes = 0;
    function walk(node, inThinLens = false) {
      const included = inThinLens || node.callFrame.functionName === "calculateThinLensImageDistance";
      sampledBytes += node.selfSize;
      if (included) thinLensSampledBytes += node.selfSize;
      for (const child of node.children ?? []) walk(child, included);
    }
    walk(profile.head);
    allocationProfiles.push({ path: path.name, scenario: "24mp-staged-portrait-mixed", requests: 2000, samplingIntervalBytes: 32768,
      sampledBytes, thinLensInclusiveSampledBytes: thinLensSampledBytes });
  }
  session.disconnect();
}
process.stdout.write(JSON.stringify({ benchmark: "poc-request-local-defocus-projection-reuse", benchmarkVersion: 3,
  independentCorpusEquivalence: { cases: corpusHashes.length, responseHashes: corpusHashes, referenceGoldenHashesChanged: false },
  referenceCommit, candidateBaseCommit: argument("candidate-commit") ?? referenceCommit, candidateSources, buildMethod: "tsc", engineApiVersion: ENGINE_API_VERSION,
  pocApiVersion: POC_SIMULATION_API_VERSION, nodeVersion: process.version, v8Version: process.versions.v8,
  platform: platform(), arch: arch(), cpuModel: cpus()[0]?.model ?? "unknown", logicalCpuCount: cpus().length,
  forcedGc: typeof globalThis.gc === "function", results, allocationProfiles,
  preparationProbe: { kind: "isolated-three-scalar-object-freeze", preparationsPerRepeat: 100000,
    nanosecondsPerPreparation: preparationProbe, medianNanosecondsPerPreparation: median(preparationProbe),
    limitation: "Synthetic isolated probe; JIT/escape behavior can differ inside the whole request." }, sink,
  limitations: ["Paired developer POC request shapes on shared infrastructure; not observed product call frequency or browser latency",
    "POC is analytical; 24 MP dimensions do not execute 24 million image samples",
    "Net retained heap is not allocation count; separately instrumented heap sampling is statistical, not an exact allocation counter",
    "Source SHA context is operator-attested; source fingerprints identify the candidate change",
    "No full production radiometry/serialization or browser performance claim"] }, null, 2)+"\n");
