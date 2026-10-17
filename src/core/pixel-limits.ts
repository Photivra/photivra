// SPDX-License-Identifier: Apache-2.0

/**
 * Opt-in raised size limits for the full-resolution stages.
 *
 * Every full-resolution stage admits at most 24 000 000 pixels (about a 24 MP sensor) by default. A caller
 * that has decided it can afford more memory and time may raise a stage's limit with an optional input of
 * the same name as the limit (`maximumPixels`, `maximumRegionSites`, `maximumQueries`), up to that stage's
 * `ceiling*` value. Leaving the input out keeps the default, so default requests, plans and outputs are
 * unchanged. Byte-budget checks (`maximumOutputBytes` and similar) still apply to every request.
 *
 * The ceiling is 2^27 = 134 217 728 pixels (16 384 × 8 192). It covers 100 MP rasters such as
 * 12 252 × 8 168 or 11 552 × 8 664 plus their demosaic margin with about 34 % headroom. It also keeps the
 * largest per-pixel typed array of the pipeline, interleaved float64 RGB (24 bytes per pixel), at 3 GiB,
 * below the 4 GiB ArrayBuffer and 2^32-element typed-array bounds found in current JavaScript engines.
 * Measured memory and time per megapixel are in docs/QUICK_START.md ("Large images").
 */
import { InvalidConfigurationError } from "./configuration-error.js";

/** Default pixel limit of the full-resolution stages. */
export const FULL_RESOLUTION_DEFAULT_PIXELS = 24_000_000;
/** Hard ceiling of an opt-in raised pixel limit: 2^27 = 134 217 728 pixels (16 384 × 8 192). */
export const FULL_RESOLUTION_CEILING_PIXELS = 134_217_728;

/**
 * Resolves an optional raised limit: `undefined` gives `defaultValue`; otherwise a safe integer from 1 to
 * `ceiling`. Anything else (non-number, NaN, fraction, zero, negative, above the ceiling) throws `message`.
 */
export function resolveRaisedLimit(value: unknown, defaultValue: number, ceiling: number, message: string): number {
  if (value === undefined) return defaultValue;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > ceiling) throw new InvalidConfigurationError(message);
  return value;
}

/**
 * A budget ceiling sized for the default 24 000 000-pixel limit (a whole number of millions), scaled in
 * proportion to a raised pixel limit and never below its default. Exact integer arithmetic.
 */
export function scaleBudgetCeiling(defaultCeiling: number, maximumPixels: number): number {
  return Math.max(defaultCeiling, Math.floor(defaultCeiling / 1_000_000 * maximumPixels / 24));
}
