// SPDX-License-Identifier: Apache-2.0

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { simulateEnvironmentSensorRawFrame, createPhotographicExportPair, ENGINE_API_VERSION,
  createSimulatedCapture,type CaptureOrientation } from "../src/index.js";
import { producerExportAcceptanceInput } from "../test/helpers/producer-export-acceptance-fixture.js";
import { loadPhotographicExportInput } from "../test/helpers/photographic-export-fixture.js";

const directory=process.argv[2];
if(!directory) throw Error("Supply an acceptance output directory.");
await mkdir(directory,{recursive:true});
const cases: {name:string;orientation:CaptureOrientation;wb:boolean}[]=[
  {name:"landscape",orientation:"landscape",wb:false},{name:"portrait-clockwise",orientation:"portrait-clockwise",wb:false},
  {name:"landscape-inverted",orientation:"landscape-inverted",wb:false},{name:"portrait-counter-clockwise",orientation:"portrait-counter-clockwise",wb:false},
  {name:"manual-wb",orientation:"landscape",wb:true}
];
const manifest=[];
for(const [caseIndex,scenario] of cases.entries()){
  const uuid=(n:number): string=>"00000000-0000-4000-8000-"+n.toString(16).padStart(12,"0");
  const input=producerExportAcceptanceInput(scenario.orientation,scenario.wb,uuid(0x100+caseIndex));
  const start=performance.now(), before=process.memoryUsage().heapUsed;
  const producer=simulateEnvironmentSensorRawFrame(input);
  const output=loadPhotographicExportInput();
  output.reconstruction={...output.reconstruction,rawFrame:producer.value.raw.value.frame,region:{x:0,y:0,width:72,height:48}};
  output.whiteBalance=scenario.wb ? "apply-resolved-sensor-gains" : "not-required";
  output.metadata.raw={documentId:uuid(0x1000+caseIndex*4),instanceId:uuid(0x1001+caseIndex*4)};
  output.metadata.jpeg={documentId:uuid(0x1002+caseIndex*4),instanceId:uuid(0x1003+caseIndex*4)};
  output.sceneProfile.id="owned-analytic-environment-acceptance";
  const pair=await createPhotographicExportPair(output);
  const frame=pair.source.value.rawFrame;
  const details={fixture:scenario.name,engineApiVersion:ENGINE_API_VERSION,orientation:scenario.orientation,
    nativeWidth:frame.nativePixelWidth,nativeHeight:frame.nativePixelHeight,
    outputWidth:pair.processedOutputView.pixelWidth,outputHeight:pair.processedOutputView.pixelHeight,
    codes:frame.samples.map(s=>s.rawCode),rgb:pair.rendering.value.integerSamples,hash:pair.simulationHash,
    dngHash:pair.dng.sha256,jpegHash:pair.jpeg.sha256,rawDataUniqueId:pair.rawDataUniqueId,
    asShotGains:frame.capture.whiteBalanceIntent?.channelGains ?? null,
    producer:{model:producer.provenance.model,version:producer.provenance.modelVersion,
      providerEvaluationCount:producer.value.providerEvaluationCount,providerTransportVerified:false,productionPlanActivated:false,
      belowBlackCount:frame.samples.filter(s=>s.rawCode<s.blackLevelCode).length,
      adcClippedCount:frame.samples.filter(s=>s.digitalSaturationApplied).length,
      physicalClippedCount:frame.samples.filter(s=>s.physicalScalarSaturationApplied).length},
    measured:{elapsedMs:performance.now()-start,heapUsedBefore:before,heapUsedAfter:process.memoryUsage().heapUsed,
      scope:"single bounded reference frame; before/after heap values are not peak-memory measurements"}};
  await writeFile(path.join(directory,scenario.name+".dng"),pair.dng.bytes);
  await writeFile(path.join(directory,scenario.name+".jpg"),pair.jpeg.bytes);
  await writeFile(path.join(directory,scenario.name+".json"),JSON.stringify(details,null,2)+"\n");
  const {codes:_c,rgb:_r,...summary}=details;void _c;void _r;manifest.push(summary);
  console.log(scenario.name+": "+details.producer.providerEvaluationCount+" executed queries, "+details.producer.belowBlackCount+" below-black codes");
}
await writeFile(path.join(directory,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");

const limits=[];
for(const [megapixels,raster] of [[24,{pixelWidth:6000,pixelHeight:4000}], [45,{pixelWidth:9000,pixelHeight:5000}],
  [60,{pixelWidth:10000,pixelHeight:6000}]] as const){
  const input=producerExportAcceptanceInput(),c=input.frame.capture;
  const {schemaVersion:_s,engineApiVersion:_e,resolvedGeometry:_g,equivalentFocalLength35Mm:_f,...ci}=c;
  void _s;void _e;void _g;void _f;
  const preview={pixelWidth:60,pixelHeight:Math.round(60*raster.pixelHeight/raster.pixelWidth)};
  input.frame.capture=createSimulatedCapture({...ci,geometry:{...ci.geometry,nativeRaster:raster,outputRaster:preview},
    planes:[{...ci.planes[0]!,...preview,storage:{kind:"inline-float64",samples:Array<number>(preview.pixelWidth*preview.pixelHeight*3).fill(0)}}]}).value;
  input.sites=[];
  let calls=0;
  input.evaluateRadiance=(): never=>{calls++;throw Error("Unsupported frame must not call provider.");};
  const before=process.memoryUsage().heapUsed,start=performance.now();
  let error="";
  try{simulateEnvironmentSensorRawFrame(input);}catch(e){if(!(e instanceof Error))throw e;error=e.message;}
  if(!error || calls!==0) throw Error("Unsupported native-frame preflight did not reject before evaluation.");
  limits.push({megapixels,nativeRaster:raster,providerCalls:calls,error,elapsedMs:performance.now()-start,
    heapUsedBefore:before,heapUsedAfter:process.memoryUsage().heapUsed,
    scope:"unsupported-size preflight with empty site payload; no megapixel image allocated or processed; not a peak-memory benchmark"});
}
await writeFile(path.join(directory,"unsupported-size-preflight.json"),JSON.stringify(limits,null,2)+"\n");
