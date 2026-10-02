// SPDX-License-Identifier: Apache-2.0

import process from "node:process";
import { cpus, arch, platform } from "node:os";
import { Session } from "node:inspector";
import { createHash } from "node:crypto";
import { readFileSync, mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { URL, fileURLToPath, pathToFileURL } from "node:url";


const commit = process.argv.find(v => v.startsWith("--commit="))?.slice(9);
if (!/^[a-f0-9]{40}$/.test(commit ?? "")) throw Error("Declare exact measured --commit.");
const root=fileURLToPath(new URL("../",import.meta.url)), scratch=mkdtempSync(join(tmpdir(),"photivra-perf-"));
try {
  execFileSync(process.execPath,[join(root,"node_modules/typescript/bin/tsc"),"-p",join(root,"tsconfig.json"),"--outDir",scratch],{cwd:root,stdio:"inherit"});
  writeFileSync(join(scratch,"package.json"),'{"type":"module"}');
  mkdirSync(join(scratch,"test/fixtures"),{recursive:true});
  copyFileSync(join(root,"test/fixtures/basic-reference-scene.json"),join(scratch,"test/fixtures/basic-reference-scene.json"));
  const { ENGINE_API_VERSION, simulateEnvironmentSensorRawFrame }=await import(pathToFileURL(join(scratch,"src/index.js")));
  const { frameInput }=await import(pathToFileURL(join(scratch,"test/helpers/environment-raw-fixture.js")));
  const median = values => [...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
  const scenarios = [{ temporal: 4, spatial: 2, psf: false }, { temporal: 16, spatial: 4, psf: false },
    { temporal: 16, spatial: 2, psf: true }, { temporal: 32, spatial: 4, psf: true }].map(config => {
    const input = frameInput(true, config.psf);
    for (const site of input.sites) {
      site.environment.temporalSampleCount = config.temporal;
      site.environment.sensor.spatialSampling.spatialSampleCountX = config.spatial;
      site.environment.sensor.spatialSampling.spatialSampleCountY = config.spatial;
    }
    let calls = 0;
    const provider = input.evaluateRadiance;
    input.evaluateRadiance = q => { calls++; return provider(q); };
    const run = () => { calls = 0; const result = simulateEnvironmentSensorRawFrame(input); return { result, calls }; };
    const first = run(), expectedQueries = 4*config.temporal*config.spatial**2*2*(config.psf ? 9 : 1);
    if (first.calls !== expectedQueries) throw Error("Unexpected executed work count.");
    const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
    const sha256 = digest(first.result);
    if (sha256 !== digest(run().result)) throw Error("Whole result replay changed.");
    return { config, expectedQueries, run, sha256 };
  });
  let sink = 0;
  const measure = (s, count=1) => { for(let i=0;i<count;i++) sink += s.run().result.value.raw.value.frame.samples[0].rawCode; };
  for (const s of scenarios) measure(s, 2);
  const samples = scenarios.map(()=>[]);
  for(let repeat=0;repeat<5;repeat++) for(let offset=0;offset<scenarios.length;offset++) {
    const i=(repeat+offset)%scenarios.length;
    globalThis.gc?.(); const before=process.memoryUsage(), start=process.hrtime.bigint();
    measure(scenarios[i]); const milliseconds=Number(process.hrtime.bigint()-start)/1e6;
    globalThis.gc?.(); const after=process.memoryUsage();
    samples[i].push({milliseconds, netHeapDeltaBytes:after.heapUsed-before.heapUsed, netRssDeltaBytes:after.rss-before.rss});
  }
  const profiles=[];
  if(process.argv.includes("--profile=sample")) {
    const s=scenarios.at(-1), session=new Session();session.connect();
    const post=(method,params={})=>new Promise((resolve,reject)=>session.post(method,params,(e,r)=>e?reject(e):resolve(r)));
    await post("Profiler.enable");await post("Profiler.start");measure(s);const cpu=(await post("Profiler.stop")).profile;
    const nodes=new Map(cpu.nodes.map(n=>[n.id,n])),parents=new Map();for(const n of cpu.nodes)for(const child of n.children??[])parents.set(child,n.id);
    const names=["prepareGeometricMapping","calculateThinLensImageDistance","calculateEnvironmentSensorPhotoSignal","assertFiniteNumbers"];
    const hits=Object.fromEntries(names.map(n=>[n,0]));let wholeConsumerSamples=0;
    for(const id of cpu.samples??[]) {const stack=[];for(let p=id;p!==undefined;p=parents.get(p))stack.push(nodes.get(p).callFrame.functionName);
      if(stack.includes("simulateEnvironmentSensorRawFrame")){wholeConsumerSamples++;for(const n of names)if(stack.includes(n))hits[n]++;}}
    await post("HeapProfiler.startSampling",{samplingInterval:32768,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});
    measure(s);const heap=(await post("HeapProfiler.stopSampling")).profile;let sampledBytes=0;
    function walk(n){sampledBytes+=n.selfSize;for(const c of n.children??[])walk(c);}walk(heap.head);
    profiles.push({scenario:s.config,calls:1,cpu:{totalSamples:cpu.samples?.length??0,wholeConsumerSamples,inclusiveSampleCounts:hits},allocation:{samplingIntervalBytes:32768,sampledBytes}});session.disconnect();
  }
  process.stdout.write(JSON.stringify({benchmark:"final-v1-executed-environment-to-raw",benchmarkVersion:1,sourceCommit:commit,
    sourceFingerprint:createHash("sha256").update(readFileSync(new URL("../src/capture/environment-raw-producer.ts",import.meta.url))).digest("hex"),
    engineApiVersion:ENGINE_API_VERSION,buildMethod:"tsc",nodeVersion:process.version,v8Version:process.versions.v8,
    platform:platform(),arch:arch(),cpuModel:cpus()[0]?.model,logicalCpuCount:cpus().length,forcedGc:typeof globalThis.gc==="function",
    results:scenarios.map((s,i)=>({config:s.config,nativeSites:4,providerEvaluationsPerCall:s.expectedQueries,
      wholeResultSha256:s.sha256,warmupCalls:2,repeats:5,medianMillisecondsPerCall:median(samples[i].map(m=>m.milliseconds)),measurements:samples[i]})),profiles,sink,
    limitations:["Current supported bounded production capture executor on owned synthetic rolling/temporal/spatial/spectral/PSF inputs; not calibrated provider transport or visibility",
      "Four native sites with 128 to 36864 executed provider evaluations; workload density, not full-resolution throughput or tiny-raster frame-time evidence",
      "No candidate optimization; descriptive current baseline, separate from #43/#45 paired equivalence and effect measurements",
      "Shared Mac host; no observed product traffic or browser frame-time claim",
      "Net heap/RSS deltas are not allocation counts or sampled peak memory; inspector estimates are statistical and separate from ordinary timing",
      "Inclusive CPU categories overlap; sampling/inlining limits attribution; no safety/provenance gate may be removed based on this profile"]},null,2)+"\n");

} finally { rmSync(scratch,{recursive:true,force:true}); }
