// SPDX-License-Identifier: Apache-2.0

/**
 * Current public API contract version for the Photivra engine.
 *
 * This constant is intentionally independent of the package version so
 * schema/API compatibility can be discussed explicitly.
 */
export const ENGINE_API_VERSION = "0.30.0" as const;

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
  IMAGE_FORMATION_CONTRACT_VERSION,
  getImageFormationContract,
  type ImageFormationContract,
  type ImageFormationCoordinateSpaceContract,
  type ImageFormationCoordinateSpaceId,
  type ImageFormationDomainId,
  type ImageFormationEffectId,
  type ImageFormationEffectPlacement,
  type ImageFormationImplementationStatus,
  type ImageFormationRendererContract,
  type ImageFormationStageContract,
  type ImageFormationStageId,
  type ImageFormationTemporalContract
} from "./core/image-formation.js";

export {
  calculateFieldOfView,
  calculateFieldOfViewBounds,
  type CalculateFieldOfViewBoundsInput,
  type CalculateFieldOfViewInput,
  type FieldOfView,
  type FieldOfViewBounds
} from "./camera/field-of-view.js";

export {
  calculateProjectedObjectSize,
  type CalculateProjectedObjectSizeInput,
  type ProjectedObjectSize
} from "./camera/projected-object-size.js";

export {
  calculateEquivalentFocalLength35Mm,
  type CalculateEquivalentFocalLength35MmInput,
  type EquivalentFocalLength35Mm
} from "./camera/equivalent-focal-length.js";

export {
  calculatePixelPitch,
  type CalculatePixelPitchInput,
  type PixelPitch
} from "./sensor/pixel-pitch.js";

export {
  calculateImagingAreaMetrics,
  calculateSensorGeometryMetrics,
  type CalculateSensorGeometryMetricsInput,
  type ImagingAreaMetrics,
  type NativeImageRaster,
  type RasterDimensions,
  type SensorGeometryMetrics,
  type SensorImagingArea
} from "./sensor/sensor-geometry.js";

export {
  parseSensorArchitectureProfile,
  type SensorArchitectureFactProvenance,
  type SensorArchitectureProfile,
  type SensorArchitectureReuseStatus,
  type SensorArchitectureSourceKind,
  type SensorColorSamplingFamily,
  type SensorIlluminationArchitecture,
  type SensorIntegrationArchitecture,
  type SensorReadoutArchitecture,
  type SourcedSensorArchitectureFact
} from "./sensor/architecture.js";

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
  calculateActiveCaptureFieldOfView,
  calculateOutputFieldOfView,
  resolveCaptureGeometry,
  transformNativeRasterPointToOriented,
  transformNativeRasterRectToOriented,
  transformNativeRasterVectorToOriented,
  transformOrientedRasterPointToNative,
  transformOrientedRasterRectToNative,
  transformOrientedRasterVectorToNative,
  type ActiveCaptureFieldOfView,
  type CalculateActiveCaptureFieldOfViewInput,
  type CalculateOutputFieldOfViewInput,
  type CaptureOrientation,
  type OutputFieldOfView,
  type PhysicalBoundsFromOpticalAxisMm,
  type RasterPoint,
  type RasterRect,
  type RasterVector,
  type ResolveCaptureGeometryInput,
  type ResolvedCaptureGeometry,
  type TransformRasterPointInput,
  type TransformRasterRectInput,
  type TransformRasterVectorInput
} from "./output/capture-geometry.js";

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

export {
  calculateFocusBreathingFieldOfView,
  calculateFocusBreathingProjection,
  type CalculateFocusBreathingFieldOfViewInput,
  type CalculateFocusBreathingProjectionInput,
  type FocusBreathingFieldOfView,
  type FocusBreathingProjection
} from "./optics/focus-breathing.js";

export {
  calculateInverseRadialDistortionMapping,
  calculateRadialDistortionMapping,
  type CalculateInverseRadialDistortionMappingInput,
  type CalculateRadialDistortionMappingInput,
  type InverseRadialDistortionMapping,
  type LensFieldPointMm,
  type RadialDistortionCoefficients,
  type RadialDistortionMapping,
  type RadialDistortionProfile
} from "./optics/radial-distortion.js";

export {
  calculateInverseLateralChromaticAberrationMapping,
  calculateLateralChromaticAberrationMapping,
  type CalculateInverseLateralChromaticAberrationMappingInput,
  type CalculateLateralChromaticAberrationMappingInput,
  type ChannelSeparationVectorMm,
  type InverseLateralChromaticAberrationChannelMapping,
  type InverseLateralChromaticAberrationMapping,
  type LateralChromaticAberrationChannel,
  type LateralChromaticAberrationChannelMapping,
  type LateralChromaticAberrationMapping,
  type LateralChromaticAberrationProfile,
  type LateralChromaticAberrationSeparation
} from "./optics/lateral-chromatic-aberration.js";

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
  calculateCameraRotationImageMapping,
  type AxisSamplingPitchMicrometers,
  type CalculateCameraRotationImageMappingInput,
  type CameraAngularVelocityRadPerSec,
  type CameraRotationImageMapping,
  type ImagePlanePointMm
} from "./motion/camera-rotation.js";

export {
  calculateEquivalentIso,
  calculateExposureValue100,
  calculateRelativeOpticalExposure,
  calculateRelativeRenderedExposure,
  type CalculateEquivalentIsoInput,
  type CalculateExposureValue100Input,
  type CalculateRelativeOpticalExposureInput,
  type CalculateRelativeRenderedExposureInput,
  type RelativeOpticalExposure,
  type RelativeRenderedExposure
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
  assessRadiometryReadiness,
  parseRadiometryReadinessProfile,
  type CalibrationArtifactReference,
  type ExposureIntegrationRequirement,
  type OpticalTransmissionRequirement,
  type PhotositeCollectionAreaRequirement,
  type PupilVignettingRequirement,
  type RadiometryReadinessAssessment,
  type RadiometryReadinessProfile,
  type RadiometryRequirement,
  type RadiometryRequirementId,
  type RadiometryScientificStatus,
  type RadiometryUncertaintyDeclaration,
  type SceneSpectralRadianceRequirement,
  type SensorResponseRequirement
} from "./sensor/radiometry-readiness.js";

export {
  POC_SIMULATION_API_VERSION,
  simulatePocCamera,
  type PocSimulationRequest,
  type PocSimulationResponse
} from "./simulation/poc-simulation.js";

export {
  InvalidConfigurationError,
  parseCameraConfiguration,
  parseSceneDefinition
} from "./schema/validation.js";
