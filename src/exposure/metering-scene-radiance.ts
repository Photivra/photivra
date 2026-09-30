// SPDX-License-Identifier: Apache-2.0

import { InvalidConfigurationError } from "../core/configuration-error.js";
import {
  parseEvidenceList,
  type EvidenceProvenance
} from "../core/evidence-provenance.js";
import { InvalidScientificInputError } from "../core/validation.js";
import type {
  ResolvedCaptureGeometry
} from "../output/capture-geometry.js";
import {
  assessSceneMaterialResponseFidelity,
  type SceneMaterialResponseProfile,
  type SceneRadianceProviderProfile
} from "../schema/scene-radiance.js";
import type {
  SceneIlluminationProfile
} from "../schema/illumination.js";
import type {
  SceneIlluminationTemporalProfile
} from "../schema/illumination-temporal.js";
import type {
  ExposureMeteringSampleSet,
  ExposureMeteringZoneSample
} from "./metering.js";

type UnknownRecord = Record<string, unknown>;

export const SCENE_RADIANCE_METERING_DERIVATION_SCHEMA_VERSION =
  "0.1.0" as const;

export interface SceneRadianceMeteringDerivationProfile {
  schemaVersion:
    typeof SCENE_RADIANCE_METERING_DERIVATION_SCHEMA_VERSION;
  derivationId: string;
  scientificStatus: "approximation";
  method:
    "renderer-provided-pre-exposure-relative-reduction";
  spectralWeighting:
    "not-calibrated";
  evidence: readonly EvidenceProvenance[];
  limitation: string;
}

export type SceneRadianceMeteringTemporalContext =
  | {
      kind: "time-invariant";
    }
  | {
      kind:
        "registered-time-varying";
      illuminationTemporalProfileId:
        string;
      timeReference:
        "first-opening-boundary-phase";
      captureTimeSecondsFromReference:
        number;
    };

export interface SceneRadianceMeteringSourceContext {
  kind:
    "scene-radiance-provider-derived-relative";
  sceneId: string;
  sceneStateId: string;
  providerProfileId: string;
  illuminationProfileId: string;
  materialResponseProfileId: string;
  derivationProfileId: string;
  providerScientificStatus:
    SceneRadianceProviderProfile["scientificStatus"];
  materialResponseFidelity:
    ReturnType<
      typeof assessSceneMaterialResponseFidelity
    >;
  temporal:
    SceneRadianceMeteringTemporalContext;
  spectralReductionCalibrated: false;
  calibratedLuminanceClaimAuthorized:
    false;
  calibratedSceneRadianceClaimAuthorized:
    false;
}

export interface SceneRadianceDerivedExposureMeteringSampleSet
  extends ExposureMeteringSampleSet {
  sourceContext:
    SceneRadianceMeteringSourceContext;
}

export interface CreateSceneRadianceDerivedExposureMeteringSampleSetInput {
  measurementId: string;
  sceneStateId: string;
  providerProfile:
    SceneRadianceProviderProfile;
  illuminationProfile:
    SceneIlluminationProfile;
  materialResponseProfile:
    SceneMaterialResponseProfile;
  illuminationTemporalProfile?:
    SceneIlluminationTemporalProfile;
  captureTimeSecondsFromReference?: number;
  captureGeometry:
    ResolvedCaptureGeometry;
  derivationProfile:
    SceneRadianceMeteringDerivationProfile;
  samples:
    readonly ExposureMeteringZoneSample[];
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
    throw new InvalidScientificInputError(
      path + " must be finite."
    );
  }
  return value;
}

/**
 * Parses the declared approximation used to reduce renderer/provider scene
 * information into the scalar relative-linear domain consumed by metering.
 *
 * This profile explicitly does not authorize a calibrated luminance or
 * spectral-to-photometric conversion claim.
 */
export function parseSceneRadianceMeteringDerivationProfile(
  value: unknown
): SceneRadianceMeteringDerivationProfile {
  const record = requireRecord(
    value,
    "sceneRadianceMeteringDerivationProfile"
  );

  if (
    record.schemaVersion !==
    SCENE_RADIANCE_METERING_DERIVATION_SCHEMA_VERSION
  ) {
    throw new InvalidConfigurationError(
      'sceneRadianceMeteringDerivationProfile.schemaVersion must be "' +
        SCENE_RADIANCE_METERING_DERIVATION_SCHEMA_VERSION +
        '".'
    );
  }
  if (
    record.scientificStatus !==
    "approximation"
  ) {
    throw new InvalidConfigurationError(
      'sceneRadianceMeteringDerivationProfile.scientificStatus must be "approximation" in schema 0.1.0.'
    );
  }
  if (
    record.method !==
    "renderer-provided-pre-exposure-relative-reduction"
  ) {
    throw new InvalidConfigurationError(
      'sceneRadianceMeteringDerivationProfile.method must be "renderer-provided-pre-exposure-relative-reduction".'
    );
  }
  if (
    record.spectralWeighting !==
    "not-calibrated"
  ) {
    throw new InvalidConfigurationError(
      'sceneRadianceMeteringDerivationProfile.spectralWeighting must be "not-calibrated" in schema 0.1.0.'
    );
  }

  return {
    schemaVersion:
      SCENE_RADIANCE_METERING_DERIVATION_SCHEMA_VERSION,
    derivationId:
      requireNonEmptyString(
        record.derivationId,
        "sceneRadianceMeteringDerivationProfile.derivationId"
      ),
    scientificStatus: "approximation",
    method:
      "renderer-provided-pre-exposure-relative-reduction",
    spectralWeighting:
      "not-calibrated",
    evidence: parseEvidenceList(
      record.evidence,
      "sceneRadianceMeteringDerivationProfile.evidence"
    ),
    limitation:
      requireNonEmptyString(
        record.limitation,
        "sceneRadianceMeteringDerivationProfile.limitation"
      )
  };
}

function validateProviderContext(
  input:
    CreateSceneRadianceDerivedExposureMeteringSampleSetInput
): ReturnType<
  typeof assessSceneMaterialResponseFidelity
> {
  const {
    providerProfile,
    illuminationProfile,
    illuminationTemporalProfile,
    materialResponseProfile
  } = input;

  if (
    providerProfile.sceneId !==
    illuminationProfile.sceneId
  ) {
    throw new InvalidScientificInputError(
      "Provider and illumination profiles must reference the same sceneId."
    );
  }
  if (
    providerProfile.sceneId !==
    materialResponseProfile.sceneId
  ) {
    throw new InvalidScientificInputError(
      "Provider and material-response profiles must reference the same sceneId."
    );
  }
  if (
    providerProfile.illuminationProfileId !==
    illuminationProfile.profileId
  ) {
    throw new InvalidScientificInputError(
      "Provider illuminationProfileId must match the supplied illumination profile."
    );
  }
  if (
    providerProfile.materialResponseProfileId !==
    materialResponseProfile.profileId
  ) {
    throw new InvalidScientificInputError(
      "Provider materialResponseProfileId must match the supplied material-response profile."
    );
  }

  const materialResponseFidelity =
    assessSceneMaterialResponseFidelity(
      materialResponseProfile
    );
  if (
    providerProfile.fidelity.material !==
    materialResponseFidelity
  ) {
    throw new InvalidScientificInputError(
      "Provider material fidelity must match the supplied material-response profile."
    );
  }

  if (
    providerProfile
      .illuminationTemporalProfileId ===
    undefined
  ) {
    if (
      illuminationTemporalProfile !==
      undefined
    ) {
      throw new InvalidScientificInputError(
        "A temporal illumination profile was supplied but the provider profile does not bind one."
      );
    }
    if (
      input
        .captureTimeSecondsFromReference !==
      undefined
    ) {
      throw new InvalidScientificInputError(
        "captureTimeSecondsFromReference must be omitted for a time-invariant provider context."
      );
    }
    return materialResponseFidelity;
  }

  if (
    illuminationTemporalProfile ===
    undefined
  ) {
    throw new InvalidScientificInputError(
      "Provider illuminationTemporalProfileId requires the matching temporal illumination profile."
    );
  }
  if (
    providerProfile
      .illuminationTemporalProfileId !==
    illuminationTemporalProfile.profileId
  ) {
    throw new InvalidScientificInputError(
      "Provider illuminationTemporalProfileId must match the supplied temporal illumination profile."
    );
  }
  if (
    providerProfile.sceneId !==
    illuminationTemporalProfile.sceneId
  ) {
    throw new InvalidScientificInputError(
      "Provider and temporal illumination profiles must reference the same sceneId."
    );
  }
  if (
    providerProfile
      .illuminationProfileId !==
    illuminationTemporalProfile
      .illuminationProfileId
  ) {
    throw new InvalidScientificInputError(
      "Temporal illumination profile must bind the provider's illuminationProfileId."
    );
  }

  const knownSourceIds =
    new Set(
      illuminationProfile.sources.map(
        (entry) => entry.sourceId
      )
    );
  for (
    const binding of
    illuminationTemporalProfile
      .sourceBindings
  ) {
    if (
      !knownSourceIds.has(
        binding.sourceId
      )
    ) {
      throw new InvalidScientificInputError(
        "Temporal illumination source binding references a sourceId that is not declared by the illumination profile."
      );
    }
  }
  if (
    input
      .captureTimeSecondsFromReference ===
    undefined
  ) {
    throw new InvalidScientificInputError(
      "Time-varying scene-radiance metering requires an explicit captureTimeSecondsFromReference."
    );
  }
  requireFinite(
    input.captureTimeSecondsFromReference,
    "captureTimeSecondsFromReference"
  );

  return materialResponseFidelity;
}

/**
 * Creates a relative pre-exposure meter sample set bound to one validated #85
 * provider context.
 *
 * The caller/renderer still supplies the scalar relative samples. This bridge
 * validates identity and timing semantics only; it does not convert spectral
 * radiance into luminance or define a calibrated meter spectral response.
 */
export function createSceneRadianceDerivedExposureMeteringSampleSet(
  input:
    CreateSceneRadianceDerivedExposureMeteringSampleSetInput
): SceneRadianceDerivedExposureMeteringSampleSet {
  const derivationProfile =
    parseSceneRadianceMeteringDerivationProfile(
      input.derivationProfile
    );
  const materialResponseFidelity =
    validateProviderContext(input);

  if (
    typeof input.measurementId !==
      "string" ||
    input.measurementId.trim().length ===
      0
  ) {
    throw new InvalidScientificInputError(
      "measurementId must be a non-empty string."
    );
  }
  if (
    typeof input.sceneStateId !==
      "string" ||
    input.sceneStateId.trim().length ===
      0
  ) {
    throw new InvalidScientificInputError(
      "sceneStateId must be a non-empty string."
    );
  }
  if (
    !Array.isArray(input.samples) ||
    input.samples.length === 0
  ) {
    throw new InvalidScientificInputError(
      "samples must be a non-empty array."
    );
  }

  const temporal:
    SceneRadianceMeteringTemporalContext =
    input.providerProfile
      .illuminationTemporalProfileId ===
    undefined
      ? {
          kind: "time-invariant"
        }
      : {
          kind:
            "registered-time-varying",
          illuminationTemporalProfileId:
            input.providerProfile
              .illuminationTemporalProfileId,
          timeReference:
            "first-opening-boundary-phase",
          captureTimeSecondsFromReference:
            input
              .captureTimeSecondsFromReference!
        };

  return {
    measurementId:
      input.measurementId.trim(),
    sceneStateId:
      input.sceneStateId.trim(),
    inputDomain:
      "relative-pre-exposure-linear-signal",
    captureRegion:
      "oriented-active-capture",
    captureGeometry:
      input.captureGeometry,
    processingState: {
      exposureSettingsApplied: false,
      whiteBalanceApplied: false,
      toneMappingApplied: false,
      displayGammaApplied: false,
      sharpeningApplied: false
    },
    samples: input.samples,
    sourceContext: {
      kind:
        "scene-radiance-provider-derived-relative",
      sceneId:
        input.providerProfile.sceneId,
      sceneStateId:
        input.sceneStateId.trim(),
      providerProfileId:
        input.providerProfile.profileId,
      illuminationProfileId:
        input.illuminationProfile.profileId,
      materialResponseProfileId:
        input.materialResponseProfile
          .profileId,
      derivationProfileId:
        derivationProfile.derivationId,
      providerScientificStatus:
        input.providerProfile
          .scientificStatus,
      materialResponseFidelity,
      temporal,
      spectralReductionCalibrated:
        false,
      calibratedLuminanceClaimAuthorized:
        false,
      calibratedSceneRadianceClaimAuthorized:
        false
    }
  };
}
