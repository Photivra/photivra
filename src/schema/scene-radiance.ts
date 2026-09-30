// SPDX-License-Identifier: Apache-2.0

import { InvalidConfigurationError } from "../core/configuration-error.js";
import {
  parseEvidenceList,
  type EvidenceProvenance
} from "../core/evidence-provenance.js";
import {
  parseSpectralWavelengthBasis,
  parseSpectralWavelengthRangeNanometers,
  type SpectralWavelengthBasis,
  type SpectralWavelengthRangeNanometers
} from "../core/spectral.js";
import type {
  SceneIlluminationProfile
} from "./illumination.js";
import type { Vector3 } from "./scene.js";

type UnknownRecord = Record<string, unknown>;

export const SCENE_MATERIAL_RESPONSE_PROFILE_SCHEMA_VERSION =
  "0.1.0" as const;
export const SCENE_RADIANCE_PROVIDER_PROFILE_SCHEMA_VERSION =
  "0.1.0" as const;
export const SCENE_RADIANCE_EVALUATION_SCHEMA_VERSION =
  "0.1.0" as const;

export type SceneRadianceScientificStatus =
  | "calibrated"
  | "approximation";

export type SceneRadianceUncertainty =
  | {
      kind: "relative";
      fraction: number;
      basis: string;
    }
  | {
      kind: "not-quantified";
      limitation: string;
    };

export interface SceneRadianceDataArtifactReference {
  id: string;
  checksumSha256: string;
}

export type SceneMaterialResponseRepresentation =
  | {
      kind: "unresolved";
      limitation: string;
    }
  | {
      kind: "rgb-pbr-approximation";
      colorSpace: "linear-srgb";
      baseColor: {
        red: number;
        green: number;
        blue: number;
      };
      metallic: number;
      roughness: number;
      limitation: string;
    }
  | {
      kind: "spectral-wavelength-preserving-data";
      dataArtifact:
        SceneRadianceDataArtifactReference;
      wavelengthBasis:
        SpectralWavelengthBasis;
      wavelengthRangeNanometers:
        SpectralWavelengthRangeNanometers;
      scatteringModel:
        "provider-defined-wavelength-preserving";
      scientificStatus:
        SceneRadianceScientificStatus;
      uncertainty:
        SceneRadianceUncertainty;
      wavelengthChangingBehaviorModeled: false;
      emissionModeled: false;
    };

export interface SceneMaterialResponseDefinition {
  materialResponseId: string;
  evidence: readonly EvidenceProvenance[];
  representation:
    SceneMaterialResponseRepresentation;
}

export interface SceneMaterialResponseProfile {
  schemaVersion:
    typeof SCENE_MATERIAL_RESPONSE_PROFILE_SCHEMA_VERSION;
  profileId: string;
  sceneId: string;
  evidence: readonly EvidenceProvenance[];
  materials:
    readonly SceneMaterialResponseDefinition[];
  fluorescenceModeled: false;
  volumetricMaterialTransportModeled: false;
  polarizationModeled: false;
}

export type SceneMaterialResponseFidelity =
  | "spectral-data"
  | "rgb-pbr-approximation"
  | "mixed"
  | "unresolved";

export type SceneRadianceProviderSpectralFidelity =
  | "wavelength-resolved"
  | "rgb-derived-approximation";

export type SceneRadianceProviderVisibilityFidelity =
  | "resolved"
  | "approximation"
  | "not-modeled";

export type SceneRadianceProviderTransportFidelity =
  | "resolved"
  | "approximation"
  | "not-modeled";

export interface SceneRadianceProviderProfile {
  schemaVersion:
    typeof SCENE_RADIANCE_PROVIDER_PROFILE_SCHEMA_VERSION;
  profileId: string;
  sceneId: string;
  illuminationProfileId: string;
  materialResponseProfileId: string;
  outputQuantity:
    "outgoing-spectral-radiance";
  outputUnit:
    "W/m^2/sr/nm";
  scientificStatus: "approximation";
  uncertainty: SceneRadianceUncertainty;
  fidelity: {
    spectral:
      SceneRadianceProviderSpectralFidelity;
    material:
      SceneMaterialResponseFidelity;
    visibility:
      SceneRadianceProviderVisibilityFidelity;
    directTransport:
      SceneRadianceProviderTransportFidelity;
    indirectTransport:
      SceneRadianceProviderTransportFidelity;
  };
  wavelengthChangingTransportModeled: false;
  volumetricTransportModeled: false;
  polarizationModeled: false;
  evidence: readonly EvidenceProvenance[];
  limitations: readonly string[];
}

export type SceneRadianceEvaluationTarget =
  | {
      kind: "surface-point";
      sceneObjectId: string;
      materialResponseId: string;
      positionM: Vector3;
      outgoingDirectionUnitVector: Vector3;
    }
  | {
      kind: "environment-direction";
      outgoingDirectionUnitVector: Vector3;
    };

export interface SceneRadianceEvaluationRequest {
  schemaVersion:
    typeof SCENE_RADIANCE_EVALUATION_SCHEMA_VERSION;
  sampleId: string;
  providerProfileId: string;
  sceneId: string;
  illuminationProfileId: string;
  materialResponseProfileId: string;
  target: SceneRadianceEvaluationTarget;
  timeSecondsFromExposureStart: number;
  wavelengthNanometers: number;
  wavelengthBasis:
    Exclude<SpectralWavelengthBasis, "unspecified">;
}

export interface SceneRadianceEvaluationResult {
  schemaVersion:
    typeof SCENE_RADIANCE_EVALUATION_SCHEMA_VERSION;
  sampleId: string;
  providerProfileId: string;
  sceneId: string;
  wavelengthNanometers: number;
  wavelengthBasis:
    Exclude<SpectralWavelengthBasis, "unspecified">;
  quantity:
    "outgoing-spectral-radiance";
  unit: "W/m^2/sr/nm";
  spectralRadianceWattsPerSquareMeterSteradianNanometer:
    number;
  scientificStatus: "approximation";
  uncertainty: SceneRadianceUncertainty;
  evidence: readonly EvidenceProvenance[];
  limitations: readonly string[];
}

export interface ValidateSceneRadianceEvaluationBindingsInput {
  providerProfile: SceneRadianceProviderProfile;
  illuminationProfile: SceneIlluminationProfile;
  materialResponseProfile:
    SceneMaterialResponseProfile;
  request: SceneRadianceEvaluationRequest;
  result: SceneRadianceEvaluationResult;
}

export interface SceneRadianceEvaluationBindingAssessment {
  providerBindingsMatched: true;
  requestResultIdentityMatched: true;
  materialResponseFidelity:
    SceneMaterialResponseFidelity;
  calibratedRadianceClaimAuthorized: false;
  sensorPlaneIrradianceCalculated: false;
  opticsApplied: false;
  photonsCalculated: false;
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
      path + " must be a finite number."
    );
  }
  return value;
}

function requireNonNegativeFinite(
  value: unknown,
  path: string
): number {
  const number = requireFinite(value, path);
  if (number < 0) {
    throw new InvalidConfigurationError(
      path +
        " must be greater than or equal to zero."
    );
  }
  return number;
}

function requireFraction(
  value: unknown,
  path: string
): number {
  const number = requireFinite(value, path);
  if (number < 0 || number > 1) {
    throw new InvalidConfigurationError(
      path +
        " must be a finite fraction from 0 through 1."
    );
  }
  return number;
}

function parseVector3(
  value: unknown,
  path: string
): Vector3 {
  const record = requireRecord(value, path);
  return {
    x: requireFinite(record.x, path + ".x"),
    y: requireFinite(record.y, path + ".y"),
    z: requireFinite(record.z, path + ".z")
  };
}

function parseUnitDirection(
  value: unknown,
  path: string
): Vector3 {
  const vector = parseVector3(value, path);
  const length = Math.hypot(
    vector.x,
    vector.y,
    vector.z
  );
  if (
    !Number.isFinite(length) ||
    Math.abs(length - 1) > 1e-9
  ) {
    throw new InvalidConfigurationError(
      path +
        " must be a unit-length direction vector."
    );
  }
  return vector;
}

function parseUncertainty(
  value: unknown,
  path: string
): SceneRadianceUncertainty {
  const record = requireRecord(value, path);
  if (record.kind === "relative") {
    return {
      kind: "relative",
      fraction: requireNonNegativeFinite(
        record.fraction,
        path + ".fraction"
      ),
      basis: requireNonEmptyString(
        record.basis,
        path + ".basis"
      )
    };
  }
  if (record.kind === "not-quantified") {
    return {
      kind: "not-quantified",
      limitation: requireNonEmptyString(
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
  const limitations = value.map(
    (entry, index) =>
      requireNonEmptyString(
        entry,
        path + "[" + index + "]"
      )
  );
  if (
    new Set(limitations).size !==
    limitations.length
  ) {
    throw new InvalidConfigurationError(
      path + " must not contain duplicates."
    );
  }
  return limitations;
}

function parseArtifact(
  value: unknown,
  path: string
): SceneRadianceDataArtifactReference {
  const record = requireRecord(value, path);
  const checksumSha256 =
    requireNonEmptyString(
      record.checksumSha256,
      path + ".checksumSha256"
    );
  if (
    !/^[a-f0-9]{64}$/iu.test(
      checksumSha256
    )
  ) {
    throw new InvalidConfigurationError(
      path +
        ".checksumSha256 must be a 64-character SHA-256 hex digest."
    );
  }
  return {
    id: requireNonEmptyString(
      record.id,
      path + ".id"
    ),
    checksumSha256:
      checksumSha256.toLowerCase()
  };
}

function parseMaterialRepresentation(
  value: unknown,
  path: string
): SceneMaterialResponseRepresentation {
  const record = requireRecord(value, path);

  if (record.kind === "unresolved") {
    return {
      kind: "unresolved",
      limitation: requireNonEmptyString(
        record.limitation,
        path + ".limitation"
      )
    };
  }

  if (
    record.kind ===
    "rgb-pbr-approximation"
  ) {
    if (record.colorSpace !== "linear-srgb") {
      throw new InvalidConfigurationError(
        path +
          '.colorSpace must be "linear-srgb".'
      );
    }
    const baseColor = requireRecord(
      record.baseColor,
      path + ".baseColor"
    );
    return {
      kind: "rgb-pbr-approximation",
      colorSpace: "linear-srgb",
      baseColor: {
        red: requireFraction(
          baseColor.red,
          path + ".baseColor.red"
        ),
        green: requireFraction(
          baseColor.green,
          path + ".baseColor.green"
        ),
        blue: requireFraction(
          baseColor.blue,
          path + ".baseColor.blue"
        )
      },
      metallic: requireFraction(
        record.metallic,
        path + ".metallic"
      ),
      roughness: requireFraction(
        record.roughness,
        path + ".roughness"
      ),
      limitation: requireNonEmptyString(
        record.limitation,
        path + ".limitation"
      )
    };
  }

  if (
    record.kind !==
    "spectral-wavelength-preserving-data"
  ) {
    throw new InvalidConfigurationError(
      path + ".kind is invalid."
    );
  }

  if (
    record.scatteringModel !==
    "provider-defined-wavelength-preserving"
  ) {
    throw new InvalidConfigurationError(
      path +
        '.scatteringModel must be "provider-defined-wavelength-preserving".'
    );
  }
  if (
    record.scientificStatus !==
      "calibrated" &&
    record.scientificStatus !==
      "approximation"
  ) {
    throw new InvalidConfigurationError(
      path + ".scientificStatus is invalid."
    );
  }
  const scientificStatus =
    record.scientificStatus;
  const wavelengthBasis =
    parseSpectralWavelengthBasis(
      record.wavelengthBasis,
      path + ".wavelengthBasis"
    );
  const uncertainty = parseUncertainty(
    record.uncertainty,
    path + ".uncertainty"
  );
  if (
    scientificStatus === "calibrated" &&
    wavelengthBasis === "unspecified"
  ) {
    throw new InvalidConfigurationError(
      path +
        " calibrated spectral material data requires an air or vacuum wavelength basis."
    );
  }
  if (
    scientificStatus === "calibrated" &&
    uncertainty.kind !== "relative"
  ) {
    throw new InvalidConfigurationError(
      path +
        " calibrated spectral material data requires quantified relative uncertainty."
    );
  }
  if (
    record.wavelengthChangingBehaviorModeled !==
    false
  ) {
    throw new InvalidConfigurationError(
      path +
        ".wavelengthChangingBehaviorModeled must be false in schema 0.1.0."
    );
  }
  if (record.emissionModeled !== false) {
    throw new InvalidConfigurationError(
      path +
        ".emissionModeled must be false in schema 0.1.0."
    );
  }

  return {
    kind:
      "spectral-wavelength-preserving-data",
    dataArtifact: parseArtifact(
      record.dataArtifact,
      path + ".dataArtifact"
    ),
    wavelengthBasis,
    wavelengthRangeNanometers:
      parseSpectralWavelengthRangeNanometers(
        record.wavelengthRangeNanometers,
        path + ".wavelengthRangeNanometers"
      ),
    scatteringModel:
      "provider-defined-wavelength-preserving",
    scientificStatus,
    uncertainty,
    wavelengthChangingBehaviorModeled:
      false,
    emissionModeled: false
  };
}

/**
 * Parses material-response metadata consumed by a scene-radiance provider.
 *
 * RGB/PBR data is approximation-only. Spectral data describes a
 * wavelength-preserving provider input and does not itself calculate a BSDF,
 * scene radiance, fluorescence, emission, volumetrics, or polarization.
 */
export function parseSceneMaterialResponseProfile(
  value: unknown
): SceneMaterialResponseProfile {
  const record = requireRecord(
    value,
    "sceneMaterialResponseProfile"
  );
  if (
    record.schemaVersion !==
    SCENE_MATERIAL_RESPONSE_PROFILE_SCHEMA_VERSION
  ) {
    throw new InvalidConfigurationError(
      'sceneMaterialResponseProfile.schemaVersion must be "' +
        SCENE_MATERIAL_RESPONSE_PROFILE_SCHEMA_VERSION +
        '".'
    );
  }
  if (!Array.isArray(record.materials)) {
    throw new InvalidConfigurationError(
      "sceneMaterialResponseProfile.materials must be an array."
    );
  }

  const materials = record.materials.map(
    (entry, index) => {
      const path =
        "sceneMaterialResponseProfile.materials[" +
        index +
        "]";
      const material = requireRecord(
        entry,
        path
      );
      return {
        materialResponseId:
          requireNonEmptyString(
            material.materialResponseId,
            path + ".materialResponseId"
          ),
        evidence: parseEvidenceList(
          material.evidence,
          path + ".evidence"
        ),
        representation:
          parseMaterialRepresentation(
            material.representation,
            path + ".representation"
          )
      };
    }
  );
  const ids = materials.map(
    (entry) => entry.materialResponseId
  );
  if (new Set(ids).size !== ids.length) {
    throw new InvalidConfigurationError(
      "sceneMaterialResponseProfile.materials[].materialResponseId must not contain duplicates."
    );
  }

  if (record.fluorescenceModeled !== false) {
    throw new InvalidConfigurationError(
      "sceneMaterialResponseProfile.fluorescenceModeled must be false in schema 0.1.0."
    );
  }
  if (
    record.volumetricMaterialTransportModeled !==
    false
  ) {
    throw new InvalidConfigurationError(
      "sceneMaterialResponseProfile.volumetricMaterialTransportModeled must be false in schema 0.1.0."
    );
  }
  if (record.polarizationModeled !== false) {
    throw new InvalidConfigurationError(
      "sceneMaterialResponseProfile.polarizationModeled must be false in schema 0.1.0."
    );
  }

  return {
    schemaVersion:
      SCENE_MATERIAL_RESPONSE_PROFILE_SCHEMA_VERSION,
    profileId: requireNonEmptyString(
      record.profileId,
      "sceneMaterialResponseProfile.profileId"
    ),
    sceneId: requireNonEmptyString(
      record.sceneId,
      "sceneMaterialResponseProfile.sceneId"
    ),
    evidence: parseEvidenceList(
      record.evidence,
      "sceneMaterialResponseProfile.evidence"
    ),
    materials,
    fluorescenceModeled: false,
    volumetricMaterialTransportModeled:
      false,
    polarizationModeled: false
  };
}

/**
 * Returns the conservative material fidelity represented by a profile.
 */
export function assessSceneMaterialResponseFidelity(
  profile: SceneMaterialResponseProfile
): SceneMaterialResponseFidelity {
  if (
    profile.materials.some(
      (entry) =>
        entry.representation.kind ===
        "unresolved"
    )
  ) {
    return "unresolved";
  }

  const kinds = new Set(
    profile.materials.map(
      (entry) => entry.representation.kind
    )
  );
  if (
    kinds.size === 0 ||
    kinds.has("unresolved")
  ) {
    return "unresolved";
  }
  if (
    kinds.size === 1 &&
    kinds.has(
      "spectral-wavelength-preserving-data"
    )
  ) {
    return "spectral-data";
  }
  if (
    kinds.size === 1 &&
    kinds.has("rgb-pbr-approximation")
  ) {
    return "rgb-pbr-approximation";
  }
  return "mixed";
}

function parseProviderFidelity(
  value: unknown,
  path: string
): SceneRadianceProviderProfile["fidelity"] {
  const record = requireRecord(value, path);
  const spectral = record.spectral;
  if (
    spectral !== "wavelength-resolved" &&
    spectral !==
      "rgb-derived-approximation"
  ) {
    throw new InvalidConfigurationError(
      path + ".spectral is invalid."
    );
  }
  const material = record.material;
  if (
    material !== "spectral-data" &&
    material !== "rgb-pbr-approximation" &&
    material !== "mixed" &&
    material !== "unresolved"
  ) {
    throw new InvalidConfigurationError(
      path + ".material is invalid."
    );
  }
  const parseVisibility = (
    candidate: unknown,
    candidatePath: string
  ): SceneRadianceProviderVisibilityFidelity => {
    if (
      candidate !== "resolved" &&
      candidate !== "approximation" &&
      candidate !== "not-modeled"
    ) {
      throw new InvalidConfigurationError(
        candidatePath + " is invalid."
      );
    }
    return candidate;
  };
  const parseTransport = (
    candidate: unknown,
    candidatePath: string
  ): SceneRadianceProviderTransportFidelity => {
    if (
      candidate !== "resolved" &&
      candidate !== "approximation" &&
      candidate !== "not-modeled"
    ) {
      throw new InvalidConfigurationError(
        candidatePath + " is invalid."
      );
    }
    return candidate;
  };

  return {
    spectral,
    material,
    visibility: parseVisibility(
      record.visibility,
      path + ".visibility"
    ),
    directTransport: parseTransport(
      record.directTransport,
      path + ".directTransport"
    ),
    indirectTransport: parseTransport(
      record.indirectTransport,
      path + ".indirectTransport"
    )
  };
}

/**
 * Parses a renderer-neutral provider capability/profile declaration.
 *
 * Schema 0.1.0 is deliberately approximation-only. A provider may consume
 * calibrated inputs, but this contract does not authorize a calibrated
 * outgoing-radiance claim until later spectral/transport completeness work.
 */
export function parseSceneRadianceProviderProfile(
  value: unknown
): SceneRadianceProviderProfile {
  const record = requireRecord(
    value,
    "sceneRadianceProviderProfile"
  );
  if (
    record.schemaVersion !==
    SCENE_RADIANCE_PROVIDER_PROFILE_SCHEMA_VERSION
  ) {
    throw new InvalidConfigurationError(
      'sceneRadianceProviderProfile.schemaVersion must be "' +
        SCENE_RADIANCE_PROVIDER_PROFILE_SCHEMA_VERSION +
        '".'
    );
  }
  if (
    record.outputQuantity !==
    "outgoing-spectral-radiance"
  ) {
    throw new InvalidConfigurationError(
      'sceneRadianceProviderProfile.outputQuantity must be "outgoing-spectral-radiance".'
    );
  }
  if (record.outputUnit !== "W/m^2/sr/nm") {
    throw new InvalidConfigurationError(
      'sceneRadianceProviderProfile.outputUnit must be "W/m^2/sr/nm".'
    );
  }
  if (
    record.scientificStatus !==
    "approximation"
  ) {
    throw new InvalidConfigurationError(
      'sceneRadianceProviderProfile.scientificStatus must be "approximation" in schema 0.1.0.'
    );
  }
  if (
    record.wavelengthChangingTransportModeled !==
    false ||
    record.volumetricTransportModeled !==
    false ||
    record.polarizationModeled !== false
  ) {
    throw new InvalidConfigurationError(
      "sceneRadianceProviderProfile wavelength-changing, volumetric, and polarization transport flags must all be false in schema 0.1.0."
    );
  }

  return {
    schemaVersion:
      SCENE_RADIANCE_PROVIDER_PROFILE_SCHEMA_VERSION,
    profileId: requireNonEmptyString(
      record.profileId,
      "sceneRadianceProviderProfile.profileId"
    ),
    sceneId: requireNonEmptyString(
      record.sceneId,
      "sceneRadianceProviderProfile.sceneId"
    ),
    illuminationProfileId:
      requireNonEmptyString(
        record.illuminationProfileId,
        "sceneRadianceProviderProfile.illuminationProfileId"
      ),
    materialResponseProfileId:
      requireNonEmptyString(
        record.materialResponseProfileId,
        "sceneRadianceProviderProfile.materialResponseProfileId"
      ),
    outputQuantity:
      "outgoing-spectral-radiance",
    outputUnit: "W/m^2/sr/nm",
    scientificStatus: "approximation",
    uncertainty: parseUncertainty(
      record.uncertainty,
      "sceneRadianceProviderProfile.uncertainty"
    ),
    fidelity: parseProviderFidelity(
      record.fidelity,
      "sceneRadianceProviderProfile.fidelity"
    ),
    wavelengthChangingTransportModeled:
      false,
    volumetricTransportModeled: false,
    polarizationModeled: false,
    evidence: parseEvidenceList(
      record.evidence,
      "sceneRadianceProviderProfile.evidence"
    ),
    limitations: parseLimitations(
      record.limitations,
      "sceneRadianceProviderProfile.limitations"
    )
  };
}

function parsePositiveWavelengthNanometers(
  value: unknown,
  path: string
): number {
  const wavelength = requireFinite(
    value,
    path
  );
  if (wavelength <= 0) {
    throw new InvalidConfigurationError(
      path + " must be greater than zero."
    );
  }
  return wavelength;
}

function parseResolvedWavelengthBasis(
  value: unknown,
  path: string
): Exclude<
  SpectralWavelengthBasis,
  "unspecified"
> {
  const basis = parseSpectralWavelengthBasis(
    value,
    path
  );
  if (basis === "unspecified") {
    throw new InvalidConfigurationError(
      path +
        " must be air or vacuum for outgoing spectral radiance."
    );
  }
  return basis;
}

function parseEvaluationTarget(
  value: unknown,
  path: string
): SceneRadianceEvaluationTarget {
  const record = requireRecord(value, path);
  if (record.kind === "surface-point") {
    return {
      kind: "surface-point",
      sceneObjectId: requireNonEmptyString(
        record.sceneObjectId,
        path + ".sceneObjectId"
      ),
      materialResponseId:
        requireNonEmptyString(
          record.materialResponseId,
          path + ".materialResponseId"
        ),
      positionM: parseVector3(
        record.positionM,
        path + ".positionM"
      ),
      outgoingDirectionUnitVector:
        parseUnitDirection(
          record.outgoingDirectionUnitVector,
          path +
            ".outgoingDirectionUnitVector"
        )
    };
  }
  if (
    record.kind ===
    "environment-direction"
  ) {
    return {
      kind: "environment-direction",
      outgoingDirectionUnitVector:
        parseUnitDirection(
          record.outgoingDirectionUnitVector,
          path +
            ".outgoingDirectionUnitVector"
        )
    };
  }
  throw new InvalidConfigurationError(
    path + ".kind is invalid."
  );
}

/**
 * Parses one provider evaluation request at an explicit scene target,
 * physical time, wavelength, and outgoing direction.
 */
export function parseSceneRadianceEvaluationRequest(
  value: unknown
): SceneRadianceEvaluationRequest {
  const record = requireRecord(
    value,
    "sceneRadianceEvaluationRequest"
  );
  if (
    record.schemaVersion !==
    SCENE_RADIANCE_EVALUATION_SCHEMA_VERSION
  ) {
    throw new InvalidConfigurationError(
      'sceneRadianceEvaluationRequest.schemaVersion must be "' +
        SCENE_RADIANCE_EVALUATION_SCHEMA_VERSION +
        '".'
    );
  }

  return {
    schemaVersion:
      SCENE_RADIANCE_EVALUATION_SCHEMA_VERSION,
    sampleId: requireNonEmptyString(
      record.sampleId,
      "sceneRadianceEvaluationRequest.sampleId"
    ),
    providerProfileId:
      requireNonEmptyString(
        record.providerProfileId,
        "sceneRadianceEvaluationRequest.providerProfileId"
      ),
    sceneId: requireNonEmptyString(
      record.sceneId,
      "sceneRadianceEvaluationRequest.sceneId"
    ),
    illuminationProfileId:
      requireNonEmptyString(
        record.illuminationProfileId,
        "sceneRadianceEvaluationRequest.illuminationProfileId"
      ),
    materialResponseProfileId:
      requireNonEmptyString(
        record.materialResponseProfileId,
        "sceneRadianceEvaluationRequest.materialResponseProfileId"
      ),
    target: parseEvaluationTarget(
      record.target,
      "sceneRadianceEvaluationRequest.target"
    ),
    timeSecondsFromExposureStart:
      requireNonNegativeFinite(
        record.timeSecondsFromExposureStart,
        "sceneRadianceEvaluationRequest.timeSecondsFromExposureStart"
      ),
    wavelengthNanometers:
      parsePositiveWavelengthNanometers(
        record.wavelengthNanometers,
        "sceneRadianceEvaluationRequest.wavelengthNanometers"
      ),
    wavelengthBasis:
      parseResolvedWavelengthBasis(
        record.wavelengthBasis,
        "sceneRadianceEvaluationRequest.wavelengthBasis"
      )
  };
}

/**
 * Parses one provider-produced outgoing spectral-radiance result.
 *
 * The numeric value is accepted as provider output; parsing validates units,
 * finite/nonnegative value, provenance, and identity fields but does not prove
 * that the provider's transport calculation is physically correct.
 */
export function parseSceneRadianceEvaluationResult(
  value: unknown
): SceneRadianceEvaluationResult {
  const record = requireRecord(
    value,
    "sceneRadianceEvaluationResult"
  );
  if (
    record.schemaVersion !==
    SCENE_RADIANCE_EVALUATION_SCHEMA_VERSION
  ) {
    throw new InvalidConfigurationError(
      'sceneRadianceEvaluationResult.schemaVersion must be "' +
        SCENE_RADIANCE_EVALUATION_SCHEMA_VERSION +
        '".'
    );
  }
  if (
    record.quantity !==
    "outgoing-spectral-radiance"
  ) {
    throw new InvalidConfigurationError(
      'sceneRadianceEvaluationResult.quantity must be "outgoing-spectral-radiance".'
    );
  }
  if (record.unit !== "W/m^2/sr/nm") {
    throw new InvalidConfigurationError(
      'sceneRadianceEvaluationResult.unit must be "W/m^2/sr/nm".'
    );
  }
  if (
    record.scientificStatus !==
    "approximation"
  ) {
    throw new InvalidConfigurationError(
      'sceneRadianceEvaluationResult.scientificStatus must be "approximation" in schema 0.1.0.'
    );
  }

  return {
    schemaVersion:
      SCENE_RADIANCE_EVALUATION_SCHEMA_VERSION,
    sampleId: requireNonEmptyString(
      record.sampleId,
      "sceneRadianceEvaluationResult.sampleId"
    ),
    providerProfileId:
      requireNonEmptyString(
        record.providerProfileId,
        "sceneRadianceEvaluationResult.providerProfileId"
      ),
    sceneId: requireNonEmptyString(
      record.sceneId,
      "sceneRadianceEvaluationResult.sceneId"
    ),
    wavelengthNanometers:
      parsePositiveWavelengthNanometers(
        record.wavelengthNanometers,
        "sceneRadianceEvaluationResult.wavelengthNanometers"
      ),
    wavelengthBasis:
      parseResolvedWavelengthBasis(
        record.wavelengthBasis,
        "sceneRadianceEvaluationResult.wavelengthBasis"
      ),
    quantity:
      "outgoing-spectral-radiance",
    unit: "W/m^2/sr/nm",
    spectralRadianceWattsPerSquareMeterSteradianNanometer:
      requireNonNegativeFinite(
        record.spectralRadianceWattsPerSquareMeterSteradianNanometer,
        "sceneRadianceEvaluationResult.spectralRadianceWattsPerSquareMeterSteradianNanometer"
      ),
    scientificStatus: "approximation",
    uncertainty: parseUncertainty(
      record.uncertainty,
      "sceneRadianceEvaluationResult.uncertainty"
    ),
    evidence: parseEvidenceList(
      record.evidence,
      "sceneRadianceEvaluationResult.evidence"
    ),
    limitations: parseLimitations(
      record.limitations,
      "sceneRadianceEvaluationResult.limitations"
    )
  };
}

function requireEqual(
  actual: unknown,
  expected: unknown,
  message: string
): void {
  if (actual !== expected) {
    throw new InvalidConfigurationError(
      message
    );
  }
}

/**
 * Validates exact identity/binding relationships around provider output.
 *
 * This function never recomputes the radiance value and never promotes the
 * provider's approximation to calibrated radiometry.
 */
export function validateSceneRadianceEvaluationBindings(
  input:
    ValidateSceneRadianceEvaluationBindingsInput
): SceneRadianceEvaluationBindingAssessment {
  const {
    providerProfile,
    illuminationProfile,
    materialResponseProfile,
    request,
    result
  } = input;

  requireEqual(
    providerProfile.sceneId,
    illuminationProfile.sceneId,
    "Provider and illumination profiles must reference the same sceneId."
  );
  requireEqual(
    providerProfile.sceneId,
    materialResponseProfile.sceneId,
    "Provider and material-response profiles must reference the same sceneId."
  );
  requireEqual(
    providerProfile.illuminationProfileId,
    illuminationProfile.profileId,
    "Provider illuminationProfileId must match the supplied illumination profile."
  );
  requireEqual(
    providerProfile.materialResponseProfileId,
    materialResponseProfile.profileId,
    "Provider materialResponseProfileId must match the supplied material-response profile."
  );

  const materialResponseFidelity =
    assessSceneMaterialResponseFidelity(
      materialResponseProfile
    );
  requireEqual(
    providerProfile.fidelity.material,
    materialResponseFidelity,
    "Provider material fidelity must match the supplied material-response profile."
  );

  requireEqual(
    request.providerProfileId,
    providerProfile.profileId,
    "Request providerProfileId must match the supplied provider profile."
  );
  requireEqual(
    request.sceneId,
    providerProfile.sceneId,
    "Request sceneId must match the supplied provider profile."
  );
  requireEqual(
    request.illuminationProfileId,
    illuminationProfile.profileId,
    "Request illuminationProfileId must match the supplied illumination profile."
  );
  requireEqual(
    request.materialResponseProfileId,
    materialResponseProfile.profileId,
    "Request materialResponseProfileId must match the supplied material-response profile."
  );

  if (request.target.kind === "surface-point") {
    if (
      !materialResponseProfile.materials.some(
        (material) =>
          material.materialResponseId ===
          request.target.materialResponseId
      )
    ) {
      throw new InvalidConfigurationError(
        "Request surface target materialResponseId is not declared by the supplied material-response profile."
      );
    }
  }

  requireEqual(
    result.sampleId,
    request.sampleId,
    "Result sampleId must match the request."
  );
  requireEqual(
    result.providerProfileId,
    request.providerProfileId,
    "Result providerProfileId must match the request."
  );
  requireEqual(
    result.sceneId,
    request.sceneId,
    "Result sceneId must match the request."
  );
  requireEqual(
    result.wavelengthNanometers,
    request.wavelengthNanometers,
    "Result wavelengthNanometers must match the request exactly."
  );
  requireEqual(
    result.wavelengthBasis,
    request.wavelengthBasis,
    "Result wavelengthBasis must match the request."
  );

  return {
    providerBindingsMatched: true,
    requestResultIdentityMatched: true,
    materialResponseFidelity,
    calibratedRadianceClaimAuthorized: false,
    sensorPlaneIrradianceCalculated:
      false,
    opticsApplied: false,
    photonsCalculated: false
  };
}
