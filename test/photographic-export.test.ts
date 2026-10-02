// SPDX-License-Identifier: Apache-2.0

import { describe,it,expect } from "vitest";
import { createPhotographicExportPair,parsePhotographicExportInput,parseExportSensorColorProfile,
  createSimulatedCapture,createSensorRawFrame, type SimulatedCaptureInput } from "../src/index.js";
import { loadPhotographicExportInput } from "./helpers/photographic-export-fixture.js";
import { loadSensorRawFrameInput } from "./helpers/sensor-raw-frame-fixture.js";
import { encodeExportJpeg } from "../src/capture/export-jpeg.js";
import { packExportTiff,exportTiffNumbers,exportTiffRationals,exportTiffAscii } from "../src/capture/export-tiff.js";

/** Test-only TIFF parser has no serializer helpers or production tag lookup. */
function directory(bytes: Uint8Array,offset=8): Map<number,{type:number;count:number;data:Uint8Array}> {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength), result=new Map<number,{type:number;count:number;data:Uint8Array}>();
  for(let i=0;i<view.getUint16(offset,true);i++) {
    const p=offset+2+i*12,type=view.getUint16(p+2,true),count=view.getUint32(p+4,true),size=({1:1,2:1,3:2,4:4,5:8,7:1,10:8} as Record<number,number>)[type]!*count,
      start=size<=4 ? p+8 : view.getUint32(p+8,true);
    if(start+size>bytes.length) throw Error("Invalid TIFF field extent");
    result.set(view.getUint16(p,true),{type,count,data:bytes.slice(start,start+size)});
  }
  return result;
}
function uint(tags: ReturnType<typeof directory>,id:number): number {
  return new DataView(tags.get(id)!.data.buffer).getUint32(0,true);
}
function text(tags: ReturnType<typeof directory>,id:number): string { return new TextDecoder().decode(tags.get(id)!.data).replace(/\0$/,""); }
function captureInput(c: ReturnType<typeof loadPhotographicExportInput>["reconstruction"]["rawFrame"]["capture"]): SimulatedCaptureInput {
  const {schemaVersion:_s,engineApiVersion:_e,resolvedGeometry:_g,equivalentFocalLength35Mm:_f,...v}=c;
  void _s;void _e;void _g;void _f;return v;
}
describe("paired sensor RAW DNG and standalone JPEG reference export",()=>{
  it("round-trips exact post-ADC codes, pedestal/white/CFA tags and separate standard/artifact identities",async()=>{
    const v=loadPhotographicExportInput(),p=await createPhotographicExportPair(v),tags=directory(p.dng.bytes),view=new DataView(p.dng.bytes.buffer);
    expect(Array.from(p.dng.bytes.slice(0,4))).toEqual([73,73,42,0]);
    const offset=uint(tags,273),codes=Array.from({length:4},(_,i)=>view.getUint16(offset+i*2,true));
    expect(codes).toEqual([0,64,512,1023]);expect(uint(tags,50717)).toBe(1023);
    expect(Array.from(tags.get(33422)!.data)).toEqual([0,1,1,2]);expect(tags.get(50721)!.type).toBe(10);
    expect(text(tags,271)).toBe("Photivra");expect(text(tags,272)).toBe("Photivra Virtual Camera");
    expect(text(tags,50708)).toBe(p.uniqueCameraModel);expect(tags.has(50712)).toBe(false);
    const exif=directory(p.dng.bytes,uint(tags,34665));expect(text(exif,42016)).toBe(v.metadata.raw.documentId.replaceAll("-",""));
    expect(text(exif,36867)).toBe("2026:10:01 19:00:00");expect(text(exif,37521)).toBe("123");
    const xmp=text(tags,700);expect(xmp).toContain(p.simulationHash);expect(xmp).toContain(v.metadata.raw.documentId);
    expect(xmp).toContain("digitalCreation");expect(xmp).not.toContain("digitalCapture");
    expect(p.jpeg.bytes[0]).toBe(255);expect(p.jpeg.bytes[1]).toBe(216);expect(Array.from(p.jpeg.bytes.slice(-2))).toEqual([255,217]);
    expect(p.imageDataPairing).toBe("jpeg-generated-from-exact-attached-raw");expect(p.source.value.producerOriginVerified).toBe(false);
  });
  it("has deterministic bytes and simulation/RAW identities independent of save metadata",async()=>{
    const v=loadPhotographicExportInput(),a=await createPhotographicExportPair(v),b=await createPhotographicExportPair(v);
    expect(a.dng.bytes).toEqual(b.dng.bytes);expect(a.jpeg.bytes).toEqual(b.jpeg.bytes);expect(a.simulationHash).toBe(b.simulationHash);
    const changed=await createPhotographicExportPair({...v,metadata:{...v.metadata,capturedAtUtc:"2026-10-02T19:00:00.456Z"}});
    expect(changed.simulationHash).toBe(a.simulationHash);expect(changed.rawDataUniqueId).toBe(a.rawDataUniqueId);expect(changed.dng.sha256).not.toBe(a.dng.sha256);
  });
  it("changes RAW/JPEG values and simulation identity when RAW codes change, without relying on independent float planes",async()=>{
    const v=loadPhotographicExportInput(),a=await createPhotographicExportPair(v),raw=loadSensorRawFrameInput();
    raw.capture=v.reconstruction.rawFrame.capture;raw.samples[2]!.rawCode=960;raw.samples[2]!.blackSubtractedNormalizedCode=(960-64)/959;
    const b=await createPhotographicExportPair({...v,reconstruction:{...v.reconstruction,rawFrame:createSensorRawFrame(raw)}});
    expect(b.rawDataUniqueId).not.toBe(a.rawDataUniqueId);expect(b.jpeg.sha256).not.toBe(a.jpeg.sha256);expect(b.simulationHash).not.toBe(a.simulationHash);
    const c=captureInput(raw.capture);c.planes=[{...c.planes[0]!,storage:{kind:"inline-float64",samples:Array(12).fill(999)}}];
    const original=loadSensorRawFrameInput();original.capture=createSimulatedCapture(c).value;
    const p=await createPhotographicExportPair({...v,reconstruction:{...v.reconstruction,rawFrame:createSensorRawFrame(original)}});
    expect(p.rendering.value.integerSamples).toEqual(a.rendering.value.integerSamples);
  });
  it("preserves native CFA and maps active/output crop through all orientations exactly once",async()=>{
    for(const orientation of ["landscape","portrait-clockwise","landscape-inverted","portrait-counter-clockwise"] as const) {
      const v=loadPhotographicExportInput(),raw=loadSensorRawFrameInput(),c=captureInput(v.reconstruction.rawFrame.capture);
      c.geometry={...c.geometry,orientation,activeCaptureRect:{x:1,y:0,width:1,height:2},
        outputCropRect:{x:0,y:0,width:1,height:1},outputRaster:{pixelWidth:1,pixelHeight:1}};
      c.planes=[{...c.planes[0]!,pixelWidth:1,pixelHeight:1,storage:{kind:"inline-float64",samples:[0,0,0]}}];raw.capture=createSimulatedCapture(c).value;
      const p=await createPhotographicExportPair({...v,reconstruction:{...v.reconstruction,rawFrame:createSensorRawFrame(raw)}});
      expect(p.rendering.value.pixelWidth).toBe(1);expect(p.rendering.value.pixelHeight).toBe(1);
      expect(p.source.value.rawFrame.samples.map(s=>s.rawCode)).toEqual([0,64,512,1023]);expect(p.nativeDefaultCrop.x).toBe(1);
      const tags=directory(p.dng.bytes);expect(new DataView(tags.get(274)!.data.buffer).getUint16(0,true)).toBe(
        ({landscape:1,"portrait-clockwise":6,"landscape-inverted":3,"portrait-counter-clockwise":8})[orientation]);
    }
  });
  it("applies explicit camera-channel WB once while leaving stored RAW codes intact",async()=>{
    const v=loadPhotographicExportInput(),raw=loadSensorRawFrameInput(),c=captureInput(v.reconstruction.rawFrame.capture);
    c.whiteBalanceIntent={stateId:"wb",source:"manual-gains",locked:true,channelGains:{red:2,green:1,blue:.5},sourceProfile:null};
    c.planes=[{...c.planes[0]!,whiteBalanceApplication:"intent-only"}];raw.capture=createSimulatedCapture(c).value;
    const reconstruction={...v.reconstruction,rawFrame:createSensorRawFrame(raw)};
    expect(()=>parsePhotographicExportInput({...v,reconstruction})).toThrow();
    const p=await createPhotographicExportPair({...v,reconstruction,whiteBalance:"apply-resolved-sensor-gains"});
    expect(p.source.value.rawFrame.samples.map(s=>s.rawCode)).toEqual([0,64,512,1023]);
    expect(p.rendering.value.whiteBalanceHandling).toBe("already-applied-upstream");
    expect(p.rendering.value.toneMappedLinearSamples[2]!).toBeCloseTo(.5,12);
  });
  it("rejects guessed/mismatched/singular or nonreusable color profiles and unsupported output/metadata",async()=>{
    const v=loadPhotographicExportInput();
    for(const patch of [{scientificStatus:"calibrated"},{referenceIlluminant:"D50"},{normalizedCameraChannelsToXyz:[[1,0,0],[1,0,0],[1,0,0]]},
      {normalizedCameraChannelsToXyz:[[NaN,0,0],[0,1,0],[0,0,1]]},{evidence:[{sourceOrigin:"third-party",sourceReference:"public-only",reuseStatus:"factual-reference-only"}]},
      {debug:"/private"},{limitations:[]}]) expect(()=>parseExportSensorColorProfile({...v.colorProfile,...patch})).toThrow();
    for(const patch of [{colorProfile:{...v.colorProfile,colorSamplingProfileId:"other"}},{whiteBalance:"auto"},{jpegQuantizationStep:0},
      {rendering:{...v.rendering,bitDepth:16}},{metadata:{...v.metadata,gps:"private"}},{sceneProfile:{...v.sceneProfile,sceneStateId:"other"}}]) {
      expect(()=>parsePhotographicExportInput({...v,...patch})).toThrow();
    }
    const raw=loadSensorRawFrameInput(),c=captureInput(v.reconstruction.rawFrame.capture);
    c.geometry={...c.geometry,outputRaster:{pixelWidth:1,pixelHeight:1}};c.planes=[{...c.planes[0]!,pixelWidth:1,pixelHeight:1,storage:{kind:"inline-float64",samples:[0,0,0]}}];
    raw.capture=createSimulatedCapture(c).value;
    const resampled={...v,reconstruction:{...v.reconstruction,rawFrame:createSensorRawFrame(raw)}};
    expect(()=>parsePhotographicExportInput(resampled)).toThrow("1:1 output crop sampling");
    await expect(createPhotographicExportPair(resampled)).rejects.toThrow("1:1 output crop sampling");
  });
  it("fails on uncovered final crop and inconsistent RAW black/white metadata instead of guessing",async()=>{
    const v=loadPhotographicExportInput();
    const uncovered={...v,reconstruction:{...v.reconstruction,region:{x:1,y:1,width:1,height:1}}};
    expect(()=>parsePhotographicExportInput(uncovered)).toThrow("Reconstruction does not cover the exact declared final native crop.");
    await expect(createPhotographicExportPair(uncovered)).rejects.toThrow("Reconstruction does not cover the exact declared final native crop.");
    const raw=loadSensorRawFrameInput();raw.capture=v.reconstruction.rawFrame.capture;
    raw.samples[0]!.digitalSaturationCode=2047;raw.samples[0]!.blackSubtractedNormalizedCode=(0-64)/(2047-64);
    await expect(createPhotographicExportPair({...v,reconstruction:{...v.reconstruction,rawFrame:createSensorRawFrame(raw)}})).rejects.toThrow();
    expect(()=>parsePhotographicExportInput(null)).toThrow();
  });
  it("enforces encoder bounds, rational/ASCII range and metadata limits without weakening format gates",()=>{
    const base={width:1,height:1,samples:[0,0,0],quantizationStep:1,exif:new Uint8Array(),xmp:new Uint8Array()};
    for(const patch of [{samples:[NaN,0,0]},{width:0},{quantizationStep:256},{xmp:new Uint8Array(65534)}]) expect(()=>encodeExportJpeg({...base,...patch})).toThrow();
    expect(()=>exportTiffNumbers(1,3,[65536])).toThrow();expect(()=>exportTiffRationals(1,false,[-1])).toThrow();
    expect(()=>exportTiffRationals(1,true,[1e20])).toThrow();expect(()=>exportTiffAscii(1,"private\0path")).toThrow();
    const t=exportTiffNumbers(1,4,[1]);expect(()=>packExportTiff([t,t],[])).toThrow();
  });
});
