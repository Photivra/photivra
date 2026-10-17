// SPDX-License-Identifier: Apache-2.0

/**
 * CIELAB / CIELCh(ab) conversions and colour-difference formulae.
 *
 * - CIELAB (W3C CSS Color 4 Lab; also CIE 15:2018 §8.2.1) with the exact rational constants ε = (6/29)³ and
 *   κ = (29/3)³ in the linear segment.
 * - ΔE*ab 1976: Euclidean CIELAB distance.
 * - ΔE*94: asymmetric (first colour is the reference: S_L = 1, S_C = 1 + K₁C*₁, S_H = 1 + K₂C*₁). The
 *   default is the formula's published reference conditions (k_L = k_C = k_H = 1, K₁ = 0.045,
 *   K₂ = 0.015, often called "graphic arts"); callers may pass their own factors in `cie94Factors`.
 *   The engine ships no other preset. The primary source, CIE 116-1995, is not free. The tests check
 *   the closed forms for pure lightness, chroma and hue differences and the reference asymmetry.
 * - CIEDE2000, implemented from the formula and implementation notes in Sharma, Wu & Dalal
 *   (2005), Color Res. Appl. 30(1):21–30 (paper free at
 *   https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/; also CIE 142-2001, ISO/CIE 11664-6).
 *   This includes the hue-angle averaging and the handling of the hue discontinuity. The tests check
 *   its closed forms for pure lightness, chroma and hue differences (computed in the test), symmetry
 *   and identity; the published test pairs are not used (their data file has no licence).
 * @see docs/COLORIMETRY.md for equations, coordinate/unit conventions and limits.
 */

import { calculatedResult, type CalculationResult } from "../core/calculation-result.js";
import { InvalidScientificInputError } from "../core/validation.js";
import { COLORIMETRY_MODEL_VERSION } from "./color-matching-functions.js";
import {
  parseWhiteXyz,
  parseXyz,
  requireFiniteNumber,
  requireFiniteResult,
  requireNonNegativeNumber,
  requirePositiveNumber,
  requireRecordValue,
  type CieXyzTristimulus
} from "./colorimetry-math.js";
import { rejectUnknownFields, requireInputKeys } from "../core/record-validation.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";

/** CIE 1976 L*a*b* coordinates. */
export interface CielabColor {
  lStar: number;
  aStar: number;
  bStar: number;
}

/** CIE 1976 L*C*h(ab) coordinates; hue in degrees [0, 360). */
export interface CielchColor {
  lStar: number;
  chromaStar: number;
  hueDegrees: number;
}

const EPSILON = (6 / 29) ** 3;
const KAPPA = (29 / 3) ** 3;

function f(t: number): number {
  return t > EPSILON ? Math.cbrt(t) : (KAPPA * t + 16) / 116;
}
function fInverse(t: number): number {
  return t > 6 / 29 ? t ** 3 : (116 * t - 16) / KAPPA;
}

/** Internal: XYZ → CIELAB with a validated white (no envelope). */
export function cielabOfXyz(xyz: CieXyzTristimulus, white: CieXyzTristimulus): CielabColor {
  const fx = f(xyz.x / white.x), fy = f(xyz.y / white.y), fz = f(xyz.z / white.z);
  return { lStar: 116 * fy - 16, aStar: 500 * (fx - fy), bStar: 200 * (fy - fz) };
}

/** Internal: CIELAB → XYZ. */
export function xyzOfCielab(lab: CielabColor, white: CieXyzTristimulus): CieXyzTristimulus {
  const fy = (lab.lStar + 16) / 116, fx = fy + lab.aStar / 500, fz = fy - lab.bStar / 200;
  return { x: white.x * fInverse(fx), y: white.y * fInverse(fy), z: white.z * fInverse(fz) };
}

function parseLab(value: unknown, path: string): CielabColor {
  const r = requireRecordValue(value, path);
  rejectUnknownFields(r, ["lStar", "aStar", "bStar"], path);
  return { lStar: requireFiniteNumber(r.lStar, path + ".lStar"), aStar: requireFiniteNumber(r.aStar, path + ".aStar"), bStar: requireFiniteNumber(r.bStar, path + ".bStar") };
}

function parseWhite(value: unknown): CieXyzTristimulus {
  const w = parseWhiteXyz(value, "referenceWhiteXyz");
  if (!(w.x > 0) || !(w.z > 0)) throw new InvalidScientificInputError("referenceWhiteXyz components must be greater than zero.");
  return w;
}

/** CIE XYZ → CIELAB relative to a reference white (same XYZ scale). */
export function calculateCielabFromXyz(input: { xyz: CieXyzTristimulus; referenceWhiteXyz: CieXyzTristimulus }): CalculationResult<CielabColor> {
  requireInputKeys(input, "calculateCielabFromXyz", ["xyz", "referenceWhiteXyz"]);
  const lab = cielabOfXyz(parseXyz(input.xyz, "xyz"), parseWhite(input.referenceWhiteXyz));
  requireFiniteResult([lab.lStar, lab.aStar, lab.bStar], "CIELAB conversion");
  return calculatedResult(lab, "cielab-1976", COLORIMETRY_MODEL_VERSION, ["CIELAB as defined in W3C CSS Color 4 (Lab) with exact (6/29)³ and (29/3)³ constants"]);
}

/** CIELAB → CIE XYZ relative to a reference white. */
export function calculateXyzFromCielab(input: { lab: CielabColor; referenceWhiteXyz: CieXyzTristimulus }): CalculationResult<CieXyzTristimulus> {
  requireInputKeys(input, "calculateXyzFromCielab", ["lab", "referenceWhiteXyz"]);
  const xyz = xyzOfCielab(parseLab(input.lab, "lab"), parseWhite(input.referenceWhiteXyz));
  requireFiniteResult([xyz.x, xyz.y, xyz.z], "CIELAB inverse");
  return calculatedResult(xyz, "cielab-1976-inverse", COLORIMETRY_MODEL_VERSION, ["CIELAB inverse as defined in W3C CSS Color 4 (Lab)"]);
}

/** Internal: CIELAB → LCh(ab). */
export function cielchOfCielab(lab: CielabColor): CielchColor {
  const hue = (Math.atan2(lab.bStar, lab.aStar) * 180) / Math.PI;
  return { lStar: lab.lStar, chromaStar: Math.hypot(lab.aStar, lab.bStar), hueDegrees: hue < 0 ? hue + 360 : hue };
}

/** Internal: LCh(ab) → CIELAB. */
export function cielabOfCielch(lch: CielchColor): CielabColor {
  const h = (lch.hueDegrees * Math.PI) / 180;
  return { lStar: lch.lStar, aStar: lch.chromaStar * Math.cos(h), bStar: lch.chromaStar * Math.sin(h) };
}

/** CIELAB → CIE LCh(ab): C*ab = √(a*² + b*²), h_ab = atan2(b*, a*) in degrees. */
export function calculateCielchFromCielab(input: { lab: CielabColor }): CalculationResult<CielchColor> {
  requireInputKeys(input, "calculateCielchFromCielab", ["lab"]);
  return calculatedResult(cielchOfCielab(parseLab(input.lab, "lab")), "cielch-ab", COLORIMETRY_MODEL_VERSION);
}

/** CIE LCh(ab) → CIELAB. */
export function calculateCielabFromCielch(input: { lch: CielchColor }): CalculationResult<CielabColor> {
  requireInputKeys(input, "calculateCielabFromCielch", ["lch"]);
  const r = requireRecordValue(input.lch, "lch");
  rejectUnknownFields(r, ["lStar", "chromaStar", "hueDegrees"], "lch");
  const lch = {
    lStar: requireFiniteNumber(r.lStar, "lch.lStar"),
    chromaStar: requireFiniteNumber(r.chromaStar, "lch.chromaStar"),
    hueDegrees: requireFiniteNumber(r.hueDegrees, "lch.hueDegrees")
  };
  if (lch.chromaStar < 0) throw new InvalidScientificInputError("lch.chromaStar must not be negative.");
  return calculatedResult(cielabOfCielch(lch), "cielch-ab-inverse", COLORIMETRY_MODEL_VERSION);
}

/** Colour-difference formula. */
export type ColorDifferenceFormula = "cie76" | "cie94" | "ciede2000";

/** CIEDE2000 parametric factors (default 1, 1, 1 for reference conditions). */
export interface Ciede2000ParametricFactors {
  lightness: number;
  chroma: number;
  hue: number;
}

/**
 * CIE94 parametric factors k_L, k_C, k_H and weighting constants K₁, K₂ (S_C = 1 + K₁C*₁,
 * S_H = 1 + K₂C*₁). The default is the reference conditions: 1, 1, 1, 0.045, 0.015.
 */
export interface Cie94ParametricFactors {
  /** k_L, greater than zero. */
  lightness: number;
  /** k_C, greater than zero. */
  chroma: number;
  /** k_H, greater than zero. */
  hue: number;
  /** K₁ in S_C = 1 + K₁C*₁; finite and not negative. */
  k1: number;
  /** K₂ in S_H = 1 + K₂C*₁; finite and not negative. */
  k2: number;
}

/** CIE94 reference conditions (k_L = k_C = k_H = 1, K₁ = 0.045, K₂ = 0.015). */
const CIE94_REFERENCE_FACTORS: Cie94ParametricFactors = { lightness: 1, chroma: 1, hue: 1, k1: 0.045, k2: 0.015 };

const DEG = Math.PI / 180;

/** Internal: ΔE*ab 1976. */
export function deltaE76(a: CielabColor, b: CielabColor): number {
  return Math.hypot(a.lStar - b.lStar, a.aStar - b.aStar, a.bStar - b.bStar);
}

/** Internal: ΔE*94 with reference colour `reference`. */
export function deltaE94(reference: CielabColor, sample: CielabColor, factors: Cie94ParametricFactors = CIE94_REFERENCE_FACTORS): number {
  const { lightness: kL, chroma: kC, hue: kH, k1, k2 } = factors;
  const c1 = Math.hypot(reference.aStar, reference.bStar), c2 = Math.hypot(sample.aStar, sample.bStar);
  const dL = reference.lStar - sample.lStar, dC = c1 - c2;
  const da = reference.aStar - sample.aStar, db = reference.bStar - sample.bStar;
  const dH2 = Math.max(0, da * da + db * db - dC * dC);
  const sC = 1 + k1 * c1, sH = 1 + k2 * c1;
  return Math.sqrt((dL / kL) ** 2 + (dC / (kC * sC)) ** 2 + dH2 / (kH * sH) ** 2);
}

function hueDegrees(b: number, a: number): number {
  if (a === 0 && b === 0) return 0;
  const h = Math.atan2(b, a) / DEG;
  return h < 0 ? h + 360 : h;
}

/** Internal: CIEDE2000 (Sharma, Wu & Dalal 2005 implementation notes). */
export function deltaE2000(lab1: CielabColor, lab2: CielabColor, k: Ciede2000ParametricFactors = { lightness: 1, chroma: 1, hue: 1 }): number {
  const pow25to7 = 25 ** 7;
  const c1 = Math.hypot(lab1.aStar, lab1.bStar), c2 = Math.hypot(lab2.aStar, lab2.bStar);
  const cBar7 = ((c1 + c2) / 2) ** 7;
  const g = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + pow25to7)));
  const a1 = (1 + g) * lab1.aStar, a2 = (1 + g) * lab2.aStar;
  const cp1 = Math.hypot(a1, lab1.bStar), cp2 = Math.hypot(a2, lab2.bStar);
  const hp1 = hueDegrees(lab1.bStar, a1), hp2 = hueDegrees(lab2.bStar, a2);
  const dL = lab2.lStar - lab1.lStar, dC = cp2 - cp1;
  const chromaProduct = cp1 * cp2;
  let dh = 0;
  if (chromaProduct !== 0) {
    dh = hp2 - hp1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(chromaProduct) * Math.sin((dh * DEG) / 2);
  const lBar = (lab1.lStar + lab2.lStar) / 2, cBarP = (cp1 + cp2) / 2;
  let hBar = hp1 + hp2;
  if (chromaProduct !== 0) {
    if (Math.abs(hp1 - hp2) <= 180) hBar /= 2;
    else hBar = hBar < 360 ? (hBar + 360) / 2 : (hBar - 360) / 2;
  }
  const t = 1 - 0.17 * Math.cos((hBar - 30) * DEG) + 0.24 * Math.cos(2 * hBar * DEG) + 0.32 * Math.cos((3 * hBar + 6) * DEG) - 0.20 * Math.cos((4 * hBar - 63) * DEG);
  const dTheta = 30 * Math.exp(-(((hBar - 275) / 25) ** 2));
  const cBarP7 = cBarP ** 7;
  const rC = 2 * Math.sqrt(cBarP7 / (cBarP7 + pow25to7));
  const l50 = (lBar - 50) ** 2;
  const sL = 1 + (0.015 * l50) / Math.sqrt(20 + l50), sC = 1 + 0.045 * cBarP, sH = 1 + 0.015 * cBarP * t;
  const rT = -Math.sin(2 * dTheta * DEG) * rC;
  const tl = dL / (k.lightness * sL), tc = dC / (k.chroma * sC), th = dH / (k.hue * sH);
  return Math.sqrt(Math.max(0, tl * tl + tc * tc + th * th + rT * tc * th));
}

export interface CalculateColorDifferenceInput {
  /** Reference (standard) colour; ΔE94 is asymmetric in it. */
  reference: CielabColor;
  sample: CielabColor;
  formula: ColorDifferenceFormula;
  /** CIEDE2000 only; defaults to 1, 1, 1. */
  parametricFactors?: Ciede2000ParametricFactors;
  /** CIE94 only; all five fields are required when given. Defaults to the reference conditions 1, 1, 1, 0.045, 0.015. */
  cie94Factors?: Cie94ParametricFactors;
}

function parseCie94Factors(value: unknown): Cie94ParametricFactors {
  const r = requireRecordValue(value, "cie94Factors");
  requireInputKeys(r, "calculateColorDifference cie94Factors", ["lightness", "chroma", "hue", "k1", "k2"]);
  return {
    lightness: requirePositiveNumber(r.lightness, "cie94Factors.lightness"),
    chroma: requirePositiveNumber(r.chroma, "cie94Factors.chroma"),
    hue: requirePositiveNumber(r.hue, "cie94Factors.hue"),
    k1: requireNonNegativeNumber(r.k1, "cie94Factors.k1"),
    k2: requireNonNegativeNumber(r.k2, "cie94Factors.k2")
  };
}

/** Colour difference between two CIELAB colours with an explicit formula. */
export function calculateColorDifference(input: CalculateColorDifferenceInput): CalculationResult<{ deltaE: number; formula: ColorDifferenceFormula }> {
  requireInputKeys(input, "calculateColorDifference", ["reference", "sample", "formula", "parametricFactors", "cie94Factors"]);
  const reference = parseLab(input.reference, "reference");
  const sample = parseLab(input.sample, "sample");
  let deltaE: number;
  switch (input.formula) {
    case "cie76": deltaE = deltaE76(reference, sample); break;
    case "cie94": deltaE = deltaE94(reference, sample, input.cie94Factors === undefined ? undefined : parseCie94Factors(input.cie94Factors)); break;
    case "ciede2000": {
      let k: Ciede2000ParametricFactors | undefined;
      if (input.parametricFactors !== undefined) {
        const r = requireRecordValue(input.parametricFactors, "parametricFactors");
        requireInputKeys(r, "calculateColorDifference parametricFactors", ["lightness", "chroma", "hue"]);
        k = { lightness: requirePositiveNumber(r.lightness, "parametricFactors.lightness"), chroma: requirePositiveNumber(r.chroma, "parametricFactors.chroma"), hue: requirePositiveNumber(r.hue, "parametricFactors.hue") };
      }
      deltaE = deltaE2000(reference, sample, k);
      break;
    }
    default: throw new InvalidConfigurationError("formula is not supported.");
  }
  requireFiniteResult([deltaE], "Colour difference");
  if (input.formula !== "ciede2000" && input.parametricFactors !== undefined) {
    throw new InvalidScientificInputError("parametricFactors apply only to CIEDE2000.");
  }
  if (input.formula !== "cie94" && input.cie94Factors !== undefined) {
    throw new InvalidScientificInputError("cie94Factors apply only to CIE94.");
  }
  return calculatedResult({ deltaE, formula: input.formula }, "color-difference-" + input.formula, COLORIMETRY_MODEL_VERSION);
}
