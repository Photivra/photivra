// SPDX-License-Identifier: Apache-2.0

import {
  approximationResult,
  type CalculationResult
} from "../core/calculation-result.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";
import {
  parseEvidenceList,
  type EvidenceBackedFact,
  type EvidenceProvenance
} from "../core/evidence-provenance.js";
import { InvalidScientificInputError } from "../core/validation.js";
import type {
  SensorPhotoAccumulatedChargeComposition as SensorAccumulatedChargeComposition
} from "./accumulated-charge.js";
import type {
  SensorPhysicalChargeCapacityAssessment
} from "./physical-charge-capacity.js";
import type {
  SensorSpectralResponseScientificStatus
} from "./spectral-response.js";

type UnknownRecord = Record<string, unknown>;

export const SENSOR_CHARGE_SAMPLING_PROFILE_SCHEMA_VERSION =
  "0.1.0" as const;
export const SENSOR_READOUT_CONVERSION_PROFILE_SCHEMA_VERSION =
  "0.1.0" as const;

export type SensorAdditionalChargeSamplingModel =
  | "poisson"
  | "deterministic-expected-electron-equivalent";

export interface SensorAdditionalChargeSamplingPolicy {
  componentId: string;
  model:
    SensorAdditionalChargeSamplingModel;
}

export interface SensorChargeSamplingProfile {
  schemaVersion:
    typeof SENSOR_CHARGE_SAMPLING_PROFILE_SCHEMA_VERSION;
  profileId: string;
  completenessProfileId: string;
  scientificStatus: "approximation";
  photoShotNoiseModel: "poisson";
  darkShotNoiseModel: "poisson";
  additionalComponentPolicies:
    readonly SensorAdditionalChargeSamplingPolicy[];
  evidence:
    readonly EvidenceProvenance[];
  limitations: readonly string[];
}

export interface SimulateSensorChargeRealizationInput {
  accumulatedCharge:
    SensorAccumulatedChargeComposition;
  samplingProfile:
    SensorChargeSamplingProfile;
  seedUint32: number;
}

export interface SensorChargeRealization {
  samplingProfileId: string;
  completenessProfileId: string;
  colorSamplingProfileId: string;
  channelId: string;
  site: {
    x: number;
    y: number;
  };
  bindingId: string;
  seedUint32: number;
  photoExpectedElectronCount: number;
  photoRealizedElectronCount: number;
  darkExpectedElectronCount: number;
  darkRealizedElectronCount: number;
  additionalComponents:
    readonly {
      componentId: string;
      expectedElectronCount: number;
      realizedElectronEquivalentCount:
        number;
      model:
        SensorAdditionalChargeSamplingModel;
    }[];
  totalExpectedStoredElectronCount:
    number;
  totalRealizedStoredElectronEquivalentCount:
    number;
  photoShotNoiseApplied: true;
  darkShotNoiseApplied: true;
  electronicReadNoiseApplied: false;
  physicalSaturationApplied: false;
  bloomingModeled: false;
  conversionGainApplied: false;
  adcQuantizationApplied: false;
  rawCodeValueProduced: false;
  stochasticModel:
    "independent-poisson-photo-dark-explicit-additional-policy";
  deterministicSeededRealization:
    true;
}

export interface SensorElectronicReadNoiseComponent {
  componentId: string;
  rmsElectrons:
    EvidenceBackedFact<number>;
  evidence:
    readonly EvidenceProvenance[];
}

export interface SensorReadoutConversionRegime {
  regimeId: string;
  scientificStatus:
    SensorSpectralResponseScientificStatus;
  systemConversionGainElectronsPerCode:
    EvidenceBackedFact<number>;
  preAdcSaturationElectronEquivalent:
    EvidenceBackedFact<number>;
  readNoiseComponents:
    readonly SensorElectronicReadNoiseComponent[];
  adc: {
    bitDepth: number;
    blackLevelCode: number;
    digitalSaturationCode: number;
    transfer:
      "uniform-round-half-up";
  };
  evidence:
    readonly EvidenceProvenance[];
  limitations: readonly string[];
}

export interface SensorReadoutConversionProfile {
  schemaVersion:
    typeof SENSOR_READOUT_CONVERSION_PROFILE_SCHEMA_VERSION;
  profileId: string;
  colorSamplingProfileId: string;
  channelId: string;
  regimes:
    readonly SensorReadoutConversionRegime[];
  regimeSelectionOwnedBy:
    "explicit-upstream-camera-state-not-inferred-from-iso";
  evidence:
    readonly EvidenceProvenance[];
}

export interface ResolveSensorReadoutRegimeInput {
  profile:
    SensorReadoutConversionProfile;
  regimeId: string;
}

export interface ResolvedSensorReadoutRegime {
  profileId: string;
  colorSamplingProfileId: string;
  channelId: string;
  regime:
    SensorReadoutConversionRegime;
  regimeSelectionOwnedBy:
    "explicit-upstream-camera-state-not-inferred-from-iso";
  adcMaximumCode: number;
  combinedReadNoiseRmsElectrons:
    number;
}

export interface CalculateExpectedSensorReadoutInput {
  accumulatedCharge:
    SensorAccumulatedChargeComposition;
  physicalCapacityAssessment:
    SensorPhysicalChargeCapacityAssessment;
  readoutProfile:
    SensorReadoutConversionProfile;
  regimeId: string;
}

export interface SensorExpectedReadoutSignal {
  readoutProfileId: string;
  regimeId: string;
  completenessProfileId: string;
  capacityProfileId: string;
  colorSamplingProfileId: string;
  channelId: string;
  site: {
    x: number;
    y: number;
  };
  bindingId: string;
  expectedStoredElectronCount:
    number;
  expectedStoredChargeBelowOrAtPhysicalCapacity:
    true;
  expectedElectronEquivalentAfterPreAdcSaturation:
    number;
  preAdcSaturationAppliedToExpectation:
    boolean;
  systemConversionGainElectronsPerCode:
    number;
  expectedCodeBeforeBlackOffset:
    number;
  blackLevelCode: number;
  expectedCodeBeforeQuantization:
    number;
  adcBitDepth: number;
  adcMaximumCode: number;
  digitalSaturationCode: number;
  expectedDigitalSaturation:
    boolean;
  electronicReadNoiseMeanElectrons:
    0;
  electronicReadNoiseRmsElectrons:
    number;
  electronicReadNoiseSampled: false;
  adcQuantizationApplied: false;
  rawCodeValueProduced: false;
  isoUsedToInferRegime: false;
}

export interface SimulateSensorRawCodeInput {
  chargeRealization:
    SensorChargeRealization;
  physicalCapacityAssessment:
    SensorPhysicalChargeCapacityAssessment;
  readoutProfile:
    SensorReadoutConversionProfile;
  regimeId: string;
  readNoiseSeedUint32: number;
}

export interface SensorRawCodeSample {
  readoutProfileId: string;
  regimeId: string;
  samplingProfileId: string;
  completenessProfileId: string;
  capacityProfileId: string;
  colorSamplingProfileId: string;
  channelId: string;
  site: {
    x: number;
    y: number;
  };
  bindingId: string;
  chargeSeedUint32: number;
  readNoiseSeedUint32: number;
  realizedStoredElectronEquivalentCountBeforePhysicalCapacity:
    number;
  physicalChargeCapacityElectrons:
    number;
  electronEquivalentAfterPhysicalScalarSaturation:
    number;
  physicalScalarSaturationApplied:
    boolean;
  overflowElectronEquivalentDiagnostic:
    number;
  bloomingModeled: false;
  electronicReadNoiseComponents:
    readonly {
      componentId: string;
      rmsElectrons: number;
      sampledElectrons: number;
    }[];
  totalElectronicReadNoiseElectrons:
    number;
  electronEquivalentAfterReadNoise:
    number;
  preAdcSaturationElectronEquivalent:
    number;
  /** Signed electronic signal after upper saturation, before conversion/pedestal. */
  electronEquivalentAfterPreAdcSaturation:
    number;
  preAdcSaturationApplied:
    boolean;
  systemConversionGainElectronsPerCode:
    number;
  blackLevelCode: number;
  codeBeforeQuantization:
    number;
  quantizedCodeBeforeDigitalClamp:
    number;
  adcBitDepth: number;
  adcMaximumCode: number;
  digitalSaturationCode: number;
  rawCode: number;
  digitalSaturationApplied:
    boolean;
  lowerCodeClampApplied:
    boolean;
  adcTransfer:
    "uniform-round-half-up";
  physicalSaturationApplied: boolean;
  electronicReadNoiseApplied:
    boolean;
  conversionGainApplied: true;
  adcQuantizationApplied: true;
  rawCodeValueProduced: true;
  isoUsedToInferRegime: false;
  deterministicSeededRealization:
    true;
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

function requirePositiveFinite(
  value: unknown,
  path: string
): number {
  const parsed =
    requireFinite(value, path);
  if (parsed <= 0) {
    throw new InvalidConfigurationError(
      path +
        " must be greater than zero."
    );
  }
  return parsed;
}

function requireUint32(
  value: unknown,
  path: string
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 0xffff_ffff
  ) {
    throw new InvalidScientificInputError(
      path +
        " must be an unsigned 32-bit integer."
    );
  }
  return value;
}

function requireSafeInteger(
  value: unknown,
  path: string
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value)
  ) {
    throw new InvalidConfigurationError(
      path + " must be a safe integer."
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

function parsePositiveFact(
  value: unknown,
  path: string
): EvidenceBackedFact<number> {
  const record =
    requireRecord(value, path);
  return {
    value:
      requirePositiveFinite(
        record.value,
        path + ".value"
      ),
    evidence:
      parseEvidenceList(
        record.evidence,
        path + ".evidence"
      )
  };
}

function parseNonNegativeFact(
  value: unknown,
  path: string
): EvidenceBackedFact<number> {
  const record =
    requireRecord(value, path);
  return {
    value:
      requireNonNegativeFinite(
        record.value,
        path + ".value"
      ),
    evidence:
      parseEvidenceList(
        record.evidence,
        path + ".evidence"
      )
  };
}

export function parseSensorChargeSamplingProfile(
  value: unknown
): SensorChargeSamplingProfile {
  const record =
    requireRecord(
      value,
      "sensorChargeSamplingProfile"
    );

  if (
    record.schemaVersion !==
    SENSOR_CHARGE_SAMPLING_PROFILE_SCHEMA_VERSION
  ) {
    throw new InvalidConfigurationError(
      'sensorChargeSamplingProfile.schemaVersion must be "' +
        SENSOR_CHARGE_SAMPLING_PROFILE_SCHEMA_VERSION +
        '".'
    );
  }
  if (
    record.scientificStatus !==
    "approximation"
  ) {
    throw new InvalidConfigurationError(
      'sensorChargeSamplingProfile.scientificStatus must be "approximation".'
    );
  }
  if (
    record.photoShotNoiseModel !==
      "poisson" ||
    record.darkShotNoiseModel !==
      "poisson"
  ) {
    throw new InvalidConfigurationError(
      "sensorChargeSamplingProfile photo/dark shot-noise models must be Poisson."
    );
  }
  if (
    !Array.isArray(
      record.additionalComponentPolicies
    )
  ) {
    throw new InvalidConfigurationError(
      "sensorChargeSamplingProfile.additionalComponentPolicies must be an array."
    );
  }

  const additionalComponentPolicies =
    record.additionalComponentPolicies.map(
      (entry, index) => {
        const path =
          "sensorChargeSamplingProfile.additionalComponentPolicies[" +
          index +
          "]";
        const policy =
          requireRecord(
            entry,
            path
          );
        if (
          policy.model !==
            "poisson" &&
          policy.model !==
            "deterministic-expected-electron-equivalent"
        ) {
          throw new InvalidConfigurationError(
            path +
              ".model is invalid."
          );
        }
        return {
          componentId:
            requireNonEmptyString(
              policy.componentId,
              path +
                ".componentId"
            ),
          model:
            policy.model
        } as SensorAdditionalChargeSamplingPolicy;
      }
    );

  const ids =
    additionalComponentPolicies.map(
      (policy) =>
        policy.componentId
    );
  if (
    new Set(ids).size !==
    ids.length
  ) {
    throw new InvalidConfigurationError(
      "sensorChargeSamplingProfile.additionalComponentPolicies must not contain duplicate componentId values."
    );
  }

  return {
    schemaVersion:
      SENSOR_CHARGE_SAMPLING_PROFILE_SCHEMA_VERSION,
    profileId:
      requireNonEmptyString(
        record.profileId,
        "sensorChargeSamplingProfile.profileId"
      ),
    completenessProfileId:
      requireNonEmptyString(
        record.completenessProfileId,
        "sensorChargeSamplingProfile.completenessProfileId"
      ),
    scientificStatus:
      "approximation",
    photoShotNoiseModel:
      "poisson",
    darkShotNoiseModel:
      "poisson",
    additionalComponentPolicies,
    evidence:
      parseEvidenceList(
        record.evidence,
        "sensorChargeSamplingProfile.evidence"
      ),
    limitations:
      parseLimitations(
        record.limitations,
        "sensorChargeSamplingProfile.limitations"
      )
  };
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

function parseReadNoiseComponent(
  value: unknown,
  path: string
): SensorElectronicReadNoiseComponent {
  const record =
    requireRecord(value, path);
  return {
    componentId:
      requireNonEmptyString(
        record.componentId,
        path + ".componentId"
      ),
    rmsElectrons:
      parseNonNegativeFact(
        record.rmsElectrons,
        path + ".rmsElectrons"
      ),
    evidence:
      parseEvidenceList(
        record.evidence,
        path + ".evidence"
      )
  };
}

function parseRegime(
  value: unknown,
  path: string
): SensorReadoutConversionRegime {
  const record =
    requireRecord(value, path);
  const adc =
    requireRecord(
      record.adc,
      path + ".adc"
    );
  const bitDepth =
    requireSafeInteger(
      adc.bitDepth,
      path + ".adc.bitDepth"
    );
  if (
    bitDepth < 1 ||
    bitDepth > 30
  ) {
    throw new InvalidConfigurationError(
      path +
        ".adc.bitDepth must be from 1 through 30."
    );
  }
  const adcMaximumCode =
    2 ** bitDepth - 1;
  const blackLevelCode =
    requireSafeInteger(
      adc.blackLevelCode,
      path + ".adc.blackLevelCode"
    );
  const digitalSaturationCode =
    requireSafeInteger(
      adc.digitalSaturationCode,
      path +
        ".adc.digitalSaturationCode"
    );

  if (
    blackLevelCode < 0 ||
    blackLevelCode >
      adcMaximumCode
  ) {
    throw new InvalidConfigurationError(
      path +
        ".adc.blackLevelCode must lie inside the unsigned ADC code range."
    );
  }
  if (
    digitalSaturationCode <=
      blackLevelCode ||
    digitalSaturationCode >
      adcMaximumCode
  ) {
    throw new InvalidConfigurationError(
      path +
        ".adc.digitalSaturationCode must be greater than blackLevelCode and at most the ADC maximum code."
    );
  }
  if (
    adc.transfer !==
    "uniform-round-half-up"
  ) {
    throw new InvalidConfigurationError(
      path +
        '.adc.transfer must be "uniform-round-half-up".'
    );
  }
  if (
    !Array.isArray(
      record.readNoiseComponents
    )
  ) {
    throw new InvalidConfigurationError(
      path +
        ".readNoiseComponents must be an array."
    );
  }
  const readNoiseComponents =
    record.readNoiseComponents.map(
      (entry, index) =>
        parseReadNoiseComponent(
          entry,
          path +
            ".readNoiseComponents[" +
            index +
            "]"
        )
    );
  const componentIds =
    readNoiseComponents.map(
      (entry) =>
        entry.componentId
    );
  if (
    new Set(componentIds).size !==
    componentIds.length
  ) {
    throw new InvalidConfigurationError(
      path +
        ".readNoiseComponents must not contain duplicate componentId values."
    );
  }

  return {
    regimeId:
      requireNonEmptyString(
        record.regimeId,
        path + ".regimeId"
      ),
    scientificStatus:
      parseStatus(
        record.scientificStatus,
        path +
          ".scientificStatus"
      ),
    systemConversionGainElectronsPerCode:
      parsePositiveFact(
        record
          .systemConversionGainElectronsPerCode,
        path +
          ".systemConversionGainElectronsPerCode"
      ),
    preAdcSaturationElectronEquivalent:
      parsePositiveFact(
        record
          .preAdcSaturationElectronEquivalent,
        path +
          ".preAdcSaturationElectronEquivalent"
      ),
    readNoiseComponents,
    adc: {
      bitDepth,
      blackLevelCode,
      digitalSaturationCode,
      transfer:
        "uniform-round-half-up"
    },
    evidence:
      parseEvidenceList(
        record.evidence,
        path + ".evidence"
      ),
    limitations:
      parseLimitations(
        record.limitations,
        path + ".limitations"
      )
  };
}

export function parseSensorReadoutConversionProfile(
  value: unknown
): SensorReadoutConversionProfile {
  const record =
    requireRecord(
      value,
      "sensorReadoutConversionProfile"
    );
  if (
    record.schemaVersion !==
    SENSOR_READOUT_CONVERSION_PROFILE_SCHEMA_VERSION
  ) {
    throw new InvalidConfigurationError(
      'sensorReadoutConversionProfile.schemaVersion must be "' +
        SENSOR_READOUT_CONVERSION_PROFILE_SCHEMA_VERSION +
        '".'
    );
  }
  if (
    record.regimeSelectionOwnedBy !==
    "explicit-upstream-camera-state-not-inferred-from-iso"
  ) {
    throw new InvalidConfigurationError(
      'sensorReadoutConversionProfile.regimeSelectionOwnedBy must be "explicit-upstream-camera-state-not-inferred-from-iso".'
    );
  }
  if (
    !Array.isArray(
      record.regimes
    ) ||
    record.regimes.length === 0
  ) {
    throw new InvalidConfigurationError(
      "sensorReadoutConversionProfile.regimes must be a non-empty array."
    );
  }
  const regimes =
    record.regimes.map(
      (entry, index) =>
        parseRegime(
          entry,
          "sensorReadoutConversionProfile.regimes[" +
            index +
            "]"
        )
    );
  const ids =
    regimes.map(
      (regime) =>
        regime.regimeId
    );
  if (
    new Set(ids).size !==
    ids.length
  ) {
    throw new InvalidConfigurationError(
      "sensorReadoutConversionProfile.regimes must not contain duplicate regimeId values."
    );
  }

  return {
    schemaVersion:
      SENSOR_READOUT_CONVERSION_PROFILE_SCHEMA_VERSION,
    profileId:
      requireNonEmptyString(
        record.profileId,
        "sensorReadoutConversionProfile.profileId"
      ),
    colorSamplingProfileId:
      requireNonEmptyString(
        record.colorSamplingProfileId,
        "sensorReadoutConversionProfile.colorSamplingProfileId"
      ),
    channelId:
      requireNonEmptyString(
        record.channelId,
        "sensorReadoutConversionProfile.channelId"
      ),
    regimes,
    regimeSelectionOwnedBy:
      "explicit-upstream-camera-state-not-inferred-from-iso",
    evidence:
      parseEvidenceList(
        record.evidence,
        "sensorReadoutConversionProfile.evidence"
      )
  };
}

export function resolveSensorReadoutRegime(
  input:
    ResolveSensorReadoutRegimeInput
): ResolvedSensorReadoutRegime {
  const profile =
    parseSensorReadoutConversionProfile(
      input.profile
    );
  if (
    typeof input.regimeId !==
      "string" ||
    input.regimeId.trim().length ===
      0
  ) {
    throw new InvalidScientificInputError(
      "regimeId must be a non-empty string."
    );
  }
  const regimeId =
    input.regimeId.trim();
  const regime =
    profile.regimes.find(
      (entry) =>
        entry.regimeId === regimeId
    );
  if (regime === undefined) {
    throw new InvalidScientificInputError(
      "regimeId is not declared by the sensor readout conversion profile."
    );
  }
  const combinedReadNoiseRmsElectrons =
    Math.sqrt(
      regime.readNoiseComponents.reduce(
        (sum, component) =>
          sum +
          component
            .rmsElectrons.value *
            component
              .rmsElectrons.value,
        0
      )
    );

  return {
    profileId:
      profile.profileId,
    colorSamplingProfileId:
      profile.colorSamplingProfileId,
    channelId:
      profile.channelId,
    regime,
    regimeSelectionOwnedBy:
      profile
        .regimeSelectionOwnedBy,
    adcMaximumCode:
      2 **
        regime.adc.bitDepth -
      1,
    combinedReadNoiseRmsElectrons
  };
}

function validateChargeIdentity(
  charge:
    SensorAccumulatedChargeComposition,
  capacity:
    SensorPhysicalChargeCapacityAssessment,
  readout:
    ResolvedSensorReadoutRegime
): void {
  if (
    charge.completenessProfileId !==
      capacity
        .completenessProfileId ||
    charge.colorSamplingProfileId !==
      capacity
        .colorSamplingProfileId ||
    charge.channelId !==
      capacity.channelId ||
    charge.site.x !==
      capacity.site.x ||
    charge.site.y !==
      capacity.site.y ||
    charge.bindingId !==
      capacity.bindingId
  ) {
    throw new InvalidScientificInputError(
      "Physical capacity assessment identity must match the accumulated charge."
    );
  }
  if (
    readout
      .colorSamplingProfileId !==
      charge.colorSamplingProfileId ||
    readout.channelId !==
      charge.channelId
  ) {
    throw new InvalidScientificInputError(
      "Sensor readout profile color/channel identity must match the accumulated charge."
    );
  }
  if (
    capacity
      .expectedChargeCapacityStatus ===
    "above-capacity"
  ) {
    throw new InvalidScientificInputError(
      "Expected stored charge above physical capacity cannot enter linear expected readout; the actual post-saturation stored charge is not defined by the upstream assessment."
    );
  }
  if (
    charge.saturationAssessed !==
      false ||
    charge.adcQuantizationApplied !==
      false ||
    charge.rawCodeValueProduced !==
      false
  ) {
    throw new InvalidScientificInputError(
      "Sensor readout requires the unmodified accumulated-charge result."
    );
  }
}

function additionalPolicyMap(
  profile:
    SensorChargeSamplingProfile,
  charge:
    SensorAccumulatedChargeComposition
): ReadonlyMap<
  string,
  SensorAdditionalChargeSamplingPolicy
> {
  if (
    profile.completenessProfileId !==
    charge.completenessProfileId
  ) {
    throw new InvalidScientificInputError(
      "Charge sampling profile completenessProfileId must match the accumulated charge."
    );
  }

  const chargeIds =
    charge.additionalComponents.map(
      (component) =>
        component.componentId
    ).sort();
  const policyIds =
    profile
      .additionalComponentPolicies
      .map(
        (policy) =>
          policy.componentId
      )
      .sort();

  if (
    chargeIds.length !==
      policyIds.length ||
    chargeIds.some(
      (id, index) =>
        id !== policyIds[index]
    )
  ) {
    throw new InvalidScientificInputError(
      "Charge sampling profile must declare exactly one policy for every accumulated additional-charge component."
    );
  }

  return new Map(
    profile.additionalComponentPolicies.map(
      (policy) => [
        policy.componentId,
        policy
      ] as const
    )
  );
}

interface DeterministicRandom {
  next(): number;
}

function createRandom(
  seedUint32: number
): DeterministicRandom {
  let state =
    (seedUint32 ^
      0x9e3779b9) >>>
    0;
  if (state === 0) {
    state =
      0x6d2b79f5;
  }

  return {
    next(): number {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      return (
        (state + 0.5) /
        0x1_0000_0000
      );
    }
  };
}

function logFactorial(
  n: number
): number {
  if (n < 2) {
    return 0;
  }
  if (n < 256) {
    let sum = 0;
    for (
      let value = 2;
      value <= n;
      value += 1
    ) {
      sum += Math.log(value);
    }
    return sum;
  }

  const inverse = 1 / n;
  const inverseCubed =
    inverse * inverse * inverse;
  return (
    (n + 0.5) * Math.log(n) -
    n +
    0.5 *
      Math.log(
        2 * Math.PI
      ) +
    inverse / 12 -
    inverseCubed / 360
  );
}

function samplePoisson(
  mean: number,
  random:
    DeterministicRandom
): number {
  if (
    !Number.isFinite(mean) ||
    mean < 0
  ) {
    throw new InvalidScientificInputError(
      "Poisson mean must be finite and nonnegative."
    );
  }
  if (mean === 0) {
    return 0;
  }

  if (mean < 30) {
    const threshold =
      Math.exp(-mean);
    let product = 1;
    let count = 0;
    do {
      count += 1;
      product *=
        random.next();
    } while (
      product > threshold
    );
    return count - 1;
  }

  const sqrtMean =
    Math.sqrt(mean);
  const b =
    0.931 +
    2.53 * sqrtMean;
  const a =
    -0.059 +
    0.02483 * b;
  const inverseAlpha =
    1.1239 +
    1.1328 /
      (b - 3.4);
  const vR =
    0.9277 -
    3.6224 /
      (b - 2);

  for (;;) {
    const u =
      random.next() - 0.5;
    const v =
      random.next();
    const uS =
      0.5 - Math.abs(u);
    if (uS <= 0) {
      continue;
    }
    const k =
      Math.floor(
        (2 * a / uS + b) *
          u +
          mean +
          0.43
      );

    if (
      uS >= 0.07 &&
      v <= vR &&
      k >= 0
    ) {
      return k;
    }
    if (
      k < 0 ||
      (
        uS < 0.013 &&
        v > uS
      )
    ) {
      continue;
    }

    const lhs =
      Math.log(
        v *
          inverseAlpha /
          (a /
            (uS * uS) +
            b)
      );
    const rhs =
      -mean +
      k * Math.log(mean) -
      logFactorial(k);

    if (lhs <= rhs) {
      return k;
    }
  }
}

function sampleStandardNormal(
  random:
    DeterministicRandom
): number {
  const u1 =
    random.next();
  const u2 =
    random.next();
  return (
    Math.sqrt(
      -2 * Math.log(u1)
    ) *
    Math.cos(
      2 * Math.PI * u2
    )
  );
}

export function simulateSensorChargeRealization(
  input:
    SimulateSensorChargeRealizationInput
): CalculationResult<SensorChargeRealization> {
  const profile =
    parseSensorChargeSamplingProfile(
      input.samplingProfile
    );
  const seed =
    requireUint32(
      input.seedUint32,
      "seedUint32"
    );
  const charge =
    input.accumulatedCharge;

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
      "Charge realization requires a complete unsaturated pre-readout accumulated-charge result."
    );
  }

  const policies =
    additionalPolicyMap(
      profile,
      charge
    );
  const random =
    createRandom(seed);
  const photoRealized =
    samplePoisson(
      charge
        .photoExpectedElectronCount,
      random
    );
  const darkRealized =
    samplePoisson(
      charge
        .darkExpectedElectronCount,
      random
    );

  const additionalComponents =
    charge.additionalComponents.map(
      (component) => {
        const policy =
          policies.get(
            component.componentId
          )!;
        const realized =
          policy.model ===
          "poisson"
            ? samplePoisson(
                component
                  .expectedElectronCount,
                random
              )
            : component
                .expectedElectronCount;
        return {
          componentId:
            component.componentId,
          expectedElectronCount:
            component
              .expectedElectronCount,
          realizedElectronEquivalentCount:
            realized,
          model:
            policy.model
        };
      }
    );

  const additionalRealized =
    additionalComponents.reduce(
      (sum, component) =>
        sum +
        component
          .realizedElectronEquivalentCount,
      0
    );
  const totalRealized =
    photoRealized +
    darkRealized +
    additionalRealized;

  if (
    !Number.isFinite(
      totalRealized
    ) ||
    totalRealized < 0
  ) {
    throw new InvalidScientificInputError(
      "Realized stored charge must remain finite and nonnegative."
    );
  }

  return approximationResult(
    {
      samplingProfileId:
        profile.profileId,
      completenessProfileId:
        charge
          .completenessProfileId,
      colorSamplingProfileId:
        charge
          .colorSamplingProfileId,
      channelId:
        charge.channelId,
      site: {
        ...charge.site
      },
      bindingId:
        charge.bindingId,
      seedUint32:
        seed,
      photoExpectedElectronCount:
        charge
          .photoExpectedElectronCount,
      photoRealizedElectronCount:
        photoRealized,
      darkExpectedElectronCount:
        charge
          .darkExpectedElectronCount,
      darkRealizedElectronCount:
        darkRealized,
      additionalComponents,
      totalExpectedStoredElectronCount:
        charge
          .totalExpectedStoredElectronCount,
      totalRealizedStoredElectronEquivalentCount:
        totalRealized,
      photoShotNoiseApplied:
        true,
      darkShotNoiseApplied:
        true,
      electronicReadNoiseApplied:
        false,
      physicalSaturationApplied:
        false,
      bloomingModeled: false,
      conversionGainApplied:
        false,
      adcQuantizationApplied:
        false,
      rawCodeValueProduced:
        false,
      stochasticModel:
        "independent-poisson-photo-dark-explicit-additional-policy",
      deterministicSeededRealization:
        true
    },
    "sensor-charge-stochastic-realization",
    "1.0.0",
    [
      "Photo-generated and dark-generated electron counts are sampled independently from Poisson distributions using an explicit deterministic seed.",
      "Each additional stored-charge component uses its explicitly declared Poisson or deterministic electron-equivalent policy; Photivra does not infer defect/leakage statistics from the component name.",
      "This is a pre-saturation, pre-electronic-read-noise charge realization and remains separate from expectation-value calculations.",
      "The seeded PRNG is a deterministic simulation mechanism and is not cryptographically secure."
    ]
  );
}

function validateCapacityAgainstRealization(
  charge:
    SensorChargeRealization,
  capacity:
    SensorPhysicalChargeCapacityAssessment,
  readout:
    ResolvedSensorReadoutRegime
): void {
  if (
    charge.completenessProfileId !==
      capacity
        .completenessProfileId ||
    charge.colorSamplingProfileId !==
      capacity
        .colorSamplingProfileId ||
    charge.channelId !==
      capacity.channelId ||
    charge.site.x !==
      capacity.site.x ||
    charge.site.y !==
      capacity.site.y ||
    charge.bindingId !==
      capacity.bindingId
  ) {
    throw new InvalidScientificInputError(
      "Physical capacity assessment identity must match the charge realization."
    );
  }
  if (
    readout
      .colorSamplingProfileId !==
      charge.colorSamplingProfileId ||
    readout.channelId !==
      charge.channelId
  ) {
    throw new InvalidScientificInputError(
      "Sensor readout profile color/channel identity must match the charge realization."
    );
  }
}

export function calculateExpectedSensorReadout(
  input:
    CalculateExpectedSensorReadoutInput
): CalculationResult<SensorExpectedReadoutSignal> {
  const readout =
    resolveSensorReadoutRegime({
      profile:
        input.readoutProfile,
      regimeId:
        input.regimeId
    });
  validateChargeIdentity(
    input.accumulatedCharge,
    input
      .physicalCapacityAssessment,
    readout
  );

  const expected =
    input.accumulatedCharge
      .totalExpectedStoredElectronCount;
  const threshold =
    readout.regime
      .preAdcSaturationElectronEquivalent
      .value;
  const afterPreAdc =
    Math.min(
      expected,
      threshold
    );
  const codeSignal =
    afterPreAdc /
    readout.regime
      .systemConversionGainElectronsPerCode
      .value;
  const codeBeforeQuantization =
    codeSignal +
    readout.regime
      .adc.blackLevelCode;

  return approximationResult(
    {
      readoutProfileId:
        readout.profileId,
      regimeId:
        readout.regime
          .regimeId,
      completenessProfileId:
        input.accumulatedCharge
          .completenessProfileId,
      capacityProfileId:
        input
          .physicalCapacityAssessment
          .capacityProfileId,
      colorSamplingProfileId:
        input.accumulatedCharge
          .colorSamplingProfileId,
      channelId:
        input.accumulatedCharge
          .channelId,
      site: {
        ...input
          .accumulatedCharge
          .site
      },
      bindingId:
        input.accumulatedCharge
          .bindingId,
      expectedStoredElectronCount:
        expected,
      expectedStoredChargeBelowOrAtPhysicalCapacity:
        true,
      expectedElectronEquivalentAfterPreAdcSaturation:
        afterPreAdc,
      preAdcSaturationAppliedToExpectation:
        afterPreAdc < expected,
      systemConversionGainElectronsPerCode:
        readout.regime
          .systemConversionGainElectronsPerCode
          .value,
      expectedCodeBeforeBlackOffset:
        codeSignal,
      blackLevelCode:
        readout.regime
          .adc.blackLevelCode,
      expectedCodeBeforeQuantization:
        codeBeforeQuantization,
      adcBitDepth:
        readout.regime
          .adc.bitDepth,
      adcMaximumCode:
        readout.adcMaximumCode,
      digitalSaturationCode:
        readout.regime
          .adc
          .digitalSaturationCode,
      expectedDigitalSaturation:
        codeBeforeQuantization >=
        readout.regime
          .adc
          .digitalSaturationCode,
      electronicReadNoiseMeanElectrons:
        0,
      electronicReadNoiseRmsElectrons:
        readout
          .combinedReadNoiseRmsElectrons,
      electronicReadNoiseSampled:
        false,
      adcQuantizationApplied:
        false,
      rawCodeValueProduced:
        false,
      isoUsedToInferRegime:
        false
    },
    "sensor-expected-electronic-readout",
    "1.0.0",
    [
      "Expected readout uses complete expected stored charge only after the upstream physical-capacity assessment confirms the expectation is not above physical capacity.",
      "Electronic read-noise mean is zero and is not sampled in this expectation result.",
      "The explicitly selected conversion regime is not inferred from ISO, sensor technology family or marketing mode names.",
      "Pre-ADC electron-equivalent saturation, black offset and ADC/digital saturation remain separate domains.",
      "ADC quantization is not applied to the expectation value."
    ]
  );
}

function roundHalfUp(
  value: number
): number {
  return Math.floor(
    value + 0.5
  );
}

export function simulateSensorRawCode(
  input:
    SimulateSensorRawCodeInput
): CalculationResult<SensorRawCodeSample> {
  const readout =
    resolveSensorReadoutRegime({
      profile:
        input.readoutProfile,
      regimeId:
        input.regimeId
    });
  validateCapacityAgainstRealization(
    input.chargeRealization,
    input
      .physicalCapacityAssessment,
    readout
  );
  const readNoiseSeed =
    requireUint32(
      input.readNoiseSeedUint32,
      "readNoiseSeedUint32"
    );
  const random =
    createRandom(
      readNoiseSeed
    );

  const realized =
    input.chargeRealization
      .totalRealizedStoredElectronEquivalentCount;
  if (
    !Number.isFinite(realized) ||
    realized < 0
  ) {
    throw new InvalidScientificInputError(
      "Charge realization total must be finite and nonnegative."
    );
  }

  const physicalCapacity =
    input
      .physicalCapacityAssessment
      .physicalChargeCapacityElectrons;
  const afterPhysical =
    Math.min(
      realized,
      physicalCapacity
    );
  const physicalSaturation =
    afterPhysical < realized;
  const overflow =
    Math.max(
      0,
      realized -
        physicalCapacity
    );

  const readNoiseComponents =
    readout.regime
      .readNoiseComponents.map(
        (component) => {
          const sampled =
            component
              .rmsElectrons.value ===
            0
              ? 0
              : sampleStandardNormal(
                  random
                ) *
                component
                  .rmsElectrons.value;
          return {
            componentId:
              component
                .componentId,
            rmsElectrons:
              component
                .rmsElectrons
                .value,
            sampledElectrons:
              sampled
          };
        }
      );
  const totalReadNoise =
    readNoiseComponents.reduce(
      (sum, component) =>
        sum +
        component
          .sampledElectrons,
      0
    );

  const afterReadNoise =
    afterPhysical +
    totalReadNoise;
  const preAdcThreshold =
    readout.regime
      .preAdcSaturationElectronEquivalent
      .value;
  // Stored charge is nonnegative; the downstream electronic signal is signed.
  // Preserve negative read noise until the black pedestal and unsigned ADC boundary.
  const afterPreAdc =
    Math.min(
      afterReadNoise,
      preAdcThreshold
    );
  const preAdcSaturation =
    afterReadNoise >
    preAdcThreshold;

  const codeBeforeQuantization =
    afterPreAdc /
      readout.regime
        .systemConversionGainElectronsPerCode
        .value +
    readout.regime
      .adc.blackLevelCode;
  const quantized =
    roundHalfUp(
      codeBeforeQuantization
    );
  const rawCode =
    Math.max(
      0,
      Math.min(
        quantized,
        readout.regime
          .adc
          .digitalSaturationCode
      )
    );

  return approximationResult(
    {
      readoutProfileId:
        readout.profileId,
      regimeId:
        readout.regime
          .regimeId,
      samplingProfileId:
        input.chargeRealization
          .samplingProfileId,
      completenessProfileId:
        input.chargeRealization
          .completenessProfileId,
      capacityProfileId:
        input
          .physicalCapacityAssessment
          .capacityProfileId,
      colorSamplingProfileId:
        input.chargeRealization
          .colorSamplingProfileId,
      channelId:
        input.chargeRealization
          .channelId,
      site: {
        ...input
          .chargeRealization.site
      },
      bindingId:
        input.chargeRealization
          .bindingId,
      chargeSeedUint32:
        input.chargeRealization
          .seedUint32,
      readNoiseSeedUint32:
        readNoiseSeed,
      realizedStoredElectronEquivalentCountBeforePhysicalCapacity:
        realized,
      physicalChargeCapacityElectrons:
        physicalCapacity,
      electronEquivalentAfterPhysicalScalarSaturation:
        afterPhysical,
      physicalScalarSaturationApplied:
        physicalSaturation,
      overflowElectronEquivalentDiagnostic:
        overflow,
      bloomingModeled: false,
      electronicReadNoiseComponents:
        readNoiseComponents,
      totalElectronicReadNoiseElectrons:
        totalReadNoise,
      electronEquivalentAfterReadNoise:
        afterReadNoise,
      preAdcSaturationElectronEquivalent:
        preAdcThreshold,
      electronEquivalentAfterPreAdcSaturation:
        afterPreAdc,
      preAdcSaturationApplied:
        preAdcSaturation,
      systemConversionGainElectronsPerCode:
        readout.regime
          .systemConversionGainElectronsPerCode
          .value,
      blackLevelCode:
        readout.regime
          .adc.blackLevelCode,
      codeBeforeQuantization,
      quantizedCodeBeforeDigitalClamp:
        quantized,
      adcBitDepth:
        readout.regime
          .adc.bitDepth,
      adcMaximumCode:
        readout.adcMaximumCode,
      digitalSaturationCode:
        readout.regime
          .adc
          .digitalSaturationCode,
      rawCode,
      digitalSaturationApplied:
        quantized >
        readout.regime
          .adc
          .digitalSaturationCode,
      lowerCodeClampApplied:
        quantized < 0,
      adcTransfer:
        "uniform-round-half-up",
      physicalSaturationApplied:
        physicalSaturation,
      electronicReadNoiseApplied:
        readNoiseComponents
          .some(
            (component) =>
              component
                .rmsElectrons >
              0
          ),
      conversionGainApplied:
        true,
      adcQuantizationApplied:
        true,
      rawCodeValueProduced:
        true,
      isoUsedToInferRegime:
        false,
      deterministicSeededRealization:
        true
    },
    "sensor-raw-code-stochastic-readout",
    "2.0.0",
    [
      "A stochastic stored-charge realization is scalar-clamped at the explicit physical storage capacity; this is a bounded saturation approximation and does not model blooming, neighbor transport or anti-blooming behavior.",
      "Independent input-referred Gaussian electronic read-noise components are sampled after physical charge saturation and before the explicit pre-ADC electron-equivalent saturation threshold.",
      "System conversion gain is expressed in electrons per digital-number code unit for the explicitly selected regime and is not inferred from ISO.",
      "Signed electronic read noise survives the upper-only pre-ADC saturation threshold. Black level is added before uniform round-half-up quantization and clamping to zero/digital saturation; valid below-black codes are retained.",
      "Physical storage capacity, pre-ADC saturation and digital/ADC saturation remain separate thresholds.",
      "The charge seed and read-noise seed are separate deterministic simulation identities; neither is cryptographically secure."
    ]
  );
}
