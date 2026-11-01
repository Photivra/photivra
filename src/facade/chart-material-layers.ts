// SPDX-License-Identifier: Apache-2.0

/**
 * Declared material scenes (#477): an engine chart under shape-mask layers, given as data rather than as a
 * `materialAt` function, so that both the float64 reference and the `webgpu-f32` chart stage can evaluate
 * them. An application that prints a label on a chart (a logo and a line of text as filled polygons and
 * stroked rings, in the label's own units) describes it here; the engine holds no label of its own.
 *
 * A layer maps its mask box, [0, unitsWidth] × [0, unitsHeight] with y down, onto a frame rectangle. Inside
 * that rectangle the layer decides the material: the ink material where any of its shapes contains the
 * point, its background material elsewhere. Later layers cover earlier ones, and the chart shows outside
 * every layer. Shapes are polygons under the non-zero winding rule (several rings per shape; a stroked
 * polyline is its rectangles as rings of one orientation) and annuli (stroked circles).
 *
 * Each layer carries a cell index of {@link CHART_MASK_INDEX_GRAIN} cells over its box: a cell lists the
 * shapes whose bounding box meets the cell grown by one cell on every side, so `containsUnits` tests only
 * those. A computed cell can be off by one from the true one only through the rounding of one subtraction
 * and one multiplication, far less than a cell (the grain is checked against the coordinates' magnitude
 * when the layer is resolved), and a shape left out of a cell's list lies a whole cell away from any point
 * that resolves to it, so the indexed test gives the full test's answer at every point. The GPU uses the same
 * index (docs/WEBGPU.md, "Scene radiance on the GPU").
 */

import { InvalidConfigurationError } from "../core/configuration-error.js";
import { requireInputKeys, requireInputObject } from "../core/record-validation.js";
import { resolveChartScene, resolveChartMaterial, chartMaterialInputs, type ChartReflectance, type ChartScene, type ResolvedChartScene } from "./chart-scenes.js";
import type { CallerMaterialScene, SceneMaterialPoint } from "./scene-radiance.js";

/** A filled polygon: rings as flat [x0, y0, x1, y1, …] in mask units (y down), non-zero winding over all rings. */
export interface ChartMaskPolygon { kind: "polygon"; rings: readonly (readonly number[])[] }
/** A stroked circle: the points at distance innerRadius ≤ d ≤ outerRadius from the centre, mask units. */
export interface ChartMaskAnnulus { kind: "annulus"; centerX: number; centerY: number; innerRadius: number; outerRadius: number }
export type ChartMaskShape = ChartMaskPolygon | ChartMaskAnnulus;
/** A shape mask printed over the chart: its box [0, unitsWidth] × [0, unitsHeight] (y down) fills `rectangle` (frame units, v up). */
export interface ChartMaskLayer {
  kind: "shape-mask";
  rectangle: { u0: number; v0: number; u1: number; v1: number };
  unitsWidth: number;
  unitsHeight: number;
  /** 1 to 4096 shapes, in order; the ink material where any contains the point. */
  shapes: readonly ChartMaskShape[];
  backgroundReflectance: ChartReflectance;
  inkReflectance: ChartReflectance;
}
/** A chart under 1 to 16 shape-mask layers, as data; `resolveChartMaterialLayers` evaluates it. */
export interface ChartMaterialLayerScene { kind: "material-layers"; sceneId: string; chart: ChartScene; layers: readonly ChartMaskLayer[] }

/** The cell index grain of every layer: cells across and down the mask box. */
export const CHART_MASK_INDEX_GRAIN = /* @__PURE__ */ Object.freeze({ cellsX: 64, cellsY: 16 });
/** Limits of a declared scene. */
export const CHART_MATERIAL_LAYER_LIMITS = /* @__PURE__ */ Object.freeze({ maximumLayers: 16, maximumShapes: 4096, maximumRings: 256, maximumEdges: 65_536 });

/** Internal: a shape with its bounding box and flattened edges (polygon) or squared radii (annulus). */
export type ResolvedChartMaskShape =
  | { kind: "polygon"; box: readonly [number, number, number, number]; edges: Float64Array }
  | { kind: "annulus"; box: readonly [number, number, number, number]; centerX: number; centerY: number; inner2: number; outer2: number };
export interface ResolvedChartMaskLayer {
  rectangle: { u0: number; v0: number; u1: number; v1: number };
  unitsWidth: number;
  unitsHeight: number;
  /** Mask units per frame unit: unitsWidth / (u1 − u0) and unitsHeight / (v1 − v0). */
  scaleX: number;
  scaleY: number;
  shapes: readonly ResolvedChartMaskShape[];
  cellsX: number;
  cellsY: number;
  cellWidth: number;
  cellHeight: number;
  /** Per cell (row by row), the shape indices whose bounding box meets the cell grown by one cell. */
  cells: readonly Uint32Array[];
  backgroundMaterial: number;
  inkMaterial: number;
  /** Whether a point in mask units is ink (through the cell index). */
  containsUnits(x: number, y: number): boolean;
}
export interface ResolvedChartMaterialLayers {
  kind: "material-layers";
  sceneId: string;
  /** The chart under the layers; its materials come first in `materials`. */
  chart: ResolvedChartScene;
  layers: readonly ResolvedChartMaskLayer[];
  materials: ResolvedChartScene["materials"];
  /** Internal: the caller input behind each material (undefined for an engine neutral), for the scene digest. */
  materialInputs: readonly unknown[];
  /** Material index at a frame point (u right, v up): the topmost layer whose rectangle holds the point, else the chart. */
  materialAt(u: number, v: number): number;
  /** The same scene as a caller material scene for `simulateCapture` and the display view (chart-local coordinates when the chart has a size). */
  callerScene: CallerMaterialScene;
}

const SCENE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u;
const finite = (value: unknown, name: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new InvalidConfigurationError(name + " must be a finite number.");
  return value;
};
/** The smallest cell the one-cell margin covers: the rounding of (x − 0)·scale is a few units in the last place of the coordinates. */
const minimumCell = (extent: number): number => Math.max(extent, Number.MIN_VALUE) * 2 ** -20;

function resolvePolygon(shape: ChartMaskPolygon, name: string): ResolvedChartMaskShape {
  const rings = shape.rings;
  if (!Array.isArray(rings) || rings.length < 1 || rings.length > CHART_MATERIAL_LAYER_LIMITS.maximumRings) throw new InvalidConfigurationError(name + " needs 1 to 256 rings.");
  let count = 0;
  for (const ring of rings) {
    if (!Array.isArray(ring) || ring.length < 6 || ring.length % 2 !== 0) throw new InvalidConfigurationError(name + " rings need at least three (x, y) vertices.");
    count += ring.length / 2;
  }
  if (count > CHART_MATERIAL_LAYER_LIMITS.maximumEdges) throw new InvalidConfigurationError(name + " has more than 65536 edges.");
  const edges = new Float64Array(4 * count);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, e = 0;
  for (const ring of rings) {
    const n = ring.length / 2;
    for (let k = 0; k < n; k++) {
      const x0 = finite(ring[2 * k], name + " vertex"), y0 = finite(ring[2 * k + 1], name + " vertex");
      const next = k + 1 === n ? 0 : k + 1, x1 = finite(ring[2 * next], name + " vertex"), y1 = finite(ring[2 * next + 1], name + " vertex");
      edges[e++] = x0; edges[e++] = y0; edges[e++] = x1; edges[e++] = y1;
      minX = Math.min(minX, x0); minY = Math.min(minY, y0); maxX = Math.max(maxX, x0); maxY = Math.max(maxY, y0);
    }
  }
  return { kind: "polygon", box: [minX, minY, maxX, maxY], edges };
}

/** Non-zero winding over the edges (x0, y0, x1, y1), as the reference evaluates it; the GPU runs the same comparisons. */
export function polygonWinding(edges: Float64Array, x: number, y: number): number {
  let winding = 0;
  for (let k = 0; k < edges.length; k += 4) {
    const x0 = edges[k]!, y0 = edges[k + 1]!, x1 = edges[k + 2]!, y1 = edges[k + 3]!;
    const side = (x1 - x0) * (y - y0) - (x - x0) * (y1 - y0);
    if (y0 <= y) {
      if (y1 > y && side > 0) winding++;
    } else if (y1 <= y && side < 0) winding--;
  }
  return winding;
}
/** Whether a resolved shape contains a point in mask units (the full test, without the cell index). */
export function shapeContains(shape: ResolvedChartMaskShape, x: number, y: number): boolean {
  const b = shape.box;
  if (!(x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3])) return false;
  if (shape.kind === "annulus") {
    const d2 = (x - shape.centerX) * (x - shape.centerX) + (y - shape.centerY) * (y - shape.centerY);
    return d2 >= shape.inner2 && d2 <= shape.outer2;
  }
  return polygonWinding(shape.edges, x, y) !== 0;
}

function resolveLayer(value: unknown, name: string, aspect: number, materials: ResolvedChartScene["materials"][number][], inputs: unknown[]): ResolvedChartMaskLayer {
  requireInputObject(value, name);
  const layer = value as Record<string, unknown>;
  for (const key of Object.keys(layer)) {
    if (!["kind", "rectangle", "unitsWidth", "unitsHeight", "shapes", "backgroundReflectance", "inkReflectance"].includes(key)) throw new InvalidConfigurationError("Unknown " + name + " field: " + key + ".");
  }
  if (layer.kind !== "shape-mask") throw new InvalidConfigurationError(name + ".kind must be shape-mask.");
  requireInputObject(layer.rectangle, name + ".rectangle");
  const r = layer.rectangle as Record<string, unknown>;
  for (const key of Object.keys(r)) if (!["u0", "v0", "u1", "v1"].includes(key)) throw new InvalidConfigurationError("Unknown " + name + ".rectangle field: " + key + ".");
  const u0 = finite(r.u0, name + ".rectangle.u0"), v0 = finite(r.v0, name + ".rectangle.v0"), u1 = finite(r.u1, name + ".rectangle.u1"), v1 = finite(r.v1, name + ".rectangle.v1");
  if (!(u1 > u0 && v1 > v0) || Math.max(Math.abs(u0), Math.abs(u1)) > 1e6 || Math.max(Math.abs(v0), Math.abs(v1)) > 1e6 * Math.max(1, aspect)) {
    throw new InvalidConfigurationError(name + ".rectangle needs u0 < u1 and v0 < v1 within 10^6 frame units.");
  }
  const unitsWidth = finite(layer.unitsWidth, name + ".unitsWidth"), unitsHeight = finite(layer.unitsHeight, name + ".unitsHeight");
  if (!(unitsWidth > 0 && unitsHeight > 0 && unitsWidth <= 1e9 && unitsHeight <= 1e9)) throw new InvalidConfigurationError(name + " units must be positive and at most 10^9.");
  const list = layer.shapes;
  if (!Array.isArray(list) || list.length < 1 || list.length > CHART_MATERIAL_LAYER_LIMITS.maximumShapes) throw new InvalidConfigurationError(name + ".shapes must list 1 to 4096 shapes.");
  const shapes = list.map((shape: unknown, index: number): ResolvedChartMaskShape => {
    const label = name + ".shapes[" + index + "]";
    requireInputObject(shape, label);
    const s = shape as Record<string, unknown>;
    if (s.kind === "polygon") {
      for (const key of Object.keys(s)) if (key !== "kind" && key !== "rings") throw new InvalidConfigurationError("Unknown " + label + " field: " + key + ".");
      return resolvePolygon(s as unknown as ChartMaskPolygon, label);
    }
    if (s.kind !== "annulus") throw new InvalidConfigurationError(label + ".kind must be polygon or annulus.");
    for (const key of Object.keys(s)) if (!["kind", "centerX", "centerY", "innerRadius", "outerRadius"].includes(key)) throw new InvalidConfigurationError("Unknown " + label + " field: " + key + ".");
    const cx = finite(s.centerX, label + ".centerX"), cy = finite(s.centerY, label + ".centerY");
    const inner = finite(s.innerRadius, label + ".innerRadius"), outer = finite(s.outerRadius, label + ".outerRadius");
    if (!(inner >= 0 && outer > inner)) throw new InvalidConfigurationError(label + " needs 0 ≤ innerRadius < outerRadius.");
    return { kind: "annulus", box: [cx - outer, cy - outer, cx + outer, cy + outer], centerX: cx, centerY: cy, inner2: inner * inner, outer2: outer * outer };
  });
  for (const shape of shapes) {
    if (!shape.box.every((c) => Math.abs(c) <= 1e9)) throw new InvalidConfigurationError(name + " shape coordinates must stay within 10^9 units.");
  }
  const backgroundMaterial = materials.length;
  materials.push(resolveChartMaterial(layer.backgroundReflectance, name + ".backgroundReflectance"));
  inputs.push(typeof layer.backgroundReflectance === "number" ? undefined : layer.backgroundReflectance);
  const inkMaterial = materials.length;
  materials.push(resolveChartMaterial(layer.inkReflectance, name + ".inkReflectance"));
  inputs.push(typeof layer.inkReflectance === "number" ? undefined : layer.inkReflectance);
  // The cell index over the mask box; the grain must stay large against the coordinates' rounding (see the header).
  const { cellsX, cellsY } = CHART_MASK_INDEX_GRAIN, cellWidth = unitsWidth / cellsX, cellHeight = unitsHeight / cellsY;
  const extentX = Math.max(unitsWidth, ...shapes.map((s) => Math.max(Math.abs(s.box[0]), Math.abs(s.box[2]))));
  const extentY = Math.max(unitsHeight, ...shapes.map((s) => Math.max(Math.abs(s.box[1]), Math.abs(s.box[3]))));
  if (!(cellWidth > minimumCell(extentX) && cellHeight > minimumCell(extentY))) throw new InvalidConfigurationError(name + ": the shapes extend too far beyond the mask box for its cell index.");
  const cells: Uint32Array[] = [];
  for (let j = 0; j < cellsY; j++) {
    for (let i = 0; i < cellsX; i++) {
      const x0 = (i - 1) * cellWidth, x1 = (i + 2) * cellWidth, y0 = (j - 1) * cellHeight, y1 = (j + 2) * cellHeight, listed: number[] = [];
      shapes.forEach((s, k) => { if (s.box[0] <= x1 && s.box[2] >= x0 && s.box[1] <= y1 && s.box[3] >= y0) listed.push(k); });
      cells.push(Uint32Array.from(listed));
    }
  }
  const scaleX = unitsWidth / (u1 - u0), scaleY = unitsHeight / (v1 - v0);
  return Object.freeze({ rectangle: Object.freeze({ u0, v0, u1, v1 }), unitsWidth, unitsHeight, scaleX, scaleY, shapes: Object.freeze(shapes), cellsX, cellsY, cellWidth, cellHeight,
    cells: Object.freeze(cells), backgroundMaterial, inkMaterial,
    containsUnits(x: number, y: number): boolean {
      let i = Math.floor(x / cellWidth), j = Math.floor(y / cellHeight);
      if (!(i > 0)) i = 0; else if (i >= cellsX) i = cellsX - 1;
      if (!(j > 0)) j = 0; else if (j >= cellsY) j = cellsY - 1;
      const list = cells[j * cellsX + i]!;
      for (let k = 0; k < list.length; k++) if (shapeContains(shapes[list[k]!]!, x, y)) return true;
      return false;
    } });
}

/**
 * Validates a declared material scene and resolves its chart (in a frame of `aspect` = height / width) and its
 * layers. `materialAt` is the float64 reference the GPU stage is checked against, and `callerScene` is the same
 * scene for `simulateCapture`'s `scene` option.
 */
export function resolveChartMaterialLayers(input: { scene: ChartMaterialLayerScene; aspect: number }): ResolvedChartMaterialLayers {
  requireInputKeys(input, "resolveChartMaterialLayers", ["scene", "aspect"]);
  const { scene, aspect } = input;
  requireInputObject(scene, "scene");
  const record = scene as unknown as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!["kind", "sceneId", "chart", "layers"].includes(key)) throw new InvalidConfigurationError("Unknown scene field: " + key + ".");
  if (record.kind !== "material-layers") throw new InvalidConfigurationError("scene.kind must be material-layers.");
  if (typeof record.sceneId !== "string" || !SCENE_ID.test(record.sceneId)) throw new InvalidConfigurationError("A material-layers scene needs a public sceneId.");
  if (typeof aspect !== "number" || !Number.isFinite(aspect) || aspect <= 0) throw new InvalidConfigurationError("Chart aspect must be positive.");
  const chart = resolveChartScene({ scene: record.chart as ChartScene, aspect });
  const list = record.layers;
  if (!Array.isArray(list) || list.length < 1 || list.length > CHART_MATERIAL_LAYER_LIMITS.maximumLayers) throw new InvalidConfigurationError("layers must list 1 to 16 shape-mask layers.");
  const materials: ResolvedChartScene["materials"][number][] = [...chart.materials], inputs: unknown[] = [...chartMaterialInputs(chart)];
  const layers = list.map((layer: unknown, index: number) => resolveLayer(layer, "layers[" + index + "]", aspect, materials, inputs));
  const materialAt = (u: number, v: number): number => {
    for (let l = layers.length - 1; l >= 0; l--) {
      const layer = layers[l]!, r = layer.rectangle;
      if (u < r.u0 || u > r.u1 || v < r.v0 || v > r.v1) continue;
      return layer.containsUnits((u - r.u0) * layer.scaleX, (r.v1 - v) * layer.scaleY) ? layer.inkMaterial : layer.backgroundMaterial;
    }
    return chart.materialAt(u, v);
  };
  const callerMaterials = materials.map((m, k) => (m.kind === "neutral" ? m.reflectance : inputs[k] as ChartReflectance));
  const callerScene: CallerMaterialScene = Object.freeze({ kind: "material-function" as const, sceneId: record.sceneId, materials: Object.freeze(callerMaterials),
    materialAt: (p: Readonly<SceneMaterialPoint>) => materialAt(p.chartU ?? p.u, p.chartV ?? p.v) });
  return Object.freeze({ kind: "material-layers" as const, sceneId: record.sceneId, chart, layers: Object.freeze(layers), materials: Object.freeze(materials),
    materialInputs: Object.freeze(inputs), materialAt, callerScene });
}
