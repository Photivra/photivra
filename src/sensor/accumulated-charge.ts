// SPDX-License-Identifier: Apache-2.0

import {
  approximationResult,
  calculatedResult,
  type CalculationResult
} from "../core/calculation-result.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";
import {
  parseEvidenceList,
  type EvidenceProvenance
} from "../core/evidence-provenance.js";
import { InvalidScientificInputError } from "../core/validation.js";
import type {
  SensorEqeExposureIntegration
} from "./constant-rate-temporal-integration.js";
import type {
  SensorDarkCurrentCharge
} from "./dark-current.js";
import type {
  SensorSpectralResponseScientificStatus,
  SensorSpectralResponseUncertainty
} from "./spectral-response.js";

type UnknownRecord = Record<string, unknown>;

export type SensorAdditionalStoredChargeKind =
  | "hot-pixel-defect-excess"
  | "leakage"
  | "charge-injection"
  | "clock-induced-charge"
  | "other";

export interface SensorAdditionalStoredChargeComponent {
  componentId: string;
  kind:
    SensorAdditionalStoredChargeKind;
  colorSamplingProfileId: string;
  channelId: string;
  site: {
    x: number;
    y: number;
  };
  bindingId: string;
  timeReference:
    "first-opening-boundary-phase";
  startOffsetSecondsFromOpeningReference:
    number;
  endOffsetSecondsFromOpeningReference:
    number;
  accountingMeaning:
    "incremental-stored-electrons-beyond-photo-and-modeled-dark-current";
  expectedElectronCount: number;
  scientificStatus:
    SensorSpectralResponseScientificStatus;
  uncertainty:
    SensorSpectralResponseUncertainty;
  evidence:
    readonly EvidenceProvenance[];
}

export interface SensorAccumulatedChargeCompletenessProfile {
  schemaVersion: "0.1.0";
  profileId: string;
  colorSamplingProfileId: string;
  channelId: string;
  site: {
    x: number;
    y: number;
  };
  bindingId: string;
  timeReference:
    "first-opening-boundary-phase";
  startOffsetSecondsFromOpeningReference:
    number;
  endOffsetSecondsFromOpeningReference:
    number;
  darkCurrentProfileId: string;
  includedAdditionalComponentIds:
    readonly string[];
  coverageMeaning:
    "all-material-stored-electron-contributors-accounted-for";
  scientificStatus:
    SensorSpectralResponseScientificStatus;
  evidence:
    readonly EvidenceProvenance[];
  limitation?: string;
}

export interface ComposeSensorAccumulatedChargeInput {
  photoSignal:
    SensorEqeExposureIntegration;
  darkCharge:
    SensorDarkCurrentCharge;
  additionalChargeComponents?:
    readonly SensorAdditionalStoredChargeComponent[];
  completenessProfile:
    SensorAccumulatedChargeCompletenessProfile;
}

export interface SensorAccumulatedChargeComposition {
  completenessProfileId: string;
  colorSamplingProfileId: string;
  channelId: string;
  site: {
    x: number;
    y: number;
  };
  bindingId: string;
  timeReference:
    "first-opening-boundary-phase";
  startOffsetSecondsFromOpeningReference:
    number;
  endOffsetSecondsFromOpeningReference:
    number;
  localExposureDurationSeconds:
    number;
  photoExpectedElectronCount:
    number;
  darkExpectedElectronCount:
    number;
  additionalExpectedElectronCount:
    number;
  totalExpectedStoredElectronCount:
    number;
  additionalComponents:
    readonly {
      componentId: string;
      kind:
        SensorAdditionalStoredChargeKind;
      expectedElectronCount: number;
      scientificStatus:
        SensorSpectralResponseScientificStatus;
      uncertainty:
        SensorSpectralResponseUncertainty;
      evidence:
        readonly EvidenceProvenance[];
    }[];
  accumulatedChargeCompleteness:
    "complete-for-physical-storage-capacity-assessment";
  completenessScientificStatus:
    SensorSpectralResponseScientificStatus;
  allCountsAreExpectationValues: true;
  integerChargeSampled: false;
  photoSignalIncluded: true;
  darkChargeIncluded: true;
  otherChargeIncluded: boolean;
  darkShotNoiseApplied: false;
  photoShotNoiseApplied: false;
  readNoiseApplied: false;
  physicalFullWellAssessmentAuthorized:
    true;
  cameraSaturationAssessmentAuthorized:
    false;
  saturationAssessed: false;
  bloomingModeled: false;
  adcQuantizationApplied: false;
  rawCodeValueProduced: false;
  componentEvidence: {
    completeness:
      readonly EvidenceProvenance[];
    photoSignal:
      SensorEqeExposureIntegration["componentEvidence"];
    darkCurrent:
      SensorDarkCurrentCharge["componentEvidence"];
  };
}

interface CompensatedSum {
  sum: number;
  correction: number;
}

function addCompensated(
  state: CompensatedSum,
  value: number
): void {
  const adjusted =
    value - state.correction;
  const next =
    state.sum + adjusted;
  state.correction =
    (next - state.sum) - adjusted;
  state.sum = next;
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

function requireNonNegativeFinite(
  value: unknown,
  path: string
): number {
  const parsed =
    requireFinite(value, path);
  if (parsed < 0) {
    throw new InvalidConfigurationError(
      path +
        " must be greater than or equal to zero."
    );
  }
  return parsed;
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
  const record =
    requireRecord(value, path);

  if (record.kind === "relative") {
    const fraction =
      requireNonNegativeFinite(
        record.fraction,
        path + ".fraction"
      );
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

function parseStatus(
  value: unknown,
  path: string
): SensorSpectralResponseScientificStatus {
  if (
    value !== "calibrated" &&
    value !== "approximation"
  ) {
    throw new InvalidConfigurationError(
      path + " is invalid."
    );
  }
  return value;
}

function parseWindowIdentity(
  record: UnknownRecord,
  path: string
): {
  bindingId: string;
  timeReference:
    "first-opening-boundary-phase";
  start:
    number;
  end:
    number;
} {
  if (
    record.timeReference !==
      "first-opening-boundary-phase"
  ) {
    throw new InvalidConfigurationError(
      path +
        '.timeReference must be "first-opening-boundary-phase".'
    );
  }
  const start =
    requireFinite(
      record.startOffsetSecondsFromOpeningReference,
      path +
        ".startOffsetSecondsFromOpeningReference"
    );
  const end =
    requireFinite(
      record.endOffsetSecondsFromOpeningReference,
      path +
        ".endOffsetSecondsFromOpeningReference"
    );
  if (!(end > start)) {
    throw new InvalidConfigurationError(
      path +
        " exposure window end must be greater than start."
    );
  }
  return {
    bindingId:
      requireNonEmptyString(
        record.bindingId,
        path + ".bindingId"
      ),
    timeReference:
      "first-opening-boundary-phase",
    start,
    end
  };
}

export function parseSensorAdditionalStoredChargeComponent(
  value: unknown
): SensorAdditionalStoredChargeComponent {
  const record = requireRecord(
    value,
    "sensorAdditionalStoredCharge"
  );

  const kinds =
    new Set<SensorAdditionalStoredChargeKind>([
      "hot-pixel-defect-excess",
      "leakage",
      "charge-injection",
      "clock-induced-charge",
      "other"
    ]);
  if (
    typeof record.kind !== "string" ||
    !kinds.has(
      record.kind as
        SensorAdditionalStoredChargeKind
    )
  ) {
    throw new InvalidConfigurationError(
      "sensorAdditionalStoredCharge.kind is invalid."
    );
  }
  if (
    record.accountingMeaning !==
      "incremental-stored-electrons-beyond-photo-and-modeled-dark-current"
  ) {
    throw new InvalidConfigurationError(
      "sensorAdditionalStoredCharge.accountingMeaning is invalid."
    );
  }

  const site = requireRecord(
    record.site,
    "sensorAdditionalStoredCharge.site"
  );
  const window =
    parseWindowIdentity(
      record,
      "sensorAdditionalStoredCharge"
    );
  const scientificStatus =
    parseStatus(
      record.scientificStatus,
      "sensorAdditionalStoredCharge.scientificStatus"
    );
  const uncertainty =
    parseUncertainty(
      record.uncertainty,
      "sensorAdditionalStoredCharge.uncertainty"
    );
  if (
    scientificStatus === "calibrated" &&
    uncertainty.kind ===
      "not-quantified"
  ) {
    throw new InvalidConfigurationError(
      "A calibrated additional stored-charge component must declare quantified relative uncertainty."
    );
  }

  return {
    componentId:
      requireNonEmptyString(
        record.componentId,
        "sensorAdditionalStoredCharge.componentId"
      ),
    kind:
      record.kind as
        SensorAdditionalStoredChargeKind,
    colorSamplingProfileId:
      requireNonEmptyString(
        record.colorSamplingProfileId,
        "sensorAdditionalStoredCharge.colorSamplingProfileId"
      ),
    channelId:
      requireNonEmptyString(
        record.channelId,
        "sensorAdditionalStoredCharge.channelId"
      ),
    site: {
      x: requireSiteIndex(
        site.x,
        "sensorAdditionalStoredCharge.site.x"
      ),
      y: requireSiteIndex(
        site.y,
        "sensorAdditionalStoredCharge.site.y"
      )
    },
    bindingId: window.bindingId,
    timeReference:
      window.timeReference,
    startOffsetSecondsFromOpeningReference:
      window.start,
    endOffsetSecondsFromOpeningReference:
      window.end,
    accountingMeaning:
      "incremental-stored-electrons-beyond-photo-and-modeled-dark-current",
    expectedElectronCount:
      requireNonNegativeFinite(
        record.expectedElectronCount,
        "sensorAdditionalStoredCharge.expectedElectronCount"
      ),
    scientificStatus,
    uncertainty,
    evidence: parseEvidenceList(
      record.evidence,
      "sensorAdditionalStoredCharge.evidence"
    )
  };
}

export function parseSensorAccumulatedChargeCompletenessProfile(
  value: unknown
): SensorAccumulatedChargeCompletenessProfile {
  const record = requireRecord(
    value,
    "sensorAccumulatedChargeCompleteness"
  );
  if (
    record.schemaVersion !== "0.1.0"
  ) {
    throw new InvalidConfigurationError(
      'sensorAccumulatedChargeCompleteness.schemaVersion must be "0.1.0".'
    );
  }
  if (
    record.coverageMeaning !==
      "all-material-stored-electron-contributors-accounted-for"
  ) {
    throw new InvalidConfigurationError(
      "sensorAccumulatedChargeCompleteness.coverageMeaning is invalid."
    );
  }

  const site = requireRecord(
    record.site,
    "sensorAccumulatedChargeCompleteness.site"
  );
  const window =
    parseWindowIdentity(
      record,
      "sensorAccumulatedChargeCompleteness"
    );
  const scientificStatus =
    parseStatus(
      record.scientificStatus,
      "sensorAccumulatedChargeCompleteness.scientificStatus"
    );
  const limitation =
    record.limitation === undefined
      ? undefined
      : requireNonEmptyString(
          record.limitation,
          "sensorAccumulatedChargeCompleteness.limitation"
        );
  if (
    scientificStatus === "approximation" &&
    limitation === undefined
  ) {
    throw new InvalidConfigurationError(
      "sensorAccumulatedChargeCompleteness.limitation is required for an approximation."
    );
  }
  if (
    !Array.isArray(
      record.includedAdditionalComponentIds
    )
  ) {
    throw new InvalidConfigurationError(
      "sensorAccumulatedChargeCompleteness.includedAdditionalComponentIds must be an array."
    );
  }

  const ids =
    record.includedAdditionalComponentIds.map(
      (entry, index) =>
        requireNonEmptyString(
          entry,
          "sensorAccumulatedChargeCompleteness.includedAdditionalComponentIds[" +
            index +
            "]"
        )
    );
  if (
    new Set(ids).size !== ids.length
  ) {
    throw new InvalidConfigurationError(
      "sensorAccumulatedChargeCompleteness.includedAdditionalComponentIds must not contain duplicates."
    );
  }

  return {
    schemaVersion: "0.1.0",
    profileId:
      requireNonEmptyString(
        record.profileId,
        "sensorAccumulatedChargeCompleteness.profileId"
      ),
    colorSamplingProfileId:
      requireNonEmptyString(
        record.colorSamplingProfileId,
        "sensorAccumulatedChargeCompleteness.colorSamplingProfileId"
      ),
    channelId:
      requireNonEmptyString(
        record.channelId,
        "sensorAccumulatedChargeCompleteness.channelId"
      ),
    site: {
      x: requireSiteIndex(
        site.x,
        "sensorAccumulatedChargeCompleteness.site.x"
      ),
      y: requireSiteIndex(
        site.y,
        "sensorAccumulatedChargeCompleteness.site.y"
      )
    },
    bindingId: window.bindingId,
    timeReference:
      window.timeReference,
    startOffsetSecondsFromOpeningReference:
      window.start,
    endOffsetSecondsFromOpeningReference:
      window.end,
    darkCurrentProfileId:
      requireNonEmptyString(
        record.darkCurrentProfileId,
        "sensorAccumulatedChargeCompleteness.darkCurrentProfileId"
      ),
    includedAdditionalComponentIds:
      [...ids].sort(),
    coverageMeaning:
      "all-material-stored-electron-contributors-accounted-for",
    scientificStatus,
    evidence: parseEvidenceList(
      record.evidence,
      "sensorAccumulatedChargeCompleteness.evidence"
    ),
    ...(limitation === undefined
      ? {}
      : { limitation })
  };
}

function sameSite(
  a: { x: number; y: number },
  b: { x: number; y: number }
): boolean {
  return a.x === b.x && a.y === b.y;
}

function sameWindow(
  startA: number,
  endA: number,
  startB: number,
  endB: number
): boolean {
  return (
    startA === startB &&
    endA === endB
  );
}

function validatePhoto(
  photo:
    SensorEqeExposureIntegration
): void {
  if (
    photo.kind !==
      "eqe-expected-counts" ||
    photo.temporalIntegrationApplied !==
      true ||
    photo.accumulatedSignalCompleteness !==
      "photo-signal-only" ||
    photo.darkChargeIncluded !== false ||
    photo.otherChargeIncluded !== false ||
    photo
      .physicalFullWellAssessmentAuthorized !==
      false
  ) {
    throw new InvalidScientificInputError(
      "Charge composition requires an unmodified photo-signal-only EQE exposure result."
    );
  }
  if (
    !Number.isFinite(
      photo
        .expectedGeneratedElectronCount
    ) ||
    photo
      .expectedGeneratedElectronCount < 0
  ) {
    throw new InvalidScientificInputError(
      "Photo expected electron count must be finite and nonnegative."
    );
  }
}

function validateDarkBinding(
  photo:
    SensorEqeExposureIntegration,
  dark:
    SensorDarkCurrentCharge
): void {
  if (
    dark.colorSamplingProfileId !==
      photo.colorSamplingProfileId ||
    dark.channelId !==
      photo.channelId ||
    !sameSite(dark.site, photo.site) ||
    dark.bindingId !==
      photo.bindingId ||
    dark.stationarityProfileId !==
      photo.stationarityProfileId ||
    dark.timeReference !==
      photo.timeReference ||
    !sameWindow(
      dark.startOffsetSecondsFromOpeningReference,
      dark.endOffsetSecondsFromOpeningReference,
      photo.startOffsetSecondsFromOpeningReference,
      photo.endOffsetSecondsFromOpeningReference
    ) ||
    dark.localExposureDurationSeconds !==
      photo.localExposureDurationSeconds ||
    dark.photoSignalIncluded !== false ||
    dark.otherChargeIncluded !== false ||
    dark
      .physicalFullWellAssessmentAuthorized !==
      false
  ) {
    throw new InvalidScientificInputError(
      "Dark charge must bind to the exact same uncombined EQE local exposure event."
    );
  }
  if (
    !Number.isFinite(
      dark.expectedDarkElectronCount
    ) ||
    dark.expectedDarkElectronCount < 0
  ) {
    throw new InvalidScientificInputError(
      "Dark expected electron count must be finite and nonnegative."
    );
  }
}

function validateComponentBinding(
  component:
    SensorAdditionalStoredChargeComponent,
  photo:
    SensorEqeExposureIntegration
): void {
  if (
    component.colorSamplingProfileId !==
      photo.colorSamplingProfileId ||
    component.channelId !==
      photo.channelId ||
    !sameSite(
      component.site,
      photo.site
    ) ||
    component.bindingId !==
      photo.bindingId ||
    component.timeReference !==
      photo.timeReference ||
    !sameWindow(
      component.startOffsetSecondsFromOpeningReference,
      component.endOffsetSecondsFromOpeningReference,
      photo.startOffsetSecondsFromOpeningReference,
      photo.endOffsetSecondsFromOpeningReference
    )
  ) {
    throw new InvalidScientificInputError(
      "Additional stored-charge component must bind to the exact same local exposure event."
    );
  }
}

export function composeSensorAccumulatedCharge(
  input:
    ComposeSensorAccumulatedChargeInput
): CalculationResult<SensorAccumulatedChargeComposition> {
  validatePhoto(input.photoSignal);
  validateDarkBinding(
    input.photoSignal,
    input.darkCharge
  );
  const profile =
    parseSensorAccumulatedChargeCompletenessProfile(
      input.completenessProfile
    );
  const components =
    (
      input.additionalChargeComponents ??
      []
    ).map(
      parseSensorAdditionalStoredChargeComponent
    );

  if (
    profile.colorSamplingProfileId !==
      input.photoSignal
        .colorSamplingProfileId ||
    profile.channelId !==
      input.photoSignal.channelId ||
    !sameSite(
      profile.site,
      input.photoSignal.site
    ) ||
    profile.bindingId !==
      input.photoSignal.bindingId ||
    profile.timeReference !==
      input.photoSignal.timeReference ||
    !sameWindow(
      profile.startOffsetSecondsFromOpeningReference,
      profile.endOffsetSecondsFromOpeningReference,
      input.photoSignal.startOffsetSecondsFromOpeningReference,
      input.photoSignal.endOffsetSecondsFromOpeningReference
    ) ||
    profile.darkCurrentProfileId !==
      input.darkCharge
        .darkCurrentProfileId
  ) {
    throw new InvalidScientificInputError(
      "Charge-completeness profile must bind to the exact photo/dark exposure pipeline."
    );
  }

  const seen =
    new Set<string>();
  for (const component of components) {
    validateComponentBinding(
      component,
      input.photoSignal
    );
    if (
      seen.has(component.componentId)
    ) {
      throw new InvalidScientificInputError(
        "Additional stored-charge component IDs must be unique."
      );
    }
    seen.add(component.componentId);
  }

  const actualIds =
    [...seen].sort();
  if (
    JSON.stringify(actualIds) !==
    JSON.stringify(
      profile
        .includedAdditionalComponentIds
    )
  ) {
    throw new InvalidScientificInputError(
      "Charge-completeness profile additional component IDs must exactly match the supplied components."
    );
  }

  const sum: CompensatedSum = {
    sum: 0,
    correction: 0
  };
  addCompensated(
    sum,
    input.photoSignal
      .expectedGeneratedElectronCount
  );
  addCompensated(
    sum,
    input.darkCharge
      .expectedDarkElectronCount
  );

  let additionalTotal = 0;
  for (const component of components) {
    additionalTotal +=
      component.expectedElectronCount;
    addCompensated(
      sum,
      component.expectedElectronCount
    );
  }

  if (
    !Number.isFinite(
      additionalTotal
    ) ||
    !Number.isFinite(sum.sum) ||
    sum.sum < 0
  ) {
    throw new InvalidScientificInputError(
      "Accumulated stored-electron totals must remain finite and nonnegative."
    );
  }

  const result:
    SensorAccumulatedChargeComposition = {
      completenessProfileId:
        profile.profileId,
      colorSamplingProfileId:
        input.photoSignal
          .colorSamplingProfileId,
      channelId:
        input.photoSignal.channelId,
      site: {
        ...input.photoSignal.site
      },
      bindingId:
        input.photoSignal.bindingId,
      timeReference:
        input.photoSignal.timeReference,
      startOffsetSecondsFromOpeningReference:
        input.photoSignal
          .startOffsetSecondsFromOpeningReference,
      endOffsetSecondsFromOpeningReference:
        input.photoSignal
          .endOffsetSecondsFromOpeningReference,
      localExposureDurationSeconds:
        input.photoSignal
          .localExposureDurationSeconds,
      photoExpectedElectronCount:
        input.photoSignal
          .expectedGeneratedElectronCount,
      darkExpectedElectronCount:
        input.darkCharge
          .expectedDarkElectronCount,
      additionalExpectedElectronCount:
        additionalTotal,
      totalExpectedStoredElectronCount:
        sum.sum,
      additionalComponents:
        components.map(
          (component) => ({
            componentId:
              component.componentId,
            kind: component.kind,
            expectedElectronCount:
              component.expectedElectronCount,
            scientificStatus:
              component.scientificStatus,
            uncertainty:
              component.uncertainty,
            evidence:
              component.evidence
          })
        ),
      accumulatedChargeCompleteness:
        "complete-for-physical-storage-capacity-assessment",
      completenessScientificStatus:
        profile.scientificStatus,
      allCountsAreExpectationValues:
        true,
      integerChargeSampled: false,
      photoSignalIncluded: true,
      darkChargeIncluded: true,
      otherChargeIncluded:
        components.length > 0,
      darkShotNoiseApplied: false,
      photoShotNoiseApplied: false,
      readNoiseApplied: false,
      physicalFullWellAssessmentAuthorized:
        true,
      cameraSaturationAssessmentAuthorized:
        false,
      saturationAssessed: false,
      bloomingModeled: false,
      adcQuantizationApplied:
        false,
      rawCodeValueProduced: false,
      componentEvidence: {
        completeness:
          profile.evidence,
        photoSignal:
          input.photoSignal
            .componentEvidence,
        darkCurrent:
          input.darkCharge
            .componentEvidence
      }
    };

  const assumptions = [
    "Stored-electron accounting is bound to one exact EQE local exposure event; equal duration alone is insufficient.",
    "Photo-signal expected electrons and thermally generated dark electrons are separate terms.",
    "Every additional component must declare itself incremental beyond both modeled photo signal and modeled dark current to avoid silent double counting.",
    "The completeness profile is an evidence-backed scientific assertion that all material stored-electron contributors for physical charge-capacity assessment are accounted for; it is not inferred from an empty additional-component list.",
    "All values remain expectation counts. Photo/dark shot noise, read noise and stochastic integer sampling are not applied.",
    "Physical full-well assessment becomes structurally authorized, but no saturation or blooming behavior is calculated by this composition.",
    "Camera/digital saturation remains a separate response-chain property and is not authorized by physical charge completeness.",
    "A/W current/charge results remain outside this stored-electron composition until a separate carrier/storage mapping exists."
  ];

  return profile.scientificStatus ===
    "calibrated"
    ? calculatedResult(
        result,
        "sensor-accumulated-charge-composition",
        "1.0.0",
        assumptions
      )
    : approximationResult(
        result,
        "sensor-accumulated-charge-composition",
        "1.0.0",
        [
          ...assumptions,
          profile.limitation!
        ]
      );
}
