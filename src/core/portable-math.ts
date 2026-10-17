// SPDX-License-Identifier: Apache-2.0

/**
 * Floating-point helpers that give bit-identical results in every JavaScript engine.
 *
 * ECMAScript requires `+ - * /` and `Math.sqrt` to be correctly rounded IEEE 754 binary64
 * (double-precision) operations. A fixed sequence of them gives the same bits in every
 * conforming engine. `Math.hypot`, `Math.exp`, `Math.atan`, `Math.cos` and the other
 * transcendental functions are "implementation-approximated" (ECMA-262 §21.3.2). They can
 * differ in the last bit between V8, JavaScriptCore and SpiderMonkey.
 *
 * So any value that is stored and later recomputed for an exact identity check must use
 * only the correctly rounded operations.
 * @see docs/NUMERICAL_CORRECTNESS.md §Cross-engine determinism
 */

const LARGE = 2 ** 500;
const SMALL = 2 ** -500;
const SCALE_DOWN = 2 ** -600;
const SCALE_UP = 2 ** 600;

/**
 * Euclidean norm (vector length) of the components. Unlike `Math.hypot`, it uses only correctly
 * rounded IEEE operations, so the result is bit-identical in every JavaScript engine.
 *
 * Components are summed in argument order. Inputs far from 1 are first rescaled by an exact power
 * of two, so squaring cannot overflow or underflow. Non-finite input gives a non-finite result;
 * callers validate inputs first.
 */
export function portableHypot(...values: readonly number[]): number {
  let maximum = 0;
  for (const value of values) {
    const magnitude = Math.abs(value);
    if (!(magnitude <= maximum)) maximum = magnitude;
  }
  if (maximum === 0 || !Number.isFinite(maximum)) return maximum;
  const scale = maximum > LARGE ? SCALE_DOWN : maximum < SMALL ? SCALE_UP : 1;
  let sum = 0;
  for (const value of values) {
    const scaled = value * scale;
    sum += scaled * scaled;
  }
  return Math.sqrt(sum) / scale;
}

/**
 * True when two finite numbers differ by at most `maximumUlps` ULPs (units in the last place).
 * One ULP here is `Number.EPSILON` times the larger magnitude. Use it to accept an archived value
 * that another engine or an earlier release computed with an implementation-approximated function.
 */
export function equalWithinUlps(a: number, b: number, maximumUlps: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (a === b) return true;
  return Math.abs(a - b) <= maximumUlps * Number.EPSILON * Math.max(Math.abs(a), Math.abs(b));
}
