// SPDX-License-Identifier: Apache-2.0

import { freezeOwnedData } from "../../src/core/owned-data.js";
import { createHash } from "node:crypto";
import {
  GENERIC_EQUIPMENT_TIERS, resolveGenericEquipmentTierCatalog, createGenericEquipmentTierSelection,
  resolveGenericEquipmentTierLensProfiles, calculateLensComplexPupilPsf,
  calculateLateralChromaticAberrationMapping, calculateInverseLateralChromaticAberrationMapping,
  calculateIlluminationVignetting, calculatePeripheralIlluminationCorrection,
  resolveLensCorrectionPlan, calculateLensCorrectedCapture, calculateLensStrayLightIrradiance,
  calculateStabilizedRotationTrajectory, resolveCaptureMode, resolveCaptureModeTiming, resolveManualFlashSync,
  type GenericEquipmentTier, type ManualFlashProfile, type StabilizationDisturbanceTrajectory, type StabilizationSystemProfile
} from "../../src/index.js";
import { loadBasicReferenceFixture } from "./basic-reference-fixture.js";
import { loadSensorRawFrameInput } from "./sensor-raw-frame-fixture.js";

type CorrectedCapture = ReturnType<typeof calculateLensCorrectedCapture>["value"];
type TierProfiles = ReturnType<typeof resolveGenericEquipmentTierLensProfiles>;
type Stabilized = ReturnType<typeof calculateStabilizedRotationTrajectory>["value"];
type FlashSync = ReturnType<typeof resolveManualFlashSync>;
interface PupilDiagnostic {
  profileId:string; profileVersion:string; fieldPointMm:{x:number;y:number}; signedDefocusImagePlaneMicrometers:number;
  energy:number;peakFraction:number;outerSampleEnergyFraction:number;centroidMicrometers:{x:number;y:number};
  covarianceSquareMicrometers:{xx:number;yy:number;xy:number};textureContrastAt100CyclesPerMm:{horizontal:number;vertical:number;diagonal:number};
  relativePupilThroughputFactor:number;
}
interface TierDiagnostic {
  tier:GenericEquipmentTier;selection:TierProfiles["selection"];tradeoffs:readonly string[];
  physical:{pupilResponses:PupilDiagnostic[];cornerCaSeparationMm:number;cornerIllumination:number;breathingProjectionScale:number;
    flare:{sourceAngleDegrees:number;ghost:number;veil:number;primaryOnlyMeter:number;relativeModulationContrastForUnitMeanAfterVeil:number}[];sampledEdgeRow:number[];sampledCornerEdgeRow:number[]};
  correctionCosts:{maximumPrincipalStretch:number;maximumOutputMagnification:number;minimumJacobianDeterminant:number;cornerGain:number;cornerGainOnlyVarianceRatio:number;
    shiftedJointCrop:CorrectedCapture["jointCrop"];shiftedRetainedFraction:number;
    retainedSampleRayEnvelopeDegrees:NonNullable<CorrectedCapture["samplingPlans"]["green"]>["retainedSampleRayEnvelopeDegrees"];
    capturedPixelEdgeFovDegrees:NonNullable<CorrectedCapture["samplingPlans"]["green"]>["physicalCapturedFovDegrees"]};
  corrected:{maximumResidualDisplacementMm:number;maximumResidualCaMm:number;sampledEdgeRow:number[];sampledCornerEdgeRow:number[];captureId:string;noiseRealizationId:string;clippingEvents:number};
  body:{stabilization:Stabilized["samples"];saturatedStabilization:Stabilized["samples"];
    flash:{frontStartSeconds:number|null;rearStartSeconds:number|null;dataReadoutSeconds:ReturnType<typeof resolveCaptureModeTiming>["readoutTiming"]["captureReadoutDurationSeconds"];
      wholeFrameOpenInterval:FlashSync["wholeActiveFrameOpenInterval"]}};
}
export interface TierAcceptanceReport {
  reportVersion:string;sceneId:string;scientificStatus:"approximation";presetVersion:string;catalogSha256:string;baseFixtureId:string;seedUint32:number;
  matchedOptics:{focalLengthMm:number;aperture:number;focusDistanceM:number;wavelengthNm:number};sensorGeometry:{widthMm:number;heightMm:number};
  sampledCorrectionRaster:typeof raster;limitations:string[];tiers:TierDiagnostic[];
}

const base = loadBasicReferenceFixture();
const catalog = resolveGenericEquipmentTierCatalog({presetVersion:"1.0.0"});
export const TIER_REPORT_VERSION = "1.0.0";
export const TIER_REPORT_SCENE_ID = "photivra:tier-matched-reference-v1";
const channels=["red","green","blue"] as const;
const raster={width:9,height:9,centerMm:{x:0,y:0},pitchMm:3};
export function tierProfiles(tier:GenericEquipmentTier):ReturnType<typeof resolveGenericEquipmentTierLensProfiles>{
  return resolveGenericEquipmentTierLensProfiles({selection:createGenericEquipmentTierSelection({presetVersion:"1.0.0",bodyTier:tier}),
    state:{bodyId:`photivra-${tier}-body`,bodyVersion:"1.0.0",lensId:`photivra-${tier}-prime`,lensVersion:"1.0.0",
      focalLengthMm:base.lens.focalLengthMm,aperture:base.lens.aperture,focusDistanceM:base.focus.distanceM,
      captureMode:"still",frameRateHz:0,stabilizationMode:"off",outputWidth:9,outputHeight:9}});
}
/** One physically mapped sampled edge target with one fixed additive noise array.
 * RGB here denotes representative field-map channels, not calibrated spectral color.
 */
export function tierCorrectionCase(tier:GenericEquipmentTier):{
  profiles:TierProfiles;capture:Parameters<typeof calculateLensCorrectedCapture>[0]["capture"];noise:number[];
  off:CorrectedCapture;on:CorrectedCapture;shifted:CorrectedCapture
}{
  const p=tierProfiles(tier);
  const noise=Array.from({length:81},(_,i)=>((i+base.stochasticSeedUint32)%2 ? .01 : -.01));
  const ideal=(x:number,y:number):number=>x-.3*y>=0?.8:.2;
  const physical=Object.fromEntries(channels.map(channel=>[channel,Array.from({length:81},(_,i)=>{
    const destination={x:(i%9-4)*3,y:(4-Math.floor(i/9))*3};
    const source=calculateInverseLateralChromaticAberrationMapping({profile:p.lateralCa,distortedImagePointMm:destination}).value.channels[channel].sourceImagePointMm;
    return ideal(source.x,source.y)*calculateIlluminationVignetting({profile:p.vignetting,imagePointMm:destination}).value.linearThroughputFactor+noise[i]!;
  })])) as Record<(typeof channels)[number],number[]>;
  const capture=freezeOwnedData({state:p.state,captureId:TIER_REPORT_SCENE_ID+":edge",noiseRealizationId:`owned-alternating-${base.stochasticSeedUint32}`,
    timeSeconds:base.exposure.shutterSeconds,raster,channels:physical});
  const render=(enabled:boolean,shift=0):ReturnType<typeof calculateLensCorrectedCapture>["value"]=>calculateLensCorrectedCapture({capture,
    plan:resolveLensCorrectionPlan({profile:p.correction,state:p.state,selections:{geometry:enabled?"on":"off","lateral-ca":enabled?"on":"off",gain:enabled?"on":"off"},
      outputKind:"processed",selectionKind:"camera-selectable"}).value,destinationRaster:{...raster,centerMm:{x:shift,y:0}},
    resampler:{id:"tier-report-bilinear",version:"1",filter:"bilinear",antialias:"none"},
    physicalProjectionDistanceMm:base.expected.projection.imageDistanceMm,clippingLevel:100}).value;
  return {profiles:p,capture,noise,off:render(false),on:render(true),shifted:render(true,6)};
}
export function tierStabilizationCase(tier:GenericEquipmentTier,scale=1):{profile:StabilizationSystemProfile;disturbance:StabilizationDisturbanceTrajectory;result:Stabilized}{
  const profile=catalog.find(p=>p.tier===tier)!.body.stabilization, duration=base.exposure.shutterSeconds;
  const disturbance:StabilizationDisturbanceTrajectory={version:"0.1.0",trajectoryId:TIER_REPORT_SCENE_ID+":rotation",
    timeReference:"first-opening-boundary-phase",initialAngularDisplacementIsZero:true,cameraTranslationIncluded:false,
    subjectMotionIncluded:false,supportStateEncoded:false,evidence:catalog[0]!.evidence,limitations:["Owned linear angular disturbance, no calibration."],
    samples:[0,.0005,duration].map(t=>({timeSecondsFromCaptureReference:t,angularDisplacementRad:{pitch:.004*scale*t/duration,yaw:.002*scale*t/duration,roll:.001*scale*t/duration}}))};
  return {profile,disturbance,result:calculateStabilizedRotationTrajectory({profile,disturbance,captureKind:"still"}).value};
}
export function tierFlashCase(tier:GenericEquipmentTier,duration=base.exposure.shutterSeconds,pulseDuration=.002):{
  flash:ManualFlashProfile;timing:ReturnType<typeof resolveCaptureModeTiming>;capabilities:Parameters<typeof resolveManualFlashSync>[0]["syncCapabilities"];
  front:FlashSync;rear:FlashSync
}{
  const body=catalog.find(p=>p.tier===tier)!.body, raw=loadSensorRawFrameInput(), evidence=body.flashSync.evidence;
  const captureMode=resolveCaptureMode({nativeRaster:raw.bindingProfile.nativeRaster,modeId:"native-still",profile:{schemaVersion:"0.1.0",
    modes:[{...raw.captureModeProfile.modes[0]!,modeId:"native-still",dependencies:["mode-specific-readout-timing"]}]}});
  const scan={kind:"uniform-linear-native-scan" as const,directionNative:{value:"top-to-bottom" as const,evidence},
    traversalDurationSeconds:{value:.002,unit:"s" as const,evidence}};
  // Explicit owned exposure-boundary schedule. The tier asset supplies DATA readout only.
  const timing=resolveCaptureModeTiming({captureMode,nominalExposureDurationSeconds:{value:duration,unit:"s",evidence},
    samplePointsNative:[{x:.5,y:.5},{x:1.5,y:1.5}],timingProfile:{schemaVersion:"0.1.0",profileId:body.flashSync.timingProfileId,
      profileVersion:"1.0.0",captureModeId:"native-still",scientificStatus:"approximation",scheduleFamily:"global-or-uniform-linear-native-scan",
      shutterMechanism:"mechanical",opening:scan,closing:scan,readout:body.readoutTiming.profile,nonUniformScheduleModeled:false,
      evidence,limitations:["Owned 2 ms exposure-boundary scan independently registered for this fixture."]}});
  const flash:ManualFlashProfile={schemaVersion:"0.1.0",profileId:TIER_REPORT_SCENE_ID+":flash",profileVersion:"1",
    sourceTemplate:{sourceId:"tier-report-flash",family:"spot",geometry:{kind:"spot",origin:{kind:"point-position",positionM:{x:0,y:0,z:0}},
      directionUnitVector:{x:0,y:0,z:1},outerConeAngleDegrees:60},magnitude:{kind:"relative-linear-scale",scale:1,scientificStatus:"approximation",limitation:"Owned relative source."},
      spectrum:{kind:"unresolved",limitation:"No flash spectrum calibration is supplied."},evidence},
    pulse:{waveformId:"tier-report-pulse",scientificStatus:"approximation",supportDurationSeconds:pulseDuration,interpolation:"piecewise-linear",
      samples:[{timeSecondsFromWaveformReference:0,relativeMagnitudeMultiplier:0},{timeSecondsFromWaveformReference:pulseDuration/2,relativeMagnitudeMultiplier:1},
        {timeSecondsFromWaveformReference:pulseDuration,relativeMagnitudeMultiplier:0}],normalization:"relative-peak-one",evidence,limitations:["Owned triangular pulse."]},
    outputControl:{kind:"relative-linear-source-scale",scale:1,flashExposureCompensationStops:0},ttlModeled:false,highSpeedSyncModeled:false,
    recycleBehaviorModeled:false,redEyePreflashModeled:false,modelingLightModeled:false,afAssistModeled:false,evidence,limitations:["Ordinary sync only."]};
  return {flash,timing,capabilities:body.flashSync,
    front:resolveManualFlashSync({flashEnabled:true,flashProfile:flash,timing,syncCapabilities:body.flashSync,syncMode:"front-curtain"}),
    rear:resolveManualFlashSync({flashEnabled:true,flashProfile:flash,timing,syncCapabilities:body.flashSync,syncMode:"rear-curtain"})};
}
/** Repository-only diagnostics; not a public engine model, calibration or ranking API. */
export function createTierAcceptanceReport():TierAcceptanceReport{
  const tiers=GENERIC_EQUIPMENT_TIERS.map(tier=>{
    const p=tierProfiles(tier), edge=tierCorrectionCase(tier), corner={x:18,y:12};
    const pupilResponses=p.pupils.map(profile=>{
      const psf=calculateLensComplexPupilPsf({profile}).value, k=psf.kernel;
      let centroidX=0,centroidY=0,xx=0,yy=0,xy=0,outerEnergy=0;
      k.normalizedIntensity.forEach((w,i)=>{
        const x=(i%k.widthSamples-k.centerSampleX)*k.samplePitchMicrometersX;
        const y=(Math.floor(i/k.widthSamples)-k.centerSampleY)*k.samplePitchMicrometersY;
        centroidX+=w*x;centroidY+=w*y;xx+=w*x*x;yy+=w*y*y;xy+=w*x*y;
        if(i%5===0||i%5===4||Math.floor(i/5)===0||Math.floor(i/5)===4)outerEnergy+=w;
      });
      // Finite sampled response to a controlled texture. This is discrete OTF magnitude,
      // never a measured or continuous optical MTF, nor a single bokeh quality score.
      const texture=(fx:number,fy:number):number=>{
        let re=0,im=0;
        k.normalizedIntensity.forEach((w,i)=>{
          const phase=2*Math.PI*(fx*(i%5-2)*k.samplePitchMicrometersX/1000+fy*(Math.floor(i/5)-2)*k.samplePitchMicrometersY/1000);
          re+=w*Math.cos(phase);im+=w*Math.sin(phase);
        });return Math.hypot(re,im);
      };
      return {profileId:profile.profileId,profileVersion:profile.profileVersion,fieldPointMm:profile.context.fieldPointMm,
        signedDefocusImagePlaneMicrometers:profile.context.signedDefocusImagePlaneMicrometers,
        energy:k.normalizedIntensity.reduce((a,b)=>a+b,0),peakFraction:Math.max(...k.normalizedIntensity),outerSampleEnergyFraction:outerEnergy,
        centroidMicrometers:{x:centroidX,y:centroidY},covarianceSquareMicrometers:{xx:xx-centroidX**2,yy:yy-centroidY**2,xy:xy-centroidX*centroidY},
        textureContrastAt100CyclesPerMm:{horizontal:texture(100,0),vertical:texture(0,100),diagonal:texture(100/Math.SQRT2,100/Math.SQRT2)},
        relativePupilThroughputFactor:psf.relativePupilThroughputFactor};
    });
    const plans=channels.map(c=>edge.on.samplingPlans[c]!);
    const offsets=[p.lateralCa.redCoefficientOffset.k1,0,p.lateralCa.blueCoefficientOffset.k1];
    let maximumResidualDisplacementMm=0,maximumResidualCaMm=0;
    for(const i of [0,4,8,40,72,76,80]){
      const target={x:(i%9-4)*3,y:(4-Math.floor(i/9))*3};
      const recovered=plans.map((plan,c)=>calculateInverseLateralChromaticAberrationMapping({
        profile:{...p.lateralCa,baseDistortionCoefficients:{k1:p.radial.coefficients.k1+offsets[c]!,k2:0,k3:0},redCoefficientOffset:{k1:0,k2:0,k3:0},blueCoefficientOffset:{k1:0,k2:0,k3:0}},
        distortedImagePointMm:plan.points[i]!.sourcePointMm}).value.channels.green.sourceImagePointMm);
      for(const q of recovered)maximumResidualDisplacementMm=Math.max(maximumResidualDisplacementMm,Math.hypot(q.x-target.x,q.y-target.y));
      maximumResidualCaMm=Math.max(maximumResidualCaMm,Math.hypot(recovered[0]!.x-recovered[2]!.x,recovered[0]!.y-recovered[2]!.y));
    }
    const gain=p.correction.components.find(c=>c.kind==="peripheral-illumination")!;
    if(gain.kind!=="peripheral-illumination")throw Error("Missing gain");
    const gainResult=calculatePeripheralIlluminationCorrection({component:gain,imagePointMm:corner,signal:1,noiseVariance:1,clippingLevel:100}).value;
    const row=(values:readonly (number|null)[]):number[]=>values.slice(36,45).map(v=>v!);
    const flare=[0,50].map(angle=>{
      const result=calculateLensStrayLightIrradiance({profile:p.stray,state:p.state,enabled:true,imagePointMm:{x:0,y:0},wavelengthNm:550,wavelengthBasis:"vacuum",
        timeSeconds:base.exposure.shutterSeconds,primarySpectralIrradianceWPerM2PerNm:1,sources:[{id:"tier-report-bright-source",fieldAngleXDegrees:angle,
          fieldAngleYDegrees:0,incidentSpectralPowerWPerNm:.001,admittedFraction:1}],meterDomain:"primary-only"}).value;
      return {sourceAngleDegrees:angle,ghost:result.ghostSpectralIrradianceWPerM2PerNm,veil:result.veilSpectralIrradianceWPerM2PerNm,
        primaryOnlyMeter:result.meterSpectralIrradianceWPerM2PerNm,relativeModulationContrastForUnitMeanAfterVeil:1/(1+result.veilSpectralIrradianceWPerM2PerNm)};
    });
    const stabilization=tierStabilizationCase(tier), saturated=tierStabilizationCase(tier,20), flash=tierFlashCase(tier);
    return {tier,selection:p.selection,tradeoffs:catalog.find(a=>a.tier===tier)!.tradeoffs,
      physical:{pupilResponses,cornerCaSeparationMm:calculateLateralChromaticAberrationMapping({profile:p.lateralCa,imagePointMm:corner}).value.separation.maximumPairDistanceMm,
        cornerIllumination:calculateIlluminationVignetting({profile:p.vignetting,imagePointMm:corner}).value.linearThroughputFactor,
        breathingProjectionScale:p.breathingProjectionScale,flare,sampledEdgeRow:row(edge.off.channels.green),sampledCornerEdgeRow:edge.off.channels.green.slice(0,9).map(v=>v!)},
      correctionCosts:{maximumPrincipalStretch:Math.max(...plans.flatMap(p=>p.points.flatMap(q=>[...q.principalStretches]))),
        maximumOutputMagnification:1/Math.min(...plans.flatMap(p=>p.points.flatMap(q=>[...q.principalStretches]))),
        minimumJacobianDeterminant:Math.min(...plans.flatMap(p=>p.points.map(q=>q.determinant))),cornerGain:gainResult.gain,
        cornerGainOnlyVarianceRatio:gainResult.noiseVarianceBeforeClipping,shiftedJointCrop:edge.shifted.jointCrop,
        shiftedRetainedFraction:edge.shifted.jointCrop!.width*edge.shifted.jointCrop!.height/81,
        retainedSampleRayEnvelopeDegrees:edge.shifted.samplingPlans.green!.retainedSampleRayEnvelopeDegrees,
        capturedPixelEdgeFovDegrees:edge.shifted.samplingPlans.green!.physicalCapturedFovDegrees},
      corrected:{maximumResidualDisplacementMm,maximumResidualCaMm,sampledEdgeRow:row(edge.on.channels.green),sampledCornerEdgeRow:edge.on.channels.green.slice(0,9).map(v=>v!),
        captureId:edge.on.captureId,noiseRealizationId:edge.on.noiseRealizationId,clippingEvents:edge.on.illuminationClippingEventCount},
      body:{stabilization:stabilization.result.samples,saturatedStabilization:saturated.result.samples,
        flash:{frontStartSeconds:flash.front.pulseStartSecondsFromCaptureReference,rearStartSeconds:flash.rear.pulseStartSecondsFromCaptureReference,
          dataReadoutSeconds:flash.timing.readoutTiming.captureReadoutDurationSeconds,wholeFrameOpenInterval:flash.front.wholeActiveFrameOpenInterval}}};
  });
  return {reportVersion:TIER_REPORT_VERSION,sceneId:TIER_REPORT_SCENE_ID,scientificStatus:"approximation" as const,
    presetVersion:"1.0.0",catalogSha256:createHash("sha256").update(JSON.stringify(catalog)).digest("hex"),
    baseFixtureId:base.fixtureId,seedUint32:base.stochasticSeedUint32,matchedOptics:{focalLengthMm:base.lens.focalLengthMm,aperture:base.lens.aperture,focusDistanceM:base.focus.distanceM,wavelengthNm:550},
    sensorGeometry:base.sensor.imagingArea,sampledCorrectionRaster:raster,
    limitations:["Owned synthetic regression evidence, not measured calibration or universal tier rank.",
      "Discrete 550 nm pupil slices are not a continuous spectral or field-dependent optical model.",
      "Representative RGB field maps do not establish LoCA or spectral sensor primaries.",
      "Correction targets are sampled; interpolation/gain diagnostics are not measured MTF or restored photons.",
      "No separate browser approximation exists; ordinary browser-safe APIs and same immutable consumer results are reused."],tiers};
}
