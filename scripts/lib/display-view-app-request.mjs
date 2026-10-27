// SPDX-License-Identifier: Apache-2.0

/**
 * The app's display-view request shape (#454), shared by `scripts/benchmark-display-view.mjs --app` and the preview
 * acceptance harness `scripts/accept-display-view-gpu.mjs` (#480): a 6 µm 6000 × 4000 sensor with the 2 × 2 box pixel
 * aperture, an engine chart with a stand-in printed label (a caller material scene, or since the GPU producer of #480 a
 * declared `material-layers` scene), a device-pixel view rendered in parts, centre first. `engine` is always the build's module (`dist/index.js`), passed in so a caller can time another build.
 */

export const APP_VIEW = { width: 2028, height: 1352 };
export const APP_PART_SIDE = 96;

/**
 * The composite chart of the app-request rows: an engine-authored layout of the engine's presets (not any caller's
 * chart), so the materials path, the chart's element lookups and a realistic share of edges are exercised.
 */
export const APP_CHART = { preset: "composite", background: { preset: "line-grid", spacing: 1 / 6, lineWidth: 0.004, lineReflectance: 0.42, backgroundReflectance: 0.6 },
  elements: [
    { scene: { preset: "siemens-star", profile: "sine", cycles: 64, darkReflectance: 0.08, lightReflectance: 0.72, backgroundReflectance: 0.18 }, centerU: 0, centerV: 0, width: 0.64, height: 0.64, mask: "ellipse" },
    { scene: { preset: "dead-leaves", seed: 454, minimumReflectance: 0.2, maximumReflectance: 0.6 }, centerU: -0.76, centerV: -0.13, width: 0.32, height: 0.32 },
    { scene: { preset: "zone-plate", darkReflectance: 0.1, lightReflectance: 0.7, backgroundReflectance: 0.18 }, centerU: 0.76, centerV: -0.1, width: 0.32, height: 0.32, mask: "ellipse" },
    { scene: { preset: "step-wedge", steps: 12, minimumReflectance: 0.03, maximumReflectance: 0.9 }, centerU: 0.04, centerV: -0.57, width: 0.96, height: 0.12 },
    ...[[-0.43, 0.19], [0.43, 0.19], [-0.78, 0.27], [0.78, 0.27]].map(([centerU, centerV]) => ({ scene: { preset: "slanted-squares", columns: 1, rows: 1, sizeFraction: 0.5, angleDegrees: 5, darkReflectance: 0.15, lightReflectance: 0.6 }, centerU, centerV, width: 0.26, height: 0.26 })),
    { scene: { preset: "bar-groups", lineWidthsPerPictureHeight: [400, 800, 1200, 1600] }, centerU: 0.04, centerV: 0.5, width: 0.6, height: 0.14 }
  ] };

/**
 * A stand-in for a printed label: a rectangle near the bottom-left corner with a background and rows of ink bars. It
 * costs a few comparisons per lookup, so it under-reports a caller label tested by polygon winding (in one caller's
 * profile its label test was about 3 % of self time; docs/DISPLAY_VIEW.md, "Cost").
 */
export function labelInk(u, v) {
  const minU = -0.95, maxU = -0.45, minV = -0.64, maxV = -0.56;
  if (u < minU || u > maxU || v < minV || v > maxV) return -1;
  const x = (u - minU) / (maxU - minU), y = (v - minV) / (maxV - minV);
  const row = Math.floor(y * 3), inRow = y * 3 - row;
  return inRow > 0.2 && inRow < 0.8 && Math.floor(x * 40 + row) % 3 !== 0 ? 1 : 0;
}

/** A ring approximating a quadratic curve from (x0, y0) through control (x1, y1) to (x2, y2). */
function curvedRing(x0, y0, x1, y1, x2, y2, pieces = 12) {
  const ring = [];
  for (let k = 0; k <= pieces; k++) { const t = k / pieces, s = 1 - t; ring.push(s * s * x0 + 2 * s * t * x1 + t * t * x2, s * s * y0 + 2 * s * t * y1 + t * t * y2); }
  return ring;
}
/** Square-capped stroke rectangle of a segment, as a ring (one orientation for every segment). */
function strokeRing(x0, y0, x1, y1, width) {
  const h = width / 2, len = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / len * h, uy = (y1 - y0) / len * h;
  return [x0 - ux - uy, y0 - uy + ux, x1 + ux - uy, y1 + uy + ux, x1 + ux + uy, y1 + uy - ux, x0 - ux + uy, y0 - uy - ux];
}
const reverseRing = (ring) => { const out = []; for (let k = ring.length - 2; k >= 0; k -= 2) out.push(ring[k], ring[k + 1]); return out; };

/**
 * A generic stand-in for a printed label as a declared shape-mask layer (#491's `material-layers`), engine-authored: no
 * application's artwork. In a 320 × 80 unit box it holds a stroked frame-like glyph, a stroked ring (an annulus) and nine
 * letter-like glyphs with two curved sides, a hole and an underline stroke, so it exercises every mask path the GPU's composite
 * material module has (non-zero winding over several rings, holes, stroked rectangles, annuli). The layer is 0.44 frame units
 * wide, 0.03 in from the frame's left and bottom edges, a dark plate (reflectance 0.05) printed in light ink (0.8). It is the
 * label layer of the engine's composite fixtures (`labelLayer` in test/helpers/chart-composite-fixtures.ts; tested equal), the
 * one the 2028 × 1352 emulation run of #491 used. An application's own label (its logo and text outlines) has other shapes
 * and edge counts, so its per-lookup cost and flagged fraction differ.
 */
export function standInLabelLayer(aspect) {
  const shapes = [];
  shapes.push({ kind: "polygon", rings: [strokeRing(12, 12, 12, 68, 8), strokeRing(12, 12, 52, 12, 8), strokeRing(52, 12, 52, 40, 8), strokeRing(52, 40, 24, 40, 8)] });
  shapes.push({ kind: "annulus", centerX: 36, centerY: 56, innerRadius: 7, outerRadius: 11 });
  for (let g = 0; g < 9; g++) {
    const x = 70 + 27 * g;
    const outer = [x, 20, ...curvedRing(x + 18, 20, x + 26, 40, x + 18, 60).slice(2), x, 60, x + 4, 40];
    const hole = [x + 6, 30, x + 6, 50, x + 14, 50, x + 16, 40, x + 14, 30];
    shapes.push({ kind: "polygon", rings: [outer, reverseRing(hole)] });
    shapes.push({ kind: "polygon", rings: [strokeRing(x + 2, 66, x + 20, 66, 3)] });
  }
  const width = 0.44, height = width * 80 / 320, u0 = -1 + 0.03, v0 = -aspect + 0.03;
  return { kind: "shape-mask", rectangle: { u0, v0, u1: u0 + width, v1: v0 + height }, unitsWidth: 320, unitsHeight: 80, shapes, backgroundReflectance: 0.05, inkReflectance: 0.8 };
}

/**
 * The app-request options for a row (`{ options: "speed" | "quality", fNumber }`): `chart` is the chart scene the label is
 * laid over (default `APP_CHART`), `view` the display view whose aspect the chart takes (default `APP_VIEW`), `sceneId`
 * the scene's id. `scene` chooses the scene's form:
 *
 * - `"material-function"` (the default; the benchmark's and #480's first form): a caller material scene, the chart with the
 *   stand-in label `labelInk` tested in a function. The GPU renderer refuses caller functions (`unsupported-on-backend`).
 * - `"material-layers"`: the form an application gives the GPU (#491): `{ kind: "material-layers", sceneId, chart, layers }`
 *   with `standInLabelLayer`, plain data that a browser page can receive and the GPU's composite material module evaluates.
 */
export function appRequestOptions(engine, row, { chart = APP_CHART, view = APP_VIEW, sceneId = "benchmark:app-request", scene: form = "material-function" } = {}) {
  const aspect = view.height / view.width;
  let scene;
  if (form === "material-layers") scene = { kind: "material-layers", sceneId, chart, layers: [standInLabelLayer(aspect)] };
  else if (form === "material-function") {
    const resolved = engine.resolveChartScene({ scene: chart, aspect });
    const materials = resolved.materials.map((m) => m.reflectance), background = materials.length, ink = materials.length + 1;
    scene = { kind: "material-function", sceneId, materials: [...materials, 0.85, 0.06],
      materialAt: (p) => { const u = p.chartU ?? p.u, v = p.chartV ?? p.v, label = labelInk(u, v); return label < 0 ? resolved.materialAt(u, v) : label === 1 ? ink : background; } };
  } else throw new Error(`Unknown scene form ${form}; "material-function" or "material-layers".`);
  const quality = row.options === "quality";
  return { scene, chartSize: { widthM: 0.42, heightM: Number((0.42 * aspect).toFixed(4)) }, subjectDistanceM: 0.63,
    lens: { prime: 50, fNumber: row.fNumber, ...(quality ? { diffraction: "circular-aperture" } : {}) },
    exposure: { mode: "manual", iso: 100, shutterSeconds: (1 / 125) * (row.fNumber / 11) ** 2 },
    sensor: { pixelPitchMicrometers: 6, pixelAperture: { kind: "box", samplesPerAxis: 2 }, ...(quality ? { antiAliasing: { kind: "four-spot" } } : {}) },
    output: { width: 6000, height: 4000, format: "srgb-8", maximumPixels: engine.NATIVE_RAW_LIMITS.ceilingPixels, ...(quality ? { demosaic: "ahd" } : {}) } };
}

/** The parts of the view, about `side` square, centre first (ties by grid index). */
export function appParts(width, height, side) {
  const columns = Math.max(1, Math.round(width / side)), rows = Math.max(1, Math.round(height / side)), edge = (i, n, len) => Math.round((i * len) / n), parts = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
    const x = edge(c, columns, width), y = edge(r, rows, height);
    parts.push({ index: r * columns + c, x, y, width: edge(c + 1, columns, width) - x, height: edge(r + 1, rows, height) - y });
  }
  const distance = (t) => Math.hypot(t.x + t.width / 2 - width / 2, t.y + t.height / 2 - height / 2);
  return parts.sort((a, b) => distance(a) - distance(b) || a.index - b.index);
}

/** Every k-th part of the centre-first order, `count` of them (all when count ≥ the part count). */
export const sampledParts = (parts, count) => { const k = Math.max(1, Math.floor(parts.length / count)), out = []; for (let i = 0; i < parts.length && out.length < count; i += k) out.push(parts[i]); return out; };
