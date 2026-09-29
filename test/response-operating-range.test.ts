import { describe, expect, it } from "vitest";

import {
  assessSensorResponseOperatingRange,
  parseSensorResponseOperatingRangeProfile,
  type SensorResponseApplicationCompatibilityAssessment,
  type SensorResponseOperatingRangeProfile,
  type SensorSpatioSpectralIrradianceReduction
} from "../src/index.js";

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

function reduction(
  overrides:
    Partial<SensorSpatioSpectralIrradianceReduction> = {}
): SensorSpatioSpectralIrradianceReduction {
  return {
    colorSamplingProfileId: "color",
    samplingApertureProfileId:
      "aperture",
    opticalStackProfileId: "stack",
    site: { x: 0, y: 0 },
    channelId: "green",
    responseProfileId: "spectral",
    sourceResponseKind:
      "effective-external-quantum-efficiency",
    responseScope:
      "site-incident-effective-channel-response",
    responseScientificStatus:
      "calibrated",
    responseUncertainty: {
      kind: "relative",
      fraction: 0.02,
      basis: "test"
    },
    responseReferenceConditions:
      operatingConditions,
    wavelengthBasis: "vacuum",
    wavelengthBasisResolved: true,
    wavelengthRangeNanometers: {
      minimum: 400,
      maximum: 500
    },
    responseDeclaredWavelengthRangeNanometers:
      {
        minimum: 380,
        maximum: 720
      },
    outputMeaning:
      "pre-response-spatio-spectral-radiometric-reduction",
    inputValueDomain: {
      kind:
        "radiometric-spectral-irradiance",
      unit: "W/m^2/nm",
      semantic:
        "pre-aa-pre-response-sensor-plane-spectral-irradiance"
    },
    spatialNodeCount: 1,
    spectralNodeCount: 1,
    combinedSampleCount: 1,
    sourceValuesMatchedBy:
      "spatial-node-identity-plus-spectral-sample-index-and-wavelength",
    sourceValuesSuppliedForAllCombinedNodes:
      true,
    outsideImagingAreaSourceValuesRequired:
      false,
    geometricApertureAreaSquareMicrometers:
      480_000,
    nominalSiteCellAreaSquareMicrometers:
      1_000_000,
    geometricSensitiveAreaFractionOfLatticeCell:
      0.48,
    perWavelength: [{
      spectralSampleIndex: 0,
      wavelengthNanometers: 450,
      wavelengthMeasureNanometers:
        100,
      normalizedWavelengthWeight: 1,
      normalizedSpatialAverageSpectralIrradianceWattsPerSquareMeterPerNanometer:
        1,
      geometricApertureIncidentSpectralFluxWattsPerNanometer:
        5e-7,
      wavelengthIntegratedSpatialAverageContributionWattsPerSquareMeter:
        100,
      wavelengthIntegratedGeometricApertureIncidentFluxContributionWatts:
        5e-5
    }],
    wavelengthIntegratedSpatialAverageIrradianceWattsPerSquareMeter:
      100,
    wavelengthIntegratedGeometricApertureIncidentFluxWatts:
      5e-5,
    spatialIntegrationApplied: true,
    wavelengthIntegrationApplied: true,
    spectralResponsePlanUsedForWavelengthSupport:
      true,
    spectralResponseApplicationPerformed:
      false,
    responseScopeMatchedToSourcePlane:
      false,
    quantumEfficiencyApplied: false,
    spectralResponsivityApplied: false,
    channelFilterTransmissionApplied:
      false,
    opticalTransmissionAppliedByReducer:
      false,
    radiometricCollectionAreaEstablished:
      false,
    temporalIntegrationApplied: false,
    exposureDurationApplied: false,
    photonsCalculated: false,
    electronsCalculated: false,
    currentCalculated: false,
    shotNoiseApplied: false,
    readNoiseApplied: false,
    adcQuantizationApplied: false,
    rawCodeValueProduced: false,
    demosaicOrReconstructionApplied:
      false,
    convergenceErrorEstimated: false,
    componentEvidence: {
      spatial: {
        samplingApertureProfile:
          evidence("spatial:aperture"),
        samplingApertureLattice:
          evidence("spatial:lattice"),
        geometricSensitiveAperture:
          evidence("spatial:geometry"),
        opticalStackProfile:
          evidence("spatial:stack"),
        antiAliasingResponse:
          evidence("spatial:aa")
      },
      spectral: {
        colorSamplingProfile:
          evidence("spectral:color"),
        profile:
          evidence("spectral:profile"),
        channel:
          evidence("spectral:channel"),
        curves: [
          evidence("spectral:curve")
        ]
      }
    },
    ...overrides
  };
}

function compatibility(
  overrides:
    Partial<SensorResponseApplicationCompatibilityAssessment> = {}
): SensorResponseApplicationCompatibilityAssessment {
  return {
    applicationProfileId:
      "application",
    spectralResponseProfileId:
      "spectral",
    colorSamplingProfileId:
      "color",
    channelId: "green",
    responseScope:
      "site-incident-effective-channel-response",
    requiredSourcePlane:
      "site-incident",
    suppliedSourcePlane:
      "site-incident",
    sourcePlaneMatched: true,
    responseIncidentAreaBasis: {
      kind:
        "geometric-sensitive-aperture",
      areaSquareMicrometers:
        480_000
    },
    currentlyIntegratedAreaBasis:
      "geometric-sensitive-aperture",
    geometricApertureAreaSquareMicrometers:
      480_000,
    nominalSiteCellAreaSquareMicrometers:
      1_000_000,
    spatialResponseModel: {
      kind:
        "uniform-over-geometric-sensitive-aperture",
      scientificStatus:
        "calibrated",
      evidence:
        evidence("uniformity")
    },
    referenceConditionPolicy: {
      kind: "exact-match-required"
    },
    responseReferenceConditions:
      operatingConditions,
    operatingConditions,
    structuralCompatibilityEstablished:
      true,
    compatibilityStatus:
      "compatible",
    blockers: [],
    requiredSignalPath:
      "photon-rate-to-electrons",
    quantifiedResponseUncertaintyAvailable:
      true,
    responseApplicationPerformed:
      false,
    signalConversionAuthorized:
      false,
    temporalIntegrationAuthorized:
      false,
    photonConversionPerformed:
      false,
    electronConversionPerformed:
      false,
    currentConversionPerformed:
      false,
    operatingRangeCompatibilityAssessed:
      false,
    spatiallyVaryingResponseSupported:
      false,
    componentEvidence: {
      applicationProfile:
        evidence("application"),
      sourcePlane:
        evidence("source-plane"),
      spatialResponse:
        evidence("uniformity"),
      referenceConditionAssumption:
        [],
      response: {
        colorSamplingProfile:
          evidence("spectral:color"),
        profile:
          evidence("spectral:profile"),
        channel:
          evidence("spectral:channel"),
        curves: [
          evidence("spectral:curve")
        ]
      }
    },
    ...overrides
  };
}

function profile(
  overrides:
    Partial<SensorResponseOperatingRangeProfile> = {}
): SensorResponseOperatingRangeProfile {
  return {
    schemaVersion: "0.1.0",
    profileId: "linearity",
    responseApplicationProfileId:
      "application",
    spectralResponseProfileId:
      "spectral",
    colorSamplingProfileId:
      "color",
    channelId: "green",
    scientificStatus:
      "calibrated",
    uncertainty: {
      kind: "relative",
      fraction: 0.01,
      basis:
        "test linearity calibration"
    },
    evidence:
      evidence("linearity"),
    inputRange: {
      kind:
        "wavelength-integrated-geometric-aperture-radiant-power",
      unit: "W",
      minimumInclusive: 1e-6,
      maximumInclusive: 1e-3
    },
    wavelengthApplicability: {
      wavelengthBasis: "vacuum",
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
        evidence("spatial-linearity")
    },
    referenceConditions:
      operatingConditions,
    referenceConditionPolicy: {
      kind: "exact-match-required"
    },
    ...overrides
  };
}

describe(
  "sensor response operating range",
  () => {
    it("authorizes only instantaneous rate conversion inside an evidence-backed range", () => {
      const result =
        assessSensorResponseOperatingRange({
          reduction: reduction(),
          compatibility:
            compatibility(),
          operatingRangeProfile:
            profile()
        });

      expect(
        result.value.status
      ).toBe(
        "rate-conversion-authorized"
      );
      expect(
        result.value
          .responseRateConversionAuthorized
      ).toBe(true);
      expect(
        result.value.evaluatedInput
      ).toEqual({
        kind:
          "wavelength-integrated-geometric-aperture-radiant-power",
        unit: "W",
        value: 5e-5
      });
      expect(
        result.value
          .exposureDomainLinearityAssessed
      ).toBe(false);
      expect(
        result.value
          .accumulatedChargeLinearityAssessed
      ).toBe(false);
      expect(
        result.value.saturationAssessed
      ).toBe(false);
      expect(
        result.value
          .temporalIntegrationAuthorized
      ).toBe(false);
    });

    it("supports an irradiance-domain linearity calibration without substituting power", () => {
      const result =
        assessSensorResponseOperatingRange({
          reduction: reduction(),
          compatibility:
            compatibility(),
          operatingRangeProfile:
            profile({
              inputRange: {
                kind:
                  "wavelength-integrated-spatial-average-irradiance",
                unit: "W/m^2",
                minimumInclusive: 10,
                maximumInclusive: 200
              }
            })
        });

      expect(
        result.value.evaluatedInput
      ).toEqual({
        kind:
          "wavelength-integrated-spatial-average-irradiance",
        unit: "W/m^2",
        value: 100
      });
      expect(
        result.value.blockers
      ).toEqual([]);
    });

    it("blocks optical input below or above the declared linear range", () => {
      const below =
        assessSensorResponseOperatingRange({
          reduction: reduction({
            wavelengthIntegratedGeometricApertureIncidentFluxWatts:
              1e-8
          }),
          compatibility:
            compatibility(),
          operatingRangeProfile:
            profile()
        });
      expect(
        below.value.blockers
      ).toContain(
        "input-below-linearity-range"
      );

      const above =
        assessSensorResponseOperatingRange({
          reduction: reduction({
            wavelengthIntegratedGeometricApertureIncidentFluxWatts:
              2e-3
          }),
          compatibility:
            compatibility(),
          operatingRangeProfile:
            profile()
        });
      expect(
        above.value.blockers
      ).toContain(
        "input-above-linearity-range"
      );
    });

    it("blocks wavelength basis and applicability mismatches", () => {
      const unresolved =
        assessSensorResponseOperatingRange({
          reduction: reduction({
            wavelengthBasisResolved:
              false
          }),
          compatibility:
            compatibility(),
          operatingRangeProfile:
            profile()
        });
      expect(
        unresolved.value.blockers
      ).toContain(
        "wavelength-basis-unresolved"
      );

      const basis =
        assessSensorResponseOperatingRange({
          reduction: reduction({
            wavelengthBasis: "air"
          }),
          compatibility:
            compatibility(),
          operatingRangeProfile:
            profile()
        });
      expect(
        basis.value.blockers
      ).toContain(
        "wavelength-basis-mismatch"
      );

      const range =
        assessSensorResponseOperatingRange({
          reduction: reduction({
            wavelengthRangeNanometers:
              {
                minimum: 350,
                maximum: 500
              }
          }),
          compatibility:
            compatibility(),
          operatingRangeProfile:
            profile()
        });
      expect(
        range.value.blockers
      ).toContain(
        "wavelength-range-outside-linearity-applicability"
      );
    });

    it("blocks rate conversion when spatial linear superposition is not established", () => {
      const omitted =
        assessSensorResponseOperatingRange({
          reduction: reduction(),
          compatibility:
            compatibility(),
          operatingRangeProfile:
            {
              ...profile(),
              spatialLinearityModel:
                undefined
            }
        });

      expect(
        omitted.value.blockers
      ).toContain(
        "spatial-linearity-superposition-not-established"
      );
      expect(
        omitted.value
          .responseRateConversionAuthorized
      ).toBe(false);

      const approximate =
        assessSensorResponseOperatingRange({
          reduction: reduction(),
          compatibility:
            compatibility(),
          operatingRangeProfile:
            profile({
              spatialLinearityModel: {
                kind:
                  "linear-superposition-over-geometric-aperture",
                scientificStatus:
                  "approximation",
                evidence:
                  evidence(
                    "spatial-linearity-approx"
                  ),
                limitation:
                  "Sub-aperture distribution independence is approximated for this operating regime."
              }
            })
        });

      expect(
        approximate.value.status
      ).toBe(
        "rate-conversion-authorized-approximation"
      );
      expect(
        approximate.value
          .componentEvidence
          .spatialLinearity
      ).toEqual(
        evidence(
          "spatial-linearity-approx"
        )
      );
    });

    it("blocks a structurally incompatible response regardless of optical level", () => {
      const result =
        assessSensorResponseOperatingRange({
          reduction: reduction(),
          compatibility:
            compatibility({
              structuralCompatibilityEstablished:
                false,
              compatibilityStatus:
                "blocked",
              blockers: [
                "source-plane-mismatch"
              ]
            }),
          operatingRangeProfile:
            profile()
        });

      expect(
        result.value.status
      ).toBe("blocked");
      expect(
        result.value.blockers
      ).toContain(
        "structural-compatibility-not-established"
      );
      expect(
        result.value
          .responseRateConversionAuthorized
      ).toBe(false);
    });

    it("blocks operating-range identity mismatches explicitly", () => {
      const result =
        assessSensorResponseOperatingRange({
          reduction: reduction(),
          compatibility:
            compatibility(),
          operatingRangeProfile:
            profile({
              responseApplicationProfileId:
                "wrong-app",
              spectralResponseProfileId:
                "wrong-response",
              colorSamplingProfileId:
                "wrong-color",
              channelId: "red"
            })
        });

      expect(
        result.value.blockers
      ).toEqual(
        expect.arrayContaining([
          "response-application-profile-id-mismatch",
          "spectral-response-profile-id-mismatch",
          "color-sampling-profile-id-mismatch",
          "channel-id-mismatch"
        ])
      );
    });

    it("requires exact linearity calibration conditions when selected", () => {
      const missingOperating =
        assessSensorResponseOperatingRange({
          reduction: reduction(),
          compatibility:
            compatibility({
              operatingConditions:
                undefined
            } as never),
          operatingRangeProfile:
            profile()
        });
      expect(
        missingOperating.value.blockers
      ).toContain(
        "operating-conditions-not-declared"
      );

      const mismatch =
        assessSensorResponseOperatingRange({
          reduction: reduction(),
          compatibility:
            compatibility({
              operatingConditions: {
                ...operatingConditions,
                temperatureC: 30
              }
            }),
          operatingRangeProfile:
            profile()
        });
      expect(
        mismatch.value.blockers
      ).toContain(
        "linearity-operating-conditions-mismatch"
      );
    });

    it("checks incidence angle and polarization in exact linearity conditions", () => {
      const angle =
        assessSensorResponseOperatingRange({
          reduction: reduction(),
          compatibility:
            compatibility({
              operatingConditions: {
                ...operatingConditions,
                incidenceAngleDegreesFromNormal:
                  5
              }
            }),
          operatingRangeProfile:
            profile()
        });
      expect(
        angle.value.blockers
      ).toContain(
        "linearity-operating-conditions-mismatch"
      );

      const polarization =
        assessSensorResponseOperatingRange({
          reduction: reduction(),
          compatibility:
            compatibility({
              operatingConditions: {
                ...operatingConditions,
                polarization:
                  "unspecified"
              }
            }),
          operatingRangeProfile:
            profile()
        });
      expect(
        polarization.value.blockers
      ).toContain(
        "linearity-operating-conditions-mismatch"
      );
    });

    it("keeps an evidence-backed condition assumption in the approximation lane", () => {
      const result =
        assessSensorResponseOperatingRange({
          reduction: reduction(),
          compatibility:
            compatibility(),
          operatingRangeProfile:
            profile({
              scientificStatus:
                "approximation",
              uncertainty: {
                kind:
                  "not-quantified",
                limitation:
                  "test approximation"
              },
              referenceConditions:
                undefined,
              referenceConditionPolicy:
                {
                  kind:
                    "assume-compatible",
                  limitation:
                    "test assumption",
                  evidence:
                    evidence(
                      "linearity-condition-assumption"
                    )
                }
            } as never)
        });

      expect(
        result.value.status
      ).toBe(
        "rate-conversion-authorized-approximation"
      );
      expect(
        result.value.componentEvidence
          .referenceConditionAssumption
      ).toEqual(
        evidence(
          "linearity-condition-assumption"
        )
      );
    });

    it("rejects mismatched reduction and structural-assessment identities", () => {
      expect(() =>
        assessSensorResponseOperatingRange({
          reduction: reduction({
            responseProfileId:
              "other-response"
          }),
          compatibility:
            compatibility(),
          operatingRangeProfile:
            profile()
        })
      ).toThrow(
        "identities do not match"
      );
    });

    it("validates range, wavelength, criterion, and uncertainty metadata", () => {
      expect(() =>
        parseSensorResponseOperatingRangeProfile({
          ...profile(),
          inputRange: {
            kind:
              "wavelength-integrated-geometric-aperture-radiant-power",
            unit: "W",
            minimumInclusive: 2,
            maximumInclusive: 1
          }
        })
      ).toThrow(
        "minimumInclusive must be less"
      );

      expect(() =>
        parseSensorResponseOperatingRangeProfile({
          ...profile(),
          wavelengthApplicability: {
            ...profile()
              .wavelengthApplicability,
            wavelengthBasis:
              "unspecified"
          }
        })
      ).toThrow(
        "wavelengthBasis"
      );

      expect(() =>
        parseSensorResponseOperatingRangeProfile({
          ...profile(),
          wavelengthApplicability: {
            ...profile()
              .wavelengthApplicability,
            minimumNanometers: 500,
            maximumNanometers: 400
          }
        })
      ).toThrow(
        "minimumNanometers must be less"
      );

      expect(() =>
        parseSensorResponseOperatingRangeProfile({
          ...profile(),
          wavelengthApplicability: {
            ...profile()
              .wavelengthApplicability,
            containment: "bad"
          }
        })
      ).toThrow(
        "containment"
      );

      expect(() =>
        parseSensorResponseOperatingRangeProfile({
          ...profile(),
          linearityCriterion: {
            maximumAbsoluteRelativeDeviation:
              2
          }
        })
      ).toThrow(
        "fraction from 0 through 1"
      );

      expect(() =>
        parseSensorResponseOperatingRangeProfile({
          ...profile(),
          uncertainty: {
            kind:
              "not-quantified",
            limitation:
              "missing calibrated uncertainty"
          }
        })
      ).toThrow(
        "must declare quantified"
      );
    });

    it("rejects unsupported profile schema/status and exact matching without reference conditions", () => {
      expect(() =>
        parseSensorResponseOperatingRangeProfile({
          ...profile(),
          schemaVersion: "9.9.9"
        })
      ).toThrow("schemaVersion");

      expect(() =>
        parseSensorResponseOperatingRangeProfile({
          ...profile(),
          scientificStatus: "unknown"
        })
      ).toThrow("scientificStatus");

      expect(() =>
        parseSensorResponseOperatingRangeProfile({
          ...profile(),
          referenceConditions: undefined,
          referenceConditionPolicy: {
            kind: "exact-match-required"
          }
        })
      ).toThrow(
        "referenceConditions is required"
      );
    });

    it("rejects malformed metric values before range classification", () => {
      expect(() =>
        assessSensorResponseOperatingRange({
          reduction: reduction({
            wavelengthIntegratedGeometricApertureIncidentFluxWatts:
              Number.POSITIVE_INFINITY
          }),
          compatibility:
            compatibility(),
          operatingRangeProfile:
            profile()
        })
      ).toThrow(
        "must be finite and nonnegative"
      );
    });
  }
);
