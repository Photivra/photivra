// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from "vitest";
import { parseDngRawImage, parseLosslessJpeg, createPhotographicExportPair, InvalidConfigurationError, type ImportedDngRaw } from "../src/index.js";
import { loadPhotographicExportInput } from "./helpers/photographic-export-fixture.js";
import { printDetailJpegInput } from "./helpers/print-detail-jpeg-fixture.js";
import { writeTiff, packBits, encodeLosslessJpeg, rationalPairs, type IfdSpec, type TagSpec } from "./helpers/dng-test-writer.js";

/** Fixed-seed mulberry32; every corpus here is deterministic. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Smooth image plus noise so lossless predictors see realistic small differences and occasional large ones. */
function image(next: () => number, count: number, bits: number): Uint16Array {
  const max = 2 ** bits - 1, out = new Uint16Array(count);
  for (let i = 0; i < count; i++) out[i] = next() < .02 ? Math.floor(next() * (max + 1)) : Math.max(0, Math.min(max, Math.floor((Math.sin(i / 37) * .4 + .5) * max + (next() - .5) * 64 * (bits - 7))));
  return out;
}
const SRATIONAL = 10, RATIONAL = 5;
function rawTags(width: number, height: number, bits: number, compression: number, extra: TagSpec[] = []): TagSpec[] {
  return [
    { id: 254, type: 4, values: [0] }, { id: 256, type: 4, values: [width] }, { id: 257, type: 4, values: [height] },
    { id: 258, type: 3, values: [bits] }, { id: 259, type: 3, values: [compression] }, { id: 262, type: 3, values: [32803] },
    { id: 277, type: 3, values: [1] }, { id: 33421, type: 3, values: [2, 2] }, { id: 33422, type: 1, values: [1, 0, 2, 1] }, ...extra
  ];
}
function mainTags(extra: TagSpec[] = []): TagSpec[] {
  return [
    { id: 271, type: 2, values: [...new TextEncoder().encode("Synthetic"), 0] }, { id: 274, type: 3, values: [6] },
    { id: 50706, type: 1, values: [1, 4, 0, 0] }, { id: 50721, type: SRATIONAL, values: rationalPairs([.8, -.2, -.1, -.3, 1.2, .1, 0, .1, .7]) },
    { id: 50728, type: RATIONAL, values: rationalPairs([.5, 1, .6]) }, { id: 50778, type: 3, values: [21] }, ...extra
  ];
}

describe("DNG import", () => {
  it("round-trips engine-exported DNGs to identical codes and metadata", async () => {
    for (const input of [loadPhotographicExportInput(), ...(["landscape", "portrait-clockwise"] as const).map((o) => printDetailJpegInput(o, 1))]) {
      const pair = await createPhotographicExportPair(input), frame = pair.source.value.rawFrame;
      const dng = parseDngRawImage({ bytes: pair.dng.bytes });
      expect(dng.width).toBe(frame.nativePixelWidth); expect(dng.height).toBe(frame.nativePixelHeight);
      expect(Array.from(dng.codes)).toEqual(frame.samples.map((s) => s.rawCode));
      expect(dng).toMatchObject({ byteOrder: "little-endian", dngVersion: [1, 1, 0, 0], make: "Photivra", model: "Photivra Virtual Camera",
        uniqueCameraModel: pair.uniqueCameraModel, bitsPerSample: 16, compression: "uncompressed", photometricInterpretation: "cfa", samplesPerPixel: 1,
        whiteLevel: [frame.samples[0]!.digitalSaturationCode], calibrationIlluminant1: 21, calibrationIlluminant2: null, linearizationTable: null });
      expect(dng.rawDataUniqueId).toBe(pair.rawDataUniqueId);
      // CFA pattern and black levels agree with every site's own channel and pedestal (origin = active-area top-left).
      const channels = ["red", "green", "blue"];
      for (const s of frame.samples) {
        const x = s.colorSamplingSite.x - dng.activeArea.x, y = s.colorSamplingSite.y - dng.activeArea.y;
        const phase = (((y % 2) + 2) % 2) * 2 + (((x % 2) + 2) % 2);
        expect(dng.cfa!.planeColors[dng.cfa!.pattern[phase]!]).toBe(channels.indexOf(s.channelId));
        expect(dng.blackLevel.values[phase]).toBeCloseTo(s.blackLevelCode, 9);
      }
      const active = frame.capture.resolvedGeometry.activeCapture.nativeRect;
      expect(dng.activeArea).toEqual({ x: active.x, y: active.y, width: active.width, height: active.height });
      expect(dng.colorMatrix1).toHaveLength(9); expect(dng.asShotNeutral).toHaveLength(3);
      expect(dng.orientation).toBe({ landscape: 1, "portrait-clockwise": 6, "landscape-inverted": 3, "portrait-counter-clockwise": 8 }[frame.capture.geometry.orientation]);
    }
  }, 60_000);

  it("decodes uncompressed 8, 10, 12, 14 and 16-bit strips and tiles in both byte orders", () => {
    const next = random(0xd09);
    for (const little of [true, false]) for (const bits of [8, 10, 12, 14, 16]) for (const tiled of [false, true]) {
      const width = 37, height = 23, codes = image(next, width * height, bits);
      let spec: IfdSpec;
      if (tiled) {
        const tw = 16, tl = 16, data: Uint8Array[] = [];
        for (let ty = 0; ty < Math.ceil(height / tl); ty++) for (let tx = 0; tx < Math.ceil(width / tw); tx++) {
          const tile = new Uint16Array(tw * tl);
          for (let y = 0; y < tl; y++) for (let x = 0; x < tw; x++) { const sx = tx * tw + x, sy = ty * tl + y; tile[y * tw + x] = sx < width && sy < height ? codes[sy * width + sx]! : 0; }
          data.push(packBits(tile, tw, bits, little));
        }
        spec = { tags: rawTags(width, height, bits, 1, [{ id: 322, type: 3, values: [tw] }, { id: 323, type: 3, values: [tl] }]), chunks: { offsetTag: 324, countTag: 325, data } };
      } else {
        const rows = 5, data: Uint8Array[] = [];
        for (let y = 0; y < height; y += rows) data.push(packBits(codes.subarray(y * width, Math.min(height, y + rows) * width), width, bits, little));
        spec = { tags: rawTags(width, height, bits, 1, [{ id: 278, type: 3, values: [rows] }]), chunks: { offsetTag: 273, countTag: 279, data } };
      }
      spec.tags.push(...mainTags());
      const dng = parseDngRawImage({ bytes: writeTiff(little, [spec]) });
      expect(dng.byteOrder).toBe(little ? "little-endian" : "big-endian");
      expect(dng.bitsPerSample).toBe(bits);
      expect(Array.from(dng.codes), `${little} ${bits} ${tiled}`).toEqual(Array.from(codes));
      expect(dng.whiteLevel).toEqual([2 ** bits - 1]);
      expect(dng.cfa).toEqual({ repeatRows: 2, repeatColumns: 2, pattern: [1, 0, 2, 1], planeColors: [0, 1, 2] });
      expect(dng.orientation).toBe(6); expect(dng.make).toBe("Synthetic");
      expect(dng.colorMatrix1!.map((v) => Math.round(v * 1e4) / 1e4)).toEqual([.8, -.2, -.1, -.3, 1.2, .1, 0, .1, .7]);
      expect(dng.asShotNeutral).toEqual([.5, 1, .6]); expect(dng.calibrationIlluminant1).toBe(21);
    }
  }, 60_000);

  it("decodes lossless JPEG tiles with every predictor, two-component packing, restarts and point transform", () => {
    const next = random(0x147);
    for (let predictor = 1; predictor <= 7; predictor++) for (const [bits, little] of [[12, true], [14, false], [16, true]] as const) {
      const width = 48, height = 20, tw = 32, tl = 16, codes = image(next, width * height, bits), data: Uint8Array[] = [];
      for (let ty = 0; ty < Math.ceil(height / tl); ty++) for (let tx = 0; tx < Math.ceil(width / tw); tx++) {
        const tile = new Uint16Array(tw * tl);
        for (let y = 0; y < tl; y++) for (let x = 0; x < tw; x++) { const sx = tx * tw + x, sy = ty * tl + y; tile[y * tw + x] = sx < width && sy < height ? codes[sy * width + sx]! : 0; }
        // DNG commonly codes CFA tiles as half-width, two-component frames so predictors work across like colours.
        data.push(encodeLosslessJpeg(tile, { width: tw / 2, height: tl, components: 2, precision: bits, predictor, restartInterval: predictor % 2 ? tw / 2 * 4 : 0 }));
      }
      const spec: IfdSpec = { tags: [...rawTags(width, height, bits, 7, [{ id: 322, type: 3, values: [tw] }, { id: 323, type: 3, values: [tl] }]), ...mainTags()], chunks: { offsetTag: 324, countTag: 325, data } };
      const dng = parseDngRawImage({ bytes: writeTiff(little, [spec]) });
      expect(dng.compression).toBe("lossless-jpeg");
      expect(Array.from(dng.codes)).toEqual(Array.from(codes));
    }
    // Point transform: decoded values are shifted back up by Pt.
    const values = Uint16Array.from({ length: 64 }, (_, i) => ((i * 97) % 1024) << 2);
    const decoded = parseLosslessJpeg(encodeLosslessJpeg(values, { width: 8, height: 8, components: 1, precision: 12, predictor: 4, pointTransform: 2 }), { maximumSamples: 64 });
    expect(Array.from(decoded.samples)).toEqual(Array.from(values));
    expect(decoded).toMatchObject({ width: 8, height: 8, components: 1, precision: 12, predictor: 4, pointTransform: 2 });
  }, 60_000);

  it("decodes a hand-computed lossless JPEG stream and the 16-bit difference special case", () => {
    // 2x2, P=8, predictor 1: first sample predicted 128; first line uses Ra; next line starts from Rb.
    // Samples 130, 129, 126, 0 -> differences +2, -1, -2, -126 relative to 128, 130, 128, 126.
    const decoded = parseLosslessJpeg(encodeLosslessJpeg([130, 129, 126, 0], { width: 2, height: 2, components: 1, precision: 8, predictor: 1 }), { maximumSamples: 4 });
    expect(Array.from(decoded.samples)).toEqual([130, 129, 126, 0]);
    // A difference of exactly -32768 (category 16) carries no extra bits, except in pre-1.1 DNG legacy streams.
    const extreme = [32768, 0, 65535, 32767];
    for (const legacy of [false, true]) {
      const bytes = encodeLosslessJpeg(extreme, { width: 2, height: 2, components: 1, precision: 16, predictor: 1, legacySixteenBitDifference: legacy });
      expect(Array.from(parseLosslessJpeg(bytes, { maximumSamples: 4, legacySixteenBitDifference: legacy }).samples)).toEqual(extreme);
    }
  }, 60_000);

  it("finds the raw image in a SubIFD behind a preview IFD0 and reads levels, crop and black-level repeat", () => {
    const width = 20, height = 12, codes = image(random(7), width * height, 14);
    const raw: IfdSpec = {
      tags: rawTags(width, height, 14, 1, [
        { id: 50713, type: 3, values: [2, 2] }, { id: 50714, type: RATIONAL, values: rationalPairs([512, 512.5, 511.25, 513]) },
        { id: 50715, type: SRATIONAL, values: rationalPairs(Array.from({ length: 16 }, (_, i) => i / 8)) },
        { id: 50717, type: 3, values: [15000] }, { id: 50719, type: RATIONAL, values: rationalPairs([1.5, 2]) }, { id: 50720, type: 4, values: [12, 6] },
        { id: 50829, type: 3, values: [2, 2, 10, 18] }, { id: 50712, type: 3, values: [0, 10, 40, 90] }, { id: 50710, type: 1, values: [0, 1, 2] }
      ]), chunks: { offsetTag: 273, countTag: 279, data: [packBits(codes, width, 14, false)] }
    };
    const preview: IfdSpec = { tags: [{ id: 254, type: 4, values: [1] }, { id: 256, type: 3, values: [2] }, { id: 257, type: 3, values: [2] }, { id: 262, type: 3, values: [2] }, ...mainTags()], subIfds: [raw] };
    const dng: ImportedDngRaw = parseDngRawImage({ bytes: writeTiff(false, [preview]) });
    expect(Array.from(dng.codes)).toEqual(Array.from(codes));
    expect(dng.activeArea).toEqual({ x: 2, y: 2, width: 16, height: 8 });
    expect(dng.defaultCrop).toEqual({ x: 1.5, y: 2, width: 12, height: 6 });
    expect(dng.blackLevel).toEqual({ repeatRows: 2, repeatColumns: 2, values: [512, 512.5, 511.25, 513], deltaH: Array.from({ length: 16 }, (_, i) => i / 8), deltaV: null });
    expect(dng.whiteLevel).toEqual([15000]); expect(Array.from(dng.linearizationTable!)).toEqual([0, 10, 40, 90]);
  }, 60_000);

  it("rejects malformed and hostile files with domain errors and bounded work (fixed-seed fuzz)", () => {
    const width = 16, height = 8, codes = image(random(3), width * height, 12);
    const valid = writeTiff(true, [{ tags: [...rawTags(width, height, 12, 7), ...mainTags()], chunks: { offsetTag: 273, countTag: 279, data: [encodeLosslessJpeg(codes, { width, height, components: 1, precision: 12, predictor: 6 })] } }]);
    expect(Array.from(parseDngRawImage({ bytes: valid }).codes)).toEqual(Array.from(codes));
    const reject = (bytes: Uint8Array, extra: Record<string, unknown> = {}): void => { expect(() => parseDngRawImage({ bytes, ...extra })).toThrow(InvalidConfigurationError); };
    reject(new Uint8Array(0)); reject(Uint8Array.of(73, 73, 43, 0, 8, 0, 0, 0)); reject(valid, { maximumPixels: 100 }); reject(valid, { maximumPixels: 1.5 }); reject(valid, { unknown: 1 });
    // IFD loop: point IFD0's next-IFD link back at itself.
    const loop = valid.slice(), view = new DataView(loop.buffer), ifd0 = view.getUint32(4, true), count = view.getUint16(ifd0, true);
    view.setUint32(ifd0 + 2 + count * 12, ifd0, true); reject(loop);
    // Decompression bomb: frame header claims 65535 x 65535 samples inside a tiny strip.
    const bomb = encodeLosslessJpeg(codes, { width, height, components: 1, precision: 12, predictor: 1 });
    const sof = bomb.findIndex((b, i) => b === 0xff && bomb[i + 1] === 0xc3);
    bomb.set([255, 255, 255, 255], sof + 5);
    expect(() => parseLosslessJpeg(bomb, { maximumSamples: width * height })).toThrow(InvalidConfigurationError);
    // Fixed-seed mutation fuzz: every outcome is a decoded image or an InvalidConfigurationError.
    const next = random(0xf022);
    let decodedCount = 0;
    for (let n = 0; n < 3000; n++) {
      const mutated = valid.slice(), edits = 1 + Math.floor(next() * 4);
      for (let e = 0; e < edits; e++) mutated[Math.floor(next() * mutated.length)] = Math.floor(next() * 256);
      const cut = next() < .1 ? mutated.subarray(0, Math.floor(next() * mutated.length)) : mutated;
      try { const dng = parseDngRawImage({ bytes: cut, maximumPixels: 4096 }); expect(dng.codes.length).toBeLessThanOrEqual(4096); decodedCount++; }
      catch (error) { expect(error).toBeInstanceOf(InvalidConfigurationError); }
    }
    expect(decodedCount).toBeGreaterThan(0);
  }, 60_000);
});
