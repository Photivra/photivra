// SPDX-License-Identifier: Apache-2.0

import { describe,it,expect } from "vitest";
import { createPhotographicExportPair,parsePhotographicExportInput,createSimulatedCapture,createSensorRawFrame,
  type PhotographicExportInput,type CaptureOrientation,type SimulatedCaptureInput } from "../src/index.js";
import { loadPhotographicExportInput } from "./helpers/photographic-export-fixture.js";
import { loadSensorRawFrameInput } from "./helpers/sensor-raw-frame-fixture.js";
import { correctionProfile,state } from "./optics-group-fixtures.js";

function input(orientation: CaptureOrientation="landscape",shift=0): PhotographicExportInput {
  const v=loadPhotographicExportInput(),raw=loadSensorRawFrameInput(),c=v.reconstruction.rawFrame.capture;
  const {schemaVersion:_s,engineApiVersion:_e,resolvedGeometry:_g,equivalentFocalLength35Mm:_f,...ci}=c;
  void _s;void _e;void _g;void _f;
  raw.capture=createSimulatedCapture({...ci,geometry:{...ci.geometry,imagingArea:{widthMm:2,heightMm:2},orientation}}).value;
  v.reconstruction.rawFrame=createSensorRawFrame(raw);
  if(c.focus.kind!=="finite") throw Error("Finite fixture required.");
  const binding={...state,focalLengthMm:c.exposure.focalLengthMm,aperture:c.exposure.aperture,
    focusDistanceM:c.focus.distanceM,outputWidth:2,outputHeight:2};
  const geometry=correctionProfile.components[0]!;
  if(geometry.kind!=="geometry" || geometry.transform.kind!=="affine") throw Error("Affine fixture required.");
  v.correction={profile:{...correctionProfile,state:binding,components:[{...geometry,
    transform:{...geometry.transform,offsetMm:{x:shift,y:0}}},correctionProfile.components[1]!] },state:binding,
    coordinateFrame:"native-optical-linear-srgb-d65",selections:{geometry:"on",gain:"off"},selectionKind:"camera-selectable",
    frameTimeSeconds:0,resampler:{id:"owned-linear",version:"1",filter:"bilinear",antialias:"none"},clippingLevel:10,
    invalidSupport:shift===0 ? "reject" : "joint-valid-crop",outputImageStateId:"corrected-export"};
  return v;
}
function rawCodes(bytes: Uint8Array): number[] {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let offset=0,count=0;
  for(let i=0;i<view.getUint16(8,true);i++) {
    const p=10+12*i,tag=view.getUint16(p,true);
    if(tag===273) offset=view.getUint32(p+8,true);
    if(tag===279) count=view.getUint32(p+8,true)/2;
  }
  return Array.from({length:count},(_,i)=>view.getUint16(offset+2*i,true));
}
function jpegSize(bytes: Uint8Array): number[] {
  let p=2;
  while(p<bytes.length) {
    const marker=bytes[p+1]!,length=bytes[p+2]!*256+bytes[p+3]!;
    if(marker===192) return [bytes[p+7]!*256+bytes[p+8]!,bytes[p+5]!*256+bytes[p+6]!];
    p+=length+2;
  }
  throw Error("Missing SOF");
}
function replaceCapture(v: PhotographicExportInput,patch: Partial<SimulatedCaptureInput>): void {
  const c=v.reconstruction.rawFrame.capture,{schemaVersion:_s,engineApiVersion:_e,resolvedGeometry:_g,equivalentFocalLength35Mm:_f,...ci}=c;
  void _s;void _e;void _g;void _f;
  const raw=loadSensorRawFrameInput();raw.capture=createSimulatedCapture({...ci,...patch}).value;
  v.reconstruction.rawFrame=createSensorRawFrame(raw);
}
describe("RAW-paired corrected photographic export",()=>{
  it("preserves exact RAW codes and identity while rendering the same attached reconstruction and declaring intent",async()=>{
    const v=input(),{correction:_c,...plain}=v;void _c;
    const a=await createPhotographicExportPair(plain),b=await createPhotographicExportPair(v);
    expect(b.rendering.value.integerSamples).toEqual(a.rendering.value.integerSamples);
    expect(rawCodes(b.dng.bytes)).toEqual([0,64,512,1023]);expect(b.rawDataUniqueId).toBe(a.rawDataUniqueId);
    expect(b.nativeDefaultCrop).toEqual(a.nativeDefaultCrop);expect(b.simulationHash).not.toBe(a.simulationHash);
    expect(b.rawCorrectionIntent!.value.application).toBe("metadata-only");
    expect(b.correction!.value.plan.value.application).toBe("bake-downstream");
    expect(b.correction!.value.captureId).toBe(v.reconstruction.rawFrame.capture.captureId);
    expect(new TextDecoder().decode(b.dng.bytes)).toContain("informational-intent-only");
    expect(new TextDecoder().decode(b.jpeg.bytes)).toContain("processed-view");
    expect((await createPhotographicExportPair(v)).jpeg.bytes).toEqual(b.jpeg.bytes);
  });
  it("maps a native shift and joint-valid JPEG crop through all four orientations without changing RAW default crop",async()=>{
    const expected=[{x:0,y:0,width:1,height:2},{x:0,y:0,width:2,height:1},
      {x:1,y:0,width:1,height:2},{x:0,y:1,width:2,height:1}];
    for(const [i,o] of (["landscape","portrait-clockwise","landscape-inverted","portrait-counter-clockwise"] as const).entries()) {
      const v=input(o,1),p=await createPhotographicExportPair(v);
      expect(p.processedOutputView.rect).toEqual(expected[i]);
      expect(jpegSize(p.jpeg.bytes)).toEqual([expected[i]!.width,expected[i]!.height]);
      expect(p.nativeDefaultCrop).toEqual({x:0,y:0,width:2,height:2});expect(rawCodes(p.dng.bytes)).toEqual([0,64,512,1023]);
      expect(p.correction!.value.validSourceMask.filter(Boolean).length).toBe(2);
      expect(new TextDecoder().decode(p.jpeg.bytes)).toContain("ProcessedOutputRect");
    }
  });
  it("keeps gain/clipping and reference bypass separate from RAW saturation and independent float planes",async()=>{
    const v=input(),a=await createPhotographicExportPair(v);v.correction!.selections={geometry:"off",gain:"on"};
    v.correction!.clippingLevel=.1;
    const b=await createPhotographicExportPair(v);
    expect(JSON.stringify(b.rendering.value.integerSamples)).not.toBe(JSON.stringify(a.rendering.value.integerSamples));
    expect(b.correction!.value.correction.value.illuminationClippingEventCount).toBeGreaterThan(0);
    expect(b.rawDataUniqueId).toBe(a.rawDataUniqueId);expect(rawCodes(b.dng.bytes)).toEqual(rawCodes(a.dng.bytes));
    const c=v.reconstruction.rawFrame.capture;
    replaceCapture(v,{planes:[{...c.planes[0]!,storage:{kind:"inline-float64",samples:Array(12).fill(999)}}]});
    expect((await createPhotographicExportPair(v)).rendering.value.integerSamples).toEqual(b.rendering.value.integerSamples);
    v.correction!.selectionKind="reference-bypass";
    const bypass=await createPhotographicExportPair(v);
    expect(bypass.rendering.value.integerSamples).toEqual(a.rendering.value.integerSamples);
    expect(bypass.correction!.value.correction.value.illuminationClippingEventCount).toBe(0);
  });
  it("reuses the resolved sensor WB exactly once before post-color correction",async()=>{
    const v=input(),c=v.reconstruction.rawFrame.capture;
    replaceCapture(v,{whiteBalanceIntent:{stateId:"wb",source:"manual-gains",locked:true,
      channelGains:{red:2,green:1,blue:.5},sourceProfile:null},planes:[{...c.planes[0]!,whiteBalanceApplication:"intent-only"}]});
    v.whiteBalance="apply-resolved-sensor-gains";
    const {correction:_c,...plain}=v;void _c;
    const a=await createPhotographicExportPair(plain),b=await createPhotographicExportPair(v);
    expect(b.rendering.value.integerSamples).toEqual(a.rendering.value.integerSamples);
    expect(b.correction!.value.whiteBalance).toBe("already-applied-upstream");expect(rawCodes(b.dng.bytes)).toEqual([0,64,512,1023]);
  });
  it("uses full active RAW support for an off-center output and snapshots correction choices before async hashing",async()=>{
    const v=input("portrait-clockwise"),c=v.reconstruction.rawFrame.capture;
    replaceCapture(v,{geometry:{...c.geometry,outputCropRect:{x:1,y:0,width:1,height:2},outputRaster:{pixelWidth:1,pixelHeight:2}},
      planes:[{...c.planes[0]!,pixelWidth:1,pixelHeight:2,storage:{kind:"inline-float64",samples:Array(6).fill(0)}}]});
    // Native output dimensions swap for the portrait view; full native reconstruction remains 2x2.
    v.correction!.state={...v.correction!.state,outputWidth:2,outputHeight:1};
    v.correction!.profile={...v.correction!.profile,state:v.correction!.state};
    const {correction:_c,...plain}=v;void _c;
    const a=await createPhotographicExportPair(plain),expected=await createPhotographicExportPair(v);
    expect(expected.rendering.value.integerSamples).toEqual(a.rendering.value.integerSamples);
    expect(expected.processedOutputView.rect).toEqual({x:0,y:0,width:1,height:2});
    expect(jpegSize(expected.jpeg.bytes)).toEqual([1,2]);
    const pending=createPhotographicExportPair(v);
    v.correction!.clippingLevel=.0001;v.correction!.selections={geometry:"off",gain:"on"};
    const actual=await pending;
    expect(actual.simulationHash).toBe(expected.simulationHash);expect(actual.jpeg.bytes).toEqual(expected.jpeg.bytes);
    expect(actual.dng.bytes).toEqual(expected.dng.bytes);
  });
  it("rejects guessed prefiltering, incomplete active coverage, unavailable support and malformed correction state",async()=>{
    const v=input();
    expect(()=>parsePhotographicExportInput({...v,correction:{...v.correction!,resampler:{...v.correction!.resampler,antialias:"source-prefiltered"}}})).toThrow();
    expect(()=>parsePhotographicExportInput({...v,correction:{...v.correction!,outputImageStateId:"photivra-export-developed"}})).toThrow();
    expect(()=>parsePhotographicExportInput({...v,correction:{...v.correction!,debug:"private"}})).toThrow();
    const shifted=input("landscape",1);shifted.correction!.invalidSupport="reject";
    await expect(createPhotographicExportPair(shifted)).rejects.toThrow();
    const wrong=input();wrong.correction!.frameTimeSeconds=123;
    await expect(createPhotographicExportPair(wrong)).rejects.toThrow();
    const narrow=input(),c=narrow.reconstruction.rawFrame.capture;
    replaceCapture(narrow,{geometry:{...c.geometry,outputCropRect:{x:0,y:0,width:1,height:2},outputRaster:{pixelWidth:1,pixelHeight:2}},
      planes:[{...c.planes[0]!,pixelWidth:1,pixelHeight:2,storage:{kind:"inline-float64",samples:Array(6).fill(0)}}]});
    narrow.reconstruction.region={x:0,y:0,width:1,height:2};
    narrow.correction!.state={...narrow.correction!.state,outputWidth:1};
    narrow.correction!.profile={...narrow.correction!.profile,state:narrow.correction!.state};
    expect(()=>parsePhotographicExportInput(narrow)).toThrow("Corrected export requires reconstruction of the full active native RAW area.");
    await expect(createPhotographicExportPair(narrow)).rejects.toThrow("Corrected export requires reconstruction of the full active native RAW area.");
  });
});
