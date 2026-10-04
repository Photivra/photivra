// SPDX-License-Identifier: Apache-2.0
import {describe,it,expect,vi} from "vitest";
import {createNativeEnvironmentRawTask,simulateEnvironmentSensorRawFrame,type NativeEnvironmentRawInput,type NativeEnvironmentRawProvider,
  type NativeEnvironmentRawTile} from "../src/index.js";
import {frameInput} from "./helpers/environment-raw-fixture.js";
function fixture(rolling=false):{input:NativeEnvironmentRawInput;provider:NativeEnvironmentRawProvider;reference:ReturnType<typeof simulateEnvironmentSensorRawFrame>} {
  const v=frameInput(rolling),reference=simulateEnvironmentSensorRawFrame(v),c=v.frame.capture;
  const {schemaVersion,engineApiVersion,resolvedGeometry,equivalentFocalLength35Mm,planes,...exposure}=c;
  void schemaVersion;void engineApiVersion;void resolvedGeometry;void equivalentFocalLength35Mm;void planes;
  const {capture,containerBitDepth,...frame}=v.frame;void capture;void containerBitDepth;
  const input:NativeEnvironmentRawInput={raw:{...frame,exposure,exposureWindow:v.exposureWindow,maximumOutputBytes:28},sceneBinding:v.sceneBinding,maximumProviderEvaluations:100_000};
  const provider:NativeEnvironmentRawProvider={readTile:async(r):Promise<NativeEnvironmentRawTile>=>({...r,sites:Array.from({length:r.width},(_,j)=>{
    const index=r.y*2+r.x+j,site=structuredClone(v.sites[index]!);site.environment.temporalIntegrationId=v.frame.frameId+":native:"+index;return site;
  })}),evaluateRadiance:v.evaluateRadiance,yieldControl:async():Promise<void>=>{}};
  return {input,provider,reference};
}
describe("bounded native environment RAW",()=>{
  it("matches complete reference source-to-RAW for global and native-scan shutter events",async()=>{
    for(const rolling of [false,true]){const f=fixture(rolling),task=createNativeEnvironmentRawTask(f.input,f.provider);await task.run();const output=task.takeOutput();
      expect(Array.from(output.raw.codes)).toEqual(f.reference.value.raw.value.frame.samples.map(s=>s.rawCode));
      expect(output.providerEvaluationCount).toBe(f.reference.value.providerEvaluationCount);expect(output.providerTransportVerified).toBe(false);expect(output.productionPlanActivated).toBe(false);
    }
  });
  it("keeps exact global/rolling photon expectations, RAW codes and query counts with one-site chunks",async()=>{
    for(const rolling of [false,true]){
      const f=fixture(rolling),read=vi.fn(f.provider.readTile),observed:number[]=[];
      const task=createNativeEnvironmentRawTask({...f.input,raw:{...f.input.raw,tileWidth:1}}, {...f.provider,readTile:read,
        observePhotoTile:(tile):void=>{expect(tile.width).toBe(1);for(const site of tile.sites){observed.push(site.nativeIndex);
          expect(site.expectedGeneratedElectronCount).toBe(f.reference.value.sites[site.nativeIndex]!.value.photo.value.photoSignal.expectedGeneratedElectronCount);}}});
      await task.run();const output=task.takeOutput();expect(observed).toEqual([0,1,2,3]);expect(read).toHaveBeenCalledTimes(4);
      expect(Array.from(output.raw.codes)).toEqual(f.reference.value.raw.value.frame.samples.map(s=>s.rawCode));
      expect(output.providerEvaluationCount).toBe(f.reference.value.providerEvaluationCount);expect(output.productionPlanActivated).toBe(false);
    }
  });
  it("admits dense unchanged quadrature in smaller chunks while retaining tile and event caps",async()=>{
    const f=fixture(),read=f.provider.readTile,evaluate=f.provider.evaluateRadiance;let calls=0;
    f.input.maximumProviderEvaluations=400_000;
    f.provider.evaluateRadiance=(q):ReturnType<typeof evaluate>=>{calls++;return evaluate(q);};
    f.provider.readTile=async(r,signal):Promise<NativeEnvironmentRawTile>=>{
      const tile=await read(r,signal);for(const site of tile.sites){site.environment.temporalSampleCount=128;
        site.environment.pupil={kind:"ideal-uniform-circular-pupil",radialSampleCount:4,angularSampleCount:16,
          evidence:[{sourceOrigin:"photivra",sourceReference:"test:chunk-admission-pupil",reuseStatus:"photivra-owned"}],
          limitation:"Constructed ideal pupil for admission only; no convergence or calibration claim."};}
      return tile;
    };
    f.provider.evaluateApertureRadiance=f.provider.evaluateRadiance;
    const rejected=createNativeEnvironmentRawTask(f.input,f.provider);
    await expect(rejected.run()).rejects.toThrow("query budget");expect(calls).toBe(0);expect(()=>rejected.takeOutput()).toThrow();
    const stopAtSource=():never=>{calls++;throw Error("admitted-source-execution");};
    const admitted=createNativeEnvironmentRawTask({...f.input,raw:{...f.input.raw,tileWidth:1}},{...f.provider,
      evaluateRadiance:stopAtSource,evaluateApertureRadiance:stopAtSource});
    await expect(admitted.run()).rejects.toThrow("admitted-source-execution");
    expect(calls).toBe(1);expect(admitted.providerEvaluationCount).toBe(1);expect(()=>admitted.takeOutput()).toThrow();
    calls=0;const capped=createNativeEnvironmentRawTask({...f.input,maximumProviderEvaluations:50_000,raw:{...f.input.raw,tileWidth:1}},f.provider);
    await expect(capped.run()).rejects.toThrow("query budget");expect(capped.providerEvaluationCount).toBe(0);expect(calls).toBe(0);
    expect(()=>capped.takeOutput()).toThrow();
  });
  it("rejects bad site geometry, duplicate IDs and mismatched source profiles before radiance callbacks",async()=>{
    for(const bad of ["site","id","focus","geometry","scene","budget"]){
      const f=fixture(),evaluate=vi.fn(f.provider.evaluateRadiance),read=f.provider.readTile;
      f.provider.evaluateRadiance=evaluate;
      f.provider.readTile=async(r,s):Promise<NativeEnvironmentRawTile>=>{const supplied=await read(r,s),tile=structuredClone(supplied),site=tile.sites[0]!;
        if(bad==="site")site.environment.sensor.spatialSampling.site.x=1;
        if(bad==="id")site.environment.temporalIntegrationId="duplicate";
        if(bad==="focus")site.environment.optics.nominalFNumber=3;
        if(bad==="geometry")site.environment.sensor.spatialSampling.imagingArea.widthMm=30;
        if(bad==="scene")site.environment.sceneBindings.providerProfile.sceneId="wrong";
        return tile;
      };
      if(bad==="budget")f.input.maximumProviderEvaluations=4;
      const task=createNativeEnvironmentRawTask(f.input,f.provider);await expect(task.run()).rejects.toThrow();expect(evaluate).not.toHaveBeenCalled();expect(()=>task.takeOutput()).toThrow();
    }
  });
  it("counts attempted callbacks when a source fails and withholds partial output",async()=>{
    const f=fixture(),task=createNativeEnvironmentRawTask(f.input,{...f.provider,evaluateRadiance:()=>{throw Error("source failure");}});
    await expect(task.run()).rejects.toThrow("source failure");expect(task.providerEvaluationCount).toBe(1);expect(task.state).toBe("failed");expect(()=>task.takeOutput()).toThrow();
  });
  it("exposes immutable bounded photo expectations and fails closed when observers fail",async()=>{
    const f=fixture();let seen=0;
    f.provider.observePhotoTile=(tile):void=>{seen+=tile.sites.length;expect(Object.isFrozen(tile)).toBe(true);expect(Object.isFrozen(tile.sites[0])).toBe(true);
      for(const s of tile.sites)expect(s.expectedGeneratedElectronCount).toBe(f.reference.value.sites[s.nativeIndex]!.value.photo.value.photoSignal.expectedGeneratedElectronCount);};
    const task=createNativeEnvironmentRawTask(f.input,f.provider);await task.run();expect(seen).toBe(4);task.takeOutput();
    const bad=fixture();bad.provider.observePhotoTile=():void=>{throw Error("observer failed");};const failed=createNativeEnvironmentRawTask(bad.input,bad.provider);
    await expect(failed.run()).rejects.toThrow("observer failed");expect(failed.state).toBe("failed");expect(()=>failed.takeOutput()).toThrow();
  });
  it("stops source callbacks immediately on cancellation and aborts pending photo observers",async()=>{
    const f=fixture();const task:ReturnType<typeof createNativeEnvironmentRawTask>=createNativeEnvironmentRawTask(f.input,{...f.provider,evaluateRadiance:q=>{task.cancel();return f.provider.evaluateRadiance(q);}});
    await expect(task.run()).rejects.toThrow();expect(task.providerEvaluationCount).toBe(1);expect(task.state).toBe("cancelled");expect(()=>task.takeOutput()).toThrow();
    const observed=fixture();let signal:AbortSignal|undefined,entered:()=>void=()=>{};
    const waiting=new Promise<void>(done=>{entered=done;});
    observed.provider.observePhotoTile=(_tile,s):Promise<void>=>{signal=s;entered();return new Promise<void>(done=>s.addEventListener("abort",()=>done(),{once:true}));};
    const pending=createNativeEnvironmentRawTask(observed.input,observed.provider),running=pending.run();await waiting;pending.dispose();
    await expect(running).rejects.toThrow();expect(signal!.aborted).toBe(true);expect(pending.state).toBe("disposed");expect(()=>pending.takeOutput()).toThrow();
  });
  it("rejects non-opening clocks, unbound scenes and unsupported whole-event budgets",()=>{
    const f=fixture();expect(()=>createNativeEnvironmentRawTask({...f.input,maximumProviderEvaluations:2_000_000_001},f.provider)).toThrow();
    expect(()=>createNativeEnvironmentRawTask({...f.input,sceneBinding:{...f.input.sceneBinding,sceneStateId:"wrong"}},f.provider)).toThrow();
    expect(()=>createNativeEnvironmentRawTask({...f.input,raw:{...f.input.raw,exposure:{...f.input.raw.exposure,sceneTimeSeconds:1}}},f.provider)).toThrow();
  });
});
