// SPDX-License-Identifier: Apache-2.0

/**
 * Module boundary and integration notes.
 * Perceptual gamut mapping into a bounded linear RGB cube [0, 1]³ by hue- and
 * lightness-preserving chroma reduction toward the neutral axis in CIE LCh(ab).
 *
 * Method: for each colour, L* and h_ab are held; the gamut-boundary chroma C_max(L*, h)
 * is found by bisection; chroma above a knee k·C_max is compressed smoothly,
 * C′ = kC_max + (1 − k)C_max·tanh((C − kC_max)/((1 − k)C_max)), which is continuous,
 * monotone and never reaches C_max; k = 1 is hard clipping to the boundary along constant
 * (L*, h) ("chroma clipping"). This follows the constant-lightness/constant-hue chroma
 * reduction family surveyed by Morovič (2008), Color Gamut Mapping (Wiley), §10, and the
 * binary-search chroma reduction approach of W3C CSS Color Module Level 4 §13 (which
 * uses OKLCh; this independent implementation uses CIELAB to avoid additional
 * third-party matrices). Known limitation: CIELAB hue is not perceptually constant for
 * saturated blues, so blue hues can shift toward purple. Lightness outside [0, 100] is
 * clipped to black/white. Results are an approximation of perceptual preservation.
 * Input XYZ must be relative to the target space's D65 white with white Y = 1.
 * @see docs/COLORIMETRY.md for equations, coordinate/unit conventions and limits.
 */

import { approximationResult, type CalculationResult } from "../core/calculation-result.js";
import { InvalidScientificInputError } from "../core/validation.js";
import { COLORIMETRY_MODEL_VERSION } from "./color-matching-functions.js";
import { cielabOfXyz, xyzOfCielab } from "./color-difference.js";
import {
  multiplyMatrixVector,
  parseXyz,
  requireNonNegativeNumber,
  vectorToXyz,
  xyzToVector,
  type CieXyzTristimulus,
  type ColorVector3
} from "./colorimetry-math.js";
import { resolveRgbColorSpace, type RgbColorSpaceId } from "./rgb-color-spaces.js";
import { requireInputObject } from "../core/record-validation.js";

export type GamutMappingMethod = "cielab-hue-preserving-chroma-compression";

export interface PrepareRgbGamutMappingInput {
  colorSpace: RgbColorSpaceId;
  method: GamutMappingMethod;
  /** Fraction of the boundary chroma left untouched, in [0, 1]; 1 = clip to boundary. */
  kneeFraction: number;
}

export interface GamutMappedColor {
  /** Linear RGB in the target space, each component in [0, 1]. */
  linearRgb: ColorVector3;
  /** True when lightness or chroma was changed. */
  adjusted: boolean;
  /** Lightness was outside [0, 100] and was clipped to black or white. */
  lightnessClipped: boolean;
}

export interface PreparedRgbGamutMapping {
  colorSpace: RgbColorSpaceId;
  kneeFraction: number;
  /** Maps one XYZ colour (D65-relative, white Y = 1). */
  map(xyz: ColorVector3): GamutMappedColor;
}

const IN_GAMUT_TOLERANCE = 1e-12;
const BISECTION_STEPS = 60;

function inCube(rgb: ColorVector3): boolean {
  return rgb.every((v) => v >= -IN_GAMUT_TOLERANCE && v <= 1 + IN_GAMUT_TOLERANCE);
}

function clampCube(rgb: ColorVector3): ColorVector3 {
  return rgb.map((v) => Math.min(1, Math.max(0, v))) as unknown as ColorVector3;
}

/** Validates the target space once and returns a reusable per-colour mapper. */
export function prepareRgbGamutMapping(input: PrepareRgbGamutMappingInput): PreparedRgbGamutMapping {
  requireInputObject(input, "prepareRgbGamutMapping input");
  if (input.method !== "cielab-hue-preserving-chroma-compression") throw new InvalidScientificInputError("method is not supported.");
  const k = requireNonNegativeNumber(input.kneeFraction, "kneeFraction");
  if (k > 1) throw new InvalidScientificInputError("kneeFraction must lie in [0, 1].");
  const space = resolveRgbColorSpace(input.colorSpace).value;
  const white = space.whiteXyz;
  const toRgb = (lStar: number, a: number, b: number): ColorVector3 =>
    multiplyMatrixVector(space.xyzToRgb, xyzToVector(xyzOfCielab({ lStar, aStar: a, bStar: b }, white)));
  return Object.freeze({
    colorSpace: space.id,
    kneeFraction: k,
    map(xyzInput: ColorVector3): GamutMappedColor {
      const xyz: CieXyzTristimulus = parseXyz(vectorToXyz(xyzInput), "xyz");
      const rgb = multiplyMatrixVector(space.xyzToRgb, xyzInput);
      const lab = cielabOfXyz(xyz, white);
      if (!(lab.lStar > 0)) return { linearRgb: [0, 0, 0], adjusted: !rgb.every((v) => v === 0), lightnessClipped: true };
      if (lab.lStar >= 100) {
        return { linearRgb: [1, 1, 1], adjusted: !rgb.every((v) => Math.abs(v - 1) <= IN_GAMUT_TOLERANCE), lightnessClipped: lab.lStar > 100 };
      }
      const chroma = Math.hypot(lab.aStar, lab.bStar);
      const inside = inCube(rgb);
      if (chroma === 0 || (inside && k === 1)) return { linearRgb: clampCube(rgb), adjusted: false, lightnessClipped: false };
      const ua = lab.aStar / chroma, ub = lab.bStar / chroma;
      // Boundary chroma at constant L*, h by bisection; the neutral point is inside the cube.
      let lo = 0, hi = chroma;
      if (inside) {
        hi = Math.max(chroma, 1);
        while (inCube(toRgb(lab.lStar, ua * hi, ub * hi)) && hi < 1e4) hi *= 2;
      }
      for (let i = 0; i < BISECTION_STEPS; i++) {
        const mid = (lo + hi) / 2;
        if (inCube(toRgb(lab.lStar, ua * mid, ub * mid))) lo = mid; else hi = mid;
      }
      const cMax = lo;
      const knee = k * cMax;
      let mapped = chroma;
      if (chroma > knee) {
        mapped = k === 1 || cMax === 0 ? cMax : knee + (1 - k) * cMax * Math.tanh((chroma - knee) / ((1 - k) * cMax));
        mapped = Math.min(mapped, cMax);
      }
      if (mapped === chroma && inside) return { linearRgb: clampCube(rgb), adjusted: false, lightnessClipped: false };
      return { linearRgb: clampCube(toRgb(lab.lStar, ua * mapped, ub * mapped)), adjusted: true, lightnessClipped: false };
    }
  });
}

/** Maps one D65-relative XYZ colour into a target RGB gamut (see module notes). */
export function calculateGamutMappedColor(input: PrepareRgbGamutMappingInput & { xyz: CieXyzTristimulus }): CalculationResult<GamutMappedColor> {
  requireInputObject(input, "calculateGamutMappedColor input");
  const xyz = parseXyz(input.xyz, "xyz");
  const value = prepareRgbGamutMapping(input).map(xyzToVector(xyz));
  return approximationResult(value, "gamut-mapping-cielab-chroma-compression", COLORIMETRY_MODEL_VERSION, [
    "Constant CIELAB L* and hue; chroma reduced toward the neutral axis with a tanh knee",
    "CIELAB hue is not perceptually constant for saturated blues; lightness outside [0, 100] is clipped"
  ]);
}
