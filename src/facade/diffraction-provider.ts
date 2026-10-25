// SPDX-License-Identifier: Apache-2.0

/**
 * Fast execution of `simulateCapture`'s `lens.diffraction` (2.1): an object-space convolution in the scene
 * provider, instead of one scene query per PSF tap in the environment PSF quadrature.
 *
 * The environment quadrature computes, at each site centre q and spectral node λ,
 *   E(q, λ) = Σ_k K_λ(k)·T·L(s_k(q), λ),
 * where s_k(q) is the tap's source point (`sensorPsfSourcePoint`), L the scene radiance at the plane point
 * that source point sees, and T the radiance-to-irradiance factor. For the facade's planar scene seen
 * through the ideal rectilinear projection with a still camera and no lens field mapping, field throughput or
 * pupil rays:
 * - T is the same at every sensor point (paraxial π/(4·N_w²), no cos⁴ term), and
 * - with the kernel sampled on the site pitch, every source point is the centre of another site, so the plane
 *   points form one regular lattice: u = (i + ½ − W/2)·2/w, v = −(j + ½ − H/2)·2/w (frame units, native
 *   site (i, j), W×H native sites, w output width).
 * So E(q, λ) = T·B(q, λ) with B = K_λ ⊛ L sampled on that lattice: the same sum, in a different floating-point
 * order. B is computed once per spectral node with the engine's isoplanatic convolution
 * (`calculateIrradianceConvolution`, kernels from `resolveLensPsfConvolutionKernels`, exact site sampling) over a
 * grid that holds every source (the native raster plus the kernel radius on each side), in row bands. The
 * provider then answers each site-centre query with B instead of L, and the environment request declares no
 * PSF. Incoherent imaging is a linear superposition of intensity PSFs, so convolving radiance on the object
 * plane and convolving irradiance on the image plane agree for a planar object and a space-invariant PSF
 * (MIT OpenCourseWare 2.71, lecture 22, free; also see: Goodman, Introduction to Fourier Optics, 4th ed., §7.1).
 *
 * With an anti-aliasing point-splitting filter (2.1, `sensor.antiAliasing`) the environment queries the PSF taps
 * around each pre-filter source point q − a (a = a split offset) instead of around q. Those taps lie on the site
 * lattice shifted by a, so the same argument holds on each shifted lattice: B is computed once per distinct
 * fractional shift (offsets that differ by whole sites share one lattice; the centred four-spot filter with a
 * one-site separation needs a single half-site-shifted lattice) over the native raster widened by the largest
 * offset, and the environment's spatial quadrature still forms the weighted split sum.
 *
 * Region renders (2.6, `window`): only the lattice rows and columns that the region's sites can query (the window
 * plus the largest offset on each side) are convolved, over a grid that adds the kernel radius on each side. Every
 * output value is the same gather as in the whole render: the grid always holds every tap of every value it keeps
 * (real scene radiance out to the kernel radius, never a truncated edge), the single kernel patch does not depend on
 * the grid's origin, and `convolveIrradianceRows` sums each value in a fixed tap order (v outer, u inner). Narrowing
 * the grid therefore removes only values that no query reads, and the kept values are bit-identical.
 *
 * A query that does not land on one of the lattices (within 1e-6 site) is refused rather than approximated: the
 * facade uses this path only when the lattice argument above holds. A query outside the window is refused too.
 */

import { InvalidConfigurationError } from "../core/configuration-error.js";
import { isInternalSceneRadianceEvaluator, markInternalSceneRadianceEvaluator, registerInternalRadianceAccess } from "../core/internal-radiance-evaluator.js";
import type { SceneRadianceEvaluationRequest, SceneRadianceEvaluationResult } from "../schema/scene-radiance.js";
import { calculateIrradianceConvolution } from "../optics/irradiance-convolution.js";
import { siteDiffractionKernel } from "../optics/site-diffraction-kernel.js";
import type { ResolveLensSampledPsfInput } from "../optics/lens-psf-profile.js";
import type { PlanarSceneRadianceProvider } from "./scene-radiance.js";

/** Rows of native sites per convolution band, and the bands kept. Banding changes memory only, never values. */
const BAND_ROWS = 32;
const CACHED_BANDS = 4;
const LATTICE_TOLERANCE_SITES = 1e-6;

export interface DiffractedPlanarProviderInput {
  base: PlanarSceneRadianceProvider;
  /** The optical state of the sampled PSF, as for `resolveLensSampledPsf`, without field point and wavelength. */
  psf: Omit<ResolveLensSampledPsfInput, "fieldPointMm" | "wavelengthNm">;
  /** Spectral nodes the environment queries (the profile's wavelength nodes). */
  wavelengthsNm: readonly number[];
  kernelRadius: number;
  nativeWidth: number;
  nativeHeight: number;
  /** Output (active) width in sites: frame units are 2/outputWidth per site. */
  outputWidth: number;
  sitePitchMicrometers: number;
  /** Planar geometry of the base provider, to map query directions to plane points exactly as it does. */
  distanceM: number;
  metresPerFrameUnit: number;
  /**
   * Offsets of the query points from the site centres, in sites (+x right, +y down): the anti-aliasing split
   * offsets with their sign reversed (the environment queries q − a). Default: one zero offset.
   */
  queryOffsetsSites?: readonly { x: number; y: number }[];
  /**
   * Region renders (2.6): the native sites that will be queried (x, y, width, height in the native raster). Only the
   * lattice they can reach is convolved; values are bit-identical to the whole render's. Default: the whole raster.
   */
  window?: { x: number; y: number; width: number; height: number };
  /** Called with the duration in ms of each band convolution (diagnostics only; never changes values). */
  onConvolution?: (milliseconds: number) => void;
}

/** Internal (not exported from the package): the base provider with diffraction applied as an object-space convolution. */
export function createDiffractedPlanarProvider(input: DiffractedPlanarProviderInput): PlanarSceneRadianceProvider {
  const { base, wavelengthsNm, nativeWidth: W, nativeHeight: H, kernelRadius: R } = input;
  const g = 2 / input.outputWidth, pitch = input.sitePitchMicrometers;
  const index = new Map(wavelengthsNm.map((nm, i) => [nm, i]));
  // One lattice per distinct fractional query offset; M extra sites per side hold the offset queries.
  const offsets = input.queryOffsetsSites ?? [{ x: 0, y: 0 }];
  const fraction = (value: number): number => { const f = value - Math.floor(value); return f > 1 - LATTICE_TOLERANCE_SITES ? 0 : f < LATTICE_TOLERANCE_SITES ? 0 : f; };
  const shifts: { x: number; y: number }[] = [];
  for (const o of offsets) {
    const f = { x: fraction(o.x), y: fraction(o.y) };
    if (!shifts.some((s) => Math.abs(s.x - f.x) <= LATTICE_TOLERANCE_SITES && Math.abs(s.y - f.y) <= LATTICE_TOLERANCE_SITES)) shifts.push(f);
  }
  const M = Math.max(0, ...offsets.map((o) => Math.ceil(Math.max(Math.abs(o.x), Math.abs(o.y)) - LATTICE_TOLERANCE_SITES)));
  const LW = W + 2 * M, LH = H + 2 * M;
  // Lattice window (indices i + M, j + M): the sites the region queries plus the largest offset on each side, clipped
  // to the lattice. A site i queries i + floor(offset), and floor(offset) lies in [-M, M].
  const win = input.window ?? { x: 0, y: 0, width: W, height: H };
  const lx0 = Math.max(0, win.x), lx1 = Math.min(LW, win.x + win.width + 2 * M);
  const ly0 = Math.max(0, win.y), ly1 = Math.min(LH, win.y + win.height + 2 * M);
  if (!(lx0 < lx1 && ly0 < ly1)) throw new InvalidConfigurationError("Diffraction window must overlap the native raster.");
  const NW = lx1 - lx0;
  // One kernel per wavelength, on the site grid, from the engine's own tap-to-site mapping (field point 0, 0); kept across calls.
  const kernels = wavelengthsNm.map((wavelengthNm) => siteDiffractionKernel(input.psf, wavelengthNm, pitch, R, "Diffraction kernels must sample the site pitch exactly."));
  const gridWidth = NW + 2 * R;
  const now = (): number => globalThis.performance?.now() ?? Date.now();
  const bands = new Map<number, Float64Array[][]>();
  function band(b: number): Float64Array[][] {
    const cached = bands.get(b);
    if (cached) { bands.delete(b); bands.set(b, cached); return cached; }
    const started = input.onConvolution ? now() : 0;
    const y0 = ly0 + b * BAND_ROWS, rows = Math.min(BAND_ROWS, ly1 - y0), gridHeight = rows + 2 * R;
    const values = shifts.map((shift) => wavelengthsNm.map((nm, w) => {
      const samples = new Float64Array(gridWidth * gridHeight);
      for (let gy = 0; gy < gridHeight; gy++) {
        const v = shift.y === 0 ? -(y0 + gy - R - M + 0.5 - H / 2) * g : -(y0 + gy - R - M + 0.5 + shift.y - H / 2) * g;
        for (let gx = 0, x = lx0; gx < gridWidth; gx++, x++) samples[gy * gridWidth + gx] = base.radianceAt(shift.x === 0 ? (x - R - M + 0.5 - W / 2) * g : (x - R - M + 0.5 + shift.x - W / 2) * g, v, nm);
      }
      const blurred = calculateIrradianceConvolution({ schemaVersion: "0.1.0", width: gridWidth, height: gridHeight, samples, kernelRadius: R,
        patchWidth: gridWidth, patchHeight: gridHeight, kernels: kernels[w]!, boundary: "zero-outside-grid" }).values;
      const out = new Float64Array(NW * rows);
      for (let y = 0; y < rows; y++) out.set(blurred.subarray((y + R) * gridWidth + R, (y + R) * gridWidth + R + NW), y * NW);
      return out;
    }));
    bands.set(b, values);
    if (bands.size > CACHED_BANDS) bands.delete(bands.keys().next().value!);
    if (input.onConvolution) input.onConvolution(now() - started);
    return values;
  }
  function blurredAt(u: number, v: number, nm: number): number {
    const w = index.get(nm), fi = u / g - 0.5 + W / 2, fj = -v / g - 0.5 + H / 2;
    if (w !== undefined) for (let s = 0; s < shifts.length; s++) {
      const shift = shifts[s]!, i = Math.round(fi - shift.x), j = Math.round(fj - shift.y);
      if (Math.abs(fi - shift.x - i) > LATTICE_TOLERANCE_SITES || Math.abs(fj - shift.y - j) > LATTICE_TOLERANCE_SITES) continue;
      const li = i + M, lj = j + M;
      if (li < lx0 || lj < ly0 || li >= lx1 || lj >= ly1) break;
      return band(Math.floor((lj - ly0) / BAND_ROWS))[s]![w]![((lj - ly0) % BAND_ROWS) * NW + li - lx0]!;
    }
    throw new InvalidConfigurationError("Diffraction query is off the site lattice; the object-space convolution does not apply.");
  }
  const scale = input.metresPerFrameUnit, distance = input.distanceM, baseEvaluate = base.evaluateRadiance;
  const evaluateRadiance = (request: Readonly<SceneRadianceEvaluationRequest>): SceneRadianceEvaluationResult => {
    const result = baseEvaluate.call(base, request), o = (request.target as { outgoingDirectionUnitVector: { x: number; y: number; z: number } }).outgoingDirectionUnitVector;
    const t = distance / -o.z;
    return { ...result, spectralRadianceWattsPerSquareMeterSteradianNanometer: blurredAt(-o.x * t / scale, -o.y * t / scale, request.wavelengthNanometers) };
  };
  // 2.6: the result is the base result with only its radiance replaced (same keys and records), so an engine-built base
  // evaluator keeps its mark (see core/internal-radiance-evaluator.ts).
  if (isInternalSceneRadianceEvaluator(baseEvaluate)) {
    markInternalSceneRadianceEvaluator(evaluateRadiance);
    // #394: its radiance is the convolved value at one lattice site (shift s, lattice column li, row lj) per wavelength, so
    // the lean executor may read it by that key: the same plane point, lattice choice and band value as evaluateRadiance.
    registerInternalRadianceAccess(evaluateRadiance, {
      tabulated: false,
      keyOfDirection(o): number | undefined {
        if (!(-o.z > 0)) return undefined;
        const t = distance / -o.z, u = -o.x * t / scale, v = -o.y * t / scale, fi = u / g - 0.5 + W / 2, fj = -v / g - 0.5 + H / 2;
        for (let s = 0; s < shifts.length; s++) {
          const shift = shifts[s]!, i = Math.round(fi - shift.x), j = Math.round(fj - shift.y);
          if (Math.abs(fi - shift.x - i) > LATTICE_TOLERANCE_SITES || Math.abs(fj - shift.y - j) > LATTICE_TOLERANCE_SITES) continue;
          const li = i + M, lj = j + M;
          if (li < lx0 || lj < ly0 || li >= lx1 || lj >= ly1) return undefined;
          return (s * LH + lj) * LW + li;
        }
        return undefined;
      },
      radianceOfKey(key, nm): number {
        const w = index.get(nm);
        if (w === undefined) throw new InvalidConfigurationError("Diffraction query is off the site lattice; the object-space convolution does not apply.");
        const li = key % LW, rest = (key - li) / LW, lj = rest % LH, s = (rest - lj) / LH;
        return band(Math.floor((lj - ly0) / BAND_ROWS))[s]![w]![((lj - ly0) % BAND_ROWS) * NW + li - lx0]!;
      }
    });
  }
  return {
    sceneId: base.sceneId, providerProfileId: base.providerProfileId, radianceAt: base.radianceAt,
    evaluateRadiance,
    evaluateApertureRadiance(): SceneRadianceEvaluationResult {
      throw new InvalidConfigurationError("Diffraction by object-space convolution does not take pupil rays.");
    }
  };
}
