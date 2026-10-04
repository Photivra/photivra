// SPDX-License-Identifier: Apache-2.0
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {it,expect} from "vitest";
import {encodeExportJpeg} from "../src/capture/export-jpeg.js";
const reference=JSON.parse(readFileSync(new URL("./fixtures/jpeg-reference-byte-parity.json",import.meta.url),"utf8")) as {cases:{width:number;height:number;quantizationStep:number;metadata:boolean;sha256:string}[]};
it("preserves original reference JPEG bytes across padding, quantization and empty metadata",()=>{
  expect(reference.cases.length).toBe(18);
  for(const c of reference.cases){const samples=Array.from({length:c.width*c.height*3},(_,i)=>(i*17+37)%256),exif=Uint8Array.from(c.metadata?[1,2,3]:[]),xmp=new TextEncoder().encode(c.metadata?"<x:test>original</x:test>":"");
    const bytes=encodeExportJpeg({...c,samples,exif,xmp});expect(createHash("sha256").update(bytes).digest("hex")).toBe(c.sha256);
  }
});
