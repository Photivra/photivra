// SPDX-License-Identifier: Apache-2.0

/**
 * Photivra color patches (2.14): a built-in set of 30 reflectance spectra designed by Photivra for color test charts.
 *
 * Every spectrum is an engine-defined analytic function of wavelength, not measured or copied data: a constant plus a
 * sum of Gaussian bumps and logistic steps,
 *
 *   R(λ) = min(1, max(0, b + Σₖ aₖ·φₖ(λ))),
 *   gaussian:      φ(λ) = exp(−½·((λ − μ)/σ)²)
 *   logistic-rise: φ(λ) = 1 / (1 + exp(−(λ − λ₀)/s))
 *   logistic-fall: φ(λ) = 1 − 1 / (1 + exp(−(λ − λ₀)/s)),
 *
 * with λ in nanometers on 360–830 nm (the CIE 1931 observer's domain). The parameters were fitted once, by
 * Photivra, to Photivra's own target colors (docs/COLOR_PATCHES.md), then rounded. Every spectrum lies in
 * [0.03, 0.901] on its whole domain, so the clamp to [0, 1] never acts; it only states the physical bound. The
 * patches are non-fluorescent (pure reflectances) and the neutral patches are spectrally flat.
 *
 * No third-party chart is copied: the set uses no ColorChecker or other commercial target's patch data, names, order,
 * layout or measured spectra. The names are Photivra's own, and every published color is checked to differ from openly
 * published third-party colors (`scripts/check-color-patch-distinctness.mjs`). The reference CIELAB and sRGB values are computed from these spectra with the CIE 1931
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
/** Wavelengths on which every patch spectrum is defined, nanometers, inclusive. */
export const COLOR_PATCH_WAVELENGTH_RANGE_NANOMETERS = Object.freeze({ minimum: 360, maximum: 830 });

/** One term of a patch spectrum (see the module formula). */
export type ColorPatchSpectralTerm =
  | { kind: "gaussian"; amplitude: number; centerNanometers: number; standardDeviationNanometers: number }
  | { kind: "logistic-rise" | "logistic-fall"; amplitude: number; midpointNanometers: number; scaleNanometers: number };

/** Groups of the patch set, in chart order. */
export type ColorPatchGroup = "neutral" | "strong" | "soft" | "skin" | "memory" | "gamut-edge";

/** The ids of the built-in patches, in the order of the `color-patches` chart (row-major, six per row). */
export const COLOR_PATCH_IDS = Object.freeze([
  "neutral-1", "neutral-2", "neutral-3", "neutral-4", "neutral-5", "neutral-6",
  "red", "yellow", "green", "cyan", "blue", "magenta",
  "red-soft", "yellow-soft", "green-soft", "cyan-soft", "blue-soft", "magenta-soft",
  "skin-pale", "skin-medium", "skin-tan", "skin-deep", "sky-blue", "foliage-green",
  "brick-red", "sand", "teal", "lavender", "deep-orange", "deep-violet"
] as const);
export type ColorPatchId = (typeof COLOR_PATCH_IDS)[number];

/**
 * One built-in patch: its id, short code, name, reason for being on the chart, spectrum definition and reference
 * colorimetry.
 */
export interface ColorPatch {
  /** Stable API id, e.g. `"skin-medium"`. */
  patchId: ColorPatchId;
  /**
   * Stable short code for labels and printed charts: `PV-` and a group letter and number, e.g. `"PV-N4"`. The letters are
   * N neutral, S strong, T soft (tint), P skin (portrait), M memory and G gamut-edge, numbered in chart order.
   */
  code: string;
  /** Photivra's own descriptive name, in US English, e.g. `"Studio Gray 4"`; not a third-party color name. */
  name: string;
  group: ColorPatchGroup;
  /** One sentence: why the patch is on the chart. */
  reason: string;
  /** The constant b of the formula. */
  base: number;
  terms: readonly ColorPatchSpectralTerm[];
  /**
   * Reference colorimetry of the reflectance (not of a rendered capture): CIELAB under CIE illuminant D65 with the CIE
   * 1931 2° observer, the CIE tables at 1 nm over 360–830 nm, white = the perfect diffuser under D65 (Y = 100); and the
   * sRGB color of that XYZ (CSS Color 4 matrix, after XYZ scaling of the D65 table white to the sRGB white),
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
type Definition = [ColorPatchId, string, string, ColorPatchGroup, number, ColorPatchSpectralTerm[], [number, number, number], string, string];
/* Generated reference values: node scripts/compute-color-patch-reference.mjs --print (see docs/COLOR_PATCHES.md). */
const DEFINITIONS: readonly Definition[] = [
  ["neutral-1", "PV-N1", "Studio Gray 1", "neutral", 0.901, [], [96.04, 0, 0], "#F4F4F4",
    "The white end of the flat gray ramp (90.1 %): the reference for white balance, exposure and highlight clipping."],
  ["neutral-2", "PV-N2", "Studio Gray 2", "neutral", 0.585, [], [81.02, 0, 0], "#C9C9C9",
    "A light flat gray about 15 L* below the white, for the upper tone curve and highlight roll-off."],
  ["neutral-3", "PV-N3", "Studio Gray 3", "neutral", 0.354, [], [66.06, 0, 0], "#A1A1A1",
    "A light-mid flat gray that continues the ramp in equal lightness steps, for tone-curve and gamma checks."],
  ["neutral-4", "PV-N4", "Studio Gray 4", "neutral", 0.197, [], [51.5, 0, 0], "#7B7B7B",
    "The mid-gray of the ramp, near an 18 % card's lightness, for exposure and neutral balance in the midtones."],
  ["neutral-5", "PV-N5", "Studio Gray 5", "neutral", 0.093, [], [36.56, 0, 0], "#565656",
    "A dark flat gray that shows shadow tone separation, noise and any color cast in the shadows."],
  ["neutral-6", "PV-N6", "Studio Gray 6", "neutral", 0.035, [], [21.94, 0, 0], "#353535",
    "The black end of the ramp (3.5 %), for black level, shadow noise and flare."],
  ["red", "PV-S1", "Darkroom Red", "strong", 0.031, [rise(0.757, 611.6, 16.2)], [43.7, 54.15, 39.93], "#BF3428",
    "A strong red, for saturated reds, which clip and shift in hue easily in a camera's red channel."],
  ["yellow", "PV-S2", "Flashbulb Yellow", "strong", 0.071, [rise(0.602, 518.7, 13.2)], [78.87, -0.23, 73.26], "#E6C02A",
    "A strong yellow, bright and high in chroma, that shows whether light saturated colors keep their hue."],
  ["green", "PV-S3", "Hedgerow Green", "strong", 0.051, [g(0.317, 535.8, 36.9)], [57.08, -47.07, 33.2], "#359C4C",
    "A strong mid green, for the green primary, where camera and display gamuts differ most."],
  ["cyan", "PV-S4", "Harbor Cyan", "strong", 0.096, [g(0.339, 482.5, 60.4)], [58.4, -21.56, -17.23], "#3C98AA",
    "A strong cyan between the green and blue primaries, a region where overlapping camera responses mix the channels."],
  ["blue", "PV-S5", "Cyanotype Blue", "strong", 0.064, [g(0.336, 460.7, 24.7)], [35.27, 19.89, -46.48], "#3C4C9E",
    "A strong dark blue, for the blue channel, its noise and the shift of saturated blues toward purple."],
  ["magenta", "PV-S6", "Filter Magenta", "strong", 0.05, [g(0.258, 440, 32.8), rise(0.549, 605, 15)], [46.11, 55, -18.91], "#B4408E",
    "A strong magenta, a non-spectral hue made of both ends of the spectrum, so it tests the red and blue channels together."],
  ["red-soft", "PV-T1", "Faded Print Red", "soft", 0.196, [rise(0.472, 601.8, 13)], [59.63, 29.17, 14.19], "#C77B78",
    "A soft red at lower chroma and higher lightness, for gentle reds that a color matrix should not oversaturate."],
  ["yellow-soft", "PV-T2", "Window Glow Yellow", "soft", 0.246, [rise(0.414, 509, 17.6)], [81.15, -2.88, 36.43], "#DCC985",
    "A soft light yellow, for pale warm tones whose hue drifts easily toward green or orange."],
  ["green-soft", "PV-T3", "Misty Hedgerow Green", "soft", 0.184, [g(0.251, 535.7, 47.4)], [66.82, -24.11, 16.11], "#7FAE85",
    "A soft green, for the muted greens that fill much of a natural scene."],
  ["cyan-soft", "PV-T4", "Shallow Water Cyan", "soft", 0.246, [g(0.339, 487.4, 61.9)], [71.51, -16.99, -10.71], "#7DB9C2",
    "A soft cyan, for pale blue-greens such as water and glass, where small hue errors are easy to see."],
  ["blue-soft", "PV-T5", "Distant Hill Blue", "soft", 0.207, [g(0.319, 457.6, 34.7)], [56.48, 7.42, -30.88], "#7486BD",
    "A soft blue, for the hazy blues of distance and open shade that white balance acts on."],
  ["magenta-soft", "PV-T6", "Faded Filter Magenta", "soft", 0.196, [g(0.231, 440, 33.1), rise(0.256, 575.8, 15)], [61.36, 26.09, -10.98], "#B984A8",
    "A soft magenta, for pinks and mauves that lie between the red and blue channels."],
  ["skin-pale", "PV-P1", "Fair Portrait Tone", "skin", 0.408, [rise(0.394, 562.5, 31.7)], [81.35, 9.48, 17.48], "#E8C3AA",
    "A fair skin tone, the lightest of four, for portrait color, where viewers notice small errors."],
  ["skin-medium", "PV-P2", "Medium Portrait Tone", "skin", 0.213, [rise(0.376, 570.3, 30.4)], [67.25, 13.65, 22.01], "#C99A7D",
    "A medium skin tone, the second of four that span a range of skin lightness at similar hue."],
  ["skin-tan", "PV-P3", "Tan Portrait Tone", "skin", 0.084, [rise(0.295, 573.7, 31.3)], [52.01, 15.71, 26.72], "#A3714F",
    "A tan skin tone, the third of four, for warm midtone skin under different lights."],
  ["skin-deep", "PV-P4", "Deep Portrait Tone", "skin", 0.034, [rise(0.133, 590.3, 32.4)], [33, 13.57, 18.02], "#6A4532",
    "A deep skin tone, the darkest of four, for skin color and detail in the darker tones of a portrait."],
  ["sky-blue", "PV-M1", "Midday Sky", "memory", 0.18, [fall(0.455, 507.2, 29.7)], [60.05, 0.53, -33.31], "#6893CB",
    "A clear-sky blue, a memory color that viewers judge against what they remember of the sky."],
  ["foliage-green", "PV-M2", "Canopy Green", "memory", 0.034, [g(0.139, 555, 30.7), rise(0.411, 716.8, 12)], [40.81, -22.4, 30.31], "#4B692C",
    "A leaf green with the steep rise of leaf reflectance at the red edge, a memory color that also exposes infrared leakage."],
  ["brick-red", "PV-M3", "Warehouse Brick", "memory", 0.05, [rise(0.308, 592.7, 16.2)], [41.63, 32.81, 25.53], "#9C4A3A",
    "A dull brick red, a common building color between the saturated reds and the skin tones."],
  ["sand", "PV-M4", "Low Tide Sand", "memory", 0.272, [rise(0.371, 504.9, 37.6)], [79.14, 0.48, 22.19], "#D5C29B",
    "A pale sand, a light warm near-neutral that shows small casts a gray patch would hide."],
  ["teal", "PV-M5", "Estuary Teal", "memory", 0.085, [g(0.197, 498.2, 42)], [48.43, -24.88, -5.64], "#2E7F7C",
    "A dark blue-green between the green and cyan hues, for water and shaded foliage in that region."],
  ["lavender", "PV-M6", "Wildflower Lilac", "memory", 0.331, [g(0.298, 445, 30.4), rise(0.137, 623.4, 20)], [66.69, 14.8, -22.7], "#A99BCB",
    "A pale blue-violet, a flower color that cameras often render too blue."],
  ["deep-orange", "PV-G1", "Sunset Flare Orange", "gamut-edge", 0.03, [rise(0.74, 591.3, 16.7)], [53.19, 52.38, 56.53], "#DC511A",
    "A deep orange close to the sRGB gamut boundary, for gamut mapping and clipping of saturated warm colors."],
  ["deep-violet", "PV-G2", "Blacklight Violet", "gamut-edge", 0.031, [g(0.37, 441.6, 25.6), rise(0.097, 640, 20)], [26.42, 48.9, -59.69], "#4C1E9C",
    "A deep violet close to the sRGB gamut boundary, for gamut mapping and the camera's response at short wavelengths."]
];

function deepFreezePatch(patch: ColorPatch): ColorPatch {
  for (const term of patch.terms) Object.freeze(term);
  Object.freeze(patch.terms);
  Object.freeze(patch.reference.cielabD65);
  Object.freeze(patch.reference);
  return Object.freeze(patch);
}
const PATCHES: readonly ColorPatch[] = Object.freeze(DEFINITIONS.map(([patchId, code, name, group, base, terms, lab, hex, reason]) => deepFreezePatch({
  patchId, code, name, group, reason, base, terms, reference: { cielabD65: lab, srgbHex: hex, inSrgbGamut: true }
})));
const BY_ID = new Map<string, ColorPatch>(PATCHES.map((p) => [p.patchId, p]));
const SET: ColorPatchSet = Object.freeze({ setId: COLOR_PATCH_SET_ID, version: COLOR_PATCH_SET_VERSION,
  wavelengthRangeNanometers: COLOR_PATCH_WAVELENGTH_RANGE_NANOMETERS, columns: 6, patches: PATCHES });

/**
 * The built-in Photivra color-patch set: every patch's id, code, name, group, reason, spectrum parameters and reference CIELAB (D65,
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
        throw new InvalidScientificInputError("Color patch " + patch.patchId + " is defined on " + range.minimum + "–" + range.maximum + " nm.");
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
  /** Vacuum wavelength, nanometers, in 360–830. */
  wavelengthNanometers: number;
}

/**
 * The reflectance (dimensionless, in [0, 1]) of a built-in color patch at one wavelength, from its analytic formula.
 * Labeled `approximation`: the spectra are Photivra's own smooth designs, not measurements of a physical sample.
 */
export function evaluateColorPatchReflectance(input: EvaluateColorPatchReflectanceInput): CalculationResult<{ reflectance: number }> {
  requireInputKeys(input, "evaluateColorPatchReflectance", ["patchId", "wavelengthNanometers"]);
  const patch = findColorPatch(input.patchId);
  if (!patch) throw new InvalidConfigurationError("patchId must be one of the built-in color patches (COLOR_PATCH_IDS).");
  const nm = input.wavelengthNanometers, range = COLOR_PATCH_WAVELENGTH_RANGE_NANOMETERS;
  if (typeof nm !== "number" || !Number.isFinite(nm) || nm < range.minimum || nm > range.maximum) {
    throw new InvalidScientificInputError("wavelengthNanometers must be a finite wavelength from 360 to 830 nm.");
  }
  return approximationResult({ reflectance: reflectanceOf(patch, nm) }, "photivra-color-patch-spectrum", COLOR_PATCH_SET_VERSION,
    ["Photivra's own analytic design (a constant plus Gaussian and logistic terms), not a measured sample", "Non-fluorescent Lambertian reflectance"]);
}
