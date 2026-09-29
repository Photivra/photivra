import { describe, expect, it } from "vitest";

import {
  assessSensorResponseApplicationCompatibility,
  assessSensorResponseOperatingRange,
  calculateSensorEqeElectronRate,
  calculateSensorSpectralQuadrature,
  reduceSensorSpatioSpectralIrradiance,
  type SensorColorSamplingProfile,
  type SensorResponseApplicationProfile,
  type SensorResponseOperatingRangeProfile,
  type SensorSpectralResponseProfile,
  type SensorSpatioSpectralIrradianceSample,
  type SourcedAirPhaseRefractiveIndex
} from "../src/index.js";
import {
  makeQuadrature
} from "./helpers/spatial-sample-fixture.js";

const evidence = (ref: string) =>
  [{
    sourceOrigin: "photivra" as const,
    sourceReference: ref,
    reuseStatus: "photivra-owned" as const
  }] as const;

const operatingConditions = {
  temperatureC: 25,
  incidenceAngleDegreesFromNormal: 0,
  polarization: "unpolarized" as const
};

function colorProfile(): SensorColorSamplingProfile {
  return {
    schemaVersion: "0.1.0",
    profileId: "bayer-like",
    evidence: evidence("test:color"),
    coordinateSystem:
      "native-sensor-color-sampling-site-index",
    layout: {
      kind: "periodic-mosaic",
      repeatWidthSites: 2,
      repeatHeightSites: 2,
      siteChannelIds: [
        "red",
        "green",
        "green",
        "blue"
      ],
      anchor:
        "native-sensor-top-left-site"
    }
  };
}

function spectralProfile(
  kind:
    | "direct-eqe"
    | "separable-eqe"
    | "responsivity" = "direct-eqe",
  wavelengthBasis:
    "air" | "vacuum" = "vacuum",
  curveEvidenceReference =
    "test:response-curve"
): SensorSpectralResponseProfile {
  const common = {
    channelId: "green",
    scientificStatus:
      "calibrated" as const,
    uncertainty: {
      kind: "relative" as const,
      fraction: 0.02,
      basis: "test"
    },
    evidence: evidence(
      "test:response-channel"
    ),
    referenceConditions:
      operatingConditions,
    conditionDependence:
      "not-modeled" as const
  };

  return {
    schemaVersion: "0.1.0",
    profileId: "spectral",
    colorSamplingProfileId:
      "bayer-like",
    evidence: evidence(
      "test:response-profile"
    ),
    channels: [
      kind === "direct-eqe"
        ? {
            ...common,
            kind:
              "effective-external-quantum-efficiency",
            responseScope:
              "site-incident-effective-channel-response",
            externalQuantumEfficiency: {
              wavelengthUnit:
                "nm",
              wavelengthBasis,
              interpolation:
                "piecewise-linear",
              outsideRangeBehavior:
                "fail-closed",
              evidence: evidence(
                curveEvidenceReference
              ),
              samples: [
                {
                  wavelengthNanometers:
                    400,
                  value: 0.2
                },
                {
                  wavelengthNanometers:
                    500,
                  value: 0.6
                }
              ]
            }
          }
        : kind ===
            "separable-eqe"
          ? {
              ...common,
              kind:
                "separable-channel-filter-and-detector-eqe",
              responseScope:
                "site-incident-channel-filter-times-detector-eqe",
              combinationRule:
                "multiply",
              channelFilterTransmittance:
                {
                  wavelengthUnit:
                    "nm",
                  wavelengthBasis,
                  interpolation:
                    "piecewise-linear",
                  outsideRangeBehavior:
                    "fail-closed",
                  evidence:
                    evidence(
                      curveEvidenceReference +
                        ":filter"
                    ),
                  samples: [
                    {
                      wavelengthNanometers:
                        400,
                      value: 0.5
                    },
                    {
                      wavelengthNanometers:
                        500,
                      value: 0.5
                    }
                  ]
                },
              detectorExternalQuantumEfficiency:
                {
                  wavelengthUnit:
                    "nm",
                  wavelengthBasis,
                  interpolation:
                    "piecewise-linear",
                  outsideRangeBehavior:
                    "fail-closed",
                  evidence:
                    evidence(
                      curveEvidenceReference +
                        ":detector"
                    ),
                  samples: [
                    {
                      wavelengthNanometers:
                        400,
                      value: 0.4
                    },
                    {
                      wavelengthNanometers:
                        500,
                      value: 0.8
                    }
                  ]
                }
            }
          : {
              ...common,
              kind:
                "effective-spectral-responsivity",
              responseScope:
                "site-incident-effective-channel-response",
              spectralResponsivity: {
                wavelengthUnit:
                  "nm",
                wavelengthBasis,
                interpolation:
                  "piecewise-linear",
                outsideRangeBehavior:
                  "fail-closed",
                evidence: evidence(
                  curveEvidenceReference
                ),
                samples: [
                  {
                    wavelengthNanometers:
                      400,
                    amperesPerWatt:
                      0.2
                  },
                  {
                    wavelengthNanometers:
                      500,
                    amperesPerWatt:
                      0.4
                  }
                ]
              }
            }
    ]
  };
}

function applicationProfile(): SensorResponseApplicationProfile {
  return {
    schemaVersion: "0.1.0",
    profileId: "application",
    spectralResponseProfileId:
      "spectral",
    colorSamplingProfileId:
      "bayer-like",
    channelId: "green",
    samplingApertureProfileId:
      "sampling",
    opticalStackProfileId:
      "absent-aa",
    evidence: evidence(
      "test:application"
    ),
    incidentAreaBasis: {
      kind:
        "geometric-sensitive-aperture",
      areaSquareMicrometers:
        480_000
    },
    spatialResponseModel: {
      kind:
        "uniform-over-geometric-sensitive-aperture",
      scientificStatus:
        "calibrated",
      evidence: evidence(
        "test:spatial-response"
      )
    },
    referenceConditionPolicy: {
      kind: "exact-match-required"
    }
  };
}

function operatingProfile(
  wavelengthBasis:
    "air" | "vacuum" = "vacuum",
  spatialEstablished = true
): SensorResponseOperatingRangeProfile {
  return {
    schemaVersion: "0.1.0",
    profileId: "linearity",
    responseApplicationProfileId:
      "application",
    spectralResponseProfileId:
      "spectral",
    colorSamplingProfileId:
      "bayer-like",
    channelId: "green",
    scientificStatus:
      "calibrated",
    uncertainty: {
      kind: "relative",
      fraction: 0.01,
      basis: "test"
    },
    evidence: evidence(
      "test:linearity"
    ),
    inputRange: {
      kind:
        "wavelength-integrated-geometric-aperture-radiant-power",
      unit: "W",
      minimumInclusive: 1e-8,
      maximumInclusive: 1e-3
    },
    wavelengthApplicability: {
      wavelengthBasis,
      minimumNanometers: 380,
      maximumNanometers: 720,
      containment:
        "requested-range-must-be-contained"
    },
    linearityCriterion: {
      maximumAbsoluteRelativeDeviation:
        0.01
    },
    spatialLinearityModel:
      spatialEstablished
        ? {
            kind:
              "linear-superposition-over-geometric-aperture",
            scientificStatus:
              "calibrated",
            evidence: evidence(
              "test:spatial-linearity"
            )
          }
        : {
            kind:
              "not-established",
            limitation:
              "No sub-aperture superposition evidence."
          },
    spectralInputModel: {
      kind: "per-spectral-bin",
      maximumBinWidthNanometers:
        100,
      scientificStatus:
        "calibrated",
      evidence: evidence(
        "test:spectral-input-linearity"
      )
    },
    referenceConditions:
      operatingConditions,
    referenceConditionPolicy: {
      kind: "exact-match-required"
    }
  };
}

function buildPipeline(
  kind:
    | "direct-eqe"
    | "separable-eqe"
    | "responsivity" = "direct-eqe",
  wavelengthBasis:
    "air" | "vacuum" = "vacuum",
  maximumSubintervalWidthNanometers =
    100,
  spatialEstablished = true
): {
  reduction: ReturnType<
    typeof reduceSensorSpatioSpectralIrradiance
  >["value"];
  compatibility: ReturnType<
    typeof assessSensorResponseApplicationCompatibility
  >["value"];
  operatingRange: ReturnType<
    typeof assessSensorResponseOperatingRange
  >["value"];
  responseProfile:
    SensorSpectralResponseProfile;
} {
  const spatial =
    makeQuadrature().value;
  const responseProfile =
    spectralProfile(
      kind,
      wavelengthBasis
    );
  const spectral =
    calculateSensorSpectralQuadrature({
      colorSamplingProfile:
        colorProfile(),
      spectralResponseProfile:
        responseProfile,
      channelId: "green",
      wavelengthBasis,
      wavelengthRangeNanometers: {
        minimum: 400,
        maximum: 500
      },
      maximumSubintervalWidthNanometers
    }).value;

  const sampleValues:
    SensorSpatioSpectralIrradianceSample[] =
      spectral.nodes.flatMap(
        (spectralNode) =>
          spatial.nodes.map(
            (spatialNode) => ({
              node: {
                spatialNode: {
                  antiAliasingComponentIndex:
                    spatialNode
                      .antiAliasingComponentIndex,
                  apertureSampleXIndex:
                    spatialNode
                      .apertureSampleXIndex,
                  apertureSampleYIndex:
                    spatialNode
                      .apertureSampleYIndex
                },
                spectralSampleIndex:
                  spectralNode
                    .spectralSampleIndex,
                wavelengthNanometers:
                  spectralNode
                    .wavelengthNanometers
              },
              spectralIrradianceWattsPerSquareMeterPerNanometer:
                2
            })
          )
      );

  const reduction =
    reduceSensorSpatioSpectralIrradiance({
      spatialQuadrature: spatial,
      spectralQuadrature:
        spectral,
      sampleValues
    }).value;

  const compatibility =
    assessSensorResponseApplicationCompatibility({
      reduction,
      applicationProfile:
        applicationProfile(),
      sourcePlane: {
        value: "site-incident",
        evidence: evidence(
          "test:site-plane"
        )
      },
      operatingConditions
    }).value;

  const operatingRange =
    assessSensorResponseOperatingRange({
      reduction,
      compatibility,
      operatingRangeProfile:
        operatingProfile(
          wavelengthBasis,
          spatialEstablished
        )
    }).value;

  return {
    reduction,
    compatibility,
    operatingRange,
    responseProfile
  };
}

describe(
  "sensor EQE electron-rate conversion",
  () => {
    it("converts per-node vacuum spectral power to photon and expected electron rates", () => {
      const pipeline =
        buildPipeline();
      const result =
        calculateSensorEqeElectronRate({
          reduction:
            pipeline.reduction,
          compatibility:
            pipeline.compatibility,
          operatingRange:
            pipeline.operatingRange,
          colorSamplingProfile:
            colorProfile(),
          spectralResponseProfile:
            pipeline.responseProfile
        });

      const node =
        result.value.perWavelength[0]!;
      const expectedPower =
        2 *
        480_000 *
        1e-12 *
        100;
      const expectedPhotonEnergy =
        6.62607015e-34 *
        299_792_458 /
        (450e-9);
      const expectedPhotonRate =
        expectedPower /
        expectedPhotonEnergy;
      const expectedElectronRate =
        expectedPhotonRate * 0.4;

      expect(
        node.radiantPowerContributionWatts
      ).toBeCloseTo(
        expectedPower,
        15
      );
      expect(
        node.photonEnergyJoules /
          expectedPhotonEnergy
      ).toBeCloseTo(1, 14);
      expect(
        node.incidentPhotonRatePerSecond /
          expectedPhotonRate
      ).toBeCloseTo(1, 12);
      expect(
        node.effectiveExternalQuantumEfficiency
      ).toBeCloseTo(0.4, 12);
      expect(
        node.expectedGeneratedElectronRatePerSecond /
          expectedElectronRate
      ).toBeCloseTo(1, 12);
      expect(
        result.value
          .incidentPhotonRatePerSecond /
          expectedPhotonRate
      ).toBeCloseTo(1, 12);
      expect(
        result.value
          .expectedGeneratedElectronRatePerSecond /
          expectedElectronRate
      ).toBeCloseTo(1, 12);
      expect(
        result.value
          .summationMethod
      ).toBe("kahan-compensated");
    });

    it("uses the existing resolver for separable filter times detector EQE", () => {
      const pipeline =
        buildPipeline(
          "separable-eqe"
        );
      const result =
        calculateSensorEqeElectronRate({
          reduction:
            pipeline.reduction,
          compatibility:
            pipeline.compatibility,
          operatingRange:
            pipeline.operatingRange,
          colorSamplingProfile:
            colorProfile(),
          spectralResponseProfile:
            pipeline.responseProfile
        }).value;

      const node =
        result.perWavelength[0]!;
      expect(
        node.responseComposition
      ).toBe(
        "channel-filter-transmittance-times-detector-eqe"
      );
      expect(
        node.channelFilterTransmittance
      ).toBeCloseTo(0.5, 12);
      expect(
        node.detectorExternalQuantumEfficiency
      ).toBeCloseTo(0.6, 12);
      expect(
        node.effectiveExternalQuantumEfficiency
      ).toBeCloseTo(0.3, 12);
      expect(
        result
          .channelFilterTransmissionApplied
      ).toBe(true);
    });

    it("supports air-basis nodes only with exact per-node phase-index data", () => {
      const pipeline =
        buildPipeline(
          "direct-eqe",
          "air"
        );
      const result =
        calculateSensorEqeElectronRate({
          reduction:
            pipeline.reduction,
          compatibility:
            pipeline.compatibility,
          operatingRange:
            pipeline.operatingRange,
          colorSamplingProfile:
            colorProfile(),
          spectralResponseProfile:
            pipeline.responseProfile,
          airPhotonEnergyContext: {
            samples: [{
              spectralSampleIndex: 0,
              refractiveIndex: {
                wavelengthNanometers:
                  450,
                wavelengthBasis:
                  "air",
                definition:
                  "vacuum-wavelength-divided-by-air-wavelength",
                phaseRefractiveIndex:
                  1.00027,
                scientificStatus:
                  "calibrated",
                uncertainty: {
                  kind: "relative",
                  fraction: 1e-7,
                  basis: "test"
                },
                evidence: evidence(
                  "test:air-index"
                ),
                referenceConditions: {
                  temperatureC: 20,
                  pressurePascal:
                    101_325
                }
              }
            }],
            operatingConditions: {
              temperatureC: 20,
              pressurePascal:
                101_325
            },
            conditionPolicy: {
              kind:
                "exact-match-required"
            }
          }
        }).value;

      expect(
        result.perWavelength[0]
          ?.vacuumWavelengthNanometers
      ).toBeCloseTo(
        450 * 1.00027,
        12
      );
      expect(
        result.perWavelength[0]
          ?.airConditionCompatibility
      ).toBe("exact-match");
    });

    it("rejects A/W responsivity before any rate conversion", () => {
      const pipeline =
        buildPipeline(
          "responsivity"
        );

      expect(() =>
        calculateSensorEqeElectronRate({
          reduction:
            pipeline.reduction,
          compatibility:
            pipeline.compatibility,
          operatingRange:
            pipeline.operatingRange,
          colorSamplingProfile:
            colorProfile(),
          spectralResponseProfile:
            pipeline.responseProfile
        })
      ).toThrow(
        "photon-rate-to-electrons"
      );
    });

    it("rejects an operating-range assessment that lacks spatial superposition authorization", () => {
      const pipeline =
        buildPipeline(
          "direct-eqe",
          "vacuum",
          100,
          false
        );

      expect(
        pipeline.operatingRange
          .responseRateConversionAuthorized
      ).toBe(false);
      expect(() =>
        calculateSensorEqeElectronRate({
          reduction:
            pipeline.reduction,
          compatibility:
            pipeline.compatibility,
          operatingRange:
            pipeline.operatingRange,
          colorSamplingProfile:
            colorProfile(),
          spectralResponseProfile:
            pipeline.responseProfile
        })
      ).toThrow(
        "authorize a clean"
      );
    });

    it("binds response calibration evidence, not only profile IDs", () => {
      const pipeline =
        buildPipeline();

      expect(() =>
        calculateSensorEqeElectronRate({
          reduction:
            pipeline.reduction,
          compatibility:
            pipeline.compatibility,
          operatingRange:
            pipeline.operatingRange,
          colorSamplingProfile:
            colorProfile(),
          spectralResponseProfile:
            spectralProfile(
              "direct-eqe",
              "vacuum",
              "test:different-curve-evidence"
            )
        })
      ).toThrow(
        "response-channel binding"
      );
    });

    it("rejects numeric EQE calibration drift even when IDs and evidence are unchanged", () => {
      const pipeline =
        buildPipeline();
      const original =
        spectralProfile();
      const channel =
        original.channels[0]!;
      if (
        channel.kind !==
        "effective-external-quantum-efficiency"
      ) {
        throw new Error(
          "test fixture must be direct EQE"
        );
      }
      const drifted = {
        ...original,
        channels: [{
          ...channel,
          externalQuantumEfficiency: {
            ...channel
              .externalQuantumEfficiency,
            samples: [
              {
                wavelengthNanometers:
                  400,
                value: 0.25
              },
              {
                wavelengthNanometers:
                  500,
                value: 0.65
              }
            ]
          }
        }]
      } as SensorSpectralResponseProfile;

      expect(() =>
        calculateSensorEqeElectronRate({
          reduction:
            pipeline.reduction,
          compatibility:
            pipeline.compatibility,
          operatingRange:
            pipeline.operatingRange,
          colorSamplingProfile:
            colorProfile(),
          spectralResponseProfile:
            drifted
        })
      ).toThrow(
        "response-channel binding"
      );
    });

    it("rejects missing air phase-index samples", () => {
      const pipeline =
        buildPipeline(
          "direct-eqe",
          "air"
        );

      expect(() =>
        calculateSensorEqeElectronRate({
          reduction:
            pipeline.reduction,
          compatibility:
            pipeline.compatibility,
          operatingRange:
            pipeline.operatingRange,
          colorSamplingProfile:
            colorProfile(),
          spectralResponseProfile:
            pipeline.responseProfile
        })
      ).toThrow(
        "exactly one refractive-index sample"
      );
    });

    it("rejects mutated per-wavelength radiant-power contributions", () => {
      const pipeline =
        buildPipeline();
      const mutated = {
        ...pipeline.reduction,
        perWavelength:
          pipeline.reduction
            .perWavelength.map(
              (node, index) =>
                index === 0
                  ? {
                      ...node,
                      wavelengthIntegratedGeometricApertureIncidentFluxContributionWatts:
                        node
                          .wavelengthIntegratedGeometricApertureIncidentFluxContributionWatts *
                        2
                    }
                  : node
            )
      };

      expect(() =>
        calculateSensorEqeElectronRate({
          reduction: mutated,
          compatibility:
            pipeline.compatibility,
          operatingRange:
            pipeline.operatingRange,
          colorSamplingProfile:
            colorProfile(),
          spectralResponseProfile:
            pipeline.responseProfile
        })
      ).toThrow(
        "must equal spectral flux density"
      );
    });

    it("rejects A/W response even if an external authorization snapshot is forged to the EQE path", () => {
      const pipeline =
        buildPipeline(
          "responsivity"
        );
      const compatibility = {
        ...pipeline.compatibility,
        requiredSignalPath:
          "photon-rate-to-electrons" as const
      };
      const operatingRange = {
        ...pipeline.operatingRange,
        requiredSignalPath:
          "photon-rate-to-electrons" as const
      };

      expect(() =>
        calculateSensorEqeElectronRate({
          reduction:
            pipeline.reduction,
          compatibility,
          operatingRange,
          colorSamplingProfile:
            colorProfile(),
          spectralResponseProfile:
            pipeline.responseProfile
        })
      ).toThrow(
        "not A/W responsivity"
      );
    });

    it("fails closed when a wavelength-node photon-rate calculation overflows", () => {
      const pipeline =
        buildPipeline();
      const node =
        pipeline.reduction
          .perWavelength[0]!;
      const hugeContribution =
        Number.MAX_VALUE;
      const hugeFluxDensity =
        hugeContribution /
        node.wavelengthMeasureNanometers;
      const reduction = {
        ...pipeline.reduction,
        perWavelength: [{
          ...node,
          geometricApertureIncidentSpectralFluxWattsPerNanometer:
            hugeFluxDensity,
          wavelengthIntegratedGeometricApertureIncidentFluxContributionWatts:
            hugeContribution
        }],
        wavelengthIntegratedGeometricApertureIncidentFluxWatts:
          hugeContribution
      };
      const operatingRange = {
        ...pipeline.operatingRange,
        inputRange: {
          ...pipeline.operatingRange
            .inputRange,
          minimumInclusive: 0,
          maximumInclusive:
            Number.MAX_VALUE
        },
        evaluatedInput: {
          ...pipeline.operatingRange
            .evaluatedInput,
          value: hugeContribution
        },
        evaluatedSpectralNodeInputs: [{
          ...pipeline.operatingRange
            .evaluatedSpectralNodeInputs![0]!,
          value: hugeContribution
        }]
      };

      expect(() =>
        calculateSensorEqeElectronRate({
          reduction,
          compatibility:
            pipeline.compatibility,
          operatingRange,
          colorSamplingProfile:
            colorProfile(),
          spectralResponseProfile:
            pipeline.responseProfile
        })
      ).toThrow(
        "rate calculation must remain finite"
      );
    });

    it("fails closed when finite wavelength-node rates overflow only in the total sum", () => {
      const pipeline =
        buildPipeline(
          "direct-eqe",
          "vacuum",
          50
        );
      const contribution =
        4e289;
      const reduction = {
        ...pipeline.reduction,
        perWavelength:
          pipeline.reduction
            .perWavelength.map(
              (node) => ({
                ...node,
                geometricApertureIncidentSpectralFluxWattsPerNanometer:
                  contribution /
                  node
                    .wavelengthMeasureNanometers,
                wavelengthIntegratedGeometricApertureIncidentFluxContributionWatts:
                  contribution
              })
            ),
        wavelengthIntegratedGeometricApertureIncidentFluxWatts:
          contribution * 2
      };
      const operatingRange = {
        ...pipeline.operatingRange,
        inputRange: {
          ...pipeline.operatingRange
            .inputRange,
          minimumInclusive: 0,
          maximumInclusive: 1e300
        },
        evaluatedInput: {
          ...pipeline.operatingRange
            .evaluatedInput,
          value: contribution * 2
        },
        evaluatedSpectralNodeInputs:
          pipeline.operatingRange
            .evaluatedSpectralNodeInputs!
            .map((entry) => ({
              ...entry,
              value: contribution
            }))
      };

      expect(() =>
        calculateSensorEqeElectronRate({
          reduction,
          compatibility:
            pipeline.compatibility,
          operatingRange,
          colorSamplingProfile:
            colorProfile(),
          spectralResponseProfile:
            pipeline.responseProfile
        })
      ).toThrow(
        "Total EQE photon/electron rates must remain finite"
      );
    });

    it("keeps exposure, counts, saturation, noise, current and RAW downstream", () => {
      const pipeline =
        buildPipeline();
      const result =
        calculateSensorEqeElectronRate({
          reduction:
            pipeline.reduction,
          compatibility:
            pipeline.compatibility,
          operatingRange:
            pipeline.operatingRange,
          colorSamplingProfile:
            colorProfile(),
          spectralResponseProfile:
            pipeline.responseProfile
        });

      expect(
        result.provenance.kind
      ).toBe("approximation");
      expect(
        result.value
          .responseApplicationPerformed
      ).toBe(true);
      expect(
        result.value
          .quantumEfficiencyApplied
      ).toBe(true);
      expect(
        result.value
          .photonRateCalculated
      ).toBe(true);
      expect(
        result.value
          .electronRateCalculated
      ).toBe(true);
      expect(
        result.value
          .photonCountCalculated
      ).toBe(false);
      expect(
        result.value
          .electronCountCalculated
      ).toBe(false);
      expect(
        result.value
          .temporalIntegrationApplied
      ).toBe(false);
      expect(
        result.value
          .saturationAssessed
      ).toBe(false);
      expect(
        result.value
          .shotNoiseApplied
      ).toBe(false);
      expect(
        result.value
          .currentCalculated
      ).toBe(false);
      expect(
        result.value
          .rawCodeValueProduced
      ).toBe(false);
      expect(
        result.value
          .responseUncertaintyPropagated
      ).toBe(false);
      expect(
        result.value
          .photonEnergyUncertaintyPropagated
      ).toBe(false);
    });

    it("uses multiple spectral nodes without collapsing to broadband-average QE", () => {
      const pipeline =
        buildPipeline(
          "direct-eqe",
          "vacuum",
          50
        );
      const result =
        calculateSensorEqeElectronRate({
          reduction:
            pipeline.reduction,
          compatibility:
            pipeline.compatibility,
          operatingRange:
            pipeline.operatingRange,
          colorSamplingProfile:
            colorProfile(),
          spectralResponseProfile:
            pipeline.responseProfile
        }).value;

      expect(
        result.spectralNodeCount
      ).toBe(2);
      expect(
        result.perWavelength.map(
          (node) =>
            node
              .effectiveExternalQuantumEfficiency
        )
      ).toEqual([
        0.3,
        0.5
      ]);
      expect(
        result.perWavelength.every(
          (node) =>
            node.radiantPowerContributionWatts >
            0
        )
      ).toBe(true);
    });

    it("rejects stale per-bin operating-range authorization", () => {
      const pipeline =
        buildPipeline();

      const evaluated =
        pipeline.operatingRange
          .evaluatedSpectralNodeInputs;
      expect(evaluated).toBeDefined();

      const staleValue = {
        ...pipeline.operatingRange,
        evaluatedSpectralNodeInputs:
          evaluated!.map(
            (entry, index) =>
              index === 0
                ? {
                    ...entry,
                    value:
                      entry.value * 2
                  }
                : entry
          )
      };

      expect(() =>
        calculateSensorEqeElectronRate({
          reduction:
            pipeline.reduction,
          compatibility:
            pipeline.compatibility,
          operatingRange:
            staleValue,
          colorSamplingProfile:
            colorProfile(),
          spectralResponseProfile:
            pipeline.responseProfile
        })
      ).toThrow(
        "spectral-node values must match"
      );

      const staleRange = {
        ...pipeline.operatingRange,
        evaluatedWavelengthRangeNanometers:
          {
            minimum: 410,
            maximum: 500
          }
      };

      expect(() =>
        calculateSensorEqeElectronRate({
          reduction:
            pipeline.reduction,
          compatibility:
            pipeline.compatibility,
          operatingRange:
            staleRange,
          colorSamplingProfile:
            colorProfile(),
          spectralResponseProfile:
            pipeline.responseProfile
        })
      ).toThrow(
        "wavelength range must exactly match"
      );
    });

    it("rejects malformed reduction spectral-node identity", () => {
      const pipeline =
        buildPipeline();

      expect(() =>
        calculateSensorEqeElectronRate({
          reduction: {
            ...pipeline.reduction,
            spectralNodeCount: 2
          },
          compatibility:
            pipeline.compatibility,
          operatingRange:
            pipeline.operatingRange,
          colorSamplingProfile:
            colorProfile(),
          spectralResponseProfile:
            pipeline.responseProfile
        })
      ).toThrow(
        "exactly spectralNodeCount entries"
      );

      expect(() =>
        calculateSensorEqeElectronRate({
          reduction: {
            ...pipeline.reduction,
            perWavelength:
              pipeline.reduction
                .perWavelength.map(
                  (entry) => ({
                    ...entry,
                    spectralSampleIndex:
                      1
                  })
                )
          },
          compatibility:
            pipeline.compatibility,
          operatingRange:
            pipeline.operatingRange,
          colorSamplingProfile:
            colorProfile(),
          spectralResponseProfile:
            pipeline.responseProfile
        })
      ).toThrow(
        "exact contiguous range"
      );
    });

    it("rejects air context on vacuum data and duplicate air sample identities", () => {
      const vacuum =
        buildPipeline();

      expect(() =>
        calculateSensorEqeElectronRate({
          reduction:
            vacuum.reduction,
          compatibility:
            vacuum.compatibility,
          operatingRange:
            vacuum.operatingRange,
          colorSamplingProfile:
            colorProfile(),
          spectralResponseProfile:
            vacuum.responseProfile,
          airPhotonEnergyContext: {
            samples: [],
            conditionPolicy: {
              kind:
                "assume-compatible",
              limitation:
                "invalid for vacuum",
              evidence:
                evidence("bad")
            }
          }
        })
      ).toThrow(
        "must be omitted for vacuum"
      );

      const air =
        buildPipeline(
          "direct-eqe",
          "air",
          50
        );
      const indexSample = (
        spectralSampleIndex: number,
        wavelengthNanometers: number
      ): {
        spectralSampleIndex: number;
        refractiveIndex:
          SourcedAirPhaseRefractiveIndex;
      } => ({
        spectralSampleIndex,
        refractiveIndex: {
          wavelengthNanometers,
          wavelengthBasis:
            "air" as const,
          definition:
            "vacuum-wavelength-divided-by-air-wavelength" as const,
          phaseRefractiveIndex:
            1.00027,
          scientificStatus:
            "approximation" as const,
          uncertainty: {
            kind:
              "not-quantified" as const,
            limitation:
              "test"
          },
          evidence:
            evidence("air-index")
        }
      });

      expect(() =>
        calculateSensorEqeElectronRate({
          reduction:
            air.reduction,
          compatibility:
            air.compatibility,
          operatingRange:
            air.operatingRange,
          colorSamplingProfile:
            colorProfile(),
          spectralResponseProfile:
            air.responseProfile,
          airPhotonEnergyContext: {
            samples: [
              indexSample(0, 425),
              indexSample(0, 475)
            ],
            conditionPolicy: {
              kind:
                "assume-compatible",
              limitation:
                "test",
              evidence:
                evidence("air-policy")
            }
          }
        })
      ).toThrow(
        "unique in-range spectral sample identities"
      );
    });

    it("rejects response uncertainty and profile identity drift", () => {
      const pipeline =
        buildPipeline();
      const changed =
        spectralProfile();
      const channel =
        changed.channels[0]!;
      const changedResponse = {
        ...changed,
        channels: [{
          ...channel,
          uncertainty: {
            kind:
              "relative" as const,
            fraction: 0.03,
            basis: "different"
          }
        }]
      } as SensorSpectralResponseProfile;

      expect(() =>
        calculateSensorEqeElectronRate({
          reduction:
            pipeline.reduction,
          compatibility:
            pipeline.compatibility,
          operatingRange:
            pipeline.operatingRange,
          colorSamplingProfile:
            colorProfile(),
          spectralResponseProfile:
            changedResponse
        })
      ).toThrow(
        "response-channel binding"
      );

      expect(() =>
        calculateSensorEqeElectronRate({
          reduction:
            pipeline.reduction,
          compatibility:
            pipeline.compatibility,
          operatingRange:
            pipeline.operatingRange,
          colorSamplingProfile: {
            ...colorProfile(),
            profileId:
              "different-color"
          },
          spectralResponseProfile:
            pipeline.responseProfile
        })
      ).toThrow(
        "profiles must exactly match"
      );
    });

  }
);
