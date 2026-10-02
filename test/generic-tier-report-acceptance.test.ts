// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GENERIC_EQUIPMENT_TIERS, resolveGenericEquipmentTierCatalog, resolveManualFlashSync,
  calculateLensStrayLightIrradiance, createManualFlashIlluminationOverlay,
  integrateSceneIlluminationTemporalMultiplierOverExposureWindow
} from "../src/index.js";
import { createTierAcceptanceReport, tierCorrectionCase, tierStabilizationCase, tierFlashCase, tierProfiles,
  type TierAcceptanceReport } from "./helpers/tier-acceptance-report.js";
import { sceneOpticalInput } from "./helpers/scene-optical-quadrature-fixture.js";
import { loadBasicReferenceFixture } from "./helpers/basic-reference-fixture.js";

const fixture=JSON.parse(readFileSync(new URL("./fixtures/tier-acceptance-envelopes-v1.json",import.meta.url),"utf8")) as {
  fixtureVersion:string;sceneId:string;presetVersion:string;catalogSha256:string;
  common:{energyTolerance:number;peakFraction:number[];outerSampleEnergyFraction:number[];textureContrastAt100CyclesPerMm:number[];
    covarianceSquareMicrometers:number[];shiftedRetainedFraction:number[];maximumResidualDisplacementMm:number;maximumResidualCaMm:number;
    minimumJacobianDeterminant:number;maximumOutputMagnification:number};
  tiers:Record<string,{cornerCaSeparationMm:number[];cornerIllumination:number[];cornerGainOnlyVarianceRatio:number[];cornerInFocusPeakFraction:number[]}>;
};
const report=createTierAcceptanceReport();
const base=loadBasicReferenceFixture();
function within(value:number,range:readonly number[]):void{
  expect(value).toBeGreaterThanOrEqual(range[0]!);expect(value).toBeLessThanOrEqual(range[1]!);
}
/** Compare every review-artifact field while allowing twelve-digit display rounding. */
function compareReport(actual:unknown,committed:unknown):void{
  if(typeof actual==="number"){
    expect(typeof committed).toBe("number");expect(Number.isFinite(actual)).toBe(true);
    expect(Math.abs(actual-(committed as number))).toBeLessThanOrEqual(1e-10*Math.max(1,Math.abs(actual)));
  }else if(Array.isArray(actual)){
    expect(Array.isArray(committed)).toBe(true);expect((committed as unknown[]).length).toBe(actual.length);
    actual.forEach((value,i)=>compareReport(value,(committed as unknown[])[i]));
  }else if(actual!==null&&typeof actual==="object"){
    expect(committed).not.toBeNull();expect(typeof committed).toBe("object");
    const a=actual as Record<string,unknown>,b=committed as Record<string,unknown>;
    expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort());
    for(const key of Object.keys(a))compareReport(a[key],b[key]);
  }else expect(committed).toEqual(actual);
}
describe("versioned matched tier report acceptance",()=>{
  it("binds all reports to exact versions, a common canonical state and reproducible inputs",()=>{
    expect(report.reportVersion).toBe(fixture.fixtureVersion);expect(report.sceneId).toBe(fixture.sceneId);
    expect(report.catalogSha256).toBe(fixture.catalogSha256);expect(report.presetVersion).toBe(fixture.presetVersion);
    expect(report.baseFixtureId).toBe(base.fixtureId);expect(report.seedUint32).toBe(base.stochasticSeedUint32);
    expect(report.sensorGeometry).toEqual(base.sensor.imagingArea);expect(report.tiers.map(t=>t.tier)).toEqual(GENERIC_EQUIPMENT_TIERS);
    expect(createTierAcceptanceReport()).toEqual(report);
    // Committed report is a review artifact, compared with tolerances, never an image golden gate.
    const committed=JSON.parse(readFileSync(new URL("../docs/validation/tier-acceptance-report-v1.json",import.meta.url),"utf8")) as TierAcceptanceReport;
    compareReport(report,committed);
  });
  it.each(GENERIC_EQUIPMENT_TIERS)("%s multidimensional finite pupil diagnostics remain in their versioned envelopes",tier=>{
    const t=report.tiers.find(t=>t.tier===tier)!, f=fixture.tiers[tier]!, c=fixture.common;
    expect(t.physical.pupilResponses).toHaveLength(9);
    for(const p of t.physical.pupilResponses){
      expect(Math.abs(p.energy-1)).toBeLessThan(c.energyTolerance);
      within(p.peakFraction,c.peakFraction);within(p.outerSampleEnergyFraction,c.outerSampleEnergyFraction);
      within(p.covarianceSquareMicrometers.xx,c.covarianceSquareMicrometers);within(p.covarianceSquareMicrometers.yy,c.covarianceSquareMicrometers);
      for(const value of Object.values(p.textureContrastAt100CyclesPerMm))within(value,c.textureContrastAt100CyclesPerMm);
      expect(p.relativePupilThroughputFactor).toBeGreaterThan(0);expect(p.relativePupilThroughputFactor).toBeLessThanOrEqual(1);
    }
    within(t.physical.pupilResponses[7]!.peakFraction,f.cornerInFocusPeakFraction);
    within(t.physical.cornerCaSeparationMm,f.cornerCaSeparationMm);within(t.physical.cornerIllumination,f.cornerIllumination);
    within(t.correctionCosts.cornerGainOnlyVarianceRatio,f.cornerGainOnlyVarianceRatio);
    expect(t.corrected.maximumResidualDisplacementMm).toBeLessThan(c.maximumResidualDisplacementMm);
    expect(t.corrected.maximumResidualCaMm).toBeLessThan(c.maximumResidualCaMm);
    expect(t.correctionCosts.minimumJacobianDeterminant).toBeGreaterThan(c.minimumJacobianDeterminant);
    expect(t.correctionCosts.maximumOutputMagnification).toBeLessThan(c.maximumOutputMagnification);
    within(t.correctionCosts.shiftedRetainedFraction,c.shiftedRetainedFraction);
  });
  it("enforces curated tradeoffs rather than universal Professional dominance",()=>{
    const [consumer,prosumer,professional]=report.tiers;
    expect(professional!.physical.cornerIllumination).toBeLessThan(prosumer!.physical.cornerIllumination);
    expect(professional!.correctionCosts.cornerGainOnlyVarianceRatio).toBeGreaterThan(prosumer!.correctionCosts.cornerGainOnlyVarianceRatio);
    expect(consumer!.correctionCosts.maximumOutputMagnification).toBeGreaterThan(professional!.correctionCosts.maximumOutputMagnification);
    expect(professional!.physical.pupilResponses[0]!.textureContrastAt100CyclesPerMm.horizontal)
      .toBeLessThan(prosumer!.physical.pupilResponses[0]!.textureContrastAt100CyclesPerMm.horizontal);
    expect(professional!.physical.pupilResponses[0]!.peakFraction).not.toBeCloseTo(professional!.physical.pupilResponses[2]!.peakFraction,3);
    expect(consumer!.physical.pupilResponses[4]!.covarianceSquareMicrometers.xx).not.toBeCloseTo(consumer!.physical.pupilResponses[4]!.covarianceSquareMicrometers.yy,3);
  });
  it.each(GENERIC_EQUIPMENT_TIERS)("%s correction forks one frozen physical sampled edge and noise array",tier=>{
    const v=tierCorrectionCase(tier), before=JSON.stringify(v.capture), t=report.tiers.find(t=>t.tier===tier)!;
    expect(Object.isFrozen(v.capture)).toBe(true);expect(Object.isFrozen(v.capture.channels.red)).toBe(true);
    expect(v.off.channels.green).toEqual(v.capture.channels.green);expect(v.on.captureId).toBe(v.off.captureId);
    expect(v.on.noiseRealizationId).toBe(v.off.noiseRealizationId);expect(v.on.timeSeconds).toBe(v.off.timeSeconds);
    expect(v.on.channels.green).not.toEqual(v.off.channels.green);expect(JSON.stringify(v.capture)).toBe(before);
    expect(t.correctionCosts.cornerGainOnlyVarianceRatio).toBeCloseTo(t.correctionCosts.cornerGain**2,12);
    for(const [i,valid] of v.shifted.validSourceMask.entries())if(!valid)for(const channel of ["red","green","blue"] as const)
      expect(v.shifted.channels[channel][i]).toBeNull();
    const crop=v.shifted.jointCrop!;
    for(let y=crop.y;y<crop.y+crop.height;y++)for(let x=crop.x;x<crop.x+crop.width;x++)expect(v.shifted.validSourceMask[y*9+x]).toBe(true);
    // Independently reconstruct bilinear and gain application to the already sampled edge.
    for(let i=0;i<81;i++){
      const p=v.on.samplingPlans.green!.points[i]!.sourcePointMm,x=p.x/3+4,y=4-p.y/3;
      const left=Math.floor(x),top=Math.floor(y),dx=x-left,dy=y-top,right=dx===0?left:left+1,bottom=dy===0?top:top+1;
      const samples=v.capture.channels.green;
      const interpolated=(1-dy)*((1-dx)*samples[top*9+left]!+dx*samples[top*9+right]!)+dy*((1-dx)*samples[bottom*9+left]!+dx*samples[bottom*9+right]!);
      const a=resolveGenericEquipmentTierCatalog({presetVersion:"1.0.0"}).find(t=>t.tier===tier)!.lens.matchedReference;
      const destination={x:(i%9-4)*3,y:(4-Math.floor(i/9))*3};
      const gain=(1+a.vignettingR2*(destination.x**2+destination.y**2)/a.normalizationRadiusMm**2)**(-a.correctionGainStrength);
      expect(v.on.channels.green[i]).toBeCloseTo(interpolated*gain,12);
    }
  });
  it.each(GENERIC_EQUIPMENT_TIERS)("%s independently predicts delayed signed-axis stabilization and limits",tier=>{
    for(const scale of [1,-1,20,-20]){
      const {profile,disturbance,result}=tierStabilizationCase(tier,scale);
      for(const sample of result.samples)for(const axis of sample.axes){
        const response=profile.axisResponses.find(a=>a.axis===axis.axis)!;
        const slope=({pitch:.004,yaw:.002,roll:.001}[axis.axis])*scale/base.exposure.shutterSeconds;
        const delayed=slope*Math.max(0,sample.timeSecondsFromCaptureReference-response.latencySeconds.value);
        const desired=delayed*response.correctionGain.value,limit=response.maximumCorrectionAngleRad.value;
        const applied=Math.max(-limit,Math.min(limit,desired));
        expect(axis.appliedCorrectionAngleRad).toBeCloseTo(applied,12);
        expect(axis.residualAngleRad).toBeCloseTo(slope*sample.timeSecondsFromCaptureReference-applied,12);
        expect(axis.correctionLimitReached).toBe(Math.abs(desired)>limit);
        expect(axis.bypassedForDeclaredPan).toBe(false);
      }
      expect(result.samples[1]!.appliedCorrectionAngularDisplacementRad).toEqual({pitch:0,yaw:0,roll:0});
      expect(result.translationCorrectionModeled).toBe(false);expect(result.digitalStabilizationApplied).toBe(false);
      for(const value of Object.values(disturbance.samples[0]!.angularDisplacementRad))expect(Math.abs(value)).toBe(0);
    }
    expect(()=>tierStabilizationCase(tier,Number.NaN)).toThrow();
  });
  it.each(GENERIC_EQUIPMENT_TIERS)("%s flash placement follows exposure scans, not its data-readout duration",tier=>{
    const v=tierFlashCase(tier);
    expect(v.front.pulseStartSecondsFromCaptureReference).toBeCloseTo(.002,12);
    expect(v.rear.pulseStartSecondsFromCaptureReference).toBeCloseTo(base.exposure.shutterSeconds-.002,12);
    expect(v.front.sensorReadoutTimingUsedAsExposureTiming).toBe(false);
    expect(v.front.exposureSettingsModified).toBe(false);expect(v.front.ttlModeled).toBe(false);
    expect(v.timing.readoutTiming.captureReadoutDurationSeconds.value).not.toBe(.002);
    expect(()=>tierFlashCase(tier,.001)).toThrow("no whole-frame-open interval");
    expect(()=>tierFlashCase(tier,base.exposure.shutterSeconds,.007)).toThrow("does not fit inside");
    expect(()=>resolveManualFlashSync({flashEnabled:true,flashProfile:v.flash,timing:v.timing,syncCapabilities:v.capabilities,syncMode:"high-speed-sync"})).toThrow();
    expect(()=>resolveManualFlashSync({flashEnabled:true,flashProfile:v.flash,timing:v.timing,syncCapabilities:{...v.capabilities,timingProfileId:"stale"},syncMode:"front-curtain"})).toThrow();
    for(const sync of [v.front,v.rear]){
      const overlay=createManualFlashIlluminationOverlay({baseIlluminationProfile:sceneOpticalInput().sceneBindings.illuminationProfile,
        flashProfile:v.flash,resolvedSync:sync,illuminationProfileId:"tier-report-with-flash",temporalProfileId:"tier-report-flash-clock"});
      for(let sampleIndex=0;sampleIndex<v.timing.exposureWindows.samples.length;sampleIndex++){
      const integrated=integrateSceneIlluminationTemporalMultiplierOverExposureWindow({
        illuminationProfile:overlay.illuminationProfile,temporalProfile:overlay.temporalProfile!,sourceId:v.flash.sourceTemplate.sourceId,
        exposureWindows:v.timing.exposureWindows,sampleIndex,temporalSampleCount:64});
      expect(integrated.integratedRelativeMagnitudeSeconds).toBeCloseTo(.001,12);
      }
    }
  });
  it.each(GENERIC_EQUIPMENT_TIERS)("%s independently predicts admitted in-frame/off-frame ghost and veil",tier=>{
    const p=tierProfiles(tier);
    for(const angle of [0,50])for(const admittedFraction of [0,1]){
      const result=calculateLensStrayLightIrradiance({profile:p.stray,state:p.state,enabled:true,imagePointMm:{x:0,y:0},wavelengthNm:550,wavelengthBasis:"vacuum",
        timeSeconds:base.exposure.shutterSeconds,primarySpectralIrradianceWPerM2PerNm:1,sources:[{id:"bright",fieldAngleXDegrees:angle,fieldAngleYDegrees:0,
          incidentSpectralPowerWPerNm:.001,admittedFraction}],meterDomain:"primary-only"}).value;
      for(const kind of ["ghost","veil"] as const){
        const response=p.stray.responses.find(r=>r.kind===kind)!,cx=response.offsetMm.x+response.centroidMmPerDegree[0]*angle,cy=response.offsetMm.y+response.centroidMmPerDegree[2]*angle;
        const expected=.001*admittedFraction*response.axisPowerFraction*(1+response.angularSlope*(angle/60)**2)
          *Math.exp(-(cx*cx+cy*cy)/(2*response.sigmaMm**2))/(2*Math.PI*response.sigmaMm**2)*1e6;
        expect(kind==="ghost"?result.ghostSpectralIrradianceWPerM2PerNm:result.veilSpectralIrradianceWPerM2PerNm).toBeCloseTo(expected,12);
      }
      expect(result.meterSpectralIrradianceWPerM2PerNm).toBe(1);
      expect(result.totalSpectralIrradianceWPerM2PerNm).toBe(1+result.ghostSpectralIrradianceWPerM2PerNm+result.veilSpectralIrradianceWPerM2PerNm);
    }
  });
});
