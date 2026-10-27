// SPDX-License-Identifier: Apache-2.0
/**
 * Composite chart radiance on the `webgpu-f32` stage (#477, fake device, float32 emulation of the composite
 * kernel): every unflagged query equals the float64 reference rounded once, the flagged fraction per
 * element is recorded (above 1 % is a finding), declared material-layers scenes resolve and run, the scene
 * records are uploaded once per scene, and the device probe refuses a reassociating device.
 */
import { afterAll, describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { calculateChartRadianceBatch, calculateChartRadianceBatchPlan, createImageKernelAccelerator, ImageKernelExecutionError, resolveChartMaterialLayers,
  resolveChartScene, type ChartScene } from "../src/index.js";
import { chartGeometry } from "../src/facade/chart-scenes.js";
import { shapeContains } from "../src/facade/chart-material-layers.js";
import { ChartSceneUploads, packChartScene, PROBE_INPUTS, probeExpectation, starSectorTable, twoProd, twoSum } from "../src/gpu/chart-composite-gpu.js";
import { createFakeGpu } from "./helpers/fake-webgpu.js";
import { setCompositeProbeCorruption } from "./helpers/fake-webgpu-composite.js";
import { allElementsComposite, compositeBatchInput, COMPOSITE_ELEMENTS, elementRect, FIXTURE_ASPECT, labelLayer, layeredScene, singleElementComposite, VIEW_SIZES,
  viewPoints } from "./helpers/chart-composite-fixtures.js";

const report: Record<string, unknown>[] = [];
afterAll(() => {
  if (!report.length) return;
  console.info(`[chart-composite] ${JSON.stringify(report)}`);
  if (process.env.PHOTIVRA_REPORT_FILE) writeFileSync(process.env.PHOTIVRA_REPORT_FILE, JSON.stringify(report, null, 1));
});

async function gpu(): Promise<Awaited<ReturnType<typeof createImageKernelAccelerator>>> {
  return createImageKernelAccelerator({ backend: "webgpu-f32", fallback: "fail", gpu: createFakeGpu().gpu });
}

/** Runs both query modes; every value must be the reference rounded once; returns the flagged fraction of the first `counted` points. */
async function conform(scene: ChartScene | ReturnType<typeof layeredScene>, points: Float64Array, counted = points.length / 2): Promise<{ flagged: number; recomputed: number }> {
  const a = await gpu();
  let fraction = 0, recomputed = 0;
  for (const mode of ["radiance", "spectral-integral"] as const) {
    const input = compositeBatchInput(scene, points, mode), reference = calculateChartRadianceBatch(input).values;
    const result = await a.evaluateChartRadiance(input);
    expect(result.execution.errorBound).toMatchObject({ kind: "relative-to-reference", relative: 2 ** -24 });
    for (let i = 0; i < reference.length; i++) if (result.values[i] !== Math.fround(reference[i]!)) expect.fail(`value ${i} in ${mode}: ${result.values[i]} vs ${reference[i]}`);
    const inCounted = Array.from(result.hostRecomputedQueryIndices).filter((q) => q < counted).length;
    fraction = Math.max(fraction, inCounted / counted);
    recomputed = result.hostRecomputedQueryIndices.length;
  }
  a.dispose();
  return { flagged: fraction, recomputed };
}

describe("composite chart elements on webgpu-f32 (fake device)", () => {
  it.each(COMPOSITE_ELEMENTS)("%s: unflagged points equal the reference; flagged fraction recorded", async (name, element) => {
    const scene = singleElementComposite(name), rect = elementRect(element);
    // Pixel centres of the 2028 × 1352 view inside the element (every 6th pixel) and random points inside it; then boundary-seeking points on the element's edges.
    const inside = viewPoints(FIXTURE_ASPECT, VIEW_SIZES.app, 6, rect, 2000, name.length), counted = inside.length / 2;
    const edges = Float64Array.from([rect.u0, (rect.v0 + rect.v1) / 2, rect.u1, rect.v1, element.centerU, rect.v0, element.centerU, element.centerV]);
    const points = Float64Array.from([...inside, ...edges]);
    const { flagged, recomputed } = await conform(scene, points, counted);
    report.push({ element: name, points: counted, flaggedFraction: flagged, recomputed });
    expect(flagged, `${name}: flagged fraction ${flagged} above 1 % is a finding`).toBeLessThanOrEqual(0.01);
  }, 120_000);

  it("the all-elements composite at the app's view size (every 7th pixel) and random frame points, per element", async () => {
    // Stride 7: no pixel centre of the view lies exactly on a star's diagonal sector boundary (those points are flagged by design, as the
    // coarse 192 × 128 view centred on the bar star shows: 72 of its 2700 star points lie on the 45° and 135° boundaries).
    const scene = allElementsComposite(), points = viewPoints(FIXTURE_ASPECT, VIEW_SIZES.app, 7, undefined, 4000, 7);
    const a = await gpu(), input = compositeBatchInput(scene, points, "radiance"), reference = calculateChartRadianceBatch(input).values;
    const result = await a.evaluateChartRadiance(input);
    for (let i = 0; i < reference.length; i++) expect(result.values[i]).toBe(Math.fround(reference[i]!));
    // Which element each point resolves to (the reference's own placement rule), for per-element fractions.
    const g = chartGeometry(resolveChartScene({ scene, aspect: FIXTURE_ASPECT }));
    if (g.kind !== "composite") throw new Error("composite expected");
    const owner = (u: number, v: number): number => {
      for (let i = g.elements.length - 1; i >= 0; i--) {
        const e = g.elements[i]!, du = u - e.cu, dv = v - e.cv;
        if (du < -e.hw || du > e.hw || dv < -e.hh || dv > e.hh) continue;
        if (e.ellipse && (du / e.hw) ** 2 + (dv / e.hh) ** 2 > 1) continue;
        return i;
      }
      return -1;
    };
    const total = new Map<number, number>(), flaggedBy = new Map<number, number>();
    for (let q = 0; q < points.length / 2; q++) { const o = owner(points[2 * q]!, points[2 * q + 1]!); total.set(o, (total.get(o) ?? 0) + 1); }
    for (const q of result.hostRecomputedQueryIndices) { const o = owner(points[2 * q]!, points[2 * q + 1]!); flaggedBy.set(o, (flaggedBy.get(o) ?? 0) + 1); }
    const rows = [...total.entries()].map(([o, n]) => ({ element: o < 0 ? "background" : COMPOSITE_ELEMENTS[o]![0], points: n, flaggedFraction: (flaggedBy.get(o) ?? 0) / n }));
    report.push({ composite: "all-elements", rows });
    for (const row of rows) expect(row.flaggedFraction, row.element).toBeLessThanOrEqual(0.01);
    a.dispose();
  }, 120_000);

  it("plain 2.3 element presets and the sine star run on the composite kernel", async () => {
    for (const scene of [{ preset: "zone-plate", maximumCyclesPerPictureHeight: 120 }, { preset: "siemens-star", profile: "sine", cycles: 12 }, { preset: "dead-leaves", radiusMinimum: 0.05 },
      { preset: "bar-groups" }, { preset: "hyperbolic-wedge", orientation: "vertical" }, { preset: "fiducial" }, { preset: "line-grid" }, { preset: "slanted-squares" }] as ChartScene[]) {
      const points = viewPoints(FIXTURE_ASPECT, VIEW_SIZES.coarse, 2, undefined, 500, 3);
      const { flagged } = await conform(scene, points);
      report.push({ plain: scene.preset, flaggedFraction: flagged });
      expect(flagged).toBeLessThanOrEqual(0.01);
    }
  }, 120_000);
});

describe("declared material-layers scenes", () => {
  it("resolve: the chart's materials first, then each layer's; the indexed mask test equals the full test; callerScene evaluates the same", () => {
    const scene = layeredScene(), resolved = resolveChartMaterialLayers({ scene, aspect: FIXTURE_ASPECT });
    const chart = resolveChartScene({ scene: scene.chart, aspect: FIXTURE_ASPECT });
    expect(resolved.materials.length).toBe(chart.materials.length + 2);
    expect(resolved.materials.slice(0, chart.materials.length)).toEqual(chart.materials);
    expect(resolved.callerScene.materials.length).toBe(resolved.materials.length);
    const layer = resolved.layers[0]!, r = layer.rectangle;
    let ink = 0;
    for (let k = 0; k < 20_000; k++) {
      const x = (k % 200) / 200 * layer.unitsWidth, y = Math.floor(k / 200) / 100 * layer.unitsHeight;
      const full = layer.shapes.some((s) => shapeContains(s, x, y));
      expect(layer.containsUnits(x, y)).toBe(full);
      if (full) ink++;
      const u = r.u0 + x / layer.scaleX, v = r.v1 - y / layer.scaleY, xx = (u - r.u0) * layer.scaleX, yy = (r.v1 - v) * layer.scaleY;
      expect(resolved.materialAt(u, v)).toBe(layer.containsUnits(xx, yy) ? layer.inkMaterial : layer.backgroundMaterial);
      expect(resolved.callerScene.materialAt({ xM: 0, yM: 0, u, v })).toBe(resolved.materialAt(u, v));
      expect(resolved.callerScene.materialAt({ xM: 0, yM: 0, u: 9, v: 9, chartU: u, chartV: v })).toBe(resolved.materialAt(u, v));
    }
    expect(ink).toBeGreaterThan(500);
    expect(resolved.materialAt(0.5, 0.5)).toBe(chart.materialAt(0.5, 0.5));
    // The batch reference uses the layered materialAt.
    const points = Float64Array.from([r.u0 + 0.01, r.v0 + 0.01, 0.5, 0.5]);
    const plan = calculateChartRadianceBatchPlan(compositeBatchInput(scene, points, "radiance"));
    expect(plan.layers).not.toBeNull();
    expect(plan.materials.length).toBe(resolved.materials.length);
  });
  it("rejects malformed scenes", () => {
    const base = layeredScene();
    const bad: unknown[] = [
      { ...base, kind: "layers" }, { ...base, sceneId: "" }, { ...base, layers: [] }, { ...base, extra: 1 },
      { ...base, layers: [{ ...labelLayer(FIXTURE_ASPECT), rectangle: { u0: 0, v0: 0, u1: 0, v1: 1 } }] },
      { ...base, layers: [{ ...labelLayer(FIXTURE_ASPECT), shapes: [] }] },
      { ...base, layers: [{ ...labelLayer(FIXTURE_ASPECT), shapes: [{ kind: "polygon", rings: [[0, 0, 1, 1]] }] }] },
      { ...base, layers: [{ ...labelLayer(FIXTURE_ASPECT), shapes: [{ kind: "annulus", centerX: 0, centerY: 0, innerRadius: 2, outerRadius: 1 }] }] },
      { ...base, layers: [{ ...labelLayer(FIXTURE_ASPECT), shapes: [{ kind: "disk", r: 1 }] }] },
      { ...base, layers: [{ ...labelLayer(FIXTURE_ASPECT), inkReflectance: 2 }] },
      { ...base, layers: [{ ...labelLayer(FIXTURE_ASPECT), shapes: [{ kind: "polygon", rings: [[0, 0, 1e12, 0, 0, 1]] }] }] }
    ];
    for (const scene of bad) expect(() => resolveChartMaterialLayers({ scene: scene as never, aspect: FIXTURE_ASPECT })).toThrow();
  });
  it("runs on webgpu-f32: the label layer and the composite under it; the label's flagged fraction at the app's view size is recorded", async () => {
    const scene = layeredScene(), r = labelLayer(FIXTURE_ASPECT).rectangle;
    const inside = viewPoints(FIXTURE_ASPECT, VIEW_SIZES.app, 2, r, 3000, 11), counted = inside.length / 2;
    const points = Float64Array.from([...inside, ...viewPoints(FIXTURE_ASPECT, VIEW_SIZES.coarse, 3, undefined, 500, 5)]);
    const { flagged } = await conform(scene, points, counted);
    report.push({ layer: "label", points: counted, flaggedFraction: flagged });
    expect(flagged).toBeLessThanOrEqual(0.01);
  }, 120_000);
});

describe("composite kernel host side", () => {
  it("packs every record kind; the star table's sectors carry the reference's levels and bracket every angle", () => {
    const plan = calculateChartRadianceBatchPlan(compositeBatchInput(layeredScene(), new Float64Array([0, 0]), "radiance"));
    const packed = packChartScene(plan);
    expect(packed.elementCount).toBe(COMPOSITE_ELEMENTS.length + 1);
    expect(packed.layerCount).toBe(1);
    expect(packed.materials).toBe(plan.materials.length);
    for (const [name] of COMPOSITE_ELEMENTS.filter(([n]) => n.startsWith("siemens"))) {
      const element = COMPOSITE_ELEMENTS.find(([n]) => n === name)![1], chart = resolveChartScene({ scene: element.scene, aspect: 1 }), g = chartGeometry(chart);
      if (g.kind !== "siemens-star") throw new Error("star expected");
      const table = starSectorTable(chart, g), n = table.thetas.length;
      expect(n).toBe(g.profile === "bar" ? 2 * g.cycles : 2046 * g.cycles);
      for (let k = 1; k < n; k++) expect(table.thetas[k]!).toBeGreaterThan(table.thetas[k - 1]!);
      // Each sector's level is the reference's at several radii and angles inside it.
      for (let k = 0; k < n; k += Math.max(1, Math.floor(n / 97))) {
        const next = k + 1 < n ? table.thetas[k + 1]! : table.thetas[0]! + 2 * Math.PI;
        for (const t of [0.25, 0.5, 0.75]) {
          const angle = table.thetas[k]! + (next - table.thetas[k]!) * t;
          expect(chart.materialAt(0.3 * g.r * Math.cos(angle), 0.3 * g.r * Math.sin(angle))).toBe(table.levels[k]);
        }
      }
      expect(table.window).toBeGreaterThanOrEqual(0);
    }
  });
  it("double-float32 building blocks: exact low parts; the probe expectations are the exact values", () => {
    expect(twoSum(1, 2 ** -30)).toEqual([1, 2 ** -30]);
    expect(twoProd(3, 2 ** -24 + 1)).toEqual([Math.fround(3 * (1 + 2 ** -24)), 3 * (1 + 2 ** -24) - Math.fround(3 * (1 + 2 ** -24))]);
    for (const row of PROBE_INPUTS) {
      const want = probeExpectation(row);
      expect(want.every(Number.isFinite)).toBe(true);
      expect(want.some((v) => v !== 0)).toBe(true);
    }
  });
  it("uploads a scene's records once and reuses them for later calls; a different scene or aspect uploads again; dispose releases them", async () => {
    const { gpu: fake, controls } = createFakeGpu();
    const a = await createImageKernelAccelerator({ backend: "webgpu-f32", fallback: "fail", gpu: fake });
    const scene = singleElementComposite("fiducial"), points = viewPoints(FIXTURE_ASPECT, VIEW_SIZES.coarse, 8);
    await a.evaluateChartRadiance(compositeBatchInput(scene, points, "radiance"));
    const after = controls.created;
    await a.evaluateChartRadiance(compositeBatchInput(scene, points, "spectral-integral"));
    const perCall = controls.created - after;
    await a.evaluateChartRadiance(compositeBatchInput(singleElementComposite("line-grid"), points, "radiance"));
    expect(controls.created - after - perCall).toBe(perCall + 2);
    await a.evaluateChartRadiance(compositeBatchInput(scene, points, "radiance", 0.75));
    expect(controls.created - after - 2 * perCall - 2).toBe(perCall + 2);
    a.dispose();
    expect(controls.liveBytes).toBe(0);
  });
  it("a device that reassociates the double-float32 arithmetic is refused with unsupported-on-backend; the preset kernel still runs", async () => {
    const { gpu: fake } = createFakeGpu();
    setCompositeProbeCorruption(true);
    const a = await createImageKernelAccelerator({ backend: "webgpu-f32", fallback: "fail", gpu: fake });
    const points = viewPoints(FIXTURE_ASPECT, VIEW_SIZES.coarse, 8);
    const error = await a.evaluateChartRadiance(compositeBatchInput(singleElementComposite("uniform"), points, "radiance")).then(() => null, (e: unknown) => e);
    expect(error).toBeInstanceOf(ImageKernelExecutionError);
    expect((error as ImageKernelExecutionError).reason).toBe("unsupported-on-backend");
    expect((error as ImageKernelExecutionError).message).toMatch(/double-float32/u);
    const preset = await a.evaluateChartRadiance(compositeBatchInput({ preset: "checkerboard" }, points, "radiance"));
    expect(preset.execution.backend).toBe("webgpu-f32");
    // The probe is retried once the device behaves.
    setCompositeProbeCorruption(false);
    expect((await a.evaluateChartRadiance(compositeBatchInput(singleElementComposite("uniform"), points, "radiance"))).execution.backend).toBe("webgpu-f32");
    a.dispose();
    expect(new ChartSceneUploads({ maximumStorageBindingBytes: 1 } as never).size).toBe(0);
  });
  it("refuses points beyond 2^20 frame units and reports an element's records that exceed the device's binding limit", async () => {
    const { gpu: fake } = createFakeGpu();
    const a = await createImageKernelAccelerator({ backend: "webgpu-f32", fallback: "fail", gpu: fake });
    // The records are checked against the device's binding limit before any upload (a runtime stand-in with a tiny limit).
    const plan = calculateChartRadianceBatchPlan(compositeBatchInput(singleElementComposite("dead-leaves"), new Float64Array([0, 0]), "radiance"));
    const uploads = new ChartSceneUploads({ maximumStorageBindingBytes: 1024 } as never);
    expect(() => uploads.get(plan, plan.chart, FIXTURE_ASPECT)).toThrow(/binding limit/u);
    expect(packChartScene(plan).af.byteLength).toBeGreaterThan(1024);
    const far = await a.evaluateChartRadiance(compositeBatchInput(singleElementComposite("uniform"), new Float64Array([2 ** 21, 0]), "radiance")).then(() => null, (e: unknown) => e);
    expect((far as ImageKernelExecutionError).reason).toBe("unsupported-float32-domain");
    a.dispose();
  });
});
