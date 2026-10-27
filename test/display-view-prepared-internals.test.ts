// SPDX-License-Identifier: Apache-2.0
/**
 * The internal render of a prepared view with its expected values and noise σ (`renderPreparedDisplayViewWithInternals`, the
 * #480 acceptance harness's GPU producer): the same render as `render`, whichever renderer ran, plus the renderer's arrays; and
 * the harness's guard that a candidate render really ran on the GPU (`gpuRenderProblem`), on a real label from the float32
 * emulation of the GPU kernels.
 */
import { describe, expect, it } from "vitest";
import { prepareDisplayView, type SimulateCaptureOptions } from "../src/index.js";
import { renderPreparedDisplayViewWithInternals, simulateDisplayViewWithInternals } from "../src/facade/simulate-display-view.js";
import { createFakeGpu } from "./helpers/fake-webgpu.js";
import { SMALL_FRAME, SMALL_VIEW } from "./helpers/display-view-gpu-fixture.js";
import { scaledTimeout } from "./helpers/test-timeout.js";
// @ts-expect-error -- the harness's script module has no declarations.
import { gpuRenderProblem } from "../scripts/lib/display-view-acceptance.mjs";

const options: SimulateCaptureOptions = { scene: { preset: "checkerboard", squaresAcross: 12 }, lens: { prime: 50, fNumber: 8 },
  sensor: { pixelPitchMicrometers: 6, pixelAperture: { kind: "box", samplesPerAxis: 2 } }, output: { ...SMALL_FRAME, format: "srgb-8" } };

describe("renderPreparedDisplayViewWithInternals", () => {
  it("on the CPU: the same bytes as render, and the expected values and σ of simulateDisplayViewWithInternals", async () => {
    const prepared = await prepareDisplayView(options), view = { ...SMALL_VIEW, format: "srgb-8" as const };
    const { result, internals } = await renderPreparedDisplayViewWithInternals(prepared, view);
    const plain = await prepared.render(view), reference = await simulateDisplayViewWithInternals(options, view);
    expect(Array.from(result.image.samples)).toEqual(Array.from(plain.image.samples));
    expect(Array.from(internals.samples)).toEqual(Array.from(result.image.samples));
    expect(Array.from(internals.expected)).toEqual(Array.from(reference.internals.expected));
    expect(Array.from(internals.noiseStd)).toEqual(Array.from(reference.internals.noiseStd));
    expect(result.diagnostics.fast.execution.backend).toBe("cpu-reference");
    expect(gpuRenderProblem({ execution: result.diagnostics.fast.execution, softwareAdapter: false })).toMatch(/ran cpu-reference, not webgpu-f32/u);
  }, scaledTimeout(120_000));

  it("with gpu \"require\": the GPU renderer's own arrays and label, which the harness's guard accepts", async () => {
    const prepared = await prepareDisplayView(options, { gpu: "require", gpuDevice: createFakeGpu().gpu });
    try {
      const { result, internals } = await renderPreparedDisplayViewWithInternals(prepared, SMALL_VIEW), cpu = await simulateDisplayViewWithInternals(options, SMALL_VIEW);
      const execution = result.diagnostics.fast.execution;
      expect(execution).toMatchObject({ backend: "webgpu-f32", fallbackReason: null, arithmetic: "float32" });
      expect(Array.from(internals.samples)).toEqual(Array.from(result.image.samples));
      // The float32 renderer's expected values: within its bound of the reference, and not the reference's own bytes.
      const bound = execution.errorBound!;
      if (bound.kind !== "relative-to-reference") throw new Error("a relative bound expected");
      let differing = 0;
      for (let i = 0; i < cpu.internals.expected.length; i++) {
        const d = Math.abs(internals.expected[i]! - cpu.internals.expected[i]!);
        expect(d).toBeLessThanOrEqual(bound.relative * Math.abs(cpu.internals.expected[i]!) + bound.absolute);
        if (d !== 0) differing++;
      }
      expect(differing).toBeGreaterThan(0);
      expect(gpuRenderProblem({ execution, softwareAdapter: false })).toBeNull();
      expect(gpuRenderProblem({ execution, softwareAdapter: false }, { requireHardware: true })).toBeNull();
      expect(gpuRenderProblem({ execution, softwareAdapter: true }, { requireHardware: true })).toMatch(/hardware adapter was required/u);
      expect(gpuRenderProblem({ execution, softwareAdapter: null }, { requireHardware: true })).toMatch(/no adapter information/u);
    } finally { prepared.dispose(); }
  }, scaledTimeout(180_000));

  it("refuses an object prepareDisplayView did not return", async () => {
    const prepared = await prepareDisplayView(options);
    await expect(renderPreparedDisplayViewWithInternals({ ...prepared }, SMALL_VIEW)).rejects.toThrow(/needs a view returned by prepareDisplayView/u);
  });
});
