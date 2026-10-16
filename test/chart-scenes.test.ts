// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { CHART_SCENE_PRESETS, InvalidConfigurationError, calculatePointGridCenters, calculateStepWedgeReflectances, createPlanarSceneRadianceProvider,
  estimateCie1931ColorMatchingFunctions, resolveCaptureIlluminant, resolveChartScene, type SceneRadianceEvaluationRequest } from "../src/index.js";

const request = (outgoing: { x: number; y: number; z: number }, nm = 550): SceneRadianceEvaluationRequest => ({ schemaVersion: "0.1.0", sampleId: "s",
  providerProfileId: "p", sceneId: "chart", illuminationProfileId: "l", materialResponseProfileId: "m",
  target: { kind: "environment-direction", outgoingDirectionUnitVector: outgoing }, timeSecondsFromExposureStart: 0, wavelengthNanometers: nm, wavelengthBasis: "vacuum" });

describe("procedural chart presets", () => {
  it("lists every preset and resolves defaults explicitly", () => {
    expect(CHART_SCENE_PRESETS).toEqual(["uniform", "slanted-edge", "siemens-star", "step-wedge", "grey-ramp", "checkerboard", "point-grid", "patches"]);
    const edge = resolveChartScene({ scene: { preset: "slanted-edge" }, aspect: 1 });
    expect(edge.parameters).toEqual({ angleDegrees: 5, darkReflectance: 0.15, lightReflectance: 0.6 });
    expect(edge.defaultedParameters).toEqual(["angleDegrees", "darkReflectance", "lightReflectance"]);
    expect(resolveChartScene({ scene: { preset: "slanted-edge", angleDegrees: 5 }, aspect: 1 }).defaultedParameters).not.toContain("angleDegrees");
  });

  it("places the slanted edge at u = v·tan(angle) with the light side on the right", () => {
    for (const angle of [5, -5, 12.5]) {
      const chart = resolveChartScene({ scene: { preset: "slanted-edge", angleDegrees: angle }, aspect: 0.75 }), t = Math.tan(angle * Math.PI / 180);
      for (const v of [-0.7, -0.2, 0, 0.3, 0.74]) {
        const edge = v * t;
        expect(chart.reflectanceAt(edge + 1e-9, v, 550)).toBe(0.6);
        expect(chart.reflectanceAt(edge - 1e-6, v, 550)).toBe(0.15);
      }
    }
    expect(() => resolveChartScene({ scene: { preset: "slanted-edge", angleDegrees: 45 }, aspect: 1 })).toThrow(InvalidConfigurationError);
  });

  it("alternates Siemens star sectors 2·cycles times around a circle and uses the background outside", () => {
    const chart = resolveChartScene({ scene: { preset: "siemens-star", cycles: 12 }, aspect: 0.5 });
    let transitions = 0, previous = chart.reflectanceAt(0.2 * Math.cos(0.01), 0.2 * Math.sin(0.01), 550);
    for (let i = 1; i <= 3600; i++) {
      const a = 0.01 + i / 3600 * 2 * Math.PI, value = chart.reflectanceAt(0.2 * Math.cos(a), 0.2 * Math.sin(a), 550);
      if (value !== previous) transitions++;
      previous = value;
    }
    expect(transitions).toBe(24);
    expect(chart.reflectanceAt(0.9, 0, 550)).toBe(0.18); // radius = 0.9 · 0.5
  });

  it("spaces step-wedge reflectances by equal density or linearly", () => {
    const d = calculateStepWedgeReflectances({ steps: 5, minimumReflectance: 0.01, maximumReflectance: 1, spacing: "equal-density" });
    expect(d.map((r) => -Math.log10(r))).toEqual([2, 1.5, 1, 0.5, 0].map((x, i) => expect.closeTo(i === 4 ? 0 : x, 12)));
    expect(calculateStepWedgeReflectances({ steps: 3, minimumReflectance: 0.1, maximumReflectance: 0.9, spacing: "linear" })).toEqual([0.1, 0.5, 0.9]);
    const chart = resolveChartScene({ scene: { preset: "step-wedge", steps: 4 }, aspect: 1 });
    const steps = chart.parameters.stepReflectances as number[];
    expect([-0.9, -0.4, 0.1, 0.6].map((u) => chart.reflectanceAt(u, 0, 550))).toEqual(steps);
    expect(() => calculateStepWedgeReflectances({ steps: 3, minimumReflectance: 0, maximumReflectance: 1, spacing: "equal-density" })).toThrow(InvalidConfigurationError);
  });

  it("ramps grey linearly and lays out checkerboards and point grids exactly", () => {
    const ramp = resolveChartScene({ scene: { preset: "grey-ramp", minimumReflectance: 0, maximumReflectance: 1 }, aspect: 1 });
    expect(ramp.reflectanceAt(0, 0, 550)).toBeCloseTo(0.5, 2);
    expect(ramp.reflectanceAt(-0.999, 0, 550)).toBeLessThan(0.001);
    const checker = resolveChartScene({ scene: { preset: "checkerboard", squaresAcross: 4 }, aspect: 0.5 });
    expect([checker.reflectanceAt(-0.9, 0.4, 550), checker.reflectanceAt(-0.4, 0.4, 550), checker.reflectanceAt(-0.9, -0.1, 550)]).toEqual([0.8, 0.05, 0.05]);
    const centers = calculatePointGridCenters({ columns: 2, rows: 2, aspect: 1 });
    expect(centers).toEqual([{ u: -0.5, v: 0.5 }, { u: 0.5, v: 0.5 }, { u: -0.5, v: -0.5 }, { u: 0.5, v: -0.5 }]);
    const grid = resolveChartScene({ scene: { preset: "point-grid", columns: 2, rows: 2, radius: 0.05 }, aspect: 1 });
    expect(grid.reflectanceAt(0.5, -0.5, 550)).toBe(0.9);
    expect(grid.reflectanceAt(0.56, -0.5, 550)).toBe(0.02);
  });

  it("uses caller patch spectra without bundling chart data", () => {
    const red = { kind: "tabulated" as const, samples: [{ wavelengthNanometers: 380, value: 0.05 }, { wavelengthNanometers: 600, value: 0.05 }, { wavelengthNanometers: 620, value: 0.7 }, { wavelengthNanometers: 780, value: 0.7 }] };
    const chart = resolveChartScene({ scene: { preset: "patches", patches: [{ patchId: "red", reflectance: red }, { patchId: "grey", reflectance: 0.2 }] }, aspect: 0.5 });
    expect(chart.parameters).toMatchObject({ columns: 2, rows: 1, patchIds: ["red", "grey"] });
    expect(chart.reflectanceAt(-0.5, 0, 700)).toBeCloseTo(0.7, 12);
    expect(chart.reflectanceAt(0.5, 0, 700)).toBe(0.2);
    expect(chart.reflectanceAt(0, 0, 700)).toBe(0.18); // gap between patches
    const short = { kind: "tabulated" as const, samples: [{ wavelengthNanometers: 400, value: 0.5 }, { wavelengthNanometers: 700, value: 0.5 }] };
    for (const bad of [[{ patchId: "a", reflectance: short }], [{ patchId: "a", reflectance: 1.2 }], [{ patchId: "a", reflectance: 0.1 }, { patchId: "a", reflectance: 0.2 }], []])
      expect(() => resolveChartScene({ scene: { preset: "patches", patches: bad }, aspect: 1 })).toThrow(InvalidConfigurationError);
  });

  it("rejects unknown presets, unknown parameters and invalid reflectances", () => {
    expect(() => resolveChartScene({ scene: { preset: "colorchecker" } as never, aspect: 1 })).toThrow(InvalidConfigurationError);
    expect(() => resolveChartScene({ scene: { preset: "uniform", reflectence: 0.2 } as never, aspect: 1 })).toThrow("Unknown chart parameter");
    expect(() => resolveChartScene({ scene: { preset: "uniform", reflectance: -0.1 }, aspect: 1 })).toThrow(InvalidConfigurationError);
    expect(() => resolveChartScene({ scene: { preset: "uniform" }, aspect: 0 })).toThrow(InvalidConfigurationError);
  });
});

describe("planar scene radiance provider", () => {
  const base = { illuminant: { kind: "planckian" as const, temperatureKelvin: 5000 }, illuminanceLux: 10_000, distanceM: 4, framedWidthM: 2, aspect: 0.5,
    sceneId: "chart", providerProfileId: "p" };

  it("returns Lambertian radiance ρE/π whose luminance matches the declared illuminance", () => {
    const provider = createPlanarSceneRadianceProvider({ ...base, scene: { preset: "uniform", reflectance: 0.5 } });
    let luminance = 0;
    for (let nm = 380; nm <= 780; nm++) luminance += (nm === 380 || nm === 780 ? 0.5 : 1) * provider.radianceAt(0, 0, nm) * estimateCie1931ColorMatchingFunctions(nm).y;
    expect(683 * luminance).toBeCloseTo(0.5 * 10_000 / Math.PI, 6);
  });

  it("maps query directions and pupil rays onto the plane", () => {
    const provider = createPlanarSceneRadianceProvider({ ...base, scene: { kind: "reflectance-function", sceneId: "left", evaluate: (p) => (p.xM < -0.5 ? 1 : 0) } });
    const look = (x: number) => { const n = Math.hypot(x, 1); return { x: -x / n, y: 0, z: -1 / n }; };
    // A look direction (x, 0, 1) meets the plane at x·4 m; the plane point is u = x·4/1.
    expect(provider.evaluateRadiance(request(look(-0.2))).spectralRadianceWattsPerSquareMeterSteradianNanometer).toBeGreaterThan(0);
    expect(provider.evaluateRadiance(request(look(-0.1))).spectralRadianceWattsPerSquareMeterSteradianNanometer).toBe(0);
    const ray = { originM: { x: -0.4, y: 0, z: 0 }, directionUnitVector: { x: -0.05 / Math.hypot(0.05, 1), y: 0, z: 1 / Math.hypot(0.05, 1) }, pupilPointMm: { x: -400, y: 0 }, weight: 1, pupilSampleIndex: 0 };
    expect(provider.evaluateApertureRadiance(request(look(0)), ray).spectralRadianceWattsPerSquareMeterSteradianNanometer).toBeGreaterThan(0); // -0.4 - 0.2 = -0.6 m
    expect(() => provider.evaluateRadiance(request({ x: 0, y: 0, z: 1 }))).toThrow(InvalidConfigurationError);
  });

  it("validates illuminants and caller functions", () => {
    expect(resolveCaptureIlluminant("cie-a").id).toBe("cie-a");
    expect(() => resolveCaptureIlluminant({ kind: "planckian", temperatureKelvin: 500 })).toThrow(InvalidConfigurationError);
    expect(() => resolveCaptureIlluminant({ kind: "d65" } as never)).toThrow(InvalidConfigurationError);
    expect(() => resolveCaptureIlluminant({ kind: "spectrum", spectrum: { kind: "tabulated", samples: [{ wavelengthNanometers: 400, value: 1 }, { wavelengthNanometers: 700, value: 1 }] } })).toThrow("380-780");
    expect(() => resolveCaptureIlluminant({ kind: "spectrum", spectrum: { kind: "function", wavelengthRangeNanometers: { minimum: 380, maximum: 780 }, evaluate: () => -1 } })).toThrow("non-negative");
    const bad = createPlanarSceneRadianceProvider({ ...base, scene: { kind: "reflectance-function", sceneId: "x", evaluate: () => 2 } });
    expect(() => bad.radianceAt(0, 0, 550)).toThrow(InvalidConfigurationError);
    const radiance = createPlanarSceneRadianceProvider({ ...base, scene: { kind: "radiance-function", sceneId: "x", evaluate: (p) => p.wavelengthNanometers * 1e-6 } });
    expect(radiance.radianceAt(0, 0, 500)).toBeCloseTo(5e-4, 15);
    expect(() => createPlanarSceneRadianceProvider({ ...base, scene: { kind: "radiance-function", sceneId: "x" } as never })).toThrow(InvalidConfigurationError);
    expect(() => createPlanarSceneRadianceProvider({ ...base, distanceM: 0, scene: { preset: "uniform" } })).toThrow(InvalidConfigurationError);
  });
});
