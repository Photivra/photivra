// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { InvalidConfigurationError, createPlanarSceneRadianceProvider, simulateCapture, type ScenePlanePoint } from "../src/index.js";

// 64 × 48 sites of 6 µm: a 0.384 mm wide sensor. A 50 mm lens frames exactly W metres at d = f·(1 + W/0.384 mm) (thin lens).
const f = 50, sensorWidthMm = 64 * 6 / 1000;
const fitDistance = (widthM: number): number => f * (1 + widthM * 1000 / sensorWidthMm) / 1000;

describe("fixed-size chart placement (2.3)", () => {
  it("reports framing, coverage and magnification and places the chart at its physical size", async () => {
    const widthM = 0.042, d = fitDistance(widthM);
    const fit = await simulateCapture({ scene: { preset: "slanted-edge" }, subjectDistanceM: d, chartSize: { widthM }, output: { width: 64, height: 48 } });
    const chart = fit.scene.chart!;
    expect(chart.frameWidthFraction).toBeCloseTo(1, 12);
    expect(chart.frameHeightFraction).toBeCloseTo(1, 12);
    expect(chart.heightM).toBeCloseTo(widthM * 0.75, 15);
    expect(chart.magnification).toBeCloseTo(sensorWidthMm / (widthM * 1000), 12);
    expect(chart.imageWidthPixels).toBeCloseTo(64, 9);
    expect(fit.assumptions.map((a) => a.id)).toEqual(expect.arrayContaining(["chartSize.heightM", "chartSize.surroundReflectance", "scene.chartSize"]));
    // Twice as far: the chart covers half the frame width, and the corners show the 18 % surround.
    const far = await simulateCapture({ scene: { preset: "slanted-edge" }, subjectDistanceM: 2 * d - f / 1000, chartSize: { widthM }, output: { width: 64, height: 48 } });
    expect(far.scene.chart!.frameWidthFraction).toBeCloseTo(0.5, 6);
    const grey = await simulateCapture({ scene: { preset: "uniform" }, subjectDistanceM: 2 * d - f / 1000, output: { width: 64, height: 48 } });
    for (const [x, y] of [[0, 0], [63, 0], [2, 45], [63, 47]]) for (let c = 0; c < 3; c++) {
      const i = (y! * 64 + x!) * 3 + c;
      expect(far.image.samples[i]).toBe(grey.image.samples[i]);
    }
    // The edge stays at the centre and the chart's left (dark) side ends a quarter frame left of centre.
    const row = (y: number, x: number): number => far.image.samples[(y * 64 + x) * 3 + 1]!;
    expect(row(24, 20)).toBeLessThan(row(24, 10));
    expect(row(24, 44)).toBeGreaterThan(row(24, 54));
    expect(far.scene.sourceSha256).not.toBe((await simulateCapture({ scene: { preset: "slanted-edge" }, subjectDistanceM: 2 * d - f / 1000, output: { width: 64, height: 48 } })).scene.sourceSha256);
  });

  it("passes chart-local coordinates to caller functions only on the chart", async () => {
    const seen: ScenePlanePoint[] = [];
    const r = await simulateCapture({ scene: { kind: "reflectance-function", sceneId: "local", evaluate: (p) => { seen.push(p); return 0.5; } }, subjectDistanceM: 10,
      chartSize: { widthM: 0.05, heightM: 0.02, surroundReflectance: 0.3 }, output: { width: 16, height: 12 } });
    expect(seen.length).toBeGreaterThan(0);
    for (const p of seen) {
      expect(Math.abs(p.chartU!)).toBeLessThanOrEqual(1);
      expect(Math.abs(p.chartV!)).toBeLessThanOrEqual(0.4);
      expect(p.chartU! * 0.025).toBeCloseTo(p.xM, 12);
    }
    expect(r.scene.chart).toMatchObject({ widthM: 0.05, heightM: 0.02, surroundReflectance: 0.3 });
  });

  it("works with the public provider and validates the option", () => {
    const base = { illuminant: { kind: "planckian" as const, temperatureKelvin: 5000 }, illuminanceLux: 1000, distanceM: 2, framedWidthM: 2, aspect: 0.5, sceneId: "c", providerProfileId: "p" };
    const p = createPlanarSceneRadianceProvider({ ...base, scene: { preset: "checkerboard", squaresAcross: 2 }, chartSize: { widthM: 1, surroundReflectance: 0 } });
    expect(p.chart!.aspect).toBe(0.5);
    expect(p.radianceAt(0.9, 0, 550)).toBe(0); // 0.9 m from the axis, outside the 1 m chart
    expect(p.radianceAt(-0.4, 0.2, 550)).toBeGreaterThan(0);
    for (const chartSize of [{ widthM: 0 }, { widthM: 1, heightM: -1 }, { widthM: 1, surroundReflectance: 2 }, { widthM: 1, depthM: 1 }])
      expect(() => createPlanarSceneRadianceProvider({ ...base, scene: { preset: "uniform" }, chartSize } as never)).toThrow(InvalidConfigurationError);
  });
});
