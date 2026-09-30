// SPDX-License-Identifier: Apache-2.0

import { InvalidScientificInputError } from "../core/validation.js";
import type {
  ResolvedGenericEquipmentExposureCapabilities,
  ResolvedNumericSettingGrid
} from "../equipment/exposure-capabilities.js";
import {
  EXPOSURE_METER_TARGET_SCHEMA_VERSION,
  type ExposureMeterTarget
} from "./metering-target.js";

type UnknownRecord = Record<string, unknown>;

export const EXPOSURE_MODE_RESOLVER_VERSION =
  "0.1.0" as const;

export interface RelativeExposureControlAnchor {
  aperture: number;
  shutterSeconds: number;
  iso: number;
}

export type ManualIsoControl =
  | {
      kind: "manual";
      iso: number;
    }
  | {
      kind: "automatic";
      quantizationPolicy:
        "nearest-log2-lower-on-tie";
    };

export interface ResolveManualExposureModeInput {
  target: ExposureMeterTarget;
  capabilities:
    ResolvedGenericEquipmentExposureCapabilities;
  referenceExposure:
    RelativeExposureControlAnchor;
  manualAperture: number;
  manualShutterSeconds: number;
  isoControl: ManualIsoControl;
}

export type ExposureTargetResidualState =
  | "matched"
  | "under-target"
  | "over-target"
  | "target-unresolved";

export type ExposureResolutionConstraint =
  | "none"
  | "iso-minimum"
  | "iso-maximum"
  | "iso-grid-quantization";

export interface ExposureTargetResidual {
  status:
    | "resolved"
    | "target-unresolved";
  state:
    ExposureTargetResidualState;
  targetExposureStops?: number;
  achievedExposureStops?: number;
  residualStops?: number;
  limitingConstraint?:
    ExposureResolutionConstraint;
  reason?: "no-signal-target";
}

interface ManualExposureResolutionBase {
  resolverVersion:
    typeof EXPOSURE_MODE_RESOLVER_VERSION;
  mode: "manual";
  axisOwnership: {
    aperture: "manual";
    shutter: "manual";
    iso: "manual" | "automatic";
  };
  targetId: string;
  targetSourceMeterSnapshot:
    ExposureMeterTarget["sourceMeterSnapshot"];
  capabilityProfiles: {
    bodyProfileId: string;
    bodyProfileVersion: string;
    lensProfileId: string;
    lensProfileVersion: string;
  };
  selectedFocalLengthMm: number;
  referenceExposure:
    RelativeExposureControlAnchor;
  manualAperture: number;
  manualShutterSeconds: number;
  apertureMutatedByResolver: false;
  shutterMutatedByResolver: false;
  exposureCompensationAppliedByResolver:
    false;
  meterRecomputedByResolver: false;
  isoNoiseOrGainTopologyInferred: false;
  flashPolicyApplied: false;
  safetyShiftApplied: false;
}

export type ManualExposureModeResolution =
  | (ManualExposureResolutionBase & {
      status: "resolved";
      isoControl: "manual";
      resolvedSettings: {
        aperture: number;
        shutterSeconds: number;
        iso: number;
      };
      idealIsoBeforeConstraints:
        null;
      isoResolution: {
        kind: "manual-preserved";
        quantized: false;
        clamped: false;
      };
      targetResidual:
        ExposureTargetResidual;
    })
  | (ManualExposureResolutionBase & {
      status: "resolved";
      isoControl: "automatic";
      resolvedSettings: {
        aperture: number;
        shutterSeconds: number;
        iso: number;
      };
      idealIsoBeforeConstraints:
        number;
      isoResolution: {
        kind:
          | "continuous"
          | "discrete";
        quantizationPolicy:
          "nearest-log2-lower-on-tie";
        quantized: boolean;
        clamped:
          | false
          | "minimum"
          | "maximum";
      };
      targetResidual: {
        status: "resolved";
        state:
          | "matched"
          | "under-target"
          | "over-target";
        targetExposureStops: number;
        achievedExposureStops: number;
        residualStops: number;
        limitingConstraint:
          ExposureResolutionConstraint;
      };
    })
  | (ManualExposureResolutionBase & {
      status: "blocked";
      isoControl: "automatic";
      resolvedSettings: {
        aperture: number;
        shutterSeconds: number;
      };
      idealIsoBeforeConstraints:
        null;
      blocker:
        | "auto-iso-unsupported"
        | "auto-iso-unknown"
        | "target-no-signal";
      targetResidual: {
        status:
          "target-unresolved";
        state:
          "target-unresolved";
        reason:
          "no-signal-target" |
          "auto-iso-unavailable";
      };
    });

function requireRecord(
  value: unknown,
  path: string
): UnknownRecord {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new InvalidScientificInputError(
      path + " must be an object."
    );
  }
  return value as UnknownRecord;
}

function requirePositiveFinite(
  value: unknown,
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

function settingEquals(
  left: number,
  right: number
): boolean {
  const scale = Math.max(
    Math.abs(left),
    Math.abs(right),
    1
  );
  return (
    Math.abs(left - right) <=
    Number.EPSILON * 32 * scale
  );
}

function validateSettingAgainstGrid(
  value: number,
  minimum: number,
  maximum: number,
  grid: ResolvedNumericSettingGrid,
  path: string
): void {
  if (
    value < minimum ||
    value > maximum
  ) {
    throw new InvalidScientificInputError(
      path +
        " lies outside the resolved equipment capability range."
    );
  }

  if (
    grid.kind ===
    "discrete-values" &&
    !grid.values.some(
      (candidate) =>
        settingEquals(
          candidate,
          value
        )
    )
  ) {
    throw new InvalidScientificInputError(
      path +
        " is not present in the resolved discrete equipment setting grid."
    );
  }
}

function validateTarget(
  value: unknown
): ExposureMeterTarget {
  const record = requireRecord(
    value,
    "target"
  );
  if (
    record.schemaVersion !==
    EXPOSURE_METER_TARGET_SCHEMA_VERSION
  ) {
    throw new InvalidScientificInputError(
      'target.schemaVersion must be "' +
        EXPOSURE_METER_TARGET_SCHEMA_VERSION +
        '".'
    );
  }
  if (
    record.scientificStatus !==
      "approximation" ||
    record.inputDomain !==
      "relative-pre-exposure-linear-signal" ||
    record.intendedConsumer !==
      "exposure-mode-resolver" ||
    record.automaticExposureResolved !==
      false ||
    record.sourceMeterSnapshotPreserved !==
      true
  ) {
    throw new InvalidScientificInputError(
      "target does not satisfy the exposure-mode resolver boundary."
    );
  }

  const targetId = record.targetId;
  if (
    typeof targetId !== "string" ||
    targetId.trim().length === 0
  ) {
    throw new InvalidScientificInputError(
      "target.targetId must be a non-empty string."
    );
  }

  requireRecord(
    record.sourceMeterSnapshot,
    "target.sourceMeterSnapshot"
  );

  if (
    record.status === "resolved"
  ) {
    requirePositiveFinite(
      record
        .requiredExposureScaleToTarget,
      "target.requiredExposureScaleToTarget"
    );
    if (
      typeof record
        .exposureOffsetStopsToTarget !==
        "number" ||
      !Number.isFinite(
        record
          .exposureOffsetStopsToTarget
      )
    ) {
      throw new InvalidScientificInputError(
        "target.exposureOffsetStopsToTarget must be finite."
      );
    }
  } else if (
    record.status !== "no-signal"
  ) {
    throw new InvalidScientificInputError(
      "target.status is invalid."
    );
  }

  return value as ExposureMeterTarget;
}

function validateCapabilities(
  value:
    ResolvedGenericEquipmentExposureCapabilities
): void {
  if (
    value.schemaVersion !== "0.1.0" ||
    value.scientificStatus !==
      "approximation"
  ) {
    throw new InvalidScientificInputError(
      "capabilities do not satisfy the generic equipment exposure-capability boundary."
    );
  }
  requirePositiveFinite(
    value.selectedFocalLengthMm,
    "capabilities.selectedFocalLengthMm"
  );
  requirePositiveFinite(
    value.aperture
      .widestAvailableFNumber,
    "capabilities.aperture.widestAvailableFNumber"
  );
  requirePositiveFinite(
    value.aperture
      .narrowestAvailableFNumber,
    "capabilities.aperture.narrowestAvailableFNumber"
  );
  requirePositiveFinite(
    value.shutter.minimumSeconds,
    "capabilities.shutter.minimumSeconds"
  );
  requirePositiveFinite(
    value.shutter.maximumSeconds,
    "capabilities.shutter.maximumSeconds"
  );
  requirePositiveFinite(
    value.iso.minimum,
    "capabilities.iso.minimum"
  );
  requirePositiveFinite(
    value.iso.maximum,
    "capabilities.iso.maximum"
  );
}

function validateReferenceExposure(
  reference:
    RelativeExposureControlAnchor,
  capabilities:
    ResolvedGenericEquipmentExposureCapabilities
): RelativeExposureControlAnchor {
  const aperture =
    requirePositiveFinite(
      reference.aperture,
      "referenceExposure.aperture"
    );
  const shutterSeconds =
    requirePositiveFinite(
      reference.shutterSeconds,
      "referenceExposure.shutterSeconds"
    );
  const iso =
    requirePositiveFinite(
      reference.iso,
      "referenceExposure.iso"
    );

  validateSettingAgainstGrid(
    aperture,
    capabilities.aperture
      .widestAvailableFNumber,
    capabilities.aperture
      .narrowestAvailableFNumber,
    capabilities.aperture
      .settingGrid,
    "referenceExposure.aperture"
  );
  validateSettingAgainstGrid(
    shutterSeconds,
    capabilities.shutter
      .minimumSeconds,
    capabilities.shutter
      .maximumSeconds,
    capabilities.shutter
      .settingGrid,
    "referenceExposure.shutterSeconds"
  );
  validateSettingAgainstGrid(
    iso,
    capabilities.iso.minimum,
    capabilities.iso.maximum,
    capabilities.iso.settingGrid,
    "referenceExposure.iso"
  );

  return {
    aperture,
    shutterSeconds,
    iso
  };
}

function opticalExposureFactor(
  aperture: number,
  shutterSeconds: number,
  reference:
    RelativeExposureControlAnchor
): number {
  const current =
    shutterSeconds /
    (aperture * aperture);
  const referenceOptical =
    reference.shutterSeconds /
    (reference.aperture *
      reference.aperture);
  const factor =
    current /
    referenceOptical;
  if (
    !Number.isFinite(factor) ||
    factor <= 0
  ) {
    throw new InvalidScientificInputError(
      "Optical exposure factor must remain finite and greater than zero."
    );
  }
  return factor;
}

function targetResidual(
  target:
    ExposureMeterTarget,
  achievedScale: number,
  limitingConstraint:
    ExposureResolutionConstraint
): ExposureTargetResidual {
  if (
    target.status ===
    "no-signal"
  ) {
    return {
      status:
        "target-unresolved",
      state:
        "target-unresolved",
      reason: "no-signal-target"
    };
  }

  const targetScale =
    target
      .requiredExposureScaleToTarget;
  const targetStops =
    target
      .exposureOffsetStopsToTarget;
  const achievedStops =
    Math.log2(achievedScale);
  const residualStops =
    Math.log2(
      targetScale /
      achievedScale
    );

  if (
    !Number.isFinite(
      achievedStops
    ) ||
    !Number.isFinite(
      residualStops
    )
  ) {
    throw new InvalidScientificInputError(
      "Exposure target residual must remain finite."
    );
  }

  const toleranceStops =
    1e-12;
  const state =
    Math.abs(residualStops) <=
    toleranceStops
      ? "matched"
      : residualStops > 0
        ? "under-target"
        : "over-target";

  return {
    status: "resolved",
    state,
    targetExposureStops:
      targetStops,
    achievedExposureStops:
      achievedStops,
    residualStops,
    limitingConstraint
  };
}

function nearestDiscreteIso(
  idealIso: number,
  values: readonly number[]
): {
  iso: number;
  quantized: boolean;
  clamped:
    | false
    | "minimum"
    | "maximum";
  limitingConstraint:
    ExposureResolutionConstraint;
} {
  const first = values[0]!;
  const last =
    values[values.length - 1]!;

  if (idealIso < first) {
    return {
      iso: first,
      quantized: true,
      clamped: "minimum",
      limitingConstraint:
        "iso-minimum"
    };
  }
  if (idealIso > last) {
    return {
      iso: last,
      quantized: true,
      clamped: "maximum",
      limitingConstraint:
        "iso-maximum"
    };
  }

  let selected = first;
  let selectedDistance =
    Math.abs(
      Math.log2(
        idealIso / first
      )
    );

  for (
    let index = 1;
    index < values.length;
    index += 1
  ) {
    const candidate =
      values[index]!;
    const distance =
      Math.abs(
        Math.log2(
          idealIso /
          candidate
        )
      );
    if (
      distance <
        selectedDistance -
          1e-15 ||
      (Math.abs(
        distance -
          selectedDistance
      ) <= 1e-15 &&
        candidate < selected)
    ) {
      selected = candidate;
      selectedDistance =
        distance;
    }
  }

  const quantized =
    !settingEquals(
      selected,
      idealIso
    );

  return {
    iso: selected,
    quantized,
    clamped: false,
    limitingConstraint:
      quantized
        ? "iso-grid-quantization"
        : "none"
  };
}

function resolveAutomaticIso(
  idealIso: number,
  capabilities:
    ResolvedGenericEquipmentExposureCapabilities
): {
  iso: number;
  kind:
    | "continuous"
    | "discrete";
  quantized: boolean;
  clamped:
    | false
    | "minimum"
    | "maximum";
  limitingConstraint:
    ExposureResolutionConstraint;
} {
  const grid =
    capabilities.iso.settingGrid;

  if (
    grid.kind ===
    "discrete-values"
  ) {
    const discrete =
      nearestDiscreteIso(
        idealIso,
        grid.values
      );
    return {
      ...discrete,
      kind: "discrete"
    };
  }

  if (
    idealIso <
    capabilities.iso.minimum
  ) {
    return {
      iso:
        capabilities.iso.minimum,
      kind: "continuous",
      quantized: false,
      clamped: "minimum",
      limitingConstraint:
        "iso-minimum"
    };
  }
  if (
    idealIso >
    capabilities.iso.maximum
  ) {
    return {
      iso:
        capabilities.iso.maximum,
      kind: "continuous",
      quantized: false,
      clamped: "maximum",
      limitingConstraint:
        "iso-maximum"
    };
  }

  return {
    iso: idealIso,
    kind: "continuous",
    quantized: false,
    clamped: false,
    limitingConstraint: "none"
  };
}

/**
 * Resolves Manual exposure with either manual ISO or Auto ISO.
 *
 * Aperture and shutter are always caller-owned and are never changed.
 * The relative meter target is normalized by an explicit reference exposure
 * anchor; no ISO-100 or other hidden absolute calibration is assumed.
 */
export function resolveManualExposureMode(
  input:
    ResolveManualExposureModeInput
): ManualExposureModeResolution {
  const target =
    validateTarget(input.target);
  validateCapabilities(
    input.capabilities
  );

  const referenceExposure =
    validateReferenceExposure(
      input.referenceExposure,
      input.capabilities
    );

  const manualAperture =
    requirePositiveFinite(
      input.manualAperture,
      "manualAperture"
    );
  const manualShutterSeconds =
    requirePositiveFinite(
      input.manualShutterSeconds,
      "manualShutterSeconds"
    );

  validateSettingAgainstGrid(
    manualAperture,
    input.capabilities.aperture
      .widestAvailableFNumber,
    input.capabilities.aperture
      .narrowestAvailableFNumber,
    input.capabilities.aperture
      .settingGrid,
    "manualAperture"
  );
  validateSettingAgainstGrid(
    manualShutterSeconds,
    input.capabilities.shutter
      .minimumSeconds,
    input.capabilities.shutter
      .maximumSeconds,
    input.capabilities.shutter
      .settingGrid,
    "manualShutterSeconds"
  );

  const base:
    ManualExposureResolutionBase = {
    resolverVersion:
      EXPOSURE_MODE_RESOLVER_VERSION,
    mode: "manual",
    axisOwnership: {
      aperture: "manual",
      shutter: "manual",
      iso:
        input.isoControl.kind ===
        "manual"
          ? "manual"
          : "automatic"
    },
    targetId: target.targetId,
    targetSourceMeterSnapshot:
      target.sourceMeterSnapshot,
    capabilityProfiles: {
      bodyProfileId:
        input.capabilities
          .bodyProfile.profileId,
      bodyProfileVersion:
        input.capabilities
          .bodyProfile.profileVersion,
      lensProfileId:
        input.capabilities
          .lensProfile.profileId,
      lensProfileVersion:
        input.capabilities
          .lensProfile.profileVersion
    },
    selectedFocalLengthMm:
      input.capabilities
        .selectedFocalLengthMm,
    referenceExposure,
    manualAperture,
    manualShutterSeconds,
    apertureMutatedByResolver: false,
    shutterMutatedByResolver: false,
    exposureCompensationAppliedByResolver:
      false,
    meterRecomputedByResolver: false,
    isoNoiseOrGainTopologyInferred:
      false,
    flashPolicyApplied: false,
    safetyShiftApplied: false
  };

  const opticalFactor =
    opticalExposureFactor(
      manualAperture,
      manualShutterSeconds,
      referenceExposure
    );

  if (
    input.isoControl.kind ===
    "manual"
  ) {
    const manualIso =
      requirePositiveFinite(
        input.isoControl.iso,
        "isoControl.iso"
      );
    validateSettingAgainstGrid(
      manualIso,
      input.capabilities.iso.minimum,
      input.capabilities.iso.maximum,
      input.capabilities.iso.settingGrid,
      "isoControl.iso"
    );

    const achievedScale =
      opticalFactor *
      (manualIso /
        referenceExposure.iso);

    return {
      ...base,
      status: "resolved",
      isoControl: "manual",
      resolvedSettings: {
        aperture:
          manualAperture,
        shutterSeconds:
          manualShutterSeconds,
        iso: manualIso
      },
      idealIsoBeforeConstraints:
        null,
      isoResolution: {
        kind:
          "manual-preserved",
        quantized: false,
        clamped: false
      },
      targetResidual:
        targetResidual(
          target,
          achievedScale,
          "none"
        )
    };
  }

  const availability =
    input.capabilities.iso
      .autoIsoAvailability;
  if (
    availability !== "supported"
  ) {
    return {
      ...base,
      status: "blocked",
      isoControl: "automatic",
      resolvedSettings: {
        aperture:
          manualAperture,
        shutterSeconds:
          manualShutterSeconds
      },
      idealIsoBeforeConstraints:
        null,
      blocker:
        availability ===
        "unknown"
          ? "auto-iso-unknown"
          : "auto-iso-unsupported",
      targetResidual: {
        status:
          "target-unresolved",
        state:
          "target-unresolved",
        reason:
          "auto-iso-unavailable"
      }
    };
  }

  if (target.status === "no-signal") {
    return {
      ...base,
      status: "blocked",
      isoControl: "automatic",
      resolvedSettings: {
        aperture:
          manualAperture,
        shutterSeconds:
          manualShutterSeconds
      },
      idealIsoBeforeConstraints:
        null,
      blocker:
        "target-no-signal",
      targetResidual: {
        status:
          "target-unresolved",
        state:
          "target-unresolved",
        reason: "no-signal-target"
      }
    };
  }

  const idealIso =
    referenceExposure.iso *
    (target
      .requiredExposureScaleToTarget /
      opticalFactor);

  if (
    !Number.isFinite(idealIso) ||
    idealIso <= 0
  ) {
    throw new InvalidScientificInputError(
      "Ideal Auto ISO must remain finite and greater than zero."
    );
  }

  const automatic =
    resolveAutomaticIso(
      idealIso,
      input.capabilities
    );

  const achievedScale =
    opticalFactor *
    (automatic.iso /
      referenceExposure.iso);
  const residual =
    targetResidual(
      target,
      achievedScale,
      automatic
        .limitingConstraint
    );

  if (
    residual.status !==
    "resolved"
  ) {
    throw new InvalidScientificInputError(
      "Resolved Auto ISO requires a resolved exposure target."
    );
  }

  return {
    ...base,
    status: "resolved",
    isoControl: "automatic",
    resolvedSettings: {
      aperture:
        manualAperture,
      shutterSeconds:
        manualShutterSeconds,
      iso: automatic.iso
    },
    idealIsoBeforeConstraints:
      idealIso,
    isoResolution: {
      kind: automatic.kind,
      quantizationPolicy:
        input.isoControl
          .quantizationPolicy,
      quantized:
        automatic.quantized,
      clamped:
        automatic.clamped
    },
    targetResidual: residual
  };
}
