// SPDX-License-Identifier: Apache-2.0

/**
 * Generic prime lens family (2.4): educational lenses named by their full-frame-equivalent focal length,
 * written for this engine. They are not real products and carry no brand. Each lens is defined by three
 * rules only:
 * - actual focal length = equivalent focal length ÷ the sensor's diagonal crop factor
 *   (`calculateEquivalentFocalLength35Mm`, 36 × 24 mm reference);
 * - an f-number range by focal-length class (widest aperture) and focal length (narrowest aperture);
 * - a minimum focus distance max(0.10 m, f·(1 + 1/0.15)): the thin-lens object distance at 0.15×
 *   magnification (d = f(1 + 1/m)), but never closer than 10 cm. A generic thin-lens approximation, not a
 *   measured lens.
 * @see docs/QUICK_START.md, "Generic prime lenses".
 */

import { InvalidConfigurationError } from "../core/configuration-error.js";
import { requireInputKeys, requireInputObject } from "../core/record-validation.js";
import { calculateEquivalentFocalLength35Mm } from "../camera/equivalent-focal-length.js";

/** Full-frame-equivalent focal lengths of the generic prime family, mm. */
export const GENERIC_PRIME_EQUIVALENT_FOCAL_LENGTHS_MM = Object.freeze([10, 12, 14, 16, 20, 24, 28, 35, 40, 50, 85, 105, 135, 200, 300, 400, 500, 600, 800, 1200] as const);
export type GenericPrimeEquivalentFocalLengthMm = typeof GENERIC_PRIME_EQUIVALENT_FOCAL_LENGTHS_MM[number];
/**
 * The marked third-stop f-numbers (the conventional rounded values of N = 2^(k/6), k = 0, 1, …), from f/1 to f/32.
 * A lens's `fNumbers` are those within its range; any f-number inside the range is accepted.
 */
export const GENERIC_PRIME_THIRD_STOP_F_NUMBERS = Object.freeze([1, 1.1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.5, 2.8, 3.2, 3.5, 4, 4.5, 5, 5.6, 6.3, 7.1, 8, 9, 10, 11,
  13, 14, 16, 18, 20, 22, 25, 29, 32] as const);
/** Minimum focus rule: the object distance at this magnification, but at least `minimumDistanceM`. */
export const GENERIC_PRIME_MINIMUM_FOCUS = Object.freeze({ magnification: 0.15, minimumDistanceM: 0.1 });

/** Widest f-number by equivalent focal length (inclusive upper bounds of each class). */
const WIDEST: readonly (readonly [number, number])[] = [[16, 2.8], [28, 1.8], [85, 1.4], [135, 2], [300, 2.8], [600, 4], [800, 5.6], [1200, 8]];
/** Narrowest f-number by equivalent focal length. */
const NARROWEST: readonly (readonly [number, number])[] = [[16, 16], [135, 22], [1200, 32]];

export interface GenericPrimeLens {
  /** Public opaque id, for example "generic-prime-50mm-equivalent". */
  lensId: string;
  equivalentFocalLengthMm: GenericPrimeEquivalentFocalLengthMm;
  /** Physical focal length for this sensor: equivalent ÷ crop factor. */
  focalLengthMm: number;
  /** Diagonal crop factor of the sensor (36 × 24 mm = 1). */
  cropFactor35Mm: number;
  /** Widest aperture (smallest f-number) and narrowest aperture. */
  widestFNumber: number;
  narrowestFNumber: number;
  /** The marked third-stop f-numbers within the range. */
  fNumbers: readonly number[];
  /** max(0.10 m, f·(1 + 1/0.15)), metres from the lens (thin lens). */
  minimumFocusDistanceM: number;
  /** Magnification at the minimum focus distance, f/(d − f). */
  maximumMagnification: number;
  scientificStatus: "approximation";
  limitations: readonly string[];
}

/** Minimum focus distance of a generic prime of physical focal length `focalLengthMm`: max(0.10 m, f·(1 + 1/0.15)). */
export function calculateGenericPrimeMinimumFocusDistanceM(focalLengthMm: number): number {
  if (typeof focalLengthMm !== "number" || !Number.isFinite(focalLengthMm) || focalLengthMm <= 0) throw new InvalidConfigurationError("focalLengthMm must be a positive finite number.");
  return Math.max(GENERIC_PRIME_MINIMUM_FOCUS.minimumDistanceM, focalLengthMm / 1000 * (1 + 1 / GENERIC_PRIME_MINIMUM_FOCUS.magnification));
}

/**
 * Resolves a generic prime for a sensor: its actual focal length, f-number range, marked f-numbers and minimum focus.
 * `activeImagingArea` is the sensor's active capture area in millimetres.
 */
export function resolveGenericPrimeLens(input: { equivalentFocalLengthMm: number; activeImagingArea: { widthMm: number; heightMm: number } }): GenericPrimeLens {
  requireInputObject(input, "resolveGenericPrimeLens input");
  requireInputKeys(input, "resolveGenericPrimeLens", ["equivalentFocalLengthMm", "activeImagingArea"]);
  const equivalent = input.equivalentFocalLengthMm;
  if (!(GENERIC_PRIME_EQUIVALENT_FOCAL_LENGTHS_MM as readonly number[]).includes(equivalent))
    throw new InvalidConfigurationError("equivalentFocalLengthMm must be one of the generic primes: " + GENERIC_PRIME_EQUIVALENT_FOCAL_LENGTHS_MM.join(", ") + " mm.");
  requireInputObject(input.activeImagingArea, "activeImagingArea");
  const crop = calculateEquivalentFocalLength35Mm({ focalLengthMm: 1, activeImagingArea: { widthMm: input.activeImagingArea.widthMm, heightMm: input.activeImagingArea.heightMm } }).value.cropFactor35Mm;
  const focalLengthMm = equivalent / crop;
  const widest = WIDEST.find(([bound]) => equivalent <= bound)![1], narrowest = NARROWEST.find(([bound]) => equivalent <= bound)![1];
  const minimumFocusDistanceM = calculateGenericPrimeMinimumFocusDistanceM(focalLengthMm), f = focalLengthMm / 1000;
  return Object.freeze({ lensId: "generic-prime-" + equivalent + "mm-equivalent", equivalentFocalLengthMm: equivalent as GenericPrimeEquivalentFocalLengthMm, focalLengthMm,
    cropFactor35Mm: crop, widestFNumber: widest, narrowestFNumber: narrowest,
    fNumbers: Object.freeze(GENERIC_PRIME_THIRD_STOP_F_NUMBERS.filter((n) => n >= widest && n <= narrowest)), minimumFocusDistanceM,
    maximumMagnification: f / (minimumFocusDistanceM - f), scientificStatus: "approximation" as const,
    limitations: Object.freeze(["Generic educational prime defined by focal length, f-number range and a thin-lens minimum-focus rule; not a real product.",
      "Minimum focus max(0.10 m, f·(1 + 1/0.15)) is a thin-lens approximation measured from the lens; real lenses differ (internal focusing, pupil positions, focus breathing)."]) });
}
