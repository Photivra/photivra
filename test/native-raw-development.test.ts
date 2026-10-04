// SPDX-License-Identifier: Apache-2.0
import {describe,it,expect} from "vitest";
import {createNativeRawTask,createNativeRawDevelopmentTask,calculateProcessedSensorRaw,simulateSensorRawFrame,
  createSimulatedCapture,type NativeRawDevelopmentInput,type CaptureOrientation} from "../src/index.js";
import {nativeRawFixture} from "./helpers/native-raw-fixture.js";
import {loadPhotographicExportInput} from "./helpers/photographic-export-fixture.js";
async function fixture(width=2,height=2,orientation:CaptureOrientation="landscape"): Promise<{input:NativeRawDevelopmentInput;reference:ReturnType<typeof calculateProcessedSensorRaw>}> {
  const f=nativeRawFixture(width,height),exportInput=loadPhotographicExportInput();
  f.input.exposure.geometry.orientation=orientation;
  if(orientation.startsWith("portrait"))f.input.exposure.geometry.outputRaster={pixelWidth:height,pixelHeight:width};
  const task=createNativeRawTask(f.input,f.provider);await task.run();const raw=task.takeOutput();
  const capture=createSimulatedCapture({...f.input.exposure,source:f.reference.frame.capture.source,planes:f.reference.frame.capture.planes.map(p=>({...p,pixelWidth:orientation.startsWith("portrait")?height:width,pixelHeight:orientation.startsWith("portrait")?width:height,storage:{kind:"inline-float64",samples:Array(width*height*p.channelIds.length).fill(0)}}))}).value;
  const frame=simulateSensorRawFrame({...f.reference,frame:{...f.reference.frame,capture,captureModeProfile:f.input.captureModeProfile,bindingProfile:f.input.bindingProfile},sites:Array.from({length:width*height},(_,i)=>f.site(i%width,Math.floor(i/width)))}).value.frame;
  exportInput.reconstruction.rawFrame=frame;exportInput.reconstruction.region={x:0,y:0,width,height};
  return {input:{raw,phaseProfiles:exportInput.reconstruction.phaseProfiles,colorProfile:exportInput.colorProfile,whiteBalance:exportInput.whiteBalance,rendering:exportInput.rendering,maximumRetainedPayloadBytes:width*height*10},reference:calculateProcessedSensorRaw({reconstruction:exportInput.reconstruction,colorProfile:exportInput.colorProfile,whiteBalance:exportInput.whiteBalance,rendering:exportInput.rendering})};
}
describe("packed same-RAW development",()=>{
  it("matches the reference pipeline including native orientation and integer SDR",async()=>{
    for(const orientation of ["landscape","portrait-clockwise","landscape-inverted","portrait-counter-clockwise"] as const){
      const f=await fixture(4,2,orientation),task=createNativeRawDevelopmentTask(f.input,async():Promise<void>=>{});await task.run();const output=task.takeOutput();
      expect(Array.from(output.integerSamples)).toEqual(f.reference.value.rendering.value.integerSamples);expect(output.diagnostics).toEqual(f.reference.value.rendering.value.diagnostics);
      expect(output.width).toBe(f.reference.value.rendering.value.pixelWidth);expect(output.height).toBe(f.reference.value.rendering.value.pixelHeight);
      expect(output.raw.codes).toEqual(f.input.raw.codes);expect(()=>task.takeOutput()).toThrow();
    }
  });
  it("snapshots codes and policy before caller mutation and preserves signed below-black noise",async()=>{
    const f=await fixture(),before=f.input.raw.codes.slice(),task=createNativeRawDevelopmentTask(f.input,async():Promise<void>=>{});
    f.input.raw.codes.fill(1023);f.input.whiteBalance="apply-resolved-sensor-gains";
    await task.run();const out=task.takeOutput();expect(out.raw.codes).toEqual(before);expect(out.whiteBalance).toBe("not-required");expect(Array.from(out.integerSamples)).toEqual(f.reference.value.rendering.value.integerSamples);
  });
  it("rejects incomplete halos, bad CFA source channels, RAW spans, storage and stale plans before execution",async()=>{
    for(const mutation of [
      (v:NativeRawDevelopmentInput):void=>{v.phaseProfiles[0]!.profile.kernels[0]!.contributions[0]!.offsetX=-1;},
      (v:NativeRawDevelopmentInput):void=>{v.phaseProfiles[0]!.profile.kernels[0]!.contributions[0]!.sourceChannelId="blue";},
      (v:NativeRawDevelopmentInput):void=>{v.raw.digitalSaturationCodes[0]=64;},
      (v:NativeRawDevelopmentInput):void=>{v.raw.codes[0]=1024;},
      (v:NativeRawDevelopmentInput):void=>{v.raw.saturationFlags[0]=8;},
      (v:NativeRawDevelopmentInput):void=>{v.raw.codes=new Uint16Array(3);},
      (v:NativeRawDevelopmentInput):void=>{v.raw.plan={...v.raw.plan,pixelCount:3};},
      (v:NativeRawDevelopmentInput):void=>{v.maximumRetainedPayloadBytes=39;},
      (v:NativeRawDevelopmentInput):void=>{v.whiteBalance="apply-resolved-sensor-gains";}
    ]){const f=await fixture(),v=structuredClone(f.input);mutation(v);expect(()=>createNativeRawDevelopmentTask(v,async():Promise<void>=>{})).toThrow();}
  });
  it("cancels at host yields and never publishes partial output",async()=>{
    const f=await fixture(),task=createNativeRawDevelopmentTask(f.input,async():Promise<void>=>{task.cancel();});
    await expect(task.run()).rejects.toThrow();expect(task.state).toBe("cancelled");expect(()=>task.takeOutput()).toThrow();expect(f.input.raw.codes.length).toBe(4);
    const idle=createNativeRawDevelopmentTask(f.input,async():Promise<void>=>{});idle.dispose();await expect(idle.run()).rejects.toThrow();
  });
});
