// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { calculateLensStrayLightIrradiance, parseLensStrayLightProfile } from "../src/index.js";
import { parseOpticalProfileState } from "../src/optics/profile-contract.js";
import { calculatePhotonEnergyFromWavelength } from "../src/sensor/photon-energy.js";
import { calculatePhotoelectrons, calculateSignalToNoise } from "../src/sensor/signal-noise.js";
import { source, state, strayProfile } from "./optics-group-fixtures.js";

const input = { profile: strayProfile, state, enabled: true, imagePointMm: { x: 0, y: 0 },
  wavelengthNm: 550, wavelengthBasis: "vacuum" as const, timeSeconds: .01,
  primarySpectralIrradianceWPerM2PerNm: .1, sources: [source], meterDomain: "primary-plus-stray" as const };
describe("parametric clean-lens stray light", () => {
  it("allows off-frame sources, separates ghosts/veil and adds before sensor exposure", () => {
    const result = calculateLensStrayLightIrradiance(input);
    const v = result.value;
    expect(v.ghostSpectralIrradianceWPerM2PerNm).toBeGreaterThan(0);
    expect(v.veilSpectralIrradianceWPerM2PerNm).toBeGreaterThan(0);
    expect(v.totalSpectralIrradianceWPerM2PerNm).toBe(v.primarySpectralIrradianceWPerM2PerNm+v.ghostSpectralIrradianceWPerM2PerNm+v.veilSpectralIrradianceWPerM2PerNm);
    expect(v.contributions.map((c) => c.kind)).toEqual(["ghost", "veil"]);
    expect(result.provenance.kind).toBe("approximation");
    expect(v.meterSpectralIrradianceWPerM2PerNm).toBe(v.totalSpectralIrradianceWPerM2PerNm);
    expect(calculateLensStrayLightIrradiance({ ...input, meterDomain: "primary-only" }).value.meterSpectralIrradianceWPerM2PerNm).toBe(.1);
    // Same exposure integration and downstream full-well rule for all incident light.
    const exposureSeconds = .01, areaM2 = 1e-10, qe = .5, bandwidthNm = 1;
    const photonEnergyJ = calculatePhotonEnergyFromWavelength({ wavelengthNanometers: v.wavelengthNm, wavelengthBasis: v.wavelengthBasis }).value.photonEnergyJoules;
    const electrons = (irradiance: number): number => calculatePhotoelectrons({
      incidentPhotons: irradiance*exposureSeconds*areaM2*bandwidthNm/photonEnergyJ, quantumEfficiency: qe
    }).value;
    expect(electrons(v.totalSpectralIrradianceWPerM2PerNm)).toBeGreaterThan(electrons(.1));
    expect(Math.min(10000, electrons(v.totalSpectralIrradianceWPerM2PerNm))).toBe(10000);
    expect(calculateSignalToNoise({ signalElectrons: electrons(v.totalSpectralIrradianceWPerM2PerNm), readNoiseElectrons: 2 }).value.shotNoiseStdElectrons)
      .toBeGreaterThan(calculateSignalToNoise({ signalElectrons: electrons(.1), readNoiseElectrons: 2 }).value.shotNoiseStdElectrons);
  });
  it("disabled is exact primary identity and source admission affects individual sources", () => {
    const off = calculateLensStrayLightIrradiance({ ...input, enabled: false }).value;
    expect(off.totalSpectralIrradianceWPerM2PerNm).toBe(.1); expect(off.contributions).toEqual([]);
    const blocked = calculateLensStrayLightIrradiance({ ...input, sources: [{ ...source, admittedFraction: 0 }] }).value;
    expect(blocked.totalSpectralIrradianceWPerM2PerNm).toBe(.1);
  });
  it("is deterministic and linear in source power and multiple sources", () => {
    const a = calculateLensStrayLightIrradiance(input).value;
    expect(a).toEqual(calculateLensStrayLightIrradiance(input).value);
    const b = calculateLensStrayLightIrradiance({ ...input, sources: [source, { ...source, id: "second" }] }).value;
    expect(b.ghostSpectralIrradianceWPerM2PerNm).toBe(2*a.ghostSpectralIrradianceWPerM2PerNm);
    expect(b.veilSpectralIrradianceWPerM2PerNm).toBe(2*a.veilSpectralIrradianceWPerM2PerNm);
    const angle = calculateLensStrayLightIrradiance({ ...input, sources: [{ ...source, fieldAngleXDegrees: 0 }] }).value;
    expect(angle.ghostSpectralIrradianceWPerM2PerNm).toBeLessThan(a.ghostSpectralIrradianceWPerM2PerNm);
  });
  it("uses absolute infinite-plane power normalization, not finite-crop renormalization", () => {
    const profile = { ...strayProfile, responses: [strayProfile.responses[0]!] };
    let integralWPerNm = 0;
    const step = .05;
    for (let iy = 0; iy < 80; iy++) for (let ix = 0; ix < 80; ix++) {
      const v = calculateLensStrayLightIrradiance({ ...input, profile,
        imagePointMm: { x: -2+(ix+.5)*step, y: -2+(iy+.5)*step } }).value;
      integralWPerNm += v.ghostSpectralIrradianceWPerM2PerNm*step*step*1e-6;
    }
    expect(integralWPerNm).toBeCloseTo(source.incidentSpectralPowerWPerNm*.01*(1+(50/60)**2), 8);
  });
  it("requires exact wavelength and body/lens/acquisition applicability including combined reflections", () => {
    const profile = { ...strayProfile, interaction: "sensor-lens-reflections" as const };
    expect(parseLensStrayLightProfile(profile).interaction).toBe("sensor-lens-reflections");
    for (const change of [{ aperture: 5 }, { lensVersion: "2" }, { captureMode: "video" as const, frameRateHz: 30 },
      { outputWidth: 6 }, { stabilizationMode: "digital" }]) {
      expect(() => calculateLensStrayLightIrradiance({ ...input, profile, state: { ...state, ...change } })).toThrow();
    }
    expect(() => calculateLensStrayLightIrradiance({ ...input, wavelengthBasis: "air" })).toThrow();
    expect(() => calculateLensStrayLightIrradiance({ ...input, wavelengthNm: 600 })).toThrow();
  });
  it("rejects unsupported calibration, contamination, nonpassivity and malformed state", () => {
    const response = strayProfile.responses[0]!;
    for (const value of [null, { ...strayProfile, schemaVersion: "2" }, { ...strayProfile, contamination: {} },
      { ...strayProfile, evidence: { ...strayProfile.evidence, kind: "calibrated" } },
      { ...strayProfile, maximumSourceAngleDegrees: 90 }, { ...strayProfile, referenceEntranceAreaMm2: 0 },
      { ...strayProfile, responses: [response, response] }, { ...strayProfile, responses: [{ ...response, axisPowerFraction: 1 }] },
      { ...strayProfile, responses: [{ ...response, angularSlope: -2 }] },
      { ...strayProfile, responses: [{ ...response, sigmaMm: 0 }] },
      { ...strayProfile, responses: [{ ...response, centroidMmPerDegree: [1, 2] }] }]) {
      expect(() => parseLensStrayLightProfile(value)).toThrow();
    }
    for (const value of [{ ...state, outputWidth: 1.5 }, { ...state, frameRateHz: 30 },
      { ...state, captureMode: "video", frameRateHz: 0 }, { ...state, lensId: "" }, { ...state, focalLengthMm: Infinity }]) {
      expect(() => parseOpticalProfileState(value)).toThrow();
    }
  });
  it("rejects out-of-domain/duplicate sources and invalid absolute input", () => {
    for (const changes of [{ sources: [{ ...source, fieldAngleXDegrees: 61 }] }, { sources: [source, source] },
      { sources: [{ ...source, incidentSpectralPowerWPerNm: -1 }] }, { sources: [{ ...source, admittedFraction: 2 }] },
      { primarySpectralIrradianceWPerM2PerNm: -1 }, { timeSeconds: -1 }, { imagePointMm: { x: NaN, y: 0 } }]) {
      expect(() => calculateLensStrayLightIrradiance({ ...input, ...changes })).toThrow();
    }
  });
});
