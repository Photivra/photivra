// SPDX-License-Identifier: Apache-2.0
import {describe,it,expect,vi} from "vitest";
import {createNativeRawTask,createNativeRawDevelopmentTask,calculateProcessedSensorRaw,calculateNativeRawPlan,simulateSensorRawFrame,
  createSimulatedCapture,resolveCaptureColorModel,type NativeRawDevelopmentInput,type CaptureOrientation,type NativeRawOutput,
  type SdrRenderingProfile,type ExportSensorColorProfile} from "../src/index.js";
import {developNativeRawReference} from "../src/capture/native-raw-development.js";
import {nativeRawFixture} from "./helpers/native-raw-fixture.js";
import {loadPhotographicExportInput} from "./helpers/photographic-export-fixture.js";
const noYield={yieldControl:async():Promise<void>=>{}};
function copyRaw(raw:NativeRawOutput):NativeRawOutput {
  return {plan:raw.plan,codes:raw.codes.slice(),blackLevels:raw.blackLevels.slice(),digitalSaturationCodes:raw.digitalSaturationCodes.slice(),
    saturationFlags:raw.saturationFlags.slice(),effectiveSaturationCodes:raw.effectiveSaturationCodes.slice()};
}
function cloneInput(v:NativeRawDevelopmentInput):NativeRawDevelopmentInput {return {...structuredClone({...v,raw:undefined}),raw:copyRaw(v.raw)} as NativeRawDevelopmentInput;}
async function fixture(width=2,height=2,orientation:CaptureOrientation="landscape",tileWidth?:number): Promise<{input:NativeRawDevelopmentInput;reference:ReturnType<typeof calculateProcessedSensorRaw>}> {
  const f=nativeRawFixture(width,height),exportInput=loadPhotographicExportInput();
  f.input.exposure.geometry.orientation=orientation;
  if(tileWidth!==undefined)f.input.tileWidth=tileWidth;
  if(orientation.startsWith("portrait"))f.input.exposure.geometry.outputRaster={pixelWidth:height,pixelHeight:width};
  const task=createNativeRawTask(f.input,f.provider);await task.run();const raw=task.takeOutput();
  const capture=createSimulatedCapture({...f.input.exposure,source:f.reference.frame.capture.source,planes:f.reference.frame.capture.planes.map(p=>({...p,pixelWidth:orientation.startsWith("portrait")?height:width,pixelHeight:orientation.startsWith("portrait")?width:height,storage:{kind:"inline-float64",samples:Array(width*height*p.channelIds.length).fill(0)}}))}).value;
  const frame=simulateSensorRawFrame({...f.reference,frame:{...f.reference.frame,capture,captureModeProfile:f.input.captureModeProfile,bindingProfile:f.input.bindingProfile},sites:Array.from({length:width*height},(_,i)=>f.site(i%width,Math.floor(i/width)))}).value.frame;
  exportInput.reconstruction.rawFrame=frame;exportInput.reconstruction.region={x:0,y:0,width,height};
  return {input:{raw,phaseProfiles:exportInput.reconstruction.phaseProfiles,colorProfile:exportInput.colorProfile,whiteBalance:exportInput.whiteBalance,rendering:exportInput.rendering,maximumRetainedPayloadBytes:width*height*10},reference:calculateProcessedSensorRaw({reconstruction:exportInput.reconstruction,colorProfile:exportInput.colorProfile,whiteBalance:exportInput.whiteBalance,rendering:exportInput.rendering})};
}
function mulberry32(seed:number):()=>number {
  let a=seed>>>0;return ()=>{a=(a+0x6d2b79f5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
/** r1 review camera: D65 neutral [0.45,1,0.65], i.e. not white-normalized. */
function nonSrgbProfile(base:ExportSensorColorProfile):ExportSensorColorProfile {
  const cw=[.45,1,.65];return {...base,profileId:"owned-non-normalized-test",normalizedCameraChannelsToXyz:resolveCaptureColorModel().cameraRgbToXyz.map(r=>r.map((v,i)=>v/cw[i]!))};
}
interface Synthetic {width:number;height:number;orientation:CaptureOrientation;seed:number;gains?:[number,number,number];active?:{x:number;y:number;width:number;height:number}}
function synthetic(o:Synthetic,rendering:SdrRenderingProfile,colorProfile:ExportSensorColorProfile,highlightMode:"clip"|"reconstruct"):NativeRawDevelopmentInput {
  const f=nativeRawFixture(o.width,o.height),policy=loadPhotographicExportInput(),random=mulberry32(o.seed),portrait=o.orientation.startsWith("portrait");
  const activeW=o.active?.width??o.width,activeH=o.active?.height??o.height;
  f.input.exposure.geometry={...f.input.exposure.geometry,orientation:o.orientation,...(o.active?{activeCaptureRect:o.active}:{}),
    outputRaster:portrait?{pixelWidth:activeH,pixelHeight:activeW}:{pixelWidth:activeW,pixelHeight:activeH}};
  if(o.gains)f.input.exposure.whiteBalanceIntent={stateId:"wb",source:"manual-gains",locked:true,channelGains:{red:o.gains[0],green:o.gains[1],blue:o.gains[2]},sourceProfile:null};
  const plan=calculateNativeRawPlan(f.input),n=plan.pixelCount,white=Uint16Array.from({length:4},()=>600+Math.floor(random()*424));
  const raw:NativeRawOutput={plan,codes:new Uint16Array(n),blackLevels:new Uint16Array(n),digitalSaturationCodes:new Uint16Array(n).fill(1023),saturationFlags:new Uint8Array(n),effectiveSaturationCodes:white};
  for(let i=0;i<n;i++){
    raw.blackLevels[i]=60+Math.floor(random()*8);raw.codes[i]=Math.floor(random()*1024);
    raw.saturationFlags[i]=random()<.05?1+Math.floor(random()*7):0;
  }
  return {raw,phaseProfiles:policy.reconstruction.phaseProfiles,colorProfile,whiteBalance:o.gains?"apply-resolved-sensor-gains":"not-required",rendering,highlightMode,maximumRetainedPayloadBytes:n*16};
}
const base=loadPhotographicExportInput().rendering;
const renderings:SdrRenderingProfile[]=[base,{...base,toneCurve:"positive-reinhard-per-channel",renderingExposureEv:1.5},
  {...base,toneCurve:"extended-reinhard-luminance",toneCurveParameters:{whiteLuminance:2.5},bitDepth:16},
  {...base,toneCurve:"naka-rushton-luminance",toneCurveParameters:{exponent:1.3,semiSaturation:.4,whiteLuminance:3},renderingExposureEv:-.5}];
describe("packed same-RAW development",()=>{
  it("develops explicit acquisition tile widths without changing CFA, RAW or SDR values",async()=>{
    for(const width of [1,2,3,64,256]){
      const f=await fixture(4,2,"landscape",width),before=f.input.raw.codes.slice(),task=createNativeRawDevelopmentTask(f.input,noYield);
      await task.run();const output=task.takeOutput();
      expect(output.raw.plan.tileWidth).toBe(width);
      expect(Array.from(output.integerSamples)).toEqual(f.reference.value.rendering.value.integerSamples);
      expect(output.raw.codes).toEqual(before);task.dispose();
    }
    const omitted=await fixture();expect(Object.hasOwn(omitted.input.raw.plan,"tileWidth")).toBe(false);
  });
  it("rejects forged acquisition tile counts and invalid explicit widths",async()=>{
    for(const mutation of [
      (v:NativeRawDevelopmentInput):void=>{v.raw.plan={...v.raw.plan,tileCount:v.raw.plan.tileCount+1};},
      (v:NativeRawDevelopmentInput):void=>{v.raw.plan={...v.raw.plan,tileWidth:0};},
      (v:NativeRawDevelopmentInput):void=>{v.raw.plan={...v.raw.plan,tileWidth:257};}
    ]){const f=await fixture(4,2,"landscape",1),input=cloneInput(f.input);mutation(input);
      expect(()=>createNativeRawDevelopmentTask(input,noYield)).toThrow();}
  });
  it("matches the bounded export and the per-object reference including native orientation and integer SDR",async()=>{
    for(const orientation of ["landscape","portrait-clockwise","landscape-inverted","portrait-counter-clockwise"] as const){
      const f=await fixture(4,2,orientation),reference=developNativeRawReference(f.input),before=f.input.raw.codes.slice();
      const task=createNativeRawDevelopmentTask(f.input,noYield);await task.run();const output=task.takeOutput();
      expect(Array.from(output.integerSamples)).toEqual(f.reference.value.rendering.value.integerSamples);
      expect(Array.from(output.integerSamples)).toEqual(reference.integerSamples);expect(output.highlight).toEqual(reference.highlight);
      expect({...output.diagnostics,captureSaturation:"not-consumed"}).toEqual(f.reference.value.rendering.value.diagnostics);
      expect(output.diagnostics.captureSaturation).toBe("consumed-in-raw-development");expect(output.highlight).toEqual({...f.reference.value.highlight});
      expect(output.width).toBe(f.reference.value.rendering.value.pixelWidth);expect(output.height).toBe(f.reference.value.rendering.value.pixelHeight);
      expect(output.raw.codes).toEqual(before);expect(()=>task.takeOutput()).toThrow();
    }
  });
  it("typed kernel is byte-identical to the per-object reference on seeded random RAW, policies, orientations and active offsets",async()=>{
    const policy=loadPhotographicExportInput();let seed=100,checked=0,saturated=0;
    for(const orientation of ["landscape","portrait-clockwise","landscape-inverted","portrait-counter-clockwise"] as const)
      for(const rendering of renderings)for(const highlightMode of ["clip","reconstruct"] as const)
        for(const color of [policy.colorProfile,nonSrgbProfile(policy.colorProfile)])for(const gains of [undefined,[2.1,1,1.6] as [number,number,number],[.8,1,.9] as [number,number,number]]){
          const o:Synthetic={width:6+2*(seed%3),height:4+2*(seed%2),orientation,seed:seed++,...(gains?{gains}:{})};
          if(seed%3===0)o.active={x:1,y:1,width:o.width-2,height:o.height-2};
          const input=synthetic(o,rendering,color,highlightMode),reference=developNativeRawReference(input);
          const task=createNativeRawDevelopmentTask(input,noYield);await task.run();const out=task.takeOutput();
          expect(Array.from(out.integerSamples)).toEqual(reference.integerSamples);expect(out.diagnostics).toEqual(reference.diagnostics);
          expect(out.highlight).toEqual(reference.highlight);checked++;saturated+=out.highlight.saturatedPixelCount;
        }
    expect(checked).toBe(4*4*2*2*3);expect(saturated).toBeGreaterThan(0);
  });
  it("normalizes to the per-phase effective white level and keeps clipped highlights neutral (reviews r2/r4)",async()=>{
    const policy=loadPhotographicExportInput();
    for(const color of [policy.colorProfile,nonSrgbProfile(policy.colorProfile)])for(const gains of [[2,1,1.5],[1.2,1,2.6],[.8,1,.9]] as [number,number,number][]){
      const input=synthetic({width:4,height:4,orientation:"landscape",seed:7,gains},base,color,"clip");
      input.raw.effectiveSaturationCodes.set([700,700,700,700]);input.raw.saturationFlags.fill(0);input.raw.blackLevels.fill(64);
      // Left half above the effective white (but far below the 1023 digital full scale); right half at half the effective span.
      for(let i=0;i<16;i++)input.raw.codes[i]=i%4<2?800:382;
      const task=createNativeRawDevelopmentTask(input,noYield);await task.run();const out=task.takeOutput();
      // Neutral at the smallest gain: white for gains ≥ 1, and 231 = round(255·sRGB(0.8)) for gains [0.8,1,0.9].
      const level=Math.min(...gains)>=1?255:231;
      for(const y of [0,1,2,3])expect(Array.from(out.integerSamples.slice(y*12,y*12+3))).toEqual([level,level,level]);
      expect(out.highlight.saturatedPixelCount).toBe(8);expect(out.diagnostics.captureSaturation).toBe("consumed-in-raw-development");
    }
  });
  it("transfers RAW ownership without copying and detaches the caller arrays",async()=>{
    const f=await fixture(),before=copyRaw(f.input.raw),buffer=f.input.raw.codes.buffer;
    const task=createNativeRawDevelopmentTask(f.input,noYield);
    expect(f.input.raw.codes.length).toBe(0);expect(buffer.byteLength).toBe(0);expect(f.input.raw.saturationFlags.length).toBe(0);
    await task.run();const out=task.takeOutput();
    for(const key of ["codes","blackLevels","digitalSaturationCodes","saturationFlags","effectiveSaturationCodes"] as const)expect(out.raw[key]).toEqual(before[key]);
    expect(Array.from(out.integerSamples)).toEqual(f.reference.value.rendering.value.integerSamples);expect(out.whiteBalance).toBe("not-required");
  });
  it("copies when the runtime lacks ArrayBuffer transfer",async()=>{
    const f=await fixture(),descriptor=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,"transfer")!;
    Object.defineProperty(ArrayBuffer.prototype,"transfer",{value:undefined,configurable:true,writable:true});
    try{
      const before=f.input.raw.codes.slice(),task=createNativeRawDevelopmentTask(f.input,noYield);
      expect(f.input.raw.codes).toEqual(before);f.input.raw.codes.fill(1023);
      await task.run();expect(task.takeOutput().raw.codes).toEqual(before);
    }finally{Object.defineProperty(ArrayBuffer.prototype,"transfer",descriptor);}
  });
  it("rejects incomplete halos, bad CFA source channels, storage, aliasing and stale plans at creation",async()=>{
    for(const mutation of [
      (v:NativeRawDevelopmentInput):void=>{v.phaseProfiles[0]!.profile.kernels[0]!.contributions[0]!.offsetX=-1;},
      (v:NativeRawDevelopmentInput):void=>{v.phaseProfiles[0]!.profile.kernels[0]!.contributions[0]!.sourceChannelId="blue";},
      (v:NativeRawDevelopmentInput):void=>{v.raw.codes=new Uint16Array(3);},
      (v:NativeRawDevelopmentInput):void=>{v.raw.blackLevels=v.raw.codes;},
      (v:NativeRawDevelopmentInput):void=>{v.raw.effectiveSaturationCodes=new Uint16Array(3);},
      (v:NativeRawDevelopmentInput):void=>{v.raw.plan={...v.raw.plan,pixelCount:3};},
      (v:NativeRawDevelopmentInput):void=>{v.maximumRetainedPayloadBytes=39;},
      (v:NativeRawDevelopmentInput):void=>{v.whiteBalance="apply-resolved-sensor-gains";},
      (v:NativeRawDevelopmentInput):void=>{(v as {highlightMode?:string}).highlightMode="recover";}
    ]){const f=await fixture(),v=cloneInput(f.input);mutation(v);const codes=v.raw.codes;
      expect(()=>createNativeRawDevelopmentTask(v,noYield)).toThrow();expect(codes.buffer.byteLength).toBe(codes.byteLength);}
  });
  it("rejects RAW spans, white levels and flags in run() before any output",async()=>{
    for(const mutation of [
      (v:NativeRawDevelopmentInput):void=>{v.raw.digitalSaturationCodes[0]=64;},
      (v:NativeRawDevelopmentInput):void=>{v.raw.codes[0]=1024;},
      (v:NativeRawDevelopmentInput):void=>{v.raw.saturationFlags[0]=8;},
      (v:NativeRawDevelopmentInput):void=>{v.raw.effectiveSaturationCodes[0]=64;},
      (v:NativeRawDevelopmentInput):void=>{v.raw.effectiveSaturationCodes[1]=1024;}
    ]){const f=await fixture(),v=cloneInput(f.input);mutation(v);const task=createNativeRawDevelopmentTask(v,noYield);
      await expect(task.run()).rejects.toThrow("Invalid packed RAW code span");expect(task.state).toBe("failed");expect(()=>task.takeOutput()).toThrow();}
  });
  it("accepts the deprecated bare yield function and reports tile progress",async()=>{
    const f=await fixture(600,2),progress=vi.fn(),task=createNativeRawDevelopmentTask(cloneInput(f.input),{yieldControl:async()=>{},onProgress:progress});
    expect(task.totalTileCount).toBe(6);await task.run();
    expect(progress.mock.calls.map(([p])=>p)).toEqual([1,2,3,4,5,6].map(completedTileCount=>({completedTileCount,totalTileCount:6})));
    expect(task.completedTileCount).toBe(6);
    const legacy=createNativeRawDevelopmentTask(cloneInput(f.input),async():Promise<void>=>{});await legacy.run();
    expect(legacy.takeOutput().integerSamples).toEqual(task.takeOutput().integerSamples);
    expect(()=>createNativeRawDevelopmentTask(cloneInput(f.input),{yieldControl:async()=>{},onProgress:1} as never)).toThrow();
    expect(()=>createNativeRawDevelopmentTask(cloneInput(f.input),{} as never)).toThrow();
  });
  it("cancels at host yields and never publishes partial output",async()=>{
    const f=await fixture(),task=createNativeRawDevelopmentTask(cloneInput(f.input),{yieldControl:async():Promise<void>=>{task.cancel();}});
    await expect(task.run()).rejects.toThrow();expect(task.state).toBe("cancelled");expect(()=>task.takeOutput()).toThrow();
    const idle=createNativeRawDevelopmentTask(cloneInput(f.input),noYield);idle.dispose();await expect(idle.run()).rejects.toThrow();
  });
});
