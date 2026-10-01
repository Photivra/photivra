// SPDX-License-Identifier: Apache-2.0

export { ENGINE_API_VERSION } from "./core/version.js";

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
  parseSpectralWavelengthBasis,
  parseSpectralWavelengthRangeNanometers,
  parseSpectralWavelengthSample,
  type SpectralWavelengthBasis,
  type SpectralWavelengthRangeNanometers,
  type SpectralWavelengthSample
} from "./core/spectral.js";

export {
  composeSpectralCoverage,
  distributeIntegratedQuantityAcrossDiscreteSpectralLines,
  integrateDiscreteSpectralLineMeasure,
  parseNormalizedDiscreteSpectralLineDistribution,
  parseSpectralCoverageParticipant,
  type ComposeSpectralCoverageInput,
  type DiscreteSpectralLineMeasure,
  type DiscreteSpectralLineMeasureEntry,
  type DiscreteSpectralLineQuantityUnit,
  type DistributeIntegratedQuantityAcrossDiscreteLinesInput,
  type IntegratedDiscreteSpectralLineMeasure,
  type NormalizedDiscreteSpectralLine,
  type NormalizedDiscreteSpectralLineDistribution,
  type ResolvedSpectralWavelengthBasis,
  type SpectralCoverageComposition,
  type SpectralCoverageParticipant,
  type SpectralCoverageParticipantRole
} from "./core/spectral-composition.js";

export {
  SCIENTIFIC_ASSURANCE_CONTRACT_VERSION,
  composeScientificAssurance,
  type ComposeScientificAssuranceInput,
  type ComposedScientificAssurance,
  type ComposedScientificUncertaintyStatus,
  type ScientificAssuranceBasisKind,
  type ScientificAssuranceComponent,
  type ScientificAssuranceComponentUncertainty,
  type ScientificAssuranceSourceIdentity,
  type ScientificAssuranceSourceKind,
  type ScientificAssuranceStatus
} from "./core/scientific-assurance.js";

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
  IMAGE_FORMATION_FIDELITY_PROFILE_SCHEMA_VERSION,
  PREPARED_IMAGE_FORMATION_CONTEXT_VERSION,
  PRODUCTION_CAPTURE_SNAPSHOT_VERSION,
  PRODUCTION_IMAGE_FORMATION_PLAN_VERSION,
  RENDERER_CAPABILITY_SCHEMA_VERSION,
  createProductionCaptureSnapshot,
  createProductionCaptureSnapshotFromReleaseFrame,
  createProductionImageFormationPlan,
  parseImageFormationFidelityProfile,
  parsePreparedImageFormationContext,
  parseProductionCaptureSnapshot,
  parseRendererCapabilityDeclaration,
  prepareImageFormationContext,
  serializeProductionImageFormationPlan,
  type CreateProductionCaptureSnapshotFromReleaseFrameInput,
  type CreateProductionCaptureSnapshotInput,
  type CreateProductionImageFormationPlanInput,
  type ImageFormationFidelityProfile,
  type PlannedImageFormationEffect,
  type PlannedImageFormationEffectState,
  type PlannedImageFormationStage,
  type PlannedImageFormationStageState,
  type PlannedScientificStatus,
  type PrepareImageFormationContextInput,
  type PreparedImageFormationContext,
  type ProductionCaptureSnapshot,
  type ProductionImageFormationBlocker,
  type ProductionImageFormationBlockerCode,
  type ProductionImageFormationPlan,
  type ProductionPhysicalSceneSample,
  type ProductionReleaseFrameBinding,
  type ProductionTemporalCaptureInput,
  type ProductionTemporalCaptureResult,
  type RendererCapabilityDeclaration,
  type RendererConsumerKind,
  type RequiredImageFormationEffect
} from "./composition/image-formation-plan.js";

export {
  PRODUCTION_PLAN_CONSUMER_MANIFEST_VERSION,
  createProductionPlanConsumerManifest,
  type CreateProductionPlanConsumerManifestInput,
  type ProductionPlanConsumerManifest
} from "./composition/plan-consumer.js";

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
  COLOR_TEMPERATURE_WHITE_BALANCE_INTENT_VERSION,
  WHITE_BALANCE_PROFILE_SCHEMA_VERSION,
  WHITE_BALANCE_STATE_VERSION,
  createColorTemperatureWhiteBalanceIntent,
  createLockedWhiteBalanceState,
  estimateAutoWhiteBalance,
  parseResolvedWhiteBalanceState,
  parseWhiteBalanceProfile,
  resolveCustomWhiteBalance,
  resolveManualWhiteBalance,
  resolvePresetWhiteBalance,
  type ColorTemperatureWhiteBalanceIntent,
  type CreateColorTemperatureWhiteBalanceIntentInput,
  type CreateLockedWhiteBalanceStateInput,
  type EstimateAutoWhiteBalanceInput,
  type PreWhiteBalanceRgbSample,
  type PreWhiteBalanceRgbSampleSet,
  type ResolveCustomWhiteBalanceInput,
  type ResolveManualWhiteBalanceInput,
  type ResolvePresetWhiteBalanceInput,
  type ResolvedWhiteBalanceState,
  type WhiteBalanceAwbIntent,
  type WhiteBalanceAwbPolicy,
  type WhiteBalanceChannelGains,
  type WhiteBalanceInputDomain,
  type WhiteBalancePresetDefinition,
  type WhiteBalanceProfile
} from "./color/white-balance.js";

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
  SENSOR_ARCHITECTURE_PROFILE_SCHEMA_VERSION,
  parseSensorArchitectureProfile,
  type SensorArchitectureFactProvenance,
  type SensorArchitectureProfile,
  type SensorArchitectureProfileV0_2,
  type SensorArchitectureProfileV0_3,
  type SensorArchitectureReuseStatus,
  type SensorArchitectureSourceKind,
  type SensorColorSamplingFamily,
  type SensorIlluminationArchitecture,
  type SensorIntegrationArchitecture,
  type SensorReadoutArchitecture,
  type SensorTechnologyFamily,
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
  type SensorSpectralResponseChannelBinding,
  type SensorSpectralReferenceConditions,
  type SensorSpectralResponseProfile,
  type SensorSpectralResponseScientificStatus,
  type SensorSpectralResponseUncertainty,
  type SpectralFractionCurve,
  type SpectralFractionSample,
  type SpectralResponsivityCurve,
  type SpectralResponsivitySample
} from "./sensor/spectral-response.js";

export {
  calculateSensorSpectralQuadrature,
  type CalculateSensorSpectralQuadratureInput,
  type SensorSpectralQuadrature,
  type SensorSpectralQuadratureNode,
  type SensorSpectralWavelengthRangeNanometers
} from "./sensor/spectral-quadrature.js";

export {
  createSensorSpectralCoverageParticipant,
  type CreateSensorSpectralCoverageParticipantInput
} from "./sensor/spectral-coverage.js";

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
  type SensorResponseOperatingSpatialLinearityModel,
  type SensorResponseOperatingSpectralInputModel,
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
  calculateSensorEqeElectronRate,
  type CalculateSensorEqeElectronRateInput,
  type SensorEqeAirPhotonEnergyContext,
  type SensorEqeAirRefractiveIndexSample,
  type SensorEqeElectronRate,
  type SensorEqeWavelengthRateContribution
} from "./sensor/eqe-electron-rate.js";

export {
  calculateSensorResponsivityPhotocurrent,
  parseSensorResponsivityElectricalApplicabilityProfile,
  type CalculateSensorResponsivityPhotocurrentInput,
  type SensorResponsivityBiasCondition,
  type SensorResponsivityElectricalApplicabilityProfile,
  type SensorResponsivityElectricalConditionPolicy,
  type SensorResponsivityElectricalConditions,
  type SensorResponsivityPhotocurrent,
  type SensorResponsivityReadoutLoadCondition,
  type SensorResponsivityWavelengthCurrentContribution
} from "./sensor/responsivity-photocurrent.js";

export {
  bindSensorRateToLocalExposure,
  type BindSensorRateToLocalExposureInput,
  type SensorInstantaneousRateResult,
  type SensorRateLocalExposureBinding
} from "./sensor/local-exposure-binding.js";

export {
  integrateStationarySensorRateOverLocalExposure,
  parseSensorRateTemporalStationarityProfile,
  type IntegrateStationarySensorRateInput,
  type SensorEqeExposureIntegration,
  type SensorRateStationarityStatus,
  type SensorRateTemporalStationarityProfile,
  type SensorResponsivityExposureIntegration,
  type SensorStationaryRateExposureIntegration
} from "./sensor/constant-rate-temporal-integration.js";

export {
  calculateSensorDarkCurrentCharge,
  parseSensorDarkCurrentProfile,
  type CalculateSensorDarkCurrentChargeInput,
  type SensorDarkCurrentCharge,
  type SensorDarkCurrentProfile,
  type SensorDarkCurrentSiteApplicability,
  type SensorDarkCurrentTemperatureModel
} from "./sensor/dark-current.js";

export {
  composeSensorAccumulatedCharge,
  parseSensorAccumulatedChargeCompletenessProfile,
  parseSensorAdditionalStoredChargeComponent,
  type ComposeSensorAccumulatedChargeInput,
  type SensorAccumulatedChargeCompletenessProfile,
  type SensorAccumulatedChargeComposition,
  type SensorAdditionalStoredChargeComponent,
  type SensorAdditionalStoredChargeKind
} from "./sensor/accumulated-charge.js";

export {
  assessSensorPhysicalChargeCapacity,
  parseSensorPhysicalChargeCapacityProfile,
  type AssessSensorPhysicalChargeCapacityInput,
  type SensorPhysicalChargeCapacityAssessment,
  type SensorPhysicalChargeCapacityProfile,
  type SensorPhysicalChargeCapacitySiteApplicability,
  type SensorPhysicalChargeCapacityTemperatureApplicability
} from "./sensor/physical-charge-capacity.js";

export {
  GENERIC_ISO_SIGNAL_CHAIN_PRESET_CATALOG_SCHEMA_VERSION,
  GENERIC_ISO_SIGNAL_CHAIN_PROFILE_SCHEMA_VERSION,
  parseGenericIsoSignalChainPresetCatalog,
  parseGenericIsoSignalChainProfile,
  resolveGenericIsoSignalChain,
  resolveGenericIsoSignalChainPreset,
  type GenericIsoCaptureModeSignalChainBinding,
  type GenericIsoExpandedRegimeBinding,
  type GenericIsoSignalChainPreset,
  type GenericIsoSignalChainPresetCatalog,
  type GenericIsoSignalChainProfile,
  type GenericIsoStandardRegimeBand,
  type ResolveGenericIsoSignalChainInput,
  type ResolvedGenericIsoSignalChain
} from "./sensor/iso-signal-chain.js";

export {
  SENSOR_CHARGE_SAMPLING_PROFILE_SCHEMA_VERSION,
  SENSOR_READOUT_CONVERSION_PROFILE_SCHEMA_VERSION,
  calculateExpectedSensorReadout,
  parseSensorChargeSamplingProfile,
  parseSensorReadoutConversionProfile,
  resolveSensorReadoutRegime,
  simulateSensorChargeRealization,
  simulateSensorRawCode,
  type CalculateExpectedSensorReadoutInput,
  type ResolveSensorReadoutRegimeInput,
  type ResolvedSensorReadoutRegime,
  type SensorAdditionalChargeSamplingModel,
  type SensorAdditionalChargeSamplingPolicy,
  type SensorChargeRealization,
  type SensorChargeSamplingProfile,
  type SensorElectronicReadNoiseComponent,
  type SensorExpectedReadoutSignal,
  type SensorRawCodeSample,
  type SensorReadoutConversionProfile,
  type SensorReadoutConversionRegime,
  type SimulateSensorChargeRealizationInput,
  type SimulateSensorRawCodeInput
} from "./sensor/raw-readout.js";

export {
  SENSOR_RAW_CAPTURE_SAMPLE_VERSION,
  SENSOR_RAW_RECONSTRUCTION_PROFILE_SCHEMA_VERSION,
  createSensorRawCaptureSample,
  parseSensorRawReconstructionProfile,
  resolveSensorRawReconstruction,
  type CreateSensorRawCaptureSampleInput,
  type ResolveSensorRawReconstructionInput,
  type SensorRawCaptureSample,
  type SensorRawReconstructedPixel,
  type SensorRawReconstructionChannelKernel,
  type SensorRawReconstructionKernelContribution,
  type SensorRawReconstructionProfile
} from "./sensor/raw-reconstruction.js";

export {
  assessSensorCameraSaturationCapacity,
  parseSensorCameraSaturationCapacityProfile,
  type AssessSensorCameraSaturationCapacityInput,
  type SensorCameraSaturationCapacityAssessment,
  type SensorCameraSaturationCapacityProfile,
  type SensorCameraSaturationSiteApplicability,
  type SensorCameraSaturationTemperatureApplicability
} from "./sensor/camera-saturation-capacity.js";

export {
  CAPTURE_MODE_TIMING_PROFILE_SCHEMA_VERSION,
  parseCaptureModeTimingProfile,
  resolveCaptureModeTiming,
  type CaptureModeTimingProfile,
  type ResolveCaptureModeTimingInput,
  type ResolvedCaptureModeTiming
} from "./sensor/capture-mode-timing.js";

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
  calculateFocusPlaneImageDistance,
  parseFocusPlane,
  type CalculateFocusPlaneImageDistanceInput,
  type FocusPlane
} from "./optics/focus-state.js";

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
  FRONT_OF_LENS_FILTER_PROFILE_SCHEMA_VERSION,
  composeFrontOfLensFilterTransmission,
  parseFrontOfLensFilterProfile,
  resolveFrontOfLensFilterTransmission,
  type ComposeFrontOfLensFilterTransmissionInput,
  type ComposedFrontOfLensFilterTransmission,
  type FrontOfLensFilterProfile,
  type FrontOfLensFilterScientificStatus,
  type FrontOfLensFilterSpectralSample,
  type FrontOfLensFilterTransmissionModel,
  type FrontOfLensFilterUncertainty,
  type ResolveFrontOfLensFilterTransmissionInput,
  type ResolvedFrontOfLensFilterTransmission
} from "./optics/front-of-lens-filter.js";

export {
  calculateIlluminationVignetting,
  type CalculateIlluminationVignettingInput,
  type IlluminationVignetting,
  type IlluminationVignettingCoefficients,
  type IlluminationVignettingProfile
} from "./optics/illumination-vignetting.js";

export {
  SCENE_TO_SENSOR_IRRADIANCE_PROFILE_SCHEMA_VERSION,
  calculateSceneRadianceToSensorIrradiance,
  parseSceneToSensorIrradianceProfile,
  type CalculateSceneRadianceToSensorIrradianceInput,
  type NumericRange,
  type OpticalBridgeFieldThroughput,
  type OpticalBridgeFocusApplicability,
  type OpticalBridgeFocusContext,
  type OpticalBridgeScientificStatus,
  type OpticalBridgeUncertainty,
  type OpticalTransmissionModel,
  type SceneToSensorIrradianceProfile,
  type SceneToSensorIrradianceResult,
  type SpectralTransmissionSample
} from "./optics/scene-to-sensor-irradiance.js";

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
  SCENE_ILLUMINATION_PROFILE_SCHEMA_VERSION,
  parseSceneIlluminationProfile,
  type SceneIlluminationMagnitude,
  type SceneIlluminationProfile,
  type SceneIlluminationRelativeSpectrumSample,
  type SceneIlluminationScientificStatus,
  type SceneIlluminationSource,
  type SceneIlluminationSourceFamily,
  type SceneIlluminationSourceGeometry,
  type SceneIlluminationSpectrum,
  type SceneIlluminationUncertainty
} from "./schema/illumination.js";

export {
  createSceneIlluminationSpectralCoverageParticipant,
  resolveSceneIlluminationDiscreteLineMeasure,
  type CreateSceneIlluminationSpectralCoverageParticipantInput,
  type SceneIlluminationDiscreteLineMeasure
} from "./schema/illumination-spectral.js";

export {
  SCENE_ILLUMINATION_TEMPORAL_PROFILE_SCHEMA_VERSION,
  evaluateSceneIlluminationTemporalMultiplier,
  integrateSceneIlluminationTemporalMultiplierOverExposureWindow,
  parseSceneIlluminationTemporalProfile,
  type EvaluateSceneIlluminationTemporalMultiplierInput,
  type IntegrateSceneIlluminationTemporalMultiplierInput,
  type SceneIlluminationTemporalExposureIntegration,
  type SceneIlluminationTemporalIntegrationNode,
  type SceneIlluminationTemporalMultiplierEvaluation,
  type SceneIlluminationTemporalProfile,
  type SceneIlluminationTemporalRegistrationUncertainty,
  type SceneIlluminationTemporalScientificStatus,
  type SceneIlluminationTemporalSourceBinding,
  type SceneIlluminationTemporalWaveform,
  type SceneIlluminationTemporalWaveformSample
} from "./schema/illumination-temporal.js";

export {
  SCENE_RADIANCE_TEMPORAL_SAMPLING_PLAN_VERSION,
  createSceneRadianceTemporalSamplingPlan,
  reduceSceneRadianceTemporalSamples,
  type CreateSceneRadianceTemporalSamplingPlanInput,
  type ReducedSceneRadianceTemporalExposure,
  type ReduceSceneRadianceTemporalSamplesInput,
  type SceneRadianceTemporalEvaluatedSample,
  type SceneRadianceTemporalQuery,
  type SceneRadianceTemporalSamplingNode,
  type SceneRadianceTemporalSamplingPlan
} from "./schema/scene-radiance-temporal.js";

export {
  SCENE_MATERIAL_RESPONSE_PROFILE_SCHEMA_VERSION,
  SCENE_RADIANCE_EVALUATION_SCHEMA_VERSION,
  SCENE_RADIANCE_PROVIDER_PROFILE_SCHEMA_VERSION,
  assessSceneMaterialResponseFidelity,
  parseSceneMaterialResponseProfile,
  parseSceneRadianceEvaluationRequest,
  parseSceneRadianceEvaluationResult,
  parseSceneRadianceProviderProfile,
  validateSceneRadianceEvaluationBindings,
  type SceneMaterialResponseDefinition,
  type SceneMaterialResponseFidelity,
  type SceneMaterialResponseProfile,
  type SceneMaterialResponseRepresentation,
  type SceneRadianceDataArtifactReference,
  type SceneRadianceEvaluationBindingAssessment,
  type SceneRadianceEvaluationRequest,
  type SceneRadianceEvaluationResult,
  type SceneRadianceEvaluationTarget,
  type SceneRadianceProviderProfile,
  type SceneRadianceProviderSpectralFidelity,
  type SceneRadianceProviderTransportFidelity,
  type SceneRadianceProviderVisibilityFidelity,
  type SceneRadianceScientificStatus,
  type SceneRadianceUncertainty,
  type ValidateSceneRadianceEvaluationBindingsInput
} from "./schema/scene-radiance.js";

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
  calculateCaptureTranslationParallaxTemporalQuadrature,
  type CalculateCaptureTranslationParallaxTemporalQuadratureInput,
  type CaptureTranslationParallaxSceneSample,
  type CaptureTranslationParallaxTemporalNode,
  type CaptureTranslationParallaxTemporalQuadrature,
  type CaptureTranslationParallaxTemporalSample
} from "./motion/capture-translation-parallax-temporal-quadrature.js";

export {
  calculateCaptureRotationTemporalQuadrature,
  type CalculateCaptureRotationTemporalQuadratureInput,
  type CaptureRotationTemporalQuadrature,
  type CaptureRotationTemporalQuadratureNode,
  type CaptureRotationTemporalQuadraturePoint
} from "./motion/capture-rotation-temporal-quadrature.js";

export {
  FLASH_SYNC_CAPABILITY_SCHEMA_VERSION,
  MANUAL_FLASH_PROFILE_SCHEMA_VERSION,
  createManualFlashIlluminationOverlay,
  parseFlashSyncCapabilityProfile,
  parseManualFlashProfile,
  resolveManualFlashSync,
  type CreateManualFlashIlluminationOverlayInput,
  type FlashSyncCapabilityProfile,
  type ManualFlashIlluminationOverlay,
  type ManualFlashProfile,
  type ManualFlashPulseProfile,
  type ManualFlashSyncMode,
  type RequestedFlashSyncMode,
  type ResolveManualFlashSyncInput,
  type ResolvedManualFlashSync
} from "./exposure/flash.js";

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
  EXPOSURE_DURATION_CONTROL_VERSION,
  bindResolvedExposureDurationToCaptureExposureInput,
  resolveExposureDurationControl,
  type BindResolvedExposureDurationToCaptureExposureInput,
  type ExposureDurationControl,
  type ExposureDurationControlResolution
} from "./exposure/exposure-duration-control.js";

export {
  EXPOSURE_METERING_PROFILE_SCHEMA_VERSION,
  meterRelativeExposure,
  parseExposureMeteringProfile,
  type ExposureMeteringPolicy,
  type ExposureMeteringProfile,
  type ExposureMeteringResult,
  type ExposureMeteringSampleSet,
  type ExposureMeteringZoneSample,
  type MeterRelativeExposureInput
} from "./exposure/metering.js";

export {
  SCENE_RADIANCE_METERING_DERIVATION_SCHEMA_VERSION,
  createSceneRadianceDerivedExposureMeteringSampleSet,
  parseSceneRadianceMeteringDerivationProfile,
  type CreateSceneRadianceDerivedExposureMeteringSampleSetInput,
  type SceneRadianceDerivedExposureMeteringSampleSet,
  type SceneRadianceMeteringDerivationProfile,
  type SceneRadianceMeteringSourceContext,
  type SceneRadianceMeteringTemporalContext
} from "./exposure/metering-scene-radiance.js";

export {
  meterSceneRadianceTemporalExposure,
  type MeterSceneRadianceTemporalExposureInput,
  type SceneRadianceTemporalExposureMeteringResult,
  type SceneRadianceTemporalMeteringSample
} from "./exposure/metering-temporal.js";

export {
  EXPOSURE_METER_TARGET_SCHEMA_VERSION,
  createExposureMeterTargetFromMeteringResult,
  setExposureCompensationOnMeterTarget,
  type CreateExposureMeterTargetInput,
  type ExposureMeterSnapshotIdentity,
  type ExposureMeterTarget,
  type ExposureMeterTargetSourceKind,
  type ExposureMeterTargetSourceResult,
  type SetExposureCompensationOnMeterTargetInput
} from "./exposure/metering-target.js";

export {
  ISO_CAPABILITY_PROFILE_SCHEMA_VERSION,
  bindIsoCapabilityToExposureCapabilities,
  parseIsoCapabilityProfile,
  resolveIsoCapability,
  type BindIsoCapabilityToExposureCapabilitiesInput,
  type BoundIsoExposureCapabilities,
  type IsoAutoIsoCapability,
  type IsoCapabilityAvailability,
  type IsoCapabilityProfile,
  type IsoCaptureModePolicy,
  type IsoExpandedSetting,
  type IsoExposureIndexRange,
  type IsoStandardSettingGrid,
  type RequestedIsoSetting,
  type ResolveIsoCapabilityInput,
  type ResolvedIsoCapability
} from "./equipment/iso-capabilities.js";

export {
  GENERIC_EQUIPMENT_EXPOSURE_CAPABILITY_SCHEMA_VERSION,
  parseGenericBodyExposureCapabilityProfile,
  parseGenericLensExposureCapabilityProfile,
  resolveGenericEquipmentExposureCapabilities,
  type FocalLengthFNumberSample,
  type GenericBodyExposureCapabilityProfile,
  type GenericCapabilityAvailability,
  type GenericLensExposureCapabilityProfile,
  type NumericCapabilityRange,
  type NumericSettingGrid,
  type ResolveGenericEquipmentExposureCapabilitiesInput,
  type ResolvedGenericEquipmentExposureCapabilities,
  type ResolvedNumericSettingGrid,
  type WidestAvailableFNumberCapability
} from "./equipment/exposure-capabilities.js";

export {
  GENERIC_RELEASE_CAPABILITY_SCHEMA_VERSION,
  parseGenericReleaseCapabilityProfile,
  type GenericExposureBracketAxis,
  type GenericReleaseCapabilityProfile,
  type GenericReleaseDriveMode
} from "./equipment/release-capabilities.js";

export {
  FOCUS_CONTROL_PROFILE_SCHEMA_VERSION,
  FOCUS_CONTROL_STATE_VERSION,
  assessFocusReleaseGate,
  createFocusControlState,
  parseFocusControlProfile,
  resolveFocusTargetObservation,
  setFocusLock,
  setManualFocusState,
  type AssessFocusReleaseGateInput,
  type CreateFocusControlStateInput,
  type FocusAcquisitionState,
  type FocusControlMode,
  type FocusControlProfile,
  type FocusControlState,
  type FocusReleaseGateAssessment,
  type FocusReleasePriority,
  type FocusTargetControlEvent,
  type FocusTargetLossReason,
  type FocusTargetObservation,
  type FocusTargetResolution,
  type ResolveFocusTargetObservationInput,
  type SetFocusLockInput,
  type SetManualFocusStateInput
} from "./capture/focus-control.js";

export {
  RELEASE_SEQUENCE_VERSION,
  createCancelledReleaseSequence,
  resolveReleaseSequence,
  type CancelledReleaseSequence,
  type CancelReleaseSequenceInput,
  type ReleaseAutomationState,
  type ReleaseBaseCaptureState,
  type ReleaseBracketPolicy,
  type ReleaseDrivePolicy,
  type ReleaseTimingConstraint,
  type ResolveReleaseSequenceInput,
  type ResolvedReleaseFrame,
  type ResolvedReleaseSequence
} from "./capture/release-sequence.js";

export {
  GENERIC_BODY_METERING_CAPABILITY_SCHEMA_VERSION,
  assessExposureMeteringProfileCompatibility,
  parseGenericBodyMeteringCapabilityProfile,
  type AssessExposureMeteringProfileCompatibilityInput,
  type GenericBodyMeteringCapabilityProfile,
  type GenericSupportedMeteringProfile,
  type MeteringCapabilityCompatibilityAssessment,
  type MeteringCapabilityCompatibilityBlocker
} from "./equipment/metering-capabilities.js";

export {
  EXPOSURE_PROGRAM_LINE_SCHEMA_VERSION,
  parseExposureProgramLineProfile,
  type ExposureProgramLineNode,
  type ExposureProgramLineProfile
} from "./exposure/program-line.js";

export {
  EXPOSURE_MODE_RESOLVER_VERSION,
  resolveAperturePriorityAutoIsoExposureMode,
  resolveAperturePriorityExposureMode,
  resolveFullAutoExposureMode,
  resolveManualExposureMode,
  resolveProgramAutoExposureMode,
  resolveShutterPriorityExposureMode,
  type AperturePriorityAutoIsoExposureModeResolution,
  type AperturePriorityAutoIsoPolicy,
  type AperturePriorityExposureModeResolution,
  type AutoIsoBaselinePolicy,
  type ExposureResolutionConstraint,
  type ExposureTargetResidual,
  type ExposureTargetResidualState,
  type FullAutoExposureModeResolution,
  type FullAutoExposurePolicy,
  type ManualExposureModeResolution,
  type ManualIsoControl,
  type ProgramAutoExposureModeResolution,
  type ProgramAutoIsoControl,
  type ProgramLineSelectionDiagnostics,
  type RelativeExposureControlAnchor,
  type ResolveAperturePriorityAutoIsoExposureModeInput,
  type ResolveAperturePriorityExposureModeInput,
  type ResolveFullAutoExposureModeInput,
  type ResolveManualExposureModeInput,
  type ResolveProgramAutoExposureModeInput,
  type ResolveShutterPriorityExposureModeInput,
  type ShutterPriorityAutoIsoPolicy,
  type ShutterPriorityExposureModeResolution
} from "./exposure/exposure-mode-resolver.js";

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
