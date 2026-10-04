// SPDX-License-Identifier: Apache-2.0
import type { NativeRawInput, NativeRawTileRequest, NativeRawTile, NativeRawProvider, SensorRawProducerInput, SensorRawProducerSiteInput } from "../../src/index.js";
import { loadSensorRawProducerInput } from "./sensor-raw-producer-fixture.js";
export function nativeRawFixture(width=2,height=2): {input: NativeRawInput; reference: SensorRawProducerInput; site: (x:number,y:number)=>SensorRawProducerSiteInput; provider:NativeRawProvider} {
  const reference=loadSensorRawProducerInput(),c=reference.frame.capture;
  const {schemaVersion,engineApiVersion,resolvedGeometry,equivalentFocalLength35Mm,planes,...metadata}=c;
  void schemaVersion;void engineApiVersion;void resolvedGeometry;void equivalentFocalLength35Mm;void planes;
  const raster={pixelWidth:width,pixelHeight:height};
  const input:NativeRawInput=structuredClone({exposure:{...metadata,geometry:{...metadata.geometry,nativeRaster:raster,outputRaster:raster}},frameId:reference.frame.frameId,
    modeId:reference.frame.modeId,captureModeProfile:structuredClone(reference.frame.captureModeProfile),colorSamplingProfile:reference.frame.colorSamplingProfile,
    bindingProfile:{...reference.frame.bindingProfile,nativeRaster:raster},maximumOutputBytes:width*height*7});
  for(const mode of input.captureModeProfile.modes)mode.processedImageRaster.value=raster;
  function site(x:number,y:number):SensorRawProducerSiteInput {
    const s=structuredClone(reference.sites[(y%2)*2+x%2]!);
    for(const v of [s.charge.photoSignal,s.charge.darkCharge,s.charge.completenessProfile])v.site={x,y};
    s.capacityProfile.siteApplicability={kind:"exact-site",site:{x,y}};return s;
  }
  function readTile(request:NativeRawTileRequest): Promise<NativeRawTile> {return Promise.resolve({...request,sites:Array.from({length:request.width},(_,j)=>site(request.x+j,request.y))});}
  return {input,reference,site,provider:{readTile,yieldControl:(): Promise<void>=>Promise.resolve()}};
}
