import { describe, expect, it } from "vitest";

import {
  assessFocusReleaseGate,
  calculateFocusPlaneImageDistance,
  createFocusControlState,
  parseFocusControlProfile,
  resolveFocusTargetObservation,
  setFocusLock,
  setManualFocusState,
  type FocusControlProfile,
  type FocusControlState
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

const profile = (): FocusControlProfile =>
  parseFocusControlProfile({
    schemaVersion: "0.1.0",
    profileId: "generic-focus",
    profileVersion: "1.0.0",
    scientificStatus: "approximation",
    supportedModes: [
      "manual",
      "single-af",
      "continuous-af"
    ],
    actuator: {
      kind: "ideal-instantaneous",
      evidence:
        evidence("ideal-actuator")
    },
    continuousTargetLossPolicy:
      "hold-last-focus-require-explicit-reacquisition",
    supportedReleasePriorities: [
      "focus-priority",
      "release-priority",
      "balanced"
    ],
    evidence:
      evidence("focus-profile"),
    limitations: [
      "Generic ideal focus-control test profile."
    ]
  });

const state = (
  mode:
    "manual" |
    "single-af" |
    "continuous-af",
  distanceM = 5
): FocusControlState =>
  createFocusControlState({
    stateId:
      "state-" + mode,
    profile: profile(),
    mode,
    initialFocus: {
      kind: "finite",
      distanceM
    }
  });

describe("focus-control profile and state", () => {
  it("creates immutable generic focus states with explicit independence boundaries", () => {
    const initial =
      state("single-af");

    expect(initial).toMatchObject({
      version: "0.1.0",
      mode: "single-af",
      acquisitionState: "idle",
      locked: false,
      actuatorModel:
        "ideal-instantaneous",
      continuousTargetLossPolicy:
        "hold-last-focus-require-explicit-reacquisition",
      exposureModified: false,
      meteringModified: false,
      whiteBalanceModified: false,
      subjectTrackingRecognitionModeled:
        false,
      rendererCoordinatesConsumed:
        false
    });
    expect(
      Object.isFrozen(initial)
    ).toBe(true);
    expect(
      Object.isFrozen(
        initial.focus
      )
    ).toBe(true);
  });

  it("rejects unsupported modes and non-ideal actuator claims in schema 0.1.0", () => {
    expect(() =>
      createFocusControlState({
        stateId: "unsupported",
        profile:
          parseFocusControlProfile({
            ...profile(),
            supportedModes: [
              "manual"
            ]
          }),
        mode: "continuous-af",
        initialFocus: {
          kind: "infinity"
        }
      })
    ).toThrow(
      "mode is not supported"
    );

    expect(() =>
      parseFocusControlProfile({
        ...profile(),
        actuator: {
          kind: "commercial-servo",
          evidence:
            evidence("unsupported")
        }
      })
    ).toThrow(
      "ideal-instantaneous"
    );
  });
});

describe("manual focus", () => {
  it("preserves explicit focus until a manual command changes it", () => {
    const initial =
      state("manual", 5);

    const nearer =
      setManualFocusState({
        state: initial,
        stateId: "manual-nearer",
        focus: {
          kind: "finite",
          distanceM: 3
        },
        eventTimeSeconds: 1,
        commandId: "step-1"
      });

    expect(
      initial.focus
    ).toEqual({
      kind: "finite",
      distanceM: 5
    });
    expect(
      nearer.focus
    ).toEqual({
      kind: "finite",
      distanceM: 3
    });

    const infinity =
      setManualFocusState({
        state: nearer,
        stateId: "manual-infinity",
        focus: {
          kind: "infinity"
        },
        eventTimeSeconds: 2
      });

    expect(
      infinity.focus
    ).toEqual({
      kind: "infinity"
    });
    expect(
      infinity.acquisitionState
    ).toBe("idle");
    expect(
      infinity.limitations.length
    ).toBe(
      initial.limitations.length
    );
  });

  it("does not automatically consume renderer/app target observations in MF", () => {
    const initial =
      state("manual");

    expect(() =>
      resolveFocusTargetObservation({
        state: initial,
        stateId: "manual-target",
        event: "acquire",
        observation: {
          kind: "finite-surface",
          targetId: "surface-1",
          focusAreaId: "area-1",
          observedAtSeconds: 1,
          longitudinalDistanceM:
            2
        }
      })
    ).toThrow(
      "Manual focus does not automatically consume"
    );
  });
});

describe("single autofocus", () => {
  it("acquires once and then holds focus when the target moves", () => {
    const initial =
      state("single-af");

    const acquired =
      resolveFocusTargetObservation({
        state: initial,
        stateId: "afs-acquired",
        event: "acquire",
        observation: {
          kind: "finite-surface",
          targetId: "subject-1",
          focusAreaId: "point-a",
          observedAtSeconds: 1,
          longitudinalDistanceM:
            2
        }
      });

    expect(
      acquired.state.focus
    ).toEqual({
      kind: "finite",
      distanceM: 2
    });
    expect(
      acquired.state
        .acquisitionState
    ).toBe("acquired");

    const moved =
      resolveFocusTargetObservation({
        state: acquired.state,
        stateId: "afs-update",
        event: "update",
        observation: {
          kind: "finite-surface",
          targetId: "subject-1",
          focusAreaId: "point-a",
          observedAtSeconds: 2,
          longitudinalDistanceM:
            4
        }
      });

    expect(
      moved.state
    ).toBe(acquired.state);
    expect(
      moved.state.focus
    ).toEqual({
      kind: "finite",
      distanceM: 2
    });
    expect(
      moved.targetObservationApplied
    ).toBe(false);
    expect(
      moved.focusChanged
    ).toBe(false);
  });

  it("uses longitudinal distance rather than off-axis renderer ray length", () => {
    const first =
      resolveFocusTargetObservation({
        state: state("single-af"),
        stateId: "afs-a",
        event: "acquire",
        observation: {
          kind: "finite-surface",
          targetId: "surface-a",
          focusAreaId: "left-edge",
          observedAtSeconds: 1,
          longitudinalDistanceM:
            7
        }
      }).state;

    const second =
      resolveFocusTargetObservation({
        state: state("single-af"),
        stateId: "afs-b",
        event: "acquire",
        observation: {
          kind: "finite-surface",
          targetId: "surface-b",
          focusAreaId: "right-edge",
          observedAtSeconds: 1,
          longitudinalDistanceM:
            7
        }
      }).state;

    expect(first.focus)
      .toEqual(second.focus);

    expect(
      calculateFocusPlaneImageDistance({
        focalLengthMm: 50,
        focus: first.focus
      }).value
    ).toEqual(
      calculateFocusPlaneImageDistance({
        focalLengthMm: 50,
        focus: second.focus
      }).value
    );
  });

  it("reports failed acquisition explicitly without changing the optical focus plane", () => {
    const initial =
      state("single-af", 5);
    const lost =
      resolveFocusTargetObservation({
        state: initial,
        stateId: "afs-lost",
        event: "acquire",
        observation: {
          kind: "unavailable",
          targetId: "subject-1",
          observedAtSeconds: 1,
          reason: "occluded"
        }
      });

    expect(
      lost.state
        .acquisitionState
    ).toBe("target-lost");
    expect(
      lost.state.focus
    ).toEqual(initial.focus);
  });
});

describe("continuous autofocus", () => {
  const acquire = ():
    FocusControlState =>
      resolveFocusTargetObservation({
        state:
          state("continuous-af"),
        stateId: "afc-acquired",
        event: "acquire",
        observation: {
          kind: "finite-surface",
          targetId: "runner",
          focusAreaId: "tracking-area",
          observedAtSeconds: 1,
          longitudinalDistanceM:
            6
        }
      }).state;

  it("follows the known same target deterministically under the ideal actuator model", () => {
    const acquired =
      acquire();
    const updated =
      resolveFocusTargetObservation({
        state: acquired,
        stateId: "afc-update",
        event: "update",
        observation: {
          kind: "finite-surface",
          targetId: "runner",
          focusAreaId: "tracking-area",
          observedAtSeconds: 2,
          longitudinalDistanceM:
            4
        }
      });

    expect(
      updated.state.focus
    ).toEqual({
      kind: "finite",
      distanceM: 4
    });
    expect(
      updated.focusChanged
    ).toBe(true);
    expect(
      updated.state
        .actuatorModel
    ).toBe(
      "ideal-instantaneous"
    );
  });

  it("holds last focus on target loss and requires explicit reacquisition", () => {
    const acquired =
      acquire();
    const lost =
      resolveFocusTargetObservation({
        state: acquired,
        stateId: "afc-lost",
        event: "update",
        observation: {
          kind: "unavailable",
          targetId: "runner",
          observedAtSeconds: 2,
          reason: "out-of-frame"
        }
      }).state;

    expect(
      lost.acquisitionState
    ).toBe("target-lost");
    expect(lost.focus)
      .toEqual(acquired.focus);

    expect(() =>
      resolveFocusTargetObservation({
        state: lost,
        stateId:
          "afc-silent-reacquire",
        event: "update",
        observation: {
          kind: "finite-surface",
          targetId: "runner",
          observedAtSeconds: 3,
          longitudinalDistanceM:
            3
        }
      })
    ).toThrow(
      "requires an explicit acquire event"
    );

    const reacquired =
      resolveFocusTargetObservation({
        state: lost,
        stateId:
          "afc-reacquired",
        event: "acquire",
        observation: {
          kind: "finite-surface",
          targetId: "runner",
          observedAtSeconds: 3,
          longitudinalDistanceM:
            3
        }
      }).state;

    expect(
      reacquired
        .acquisitionState
    ).toBe("acquired");
    expect(
      reacquired.focus
    ).toEqual({
      kind: "finite",
      distanceM: 3
    });
  });

  it("never silently retargets another subject during an update", () => {
    const acquired =
      acquire();

    expect(() =>
      resolveFocusTargetObservation({
        state: acquired,
        stateId: "afc-retarget",
        event: "update",
        observation: {
          kind: "finite-surface",
          targetId:
            "different-subject",
          observedAtSeconds: 2,
          longitudinalDistanceM:
            4
        }
      })
    ).toThrow(
      "silent retargeting is not permitted"
    );
  });
});

describe("focus lock and release gating", () => {
  const acquiredAfc = ():
    FocusControlState =>
      resolveFocusTargetObservation({
        state:
          state("continuous-af"),
        stateId: "focus-acquired",
        event: "acquire",
        observation: {
          kind: "finite-surface",
          targetId: "bird",
          observedAtSeconds: 1,
          longitudinalDistanceM:
            8
        }
      }).state;

  it("freezes focus independently until unlocked, then resumes the active mode", () => {
    const acquired =
      acquiredAfc();
    const locked =
      setFocusLock({
        state: acquired,
        stateId: "focus-locked",
        locked: true,
        eventTimeSeconds: 1.5
      });

    expect(
      locked.acquisitionState
    ).toBe("locked");

    const whileLocked =
      resolveFocusTargetObservation({
        state: locked,
        stateId: "ignored-update",
        event: "update",
        observation: {
          kind: "finite-surface",
          targetId: "bird",
          observedAtSeconds: 2,
          longitudinalDistanceM:
            4
        }
      });

    expect(
      whileLocked.state
    ).toBe(locked);
    expect(
      whileLocked.state.focus
    ).toEqual({
      kind: "finite",
      distanceM: 8
    });

    const unlocked =
      setFocusLock({
        state: locked,
        stateId: "focus-unlocked",
        locked: false,
        eventTimeSeconds: 2.5
      });

    expect(
      unlocked.acquisitionState
    ).toBe("acquired");

    const resumed =
      resolveFocusTargetObservation({
        state: unlocked,
        stateId: "focus-resumed",
        event: "update",
        observation: {
          kind: "finite-surface",
          targetId: "bird",
          observedAtSeconds: 3,
          longitudinalDistanceM:
            4
        }
      }).state;

    expect(
      resumed.focus
    ).toEqual({
      kind: "finite",
      distanceM: 4
    });
  });

  it("keeps release-priority policy separate from optical focus calculations", () => {
    const idle =
      state("single-af");

    expect(
      assessFocusReleaseGate({
        state: idle,
        profile: profile(),
        priority:
          "focus-priority"
      })
    ).toMatchObject({
      releaseAuthorized: false,
      reason:
        "focus-not-acquired",
      opticalFocusModified:
        false,
      exposureModified: false
    });

    expect(
      assessFocusReleaseGate({
        state: idle,
        profile: profile(),
        priority:
          "release-priority"
      })
    ).toMatchObject({
      releaseAuthorized: true,
      reason:
        "release-priority-bypasses-focus-gate",
      opticalFocusModified:
        false
    });

    expect(
      assessFocusReleaseGate({
        state: idle,
        profile: profile(),
        priority: "balanced"
      })
    ).toMatchObject({
      releaseAuthorized: false,
      requiresProfileSpecificBalancedPolicy:
        true,
      reason:
        "balanced-policy-not-modeled"
    });

    const acquired =
      acquiredAfc();
    expect(
      assessFocusReleaseGate({
        state: acquired,
        profile: profile(),
        priority:
          "focus-priority"
      }).releaseAuthorized
    ).toBe(true);

    const locked =
      setFocusLock({
        state: acquired,
        stateId: "gate-locked",
        locked: true,
        eventTimeSeconds: 2
      });
    expect(
      assessFocusReleaseGate({
        state: locked,
        profile: profile(),
        priority:
          "focus-priority"
      }).reason
    ).toBe("focus-locked");

    expect(
      assessFocusReleaseGate({
        state: state("manual"),
        profile: profile(),
        priority:
          "focus-priority"
      }).reason
    ).toBe(
      "manual-focus-state"
    );
  });
});

describe("focus-control validation boundaries", () => {
  it("rejects backward time, invalid targets, and manual changes while locked", () => {
    const acquired =
      resolveFocusTargetObservation({
        state:
          state("continuous-af"),
        stateId: "time-acquired",
        event: "acquire",
        observation: {
          kind: "finite-surface",
          targetId: "subject",
          observedAtSeconds: 2,
          longitudinalDistanceM:
            5
        }
      }).state;

    expect(() =>
      resolveFocusTargetObservation({
        state: acquired,
        stateId: "backward",
        event: "update",
        observation: {
          kind: "finite-surface",
          targetId: "subject",
          observedAtSeconds: 1,
          longitudinalDistanceM:
            4
        }
      })
    ).toThrow(
      "must not move backward"
    );

    expect(() =>
      resolveFocusTargetObservation({
        state:
          state("single-af"),
        stateId: "bad-distance",
        event: "acquire",
        observation: {
          kind: "finite-surface",
          targetId: "surface",
          observedAtSeconds: 1,
          longitudinalDistanceM:
            0
        }
      })
    ).toThrow(
      "longitudinalDistanceM must be finite and greater than zero"
    );

    const manual =
      state("manual");
    const locked =
      setFocusLock({
        state: manual,
        stateId: "manual-locked",
        locked: true,
        eventTimeSeconds: 1
      });

    expect(() =>
      setManualFocusState({
        state: locked,
        stateId:
          "manual-change-locked",
        focus: {
          kind: "finite",
          distanceM: 2
        },
        eventTimeSeconds: 2
      })
    ).toThrow(
      "cannot change while focus lock is active"
    );
  });

  it("fails closed on an invalid runtime target event discriminator", () => {
    expect(() =>
      resolveFocusTargetObservation({
        state:
          state("continuous-af"),
        stateId:
          "bad-event",
        event:
          "retarget" as "acquire",
        observation: {
          kind: "finite-surface",
          targetId: "subject",
          observedAtSeconds: 1,
          longitudinalDistanceM:
            4
        }
      })
    ).toThrow(
      'must be "acquire" or "update"'
    );
  });

  it("rejects release-gate profile identity drift", () => {
    const different =
      parseFocusControlProfile({
        ...profile(),
        profileId:
          "different-focus-profile"
      });

    expect(() =>
      assessFocusReleaseGate({
        state:
          state("single-af"),
        profile: different,
        priority:
          "focus-priority"
      })
    ).toThrow(
      "state/profile identity does not match"
    );
  });
});
