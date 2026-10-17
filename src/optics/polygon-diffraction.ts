// SPDX-License-Identifier: Apache-2.0

/**
 * Calculates continuous monochromatic Fraunhofer PSF density for a uniformly illuminated, zero-phase,
 * on-axis ideal straight-edged regular polygon. Physical area is explicit; f/N may supply the
 * equal-area diameter only under a declared nominal-area convention. No phase aberration, clipping,
 * field dependence, curved blades, defocus or polychromatic behavior is inferred. Density = A |F/A|² /
 * (lambda * propagationDistance)². Parseval normalization is over the infinite plane, NOT over the
 * supplied point list. Downstream quadrature must preserve density × area and report
 * truncation/convergence.
 * @see docs/PHYSICS_FOUNDATION.md for the equations, units, coordinate conventions, known blockers
 * and support limits.
 */

import { approximationResult, type CalculationResult } from "../core/calculation-result.js";
import { InvalidScientificInputError, requirePositiveFinite } from "../core/validation.js";
import { calculateIdealApertureGeometry, type CalculateIdealApertureInput } from "./aperture.js";
import type { SpectralWavelengthBasis } from "../core/spectral.js";

/** On-axis, in-focus scalar diffraction of one ideal regular polygon pupil. */
export interface CalculateIdealPolygonDiffractionInput extends CalculateIdealApertureInput {
  /** Diameter of a circle with the SAME AREA as the physical polygon opening. */
  equivalentAreaPupilDiameterMm: number;
  /** Paraxial pupil-to-image propagation scale; not silently inferred from focus. */
  pupilToImageDistanceMm: number;
  /** Wavelength in the declared propagation medium; no air/vacuum conversion. */
  wavelengthNm: number;
  wavelengthBasis: Exclude<SpectralWavelengthBasis, "unspecified">;
  /** Displacements from the on-axis PSF center, +X right / +Y up; at most 4096. */
  imagePointsMicrometers: readonly { x: number; y: number }[];
}

/** Continuous unit-energy PSF samples, not a normalized finite convolution kernel. */
export interface IdealPolygonDiffraction {
  bladeCount: number;
  firstBladeEdgeAngleDegrees: number;
  pupilToImageDistanceMm: number;
  wavelengthNm: number;
  wavelengthBasis: Exclude<SpectralWavelengthBasis, "unspecified">;
  pupilAreaSquareMm: number;
  pupilCircumradiusMm: number;
  pupilNormalization: "equal-area-circle";
  fieldAxes: "+X right, +Y up";
  energyNormalization: "unit-integral-over-infinite-image-plane";
  throughputApplied: false;
  samples: readonly {
    imagePointMicrometers: { x: number; y: number };
    /** |F/A|²; unity at the origin. Not an energy/probability weight. */
    peakNormalizedIntensity: number;
    /** Density integrating to unity over the full image plane, in 1/µm². */
    intensityDensityPerSquareMicrometer: number;
  }[];
}

/** sin(x)/x - 1, evaluated without cancellation near zero. */
function sincMinusOne(x: number): number {
  if (Math.abs(x) < 0.01) {
    const x2 = x * x;
    return x2 * (-1 / 6 + x2 * (1 / 120 - x2 / 5040));
  }
  return Math.sin(x) / x - 1;
}

/**
 * Independently derived polygon Fourier boundary integral via the divergence
 * theorem. Coordinates use unit circumradius so pupil size cannot change the
 * numerical conditioning. Subtracting the zero-frequency edge term (whose
 * closed-contour sum is zero) removes cancellation at/near the origin.
 */
function peakIntensity(
  vertices: readonly { x: number; y: number }[],
  area: number,
  qx: number,
  qy: number
): number {
  const q = Math.hypot(qx, qy);
  if (q === 0) return 1;
  const ux = qx / q;
  const uy = qy / q;
  let real = 0;
  let imaginary = 0;
  for (let index = 0; index < vertices.length; index += 1) {
    const a = vertices[index]!;
    const b = vertices[(index + 1) % vertices.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const midpointPhase = qx * (a.x + b.x) / 2 + qy * (a.y + b.y) / 2;
    const edgePhase = (qx * dx + qy * dy) / 2;
    const sm1 = sincMinusOne(edgePhase);
    const sinc = 1 + sm1;
    const coefficient = (ux * dy - uy * dx) / area;
    // i times the edge integral: real = -Im(edge), imaginary = Re(edge).
    real += coefficient * sinc * (Math.sin(midpointPhase) / q);
    imaginary += coefficient * (sm1 - sinc * 2 * Math.sin(midpointPhase / 2) ** 2) / q;
  }
  return real * real + imaginary * imaginary;
}

/**
 * Calculates continuous monochromatic Fraunhofer PSF density for a uniformly
 * illuminated, zero-phase, on-axis ideal straight-edged regular polygon.
 * Physical area is explicit; f/N may supply the equal-area diameter only under
 * a declared nominal-area convention. No phase aberration, clipping, field
 * dependence, curved blades, defocus or polychromatic behavior is inferred.
 *
 * Density = A |F/A|² / (lambda * propagationDistance)². Parseval normalization
 * is over the infinite plane, NOT over the supplied point list. Downstream
 * quadrature must preserve density × area and report truncation/convergence.
 */
export function calculateIdealPolygonDiffractionPsf(
  input: CalculateIdealPolygonDiffractionInput
): CalculationResult<IdealPolygonDiffraction> {
  // Reject unmodeled effects rather than silently accepting and ignoring them.
  const allowed = new Set([
    "bladeCount", "firstBladeEdgeAngleDegrees", "equivalentAreaPupilDiameterMm",
    "pupilToImageDistanceMm", "wavelengthNm", "wavelengthBasis", "imagePointsMicrometers"
  ]);
  if (typeof input !== "object" || input === null || Array.isArray(input) ||
      Object.keys(input).some((key) => !allowed.has(key))) {
    throw new InvalidScientificInputError("Polygon diffraction input contains unsupported fields or is not an object.");
  }
  requirePositiveFinite("equivalentAreaPupilDiameterMm", input.equivalentAreaPupilDiameterMm);
  requirePositiveFinite("pupilToImageDistanceMm", input.pupilToImageDistanceMm);
  requirePositiveFinite("wavelengthNm", input.wavelengthNm);
  if (input.wavelengthBasis !== "air" && input.wavelengthBasis !== "vacuum") {
    throw new InvalidScientificInputError("wavelengthBasis must be air or vacuum.");
  }
  if (input.firstBladeEdgeAngleDegrees !== undefined && !Number.isFinite(input.firstBladeEdgeAngleDegrees)) {
    throw new InvalidScientificInputError("firstBladeEdgeAngleDegrees must be finite when supplied.");
  }
  if (!Array.isArray(input.imagePointsMicrometers) ||
      input.imagePointsMicrometers.length === 0 || input.imagePointsMicrometers.length > 4096) {
    throw new InvalidScientificInputError("imagePointsMicrometers must contain 1 through 4096 points.");
  }
  for (let index = 0; index < input.imagePointsMicrometers.length; index += 1) {
    if (!Object.hasOwn(input.imagePointsMicrometers, index)) {
      throw new InvalidScientificInputError("imagePointsMicrometers must not contain sparse entries.");
    }
  }
  const geometry = calculateIdealApertureGeometry({ bladeCount: input.bladeCount, ...(input.firstBladeEdgeAngleDegrees === undefined ? {} : { firstBladeEdgeAngleDegrees: input.firstBladeEdgeAngleDegrees }) }).value;
  const unitArea = input.bladeCount * Math.sin(2 * Math.PI / input.bladeCount) / 2;
  const pupilAreaSquareMm = Math.PI * (input.equivalentAreaPupilDiameterMm / 2) ** 2;
  const radius = Math.sqrt(pupilAreaSquareMm / unitArea);
  const propagationScale = input.wavelengthNm / 1_000_000 * input.pupilToImageDistanceMm;
  const densityScale = pupilAreaSquareMm / propagationScale ** 2 / 1_000_000;
  if (![pupilAreaSquareMm, radius, propagationScale, densityScale].every((x) => Number.isFinite(x) && x > 0)) {
    throw new InvalidScientificInputError("Derived polygon diffraction scales must remain finite and positive.");
  }
  const samples = input.imagePointsMicrometers.map((point) => {
    if (typeof point !== "object" || point === null || Array.isArray(point) ||
        !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
        Object.keys(point).some((key) => key !== "x" && key !== "y")) {
      throw new InvalidScientificInputError("Each image point must contain finite x/y coordinates only.");
    }
    const qx = 2 * Math.PI * (point.x / 1000) * radius / propagationScale;
    const qy = 2 * Math.PI * (point.y / 1000) * radius / propagationScale;
    // A numerical envelope, not a real-lens calibration or physical accuracy bound.
    if (!Number.isFinite(Math.hypot(qx, qy)) || Math.hypot(qx, qy) > 1_000_000) {
      throw new InvalidScientificInputError("Dimensionless pupil phase radius must not exceed 1000000.");
    }
    const intensity = peakIntensity(geometry.normalizedVertices, unitArea, qx, qy);
    return {
      imagePointMicrometers: { x: point.x === 0 ? 0 : point.x, y: point.y === 0 ? 0 : point.y },
      peakNormalizedIntensity: intensity,
      intensityDensityPerSquareMicrometer: intensity * densityScale
    };
  });
  return approximationResult({
    bladeCount: geometry.bladeCount,
    firstBladeEdgeAngleDegrees: input.firstBladeEdgeAngleDegrees ?? 0,
    pupilToImageDistanceMm: input.pupilToImageDistanceMm,
    wavelengthNm: input.wavelengthNm,
    wavelengthBasis: input.wavelengthBasis,
    pupilAreaSquareMm,
    pupilCircumradiusMm: radius,
    pupilNormalization: "equal-area-circle",
    fieldAxes: "+X right, +Y up",
    energyNormalization: "unit-integral-over-infinite-image-plane",
    throughputApplied: false,
    samples
  }, "ideal-regular-polygon-fraunhofer-diffraction", "1.0.0", [
    "Uniform unit pupil amplitude, zero phase, ideal regular straight-edged polygon; on-axis in-focus scalar paraxial Fraunhofer propagation only.",
    "Wavelength is supplied in its declared propagation medium; no wavelength-basis conversion is performed.",
    "Equal-area diameter fixes physical pupil area, not circumradius or inradius; no optical throughput loss is applied.",
    "Continuous PSF density has unit integral over the infinite image plane. Point samples are not a finite energy-normalized kernel.",
    "The analytical polygon boundary integral has no FFT/pupil-grid aliasing; downstream image-plane sampling and finite-support truncation still require convergence checks.",
    "No real-lens calibration, aberration, defocus, mechanical clipping, curved blades, field dependence, polarization, sensor response or stray light is modeled.",
    "Circular Airy remains a separate named diagnostic; do not stack this diffraction PSF over an already diffracted complex-pupil result."
  ], { notes: ["No quantified physical-model uncertainty is asserted. Numerical tolerances in tests are validation evidence, not real-lens accuracy bounds."] });
}

/** On-axis scalar Fraunhofer diffraction of one arbitrary simple polygon pupil. */
export interface CalculatePolygonPupilFraunhoferPsfInput {
  /**
   * Simple (non-self-intersecting) pupil polygon in pupil-plane millimetres, +X right / +Y up,
   * 3 through 4096 vertices; for example the cat's-eye pupil from calculateMechanicalVignetting().
   */
  pupilVerticesMm: readonly { x: number; y: number }[];
  /** Paraxial pupil-to-image propagation scale; not silently inferred from focus. */
  pupilToImageDistanceMm: number;
  /** Wavelength in the declared propagation medium; no air/vacuum conversion. */
  wavelengthNm: number;
  wavelengthBasis: Exclude<SpectralWavelengthBasis, "unspecified">;
  /** Displacements from the PSF centre (the geometric image point), +X right / +Y up; at most 4096. */
  imagePointsMicrometers: readonly { x: number; y: number }[];
}

export interface PolygonPupilFraunhoferPsf {
  pupilAreaSquareMm: number;
  pupilToImageDistanceMm: number;
  wavelengthNm: number;
  wavelengthBasis: Exclude<SpectralWavelengthBasis, "unspecified">;
  fieldAxes: "+X right, +Y up";
  energyNormalization: "unit-integral-over-infinite-image-plane";
  throughputApplied: false;
  samples: readonly {
    imagePointMicrometers: { x: number; y: number };
    /** |F/A|²; unity at the origin. */
    peakNormalizedIntensity: number;
    /** Density integrating to unity over the full image plane, in 1/µm². */
    intensityDensityPerSquareMicrometer: number;
  }[];
}

function requirePlanarPoint(value: unknown, path: string): { x: number; y: number } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidScientificInputError(`${path} must contain finite x/y coordinates only.`);
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).some((key) => key !== "x" && key !== "y") ||
    typeof record.x !== "number" || typeof record.y !== "number" ||
    !Number.isFinite(record.x) || !Number.isFinite(record.y)
  ) {
    throw new InvalidScientificInputError(`${path} must contain finite x/y coordinates only.`);
  }
  return { x: record.x, y: record.y };
}

/**
 * Continuous monochromatic Fraunhofer PSF density for a uniformly illuminated, zero-phase,
 * arbitrary simple polygon pupil (for example a mechanically vignetted cat's-eye pupil). Uses the
 * same analytic divergence-theorem boundary integral as the regular-polygon model, so there is no
 * pupil-grid aliasing. A pupil offset from the axis only adds a linear phase and leaves the
 * intensity unchanged. Density = A |F/A|² / (lambda z)², with unit integral over the infinite plane.
 */
export function calculatePolygonPupilFraunhoferPsf(
  input: CalculatePolygonPupilFraunhoferPsfInput
): CalculationResult<PolygonPupilFraunhoferPsf> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new InvalidScientificInputError("Polygon pupil diffraction input must be an object.");
  }
  requirePositiveFinite("pupilToImageDistanceMm", input.pupilToImageDistanceMm);
  requirePositiveFinite("wavelengthNm", input.wavelengthNm);
  if (input.wavelengthBasis !== "air" && input.wavelengthBasis !== "vacuum") {
    throw new InvalidScientificInputError("wavelengthBasis must be air or vacuum.");
  }
  if (!Array.isArray(input.pupilVerticesMm) || input.pupilVerticesMm.length < 3 ||
      input.pupilVerticesMm.length > 4096) {
    throw new InvalidScientificInputError("pupilVerticesMm must contain 3 through 4096 vertices.");
  }
  if (!Array.isArray(input.imagePointsMicrometers) ||
      input.imagePointsMicrometers.length === 0 || input.imagePointsMicrometers.length > 4096) {
    throw new InvalidScientificInputError("imagePointsMicrometers must contain 1 through 4096 points.");
  }
  const vertices = input.pupilVerticesMm.map((vertex, index) =>
    requirePlanarPoint(vertex, `pupilVerticesMm[${index}]`));
  // Centre and scale the polygon for conditioning; translation changes only the phase of F.
  const cx = vertices.reduce((sum, v) => sum + v.x, 0) / vertices.length;
  const cy = vertices.reduce((sum, v) => sum + v.y, 0) / vertices.length;
  const scale = Math.max(...vertices.map((v) => Math.hypot(v.x - cx, v.y - cy)));
  if (!(scale > 0) || !Number.isFinite(scale)) {
    throw new InvalidScientificInputError("pupilVerticesMm must span a finite non-zero region.");
  }
  let normalized = vertices.map((v) => ({ x: (v.x - cx) / scale, y: (v.y - cy) / scale }));
  let twiceArea = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    const a = normalized[index]!;
    const b = normalized[(index + 1) % normalized.length]!;
    twiceArea += a.x * b.y - b.x * a.y;
  }
  if (twiceArea < 0) {
    normalized = [...normalized].reverse();
    twiceArea = -twiceArea;
  }
  const unitArea = twiceArea / 2;
  const pupilAreaSquareMm = unitArea * scale * scale;
  const propagationScale = input.wavelengthNm / 1_000_000 * input.pupilToImageDistanceMm;
  const densityScale = pupilAreaSquareMm / propagationScale ** 2 / 1_000_000;
  if (!(unitArea > 1e-12) ||
      ![pupilAreaSquareMm, propagationScale, densityScale].every((x) => Number.isFinite(x) && x > 0)) {
    throw new InvalidScientificInputError("Polygon pupil area and derived scales must remain finite and positive.");
  }
  const samples = input.imagePointsMicrometers.map((value, index) => {
    const point = requirePlanarPoint(value, `imagePointsMicrometers[${index}]`);
    const qx = 2 * Math.PI * (point.x / 1000) * scale / propagationScale;
    const qy = 2 * Math.PI * (point.y / 1000) * scale / propagationScale;
    if (!Number.isFinite(Math.hypot(qx, qy)) || Math.hypot(qx, qy) > 1_000_000) {
      throw new InvalidScientificInputError("Dimensionless pupil phase radius must not exceed 1000000.");
    }
    const intensity = peakIntensity(normalized, unitArea, qx, qy);
    return {
      imagePointMicrometers: { x: point.x === 0 ? 0 : point.x, y: point.y === 0 ? 0 : point.y },
      peakNormalizedIntensity: intensity,
      intensityDensityPerSquareMicrometer: intensity * densityScale
    };
  });
  return approximationResult({
    pupilAreaSquareMm,
    pupilToImageDistanceMm: input.pupilToImageDistanceMm,
    wavelengthNm: input.wavelengthNm,
    wavelengthBasis: input.wavelengthBasis,
    fieldAxes: "+X right, +Y up",
    energyNormalization: "unit-integral-over-infinite-image-plane",
    throughputApplied: false,
    samples
  }, "polygon-pupil-fraunhofer-diffraction", "1.0.0", [
    "Uniform unit pupil amplitude and zero phase over a caller-declared simple polygon; scalar paraxial Fraunhofer propagation.",
    "The PSF is centred on the geometric image point; a pupil offset from the optical axis adds only a linear phase.",
    "Continuous PSF density has unit integral over the infinite image plane. Point samples are not a finite energy-normalized kernel.",
    "Pupil-area throughput (for example mechanical vignetting) is reported separately and not applied to the density.",
    "No aberration, defocus, polarization, sensor response or stray light is modeled."
  ], { notes: ["No quantified physical-model uncertainty is asserted. Numerical tolerances in tests are validation evidence, not real-lens accuracy bounds."] });
}
