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
 * (MIT OpenCourseWare 2.71, lecture 22, free; also see: Goodman, Introduction to Fourier Optics, 4th ed., §6.1).
 *
 * A query that does not land on the lattice (within 1e-6 site) is refused rather than approximated: the facade
 * uses this path only when the lattice argument above holds.
 */

import { InvalidConfigurationError } from "../core/configuration-error.js";
import type { SceneRadianceEvaluationRequest, SceneRadianceEvaluationResult } from "../schema/scene-radiance.js";
import { calculateIrradianceConvolution } from "../optics/irradiance-convolution.js";
import { resolveLensPsfConvolutionKernels } from "../optics/lens-psf-kernels.js";
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
}

/** Internal (not exported from the package): the base provider with diffraction applied as an object-space convolution. */
export function createDiffractedPlanarProvider(input: DiffractedPlanarProviderInput): PlanarSceneRadianceProvider {
  const { base, wavelengthsNm, nativeWidth: W, nativeHeight: H, kernelRadius: R } = input;
  const g = 2 / input.outputWidth, pitch = input.sitePitchMicrometers;
  const index = new Map(wavelengthsNm.map((nm, i) => [nm, i]));
  // One kernel per wavelength, on the site grid, from the engine's own tap-to-site mapping (field point 0, 0).
  const kernels = wavelengthsNm.map((wavelengthNm) => {
    const k = resolveLensPsfConvolutionKernels({ schemaVersion: "0.1.0", psf: input.psf, spectralWeights: [{ wavelengthNm, weight: 1 }],
      grid: { width: 1, height: 1, sitePitchMicrometers: { x: pitch, y: pitch }, opticalAxisSite: { x: 0.5, y: 0.5 } }, patchWidth: 1, patchHeight: 1,
      kernelRadius: R }).value;
    if (!k.exactSiteSampling || k.kernelRadius !== R) throw new InvalidConfigurationError("Diffraction kernels must sample the site pitch exactly.");
    return k.kernels;
  });
  const gridWidth = W + 2 * R;
  const bands = new Map<number, Float64Array[]>();
  function band(b: number): Float64Array[] {
    const cached = bands.get(b);
    if (cached) { bands.delete(b); bands.set(b, cached); return cached; }
    const y0 = b * BAND_ROWS, rows = Math.min(BAND_ROWS, H - y0), gridHeight = rows + 2 * R;
    const values = wavelengthsNm.map((nm, w) => {
      const samples = new Float64Array(gridWidth * gridHeight);
      for (let gy = 0; gy < gridHeight; gy++) {
        const v = -(y0 + gy - R + 0.5 - H / 2) * g;
        for (let gx = 0; gx < gridWidth; gx++) samples[gy * gridWidth + gx] = base.radianceAt((gx - R + 0.5 - W / 2) * g, v, nm);
      }
      const blurred = calculateIrradianceConvolution({ schemaVersion: "0.1.0", width: gridWidth, height: gridHeight, samples, kernelRadius: R,
        patchWidth: gridWidth, patchHeight: gridHeight, kernels: kernels[w]!, boundary: "zero-outside-grid" }).values;
      const out = new Float64Array(W * rows);
      for (let y = 0; y < rows; y++) out.set(blurred.subarray((y + R) * gridWidth + R, (y + R) * gridWidth + R + W), y * W);
      return out;
    });
    bands.set(b, values);
    if (bands.size > CACHED_BANDS) bands.delete(bands.keys().next().value!);
    return values;
  }
  function blurredAt(u: number, v: number, nm: number): number {
    const w = index.get(nm), fi = u / g - 0.5 + W / 2, fj = -v / g - 0.5 + H / 2, i = Math.round(fi), j = Math.round(fj);
    if (w === undefined || Math.abs(fi - i) > LATTICE_TOLERANCE_SITES || Math.abs(fj - j) > LATTICE_TOLERANCE_SITES || i < 0 || j < 0 || i >= W || j >= H) {
      throw new InvalidConfigurationError("Diffraction query is off the site lattice; the object-space convolution does not apply.");
    }
    return band(Math.floor(j / BAND_ROWS))[w]![(j % BAND_ROWS) * W + i]!;
  }
  const scale = input.metresPerFrameUnit, distance = input.distanceM;
  return {
    sceneId: base.sceneId, providerProfileId: base.providerProfileId, radianceAt: base.radianceAt,
    evaluateRadiance(request: Readonly<SceneRadianceEvaluationRequest>): SceneRadianceEvaluationResult {
      const result = base.evaluateRadiance(request), o = (request.target as { outgoingDirectionUnitVector: { x: number; y: number; z: number } }).outgoingDirectionUnitVector;
      const t = distance / -o.z;
      return { ...result, spectralRadianceWattsPerSquareMeterSteradianNanometer: blurredAt(-o.x * t / scale, -o.y * t / scale, request.wavelengthNanometers) };
    },
    evaluateApertureRadiance(): SceneRadianceEvaluationResult {
      throw new InvalidConfigurationError("Diffraction by object-space convolution does not take pupil rays.");
    }
  };
}
