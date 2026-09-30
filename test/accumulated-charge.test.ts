import { describe, expect, it } from "vitest";

import {
  composeSensorAccumulatedCharge,
  parseSensorAccumulatedChargeCompletenessProfile,
  parseSensorAdditionalStoredChargeComponent,
  type SensorAccumulatedChargeCompletenessProfile,
  type SensorAdditionalStoredChargeComponent,
  type SensorDarkCurrentCharge,
  type SensorEqeExposureIntegration
} from "../src/index.js";

const evidence = (ref: string) =>
  [{
    sourceOrigin: "photivra" as const,
    sourceReference: ref,
    reuseStatus: "photivra-owned" as const
  }] as const;

const site = { x: 1, y: 0 };

function photo(
  overrides:
    Partial<SensorEqeExposureIntegration> = {}
): SensorEqeExposureIntegration {
  return {
    kind: "eqe-expected-counts",
    colorSamplingProfileId:
      "color",
    channelId: "green",
    site,
    bindingId: "binding",
    stationarityProfileId:
      "stationarity",
    stationarityStatus:
      "established",
    timeReference:
      "first-opening-boundary-phase",
    startOffsetSecondsFromOpeningReference:
      0.1,
    endOffsetSecondsFromOpeningReference:
      0.6,
    localExposureDurationSeconds:
      0.5,
    integrationMethod:
      "constant-rate-times-local-exposure-duration",
    timeStationarityEstablished:
      true,
    temporalIntegrationApplied:
      true,
    exposureDurationApplied:
      true,
    timeVaryingSignalIntegrated:
      false,
    multiFrameSequenceIntegrated:
      false,
    darkChargeIncluded: false,
    otherChargeIncluded: false,
    accumulatedSignalCompleteness:
      "photo-signal-only",
    physicalFullWellAssessmentAuthorized:
      false,
    cameraSaturationAssessmentAuthorized:
      false,
    saturationAssessed: false,
    shotNoiseApplied: false,
    readNoiseApplied: false,
    adcQuantizationApplied:
      false,
    rawCodeValueProduced: false,
    componentEvidence: {
      stationarity:
        evidence("stationarity"),
      exposureBinding: {
        binding:
          evidence("binding"),
        colorSamplingProfile:
          evidence("color"),
        nominalExposureDuration:
          evidence("duration"),
        openingBoundary: [],
        closingBoundary: []
      }
    },
    incidentPhotonRatePerSecond:
      100,
    expectedGeneratedElectronRatePerSecond:
      40,
    expectedIncidentPhotonCount:
      50,
    expectedGeneratedElectronCount:
      20,
    countsAreExpectationValues:
      true,
    integerPhotonCountSampled:
      false,
    integerElectronCountSampled:
      false,
    chargeCalculated: false,
    currentCalculated: false,
    ...overrides
  };
}

function dark(
  overrides:
    Partial<SensorDarkCurrentCharge> = {}
): SensorDarkCurrentCharge {
  return {
    darkCurrentProfileId: "dark",
    colorSamplingProfileId:
      "color",
    channelId: "green",
    site,
    bindingId: "binding",
    stationarityProfileId:
      "stationarity",
    timeReference:
      "first-opening-boundary-phase",
    startOffsetSecondsFromOpeningReference:
      0.1,
    endOffsetSecondsFromOpeningReference:
      0.6,
    operatingTemperatureC: 20,
    temperatureModel:
      "fixed-reference-temperature",
    temperatureInterpolationUsed:
      false,
    darkCurrentElectronsPerSecond:
      4,
    localExposureDurationSeconds:
      0.5,
    expectedDarkElectronCount:
      2,
    countMeaning:
      "expected-thermally-generated-electrons",
    expectationValueOnly: true,
    integerDarkElectronCountSampled:
      false,
    darkShotNoiseApplied: false,
    darkCurrentCompensationApplied:
      false,
    spatialDarkCurrentNonuniformityModeled:
      true,
    photoSignalIncluded: false,
    otherChargeIncluded: false,
    physicalFullWellAssessmentAuthorized:
      false,
    saturationAssessed: false,
    componentEvidence: {
      darkCurrent:
        evidence("dark"),
      siteApproximation: [],
      exposure:
        photo().componentEvidence
    },
    ...overrides
  };
}

function component(
  componentId = "leakage",
  overrides:
    Partial<SensorAdditionalStoredChargeComponent> = {}
): SensorAdditionalStoredChargeComponent {
  return {
    componentId,
    kind: "leakage",
    colorSamplingProfileId:
      "color",
    channelId: "green",
    site,
    bindingId: "binding",
    timeReference:
      "first-opening-boundary-phase",
    startOffsetSecondsFromOpeningReference:
      0.1,
    endOffsetSecondsFromOpeningReference:
      0.6,
    accountingMeaning:
      "incremental-stored-electrons-beyond-photo-and-modeled-dark-current",
    expectedElectronCount: 3,
    scientificStatus:
      "calibrated",
    uncertainty: {
      kind: "relative",
      fraction: 0.1,
      basis: "test"
    },
    evidence:
      evidence("component:" + componentId),
    ...overrides
  };
}

function completeness(
  ids: readonly string[] = ["leakage"],
  overrides:
    Partial<SensorAccumulatedChargeCompletenessProfile> = {}
): SensorAccumulatedChargeCompletenessProfile {
  return {
    schemaVersion: "0.1.0",
    profileId: "complete",
    colorSamplingProfileId:
      "color",
    channelId: "green",
    site,
    bindingId: "binding",
    timeReference:
      "first-opening-boundary-phase",
    startOffsetSecondsFromOpeningReference:
      0.1,
    endOffsetSecondsFromOpeningReference:
      0.6,
    darkCurrentProfileId: "dark",
    includedAdditionalComponentIds:
      ids,
    coverageMeaning:
      "all-material-stored-electron-contributors-accounted-for",
    scientificStatus:
      "calibrated",
    evidence:
      evidence("completeness"),
    ...overrides
  };
}

describe(
  "sensor accumulated-charge completeness",
  () => {
    it("composes photo, dark, and explicitly incremental additional stored electrons", () => {
      const result =
        composeSensorAccumulatedCharge({
          photoSignal: photo(),
          darkCharge: dark(),
          additionalChargeComponents: [
            component()
          ],
          completenessProfile:
            completeness()
        });

      expect(
        result.value
          .photoExpectedElectronCount
      ).toBe(20);
      expect(
        result.value
          .darkExpectedElectronCount
      ).toBe(2);
      expect(
        result.value
          .additionalExpectedElectronCount
      ).toBe(3);
      expect(
        result.value
          .totalExpectedStoredElectronCount
      ).toBe(25);
      expect(
        result.value
          .physicalFullWellAssessmentAuthorized
      ).toBe(true);
      expect(
        result.value
          .cameraSaturationAssessmentAuthorized
      ).toBe(false);
      expect(
        result.value.saturationAssessed
      ).toBe(false);
    });

    it("allows no additional components only when completeness evidence explicitly declares none are material", () => {
      const result =
        composeSensorAccumulatedCharge({
          photoSignal: photo(),
          darkCharge: dark(),
          additionalChargeComponents: [],
          completenessProfile:
            completeness([])
        });

      expect(
        result.value
          .additionalExpectedElectronCount
      ).toBe(0);
      expect(
        result.value
          .otherChargeIncluded
      ).toBe(false);
      expect(
        result.value
          .accumulatedChargeCompleteness
      ).toBe(
        "complete-for-physical-storage-capacity-assessment"
      );
    });

    it("binds dark charge to the exact exposure event, not just equal duration", () => {
      expect(() =>
        composeSensorAccumulatedCharge({
          photoSignal: photo(),
          darkCharge: dark({
            bindingId:
              "different-binding"
          }),
          additionalChargeComponents: [
            component()
          ],
          completenessProfile:
            completeness()
        })
      ).toThrow(
        "exact same uncombined EQE local exposure event"
      );

      expect(() =>
        composeSensorAccumulatedCharge({
          photoSignal: photo(),
          darkCharge: dark({
            startOffsetSecondsFromOpeningReference:
              0.2,
            endOffsetSecondsFromOpeningReference:
              0.7
          }),
          additionalChargeComponents: [
            component()
          ],
          completenessProfile:
            completeness()
        })
      ).toThrow(
        "exact same uncombined EQE local exposure event"
      );
    });

    it("requires additional components to be incremental beyond photo and modeled dark current", () => {
      expect(() =>
        parseSensorAdditionalStoredChargeComponent({
          ...component(),
          accountingMeaning:
            "includes-dark-current"
        })
      ).toThrow(
        "accountingMeaning"
      );
    });

    it("requires additional component IDs to match the completeness declaration exactly", () => {
      expect(() =>
        composeSensorAccumulatedCharge({
          photoSignal: photo(),
          darkCharge: dark(),
          additionalChargeComponents: [
            component("leakage")
          ],
          completenessProfile:
            completeness(["other"])
        })
      ).toThrow(
        "must exactly match"
      );
    });

    it("rejects duplicate additional component identities", () => {
      expect(() =>
        composeSensorAccumulatedCharge({
          photoSignal: photo(),
          darkCharge: dark(),
          additionalChargeComponents: [
            component("same"),
            component("same")
          ],
          completenessProfile:
            completeness(["same"])
        })
      ).toThrow(
        "component IDs must be unique"
      );
    });

    it("fails closed when an additional component belongs to another exposure", () => {
      expect(() =>
        composeSensorAccumulatedCharge({
          photoSignal: photo(),
          darkCharge: dark(),
          additionalChargeComponents: [
            component("leakage", {
              site: { x: 0, y: 0 }
            })
          ],
          completenessProfile:
            completeness(["leakage"])
        })
      ).toThrow(
        "exact same local exposure event"
      );
    });

    it("requires completeness evidence to bind the exact dark profile and exposure", () => {
      expect(() =>
        composeSensorAccumulatedCharge({
          photoSignal: photo(),
          darkCharge: dark(),
          additionalChargeComponents: [
            component()
          ],
          completenessProfile:
            completeness(["leakage"], {
              darkCurrentProfileId:
                "other-dark"
            })
        })
      ).toThrow(
        "exact photo/dark exposure pipeline"
      );
    });

    it("keeps approximate completeness explicitly labeled", () => {
      const result =
        composeSensorAccumulatedCharge({
          photoSignal: photo(),
          darkCharge: dark(),
          additionalChargeComponents: [],
          completenessProfile:
            completeness([], {
              scientificStatus:
                "approximation",
              limitation:
                "Minor unmodeled storage sources are assumed negligible."
            })
        });

      expect(result.provenance.kind)
        .toBe("approximation");
      expect(
        result.value
          .completenessScientificStatus
      ).toBe("approximation");
      expect(
        result.value
          .physicalFullWellAssessmentAuthorized
      ).toBe(true);
    });

    it("requires a limitation for approximate completeness", () => {
      expect(() =>
        parseSensorAccumulatedChargeCompletenessProfile({
          ...completeness([]),
          scientificStatus:
            "approximation"
        })
      ).toThrow(
        "limitation is required"
      );
    });

    it("requires quantified uncertainty for calibrated additional charge", () => {
      expect(() =>
        parseSensorAdditionalStoredChargeComponent({
          ...component(),
          uncertainty: {
            kind:
              "not-quantified",
            limitation:
              "unknown"
          }
        })
      ).toThrow(
        "must declare quantified"
      );
    });

    it("rejects modified photo/dark completeness flags", () => {
      expect(() =>
        composeSensorAccumulatedCharge({
          photoSignal: photo({
            darkChargeIncluded:
              true
          } as never),
          darkCharge: dark(),
          additionalChargeComponents: [
            component()
          ],
          completenessProfile:
            completeness()
        })
      ).toThrow(
        "photo-signal-only"
      );

      expect(() =>
        composeSensorAccumulatedCharge({
          photoSignal: photo(),
          darkCharge: dark({
            otherChargeIncluded:
              true
          } as never),
          additionalChargeComponents: [
            component()
          ],
          completenessProfile:
            completeness()
        })
      ).toThrow(
        "exact same uncombined"
      );
    });

    it("fails closed on total accumulated-charge overflow", () => {
      expect(() =>
        composeSensorAccumulatedCharge({
          photoSignal: photo({
            expectedGeneratedElectronCount:
              Number.MAX_VALUE
          }),
          darkCharge: dark({
            expectedDarkElectronCount:
              Number.MAX_VALUE
          }),
          additionalChargeComponents: [],
          completenessProfile:
            completeness([])
        })
      ).toThrow(
        "totals must remain finite"
      );
    });
  }
);
