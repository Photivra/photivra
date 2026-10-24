// SPDX-License-Identifier: Apache-2.0
/**
 * #387: a prepared display view renders the same results as separate simulateDisplayView calls, byte for byte (samples, view,
 * exposure, scene, diagnostics except timings, assumptions), for regions and whole views, concurrently, and cancels per render.
 */
import { describe, expect, it } from "vitest";
import { InvalidConfigurationError, prepareDisplayView, simulateDisplayView, type DisplayViewResult, type SimulateCaptureOptions, type SimulateDisplayViewOptions } from "../src/index.js";
import { scaledTimeout as testTimeout } from "./helpers/test-timeout.js";

/** The result without its timings, as plain data. */
function comparable(result: DisplayViewResult): unknown {
  const { timingsMs: _timings, ...diagnostics } = result.diagnostics;
  return { ...result, image: { ...result.image, samples: Array.from(result.image.samples) }, diagnostics };
}

const rings = (p: { u: number; v: number }): number => { const t = 20 * (p.u * p.u + p.v * p.v), f = t - Math.floor(t); return 0.1 + 0.6 * (f < 0.5 ? 2 * f : 2 - 2 * f); };
const REQUESTS: [string, SimulateCaptureOptions][] = [
  ["Speed, chart", { scene: { preset: "siemens-star" }, sensor: { pixelPitchMicrometers: 3, pixelAperture: { kind: "box", samplesPerAxis: 2 } }, output: { width: 96, height: 64 } }],
  ["Quality, chart", { scene: { preset: "dead-leaves" }, lens: { fNumber: 11, diffraction: "circular-aperture" }, sensor: { pixelPitchMicrometers: 2, antiAliasing: { kind: "four-spot" } },
    exposure: { iso: 1600, shutterSeconds: 1 / 1000 }, output: { width: 80, height: 60, demosaic: "ahd" } }],
  ["Speed, caller scene", { scene: { kind: "reflectance-function", sceneId: "rings", evaluate: rings }, illuminant: { kind: "planckian", temperatureKelvin: 3200 },
    output: { width: 72, height: 48, whiteBalance: { kelvin: 3200 } } }]
];

describe("prepared display view (#387)", () => {
  it.each(REQUESTS)("%s: regions and whole views equal separate calls", async (_, options) => {
    const prepared = await prepareDisplayView(options);
    const w = Math.round((options.output!.width as number) * 0.6), h = Math.round((options.output!.height as number) * 0.6);
    const views: SimulateDisplayViewOptions[] = [{ width: w, height: h }, { width: w, height: h, region: { x: 0, y: 0, width: 7, height: 5 } },
      { width: w, height: h, region: { x: w - 9, y: h - 4, width: 9, height: 4 }, format: "srgb-16" }, { width: 20, height: 13, samplesPerAxis: 4 }];
    for (const view of views) expect(comparable(await prepared.render(view))).toEqual(comparable(await simulateDisplayView(options, view)));
  }, testTimeout(120_000));

  it("renders concurrently without sharing state", async () => {
    const [, options] = REQUESTS[0]!, prepared = await prepareDisplayView(options);
    const regions = [0, 1, 2, 3].map((i) => ({ width: 48, height: 32, region: { x: (i % 2) * 24, y: Math.floor(i / 2) * 16, width: 24, height: 16 } }));
    const together = await Promise.all(regions.map((view) => prepared.render(view)));
    for (let i = 0; i < regions.length; i++) expect(comparable(together[i]!)).toEqual(comparable(await simulateDisplayView(options, regions[i]!)));
  }, testTimeout(60_000));

  it("raises request errors when preparing, view errors when rendering, and cancels one render", async () => {
    await expect(prepareDisplayView({ scene: { preset: "uniform" }, output: { width: 16, height: 16, region: { x: 0, y: 0, width: 4, height: 4 } } })).rejects.toThrow(InvalidConfigurationError);
    const prepared = await prepareDisplayView({ scene: { preset: "uniform" }, output: { width: 16, height: 16 } });
    await expect(prepared.render({ width: 17, height: 4 })).rejects.toThrow(InvalidConfigurationError);
    await expect(prepared.render(undefined as never)).rejects.toThrow(InvalidConfigurationError);
    await expect(prepared.render({ width: 4, height: 4 }, { extra: 1 } as never)).rejects.toThrow(InvalidConfigurationError);
    const controller = new AbortController();
    controller.abort();
    await expect(prepared.render({ width: 4, height: 4 }, { signal: controller.signal })).rejects.toThrow(/aborted/u);
    expect((await prepared.render({ width: 4, height: 4 })).image.width).toBe(4);
  }, testTimeout(30_000));
});
