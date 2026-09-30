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
  type GenericReleaseCapabilityProfile,
  type ResolvedGenericEquipmentExposureCapabilities
} from "../src/index.js";

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
      .toBe("0.5.0");
    expect(plan.versions)
      .toMatchObject({
        engineApi: "0.85.0",
        captureSnapshot: "0.3.0",
        plan: "0.5.0"
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
