// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { cpus, arch, platform } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL, URL } from "node:url";
import { Session } from "node:inspector";
import process from "node:process";
import * as candidate from "../dist/index.js";

const argument = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length+3);
const referenceRoot = argument("reference-root"), referenceCommit = argument("reference-commit");
if (!referenceRoot || !/^[a-f0-9]{40}$/.test(referenceCommit ?? "")) throw new Error("Declare reference-root and exact reference-commit; build both checkouts with tsc.");
if (argument("candidate-commit") && !/^[a-f0-9]{40}$/.test(argument("candidate-commit"))) throw new Error("candidate-commit must be an exact SHA.");
const reference = await import(pathToFileURL(resolve(referenceRoot, "dist/index.js")));
const evidence = { kind: "generic-parametric", basis: "Photivra-owned synthetic correction workload, not calibration.", residualNote: "No physical residual/error bound.",
  sources: [{ sourceOrigin: "photivra", sourceReference: "photivra:geometric-consumer-performance", reuseStatus: "photivra-owned" }] };
const radial = (id, k1, purpose = "distortion") => ({ id, version: "1", domain: "reconstructed-linear", purpose, kind: "radial",
  profile: { normalizationRadiusMm: Math.hypot(18,12), maximumNormalizedRadius: 1.1, coefficients: { k1, k2: 0, k3: 0 } } });
const geometry = radial("common-distortion", -.03);
const channels = Object.fromEntries(["red", "green", "blue"].map((channel,i) => [channel, radial(`ca-${channel}`, [ .003, 0, -.003 ][i], "lateral-ca")]));
const affine = { id: "field-affine", version: "1", domain: "reconstructed-linear", purpose: "breathing", kind: "affine", matrix: [.98, .005, -.005, .98], offsetMm: { x: 0, y: 0 } };
const identity = { version: "1", domain: "reconstructed-linear", availability: "toggle", defaultEnabled: true, dependencies: [], requiredByStabilizationModes: [], residualNote: evidence.residualNote };
function inputs(size) {
  const state = { bodyId: "photivra-perf-body", bodyVersion: "1", lensId: "photivra-perf-lens", lensVersion: "1", focalLengthMm: 50, aperture: 4,
    focusDistanceM: 5, captureMode: "still", outputWidth: size, outputHeight: size, frameRateHz: 0, stabilizationMode: "off" };
  const raster = { width: size, height: size, centerMm: { x: 0, y: 0 }, pitchMm: 24/Math.max(1,size-1) };
  const resampler = { id: "performance-nearest", version: "1", filter: "nearest", antialias: "none" };
  const values = Array.from({ length: size*size }, (_,i) => 1+(i%size)/size + .01*Math.sin(i));
  const profile = { schemaVersion: "0.1.0", id: "photivra-perf-corrections", version: "1", state, evidence,
    components: [{ ...identity, id: "geometry", kind: "geometry", transform: geometry },
      { ...identity, id: "lateral-ca", kind: "lateral-ca", transforms: channels },
      { ...identity, id: "affine", kind: "geometry", transform: affine },
      { ...identity, id: "gain", kind: "peripheral-illumination", profile: { normalizationRadiusMm: Math.hypot(18,12), maximumNormalizedRadius: 1.1,
        coefficients: { r2: -.25, r4: 0, r6: 0 } }, strength: .6 }] };
  const capture = { state, captureId: "performance-physical-capture", noiseRealizationId: "performance-noise-fixed", timeSeconds: .008,
    raster, channels: { red: values, green: values, blue: values } };
  return { state, raster, resampler, profile, capture };
}
function consumer(api, size, kind) {
  const input = inputs(size);
  if (kind === "sampling-plan") {
    const mapping = api.prepareGeometricMapping({ transforms: [affine, channels.red, geometry], frameTimeSeconds: .008 }).value;
    return () => api.calculateGeometricSamplingPlan({ mapping, sourceRaster: input.raster, destinationRaster: input.raster,
      resampler: input.resampler, physicalProjectionDistanceMm: 50.505050505050505 });
  }
  const plan = api.resolveLensCorrectionPlan({ profile: input.profile, state: input.state, selections: {}, outputKind: "processed", selectionKind: "camera-selectable" }).value;
  return () => api.calculateLensCorrectedCapture({ plan, capture: input.capture, destinationRaster: input.raster, resampler: input.resampler,
    physicalProjectionDistanceMm: 50.505050505050505, clippingLevel: 100 });
}
const paths = [{ name: "reference", api: reference }, { name: "candidate", api: candidate }];
const scenarios = [1,5,17,33,65].flatMap((size) => ["sampling-plan", "corrected-capture"].map((kind) => ({ name: `${kind}-${size}x${size}`, size, kind,
  calls: paths.map((p) => consumer(p.api,size,kind)) })));
let sink = 0;
function run(call, count) { for(let i=0;i<count;i++) { const result = call(); sink += result.value.validSourceMask.length; } }
for(const scenario of scenarios) {
  if(JSON.stringify(scenario.calls[0]()) !== JSON.stringify(scenario.calls[1]())) throw new Error(`Whole result/provenance differs: ${scenario.name}`);
  for(const call of scenario.calls) run(call,scenario.size<17?100:2);
}
const repeats=5, measurements = scenarios.map(() => paths.map(() => []));
for(let repeat=0;repeat<repeats;repeat++) for(let offset=0;offset<scenarios.length;offset++) {
  const index=(repeat+offset)%scenarios.length;
  for(let order=0;order<paths.length;order++) {
    const p=(repeat+order)%paths.length;
    globalThis.gc?.(); const before=process.memoryUsage().heapUsed;
    const start=process.hrtime.bigint(); run(scenarios[index].calls[p],scenarios[index].size<17?100:1);
    const durationMs=Number(process.hrtime.bigint()-start)/1e6;
    globalThis.gc?.(); measurements[index][p].push({ durationMs, retainedHeapDeltaBytes: process.memoryUsage().heapUsed-before });
  }
}
const median = (values) => [...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const results=scenarios.map((s,i)=>({ scenario:s.name, dimensions:{width:s.size,height:s.size}, callsPerRepeat:s.size<17?100:1,repeats,warmupCallsPerPath:s.size<17?100:2,
  paths:paths.map((p,j)=>({ name:p.name,medianMillisecondsPerCall:median(measurements[i][j].map(m=>m.durationMs))/(s.size<17?100:1),measurements:measurements[i][j] })),
  candidateToReferenceMedianRatio:median(measurements[i][1].map(m=>m.durationMs))/median(measurements[i][0].map(m=>m.durationMs)) }));
const preparation=[];
for(const path of paths) {
  const samples=[];
  for(let repeat=0;repeat<7;repeat++) { const start=process.hrtime.bigint();for(let i=0;i<1000;i++)sink+=path.api.prepareGeometricMapping({ transforms:[affine,channels.red,geometry],frameTimeSeconds:.008 }).value.transforms.length;
    samples.push(Number(process.hrtime.bigint()-start)/1000); }
  preparation.push({path:path.name,preparationsPerRepeat:1000,nanosecondsPerPreparation:samples,medianNanosecondsPerPreparation:median(samples)});
}
const profiles=[];
if(argument("profile")==="sample") {
  const session=new Session(); session.connect();
  const post=(method,params={})=>new Promise((resolve,reject)=>session.post(method,params,(error,result)=>error?reject(error):resolve(result)));
  const scenario=scenarios.at(-1);
  for(let p=0;p<paths.length;p++) {
    globalThis.gc?.();
    await post("Profiler.enable");await post("Profiler.start");run(scenario.calls[p],5);const cpu=(await post("Profiler.stop")).profile;
    const nodes=new Map(cpu.nodes.map(n=>[n.id,n])),parents=new Map();for(const n of cpu.nodes)for(const child of n.children??[])parents.set(child,n.id);
    const categories=["prepareGeometricMapping","validateRadialDistortionProfile","calculateRadialDistortionMapping","calculateIlluminationVignetting","assertFiniteNumbers"];
    const hits=Object.fromEntries(categories.map(name=>[name,0]));let wholeConsumerSamples=0;
    for(const id of cpu.samples??[]) {const stack=[];for(let current=id;current!==undefined;current=parents.get(current))stack.push(nodes.get(current).callFrame.functionName);
      if(stack.includes("calculateLensCorrectedCapture")) { wholeConsumerSamples++;for(const name of categories)if(stack.includes(name))hits[name]++; } }
    await post("HeapProfiler.startSampling",{samplingInterval:32768,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});
    run(scenario.calls[p],5);const heap=(await post("HeapProfiler.stopSampling")).profile;
    let sampledBytes=0,preparationInclusiveSampledBytes=0;
    function walk(node,inPrepare=false) { const included=inPrepare||node.callFrame.functionName==="prepareGeometricMapping";sampledBytes+=node.selfSize;if(included)preparationInclusiveSampledBytes+=node.selfSize;for(const child of node.children??[])walk(child,included); }
    walk(heap.head);profiles.push({path:paths[p].name,scenario:scenario.name,cpu:{calls:5,totalSamples:cpu.samples?.length??0,wholeConsumerSamples,inclusiveSampleCounts:hits},
      allocation:{calls:5,samplingIntervalBytes:32768,sampledBytes,preparationInclusiveSampledBytes}});
  }
  session.disconnect();
}
process.stdout.write(JSON.stringify({ benchmark:"merged-geometric-consumers",benchmarkVersion:1,referenceCommit,candidateBaseCommit:argument("candidate-commit") ?? referenceCommit,
  candidateSource:{path:"src/output/geometric-transforms.ts",sha256:createHash("sha256").update(readFileSync(new URL("../src/output/geometric-transforms.ts",import.meta.url))).digest("hex")},
  engineApiVersion:candidate.ENGINE_API_VERSION,buildMethod:"tsc",nodeVersion:process.version,v8Version:process.versions.v8,platform:platform(),arch:arch(),cpuModel:cpus()[0]?.model??"unknown",logicalCpuCount:cpus().length,
  forcedGc:typeof globalThis.gc==="function",results,preparation,profiles,sink,
  limitations:["Bounded real merged plan/correction consumers on owned synthetic sampled data; no full-production/browser frame-time claim",
    "Alternating paired calls on shared host; workload shapes are not observed product traffic",
    "Net retained heap is not allocation count; separate inspector sampling estimates are statistical",
    "CPU inclusive categories overlap, and inlining/sampling limit attribution; do not sum them",
    "No optical calibration, radiometry, actual prefilter or generic prepared API is introduced",
    "Commit/build identity is operator-attested; candidate source fingerprint is recorded"] },null,2)+"\n");
