// SPDX-License-Identifier: Apache-2.0

/**
 * Browser-safe PNG still-image encoder for 8- and 16-bit RGB, with explicit colour signalling for wide-gamut
 * and HDR output. Independently written from the W3C PNG Specification (Third Edition, W3C Recommendation
 * 24 June 2025), RFC 1950 (zlib) and RFC 1951 (DEFLATE); no third-party encoder source and no dependency.
 *
 * - Colour: exactly one of an sRGB chunk (plus the gAMA/cHRM compatibility values the PNG specification
 *   lists), an iCCP embedded ICC profile, or a cICP chunk with ITU-T H.273 code points (BT.709/sRGB,
 *   Display P3, BT.2020/BT.2100 primaries; sRGB, BT.709, linear, PQ or HLG transfer).
 * - HDR static metadata: mDCV (mastering display colour volume) and cLLI (MaxCLL/MaxFALL), only with cICP, as
 *   defined in the W3C PNG Third Edition and ITU-T H.265 Annex D (also SMPTE ST 2086 and CTA-861.3).
 * - Compression: zlib with stored or fixed-Huffman DEFLATE blocks and a bounded greedy LZ77 matcher.
 *   Output bytes are a pure function of the input; no platform CompressionStream is used.
 *
 * The encoder writes the caller's integer code values unchanged. Converting linear light to an encoded
 * signal (sRGB, PQ, HLG) and choosing a gamut mapping is the caller's job.
 * @see docs/IMPORT_AND_PNG.md for chunk layouts, code points and limits.
 */

import { InvalidConfigurationError } from "../core/configuration-error.js";

export const PNG_ENCODER_ID = "photivra-png-rgb-v1" as const;
/** Limits, checked before allocation. 100 MP (megapixels) of 16-bit RGB is about 600 MB of filtered scanlines. */
export const PNG_ENCODER_LIMITS = Object.freeze({ maximumDimension: 65535, maximumPixels: 100_000_000, maximumIccProfileBytes: 4_000_000 });

/** ITU-T H.273 ColourPrimaries: bt709 = 1 (also sRGB), display-p3 = 12 (P3 primaries with D65 white; W3C CSS Color 4, also SMPTE EG 432-1), bt2020 = 9 (BT.2020/BT.2100). */
export type PngCicpPrimaries = "bt709" | "display-p3" | "bt2020";
/** ITU-T H.273 TransferCharacteristics: bt709 = 1, linear = 8, srgb = 13 (sRGB), pq = 16 (ITU-R BT.2100 PQ), hlg = 18 (ARIB STD-B67). */
export type PngCicpTransfer = "bt709" | "linear" | "srgb" | "pq" | "hlg";
export type PngColourEncoding =
  | { kind: "srgb"; renderingIntent: "perceptual" | "relative-colorimetric" | "saturation" | "absolute-colorimetric" }
  | { kind: "icc"; profileName: string; profile: Uint8Array }
  | { kind: "cicp"; primaries: PngCicpPrimaries; transfer: PngCicpTransfer; fullRange: boolean };
/** Mastering display colour volume (W3C PNG mDCV; ITU-T H.265 Annex D SEI; also SMPTE ST 2086): CIE 1931 xy chromaticities and luminance in cd/m². */
export interface PngMasteringDisplay {
  redXy: readonly [number, number];
  greenXy: readonly [number, number];
  blueXy: readonly [number, number];
  whiteXy: readonly [number, number];
  maximumLuminanceCdPerSquareMeter: number;
  minimumLuminanceCdPerSquareMeter: number;
}
/** Content light level in cd/m² (W3C PNG cLLI; ITU-T H.265 content light level SEI; also CTA-861.3); 0 means unknown. */
export interface PngContentLightLevel {
  maximumContentLightLevelCdPerSquareMeter: number;
  maximumFrameAverageLightLevelCdPerSquareMeter: number;
}
export interface PngEncodeInput {
  width: number;
  height: number;
  bitDepth: 8 | 16;
  /** Interleaved RGB code values, row-major; Uint8Array for 8-bit, Uint16Array for 16-bit. */
  samples: Uint8Array | Uint16Array;
  colourEncoding: PngColourEncoding;
  masteringDisplay?: PngMasteringDisplay;
  contentLightLevel?: PngContentLightLevel;
  /** Default "fixed-huffman". */
  compression?: "stored" | "fixed-huffman";
  /** PNG filter type 0..4 for every row, or the specification's minimum-sum-of-absolute-differences heuristic. Default "adaptive". */
  filter?: "none" | "sub" | "up" | "average" | "paeth" | "adaptive";
}

const PRIMARIES: Record<PngCicpPrimaries, number> = { bt709: 1, "display-p3": 12, bt2020: 9 };
const TRANSFER: Record<PngCicpTransfer, number> = { bt709: 1, linear: 8, srgb: 13, pq: 16, hlg: 18 };
const INTENT = { perceptual: 0, "relative-colorimetric": 1, saturation: 2, "absolute-colorimetric": 3 } as const;
function fail(message: string): never { throw new InvalidConfigurationError("PNG encoder: " + message); }

/** Growable byte sink; doubles capacity as needed. */
class ByteSink {
  bytes = new Uint8Array(1 << 16); length = 0;
  reserve(count: number): void {
    if (this.length + count <= this.bytes.length) return;
    let size = this.bytes.length * 2; while (size < this.length + count) size *= 2;
    const grown = new Uint8Array(size); grown.set(this.bytes.subarray(0, this.length)); this.bytes = grown;
  }
  push(...values: number[]): void { this.reserve(values.length); for (const v of values) this.bytes[this.length++] = v; }
  append(data: Uint8Array): void { this.reserve(data.length); this.bytes.set(data, this.length); this.length += data.length; }
  u32(v: number): void { this.push(v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255); }
  result(): Uint8Array { return this.bytes.slice(0, this.length); }
}

let crcTable: Uint32Array | undefined;
/** CRC-32 (ISO 3309 / ITU-T V.42 polynomial 0xEDB88320, reflected), as specified for PNG chunks. */
export function pngCrc32(data: Uint8Array, initial = 0): number {
  const table = crcTable ??= Uint32Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  let c = ~initial >>> 0;
  for (let i = 0; i < data.length; i++) c = table[(c ^ data[i]!) & 255]! ^ (c >>> 8);
  return ~c >>> 0;
}
function adler32(data: Uint8Array): number {
  let a = 1, b = 0;
  for (let i = 0; i < data.length;) {
    const end = Math.min(data.length, i + 5552); // largest run that cannot overflow before the modulo (RFC 1950)
    for (; i < end; i++) { a += data[i]!; b += a; }
    a %= 65521; b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** LSB-first DEFLATE bit writer. */
class BitWriter {
  sink = new ByteSink(); accumulator = 0; bits = 0;
  write(value: number, count: number): void {
    this.accumulator |= value << this.bits; this.bits += count;
    while (this.bits >= 8) { this.sink.reserve(1); this.sink.bytes[this.sink.length++] = this.accumulator & 255; this.accumulator >>>= 8; this.bits -= 8; }
  }
  /** Huffman codes are defined MSB-first (RFC 1951 §3.1.1); reverse them for the LSB-first stream. */
  code(code: number, length: number): void { let r = 0; for (let i = 0; i < length; i++) r = (r << 1) | ((code >> i) & 1); this.write(r, length); }
  align(): void { if (this.bits) this.write(0, 8 - this.bits); }
}
const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
/** RFC 1951 §3.2.6 fixed literal/length code. */
function fixedLiteral(out: BitWriter, symbol: number): void {
  if (symbol < 144) out.code(0x30 + symbol, 8);
  else if (symbol < 256) out.code(0x190 + symbol - 144, 9);
  else if (symbol < 280) out.code(symbol - 256, 7);
  else out.code(0xc0 + symbol - 280, 8);
}

/**
 * zlib stream (RFC 1950: CMF 0x78 = deflate with 32 KiB window, FLG 0x01, Adler-32 trailer) holding stored
 * blocks or one fixed-Huffman block. LZ77 is greedy with a 3-byte hash and at most 64 chain probes.
 */
export function deflateZlib(data: Uint8Array, mode: "stored" | "fixed-huffman"): Uint8Array {
  const out = new BitWriter();
  out.sink.push(0x78, 0x01);
  if (mode === "stored") {
    if (data.length === 0) out.sink.push(1, 0, 0, 255, 255);
    for (let i = 0; i < data.length; i += 65535) {
      const n = Math.min(65535, data.length - i);
      out.sink.push(i + n >= data.length ? 1 : 0, n & 255, n >> 8, ~n & 255, (~n >> 8) & 255);
      out.sink.append(data.subarray(i, i + n));
    }
  } else {
    out.write(1, 1); out.write(1, 2); // BFINAL = 1, BTYPE = 01 (fixed Huffman)
    const window = 32768, head = new Int32Array(1 << 15).fill(-1), previous = new Int32Array(window).fill(-1);
    const hash = (i: number): number => ((data[i]! << 10) ^ (data[i + 1]! << 5) ^ data[i + 2]!) & 0x7fff;
    const insert = (i: number): void => { if (i + 2 < data.length) { const h = hash(i); previous[i & (window - 1)] = head[h]!; head[h] = i; } };
    for (let i = 0; i < data.length;) {
      let bestLength = 0, bestDistance = 0;
      if (i + 2 < data.length) {
        const limit = Math.min(258, data.length - i);
        for (let candidate = head[hash(i)]!, probes = 0; candidate >= 0 && i - candidate <= window && probes < 64; candidate = previous[candidate & (window - 1)]!, probes++) {
          if (candidate >= i) break;
          let length = 0; while (length < limit && data[candidate + length] === data[i + length]) length++;
          if (length > bestLength) { bestLength = length; bestDistance = i - candidate; if (length === limit) break; }
        }
      }
      if (bestLength >= 3) {
        let l = 28; while (LENGTH_BASE[l]! > bestLength) l--;
        fixedLiteral(out, 257 + l); out.write(bestLength - LENGTH_BASE[l]!, LENGTH_EXTRA[l]!);
        let d = 29; while (DIST_BASE[d]! > bestDistance) d--;
        out.code(d, 5); out.write(bestDistance - DIST_BASE[d]!, DIST_EXTRA[d]!);
        for (let k = 0; k < bestLength; k++) insert(i + k);
        i += bestLength;
      } else { fixedLiteral(out, data[i]!); insert(i); i++; }
    }
    fixedLiteral(out, 256);
    out.align();
  }
  out.sink.u32(adler32(data));
  return out.sink.result();
}

function finite(value: number, minimum: number, maximum: number, message: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) fail(message);
  return value;
}

/**
 * Encode an RGB still image as PNG (colour type 2, no interlace). Samples are written unchanged; 16-bit
 * samples are stored big-endian as PNG requires. Throws `InvalidConfigurationError` for any invalid or
 * inconsistent field before allocating the scanline buffer.
 */
export function serializePngImage(input: PngEncodeInput): Uint8Array {
  if (input === null || typeof input !== "object") fail("input must be an object.");
  for (const key of Object.keys(input)) if (!["width", "height", "bitDepth", "samples", "colourEncoding", "masteringDisplay", "contentLightLevel", "compression", "filter"].includes(key)) fail("unknown input field.");
  const { width, height, bitDepth, samples } = input;
  if (![width, height].every((v) => Number.isSafeInteger(v) && v >= 1 && v <= PNG_ENCODER_LIMITS.maximumDimension) || width * height > PNG_ENCODER_LIMITS.maximumPixels) fail("dimensions are out of range.");
  if (bitDepth !== 8 && bitDepth !== 16) fail("bitDepth must be 8 or 16.");
  if (bitDepth === 8 ? !(samples instanceof Uint8Array) : !(samples instanceof Uint16Array)) fail("samples must be a Uint8Array for 8-bit or a Uint16Array for 16-bit.");
  if (samples.length !== width * height * 3) fail("samples must hold width x height RGB triples.");
  const compression = input.compression ?? "fixed-huffman", filter = input.filter ?? "adaptive";
  if (compression !== "stored" && compression !== "fixed-huffman") fail("unknown compression.");
  const filters = ["none", "sub", "up", "average", "paeth", "adaptive"] as const;
  if (!filters.includes(filter)) fail("unknown filter.");
  const colour = input.colourEncoding;
  if (colour === null || typeof colour !== "object") fail("colourEncoding is required.");

  const chunks: { type: string; data: Uint8Array }[] = [];
  const ihdr = new Uint8Array(13), view = new DataView(ihdr.buffer);
  view.setUint32(0, width); view.setUint32(4, height); ihdr[8] = bitDepth; ihdr[9] = 2; // colour type 2: truecolour
  chunks.push({ type: "IHDR", data: ihdr });
  if (colour.kind === "cicp") {
    const p = PRIMARIES[colour.primaries], t = TRANSFER[colour.transfer];
    if (p === undefined || t === undefined || typeof colour.fullRange !== "boolean") fail("unknown cICP primaries or transfer.");
    // MatrixCoefficients 0 (identity/RGB) is the only value PNG permits.
    chunks.push({ type: "cICP", data: Uint8Array.of(p, t, 0, colour.fullRange ? 1 : 0) });
  } else if (colour.kind === "icc") {
    const name = colour.profileName, profile = colour.profile;
    if (typeof name !== "string" || !/^[\x20-\x7e\xa1-\xff]{1,79}$/.test(name) || name.startsWith(" ") || name.endsWith(" ") || name.includes("  ")) fail("ICC profile name must be 1-79 Latin-1 characters without leading, trailing or repeated spaces.");
    if (!(profile instanceof Uint8Array) || profile.length < 132 || profile.length > PNG_ENCODER_LIMITS.maximumIccProfileBytes ||
      new DataView(profile.buffer, profile.byteOffset, profile.byteLength).getUint32(0) !== profile.length) fail("ICC profile must be a complete profile whose header size matches its length.");
    const compressed = deflateZlib(profile, compression), data = new Uint8Array(name.length + 2 + compressed.length);
    for (let i = 0; i < name.length; i++) data[i] = name.charCodeAt(i);
    data.set(compressed, name.length + 2); // NUL separator and compression method 0 are already zero
    chunks.push({ type: "iCCP", data });
  } else if (colour.kind === "srgb") {
    const intent = INTENT[colour.renderingIntent];
    if (intent === undefined) fail("unknown sRGB rendering intent.");
    // PNG Third Edition Table 17: the only gAMA/cHRM values to accompany sRGB.
    const gama = new Uint8Array(4); new DataView(gama.buffer).setUint32(0, 45455);
    const chrm = new Uint8Array(32), c = new DataView(chrm.buffer);
    [31270, 32900, 64000, 33000, 30000, 60000, 15000, 6000].forEach((v, i) => c.setUint32(i * 4, v));
    chunks.push({ type: "sRGB", data: Uint8Array.of(intent) }, { type: "gAMA", data: gama }, { type: "cHRM", data: chrm });
  } else fail("unknown colourEncoding kind.");
  if ((input.masteringDisplay || input.contentLightLevel) && colour.kind !== "cicp") fail("mDCV and cLLI metadata require a cICP colour encoding.");
  if (input.masteringDisplay) {
    const m = input.masteringDisplay, data = new Uint8Array(24), d = new DataView(data.buffer);
    [m.redXy, m.greenXy, m.blueXy, m.whiteXy].forEach((xy, i) => {
      if (!Array.isArray(xy) || xy.length !== 2) fail("mastering chromaticities must be [x, y] pairs.");
      // Stored value = chromaticity / 0.00002, a PNG two-byte unsigned integer.
      for (let k = 0; k < 2; k++) d.setUint16(i * 4 + k * 2, Math.round(finite(xy[k]!, 0, 1.3107, "mastering chromaticity must be in 0..1.3107.") * 50000));
    });
    const max = finite(m.maximumLuminanceCdPerSquareMeter, 0, 429496.7295, "mastering luminance is out of range."), min = finite(m.minimumLuminanceCdPerSquareMeter, 0, 429496.7295, "mastering luminance is out of range.");
    if (min >= max) fail("mastering minimum luminance must be below the maximum.");
    d.setUint32(16, Math.round(max * 10000)); d.setUint32(20, Math.round(min * 10000)); // divisor 0.0001 cd/m²
    chunks.push({ type: "mDCV", data });
  }
  if (input.contentLightLevel) {
    const l = input.contentLightLevel, data = new Uint8Array(8), d = new DataView(data.buffer);
    const cll = finite(l.maximumContentLightLevelCdPerSquareMeter, 0, 429496.7295, "content light level is out of range."), fall = finite(l.maximumFrameAverageLightLevelCdPerSquareMeter, 0, 429496.7295, "content light level is out of range.");
    if (cll !== 0 && fall > cll) fail("MaxFALL cannot exceed MaxCLL.");
    d.setUint32(0, Math.round(cll * 10000)); d.setUint32(4, Math.round(fall * 10000));
    chunks.push({ type: "cLLI", data });
  }

  // Scanlines: one filter-type byte then big-endian samples; bpp = bytes per complete pixel.
  const bpp = bitDepth === 8 ? 3 : 6, rowBytes = width * bpp, raw = new Uint8Array(rowBytes), prior = new Uint8Array(rowBytes);
  const filtered = new Uint8Array(height * (rowBytes + 1)), candidate = new Uint8Array(rowBytes);
  const applyFilter = (type: number, target: Uint8Array): void => {
    for (let i = 0; i < rowBytes; i++) {
      const a = i >= bpp ? raw[i - bpp]! : 0, b = prior[i]!, c = i >= bpp ? prior[i - bpp]! : 0, x = raw[i]!;
      let predictor = 0;
      if (type === 1) predictor = a; else if (type === 2) predictor = b; else if (type === 3) predictor = (a + b) >> 1;
      else if (type === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      target[i] = (x - predictor) & 255;
    }
  };
  for (let y = 0; y < height; y++) {
    const base = y * width * 3;
    if (bitDepth === 8) raw.set((samples as Uint8Array).subarray(base, base + width * 3));
    else for (let i = 0; i < width * 3; i++) { const v = samples[base + i]!; raw[i * 2] = v >> 8; raw[i * 2 + 1] = v & 255; }
    const row = y * (rowBytes + 1) + 1, target = filtered.subarray(row, row + rowBytes);
    let type = filters.indexOf(filter);
    if (filter === "adaptive") {
      // PNG specification §12.7 heuristic: choose the type with the minimum sum of |signed byte| (ties: lowest type).
      let best = Infinity;
      for (let t = 0; t <= 4; t++) {
        applyFilter(t, candidate);
        let sum = 0; for (let i = 0; i < rowBytes; i++) { const v = candidate[i]!; sum += v < 128 ? v : 256 - v; }
        if (sum < best) { best = sum; type = t; }
      }
    }
    filtered[row - 1] = type; applyFilter(type, target);
    prior.set(raw);
  }
  const idat = deflateZlib(filtered, compression);

  const out = new ByteSink();
  out.push(137, 80, 78, 71, 13, 10, 26, 10);
  const writeChunk = (type: string, data: Uint8Array): void => {
    const typeBytes = Uint8Array.from(type, (ch) => ch.charCodeAt(0));
    out.u32(data.length); out.append(typeBytes); out.append(data);
    out.u32(pngCrc32(data, pngCrc32(typeBytes)));
  };
  for (const chunk of chunks) writeChunk(chunk.type, chunk.data);
  for (let i = 0; i < idat.length; i += 1 << 20) writeChunk("IDAT", idat.subarray(i, Math.min(idat.length, i + (1 << 20))));
  writeChunk("IEND", new Uint8Array(0));
  return out.result();
}
