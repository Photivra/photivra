// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from "vitest";
import { createExportJpegEncoder } from "../src/capture/export-jpeg.js";
import { createReferenceExportJpegEncoderV2 } from "./helpers/reference-export-jpeg-v2.js";

type EncoderOptions = Parameters<typeof createExportJpegEncoder>[0];
type Outcome = { bytes: string } | { error: string };

/** Fixed-seed mulberry32; the corpus is deterministic. */
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
const patterns = ["uniform", "gradient", "constant", "extremes", "spikes", "smooth-noise"] as const;
function block(next: () => number, pattern: typeof patterns[number], bx: number, by: number): number[] {
  const out: number[] = [], base = Math.floor(next() * 256), amplitude = Math.floor(next() * 48);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) for (let c = 0; c < 3; c++) {
    let v: number;
    switch (pattern) {
      case "uniform": v = Math.floor(next() * 256); break;
      case "gradient": v = ((bx * 8 + x) * 7 + (by * 8 + y) * 3 + c * 40) % 256; break;
      case "constant": v = base; break;
      case "extremes": v = ((x + y + c) & 1) === 0 ? 0 : 255; break;
      case "spikes": v = next() < .05 ? 255 : base; break;
      default: v = base + Math.floor((next() - .5) * amplitude) + x * 2 - y;
    }
    out.push(Math.min(255, Math.max(0, v)));
  }
  return out;
}
function run(factory: typeof createExportJpegEncoder, options: EncoderOptions, blocks: readonly (readonly number[])[]): Outcome {
  try {
    const encoder = factory(options);
    for (const b of blocks) encoder.writeRgbBlock(b);
    return { bytes: Buffer.from(encoder.finish()).toString("base64") };
  } catch (error) {
    return { error: `${(error as Error).name}: ${(error as Error).message}` };
  }
}

describe("export JPEG byte identity with the straightforward version-2 reference encoder", () => {
  it("emits identical bytes for a randomized corpus of sizes, quantization steps, patterns and metadata", () => {
    const next = random(0x275);
    let encoded = 0, rejected = 0;
    for (let n = 0; n < 160; n++) {
      const width = 1 + Math.floor(next() * 72), height = 1 + Math.floor(next() * 72);
      const quantizationStep = [1, 2, 3, 255][n % 8] ?? 1 + Math.floor(next() * 255);
      const pattern = patterns[n % patterns.length]!;
      const options: EncoderOptions = { width, height, quantizationStep, maximumOutputBytes: 1_000_000,
        exif: Uint8Array.from({ length: n % 5 }, (_, i) => i * 31), xmp: new TextEncoder().encode(n % 3 ? "" : "<x:corpus/>"),
        ...(n % 4 === 0 ? { icc: Uint8Array.from({ length: 64 }, (_, i) => (i * 13 + n) % 256) } : {}),
        ...(n % 6 === 0 ? { densityDotsPerInch: 1 + n * 7 } : {}) };
      const blocks: number[][] = [];
      for (let by = 0; by < Math.ceil(height / 8); by++) for (let bx = 0; bx < Math.ceil(width / 8); bx++) blocks.push(block(next, pattern, bx, by));
      const expected = run(createReferenceExportJpegEncoderV2, options, blocks);
      expect(run(createExportJpegEncoder, options, blocks)).toEqual(expected);
      if ("bytes" in expected) encoded++; else rejected++;
    }
    // The corpus must mostly exercise real encodes, while also covering identical rejection behavior.
    expect(encoded).toBeGreaterThan(140);
    expect(encoded + rejected).toBe(160);
  }, 60_000);

  it.each([1, 2, 3, 4, 7, 12, 16, 25, 50, 99, 128, 255])("emits identical bytes for 1,024 random photographic-like blocks at q=%i", (quantizationStep) => {
    const next = random(quantizationStep * 7919);
    const blocks = Array.from({ length: 1024 }, (_, i) => block(next, i % 3 === 0 ? "uniform" : "smooth-noise", i % 32, Math.floor(i / 32)));
    const options: EncoderOptions = { width: 256, height: 256, quantizationStep, maximumOutputBytes: 4_000_000, exif: new Uint8Array(), xmp: new Uint8Array() };
    const expected = run(createReferenceExportJpegEncoderV2, options, blocks);
    expect("bytes" in expected).toBe(true);
    expect(run(createExportJpegEncoder, options, blocks)).toEqual(expected);
  }, 60_000);

  it("matches legacy rejection of invalid blocks, overflowing budgets and incomplete or disposed encodes", () => {
    const base: EncoderOptions = { width: 16, height: 8, quantizationStep: 1, maximumOutputBytes: 1_000_000, exif: new Uint8Array(), xmp: new Uint8Array() };
    const good = Array<number>(192).fill(17), noisy = block(random(9), "uniform", 0, 0);
    const cases: [EncoderOptions, number[][]][] = [
      [base, [good]], [base, [good, good, good]], [base, [[...good.slice(0, 191), 256]]], [base, [[...good.slice(0, 191), 1.5]]],
      [base, [good.slice(0, 191)]], [{ ...base, maximumOutputBytes: 700 }, [noisy, noisy]], [{ ...base, width: 8 }, [[...good.slice(0, 191), -1]]]
    ];
    for (const [options, blocks] of cases) {
      const expected = run(createReferenceExportJpegEncoderV2, options, blocks);
      expect("error" in expected).toBe(true);
      expect(run(createExportJpegEncoder, options, blocks)).toEqual(expected);
    }
  });
});
