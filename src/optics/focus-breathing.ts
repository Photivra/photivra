// SPDX-License-Identifier: Apache-2.0

import {
  approximationResult,
  type CalculationResult
} from "../core/calculation-result.js";
import { requirePositiveFinite } from "../core/validation.js";
import { calculateThinLensImageDistance } from "./thin-lens.js";

export interface CalculateFocusBreathingProjectionInput {
  /** Physical lens focal length in millimetres. This value is never rewritten. */
  focalLengthMm: number;
  /** Selected focus distance in metres. */
  focusDistanceM: number;
  /**
   * Caller-declared projection scale for this focus state, relative to the
   * ideal thin-lens image distance.
   *
   * 1 means no additional breathing relative to the current thin-lens model.
   * Values above 1 narrow framing / increase magnification; values below 1
   * widen framing / reduce magnification.
   */
  breathingProjectionScale: number;
}

export interface FocusBreathingProjection {
  /** Authoritative physical focal length supplied by the caller. */
  physicalFocalLengthMm: number;
  focusDistanceM: number;
  /** Ideal Gaussian thin-lens image distance before breathing adjustment. */
  idealProjectionDistanceMm: number;
  /**
   * Effective projection distance used by the generic breathing model.
   *
   * This is a projection/magnification parameter, not a replacement physical
   * focal length.
   */
  effectiveProjectionDistanceMm: number;
  /** Caller-declared scale relative to ideal thin-lens projection. */
  breathingProjectionScale: number;
  /** Ideal Gaussian thin-lens magnification at the selected focus distance. */
  idealMagnification: number;
  /** Generic breathing-adjusted magnification. */
  effectiveMagnification: number;
}

export interface CalculateFocusBreathingFieldOfViewInput
  extends CalculateFocusBreathingProjectionInput {
  /** Sensor/capture dimension corresponding to the requested FOV, in millimetres. */
  sensorDimensionMm: number;
}

export interface FocusBreathingFieldOfView {
  physicalFocalLengthMm: number;
  focusDistanceM: number;
  sensorDimensionMm: number;
  breathingProjectionScale: number;
  idealProjectionDistanceMm: number;
  effectiveProjectionDistanceMm: number;
  idealDegrees: number;
  effectiveDegrees: number;
  deltaDegrees: number;
}

/**
 * Applies a caller-declared focus-breathing projection scale to the ideal
 * Gaussian thin-lens projection for one focus state.
 *
 * Photivra does not infer the scale from focal length, focus distance, lens
 * identity, or marketing data. A value of 1 exactly preserves the current
 * thin-lens projection.
 *
 * This is a generic approximation of focus-dependent projection/magnification,
 * not a calibrated real-lens model. The physical focal length remains
 * authoritative and unchanged.
 */
export function calculateFocusBreathingProjection(
  input: CalculateFocusBreathingProjectionInput
): CalculationResult<FocusBreathingProjection> {
  requirePositiveFinite("focalLengthMm", input.focalLengthMm);
  requirePositiveFinite("focusDistanceM", input.focusDistanceM);
  requirePositiveFinite(
    "breathingProjectionScale",
    input.breathingProjectionScale
  );

  const thinLens = calculateThinLensImageDistance({
    focalLengthMm: input.focalLengthMm,
    objectDistanceM: input.focusDistanceM
  });
  const idealProjectionDistanceMm = thinLens.value.imageDistanceMm;
  const effectiveProjectionDistanceMm =
    idealProjectionDistanceMm * input.breathingProjectionScale;
  const objectDistanceMm = input.focusDistanceM * 1000;

  return approximationResult(
    {
      physicalFocalLengthMm: input.focalLengthMm,
      focusDistanceM: input.focusDistanceM,
      idealProjectionDistanceMm,
      effectiveProjectionDistanceMm,
      breathingProjectionScale: input.breathingProjectionScale,
      idealMagnification: thinLens.value.magnification,
      effectiveMagnification:
        effectiveProjectionDistanceMm / objectDistanceMm
    },
    "declared-scale-focus-breathing-projection",
    "1.0.0",
    [
      "Base projection is the ideal Gaussian thin-lens image distance for the selected focus distance",
      "The focus-breathing projection scale is supplied explicitly by the caller and is not inferred",
      "One declared scale applies uniformly to the current focus state",
      "Physical focal length remains unchanged and authoritative",
      "The model represents focus-dependent framing/magnification only; distortion, pupil magnification, aberrations, and named-lens calibration are not modeled"
    ]
  );
}

/**
 * Calculates one-axis field of view for the generic declared-scale focus-
 * breathing projection and reports the corresponding ideal thin-lens FOV.
 *
 * A breathingProjectionScale of 1 reproduces the current focus-aware
 * thin-lens field-of-view result exactly.
 */
export function calculateFocusBreathingFieldOfView(
  input: CalculateFocusBreathingFieldOfViewInput
): CalculationResult<FocusBreathingFieldOfView> {
  requirePositiveFinite("sensorDimensionMm", input.sensorDimensionMm);

  const projection = calculateFocusBreathingProjection(input);
  const idealRadians =
    2 *
    Math.atan(
      input.sensorDimensionMm /
        (2 * projection.value.idealProjectionDistanceMm)
    );
  const effectiveRadians =
    2 *
    Math.atan(
      input.sensorDimensionMm /
        (2 * projection.value.effectiveProjectionDistanceMm)
    );
  const idealDegrees = (idealRadians * 180) / Math.PI;
  const effectiveDegrees = (effectiveRadians * 180) / Math.PI;

  return approximationResult(
    {
      physicalFocalLengthMm: input.focalLengthMm,
      focusDistanceM: input.focusDistanceM,
      sensorDimensionMm: input.sensorDimensionMm,
      breathingProjectionScale: input.breathingProjectionScale,
      idealProjectionDistanceMm:
        projection.value.idealProjectionDistanceMm,
      effectiveProjectionDistanceMm:
        projection.value.effectiveProjectionDistanceMm,
      idealDegrees,
      effectiveDegrees,
      deltaDegrees: effectiveDegrees - idealDegrees
    },
    "declared-scale-focus-breathing-field-of-view",
    "1.0.0",
    [
      ...(projection.provenance.assumptions ?? []),
      "Rectilinear field of view is calculated from the declared sensor/capture dimension and effective projection distance"
    ]
  );
}
