// SPDX-License-Identifier: Apache-2.0
import { expect, it } from "vitest";
import { calculateEnvironmentSensorPhotoSignal, simulateEnvironmentSensorRawFrame, createProductionImageFormationPlan,
  prepareImageFormationContext, createPhotographicExportPair, type CalculateEnvironmentSensorPhotoSignalInput,
  type SceneRadianceEvaluationResult } from "../src/index.js";
import { siteInput, frameInput, evaluator } from "./helpers/environment-raw-fixture.js";
import { evidence } from "./helpers/eqe-response-fixture.js";
import { tierProductionRequest } from "./helpers/tier-production-fixture.js";
import { loadPhotographicExportInput } from "./helpers/photographic-export-fixture.js";
const field = (r2 = -.25): CalculateEnvironmentSensorPhotoSignalInput["fieldThroughput"] => ({
  kind: "radial-illumination-vignetting", profile: { normalizationRadiusMm: 25, maximumNormalizedRadius: 1,
    coefficients: { r2, r4: 0, r6: 0 } }, evidence: evidence("test:owned-radial-field"),
  limitation: "Constructed radial profile; no named-lens calibration or pupil attenuation." });
it.each([false,true])("applies source-field throughput once before local PSF and integrates independent photon counts (psf=%s)",psf=>{
  const input=siteInput(undefined,psf), unity=calculateEnvironmentSensorPhotoSignal(input).value;
  input.fieldThroughput=field(); const result=calculateEnvironmentSensorPhotoSignal(input).value;
  const ratios=result.instants[0]!.evaluations.map((e,i)=>{
    const {x,y}=e.query.value.sourcePointImagePlaneMm, factor=1-.25*(x*x+y*y)/(25*25);
    expect(e.optics.value.sensorPlaneSpectralIrradianceWattsPerSquareMeterNanometer).toBeCloseTo(
      unity.instants[0]!.evaluations[i]!.optics.value.sensorPlaneSpectralIrradianceWattsPerSquareMeterNanometer*factor,14);
    return factor;
  });
  const average=psf ? Array.from({length:8},(_,i)=>.25*ratios[i*9+4]!+.25*ratios[i*9+5]!+.5*ratios[i*9+7]!).reduce((a,b)=>a+b,0)/8
    : ratios.reduce((a,b)=>a+b,0)/8;
  const independent=[425,475].reduce((sum,nm)=>sum+2*Math.PI/64*(.8-(nm-400)*.004)*480000e-12*50*nm*1e-9/(6.62607015e-34*299792458)*(.2+(nm-400)*.004)*.01,0)*average;
  expect(result.photo.value.photoSignal.expectedGeneratedElectronCount/independent).toBeCloseTo(1,13);
  expect(result.providerEvaluationCount).toBe(unity.providerEvaluationCount);
  expect(result.providerTransportVerified).toBe(false);
});
it("keeps sensor attenuation fixed when scene direction rotates and owns the profile against callback mutation",()=>{
  const input=siteInput(), profile=field(); input.fieldThroughput=profile;
  const expected=calculateEnvironmentSensorPhotoSignal(input);
  input.evaluateRadiance=(q):SceneRadianceEvaluationResult=>{if(profile.kind!=="unity")profile.profile.coefficients.r2=-.75;return evaluator(q);};
  expect(calculateEnvironmentSensorPhotoSignal(input)).toEqual(expected);
  for(const instant of expected.value.instants) for(const e of instant.evaluations){
    const p=e.query.value.sourcePointImagePlaneMm;
    expect(e.optics.value.fieldThroughputFactor).toBeCloseTo(1-.25*(p.x*p.x+p.y*p.y)/625,14);
  }
});
it.each(["support","amplification","negative","evidence","unknown","late-site","missing-profile","missing-coefficients"])("rejects %s over the entire support before any callback",fault=>{
  const input=frameInput(false,true);let calls=0;
  input.evaluateRadiance=(q):SceneRadianceEvaluationResult=>{calls++;return evaluator(q,1e-9);};
  for(const site of input.sites)site.environment.fieldThroughput=field();
  const selected=input.sites[fault==="late-site"?3:0]!.environment.fieldThroughput;
  if(selected.kind!=="unity"){
    if(fault==="support"||fault==="late-site")selected.profile.maximumNormalizedRadius=.001;
    if(fault==="amplification")selected.profile.coefficients.r2=.1;
    if(fault==="negative")selected.profile.coefficients.r2=-2;
    if(fault==="evidence")selected.evidence=[];
    if(fault==="unknown")Object.assign(selected,{kind:"unknown"});
    if(fault==="missing-profile")Object.assign(selected,{profile:null});
    if(fault==="missing-coefficients")Object.assign(selected.profile,{coefficients:null});
  }
  expect(()=>simulateEnvironmentSensorRawFrame(input)).toThrow();expect(calls).toBe(0);
});
it("zero-coefficient profile preserves unity arithmetic and nonzero capture produces replayable paired output",async()=>{
  const input=frameInput(), baseline=simulateEnvironmentSensorRawFrame(input);
  for(const site of input.sites)site.environment.fieldThroughput=field(0);
  const zero=simulateEnvironmentSensorRawFrame(input);
  expect(zero.value.raw).toEqual(baseline.value.raw);
  for(const site of input.sites)site.environment.fieldThroughput=field();
  const attenuated=simulateEnvironmentSensorRawFrame(input);
  expect(simulateEnvironmentSensorRawFrame(input)).toEqual(attenuated);
  attenuated.value.sites.forEach((s,i)=>expect(s.value.photo.value.photoSignal.expectedGeneratedElectronCount).toBeLessThan(baseline.value.sites[i]!.value.photo.value.photoSignal.expectedGeneratedElectronCount));
  const output=loadPhotographicExportInput();output.reconstruction.rawFrame=attenuated.value.raw.value.frame;
  const pair=await createPhotographicExportPair(output);
  expect(await createPhotographicExportPair(output)).toEqual(pair);
  expect(pair.imageDataPairing).toBe("jpeg-generated-from-exact-attached-raw");
});
it("production requires explicit vignetting fidelity and records an active effect",()=>{
  const request=tierProductionRequest("consumer"), data=request.preparedContext;
  for(const site of request.environmentCapture.capture.sites)site.environment.fieldThroughput=field();
  let calls=0;request.environmentCapture.capture.evaluateRadiance=(q):SceneRadianceEvaluationResult=>{calls++;return evaluator(q,1e-9);};
  const blocked=createProductionImageFormationPlan(request);
  expect(blocked.status).toBe("blocked");expect(calls).toBe(0);
  expect(blocked.blockers.some(b=>b.code==="environment-capture-evaluation-blocked")).toBe(true);
  request.preparedContext=prepareImageFormationContext({...data,
    renderer:{...data.renderer,supportedEffects:[...data.renderer.supportedEffects,"illumination-vignetting"]},
    fidelity:{...data.fidelity,requiredEffects:[...data.fidelity.requiredEffects,{effectId:"illumination-vignetting",modelId:"generic-radial-illumination-vignetting",modelVersion:"1.0.0"}]}});
  const plan=createProductionImageFormationPlan(request);
  expect(plan.blockers).toEqual([]);expect(plan.status).toBe("ready");expect(calls).toBeGreaterThan(0);
  expect(plan.effectPlan.find(e=>e.effectId==="illumination-vignetting")?.state).toBe("active");
  for(const site of request.environmentCapture.capture.sites)site.environment.fieldThroughput=field(0);
  expect(createProductionImageFormationPlan(request).effectPlan.find(e=>e.effectId==="illumination-vignetting")?.state).toBe("modeled-zero");
  for(const site of request.environmentCapture.capture.sites)Object.assign(site.environment.fieldThroughput,{profile:null});
  const invalid=createProductionImageFormationPlan(request);
  expect(invalid.status).toBe("blocked");
  expect(invalid.effectPlan.find(e=>e.effectId==="illumination-vignetting")?.state).toBe("blocked");
});
