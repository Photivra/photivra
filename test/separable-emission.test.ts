// SPDX-License-Identifier: Apache-2.0
import { expect, it } from "vitest";
import { calculateSeparableEmissionPhotoSignal, type SeparableEmissionContract } from "../src/api/separable-emission-experimental.js";
import { calculateEnvironmentSensorPhotoSignal, type CalculateEnvironmentSensorPhotoSignalInput, type SceneRadianceEvaluationResult } from "../src/index.js";
import { siteInput, evaluator } from "./helpers/environment-raw-fixture.js";
import { evidence } from "./helpers/eqe-response-fixture.js";
function data(input:ReturnType<typeof siteInput>):Omit<CalculateEnvironmentSensorPhotoSignalInput,"evaluateRadiance"|"evaluateApertureRadiance"> {
 const {evaluateRadiance,evaluateApertureRadiance,...owned}=input;void evaluateRadiance;void evaluateApertureRadiance;return owned;
}
function fixture(rays=32):{input:CalculateEnvironmentSensorPhotoSignalInput;contract:SeparableEmissionContract} {
 const input=siteInput(undefined,false);
 input.pupil={kind:"ideal-uniform-circular-pupil",radialSampleCount:rays/16,angularSampleCount:16,evidence:evidence("test:emission-pupil"),limitation:"Synthetic ideal pupil only."};
 const p=input.sceneBindings.providerProfile;
 const contract:SeparableEmissionContract={schemaVersion:"0.1.0",kind:"uniform-spectrum-achromatic-ideal-emission",providerProfileId:p.profileId,sceneId:p.sceneId,illuminationProfileId:p.illuminationProfileId,materialResponseProfileId:p.materialResponseProfileId,wavelengthBasis:input.sensor.spectralSampling.wavelengthBasis === "air" ? "air" : "vacuum",spectrum:[{wavelengthNanometers:1,spectralRadianceWattsPerSquareMeterSteradianNanometer:1},{wavelengthNanometers:2000,spectralRadianceWattsPerSquareMeterSteradianNanometer:1}],evidence:evidence("test:ideal-emission"),limitation:"Owned synthetic analytic uniform-spectrum emitter, not calibrated."};
 return {input,contract};
}
it.each([32,64,128])('retains independent legacy photon/electron parity at %i rays with an origin occlusion edge',rays=>{
 const {input,contract}=fixture(rays);
 input.evaluateApertureRadiance=(q,ray):SceneRadianceEvaluationResult=>evaluator(q,ray.originM.x>0?2:0);
 const legacy=calculateEnvironmentSensorPhotoSignal(input).value;
 const result=calculateSeparableEmissionPhotoSignal(data(input),contract,q=>{
  expect(Object.isFrozen(q)).toBe(true);expect('wavelengthNanometers' in q).toBe(false);
  return (q.apertureRay.originM.x>0?2:0)*(1+200*q.timeSecondsFromExposureStart);
 });
 expect(result.photoSignal.value.photo.value.photoSignal).toEqual(legacy.photo.value.photoSignal);
 expect(result.work.spectralCompositionCount).toBe(legacy.providerEvaluationCount);
 expect(result.work.geometryEvaluationCount).toBe(result.work.spectralCompositionCount/new Set(legacy.instants.flatMap(i=>i.evaluations.map(e=>e.result.wavelengthNanometers))).size);
 expect(result.photoSignal.value.instants.flatMap(i=>i.evaluations).map(e=>e.apertureRay)).toEqual(legacy.instants.flatMap(i=>i.evaluations).map(e=>e.apertureRay));
});
it.each(['kind','basis','provider','support','psf','pupil','spectrum','extra'])('rejects incompatible %s before geometric work',fault=>{
 const {input,contract}=fixture();let calls=0;
 if(fault==='kind')Object.assign(contract,{kind:'wavelength-dependent-visibility'});
 if(fault==='basis')contract.wavelengthBasis=contract.wavelengthBasis==='air'?'vacuum':'air';
 if(fault==='provider')contract.providerProfileId='wrong';
 if(fault==='support')contract.spectrum=[{wavelengthNanometers:1,spectralRadianceWattsPerSquareMeterSteradianNanometer:1},{wavelengthNanometers:2,spectralRadianceWattsPerSquareMeterSteradianNanometer:1}];
 if(fault==='psf')input.psf=siteInput().psf;
 if(fault==='pupil')delete input.pupil;
 if(fault==='spectrum')contract.spectrum=[{wavelengthNanometers:2,spectralRadianceWattsPerSquareMeterSteradianNanometer:1},{wavelengthNanometers:1,spectralRadianceWattsPerSquareMeterSteradianNanometer:1}];
 if(fault==='extra')Object.assign(contract,{evaluateRadiance:()=>1});
 expect(()=>calculateSeparableEmissionPhotoSignal(data(input),contract,()=>{calls++;return 1;})).toThrow();expect(calls).toBe(0);
});
it.each([NaN,Infinity,-1,undefined])('rejects malformed geometry factor %s',factor=>{
 const {input,contract}=fixture();expect(()=>calculateSeparableEmissionPhotoSignal(data(input),contract,()=>factor as number)).toThrow();
});
it('cancels before work and immediately after a callback without returning output',()=>{
 const {input,contract}=fixture();const controller=new AbortController();controller.abort();let calls=0;
 expect(()=>calculateSeparableEmissionPhotoSignal(data(input),contract,()=>{calls++;return 1;},controller.signal)).toThrow();expect(calls).toBe(0);
 const active=new AbortController();expect(()=>calculateSeparableEmissionPhotoSignal(data(input),contract,()=>{calls++;active.abort();return 1;},active.signal)).toThrow();expect(calls).toBe(1);
});
it('does not silently reproduce a wavelength-dependent visibility source',()=>{
 const {input,contract}=fixture();input.evaluateApertureRadiance=(q,ray):SceneRadianceEvaluationResult=>evaluator(q,ray.originM.x>0?(q.wavelengthNanometers>550?2:1):0);
 const legacy=calculateEnvironmentSensorPhotoSignal(input).value;
 const separable=calculateSeparableEmissionPhotoSignal(data(input),contract,q=>(q.apertureRay.originM.x>0?2:0)*(1+200*q.timeSecondsFromExposureStart));
 expect(separable.photoSignal.value.photo.value.photoSignal.expectedIncidentPhotonCount).not.toBe(legacy.photo.value.photoSignal.expectedIncidentPhotonCount);
 expect(separable.work.sourceSeparabilityVerified).toBe(false);
});
