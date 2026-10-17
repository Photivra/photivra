// SPDX-License-Identifier: Apache-2.0
/**
 * Synthetic, field-varying sampled lens PSF profiles for the kernel-sampling and rollout tests. The
 * kernels are anisotropic Gaussians with a field-dependent width and centroid shift (a coma-like
 * asymmetry), written for these tests. Declared test values, not a measured lens.
 */
import type { LensSampledPsfProfile } from "../../src/index.js";
import { evidence } from "./eqe-response-fixture.js";

export interface GaussianPsfOptions {
  /** PSF sample pitch in micrometres (both axes). */
  pitchMicrometers: number;
  /** Kernel half-width in samples (the kernel is (2h + 1)²). */
  halfWidth: number;
  fieldXmm: number[];
  fieldYmm: number[];
  /** Default [380, 780] with equal kernels (a wavelength-independent PSF). */
  wavelengthNm?: number[];
  focalLengthMm: number;
  apertureFNumber: number;
  /** Focus in diopters (0 is infinity). */
  focusDiopters?: number;
  /** Gaussian σ (µm) along x and y, and centroid shift (µm), at a field point and wavelength. */
  shape?: (fieldXmm: number, fieldYmm: number, nm: number) => { sigmaX: number; sigmaY: number; shiftX: number; shiftY: number };
}

/** Default shape: σ grows from 4 µm on axis by 0.6 µm per mm of field radius; the centroid shifts outward by 0.15 µm/mm. */
export function defaultPsfShape(fx: number, fy: number): { sigmaX: number; sigmaY: number; shiftX: number; shiftY: number } {
  const radius = Math.hypot(fx, fy);
  return { sigmaX: 4 + 0.6 * radius + 0.2 * Math.abs(fx), sigmaY: 4 + 0.6 * radius, shiftX: 0.15 * fx, shiftY: 0.15 * fy };
}

export function gaussianPsfProfile(o: GaussianPsfOptions): LensSampledPsfProfile {
  const wavelengths = o.wavelengthNm ?? [380, 780], shape = o.shape ?? defaultPsfShape, h = o.halfWidth, size = 2 * h + 1;
  const axes = { focalLengthMm: [o.focalLengthMm], focusDiopters: [o.focusDiopters ?? 0], apertureFNumber: [o.apertureFNumber], fieldXmm: o.fieldXmm,
    fieldYmm: o.fieldYmm, wavelengthNm: wavelengths, signedDefocusImagePlaneMicrometers: [0] };
  const kernel = (fx: number, fy: number, nm: number): LensSampledPsfProfile["nodes"][number]["kernel"] => {
    const s = shape(fx, fy, nm), values: number[] = [];
    for (let ky = 0; ky < size; ky++) for (let kx = 0; kx < size; kx++) {
      // Array rows increase downward; kernel +Y is up.
      const x = (kx - h) * o.pitchMicrometers - s.shiftX, y = (h - ky) * o.pitchMicrometers - s.shiftY;
      values.push(Math.exp(-0.5 * ((x / s.sigmaX) ** 2 + (y / s.sigmaY) ** 2)));
    }
    const sum = values.reduce((a, b) => a + b, 0);
    return { widthSamples: size, heightSamples: size, samplePitchMicrometersX: o.pitchMicrometers, samplePitchMicrometersY: o.pitchMicrometers,
      centerSampleX: h, centerSampleY: h, normalizedIntensity: values.map(v => v / sum) };
  };
  return { schemaVersion: "0.1.0", profileId: "owned-gaussian-psf", profileVersion: "1", scientificStatus: "approximation",
    opticalDomain: "lens-primary-optical-path-only", coordinateSystem: "image-plane-metric", fieldAxes: "+X right, +Y up",
    kernelEnergyNormalization: "unit-energy-shape", interpolation: "bounded-regular-grid-multilinear",
    throughputOwnership: "separate-relative-pupil-throughput-factor",
    responseIncludes: { diffraction: false, aberration: true, defocus: false, pupilClippingShape: false },
    sensorOpticalStackIncluded: false, sensorSamplingIncluded: false, reconstructionIncluded: false, strayLightIncluded: false, axes,
    evidence: evidence("test:gaussian-psf"), limitations: ["Owned synthetic Gaussian kernels for tests."],
    nodes: o.fieldXmm.flatMap(fx => o.fieldYmm.flatMap(fy => wavelengths.map(nm => ({
      nodeId: `g-${fx}-${fy}-${nm}`, coordinate: { focalLengthMm: o.focalLengthMm, focusDiopters: o.focusDiopters ?? 0, apertureFNumber: o.apertureFNumber,
        fieldXmm: fx, fieldYmm: fy, wavelengthNm: nm, signedDefocusImagePlaneMicrometers: 0 },
      kernel: kernel(fx, fy, nm), bestFocusImagePlaneOffsetMicrometers: 0, relativePupilThroughputFactor: 0.9 - 0.002 * Math.hypot(fx, fy),
      evidence: evidence("test:gaussian-psf-node"), uncertainty: { kind: "not-quantified" as const, limitation: "Synthetic." } }))))
  };
}
