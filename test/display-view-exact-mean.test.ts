// SPDX-License-Identifier: Apache-2.0
/**
 * #393: where a footprint holds at most K² real pixels the display view averages every real pixel of it once, with its exact
 * overlap weight: D_P = Σ_j (w_j/A)·E[L_j]. A view at the frame's own size gives each real pixel's E[L_j] (a one-pixel
 * footprint, weight 1), so a half-size view's expected values must be the means of 2 × 2 blocks of it, and a view at 2/3 the
 * frame's size the overlap-weighted means; coarser views keep the stratified estimator.
 */
import { describe, expect, it } from "vitest";
import { simulateDisplayViewWithInternals } from "../src/facade/simulate-display-view.js";
import type { SimulateCaptureOptions } from "../src/index.js";
import { scaledTimeout as testTimeout } from "./helpers/test-timeout.js";

const W = 48, H = 32;
const REQUESTS: [string, SimulateCaptureOptions][] = [
  ["Speed", { scene: { preset: "siemens-star", cycles: 12 }, sensor: { pixelPitchMicrometers: 3, pixelAperture: { kind: "box", samplesPerAxis: 2 } }, output: { width: W, height: H } }],
  ["Quality", { scene: { preset: "dead-leaves" }, lens: { fNumber: 11, diffraction: "circular-aperture" }, sensor: { pixelPitchMicrometers: 2, antiAliasing: { kind: "four-spot" } },
    exposure: { iso: 1600, shutterSeconds: 1 / 2000 }, output: { width: W, height: H, demosaic: "ahd" } }]
];

/** The view's expected linear values and its result. */
async function view(options: SimulateCaptureOptions, width: number, height: number): Promise<{ expected: Float64Array; estimation: string; samples: number }> {
  const { result, internals } = await simulateDisplayViewWithInternals(options, { width, height });
  return { expected: internals.expected, estimation: internals.estimation, samples: result.diagnostics.sampleCount };
}
/** Overlap of real index k with display pixel p of size s along one axis. */
const overlap = (p: number, s: number, k: number): number => Math.max(0, Math.min((p + 1) * s, k + 1) - Math.max(p * s, k));

describe("display view exact area mean (#393)", () => {
  it.each(REQUESTS)("%s: expected values are the overlap-weighted means of the real pixels' own expected values", async (_, options) => {
    const real = await view(options, W, H);
    expect(real.estimation).toBe("exact-area-mean");
    expect(real.samples).toBe(W * H);
    for (const [vw, vh] of [[24, 16], [32, 21]] as const) {
      const v = await view(options, vw, vh), sx = W / vw, sy = H / vh;
      expect(v.estimation).toBe("exact-area-mean");
      for (let py = 0; py < vh; py++) for (let px = 0; px < vw; px++) for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let y = Math.floor(py * sy); y < Math.min(H, Math.ceil((py + 1) * sy)); y++) for (let x = Math.floor(px * sx); x < Math.min(W, Math.ceil((px + 1) * sx)); x++)
          sum += overlap(px, sx, x) * overlap(py, sy, y) / (sx * sy) * real.expected[(y * W + x) * 3 + c]!;
        const got = v.expected[(py * vw + px) * 3 + c]!;
        expect(Math.abs(got - sum)).toBeLessThanOrEqual(1e-12 * Math.max(1e-6, Math.abs(sum)));
      }
    }
  }, testTimeout(120_000));

  it("keeps the stratified estimator where a footprint holds more than K² real pixels", async () => {
    const [, options] = REQUESTS[0]!;
    // 48 × 32 at 2 × 2: 24 × 16 real pixels per display pixel, more than 4 × 4 = 16 with K = 4.
    const { internals } = await simulateDisplayViewWithInternals(options, { width: 2, height: 2, samplesPerAxis: 4 });
    expect(internals.estimation).toBe("stratified-monte-carlo");
  }, testTimeout(60_000));
});
