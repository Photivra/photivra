// SPDX-License-Identifier: Apache-2.0

/**
 * Fits a 3×3 camera-RGB → CIE XYZ matrix from caller-supplied spectral data.
 *
 * For each training reflectance R_j under illuminant S:
 *   camera ρ_j,c = k_c Σ S(λ) R_j(λ) s_c(λ) Δλ,   target X_j = k Σ S(λ) R_j(λ) x̄(λ) Δλ
 * k is chosen so the perfect diffuser has Y = 1. k_c (the same for all channels) is chosen so
 * the camera's response to the perfect diffuser has green = 1.
 *
 * Two fits are available:
 * - Ordinary least squares: M minimizes Σ_j ‖M ρ_j − X_j‖², so M = X Pᵀ (P Pᵀ)⁻¹.
 * - White-point-preserving least squares: the same, subject to M ρ_white = X_white exactly
 *   (Finlayson & Drew 1997, "White-point preserving color correction", IS&T/SID CIC5). It is
 *   solved in closed form with one Lagrange multiplier per row.
 *
 * Residual errors are reported per patch as CIEDE2000, with CIELAB relative to the illuminant
 * white (no chromatic adaptation). A 3×3 matrix is exact only if the camera meets the
 * Luther–Ives condition. Otherwise the result is an estimate, and its error depends on the
 * training set. No camera, reflectance or ColorChecker data is bundled. Reflectance tables with an
 * unclear licence must come from the caller.
 * @see docs/COLORIMETRY.md for equations, coordinate/unit conventions and limits.
 */

import { estimatedResult, type CalculationResult } from "../core/calculation-result.js";
import { InvalidScientificInputError } from "../core/validation.js";
import {
  COLORIMETRY_MODEL_VERSION,
  integrateSampledXyz,
  prepareColorMatchingFunctions,
  prepareColorimetricSpectrum,
  sampleColorimetricBasis,
  sampleFactor,
  type ColorMatchingFunctionsSource,
  type ColorimetricQuadratureNode,
  type ColorimetricSpectrum,
  type SampledColorimetricBasis
} from "./color-matching-functions.js";
import { cielabOfXyz, deltaE2000 } from "./color-difference.js";
import {
  invertMatrix3x3,
  multiplyMatrixVector,
  requireFiniteResult,
  vectorToXyz,
  xyzToVector,
  type CieXyzTristimulus,
  type ColorMatrix3x3,
  type ColorVector3
} from "./colorimetry-math.js";
import { requireInputKeys } from "../core/record-validation.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";

export const MAX_CAMERA_MATRIX_TRAINING_PATCHES = 10_000;

export interface CameraSpectralSensitivities {
  red: ColorimetricSpectrum;
  green: ColorimetricSpectrum;
  blue: ColorimetricSpectrum;
}

export interface CameraMatrixTrainingPatch {
  patchId: string;
  reflectance: ColorimetricSpectrum;
}

export type CameraMatrixFitConstraint = "least-squares" | "white-point-preserving-least-squares";

export interface EstimateCameraColorMatrixInput {
  quadratureNodes: readonly ColorimetricQuadratureNode[];
  illuminant: ColorimetricSpectrum;
  cameraSpectralSensitivities: CameraSpectralSensitivities;
  patches: readonly CameraMatrixTrainingPatch[];
  colorMatchingFunctions: ColorMatchingFunctionsSource;
  constraint: CameraMatrixFitConstraint;
}

export interface CameraMatrixPatchReport {
  patchId: string;
  cameraRgb: ColorVector3;
  targetXyz: CieXyzTristimulus;
  predictedXyz: CieXyzTristimulus;
  deltaE2000: number;
}

export interface CameraColorMatrixFit {
  constraint: CameraMatrixFitConstraint;
  /** Row-major camera RGB → XYZ (XYZ white Y = 1; camera white green = 1). */
  cameraRgbToXyz: ColorMatrix3x3;
  xyzToCameraRgb: ColorMatrix3x3;
  illuminantWhiteXyz: CieXyzTristimulus;
  /** Camera response to the perfect diffuser (green = 1); its reciprocal gives neutral WB gains. */
  cameraWhiteRgb: ColorVector3;
  patches: readonly CameraMatrixPatchReport[];
  meanDeltaE2000: number;
  maximumDeltaE2000: number;
  /** Root-mean-square XYZ residual over all patches and components. */
  rmsXyzResidual: number;
}

type Matrix = number[][];

function solveRow(aInv: ColorMatrix3x3, rhs: ColorVector3, white: ColorVector3 | undefined, whiteTarget: number): ColorVector3 {
  // Unconstrained normal equations: m = A⁻¹ b with A = P Pᵀ, b = P xᵀ.
  const m = multiplyMatrixVector(aInv, rhs);
  if (white === undefined) return m;
  const aInvW = multiplyMatrixVector(aInv, white);
  const wAw = white[0] * aInvW[0] + white[1] * aInvW[1] + white[2] * aInvW[2];
  const residual = whiteTarget - (m[0] * white[0] + m[1] * white[1] + m[2] * white[2]);
  return [m[0] + (aInvW[0] * residual) / wAw, m[1] + (aInvW[1] * residual) / wAw, m[2] + (aInvW[2] * residual) / wAw];
}

/**
 * Fits a camera-RGB → XYZ matrix from spectral sensitivities, training reflectances,
 * an illuminant and CMFs, and reports the per-patch CIEDE2000 residual.
 */
export function estimateCameraColorMatrix(input: EstimateCameraColorMatrixInput): CalculationResult<CameraColorMatrixFit> {
  requireInputKeys(input, "estimateCameraColorMatrix", ["quadratureNodes", "illuminant", "cameraSpectralSensitivities", "patches", "colorMatchingFunctions", "constraint"]);
  if (input.constraint !== "least-squares" && input.constraint !== "white-point-preserving-least-squares") {
    throw new InvalidConfigurationError("constraint is not supported.");
  }
  if (!Array.isArray(input.patches) || input.patches.length < 3 || input.patches.length > MAX_CAMERA_MATRIX_TRAINING_PATCHES) {
    throw new InvalidScientificInputError("patches must contain between 3 and " + MAX_CAMERA_MATRIX_TRAINING_PATCHES + " entries.");
  }
  const cmf = prepareColorMatchingFunctions(input.colorMatchingFunctions);
  const illuminant = prepareColorimetricSpectrum(input.illuminant, "illuminant");
  const basis: SampledColorimetricBasis = sampleColorimetricBasis(input.quadratureNodes, illuminant, cmf);
  const sens = input.cameraSpectralSensitivities;
  if (typeof sens !== "object" || sens === null) throw new InvalidConfigurationError("cameraSpectralSensitivities must be an object.");
  const channel = (["red", "green", "blue"] as const).map((c) => sampleFactor(basis, prepareColorimetricSpectrum(sens[c], "cameraSpectralSensitivities." + c)));
  const ids = new Set<string>();
  const n = basis.nodes.length;
  const cameraOf = (factor: Float64Array): ColorVector3 => {
    const out = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const w = basis.weights[i]! * factor[i]!;
      for (let c = 0; c < 3; c++) out[c]! += w * channel[c]![i]!;
    }
    return out as unknown as ColorVector3;
  };
  const ones = sampleFactor(basis, undefined);
  const rawWhiteXyz = integrateSampledXyz(basis, ones);
  const rawWhiteRgb = cameraOf(ones);
  if (!(rawWhiteXyz.y > 0) || !(rawWhiteRgb[1] > 0)) throw new InvalidScientificInputError("The illuminant must give positive Y and positive camera green for the perfect diffuser.");
  const kXyz = 1 / rawWhiteXyz.y, kRgb = 1 / rawWhiteRgb[1];
  const scale = (v: ColorVector3, k: number): ColorVector3 => [v[0] * k, v[1] * k, v[2] * k];
  const whiteXyz = scale(xyzToVector(rawWhiteXyz), kXyz);
  const whiteRgb = scale(rawWhiteRgb, kRgb);

  const rows = input.patches.map((patch, j) => {
    if (typeof patch !== "object" || patch === null || typeof patch.patchId !== "string" || patch.patchId.trim().length === 0) {
      throw new InvalidConfigurationError("patches[" + j + "].patchId must be a non-empty string.");
    }
    if (ids.has(patch.patchId)) throw new InvalidScientificInputError("patches must not repeat patchId.");
    ids.add(patch.patchId);
    const factor = sampleFactor(basis, prepareColorimetricSpectrum(patch.reflectance, "patches[" + j + "].reflectance"));
    return { patchId: patch.patchId, rgb: scale(cameraOf(factor), kRgb), xyz: scale(xyzToVector(integrateSampledXyz(basis, factor)), kXyz) };
  });

  const a: Matrix = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const b: Matrix = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; // b[outputRow][cameraChannel]
  for (const r of rows) {
    for (let p = 0; p < 3; p++) {
      for (let q = 0; q < 3; q++) a[p]![q]! += r.rgb[p]! * r.rgb[q]!;
      for (let o = 0; o < 3; o++) b[o]![p]! += r.xyz[o]! * r.rgb[p]!;
    }
  }
  const aMatrix = a as unknown as ColorMatrix3x3;
  const aInv = invertMatrix3x3(aMatrix, "Camera training Gram matrix (patches must span three independent camera responses)");
  const constrained = input.constraint === "white-point-preserving-least-squares";
  const m = [0, 1, 2].map((o) => solveRow(aInv, b[o] as unknown as ColorVector3, constrained ? whiteRgb : undefined, whiteXyz[o]!)) as unknown as ColorMatrix3x3;
  requireFiniteResult(m.flat(), "Camera matrix fit");

  const whiteXyzRecord = vectorToXyz(whiteXyz);
  let sumDe = 0, maxDe = 0, sumSq = 0;
  const patches: CameraMatrixPatchReport[] = rows.map((r) => {
    const predicted = multiplyMatrixVector(m, r.rgb);
    const de = deltaE2000(cielabOfXyz(vectorToXyz(r.xyz), whiteXyzRecord), cielabOfXyz(vectorToXyz(predicted), whiteXyzRecord));
    sumDe += de; maxDe = Math.max(maxDe, de);
    for (let o = 0; o < 3; o++) sumSq += (predicted[o]! - r.xyz[o]!) ** 2;
    return { patchId: r.patchId, cameraRgb: r.rgb, targetXyz: vectorToXyz(r.xyz), predictedXyz: vectorToXyz(predicted), deltaE2000: de };
  });
  const value: CameraColorMatrixFit = {
    constraint: input.constraint, cameraRgbToXyz: m, xyzToCameraRgb: invertMatrix3x3(m, "Fitted camera matrix"),
    illuminantWhiteXyz: whiteXyzRecord, cameraWhiteRgb: whiteRgb, patches,
    meanDeltaE2000: sumDe / rows.length, maximumDeltaE2000: maxDe, rmsXyzResidual: Math.sqrt(sumSq / (3 * rows.length))
  };
  requireFiniteResult([value.meanDeltaE2000, value.maximumDeltaE2000, value.rmsXyzResidual], "Camera matrix report");
  return estimatedResult(value, "camera-color-matrix-least-squares", COLORIMETRY_MODEL_VERSION, [
    "Linear 3×3 model fitted to caller training reflectances under one illuminant; exact only under the Luther–Ives condition",
    "ΔE2000 uses CIELAB relative to the illuminant white without chromatic adaptation",
    "CMF source: " + cmf.datasetId
  ], {
    notes: [
      "Training-set residuals are reported per patch in value.patches (CIEDE2000) and value.rmsXyzResidual; they do not bound the error for spectra outside the training set."
    ]
  });
}
