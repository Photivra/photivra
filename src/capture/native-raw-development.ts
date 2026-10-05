// SPDX-License-Identifier: Apache-2.0

/** Exact packed RAW reconstruction and shared color/SDR development, with bounded pixel tiles. */
import { calculateNativeRawPlan, type NativeRawInput, type NativeRawOutput, type NativeRawTaskState } from "./native-raw.js";
import { parseRawReconstructionPhaseProfiles, type RawFrameReconstructionPhaseProfile } from "./raw-frame-reconstruction.js";
import { calculateRawReconstructionChannel } from "../sensor/raw-reconstruction.js";
import { resolveColorSamplingSite } from "../sensor/color-sampling.js";
import { parseExportSensorColorProfile, type ExportSensorColorProfile } from "./photographic-export.js";
import { prepareSensorColorDevelopment, invertSensorColorMatrix, sensorColorReferenceWhite } from "../color/sensor-color-development.js";
import { calculateSdrRendering, parseSdrRenderingProfile, type SdrRenderingProfile, type SdrRenderingResult } from "../output/sdr-rendering.js";
import { transformOrientedRasterPointToNative } from "../output/capture-geometry.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";
import { requireAllowlistedRecord } from "../core/record-validation.js";
import { stringifyCanonicalJson } from "../core/canonical-json.js";
import { freezeOwnedData } from "../core/owned-data.js";

export interface NativeRawDevelopmentInput {
  raw: NativeRawOutput;
  phaseProfiles: readonly RawFrameReconstructionPhaseProfile[];
  colorProfile: ExportSensorColorProfile;
  whiteBalance: "not-required" | "apply-resolved-sensor-gains";
  rendering: SdrRenderingProfile;
  /** Includes one owned packed RAW copy plus integer output; not caller buffers, process heap or GPU. */
  maximumRetainedPayloadBytes: number;
}
export interface NativeRawDevelopmentOutput {
  raw: NativeRawOutput;
  phaseProfiles: readonly RawFrameReconstructionPhaseProfile[];
  colorProfile: ExportSensorColorProfile;
  whiteBalance: NativeRawDevelopmentInput["whiteBalance"];
  width: number;
  height: number;
  integerSamples: Uint8Array | Uint16Array;
  diagnostics: SdrRenderingResult["diagnostics"];
  outputEncoding: SdrRenderingResult["outputEncoding"];
  rendering: SdrRenderingProfile;
  displayAdaptation: SdrRenderingResult["displayAdaptation"];
  imageDataPairing: "derived-from-exact-packed-native-raw";
  producerOriginVerified: false;
}
export interface NativeRawDevelopmentTask {
  readonly state: NativeRawTaskState;
  run(): Promise<void>;
  cancel(): void;
  dispose(): void;
  takeOutput(): NativeRawDevelopmentOutput;
}
function canonical(value: unknown): string {
  return stringifyCanonicalJson(value,{undefinedObjectProperties:"reject",nonFiniteNumberMessage:"Invalid RAW metadata.",unsupportedValueMessage:"Invalid RAW metadata."});
}
function validateRaw(raw: NativeRawOutput): NativeRawOutput["plan"] {
  requireAllowlistedRecord(raw,["plan","codes","blackLevels","digitalSaturationCodes","saturationFlags"],"Invalid packed RAW output.");
  const p=raw.plan;
  if(!p?.exposure||!p.frame)throw new InvalidConfigurationError("Packed RAW requires complete exposure and frame metadata.");
  const {engineApiVersion,resolvedGeometry,equivalentFocalLength35Mm,...exposure}=p.exposure;
  void engineApiVersion;void resolvedGeometry;void equivalentFocalLength35Mm;
  const {capture,containerBitDepth,...frame}=p.frame;void capture;void containerBitDepth;
  const input: NativeRawInput={exposure,...frame,maximumOutputBytes:p.outputBytes,...(p.tileWidth===undefined?{}:{tileWidth:p.tileWidth}),...(p.exposureWindow?{exposureWindow:p.exposureWindow}:{})};
  const plan=calculateNativeRawPlan(input);
  if(canonical(p)!==canonical(plan))throw new InvalidConfigurationError("Packed RAW metadata is stale or inconsistent.");
  for(const [a,type] of [[raw.codes,Uint16Array],[raw.blackLevels,Uint16Array],[raw.digitalSaturationCodes,Uint16Array],[raw.saturationFlags,Uint8Array]] as const)
    if(!(a instanceof type)||!(a.buffer instanceof ArrayBuffer)||a.length!==plan.pixelCount||a.buffer.byteLength!==a.byteLength)throw new InvalidConfigurationError("Packed RAW storage must be exact owned native arrays.");
  return plan;
}
/**
 * Validates complete phase/halo support, snapshots RAW once, and yields between 256-pixel output tiles.
 * Retains explicit acquisition tile width when reconstructing the exact packed plan. Omitted width
 * preserves legacy plan shape; inconsistent tile counts or unsupported widths fail validation.
 * Acquisition chunk width changes neither CFA/seed coordinates nor development pixels, and does
 * not establish transport or device-resource qualification.
 */
export function createNativeRawDevelopmentTask(input: NativeRawDevelopmentInput,
  yieldControl: (signal:AbortSignal)=>Promise<void>): NativeRawDevelopmentTask {
  const r=requireAllowlistedRecord(input,["raw","phaseProfiles","colorProfile","whiteBalance","rendering","maximumRetainedPayloadBytes"],"Invalid native RAW development input.");
  if(typeof yieldControl!=="function")throw new InvalidConfigurationError("Development requires a host event-loop yield.");
  const plan=validateRaw(input.raw),g=plan.exposure.resolvedGeometry,native=plan.exposure.geometry.nativeRaster;
  const phases=freezeOwnedData(parseRawReconstructionPhaseProfiles(r.phaseProfiles,plan.frame.modeId,plan.frame.colorSamplingProfile));
  const color=freezeOwnedData(parseExportSensorColorProfile(r.colorProfile)),profile=freezeOwnedData(parseSdrRenderingProfile(r.rendering));
  const crop=g.output.cropRect,raster=g.output.raster,active=g.activeCapture.nativeRect,intent=plan.exposure.whiteBalanceIntent;
  if(color.colorSamplingProfileId!==plan.frame.colorSamplingProfile.profileId||phases.some(p=>canonical(p.profile.kernels.map(k=>k.outputChannelId))!==canonical(color.channelIds))||
    (r.whiteBalance!=="not-required"&&r.whiteBalance!=="apply-resolved-sensor-gains")||(intent!==null)!==(r.whiteBalance==="apply-resolved-sensor-gains")||
    raster.pixelWidth!==crop.width||raster.pixelHeight!==crop.height)throw new InvalidConfigurationError("Development requires bound sensor RGB, explicit one-time WB and 1:1 output crop.");
  const whiteBalance=r.whiteBalance;
  const bytes=plan.outputBytes+raster.pixelWidth*raster.pixelHeight*3*profile.bitDepth/8;
  if(typeof r.maximumRetainedPayloadBytes!=="number"||!Number.isSafeInteger(r.maximumRetainedPayloadBytes)||r.maximumRetainedPayloadBytes<bytes)throw new InvalidConfigurationError("Development exceeds retained output budget.");
  const gains=intent?[intent.channelGains.red,intent.channelGains.green,intent.channelGains.blue]:[1,1,1];
  if(sensorColorReferenceWhite(invertSensorColorMatrix(color.normalizedCameraChannelsToXyz)).some(x=>x<=0||!Number.isFinite(x)))throw new InvalidConfigurationError("Reference white requires positive camera coordinates.");
  const development=prepareSensorColorDevelopment(color.normalizedCameraChannelsToXyz,gains),layout=plan.frame.colorSamplingProfile.layout;
  if(layout.kind!=="periodic-mosaic")throw new InvalidConfigurationError("Development requires periodic CFA.");
  const nativeCorners=[{x:crop.x+.5,y:crop.y+.5},{x:crop.x+crop.width-.5,y:crop.y+crop.height-.5}].map(point=>{
    const p=transformOrientedRasterPointToNative({point,nativeRaster:g.activeCapture.raster,orientation:plan.exposure.geometry.orientation});return {x:Math.floor(p.x)+active.x,y:Math.floor(p.y)+active.y};
  });
  const minX=Math.min(...nativeCorners.map(p=>p.x)),maxX=Math.max(...nativeCorners.map(p=>p.x)),minY=Math.min(...nativeCorners.map(p=>p.y)),maxY=Math.max(...nativeCorners.map(p=>p.y));
  for(const phase of phases){
    const firstX=minX+(phase.phaseX-minX%layout.repeatWidthSites+layout.repeatWidthSites)%layout.repeatWidthSites;
    const firstY=minY+(phase.phaseY-minY%layout.repeatHeightSites+layout.repeatHeightSites)%layout.repeatHeightSites;
    if(firstX>maxX||firstY>maxY)continue;
    const lastX=maxX-(maxX-phase.phaseX+layout.repeatWidthSites)%layout.repeatWidthSites,lastY=maxY-(maxY-phase.phaseY+layout.repeatHeightSites)%layout.repeatHeightSites;
    for(const kernel of phase.profile.kernels)for(const c of kernel.contributions){
      if(firstX+c.offsetX<0||firstY+c.offsetY<0||lastX+c.offsetX>=native.pixelWidth||lastY+c.offsetY>=native.pixelHeight)throw new InvalidConfigurationError("Reconstruction halo leaves native RAW; no padding or renormalization.");
      const channel=resolveColorSamplingSite({profile:plan.frame.colorSamplingProfile,site:{x:firstX+c.offsetX,y:firstY+c.offsetY}}).mapping.channelId;
      if(channel!==c.sourceChannelId)throw new InvalidConfigurationError("Reconstruction source channel disagrees with absolute CFA phase.");
    }
  }
  // Numeric integrity before execution; signed values below black are preserved.
  for(let i=0;i<plan.pixelCount;i++)if(input.raw.blackLevels[i]!>=input.raw.digitalSaturationCodes[i]!||input.raw.codes[i]!>input.raw.digitalSaturationCodes[i]!||input.raw.saturationFlags[i]!>7)throw new InvalidConfigurationError("Invalid packed RAW code span or saturation flags.");
  const raw:NativeRawOutput={plan,codes:input.raw.codes.slice(),blackLevels:input.raw.blackLevels.slice(),digitalSaturationCodes:input.raw.digitalSaturationCodes.slice(),saturationFlags:input.raw.saturationFlags.slice()};
  const abort=new AbortController();let state:NativeRawTaskState="ready",output:NativeRawDevelopmentOutput|null=null,codes:Uint8Array|Uint16Array|null=null;
  function release(): void {raw.codes.fill(0);raw.blackLevels.fill(0);raw.digitalSaturationCodes.fill(0);raw.saturationFlags.fill(0);codes?.fill(0);codes=null;output=null;}
  function check(): void {if(abort.signal.aborted)throw new InvalidConfigurationError("Native RAW development aborted.");}
  return {get state():NativeRawTaskState{return state;},
    async run():Promise<void>{
      if(state!=="ready")throw new InvalidConfigurationError("Development task is single-use.");state="running";
      try{
        codes=profile.bitDepth===8?new Uint8Array(raster.pixelWidth*raster.pixelHeight*3):new Uint16Array(raster.pixelWidth*raster.pixelHeight*3);
        const diagnostics:SdrRenderingResult["diagnostics"]={renderingNegativeSampleCount:0,renderingAboveReferenceSampleCount:0,toneChangedSampleCount:0,gamutClippedLowSampleCount:0,gamutClippedHighSampleCount:0,captureSaturation:"not-consumed"};let encoding:SdrRenderingResult["outputEncoding"]|undefined,adaptation:SdrRenderingResult["displayAdaptation"]|undefined;
        for(let y=0;y<raster.pixelHeight;y++)for(let x=0;x<raster.pixelWidth;x+=256){
          check();const width=Math.min(256,raster.pixelWidth-x);
          {
            const rgb:number[]=[];
            for(let j=0;j<width;j++){
              const q=transformOrientedRasterPointToNative({point:{x:crop.x+x+j+.5,y:crop.y+y+.5},nativeRaster:g.activeCapture.raster,orientation:plan.exposure.geometry.orientation});
              const point={x:Math.floor(q.x)+active.x,y:Math.floor(q.y)+active.y};
              const phase=phases[(point.y%layout.repeatHeightSites)*layout.repeatWidthSites+point.x%layout.repeatWidthSites]!;
              const values=phase.profile.kernels.map(kernel=>calculateRawReconstructionChannel(kernel,point,(sx,sy)=>{
                const i=sy*native.pixelWidth+sx;return (raw.codes[i]!-raw.blackLevels[i]!)/(raw.digitalSaturationCodes[i]!-raw.blackLevels[i]!);
              }).linearBlackSubtractedNormalizedValue);
              rgb.push(...development.develop(values));
            }
            const rendered=calculateSdrRendering({sourceImageStateId:plan.frame.frameId+":developed",inputImageState:"color-transformed-linear-rgb",inputColorSpace:"linear-srgb-d65",whiteBalanceHandling:intent?"already-applied-upstream":"not-required",pixelWidth:width,pixelHeight:1,referenceWhiteValue:1,samples:rgb,profile}).value;
            codes.set(rendered.integerSamples,(y*raster.pixelWidth+x)*3);
            for(const key of ["renderingNegativeSampleCount","renderingAboveReferenceSampleCount","toneChangedSampleCount","gamutClippedLowSampleCount","gamutClippedHighSampleCount"] as const)diagnostics[key]+=rendered.diagnostics[key];encoding=rendered.outputEncoding;adaptation=rendered.displayAdaptation;
          }
          await yieldControl(abort.signal);check();
        }
        output={raw,phaseProfiles:phases,colorProfile:color,whiteBalance,width:raster.pixelWidth,height:raster.pixelHeight,integerSamples:codes!,diagnostics,rendering:profile,displayAdaptation:adaptation!,outputEncoding:encoding!,imageDataPairing:"derived-from-exact-packed-native-raw",producerOriginVerified:false};state="completed";
      }catch(error){release();if(!abort.signal.aborted){state="failed";abort.abort();}throw error;}
    },
    cancel():void{if(state==="ready"||state==="running"||state==="completed"){state="cancelled";abort.abort();release();}},
    dispose():void{if(state!=="transferred"){state="disposed";abort.abort();release();}},
    takeOutput():NativeRawDevelopmentOutput{if(state!=="completed"||!output)throw new InvalidConfigurationError("Development output unavailable.");const value=output;output=null;codes=null;state="transferred";return value;}
  };
}
