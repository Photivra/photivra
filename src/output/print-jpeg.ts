// SPDX-License-Identifier: Apache-2.0

/** Bounded post-SDR area filtering and original baseline JPEG/ICC serialization. */
import { createExportJpegEncoder } from "../capture/export-jpeg.js";
import { packExportTiff, exportTiffNumbers, exportTiffAscii, exportTiffBytes, exportTiffRationals, type ExportTiffTag } from "../capture/export-tiff.js";
import { createSrgbIccProfile, SRGB_ICC_PROFILE_VERSION } from "../color/srgb-icc.js";
import { decodeSrgbComponent, encodeSrgbComponent } from "../color/srgb-transfer.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";
import { requireAllowlistedRecord, requirePublicOpaqueId } from "../core/record-validation.js";
import { freezeOwnedData } from "../core/owned-data.js";
import type { NativeRawTaskState } from "../capture/native-raw.js";
import type { RasterRect } from "./capture-geometry.js";
export const PRINT_JPEG_SCHEMA_VERSION="0.1.0" as const;
export interface PrintJpegSource {
  captureId:string;imageStateId:string;artifactId:string;sha256:string;
  width:number;height:number;
  encoding:"encoded-srgb-8-rgb";
}
export interface PrintJpegInput {
  source:PrintJpegSource;
  /** Integer crop in the declared oriented output source, not crop-local sensor/CFA coordinates. */
  crop:RasterRect;
  outputWidth:number;outputHeight:number;
  quantizationStep:number;
  maximumEncodedBytes:number;
  maximumProviderReads:number;
  /**
   * Optional physical print density in pixels per inch (1..65535) from the caller's print plan. When present,
   * EXIF IFD0 records XResolution = YResolution = this value as a RATIONAL with ResolutionUnit = 2 (inches),
   * and JFIF APP0 records units = 1 with the nearest integer density (JFIF density fields are uint16).
   * When omitted no physical size is claimed: JFIF keeps units = 0 with a 1:1 aspect ratio and IFD0 omits
   * the resolution tags rather than inventing a default such as 72 ppi.
   */
  pixelsPerInch?:number;
}
export interface PrintJpegTileRequest {source:PrintJpegSource;x:number;y:number;width:number;height:number}
export interface PrintJpegTile extends PrintJpegTileRequest {samples:Uint8Array}
export interface PrintJpegProvider {
  readTile(request:Readonly<PrintJpegTileRequest>,signal:AbortSignal):Promise<PrintJpegTile>;
  yieldControl(signal:AbortSignal):Promise<void>;
}
export interface PrintJpegOutput {
  schemaVersion:typeof PRINT_JPEG_SCHEMA_VERSION;
  input:PrintJpegInput;
  mediaType:"image/jpeg";
  bytes:Uint8Array;
  iccProfileVersion:typeof SRGB_ICC_PROFILE_VERSION;
  width:number;height:number;
  resampling:"exact-area-average-in-decoded-linear-light";
  sourceStage:"post-SDR-8-bit-quantization";
  digitalUpscalingApplied:false;
  sourceBytesVerified:false;
  providerReads:number;
}
export interface PrintJpegTask {
  readonly state:NativeRawTaskState;
  run():Promise<void>;cancel():void;dispose():void;takeOutput():PrintJpegOutput;
}
/** Exact n/1 for integer densities; otherwise the shared bounded decimal rational approximation. */
function resolutionRational(id:number,ppi:number):ExportTiffTag {
  if(!Number.isSafeInteger(ppi))return exportTiffRationals(id,false,[ppi]);
  const data=new Uint8Array(8),view=new DataView(data.buffer);view.setUint32(0,ppi,true);view.setUint32(4,1,true);
  return {id,type:5,count:1,data};
}
/** TIFF 6.0 IFD0 resolution tags (282/283/296) plus Exif 2.32 Exif IFD fields, including mandatory ExifVersion "0232". */
function printExif(plan:PrintJpegInput):Uint8Array {
  const ppi=plan.pixelsPerInch;
  const resolution=ppi===undefined ? [] : [resolutionRational(282,ppi),resolutionRational(283,ppi),exportTiffNumbers(296,3,[2])];
  return packExportTiff([exportTiffNumbers(274,3,[1]),...resolution,exportTiffAscii(305,"Photivra Print JPEG")],
    [exportTiffBytes(36864,7,new TextEncoder().encode("0232")),exportTiffNumbers(40961,3,[1]),exportTiffNumbers(40962,4,[plan.outputWidth]),exportTiffNumbers(40963,4,[plan.outputHeight])]);
}
function integer(v:unknown,min=1):number {
  if(typeof v!=="number"||!Number.isSafeInteger(v)||v<min)throw new InvalidConfigurationError("Print raster/budgets require safe integers.");return v;
}
/** Admission-only; source detail/perception/printer qualification are separate contracts. */
export function parsePrintJpegInput(input:PrintJpegInput):PrintJpegInput {
  const r=requireAllowlistedRecord(input,["source","crop","outputWidth","outputHeight","quantizationStep","maximumEncodedBytes","maximumProviderReads","pixelsPerInch"],"Invalid Print JPEG input.");
  const s=requireAllowlistedRecord(r.source,["captureId","imageStateId","artifactId","sha256","width","height","encoding"],"Invalid Print source.");
  if(typeof s.sha256!=="string"||!/^[a-f0-9]{64}$/.test(s.sha256)||s.encoding!=="encoded-srgb-8-rgb")throw new InvalidConfigurationError("Print requires identified encoded sRGB source bytes.");
  const source:PrintJpegSource={captureId:requirePublicOpaqueId(s.captureId,"Invalid capture ID."),imageStateId:requirePublicOpaqueId(s.imageStateId,"Invalid image state ID."),artifactId:requirePublicOpaqueId(s.artifactId,"Invalid artifact ID."),sha256:s.sha256,width:integer(s.width),height:integer(s.height),encoding:s.encoding};
  const c=requireAllowlistedRecord(r.crop,["x","y","width","height"],"Invalid Print crop."),crop={x:integer(c.x,0),y:integer(c.y,0),width:integer(c.width),height:integer(c.height)};
  const outputWidth=integer(r.outputWidth),outputHeight=integer(r.outputHeight),quantizationStep=integer(r.quantizationStep),maximumEncodedBytes=integer(r.maximumEncodedBytes),maximumProviderReads=integer(r.maximumProviderReads);
  if(source.width>16_384||source.height>16_384||source.width*source.height>24_000_000||crop.x+crop.width>source.width||crop.y+crop.height>source.height||
    outputWidth>crop.width||outputHeight>crop.height||quantizationStep>255||maximumEncodedBytes>256_000_000||maximumProviderReads>1_000_000||
    Math.abs(outputWidth*crop.height-outputHeight*crop.width)>.5*(crop.width+crop.height))throw new InvalidConfigurationError("Print requires bounded native/downsampled aspect-preserving crop output.");
  const ppi=r.pixelsPerInch;
  if(ppi!==undefined&&(typeof ppi!=="number"||!Number.isFinite(ppi)||ppi<1||ppi>65535))throw new InvalidConfigurationError("Print density requires finite pixels per inch from 1 to 65535.");
  return freezeOwnedData({source,crop,outputWidth,outputHeight,quantizationStep,maximumEncodedBytes,maximumProviderReads,...(ppi===undefined ? {} : {pixelsPerInch:ppi})});
}
/** Filtering uses exact source-pixel area overlap after decoding the explicitly declared 8-bit SDR stage. */
export function createPrintJpegTask(input:PrintJpegInput,provider:PrintJpegProvider):PrintJpegTask {
  const plan=parsePrintJpegInput(input);
  if(!provider||typeof provider.readTile!=="function"||typeof provider.yieldControl!=="function")throw new InvalidConfigurationError("Print export requires source reader and host yields.");
  const read=provider.readTile.bind(provider),yieldControl=provider.yieldControl.bind(provider),abort=new AbortController();
  let state:NativeRawTaskState="ready",output:PrintJpegOutput|null=null,encoder:ReturnType<typeof createExportJpegEncoder>|undefined;
  function check():void{if(abort.signal.aborted)throw new InvalidConfigurationError("Print export aborted.");}
  function release():void{encoder?.dispose();encoder=undefined;output?.bytes.fill(0);output=null;}
  return {get state():NativeRawTaskState{return state;},
    async run():Promise<void>{
      if(state!=="ready")throw new InvalidConfigurationError("Print export is single-use.");state="running";
      try{
        const exif=printExif(plan);
        const escaped=JSON.stringify(plan).replaceAll("&","&amp;").replaceAll('"',"&quot;").replaceAll("<","&lt;").replaceAll(">","&gt;");
        const xmp=new TextEncoder().encode('<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:photivra="https://photivra.com/ns/simulation/1.0/" photivra:PrintExportPlan="'+escaped+'" photivra:SourceBytesVerified="False"/></rdf:RDF></x:xmpmeta>');
        encoder=createExportJpegEncoder({width:plan.outputWidth,height:plan.outputHeight,quantizationStep:plan.quantizationStep,maximumOutputBytes:plan.maximumEncodedBytes,icc:createSrgbIccProfile(),exif,xmp,
          ...(plan.pixelsPerInch===undefined ? {} : {densityDotsPerInch:Math.round(plan.pixelsPerInch)})});
        let reads=0,blocks=0;const scaleX=plan.crop.width/plan.outputWidth,scaleY=plan.crop.height/plan.outputHeight,area=scaleX*scaleY;
        for(let by=0;by<plan.outputHeight;by+=8)for(let bx=0;bx<plan.outputWidth;bx+=8){
          check();const width=Math.min(8,plan.outputWidth-bx),height=Math.min(8,plan.outputHeight-by),sums=new Float64Array(192);
          const left=plan.crop.x+bx*scaleX,top=plan.crop.y+by*scaleY,right=bx+width===plan.outputWidth?plan.crop.x+plan.crop.width:plan.crop.x+(bx+width)*scaleX,bottom=by+height===plan.outputHeight?plan.crop.y+plan.crop.height:plan.crop.y+(by+height)*scaleY;
          for(let sy=Math.floor(top);sy<Math.ceil(bottom);sy+=32)for(let sx=Math.floor(left);sx<Math.ceil(right);sx+=256){
            check();if(++reads>plan.maximumProviderReads)throw new InvalidConfigurationError("Print source exceeds provider-read budget.");
            const request=Object.freeze({source:plan.source,x:sx,y:sy,width:Math.min(256,Math.ceil(right)-sx),height:Math.min(32,Math.ceil(bottom)-sy)});
            const supplied=await read(request,abort.signal);check();
            const tile=requireAllowlistedRecord(supplied,["source","x","y","width","height","samples"],"Invalid Print source tile.");
            const source=requireAllowlistedRecord(tile.source,["captureId","imageStateId","artifactId","sha256","width","height","encoding"],"Invalid Print tile source.");
            for(const key of Object.keys(plan.source) as (keyof PrintJpegSource)[])if(source[key]!==plan.source[key])throw new InvalidConfigurationError("Print source identity mismatch.");
            for(const key of ["x","y","width","height"] as const)if(tile[key]!==request[key])throw new InvalidConfigurationError("Print source rectangle mismatch.");
            const samples=tile.samples;if(!(samples instanceof Uint8Array)||!(samples.buffer instanceof ArrayBuffer)||samples.length!==request.width*request.height*3||samples.buffer.byteLength!==samples.byteLength)throw new InvalidConfigurationError("Print source requires exact owned bounded RGB tile storage.");
            for(let iy=0;iy<request.height;iy++)for(let ix=0;ix<request.width;ix++){
              const px=sx+ix,py=sy+iy;
              const firstX=Math.max(0,Math.floor((px-plan.crop.x)/scaleX)-bx),lastX=Math.min(width-1,Math.ceil((px+1-plan.crop.x)/scaleX)-bx-1);
              const firstY=Math.max(0,Math.floor((py-plan.crop.y)/scaleY)-by),lastY=Math.min(height-1,Math.ceil((py+1-plan.crop.y)/scaleY)-by-1);
              const index=(iy*request.width+ix)*3,linear=[0,1,2].map(c=>decodeSrgbComponent(samples[index+c]!/255));
              for(let oy=firstY;oy<=lastY;oy++)for(let ox=firstX;ox<=lastX;ox++){
                const x0=plan.crop.x+(bx+ox)*scaleX,y0=plan.crop.y+(by+oy)*scaleY;
                const weight=Math.max(0,Math.min(px+1,x0+scaleX)-Math.max(px,x0))*Math.max(0,Math.min(py+1,y0+scaleY)-Math.max(py,y0))/area;
                for(let c=0;c<3;c++){const i=(oy*8+ox)*3+c;sums[i]=sums[i]!+linear[c]!*weight;}
              }
            }
            // A single output block can span a megapixel footprint: yield within source traversal too.
            if(reads%32===0){await yieldControl(abort.signal);check();}
          }
          const block:number[]=[];
          for(let y=0;y<8;y++)for(let x=0;x<8;x++)for(let c=0;c<3;c++){
            const value=sums[(Math.min(y,height-1)*8+Math.min(x,width-1))*3+c]!;
            block.push(Math.min(255,Math.max(0,Math.floor(encodeSrgbComponent(value)*255+.5))));
          }
          encoder.writeRgbBlock(block);if(++blocks%32===0){await yieldControl(abort.signal);check();}
        }
        await yieldControl(abort.signal);check();const bytes=encoder.finish();encoder=undefined;
        output={schemaVersion:PRINT_JPEG_SCHEMA_VERSION,input:plan,mediaType:"image/jpeg",bytes,iccProfileVersion:SRGB_ICC_PROFILE_VERSION,width:plan.outputWidth,height:plan.outputHeight,resampling:"exact-area-average-in-decoded-linear-light",sourceStage:"post-SDR-8-bit-quantization",digitalUpscalingApplied:false,sourceBytesVerified:false,providerReads:reads};state="completed";
      }catch(error){release();if(!abort.signal.aborted){state="failed";abort.abort();}throw error;}
    },cancel():void{if(state==="ready"||state==="running"||state==="completed"){state="cancelled";abort.abort();release();}},
    dispose():void{if(state!=="transferred"){state="disposed";abort.abort();release();}},
    takeOutput():PrintJpegOutput{if(state!=="completed"||!output)throw new InvalidConfigurationError("Print JPEG unavailable.");const value=output;output=null;state="transferred";return value;}
  };
}
