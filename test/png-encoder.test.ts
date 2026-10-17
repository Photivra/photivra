// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from "vitest";
import { inflateSync, crc32 } from "node:zlib";
import { createHash } from "node:crypto";
import { serializePngImage, InvalidConfigurationError, createSrgbIccProfile, type PngEncodeInput } from "../src/index.js";
import { deflateZlib } from "../src/output/png-encoder.js";

/** Fixed-seed mulberry32. */
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
interface Chunk { type: string; data: Uint8Array }
/** Independent reader: Node's zlib for inflate and CRC, plus the PNG reconstruction filters written out here. */
function decode(bytes: Uint8Array): { chunks: Chunk[]; width: number; height: number; bitDepth: number; samples: number[] } {
  expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), chunks: Chunk[] = [];
  for (let p = 8; p < bytes.length;) {
    const length = view.getUint32(p), type = new TextDecoder().decode(bytes.subarray(p + 4, p + 8)), data = bytes.slice(p + 8, p + 8 + length);
    expect(view.getUint32(p + 8 + length)).toBe(crc32(bytes.subarray(p + 4, p + 8 + length)));
    chunks.push({ type, data }); p += 12 + length;
  }
  expect(chunks[0]!.type).toBe("IHDR"); expect(chunks.at(-1)!.type).toBe("IEND");
  const ihdr = new DataView(chunks[0]!.data.buffer), width = ihdr.getUint32(0), height = ihdr.getUint32(4), bitDepth = chunks[0]!.data[8]!;
  expect(Array.from(chunks[0]!.data.slice(9))).toEqual([2, 0, 0, 0]);
  const inflated = inflateSync(Buffer.concat(chunks.filter((c) => c.type === "IDAT").map((c) => c.data)));
  const bpp = bitDepth / 8 * 3, rowBytes = width * bpp, rows: Uint8Array[] = [];
  for (let y = 0; y < height; y++) {
    const type = inflated[y * (rowBytes + 1)]!, line = Uint8Array.from(inflated.subarray(y * (rowBytes + 1) + 1, (y + 1) * (rowBytes + 1))), up = rows[y - 1] ?? new Uint8Array(rowBytes);
    for (let i = 0; i < rowBytes; i++) {
      const a = i >= bpp ? line[i - bpp]! : 0, b = up[i]!, c = i >= bpp ? up[i - bpp]! : 0, p = a + b - c;
      const paeth = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c;
      line[i] = (line[i]! + [0, a, b, (a + b) >> 1, paeth][type]!) & 255;
    }
    rows.push(line);
  }
  const samples: number[] = [];
  for (const row of rows) for (let i = 0; i < rowBytes; i += bitDepth / 8) samples.push(bitDepth === 8 ? row[i]! : row[i]! * 256 + row[i + 1]!);
  return { chunks, width, height, bitDepth, samples };
}

describe("PNG encoder", () => {
  it("round-trips 8- and 16-bit RGB exactly for every filter and compression mode", () => {
    const next = random(0x9e6);
    for (const bitDepth of [8, 16] as const) for (const compression of ["stored", "fixed-huffman"] as const) for (const filter of ["none", "sub", "up", "average", "paeth", "adaptive"] as const) {
      const width = 1 + Math.floor(next() * 40), height = 1 + Math.floor(next() * 30), max = bitDepth === 8 ? 255 : 65535;
      const values = Array.from({ length: width * height * 3 }, (_, i) => next() < .3 ? Math.floor(next() * (max + 1)) : Math.floor(((i % (width * 3)) / (width * 3)) * max));
      const samples = bitDepth === 8 ? Uint8Array.from(values) : Uint16Array.from(values);
      const bytes = serializePngImage({ width, height, bitDepth, samples, colourEncoding: { kind: "cicp", primaries: "bt2020", transfer: "linear", fullRange: true }, compression, filter });
      const decoded = decode(bytes);
      expect(decoded).toMatchObject({ width, height, bitDepth }); expect(decoded.samples).toEqual(values);
      // Deterministic: identical input gives identical bytes.
      expect(serializePngImage({ width, height, bitDepth, samples, colourEncoding: { kind: "cicp", primaries: "bt2020", transfer: "linear", fullRange: true }, compression, filter })).toEqual(bytes);
    }
  }, 60_000);

  it("writes cICP, mDCV and cLLI with the PNG Third Edition layouts and example values", () => {
    const samples = new Uint16Array(4 * 4 * 3).fill(32768);
    const bytes = serializePngImage({ width: 4, height: 4, bitDepth: 16, samples, colourEncoding: { kind: "cicp", primaries: "bt2020", transfer: "linear", fullRange: true },
      masteringDisplay: { redXy: [.708, .292], greenXy: [.17, .797], blueXy: [.131, .046], whiteXy: [.3127, .329], maximumLuminanceCdPerSquareMeter: 4000, minimumLuminanceCdPerSquareMeter: .0005 },
      contentLightLevel: { maximumContentLightLevelCdPerSquareMeter: 1000, maximumFrameAverageLightLevelCdPerSquareMeter: 400 } });
    const { chunks } = decode(bytes), byType = new Map(chunks.map((c) => [c.type, c.data]));
    expect(chunks.map((c) => c.type)).toEqual(["IHDR", "cICP", "mDCV", "cLLI", "IDAT", "IEND"]);
    // BT.2020 primaries (9), linear transfer (8), RGB (0), full range (1). The PNG specification allows mDCV with SDR encodings too.
    expect(Array.from(byType.get("cICP")!)).toEqual([9, 8, 0, 1]);
    // Examples 5-8: BT.2020 primaries, D65 white, 4000 and 0.0005 cd/m².
    const m = new DataView(byType.get("mDCV")!.buffer);
    expect(Array.from({ length: 8 }, (_, i) => m.getUint16(i * 2))).toEqual([35400, 14600, 8500, 39850, 6550, 2300, 15635, 16450]);
    expect([m.getUint32(16), m.getUint32(20)]).toEqual([40000000, 5]);
    const l = new DataView(byType.get("cLLI")!.buffer); expect([l.getUint32(0), l.getUint32(4)]).toEqual([10000000, 4000000]);
    const code = (primaries: "bt709" | "display-p3" | "bt2020", transfer: "bt709" | "linear" | "srgb", fullRange: boolean): number[] =>
      Array.from(decode(serializePngImage({ width: 1, height: 1, bitDepth: 8, samples: new Uint8Array(3), colourEncoding: { kind: "cicp", primaries, transfer, fullRange } })).chunks[1]!.data);
    expect(code("bt2020", "bt709", true)).toEqual([9, 1, 0, 1]);
    // PQ (16) and HLG (18) are not offered in 2.0 (licence-on-request patent declarations; THIRD_PARTY.md).
    for (const transfer of ["pq", "hlg"]) expect(() => serializePngImage({ width: 1, height: 1, bitDepth: 8, samples: new Uint8Array(3),
      colourEncoding: { kind: "cicp", primaries: "bt2020", transfer: transfer as "linear", fullRange: true } })).toThrow(InvalidConfigurationError);
    expect(code("bt709", "bt709", false)).toEqual([1, 1, 0, 0]); // Example 3
    expect(code("display-p3", "srgb", true)).toEqual([12, 13, 0, 1]); // Example 4
    expect(code("bt709", "linear", true)).toEqual([1, 8, 0, 1]);
  }, 60_000);

  it("writes sRGB with the specified gAMA/cHRM values, or a zlib iCCP profile", () => {
    const sample = new Uint8Array(3);
    const srgb = decode(serializePngImage({ width: 1, height: 1, bitDepth: 8, samples: sample, colourEncoding: { kind: "srgb", renderingIntent: "relative-colorimetric" } })).chunks;
    expect(srgb.map((c) => c.type)).toEqual(["IHDR", "sRGB", "gAMA", "cHRM", "IDAT", "IEND"]);
    expect(Array.from(srgb[1]!.data)).toEqual([1]); expect(new DataView(srgb[2]!.data.buffer).getUint32(0)).toBe(45455);
    expect(Array.from({ length: 8 }, (_, i) => new DataView(srgb[3]!.data.buffer).getUint32(i * 4))).toEqual([31270, 32900, 64000, 33000, 30000, 60000, 15000, 6000]);
    const profile = createSrgbIccProfile();
    for (const compression of ["stored", "fixed-huffman"] as const) {
      const icc = decode(serializePngImage({ width: 1, height: 1, bitDepth: 8, samples: sample, colourEncoding: { kind: "icc", profileName: "Photivra sRGB", profile }, compression })).chunks[1]!;
      expect(icc.type).toBe("iCCP");
      const name = new TextDecoder("latin1").decode(icc.data.subarray(0, 13));
      expect(name).toBe("Photivra sRGB"); expect(Array.from(icc.data.subarray(13, 15))).toEqual([0, 0]);
      expect(new Uint8Array(inflateSync(icc.data.subarray(15)))).toEqual(profile);
    }
  }, 60_000);

  it("produces zlib streams that inflate to the input, including long runs, empty input and >64 KiB stored blocks", () => {
    const next = random(77);
    const inputs = [new Uint8Array(0), new Uint8Array(70_000).fill(7), Uint8Array.from({ length: 140_000 }, (_, i) => (i * 7 + (next() < .01 ? 1 : 0)) % 251), Uint8Array.from({ length: 5000 }, () => Math.floor(next() * 256))];
    for (const data of inputs) for (const mode of ["stored", "fixed-huffman"] as const) expect(inflateSync(deflateZlib(data, mode)).equals(Buffer.from(data.buffer, data.byteOffset, data.length))).toBe(true);
    expect(deflateZlib(new Uint8Array(70_000).fill(7), "fixed-huffman").length).toBeLessThan(1000);
  }, 60_000);

  it("keeps its output bytes: hash lock over every filter and compression mode (2.0.0 encoder speed-up)", () => {
    // Digest of the encoder before the precomputed-code / specialised-filter rewrite; any byte change fails here.
    const next = random(2026), all = createHash("sha256");
    for (const [width, height, bitDepth] of [[37, 23, 8], [29, 17, 16], [300, 4, 8], [1, 40, 16]] as const) {
      const max = bitDepth === 8 ? 255 : 65535, samples = bitDepth === 8 ? new Uint8Array(width * height * 3) : new Uint16Array(width * height * 3);
      for (let i = 0; i < samples.length; i++) samples[i] = next() < 0.3 ? Math.floor(next() * (max + 1)) : ((i % (width * 3)) * 97 + Math.floor(i / (width * 3)) * 13) % (max + 1);
      for (const filter of ["none", "sub", "up", "average", "paeth", "adaptive"] as const) for (const compression of ["stored", "fixed-huffman"] as const) {
        all.update(serializePngImage({ width, height, bitDepth, samples, colourEncoding: { kind: "srgb", renderingIntent: "perceptual" }, filter, compression }));
      }
    }
    const long = Uint8Array.from({ length: 200_000 }, (_, i) => (next() < 0.02 ? Math.floor(next() * 256) : (i * 7) % 251));
    all.update(deflateZlib(long, "fixed-huffman"));
    expect(all.digest("hex")).toBe("7c64b64255a3d2a9acec97e78f590379d13b0a496cf6b5a5d8c30c8ea15a0141");
  }, 60_000);

  it("rejects Object.prototype names as code points and unknown colour-encoding or metadata fields", () => {
    const base: PngEncodeInput = { width: 1, height: 1, bitDepth: 8, samples: new Uint8Array(3), colourEncoding: { kind: "srgb", renderingIntent: "perceptual" } };
    const cicp = { kind: "cicp", primaries: "bt709", transfer: "srgb", fullRange: true } as const;
    const bad: unknown[] = [
      { ...base, colourEncoding: { ...cicp, primaries: "constructor" } }, { ...base, colourEncoding: { ...cicp, transfer: "toString" } },
      { ...base, colourEncoding: { ...cicp, primaries: "__proto__" } }, { ...base, colourEncoding: { kind: "srgb", renderingIntent: "toString" } },
      { ...base, colourEncoding: { kind: "srgb", renderingIntent: "hasOwnProperty" } }, { ...base, colourEncoding: { kind: "toString" } },
      { ...base, colourEncoding: { ...cicp, extra: 1 } }, { ...base, colourEncoding: { kind: "srgb", renderingIntent: "perceptual", primaries: "bt709" } },
      { ...base, colourEncoding: { kind: "icc", profileName: "x", profile: createSrgbIccProfile(), renderingIntent: "perceptual" } },
      { ...base, colourEncoding: cicp, contentLightLevel: { maximumContentLightLevelCdPerSquareMeter: 100, maximumFrameAverageLightLevelCdPerSquareMeter: 50, extra: 1 } },
      { ...base, colourEncoding: cicp, masteringDisplay: { redXy: [.708, .292], greenXy: [.17, .797], blueXy: [.131, .046], whiteXy: [.3127, .329],
        maximumLuminanceCdPerSquareMeter: 1000, minimumLuminanceCdPerSquareMeter: .005, maxLuminance: 1 } }
    ];
    for (const input of bad) expect(() => serializePngImage(input as PngEncodeInput), JSON.stringify((input as PngEncodeInput).colourEncoding)).toThrow(InvalidConfigurationError);
    expect(() => serializePngImage({ ...base, colourEncoding: cicp })).not.toThrow();
  });

  it("rejects invalid shapes, values and metadata combinations", () => {
    const base: PngEncodeInput = { width: 2, height: 1, bitDepth: 8, samples: new Uint8Array(6), colourEncoding: { kind: "srgb", renderingIntent: "perceptual" } };
    const bad: unknown[] = [
      { ...base, width: 0 }, { ...base, width: 70000 }, { ...base, bitDepth: 12 }, { ...base, samples: new Uint8Array(5) }, { ...base, samples: new Uint16Array(6) },
      { ...base, bitDepth: 16 }, { ...base, compression: "zip" }, { ...base, filter: "best" }, { ...base, extra: 1 },
      { ...base, colourEncoding: { kind: "cicp", primaries: "p3", transfer: "srgb", fullRange: true } },
      { ...base, colourEncoding: { kind: "srgb", renderingIntent: "vivid" } },
      { ...base, colourEncoding: { kind: "icc", profileName: "", profile: createSrgbIccProfile() } },
      { ...base, colourEncoding: { kind: "icc", profileName: "x", profile: new Uint8Array(200) } },
      { ...base, contentLightLevel: { maximumContentLightLevelCdPerSquareMeter: 1000, maximumFrameAverageLightLevelCdPerSquareMeter: 400 } },
      { ...base, colourEncoding: { kind: "cicp", primaries: "bt2020", transfer: "linear", fullRange: true }, contentLightLevel: { maximumContentLightLevelCdPerSquareMeter: 100, maximumFrameAverageLightLevelCdPerSquareMeter: 400 } },
      { ...base, colourEncoding: { kind: "cicp", primaries: "bt2020", transfer: "linear", fullRange: true }, masteringDisplay: { redXy: [.7, .3], greenXy: [.2, .7], blueXy: [.1, .05], whiteXy: [.3127, .329], maximumLuminanceCdPerSquareMeter: 1, minimumLuminanceCdPerSquareMeter: 2 } },
      { ...base, colourEncoding: { kind: "cicp", primaries: "bt2020", transfer: "linear", fullRange: true }, masteringDisplay: { redXy: [2, .3], greenXy: [.2, .7], blueXy: [.1, .05], whiteXy: [.3127, .329], maximumLuminanceCdPerSquareMeter: 1000, minimumLuminanceCdPerSquareMeter: .01 } }
    ];
    for (const input of bad) expect(() => serializePngImage(input as PngEncodeInput)).toThrow(InvalidConfigurationError);
  }, 60_000);
});
