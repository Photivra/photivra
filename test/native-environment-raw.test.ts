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
  it("rejects non-opening clocks, unbound scenes and unsupported whole-event budgets",()=>{
    const f=fixture();expect(()=>createNativeEnvironmentRawTask({...f.input,maximumProviderEvaluations:2_000_000_001},f.provider)).toThrow();
    expect(()=>createNativeEnvironmentRawTask({...f.input,sceneBinding:{...f.input.sceneBinding,sceneStateId:"wrong"}},f.provider)).toThrow();
    expect(()=>createNativeEnvironmentRawTask({...f.input,raw:{...f.input.raw,exposure:{...f.input.raw.exposure,sceneTimeSeconds:1}}},f.provider)).toThrow();
  });
});
