// SPDX-License-Identifier: Apache-2.0

/**
 * Photivra colour patches (2.14): a built-in set of 30 reflectance spectra designed by Photivra for colour test charts.
 *
 * Every spectrum is an engine-defined analytic function of wavelength, not measured or copied data: a constant plus a
 * sum of Gaussian bumps and logistic steps,
 *
 *   R(λ) = min(1, max(0, b + Σₖ aₖ·φₖ(λ))),
 *   gaussian:      φ(λ) = exp(−½·((λ − μ)/σ)²)
 *   logistic-rise: φ(λ) = 1 / (1 + exp(−(λ − λ₀)/s))
 *   logistic-fall: φ(λ) = 1 − 1 / (1 + exp(−(λ − λ₀)/s)),
 *
 * with λ in nanometres on 360–830 nm (the CIE 1931 observer's domain). The parameters were fitted once, by
 * Photivra, to Photivra's own target colours (docs/COLOR_PATCHES.md), then rounded. Every spectrum lies in
 * [0.027, 0.9] on its whole domain, so the clamp to [0, 1] never acts; it only states the physical bound. The
 * patches are non-fluorescent (pure reflectances) and the neutral patches are spectrally flat.
 *
 * No third-party chart is copied: the set uses no ColorChecker or other commercial target's patch data, names, order,
 * layout or measured spectra. The reference CIELAB and sRGB values are computed from these spectra with the CIE 1931
 * 2° observer and CIE illuminant D65 (`scripts/compute-color-patch-reference.mjs`).
 *
 * Captures evaluate the exponentials with `Math.exp`, like the engine's other continuous chart formulas. The display
 * view passes the portable `portableExp` instead (`resolvePortableChartScene`), so its chart presets' patch
 * reflectances have the same bits in every JavaScript engine (docs/DISPLAY_VIEW.md, "Same bytes in every engine").
 */

import { approximationResult, type CalculationResult } from "../core/calculation-result.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";
import { InvalidScientificInputError } from "../core/validation.js";
import { requireInputKeys } from "../core/record-validation.js";
import type { PreparedColorimetricSpectrum } from "../color/color-matching-functions.js";

/** Identity of the built-in patch set. */
export const COLOR_PATCH_SET_ID = "photivra-color-patches";
/** Version of the patch set's spectra and reference values; a change to any spectrum changes it. */
export const COLOR_PATCH_SET_VERSION = "1.0.0";
/** Wavelengths on which every patch spectrum is defined, nanometres, inclusive. */
export const COLOR_PATCH_WAVELENGTH_RANGE_NANOMETERS = /* @__PURE__ */ Object.freeze({ minimum: 360, maximum: 830 });

/** One term of a patch spectrum (see the module formula). */
export type ColorPatchSpectralTerm =
  | { kind: "gaussian"; amplitude: number; centerNanometers: number; standardDeviationNanometers: number }
  | { kind: "logistic-rise" | "logistic-fall"; amplitude: number; midpointNanometers: number; scaleNanometers: number };

/** Groups of the patch set, in chart order. */
export type ColorPatchGroup = "neutral" | "strong" | "soft" | "skin" | "memory" | "gamut-edge";

/** The ids of the built-in patches, in the order of the `color-patches` chart (row-major, six per row). */
export const COLOR_PATCH_IDS = /* @__PURE__ */ Object.freeze([
  "neutral-1", "neutral-2", "neutral-3", "neutral-4", "neutral-5", "neutral-6",
  "red", "yellow", "green", "cyan", "blue", "magenta",
  "red-soft", "yellow-soft", "green-soft", "cyan-soft", "blue-soft", "magenta-soft",
  "skin-pale", "skin-medium", "skin-tan", "skin-deep", "sky-blue", "foliage-green",
  "brick-red", "sand", "teal", "lavender", "deep-orange", "deep-violet"
] as const);
export type ColorPatchId = (typeof COLOR_PATCH_IDS)[number];

/** One built-in patch: its id, a plain English name, its spectrum definition and its reference colorimetry. */
export interface ColorPatch {
  patchId: ColorPatchId;
  name: string;
  group: ColorPatchGroup;
  /** The constant b of the formula. */
  base: number;
  terms: readonly ColorPatchSpectralTerm[];
  /**
   * Reference colorimetry of the reflectance (not of a rendered capture): CIELAB under CIE illuminant D65 with the CIE
   * 1931 2° observer, the CIE tables at 1 nm over 360–830 nm, white = the perfect diffuser under D65 (Y = 100); and the
   * sRGB colour of that XYZ (CSS Color 4 matrix, after XYZ scaling of the D65 table white to the sRGB white),
   * 8-bit hex. Rounded for publication: L*, a*, b* to 0.01.
   */
  reference: { cielabD65: readonly [number, number, number]; srgbHex: string; inSrgbGamut: boolean };
}

/** The built-in patch set (see {@link getColorPatchSet}). */
export interface ColorPatchSet {
  setId: typeof COLOR_PATCH_SET_ID;
  version: typeof COLOR_PATCH_SET_VERSION;
  wavelengthRangeNanometers: { minimum: number; maximum: number };
  /** Patches per row of the `color-patches` chart's default layout. */
  columns: number;
  patches: readonly ColorPatch[];
}

const g = (amplitude: number, centerNanometers: number, standardDeviationNanometers: number): ColorPatchSpectralTerm =>
  ({ kind: "gaussian", amplitude, centerNanometers, standardDeviationNanometers });
const rise = (amplitude: number, midpointNanometers: number, scaleNanometers: number): ColorPatchSpectralTerm =>
  ({ kind: "logistic-rise", amplitude, midpointNanometers, scaleNanometers });
const fall = (amplitude: number, midpointNanometers: number, scaleNanometers: number): ColorPatchSpectralTerm =>
  ({ kind: "logistic-fall", amplitude, midpointNanometers, scaleNanometers });
type Definition = [ColorPatchId, string, ColorPatchGroup, number, ColorPatchSpectralTerm[], [number, number, number], string];
/* Generated reference values: node scripts/compute-color-patch-reference.mjs --print (see docs/COLOR_PATCHES.md). */
const DEFINITIONS: readonly Definition[] = [
  ["neutral-1", "Neutral 1, white (90 %)", "neutral", 0.9, [], [96, 0, 0], "#F3F3F3"],
  ["neutral-2", "Neutral 2, light grey (58.5 %)", "neutral", 0.585, [], [81.02, 0, 0], "#C9C9C9"],
  ["neutral-3", "Neutral 3, light-mid grey (35.3 %)", "neutral", 0.353, [], [65.98, 0, 0], "#A0A0A0"],
  ["neutral-4", "Neutral 4, mid grey (19.3 %)", "neutral", 0.193, [], [51.04, 0, 0], "#7A7A7A"],
  ["neutral-5", "Neutral 5, dark grey (9 %)", "neutral", 0.09, [], [35.98, 0, 0], "#555555"],
  ["neutral-6", "Neutral 6, black (3.2 %)", "neutral", 0.032, [], [20.83, 0, 0], "#323232"],
  ["red", "Red", "strong", 0.038, [rise(0.773, 609.6, 11.2)], [43.75, 59.12, 35.74], "#C42B30"],
  ["yellow", "Yellow", "strong", 0.071, [rise(0.602, 518.7, 13.2)], [78.87, -0.23, 73.26], "#E6C02A"],
  ["green", "Green", "strong", 0.048, [g(0.308, 537, 37.6)], [56.59, -45.57, 33.69], "#3A9A4A"],
  ["cyan", "Cyan", "strong", 0.086, [g(0.401, 484.3, 56)], [59.38, -26.08, -19.25], "#1A9DB0"],
  ["blue", "Blue", "strong", 0.056, [g(0.351, 456.8, 32)], [35.86, 18.89, -50.44], "#2F4FA6"],
  ["magenta", "Magenta", "strong", 0.05, [g(0.258, 440, 32.8), rise(0.549, 605, 15)], [46.11, 55, -18.91], "#B4408E"],
  ["red-soft", "Soft red", "soft", 0.196, [rise(0.472, 601.8, 13)], [59.63, 29.17, 14.19], "#C77B78"],
  ["yellow-soft", "Soft yellow", "soft", 0.246, [rise(0.414, 509, 17.6)], [81.15, -2.88, 36.43], "#DCC985"],
  ["green-soft", "Soft green", "soft", 0.184, [g(0.251, 535.7, 47.4)], [66.82, -24.11, 16.11], "#7FAE85"],
  ["cyan-soft", "Soft cyan", "soft", 0.246, [g(0.339, 487.4, 61.9)], [71.51, -16.99, -10.71], "#7DB9C2"],
  ["blue-soft", "Soft blue", "soft", 0.207, [g(0.319, 457.6, 34.7)], [56.48, 7.42, -30.88], "#7486BD"],
  ["magenta-soft", "Soft magenta", "soft", 0.196, [g(0.231, 440, 33.1), rise(0.256, 575.8, 15)], [61.36, 26.09, -10.98], "#B984A8"],
  ["skin-pale", "Pale skin tone", "skin", 0.408, [rise(0.394, 562.5, 31.7)], [81.35, 9.48, 17.48], "#E8C3AA"],
  ["skin-medium", "Medium skin tone", "skin", 0.213, [rise(0.376, 570.3, 30.4)], [67.25, 13.65, 22.01], "#C99A7D"],
  ["skin-tan", "Tan skin tone", "skin", 0.084, [rise(0.295, 573.7, 31.3)], [52.01, 15.71, 26.72], "#A3714F"],
  ["skin-deep", "Deep skin tone", "skin", 0.034, [rise(0.133, 590.3, 32.4)], [33, 13.57, 18.02], "#6A4532"],
  ["sky-blue", "Sky blue", "memory", 0.187, [fall(0.424, 509.6, 30.4)], [60.59, -0.5, -30.79], "#6B95C8"],
  ["foliage-green", "Foliage green", "memory", 0.034, [g(0.142, 555.7, 31.3), rise(0.4, 715, 12)], [41.26, -21.99, 30.95], "#4D6A2C"],
  ["brick-red", "Brick red", "memory", 0.05, [rise(0.308, 592.7, 16.2)], [41.63, 32.81, 25.53], "#9C4A3A"],
  ["sand", "Sand", "memory", 0.268, [rise(0.384, 507.8, 38.5)], [79.13, 0.98, 22.72], "#D6C29A"],
  ["teal", "Teal", "memory", 0.085, [g(0.197, 498.2, 42)], [48.43, -24.88, -5.64], "#2E7F7C"],
  ["lavender", "Lavender", "memory", 0.331, [g(0.298, 445, 30.4), rise(0.137, 623.4, 20)], [66.69, 14.8, -22.7], "#A99BCB"],
  ["deep-orange", "Deep orange", "gamut-edge", 0.027, [rise(0.824, 586.3, 13.6)], [56.71, 58.31, 64.93], "#F0520B"],
  ["deep-violet", "Deep violet", "gamut-edge", 0.031, [g(0.37, 441.6, 25.6), rise(0.097, 640, 20)], [26.42, 48.9, -59.69], "#4C1E9C"]
];

function deepFreezePatch(patch: ColorPatch): ColorPatch {
  for (const term of patch.terms) Object.freeze(term);
  Object.freeze(patch.terms);
  Object.freeze(patch.reference.cielabD65);
  Object.freeze(patch.reference);
  return Object.freeze(patch);
}
const PATCHES: readonly ColorPatch[] = Object.freeze(DEFINITIONS.map(([patchId, name, group, base, terms, lab, hex]) => deepFreezePatch({
  patchId, name, group, base, terms, reference: { cielabD65: lab, srgbHex: hex, inSrgbGamut: true }
})));
const BY_ID = new Map<string, ColorPatch>(PATCHES.map((p) => [p.patchId, p]));
const SET: ColorPatchSet = /* @__PURE__ */ Object.freeze({ setId: COLOR_PATCH_SET_ID, version: COLOR_PATCH_SET_VERSION,
  wavelengthRangeNanometers: COLOR_PATCH_WAVELENGTH_RANGE_NANOMETERS, columns: 6, patches: PATCHES });

/**
 * The built-in Photivra colour-patch set: every patch's id, name, group, spectrum parameters and reference CIELAB (D65,
 * CIE 1931 2°) and sRGB values. A static, deeply frozen engine contract. Pass a patch to a chart as
 * `{ kind: "color-patch", patchId }` wherever a chart reflectance is accepted, or draw the whole set with the
 * `color-patches` chart preset.
 */
export function getColorPatchSet(): ColorPatchSet {
  return SET;
}

/** Internal: the patch with this id, or undefined. */
export function findColorPatch(patchId: unknown): ColorPatch | undefined {
  return typeof patchId === "string" ? BY_ID.get(patchId) : undefined;
}

/** An exponential: `Math.exp`, or the display view's portable one. */
type Exponential = (x: number) => number;
/** The unclamped formula value b + Σ aₖφₖ(λ) (the clamp never acts on the built-in set; a test checks it). */
function formula(patch: ColorPatch, nm: number, exp: Exponential): number {
  let value = patch.base;
  for (const term of patch.terms) {
    if (term.kind === "gaussian") {
      const z = (nm - term.centerNanometers) / term.standardDeviationNanometers;
      value += term.amplitude * exp(-0.5 * z * z);
    } else {
      const step = 1 / (1 + exp(-(nm - term.midpointNanometers) / term.scaleNanometers));
      value += term.amplitude * (term.kind === "logistic-rise" ? step : 1 - step);
    }
  }
  return value;
}
function reflectanceOf(patch: ColorPatch, nm: number, exp: Exponential = Math.exp): number {
  return Math.min(1, Math.max(0, formula(patch, nm, exp)));
}
/** Internal (for tests): the formula before the clamp. */
export function evaluateUnclampedColorPatchFormula(patchId: ColorPatchId, wavelengthNanometers: number, exp: Exponential = Math.exp): number {
  return formula(BY_ID.get(patchId)!, wavelengthNanometers, exp);
}

/** Prepared spectra per exponential (Math.exp for captures, the portable one for the display view), then per patch. */
const PREPARED = new Map<Exponential, Map<string, PreparedColorimetricSpectrum>>();
/** Most wavelengths whose values a prepared patch spectrum keeps (a capture uses a few dozen quadrature nodes). */
const PREPARED_CACHE_LIMIT = 4096;
/**
 * Internal: a prepared reflectance spectrum of a built-in patch. Values are memoized per wavelength (the formula is pure),
 * so a capture's per-query lookups cost one map access instead of the exponentials.
 */
export function prepareColorPatchSpectrum(patch: ColorPatch, exp: Exponential = Math.exp): PreparedColorimetricSpectrum {
  let byPatch = PREPARED.get(exp);
  if (!byPatch) PREPARED.set(exp, byPatch = new Map());
  const existing = byPatch.get(patch.patchId);
  if (existing) return existing;
  const range = COLOR_PATCH_WAVELENGTH_RANGE_NANOMETERS, cache = new Map<number, number>();
  const prepared: PreparedColorimetricSpectrum = Object.freeze({
    wavelengthRangeNanometers: range,
    evaluate(nm: number): number {
      const hit = cache.get(nm);
      if (hit !== undefined) return hit;
      if (typeof nm !== "number" || !(nm >= range.minimum && nm <= range.maximum)) {
        throw new InvalidScientificInputError("Colour patch " + patch.patchId + " is defined on " + range.minimum + "–" + range.maximum + " nm.");
      }
      const value = reflectanceOf(patch, nm, exp);
      if (cache.size < PREPARED_CACHE_LIMIT) cache.set(nm, value);
      return value;
    }
  });
  byPatch.set(patch.patchId, prepared);
  return prepared;
}

/** Input of {@link evaluateColorPatchReflectance}. */
export interface EvaluateColorPatchReflectanceInput {
  patchId: ColorPatchId;
  /** Vacuum wavelength, nanometres, in 360–830. */
  wavelengthNanometers: number;
}

/**
 * The reflectance (dimensionless, in [0, 1]) of a built-in colour patch at one wavelength, from its analytic formula.
 * Labelled `approximation`: the spectra are Photivra's own smooth designs, not measurements of a physical sample.
 */
export function evaluateColorPatchReflectance(input: EvaluateColorPatchReflectanceInput): CalculationResult<{ reflectance: number }> {
  requireInputKeys(input, "evaluateColorPatchReflectance", ["patchId", "wavelengthNanometers"]);
  const patch = findColorPatch(input.patchId);
  if (!patch) throw new InvalidConfigurationError("patchId must be one of the built-in colour patches (COLOR_PATCH_IDS).");
  const nm = input.wavelengthNanometers, range = COLOR_PATCH_WAVELENGTH_RANGE_NANOMETERS;
  if (typeof nm !== "number" || !Number.isFinite(nm) || nm < range.minimum || nm > range.maximum) {
    throw new InvalidScientificInputError("wavelengthNanometers must be a finite wavelength from 360 to 830 nm.");
  }
  return approximationResult({ reflectance: reflectanceOf(patch, nm) }, "photivra-color-patch-spectrum", COLOR_PATCH_SET_VERSION,
    ["Photivra's own analytic design (a constant plus Gaussian and logistic terms), not a measured sample", "Non-fluorescent Lambertian reflectance"]);
}
