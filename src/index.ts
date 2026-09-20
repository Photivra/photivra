// SPDX-License-Identifier: Apache-2.0

/**
 * Current public API contract version for the Photivra engine.
 *
 * This constant is intentionally independent of the package version so
 * schema/API compatibility can be discussed explicitly.
 */
export const ENGINE_API_VERSION = "0.17.0" as const;

export {
  approximationResult,
  calibratedResult,
  calculatedResult,
  estimatedResult,
  validateCalculationQuality,
  type AbsoluteUncertaintyEstimate,
  type CalculationProvenance,
  type CalculationQuality,
  type CalculationResult,
  type CalculationValidRange,
  type ProvenanceKind,
  type RelativeUncertaintyEstimate,
  type UncertaintyConfidence,
  type UncertaintyEstimate,
  type UncertaintySource
} from "./core/calculation-result.js";
export {
  InvalidScientificInputError,
  InvalidScientificResultError
} from "./core/validation.js";

export {
  calculateFieldOfView,
  type CalculateFieldOfViewInput,
  type FieldOfView
} from "./camera/field-of-view.js";

export {
  calculateProjectedObjectSize,
  type CalculateProjectedObjectSizeInput,
  type ProjectedObjectSize
} from "./camera/projected-object-size.js";

export {
  calculatePixelPitch,
  type CalculatePixelPitchInput,
  type PixelPitch
} from "./sensor/pixel-pitch.js";

export {
  calculateCenteredCrop,
  type CalculateCenteredCropInput,
  type CenteredCrop
} from "./output/crop.js";

export {
  calculateSubjectFramingCrop,
  type CalculateSubjectFramingCropInput,
  type SubjectFramingCrop
} from "./output/subject-framing-crop.js";

export {
  calculateIdealApertureGeometry,
  type ApertureVertex,
  type CalculateIdealApertureInput,
  type IdealApertureGeometry
} from "./optics/aperture.js";

export {
  calculateAiryDisk,
  type AiryDisk,
  type CalculateAiryDiskInput
} from "./optics/diffraction.js";

export {
  estimateEquivalentViewingCircleOfConfusion,
  type EquivalentViewingCircleOfConfusion,
  type EstimateEquivalentViewingCircleOfConfusionInput
} from "./optics/circle-of-confusion.js";

export {
  calculateThinLensImageDistance,
  type CalculateThinLensImageDistanceInput,
  type ThinLensImageDistance
} from "./optics/thin-lens.js";

export {
  calculateDefocusCircle,
  calculateDepthOfField,
  type CalculateDefocusCircleInput,
  type CalculateDepthOfFieldInput,
  type DefocusCircle,
  type DepthOfField
} from "./optics/depth-of-field.js";

export type {
  CameraConfiguration,
  CameraSupport,
  ExposureConfiguration,
  FocusConfiguration,
  LensConfiguration,
  SensorConfiguration,
  StabilizationConfiguration
} from "./schema/camera.js";

export type {
  SceneCapability,
  SceneDefinition,
  SceneMotion,
  SceneObject,
  SceneRadiometry,
  Vector3
} from "./schema/scene.js";


export {
  calculateProjectedMotionBlur,
  type CalculateProjectedMotionBlurInput,
  type ProjectedMotionBlur
} from "./motion/projected-motion.js";

export {
  calculateEquivalentIso,
  calculateExposureValue100,
  calculateRelativeOpticalExposure,
  type CalculateEquivalentIsoInput,
  type CalculateExposureValue100Input,
  type CalculateRelativeOpticalExposureInput,
  type RelativeOpticalExposure
} from "./exposure/exposure.js";

export {
  estimateCameraShakeBlur,
  type CameraShakeBlurSample,
  type CameraShakeEstimate,
  type EstimateCameraShakeBlurInput
} from "./stabilization/camera-shake.js";

export {
  calculatePhotoelectrons,
  calculateSignalToNoise,
  type CalculatePhotoelectronsInput,
  type CalculateSignalToNoiseInput,
  type SignalToNoise
} from "./sensor/signal-noise.js";


export {
  simulatePocCamera,
  type PocSimulationRequest,
  type PocSimulationResponse
} from "./simulation/poc-simulation.js";

export {
  InvalidConfigurationError,
  parseCameraConfiguration,
  parseSceneDefinition
} from "./schema/validation.js";
