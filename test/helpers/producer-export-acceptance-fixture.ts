// SPDX-License-Identifier: Apache-2.0

import { createSimulatedCapture, type CaptureOrientation, type SimulateEnvironmentSensorRawFrameInput,
  type SceneRadianceEvaluationResult } from "../../src/index.js";
import { frameInput } from "./environment-raw-fixture.js";

/** Owned bounded environment derivative; no measured scene, camera or sensor calibration. */
export function producerExportAcceptanceInput(orientation: CaptureOrientation = "landscape", wb = false, captureId?: string): SimulateEnvironmentSensorRawFrameInput {
  const v=frameInput(), c=v.frame.capture;
  const raster={pixelWidth:72,pixelHeight:48};
  const portrait=orientation==="portrait-clockwise" || orientation==="portrait-counter-clockwise";
  const output={pixelWidth:portrait ? 48 : 72,pixelHeight:portrait ? 72 : 48};
  const {schemaVersion:_s,engineApiVersion:_e,resolvedGeometry:_g,equivalentFocalLength35Mm:_f,...ci}=c;
  void _s;void _e;void _g;void _f;
  v.frame.capture=createSimulatedCapture({...ci,captureId:captureId ?? ci.captureId,geometry:{...ci.geometry,nativeRaster:raster,outputRaster:output,orientation},
    whiteBalanceIntent:wb ? {stateId:"acceptance-wb",source:"manual-gains",locked:true,channelGains:{red:2,green:1,blue:.5},sourceProfile:null} : null,
    planes:[{...ci.planes[0]!,pixelWidth:output.pixelWidth,pixelHeight:output.pixelHeight,
      whiteBalanceApplication:wb ? "intent-only" : "not-applicable",storage:{kind:"inline-float64",samples:Array<number>(72*48*3).fill(0)}}]}).value;
  v.frame.bindingProfile={...v.frame.bindingProfile,nativeRaster:raster};
  v.frame.captureModeProfile={...v.frame.captureModeProfile,modes:v.frame.captureModeProfile.modes.map(m=>({...m,processedImageRaster:{...m.processedImageRaster,value:raster}}))};
  const templates=v.sites;
  v.sites=Array.from({length:72*48},(_,i)=>{
    const x=i%72,y=Math.floor(i/72),site={x,y},s=structuredClone(templates[(y%2)*2+x%2]!);
    const sensor=s.environment.sensor;
    s.environment.temporalIntegrationId="acceptance-site-"+i;
    s.environment.temporalSampleCount=1;
    s.environment.motion.angularVelocityRadPerSec={pitch:0,yaw:0,roll:0};
    sensor.spatialSampling.site=site;
    sensor.spatialSampling.spatialSampleCountX=1;sensor.spatialSampling.spatialSampleCountY=1;
    sensor.localExposure.bindingProfile=v.frame.bindingProfile;
    sensor.localExposure.exposureWindowInput={...sensor.localExposure.exposureWindowInput,nativeRaster:raster};
    const pitchX=sensor.spatialSampling.imagingArea.widthMm*1000/72,pitchY=sensor.spatialSampling.imagingArea.heightMm*1000/48;
    sensor.spatialSampling.samplingApertureProfile.siteCenterLattice={...sensor.spatialSampling.samplingApertureProfile.siteCenterLattice,
      pitchXMicrometers:pitchX,pitchYMicrometers:pitchY,firstSiteCenterFromImagingAreaTopLeftMicrometers:{x:pitchX/2,y:pitchY/2}};
    if(sensor.spatialSampling.samplingApertureProfile.geometricSensitiveAperture.kind!=="uniform-axis-aligned-rectangle") throw Error("Uniform aperture fixture required.");
    sensor.spatialSampling.samplingApertureProfile.geometricSensitiveAperture={...sensor.spatialSampling.samplingApertureProfile.geometricSensitiveAperture,
      widthMicrometers:.8*pitchX,heightMicrometers:.6*pitchY};
    sensor.responseApplication.applicationProfile.incidentAreaBasis={kind:"geometric-sensitive-aperture",areaSquareMicrometers:.8*pitchX*.6*pitchY};
    if(sensor.responseApplication.applicationProfile.spatialResponseModel.kind!=="uniform-over-geometric-sensitive-aperture") throw Error("Uniform response fixture required.");
    sensor.responseApplication.applicationProfile.spatialResponseModel={...sensor.responseApplication.applicationProfile.spatialResponseModel,scientificStatus:"approximation",limitation:"Owned uniform response approximation, not measured calibration."};
    s.darkCurrentProfile={...s.darkCurrentProfile,siteApplicability:{kind:"exact-site",site}};
    s.charge.completenessProfile={...s.charge.completenessProfile,site};
    s.readout.capacityProfile={...s.readout.capacityProfile,siteApplicability:{kind:"exact-site",site}};
    return s;
  });
  v.evaluateRadiance=(q): SceneRadianceEvaluationResult=>{
    if(q.target.kind!=="environment-direction") throw Error("Environment fixture required.");
    // Three explicitly synthetic angular zones: dark, midtone and saturated.
    const x=q.target.outgoingDirectionUnitVector.x;
    const radiance=x<-.1 ? 0 : x>.1 ? 1e-2 : 7e-8;
    return {schemaVersion:"0.1.0",sampleId:q.sampleId,sceneId:q.sceneId,providerProfileId:q.providerProfileId,
      wavelengthNanometers:q.wavelengthNanometers,wavelengthBasis:q.wavelengthBasis,quantity:"outgoing-spectral-radiance",unit:"W/m^2/sr/nm",
      spectralRadianceWattsPerSquareMeterSteradianNanometer:radiance,scientificStatus:"approximation",
      uncertainty:{kind:"not-quantified",limitation:"Owned analytic angular test zones."},evidence:v.sceneBinding.evidence,
      limitations:["Synthetic declared environment; not measured photographic truth."]};
  };
  return v;
}
