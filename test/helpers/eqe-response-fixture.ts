// SPDX-License-Identifier: Apache-2.0
import { type SensorColorSamplingProfile, type SensorResponseApplicationProfile,
  type SensorResponseOperatingRangeProfile, type SensorSpectralResponseProfile } from "../../src/index.js";
export const evidence = (ref: string) =>
  [{
    sourceOrigin: "photivra" as const,
    sourceReference: ref,
    reuseStatus: "photivra-owned" as const
  }] as const;

export const operatingConditions = {
  temperatureC: 25,
  incidenceAngleDegreesFromNormal: 0,
  polarization: "unpolarized" as const
};

export function colorProfile(): SensorColorSamplingProfile {
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

export function spectralProfile(
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

export function applicationProfile(): SensorResponseApplicationProfile {
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

export function operatingProfile(
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

