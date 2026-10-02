# composition/image-formation-plan.ts public contracts

Package **1.0.1**, root API **1.0.1**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## createProductionCaptureSnapshot

Commit resolved capture settings, scene time/identity, stochastic seed and optional
temporal/focus/WB state by value. Later application mutations cannot alter this scientific event.

The planner owns scientific stage ordering, immutable capture identity and reproducibility.
Well-formed unsupported combinations produce structured blockers; malformed declarations throw. The
bounded environment route executes supplied radiance through native RAW and optional output, while
sample-only and attached-RAW routes retain missing upstream blockers. FNV fingerprints are
reproducibility keys, not cryptographic integrity proofs.

```ts
export function createProductionCaptureSnapshot(
  input:
    CreateProductionCaptureSnapshotInput
): ProductionCaptureSnapshot;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## createProductionCaptureSnapshotFromReleaseFrame

Creates one immutable production snapshot directly from a committed #105
release frame. The release frame owns exposure/focus/automation/seed
identity; callers provide only the scene/output-local state that is not
owned by the release sequence.

```ts
export function createProductionCaptureSnapshotFromReleaseFrame(
  input:
    CreateProductionCaptureSnapshotFromReleaseFrameInput
): ProductionCaptureSnapshot;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CreateProductionCaptureSnapshotFromReleaseFrameInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
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
```

## CreateProductionCaptureSnapshotInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
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
```

## createProductionImageFormationPlan

Expand requested stages through the authoritative graph, validate shared commitments and capability
limits, then execute only supported declared input routes. Return explicit
active/zero/omitted/blocked dispositions and child evidence rather than silently skipping a
requested effect.

The planner owns scientific stage ordering, immutable capture identity and reproducibility.
Well-formed unsupported combinations produce structured blockers; malformed declarations throw. The
bounded environment route executes supplied radiance through native RAW and optional output, while
sample-only and attached-RAW routes retain missing upstream blockers. FNV fingerprints are
reproducibility keys, not cryptographic integrity proofs.

```ts
export function createProductionImageFormationPlan(
  input:
    CreateProductionImageFormationPlanInput
): ProductionImageFormationPlan;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CreateProductionImageFormationPlanInput

Join one validated prepared context and immutable capture snapshot with exactly
one supported physical input route: supplied sample, attached RAW processing or
executed environment capture. The environment route owns its synchronous
provider callback and may supply a processing policy with RAW omitted; execution
provides the exact realized frame. Incompatible route combinations fail closed.
A complete record does not authorize effects outside the supported envelope.

```ts
export interface CreateProductionImageFormationPlanInput {
  environmentCapture?: ProductionEnvironmentCaptureInput;
  /** Explicit authoritative post-ADC RAW input; output processing cannot synthesize upstream scene truth. */
  processedOutput?: ProductionProcessedOutputInput;
  preparedContext:
    PreparedImageFormationContext;
  captureSnapshot:
    ProductionCaptureSnapshot;
}
```

## IMAGE_FORMATION_FIDELITY_PROFILE_SCHEMA_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
IMAGE_FORMATION_FIDELITY_PROFILE_SCHEMA_VERSION =
  "0.1.0" as const
```

## ImageFormationFidelityProfile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
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
```

## parseImageFormationFidelityProfile

Validate an untrusted declaration and return the normalized typed contract. Unknown enum values,
missing required fields and incompatible scientific data fail at this boundary.

The planner owns scientific stage ordering, immutable capture identity and reproducibility.
Well-formed unsupported combinations produce structured blockers; malformed declarations throw. The
bounded environment route executes supplied radiance through native RAW and optional output, while
sample-only and attached-RAW routes retain missing upstream blockers. FNV fingerprints are
reproducibility keys, not cryptographic integrity proofs.

```ts
export function parseImageFormationFidelityProfile(
  value: unknown
): ImageFormationFidelityProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## parsePreparedImageFormationContext

Validate an untrusted declaration and return the normalized typed contract. Unknown enum values,
missing required fields and incompatible scientific data fail at this boundary.

The planner owns scientific stage ordering, immutable capture identity and reproducibility.
Well-formed unsupported combinations produce structured blockers; malformed declarations throw. The
bounded environment route executes supplied radiance through native RAW and optional output, while
sample-only and attached-RAW routes retain missing upstream blockers. FNV fingerprints are
reproducibility keys, not cryptographic integrity proofs.

```ts
export function parsePreparedImageFormationContext(
  value: unknown
): PreparedImageFormationContext;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## parseProductionCaptureSnapshot

Validate an untrusted declaration and return the normalized typed contract. Unknown enum values,
missing required fields and incompatible scientific data fail at this boundary.

The planner owns scientific stage ordering, immutable capture identity and reproducibility.
Well-formed unsupported combinations produce structured blockers; malformed declarations throw. The
bounded environment route executes supplied radiance through native RAW and optional output, while
sample-only and attached-RAW routes retain missing upstream blockers. FNV fingerprints are
reproducibility keys, not cryptographic integrity proofs.

```ts
export function parseProductionCaptureSnapshot(
  value: unknown
): ProductionCaptureSnapshot;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## parseRendererCapabilityDeclaration

Validate an untrusted declaration and return the normalized typed contract. Unknown enum values,
missing required fields and incompatible scientific data fail at this boundary.

The planner owns scientific stage ordering, immutable capture identity and reproducibility.
Well-formed unsupported combinations produce structured blockers; malformed declarations throw. The
bounded environment route executes supplied radiance through native RAW and optional output, while
sample-only and attached-RAW routes retain missing upstream blockers. FNV fingerprints are
reproducibility keys, not cryptographic integrity proofs.

```ts
export function parseRendererCapabilityDeclaration(
  value: unknown
): RendererCapabilityDeclaration;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## PlannedImageFormationEffect

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
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
```

## PlannedImageFormationEffectState

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type PlannedImageFormationEffectState =
  | "active"
  | "modeled-zero"
  | "omitted-by-fidelity"
  | "unsupported"
  | "blocked";
```

## PlannedImageFormationStage

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
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
```

## PlannedImageFormationStageState

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type PlannedImageFormationStageState =
  | "active"
  | "modeled-zero"
  | "omitted-by-fidelity"
  | "unsupported"
  | "blocked";
```

## PlannedScientificStatus

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type PlannedScientificStatus =
  | "calibrated"
  | "approximation"
  | "not-applicable";
```

## PREPARED_IMAGE_FORMATION_CONTEXT_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
PREPARED_IMAGE_FORMATION_CONTEXT_VERSION =
  "0.1.0" as const
```

## PreparedImageFormationContext

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
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
```

## prepareImageFormationContext

Parse, own and freeze relatively static equipment, scene, renderer and fidelity declarations for
reuse by later immutable captures. This prepares semantic state and does not render a frame.

The planner owns scientific stage ordering, immutable capture identity and reproducibility.
Well-formed unsupported combinations produce structured blockers; malformed declarations throw. The
bounded environment route executes supplied radiance through native RAW and optional output, while
sample-only and attached-RAW routes retain missing upstream blockers. FNV fingerprints are
reproducibility keys, not cryptographic integrity proofs.

```ts
export function prepareImageFormationContext(
  input:
    PrepareImageFormationContextInput
): PreparedImageFormationContext;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## PrepareImageFormationContextInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
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
```

## PRODUCTION_CAPTURE_SNAPSHOT_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
PRODUCTION_CAPTURE_SNAPSHOT_VERSION =
  "0.3.0" as const
```

## PRODUCTION_IMAGE_FORMATION_PLAN_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
PRODUCTION_IMAGE_FORMATION_PLAN_VERSION =
  "0.7.0" as const
```

## ProductionCaptureSnapshot

Owned frozen per-event state linking capture/release/scene/output IDs, physical
aperture/shutter/ISO, seconds-valued scene time and an explicit uint32 seed.
Optional focus/WB/temporal bindings commit their exact resolved state. This is a
semantic snapshot, not the generated image; changing a later UI value requires a
new snapshot rather than mutating a previously planned capture.

```ts
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
```

## ProductionEnvironmentCaptureInput

Executes the existing bounded environment capture inside the authoritative plan.
The callback is synchronous local provider code; it is never serialized. Returned
provider samples and realized RAW, rather than function identity, bind replay.

```ts
export interface ProductionEnvironmentCaptureInput {
  capture: SimulateEnvironmentSensorRawFrameInput;
  /** Optional post-capture policy. The RAW source is supplied only by execution. */
  processing?: Omit<ProcessedSensorRawInput, "reconstruction"> & {
    reconstruction: Omit<ProcessedSensorRawInput["reconstruction"], "rawFrame">;
  };
}
```

## ProductionImageFormationBlocker

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ProductionImageFormationBlocker {
  code:
    ProductionImageFormationBlockerCode;
  message: string;
  stageId?: ImageFormationStageId;
  effectId?: ImageFormationEffectId;
}
```

## ProductionImageFormationBlockerCode

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type ProductionImageFormationBlockerCode =
  | "environment-capture-evaluation-blocked"
  | "processed-output-evaluation-blocked"
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
```

## ProductionImageFormationPlan

Immutable engine-owned scientific execution record. Inspect status and blockers
before treating requested stages as usable; each stage distinguishes execution,
modeled-zero, fidelity omission and unsupported inputs. Optional environment and
processed results carry exact child lineage, while sample-only routes retain
upstream blockers. Versions identify independent contracts. The fingerprint is
canonical FNV reproducibility identity, not adversarial integrity. Replay also
requires identical provider responses; no renderer callback is serialized.

```ts
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
  /** Noncryptographic commitment of execution data, excluding executable callback identity. */
  environmentCaptureRequestFingerprint?: string;
  /** Executed bounded source-to-ADC lineage; provider transport remains unverified. */
  environmentCaptureResult?: ReturnType<typeof simulateEnvironmentSensorRawFrame>;
  processedOutputResult?: ReturnType<typeof calculateProcessedSensorRaw>;
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
```

## ProductionPhysicalSceneSample

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
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
```

## ProductionProcessedOutputInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ProductionProcessedOutputInput {
  /** Explicit binding of numeric raster/crop policy to the committed output state. */
  outputStateId: string;
  processing: ProcessedSensorRawInput;
}
```

## ProductionReleaseFrameBinding

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
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
```

## ProductionTemporalCaptureInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
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
```

## ProductionTemporalCaptureResult

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
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
```

## RENDERER_CAPABILITY_SCHEMA_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
RENDERER_CAPABILITY_SCHEMA_VERSION =
  "0.1.0" as const
```

## RendererCapabilityDeclaration

Plain-data declaration of one consumer backend's supported scientific domains,
stages/effects and temporal budget. It is validated metadata, not executable
renderer code or proof of physical correctness. Unknown/insufficient capability
must block requested fidelity before trusted provider execution. Interactive and
reference roles keep the same committed science even when backend fidelity differs.

```ts
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
```

## RendererConsumerKind

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type RendererConsumerKind =
  | "interactive-optimized"
  | "reference";
```

## RequiredImageFormationEffect

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface RequiredImageFormationEffect {
  effectId: ImageFormationEffectId;
  modelId: string;
  modelVersion: string;
}
```

## serializeProductionImageFormationPlan

Return deterministic canonical JSON of a validated production plan. Sorted object keys preserve
array order; the representation contains data and excludes executable provider callbacks.

The planner owns scientific stage ordering, immutable capture identity and reproducibility.
Well-formed unsupported combinations produce structured blockers; malformed declarations throw. The
bounded environment route executes supplied radiance through native RAW and optional output, while
sample-only and attached-RAW routes retain missing upstream blockers. FNV fingerprints are
reproducibility keys, not cryptographic integrity proofs.

```ts
export function serializeProductionImageFormationPlan(
  plan:
    ProductionImageFormationPlan
): string;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.
