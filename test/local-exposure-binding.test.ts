import { describe, expect, it } from "vitest";

import {
  bindSensorRateToLocalExposure,
  type CalculateCaptureExposureWindowsInput,
  type NativeEffectiveRasterColorSamplingBindingProfile,
  type SensorColorSamplingProfile,
  type SensorEqeElectronRate,
  type SensorResponsivityPhotocurrent
} from "../src/index.js";

const evidence = (ref: string) =>
  [{
    sourceOrigin: "photivra" as const,
    sourceReference: ref,
    reuseStatus: "photivra-owned" as const
  }] as const;

const nativeRaster = {
  pixelWidth: 4,
  pixelHeight: 3
};

function colorProfile():
SensorColorSamplingProfile {
  return {
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
        "green",
        "green",
        "blue"
      ],
      anchor:
        "native-sensor-top-left-site"
    }
  };
}

function binding(
  sitesPerNativeSampleX = 1,
  sitesPerNativeSampleY = 1
): NativeEffectiveRasterColorSamplingBindingProfile {
  return {
    schemaVersion: "0.1.0",
    bindingId: "binding",
    colorSamplingProfileId:
      "color",
    nativeRaster,
    evidence:
      evidence("test:binding"),
    relationship: {
      kind:
        "regular-native-effective-sample-blocks",
      sitesPerNativeSampleX,
      sitesPerNativeSampleY,
      anchor:
        "shared-native-top-left"
    }
  };
}

function seconds(
  value: number,
  ref: string
) {
  return {
    value,
    unit: "s" as const,
    evidence: evidence(ref)
  };
}

function exposure(
  extra:
    Partial<
      CalculateCaptureExposureWindowsInput
    > = {}
): Omit<
  CalculateCaptureExposureWindowsInput,
  "samplePointsNative"
> {
  return {
    nativeRaster,
    shutterMechanism:
      "electronic",
    nominalExposureDurationSeconds:
      seconds(
        0.01,
        "test:nominal"
      ),
    opening: {
      kind: "simultaneous"
    },
    closing: {
      kind: "simultaneous"
    },
    ...extra
  };
}

function eqeRate(
  site = { x: 1, y: 0 },
  channelId = "green"
): SensorEqeElectronRate {
  return {
    colorSamplingProfileId:
      "color",
    responseProfileId:
      "spectral",
    responseApplicationProfileId:
      "application",
    operatingRangeProfileId:
      "range",
    site,
    channelId,
    sourceResponseKind:
      "effective-external-quantum-efficiency",
    responseScope:
      "site-incident-effective-channel-response",
    responseReferencePlane:
      "site-incident",
    wavelengthBasis:
      "vacuum",
    wavelengthRangeNanometers: {
      minimum: 400,
      maximum: 500
    },
    spectralNodeCount: 1,
    perWavelength: [],
    incidentPhotonRatePerSecond:
      100,
    expectedGeneratedElectronRatePerSecond:
      40,
    summationMethod:
      "kahan-compensated",
    responseApplicationPerformed:
      true,
    quantumEfficiencyApplied:
      true,
    spectralResponsivityApplied:
      false,
    channelFilterTransmissionApplied:
      false,
    photonRateCalculated: true,
    electronRateCalculated: true,
    photonCountCalculated:
      false,
    electronCountCalculated:
      false,
    currentCalculated: false,
    temporalIntegrationApplied:
      false,
    exposureDurationApplied:
      false,
    saturationAssessed: false,
    shotNoiseApplied: false,
    readNoiseApplied: false,
    adcQuantizationApplied:
      false,
    rawCodeValueProduced:
      false,
    responseUncertaintyPropagated:
      false,
    photonEnergyUncertaintyPropagated:
      false,
    quadratureConvergenceErrorEstimated:
      false
  };
}

function currentRate(
  site = { x: 2, y: 0 },
  channelId = "red"
): SensorResponsivityPhotocurrent {
  return {
    colorSamplingProfileId:
      "color",
    responseProfileId:
      "spectral-aw",
    responseApplicationProfileId:
      "application-aw",
    operatingRangeProfileId:
      "range-aw",
    electricalApplicabilityProfileId:
      "electrical",
    site,
    channelId,
    sourceResponseKind:
      "effective-spectral-responsivity",
    responseScope:
      "site-incident-effective-channel-response",
    responseReferencePlane:
      "site-incident",
    wavelengthBasis:
      "vacuum",
    wavelengthRangeNanometers: {
      minimum: 400,
      maximum: 500
    },
    electricalReferenceConditions: {
      bias: {
        kind:
          "zero-bias-photovoltaic"
      },
      readoutLoad: {
        kind:
          "virtual-ground-current-readout"
      }
    },
    operatingElectricalConditions: {
      bias: {
        kind:
          "zero-bias-photovoltaic"
      },
      readoutLoad: {
        kind:
          "virtual-ground-current-readout"
      }
    },
    electricalConditionPolicy: {
      kind:
        "exact-match-required"
    },
    electricalCompatibility:
      "exact-match",
    spectralNodeCount: 1,
    perWavelength: [],
    photocurrentMagnitudeAmperes:
      1e-6,
    currentSignConvention:
      "magnitude-only-no-circuit-polarity",
    summationMethod:
      "kahan-compensated",
    responseApplicationPerformed:
      true,
    spectralResponsivityApplied:
      true,
    quantumEfficiencyApplied:
      false,
    photonRateCalculated:
      false,
    electronRateCalculated:
      false,
    currentCalculated: true,
    chargeCalculated: false,
    temporalResponseModel:
      "quasi-static-steady-state-only",
    detectorBandwidthModeled:
      false,
    transimpedanceGainApplied:
      false,
    voltageCalculated: false,
    temporalIntegrationApplied:
      false,
    exposureDurationApplied:
      false,
    saturationAssessed: false,
    readoutElectronicsLinearityAssessed:
      false,
    shotNoiseApplied: false,
    readNoiseApplied: false,
    adcQuantizationApplied:
      false,
    rawCodeValueProduced:
      false,
    responseUncertaintyPropagated:
      false,
    electricalApplicabilityUncertaintyPropagated:
      false,
    quadratureConvergenceErrorEstimated:
      false,
    componentEvidence: {
      electricalApplicability:
        evidence(
          "test:electrical"
        ),
      electricalConditionAssumption:
        []
    }
  };
}

describe(
  "sensor rate local exposure binding",
  () => {
    it("maps a one-to-one color site to the matching native effective sample center", () => {
      const result =
        bindSensorRateToLocalExposure({
          rate: eqeRate(),
          colorSamplingProfile:
            colorProfile(),
          bindingProfile: binding(),
          exposureWindowInput:
            exposure()
        });

      expect(
        result.value.rateDomain
      ).toBe("eqe-electron-rate");
      expect(result.value.site)
        .toEqual({ x: 1, y: 0 });
      expect(
        result.value
          .nativeRasterPoint
      ).toEqual({
        x: 1.5,
        y: 0.5
      });
      expect(
        result.value
          .localExposureDurationSeconds
      ).toBeCloseTo(0.01, 12);
      expect(
        result.value
          .constantRateTemporalIntegrationAuthorized
      ).toBe(false);
      expect(
        result.value
          .timeStationarityEstablished
      ).toBe(false);
      expect(
        result.value
          .physicalPhotodiodeTimingRegistrationEstablished
      ).toBe(false);
    });

    it("resolves spatially varying opening/closing timing at the exact bound point", () => {
      const result =
        bindSensorRateToLocalExposure({
          rate: eqeRate(
            { x: 1, y: 2 },
            "green"
          ),
          colorSamplingProfile:
            colorProfile(),
          bindingProfile: binding(),
          exposureWindowInput:
            exposure({
              opening: {
                kind:
                  "uniform-linear-native-scan",
                directionNative: {
                  value:
                    "top-to-bottom",
                  evidence:
                    evidence(
                      "test:open-direction"
                    )
                },
                traversalDurationSeconds:
                  seconds(
                    0.006,
                    "test:open-duration"
                  )
              },
              closing: {
                kind:
                  "uniform-linear-native-scan",
                directionNative: {
                  value:
                    "top-to-bottom",
                  evidence:
                    evidence(
                      "test:close-direction"
                    )
                },
                traversalDurationSeconds:
                  seconds(
                    0.003,
                    "test:close-duration"
                  )
              }
            })
        }).value;

      expect(
        result.nativeRasterPoint
      ).toEqual({
        x: 1.5,
        y: 2.5
      });
      expect(
        result.localExposureWindow
          .startOffsetSecondsFromOpeningReference
      ).toBeCloseTo(
        (2.5 / 3) * 0.006,
        12
      );
      expect(
        result.localExposureWindow
          .endOffsetSecondsFromOpeningReference
      ).toBeCloseTo(
        0.01 +
          (2.5 / 3) * 0.003,
        12
      );
      expect(
        result.localExposureDurationSeconds
      ).toBeCloseTo(
        0.01 -
          (2.5 / 3) * 0.003,
        12
      );
      expect(
        result.componentEvidence
          .openingBoundary.length
      ).toBe(2);
      expect(
        result.componentEvidence
          .closingBoundary.length
      ).toBe(2);
    });

    it("supports the A/W current-rate domain without integrating charge", () => {
      const result =
        bindSensorRateToLocalExposure({
          rate:
            currentRate(
              { x: 2, y: 0 },
              "red"
            ),
          colorSamplingProfile:
            colorProfile(),
          bindingProfile: binding(),
          exposureWindowInput:
            exposure()
        }).value;

      expect(
        result.rateDomain
      ).toBe(
        "responsivity-photocurrent"
      );
      expect(
        result.temporalIntegrationApplied
      ).toBe(false);
      expect(
        result.exposureEventMeaning
      ).toBe(
        "single-capture-local-exposure-window"
      );
    });

    it("rejects legacy/manual rate results without exact site identity", () => {
      const rate = {
        ...eqeRate()
      };
      delete rate.site;

      expect(() =>
        bindSensorRateToLocalExposure({
          rate,
          colorSamplingProfile:
            colorProfile(),
          bindingProfile: binding(),
          exposureWindowInput:
            exposure()
        })
      ).toThrow(
        "rate.site must be present"
      );
    });

    it("rejects channel mismatch at the exact color site", () => {
      expect(() =>
        bindSensorRateToLocalExposure({
          rate:
            eqeRate(
              { x: 0, y: 0 },
              "green"
            ),
          colorSamplingProfile:
            colorProfile(),
          bindingProfile: binding(),
          exposureWindowInput:
            exposure()
        })
      ).toThrow(
        "channelId does not match"
      );
    });

    it("fails closed for multi-site-per-native-sample timing relationships", () => {
      expect(() =>
        bindSensorRateToLocalExposure({
          rate: eqeRate(),
          colorSamplingProfile:
            colorProfile(),
          bindingProfile:
            binding(2, 1),
          exposureWindowInput:
            exposure()
        })
      ).toThrow(
        "one-to-one"
      );
    });

    it("rejects sites outside the grid established by the binding", () => {
      expect(() =>
        bindSensorRateToLocalExposure({
          rate:
            eqeRate(
              { x: 4, y: 0 },
              "red"
            ),
          colorSamplingProfile:
            colorProfile(),
          bindingProfile: binding(),
          exposureWindowInput:
            exposure()
        })
      ).toThrow(
        "outside the color-sampling site grid"
      );
    });

    it("fails when the active capture excludes the bound site", () => {
      expect(() =>
        bindSensorRateToLocalExposure({
          rate: eqeRate(),
          colorSamplingProfile:
            colorProfile(),
          bindingProfile: binding(),
          exposureWindowInput:
            exposure({
              activeCaptureRect: {
                x: 2,
                y: 0,
                width: 2,
                height: 3
              }
            })
        })
      ).toThrow(
        "activeCaptureRect edge-coordinate bounds"
      );
    });

    it("rejects already-integrated or malformed rate-domain inputs", () => {
      expect(() =>
        bindSensorRateToLocalExposure({
          rate: {
            ...eqeRate(),
            temporalIntegrationApplied:
              true
          } as never,
          colorSamplingProfile:
            colorProfile(),
          bindingProfile: binding(),
          exposureWindowInput:
            exposure()
        })
      ).toThrow(
        "pre-temporal"
      );

      expect(() =>
        bindSensorRateToLocalExposure({
          rate: {
            ...currentRate(),
            detectorBandwidthModeled:
              true
          } as never,
          colorSamplingProfile:
            colorProfile(),
          bindingProfile: binding(),
          exposureWindowInput:
            exposure()
        })
      ).toThrow(
        "quasi-static"
      );
    });

    it("rejects a binding for another color topology or raster", () => {
      expect(() =>
        bindSensorRateToLocalExposure({
          rate: eqeRate(),
          colorSamplingProfile:
            colorProfile(),
          bindingProfile: {
            ...binding(),
            colorSamplingProfileId:
              "other"
          },
          exposureWindowInput:
            exposure()
        })
      ).toThrow(
        "colorSamplingProfileId"
      );

      expect(() =>
        bindSensorRateToLocalExposure({
          rate: eqeRate(),
          colorSamplingProfile:
            colorProfile(),
          bindingProfile: binding(),
          exposureWindowInput:
            exposure({
              nativeRaster: {
                pixelWidth: 8,
                pixelHeight: 6
              }
            })
        })
      ).toThrow(
        "nativeRaster must exactly match"
      );
    });
  }
);
