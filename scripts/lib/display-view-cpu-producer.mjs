// SPDX-License-Identifier: Apache-2.0

/**
 * The CPU display-view producer of the preview acceptance harness (#480): the engine reference, used as the reference
 * side of every comparison and, until a GPU preview kernel exists (#478, #479), as the default candidate too.
 *
 * A producer module exports `createProducer(context)`; `context.engine` is the build's root module (`dist/index.js`) and
 * `context.distUrl` the `file:` URL of its `dist/` directory. It returns `{ name, render }`, where
 * `render(options, view)` renders the display view `view` (`{ width, height, region? }`: the whole view, or one region of it) of the capture request `options`
 * and resolves to `{ width, height, samples, expected, noiseStd, elapsedMs, timings? }`: `samples` the 8-bit sRGB display
 * pixels, `expected` and `noiseStd` the noise-free expected linear value and the noise standard deviation of each display
 * pixel's components (interleaved RGB, `Float64Array`, 3 × width × height), `elapsedMs` the whole-view render time the
 * producer itself measured (for a GPU: setup, upload, kernels and readback) and `timings` any further labelled times
 * (for a GPU: adapter and device acquisition, the conformance self-check, the timing probe), printed as given.
 * `createProducer(context, { repeat })` may take options (the GPU producer's `repeat`), and a producer may have `close()`.
 * The GPU producer (`display-view-gpu-producer.mjs`) adds `execution`, the render's `diagnostics.fast.execution`.
 */
import { performance } from "node:perf_hooks";
import { URL } from "node:url";

export async function createProducer(context) {
  const { simulateDisplayViewWithInternals } = await import(new URL("facade/simulate-display-view.js", context.distUrl).href);
  return {
    name: "cpu-reference",
    async render(options, view) {
      const t0 = performance.now();
      const { result, internals } = await simulateDisplayViewWithInternals(options, { width: view.width, height: view.height, ...(view.region ? { region: view.region } : {}), format: "srgb-8" });
      const elapsedMs = performance.now() - t0;
      return { width: result.image.width, height: result.image.height, samples: result.image.samples, expected: internals.expected, noiseStd: internals.noiseStd, elapsedMs,
        estimation: internals.estimation, sampleCount: internals.sampleCount };
    }
  };
}
