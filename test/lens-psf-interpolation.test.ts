// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import {
  parseLensSampledPsfProfile,
  resolveLensSampledPsf,
  type LensPsfKernel,
  type LensSampledPsfInterpolation,
  type LensSampledPsfProfile
} from "../src/index.js";

const SIZE = 21;
const CENTER = 10;

/** Elliptical Gaussian centred at (cx, cy) samples from the kernel centre (+Y up). */
function gaussian(cx: number, cy: number, sx = 1.2, sy = 1.2): LensPsfKernel {
  const values: number[] = [];
  for (let row = 0; row < SIZE; row += 1) {
    for (let column = 0; column < SIZE; column += 1) {
      const x = column - CENTER - cx;
      const y = CENTER - row - cy;
      values.push(Math.exp(-0.5 * ((x / sx) ** 2 + (y / sy) ** 2)));
    }
  }
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    widthSamples: SIZE,
    heightSamples: SIZE,
    samplePitchMicrometersX: 1,
    samplePitchMicrometersY: 1,
    centerSampleX: CENTER,
    centerSampleY: CENTER,
    normalizedIntensity: values.map((v) => v / sum)
  };
}

function profile(
  interpolation: LensSampledPsfInterpolation,
  fields: readonly number[],
  kernelAt: (fieldXmm: number) => LensPsfKernel
): LensSampledPsfProfile {
  return parseLensSampledPsfProfile({
    schemaVersion: "0.1.0",
    profileId: "interpolation-test",
    profileVersion: "1.0.0",
    scientificStatus: "approximation",
    opticalDomain: "lens-primary-optical-path-only",
    coordinateSystem: "image-plane-metric",
    fieldAxes: "+X right, +Y up",
    kernelEnergyNormalization: "unit-energy-shape",
    interpolation,
    throughputOwnership: "separate-relative-pupil-throughput-factor",
    responseIncludes: { diffraction: true, aberration: true, defocus: false, pupilClippingShape: false },
    sensorOpticalStackIncluded: false,
    sensorSamplingIncluded: false,
    reconstructionIncluded: false,
    strayLightIncluded: false,
    axes: {
      focalLengthMm: [50],
      focusDiopters: [0],
      apertureFNumber: [4],
      fieldXmm: fields,
      fieldYmm: [0],
      wavelengthNm: [550],
      signedDefocusImagePlaneMicrometers: [0]
    },
    nodes: fields.map((fieldXmm, index) => ({
      nodeId: `n${index}`,
      coordinate: { focalLengthMm: 50, focusDiopters: 0, apertureFNumber: 4, fieldXmm, fieldYmm: 0, wavelengthNm: 550, signedDefocusImagePlaneMicrometers: 0 },
      kernel: kernelAt(fieldXmm),
      bestFocusImagePlaneOffsetMicrometers: 0,
      relativePupilThroughputFactor: 1,
      evidence: [{ sourceOrigin: "photivra", sourceReference: `n${index}`, reuseStatus: "photivra-owned" }],
      uncertainty: { kind: "not-quantified", limitation: "Synthetic." }
    })),
    evidence: [{ sourceOrigin: "photivra", sourceReference: "interpolation-test", reuseStatus: "photivra-owned" }],
    limitations: ["Synthetic PSF interpolation test profile."]
  });
}

function resolve(p: LensSampledPsfProfile, x: number, y: number): ReturnType<typeof resolveLensSampledPsf> {
  return resolveLensSampledPsf({
    profile: p,
    focalLengthMm: 50,
    focus: { kind: "infinity" },
    apertureFNumber: 4,
    fieldPointMm: { x, y },
    wavelengthNm: 550,
    signedDefocusImagePlaneMicrometers: 0
  });
}

function rowOf(kernel: LensPsfKernel, row: number): number[] {
  return kernel.normalizedIntensity.slice(row * SIZE, (row + 1) * SIZE) as number[];
}

function localMaxima(values: readonly number[]): number {
  let count = 0;
  for (let i = 1; i < values.length - 1; i += 1) {
    if (values[i]! > values[i - 1]! && values[i]! > values[i + 1]!) count += 1;
  }
  return count;
}

function centroid(kernel: LensPsfKernel): { x: number; y: number } {
  let x = 0;
  let y = 0;
  kernel.normalizedIntensity.forEach((v, index) => {
    x += v * ((index % SIZE) - CENTER);
    y += v * (CENTER - Math.floor(index / SIZE));
  });
  return { x, y };
}

describe("sampled PSF field interpolation", () => {
  const shifted = (field: number): LensPsfKernel => gaussian(field === -10 ? -4 : 4, 0);

  it("legacy multilinear blending of shifted PSFs gives a double peak (unchanged behaviour)", () => {
    const result = resolve(profile("bounded-regular-grid-multilinear", [-10, 10], shifted), 0, 0);
    expect(result.provenance.model).toBe("lens-sampled-psf-bounded-interpolation");
    expect(localMaxima(rowOf(result.value.kernel, CENTER))).toBe(2);
  });

  it("finds interpolation corners by grid position: a −0 axis value is the 0 node, and corner weights are the multilinear ones", () => {
    const kernelAt = (field: number): LensPsfKernel => gaussian(field / 5, 0, 1 + Math.abs(field) / 10);
    const negativeZero = profile("bounded-regular-grid-multilinear", [-10, -0, 10], kernelAt), zero = profile("bounded-regular-grid-multilinear", [-10, 0, 10], kernelAt);
    for (const x of [0, -0, 4, -7.5, 10]) expect(resolve(negativeZero, x, 0)).toEqual(resolve(zero, x, 0));
    const blended = resolve(zero, 4, 0).value.kernel.normalizedIntensity, a = kernelAt(0).normalizedIntensity, b = kernelAt(10).normalizedIntensity;
    const raw = a.map((v, i) => 0.6 * v + 0.4 * b[i]!), sum = raw.reduce((s, v) => s + v, 0);
    blended.forEach((v, i) => expect(v).toBeCloseTo(raw[i]! / sum, 15));
  });

  it("centroid-aligned interpolation gives one peak at the interpolated centroid", () => {
    const p = profile("bounded-regular-grid-centroid-aligned", [-10, 10], shifted);
    const mid = resolve(p, 0, 0);
    expect(mid.provenance.model).toBe("lens-sampled-psf-centroid-aligned-interpolation");
    const row = rowOf(mid.value.kernel, CENTER);
    expect(localMaxima(row)).toBe(1);
    expect(row.indexOf(Math.max(...row))).toBe(CENTER);
    expect(mid.value.kernel.normalizedIntensity.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 14);
    // At 3/4 of the way the centroid is at 0.25 * -4 + 0.75 * 4 = +2 samples (integer shift is exact).
    const quarter = resolve(p, 5, 0).value.kernel;
    expect(centroid(quarter).x).toBeCloseTo(2, 3);
    expect(Math.max(...quarter.normalizedIntensity)).toBeCloseTo(Math.max(...gaussian(4, 0).normalizedIntensity), 3);
    // Exact nodes are returned unchanged.
    expect(resolve(p, 10, 0).value.kernel.normalizedIntensity).toEqual(shifted(10).normalizedIntensity);
    expect(resolve(p, 10, 0).value.resolutionStatus).toBe("exact-grid-sample");
  });

  it("blends asymmetric PSFs without splitting their energy", () => {
    const p = profile("bounded-regular-grid-centroid-aligned", [0, 10], (field) => (field === 0 ? gaussian(0, 0, 1, 1) : gaussian(3, 0, 2.5, 1)));
    const kernel = resolve(p, 5, 0).value.kernel;
    expect(localMaxima(rowOf(kernel, CENTER))).toBe(1);
    const expected = 0.5 * centroid(gaussian(0, 0, 1, 1)).x + 0.5 * centroid(gaussian(3, 0, 2.5, 1)).x;
    expect(centroid(kernel).x).toBeCloseTo(expected, 3);
  });

  it("rotates a radially sampled rotationally symmetric PSF to any field azimuth (four orientations, off-axis)", () => {
    // Radial shift +3 samples and radial elongation at field radius 10 mm.
    const p = profile("rotationally-symmetric-radial-field-centroid-aligned", [0, 10], (field) => (field === 0 ? gaussian(0, 0) : gaussian(3, 0, 2, 1)));
    const base = resolve(p, 10, 0);
    expect(base.value.resolutionStatus).toBe("exact-grid-sample");
    expect(base.provenance.model).toBe("lens-sampled-psf-rotational-centroid-aligned-interpolation");
    const r = centroid(gaussian(3, 0, 2, 1)).x; // 3 minus a small kernel-truncation bias
    const expectedCentroids = [{ x: r, y: 0 }, { x: 0, y: r }, { x: -r, y: 0 }, { x: 0, y: -r }];
    [[10, 0], [0, 10], [-10, 0], [0, -10]].forEach(([x, y], index) => {
      const result = resolve(p, x!, y!);
      const c = centroid(result.value.kernel);
      expect(c.x).toBeCloseTo(expectedCentroids[index]!.x, 6);
      expect(c.y).toBeCloseTo(expectedCentroids[index]!.y, 6);
      if (index > 0) expect(result.value.resolutionStatus).toBe("interpolated");
    });
    // 90-degree rotation of an exact node is an exact sample permutation.
    const rotated = resolve(p, 0, 10).value.kernel;
    const reference = gaussian(0, 3, 1, 2);
    rotated.normalizedIntensity.forEach((value, index) => expect(value).toBeCloseTo(reference.normalizedIntensity[index]!, 12));
    // Off-axis diagonal at radius 5: centroid at 1.5 samples along 45 degrees.
    const diagonal = centroid(resolve(p, 5 / Math.SQRT2, 5 / Math.SQRT2).value.kernel);
    expect(diagonal.x).toBeCloseTo(r / 2 / Math.SQRT2, 2);
    expect(diagonal.y).toBeCloseTo(r / 2 / Math.SQRT2, 2);
    expect(() => resolve(p, 8, 8)).toThrow(/extrapolation/);
  });

  it("rejects rotational profiles that are not declared along +X with square pitch", () => {
    expect(() => profile("rotationally-symmetric-radial-field-centroid-aligned", [-10, 10], shifted)).toThrow(/non-negative/);
    expect(() => profile("rotationally-symmetric-radial-field-centroid-aligned", [0, 10], () => ({ ...gaussian(0, 0), samplePitchMicrometersY: 2 }))).toThrow(/square/);
    expect(() => profile("bounded-regular-grid-bicubic" as never, [0, 10], shifted)).toThrow(/interpolation/);
  });
});
