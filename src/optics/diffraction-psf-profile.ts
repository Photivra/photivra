// SPDX-License-Identifier: Apache-2.0

/**
 * Builds a `LensSampledPsfProfile` for an ideal, aberration-free, in-focus lens with a uniformly lit
 * circular pupil: the Airy pattern of scalar Fraunhofer diffraction, one unit-sum kernel per declared
 * wavelength on ONE shared sample grid (2.1.0).
 *
 * **Model.** The pupil diameter is D = f/N (entrance pupil = exit pupil, unity pupil magnification) and
 * the pupil-to-image distance z is the thin-lens image distance for the focus (f at infinity), so the
 * image-side (working) f-number is N_w = z/D. The incoherent optical transfer function (OTF) of a
 * uniform circular pupil is the normalized autocorrelation of the pupil,
 *   H(ρ) = (2/π)·(acos ρ − ρ·√(1 − ρ²)),  ρ = |f|/f_c ≤ 1,  f_c = 1/(λ·N_w),
 * and the intensity PSF is its inverse Fourier transform (the Airy pattern, first zero at 1.21967·λ·N_w)
 * (MIT OpenCourseWare 2.71 Optics, Spring 2009, lectures 21–22, free: the intensity PSF as the transform of
 * the pupil autocorrelation and the circular-pupil MTF; also see: Goodman, Introduction to Fourier Optics,
 * 4th ed., 2017, §6.3).
 *
 * **Cell integration (exact, no Bessel functions).** Kernel sample (i, j) is the PSF energy inside the
 * square cell of side p centred on (i·p, j·p). The cell integral is the PSF convolved with the cell's
 * indicator, evaluated at the cell centre, so in the frequency domain
 *   K(i, j) = p² ∫∫ H(|f|/f_c)·sinc(p·f_x)·sinc(p·f_y)·cos(2π·p·i·f_x)·cos(2π·p·j·f_y) d²f,
 * with sinc(x) = sin(πx)/(πx) (the sine terms vanish because H is even). It is evaluated in polar
 * coordinates: a trapezoid rule in angle (exponentially convergent for this smooth periodic integrand) and
 * Gauss–Legendre in t with ρ = 1 − t², which removes the (1 − ρ)^{3/2} edge behaviour of H. The node counts
 * follow from the integrand's bandwidth with a fixed margin; the tests check convergence by doubling them and
 * check the values against an independent real-space integration of `calculateIdealPolygonDiffractionPsf` in
 * its many-blade (circular) limit. The sum of all cells is exactly 1 (Parseval), so the energy captured by
 * the finite kernel is Σ K over its window and the truncated energy is 1 − Σ K.
 *
 * **Truncation and normalization.** The kernel is the (2R+1)² window of cells. The Airy tails fall only as
 * r⁻³, so a finite window always misses some energy: it is reported per wavelength, and the window is then
 * renormalized to unit sum because the sampled-profile contract requires unit-energy kernels. The missing
 * tail energy is thereby put back inside the window (an approximation that slightly raises low-frequency
 * contrast compared with the untruncated pattern).
 *
 * **Approximations (labelled):** scalar (no polarization), aberration-free, uniform pupil amplitude, exactly in
 * focus (no defocus), thin lens with unity pupil magnification, the on-axis PSF used across the declared field
 * (isoplanatic), PSF energy binned into the sample cells, finite window renormalized. Not a measured lens.
 * @see docs/PSF_FOUNDATION.md, "Diffraction-limited sampled profile (2.1)".
 */

import { approximationResult, type CalculationResult } from "../core/calculation-result.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";
import { requireAllowlistedRecord } from "../core/record-validation.js";
import type { EvidenceProvenance } from "../core/evidence-provenance.js";
import type { FocusPlane } from "./focus-state.js";
import { calculateThinLensImageDistance } from "./thin-lens.js";
import { parseLensSampledPsfProfile, type LensSampledPsfProfile } from "./lens-psf-profile.js";

export const DIFFRACTION_LIMITED_PSF_PROFILE_MODEL = Object.freeze({
  modelId: "photivra-diffraction-limited-circular-pupil-psf" as const, modelVersion: "1.0.0" as const });
/** Input limits: at most 64 wavelengths, kernel radius 0–32 samples (the irradiance-convolution limit). */
export const DIFFRACTION_LIMITED_PSF_PROFILE_LIMITS = Object.freeze({ maximumWavelengths: 64, maximumKernelRadiusSamples: 32 });
/** Radius of the first dark ring of the Airy pattern in units of λ·N_w: j₁,₁/π, j₁,₁ = 3.8317059702 (first zero of J₁). */
const AIRY_FIRST_ZERO_PER_LAMBDA_N = 3.8317059702075125 / Math.PI;

export interface CreateDiffractionLimitedPsfProfileInput {
  /** Only `circular` in 2.1.0 (polygon pupils: `calculateIdealPolygonDiffractionPsf` gives point densities). */
  aperture: "circular";
  focalLengthMm: number;
  apertureFNumber: number;
  focus: FocusPlane;
  /** Strictly increasing wavelengths, nm, in the medium of propagation (no air/vacuum conversion is applied). 1–64. */
  wavelengthsNm: readonly number[];
  /** Square sample pitch of every kernel, µm. */
  samplePitchMicrometers: number;
  /** Kernel half-width in samples; each kernel is (2R + 1)². 0–32. */
  kernelRadiusSamples: number;
  /** Half-extent of the image field over which the on-axis PSF is declared (profile field axes ±x, ±y), mm. */
  fieldHalfExtentMm: { x: number; y: number };
  profileId: string;
}

export interface DiffractionLimitedPsfWavelength {
  wavelengthNm: number;
  /** f_c = 1/(λ·N_w), cycles per µm. */
  cutoffFrequencyCyclesPerMicrometer: number;
  /** 1.21967·λ·N_w, µm. */
  firstZeroRadiusMicrometers: number;
  /** Σ of the cell energies inside the window before renormalization (of a total of 1). */
  capturedEnergyFraction: number;
  /** 1 − capturedEnergyFraction: the Airy tail energy outside the window, put back by renormalization. */
  truncatedEnergyFraction: number;
  /** Fraction of the renormalized kernel in the centre sample. */
  centreSampleFraction: number;
}

export interface DiffractionLimitedPsfProfile {
  profile: LensSampledPsfProfile;
  model: typeof DIFFRACTION_LIMITED_PSF_PROFILE_MODEL;
  pupilDiameterMm: number;
  pupilToImageDistanceMm: number;
  workingFNumber: number;
  kernelRadiusSamples: number;
  samplePitchMicrometers: number;
  wavelengths: readonly DiffractionLimitedPsfWavelength[];
  /** Largest truncated energy over the wavelengths. */
  maximumTruncatedEnergyFraction: number;
  quadrature: { method: "polar-frequency-domain-trapezoid-gauss-legendre"; maximumRadialNodes: number; maximumAngularNodes: number };
}

const EVIDENCE: readonly EvidenceProvenance[] = Object.freeze([Object.freeze({ sourceOrigin: "photivra" as const,
  sourceReference: "photivra:diffraction-limited-psf-profile", reuseStatus: "photivra-owned" as const })]);
const LIMITATIONS = Object.freeze([
  "Scalar Fraunhofer diffraction of an ideal, uniformly lit circular pupil (Airy pattern); no aberration, apodization, polarization or stray light.",
  "Exactly in focus: no defocus or depth of field. Thin lens with unity pupil magnification; the pupil-to-image distance is the thin-lens image distance.",
  "The on-axis PSF is declared unchanged across the field (isoplanatic); no field-dependent aberration or pupil clipping.",
  "PSF energy is binned into square sample cells; the finite window misses the Airy tail energy listed per wavelength and is renormalized to unit sum.",
  "Wavelengths are used as given, in the declared basis, without air/vacuum conversion."
]);

function positive(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new InvalidConfigurationError(name + " must be a positive finite number.");
  return value;
}

/** Gauss–Legendre nodes and weights on [0, 1] (Newton iteration on Pₙ; DLMF §3.5(v)). Cached per n. */
const GAUSS_LEGENDRE = new Map<number, { nodes: Float64Array; weights: Float64Array }>();
function gaussLegendre(n: number): { nodes: Float64Array; weights: Float64Array } {
  const cached = GAUSS_LEGENDRE.get(n);
  if (cached) return cached;
  const nodes = new Float64Array(n), weights = new Float64Array(n);
  for (let k = 0; k < Math.ceil(n / 2); k++) {
    let x = Math.cos(Math.PI * (k + 0.75) / (n + 0.5));
    for (let iteration = 0; iteration < 100; iteration++) {
      let p0 = 1, p1 = x;
      for (let m = 2; m <= n; m++) { const p2 = ((2 * m - 1) * x * p1 - (m - 1) * p0) / m; p0 = p1; p1 = p2; }
      const step = p1 / (n * (x * p1 - p0) / (x * x - 1));
      x -= step;
      if (Math.abs(step) < 1e-16) break;
    }
    let p0 = 1, p1 = x;
    for (let m = 2; m <= n; m++) { const p2 = ((2 * m - 1) * x * p1 - (m - 1) * p0) / m; p0 = p1; p1 = p2; }
    const derivative = n * (x * p1 - p0) / (x * x - 1);
    const w = 1 / ((1 - x * x) * derivative * derivative);
    // Map [-1, 1] to [0, 1]: t = (1 ± x)/2, weight w (2/(1-x²)P'² halved).
    nodes[k] = (1 - x) / 2; weights[k] = w;
    nodes[n - 1 - k] = (1 + x) / 2; weights[n - 1 - k] = w;
  }
  const result = { nodes, weights };
  if (GAUSS_LEGENDRE.size < 64) GAUSS_LEGENDRE.set(n, result);
  return result;
}
function sinc(x: number): number {
  if (x === 0) return 1;
  const a = Math.PI * x;
  return Math.sin(a) / a;
}

/**
 * Cell energies K(i, j), 0 ≤ i, j ≤ R, of the Airy pattern for β = p·f_c (cell side in units of the cut-off
 * period). `scale` multiplies the node counts (1 in production; the tests use 2 to check convergence).
 */
export function calculateAiryCellEnergies(beta: number, radius: number, scale = 1): { cells: Float64Array; radialNodes: number; angularNodes: number } {
  // Bandwidth of the angular and radial integrands: c = π·β·(2R + 1)·√2 (the sinc factors and the highest cosine).
  const c = Math.PI * beta * (2 * radius + 1) * Math.SQRT2, margin = 10 * Math.cbrt(c) + 24;
  const quarter = Math.ceil(scale * (c + margin) / 4), radialNodes = Math.ceil(scale * (c + margin));
  const { nodes, weights } = gaussLegendre(radialNodes), size = radius + 1, cells = new Float64Array(size * size);
  const ca = new Float64Array(size), cb = new Float64Array(size), angularStep = (Math.PI / 2) / quarter;
  for (let r = 0; r < radialNodes; r++) {
    const t = nodes[r]!, rho = 1 - t * t;
    // H(1 − t²) without cancellation: acos(1 − t²) = 2·asin(t/√2), ρ·√(1 − ρ²) = ρ·t·√(2 − t²).
    const otf = (2 / Math.PI) * (2 * Math.asin(t / Math.SQRT2) - rho * t * Math.sqrt(2 - t * t));
    // ∫₀¹ g(ρ) dρ = ∫₀¹ g(1 − t²)·2t dt; the 4 is the four symmetric quadrants of the angular trapezoid.
    const radialWeight = weights[r]! * 2 * t * rho * otf * 4 * angularStep;
    for (let k = 0; k <= quarter; k++) {
      const theta = k * angularStep, x = beta * rho * Math.cos(theta), y = beta * rho * Math.sin(theta);
      const w = radialWeight * (k === 0 || k === quarter ? 0.5 : 1) * sinc(x) * sinc(y);
      // cos(2π·i·x) and cos(2π·j·y) by the Chebyshev recurrence.
      const cx = Math.cos(2 * Math.PI * x), cy = Math.cos(2 * Math.PI * y);
      ca[0] = 1; cb[0] = 1;
      if (size > 1) { ca[1] = cx; cb[1] = cy; }
      for (let i = 2; i < size; i++) { ca[i] = 2 * cx * ca[i - 1]! - ca[i - 2]!; cb[i] = 2 * cy * cb[i - 1]! - cb[i - 2]!; }
      for (let j = 0; j < size; j++) {
        const wj = w * cb[j]!;
        for (let i = 0; i < size; i++) { const o = j * size + i; cells[o] = cells[o]! + wj * ca[i]!; }
      }
    }
  }
  const area = beta * beta;
  for (let i = 0; i < cells.length; i++) cells[i] = cells[i]! * area;
  return { cells, radialNodes, angularNodes: 4 * quarter };
}

/**
 * Creates a sampled lens PSF profile for an ideal diffraction-limited lens with a circular pupil: one
 * unit-sum Airy kernel per wavelength on one shared (2R+1)² grid, with the truncated energy reported per
 * wavelength. The profile declares the given focal length, f-number and focus exactly, and the field axes
 * ±`fieldHalfExtentMm` with the same kernel at every field node.
 * @param input - See `CreateDiffractionLimitedPsfProfileInput`.
 * @returns The profile and its diffraction record. An approximation; not a measured lens.
 * @see docs/PSF_FOUNDATION.md, "Diffraction-limited sampled profile (2.1)".
 */
export function createDiffractionLimitedPsfProfile(input: CreateDiffractionLimitedPsfProfileInput): CalculationResult<DiffractionLimitedPsfProfile> {
  const r = requireAllowlistedRecord(input, ["aperture", "focalLengthMm", "apertureFNumber", "focus", "wavelengthsNm", "samplePitchMicrometers",
    "kernelRadiusSamples", "fieldHalfExtentMm", "profileId"], "Invalid diffraction-limited PSF profile input.");
  if (r.aperture !== "circular") throw new InvalidConfigurationError("aperture must be \"circular\".");
  const focalLengthMm = positive(r.focalLengthMm, "focalLengthMm"), fNumber = positive(r.apertureFNumber, "apertureFNumber");
  const pitch = positive(r.samplePitchMicrometers, "samplePitchMicrometers");
  const L = DIFFRACTION_LIMITED_PSF_PROFILE_LIMITS;
  const radius = r.kernelRadiusSamples;
  if (typeof radius !== "number" || !Number.isSafeInteger(radius) || radius < 0 || radius > L.maximumKernelRadiusSamples) {
    throw new InvalidConfigurationError("kernelRadiusSamples must be an integer from 0 to " + L.maximumKernelRadiusSamples + ".");
  }
  const focus = requireAllowlistedRecord(r.focus, ["kind", "distanceM"], "Invalid focus.");
  let focusDiopters: number, distanceMm: number;
  if (focus.kind === "infinity") {
    if (focus.distanceM !== undefined) throw new InvalidConfigurationError("An infinity focus has no distanceM.");
    focusDiopters = 0; distanceMm = focalLengthMm;
  } else if (focus.kind === "finite") {
    const distanceM = positive(focus.distanceM, "focus.distanceM");
    focusDiopters = 1 / distanceM;
    distanceMm = calculateThinLensImageDistance({ focalLengthMm, objectDistanceM: distanceM }).value.imageDistanceMm;
  } else throw new InvalidConfigurationError("focus.kind must be finite or infinity.");
  const field = requireAllowlistedRecord(r.fieldHalfExtentMm, ["x", "y"], "Invalid fieldHalfExtentMm.");
  const fieldX = positive(field.x, "fieldHalfExtentMm.x"), fieldY = positive(field.y, "fieldHalfExtentMm.y");
  const list = r.wavelengthsNm;
  if (!Array.isArray(list) || list.length < 1 || list.length > L.maximumWavelengths) throw new InvalidConfigurationError("wavelengthsNm must list 1 to 64 wavelengths.");
  const wavelengths = (list as unknown[]).map((value, index) => positive(value, "wavelengthsNm[" + index + "]"));
  for (let i = 1; i < wavelengths.length; i++) if (!(wavelengths[i]! > wavelengths[i - 1]!)) throw new InvalidConfigurationError("wavelengthsNm must be strictly increasing.");
  if (typeof r.profileId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(r.profileId)) throw new InvalidConfigurationError("profileId must be a public opaque ID.");

  const pupilDiameterMm = focalLengthMm / fNumber, workingFNumber = distanceMm / pupilDiameterMm, size = 2 * radius + 1;
  let maximumRadialNodes = 0, maximumAngularNodes = 0, maximumTruncated = 0;
  const records: DiffractionLimitedPsfWavelength[] = [], kernels: number[][] = [];
  for (const nm of wavelengths) {
    const lambdaN = nm / 1000 * workingFNumber, cutoff = 1 / lambdaN;
    const airy = calculateAiryCellEnergies(pitch * cutoff, radius);
    maximumRadialNodes = Math.max(maximumRadialNodes, airy.radialNodes); maximumAngularNodes = Math.max(maximumAngularNodes, airy.angularNodes);
    const values: number[] = new Array(size * size);
    let captured = 0;
    for (let ky = 0; ky < size; ky++) for (let kx = 0; kx < size; kx++) {
      const value = airy.cells[Math.abs(ky - radius) * (radius + 1) + Math.abs(kx - radius)]!;
      // Every cell energy of a non-negative PSF is positive; a negative value would be a quadrature failure.
      if (!(value > -1e-13)) throw new InvalidConfigurationError("Diffraction cell integration failed to converge.");
      values[ky * size + kx] = Math.max(0, value);
      captured += values[ky * size + kx]!;
    }
    if (!(captured > 0 && captured <= 1 + 1e-9)) throw new InvalidConfigurationError("Diffraction cell integration failed to converge.");
    const truncated = Math.max(0, 1 - captured);
    maximumTruncated = Math.max(maximumTruncated, truncated);
    const kernel = values.map((v) => v / captured);
    kernels.push(kernel);
    records.push({ wavelengthNm: nm, cutoffFrequencyCyclesPerMicrometer: cutoff, firstZeroRadiusMicrometers: AIRY_FIRST_ZERO_PER_LAMBDA_N * lambdaN,
      capturedEnergyFraction: captured, truncatedEnergyFraction: truncated, centreSampleFraction: kernel[radius * size + radius]! });
  }
  const uncertainty = { kind: "not-quantified" as const, limitation: "Ideal diffraction-limited model; no measured lens or quadrature error bound." };
  const nodes = [-fieldX, fieldX].flatMap((fx) => [-fieldY, fieldY].flatMap((fy) => wavelengths.map((nm, index) => ({
    nodeId: "airy-" + (fx < 0 ? "xm" : "xp") + "-" + (fy < 0 ? "ym" : "yp") + "-" + index,
    coordinate: { focalLengthMm, focusDiopters, apertureFNumber: fNumber, fieldXmm: fx, fieldYmm: fy, wavelengthNm: nm, signedDefocusImagePlaneMicrometers: 0 },
    kernel: { widthSamples: size, heightSamples: size, samplePitchMicrometersX: pitch, samplePitchMicrometersY: pitch, centerSampleX: radius, centerSampleY: radius,
      normalizedIntensity: kernels[index]! },
    bestFocusImagePlaneOffsetMicrometers: 0, relativePupilThroughputFactor: 1, evidence: EVIDENCE, uncertainty }))));
  const profile = parseLensSampledPsfProfile({ schemaVersion: "0.1.0", profileId: r.profileId, profileVersion: DIFFRACTION_LIMITED_PSF_PROFILE_MODEL.modelVersion,
    scientificStatus: "approximation", opticalDomain: "lens-primary-optical-path-only", coordinateSystem: "image-plane-metric", fieldAxes: "+X right, +Y up",
    kernelEnergyNormalization: "unit-energy-shape", interpolation: "bounded-regular-grid-multilinear", throughputOwnership: "separate-relative-pupil-throughput-factor",
    responseIncludes: { diffraction: true, aberration: false, defocus: false, pupilClippingShape: false },
    sensorOpticalStackIncluded: false, sensorSamplingIncluded: false, reconstructionIncluded: false, strayLightIncluded: false,
    axes: { focalLengthMm: [focalLengthMm], focusDiopters: [focusDiopters], apertureFNumber: [fNumber], fieldXmm: [-fieldX, fieldX], fieldYmm: [-fieldY, fieldY],
      wavelengthNm: wavelengths, signedDefocusImagePlaneMicrometers: [0] },
    nodes, evidence: EVIDENCE, limitations: [...LIMITATIONS] });
  return approximationResult({ profile, model: DIFFRACTION_LIMITED_PSF_PROFILE_MODEL, pupilDiameterMm, pupilToImageDistanceMm: distanceMm, workingFNumber,
    kernelRadiusSamples: radius, samplePitchMicrometers: pitch, wavelengths: records, maximumTruncatedEnergyFraction: maximumTruncated,
    quadrature: { method: "polar-frequency-domain-trapezoid-gauss-legendre" as const, maximumRadialNodes, maximumAngularNodes } },
  DIFFRACTION_LIMITED_PSF_PROFILE_MODEL.modelId, DIFFRACTION_LIMITED_PSF_PROFILE_MODEL.modelVersion, [...LIMITATIONS]);
}
