// SPDX-License-Identifier: Apache-2.0
/**
 * Fixtures and metrics of the GPU display view (Speed, #478): a request rendered by the CPU reference with its setup and
 * expected-signal input exposed, the chart-preset material module, the GPU render on a WebGPU runtime, and the per-pixel
 * comparison in ΔE2000 (CIELAB under the capture colour model's D65 white) and noise-σ units.
 */
import { resolveCaptureColorModel } from "../../src/color/capture-color.js";
import { cielabOfXyz, deltaE2000 } from "../../src/color/color-difference.js";
import { resolvePortableChartScene } from "../../src/facade/chart-scenes.js";
import { simulateDisplayViewWithInternals } from "../../src/facade/simulate-display-view.js";
import type { ChartScene, SimulateCaptureOptions, SimulateDisplayViewOptions } from "../../src/index.js";
import { chartPresetMaterialModule } from "../../src/gpu/display-view-chart-material-module.js";
import { renderDisplayViewSpeedOnGpu, type DisplayViewSpeedGpuInput, type DisplayViewSpeedGpuResult } from "../../src/gpu/display-view-speed-gpu.js";
import { acquireWebGpuRuntime, createComputePipeline, type WebGpuRuntime } from "../../src/gpu/webgpu-runtime.js";
import type { DisplayViewRenderResult } from "../../src/facade/display-view.js";

/** A CPU display view of a chart-preset request and the inputs of its GPU render. */
export interface DisplayViewGpuFixture { cpu: DisplayViewRenderResult; input: DisplayViewSpeedGpuInput; viewWidth: number; viewHeight: number }

/** The small 3:2 frame of the unit tests: 600 × 400 real pixels of 6 µm, shown at 2.96 real pixels per display pixel. */
export const SMALL_FRAME = { width: 600, height: 400 };
export const SMALL_VIEW = { width: 203, height: 135 };

/** Renders the CPU reference of `options` at `view` and builds the GPU input with the chart-preset material module. */
export async function displayViewGpuFixture(options: SimulateCaptureOptions, view: SimulateDisplayViewOptions): Promise<DisplayViewGpuFixture> {
  const { internals, setup, signalInput } = await simulateDisplayViewWithInternals(options, view);
  const output = options.output ?? {}, width = output.width ?? 64, height = output.height ?? 64;
  const chart = resolvePortableChartScene({ scene: options.scene as ChartScene, aspect: height / width });
  return { cpu: internals, input: { setup, signalInput, material: chartPresetMaterialModule(chart) }, viewWidth: view.width, viewHeight: view.height };
}

/** A runtime on a `navigator.gpu`-shaped object (the fake device in unit tests). */
export async function runtimeOf(gpu: unknown): Promise<WebGpuRuntime> {
  const acquired = await acquireWebGpuRuntime(gpu, undefined, undefined);
  if ("failure" in acquired) throw new Error("no runtime: " + acquired.failure);
  return acquired.runtime;
}

/** Renders the fixture's input on the runtime (the host path with its full result; the contract adapter is tested through prepareDisplayView). */
export async function renderOnGpu(runtime: WebGpuRuntime, fixture: DisplayViewGpuFixture, maximumBandBytes = 64 * 1024 * 1024, recomputeFlagged = true): Promise<DisplayViewSpeedGpuResult> {
  return await renderDisplayViewSpeedOnGpu(runtime, maximumBandBytes, { ...fixture.input, recomputeFlagged }, new AbortController(), undefined,
    (label, code) => createComputePipeline(runtime, label, code, undefined));
}

export interface DisplayViewAgreement {
  pixels: number;
  /** ΔE2000 between the GPU and CPU expected values (linear sRGB clipped to [0, 1] → XYZ → CIELAB, D65): maximum and RMS. */
  deltaEMaximum: number; deltaERms: number;
  /** |E_gpu − E_cpu| / σ_cpu per component where σ_cpu > 0: maximum and RMS. */
  sigmaUnitsMaximum: number; sigmaUnitsRms: number;
  /** |σ_gpu − σ_cpu| / σ_cpu where σ_cpu > 0: maximum. */
  sigmaRelativeMaximum: number;
  /** Samples that differ, and the largest difference in codes. */
  differingSamples: number; largestCodeDifference: number;
  /** Components whose expected value or variance lie outside the result's a-priori bound (must be 0). */
  outsideExpectedBound: number; outsideVarianceBound: number;
  largestExpectedRatio: number; largestVarianceRatio: number;
}

/** The fields of a GPU result the comparison reads (a browser result arrives as plain data). */
export type ComparableGpuResult = Pick<DisplayViewSpeedGpuResult, "samples" | "expected" | "noiseStd" | "expectedValueBound" | "varianceBound" | "expectedValueAbsoluteBound" | "varianceAbsoluteBound">;

/** Compares a GPU render with the CPU reference per pixel and against the GPU result's own bounds. */
export function compareDisplayViews(cpu: Pick<DisplayViewRenderResult, "samples" | "expected" | "noiseStd">, gpu: ComparableGpuResult): DisplayViewAgreement {
  const model = resolveCaptureColorModel(), M = model.cameraRgbToXyz, white = model.referenceWhiteXyz, pixels = cpu.expected.length / 3;
  const lab = (e: Float64Array, o: number): ReturnType<typeof cielabOfXyz> => {
    const r = Math.min(1, Math.max(0, e[o]!)), g = Math.min(1, Math.max(0, e[o + 1]!)), b = Math.min(1, Math.max(0, e[o + 2]!));
    return cielabOfXyz({ x: M[0][0] * r + M[0][1] * g + M[0][2] * b, y: M[1][0] * r + M[1][1] * g + M[1][2] * b, z: M[2][0] * r + M[2][1] * g + M[2][2] * b }, white);
  };
  const a: DisplayViewAgreement = { pixels, deltaEMaximum: 0, deltaERms: 0, sigmaUnitsMaximum: 0, sigmaUnitsRms: 0, sigmaRelativeMaximum: 0, differingSamples: 0, largestCodeDifference: 0,
    outsideExpectedBound: 0, outsideVarianceBound: 0, largestExpectedRatio: 0, largestVarianceRatio: 0 };
  let sigmaCount = 0;
  for (let p = 0; p < pixels; p++) {
    const o = 3 * p, dE = deltaE2000(lab(cpu.expected, o), lab(gpu.expected, o));
    a.deltaEMaximum = Math.max(a.deltaEMaximum, dE); a.deltaERms += dE * dE;
    for (let c = 0; c < 3; c++) {
      const e0 = cpu.expected[o + c]!, e1 = gpu.expected[o + c]!, s0 = cpu.noiseStd[o + c]!, s1 = gpu.noiseStd[o + c]!, dE1 = Math.abs(e1 - e0);
      if (s0 > 0) {
        const units = dE1 / s0;
        a.sigmaUnitsMaximum = Math.max(a.sigmaUnitsMaximum, units); a.sigmaUnitsRms += units * units; sigmaCount++;
        a.sigmaRelativeMaximum = Math.max(a.sigmaRelativeMaximum, Math.abs(s1 - s0) / s0);
      }
      const code = Math.abs(gpu.samples[o + c]! - cpu.samples[o + c]!);
      if (code > 0) { a.differingSamples++; a.largestCodeDifference = Math.max(a.largestCodeDifference, code); }
      const expectedLimit = gpu.expectedValueBound.relative * Math.abs(e0) + gpu.expectedValueAbsoluteBound[p]!;
      const varianceLimit = gpu.varianceBound.relative * s0 * s0 + gpu.varianceAbsoluteBound[p]!;
      const dV = Math.abs(s1 * s1 - s0 * s0);
      if (expectedLimit > 0) a.largestExpectedRatio = Math.max(a.largestExpectedRatio, dE1 / expectedLimit);
      if (varianceLimit > 0) a.largestVarianceRatio = Math.max(a.largestVarianceRatio, dV / varianceLimit);
      if (dE1 > expectedLimit) a.outsideExpectedBound++;
      if (dV > varianceLimit) a.outsideVarianceBound++;
    }
  }
  a.deltaERms = Math.sqrt(a.deltaERms / pixels); a.sigmaUnitsRms = sigmaCount > 0 ? Math.sqrt(a.sigmaUnitsRms / sigmaCount) : 0;
  return a;
}
