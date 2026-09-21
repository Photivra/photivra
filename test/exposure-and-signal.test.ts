import { describe, expect, it } from "vitest";

import {
  calculateEquivalentIso,
  calculateExposureValue100,
  calculatePhotoelectrons,
  calculateRelativeOpticalExposure,
  calculateRelativeRenderedExposure,
  calculateSignalToNoise
} from "../src/index.js";

describe("exposure relations", () => {
  it("calculates EV100", () => {
    const result = calculateExposureValue100({
      aperture: 4,
      shutterSeconds: 1 / 1000
    });

    expect(result.value).toBeCloseTo(13.965784285, 9);
  });

  it("reports one stop less optical exposure when shutter duration is halved", () => {
    const result = calculateRelativeOpticalExposure({
      aperture: 4,
      shutterSeconds: 1 / 2000,
      referenceAperture: 4,
      referenceShutterSeconds: 1 / 1000
    });

    expect(result.value.factor).toBeCloseTo(0.5, 12);
    expect(result.value.stops).toBeCloseTo(-1, 12);
  });

  it("combines optical exposure and nominal ISO gain for relative rendering", () => {
    const reference = {
      referenceAperture: 5.6,
      referenceShutterSeconds: 1 / 1000,
      referenceIso: 800
    };

    const same = calculateRelativeRenderedExposure({
      aperture: 5.6,
      shutterSeconds: 1 / 1000,
      iso: 800,
      ...reference
    });
    expect(same.value.factor).toBeCloseTo(1, 12);
    expect(same.value.stops).toBeCloseTo(0, 12);

    const isoUpOneStop = calculateRelativeRenderedExposure({
      aperture: 5.6,
      shutterSeconds: 1 / 1000,
      iso: 1600,
      ...reference
    });
    expect(isoUpOneStop.value.opticalFactor).toBeCloseTo(1, 12);
    expect(isoUpOneStop.value.isoGainFactor).toBeCloseTo(2, 12);
    expect(isoUpOneStop.value.factor).toBeCloseTo(2, 12);
    expect(isoUpOneStop.value.stops).toBeCloseTo(1, 12);
  });

  it("preserves nominal rendered exposure across equivalent-stop settings", () => {
    const result = calculateRelativeRenderedExposure({
      aperture: 5.6,
      shutterSeconds: 1 / 2000,
      iso: 1600,
      referenceAperture: 5.6,
      referenceShutterSeconds: 1 / 1000,
      referenceIso: 800
    });

    expect(result.value.opticalFactor).toBeCloseTo(0.5, 12);
    expect(result.value.isoGainFactor).toBeCloseTo(2, 12);
    expect(result.value.factor).toBeCloseTo(1, 12);
    expect(result.value.stops).toBeCloseTo(0, 12);
  });

  it("does not describe nominal ISO gain as photon creation", () => {
    const result = calculateRelativeRenderedExposure({
      aperture: 4,
      shutterSeconds: 1 / 1000,
      iso: 800,
      referenceAperture: 4,
      referenceShutterSeconds: 1 / 1000,
      referenceIso: 800
    });

    expect(result.provenance.assumptions).toContain(
      "ISO is treated as nominal rendering gain, not photon creation"
    );
  });

  it("rejects non-finite computed exposure results", () => {
    expect(() =>
      calculateExposureValue100({
        aperture: 1e308,
        shutterSeconds: 1
      })
    ).toThrow("Calculation produced a non-finite number at value.");
  });

  it("doubles equivalent ISO when shutter duration is halved", () => {
    const result = calculateEquivalentIso({
      baseIso: 800,
      baseAperture: 4,
      baseShutterSeconds: 1 / 1000,
      aperture: 4,
      shutterSeconds: 1 / 2000
    });

    expect(result.value).toBeCloseTo(1600, 12);
  });
});

describe("sensor signal primitives", () => {
  it("converts photons to mean photoelectrons through quantum efficiency", () => {
    const result = calculatePhotoelectrons({
      incidentPhotons: 1000,
      quantumEfficiency: 0.5
    });

    expect(result.value).toBeCloseTo(500, 12);
  });

  it("rejects quantum efficiency outside the physical range", () => {
    expect(() =>
      calculatePhotoelectrons({
        incidentPhotons: 1000,
        quantumEfficiency: 1.1
      })
    ).toThrow("quantumEfficiency must be a finite number from 0 through 1.");
  });

  it("returns JSON-safe zero SNR for zero signal and zero read noise", () => {
    const result = calculateSignalToNoise({
      signalElectrons: 0,
      readNoiseElectrons: 0
    });

    expect(result.value.snrLinear).toBe(0);
    expect(result.value.snrDb).toBeNull();
  });

  it("rejects negative sensor-noise inputs", () => {
    expect(() =>
      calculateSignalToNoise({
        signalElectrons: -1,
        readNoiseElectrons: 0
      })
    ).toThrow("signalElectrons must be a finite number");
  });

  it("combines shot and read noise in quadrature", () => {
    const result = calculateSignalToNoise({
      signalElectrons: 10000,
      readNoiseElectrons: 5
    });

    expect(result.value.shotNoiseStdElectrons).toBeCloseTo(100, 12);
    expect(result.value.combinedNoiseStdElectrons).toBeCloseTo(
      Math.sqrt(10025),
      12
    );
    expect(result.value.snrLinear).toBeCloseTo(99.875233888, 9);
    expect(result.value.snrDb).toBeCloseTo(39.989156187, 9);
  });
});
