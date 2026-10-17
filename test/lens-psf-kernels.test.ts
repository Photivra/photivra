// SPDX-License-Identifier: Apache-2.0
/** Convolution kernels sampled from a lens PSF profile (#277): exactness, the bilinear adjoint identity and validation. */
import { describe, expect, it } from "vitest";
import { calculateIrradianceConvolution, createImageKernelAccelerator, resolveLensSampledPsf, resolveLensPsfConvolutionKernels,
  type LensPsfConvolutionKernelsInput, type LensSampledPsfProfile } from "../src/index.js";
import { sensorPsfSourcePoint } from "../src/optics/sensor-psf-support.js";
import { createFakeGpu } from "./helpers/fake-webgpu.js";
import { corpusRandom } from "./helpers/sensor-stage-fixtures.js";
import { gaussianPsfProfile } from "./helpers/lens-psf-kernel-fixture.js";

const FIELD = [-1.5, -0.5, 0.5, 1.5];
function input(profile: LensSampledPsfProfile, o: Partial<LensPsfConvolutionKernelsInput> = {}): LensPsfConvolutionKernelsInput {
  return { schemaVersion: "0.1.0", psf: { profile, focalLengthMm: 50, focus: { kind: "infinity" }, apertureFNumber: 4, signedDefocusImagePlaneMicrometers: 0 },
    spectralWeights: [{ wavelengthNm: 550, weight: 1 }], grid: { width: 75, height: 45, sitePitchMicrometers: { x: 6, y: 6 }, opticalAxisSite: { x: 37.5, y: 22.5 } },
    patchWidth: 15, patchHeight: 15, ...o };
}
const exactProfile = (): LensSampledPsfProfile => gaussianPsfProfile({ pitchMicrometers: 6, halfWidth: 4, fieldXmm: FIELD, fieldYmm: FIELD, focalLengthMm: 50, apertureFNumber: 4 });

describe("resolveLensPsfConvolutionKernels", () => {
  it("maps each tap of the patch-centre PSF to one site displacement when the pitches match (bit-identical)", () => {
    const profile = exactProfile(), out = resolveLensPsfConvolutionKernels(input(profile)).value;
    expect(out).toMatchObject({ kernelRadius: 4, patchColumns: 5, patchRows: 3, exactSiteSampling: true });
    const r = out.kernelRadius, size = 2 * r + 1;
    out.patches.forEach((patch, p) => {
      const k = resolveLensSampledPsf({ profile, focalLengthMm: 50, focus: { kind: "infinity" }, apertureFNumber: 4, signedDefocusImagePlaneMicrometers: 0,
        wavelengthNm: 550, fieldPointMm: patch.fieldPointMm }).value.kernel;
      for (let v = -r; v <= r; v++) for (let u = -r; u <= r; u++) {
        // Displacement (+u right, +v down) ↔ kernel column cx + u, row cy − v (kernel +Y up), as the per-site quadrature's inverse support.
        expect(out.kernels[p * size * size + (v + r) * size + u + r]).toBe(k.normalizedIntensity[(k.centerSampleY - v) * k.widthSamples + k.centerSampleX + u]);
      }
      expect(patch.relativePupilThroughputFactor).toBeLessThan(1);
    });
    // Field points use native millimetres from the axis, +Y up for the field.
    expect(out.patches[0]!.fieldPointMm).toEqual({ x: (7.5 - 37.5) * 6 / 1000, y: -(7.5 - 22.5) * 6 / 1000 });
    expect(out.maximumKernelSum).toBeCloseTo(1, 12);
  });
  it("equals the per-site PSF quadrature at a patch-centre destination (same PSF, site-centre sources)", () => {
    const profile = exactProfile(), kernels = resolveLensPsfConvolutionKernels(input(profile)).value, random = corpusRandom(3);
    const samples = Float64Array.from({ length: 75 * 45 }, () => random() * 100);
    const conv = calculateIrradianceConvolution({ schemaVersion: "0.1.0", width: 75, height: 45, samples, kernelRadius: kernels.kernelRadius,
      patchWidth: 15, patchHeight: 15, kernels: kernels.kernels, boundary: "zero-outside-grid" }).values;
    for (const [i, j] of [[22, 22], [37, 7], [52, 37]] as const) {
      const destination = { x: (i + 0.5 - 37.5) * 6 / 1000, y: (j + 0.5 - 22.5) * 6 / 1000 };
      const k = resolveLensSampledPsf({ profile, focalLengthMm: 50, focus: { kind: "infinity" }, apertureFNumber: 4, signedDefocusImagePlaneMicrometers: 0,
        wavelengthNm: 550, fieldPointMm: { x: destination.x, y: -destination.y } }).value.kernel;
      let quadrature = 0;
      for (let ky = 0; ky < k.heightSamples; ky++) for (let kx = 0; kx < k.widthSamples; kx++) {
        const s = sensorPsfSourcePoint(destination, k, kx, ky), si = Math.round(s.x * 1000 / 6 + 37.5 - 0.5), sj = Math.round(s.y * 1000 / 6 + 22.5 - 0.5);
        quadrature += k.normalizedIntensity[ky * k.widthSamples + kx]! * samples[sj * 75 + si]!;
      }
      expect(conv[j * 75 + i]).toBeCloseTo(quadrature, 10);
    }
  });
  it("splats taps between sites bilinearly: the adjoint of bilinear interpolation of site-centre samples", () => {
    const profile = gaussianPsfProfile({ pitchMicrometers: 2.5, halfWidth: 9, fieldXmm: FIELD, fieldYmm: FIELD, focalLengthMm: 50, apertureFNumber: 4 });
    const out = resolveLensPsfConvolutionKernels(input(profile)).value, random = corpusRandom(5);
    expect(out.exactSiteSampling).toBe(false);
    expect(out.kernelRadius).toBe(4);
    const E = Float64Array.from({ length: 75 * 45 }, () => random());
    const at = (x: number, y: number): number => (x < 0 || y < 0 || x >= 75 || y >= 45 ? 0 : E[y * 75 + x]!);
    const bilinear = (x: number, y: number): number => {
      const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
      return (1 - fx) * (1 - fy) * at(x0, y0) + fx * (1 - fy) * at(x0 + 1, y0) + (1 - fx) * fy * at(x0, y0 + 1) + fx * fy * at(x0 + 1, y0 + 1);
    };
    const r = out.kernelRadius, size = 2 * r + 1, p = 1 * out.patchColumns + 2, centre = { i: 37, j: 22 };
    let gathered = 0;
    for (let v = -r; v <= r; v++) for (let u = -r; u <= r; u++) gathered += out.kernels[p * size * size + (v + r) * size + u + r]! * at(centre.i - u, centre.j - v);
    const k = resolveLensSampledPsf({ profile, focalLengthMm: 50, focus: { kind: "infinity" }, apertureFNumber: 4, signedDefocusImagePlaneMicrometers: 0,
      wavelengthNm: 550, fieldPointMm: out.patches[p]!.fieldPointMm }).value.kernel;
    let quadrature = 0;
    for (let ky = 0; ky < k.heightSamples; ky++) for (let kx = 0; kx < k.widthSamples; kx++) {
      const u = (kx - k.centerSampleX) * 2.5 / 6, v = -(ky - k.centerSampleY) * 2.5 / 6;
      quadrature += k.normalizedIntensity[ky * k.widthSamples + kx]! * bilinear(centre.i - u, centre.j - v);
    }
    expect(gathered).toBeCloseTo(quadrature, 12);
    expect(out.maximumKernelSum).toBeCloseTo(1, 12);
  });
  it("forms the weight-normalized spectral sum of per-wavelength kernels", () => {
    const profile = gaussianPsfProfile({ pitchMicrometers: 6, halfWidth: 5, fieldXmm: FIELD, fieldYmm: FIELD, wavelengthNm: [400, 700], focalLengthMm: 50,
      apertureFNumber: 4, shape: (fx, fy, nm) => ({ sigmaX: (3 + Math.hypot(fx, fy)) * nm / 550, sigmaY: 4 * nm / 550, shiftX: 0, shiftY: 0 }) });
    const mixed = resolveLensPsfConvolutionKernels(input(profile, { spectralWeights: [{ wavelengthNm: 450, weight: 1 }, { wavelengthNm: 650, weight: 3 }], kernelRadius: 5 })).value;
    const a = resolveLensPsfConvolutionKernels(input(profile, { spectralWeights: [{ wavelengthNm: 450, weight: 1 }], kernelRadius: 5 })).value;
    const b = resolveLensPsfConvolutionKernels(input(profile, { spectralWeights: [{ wavelengthNm: 650, weight: 1 }], kernelRadius: 5 })).value;
    for (let i = 0; i < mixed.kernels.length; i++) expect(mixed.kernels[i]).toBeCloseTo((a.kernels[i]! + 3 * b.kernels[i]!) / 4, 15);
  });
  it("feeds the webgpu-f32 convolution", async () => {
    const out = resolveLensPsfConvolutionKernels(input(exactProfile())).value, random = corpusRandom(9);
    const conv = { schemaVersion: "0.1.0" as const, width: 75, height: 45, samples: Float64Array.from({ length: 75 * 45 }, () => random() * 1e4),
      kernelRadius: out.kernelRadius, patchWidth: 15, patchHeight: 15, kernels: out.kernels, boundary: "zero-outside-grid" as const };
    const a = await createImageKernelAccelerator({ backend: "webgpu-f32", fallback: "fail", gpu: createFakeGpu().gpu });
    const gpu = await a.convolveIrradiance(conv), reference = calculateIrradianceConvolution(conv).values, bound = gpu.execution.errorBound as { relative: number; absolute: number };
    for (let i = 0; i < reference.length; i++) expect(Math.abs(gpu.values[i]! - reference[i]!)).toBeLessThanOrEqual(bound.relative * reference[i]! + bound.absolute);
    a.dispose();
  });
  it("validates the request and never drops PSF support", () => {
    const profile = exactProfile();
    expect(() => resolveLensPsfConvolutionKernels(input(profile, { kernelRadius: 3 }))).toThrow(/radius/u);
    expect(() => resolveLensPsfConvolutionKernels(input(profile, { grid: { width: 600, height: 45, sitePitchMicrometers: { x: 6, y: 6 }, opticalAxisSite: { x: 300, y: 22.5 } } }))).toThrow();
    expect(() => resolveLensPsfConvolutionKernels(input(profile, { spectralWeights: [] }))).toThrow(/wavelengths/u);
    expect(() => resolveLensPsfConvolutionKernels(input(profile, { spectralWeights: [{ wavelengthNm: 550, weight: 0 }] }))).toThrow(/positive/u);
    expect(() => resolveLensPsfConvolutionKernels(input(profile, { spectralWeights: [{ wavelengthNm: 550, weight: -1 }] }))).toThrow();
    expect(() => resolveLensPsfConvolutionKernels(input(profile, { patchWidth: 1, patchHeight: 1,
      grid: { width: 100, height: 45, sitePitchMicrometers: { x: 6, y: 6 }, opticalAxisSite: { x: 50, y: 22.5 } } }))).toThrow(/patches/u);
    expect(() => resolveLensPsfConvolutionKernels({ ...input(profile), extra: 1 } as unknown as LensPsfConvolutionKernelsInput)).toThrow();
    const wide = gaussianPsfProfile({ pitchMicrometers: 6, halfWidth: 40, fieldXmm: FIELD, fieldYmm: FIELD, focalLengthMm: 50, apertureFNumber: 4,
      shape: () => ({ sigmaX: 60, sigmaY: 60, shiftX: 0, shiftY: 0 }) });
    expect(() => resolveLensPsfConvolutionKernels(input(wide))).toThrow(/32/u);
  });
});
