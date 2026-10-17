// SPDX-License-Identifier: Apache-2.0
/**
 * Chart scenes and query points for the chart-radiance stage: every built-in preset with non-default
 * parameters, random frame points, and adversarial points placed on (or within 1e-12 of) each preset's
 * classification boundaries. Declared test values.
 */
import { calculatePointGridCenters, calculateStepWedgeReflectances, type ChartRadianceBatchInput, type ChartScene } from "../../src/index.js";
import { corpusRandom } from "./sensor-stage-fixtures.js";

const ramp = (a: number, b: number): { kind: "tabulated"; samples: { wavelengthNanometers: number; value: number }[] } =>
  ({ kind: "tabulated", samples: [380, 480, 580, 680, 780].map((w, i) => ({ wavelengthNanometers: w, value: a + (b - a) * i / 4 })) });

/** One scene per built-in preset (aspect 2/3 frames). */
export const CHART_PRESET_SCENES: readonly [string, ChartScene][] = [
  ["uniform", { preset: "uniform", reflectance: ramp(0.2, 0.7) }],
  ["slanted-edge", { preset: "slanted-edge", angleDegrees: 5 }],
  ["siemens-star", { preset: "siemens-star", cycles: 36 }],
  ["step-wedge", { preset: "step-wedge", steps: 11 }],
  ["grey-ramp", { preset: "grey-ramp" }],
  ["checkerboard", { preset: "checkerboard", squaresAcross: 12 }],
  ["point-grid", { preset: "point-grid", columns: 7, rows: 5, radius: 0.04 }],
  ["patches", { preset: "patches", columns: 4, patches: Array.from({ length: 10 }, (_, i) => ({ patchId: `p${i}`,
    reflectance: i % 3 === 0 ? ramp(0.05 + 0.08 * i, 0.9 - 0.07 * i) : 0.04 + 0.09 * i })) }]
];

/** Points exactly on (and 1e-12 either side of) each preset's boundaries. */
function boundaryPoints(scene: ChartScene, aspect: number, random: () => number): number[] {
  const out: number[] = [], near = (u: number, v: number): void => { for (const e of [0, 1e-12, -1e-12]) out.push(u + e, v - e); };
  switch (scene.preset) {
    case "slanted-edge": {
      const t = (scene.angleDegrees ?? 5) * Math.PI / 180;
      for (let k = 0; k < 40; k++) { const v = aspect * (2 * random() - 1); near(v * Math.sin(t) / Math.cos(t), v); }
      break;
    }
    case "siemens-star": {
      const cycles = scene.cycles ?? 36, r = 0.9 * aspect;
      for (let k = 0; k <= 2 * cycles; k++) { const b = Math.PI * (k / cycles - 1), rho = r * random(); near(rho * Math.cos(b), rho * Math.sin(b)); }
      for (let k = 0; k < 20; k++) { const a = 2 * Math.PI * random(); near(r * Math.cos(a), r * Math.sin(a)); }
      near(0, 0); out.push(-0.5, 0, -0.5, -0);
      break;
    }
    case "step-wedge": for (let k = 0; k <= (scene.steps ?? 11); k++) near(2 * k / (scene.steps ?? 11) - 1, random()); break;
    case "grey-ramp": for (let k = 0; k <= 1024; k += 37) near(2 * k / 1024 - 1, random()); break;
    case "checkerboard": {
      const n = scene.squaresAcross ?? 8, size = 2 / n;
      for (let k = 0; k <= n; k++) { near(-1 + k * size, aspect * (2 * random() - 1)); near(2 * random() - 1, aspect - k * size); }
      break;
    }
    case "point-grid": {
      const columns = scene.columns ?? 5, rows = scene.rows ?? 3, radius = scene.radius ?? 0.01;
      for (const c of calculatePointGridCenters({ columns, rows, aspect })) { const a = 2 * Math.PI * random(); near(c.u + radius * Math.cos(a), c.v + radius * Math.sin(a)); }
      for (let k = 0; k <= columns; k++) near(-1 + 2 * k / columns, 0.3);
      break;
    }
    case "patches": {
      const count = scene.patches.length, columns = scene.columns ?? Math.ceil(Math.sqrt(count)), rows = Math.ceil(count / columns), gap = 0.1;
      const cw = 2 / columns, ch = 2 * aspect / rows;
      for (let i = 0; i <= columns; i++) for (const g of [0, gap / 2, 1 - gap / 2]) near(-1 + (i + g) * cw, aspect - 0.5 * ch);
      for (let j = 0; j <= rows; j++) for (const g of [0, gap / 2, 1 - gap / 2]) near(-1 + 0.5 * cw, aspect - (j + g) * ch);
      break;
    }
    default: break;
  }
  return out;
}

/** Random frame points (with a 20 % margin outside the frame) followed by boundary points. */
export function chartPoints(scene: ChartScene, aspect: number, count: number, seed: number): Float64Array {
  const random = corpusRandom(seed), values: number[] = [];
  for (let i = 0; i < count; i++) values.push(2.4 * random() - 1.2, aspect * (2.4 * random() - 1.2));
  values.push(...boundaryPoints(scene, aspect, random));
  return Float64Array.from(values);
}

/** Spectral integration against three smooth synthetic channel weights over 21 wavelengths (declared test values). */
export function chartBatchInput(scene: ChartScene, points: Float32Array | Float64Array, mode: "radiance" | "spectral-integral"): ChartRadianceBatchInput {
  const wavelengths = Array.from({ length: 21 }, (_, j) => 380 + 20 * j), queries = points.length / 2;
  const base = { schemaVersion: "0.1.0" as const, scene, illuminant: { kind: "planckian" as const, temperatureKelvin: 5000 }, illuminanceLux: 1000, aspect: 2 / 3,
    points, wavelengthsNanometers: wavelengths };
  if (mode === "radiance") return { ...base, wavelengthIndices: Uint16Array.from({ length: queries }, (_, i) => (i * 7) % wavelengths.length) };
  const channel = (centre: number): number[] => wavelengths.map(nm => 20 * Math.exp(-0.5 * ((nm - centre) / 40) ** 2));
  return { ...base, channelWeights: [channel(600), channel(540), channel(450)] };
}

export { calculateStepWedgeReflectances };
