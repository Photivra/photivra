// SPDX-License-Identifier: Apache-2.0

import { expect } from "vitest";
import type { NativeTaskProgress, ProcessingRgbImage, ProcessingTask, SensorColorSamplingProfile } from "../../src/index.js";

/** Runs a processing task to completion and checks the progress accounting. */
export async function runTask<T>(make: (provider: { yieldControl: () => Promise<void>; onProgress: (p: NativeTaskProgress) => void }) => ProcessingTask<T>): Promise<T> {
  let last: NativeTaskProgress | null = null, yields = 0;
  const task = make({ yieldControl: async () => { yields++; }, onProgress: (p) => { last = p; } });
  await task.run();
  expect(task.state).toBe("completed");
  expect(task.completedTileCount).toBe(task.totalTileCount);
  if (task.totalTileCount > 0) expect(last).toEqual({ completedTileCount: task.totalTileCount, totalTileCount: task.totalTileCount });
  expect(yields).toBeGreaterThan(0);
  return task.takeOutput();
}

export function rgbImage(width: number, height: number, f: (x: number, y: number, c: number) => number): ProcessingRgbImage {
  const data = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let c = 0; c < 3; c++) data[3 * (y * width + x) + c] = f(x, y, c);
  return { width, height, data };
}

/** Deterministic mulberry32 uniform stream. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function gaussian(random: () => number): number {
  return Math.sqrt(-2 * Math.log(random() + 1e-12)) * Math.cos(2 * Math.PI * random());
}

export function psnr(a: Float32Array, b: Float32Array, peak = 1, mask?: (i: number) => boolean): number {
  let s = 0, n = 0;
  for (let i = 0; i < a.length; i++) if (!mask || mask(i)) { s += (a[i]! - b[i]!) ** 2; n++; }
  return 10 * Math.log10(peak * peak / (s / n));
}

export const BAYER_EVIDENCE = [{ sourceOrigin: "photivra", sourceReference: "synthetic-processing-test", reuseStatus: "photivra-owned" }] as const;
export function bayerProfile(tile: readonly string[] = ["red", "green", "green", "blue"]): SensorColorSamplingProfile {
  return { schemaVersion: "0.1.0", profileId: "cfa", evidence: [...BAYER_EVIDENCE], coordinateSystem: "native-sensor-color-sampling-site-index",
    layout: { kind: "periodic-mosaic", repeatWidthSites: 2, repeatHeightSites: 2, siteChannelIds: [...tile], anchor: "native-sensor-top-left-site" } };
}
export const ROLES = { red: "red", green: "green", blue: "blue" } as const;

/** Samples an RGB image through an RGGB-style tile into a mosaic. */
export function mosaic(image: ProcessingRgbImage, tile: readonly string[] = ["red", "green", "green", "blue"]): Float32Array {
  const out = new Float32Array(image.width * image.height), index = { red: 0, green: 1, blue: 2 } as Record<string, number>;
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    out[y * image.width + x] = image.data[3 * (y * image.width + x) + index[tile[(y % 2) * 2 + (x % 2)]!]!]!;
  }
  return out;
}
