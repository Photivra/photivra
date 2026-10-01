// SPDX-License-Identifier: Apache-2.0

import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { performance } from "node:perf_hooks";
import { URL } from "node:url";
import { createPhotographicExportPair, parsePhotographicExportInput, createSimulatedCapture, createSensorRawFrame, ENGINE_API_VERSION } from "../dist/index.js";

// Repository-only owned test fixture, not scientific sensor calibration.
// Usage after npm run build: node scripts/generate-photographic-export-fixtures.mjs OUTPUT_DIRECTORY
const outputDirectory = process.argv[2];
if (!outputDirectory) throw new Error("Supply a fixture output directory.");
const input = JSON.parse(await readFile(new URL("../test/fixtures/photographic-export-reference.json", import.meta.url), "utf8"));
// This pinned input represents the draft API; keep stale versions visible.
if (input.reconstruction.rawFrame.capture.engineApiVersion !== ENGINE_API_VERSION) throw new Error("Reference fixture engine version needs review.");
function chartInput(template) {
  const v=JSON.parse(JSON.stringify(template)), raw=v.reconstruction.rawFrame, capture=raw.capture;
  const raster={pixelWidth:64,pixelHeight:64};
  for (const key of ["schemaVersion","engineApiVersion","resolvedGeometry","equivalentFocalLength35Mm"]) delete capture[key];
  capture.captureId="00000000-0000-4000-8000-000000000011";
  capture.geometry={...capture.geometry,nativeRaster:raster,outputRaster:raster};
  capture.planes=[{...capture.planes[0],pixelWidth:64,pixelHeight:64,storage:{kind:"inline-float64",samples:Array(4096*3).fill(0)}}];
  raw.capture=createSimulatedCapture(capture).value;
  raw.bindingProfile.nativeRaster=raster;
  raw.captureModeProfile.modes[0].processedImageRaster.value=raster;
  const samples=raw.samples;
  // Owned grayscale ramp in post-ADC site codes, not an RGB image masked as RAW.
  // It is serializer/decoder test data; it does not certify a physical producer.
  raw.samples=Array.from({length:4096},(_,i) => {
    const x=i%64,y=Math.floor(i/64),site=samples[(y%2)*2+x%2];
    const rawCode=64+Math.round((Math.floor(x/2)+Math.floor(y/2))/62*959);
    return {...site,modeSampleIndexFullFrame:{x,y},colorSamplingSite:{x,y},rawCode,
      blackSubtractedNormalizedCode:(rawCode-64)/959,digitalSaturationApplied:rawCode===1023,
      sourceChargeSeedUint32:i,sourceReadNoiseSeedUint32:i+4096};
  });
  for (const key of ["schemaVersion","sampleDomain","sampleOrder","producerBinding","reconstructionApplied","renderingApplied","nativePixelWidth","nativePixelHeight"]) delete raw[key];
  v.reconstruction.rawFrame=createSensorRawFrame(raw);
  v.reconstruction.region={x:0,y:0,width:64,height:64};
  v.sceneProfile.id="owned-gray-ramp-test";
  v.metadata.raw={documentId:"00000000-0000-4000-8000-000000000012",instanceId:"00000000-0000-4000-8000-000000000013"};
  v.metadata.jpeg={documentId:"00000000-0000-4000-8000-000000000014",instanceId:"00000000-0000-4000-8000-000000000015"};
  return v;
}
await mkdir(outputDirectory, { recursive: true });
for (const [name,v] of [["reference",input],["chart",chartInput(input)]]) {
const start = performance.now(), heapBefore = process.memoryUsage().heapUsed;
const pair = await createPhotographicExportPair(parsePhotographicExportInput(v));
const elapsedMs = performance.now()-start, heapAfter = process.memoryUsage().heapUsed;
await writeFile(path.join(outputDirectory,name+".dng"),pair.dng.bytes);
await writeFile(path.join(outputDirectory,name+".jpg"),pair.jpeg.bytes);
await writeFile(path.join(outputDirectory,name+".json"),JSON.stringify({
  fixture:name+"-owned-synthetic-not-calibration",
  nativeWidth:pair.source.value.rawFrame.nativePixelWidth,nativeHeight:pair.source.value.rawFrame.nativePixelHeight,
  codes:pair.source.value.rawFrame.samples.map((s) => s.rawCode),
  rgb:pair.rendering.value.integerSamples,hash:pair.simulationHash,
  dngHash:pair.dng.sha256,jpegHash:pair.jpeg.sha256,
  fileBytes:{dng:pair.dng.bytes.length,jpeg:pair.jpeg.bytes.length},
  measured:{elapsedMs,heapUsedBefore:heapBefore,heapUsedAfter:heapAfter,
    scope:"single bounded fixture; no peak-memory or typical-resolution claim"}
},null,2)+"\n");
}
process.stdout.write(`Wrote reference and chart DNG/JPEG/JSON fixtures to ${outputDirectory}\n`);
