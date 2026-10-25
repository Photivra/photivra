// SPDX-License-Identifier: Apache-2.0

/**
 * Internal (not exported from the package): one wavelength's diffraction kernel sampled on the site pitch, as the object-space
 * convolution (facade/diffraction-provider.ts) and the tabulated expected signal (facade/expected-signal-setup.ts) use it.
 *
 * `resolveLensPsfConvolutionKernels` parses and samples the PSF profile on every call (about 10 ms per wavelength), and both users
 * ask for the same kernels, so they are kept while the PSF record lives. The kernel is a function of its inputs alone; each caller
 * gets its own copy.
 */

import { InvalidConfigurationError } from "../core/configuration-error.js";
import { resolveLensPsfConvolutionKernels } from "./lens-psf-kernels.js";

type Psf = Parameters<typeof resolveLensPsfConvolutionKernels>[0]["psf"];

/** Kernels per PSF record (by identity: the record is large, so it is not serialized), then per wavelength, pitch and radius. */
const cache = new WeakMap<object, Map<string, Float64Array>>();

/** The (2·radius + 1)² kernel of `psf` at `wavelengthNm` on a square site grid of `pitchMicrometers`; `failure` is the error message when the kernel cannot sample the pitch exactly. */
export function siteDiffractionKernel(psf: Psf, wavelengthNm: number, pitchMicrometers: number, radius: number, failure: string): Float64Array {
  let kernels = cache.get(psf);
  if (!kernels) cache.set(psf, (kernels = new Map()));
  const key = wavelengthNm + ":" + pitchMicrometers + ":" + radius;
  let kernel = kernels.get(key);
  if (!kernel) {
    const k = resolveLensPsfConvolutionKernels({ schemaVersion: "0.1.0", psf, spectralWeights: [{ wavelengthNm, weight: 1 }],
      grid: { width: 1, height: 1, sitePitchMicrometers: { x: pitchMicrometers, y: pitchMicrometers }, opticalAxisSite: { x: 0.5, y: 0.5 } }, patchWidth: 1, patchHeight: 1,
      kernelRadius: radius }).value;
    if (!k.exactSiteSampling || k.kernelRadius !== radius) throw new InvalidConfigurationError(failure);
    kernel = Float64Array.from(k.kernels);
    kernels.set(key, kernel);
  }
  return Float64Array.from(kernel);
}
