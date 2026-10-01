import { describe, expect, it } from "vitest";

import {
  assessSensorPhysicalChargeCapacity,
  calculateExpectedSensorReadout,
  createSensorRawCaptureSample,
  parseSensorChargeSamplingProfile,
  parseSensorRawReconstructionProfile,
  parseSensorReadoutConversionProfile,
  resolveCaptureModeColorSamplingContributors,
  resolveSensorRawReconstruction,
  resolveSensorReadoutRegime,
  simulateSensorChargeRealization,
  simulateSensorRawCode,
  type CaptureModeProfile,
  type NativeEffectiveRasterColorSamplingBindingProfile,
  type SensorAccumulatedChargeComposition,
  type SensorChargeRealization,
  type SensorChargeSamplingProfile,
  type SensorColorSamplingProfile,
  type SensorPhysicalChargeCapacityAssessment,
  type SensorPhysicalChargeCapacityProfile,
  type SensorRawCaptureSample,
  type SensorRawCodeSample,
  type SensorRawReconstructionProfile,
  type SensorReadoutConversionProfile
} from "../src/index.js";

type OwnedEvidence = readonly [{
  sourceOrigin: "photivra";
  sourceReference: string;
  reuseStatus: "photivra-owned";
}];

const evidence = (
  ref: string
): OwnedEvidence => [{
  sourceOrigin: "photivra",
  sourceReference: ref,
  reuseStatus: "photivra-owned"
}] as const;

const site = {
  x: 1,
  y: 0
};

const charge = (
  total = 25,
  overrides:
    Partial<SensorAccumulatedChargeComposition> = {}
): SensorAccumulatedChargeComposition => ({
  completenessProfileId:
    "complete",
  colorSamplingProfileId:
    "color",
  channelId: "green",
  site,
  bindingId: "binding",
  timeReference:
    "first-opening-boundary-phase",
  startOffsetSecondsFromOpeningReference:
    0,
  endOffsetSecondsFromOpeningReference:
    1,
  localExposureDurationSeconds:
    1,
  photoExpectedElectronCount:
    Math.max(0, total - 5),
  darkExpectedElectronCount: 2,
  additionalExpectedElectronCount:
    3,
  totalExpectedStoredElectronCount:
    total,
  additionalComponents: [{
    componentId: "leakage",
    kind: "leakage",
    expectedElectronCount: 3,
    scientificStatus:
      "approximation",
    uncertainty: {
      kind: "not-quantified",
      limitation: "test"
    },
    evidence:
      evidence("leakage")
  }],
  accumulatedChargeCompleteness:
    "complete-for-physical-storage-capacity-assessment",
  completenessScientificStatus:
    "approximation",
  allCountsAreExpectationValues:
    true,
  integerChargeSampled: false,
  photoSignalIncluded: true,
  darkChargeIncluded: true,
  otherChargeIncluded: true,
  darkShotNoiseApplied: false,
  photoShotNoiseApplied: false,
  readNoiseApplied: false,
  physicalFullWellAssessmentAuthorized:
    true,
  cameraSaturationAssessmentAuthorized:
    false,
  saturationAssessed: false,
  bloomingModeled: false,
  adcQuantizationApplied: false,
  rawCodeValueProduced: false,
  componentEvidence: {
    completeness:
      evidence("complete"),
    photoSignal: {
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
    darkCurrent: {
      darkCurrent:
        evidence("dark"),
      siteApproximation: [],
      exposure: {
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
      }
    }
  },
  ...overrides
});

const capacityProfile =
  (): SensorPhysicalChargeCapacityProfile => ({
    schemaVersion: "0.1.0",
    profileId: "capacity",
    colorSamplingProfileId:
      "color",
    channelId: "green",
    capacityMeaning:
      "physical-charge-storage-capacity-electrons",
    capacityElectrons: 100,
    scientificStatus:
      "calibrated",
    uncertainty: {
      kind: "relative",
      fraction: 0.05,
      basis: "test"
    },
    evidence:
      evidence("capacity"),
    siteApplicability: {
      kind: "exact-site",
      site
    },
    operatingState: {
      stateId: "state-a",
      evidence:
        evidence("state-a")
    },
    temperatureApplicability: {
      kind:
        "exact-reference-temperature",
      temperatureC: 20
    }
  });

const capacity = (
  accumulated =
    charge()
): SensorPhysicalChargeCapacityAssessment =>
  assessSensorPhysicalChargeCapacity({
    accumulatedCharge:
      accumulated,
    capacityProfile:
      capacityProfile(),
    operatingStateId: "state-a",
    operatingTemperatureC: 20
  }).value;

const samplingProfile =
  (
    model:
      "poisson" |
      "deterministic-expected-electron-equivalent" =
      "deterministic-expected-electron-equivalent"
  ): SensorChargeSamplingProfile =>
    parseSensorChargeSamplingProfile({
      schemaVersion: "0.1.0",
      profileId:
        "charge-sampling",
      completenessProfileId:
        "complete",
      scientificStatus:
        "approximation",
      photoShotNoiseModel:
        "poisson",
      darkShotNoiseModel:
        "poisson",
      additionalComponentPolicies: [{
        componentId: "leakage",
        model
      }],
      evidence:
        evidence("charge-sampling"),
      limitations: [
        "Test charge sampling profile."
      ]
    });

const readoutProfile =
  (): SensorReadoutConversionProfile =>
    parseSensorReadoutConversionProfile({
      schemaVersion: "0.1.0",
      profileId:
        "readout",
      colorSamplingProfileId:
        "color",
      channelId: "green",
      regimeSelectionOwnedBy:
        "explicit-upstream-camera-state-not-inferred-from-iso",
      regimes: [
        {
          regimeId: "base",
          scientificStatus:
            "approximation",
          systemConversionGainElectronsPerCode: {
            value: 0.5,
            evidence:
              evidence("gain-base")
          },
          preAdcSaturationElectronEquivalent: {
            value: 90,
            evidence:
              evidence("analog-limit-base")
          },
          readNoiseComponents: [
            {
              componentId:
                "input-read",
              rmsElectrons: {
                value: 2,
                evidence:
                  evidence("read-rms")
              },
              evidence:
                evidence("read-component")
            }
          ],
          adc: {
            bitDepth: 12,
            blackLevelCode: 64,
            digitalSaturationCode:
              4095,
            transfer:
              "uniform-round-half-up"
          },
          evidence:
            evidence("regime-base"),
          limitations: [
            "Generic test regime."
          ]
        },
        {
          regimeId:
            "high-gain",
          scientificStatus:
            "approximation",
          systemConversionGainElectronsPerCode: {
            value: 0.25,
            evidence:
              evidence("gain-high")
          },
          preAdcSaturationElectronEquivalent: {
            value: 50,
            evidence:
              evidence("analog-limit-high")
          },
          readNoiseComponents: [
            {
              componentId:
                "input-read",
              rmsElectrons: {
                value: 1,
                evidence:
                  evidence("read-high")
              },
              evidence:
                evidence("read-component-high")
            }
          ],
          adc: {
            bitDepth: 12,
            blackLevelCode: 64,
            digitalSaturationCode:
              3500,
            transfer:
              "uniform-round-half-up"
          },
          evidence:
            evidence("regime-high"),
          limitations: [
            "Generic high-gain test regime."
          ]
        }
      ],
      evidence:
        evidence("readout-profile")
    });

describe("sensor stochastic charge realization", () => {
  it("produces deterministic seeded photo/dark shot-noise realization separate from expectation values", () => {
    const first =
      simulateSensorChargeRealization({
        accumulatedCharge:
          charge(),
        samplingProfile:
          samplingProfile(),
        seedUint32: 12345
      }).value;
    const second =
      simulateSensorChargeRealization({
        accumulatedCharge:
          charge(),
        samplingProfile:
          samplingProfile(),
        seedUint32: 12345
      }).value;

    expect(first).toEqual(second);
    expect(
      Number.isSafeInteger(
        first
          .photoRealizedElectronCount
      )
    ).toBe(true);
    expect(
      Number.isSafeInteger(
        first
          .darkRealizedElectronCount
      )
    ).toBe(true);
    expect(
      first.additionalComponents[0]
        ?.realizedElectronEquivalentCount
    ).toBe(3);
    expect(first).toMatchObject({
      photoShotNoiseApplied:
        true,
      darkShotNoiseApplied:
        true,
      electronicReadNoiseApplied:
        false,
      physicalSaturationApplied:
        false,
      adcQuantizationApplied:
        false,
      rawCodeValueProduced:
        false,
      deterministicSeededRealization:
        true
    });
    expect(
      charge()
        .totalExpectedStoredElectronCount
    ).toBe(25);
  });

  it("supports explicit Poisson sampling for an additional charge component and the large-mean Poisson path", () => {
    const large =
      charge(1000, {
        photoExpectedElectronCount:
          995,
        totalExpectedStoredElectronCount:
          1000
      });

    const result =
      simulateSensorChargeRealization({
        accumulatedCharge:
          large,
        samplingProfile:
          samplingProfile(
            "poisson"
          ),
        seedUint32: 7
      }).value;

    expect(
      Number.isSafeInteger(
        result
          .photoRealizedElectronCount
      )
    ).toBe(true);
    expect(
      Number.isSafeInteger(
        result
          .additionalComponents[0]
          ?.realizedElectronEquivalentCount
      )
    ).toBe(true);
    expect(
      result
        .totalRealizedStoredElectronEquivalentCount
    ).toBeGreaterThanOrEqual(0);
  });

  it("requires explicit sampling policy for every additional stored-charge component", () => {
    expect(() =>
      simulateSensorChargeRealization({
        accumulatedCharge:
          charge(),
        samplingProfile:
          parseSensorChargeSamplingProfile({
            ...samplingProfile(),
            additionalComponentPolicies:
              []
          }),
        seedUint32: 1
      })
    ).toThrow(
      "exactly one policy"
    );
  });

  it("fails closed on invalid seed and modified upstream charge state", () => {
    expect(() =>
      simulateSensorChargeRealization({
        accumulatedCharge:
          charge(),
        samplingProfile:
          samplingProfile(),
        seedUint32: -1
      })
    ).toThrow(
      "unsigned 32-bit integer"
    );

    expect(() =>
      simulateSensorChargeRealization({
        accumulatedCharge:
          charge(25, {
            saturationAssessed:
              true
          }),
        samplingProfile:
          samplingProfile(),
        seedUint32: 1
      })
    ).toThrow(
      "complete unsaturated pre-readout"
    );
  });
});

describe("sensor conversion/read-noise/ADC chain", () => {
  it("resolves explicit conversion regimes without any ISO inference", () => {
    const base =
      resolveSensorReadoutRegime({
        profile:
          readoutProfile(),
        regimeId: "base"
      });
    const high =
      resolveSensorReadoutRegime({
        profile:
          readoutProfile(),
        regimeId: "high-gain"
      });

    expect(
      base.regime
        .systemConversionGainElectronsPerCode
        .value
    ).toBe(0.5);
    expect(
      high.regime
        .systemConversionGainElectronsPerCode
        .value
    ).toBe(0.25);
    expect(
      base.regimeSelectionOwnedBy
    ).toBe(
      "explicit-upstream-camera-state-not-inferred-from-iso"
    );
    expect(
      base
        .combinedReadNoiseRmsElectrons
    ).toBe(2);
  });

  it("calculates expected electronic readout without sampling read noise or quantizing the expectation", () => {
    const accumulated =
      charge(25);
    const result =
      calculateExpectedSensorReadout({
        accumulatedCharge:
          accumulated,
        physicalCapacityAssessment:
          capacity(accumulated),
        readoutProfile:
          readoutProfile(),
        regimeId: "base"
      }).value;

    expect(result).toMatchObject({
      expectedStoredElectronCount:
        25,
      expectedElectronEquivalentAfterPreAdcSaturation:
        25,
      preAdcSaturationAppliedToExpectation:
        false,
      systemConversionGainElectronsPerCode:
        0.5,
      expectedCodeBeforeBlackOffset:
        50,
      blackLevelCode: 64,
      expectedCodeBeforeQuantization:
        114,
      electronicReadNoiseMeanElectrons:
        0,
      electronicReadNoiseRmsElectrons:
        2,
      electronicReadNoiseSampled:
        false,
      adcQuantizationApplied:
        false,
      rawCodeValueProduced:
        false,
      isoUsedToInferRegime:
        false
    });
  });

  it("refuses expected linear readout when expected stored charge is already above physical capacity", () => {
    const accumulated =
      charge(120);

    expect(() =>
      calculateExpectedSensorReadout({
        accumulatedCharge:
          accumulated,
        physicalCapacityAssessment:
          capacity(accumulated),
        readoutProfile:
          readoutProfile(),
        regimeId: "base"
      })
    ).toThrow(
      "above physical capacity"
    );
  });

  it("generates deterministic RAW code with separate physical, electronic, pre-ADC, and digital stages", () => {
    const accumulated =
      charge(25);
    const realization =
      simulateSensorChargeRealization({
        accumulatedCharge:
          accumulated,
        samplingProfile:
          samplingProfile(),
        seedUint32: 99
      }).value;

    const input = {
      chargeRealization:
        realization,
      physicalCapacityAssessment:
        capacity(accumulated),
      readoutProfile:
        readoutProfile(),
      regimeId: "base",
      readNoiseSeedUint32:
        100
    } as const;

    const first =
      simulateSensorRawCode(
        input
      ).value;
    const second =
      simulateSensorRawCode(
        input
      ).value;

    expect(first).toEqual(second);
    expect(
      Number.isSafeInteger(
        first.rawCode
      )
    ).toBe(true);
    expect(first.rawCode)
      .toBeGreaterThanOrEqual(0);
    expect(first.rawCode)
      .toBeLessThanOrEqual(
        first.digitalSaturationCode
      );
    expect(first).toMatchObject({
      bloomingModeled: false,
      electronicReadNoiseApplied:
        true,
      conversionGainApplied:
        true,
      adcQuantizationApplied:
        true,
      rawCodeValueProduced:
        true,
      isoUsedToInferRegime:
        false,
      deterministicSeededRealization:
        true
    });
  });

  it("applies a scalar physical-capacity clamp without claiming blooming", () => {
    const accumulated =
      charge(25);
    const base =
      simulateSensorChargeRealization({
        accumulatedCharge:
          accumulated,
        samplingProfile:
          samplingProfile(),
        seedUint32: 1
      }).value;
    const saturated:
      SensorChargeRealization = {
      ...base,
      totalRealizedStoredElectronEquivalentCount:
        140
    };

    const raw =
      simulateSensorRawCode({
        chargeRealization:
          saturated,
        physicalCapacityAssessment:
          capacity(accumulated),
        readoutProfile:
          readoutProfile(),
        regimeId: "base",
        readNoiseSeedUint32:
          2
      }).value;

    expect(
      raw
        .electronEquivalentAfterPhysicalScalarSaturation
    ).toBe(100);
    expect(
      raw.physicalScalarSaturationApplied
    ).toBe(true);
    expect(
      raw.overflowElectronEquivalentDiagnostic
    ).toBe(40);
    expect(raw.bloomingModeled)
      .toBe(false);
  });

  it("keeps pre-ADC and digital saturation distinct", () => {
    const accumulated =
      charge(25);
    const base =
      simulateSensorChargeRealization({
        accumulatedCharge:
          accumulated,
        samplingProfile:
          samplingProfile(),
        seedUint32: 1
      }).value;
    const high:
      SensorChargeRealization = {
      ...base,
      totalRealizedStoredElectronEquivalentCount:
        80
    };

    const raw =
      simulateSensorRawCode({
        chargeRealization: high,
        physicalCapacityAssessment:
          capacity(accumulated),
        readoutProfile:
          readoutProfile(),
        regimeId: "high-gain",
        readNoiseSeedUint32:
          5
      }).value;

    expect(
      raw
        .preAdcSaturationElectronEquivalent
    ).toBe(50);
    expect(
      raw.preAdcSaturationApplied
    ).toBe(true);
    expect(
      raw.physicalScalarSaturationApplied
    ).toBe(false);
    expect(raw.rawCode)
      .toBeLessThanOrEqual(
        raw.digitalSaturationCode
      );
  });

  it("validates readout profile ADC and regime identity", () => {
    expect(() =>
      parseSensorReadoutConversionProfile({
        ...readoutProfile(),
        regimes: [{
          ...readoutProfile()
            .regimes[0],
          adc: {
            bitDepth: 12,
            blackLevelCode:
              4095,
            digitalSaturationCode:
              4095,
            transfer:
              "uniform-round-half-up"
          }
        }]
      })
    ).toThrow(
      "digitalSaturationCode"
    );

    expect(() =>
      resolveSensorReadoutRegime({
        profile:
          readoutProfile(),
        regimeId: "missing"
      })
    ).toThrow(
      "not declared"
    );
  });
});

const nativeRaster = {
  pixelWidth: 8,
  pixelHeight: 6
};

const colorProfile =
  (): SensorColorSamplingProfile => ({
    schemaVersion: "0.1.0",
    profileId: "color",
    evidence:
      evidence("color-profile"),
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
  });

const bindingProfile =
  (): NativeEffectiveRasterColorSamplingBindingProfile => ({
    schemaVersion: "0.1.0",
    bindingId:
      "color-binding",
    colorSamplingProfileId:
      "color",
    nativeRaster,
    evidence:
      evidence("color-binding"),
    relationship: {
      kind:
        "regular-native-effective-sample-blocks",
      sitesPerNativeSampleX: 1,
      sitesPerNativeSampleY: 1,
      anchor:
        "shared-native-top-left"
    }
  });

const nativeModeProfile =
  (): CaptureModeProfile => ({
    schemaVersion: "0.1.0",
    modes: [{
      modeId: "native",
      evidence:
        evidence("native-mode"),
      acquisition: {
        kind: "single-frame"
      },
      perFrameSampling: {
        kind:
          "native-effective-raster"
      },
      processedImageRaster: {
        value: nativeRaster,
        evidence:
          evidence("native-output")
      },
      dependencies: [
        "color-sampling-model"
      ]
    }]
  });

const groupedModeProfile =
  (): CaptureModeProfile => ({
    schemaVersion: "0.1.0",
    modes: [{
      modeId: "grouped",
      evidence:
        evidence("grouped-mode"),
      acquisition: {
        kind: "single-frame"
      },
      perFrameSampling: {
        kind:
          "grouped-native-samples",
        groupWidthSamples: {
          value: 2,
          evidence:
            evidence("group-width")
        },
        groupHeightSamples: {
          value: 2,
          evidence:
            evidence("group-height")
        }
      },
      processedImageRaster: {
        value: {
          pixelWidth: 4,
          pixelHeight: 3
        },
        evidence:
          evidence("grouped-output")
      },
      dependencies: [
        "color-sampling-model"
      ]
    }]
  });

const contributorsAt = (
  x: number,
  y: number
): ReturnType<typeof resolveCaptureModeColorSamplingContributors> =>
  resolveCaptureModeColorSamplingContributors({
    nativeRaster,
    captureModeProfile:
      nativeModeProfile(),
    modeId: "native",
    colorSamplingProfile:
      colorProfile(),
    bindingProfile:
      bindingProfile(),
    modeSampleIndexFullFrame: {
      x,
      y
    }
  });

const baseRaw = ():
  SensorRawCodeSample => {
    const accumulated =
      charge(25);
    return simulateSensorRawCode({
      chargeRealization:
        simulateSensorChargeRealization({
          accumulatedCharge:
            accumulated,
          samplingProfile:
            samplingProfile(),
          seedUint32: 11
        }).value,
      physicalCapacityAssessment:
        capacity(accumulated),
      readoutProfile:
        readoutProfile(),
      regimeId: "base",
      readNoiseSeedUint32: 12
    }).value;
  };

const rawAt = (
  x: number,
  y: number,
  channelId: string,
  rawCode: number
): SensorRawCodeSample => ({
  ...baseRaw(),
  site: {
    x,
    y
  },
  channelId,
  rawCode
});

const captureRawAt = (
  x: number,
  y: number,
  channelId: string,
  rawCode: number
): SensorRawCaptureSample =>
  createSensorRawCaptureSample({
    rawCode:
      rawAt(
        x,
        y,
        channelId,
        rawCode
      ),
    contributors:
      contributorsAt(x, y)
  });

const reconstructionProfile =
  (): SensorRawReconstructionProfile =>
    parseSensorRawReconstructionProfile({
      schemaVersion: "0.1.0",
      profileId:
        "linear-neighborhood",
      profileVersion: "1.0.0",
      captureModeId: "native",
      colorSamplingProfileId:
        "color",
      scientificStatus:
        "approximation",
      method:
        "explicit-linear-native-neighborhood",
      normalization:
        "weights-sum-to-one-per-output-channel",
      negativeBlackSubtractedValuesAllowed:
        true,
      kernels: [
        {
          outputChannelId:
            "red",
          contributions: [{
            offsetX: -1,
            offsetY: 0,
            sourceChannelId:
              "red",
            weight: 1
          }]
        },
        {
          outputChannelId:
            "green",
          contributions: [{
            offsetX: 0,
            offsetY: 0,
            sourceChannelId:
              "green",
            weight: 1
          }]
        },
        {
          outputChannelId:
            "blue",
          contributions: [{
            offsetX: 0,
            offsetY: 1,
            sourceChannelId:
              "blue",
            weight: 1
          }]
        }
      ],
      evidence:
        evidence("reconstruction"),
      limitations: [
        "Simple explicit test interpolation."
      ]
    });

describe("RAW capture-mode/CFA binding and reconstruction", () => {
  it("creates one native RAW capture sample with absolute CFA phase preserved", () => {
    const sample =
      captureRawAt(
        1,
        0,
        "green",
        1064
      );

    expect(sample).toMatchObject({
      version: "0.1.0",
      captureModeId: "native",
      modeSampleIndexFullFrame: {
        x: 1,
        y: 0
      },
      colorSamplingSite: {
        x: 1,
        y: 0
      },
      channelId: "green",
      rawCode: 1064,
      blackLevelCode: 64,
      cfaPhasePreservedInNativeCoordinates:
        true,
      physicalOrientationApplied:
        false,
      outputRotationApplied:
        false,
      groupedModeCombinationApplied:
        false,
      reconstructionApplied:
        false,
      aliasingModeled: false,
      moireModeled: false
    });
    expect(
      sample
        .blackSubtractedNormalizedCode
    ).toBeCloseTo(
      1000 / 4031,
      12
    );
  });

  it("fails closed for grouped capture modes until combination weights exist", () => {
    const contributors =
      resolveCaptureModeColorSamplingContributors({
        nativeRaster,
        captureModeProfile:
          groupedModeProfile(),
        modeId: "grouped",
        colorSamplingProfile:
          colorProfile(),
        bindingProfile:
          bindingProfile(),
        modeSampleIndexFullFrame: {
          x: 0,
          y: 0
        },
        groupedSamplingAnchor: {
          anchor:
            "native-effective-raster-top-left",
          evidence:
            evidence("group-anchor")
        }
      });

    expect(() =>
      createSensorRawCaptureSample({
        rawCode:
          rawAt(
            0,
            0,
            "red",
            1000
          ),
        contributors
      })
    ).toThrow(
      "grouped/remosaic modes need explicit signal-combination weights"
    );
  });

  it("reconstructs an explicit native CFA neighborhood without changing RAW samples or claiming aliasing", () => {
    const red =
      captureRawAt(
        0,
        0,
        "red",
        1064
      );
    const green =
      captureRawAt(
        1,
        0,
        "green",
        2064
      );
    const blue =
      captureRawAt(
        1,
        1,
        "blue",
        3064
      );
    const before =
      JSON.stringify([
        red,
        green,
        blue
      ]);

    const result =
      resolveSensorRawReconstruction({
        profile:
          reconstructionProfile(),
        colorSamplingProfile:
          colorProfile(),
        centerSite: {
          x: 1,
          y: 0
        },
        samples: [
          red,
          green,
          blue
        ]
      }).value;

    expect(
      result.outputChannels.map(
        (entry) =>
          entry.channelId
      )
    ).toEqual([
      "red",
      "green",
      "blue"
    ]);
    expect(
      result.outputChannels[0]
        ?.linearBlackSubtractedNormalizedValue
    ).toBeCloseTo(
      1000 / 4031,
      12
    );
    expect(
      result.outputChannels[1]
        ?.linearBlackSubtractedNormalizedValue
    ).toBeCloseTo(
      2000 / 4031,
      12
    );
    expect(
      result.outputChannels[2]
        ?.linearBlackSubtractedNormalizedValue
    ).toBeCloseTo(
      3000 / 4031,
      12
    );
    expect(result).toMatchObject({
      cfaAware: true,
      captureModeAware: true,
      sharpeningApplied: false,
      denoisingApplied: false,
      aliasingModeled: false,
      moireModeled: false,
      preSamplingOpticalTransferAdequacyEstablished:
        false,
      reconstructionDoesNotModifyRawSamples:
        true
    });
    expect(
      JSON.stringify([
        red,
        green,
        blue
      ])
    ).toBe(before);
  });

  it("validates each RAW sample against the declared CFA topology", () => {
    const invalid =
      captureRawAt(
        1,
        0,
        "green",
        2064
      );
    const tampered = {
      ...invalid,
      channelId: "red"
    };

    expect(() =>
      resolveSensorRawReconstruction({
        profile:
          reconstructionProfile(),
        colorSamplingProfile:
          colorProfile(),
        centerSite: {
          x: 1,
          y: 0
        },
        samples: [
          tampered
        ]
      })
    ).toThrow(
      "channelId must match the declared color-sampling topology"
    );
  });

  it("fails closed when reconstruction data or kernel normalization is incomplete", () => {
    expect(() =>
      parseSensorRawReconstructionProfile({
        ...reconstructionProfile(),
        kernels: [{
          outputChannelId:
            "red",
          contributions: [{
            offsetX: 0,
            offsetY: 0,
            sourceChannelId:
              "red",
            weight: 0.5
          }]
        }]
      })
    ).toThrow(
      "weights must sum to one"
    );

    expect(() =>
      resolveSensorRawReconstruction({
        profile:
          reconstructionProfile(),
        colorSamplingProfile:
          colorProfile(),
        centerSite: {
          x: 1,
          y: 0
        },
        samples: [
          captureRawAt(
            1,
            0,
            "green",
            2064
          )
        ]
      })
    ).toThrow(
      "missing a required site/channel contribution"
    );
  });
});
