// SPDX-License-Identifier: Apache-2.0

/**
 * Browser-safe reader for DNG and TIFF-EP CFA raw files. Independently written from the published
 * TIFF 6.0, TIFF/EP (ISO 12234-2) tag definitions and the Adobe Digital Negative (DNG) Specification
 * 1.7.1.0; no third-party reader source. It returns the stored raw codes plus the metadata that the
 * engine's RAW development path needs (CFA pattern, black/white levels, active area, default crop,
 * colour matrices, as-shot neutral, calibration illuminants, orientation). It never applies
 * linearization, black subtraction, white balance, demosaicing or colour transforms.
 *
 * Untrusted input: every offset, count, IFD chain, strip/tile table and decoded size is validated
 * against the buffer and explicit limits before allocation. IFD loops, aliasing IFDs, oversized
 * frames and over-long tag arrays fail with `InvalidConfigurationError`.
 * @see docs/IMPORT_AND_PNG.md for supported subsets and limits.
 */

import { InvalidConfigurationError } from "../core/configuration-error.js";
import { parseLosslessJpeg } from "./lossless-jpeg.js";

export const DNG_IMPORT_SCHEMA_VERSION = "1.0.0" as const;
/** Upper bound for `maximumPixels`; 200 MP of 16-bit codes is 400 MB. */
export const DNG_IMPORT_LIMITS = Object.freeze({ defaultMaximumPixels: 64_000_000, maximumPixels: 200_000_000, defaultMaximumIfds: 64, maximumIfds: 1024 });
export interface DngImportInput {
  bytes: Uint8Array;
  /** Pixel (width x height) cap checked before any decode allocation. Default 64 000 000, at most 200 000 000. */
  maximumPixels?: number;
  /** Total IFDs (main chain plus SubIFDs) visited. Default 64, at most 1024. */
  maximumIfds?: number;
}
/** Repeating CFA pattern; origin is the top-left corner of `activeArea` (DNG 1.7.1.0, PhotometricInterpretation). */
export interface ImportedDngCfa {
  repeatRows: number;
  repeatColumns: number;
  /** Row-major plane indices into `planeColors`, length repeatRows x repeatColumns. */
  pattern: number[];
  /** CFAPlaneColor: 0 red, 1 green, 2 blue, 3 cyan, 4 magenta, 5 yellow, 6 white. Default [0, 1, 2]. */
  planeColors: number[];
}
/** Zero-light level pattern (BlackLevel, BlackLevelRepeatDim, BlackLevelDeltaH/V); origin is the active-area top-left. */
export interface ImportedDngBlackLevel {
  repeatRows: number;
  repeatColumns: number;
  /** Row-column-sample order, length repeatRows x repeatColumns x samplesPerPixel. */
  values: number[];
  /** Per active-area column offset, or null when absent (all zeros). */
  deltaH: number[] | null;
  /** Per active-area row offset, or null when absent (all zeros). */
  deltaV: number[] | null;
}
/** Half-open raster rectangle in stored-image pixel coordinates (+X right, +Y down). */
export interface ImportedDngRect { x: number; y: number; width: number; height: number }
export interface ImportedDngRaw {
  schemaVersion: typeof DNG_IMPORT_SCHEMA_VERSION;
  byteOrder: "little-endian" | "big-endian";
  /** DNGVersion bytes, or null for a TIFF-EP file without DNG tags. */
  dngVersion: [number, number, number, number] | null;
  make: string | null;
  model: string | null;
  uniqueCameraModel: string | null;
  /** TIFF/Exif Orientation 1..8 (default 1). Codes are returned in stored, not oriented, order. */
  orientation: number;
  width: number;
  height: number;
  samplesPerPixel: number;
  bitsPerSample: number;
  compression: "uncompressed" | "lossless-jpeg";
  photometricInterpretation: "cfa" | "linear-raw";
  /** Stored raw codes, row-major then sample, length width x height x samplesPerPixel. */
  codes: Uint16Array;
  cfa: ImportedDngCfa | null;
  /** LinearizationTable when present; not applied to `codes`. */
  linearizationTable: Uint16Array | null;
  blackLevel: ImportedDngBlackLevel;
  /** WhiteLevel per sample (default 2^bitsPerSample − 1). */
  whiteLevel: number[];
  /** ActiveArea as a rectangle (default the whole image). */
  activeArea: ImportedDngRect;
  /** DefaultCropOrigin/Size relative to the active-area origin; may be fractional (RATIONAL). */
  defaultCrop: ImportedDngRect;
  /** XYZ → camera (reference) matrices, row-major colorPlanes x 3, or null. */
  colorMatrix1: number[] | null;
  colorMatrix2: number[] | null;
  /** CalibrationIlluminant1/2 (Exif LightSource code), or null when absent. */
  calibrationIlluminant1: number | null;
  calibrationIlluminant2: number | null;
  /** AsShotNeutral in camera (reference) coordinates, or null. */
  asShotNeutral: number[] | null;
  /** RawDataUniqueID as 32 lowercase hex digits, or null. */
  rawDataUniqueId: string | null;
}

const TYPE_SIZES = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8, 4] as const;
interface Entry { type: number; count: number; at: number }
type Ifd = Map<number, Entry>;
function fail(message: string): never { throw new InvalidConfigurationError("DNG import: " + message); }
function limit(value: number | undefined, fallback: number, max: number, name: string): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1 || value > max) fail(name + " must be an integer from 1 to " + max + ".");
  return value;
}

/**
 * Parse one DNG or TIFF-EP file and decode its primary CFA or LinearRaw image (the first IFD with
 * NewSubFileType 0 and PhotometricInterpretation 32803 or 34892, in IFD-chain then SubIFD order).
 *
 * Supported raw data: Compression 1 at 8..16 bits/sample (8 bits as bytes, 16 bits in the file byte
 * order, other depths packed MSB-first with byte-aligned rows, per DNG BitsPerSample) and Compression 7
 * lossless Huffman JPEG (T.81 Annex H) in strips or tiles, chunky planar configuration only.
 * @returns Owned typed arrays and plain metadata; nothing is applied to the codes.
 */
export function parseDngRawImage(input: DngImportInput): ImportedDngRaw {
  if (input === null || typeof input !== "object") fail("input must be an object.");
  for (const key of Object.keys(input)) if (!["bytes", "maximumPixels", "maximumIfds"].includes(key)) fail("unknown input field.");
  const bytes = input.bytes;
  if (!(bytes instanceof Uint8Array)) fail("bytes must be a Uint8Array.");
  const maximumPixels = limit(input.maximumPixels, DNG_IMPORT_LIMITS.defaultMaximumPixels, DNG_IMPORT_LIMITS.maximumPixels, "maximumPixels");
  const maximumIfds = limit(input.maximumIfds, DNG_IMPORT_LIMITS.defaultMaximumIfds, DNG_IMPORT_LIMITS.maximumIfds, "maximumIfds");
  const n = bytes.length, view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (n < 8) fail("file is too short.");
  const little = bytes[0] === 0x49 && bytes[1] === 0x49;
  if (!little && !(bytes[0] === 0x4d && bytes[1] === 0x4d)) fail("missing TIFF byte-order mark.");
  const u16 = (o: number): number => view.getUint16(o, little), u32 = (o: number): number => view.getUint32(o, little);
  if (u16(2) === 43) fail("BigTIFF is not supported.");
  if (u16(2) !== 42) fail("missing TIFF magic number.");

  const visited = new Set<number>(), ifds: Ifd[] = [];
  const readIfd = (offset: number): { ifd: Ifd; next: number } => {
    if (offset < 8 || offset % 2 !== 0 || offset + 2 > n) fail("IFD offset out of range.");
    if (visited.has(offset)) fail("IFD loop or aliased IFD.");
    if (visited.size >= maximumIfds) fail("too many IFDs.");
    visited.add(offset);
    const count = u16(offset), end = offset + 2 + count * 12;
    if (count === 0 || end + 4 > n) fail("IFD exceeds the file.");
    const ifd: Ifd = new Map();
    for (let i = 0; i < count; i++) {
      const p = offset + 2 + i * 12, id = u16(p), type = u16(p + 2), c = u32(p + 4);
      if (ifd.has(id)) fail("duplicate tag in one IFD.");
      if (type < 1 || type > 13) continue; // TIFF 6.0: readers skip fields of unknown type.
      const size = TYPE_SIZES[type]! * c, at = size <= 4 ? p + 8 : u32(p + 8);
      if (at + size > n) fail("tag value exceeds the file.");
      ifd.set(id, { type, count: c, at });
    }
    return { ifd, next: u32(end) };
  };
  const walk = (offset: number, depth: number): void => {
    for (let next = offset; next !== 0;) {
      const { ifd, next: following } = readIfd(next);
      ifds.push(ifd);
      const sub = ifd.get(330);
      if (sub) {
        if (depth >= 3) fail("SubIFD nesting is too deep.");
        if ((sub.type !== 4 && sub.type !== 13) || sub.count > maximumIfds) fail("invalid SubIFDs tag.");
        for (let i = 0; i < sub.count; i++) walk(u32(sub.at + i * 4), depth + 1);
      }
      next = following;
    }
  };
  walk(u32(4), 0);

  const numbers = (entry: Entry | undefined, maximumCount: number): number[] | null => {
    if (!entry) return null;
    if (entry.count > maximumCount) fail("tag count exceeds its expected size.");
    const out: number[] = [], { type, at } = entry;
    for (let i = 0; i < entry.count; i++) {
      switch (type) {
        case 1: case 7: out.push(bytes[at + i]!); break;
        case 6: out.push(view.getInt8(at + i)); break;
        case 3: out.push(u16(at + i * 2)); break;
        case 8: out.push(view.getInt16(at + i * 2, little)); break;
        case 4: case 13: out.push(u32(at + i * 4)); break;
        case 9: out.push(view.getInt32(at + i * 4, little)); break;
        case 5: case 10: {
          const num = type === 5 ? u32(at + i * 8) : view.getInt32(at + i * 8, little), den = type === 5 ? u32(at + i * 8 + 4) : view.getInt32(at + i * 8 + 4, little);
          if (den === 0) fail("rational with zero denominator.");
          out.push(num / den); break;
        }
        case 11: out.push(view.getFloat32(at + i * 4, little)); break;
        case 12: out.push(view.getFloat64(at + i * 8, little)); break;
        default: fail("unsupported tag type.");
      }
      if (!Number.isFinite(out[i])) fail("non-finite tag value.");
    }
    return out;
  };
  const integers = (entry: Entry | undefined, maximumCount: number, types: readonly number[]): number[] | null => {
    if (entry && !types.includes(entry.type)) fail("tag has an unsupported field type.");
    return numbers(entry, maximumCount);
  };
  const ascii = (entry: Entry | undefined): string | null => {
    if (!entry) return null;
    if (entry.type !== 2 || entry.count > 4096) fail("invalid ASCII tag.");
    let s = "";
    for (let i = 0; i < entry.count && bytes[entry.at + i] !== 0; i++) s += String.fromCharCode(bytes[entry.at + i]!);
    return s;
  };
  const one = (ifd: Ifd, id: number, fallback: number): number => {
    const v = integers(ifd.get(id), 1, [3, 4]);
    return v ? v[0]! : fallback;
  };

  const raw = ifds.find((ifd) => one(ifd, 254, 0) === 0 && [32803, 34892].includes(one(ifd, 262, -1)));
  if (!raw) fail("no primary CFA or LinearRaw image IFD.");
  const ifd0 = ifds[0]!;
  // DNG places camera-level tags in IFD 0; TIFF-EP files may carry them only in the raw IFD.
  const pick = (id: number): Entry | undefined => ifd0.get(id) ?? raw.get(id);

  const width = one(raw, 256, 0), height = one(raw, 257, 0), spp = one(raw, 277, 1), compressionCode = one(raw, 259, 1), photometric = one(raw, 262, 0);
  if (width < 1 || height < 1 || width > 65535 * 4 || height > 65535 * 4) fail("invalid image dimensions.");
  if (width * height > maximumPixels) fail("image exceeds the pixel limit.");
  const cfaImage = photometric === 32803;
  if (cfaImage ? spp !== 1 : spp < 1 || spp > 4) fail("unsupported SamplesPerPixel.");
  if (spp > 1 && one(raw, 284, 1) !== 1) fail("only chunky PlanarConfiguration is supported.");
  const bps = integers(raw.get(258), spp, [3]) ?? [1];
  if (bps.length !== spp || bps.some((b) => b !== bps[0])) fail("BitsPerSample must be equal for every sample.");
  const bitsPerSample = bps[0]!;
  if (bitsPerSample < 8 || bitsPerSample > 16) fail("only 8 to 16 bits per sample are supported.");
  if (one(raw, 339, 1) !== 1) fail("only unsigned integer samples are supported.");
  if (compressionCode !== 1 && compressionCode !== 7) fail("only uncompressed and lossless JPEG raw data are supported.");
  const dngVersionTag = integers(ifd0.get(50706), 4, [1]);
  const dngVersion = dngVersionTag && dngVersionTag.length === 4 ? dngVersionTag as [number, number, number, number] : null;
  if (dngVersionTag && !dngVersion) fail("invalid DNGVersion.");

  // Strip or tile layout.
  const tiled = raw.has(322) || raw.has(324);
  const tileWidth = tiled ? one(raw, 322, 0) : width, tileLength = tiled ? one(raw, 323, 0) : Math.min(height, one(raw, 278, 0xffffffff));
  if (tileWidth < 1 || tileLength < 1 || tileWidth > 65535 * 4 || tileLength > 65535 * 4 || (tiled && tileWidth * tileLength > maximumPixels)) fail("invalid strip or tile size.");
  const across = Math.ceil(width / tileWidth), down = Math.ceil(height / tileLength), chunks = across * down;
  const offsets = integers(raw.get(tiled ? 324 : 273), chunks, [3, 4]), counts = integers(raw.get(tiled ? 325 : 279), chunks, [3, 4]);
  if (!offsets || !counts || offsets.length !== chunks || counts.length !== chunks) fail("strip or tile tables do not match the image layout.");
  for (let i = 0; i < chunks; i++) if (offsets[i]! + counts[i]! > n) fail("strip or tile data exceeds the file.");

  const codes = new Uint16Array(width * height * spp), maxCode = 2 ** bitsPerSample - 1;
  for (let ty = 0; ty < down; ty++) for (let tx = 0; tx < across; tx++) {
    const index = ty * across + tx, start = offsets[index]!, data = bytes.subarray(start, start + counts[index]!);
    // Strips cover whole rows (the last may be short); tiles are always full-size and clipped on copy.
    const chunkWidth = tiled ? tileWidth : width, chunkRows = tiled ? tileLength : Math.min(tileLength, height - ty * tileLength);
    const chunkSamples = chunkWidth * chunkRows * spp, x0 = tx * tileWidth, y0 = ty * tileLength;
    let samples: Uint16Array;
    if (compressionCode === 7) {
      const image = parseLosslessJpeg(data, { maximumSamples: chunkSamples, legacySixteenBitDifference: dngVersion !== null && (dngVersion[0] < 1 || (dngVersion[0] === 1 && dngVersion[1] < 1)) });
      if (image.width * image.height * image.components !== chunkSamples) fail("lossless JPEG sample count does not match the strip or tile.");
      samples = image.samples;
    } else samples = unpack(data, chunkWidth * spp, chunkRows, bitsPerSample, little);
    for (let y = 0; y < chunkRows && y0 + y < height; y++) {
      const columns = Math.min(chunkWidth, width - x0) * spp, from = y * chunkWidth * spp, to = ((y0 + y) * width + x0) * spp;
      for (let i = 0; i < columns; i++) {
        const v = samples[from + i]!;
        if (v > maxCode) fail("raw code exceeds BitsPerSample.");
        codes[to + i] = v;
      }
    }
  }

  // CFA description.
  let cfa: ImportedDngCfa | null = null, colorPlanes = spp;
  if (cfaImage) {
    const dim = integers(raw.get(33421), 2, [3]), pattern = integers(raw.get(33422), 256, [1]);
    if (!dim || dim.length !== 2 || dim[0]! < 1 || dim[1]! < 1 || !pattern || pattern.length !== dim[0]! * dim[1]!) fail("CFA images require CFARepeatPatternDim and a matching CFAPattern.");
    const planeColors = integers(raw.get(50710), 16, [1]) ?? [0, 1, 2];
    if (planeColors.length < 1 || planeColors.some((c) => c > 6) || new Set(planeColors).size !== planeColors.length) fail("invalid CFAPlaneColor.");
    if (pattern.some((v) => v >= planeColors.length)) fail("CFAPattern references an undefined plane.");
    if (one(raw, 50711, 1) !== 1) fail("only rectangular CFALayout is supported.");
    cfa = { repeatRows: dim[0]!, repeatColumns: dim[1]!, pattern, planeColors };
    colorPlanes = planeColors.length;
  }

  // Active area, levels and crop.
  const area = integers(raw.get(50829), 4, [3, 4]) ?? [0, 0, height, width];
  if (area.length !== 4 || area[0]! >= area[2]! || area[1]! >= area[3]! || area[2]! > height || area[3]! > width) fail("ActiveArea is outside the image.");
  const activeArea = { x: area[1]!, y: area[0]!, width: area[3]! - area[1]!, height: area[2]! - area[0]! };
  const repeat = integers(raw.get(50713), 2, [3]) ?? [1, 1];
  if (repeat.length !== 2 || repeat[0]! < 1 || repeat[1]! < 1 || repeat[0]! * repeat[1]! > 1024) fail("invalid BlackLevelRepeatDim.");
  const levelCount = repeat[0]! * repeat[1]! * spp;
  const black = integers(raw.get(50714), levelCount, [3, 4, 5]) ?? Array<number>(levelCount).fill(0);
  if (black.length !== levelCount) fail("BlackLevel count does not match BlackLevelRepeatDim.");
  const deltaH = integers(raw.get(50715), activeArea.width, [10]), deltaV = integers(raw.get(50716), activeArea.height, [10]);
  if ((deltaH && deltaH.length !== activeArea.width) || (deltaV && deltaV.length !== activeArea.height)) fail("BlackLevelDelta count does not match the ActiveArea.");
  const whiteLevel = integers(raw.get(50717), spp, [3, 4]) ?? Array<number>(spp).fill(maxCode);
  if (whiteLevel.length !== spp) fail("WhiteLevel count does not match SamplesPerPixel.");
  const origin = integers(raw.get(50719), 2, [3, 4, 5]) ?? [0, 0], size = integers(raw.get(50720), 2, [3, 4, 5]) ?? [width, height];
  if (origin.length !== 2 || size.length !== 2 || size[0]! <= 0 || size[1]! <= 0 || origin[0]! < 0 || origin[1]! < 0) fail("invalid default crop.");
  const linear = integers(raw.get(50712), 65536, [3]);

  const matrix = (id: number): number[] | null => {
    const m = integers(pick(id), colorPlanes * 3, [10]);
    if (m && m.length !== colorPlanes * 3) fail("ColorMatrix count does not match the colour planes.");
    return m;
  };
  const neutral = integers(pick(50728), colorPlanes, [3, 5]);
  if (neutral && (neutral.length !== colorPlanes || neutral.some((v) => v <= 0))) fail("invalid AsShotNeutral.");
  const illuminant = (id: number): number | null => { const v = integers(pick(id), 1, [3]); return v ? v[0]! : null; };
  const uniqueId = integers(pick(50781), 16, [1]);
  if (uniqueId && uniqueId.length !== 16) fail("RawDataUniqueID must have 16 bytes.");
  const orientation = one(ifd0.has(274) ? ifd0 : raw, 274, 1);
  if (orientation < 1 || orientation > 8) fail("invalid Orientation.");

  return {
    schemaVersion: DNG_IMPORT_SCHEMA_VERSION, byteOrder: little ? "little-endian" : "big-endian", dngVersion,
    make: ascii(pick(271)), model: ascii(pick(272)), uniqueCameraModel: ascii(pick(50708)), orientation,
    width, height, samplesPerPixel: spp, bitsPerSample, compression: compressionCode === 1 ? "uncompressed" : "lossless-jpeg",
    photometricInterpretation: cfaImage ? "cfa" : "linear-raw", codes, cfa,
    linearizationTable: linear ? Uint16Array.from(linear) : null,
    blackLevel: { repeatRows: repeat[0]!, repeatColumns: repeat[1]!, values: black, deltaH, deltaV },
    whiteLevel, activeArea, defaultCrop: { x: origin[0]!, y: origin[1]!, width: size[0]!, height: size[1]! },
    colorMatrix1: matrix(50721), colorMatrix2: matrix(50722),
    calibrationIlluminant1: illuminant(50778), calibrationIlluminant2: illuminant(50779), asShotNeutral: neutral,
    rawDataUniqueId: uniqueId ? uniqueId.map((b) => b.toString(16).padStart(2, "0")).join("") : null
  };
}

/** Unpack uncompressed rows: 8-bit bytes, 16-bit words in file byte order, other depths MSB-first with byte-aligned rows. */
function unpack(data: Uint8Array, rowSamples: number, rows: number, bits: number, little: boolean): Uint16Array {
  const rowBytes = Math.ceil(rowSamples * bits / 8), out = new Uint16Array(rowSamples * rows);
  if (data.length < rowBytes * rows) fail("uncompressed strip or tile is truncated.");
  for (let y = 0; y < rows; y++) {
    const base = y * rowBytes, o = y * rowSamples;
    if (bits === 8) for (let i = 0; i < rowSamples; i++) out[o + i] = data[base + i]!;
    else if (bits === 16) for (let i = 0; i < rowSamples; i++) {
      const a = data[base + i * 2]!, b = data[base + i * 2 + 1]!;
      out[o + i] = little ? a | (b << 8) : (a << 8) | b;
    } else {
      // MSB-first bit accumulator: at most bits + 7 <= 23 pending bits, well inside 32-bit integer range.
      let accumulator = 0, pending = 0, next = base;
      const mask = (1 << bits) - 1;
      for (let i = 0; i < rowSamples; i++) {
        while (pending < bits) { accumulator = ((accumulator << 8) | data[next++]!) & 0xffffff; pending += 8; }
        pending -= bits;
        out[o + i] = (accumulator >>> pending) & mask;
      }
    }
  }
  return out;
}
