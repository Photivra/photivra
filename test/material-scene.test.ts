// SPDX-License-Identifier: Apache-2.0
/**
 * #386: a caller material scene (materials and a materialAt function) renders like the same scene as a reflectance function in
 * captures and ideal references (the same radiance per point), and the display view takes the chart preset's material path:
 * a material scene that reproduces a preset gives the preset's view bytes.
 */
import { describe, expect, it } from "vitest";
import { InvalidConfigurationError, resolveChartScene, simulateCapture, simulateDisplayView, simulateIdealReference, type CallerMaterialScene,
  type CallerReflectanceScene, type ChartScene, type SimulateCaptureOptions } from "../src/index.js";
import { simulateDisplayViewWithInternals } from "../src/facade/simulate-display-view.js";
import { scaledTimeout as testTimeout } from "./helpers/test-timeout.js";

const STAR: ChartScene = { preset: "siemens-star", cycles: 24 };
/** A chart preset as a material scene and as a reflectance function, both from the engine's own resolved chart. */
function asCallerScenes(preset: ChartScene, aspect: number): { materials: CallerMaterialScene; reflectance: CallerReflectanceScene } {
  const chart = resolveChartScene({ scene: preset, aspect });
  const reflectances = chart.materials.map((m) => (m.kind === "neutral" ? m.reflectance : 0));
  return {
    materials: { kind: "material-function", sceneId: "star-materials", materials: reflectances, materialAt: (p) => chart.materialAt(p.chartU ?? p.u, p.chartV ?? p.v) },
    reflectance: { kind: "reflectance-function", sceneId: "star-function", evaluate: (p) => reflectances[chart.materialAt(p.chartU ?? p.u, p.chartV ?? p.v)]! }
  };
}
const base = (scene: SimulateCaptureOptions["scene"], extra: Partial<SimulateCaptureOptions> = {}): SimulateCaptureOptions =>
  ({ scene, sensor: { pixelPitchMicrometers: 3, pixelAperture: { kind: "box", samplesPerAxis: 2 } }, output: { width: 96, height: 64 }, ...extra });

describe("caller material scenes (#386)", () => {
  it("captures and ideal references equal the same scene as a reflectance function", async () => {
    const { materials, reflectance } = asCallerScenes(STAR, 2 / 3);
    for (const extra of [{}, { lens: { diffraction: "circular-aperture" as const }, output: { width: 48, height: 32, demosaic: "ahd" as const } }]) {
      const a = await simulateCapture(base(materials, extra)), b = await simulateCapture(base(reflectance, extra));
      expect(Array.from(a.image.samples)).toEqual(Array.from(b.image.samples));
      expect(a.scene.preset).toBe("material-function");
      expect(a.assumptions.find((x) => x.id === "scene.digest")?.explanation).toContain("materials");
    }
    const ra = await simulateIdealReference(base(materials)), rb = await simulateIdealReference(base(reflectance));
    expect(Array.from(ra.image.samples)).toEqual(Array.from(rb.image.samples));
  }, testTimeout(120_000));

  it("display views take the chart path: the preset's bytes, and the reflectance function's values to rounding", async () => {
    const { materials, reflectance } = asCallerScenes(STAR, 2 / 3);
    for (const extra of [{}, { lens: { fNumber: 11, diffraction: "circular-aperture" as const }, sensor: { pixelPitchMicrometers: 3, antiAliasing: { kind: "four-spot" as const } } }]) {
      const view = { width: 60, height: 40 };
      const m = await simulateDisplayViewWithInternals(base(materials, extra), view), p = await simulateDisplayViewWithInternals(base(STAR, extra), view);
      expect(Array.from(m.result.image.samples)).toEqual(Array.from(p.result.image.samples));
      expect(Array.from(m.internals.expected)).toEqual(Array.from(p.internals.expected));
      expect(m.result.diagnostics.sceneLookups).toBe(p.result.diagnostics.sceneLookups);
      // Against the radiance path the same quantities are summed in another order: equal to rounding.
      const r = await simulateDisplayViewWithInternals(base(reflectance, extra), view);
      for (let i = 0; i < r.internals.expected.length; i++) expect(Math.abs(m.internals.expected[i]! - r.internals.expected[i]!)).toBeLessThanOrEqual(1e-12 * Math.max(1e-3, Math.abs(r.internals.expected[i]!)));
      expect(m.result.diagnostics.sceneLookups).toBeLessThan(r.result.diagnostics.sceneLookups);
    }
  }, testTimeout(120_000));

  it("passes chart-local points on a fixed-size chart and uses the surround off it", async () => {
    const seen: { chartU?: number; xM: number }[] = [];
    const scene: CallerMaterialScene = { kind: "material-function", sceneId: "halves", materials: [0.1, 0.7],
      materialAt: (p) => { if (seen.length < 4) seen.push(p); return p.chartU! < 0 ? 0 : 1; } };
    const options = base(scene, { chartSize: { widthM: 0.5, surroundReflectance: 0.3 }, subjectDistanceM: 5 });
    const view = await simulateDisplayView(options, { width: 24, height: 16 });
    expect(seen.length).toBeGreaterThan(0);
    for (const p of seen) { expect(p.chartU).toBeDefined(); expect("wavelengthNanometers" in p).toBe(false); }
    const capture = await simulateCapture({ ...options, scene: { kind: "reflectance-function", sceneId: "halves-f", evaluate: (p) => (p.chartU! < 0 ? 0.1 : 0.7) } });
    expect(view.image.width).toBe(24);
    expect(capture.image.width).toBe(96);
  }, testTimeout(60_000));

  it("refuses malformed material scenes and indices", async () => {
    const ok: CallerMaterialScene = { kind: "material-function", sceneId: "m", materials: [0.2, 0.5], materialAt: () => 0 };
    for (const bad of [{ ...ok, materials: [] }, { ...ok, materials: [1.5] }, { ...ok, materials: "x" }, { ...ok, materialAt: undefined }, { ...ok, sceneId: "bad id" },
      { ...ok, evaluate: (): number => 0 }, { ...ok, materials: Array.from({ length: 65_537 }, () => 0.5) }])
      await expect(simulateCapture(base(bad as never))).rejects.toThrow(InvalidConfigurationError);
    for (const index of [2, -1, 0.5, Number.NaN]) {
      await expect(simulateCapture(base({ ...ok, materialAt: () => index }))).rejects.toThrow(InvalidConfigurationError);
      await expect(simulateDisplayView(base({ ...ok, materialAt: () => index }), { width: 8, height: 8 })).rejects.toThrow(InvalidConfigurationError);
    }
  }, testTimeout(60_000));
});
