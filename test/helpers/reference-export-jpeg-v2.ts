// SPDX-License-Identifier: Apache-2.0

/**
 * Byte oracle for encoder version 2 (`EXPORT_JPEG_ENCODER_ID`): the frozen pre-#275 straightforward encoder in
 * `legacy-export-jpeg.ts` with exactly two deliberate 2.0.0 changes: C(u,x) from the fixed correctly rounded
 * table instead of runtime `Math.cos`, and coefficients rounded half away from zero. It keeps the legacy
 * full-budget pre-allocation, so agreement also proves the growable output buffer emits the same bytes and
 * rejections. Test-only; never imported by `src/`.
 */
import { InvalidConfigurationError } from "../../src/core/configuration-error.js";
import { JPEG_DCT_COSINES, type ExportJpegInput } from "../../src/capture/export-jpeg.js";

export function createReferenceExportJpegEncoderV2(input: Omit<ExportJpegInput,"samples"> & {maximumOutputBytes:number;icc?:Uint8Array;densityDotsPerInch?:number}): {
  writeRgbBlock(samples:readonly number[]):void; finish():Uint8Array; dispose():void;
} {
  const {width,height,quantizationStep:q}=input;
  if(![width,height,q,input.maximumOutputBytes].every(Number.isSafeInteger)||width<1||height<1||width>65535||height>65535||q<1||q>255||input.maximumOutputBytes<1||input.maximumOutputBytes>256_000_000)
    throw new InvalidConfigurationError("Invalid bounded JPEG encoding plan.");
  const density=input.densityDotsPerInch;
  if(density!==undefined&&(!Number.isSafeInteger(density)||density<1||density>65535))
    throw new InvalidConfigurationError("JFIF density requires an integer from 1 to 65535 dots per inch.");
  const storage=new Uint8Array(input.maximumOutputBytes);let offset=0,disposed=false,blocks=0;
  const push=(...values:number[]):void=>{if(disposed||offset+values.length>storage.length)throw new InvalidConfigurationError("JPEG output exceeds admitted byte budget or is disposed.");storage.set(values,offset);offset+=values.length;};
  push(255,216);
  const marker = (id: number, payload: readonly number[]): void => {
    if (payload.length > 65533) throw new InvalidConfigurationError("JPEG metadata segment exceeds the standard APP limit.");
    push(255,id,(payload.length+2)>>8,(payload.length+2)&255,...payload);
  };
  // JFIF 1.02 APP0: identifier, version 1.02, units (0 aspect ratio only, 1 dots per inch), Xdensity, Ydensity, no thumbnail.
  marker(224,density===undefined ? [74,70,73,70,0,1,2,0,0,1,0,1,0,0] : [74,70,73,70,0,1,2,1,density>>8,density&255,density>>8,density&255,0,0]);
  marker(225,[69,120,105,102,0,0,...input.exif]);
  marker(225,[...new TextEncoder().encode("http://ns.adobe.com/xap/1.0/\0"),...input.xmp]);
  if(input.icc){
    if(input.icc.length>65519)throw new InvalidConfigurationError("ICC profile exceeds the single-segment encoding envelope.");
    marker(226,[...new TextEncoder().encode("ICC_PROFILE\0"),1,1,...input.icc]);
  }
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
      if (bits===8) { push(accumulator); if (accumulator===255) push(0); accumulator=0; bits=0; }
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
/**
 * The separable 8×8 analytical DCT uses orthonormal DC factors and one explicitly
 * selected scalar quantization step. This deliberately simple 4:4:4 reference
 * encoder preserves no exact RGB pixels after lossy quantization; JPEG decode
 * agreement is an interoperability check, not an exact scientific pixel oracle.
 */
  const cosine=Array.from({length:8},(_,u) => Array.from({length:8},(_,x) => JPEG_DCT_COSINES[u*8+x]!));
  const previous=[0,0,0];
  return {
    writeRgbBlock(samples:readonly number[]):void {
      if(disposed||blocks>=Math.ceil(width/8)*Math.ceil(height/8)||samples.length!==192||Array.from(samples).some(v=>!Number.isInteger(v)||v<0||v>255))throw new InvalidConfigurationError("JPEG requires complete bounded RGB coding blocks.");
    for (let channel=0;channel<3;channel++) {
      const block: number[] = [];
      for (let y=0;y<8;y++) for (let x=0;x<8;x++) {
        // JPEG coding pads partial 8x8 MCUs only; this never changes the declared photograph/crop dimensions.
        const p=(y*8+x)*3;
        const red=samples[p]!, green=samples[p+1]!, blue=samples[p+2]!, luminance=.299*red+.587*green+.114*blue;
        block.push(channel===0 ? luminance-128 : channel===1 ? (blue-luminance)/(2*(1-.114)) : (red-luminance)/(2*(1-.299)));
      }
      const transformed: number[] = [];
      for (let v=0;v<8;v++) for (let u=0;u<8;u++) {
        let sum=0; for (let y=0;y<8;y++) for (let x=0;x<8;x++) sum+=block[y*8+x]!*cosine[u]![x]!*cosine[v]![y]!;
        const scaled=sum*.25*(u===0 ? Math.SQRT1_2 : 1)*(v===0 ? Math.SQRT1_2 : 1)/q;
        transformed.push(Math.sign(scaled)*Math.round(Math.abs(scaled)));
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
    blocks++;
    },
    finish():Uint8Array {
      if(disposed||blocks!==Math.ceil(width/8)*Math.ceil(height/8))throw new InvalidConfigurationError("JPEG cannot finish incomplete or disposed encoding.");
      if(bits)emit((1<<(8-bits))-1,8-bits);
      push(255,217);const output=storage.slice(0,offset);storage.fill(0);disposed=true;return output;
    },
    dispose():void {storage.fill(0);disposed=true;}
  };
}
