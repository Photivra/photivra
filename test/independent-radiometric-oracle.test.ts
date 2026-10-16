// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { calculateEnvironmentSensorPhotoSignal, createNativeEnvironmentRawTask, type SceneRadianceEvaluationResult } from "../src/index.js";
import { input as sensorInput } from "./helpers/eqe-exposure-fixture.js";
import { evaluator, siteInput } from "./helpers/environment-raw-fixture.js";
import { nativeEnvironmentWorkload } from "./helpers/native-environment-workloads.js";
import { scaledTimeout } from "./helpers/test-timeout.js";

/*
 * Independent oracles for the production native environment RAW path (test review item 7). The
 * expected values are derived here from first principles; no engine reducer, site calculator or
 * plan supplies them.
 *
 * Camera equation (Smith, Modern Optical Engineering, 4th ed., sec. 9; Hecht, Optics, 5th ed.,
 * sec. 5.7.5): an extended Lambertian field of spectral radiance L imaged on axis gives sensor-plane
 * spectral irradiance E = pi L T / (4 N_w^2), N_w = N / (1 - f/d) for focus distance d (N_w = N at
 * infinity). Photons per pixel = A * sum over bins of E * dlambda * dt * lambda / (h c); electrons
 * weight each bin by the EQE. RAW model (EMVA 1288 release 4.0, sec. 2 linear camera model):
 * code = black + round(K^-1 (Poisson(mu_photo + mu_dark) + Normal(0, sigma_read^2))), so with K = 1
 * DN/e- the code mean is black + mu and the variance is mu + sigma_read^2 + 1/12 (uniform rounding,
 * Sheppard's correction).
 */
const h = 6.62607015e-34, c = 299792458;

/** Photons and electrons per unit time-integrated radiance (W m^-2 sr^-1 nm^-1 s) for the owned fixtures. */
function cameraEquation(fNumber: number, workingFactor: number): { photons: number; electrons: number } {
  const area = 800e-6 * 600e-6;
  let photons = 0, electrons = 0;
  for (const nm of [425, 475]) {
    const transmission = 0.8 - 0.004 * (nm - 400), eqe = 0.2 + 0.004 * (nm - 400);
    const count = Math.PI / (4 * fNumber * fNumber) * workingFactor * transmission * area * 50 * nm * 1e-9 / (h * c);
    photons += count; electrons += count * eqe;
  }
  return { photons, electrons };
}

describe("native environment RAW against an independent camera-equation oracle", () => {
  it("realizes RAW code mean and variance predicted from radiance, optics, EQE and the noise model", async () => {
    // Flat-emitter workload: N = 4, f = 50 mm, d = 5 m, global 0.008 s shutter, radiance
    // 1e-9 (1 + 200 t) (time integral 0.008 * 1.8), dark current 4 e-/s, read noise 2 e- rms,
    // conversion gain 1 e-/DN, black 64 DN, 10-bit ADC (far from saturation here).
    const photo = cameraEquation(4, (1 - 0.05 / 5) ** 2).electrons * 1e-9 * 0.008 * 1.8;
    const mu = photo + 4 * 0.008, sigmaRead = 2, black = 64;
    const mean = black + mu, variance = mu + sigmaRead ** 2 + 1 / 12;
    expect(photo).toBeGreaterThan(17.4);
    expect(photo).toBeLessThan(17.42);

    const runs = 256, codes: number[] = [];
    for (let seed = 0; seed < runs; seed++) {
      const { input, provider } = nativeEnvironmentWorkload("flat-emitter");
      input.raw.exposure = { ...input.raw.exposure, noise: { ...input.raw.exposure.noise, seedUint32: 7_000 + seed } };
      const task = createNativeEnvironmentRawTask(input, provider);
      await task.run();
      codes.push(...task.takeOutput().raw.codes);
      task.dispose();
    }
    const n = codes.length;
    const sampleMean = codes.reduce((sum, code) => sum + code, 0) / n;
    const sampleVariance = codes.reduce((sum, code) => sum + (code - sampleMean) ** 2, 0) / (n - 1);
    // Predeclared 5-sigma sampling bands; kappa4 = mu (Poisson) - 1.2/144 (uniform rounding).
    expect(Math.abs(sampleMean - mean)).toBeLessThan(5 * Math.sqrt(variance / n));
    expect(Math.abs(sampleVariance - variance)).toBeLessThan(5 * Math.sqrt((mu - 1.2 / 144 + 2 * variance ** 2) / n));
    // The mean band (< 0.75 DN, about 4.3% of the 17.4 e- signal) rejects a dropped time ramp (-44%),
    // a one-third-stop f-number error (-21%) or a lost EQE/transmission bin. Smaller photo errors are
    // caught by the exact photo-expectation check in native-environment-bit-identity.test.ts.
    expect(5 * Math.sqrt(variance / n)).toBeLessThan(0.75);
  }, scaledTimeout(30_000));
});

describe("temporal quadrature convergence with non-linear radiance", () => {
  // Radiance (1 + 200 t)^2 over the owned 0.01 s window. Exact time integral: (3^3 - 1) / 600 = 13/300.
  // The n-node midpoint rule integrates a quadratic with error exactly -T^3 f'' / (24 n^2)
  // = -(1e-6 * 80000) / (24 n^2) = -1/(300 n^2), so the computed / exact ratio is 1 - 1/(13 n^2): O(1/n^2).
  const exactTimeIntegral = 13 / 300;
  const electronsFor = (temporalSampleCount: number): number => {
    const input = siteInput(sensorInput(), false);
    input.temporalSampleCount = temporalSampleCount;
    input.evaluateRadiance = (q): SceneRadianceEvaluationResult => {
      const result = evaluator(q);
      result.spectralRadianceWattsPerSquareMeterSteradianNanometer = (1 + 200 * q.timeSecondsFromExposureStart) ** 2;
      return result;
    };
    return calculateEnvironmentSensorPhotoSignal(input).value.photo.value.photoSignal.expectedGeneratedElectronCount;
  };

  it("converges as the midpoint rule predicts: relative error 1/(13 n^2) at n = 2, 8, 32", () => {
    // Infinity focus, N = 4: the camera equation with no working-f-number factor.
    const exact = cameraEquation(4, 1).electrons * exactTimeIntegral;
    const errors = [2, 8, 32].map((n) => {
      const ratio = electronsFor(n) / exact;
      expect(ratio).toBeCloseTo(1 - 1 / (13 * n * n), 12);
      return 1 - ratio;
    });
    // About 1.9e-2, 1.2e-3 and 7.5e-5: quadrupling n divides the error by 16.
    expect(errors[0]! / errors[1]!).toBeCloseTo(16, 9);
    expect(errors[1]! / errors[2]!).toBeCloseTo(16, 9);
  });
});
