// SPDX-License-Identifier: Apache-2.0

/**
 * The GPU display-view producer of the preview acceptance harness (#480): `node scripts/accept-display-view-gpu.mjs --gpu`.
 * It renders the request in headless Chromium through `prepareDisplayView(request, { gpu: "require", gpuDevice })` on the
 * built engine (`scripts/lib/display-view-gpu-page.mjs`), launched by the WebGPU suite's dependency-free driver
 * (`test/webgpu/chromium.ts`, loaded with Node's TypeScript type stripping): SwiftShader by default, a hardware adapter with
 * `PHOTIVRA_WEBGPU_ADAPTER=hardware` (or `PHOTIVRA_WEBGPU_FLAGS`), the browser from `PHOTIVRA_WEBGPU_BROWSER` or the usual
 * locations, exactly as `npm run test:webgpu`. The contract is the CPU producer's (`display-view-cpu-producer.mjs`), plus
 * `execution` (the render's `diagnostics.fast.execution`), `adapter`, `softwareAdapter` and `close()`; with the option `reference`, also
 * `reference`, the CPU reference rendered in the same browser page (the GPU's own realm), in the producer contract's shape.
 *
 * It never falls back: with `"require"` a view the GPU cannot render throws the engine's reason (an `Error` whose `reason` is the
 * engine's fallback reason), and the harness checks each returned label (`gpuRenderProblem` in `display-view-acceptance.mjs`) before it compares anything.
 */
import { Buffer } from "node:buffer";
import process from "node:process";
import { performance } from "node:perf_hooks";
import { fileURLToPath, URL } from "node:url";
import { requestTransportProblem } from "./display-view-acceptance.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const PAGE = "/scripts/lib/display-view-gpu-page.mjs";
/** Bytes per DevTools round trip when reading the arrays back (base64 grows it by a third). */
const CHUNK_BYTES = 16 * 1024 * 1024;
const TYPES = { Float64Array, Float32Array, Uint8Array, Uint16Array };

export async function createProducer(context, { repeat = 1, reference = false } = {}) {
  let driver;
  try { driver = await import(new URL("../../test/webgpu/chromium.ts", import.meta.url).href); }
  catch (error) { throw new Error(`The GPU producer loads the WebGPU suite's browser driver (test/webgpu/chromium.ts) through Node's TypeScript type stripping, which needs Node 22.18 or later (this is ${process.version}): ${error.message}`, { cause: error }); }
  const binary = driver.findChromium();
  if (!binary) throw new Error("No Chromium or Chrome binary was found for the GPU producer: set PHOTIVRA_WEBGPU_BROWSER=/path/to/chrome (docs/WEBGPU.md, \"Browser support and running the suite\").");
  const page = await driver.openBrowserPage(binary, ROOT);
  const call = (fn, ...args) => page.evaluate(`import(${JSON.stringify(PAGE)}).then(m => m.${fn}(${args.map((a) => JSON.stringify(a)).join(", ")}))`);
  const probe = await call("probe");
  if (!probe.available) { await page.close(); throw new Error(`The browser (${binary}) exposes no WebGPU adapter with flags "${driver.webGpuFlags().join(" ")}"; see docs/WEBGPU.md, "Running on hardware".`); }
  void context;
  return {
    name: "webgpu-f32",
    binary,
    flags: driver.webGpuFlags(),
    probe,
    async render(options, view) {
      const problem = requestTransportProblem(options);
      if (problem) throw new Error(problem);
      const t0 = performance.now();
      const meta = JSON.parse(await call("render", JSON.stringify({ request: options, view: { width: view.width, height: view.height, ...(view.region ? { region: view.region } : {}) }, repeat, reference })));
      if (meta.failure) {
        // `gpu: "require"`: the engine's reason (unsupported-on-backend, conformance-failed, device-lost, …) instead of a CPU render.
        const error = new Error(`${meta.failure.name}${meta.failure.reason ? ` (${meta.failure.reason})` : ""}: ${meta.failure.message}`);
        error.reason = meta.failure.reason;
        throw error;
      }
      const wallMs = performance.now() - t0, arrays = {};
      for (const name of Object.keys(meta.lengths)) {
        const Type = TYPES[meta.types[name]], bytes = new Uint8Array(meta.lengths[name] * Type.BYTES_PER_ELEMENT);
        for (let start = 0; start < bytes.length; start += CHUNK_BYTES) bytes.set(Buffer.from(await call("chunk", name, start, Math.min(bytes.length, start + CHUNK_BYTES)), "base64"), start);
        arrays[name] = new Type(bytes.buffer);
      }
      await call("release");
      const renders = meta.timings.renderMs;
      return { width: meta.width, height: meta.height, samples: arrays.samples, expected: arrays.expected, noiseStd: arrays.noiseStd,
        // The whole-view time as the page measured it: the first render, which includes the device's run-time conformance self-check
        // and the pipelines' compilation (an app's first view pays them too); later renders, with `repeat`, are in `timings`.
        elapsedMs: renders[0], execution: meta.execution, adapter: meta.adapter, softwareAdapter: meta.softwareAdapter, estimation: meta.estimation, sampleCount: meta.sampleCount,
        // With `reference`, the CPU reference rendered in the same page: the reference of the GPU's realm.
        ...(reference ? { reference: { name: "cpu-reference (browser)", width: meta.width, height: meta.height, samples: arrays.referenceSamples, expected: arrays.referenceExpected, noiseStd: arrays.referenceNoiseStd,
          elapsedMs: meta.timings.referenceMs, estimation: meta.estimation } } : {}),
        timings: { adapterAndDeviceMs: meta.timings.acquireMs, prepareMs: meta.timings.prepareMs, firstRenderMs: renders[0], ...(renders.length > 1 ? { laterRendersMs: renders.slice(1) } : {}),
          pageRoundTripWithReadbackMs: wallMs }, browser: meta.userAgent };
    },
    async close() { await page.close(); }
  };
}
