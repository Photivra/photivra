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
import {
  parseSpectralWavelengthBasis,
  type SpectralWavelengthBasis
} from "../core/spectral.js";
import { InvalidScientificInputError } from "../core/validation.js";
import type { IlluminationVignetting } from "./illumination-vignetting.js";
import { calculateThinLensImageDistance } from "./thin-lens.js";
import {
  parseSceneRadianceEvaluationRequest,
  parseSceneRadianceEvaluationResult,
  type SceneRadianceEvaluationRequest,
  type SceneRadianceEvaluationResult
} from "../schema/scene-radiance.js";

type UnknownRecord = Record<string, unknown>;

export const SCENE_TO_SENSOR_IRRADIANCE_PROFILE_SCHEMA_VERSION =
  "0.1.0" as const;

export type OpticalBridgeScientificStatus =
  | "calibrated"
  | "approximation";

export type OpticalBridgeUncertainty =
  | {
      kind: "relative";
      fraction: number;
      basis: string;
    }
  | {
      kind: "not-quantified";
      limitation: string;
    };

export interface NumericRange {
  minimum: number;
  maximum: number;
}

export type OpticalBridgeFocusApplicability =
  | {
      kind: "any";
    }
  | {
      kind: "finite-distance-range";
      objectDistanceM: NumericRange;
    };

export interface SpectralTransmissionSample {
  wavelengthNanometers: number;
  linearTransmissionFactor: number;
}

export type OpticalTransmissionModel =
  | {
      kind: "spectral-transmission";
      scientificStatus:
        OpticalBridgeScientificStatus;
      wavelengthBasis:
        Exclude<
          SpectralWavelengthBasis,
          "unspecified"
        >;
      samples:
        EvidenceBackedFact<
          readonly SpectralTransmissionSample[]
        >;
      uncertainty:
        OpticalBridgeUncertainty;
    }
  | {
      kind:
        "effective-working-t-stop-approximation";
      scientificStatus: "approximation";
      workingTStop:
        EvidenceBackedFact<number>;
      wavelengthBasis:
        Exclude<
          SpectralWavelengthBasis,
          "unspecified"
        >;
      wavelengthRangeNanometers:
        NumericRange;
      uncertainty:
        OpticalBridgeUncertainty;
      limitation: string;
    };

export interface SceneToSensorIrradianceProfile {
  schemaVersion:
    typeof SCENE_TO_SENSOR_IRRADIANCE_PROFILE_SCHEMA_VERSION;
  profileId: string;
  profileVersion: string;
  lensProfileId: string;
  scientificStatus:
    OpticalBridgeScientificStatus;
  applicability: {
    focalLengthMm: NumericRange;
    nominalFNumber: NumericRange;
    focus:
      OpticalBridgeFocusApplicability;
  };
  transmission:
    OpticalTransmissionModel;
  distortionAreaMappingOwnership:
    "not-applied-by-bridge";
  psfRedistributionOwnership:
    "downstream-normalized-energy-redistribution";
  sensorOpticalStackIncluded: false;
  strayLightIncluded: false;
  polarizationModeled: false;
  wavelengthChangingBehaviorModeled: false;
  volumetricScatteringModeled: false;
  evidence: readonly EvidenceProvenance[];
  limitations: readonly string[];
}

export type OpticalBridgeFocusContext =
  | {
      kind: "infinity-focus";
    }
  | {
      kind:
        "ideal-symmetric-thin-lens";
      objectDistanceM: number;
      pupilMagnificationAssumption:
        "unity";
    }
  | {
      kind:
        "supplied-working-f-number";
      focus:
        | {
            kind: "infinity";
          }
        | {
            kind: "finite";
            objectDistanceM: number;
          };
      workingFNumber:
        EvidenceBackedFact<number>;
      basis: string;
    };

export type OpticalBridgeFieldThroughput =
  | {
      kind: "unity";
    }
  | {
      kind:
        "illumination-vignetting-result";
      result:
        IlluminationVignetting;
    };

export interface CalculateSceneRadianceToSensorIrradianceInput {
  sceneRadianceRequest:
    SceneRadianceEvaluationRequest;
  sceneRadianceResult:
    SceneRadianceEvaluationResult;
  profile:
    SceneToSensorIrradianceProfile;
  focalLengthMm: number;
  nominalFNumber: number;
  focus:
    OpticalBridgeFocusContext;
  imagePointMm: {
    x: number;
    y: number;
  };
  fieldThroughput:
    OpticalBridgeFieldThroughput;
}

export interface SceneToSensorIrradianceResult {
  schemaVersion:
    typeof SCENE_TO_SENSOR_IRRADIANCE_PROFILE_SCHEMA_VERSION;
  profileId: string;
  profileVersion: string;
  lensProfileId: string;
  sampleId: string;
  providerProfileId: string;
  sceneId: string;
  timeSecondsFromExposureStart: number;
  wavelengthNanometers: number;
  wavelengthBasis:
    Exclude<
      SpectralWavelengthBasis,
      "unspecified"
    >;
  inputQuantity:
    "outgoing-spectral-radiance";
  inputUnit:
    "W/m^2/sr/nm";
  outputQuantity:
    "sensor-plane-spectral-irradiance";
  outputUnit:
    "W/m^2/nm";
  sceneSpectralRadianceWattsPerSquareMeterSteradianNanometer:
    number;
  focalLengthMm: number;
  nominalFNumber: number;
  workingFNumber: number;
  focusModel:
    OpticalBridgeFocusContext["kind"];
  paraxialGeometricAcceptanceSolidAngleSteradians:
    number;
  transmissionPath:
    OpticalTransmissionModel["kind"];
  spectralTransmissionFactor:
    number | null;
  effectiveWorkingTStop:
    number | null;
  tStopEquivalentTransmissionFactor:
    number | null;
  fieldThroughputFactor: number;
  effectiveAcceptanceAfterTransmissionAndFieldSteradians:
    number;
  sensorPlaneSpectralIrradianceWattsPerSquareMeterNanometer:
    number;
  scientificStatus: "approximation";
  sceneRadianceScientificStatus:
    SceneRadianceEvaluationResult["scientificStatus"];
  opticalProfileScientificStatus:
    OpticalBridgeScientificStatus;
  sceneRadianceUncertainty:
    SceneRadianceEvaluationResult["uncertainty"];
  opticalUncertainty:
    OpticalBridgeUncertainty;
  radianceAmplificationApplied: false;
  fieldThroughputAppliedExactlyOnce:
    true;
  universalCos4FalloffApplied: false;
  distortionAreaCorrectionApplied: false;
  psfRedistributionApplied: false;
  sensorOpticalStackApplied: false;
  cfaApplied: false;
  quantumEfficiencyApplied: false;
  spectralResponsivityApplied: false;
  strayLightApplied: false;
  polarizationModeled: false;
  wavelengthChangingBehaviorModeled:
    false;
  volumetricScatteringModeled: false;
  calibratedSensorPlaneIrradianceClaimAuthorized:
    false;
  componentEvidence: {
    sceneRadiance:
      readonly EvidenceProvenance[];
    opticalProfile:
      readonly EvidenceProvenance[];
    transmission:
      readonly EvidenceProvenance[];
    workingFNumber:
      readonly EvidenceProvenance[];
  };
  limitations:
    readonly string[];
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

function requireFraction(
  value: unknown,
  path: string
): number {
  const parsed =
    requireFinite(value, path);
  if (
    parsed < 0 ||
    parsed > 1
  ) {
    throw new InvalidConfigurationError(
      path +
        " must be from zero through one."
    );
  }
  return parsed;
}

function parseRange(
  value: unknown,
  path: string
): NumericRange {
  const record =
    requireRecord(value, path);
  const minimum =
    requirePositiveFinite(
      record.minimum,
      path + ".minimum"
    );
  const maximum =
    requirePositiveFinite(
      record.maximum,
      path + ".maximum"
    );
  if (minimum > maximum) {
    throw new InvalidConfigurationError(
      path +
        ".minimum must be less than or equal to maximum."
    );
  }
  return {
    minimum,
    maximum
  };
}

function parseScientificStatus(
  value: unknown,
  path: string
): OpticalBridgeScientificStatus {
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

function parseUncertainty(
  value: unknown,
  path: string
): OpticalBridgeUncertainty {
  const record =
    requireRecord(value, path);

  if (record.kind === "relative") {
    return {
      kind: "relative",
      fraction:
        requireFraction(
          record.fraction,
          path + ".fraction"
        ),
      basis:
        requireNonEmptyString(
          record.basis,
          path + ".basis"
        )
    };
  }

  if (
    record.kind ===
    "not-quantified"
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

function parseLimitations(
  value: unknown,
  path: string
): readonly string[] {
  if (!Array.isArray(value)) {
    throw new InvalidConfigurationError(
      path + " must be an array."
    );
  }
  const parsed = value.map(
    (entry, index) =>
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

function parseReusableNumericEvidence(
  value: unknown,
  path: string
): readonly EvidenceProvenance[] {
  const evidence =
    parseEvidenceList(value, path);

  if (
    evidence.some(
      (entry) =>
        entry.reuseStatus ===
        "factual-reference-only"
    )
  ) {
    throw new InvalidConfigurationError(
      path +
        " for numeric optical curve data must be reusable-data or photivra-owned."
    );
  }
  return evidence;
}

function parseSpectralSamples(
  value: unknown,
  path: string
): readonly SpectralTransmissionSample[] {
  if (
    !Array.isArray(value) ||
    value.length < 2
  ) {
    throw new InvalidConfigurationError(
      path +
        " must contain at least two samples."
    );
  }

  let previous =
    Number.NEGATIVE_INFINITY;
  return value.map(
    (entry, index) => {
      const samplePath =
        path +
        "[" +
        index +
        "]";
      const record =
        requireRecord(
          entry,
          samplePath
        );
      const wavelengthNanometers =
        requirePositiveFinite(
          record.wavelengthNanometers,
          samplePath +
            ".wavelengthNanometers"
        );
      if (
        wavelengthNanometers <=
        previous
      ) {
        throw new InvalidConfigurationError(
          path +
            " wavelengths must be strictly increasing."
        );
      }
      previous =
        wavelengthNanometers;
      return {
        wavelengthNanometers,
        linearTransmissionFactor:
          requireFraction(
            record.linearTransmissionFactor,
            samplePath +
              ".linearTransmissionFactor"
          )
      };
    }
  );
}

function parseTransmission(
  value: unknown,
  path: string
): OpticalTransmissionModel {
  const record =
    requireRecord(value, path);

  if (
    record.kind ===
    "spectral-transmission"
  ) {
    if (
      record.workingTStop !==
      undefined ||
      record.wavelengthRangeNanometers !==
      undefined
    ) {
      throw new InvalidConfigurationError(
        path +
          " spectral-transmission must not include T-stop-only fields."
      );
    }

    const status =
      parseScientificStatus(
        record.scientificStatus,
        path +
          ".scientificStatus"
      );
    const samplesFact =
      requireRecord(
        record.samples,
        path + ".samples"
      );
    const uncertainty =
      parseUncertainty(
        record.uncertainty,
        path + ".uncertainty"
      );

    if (
      status === "calibrated" &&
      uncertainty.kind !==
        "relative"
    ) {
      throw new InvalidConfigurationError(
        path +
          " calibrated spectral transmission requires quantified relative uncertainty."
      );
    }

    return {
      kind:
        "spectral-transmission",
      scientificStatus: status,
      wavelengthBasis:
        parseResolvedBasis(
          record.wavelengthBasis,
          path +
            ".wavelengthBasis"
        ),
      samples: {
        value:
          parseSpectralSamples(
            samplesFact.value,
            path +
              ".samples.value"
          ),
        evidence:
          parseReusableNumericEvidence(
            samplesFact.evidence,
            path +
              ".samples.evidence"
          )
      },
      uncertainty
    };
  }

  if (
    record.kind ===
    "effective-working-t-stop-approximation"
  ) {
    if (
      record.samples !==
      undefined
    ) {
      throw new InvalidConfigurationError(
        path +
          " T-stop approximation must not include spectral transmission samples."
      );
    }
    if (
      record.scientificStatus !==
      "approximation"
    ) {
      throw new InvalidConfigurationError(
        path +
          ' T-stop scientificStatus must be "approximation".'
      );
    }
    const workingTStopFact =
      requireRecord(
        record.workingTStop,
        path +
          ".workingTStop"
      );
    return {
      kind:
        "effective-working-t-stop-approximation",
      scientificStatus:
        "approximation",
      workingTStop: {
        value:
          requirePositiveFinite(
            workingTStopFact.value,
            path +
              ".workingTStop.value"
          ),
        evidence:
          parseEvidenceList(
            workingTStopFact.evidence,
            path +
              ".workingTStop.evidence"
          )
      },
      wavelengthBasis:
        parseResolvedBasis(
          record.wavelengthBasis,
          path +
            ".wavelengthBasis"
        ),
      wavelengthRangeNanometers:
        parseRange(
          record.wavelengthRangeNanometers,
          path +
            ".wavelengthRangeNanometers"
        ),
      uncertainty:
        parseUncertainty(
          record.uncertainty,
          path + ".uncertainty"
        ),
      limitation:
        requireNonEmptyString(
          record.limitation,
          path +
            ".limitation"
        )
    };
  }

  throw new InvalidConfigurationError(
    path + ".kind is invalid."
  );
}

function parseResolvedBasis(
  value: unknown,
  path: string
): Exclude<
  SpectralWavelengthBasis,
  "unspecified"
> {
  const parsed =
    parseSpectralWavelengthBasis(
      value,
      path
    );
  if (parsed === "unspecified") {
    throw new InvalidConfigurationError(
      path +
        ' must resolve to "air" or "vacuum".'
    );
  }
  return parsed;
}

function parseFocusApplicability(
  value: unknown,
  path: string
): OpticalBridgeFocusApplicability {
  const record =
    requireRecord(value, path);

  if (record.kind === "any") {
    return {
      kind: "any"
    };
  }
  if (
    record.kind ===
    "finite-distance-range"
  ) {
    return {
      kind:
        "finite-distance-range",
      objectDistanceM:
        parseRange(
          record.objectDistanceM,
          path +
            ".objectDistanceM"
        )
    };
  }
  throw new InvalidConfigurationError(
    path + ".kind is invalid."
  );
}

export function parseSceneToSensorIrradianceProfile(
  value: unknown
): SceneToSensorIrradianceProfile {
  const record =
    requireRecord(
      value,
      "sceneToSensorIrradianceProfile"
    );
  if (
    record.schemaVersion !==
    SCENE_TO_SENSOR_IRRADIANCE_PROFILE_SCHEMA_VERSION
  ) {
    throw new InvalidConfigurationError(
      'sceneToSensorIrradianceProfile.schemaVersion must be "' +
        SCENE_TO_SENSOR_IRRADIANCE_PROFILE_SCHEMA_VERSION +
        '".'
    );
  }

  const applicability =
    requireRecord(
      record.applicability,
      "sceneToSensorIrradianceProfile.applicability"
    );
  const status =
    parseScientificStatus(
      record.scientificStatus,
      "sceneToSensorIrradianceProfile.scientificStatus"
    );
  const transmission =
    parseTransmission(
      record.transmission,
      "sceneToSensorIrradianceProfile.transmission"
    );

  if (
    status === "calibrated" &&
    transmission.scientificStatus !==
      "calibrated"
  ) {
    throw new InvalidConfigurationError(
      "A calibrated optical bridge profile requires calibrated spectral transmission."
    );
  }

  if (
    record.distortionAreaMappingOwnership !==
      "not-applied-by-bridge" ||
    record.psfRedistributionOwnership !==
      "downstream-normalized-energy-redistribution" ||
    record.sensorOpticalStackIncluded !==
      false ||
    record.strayLightIncluded !==
      false ||
    record.polarizationModeled !==
      false ||
    record.wavelengthChangingBehaviorModeled !==
      false ||
    record.volumetricScatteringModeled !==
      false
  ) {
    throw new InvalidConfigurationError(
      "sceneToSensorIrradianceProfile ownership/completeness flags are invalid for schema 0.1.0."
    );
  }

  return {
    schemaVersion:
      SCENE_TO_SENSOR_IRRADIANCE_PROFILE_SCHEMA_VERSION,
    profileId:
      requireNonEmptyString(
        record.profileId,
        "sceneToSensorIrradianceProfile.profileId"
      ),
    profileVersion:
      requireNonEmptyString(
        record.profileVersion,
        "sceneToSensorIrradianceProfile.profileVersion"
      ),
    lensProfileId:
      requireNonEmptyString(
        record.lensProfileId,
        "sceneToSensorIrradianceProfile.lensProfileId"
      ),
    scientificStatus: status,
    applicability: {
      focalLengthMm:
        parseRange(
          applicability.focalLengthMm,
          "sceneToSensorIrradianceProfile.applicability.focalLengthMm"
        ),
      nominalFNumber:
        parseRange(
          applicability.nominalFNumber,
          "sceneToSensorIrradianceProfile.applicability.nominalFNumber"
        ),
      focus:
        parseFocusApplicability(
          applicability.focus,
          "sceneToSensorIrradianceProfile.applicability.focus"
        )
    },
    transmission,
    distortionAreaMappingOwnership:
      "not-applied-by-bridge",
    psfRedistributionOwnership:
      "downstream-normalized-energy-redistribution",
    sensorOpticalStackIncluded:
      false,
    strayLightIncluded: false,
    polarizationModeled: false,
    wavelengthChangingBehaviorModeled:
      false,
    volumetricScatteringModeled:
      false,
    evidence:
      parseEvidenceList(
        record.evidence,
        "sceneToSensorIrradianceProfile.evidence"
      ),
    limitations:
      parseLimitations(
        record.limitations,
        "sceneToSensorIrradianceProfile.limitations"
      )
  };
}

function ensureWithin(
  value: number,
  range: NumericRange,
  path: string
): void {
  if (
    value < range.minimum ||
    value > range.maximum
  ) {
    throw new InvalidScientificInputError(
      path +
        " lies outside the optical profile applicability range."
    );
  }
}

function workingFNumber(
  focus:
    OpticalBridgeFocusContext,
  focalLengthMm: number,
  nominalFNumber: number
): {
  value: number;
  evidence:
    readonly EvidenceProvenance[];
} {
  if (
    focus.kind === "infinity-focus"
  ) {
    return {
      value: nominalFNumber,
      evidence: []
    };
  }

  if (
    focus.kind ===
    "ideal-symmetric-thin-lens"
  ) {
    if (
      focus
        .pupilMagnificationAssumption !==
      "unity"
    ) {
      throw new InvalidScientificInputError(
        'Ideal symmetric thin-lens focus requires pupilMagnificationAssumption "unity".'
      );
    }
    const thinLens =
      calculateThinLensImageDistance({
        focalLengthMm,
        objectDistanceM:
          focus.objectDistanceM
      }).value;
    return {
      value:
        nominalFNumber *
        (1 + thinLens.magnification),
      evidence: []
    };
  }

  if (
    focus.kind ===
    "supplied-working-f-number"
  ) {
    const value =
      requirePositiveFiniteScientific(
        focus.workingFNumber.value,
        "focus.workingFNumber.value"
      );
    return {
      value,
      evidence:
        parseEvidenceList(
          focus.workingFNumber.evidence,
          "focus.workingFNumber.evidence"
        )
    };
  }

  throw new InvalidScientificInputError(
    "focus.kind is invalid."
  );
}

function requirePositiveFiniteScientific(
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

function finiteFocusDistance(
  focus:
    OpticalBridgeFocusContext
): number | null {
  if (
    focus.kind ===
    "ideal-symmetric-thin-lens"
  ) {
    return requirePositiveFiniteScientific(
      focus.objectDistanceM,
      "focus.objectDistanceM"
    );
  }
  if (
    focus.kind ===
      "supplied-working-f-number" &&
    focus.focus.kind === "finite"
  ) {
    return requirePositiveFiniteScientific(
      focus.focus.objectDistanceM,
      "focus.focus.objectDistanceM"
    );
  }
  return null;
}

function interpolateTransmission(
  model:
    Extract<
      OpticalTransmissionModel,
      { kind: "spectral-transmission" }
    >,
  wavelengthNanometers: number
): number {
  const samples =
    model.samples.value;
  const first =
    samples[0]!;
  const last =
    samples[
      samples.length - 1
    ]!;

  if (
    wavelengthNanometers <
      first.wavelengthNanometers ||
    wavelengthNanometers >
      last.wavelengthNanometers
  ) {
    throw new InvalidScientificInputError(
      "Scene wavelength lies outside the spectral transmission sample range."
    );
  }

  if (
    wavelengthNanometers ===
    first.wavelengthNanometers
  ) {
    return first
      .linearTransmissionFactor;
  }

  for (
    let index = 1;
    index < samples.length;
    index += 1
  ) {
    const right =
      samples[index]!;
    if (
      wavelengthNanometers <=
      right.wavelengthNanometers
    ) {
      const left =
        samples[index - 1]!;
      if (
        wavelengthNanometers ===
        right.wavelengthNanometers
      ) {
        return right
          .linearTransmissionFactor;
      }
      const phase =
        (wavelengthNanometers -
          left.wavelengthNanometers) /
        (right.wavelengthNanometers -
          left.wavelengthNanometers);
      return (
        left
          .linearTransmissionFactor +
        phase *
          (right
              .linearTransmissionFactor -
            left
              .linearTransmissionFactor)
      );
    }
  }

  return last
    .linearTransmissionFactor;
}

function fieldFactor(
  field:
    OpticalBridgeFieldThroughput,
  imagePointMm: {
    x: number;
    y: number;
  }
): number {
  if (field.kind === "unity") {
    return 1;
  }
  if (
    field.kind ===
    "illumination-vignetting-result"
  ) {
    const result =
      field.result;
    const scale = Math.max(
      1,
      Math.abs(imagePointMm.x),
      Math.abs(imagePointMm.y),
      Math.abs(result.imagePointMm.x),
      Math.abs(result.imagePointMm.y)
    );
    const tolerance =
      Number.EPSILON *
      64 *
      scale;
    if (
      Math.abs(
        result.imagePointMm.x -
          imagePointMm.x
      ) > tolerance ||
      Math.abs(
        result.imagePointMm.y -
          imagePointMm.y
      ) > tolerance
    ) {
      throw new InvalidScientificInputError(
        "Illumination-vignetting result imagePointMm must match the optical bridge imagePointMm."
      );
    }
    const factor =
      result.linearThroughputFactor;
    if (
      !Number.isFinite(factor) ||
      factor <= 0 ||
      factor > 1
    ) {
      throw new InvalidScientificInputError(
        "Field throughput factor must be finite and in (0, 1]."
      );
    }
    return factor;
  }
  throw new InvalidScientificInputError(
    "fieldThroughput.kind is invalid."
  );
}

function validateSceneIdentity(
  request:
    SceneRadianceEvaluationRequest,
  result:
    SceneRadianceEvaluationResult
): void {
  if (
    request.sampleId !==
      result.sampleId ||
    request.providerProfileId !==
      result.providerProfileId ||
    request.sceneId !==
      result.sceneId ||
    request.wavelengthNanometers !==
      result.wavelengthNanometers ||
    request.wavelengthBasis !==
      result.wavelengthBasis
  ) {
    throw new InvalidScientificInputError(
      "Scene-radiance request/result identity must match exactly."
    );
  }
}

export function calculateSceneRadianceToSensorIrradiance(
  input:
    CalculateSceneRadianceToSensorIrradianceInput
): CalculationResult<
  SceneToSensorIrradianceResult
> {
  const request =
    parseSceneRadianceEvaluationRequest(
      input.sceneRadianceRequest
    );
  const sceneResult =
    parseSceneRadianceEvaluationResult(
      input.sceneRadianceResult
    );
  validateSceneIdentity(
    request,
    sceneResult
  );

  const profile =
    parseSceneToSensorIrradianceProfile(
      input.profile
    );
  const focalLengthMm =
    requirePositiveFiniteScientific(
      input.focalLengthMm,
      "focalLengthMm"
    );
  const nominalFNumber =
    requirePositiveFiniteScientific(
      input.nominalFNumber,
      "nominalFNumber"
    );

  ensureWithin(
    focalLengthMm,
    profile.applicability
      .focalLengthMm,
    "focalLengthMm"
  );
  ensureWithin(
    nominalFNumber,
    profile.applicability
      .nominalFNumber,
    "nominalFNumber"
  );

  const focusDistanceM =
    finiteFocusDistance(input.focus);
  if (
    profile.applicability.focus.kind ===
      "finite-distance-range"
  ) {
    if (focusDistanceM === null) {
      throw new InvalidScientificInputError(
        "Optical profile requires a finite focus distance."
      );
    }
    ensureWithin(
      focusDistanceM,
      profile.applicability
        .focus.objectDistanceM,
      "focus object distance"
    );
  }

  const working =
    workingFNumber(
      input.focus,
      focalLengthMm,
      nominalFNumber
    );
  const workingFNumberValue =
    working.value;
  const geometricAcceptance =
    Math.PI /
    (4 *
      workingFNumberValue *
      workingFNumberValue);

  if (
    !Number.isFinite(
      geometricAcceptance
    ) ||
    geometricAcceptance <= 0
  ) {
    throw new InvalidScientificInputError(
      "Paraxial geometric acceptance must remain finite and greater than zero."
    );
  }

  const transmission =
    profile.transmission;

  if (
    request.wavelengthBasis !==
    transmission.wavelengthBasis
  ) {
    throw new InvalidScientificInputError(
      "Scene-radiance and optical-transmission wavelength bases must match; implicit air/vacuum conversion is not performed."
    );
  }

  let spectralTransmissionFactor:
    number | null = null;
  let effectiveWorkingTStop:
    number | null = null;
  let tStopEquivalentTransmissionFactor:
    number | null = null;
  let effectiveAcceptance =
    geometricAcceptance;
  let transmissionEvidence:
    readonly EvidenceProvenance[];

  if (
    transmission.kind ===
    "spectral-transmission"
  ) {
    spectralTransmissionFactor =
      interpolateTransmission(
        transmission,
        request.wavelengthNanometers
      );
    effectiveAcceptance *=
      spectralTransmissionFactor;
    transmissionEvidence =
      transmission.samples.evidence;
  } else {
    ensureWithin(
      request.wavelengthNanometers,
      transmission
        .wavelengthRangeNanometers,
      "scene wavelength"
    );
    effectiveWorkingTStop =
      transmission.workingTStop.value;
    if (
      effectiveWorkingTStop <
      workingFNumberValue
    ) {
      throw new InvalidScientificInputError(
        "effective working T-stop must not be smaller than the geometric working f-number for a passive optical approximation."
      );
    }
    tStopEquivalentTransmissionFactor =
      (workingFNumberValue /
        effectiveWorkingTStop) **
      2;
    effectiveAcceptance =
      Math.PI /
      (4 *
        effectiveWorkingTStop *
        effectiveWorkingTStop);
    transmissionEvidence =
      transmission
        .workingTStop.evidence;
  }

  const fieldThroughputFactor =
    fieldFactor(
      input.fieldThroughput,
      input.imagePointMm
    );
  effectiveAcceptance *=
    fieldThroughputFactor;

  const sceneRadiance =
    sceneResult
      .spectralRadianceWattsPerSquareMeterSteradianNanometer;
  const irradiance =
    sceneRadiance *
    effectiveAcceptance;

  if (
    !Number.isFinite(irradiance) ||
    irradiance < 0
  ) {
    throw new InvalidScientificInputError(
      "Sensor-plane spectral irradiance must remain finite and non-negative."
    );
  }

  const limitations = [
    ...profile.limitations,
    "Paraxial circular-pupil acceptance uses pi/(4*N_working^2); no universal cos^4 field falloff is added.",
    "Field throughput is supplied separately and applied exactly once.",
    "Geometric distortion area-density/Jacobian correction is not applied by this bridge.",
    "PSF/diffraction energy redistribution is downstream and must preserve normalized energy apart from separately owned throughput losses.",
    "Sensor optical stack, microlens, CFA, QE/responsivity and charge conversion are downstream.",
    "Flare, ghosting, veiling glare, polarization, volumetric scattering and wavelength-changing behavior are not modeled."
  ];

  return approximationResult(
    {
      schemaVersion:
        SCENE_TO_SENSOR_IRRADIANCE_PROFILE_SCHEMA_VERSION,
      profileId: profile.profileId,
      profileVersion:
        profile.profileVersion,
      lensProfileId:
        profile.lensProfileId,
      sampleId: request.sampleId,
      providerProfileId:
        request.providerProfileId,
      sceneId: request.sceneId,
      timeSecondsFromExposureStart:
        request
          .timeSecondsFromExposureStart,
      wavelengthNanometers:
        request.wavelengthNanometers,
      wavelengthBasis:
        request.wavelengthBasis,
      inputQuantity:
        "outgoing-spectral-radiance",
      inputUnit:
        "W/m^2/sr/nm",
      outputQuantity:
        "sensor-plane-spectral-irradiance",
      outputUnit: "W/m^2/nm",
      sceneSpectralRadianceWattsPerSquareMeterSteradianNanometer:
        sceneRadiance,
      focalLengthMm,
      nominalFNumber,
      workingFNumber:
        workingFNumberValue,
      focusModel: input.focus.kind,
      paraxialGeometricAcceptanceSolidAngleSteradians:
        geometricAcceptance,
      transmissionPath:
        transmission.kind,
      spectralTransmissionFactor,
      effectiveWorkingTStop,
      tStopEquivalentTransmissionFactor,
      fieldThroughputFactor,
      effectiveAcceptanceAfterTransmissionAndFieldSteradians:
        effectiveAcceptance,
      sensorPlaneSpectralIrradianceWattsPerSquareMeterNanometer:
        irradiance,
      scientificStatus:
        "approximation",
      sceneRadianceScientificStatus:
        sceneResult.scientificStatus,
      opticalProfileScientificStatus:
        profile.scientificStatus,
      sceneRadianceUncertainty:
        sceneResult.uncertainty,
      opticalUncertainty:
        transmission.uncertainty,
      radianceAmplificationApplied:
        false,
      fieldThroughputAppliedExactlyOnce:
        true,
      universalCos4FalloffApplied:
        false,
      distortionAreaCorrectionApplied:
        false,
      psfRedistributionApplied:
        false,
      sensorOpticalStackApplied:
        false,
      cfaApplied: false,
      quantumEfficiencyApplied: false,
      spectralResponsivityApplied:
        false,
      strayLightApplied: false,
      polarizationModeled: false,
      wavelengthChangingBehaviorModeled:
        false,
      volumetricScatteringModeled:
        false,
      calibratedSensorPlaneIrradianceClaimAuthorized:
        false,
      componentEvidence: {
        sceneRadiance:
          sceneResult.evidence,
        opticalProfile:
          profile.evidence,
        transmission:
          transmissionEvidence,
        workingFNumber:
          working.evidence
      },
      limitations
    },
    "scene-radiance-to-sensor-irradiance",
    "1.0.0",
    limitations
  );
}
