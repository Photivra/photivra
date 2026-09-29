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
      maximumSubintervalWidthNanometers: 1_000
    });

    expect(
      result.value.segmentBoundariesNanometers
    ).toEqual([400, 410, 700]);
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

  it("bounds long response segments instead of assigning one node per knot interval", () => {
    const result = calculateSensorSpectralQuadrature({
      colorSamplingProfile: colorProfile(),
      spectralResponseProfile: qeProfile(),
      channelId: "red",
      wavelengthBasis: "air",
      wavelengthRangeNanometers: {
        minimum: 400,
        maximum: 700
      },
      maximumSubintervalWidthNanometers: 100
    });

    expect(result.value.totalNodeCount).toBe(4);
    expect(result.value.nodes.map(
      (node) => node.wavelengthMeasureNanometers
    )).toEqual([
      10,
      290 / 3,
      290 / 3,
      290 / 3
    ]);
    expect(result.value.nodes.every(
      (node) =>
        node.wavelengthMeasureNanometers <=
        100
    )).toBe(true);
  });

  it("adds ordered caller breakpoints without replacing response knots", () => {
    const result = calculateSensorSpectralQuadrature({
      colorSamplingProfile: colorProfile(),
      spectralResponseProfile: qeProfile(),
      channelId: "red",
      wavelengthBasis: "air",
      wavelengthRangeNanometers: {
        minimum: 400,
        maximum: 700
      },
      maximumSubintervalWidthNanometers: 1_000,
      additionalBreakpointsNanometers: [500]
    });

    expect(
      result.value.segmentBoundariesNanometers
    ).toEqual([400, 410, 500, 700]);
    expect(result.value.nodes.map(
      (node) => node.wavelengthNanometers
    )).toEqual([405, 455, 600]);
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
      maximumSubintervalWidthNanometers: 1_000
    });

    expect(
      result.value.segmentBoundariesNanometers
    ).toEqual([450, 500, 550, 600, 650]);
    expect(result.value.segmentCount).toBe(4);
    expect(result.value.nodes.map(
      (node) => node.wavelengthNanometers
    )).toEqual([475, 525, 575, 625]);
    expect(result.value.sourceResponseKind).toBe(
      "separable-channel-filter-and-detector-eqe"
    );
    expect(
      result.value.responseValuesIncluded
    ).toBe(false);
  });

  it("preserves response representation, scope, status, uncertainty, and provenance without applying response", () => {
    const result = calculateSensorSpectralQuadrature({
      colorSamplingProfile: colorProfile(),
      spectralResponseProfile: responsivityProfile(),
      channelId: "green-a",
      wavelengthBasis: "air",
      wavelengthRangeNanometers: {
        minimum: 450,
        maximum: 650
      },
      maximumSubintervalWidthNanometers: 50
    });

    expect(result.value.sourceResponseKind)
      .toBe("effective-spectral-responsivity");
    expect(result.value.responseScope)
      .toBe("sensor-package-incident-effective-channel-response");
    expect(result.value.wavelengthBasisResolved)
      .toBe(true);
    expect(result.value.responseScientificStatus)
      .toBe("approximation");
    expect(result.value.responseUncertainty)
      .toEqual({
        kind: "not-quantified",
        limitation: "test"
      });
    expect(
      result.value.componentEvidence.colorSamplingProfile
    ).toEqual(evidence("test:color"));
    expect(
      result.value.componentEvidence.profile
    ).toEqual(evidence("test:responsivity-profile"));
    expect(
      result.value.componentEvidence.channel
    ).toEqual(evidence("test:green-a"));
    expect(
      result.value.componentEvidence.curves
    ).toEqual([
      evidence("test:aw")
    ]);
    expect(result.value.totalNodeCount).toBe(4);
    expect(
      result.value.responseApplicationPerformed
    ).toBe(false);
  });

  it("fails closed on invalid/mismatched basis and out-of-range requests", () => {
    expect(() =>
      calculateSensorSpectralQuadrature({
        colorSamplingProfile: colorProfile(),
        spectralResponseProfile: qeProfile(),
        channelId: "red",
        wavelengthBasis: "invalid" as never,
        wavelengthRangeNanometers: {
          minimum: 400,
          maximum: 700
        },
        maximumSubintervalWidthNanometers: 10
      })
    ).toThrow("wavelengthBasis is invalid");

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
        maximumSubintervalWidthNanometers: 10
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
        maximumSubintervalWidthNanometers: 10
      })
    ).toThrow("usable spectral-response range");
  });

  it("rejects ambiguous additional breakpoint lists", () => {
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
        maximumSubintervalWidthNanometers: 10,
        additionalBreakpointsNanometers: [500, 450]
      })
    ).toThrow("strictly increasing");

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
        maximumSubintervalWidthNanometers: 10,
        additionalBreakpointsNanometers: [500, 500]
      })
    ).toThrow("strictly increasing");

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
        maximumSubintervalWidthNanometers: 10,
        additionalBreakpointsNanometers: [400]
      })
    ).toThrow("strictly inside");

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
        maximumSubintervalWidthNanometers: 10,
        additionalBreakpointsNanometers:
          new Array(100_000).fill(500)
      })
    ).toThrow("too many entries");
  });

  it("rejects invalid ranges, step widths, and oversized plans", () => {
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
        maximumSubintervalWidthNanometers: 10
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
        maximumSubintervalWidthNanometers: 0
      })
    ).toThrow("greater than zero");

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
        maximumSubintervalWidthNanometers: 0.001
      })
    ).toThrow("safety limit");
  });

  it("validates exact color-topology linkage once without evaluating response at every node", () => {
    const wrongColor: SensorColorSamplingProfile = {
      ...colorProfile(),
      profileId: "wrong"
    };

    expect(() =>
      calculateSensorSpectralQuadrature({
        colorSamplingProfile: wrongColor,
        spectralResponseProfile: qeProfile(),
        channelId: "red",
        wavelengthBasis: "air",
        wavelengthRangeNanometers: {
          minimum: 400,
          maximum: 700
        },
        maximumSubintervalWidthNanometers: 10
      })
    ).toThrow("must match");
  });

  it("is deterministic for identical inputs", () => {
    const input = {
      colorSamplingProfile: colorProfile(),
      spectralResponseProfile: qeProfile(),
      channelId: "red",
      wavelengthBasis: "air" as const,
      wavelengthRangeNanometers: {
        minimum: 405,
        maximum: 600
      },
      maximumSubintervalWidthNanometers: 25,
      additionalBreakpointsNanometers: [500]
    };

    expect(
      calculateSensorSpectralQuadrature(input)
    ).toEqual(
      calculateSensorSpectralQuadrature(input)
    );
  });

  it("labels the result as a continuous-density wavelength plan, not signal integration", () => {
    const result = calculateSensorSpectralQuadrature({
      colorSamplingProfile: colorProfile(),
      spectralResponseProfile: qeProfile(),
      channelId: "red",
      wavelengthBasis: "air",
      wavelengthRangeNanometers: {
        minimum: 400,
        maximum: 700
      },
      maximumSubintervalWidthNanometers: 20
    });

    expect(result.provenance.kind).toBe("approximation");
    expect(result.value.quadratureScheme).toBe(
      "response-breakpoint-aware-bounded-midpoint"
    );
    expect(result.value.responseValuesIncluded).toBe(false);
    expect(result.value.responseApplicationPerformed).toBe(false);
    expect(result.value.sourceSpectralValuesIncluded).toBe(false);
    expect(result.value.spectralIrradianceIncluded).toBe(false);
    expect(result.value.spectralPhotonIrradianceIncluded).toBe(false);
    expect(result.value.commonSpectralCoverageValidated).toBe(false);
    expect(result.value.continuousSpectralDensityQuadratureOnly).toBe(true);
    expect(result.value.discreteLineSpectrumIncluded).toBe(false);
    expect(result.value.opticalTransmissionIncludedByQuadrature).toBe(false);
    expect(result.value.wavelengthIntegrationPerformed).toBe(false);
    expect(result.value.spatialIntegrationPerformed).toBe(false);
    expect(result.value.temporalIntegrationPerformed).toBe(false);
    expect(result.value.photonsCalculated).toBe(false);
    expect(result.value.electronsCalculated).toBe(false);
    expect(result.value.rawCodeValueProduced).toBe(false);
    expect(result.value.convergenceErrorEstimated).toBe(false);
    expect(result.provenance.assumptions).toEqual(
      expect.arrayContaining([
        expect.stringContaining("d-lambda"),
        expect.stringContaining("different physical representations"),
        expect.stringContaining("Discrete/delta-like line spectra"),
        expect.stringContaining("does not prove convergence")
      ])
    );
  });
});
