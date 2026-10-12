// SPDX-License-Identifier: Apache-2.0
import {describe,it,expect,vi} from "vitest";
import {createPrintJpegTask,parsePrintJpegInput,createSrgbIccProfile,type PrintJpegInput,type PrintJpegProvider,type PrintJpegTile} from "../src/index.js";
import {createExportJpegEncoder} from "../src/capture/export-jpeg.js";
// Records the exact 8-bit RGB blocks handed to the (unchanged) encoder so pixels can be checked before lossy DCT coding.
const encodedBlocks=vi.hoisted(()=>[] as number[][]);
vi.mock("../src/capture/export-jpeg.js",async(importOriginal):Promise<typeof import("../src/capture/export-jpeg.js")>=>{
  const original=await importOriginal<typeof import("../src/capture/export-jpeg.js")>();
  return {...original,createExportJpegEncoder:(...args:Parameters<typeof original.createExportJpegEncoder>):ReturnType<typeof original.createExportJpegEncoder>=>{
    const encoder=original.createExportJpegEncoder(...args);
    return {...encoder,writeRgbBlock:(samples:readonly number[]):void=>{encodedBlocks.push([...samples]);encoder.writeRgbBlock(samples);}};
  }};
});
function fixture(width=16,height=8):{input:PrintJpegInput;provider:PrintJpegProvider} {
  return {input:{source:{captureId:"capture",imageStateId:"sdr",artifactId:"source",sha256:"a".repeat(64),width,height,encoding:"encoded-srgb-8-rgb"},crop:{x:0,y:0,width,height},outputWidth:width,outputHeight:height,quantizationStep:1,maximumEncodedBytes:1_000_000,maximumProviderReads:1_000_000},
    provider:{readTile:async(r):Promise<PrintJpegTile>=>({...r,samples:new Uint8Array(r.width*r.height*3).fill(128)}),yieldControl:async():Promise<void>=>{}}};
}
function segments(bytes:Uint8Array):Map<number,Uint8Array[]> {
  const result=new Map<number,Uint8Array[]>();let p=2;
  while(p<bytes.length){const id=bytes[p+1]!;if(id===218)break;const size=bytes[p+2]!*256+bytes[p+3]!;expect(bytes[p]).toBe(255);expect(size).toBeGreaterThanOrEqual(2);const values=result.get(id)??[];values.push(bytes.slice(p+4,p+2+size));result.set(id,values);p+=2+size;}return result;
}
/** JFIF 1.02 APP0 fields after the "JFIF\0" identifier. */
function jfif(app0:Uint8Array):{version:number[];units:number;x:number;y:number;thumbnail:number[]} {
  expect(new TextDecoder().decode(app0.slice(0,5))).toBe("JFIF\0");expect(app0.length).toBe(14);
  return {version:[app0[5]!,app0[6]!],units:app0[7]!,x:app0[8]!*256+app0[9]!,y:app0[10]!*256+app0[11]!,thumbnail:[app0[12]!,app0[13]!]};
}
type TiffValue={type:number;count:number;values:number[];bytes:Uint8Array};
/** Independent little-endian TIFF 6.0 IFD reader that checks ascending tags, counts and in-bounds 4-byte-aligned offsets. */
function exifDirectories(app1:Uint8Array):{ifd0:Map<number,TiffValue>;exif:Map<number,TiffValue>} {
  expect(Array.from(app1.slice(0,6))).toEqual([69,120,105,102,0,0]);
  const tiff=app1.slice(6),view=new DataView(tiff.buffer,tiff.byteOffset,tiff.byteLength);
  expect(Array.from(tiff.slice(0,4))).toEqual([73,73,42,0]);
  const sizes:Record<number,number>={1:1,2:1,3:2,4:4,5:8,7:1};
  const read=(offset:number):Map<number,TiffValue>=>{
    const count=view.getUint16(offset,true),result=new Map<number,TiffValue>();let previous=-1;
    for(let i=0;i<count;i++){
      const p=offset+2+i*12,id=view.getUint16(p,true),type=view.getUint16(p+2,true),n=view.getUint32(p+4,true),size=sizes[type]!*n;
      expect(id).toBeGreaterThan(previous);previous=id;expect(sizes[type]).toBeDefined();
      const at=size<=4 ? p+8 : view.getUint32(p+8,true);if(size>4){expect(at%2).toBe(0);expect(at+size).toBeLessThanOrEqual(tiff.length);}
      const bytes=tiff.slice(at,at+size),values:number[]=[];
      for(let k=0;k<n;k++)values.push(type===3 ? view.getUint16(at+k*2,true) : type===4 ? view.getUint32(at+k*4,true) : type===5 ? view.getUint32(at+k*8,true)/view.getUint32(at+k*8+4,true) : tiff[at+k]!);
      result.set(id,{type,count:n,values,bytes});
    }
    expect(view.getUint32(offset+2+count*12,true)).toBe(0);return result;
  };
  const ifd0=read(view.getUint32(4,true));return {ifd0,exif:read(ifd0.get(34665)!.values[0]!)};
}
/** Independent IEC 61966-2-1 sRGB transfer and exact 1-D overlap matrices: separable area average in linear light. */
function referenceResample(src:Uint8Array,srcWidth:number,crop:{x:number;y:number;width:number;height:number},ow:number,oh:number):number[] {
  const toLinear=(v:number):number=>{const c=v/255;return c<=.04045 ? c/12.92 : ((c+.055)/1.055)**2.4;};
  const toCode=(v:number):number=>{const e=v<=.0031308 ? v*12.92 : 1.055*v**(1/2.4)-.055;return Math.min(255,Math.max(0,Math.round(e*255)));};
  const weights=(n:number,start:number,length:number):[number,number][][]=>Array.from({length:n},(_,o)=>{
    const a=start+o*length/n,b=start+(o+1)*length/n,row:[number,number][]=[];
    for(let p=Math.floor(a);p<Math.ceil(b);p++)row.push([p,(Math.min(p+1,b)-Math.max(p,a))*n/length]);return row;
  });
  const wx=weights(ow,crop.x,crop.width),wy=weights(oh,crop.y,crop.height),out:number[]=[];
  for(let y=0;y<oh;y++)for(let x=0;x<ow;x++)for(let c=0;c<3;c++){
    let sum=0;for(const [py,ky] of wy[y]!)for(const [px,kx] of wx[x]!)sum+=ky*kx*toLinear(src[(py*srcWidth+px)*3+c]!);out.push(toCode(sum));
  }
  return out;
}
describe("bounded native/downsampled Print JPEG",()=>{
  it("writes actual dimensions, original sRGB ICC, EXIF and immutable source/crop metadata",async()=>{
    const f=fixture(),task=createPrintJpegTask(f.input,f.provider);await task.run();const out=task.takeOutput(),tags=segments(out.bytes);
    expect(tags.get(192)![0]!.slice(1,5)).toEqual(new Uint8Array([0,8,0,16]));
    // No physical density was planned: JFIF declares only a 1:1 aspect ratio and IFD0 claims no resolution.
    expect(jfif(tags.get(224)![0]!)).toEqual({version:[1,2],units:0,x:1,y:1,thumbnail:[0,0]});
    const {ifd0,exif}=exifDirectories(tags.get(225)![0]!);
    expect([...ifd0.keys()]).toEqual([274,305,34665]);expect(ifd0.get(274)!.values).toEqual([1]);
    expect(new TextDecoder().decode(ifd0.get(305)!.bytes)).toBe("Photivra Print JPEG\0");
    expect([...exif.keys()]).toEqual([36864,40961,40962,40963]);
    expect(exif.get(36864)).toMatchObject({type:7,count:4});expect(new TextDecoder().decode(exif.get(36864)!.bytes)).toBe("0232");
    expect(exif.get(40961)!.values).toEqual([1]);expect(exif.get(40962)!.values).toEqual([16]);expect(exif.get(40963)!.values).toEqual([8]);
    const icc=tags.get(226)![0]!;expect(new TextDecoder().decode(icc.slice(0,12))).toBe("ICC_PROFILE\0");expect(Array.from(icc.slice(12,14))).toEqual([1,1]);expect(icc.slice(14)).toEqual(createSrgbIccProfile());
    const xmp=new TextDecoder().decode(tags.get(225)![1]!);expect(xmp).toContain("capture");expect(xmp).toContain("PrintExportPlan");expect(out.digitalUpscalingApplied).toBe(false);expect(out.sourceStage).toBe("post-SDR-8-bit-quantization");
    expect(()=>task.takeOutput()).toThrow();task.dispose();expect(out.bytes.length).toBeGreaterThan(1000);
  });
  it("writes the planned print density to JFIF APP0 and TIFF/Exif IFD0 resolution tags",async()=>{
    for(const [ppi,dpi,rational] of [[300,300,[300,1]],[65535,65535,[65535,1]],[1,1,[1,1]],[240.4,240,[2404000000,10000000]],[299.5,300,[2995000000,10000000]]] as const){
      const f=fixture();f.input.pixelsPerInch=ppi;const task=createPrintJpegTask(f.input,f.provider);await task.run();const out=task.takeOutput(),tags=segments(out.bytes);
      expect(jfif(tags.get(224)![0]!)).toEqual({version:[1,2],units:1,x:dpi,y:dpi,thumbnail:[0,0]});
      const {ifd0,exif}=exifDirectories(tags.get(225)![0]!);
      expect([...ifd0.keys()]).toEqual([274,282,283,296,305,34665]);
      for(const id of [282,283]){
        const tag=ifd0.get(id)!;expect(tag).toMatchObject({type:5,count:1});expect(tag.values[0]).toBeCloseTo(ppi,9);
        expect([new DataView(tag.bytes.buffer).getUint32(0,true),new DataView(tag.bytes.buffer).getUint32(4,true)]).toEqual(rational);
      }
      expect(ifd0.get(296)).toMatchObject({type:3,count:1,values:[2]});
      expect(new TextDecoder().decode(exif.get(36864)!.bytes)).toBe("0232");
      expect(new TextDecoder().decode(tags.get(225)![1]!)).toContain("pixelsPerInch");expect(out.input.pixelsPerInch).toBe(ppi);
    }
    const f=fixture();
    for(const ppi of [0,.5,65535.5,Number.NaN,Number.POSITIVE_INFINITY,-300,"300"])expect(()=>parsePrintJpegInput({...f.input,pixelsPerInch:ppi as number})).toThrow();
    expect(parsePrintJpegInput({...f.input,pixelsPerInch:300}).pixelsPerInch).toBe(300);expect("pixelsPerInch" in parsePrintJpegInput(f.input)).toBe(false);
    for(const density of [0,1.5,65536])expect(()=>createExportJpegEncoder({width:8,height:8,quantizationStep:1,maximumOutputBytes:10000,exif:new Uint8Array(),xmp:new Uint8Array(),densityDotsPerInch:density})).toThrow();
  });
  it("encodes linear-light area averages that match an independent reference resample",async()=>{
    const width=61,height=37,src=new Uint8Array(width*height*3);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*3;src[i]=(x*37+y*11)%256;src[i+1]=(x+y)%2 ? 255 : 0;src[i+2]=(y*29+x*3)%256;}
    const crop={x:3,y:2,width:55,height:33},ow=20,oh=12;
    const f=fixture(width,height);f.input.crop=crop;f.input.outputWidth=ow;f.input.outputHeight=oh;
    f.provider.readTile=async(r):Promise<PrintJpegTile>=>{const samples=new Uint8Array(r.width*r.height*3);for(let y=0;y<r.height;y++)samples.set(src.subarray(((r.y+y)*width+r.x)*3,((r.y+y)*width+r.x+r.width)*3),y*r.width*3);return {...r,samples};};
    encodedBlocks.length=0;const task=createPrintJpegTask(f.input,f.provider);await task.run();task.takeOutput();
    const blocksX=Math.ceil(ow/8);expect(encodedBlocks.length).toBe(blocksX*Math.ceil(oh/8));
    const reference=referenceResample(src,width,crop,ow,oh);let maximum=0;
    for(let y=0;y<oh;y++)for(let x=0;x<ow;x++)for(let c=0;c<3;c++){
      const block=encodedBlocks[Math.floor(y/8)*blocksX+Math.floor(x/8)]!,actual=block[((y%8)*8+x%8)*3+c]!;
      maximum=Math.max(maximum,Math.abs(actual-reference[(y*ow+x)*3+c]!));
    }
    // Pre-DCT samples differ from the exact reference only by float summation order; the JPEG control budget is four codes.
    expect(maximum).toBeLessThanOrEqual(1);
  });
  it("uses exact bounded read rectangles for asymmetric fractional downsampling and crops",async()=>{
    const f=fixture(1001,501);f.input.crop={x:1,y:1,width:999,height:499};f.input.outputWidth=333;f.input.outputHeight=166;
    const requests:{x:number;y:number;width:number;height:number}[]=[],read=f.provider.readTile;
    f.provider.readTile=async(r,s):Promise<PrintJpegTile>=>{requests.push(r);return read(r,s);};
    const task=createPrintJpegTask(f.input,f.provider);await task.run();const out=task.takeOutput();
    for(const r of requests){expect(r.width).toBeLessThanOrEqual(256);expect(r.height).toBeLessThanOrEqual(32);expect(r.x).toBeGreaterThanOrEqual(1);expect(r.y).toBeGreaterThanOrEqual(1);expect(r.x+r.width).toBeLessThanOrEqual(1000);expect(r.y+r.height).toBeLessThanOrEqual(500);}
    expect(out.width).toBe(333);expect(out.height).toBe(166);
  });
  it("rejects upscaling, one-pixel native shortfall, aspect stretching and invalid budgets before callbacks",()=>{
    const f=fixture(),read=vi.fn(f.provider.readTile);
    for(const v of [{...f.input,outputWidth:17},{...f.input,crop:{...f.input.crop,width:15}},{...f.input,outputHeight:1},{...f.input,quantizationStep:256},{...f.input,maximumEncodedBytes:256_000_001},{...f.input,source:{...f.input.source,sha256:"bad"}}])expect(()=>createPrintJpegTask(v,{...f.provider,readTile:read})).toThrow();
    expect(read).not.toHaveBeenCalled();expect(()=>parsePrintJpegInput({...f.input,debug:true} as PrintJpegInput)).toThrow();
  });
  it("rejects resource exhaustion and corrupt provider tiles without publishing bytes",async()=>{
    for(const bad of ["budget","identity","rect","storage","shared","reads"]){
      const f=fixture();if(bad==="budget")f.input.maximumEncodedBytes=10;if(bad==="reads")f.input.maximumProviderReads=1;
      const read=f.provider.readTile,task=createPrintJpegTask(f.input,{...f.provider,readTile:async(r,s):Promise<PrintJpegTile>=>{
        const tile=await read(r,s);if(bad==="identity")return {...tile,source:{...tile.source,sha256:"b".repeat(64)}};
        if(bad==="rect")return {...tile,x:1};if(bad==="storage")return {...tile,samples:new Uint8Array(1)};
        if(bad==="shared")return {...tile,samples:new Uint8Array(new SharedArrayBuffer(tile.samples.length))};return tile;
      }});await expect(task.run()).rejects.toThrow();expect(task.state).toBe("failed");expect(()=>task.takeOutput()).toThrow();
    }
  });
  it("aborts pending reads and host yields and rejects late completion",async()=>{
    const f=fixture();let resolve:(tile:PrintJpegTile)=>void=()=>{};
    const task=createPrintJpegTask(f.input,{...f.provider,readTile:r=>new Promise<PrintJpegTile>(done=>{resolve=done;void r;})});
    const run=task.run();task.cancel();resolve(await f.provider.readTile({source:f.input.source,x:0,y:0,width:8,height:8},new AbortController().signal));await expect(run).rejects.toThrow();expect(task.state).toBe("cancelled");expect(()=>task.takeOutput()).toThrow();
    const disposed=createPrintJpegTask(f.input,{...f.provider,yieldControl:async():Promise<void>=>{disposed.dispose();}});await expect(disposed.run()).rejects.toThrow();expect(disposed.state).toBe("disposed");
  });
  it("requires complete coding-block ownership and rejects finish/reuse after disposal",()=>{
    const encoder=createExportJpegEncoder({width:8,height:8,quantizationStep:1,maximumOutputBytes:10000,exif:new Uint8Array(),xmp:new Uint8Array()});
    expect(()=>encoder.finish()).toThrow();expect(()=>encoder.writeRgbBlock([128])).toThrow();encoder.writeRgbBlock(Array(192).fill(128));const bytes=encoder.finish();expect(bytes.length).toBeGreaterThan(100);expect(()=>encoder.finish()).toThrow();expect(()=>encoder.writeRgbBlock(Array(192).fill(128))).toThrow();
  });
  it("yields and cancels inside a large single-block downsampling footprint",async()=>{
    let reads=0;
    const input={source:{captureId:"large-crop",imageStateId:"large-source",artifactId:"large-owned-source",sha256:"a".repeat(64),width:1024,height:1024,encoding:"encoded-srgb-8-rgb" as const},
      crop:{x:0,y:0,width:1024,height:1024},outputWidth:1,outputHeight:1,quantizationStep:1,maximumEncodedBytes:10000,maximumProviderReads:1000};
    const task=createPrintJpegTask(input,{readTile:async r=>{reads++;return {...r,samples:new Uint8Array(r.width*r.height*3)};},yieldControl:async():Promise<void>=>{task.cancel();}});
    await expect(task.run()).rejects.toThrow();expect(reads).toBe(32);expect(task.state).toBe("cancelled");expect(()=>task.takeOutput()).toThrow();
  });

});
