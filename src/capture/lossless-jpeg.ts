// SPDX-License-Identifier: Apache-2.0

/**
 * Size-limited decoder for lossless Huffman JPEG (ITU-T T.81 | ISO/IEC 10918-1, Annex H, process 14,
 * SOF3), the variant DNG uses for Compression = 7 raw data. Written independently from the published
 * standard, with no third-party decoder source. Browser-safe: plain typed arrays, no I/O.
 *
 * Supported: one SOF3 frame, precision 2..16, 1..4 components with 1x1 sampling, one interleaved scan
 * over all components, predictors 1..7, point transform, DRI restart intervals, 0xFF00 byte stuffing.
 * Rejected: hierarchical/DCT/arithmetic frames, multiple scans, subsampled components, truncated data.
 */

import { rejectUnknownFields } from "../core/record-validation.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";

/** Decoded lossless JPEG samples, interleaved by component within each line (line, x, component). */
export interface LosslessJpegImage {
  /** Samples per line (X in the frame header). */
  width: number;
  /** Lines (Y in the frame header). */
  height: number;
  components: number;
  /** Sample precision P in bits, 2..16. */
  precision: number;
  predictor: number;
  pointTransform: number;
  samples: Uint16Array;
}
export interface LosslessJpegLimits {
  /** Largest width x height x components accepted. Checked before output is allocated. */
  maximumSamples: number;
  /**
   * DNG files with DNGVersion below 1.1.0.0 store 16 extra bits after the SSSS = 16 difference category
   * (DNG 1.7.1.0 specification, Compatibility Issue 2). Standard streams store none.
   */
  legacySixteenBitDifference?: boolean;
}

interface HuffmanTable { maxCode: Int32Array; valPtr: Int32Array; minCode: Int32Array; values: Uint8Array }
function fail(message: string): never { throw new InvalidConfigurationError("Lossless JPEG: " + message); }

/** T.81 Annex C code generation and F.2.2.3 decoder tables (MINCODE, MAXCODE, VALPTR). */
function buildTable(counts: Uint8Array, values: Uint8Array): HuffmanTable {
  const maxCode = new Int32Array(17).fill(-1), minCode = new Int32Array(17), valPtr = new Int32Array(17);
  let code = 0, k = 0;
  for (let length = 1; length <= 16; length++) {
    const n = counts[length - 1]!;
    if (n) { valPtr[length] = k; minCode[length] = code; code += n; k += n; maxCode[length] = code - 1; }
    // Canonical codes of `length` bits must fit in `length` bits.
    if (code > (1 << length)) fail("over-subscribed Huffman table.");
    code <<= 1;
  }
  return { maxCode, minCode, valPtr, values };
}

/**
 * Decodes one lossless JPEG stream. Every length, count and table index is checked against the
 * buffer. Output is allocated only after the declared size passes `limits.maximumSamples`.
 */
export function parseLosslessJpeg(bytes: Uint8Array, limits: LosslessJpegLimits): LosslessJpegImage {
  if (!(bytes instanceof Uint8Array)) fail("input must be a Uint8Array.");
  if (limits === null || typeof limits !== "object" || Array.isArray(limits)) fail("limits must be an object.");
  rejectUnknownFields(limits, ["maximumSamples", "legacySixteenBitDifference"], "Lossless JPEG limits");
  if (!Number.isSafeInteger(limits.maximumSamples) || limits.maximumSamples < 1) fail("invalid sample limit.");
  const length = bytes.length;
  if (length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) fail("missing SOI marker.");
  const tables: (HuffmanTable | undefined)[] = [];
  let frame: { precision: number; height: number; width: number; ids: number[] } | undefined;
  let restartInterval = 0, p = 2;
  for (;;) {
    while (p < length && bytes[p] === 0xff && bytes[p + 1] === 0xff) p++; // fill bytes before a marker
    if (p + 4 > length || bytes[p] !== 0xff) fail("malformed marker segment.");
    const marker = bytes[p + 1]!;
    if (marker === 0xd9) fail("no scan before EOI.");
    const size = bytes[p + 2]! * 256 + bytes[p + 3]!, start = p + 4, end = p + 2 + size;
    if (size < 2 || end > length) fail("segment exceeds the stream.");
    if (marker === 0xc4) {
      let q = start;
      while (q < end) {
        const tc = bytes[q]! >> 4, th = bytes[q]! & 15;
        if (tc !== 0 || th > 3 || q + 17 > end) fail("invalid Huffman table.");
        const counts = bytes.subarray(q + 1, q + 17);
        let total = 0; for (const c of counts) total += c;
        if (total > 256 || q + 17 + total > end) fail("Huffman table exceeds its segment.");
        tables[th] = buildTable(counts, bytes.slice(q + 17, q + 17 + total));
        q += 17 + total;
      }
    } else if (marker === 0xc3) {
      if (frame || size < 8) fail("unexpected frame header.");
      const precision = bytes[start]!, height = bytes[start + 1]! * 256 + bytes[start + 2]!, width = bytes[start + 3]! * 256 + bytes[start + 4]!, nf = bytes[start + 5]!;
      if (precision < 2 || precision > 16 || height < 1 || width < 1 || nf < 1 || nf > 4 || size !== 8 + 3 * nf) fail("unsupported frame header.");
      const ids: number[] = [];
      for (let i = 0; i < nf; i++) {
        const o = start + 6 + i * 3;
        if (bytes[o + 1] !== 0x11) fail("only 1x1 component sampling is supported.");
        if (ids.includes(bytes[o]!)) fail("duplicate component identifier.");
        ids.push(bytes[o]!);
      }
      if (width * height * nf > limits.maximumSamples) fail("frame exceeds the sample limit.");
      frame = { precision, height, width, ids };
    } else if (marker === 0xdd) {
      if (size !== 4) fail("invalid restart interval.");
      restartInterval = bytes[start]! * 256 + bytes[start + 1]!;
    } else if (marker === 0xda) {
      if (!frame) fail("scan before frame header.");
      const ns = bytes[start]!;
      if (ns !== frame.ids.length || size !== 6 + 2 * ns) fail("only one interleaved scan over all components is supported.");
      const selectors: HuffmanTable[] = [];
      for (let i = 0; i < ns; i++) {
        if (bytes[start + 1 + i * 2] !== frame.ids[i]) fail("scan component order differs from the frame.");
        const table = tables[bytes[start + 2 + i * 2]! >> 4];
        if (!table) fail("scan references an undefined Huffman table.");
        selectors.push(table);
      }
      const predictor = bytes[start + 1 + 2 * ns]!, se = bytes[start + 2 + 2 * ns]!, ah = bytes[start + 3 + 2 * ns]! >> 4, pt = bytes[start + 3 + 2 * ns]! & 15;
      if (predictor < 1 || predictor > 7 || se !== 0 || ah !== 0 || pt >= frame.precision) fail("unsupported scan parameters.");
      return decodeScan(bytes, end, frame, selectors, predictor, pt, restartInterval, limits.legacySixteenBitDifference === true);
    } else if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2 || (marker >= 0xc5 && marker <= 0xcf && marker !== 0xc8 && marker !== 0xcc) || marker === 0xde) {
      fail("only lossless Huffman SOF3 frames are supported.");
    } else if (marker < 0xc0 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      fail("unexpected marker.");
    }
    // APPn, COM, DQT and other non-frame segments are skipped by their declared length.
    p = end;
  }
}

function decodeScan(bytes: Uint8Array, start: number, frame: { precision: number; height: number; width: number; ids: number[] },
  selectors: readonly HuffmanTable[], predictor: number, pt: number, restartInterval: number, legacy: boolean): LosslessJpegImage {
  const { width, height, precision } = frame, nf = selectors.length, rowSamples = width * nf;
  if (restartInterval !== 0 && restartInterval % width !== 0) fail("restart interval must be a whole number of lines.");
  const out = new Uint16Array(width * height * nf), modulus = 65536, valueLimit = 1 << (precision - pt);
  let p = start, buffer = 0, bits = 0, padding = 0;
  const fill = (): void => {
    // Load one byte. 0xFF00 is a stuffed 0xFF. Any other marker ends the entropy-coded data; later reads return zero padding.
    let byte = 0;
    if (p < bytes.length && bytes[p] !== 0xff) byte = bytes[p++]!;
    else if (p + 1 < bytes.length && bytes[p] === 0xff && bytes[p + 1] === 0x00) { byte = 0xff; p += 2; }
    else if (++padding > 8) fail("entropy-coded data is truncated.");
    buffer = ((buffer << 8) | byte) >>> 0; bits += 8;
  };
  const readBits = (count: number): number => {
    while (bits < count) fill();
    bits -= count;
    return (buffer >>> bits) & ((1 << count) - 1);
  };
  const decodeCategory = (table: HuffmanTable): number => {
    let code = readBits(1), len = 1;
    while (code > table.maxCode[len]!) {
      if (++len > 16) fail("invalid Huffman code.");
      code = (code << 1) | readBits(1);
    }
    const value = table.values[table.valPtr[len]! + code - table.minCode[len]!];
    if (value === undefined || value > 16) fail("invalid difference category.");
    return value;
  };
  let linesSinceRestart = 0, restartIndex = 0;
  for (let y = 0; y < height; y++) {
    if (restartInterval && y > 0 && (y * width) % restartInterval === 0) {
      // Byte-align, then require RSTm with m = restart count mod 8 (T.81 F.1.2.3, H.1.2.1).
      bits = 0; buffer = 0; padding = 0;
      if (p + 1 >= bytes.length || bytes[p] !== 0xff || bytes[p + 1] !== (0xd0 | (restartIndex & 7))) fail("missing restart marker.");
      p += 2; restartIndex++; linesSinceRestart = 0;
    }
    const row = y * rowSamples, above = row - rowSamples;
    for (let x = 0; x < width; x++) for (let c = 0; c < nf; c++) {
      const i = row + x * nf + c;
      let prediction: number;
      if (linesSinceRestart === 0) prediction = x === 0 ? 1 << (precision - pt - 1) : out[i - nf]!;
      else if (x === 0) prediction = out[above + c]!;
      else {
        const ra = out[i - nf]!, rb = out[i - rowSamples]!, rc = out[i - rowSamples - nf]!;
        switch (predictor) {
          case 1: prediction = ra; break;
          case 2: prediction = rb; break;
          case 3: prediction = rc; break;
          case 4: prediction = ra + rb - rc; break;
          case 5: prediction = ra + ((rb - rc) >> 1); break;
          case 6: prediction = rb + ((ra - rc) >> 1); break;
          default: prediction = (ra + rb) >> 1;
        }
      }
      const category = decodeCategory(selectors[c]!);
      let difference = 0;
      if (category === 16) difference = legacy ? (readBits(16), 32768) : 32768;
      else if (category > 0) {
        const v = readBits(category);
        difference = v < (1 << (category - 1)) ? v - (1 << category) + 1 : v;
      }
      const value = (((prediction + difference) % modulus) + modulus) % modulus;
      if (value >= valueLimit) fail("reconstructed sample exceeds the declared precision.");
      out[i] = value;
    }
    linesSinceRestart++;
  }
  if (pt) for (let i = 0; i < out.length; i++) out[i] = out[i]! << pt;
  return { width, height, components: nf, precision, predictor, pointTransform: pt, samples: out };
}
