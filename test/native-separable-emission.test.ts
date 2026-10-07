// SPDX-License-Identifier: Apache-2.0
import {expect,it,vi} from "vitest";
import {createNativeEnvironmentRawTask} from "../src/capture/native-environment-raw.js";
import {createExperimentalNativeSeparableEmissionTask} from "../src/api/native-separable-emission-experimental.js";
import type { NativeEnvironmentRawTile } from "../src/index.js";
import { evaluator } from "./helpers/environment-raw-fixture.js";
import { separableNativeFixture } from "./helpers/separable-native-fixture.js";

it.each([32,64,128])('streams exact original global and rolling RAW/photo results at %i rays',async rays=>{
 for(const rolling of [false,true]){const f=separableNativeFixture(rays,rolling),yieldControl=vi.fn(f.provider.yieldControl),photos:number[]=[];
 const task=createExperimentalNativeSeparableEmissionTask(f.input,{...f.provider,yieldControl,observePhotoTile:(tile):void=>{for(const s of tile.sites)photos.push(s.expectedGeneratedElectronCount);}});
 await task.run();const output=task.takeOutput();expect(Array.from(output.raw.codes)).toEqual(f.reference.value.raw.value.frame.samples.map(s=>s.rawCode));
 expect(photos).toEqual(f.reference.value.sites.map(s=>s.value.photo.value.photoSignal.expectedGeneratedElectronCount));
 expect(output.spectralCompositionCount).toBe(f.reference.value.providerEvaluationCount);expect(output.geometryEvaluationCount).toBe(output.spectralCompositionCount/2);
 expect(output.sourceSeparabilityVerified).toBe(false);expect(output.productionPlanActivated).toBe(false);expect('providerEvaluationCount' in output).toBe(false);expect(yieldControl).toHaveBeenCalled();}
},15_000);
it.each(['geometry','spectral','support','identity'])('rejects %s budget/source before any geometry callback',async fault=>{
 const f=separableNativeFixture(),evaluate=vi.fn(f.provider.evaluateGeometry);
 if(fault==='geometry')f.input.maximumGeometryEvaluations=4;
 if(fault==='spectral')f.input.maximumSpectralCompositions=4;
 if(fault==='support')f.input.contract.spectrum=[{wavelengthNanometers:1,spectralRadianceWattsPerSquareMeterSteradianNanometer:1},{wavelengthNanometers:2,spectralRadianceWattsPerSquareMeterSteradianNanometer:1}];
 if(fault==='identity')f.input.contract.sceneId='wrong';
 const task=createExperimentalNativeSeparableEmissionTask(f.input,{...f.provider,evaluateGeometry:evaluate});await expect(task.run()).rejects.toThrow();expect(evaluate).not.toHaveBeenCalled();expect(()=>task.takeOutput()).toThrow();
});
it('preserves legacy cap, geometry cap and explicit spectral ceiling',()=>{
 const f=separableNativeFixture();expect(()=>createExperimentalNativeSeparableEmissionTask({...f.input,maximumGeometryEvaluations:2000000001},f.provider)).toThrow();
 expect(()=>createExperimentalNativeSeparableEmissionTask({...f.input,maximumSpectralCompositions:4000000001},f.provider)).toThrow();
 expect(()=>createNativeEnvironmentRawTask({raw:f.input.raw,sceneBinding:f.input.sceneBinding,maximumProviderEvaluations:2000000001},{...f.provider,evaluateRadiance:q=>evaluator(q)})).toThrow();
});
it('reports attempted failing geometry and withholds partial RAW',async()=>{
 const f=separableNativeFixture(),task=createExperimentalNativeSeparableEmissionTask(f.input,{...f.provider,evaluateGeometry:()=>{throw Error('geometry failed');}});
 await expect(task.run()).rejects.toThrow('geometry failed');expect(task.geometryEvaluationCount).toBe(1);expect(task.spectralCompositionCount).toBe(0);expect(()=>task.takeOutput()).toThrow();
});
it('cancels at a host yield and retains no output',async()=>{
 const f=separableNativeFixture();const task:ReturnType<typeof createExperimentalNativeSeparableEmissionTask>=createExperimentalNativeSeparableEmissionTask(f.input,{...f.provider,yieldControl:async():Promise<void>=>{task.cancel();}});
 await expect(task.run()).rejects.toThrow('aborted');expect(task.state).toBe('cancelled');expect(()=>task.takeOutput()).toThrow();
});
it('keeps the 100000 logical tile cap even when geometry is factored across wavelengths',async()=>{
 const f=separableNativeFixture(64),read=f.provider.readTile;let calls=0;
 f.input.raw.tileWidth=2;f.input.maximumGeometryEvaluations=400000;f.input.maximumSpectralCompositions=400000;
 const provider={...f.provider,readTile:async(r:Parameters<typeof read>[0],signal:AbortSignal):Promise<NativeEnvironmentRawTile>=>{const tile=await read(r,signal);for(const site of tile.sites)site.environment.temporalSampleCount=128;return tile;},evaluateGeometry:():number=>{calls++;throw Error('admitted-geometry');}};
 const blocked=createExperimentalNativeSeparableEmissionTask(f.input,provider);await expect(blocked.run()).rejects.toThrow('query budget');expect(calls).toBe(0);
 const admitted=createExperimentalNativeSeparableEmissionTask({...f.input,raw:{...f.input.raw,tileWidth:1}},provider);await expect(admitted.run()).rejects.toThrow('admitted-geometry');expect(calls).toBe(1);expect(admitted.geometryEvaluationCount).toBe(1);expect(()=>admitted.takeOutput()).toThrow();
});
it('owns the entire contract before source callbacks and does not reuse cache across native sites',async()=>{
 const f=separableNativeFixture(),evaluate=f.provider.evaluateGeometry;let calls=0;
 const task=createExperimentalNativeSeparableEmissionTask(f.input,{...f.provider,evaluateGeometry:q=>{calls++;f.input.contract.sceneId='mutated';f.input.contract.spectrum=[];return evaluate(q);}});
 await task.run();const output=task.takeOutput();expect(calls).toBe(output.geometryEvaluationCount);expect(output.spectralCompositionCount).toBe(f.reference.value.providerEvaluationCount);
 expect(output.geometryEvaluationCount).toBe(output.spectralCompositionCount/2);
});
