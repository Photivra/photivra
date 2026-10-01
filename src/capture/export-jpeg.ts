// SPDX-License-Identifier: Apache-2.0

import { InvalidConfigurationError } from "../core/configuration-error.js";

/** Internal baseline JPEG profile: 8-bit YCbCr444, explicit constant quantization step and original uniform Huffman tables. */
export interface ExportJpegInput { width: number; height: number; samples: readonly number[]; quantizationStep: number; exif: Uint8Array; xmp: Uint8Array }
/** Independent analytical DCT implementation; no third-party encoder, source, default quantization or Huffman tables. */
export function encodeExportJpeg(input: ExportJpegInput): Uint8Array {
  const { width, height, samples, quantizationStep: q } = input;
  if (![width,height,q].every(Number.isSafeInteger) || width < 1 || height < 1 || width*height > 4096 ||
      q < 1 || q > 255 || samples.length !== width*height*3 || Array.from(samples).some((v) => !Number.isInteger(v) || v < 0 || v > 255)) {
    throw new InvalidConfigurationError("Unsupported baseline JPEG input.");
  }
  const bytes: number[] = [255,216];
  const marker = (id: number, payload: readonly number[]): void => {
    if (payload.length > 65533) throw new InvalidConfigurationError("JPEG metadata segment exceeds the standard APP limit.");
    bytes.push(255,id,(payload.length+2)>>8,(payload.length+2)&255,...payload);
  };
  marker(224,[74,70,73,70,0,1,2,0,0,1,0,1,0,0]);
  marker(225,[69,120,105,102,0,0,...input.exif]);
  marker(225,[...new TextEncoder().encode("http://ns.adobe.com/xap/1.0/\0"),...input.xmp]);
  marker(219,[0,...Array<number>(64).fill(q)]);
  marker(192,[8,height>>8,height&255,width>>8,width&255,3,1,17,0,2,17,0,3,17,0]);
  // DC categories 0..11 use 4-bit codes; AC EOB/ZRL and all baseline run/category pairs use 8-bit codes.
  // Incomplete canonical trees reserve the all-ones code, as required for JPEG padding safety.
  const dc = Array.from({length:12},(_,i) => i), ac = [0,240];
  for (let run=0;run<16;run++) for (let size=1;size<=10;size++) ac.push(run*16+size);
  marker(196,[0,...Array.from({length:16},(_,i) => i===3 ? 12 : 0),...dc,
    16,...Array.from({length:16},(_,i) => i===7 ? ac.length : 0),...ac]);
  marker(218,[3,1,0,2,0,3,0,0,63,0]);
  let accumulator=0, bits=0;
  const emit = (value: number, count: number): void => {
    for (let i=count-1;i>=0;i--) {
      accumulator=(accumulator<<1)|((value>>i)&1); bits++;
      if (bits===8) { bytes.push(accumulator); if (accumulator===255) bytes.push(0); accumulator=0; bits=0; }
    }
  };
  const amplitude = (value: number, max: number): number => {
    const size=value===0 ? 0 : Math.floor(Math.log2(Math.abs(value)))+1;
    if (size>max) throw new InvalidConfigurationError("JPEG coefficient exceeds baseline entropy range.");
    return size;
  };
  const coefficient = (value: number, size: number): void => { if (size) emit(value>=0 ? value : value+(1<<size)-1,size); };
  const zigzag: number[] = [];
  for (let diagonal=0;diagonal<=14;diagonal++) {
    const points: number[] = [];
    for (let y=0;y<8;y++) { const x=diagonal-y; if (x>=0 && x<8) points.push(y*8+x); }
    zigzag.push(...(diagonal%2===0 ? points.reverse() : points));
  }
  const cosine=Array.from({length:8},(_,u) => Array.from({length:8},(_,x) => Math.cos((2*x+1)*u*Math.PI/16)));
  const previous=[0,0,0];
  for (let by=0;by<height;by+=8) for (let bx=0;bx<width;bx+=8) {
    for (let channel=0;channel<3;channel++) {
      const block: number[] = [];
      for (let y=0;y<8;y++) for (let x=0;x<8;x++) {
        // JPEG coding pads partial 8x8 MCUs only; this never changes the declared photograph/crop dimensions.
        const p=(Math.min(by+y,height-1)*width+Math.min(bx+x,width-1))*3;
        const red=samples[p]!, green=samples[p+1]!, blue=samples[p+2]!, luminance=.299*red+.587*green+.114*blue;
        block.push(channel===0 ? luminance-128 : channel===1 ? (blue-luminance)/(2*(1-.114)) : (red-luminance)/(2*(1-.299)));
      }
      const transformed: number[] = [];
      for (let v=0;v<8;v++) for (let u=0;u<8;u++) {
        let sum=0; for (let y=0;y<8;y++) for (let x=0;x<8;x++) sum+=block[y*8+x]!*cosine[u]![x]!*cosine[v]![y]!;
        transformed.push(Math.round(sum*.25*(u===0 ? Math.SQRT1_2 : 1)*(v===0 ? Math.SQRT1_2 : 1)/q));
      }
      const difference=transformed[0]!-previous[channel]!, size=amplitude(difference,11); emit(size,4); coefficient(difference,size); previous[channel]=transformed[0]!;
      let zeroes=0;
      for (let i=1;i<64;i++) {
        const value=transformed[zigzag[i]!]!;
        if (value===0) { zeroes++; continue; }
        while (zeroes>=16) { emit(1,8); zeroes-=16; }
        const length=amplitude(value,10), symbol=zeroes*16+length; emit(ac.indexOf(symbol),8); coefficient(value,length); zeroes=0;
      }
      if (zeroes) emit(0,8);
    }
  }
  if (bits) emit((1<<(8-bits))-1,8-bits);
  bytes.push(255,217); return Uint8Array.from(bytes);
}
