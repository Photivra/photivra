import { describe, expect, it } from "vitest";

import {
  parseSensorSpectralResponseProfile,
  resolveSensorSpectralResponseAtWavelength,
  type SensorColorSamplingProfile,
  type SensorSpectralResponseProfile,
  type SpectralFractionCurve
} from "../src/index.js";

const ownedEvidence = (ref: string) =>
  [{
    sourceOrigin: "photivra" as const,
    sourceReference: ref,
    reuseStatus: "photivra-owned" as const
  }] as const;

const factualEvidence = (ref: string) =>
  [{
    sourceOrigin: "manufacturer" as const,
    sourceReference: ref,
    reuseStatus: "factual-reference-only" as const
  }] as const;

const colorProfile = (): SensorColorSamplingProfile => ({
  schemaVersion: "0.1.0",
  profileId: "color",
  evidence: ownedEvidence("test:color"),
  coordinateSystem:
    "native-sensor-color-sampling-site-index",
  layout: {
    kind: "periodic-mosaic",
    repeatWidthSites: 2,
    repeatHeightSites: 2,
    siteChannelIds: [
      "red",
      "green-a",
      "green-b",
      "blue"
    ],
    anchor: "native-sensor-top-left-site"
  }
});

const fractionCurve = (
  values: readonly [number, number][],
  basis: "air" | "vacuum" | "unspecified" = "air"
): SpectralFractionCurve => ({
  wavelengthUnit: "nm" as const,
  wavelengthBasis: basis,
  interpolation: "piecewise-linear" as const,
  outsideRangeBehavior: "fail-closed" as const,
  evidence: ownedEvidence("test:curve"),
  samples: values.map(([wavelengthNanometers, value]) => ({
    wavelengthNanometers,
    value
  }))
});

const profile = (): SensorSpectralResponseProfile => ({
  schemaVersion: "0.1.0",
  profileId: "spectral",
  colorSamplingProfileId: "color",
  evidence: ownedEvidence("test:spectral"),
  channels: [
    {
      channelId: "red",
      kind: "effective-external-quantum-efficiency",
      responseScope: "site-incident-effective-channel-response",
      scientificStatus: "calibrated",
      uncertainty: {
        kind: "relative",
        fraction: 0.02,
        basis: "test calibration"
      },
      evidence: ownedEvidence("test:red"),
      conditionDependence: "not-modeled",
      referenceConditions: {
        temperatureC: 25,
        incidenceAngleDegreesFromNormal: 0,
        polarization: "unpolarized"
      },
      externalQuantumEfficiency: fractionCurve([
        [400, 0.1],
        [500, 0.5],
        [600, 0.3]
      ])
    },
    {
      channelId: "green-a",
      kind: "effective-spectral-responsivity",
      responseScope:
        "sensor-package-incident-effective-channel-response",
      scientificStatus: "approximation",
      uncertainty: {
        kind: "not-quantified",
        limitation: "test approximation"
      },
      evidence: ownedEvidence("test:green-a"),
      conditionDependence: "not-modeled",
      spectralResponsivity: {
        wavelengthUnit: "nm",
        wavelengthBasis: "air",
        interpolation: "piecewise-linear",
        outsideRangeBehavior: "fail-closed",
        evidence: ownedEvidence("test:responsivity"),
        samples: [
          { wavelengthNanometers: 450, amperesPerWatt: 0.2 },
          { wavelengthNanometers: 550, amperesPerWatt: 0.4 },
          { wavelengthNanometers: 650, amperesPerWatt: 0.1 }
        ]
      }
    },
    {
      channelId: "green-b",
      kind: "separable-channel-filter-and-detector-eqe",
      responseScope:
        "site-incident-channel-filter-times-detector-eqe",
      combinationRule: "multiply",
      scientificStatus: "approximation",
      uncertainty: {
        kind: "not-quantified",
        limitation: "separate test components"
      },
      evidence: ownedEvidence("test:green-b"),
      conditionDependence: "not-modeled",
      channelFilterTransmittance: fractionCurve([
        [450, 0.2],
        [550, 0.8],
        [650, 0.2]
      ]),
      detectorExternalQuantumEfficiency: fractionCurve([
        [400, 0.4],
        [500, 0.6],
        [600, 0.5],
        [700, 0.3]
      ])
    }
  ]
});

describe("sensor spectral response foundation", () => {
  it("resolves exact and interpolated external QE without extrapolation", () => {
    const exact = resolveSensorSpectralResponseAtWavelength({
      colorSamplingProfile: colorProfile(),
      spectralResponseProfile: profile(),
      channelId: "red",
      wavelengthNanometers: 500,
      wavelengthBasis: "air"
    });
    expect(exact.value.response.kind)
      .toBe("effective-external-quantum-efficiency");
    if (exact.value.response.kind !==
      "effective-external-quantum-efficiency") {
      throw new Error("Expected QE");
    }
    expect(exact.value.response.externalQuantumEfficiency).toBe(0.5);
    expect(exact.value.interpolationUsed).toBe(false);

    const interpolated =
      resolveSensorSpectralResponseAtWavelength({
        colorSamplingProfile: colorProfile(),
        spectralResponseProfile: profile(),
        channelId: "red",
        wavelengthNanometers: 450,
        wavelengthBasis: "air"
      });
    if (interpolated.value.response.kind !==
      "effective-external-quantum-efficiency") {
      throw new Error("Expected QE");
    }
    expect(
      interpolated.value.response.externalQuantumEfficiency
    ).toBeCloseTo(0.3, 12);
    expect(interpolated.value.interpolationUsed).toBe(true);

    expect(() =>
      resolveSensorSpectralResponseAtWavelength({
        colorSamplingProfile: colorProfile(),
        spectralResponseProfile: profile(),
        channelId: "red",
        wavelengthNanometers: 700,
        wavelengthBasis: "air"
      })
    ).toThrow("outside the declared spectral-response range");
  });

  it("keeps A/W responsivity distinct from QE", () => {
    const result = resolveSensorSpectralResponseAtWavelength({
      colorSamplingProfile: colorProfile(),
      spectralResponseProfile: profile(),
      channelId: "green-a",
      wavelengthNanometers: 500,
      wavelengthBasis: "air"
    });

    expect(result.value.response.kind)
      .toBe("effective-spectral-responsivity");
    if (result.value.response.kind !==
      "effective-spectral-responsivity") {
      throw new Error("Expected responsivity");
    }
    expect(result.value.response.amperesPerWatt)
      .toBeCloseTo(0.3, 12);
    expect(result.value.qeResponsivityConversionPerformed)
      .toBe(false);
  });

  it("multiplies only explicitly separable filter and detector QE", () => {
    const result = resolveSensorSpectralResponseAtWavelength({
      colorSamplingProfile: colorProfile(),
      spectralResponseProfile: profile(),
      channelId: "green-b",
      wavelengthNanometers: 550,
      wavelengthBasis: "air"
    });

    if (result.value.response.kind !==
      "effective-external-quantum-efficiency") {
      throw new Error("Expected QE");
    }
    expect(
      result.value.response.channelFilterTransmittance
    ).toBeCloseTo(0.8, 12);
    expect(
      result.value.response.detectorExternalQuantumEfficiency
    ).toBeCloseTo(0.55, 12);
    expect(
      result.value.response.externalQuantumEfficiency
    ).toBeCloseTo(0.44, 12);
    expect(result.value.response.composition)
      .toBe("channel-filter-transmittance-times-detector-eqe");
  });

  it("requires reusable rights for embedded numeric curves", () => {
    const input = profile() as unknown as Record<string, unknown>;
    const channels = input.channels as Array<Record<string, unknown>>;
    const red = channels[0]!;
    const curve = red.externalQuantumEfficiency as Record<string, unknown>;
    curve.evidence = factualEvidence("manufacturer:curve");

    expect(() =>
      parseSensorSpectralResponseProfile(input)
    ).toThrow("reusable numeric data");
  });

  it("rejects invalid samples and duplicate channels", () => {
    const badOrder = profile() as unknown as Record<string, unknown>;
    const channels = badOrder.channels as Array<Record<string, unknown>>;
    const red = channels[0]!;
    const curve = red.externalQuantumEfficiency as Record<string, unknown>;
    curve.samples = [
      { wavelengthNanometers: 500, value: 0.2 },
      { wavelengthNanometers: 500, value: 0.3 }
    ];
    expect(() =>
      parseSensorSpectralResponseProfile(badOrder)
    ).toThrow("strictly increasing");

    const badFraction = profile() as unknown as Record<string, unknown>;
    const channels2 = badFraction.channels as Array<Record<string, unknown>>;
    const red2 = channels2[0]!;
    const curve2 = red2.externalQuantumEfficiency as Record<string, unknown>;
    curve2.samples = [
      { wavelengthNanometers: 400, value: 0.2 },
      { wavelengthNanometers: 500, value: 1.2 }
    ];
    expect(() =>
      parseSensorSpectralResponseProfile(badFraction)
    ).toThrow("fraction from 0 through 1");

    const duplicate = profile() as unknown as Record<string, unknown>;
    const duplicateChannels =
      duplicate.channels as Array<Record<string, unknown>>;
    duplicateChannels.push({
      ...duplicateChannels[0]!
    });
    expect(() =>
      parseSensorSpectralResponseProfile(duplicate)
    ).toThrow("duplicate channel IDs");
  });

  it("fails closed on wavelength basis mismatch and calibrated unspecified basis", () => {
    expect(() =>
      resolveSensorSpectralResponseAtWavelength({
        colorSamplingProfile: colorProfile(),
        spectralResponseProfile: profile(),
        channelId: "red",
        wavelengthNanometers: 500,
        wavelengthBasis: "vacuum"
      })
    ).toThrow("must exactly match");

    const calibratedUnknown = profile() as unknown as Record<string, unknown>;
    const channels =
      calibratedUnknown.channels as Array<Record<string, unknown>>;
    const red = channels[0]!;
    const curve = red.externalQuantumEfficiency as Record<string, unknown>;
    curve.wavelengthBasis = "unspecified";

    expect(() =>
      parseSensorSpectralResponseProfile(calibratedUnknown)
    ).toThrow("calibrated responses must declare wavelengthBasis");
  });

  it("validates exact topology linkage and distinct green channel IDs", () => {
    expect(() =>
      resolveSensorSpectralResponseAtWavelength({
        colorSamplingProfile: colorProfile(),
        spectralResponseProfile: {
          ...profile(),
          colorSamplingProfileId: "wrong"
        },
        channelId: "red",
        wavelengthNanometers: 500,
        wavelengthBasis: "air"
      })
    ).toThrow("must match");

    expect(() =>
      resolveSensorSpectralResponseAtWavelength({
        colorSamplingProfile: colorProfile(),
        spectralResponseProfile: profile(),
        channelId: "green",
        wavelengthNanometers: 550,
        wavelengthBasis: "air"
      })
    ).toThrow("not present");

    const a = resolveSensorSpectralResponseAtWavelength({
      colorSamplingProfile: colorProfile(),
      spectralResponseProfile: profile(),
      channelId: "green-a",
      wavelengthNanometers: 550,
      wavelengthBasis: "air"
    });
    const b = resolveSensorSpectralResponseAtWavelength({
      colorSamplingProfile: colorProfile(),
      spectralResponseProfile: profile(),
      channelId: "green-b",
      wavelengthNanometers: 550,
      wavelengthBasis: "air"
    });
    expect(a.value.sourceResponseKind)
      .not.toBe(b.value.sourceResponseKind);
  });

  it("rejects response channels not present in topology", () => {
    const extra = profile();
    const withExtra: SensorSpectralResponseProfile = {
      ...extra,
      channels: [
        ...extra.channels,
        {
          ...extra.channels[0]!,
          channelId: "infrared"
        }
      ]
    };

    expect(() =>
      resolveSensorSpectralResponseAtWavelength({
        colorSamplingProfile: colorProfile(),
        spectralResponseProfile: withExtra,
        channelId: "red",
        wavelengthNanometers: 500,
        wavelengthBasis: "air"
      })
    ).toThrow("not present in the linked color-sampling topology");
  });

  it("fails closed for layered topology until spatial registration exists", () => {
    const layered: SensorColorSamplingProfile = {
      schemaVersion: "0.1.0",
      profileId: "color",
      evidence: ownedEvidence("test:layered"),
      coordinateSystem:
        "native-sensor-layered-spatial-relationship-not-resolved",
      layout: {
        kind: "layered",
        layerChannelIds: ["red", "green", "blue"],
        spatialSamplingRelationship: "not-resolved"
      }
    };

    expect(() =>
      resolveSensorSpectralResponseAtWavelength({
        colorSamplingProfile: layered,
        spectralResponseProfile: profile(),
        channelId: "red",
        wavelengthNanometers: 500,
        wavelengthBasis: "air"
      })
    ).toThrow("Layered color sampling remains spatially unresolved");
  });

  it("preserves single-condition and pre-integration boundaries", () => {
    const result = resolveSensorSpectralResponseAtWavelength({
      colorSamplingProfile: colorProfile(),
      spectralResponseProfile: profile(),
      channelId: "red",
      wavelengthNanometers: 500,
      wavelengthBasis: "air"
    });

    expect(result.value.referenceConditions).toEqual({
      temperatureC: 25,
      incidenceAngleDegreesFromNormal: 0,
      polarization: "unpolarized"
    });
    expect(result.value.conditionDependenceModeled).toBe(false);
    expect(result.value.fieldAngleDependenceModeled).toBe(false);
    expect(result.value.temperatureDependenceModeled).toBe(false);
    expect(result.value.polarizationDependenceModeled).toBe(false);
    expect(result.value.spectralIrradianceIntegrated).toBe(false);
    expect(result.value.wavelengthIntegrationPerformed).toBe(false);
    expect(result.value.photonsCalculated).toBe(false);
    expect(result.value.electronsCalculated).toBe(false);
    expect(result.value.rawCodeValueProduced).toBe(false);
  });
});
