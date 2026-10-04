// SPDX-License-Identifier: Apache-2.0

/** Metadata-only admission and bounded execution of the existing native scalar RAW model. */
import { normalizeCaptureExposureMetadata, type SimulatedCaptureInput, type SimulatedCapture, type CaptureExposureSource } from "./simulated-capture.js";
import { ENGINE_API_VERSION } from "../core/version.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";
import { requireAllowlistedRecord, requirePublicOpaqueId } from "../core/record-validation.js";
import { freezeOwnedData } from "../core/owned-data.js";
import { parseCaptureModeProfile } from "../sensor/capture-mode.js";
import { parseSensorColorSamplingProfile } from "../sensor/color-sampling.js";
import { parseNativeEffectiveRasterColorSamplingBindingProfile, resolveCaptureModeColorSamplingContributors } from "../sensor/capture-color-sampling-binding.js";
import { calculateCaptureExposureWindows } from "../sensor/exposure-window.js";
import { SENSOR_RAW_PRODUCER_NOISE_MODEL, calculateNativeRawSite, parseNativeRawProducerSite,
  validateNativeRawReadoutIdentity, type NativeRawProducerFrameContext, type SensorRawProducerSiteInput,
  type SensorRawProducerExposureWindowInput } from "./sensor-raw-producer.js";

export const NATIVE_RAW_SCHEMA_VERSION = "0.1.0" as const;
export const NATIVE_RAW_LIMITS = Object.freeze({ maximumPixels: 24_000_000, maximumDimension: 16_384,
  tileWidth: 256, tileHeight: 1, outputBytesPerPixel: 7 });
/** A shooting event and source provenance, not a produced float master or committed RAW frame. */
export type NativeRawExposureInput = Omit<SimulatedCaptureInput, "planes" | "source"> & {source:CaptureExposureSource};
export type NativeRawExposure = Omit<SimulatedCapture, "schemaVersion" | "planes" | "source"> & {source:CaptureExposureSource};
export interface NativeRawInput {
  exposure: NativeRawExposureInput;
  frameId: string;
  modeId: string;
  captureModeProfile: NativeRawProducerFrameContext["captureModeProfile"];
  colorSamplingProfile: NativeRawProducerFrameContext["colorSamplingProfile"];
  bindingProfile: NativeRawProducerFrameContext["bindingProfile"];
  exposureWindow?: SensorRawProducerExposureWindowInput;
  maximumOutputBytes: number;
}
export interface NativeRawPlan {
  schemaVersion: typeof NATIVE_RAW_SCHEMA_VERSION;
  exposure: NativeRawExposure;
  frame: NativeRawProducerFrameContext;
  exposureWindow?: SensorRawProducerExposureWindowInput;
  pixelCount: number;
  outputBytes: number;
  tileCount: number;
  upstreamRadiometryVerified: false;
  seedSchedule: "capture-seed-plus-two-native-index-modulo-2-to-32-v1";
}
/** Rectangle is absolute full-native CFA space, before orientation, active crop or output scaling. */
export interface NativeRawTileRequest { captureId: string; frameId: string; x: number; y: number; width: number; height: number }
export interface NativeRawTile extends NativeRawTileRequest { sites: readonly SensorRawProducerSiteInput[] }
export interface NativeRawProvider {
  readTile(request: Readonly<NativeRawTileRequest>, signal: AbortSignal): Promise<NativeRawTile>;
  yieldControl(signal: AbortSignal): Promise<void>;
}
/** Sole-owner row-major arrays. They are not attachable to the bounded SensorRawFrame contract. */
export interface NativeRawOutput {
  plan: NativeRawPlan;
  codes: Uint16Array;
  blackLevels: Uint16Array;
  digitalSaturationCodes: Uint16Array;
  /** Bits 0,1,2: physical scalar clamp, pre-ADC clamp, digital saturation respectively. */
  saturationFlags: Uint8Array;
}
export type NativeRawTaskState = "ready" | "running" | "completed" | "cancelled" | "failed" | "disposed" | "transferred";
export interface NativeRawTask {
  readonly plan: NativeRawPlan;
  readonly state: NativeRawTaskState;
  readonly completedTileCount: number;
  run(): Promise<void>;
  cancel(): void;
  dispose(): void;
  takeOutput(): NativeRawOutput;
}
function windows(exposure: NativeRawExposure, schedule: SensorRawProducerExposureWindowInput,
  points: readonly {x:number;y:number}[]): ReturnType<typeof calculateCaptureExposureWindows>["value"] {
  const r=requireAllowlistedRecord(schedule,["shutterMechanism","nominalExposureDurationSeconds","opening","closing"],"Invalid RAW exposure schedule.");
  requireAllowlistedRecord(r.nominalExposureDurationSeconds,["value","unit","evidence"],"Invalid RAW nominal exposure.");
  for(const boundary of [r.opening,r.closing]){
    const b=requireAllowlistedRecord(boundary,["kind","directionNative","traversalDurationSeconds"],"Invalid RAW exposure boundary.");
    if(b.directionNative!==undefined)requireAllowlistedRecord(b.directionNative,["value","evidence"],"Invalid RAW scan direction.");
    if(b.traversalDurationSeconds!==undefined)requireAllowlistedRecord(b.traversalDurationSeconds,["value","unit","evidence"],"Invalid RAW scan duration.");
  }
  const result=calculateCaptureExposureWindows({...schedule,nativeRaster:exposure.geometry.nativeRaster,samplePointsNative:points});
  if(result.value.nominalExposureDurationSeconds.value!==exposure.exposure.shutterSeconds)throw new InvalidConfigurationError("RAW schedule differs from exposure duration.");
  return result.value;
}
/** Full raster/resource/profile admission before callbacks or output allocation; no placeholder plane. */
export function calculateNativeRawPlan(input: NativeRawInput): NativeRawPlan {
  const r=requireAllowlistedRecord(input,["exposure","frameId","modeId","captureModeProfile","colorSamplingProfile","bindingProfile","exposureWindow","maximumOutputBytes"],"Invalid native RAW input.");
  const exposure=normalizeCaptureExposureMetadata(r.exposure,ENGINE_API_VERSION,true),native=exposure.geometry.nativeRaster;
  const pixelCount=native.pixelWidth*native.pixelHeight,outputBytes=pixelCount*NATIVE_RAW_LIMITS.outputBytesPerPixel;
  if(pixelCount>NATIVE_RAW_LIMITS.maximumPixels||native.pixelWidth>NATIVE_RAW_LIMITS.maximumDimension||native.pixelHeight>NATIVE_RAW_LIMITS.maximumDimension||
    !Number.isSafeInteger(r.maximumOutputBytes)||typeof r.maximumOutputBytes!=="number"||r.maximumOutputBytes<outputBytes)throw new InvalidConfigurationError("Native RAW raster exceeds output admission budget.");
  const frame={frameId:requirePublicOpaqueId(r.frameId,"Invalid RAW frame ID."),capture:exposure,
    modeId:requirePublicOpaqueId(r.modeId,"Invalid RAW mode ID."),containerBitDepth:16 as const,
    captureModeProfile:parseCaptureModeProfile(r.captureModeProfile),colorSamplingProfile:parseSensorColorSamplingProfile(r.colorSamplingProfile),
    bindingProfile:parseNativeEffectiveRasterColorSamplingBindingProfile(r.bindingProfile)};
  const mode=frame.captureModeProfile.modes.find(m=>m.modeId===frame.modeId);
  if(exposure.noise.model.id!==SENSOR_RAW_PRODUCER_NOISE_MODEL.id||exposure.noise.model.version!==SENSOR_RAW_PRODUCER_NOISE_MODEL.version||
    frame.colorSamplingProfile.layout.kind!=="periodic-mosaic"||mode?.acquisition.kind!=="single-frame"||mode.perFrameSampling.kind!=="native-effective-raster"||(mode.reconstructionStages?.length??0)!==0)
    throw new InvalidConfigurationError("Native RAW requires exact noise identity and single-frame native periodic CFA.");
  // Binding is global and affine; validate both corners before any provider work.
  for(const p of [{x:0,y:0},{x:native.pixelWidth-1,y:native.pixelHeight-1}]){
    const c=resolveCaptureModeColorSamplingContributors({nativeRaster:native,captureModeProfile:frame.captureModeProfile,modeId:frame.modeId,colorSamplingProfile:frame.colorSamplingProfile,bindingProfile:frame.bindingProfile,modeSampleIndexFullFrame:p});
    if(c.totalContributorSites!==1||c.channelComposition.kind!=="single-channel")throw new InvalidConfigurationError("Native RAW must preserve one native CFA site per sample.");
  }
  const schedule=r.exposureWindow===undefined?undefined:structuredClone(r.exposureWindow) as SensorRawProducerExposureWindowInput;
  // Supported linear scan extrema occur at raster corners. Check them before acquisition.
  if(schedule)windows(exposure,schedule,[{x:.5,y:.5},{x:native.pixelWidth-.5,y:.5},{x:.5,y:native.pixelHeight-.5},{x:native.pixelWidth-.5,y:native.pixelHeight-.5}]);
  return freezeOwnedData({schemaVersion:NATIVE_RAW_SCHEMA_VERSION,exposure,frame,pixelCount,outputBytes,
    tileCount:Math.ceil(native.pixelWidth/NATIVE_RAW_LIMITS.tileWidth)*native.pixelHeight,
    ...(schedule?{exposureWindow:schedule}:{}),upstreamRadiometryVerified:false as const,
    seedSchedule:"capture-seed-plus-two-native-index-modulo-2-to-32-v1" as const});
}
/** Executes validated EQE/dark/completeness events through the shared reference scalar physics. */
export function createNativeRawTask(input: NativeRawInput,provider: NativeRawProvider): NativeRawTask {
  const plan=calculateNativeRawPlan(input);
  if(!provider||typeof provider.readTile!=="function"||typeof provider.yieldControl!=="function")throw new InvalidConfigurationError("Native RAW requires reader and host event-loop yield.");
  const read=provider.readTile.bind(provider),yieldControl=provider.yieldControl.bind(provider),abort=new AbortController();
  const native=plan.exposure.geometry.nativeRaster;
  let state:NativeRawTaskState="ready",count=0,output:NativeRawOutput|null=null,first:SensorRawProducerSiteInput|undefined;
  function release(): void {if(output){output.codes.fill(0);output.blackLevels.fill(0);output.digitalSaturationCodes.fill(0);output.saturationFlags.fill(0);}output=null;first=undefined;}
  function active(): void {if(abort.signal.aborted)throw new InvalidConfigurationError("Native RAW execution aborted.");}
  return {plan,get state(): NativeRawTaskState {return state;},get completedTileCount(): number {return count;},
    async run(): Promise<void> {
      if(state!=="ready")throw new InvalidConfigurationError("Native RAW task is single-use.");state="running";
      try{
        output={plan,codes:new Uint16Array(plan.pixelCount),blackLevels:new Uint16Array(plan.pixelCount),digitalSaturationCodes:new Uint16Array(plan.pixelCount),saturationFlags:new Uint8Array(plan.pixelCount)};
        for(let y=0;y<native.pixelHeight;y++)for(let x=0;x<native.pixelWidth;x+=NATIVE_RAW_LIMITS.tileWidth){
          active();const request=Object.freeze({captureId:plan.exposure.captureId,frameId:plan.frame.frameId,x,y,width:Math.min(NATIVE_RAW_LIMITS.tileWidth,native.pixelWidth-x),height:1});
          {
            const supplied=await read(request,abort.signal);active();
            const tile=requireAllowlistedRecord(supplied,["captureId","frameId","x","y","width","height","sites"],"Invalid native RAW tile.");
            for(const key of Object.keys(request) as (keyof NativeRawTileRequest)[])if(tile[key]!==request[key])throw new InvalidConfigurationError("Native RAW tile identity mismatch.");
            if(!Array.isArray(tile.sites)||tile.sites.length!==request.width||Array.from({length:request.width},(_,i)=>i in (tile.sites as unknown[])).includes(false))throw new InvalidConfigurationError("Native RAW tile needs exact dense coverage.");
            const timing=plan.exposureWindow?windows(plan.exposure,plan.exposureWindow,Array.from({length:request.width},(_,i)=>({x:x+i+.5,y:y+.5}))):undefined;
            const sites=tile.sites.map((site,j)=>parseNativeRawProducerSite(site,y*native.pixelWidth+x+j,plan.frame,timing?.samples[j]));
            first??=sites[0];for(const s of sites)validateNativeRawReadoutIdentity(s,first!);
            // Every site in this tile is validated before writing owned output. Failures never publish partial output.
            for(let j=0;j<sites.length;j++){
              const index=y*native.pixelWidth+x+j,r=calculateNativeRawSite(sites[j]!,plan.exposure.noise.seedUint32,index).readout.value;
              output.codes[index]=r.rawCode;output.blackLevels[index]=r.blackLevelCode;output.digitalSaturationCodes[index]=r.digitalSaturationCode;
              output.saturationFlags[index]=Number(r.physicalScalarSaturationApplied)|Number(r.preAdcSaturationApplied)<<1|Number(r.digitalSaturationApplied)<<2;
            }
            count++;
          }
          await yieldControl(abort.signal);active();
        }
        first=undefined;state="completed";
      }catch(error){release();if(!abort.signal.aborted){state="failed";abort.abort();}throw error;}
    },
    cancel(): void {if(state==="ready"||state==="running"||state==="completed"){state="cancelled";abort.abort();release();}},
    dispose(): void {if(state!=="transferred"){state="disposed";abort.abort();release();}},
    takeOutput(): NativeRawOutput {if(state!=="completed"||!output)throw new InvalidConfigurationError("Native RAW output unavailable.");const result=output;output=null;first=undefined;state="transferred";return result;}
  };
}
