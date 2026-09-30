// SPDX-License-Identifier: Apache-2.0

import { InvalidConfigurationError } from "../core/configuration-error.js";
import {
  parseEvidenceList,
  type EvidenceProvenance
} from "../core/evidence-provenance.js";
import { InvalidScientificInputError } from "../core/validation.js";
import {
  parseFocusPlane,
  type FocusPlane
} from "../optics/focus-state.js";

type UnknownRecord = Record<string, unknown>;

export const FOCUS_CONTROL_PROFILE_SCHEMA_VERSION =
  "0.1.0" as const;
export const FOCUS_CONTROL_STATE_VERSION =
  "0.1.0" as const;

export type FocusControlMode =
  | "manual"
  | "single-af"
  | "continuous-af";

export type FocusAcquisitionState =
  | "idle"
  | "acquiring"
  | "acquired"
  | "target-lost"
  | "locked";

export type FocusReleasePriority =
  | "focus-priority"
  | "release-priority"
  | "balanced";

export type FocusTargetLossReason =
  | "occluded"
  | "out-of-frame"
  | "identity-lost"
  | "outside-focus-area";

export interface FocusControlProfile {
  schemaVersion:
    typeof FOCUS_CONTROL_PROFILE_SCHEMA_VERSION;
  profileId: string;
  profileVersion: string;
  scientificStatus: "approximation";
  supportedModes:
    readonly FocusControlMode[];
  actuator: {
    kind: "ideal-instantaneous";
    evidence:
      readonly EvidenceProvenance[];
  };
  continuousTargetLossPolicy:
    "hold-last-focus-require-explicit-reacquisition";
  supportedReleasePriorities:
    readonly FocusReleasePriority[];
  evidence:
    readonly EvidenceProvenance[];
  limitations: readonly string[];
}

interface FocusTargetObservationBase {
  targetId: string;
  focusAreaId?: string;
  observedAtSeconds: number;
}

export type FocusTargetObservation =
  | (FocusTargetObservationBase & {
      kind: "finite-surface";
      /**
       * Longitudinal camera-space/conjugate distance from #103, not renderer
       * ray length.
       */
      longitudinalDistanceM: number;
    })
  | (FocusTargetObservationBase & {
      kind:
        "infinity-environment";
    })
  | (FocusTargetObservationBase & {
      kind: "unavailable";
      reason:
        FocusTargetLossReason;
    });

export interface FocusControlState {
  version:
    typeof FOCUS_CONTROL_STATE_VERSION;
  stateId: string;
  sourceProfile: {
    profileId: string;
    profileVersion: string;
  };
  profileLimitations:
    readonly string[];
  mode:
    FocusControlMode;
  acquisitionState:
    FocusAcquisitionState;
  focus:
    FocusPlane;
  activeTargetId?: string;
  activeFocusAreaId?: string;
  lastEventTimeSeconds: number;
  focusResolvedAtSeconds:
    number;
  locked: boolean;
  lock?: {
    lockedAtSeconds: number;
    resumeAcquisitionState:
      Exclude<
        FocusAcquisitionState,
        "locked"
      >;
  };
  actuatorModel:
    "ideal-instantaneous";
  continuousTargetLossPolicy:
    "hold-last-focus-require-explicit-reacquisition";
  exposureModified: false;
  meteringModified: false;
  whiteBalanceModified: false;
  subjectTrackingRecognitionModeled:
    false;
  rendererCoordinatesConsumed:
    false;
  limitations:
    readonly string[];
}

export interface CreateFocusControlStateInput {
  stateId: string;
  profile:
    FocusControlProfile;
  mode:
    FocusControlMode;
  initialFocus:
    FocusPlane;
  initialTimeSeconds?: number;
}

export interface SetManualFocusStateInput {
  state:
    FocusControlState;
  stateId: string;
  focus:
    FocusPlane;
  eventTimeSeconds: number;
  commandId?: string;
}

export type FocusTargetControlEvent =
  | "acquire"
  | "update";

export interface ResolveFocusTargetObservationInput {
  state:
    FocusControlState;
  stateId: string;
  event:
    FocusTargetControlEvent;
  observation:
    FocusTargetObservation;
}

export interface FocusTargetResolution {
  state:
    FocusControlState;
  targetObservationApplied:
    boolean;
  focusChanged: boolean;
  acquisitionEvent:
    FocusTargetControlEvent;
  actuatorModel:
    "ideal-instantaneous";
  silentRetargetingPerformed:
    false;
}

export interface SetFocusLockInput {
  state:
    FocusControlState;
  stateId: string;
  locked: boolean;
  eventTimeSeconds: number;
}

export interface AssessFocusReleaseGateInput {
  state:
    FocusControlState;
  profile:
    FocusControlProfile;
  priority:
    FocusReleasePriority;
}

export interface FocusReleaseGateAssessment {
  priority:
    FocusReleasePriority;
  releaseAuthorized: boolean;
  reason:
    | "manual-focus-state"
    | "focus-acquired"
    | "focus-locked"
    | "release-priority-bypasses-focus-gate"
    | "focus-not-acquired"
    | "balanced-policy-not-modeled";
  requiresProfileSpecificBalancedPolicy:
    boolean;
  opticalFocusModified: false;
  exposureModified: false;
}

const FOCUS_MODES =
  new Set<FocusControlMode>([
    "manual",
    "single-af",
    "continuous-af"
  ]);

const RELEASE_PRIORITIES =
  new Set<FocusReleasePriority>([
    "focus-priority",
    "release-priority",
    "balanced"
  ]);

const TARGET_LOSS_REASONS =
  new Set<FocusTargetLossReason>([
    "occluded",
    "out-of-frame",
    "identity-lost",
    "outside-focus-area"
  ]);

function requireRecord(
  value: unknown,
  path: string
): UnknownRecord {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new InvalidConfigurationError(
      path + " must be an object."
    );
  }
  return value as UnknownRecord;
}

function requireNonEmptyString(
  value: unknown,
  path: string
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new InvalidConfigurationError(
      path +
        " must be a non-empty string."
    );
  }
  return value.trim();
}

function requireScientificNonEmptyString(
  value: string,
  path: string
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new InvalidScientificInputError(
      path +
        " must be a non-empty string."
    );
  }
  return value.trim();
}

function requireScientificNonNegativeFinite(
  value: number,
  path: string
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new InvalidScientificInputError(
      path +
        " must be finite and greater than or equal to zero."
    );
  }
  return value;
}

function requireScientificPositiveFinite(
  value: number,
  path: string
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new InvalidScientificInputError(
      path +
        " must be finite and greater than zero."
    );
  }
  return value;
}

function parseLimitations(
  value: unknown,
  path: string
): readonly string[] {
  if (!Array.isArray(value)) {
    throw new InvalidConfigurationError(
      path + " must be an array."
    );
  }
  const parsed =
    value.map((entry, index) =>
      requireNonEmptyString(
        entry,
        path +
          "[" +
          index +
          "]"
      )
    );
  if (
    new Set(parsed).size !==
    parsed.length
  ) {
    throw new InvalidConfigurationError(
      path +
        " must not contain duplicates."
    );
  }
  return parsed;
}

function parseUniqueEnumList<T extends string>(
  value: unknown,
  path: string,
  allowed: ReadonlySet<T>
): readonly T[] {
  if (
    !Array.isArray(value) ||
    value.length === 0
  ) {
    throw new InvalidConfigurationError(
      path +
        " must be a non-empty array."
    );
  }
  const parsed =
    value.map((entry, index) => {
      if (
        typeof entry !==
          "string" ||
        !allowed.has(entry as T)
      ) {
        throw new InvalidConfigurationError(
          path +
            "[" +
            index +
            "] is invalid."
        );
      }
      return entry as T;
    });
  if (
    new Set(parsed).size !==
    parsed.length
  ) {
    throw new InvalidConfigurationError(
      path +
        " must not contain duplicates."
    );
  }
  return parsed;
}

export function parseFocusControlProfile(
  value: unknown
): FocusControlProfile {
  const record =
    requireRecord(
      value,
      "focusControlProfile"
    );

  if (
    record.schemaVersion !==
    FOCUS_CONTROL_PROFILE_SCHEMA_VERSION
  ) {
    throw new InvalidConfigurationError(
      'focusControlProfile.schemaVersion must be "' +
        FOCUS_CONTROL_PROFILE_SCHEMA_VERSION +
        '".'
    );
  }
  if (
    record.scientificStatus !==
    "approximation"
  ) {
    throw new InvalidConfigurationError(
      'focusControlProfile.scientificStatus must be "approximation".'
    );
  }

  const actuator =
    requireRecord(
      record.actuator,
      "focusControlProfile.actuator"
    );
  if (
    actuator.kind !==
    "ideal-instantaneous"
  ) {
    throw new InvalidConfigurationError(
      'focusControlProfile.actuator.kind must be "ideal-instantaneous" in schema 0.1.0.'
    );
  }
  if (
    record
      .continuousTargetLossPolicy !==
    "hold-last-focus-require-explicit-reacquisition"
  ) {
    throw new InvalidConfigurationError(
      'focusControlProfile.continuousTargetLossPolicy must be "hold-last-focus-require-explicit-reacquisition".'
    );
  }

  return {
    schemaVersion:
      FOCUS_CONTROL_PROFILE_SCHEMA_VERSION,
    profileId:
      requireNonEmptyString(
        record.profileId,
        "focusControlProfile.profileId"
      ),
    profileVersion:
      requireNonEmptyString(
        record.profileVersion,
        "focusControlProfile.profileVersion"
      ),
    scientificStatus:
      "approximation",
    supportedModes:
      parseUniqueEnumList(
        record.supportedModes,
        "focusControlProfile.supportedModes",
        FOCUS_MODES
      ),
    actuator: {
      kind:
        "ideal-instantaneous",
      evidence:
        parseEvidenceList(
          actuator.evidence,
          "focusControlProfile.actuator.evidence"
        )
    },
    continuousTargetLossPolicy:
      "hold-last-focus-require-explicit-reacquisition",
    supportedReleasePriorities:
      parseUniqueEnumList(
        record
          .supportedReleasePriorities,
        "focusControlProfile.supportedReleasePriorities",
        RELEASE_PRIORITIES
      ),
    evidence:
      parseEvidenceList(
        record.evidence,
        "focusControlProfile.evidence"
      ),
    limitations:
      parseLimitations(
        record.limitations,
        "focusControlProfile.limitations"
      )
  };
}

function cloneJson<T>(
  value: T
): T {
  return JSON.parse(
    JSON.stringify(value)
  ) as T;
}

function deepFreeze<T>(
  value: T
): T {
  if (
    typeof value !== "object" ||
    value === null ||
    Object.isFrozen(value)
  ) {
    return value;
  }

  Object.freeze(value);
  for (
    const child of
    Object.values(
      value as UnknownRecord
    )
  ) {
    deepFreeze(child);
  }
  return value;
}

function immutableState(
  state:
    FocusControlState
): FocusControlState {
  return deepFreeze(
    cloneJson(state)
  );
}

function stateBase(
  stateId: string,
  profile:
    FocusControlProfile,
  mode:
    FocusControlMode,
  focus:
    FocusPlane,
  acquisitionState:
    FocusAcquisitionState,
  eventTimeSeconds: number,
  focusResolvedAtSeconds:
    number,
  activeTargetId?:
    string,
  activeFocusAreaId?:
    string,
  lock?:
    FocusControlState["lock"]
): FocusControlState {
  return immutableState({
    version:
      FOCUS_CONTROL_STATE_VERSION,
    stateId:
      requireScientificNonEmptyString(
        stateId,
        "stateId"
      ),
    sourceProfile: {
      profileId:
        profile.profileId,
      profileVersion:
        profile.profileVersion
    },
    profileLimitations: [
      ...profile.limitations
    ],
    mode,
    acquisitionState,
    focus:
      parseFocusPlane(focus),
    ...(activeTargetId ===
    undefined
      ? {}
      : {
          activeTargetId
        }),
    ...(activeFocusAreaId ===
    undefined
      ? {}
      : {
          activeFocusAreaId
        }),
    lastEventTimeSeconds:
      eventTimeSeconds,
    focusResolvedAtSeconds,
    locked:
      acquisitionState ===
      "locked",
    ...(lock === undefined
      ? {}
      : {
          lock
        }),
    actuatorModel:
      "ideal-instantaneous",
    continuousTargetLossPolicy:
      profile
        .continuousTargetLossPolicy,
    exposureModified: false,
    meteringModified: false,
    whiteBalanceModified:
      false,
    subjectTrackingRecognitionModeled:
      false,
    rendererCoordinatesConsumed:
      false,
    limitations: [
      ...profile.limitations,
      "Focus target observations use longitudinal camera-space/conjugate distance, not renderer ray length.",
      "Ideal instantaneous focus actuation is an approximation and does not represent commercial AF speed, error, hunting, recognition, or low-light behavior.",
      "Focus control does not modify exposure, metering, white balance, or scene illumination."
    ]
  });
}

function requireSupportedMode(
  profile:
    FocusControlProfile,
  mode:
    FocusControlMode
): void {
  if (
    !profile.supportedModes
      .includes(mode)
  ) {
    throw new InvalidScientificInputError(
      "Selected focus-control mode is not supported by the profile."
    );
  }
}

function requireMonotonicEventTime(
  current:
    FocusControlState,
  eventTimeSeconds: number
): number {
  const parsed =
    requireScientificNonNegativeFinite(
      eventTimeSeconds,
      "eventTimeSeconds"
    );
  if (
    parsed <
    current.lastEventTimeSeconds
  ) {
    throw new InvalidScientificInputError(
      "Focus-control event time must not move backward."
    );
  }
  return parsed;
}

function verifyStateProfile(
  state:
    FocusControlState,
  profile:
    FocusControlProfile
): void {
  if (
    state.sourceProfile
      .profileId !==
      profile.profileId ||
    state.sourceProfile
      .profileVersion !==
      profile.profileVersion
  ) {
    throw new InvalidScientificInputError(
      "Focus-control state/profile identity does not match."
    );
  }
}

export function createFocusControlState(
  input:
    CreateFocusControlStateInput
): FocusControlState {
  const profile =
    parseFocusControlProfile(
      input.profile
    );
  requireSupportedMode(
    profile,
    input.mode
  );
  const time =
    input.initialTimeSeconds ===
    undefined
      ? 0
      : requireScientificNonNegativeFinite(
          input.initialTimeSeconds,
          "initialTimeSeconds"
        );

  return stateBase(
    input.stateId,
    profile,
    input.mode,
    input.initialFocus,
    "idle",
    time,
    time
  );
}

function stateProfileView(
  state:
    FocusControlState
): FocusControlProfile {
  return {
    schemaVersion:
      FOCUS_CONTROL_PROFILE_SCHEMA_VERSION,
    profileId:
      state.sourceProfile
        .profileId,
    profileVersion:
      state.sourceProfile
        .profileVersion,
    scientificStatus:
      "approximation",
    supportedModes: [
      state.mode
    ],
    actuator: {
      kind:
        "ideal-instantaneous",
      evidence: []
    },
    continuousTargetLossPolicy:
      state
        .continuousTargetLossPolicy,
    supportedReleasePriorities: [
      "focus-priority",
      "release-priority",
      "balanced"
    ],
    evidence: [],
    limitations:
      state.profileLimitations
  };
}

export function setManualFocusState(
  input:
    SetManualFocusStateInput
): FocusControlState {
  if (
    input.state.mode !==
    "manual"
  ) {
    throw new InvalidScientificInputError(
      "setManualFocusState requires manual focus mode."
    );
  }
  if (input.state.locked) {
    throw new InvalidScientificInputError(
      "Manual focus cannot change while focus lock is active."
    );
  }
  if (
    input.commandId !==
    undefined
  ) {
    requireScientificNonEmptyString(
      input.commandId,
      "commandId"
    );
  }
  const time =
    requireMonotonicEventTime(
      input.state,
      input.eventTimeSeconds
    );

  return stateBase(
    input.stateId,
    stateProfileView(
      input.state
    ),
    "manual",
    input.focus,
    "idle",
    time,
    time
  );
}

function parseObservation(
  observation:
    FocusTargetObservation
): FocusTargetObservation {
  const targetId =
    requireScientificNonEmptyString(
      observation.targetId,
      "observation.targetId"
    );
  const observedAtSeconds =
    requireScientificNonNegativeFinite(
      observation
        .observedAtSeconds,
      "observation.observedAtSeconds"
    );
  const focusAreaId =
    observation.focusAreaId ===
    undefined
      ? undefined
      : requireScientificNonEmptyString(
          observation.focusAreaId,
          "observation.focusAreaId"
        );

  if (
    observation.kind ===
    "finite-surface"
  ) {
    return {
      kind: "finite-surface",
      targetId,
      ...(focusAreaId ===
      undefined
        ? {}
        : {
            focusAreaId
          }),
      observedAtSeconds,
      longitudinalDistanceM:
        requireScientificPositiveFinite(
          observation
            .longitudinalDistanceM,
          "observation.longitudinalDistanceM"
        )
    };
  }

  if (
    observation.kind ===
    "infinity-environment"
  ) {
    return {
      kind:
        "infinity-environment",
      targetId,
      ...(focusAreaId ===
      undefined
        ? {}
        : {
            focusAreaId
          }),
      observedAtSeconds
    };
  }

  if (
    observation.kind ===
      "unavailable" &&
    TARGET_LOSS_REASONS.has(
      observation.reason
    )
  ) {
    return {
      kind: "unavailable",
      targetId,
      ...(focusAreaId ===
      undefined
        ? {}
        : {
            focusAreaId
          }),
      observedAtSeconds,
      reason:
        observation.reason
    };
  }

  throw new InvalidScientificInputError(
    "observation.kind/reason is invalid."
  );
}

function focusFromObservation(
  observation:
    Exclude<
      FocusTargetObservation,
      {
        kind: "unavailable";
      }
    >
): FocusPlane {
  if (
    observation.kind ===
    "infinity-environment"
  ) {
    return {
      kind: "infinity"
    };
  }
  return {
    kind: "finite",
    distanceM:
      observation
        .longitudinalDistanceM
  };
}

function focusEquals(
  a: FocusPlane,
  b: FocusPlane
): boolean {
  if (
    a.kind !== b.kind
  ) {
    return false;
  }
  if (
    a.kind === "infinity" ||
    b.kind === "infinity"
  ) {
    return true;
  }
  return (
    a.distanceM ===
    b.distanceM
  );
}

function stateFromResolvedTarget(
  input:
    ResolveFocusTargetObservationInput,
  observation:
    Exclude<
      FocusTargetObservation,
      {
        kind: "unavailable";
      }
    >
): FocusTargetResolution {
  const focus =
    focusFromObservation(
      observation
    );
  const state =
    stateBase(
      input.stateId,
      stateProfileView(
        input.state
      ),
      input.state.mode,
      focus,
      "acquired",
      observation
        .observedAtSeconds,
      observation
        .observedAtSeconds,
      observation.targetId,
      observation.focusAreaId
    );
  return {
    state,
    targetObservationApplied:
      true,
    focusChanged:
      !focusEquals(
        input.state.focus,
        focus
      ),
    acquisitionEvent:
      input.event,
    actuatorModel:
      "ideal-instantaneous",
    silentRetargetingPerformed:
      false
  };
}

function unchangedResolution(
  input:
    ResolveFocusTargetObservationInput
): FocusTargetResolution {
  return {
    state: input.state,
    targetObservationApplied:
      false,
    focusChanged: false,
    acquisitionEvent:
      input.event,
    actuatorModel:
      "ideal-instantaneous",
    silentRetargetingPerformed:
      false
  };
}

export function resolveFocusTargetObservation(
  input:
    ResolveFocusTargetObservationInput
): FocusTargetResolution {
  if (
    input.event !== "acquire" &&
    input.event !== "update"
  ) {
    throw new InvalidScientificInputError(
      'Focus target event must be "acquire" or "update".'
    );
  }
  if (
    input.state.mode ===
    "manual"
  ) {
    throw new InvalidScientificInputError(
      "Manual focus does not automatically consume autofocus target observations."
    );
  }

  const observation =
    parseObservation(
      input.observation
    );
  requireMonotonicEventTime(
    input.state,
    observation
      .observedAtSeconds
  );

  if (input.state.locked) {
    return unchangedResolution(
      input
    );
  }

  if (
    input.state.mode ===
    "single-af"
  ) {
    if (
      input.event ===
        "update" &&
      input.state
        .acquisitionState ===
        "acquired"
    ) {
      return unchangedResolution(
        input
      );
    }
    if (
      input.event !==
      "acquire"
    ) {
      throw new InvalidScientificInputError(
        "Single AF requires an explicit acquire event before target updates."
      );
    }
    if (
      observation.kind ===
      "unavailable"
    ) {
      const state =
        stateBase(
          input.stateId,
          stateProfileView(
            input.state
          ),
          "single-af",
          input.state.focus,
          "target-lost",
          observation
            .observedAtSeconds,
          input.state
            .focusResolvedAtSeconds,
          observation.targetId,
          observation.focusAreaId
        );
      return {
        state,
        targetObservationApplied:
          true,
        focusChanged: false,
        acquisitionEvent:
          input.event,
        actuatorModel:
          "ideal-instantaneous",
        silentRetargetingPerformed:
          false
      };
    }
    return stateFromResolvedTarget(
      input,
      observation
    );
  }

  if (
    input.event ===
    "update"
  ) {
    if (
      input.state
        .activeTargetId ===
      undefined
    ) {
      throw new InvalidScientificInputError(
        "Continuous AF requires an explicit acquire event before updates."
      );
    }
    if (
      observation.targetId !==
      input.state
        .activeTargetId
    ) {
      throw new InvalidScientificInputError(
        "Continuous AF update targetId must match the active target; silent retargeting is not permitted."
      );
    }
    if (
      input.state
        .acquisitionState ===
      "target-lost"
    ) {
      throw new InvalidScientificInputError(
        "Continuous AF target loss requires an explicit acquire event before reacquisition."
      );
    }
  }

  if (
    observation.kind ===
    "unavailable"
  ) {
    const state =
      stateBase(
        input.stateId,
        stateProfileView(
          input.state
        ),
        "continuous-af",
        input.state.focus,
        "target-lost",
        observation
          .observedAtSeconds,
        input.state
          .focusResolvedAtSeconds,
        observation.targetId,
        observation.focusAreaId
      );
    return {
      state,
      targetObservationApplied:
        true,
      focusChanged: false,
      acquisitionEvent:
        input.event,
      actuatorModel:
        "ideal-instantaneous",
      silentRetargetingPerformed:
        false
    };
  }

  return stateFromResolvedTarget(
    input,
    observation
  );
}

export function setFocusLock(
  input:
    SetFocusLockInput
): FocusControlState {
  const time =
    requireMonotonicEventTime(
      input.state,
      input.eventTimeSeconds
    );

  if (input.locked) {
    if (input.state.locked) {
      return input.state;
    }
    return stateBase(
      input.stateId,
      stateProfileView(
        input.state
      ),
      input.state.mode,
      input.state.focus,
      "locked",
      time,
      input.state
        .focusResolvedAtSeconds,
      input.state
        .activeTargetId,
      input.state
        .activeFocusAreaId,
      {
        lockedAtSeconds:
          time,
        resumeAcquisitionState:
          input.state
            .acquisitionState as Exclude<
              FocusAcquisitionState,
              "locked"
            >
      }
    );
  }

  if (!input.state.locked) {
    return input.state;
  }
  const resume =
    input.state.lock
      ?.resumeAcquisitionState;
  if (resume === undefined) {
    throw new InvalidScientificInputError(
      "Locked focus state is missing its resume acquisition state."
    );
  }

  return stateBase(
    input.stateId,
    stateProfileView(
      input.state
    ),
    input.state.mode,
    input.state.focus,
    resume,
    time,
    input.state
      .focusResolvedAtSeconds,
    input.state
      .activeTargetId,
    input.state
      .activeFocusAreaId
  );
}

export function assessFocusReleaseGate(
  input:
    AssessFocusReleaseGateInput
): FocusReleaseGateAssessment {
  const profile =
    parseFocusControlProfile(
      input.profile
    );
  verifyStateProfile(
    input.state,
    profile
  );

  if (
    !profile
      .supportedReleasePriorities
      .includes(
        input.priority
      )
  ) {
    throw new InvalidScientificInputError(
      "Selected focus/release priority is not supported by the profile."
    );
  }

  if (
    input.priority ===
    "release-priority"
  ) {
    return {
      priority:
        input.priority,
      releaseAuthorized: true,
      reason:
        "release-priority-bypasses-focus-gate",
      requiresProfileSpecificBalancedPolicy:
        false,
      opticalFocusModified:
        false,
      exposureModified:
        false
    };
  }

  if (
    input.priority ===
    "balanced"
  ) {
    return {
      priority:
        input.priority,
      releaseAuthorized:
        false,
      reason:
        "balanced-policy-not-modeled",
      requiresProfileSpecificBalancedPolicy:
        true,
      opticalFocusModified:
        false,
      exposureModified:
        false
    };
  }

  if (
    input.state.mode ===
    "manual"
  ) {
    return {
      priority:
        input.priority,
      releaseAuthorized: true,
      reason:
        "manual-focus-state",
      requiresProfileSpecificBalancedPolicy:
        false,
      opticalFocusModified:
        false,
      exposureModified:
        false
    };
  }

  if (
    input.state
      .acquisitionState ===
    "locked"
  ) {
    return {
      priority:
        input.priority,
      releaseAuthorized: true,
      reason:
        "focus-locked",
      requiresProfileSpecificBalancedPolicy:
        false,
      opticalFocusModified:
        false,
      exposureModified:
        false
    };
  }

  if (
    input.state
      .acquisitionState ===
    "acquired"
  ) {
    return {
      priority:
        input.priority,
      releaseAuthorized: true,
      reason:
        "focus-acquired",
      requiresProfileSpecificBalancedPolicy:
        false,
      opticalFocusModified:
        false,
      exposureModified:
        false
    };
  }

  return {
    priority:
      input.priority,
    releaseAuthorized: false,
    reason:
      "focus-not-acquired",
    requiresProfileSpecificBalancedPolicy:
      false,
    opticalFocusModified:
      false,
    exposureModified:
      false
  };
}
