// SPDX-License-Identifier: Apache-2.0

/** Exact packed RAW reconstruction and shared color/SDR development, with bounded pixel tiles. */
import { calculateNativeRawPlan, type NativeRawInput, type NativeRawOutput, type NativeRawTaskState } from "./native-raw.js";
import { parseRawReconstructionPhaseProfiles, type RawFrameReconstructionPhaseProfile } from "./raw-frame-reconstruction.js";
import { calculateRawReconstructionChannel } from "../sensor/raw-reconstruction.js";
import { resolveColorSamplingSite } from "../sensor/color-sampling.js";
import { parseExportSensorColorProfile, type ExportSensorColorProfile } from "./photographic-export.js";
import { prepareSensorColorDevelopment, type RawHighlightMode, type SensorColorDevelopment } from "../color/sensor-color-development.js";
import { calculateSdrRendering, parseSdrRenderingProfile, prepareSdrPixelTone, type SdrRenderingProfile, type SdrRenderingResult } from "../output/sdr-rendering.js";
import { renderSdrRunInto, type NativeTaskProgress, type SdrPixelCounts } from "../output/native-capture-sdr.js";
import { transformOrientedRasterPointToNative } from "../output/capture-geometry.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";
import { DEFAULT_HOST_YIELD_CADENCE, createHostYieldGate, type HostYieldCadence } from "./host-yield-cadence.js";
import { requireAllowlistedRecord } from "../core/record-validation.js";
import { stringifyCanonicalJson } from "../core/canonical-json.js";
import { freezeOwnedData } from "../core/owned-data.js";
import { createRawDevelopmentCounts, createRawPixelDeveloper, normalizedRawSite, rawSiteSaturated,
  type RawDevelopmentCounts, type RawDevelopmentSource } from "./raw-development-kernel.js";

export interface NativeRawDevelopmentInput {
  /**
   * Packed RAW. Ownership transfers to the task: on creation its five typed arrays are detached with
   * `ArrayBuffer.prototype.transfer` (zero-copy; the caller's arrays become length 0), or copied when
   * the runtime lacks `transfer`. The developed output returns the same RAW, now owned by the output.
   */
  raw: NativeRawOutput;
  phaseProfiles: readonly RawFrameReconstructionPhaseProfile[];
  colorProfile: ExportSensorColorProfile;
  whiteBalance: "not-required" | "apply-resolved-sensor-gains";
  rendering: SdrRenderingProfile;
  /** Default `clip`: neutral clipped highlights. `reconstruct`: documented desaturation blend. */
  highlightMode?: RawHighlightMode;
  /** Includes the retained packed RAW plus integer output; not caller buffers, process heap or GPU. */
  maximumRetainedPayloadBytes: number;
}
/** RAW saturation consumed before white balance; counts are pixels/samples of the developed output. */
export interface RawHighlightDiagnostics {
  mode: RawHighlightMode;
  /** Output pixels with at least one contributing site at/above its white level or flagged saturated. */
  saturatedPixelCount: number;
  /** `clip`: WB-scaled samples clipped at the smallest gain. Always 0 for `reconstruct`. */
  whiteBalanceClippedSampleCount: number;
  /** `reconstruct`: pixels blended toward neutral. Always 0 for `clip`. */
  reconstructedPixelCount: number;
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
  highlight: RawHighlightDiagnostics;
  outputEncoding: SdrRenderingResult["outputEncoding"];
  rendering: SdrRenderingProfile;
  displayAdaptation: SdrRenderingResult["displayAdaptation"];
  imageDataPairing: "derived-from-exact-packed-native-raw";
  producerOriginVerified: false;
}
/** Host hooks, the same shape as the other native task providers (without a tile reader). */
export interface NativeRawDevelopmentProvider {
  /** Must yield to the host event loop, allowing cancellation/input events between tiles. */
  yieldControl(signal: AbortSignal): Promise<void>;
  /** Optional observer called after each committed 256-pixel output tile; cannot change output. */
  onProgress?(progress: NativeTaskProgress): void;
}
export interface NativeRawDevelopmentTask {
  readonly state: NativeRawTaskState;
  readonly completedTileCount: number;
  readonly totalTileCount: number;
  run(): Promise<void>;
  cancel(): void;
  dispose(): void;
  takeOutput(): NativeRawDevelopmentOutput;
}
const TILE_WIDTH = 256;
/** Sites checked per integrity chunk before the yield gate is consulted. */
const INTEGRITY_CHUNK_SITES = 1 << 18;
function canonical(value: unknown): string {
  return stringifyCanonicalJson(value,{undefinedObjectProperties:"reject",nonFiniteNumberMessage:"Invalid RAW metadata.",unsupportedValueMessage:"Invalid RAW metadata."});
}
function validateRaw(raw: NativeRawOutput): NativeRawOutput["plan"] {
  requireAllowlistedRecord(raw,["plan","codes","blackLevels","digitalSaturationCodes","saturationFlags","effectiveSaturationCodes"],"Invalid packed RAW output.");
  const p=raw.plan;
  if(!p?.exposure||!p.frame)throw new InvalidConfigurationError("Packed RAW requires complete exposure and frame metadata.");
  const {engineApiVersion,resolvedGeometry,equivalentFocalLength35Mm,...exposure}=p.exposure;
  void engineApiVersion;void resolvedGeometry;void equivalentFocalLength35Mm;
  const {capture,containerBitDepth,...frame}=p.frame;void capture;void containerBitDepth;
  const input: NativeRawInput={exposure,...frame,maximumOutputBytes:p.outputBytes,...(p.tileWidth===undefined?{}:{tileWidth:p.tileWidth}),...(p.exposureWindow?{exposureWindow:p.exposureWindow}:{})};
  const plan=calculateNativeRawPlan(input);
  if(canonical(p)!==canonical(plan))throw new InvalidConfigurationError("Packed RAW metadata is stale or inconsistent.");
  const layout=plan.frame.colorSamplingProfile.layout,phaseCount=layout.kind==="periodic-mosaic"?layout.repeatWidthSites*layout.repeatHeightSites:0;
  const buffers=new Set<ArrayBufferLike>();
  for(const [a,type,length] of [[raw.codes,Uint16Array,plan.pixelCount],[raw.blackLevels,Uint16Array,plan.pixelCount],[raw.digitalSaturationCodes,Uint16Array,plan.pixelCount],
    [raw.saturationFlags,Uint8Array,plan.pixelCount],[raw.effectiveSaturationCodes,Uint16Array,phaseCount]] as const){
    if(!(a instanceof type)||!(a.buffer instanceof ArrayBuffer)||a.length!==length||a.buffer.byteLength!==a.byteLength||buffers.has(a.buffer))throw new InvalidConfigurationError("Packed RAW storage must be exact owned native arrays.");
    buffers.add(a.buffer);
  }
  return plan;
}
/** Takes sole ownership: zero-copy detach when the runtime supports ArrayBuffer transfer, else a copy. */
function own<T extends Uint8Array<ArrayBuffer>|Uint16Array<ArrayBuffer>>(array: T, make: (buffer: ArrayBuffer)=>T): T {
  const buffer=array.buffer as ArrayBuffer&{transfer?:()=>ArrayBuffer};
  return typeof buffer.transfer==="function"?make(buffer.transfer()):make(buffer.slice(0));
}
interface PreparedDevelopment {
  plan: NativeRawOutput["plan"]; phases: RawFrameReconstructionPhaseProfile[]; color: ExportSensorColorProfile; profile: SdrRenderingProfile;
  whiteBalance: NativeRawDevelopmentInput["whiteBalance"]; highlightMode: RawHighlightMode; development: SensorColorDevelopment;
  crop: {x:number;y:number;width:number;height:number}; raster: {pixelWidth:number;pixelHeight:number};
}
/** Synchronous metadata/halo/CFA validation shared by the task and the reference. No pixel loop. */
function prepare(input: NativeRawDevelopmentInput): PreparedDevelopment {
  const r=requireAllowlistedRecord(input,["raw","phaseProfiles","colorProfile","whiteBalance","rendering","highlightMode","maximumRetainedPayloadBytes"],"Invalid native RAW development input.");
  const plan=validateRaw(input.raw),g=plan.exposure.resolvedGeometry,native=plan.exposure.geometry.nativeRaster;
  const phases=freezeOwnedData(parseRawReconstructionPhaseProfiles(r.phaseProfiles,plan.frame.modeId,plan.frame.colorSamplingProfile));
  const color=freezeOwnedData(parseExportSensorColorProfile(r.colorProfile)),profile=freezeOwnedData(parseSdrRenderingProfile(r.rendering));
  const crop=g.output.cropRect,raster=g.output.raster,active=g.activeCapture.nativeRect,intent=plan.exposure.whiteBalanceIntent;
  const highlightMode=r.highlightMode===undefined?"clip":r.highlightMode;
  if(highlightMode!=="clip"&&highlightMode!=="reconstruct")throw new InvalidConfigurationError("Unsupported RAW highlight mode.");
  if(color.colorSamplingProfileId!==plan.frame.colorSamplingProfile.profileId||phases.some(p=>canonical(p.profile.kernels.map(k=>k.outputChannelId))!==canonical(color.channelIds))||
    (r.whiteBalance!=="not-required"&&r.whiteBalance!=="apply-resolved-sensor-gains")||(intent!==null)!==(r.whiteBalance==="apply-resolved-sensor-gains")||
    raster.pixelWidth!==crop.width||raster.pixelHeight!==crop.height)throw new InvalidConfigurationError("Development requires bound sensor RGB, explicit one-time WB and 1:1 output crop.");
  const bytes=plan.outputBytes+raster.pixelWidth*raster.pixelHeight*3*profile.bitDepth/8;
  if(typeof r.maximumRetainedPayloadBytes!=="number"||!Number.isSafeInteger(r.maximumRetainedPayloadBytes)||r.maximumRetainedPayloadBytes<bytes)throw new InvalidConfigurationError("Development exceeds retained output budget.");
  const gains=intent?[intent.channelGains.red,intent.channelGains.green,intent.channelGains.blue]:null;
  const development=prepareSensorColorDevelopment(color.normalizedCameraChannelsToXyz,gains,highlightMode),layout=plan.frame.colorSamplingProfile.layout;
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
  return {plan,phases,color,profile,whiteBalance:r.whiteBalance,highlightMode,development,crop,raster};
}
/** Numeric integrity of rows [y0,y1): signed values below black are preserved; spans are positive. */
function checkIntegrity(raw: NativeRawOutput, nativeWidth: number, repeatWidth: number, repeatHeight: number, y0: number, y1: number): void {
  const codes=raw.codes,blacks=raw.blackLevels,digital=raw.digitalSaturationCodes,flags=raw.saturationFlags,white=raw.effectiveSaturationCodes;
  for(let y=y0;y<y1;y++){
    const row=(y%repeatHeight)*repeatWidth;
    for(let x=0,i=y*nativeWidth;x<nativeWidth;x++,i++){
      const d=digital[i]!,w=white[row+x%repeatWidth]!,b=blacks[i]!;
      if(b>=w||w>d||codes[i]!>d||flags[i]!>7)throw new InvalidConfigurationError("Invalid packed RAW code span, white level or saturation flags.");
    }
  }
}
function source(raw: NativeRawOutput, plan: NativeRawOutput["plan"]): RawDevelopmentSource {
  const layout=plan.frame.colorSamplingProfile.layout;
  if(layout.kind!=="periodic-mosaic")throw new InvalidConfigurationError("Development requires periodic CFA.");
  return {nativeWidth:plan.exposure.geometry.nativeRaster.pixelWidth,repeatWidth:layout.repeatWidthSites,repeatHeight:layout.repeatHeightSites,
    codes:raw.codes,blackLevels:raw.blackLevels,saturationFlags:raw.saturationFlags,whiteByPhase:raw.effectiveSaturationCodes};
}
function emptyDiagnostics(): SdrRenderingResult["diagnostics"] {
  return {renderingNegativeSampleCount:0,renderingAboveReferenceSampleCount:0,toneChangedSampleCount:0,gamutClippedLowSampleCount:0,gamutClippedHighSampleCount:0,captureSaturation:"consumed-in-raw-development"};
}
function highlightOf(mode: RawHighlightMode, counts: RawDevelopmentCounts): RawHighlightDiagnostics {
  return {mode,saturatedPixelCount:counts.saturatedPixelCount,whiteBalanceClippedSampleCount:counts.whiteBalanceClippedSampleCount,reconstructedPixelCount:counts.reconstructedPixelCount};
}
/**
 * Internal per-object reference development (not a root export), kept to prove the typed kernel
 * byte-identical: per pixel it maps orientation with `transformOrientedRasterPointToNative`, gathers each
 * channel through `calculateRawReconstructionChannel`, develops with the shared colour operator and renders
 * 256-pixel rows with the reference `calculateSdrRendering`. It does not take RAW ownership.
 */
export function developNativeRawReference(input: NativeRawDevelopmentInput): {integerSamples:number[];diagnostics:SdrRenderingResult["diagnostics"];highlight:RawHighlightDiagnostics} {
  const v=prepare(input),plan=v.plan,g=plan.exposure.resolvedGeometry,active=g.activeCapture.nativeRect,src=source(input.raw,plan);
  checkIntegrity(input.raw,src.nativeWidth,src.repeatWidth,src.repeatHeight,0,plan.exposure.geometry.nativeRaster.pixelHeight);
  const counts=createRawDevelopmentCounts(),diagnostics=emptyDiagnostics(),out:number[]=[];
  for(let y=0;y<v.raster.pixelHeight;y++)for(let x=0;x<v.raster.pixelWidth;x+=TILE_WIDTH){
    const width=Math.min(TILE_WIDTH,v.raster.pixelWidth-x),rgb:number[]=[];
    for(let j=0;j<width;j++){
      const q=transformOrientedRasterPointToNative({point:{x:v.crop.x+x+j+.5,y:v.crop.y+y+.5},nativeRaster:g.activeCapture.raster,orientation:plan.exposure.geometry.orientation});
      const point={x:Math.floor(q.x)+active.x,y:Math.floor(q.y)+active.y};
      const phase=v.phases[(point.y%src.repeatHeight)*src.repeatWidth+point.x%src.repeatWidth]!;
      let saturated=false;
      const values=phase.profile.kernels.map(kernel=>calculateRawReconstructionChannel(kernel,point,(sx,sy)=>{
        if(rawSiteSaturated(src,sx,sy))saturated=true;return normalizedRawSite(src,sx,sy);
      }).linearBlackSubtractedNormalizedValue);
      if(saturated)counts.saturatedPixelCount++;
      const developed=[0,0,0];v.development.developInto(values[0]!,values[1]!,values[2]!,developed,0,counts);rgb.push(...developed);
    }
    const rendered=calculateSdrRendering({sourceImageStateId:plan.frame.frameId+":developed",inputImageState:"color-transformed-linear-rgb",inputColorSpace:"linear-srgb-d65",whiteBalanceHandling:plan.exposure.whiteBalanceIntent?"already-applied-upstream":"not-required",pixelWidth:width,pixelHeight:1,referenceWhiteValue:1,samples:rgb,profile:v.profile}).value;
    out.push(...rendered.integerSamples);
    for(const key of ["renderingNegativeSampleCount","renderingAboveReferenceSampleCount","toneChangedSampleCount","gamutClippedLowSampleCount","gamutClippedHighSampleCount"] as const)diagnostics[key]+=rendered.diagnostics[key];
  }
  return {integerSamples:out,diagnostics,highlight:highlightOf(v.highlightMode,counts)};
}
function sdrOutputEncoding(maximum: number): SdrRenderingResult["outputEncoding"] {
  return {imageState:"output-referred-sdr",colorSpace:"srgb",primariesXy:{red:[.64,.33],green:[.30,.60],blue:[.15,.06]},whitePointXy:[.3127,.3290],referenceWhiteLuminanceCdM2:80,codeMinimum:0,codeMaximum:maximum};
}
/**
 * Validates complete phase/halo support, takes ownership of the packed RAW (zero-copy transfer where
 * supported) and renders 256-pixel output tiles through the typed kernel. Development normalizes each
 * site to its CFA phase's effective white level, clips flagged/white sites before white balance and
 * applies the selected highlight mode (see `prepareSensorColorDevelopment`). Numeric RAW integrity is
 * checked in bounded chunks at the start of `run()`, with host yields, so creation stays O(metadata).
 * The host yield runs at chunk/tile boundaries once about 8 ms of work has elapsed since the previous
 * yield, and after the final tile; yield cadence never changes output.
 *
 * `provider` is `{ yieldControl, onProgress? }`, the shape of the other native task providers. A bare
 * yield function is still accepted for 2.x and is deprecated.
 * Retains explicit acquisition tile width when reconstructing the exact packed plan. Acquisition chunk
 * width changes neither CFA/seed coordinates nor development pixels, and does not establish transport or
 * device-resource qualification.
 */
export function createNativeRawDevelopmentTask(input: NativeRawDevelopmentInput,
  provider: NativeRawDevelopmentProvider | ((signal:AbortSignal)=>Promise<void>)): NativeRawDevelopmentTask {
  return createNativeRawDevelopmentTaskWithCadence(input,provider,DEFAULT_HOST_YIELD_CADENCE);
}
/** Internal: explicit host-yield cadence. Cadence never changes output. Not a root export. */
export function createNativeRawDevelopmentTaskWithCadence(input: NativeRawDevelopmentInput,
  provider: NativeRawDevelopmentProvider | ((signal:AbortSignal)=>Promise<void>),cadence: HostYieldCadence): NativeRawDevelopmentTask {
  const hooks=typeof provider==="function"?{yieldControl:provider}:provider;
  if(!hooks||typeof hooks.yieldControl!=="function"||(hooks.onProgress!==undefined&&typeof hooks.onProgress!=="function"))throw new InvalidConfigurationError("Development requires a host event-loop yield.");
  const yieldControl=hooks.yieldControl.bind(hooks),onProgress=hooks.onProgress?.bind(hooks);
  const v=prepare(input),plan=v.plan,g=plan.exposure.resolvedGeometry,active=g.activeCapture.nativeRect,raster=v.raster,crop=v.crop;
  const nativeHeight=plan.exposure.geometry.nativeRaster.pixelHeight;
  // Ownership transfer happens only after every synchronous check passed.
  const given=input.raw;
  const raw:NativeRawOutput={plan,codes:own(given.codes as Uint16Array<ArrayBuffer>,b=>new Uint16Array(b)),blackLevels:own(given.blackLevels as Uint16Array<ArrayBuffer>,b=>new Uint16Array(b)),
    digitalSaturationCodes:own(given.digitalSaturationCodes as Uint16Array<ArrayBuffer>,b=>new Uint16Array(b)),saturationFlags:own(given.saturationFlags as Uint8Array<ArrayBuffer>,b=>new Uint8Array(b)),
    effectiveSaturationCodes:given.effectiveSaturationCodes.slice()};
  const src=source(raw,plan),tilesPerRow=Math.ceil(raster.pixelWidth/TILE_WIDTH),totalTileCount=tilesPerRow*raster.pixelHeight;
  const abort=new AbortController();let state:NativeRawTaskState="ready",output:NativeRawDevelopmentOutput|null=null,codes:Uint8Array|Uint16Array|null=null,completed=0;
  function release(): void {raw.codes.fill(0);raw.blackLevels.fill(0);raw.digitalSaturationCodes.fill(0);raw.saturationFlags.fill(0);raw.effectiveSaturationCodes.fill(0);codes?.fill(0);codes=null;output=null;}
  function check(): void {if(abort.signal.aborted)throw new InvalidConfigurationError("Native RAW development aborted.");}
  /** Native coordinates of oriented output pixel (x, y) and the step to (x+1, y), both integer. */
  function rowMapping(x: number, y: number, width: number): {nx:number;ny:number;dx:number;dy:number} {
    const at=(j:number):{x:number;y:number}=>{const q=transformOrientedRasterPointToNative({point:{x:crop.x+x+j+.5,y:crop.y+y+.5},nativeRaster:g.activeCapture.raster,orientation:plan.exposure.geometry.orientation});return {x:Math.floor(q.x)+active.x,y:Math.floor(q.y)+active.y};};
    const first=at(0),second=width>1?at(1):first,dx=second.x-first.x,dy=second.y-first.y,last=at(width-1);
    if(Math.abs(dx)+Math.abs(dy)!==(width>1?1:0)||last.x!==first.x+dx*(width-1)||last.y!==first.y+dy*(width-1))throw new InvalidConfigurationError("Development orientation mapping is not a unit native step.");
    return {nx:first.x,ny:first.y,dx,dy};
  }
  return {get state():NativeRawTaskState{return state;},get completedTileCount():number{return completed;},totalTileCount,
    async run():Promise<void>{
      if(state!=="ready")throw new InvalidConfigurationError("Development task is single-use.");state="running";
      try{
        const gate=createHostYieldGate(cadence);
        const rowsPerChunk=Math.max(1,Math.floor(INTEGRITY_CHUNK_SITES/src.nativeWidth));
        for(let y=0;y<nativeHeight;y+=rowsPerChunk){
          check();checkIntegrity(raw,src.nativeWidth,src.repeatWidth,src.repeatHeight,y,Math.min(nativeHeight,y+rowsPerChunk));
          if(gate.due()){await yieldControl(abort.signal);check();gate.restart();}
        }
        codes=v.profile.bitDepth===8?new Uint8Array(raster.pixelWidth*raster.pixelHeight*3):new Uint16Array(raster.pixelWidth*raster.pixelHeight*3);
        const diagnostics=emptyDiagnostics(),developer=createRawPixelDeveloper(src,v.phases,v.development),tone=prepareSdrPixelTone(v.profile);
        const scale=2**v.profile.renderingExposureEv,maximum=2**v.profile.bitDepth-1,rgb=new Float64Array(TILE_WIDTH*3),scratch=new Float64Array(3);
        if(!Number.isFinite(scale)||scale<=0)throw new InvalidConfigurationError("Rendering scale is unrepresentable.");
        for(let y=0;y<raster.pixelHeight;y++)for(let x=0;x<raster.pixelWidth;x+=TILE_WIDTH){
          check();const width=Math.min(TILE_WIDTH,raster.pixelWidth-x),map=rowMapping(x,y,width);
          const counts:SdrPixelCounts={negative:0,above:0,changed:0,low:0,high:0,outOfGamut:false};
          developer.developRun(map.nx,map.ny,map.dx,map.dy,width,rgb);
          renderSdrRunInto(rgb,0,width,v.profile,tone,scale,maximum,codes,(y*raster.pixelWidth+x)*3,scratch,counts);
          // Same 256-pixel granularity as the reference rows: exposure errors precede gamut rejection.
          if(counts.outOfGamut)throw new InvalidConfigurationError("Tone output exceeds the declared SDR gamut range.");
          diagnostics.renderingNegativeSampleCount+=counts.negative;diagnostics.renderingAboveReferenceSampleCount+=counts.above;diagnostics.toneChangedSampleCount+=counts.changed;
          diagnostics.gamutClippedLowSampleCount+=counts.low;diagnostics.gamutClippedHighSampleCount+=counts.high;
          completed++;onProgress?.({completedTileCount:completed,totalTileCount});
          if(gate.due()||(y===raster.pixelHeight-1&&x+TILE_WIDTH>=raster.pixelWidth)){await yieldControl(abort.signal);check();gate.restart();}
        }
        output={raw,phaseProfiles:v.phases,colorProfile:v.color,whiteBalance:v.whiteBalance,width:raster.pixelWidth,height:raster.pixelHeight,integerSamples:codes,diagnostics,
          highlight:highlightOf(v.highlightMode,developer.counts),rendering:v.profile,displayAdaptation:{kind:"external-platform",applied:false,displayCapabilities:"unknown"},
          outputEncoding:sdrOutputEncoding(maximum),imageDataPairing:"derived-from-exact-packed-native-raw",producerOriginVerified:false};state="completed";
      }catch(error){release();if(!abort.signal.aborted){state="failed";abort.abort();}throw error;}
    },
    cancel():void{if(state==="ready"||state==="running"||state==="completed"){state="cancelled";abort.abort();release();}},
    dispose():void{if(state!=="transferred"){state="disposed";abort.abort();release();}},
    takeOutput():NativeRawDevelopmentOutput{if(state!=="completed"||!output)throw new InvalidConfigurationError("Development output unavailable.");const value=output;output=null;codes=null;state="transferred";return value;}
  };
}
