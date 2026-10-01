import { describe, expect, it } from "vitest";

import {
  calculatePhotonEnergyFromWavelength,
  calculatePhotoelectrons,
  calculateRelativeOpticalExposure,
  calculateRelativeRenderedExposure,
  calculateSignalToNoise
} from "../src/index.js";
import { loadBasicReferenceFixture } from "./helpers/basic-reference-fixture.js";

const fixture = loadBasicReferenceFixture();
// Independent analytic thought experiment, not fixture radiometry calibration.
// Energy is already incident at the measurement region; no pixel-area inference.
const referenceEnergyJoules = 4e-17;
const quantumEfficiency = 0.5;
const referencePhotonEnergyJoules =
  6.62607015e-34 * 299_792_458 / (fixture.illumination.wavelengthNm * 1e-9);

function expectation(opticalFactor = 1): number {
  const photon = calculatePhotonEnergyFromWavelength({
    wavelengthNanometers: fixture.illumination.wavelengthNm,
    wavelengthBasis: "vacuum"
  });
  return calculatePhotoelectrons({
    incidentPhotons: referenceEnergyJoules * opticalFactor / photon.value.photonEnergyJoules,
    quantumEfficiency
  }).value;
}

describe("exposure / photon / signal conformance on merged primitives", () => {
  it("preserves fractional expectations and independently derived energy/count units", () => {
    const expected = referenceEnergyJoules / referencePhotonEnergyJoules * quantumEfficiency;
    const electrons = expectation();
    expect(electrons / expected).toBeCloseTo(1, 13);
    expect(Number.isInteger(electrons)).toBe(false);
    const noise = calculateSignalToNoise({ signalElectrons: electrons, readNoiseElectrons: 3 });
    expect(noise.value.combinedNoiseStdElectrons / Math.sqrt(expected + 9)).toBeCloseTo(1, 13);
    expect(noise.value.snrLinear / (expected / Math.sqrt(expected + 9))).toBeCloseTo(1, 13);
    expect(noise.provenance.kind).toBe("calculated");
    expect(expectation()).toBe(electrons);
  });

  it("maps one stop more optical exposure to twice the mean electrons, not twice shot-limited SNR", () => {
    const factor = calculateRelativeOpticalExposure({
      aperture: fixture.lens.aperture, shutterSeconds: fixture.exposure.shutterSeconds * 2,
      referenceAperture: fixture.lens.aperture, referenceShutterSeconds: fixture.exposure.shutterSeconds
    }).value;
    expect(factor.factor).toBe(2);
    expect(factor.stops).toBe(1);
    const base = expectation(), longer = expectation(factor.factor);
    expect(longer / base).toBeCloseTo(2, 13);
    const snr = (signalElectrons: number): number => calculateSignalToNoise({
      signalElectrons, readNoiseElectrons: 0
    }).value.snrLinear;
    expect(snr(longer) / snr(base)).toBeCloseTo(Math.sqrt(2), 13);
  });

  it("keeps equal nominal rendered exposure distinct from physical signal and SNR", () => {
    const render = calculateRelativeRenderedExposure({
      aperture: fixture.lens.aperture, shutterSeconds: fixture.exposure.shutterSeconds / 2,
      iso: fixture.exposure.iso * 2, referenceAperture: fixture.lens.aperture,
      referenceShutterSeconds: fixture.exposure.shutterSeconds, referenceIso: fixture.exposure.iso
    });
    expect(render.value.factor).toBe(1);
    expect(render.value.opticalFactor).toBe(0.5);
    expect(render.value.isoGainFactor).toBe(2);
    const base = expectation(), shorter = expectation(render.value.opticalFactor);
    expect(shorter / base).toBeCloseTo(0.5, 13);
    const baseNoise = calculateSignalToNoise({ signalElectrons: base, readNoiseElectrons: 3 }).value;
    const shortNoise = calculateSignalToNoise({ signalElectrons: shorter, readNoiseElectrons: 3 }).value;
    const expectedRatio = 0.5 * Math.sqrt((base + 9) / (base / 2 + 9));
    expect(shortNoise.snrLinear / baseNoise.snrLinear).toBeCloseTo(expectedRatio, 13);
    expect(shortNoise.snrLinear < baseNoise.snrLinear).toBe(true);
  });

  it("scales photon count with vacuum wavelength at fixed supplied energy and constant test QE", () => {
    const counts = [1, 2].map((scale) => {
      const photon = calculatePhotonEnergyFromWavelength({
        wavelengthNanometers: fixture.illumination.wavelengthNm * scale, wavelengthBasis: "vacuum"
      });
      return calculatePhotoelectrons({
        incidentPhotons: referenceEnergyJoules / photon.value.photonEnergyJoules, quantumEfficiency
      }).value;
    });
    expect(counts[1] / counts[0]).toBeCloseTo(2, 13);
  });

  it("keeps zero detection JSON-safe and rejects invalid counts before noise calculation", () => {
    const electrons = calculatePhotoelectrons({ incidentPhotons: 133.25, quantumEfficiency: 0 }).value;
    const result = calculateSignalToNoise({ signalElectrons: electrons, readNoiseElectrons: 0 });
    expect(result.value).toEqual({ shotNoiseStdElectrons: 0, combinedNoiseStdElectrons: 0,
      snrLinear: 0, snrDb: null });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    for (const incidentPhotons of [-1, NaN, Infinity]) {
      expect(() => calculatePhotoelectrons({ incidentPhotons, quantumEfficiency })).toThrow();
    }
  });
});
