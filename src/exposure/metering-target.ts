// SPDX-License-Identifier: Apache-2.0

/**
 * Module boundary and integration notes.
 * Freezes one metering result into the stable relative exposure target consumed by downstream
 * camera-control policy. The target copies the meter snapshot by value. Future scene/light changes do
 * not mutate this object, which is the engine seam needed for AE-lock behavior.
 * Sets an absolute exposure-compensation value on a frozen meter target. Compensation is always
 * re-derived from the uncompensated base target, so repeated UI updates cannot accidentally accumulate
 * floating-point/control drift. Positive compensation requests more exposure.
 * @see docs/USAGE.md for equations, coordinate/unit conventions, blockers and support limits.
 */

import { InvalidScientificInputError } from "../core/validation.js";
import type {
  ExposureMeteringResult
} from "./metering.js";
import type {
  SceneRadianceTemporalExposureMeteringResult
} from "./metering-temporal.js";

export const EXPOSURE_METER_TARGET_SCHEMA_VERSION =
  "0.1.0" as const;

export type ExposureMeterTargetSourceResult =
  | ExposureMeteringResult
  | SceneRadianceTemporalExposureMeteringResult;

export type ExposureMeterTargetSourceKind =
  | "spatial-metering-result"
  | "temporal-metering-result";

export interface ExposureMeterSnapshotIdentity {
  sourceKind:
    ExposureMeterTargetSourceKind;
  measurementId: string;
  sceneStateId: string;
  meteringProfileId: string;
}

interface ExposureMeterTargetBase {
  schemaVersion:
    typeof EXPOSURE_METER_TARGET_SCHEMA_VERSION;
  targetId: string;
  sourceMeterSnapshot:
    ExposureMeterSnapshotIdentity;
  scientificStatus: "approximation";
  inputDomain:
    "relative-pre-exposure-linear-signal";
  baseTargetRelativeSignal: number;
  meteredRelativeSignal: number;
  exposureCompensationStops: number;
  exposureCompensationApplied: boolean;
  meterMeasurementMutated: false;
  sourceMeterSnapshotPreserved: true;
  resultReusableForAeLock: true;
  automaticExposureResolved: false;
  intendedConsumer:
    "exposure-mode-resolver";
}

export type ExposureMeterTarget =
  | (ExposureMeterTargetBase & {
      status: "resolved";
      baseRequiredExposureScaleToTarget:
        number;
      baseExposureOffsetStopsToTarget:
        number;
      requiredExposureScaleToTarget:
        number;
      exposureOffsetStopsToTarget:
        number;
    })
  | (ExposureMeterTargetBase & {
      status: "no-signal";
      baseRequiredExposureScaleResolved:
        false;
      baseExposureOffsetStopsResolved:
        false;
      requiredExposureScaleResolved:
        false;
      exposureOffsetStopsResolved:
        false;
    });

export interface CreateExposureMeterTargetInput {
  targetId: string;
  meterResult:
    ExposureMeterTargetSourceResult;
}

export interface SetExposureCompensationOnMeterTargetInput {
  targetId: string;
  baseTarget: ExposureMeterTarget;
  exposureCompensationStops: number;
}

function requireNonEmptyString(
  value: unknown,
  path: string
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new InvalidScientificInputError(
      path + " must be a non-empty string."
    );
  }
  return value.trim();
}

function requireFinite(
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

function requirePositiveFinite(
  value: unknown,
  path: string
): number {
  const parsed = requireFinite(
    value,
    path
  );
  if (parsed <= 0) {
    throw new InvalidScientificInputError(
      path + " must be greater than zero."
    );
  }
  return parsed;
}

function requireNonNegativeFinite(
  value: unknown,
  path: string
): number {
  const parsed = requireFinite(
    value,
    path
  );
  if (parsed < 0) {
    throw new InvalidScientificInputError(
      path +
        " must be greater than or equal to zero."
    );
  }
  return parsed;
}

function meterSnapshotIdentity(
  result:
    ExposureMeterTargetSourceResult
): ExposureMeterSnapshotIdentity {
  const hasSpatialId =
    "measurementId" in result;
  const hasTemporalId =
    "temporalMeasurementId" in
    result;

  if (
    hasSpatialId === hasTemporalId
  ) {
    throw new InvalidScientificInputError(
      "meterResult must identify exactly one spatial or temporal metering result."
    );
  }

  return {
    sourceKind: hasSpatialId
      ? "spatial-metering-result"
      : "temporal-metering-result",
    measurementId:
      requireNonEmptyString(
        hasSpatialId
          ? result.measurementId
          : result
              .temporalMeasurementId,
        hasSpatialId
          ? "meterResult.measurementId"
          : "meterResult.temporalMeasurementId"
      ),
    sceneStateId:
      requireNonEmptyString(
        result.sceneStateId,
        "meterResult.sceneStateId"
      ),
    meteringProfileId:
      requireNonEmptyString(
        result.profileId,
        "meterResult.profileId"
      )
  };
}

function validateCommonMeterResult(
  result:
    ExposureMeterTargetSourceResult
): void {
  if (
    result.scientificStatus !==
    "approximation"
  ) {
    throw new InvalidScientificInputError(
      'meterResult.scientificStatus must be "approximation" for schema 0.1.0.'
    );
  }
  if (
    result.inputDomain !==
    "relative-pre-exposure-linear-signal"
  ) {
    throw new InvalidScientificInputError(
      'meterResult.inputDomain must be "relative-pre-exposure-linear-signal".'
    );
  }
  if (
    result.exposureCompensationApplied !==
    false
  ) {
    throw new InvalidScientificInputError(
      "meterResult must be the uncompensated base metering result."
    );
  }
  if (
    result.automaticExposureResolved !==
    false
  ) {
    throw new InvalidScientificInputError(
      "meterResult must precede automatic exposure resolution."
    );
  }
  if (
    result.resultReusableForAeLock !==
    true
  ) {
    throw new InvalidScientificInputError(
      "meterResult must preserve reusable meter-result identity."
    );
  }

  requirePositiveFinite(
    result.targetRelativeSignal,
    "meterResult.targetRelativeSignal"
  );
  requireNonNegativeFinite(
    result.meteredRelativeSignal,
    "meterResult.meteredRelativeSignal"
  );
}

function createBaseTargetFields(
  targetId: string,
  meterResult:
    ExposureMeterTargetSourceResult
): ExposureMeterTargetBase {
  validateCommonMeterResult(
    meterResult
  );

  return {
    schemaVersion:
      EXPOSURE_METER_TARGET_SCHEMA_VERSION,
    targetId:
      requireNonEmptyString(
        targetId,
        "targetId"
      ),
    sourceMeterSnapshot:
      meterSnapshotIdentity(
        meterResult
      ),
    scientificStatus: "approximation",
    inputDomain:
      "relative-pre-exposure-linear-signal",
    baseTargetRelativeSignal:
      meterResult.targetRelativeSignal,
    meteredRelativeSignal:
      meterResult.meteredRelativeSignal,
    exposureCompensationStops: 0,
    exposureCompensationApplied:
      false,
    meterMeasurementMutated: false,
    sourceMeterSnapshotPreserved:
      true,
    resultReusableForAeLock: true,
    automaticExposureResolved: false,
    intendedConsumer:
      "exposure-mode-resolver"
  };
}

/**
 * Freezes one metering result into the stable relative exposure target
 * consumed by downstream camera-control policy.
 *
 * The target copies the meter snapshot by value. Future scene/light changes do
 * not mutate this object, which is the engine seam needed for AE-lock behavior.
 */
export function createExposureMeterTargetFromMeteringResult(
  input:
    CreateExposureMeterTargetInput
): ExposureMeterTarget {
  const base =
    createBaseTargetFields(
      input.targetId,
      input.meterResult
    );

  if (
    input.meterResult.status ===
    "no-signal"
  ) {
    if (
      input.meterResult
        .meteredRelativeSignal !== 0
    ) {
      throw new InvalidScientificInputError(
        "A no-signal meter result must have meteredRelativeSignal equal to zero."
      );
    }
    return {
      ...base,
      status: "no-signal",
      baseRequiredExposureScaleResolved:
        false,
      baseExposureOffsetStopsResolved:
        false,
      requiredExposureScaleResolved:
        false,
      exposureOffsetStopsResolved:
        false
    };
  }

  const meteredRelativeSignal =
    requirePositiveFinite(
      input.meterResult
        .meteredRelativeSignal,
      "meterResult.meteredRelativeSignal"
    );
  const baseScale =
    base.baseTargetRelativeSignal /
    meteredRelativeSignal;
  if (
    !Number.isFinite(baseScale) ||
    baseScale <= 0
  ) {
    throw new InvalidScientificInputError(
      "Base required exposure scale must remain finite and greater than zero."
    );
  }
  const baseStops =
    Math.log2(baseScale);
  if (!Number.isFinite(baseStops)) {
    throw new InvalidScientificInputError(
      "Base exposure offset must remain finite."
    );
  }

  return {
    ...base,
    status: "resolved",
    baseRequiredExposureScaleToTarget:
      baseScale,
    baseExposureOffsetStopsToTarget:
      baseStops,
    requiredExposureScaleToTarget:
      baseScale,
    exposureOffsetStopsToTarget:
      baseStops
  };
}

function validateBaseTarget(
  target: ExposureMeterTarget
): void {
  if (
    target.schemaVersion !==
    EXPOSURE_METER_TARGET_SCHEMA_VERSION
  ) {
    throw new InvalidScientificInputError(
      'baseTarget.schemaVersion must be "' +
        EXPOSURE_METER_TARGET_SCHEMA_VERSION +
        '".'
    );
  }
  requireNonEmptyString(
    target.targetId,
    "baseTarget.targetId"
  );
  requireNonEmptyString(
    target
      .sourceMeterSnapshot
      .measurementId,
    "baseTarget.sourceMeterSnapshot.measurementId"
  );
  requireNonEmptyString(
    target
      .sourceMeterSnapshot
      .sceneStateId,
    "baseTarget.sourceMeterSnapshot.sceneStateId"
  );
  requireNonEmptyString(
    target
      .sourceMeterSnapshot
      .meteringProfileId,
    "baseTarget.sourceMeterSnapshot.meteringProfileId"
  );
  if (
    target
      .sourceMeterSnapshot
      .sourceKind !==
      "spatial-metering-result" &&
    target
      .sourceMeterSnapshot
      .sourceKind !==
      "temporal-metering-result"
  ) {
    throw new InvalidScientificInputError(
      "baseTarget.sourceMeterSnapshot.sourceKind is invalid."
    );
  }
  if (
    target.scientificStatus !==
      "approximation" ||
    target.inputDomain !==
      "relative-pre-exposure-linear-signal" ||
    target.meterMeasurementMutated !==
      false ||
    target.sourceMeterSnapshotPreserved !==
      true ||
    target.resultReusableForAeLock !==
      true ||
    target.automaticExposureResolved !==
      false ||
    target.intendedConsumer !==
      "exposure-mode-resolver"
  ) {
    throw new InvalidScientificInputError(
      "baseTarget does not satisfy the exposure-meter target boundary."
    );
  }
  requirePositiveFinite(
    target.baseTargetRelativeSignal,
    "baseTarget.baseTargetRelativeSignal"
  );
  requireNonNegativeFinite(
    target.meteredRelativeSignal,
    "baseTarget.meteredRelativeSignal"
  );

  if (target.status === "resolved") {
    requirePositiveFinite(
      target
        .baseRequiredExposureScaleToTarget,
      "baseTarget.baseRequiredExposureScaleToTarget"
    );
    requireFinite(
      target
        .baseExposureOffsetStopsToTarget,
      "baseTarget.baseExposureOffsetStopsToTarget"
    );
  } else if (
    target.meteredRelativeSignal !== 0
  ) {
    throw new InvalidScientificInputError(
      "A no-signal baseTarget must preserve zero meteredRelativeSignal."
    );
  }
}

/**
 * Sets an absolute exposure-compensation value on a frozen meter target.
 *
 * Compensation is always re-derived from the uncompensated base target, so
 * repeated UI updates cannot accidentally accumulate floating-point/control
 * drift. Positive compensation requests more exposure.
 */
export function setExposureCompensationOnMeterTarget(
  input:
    SetExposureCompensationOnMeterTargetInput
): ExposureMeterTarget {
  validateBaseTarget(
    input.baseTarget
  );
  const targetId =
    requireNonEmptyString(
      input.targetId,
      "targetId"
    );
  if (
    targetId ===
    input.baseTarget.targetId
  ) {
    throw new InvalidScientificInputError(
      "A compensated target must use a new targetId so changed control state cannot hide behind the same identity."
    );
  }

  const compensation =
    requireFinite(
      input.exposureCompensationStops,
      "exposureCompensationStops"
    );
  const common = {
    ...input.baseTarget,
    targetId,
    exposureCompensationStops:
      compensation,
    exposureCompensationApplied:
      compensation !== 0,
    meterMeasurementMutated:
      false as const,
    sourceMeterSnapshotPreserved:
      true as const,
    resultReusableForAeLock:
      true as const,
    automaticExposureResolved:
      false as const
  };

  if (
    input.baseTarget.status ===
    "no-signal"
  ) {
    return {
      ...common,
      status: "no-signal",
      baseRequiredExposureScaleResolved:
        false,
      baseExposureOffsetStopsResolved:
        false,
      requiredExposureScaleResolved:
        false,
      exposureOffsetStopsResolved:
        false
    };
  }

  const compensatedStops =
    input.baseTarget
      .baseExposureOffsetStopsToTarget +
    compensation;
  const compensatedScale =
    input.baseTarget
      .baseRequiredExposureScaleToTarget *
    Math.pow(2, compensation);

  if (
    !Number.isFinite(
      compensatedStops
    ) ||
    !Number.isFinite(
      compensatedScale
    ) ||
    compensatedScale <= 0
  ) {
    throw new InvalidScientificInputError(
      "Compensated exposure target must remain finite and greater than zero."
    );
  }

  return {
    ...common,
    status: "resolved",
    baseRequiredExposureScaleToTarget:
      input.baseTarget
        .baseRequiredExposureScaleToTarget,
    baseExposureOffsetStopsToTarget:
      input.baseTarget
        .baseExposureOffsetStopsToTarget,
    requiredExposureScaleToTarget:
      compensatedScale,
    exposureOffsetStopsToTarget:
      compensatedStops
  };
}
