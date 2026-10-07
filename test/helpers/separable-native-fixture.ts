// SPDX-License-Identifier: Apache-2.0
import type { ExperimentalNativeSeparableEmissionInput, ExperimentalNativeSeparableEmissionProvider } from "../../src/api/native-separable-emission-experimental.js";
import { simulateEnvironmentSensorRawFrame, type NativeEnvironmentRawTile, type SceneRadianceEvaluationResult } from "../../src/index.js";
import { frameInput, evaluator } from "./environment-raw-fixture.js";
import { evidence } from "./eqe-response-fixture.js";
export function separableNativeFixture(rays=32,rolling=false):{input:ExperimentalNativeSeparableEmissionInput;provider:ExperimentalNativeSeparableEmissionProvider;reference:ReturnType<typeof simulateEnvironmentSensorRawFrame>} {
 const v=frameInput(rolling);for(const s of v.sites)s.environment.pupil={kind:"ideal-uniform-circular-pupil",radialSampleCount:rays/16,angularSampleCount:16,evidence:evidence("test:emission-pupil"),limitation:"Synthetic ideal-emission admission fixture."};
 v.evaluateApertureRadiance=(q,ray):SceneRadianceEvaluationResult=>evaluator(q,(ray.originM.x>0?2:0)*1e-9);
 const reference=simulateEnvironmentSensorRawFrame(v),c=v.frame.capture;
 const {schemaVersion,engineApiVersion,resolvedGeometry,equivalentFocalLength35Mm,planes,...exposure}=c;void schemaVersion;void engineApiVersion;void resolvedGeometry;void equivalentFocalLength35Mm;void planes;
 const {capture,containerBitDepth,...frame}=v.frame;void capture;void containerBitDepth;
 const p=v.sites[0]!.environment.sceneBindings.providerProfile;
 const input:ExperimentalNativeSeparableEmissionInput={raw:{...frame,exposure,exposureWindow:v.exposureWindow,maximumOutputBytes:28,tileWidth:1},sceneBinding:v.sceneBinding,maximumGeometryEvaluations:100000,maximumSpectralCompositions:100000,
 contract:{schemaVersion:"0.1.0",kind:"uniform-spectrum-achromatic-ideal-emission",providerProfileId:p.profileId,sceneId:p.sceneId,illuminationProfileId:p.illuminationProfileId,materialResponseProfileId:p.materialResponseProfileId,wavelengthBasis:"vacuum",spectrum:[{wavelengthNanometers:1,spectralRadianceWattsPerSquareMeterSteradianNanometer:1e-9},{wavelengthNanometers:2000,spectralRadianceWattsPerSquareMeterSteradianNanometer:1e-9}],evidence:evidence("test:ideal-emission"),limitation:"Synthetic source; no separability verification or calibration."}};
 const provider:ExperimentalNativeSeparableEmissionProvider={readTile:async(r):Promise<NativeEnvironmentRawTile>=>({...r,sites:Array.from({length:r.width},(_,j)=>{const index=r.y*2+r.x+j,site=structuredClone(v.sites[index]!);site.environment.temporalIntegrationId=v.frame.frameId+":native:"+index;return site;})}),evaluateGeometry:q=>(q.apertureRay.originM.x>0?2:0)*(1+200*q.timeSecondsFromExposureStart),yieldControl:async():Promise<void>=>{}};
 return {input,provider,reference};
}
