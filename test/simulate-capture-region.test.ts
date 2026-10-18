// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { InvalidConfigurationError, simulateCapture, type SimulateCaptureOptions, type SimulateCaptureResult } from "../src/index.js";

type Region = { x: number; y: number; width: number; height: number };
/** Renders `options` as tiles and stitches their samples into one whole-frame array. */
async function stitched(options: SimulateCaptureOptions, tiles: Region[]): Promise<{ samples: number[]; results: SimulateCaptureResult[] }> {
  const width = options.output!.width!, height = options.output!.height!, samples = new Array<number>(width * height * 3).fill(-1), results: SimulateCaptureResult[] = [];
  for (const region of tiles) {
    const r = await simulateCapture({ ...options, output: { ...options.output, region } });
    expect([r.image.width, r.image.height]).toEqual([region.width, region.height]);
    for (let y = 0; y < region.height; y++) for (let x = 0; x < region.width * 3; x++) samples[((region.y + y) * width + region.x) * 3 + x] = r.image.samples[y * region.width * 3 + x]!;
    results.push(r);
  }
  return { samples, results };
}
/** A grid of tiles with odd and even offsets and sizes. */
function grid(width: number, height: number, xs: number[], ys: number[]): Region[] {
  const out: Region[] = [], bx = [0, ...xs, width], by = [0, ...ys, height];
  for (let j = 0; j + 1 < by.length; j++) for (let i = 0; i + 1 < bx.length; i++) out.push({ x: bx[i]!, y: by[j]!, width: bx[i + 1]! - bx[i]!, height: by[j + 1]! - by[j]! });
  return out;
}

describe("output.region (2.3): tiles are byte-identical to the whole render", () => {
  const cases: [string, SimulateCaptureOptions][] = [
    ["default bilinear", { scene: { preset: "siemens-star", cycles: 12 }, output: { width: 21, height: 14 } }],
    ["AHD, PNG 16-bit", { scene: { preset: "slanted-edge" }, output: { width: 20, height: 15, demosaic: "ahd", format: "png", bitDepth: 16 } }],
    ["mirror borders", { scene: { preset: "checkerboard", squaresAcross: 6 }, output: { width: 18, height: 12, borderHandling: "mirror" } }],
    ["AHD with mirror borders", { scene: { preset: "zone-plate" }, output: { width: 18, height: 12, demosaic: "ahd", borderHandling: "mirror" } }],
    ["diffraction, anti-aliasing and box aperture", { scene: { preset: "point-grid" }, output: { width: 16, height: 12 }, lens: { diffraction: "circular-aperture" },
      sensor: { antiAliasing: { kind: "four-spot" }, pixelAperture: { kind: "box", samplesPerAxis: 2 } } }],
    ["rotation and rolling shutter (global row timing)", { scene: { preset: "slanted-edge" }, output: { width: 16, height: 12 },
      motion: { angularVelocityRadPerSec: { yaw: 0.05, pitch: 0.02 }, shutter: "rolling" }, sensor: { temporalSampleCount: 2 } }],
    ["fixed-size chart, wide gamut", { scene: { preset: "composite", elements: [{ scene: { preset: "fiducial" }, centerU: 0.1, centerV: 0, width: 0.8, height: 0.8 }] },
      chartSize: { widthM: 0.3 }, subjectDistanceM: 40, output: { width: 16, height: 12, format: "png", colorEncoding: "display-p3" } }]
  ];
  for (const [name, options] of cases) {
    it(name, async () => {
      const whole = await simulateCapture(options), { width, height } = options.output as { width: number; height: number };
      const { samples, results } = await stitched(options, grid(width, height, [5, 11], [3, 8]));
      expect(samples).toEqual(Array.from(whole.image.samples));
      const first = results[0]!;
      expect(first.region).toMatchObject({ x: 0, y: 0, width: 5, height: 3, frameWidth: width, frameHeight: height });
      expect(first.scene.sourceSha256).toBe(whole.scene.sourceSha256);
      expect(first.diagnostics.options).toContain("output.region");
      expect(first.diagnostics.providerEvaluationCount).toBeLessThan(whole.diagnostics.providerEvaluationCount);
    }, 120_000);
  }

  it("renders a 100 % crop of a larger frame and records the whole frame's request", async () => {
    const options: SimulateCaptureOptions = { scene: { preset: "slanted-edge" }, output: { width: 400, height: 300, region: { x: 190, y: 141, width: 9, height: 7 } } };
    const crop = await simulateCapture(options);
    expect(crop.request.environmentRaw.raw.exposure.geometry.nativeRaster).toEqual({ pixelWidth: 402, pixelHeight: 302 });
    expect(crop.region!.nativeRect).toEqual({ x: 190, y: 140, width: 11, height: 10 });
    expect(crop.plan.exposure.geometry.nativeRaster).toEqual({ pixelWidth: 11, pixelHeight: 10 });
    expect(crop.raw.codes.length).toBe(110);
    const strip = await simulateCapture({ ...options, output: { width: 400, height: 300, region: { x: 0, y: 141, width: 400, height: 7 } } });
    for (let y = 0; y < 7; y++) for (let x = 0; x < 27; x++) expect(crop.image.samples[y * 27 + x]).toBe(strip.image.samples[(y * 400 + 190) * 3 + x]);
  }, 120_000);

  it("validates the region and refuses auto white balance", async () => {
    const base = { scene: { preset: "uniform" as const }, output: { width: 8, height: 8 } };
    for (const region of [{ x: -1, y: 0, width: 2, height: 2 }, { x: 0, y: 0, width: 0, height: 2 }, { x: 4, y: 0, width: 5, height: 2 }, { x: 0, y: 0, width: 2, height: 2, z: 1 }, { x: 0.5, y: 0, width: 2, height: 2 }])
      await expect(simulateCapture({ ...base, output: { ...base.output, region } as never })).rejects.toThrow(InvalidConfigurationError);
    await expect(simulateCapture({ ...base, output: { ...base.output, whiteBalance: "auto", region: { x: 0, y: 0, width: 2, height: 2 } } })).rejects.toThrow("auto");
    const whole = await simulateCapture({ ...base, output: { ...base.output, region: { x: 0, y: 0, width: 8, height: 8 } } });
    expect(Array.from(whole.image.samples)).toEqual(Array.from((await simulateCapture(base)).image.samples));
  }, 60_000);
});
