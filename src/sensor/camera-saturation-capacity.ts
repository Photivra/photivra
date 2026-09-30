// SPDX-License-Identifier: Apache-2.0

import {
  approximationResult,
  type CalculationResult
} from "../core/calculation-result.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";
import {
  parseEvidenceList,
  type EvidenceProvenance
} from "../core/evidence-provenance.js";
import { InvalidScientificInputError } from "../core/validation.js";
import type {
  SensorAccumulatedChargeComposition
} from "./accumulated-charge.js";
import type {
  SensorSpectralResponseScientificStatus,
  SensorSpectralResponseUncertainty
} from "./spectral-response.js";

type UnknownRecord = Record<string, unknown>;

export type SensorCameraSaturationSiteApplicability =
  | {
      kind: "exact-site";
      site: {
        x: number;
        y: number;
      };
    }
  | {
      kind:
        "channel-population-mean-approximation";
      limitation: string;
      evidence:
        readonly EvidenceProvenance[];
    };

export type SensorCameraSaturationTemperatureApplicability =
  | {
      kind:
        "exact-reference-temperature";
      temperatureC: number;
    }
  | {
      kind: "not-modeled";
      limitation: string;
      evidence:
        readonly EvidenceProvenance[];
    };

export interface SensorCameraSaturationCapacityProfile {
  schemaVersion: "0.1.0";
  profileId: string;
  colorSamplingProfileId: string;
  channelId: string;
  capacityMeaning:
    "camera-signal-saturation-capacity-electrons";
  signalDomain:
    "dark-corrected-photo-generated-electron-equivalent";
  saturationCapacityElectrons: number;
  scientificStatus:
    SensorSpectralResponseScientificStatus;
  uncertainty:
    SensorSpectralResponseUncertainty;
  evidence:
    readonly EvidenceProvenance[];
  measurementMethodId: string;
  measurementMethodEvidence:
    readonly EvidenceProvenance[];
  siteApplicability:
    SensorCameraSaturationSiteApplicability;
  operatingState: {
    stateId: string;
    evidence:
      readonly EvidenceProvenance[];
  };
  temperatureApplicability:
    SensorCameraSaturationTemperatureApplicability;
}

export interface AssessSensorCameraSaturationCapacityInput {
  accumulatedCharge:
    SensorAccumulatedChargeComposition;
  saturationProfile:
    SensorCameraSaturationCapacityProfile;
  operatingStateId: string;
  operatingTemperatureC: number;
}

export interface SensorCameraSaturationCapacityAssessment {
  saturationProfileId: string;
  completenessProfileId: string;
  colorSamplingProfileId: string;
  channelId: string;
  site: {
    x: number;
    y: number;
  };
  bindingId: string;
  operatingStateId: string;
  operatingTemperatureC: number;
  capacityMeaning:
    "camera-signal-saturation-capacity-electrons";
  signalDomain:
    "dark-corrected-photo-generated-electron-equivalent";
  cameraSignalSaturationCapacityElectrons:
    number;
  expectedPhotoSignalElectronCount:
    number;
  totalExpectedStoredElectronCountDiagnostic:
    number;
  totalStoredChargeUsedForCameraSaturationComparison:
    false;
  expectedSignalToCameraSaturationRatio:
    number;
  expectedSignalHeadroomElectrons:
    number;
  expectedCameraSignalCapacityStatus:
    | "below-capacity"
    | "at-capacity"
    | "above-capacity";
  expectedPhotoSignalExceedsCameraCapacity:
    boolean;
  cameraSaturationCapacityAssessmentPerformed:
    true;
  assessmentMeaning:
    "expected-dark-corrected-photo-signal-vs-camera-saturation-capacity";
  physicalChargeCapacityUsed:
    false;
  limitingSaturationMechanismResolved:
    false;
  analogClippingThresholdModeled:
    false;
  digitalClippingThresholdModeled:
    false;
  adcMaximumCodeUsed:
    false;
  actualStochasticSaturationStateKnown:
    false;
  stochasticSaturationProbabilityAssessed:
    false;
  outputSignalAfterSaturationCalculated:
    false;
  clampApplied: false;
  physicalStoredChargeModified:
    false;
  adcQuantizationApplied: false;
  rawCodeValueProduced: false;
  saturationCapacityUncertaintyPropagated:
    false;
  photoSignalUncertaintyPropagated:
    false;
  componentEvidence: {
    saturationCapacity:
      readonly EvidenceProvenance[];
    measurementMethod:
      readonly EvidenceProvenance[];
    operatingState:
      readonly EvidenceProvenance[];
    siteApproximation:
      readonly EvidenceProvenance[];
    temperatureApproximation:
      readonly EvidenceProvenance[];
    chargeCompleteness:
      SensorAccumulatedChargeComposition["componentEvidence"]["completeness"];
  };
}

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
      path + " must be a non-empty string."
    );
  }
  return value;
}

function requireFinite(
  value: unknown,
  path: string
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    throw new InvalidConfigurationError(
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
    throw new InvalidConfigurationError(
      path +
        " must be greater than zero."
    );
  }
  return parsed;
}

function requireNonNegativeFiniteInput(
  value: unknown,
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

function requireSiteIndex(
  value: unknown,
  path: string
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new InvalidConfigurationError(
      path +
        " must be a non-negative safe integer."
    );
  }
  return value;
}

function parseUncertainty(
  value: unknown,
  path: string
): SensorSpectralResponseUncertainty {
  const record = requireRecord(
    value,
    path
  );
  if (record.kind === "relative") {
    const fraction = requireFinite(
      record.fraction,
      path + ".fraction"
    );
    if (fraction < 0) {
      throw new InvalidConfigurationError(
        path +
          ".fraction must be nonnegative."
      );
    }
    return {
      kind: "relative",
      fraction,
      basis: requireNonEmptyString(
        record.basis,
        path + ".basis"
      )
    };
  }
  if (
    record.kind === "not-quantified"
  ) {
    return {
      kind: "not-quantified",
      limitation:
        requireNonEmptyString(
          record.limitation,
          path + ".limitation"
        )
    };
  }
  throw new InvalidConfigurationError(
    path + ".kind is invalid."
  );
}

function parseSiteApplicability(
  value: unknown
): SensorCameraSaturationSiteApplicability {
  const record = requireRecord(
    value,
    "sensorCameraSaturation.siteApplicability"
  );
  if (record.kind === "exact-site") {
    const site = requireRecord(
      record.site,
      "sensorCameraSaturation.siteApplicability.site"
    );
    return {
      kind: "exact-site",
      site: {
        x: requireSiteIndex(
          site.x,
          "sensorCameraSaturation.siteApplicability.site.x"
        ),
        y: requireSiteIndex(
          site.y,
          "sensorCameraSaturation.siteApplicability.site.y"
        )
      }
    };
  }
  if (
    record.kind ===
      "channel-population-mean-approximation"
  ) {
    return {
      kind:
        "channel-population-mean-approximation",
      limitation:
        requireNonEmptyString(
          record.limitation,
          "sensorCameraSaturation.siteApplicability.limitation"
        ),
      evidence: parseEvidenceList(
        record.evidence,
        "sensorCameraSaturation.siteApplicability.evidence"
      )
    };
  }
  throw new InvalidConfigurationError(
    "sensorCameraSaturation.siteApplicability.kind is invalid."
  );
}

function parseTemperatureApplicability(
  value: unknown
): SensorCameraSaturationTemperatureApplicability {
  const record = requireRecord(
    value,
    "sensorCameraSaturation.temperatureApplicability"
  );
  if (
    record.kind ===
      "exact-reference-temperature"
  ) {
    return {
      kind:
        "exact-reference-temperature",
      temperatureC:
        requireFinite(
          record.temperatureC,
          "sensorCameraSaturation.temperatureApplicability.temperatureC"
        )
    };
  }
  if (record.kind === "not-modeled") {
    return {
      kind: "not-modeled",
      limitation:
        requireNonEmptyString(
          record.limitation,
          "sensorCameraSaturation.temperatureApplicability.limitation"
        ),
      evidence: parseEvidenceList(
        record.evidence,
        "sensorCameraSaturation.temperatureApplicability.evidence"
      )
    };
  }
  throw new InvalidConfigurationError(
    "sensorCameraSaturation.temperatureApplicability.kind is invalid."
  );
}

export function parseSensorCameraSaturationCapacityProfile(
  value: unknown
): SensorCameraSaturationCapacityProfile {
  const record = requireRecord(
    value,
    "sensorCameraSaturation"
  );

  if (
    record.schemaVersion !== "0.1.0"
  ) {
    throw new InvalidConfigurationError(
      'sensorCameraSaturation.schemaVersion must be "0.1.0".'
    );
  }
  if (
    record.capacityMeaning !==
      "camera-signal-saturation-capacity-electrons"
  ) {
    throw new InvalidConfigurationError(
      "sensorCameraSaturation.capacityMeaning is invalid."
    );
  }
  if (
    record.signalDomain !==
      "dark-corrected-photo-generated-electron-equivalent"
  ) {
    throw new InvalidConfigurationError(
      "sensorCameraSaturation.signalDomain is invalid."
    );
  }
  if (
    record.scientificStatus !==
      "calibrated" &&
    record.scientificStatus !==
      "approximation"
  ) {
    throw new InvalidConfigurationError(
      "sensorCameraSaturation.scientificStatus is invalid."
    );
  }

  const uncertainty =
    parseUncertainty(
      record.uncertainty,
      "sensorCameraSaturation.uncertainty"
    );
  if (
    record.scientificStatus ===
      "calibrated" &&
    uncertainty.kind ===
      "not-quantified"
  ) {
    throw new InvalidConfigurationError(
      "A calibrated camera saturation-capacity profile must declare quantified relative uncertainty."
    );
  }

  const siteApplicability =
    parseSiteApplicability(
      record.siteApplicability
    );
  const temperatureApplicability =
    parseTemperatureApplicability(
      record.temperatureApplicability
    );

  if (
    siteApplicability.kind ===
      "channel-population-mean-approximation" &&
    record.scientificStatus !==
      "approximation"
  ) {
    throw new InvalidConfigurationError(
      "A channel-population mean camera saturation capacity must remain an approximation when applied to one site."
    );
  }
  if (
    temperatureApplicability.kind ===
      "not-modeled" &&
    record.scientificStatus !==
      "approximation"
  ) {
    throw new InvalidConfigurationError(
      "A camera saturation capacity with unmodeled temperature dependence must remain an approximation."
    );
  }

  const state = requireRecord(
    record.operatingState,
    "sensorCameraSaturation.operatingState"
  );

  return {
    schemaVersion: "0.1.0",
    profileId:
      requireNonEmptyString(
        record.profileId,
        "sensorCameraSaturation.profileId"
      ),
    colorSamplingProfileId:
      requireNonEmptyString(
        record.colorSamplingProfileId,
        "sensorCameraSaturation.colorSamplingProfileId"
      ),
    channelId:
      requireNonEmptyString(
        record.channelId,
        "sensorCameraSaturation.channelId"
      ),
    capacityMeaning:
      "camera-signal-saturation-capacity-electrons",
    signalDomain:
      "dark-corrected-photo-generated-electron-equivalent",
    saturationCapacityElectrons:
      requirePositiveFinite(
        record.saturationCapacityElectrons,
        "sensorCameraSaturation.saturationCapacityElectrons"
      ),
    scientificStatus:
      record.scientificStatus,
    uncertainty,
    evidence: parseEvidenceList(
      record.evidence,
      "sensorCameraSaturation.evidence"
    ),
    measurementMethodId:
      requireNonEmptyString(
        record.measurementMethodId,
        "sensorCameraSaturation.measurementMethodId"
      ),
    measurementMethodEvidence:
      parseEvidenceList(
        record.measurementMethodEvidence,
        "sensorCameraSaturation.measurementMethodEvidence"
      ),
    siteApplicability,
    operatingState: {
      stateId:
        requireNonEmptyString(
          state.stateId,
          "sensorCameraSaturation.operatingState.stateId"
        ),
      evidence: parseEvidenceList(
        state.evidence,
        "sensorCameraSaturation.operatingState.evidence"
      )
    },
    temperatureApplicability
  };
}

function sameSite(
  a: { x: number; y: number },
  b: { x: number; y: number }
): boolean {
  return a.x === b.x && a.y === b.y;
}

function validateCharge(
  charge:
    SensorAccumulatedChargeComposition
): {
  photo: number;
  total: number;
} {
  if (
    charge.accumulatedChargeCompleteness !==
      "complete-for-physical-storage-capacity-assessment" ||
    charge.saturationAssessed !==
      false ||
    charge.adcQuantizationApplied !==
      false ||
    charge.rawCodeValueProduced !==
      false
  ) {
    throw new InvalidScientificInputError(
      "Camera saturation assessment requires an unmodified pre-saturation accumulated-charge composition."
    );
  }

  return {
    photo: requireNonNegativeFiniteInput(
      charge.photoExpectedElectronCount,
      "accumulatedCharge.photoExpectedElectronCount"
    ),
    total: requireNonNegativeFiniteInput(
      charge.totalExpectedStoredElectronCount,
      "accumulatedCharge.totalExpectedStoredElectronCount"
    )
  };
}

export function assessSensorCameraSaturationCapacity(
  input:
    AssessSensorCameraSaturationCapacityInput
): CalculationResult<SensorCameraSaturationCapacityAssessment> {
  const charge =
    validateCharge(
      input.accumulatedCharge
    );
  const profile =
    parseSensorCameraSaturationCapacityProfile(
      input.saturationProfile
    );

  if (
    profile.colorSamplingProfileId !==
      input.accumulatedCharge
        .colorSamplingProfileId ||
    profile.channelId !==
      input.accumulatedCharge.channelId
  ) {
    throw new InvalidScientificInputError(
      "Camera saturation-capacity profile color/channel identity must match the accumulated charge."
    );
  }
  if (
    profile.siteApplicability.kind ===
      "exact-site" &&
    !sameSite(
      profile.siteApplicability.site,
      input.accumulatedCharge.site
    )
  ) {
    throw new InvalidScientificInputError(
      "Exact-site camera saturation capacity does not apply to the accumulated-charge site."
    );
  }
  if (
    typeof input.operatingStateId !==
      "string" ||
    input.operatingStateId.trim().length ===
      0 ||
    input.operatingStateId !==
      profile.operatingState.stateId
  ) {
    throw new InvalidScientificInputError(
      "operatingStateId must exactly match the camera saturation-capacity calibration state."
    );
  }
  if (
    typeof input.operatingTemperatureC !==
      "number" ||
    !Number.isFinite(
      input.operatingTemperatureC
    )
  ) {
    throw new InvalidScientificInputError(
      "operatingTemperatureC must be finite."
    );
  }
  if (
    profile.temperatureApplicability.kind ===
      "exact-reference-temperature" &&
    input.operatingTemperatureC !==
      profile.temperatureApplicability
        .temperatureC
  ) {
    throw new InvalidScientificInputError(
      "operatingTemperatureC must exactly match the camera saturation-capacity reference temperature."
    );
  }

  const capacity =
    profile.saturationCapacityElectrons;
  const ratio =
    charge.photo / capacity;
  const headroom =
    capacity - charge.photo;

  if (
    !Number.isFinite(ratio) ||
    !Number.isFinite(headroom)
  ) {
    throw new InvalidScientificInputError(
      "Camera saturation-capacity comparison must remain finite."
    );
  }

  const status =
    charge.photo < capacity
      ? "below-capacity"
      : charge.photo === capacity
        ? "at-capacity"
        : "above-capacity";

  return approximationResult(
    {
      saturationProfileId:
        profile.profileId,
      completenessProfileId:
        input.accumulatedCharge
          .completenessProfileId,
      colorSamplingProfileId:
        input.accumulatedCharge
          .colorSamplingProfileId,
      channelId:
        input.accumulatedCharge.channelId,
      site: {
        ...input.accumulatedCharge.site
      },
      bindingId:
        input.accumulatedCharge.bindingId,
      operatingStateId:
        input.operatingStateId,
      operatingTemperatureC:
        input.operatingTemperatureC,
      capacityMeaning:
        "camera-signal-saturation-capacity-electrons",
      signalDomain:
        "dark-corrected-photo-generated-electron-equivalent",
      cameraSignalSaturationCapacityElectrons:
        capacity,
      expectedPhotoSignalElectronCount:
        charge.photo,
      totalExpectedStoredElectronCountDiagnostic:
        charge.total,
      totalStoredChargeUsedForCameraSaturationComparison:
        false,
      expectedSignalToCameraSaturationRatio:
        ratio,
      expectedSignalHeadroomElectrons:
        headroom,
      expectedCameraSignalCapacityStatus:
        status,
      expectedPhotoSignalExceedsCameraCapacity:
        status === "above-capacity",
      cameraSaturationCapacityAssessmentPerformed:
        true,
      assessmentMeaning:
        "expected-dark-corrected-photo-signal-vs-camera-saturation-capacity",
      physicalChargeCapacityUsed: false,
      limitingSaturationMechanismResolved:
        false,
      analogClippingThresholdModeled:
        false,
      digitalClippingThresholdModeled:
        false,
      adcMaximumCodeUsed: false,
      actualStochasticSaturationStateKnown:
        false,
      stochasticSaturationProbabilityAssessed:
        false,
      outputSignalAfterSaturationCalculated:
        false,
      clampApplied: false,
      physicalStoredChargeModified:
        false,
      adcQuantizationApplied: false,
      rawCodeValueProduced: false,
      saturationCapacityUncertaintyPropagated:
        false,
      photoSignalUncertaintyPropagated:
        false,
      componentEvidence: {
        saturationCapacity:
          profile.evidence,
        measurementMethod:
          profile
            .measurementMethodEvidence,
        operatingState:
          profile.operatingState
            .evidence,
        siteApproximation:
          profile.siteApplicability.kind ===
            "channel-population-mean-approximation"
            ? profile
                .siteApplicability
                .evidence
            : [],
        temperatureApproximation:
          profile.temperatureApplicability.kind ===
            "not-modeled"
            ? profile
                .temperatureApplicability
                .evidence
            : [],
        chargeCompleteness:
          input.accumulatedCharge
            .componentEvidence
            .completeness
      }
    },
    "sensor-camera-saturation-capacity-assessment",
    "1.0.0",
    [
      "The camera saturation capacity is a measured/calibrated dark-corrected photo-signal capacity in electron-equivalent signal units; total stored charge is deliberately not used for this comparison.",
      "Physical charge-storage capacity is a separate sensor property and is not used by this assessment.",
      "The camera saturation capacity may be limited by a downstream camera stage before physical pixel storage is full; this contract does not infer which analog or digital stage is limiting.",
      "The operating-state identifier is an exact calibration-state key covering the source-specific camera/readout configuration; Photivra does not infer equivalence from ISO, gain or bit-depth labels.",
      "A channel-population mean applied to one site or unmodeled temperature dependence remains an explicit approximation.",
      "Expected photo signal below the measured capacity does not establish the actual stochastic saturation state; no saturation probability is calculated.",
      "No signal clamp, analog clipping transfer, ADC maximum code, RAW code or post-saturation output is calculated.",
      "Dark and other stored charge remain diagnostics for physical storage accounting and are not silently added to a dark-corrected camera-signal capacity.",
      "Capacity and photo-signal uncertainties are not propagated into a saturation probability or confidence interval by this version."
    ]
  );
}
