// SPDX-License-Identifier: Apache-2.0

/**
 * Von Kries-type linear chromatic adaptation transforms (CATs) on CIE XYZ:
 *   M = C⁻¹ · diag(Dᵢ) · C,  Dᵢ = D · (Y_s / Y_d) · (ρᵢ,d / ρᵢ,s) + 1 − D
 * where C maps XYZ to a cone-like ("sharpened") space, ρ_s and ρ_d are the source and
 * destination whites in that space, and D ∈ [0, 1] is the degree of adaptation. This is
 * the one-step, two-illuminant form of Li et al. (2017) for CAT16; it is used for every
 * transform here. With D = 1 and equal white luminance, the source white maps exactly to
 * the destination white.
 *
 * Cone matrices (published factual constants):
 * - Bradford (linearized): Lam (1985) thesis, University of Bradford; Luo & Rhodes
 *   (1999); as used in ICC.1:2010 Annex E. The original blue-channel non-linearity is
 *   omitted, as in common practice.
 * - CAT16: Li, Li, Wang, Xu, Luo, Cui, Melgosa & Pointer (2016), "A Revision of CIECAM02
 *   and its CAT and UCS", IS&T CIC24, pp. 208–212, Eq. (15) (M16),
 *   doi:10.2352/ISSN.2169-2629.2017.32.208 (free from the IS&T library). Journal version:
 *   Li et al. (2017), "Comprehensive color solutions: CAM16, CAT16, and CAM16-UCS",
 *   Color Res. Appl. 42(6):703–718.
 * - XYZ scaling: identity cone matrix (diagonal scaling in XYZ; the weakest model).
 * The degree of adaptation D is supplied by the caller (default 1, complete adaptation).
 * CAT02, the von Kries Hunt–Pointer–Estévez matrix and the CIECAM02 formula for D are not
 * part of 2.0: no free source we could confirm prints them (owner decisions, 2026-10-17).
 * @see docs/COLORIMETRY.md for equations, coordinate/unit conventions and limits.
 */

import { calculatedResult, type CalculationResult } from "../core/calculation-result.js";
import { InvalidScientificInputError } from "../core/validation.js";
import { COLORIMETRY_MODEL_VERSION } from "./color-matching-functions.js";
import {
  copyMatrix,
  diagonalMatrix,
  invertMatrix3x3,
  multiplyMatrices,
  multiplyMatrixVector,
  parseWhiteXyz,
  parseXyz,
  requireFiniteResult,
  requireNonNegativeNumber,
  vectorToXyz,
  xyzToVector,
  type CieXyzTristimulus,
  type ColorMatrix3x3
} from "./colorimetry-math.js";
import { requireInputKeys } from "../core/record-validation.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";

/** Supported linear chromatic-adaptation transforms. */
export type ChromaticAdaptationTransform = "bradford" | "cat16" | "xyz-scaling";

export const CHROMATIC_ADAPTATION_TRANSFORMS: readonly ChromaticAdaptationTransform[] = /* @__PURE__ */ Object.freeze(["bradford", "cat16", "xyz-scaling"]);

const CONE_MATRICES: Readonly<Record<ChromaticAdaptationTransform, ColorMatrix3x3>> = /* @__PURE__ */ Object.freeze({
  bradford: [[0.8951, 0.2664, -0.1614], [-0.7502, 1.7135, 0.0367], [0.0389, -0.0685, 1.0296]],
  cat16: [[0.401288, 0.650173, -0.051461], [-0.250268, 1.204414, 0.045854], [-0.002079, 0.048952, 0.953127]],
  "xyz-scaling": [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
});

function requireTransform(value: unknown): ChromaticAdaptationTransform {
  if (typeof value !== "string" || !(CHROMATIC_ADAPTATION_TRANSFORMS as readonly string[]).includes(value)) {
    throw new InvalidConfigurationError("transform must be one of: " + CHROMATIC_ADAPTATION_TRANSFORMS.join(", ") + ".");
  }
  return value as ChromaticAdaptationTransform;
}

/** Returns a copy of the XYZ → cone-space matrix of a transform. */
export function resolveChromaticAdaptationConeMatrix(transform: ChromaticAdaptationTransform): ColorMatrix3x3 {
  return copyMatrix(CONE_MATRICES[requireTransform(transform)]);
}

export interface CalculateChromaticAdaptationMatrixInput {
  transform: ChromaticAdaptationTransform;
  /** White of the source viewing/illumination condition (relative XYZ, Y > 0). */
  sourceWhiteXyz: CieXyzTristimulus;
  /** White of the destination condition (relative XYZ, Y > 0). */
  destinationWhiteXyz: CieXyzTristimulus;
  /** Degree of adaptation D in [0, 1]; defaults to 1 (complete adaptation). */
  degreeOfAdaptation?: number;
}

export interface ChromaticAdaptationMatrix {
  transform: ChromaticAdaptationTransform;
  degreeOfAdaptation: number;
  /** Row-major XYZ_source → XYZ_destination matrix. */
  matrix: ColorMatrix3x3;
  /** The per-channel cone-space gains Dᵢ. */
  coneGains: readonly [number, number, number];
}

/** Internal: builds the adaptation matrix without an envelope. */
export function chromaticAdaptationMatrix(input: CalculateChromaticAdaptationMatrixInput): ChromaticAdaptationMatrix {
  const transform = requireTransform(input.transform);
  const source = parseWhiteXyz(input.sourceWhiteXyz, "sourceWhiteXyz");
  const destination = parseWhiteXyz(input.destinationWhiteXyz, "destinationWhiteXyz");
  const d = input.degreeOfAdaptation === undefined ? 1 : requireNonNegativeNumber(input.degreeOfAdaptation, "degreeOfAdaptation");
  if (d > 1) throw new InvalidScientificInputError("degreeOfAdaptation must lie in [0, 1].");
  const cone = CONE_MATRICES[transform];
  const rs = multiplyMatrixVector(cone, xyzToVector(source));
  const rd = multiplyMatrixVector(cone, xyzToVector(destination));
  if (rs.some((v) => !(v > 0)) || rd.some((v) => !(v > 0))) {
    throw new InvalidScientificInputError("Both whites must have positive cone responses in the selected transform.");
  }
  const yRatio = source.y / destination.y;
  const gains = [0, 1, 2].map((i) => d * yRatio * (rd[i]! / rs[i]!) + 1 - d) as unknown as readonly [number, number, number];
  const matrix = multiplyMatrices(multiplyMatrices(invertMatrix3x3(cone, "cone matrix"), diagonalMatrix(gains)), cone);
  requireFiniteResult(matrix.flat(), "Chromatic adaptation");
  return { transform, degreeOfAdaptation: d, matrix, coneGains: gains };
}

/**
 * Calculates a linear chromatic-adaptation matrix between two whites. Linear CATs are
 * standard models, but they predict corresponding colours only approximately. The matrix
 * itself is calculated exactly from the declared transform.
 */
export function calculateChromaticAdaptationMatrix(input: CalculateChromaticAdaptationMatrixInput): CalculationResult<ChromaticAdaptationMatrix> {
  requireInputKeys(input, "calculateChromaticAdaptationMatrix", ["transform", "sourceWhiteXyz", "destinationWhiteXyz", "degreeOfAdaptation"]);
  const value = chromaticAdaptationMatrix(input);
  return calculatedResult(value, "chromatic-adaptation-" + value.transform, COLORIMETRY_MODEL_VERSION, [
    "Linear von Kries-type transform M = C⁻¹·diag(D·(Ys/Yd)·ρd/ρs + 1 − D)·C",
    "A linear CAT predicts corresponding colours only approximately; no colour-appearance model is applied"
  ]);
}

/** Adapts one XYZ colour between whites with the selected transform. */
export function calculateChromaticallyAdaptedXyz(input: CalculateChromaticAdaptationMatrixInput & { xyz: CieXyzTristimulus }): CalculationResult<{ xyz: CieXyzTristimulus; matrix: ColorMatrix3x3 }> {
  requireInputKeys(input, "calculateChromaticallyAdaptedXyz", ["transform", "sourceWhiteXyz", "destinationWhiteXyz", "degreeOfAdaptation", "xyz"]);
  const adaptation = chromaticAdaptationMatrix(input);
  const xyz = vectorToXyz(multiplyMatrixVector(adaptation.matrix, xyzToVector(parseXyz(input.xyz, "xyz"))));
  requireFiniteResult([xyz.x, xyz.y, xyz.z], "Chromatic adaptation");
  return calculatedResult({ xyz, matrix: adaptation.matrix }, "chromatic-adaptation-" + adaptation.transform, COLORIMETRY_MODEL_VERSION, [
    "Linear von Kries-type transform; degree of adaptation " + adaptation.degreeOfAdaptation
  ]);
}
