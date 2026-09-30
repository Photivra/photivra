// SPDX-License-Identifier: Apache-2.0

import {
  parseEvidenceList,
  type EvidenceProvenance
} from "../core/evidence-provenance.js";
import { InvalidScientificInputError } from "../core/validation.js";
import type {
  CalculateCaptureExposureWindowsInput
} from "../sensor/exposure-window.js";

export const EXPOSURE_DURATION_CONTROL_VERSION =
  "0.1.0" as const;

export type ExposureDurationControl =
  | {
      kind: "fixed-duration";
      durationSeconds: number;
    }
  | {
      kind: "bulb";
      timeReference:
        "control-monotonic-seconds";
      pressSeconds: number;
      releaseSeconds?: number;
    }
  | {
      kind: "time";
      timeReference:
        "control-monotonic-seconds";
      startSeconds: number;
      stopSeconds?: number;
    };

interface ExposureDurationControlResolutionBase {
  version:
    typeof EXPOSURE_DURATION_CONTROL_VERSION;
  controlKind:
    ExposureDurationControl["kind"];
  shutterMechanismInferred: false;
  exposureBoundaryTopologyInferred:
    false;
  tripodSupportInferred: false;
  stabilizationStateInferred: false;
  longExposureNoiseReductionInferred:
    false;
  sensorTemperatureBehaviorInferred:
    false;
}

export type ExposureDurationControlResolution =
  | (ExposureDurationControlResolutionBase & {
      status: "resolved";
      durationSeconds: number;
      physicalExposureIntegrationAuthorized:
        true;
    })
  | (ExposureDurationControlResolutionBase & {
      status: "active";
      durationSeconds: null;
      physicalExposureIntegrationAuthorized:
        false;
      waitingFor:
        | "bulb-release"
        | "time-stop";
    });

export interface BindResolvedExposureDurationToCaptureExposureInput {
  resolution:
    Extract<
      ExposureDurationControlResolution,
      { status: "resolved" }
    >;
  durationEvidence:
    readonly EvidenceProvenance[];
  exposureWindowInput:
    Omit<
      CalculateCaptureExposureWindowsInput,
      "nominalExposureDurationSeconds"
    >;
}

function requireFiniteSeconds(
  value: unknown,
  path: string
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    throw new InvalidScientificInputError(
      path + " must be finite."
    );
  }
  return value;
}

function requirePositiveSeconds(
  value: unknown,
  path: string
): number {
  const parsed =
    requireFiniteSeconds(
      value,
      path
    );
  if (parsed <= 0) {
    throw new InvalidScientificInputError(
      path +
        " must be greater than zero."
    );
  }
  return parsed;
}

function resolved(
  kind: ExposureDurationControl["kind"],
  durationSeconds: number
): Extract<
  ExposureDurationControlResolution,
  { status: "resolved" }
> {
  return {
    version:
      EXPOSURE_DURATION_CONTROL_VERSION,
    controlKind: kind,
    status: "resolved",
    durationSeconds,
    physicalExposureIntegrationAuthorized:
      true,
    shutterMechanismInferred: false,
    exposureBoundaryTopologyInferred:
      false,
    tripodSupportInferred: false,
    stabilizationStateInferred: false,
    longExposureNoiseReductionInferred:
      false,
    sensorTemperatureBehaviorInferred:
      false
  };
}

function active(
  kind: "bulb" | "time"
): Extract<
  ExposureDurationControlResolution,
  { status: "active" }
> {
  return {
    version:
      EXPOSURE_DURATION_CONTROL_VERSION,
    controlKind: kind,
    status: "active",
    durationSeconds: null,
    physicalExposureIntegrationAuthorized:
      false,
    waitingFor:
      kind === "bulb"
        ? "bulb-release"
        : "time-stop",
    shutterMechanismInferred: false,
    exposureBoundaryTopologyInferred:
      false,
    tripodSupportInferred: false,
    stabilizationStateInferred: false,
    longExposureNoiseReductionInferred:
      false,
    sensorTemperatureBehaviorInferred:
      false
  };
}

/**
 * Resolves shutter-duration control semantics to a concrete positive elapsed
 * duration before physical exposure integration.
 *
 * Bulb and Time are control behaviors only. Neither implies a shutter
 * mechanism, exposure-boundary topology, tripod, stabilization state, long
 * exposure NR, or temperature model.
 */
export function resolveExposureDurationControl(
  control: ExposureDurationControl
): ExposureDurationControlResolution {
  if (
    typeof control !== "object" ||
    control === null
  ) {
    throw new InvalidScientificInputError(
      "control must be an object."
    );
  }

  if (
    control.kind ===
    "fixed-duration"
  ) {
    return resolved(
      "fixed-duration",
      requirePositiveSeconds(
        control.durationSeconds,
        "control.durationSeconds"
      )
    );
  }

  if (
    control.kind === "bulb"
  ) {
    if (
      control.timeReference !==
      "control-monotonic-seconds"
    ) {
      throw new InvalidScientificInputError(
        'Bulb control timeReference must be "control-monotonic-seconds".'
      );
    }
    const start =
      requireFiniteSeconds(
        control.pressSeconds,
        "control.pressSeconds"
      );
    if (
      control.releaseSeconds ===
      undefined
    ) {
      return active("bulb");
    }
    const stop =
      requireFiniteSeconds(
        control.releaseSeconds,
        "control.releaseSeconds"
      );
    const duration = stop - start;
    if (duration <= 0) {
      throw new InvalidScientificInputError(
        "Bulb releaseSeconds must be greater than pressSeconds."
      );
    }
    return resolved(
      "bulb",
      duration
    );
  }

  if (
    control.kind === "time"
  ) {
    if (
      control.timeReference !==
      "control-monotonic-seconds"
    ) {
      throw new InvalidScientificInputError(
        'Time control timeReference must be "control-monotonic-seconds".'
      );
    }
    const start =
      requireFiniteSeconds(
        control.startSeconds,
        "control.startSeconds"
      );
    if (
      control.stopSeconds ===
      undefined
    ) {
      return active("time");
    }
    const stop =
      requireFiniteSeconds(
        control.stopSeconds,
        "control.stopSeconds"
      );
    const duration = stop - start;
    if (duration <= 0) {
      throw new InvalidScientificInputError(
        "Time stopSeconds must be greater than startSeconds."
      );
    }
    return resolved(
      "time",
      duration
    );
  }

  throw new InvalidScientificInputError(
    "control.kind is invalid."
  );
}

/**
 * Binds a resolved duration into the authoritative #12 exposure-window input.
 *
 * The existing shutter mechanism/opening/closing schedules remain untouched.
 * Only the seconds-valued nominal duration is supplied here.
 */
export function bindResolvedExposureDurationToCaptureExposureInput(
  input:
    BindResolvedExposureDurationToCaptureExposureInput
): CalculateCaptureExposureWindowsInput {
  const resolution =
    input.resolution;

  if (
    resolution.version !==
      EXPOSURE_DURATION_CONTROL_VERSION ||
    resolution.status !==
      "resolved" ||
    resolution
      .physicalExposureIntegrationAuthorized !==
      true
  ) {
    throw new InvalidScientificInputError(
      "resolution must be a resolved exposure-duration control result authorized for physical integration."
    );
  }

  const durationSeconds =
    requirePositiveSeconds(
      resolution.durationSeconds,
      "resolution.durationSeconds"
    );

  if (
    resolution.shutterMechanismInferred !==
      false ||
    resolution
      .exposureBoundaryTopologyInferred !==
      false ||
    resolution.tripodSupportInferred !==
      false ||
    resolution
      .stabilizationStateInferred !==
      false ||
    resolution
      .longExposureNoiseReductionInferred !==
      false ||
    resolution
      .sensorTemperatureBehaviorInferred !==
      false
  ) {
    throw new InvalidScientificInputError(
      "Resolved exposure duration must not carry inferred downstream camera/long-exposure state."
    );
  }

  return {
    ...input.exposureWindowInput,
    nominalExposureDurationSeconds: {
      value: durationSeconds,
      unit: "s",
      evidence: parseEvidenceList(
        input.durationEvidence,
        "durationEvidence"
      )
    }
  };
}
