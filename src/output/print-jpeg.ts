// SPDX-License-Identifier: Apache-2.0

/**
 * Print JPEG export: downsamples an SDR image by exact area averaging, then writes a baseline JPEG
 * with an ICC colour profile. Bounded in size; the encoder is written for this project.
 */
import { createExportJpegEncoder, EXPORT_JPEG_ENCODER_ID } from "../capture/export-jpeg.js";
import { packExportJpegExif, exportTiffNumbers, exportTiffAscii, exportTiffRationals, type ExportTiffTag } from "../capture/export-tiff.js";
import { createSrgbIccProfile, SRGB_ICC_PROFILE_VERSION } from "../color/srgb-icc.js";
import { decodeSrgbComponent, encodeSrgbComponent } from "../color/srgb-transfer.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";
import { requireAllowlistedRecord, requirePublicOpaqueId } from "../core/record-validation.js";
import { freezeOwnedData } from "../core/owned-data.js";
import { FULL_RESOLUTION_CEILING_PIXELS, resolveRaisedLimit, scaleBudgetCeiling } from "../core/pixel-limits.js";
import type { NativeRawTaskState } from "../capture/native-raw.js";
import type { RasterRect } from "./capture-geometry.js";
export const PRINT_JPEG_SCHEMA_VERSION="0.2.0" as const;
/**
 * Admission limits. `maximumPixels` is the default source limit; a request may raise it with its own
 * `maximumPixels`, up to `ceilingPixels`. A raised limit raises the `maximumEncodedBytes` ceiling in proportion
 * (256 000 000 bytes per 24 000 000 source pixels).
 */
export const PRINT_JPEG_LIMITS=Object.freeze({maximumPixels:24_000_000,ceilingPixels:FULL_RESOLUTION_CEILING_PIXELS,maximumDimension:16_384,
  maximumEncodedBytes:256_000_000,maximumProviderReads:1_000_000});
let srgbDecode:Float64Array|undefined;
/** decodeSrgbComponent(v/255) for every 8-bit code v, computed once with the same function (identical values). */
function srgbDecodeTable():Float64Array{return srgbDecode??=Float64Array.from({length:256},(_,v)=>decodeSrgbComponent(v/255));}
export interface PrintJpegSource {
  captureId:string;imageStateId:string;artifactId:string;sha256:string;
  width:number;height:number;
  encoding:"encoded-srgb-8-rgb";
}
export interface PrintJpegInput {
  source:PrintJpegSource;
  /** Integer crop in the oriented output source image, not in sensor or CFA (colour filter array) coordinates. */
  crop:RasterRect;
  outputWidth:number;outputHeight:number;
  quantizationStep:number;
  maximumEncodedBytes:number;
  /**
   * Maximum provider `readTile` calls. The task reads each crop pixel exactly once, in tiles of at most
   * 256 x 32 pixels aligned to the crop origin, so it needs ceil(crop.height/32) x ceil(crop.width/256)
   * reads; a smaller budget fails before the first read.
   */
  maximumProviderReads:number;
  /**
   * Optional physical print density in pixels per inch (1..65535) from the caller's print plan. When present,
   * EXIF IFD0 records XResolution = YResolution = this value as a RATIONAL with ResolutionUnit = 2 (inches),
   * and JFIF APP0 records units = 1 with the nearest integer density (JFIF density fields are uint16).
   * When omitted no physical size is claimed: JFIF keeps units = 0 with a 1:1 aspect ratio. Exif 2.32 makes
   * the IFD0 resolution tags mandatory and says an unknown resolution "shall" be recorded as 72 dpi, so IFD0
   * carries 72/1 with ResolutionUnit = 2; that is the standard's unknown-resolution marker, not a print size.
   */
  pixelsPerInch?:number;
  /**
   * Optional opt-in source pixel limit for large images: an integer from 1 to `PRINT_JPEG_LIMITS.ceilingPixels`.
   * Default `PRINT_JPEG_LIMITS.maximumPixels` (24 000 000). When given it is recorded in the XMP export plan, like the
   * other admission budgets; the image data are unchanged.
   */
  maximumPixels?:number;
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
  /** Provider calls made: ceil(crop.height/32) x ceil(crop.width/256) tiles, each crop pixel read once. */
  providerReads:number;
  /** Byte behaviour of the baseline encoder that produced `bytes`. */
  encoderId:typeof EXPORT_JPEG_ENCODER_ID;
}
export interface PrintJpegTask {
  readonly state:NativeRawTaskState;
  run():Promise<void>;cancel():void;dispose():void;takeOutput():PrintJpegOutput;
}
/** Exactly n/1 for a whole-number density; otherwise the shared bounded decimal-fraction approximation. */
function resolutionRational(id:number,ppi:number):ExportTiffTag {
  if(!Number.isSafeInteger(ppi))return exportTiffRationals(id,false,[ppi]);
  const data=new Uint8Array(8),view=new DataView(data.buffer);view.setUint32(0,ppi,true);view.setUint32(4,1,true);
  return {id,type:5,count:1,data};
}
/**
 * Exif 2.32 APP1 for a compressed primary image with every mandatory tag (CIPA DC-008-2019 Tables 17-18):
 * IFD0 Orientation, X/YResolution + ResolutionUnit, Software, YCbCrPositioning; Exif IFD ExifVersion "0232",
 * ComponentsConfiguration, FlashpixVersion "0100", ColorSpace sRGB, PixelX/YDimension. Without a planned
 * density the resolution tags carry the standard's "unknown resolution" value of 72 dpi.
 */
function printExif(plan:PrintJpegInput):Uint8Array {
  const ppi=plan.pixelsPerInch;
  const resolution=ppi===undefined ? [] : [resolutionRational(282,ppi),resolutionRational(283,ppi),exportTiffNumbers(296,3,[2])];
  return packExportJpegExif([exportTiffNumbers(274,3,[1]),...resolution,exportTiffAscii(305,"Photivra Print JPEG")],
    [exportTiffNumbers(40961,3,[1])],{pixelWidth:plan.outputWidth,pixelHeight:plan.outputHeight});
}
function integer(v:unknown,min=1):number {
  if(typeof v!=="number"||!Number.isSafeInteger(v)||v<min)throw new InvalidConfigurationError("Print raster/budgets require safe integers.");return v;
}
/** Validates the input only. Source detail, perception and printer suitability are checked by separate APIs. */
export function parsePrintJpegInput(input:PrintJpegInput):PrintJpegInput {
  const r=requireAllowlistedRecord(input,["source","crop","outputWidth","outputHeight","quantizationStep","maximumEncodedBytes","maximumProviderReads","pixelsPerInch","maximumPixels"],"Invalid Print JPEG input.");
  const s=requireAllowlistedRecord(r.source,["captureId","imageStateId","artifactId","sha256","width","height","encoding"],"Invalid Print source.");
  if(typeof s.sha256!=="string"||!/^[a-f0-9]{64}$/.test(s.sha256)||s.encoding!=="encoded-srgb-8-rgb")throw new InvalidConfigurationError("Print requires identified encoded sRGB source bytes.");
  const source:PrintJpegSource={captureId:requirePublicOpaqueId(s.captureId,"Invalid capture ID."),imageStateId:requirePublicOpaqueId(s.imageStateId,"Invalid image state ID."),artifactId:requirePublicOpaqueId(s.artifactId,"Invalid artifact ID."),sha256:s.sha256,width:integer(s.width),height:integer(s.height),encoding:s.encoding};
  const c=requireAllowlistedRecord(r.crop,["x","y","width","height"],"Invalid Print crop."),crop={x:integer(c.x,0),y:integer(c.y,0),width:integer(c.width),height:integer(c.height)};
  const outputWidth=integer(r.outputWidth),outputHeight=integer(r.outputHeight),quantizationStep=integer(r.quantizationStep),maximumEncodedBytes=integer(r.maximumEncodedBytes),maximumProviderReads=integer(r.maximumProviderReads);
  const L=PRINT_JPEG_LIMITS,maximumPixels=resolveRaisedLimit(r.maximumPixels,L.maximumPixels,L.ceilingPixels,"Print maximumPixels must be an integer from 1 to "+L.ceilingPixels+".");
  const encodedBytesCeiling=r.maximumPixels===undefined?L.maximumEncodedBytes:scaleBudgetCeiling(L.maximumEncodedBytes,maximumPixels);
  if(source.width>L.maximumDimension||source.height>L.maximumDimension||source.width*source.height>maximumPixels||crop.x+crop.width>source.width||crop.y+crop.height>source.height||
    outputWidth>crop.width||outputHeight>crop.height||quantizationStep>255||maximumEncodedBytes>encodedBytesCeiling||maximumProviderReads>L.maximumProviderReads||
    Math.abs(outputWidth*crop.height-outputHeight*crop.width)>.5*(crop.width+crop.height))throw new InvalidConfigurationError("Print requires bounded native/downsampled aspect-preserving crop output.");
  const ppi=r.pixelsPerInch;
  if(ppi!==undefined&&(typeof ppi!=="number"||!Number.isFinite(ppi)||ppi<1||ppi>65535))throw new InvalidConfigurationError("Print density requires finite pixels per inch from 1 to 65535.");
  return freezeOwnedData({source,crop,outputWidth,outputHeight,quantizationStep,maximumEncodedBytes,maximumProviderReads,...(ppi===undefined ? {} : {pixelsPerInch:ppi}),
    ...(r.maximumPixels===undefined ? {} : {maximumPixels})});
}
/** Creates the export task. Filtering weights each source pixel by its exact area overlap, after decoding the declared 8-bit SDR source. */
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
        const scaleX=plan.crop.width/plan.outputWidth,scaleY=plan.crop.height/plan.outputHeight,area=scaleX*scaleY;
        const cropRight=plan.crop.x+plan.crop.width,cropBottom=plan.crop.y+plan.crop.height,rowBytes=plan.crop.width*3;
        // Every crop pixel is read exactly once, in tiles of at most 256 x 32 aligned to the crop origin.
        const tilesPerBand=Math.ceil(plan.crop.width/256),requiredReads=Math.ceil(plan.crop.height/32)*tilesPerBand;
        if(requiredReads>plan.maximumProviderReads)throw new InvalidConfigurationError("Print source exceeds provider-read budget.");
        // Rolling cache of whole crop-width source rows [cacheTop, cacheBottom): at most 63 rows are retained.
        const cache=new Uint8Array(Math.min(64,plan.crop.height)*rowBytes),lut=srgbDecodeTable();
        let reads=0,blocks=0,cacheTop=plan.crop.y,cacheBottom=plan.crop.y;
        const ensureRows=async(firstRow:number,rowCount:number):Promise<void>=>{
          const keepFrom=Math.min(Math.max(cacheTop,firstRow),cacheBottom);
          if(keepFrom>cacheTop){cache.copyWithin(0,(keepFrom-cacheTop)*rowBytes,(cacheBottom-cacheTop)*rowBytes);cacheTop=keepFrom;}
          while(cacheBottom<firstRow+rowCount){
            const bandHeight=Math.min(32,cropBottom-cacheBottom);
            if((cacheBottom+bandHeight-cacheTop)*rowBytes>cache.length)throw new InvalidConfigurationError("Print source traversal is not monotonic.");
            for(let sx=plan.crop.x;sx<cropRight;sx+=256){
              check();++reads;
              const request=Object.freeze({source:plan.source,x:sx,y:cacheBottom,width:Math.min(256,cropRight-sx),height:bandHeight});
              const supplied=await read(request,abort.signal);check();
              const tile=requireAllowlistedRecord(supplied,["source","x","y","width","height","samples"],"Invalid Print source tile.");
              const source=requireAllowlistedRecord(tile.source,["captureId","imageStateId","artifactId","sha256","width","height","encoding"],"Invalid Print tile source.");
              for(const key of Object.keys(plan.source) as (keyof PrintJpegSource)[])if(source[key]!==plan.source[key])throw new InvalidConfigurationError("Print source identity mismatch.");
              for(const key of ["x","y","width","height"] as const)if(tile[key]!==request[key])throw new InvalidConfigurationError("Print source rectangle mismatch.");
              const samples=tile.samples;if(!(samples instanceof Uint8Array)||!(samples.buffer instanceof ArrayBuffer)||samples.length!==request.width*request.height*3||samples.buffer.byteLength!==samples.byteLength)throw new InvalidConfigurationError("Print source requires exact owned bounded RGB tile storage.");
              for(let iy=0;iy<bandHeight;iy++)cache.set(samples.subarray(iy*request.width*3,(iy+1)*request.width*3),(cacheBottom-cacheTop+iy)*rowBytes+(sx-plan.crop.x)*3);
              // One output block can cover a megapixel of source, so also yield to the host while reading the source.
              if(reads%32===0){await yieldControl(abort.signal);check();}
            }
            cacheBottom+=bandHeight;
          }
        };
        const blocksX=Math.ceil(plan.outputWidth/8),sums=new Float64Array(blocksX*192);
        for(let by=0;by<plan.outputHeight;by+=8){
          check();sums.fill(0);
          const height=Math.min(8,plan.outputHeight-by),top=plan.crop.y+by*scaleY,bottom=by+height===plan.outputHeight?cropBottom:plan.crop.y+(by+height)*scaleY;
          // Accumulation order per output pixel is unchanged from the per-block reader: 32-row bands from
          // floor(top), then 256-column chunks from floor(left), then rows, then columns. Identical IEEE sums.
          for(let sy=Math.floor(top);sy<Math.ceil(bottom);sy+=32){
            const bandHeight=Math.min(32,Math.ceil(bottom)-sy);await ensureRows(sy,bandHeight);check();
            for(let bx=0,block=0;bx<plan.outputWidth;bx+=8,block++){
              const width=Math.min(8,plan.outputWidth-bx),left=plan.crop.x+bx*scaleX,right=bx+width===plan.outputWidth?cropRight:plan.crop.x+(bx+width)*scaleX,base=block*192;
              for(let sx=Math.floor(left);sx<Math.ceil(right);sx+=256){
                const chunkWidth=Math.min(256,Math.ceil(right)-sx);
                for(let iy=0;iy<bandHeight;iy++)for(let ix=0;ix<chunkWidth;ix++){
                  const px=sx+ix,py=sy+iy;
                  const firstX=Math.max(0,Math.floor((px-plan.crop.x)/scaleX)-bx),lastX=Math.min(width-1,Math.ceil((px+1-plan.crop.x)/scaleX)-bx-1);
                  const firstY=Math.max(0,Math.floor((py-plan.crop.y)/scaleY)-by),lastY=Math.min(height-1,Math.ceil((py+1-plan.crop.y)/scaleY)-by-1);
                  const index=(py-cacheTop)*rowBytes+(px-plan.crop.x)*3,r=lut[cache[index]!]!,g=lut[cache[index+1]!]!,b=lut[cache[index+2]!]!;
                  for(let oy=firstY;oy<=lastY;oy++)for(let ox=firstX;ox<=lastX;ox++){
                    const x0=plan.crop.x+(bx+ox)*scaleX,y0=plan.crop.y+(by+oy)*scaleY;
                    const weight=Math.max(0,Math.min(px+1,x0+scaleX)-Math.max(px,x0))*Math.max(0,Math.min(py+1,y0+scaleY)-Math.max(py,y0))/area;
                    const i=base+(oy*8+ox)*3;sums[i]=sums[i]!+r*weight;sums[i+1]=sums[i+1]!+g*weight;sums[i+2]=sums[i+2]!+b*weight;
                  }
                }
              }
            }
          }
          for(let bx=0,block=0;bx<plan.outputWidth;bx+=8,block++){
            const width=Math.min(8,plan.outputWidth-bx),base=block*192,samples:number[]=[];
            for(let y=0;y<8;y++)for(let x=0;x<8;x++)for(let c=0;c<3;c++){
              const value=sums[base+(Math.min(y,height-1)*8+Math.min(x,width-1))*3+c]!;
              // Nearest code, ties up. Math.round is used because floor(x+0.5) wrongly rounds 0.49999999999999994 up.
              samples.push(Math.min(255,Math.max(0,Math.round(encodeSrgbComponent(value)*255))));
            }
            check();encoder.writeRgbBlock(samples);if(++blocks%32===0){await yieldControl(abort.signal);check();}
          }
        }
        await yieldControl(abort.signal);check();const bytes=encoder.finish();encoder=undefined;
        output={schemaVersion:PRINT_JPEG_SCHEMA_VERSION,input:plan,mediaType:"image/jpeg",bytes,iccProfileVersion:SRGB_ICC_PROFILE_VERSION,width:plan.outputWidth,height:plan.outputHeight,resampling:"exact-area-average-in-decoded-linear-light",sourceStage:"post-SDR-8-bit-quantization",digitalUpscalingApplied:false,sourceBytesVerified:false,providerReads:reads,encoderId:EXPORT_JPEG_ENCODER_ID};state="completed";
      }catch(error){release();if(!abort.signal.aborted){state="failed";abort.abort();}throw error;}
    },cancel():void{if(state==="ready"||state==="running"||state==="completed"){state="cancelled";abort.abort();release();}},
    dispose():void{if(state!=="transferred"){state="disposed";abort.abort();release();}},
    takeOutput():PrintJpegOutput{if(state!=="completed"||!output)throw new InvalidConfigurationError("Print JPEG unavailable.");const value=output;output=null;state="transferred";return value;}
  };
}
