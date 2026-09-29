import { describe, expect, it } from "vitest";

import {
  assessSensorResponseApplicationCompatibility,
  assessSensorResponseOperatingRange,
  calculateSensorResponsivityPhotocurrent,
  calculateSensorSpectralQuadrature,
  parseSensorResponsivityElectricalApplicabilityProfile,
  reduceSensorSpatioSpectralIrradiance,
  type SensorColorSamplingProfile,
  type SensorResponseApplicationProfile,
  type SensorResponseOperatingRangeProfile,
  type SensorResponsivityElectricalApplicabilityProfile,
  type SensorSpectralResponseProfile,
  type SensorSpatioSpectralIrradianceSample
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

const opticalConditions = {
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

function responseProfile(
  kind:
    | "responsivity"
    | "eqe" = "responsivity",
  curveEvidence =
    "test:responsivity-curve",
  responsivityValues:
    readonly [number, number] =
      [0.2, 0.4]
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
    evidence:
      evidence("test:response-channel"),
    referenceConditions:
      opticalConditions,
    conditionDependence:
      "not-modeled" as const
  };

  return {
    schemaVersion: "0.1.0",
    profileId: "spectral",
    colorSamplingProfileId:
      "bayer-like",
    evidence:
      evidence("test:response-profile"),
    channels: [
      kind === "responsivity"
        ? {
            ...common,
            kind:
              "effective-spectral-responsivity",
            responseScope:
              "site-incident-effective-channel-response",
            spectralResponsivity: {
              wavelengthUnit: "nm",
              wavelengthBasis:
                "vacuum",
              interpolation:
                "piecewise-linear",
              outsideRangeBehavior:
                "fail-closed",
              evidence:
                evidence(curveEvidence),
              samples: [
                {
                  wavelengthNanometers:
                    400,
                  amperesPerWatt:
                    responsivityValues[0]
                },
                {
                  wavelengthNanometers:
                    500,
                  amperesPerWatt:
                    responsivityValues[1]
                }
              ]
            }
          }
        : {
            ...common,
            kind:
              "effective-external-quantum-efficiency",
            responseScope:
              "site-incident-effective-channel-response",
            externalQuantumEfficiency: {
              wavelengthUnit: "nm",
              wavelengthBasis:
                "vacuum",
              interpolation:
                "piecewise-linear",
              outsideRangeBehavior:
                "fail-closed",
              evidence:
                evidence(curveEvidence),
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
    ]
  };
}

function applicationProfile():
SensorResponseApplicationProfile {
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
    evidence:
      evidence("test:application"),
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
      evidence:
        evidence("test:uniformity")
    },
    referenceConditionPolicy: {
      kind: "exact-match-required"
    }
  };
}

function operatingProfile(
  maximumBinWidthNanometers = 100
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
    evidence:
      evidence("test:linearity"),
    inputRange: {
      kind:
        "wavelength-integrated-geometric-aperture-radiant-power",
      unit: "W",
      minimumInclusive: 1e-8,
      maximumInclusive: 1e-2
    },
    wavelengthApplicability: {
      wavelengthBasis:
        "vacuum",
      minimumNanometers: 380,
      maximumNanometers: 720,
      containment:
        "requested-range-must-be-contained"
    },
    linearityCriterion: {
      maximumAbsoluteRelativeDeviation:
        0.01
    },
    spatialLinearityModel: {
      kind:
        "linear-superposition-over-geometric-aperture",
      scientificStatus:
        "calibrated",
      evidence:
        evidence("test:spatial-linearity")
    },
    spectralInputModel: {
      kind: "per-spectral-bin",
      maximumBinWidthNanometers,
      scientificStatus:
        "calibrated",
      evidence:
        evidence("test:spectral-linearity")
    },
    referenceConditions:
      opticalConditions,
    referenceConditionPolicy: {
      kind: "exact-match-required"
    }
  };
}

function electricalProfile(
  overrides:
    Partial<SensorResponsivityElectricalApplicabilityProfile> = {}
): SensorResponsivityElectricalApplicabilityProfile {
  return {
    schemaVersion: "0.1.0",
    profileId:
      "responsivity-electrical",
    responseApplicationProfileId:
      "application",
    spectralResponseProfileId:
      "spectral",
    colorSamplingProfileId:
      "bayer-like",
    channelId: "green",
    outputMeaning:
      "detector-terminal-photocurrent-magnitude",
    referenceConditions: {
      bias: {
        kind:
          "zero-bias-photovoltaic"
      },
      readoutLoad: {
        kind:
          "virtual-ground-current-readout"
      }
    },
    conditionPolicy: {
      kind:
        "exact-match-required"
    },
    scientificStatus:
      "calibrated",
    uncertainty: {
      kind: "relative",
      fraction: 0.01,
      basis:
        "electrical applicability test"
    },
    evidence:
      evidence("test:electrical"),
    ...overrides
  };
}

function buildPipeline(
  kind:
    | "responsivity"
    | "eqe" = "responsivity",
  maximumSubintervalWidthNanometers =
    100,
  responsivityValues:
    readonly [number, number] =
      [0.2, 0.4]
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
  spectralResponseProfile:
    SensorSpectralResponseProfile;
} {
  const spatial =
    makeQuadrature().value;
  const spectralResponseProfile =
    responseProfile(
      kind,
      "test:responsivity-curve",
      responsivityValues
    );
  const spectral =
    calculateSensorSpectralQuadrature({
      colorSamplingProfile:
        colorProfile(),
      spectralResponseProfile,
      channelId: "green",
      wavelengthBasis: "vacuum",
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
        evidence:
          evidence("test:plane")
      },
      operatingConditions:
        opticalConditions
    }).value;

  const operatingRange =
    assessSensorResponseOperatingRange({
      reduction,
      compatibility,
      operatingRangeProfile:
        operatingProfile(
          maximumSubintervalWidthNanometers
        )
    }).value;

  return {
    reduction,
    compatibility,
    operatingRange,
    spectralResponseProfile
  };
}

const zeroBiasConditions = {
  bias: {
    kind:
      "zero-bias-photovoltaic" as const
  },
  readoutLoad: {
    kind:
      "virtual-ground-current-readout" as const
  }
};

describe(
  "sensor A/W responsivity photocurrent",
  () => {
    it("converts spectral radiant power to detector photocurrent magnitude per wavelength", () => {
      const pipeline =
        buildPipeline();

      const result =
        calculateSensorResponsivityPhotocurrent({
          reduction:
            pipeline.reduction,
          compatibility:
            pipeline.compatibility,
          operatingRange:
            pipeline.operatingRange,
          colorSamplingProfile:
            colorProfile(),
          spectralResponseProfile:
            pipeline
              .spectralResponseProfile,
          electricalApplicabilityProfile:
            electricalProfile(),
          operatingElectricalConditions:
            zeroBiasConditions
        });

      const node =
        result.value.perWavelength[0]!;
      const expectedPower =
        2 *
        480_000 *
        1e-12 *
        100;
      const expectedCurrent =
        expectedPower * 0.3;

      expect(
        node.radiantPowerContributionWatts
      ).toBeCloseTo(
        expectedPower,
        15
      );
      expect(
        node.spectralResponsivityAmperesPerWatt
      ).toBeCloseTo(0.3, 12);
      expect(
        node.photocurrentMagnitudeContributionAmperes
      ).toBeCloseTo(
        expectedCurrent,
        15
      );
      expect(
        result.value
          .photocurrentMagnitudeAmperes
      ).toBeCloseTo(
        expectedCurrent,
        15
      );
      expect(
        result.value.currentSignConvention
      ).toBe(
        "magnitude-only-no-circuit-polarity"
      );
    });

    it("integrates multiple wavelength bins without an average-responsivity shortcut", () => {
      const pipeline =
        buildPipeline(
          "responsivity",
          50
        );

      const result =
        calculateSensorResponsivityPhotocurrent({
          reduction:
            pipeline.reduction,
          compatibility:
            pipeline.compatibility,
          operatingRange:
            pipeline.operatingRange,
          colorSamplingProfile:
            colorProfile(),
          spectralResponseProfile:
            pipeline
              .spectralResponseProfile,
          electricalApplicabilityProfile:
            electricalProfile(),
          operatingElectricalConditions:
            zeroBiasConditions
        }).value;

      expect(
        result.spectralNodeCount
      ).toBe(2);
      expect(
        result.perWavelength[0]
          ?.spectralResponsivityAmperesPerWatt
      ).toBeCloseTo(0.25, 12);
      expect(
        result.perWavelength[1]
          ?.spectralResponsivityAmperesPerWatt
      ).toBeCloseTo(0.35, 12);
      expect(
        result.summationMethod
      ).toBe("kahan-compensated");
    });

    it("supports exact reverse-bias and finite-load calibration conditions", () => {
      const pipeline =
        buildPipeline();
      const conditions = {
        bias: {
          kind:
            "reverse-biased" as const,
          magnitudeVolts: 3.3
        },
        readoutLoad: {
          kind:
            "finite-input-impedance" as const,
          inputImpedanceOhms: 10
        }
      };

      const result =
        calculateSensorResponsivityPhotocurrent({
          reduction:
            pipeline.reduction,
          compatibility:
            pipeline.compatibility,
          operatingRange:
            pipeline.operatingRange,
          colorSamplingProfile:
            colorProfile(),
          spectralResponseProfile:
            pipeline
              .spectralResponseProfile,
          electricalApplicabilityProfile:
            electricalProfile({
              referenceConditions:
                conditions
            }),
          operatingElectricalConditions:
            conditions
        }).value;

      expect(
        result.electricalCompatibility
      ).toBe("exact-match");
      expect(
        result
          .operatingElectricalConditions
      ).toEqual(conditions);
    });

    it("fails closed when exact electrical conditions differ", () => {
      const pipeline =
        buildPipeline();

      expect(() =>
        calculateSensorResponsivityPhotocurrent({
          reduction:
            pipeline.reduction,
          compatibility:
            pipeline.compatibility,
          operatingRange:
            pipeline.operatingRange,
          colorSamplingProfile:
            colorProfile(),
          spectralResponseProfile:
            pipeline
              .spectralResponseProfile,
          electricalApplicabilityProfile:
            electricalProfile(),
          operatingElectricalConditions: {
            bias: {
              kind:
                "reverse-biased",
              magnitudeVolts: 1
            },
            readoutLoad:
              zeroBiasConditions
                .readoutLoad
          }
        })
      ).toThrow(
        "Operating electrical conditions must exactly match"
      );
    });

    it("allows an evidence-backed electrical compatibility approximation only as an approximation", () => {
      const pipeline =
        buildPipeline();
      const result =
        calculateSensorResponsivityPhotocurrent({
          reduction:
            pipeline.reduction,
          compatibility:
            pipeline.compatibility,
          operatingRange:
            pipeline.operatingRange,
          colorSamplingProfile:
            colorProfile(),
          spectralResponseProfile:
            pipeline
              .spectralResponseProfile,
          electricalApplicabilityProfile:
            electricalProfile({
              scientificStatus:
                "approximation",
              uncertainty: {
                kind:
                  "not-quantified",
                limitation:
                  "electrical approximation"
              },
              conditionPolicy: {
                kind:
                  "assume-compatible",
                limitation:
                  "Readout loading differs but is treated as equivalent for this test.",
                evidence:
                  evidence(
                    "test:electrical-assumption"
                  )
              }
            }),
          operatingElectricalConditions: {
            bias: {
              kind:
                "reverse-biased",
              magnitudeVolts: 1
            },
            readoutLoad: {
              kind:
                "finite-input-impedance",
              inputImpedanceOhms:
                10
            }
          }
        });

      expect(
        result.provenance.kind
      ).toBe("approximation");
      expect(
        result.value
          .electricalCompatibility
      ).toBe(
        "assumed-compatible"
      );
      expect(
        result.value.componentEvidence
          .electricalConditionAssumption
      ).toEqual(
        evidence(
          "test:electrical-assumption"
        )
      );
    });

    it("rejects EQE response even if upstream snapshots are forged toward the current path", () => {
      const pipeline =
        buildPipeline("eqe");
      const compatibility = {
        ...pipeline.compatibility,
        requiredSignalPath:
          "radiant-power-to-current" as const
      };
      const operatingRange = {
        ...pipeline.operatingRange,
        requiredSignalPath:
          "radiant-power-to-current" as const
      };

      expect(() =>
        calculateSensorResponsivityPhotocurrent({
          reduction:
            pipeline.reduction,
          compatibility,
          operatingRange,
          colorSamplingProfile:
            colorProfile(),
          spectralResponseProfile:
            pipeline
              .spectralResponseProfile,
          electricalApplicabilityProfile:
            electricalProfile(),
          operatingElectricalConditions:
            zeroBiasConditions
        })
      ).toThrow(
        "requires effective spectral responsivity"
      );
    });

    it("rejects numeric A/W calibration drift even when IDs and evidence are unchanged", () => {
      const pipeline =
        buildPipeline();

      expect(() =>
        calculateSensorResponsivityPhotocurrent({
          reduction:
            pipeline.reduction,
          compatibility:
            pipeline.compatibility,
          operatingRange:
            pipeline.operatingRange,
          colorSamplingProfile:
            colorProfile(),
          spectralResponseProfile:
            responseProfile(
              "responsivity",
              "test:responsivity-curve",
              [0.25, 0.45]
            ),
          electricalApplicabilityProfile:
            electricalProfile(),
          operatingElectricalConditions:
            zeroBiasConditions
        })
      ).toThrow(
        "response-channel binding"
      );
    });

    it("binds A/W calibration evidence and operating-range bins to the exact reduction", () => {
      const pipeline =
        buildPipeline();

      expect(() =>
        calculateSensorResponsivityPhotocurrent({
          reduction:
            pipeline.reduction,
          compatibility:
            pipeline.compatibility,
          operatingRange:
            pipeline.operatingRange,
          colorSamplingProfile:
            colorProfile(),
          spectralResponseProfile:
            responseProfile(
              "responsivity",
              "test:different-curve"
            ),
          electricalApplicabilityProfile:
            electricalProfile(),
          operatingElectricalConditions:
            zeroBiasConditions
        })
      ).toThrow(
        "response-channel binding"
      );

      const stale = {
        ...pipeline.operatingRange,
        evaluatedSpectralNodeInputs:
          pipeline.operatingRange
            .evaluatedSpectralNodeInputs!
            .map(
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
        calculateSensorResponsivityPhotocurrent({
          reduction:
            pipeline.reduction,
          compatibility:
            pipeline.compatibility,
          operatingRange: stale,
          colorSamplingProfile:
            colorProfile(),
          spectralResponseProfile:
            pipeline
              .spectralResponseProfile,
          electricalApplicabilityProfile:
            electricalProfile(),
          operatingElectricalConditions:
            zeroBiasConditions
        })
      ).toThrow(
        "spectral-node values must match"
      );
    });

    it("binds the electrical profile to the exact response pipeline", () => {
      const pipeline =
        buildPipeline();

      expect(() =>
        calculateSensorResponsivityPhotocurrent({
          reduction:
            pipeline.reduction,
          compatibility:
            pipeline.compatibility,
          operatingRange:
            pipeline.operatingRange,
          colorSamplingProfile:
            colorProfile(),
          spectralResponseProfile:
            pipeline
              .spectralResponseProfile,
          electricalApplicabilityProfile:
            electricalProfile({
              spectralResponseProfileId:
                "other"
            }),
          operatingElectricalConditions:
            zeroBiasConditions
        })
      ).toThrow(
        "identities must exactly match"
      );
    });

    it("keeps charge, electronics, voltage, noise and RAW downstream", () => {
      const pipeline =
        buildPipeline();
      const result =
        calculateSensorResponsivityPhotocurrent({
          reduction:
            pipeline.reduction,
          compatibility:
            pipeline.compatibility,
          operatingRange:
            pipeline.operatingRange,
          colorSamplingProfile:
            colorProfile(),
          spectralResponseProfile:
            pipeline
              .spectralResponseProfile,
          electricalApplicabilityProfile:
            electricalProfile(),
          operatingElectricalConditions:
            zeroBiasConditions
        }).value;

      expect(
        result.currentCalculated
      ).toBe(true);
      expect(
        result.spectralResponsivityApplied
      ).toBe(true);
      expect(
        result.quantumEfficiencyApplied
      ).toBe(false);
      expect(
        result.photonRateCalculated
      ).toBe(false);
      expect(
        result.electronRateCalculated
      ).toBe(false);
      expect(
        result.chargeCalculated
      ).toBe(false);
      expect(
        result.transimpedanceGainApplied
      ).toBe(false);
      expect(
        result.voltageCalculated
      ).toBe(false);
      expect(
        result.temporalIntegrationApplied
      ).toBe(false);
      expect(
        result.saturationAssessed
      ).toBe(false);
      expect(
        result.readoutElectronicsLinearityAssessed
      ).toBe(false);
      expect(
        result.rawCodeValueProduced
      ).toBe(false);
      expect(
        result.temporalResponseModel
      ).toBe(
        "quasi-static-steady-state-only"
      );
      expect(
        result.detectorBandwidthModeled
      ).toBe(false);
    });

    it("validates electrical applicability metadata", () => {
      expect(() =>
        parseSensorResponsivityElectricalApplicabilityProfile({
          ...electricalProfile(),
          schemaVersion: "9.9.9"
        })
      ).toThrow("schemaVersion");

      expect(() =>
        parseSensorResponsivityElectricalApplicabilityProfile({
          ...electricalProfile(),
          outputMeaning: "voltage"
        })
      ).toThrow("outputMeaning");

      expect(() =>
        parseSensorResponsivityElectricalApplicabilityProfile({
          ...electricalProfile(),
          referenceConditions: {
            bias: {
              kind:
                "reverse-biased",
              magnitudeVolts: -1
            },
            readoutLoad:
              zeroBiasConditions
                .readoutLoad
          }
        })
      ).toThrow(
        "magnitudeVolts"
      );

      expect(() =>
        parseSensorResponsivityElectricalApplicabilityProfile({
          ...electricalProfile(),
          referenceConditions: {
            bias:
              zeroBiasConditions.bias,
            readoutLoad: {
              kind:
                "finite-input-impedance",
              inputImpedanceOhms:
                -1
            }
          }
        })
      ).toThrow(
        "inputImpedanceOhms"
      );

      expect(() =>
        parseSensorResponsivityElectricalApplicabilityProfile({
          ...electricalProfile(),
          uncertainty: {
            kind:
              "not-quantified",
            limitation: "missing"
          }
        })
      ).toThrow(
        "must declare quantified"
      );
    });

    it("rejects zero reverse bias and zero finite impedance as ambiguous electrical conditions", () => {
      expect(() =>
        parseSensorResponsivityElectricalApplicabilityProfile({
          ...electricalProfile(),
          referenceConditions: {
            bias: {
              kind:
                "reverse-biased",
              magnitudeVolts: 0
            },
            readoutLoad:
              zeroBiasConditions
                .readoutLoad
          }
        })
      ).toThrow(
        "magnitudeVolts"
      );

      expect(() =>
        parseSensorResponsivityElectricalApplicabilityProfile({
          ...electricalProfile(),
          referenceConditions: {
            bias:
              zeroBiasConditions.bias,
            readoutLoad: {
              kind:
                "finite-input-impedance",
              inputImpedanceOhms:
                0
            }
          }
        })
      ).toThrow(
        "inputImpedanceOhms"
      );
    });

    it("rejects invalid electrical condition and policy enum values", () => {
      expect(() =>
        parseSensorResponsivityElectricalApplicabilityProfile({
          ...electricalProfile(),
          referenceConditions: {
            bias: {
              kind: "forward-biased"
            },
            readoutLoad:
              zeroBiasConditions
                .readoutLoad
          }
        })
      ).toThrow(
        "bias.kind"
      );

      expect(() =>
        parseSensorResponsivityElectricalApplicabilityProfile({
          ...electricalProfile(),
          referenceConditions: {
            bias:
              zeroBiasConditions.bias,
            readoutLoad: {
              kind:
                "unknown-load"
            }
          }
        })
      ).toThrow(
        "readoutLoad.kind"
      );

      expect(() =>
        parseSensorResponsivityElectricalApplicabilityProfile({
          ...electricalProfile(),
          conditionPolicy: {
            kind: "unknown-policy"
          }
        })
      ).toThrow(
        "conditionPolicy.kind"
      );
    });

    it("rejects supplied color/response profile identity mismatches before conversion", () => {
      const pipeline =
        buildPipeline();

      expect(() =>
        calculateSensorResponsivityPhotocurrent({
          reduction:
            pipeline.reduction,
          compatibility:
            pipeline.compatibility,
          operatingRange:
            pipeline.operatingRange,
          colorSamplingProfile: {
            ...colorProfile(),
            profileId:
              "wrong-color"
          },
          spectralResponseProfile:
            pipeline
              .spectralResponseProfile,
          electricalApplicabilityProfile:
            electricalProfile(),
          operatingElectricalConditions:
            zeroBiasConditions
        })
      ).toThrow(
        "must exactly match the reduction identities"
      );

      expect(() =>
        calculateSensorResponsivityPhotocurrent({
          reduction:
            pipeline.reduction,
          compatibility:
            pipeline.compatibility,
          operatingRange:
            pipeline.operatingRange,
          colorSamplingProfile:
            colorProfile(),
          spectralResponseProfile: {
            ...pipeline
              .spectralResponseProfile,
            profileId:
              "wrong-response"
          },
          electricalApplicabilityProfile:
            electricalProfile(),
          operatingElectricalConditions:
            zeroBiasConditions
        })
      ).toThrow(
        "must exactly match the reduction identities"
      );
    });

    it("rejects malformed electrical applicability status and approximation metadata", () => {
      expect(() =>
        parseSensorResponsivityElectricalApplicabilityProfile({
          ...electricalProfile(),
          scientificStatus:
            "unknown"
        })
      ).toThrow(
        "scientificStatus"
      );

      expect(() =>
        parseSensorResponsivityElectricalApplicabilityProfile({
          ...electricalProfile({
            scientificStatus:
              "approximation",
            uncertainty: {
              kind:
                "not-quantified",
              limitation:
                "test approximation"
            }
          }),
          conditionPolicy: {
            kind:
              "assume-compatible",
            limitation: "",
            evidence:
              evidence(
                "test:bad-electrical-assumption"
              )
          }
        })
      ).toThrow(
        "limitation"
      );
    });

    it("fails closed when individually finite spectral currents overflow in the compensated total", () => {
      const pipeline =
        buildPipeline(
          "responsivity",
          50,
          [1e304, 1e304]
        );
      const contribution =
        10_000;
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
          maximumInclusive:
            Number.MAX_VALUE
        },
        evaluatedInput: {
          ...pipeline.operatingRange
            .evaluatedInput,
          value:
            contribution * 2
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
        calculateSensorResponsivityPhotocurrent({
          reduction,
          compatibility:
            pipeline.compatibility,
          operatingRange,
          colorSamplingProfile:
            colorProfile(),
          spectralResponseProfile:
            pipeline
              .spectralResponseProfile,
          electricalApplicabilityProfile:
            electricalProfile(),
          operatingElectricalConditions:
            zeroBiasConditions
        })
      ).toThrow(
        "Total A/W photocurrent magnitude"
      );
    });

    it("fails closed on malformed reduction power", () => {
      const pipeline =
        buildPipeline();

      expect(() =>
        calculateSensorResponsivityPhotocurrent({
          reduction: {
            ...pipeline.reduction,
            perWavelength:
              pipeline.reduction
                .perWavelength.map(
                  (node) => ({
                    ...node,
                    wavelengthIntegratedGeometricApertureIncidentFluxContributionWatts:
                      node
                        .wavelengthIntegratedGeometricApertureIncidentFluxContributionWatts *
                      2
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
            pipeline
              .spectralResponseProfile,
          electricalApplicabilityProfile:
            electricalProfile(),
          operatingElectricalConditions:
            zeroBiasConditions
        })
      ).toThrow(
        "must equal spectral flux density"
      );
    });

    it("fails closed on photocurrent overflow", () => {
      const pipeline =
        buildPipeline(
          "responsivity",
          100,
          [
            Number.MAX_VALUE,
            Number.MAX_VALUE
          ]
        );
      const node =
        pipeline.reduction
          .perWavelength[0]!;
      const contribution =
        10_000;
      const reduction = {
        ...pipeline.reduction,
        perWavelength: [{
          ...node,
          geometricApertureIncidentSpectralFluxWattsPerNanometer:
            contribution /
            node.wavelengthMeasureNanometers,
          wavelengthIntegratedGeometricApertureIncidentFluxContributionWatts:
            contribution
        }],
        wavelengthIntegratedGeometricApertureIncidentFluxWatts:
          contribution
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
          value: contribution
        },
        evaluatedSpectralNodeInputs: [{
          ...pipeline.operatingRange
            .evaluatedSpectralNodeInputs![0]!,
          value: contribution
        }]
      };

      expect(() =>
        calculateSensorResponsivityPhotocurrent({
          reduction,
          compatibility:
            pipeline.compatibility,
          operatingRange,
          colorSamplingProfile:
            colorProfile(),
          spectralResponseProfile:
            pipeline
              .spectralResponseProfile,
          electricalApplicabilityProfile:
            electricalProfile(),
          operatingElectricalConditions:
            zeroBiasConditions
        })
      ).toThrow(
        "photocurrent calculation must remain finite"
      );
    });
  }
);
