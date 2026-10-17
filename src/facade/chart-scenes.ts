// SPDX-License-Identifier: Apache-2.0

/**
 * Engine-authored procedural test charts for the capture facade. Every chart is a planar, Lambertian
 * reflectance pattern defined analytically in normalized frame coordinates; no third-party chart data
 * (for example ColorChecker reflectances) is bundled. Coloured patches take caller-supplied spectra.
 *
 * Frame coordinates: `u` runs from -1 (left edge of the framed chart) to +1 (right edge); `v` points up
 * and has the same scale, so it runs from -aspect to +aspect where aspect = height/width of the frame.
 * The facade places the chart perpendicular to the optical axis at the subject distance and sizes it so
 * that this rectangle exactly fills the active capture (see `SimulateCaptureResult.assumptions`).
 *
 * The slanted edge follows the slanted-edge geometry described by P. D. Burns, "Slanted-Edge MTF for Digital
 * Camera and Scanner Analysis", IS&T PICS 2000 (free from imaging.org; also ISO 12233) (a near-vertical edge rotated by
 * a few degrees, 5 degrees by default, with a 4:1 light/dark reflectance ratio by default). It is a
 * geometric description only; no measured chart or ISO test procedure is reproduced.
 * @see docs/QUICK_START.md for the chart catalogue and their analytic definitions.
 */

import { InvalidConfigurationError } from "../core/configuration-error.js";
import { prepareColorimetricSpectrum, type ColorimetricSpectrum, type PreparedColorimetricSpectrum } from "../color/color-matching-functions.js";
import { requireInputObject } from "../core/record-validation.js";

/** A neutral (spectrally flat) reflectance in [0, 1], or a caller reflectance spectrum (values in [0, 1]). */
export type ChartReflectance = number | ColorimetricSpectrum;

export interface UniformChartScene { preset: "uniform"; reflectance?: ChartReflectance }
export interface SlantedEdgeChartScene {
  preset: "slanted-edge";
  /** Clockwise tilt of the edge from vertical, degrees, in (-45, 45). Default 5. */
  angleDegrees?: number;
  /** Left (dark) side reflectance. Default 0.15. */
  darkReflectance?: number;
  /** Right (light) side reflectance. Default 0.6 (4:1 with the default dark side). */
  lightReflectance?: number;
}
export interface SiemensStarChartScene {
  preset: "siemens-star";
  /** Light/dark sector pairs around the star, 2..360. Default 36. */
  cycles?: number;
  /** Star radius as a fraction of the frame half-height, (0, 1]. Default 0.9. */
  radiusFraction?: number;
  darkReflectance?: number;
  lightReflectance?: number;
  /** Reflectance outside the star. Default 0.18. */
  backgroundReflectance?: number;
}
export interface StepWedgeChartScene {
  preset: "step-wedge";
  /** Number of equal-width vertical steps from left (minimum) to right (maximum), 2..64. Default 11. */
  steps?: number;
  minimumReflectance?: number;
  maximumReflectance?: number;
  /** `equal-density` (geometric, default) or `linear` reflectance spacing. */
  spacing?: "equal-density" | "linear";
}
export interface GreyRampChartScene {
  preset: "grey-ramp";
  /** Continuous ramp, linear in reflectance from left (minimum) to right (maximum). */
  minimumReflectance?: number;
  maximumReflectance?: number;
}
export interface CheckerboardChartScene {
  preset: "checkerboard";
  /** Squares across the frame width, 2..256. Default 8. */
  squaresAcross?: number;
  darkReflectance?: number;
  lightReflectance?: number;
}
export interface PointGridChartScene {
  preset: "point-grid";
  /** Grid columns and rows of small disks centred in equal cells. Defaults 5 × 3. */
  columns?: number;
  rows?: number;
  /** Disk radius in frame units (fraction of the frame half-width). Default 0.01. */
  radius?: number;
  pointReflectance?: number;
  backgroundReflectance?: number;
}
export interface PatchChartScene {
  preset: "patches";
  /** Caller reflectance per patch, row-major; the facade bundles no colour-chart data. 1..1024 patches. */
  patches: readonly { patchId: string; reflectance: ChartReflectance }[];
  /** Patches per row. Default ceil(sqrt(patch count)). */
  columns?: number;
  /** Gap between patches as a fraction of the cell size, [0, 0.5). Default 0.1. */
  gapFraction?: number;
  backgroundReflectance?: number;
}
export type ChartScene = UniformChartScene | SlantedEdgeChartScene | SiemensStarChartScene | StepWedgeChartScene |
  GreyRampChartScene | CheckerboardChartScene | PointGridChartScene | PatchChartScene;
export type ChartScenePresetId = ChartScene["preset"];
export const CHART_SCENE_PRESETS: readonly ChartScenePresetId[] = Object.freeze(["uniform", "slanted-edge", "siemens-star",
  "step-wedge", "grey-ramp", "checkerboard", "point-grid", "patches"] as const);

/** Engine-chosen chart parameters, each reported when the caller omitted it. */
export const CHART_SCENE_DEFAULTS = Object.freeze({
  uniform: Object.freeze({ reflectance: 0.18 }),
  "slanted-edge": Object.freeze({ angleDegrees: 5, darkReflectance: 0.15, lightReflectance: 0.6 }),
  "siemens-star": Object.freeze({ cycles: 36, radiusFraction: 0.9, darkReflectance: 0.05, lightReflectance: 0.8, backgroundReflectance: 0.18 }),
  "step-wedge": Object.freeze({ steps: 11, minimumReflectance: 0.03, maximumReflectance: 0.9, spacing: "equal-density" as const }),
  "grey-ramp": Object.freeze({ minimumReflectance: 0.03, maximumReflectance: 0.9 }),
  checkerboard: Object.freeze({ squaresAcross: 8, darkReflectance: 0.05, lightReflectance: 0.8 }),
  "point-grid": Object.freeze({ columns: 5, rows: 3, radius: 0.01, pointReflectance: 0.9, backgroundReflectance: 0.02 }),
  patches: Object.freeze({ gapFraction: 0.1, backgroundReflectance: 0.18 })
});

/** A validated chart: every parameter resolved, plus which ones came from {@link CHART_SCENE_DEFAULTS}. */
export interface ResolvedChartScene {
  preset: ChartScenePresetId;
  /** Fully resolved parameters (spectra are reported as `"caller-spectrum"`). */
  parameters: Readonly<Record<string, unknown>>;
  /** Names of parameters filled from defaults. */
  defaultedParameters: readonly string[];
  /** Frame aspect (height / width) the chart was resolved for. */
  aspect: number;
  /**
   * Material index at a frame point (u right, v up). Index 0.. refers to `materials`. Points outside the
   * framed rectangle still evaluate (the chart pattern extends as defined) so that blur and slight
   * framing differences stay well defined.
   */
  materialAt(u: number, v: number): number;
  /** Reflectance materials: a neutral number or a prepared caller spectrum. */
  materials: readonly ({ kind: "neutral"; reflectance: number } | { kind: "spectrum"; spectrum: PreparedColorimetricSpectrum })[];
  /** Reflectance in [0, 1] at a frame point and wavelength (nm). */
  reflectanceAt(u: number, v: number, wavelengthNanometers: number): number;
}

function reflectance(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) throw new InvalidConfigurationError(name + " must be a reflectance in [0, 1].");
  return value;
}
function integerIn(value: unknown, name: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) throw new InvalidConfigurationError(name + " must be an integer from " + minimum + " to " + maximum + ".");
  return value;
}
function finiteIn(value: unknown, name: string, minimum: number, maximum: number, open = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum || (open && (value === minimum || value === maximum)))
    throw new InvalidConfigurationError(name + " is outside its supported range.");
  return value;
}
/** Wavelength range every chart spectrum must cover (the facade's sensor quadrature range). */
export const CHART_SPECTRAL_RANGE_NANOMETERS = Object.freeze({ minimum: 380, maximum: 780 });
function material(value: unknown, name: string): ResolvedChartScene["materials"][number] {
  if (typeof value === "number") return { kind: "neutral", reflectance: reflectance(value, name) };
  let spectrum: PreparedColorimetricSpectrum;
  try { spectrum = prepareColorimetricSpectrum(value as ColorimetricSpectrum, name); } catch (error) {
    throw new InvalidConfigurationError(name + " must be a neutral reflectance or a valid reflectance spectrum: " + (error instanceof Error ? error.message : "invalid"));
  }
  const range = spectrum.wavelengthRangeNanometers;
  if (range.minimum > CHART_SPECTRAL_RANGE_NANOMETERS.minimum || range.maximum < CHART_SPECTRAL_RANGE_NANOMETERS.maximum)
    throw new InvalidConfigurationError(name + " must cover 380-780 nm.");
  for (let nm = CHART_SPECTRAL_RANGE_NANOMETERS.minimum; nm <= CHART_SPECTRAL_RANGE_NANOMETERS.maximum; nm += 5) reflectance(spectrum.evaluate(nm), name + " values");
  return { kind: "spectrum", spectrum };
}

/**
 * Validates a chart description and resolves every default. `aspect` is the frame height/width. Unknown
 * fields are rejected so that a mistyped parameter never silently falls back to a default.
 */
export function resolveChartScene(input: { scene: ChartScene; aspect: number }): ResolvedChartScene {
  requireInputObject(input, "resolveChartScene input");
  for (const key of Object.keys(input)) if (key !== "scene" && key !== "aspect") throw new InvalidConfigurationError("resolveChartScene input has unknown field \"" + key + "\".");
  const { scene, aspect } = input;
  requireInputObject(scene, "chart scene");
  if (typeof aspect !== "number" || !Number.isFinite(aspect) || aspect <= 0) throw new InvalidConfigurationError("Chart aspect must be positive.");
  const preset = (scene as { preset?: unknown }).preset;
  if (typeof preset !== "string" || !(CHART_SCENE_PRESETS as readonly string[]).includes(preset)) throw new InvalidConfigurationError("Unknown chart preset.");
  const record = scene as unknown as Record<string, unknown>;
  const defaults = CHART_SCENE_DEFAULTS[preset as ChartScenePresetId] as Record<string, unknown>;
  const allowed = ["preset", ...Object.keys(defaults), ...(preset === "patches" ? ["patches", "columns"] : [])];
  for (const key of Object.keys(record)) if (!allowed.includes(key)) throw new InvalidConfigurationError("Unknown chart parameter: " + key + ".");
  const defaulted: string[] = [];
  const get = (key: string): unknown => { if (record[key] === undefined) { if (key in defaults) defaulted.push(key); return defaults[key]; } return record[key]; };
  const neutral = (key: string): number => reflectance(get(key), key);
  const done = (parameters: Record<string, unknown>, materials: ResolvedChartScene["materials"], materialAt: (u: number, v: number) => number): ResolvedChartScene =>
    Object.freeze({ preset: preset as ChartScenePresetId, parameters: Object.freeze(parameters), defaultedParameters: Object.freeze(defaulted), aspect, materials: Object.freeze(materials), materialAt,
      reflectanceAt(u: number, v: number, nm: number): number {
        const m = materials[materialAt(u, v)]!;
        if (m.kind === "neutral") return m.reflectance;
        const value = m.spectrum.evaluate(nm);
        if (!(value >= 0 && value <= 1)) throw new InvalidConfigurationError("Chart reflectance spectrum left [0, 1].");
        return value;
      } });
  switch (preset as ChartScenePresetId) {
    case "uniform": {
      const raw = get("reflectance"), m = material(raw, "reflectance");
      return done({ reflectance: typeof raw === "number" ? raw : "caller-spectrum" }, [m], () => 0);
    }
    case "slanted-edge": {
      const angle = finiteIn(get("angleDegrees"), "angleDegrees", -45, 45, true), dark = neutral("darkReflectance"), light = neutral("lightReflectance");
      const t = angle * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
      // Edge through the frame centre along (sin t, cos t); the light side is to the right.
      return done({ angleDegrees: angle, darkReflectance: dark, lightReflectance: light },
        [{ kind: "neutral", reflectance: dark }, { kind: "neutral", reflectance: light }], (u, v) => (u * c - v * s >= 0 ? 1 : 0));
    }
    case "siemens-star": {
      const cycles = integerIn(get("cycles"), "cycles", 2, 360), radius = finiteIn(get("radiusFraction"), "radiusFraction", 0, 1, false);
      if (radius === 0) throw new InvalidConfigurationError("radiusFraction must be positive.");
      const dark = neutral("darkReflectance"), light = neutral("lightReflectance"), background = neutral("backgroundReflectance"), r = radius * aspect;
      return done({ cycles, radiusFraction: radius, darkReflectance: dark, lightReflectance: light, backgroundReflectance: background },
        [{ kind: "neutral", reflectance: dark }, { kind: "neutral", reflectance: light }, { kind: "neutral", reflectance: background }], (u, v) => {
          if (u * u + v * v > r * r) return 2;
          const phase = Math.atan2(v, u) / (2 * Math.PI) + 0.5; // [0, 1]
          return Math.floor(phase * 2 * cycles) % 2 === 0 ? 1 : 0;
        });
    }
    case "step-wedge": {
      const steps = integerIn(get("steps"), "steps", 2, 64), lo = neutral("minimumReflectance"), hi = neutral("maximumReflectance"), spacing = get("spacing");
      if (spacing !== "equal-density" && spacing !== "linear") throw new InvalidConfigurationError("spacing must be equal-density or linear.");
      if (!(hi > lo) || (spacing === "equal-density" && lo <= 0)) throw new InvalidConfigurationError("Step wedge needs 0 < minimum < maximum reflectance.");
      const values = calculateStepWedgeReflectances({ steps, minimumReflectance: lo, maximumReflectance: hi, spacing });
      return done({ steps, minimumReflectance: lo, maximumReflectance: hi, spacing, stepReflectances: values },
        values.map((reflectanceValue) => ({ kind: "neutral" as const, reflectance: reflectanceValue })),
        (u) => Math.min(steps - 1, Math.max(0, Math.floor((u + 1) / 2 * steps))));
    }
    case "grey-ramp": {
      const lo = neutral("minimumReflectance"), hi = neutral("maximumReflectance");
      if (!(hi > lo)) throw new InvalidConfigurationError("Grey ramp needs minimum < maximum reflectance.");
      // A continuous ramp is represented by 1024 neutral levels: the quantization (< 0.1 % of the range) is far below sensor noise.
      const levels = 1024, materials = Array.from({ length: levels }, (_, i) => ({ kind: "neutral" as const, reflectance: lo + (hi - lo) * (i + 0.5) / levels }));
      return done({ minimumReflectance: lo, maximumReflectance: hi, representation: "1024 equal neutral levels" }, materials,
        (u) => Math.min(levels - 1, Math.max(0, Math.floor((u + 1) / 2 * levels))));
    }
    case "checkerboard": {
      const across = integerIn(get("squaresAcross"), "squaresAcross", 2, 256), dark = neutral("darkReflectance"), light = neutral("lightReflectance"), size = 2 / across;
      return done({ squaresAcross: across, darkReflectance: dark, lightReflectance: light },
        [{ kind: "neutral", reflectance: dark }, { kind: "neutral", reflectance: light }],
        (u, v) => ((Math.floor((u + 1) / size) + Math.floor((aspect - v) / size)) % 2 === 0 ? 1 : 0));
    }
    case "point-grid": {
      const columns = integerIn(get("columns"), "columns", 1, 256), rows = integerIn(get("rows"), "rows", 1, 256);
      const radius = finiteIn(get("radius"), "radius", 0, 1, true), point = neutral("pointReflectance"), background = neutral("backgroundReflectance");
      const centers = calculatePointGridCenters({ columns, rows, aspect });
      const cellW = 2 / columns, cellH = 2 * aspect / rows;
      return done({ columns, rows, radius, pointReflectance: point, backgroundReflectance: background },
        [{ kind: "neutral", reflectance: background }, { kind: "neutral", reflectance: point }], (u, v) => {
          const i = Math.min(columns - 1, Math.max(0, Math.floor((u + 1) / cellW))), j = Math.min(rows - 1, Math.max(0, Math.floor((aspect - v) / cellH)));
          const c = centers[j * columns + i]!;
          return (u - c.u) ** 2 + (v - c.v) ** 2 <= radius * radius ? 1 : 0;
        });
    }
    case "patches": {
      const list = record.patches;
      if (!Array.isArray(list) || list.length < 1 || list.length > 1024) throw new InvalidConfigurationError("patches must list 1 to 1024 caller reflectances.");
      const ids = new Set<string>();
      const materials: ResolvedChartScene["materials"][number][] = [];
      for (const [index, patch] of list.entries()) {
        requireInputObject(patch, "patches[" + index + "]");
        const p = patch as Record<string, unknown>;
        for (const key of Object.keys(p)) if (key !== "patchId" && key !== "reflectance") throw new InvalidConfigurationError("Unknown patch field: " + key + ".");
        if (typeof p.patchId !== "string" || p.patchId.trim() === "" || ids.has(p.patchId)) throw new InvalidConfigurationError("Each patch needs a unique non-empty patchId.");
        ids.add(p.patchId);
        materials.push(material(p.reflectance, "patches[" + index + "].reflectance"));
      }
      const columnsRaw = record.columns === undefined ? Math.ceil(Math.sqrt(list.length)) : record.columns;
      if (record.columns === undefined) defaulted.push("columns");
      const columns = integerIn(columnsRaw, "columns", 1, list.length), rows = Math.ceil(list.length / columns);
      const gap = finiteIn(get("gapFraction"), "gapFraction", 0, 0.5), background = neutral("backgroundReflectance");
      if (gap >= 0.5) throw new InvalidConfigurationError("gapFraction must be below 0.5.");
      const backgroundIndex = materials.length;
      materials.push({ kind: "neutral", reflectance: background });
      const cellW = 2 / columns, cellH = 2 * aspect / rows;
      return done({ patchIds: list.map((p: { patchId: string }) => p.patchId), columns, rows, gapFraction: gap, backgroundReflectance: background }, materials, (u, v) => {
        const fx = (u + 1) / cellW, fy = (aspect - v) / cellH, i = Math.floor(fx), j = Math.floor(fy);
        if (i < 0 || j < 0 || i >= columns || j >= rows) return backgroundIndex;
        const index = j * columns + i, x = fx - i, y = fy - j;
        if (index >= list.length || x < gap / 2 || x > 1 - gap / 2 || y < gap / 2 || y > 1 - gap / 2) return backgroundIndex;
        return index;
      });
    }
  }
}

/**
 * Step reflectances of a step wedge. `equal-density` spaces optical density D = -log10(R) evenly
 * (geometric reflectance steps, as on a photographic step tablet); `linear` spaces reflectance evenly.
 */
export function calculateStepWedgeReflectances(input: { steps: number; minimumReflectance: number; maximumReflectance: number;
  spacing: "equal-density" | "linear" }): number[] {
  requireInputObject(input, "calculateStepWedgeReflectances input");
  const steps = integerIn(input.steps, "steps", 2, 64), lo = reflectance(input.minimumReflectance, "minimumReflectance"), hi = reflectance(input.maximumReflectance, "maximumReflectance");
  if (input.spacing !== "equal-density" && input.spacing !== "linear") throw new InvalidConfigurationError("spacing must be equal-density or linear.");
  if (!(hi > lo) || (input.spacing === "equal-density" && lo <= 0)) throw new InvalidConfigurationError("Step wedge needs 0 < minimum < maximum reflectance.");
  return Array.from({ length: steps }, (_, k) => {
    if (k === steps - 1) return hi;
    const t = k / (steps - 1);
    return input.spacing === "linear" ? lo + (hi - lo) * t : lo * (hi / lo) ** t;
  });
}

/** Centres (frame units) of a point grid: one disk centred in each of columns × rows equal cells, row-major from the top-left. */
export function calculatePointGridCenters(input: { columns: number; rows: number; aspect: number }): { u: number; v: number }[] {
  requireInputObject(input, "calculatePointGridCenters input");
  const columns = integerIn(input.columns, "columns", 1, 256), rows = integerIn(input.rows, "rows", 1, 256);
  if (typeof input.aspect !== "number" || !Number.isFinite(input.aspect) || input.aspect <= 0) throw new InvalidConfigurationError("aspect must be positive.");
  const out: { u: number; v: number }[] = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) out.push({ u: -1 + (i + 0.5) * 2 / columns, v: input.aspect - (j + 0.5) * 2 * input.aspect / rows });
  return out;
}
