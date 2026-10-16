// SPDX-License-Identifier: Apache-2.0

/** Bounded source-radiance → optical/EQE → native packed RAW execution. */
import { calculateNativeRawPlan, createNativeRawTaskWithCadence, type NativeRawInput, type NativeRawOutput,
  type NativeRawTask, type NativeRawTileRequest, type NativeRawTaskState } from "./native-raw.js";
import { createEnvironmentRawFrameCanonicalMemo, planEnvironmentRawSite, type SimulateEnvironmentSensorRawFrameInput } from "./environment-raw-producer.js";
import { DEFAULT_HOST_YIELD_CADENCE, createHostYieldGate, type HostYieldCadence } from "./host-yield-cadence.js";
import { executeEnvironmentSensorPhotoSignal } from "../sensor/environment-photo-signal.js";
import { composeNativeEnvironmentSensorSite, createNativeEnvironmentOpticalStageRecorder, createSensorStageRawTask,
  parseNativeEnvironmentOpticalStageRetention, type NativeEnvironmentOpticalStage, type NativeEnvironmentOpticalStageRetention,
  type NativeEnvironmentSensorStageInput, type NativeEnvironmentSensorStageProvider } from "./native-environment-optical-stage.js";
import { parseEvidenceList } from "../core/evidence-provenance.js";
import { requireAllowlistedRecord, requirePublicOpaqueId } from "../core/record-validation.js";
import { stringifyCanonicalJson } from "../core/canonical-json.js";
import { freezeOwnedData } from "../core/owned-data.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";

export interface NativeEnvironmentRawInput {
  raw: NativeRawInput;
  sceneBinding: SimulateEnvironmentSensorRawFrameInput["sceneBinding"];
  /** Full-event admission budget; maximum 2 billion calls. No convergence is inferred. */
  maximumProviderEvaluations: number;
  /**
   * Opt-in: retain the optical stage (per-site photo-signal expectations bound to every optical input) on the
   * output for createNativeEnvironmentSensorStageTask. Omission keeps the original behavior and output shape.
   */
  opticalStage?: NativeEnvironmentOpticalStageRetention;
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
  /** Present only when NativeEnvironmentRawInput.opticalStage was requested. The caller owns and disposes it. */
  opticalStage?: NativeEnvironmentOpticalStage;
}
export interface NativeEnvironmentRawTask extends Omit<NativeRawTask,"takeOutput"> {
  readonly providerEvaluationCount: number;
  takeOutput(): NativeEnvironmentRawOutput;
}
function canonical(value:unknown):string {
  return stringifyCanonicalJson(value,{undefinedObjectProperties:"omit",nonFiniteNumberMessage:"Invalid native scene binding.",unsupportedValueMessage:"Invalid native scene binding."});
}
/** Site-environment fields that one native event shares across every site (same set as the optical-stage binding). */
const SHARED_STATE_KEYS = ["sceneBindings","optics","motion","psf","pupil","fieldThroughput"] as const;
type SiteEnvironment = SimulateEnvironmentSensorRawFrameInput["sites"][number]["environment"];
/** The frame's first admitted shared state: its canonical string and its engine-owned (cloned) values. */
interface SharedStateReference {
  readonly canonical: string;
  readonly values: readonly unknown[];
  /** Arrays of the reference already checked to carry no holes or extra properties. */
  readonly cleanArrays: WeakSet<object>;
}
/**
 * Strict structural equality of structured-clone output against the reference: Object.is for primitives (0 and
 * -0 differ), identical prototypes limited to plain records and arrays, identical own keys in identical order,
 * and arrays with no holes or non-index properties. Anything else is unequal unless it is the same reference.
 * Equal values therefore serialize to the same canonical string and are interchangeable for every reader, so a
 * site may adopt the reference values. Recursion is bounded by the reference, which serialized without error.
 */
function samePlainData(value: unknown, reference: unknown, cleanArrays: WeakSet<object>): boolean {
  if (Object.is(value, reference)) return true;
  if (typeof value !== "object" || typeof reference !== "object" || value === null || reference === null) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.getPrototypeOf(reference)) return false;
  if (prototype === Array.prototype) {
    const a = value as unknown[], b = reference as unknown[], length = a.length;
    if (length !== b.length) return false;
    for (let index = 0; index < length; index++) if (!(index in a) || !(index in b) || !samePlainData(a[index], b[index], cleanArrays)) return false;
    // Holes are excluded above, so equal key counts exclude non-index properties as well.
    if (Object.keys(a).length !== length) return false;
    if (!cleanArrays.has(b)) { if (Object.keys(b).length !== length) return false; cleanArrays.add(b); }
    return true;
  }
  if (prototype !== Object.prototype && prototype !== null) return false;
  const a = value as Record<string, unknown>, b = reference as Record<string, unknown>, keys = Object.keys(a), referenceKeys = Object.keys(b);
  if (keys.length !== referenceKeys.length) return false;
  for (let index = 0; index < keys.length; index++) if (keys[index] !== referenceKeys[index]) return false;
  for (let index = 0; index < keys.length; index++) if (!samePlainData(a[keys[index]!], b[keys[index]!], cleanArrays)) return false;
  return true;
}
/**
 * Replaces a site's private cloned shared state with the frame reference values when every field is strictly
 * equal (#2, 2.0 performance). Every site then shares one engine-owned shared state, so its sampled PSF is
 * parsed and frozen once per frame and duplicate clones become garbage at once. `verified` holds clone objects
 * of the current tile already shown equal, so sites that the supplier built from one object compare in O(1).
 * Returns false, changing nothing, when any field differs; the caller then serializes as before.
 */
function adoptSharedState(environment: SiteEnvironment, reference: SharedStateReference, verified: unknown[]): boolean {
  const record = environment as unknown as Record<string, unknown>;
  for (let index = 0; index < SHARED_STATE_KEYS.length; index++) {
    const value = record[SHARED_STATE_KEYS[index]!];
    if (!(typeof value === "object" && value !== null && value === verified[index]) && !samePlainData(value, reference.values[index], reference.cleanArrays)) return false;
  }
  for (let index = 0; index < SHARED_STATE_KEYS.length; index++) {
    const key = SHARED_STATE_KEYS[index]!, value = record[key];
    if (value !== reference.values[index]) { verified[index] = value; record[key] = reference.values[index]; }
  }
  return true;
}
function parseSceneBinding(value: unknown): NativeEnvironmentRawInput["sceneBinding"] {
  const binding=requireAllowlistedRecord(value,["sceneStateId","providerSceneId","evidence"],"Invalid native scene binding.");
  return freezeOwnedData({sceneStateId:requirePublicOpaqueId(binding.sceneStateId,"Invalid scene-state ID."),providerSceneId:requirePublicOpaqueId(binding.providerSceneId,"Invalid provider-scene ID."),evidence:parseEvidenceList(binding.evidence,"nativeEnvironmentSceneBinding.evidence")});
}
/**
 * Every tile is planned and admission-checked before its radiance callbacks; no partial output escapes. The
 * host yield also runs between sites inside a tile once about 8 ms of work has elapsed (one budget shared with
 * the tile loop), and cancellation is checked after each such yield, so cancel() takes effect within about one
 * site's work. Yield cadence never changes tile requests, admission, callbacks or output.
 */
export function createNativeEnvironmentRawTask(input:NativeEnvironmentRawInput,provider:NativeEnvironmentRawProvider):NativeEnvironmentRawTask {
  return createNativeEnvironmentRawTaskWithCadence(input,provider,DEFAULT_HOST_YIELD_CADENCE);
}
/** Internal: explicit host-yield cadence. Cadence never changes tiles, callbacks or output. Not a root export. */
export function createNativeEnvironmentRawTaskWithCadence(input:NativeEnvironmentRawInput,provider:NativeEnvironmentRawProvider,
  cadence:HostYieldCadence):NativeEnvironmentRawTask {
  const r=requireAllowlistedRecord(input,["raw","sceneBinding","maximumProviderEvaluations","opticalStage"],"Invalid native environment input.");
  const plan=calculateNativeRawPlan(input.raw),sceneBinding=parseSceneBinding(r.sceneBinding);
  const retention=r.opticalStage===undefined?undefined:parseNativeEnvironmentOpticalStageRetention(r.opticalStage);
  if(sceneBinding.sceneStateId!==plan.exposure.sceneStateId||plan.exposure.sceneTimeSeconds!==0||!plan.exposureWindow||
    typeof r.maximumProviderEvaluations!=="number"||!Number.isSafeInteger(r.maximumProviderEvaluations)||r.maximumProviderEvaluations<plan.pixelCount||r.maximumProviderEvaluations>2_000_000_000)
    throw new InvalidConfigurationError("Native environment requires opening-reference scene binding, an explicit shutter event and bounded full-event query budget.");
  if(!provider||typeof provider.readTile!=="function"||typeof provider.evaluateRadiance!=="function"||typeof provider.yieldControl!=="function"||
    (provider.evaluateApertureRadiance!==undefined&&typeof provider.evaluateApertureRadiance!=="function")||
    (provider.observePhotoTile!==undefined&&typeof provider.observePhotoTile!=="function"))throw new InvalidConfigurationError("Native environment requires physical source callbacks and host yields.");
  const read=provider.readTile.bind(provider),evaluate=provider.evaluateRadiance.bind(provider),aperture=provider.evaluateApertureRadiance?.bind(provider),yieldControl=provider.yieldControl.bind(provider);
  const maximum=r.maximumProviderEvaluations,observe=provider.observePhotoTile?.bind(provider);
  let evaluations=0,shared:string|undefined,reference:SharedStateReference|undefined;
  const recorder=retention?createNativeEnvironmentOpticalStageRecorder(plan,sceneBinding,retention):undefined;
  const memo=createEnvironmentRawFrameCanonicalMemo(plan.frame,plan.exposureWindow!),gate=createHostYieldGate(cadence);
  const task=createNativeRawTaskWithCadence(input.raw,{
    async readTile(request,signal){
      const supplied=await read(request,signal);
      if(signal.aborted)throw new InvalidConfigurationError("Native environment acquisition aborted.");
      const tile=requireAllowlistedRecord(supplied,["captureId","frameId","x","y","width","height","sites"],"Invalid physical source tile.");
      for(const key of Object.keys(request) as (keyof NativeRawTileRequest)[])if(tile[key]!==request[key])throw new InvalidConfigurationError("Physical source tile identity mismatch.");
      if(!Array.isArray(tile.sites)||tile.sites.length!==request.width||Array.from({length:request.width},(_,i)=>i in (tile.sites as unknown[])).includes(false))throw new InvalidConfigurationError("Physical source tile needs exact native coverage.");
      // Private clone: planning adopts each site environment as engine-owned plan data without a second clone.
      const sites=structuredClone(tile.sites) as SimulateEnvironmentSensorRawFrameInput["sites"];
      // Host yield between sites on the shared time budget; cancellation is honored right after it.
      const pause=async():Promise<void>=>{
        if(!gate.due())return;
        await yieldControl(signal);
        if(signal.aborted)throw new InvalidConfigurationError("Native environment acquisition aborted.");
        gate.restart();
      };
      let tileCount=0;
      const plans:ReturnType<typeof planEnvironmentRawSite>[]=[],verified:unknown[]=[];
      for(let j=0;j<sites.length;j++){
        if(j>0)await pause();
        const site=sites[j]!;
        requireAllowlistedRecord(site,["environment","darkCurrentProfile","operatingTemperatureC","charge","readout"],"Invalid physical site input.");
        const e=site.environment,index=request.y*plan.exposure.geometry.nativeRaster.pixelWidth+request.x+j;
        if(e.temporalIntegrationId!==plan.frame.frameId+":native:"+index)throw new InvalidConfigurationError("Native environment IDs must bind the absolute native index.");
        // A site strictly equal to the frame's first shared state adopts it and skips serialization; otherwise the
        // canonical comparison runs exactly as before and decides acceptance or the same error.
        let state:string;
        if(reference!==undefined&&adoptSharedState(e,reference,verified))state=reference.canonical;
        else{
          state=canonical({sceneBindings:e.sceneBindings,optics:e.optics,motion:e.motion,psf:e.psf,pupil:e.pupil,fieldThroughput:e.fieldThroughput});
          shared??=state;if(state!==shared)throw new InvalidConfigurationError("Native event requires one shared source/optical/motion state.");
          reference??={canonical:state,values:SHARED_STATE_KEYS.map(key=>(e as unknown as Record<string,unknown>)[key]),cleanArrays:new WeakSet()};
        }
        const p=planEnvironmentRawSite(site,index,plan.frame,sceneBinding,plan.exposureWindow!,"engine-owned",memo);
        if(p.owned.pupil&&!aperture)throw new InvalidConfigurationError("Pupil capture requires origin-aware source visibility.");
        recorder?.admit(index,e,state);
        tileCount+=p.count;
        if(tileCount>100_000||evaluations+tileCount>maximum)throw new InvalidConfigurationError("Native environment exceeds tile or full-event query budget.");
        plans.push(p);
      }
      // Only value.photo is consumed, so per-evaluation diagnostics are not retained.
      const rawSites:ReturnType<typeof composeNativeEnvironmentSensorSite>[]=[];
      for(let j=0;j<sites.length;j++){
        await pause();
        const result=executeEnvironmentSensorPhotoSignal(plans[j]!,q=>{if(signal.aborted)throw new InvalidConfigurationError("Native source evaluation aborted.");evaluations++;return evaluate(q);},aperture?(q,ray):ReturnType<typeof evaluate>=>{if(signal.aborted)throw new InvalidConfigurationError("Native aperture evaluation aborted.");evaluations++;return aperture(q,ray);}:undefined,"photo-only");
        const photoSignal=result.value.photo.value.photoSignal;
        recorder?.record(request.y*plan.exposure.geometry.nativeRaster.pixelWidth+request.x+j,photoSignal);
        rawSites.push(composeNativeEnvironmentSensorSite(sites[j]!,photoSignal));
      }
      if(signal.aborted)throw new InvalidConfigurationError("Native photo observation aborted.");
      if(observe)await observe(freezeOwnedData({...request,sites:rawSites.map((s,j)=>({nativeIndex:request.y*plan.exposure.geometry.nativeRaster.pixelWidth+request.x+j,
        expectedIncidentPhotonCount:s.charge.photoSignal.expectedIncidentPhotonCount,expectedGeneratedElectronCount:s.charge.photoSignal.expectedGeneratedElectronCount}))}),signal);
      return {...request,sites:rawSites};
    },yieldControl
  },cadence,gate);
  // The frame reference is needed only while tiles are read; release it once the event settles.
  const settle=():void=>{reference=undefined;};
  return {plan:task.plan,get state():NativeRawTaskState{return task.state;},get completedTileCount():number{return task.completedTileCount;},get providerEvaluationCount():number{return evaluations;},
    run:():Promise<void>=>(recorder?task.run().catch((error:unknown)=>{if(task.state==="failed"||task.state==="cancelled"||task.state==="disposed")recorder.discard();throw error;}):task.run()).finally(settle),
    cancel:():void=>{if(task.state!=="transferred")recorder?.discard();task.cancel();},dispose:():void=>{if(task.state!=="transferred")recorder?.discard();task.dispose();},
    takeOutput():NativeEnvironmentRawOutput{
      // Finish retention first so a retention failure never strands the transferred RAW.
      const opticalStage=recorder&&task.state==="completed"?recorder.finish(evaluations):undefined;
      const raw=task.takeOutput();
      const base={raw,sceneBinding,providerEvaluationCount:evaluations,upstreamOrigin:"executed-environment-query-provider-optics-psf-eqe" as const,providerTransportVerified:false as const,productionPlanActivated:false as const};
      return opticalStage?{...base,opticalStage}:base;
    }
  };
}
/**
 * Re-runs only the sensor stage from a retained optical stage: no radiance callback is invoked. Use it when only
 * post-optics settings change (noise seed, ISO metadata and readout regime/gain, charge/dark/capacity profiles,
 * white-balance intent, capture identity or tile width); white balance and rendering are then applied by
 * createNativeRawDevelopmentTask as usual. RAW codes are bit-identical to a full createNativeEnvironmentRawTask
 * with the same final inputs, provided the radiance provider is a deterministic function of its request. Any
 * optical difference (scene binding, geometry or orientation, focal length, aperture, shutter or exposure window,
 * focus, frame/CFA/binding profiles, or any site environment field such as PSF, field throughput, pupil, motion,
 * spectral or temporal sampling and provider profiles) refuses with InvalidConfigurationError before output.
 * providerEvaluationCount is 0; the stage remains owned by the caller and is not consumed.
 */
export function createNativeEnvironmentSensorStageTask(input:NativeEnvironmentSensorStageInput,opticalStage:NativeEnvironmentOpticalStage,
  provider:NativeEnvironmentSensorStageProvider):NativeEnvironmentRawTask {
  const {task,sceneBinding}=createSensorStageRawTask(input,opticalStage,provider,parseSceneBinding);
  return {plan:task.plan,get state():NativeRawTaskState{return task.state;},get completedTileCount():number{return task.completedTileCount;},get providerEvaluationCount():number{return 0;},
    run:():Promise<void>=>task.run(),cancel:():void=>task.cancel(),dispose:():void=>task.dispose(),
    takeOutput():NativeEnvironmentRawOutput{return {raw:task.takeOutput(),sceneBinding,providerEvaluationCount:0,upstreamOrigin:"executed-environment-query-provider-optics-psf-eqe",providerTransportVerified:false,productionPlanActivated:false};}
  };
}
