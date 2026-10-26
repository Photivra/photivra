// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { simulateCapture, type SimulateCaptureOptions } from "../src/index.js";
import { scaledTimeout } from "./helpers/test-timeout.js";

/*
 * #420: AHD development counts a pixel as saturated when any flagged or white-level native site lies within 3 sites of it
 * (a 7 × 7 square clipped to the raster). The facade now finds those sites from a row-dilated mask and steps along each
 * output row; this test recomputes the count by brute force from the capture's own RAW and plan, on frames where some
 * pixels clip and others do not, where none clip and where all clip.
 */
const REACH = 3;

function bruteForceSaturatedPixels(result: Awaited<ReturnType<typeof simulateCapture>>): number {
  const raw = result.raw, geometry = result.plan.exposure.resolvedGeometry;
  const native = result.plan.exposure.geometry.nativeRaster, W = native.pixelWidth, H = native.pixelHeight;
  const active = geometry.activeCapture.nativeRect, crop = geometry.output.cropRect;
  const saturated = (x: number, y: number): boolean => {
    const i = y * W + x;
    return raw.saturationFlags[i] !== 0 || raw.codes[i]! >= raw.effectiveSaturationCodes[(y % 2) * 2 + (x % 2)]!;
  };
  let count = 0;
  for (let y = 0; y < result.image.height; y++) for (let x = 0; x < result.image.width; x++) {
    const px = active.x + crop.x + x, py = active.y + crop.y + y;
    let clipped = false;
    for (let dy = -REACH; dy <= REACH && !clipped; dy++) for (let dx = -REACH; dx <= REACH && !clipped; dx++) {
      const sx = px + dx, sy = py + dy;
      clipped = sx >= 0 && sy >= 0 && sx < W && sy < H && saturated(sx, sy);
    }
    if (clipped) count++;
  }
  return count;
}

describe("AHD saturated-pixel count (#420)", () => {
  it("equals the 7 × 7 brute-force count from the RAW, for partly, never and fully clipped frames", async () => {
    const total = 96 * 64;
    const seen = { partial: 0, none: 0, all: 0 };
    for (const preset of ["siemens-star", "dead-leaves"] as const) for (const shutterSeconds of [1 / 125, 1 / 30, 1 / 4]) {
      const options = { scene: { preset }, exposure: { mode: "manual", iso: 100, shutterSeconds }, output: { width: 96, height: 64, demosaic: "ahd" } } as SimulateCaptureOptions;
      const result = await simulateCapture(options);
      const count = result.diagnostics.highlight.saturatedPixelCount;
      expect(count).toBe(bruteForceSaturatedPixels(result));
      if (count === 0) seen.none++; else if (count === total) seen.all++; else seen.partial++;
    }
    // The cases must cover all three regimes, or the test checks less than it says.
    expect(seen.partial).toBeGreaterThan(0);
    expect(seen.none).toBeGreaterThan(0);
    expect(seen.all).toBeGreaterThan(0);
  }, scaledTimeout(120_000));
});
