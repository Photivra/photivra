// SPDX-License-Identifier: Apache-2.0
import {describe,it,expect,vi} from "vitest";
import {createPrintJpegTask,parsePrintJpegInput,createSrgbIccProfile,type PrintJpegInput,type PrintJpegProvider,type PrintJpegTile} from "../src/index.js";
import {createExportJpegEncoder} from "../src/capture/export-jpeg.js";
function fixture(width=16,height=8):{input:PrintJpegInput;provider:PrintJpegProvider} {
  return {input:{source:{captureId:"capture",imageStateId:"sdr",artifactId:"source",sha256:"a".repeat(64),width,height,encoding:"encoded-srgb-8-rgb"},crop:{x:0,y:0,width,height},outputWidth:width,outputHeight:height,quantizationStep:1,maximumEncodedBytes:1_000_000,maximumProviderReads:1_000_000},
    provider:{readTile:async(r):Promise<PrintJpegTile>=>({...r,samples:new Uint8Array(r.width*r.height*3).fill(128)}),yieldControl:async():Promise<void>=>{}}};
}
function segments(bytes:Uint8Array):Map<number,Uint8Array[]> {
  const result=new Map<number,Uint8Array[]>();let p=2;
  while(p<bytes.length){const id=bytes[p+1]!;if(id===218)break;const size=bytes[p+2]!*256+bytes[p+3]!;expect(bytes[p]).toBe(255);expect(size).toBeGreaterThanOrEqual(2);const values=result.get(id)??[];values.push(bytes.slice(p+4,p+2+size));result.set(id,values);p+=2+size;}return result;
}
describe("bounded native/downsampled Print JPEG",()=>{
  it("writes actual dimensions, original sRGB ICC, EXIF and immutable source/crop metadata",async()=>{
    const f=fixture(),task=createPrintJpegTask(f.input,f.provider);await task.run();const out=task.takeOutput(),tags=segments(out.bytes);
    expect(tags.get(192)![0]!.slice(1,5)).toEqual(new Uint8Array([0,8,0,16]));
    const icc=tags.get(226)![0]!;expect(new TextDecoder().decode(icc.slice(0,12))).toBe("ICC_PROFILE\0");expect(Array.from(icc.slice(12,14))).toEqual([1,1]);expect(icc.slice(14)).toEqual(createSrgbIccProfile());
    const xmp=new TextDecoder().decode(tags.get(225)![1]!);expect(xmp).toContain("capture");expect(xmp).toContain("PrintExportPlan");expect(out.digitalUpscalingApplied).toBe(false);expect(out.sourceStage).toBe("post-SDR-8-bit-quantization");
    expect(()=>task.takeOutput()).toThrow();task.dispose();expect(out.bytes.length).toBeGreaterThan(1000);
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
