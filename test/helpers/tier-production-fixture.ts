// SPDX-License-Identifier: Apache-2.0
import { resolveGenericEquipmentTierCatalog, createGenericEquipmentTierSelection, resolveGenericEquipmentTierLensProfiles,
  resolveGenericEquipmentExposureCapabilities, resolveGenericIsoSignalChain, createSimulatedCapture,
  prepareImageFormationContext, createProductionCaptureSnapshot, getImageFormationContract,
  type GenericEquipmentTier, type CreateProductionImageFormationPlanInput, type SceneRadianceEvaluationResult } from "../../src/index.js";
import { frameInput, evaluator } from "./environment-raw-fixture.js";
import { loadPhotographicExportInput } from "./photographic-export-fixture.js";
import { loadBasicReferenceFixture } from "./basic-reference-fixture.js";

const base = loadBasicReferenceFixture();
const catalog = resolveGenericEquipmentTierCatalog({ presetVersion: "1.0.0" });
export function tierProductionLensProfiles(bodyTier: GenericEquipmentTier, lensTier = bodyTier, size = 2): ReturnType<typeof resolveGenericEquipmentTierLensProfiles> {
  return resolveGenericEquipmentTierLensProfiles({selection:createGenericEquipmentTierSelection({presetVersion:"1.0.0",bodyTier,lensTier}),
    state:{bodyId:`photivra-${bodyTier}-body`,bodyVersion:"1.0.0",lensId:`photivra-${lensTier}-prime`,lensVersion:"1.0.0",
      focalLengthMm:base.lens.focalLengthMm,aperture:base.lens.aperture,focusDistanceM:base.focus.distanceM,
      captureMode:"still",frameRateHz:0,stabilizationMode:"off",outputWidth:size,outputHeight:size}});
}
/** Register the owned topology explicitly; no geometry, CFA or spectral response is inferred from a tier. */
export function registerTierFixture<T>(v:T):T {
  return JSON.parse(JSON.stringify(v).replaceAll('"cfa"','"photivra-generic-bayer"').replaceAll('"native"','"native-still"')) as T;
}
export function tierProductionRequest(bodyTier:GenericEquipmentTier,lensTier=bodyTier,iso=100,temporalSampleCount=2): CreateProductionImageFormationPlanInput & {environmentCapture: Required<NonNullable<CreateProductionImageFormationPlanInput["environmentCapture"]>>} {
  const original=frameInput(false,false), capture=registerTierFixture(original), p=tierProductionLensProfiles(bodyTier,lensTier), body=catalog.find(p=>p.tier===bodyTier)!.body;
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
    site.environment.temporalSampleCount=temporalSampleCount;
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
      orientation:current.geometry.orientation,rotation:{angularVelocityRadPerSec:{pitch:0,yaw:0,roll:0},temporalSampleCount,focusDistanceM:base.focus.distanceM}}});
  const output=registerTierFixture(loadPhotographicExportInput()), {rawFrame:_,...reconstruction}=output.reconstruction;void _;
  return {preparedContext,captureSnapshot,environmentCapture:{capture,processing:{reconstruction,colorProfile:output.colorProfile,
    whiteBalance:output.whiteBalance,rendering:output.rendering}}};
}
