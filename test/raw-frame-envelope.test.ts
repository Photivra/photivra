// SPDX-License-Identifier: Apache-2.0

import { expect, it } from "vitest";
import { createSimulatedCapture, createSensorRawFrame, parseRawFrameReconstructionInput, parseSensorRawProducerInput,
  parsePhotographicExportInput, resolveRawFrameReconstruction, type SensorRawFrameInput } from "../src/index.js";
import { loadSensorRawFrameInput } from "./helpers/sensor-raw-frame-fixture.js";
import { loadLinearCaptureInput } from "./helpers/linear-capture-fixture.js";
import { loadRawFrameReconstructionInput } from "./helpers/raw-frame-reconstruction-fixture.js";
import { loadSensorRawProducerInput } from "./helpers/sensor-raw-producer-fixture.js";
import { loadPhotographicExportInput } from "./helpers/photographic-export-fixture.js";

function denseFrame(width: number, height: number): SensorRawFrameInput {
  const raw=loadSensorRawFrameInput(), c=loadLinearCaptureInput(), raster={pixelWidth:width,pixelHeight:height};
  c.geometry={...c.geometry,nativeRaster:raster,activeCaptureRect:{x:0,y:0,width:2,height:2},outputRaster:{pixelWidth:2,pixelHeight:2}};
  c.planes=[{...c.planes[0]!,pixelWidth:2,pixelHeight:2,storage:{kind:"inline-float64",samples:Array<number>(12).fill(0)}}];
  raw.capture=createSimulatedCapture(c).value;
  raw.bindingProfile.nativeRaster=raster;
  raw.captureModeProfile.modes[0]!.processedImageRaster={value:raster,evidence:raw.colorSamplingProfile.evidence};
  const tile=raw.samples;
  raw.samples=Array.from({length:width*height},(_,i)=>{
    const x=i%width,y=Math.floor(i/width);
    return {...tile[(y%2)*2+x%2]!,modeSampleIndexFullFrame:{x,y},colorSamplingSite:{x,y},
      sourceChargeSeedUint32:2*i,sourceReadNoiseSeedUint32:2*i+1};
  });
  return raw;
}

it("accepts the inclusive 4,096-site reconstruction boundary with absolute native support",()=>{
  const v=loadRawFrameReconstructionInput(), rawFrame=createSensorRawFrame(denseFrame(64,64));
  const result=resolveRawFrameReconstruction({...v,rawFrame});
  expect(result.value.rawFrame.samples).toHaveLength(4096);
  expect(result.value.linearPlane.samples).toEqual(Array(4).fill([-64/959,224/959,1]).flat());
  expect(result.value.region).toEqual({x:0,y:0,width:2,height:2});
});

it("keeps larger valid attachment separate from reference execution even with a tiny active/output crop",()=>{
  const v=loadRawFrameReconstructionInput(), rawFrame=createSensorRawFrame(denseFrame(64,65));
  expect(rawFrame.samples).toHaveLength(4160);
  expect(rawFrame.capture.resolvedGeometry.output.raster).toEqual({pixelWidth:2,pixelHeight:2});
  expect(()=>parseRawFrameReconstructionInput({...v,rawFrame})).toThrow("at most 4,096 samples");
  const producer=loadSensorRawProducerInput();
  expect(()=>parseSensorRawProducerInput({...producer,sites:Array(4097).fill(producer.sites[0])})).toThrow();
});

it("rejects structurally valid non-Bayer attachments at export parse time before kernel execution",()=>{
  for (const channels of [["red","green","blue","blue"],["red","green","blue","cyan"]]) {
    const v=loadPhotographicExportInput(), raw=loadSensorRawFrameInput();
    raw.capture=v.reconstruction.rawFrame.capture;
    raw.colorSamplingProfile.layout={kind:"periodic-mosaic",repeatWidthSites:2,repeatHeightSites:2,
      siteChannelIds:channels,anchor:"native-sensor-top-left-site"};
    raw.samples.forEach((sample,i)=>{sample.channelId=channels[i]!;});
    v.reconstruction.rawFrame=createSensorRawFrame(raw);
    // These kernels reference the former channel layout; topology must be
    // discoverable without executing those pixel kernels or container packing.
    expect(()=>parsePhotographicExportInput(v)).toThrow("2x2 RGB Bayer topology only");
  }
});
