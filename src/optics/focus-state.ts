// SPDX-License-Identifier: Apache-2.0

import {
  calculatedResult,
  type CalculationResult
} from "../core/calculation-result.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";
import { requirePositiveFinite } from "../core/validation.js";
import {
  calculateThinLensImageDistance,
  type ThinLensImageDistance
} from "./thin-lens.js";

/**
 * Explicit ideal focus-plane state.
 *
 * Finite distance is the longitudinal object-plane distance from the ideal
 * lens principal plane along the camera optical axis. Infinity is a semantic
 * state and is never represented with JavaScript Infinity or a fabricated
 * large distance.
 */
export type FocusPlane =
  | {
      kind: "finite";
      distanceM: number;
    }
  | {
      kind: "infinity";
    };

export interface CalculateFocusPlaneImageDistanceInput {
  /** Lens focal length in millimetres. */
  focalLengthMm: number;
  /** Explicit finite or infinity focus-plane state. */
  focus: FocusPlane;
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new InvalidConfigurationError(
      path + " must be an object."
    );
  }
  return value as Record<string, unknown>;
}

/**
 * Parses an explicit focus-plane state from an untrusted JSON boundary.
 *
 * Missing/unknown focus is rejected rather than being interpreted as infinity.
 */
export function parseFocusPlane(value: unknown): FocusPlane {
  const record = requireRecord(value, "focusPlane");

  if (record.kind === "infinity") {
    if (record.distanceM !== undefined) {
      throw new InvalidConfigurationError(
        "focusPlane infinity state must not include distanceM."
      );
    }
    return {
      kind: "infinity"
    };
  }

  if (record.kind === "finite") {
    if (
      typeof record.distanceM !== "number" ||
      !Number.isFinite(record.distanceM) ||
      record.distanceM <= 0
    ) {
      throw new InvalidConfigurationError(
        "focusPlane.distanceM must be a finite number greater than zero."
      );
    }
    return {
      kind: "finite",
      distanceM: record.distanceM
    };
  }

  throw new InvalidConfigurationError(
    'focusPlane.kind must be "finite" or "infinity".'
  );
}

/**
 * Calculates the ideal image-plane distance for an explicit focus state.
 *
 * Finite focus delegates to the existing Gaussian thin-lens calculation, so
 * its numerical result and provenance are unchanged. Infinity focus resolves
 * exactly to the nominal focal length with zero limiting magnification.
 */
export function calculateFocusPlaneImageDistance(
  input: CalculateFocusPlaneImageDistanceInput
): CalculationResult<ThinLensImageDistance> {
  requirePositiveFinite("focalLengthMm", input.focalLengthMm);

  const focus = parseFocusPlane(input.focus);

  if (focus.kind === "finite") {
    return calculateThinLensImageDistance({
      focalLengthMm: input.focalLengthMm,
      objectDistanceM: focus.distanceM
    });
  }

  return calculatedResult(
    {
      imageDistanceMm: input.focalLengthMm,
      magnification: 0,
      infinityProjectionScale: 1
    },
    "ideal-infinity-focus-image-distance",
    "1.0.0",
    [
      "Paraxial ideal-lens infinity-focus boundary",
      "Image distance equals nominal focal length at optical infinity",
      "Infinity is represented semantically rather than by a non-finite or fabricated distance"
    ]
  );
}
