// SPDX-License-Identifier: Apache-2.0

/**
 * Browser-safe PNG still-image encoder for 8- and 16-bit RGB, with explicit colour signalling for wide-gamut
 * and HDR output. Independently written from the W3C PNG Specification (Third Edition, W3C Recommendation
 * 24 June 2025), RFC 1950 (zlib) and RFC 1951 (DEFLATE); no third-party encoder source and no dependency.
 *
 * - Colour: exactly one of an sRGB chunk (plus the gAMA/cHRM compatibility values the PNG specification
 *   lists), an iCCP embedded ICC profile, or a cICP chunk with ITU-T H.273 code points (BT.709/sRGB,
 *   Display P3, BT.2020 primaries; sRGB, BT.709 or linear transfer). PQ and HLG code points are not written:
 *   those transfer functions are not part of 2.0 (see THIRD_PARTY.md).
 * - Static display metadata: mDCV (mastering display colour volume) and cLLI (MaxCLL/MaxFALL), only with cICP,
 *   as defined in the W3C PNG Third Edition and ITU-T H.265 Annex D (also SMPTE ST 2086 and CTA-861.3). The
 *   PNG specification allows mDCV with SDR encodings too, so both stay available for the remaining code points.
 * - Compression: zlib with stored or fixed-Huffman DEFLATE blocks and a bounded greedy LZ77 matcher.
 *   Output bytes are a pure function of the input; no platform CompressionStream is used.
 *
 * The encoder writes the caller's integer code values unchanged. Converting linear light to an encoded
 * signal (for example sRGB) and choosing a gamut mapping is the caller's job.
 * @see docs/IMPORT_AND_PNG.md for chunk layouts, code points and limits.
 */

import { InvalidConfigurationError } from "../core/configuration-error.js";

export const PNG_ENCODER_ID = "photivra-png-rgb-v1" as const;
/** Limits, checked before allocation. 100 MP (megapixels) of 16-bit RGB is about 600 MB of filtered scanlines. */
export const PNG_ENCODER_LIMITS = Object.freeze({ maximumDimension: 65535, maximumPixels: 100_000_000, maximumIccProfileBytes: 4_000_000 });

/** ITU-T H.273 ColourPrimaries: bt709 = 1 (also sRGB), display-p3 = 12 (P3 primaries with D65 white; W3C CSS Color 4, also SMPTE EG 432-1), bt2020 = 9 (BT.2020). */
export type PngCicpPrimaries = "bt709" | "display-p3" | "bt2020";
/** ITU-T H.273 TransferCharacteristics: bt709 = 1, linear = 8, srgb = 13 (sRGB). PQ (16) and HLG (18) are not offered in 2.0. */
export type PngCicpTransfer = "bt709" | "linear" | "srgb";
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

// Maps, not plain objects: a lookup must never reach Object.prototype names such as "constructor" or "toString".
const PRIMARIES: ReadonlyMap<string, number> = new Map<PngCicpPrimaries, number>([["bt709", 1], ["display-p3", 12], ["bt2020", 9]]);
const TRANSFER: ReadonlyMap<string, number> = new Map<PngCicpTransfer, number>([["bt709", 1], ["linear", 8], ["srgb", 13]]);
const INTENT: ReadonlyMap<string, number> = new Map([["perceptual", 0], ["relative-colorimetric", 1], ["saturation", 2], ["absolute-colorimetric", 3]]);
const COLOUR_ENCODING_FIELDS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  srgb: ["kind", "renderingIntent"], icc: ["kind", "profileName", "profile"], cicp: ["kind", "primaries", "transfer", "fullRange"]
});
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

const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const DEFLATE_WINDOW = 32768;

/** Huffman codes are defined MSB-first (RFC 1951 §3.1.1); the stream is LSB-first, so codes are stored bit-reversed. */
function reverseBits(code: number, length: number): number { let r = 0; for (let i = 0; i < length; i++) r = (r << 1) | ((code >> i) & 1); return r; }

interface FixedHuffmanTables {
  /** Bit-reversed RFC 1951 §3.2.6 fixed literal/length codes and their lengths, symbols 0–287. */
  literalCode: Uint16Array; literalBits: Uint8Array;
  /** Per match length 3–258: reversed length code with its extra bits appended, and the total bit count. */
  lengthCode: Uint16Array; lengthBits: Uint8Array;
  /** Per distance 1–32768: reversed 5-bit distance code with its extra bits appended, and the total bit count. */
  distanceCode: Uint32Array; distanceBits: Uint8Array;
}
let fixedTables: FixedHuffmanTables | undefined;
/** Built once: the same codes the per-symbol definition gives, precomputed and pre-reversed. */
function fixedHuffmanTables(): FixedHuffmanTables {
  if (fixedTables) return fixedTables;
  const literalCode = new Uint16Array(288), literalBits = new Uint8Array(288);
  for (let symbol = 0; symbol < 288; symbol++) {
    const [code, bits] = symbol < 144 ? [0x30 + symbol, 8] : symbol < 256 ? [0x190 + symbol - 144, 9] : symbol < 280 ? [symbol - 256, 7] : [0xc0 + symbol - 280, 8];
    literalCode[symbol] = reverseBits(code, bits); literalBits[symbol] = bits;
  }
  const lengthCode = new Uint16Array(259), lengthBits = new Uint8Array(259);
  for (let length = 3, l = 0; length <= 258; length++) {
    while (l < 28 && LENGTH_BASE[l + 1]! <= length) l++; // largest l with LENGTH_BASE[l] <= length
    const symbol = 257 + l, bits = literalBits[symbol]!;
    lengthCode[length] = literalCode[symbol]! | ((length - LENGTH_BASE[l]!) << bits); lengthBits[length] = bits + LENGTH_EXTRA[l]!;
  }
  const distanceCode = new Uint32Array(DEFLATE_WINDOW + 1), distanceBits = new Uint8Array(DEFLATE_WINDOW + 1);
  for (let distance = 1, d = 0; distance <= DEFLATE_WINDOW; distance++) {
    while (d < 29 && DIST_BASE[d + 1]! <= distance) d++;
    distanceCode[distance] = reverseBits(d, 5) | ((distance - DIST_BASE[d]!) << 5); distanceBits[distance] = 5 + DIST_EXTRA[d]!;
  }
  fixedTables = { literalCode, literalBits, lengthCode, lengthBits, distanceCode, distanceBits };
  return fixedTables;
}

/**
 * zlib stream (RFC 1950: CMF 0x78 = deflate with 32 KiB window, FLG 0x01, Adler-32 trailer) holding stored
 * blocks or one fixed-Huffman block. LZ77 is greedy with a 3-byte hash and at most 64 chain probes.
 */
export function deflateZlib(data: Uint8Array, mode: "stored" | "fixed-huffman"): Uint8Array {
  const n = data.length;
  // Exact upper bound: a fixed-Huffman literal is at most 9 bits and a match of length L >= 3 at most 25 bits
  // per 3 bytes, so the block needs at most 9 bits per input byte plus 3 header and 7 end-of-block bits.
  const capacity = 2 + 4 + (mode === "stored" ? n + 5 * Math.max(1, Math.ceil(n / 65535)) : Math.ceil((9 * n + 10) / 8));
  const out = new Uint8Array(capacity);
  let pos = 0;
  out[pos++] = 0x78; out[pos++] = 0x01;
  if (mode === "stored") {
    if (n === 0) { out[pos++] = 1; out[pos++] = 0; out[pos++] = 0; out[pos++] = 255; out[pos++] = 255; }
    for (let i = 0; i < n; i += 65535) {
      const len = Math.min(65535, n - i);
      out[pos++] = i + len >= n ? 1 : 0; out[pos++] = len & 255; out[pos++] = len >> 8; out[pos++] = ~len & 255; out[pos++] = (~len >> 8) & 255;
      out.set(data.subarray(i, i + len), pos); pos += len;
    }
  } else {
    const { literalCode, literalBits, lengthCode, lengthBits, distanceCode, distanceBits } = fixedHuffmanTables();
    // LSB-first bit accumulator; at most 7 bits stay pending, and no single write exceeds 18 bits.
    let accumulator = 0b011, bits = 3; // BFINAL = 1, BTYPE = 01 (fixed Huffman)
    const window = DEFLATE_WINDOW, mask = window - 1, head = new Int32Array(1 << 15).fill(-1), previous = new Int32Array(window).fill(-1);
    // Hash of the 3 bytes at i: ((data[i] << 10) ^ (data[i + 1] << 5) ^ data[i + 2]) & 0x7fff. It rolls exactly as
    // h(i + 1) = ((h(i) << 5) ^ data[i + 3]) & 0x7fff, because the mask drops every bit of data[i] after the shift.
    const hashed = n - 2; // positions i < hashed have three bytes to hash
    let h = n >= 2 ? ((data[0]! << 5) ^ data[1]!) & 0x7fff : 0;
    for (let i = 0; i < n;) {
      let bestLength = 0, bestDistance = 0;
      if (i < hashed) {
        h = ((h << 5) ^ data[i + 2]!) & 0x7fff;
        const limit = Math.min(258, n - i);
        for (let candidate = head[h]!, probes = 0; candidate >= 0 && i - candidate <= window && probes < 64; candidate = previous[candidate & mask]!, probes++) {
          if (candidate >= i) break;
          // A candidate that differs at index bestLength cannot be longer than the current best.
          if (data[candidate + bestLength] !== data[i + bestLength]) continue;
          let length = 0; while (length < limit && data[candidate + length] === data[i + length]) length++;
          if (length > bestLength) { bestLength = length; bestDistance = i - candidate; if (length === limit) break; }
        }
        previous[i & mask] = head[h]!; head[h] = i;
      }
      if (bestLength >= 3) {
        accumulator |= lengthCode[bestLength]! << bits; bits += lengthBits[bestLength]!;
        while (bits >= 8) { out[pos++] = accumulator & 255; accumulator >>>= 8; bits -= 8; }
        accumulator |= distanceCode[bestDistance]! << bits; bits += distanceBits[bestDistance]!;
        const end = i + bestLength;
        for (i++; i < end; i++) {
          if (i < hashed) { h = ((h << 5) ^ data[i + 2]!) & 0x7fff; previous[i & mask] = head[h]!; head[h] = i; }
        }
      } else {
        const symbol = data[i++]!;
        accumulator |= literalCode[symbol]! << bits; bits += literalBits[symbol]!;
      }
      while (bits >= 8) { out[pos++] = accumulator & 255; accumulator >>>= 8; bits -= 8; }
    }
    accumulator |= literalCode[256]! << bits; bits += literalBits[256]!;
    while (bits > 0) { out[pos++] = accumulator & 255; accumulator >>>= 8; bits -= 8; } // flush and byte-align
  }
  const adler = adler32(data);
  out[pos++] = adler >>> 24; out[pos++] = (adler >>> 16) & 255; out[pos++] = (adler >>> 8) & 255; out[pos++] = adler & 255;
  return out.slice(0, pos);
}

/** Writes PNG filter `type` (0–4, PNG specification §9.2) of `raw` against `prior` into `target`. */
function filterRow(type: number, raw: Uint8Array, prior: Uint8Array, target: Uint8Array, rowBytes: number, bpp: number): void {
  const head = Math.min(bpp, rowBytes);
  switch (type) {
    case 0: target.set(raw.subarray(0, rowBytes)); return;
    case 1:
      for (let i = 0; i < head; i++) target[i] = raw[i]!;
      for (let i = bpp; i < rowBytes; i++) target[i] = (raw[i]! - raw[i - bpp]!) & 255;
      return;
    case 2: for (let i = 0; i < rowBytes; i++) target[i] = (raw[i]! - prior[i]!) & 255; return;
    case 3:
      for (let i = 0; i < head; i++) target[i] = (raw[i]! - (prior[i]! >> 1)) & 255;
      for (let i = bpp; i < rowBytes; i++) target[i] = (raw[i]! - ((raw[i - bpp]! + prior[i]!) >> 1)) & 255;
      return;
    default:
      // Paeth with a = c = 0 in the first pixel predicts b.
      for (let i = 0; i < head; i++) target[i] = (raw[i]! - prior[i]!) & 255;
      for (let i = bpp; i < rowBytes; i++) {
        const a = raw[i - bpp]!, b = prior[i]!, c = prior[i - bpp]!, p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        target[i] = (raw[i]! - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
  }
}

/** |v| of a filtered byte v read as a signed byte (two's complement), for the §12.7 heuristic. */
const SIGNED_BYTE_MAGNITUDE = Uint8Array.from({ length: 256 }, (_, v) => (v < 128 ? v : 256 - v));

/** Sum of |signed byte| of filter `type` applied to a row (PNG specification §12.7), without writing the row. */
function filterCost(type: number, raw: Uint8Array, prior: Uint8Array, rowBytes: number, bpp: number): number {
  const head = Math.min(bpp, rowBytes), magnitude = SIGNED_BYTE_MAGNITUDE;
  let sum = 0;
  switch (type) {
    case 0: for (let i = 0; i < rowBytes; i++) sum += magnitude[raw[i]!]!; return sum;
    case 1:
      for (let i = 0; i < head; i++) sum += magnitude[raw[i]!]!;
      for (let i = bpp; i < rowBytes; i++) sum += magnitude[(raw[i]! - raw[i - bpp]!) & 255]!;
      return sum;
    case 2: for (let i = 0; i < rowBytes; i++) sum += magnitude[(raw[i]! - prior[i]!) & 255]!; return sum;
    case 3:
      for (let i = 0; i < head; i++) sum += magnitude[(raw[i]! - (prior[i]! >> 1)) & 255]!;
      for (let i = bpp; i < rowBytes; i++) sum += magnitude[(raw[i]! - ((raw[i - bpp]! + prior[i]!) >> 1)) & 255]!;
      return sum;
    default:
      for (let i = 0; i < head; i++) sum += magnitude[(raw[i]! - prior[i]!) & 255]!;
      for (let i = bpp; i < rowBytes; i++) {
        const a = raw[i - bpp]!, b = prior[i]!, c = prior[i - bpp]!, p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        sum += magnitude[(raw[i]! - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255]!;
      }
      return sum;
  }
}

function requireFields(value: unknown, allowed: readonly string[], name: string): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(name + " must be an object.");
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail("unknown " + name + " field.");
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
  const colourFields = typeof colour.kind === "string" && Object.hasOwn(COLOUR_ENCODING_FIELDS, colour.kind) ? COLOUR_ENCODING_FIELDS[colour.kind]! : undefined;
  if (colourFields === undefined) fail("unknown colourEncoding kind.");
  for (const key of Object.keys(colour)) if (!colourFields.includes(key)) fail("unknown colourEncoding field.");
  if (input.masteringDisplay !== undefined) requireFields(input.masteringDisplay, ["redXy", "greenXy", "blueXy", "whiteXy", "maximumLuminanceCdPerSquareMeter", "minimumLuminanceCdPerSquareMeter"], "masteringDisplay");
  if (input.contentLightLevel !== undefined) requireFields(input.contentLightLevel, ["maximumContentLightLevelCdPerSquareMeter", "maximumFrameAverageLightLevelCdPerSquareMeter"], "contentLightLevel");

  const chunks: { type: string; data: Uint8Array }[] = [];
  const ihdr = new Uint8Array(13), view = new DataView(ihdr.buffer);
  view.setUint32(0, width); view.setUint32(4, height); ihdr[8] = bitDepth; ihdr[9] = 2; // colour type 2: truecolour
  chunks.push({ type: "IHDR", data: ihdr });
  if (colour.kind === "cicp") {
    const p = PRIMARIES.get(colour.primaries), t = TRANSFER.get(colour.transfer);
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
    const intent = INTENT.get(colour.renderingIntent);
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
  const bpp = bitDepth === 8 ? 3 : 6, rowBytes = width * bpp;
  let raw = new Uint8Array(rowBytes), prior = new Uint8Array(rowBytes);
  const filtered = new Uint8Array(height * (rowBytes + 1)), fixedType = filters.indexOf(filter);
  for (let y = 0; y < height; y++) {
    const base = y * width * 3;
    if (bitDepth === 8) raw.set((samples as Uint8Array).subarray(base, base + width * 3));
    else for (let i = 0; i < width * 3; i++) { const v = samples[base + i]!; raw[i * 2] = v >> 8; raw[i * 2 + 1] = v & 255; }
    const row = y * (rowBytes + 1) + 1;
    let type = fixedType;
    if (filter === "adaptive") {
      // PNG specification §12.7 heuristic: choose the type with the minimum sum of |signed byte| (ties: lowest type).
      let best = Infinity;
      for (let t = 0; t <= 4; t++) {
        const sum = filterCost(t, raw, prior, rowBytes, bpp);
        if (sum < best) { best = sum; type = t; }
      }
    }
    filtered[row - 1] = type; filterRow(type, raw, prior, filtered.subarray(row, row + rowBytes), rowBytes, bpp);
    const done = prior; prior = raw; raw = done; // this row is the next row's prior
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
