// SPDX-License-Identifier: Apache-2.0
/**
 * The display view's composite material module under fused contraction (2.11.0, the owner's M5 Pro run of October 27, 2026), on the
 * fake device's emulation (test/helpers/fake-webgpu-composite.ts): with a multiply and an add fused into one rounding wherever the
 * dataflow allows (W3C WGSL, § 15.7.5 "Reassociation and Fusion"), the probe picks the fma product path, and the Speed and Quality
 * views of the #491 fixtures (material-layers scenes, the 2.3 elements as plain charts, a fixed-size chart) render inside their
 * a-priori bounds and the #480 acceptance thresholds, measured against the same views on the unfused emulation. The contraction
 * model covers the composite kernel's classification, its probe and the lattice recovery (where the error-free transforms are);
 * the Speed and Quality kernels' own sample arithmetic runs as in the other emulation tests. Through `prepareDisplayView`, the probe
 * record is in `diagnostics.fast.execution.compositeProbe`, on a GPU render and on a refusal's CPU fallback alike.
 */
import { afterAll, describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { prepareDisplayView, type SimulateCaptureOptions } from "../src/index.js";
import { setDisplayViewGpuRendererFactory } from "../src/facade/display-view-gpu.js";
import { registerDisplayViewGpuRenderer, qualityMaterialModule } from "../src/gpu/display-view-quality-gpu.js";
import { chartCompositeMaterialModuleId } from "../src/gpu/display-view-composite-material-module.js";
import { createFakeGpu } from "./helpers/fake-webgpu.js";
import type { CompositeArithmetic } from "./helpers/fake-webgpu-composite.js";
import { SMALL_FRAME, SMALL_VIEW, compareDisplayViews, displayViewGpuFixture, materialModuleOf, materialModulesOf, renderOnGpu, renderOnGpuQuality, runtimeOf,
  type DisplayViewAgreement } from "./helpers/display-view-gpu-fixture.js";
import { acceptanceOf } from "./helpers/display-view-acceptance-metrics.js";
import { FIXTURE_ASPECT, layeredScene } from "./helpers/chart-composite-fixtures.js";
import { scaledTimeout } from "./helpers/test-timeout.js";

const sensor = { pixelPitchMicrometers: 6, pixelAperture: { kind: "box" as const, samplesPerAxis: 2 } };
const output = { ...SMALL_FRAME, format: "srgb-8" as const };
const lens = { prime: 50 as const, fNumber: 8 };
const declared = layeredScene(FIXTURE_ASPECT);
const placed = { chartSize: { widthM: 0.042 }, subjectDistanceM: 0.63 };
/** The #491 Speed cases (test/display-view-composite-gpu.test.ts) with their flagged-fraction ceilings. */
const cases: [string, SimulateCaptureOptions, number][] = [
  ["composite under the label layer (material-layers), frame-filling", { scene: declared, lens, sensor, output }, 0.06],
  ["composite under the label layer (material-layers), fixed-size chart with surround", { scene: declared, lens, sensor, output, ...placed }, 0.06],
  ["composite under the label layer (material-layers), Reinhard at the white clip", { scene: declared, lens, sensor, output: { ...output, toneCurve: "positive-reinhard-per-channel" },
    exposure: { mode: "manual", iso: 100, shutterSeconds: 1 / 30 } }, 0.06],
  ["zone plate (2.3 element as a plain chart)", { scene: { preset: "zone-plate", maximumCyclesPerPictureHeight: 200 }, lens, sensor, output }, 0.3],
  ["Siemens star (sine, 64 cycles)", { scene: { preset: "siemens-star", profile: "sine", cycles: 64 }, lens, sensor, output }, 0.05],
  ["dead leaves", { scene: { preset: "dead-leaves", seed: 491 }, lens, sensor, output }, 0.05],
  ["bar groups with numerals", { scene: { preset: "bar-groups", numerals: true }, lens, sensor, output }, 0.05],
  ["checkerboard, fixed-size chart with surround", { scene: { preset: "checkerboard", squaresAcross: 12 }, lens, sensor, output, ...placed }, 0.05]
];
const MODELS: [string, CompositeArithmetic][] = [
  ["unfused", { kind: "nearest" }],
  ["fused contraction (first product operand)", { kind: "fused-contraction", choose: "first" }],
  ["fused contraction (random per site, seed 7)", { kind: "fused-contraction", choose: { seed: 7 } }]
];

const report: Record<string, unknown>[] = [];
afterAll(() => {
  if (!report.length) return;
  console.info(`[display-view-composite-contraction] ${JSON.stringify(report)}`);
  if (process.env.PHOTIVRA_REPORT_FILE) writeFileSync(process.env.PHOTIVRA_REPORT_FILE, JSON.stringify(report, null, 1));
});
function row(a: DisplayViewAgreement, flagged: number): Record<string, unknown> {
  return { flagged, flaggedFraction: flagged / a.pixels, deltaE2000Maximum: a.deltaEMaximum, deltaE2000Rms: a.deltaERms, sigmaUnitsMaximum: a.sigmaUnitsMaximum, sigmaRelativeMaximum: a.sigmaRelativeMaximum,
    differingSamples: a.differingSamples, largestCodeDifference: a.largestCodeDifference, largestExpectedBoundRatio: a.largestExpectedRatio, largestVarianceBoundRatio: a.largestVarianceRatio };
}

describe("display view with the composite material module under fused contraction (float32 emulation, 2.11.0)", () => {
  it.each(cases)("%s (Speed): the fma path under contraction renders inside the bounds and the #480 thresholds, as the Dekker path unfused", async (name, options, ceiling) => {
    const fixture = await displayViewGpuFixture(options, SMALL_VIEW), rows: Record<string, unknown> = {};
    let unfusedSamples: Uint8Array | Uint16Array | undefined;
    for (const [model, arithmetic] of MODELS) {
      const runtime = await runtimeOf(createFakeGpu({ compositeArithmetic: arithmetic }).gpu), module = await materialModuleOf(runtime, fixture.input.setup);
      const path = arithmetic.kind === "nearest" ? "dekker" : "fma";
      expect(module.id).toBe(chartCompositeMaterialModuleId(path));
      expect(module.compositeProbe).toMatchObject({ productPath: path, deviceClass: path === "dekker" ? "exact" : "contracted" });
      const gpu = await renderOnGpu(runtime, fixture), a = compareDisplayViews(fixture.cpu, gpu), { metrics, verdict } = acceptanceOf(fixture.viewWidth, fixture.viewHeight, fixture.cpu, gpu);
      rows[model] = { ...row(a, gpu.flaggedPixelIndices.length), acceptance: { withinFraction: metrics.withinFraction, maxDeltaE: metrics.maxDeltaE, maxSigma: metrics.maxSigma, pass: verdict.pass } };
      expect(a.outsideExpectedBound).toBe(0);
      expect(a.outsideVarianceBound).toBe(0);
      expect(a.largestCodeDifference).toBeLessThanOrEqual(1);
      expect(a.deltaEMaximum).toBeLessThan(0.01);
      expect(a.sigmaUnitsMaximum).toBeLessThan(0.01);
      expect(verdict.pass, JSON.stringify(verdict.checks)).toBe(true);
      expect(Array.from(gpu.hostRecomputedPixelIndices)).toEqual(Array.from(gpu.flaggedPixelIndices));
      for (const i of gpu.flaggedPixelIndices) for (let c = 0; c < 3; c++) expect(gpu.expected[3 * i + c]).toBe(fixture.cpu.expected[3 * i + c]);
      expect(gpu.flaggedPixelIndices.length / a.pixels).toBeLessThanOrEqual(ceiling);
      if (!unfusedSamples) unfusedSamples = gpu.samples;
      else {
        let differing = 0;
        for (let i = 0; i < gpu.samples.length; i++) if (gpu.samples[i] !== unfusedSamples[i]) differing++;
        (rows[model] as Record<string, unknown>).samplesDifferingFromUnfused = differing;
      }
      runtime.destroy();
    }
    report.push({ case: name + " (Speed)", pixels: fixture.viewWidth * fixture.viewHeight, ...rows });
  }, scaledTimeout(900_000));

  it("material-layers (Quality: diffraction, four-spot, AHD; and a fixed-size chart): the fma path under contraction stays inside the bounds", async () => {
    const qsensor = { ...sensor, antiAliasing: { kind: "four-spot" as const } }, qoutput = { ...output, demosaic: "ahd" as const }, region = { x: 50, y: 70, width: 48, height: 36 };
    const variants: [string, SimulateCaptureOptions][] = [
      ["material-layers, frame-filling, diffraction + four-spot + AHD", { scene: declared, lens: { ...lens, diffraction: "circular-aperture" }, sensor: qsensor, output: qoutput }],
      ["material-layers, fixed-size chart with surround, AHD without diffraction", { scene: declared, lens, sensor: qsensor, output: qoutput, ...placed }]
    ];
    for (const [name, options] of variants) {
      const fixture = await displayViewGpuFixture(options, { ...SMALL_VIEW, region }), rows: Record<string, unknown> = {};
      for (const [model, arithmetic] of MODELS.slice(0, 2)) {
        const runtime = await runtimeOf(createFakeGpu({ compositeArithmetic: arithmetic }).gpu);
        const module = await qualityMaterialModule(materialModulesOf(runtime), fixture.input.setup.gpu!, new AbortController().signal);
        expect(module.id).toBe(chartCompositeMaterialModuleId(arithmetic.kind === "nearest" ? "dekker" : "fma"));
        const gpu = await renderOnGpuQuality(runtime, fixture), a = compareDisplayViews(fixture.cpu, gpu);
        rows[model] = row(a, gpu.flaggedPixelIndices.length);
        expect(a.outsideExpectedBound).toBe(0);
        expect(a.outsideVarianceBound).toBe(0);
        expect(a.largestCodeDifference).toBeLessThanOrEqual(1);
        expect(a.deltaEMaximum).toBeLessThan(0.01);
        expect(a.sigmaUnitsMaximum).toBeLessThan(0.01);
        for (const i of gpu.flaggedPixelIndices) for (let c = 0; c < 3; c++) expect(gpu.expected[3 * i + c]).toBe(fixture.cpu.expected[3 * i + c]);
        runtime.destroy();
      }
      report.push({ case: name + " (Quality, 48 × 36 region)", ...rows });
    }
  }, scaledTimeout(900_000));

  it("through prepareDisplayView: the probe record is in diagnostics.fast.execution; a contracted device renders with the fma path, one with an unfused fma falls back (\"auto\") or fails (\"require\") saying why", async () => {
    const previous = registerDisplayViewGpuRenderer(), options = cases[1]![1];
    try {
      const exact = await prepareDisplayView(options, { gpu: "auto", gpuDevice: createFakeGpu().gpu });
      expect((await exact.render(SMALL_VIEW)).diagnostics.fast.execution.compositeProbe).toMatchObject({ deviceClass: "exact", productPath: "dekker", fmaFused: true });
      exact.dispose();
      const contracted = await prepareDisplayView(options, { gpu: "require", gpuDevice: createFakeGpu({ compositeArithmetic: MODELS[1]![1] }).gpu });
      const execution = (await contracted.render(SMALL_VIEW)).diagnostics.fast.execution;
      expect(execution).toMatchObject({ backend: "webgpu-f32", fallbackReason: null, compositeProbe: { deviceClass: "contracted", productPath: "fma", fmaFused: true } });
      expect(execution.compositeProbe!.mismatchCounts["double-word-multiply"]).toBeGreaterThan(0);
      contracted.dispose();
      const unfusedFma: CompositeArithmetic = { kind: "fused-contraction", choose: "first", fma: "unfused" };
      const fallback = await prepareDisplayView(options, { gpu: "auto", gpuDevice: createFakeGpu({ compositeArithmetic: unfusedFma }).gpu });
      const fell = (await fallback.render(SMALL_VIEW)).diagnostics.fast.execution;
      expect(fell).toMatchObject({ backend: "cpu-reference", fallbackReason: "unsupported-on-backend", compositeProbe: { deviceClass: "contracted", productPath: null, fmaFused: false } });
      expect(fell.limitations.join(" ")).toMatch(/class contracted, product path none, fma not fused/u);
      fallback.dispose();
      const required = await prepareDisplayView(options, { gpu: "require", gpuDevice: createFakeGpu({ compositeArithmetic: { kind: "reassociation" } }).gpu });
      const error = await required.render(SMALL_VIEW).then(() => null, (e: unknown) => e) as { reason?: string; message?: string; probe?: unknown };
      expect(error).toMatchObject({ reason: "unsupported-on-backend", probe: { deviceClass: "reassociated", productPath: null } });
      expect(error.message).toMatch(/class reassociated/u);
      required.dispose();
      // A 2.0 preset filling the frame never runs the probe.
      const preset = await prepareDisplayView({ scene: { preset: "checkerboard", squaresAcross: 12 }, lens, sensor, output }, { gpu: "require", gpuDevice: createFakeGpu({ compositeArithmetic: unfusedFma }).gpu });
      expect((await preset.render(SMALL_VIEW)).diagnostics.fast.execution).toMatchObject({ backend: "webgpu-f32", compositeProbe: null });
      preset.dispose();
      const off = await prepareDisplayView(options);
      expect((await off.render(SMALL_VIEW)).diagnostics.fast.execution.compositeProbe).toBeNull();
      off.dispose();
    } finally { setDisplayViewGpuRendererFactory(previous); }
  }, scaledTimeout(600_000));
});
