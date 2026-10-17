import { describe, expect, it } from "vitest";

import {
  calculateEnvironmentSensorPhotoSignal,
  simulateEnvironmentSensorRawFrame,
  type EnvironmentLensFieldMapping
} from "../src/index.js";
import { frameInput, siteInput } from "./helpers/environment-raw-fixture.js";

const IDENTITY: EnvironmentLensFieldMapping = { projectionModel: "rectilinear", distortion: { kind: "none" }, radiometricAreaCorrection: "inverse-distortion-jacobian" };
const BARREL: EnvironmentLensFieldMapping = { projectionModel: "rectilinear", radiometricAreaCorrection: "inverse-distortion-jacobian",
  distortion: { kind: "radial", profile: { normalizationRadiusMm: 30, maximumNormalizedRadius: 1, coefficients: { k1: -0.1, k2: 0, k3: 0 } } } };

describe("environment photo signal with a lens field mapping", () => {
  it("an identity mapping reproduces the photo signal exactly", () => {
    const base = calculateEnvironmentSensorPhotoSignal(siteInput(undefined, false));
    const mapped = calculateEnvironmentSensorPhotoSignal({ ...siteInput(undefined, false), lensFieldMapping: IDENTITY });
    expect(mapped.value.photo).toEqual(base.value.photo);
    expect(base.provenance.modelVersion).toBe("0.3.0");
    expect(mapped.provenance.modelVersion).toBe("0.4.0");
  });

  it("applies the distortion area factor exactly once to irradiance (uniform angular field)", () => {
    const base = calculateEnvironmentSensorPhotoSignal(siteInput(undefined, false)).value;
    const mapped = calculateEnvironmentSensorPhotoSignal({ ...siteInput(undefined, false), lensFieldMapping: BARREL }).value;
    const factors = mapped.instants.flatMap((i) => i.evaluations.map((e) => e.query.value.lensFieldMapping!.distortionAreaFactor));
    // Barrel distortion compresses the image off axis, raising irradiance there.
    expect(factors.every((f) => f >= 1)).toBe(true);
    expect(factors.some((f) => f > 1)).toBe(true);
    // The bridge irradiance itself is unchanged for a direction-independent field; only the area factor scales it.
    mapped.instants.forEach((instant, i) => instant.evaluations.forEach((e, j) =>
      expect(e.optics.value.sensorPlaneSpectralIrradianceWattsPerSquareMeterNanometer)
        .toBe(base.instants[i]!.evaluations[j]!.optics.value.sensorPlaneSpectralIrradianceWattsPerSquareMeterNanometer)));
    mapped.photo.value.photoSignal.temporalSamples.forEach((sample, i) => {
      const ratio = sample.incidentPhotonRatePerSecond / base.photo.value.photoSignal.temporalSamples[i]!.incidentPhotonRatePerSecond;
      expect(ratio).toBeGreaterThanOrEqual(Math.min(...factors) * (1 - 1e-12));
      expect(ratio).toBeLessThanOrEqual(Math.max(...factors) * (1 + 1e-12));
    });
  });

  it("rejects a mapping combined with ideal pupil rays", () => {
    const input = { ...siteInput(undefined, false), lensFieldMapping: IDENTITY,
      pupil: { kind: "ideal-circular-entrance-pupil", radialSampleCount: 1, azimuthalSampleCount: 4 } as never };
    expect(() => calculateEnvironmentSensorPhotoSignal(input)).toThrow(/lens field mapping|pupil/);
  });
});

describe("environment RAW frame with a lens field mapping", () => {
  it("is bit-identical to the unmapped frame for an identity mapping and requires the mapping on every site", () => {
    const base = simulateEnvironmentSensorRawFrame(frameInput()).value.raw.value.frame;
    const input = frameInput();
    input.sites = input.sites.map((s) => ({ ...s, environment: { ...s.environment, lensFieldMapping: IDENTITY } }));
    expect(simulateEnvironmentSensorRawFrame(input).value.raw.value.frame).toEqual(base);
    const mixed = frameInput();
    mixed.sites = mixed.sites.map((s, i) => i === 0 ? { ...s, environment: { ...s.environment, lensFieldMapping: IDENTITY } } : s);
    expect(() => simulateEnvironmentSensorRawFrame(mixed)).toThrow(/must match/);
  });
});
