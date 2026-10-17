// SPDX-License-Identifier: Apache-2.0
/**
 * Per-fixture rollout (#277), CI subset: the GPU image-formation path (fake device, float32 emulation of
 * the WGSL kernels) against the per-site engine on the rollout's sampled tiles, with the same pinned method
 * errors as `npm run test:webgpu` (test/webgpu/rollout.webgpu.ts runs every preset on a real device).
 */
import { describe, expect, it } from "vitest";
import { composeRelativeErrorBounds, createImageKernelAccelerator, type ImageKernelRelativeErrorBound } from "../src/index.js";
import { createFakeGpu } from "./helpers/fake-webgpu.js";
import { CHART_PRESET_SCENES } from "./helpers/chart-radiance-fixtures.js";
import { channelPlanes, cpuMethodTile, methodError, methodTile, perSiteTile, rolloutMethodInputs, rolloutPsfProfile, rolloutSetup, ROLLOUT_PINNED_METHOD_ERROR,
  ROLLOUT_TILES } from "./helpers/rollout-fixture.js";

const CASES = [["slanted-edge", "exact-centre"], ["siemens-star", "exact-centre"], ["point-grid", "exact-centre"], ["point-grid", "subsite-off-axis"]] as const;

describe("per-fixture rollout (CI subset, fake device)", () => {
  it.each(CASES)("%s %s: GPU path within the arithmetic bound of the method; method error within its pinned value", async (name, id) => {
    const scene = CHART_PRESET_SCENES.find(([n]) => n === name)![1], config = ROLLOUT_TILES.find(c => c.id === id)!, tile = config.tile;
    const setup = await rolloutSetup(scene), profile = rolloutPsfProfile(setup, config.psfPitchMicrometers, config.psfHalfWidth);
    const inputs = rolloutMethodInputs(setup, profile, tile);
    const a = await createImageKernelAccelerator({ backend: "webgpu-f32", fallback: "fail", gpu: createFakeGpu().gpu });
    const radiance = await a.evaluateChartRadiance(inputs.radiance);
    const convolved: ArrayLike<number>[] = [];
    let convolutionBound: ImageKernelRelativeErrorBound | null = null;
    for (const samples of channelPlanes(radiance.values, inputs.region.width * inputs.region.height)) {
      const out = await a.convolveIrradiance({ ...inputs.convolution, samples });
      convolved.push(out.values);
      convolutionBound = out.execution.errorBound as ImageKernelRelativeErrorBound;
    }
    a.dispose();
    const gpu = methodTile(inputs, tile, convolved), cpu = cpuMethodTile(inputs, tile), reference = perSiteTile(setup, profile, tile);
    const bound = composeRelativeErrorBounds(radiance.execution.errorBound as ImageKernelRelativeErrorBound, convolutionBound!, inputs.maximumKernelSum);
    for (let i = 0; i < cpu.length; i++) expect(Math.abs(gpu[i]! - cpu[i]!)).toBeLessThanOrEqual(bound.relative * Math.abs(cpu[i]!) + bound.absolute);
    expect(methodError(gpu, reference).maximumOfPeak).toBeLessThanOrEqual(ROLLOUT_PINNED_METHOD_ERROR[name]![id]!);
    expect(methodError(cpu, reference).maximumOfPeak).toBeLessThanOrEqual(ROLLOUT_PINNED_METHOD_ERROR[name]![id]!);
  }, 120_000);
});
