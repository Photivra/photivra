// SPDX-License-Identifier: Apache-2.0
/**
 * 2.9: a 1:1 Print JPEG coded in strips (`createPrintJpegStrip`, for separate workers) and joined (`composePrintJpegStrips`) has
 * the bytes `createPrintJpegTask` writes for the same plan and source pixels.
 */
import { describe, expect, it } from "vitest";
import { InvalidConfigurationError, composePrintJpegStrips, createPrintJpegTask, createPrintJpegStrip, type PrintJpegInput, type PrintJpegTile } from "../src/index.js";

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
async function whole(input: PrintJpegInput, src: Uint8Array, width: number): Promise<Uint8Array> {
  const task = createPrintJpegTask(input, {
    readTile: async (r): Promise<PrintJpegTile> => {
      const samples = new Uint8Array(r.width * r.height * 3);
      for (let y = 0; y < r.height; y++) samples.set(src.subarray(((r.y + y) * width + r.x) * 3, ((r.y + y) * width + r.x + r.width) * 3), y * r.width * 3);
      return { ...r, samples };
    },
    yieldControl: async (): Promise<void> => {}
  });
  await task.run();
  return task.takeOutput().bytes;
}
/** Crop rows [y, y + height) of the source, crop-wide. */
function rows(input: PrintJpegInput, src: Uint8Array, width: number, y: number, height: number): Uint8Array {
  const { x, width: w } = input.crop, out = new Uint8Array(w * height * 3);
  for (let r = 0; r < height; r++) out.set(src.subarray(((input.crop.y + y + r) * width + x) * 3, ((input.crop.y + y + r) * width + x + w) * 3), r * w * 3);
  return out;
}
function plan(width: number, height: number, crop: { x: number; y: number; width: number; height: number }, q: number, ppi?: number): PrintJpegInput {
  return { source: { captureId: "capture", imageStateId: "sdr", artifactId: "source", sha256: "b".repeat(64), width, height, encoding: "encoded-srgb-8-rgb" },
    crop, outputWidth: crop.width, outputHeight: crop.height, quantizationStep: q, maximumEncodedBytes: 8_000_000, maximumProviderReads: 1_000_000, ...(ppi === undefined ? {} : { pixelsPerInch: ppi }) };
}

describe("Print JPEG from strips (2.9)", () => {
  it("joins strips coded apart into the bytes of the whole task, for any split on block rows", async () => {
    const next = random(0x51);
    const cases: [number, number, number, number[]][] = [[61, 37, 1, [8, 16]], [300, 70, 2, [64]], [517, 203, 3, [8, 16, 40, 96]], [96, 8, 1, []], [33, 41, 2, [40]]];
    for (const [width, height, q, cuts] of cases) {
      const src = new Uint8Array(width * height * 3);
      for (let i = 0; i < src.length; i++) src[i] = i % 5 === 0 ? Math.floor(next() * 256) : (i * 29 + Math.floor(i / 113)) % 256;
      const crop = { x: 1, y: 2, width: width - 2, height: height - 3 }, input = plan(width, height, crop, q, width % 2 ? 300 : undefined);
      const expected = await whole(input, src, width);
      const bounds = [0, ...cuts.filter((c) => c < crop.height), crop.height];
      const strips = bounds.slice(1).map((end, i) => createPrintJpegStrip(input, { y: bounds[i]!, height: end - bounds[i]!, samples: rows(input, src, width, bounds[i]!, end - bounds[i]!) }));
      const output = composePrintJpegStrips(input, strips);
      expect(Buffer.from(output.bytes).equals(Buffer.from(expected)), `${width} × ${height}, cuts ${cuts.join(",")}`).toBe(true);
      expect(output.providerReads).toBe(0);
    }
  }, 120_000);

  it("refuses strips off block rows, out of order, incomplete or of another plan, and plans that resample", () => {
    const input = plan(40, 24, { x: 0, y: 0, width: 40, height: 24 }, 2), samples = (h: number): Uint8Array => new Uint8Array(40 * h * 3).fill(90);
    const a = createPrintJpegStrip(input, { y: 0, height: 8, samples: samples(8) }), b = createPrintJpegStrip(input, { y: 8, height: 16, samples: samples(16) });
    expect(() => createPrintJpegStrip(input, { y: 4, height: 8, samples: samples(8) })).toThrow(InvalidConfigurationError);
    expect(() => createPrintJpegStrip(input, { y: 0, height: 12, samples: samples(12) })).toThrow(InvalidConfigurationError);
    expect(() => createPrintJpegStrip(input, { y: 0, height: 8, samples: samples(7) })).toThrow(InvalidConfigurationError);
    expect(() => composePrintJpegStrips(input, [b, a])).toThrow(InvalidConfigurationError);
    expect(() => composePrintJpegStrips(input, [a])).toThrow(InvalidConfigurationError);
    expect(() => composePrintJpegStrips({ ...input, quantizationStep: 3 }, [a, b])).toThrow(InvalidConfigurationError);
    expect(() => composePrintJpegStrips(input, [])).toThrow(InvalidConfigurationError);
    expect(() => createPrintJpegStrip({ ...input, outputWidth: 20, outputHeight: 12 }, { y: 0, height: 8, samples: samples(8) })).toThrow(InvalidConfigurationError);
    expect(composePrintJpegStrips(input, [a, b]).bytes.length).toBeGreaterThan(0);
  });
});
