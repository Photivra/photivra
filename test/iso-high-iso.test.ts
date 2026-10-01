import { describe, expect, it } from "vitest";

import {
  bindIsoCapabilityToExposureCapabilities,
  createExposureMeterTargetFromMeteringResult,
  meterRelativeExposure,
  parseExposureMeteringProfile,
  parseGenericBodyExposureCapabilityProfile,
  parseGenericIsoSignalChainPresetCatalog,
  parseGenericIsoSignalChainProfile,
  parseGenericLensExposureCapabilityProfile,
  parseIsoCapabilityProfile,
  parseSensorReadoutConversionProfile,
  resolveCaptureGeometry,
  resolveGenericEquipmentExposureCapabilities,
  resolveGenericIsoSignalChain,
  resolveGenericIsoSignalChainPreset,
  resolveIsoCapability,
  resolveManualExposureMode,
  type ExposureMeterTarget,
  type GenericIsoSignalChainPresetCatalog,
  type GenericIsoSignalChainProfile,
  type IsoCapabilityProfile,
  type ResolvedGenericEquipmentExposureCapabilities,
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

const standardIsoValues = [
  100,
  200,
  400,
  800,
  1600,
  3200,
  6400,
  12800
] as const;

function isoProfile():
  IsoCapabilityProfile {
  return parseIsoCapabilityProfile({
    schemaVersion: "0.1.0",
    profileId: "generic-iso",
    profileVersion: "1.0.0",
    capabilityMeaning:
      "reported-exposure-index-capability-not-physical-gain",
    standard: {
      exposureIndexRange: {
        minimum: 100,
        maximum: 12800
      },
      settingGrid: {
        kind: "discrete-values",
        values:
          standardIsoValues
      }
    },
    expandedSettings: [
      {
        settingId: "low",
        label: "L",
        direction: "low",
        exposureIndexEquivalent:
          50,
        autoIsoEligible: false,
        evidence:
          evidence("iso-low")
      },
      {
        settingId: "high-1",
        label: "H1",
        direction: "high",
        exposureIndexEquivalent:
          25600,
        autoIsoEligible: false,
        evidence:
          evidence("iso-high-1")
      },
      {
        settingId: "high-2",
        label: "H2",
        direction: "high",
        exposureIndexEquivalent:
          51200,
        autoIsoEligible: false,
        evidence:
          evidence("iso-high-2")
      }
    ],
    autoIso: {
      availability:
        "supported",
      standardExposureIndexRange: {
        minimum: 100,
        maximum: 6400
      },
      evidence:
        evidence("auto-global")
    },
    captureModePolicies: [
      {
        captureModeId: "native",
        standardExposureIndexRange: {
          minimum: 100,
          maximum: 12800
        },
        expandedSettingIds: [
          "low",
          "high-1"
        ],
        autoIso: {
          availability:
            "supported",
          standardExposureIndexRange: {
            minimum: 200,
            maximum: 3200
          },
          evidence:
            evidence("auto-native")
        },
        evidence:
          evidence("native-mode")
      },
      {
        captureModeId:
          "high-speed",
        standardExposureIndexRange: {
          minimum: 200,
          maximum: 6400
        },
        expandedSettingIds: [],
        autoIso: {
          availability:
            "supported",
          standardExposureIndexRange: {
            minimum: 400,
            maximum: 1600
          },
          evidence:
            evidence("auto-high-speed")
        },
        evidence:
          evidence("high-speed-mode")
      }
    ],
    evidence:
      evidence("iso-profile")
  });
}

function equipmentCapabilities():
  ResolvedGenericEquipmentExposureCapabilities {
  const body =
    parseGenericBodyExposureCapabilityProfile({
      schemaVersion: "0.1.0",
      profileId: "generic-body",
      profileVersion: "1.0.0",
      scientificStatus:
        "approximation",
      evidence:
        evidence("body"),
      shutter: {
        durationSecondsRange: {
          value: {
            minimum: 1 / 8000,
            maximum: 30
          },
          evidence:
            evidence("shutter")
        },
        settingGrid: {
          kind:
            "continuous-within-range"
        }
      },
      iso: {
        range: {
          value: {
            minimum: 100,
            maximum: 12800
          },
          evidence:
            evidence("iso-range")
        },
        settingGrid: {
          kind: "discrete-values",
          values: {
            value:
              standardIsoValues,
            evidence:
              evidence("iso-grid")
          }
        },
        autoIso: {
          value: "supported",
          evidence:
            evidence("legacy-auto")
        }
      }
    });

  const lens =
    parseGenericLensExposureCapabilityProfile({
      schemaVersion: "0.1.0",
      profileId:
        "generic-lens",
      profileVersion: "1.0.0",
      scientificStatus:
        "approximation",
      evidence:
        evidence("lens"),
      focalLengthMmRange: {
        value: {
          minimum: 50,
          maximum: 50
        },
        evidence:
          evidence("focal")
      },
      aperture: {
        widestAvailableFNumber: {
          kind: "constant",
          fNumber: {
            value: 2,
            evidence:
              evidence("wide")
          }
        },
        narrowestAvailableFNumber: {
          value: 16,
          evidence:
            evidence("narrow")
        },
        settingGrid: {
          kind:
            "continuous-within-range"
        }
      }
    });

  return resolveGenericEquipmentExposureCapabilities({
    bodyProfile: body,
    lensProfile: lens,
    selectedFocalLengthMm: 50
  });
}

function targetForScale(
  requiredScale: number
): ExposureMeterTarget {
  const profile =
    parseExposureMeteringProfile({
      schemaVersion: "0.1.0",
      profileId: "meter",
      scientificStatus:
        "approximation",
      inputDomain:
        "relative-pre-exposure-linear-signal",
      captureRegion:
        "oriented-active-capture",
      policy: {
        kind:
          "multi-zone-uniform"
      },
      target: {
        kind:
          "relative-signal-reference",
        targetRelativeSignal: 1,
        evidence:
          evidence("meter-target")
      },
      evidence:
        evidence("meter"),
      limitations: [
        "ISO integration test."
      ]
    });

  const meter =
    meterRelativeExposure({
      profile,
      sampleSet: {
        measurementId:
          "measurement",
        sceneStateId:
          "scene",
        inputDomain:
          "relative-pre-exposure-linear-signal",
        captureRegion:
          "oriented-active-capture",
        captureGeometry:
          resolveCaptureGeometry({
            imagingArea: {
              widthMm: 36,
              heightMm: 24
            },
            nativeRaster: {
              pixelWidth: 6000,
              pixelHeight: 4000
            },
            orientation:
              "landscape"
          }).value,
        processingState: {
          exposureSettingsApplied:
            false,
          whiteBalanceApplied:
            false,
          toneMappingApplied:
            false,
          displayGammaApplied:
            false,
          sharpeningApplied:
            false
        },
        samples: [{
          sampleId: "sample",
          positionOrientedCaptureUv: {
            u: 0.5,
            v: 0.5
          },
          relativeLinearSignal:
            1 / requiredScale,
          areaWeight: 1
        }]
      }
    }).value;

  return createExposureMeterTargetFromMeteringResult({
    targetId: "target",
    meterResult: meter
  });
}

function readoutProfile():
  SensorReadoutConversionProfile {
  return parseSensorReadoutConversionProfile({
    schemaVersion: "0.1.0",
    profileId:
      "generic-readout",
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
            evidence("base-gain")
        },
        preAdcSaturationElectronEquivalent: {
          value: 100,
          evidence:
            evidence("base-saturation")
        },
        readNoiseComponents: [{
          componentId:
            "base-read-noise",
          rmsElectrons: {
            value: 2.5,
            evidence:
              evidence("base-rms")
          },
          evidence:
            evidence("base-read")
        }],
        adc: {
          bitDepth: 12,
          blackLevelCode: 64,
          digitalSaturationCode:
            4095,
          transfer:
            "uniform-round-half-up"
        },
        evidence:
          evidence("base-regime"),
        limitations: [
          "Generic approximation."
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
            evidence("high-gain")
        },
        preAdcSaturationElectronEquivalent: {
          value: 60,
          evidence:
            evidence("high-saturation")
        },
        readNoiseComponents: [{
          componentId:
            "high-read-noise",
          rmsElectrons: {
            value: 1.2,
            evidence:
              evidence("high-rms")
          },
          evidence:
            evidence("high-read")
        }],
        adc: {
          bitDepth: 12,
          blackLevelCode: 64,
          digitalSaturationCode:
            4095,
          transfer:
            "uniform-round-half-up"
        },
        evidence:
          evidence("high-regime"),
        limitations: [
          "Generic approximation."
        ]
      }
    ],
    evidence:
      evidence("readout")
  });
}

function signalChainProfile():
  GenericIsoSignalChainProfile {
  return parseGenericIsoSignalChainProfile({
    schemaVersion: "0.1.0",
    profileId:
      "generic-signal-chain",
    profileVersion: "1.0.0",
    scientificStatus:
      "approximation",
    isoCapabilityProfileId:
      "generic-iso",
    readoutProfileId:
      "generic-readout",
    behaviorMeaning:
      "iso-state-selects-explicit-readout-regime-not-noise-equation",
    captureModeBindings: [
      {
        captureModeId: "native",
        standardRegimeBands: [
          {
            minimumExposureIndex:
              100,
            maximumExposureIndex:
              400,
            readoutRegimeId:
              "base"
          },
          {
            minimumExposureIndex:
              800,
            maximumExposureIndex:
              12800,
            readoutRegimeId:
              "high-gain"
          }
        ],
        expandedRegimeBindings: [
          {
            expandedSettingId:
              "low",
            readoutRegimeId:
              "base"
          },
          {
            expandedSettingId:
              "high-1",
            readoutRegimeId:
              "high-gain"
          }
        ],
        evidence:
          evidence("signal-native")
      },
      {
        captureModeId:
          "high-speed",
        standardRegimeBands: [{
          minimumExposureIndex:
            200,
          maximumExposureIndex:
            6400,
          readoutRegimeId:
            "high-gain"
        }],
        expandedRegimeBindings: [],
        evidence:
          evidence("signal-high-speed")
      }
    ],
    photonShotNoiseOwnedUpstream:
      true,
    processedImageBehaviorIncluded:
      false,
    fixedPatternNoiseModeled:
      false,
    lowSignalColorDegradationModeled:
      false,
    evidence:
      evidence("signal-profile"),
    limitations: [
      "Generic signal-chain approximation."
    ]
  });
}

function presetCatalog():
  GenericIsoSignalChainPresetCatalog {
  return parseGenericIsoSignalChainPresetCatalog({
    schemaVersion: "0.1.0",
    catalogId:
      "generic-quality-presets",
    catalogVersion: "1.0.0",
    entries: [
      {
        preset: "good",
        signalChainProfileId:
          "signal-good",
        evidence:
          evidence("preset-good")
      },
      {
        preset: "better",
        signalChainProfileId:
          "signal-better",
        evidence:
          evidence("preset-better")
      },
      {
        preset: "best",
        signalChainProfileId:
          "signal-best",
        evidence:
          evidence("preset-best")
      }
    ],
    performanceOrderingClaimed:
      false,
    realCameraRankingClaimed:
      false
  });
}

describe("ISO exposure-index capability", () => {
  it("resolves standard ISO without inferring photons, shot noise, gain, read noise, or saturation", () => {
    const result =
      resolveIsoCapability({
        profile: isoProfile(),
        setting: {
          kind: "standard",
          exposureIndex: 800
        },
        captureModeId:
          "native"
      });

    expect(result).toMatchObject({
      reportedExposureIndex:
        800,
      expandedSetting: false,
      autoIsoEligible: true,
      capturedPhotonExpectationModified:
        false,
      photonShotNoiseStatisticsModified:
        false,
      physicalGainInferred:
        false,
      conversionGainInferred:
        false,
      readNoiseInferred: false,
      saturationInferred: false,
      exactCommercialCameraBehaviorClaimed:
        false
    });
  });

  it("keeps expanded low/high settings separate from the standard range", () => {
    const low =
      resolveIsoCapability({
        profile: isoProfile(),
        setting: {
          kind: "expanded",
          settingId: "low"
        },
        captureModeId:
          "native"
      });
    const high =
      resolveIsoCapability({
        profile: isoProfile(),
        setting: {
          kind: "expanded",
          settingId: "high-1"
        },
        captureModeId:
          "native"
      });

    expect(low.setting)
      .toMatchObject({
        kind: "expanded",
        direction: "low",
        exposureIndexEquivalent:
          50
      });
    expect(high.setting)
      .toMatchObject({
        kind: "expanded",
        direction: "high",
        exposureIndexEquivalent:
          25600
      });
    expect(low.autoIsoEligible)
      .toBe(false);
    expect(high.autoIsoEligible)
      .toBe(false);
  });

  it("applies capture-mode ISO restrictions without inventing a physical sensor change", () => {
    const allowed =
      resolveIsoCapability({
        profile: isoProfile(),
        setting: {
          kind: "standard",
          exposureIndex: 6400
        },
        captureModeId:
          "high-speed"
      });

    expect(
      allowed
        .standardExposureIndexRange
    ).toEqual({
      minimum: 200,
      maximum: 6400
    });
    expect(
      allowed.autoIsoEligible
    ).toBe(false);

    expect(() =>
      resolveIsoCapability({
        profile: isoProfile(),
        setting: {
          kind: "standard",
          exposureIndex: 12800
        },
        captureModeId:
          "high-speed"
      })
    ).toThrow(
      "not supported by the selected ISO capability/mode"
    );

    expect(() =>
      resolveIsoCapability({
        profile: isoProfile(),
        setting: {
          kind: "expanded",
          settingId: "high-1"
        },
        captureModeId:
          "high-speed"
      })
    ).toThrow(
      "expanded ISO setting is not supported"
    );
  });

  it("uses global capability when no explicit mode policy exists", () => {
    const result =
      resolveIsoCapability({
        profile: isoProfile(),
        setting: {
          kind: "standard",
          exposureIndex: 6400
        },
        captureModeId:
          "ordinary-other-mode"
      });

    expect(
      result
        .standardExposureIndexRange
    ).toEqual({
      minimum: 100,
      maximum: 12800
    });
    expect(
      result.autoIsoEligible
    ).toBe(true);
  });

  it("validates standard grids, expanded direction, auto range, and policy identities", () => {
    expect(() =>
      parseIsoCapabilityProfile({
        ...isoProfile(),
        schemaVersion: "9.9.9"
      })
    ).toThrow("schemaVersion");

    expect(() =>
      parseIsoCapabilityProfile({
        ...isoProfile(),
        standard: {
          exposureIndexRange: {
            minimum: 100,
            maximum: 12800
          },
          settingGrid: {
            kind:
              "discrete-values",
            values: [
              100,
              200,
              200,
              12800
            ]
          }
        }
      })
    ).toThrow(
      "strictly increasing"
    );

    expect(() =>
      parseIsoCapabilityProfile({
        ...isoProfile(),
        expandedSettings: [{
          settingId: "bad-low",
          label: "L",
          direction: "low",
          exposureIndexEquivalent:
            200,
          autoIsoEligible:
            false,
          evidence:
            evidence("bad-low")
        }]
      })
    ).toThrow(
      "outside the standard range"
    );

    expect(() =>
      parseIsoCapabilityProfile({
        ...isoProfile(),
        autoIso: {
          availability:
            "supported",
          standardExposureIndexRange: {
            minimum: 50,
            maximum: 6400
          },
          evidence:
            evidence("bad-auto")
        }
      })
    ).toThrow(
      "must lie inside the standard ISO range"
    );

    expect(() =>
      parseIsoCapabilityProfile({
        ...isoProfile(),
        captureModePolicies: [
          isoProfile()
            .captureModePolicies[0],
          isoProfile()
            .captureModePolicies[0]
        ]
      })
    ).toThrow(
      "duplicate captureModeId"
    );
  });
});

describe("ISO capability binding into #99", () => {
  it("preserves manual standard ISO while enforcing narrower Auto ISO bounds", () => {
    const bound =
      bindIsoCapabilityToExposureCapabilities({
        isoCapabilityProfile:
          isoProfile(),
        equipmentCapabilities:
          equipmentCapabilities(),
        captureModeId:
          "native"
      });

    expect(
      bound.capabilities.iso
    ).toMatchObject({
      minimum: 100,
      maximum: 12800,
      autoIsoAvailability:
        "supported",
      autoIsoMinimum: 200,
      autoIsoMaximum: 3200
    });
    expect(
      bound
        .expandedSettingsExcludedFromNumericExposureGrid
    ).toBe(true);

    const referenceExposure = {
      aperture: 4,
      shutterSeconds: 1 / 125,
      iso: 100
    };

    const manual =
      resolveManualExposureMode({
        target:
          targetForScale(64),
        capabilities:
          bound.capabilities,
        referenceExposure,
        manualAperture: 4,
        manualShutterSeconds:
          1 / 125,
        isoControl: {
          kind: "manual",
          iso: 6400
        }
      });

    expect(manual.status)
      .toBe("resolved");
    if (
      manual.status !== "resolved" ||
      manual.isoControl !== "manual"
    ) {
      throw new Error(
        "Expected resolved manual ISO."
      );
    }
    expect(
      manual.resolvedSettings.iso
    ).toBe(6400);

    const automatic =
      resolveManualExposureMode({
        target:
          targetForScale(64),
        capabilities:
          bound.capabilities,
        referenceExposure,
        manualAperture: 4,
        manualShutterSeconds:
          1 / 125,
        isoControl: {
          kind: "automatic",
          quantizationPolicy:
            "nearest-log2-lower-on-tie"
        }
      });

    expect(automatic.status)
      .toBe("resolved");
    if (
      automatic.status !==
        "resolved" ||
      automatic.isoControl !==
        "automatic"
    ) {
      throw new Error(
        "Expected resolved Auto ISO."
      );
    }
    expect(
      automatic
        .resolvedSettings.iso
    ).toBe(3200);
    expect(
      automatic
        .isoResolution.clamped
    ).toBe("maximum");
  });

  it("narrows the standard/manual grid only when an evidenced capture-mode policy does so", () => {
    const bound =
      bindIsoCapabilityToExposureCapabilities({
        isoCapabilityProfile:
          isoProfile(),
        equipmentCapabilities:
          equipmentCapabilities(),
        captureModeId:
          "high-speed"
      });

    expect(bound.capabilities.iso)
      .toMatchObject({
        minimum: 200,
        maximum: 6400,
        autoIsoMinimum: 400,
        autoIsoMaximum: 1600
      });
    expect(
      bound.capabilities.iso
        .settingGrid
    ).toEqual({
      kind: "discrete-values",
      values: [
        200,
        400,
        800,
        1600,
        3200,
        6400
      ]
    });
  });

  it("fails closed if the detailed ISO profile disagrees with the existing equipment standard envelope", () => {
    const equipment =
      equipmentCapabilities();

    expect(() =>
      bindIsoCapabilityToExposureCapabilities({
        isoCapabilityProfile:
          parseIsoCapabilityProfile({
            ...isoProfile(),
            standard: {
              exposureIndexRange: {
                minimum: 200,
                maximum: 12800
              },
              settingGrid: {
                kind:
                  "discrete-values",
                values: [
                  200,
                  400,
                  800,
                  1600,
                  3200,
                  6400,
                  12800
                ]
              }
            },
            autoIso: {
              availability:
                "supported",
              standardExposureIndexRange: {
                minimum: 200,
                maximum: 6400
              },
              evidence:
                evidence("changed-auto")
            },
            captureModePolicies:
              []
          }),
        equipmentCapabilities:
          equipment
      })
    ).toThrow(
      "must exactly match the existing resolved equipment ISO capability"
    );
  });
});

describe("generic ISO signal-chain mapping", () => {
  it("selects explicit #14 readout regimes rather than deriving a noise curve from ISO", () => {
    const base =
      resolveGenericIsoSignalChain({
        profile:
          signalChainProfile(),
        isoCapability:
          isoProfile(),
        requestedIsoSetting: {
          kind: "standard",
          exposureIndex: 400
        },
        captureModeId:
          "native",
        readoutProfile:
          readoutProfile()
      });
    const high =
      resolveGenericIsoSignalChain({
        profile:
          signalChainProfile(),
        isoCapability:
          isoProfile(),
        requestedIsoSetting: {
          kind: "standard",
          exposureIndex: 1600
        },
        captureModeId:
          "native",
        readoutProfile:
          readoutProfile()
      });

    expect(
      base.readout.regime
        .regimeId
    ).toBe("base");
    expect(
      high.readout.regime
        .regimeId
    ).toBe("high-gain");
    expect(
      base.readout
        .combinedReadNoiseRmsElectrons
    ).toBe(2.5);
    expect(
      high.readout
        .combinedReadNoiseRmsElectrons
    ).toBe(1.2);

    for (const result of [
      base,
      high
    ]) {
      expect(result).toMatchObject({
        capturedPhotonExpectationModified:
          false,
        photonShotNoiseStatisticsModified:
          false,
        sensorGeometryModified:
          false,
        processedImageBehaviorApplied:
          false,
        fixedPatternNoiseApplied:
          false,
        lowSignalColorDegradationApplied:
          false,
        isoUsedAsDirectNoiseEquation:
          false,
        exactCommercialCameraBehaviorClaimed:
          false
      });
    }
  });

  it("binds expanded ISO through an explicit regime mapping", () => {
    const result =
      resolveGenericIsoSignalChain({
        profile:
          signalChainProfile(),
        isoCapability:
          isoProfile(),
        requestedIsoSetting: {
          kind: "expanded",
          settingId: "high-1"
        },
        captureModeId:
          "native",
        readoutProfile:
          readoutProfile()
      });

    expect(
      result.regimeSelectionReason
    ).toBe(
      "expanded-setting-binding"
    );
    expect(
      result.readout.regime
        .regimeId
    ).toBe("high-gain");
  });

  it("fails closed on missing band/mode and profile identity drift", () => {
    const gapProfile =
      parseGenericIsoSignalChainProfile({
        ...signalChainProfile(),
        profileId: "gap-profile",
        captureModeBindings: [{
          captureModeId: "native",
          standardRegimeBands: [{
            minimumExposureIndex:
              100,
            maximumExposureIndex:
              400,
            readoutRegimeId:
              "base"
          }],
          expandedRegimeBindings:
            [],
          evidence:
            evidence("gap")
        }]
      });

    expect(() =>
      resolveGenericIsoSignalChain({
        profile: gapProfile,
        isoCapability:
          isoProfile(),
        requestedIsoSetting: {
          kind: "standard",
          exposureIndex: 800
        },
        captureModeId:
          "native",
        readoutProfile:
          readoutProfile()
      })
    ).toThrow(
      "must match exactly one"
    );

    expect(() =>
      resolveGenericIsoSignalChain({
        profile:
          signalChainProfile(),
        isoCapability:
          isoProfile(),
        requestedIsoSetting: {
          kind: "standard",
          exposureIndex: 400
        },
        captureModeId:
          "unbound-mode",
        readoutProfile:
          readoutProfile()
      })
    ).toThrow(
      "no binding for the selected capture mode"
    );

    expect(() =>
      resolveGenericIsoSignalChain({
        profile:
          signalChainProfile(),
        isoCapability:
          parseIsoCapabilityProfile({
            ...isoProfile(),
            profileId:
              "different-iso"
          }),
        requestedIsoSetting: {
          kind: "standard",
          exposureIndex: 400
        },
        captureModeId:
          "native",
        readoutProfile:
          readoutProfile()
      })
    ).toThrow(
      "isoCapabilityProfileId"
    );
  });

  it("rejects overlapping regime bands instead of choosing an arbitrary one", () => {
    expect(() =>
      parseGenericIsoSignalChainProfile({
        ...signalChainProfile(),
        captureModeBindings: [{
          captureModeId:
            "native",
          standardRegimeBands: [
            {
              minimumExposureIndex:
                100,
              maximumExposureIndex:
                800,
              readoutRegimeId:
                "base"
            },
            {
              minimumExposureIndex:
                800,
              maximumExposureIndex:
                12800,
              readoutRegimeId:
                "high-gain"
            }
          ],
          expandedRegimeBindings:
            [],
          evidence:
            evidence("overlap")
        }]
      })
    ).toThrow(
      "must not overlap"
    );
  });
});

describe("Good / Better / Best convenience presets", () => {
  it("maps convenience labels to explicit signal-chain profile identities without ranking real cameras", () => {
    const catalog =
      presetCatalog();

    expect(
      resolveGenericIsoSignalChainPreset({
        catalog,
        preset: "good"
      })
    ).toEqual({
      preset: "good",
      signalChainProfileId:
        "signal-good",
      performanceOrderingClaimed:
        false,
      realCameraRankingClaimed:
        false
    });

    expect(
      resolveGenericIsoSignalChainPreset({
        catalog,
        preset: "best"
      })
    ).toEqual({
      preset: "best",
      signalChainProfileId:
        "signal-best",
      performanceOrderingClaimed:
        false,
      realCameraRankingClaimed:
        false
    });
  });

  it("rejects preset catalogs that claim rankings or omit one of the three labels", () => {
    expect(() =>
      parseGenericIsoSignalChainPresetCatalog({
        ...presetCatalog(),
        realCameraRankingClaimed:
          true
      })
    ).toThrow(
      "must not claim physical performance ordering or real-camera ranking"
    );

    expect(() =>
      parseGenericIsoSignalChainPresetCatalog({
        ...presetCatalog(),
        entries: [
          presetCatalog()
            .entries[0],
          presetCatalog()
            .entries[0],
          presetCatalog()
            .entries[2]
        ]
      })
    ).toThrow(
      "each Good, Better, and Best preset exactly once"
    );
  });
});


describe("ISO capability fail-closed boundaries", () => {
  it("supports continuous standard ISO and unsupported Auto ISO without inventing bounds", () => {
    const continuous =
      parseIsoCapabilityProfile({
        ...isoProfile(),
        profileId:
          "continuous-iso",
        standard: {
          exposureIndexRange: {
            minimum: 100,
            maximum: 12800
          },
          settingGrid: {
            kind:
              "continuous-within-range"
          }
        },
        autoIso: {
          availability:
            "unsupported",
          evidence:
            evidence("auto-off")
        },
        captureModePolicies: []
      });

    const resolved =
      resolveIsoCapability({
        profile: continuous,
        setting: {
          kind: "standard",
          exposureIndex: 333
        }
      });

    expect(
      resolved.reportedExposureIndex
    ).toBe(333);
    expect(
      resolved.autoIsoEligible
    ).toBe(false);
    expect(
      resolved.standardSettingGrid
    ).toEqual({
      kind:
        "continuous-within-range"
    });

    const equipment =
      equipmentCapabilities();
    const bound =
      bindIsoCapabilityToExposureCapabilities({
        isoCapabilityProfile:
          continuous,
        equipmentCapabilities: {
          ...equipment,
          iso: {
            ...equipment.iso,
            settingGrid: {
              kind:
                "continuous-within-range"
            }
          }
        }
      });

    expect(
      bound.capabilities.iso
        .autoIsoAvailability
    ).toBe("unsupported");
    expect(
      "autoIsoMinimum" in
        bound.capabilities.iso
    ).toBe(false);
  });

  it("rejects malformed capability meaning, unsupported-Auto range metadata, duplicate expanded IDs, and unknown mode expanded IDs", () => {
    expect(() =>
      parseIsoCapabilityProfile({
        ...isoProfile(),
        capabilityMeaning:
          "physical-gain"
      })
    ).toThrow(
      "capabilityMeaning"
    );

    expect(() =>
      parseIsoCapabilityProfile({
        ...isoProfile(),
        autoIso: {
          availability:
            "unsupported",
          standardExposureIndexRange: {
            minimum: 100,
            maximum: 800
          },
          evidence:
            evidence("invalid-auto")
        }
      })
    ).toThrow(
      "must be omitted unless Auto ISO is supported"
    );

    expect(() =>
      parseIsoCapabilityProfile({
        ...isoProfile(),
        expandedSettings: [
          isoProfile()
            .expandedSettings[0],
          isoProfile()
            .expandedSettings[0]
        ]
      })
    ).toThrow(
      "duplicate settingId"
    );

    expect(() =>
      parseIsoCapabilityProfile({
        ...isoProfile(),
        captureModePolicies: [{
          captureModeId:
            "bad-mode",
          standardExposureIndexRange: {
            minimum: 100,
            maximum: 12800
          },
          expandedSettingIds: [
            "does-not-exist"
          ],
          autoIso: {
            availability:
              "unknown",
            evidence:
              evidence("unknown-auto")
          },
          evidence:
            evidence("bad-mode")
        }]
      })
    ).toThrow(
      "unknown settingId"
    );
  });

  it("rejects empty capture-mode identity and invalid runtime setting discriminants", () => {
    expect(() =>
      resolveIsoCapability({
        profile: isoProfile(),
        setting: {
          kind: "standard",
          exposureIndex: 100
        },
        captureModeId: " "
      })
    ).toThrow(
      "captureModeId must be a non-empty string"
    );

    expect(() =>
      resolveIsoCapability({
        profile: isoProfile(),
        setting: {
          kind:
            "mystery" as "expanded",
          settingId: "high-1"
        }
      })
    ).toThrow(
      "valid standard or expanded setting"
    );
  });

  it("fails binding when a mode range contains no standard value from the existing discrete grid", () => {
    const profile =
      parseIsoCapabilityProfile({
        ...isoProfile(),
        captureModePolicies: [{
          captureModeId:
            "between-grid",
          standardExposureIndexRange: {
            minimum: 250,
            maximum: 350
          },
          expandedSettingIds: [],
          autoIso: {
            availability:
              "supported",
            standardExposureIndexRange: {
              minimum: 250,
              maximum: 350
            },
            evidence:
              evidence("between-grid-auto")
          },
          evidence:
            evidence("between-grid")
        }]
      });

    expect(() =>
      bindIsoCapabilityToExposureCapabilities({
        isoCapabilityProfile:
          profile,
        equipmentCapabilities:
          equipmentCapabilities(),
        captureModeId:
          "between-grid"
      })
    ).toThrow(
      "contains no values from the resolved equipment ISO grid"
    );
  });
});

describe("Auto ISO bounded-envelope hardening", () => {
  const referenceExposure = {
    aperture: 4,
    shutterSeconds: 1 / 125,
    iso: 100
  };

  it("honors independent Auto ISO bounds on a continuous grid", () => {
    const base =
      equipmentCapabilities();
    const capabilities = {
      ...base,
      iso: {
        ...base.iso,
        settingGrid: {
          kind:
            "continuous-within-range" as const
        },
        autoIsoMinimum: 200,
        autoIsoMaximum: 800
      }
    };

    const low =
      resolveManualExposureMode({
        target:
          targetForScale(0.5),
        capabilities,
        referenceExposure,
        manualAperture: 4,
        manualShutterSeconds:
          1 / 125,
        isoControl: {
          kind: "automatic",
          quantizationPolicy:
            "nearest-log2-lower-on-tie"
        }
      });
    const high =
      resolveManualExposureMode({
        target:
          targetForScale(16),
        capabilities,
        referenceExposure,
        manualAperture: 4,
        manualShutterSeconds:
          1 / 125,
        isoControl: {
          kind: "automatic",
          quantizationPolicy:
            "nearest-log2-lower-on-tie"
        }
      });

    if (
      low.status !== "resolved" ||
      low.isoControl !==
        "automatic" ||
      high.status !==
        "resolved" ||
      high.isoControl !==
        "automatic"
    ) {
      throw new Error(
        "Expected resolved bounded Auto ISO."
      );
    }

    expect(
      low.resolvedSettings.iso
    ).toBe(200);
    expect(
      low.isoResolution.clamped
    ).toBe("minimum");
    expect(
      high.resolvedSettings.iso
    ).toBe(800);
    expect(
      high.isoResolution.clamped
    ).toBe("maximum");
  });

  it("fails closed on incomplete/invalid Auto ISO bound metadata", () => {
    const base =
      equipmentCapabilities();

    expect(() =>
      resolveManualExposureMode({
        target:
          targetForScale(2),
        capabilities: {
          ...base,
          iso: {
            ...base.iso,
            autoIsoMinimum: 200
          }
        },
        referenceExposure,
        manualAperture: 4,
        manualShutterSeconds:
          1 / 125,
        isoControl: {
          kind: "automatic",
          quantizationPolicy:
            "nearest-log2-lower-on-tie"
        }
      })
    ).toThrow(
      "must provide both minimum and maximum or neither"
    );

    expect(() =>
      resolveManualExposureMode({
        target:
          targetForScale(2),
        capabilities: {
          ...base,
          iso: {
            ...base.iso,
            autoIsoAvailability:
              "unsupported",
            autoIsoMinimum: 200,
            autoIsoMaximum: 800
          }
        },
        referenceExposure,
        manualAperture: 4,
        manualShutterSeconds:
          1 / 125,
        isoControl: {
          kind: "automatic",
          quantizationPolicy:
            "nearest-log2-lower-on-tie"
        }
      })
    ).toThrow(
      "used only when Auto ISO is supported"
    );
  });

  it("fails if discrete Auto ISO bounds contain no selectable grid value", () => {
    const base =
      equipmentCapabilities();

    expect(() =>
      resolveManualExposureMode({
        target:
          targetForScale(3),
        capabilities: {
          ...base,
          iso: {
            ...base.iso,
            autoIsoMinimum: 250,
            autoIsoMaximum: 350
          }
        },
        referenceExposure,
        manualAperture: 4,
        manualShutterSeconds:
          1 / 125,
        isoControl: {
          kind: "automatic",
          quantizationPolicy:
            "nearest-log2-lower-on-tie"
        }
      })
    ).toThrow(
      "contain no selectable values"
    );
  });
});

describe("generic signal-chain validation boundaries", () => {
  it("validates schema, domain ownership, required bindings, and duplicate mode identities", () => {
    expect(() =>
      parseGenericIsoSignalChainProfile({
        ...signalChainProfile(),
        schemaVersion: "9.9.9"
      })
    ).toThrow("schemaVersion");

    expect(() =>
      parseGenericIsoSignalChainProfile({
        ...signalChainProfile(),
        scientificStatus:
          "calibrated"
      })
    ).toThrow(
      "scientificStatus"
    );

    expect(() =>
      parseGenericIsoSignalChainProfile({
        ...signalChainProfile(),
        behaviorMeaning:
          "iso-is-noise"
      })
    ).toThrow(
      "behaviorMeaning"
    );

    expect(() =>
      parseGenericIsoSignalChainProfile({
        ...signalChainProfile(),
        photonShotNoiseOwnedUpstream:
          false
      })
    ).toThrow(
      "domain-ownership flags"
    );

    expect(() =>
      parseGenericIsoSignalChainProfile({
        ...signalChainProfile(),
        captureModeBindings: []
      })
    ).toThrow(
      "non-empty array"
    );

    expect(() =>
      parseGenericIsoSignalChainProfile({
        ...signalChainProfile(),
        captureModeBindings: [
          signalChainProfile()
            .captureModeBindings[0],
          signalChainProfile()
            .captureModeBindings[0]
        ]
      })
    ).toThrow(
      "duplicate captureModeId"
    );
  });

  it("validates regime-band order and expanded binding uniqueness", () => {
    expect(() =>
      parseGenericIsoSignalChainProfile({
        ...signalChainProfile(),
        captureModeBindings: [{
          captureModeId:
            "native",
          standardRegimeBands: [{
            minimumExposureIndex:
              800,
            maximumExposureIndex:
              400,
            readoutRegimeId:
              "base"
          }],
          expandedRegimeBindings:
            [],
          evidence:
            evidence("bad-band")
        }]
      })
    ).toThrow(
      "minimumExposureIndex must be less than or equal"
    );

    expect(() =>
      parseGenericIsoSignalChainProfile({
        ...signalChainProfile(),
        captureModeBindings: [{
          captureModeId:
            "native",
          standardRegimeBands: [{
            minimumExposureIndex:
              100,
            maximumExposureIndex:
              12800,
            readoutRegimeId:
              "base"
          }],
          expandedRegimeBindings: [
            {
              expandedSettingId:
                "high-1",
              readoutRegimeId:
                "base"
            },
            {
              expandedSettingId:
                "high-1",
              readoutRegimeId:
                "high-gain"
            }
          ],
          evidence:
            evidence("dup-expanded")
        }]
      })
    ).toThrow(
      "duplicate expandedSettingId"
    );
  });

  it("fails closed on readout identity drift, empty mode identity, and missing expanded regime binding", () => {
    expect(() =>
      resolveGenericIsoSignalChain({
        profile:
          signalChainProfile(),
        isoCapability:
          isoProfile(),
        requestedIsoSetting: {
          kind: "standard",
          exposureIndex: 400
        },
        captureModeId:
          "native",
        readoutProfile:
          parseSensorReadoutConversionProfile({
            ...readoutProfile(),
            profileId:
              "different-readout"
          })
      })
    ).toThrow(
      "readoutProfileId"
    );

    expect(() =>
      resolveGenericIsoSignalChain({
        profile:
          signalChainProfile(),
        isoCapability:
          isoProfile(),
        requestedIsoSetting: {
          kind: "standard",
          exposureIndex: 400
        },
        captureModeId: " ",
        readoutProfile:
          readoutProfile()
      })
    ).toThrow(
      "captureModeId must be a non-empty string"
    );

    const missingExpanded =
      parseGenericIsoSignalChainProfile({
        ...signalChainProfile(),
        profileId:
          "missing-expanded",
        captureModeBindings: [{
          ...signalChainProfile()
            .captureModeBindings[0]!,
          expandedRegimeBindings:
            []
        }]
      });

    expect(() =>
      resolveGenericIsoSignalChain({
        profile:
          missingExpanded,
        isoCapability:
          isoProfile(),
        requestedIsoSetting: {
          kind: "expanded",
          settingId: "high-1"
        },
        captureModeId:
          "native",
        readoutProfile:
          readoutProfile()
      })
    ).toThrow(
      "has no signal-chain regime binding"
    );
  });
});

describe("generic ISO preset validation boundaries", () => {
  it("validates catalog schema, exact cardinality, and preset labels", () => {
    expect(() =>
      parseGenericIsoSignalChainPresetCatalog({
        ...presetCatalog(),
        schemaVersion: "9.9.9"
      })
    ).toThrow("schemaVersion");

    expect(() =>
      parseGenericIsoSignalChainPresetCatalog({
        ...presetCatalog(),
        entries: [
          presetCatalog()
            .entries[0],
          presetCatalog()
            .entries[1]
        ]
      })
    ).toThrow(
      "exactly Good, Better, and Best"
    );

    expect(() =>
      parseGenericIsoSignalChainPresetCatalog({
        ...presetCatalog(),
        entries: [
          {
            preset: "great",
            signalChainProfileId:
              "profile",
            evidence:
              evidence("great")
          },
          presetCatalog()
            .entries[1],
          presetCatalog()
            .entries[2]
        ]
      })
    ).toThrow(
      ".preset is invalid"
    );
  });

  it("fails closed on an invalid runtime preset discriminator", () => {
    expect(() =>
      resolveGenericIsoSignalChainPreset({
        catalog:
          presetCatalog(),
        preset:
          "great" as "good"
      })
    ).toThrow(
      "preset must be good, better, or best"
    );
  });
});
