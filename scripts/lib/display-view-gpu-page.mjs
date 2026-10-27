// SPDX-License-Identifier: Apache-2.0

/**
 * The browser half of the GPU producer of the preview acceptance harness (#480; `scripts/lib/display-view-gpu-producer.mjs`
 * drives it over the DevTools protocol, with the WebGPU suite's driver `test/webgpu/chromium.ts`). It runs the built engine
 * (`/dist/`, the same build the harness's CPU reference runs in Node) as an application does: one `ImageKernelAccelerator`
 * owns the page's device, and the view is prepared with `prepareDisplayView(request, { gpu: "require", gpuDevice })`, so a
 * request the GPU cannot render fails with the engine's reason instead of falling back to the CPU. The whole view is rendered
 * once through the engine's internal `renderPreparedDisplayViewWithInternals` (the same render as `render`, which also hands
 * back the expected values and noise σ the harness compares) and kept in the page; the Node side reads it in chunks.
 */

/* global navigator, performance, btoa */
let held = null;

const typed = (name) => { if (!held || !held.arrays[name]) throw new Error(`No ${name} is held; render first.`); return held.arrays[name]; };

/** The adapter the browser offers, as `GPUAdapter.info` describes it, and whether it is a software (fallback) adapter. */
export async function probe() {
  const gpu = navigator.gpu;
  if (!gpu) return { available: false };
  const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) return { available: false };
  const info = adapter.info ?? {};
  return { available: true, adapter: { vendor: info.vendor ?? "", architecture: info.architecture ?? "", device: info.device ?? "", description: info.description ?? "",
    isFallbackAdapter: info.isFallbackAdapter ?? false } };
}

/**
 * Renders `request` (JSON: `{ request, view, repeat, reference }`) on the GPU and keeps the result; with `reference`, then also
 * renders it with the CPU reference in this page (`gpu: "off"`), the reference of the GPU's own realm (the engines' `Math.atan2`
 * can differ in the last bit, #471, which moves a lattice point exactly on a Siemens star's sector boundary). Returns JSON with
 * the execution label, the times measured in the page and the arrays' lengths, or `{ failure }` with the engine's reason when
 * the GPU cannot render the view.
 */
export async function render(json) {
  try { return await renderOnGpu(JSON.parse(json)); }
  catch (error) {
    // The engine's refusal travels back as data, so the harness can tell "the GPU does not cover this request" (its reason) from a crash.
    return JSON.stringify({ failure: { name: error?.name ?? "Error", reason: typeof error?.reason === "string" ? error.reason : null, message: String(error?.message ?? error) } });
  }
}

async function renderOnGpu({ request, view, repeat = 1, reference = false }) {
  release();
  const engine = await import("/dist/index.js"), { renderPreparedDisplayViewWithInternals } = await import("/dist/facade/simulate-display-view.js");
  const adapter = await probe();
  let t = performance.now();
  const accelerator = await engine.createImageKernelAccelerator({ backend: "webgpu-f32", fallback: "fail", powerPreference: "high-performance" });
  const acquireMs = performance.now() - t;
  try {
    t = performance.now();
    const prepared = await engine.prepareDisplayView(request, { gpu: "require", gpuDevice: accelerator });
    const prepareMs = performance.now() - t, renders = [];
    try {
      let out;
      for (let i = 0; i < Math.max(1, repeat); i++) {
        t = performance.now();
        out = await renderPreparedDisplayViewWithInternals(prepared, { width: view.width, height: view.height, ...(view.region ? { region: view.region } : {}), format: "srgb-8" });
        renders.push(performance.now() - t);
      }
      const { result, internals } = out, viewOptions = { width: view.width, height: view.height, ...(view.region ? { region: view.region } : {}), format: "srgb-8" };
      held = { arrays: { samples: result.image.samples, expected: internals.expected, noiseStd: internals.noiseStd } };
      const execution = result.diagnostics.fast.execution;
      let referenceMs = null;
      if (reference) {
        t = performance.now();
        const cpu = await renderPreparedDisplayViewWithInternals(await engine.prepareDisplayView(request), viewOptions);
        referenceMs = performance.now() - t;
        Object.assign(held.arrays, { referenceSamples: cpu.result.image.samples, referenceExpected: cpu.internals.expected, referenceNoiseStd: cpu.internals.noiseStd });
      }
      return JSON.stringify({ width: result.image.width, height: result.image.height, execution, adapter: adapter.adapter ?? null, softwareAdapter: adapter.available ? adapter.adapter.isFallbackAdapter === true ||
        /swiftshader/iu.test(adapter.adapter.architecture + " " + adapter.adapter.vendor + " " + adapter.adapter.description) : null,
        estimation: internals.estimation, sampleCount: internals.sampleCount, userAgent: navigator.userAgent,
        timings: { acquireMs, prepareMs, renderMs: renders, referenceMs }, lengths: Object.fromEntries(Object.entries(held.arrays).map(([k, a]) => [k, a.length])),
        types: Object.fromEntries(Object.entries(held.arrays).map(([k, a]) => [k, a.constructor.name])) });
    } finally { prepared.dispose(); }
  } finally { accelerator.dispose(); }
}

/** Bytes [start, end) of a held array as base64 (the DevTools protocol carries strings). */
export function chunk(name, start, end) {
  const a = typed(name), bytes = new Uint8Array(a.buffer, a.byteOffset, a.byteLength).subarray(start, end);
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

/** Drops the held arrays. */
export function release() { held = null; }
