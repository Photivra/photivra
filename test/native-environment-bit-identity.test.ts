// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { createNativeEnvironmentRawTask } from "../src/index.js";
import { nativeEnvironmentWorkload, nativeEnvironmentWorkloads, runNativeEnvironmentWorkload } from "./helpers/native-environment-workloads.js";

/**
 * SHA-256 of float64 photo expectations, RAW codes and developed samples computed on main d3a704b before the #275
 * validation/clone/PSF-parse changes. Those changes are performance-only, so every hash must stay identical. An
 * intended scientific change that alters these values must update them deliberately with its own evidence.
 */
const expected = {
  "psf-radial-field": { providerEvaluationCount: 576,
    photoSha256: "049f995c1dca2b171b9b832769228da54d2fb78f8cc154c3fecfb9c1263c29bf",
    rawSha256: "612bca8d7c3434d58bba46ba9aa1a49f6f2de4287b7de8f1383f2623085bf02a",
    developedSha256: "5485526b4299bd30bb1b8895cd2d7772674da178a7bbc9308b9f324c49eb6d13" },
  "flat-emitter": { providerEvaluationCount: 64,
    photoSha256: "1894035d1ce66fdae20e9485e4d7a8c6668cae5b82566d99d32bc1c2028c4e75",
    rawSha256: "a6822e782bf23a8baed26ae46ab93f44f7f5d61b2a852ef19dbdb7a73d051cd3",
    developedSha256: "0b0e085bdbac57cc69daf0983a1f06d9dcabe9216266fac100487a35af2b0c41" },
  "pupil-rays": { providerEvaluationCount: 512,
    photoSha256: "ada95dc906cd583120a526ae94c3b6b45b5c69ddf60060713943e7a591e41af3",
    rawSha256: "92c37fecee24c4d21e25ed9ea5ebee26cefd96fb69f4abe269f10ddb9a79c988",
    developedSha256: "e11910a731448f430504e47505a24c7bfe9d4037a3255744b88cf9e0f2ca3b71" },
  "temporal-samples": { providerEvaluationCount: 256,
    photoSha256: "97dc3f03a47eb80b29d8eb2718d2e298924d3a8fc9bc101ae2e15b75e930fc52",
    rawSha256: "2ffbbcc04aa19dc4ca196f4c4439db4fd1c0b2688cac4b7650d9f93f1df43143",
    developedSha256: "28841a6a748eae1f74043466dd001247260636ac6ddfa023d44cf3efba3aa2a8" }
} as const;

describe("native environment RAW bit identity", () => {
  it.each(nativeEnvironmentWorkloads)("keeps photo expectations, RAW codes and developed output bit-identical for %s", async kind => {
    expect(await runNativeEnvironmentWorkload(kind)).toEqual(expected[kind]);
  });
});

/*
 * Independent spot values beside the hashes above, derived from first principles in this file so a
 * hash change can be localized (photo radiometry, provider work, or downstream RAW/development).
 *
 * Camera equation for an extended Lambertian field imaged on axis by an ideal thin lens (Smith,
 * Modern Optical Engineering, 4th ed., sec. 9; Hecht, Optics, 5th ed., sec. 5.7.5 on the effective
 * f-number): sensor-plane spectral irradiance E = pi L T / (4 N_w^2) with working f-number
 * N_w = N (1 + m) = N / (1 - f/d) for a finite focus distance d. Photon count per pixel is
 * A * integral(E * lambda / (h c)) dlambda dt; electrons weight each wavelength by the EQE.
 * Workload declarations: N = 4, f = 50 mm, d = 5 m, shutter 0.008 s (global), sensitive aperture
 * 800 x 600 um, spectral midpoints 425/475 nm over 50 nm bins, lens transmission 0.8 - 0.004 (lambda-400),
 * EQE 0.2 + 0.004 (lambda-400), radiance 1e-9 (1 + 200 t) W m^-2 sr^-1 nm^-1 (time mean over
 * [0, 0.008] s = 1.8, exact under the midpoint rule because it is linear). h and c are the SI exact values.
 */
describe("native environment independent spot values", () => {
  it("matches the camera equation for the flat-emitter photo expectations", async () => {
    const { input, provider } = nativeEnvironmentWorkload("flat-emitter");
    const photo: { photons: number; electrons: number }[] = [];
    const task = createNativeEnvironmentRawTask(input, { ...provider, observePhotoTile: (tile): void => {
      for (const site of tile.sites) photo.push({ photons: site.expectedIncidentPhotonCount, electrons: site.expectedGeneratedElectronCount });
    } });
    await task.run(); task.dispose();
    const h = 6.62607015e-34, c = 299792458, n = 4, workingFactor = (1 - 0.05 / 5) ** 2, area = 800e-6 * 600e-6;
    let photons = 0, electrons = 0;
    for (const nm of [425, 475]) {
      const irradiance = Math.PI / (4 * n * n) * workingFactor * (0.8 - 0.004 * (nm - 400)) * 1e-9 * 1.8;
      const count = irradiance * area * 50 * 0.008 * nm * 1e-9 / (h * c);
      photons += count; electrons += count * (0.2 + 0.004 * (nm - 400));
    }
    // About 44.78 photons and 17.41 electrons per site.
    expect(photo).toHaveLength(4);
    for (const site of photo) {
      expect(site.photons / photons).toBeCloseTo(1, 12);
      expect(site.electrons / electrons).toBeCloseTo(1, 12);
    }
  });

  it("derives each provider evaluation count from the declared quadrature", () => {
    // 4 sites x 2 spectral nodes x 2x2 spatial nodes x 2 temporal nodes = 64 base evaluations;
    // the sampled PSF multiplies by its 3x3 taps, the ideal pupil by 2 radial x 4 angular rays,
    // and the temporal workload uses 8 instead of 2 temporal nodes.
    const base = 4 * 2 * (2 * 2) * 2;
    expect({ "psf-radial-field": base * 9, "flat-emitter": base, "pupil-rays": base * 2 * 4, "temporal-samples": base / 2 * 8 })
      .toEqual(Object.fromEntries(Object.entries(expected).map(([kind, value]) => [kind, value.providerEvaluationCount])));
  });
});

