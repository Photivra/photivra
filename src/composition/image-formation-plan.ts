// SPDX-License-Identifier: Apache-2.0

import {
  RELEASE_SEQUENCE_VERSION,
  type ReleaseTimingConstraint,
  type ResolvedReleaseFrame
} from "../capture/release-sequence.js";
import {
  parseResolvedWhiteBalanceState,
  type ResolvedWhiteBalanceState
} from "../color/white-balance.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";
import {
  getImageFormationContract,
  IMAGE_FORMATION_CONTRACT_VERSION,
  type ImageFormationEffectId,
  type ImageFormationStageId
} from "../core/image-formation.js";
import { ENGINE_API_VERSION } from "../core/version.js";
import {
  SCIENTIFIC_ASSURANCE_CONTRACT_VERSION,
  composeScientificAssurance,
  type ComposedScientificAssurance,
  type ScientificAssuranceComponent,
  type ScientificAssuranceComponentUncertainty
} from "../core/scientific-assurance.js";
import { InvalidScientificInputError } from "../core/validation.js";
import {
  calculateCaptureRotationTemporalQuadrature,
  type CaptureRotationTemporalQuadrature
} from "../motion/capture-rotation-temporal-quadrature.js";
import type {
  CameraAngularVelocityRadPerSec
} from "../motion/camera-rotation.js";
import type {
  CaptureOrientation
} from "../output/capture-geometry.js";
import {
  calculateCaptureExposureWindows,
  type CalculateCaptureExposureWindowsInput,
  type CaptureExposureWindows
} from "../sensor/exposure-window.js";
import {
  calculateSensorReadoutTiming,
  type SensorReadoutTiming,
  type SensorReadoutTimingDeclaration
} from "../sensor/readout-timing.js";
import type {
  SensorImagingArea
} from "../sensor/sensor-geometry.js";
import {
  GENERIC_EQUIPMENT_EXPOSURE_CAPABILITY_SCHEMA_VERSION,
  type ResolvedGenericEquipmentExposureCapabilities,
  type ResolvedNumericSettingGrid
} from "../equipment/exposure-capabilities.js";
import {
  parseFrontOfLensFilterProfile,
  resolveFrontOfLensFilterTransmission,
  type FrontOfLensFilterProfile,
  type FrontOfLensFilterUncertainty
} from "../optics/front-of-lens-filter.js";
import {
  parseFocusPlane,
  type FocusPlane
} from "../optics/focus-state.js";
import {
  calculateSceneRadianceToSensorIrradiance,
  parseSceneToSensorIrradianceProfile,
  type OpticalBridgeFieldThroughput,
  type OpticalBridgeFocusContext,
  type OpticalBridgeUncertainty,
  type SceneToSensorIrradianceProfile,
  type SceneToSensorIrradianceResult
} from "../optics/scene-to-sensor-irradiance.js";
import {
  parseSceneRadianceEvaluationRequest,
  parseSceneRadianceEvaluationResult,
  type SceneRadianceEvaluationRequest,
  type SceneRadianceEvaluationResult,
  type SceneRadianceUncertainty
} from "../schema/scene-radiance.js";

type UnknownRecord = Record<string, unknown>;

export const PRODUCTION_IMAGE_FORMATION_PLAN_VERSION =
  "0.5.0" as const;
export const PREPARED_IMAGE_FORMATION_CONTEXT_VERSION =
  "0.1.0" as const;
export const PRODUCTION_CAPTURE_SNAPSHOT_VERSION =
  "0.3.0" as const;
export const RENDERER_CAPABILITY_SCHEMA_VERSION =
  "0.1.0" as const;
export const IMAGE_FORMATION_FIDELITY_PROFILE_SCHEMA_VERSION =
  "0.1.0" as const;

export type RendererConsumerKind =
  | "interactive-optimized"
  | "reference";

export interface RendererCapabilityDeclaration {
  schemaVersion:
    typeof RENDERER_CAPABILITY_SCHEMA_VERSION;
  rendererId: string;
  rendererVersion: string;
  consumerKind: RendererConsumerKind;
  supportedStages:
    readonly ImageFormationStageId[];
  supportedEffects:
    readonly ImageFormationEffectId[];
  spectralCapability:
    | "wavelength-resolved"
    | "wavelength-independent-approximation";
  temporalSampling:
    | {
        kind: "none";
      }
    | {
        kind: "bounded";
        maximumSamples: number;
      };
  depthCapability:
    | "none"
    | "per-layer";
  inverseFieldMapping: boolean;
  alphaRepresentation:
    | "premultiplied"
    | "straight";
  preservesDepthOrderAcrossWarps:
    boolean;
  sensorDomainProcessing: boolean;
}

export interface RequiredImageFormationEffect {
  effectId: ImageFormationEffectId;
  modelId: string;
  modelVersion: string;
}

export interface ImageFormationFidelityProfile {
  schemaVersion:
    typeof IMAGE_FORMATION_FIDELITY_PROFILE_SCHEMA_VERSION;
  profileId: string;
  profileVersion: string;
  requiredStages:
    readonly ImageFormationStageId[];
  requiredEffects:
    readonly RequiredImageFormationEffect[];
  rendererRequirements: {
    spectral:
      | "wavelength-resolved"
      | "wavelength-independent-approximation";
    sensorDomainProcessing: boolean;
    depth:
      | "none"
      | "per-layer";
  };
}

export interface PrepareImageFormationContextInput {
  contextId: string;
  sceneId: string;
  sceneRadianceProviderProfileId:
    string;
  outputGeometryProfileId: string;
  equipmentCapabilities:
    ResolvedGenericEquipmentExposureCapabilities;
  opticalBridgeProfile?:
    SceneToSensorIrradianceProfile;
  renderer:
    RendererCapabilityDeclaration;
  fidelity:
    ImageFormationFidelityProfile;
}

export interface PreparedImageFormationContext {
  version:
    typeof PREPARED_IMAGE_FORMATION_CONTEXT_VERSION;
  contextId: string;
  sceneId: string;
  sceneRadianceProviderProfileId:
    string;
  outputGeometryProfileId: string;
  equipmentCapabilities:
    ResolvedGenericEquipmentExposureCapabilities;
  opticalBridgeProfile?:
    SceneToSensorIrradianceProfile;
  renderer:
    RendererCapabilityDeclaration;
  fidelity:
    ImageFormationFidelityProfile;
  fingerprint: {
    algorithm:
      "fnv1a-32-non-cryptographic";
    value: string;
  };
}

export interface ProductionPhysicalSceneSample {
  sceneRadianceRequest:
    SceneRadianceEvaluationRequest;
  sceneRadianceResult:
    SceneRadianceEvaluationResult;
  focus:
    OpticalBridgeFocusContext;
  imagePointMm: {
    x: number;
    y: number;
  };
  fieldThroughput:
    OpticalBridgeFieldThroughput;
  frontOfLensFilters?:
    readonly FrontOfLensFilterProfile[];
}

export interface ProductionTemporalCaptureInput {
  exposureWindowInput:
    CalculateCaptureExposureWindowsInput;
  imagingArea: SensorImagingArea;
  orientation: CaptureOrientation;
  readout?:
    SensorReadoutTimingDeclaration;
  rotation?: {
    angularVelocityRadPerSec:
      CameraAngularVelocityRadPerSec;
    focusDistanceM?: number;
    temporalSampleCount: number;
  };
}

export interface ProductionTemporalCaptureResult {
  exposureWindows:
    CaptureExposureWindows;
  sensorReadoutTiming?:
    SensorReadoutTiming;
  rotationQuadrature?:
    CaptureRotationTemporalQuadrature;
  exposureTimeReference:
    "first-opening-boundary-phase";
  readoutExposureSynchronization:
    "not-assumed";
  sensorReadoutTimingRemainsSeparate:
    true;
  temporalRadianceIntegrated:
    false;
}

export interface ProductionReleaseFrameBinding {
  releaseSequenceVersion:
    typeof RELEASE_SEQUENCE_VERSION;
  sequenceId: string;
  releaseFrameId: string;
  frameIndex: number;
  exposure: {
    aperture: number;
    shutterSeconds: number;
    iso: number;
  };
  stochasticSeedUint32: number;
  exposureStartTimeSeconds: number;
  exposureEndTimeSeconds: number;
  sceneTimeSecondsFromSequenceStart:
    number;
  startIntervalFromPreviousSeconds:
    number | null;
  timingConstraints:
    readonly ReleaseTimingConstraint[];
  focus:
    ResolvedReleaseFrame["focus"];
  automation:
    ResolvedReleaseFrame["automation"];
  whiteBalanceStateId?: string;
}

export interface CreateProductionCaptureSnapshotFromReleaseFrameInput {
  captureId: string;
  sceneStateId: string;
  sceneTimeSecondsFromExposureStart:
    number;
  outputStateId: string;
  releaseFrame:
    ResolvedReleaseFrame;
  whiteBalanceState?:
    ResolvedWhiteBalanceState;
  physicalSceneSample?:
    ProductionPhysicalSceneSample;
  temporalCapture?:
    ProductionTemporalCaptureInput;
}

export interface CreateProductionCaptureSnapshotInput {
  captureId: string;
  releaseFrameId: string;
  sceneStateId: string;
  sceneTimeSecondsFromExposureStart:
    number;
  outputStateId: string;
  exposure: {
    aperture: number;
    shutterSeconds: number;
    iso: number;
  };
  stochasticSeedUint32: number;
  releaseFrameBinding?:
    ProductionReleaseFrameBinding;
  whiteBalanceState?:
    ResolvedWhiteBalanceState;
  physicalSceneSample?:
    ProductionPhysicalSceneSample;
  temporalCapture?:
    ProductionTemporalCaptureInput;
}

export interface ProductionCaptureSnapshot {
  version:
    typeof PRODUCTION_CAPTURE_SNAPSHOT_VERSION;
  captureId: string;
  releaseFrameId: string;
  sceneStateId: string;
  sceneTimeSecondsFromExposureStart:
    number;
  outputStateId: string;
  exposure: {
    aperture: number;
    shutterSeconds: number;
    iso: number;
  };
  stochasticSeedUint32: number;
  releaseFrameBinding?:
    ProductionReleaseFrameBinding;
  whiteBalanceState?:
    ResolvedWhiteBalanceState;
  physicalSceneSample?:
    ProductionPhysicalSceneSample;
  temporalCapture?:
    ProductionTemporalCaptureInput;
  fingerprint: {
    algorithm:
      "fnv1a-32-non-cryptographic";
    value: string;
  };
}

export type PlannedImageFormationStageState =
  | "active"
  | "modeled-zero"
  | "omitted-by-fidelity"
  | "unsupported"
  | "blocked";

export type PlannedScientificStatus =
  | "calibrated"
  | "approximation"
  | "not-applicable";

export interface PlannedImageFormationStage {
  stageId: ImageFormationStageId;
  contractStatus:
    ReturnType<
      typeof getImageFormationContract
    >["stages"][number]["status"];
  state:
    PlannedImageFormationStageState;
  scientificStatus:
    PlannedScientificStatus;
  requiredByFidelity: boolean;
  requiredUpstreamStages:
    readonly ImageFormationStageId[];
  coupledStages:
    readonly ImageFormationStageId[];
  modelId?: string;
  modelVersion?: string;
  resultIdentity?: string;
  blockerCodes:
    readonly ProductionImageFormationBlockerCode[];
}

export type PlannedImageFormationEffectState =
  | "active"
  | "modeled-zero"
  | "omitted-by-fidelity"
  | "unsupported"
  | "blocked";

export interface PlannedImageFormationEffect {
  effectId: ImageFormationEffectId;
  primaryStage: ImageFormationStageId;
  coupledStages:
    readonly ImageFormationStageId[];
  state:
    PlannedImageFormationEffectState;
  scientificStatus:
    PlannedScientificStatus;
  requiredByFidelity: boolean;
  modelId?: string;
  modelVersion?: string;
  blockerCodes:
    readonly ProductionImageFormationBlockerCode[];
}

export type ProductionImageFormationBlockerCode =
  | "engine-stage-not-composed"
  | "engine-effect-not-composed"
  | "renderer-stage-unsupported"
  | "renderer-effect-unsupported"
  | "renderer-spectral-capability-insufficient"
  | "renderer-sensor-domain-processing-unavailable"
  | "renderer-depth-capability-insufficient"
  | "renderer-inverse-field-mapping-required"
  | "renderer-premultiplied-alpha-required"
  | "renderer-depth-order-preservation-required"
  | "missing-optical-bridge-profile"
  | "missing-physical-scene-sample"
  | "undeclared-field-throughput-effect"
  | "physical-radiometry-evaluation-blocked"
  | "missing-temporal-capture-input"
  | "temporal-evaluation-blocked"
  | "missing-camera-rotation-model"
  | "missing-sensor-readout-timing"
  | "renderer-temporal-sampling-insufficient";

export interface ProductionImageFormationBlocker {
  code:
    ProductionImageFormationBlockerCode;
  message: string;
  stageId?: ImageFormationStageId;
  effectId?: ImageFormationEffectId;
}

export interface ProductionImageFormationPlan {
  version:
    typeof PRODUCTION_IMAGE_FORMATION_PLAN_VERSION;
  status: "ready" | "blocked";
  versions: {
    engineApi: typeof ENGINE_API_VERSION;
    imageFormationContract:
      typeof IMAGE_FORMATION_CONTRACT_VERSION;
    plan:
      typeof PRODUCTION_IMAGE_FORMATION_PLAN_VERSION;
    preparedContext:
      typeof PREPARED_IMAGE_FORMATION_CONTEXT_VERSION;
    captureSnapshot:
      typeof PRODUCTION_CAPTURE_SNAPSHOT_VERSION;
    rendererCapability:
      typeof RENDERER_CAPABILITY_SCHEMA_VERSION;
    fidelityProfile:
      typeof IMAGE_FORMATION_FIDELITY_PROFILE_SCHEMA_VERSION;
    scientificAssurance:
      typeof SCIENTIFIC_ASSURANCE_CONTRACT_VERSION;
  };
  contextIdentity: {
    contextId: string;
    preparedContextFingerprint:
      string;
  };
  captureIdentity: {
    captureId: string;
    releaseFrameId: string;
    sceneStateId: string;
    releaseSequenceId?: string;
    releaseFrameIndex?: number;
    whiteBalanceStateId?: string;
    captureSnapshotFingerprint:
      string;
  };
  rendererIdentity: {
    rendererId: string;
    rendererVersion: string;
    consumerKind:
      RendererConsumerKind;
  };
  fidelityIdentity: {
    profileId: string;
    profileVersion: string;
  };
  stagePlan:
    readonly PlannedImageFormationStage[];
  effectPlan:
    readonly PlannedImageFormationEffect[];
  blockers:
    readonly ProductionImageFormationBlocker[];
  physicalSceneToSensorResult?:
    SceneToSensorIrradianceResult;
  temporalCaptureResult?:
    ProductionTemporalCaptureResult;
  scientificAssurance?:
    ComposedScientificAssurance;
  stochastic: {
    captureSeedUint32: number;
    backendRandomnessMayRedefineScientificResult:
      false;
  };
  immutableCaptureSnapshot: true;
  legacyPocModified: false;
  fingerprint: {
    algorithm:
      "fnv1a-32-non-cryptographic";
    value: string;
    purpose:
      "deterministic-reproducibility-key-not-integrity-security";
  };
}

export interface CreateProductionImageFormationPlanInput {
  preparedContext:
    PreparedImageFormationContext;
  captureSnapshot:
    ProductionCaptureSnapshot;
}

const COMPOSER_SUPPORTED_STAGES =
  new Set<ImageFormationStageId>([
    "scene-ray-projection",
    "scene-radiance-evaluation",
    "lens-field-pupil-evaluation",
    "temporal-exposure-readout"
  ]);

const COMPOSER_SUPPORTED_EFFECTS =
  new Set<ImageFormationEffectId>([
    "illumination-vignetting",
    "spatial-camera-rotation",
    "rolling-readout"
  ]);

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
    throw new InvalidConfigurationError(
      path +
        " must be an unsigned 32-bit integer."
    );
  }
  return value;
}

function contractStageIds():
  ReadonlySet<ImageFormationStageId> {
  return new Set(
    getImageFormationContract()
      .stages.map(
        (stage) => stage.id
      )
  );
}

function contractEffectIds():
  ReadonlySet<ImageFormationEffectId> {
  return new Set(
    getImageFormationContract()
      .effectPlacements.map(
        (effect) => effect.id
      )
  );
}

function parseUniqueStageIds(
  value: unknown,
  path: string
): readonly ImageFormationStageId[] {
  if (!Array.isArray(value)) {
    throw new InvalidConfigurationError(
      path + " must be an array."
    );
  }
  const valid = contractStageIds();
  const seen =
    new Set<ImageFormationStageId>();
  value.forEach(
    (entry, index) => {
      if (
        typeof entry !== "string" ||
        !valid.has(
          entry as ImageFormationStageId
        )
      ) {
        throw new InvalidConfigurationError(
          path +
            "[" +
            index +
            "] is not a declared image-formation stage."
        );
      }
      const typed =
        entry as ImageFormationStageId;
      if (seen.has(typed)) {
        throw new InvalidConfigurationError(
          path +
            " must not contain duplicate stage IDs."
        );
      }
      seen.add(typed);
    }
  );

  return getImageFormationContract()
    .stages
    .map((stage) => stage.id)
    .filter((stageId) =>
      seen.has(stageId)
    );
}

function parseUniqueEffectIds(
  value: unknown,
  path: string
): readonly ImageFormationEffectId[] {
  if (!Array.isArray(value)) {
    throw new InvalidConfigurationError(
      path + " must be an array."
    );
  }
  const valid = contractEffectIds();
  const seen =
    new Set<ImageFormationEffectId>();
  value.forEach(
    (entry, index) => {
      if (
        typeof entry !== "string" ||
        !valid.has(
          entry as ImageFormationEffectId
        )
      ) {
        throw new InvalidConfigurationError(
          path +
            "[" +
            index +
            "] is not a declared image-formation effect."
        );
      }
      const typed =
        entry as ImageFormationEffectId;
      if (seen.has(typed)) {
        throw new InvalidConfigurationError(
          path +
            " must not contain duplicate effect IDs."
        );
      }
      seen.add(typed);
    }
  );

  return getImageFormationContract()
    .effectPlacements
    .map((effect) => effect.id)
    .filter((effectId) =>
      seen.has(effectId)
    );
}

export function parseRendererCapabilityDeclaration(
  value: unknown
): RendererCapabilityDeclaration {
  const record =
    requireRecord(
      value,
      "rendererCapability"
    );
  if (
    record.schemaVersion !==
    RENDERER_CAPABILITY_SCHEMA_VERSION
  ) {
    throw new InvalidConfigurationError(
      'rendererCapability.schemaVersion must be "' +
        RENDERER_CAPABILITY_SCHEMA_VERSION +
        '".'
    );
  }

  const consumerKind =
    record.consumerKind;
  if (
    consumerKind !==
      "interactive-optimized" &&
    consumerKind !== "reference"
  ) {
    throw new InvalidConfigurationError(
      "rendererCapability.consumerKind is invalid."
    );
  }

  const spectralCapability =
    record.spectralCapability;
  if (
    spectralCapability !==
      "wavelength-resolved" &&
    spectralCapability !==
      "wavelength-independent-approximation"
  ) {
    throw new InvalidConfigurationError(
      "rendererCapability.spectralCapability is invalid."
    );
  }

  const temporal =
    requireRecord(
      record.temporalSampling,
      "rendererCapability.temporalSampling"
    );
  let temporalSampling:
    RendererCapabilityDeclaration["temporalSampling"];
  if (temporal.kind === "none") {
    temporalSampling = {
      kind: "none"
    };
  } else if (
    temporal.kind === "bounded"
  ) {
    const maximumSamples =
      temporal.maximumSamples;
    if (
      typeof maximumSamples !==
        "number" ||
      !Number.isSafeInteger(
        maximumSamples
      ) ||
      maximumSamples <= 0
    ) {
      throw new InvalidConfigurationError(
        "rendererCapability.temporalSampling.maximumSamples must be a positive safe integer."
      );
    }
    temporalSampling = {
      kind: "bounded",
      maximumSamples
    };
  } else {
    throw new InvalidConfigurationError(
      "rendererCapability.temporalSampling.kind is invalid."
    );
  }

  const depthCapability =
    record.depthCapability;
  if (
    depthCapability !== "none" &&
    depthCapability !== "per-layer"
  ) {
    throw new InvalidConfigurationError(
      "rendererCapability.depthCapability is invalid."
    );
  }

  const alphaRepresentation =
    record.alphaRepresentation;
  if (
    alphaRepresentation !==
      "premultiplied" &&
    alphaRepresentation !==
      "straight"
  ) {
    throw new InvalidConfigurationError(
      "rendererCapability.alphaRepresentation is invalid."
    );
  }

  for (const [key, raw] of [
    [
      "inverseFieldMapping",
      record.inverseFieldMapping
    ],
    [
      "preservesDepthOrderAcrossWarps",
      record
        .preservesDepthOrderAcrossWarps
    ],
    [
      "sensorDomainProcessing",
      record.sensorDomainProcessing
    ]
  ] as const) {
    if (typeof raw !== "boolean") {
      throw new InvalidConfigurationError(
        "rendererCapability." +
          key +
          " must be boolean."
      );
    }
  }

  return {
    schemaVersion:
      RENDERER_CAPABILITY_SCHEMA_VERSION,
    rendererId:
      requireNonEmptyString(
        record.rendererId,
        "rendererCapability.rendererId"
      ),
    rendererVersion:
      requireNonEmptyString(
        record.rendererVersion,
        "rendererCapability.rendererVersion"
      ),
    consumerKind,
    supportedStages:
      parseUniqueStageIds(
        record.supportedStages,
        "rendererCapability.supportedStages"
      ),
    supportedEffects:
      parseUniqueEffectIds(
        record.supportedEffects,
        "rendererCapability.supportedEffects"
      ),
    spectralCapability,
    temporalSampling,
    depthCapability,
    inverseFieldMapping:
      record
        .inverseFieldMapping as boolean,
    alphaRepresentation,
    preservesDepthOrderAcrossWarps:
      record
        .preservesDepthOrderAcrossWarps as boolean,
    sensorDomainProcessing:
      record
        .sensorDomainProcessing as boolean
  };
}

export function parseImageFormationFidelityProfile(
  value: unknown
): ImageFormationFidelityProfile {
  const record =
    requireRecord(
      value,
      "imageFormationFidelityProfile"
    );
  if (
    record.schemaVersion !==
    IMAGE_FORMATION_FIDELITY_PROFILE_SCHEMA_VERSION
  ) {
    throw new InvalidConfigurationError(
      'imageFormationFidelityProfile.schemaVersion must be "' +
        IMAGE_FORMATION_FIDELITY_PROFILE_SCHEMA_VERSION +
        '".'
    );
  }

  if (
    !Array.isArray(
      record.requiredEffects
    )
  ) {
    throw new InvalidConfigurationError(
      "imageFormationFidelityProfile.requiredEffects must be an array."
    );
  }
  const validEffects =
    contractEffectIds();
  const seenEffects =
    new Set<ImageFormationEffectId>();
  const requestedEffects =
    record.requiredEffects.map(
      (entry, index) => {
        const path =
          "imageFormationFidelityProfile.requiredEffects[" +
          index +
          "]";
        const effect =
          requireRecord(
            entry,
            path
          );
        const effectId =
          effect.effectId;
        if (
          typeof effectId !==
            "string" ||
          !validEffects.has(
            effectId as ImageFormationEffectId
          )
        ) {
          throw new InvalidConfigurationError(
            path +
              ".effectId is not a declared image-formation effect."
          );
        }
        const typed =
          effectId as ImageFormationEffectId;
        if (
          seenEffects.has(typed)
        ) {
          throw new InvalidConfigurationError(
            "imageFormationFidelityProfile.requiredEffects must not contain duplicate effect IDs."
          );
        }
        seenEffects.add(typed);
        return {
          effectId: typed,
          modelId:
            requireNonEmptyString(
              effect.modelId,
              path + ".modelId"
            ),
          modelVersion:
            requireNonEmptyString(
              effect.modelVersion,
              path +
                ".modelVersion"
            )
        };
      }
    );

  const effectOrder =
    new Map(
      getImageFormationContract()
        .effectPlacements.map(
          (effect, index) => [
            effect.id,
            index
          ] as const
        )
    );
  const requiredEffects = [
    ...requestedEffects
  ].sort(
    (left, right) =>
      (effectOrder.get(
        left.effectId
      ) ?? 0) -
      (effectOrder.get(
        right.effectId
      ) ?? 0)
  );

  const requirements =
    requireRecord(
      record.rendererRequirements,
      "imageFormationFidelityProfile.rendererRequirements"
    );
  const spectral =
    requirements.spectral;
  if (
    spectral !==
      "wavelength-resolved" &&
    spectral !==
      "wavelength-independent-approximation"
  ) {
    throw new InvalidConfigurationError(
      "imageFormationFidelityProfile.rendererRequirements.spectral is invalid."
    );
  }
  if (
    typeof requirements
      .sensorDomainProcessing !==
    "boolean"
  ) {
    throw new InvalidConfigurationError(
      "imageFormationFidelityProfile.rendererRequirements.sensorDomainProcessing must be boolean."
    );
  }
  const depth =
    requirements.depth;
  if (
    depth !== "none" &&
    depth !== "per-layer"
  ) {
    throw new InvalidConfigurationError(
      "imageFormationFidelityProfile.rendererRequirements.depth is invalid."
    );
  }

  return {
    schemaVersion:
      IMAGE_FORMATION_FIDELITY_PROFILE_SCHEMA_VERSION,
    profileId:
      requireNonEmptyString(
        record.profileId,
        "imageFormationFidelityProfile.profileId"
      ),
    profileVersion:
      requireNonEmptyString(
        record.profileVersion,
        "imageFormationFidelityProfile.profileVersion"
      ),
    requiredStages:
      parseUniqueStageIds(
        record.requiredStages,
        "imageFormationFidelityProfile.requiredStages"
      ),
    requiredEffects,
    rendererRequirements: {
      spectral,
      sensorDomainProcessing:
        requirements
          .sensorDomainProcessing as boolean,
      depth
    }
  };
}

function validateEquipmentCapabilities(
  value:
    ResolvedGenericEquipmentExposureCapabilities
): void {
  if (
    value.schemaVersion !==
      GENERIC_EQUIPMENT_EXPOSURE_CAPABILITY_SCHEMA_VERSION ||
    value.scientificStatus !==
      "approximation"
  ) {
    throw new InvalidConfigurationError(
      "equipmentCapabilities do not satisfy the resolved generic equipment capability contract."
    );
  }
  requireNonEmptyString(
    value.bodyProfile.profileId,
    "equipmentCapabilities.bodyProfile.profileId"
  );
  requireNonEmptyString(
    value.bodyProfile.profileVersion,
    "equipmentCapabilities.bodyProfile.profileVersion"
  );
  requireNonEmptyString(
    value.lensProfile.profileId,
    "equipmentCapabilities.lensProfile.profileId"
  );
  requireNonEmptyString(
    value.lensProfile.profileVersion,
    "equipmentCapabilities.lensProfile.profileVersion"
  );
  requirePositiveFinite(
    value.selectedFocalLengthMm,
    "equipmentCapabilities.selectedFocalLengthMm"
  );
  requirePositiveFinite(
    value.aperture
      .widestAvailableFNumber,
    "equipmentCapabilities.aperture.widestAvailableFNumber"
  );
  requirePositiveFinite(
    value.aperture
      .narrowestAvailableFNumber,
    "equipmentCapabilities.aperture.narrowestAvailableFNumber"
  );
  requirePositiveFinite(
    value.shutter.minimumSeconds,
    "equipmentCapabilities.shutter.minimumSeconds"
  );
  requirePositiveFinite(
    value.shutter.maximumSeconds,
    "equipmentCapabilities.shutter.maximumSeconds"
  );
  requirePositiveFinite(
    value.iso.minimum,
    "equipmentCapabilities.iso.minimum"
  );
  requirePositiveFinite(
    value.iso.maximum,
    "equipmentCapabilities.iso.maximum"
  );
}

function settingEquals(
  left: number,
  right: number
): boolean {
  const scale = Math.max(
    1,
    Math.abs(left),
    Math.abs(right)
  );
  return (
    Math.abs(left - right) <=
    Number.EPSILON *
      32 *
      scale
  );
}

function validateSetting(
  value: number,
  minimum: number,
  maximum: number,
  grid:
    ResolvedNumericSettingGrid,
  path: string
): void {
  if (
    value < minimum ||
    value > maximum
  ) {
    throw new InvalidScientificInputError(
      path +
        " lies outside the prepared equipment capability range."
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
        " is not present in the prepared discrete equipment setting grid."
    );
  }
}

function cloneJson<T>(
  value: T
): T {
  return JSON.parse(
    JSON.stringify(value)
  ) as T;
}

function deepFreeze<T>(
  value: T
): T {
  if (
    typeof value !== "object" ||
    value === null ||
    Object.isFrozen(value)
  ) {
    return value;
  }

  Object.freeze(value);
  for (
    const child of
    Object.values(
      value as UnknownRecord
    )
  ) {
    deepFreeze(child);
  }
  return value;
}

function canonicalStringify(
  value: unknown
): string {
  if (value === null) {
    return "null";
  }
  if (
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new InvalidConfigurationError(
        "Canonical plan serialization does not permit non-finite numbers."
      );
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return (
      "[" +
      value
        .map(
          (entry) =>
            canonicalStringify(
              entry
            )
        )
        .join(",") +
      "]"
    );
  }
  if (
    typeof value === "object" &&
    value !== null
  ) {
    const record =
      value as UnknownRecord;
    const keys =
      Object.keys(record)
        .filter(
          (key) =>
            record[key] !==
            undefined
        )
        .sort();
    return (
      "{" +
      keys
        .map(
          (key) =>
            JSON.stringify(key) +
            ":" +
            canonicalStringify(
              record[key]
            )
        )
        .join(",") +
      "}"
    );
  }

  throw new InvalidConfigurationError(
    "Canonical plan serialization encountered an unsupported value type."
  );
}

function fingerprintText(
  text: string
): string {
  let hash = 0x811c9dc5;
  const bytes =
    new TextEncoder().encode(text);
  for (const byte of bytes) {
    hash ^= byte;
    hash =
      Math.imul(
        hash,
        0x01000193
      ) >>> 0;
  }
  return hash
    .toString(16)
    .padStart(8, "0");
}

function fingerprintValue(
  value: unknown
): string {
  return fingerprintText(
    canonicalStringify(value)
  );
}

export function serializeProductionImageFormationPlan(
  plan:
    ProductionImageFormationPlan
): string {
  return canonicalStringify(plan);
}

export function parsePreparedImageFormationContext(
  value: unknown
): PreparedImageFormationContext {
  const record =
    requireRecord(
      value,
      "preparedImageFormationContext"
    );
  if (
    record.version !==
    PREPARED_IMAGE_FORMATION_CONTEXT_VERSION
  ) {
    throw new InvalidConfigurationError(
      'preparedImageFormationContext.version must be "' +
        PREPARED_IMAGE_FORMATION_CONTEXT_VERSION +
        '".'
    );
  }
  const parsed =
    prepareImageFormationContext({
      contextId:
        record.contextId as string,
      sceneId:
        record.sceneId as string,
      sceneRadianceProviderProfileId:
        record
          .sceneRadianceProviderProfileId as string,
      outputGeometryProfileId:
        record
          .outputGeometryProfileId as string,
      equipmentCapabilities:
        record
          .equipmentCapabilities as ResolvedGenericEquipmentExposureCapabilities,
      ...(record
        .opticalBridgeProfile ===
      undefined
        ? {}
        : {
            opticalBridgeProfile:
              record
                .opticalBridgeProfile as SceneToSensorIrradianceProfile
          }),
      renderer:
        record.renderer as RendererCapabilityDeclaration,
      fidelity:
        record.fidelity as ImageFormationFidelityProfile
    });
  if (
    typeof record.fingerprint !==
      "object" ||
    record.fingerprint === null
  ) {
    throw new InvalidConfigurationError(
      "preparedImageFormationContext.fingerprint must be present."
    );
  }
  const supplied =
    requireRecord(
      record.fingerprint,
      "preparedImageFormationContext.fingerprint"
    );
  if (
    supplied.algorithm !==
      "fnv1a-32-non-cryptographic" ||
    supplied.value !==
      parsed.fingerprint.value
  ) {
    throw new InvalidConfigurationError(
      "preparedImageFormationContext fingerprint does not match its parsed content."
    );
  }
  return parsed;
}

export function prepareImageFormationContext(
  input:
    PrepareImageFormationContextInput
): PreparedImageFormationContext {
  validateEquipmentCapabilities(
    input.equipmentCapabilities
  );
  const renderer =
    parseRendererCapabilityDeclaration(
      input.renderer
    );
  const fidelity =
    parseImageFormationFidelityProfile(
      input.fidelity
    );
  const opticalBridgeProfile =
    input.opticalBridgeProfile ===
    undefined
      ? undefined
      : parseSceneToSensorIrradianceProfile(
          input
            .opticalBridgeProfile
        );

  if (
    opticalBridgeProfile !==
      undefined &&
    opticalBridgeProfile
      .lensProfileId !==
      input
        .equipmentCapabilities
        .lensProfile.profileId
  ) {
    throw new InvalidConfigurationError(
      "opticalBridgeProfile.lensProfileId must match equipmentCapabilities.lensProfile.profileId."
    );
  }

  const core = {
    version:
      PREPARED_IMAGE_FORMATION_CONTEXT_VERSION,
    contextId:
      requireNonEmptyString(
        input.contextId,
        "contextId"
      ),
    sceneId:
      requireNonEmptyString(
        input.sceneId,
        "sceneId"
      ),
    sceneRadianceProviderProfileId:
      requireNonEmptyString(
        input
          .sceneRadianceProviderProfileId,
        "sceneRadianceProviderProfileId"
      ),
    outputGeometryProfileId:
      requireNonEmptyString(
        input.outputGeometryProfileId,
        "outputGeometryProfileId"
      ),
    equipmentCapabilities:
      cloneJson(
        input
          .equipmentCapabilities
      ),
    ...(opticalBridgeProfile ===
    undefined
      ? {}
      : {
          opticalBridgeProfile:
            cloneJson(
              opticalBridgeProfile
            )
        }),
    renderer,
    fidelity
  };

  const prepared:
    PreparedImageFormationContext = {
    ...core,
    fingerprint: {
      algorithm:
        "fnv1a-32-non-cryptographic",
      value:
        fingerprintValue(core)
    }
  };

  return deepFreeze(
    cloneJson(prepared)
  );
}

function validatePhysicalSceneSample(
  sample:
    ProductionPhysicalSceneSample,
  sceneTimeSecondsFromExposureStart:
    number
): ProductionPhysicalSceneSample {
  const request =
    parseSceneRadianceEvaluationRequest(
      sample.sceneRadianceRequest
    );
  const result =
    parseSceneRadianceEvaluationResult(
      sample.sceneRadianceResult
    );

  if (
    request
      .timeSecondsFromExposureStart !==
    sceneTimeSecondsFromExposureStart
  ) {
    throw new InvalidConfigurationError(
      "physicalSceneSample.sceneRadianceRequest.timeSecondsFromExposureStart must equal the capture snapshot scene time."
    );
  }

  const imagePoint =
    requireRecord(
      sample.imagePointMm,
      "physicalSceneSample.imagePointMm"
    );

  return cloneJson({
    sceneRadianceRequest:
      request,
    sceneRadianceResult:
      result,
    focus: sample.focus,
    imagePointMm: {
      x:
        requireFinite(
          imagePoint.x,
          "physicalSceneSample.imagePointMm.x"
        ),
      y:
        requireFinite(
          imagePoint.y,
          "physicalSceneSample.imagePointMm.y"
        )
    },
    fieldThroughput:
      sample.fieldThroughput,
    ...(sample.frontOfLensFilters ===
    undefined
      ? {}
      : {
          frontOfLensFilters:
            sample.frontOfLensFilters.map(
              (profile) =>
                parseFrontOfLensFilterProfile(
                  profile
                )
            )
        })
  });
}

const CAPTURE_ORIENTATIONS =
  new Set<CaptureOrientation>([
    "landscape",
    "portrait-clockwise",
    "landscape-inverted",
    "portrait-counter-clockwise"
  ]);

function validateTemporalCaptureInput(
  input:
    ProductionTemporalCaptureInput,
  shutterSeconds: number
): ProductionTemporalCaptureInput {
  const exposureWindows =
    calculateCaptureExposureWindows(
      input.exposureWindowInput
    ).value;

  if (
    !settingEquals(
      exposureWindows
        .nominalExposureDurationSeconds
        .value,
      exposure.shutterSeconds
    )
  ) {
    throw new InvalidConfigurationError(
      "temporalCapture.exposureWindowInput.nominalExposureDurationSeconds must match exposure.shutterSeconds."
    );
  }

  requirePositiveFinite(
    input.imagingArea.widthMm,
    "temporalCapture.imagingArea.widthMm"
  );
  requirePositiveFinite(
    input.imagingArea.heightMm,
    "temporalCapture.imagingArea.heightMm"
  );

  if (
    !CAPTURE_ORIENTATIONS.has(
      input.orientation
    )
  ) {
    throw new InvalidConfigurationError(
      "temporalCapture.orientation is invalid."
    );
  }

  if (input.readout !== undefined) {
    calculateSensorReadoutTiming({
      nativeRaster:
        input.exposureWindowInput
          .nativeRaster,
      ...(input.exposureWindowInput
        .activeCaptureRect ===
      undefined
        ? {}
        : {
            activeCaptureRect:
              input
                .exposureWindowInput
                .activeCaptureRect
          }),
      shutterMechanism:
        input.exposureWindowInput
          .shutterMechanism,
      readout: input.readout,
      ...(input.exposureWindowInput
        .samplePointsNative ===
      undefined
        ? {}
        : {
            samplePointsNative:
              input
                .exposureWindowInput
                .samplePointsNative
          })
    });
  }

  if (input.rotation !== undefined) {
    const sampleCount =
      input.rotation
        .temporalSampleCount;
    if (
      !Number.isSafeInteger(
        sampleCount
      ) ||
      sampleCount <= 0
    ) {
      throw new InvalidConfigurationError(
        "temporalCapture.rotation.temporalSampleCount must be a positive safe integer."
      );
    }

    for (const [axis, value] of [
      [
        "pitch",
        input.rotation
          .angularVelocityRadPerSec
          .pitch
      ],
      [
        "yaw",
        input.rotation
          .angularVelocityRadPerSec
          .yaw
      ],
      [
        "roll",
        input.rotation
          .angularVelocityRadPerSec
          .roll
      ]
    ] as const) {
      requireFinite(
        value,
        "temporalCapture.rotation.angularVelocityRadPerSec." +
          axis
      );
    }

    if (
      input.rotation
        .focusDistanceM !==
      undefined
    ) {
      requirePositiveFinite(
        input.rotation
          .focusDistanceM,
        "temporalCapture.rotation.focusDistanceM"
      );
    }

    if (
      !Array.isArray(
        input.exposureWindowInput
          .samplePointsNative
      ) ||
      input.exposureWindowInput
        .samplePointsNative
        .length === 0
    ) {
      throw new InvalidConfigurationError(
        "temporalCapture.rotation requires non-empty exposureWindowInput.samplePointsNative."
      );
    }
  }

  return cloneJson(input);
}

const RELEASE_TIMING_CONSTRAINTS =
  new Set<ReleaseTimingConstraint>([
    "requested-cadence",
    "body-maximum-cadence",
    "exposure-duration",
    "minimum-inter-frame-gap"
  ]);

function validateReleaseAutomationState(
  value: unknown,
  path: string
): ResolvedReleaseFrame["automation"]["ae"] {
  if (
    value !== "manual" &&
    value !== "locked" &&
    value !== "continuous"
  ) {
    throw new InvalidConfigurationError(
      path + " is invalid."
    );
  }
  return value;
}

function validateProductionReleaseFrameBinding(
  binding:
    ProductionReleaseFrameBinding,
  releaseFrameId: string,
  exposure: {
    aperture: number;
    shutterSeconds: number;
    iso: number;
  },
  stochasticSeedUint32: number
): ProductionReleaseFrameBinding {
  if (
    binding.releaseSequenceVersion !==
    RELEASE_SEQUENCE_VERSION
  ) {
    throw new InvalidConfigurationError(
      'releaseFrameBinding.releaseSequenceVersion must be "' +
        RELEASE_SEQUENCE_VERSION +
        '".'
    );
  }

  const frameIndex =
    binding.frameIndex;
  if (
    !Number.isSafeInteger(frameIndex) ||
    frameIndex < 0
  ) {
    throw new InvalidConfigurationError(
      "releaseFrameBinding.frameIndex must be a non-negative safe integer."
    );
  }

  const start =
    requireFinite(
      binding.exposureStartTimeSeconds,
      "releaseFrameBinding.exposureStartTimeSeconds"
    );
  const end =
    requireFinite(
      binding.exposureEndTimeSeconds,
      "releaseFrameBinding.exposureEndTimeSeconds"
    );
  if (end <= start) {
    throw new InvalidConfigurationError(
      "releaseFrameBinding exposure end must be after exposure start."
    );
  }
  if (
    !settingEquals(
      end - start,
      shutterSeconds
    )
  ) {
    throw new InvalidConfigurationError(
      "releaseFrameBinding exposure duration must match exposure.shutterSeconds."
    );
  }

  const sceneTime =
    requireFinite(
      binding.sceneTimeSecondsFromSequenceStart,
      "releaseFrameBinding.sceneTimeSecondsFromSequenceStart"
    );
  if (sceneTime < 0) {
    throw new InvalidConfigurationError(
      "releaseFrameBinding.sceneTimeSecondsFromSequenceStart must be greater than or equal to zero."
    );
  }

  let interval:
    number | null = null;
  if (
    binding.startIntervalFromPreviousSeconds !==
    null
  ) {
    interval =
      requirePositiveFinite(
        binding.startIntervalFromPreviousSeconds,
        "releaseFrameBinding.startIntervalFromPreviousSeconds"
      );
  }
  if (
    frameIndex === 0 &&
    interval !== null
  ) {
    throw new InvalidConfigurationError(
      "The first release frame must not declare a previous-frame interval."
    );
  }
  if (
    frameIndex > 0 &&
    interval === null
  ) {
    throw new InvalidConfigurationError(
      "A non-first release frame must declare its previous-frame interval."
    );
  }

  if (
    !Array.isArray(
      binding.timingConstraints
    )
  ) {
    throw new InvalidConfigurationError(
      "releaseFrameBinding.timingConstraints must be an array."
    );
  }
  const timingConstraints =
    binding.timingConstraints.map(
      (constraint, index) => {
        if (
          !RELEASE_TIMING_CONSTRAINTS.has(
            constraint
          )
        ) {
          throw new InvalidConfigurationError(
            "releaseFrameBinding.timingConstraints[" +
              index +
              "] is invalid."
          );
        }
        return constraint;
      }
    );
  if (
    new Set(timingConstraints).size !==
    timingConstraints.length
  ) {
    throw new InvalidConfigurationError(
      "releaseFrameBinding.timingConstraints must not contain duplicates."
    );
  }

  const automationRecord =
    requireRecord(
      binding.automation,
      "releaseFrameBinding.automation"
    );
  const automation = {
    ae:
      validateReleaseAutomationState(
        automationRecord.ae,
        "releaseFrameBinding.automation.ae"
      ),
    af:
      validateReleaseAutomationState(
        automationRecord.af,
        "releaseFrameBinding.automation.af"
      ),
    awb:
      validateReleaseAutomationState(
        automationRecord.awb,
        "releaseFrameBinding.automation.awb"
      )
  };

  const whiteBalanceStateId =
    binding.whiteBalanceStateId ===
    undefined
      ? undefined
      : requireNonEmptyString(
          binding.whiteBalanceStateId,
          "releaseFrameBinding.whiteBalanceStateId"
        );

  const parsedExposure = {
    aperture:
      requirePositiveFinite(
        binding.exposure.aperture,
        "releaseFrameBinding.exposure.aperture"
      ),
    shutterSeconds:
      requirePositiveFinite(
        binding.exposure.shutterSeconds,
        "releaseFrameBinding.exposure.shutterSeconds"
      ),
    iso:
      requirePositiveFinite(
        binding.exposure.iso,
        "releaseFrameBinding.exposure.iso"
      )
  };
  const parsedSeed =
    requireUint32(
      binding.stochasticSeedUint32,
      "releaseFrameBinding.stochasticSeedUint32"
    );

  if (
    !settingEquals(
      parsedExposure.aperture,
      exposure.aperture
    ) ||
    !settingEquals(
      parsedExposure.shutterSeconds,
      exposure.shutterSeconds
    ) ||
    !settingEquals(
      parsedExposure.iso,
      exposure.iso
    )
  ) {
    throw new InvalidConfigurationError(
      "releaseFrameBinding.exposure must match the committed capture exposure."
    );
  }
  if (
    parsedSeed !==
    stochasticSeedUint32
  ) {
    throw new InvalidConfigurationError(
      "releaseFrameBinding.stochasticSeedUint32 must match the committed capture seed."
    );
  }

  const parsed: ProductionReleaseFrameBinding = {
    releaseSequenceVersion:
      RELEASE_SEQUENCE_VERSION,
    sequenceId:
      requireNonEmptyString(
        binding.sequenceId,
        "releaseFrameBinding.sequenceId"
      ),
    releaseFrameId:
      requireNonEmptyString(
        binding.releaseFrameId,
        "releaseFrameBinding.releaseFrameId"
      ),
    frameIndex,
    exposure:
      parsedExposure,
    stochasticSeedUint32:
      parsedSeed,
    exposureStartTimeSeconds:
      start,
    exposureEndTimeSeconds:
      end,
    sceneTimeSecondsFromSequenceStart:
      sceneTime,
    startIntervalFromPreviousSeconds:
      interval,
    timingConstraints,
    focus:
      parseFocusPlane(
        binding.focus
      ),
    automation,
    ...(whiteBalanceStateId ===
    undefined
      ? {}
      : {
          whiteBalanceStateId
        })
  };

  if (
    parsed.releaseFrameId !==
    releaseFrameId
  ) {
    throw new InvalidConfigurationError(
      "releaseFrameBinding.releaseFrameId must match releaseFrameId."
    );
  }

  return parsed;
}

function releaseFocusMatchesOpticalFocus(
  releaseFocus: FocusPlane,
  opticalFocus:
    OpticalBridgeFocusContext
): boolean {
  if (
    releaseFocus.kind ===
    "infinity"
  ) {
    return (
      opticalFocus.kind ===
        "infinity-focus" ||
      (
        opticalFocus.kind ===
          "supplied-working-f-number" &&
        opticalFocus.focus.kind ===
          "infinity"
      )
    );
  }

  if (
    opticalFocus.kind ===
    "ideal-symmetric-thin-lens"
  ) {
    return settingEquals(
      opticalFocus.objectDistanceM,
      releaseFocus.distanceM
    );
  }
  if (
    opticalFocus.kind ===
      "supplied-working-f-number" &&
    opticalFocus.focus.kind ===
      "finite"
  ) {
    return settingEquals(
      opticalFocus.focus.objectDistanceM,
      releaseFocus.distanceM
    );
  }
  return false;
}

function validateCommittedWhiteBalanceState(
  state:
    ResolvedWhiteBalanceState | undefined,
  binding:
    ProductionReleaseFrameBinding | undefined
): ResolvedWhiteBalanceState | undefined {
  const parsed =
    state === undefined
      ? undefined
      : parseResolvedWhiteBalanceState(
          state
        );

  if (binding === undefined) {
    return parsed;
  }

  if (
    binding.whiteBalanceStateId ===
    undefined
  ) {
    if (parsed !== undefined) {
      throw new InvalidConfigurationError(
        "A release frame without whiteBalanceStateId must not receive a committed whiteBalanceState."
      );
    }
    return undefined;
  }

  if (parsed === undefined) {
    throw new InvalidConfigurationError(
      "A release frame with whiteBalanceStateId requires the committed resolved white-balance state."
    );
  }
  if (
    parsed.stateId !==
    binding.whiteBalanceStateId
  ) {
    throw new InvalidConfigurationError(
      "whiteBalanceState.stateId must match releaseFrameBinding.whiteBalanceStateId."
    );
  }
  if (
    binding.automation.awb ===
      "locked" &&
    !parsed.locked
  ) {
    throw new InvalidConfigurationError(
      "A release frame with locked AWB requires a locked committed white-balance state."
    );
  }

  return parsed;
}

export function createProductionCaptureSnapshot(
  input:
    CreateProductionCaptureSnapshotInput
): ProductionCaptureSnapshot {
  const sceneTime =
    requireFinite(
      input
        .sceneTimeSecondsFromExposureStart,
      "sceneTimeSecondsFromExposureStart"
    );
  if (sceneTime < 0) {
    throw new InvalidConfigurationError(
      "sceneTimeSecondsFromExposureStart must be greater than or equal to zero."
    );
  }

  const releaseFrameId =
    requireNonEmptyString(
      input.releaseFrameId,
      "releaseFrameId"
    );
  const exposure = {
    aperture:
      requirePositiveFinite(
        input.exposure.aperture,
        "exposure.aperture"
      ),
    shutterSeconds:
      requirePositiveFinite(
        input.exposure
          .shutterSeconds,
        "exposure.shutterSeconds"
      ),
    iso:
      requirePositiveFinite(
        input.exposure.iso,
        "exposure.iso"
      )
  };

  const releaseFrameBinding =
    input.releaseFrameBinding ===
    undefined
      ? undefined
      : validateProductionReleaseFrameBinding(
          input.releaseFrameBinding,
          releaseFrameId,
          exposure,
          requireUint32(
            input.stochasticSeedUint32,
            "stochasticSeedUint32"
          )
        );

  const whiteBalanceState =
    validateCommittedWhiteBalanceState(
      input.whiteBalanceState,
      releaseFrameBinding
    );

  const physicalSceneSample =
    input.physicalSceneSample ===
    undefined
      ? undefined
      : validatePhysicalSceneSample(
          input.physicalSceneSample,
          sceneTime
        );

  if (
    releaseFrameBinding !==
      undefined &&
    physicalSceneSample !==
      undefined &&
    !releaseFocusMatchesOpticalFocus(
      releaseFrameBinding.focus,
      physicalSceneSample.focus
    )
  ) {
    throw new InvalidConfigurationError(
      "physicalSceneSample.focus must match the committed release-frame focus."
    );
  }

  const core = {
    version:
      PRODUCTION_CAPTURE_SNAPSHOT_VERSION,
    captureId:
      requireNonEmptyString(
        input.captureId,
        "captureId"
      ),
    releaseFrameId,
    sceneStateId:
      requireNonEmptyString(
        input.sceneStateId,
        "sceneStateId"
      ),
    sceneTimeSecondsFromExposureStart:
      sceneTime,
    outputStateId:
      requireNonEmptyString(
        input.outputStateId,
        "outputStateId"
      ),
    exposure,
    stochasticSeedUint32:
      requireUint32(
        input.stochasticSeedUint32,
        "stochasticSeedUint32"
      ),
    ...(releaseFrameBinding ===
    undefined
      ? {}
      : {
          releaseFrameBinding
        }),
    ...(whiteBalanceState ===
    undefined
      ? {}
      : {
          whiteBalanceState
        }),
    ...(input.temporalCapture ===
    undefined
      ? {}
      : {
          temporalCapture:
            validateTemporalCaptureInput(
              input.temporalCapture,
              exposure.shutterSeconds
            )
        }),
    ...(physicalSceneSample ===
    undefined
      ? {}
      : {
          physicalSceneSample
        })
  };

  const snapshot:
    ProductionCaptureSnapshot = {
    ...core,
    fingerprint: {
      algorithm:
        "fnv1a-32-non-cryptographic",
      value:
        fingerprintValue(core)
    }
  };

  return deepFreeze(
    cloneJson(snapshot)
  );
}

/**
 * Creates one immutable production snapshot directly from a committed #105
 * release frame. The release frame owns exposure/focus/automation/seed
 * identity; callers provide only the scene/output-local state that is not
 * owned by the release sequence.
 */
export function createProductionCaptureSnapshotFromReleaseFrame(
  input:
    CreateProductionCaptureSnapshotFromReleaseFrameInput
): ProductionCaptureSnapshot {
  const frame =
    input.releaseFrame;

  const releaseFrameBinding:
    ProductionReleaseFrameBinding = {
    releaseSequenceVersion:
      RELEASE_SEQUENCE_VERSION,
    sequenceId:
      requireNonEmptyString(
        frame.sequenceId,
        "releaseFrame.sequenceId"
      ),
    releaseFrameId:
      requireNonEmptyString(
        frame.releaseFrameId,
        "releaseFrame.releaseFrameId"
      ),
    frameIndex:
      frame.frameIndex,
    exposure: {
      ...frame.exposure
    },
    stochasticSeedUint32:
      frame.stochasticSeedUint32,
    exposureStartTimeSeconds:
      frame.exposureStartTimeSeconds,
    exposureEndTimeSeconds:
      frame.exposureEndTimeSeconds,
    sceneTimeSecondsFromSequenceStart:
      frame.sceneTimeSecondsFromSequenceStart,
    startIntervalFromPreviousSeconds:
      frame.startIntervalFromPreviousSeconds,
    timingConstraints: [
      ...frame.timingConstraints
    ],
    focus:
      parseFocusPlane(
        frame.focus
      ),
    automation: {
      ...frame.automation
    },
    ...(frame.whiteBalanceStateId ===
    undefined
      ? {}
      : {
          whiteBalanceStateId:
            frame.whiteBalanceStateId
        })
  };

  return createProductionCaptureSnapshot({
    captureId:
      input.captureId,
    releaseFrameId:
      frame.releaseFrameId,
    sceneStateId:
      input.sceneStateId,
    sceneTimeSecondsFromExposureStart:
      input
        .sceneTimeSecondsFromExposureStart,
    outputStateId:
      input.outputStateId,
    exposure: {
      ...frame.exposure
    },
    stochasticSeedUint32:
      frame.stochasticSeedUint32,
    releaseFrameBinding,
    ...(input.whiteBalanceState ===
    undefined
      ? {}
      : {
          whiteBalanceState:
            input.whiteBalanceState
        }),
    ...(input.physicalSceneSample ===
    undefined
      ? {}
      : {
          physicalSceneSample:
            input.physicalSceneSample
        }),
    ...(input.temporalCapture ===
    undefined
      ? {}
      : {
          temporalCapture:
            input.temporalCapture
        })
  });
}

export function parseProductionCaptureSnapshot(
  value: unknown
): ProductionCaptureSnapshot {
  const record =
    requireRecord(
      value,
      "productionCaptureSnapshot"
    );
  if (
    record.version !==
    PRODUCTION_CAPTURE_SNAPSHOT_VERSION
  ) {
    throw new InvalidConfigurationError(
      'productionCaptureSnapshot.version must be "' +
        PRODUCTION_CAPTURE_SNAPSHOT_VERSION +
        '".'
    );
  }
  const parsed =
    createProductionCaptureSnapshot({
      captureId:
        record.captureId as string,
      releaseFrameId:
        record.releaseFrameId as string,
      sceneStateId:
        record.sceneStateId as string,
      sceneTimeSecondsFromExposureStart:
        record
          .sceneTimeSecondsFromExposureStart as number,
      outputStateId:
        record.outputStateId as string,
      exposure:
        record.exposure as {
          aperture: number;
          shutterSeconds: number;
          iso: number;
        },
      stochasticSeedUint32:
        record
          .stochasticSeedUint32 as number,
      ...(record
        .releaseFrameBinding ===
      undefined
        ? {}
        : {
            releaseFrameBinding:
              record
                .releaseFrameBinding as ProductionReleaseFrameBinding
          }),
      ...(record
        .whiteBalanceState ===
      undefined
        ? {}
        : {
            whiteBalanceState:
              record
                .whiteBalanceState as ResolvedWhiteBalanceState
          }),
      ...(record
        .physicalSceneSample ===
      undefined
        ? {}
        : {
            physicalSceneSample:
              record
                .physicalSceneSample as ProductionPhysicalSceneSample
          }),
      ...(record.temporalCapture ===
      undefined
        ? {}
        : {
            temporalCapture:
              record
                .temporalCapture as ProductionTemporalCaptureInput
          })
    });

  const supplied =
    requireRecord(
      record.fingerprint,
      "productionCaptureSnapshot.fingerprint"
    );
  if (
    supplied.algorithm !==
      "fnv1a-32-non-cryptographic" ||
    supplied.value !==
      parsed.fingerprint.value
  ) {
    throw new InvalidConfigurationError(
      "productionCaptureSnapshot fingerprint does not match its parsed content."
    );
  }
  return parsed;
}

function expandRequiredStages(
  fidelity:
    ImageFormationFidelityProfile
): ReadonlySet<ImageFormationStageId> {
  const contract =
    getImageFormationContract();
  const byId =
    new Map(
      contract.stages.map(
        (stage) => [
          stage.id,
          stage
        ] as const
      )
    );
  const effects =
    new Map(
      contract.effectPlacements.map(
        (effect) => [
          effect.id,
          effect
        ] as const
      )
    );

  const required =
    new Set<ImageFormationStageId>();

  const addStage = (
    stageId:
      ImageFormationStageId
  ): void => {
    if (required.has(stageId)) {
      return;
    }
    required.add(stageId);
    const stage =
      byId.get(stageId);
    if (stage === undefined) {
      throw new InvalidConfigurationError(
        "Image-formation contract is missing stage " +
          stageId +
          "."
      );
    }
    for (
      const upstream of
      stage.requiredUpstreamStages
    ) {
      addStage(upstream);
    }
  };

  for (
    const stageId of
    fidelity.requiredStages
  ) {
    addStage(stageId);
  }

  for (
    const requiredEffect of
    fidelity.requiredEffects
  ) {
    const placement =
      effects.get(
        requiredEffect.effectId
      );
    if (
      placement === undefined
    ) {
      throw new InvalidConfigurationError(
        "Image-formation contract is missing effect " +
          requiredEffect.effectId +
          "."
      );
    }
    addStage(
      placement.primaryStage
    );
    for (
      const coupled of
      placement.coupledStages
    ) {
      addStage(coupled);
    }
  }

  return required;
}

function validateSnapshotAgainstContext(
  prepared:
    PreparedImageFormationContext,
  snapshot:
    ProductionCaptureSnapshot
): void {
  if (
    prepared.outputGeometryProfileId !==
      snapshot.outputStateId
  ) {
    throw new InvalidScientificInputError(
      "captureSnapshot.outputStateId must match the prepared outputGeometryProfileId in plan schema 0.1.0."
    );
  }

  validateSetting(
    snapshot.exposure.aperture,
    prepared
      .equipmentCapabilities
      .aperture
      .widestAvailableFNumber,
    prepared
      .equipmentCapabilities
      .aperture
      .narrowestAvailableFNumber,
    prepared
      .equipmentCapabilities
      .aperture.settingGrid,
    "captureSnapshot.exposure.aperture"
  );
  validateSetting(
    snapshot.exposure
      .shutterSeconds,
    prepared
      .equipmentCapabilities
      .shutter.minimumSeconds,
    prepared
      .equipmentCapabilities
      .shutter.maximumSeconds,
    prepared
      .equipmentCapabilities
      .shutter.settingGrid,
    "captureSnapshot.exposure.shutterSeconds"
  );
  validateSetting(
    snapshot.exposure.iso,
    prepared
      .equipmentCapabilities
      .iso.minimum,
    prepared
      .equipmentCapabilities
      .iso.maximum,
    prepared
      .equipmentCapabilities
      .iso.settingGrid,
    "captureSnapshot.exposure.iso"
  );

  const sample =
    snapshot
      .physicalSceneSample;
  if (sample !== undefined) {
    if (
      sample.sceneRadianceRequest
        .sceneId !==
        prepared.sceneId ||
      sample.sceneRadianceResult
        .sceneId !==
        prepared.sceneId
    ) {
      throw new InvalidScientificInputError(
        "Physical scene sample sceneId must match the prepared sceneId."
      );
    }
    if (
      sample.sceneRadianceRequest
        .providerProfileId !==
        prepared
          .sceneRadianceProviderProfileId ||
      sample.sceneRadianceResult
        .providerProfileId !==
        prepared
          .sceneRadianceProviderProfileId
    ) {
      throw new InvalidScientificInputError(
        "Physical scene sample providerProfileId must match the prepared scene-radiance provider."
      );
    }
  }
}

function addBlocker(
  blockers:
    ProductionImageFormationBlocker[],
  blocker:
    ProductionImageFormationBlocker
): void {
  if (
    !blockers.some(
      (existing) =>
        canonicalStringify(
          existing
        ) ===
        canonicalStringify(
          blocker
        )
    )
  ) {
    blockers.push(blocker);
  }
}

function evaluateRendererRequirements(
  prepared:
    PreparedImageFormationContext,
  requiredStages:
    ReadonlySet<ImageFormationStageId>,
  blockers:
    ProductionImageFormationBlocker[]
): void {
  const renderer =
    prepared.renderer;
  const fidelity =
    prepared.fidelity;

  if (
    fidelity.rendererRequirements
      .spectral ===
      "wavelength-resolved" &&
    renderer.spectralCapability !==
      "wavelength-resolved"
  ) {
    addBlocker(blockers, {
      code:
        "renderer-spectral-capability-insufficient",
      message:
        "Requested fidelity requires wavelength-resolved renderer support."
    });
  }

  if (
    fidelity.rendererRequirements
      .sensorDomainProcessing &&
    !renderer
      .sensorDomainProcessing
  ) {
    addBlocker(blockers, {
      code:
        "renderer-sensor-domain-processing-unavailable",
      message:
        "Requested fidelity requires renderer sensor-domain processing support."
    });
  }

  if (
    fidelity.rendererRequirements
      .depth === "per-layer" &&
    renderer.depthCapability !==
      "per-layer"
  ) {
    addBlocker(blockers, {
      code:
        "renderer-depth-capability-insufficient",
      message:
        "Requested fidelity requires per-layer depth capability."
    });
  }

  if (
    !renderer.inverseFieldMapping &&
    [...requiredStages].some(
      (stageId) =>
        stageId ===
          "lens-field-pupil-evaluation" ||
        stageId ===
          "field-wavelength-psf"
    )
  ) {
    addBlocker(blockers, {
      code:
        "renderer-inverse-field-mapping-required",
      message:
        "The requested lens/field plan requires inverse field mapping semantics."
    });
  }

  if (
    renderer.alphaRepresentation !==
    "premultiplied"
  ) {
    addBlocker(blockers, {
      code:
        "renderer-premultiplied-alpha-required",
      message:
        "The image-formation renderer contract requires premultiplied alpha."
    });
  }

  if (
    !renderer
      .preservesDepthOrderAcrossWarps
  ) {
    addBlocker(blockers, {
      code:
        "renderer-depth-order-preservation-required",
      message:
        "The image-formation renderer contract requires depth-order preservation across warps."
    });
  }
}

function requestedEffectMap(
  fidelity:
    ImageFormationFidelityProfile
): ReadonlyMap<
  ImageFormationEffectId,
  RequiredImageFormationEffect
> {
  return new Map(
    fidelity.requiredEffects.map(
      (effect) => [
        effect.effectId,
        effect
      ] as const
    )
  );
}

function hasActiveUndeclaredFieldThroughput(
  prepared:
    PreparedImageFormationContext,
  snapshot:
    ProductionCaptureSnapshot
): boolean {
  const sample =
    snapshot.physicalSceneSample;
  if (
    sample === undefined ||
    sample.fieldThroughput.kind ===
      "unity"
  ) {
    return false;
  }
  return !prepared.fidelity
    .requiredEffects.some(
      (effect) =>
        effect.effectId ===
        "illumination-vignetting"
    );
}

function angularVelocityIsZero(
  velocity:
    CameraAngularVelocityRadPerSec
): boolean {
  return (
    velocity.pitch === 0 &&
    velocity.yaw === 0 &&
    velocity.roll === 0
  );
}

function computeTemporalResult(
  prepared:
    PreparedImageFormationContext,
  snapshot:
    ProductionCaptureSnapshot,
  requiredStages:
    ReadonlySet<ImageFormationStageId>,
  blockers:
    ProductionImageFormationBlocker[]
): ProductionTemporalCaptureResult | undefined {
  if (
    !requiredStages.has(
      "temporal-exposure-readout"
    )
  ) {
    return undefined;
  }

  const temporal =
    snapshot.temporalCapture;
  if (temporal === undefined) {
    addBlocker(blockers, {
      code:
        "missing-temporal-capture-input",
      stageId:
        "temporal-exposure-readout",
      message:
        "Temporal exposure/readout planning requires immutable temporal capture input."
    });
    return undefined;
  }

  const requestedEffects =
    requestedEffectMap(
      prepared.fidelity
    );

  if (
    requestedEffects.has(
      "spatial-camera-rotation"
    ) &&
    temporal.rotation === undefined
  ) {
    addBlocker(blockers, {
      code:
        "missing-camera-rotation-model",
      stageId:
        "temporal-exposure-readout",
      effectId:
        "spatial-camera-rotation",
      message:
        "Requested spatial camera rotation requires an explicit capture rotation model."
    });
  }

  if (
    requestedEffects.has(
      "rolling-readout"
    ) &&
    temporal.readout === undefined
  ) {
    addBlocker(blockers, {
      code:
        "missing-sensor-readout-timing",
      stageId:
        "temporal-exposure-readout",
      effectId:
        "rolling-readout",
      message:
        "Requested rolling-readout semantics require an explicit sensor readout declaration."
    });
  }

  const rotationRequested =
    requestedEffects.has(
      "spatial-camera-rotation"
    );

  if (
    rotationRequested &&
    temporal.rotation !== undefined
  ) {
    const rendererTemporal =
      prepared.renderer
        .temporalSampling;
    if (
      rendererTemporal.kind ===
        "none" ||
      rendererTemporal
        .maximumSamples <
        temporal.rotation
          .temporalSampleCount
    ) {
      addBlocker(blockers, {
        code:
          "renderer-temporal-sampling-insufficient",
        stageId:
          "temporal-exposure-readout",
        effectId:
          "spatial-camera-rotation",
        message:
          "Renderer temporal-sampling capability is insufficient for the committed rotation quadrature sample count."
      });
    }
  }

  try {
    const exposureWindows =
      calculateCaptureExposureWindows(
        temporal
          .exposureWindowInput
      ).value;

    const sensorReadoutTiming =
      temporal.readout === undefined
        ? undefined
        : calculateSensorReadoutTiming({
            nativeRaster:
              temporal
                .exposureWindowInput
                .nativeRaster,
            ...(temporal
              .exposureWindowInput
              .activeCaptureRect ===
            undefined
              ? {}
              : {
                  activeCaptureRect:
                    temporal
                      .exposureWindowInput
                      .activeCaptureRect
                }),
            shutterMechanism:
              temporal
                .exposureWindowInput
                .shutterMechanism,
            readout:
              temporal.readout,
            ...(temporal
              .exposureWindowInput
              .samplePointsNative ===
            undefined
              ? {}
              : {
                  samplePointsNative:
                    temporal
                      .exposureWindowInput
                      .samplePointsNative
                })
          }).value;

    const rotationQuadrature =
      !rotationRequested ||
      temporal.rotation === undefined
        ? undefined
        : calculateCaptureRotationTemporalQuadrature({
            ...temporal
              .exposureWindowInput,
            imagingArea:
              temporal.imagingArea,
            focalLengthMm:
              prepared
                .equipmentCapabilities
                .selectedFocalLengthMm,
            ...(temporal.rotation
              .focusDistanceM ===
            undefined
              ? {}
              : {
                  focusDistanceM:
                    temporal.rotation
                      .focusDistanceM
                }),
            angularVelocityRadPerSec:
              temporal.rotation
                .angularVelocityRadPerSec,
            orientation:
              temporal.orientation,
            temporalSampleCount:
              temporal.rotation
                .temporalSampleCount,
            samplePointsNative:
              temporal
                .exposureWindowInput
                .samplePointsNative!
          }).value;

    return {
      exposureWindows,
      ...(sensorReadoutTiming ===
      undefined
        ? {}
        : {
            sensorReadoutTiming
          }),
      ...(rotationQuadrature ===
      undefined
        ? {}
        : {
            rotationQuadrature
          }),
      exposureTimeReference:
        "first-opening-boundary-phase",
      readoutExposureSynchronization:
        "not-assumed",
      sensorReadoutTimingRemainsSeparate:
        true,
      temporalRadianceIntegrated:
        false
    };
  } catch (error) {
    if (
      error instanceof
        InvalidConfigurationError ||
      error instanceof
        InvalidScientificInputError
    ) {
      addBlocker(blockers, {
        code:
          "temporal-evaluation-blocked",
        stageId:
          "temporal-exposure-readout",
        message: error.message
      });
      return undefined;
    }
    throw error;
  }
}

function deriveEffectPlan(
  prepared:
    PreparedImageFormationContext,
  snapshot:
    ProductionCaptureSnapshot,
  temporalResult:
    ProductionTemporalCaptureResult | undefined,
  blockers:
    ProductionImageFormationBlocker[]
): readonly PlannedImageFormationEffect[] {
  const contract =
    getImageFormationContract();
  const requested =
    requestedEffectMap(
      prepared.fidelity
    );
  const rendererEffects =
    new Set(
      prepared.renderer
        .supportedEffects
    );

  return contract
    .effectPlacements.map(
      (placement) => {
        const request =
          requested.get(
            placement.id
          );
        if (request === undefined) {
          return {
            effectId: placement.id,
            primaryStage:
              placement.primaryStage,
            coupledStages: [
              ...placement
                .coupledStages
            ],
            state:
              "omitted-by-fidelity" as const,
            scientificStatus:
              "not-applicable" as const,
            requiredByFidelity:
              false,
            blockerCodes: []
          };
        }

        if (
          !COMPOSER_SUPPORTED_EFFECTS.has(
            placement.id
          )
        ) {
          const blocker:
            ProductionImageFormationBlocker = {
            code:
              "engine-effect-not-composed",
            effectId:
              placement.id,
            message:
              "Production plan schema 0.1.0 does not yet compose required effect " +
              placement.id +
              "."
          };
          addBlocker(
            blockers,
            blocker
          );
          return {
            effectId: placement.id,
            primaryStage:
              placement.primaryStage,
            coupledStages: [
              ...placement
                .coupledStages
            ],
            state:
              "unsupported" as const,
            scientificStatus:
              "not-applicable" as const,
            requiredByFidelity:
              true,
            modelId:
              request.modelId,
            modelVersion:
              request.modelVersion,
            blockerCodes: [
              blocker.code
            ]
          };
        }

        if (
          !rendererEffects.has(
            placement.id
          )
        ) {
          const blocker:
            ProductionImageFormationBlocker = {
            code:
              "renderer-effect-unsupported",
            effectId:
              placement.id,
            message:
              "Renderer does not declare support for required effect " +
              placement.id +
              "."
          };
          addBlocker(
            blockers,
            blocker
          );
          return {
            effectId: placement.id,
            primaryStage:
              placement.primaryStage,
            coupledStages: [
              ...placement
                .coupledStages
            ],
            state:
              "blocked" as const,
            scientificStatus:
              "not-applicable" as const,
            requiredByFidelity:
              true,
            modelId:
              request.modelId,
            modelVersion:
              request.modelVersion,
            blockerCodes: [
              blocker.code
            ]
          };
        }

        if (
          placement.id ===
          "illumination-vignetting"
        ) {
          const field =
            snapshot
              .physicalSceneSample
              ?.fieldThroughput;
          if (field === undefined) {
            const blocker:
              ProductionImageFormationBlocker = {
              code:
                "missing-physical-scene-sample",
              effectId:
                placement.id,
              message:
                "Illumination-vignetting planning requires a physical scene sample with explicit field throughput."
            };
            addBlocker(
              blockers,
              blocker
            );
            return {
              effectId:
                placement.id,
              primaryStage:
                placement.primaryStage,
              coupledStages: [],
              state:
                "blocked" as const,
              scientificStatus:
                "not-applicable" as const,
              requiredByFidelity:
                true,
              modelId:
                request.modelId,
              modelVersion:
                request.modelVersion,
              blockerCodes: [
                blocker.code
              ]
            };
          }

          const modeledZero =
            field.kind ===
              "unity" ||
            field.result
              .linearThroughputFactor ===
              1;
          return {
            effectId:
              placement.id,
            primaryStage:
              placement.primaryStage,
            coupledStages: [],
            state: modeledZero
              ? "modeled-zero"
              : "active",
            scientificStatus:
              "approximation",
            requiredByFidelity:
              true,
            modelId:
              request.modelId,
            modelVersion:
              request.modelVersion,
            blockerCodes: []
          };
        }

        if (
          placement.id ===
          "spatial-camera-rotation"
        ) {
          const rotation =
            snapshot.temporalCapture
              ?.rotation;
          if (rotation === undefined) {
            const blocker:
              ProductionImageFormationBlocker = {
              code:
                "missing-camera-rotation-model",
              effectId:
                placement.id,
              stageId:
                "temporal-exposure-readout",
              message:
                "Spatial camera rotation requires committed rotation input."
            };
            addBlocker(
              blockers,
              blocker
            );
            return {
              effectId:
                placement.id,
              primaryStage:
                placement.primaryStage,
              coupledStages: [
                ...placement
                  .coupledStages
              ],
              state: "blocked",
              scientificStatus:
                "not-applicable",
              requiredByFidelity:
                true,
              modelId:
                request.modelId,
              modelVersion:
                request.modelVersion,
              blockerCodes: [
                blocker.code
              ]
            };
          }

          const blocked =
            temporalResult
              ?.rotationQuadrature ===
              undefined &&
            !angularVelocityIsZero(
              rotation
                .angularVelocityRadPerSec
            );

          return {
            effectId:
              placement.id,
            primaryStage:
              placement.primaryStage,
            coupledStages: [
              ...placement
                .coupledStages
            ],
            state: blocked
              ? "blocked"
              : angularVelocityIsZero(
                    rotation
                      .angularVelocityRadPerSec
                  )
                ? "modeled-zero"
                : "active",
            scientificStatus:
              blocked
                ? "not-applicable"
                : "approximation",
            requiredByFidelity:
              true,
            modelId:
              request.modelId,
            modelVersion:
              request.modelVersion,
            blockerCodes:
              blocked
                ? blockers
                    .filter(
                      (blocker) =>
                        blocker.effectId ===
                        placement.id ||
                        blocker.stageId ===
                          placement
                            .primaryStage
                    )
                    .map(
                      (blocker) =>
                        blocker.code
                    )
                : []
          };
        }

        if (
          placement.id ===
          "rolling-readout"
        ) {
          const timing =
            temporalResult
              ?.sensorReadoutTiming;
          if (timing === undefined) {
            const blocker:
              ProductionImageFormationBlocker = {
              code:
                "missing-sensor-readout-timing",
              effectId:
                placement.id,
              stageId:
                "temporal-exposure-readout",
              message:
                "Rolling-readout effect requires resolved sensor readout timing."
            };
            addBlocker(
              blockers,
              blocker
            );
            return {
              effectId:
                placement.id,
              primaryStage:
                placement.primaryStage,
              coupledStages: [
                ...placement
                  .coupledStages
              ],
              state: "blocked",
              scientificStatus:
                "not-applicable",
              requiredByFidelity:
                true,
              modelId:
                request.modelId,
              modelVersion:
                request.modelVersion,
              blockerCodes: [
                blocker.code
              ]
            };
          }

          const modeledZero =
            timing.readoutMode ===
              "global" ||
            timing
              .maximumSpatialSamplingSkewSeconds ===
              0;

          return {
            effectId:
              placement.id,
            primaryStage:
              placement.primaryStage,
            coupledStages: [
              ...placement
                .coupledStages
            ],
            state: modeledZero
              ? "modeled-zero"
              : "active",
            scientificStatus:
              "approximation",
            requiredByFidelity:
              true,
            modelId:
              request.modelId,
            modelVersion:
              request.modelVersion,
            blockerCodes: []
          };
        }

        throw new InvalidConfigurationError(
          "Unexpected composed effect " +
            placement.id +
            "."
        );
      }
    );
}

function computePhysicalResult(
  prepared:
    PreparedImageFormationContext,
  snapshot:
    ProductionCaptureSnapshot,
  requiredStages:
    ReadonlySet<ImageFormationStageId>,
  blockers:
    ProductionImageFormationBlocker[]
): SceneToSensorIrradianceResult | undefined {
  if (
    !requiredStages.has(
      "lens-field-pupil-evaluation"
    )
  ) {
    return undefined;
  }

  if (
    prepared.opticalBridgeProfile ===
    undefined
  ) {
    addBlocker(blockers, {
      code:
        "missing-optical-bridge-profile",
      stageId:
        "lens-field-pupil-evaluation",
      message:
        "Physical lens-throughput planning requires a prepared #110 optical bridge profile."
    });
    return undefined;
  }

  const sample =
    snapshot
      .physicalSceneSample;
  if (sample === undefined) {
    addBlocker(blockers, {
      code:
        "missing-physical-scene-sample",
      stageId:
        "lens-field-pupil-evaluation",
      message:
        "Physical lens-throughput planning requires one immutable scene-radiance/field sample."
    });
    return undefined;
  }

  if (
    hasActiveUndeclaredFieldThroughput(
      prepared,
      snapshot
    )
  ) {
    addBlocker(blockers, {
      code:
        "undeclared-field-throughput-effect",
      stageId:
        "lens-field-pupil-evaluation",
      effectId:
        "illumination-vignetting",
      message:
        "A non-unity field-throughput input was supplied without requesting illumination-vignetting in the fidelity profile."
    });
    return undefined;
  }

  try {
    return calculateSceneRadianceToSensorIrradiance({
      sceneRadianceRequest:
        sample
          .sceneRadianceRequest,
      sceneRadianceResult:
        sample
          .sceneRadianceResult,
      profile:
        prepared
          .opticalBridgeProfile,
      focalLengthMm:
        prepared
          .equipmentCapabilities
          .selectedFocalLengthMm,
      nominalFNumber:
        snapshot.exposure
          .aperture,
      focus: sample.focus,
      imagePointMm:
        sample.imagePointMm,
      fieldThroughput:
        sample.fieldThroughput,
      ...(sample.frontOfLensFilters ===
      undefined
        ? {}
        : {
            frontOfLensFilters:
              sample.frontOfLensFilters
          })
    }).value;
  } catch (error) {
    if (
      error instanceof
        InvalidConfigurationError ||
      error instanceof
        InvalidScientificInputError
    ) {
      addBlocker(blockers, {
        code:
          "physical-radiometry-evaluation-blocked",
        stageId:
          "lens-field-pupil-evaluation",
        message:
          error.message
      });
      return undefined;
    }
    throw error;
  }
}

function deriveStagePlan(
  prepared:
    PreparedImageFormationContext,
  snapshot:
    ProductionCaptureSnapshot,
  requiredStages:
    ReadonlySet<ImageFormationStageId>,
  physicalResult:
    SceneToSensorIrradianceResult | undefined,
  temporalResult:
    ProductionTemporalCaptureResult | undefined,
  blockers:
    ProductionImageFormationBlocker[]
): readonly PlannedImageFormationStage[] {
  const contract =
    getImageFormationContract();
  const rendererStages =
    new Set(
      prepared.renderer
        .supportedStages
    );

  return contract.stages.map(
    (stage) => {
      if (
        !requiredStages.has(
          stage.id
        )
      ) {
        return {
          stageId: stage.id,
          contractStatus:
            stage.status,
          state:
            "omitted-by-fidelity" as const,
          scientificStatus:
            "not-applicable" as const,
          requiredByFidelity:
            false,
          requiredUpstreamStages: [
            ...stage
              .requiredUpstreamStages
          ],
          coupledStages: [
            ...stage.coupledStages
          ],
          blockerCodes: []
        };
      }

      const stageBlockers:
        ProductionImageFormationBlockerCode[] =
          [];

      if (
        !COMPOSER_SUPPORTED_STAGES.has(
          stage.id
        )
      ) {
        const blocker:
          ProductionImageFormationBlocker = {
          code:
            "engine-stage-not-composed",
          stageId: stage.id,
          message:
            "Production plan schema 0.1.0 does not yet compose required stage " +
            stage.id +
            "."
        };
        addBlocker(
          blockers,
          blocker
        );
        stageBlockers.push(
          blocker.code
        );
        return {
          stageId: stage.id,
          contractStatus:
            stage.status,
          state:
            "unsupported" as const,
          scientificStatus:
            "not-applicable" as const,
          requiredByFidelity:
            true,
          requiredUpstreamStages: [
            ...stage
              .requiredUpstreamStages
          ],
          coupledStages: [
            ...stage.coupledStages
          ],
          blockerCodes:
            stageBlockers
        };
      }

      if (
        !rendererStages.has(
          stage.id
        )
      ) {
        const blocker:
          ProductionImageFormationBlocker = {
          code:
            "renderer-stage-unsupported",
          stageId: stage.id,
          message:
            "Renderer does not declare support for required stage " +
            stage.id +
            "."
        };
        addBlocker(
          blockers,
          blocker
        );
        stageBlockers.push(
          blocker.code
        );
      }

      if (
        stage.id ===
        "lens-field-pupil-evaluation" &&
        physicalResult ===
          undefined
      ) {
        const relevant =
          blockers
            .filter(
              (blocker) =>
                blocker.stageId ===
                stage.id
            )
            .map(
              (blocker) =>
                blocker.code
            );
        stageBlockers.push(
          ...relevant
        );
      }

      if (
        stageBlockers.length > 0
      ) {
        return {
          stageId: stage.id,
          contractStatus:
            stage.status,
          state:
            "blocked" as const,
          scientificStatus:
            "not-applicable" as const,
          requiredByFidelity:
            true,
          requiredUpstreamStages: [
            ...stage
              .requiredUpstreamStages
          ],
          coupledStages: [
            ...stage.coupledStages
          ],
          blockerCodes: [
            ...new Set(
              stageBlockers
            )
          ]
        };
      }

      if (
        stage.id ===
        "scene-ray-projection"
      ) {
        const target =
          snapshot
            .physicalSceneSample
            ?.sceneRadianceRequest
            .target;
        const modeledZero =
          target?.kind ===
          "environment-direction";
        return {
          stageId: stage.id,
          contractStatus:
            stage.status,
          state: modeledZero
            ? "modeled-zero"
            : "active",
          scientificStatus:
            "approximation",
          requiredByFidelity:
            true,
          requiredUpstreamStages: [],
          coupledStages: [
            ...stage.coupledStages
          ],
          modelId:
            "capture-bound-scene-ray-target",
          modelVersion:
            "1.0.0",
          resultIdentity:
            target?.kind ??
            "unresolved-target",
          blockerCodes: []
        };
      }

      if (
        stage.id ===
        "scene-radiance-evaluation"
      ) {
        const sample =
          snapshot
            .physicalSceneSample;
        if (sample === undefined) {
          const blocker:
            ProductionImageFormationBlocker = {
            code:
              "missing-physical-scene-sample",
            stageId: stage.id,
            message:
              "Scene-radiance stage requires one immutable #85 request/result sample."
          };
          addBlocker(
            blockers,
            blocker
          );
          return {
            stageId: stage.id,
            contractStatus:
              stage.status,
            state:
              "blocked" as const,
            scientificStatus:
              "not-applicable" as const,
            requiredByFidelity:
              true,
            requiredUpstreamStages: [
              ...stage
                .requiredUpstreamStages
            ],
            coupledStages: [
              ...stage
                .coupledStages
            ],
            blockerCodes: [
              blocker.code
            ]
          };
        }
        return {
          stageId: stage.id,
          contractStatus:
            stage.status,
          state: "active" as const,
          scientificStatus:
            "approximation" as const,
          requiredByFidelity:
            true,
          requiredUpstreamStages: [
            ...stage
              .requiredUpstreamStages
          ],
          coupledStages: [
            ...stage.coupledStages
          ],
          modelId:
            "scene-radiance-provider-result",
          modelVersion:
            sample
              .sceneRadianceResult
              .schemaVersion,
          resultIdentity:
            sample
              .sceneRadianceResult
              .sampleId,
          blockerCodes: []
        };
      }

      if (
        stage.id ===
        "lens-field-pupil-evaluation"
      ) {
        const result =
          physicalResult!;
        return {
          stageId: stage.id,
          contractStatus:
            stage.status,
          state: "active" as const,
          scientificStatus:
            result.scientificStatus,
          requiredByFidelity:
            true,
          requiredUpstreamStages: [
            ...stage
              .requiredUpstreamStages
          ],
          coupledStages: [
            ...stage.coupledStages
          ],
          modelId:
            "scene-radiance-to-sensor-irradiance",
          modelVersion: "1.0.0",
          resultIdentity:
            result.sampleId,
          blockerCodes: []
        };
      }

      if (
        stage.id ===
        "temporal-exposure-readout"
      ) {
        if (temporalResult === undefined) {
          const relevant =
            blockers
              .filter(
                (blocker) =>
                  blocker.stageId ===
                  stage.id
              )
              .map(
                (blocker) =>
                  blocker.code
              );
          return {
            stageId: stage.id,
            contractStatus:
              stage.status,
            state: "blocked",
            scientificStatus:
              "not-applicable",
            requiredByFidelity:
              true,
            requiredUpstreamStages: [
              ...stage
                .requiredUpstreamStages
            ],
            coupledStages: [
              ...stage.coupledStages
            ],
            modelId:
              "capture-temporal-schedule",
            modelVersion:
              "1.0.0",
            blockerCodes: [
              ...new Set(relevant)
            ]
          };
        }

        return {
          stageId: stage.id,
          contractStatus:
            stage.status,
          state: "active",
          scientificStatus:
            "approximation",
          requiredByFidelity:
            true,
          requiredUpstreamStages: [
            ...stage
              .requiredUpstreamStages
          ],
          coupledStages: [
            ...stage.coupledStages
          ],
          modelId:
            "capture-temporal-schedule",
          modelVersion:
            "1.0.0",
          resultIdentity:
            snapshot
              .fingerprint.value,
          blockerCodes: []
        };
      }

      throw new InvalidConfigurationError(
        "Unexpected composed stage."
      );
    }
  );
}

type ProductionUncertaintyInput =
  | SceneRadianceUncertainty
  | OpticalBridgeUncertainty
  | FrontOfLensFilterUncertainty;

function toAssuranceUncertainty(
  uncertainty:
    ProductionUncertaintyInput
): ScientificAssuranceComponentUncertainty {
  if (
    uncertainty.kind ===
    "relative"
  ) {
    return {
      kind: "relative",
      fraction:
        uncertainty.fraction,
      basis:
        uncertainty.basis
    };
  }

  return {
    kind: "not-quantified",
    limitation:
      uncertainty.limitation
  };
}

function physicalAssuranceComponents(
  prepared:
    PreparedImageFormationContext,
  snapshot:
    ProductionCaptureSnapshot,
  physicalResult:
    SceneToSensorIrradianceResult
): readonly ScientificAssuranceComponent[] {
  const sample =
    snapshot.physicalSceneSample;
  const optical =
    prepared.opticalBridgeProfile;

  if (
    sample === undefined ||
    optical === undefined
  ) {
    throw new InvalidConfigurationError(
      "Physical scientific assurance requires the committed physical sample and optical profile."
    );
  }

  const components:
    ScientificAssuranceComponent[] =
      [
        {
          componentId:
            "scene-radiance",
          role:
            "outgoing scene spectral radiance",
          required: true,
          sourceIdentity: {
            kind: "result",
            id:
              sample
                .sceneRadianceResult
                .sampleId,
            version:
              sample
                .sceneRadianceResult
                .schemaVersion
          },
          basisKind:
            "evidence-backed-fact",
          scientificStatus:
            sample
              .sceneRadianceResult
              .scientificStatus,
          evidenceRequirement:
            "required",
          evidence:
            sample
              .sceneRadianceResult
              .evidence,
          uncertainty:
            toAssuranceUncertainty(
              sample
                .sceneRadianceResult
                .uncertainty
            ),
          limitations: [
            ...sample
              .sceneRadianceResult
              .limitations
          ]
        },
        {
          componentId:
            "optical-throughput-profile",
          role:
            "lens throughput and working-aperture profile",
          required: true,
          sourceIdentity: {
            kind: "profile",
            id:
              optical.profileId,
            version:
              optical.profileVersion
          },
          basisKind:
            "evidence-backed-fact",
          scientificStatus:
            optical
              .scientificStatus,
          evidenceRequirement:
            "required",
          evidence: [
            ...physicalResult
              .componentEvidence
              .opticalProfile,
            ...physicalResult
              .componentEvidence
              .transmission,
            ...physicalResult
              .componentEvidence
              .workingFNumber
          ],
          uncertainty:
            toAssuranceUncertainty(
              optical
                .transmission
                .uncertainty
            ),
          limitations: [
            ...optical.limitations
          ]
        },
        {
          componentId:
            "primary-optics-bridge-model",
          role:
            "scene-radiance to pre-sensor-stack irradiance composition model",
          required: true,
          sourceIdentity: {
            kind: "model",
            id:
              "scene-radiance-to-sensor-irradiance",
            version: "1.1.0"
          },
          basisKind:
            "photivra-model-assumption",
          scientificStatus:
            "approximation",
          evidenceRequirement:
            "not-required",
          evidence: [],
          uncertainty: {
            kind:
              "not-quantified",
            limitation:
              "The paraxial primary-optics bridge is an explicit approximation with no defensible aggregate model-error bound yet."
          },
          limitations: [
            "Paraxial circular-pupil acceptance is not a full ray-traced pupil solution.",
            "PSF redistribution, sensor optical-stack response and polarization remain outside this bridge."
          ]
        }
      ];

  for (
    let index = 0;
    index <
      (sample.frontOfLensFilters
        ?.length ?? 0);
    index += 1
  ) {
    const profile =
      sample
        .frontOfLensFilters![
          index
        ]!;
    const resolved =
      resolveFrontOfLensFilterTransmission({
        profile,
        wavelengthNanometers:
          physicalResult
            .wavelengthNanometers,
        wavelengthBasis:
          physicalResult
            .wavelengthBasis
      });

    components.push({
      componentId:
        "front-filter:" +
        index,
      role:
        "front-of-lens transmission filter",
      required: true,
      sourceIdentity: {
        kind: "profile",
        id: resolved.filterId,
        version:
          resolved.profileVersion
      },
      basisKind:
        "evidence-backed-fact",
      scientificStatus:
        resolved
          .scientificStatus,
      evidenceRequirement:
        "required",
      evidence:
        resolved.evidence,
      uncertainty:
        toAssuranceUncertainty(
          resolved.uncertainty
        ),
      limitations: [
        ...resolved.limitations
      ]
    });
  }

  if (
    sample.fieldThroughput.kind !==
    "unity"
  ) {
    components.push({
      componentId:
        "field-throughput-model",
      role:
        "field-dependent illumination throughput",
      required: true,
      sourceIdentity: {
        kind: "model",
        id:
          "generic-illumination-vignetting",
        version: "1.0.0"
      },
      basisKind:
        "photivra-model-assumption",
      scientificStatus:
        "approximation",
      evidenceRequirement:
        "not-required",
      evidence: [],
      uncertainty: {
        kind: "not-quantified",
        limitation:
          "The capture snapshot retains the evaluated vignetting value but not the source CalculationResult quality envelope; no numeric uncertainty is inferred."
      },
      limitations: [
        "Field-throughput model status remains separate from lens transmission and front-filter transmission.",
        "Future capture contracts must explicitly preserve source quality if calibrated field-throughput uncertainty is required downstream."
      ]
    });
  }

  return components;
}

function temporalAssuranceComponent(
  snapshot:
    ProductionCaptureSnapshot
): ScientificAssuranceComponent {
  return {
    componentId:
      "temporal-capture-schedule",
    role:
      "capture exposure/readout temporal composition",
    required: true,
    sourceIdentity: {
      kind: "model",
      id:
        "capture-temporal-schedule",
      version: "1.0.0"
    },
    basisKind:
      "photivra-model-assumption",
    scientificStatus:
      "approximation",
    evidenceRequirement:
      "not-required",
    evidence: [],
    uncertainty: {
      kind: "not-quantified",
      limitation:
        "Temporal schedule composition preserves declared timing facts but does not claim a generic aggregate timing/model uncertainty."
    },
    limitations: [
      "Readout/exposure synchronization is not assumed unless explicitly modeled.",
      "Renderer execution timing does not redefine the committed capture schedule.",
      "Capture identity " +
        snapshot.captureId +
        " owns the committed temporal state."
    ]
  };
}

function composeProductionScientificAssurance(
  prepared:
    PreparedImageFormationContext,
  snapshot:
    ProductionCaptureSnapshot,
  physicalResult:
    SceneToSensorIrradianceResult | undefined,
  temporalResult:
    ProductionTemporalCaptureResult | undefined
): ComposedScientificAssurance | undefined {
  const components:
    ScientificAssuranceComponent[] =
      [];

  if (
    physicalResult !== undefined
  ) {
    components.push(
      ...physicalAssuranceComponents(
        prepared,
        snapshot,
        physicalResult
      )
    );
  }

  if (
    temporalResult !== undefined
  ) {
    components.push(
      temporalAssuranceComponent(
        snapshot
      )
    );
  }

  if (components.length === 0) {
    return undefined;
  }

  return composeScientificAssurance({
    components
  });
}

export function createProductionImageFormationPlan(
  input:
    CreateProductionImageFormationPlanInput
): ProductionImageFormationPlan {
  const prepared =
    parsePreparedImageFormationContext(
      input.preparedContext
    );
  const snapshot =
    parseProductionCaptureSnapshot(
      input.captureSnapshot
    );

  validateSnapshotAgainstContext(
    prepared,
    snapshot
  );

  const requiredStages =
    expandRequiredStages(
      prepared.fidelity
    );
  const blockers:
    ProductionImageFormationBlocker[] =
      [];

  evaluateRendererRequirements(
    prepared,
    requiredStages,
    blockers
  );

  const physicalResult =
    computePhysicalResult(
      prepared,
      snapshot,
      requiredStages,
      blockers
    );

  const temporalResult =
    computeTemporalResult(
      prepared,
      snapshot,
      requiredStages,
      blockers
    );

  const scientificAssurance =
    composeProductionScientificAssurance(
      prepared,
      snapshot,
      physicalResult,
      temporalResult
    );

  const effectPlan =
    deriveEffectPlan(
      prepared,
      snapshot,
      temporalResult,
      blockers
    );
  const stagePlan =
    deriveStagePlan(
      prepared,
      snapshot,
      requiredStages,
      physicalResult,
      temporalResult,
      blockers
    );

  const core = {
    version:
      PRODUCTION_IMAGE_FORMATION_PLAN_VERSION,
    status:
      blockers.length === 0
        ? "ready" as const
        : "blocked" as const,
    versions: {
      engineApi:
        ENGINE_API_VERSION,
      imageFormationContract:
        IMAGE_FORMATION_CONTRACT_VERSION,
      plan:
        PRODUCTION_IMAGE_FORMATION_PLAN_VERSION,
      preparedContext:
        PREPARED_IMAGE_FORMATION_CONTEXT_VERSION,
      captureSnapshot:
        PRODUCTION_CAPTURE_SNAPSHOT_VERSION,
      rendererCapability:
        RENDERER_CAPABILITY_SCHEMA_VERSION,
      fidelityProfile:
        IMAGE_FORMATION_FIDELITY_PROFILE_SCHEMA_VERSION,
      scientificAssurance:
        SCIENTIFIC_ASSURANCE_CONTRACT_VERSION
    },
    contextIdentity: {
      contextId:
        prepared.contextId,
      preparedContextFingerprint:
        prepared
          .fingerprint.value
    },
    captureIdentity: {
      captureId:
        snapshot.captureId,
      releaseFrameId:
        snapshot.releaseFrameId,
      sceneStateId:
        snapshot.sceneStateId,
      ...(snapshot
        .releaseFrameBinding ===
      undefined
        ? {}
        : {
            releaseSequenceId:
              snapshot
                .releaseFrameBinding
                .sequenceId,
            releaseFrameIndex:
              snapshot
                .releaseFrameBinding
                .frameIndex
          }),
      ...(snapshot
        .whiteBalanceState ===
      undefined
        ? {}
        : {
            whiteBalanceStateId:
              snapshot
                .whiteBalanceState
                .stateId
          }),
      captureSnapshotFingerprint:
        snapshot
          .fingerprint.value
    },
    rendererIdentity: {
      rendererId:
        prepared.renderer
          .rendererId,
      rendererVersion:
        prepared.renderer
          .rendererVersion,
      consumerKind:
        prepared.renderer
          .consumerKind
    },
    fidelityIdentity: {
      profileId:
        prepared.fidelity
          .profileId,
      profileVersion:
        prepared.fidelity
          .profileVersion
    },
    stagePlan,
    effectPlan,
    blockers,
    ...(physicalResult ===
    undefined
      ? {}
      : {
          physicalSceneToSensorResult:
            physicalResult
        }),
    ...(temporalResult ===
    undefined
      ? {}
      : {
          temporalCaptureResult:
            temporalResult
        }),
    ...(scientificAssurance ===
    undefined
      ? {}
      : {
          scientificAssurance
        }),
    stochastic: {
      captureSeedUint32:
        snapshot
          .stochasticSeedUint32,
      backendRandomnessMayRedefineScientificResult:
        false as const
    },
    immutableCaptureSnapshot:
      true as const,
    legacyPocModified:
      false as const
  };

  const plan:
    ProductionImageFormationPlan = {
    ...core,
    fingerprint: {
      algorithm:
        "fnv1a-32-non-cryptographic",
      value:
        fingerprintValue(core),
      purpose:
        "deterministic-reproducibility-key-not-integrity-security"
    }
  };

  return deepFreeze(
    cloneJson(plan)
  );
}
