// SPDX-License-Identifier: Apache-2.0

/**
 * Current public API contract version for the Photivra engine.
 *
 * This constant is intentionally independent of the package version so
 * schema/API compatibility can be discussed explicitly.
 */
export const ENGINE_API_VERSION = "0.53.0" as const;

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
  parseSensorColorSamplingProfile,
  resolveColorSamplingSite,
  type LayeredColorSamplingLayout,
  type MonochromeColorSamplingLayout,
  type NativeColorSamplingSiteCoordinateSystem,
  type NativeColorSamplingSiteIndex,
  type SensorColorSamplingProfileCoordinateSystem,
  type PeriodicMosaicColorSamplingLayout,
  type ResolveColorSamplingSiteInput,
  type ResolvedColorSamplingSite,
  type SensorColorSamplingLayout,
  type SensorColorSamplingProfile
} from "./sensor/color-sampling.js";

export {
  parseNativeEffectiveRasterColorSamplingBindingProfile,
  resolveCaptureModeColorSamplingContributors,
  resolveNativeEffectiveRasterColorSamplingBinding,
  type CaptureModeFullFrameSampleIndex,
  type ColorSamplingChannelComposition,
  type ColorSamplingChannelSiteCount,
  type ColorSamplingSiteGridDimensions,
  type ColorSamplingSiteRect,
  type GroupedCaptureModeSamplingAnchorDeclaration,
  type NativeEffectiveRasterColorSamplingBindingProfile,
  type NativeEffectiveSampleRect,
  type ResolveCaptureModeColorSamplingContributorsInput,
  type ResolvedCaptureModeColorSamplingContributors,
  type ResolvedNativeEffectiveRasterColorSamplingBinding
} from "./sensor/capture-color-sampling-binding.js";

export {
  parseSensorOpticalStackProfile,
  resolveAntiAliasingSpatialKernel,
  type AntiAliasingPointSplitComponent,
  type ResolvedAntiAliasingSpatialKernel,
  type SensorEffectiveAntiAliasingSpatialResponse,
  type SensorMicrolensDeclaration,
  type SensorOpticalStackComponent,
  type SensorOpticalStackComponentRole,
  type SensorOpticalStackProfile
} from "./sensor/optical-stack.js";

export {
  parseSensorSamplingApertureProfile,
  resolveSensorSamplingAperture,
  type NativeSensorPhysicalBoundsMm,
  type NativeSensorPhysicalPointMm,
  type ResolveSensorSamplingApertureInput,
  type ResolvedSensorSamplingAperture,
  type SensorGeometricSensitiveAperture,
  type SensorSamplingApertureProfile,
  type SensorSiteCenterLatticeRegistration
} from "./sensor/sampling-aperture.js";

export {
  calculateSensorSpatialSamplingQuadrature,
  type CalculateSensorSpatialSamplingQuadratureInput,
  type SensorSpatialSamplingQuadrature,
  type SensorSpatialSamplingQuadratureNode
} from "./sensor/spatial-sampling-quadrature.js";

export {
  reduceSensorSpatialSamplingQuadrature,
  type ReduceSensorSpatialSamplingQuadratureInput,
  type SensorSpatialQuadratureNodeIdentity,
  type SensorSpatialQuadratureNodeValue,
  type SensorSpatialSampleReduction,
  type SensorSpatialSampleReductionValue,
  type SensorSpatialSampleValueDomain
} from "./sensor/spatial-sample-reduction.js";

export {
  parseSensorSpectralResponseProfile,
  resolveSensorSpectralResponseAtWavelength,
  type EffectiveSensorResponseScope,
  type ResolveSensorSpectralResponseAtWavelengthInput,
  type ResolvedSensorSpectralResponse,
  type ResolvedSensorSpectralResponseValue,
  type SensorSpectralChannelResponse,
  type SensorSpectralReferenceConditions,
  type SensorSpectralResponseProfile,
  type SensorSpectralResponseScientificStatus,
  type SensorSpectralResponseUncertainty,
  type SpectralFractionCurve,
  type SpectralFractionSample,
  type SpectralResponsivityCurve,
  type SpectralResponsivitySample,
  type SpectralWavelengthBasis
} from "./sensor/spectral-response.js";

export {
  calculateSensorSpectralQuadrature,
  type CalculateSensorSpectralQuadratureInput,
  type SensorSpectralQuadrature,
  type SensorSpectralQuadratureNode,
  type SensorSpectralWavelengthRangeNanometers
} from "./sensor/spectral-quadrature.js";

export {
  reduceSensorSpatioSpectralIrradiance,
  type ReduceSensorSpatioSpectralIrradianceInput,
  type SensorSpatioSpectralIrradianceReduction,
  type SensorSpatioSpectralIrradianceSample,
  type SensorSpatioSpectralNodeIdentity,
  type SensorSpatioSpectralWavelengthReduction
} from "./sensor/spatio-spectral-reduction.js";

export {
  assessSensorResponseApplicationCompatibility,
  parseSensorResponseApplicationProfile,
  type AssessSensorResponseApplicationCompatibilityInput,
  type SensorResponseApplicationCompatibilityAssessment,
  type SensorResponseApplicationCompatibilityBlocker,
  type SensorResponseApplicationProfile,
  type SensorResponseIncidentAreaBasis,
  type SensorResponseReferenceConditionPolicy,
  type SensorResponseSignalPath,
  type SensorResponseSourcePlane,
  type SensorResponseSpatialModel,
  type SourcedSensorResponseSourcePlane
} from "./sensor/response-application-compatibility.js";

export {
  assessSensorResponseOperatingRange,
  parseSensorResponseOperatingRangeProfile,
  type AssessSensorResponseOperatingRangeInput,
  type SensorResponseLinearityCriterion,
  type SensorResponseOperatingInputRange,
  type SensorResponseOperatingRangeAssessment,
  type SensorResponseOperatingRangeBlocker,
  type SensorResponseOperatingRangeProfile,
  type SensorResponseOperatingWavelengthApplicability
} from "./sensor/response-operating-range.js";

export {
  calculatePhotonEnergyFromWavelength,
  parseSourcedAirPhaseRefractiveIndex,
  type AirRefractiveIndexConditionPolicy,
  type AirRefractiveIndexReferenceConditions,
  type CalculatePhotonEnergyFromWavelengthInput,
  type PhotonEnergyFromWavelength,
  type SourcedAirPhaseRefractiveIndex
} from "./sensor/photon-energy.js";

export {
  parseCaptureModeProfile,
  resolveCaptureMode,
  type CaptureModeAcquisition,
  type CaptureModeDefinition,
  type CaptureModeDependency,
  type CaptureModePerFrameSampling,
  type CaptureModeProfile,
  type CaptureModeReconstructionStage,
  type CaptureModeSampleCombinationDomain,
  type CaptureModeSensorOffsetNativeSamples,
  type DeclaredEffectiveCaptureSampling,
  type FixedMultiFrameCaptureAcquisition,
  type GroupedNativeCaptureSampling,
  type NativeEffectiveCaptureSampling,
  type ResolveCaptureModeInput,
  type ResolvedCaptureMode,
  type SingleFrameCaptureAcquisition,
  type SourcedCaptureModeFact,
  type VariableMultiFrameCaptureAcquisition
} from "./sensor/capture-mode.js";

export {
  calculateSensorReadoutTiming,
  type CalculateSensorReadoutTimingInput,
  type CaptureShutterMechanism,
  type GlobalSensorReadoutTimingDeclaration,
  type NativeSensorReadoutScanDirection,
  type RollingSensorReadoutTimingDeclaration,
  type SensorReadoutMode,
  type SensorReadoutTiming,
  type SensorReadoutTimingDeclaration,
  type SensorReadoutTimingSample,
  type SourcedSensorReadoutFact,
  type SourcedSensorTimingSeconds
} from "./sensor/readout-timing.js";

export {
  calculateCaptureExposureWindows,
  type CalculateCaptureExposureWindowsInput,
  type CaptureExposureBoundaryActuator,
  type CaptureExposureWindowSample,
  type CaptureExposureWindows,
  type ExposureBoundarySchedule,
  type ResolvedCaptureExposureBoundary,
  type SimultaneousExposureBoundarySchedule,
  type SourcedCaptureBoundaryDirection,
  type SourcedCaptureTimingSeconds,
  type UniformLinearExposureBoundarySchedule
} from "./sensor/exposure-window.js";

export {
  assessReadoutExposureTimingLinkage,
  type AssessReadoutExposureTimingLinkageInput,
  type ReadoutExposureBoundaryId,
  type ReadoutExposureBoundarySpatialLink,
  type ReadoutExposureBoundarySpatialLinkAssessment,
  type ReadoutExposureSpatialPhaseOrientation,
  type ReadoutExposureTimingLinkageAssessment,
  type ReadoutExposureTimingLinkageDeclaration
} from "./sensor/readout-exposure-linkage.js";

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
  mapImagePlanePointToOrientedPhysicalUv,
  mapOrientedPhysicalUvToImagePlanePoint,
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
  type ImagePlaneMetricPointMm,
  type MapImagePlanePointToOrientedPhysicalUvInput,
  type MapOrientedPhysicalUvToImagePlaneInput,
  type NormalizedRasterUv,
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
  calculateInverseRadialDistortionMappings,
  calculateRadialDistortionMapping,
  type CalculateInverseRadialDistortionMappingInput,
  type CalculateInverseRadialDistortionMappingsInput,
  type CalculateRadialDistortionMappingInput,
  type InverseRadialDistortionMapping,
  type InverseRadialDistortionMappings,
  type LensFieldPointMm,
  type RadialDistortionCoefficients,
  type RadialDistortionMapping,
  type RadialDistortionProfile
} from "./optics/radial-distortion.js";

export {
  calculateInverseLateralChromaticAberrationMapping,
  calculateInverseLateralChromaticAberrationMappings,
  calculateLateralChromaticAberrationMapping,
  type CalculateInverseLateralChromaticAberrationMappingInput,
  type CalculateInverseLateralChromaticAberrationMappingsInput,
  type CalculateLateralChromaticAberrationMappingInput,
  type ChannelSeparationVectorMm,
  type InverseLateralChromaticAberrationChannelMapping,
  type InverseLateralChromaticAberrationMapping,
  type InverseLateralChromaticAberrationMappings,
  type LateralChromaticAberrationChannel,
  type LateralChromaticAberrationChannelMapping,
  type LateralChromaticAberrationMapping,
  type LateralChromaticAberrationProfile,
  type LateralChromaticAberrationSeparation
} from "./optics/lateral-chromatic-aberration.js";

export {
  calculateIlluminationVignetting,
  type CalculateIlluminationVignettingInput,
  type IlluminationVignetting,
  type IlluminationVignettingCoefficients,
  type IlluminationVignettingProfile
} from "./optics/illumination-vignetting.js";

export {
  PSF_FOUNDATION_VERSION,
  calculatePsfFoundationComponents,
  getPsfFoundationContract,
  type CalculatePsfFoundationComponentsInput,
  type PsfContributionContract,
  type PsfContributionId,
  type PsfContributionStatus,
  type PsfFoundationComponents,
  type PsfFoundationContract
} from "./optics/psf-foundation.js";

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
  calculateInverseCameraRotationImageMapping,
  type AxisSamplingPitchMicrometers,
  type CalculateCameraRotationImageMappingInput,
  type CalculateInverseCameraRotationImageMappingInput,
  type CameraAngularVelocityRadPerSec,
  type CameraRotationImageMapping,
  type ImagePlanePointMm,
  type InverseCameraRotationImageMapping
} from "./motion/camera-rotation.js";

export {
  calculateCaptureRotationTrajectories,
  type CalculateCaptureRotationTrajectoriesInput,
  type CaptureRotationTrajectories,
  type CaptureRotationTrajectoryEndpoint,
  type CaptureRotationTrajectorySample
} from "./motion/capture-rotation-trajectory.js";

export {
  calculateCaptureRotationInverseMappings,
  type CalculateCaptureRotationInverseMappingsInput,
  type CaptureRotationInverseMappings,
  type CaptureRotationInverseMappingSample
} from "./motion/capture-rotation-inverse-mapping.js";

export {
  calculateCaptureRotationTemporalQuadrature,
  type CalculateCaptureRotationTemporalQuadratureInput,
  type CaptureRotationTemporalQuadrature,
  type CaptureRotationTemporalQuadratureNode,
  type CaptureRotationTemporalQuadraturePoint
} from "./motion/capture-rotation-temporal-quadrature.js";

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
