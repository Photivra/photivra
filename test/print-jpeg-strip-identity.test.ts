// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from "vitest";
import { createPrintJpegTask, type PrintJpegInput, type PrintJpegProvider, type PrintJpegTile } from "../src/index.js";
import { createLegacyPrintJpegTask } from "./helpers/legacy-print-jpeg.js";

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
/** Entropy-coded scan from the SOS segment onward; equal scans mean equal 8-bit blocks were encoded. */
function scan(bytes: Uint8Array): Uint8Array {
  let p = 2;
  while (bytes[p + 1] !== 218) p += 2 + bytes[p + 2]! * 256 + bytes[p + 3]!;
  return bytes.slice(p);
}
function provider(src: Uint8Array, width: number, requests: { x: number; y: number; width: number; height: number }[]): PrintJpegProvider {
  return {
    readTile: async (r): Promise<PrintJpegTile> => {
      requests.push({ x: r.x, y: r.y, width: r.width, height: r.height });
      const samples = new Uint8Array(r.width * r.height * 3);
      for (let y = 0; y < r.height; y++) samples.set(src.subarray(((r.y + y) * width + r.x) * 3, ((r.y + y) * width + r.x + r.width) * 3), y * r.width * 3);
      return { ...r, samples };
    },
    yieldControl: async (): Promise<void> => {}
  };
}
async function encode(factory: (input: PrintJpegInput, provider: PrintJpegProvider) => { run(): Promise<void>; takeOutput(): { bytes: Uint8Array } }, input: PrintJpegInput, src: Uint8Array, width: number): Promise<{ bytes: Uint8Array; requests: { x: number; y: number; width: number; height: number }[] }> {
  const requests: { x: number; y: number; width: number; height: number }[] = [];
  const task = factory(input, provider(src, width, requests));
  await task.run();
  return { bytes: task.takeOutput().bytes, requests };
}

describe("Print JPEG strip reads and sRGB decode table", () => {
  it("encode the same 8-bit blocks as the frozen per-block reader across crops and fractional downsampling", async () => {
    const next = random(0x2000);
    const cases: [number, number, number][] = [[61, 37, 1], [300, 70, 1], [700, 300, 1], [1100, 90, 37.5], [530, 410, 5.3], [257, 33, 1.01], [999, 499, 3], [2100, 40, 40]];
    for (const [width, height, scale] of cases) {
      const src = new Uint8Array(width * height * 3);
      for (let i = 0; i < src.length; i++) src[i] = i % 7 === 0 ? Math.floor(next() * 256) : (i * 37 + Math.floor(i / 97)) % 256;
      const cropX = Math.floor(next() * 3), cropY = Math.floor(next() * 3), cropWidth = width - cropX - Math.floor(next() * 3), cropHeight = height - cropY - Math.floor(next() * 3);
      const outputWidth = Math.max(1, Math.floor(cropWidth / scale)), outputHeight = Math.max(1, Math.round(outputWidth * cropHeight / cropWidth));
      const input: PrintJpegInput = { source: { captureId: "capture", imageStateId: "sdr", artifactId: "source", sha256: "a".repeat(64), width, height, encoding: "encoded-srgb-8-rgb" },
        crop: { x: cropX, y: cropY, width: cropWidth, height: cropHeight }, outputWidth, outputHeight, quantizationStep: 1 + Math.floor(next() * 4),
        maximumEncodedBytes: 8_000_000, maximumProviderReads: 1_000_000 };
      const legacy = await encode(createLegacyPrintJpegTask, input, src, width);
      const current = await encode(createPrintJpegTask, input, src, width);
      expect(Buffer.from(scan(current.bytes)).equals(Buffer.from(scan(legacy.bytes)))).toBe(true);
      // Each crop pixel is requested exactly once, in crop-aligned tiles of at most 256 x 32.
      expect(current.requests.length).toBe(Math.ceil(cropHeight / 32) * Math.ceil(cropWidth / 256));
      expect(current.requests.reduce((sum, r) => sum + r.width * r.height, 0)).toBe(cropWidth * cropHeight);
      for (const r of current.requests) {
        expect((r.x - cropX) % 256).toBe(0); expect((r.y - cropY) % 32).toBe(0);
        expect(r.width).toBeLessThanOrEqual(256); expect(r.height).toBeLessThanOrEqual(32);
      }
      expect(current.requests.length).toBeLessThanOrEqual(legacy.requests.length);
    }
  }, 120_000);
});
