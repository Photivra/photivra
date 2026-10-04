// SPDX-License-Identifier: Apache-2.0

/** Bounded source-radiance → optical/EQE → native packed RAW execution. */
import { calculateNativeRawPlan, createNativeRawTask, type NativeRawInput, type NativeRawOutput,
  type NativeRawTask, type NativeRawTileRequest, type NativeRawTaskState } from "./native-raw.js";
import { planEnvironmentRawSite, type SimulateEnvironmentSensorRawFrameInput } from "./environment-raw-producer.js";
import { executeEnvironmentSensorPhotoSignal } from "../sensor/environment-photo-signal.js";
import { calculateSensorDarkCurrentCharge } from "../sensor/dark-current.js";
import { parseEvidenceList } from "../core/evidence-provenance.js";
import { requireAllowlistedRecord, requirePublicOpaqueId } from "../core/record-validation.js";
import { stringifyCanonicalJson } from "../core/canonical-json.js";
import { freezeOwnedData } from "../core/owned-data.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";

import {planSeparableEmissionPhotoSignal,executeSeparableEmissionPhotoSignal,type SeparableEmissionContract,type SeparableEmissionGeometryRequest} from "../sensor/separable-emission.js";

export interface NativeEnvironmentRawInput {
  raw: NativeRawInput;
  sceneBinding: SimulateEnvironmentSensorRawFrameInput["sceneBinding"];
  /** Full-event admission budget; maximum 2 billion calls. No convergence is inferred. */
  maximumProviderEvaluations: number;
}
export interface NativeEnvironmentRawTile extends NativeRawTileRequest {
  sites: SimulateEnvironmentSensorRawFrameInput["sites"];
}
export interface NativeEnvironmentRawProvider {
  /** Supplies physical site profiles, not photo counts or precomputed RAW codes. */
  readTile(request: Readonly<NativeRawTileRequest>,signal:AbortSignal):Promise<NativeEnvironmentRawTile>;
  evaluateRadiance: SimulateEnvironmentSensorRawFrameInput["evaluateRadiance"];
  evaluateApertureRadiance?: SimulateEnvironmentSensorRawFrameInput["evaluateApertureRadiance"];
  /** Optional bounded diagnostic observer; counts are expectation values before any noise/clamp/ADC. */
  observePhotoTile?(tile:Readonly<NativeEnvironmentPhotoTile>,signal:AbortSignal):void|Promise<void>;
  yieldControl(signal:AbortSignal):Promise<void>;
}
export interface NativeEnvironmentPhotoTile extends NativeRawTileRequest {
  sites:readonly {nativeIndex:number;expectedIncidentPhotonCount:number;expectedGeneratedElectronCount:number}[];
}
export interface NativeEnvironmentRawOutput {
  raw: NativeRawOutput;
  sceneBinding: NativeEnvironmentRawInput["sceneBinding"];
  providerEvaluationCount: number;
  upstreamOrigin: "executed-environment-query-provider-optics-psf-eqe";
  providerTransportVerified: false;
  productionPlanActivated: false;
}
export interface NativeEnvironmentRawTask extends Omit<NativeRawTask,"takeOutput"> {
  readonly providerEvaluationCount: number;
  takeOutput(): NativeEnvironmentRawOutput;
}
function canonical(value:unknown):string {
  return stringifyCanonicalJson(value,{undefinedObjectProperties:"omit",nonFiniteNumberMessage:"Invalid native scene binding.",unsupportedValueMessage:"Invalid native scene binding."});
}
/** Every tile is planned and admission-checked before its radiance callbacks; no partial output escapes. */
export function createNativeEnvironmentRawTask(input:NativeEnvironmentRawInput,provider:NativeEnvironmentRawProvider):NativeEnvironmentRawTask {
  return createNativeEnvironmentRawTaskInternal(input,provider);
}
interface ExperimentalEmission {
 contract:SeparableEmissionContract;
 maximumSpectralCompositions:number;
 evaluateGeometry:(request:Readonly<SeparableEmissionGeometryRequest>)=>number;
 geometryEvaluations:number;
 spectralCompositions:number;
}
function createNativeEnvironmentRawTaskInternal(input:NativeEnvironmentRawInput,provider:NativeEnvironmentRawProvider,emission?:ExperimentalEmission):NativeEnvironmentRawTask {
  const r=requireAllowlistedRecord(input,["raw","sceneBinding","maximumProviderEvaluations"],"Invalid native environment input.");
  const plan=calculateNativeRawPlan(input.raw),binding=requireAllowlistedRecord(r.sceneBinding,["sceneStateId","providerSceneId","evidence"],"Invalid native scene binding.");
  const sceneBinding=freezeOwnedData({sceneStateId:requirePublicOpaqueId(binding.sceneStateId,"Invalid scene-state ID."),providerSceneId:requirePublicOpaqueId(binding.providerSceneId,"Invalid provider-scene ID."),evidence:parseEvidenceList(binding.evidence,"nativeEnvironmentSceneBinding.evidence")});
  if(sceneBinding.sceneStateId!==plan.exposure.sceneStateId||plan.exposure.sceneTimeSeconds!==0||!plan.exposureWindow||
    typeof r.maximumProviderEvaluations!=="number"||!Number.isSafeInteger(r.maximumProviderEvaluations)||r.maximumProviderEvaluations<plan.pixelCount||r.maximumProviderEvaluations>2_000_000_000)
    throw new InvalidConfigurationError("Native environment requires opening-reference scene binding, an explicit shutter event and bounded full-event query budget.");
  if(!provider||typeof provider.readTile!=="function"||typeof provider.evaluateRadiance!=="function"||typeof provider.yieldControl!=="function"||
    (provider.evaluateApertureRadiance!==undefined&&typeof provider.evaluateApertureRadiance!=="function")||
    (provider.observePhotoTile!==undefined&&typeof provider.observePhotoTile!=="function"))throw new InvalidConfigurationError("Native environment requires physical source callbacks and host yields.");
  const read=provider.readTile.bind(provider),evaluate=provider.evaluateRadiance.bind(provider),aperture=provider.evaluateApertureRadiance?.bind(provider),yieldControl=provider.yieldControl.bind(provider);
  const maximum=r.maximumProviderEvaluations,observe=provider.observePhotoTile?.bind(provider);
  let evaluations=0,shared:string|undefined;
  const task=createNativeRawTask(input.raw,{
    async readTile(request,signal){
      const supplied=await read(request,signal);
      if(signal.aborted)throw new InvalidConfigurationError("Native environment acquisition aborted.");
      const tile=requireAllowlistedRecord(supplied,["captureId","frameId","x","y","width","height","sites"],"Invalid physical source tile.");
      for(const key of Object.keys(request) as (keyof NativeRawTileRequest)[])if(tile[key]!==request[key])throw new InvalidConfigurationError("Physical source tile identity mismatch.");
      if(!Array.isArray(tile.sites)||tile.sites.length!==request.width||Array.from({length:request.width},(_,i)=>i in (tile.sites as unknown[])).includes(false))throw new InvalidConfigurationError("Physical source tile needs exact native coverage.");
      const sites=structuredClone(tile.sites) as SimulateEnvironmentSensorRawFrameInput["sites"];
      let tileCount=0,tileGeometryCount=0;
      const emissionPlans:ReturnType<typeof planSeparableEmissionPhotoSignal>[]=[];
      const plans=sites.map((site,j)=>{
        requireAllowlistedRecord(site,["environment","darkCurrentProfile","operatingTemperatureC","charge","readout"],"Invalid physical site input.");
        const e=site.environment,index=request.y*plan.exposure.geometry.nativeRaster.pixelWidth+request.x+j;
        if(e.temporalIntegrationId!==plan.frame.frameId+":native:"+index)throw new InvalidConfigurationError("Native environment IDs must bind the absolute native index.");
        const state=canonical({sceneBindings:e.sceneBindings,optics:e.optics,motion:e.motion,psf:e.psf,pupil:e.pupil,fieldThroughput:e.fieldThroughput});
        shared??=state;if(state!==shared)throw new InvalidConfigurationError("Native event requires one shared source/optical/motion state.");
        const p=planEnvironmentRawSite(site,request.y*plan.exposure.geometry.nativeRaster.pixelWidth+request.x+j,plan.frame,sceneBinding,plan.exposureWindow!);
        if(p.owned.pupil&&!aperture)throw new InvalidConfigurationError("Pupil capture requires origin-aware source visibility.");
        tileCount+=p.count;
        if(emission){
          const prepared=planSeparableEmissionPhotoSignal(p.owned,emission.contract);
          emissionPlans.push(prepared);
          tileGeometryCount+=p.count/p.spectralQuadrature.nodes.length;
        }
        if(tileCount>100_000||(emission ? emission.geometryEvaluations+tileGeometryCount>maximum||emission.spectralCompositions+tileCount>emission.maximumSpectralCompositions : evaluations+tileCount>maximum))throw new InvalidConfigurationError("Native environment exceeds tile or full-event query budget.");
        return p;
      });
      const rawSites=sites.map((site,j)=>{
        const result=emission ? executeSeparableEmissionPhotoSignal(emissionPlans[j]!,emission.evaluateGeometry,signal,kind=>{
          if(kind==="geometry")emission.geometryEvaluations++;else emission.spectralCompositions++;
        }).photoSignal : executeEnvironmentSensorPhotoSignal(plans[j]!,q=>{if(signal.aborted)throw new InvalidConfigurationError("Native source evaluation aborted.");evaluations++;return evaluate(q);},aperture?(q,ray):ReturnType<typeof evaluate>=>{if(signal.aborted)throw new InvalidConfigurationError("Native aperture evaluation aborted.");evaluations++;return aperture(q,ray);}:undefined);
        const photoSignal=result.value.photo.value.photoSignal;
        const darkCharge=calculateSensorDarkCurrentCharge({exposure:photoSignal,darkCurrentProfile:site.darkCurrentProfile,operatingTemperatureC:site.operatingTemperatureC}).value;
        return {...site.readout,charge:{...site.charge,photoSignal,darkCharge}};
      });
      if(signal.aborted)throw new InvalidConfigurationError("Native photo observation aborted.");
      if(observe)await observe(freezeOwnedData({...request,sites:rawSites.map((s,j)=>({nativeIndex:request.y*plan.exposure.geometry.nativeRaster.pixelWidth+request.x+j,
        expectedIncidentPhotonCount:s.charge.photoSignal.expectedIncidentPhotonCount,expectedGeneratedElectronCount:s.charge.photoSignal.expectedGeneratedElectronCount}))}),signal);
      return {...request,sites:rawSites};
    },yieldControl
  });
  return {plan:task.plan,get state():NativeRawTaskState{return task.state;},get completedTileCount():number{return task.completedTileCount;},get providerEvaluationCount():number{return evaluations;},
    run:():Promise<void>=>task.run(),cancel:():void=>task.cancel(),dispose:():void=>task.dispose(),
    takeOutput():NativeEnvironmentRawOutput{return {raw:task.takeOutput(),sceneBinding,providerEvaluationCount:evaluations,upstreamOrigin:"executed-environment-query-provider-optics-psf-eqe",providerTransportVerified:false,productionPlanActivated:false};}
  };
}

/** Experimental additive source contract; legacy task/caps and production activation are unchanged. */
export interface ExperimentalNativeSeparableEmissionInput {
 raw:NativeRawInput;
 sceneBinding:NativeEnvironmentRawInput["sceneBinding"];
 contract:SeparableEmissionContract;
 maximumGeometryEvaluations:number;
 /** Explicit scalar spectral work, not hidden inside geometry callback count. Draft ceiling: 4 billion. */
 maximumSpectralCompositions:number;
}
export interface ExperimentalNativeSeparableEmissionProvider extends Omit<NativeEnvironmentRawProvider,"evaluateRadiance"|"evaluateApertureRadiance"> {
 evaluateGeometry:(request:Readonly<SeparableEmissionGeometryRequest>)=>number;
}
export interface ExperimentalNativeSeparableEmissionTask extends Omit<NativeEnvironmentRawTask,"takeOutput"|"providerEvaluationCount"> {
 readonly geometryEvaluationCount:number;
 readonly spectralCompositionCount:number;
 takeOutput():Omit<NativeEnvironmentRawOutput,"providerEvaluationCount"|"upstreamOrigin"> & {
  upstreamOrigin:"executed-explicit-separable-ideal-emission-optics-eqe";
  geometryEvaluationCount:number;
  spectralCompositionCount:number;
  sourceSeparabilityVerified:false;
  experimentalContract:true;
 };
}
/**
 * Repository-only draft native route. Reuses bounded tile scheduling, immutable RAW,
 * host yields, cancellation and all existing optical/sensor reducers. Separate budgets
 * are explicit; the 2-billion legacy provider and 100000 logical tile caps are unchanged.
 */
export function createExperimentalNativeSeparableEmissionTask(input:ExperimentalNativeSeparableEmissionInput,provider:ExperimentalNativeSeparableEmissionProvider):ExperimentalNativeSeparableEmissionTask {
 requireAllowlistedRecord(input,["raw","sceneBinding","contract","maximumGeometryEvaluations","maximumSpectralCompositions"],"Invalid experimental native emission input.");
 if(!provider||typeof provider.evaluateGeometry!=="function"||typeof provider.readTile!=="function"||typeof provider.yieldControl!=="function"||(provider.observePhotoTile!==undefined&&typeof provider.observePhotoTile!=="function")||!Number.isSafeInteger(input.maximumSpectralCompositions)||input.maximumSpectralCompositions<1||input.maximumSpectralCompositions>4_000_000_000)
  throw new InvalidConfigurationError("Experimental emission requires explicit geometry and at most four-billion scalar spectral compositions.");
 const emission:ExperimentalEmission={contract:structuredClone(input.contract),maximumSpectralCompositions:input.maximumSpectralCompositions,evaluateGeometry:provider.evaluateGeometry.bind(provider),geometryEvaluations:0,spectralCompositions:0};
 const unsupported=():never=>{throw new InvalidConfigurationError("Experimental emission cannot consume arbitrary radiance callbacks.");};
 const task=createNativeEnvironmentRawTaskInternal({raw:input.raw,sceneBinding:input.sceneBinding,maximumProviderEvaluations:input.maximumGeometryEvaluations},
  {readTile:provider.readTile.bind(provider),yieldControl:provider.yieldControl.bind(provider),...(provider.observePhotoTile===undefined?{}:{observePhotoTile:provider.observePhotoTile.bind(provider)}),evaluateRadiance:unsupported,evaluateApertureRadiance:unsupported},emission);
 return {plan:task.plan,get state():NativeRawTaskState{return task.state;},get completedTileCount():number{return task.completedTileCount;},
  get geometryEvaluationCount():number{return emission.geometryEvaluations;},get spectralCompositionCount():number{return emission.spectralCompositions;},
  run:():Promise<void>=>task.run(),cancel:():void=>task.cancel(),dispose:():void=>task.dispose(),takeOutput():ReturnType<ExperimentalNativeSeparableEmissionTask["takeOutput"]>{
   const {providerEvaluationCount,upstreamOrigin,...output}=task.takeOutput();void providerEvaluationCount;void upstreamOrigin;
   return {...output,upstreamOrigin:"executed-explicit-separable-ideal-emission-optics-eqe",geometryEvaluationCount:emission.geometryEvaluations,spectralCompositionCount:emission.spectralCompositions,sourceSeparabilityVerified:false,experimentalContract:true};
  }
 };
}
