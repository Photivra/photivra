// SPDX-License-Identifier: Apache-2.0

/**
 * Baseline JPEG encoder written for this project. It computes the DCT (discrete cosine transform)
 * directly and uses no third-party encoder source, default quantization tables or Huffman tables.
 * @see docs/SIMULATED_CAPTURE.md for equations, coordinate/unit conventions, blockers and support
 * limits.
 */

import { InvalidConfigurationError } from "../core/configuration-error.js";

/**
 * Identifies the exact byte output of the baseline encoder.
 *
 * Version 2 (engine 2.0.0) uses the fixed cosine table below instead of runtime `Math.cos`, and rounds
 * quantized coefficients half away from zero. Compared with version 1, bytes can differ only where a
 * coefficient before rounding was within about one ULP (unit in the last place) of a half-integer, or
 * was exactly a negative half-integer. The repository's test images are unchanged.
 */
export const EXPORT_JPEG_ENCODER_ID = "photivra-baseline-jpeg-444-v2" as const;
/**
 * C(u,x) = cos((2x+1)·u·π/16) for u,x in 0..7, row-major by u.
 *
 * Each entry is the correctly rounded IEEE-754 double of the exact cosine. They were computed offline with
 * 130-digit decimal arithmetic and checked so that no neighbouring double is closer (see
 * docs/PHOTOGRAPHIC_EXPORT.md). Hard-coding them makes the DCT independent of each JavaScript engine's
 * `Math.cos`, which differs in the last bit between engines. These are mathematical facts, not third-party data.
 */
export const JPEG_DCT_COSINES: Readonly<Float64Array> = Float64Array.of(
  1,1,1,1,1,1,1,1,
  0.9807852804032304,0.8314696123025452,0.5555702330196022,0.19509032201612828,-0.19509032201612828,-0.5555702330196022,-0.8314696123025452,-0.9807852804032304,
  0.9238795325112867,0.3826834323650898,-0.3826834323650898,-0.9238795325112867,-0.9238795325112867,-0.3826834323650898,0.3826834323650898,0.9238795325112867,
  0.8314696123025452,-0.19509032201612828,-0.9807852804032304,-0.5555702330196022,0.5555702330196022,0.9807852804032304,0.19509032201612828,-0.8314696123025452,
  0.7071067811865476,-0.7071067811865476,-0.7071067811865476,0.7071067811865476,0.7071067811865476,-0.7071067811865476,-0.7071067811865476,0.7071067811865476,
  0.5555702330196022,-0.9807852804032304,0.19509032201612828,0.8314696123025452,-0.8314696123025452,-0.19509032201612828,0.9807852804032304,-0.5555702330196022,
  0.3826834323650898,-0.9238795325112867,0.9238795325112867,-0.3826834323650898,-0.3826834323650898,0.9238795325112867,-0.9238795325112867,0.3826834323650898,
  0.19509032201612828,-0.5555702330196022,0.8314696123025452,-0.9807852804032304,0.9807852804032304,-0.8314696123025452,0.5555702330196022,-0.19509032201612828
);
/**
 * Rounds a quantized coefficient to the nearest integer, with ties going away from zero (−2.5 → −3,
 * 2.5 → 3), so positive and negative values round the same way. `Math.round` alone sends −2.5 to −2.
 */
export function roundJpegCoefficient(value: number): number {
  return value<0 ? -Math.round(-value) : Math.round(value);
}

/** Internal baseline JPEG settings: 8-bit YCbCr 4:4:4, one explicit constant quantization step, and uniform Huffman tables written for this project. */
export interface ExportJpegInput { width: number; height: number; samples: readonly number[]; quantizationStep: number; exif: Uint8Array; xmp: Uint8Array }
/** Encodes a baseline JPEG with a directly computed DCT. Uses no third-party encoder source, default quantization tables or Huffman tables. */
export function encodeExportJpeg(input: ExportJpegInput): Uint8Array {
  const { width, height, samples, quantizationStep: q } = input;
  if (![width,height,q].every(Number.isSafeInteger) || width < 1 || height < 1 || width*height > 4096 ||
      q < 1 || q > 255 || samples.length !== width*height*3 || Array.from(samples).some((v) => !Number.isInteger(v) || v < 0 || v > 255)) {
    throw new InvalidConfigurationError("Unsupported baseline JPEG input.");
  }
  const encoder=createExportJpegEncoder({...input,maximumOutputBytes:1_000_000});
  for(let by=0;by<height;by+=8)for(let bx=0;bx<width;bx+=8){
    const block:number[]=[];
    for(let y=0;y<8;y++)for(let x=0;x<8;x++){
      const p=(Math.min(by+y,height-1)*width+Math.min(bx+x,width-1))*3;
      block.push(samples[p]!,samples[p+1]!,samples[p+2]!);
    }
    encoder.writeRgbBlock(block);
  }
  return encoder.finish();
}
/**
 * Internal size-limited JPEG writer. The reference export and the scalable export use exactly the same
 * DCT and entropy-coding equations.
 *
 * When `densityDotsPerInch` is supplied, it is written to the JFIF 1.02 APP0 segment as units=1 (dots
 * per inch) with equal X and Y density. JFIF density fields are 16-bit unsigned, so it must be an integer
 * in 1..65535; callers round any fractional density and store the exact value in EXIF. When omitted,
 * APP0 keeps units=0 with a 1:1 pixel aspect ratio and states no physical size.
 */
export function createExportJpegEncoder(input: Omit<ExportJpegInput,"samples"> & {maximumOutputBytes:number;icc?:Uint8Array;densityDotsPerInch?:number}): {
  writeRgbBlock(samples:readonly number[]):void; finish():Uint8Array; dispose():void;
} {
  const {width,height,quantizationStep:q}=input;
  if(![width,height,q,input.maximumOutputBytes].every(Number.isSafeInteger)||width<1||height<1||width>65535||height>65535||q<1||q>255||input.maximumOutputBytes<1||input.maximumOutputBytes>256_000_000)
    throw new InvalidConfigurationError("Invalid bounded JPEG encoding plan.");
  const density=input.densityDotsPerInch;
  if(density!==undefined&&(!Number.isSafeInteger(density)||density<1||density>65535))
    throw new InvalidConfigurationError("JFIF density requires an integer from 1 to 65535 dots per inch.");
  // Growable output. Capacity starts at min(budget, 64 KiB) and doubles, but never beyond the budget. The budget
  // check is unchanged (offset + n > maximumOutputBytes fails), so the output bytes and failures are the same as
  // with a buffer allocated at full budget up front. An old buffer is zeroed after its bytes are copied over.
  const budget=input.maximumOutputBytes;
  let storage=new Uint8Array(Math.min(budget,65_536)),offset=0,disposed=false,blocks=0;
  const reserve=(count:number):void=>{
    if(disposed||offset+count>budget)throw new InvalidConfigurationError("JPEG output exceeds admitted byte budget or is disposed.");
    if(offset+count<=storage.length)return;
    const grown=new Uint8Array(Math.min(budget,Math.max(storage.length*2,offset+count)));
    grown.set(storage.subarray(0,offset));storage.fill(0,0,offset);storage=grown;
  };
  const push=(...values:number[]):void=>{reserve(values.length);storage.set(values,offset);offset+=values.length;};
  // Fast path for one entropy-coded byte: the same budget/disposal check and byte order as push(), without an array per byte.
  const pushByte=(value:number):void=>{if(disposed||offset>=storage.length)reserve(1);storage[offset++]=value;};
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
  // Incomplete canonical Huffman trees reserve the all-ones code, so JPEG bit padding (1-bits) can never be read as a symbol.
  const dc = Array.from({length:12},(_,i) => i), ac = [0,240];
  for (let run=0;run<16;run++) for (let size=1;size<=10;size++) ac.push(run*16+size);
  marker(196,[0,...Array.from({length:16},(_,i) => i===3 ? 12 : 0),...dc,
    16,...Array.from({length:16},(_,i) => i===7 ? ac.length : 0),...ac]);
  marker(218,[3,1,0,2,0,3,0,0,63,0]);
  let accumulator=0, bits=0;
  // Appends the low `count` bits (count <= 16) most-significant first, emitting each completed byte with 0xFF stuffing.
  const emit = (value: number, count: number): void => {
    accumulator=(accumulator<<count)|(value&((1<<count)-1)); bits+=count;
    while (bits>=8) { bits-=8; const byte=(accumulator>>>bits)&255; pushByte(byte); if (byte===255) pushByte(0); }
    accumulator&=(1<<bits)-1;
  };
  const amplitude = (value: number, max: number): number => {
    const size=value===0 ? 0 : Math.floor(Math.log2(Math.abs(value)))+1;
    if (size>max) throw new InvalidConfigurationError("JPEG coefficient exceeds baseline entropy range.");
    return size;
  };
  const coefficient = (value: number, size: number): void => { if (size) emit(value>=0 ? value : value+(1<<size)-1,size); };
  const zigzag=new Int32Array(64);
  for (let diagonal=0,i=0;diagonal<=14;diagonal++) {
    const points: number[] = [];
    for (let y=0;y<8;y++) { const x=diagonal-y; if (x>=0 && x<8) points.push(y*8+x); }
    for (const point of diagonal%2===0 ? points.reverse() : points) zigzag[i++]=point;
  }
  // Huffman symbol index of each AC (run, size) pair; equals ac.indexOf(symbol) for every emitted symbol.
  const acIndex=new Int16Array(256).fill(-1);
  for (let i=ac.length-1;i>=0;i--) acIndex[ac[i]!]=i;
/**
 * The 8×8 DCT, computed directly, with orthonormal DC factors and one chosen quantization step.
 *
 * This is a deliberately simple 4:4:4 reference encoder. Lossy quantization means exact RGB pixels are
 * not preserved. Decoding the JPEG and comparing is an interoperability check, not an exact scientific
 * check of pixel values.
 *
 * Each coefficient is the direct 64-term sum Σ_y Σ_x (f(x,y)·C(u,x))·C(v,y), summed over y, then x.
 * The row products f(x,y)·C(u,x) are computed once per u and reused for all eight v. This reuses the
 * identical IEEE-754 products and keeps the exact order of multiplication and summation. A factored
 * row/column DCT would reorder the sum, so it is deliberately not used.
 *
 * C(u,x) comes from the fixed table `JPEG_DCT_COSINES` (correctly rounded constants), not `Math.cos`,
 * so the coefficients do not depend on the JavaScript engine's maths library. Each quantized coefficient
 * is rounded half away from zero (`roundJpegCoefficient`).
 */
  const cosine=JPEG_DCT_COSINES;
  const previous=[0,0,0];
  const planes=[new Float64Array(64),new Float64Array(64),new Float64Array(64)];
  const rowProducts=new Float64Array(64), transformed=new Float64Array(64);
  const blueScale=2*(1-.114), redScale=2*(1-.299);
  return {
    writeRgbBlock(samples:readonly number[]):void {
      let valid=!disposed&&blocks<Math.ceil(width/8)*Math.ceil(height/8)&&samples.length===192;
      for(let i=0;valid&&i<192;i++){const v=samples[i]!;valid=Number.isInteger(v)&&v>=0&&v<=255;}
      if(!valid)throw new InvalidConfigurationError("JPEG requires complete bounded RGB coding blocks.");
    const [luma,blueDifference,redDifference]=planes as [Float64Array,Float64Array,Float64Array];
    for (let i=0;i<64;i++) {
      // JPEG pads only partial 8x8 blocks (MCUs, minimum coded units). The declared image and crop size never change.
      const p=i*3;
      const red=samples[p]!, green=samples[p+1]!, blue=samples[p+2]!, luminance=.299*red+.587*green+.114*blue;
      luma[i]=luminance-128; blueDifference[i]=(blue-luminance)/blueScale; redDifference[i]=(red-luminance)/redScale;
    }
    for (let channel=0;channel<3;channel++) {
      const block=planes[channel]!;
      for (let u=0;u<8;u++) {
        const uOffset=u*8;
        for (let y=0;y<8;y++) for (let x=0;x<8;x++) rowProducts[y*8+x]=block[y*8+x]!*cosine[uOffset+x]!;
        const uFactor=u===0 ? Math.SQRT1_2 : 1;
        for (let v=0;v<8;v++) {
          const vOffset=v*8;
          let sum=0; for (let y=0;y<8;y++) { const cv=cosine[vOffset+y]!; for (let x=0;x<8;x++) sum+=rowProducts[y*8+x]!*cv; }
          transformed[vOffset+u]=roundJpegCoefficient(sum*.25*uFactor*(v===0 ? Math.SQRT1_2 : 1)/q);
        }
      }
      const difference=transformed[0]!-previous[channel]!, size=amplitude(difference,11); emit(size,4); coefficient(difference,size); previous[channel]=transformed[0]!;
      let zeroes=0;
      for (let i=1;i<64;i++) {
        const value=transformed[zigzag[i]!]!;
        if (value===0) { zeroes++; continue; }
        while (zeroes>=16) { emit(1,8); zeroes-=16; }
        const length=amplitude(value,10), symbol=zeroes*16+length; emit(acIndex[symbol]!,8); coefficient(value,length); zeroes=0;
      }
      if (zeroes) emit(0,8);
    }
    blocks++;
    },
    finish():Uint8Array {
      if(disposed||blocks!==Math.ceil(width/8)*Math.ceil(height/8))throw new InvalidConfigurationError("JPEG cannot finish incomplete or disposed encoding.");
      if(bits)emit((1<<(8-bits))-1,8-bits);
      // Only the written prefix can hold data; zero it after the copy instead of filling the whole capacity.
      push(255,217);const output=storage.slice(0,offset);storage.fill(0,0,offset);storage=new Uint8Array(0);disposed=true;return output;
    },
    dispose():void {storage.fill(0,0,offset);storage=new Uint8Array(0);disposed=true;}
  };
}
