// SPDX-License-Identifier: Apache-2.0

/**
 * The app's display-view request shape (#454), shared by `scripts/benchmark-display-view.mjs --app` and the preview
 * acceptance harness `scripts/accept-display-view-gpu.mjs` (#480): a 6 µm 6000 × 4000 sensor with the 2 × 2 box pixel
 * aperture, a caller material scene (an engine chart with a stand-in printed label), a device-pixel view rendered in
 * parts, centre first. `engine` is always the build's module (`dist/index.js`), passed in so a caller can time another build.
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

/**
 * The app-request options for a row (`{ options: "speed" | "quality", fNumber }`): `chart` is the chart scene the label is
 * laid over (default `APP_CHART`), `view` the display view whose aspect the chart takes (default `APP_VIEW`), `sceneId`
 * the material scene's id.
 */
export function appRequestOptions(engine, row, { chart = APP_CHART, view = APP_VIEW, sceneId = "benchmark:app-request" } = {}) {
  const aspect = view.height / view.width, resolved = engine.resolveChartScene({ scene: chart, aspect });
  const materials = resolved.materials.map((m) => m.reflectance), background = materials.length, ink = materials.length + 1;
  const scene = { kind: "material-function", sceneId, materials: [...materials, 0.85, 0.06],
    materialAt: (p) => { const u = p.chartU ?? p.u, v = p.chartV ?? p.v, label = labelInk(u, v); return label < 0 ? resolved.materialAt(u, v) : label === 1 ? ink : background; } };
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
