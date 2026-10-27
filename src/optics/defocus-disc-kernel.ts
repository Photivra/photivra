// SPDX-License-Identifier: Apache-2.0

/**
 * Internal (not exported from the package): the geometric defocus disc of a flat scene, sampled on the square site
 * lattice, for `lens.defocus: { model: "geometric-disc" }` (#492).
 *
 * Model. For a scene plane at the subject distance d and a thin lens focused at s, an ideal uniform circular pupil
 * spreads every in-focus image point into a uniform disc of diameter c = f²·|s − d| / (N·d·(s − f)) on the sensor
 * (`calculateDefocusCircle`, thin-lens model 1.1.0; geometric optics, no diffraction or aberrations). The defocused
 * image of the plane is therefore the in-focus image convolved with that disc: one fixed, wavelength-independent
 * kernel. It is an approximation (geometric optics, ideal uniform circular pupil, no vignetting of the pupil).
 *
 * Sampling. The disc of diameter c/p sites (p the site pitch) is centred on a site centre. The weight of the site at
 * offset (i, j) is the exact area of the disc inside that site's square cell [i − ½, i + ½] × [j − ½, j + ½], divided
 * by the area of the disc. The area of a disc inside a rectangle is a signed sum over the rectangle's four corners of
 * the area Q(x, y) of the disc inside the quadrant [0, x] × [0, y] (inclusion–exclusion), and for x, y ≥ 0 with
 * x, y clamped to the radius r
 *   Q = x·y                                                when x² + y² ≤ r²,
 *   Q = ½·(x_a·y + x·y_a + r²·(arcsin(x/r) − arcsin(x_a/r)))  otherwise,
 * with x_a = √(r² − y²) and y_a = √(r² − x²) the arc's crossings of the quadrant's edges: the rectangle left of the
 * crossing plus the area under the arc, ∫ √(r² − t²) dt = ½·(t·√(r² − t²) + r²·arcsin(t/r)) (elementary geometry
 * and calculus; NIST DLMF 4.24.1 for the arcsine, free). The arcsine difference is the angle between the two arc
 * points, evaluated as arcsin((x·y − x_a·y_a)/r²) (the sine of a difference). Q is extended to negative x or y as an
 * odd function.
 *
 * Determinism. Only correctly rounded operations and `portableAsin` are used, so the weights are the same bits in
 * every JavaScript engine. One octant (0 ≤ j ≤ i) is computed and mirrored, so the kernel has the exact 8-fold
 * symmetry of the disc and the square lattice. The weights are divided by their float64 sum, then the centre weight
 * takes up the remaining rounding, so their exact sum is 1 within half a unit in the last place of the centre weight.
 *
 * Limits. The window is (2R + 1)² sites with R = ⌈r − ½⌉ (0 when r ≤ ½: a disc inside one cell is the identity, a
 * valid kernel). R is capped at {@link DEFOCUS_DISC_KERNEL_MAXIMUM_RADIUS_SITES}; past it the call fails, naming the
 * cap and the radius asked for, instead of clipping the disc.
 */

import { portableAsin } from "../core/portable-math.js";
import { InvalidScientificInputError } from "../core/validation.js";
import { calculateDefocusCircle } from "./depth-of-field.js";

/**
 * Largest kernel radius in sites, R ≤ 64 (a 129 × 129 window, 16 641 taps per site; the diffraction kernels stop at 32).
 * Set from the cost measured in the capture (#492, step 2a; docs/QUICK_START.md, "Optics"): the capture's time grows with
 * R² at every site the disc sees an edge from, and a 0.7 MP Siemens star took 0.37 s in focus, 2.9 s at R = 32, 4.7 s at
 * R = 41 and 11.6 s at R = 64 (Node, one thread). 64 keeps the issue's 1.4 µm example (50 mm f/2.8, subject 2 m, focus
 * 1.6 m: R = 41) with room for larger blurs, at a cost the caller chooses and the docs state; past it the call fails.
 */
export const DEFOCUS_DISC_KERNEL_MAXIMUM_RADIUS_SITES = 64;

/** The disc sampled on the site lattice. */
export interface DefocusDiscSiteKernel {
  /** Disc diameter in sites (c / pitch). */
  readonly diameterSites: number;
  /** Kernel radius R in sites: the window is (2R + 1) × (2R + 1). */
  readonly radius: number;
  /** Window side, 2R + 1. */
  readonly width: number;
  /** Row-major weights, index (j + R)·width + (i + R) for the site offset (i, j); their row-major float64 sum is 1. */
  readonly weights: Float64Array;
}

/** Kernel radius in sites for a disc of `diameterSites`: the cells [i − ½, i + ½] the disc reaches with positive area. */
export function defocusDiscKernelRadius(diameterSites: number): number {
  requireDiameter(diameterSites);
  const r = diameterSites / 2;
  return r <= 0.5 ? 0 : Math.ceil(r - 0.5);
}

/**
 * {@link defocusDiscKernelRadius}, failing with `InvalidScientificInputError` (naming the cap and the radius asked for)
 * when it exceeds {@link DEFOCUS_DISC_KERNEL_MAXIMUM_RADIUS_SITES}. The disc is never clipped to fit.
 */
export function requireDefocusDiscKernelRadius(diameterSites: number): number {
  const radius = defocusDiscKernelRadius(diameterSites);
  if (radius > DEFOCUS_DISC_KERNEL_MAXIMUM_RADIUS_SITES)
    throw new InvalidScientificInputError("The defocus disc of " + diameterSites + " sites needs a kernel radius of " + radius +
      " sites; the limit is " + DEFOCUS_DISC_KERNEL_MAXIMUM_RADIUS_SITES + " sites (DEFOCUS_DISC_KERNEL_MAXIMUM_RADIUS_SITES).");
  return radius;
}

function requireDiameter(diameterSites: number): void {
  if (typeof diameterSites !== "number" || !Number.isFinite(diameterSites) || diameterSites < 0)
    throw new InvalidScientificInputError("The defocus disc diameter must be a finite number of sites, zero or more.");
}

/** Area of the disc of radius r (centred at the origin) inside [0, x] × [0, y], for x, y ≥ 0. */
function quadrantArea(x: number, y: number, r: number): number {
  if (x > r) x = r;
  if (y > r) y = r;
  if (x * x + y * y <= r * r) return x * y;
  const xa = Math.sqrt((r - y) * (r + y)), ya = Math.sqrt((r - x) * (r + x));
  // arcsin(x/r) − arcsin(x_a/r) is the angle between the arc points (x_a, y) and (x, y_a), whose sine is (x·y − x_a·y_a)/r².
  return 0.5 * (xa * y + x * ya + r * r * portableAsin(Math.min(1, (x * y - xa * ya) / (r * r))));
}
/** {@link quadrantArea} extended as an odd function of x and of y. */
function signedQuadrantArea(x: number, y: number, r: number): number {
  const q = quadrantArea(x < 0 ? -x : x, y < 0 ? -y : y, r);
  return (x < 0) !== (y < 0) ? -q : q;
}
/**
 * Area of the disc inside the cell [i − ½, i + ½] × [j − ½, j + ½], for i ≥ j ≥ 0. Exactly 0 when the cell's point nearest
 * the centre lies on or outside the circle. Otherwise the four corner terms are up to r² in size, so the difference
 * carries an absolute rounding error of a few r²·2^-53 (below 10^-11 at the radius cap, under 10^-15 of the disc's area);
 * a cell that barely touches the disc can come out a rounding error below zero and is set to 0.
 */
function cellArea(i: number, j: number, r: number): number {
  const x0 = i - 0.5, x1 = i + 0.5, y0 = j - 0.5, y1 = j + 0.5;
  const nx = i === 0 ? 0 : x0, ny = j === 0 ? 0 : y0;
  if (nx * nx + ny * ny >= r * r) return 0;
  const area = (signedQuadrantArea(x1, y1, r) - signedQuadrantArea(x0, y1, r)) - (signedQuadrantArea(x1, y0, r) - signedQuadrantArea(x0, y0, r));
  return area > 0 ? area : 0;
}

/**
 * The defocus disc of `diameterSites` (c / pitch) sampled on the site lattice, or null for a zero diameter (in focus:
 * callers apply no kernel). Fails with `InvalidScientificInputError` for a negative or non-finite diameter, and when
 * the kernel radius exceeds {@link DEFOCUS_DISC_KERNEL_MAXIMUM_RADIUS_SITES}.
 */
export function createDefocusDiscSiteKernel(diameterSites: number): DefocusDiscSiteKernel | null {
  const radius = requireDefocusDiscKernelRadius(diameterSites);
  if (diameterSites === 0) return null;
  const r = diameterSites / 2, width = 2 * radius + 1, weights = new Float64Array(width * width);
  // One octant, mirrored into the eight symmetric cells.
  for (let i = 0; i <= radius; i++) for (let j = 0; j <= i; j++) {
    const a = cellArea(i, j, r);
    for (const [u, v] of [[i, j], [j, i]] as const) for (const su of u === 0 ? [1] : [1, -1]) for (const sv of v === 0 ? [1] : [1, -1])
      weights[(sv * v + radius) * width + su * u + radius] = a;
  }
  normalize(weights, (width * width - 1) / 2);
  return { diameterSites, radius, width, weights };
}

/**
 * Divides by the float64 sum, then sets the centre weight to 1 minus the exact sum of the others (accumulated as a
 * double-double with Knuth's TwoSum), rounded once. The exact real sum of the weights is then 1 within half a unit in
 * the last place of the centre weight. (No float64 summation order can promise exactly 1: a one-ulp change of one weight
 * can move a rounded sum from just below 1 to just above it.)
 */
function normalize(weights: Float64Array, centre: number): void {
  let total = 0;
  for (let k = 0; k < weights.length; k++) total += weights[k]!;
  for (let k = 0; k < weights.length; k++) weights[k]! /= total;
  let hi = 0, lo = 0;
  for (let k = 0; k < weights.length; k++) {
    if (k === centre) continue;
    const w = weights[k]!, s = hi + w, b = s - hi;
    lo += (hi - (s - b)) + (w - b);
    hi = s;
  }
  // 1 − (hi + lo): TwoSum of 1 and −hi, then the low parts.
  const s = 1 - hi, b = s - 1, e = (1 - (s - b)) + (-hi - b);
  weights[centre] = s + (e - lo);
}

/** The geometric defocus disc of one request, in micrometres and in sites. */
export interface ResolvedDefocusDisc {
  /** Blur-circle diameter c at the sensor, µm (`calculateDefocusCircle`, thin-lens model 1.1.0). */
  readonly diameterMicrometers: number;
  /** c / pitch. */
  readonly diameterSites: number;
  /** Kernel radius R in sites (0 when c = 0). */
  readonly kernelRadiusSites: number;
}

/**
 * Resolves the defocus disc for a thin lens focused at `focusDistanceM` imaging a plane at `subjectDistanceM`, on a
 * lattice of `pitchMicrometers`. Exactly zero when the two distances are equal. It does not check the radius cap.
 */
export function resolveDefocusDisc(input: { focalLengthMm: number; aperture: number; focusDistanceM: number; subjectDistanceM: number;
  pitchMicrometers: number }): ResolvedDefocusDisc {
  const { pitchMicrometers, ...circle } = input;
  if (!Number.isFinite(pitchMicrometers) || pitchMicrometers <= 0) throw new InvalidScientificInputError("pitchMicrometers must be a positive finite number.");
  const diameterMicrometers = calculateDefocusCircle(circle).value.diameterMm * 1000;
  const diameterSites = diameterMicrometers / pitchMicrometers;
  return { diameterMicrometers, diameterSites, kernelRadiusSites: defocusDiscKernelRadius(diameterSites) };
}

/**
 * The full 2-D convolution of two square site kernels (row-major, radii `radiusA` and `radiusB`): a kernel of radius
 * radiusA + radiusB with out(t) = Σ_s a(s)·b(t − s), each output summed over the taps of `a` in row-major order (zero taps
 * of either kernel skipped, which adds exact zeros only). Used for lens.defocus with lens.diffraction (#492): each spectral
 * node's diffraction kernel convolved with the defocus disc. That combination is an approximation: the defocused wave PSF
 * of a circular pupil is not exactly the in-focus Airy pattern convolved with the geometric disc. Both inputs here are
 * centred and non-negative, so the result is too; its sum is the product of the inputs' sums up to rounding.
 */
export function convolveSiteKernels(a: Float64Array, radiusA: number, b: Float64Array, radiusB: number): Float64Array {
  const wa = 2 * radiusA + 1, wb = 2 * radiusB + 1, radius = radiusA + radiusB, width = 2 * radius + 1;
  if (a.length !== wa * wa || b.length !== wb * wb) throw new InvalidScientificInputError("Site kernels must be (2R + 1)² taps.");
  const out = new Float64Array(width * width);
  // Non-zero taps of b, as (row, column, weight).
  const bRows: number[] = [], bColumns: number[] = [], bWeights: number[] = [];
  for (let j = 0; j < wb; j++) for (let i = 0; i < wb; i++) { const w = b[j * wb + i]!; if (w !== 0) { bRows.push(j); bColumns.push(i); bWeights.push(w); } }
  for (let sj = 0; sj < wa; sj++) for (let si = 0; si < wa; si++) {
    const w = a[sj * wa + si]!;
    if (w === 0) continue;
    for (let k = 0; k < bWeights.length; k++) {
      const index = (sj + bRows[k]!) * width + si + bColumns[k]!;
      out[index] = out[index]! + w * bWeights[k]!;
    }
  }
  return out;
}
