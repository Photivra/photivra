// SPDX-License-Identifier: Apache-2.0

/**
 * Wide-gamut and HDR output primitives (standalone; output wiring belongs to the
 * SDR/export stages):
 * - RGB ↔ XYZ matrices derived numerically from primary and white chromaticities
 *   (SMPTE RP 177-1993 method), never copied matrices.
 *   sRGB / BT.709: ITU-R BT.709-6 and W3C CSS Color 4 `srgb` (also IEC 61966-2-1:1999); Display P3:
 *   P3 primaries with D65 white as specified for `display-p3` in W3C CSS Color 4 (also SMPTE EG 432-1:2010);
 *   BT.2020 / BT.2100: ITU-R BT.2020-2, BT.2100-3. All use D65 (0.3127, 0.3290).
 * - Transfer functions: sRGB (W3C CSS Color 4; also IEC 61966-2-1; also Display P3), BT.709 OETF, BT.1886 EOTF
 *   (ITU-R BT.1886), ITU-R BT.2100 PQ (also SMPTE ST 2084) EOTF and inverse, BT.2100 HLG OETF,
 *   inverse OETF and reference EOTF/OOTF with system gamma (BT.2100-3 Table 5, Note 5f).
 * Constants are the published values of those standards.
 * @see docs/COLORIMETRY.md for equations, coordinate/unit conventions and limits.
 */

import { calculatedResult, type CalculationResult } from "../core/calculation-result.js";
import { InvalidScientificInputError } from "../core/validation.js";
import { decodeSrgbComponent, encodeSrgbComponent } from "./srgb-transfer.js";
import { COLORIMETRY_MODEL_VERSION } from "./color-matching-functions.js";
import {
  copyMatrix,
  invertMatrix3x3,
  multiplyMatrixVector,
  parseChromaticity,
  requireFiniteNumber,
  requireFiniteResult,
  requireNonNegativeNumber,
  requirePositiveNumber,
  requireRecordValue,
  xyzOfChromaticity,
  type CieXyChromaticity,
  type CieXyzTristimulus,
  type ColorMatrix3x3,
  type ColorVector3
} from "./colorimetry-math.js";
import { requireInputObject, requireInputKeys } from "../core/record-validation.js";

/** RGB primaries as CIE 1931 xy chromaticities. */
export interface RgbPrimaryChromaticities {
  red: CieXyChromaticity;
  green: CieXyChromaticity;
  blue: CieXyChromaticity;
}

export interface RgbToXyzMatrices {
  /** Linear RGB (white = 1, 1, 1) → XYZ with white Y = 1. */
  rgbToXyz: ColorMatrix3x3;
  xyzToRgb: ColorMatrix3x3;
  whiteXyz: CieXyzTristimulus;
}

/** Internal: SMPTE RP 177 derivation without an envelope. */
export function rgbToXyzMatrices(primaries: RgbPrimaryChromaticities, white: CieXyChromaticity): RgbToXyzMatrices {
  const p = requireRecordValue(primaries, "primaries");
  const columns = (["red", "green", "blue"] as const).map((k) => xyzOfChromaticity(parseChromaticity(p[k], "primaries." + k)));
  const basis: ColorMatrix3x3 = [
    [columns[0]!.x, columns[1]!.x, columns[2]!.x],
    [columns[0]!.y, columns[1]!.y, columns[2]!.y],
    [columns[0]!.z, columns[1]!.z, columns[2]!.z]
  ];
  const whiteXyz = xyzOfChromaticity(parseChromaticity(white, "whiteChromaticity"));
  const s = multiplyMatrixVector(invertMatrix3x3(basis, "primary matrix"), [whiteXyz.x, whiteXyz.y, whiteXyz.z]);
  if (s.some((v) => !(v > 0))) throw new InvalidScientificInputError("The white point must lie strictly inside the primary triangle.");
  const rgbToXyz = basis.map((row) => row.map((v, i) => v * s[i]!)) as unknown as ColorMatrix3x3;
  return { rgbToXyz, xyzToRgb: invertMatrix3x3(rgbToXyz, "rgbToXyz"), whiteXyz };
}

/**
 * Derives RGB ↔ XYZ matrices from primaries and white chromaticity (SMPTE RP 177):
 * columns are the primaries' XYZ (Y = 1) scaled so that RGB (1, 1, 1) maps to the white.
 */
export function calculateRgbToXyzMatrices(input: { primaries: RgbPrimaryChromaticities; whiteChromaticity: CieXyChromaticity }): CalculationResult<RgbToXyzMatrices> {
  requireInputObject(input, "calculateRgbToXyzMatrices input");
  const value = rgbToXyzMatrices(input.primaries, input.whiteChromaticity);
  requireFiniteResult([...value.rgbToXyz.flat(), ...value.xyzToRgb.flat()], "RGB matrix derivation");
  return calculatedResult(value, "rgb-xyz-matrix-smpte-rp177", COLORIMETRY_MODEL_VERSION);
}

export type RgbColorSpaceId = "srgb" | "display-p3" | "rec709" | "rec2020";
export type RgbTransferFunctionId = "srgb" | "bt709-oetf-bt1886-eotf" | "bt2020-oetf";

export interface RgbColorSpaceDefinition extends RgbToXyzMatrices {
  id: RgbColorSpaceId;
  primaries: RgbPrimaryChromaticities;
  whiteChromaticity: CieXyChromaticity;
  /** Conventional non-linear encoding of this space when not used with PQ/HLG. */
  transferFunction: RgbTransferFunctionId;
  sources: readonly string[];
}

const D65_CHROMATICITY: CieXyChromaticity = Object.freeze({ x: 0.3127, y: 0.3290 });
const BT709_PRIMARIES: RgbPrimaryChromaticities = { red: { x: 0.64, y: 0.33 }, green: { x: 0.30, y: 0.60 }, blue: { x: 0.15, y: 0.06 } };
const SPACES: Readonly<Record<RgbColorSpaceId, { primaries: RgbPrimaryChromaticities; transferFunction: RgbTransferFunctionId; sources: readonly string[] }>> = {
  srgb: { primaries: BT709_PRIMARIES, transferFunction: "srgb", sources: ["IEC 61966-2-1:1999", "ITU-R BT.709-6"] },
  rec709: { primaries: BT709_PRIMARIES, transferFunction: "bt709-oetf-bt1886-eotf", sources: ["ITU-R BT.709-6", "ITU-R BT.1886"] },
  "display-p3": {
    primaries: { red: { x: 0.680, y: 0.320 }, green: { x: 0.265, y: 0.690 }, blue: { x: 0.150, y: 0.060 } },
    transferFunction: "srgb", sources: ["SMPTE EG 432-1:2010 (P3 primaries)", "W3C CSS Color Module Level 4 display-p3 (D65, sRGB transfer)"]
  },
  rec2020: {
    primaries: { red: { x: 0.708, y: 0.292 }, green: { x: 0.170, y: 0.797 }, blue: { x: 0.131, y: 0.046 } },
    transferFunction: "bt2020-oetf", sources: ["ITU-R BT.2020-2", "ITU-R BT.2100-3 (same primaries for PQ/HLG)"]
  }
};

/** Resolves a named RGB colour space with numerically derived matrices (all D65). */
export function resolveRgbColorSpace(id: RgbColorSpaceId): CalculationResult<RgbColorSpaceDefinition> {
  const space = typeof id === "string" && Object.hasOwn(SPACES, id) ? SPACES[id] : undefined;
  if (space === undefined) throw new InvalidScientificInputError("Unknown RGB colour space.");
  const matrices = rgbToXyzMatrices(space.primaries, D65_CHROMATICITY);
  const value: RgbColorSpaceDefinition = {
    id, primaries: JSON.parse(JSON.stringify(space.primaries)) as RgbPrimaryChromaticities, whiteChromaticity: { ...D65_CHROMATICITY },
    transferFunction: space.transferFunction, sources: [...space.sources],
    rgbToXyz: copyMatrix(matrices.rgbToXyz), xyzToRgb: copyMatrix(matrices.xyzToRgb), whiteXyz: matrices.whiteXyz
  };
  return calculatedResult(value, "rgb-color-space-" + id, COLORIMETRY_MODEL_VERSION, ["Matrices derived from primaries and D65 white (SMPTE RP 177)"]);
}

// ---------------------------------------------------------------- transfers

/** sRGB / Display P3 encoding (W3C CSS Color 4; also IEC 61966-2-1) of one linear component; negative values use the linear segment. */
export function evaluateSrgbEncoding(linear: number): number {
  return encodeSrgbComponent(requireFiniteNumber(linear, "linear"));
}

/** sRGB / Display P3 decoding of one non-linear component. */
export function evaluateSrgbDecoding(encoded: number): number {
  return decodeSrgbComponent(requireFiniteNumber(encoded, "encoded"));
}

/**
 * ITU-R BT.709-6 / BT.2020-2 (10-bit) OETF: V = 4.5 L for L < 0.018, otherwise
 * 1.099 L^0.45 − 0.099. Scene-referred camera encoding, not a display EOTF.
 */
export function evaluateBt709Oetf(sceneLinear: number): number {
  const l = requireFiniteNumber(sceneLinear, "sceneLinear");
  return l < 0.018 ? 4.5 * l : 1.099 * l ** 0.45 - 0.099;
}

/** Inverse of the BT.709 OETF: L = V/4.5 for V < 0.081, otherwise ((V + 0.099)/1.099)^(1/0.45). */
export function evaluateBt709InverseOetf(encoded: number): number {
  const v = requireFiniteNumber(encoded, "encoded");
  return v < 4.5 * 0.018 ? v / 4.5 : ((v + 0.099) / 1.099) ** (1 / 0.45);
}

export interface Bt1886Eotf {
  whiteLuminanceCdPerSquareMeter: number;
  blackLuminanceCdPerSquareMeter: number;
  /** a = (Lw^(1/γ) − Lb^(1/γ))^γ */
  a: number;
  /** b = Lb^(1/γ) / (Lw^(1/γ) − Lb^(1/γ)) */
  b: number;
  /** L = a · max(V + b, 0)^2.4 in cd/m². */
  decode(signal: number): number;
  /** Inverse: V = (L/a)^(1/2.4) − b. */
  encode(luminanceCdPerSquareMeter: number): number;
}

/** Prepares the ITU-R BT.1886 reference EOTF (γ = 2.4) for a display's white and black luminance. */
export function prepareBt1886Eotf(input: { whiteLuminanceCdPerSquareMeter: number; blackLuminanceCdPerSquareMeter: number }): Bt1886Eotf {
  requireInputKeys(input, "prepareBt1886Eotf", ["whiteLuminanceCdPerSquareMeter", "blackLuminanceCdPerSquareMeter"]);
  const lw = requirePositiveNumber(input.whiteLuminanceCdPerSquareMeter, "whiteLuminanceCdPerSquareMeter");
  const lb = requireNonNegativeNumber(input.blackLuminanceCdPerSquareMeter, "blackLuminanceCdPerSquareMeter");
  if (!(lb < lw)) throw new InvalidScientificInputError("blackLuminanceCdPerSquareMeter must be below the white luminance.");
  const g = 2.4, root = lw ** (1 / g) - lb ** (1 / g);
  const a = root ** g, b = lb ** (1 / g) / root;
  return Object.freeze({
    whiteLuminanceCdPerSquareMeter: lw, blackLuminanceCdPerSquareMeter: lb, a, b,
    decode: (signal: number) => a * Math.max(requireFiniteNumber(signal, "signal") + b, 0) ** g,
    encode: (luminance: number) => (requireNonNegativeNumber(luminance, "luminanceCdPerSquareMeter") / a) ** (1 / g) - b
  });
}

/** ITU-R BT.2100 PQ constants (also SMPTE ST 2084). */
export const PQ_CONSTANTS = Object.freeze({
  m1: 2610 / 16384,
  m2: (2523 / 4096) * 128,
  c1: 3424 / 4096,
  c2: (2413 / 4096) * 32,
  c3: (2392 / 4096) * 32,
  peakLuminanceCdPerSquareMeter: 10000
});

/** PQ reference EOTF: non-linear signal E′ ∈ [0, 1] → displayed luminance F_D in cd/m² (0–10000). */
export function evaluatePqEotf(signal: number): number {
  const e = requireFiniteNumber(signal, "signal");
  if (e < 0 || e > 1) throw new InvalidScientificInputError("PQ signal must lie in [0, 1].");
  const { m1, m2, c1, c2, c3 } = PQ_CONSTANTS;
  const p = e ** (1 / m2);
  return 10000 * (Math.max(p - c1, 0) / (c2 - c3 * p)) ** (1 / m1);
}

/** PQ inverse EOTF: luminance F_D in cd/m² (0–10000) → non-linear signal E′. */
export function evaluatePqInverseEotf(luminanceCdPerSquareMeter: number): number {
  const fd = requireNonNegativeNumber(luminanceCdPerSquareMeter, "luminanceCdPerSquareMeter");
  if (fd > 10000) throw new InvalidScientificInputError("PQ luminance must not exceed 10000 cd/m².");
  const { m1, m2, c1, c2, c3 } = PQ_CONSTANTS;
  const y = (fd / 10000) ** m1;
  return ((c1 + c2 * y) / (1 + c3 * y)) ** m2;
}

/** BT.2100 HLG OETF constants (b, c computed from a as specified). */
export const HLG_CONSTANTS = Object.freeze({
  a: 0.17883277,
  b: 1 - 4 * 0.17883277,
  c: 0.5 - 0.17883277 * Math.log(4 * 0.17883277)
});

/** HLG reference OETF: scene-linear E ∈ [0, 1] → E′. */
export function evaluateHlgOetf(sceneLinear: number): number {
  const e = requireFiniteNumber(sceneLinear, "sceneLinear");
  if (e < 0 || e > 1) throw new InvalidScientificInputError("HLG scene-linear value must lie in [0, 1].");
  const { a, b, c } = HLG_CONSTANTS;
  return e <= 1 / 12 ? Math.sqrt(3 * e) : a * Math.log(12 * e - b) + c;
}

/** HLG inverse OETF: E′ ∈ [0, 1] → scene-linear E. */
export function evaluateHlgInverseOetf(signal: number): number {
  const x = requireFiniteNumber(signal, "signal");
  if (x < 0 || x > 1) throw new InvalidScientificInputError("HLG signal must lie in [0, 1].");
  const { a, b, c } = HLG_CONSTANTS;
  return x <= 0.5 ? (x * x) / 3 : (Math.exp((x - c) / a) + b) / 12;
}

/**
 * HLG system gamma for nominal peak luminance L_W (BT.2100-3 Note 5f):
 * γ = 1.2 + 0.42 log10(L_W/1000) for 400–2000 cd/m², otherwise the extended form
 * γ = 1.2 · 1.111^(log2(L_W/1000)).
 */
export function calculateHlgSystemGamma(input: { nominalPeakLuminanceCdPerSquareMeter: number }): CalculationResult<{ systemGamma: number }> {
  requireInputKeys(input, "calculateHlgSystemGamma", ["nominalPeakLuminanceCdPerSquareMeter"]);
  const lw = requirePositiveNumber(input.nominalPeakLuminanceCdPerSquareMeter, "nominalPeakLuminanceCdPerSquareMeter");
  const gamma = lw >= 400 && lw <= 2000 ? 1.2 + 0.42 * Math.log10(lw / 1000) : 1.2 * 1.111 ** Math.log2(lw / 1000);
  return calculatedResult({ systemGamma: gamma }, "bt2100-hlg-system-gamma", COLORIMETRY_MODEL_VERSION);
}

export interface HlgReferenceDisplay {
  nominalPeakLuminanceCdPerSquareMeter: number;
  blackLuminanceCdPerSquareMeter: number;
  systemGamma: number;
  /** β = √(3 (L_B/L_W)^(1/γ)) */
  blackLevelLift: number;
  /** OOTF: scene-linear BT.2100 RGB ∈ [0, 1] → display RGB in cd/m² (F_D = α Y_S^(γ−1) E, α = L_W). */
  ootf(sceneLinearRgb: ColorVector3): ColorVector3;
  /** EOTF: HLG signal RGB → display RGB in cd/m² = OOTF(OETF⁻¹(max(0, (1 − β)E′ + β))). */
  eotf(signalRgb: ColorVector3): ColorVector3;
}

/** Prepares the BT.2100 HLG reference OOTF/EOTF for a display (BT.2100-3 Table 5). */
export function prepareHlgReferenceDisplay(input: { nominalPeakLuminanceCdPerSquareMeter: number; blackLuminanceCdPerSquareMeter: number; systemGamma?: number }): HlgReferenceDisplay {
  requireInputKeys(input, "prepareHlgReferenceDisplay", ["nominalPeakLuminanceCdPerSquareMeter", "blackLuminanceCdPerSquareMeter", "systemGamma"]);
  const lw = requirePositiveNumber(input.nominalPeakLuminanceCdPerSquareMeter, "nominalPeakLuminanceCdPerSquareMeter");
  const lb = requireNonNegativeNumber(input.blackLuminanceCdPerSquareMeter, "blackLuminanceCdPerSquareMeter");
  if (!(lb < lw)) throw new InvalidScientificInputError("blackLuminanceCdPerSquareMeter must be below the peak luminance.");
  const gamma = input.systemGamma === undefined
    ? calculateHlgSystemGamma({ nominalPeakLuminanceCdPerSquareMeter: lw }).value.systemGamma
    : requirePositiveNumber(input.systemGamma, "systemGamma");
  const beta = Math.sqrt(3 * (lb / lw) ** (1 / gamma));
  const ootf = (rgb: ColorVector3): ColorVector3 => {
    const e = rgb.map((v, i) => requireFiniteNumber(v, "sceneLinearRgb[" + i + "]")) as unknown as ColorVector3;
    if (e.some((v) => v < 0 || v > 1)) throw new InvalidScientificInputError("HLG scene-linear RGB must lie in [0, 1].");
    const ys = 0.2627 * e[0] + 0.6780 * e[1] + 0.0593 * e[2];
    const scale = ys > 0 ? lw * ys ** (gamma - 1) : 0;
    return [scale * e[0], scale * e[1], scale * e[2]];
  };
  return Object.freeze({
    nominalPeakLuminanceCdPerSquareMeter: lw, blackLuminanceCdPerSquareMeter: lb, systemGamma: gamma, blackLevelLift: beta, ootf,
    eotf: (signal: ColorVector3): ColorVector3 => ootf(signal.map((v, i) => {
      const s = requireFiniteNumber(v, "signalRgb[" + i + "]");
      if (s < 0 || s > 1) throw new InvalidScientificInputError("HLG signal must lie in [0, 1].");
      // The published 8-digit a, b, c make OETF⁻¹(1) exceed 1 by ~1e-8; bound it to the nominal range.
      return Math.min(1, evaluateHlgInverseOetf(Math.max(0, (1 - beta) * s + beta)));
    }) as unknown as ColorVector3)
  });
}
