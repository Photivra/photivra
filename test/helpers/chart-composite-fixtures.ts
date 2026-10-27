// SPDX-License-Identifier: Apache-2.0
/**
 * Composite-chart fixtures for the composite chart kernel (#477): one element of every kind placed as an
 * application would place it (declared test values in the engine's own generic elements, not an
 * application's layout), an all-elements composite, synthetic shape-mask layers (flattened curves, a
 * rectangle union and an annulus, like a printed label's glyphs and strokes), and query points at a
 * display view's pixel centres (2028 × 1352 and 192 × 128).
 */
import type { ChartElementScene, ChartMaskLayer, ChartMaskShape, ChartMaterialLayerScene, ChartRadianceBatchInput, ChartScene, CompositeChartElement } from "../../src/index.js";
import { corpusRandom } from "./sensor-stage-fixtures.js";

export const VIEW_SIZES = Object.freeze({ app: { width: 2028, height: 1352 }, coarse: { width: 192, height: 128 } });
export const FIXTURE_ASPECT = 2 / 3;

const FIELD = 0.6, EDGE_DARK = 0.15, MID = 0.18, INK = 0.05, PLATE = 0.8;
const square = (u: number, v: number, side: number, angle: number): CompositeChartElement =>
  ({ scene: { preset: "slanted-squares", columns: 1, rows: 1, sizeFraction: 0.5, angleDegrees: angle, darkReflectance: EDGE_DARK, lightReflectance: FIELD }, centerU: u, centerV: v, width: 2 * side, height: 2 * side });

/** One element per kind, each at a placement of the kind an application uses (the aspect is 2/3). */
export const COMPOSITE_ELEMENTS: readonly [string, CompositeChartElement][] = [
  ["uniform", { scene: { preset: "uniform", reflectance: MID }, centerU: 0.04, centerV: -0.6, width: 0.99, height: 0.15 }],
  ["step-wedge", { scene: { preset: "step-wedge", steps: 12, minimumReflectance: 0.03, maximumReflectance: 0.9 }, centerU: 0.04, centerV: -0.6, width: 0.96, height: 0.12 }],
  ["point-grid", { scene: { preset: "point-grid", columns: 5, rows: 1, radius: 0.012 * 2 / 0.34, pointReflectance: 0.9, backgroundReflectance: 0.02 }, centerU: 0.77, centerV: -0.4, width: 0.34, height: 0.12 }],
  ["zone-plate", { scene: { preset: "zone-plate", radiusFraction: 1 / 1.08, maximumCyclesPerPictureHeight: 347, darkReflectance: 0.1, lightReflectance: 0.7, backgroundReflectance: MID },
    centerU: 0.76, centerV: -0.1, width: 0.324, height: 0.324, mask: "ellipse" }],
  ["dead-leaves", { scene: { preset: "dead-leaves", radiusMinimum: 0.0025 * 6.25, radiusMaximum: 0.09 * 6.25, minimumReflectance: 0.2, maximumReflectance: 0.6, seed: 20261018 },
    centerU: -0.76, centerV: -0.13, width: 0.32, height: 0.32 }],
  ["slanted-squares", square(-0.43, 0.19, 0.13, 5)],
  ["siemens-star-sine", { scene: { preset: "siemens-star", profile: "sine", cycles: 64, radiusFraction: 1 / 1.07, darkReflectance: 0.08, lightReflectance: 0.72, backgroundReflectance: MID },
    centerU: 0, centerV: -0.03, width: 0.642, height: 0.642, mask: "ellipse" }],
  ["siemens-star-bar", { scene: { preset: "siemens-star", cycles: 48, radiusFraction: 1 / 1.07, darkReflectance: INK, lightReflectance: PLATE, backgroundReflectance: MID },
    centerU: 0, centerV: 0, width: 0.578, height: 0.578, mask: "ellipse" }],
  ["bar-groups", { scene: { preset: "bar-groups", lineWidthsPerPictureHeight: [70, 100, 140, 200, 280, 400, 560, 800, 1120, 1600], numerals: true, darkReflectance: INK, lightReflectance: PLATE },
    centerU: 0, centerV: 2 / 3 - 0.18, width: 1.3, height: 0.28 }],
  ["fiducial", { scene: { preset: "fiducial", radiusFraction: 1 / 1.2, ringFraction: 0.18, inverted: true, darkReflectance: INK, lightReflectance: PLATE, backgroundReflectance: FIELD },
    centerU: -0.925, centerV: 2 / 3 - 0.075, width: 0.108, height: 0.108, mask: "ellipse" }],
  ["hyperbolic-wedge", { scene: { preset: "hyperbolic-wedge", orientation: "horizontal", lineCount: 5, minimumLineWidthsPerPictureHeight: 100, maximumLineWidthsPerPictureHeight: 1000, darkReflectance: INK, lightReflectance: PLATE },
    centerU: 0, centerV: 2 / 3 - 0.11, width: 0.9, height: 0.17 }],
  ["checkerboard", { scene: { preset: "checkerboard", squaresAcross: 26, darkReflectance: INK, lightReflectance: PLATE }, centerU: -0.1, centerV: -0.53, width: 0.0867, height: 0.14 }],
  ["slanted-edge", { scene: { preset: "slanted-edge", angleDegrees: -5 }, centerU: 0.5, centerV: 0.3, width: 0.2, height: 0.2 }],
  ["patches", { scene: { preset: "patches", columns: 3, patches: Array.from({ length: 7 }, (_, i) => ({ patchId: "p" + i, reflectance: 0.05 + 0.12 * i })) }, centerU: -0.5, centerV: 0.35, width: 0.3, height: 0.24 }],
  ["grey-ramp", { scene: { preset: "grey-ramp" }, centerU: 0.4, centerV: 0.55, width: 0.5, height: 0.08 }],
  ["line-grid", { scene: { preset: "line-grid", spacing: 0.25, lineWidth: 0.02, lineReflectance: 0.42, backgroundReflectance: FIELD }, centerU: -0.3, centerV: 0.5, width: 0.6, height: 0.2 }]
];

const BACKGROUND: ChartElementScene = { preset: "line-grid", spacing: 1 / 6, lineWidth: 0.004, lineReflectance: 0.42, backgroundReflectance: FIELD };

/** A composite of one element over the line-grid background. */
export function singleElementComposite(name: string): ChartScene {
  const element = COMPOSITE_ELEMENTS.find(([n]) => n === name)![1];
  return { preset: "composite", background: BACKGROUND, elements: [element] };
}
/** Every fixture element on one chart (later elements cover earlier ones). */
export function allElementsComposite(): ChartScene {
  return { preset: "composite", background: BACKGROUND, elements: COMPOSITE_ELEMENTS.map(([, e]) => e) };
}

/** A ring approximating a quadratic curve from (x0, y0) through control (x1, y1) to (x2, y2), closed back along a straight edge. */
function curvedRing(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, pieces = 12): number[] {
  const ring: number[] = [];
  for (let k = 0; k <= pieces; k++) { const t = k / pieces, s = 1 - t; ring.push(s * s * x0 + 2 * s * t * x1 + t * t * x2, s * s * y0 + 2 * s * t * y1 + t * t * y2); }
  return ring;
}
/** Square-capped stroke rectangle of a segment, as a ring (one orientation for every segment). */
function strokeRing(x0: number, y0: number, x1: number, y1: number, width: number): number[] {
  const h = width / 2, len = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / len * h, uy = (y1 - y0) / len * h;
  return [x0 - ux - uy, y0 - uy + ux, x1 + ux - uy, y1 + uy + ux, x1 + ux + uy, y1 + uy - ux, x0 - ux + uy, y0 - uy - ux];
}
/** Synthetic label shapes in a 320 × 80 unit box: a stroked frame-like glyph, a stroked ring, and letter-like filled glyphs with curves and a hole. */
export function labelShapes(): ChartMaskShape[] {
  const shapes: ChartMaskShape[] = [];
  shapes.push({ kind: "polygon", rings: [strokeRing(12, 12, 12, 68, 8), strokeRing(12, 12, 52, 12, 8), strokeRing(52, 12, 52, 40, 8), strokeRing(52, 40, 24, 40, 8)] });
  shapes.push({ kind: "annulus", centerX: 36, centerY: 56, innerRadius: 7, outerRadius: 11 });
  for (let g = 0; g < 9; g++) {
    const x = 70 + 27 * g;
    // A glyph: an outer ring with two curved sides and an inner hole ring of the opposite orientation.
    const outer = [x, 20, ...curvedRing(x + 18, 20, x + 26, 40, x + 18, 60).slice(2), x, 60, x + 4, 40];
    const hole = [x + 6, 30, x + 6, 50, x + 14, 50, x + 16, 40, x + 14, 30];
    shapes.push({ kind: "polygon", rings: [outer, reverseRing(hole)] });
    shapes.push({ kind: "polygon", rings: [strokeRing(x + 2, 66, x + 20, 66, 3)] });
  }
  return shapes;
}
function reverseRing(ring: number[]): number[] {
  const out: number[] = [];
  for (let k = ring.length - 2; k >= 0; k -= 2) out.push(ring[k]!, ring[k + 1]!);
  return out;
}
/** The label layer in the lower-left corner of a frame of `aspect`, 0.44 frame units wide. */
export function labelLayer(aspect: number): ChartMaskLayer {
  const width = 0.44, height = width * 80 / 320, u0 = -1 + 0.03, v0 = -aspect + 0.03;
  return { kind: "shape-mask", rectangle: { u0, v0, u1: u0 + width, v1: v0 + height }, unitsWidth: 320, unitsHeight: 80, shapes: labelShapes(), backgroundReflectance: INK, inkReflectance: PLATE };
}
/** The all-elements composite under the label layer, as a declared material-layers scene. */
export function layeredScene(aspect = FIXTURE_ASPECT): ChartMaterialLayerScene {
  return { kind: "material-layers", sceneId: "test:composite-label", chart: allElementsComposite(), layers: [labelLayer(aspect)] };
}

/** Frame points at the pixel centres of a `width` × `height` view, every `stride`-th pixel, inside `rect` (frame units) when given; then `random` random points. */
export function viewPoints(aspect: number, size: { width: number; height: number }, stride: number, rect?: { u0: number; v0: number; u1: number; v1: number }, random = 0, seed = 1): Float64Array {
  const values: number[] = [], du = 2 / size.width, dv = 2 * aspect / size.height;
  for (let j = 0; j < size.height; j += stride) for (let i = 0; i < size.width; i += stride) {
    const u = -1 + (i + 0.5) * du, v = aspect - (j + 0.5) * dv;
    if (rect && (u < rect.u0 || u > rect.u1 || v < rect.v0 || v > rect.v1)) continue;
    values.push(u, v);
  }
  const r = corpusRandom(seed);
  for (let k = 0; k < random; k++) {
    if (rect) values.push(rect.u0 + (rect.u1 - rect.u0) * r(), rect.v0 + (rect.v1 - rect.v0) * r());
    else values.push(2.4 * r() - 1.2, aspect * (2.4 * r() - 1.2));
  }
  return Float64Array.from(values);
}
/** The placement rectangle of a fixture element. */
export function elementRect(element: CompositeChartElement): { u0: number; v0: number; u1: number; v1: number } {
  return { u0: element.centerU - element.width / 2, v0: element.centerV - element.height / 2, u1: element.centerU + element.width / 2, v1: element.centerV + element.height / 2 };
}

/** A batch input over 21 wavelengths: radiance queries, or three smooth channel weights. */
export function compositeBatchInput(scene: ChartScene | ChartMaterialLayerScene, points: Float64Array, mode: "radiance" | "spectral-integral", aspect = FIXTURE_ASPECT): ChartRadianceBatchInput {
  const wavelengths = Array.from({ length: 21 }, (_, j) => 380 + 20 * j), queries = points.length / 2;
  const base = { schemaVersion: "0.1.0" as const, scene, illuminant: { kind: "planckian" as const, temperatureKelvin: 5000 }, illuminanceLux: 1000, aspect, points, wavelengthsNanometers: wavelengths };
  if (mode === "radiance") return { ...base, wavelengthIndices: Uint16Array.from({ length: queries }, (_, i) => (i * 7) % wavelengths.length) };
  const channel = (centre: number): number[] => wavelengths.map((nm) => 20 * Math.exp(-0.5 * ((nm - centre) / 40) ** 2));
  return { ...base, channelWeights: [channel(600), channel(540), channel(450)] };
}
