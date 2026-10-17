// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { calculateIdealPolygonDiffractionPsf, createDiffractionLimitedPsfProfile, parseLensSampledPsfProfile, resolveLensSampledPsf,
  InvalidConfigurationError, type CreateDiffractionLimitedPsfProfileInput } from "../src/index.js";
import { calculateAiryCellEnergies } from "../src/optics/diffraction-psf-profile.js";

const base: CreateDiffractionLimitedPsfProfileInput = { aperture: "circular", focalLengthMm: 50, apertureFNumber: 8, focus: { kind: "finite", distanceM: 5 },
  wavelengthsNm: [450, 550, 650], samplePitchMicrometers: 6, kernelRadiusSamples: 3, fieldHalfExtentMm: { x: 0.2, y: 0.2 }, profileId: "test-airy" };

// Independent Airy intensity [2J1(z)/z]² from the power series of J1 (z ≤ 20 keeps the series accurate to ~1e-10).
function airyShape(z: number): number {
  let term = 1, sum = 1;
  for (let k = 1; k < 80; k++) { term *= -(z * z / 4) / (k * (k + 1)); sum += term; }
  return sum * sum;
}
// Gauss–Legendre on [-1, 1], 16 points (Newton on P16).
const GL16 = ((): { x: number[]; w: number[] } => {
  const n = 16, x: number[] = [], w: number[] = [];
  for (let k = 0; k < n; k++) {
    let t = Math.cos(Math.PI * (k + 0.75) / (n + 0.5)), d = 0;
    for (let it = 0; it < 50; it++) {
      let p0 = 1, p1 = t;
      for (let m = 2; m <= n; m++) { const p2 = ((2 * m - 1) * t * p1 - (m - 1) * p0) / m; p0 = p1; p1 = p2; }
      d = n * (t * p1 - p0) / (t * t - 1); t -= p1 / d;
    }
    x.push(t); w.push(2 / ((1 - t * t) * d * d));
  }
  return { x, w };
})();
/** Real-space cell integral of a density over the cell [i·p ± p/2] × [j·p ± p/2], split into s × s sub-cells of 16² Gauss points. */
function cellIntegral(density: (x: number, y: number) => number, i: number, j: number, p: number, s: number): number {
  let sum = 0;
  const h = p / s;
  for (let a = 0; a < s; a++) for (let b = 0; b < s; b++) {
    const x0 = (i - 0.5) * p + (a + 0.5) * h, y0 = (j - 0.5) * p + (b + 0.5) * h;
    for (let u = 0; u < 16; u++) for (let v = 0; v < 16; v++) sum += GL16.w[u]! * GL16.w[v]! * density(x0 + GL16.x[u]! * h / 2, y0 + GL16.x[v]! * h / 2);
  }
  return sum * (h / 2) ** 2;
}

describe("createDiffractionLimitedPsfProfile", () => {
  it("builds a parseable profile: one unit-sum symmetric kernel per wavelength on one grid, with the truncated energy reported", () => {
    const result = createDiffractionLimitedPsfProfile(base), v = result.value;
    expect(result.provenance.kind).toBe("approximation");
    expect(parseLensSampledPsfProfile(v.profile)).toBeTruthy();
    expect(v.profile.responseIncludes).toEqual({ diffraction: true, aberration: false, defocus: false, pupilClippingShape: false });
    expect(v.pupilDiameterMm).toBe(50 / 8);
    expect(v.pupilToImageDistanceMm).toBeCloseTo(50 * 5000 / 4950, 12);
    expect(v.workingFNumber).toBeCloseTo(8 * 5000 / 4950, 12);
    expect(v.profile.nodes).toHaveLength(12);
    for (const node of v.profile.nodes) {
      const k = node.kernel;
      expect([k.widthSamples, k.heightSamples, k.centerSampleX, k.centerSampleY, k.samplePitchMicrometersX]).toEqual([7, 7, 3, 3, 6]);
      expect(Math.abs(k.normalizedIntensity.reduce((s, x) => s + x, 0) - 1)).toBeLessThan(1e-14);
      for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
        const value = k.normalizedIntensity[y * 7 + x]!;
        expect(value).toBeGreaterThan(0);
        expect(Math.abs(value - k.normalizedIntensity[x * 7 + y]!)).toBeLessThan(1e-15);
        expect(Math.abs(value - k.normalizedIntensity[y * 7 + 6 - x]!)).toBeLessThan(1e-15);
      }
    }
    // Longer wavelengths spread more: less energy in the centre and more outside the window.
    const w = v.wavelengths;
    expect(w[0]!.centreSampleFraction).toBeGreaterThan(w[1]!.centreSampleFraction);
    expect(w[1]!.centreSampleFraction).toBeGreaterThan(w[2]!.centreSampleFraction);
    expect(w[0]!.truncatedEnergyFraction).toBeLessThan(w[2]!.truncatedEnergyFraction);
    for (const r of w) {
      expect(r.capturedEnergyFraction + r.truncatedEnergyFraction).toBeCloseTo(1, 14);
      expect(r.firstZeroRadiusMicrometers).toBeCloseTo(1.2196698912665045 * r.wavelengthNm / 1000 * v.workingFNumber, 12);
    }
    expect(v.maximumTruncatedEnergyFraction).toBe(w[2]!.truncatedEnergyFraction);
  });

  it("gives cell energies that converge (node counts doubled) and match an independent real-space Airy integration", () => {
    for (const beta of [0.2, 1.35, 3.9]) {
      const a = calculateAiryCellEnergies(beta, 6, 1).cells, b = calculateAiryCellEnergies(beta, 6, 2).cells;
      for (let i = 0; i < a.length; i++) expect(Math.abs(a[i]! - b[i]!)).toBeLessThan(1e-13);
    }
    // f/8 at 550 nm, 6 µm cells: β = p/(λ·N_w). Density (π/4)/(λN)² · [2J1(z)/z]², z = π r/(λN), integrates to 1.
    const lambdaN = 0.55 * 8, beta = 6 / lambdaN, cells = calculateAiryCellEnergies(beta, 2).cells;
    const density = (x: number, y: number): number => Math.PI / 4 / lambdaN ** 2 * airyShape(Math.PI * Math.hypot(x, y) / lambdaN);
    for (const [i, j] of [[0, 0], [1, 0], [1, 1], [2, 0], [2, 1]] as const) {
      const reference = cellIntegral(density, i, j, 6, 6);
      expect(Math.abs(cells[j * 3 + i]! - reference)).toBeLessThan(2e-10);
    }
    // The engine's own polygon diffraction in its many-blade limit (equal-area circle, tolerance 1e-7 of the peak).
    const points: { x: number; y: number }[] = [];
    const h = 6 / 2;
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let u = 0; u < 16; u++) for (let v = 0; v < 16; v++) {
      points.push({ x: 6 + (a - 0.5) * h + GL16.x[u]! * h / 2, y: (b - 0.5) * h + GL16.x[v]! * h / 2 });
    }
    const polygon = calculateIdealPolygonDiffractionPsf({ bladeCount: 1024, firstBladeEdgeAngleDegrees: 0, equivalentAreaPupilDiameterMm: 1,
      pupilToImageDistanceMm: lambdaN, wavelengthNm: 1000, wavelengthBasis: "vacuum", imagePointsMicrometers: points }).value.samples;
    let k = 0, sum = 0;
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let u = 0; u < 16; u++) for (let v = 0; v < 16; v++) {
      sum += GL16.w[u]! * GL16.w[v]! * polygon[k++]!.intensityDensityPerSquareMicrometer * (h / 2) ** 2;
    }
    expect(Math.abs(cells[1]! - sum)).toBeLessThan(1e-6);
  });

  it("captures more energy with a larger window and sums to one over a wide window", () => {
    const captured = [0, 2, 6, 16].map((kernelRadiusSamples) => createDiffractionLimitedPsfProfile({ ...base, wavelengthsNm: [550], kernelRadiusSamples })
      .value.wavelengths[0]!.capturedEnergyFraction);
    for (let i = 1; i < captured.length; i++) expect(captured[i]!).toBeGreaterThan(captured[i - 1]!);
    expect(captured[3]!).toBeLessThan(1);
    expect(1 - captured[3]!).toBeLessThan(0.01);
  });

  it("resolves at any field point inside the declared extent with the same kernel", () => {
    const profile = createDiffractionLimitedPsfProfile(base).value.profile;
    const at = (x: number, y: number): readonly number[] => resolveLensSampledPsf({ profile, focalLengthMm: 50, focus: { kind: "finite", distanceM: 5 }, apertureFNumber: 8,
      fieldPointMm: { x, y }, wavelengthNm: 550, signedDefocusImagePlaneMicrometers: 0 }).value.kernel.normalizedIntensity;
    const node = profile.nodes.find((n) => n.coordinate.wavelengthNm === 550)!.kernel.normalizedIntensity;
    for (const [x, y] of [[0, 0], [0.13, -0.07], [-0.2, 0.2]] as const) {
      const kernel = at(x, y);
      for (let i = 0; i < node.length; i++) expect(Math.abs(kernel[i]! - node[i]!)).toBeLessThan(1e-15);
    }
  });

  it("supports infinity focus and validates its input", () => {
    const infinity = createDiffractionLimitedPsfProfile({ ...base, focus: { kind: "infinity" } }).value;
    expect(infinity.workingFNumber).toBe(8);
    expect(infinity.profile.axes.focusDiopters).toEqual([0]);
    const bad: [Record<string, unknown>, RegExp][] = [
      [{ aperture: "hexagon" }, /aperture/], [{ apertureFNumber: 0 }, /apertureFNumber/], [{ kernelRadiusSamples: 33 }, /kernelRadiusSamples/],
      [{ kernelRadiusSamples: 1.5 }, /kernelRadiusSamples/], [{ wavelengthsNm: [550, 550] }, /increasing/], [{ wavelengthsNm: [] }, /1 to 64/],
      [{ focus: { kind: "finite" } }, /distanceM/], [{ focus: { kind: "infinity", distanceM: 2 } }, /infinity/], [{ fieldHalfExtentMm: { x: 0, y: 1 } }, /fieldHalfExtentMm/],
      [{ profileId: "bad id" }, /profileId/], [{ extra: 1 }, /Invalid diffraction/]
    ];
    for (const [patch, message] of bad) {
      expect(() => createDiffractionLimitedPsfProfile({ ...base, ...patch } as never)).toThrow(InvalidConfigurationError);
      expect(() => createDiffractionLimitedPsfProfile({ ...base, ...patch } as never)).toThrow(message);
    }
  });
});
