import { describe, expect, it } from "vitest";

import {
  assessSensorResponseApplicationCompatibility,
  calculateSensorSpectralQuadrature,
  parseSensorResponseApplicationProfile,
  reduceSensorSpatioSpectralIrradiance,
  type SensorColorSamplingProfile,
  type SensorResponseApplicationProfile,
  type SensorSpectralResponseProfile,
  type SensorSpatioSpectralIrradianceReduction,
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

const colorProfile =
(): SensorColorSamplingProfile => ({
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
    anchor: "native-sensor-top-left-site"
  }
});

function spectralProfile(
  kind:
    | "eqe"
    | "responsivity" = "eqe",
  withReferenceConditions = true
): SensorSpectralResponseProfile {
  const referenceConditions =
    withReferenceConditions
      ? {
          temperatureC: 25,
          incidenceAngleDegreesFromNormal:
            0,
          polarization:
            "unpolarized" as const
        }
      : undefined;

  return {
    schemaVersion: "0.1.0",
    profileId:
      kind === "eqe"
        ? "spectral-eqe"
        : "spectral-aw",
    colorSamplingProfileId:
      "bayer-like",
    evidence: evidence(
      "test:spectral-profile"
    ),
    channels: [
      kind === "eqe"
        ? {
            channelId: "green",
            kind:
              "effective-external-quantum-efficiency",
            responseScope:
              "site-incident-effective-channel-response",
            scientificStatus:
              "calibrated",
            uncertainty: {
              kind: "relative",
              fraction: 0.02,
              basis: "test"
            },
            evidence: evidence(
              "test:eqe"
            ),
            ...(referenceConditions ===
            undefined
              ? {}
              : {
                  referenceConditions
                }),
            conditionDependence:
              "not-modeled",
            externalQuantumEfficiency: {
              wavelengthUnit: "nm",
              wavelengthBasis: "air",
              interpolation:
                "piecewise-linear",
              outsideRangeBehavior:
                "fail-closed",
              evidence: evidence(
                "test:eqe-curve"
              ),
              samples: [
                {
                  wavelengthNanometers:
                    400,
                  value: 0.3
                },
                {
                  wavelengthNanometers:
                    500,
                  value: 0.5
                }
              ]
            }
          }
        : {
            channelId: "green",
            kind:
              "effective-spectral-responsivity",
            responseScope:
              "sensor-package-incident-effective-channel-response",
            scientificStatus:
              "approximation",
            uncertainty: {
              kind: "not-quantified",
              limitation: "test"
            },
            evidence: evidence(
              "test:responsivity"
            ),
            ...(referenceConditions ===
            undefined
              ? {}
              : {
                  referenceConditions
                }),
            conditionDependence:
              "not-modeled",
            spectralResponsivity: {
              wavelengthUnit: "nm",
              wavelengthBasis: "air",
              interpolation:
                "piecewise-linear",
              outsideRangeBehavior:
                "fail-closed",
              evidence: evidence(
                "test:aw-curve"
              ),
              samples: [
                {
                  wavelengthNanometers:
                    400,
                  amperesPerWatt: 0.2
                },
                {
                  wavelengthNanometers:
                    500,
                  amperesPerWatt: 0.4
                }
              ]
            }
          }
    ]
  };
}

function makeReduction(
  kind:
    | "eqe"
    | "responsivity" = "eqe",
  withReferenceConditions = true
): SensorSpatioSpectralIrradianceReduction {
  const spatial =
    makeQuadrature().value;
  const profile =
    spectralProfile(
      kind,
      withReferenceConditions
    );
  const spectral =
    calculateSensorSpectralQuadrature({
      colorSamplingProfile:
        colorProfile(),
      spectralResponseProfile:
        profile,
      channelId: "green",
      wavelengthBasis: "air",
      wavelengthRangeNanometers: {
        minimum: 400,
        maximum: 500
      },
      maximumSubintervalWidthNanometers:
        100
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
                1
            })
          )
      );

  return reduceSensorSpatioSpectralIrradiance({
    spatialQuadrature: spatial,
    spectralQuadrature:
      spectral,
    sampleValues
  }).value;
}

function applicationProfile(
  overrides:
    Partial<SensorResponseApplicationProfile> = {}
): SensorResponseApplicationProfile {
  return {
    schemaVersion: "0.1.0",
    profileId:
      "response-application",
    spectralResponseProfileId:
      "spectral-eqe",
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
        "test:uniformity"
      )
    },
    referenceConditionPolicy: {
      kind: "exact-match-required"
    },
    ...overrides
  };
}

const exactOperatingConditions = {
  temperatureC: 25,
  incidenceAngleDegreesFromNormal:
    0,
  polarization:
    "unpolarized" as const
};

describe(
  "sensor response application compatibility",
  () => {
    it("establishes structural compatibility without authorizing signal conversion", () => {
      const result =
        assessSensorResponseApplicationCompatibility({
          reduction:
            makeReduction(),
          applicationProfile:
            applicationProfile(),
          sourcePlane: {
            value:
              "site-incident",
            evidence: evidence(
              "test:source-plane"
            )
          },
          operatingConditions:
            exactOperatingConditions
        });

      expect(
        result.value
          .compatibilityStatus
      ).toBe("compatible");
      expect(
        result.value
          .structuralCompatibilityEstablished
      ).toBe(true);
      expect(
        result.value.blockers
      ).toEqual([]);
      expect(
        result.value
          .requiredSignalPath
      ).toBe(
        "photon-rate-to-electrons"
      );
      expect(
        result.value
          .signalConversionAuthorized
      ).toBe(false);
      expect(
        result.value
          .responseApplicationPerformed
      ).toBe(false);
      expect(
        result.value
          .operatingRangeCompatibilityAssessed
      ).toBe(false);
    });

    it("routes A/W responsivity to a distinct future current path", () => {
      const reduction =
        makeReduction(
          "responsivity"
        );
      const result =
        assessSensorResponseApplicationCompatibility({
          reduction,
          applicationProfile:
            applicationProfile({
              spectralResponseProfileId:
                "spectral-aw",
              spatialResponseModel: {
                kind:
                  "uniform-over-geometric-sensitive-aperture",
                scientificStatus:
                  "approximation",
                evidence: evidence(
                  "test:uniformity-aw"
                ),
                limitation:
                  "Test-only separability approximation."
              }
            }),
          sourcePlane: {
            value:
              "sensor-package-incident",
            evidence: evidence(
              "test:package-plane"
            )
          },
          operatingConditions:
            exactOperatingConditions
        });

      expect(
        result.value
          .requiredSignalPath
      ).toBe(
        "radiant-power-to-current"
      );
      expect(
        result.value
          .compatibilityStatus
      ).toBe(
        "compatible-approximation"
      );
      expect(
        result.value
          .quantifiedResponseUncertaintyAvailable
      ).toBe(false);
    });

    it("blocks full-site total-pixel normalization against geometric-aperture flux", () => {
      const reduction =
        makeReduction();
      const result =
        assessSensorResponseApplicationCompatibility({
          reduction,
          applicationProfile:
            applicationProfile({
              incidentAreaBasis: {
                kind:
                  "full-site-cell",
                areaSquareMicrometers:
                  reduction
                    .nominalSiteCellAreaSquareMicrometers ??
                  1_000_000
              }
            }),
          sourcePlane: {
            value:
              "site-incident",
            evidence: evidence(
              "test:site-plane"
            )
          },
          operatingConditions:
            exactOperatingConditions
        });

      expect(
        result.value
          .compatibilityStatus
      ).toBe("blocked");
      expect(
        result.value.blockers
      ).toContain(
        "incident-area-basis-not-currently-integrated"
      );
      expect(
        result.value
          .currentlyIntegratedAreaBasis
      ).toBe(
        "geometric-sensitive-aperture"
      );
      expect(
        result.value
          .nominalSiteCellAreaSquareMicrometers
      ).toBe(1_000_000);
    });

    it("blocks source-plane mismatch and unresolved wavelength basis", () => {
      const reduction =
        makeReduction();
      const result =
        assessSensorResponseApplicationCompatibility({
          reduction: {
            ...reduction,
            wavelengthBasisResolved:
              false
          },
          applicationProfile:
            applicationProfile(),
          sourcePlane: {
            value:
              "sensor-package-incident",
            evidence: evidence(
              "test:wrong-plane"
            )
          },
          operatingConditions:
            exactOperatingConditions
        });

      expect(
        result.value.blockers
      ).toEqual(
        expect.arrayContaining([
          "source-plane-mismatch",
          "wavelength-basis-unresolved"
        ])
      );
    });

    it("blocks area mismatch and missing spatial uniformity evidence", () => {
      const result =
        assessSensorResponseApplicationCompatibility({
          reduction:
            makeReduction(),
          applicationProfile:
            applicationProfile({
              incidentAreaBasis: {
                kind:
                  "geometric-sensitive-aperture",
                areaSquareMicrometers:
                  400_000
              },
              spatialResponseModel: {
                kind:
                  "not-established",
                limitation:
                  "No spatial responsivity evidence."
              }
            }),
          sourcePlane: {
            value:
              "site-incident",
            evidence: evidence(
              "test:site-plane"
            )
          },
          operatingConditions:
            exactOperatingConditions
        });

      expect(
        result.value.blockers
      ).toEqual(
        expect.arrayContaining([
          "incident-area-mismatch",
          "spatial-response-uniformity-not-established"
        ])
      );
    });

    it("fails closed on exact reference-condition policy gaps and mismatches", () => {
      const reduction =
        makeReduction();

      const missingOperating =
        assessSensorResponseApplicationCompatibility({
          reduction,
          applicationProfile:
            applicationProfile(),
          sourcePlane: {
            value:
              "site-incident",
            evidence: evidence(
              "test:site-plane"
            )
          }
        });
      expect(
        missingOperating.value.blockers
      ).toContain(
        "operating-conditions-not-declared"
      );

      const mismatch =
        assessSensorResponseApplicationCompatibility({
          reduction,
          applicationProfile:
            applicationProfile(),
          sourcePlane: {
            value:
              "site-incident",
            evidence: evidence(
              "test:site-plane"
            )
          },
          operatingConditions: {
            ...exactOperatingConditions,
            temperatureC: 30
          }
        });
      expect(
        mismatch.value.blockers
      ).toContain(
        "operating-conditions-mismatch"
      );

      const noReference =
        assessSensorResponseApplicationCompatibility({
          reduction:
            makeReduction(
              "eqe",
              false
            ),
          applicationProfile:
            applicationProfile(),
          sourcePlane: {
            value:
              "site-incident",
            evidence: evidence(
              "test:site-plane"
            )
          },
          operatingConditions:
            exactOperatingConditions
        });
      expect(
        noReference.value.blockers
      ).toContain(
        "response-reference-conditions-not-declared"
      );
    });

    it("allows an explicit reference-condition assumption only as approximation", () => {
      const result =
        assessSensorResponseApplicationCompatibility({
          reduction:
            makeReduction(
              "eqe",
              false
            ),
          applicationProfile:
            applicationProfile({
              referenceConditionPolicy: {
                kind:
                  "assume-compatible",
                limitation:
                  "Test-only condition assumption.",
                evidence: evidence(
                  "test:condition-assumption"
                )
              }
            }),
          sourcePlane: {
            value:
              "site-incident",
            evidence: evidence(
              "test:site-plane"
            )
          }
        });

      expect(
        result.value.blockers
      ).toEqual([]);
      expect(
        result.value
          .compatibilityStatus
      ).toBe(
        "compatible-approximation"
      );
      expect(
        result.value.componentEvidence
          .referenceConditionAssumption
      ).toEqual(
        evidence(
          "test:condition-assumption"
        )
      );
    });

    it("blocks exact profile, aperture, and optical-stack mismatches", () => {
      const reduction =
        makeReduction();
      const result =
        assessSensorResponseApplicationCompatibility({
          reduction,
          applicationProfile:
            applicationProfile({
              spectralResponseProfileId:
                "wrong-response",
              colorSamplingProfileId:
                "wrong-color",
              channelId: "red",
              samplingApertureProfileId:
                "wrong-aperture",
              opticalStackProfileId:
                "wrong-stack"
            }),
          sourcePlane: {
            value:
              "site-incident",
            evidence: evidence(
              "test:site-plane"
            )
          },
          operatingConditions:
            exactOperatingConditions
        });

      expect(
        result.value.blockers
      ).toEqual(
        expect.arrayContaining([
          "spectral-response-profile-id-mismatch",
          "color-sampling-profile-id-mismatch",
          "channel-id-mismatch",
          "sampling-aperture-profile-id-mismatch",
          "optical-stack-profile-id-mismatch"
        ])
      );
    });

    it("fails closed when legacy/manual reductions lack newly required calibration identity", () => {
      const reduction =
        makeReduction();
      const legacy = {
        ...reduction
      };
      delete legacy
        .samplingApertureProfileId;
      delete legacy
        .opticalStackProfileId;

      const result =
        assessSensorResponseApplicationCompatibility({
          reduction: legacy,
          applicationProfile:
            applicationProfile(),
          sourcePlane: {
            value:
              "site-incident",
            evidence: evidence(
              "test:site-plane"
            )
          },
          operatingConditions:
            exactOperatingConditions
        });

      expect(
        result.value.blockers
      ).toEqual(
        expect.arrayContaining([
          "sampling-aperture-profile-id-missing",
          "optical-stack-profile-id-missing"
        ])
      );
    });

    it("validates application profile metadata at runtime", () => {
      expect(() =>
        parseSensorResponseApplicationProfile({
          ...applicationProfile(),
          schemaVersion: "9.9.9"
        })
      ).toThrow("schemaVersion");

      expect(() =>
        parseSensorResponseApplicationProfile({
          ...applicationProfile(),
          incidentAreaBasis: {
            kind: "bad",
            areaSquareMicrometers:
              480_000
          }
        })
      ).toThrow(
        "incidentAreaBasis.kind"
      );

      expect(() =>
        parseSensorResponseApplicationProfile({
          ...applicationProfile(),
          spatialResponseModel: {
            kind:
              "uniform-over-geometric-sensitive-aperture",
            scientificStatus:
              "approximation",
            evidence: evidence(
              "test:approx"
            )
          }
        })
      ).toThrow(
        "limitation is required"
      );
    });

    it("rejects malformed source planes and non-pre-response reductions", () => {
      const reduction =
        makeReduction();

      expect(() =>
        assessSensorResponseApplicationCompatibility({
          reduction,
          applicationProfile:
            applicationProfile(),
          sourcePlane: {
            value: "bad" as never,
            evidence: evidence(
              "test:bad-plane"
            )
          },
          operatingConditions:
            exactOperatingConditions
        })
      ).toThrow("sourcePlane.value");

      expect(() =>
        assessSensorResponseApplicationCompatibility({
          reduction: {
            ...reduction,
            spectralResponseApplicationPerformed:
              true
          } as unknown as typeof reduction,
          applicationProfile:
            applicationProfile(),
          sourcePlane: {
            value:
              "site-incident",
            evidence: evidence(
              "test:site-plane"
            )
          },
          operatingConditions:
            exactOperatingConditions
        })
      ).toThrow(
        "pre-response"
      );
    });
  }
);
