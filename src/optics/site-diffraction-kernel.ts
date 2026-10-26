// SPDX-License-Identifier: Apache-2.0

/**
 * Internal (not exported from the package): one wavelength's diffraction kernel sampled on the site pitch, as the object-space
 * convolution (facade/diffraction-provider.ts) and the tabulated expected signal (facade/expected-signal-setup.ts) use it.
 *
 * `resolveLensPsfConvolutionKernels` parses and samples the PSF profile on every call (about 10 ms per wavelength), and both users
 * ask for the same kernels. The kernel is a function of its inputs alone; each caller gets its own copy.
 *
 * The facade builds a new PSF record for every request, so kernels are kept by value: `registerDiffractionPsfKey` records, for a
 * record whose profile `createDiffractionLimitedPsfProfile` built, a canonical string of that call's whole input and of the record's
 * own fields (everything the kernel is a function of besides the wavelength, pitch and radius of the query). Records with an equal
 * string share their kernels, in a least-recently-used cache of `SITE_DIFFRACTION_KERNEL_CACHE_SIZE` records. A record that was not
 * registered (a caller's own profile) keeps its kernels while it lives, by identity, as before.
 */

import { InvalidConfigurationError } from "../core/configuration-error.js";
import { resolveLensPsfConvolutionKernels } from "./lens-psf-kernels.js";

type Psf = Parameters<typeof resolveLensPsfConvolutionKernels>[0]["psf"];

/** PSF records kept by value: at most 20 kernels of (2·32 + 1)² doubles each (676 KB) per record at the default spectral sampling. */
export const SITE_DIFFRACTION_KERNEL_CACHE_SIZE = 4;

/** Canonical value key of each registered PSF record. */
const keys = new WeakMap<object, string>();
/** Kernels per registered value key (least recently used first), then per wavelength, pitch and radius. */
const byValue = new Map<string, Map<string, Float64Array>>();
/** Kernels per unregistered PSF record (by identity: the record is large, so it is not serialized), then per wavelength, pitch and radius. */
const byIdentity = new WeakMap<object, Map<string, Float64Array>>();
/** Kernels resolved so far (test hook). */
let resolves = 0;

/** JSON with every number spelled exactly: shortest round-trip digits, and -0, NaN and ±Infinity kept apart from 0 and null. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => (typeof v === "number" && (Object.is(v, -0) || !Number.isFinite(v)) ? "number:" + (Object.is(v, -0) ? "-0" : String(v)) : v));
}

/**
 * Records that `psf.profile` is the profile `createDiffractionLimitedPsfProfile(profileInput)` returned, unmodified, so that the
 * kernels of `psf` are those of any record with the same `profileInput` and the same other fields. Call it right after building the
 * record; neither the record nor `profileInput` may change afterwards.
 */
export function registerDiffractionPsfKey(psf: Psf, profileInput: object): void {
  const fields = Object.entries(psf as object).filter(([name]) => name !== "profile").sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  keys.set(psf as object, canonical(["createDiffractionLimitedPsfProfile", profileInput, fields]));
}

/** The kernels kept for `psf`, made the most recently used. */
function kernelsOf(psf: Psf): Map<string, Float64Array> {
  const key = keys.get(psf as object);
  if (key === undefined) {
    let kernels = byIdentity.get(psf as object);
    if (!kernels) byIdentity.set(psf as object, (kernels = new Map()));
    return kernels;
  }
  let kernels = byValue.get(key);
  if (kernels) byValue.delete(key);
  else kernels = new Map();
  byValue.set(key, kernels);
  while (byValue.size > SITE_DIFFRACTION_KERNEL_CACHE_SIZE) byValue.delete(byValue.keys().next().value!);
  return kernels;
}

/** The (2·radius + 1)² kernel of `psf` at `wavelengthNm` on a square site grid of `pitchMicrometers`; `failure` is the error message when the kernel cannot sample the pitch exactly. */
export function siteDiffractionKernel(psf: Psf, wavelengthNm: number, pitchMicrometers: number, radius: number, failure: string): Float64Array {
  const kernels = kernelsOf(psf);
  const key = canonical([wavelengthNm, pitchMicrometers, radius]);
  let kernel = kernels.get(key);
  if (!kernel) {
    const k = resolveLensPsfConvolutionKernels({ schemaVersion: "0.1.0", psf, spectralWeights: [{ wavelengthNm, weight: 1 }],
      grid: { width: 1, height: 1, sitePitchMicrometers: { x: pitchMicrometers, y: pitchMicrometers }, opticalAxisSite: { x: 0.5, y: 0.5 } }, patchWidth: 1, patchHeight: 1,
      kernelRadius: radius }).value;
    if (!k.exactSiteSampling || k.kernelRadius !== radius) throw new InvalidConfigurationError(failure);
    kernel = Float64Array.from(k.kernels);
    resolves++;
    kernels.set(key, kernel);
  }
  return Float64Array.from(kernel);
}

/** Test hook: the number of PSF records kept by value, the kernels resolved so far, and whether `psf` is registered. */
export function siteDiffractionKernelCacheState(psf?: Psf): { valueEntries: number; resolves: number; registered: boolean } {
  return { valueEntries: byValue.size, resolves, registered: psf !== undefined && keys.has(psf as object) };
}

/** Test hook: forgets every kernel kept by value. */
export function clearSiteDiffractionKernelCache(): void {
  byValue.clear();
}
