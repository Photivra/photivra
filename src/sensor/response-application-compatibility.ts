// SPDX-License-Identifier: Apache-2.0

import {
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
  SensorSpectralReferenceConditions,
  SensorSpectralResponseScientificStatus
} from "./spectral-response.js";
import type {
  SensorSpatioSpectralIrradianceReduction
} from "./spatio-spectral-reduction.js";

type UnknownRecord = Record<string, unknown>;

const AREA_TOLERANCE = 1e-10;

export type SensorResponseSourcePlane =
  | "sensor-package-incident"
  | "site-incident";

export type SensorResponseIncidentAreaBasis =
  | {
      kind: "geometric-sensitive-aperture";
      areaSquareMicrometers: number;
    }
  | {
      kind: "full-site-cell";
      areaSquareMicrometers: number;
    }
  | {
      kind: "effective-collection-area";
      areaSquareMicrometers: number;
    };

export type SensorResponseSpatialModel =
  | {
      kind:
        "uniform-over-geometric-sensitive-aperture";
      scientificStatus:
        SensorSpectralResponseScientificStatus;
      evidence: readonly EvidenceProvenance[];
      limitation?: string;
    }
  | {
      kind: "not-established";
      limitation: string;
    };

export type SensorResponseReferenceConditionPolicy =
  | {
      kind: "exact-match-required";
    }
  | {
      kind: "assume-compatible";
      limitation: string;
      evidence: readonly EvidenceProvenance[];
    };

export interface SensorResponseApplicationProfile {
  schemaVersion: "0.1.0";
  profileId: string;
  spectralResponseProfileId: string;
  colorSamplingProfileId: string;
  channelId: string;
  samplingApertureProfileId: string;
  opticalStackProfileId: string;
  evidence: readonly EvidenceProvenance[];
  incidentAreaBasis:
    SensorResponseIncidentAreaBasis;
  spatialResponseModel:
    SensorResponseSpatialModel;
  referenceConditionPolicy:
    SensorResponseReferenceConditionPolicy;
}

export interface SourcedSensorResponseSourcePlane {
  value: SensorResponseSourcePlane;
  evidence: readonly EvidenceProvenance[];
}

export interface AssessSensorResponseApplicationCompatibilityInput {
  reduction:
    SensorSpatioSpectralIrradianceReduction;
  applicationProfile:
    SensorResponseApplicationProfile;
  sourcePlane:
    SourcedSensorResponseSourcePlane;
  operatingConditions?:
    SensorSpectralReferenceConditions;
}

export type SensorResponseApplicationCompatibilityBlocker =
  | "spectral-response-profile-id-mismatch"
  | "color-sampling-profile-id-mismatch"
  | "channel-id-mismatch"
  | "sampling-aperture-profile-id-missing"
  | "sampling-aperture-profile-id-mismatch"
  | "optical-stack-profile-id-missing"
  | "optical-stack-profile-id-mismatch"
  | "source-plane-mismatch"
  | "wavelength-basis-unresolved"
  | "incident-area-basis-not-currently-integrated"
  | "incident-area-mismatch"
  | "spatial-response-uniformity-not-established"
  | "response-reference-conditions-not-declared"
  | "operating-conditions-not-declared"
  | "operating-conditions-mismatch";

export type SensorResponseSignalPath =
  | "photon-rate-to-electrons"
  | "radiant-power-to-current";

export interface SensorResponseApplicationCompatibilityAssessment {
  applicationProfileId: string;
  spectralResponseProfileId: string;
  colorSamplingProfileId: string;
  channelId: string;
  responseScope:
    SensorSpatioSpectralIrradianceReduction["responseScope"];
  requiredSourcePlane:
    SensorResponseSourcePlane;
  suppliedSourcePlane:
    SensorResponseSourcePlane;
  sourcePlaneMatched: boolean;
  responseIncidentAreaBasis:
    SensorResponseIncidentAreaBasis;
  currentlyIntegratedAreaBasis:
    "geometric-sensitive-aperture";
  geometricApertureAreaSquareMicrometers:
    number;
  nominalSiteCellAreaSquareMicrometers?:
    number;
  spatialResponseModel:
    SensorResponseSpatialModel;
  referenceConditionPolicy:
    SensorResponseReferenceConditionPolicy;
  responseReferenceConditions?:
    SensorSpectralReferenceConditions;
  operatingConditions?:
    SensorSpectralReferenceConditions;
  structuralCompatibilityEstablished:
    boolean;
  compatibilityStatus:
    | "compatible"
    | "compatible-approximation"
    | "blocked";
  blockers:
    readonly SensorResponseApplicationCompatibilityBlocker[];
  requiredSignalPath:
    SensorResponseSignalPath;
  quantifiedResponseUncertaintyAvailable:
    boolean;
  responseApplicationPerformed: false;
  signalConversionAuthorized: false;
  temporalIntegrationAuthorized: false;
  photonConversionPerformed: false;
  electronConversionPerformed: false;
  currentConversionPerformed: false;
  operatingRangeCompatibilityAssessed: false;
  spatiallyVaryingResponseSupported: false;
  componentEvidence: {
    applicationProfile:
      readonly EvidenceProvenance[];
    sourcePlane:
      readonly EvidenceProvenance[];
    spatialResponse:
      readonly EvidenceProvenance[];
    referenceConditionAssumption:
      readonly EvidenceProvenance[];
    response:
      SensorSpatioSpectralIrradianceReduction["componentEvidence"]["spectral"];
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

function requirePositiveFinite(
  value: unknown,
  path: string
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new InvalidConfigurationError(
      path +
        " must be finite and greater than zero."
    );
  }
  return value;
}

function parseIncidentAreaBasis(
  value: unknown,
  path: string
): SensorResponseIncidentAreaBasis {
  const record =
    requireRecord(value, path);
  const areaSquareMicrometers =
    requirePositiveFinite(
      record.areaSquareMicrometers,
      path + ".areaSquareMicrometers"
    );

  if (
    record.kind !==
      "geometric-sensitive-aperture" &&
    record.kind !== "full-site-cell" &&
    record.kind !==
      "effective-collection-area"
  ) {
    throw new InvalidConfigurationError(
      path + ".kind is invalid."
    );
  }

  return {
    kind: record.kind,
    areaSquareMicrometers
  };
}

function parseSpatialResponseModel(
  value: unknown,
  path: string
): SensorResponseSpatialModel {
  const record =
    requireRecord(value, path);

  if (
    record.kind === "not-established"
  ) {
    return {
      kind: "not-established",
      limitation: requireNonEmptyString(
        record.limitation,
        path + ".limitation"
      )
    };
  }

  if (
    record.kind !==
    "uniform-over-geometric-sensitive-aperture"
  ) {
    throw new InvalidConfigurationError(
      path + ".kind is invalid."
    );
  }

  if (
    record.scientificStatus !==
      "calibrated" &&
    record.scientificStatus !==
      "approximation"
  ) {
    throw new InvalidConfigurationError(
      path +
        ".scientificStatus is invalid."
    );
  }

  const limitation =
    record.limitation === undefined
      ? undefined
      : requireNonEmptyString(
          record.limitation,
          path + ".limitation"
        );

  if (
    record.scientificStatus ===
      "approximation" &&
    limitation === undefined
  ) {
    throw new InvalidConfigurationError(
      path +
        ".limitation is required for an approximation."
    );
  }

  return {
    kind:
      "uniform-over-geometric-sensitive-aperture",
    scientificStatus:
      record.scientificStatus,
    evidence: parseEvidenceList(
      record.evidence,
      path + ".evidence"
    ),
    ...(limitation === undefined
      ? {}
      : { limitation })
  };
}

function parseReferenceConditionPolicy(
  value: unknown,
  path: string
): SensorResponseReferenceConditionPolicy {
  const record =
    requireRecord(value, path);

  if (
    record.kind ===
    "exact-match-required"
  ) {
    return {
      kind: "exact-match-required"
    };
  }

  if (
    record.kind === "assume-compatible"
  ) {
    return {
      kind: "assume-compatible",
      limitation: requireNonEmptyString(
        record.limitation,
        path + ".limitation"
      ),
      evidence: parseEvidenceList(
        record.evidence,
        path + ".evidence"
      )
    };
  }

  throw new InvalidConfigurationError(
    path + ".kind is invalid."
  );
}

export function parseSensorResponseApplicationProfile(
  value: unknown
): SensorResponseApplicationProfile {
  const record = requireRecord(
    value,
    "sensorResponseApplication"
  );

  if (
    record.schemaVersion !== "0.1.0"
  ) {
    throw new InvalidConfigurationError(
      'sensorResponseApplication.schemaVersion must be "0.1.0".'
    );
  }

  return {
    schemaVersion: "0.1.0",
    profileId: requireNonEmptyString(
      record.profileId,
      "sensorResponseApplication.profileId"
    ),
    spectralResponseProfileId:
      requireNonEmptyString(
        record.spectralResponseProfileId,
        "sensorResponseApplication.spectralResponseProfileId"
      ),
    colorSamplingProfileId:
      requireNonEmptyString(
        record.colorSamplingProfileId,
        "sensorResponseApplication.colorSamplingProfileId"
      ),
    channelId: requireNonEmptyString(
      record.channelId,
      "sensorResponseApplication.channelId"
    ),
    samplingApertureProfileId:
      requireNonEmptyString(
        record.samplingApertureProfileId,
        "sensorResponseApplication.samplingApertureProfileId"
      ),
    opticalStackProfileId:
      requireNonEmptyString(
        record.opticalStackProfileId,
        "sensorResponseApplication.opticalStackProfileId"
      ),
    evidence: parseEvidenceList(
      record.evidence,
      "sensorResponseApplication.evidence"
    ),
    incidentAreaBasis:
      parseIncidentAreaBasis(
        record.incidentAreaBasis,
        "sensorResponseApplication.incidentAreaBasis"
      ),
    spatialResponseModel:
      parseSpatialResponseModel(
        record.spatialResponseModel,
        "sensorResponseApplication.spatialResponseModel"
      ),
    referenceConditionPolicy:
      parseReferenceConditionPolicy(
        record.referenceConditionPolicy,
        "sensorResponseApplication.referenceConditionPolicy"
      )
  };
}

function parseSourcePlane(
  value:
    SourcedSensorResponseSourcePlane
): SourcedSensorResponseSourcePlane {
  const record = requireRecord(
    value,
    "sourcePlane"
  );
  if (
    record.value !==
      "sensor-package-incident" &&
    record.value !== "site-incident"
  ) {
    throw new InvalidScientificInputError(
      "sourcePlane.value is invalid."
    );
  }
  return {
    value: record.value,
    evidence: parseEvidenceList(
      record.evidence,
      "sourcePlane.evidence"
    )
  };
}

function requiredSourcePlane(
  scope:
    SensorSpatioSpectralIrradianceReduction["responseScope"]
): SensorResponseSourcePlane {
  return scope ===
    "sensor-package-incident-effective-channel-response"
    ? "sensor-package-incident"
    : "site-incident";
}

function approximatelyEqual(
  actual: number,
  expected: number
): boolean {
  const scale = Math.max(
    1,
    Math.abs(actual),
    Math.abs(expected)
  );
  return (
    Math.abs(actual - expected) <=
    AREA_TOLERANCE * scale
  );
}

function conditionsMatch(
  reference:
    SensorSpectralReferenceConditions,
  operating:
    SensorSpectralReferenceConditions
): boolean {
  if (
    reference.temperatureC !==
      undefined &&
    operating.temperatureC !==
      reference.temperatureC
  ) {
    return false;
  }
  if (
    reference
      .incidenceAngleDegreesFromNormal !==
      undefined &&
    operating
      .incidenceAngleDegreesFromNormal !==
      reference
        .incidenceAngleDegreesFromNormal
  ) {
    return false;
  }
  if (
    reference.polarization !==
      undefined &&
    operating.polarization !==
      reference.polarization
  ) {
    return false;
  }
  return true;
}

function validateReductionBoundary(
  reduction:
    SensorSpatioSpectralIrradianceReduction
): void {
  if (
    reduction.outputMeaning !==
      "pre-response-spatio-spectral-radiometric-reduction" ||
    reduction
      .spectralResponseApplicationPerformed !==
      false ||
    reduction.quantumEfficiencyApplied !==
      false ||
    reduction.spectralResponsivityApplied !==
      false ||
    reduction.temporalIntegrationApplied !==
      false
  ) {
    throw new InvalidScientificInputError(
      "reduction must remain a pre-response, pre-temporal spatio-spectral result."
    );
  }

  if (
    typeof reduction
      .geometricApertureAreaSquareMicrometers !==
      "number" ||
    !Number.isFinite(
      reduction
        .geometricApertureAreaSquareMicrometers
    ) ||
    reduction
      .geometricApertureAreaSquareMicrometers <=
      0
  ) {
    throw new InvalidScientificInputError(
      "reduction.geometricApertureAreaSquareMicrometers is required and must be positive."
    );
  }
}

export function assessSensorResponseApplicationCompatibility(
  input:
    AssessSensorResponseApplicationCompatibilityInput
): CalculationResult<SensorResponseApplicationCompatibilityAssessment> {
  validateReductionBoundary(
    input.reduction
  );
  const profile =
    parseSensorResponseApplicationProfile(
      input.applicationProfile
    );
  const sourcePlane =
    parseSourcePlane(input.sourcePlane);
  const blockers:
    SensorResponseApplicationCompatibilityBlocker[] =
      [];

  if (
    profile.spectralResponseProfileId !==
    input.reduction.responseProfileId
  ) {
    blockers.push(
      "spectral-response-profile-id-mismatch"
    );
  }
  if (
    profile.colorSamplingProfileId !==
    input.reduction
      .colorSamplingProfileId
  ) {
    blockers.push(
      "color-sampling-profile-id-mismatch"
    );
  }
  if (
    profile.channelId !==
    input.reduction.channelId
  ) {
    blockers.push(
      "channel-id-mismatch"
    );
  }

  const samplingApertureProfileId =
    input.reduction
      .samplingApertureProfileId;
  if (
    samplingApertureProfileId ===
    undefined
  ) {
    blockers.push(
      "sampling-aperture-profile-id-missing"
    );
  } else if (
    samplingApertureProfileId !==
    profile.samplingApertureProfileId
  ) {
    blockers.push(
      "sampling-aperture-profile-id-mismatch"
    );
  }

  const opticalStackProfileId =
    input.reduction
      .opticalStackProfileId;
  if (
    opticalStackProfileId === undefined
  ) {
    blockers.push(
      "optical-stack-profile-id-missing"
    );
  } else if (
    opticalStackProfileId !==
    profile.opticalStackProfileId
  ) {
    blockers.push(
      "optical-stack-profile-id-mismatch"
    );
  }

  const requiredPlane =
    requiredSourcePlane(
      input.reduction.responseScope
    );
  const sourcePlaneMatched =
    sourcePlane.value === requiredPlane;
  if (!sourcePlaneMatched) {
    blockers.push(
      "source-plane-mismatch"
    );
  }

  if (
    !input.reduction
      .wavelengthBasisResolved
  ) {
    blockers.push(
      "wavelength-basis-unresolved"
    );
  }

  const geometricArea =
    input.reduction
      .geometricApertureAreaSquareMicrometers;

  if (
    profile.incidentAreaBasis.kind !==
    "geometric-sensitive-aperture"
  ) {
    blockers.push(
      "incident-area-basis-not-currently-integrated"
    );
  } else if (
    !approximatelyEqual(
      profile.incidentAreaBasis
        .areaSquareMicrometers,
      geometricArea
    )
  ) {
    blockers.push(
      "incident-area-mismatch"
    );
  }

  if (
    profile.spatialResponseModel.kind ===
    "not-established"
  ) {
    blockers.push(
      "spatial-response-uniformity-not-established"
    );
  }

  if (
    profile.referenceConditionPolicy.kind ===
    "exact-match-required"
  ) {
    const referenceConditions =
      input.reduction
        .responseReferenceConditions;
    if (
      referenceConditions === undefined
    ) {
      blockers.push(
        "response-reference-conditions-not-declared"
      );
    } else if (
      input.operatingConditions ===
      undefined
    ) {
      blockers.push(
        "operating-conditions-not-declared"
      );
    } else if (
      !conditionsMatch(
        referenceConditions,
        input.operatingConditions
      )
    ) {
      blockers.push(
        "operating-conditions-mismatch"
      );
    }
  }

  const structurallyCompatible =
    blockers.length === 0;

  const approximation =
    input.reduction
      .responseScientificStatus ===
      "approximation" ||
    (
      profile.spatialResponseModel.kind ===
        "uniform-over-geometric-sensitive-aperture" &&
      profile.spatialResponseModel
        .scientificStatus ===
        "approximation"
    ) ||
    profile.referenceConditionPolicy.kind ===
      "assume-compatible";

  const compatibilityStatus =
    structurallyCompatible
      ? approximation
        ? "compatible-approximation"
        : "compatible"
      : "blocked";

  const spatialEvidence =
    profile.spatialResponseModel.kind ===
      "uniform-over-geometric-sensitive-aperture"
      ? profile.spatialResponseModel.evidence
      : [];
  const referenceConditionEvidence =
    profile.referenceConditionPolicy.kind ===
      "assume-compatible"
      ? profile.referenceConditionPolicy
          .evidence
      : [];

  return calculatedResult(
    {
      applicationProfileId:
        profile.profileId,
      spectralResponseProfileId:
        input.reduction
          .responseProfileId,
      colorSamplingProfileId:
        input.reduction
          .colorSamplingProfileId,
      channelId:
        input.reduction.channelId,
      responseScope:
        input.reduction.responseScope,
      requiredSourcePlane:
        requiredPlane,
      suppliedSourcePlane:
        sourcePlane.value,
      sourcePlaneMatched,
      responseIncidentAreaBasis:
        profile.incidentAreaBasis,
      currentlyIntegratedAreaBasis:
        "geometric-sensitive-aperture",
      geometricApertureAreaSquareMicrometers:
        geometricArea,
      ...(input.reduction
        .nominalSiteCellAreaSquareMicrometers ===
      undefined
        ? {}
        : {
            nominalSiteCellAreaSquareMicrometers:
              input.reduction
                .nominalSiteCellAreaSquareMicrometers
          }),
      spatialResponseModel:
        profile.spatialResponseModel,
      referenceConditionPolicy:
        profile.referenceConditionPolicy,
      ...(input.reduction
        .responseReferenceConditions ===
      undefined
        ? {}
        : {
            responseReferenceConditions:
              input.reduction
                .responseReferenceConditions
          }),
      ...(input.operatingConditions ===
      undefined
        ? {}
        : {
            operatingConditions:
              input.operatingConditions
          }),
      structuralCompatibilityEstablished:
        structurallyCompatible,
      compatibilityStatus,
      blockers,
      requiredSignalPath:
        input.reduction
          .sourceResponseKind ===
        "effective-spectral-responsivity"
          ? "radiant-power-to-current"
          : "photon-rate-to-electrons",
      quantifiedResponseUncertaintyAvailable:
        input.reduction
          .responseUncertainty.kind ===
        "relative",
      responseApplicationPerformed:
        false,
      signalConversionAuthorized:
        false,
      temporalIntegrationAuthorized:
        false,
      photonConversionPerformed:
        false,
      electronConversionPerformed:
        false,
      currentConversionPerformed:
        false,
      operatingRangeCompatibilityAssessed:
        false,
      spatiallyVaryingResponseSupported:
        false,
      componentEvidence: {
        applicationProfile:
          profile.evidence,
        sourcePlane:
          sourcePlane.evidence,
        spatialResponse:
          spatialEvidence,
        referenceConditionAssumption:
          referenceConditionEvidence,
        response:
          input.reduction
            .componentEvidence.spectral
      }
    },
    "sensor-response-application-compatibility",
    "1.0.0",
    [
      "This result is a structural compatibility gate only; it never authorizes or performs sensor-response signal conversion.",
      "Response reference plane is derived from responseScope. Package-incident and site-incident inputs are not interchangeable.",
      "The current spatio-spectral reducer integrates the geometric sensitive aperture only. Full-site-cell and effective-collection-area response normalizations remain blocked until matching radiometric integrations exist.",
      "A scalar wavelength-only response may be applied after spatial reduction only when uniform/separable response over the integrated geometric aperture is explicitly established or declared as an approximation.",
      "Exact reference-condition matching is required when that policy is selected because temperature, incidence-angle and polarization dependence are not modeled.",
      "An unresolved wavelength basis is incompatible with physical response application.",
      "Typical total-pixel QE definitions can include fill factor and microlens effects; they must not be applied to geometric-sensitive-aperture flux unless the response normalization explicitly matches that area basis.",
      "Response linearity/dynamic-range validity is not assessed by this gate and remains required before a future conversion can claim calibrated applicability.",
      "EQE/filter×EQE responses require a future photon-rate→electron path; A/W responsivity requires a separate radiant-power→current path.",
      "Temporal integration, photons/electrons/current, noise, saturation, ADC/RAW conversion and reconstruction remain downstream."
    ]
  );
}
