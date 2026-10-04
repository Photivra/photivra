// SPDX-License-Identifier: Apache-2.0
import {expect,it} from "vitest";
import {calculateEnvironmentSensorPhotoSignal,simulateEnvironmentSensorRawFrame,type SceneRadianceEvaluationResult,type IdealCircularPupil} from "../src/index.js";
import {siteInput,frameInput,evaluator} from "./helpers/environment-raw-fixture.js";
import {evidence} from "./helpers/eqe-response-fixture.js";
import {createProductionImageFormationPlan} from "../src/index.js";
import {tierProductionRequest} from "./helpers/tier-production-fixture.js";
const pupil=(angularSampleCount=4):IdealCircularPupil=>({kind:'ideal-uniform-circular-pupil',radialSampleCount:1,angularSampleCount,evidence:evidence('test:owned-geometric-pupil'),limitation:'Constructed geometric pupil; no lens calibration or convergence assertion.'});
it('blocks standalone pupil integration in the production plan before provider work',()=>{
 const input=tierProductionRequest('consumer');let calls=0;
 for(const site of input.environmentCapture.capture.sites)site.environment.pupil=pupil();
 input.environmentCapture.capture.evaluateApertureRadiance=(q):SceneRadianceEvaluationResult=>{calls++;return evaluator(q,1e-9);};
 input.environmentCapture.capture.evaluateRadiance=(q):SceneRadianceEvaluationResult=>{calls++;return evaluator(q,1e-9);};
 const result=createProductionImageFormationPlan(input);
 expect(result.status).toBe('blocked');expect(result.environmentCaptureResult).toBeUndefined();expect(calls).toBe(0);
 expect(result.blockers.some(b=>b.code==='environment-capture-evaluation-blocked'&&b.message.includes('standalone'))).toBe(true);
});
it('integrates uniform radiance exactly once with normalized pupil weights and existing optical/EQE factors',()=>{
 const x=siteInput(undefined,false),baseline=calculateEnvironmentSensorPhotoSignal(x).value;
 x.pupil=pupil(16);let calls=0;
 x.evaluateApertureRadiance=(q,ray):SceneRadianceEvaluationResult=>{calls++;expect(Object.isFrozen(ray)).toBe(true);return evaluator(q);};
 const r=calculateEnvironmentSensorPhotoSignal(x).value;
 expect(calls).toBe(baseline.providerEvaluationCount*16);expect(r.providerEvaluationCount).toBe(calls);
 expect(r.photo.value.photoSignal.expectedGeneratedElectronCount/baseline.photo.value.photoSignal.expectedGeneratedElectronCount).toBeCloseTo(1,13);
 expect(r.pupilIntegrationApplied).toBe(true);expect(r.sceneVisibilityCalculated).toBe(false);
 for(const instant of r.instants)for(const e of instant.evaluations){expect(e.apertureRay).toBeDefined();expect(e.apertureRequest?.target.kind).toBe('environment-direction');}
});
it('origin-aware visibility averages original rays before sensor response without a post-RAW blur',()=>{
 const x=siteInput(undefined,false);x.pupil=pupil();x.evaluateApertureRadiance=(q,ray):SceneRadianceEvaluationResult=>evaluator(q,ray.originM.x>0?2:0);
 const r=calculateEnvironmentSensorPhotoSignal(x).value;
 delete x.pupil;delete x.evaluateApertureRadiance;
 const baseline=calculateEnvironmentSensorPhotoSignal(x).value;
 expect(r.photo.value.photoSignal.expectedGeneratedElectronCount/baseline.photo.value.photoSignal.expectedGeneratedElectronCount).toBeCloseTo(1,13);
});
it.each(['psf','missing-callback','budget','late-pupil','shared-mismatch'])('rejects invalid %s before any provider callback',fault=>{
 const x=frameInput();for(const site of x.sites)site.environment.pupil=pupil();let calls=0;
 x.evaluateRadiance=(q):SceneRadianceEvaluationResult=>{calls++;return evaluator(q,1e-9);};
 x.evaluateApertureRadiance=(q):SceneRadianceEvaluationResult=>{calls++;return evaluator(q,1e-9);};
 if(fault==='psf'){const psf=siteInput(undefined,true).psf;for(const site of x.sites)site.environment.psf=psf;}
 if(fault==='missing-callback')delete x.evaluateApertureRadiance;
 if(fault==='budget')for(const site of x.sites){site.environment.pupil=pupil(64);site.environment.pupil.radialSampleCount=4;site.environment.temporalSampleCount=256;}
 if(fault==='late-pupil')x.sites[3]!.environment.pupil!.radialSampleCount=0;
 if(fault==='shared-mismatch')x.sites[3]!.environment.pupil!.angularSampleCount=8;
 expect(()=>simulateEnvironmentSensorRawFrame(x)).toThrow();expect(calls).toBe(0);
});
it('owns the planned pupil against provider mutation and retains seeded native RAW replay',()=>{
 const x=frameInput();for(const s of x.sites)s.environment.pupil=pupil();
 x.evaluateApertureRadiance=(q):SceneRadianceEvaluationResult=>evaluator(q,1e-9);
 const expected=simulateEnvironmentSensorRawFrame(x);
 x.evaluateApertureRadiance=(q):SceneRadianceEvaluationResult=>{for(const s of x.sites)s.environment.pupil!.angularSampleCount=64;return evaluator(q,1e-9);};
 expect(simulateEnvironmentSensorRawFrame(x)).toEqual(expected);
});
