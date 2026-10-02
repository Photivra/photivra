// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { GENERIC_EQUIPMENT_TIERS, resolveGenericEquipmentTierCatalog, createGenericEquipmentTierSelection,
  resolveGenericEquipmentTierLensProfiles, resolveGenericEquipmentExposureCapabilities, resolveGenericIsoSignalChain,
  createSimulatedCapture, prepareImageFormationContext, createProductionCaptureSnapshot, createProductionImageFormationPlan,
  createProductionPlanConsumerManifest, getImageFormationContract, simulateEnvironmentSensorRawFrame,
  calculateLensComplexPupilPsf, calculateLensCorrectedCapture, resolveLensCorrectionPlan, createPhotographicExportPair,
  type GenericEquipmentTier, type LensComplexPupilProfile, type CreateProductionImageFormationPlanInput, type SceneRadianceEvaluationResult
} from "../src/index.js";
import { frameInput, evaluator } from "./helpers/environment-raw-fixture.js";
import { loadPhotographicExportInput } from "./helpers/photographic-export-fixture.js";
import { loadBasicReferenceFixture } from "./helpers/basic-reference-fixture.js";

const base = loadBasicReferenceFixture();
const catalog = resolveGenericEquipmentTierCatalog({ presetVersion: "1.0.0" });
function lens(bodyTier: GenericEquipmentTier, lensTier = bodyTier, size = 2): ReturnType<typeof resolveGenericEquipmentTierLensProfiles> {
  return resolveGenericEquipmentTierLensProfiles({selection:createGenericEquipmentTierSelection({presetVersion:"1.0.0",bodyTier,lensTier}),
    state:{bodyId:`photivra-${bodyTier}-body`,bodyVersion:"1.0.0",lensId:`photivra-${lensTier}-prime`,lensVersion:"1.0.0",
      focalLengthMm:base.lens.focalLengthMm,aperture:base.lens.aperture,focusDistanceM:base.focus.distanceM,
      captureMode:"still",frameRateHz:0,stabilizationMode:"off",outputWidth:size,outputHeight:size}});
}
/** Register the owned topology explicitly; no geometry, CFA or spectral response is inferred from a tier. */
function register<T>(v:T):T {
  return JSON.parse(JSON.stringify(v).replaceAll('"cfa"','"photivra-generic-bayer"').replaceAll('"native"','"native-still"')) as T;
}
function request(bodyTier:GenericEquipmentTier,lensTier=bodyTier,iso=100): CreateProductionImageFormationPlanInput & {environmentCapture: Required<NonNullable<CreateProductionImageFormationPlanInput["environmentCapture"]>>} {
  const original=frameInput(false,false), capture=register(original), p=lens(bodyTier,lensTier), body=catalog.find(p=>p.tier===bodyTier)!.body;
  // Exposure capability IDs and selected lens IDs are different contracts.
  // Explicit fixture bridge retains the exact transmission values and provenance.
  const bridge={...p.transmission,profileId:p.transmission.profileId+":production-fixture",profileVersion:"1",
    lensProfileId:catalog.find(a=>a.tier===lensTier)!.lens.exposure.profileId};
  capture.evaluateRadiance=(q):SceneRadianceEvaluationResult=>evaluator(q,1e-9);
  const c=capture.frame.capture;
  const {schemaVersion:_s,engineApiVersion:_e,resolvedGeometry:_g,equivalentFocalLength35Mm:_f,...data}=c;
  void _s;void _e;void _g;void _f;
  capture.frame.capture=createSimulatedCapture({...data,exposure:{...c.exposure,iso}}).value;
  for(const site of capture.sites){
    site.environment.optics.profile=structuredClone(bridge);
    site.environment.motion.angularVelocityRadPerSec={pitch:0,yaw:0,roll:0};
    const sensor=site.environment.sensor;
    const limitation="Owned synthetic response for integration, not measured tier calibration.";
    sensor.responseApplication.applicationProfile.spatialResponseModel={kind:"uniform-over-geometric-sensitive-aperture",
      scientificStatus:"approximation",evidence:sensor.colorSamplingProfile.evidence,limitation};
    sensor.operatingRangeProfile.scientificStatus="approximation";
    sensor.operatingRangeProfile.uncertainty={kind:"not-quantified",limitation};
    sensor.operatingRangeProfile.spatialLinearityModel={kind:"linear-superposition-over-geometric-aperture",
      scientificStatus:"approximation",evidence:sensor.colorSamplingProfile.evidence,limitation};
    sensor.operatingRangeProfile.spectralInputModel={kind:"per-spectral-bin",maximumBinWidthNanometers:20,
      scientificStatus:"approximation",evidence:sensor.colorSamplingProfile.evidence,limitation};
    sensor.spectralSampling.wavelengthRangeNanometers={minimum:540,maximum:560};
    sensor.spectralSampling.maximumSubintervalWidthNanometers=20;
    sensor.spectralResponseProfile.channels=sensor.spectralResponseProfile.channels.map(channel=>{
      if(channel.kind!=="effective-external-quantum-efficiency")throw Error("Expected explicit owned EQE");
      return {...channel,scientificStatus:"approximation",uncertainty:{kind:"not-quantified",limitation:"Owned narrow-band test response, not tier calibration."},
        externalQuantumEfficiency:{...channel.externalQuantumEfficiency,samples:[{wavelengthNanometers:540,value:.4},{wavelengthNanometers:560,value:.4}]}};
    });
    const readoutProfile=body.readout.find(a=>a.profile.channelId===sensor.spectralSampling.channelId)!.profile;
    site.readout.readoutProfile=readoutProfile;
    site.readout.regimeId=resolveGenericIsoSignalChain({profile:body.signalChain,isoCapability:body.iso,
      requestedIsoSetting:{kind:"standard",exposureIndex:iso},captureModeId:"native-still",readoutProfile}).readout.regime.regimeId;
  }
  const preparedContext=prepareImageFormationContext({contextId:"tier-reference",sceneId:"room",sceneRadianceProviderProfileId:"provider",
    outputGeometryProfileId:"tier-output",equipmentCapabilities:resolveGenericEquipmentExposureCapabilities({bodyProfile:body.exposure,
      lensProfile:catalog.find(a=>a.tier===lensTier)!.lens.exposure,selectedFocalLengthMm:50}),opticalBridgeProfile:bridge,
    renderer:{schemaVersion:"0.1.0",rendererId:"tier-reference",rendererVersion:"1",consumerKind:"reference",
      supportedStages:getImageFormationContract().stages.map(s=>s.id),supportedEffects:[],spectralCapability:"wavelength-resolved",
      temporalSampling:{kind:"bounded",maximumSamples:256},depthCapability:"none",inverseFieldMapping:true,
      alphaRepresentation:"premultiplied",preservesDepthOrderAcrossWarps:true,sensorDomainProcessing:true},
    fidelity:{schemaVersion:"0.1.0",profileId:"tier-bounded",profileVersion:"1",requiredStages:["display-processing"],requiredEffects:[],
      rendererRequirements:{spectral:"wavelength-resolved",sensorDomainProcessing:true,depth:"none"}}});
  const current=capture.frame.capture, captureSnapshot=createProductionCaptureSnapshot({captureId:current.captureId,releaseFrameId:"tier-release",
    sceneStateId:current.sceneStateId,sceneTimeSecondsFromExposureStart:current.sceneTimeSeconds,outputStateId:"tier-output",
    exposure:current.exposure,stochasticSeedUint32:current.noise.seedUint32,
    temporalCapture:{exposureWindowInput:{...capture.exposureWindow,nativeRaster:current.geometry.nativeRaster,
      samplePointsNative:capture.sites.map((_,i)=>({x:i%2+.5,y:Math.floor(i/2)+.5}))},imagingArea:current.geometry.imagingArea,
      orientation:current.geometry.orientation,rotation:{angularVelocityRadPerSec:{pitch:0,yaw:0,roll:0},temporalSampleCount:2,focusDistanceM:base.focus.distanceM}}});
  const output=register(loadPhotographicExportInput()), {rawFrame:_,...reconstruction}=output.reconstruction;void _;
  return {preparedContext,captureSnapshot,environmentCapture:{capture,processing:{reconstruction,colorProfile:output.colorProfile,
    whiteBalance:output.whiteBalance,rendering:output.rendering}}};
}
/** Independent direct phase sum, rather than another call to the engine PSF. */
function referenceKernel(p:LensComplexPupilProfile):number[]{
  const g=p.grid, intensities=g.relativeAmplitude.map((_,out)=>{
    let re=0,im=0;
    for(let i=0;i<g.relativeAmplitude.length;i++){
      const phase=2*Math.PI*(g.opticalPathDifferenceMicrometers[i]!/(p.context.wavelengthNm/1000)
        -(out%g.widthSamples-g.centerSampleX)*(i%g.widthSamples-g.centerSampleX)/g.widthSamples
        -(Math.floor(out/g.widthSamples)-g.centerSampleY)*(Math.floor(i/g.widthSamples)-g.centerSampleY)/g.heightSamples);
      re+=g.relativeAmplitude[i]!*Math.cos(phase);im+=g.relativeAmplitude[i]!*Math.sin(phase);
    }
    return re*re+im*im;
  });
  const sum=intensities.reduce((a,b)=>a+b,0);return intensities.map(v=>v/sum);
}

describe("exact generic tiers through supported production and finite pupil scenes",()=>{
  it.each(GENERIC_EQUIPMENT_TIERS)("%s body works with every lens through executed scene to RAW to processed output",async bodyTier=>{
    for(const lensTier of GENERIC_EQUIPMENT_TIERS){
      const v=request(bodyTier,lensTier), raw=simulateEnvironmentSensorRawFrame(v.environmentCapture.capture), plan=createProductionImageFormationPlan(v);
      expect(plan.blockers).toEqual([]);expect(plan.status).toBe("ready");
      expect(plan.environmentCaptureResult).toEqual(raw);
      expect(plan.processedOutputResult!.value.source.value.rawFrame).toEqual(raw.value.raw.value.frame);
      expect(plan.stagePlan.filter(s=>s.state==="active"||s.state==="modeled-zero")).toHaveLength(14);
      expect(plan.stagePlan.find(s=>s.stageId==="field-wavelength-psf")!.state).toBe("modeled-zero");
      for(const consumerKind of ["reference","interactive-optimized"] as const)
        expect(createProductionPlanConsumerManifest({plan,consumerKind}).environmentCaptureResult).toBe(plan.environmentCaptureResult);
      expect(createProductionImageFormationPlan(v)).toEqual(plan);
      const high=createProductionImageFormationPlan(request(bodyTier,lensTier,800));
      expect(high.environmentCaptureResult!.value.sites.map(s=>s.value.photo)).toEqual(raw.value.sites.map(s=>s.value.photo));
      expect(high.environmentCaptureResult!.value.raw.value.frame.samples).not.toEqual(raw.value.raw.value.frame.samples);
      const e=register(loadPhotographicExportInput());e.reconstruction.rawFrame=raw.value.raw.value.frame;
      const pair=await createPhotographicExportPair(e), repeated=await createPhotographicExportPair(e);
      expect(pair.rendering).toEqual(plan.processedOutputResult!.value.rendering);
      expect(pair.jpeg.bytes).toEqual(repeated.jpeg.bytes);expect(pair.rawDataUniqueId).toBe(repeated.rawDataUniqueId);
      expect(pair.imageDataPairing).toBe("jpeg-generated-from-exact-attached-raw");
      expect(raw.value.providerTransportVerified).toBe(false);
    }
  });
  it("attributes scene photon differences to transmission, independently of body labels",()=>{
    const counts=GENERIC_EQUIPMENT_TIERS.map(lensTier=>{
      const results=GENERIC_EQUIPMENT_TIERS.map(bodyTier=>simulateEnvironmentSensorRawFrame(request(bodyTier,lensTier).environmentCapture.capture));
      const first=results[0]!.value.sites[0]!.value.photo.value.photoSignal.expectedGeneratedElectronCount;
      for(const r of results)expect(r.value.sites[0]!.value.photo.value.photoSignal.expectedGeneratedElectronCount).toBe(first);
      return first;
    });
    const transmissions=GENERIC_EQUIPMENT_TIERS.map(tier=>catalog.find(p=>p.tier===tier)!.lens.matchedReference.transmission);
    for(let i=0;i<3;i++)expect(counts[i]!/counts[0]!).toBeCloseTo(transmissions[i]!/transmissions[0]!,12);
  });
  it.each(GENERIC_EQUIPMENT_TIERS)("%s rejects unsupported spectral coverage and stale profile commitments before evaluation",tier=>{
    for(const fault of ["spectrum","profile"]){
      const v=request(tier);let calls=0;v.environmentCapture.capture.evaluateRadiance=(q):SceneRadianceEvaluationResult=>{calls++;return evaluator(q,1e-9);};
      if(fault==="spectrum")v.environmentCapture.capture.sites[0]!.environment.sensor.spectralSampling.wavelengthRangeNanometers.minimum=530;
      else v.environmentCapture.capture.sites[0]!.environment.optics.profile.profileVersion="changed";
      const plan=createProductionImageFormationPlan(v);expect(plan.status).toBe("blocked");expect(calls).toBe(0);
    }
  });
  it.each(GENERIC_EQUIPMENT_TIERS)("%s finite field/near/far pupil scene retains physical response and correction costs",tier=>{
    const p=lens(tier,tier,9), raster={width:9,height:9,centerMm:{x:0,y:0},pitchMm:3};
    for(const pupil of p.pupils){
      const psf=calculateLensComplexPupilPsf({profile:pupil}).value, oracle=referenceKernel(pupil);
      psf.kernel.normalizedIntensity.forEach((value,i)=>expect(value).toBeCloseTo(oracle[i]!,13));
      // Owned controlled background texture plus a highlight. Sample each declared PSF tap;
      // no field/defocus/spectral interpolation and no universal bokeh score.
      const radiance=(x:number,y:number):number=>1+.2*Math.cos(900*x)+.2*Math.sin(700*y)+Math.exp(-((x/.004)**2+(y/.004)**2));
      const convolution=(x:number,y:number,weights:readonly number[]):number=>weights.reduce((sum,w,i)=>sum+w*radiance(
        x-(i%5-2)*psf.kernel.samplePitchMicrometersX/1000,y+(Math.floor(i/5)-2)*psf.kernel.samplePitchMicrometersY/1000),0);
      const samples=Array.from({length:81},(_,i)=>convolution((i%9-4)*3,(Math.floor(i/9)-4)*3,psf.kernel.normalizedIntensity));
      samples.forEach((v,i)=>expect(v).toBeCloseTo(convolution((i%9-4)*3,(Math.floor(i/9)-4)*3,oracle),12));
      const capture={state:p.state,captureId:"tier-pupil-capture",noiseRealizationId:"same-sampled-noise",timeSeconds:base.exposure.shutterSeconds,
        raster,channels:{red:samples,green:samples,blue:samples}};
      const render=(on:boolean):ReturnType<typeof calculateLensCorrectedCapture>["value"]=>calculateLensCorrectedCapture({capture,plan:resolveLensCorrectionPlan({profile:p.correction,state:p.state,
        selections:{geometry:on?"on":"off","lateral-ca":on?"on":"off",gain:on?"on":"off"},outputKind:"processed",selectionKind:"camera-selectable"}).value,
        destinationRaster:raster,resampler:{id:"tier-pupil-bilinear",version:"1",filter:"bilinear",antialias:"none"},
        physicalProjectionDistanceMm:base.expected.projection.imageDistanceMm,clippingLevel:100}).value;
      const off=render(false),on=render(true);
      expect(off.channels.red).toEqual(samples);expect(on.channels.red).not.toEqual(samples);
      expect(on.captureId).toBe(off.captureId);expect(on.noiseRealizationId).toBe(off.noiseRealizationId);
      expect(on.samplingPlans.red!.points.every(point=>point.determinant>0)).toBe(true);
      expect(on.samplingPlans.red!.retainedSampleRayEnvelopeDegrees).not.toBeNull();
      expect(on).toEqual(render(true));expect(capture.channels.red).toEqual(samples);
    }
  });
});
