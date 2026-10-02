// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { GENERIC_EQUIPMENT_TIERS, createSceneRadianceDerivedExposureMeteringSampleSet,
  parseSceneRadianceMeteringDerivationProfile, meterRelativeExposure, createExposureMeterTargetFromMeteringResult,
  setExposureCompensationOnMeterTarget, resolveAperturePriorityExposureMode, resolveGenericEquipmentTierCatalog,
  createSimulatedCapture, createProductionCaptureSnapshot, createProductionImageFormationPlan,
  createProductionPlanConsumerManifest, createPhotographicExportPair, serializeSimulatedCapture,
  type GenericEquipmentTier, type CaptureOrientation, type SceneRadianceEvaluationResult } from "../src/index.js";
import { loadBasicReferenceFixture } from "./helpers/basic-reference-fixture.js";
import { tierProductionRequest, registerTierFixture } from "./helpers/tier-production-fixture.js";
import { loadPhotographicExportInput } from "./helpers/photographic-export-fixture.js";
import { evaluator } from "./helpers/environment-raw-fixture.js";

const f=loadBasicReferenceFixture(), catalog=resolveGenericEquipmentTierCatalog({presetVersion:"1.0.0"});
const evidence=[f.provenance];
const radiance=f.target.reflectance*f.illumination.spectralIrradianceWattsPerSquareMeterNanometer/Math.PI*1e-9;
const derivation=parseSceneRadianceMeteringDerivationProfile({schemaVersion:"0.1.0",derivationId:"conformance-relative-reduction",
  scientificStatus:"approximation",method:"renderer-provided-pre-exposure-relative-reduction",spectralWeighting:"not-calibrated",
  evidence,limitation:"Owned normalized Lambertian variant; not calibrated spectral meter weighting."});

/** Same #130 camera/seed, explicit flat 540–560 nm/dimmed uniform environment and owned 2x2 sensor variant.
 * The spectrum/geometry/response are declared synthetic variants, not inferred physical calibration. */
function request(tier:GenericEquipmentTier, scale=1, compensation=0, temporal=false, orientation:CaptureOrientation="landscape"): {
  v:ReturnType<typeof tierProductionRequest>; meter:ReturnType<typeof meterRelativeExposure>;
  target:ReturnType<typeof setExposureCompensationOnMeterTarget>; originalTarget:ReturnType<typeof createExposureMeterTargetFromMeteringResult>;
  resolved:Extract<ReturnType<typeof resolveAperturePriorityExposureMode>,{status:"resolved"}>;
  sampleSet:ReturnType<typeof createSceneRadianceDerivedExposureMeteringSampleSet>; queryCount:()=>number;
} {
  const v=tierProductionRequest(tier), capture=v.environmentCapture.capture, first=capture.sites[0]!.environment;
  const body=catalog.find(p=>p.tier===tier)!.body, profile=body.metering[0]!.profile;
  const bindings=first.sceneBindings;
  const sampleSet=createSceneRadianceDerivedExposureMeteringSampleSet({measurementId:"reference-meter",sceneStateId:f.fixtureId,
    providerProfile:bindings.providerProfile,illuminationProfile:bindings.illuminationProfile,
    materialResponseProfile:bindings.materialResponseProfile,illuminationTemporalProfile:bindings.illuminationTemporalProfile!,
    captureTimeSecondsFromReference:0,captureGeometry:capture.frame.capture.resolvedGeometry,derivationProfile:derivation,
    // Normalization is explicitly supplied; it is not a conversion of physical radiance to luminance.
    samples:[{sampleId:"neutral-patch",positionOrientedCaptureUv:{u:.5,v:.5},relativeLinearSignal:profile.target.targetRelativeSignal*scale,areaWeight:1}]});
  const meter=meterRelativeExposure({profile,sampleSet});
  const originalTarget=createExposureMeterTargetFromMeteringResult({targetId:"reference-target",meterResult:meter.value});
  const target=setExposureCompensationOnMeterTarget({targetId:"compensated-target",baseTarget:originalTarget,exposureCompensationStops:compensation});
  const resolved=resolveAperturePriorityExposureMode({target,capabilities:v.preparedContext.equipmentCapabilities,
    referenceExposure:{aperture:f.lens.aperture,...f.exposure},manualAperture:f.lens.aperture,manualIso:f.exposure.iso,
    shutterQuantizationPolicy:"nearest-log2-shorter-on-tie"});
  if(resolved.status!=="resolved")throw Error("Fixture must resolve");
  const duration=resolved.resolvedSettings.shutterSeconds, old=capture.frame.capture;
  const {schemaVersion:_s,engineApiVersion:_e,resolvedGeometry:_g,equivalentFocalLength35Mm:_f,...data}=old;
  void _s;void _e;void _g;void _f;
  capture.frame.capture=createSimulatedCapture({...data,sceneStateId:f.fixtureId,exposure:{...old.exposure,...resolved.resolvedSettings},
    geometry:{...old.geometry,orientation},noise:{...old.noise,seedUint32:f.stochasticSeedUint32}}).value;
  capture.sceneBinding={...capture.sceneBinding,sceneStateId:f.fixtureId};
  capture.exposureWindow.nominalExposureDurationSeconds.value=duration;
  for(const site of capture.sites){
    const e=site.environment;
    e.sensor.localExposure.exposureWindowInput.nominalExposureDurationSeconds.value=duration;
    site.charge.completenessProfile.endOffsetSecondsFromOpeningReference=duration;
    // Reuse the shared registered waveform, with an explicit constant or ramp variant.
    const waveform=e.sceneBindings.illuminationTemporalProfile!.waveforms[0]!;
    waveform.samples=waveform.samples.map(s=>({...s,relativeMagnitudeMultiplier:temporal?1+200*s.timeSecondsFromWaveformReference:1}));
    const material=e.sceneBindings.materialResponseProfile.materials[0]!.representation;
    if(material.kind!=="spectral-wavelength-preserving-data")throw Error("Owned spectral metadata required");
    material.wavelengthRangeNanometers={minimum:540,maximum:560};
  }
  let queries=0;
  capture.evaluateRadiance=(q):SceneRadianceEvaluationResult=>{
    queries++;const r=evaluator(q);r.spectralRadianceWattsPerSquareMeterSteradianNanometer=radiance*scale*(temporal?1+200*q.timeSecondsFromExposureStart:1);return r;
  };
  const c=capture.frame.capture, previous=v.captureSnapshot;
  v.captureSnapshot=createProductionCaptureSnapshot({...previous,sceneStateId:f.fixtureId,exposure:c.exposure,
    stochasticSeedUint32:c.noise.seedUint32,temporalCapture:{...previous.temporalCapture!,orientation,
      exposureWindowInput:{...capture.exposureWindow,nativeRaster:c.geometry.nativeRaster,
        samplePointsNative:capture.sites.map((_,i)=>({x:i%2+.5,y:Math.floor(i/2)+.5}))}}});
  return {v,meter,target,originalTarget,resolved,sampleSet,queryCount:():number=>queries};
}

/** SI constants, finite-focus working f-number, declared 800x600 um rectangle and QE .4.
 * Flat single 20 nm bin integrates at 550 nm; uniform field makes spatial/rotational weights unity. */
function expectedElectrons(tier:GenericEquipmentTier,scale:number,duration:number,temporal=false):number {
  const transmission=catalog.find(p=>p.tier===tier)!.lens.matchedReference.transmission;
  const imageDistance=1/(1/f.lens.focalLengthMm-1/(1000*f.focus.distanceM));
  const workingFNumber=f.lens.aperture*(1+imageDistance/(1000*f.focus.distanceM));
  const irradiance=radiance*scale*Math.PI/(4*workingFNumber**2)*transmission;
  const integratedTime=temporal?duration+100*duration**2:duration;
  return irradiance*800*600*1e-12*20*550e-9/(6.62607015e-34*299792458)*.4*integratedTime;
}
function dngCodes(bytes:Uint8Array):number[]{
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let offset=-1;
  for(let i=0;i<view.getUint16(8,true);i++){const p=10+12*i;if(view.getUint16(p,true)===273)offset=view.getUint32(p+8,true);}
  expect(offset).toBeGreaterThan(0);return Array.from({length:4},(_,i)=>view.getUint16(offset+2*i,true));
}

describe("final merged V1 scientific conformance",()=>{
  it.each(GENERIC_EQUIPMENT_TIERS)("%s connects same-scene relative metering to physical capture and exact processed/export RAW",async tier=>{
    for(const scale of [.5,1,2]){
      const c=request(tier,scale), plan=createProductionImageFormationPlan(c.v);
      expect(c.meter.provenance.kind).toBe("approximation");
      expect(c.sampleSet.sourceContext.spectralReductionCalibrated).toBe(false);
      expect(c.resolved.resolvedSettings.shutterSeconds).toBeCloseTo(f.exposure.shutterSeconds/scale,14);
      expect(c.target.sourceMeterSnapshot.sceneStateId).toBe(f.fixtureId);
      expect(plan.status).toBe("ready");expect(plan.blockers).toEqual([]);expect(c.queryCount()).toBe(32);
      const raw=plan.environmentCaptureResult!.value.raw.value.frame;
      for(const site of plan.environmentCaptureResult!.value.sites){
        const p=site.value.photo.value.photoSignal;
        expect(p.expectedGeneratedElectronCount/expectedElectrons(tier,scale,raw.capture.exposure.shutterSeconds)).toBeCloseTo(1,13);
      }
      // Dark charge uses the resolved duration, not the original meter/reference shutter.
      plan.environmentCaptureResult!.value.raw.value.sites.forEach((s,i)=>{
        const photo=plan.environmentCaptureResult!.value.sites[i]!.value.photo.value.photoSignal;
        expect(s.accumulatedCharge.value.totalExpectedStoredElectronCount-photo.expectedGeneratedElectronCount)
          .toBeCloseTo(4*raw.capture.exposure.shutterSeconds,12);
      });
      expect(plan.processedOutputResult!.value.source.value.rawFrame).toEqual(raw);
      expect(plan.environmentCaptureResult!.value.providerTransportVerified).toBe(false);
      expect(plan.environmentCaptureResult!.value.raw.value.upstreamRadiometryVerified).toBe(false);
      const e=registerTierFixture(loadPhotographicExportInput());e.reconstruction.rawFrame=raw;e.sceneProfile={id:f.fixtureId,version:f.schemaVersion,sceneStateId:f.fixtureId};
      const pair=await createPhotographicExportPair(e);
      expect(dngCodes(pair.dng.bytes)).toEqual(raw.samples.map(s=>s.rawCode));
      expect(pair.rendering).toEqual(plan.processedOutputResult!.value.rendering);
      expect(pair.imageDataPairing).toBe("jpeg-generated-from-exact-attached-raw");
      expect(createProductionImageFormationPlan(c.v)).toEqual(plan);
      expect(await createPhotographicExportPair(e)).toEqual(pair);
    }
  });
  it.each([-1,0,1])("%s EV compensation changes capture duration/photo counts before noise without mutating the meter",stops=>{
    const c=request("prosumer",1,stops), before=JSON.stringify(c.meter), plan=createProductionImageFormationPlan(c.v);
    expect(plan.status).toBe("ready");expect(JSON.stringify(c.meter)).toBe(before);
    expect(c.originalTarget.exposureCompensationStops).toBe(0);expect(c.target.exposureCompensationStops).toBe(stops);
    const duration=f.exposure.shutterSeconds*2**stops;
    expect(c.resolved.resolvedSettings.shutterSeconds).toBe(duration);
    expect(plan.environmentCaptureResult!.value.sites[0]!.value.photo.value.photoSignal.expectedGeneratedElectronCount/
      expectedElectrons("prosumer",1,duration)).toBeCloseTo(1,13);
  });
  it("integrates registered temporal illumination before charge; equal mean light gives equal integrated photons before noise",()=>{
    const temporal=request("professional",1,0,true);
    // Freeze the meter-resolved physical duration deliberately; equal average field is a physical comparison, not AE.
    const t=temporal.v.environmentCapture.capture.frame.capture.exposure.shutterSeconds;
    // Instead of overriding committed records, use compensation to offset AE's normalized scale.
    const matched=request("professional",1+100*t,Math.log2(1+100*t));
    const a=createProductionImageFormationPlan(temporal.v), b=createProductionImageFormationPlan(matched.v);
    expect(a.status).toBe("ready");expect(b.status).toBe("ready");
    expect(a.environmentCaptureResult!.value.sites[0]!.value.photo.value.photoSignal.expectedGeneratedElectronCount/
      expectedElectrons("professional",1,t,true)).toBeCloseTo(1,13);
    a.environmentCaptureResult!.value.sites.forEach((s,i)=>expect(s.value.photo.value.photoSignal.expectedGeneratedElectronCount)
      .toBeCloseTo(b.environmentCaptureResult!.value.sites[i]!.value.photo.value.photoSignal.expectedGeneratedElectronCount,12));
  });
  it.each(["landscape","portrait-clockwise","landscape-inverted","portrait-counter-clockwise"] as const)("%s and render +1 EV preserve physical source/noise and exact consumer identity",async orientation=>{
    const c=request("prosumer",1,0,false,orientation), plain=createProductionImageFormationPlan(c.v);
    const serialized=serializeSimulatedCapture({capture:c.v.environmentCapture.capture.frame.capture});
    c.v.environmentCapture.processing.rendering={...c.v.environmentCapture.processing.rendering,renderingExposureEv:1};
    const bright=createProductionImageFormationPlan(c.v);
    expect(bright.status).toBe("ready");expect(bright.environmentCaptureResult).toEqual(plain.environmentCaptureResult);
    expect(serializeSimulatedCapture({capture:c.v.environmentCapture.capture.frame.capture})).toBe(serialized);
    const raw=bright.environmentCaptureResult!.value.raw.value.frame;
    expect(raw.capture.noise.seedUint32).toBe(f.stochasticSeedUint32);
    expect(bright.fingerprint.value).not.toBe(plain.fingerprint.value);
    bright.processedOutputResult!.value.rendering.value.toneMappedLinearSamples.forEach((value,i)=>
      expect(value).toBeCloseTo(2*plain.processedOutputResult!.value.rendering.value.toneMappedLinearSamples[i]!,13));
    for(const kind of ["reference","interactive-optimized"] as const){
      const manifest=createProductionPlanConsumerManifest({plan:bright,consumerKind:kind});
      expect(manifest.environmentCaptureResult).toBe(bright.environmentCaptureResult);
      expect(manifest.processedOutputResult).toBe(bright.processedOutputResult);
      expect(manifest.planFingerprint).toBe(bright.fingerprint.value);
    }
    const e=registerTierFixture(loadPhotographicExportInput());e.reconstruction.rawFrame=raw;e.sceneProfile={id:f.fixtureId,version:f.schemaVersion,sceneStateId:f.fixtureId};
    e.rendering={...e.rendering,renderingExposureEv:1};const pair=await createPhotographicExportPair(e);
    expect(pair.rendering).toEqual(bright.processedOutputResult!.value.rendering);
    expect(dngCodes(pair.dng.bytes)).toEqual(raw.samples.map(s=>s.rawCode));
    e.rendering={...e.rendering,renderingExposureEv:0};const neutralPair=await createPhotographicExportPair(e);
    expect(pair.rawDataUniqueId).toBe(neutralPair.rawDataUniqueId);
    expect(dngCodes(pair.dng.bytes)).toEqual(dngCodes(neutralPair.dng.bytes));
  });
  it.each(["seed","duration","tier-profile","scene","callback"])("%s ordering/identity failure blocks final processing rather than inventing a fallback",fault=>{
    const c=request("consumer"), capture=c.v.environmentCapture.capture;
    if(fault==="seed")capture.frame.capture={...capture.frame.capture,noise:{...capture.frame.capture.noise,seedUint32:f.stochasticSeedUint32+1}};
    if(fault==="duration")capture.exposureWindow.nominalExposureDurationSeconds.value*=2;
    if(fault==="tier-profile")capture.sites[0]!.environment.optics.profile.profileVersion="stale";
    if(fault==="scene")capture.sceneBinding.sceneStateId="stale";
    if(fault==="callback"){
      capture.evaluateRadiance=():SceneRadianceEvaluationResult=>{throw Error("source unavailable");};
      expect(()=>createProductionImageFormationPlan(c.v)).toThrow("source unavailable");return;
    }
    const plan=createProductionImageFormationPlan(c.v);
    expect(plan.status).toBe("blocked");expect(plan.processedOutputResult).toBeUndefined();
    expect(plan.blockers.some(b=>b.code==="environment-capture-evaluation-blocked")).toBe(true);
    expect(c.queryCount()).toBe(0);
  });
});
