import { describe, expect, it } from "vitest";

import {
  calculateSensorSpectralQuadrature,
  type SensorColorSamplingProfile,
  type SensorSpectralResponseProfile
} from "../src/index.js";

const evidence = (ref: string) =>
  [{
    sourceOrigin: "photivra" as const,
    sourceReference: ref,
    reuseStatus: "photivra-owned" as const
  }] as const;

const colorProfile = (): SensorColorSamplingProfile => ({
  schemaVersion: "0.1.0",
  profileId: "color",
  evidence: evidence("test:color"),
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

const qeProfile = (): SensorSpectralResponseProfile => ({
  schemaVersion: "0.1.0",
  profileId: "spectral",
  colorSamplingProfileId: "color",
  evidence: evidence("test:spectral"),
  channels: [{
    channelId: "red",
    kind: "effective-external-quantum-efficiency",
    responseScope: "site-incident-effective-channel-response",
    scientificStatus: "approximation",
    uncertainty: {
      kind: "not-quantified",
      limitation: "test"
    },
    evidence: evidence("test:red"),
    conditionDependence: "not-modeled",
    externalQuantumEfficiency: {
      wavelengthUnit: "nm",
      wavelengthBasis: "air",
      interpolation: "piecewise-linear",
      outsideRangeBehavior: "fail-closed",
      evidence: evidence("test:curve"),
      samples: [
        { wavelengthNanometers: 400, value: 0.1 },
        { wavelengthNanometers: 410, value: 0.3 },
        { wavelengthNanometers: 700, value: 0.2 }
      ]
    }
  }]
});

const separableProfile = (): SensorSpectralResponseProfile => ({
  schemaVersion: "0.1.0",
  profileId: "separable",
  colorSamplingProfileId: "color",
  evidence: evidence("test:separable"),
  channels: [{
    channelId: "green-b",
    kind: "separable-channel-filter-and-detector-eqe",
    responseScope:
      "site-incident-channel-filter-times-detector-eqe",
    combinationRule: "multiply",
    scientificStatus: "approximation",
    uncertainty: {
      kind: "not-quantified",
      limitation: "test"
    },
    evidence: evidence("test:green"),
    conditionDependence: "not-modeled",
    channelFilterTransmittance: {
      wavelengthUnit: "nm",
      wavelengthBasis: "air",
      interpolation: "piecewise-linear",
      outsideRangeBehavior: "fail-closed",
      evidence: evidence("test:filter"),
      samples: [
        { wavelengthNanometers: 450, value: 0.2 },
        { wavelengthNanometers: 550, value: 0.8 },
        { wavelengthNanometers: 650, value: 0.2 }
      ]
    },
    detectorExternalQuantumEfficiency: {
      wavelengthUnit: "nm",
      wavelengthBasis: "air",
      interpolation: "piecewise-linear",
      outsideRangeBehavior: "fail-closed",
      evidence: evidence("test:detector"),
      samples: [
        { wavelengthNanometers: 400, value: 0.4 },
        { wavelengthNanometers: 500, value: 0.6 },
        { wavelengthNanometers: 600, value: 0.5 },
        { wavelengthNanometers: 700, value: 0.3 }
      ]
    }
  }]
});

const responsivityProfile = (): SensorSpectralResponseProfile => ({
  schemaVersion: "0.1.0",
  profileId: "responsivity",
  colorSamplingProfileId: "color",
  evidence: evidence("test:responsivity-profile"),
  channels: [{
    channelId: "green-a",
    kind: "effective-spectral-responsivity",
    responseScope:
      "sensor-package-incident-effective-channel-response",
    scientificStatus: "approximation",
    uncertainty: {
      kind: "not-quantified",
      limitation: "test"
    },
    evidence: evidence("test:green-a"),
    conditionDependence: "not-modeled",
    spectralResponsivity: {
      wavelengthUnit: "nm",
      wavelengthBasis: "air",
      interpolation: "piecewise-linear",
      outsideRangeBehavior: "fail-closed",
      evidence: evidence("test:aw"),
      samples: [
        { wavelengthNanometers: 450, amperesPerWatt: 0.2 },
        { wavelengthNanometers: 550, amperesPerWatt: 0.4 },
        { wavelengthNanometers: 650, amperesPerWatt: 0.1 }
      ]
    }
  }]
});

describe("sensor spectral quadrature", () => {
  it("uses response knots as segment boundaries", () => {
    const result = calculateSensorSpectralQuadrature({
      colorSamplingProfile: colorProfile(),
      spectralResponseProfile: qeProfile(),
      channelId: "red",
      wavelengthBasis: "air",
      wavelengthRangeNanometers: {
        minimum: 400,
        maximum: 700
      },
      subdivisionsPerSegment: 1
    });

    expect(result.value.segmentCount).toBe(2);
    expect(result.value.totalNodeCount).toBe(2);
    expect(result.value.nodes.map(
      (node) => node.wavelengthNanometers
    )).toEqual([405, 555]);
    expect(result.value.nodes.map(
      (node) => node.wavelengthMeasureNanometers
    )).toEqual([10, 290]);
    expect(
      result.value.normalizedWavelengthWeightSum
    ).toBeCloseTo(1, 12);
    expect(
      result.value.wavelengthMeasureSumNanometers
    ).toBeCloseTo(300, 12);
  });

  it("adds caller breakpoints without replacing response knots", () => {
    const result = calculateSensorSpectralQuadrature({
      colorSamplingProfile: colorProfile(),
      spectralResponseProfile: qeProfile(),
      channelId: "red",
      wavelengthBasis: "air",
      wavelengthRangeNanometers: {
        minimum: 400,
        maximum: 700
      },
      subdivisionsPerSegment: 1,
      additionalBreakpointsNanometers: [500]
    });

    expect(result.value.segmentCount).toBe(3);
    expect(result.value.nodes.map(
      (node) => node.wavelengthNanometers
    )).toEqual([405, 455, 600]);
  });

  it("honors partial requested windows", () => {
    const result = calculateSensorSpectralQuadrature({
      colorSamplingProfile: colorProfile(),
      spectralResponseProfile: qeProfile(),
      channelId: "red",
      wavelengthBasis: "air",
      wavelengthRangeNanometers: {
        minimum: 405,
        maximum: 600
      },
      subdivisionsPerSegment: 1
    });

    expect(result.value.nodes.map(
      (node) => node.wavelengthNanometers
    )).toEqual([407.5, 505]);
    expect(
      result.value.wavelengthMeasureSumNanometers
    ).toBeCloseTo(195, 12);
  });

  it("uses the union of separable component knots", () => {
    const result = calculateSensorSpectralQuadrature({
      colorSamplingProfile: colorProfile(),
      spectralResponseProfile: separableProfile(),
      channelId: "green-b",
      wavelengthBasis: "air",
      wavelengthRangeNanometers: {
        minimum: 450,
        maximum: 650
      },
      subdivisionsPerSegment: 1
    });

    expect(result.value.segmentCount).toBe(4);
    expect(result.value.nodes.map(
      (node) => node.wavelengthNanometers
    )).toEqual([475, 525, 575, 625]);
    expect(result.value.nodes.every(
      (node) =>
        node.response.kind ===
        "effective-external-quantum-efficiency"
    )).toBe(true);
  });

  it("preserves A/W response representation", () => {
    const result = calculateSensorSpectralQuadrature({
      colorSamplingProfile: colorProfile(),
      spectralResponseProfile: responsivityProfile(),
      channelId: "green-a",
      wavelengthBasis: "air",
      wavelengthRangeNanometers: {
        minimum: 450,
        maximum: 650
      },
      subdivisionsPerSegment: 2
    });

    expect(result.value.sourceResponseKind)
      .toBe("effective-spectral-responsivity");
    expect(result.value.totalNodeCount).toBe(4);
    expect(result.value.nodes.every(
      (node) =>
        node.response.kind ===
        "effective-spectral-responsivity"
    )).toBe(true);
  });

  it("fails closed on basis mismatch and out-of-range requests", () => {
    expect(() =>
      calculateSensorSpectralQuadrature({
        colorSamplingProfile: colorProfile(),
        spectralResponseProfile: qeProfile(),
        channelId: "red",
        wavelengthBasis: "vacuum",
        wavelengthRangeNanometers: {
          minimum: 400,
          maximum: 700
        },
        subdivisionsPerSegment: 1
      })
    ).toThrow("must exactly match");

    expect(() =>
      calculateSensorSpectralQuadrature({
        colorSamplingProfile: colorProfile(),
        spectralResponseProfile: qeProfile(),
        channelId: "red",
        wavelengthBasis: "air",
        wavelengthRangeNanometers: {
          minimum: 390,
          maximum: 700
        },
        subdivisionsPerSegment: 1
      })
    ).toThrow("usable spectral-response range");
  });

  it("rejects invalid ranges, breakpoints, counts, and oversized plans", () => {
    expect(() =>
      calculateSensorSpectralQuadrature({
        colorSamplingProfile: colorProfile(),
        spectralResponseProfile: qeProfile(),
        channelId: "red",
        wavelengthBasis: "air",
        wavelengthRangeNanometers: {
          minimum: 500,
          maximum: 500
        },
        subdivisionsPerSegment: 1
      })
    ).toThrow("minimum must be less");

    expect(() =>
      calculateSensorSpectralQuadrature({
        colorSamplingProfile: colorProfile(),
        spectralResponseProfile: qeProfile(),
        channelId: "red",
        wavelengthBasis: "air",
        wavelengthRangeNanometers: {
          minimum: 400,
          maximum: 700
        },
        subdivisionsPerSegment: 1,
        additionalBreakpointsNanometers: [750]
      })
    ).toThrow("inside the requested");

    expect(() =>
      calculateSensorSpectralQuadrature({
        colorSamplingProfile: colorProfile(),
        spectralResponseProfile: qeProfile(),
        channelId: "red",
        wavelengthBasis: "air",
        wavelengthRangeNanometers: {
          minimum: 400,
          maximum: 700
        },
        subdivisionsPerSegment: 0
      })
    ).toThrow("positive safe integer");

    expect(() =>
      calculateSensorSpectralQuadrature({
        colorSamplingProfile: colorProfile(),
        spectralResponseProfile: qeProfile(),
        channelId: "red",
        wavelengthBasis: "air",
        wavelengthRangeNanometers: {
          minimum: 400,
          maximum: 700
        },
        subdivisionsPerSegment: 50_001
      })
    ).toThrow("safety limit");
  });

  it("returns response and wavelength measure without integrating source values", () => {
    const result = calculateSensorSpectralQuadrature({
      colorSamplingProfile: colorProfile(),
      spectralResponseProfile: qeProfile(),
      channelId: "red",
      wavelengthBasis: "air",
      wavelengthRangeNanometers: {
        minimum: 400,
        maximum: 700
      },
      subdivisionsPerSegment: 2
    });

    expect(result.provenance.kind).toBe("approximation");
    expect(result.value.sourceSpectralValuesIncluded).toBe(false);
    expect(result.value.spectralIrradianceIncluded).toBe(false);
    expect(result.value.spectralPhotonIrradianceIncluded).toBe(false);
    expect(result.value.opticalTransmissionIncludedByQuadrature).toBe(false);
    expect(result.value.wavelengthIntegrationPerformed).toBe(false);
    expect(result.value.spatialIntegrationPerformed).toBe(false);
    expect(result.value.temporalIntegrationPerformed).toBe(false);
    expect(result.value.photonsCalculated).toBe(false);
    expect(result.value.electronsCalculated).toBe(false);
    expect(result.value.rawCodeValueProduced).toBe(false);
    expect(result.value.convergenceErrorEstimated).toBe(false);
  });
});
