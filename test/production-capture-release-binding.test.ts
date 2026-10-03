import { describe, expect, it } from "vitest";

import {
  createLockedWhiteBalanceState,
  createProductionCaptureSnapshot,
  createProductionCaptureSnapshotFromReleaseFrame,
  createProductionImageFormationPlan,
  parseGenericBodyExposureCapabilityProfile,
  parseGenericLensExposureCapabilityProfile,
  parseGenericReleaseCapabilityProfile,
  parseProductionCaptureSnapshot,
  parseResolvedWhiteBalanceState,
  prepareImageFormationContext,
  resolveGenericEquipmentExposureCapabilities,
  resolveManualWhiteBalance,
  resolveReleaseSequence,
  type CreateProductionCaptureSnapshotInput,
  type GenericReleaseCapabilityProfile,
  type ProductionReleaseFrameBinding,
  type ResolvedGenericEquipmentExposureCapabilities
} from "../src/index.js";

type ReleaseFrame =
  ReturnType<typeof resolveReleaseSequence>["frames"][number];

const evidence = (
  ref: string
): readonly [{
  sourceOrigin: "photivra";
  sourceReference: string;
  reuseStatus: "photivra-owned";
}] => [{
  sourceOrigin: "photivra",
  sourceReference: ref,
  reuseStatus: "photivra-owned"
}];

const exposureCapabilities =
(): ResolvedGenericEquipmentExposureCapabilities => {
  const body =
    parseGenericBodyExposureCapabilityProfile({
      schemaVersion: "0.1.0",
      profileId: "body",
      profileVersion: "1.0.0",
      scientificStatus: "approximation",
      evidence: evidence("body"),
      shutter: {
        durationSecondsRange: {
          value: {
            minimum: 1 / 8000,
            maximum: 30
          },
          evidence: evidence("shutter")
        },
        settingGrid: {
          kind: "continuous-within-range"
        }
      },
      iso: {
        range: {
          value: {
            minimum: 50,
            maximum: 12800
          },
          evidence: evidence("iso")
        },
        settingGrid: {
          kind: "continuous-within-range"
        },
        autoIso: {
          value: "supported",
          evidence: evidence("auto-iso")
        }
      }
    });

  const lens =
    parseGenericLensExposureCapabilityProfile({
      schemaVersion: "0.1.0",
      profileId: "lens",
      profileVersion: "1.0.0",
      scientificStatus: "approximation",
      evidence: evidence("lens"),
      focalLengthMmRange: {
        value: {
          minimum: 50,
          maximum: 50
        },
        evidence: evidence("focal")
      },
      aperture: {
        widestAvailableFNumber: {
          kind: "constant",
          fNumber: {
            value: 1.8,
            evidence: evidence("wide")
          }
        },
        narrowestAvailableFNumber: {
          value: 16,
          evidence: evidence("narrow")
        },
        settingGrid: {
          kind: "continuous-within-range"
        }
      }
    });

  return resolveGenericEquipmentExposureCapabilities({
    bodyProfile: body,
    lensProfile: lens,
    selectedFocalLengthMm: 50
  });
};

const releaseCapabilities =
(): GenericReleaseCapabilityProfile =>
  parseGenericReleaseCapabilityProfile({
    schemaVersion: "0.1.0",
    profileId: "release",
    profileVersion: "1.0.0",
    scientificStatus: "approximation",
    evidence: evidence("release"),
    supportedDriveModes: {
      value: ["single", "burst"],
      evidence: evidence("drive")
    },
    maximumLogicalFramesPerSequence: {
      value: 10,
      evidence: evidence("count")
    },
    maximumCadenceFps: {
      value: 10,
      evidence: evidence("cadence")
    },
    minimumInterFrameGapSeconds: {
      value: 0.01,
      evidence: evidence("gap")
    },
    overlappingOrdinaryStillExposures:
      false,
    exposureBracketing: {
      availability: {
        value: "unsupported",
        evidence: evidence("no-exposure-bracket")
      },
      supportedAxes: []
    },
    focusBracketing: {
      availability: {
        value: "unsupported",
        evidence: evidence("no-focus-bracket")
      }
    }
  });

const lockedWb = (): ReturnType<typeof createLockedWhiteBalanceState> => {
  const manual =
    resolveManualWhiteBalance({
      stateId: "wb-manual",
      channelGains: {
        red: 1.25,
        green: 1,
        blue: 1.5
      }
    });

  return createLockedWhiteBalanceState({
    stateId: "wb-locked",
    sourceState: manual
  });
};

const releaseFrame = (): ReturnType<typeof resolveReleaseSequence>["frames"][number] => {
  const sequence =
    resolveReleaseSequence({
      sequenceId: "sequence-1",
      releaseRequestTimeSeconds: 12,
      sequenceSeedUint32: 12345,
      drive: {
        kind: "single"
      },
      bracket: {
        kind: "none"
      },
      baseState: {
        exposure: {
          aperture: 4,
          shutterSeconds: 1 / 125,
          iso: 200
        },
        focus: {
          kind: "finite",
          distanceM: 5
        },
        whiteBalanceStateId:
          "wb-locked",
        automation: {
          ae: "locked",
          af: "locked",
          awb: "locked"
        }
      },
      releaseCapabilities:
        releaseCapabilities(),
      exposureCapabilities:
        exposureCapabilities()
    });

  return sequence.frames[0]!;
};

const prepared = (): ReturnType<typeof prepareImageFormationContext> =>
  prepareImageFormationContext({
    contextId: "context",
    sceneId: "scene",
    sceneRadianceProviderProfileId:
      "provider",
    outputGeometryProfileId:
      "output",
    equipmentCapabilities:
      exposureCapabilities(),
    renderer: {
      schemaVersion: "0.1.0",
      rendererId: "renderer",
      rendererVersion: "1.0.0",
      consumerKind:
        "interactive-optimized",
      supportedStages: [],
      supportedEffects: [],
      spectralCapability:
        "wavelength-independent-approximation",
      temporalSampling: {
        kind: "none"
      },
      depthCapability: "none",
      inverseFieldMapping: true,
      alphaRepresentation:
        "premultiplied",
      preservesDepthOrderAcrossWarps:
        true,
      sensorDomainProcessing:
        false
    },
    fidelity: {
      schemaVersion: "0.1.0",
      profileId: "identity-only",
      profileVersion: "1.0.0",
      requiredStages: [],
      requiredEffects: [],
      rendererRequirements: {
        spectral:
          "wavelength-independent-approximation",
        sensorDomainProcessing:
          false,
        depth: "none"
      }
    }
  });

describe("production capture binding from release frame", () => {
  it("binds release timing/state, seed, and committed WB into one immutable snapshot", () => {
    const frame = releaseFrame();
    const wb = lockedWb();

    const snapshot =
      createProductionCaptureSnapshotFromReleaseFrame({
        captureId: "capture-1",
        sceneStateId: "scene-state-1",
        sceneTimeSecondsFromExposureStart:
          0,
        outputStateId: "output",
        releaseFrame: frame,
        whiteBalanceState: wb
      });

    expect(snapshot.version)
      .toBe("0.3.0");
    expect(snapshot.releaseFrameId)
      .toBe(frame.releaseFrameId);
    expect(snapshot.exposure)
      .toEqual(frame.exposure);
    expect(
      snapshot.stochasticSeedUint32
    ).toBe(
      frame.stochasticSeedUint32
    );
    expect(
      snapshot.releaseFrameBinding
    ).toMatchObject({
      releaseSequenceVersion: "0.1.0",
      sequenceId: "sequence-1",
      releaseFrameId:
        frame.releaseFrameId,
      frameIndex: 0,
      exposure: frame.exposure,
      stochasticSeedUint32:
        frame.stochasticSeedUint32,
      sceneTimeSecondsFromSequenceStart:
        frame.sceneTimeSecondsFromSequenceStart,
      focus: {
        kind: "finite",
        distanceM: 5
      },
      automation: {
        ae: "locked",
        af: "locked",
        awb: "locked"
      },
      whiteBalanceStateId:
        "wb-locked"
    });
    expect(
      snapshot.whiteBalanceState
    ).toEqual(wb);
    expect(
      Object.isFrozen(snapshot)
    ).toBe(true);
    expect(
      Object.isFrozen(
        snapshot.releaseFrameBinding
      )
    ).toBe(true);
    expect(
      Object.isFrozen(
        snapshot.whiteBalanceState
      )
    ).toBe(true);
  });

  it("round-trips the committed binding without re-estimating WB", () => {
    const snapshot =
      createProductionCaptureSnapshotFromReleaseFrame({
        captureId: "capture-1",
        sceneStateId: "scene-state-1",
        sceneTimeSecondsFromExposureStart:
          0,
        outputStateId: "output",
        releaseFrame:
          releaseFrame(),
        whiteBalanceState:
          lockedWb()
      });

    const parsed =
      parseProductionCaptureSnapshot(
        JSON.parse(
          JSON.stringify(snapshot)
        )
      );

    expect(parsed).toEqual(snapshot);
    expect(
      parsed.whiteBalanceState
        ?.channelGains
    ).toEqual({
      red: 1.25,
      green: 1,
      blue: 1.5
    });
  });

  it("propagates release and WB identity into the production plan", () => {
    const frame = releaseFrame();
    const snapshot =
      createProductionCaptureSnapshotFromReleaseFrame({
        captureId: "capture-plan",
        sceneStateId:
          "scene-state-plan",
        sceneTimeSecondsFromExposureStart:
          0,
        outputStateId: "output",
        releaseFrame: frame,
        whiteBalanceState:
          lockedWb()
      });

    const plan =
      createProductionImageFormationPlan({
        preparedContext:
          prepared(),
        captureSnapshot:
          snapshot
      });

    expect(plan.status)
      .toBe("ready");
    expect(plan.version)
      .toBe("0.7.0");
    expect(plan.versions)
      .toMatchObject({
        engineApi: "1.1.0",
        captureSnapshot: "0.3.0",
        plan: "0.7.0"
      });
    expect(plan.captureIdentity)
      .toMatchObject({
        captureId: "capture-plan",
        releaseFrameId:
          frame.releaseFrameId,
        sceneStateId:
          "scene-state-plan",
        releaseSequenceId:
          "sequence-1",
        releaseFrameIndex: 0,
        whiteBalanceStateId:
          "wb-locked"
      });
    expect(
      plan.stochastic
        .captureSeedUint32
    ).toBe(
      frame.stochasticSeedUint32
    );
  });

  it("rejects a WB state whose identity disagrees with the committed release frame", () => {
    const wrong =
      createLockedWhiteBalanceState({
        stateId: "other-wb",
        sourceState:
          resolveManualWhiteBalance({
            stateId: "manual-other",
            channelGains: {
              red: 1,
              green: 1,
              blue: 1
            }
          })
      });

    expect(() =>
      createProductionCaptureSnapshotFromReleaseFrame({
        captureId: "capture-wrong-wb",
        sceneStateId: "scene-state",
        sceneTimeSecondsFromExposureStart:
          0,
        outputStateId: "output",
        releaseFrame:
          releaseFrame(),
        whiteBalanceState:
          wrong
      })
    ).toThrow(
      "stateId must match releaseFrameBinding.whiteBalanceStateId"
    );
  });

  it("rejects an unlocked WB state when the release frame committed AWB lock", () => {
    const unlocked =
      resolveManualWhiteBalance({
        stateId: "wb-locked",
        channelGains: {
          red: 1.1,
          green: 1,
          blue: 1.2
        }
      });

    expect(() =>
      createProductionCaptureSnapshotFromReleaseFrame({
        captureId: "capture-unlocked",
        sceneStateId: "scene-state",
        sceneTimeSecondsFromExposureStart:
          0,
        outputStateId: "output",
        releaseFrame:
          releaseFrame(),
        whiteBalanceState:
          unlocked
      })
    ).toThrow(
      "locked AWB requires a locked"
    );
  });

  it("rejects direct binding drift in release identity or exposure duration", () => {
    const frame = releaseFrame();

    expect(() =>
      createProductionCaptureSnapshot({
        captureId: "capture-drift",
        releaseFrameId:
          frame.releaseFrameId,
        sceneStateId: "scene-state",
        sceneTimeSecondsFromExposureStart:
          0,
        outputStateId: "output",
        exposure: {
          ...frame.exposure
        },
        stochasticSeedUint32:
          frame.stochasticSeedUint32,
        releaseFrameBinding: {
          releaseSequenceVersion: "0.1.0",
          sequenceId:
            frame.sequenceId,
          releaseFrameId:
            "different-frame",
          frameIndex:
            frame.frameIndex,
          exposure: {
            ...frame.exposure
          },
          stochasticSeedUint32:
            frame.stochasticSeedUint32,
          exposureStartTimeSeconds:
            frame.exposureStartTimeSeconds,
          exposureEndTimeSeconds:
            frame.exposureEndTimeSeconds,
          sceneTimeSecondsFromSequenceStart:
            frame.sceneTimeSecondsFromSequenceStart,
          startIntervalFromPreviousSeconds:
            frame.startIntervalFromPreviousSeconds,
          timingConstraints:
            frame.timingConstraints,
          focus: frame.focus,
          automation:
            frame.automation,
          ...(frame.whiteBalanceStateId ===
          undefined
            ? {}
            : {
                whiteBalanceStateId:
                  frame.whiteBalanceStateId
              })
        },
        whiteBalanceState:
          lockedWb()
      })
    ).toThrow(
      "releaseFrameId must match"
    );

    expect(() =>
      createProductionCaptureSnapshot({
        captureId: "capture-duration-drift",
        releaseFrameId:
          frame.releaseFrameId,
        sceneStateId: "scene-state",
        sceneTimeSecondsFromExposureStart:
          0,
        outputStateId: "output",
        exposure: {
          ...frame.exposure,
          shutterSeconds: 1
        },
        stochasticSeedUint32:
          frame.stochasticSeedUint32,
        releaseFrameBinding: {
          releaseSequenceVersion: "0.1.0",
          sequenceId:
            frame.sequenceId,
          releaseFrameId:
            frame.releaseFrameId,
          frameIndex:
            frame.frameIndex,
          exposure: {
            ...frame.exposure
          },
          stochasticSeedUint32:
            frame.stochasticSeedUint32,
          exposureStartTimeSeconds:
            frame.exposureStartTimeSeconds,
          exposureEndTimeSeconds:
            frame.exposureEndTimeSeconds,
          sceneTimeSecondsFromSequenceStart:
            frame.sceneTimeSecondsFromSequenceStart,
          startIntervalFromPreviousSeconds:
            frame.startIntervalFromPreviousSeconds,
          timingConstraints:
            frame.timingConstraints,
          focus: frame.focus,
          automation:
            frame.automation,
          ...(frame.whiteBalanceStateId ===
          undefined
            ? {}
            : {
                whiteBalanceStateId:
                  frame.whiteBalanceStateId
              })
        },
        whiteBalanceState:
          lockedWb()
      })
    ).toThrow(
      "duration must match exposure.shutterSeconds"
    );
  });
});

describe("resolved WB state parser", () => {
  it("round-trips a locked committed state", () => {
    const wb = lockedWb();

    expect(
      parseResolvedWhiteBalanceState(
        JSON.parse(
          JSON.stringify(wb)
        )
      )
    ).toEqual(wb);
  });

  it("rejects impossible committed-state mutations", () => {
    const wb = lockedWb();

    expect(() =>
      parseResolvedWhiteBalanceState({
        ...wb,
        physicalExposureModified:
          true
      })
    ).toThrow(
      "physicalExposureModified must remain false"
    );

    expect(() =>
      parseResolvedWhiteBalanceState({
        ...wb,
        sourceStateId: undefined
      })
    ).toThrow(
      "locked WB state requires sourceStateId"
    );
  });
});


describe("resolved WB parser semantic variants", () => {
  const baseState = {
    version: "0.1.0" as const,
    inputDomain:
      "relative-pre-wb-camera-linear-rgb" as const,
    channelGains: {
      red: 1.2,
      green: 1,
      blue: 1.4
    },
    locked: false,
    trueIlluminantMetadataUsed:
      false as const,
    sceneIlluminationModified:
      false as const,
    rawCaptureDestructivelyModified:
      false as const,
    physicalExposureModified:
      false as const,
    focusModified: false as const,
    limitations: [] as readonly string[]
  };

  const measurement = {
    imageStateId: "image-state",
    usableSampleCount: 2,
    rejectedClippedSampleCount: 1,
    weightedMeanPreWbSignal: {
      red: 0.8,
      green: 1,
      blue: 1.3
    }
  };

  it("parses manual, preset, custom, and AWB committed states", () => {
    const manual =
      parseResolvedWhiteBalanceState({
        ...baseState,
        stateId: "manual",
        source: "manual-gains"
      });
    expect(manual.source)
      .toBe("manual-gains");

    const preset =
      parseResolvedWhiteBalanceState({
        ...baseState,
        stateId: "preset",
        source: "preset",
        sourceProfile: {
          profileId: "wb-profile",
          profileVersion: "1.0.0"
        },
        presetId: "daylight"
      });
    expect(preset.presetId)
      .toBe("daylight");

    const custom =
      parseResolvedWhiteBalanceState({
        ...baseState,
        stateId: "custom",
        source:
          "custom-measurement",
        measurement
      });
    expect(
      custom.measurement
        ?.usableSampleCount
    ).toBe(2);

    const awb =
      parseResolvedWhiteBalanceState({
        ...baseState,
        stateId: "awb",
        source:
          "auto-white-balance",
        sourceProfile: {
          profileId: "wb-profile",
          profileVersion: "1.0.0"
        },
        awbPolicy: {
          policyId: "standard",
          intent: "standard",
          correctionStrength: 0.8
        },
        measurement
      });
    expect(awb.awbPolicy)
      .toMatchObject({
        policyId: "standard",
        intent: "standard",
        correctionStrength: 0.8
      });
  });

  it("validates committed WB discriminants and required source metadata", () => {
    expect(() =>
      parseResolvedWhiteBalanceState({
        ...baseState,
        version: "9.9.9",
        stateId: "bad-version",
        source: "manual-gains"
      })
    ).toThrow("version must be");

    expect(() =>
      parseResolvedWhiteBalanceState({
        ...baseState,
        inputDomain: "display-rgb",
        stateId: "bad-domain",
        source: "manual-gains"
      })
    ).toThrow("inputDomain");

    expect(() =>
      parseResolvedWhiteBalanceState({
        ...baseState,
        stateId: "bad-source",
        source: "magic"
      })
    ).toThrow("source is invalid");

    expect(() =>
      parseResolvedWhiteBalanceState({
        ...baseState,
        stateId: "bad-locked",
        source: "manual-gains",
        locked: "yes"
      })
    ).toThrow("locked must be boolean");

    expect(() =>
      parseResolvedWhiteBalanceState({
        ...baseState,
        stateId: "preset-missing",
        source: "preset",
        presetId: "daylight"
      })
    ).toThrow(
      "requires sourceProfile and presetId"
    );

    expect(() =>
      parseResolvedWhiteBalanceState({
        ...baseState,
        stateId: "custom-missing",
        source:
          "custom-measurement"
      })
    ).toThrow(
      "requires measurement identity"
    );

    expect(() =>
      parseResolvedWhiteBalanceState({
        ...baseState,
        stateId: "awb-missing",
        source:
          "auto-white-balance",
        sourceProfile: {
          profileId: "wb",
          profileVersion: "1"
        }
      })
    ).toThrow(
      "requires sourceProfile, awbPolicy, and measurement"
    );
  });

  it("validates lock identity, AWB policy, and measurement fields", () => {
    expect(() =>
      parseResolvedWhiteBalanceState({
        ...baseState,
        stateId: "unlocked-with-source",
        source: "manual-gains",
        sourceStateId: "old"
      })
    ).toThrow(
      "unlocked WB state must not declare sourceStateId"
    );

    expect(() =>
      parseResolvedWhiteBalanceState({
        ...baseState,
        stateId: "bad-awb",
        source:
          "auto-white-balance",
        sourceProfile: {
          profileId: "wb",
          profileVersion: "1"
        },
        awbPolicy: {
          policyId: "bad",
          intent: "magic",
          correctionStrength: 0.5
        },
        measurement
      })
    ).toThrow(
      "awbPolicy.intent is invalid"
    );

    expect(() =>
      parseResolvedWhiteBalanceState({
        ...baseState,
        stateId: "bad-measurement",
        source:
          "custom-measurement",
        measurement: {
          ...measurement,
          usableSampleCount: 0
        }
      })
    ).toThrow(
      "usableSampleCount must be greater than zero"
    );

    expect(() =>
      parseResolvedWhiteBalanceState({
        ...baseState,
        stateId: "bad-gain",
        source: "manual-gains",
        channelGains: {
          red: 0,
          green: 1,
          blue: 1
        }
      })
    ).toThrow(
      "channelGains.red must be greater than zero"
    );
  });
});

describe("release binding validation boundaries", () => {
  const bindingFor = (
    frame: ReleaseFrame
  ): ProductionReleaseFrameBinding => ({
    releaseSequenceVersion:
      "0.1.0" as const,
    sequenceId:
      frame.sequenceId,
    releaseFrameId:
      frame.releaseFrameId,
    frameIndex:
      frame.frameIndex,
    exposure: {
      ...frame.exposure
    },
    stochasticSeedUint32:
      frame.stochasticSeedUint32,
    exposureStartTimeSeconds:
      frame.exposureStartTimeSeconds,
    exposureEndTimeSeconds:
      frame.exposureEndTimeSeconds,
    sceneTimeSecondsFromSequenceStart:
      frame.sceneTimeSecondsFromSequenceStart,
    startIntervalFromPreviousSeconds:
      frame.startIntervalFromPreviousSeconds,
    timingConstraints: [
      ...frame.timingConstraints
    ],
    focus: frame.focus,
    automation:
      frame.automation,
    ...(frame.whiteBalanceStateId ===
    undefined
      ? {}
      : {
          whiteBalanceStateId:
            frame.whiteBalanceStateId
        })
  });

  const directInput = (): {
    frame: ReleaseFrame;
    input: CreateProductionCaptureSnapshotInput & {
      releaseFrameBinding:
        ProductionReleaseFrameBinding;
      whiteBalanceState:
        ReturnType<typeof lockedWb>;
    };
  } => {
    const frame = releaseFrame();
    return {
      frame,
      input: {
        captureId: "binding-validation",
        releaseFrameId:
          frame.releaseFrameId,
        sceneStateId:
          "scene-state",
        sceneTimeSecondsFromExposureStart:
          0,
        outputStateId: "output",
        exposure: {
          ...frame.exposure
        },
        stochasticSeedUint32:
          frame.stochasticSeedUint32,
        releaseFrameBinding:
          bindingFor(frame),
        whiteBalanceState:
          lockedWb()
      }
    };
  };

  it("rejects release exposure/seed drift and malformed timing metadata", () => {
    const first = directInput();
    expect(() =>
      createProductionCaptureSnapshot({
        ...first.input,
        releaseFrameBinding: {
          ...first.input.releaseFrameBinding,
          exposure: {
            ...first.frame.exposure,
            aperture: 8
          }
        }
      })
    ).toThrow(
      "exposure must match the committed capture exposure"
    );

    const second = directInput();
    expect(() =>
      createProductionCaptureSnapshot({
        ...second.input,
        releaseFrameBinding: {
          ...second.input.releaseFrameBinding,
          stochasticSeedUint32:
            second.frame
              .stochasticSeedUint32 +
            1
        }
      })
    ).toThrow(
      "stochasticSeedUint32 must match"
    );

    const third = directInput();
    expect(() =>
      createProductionCaptureSnapshot({
        ...third.input,
        releaseFrameBinding: {
          ...third.input.releaseFrameBinding,
          startIntervalFromPreviousSeconds:
            0.2
        }
      })
    ).toThrow(
      "first release frame must not declare"
    );

    const fourth = directInput();
    expect(() =>
      createProductionCaptureSnapshot({
        ...fourth.input,
        releaseFrameBinding: {
          ...fourth.input.releaseFrameBinding,
          timingConstraints: [
            "requested-cadence",
            "requested-cadence"
          ]
        }
      })
    ).toThrow(
      "timingConstraints must not contain duplicates"
    );
  });

  it("fails closed on malformed release contract identity and timing", () => {
    const first = directInput();
    expect(() =>
      createProductionCaptureSnapshot({
        ...first.input,
        releaseFrameBinding: {
          ...first.input.releaseFrameBinding,
          releaseSequenceVersion:
            "9.9.9" as "0.1.0"
        }
      })
    ).toThrow(
      "releaseSequenceVersion must be"
    );

    const second = directInput();
    expect(() =>
      createProductionCaptureSnapshot({
        ...second.input,
        releaseFrameBinding: {
          ...second.input.releaseFrameBinding,
          frameIndex: -1
        }
      })
    ).toThrow(
      "frameIndex must be a non-negative safe integer"
    );

    const third = directInput();
    expect(() =>
      createProductionCaptureSnapshot({
        ...third.input,
        releaseFrameBinding: {
          ...third.input.releaseFrameBinding,
          exposureEndTimeSeconds:
            third.input
              .releaseFrameBinding
              .exposureStartTimeSeconds
        }
      })
    ).toThrow(
      "exposure end must be after exposure start"
    );

    const fourth = directInput();
    expect(() =>
      createProductionCaptureSnapshot({
        ...fourth.input,
        releaseFrameBinding: {
          ...fourth.input.releaseFrameBinding,
          frameIndex: 1,
          startIntervalFromPreviousSeconds:
            null
        }
      })
    ).toThrow(
      "non-first release frame must declare"
    );
  });

  it("fails closed on invalid release timing constraints and automation states", () => {
    const first = directInput();
    expect(() =>
      createProductionCaptureSnapshot({
        ...first.input,
        releaseFrameBinding: {
          ...first.input.releaseFrameBinding,
          timingConstraints: [
            "invalid" as "requested-cadence"
          ]
        }
      })
    ).toThrow(
      "timingConstraints[0] is invalid"
    );

    const second = directInput();
    expect(() =>
      createProductionCaptureSnapshot({
        ...second.input,
        releaseFrameBinding: {
          ...second.input.releaseFrameBinding,
          automation: {
            ...second.input
              .releaseFrameBinding
              .automation,
            ae: "invalid" as "locked"
          }
        }
      })
    ).toThrow(
      "automation.ae is invalid"
    );
  });

  it("requires WB state exactly when the release frame commits a WB identity", () => {
    const first = directInput();
    const withoutWb:
      CreateProductionCaptureSnapshotInput = {
        ...first.input
      };
    delete withoutWb.whiteBalanceState;
    expect(() =>
      createProductionCaptureSnapshot(
        withoutWb
      )
    ).toThrow(
      "requires the committed resolved white-balance state"
    );

    const frame = releaseFrame();
    const binding = bindingFor(frame);
    const noWbBinding:
      ProductionReleaseFrameBinding = {
        ...binding
      };
    delete noWbBinding.whiteBalanceStateId;

    expect(() =>
      createProductionCaptureSnapshot({
        captureId: "unexpected-wb",
        releaseFrameId:
          frame.releaseFrameId,
        sceneStateId: "scene",
        sceneTimeSecondsFromExposureStart:
          0,
        outputStateId: "output",
        exposure: {
          ...frame.exposure
        },
        stochasticSeedUint32:
          frame.stochasticSeedUint32,
        releaseFrameBinding:
          noWbBinding,
        whiteBalanceState:
          lockedWb()
      })
    ).toThrow(
      "must not receive a committed whiteBalanceState"
    );
  });
});
