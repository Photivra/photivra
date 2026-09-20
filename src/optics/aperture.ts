// SPDX-License-Identifier: Apache-2.0

import {
  calculatedResult,
  type CalculationResult
} from "../core/calculation-result.js";
import {
  InvalidScientificInputError,
  requirePositiveInteger
} from "../core/validation.js";

const MAX_IDEAL_APERTURE_BLADES = 1024;

export interface CalculateIdealApertureInput {
  /** Number of straight diaphragm blades/sides. Must be from 3 through 1024. */
  bladeCount: number;
  /**
   * Rotation of the first blade edge in degrees, measured counter-clockwise
   * in image coordinates before the diffraction-normal offset is applied.
   */
  firstBladeEdgeAngleDegrees?: number;
}

export interface ApertureVertex {
  x: number;
  y: number;
}

export interface IdealApertureGeometry {
  bladeCount: number;
  /** Number of diffraction ray directions for the ideal straight-edged polygon. */
  sunstarRayCount: number;
  /**
   * Diffraction-ray directions in degrees, normalized to [0, 360).
   *
   * Each ray is perpendicular to a blade edge. Parallel opposite edges overlap
   * for even blade counts; odd blade counts therefore produce twice as many
   * visible ray directions.
   */
  sunstarRayAnglesDegrees: readonly number[];
  /** Unit-circumradius regular-polygon vertices. */
  normalizedVertices: readonly ApertureVertex[];
}

function normalizeDegrees(value: number): number {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

/**
 * Calculates ideal regular-polygon aperture geometry and the corresponding
 * straight-edge diffraction-ray directions.
 *
 * This models only geometry/symmetry. It does not calculate diffraction
 * intensity, wavelength-dependent star length, blade curvature, lens
 * aberrations, coatings, or sensor blooming.
 */
export function calculateIdealApertureGeometry(
  input: CalculateIdealApertureInput
): CalculationResult<IdealApertureGeometry> {
  requirePositiveInteger("bladeCount", input.bladeCount);
  if (input.bladeCount < 3) {
    throw new InvalidScientificInputError(
      "bladeCount must be greater than or equal to 3."
    );
  }
  if (input.bladeCount > MAX_IDEAL_APERTURE_BLADES) {
    throw new InvalidScientificInputError(
      `bladeCount must be less than or equal to ${MAX_IDEAL_APERTURE_BLADES}.`
    );
  }

  const rawFirstBladeEdgeAngleDegrees =
    input.firstBladeEdgeAngleDegrees ?? 0;
  if (!Number.isFinite(rawFirstBladeEdgeAngleDegrees)) {
    throw new InvalidScientificInputError(
      "firstBladeEdgeAngleDegrees must be finite."
    );
  }
  const firstBladeEdgeAngleDegrees = normalizeDegrees(
    rawFirstBladeEdgeAngleDegrees
  );

  const edgeStepDegrees = 360 / input.bladeCount;

  const rayAngles: number[] = [];
  for (let index = 0; index < input.bladeCount; index += 1) {
    const bladeEdgeAngle =
      firstBladeEdgeAngleDegrees + index * edgeStepDegrees;
    const rayAngle = normalizeDegrees(bladeEdgeAngle + 90);
    rayAngles.push(rayAngle);

    if (input.bladeCount % 2 !== 0) {
      rayAngles.push(normalizeDegrees(rayAngle + 180));
    }
  }

  rayAngles.sort((left, right) => left - right);

  const vertexRotationRadians =
    ((firstBladeEdgeAngleDegrees - 90 + edgeStepDegrees / 2) * Math.PI) / 180;
  const vertices = Array.from({ length: input.bladeCount }, (_, index) => {
    const angle =
      vertexRotationRadians + (index * 2 * Math.PI) / input.bladeCount;
    return {
      x: Math.cos(angle),
      y: Math.sin(angle)
    };
  });

  return calculatedResult(
    {
      bladeCount: input.bladeCount,
      sunstarRayCount: rayAngles.length,
      sunstarRayAnglesDegrees: rayAngles,
      normalizedVertices: vertices
    },
    "ideal-regular-polygon-aperture",
    "1.0.0",
    [
      "Aperture opening is a regular polygon with straight edges",
      "Each diffraction ray is perpendicular to a blade edge",
      "Opposing parallel-edge diffraction overlaps for even blade counts",
      "Ray intensity/length and blade curvature are not modeled",
      "Blade count is computationally bounded to 1024"
    ]
  );
}
