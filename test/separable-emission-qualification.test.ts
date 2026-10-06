// SPDX-License-Identifier: Apache-2.0
import { expect, it } from "vitest";
import { calculateSeparableEmissionPhotoSignal, type SeparableEmissionContract } from "../src/api/separable-emission-experimental.js";
import { siteInput } from "./helpers/environment-raw-fixture.js";
import { evidence } from "./helpers/eqe-response-fixture.js";

it.each([32, 64, 128])("matches an independent SI photon/electron oracle at %i pupil rays", rays => {
  const source = siteInput(undefined, false);
  source.pupil = { kind: "ideal-uniform-circular-pupil", radialSampleCount: rays / 16, angularSampleCount: 16,
    evidence: evidence("test:qualification-pupil"), limitation: "Owned ideal uniform field; not external source evidence." };
  const { evaluateRadiance, evaluateApertureRadiance, ...input } = source;
  void evaluateRadiance; void evaluateApertureRadiance;
  const p = source.sceneBindings.providerProfile;
  const contract: SeparableEmissionContract = { schemaVersion: "0.1.0", kind: "uniform-spectrum-achromatic-ideal-emission",
    providerProfileId: p.profileId, sceneId: p.sceneId, illuminationProfileId: p.illuminationProfileId,
    materialResponseProfileId: p.materialResponseProfileId, wavelengthBasis: "vacuum",
    spectrum: [{ wavelengthNanometers: 400, spectralRadianceWattsPerSquareMeterSteradianNanometer: 1 },
      { wavelengthNanometers: 500, spectralRadianceWattsPerSquareMeterSteradianNanometer: 1 }],
    evidence: evidence("test:qualification-spectrum"), limitation: "Analytic achromatic field, not a calibrated camera." };
  // Independently specified midpoint sum. No engine plans/reducers supply the expected answer.
  // E_lambda = L_lambda*pi/(4*N^2)*T_lambda, photon energy = h*c/lambda.
  const acceptance = Math.PI / (4 * 4 ** 2), area = 800 * 600 * 1e-12;
  let photonRate = 0, electronRate = 0;
  for (const wavelength of [425, 475]) {
    const transmission = .8 - .004 * (wavelength - 400);
    const qe = .2 + .004 * (wavelength - 400);
    const photons = acceptance * transmission * area * 50 * wavelength * 1e-9 / (6.62607015e-34 * 299792458);
    photonRate += photons; electronRate += photons * qe;
  }
  // Four spatial nodes and all pupil weights integrate a constant field to one;
  // the symmetric half-pupil edge (2 on the right, 0 on the left) also averages to one;
  // the declared linear time ramp averages to 2 over [0,.01] seconds.
  for (const temporalSampleCount of [2, 4]) for (const originOcclusion of [false, true]) {
    const result = calculateSeparableEmissionPhotoSignal({ ...input, temporalSampleCount }, contract,
      q => (originOcclusion ? (q.apertureRay.originM.x > 0 ? 2 : 0) : 1) * (1 + 200 * q.timeSecondsFromExposureStart));
    const photo = result.photoSignal.value.photo.value.photoSignal;
    expect(photo.expectedIncidentPhotonCount / (photonRate * .01 * 2)).toBeCloseTo(1, 12);
    expect(photo.expectedGeneratedElectronCount / (electronRate * .01 * 2)).toBeCloseTo(1, 12);
    expect(result.work.geometryEvaluationCount).toBe(4 * temporalSampleCount * rays);
    expect(result.work.spectralCompositionCount).toBe(8 * temporalSampleCount * rays);
    expect(result.work.sourceSeparabilityVerified).toBe(false);
  }
}, 15_000);

it("exposes the full native Focus work bound without relabeling spectral work", () => {
  const sites = 2048 * 1366;
  const geometry = sites * 4 * 128;
  const spectral = geometry * 2;
  expect(geometry).toBe(1_432_354_816);
  expect(spectral).toBe(2_864_709_632);
  expect(geometry).toBeLessThan(2_000_000_000);
  expect(spectral).toBeGreaterThan(2_000_000_000);
  // Refinement is a separate complete event and must not borrow another event's budget.
  expect(geometry * 2).toBeGreaterThan(2_000_000_000);
  expect(spectral * 2).toBeGreaterThan(4_000_000_000);
});
