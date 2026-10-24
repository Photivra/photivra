// SPDX-License-Identifier: Apache-2.0
/**
 * #392: the per-real-pixel memo replays a sample's recorded terms when another sample of the same display pixel lands on the
 * same real pixel. Views barely smaller than the frame put most of a display pixel's samples on a few real pixels; their
 * hashes were recorded on main before the memo (abb8b27), so the memo changes no byte, no diagnostic and no lookup count.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { simulateDisplayViewWithInternals } from "../src/facade/simulate-display-view.js";
import type { SimulateCaptureOptions, SimulateDisplayViewOptions } from "../src/index.js";
import { scaledTimeout as testTimeout } from "./helpers/test-timeout.js";

describe("display view per-real-pixel memo (#392)", () => {
  it("keeps the bytes of views where samples share real pixels", async () => {
    const cases: [SimulateCaptureOptions, SimulateDisplayViewOptions, string][] = [
      // Speed (direct sites), 1.2 × 1.2 real pixels per display pixel.
      [{ scene: { preset: "dead-leaves" }, sensor: { pixelPitchMicrometers: 2 }, output: { width: 60, height: 40 } }, { width: 50, height: 33 }, "d093871d23934e425675da0f5d2beb225433196b6c078c07fce29f5a9bb8d80e"],
      // Chart materials with diffraction (the filled path and the site ring) and the 2 × 2 box, with AHD.
      [{ scene: { preset: "siemens-star" }, lens: { fNumber: 11, diffraction: "circular-aperture" }, sensor: { pixelPitchMicrometers: 3, pixelAperture: { kind: "box", samplesPerAxis: 2 } },
        output: { width: 60, height: 40, demosaic: "ahd" } }, { width: 50, height: 33 }, "92518cd6b3ab0bfc2b79231522508e18699966ac9d14de15734d8b8f36844ed2"]
    ];
    for (const [options, view, expected] of cases) {
      const { result, internals } = await simulateDisplayViewWithInternals(options, view);
      const diagnostics: Partial<typeof result.diagnostics> = { ...result.diagnostics }, hash = createHash("sha256");
      delete diagnostics.timingsMs;
      for (const a of [result.image.samples, internals.expected, internals.noiseStd]) hash.update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
      hash.update(JSON.stringify(diagnostics));
      expect(hash.digest("hex")).toBe(expected);
    }
  }, testTimeout(120_000));
});
