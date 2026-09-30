import { describe, expect, it } from "vitest";

import {
  cancelReleaseSequence,
  parseGenericBodyExposureCapabilityProfile,
  parseGenericLensExposureCapabilityProfile,
  parseGenericReleaseCapabilityProfile,
  resolveGenericEquipmentExposureCapabilities,
  resolveReleaseSequence,
  type GenericReleaseCapabilityProfile,
  type ReleaseBaseCaptureState,
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

const releaseCapabilities =
(): GenericReleaseCapabilityProfile =>
  parseGenericReleaseCapabilityProfile({
    schemaVersion: "0.1.0",
    profileId: "generic-release",
    profileVersion: "1.0.0",
    scientificStatus: "approximation",
    evidence: evidence("release"),
    supportedDriveModes: {
      value: [
        "single",
        "burst",
        "self-timer"
      ],
      evidence: evidence("drive")
    },
    maximumLogicalFramesPerSequence: {
      value: 20,
      evidence: evidence("frames")
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
        value: "supported",
        evidence: evidence("exposure-bracket")
      },
      supportedAxes: [
        "shutter",
        "iso",
        "aperture"
      ]
    },
    focusBracketing: {
      availability: {
        value: "supported",
        evidence: evidence("focus-bracket")
      }
    }
  });

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
            value: 1.4,
            evidence: evidence("wide")
          }
        },
        narrowestAvailableFNumber: {
          value: 22,
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

const baseState = (): ReleaseBaseCaptureState => ({
  exposure: {
    aperture: 4,
    shutterSeconds: 1 / 125,
    iso: 100
  },
  focus: {
    kind: "finite" as const,
    distanceM: 5
  },
  whiteBalanceStateId: "wb-state-1",
  automation: {
    ae: "locked" as const,
    af: "continuous" as const,
    awb: "locked" as const
  }
});

describe("logical release sequencing", () => {
  it("schedules exactly one logical exposure for a single release", () => {
    const sequence =
      resolveReleaseSequence({
        sequenceId: "single-1",
        releaseRequestTimeSeconds: 10,
        sequenceSeedUint32: 123,
        drive: {
          kind: "single"
        },
        bracket: {
          kind: "none"
        },
        baseState: baseState(),
        releaseCapabilities:
          releaseCapabilities(),
        exposureCapabilities:
          exposureCapabilities()
      });

    expect(sequence.frames).toHaveLength(1);
    expect(
      sequence.frames[0]?.exposureStartTimeSeconds
    ).toBe(10);
    expect(
      sequence.frames[0]?.exposureEndTimeSeconds
    ).toBeCloseTo(
      10 + 1 / 125,
      12
    );
    expect(
      sequence.sensorCaptureModeOwnership
    ).toBe(
      "separate-logical-capture-contract"
    );
    expect(
      sequence.whiteBalanceBracketingPhysicalCaptures
    ).toBe(false);
  });

  it("slows a burst rather than scheduling physically overlapping ordinary still exposures", () => {
    const state = baseState();
    state.exposure.shutterSeconds =
      0.2;

    const sequence =
      resolveReleaseSequence({
        sequenceId: "burst-1",
        releaseRequestTimeSeconds: 0,
        sequenceSeedUint32: 99,
        drive: {
          kind: "burst",
          frameCount: 3
        },
        bracket: {
          kind: "none"
        },
        requestedCadenceFps: 20,
        baseState: state,
        releaseCapabilities:
          releaseCapabilities(),
        exposureCapabilities:
          exposureCapabilities()
      });

    expect(sequence.frames).toHaveLength(3);
    expect(
      sequence.frames[1]
        ?.startIntervalFromPreviousSeconds
    ).toBeCloseTo(0.21, 12);
    expect(
      sequence.frames[1]
        ?.timingConstraints
    ).toEqual([
      "exposure-duration",
      "minimum-inter-frame-gap"
    ]);
    expect(
      sequence.frames[1]
        ?.exposureStartTimeSeconds
    ).toBeGreaterThanOrEqual(
      sequence.frames[0]
        ?.exposureEndTimeSeconds ?? 0
    );
  });

  it("derives reproducible but distinct per-frame seeds and scene times", () => {
    const input = {
      sequenceId: "burst-seed",
      releaseRequestTimeSeconds: 2,
      sequenceSeedUint32: 42,
      drive: {
        kind: "burst" as const,
        frameCount: 4
      },
      bracket: {
        kind: "none" as const
      },
      requestedCadenceFps: 5,
      baseState: baseState(),
      releaseCapabilities:
        releaseCapabilities(),
      exposureCapabilities:
        exposureCapabilities()
    };

    const first =
      resolveReleaseSequence(input);
    const second =
      resolveReleaseSequence(input);

    expect(first).toEqual(second);
    expect(
      new Set(
        first.frames.map(
          (frame) =>
            frame.stochasticSeedUint32
        )
      ).size
    ).toBe(4);

    const positions =
      first.frames.map(
        (frame) =>
          3 *
          frame
            .sceneTimeSecondsFromSequenceStart
      );
    expect(
      new Set(positions).size
    ).toBe(4);
  });

  it("applies one self-timer delay before a multi-shot sequence without changing exposure duration", () => {
    const sequence =
      resolveReleaseSequence({
        sequenceId: "timer-1",
        releaseRequestTimeSeconds: 1,
        sequenceSeedUint32: 7,
        drive: {
          kind: "self-timer",
          delaySeconds: 2,
          frameCount: 3
        },
        bracket: {
          kind: "none"
        },
        requestedCadenceFps: 5,
        baseState: baseState(),
        releaseCapabilities:
          releaseCapabilities(),
        exposureCapabilities:
          exposureCapabilities()
      });

    expect(
      sequence.frames[0]
        ?.exposureStartTimeSeconds
    ).toBe(3);
    expect(
      sequence.frames[0]
        ?.exposure.shutterSeconds
    ).toBe(1 / 125);
    expect(sequence.frames).toHaveLength(3);
  });

  it("resolves exposure bracketing as physical setting changes rather than post-render brightness changes", () => {
    const sequence =
      resolveReleaseSequence({
        sequenceId: "bracket-exp",
        releaseRequestTimeSeconds: 0,
        sequenceSeedUint32: 100,
        drive: {
          kind: "single"
        },
        bracket: {
          kind: "exposure",
          axis: "shutter",
          offsetsStops: [
            -1,
            0,
            1
          ]
        },
        requestedCadenceFps: 5,
        baseState: baseState(),
        releaseCapabilities:
          releaseCapabilities(),
        exposureCapabilities:
          exposureCapabilities()
      });

    expect(
      sequence.frames.map(
        (frame) =>
          frame.exposure.shutterSeconds
      )
    ).toEqual([
      1 / 250,
      1 / 125,
      2 / 125
    ]);
    expect(
      sequence.frames.map(
        (frame) =>
          frame
            .exposureBracketOffsetStops
      )
    ).toEqual([
      -1,
      0,
      1
    ]);
  });

  it("uses explicit focus states for focus bracketing without claiming stacked output", () => {
    const sequence =
      resolveReleaseSequence({
        sequenceId: "bracket-focus",
        releaseRequestTimeSeconds: 0,
        sequenceSeedUint32: 101,
        drive: {
          kind: "single"
        },
        bracket: {
          kind: "focus",
          focusStates: [
            {
              kind: "finite",
              distanceM: 2
            },
            {
              kind: "finite",
              distanceM: 5
            },
            {
              kind: "infinity"
            }
          ]
        },
        requestedCadenceFps: 4,
        baseState: baseState(),
        releaseCapabilities:
          releaseCapabilities(),
        exposureCapabilities:
          exposureCapabilities()
      });

    expect(
      sequence.frames.map(
        (frame) => frame.focus
      )
    ).toEqual([
      {
        kind: "finite",
        distanceM: 2
      },
      {
        kind: "finite",
        distanceM: 5
      },
      {
        kind: "infinity"
      }
    ]);
    expect(
      sequence.sensorCaptureModeOwnership
    ).toBe(
      "separate-logical-capture-contract"
    );
  });

  it("snapshots base state so later UI mutation cannot rewrite scheduled frames", () => {
    const state = baseState();
    const sequence =
      resolveReleaseSequence({
        sequenceId: "snapshot",
        releaseRequestTimeSeconds: 0,
        sequenceSeedUint32: 5,
        drive: {
          kind: "single"
        },
        bracket: {
          kind: "none"
        },
        baseState: state,
        releaseCapabilities:
          releaseCapabilities(),
        exposureCapabilities:
          exposureCapabilities()
      });

    state.exposure.iso = 6400;
    state.focus.distanceM = 20;

    expect(
      sequence
        .baseStateSnapshot
        .exposure.iso
    ).toBe(100);
    expect(
      sequence.frames[0]?.focus
    ).toEqual({
      kind: "finite",
      distanceM: 5
    });
    expect(
      Object.isFrozen(sequence)
    ).toBe(true);
  });

  it("returns an explicit cancellation boundary without mutating the scheduled sequence", () => {
    const sequence =
      resolveReleaseSequence({
        sequenceId: "cancel",
        releaseRequestTimeSeconds: 0,
        sequenceSeedUint32: 77,
        drive: {
          kind: "burst",
          frameCount: 4
        },
        bracket: {
          kind: "none"
        },
        requestedCadenceFps: 5,
        baseState: baseState(),
        releaseCapabilities:
          releaseCapabilities(),
        exposureCapabilities:
          exposureCapabilities()
      });

    const cancelled =
      cancelReleaseSequence({
        sequence,
        completedFrameCount: 2,
        cancelledAtSeconds: 0.45
      });

    expect(cancelled).toMatchObject({
      status: "cancelled",
      completedFrameCount: 2,
      omittedFrameCount: 2,
      sourceSequenceFrameCount: 4,
      sourceSequenceUnmodified: true
    });
    expect(
      cancelled.completedFrames
    ).toEqual(
      sequence.frames.slice(0, 2)
    );
    expect(sequence.status)
      .toBe("scheduled");
  });

  it("fails explicitly on unsupported bracket combinations instead of falling back", () => {
    expect(() =>
      resolveReleaseSequence({
        sequenceId: "bad-combo",
        releaseRequestTimeSeconds: 0,
        sequenceSeedUint32: 1,
        drive: {
          kind: "burst",
          frameCount: 3
        },
        bracket: {
          kind: "exposure",
          axis: "iso",
          offsetsStops: [
            -1,
            0,
            1
          ]
        },
        requestedCadenceFps: 5,
        baseState: baseState(),
        releaseCapabilities:
          releaseCapabilities(),
        exposureCapabilities:
          exposureCapabilities()
      })
    ).toThrow(
      "does not combine burst drive with bracketing"
    );

    const unsupported =
      parseGenericReleaseCapabilityProfile({
        ...releaseCapabilities(),
        exposureBracketing: {
          availability: {
            value: "unsupported",
            evidence: evidence("no-bracket")
          },
          supportedAxes: []
        }
      });

    expect(() =>
      resolveReleaseSequence({
        sequenceId: "unsupported",
        releaseRequestTimeSeconds: 0,
        sequenceSeedUint32: 1,
        drive: {
          kind: "single"
        },
        bracket: {
          kind: "exposure",
          axis: "iso",
          offsetsStops: [0]
        },
        baseState: baseState(),
        releaseCapabilities:
          unsupported,
        exposureCapabilities:
          exposureCapabilities()
      })
    ).toThrow(
      "Exposure bracketing is not supported"
    );
  });
});
