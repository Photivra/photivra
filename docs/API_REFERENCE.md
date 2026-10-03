# Public API reference

Generated from the exact root exports for **@photivra/engine 1.1.0 / root contract 1.1.0** by `node scripts/generate-api-reference.mjs`. No module deep import is supported.

Use [the developer guide](DEVELOPERS.md) for executable paths and scientific boundaries. Types are contracts, not runtime validation: parse untrusted data, preserve units/reference frames, read assessment blockers, and retain evidence/limitations. Optional properties do not imply a universal default. Model/schema IDs remain independent of the distribution.

## camera/equivalent-focal-length.ts

[Detailed contracts](api/camera-equivalent-focal-length.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/camera/equivalent-focal-length.ts)

| Export | Kind |
| --- | --- |
| [`calculateEquivalentFocalLength35Mm`](api/camera-equivalent-focal-length.md#calculateequivalentfocallength35mm) | Runtime |
| [`CalculateEquivalentFocalLength35MmInput`](api/camera-equivalent-focal-length.md#calculateequivalentfocallength35mminput) | Type |
| [`EquivalentFocalLength35Mm`](api/camera-equivalent-focal-length.md#equivalentfocallength35mm) | Type |

## camera/field-of-view.ts

[Detailed contracts](api/camera-field-of-view.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/camera/field-of-view.ts)

| Export | Kind |
| --- | --- |
| [`calculateFieldOfView`](api/camera-field-of-view.md#calculatefieldofview) | Runtime |
| [`calculateFieldOfViewBounds`](api/camera-field-of-view.md#calculatefieldofviewbounds) | Runtime |
| [`CalculateFieldOfViewBoundsInput`](api/camera-field-of-view.md#calculatefieldofviewboundsinput) | Type |
| [`CalculateFieldOfViewInput`](api/camera-field-of-view.md#calculatefieldofviewinput) | Type |
| [`FieldOfView`](api/camera-field-of-view.md#fieldofview) | Type |
| [`FieldOfViewBounds`](api/camera-field-of-view.md#fieldofviewbounds) | Type |

## camera/projected-object-size.ts

[Detailed contracts](api/camera-projected-object-size.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/camera/projected-object-size.ts)

| Export | Kind |
| --- | --- |
| [`calculateProjectedObjectSize`](api/camera-projected-object-size.md#calculateprojectedobjectsize) | Runtime |
| [`CalculateProjectedObjectSizeInput`](api/camera-projected-object-size.md#calculateprojectedobjectsizeinput) | Type |
| [`ProjectedObjectSize`](api/camera-projected-object-size.md#projectedobjectsize) | Type |

## capture/capture-export-metadata.ts

[Detailed contracts](api/capture-capture-export-metadata.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/capture/capture-export-metadata.ts)

| Export | Kind |
| --- | --- |
| [`CAPTURE_EXPORT_METADATA_SCHEMA_VERSION`](api/capture-capture-export-metadata.md#capture_export_metadata_schema_version) | Runtime |
| [`CaptureExportArtifactIdentity`](api/capture-capture-export-metadata.md#captureexportartifactidentity) | Type |
| [`CaptureExportMetadataInput`](api/capture-capture-export-metadata.md#captureexportmetadatainput) | Type |
| [`CaptureExportMetadataPair`](api/capture-capture-export-metadata.md#captureexportmetadatapair) | Type |
| [`CaptureExportSharedMetadata`](api/capture-capture-export-metadata.md#captureexportsharedmetadata) | Type |
| [`CaptureExportWorkflow`](api/capture-capture-export-metadata.md#captureexportworkflow) | Type |
| [`createCaptureExportMetadataPair`](api/capture-capture-export-metadata.md#createcaptureexportmetadatapair) | Runtime |
| [`parseCaptureExportMetadataInput`](api/capture-capture-export-metadata.md#parsecaptureexportmetadatainput) | Runtime |

## capture/environment-raw-producer.ts

[Detailed contracts](api/capture-environment-raw-producer.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/capture/environment-raw-producer.ts)

| Export | Kind |
| --- | --- |
| [`EnvironmentSensorRawFrame`](api/capture-environment-raw-producer.md#environmentsensorrawframe) | Type |
| [`simulateEnvironmentSensorRawFrame`](api/capture-environment-raw-producer.md#simulateenvironmentsensorrawframe) | Runtime |
| [`SimulateEnvironmentSensorRawFrameInput`](api/capture-environment-raw-producer.md#simulateenvironmentsensorrawframeinput) | Type |

## capture/focus-control.ts

[Detailed contracts](api/capture-focus-control.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/capture/focus-control.ts)

| Export | Kind |
| --- | --- |
| [`assessFocusReleaseGate`](api/capture-focus-control.md#assessfocusreleasegate) | Runtime |
| [`AssessFocusReleaseGateInput`](api/capture-focus-control.md#assessfocusreleasegateinput) | Type |
| [`createFocusControlState`](api/capture-focus-control.md#createfocuscontrolstate) | Runtime |
| [`CreateFocusControlStateInput`](api/capture-focus-control.md#createfocuscontrolstateinput) | Type |
| [`FOCUS_CONTROL_PROFILE_SCHEMA_VERSION`](api/capture-focus-control.md#focus_control_profile_schema_version) | Runtime |
| [`FOCUS_CONTROL_STATE_VERSION`](api/capture-focus-control.md#focus_control_state_version) | Runtime |
| [`FocusAcquisitionState`](api/capture-focus-control.md#focusacquisitionstate) | Type |
| [`FocusControlMode`](api/capture-focus-control.md#focuscontrolmode) | Type |
| [`FocusControlProfile`](api/capture-focus-control.md#focuscontrolprofile) | Type |
| [`FocusControlState`](api/capture-focus-control.md#focuscontrolstate) | Type |
| [`FocusReleaseGateAssessment`](api/capture-focus-control.md#focusreleasegateassessment) | Type |
| [`FocusReleasePriority`](api/capture-focus-control.md#focusreleasepriority) | Type |
| [`FocusTargetControlEvent`](api/capture-focus-control.md#focustargetcontrolevent) | Type |
| [`FocusTargetLossReason`](api/capture-focus-control.md#focustargetlossreason) | Type |
| [`FocusTargetObservation`](api/capture-focus-control.md#focustargetobservation) | Type |
| [`FocusTargetResolution`](api/capture-focus-control.md#focustargetresolution) | Type |
| [`parseFocusControlProfile`](api/capture-focus-control.md#parsefocuscontrolprofile) | Runtime |
| [`resolveFocusTargetObservation`](api/capture-focus-control.md#resolvefocustargetobservation) | Runtime |
| [`ResolveFocusTargetObservationInput`](api/capture-focus-control.md#resolvefocustargetobservationinput) | Type |
| [`setFocusLock`](api/capture-focus-control.md#setfocuslock) | Runtime |
| [`SetFocusLockInput`](api/capture-focus-control.md#setfocuslockinput) | Type |
| [`setManualFocusState`](api/capture-focus-control.md#setmanualfocusstate) | Runtime |
| [`SetManualFocusStateInput`](api/capture-focus-control.md#setmanualfocusstateinput) | Type |

## capture/linear-encoding.ts

[Detailed contracts](api/capture-linear-encoding.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/capture/linear-encoding.ts)

| Export | Kind |
| --- | --- |
| [`calculateLinearCaptureEncoding`](api/capture-linear-encoding.md#calculatelinearcaptureencoding) | Runtime |
| [`EncodedLinearCapture`](api/capture-linear-encoding.md#encodedlinearcapture) | Type |
| [`LINEAR_CAPTURE_ENCODING_SCHEMA_VERSION`](api/capture-linear-encoding.md#linear_capture_encoding_schema_version) | Runtime |
| [`LinearCaptureEncoding`](api/capture-linear-encoding.md#linearcaptureencoding) | Type |
| [`LinearCaptureEncodingInput`](api/capture-linear-encoding.md#linearcaptureencodinginput) | Type |
| [`parseLinearCaptureEncoding`](api/capture-linear-encoding.md#parselinearcaptureencoding) | Runtime |

## capture/photographic-export.ts

[Detailed contracts](api/capture-photographic-export.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/capture/photographic-export.ts)

| Export | Kind |
| --- | --- |
| [`calculateProcessedSensorRaw`](api/capture-photographic-export.md#calculateprocessedsensorraw) | Runtime |
| [`createPhotographicExportPair`](api/capture-photographic-export.md#createphotographicexportpair) | Runtime |
| [`ExportSensorColorProfile`](api/capture-photographic-export.md#exportsensorcolorprofile) | Type |
| [`parseExportSensorColorProfile`](api/capture-photographic-export.md#parseexportsensorcolorprofile) | Runtime |
| [`parsePhotographicExportInput`](api/capture-photographic-export.md#parsephotographicexportinput) | Runtime |
| [`parseProcessedSensorRawInput`](api/capture-photographic-export.md#parseprocessedsensorrawinput) | Runtime |
| [`PHOTOGRAPHIC_EXPORT_SCHEMA_VERSION`](api/capture-photographic-export.md#photographic_export_schema_version) | Runtime |
| [`PhotographicExportInput`](api/capture-photographic-export.md#photographicexportinput) | Type |
| [`PhotographicExportPair`](api/capture-photographic-export.md#photographicexportpair) | Type |
| [`ProcessedSensorRawInput`](api/capture-photographic-export.md#processedsensorrawinput) | Type |
| [`ProcessedSensorRawResult`](api/capture-photographic-export.md#processedsensorrawresult) | Type |

## capture/raw-frame-reconstruction.ts

[Detailed contracts](api/capture-raw-frame-reconstruction.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/capture/raw-frame-reconstruction.ts)

| Export | Kind |
| --- | --- |
| [`parseRawFrameReconstructionInput`](api/capture-raw-frame-reconstruction.md#parserawframereconstructioninput) | Runtime |
| [`RAW_FRAME_RECONSTRUCTION_SCHEMA_VERSION`](api/capture-raw-frame-reconstruction.md#raw_frame_reconstruction_schema_version) | Runtime |
| [`RawFrameReconstruction`](api/capture-raw-frame-reconstruction.md#rawframereconstruction) | Type |
| [`RawFrameReconstructionInput`](api/capture-raw-frame-reconstruction.md#rawframereconstructioninput) | Type |
| [`RawFrameReconstructionPhaseProfile`](api/capture-raw-frame-reconstruction.md#rawframereconstructionphaseprofile) | Type |
| [`resolveRawFrameReconstruction`](api/capture-raw-frame-reconstruction.md#resolverawframereconstruction) | Runtime |

## capture/release-sequence.ts

[Detailed contracts](api/capture-release-sequence.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/capture/release-sequence.ts)

| Export | Kind |
| --- | --- |
| [`CancelledReleaseSequence`](api/capture-release-sequence.md#cancelledreleasesequence) | Type |
| [`CancelReleaseSequenceInput`](api/capture-release-sequence.md#cancelreleasesequenceinput) | Type |
| [`createCancelledReleaseSequence`](api/capture-release-sequence.md#createcancelledreleasesequence) | Runtime |
| [`RELEASE_SEQUENCE_VERSION`](api/capture-release-sequence.md#release_sequence_version) | Runtime |
| [`ReleaseAutomationState`](api/capture-release-sequence.md#releaseautomationstate) | Type |
| [`ReleaseBaseCaptureState`](api/capture-release-sequence.md#releasebasecapturestate) | Type |
| [`ReleaseBracketPolicy`](api/capture-release-sequence.md#releasebracketpolicy) | Type |
| [`ReleaseDrivePolicy`](api/capture-release-sequence.md#releasedrivepolicy) | Type |
| [`ReleaseTimingConstraint`](api/capture-release-sequence.md#releasetimingconstraint) | Type |
| [`ResolvedReleaseFrame`](api/capture-release-sequence.md#resolvedreleaseframe) | Type |
| [`ResolvedReleaseSequence`](api/capture-release-sequence.md#resolvedreleasesequence) | Type |
| [`resolveReleaseSequence`](api/capture-release-sequence.md#resolvereleasesequence) | Runtime |
| [`ResolveReleaseSequenceInput`](api/capture-release-sequence.md#resolvereleasesequenceinput) | Type |

## capture/sensor-raw-frame.ts

[Detailed contracts](api/capture-sensor-raw-frame.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/capture/sensor-raw-frame.ts)

| Export | Kind |
| --- | --- |
| [`createSensorRawFrame`](api/capture-sensor-raw-frame.md#createsensorrawframe) | Runtime |
| [`parseSensorRawFrameInput`](api/capture-sensor-raw-frame.md#parsesensorrawframeinput) | Runtime |
| [`SENSOR_RAW_FRAME_SCHEMA_VERSION`](api/capture-sensor-raw-frame.md#sensor_raw_frame_schema_version) | Runtime |
| [`SensorRawFrame`](api/capture-sensor-raw-frame.md#sensorrawframe) | Type |
| [`SensorRawFrameInput`](api/capture-sensor-raw-frame.md#sensorrawframeinput) | Type |

## capture/sensor-raw-producer.ts

[Detailed contracts](api/capture-sensor-raw-producer.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/capture/sensor-raw-producer.ts)

| Export | Kind |
| --- | --- |
| [`parseSensorRawProducerInput`](api/capture-sensor-raw-producer.md#parsesensorrawproducerinput) | Runtime |
| [`SENSOR_RAW_PRODUCER_NOISE_MODEL`](api/capture-sensor-raw-producer.md#sensor_raw_producer_noise_model) | Runtime |
| [`SENSOR_RAW_PRODUCER_SCHEMA_VERSION`](api/capture-sensor-raw-producer.md#sensor_raw_producer_schema_version) | Runtime |
| [`SensorRawProducerExposureWindowInput`](api/capture-sensor-raw-producer.md#sensorrawproducerexposurewindowinput) | Type |
| [`SensorRawProducerInput`](api/capture-sensor-raw-producer.md#sensorrawproducerinput) | Type |
| [`SensorRawProducerResult`](api/capture-sensor-raw-producer.md#sensorrawproducerresult) | Type |
| [`SensorRawProducerSiteInput`](api/capture-sensor-raw-producer.md#sensorrawproducersiteinput) | Type |
| [`simulateSensorRawFrame`](api/capture-sensor-raw-producer.md#simulatesensorrawframe) | Runtime |

## capture/simulated-capture.ts

[Detailed contracts](api/capture-simulated-capture.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/capture/simulated-capture.ts)

| Export | Kind |
| --- | --- |
| [`CaptureFloatStorage`](api/capture-simulated-capture.md#capturefloatstorage) | Type |
| [`CaptureLinearImageState`](api/capture-simulated-capture.md#capturelinearimagestate) | Type |
| [`CaptureLinearPlane`](api/capture-simulated-capture.md#capturelinearplane) | Type |
| [`CapturePublicProfileReference`](api/capture-simulated-capture.md#capturepublicprofilereference) | Type |
| [`CaptureWhiteBalanceIntent`](api/capture-simulated-capture.md#capturewhitebalanceintent) | Type |
| [`CaptureWhiteXyz`](api/capture-simulated-capture.md#capturewhitexyz) | Type |
| [`createCaptureWhiteBalanceIntent`](api/capture-simulated-capture.md#createcapturewhitebalanceintent) | Runtime |
| [`createSimulatedCapture`](api/capture-simulated-capture.md#createsimulatedcapture) | Runtime |
| [`parseSimulatedCapture`](api/capture-simulated-capture.md#parsesimulatedcapture) | Runtime |
| [`resolveSimulatedCapturePlane`](api/capture-simulated-capture.md#resolvesimulatedcaptureplane) | Runtime |
| [`serializeSimulatedCapture`](api/capture-simulated-capture.md#serializesimulatedcapture) | Runtime |
| [`SIMULATED_CAPTURE_SCHEMA_VERSION`](api/capture-simulated-capture.md#simulated_capture_schema_version) | Runtime |
| [`SimulatedCapture`](api/capture-simulated-capture.md#simulatedcapture) | Type |
| [`SimulatedCaptureInput`](api/capture-simulated-capture.md#simulatedcaptureinput) | Type |

## color/capture-color.ts

[Detailed contracts](api/color-capture-color.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/color/capture-color.ts)

| Export | Kind |
| --- | --- |
| [`calculateCaptureColorTransform`](api/color-capture-color.md#calculatecapturecolortransform) | Runtime |
| [`CAPTURE_COLOR_MODEL_VERSION`](api/color-capture-color.md#capture_color_model_version) | Runtime |
| [`CaptureColorModel`](api/color-capture-color.md#capturecolormodel) | Type |
| [`CaptureColorTransformInput`](api/color-capture-color.md#capturecolortransforminput) | Type |
| [`CaptureColorTransformResult`](api/color-capture-color.md#capturecolortransformresult) | Type |
| [`CaptureColorWhiteBalance`](api/color-capture-color.md#capturecolorwhitebalance) | Type |
| [`LINEAR_CAPTURE_RGB_PROFILE`](api/color-capture-color.md#linear_capture_rgb_profile) | Runtime |
| [`parseCaptureColorTransformInput`](api/color-capture-color.md#parsecapturecolortransforminput) | Runtime |
| [`resolveCaptureColorModel`](api/color-capture-color.md#resolvecapturecolormodel) | Runtime |
| [`VIRTUAL_COLOR_CAMERA_PROFILE`](api/color-capture-color.md#virtual_color_camera_profile) | Runtime |

## color/white-balance.ts

[Detailed contracts](api/color-white-balance.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/color/white-balance.ts)

| Export | Kind |
| --- | --- |
| [`COLOR_TEMPERATURE_WHITE_BALANCE_INTENT_VERSION`](api/color-white-balance.md#color_temperature_white_balance_intent_version) | Runtime |
| [`ColorTemperatureWhiteBalanceIntent`](api/color-white-balance.md#colortemperaturewhitebalanceintent) | Type |
| [`createColorTemperatureWhiteBalanceIntent`](api/color-white-balance.md#createcolortemperaturewhitebalanceintent) | Runtime |
| [`CreateColorTemperatureWhiteBalanceIntentInput`](api/color-white-balance.md#createcolortemperaturewhitebalanceintentinput) | Type |
| [`createLockedWhiteBalanceState`](api/color-white-balance.md#createlockedwhitebalancestate) | Runtime |
| [`CreateLockedWhiteBalanceStateInput`](api/color-white-balance.md#createlockedwhitebalancestateinput) | Type |
| [`estimateAutoWhiteBalance`](api/color-white-balance.md#estimateautowhitebalance) | Runtime |
| [`EstimateAutoWhiteBalanceInput`](api/color-white-balance.md#estimateautowhitebalanceinput) | Type |
| [`parseResolvedWhiteBalanceState`](api/color-white-balance.md#parseresolvedwhitebalancestate) | Runtime |
| [`parseWhiteBalanceProfile`](api/color-white-balance.md#parsewhitebalanceprofile) | Runtime |
| [`PreWhiteBalanceRgbSample`](api/color-white-balance.md#prewhitebalancergbsample) | Type |
| [`PreWhiteBalanceRgbSampleSet`](api/color-white-balance.md#prewhitebalancergbsampleset) | Type |
| [`resolveCustomWhiteBalance`](api/color-white-balance.md#resolvecustomwhitebalance) | Runtime |
| [`ResolveCustomWhiteBalanceInput`](api/color-white-balance.md#resolvecustomwhitebalanceinput) | Type |
| [`ResolvedWhiteBalanceState`](api/color-white-balance.md#resolvedwhitebalancestate) | Type |
| [`resolveManualWhiteBalance`](api/color-white-balance.md#resolvemanualwhitebalance) | Runtime |
| [`ResolveManualWhiteBalanceInput`](api/color-white-balance.md#resolvemanualwhitebalanceinput) | Type |
| [`resolvePresetWhiteBalance`](api/color-white-balance.md#resolvepresetwhitebalance) | Runtime |
| [`ResolvePresetWhiteBalanceInput`](api/color-white-balance.md#resolvepresetwhitebalanceinput) | Type |
| [`WHITE_BALANCE_PROFILE_SCHEMA_VERSION`](api/color-white-balance.md#white_balance_profile_schema_version) | Runtime |
| [`WHITE_BALANCE_STATE_VERSION`](api/color-white-balance.md#white_balance_state_version) | Runtime |
| [`WhiteBalanceAwbIntent`](api/color-white-balance.md#whitebalanceawbintent) | Type |
| [`WhiteBalanceAwbPolicy`](api/color-white-balance.md#whitebalanceawbpolicy) | Type |
| [`WhiteBalanceChannelGains`](api/color-white-balance.md#whitebalancechannelgains) | Type |
| [`WhiteBalanceInputDomain`](api/color-white-balance.md#whitebalanceinputdomain) | Type |
| [`WhiteBalancePresetDefinition`](api/color-white-balance.md#whitebalancepresetdefinition) | Type |
| [`WhiteBalanceProfile`](api/color-white-balance.md#whitebalanceprofile) | Type |

## composition/image-formation-plan.ts

[Detailed contracts](api/composition-image-formation-plan.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/composition/image-formation-plan.ts)

| Export | Kind |
| --- | --- |
| [`createProductionCaptureSnapshot`](api/composition-image-formation-plan.md#createproductioncapturesnapshot) | Runtime |
| [`createProductionCaptureSnapshotFromReleaseFrame`](api/composition-image-formation-plan.md#createproductioncapturesnapshotfromreleaseframe) | Runtime |
| [`CreateProductionCaptureSnapshotFromReleaseFrameInput`](api/composition-image-formation-plan.md#createproductioncapturesnapshotfromreleaseframeinput) | Type |
| [`CreateProductionCaptureSnapshotInput`](api/composition-image-formation-plan.md#createproductioncapturesnapshotinput) | Type |
| [`createProductionImageFormationPlan`](api/composition-image-formation-plan.md#createproductionimageformationplan) | Runtime |
| [`CreateProductionImageFormationPlanInput`](api/composition-image-formation-plan.md#createproductionimageformationplaninput) | Type |
| [`IMAGE_FORMATION_FIDELITY_PROFILE_SCHEMA_VERSION`](api/composition-image-formation-plan.md#image_formation_fidelity_profile_schema_version) | Runtime |
| [`ImageFormationFidelityProfile`](api/composition-image-formation-plan.md#imageformationfidelityprofile) | Type |
| [`parseImageFormationFidelityProfile`](api/composition-image-formation-plan.md#parseimageformationfidelityprofile) | Runtime |
| [`parsePreparedImageFormationContext`](api/composition-image-formation-plan.md#parsepreparedimageformationcontext) | Runtime |
| [`parseProductionCaptureSnapshot`](api/composition-image-formation-plan.md#parseproductioncapturesnapshot) | Runtime |
| [`parseRendererCapabilityDeclaration`](api/composition-image-formation-plan.md#parserenderercapabilitydeclaration) | Runtime |
| [`PlannedImageFormationEffect`](api/composition-image-formation-plan.md#plannedimageformationeffect) | Type |
| [`PlannedImageFormationEffectState`](api/composition-image-formation-plan.md#plannedimageformationeffectstate) | Type |
| [`PlannedImageFormationStage`](api/composition-image-formation-plan.md#plannedimageformationstage) | Type |
| [`PlannedImageFormationStageState`](api/composition-image-formation-plan.md#plannedimageformationstagestate) | Type |
| [`PlannedScientificStatus`](api/composition-image-formation-plan.md#plannedscientificstatus) | Type |
| [`PREPARED_IMAGE_FORMATION_CONTEXT_VERSION`](api/composition-image-formation-plan.md#prepared_image_formation_context_version) | Runtime |
| [`PreparedImageFormationContext`](api/composition-image-formation-plan.md#preparedimageformationcontext) | Type |
| [`prepareImageFormationContext`](api/composition-image-formation-plan.md#prepareimageformationcontext) | Runtime |
| [`PrepareImageFormationContextInput`](api/composition-image-formation-plan.md#prepareimageformationcontextinput) | Type |
| [`PRODUCTION_CAPTURE_SNAPSHOT_VERSION`](api/composition-image-formation-plan.md#production_capture_snapshot_version) | Runtime |
| [`PRODUCTION_IMAGE_FORMATION_PLAN_VERSION`](api/composition-image-formation-plan.md#production_image_formation_plan_version) | Runtime |
| [`ProductionCaptureSnapshot`](api/composition-image-formation-plan.md#productioncapturesnapshot) | Type |
| [`ProductionEnvironmentCaptureInput`](api/composition-image-formation-plan.md#productionenvironmentcaptureinput) | Type |
| [`ProductionImageFormationBlocker`](api/composition-image-formation-plan.md#productionimageformationblocker) | Type |
| [`ProductionImageFormationBlockerCode`](api/composition-image-formation-plan.md#productionimageformationblockercode) | Type |
| [`ProductionImageFormationPlan`](api/composition-image-formation-plan.md#productionimageformationplan) | Type |
| [`ProductionPhysicalSceneSample`](api/composition-image-formation-plan.md#productionphysicalscenesample) | Type |
| [`ProductionProcessedOutputInput`](api/composition-image-formation-plan.md#productionprocessedoutputinput) | Type |
| [`ProductionReleaseFrameBinding`](api/composition-image-formation-plan.md#productionreleaseframebinding) | Type |
| [`ProductionTemporalCaptureInput`](api/composition-image-formation-plan.md#productiontemporalcaptureinput) | Type |
| [`ProductionTemporalCaptureResult`](api/composition-image-formation-plan.md#productiontemporalcaptureresult) | Type |
| [`RENDERER_CAPABILITY_SCHEMA_VERSION`](api/composition-image-formation-plan.md#renderer_capability_schema_version) | Runtime |
| [`RendererCapabilityDeclaration`](api/composition-image-formation-plan.md#renderercapabilitydeclaration) | Type |
| [`RendererConsumerKind`](api/composition-image-formation-plan.md#rendererconsumerkind) | Type |
| [`RequiredImageFormationEffect`](api/composition-image-formation-plan.md#requiredimageformationeffect) | Type |
| [`serializeProductionImageFormationPlan`](api/composition-image-formation-plan.md#serializeproductionimageformationplan) | Runtime |

## composition/plan-consumer.ts

[Detailed contracts](api/composition-plan-consumer.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/composition/plan-consumer.ts)

| Export | Kind |
| --- | --- |
| [`createProductionPlanConsumerManifest`](api/composition-plan-consumer.md#createproductionplanconsumermanifest) | Runtime |
| [`CreateProductionPlanConsumerManifestInput`](api/composition-plan-consumer.md#createproductionplanconsumermanifestinput) | Type |
| [`PRODUCTION_PLAN_CONSUMER_MANIFEST_VERSION`](api/composition-plan-consumer.md#production_plan_consumer_manifest_version) | Runtime |
| [`ProductionPlanConsumerManifest`](api/composition-plan-consumer.md#productionplanconsumermanifest) | Type |

## core/calculation-result.ts

[Detailed contracts](api/core-calculation-result.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/core/calculation-result.ts)

| Export | Kind |
| --- | --- |
| [`AbsoluteUncertaintyEstimate`](api/core-calculation-result.md#absoluteuncertaintyestimate) | Type |
| [`approximationResult`](api/core-calculation-result.md#approximationresult) | Runtime |
| [`calculatedResult`](api/core-calculation-result.md#calculatedresult) | Runtime |
| [`CalculationProvenance`](api/core-calculation-result.md#calculationprovenance) | Type |
| [`CalculationQuality`](api/core-calculation-result.md#calculationquality) | Type |
| [`CalculationResult`](api/core-calculation-result.md#calculationresult) | Type |
| [`CalculationValidRange`](api/core-calculation-result.md#calculationvalidrange) | Type |
| [`calibratedResult`](api/core-calculation-result.md#calibratedresult) | Runtime |
| [`estimatedResult`](api/core-calculation-result.md#estimatedresult) | Runtime |
| [`ProvenanceKind`](api/core-calculation-result.md#provenancekind) | Type |
| [`RelativeUncertaintyEstimate`](api/core-calculation-result.md#relativeuncertaintyestimate) | Type |
| [`UncertaintyConfidence`](api/core-calculation-result.md#uncertaintyconfidence) | Type |
| [`UncertaintyEstimate`](api/core-calculation-result.md#uncertaintyestimate) | Type |
| [`UncertaintySource`](api/core-calculation-result.md#uncertaintysource) | Type |
| [`validateCalculationQuality`](api/core-calculation-result.md#validatecalculationquality) | Runtime |

## core/configuration-error.ts

[Detailed contracts](api/core-configuration-error.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/core/configuration-error.ts)

| Export | Kind |
| --- | --- |
| [`InvalidConfigurationError`](api/core-configuration-error.md#invalidconfigurationerror) | Runtime |

## core/image-formation.ts

[Detailed contracts](api/core-image-formation.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/core/image-formation.ts)

| Export | Kind |
| --- | --- |
| [`getImageFormationContract`](api/core-image-formation.md#getimageformationcontract) | Runtime |
| [`IMAGE_FORMATION_CONTRACT_VERSION`](api/core-image-formation.md#image_formation_contract_version) | Runtime |
| [`ImageFormationContract`](api/core-image-formation.md#imageformationcontract) | Type |
| [`ImageFormationCoordinateSpaceContract`](api/core-image-formation.md#imageformationcoordinatespacecontract) | Type |
| [`ImageFormationCoordinateSpaceId`](api/core-image-formation.md#imageformationcoordinatespaceid) | Type |
| [`ImageFormationDomainId`](api/core-image-formation.md#imageformationdomainid) | Type |
| [`ImageFormationEffectId`](api/core-image-formation.md#imageformationeffectid) | Type |
| [`ImageFormationEffectPlacement`](api/core-image-formation.md#imageformationeffectplacement) | Type |
| [`ImageFormationImplementationStatus`](api/core-image-formation.md#imageformationimplementationstatus) | Type |
| [`ImageFormationRendererContract`](api/core-image-formation.md#imageformationrenderercontract) | Type |
| [`ImageFormationStageContract`](api/core-image-formation.md#imageformationstagecontract) | Type |
| [`ImageFormationStageId`](api/core-image-formation.md#imageformationstageid) | Type |
| [`ImageFormationTemporalContract`](api/core-image-formation.md#imageformationtemporalcontract) | Type |

## core/scientific-assurance.ts

[Detailed contracts](api/core-scientific-assurance.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/core/scientific-assurance.ts)

| Export | Kind |
| --- | --- |
| [`ComposedScientificAssurance`](api/core-scientific-assurance.md#composedscientificassurance) | Type |
| [`ComposedScientificUncertaintyStatus`](api/core-scientific-assurance.md#composedscientificuncertaintystatus) | Type |
| [`composeScientificAssurance`](api/core-scientific-assurance.md#composescientificassurance) | Runtime |
| [`ComposeScientificAssuranceInput`](api/core-scientific-assurance.md#composescientificassuranceinput) | Type |
| [`SCIENTIFIC_ASSURANCE_CONTRACT_VERSION`](api/core-scientific-assurance.md#scientific_assurance_contract_version) | Runtime |
| [`ScientificAssuranceBasisKind`](api/core-scientific-assurance.md#scientificassurancebasiskind) | Type |
| [`ScientificAssuranceComponent`](api/core-scientific-assurance.md#scientificassurancecomponent) | Type |
| [`ScientificAssuranceComponentUncertainty`](api/core-scientific-assurance.md#scientificassurancecomponentuncertainty) | Type |
| [`ScientificAssuranceSourceIdentity`](api/core-scientific-assurance.md#scientificassurancesourceidentity) | Type |
| [`ScientificAssuranceSourceKind`](api/core-scientific-assurance.md#scientificassurancesourcekind) | Type |
| [`ScientificAssuranceStatus`](api/core-scientific-assurance.md#scientificassurancestatus) | Type |

## core/spectral-composition.ts

[Detailed contracts](api/core-spectral-composition.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/core/spectral-composition.ts)

| Export | Kind |
| --- | --- |
| [`composeSpectralCoverage`](api/core-spectral-composition.md#composespectralcoverage) | Runtime |
| [`ComposeSpectralCoverageInput`](api/core-spectral-composition.md#composespectralcoverageinput) | Type |
| [`DiscreteSpectralLineMeasure`](api/core-spectral-composition.md#discretespectrallinemeasure) | Type |
| [`DiscreteSpectralLineMeasureEntry`](api/core-spectral-composition.md#discretespectrallinemeasureentry) | Type |
| [`DiscreteSpectralLineQuantityUnit`](api/core-spectral-composition.md#discretespectrallinequantityunit) | Type |
| [`DistributeIntegratedQuantityAcrossDiscreteLinesInput`](api/core-spectral-composition.md#distributeintegratedquantityacrossdiscretelinesinput) | Type |
| [`distributeIntegratedQuantityAcrossDiscreteSpectralLines`](api/core-spectral-composition.md#distributeintegratedquantityacrossdiscretespectrallines) | Runtime |
| [`IntegratedDiscreteSpectralLineMeasure`](api/core-spectral-composition.md#integrateddiscretespectrallinemeasure) | Type |
| [`integrateDiscreteSpectralLineMeasure`](api/core-spectral-composition.md#integratediscretespectrallinemeasure) | Runtime |
| [`NormalizedDiscreteSpectralLine`](api/core-spectral-composition.md#normalizeddiscretespectralline) | Type |
| [`NormalizedDiscreteSpectralLineDistribution`](api/core-spectral-composition.md#normalizeddiscretespectrallinedistribution) | Type |
| [`parseNormalizedDiscreteSpectralLineDistribution`](api/core-spectral-composition.md#parsenormalizeddiscretespectrallinedistribution) | Runtime |
| [`parseSpectralCoverageParticipant`](api/core-spectral-composition.md#parsespectralcoverageparticipant) | Runtime |
| [`ResolvedSpectralWavelengthBasis`](api/core-spectral-composition.md#resolvedspectralwavelengthbasis) | Type |
| [`SpectralCoverageComposition`](api/core-spectral-composition.md#spectralcoveragecomposition) | Type |
| [`SpectralCoverageParticipant`](api/core-spectral-composition.md#spectralcoverageparticipant) | Type |
| [`SpectralCoverageParticipantRole`](api/core-spectral-composition.md#spectralcoverageparticipantrole) | Type |

## core/spectral.ts

[Detailed contracts](api/core-spectral.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/core/spectral.ts)

| Export | Kind |
| --- | --- |
| [`parseSpectralWavelengthBasis`](api/core-spectral.md#parsespectralwavelengthbasis) | Runtime |
| [`parseSpectralWavelengthRangeNanometers`](api/core-spectral.md#parsespectralwavelengthrangenanometers) | Runtime |
| [`parseSpectralWavelengthSample`](api/core-spectral.md#parsespectralwavelengthsample) | Runtime |
| [`SpectralWavelengthBasis`](api/core-spectral.md#spectralwavelengthbasis) | Type |
| [`SpectralWavelengthRangeNanometers`](api/core-spectral.md#spectralwavelengthrangenanometers) | Type |
| [`SpectralWavelengthSample`](api/core-spectral.md#spectralwavelengthsample) | Type |

## core/validation.ts

[Detailed contracts](api/core-validation.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/core/validation.ts)

| Export | Kind |
| --- | --- |
| [`InvalidScientificInputError`](api/core-validation.md#invalidscientificinputerror) | Runtime |
| [`InvalidScientificResultError`](api/core-validation.md#invalidscientificresulterror) | Runtime |

## core/version.ts

[Detailed contracts](api/core-version.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/core/version.ts)

| Export | Kind |
| --- | --- |
| [`ENGINE_API_VERSION`](api/core-version.md#engine_api_version) | Runtime |

## equipment/exposure-capabilities.ts

[Detailed contracts](api/equipment-exposure-capabilities.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/equipment/exposure-capabilities.ts)

| Export | Kind |
| --- | --- |
| [`FocalLengthFNumberSample`](api/equipment-exposure-capabilities.md#focallengthfnumbersample) | Type |
| [`GENERIC_EQUIPMENT_EXPOSURE_CAPABILITY_SCHEMA_VERSION`](api/equipment-exposure-capabilities.md#generic_equipment_exposure_capability_schema_version) | Runtime |
| [`GenericBodyExposureCapabilityProfile`](api/equipment-exposure-capabilities.md#genericbodyexposurecapabilityprofile) | Type |
| [`GenericCapabilityAvailability`](api/equipment-exposure-capabilities.md#genericcapabilityavailability) | Type |
| [`GenericLensExposureCapabilityProfile`](api/equipment-exposure-capabilities.md#genericlensexposurecapabilityprofile) | Type |
| [`NumericCapabilityRange`](api/equipment-exposure-capabilities.md#numericcapabilityrange) | Type |
| [`NumericSettingGrid`](api/equipment-exposure-capabilities.md#numericsettinggrid) | Type |
| [`parseGenericBodyExposureCapabilityProfile`](api/equipment-exposure-capabilities.md#parsegenericbodyexposurecapabilityprofile) | Runtime |
| [`parseGenericLensExposureCapabilityProfile`](api/equipment-exposure-capabilities.md#parsegenericlensexposurecapabilityprofile) | Runtime |
| [`ResolvedGenericEquipmentExposureCapabilities`](api/equipment-exposure-capabilities.md#resolvedgenericequipmentexposurecapabilities) | Type |
| [`ResolvedNumericSettingGrid`](api/equipment-exposure-capabilities.md#resolvednumericsettinggrid) | Type |
| [`resolveGenericEquipmentExposureCapabilities`](api/equipment-exposure-capabilities.md#resolvegenericequipmentexposurecapabilities) | Runtime |
| [`ResolveGenericEquipmentExposureCapabilitiesInput`](api/equipment-exposure-capabilities.md#resolvegenericequipmentexposurecapabilitiesinput) | Type |
| [`WidestAvailableFNumberCapability`](api/equipment-exposure-capabilities.md#widestavailablefnumbercapability) | Type |

## equipment/generic-tier-assets.ts

[Detailed contracts](api/equipment-generic-tier-assets.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/equipment/generic-tier-assets.ts)

| Export | Kind |
| --- | --- |
| [`GenericEquipmentTier`](api/equipment-generic-tier-assets.md#genericequipmenttier) | Type |
| [`GenericEquipmentTierPreset`](api/equipment-generic-tier-assets.md#genericequipmenttierpreset) | Type |
| [`GenericTierBodyAssets`](api/equipment-generic-tier-assets.md#generictierbodyassets) | Type |
| [`GenericTierLensAssets`](api/equipment-generic-tier-assets.md#generictierlensassets) | Type |
| [`GenericVersionedAsset`](api/equipment-generic-tier-assets.md#genericversionedasset) | Type |

## equipment/generic-tier-presets.ts

[Detailed contracts](api/equipment-generic-tier-presets.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/equipment/generic-tier-presets.ts)

| Export | Kind |
| --- | --- |
| [`createGenericEquipmentTierSelection`](api/equipment-generic-tier-presets.md#creategenericequipmenttierselection) | Runtime |
| [`GENERIC_EQUIPMENT_TIER_PRESET_VERSION`](api/equipment-generic-tier-presets.md#generic_equipment_tier_preset_version) | Runtime |
| [`GENERIC_EQUIPMENT_TIERS`](api/equipment-generic-tier-presets.md#generic_equipment_tiers) | Runtime |
| [`GenericEquipmentTierProfileReference`](api/equipment-generic-tier-presets.md#genericequipmenttierprofilereference) | Type |
| [`GenericEquipmentTierSelection`](api/equipment-generic-tier-presets.md#genericequipmenttierselection) | Type |
| [`parseGenericEquipmentTierSelection`](api/equipment-generic-tier-presets.md#parsegenericequipmenttierselection) | Runtime |
| [`ResolvedGenericTierLensProfiles`](api/equipment-generic-tier-presets.md#resolvedgenerictierlensprofiles) | Type |
| [`resolveGenericEquipmentTierCatalog`](api/equipment-generic-tier-presets.md#resolvegenericequipmenttiercatalog) | Runtime |
| [`resolveGenericEquipmentTierLensProfiles`](api/equipment-generic-tier-presets.md#resolvegenericequipmenttierlensprofiles) | Runtime |

## equipment/iso-capabilities.ts

[Detailed contracts](api/equipment-iso-capabilities.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/equipment/iso-capabilities.ts)

| Export | Kind |
| --- | --- |
| [`bindIsoCapabilityToExposureCapabilities`](api/equipment-iso-capabilities.md#bindisocapabilitytoexposurecapabilities) | Runtime |
| [`BindIsoCapabilityToExposureCapabilitiesInput`](api/equipment-iso-capabilities.md#bindisocapabilitytoexposurecapabilitiesinput) | Type |
| [`BoundIsoExposureCapabilities`](api/equipment-iso-capabilities.md#boundisoexposurecapabilities) | Type |
| [`ISO_CAPABILITY_PROFILE_SCHEMA_VERSION`](api/equipment-iso-capabilities.md#iso_capability_profile_schema_version) | Runtime |
| [`IsoAutoIsoCapability`](api/equipment-iso-capabilities.md#isoautoisocapability) | Type |
| [`IsoCapabilityAvailability`](api/equipment-iso-capabilities.md#isocapabilityavailability) | Type |
| [`IsoCapabilityProfile`](api/equipment-iso-capabilities.md#isocapabilityprofile) | Type |
| [`IsoCaptureModePolicy`](api/equipment-iso-capabilities.md#isocapturemodepolicy) | Type |
| [`IsoExpandedSetting`](api/equipment-iso-capabilities.md#isoexpandedsetting) | Type |
| [`IsoExposureIndexRange`](api/equipment-iso-capabilities.md#isoexposureindexrange) | Type |
| [`IsoStandardSettingGrid`](api/equipment-iso-capabilities.md#isostandardsettinggrid) | Type |
| [`parseIsoCapabilityProfile`](api/equipment-iso-capabilities.md#parseisocapabilityprofile) | Runtime |
| [`RequestedIsoSetting`](api/equipment-iso-capabilities.md#requestedisosetting) | Type |
| [`ResolvedIsoCapability`](api/equipment-iso-capabilities.md#resolvedisocapability) | Type |
| [`resolveIsoCapability`](api/equipment-iso-capabilities.md#resolveisocapability) | Runtime |
| [`ResolveIsoCapabilityInput`](api/equipment-iso-capabilities.md#resolveisocapabilityinput) | Type |

## equipment/metering-capabilities.ts

[Detailed contracts](api/equipment-metering-capabilities.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/equipment/metering-capabilities.ts)

| Export | Kind |
| --- | --- |
| [`assessExposureMeteringProfileCompatibility`](api/equipment-metering-capabilities.md#assessexposuremeteringprofilecompatibility) | Runtime |
| [`AssessExposureMeteringProfileCompatibilityInput`](api/equipment-metering-capabilities.md#assessexposuremeteringprofilecompatibilityinput) | Type |
| [`GENERIC_BODY_METERING_CAPABILITY_SCHEMA_VERSION`](api/equipment-metering-capabilities.md#generic_body_metering_capability_schema_version) | Runtime |
| [`GenericBodyMeteringCapabilityProfile`](api/equipment-metering-capabilities.md#genericbodymeteringcapabilityprofile) | Type |
| [`GenericSupportedMeteringProfile`](api/equipment-metering-capabilities.md#genericsupportedmeteringprofile) | Type |
| [`MeteringCapabilityCompatibilityAssessment`](api/equipment-metering-capabilities.md#meteringcapabilitycompatibilityassessment) | Type |
| [`MeteringCapabilityCompatibilityBlocker`](api/equipment-metering-capabilities.md#meteringcapabilitycompatibilityblocker) | Type |
| [`parseGenericBodyMeteringCapabilityProfile`](api/equipment-metering-capabilities.md#parsegenericbodymeteringcapabilityprofile) | Runtime |

## equipment/release-capabilities.ts

[Detailed contracts](api/equipment-release-capabilities.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/equipment/release-capabilities.ts)

| Export | Kind |
| --- | --- |
| [`GENERIC_RELEASE_CAPABILITY_SCHEMA_VERSION`](api/equipment-release-capabilities.md#generic_release_capability_schema_version) | Runtime |
| [`GenericExposureBracketAxis`](api/equipment-release-capabilities.md#genericexposurebracketaxis) | Type |
| [`GenericReleaseCapabilityProfile`](api/equipment-release-capabilities.md#genericreleasecapabilityprofile) | Type |
| [`GenericReleaseDriveMode`](api/equipment-release-capabilities.md#genericreleasedrivemode) | Type |
| [`parseGenericReleaseCapabilityProfile`](api/equipment-release-capabilities.md#parsegenericreleasecapabilityprofile) | Runtime |

## exposure/exposure-duration-control.ts

[Detailed contracts](api/exposure-exposure-duration-control.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/exposure/exposure-duration-control.ts)

| Export | Kind |
| --- | --- |
| [`bindResolvedExposureDurationToCaptureExposureInput`](api/exposure-exposure-duration-control.md#bindresolvedexposuredurationtocaptureexposureinput) | Runtime |
| [`BindResolvedExposureDurationToCaptureExposureInput`](api/exposure-exposure-duration-control.md#bindresolvedexposuredurationtocaptureexposureinput) | Type |
| [`EXPOSURE_DURATION_CONTROL_VERSION`](api/exposure-exposure-duration-control.md#exposure_duration_control_version) | Runtime |
| [`ExposureDurationControl`](api/exposure-exposure-duration-control.md#exposuredurationcontrol) | Type |
| [`ExposureDurationControlResolution`](api/exposure-exposure-duration-control.md#exposuredurationcontrolresolution) | Type |
| [`resolveExposureDurationControl`](api/exposure-exposure-duration-control.md#resolveexposuredurationcontrol) | Runtime |

## exposure/exposure-mode-resolver.ts

[Detailed contracts](api/exposure-exposure-mode-resolver.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/exposure/exposure-mode-resolver.ts)

| Export | Kind |
| --- | --- |
| [`AperturePriorityAutoIsoExposureModeResolution`](api/exposure-exposure-mode-resolver.md#aperturepriorityautoisoexposuremoderesolution) | Type |
| [`AperturePriorityAutoIsoPolicy`](api/exposure-exposure-mode-resolver.md#aperturepriorityautoisopolicy) | Type |
| [`AperturePriorityExposureModeResolution`](api/exposure-exposure-mode-resolver.md#aperturepriorityexposuremoderesolution) | Type |
| [`AutoIsoBaselinePolicy`](api/exposure-exposure-mode-resolver.md#autoisobaselinepolicy) | Type |
| [`EXPOSURE_MODE_RESOLVER_VERSION`](api/exposure-exposure-mode-resolver.md#exposure_mode_resolver_version) | Runtime |
| [`ExposureResolutionConstraint`](api/exposure-exposure-mode-resolver.md#exposureresolutionconstraint) | Type |
| [`ExposureTargetResidual`](api/exposure-exposure-mode-resolver.md#exposuretargetresidual) | Type |
| [`ExposureTargetResidualState`](api/exposure-exposure-mode-resolver.md#exposuretargetresidualstate) | Type |
| [`FullAutoExposureModeResolution`](api/exposure-exposure-mode-resolver.md#fullautoexposuremoderesolution) | Type |
| [`FullAutoExposurePolicy`](api/exposure-exposure-mode-resolver.md#fullautoexposurepolicy) | Type |
| [`ManualExposureModeResolution`](api/exposure-exposure-mode-resolver.md#manualexposuremoderesolution) | Type |
| [`ManualIsoControl`](api/exposure-exposure-mode-resolver.md#manualisocontrol) | Type |
| [`ProgramAutoExposureModeResolution`](api/exposure-exposure-mode-resolver.md#programautoexposuremoderesolution) | Type |
| [`ProgramAutoIsoControl`](api/exposure-exposure-mode-resolver.md#programautoisocontrol) | Type |
| [`ProgramLineSelectionDiagnostics`](api/exposure-exposure-mode-resolver.md#programlineselectiondiagnostics) | Type |
| [`RelativeExposureControlAnchor`](api/exposure-exposure-mode-resolver.md#relativeexposurecontrolanchor) | Type |
| [`resolveAperturePriorityAutoIsoExposureMode`](api/exposure-exposure-mode-resolver.md#resolveaperturepriorityautoisoexposuremode) | Runtime |
| [`ResolveAperturePriorityAutoIsoExposureModeInput`](api/exposure-exposure-mode-resolver.md#resolveaperturepriorityautoisoexposuremodeinput) | Type |
| [`resolveAperturePriorityExposureMode`](api/exposure-exposure-mode-resolver.md#resolveaperturepriorityexposuremode) | Runtime |
| [`ResolveAperturePriorityExposureModeInput`](api/exposure-exposure-mode-resolver.md#resolveaperturepriorityexposuremodeinput) | Type |
| [`resolveFullAutoExposureMode`](api/exposure-exposure-mode-resolver.md#resolvefullautoexposuremode) | Runtime |
| [`ResolveFullAutoExposureModeInput`](api/exposure-exposure-mode-resolver.md#resolvefullautoexposuremodeinput) | Type |
| [`resolveManualExposureMode`](api/exposure-exposure-mode-resolver.md#resolvemanualexposuremode) | Runtime |
| [`ResolveManualExposureModeInput`](api/exposure-exposure-mode-resolver.md#resolvemanualexposuremodeinput) | Type |
| [`resolveProgramAutoExposureMode`](api/exposure-exposure-mode-resolver.md#resolveprogramautoexposuremode) | Runtime |
| [`ResolveProgramAutoExposureModeInput`](api/exposure-exposure-mode-resolver.md#resolveprogramautoexposuremodeinput) | Type |
| [`resolveShutterPriorityExposureMode`](api/exposure-exposure-mode-resolver.md#resolveshutterpriorityexposuremode) | Runtime |
| [`ResolveShutterPriorityExposureModeInput`](api/exposure-exposure-mode-resolver.md#resolveshutterpriorityexposuremodeinput) | Type |
| [`ShutterPriorityAutoIsoPolicy`](api/exposure-exposure-mode-resolver.md#shutterpriorityautoisopolicy) | Type |
| [`ShutterPriorityExposureModeResolution`](api/exposure-exposure-mode-resolver.md#shutterpriorityexposuremoderesolution) | Type |

## exposure/exposure.ts

[Detailed contracts](api/exposure-exposure.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/exposure/exposure.ts)

| Export | Kind |
| --- | --- |
| [`calculateEquivalentIso`](api/exposure-exposure.md#calculateequivalentiso) | Runtime |
| [`CalculateEquivalentIsoInput`](api/exposure-exposure.md#calculateequivalentisoinput) | Type |
| [`calculateExposureValue100`](api/exposure-exposure.md#calculateexposurevalue100) | Runtime |
| [`CalculateExposureValue100Input`](api/exposure-exposure.md#calculateexposurevalue100input) | Type |
| [`calculateRelativeOpticalExposure`](api/exposure-exposure.md#calculaterelativeopticalexposure) | Runtime |
| [`CalculateRelativeOpticalExposureInput`](api/exposure-exposure.md#calculaterelativeopticalexposureinput) | Type |
| [`calculateRelativeRenderedExposure`](api/exposure-exposure.md#calculaterelativerenderedexposure) | Runtime |
| [`CalculateRelativeRenderedExposureInput`](api/exposure-exposure.md#calculaterelativerenderedexposureinput) | Type |
| [`RelativeOpticalExposure`](api/exposure-exposure.md#relativeopticalexposure) | Type |
| [`RelativeRenderedExposure`](api/exposure-exposure.md#relativerenderedexposure) | Type |

## exposure/flash.ts

[Detailed contracts](api/exposure-flash.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/exposure/flash.ts)

| Export | Kind |
| --- | --- |
| [`createManualFlashIlluminationOverlay`](api/exposure-flash.md#createmanualflashilluminationoverlay) | Runtime |
| [`CreateManualFlashIlluminationOverlayInput`](api/exposure-flash.md#createmanualflashilluminationoverlayinput) | Type |
| [`FLASH_SYNC_CAPABILITY_SCHEMA_VERSION`](api/exposure-flash.md#flash_sync_capability_schema_version) | Runtime |
| [`FlashSyncCapabilityProfile`](api/exposure-flash.md#flashsynccapabilityprofile) | Type |
| [`MANUAL_FLASH_PROFILE_SCHEMA_VERSION`](api/exposure-flash.md#manual_flash_profile_schema_version) | Runtime |
| [`ManualFlashIlluminationOverlay`](api/exposure-flash.md#manualflashilluminationoverlay) | Type |
| [`ManualFlashProfile`](api/exposure-flash.md#manualflashprofile) | Type |
| [`ManualFlashPulseProfile`](api/exposure-flash.md#manualflashpulseprofile) | Type |
| [`ManualFlashSyncMode`](api/exposure-flash.md#manualflashsyncmode) | Type |
| [`parseFlashSyncCapabilityProfile`](api/exposure-flash.md#parseflashsynccapabilityprofile) | Runtime |
| [`parseManualFlashProfile`](api/exposure-flash.md#parsemanualflashprofile) | Runtime |
| [`RequestedFlashSyncMode`](api/exposure-flash.md#requestedflashsyncmode) | Type |
| [`ResolvedManualFlashSync`](api/exposure-flash.md#resolvedmanualflashsync) | Type |
| [`resolveManualFlashSync`](api/exposure-flash.md#resolvemanualflashsync) | Runtime |
| [`ResolveManualFlashSyncInput`](api/exposure-flash.md#resolvemanualflashsyncinput) | Type |

## exposure/metering-scene-radiance.ts

[Detailed contracts](api/exposure-metering-scene-radiance.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/exposure/metering-scene-radiance.ts)

| Export | Kind |
| --- | --- |
| [`createSceneRadianceDerivedExposureMeteringSampleSet`](api/exposure-metering-scene-radiance.md#createsceneradiancederivedexposuremeteringsampleset) | Runtime |
| [`CreateSceneRadianceDerivedExposureMeteringSampleSetInput`](api/exposure-metering-scene-radiance.md#createsceneradiancederivedexposuremeteringsamplesetinput) | Type |
| [`parseSceneRadianceMeteringDerivationProfile`](api/exposure-metering-scene-radiance.md#parsesceneradiancemeteringderivationprofile) | Runtime |
| [`SCENE_RADIANCE_METERING_DERIVATION_SCHEMA_VERSION`](api/exposure-metering-scene-radiance.md#scene_radiance_metering_derivation_schema_version) | Runtime |
| [`SceneRadianceDerivedExposureMeteringSampleSet`](api/exposure-metering-scene-radiance.md#sceneradiancederivedexposuremeteringsampleset) | Type |
| [`SceneRadianceMeteringDerivationProfile`](api/exposure-metering-scene-radiance.md#sceneradiancemeteringderivationprofile) | Type |
| [`SceneRadianceMeteringSourceContext`](api/exposure-metering-scene-radiance.md#sceneradiancemeteringsourcecontext) | Type |
| [`SceneRadianceMeteringTemporalContext`](api/exposure-metering-scene-radiance.md#sceneradiancemeteringtemporalcontext) | Type |

## exposure/metering-target.ts

[Detailed contracts](api/exposure-metering-target.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/exposure/metering-target.ts)

| Export | Kind |
| --- | --- |
| [`createExposureMeterTargetFromMeteringResult`](api/exposure-metering-target.md#createexposuremetertargetfrommeteringresult) | Runtime |
| [`CreateExposureMeterTargetInput`](api/exposure-metering-target.md#createexposuremetertargetinput) | Type |
| [`EXPOSURE_METER_TARGET_SCHEMA_VERSION`](api/exposure-metering-target.md#exposure_meter_target_schema_version) | Runtime |
| [`ExposureMeterSnapshotIdentity`](api/exposure-metering-target.md#exposuremetersnapshotidentity) | Type |
| [`ExposureMeterTarget`](api/exposure-metering-target.md#exposuremetertarget) | Type |
| [`ExposureMeterTargetSourceKind`](api/exposure-metering-target.md#exposuremetertargetsourcekind) | Type |
| [`ExposureMeterTargetSourceResult`](api/exposure-metering-target.md#exposuremetertargetsourceresult) | Type |
| [`setExposureCompensationOnMeterTarget`](api/exposure-metering-target.md#setexposurecompensationonmetertarget) | Runtime |
| [`SetExposureCompensationOnMeterTargetInput`](api/exposure-metering-target.md#setexposurecompensationonmetertargetinput) | Type |

## exposure/metering-temporal.ts

[Detailed contracts](api/exposure-metering-temporal.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/exposure/metering-temporal.ts)

| Export | Kind |
| --- | --- |
| [`meterSceneRadianceTemporalExposure`](api/exposure-metering-temporal.md#metersceneradiancetemporalexposure) | Runtime |
| [`MeterSceneRadianceTemporalExposureInput`](api/exposure-metering-temporal.md#metersceneradiancetemporalexposureinput) | Type |
| [`SceneRadianceTemporalExposureMeteringResult`](api/exposure-metering-temporal.md#sceneradiancetemporalexposuremeteringresult) | Type |
| [`SceneRadianceTemporalMeteringSample`](api/exposure-metering-temporal.md#sceneradiancetemporalmeteringsample) | Type |

## exposure/metering.ts

[Detailed contracts](api/exposure-metering.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/exposure/metering.ts)

| Export | Kind |
| --- | --- |
| [`EXPOSURE_METERING_PROFILE_SCHEMA_VERSION`](api/exposure-metering.md#exposure_metering_profile_schema_version) | Runtime |
| [`ExposureMeteringPolicy`](api/exposure-metering.md#exposuremeteringpolicy) | Type |
| [`ExposureMeteringProfile`](api/exposure-metering.md#exposuremeteringprofile) | Type |
| [`ExposureMeteringResult`](api/exposure-metering.md#exposuremeteringresult) | Type |
| [`ExposureMeteringSampleSet`](api/exposure-metering.md#exposuremeteringsampleset) | Type |
| [`ExposureMeteringZoneSample`](api/exposure-metering.md#exposuremeteringzonesample) | Type |
| [`meterRelativeExposure`](api/exposure-metering.md#meterrelativeexposure) | Runtime |
| [`MeterRelativeExposureInput`](api/exposure-metering.md#meterrelativeexposureinput) | Type |
| [`parseExposureMeteringProfile`](api/exposure-metering.md#parseexposuremeteringprofile) | Runtime |

## exposure/program-line.ts

[Detailed contracts](api/exposure-program-line.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/exposure/program-line.ts)

| Export | Kind |
| --- | --- |
| [`EXPOSURE_PROGRAM_LINE_SCHEMA_VERSION`](api/exposure-program-line.md#exposure_program_line_schema_version) | Runtime |
| [`ExposureProgramLineNode`](api/exposure-program-line.md#exposureprogramlinenode) | Type |
| [`ExposureProgramLineProfile`](api/exposure-program-line.md#exposureprogramlineprofile) | Type |
| [`parseExposureProgramLineProfile`](api/exposure-program-line.md#parseexposureprogramlineprofile) | Runtime |

## motion/camera-rotation.ts

[Detailed contracts](api/motion-camera-rotation.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/motion/camera-rotation.ts)

| Export | Kind |
| --- | --- |
| [`AxisSamplingPitchMicrometers`](api/motion-camera-rotation.md#axissamplingpitchmicrometers) | Type |
| [`calculateCameraRotationImageMapping`](api/motion-camera-rotation.md#calculatecamerarotationimagemapping) | Runtime |
| [`CalculateCameraRotationImageMappingInput`](api/motion-camera-rotation.md#calculatecamerarotationimagemappinginput) | Type |
| [`calculateInverseCameraRotationImageMapping`](api/motion-camera-rotation.md#calculateinversecamerarotationimagemapping) | Runtime |
| [`CalculateInverseCameraRotationImageMappingInput`](api/motion-camera-rotation.md#calculateinversecamerarotationimagemappinginput) | Type |
| [`CameraAngularVelocityRadPerSec`](api/motion-camera-rotation.md#cameraangularvelocityradpersec) | Type |
| [`CameraRotationImageMapping`](api/motion-camera-rotation.md#camerarotationimagemapping) | Type |
| [`ImagePlanePointMm`](api/motion-camera-rotation.md#imageplanepointmm) | Type |
| [`InverseCameraRotationImageMapping`](api/motion-camera-rotation.md#inversecamerarotationimagemapping) | Type |

## motion/capture-rotation-inverse-mapping.ts

[Detailed contracts](api/motion-capture-rotation-inverse-mapping.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/motion/capture-rotation-inverse-mapping.ts)

| Export | Kind |
| --- | --- |
| [`calculateCaptureRotationInverseMappings`](api/motion-capture-rotation-inverse-mapping.md#calculatecapturerotationinversemappings) | Runtime |
| [`CalculateCaptureRotationInverseMappingsInput`](api/motion-capture-rotation-inverse-mapping.md#calculatecapturerotationinversemappingsinput) | Type |
| [`CaptureRotationInverseMappings`](api/motion-capture-rotation-inverse-mapping.md#capturerotationinversemappings) | Type |
| [`CaptureRotationInverseMappingSample`](api/motion-capture-rotation-inverse-mapping.md#capturerotationinversemappingsample) | Type |

## motion/capture-rotation-temporal-quadrature.ts

[Detailed contracts](api/motion-capture-rotation-temporal-quadrature.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/motion/capture-rotation-temporal-quadrature.ts)

| Export | Kind |
| --- | --- |
| [`calculateCaptureRotationTemporalQuadrature`](api/motion-capture-rotation-temporal-quadrature.md#calculatecapturerotationtemporalquadrature) | Runtime |
| [`CalculateCaptureRotationTemporalQuadratureInput`](api/motion-capture-rotation-temporal-quadrature.md#calculatecapturerotationtemporalquadratureinput) | Type |
| [`CaptureRotationTemporalQuadrature`](api/motion-capture-rotation-temporal-quadrature.md#capturerotationtemporalquadrature) | Type |
| [`CaptureRotationTemporalQuadratureNode`](api/motion-capture-rotation-temporal-quadrature.md#capturerotationtemporalquadraturenode) | Type |
| [`CaptureRotationTemporalQuadraturePoint`](api/motion-capture-rotation-temporal-quadrature.md#capturerotationtemporalquadraturepoint) | Type |

## motion/capture-rotation-trajectory.ts

[Detailed contracts](api/motion-capture-rotation-trajectory.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/motion/capture-rotation-trajectory.ts)

| Export | Kind |
| --- | --- |
| [`calculateCaptureRotationTrajectories`](api/motion-capture-rotation-trajectory.md#calculatecapturerotationtrajectories) | Runtime |
| [`CalculateCaptureRotationTrajectoriesInput`](api/motion-capture-rotation-trajectory.md#calculatecapturerotationtrajectoriesinput) | Type |
| [`CaptureRotationTrajectories`](api/motion-capture-rotation-trajectory.md#capturerotationtrajectories) | Type |
| [`CaptureRotationTrajectoryEndpoint`](api/motion-capture-rotation-trajectory.md#capturerotationtrajectoryendpoint) | Type |
| [`CaptureRotationTrajectorySample`](api/motion-capture-rotation-trajectory.md#capturerotationtrajectorysample) | Type |

## motion/capture-translation-parallax-temporal-quadrature.ts

[Detailed contracts](api/motion-capture-translation-parallax-temporal-quadrature.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/motion/capture-translation-parallax-temporal-quadrature.ts)

| Export | Kind |
| --- | --- |
| [`calculateCaptureTranslationParallaxTemporalQuadrature`](api/motion-capture-translation-parallax-temporal-quadrature.md#calculatecapturetranslationparallaxtemporalquadrature) | Runtime |
| [`CalculateCaptureTranslationParallaxTemporalQuadratureInput`](api/motion-capture-translation-parallax-temporal-quadrature.md#calculatecapturetranslationparallaxtemporalquadratureinput) | Type |
| [`CaptureTranslationParallaxSceneSample`](api/motion-capture-translation-parallax-temporal-quadrature.md#capturetranslationparallaxscenesample) | Type |
| [`CaptureTranslationParallaxTemporalNode`](api/motion-capture-translation-parallax-temporal-quadrature.md#capturetranslationparallaxtemporalnode) | Type |
| [`CaptureTranslationParallaxTemporalQuadrature`](api/motion-capture-translation-parallax-temporal-quadrature.md#capturetranslationparallaxtemporalquadrature) | Type |
| [`CaptureTranslationParallaxTemporalSample`](api/motion-capture-translation-parallax-temporal-quadrature.md#capturetranslationparallaxtemporalsample) | Type |

## motion/extended-object-projection.ts

[Detailed contracts](api/motion-extended-object-projection.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/motion/extended-object-projection.ts)

| Export | Kind |
| --- | --- |
| [`calculateCaptureExtendedObjectTemporalProjection`](api/motion-extended-object-projection.md#calculatecaptureextendedobjecttemporalprojection) | Runtime |
| [`CalculateCaptureExtendedObjectTemporalProjectionInput`](api/motion-extended-object-projection.md#calculatecaptureextendedobjecttemporalprojectioninput) | Type |
| [`calculateExtendedObjectProjectionTrajectory`](api/motion-extended-object-projection.md#calculateextendedobjectprojectiontrajectory) | Runtime |
| [`CalculateExtendedObjectProjectionTrajectoryInput`](api/motion-extended-object-projection.md#calculateextendedobjectprojectiontrajectoryinput) | Type |
| [`CaptureExtendedObjectMetricPoint`](api/motion-extended-object-projection.md#captureextendedobjectmetricpoint) | Type |
| [`CaptureExtendedObjectPointTrajectory`](api/motion-extended-object-projection.md#captureextendedobjectpointtrajectory) | Type |
| [`CaptureExtendedObjectTemporalNode`](api/motion-extended-object-projection.md#captureextendedobjecttemporalnode) | Type |
| [`CaptureExtendedObjectTemporalProjection`](api/motion-extended-object-projection.md#captureextendedobjecttemporalprojection) | Type |
| [`ExtendedObjectFrontoparallelPlaneDeclaration`](api/motion-extended-object-projection.md#extendedobjectfrontoparallelplanedeclaration) | Type |
| [`ExtendedObjectMetricPoint`](api/motion-extended-object-projection.md#extendedobjectmetricpoint) | Type |
| [`ExtendedObjectPlanarMagnificationDiagnostic`](api/motion-extended-object-projection.md#extendedobjectplanarmagnificationdiagnostic) | Type |
| [`ExtendedObjectPointProjectionTrajectory`](api/motion-extended-object-projection.md#extendedobjectpointprojectiontrajectory) | Type |
| [`ExtendedObjectProjectionNode`](api/motion-extended-object-projection.md#extendedobjectprojectionnode) | Type |
| [`ExtendedObjectProjectionTrajectory`](api/motion-extended-object-projection.md#extendedobjectprojectiontrajectory) | Type |

## motion/projected-motion.ts

[Detailed contracts](api/motion-projected-motion.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/motion/projected-motion.ts)

| Export | Kind |
| --- | --- |
| [`calculateProjectedMotionBlur`](api/motion-projected-motion.md#calculateprojectedmotionblur) | Runtime |
| [`CalculateProjectedMotionBlurInput`](api/motion-projected-motion.md#calculateprojectedmotionblurinput) | Type |
| [`ProjectedMotionBlur`](api/motion-projected-motion.md#projectedmotionblur) | Type |

## optics/aperture.ts

[Detailed contracts](api/optics-aperture.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/optics/aperture.ts)

| Export | Kind |
| --- | --- |
| [`ApertureVertex`](api/optics-aperture.md#aperturevertex) | Type |
| [`calculateIdealApertureGeometry`](api/optics-aperture.md#calculateidealaperturegeometry) | Runtime |
| [`CalculateIdealApertureInput`](api/optics-aperture.md#calculateidealapertureinput) | Type |
| [`IdealApertureGeometry`](api/optics-aperture.md#idealaperturegeometry) | Type |

## optics/circle-of-confusion.ts

[Detailed contracts](api/optics-circle-of-confusion.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/optics/circle-of-confusion.ts)

| Export | Kind |
| --- | --- |
| [`EquivalentViewingCircleOfConfusion`](api/optics-circle-of-confusion.md#equivalentviewingcircleofconfusion) | Type |
| [`estimateEquivalentViewingCircleOfConfusion`](api/optics-circle-of-confusion.md#estimateequivalentviewingcircleofconfusion) | Runtime |
| [`EstimateEquivalentViewingCircleOfConfusionInput`](api/optics-circle-of-confusion.md#estimateequivalentviewingcircleofconfusioninput) | Type |

## optics/complex-pupil-psf.ts

[Detailed contracts](api/optics-complex-pupil-psf.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/optics/complex-pupil-psf.ts)

| Export | Kind |
| --- | --- |
| [`calculateLensComplexPupilPsf`](api/optics-complex-pupil-psf.md#calculatelenscomplexpupilpsf) | Runtime |
| [`CalculateLensComplexPupilPsfInput`](api/optics-complex-pupil-psf.md#calculatelenscomplexpupilpsfinput) | Type |
| [`LENS_COMPLEX_PUPIL_PROFILE_SCHEMA_VERSION`](api/optics-complex-pupil-psf.md#lens_complex_pupil_profile_schema_version) | Runtime |
| [`LensComplexPupilGrid`](api/optics-complex-pupil-psf.md#lenscomplexpupilgrid) | Type |
| [`LensComplexPupilProfile`](api/optics-complex-pupil-psf.md#lenscomplexpupilprofile) | Type |
| [`LensComplexPupilPsf`](api/optics-complex-pupil-psf.md#lenscomplexpupilpsf) | Type |
| [`parseLensComplexPupilProfile`](api/optics-complex-pupil-psf.md#parselenscomplexpupilprofile) | Runtime |

## optics/depth-of-field.ts

[Detailed contracts](api/optics-depth-of-field.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/optics/depth-of-field.ts)

| Export | Kind |
| --- | --- |
| [`calculateDefocusCircle`](api/optics-depth-of-field.md#calculatedefocuscircle) | Runtime |
| [`CalculateDefocusCircleInput`](api/optics-depth-of-field.md#calculatedefocuscircleinput) | Type |
| [`calculateDepthOfField`](api/optics-depth-of-field.md#calculatedepthoffield) | Runtime |
| [`CalculateDepthOfFieldInput`](api/optics-depth-of-field.md#calculatedepthoffieldinput) | Type |
| [`DefocusCircle`](api/optics-depth-of-field.md#defocuscircle) | Type |
| [`DepthOfField`](api/optics-depth-of-field.md#depthoffield) | Type |

## optics/diffraction.ts

[Detailed contracts](api/optics-diffraction.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/optics/diffraction.ts)

| Export | Kind |
| --- | --- |
| [`AiryDisk`](api/optics-diffraction.md#airydisk) | Type |
| [`calculateAiryDisk`](api/optics-diffraction.md#calculateairydisk) | Runtime |
| [`CalculateAiryDiskInput`](api/optics-diffraction.md#calculateairydiskinput) | Type |

## optics/focus-breathing.ts

[Detailed contracts](api/optics-focus-breathing.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/optics/focus-breathing.ts)

| Export | Kind |
| --- | --- |
| [`calculateFocusBreathingFieldOfView`](api/optics-focus-breathing.md#calculatefocusbreathingfieldofview) | Runtime |
| [`CalculateFocusBreathingFieldOfViewInput`](api/optics-focus-breathing.md#calculatefocusbreathingfieldofviewinput) | Type |
| [`calculateFocusBreathingProjection`](api/optics-focus-breathing.md#calculatefocusbreathingprojection) | Runtime |
| [`CalculateFocusBreathingProjectionInput`](api/optics-focus-breathing.md#calculatefocusbreathingprojectioninput) | Type |
| [`FocusBreathingFieldOfView`](api/optics-focus-breathing.md#focusbreathingfieldofview) | Type |
| [`FocusBreathingProjection`](api/optics-focus-breathing.md#focusbreathingprojection) | Type |

## optics/focus-state.ts

[Detailed contracts](api/optics-focus-state.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/optics/focus-state.ts)

| Export | Kind |
| --- | --- |
| [`calculateFocusPlaneImageDistance`](api/optics-focus-state.md#calculatefocusplaneimagedistance) | Runtime |
| [`CalculateFocusPlaneImageDistanceInput`](api/optics-focus-state.md#calculatefocusplaneimagedistanceinput) | Type |
| [`FocusPlane`](api/optics-focus-state.md#focusplane) | Type |
| [`parseFocusPlane`](api/optics-focus-state.md#parsefocusplane) | Runtime |

## optics/front-of-lens-filter.ts

[Detailed contracts](api/optics-front-of-lens-filter.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/optics/front-of-lens-filter.ts)

| Export | Kind |
| --- | --- |
| [`ComposedFrontOfLensFilterTransmission`](api/optics-front-of-lens-filter.md#composedfrontoflensfiltertransmission) | Type |
| [`composeFrontOfLensFilterTransmission`](api/optics-front-of-lens-filter.md#composefrontoflensfiltertransmission) | Runtime |
| [`ComposeFrontOfLensFilterTransmissionInput`](api/optics-front-of-lens-filter.md#composefrontoflensfiltertransmissioninput) | Type |
| [`FRONT_OF_LENS_FILTER_PROFILE_SCHEMA_VERSION`](api/optics-front-of-lens-filter.md#front_of_lens_filter_profile_schema_version) | Runtime |
| [`FrontOfLensFilterProfile`](api/optics-front-of-lens-filter.md#frontoflensfilterprofile) | Type |
| [`FrontOfLensFilterScientificStatus`](api/optics-front-of-lens-filter.md#frontoflensfilterscientificstatus) | Type |
| [`FrontOfLensFilterSpectralSample`](api/optics-front-of-lens-filter.md#frontoflensfilterspectralsample) | Type |
| [`FrontOfLensFilterTransmissionModel`](api/optics-front-of-lens-filter.md#frontoflensfiltertransmissionmodel) | Type |
| [`FrontOfLensFilterUncertainty`](api/optics-front-of-lens-filter.md#frontoflensfilteruncertainty) | Type |
| [`parseFrontOfLensFilterProfile`](api/optics-front-of-lens-filter.md#parsefrontoflensfilterprofile) | Runtime |
| [`ResolvedFrontOfLensFilterTransmission`](api/optics-front-of-lens-filter.md#resolvedfrontoflensfiltertransmission) | Type |
| [`resolveFrontOfLensFilterTransmission`](api/optics-front-of-lens-filter.md#resolvefrontoflensfiltertransmission) | Runtime |
| [`ResolveFrontOfLensFilterTransmissionInput`](api/optics-front-of-lens-filter.md#resolvefrontoflensfiltertransmissioninput) | Type |

## optics/illumination-vignetting.ts

[Detailed contracts](api/optics-illumination-vignetting.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/optics/illumination-vignetting.ts)

| Export | Kind |
| --- | --- |
| [`calculateIlluminationVignetting`](api/optics-illumination-vignetting.md#calculateilluminationvignetting) | Runtime |
| [`CalculateIlluminationVignettingInput`](api/optics-illumination-vignetting.md#calculateilluminationvignettinginput) | Type |
| [`IlluminationVignetting`](api/optics-illumination-vignetting.md#illuminationvignetting) | Type |
| [`IlluminationVignettingCoefficients`](api/optics-illumination-vignetting.md#illuminationvignettingcoefficients) | Type |
| [`IlluminationVignettingProfile`](api/optics-illumination-vignetting.md#illuminationvignettingprofile) | Type |

## optics/lateral-chromatic-aberration.ts

[Detailed contracts](api/optics-lateral-chromatic-aberration.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/optics/lateral-chromatic-aberration.ts)

| Export | Kind |
| --- | --- |
| [`calculateInverseLateralChromaticAberrationMapping`](api/optics-lateral-chromatic-aberration.md#calculateinverselateralchromaticaberrationmapping) | Runtime |
| [`CalculateInverseLateralChromaticAberrationMappingInput`](api/optics-lateral-chromatic-aberration.md#calculateinverselateralchromaticaberrationmappinginput) | Type |
| [`calculateInverseLateralChromaticAberrationMappings`](api/optics-lateral-chromatic-aberration.md#calculateinverselateralchromaticaberrationmappings) | Runtime |
| [`CalculateInverseLateralChromaticAberrationMappingsInput`](api/optics-lateral-chromatic-aberration.md#calculateinverselateralchromaticaberrationmappingsinput) | Type |
| [`calculateLateralChromaticAberrationMapping`](api/optics-lateral-chromatic-aberration.md#calculatelateralchromaticaberrationmapping) | Runtime |
| [`CalculateLateralChromaticAberrationMappingInput`](api/optics-lateral-chromatic-aberration.md#calculatelateralchromaticaberrationmappinginput) | Type |
| [`ChannelSeparationVectorMm`](api/optics-lateral-chromatic-aberration.md#channelseparationvectormm) | Type |
| [`InverseLateralChromaticAberrationChannelMapping`](api/optics-lateral-chromatic-aberration.md#inverselateralchromaticaberrationchannelmapping) | Type |
| [`InverseLateralChromaticAberrationMapping`](api/optics-lateral-chromatic-aberration.md#inverselateralchromaticaberrationmapping) | Type |
| [`InverseLateralChromaticAberrationMappings`](api/optics-lateral-chromatic-aberration.md#inverselateralchromaticaberrationmappings) | Type |
| [`LateralChromaticAberrationChannel`](api/optics-lateral-chromatic-aberration.md#lateralchromaticaberrationchannel) | Type |
| [`LateralChromaticAberrationChannelMapping`](api/optics-lateral-chromatic-aberration.md#lateralchromaticaberrationchannelmapping) | Type |
| [`LateralChromaticAberrationMapping`](api/optics-lateral-chromatic-aberration.md#lateralchromaticaberrationmapping) | Type |
| [`LateralChromaticAberrationProfile`](api/optics-lateral-chromatic-aberration.md#lateralchromaticaberrationprofile) | Type |
| [`LateralChromaticAberrationSeparation`](api/optics-lateral-chromatic-aberration.md#lateralchromaticaberrationseparation) | Type |

## optics/lens-psf-profile.ts

[Detailed contracts](api/optics-lens-psf-profile.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/optics/lens-psf-profile.ts)

| Export | Kind |
| --- | --- |
| [`assessMtfOnlyPsfRenderability`](api/optics-lens-psf-profile.md#assessmtfonlypsfrenderability) | Runtime |
| [`LENS_MTF_DIAGNOSTIC_PROFILE_SCHEMA_VERSION`](api/optics-lens-psf-profile.md#lens_mtf_diagnostic_profile_schema_version) | Runtime |
| [`LENS_SAMPLED_PSF_PROFILE_SCHEMA_VERSION`](api/optics-lens-psf-profile.md#lens_sampled_psf_profile_schema_version) | Runtime |
| [`LensMtfDiagnosticProfile`](api/optics-lens-psf-profile.md#lensmtfdiagnosticprofile) | Type |
| [`LensMtfDiagnosticSample`](api/optics-lens-psf-profile.md#lensmtfdiagnosticsample) | Type |
| [`LensPsfGridAxes`](api/optics-lens-psf-profile.md#lenspsfgridaxes) | Type |
| [`LensPsfKernel`](api/optics-lens-psf-profile.md#lenspsfkernel) | Type |
| [`LensPsfScientificStatus`](api/optics-lens-psf-profile.md#lenspsfscientificstatus) | Type |
| [`LensPsfUncertainty`](api/optics-lens-psf-profile.md#lenspsfuncertainty) | Type |
| [`LensSampledPsfGridCoordinate`](api/optics-lens-psf-profile.md#lenssampledpsfgridcoordinate) | Type |
| [`LensSampledPsfGridNode`](api/optics-lens-psf-profile.md#lenssampledpsfgridnode) | Type |
| [`LensSampledPsfProfile`](api/optics-lens-psf-profile.md#lenssampledpsfprofile) | Type |
| [`MtfOnlyPsfRenderabilityAssessment`](api/optics-lens-psf-profile.md#mtfonlypsfrenderabilityassessment) | Type |
| [`parseLensMtfDiagnosticProfile`](api/optics-lens-psf-profile.md#parselensmtfdiagnosticprofile) | Runtime |
| [`parseLensSampledPsfProfile`](api/optics-lens-psf-profile.md#parselenssampledpsfprofile) | Runtime |
| [`ResolvedLensSampledPsf`](api/optics-lens-psf-profile.md#resolvedlenssampledpsf) | Type |
| [`resolveLensSampledPsf`](api/optics-lens-psf-profile.md#resolvelenssampledpsf) | Runtime |
| [`ResolveLensSampledPsfInput`](api/optics-lens-psf-profile.md#resolvelenssampledpsfinput) | Type |

## optics/polygon-diffraction.ts

[Detailed contracts](api/optics-polygon-diffraction.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/optics/polygon-diffraction.ts)

| Export | Kind |
| --- | --- |
| [`CalculateIdealPolygonDiffractionInput`](api/optics-polygon-diffraction.md#calculateidealpolygondiffractioninput) | Type |
| [`calculateIdealPolygonDiffractionPsf`](api/optics-polygon-diffraction.md#calculateidealpolygondiffractionpsf) | Runtime |
| [`IdealPolygonDiffraction`](api/optics-polygon-diffraction.md#idealpolygondiffraction) | Type |

## optics/profile-contract.ts

[Detailed contracts](api/optics-profile-contract.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/optics/profile-contract.ts)

| Export | Kind |
| --- | --- |
| [`GenericOpticalEvidence`](api/optics-profile-contract.md#genericopticalevidence) | Type |
| [`OpticalProfileState`](api/optics-profile-contract.md#opticalprofilestate) | Type |
| [`parseOpticalProfileState`](api/optics-profile-contract.md#parseopticalprofilestate) | Runtime |

## optics/psf-foundation.ts

[Detailed contracts](api/optics-psf-foundation.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/optics/psf-foundation.ts)

| Export | Kind |
| --- | --- |
| [`calculatePsfFoundationComponents`](api/optics-psf-foundation.md#calculatepsffoundationcomponents) | Runtime |
| [`CalculatePsfFoundationComponentsInput`](api/optics-psf-foundation.md#calculatepsffoundationcomponentsinput) | Type |
| [`getPsfFoundationContract`](api/optics-psf-foundation.md#getpsffoundationcontract) | Runtime |
| [`PSF_FOUNDATION_VERSION`](api/optics-psf-foundation.md#psf_foundation_version) | Runtime |
| [`PsfContributionContract`](api/optics-psf-foundation.md#psfcontributioncontract) | Type |
| [`PsfContributionId`](api/optics-psf-foundation.md#psfcontributionid) | Type |
| [`PsfContributionStatus`](api/optics-psf-foundation.md#psfcontributionstatus) | Type |
| [`PsfFoundationComponents`](api/optics-psf-foundation.md#psffoundationcomponents) | Type |
| [`PsfFoundationContract`](api/optics-psf-foundation.md#psffoundationcontract) | Type |

## optics/radial-distortion.ts

[Detailed contracts](api/optics-radial-distortion.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/optics/radial-distortion.ts)

| Export | Kind |
| --- | --- |
| [`calculateInverseRadialDistortionMapping`](api/optics-radial-distortion.md#calculateinverseradialdistortionmapping) | Runtime |
| [`CalculateInverseRadialDistortionMappingInput`](api/optics-radial-distortion.md#calculateinverseradialdistortionmappinginput) | Type |
| [`calculateInverseRadialDistortionMappings`](api/optics-radial-distortion.md#calculateinverseradialdistortionmappings) | Runtime |
| [`CalculateInverseRadialDistortionMappingsInput`](api/optics-radial-distortion.md#calculateinverseradialdistortionmappingsinput) | Type |
| [`calculateRadialDistortionMapping`](api/optics-radial-distortion.md#calculateradialdistortionmapping) | Runtime |
| [`CalculateRadialDistortionMappingInput`](api/optics-radial-distortion.md#calculateradialdistortionmappinginput) | Type |
| [`InverseRadialDistortionMapping`](api/optics-radial-distortion.md#inverseradialdistortionmapping) | Type |
| [`InverseRadialDistortionMappings`](api/optics-radial-distortion.md#inverseradialdistortionmappings) | Type |
| [`LensFieldPointMm`](api/optics-radial-distortion.md#lensfieldpointmm) | Type |
| [`RadialDistortionCoefficients`](api/optics-radial-distortion.md#radialdistortioncoefficients) | Type |
| [`RadialDistortionMapping`](api/optics-radial-distortion.md#radialdistortionmapping) | Type |
| [`RadialDistortionProfile`](api/optics-radial-distortion.md#radialdistortionprofile) | Type |

## optics/scene-to-sensor-irradiance.ts

[Detailed contracts](api/optics-scene-to-sensor-irradiance.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/optics/scene-to-sensor-irradiance.ts)

| Export | Kind |
| --- | --- |
| [`calculateSceneRadianceToSensorIrradiance`](api/optics-scene-to-sensor-irradiance.md#calculatesceneradiancetosensorirradiance) | Runtime |
| [`CalculateSceneRadianceToSensorIrradianceInput`](api/optics-scene-to-sensor-irradiance.md#calculatesceneradiancetosensorirradianceinput) | Type |
| [`NumericRange`](api/optics-scene-to-sensor-irradiance.md#numericrange) | Type |
| [`OpticalBridgeFieldThroughput`](api/optics-scene-to-sensor-irradiance.md#opticalbridgefieldthroughput) | Type |
| [`OpticalBridgeFocusApplicability`](api/optics-scene-to-sensor-irradiance.md#opticalbridgefocusapplicability) | Type |
| [`OpticalBridgeFocusContext`](api/optics-scene-to-sensor-irradiance.md#opticalbridgefocuscontext) | Type |
| [`OpticalBridgeScientificStatus`](api/optics-scene-to-sensor-irradiance.md#opticalbridgescientificstatus) | Type |
| [`OpticalBridgeUncertainty`](api/optics-scene-to-sensor-irradiance.md#opticalbridgeuncertainty) | Type |
| [`OpticalTransmissionModel`](api/optics-scene-to-sensor-irradiance.md#opticaltransmissionmodel) | Type |
| [`parseSceneToSensorIrradianceProfile`](api/optics-scene-to-sensor-irradiance.md#parsescenetosensorirradianceprofile) | Runtime |
| [`SCENE_TO_SENSOR_IRRADIANCE_PROFILE_SCHEMA_VERSION`](api/optics-scene-to-sensor-irradiance.md#scene_to_sensor_irradiance_profile_schema_version) | Runtime |
| [`SceneToSensorIrradianceProfile`](api/optics-scene-to-sensor-irradiance.md#scenetosensorirradianceprofile) | Type |
| [`SceneToSensorIrradianceResult`](api/optics-scene-to-sensor-irradiance.md#scenetosensorirradianceresult) | Type |
| [`SpectralTransmissionSample`](api/optics-scene-to-sensor-irradiance.md#spectraltransmissionsample) | Type |

## optics/scene-to-sensor-quadrature.ts

[Detailed contracts](api/optics-scene-to-sensor-quadrature.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/optics/scene-to-sensor-quadrature.ts)

| Export | Kind |
| --- | --- |
| [`calculateSceneToSensorIrradianceQuadrature`](api/optics-scene-to-sensor-quadrature.md#calculatescenetosensorirradiancequadrature) | Runtime |
| [`CalculateSceneToSensorIrradianceQuadratureInput`](api/optics-scene-to-sensor-quadrature.md#calculatescenetosensorirradiancequadratureinput) | Type |
| [`SceneSensorQuadratureSample`](api/optics-scene-to-sensor-quadrature.md#scenesensorquadraturesample) | Type |
| [`SceneToSensorIrradianceQuadrature`](api/optics-scene-to-sensor-quadrature.md#scenetosensorirradiancequadrature) | Type |

## optics/sensor-environment-query.ts

[Detailed contracts](api/optics-sensor-environment-query.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/optics/sensor-environment-query.ts)

| Export | Kind |
| --- | --- |
| [`calculateSensorEnvironmentRadianceQuery`](api/optics-sensor-environment-query.md#calculatesensorenvironmentradiancequery) | Runtime |
| [`CalculateSensorEnvironmentRadianceQueryInput`](api/optics-sensor-environment-query.md#calculatesensorenvironmentradiancequeryinput) | Type |
| [`SensorEnvironmentRadianceQuery`](api/optics-sensor-environment-query.md#sensorenvironmentradiancequery) | Type |

## optics/sensor-psf-quadrature.ts

[Detailed contracts](api/optics-sensor-psf-quadrature.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/optics/sensor-psf-quadrature.ts)

| Export | Kind |
| --- | --- |
| [`calculateSensorPsfIrradianceQuadrature`](api/optics-sensor-psf-quadrature.md#calculatesensorpsfirradiancequadrature) | Runtime |
| [`CalculateSensorPsfIrradianceQuadratureInput`](api/optics-sensor-psf-quadrature.md#calculatesensorpsfirradiancequadratureinput) | Type |
| [`SensorPsfIrradianceQuadrature`](api/optics-sensor-psf-quadrature.md#sensorpsfirradiancequadrature) | Type |
| [`SensorPsfSourceSample`](api/optics-sensor-psf-quadrature.md#sensorpsfsourcesample) | Type |

## optics/stray-light.ts

[Detailed contracts](api/optics-stray-light.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/optics/stray-light.ts)

| Export | Kind |
| --- | --- |
| [`calculateLensStrayLightIrradiance`](api/optics-stray-light.md#calculatelensstraylightirradiance) | Runtime |
| [`LensStrayLightProfile`](api/optics-stray-light.md#lensstraylightprofile) | Type |
| [`ParametricStrayLightResponse`](api/optics-stray-light.md#parametricstraylightresponse) | Type |
| [`parseLensStrayLightProfile`](api/optics-stray-light.md#parselensstraylightprofile) | Runtime |
| [`StrayLightIrradiance`](api/optics-stray-light.md#straylightirradiance) | Type |
| [`StrayLightSource`](api/optics-stray-light.md#straylightsource) | Type |

## optics/thin-lens.ts

[Detailed contracts](api/optics-thin-lens.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/optics/thin-lens.ts)

| Export | Kind |
| --- | --- |
| [`calculateThinLensImageDistance`](api/optics-thin-lens.md#calculatethinlensimagedistance) | Runtime |
| [`CalculateThinLensImageDistanceInput`](api/optics-thin-lens.md#calculatethinlensimagedistanceinput) | Type |
| [`ThinLensImageDistance`](api/optics-thin-lens.md#thinlensimagedistance) | Type |

## output/capture-corrected-sdr.ts

[Detailed contracts](api/output-capture-corrected-sdr.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/output/capture-corrected-sdr.ts)

| Export | Kind |
| --- | --- |
| [`calculateCaptureCorrectedSdr`](api/output-capture-corrected-sdr.md#calculatecapturecorrectedsdr) | Runtime |
| [`CAPTURE_CORRECTED_SDR_SCHEMA_VERSION`](api/output-capture-corrected-sdr.md#capture_corrected_sdr_schema_version) | Runtime |
| [`CaptureCorrectedSdrInput`](api/output-capture-corrected-sdr.md#capturecorrectedsdrinput) | Type |
| [`CaptureCorrectedSdrResult`](api/output-capture-corrected-sdr.md#capturecorrectedsdrresult) | Type |
| [`parseCaptureCorrectedSdrInput`](api/output-capture-corrected-sdr.md#parsecapturecorrectedsdrinput) | Runtime |

## output/capture-geometry.ts

[Detailed contracts](api/output-capture-geometry.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/output/capture-geometry.ts)

| Export | Kind |
| --- | --- |
| [`ActiveCaptureFieldOfView`](api/output-capture-geometry.md#activecapturefieldofview) | Type |
| [`calculateActiveCaptureFieldOfView`](api/output-capture-geometry.md#calculateactivecapturefieldofview) | Runtime |
| [`CalculateActiveCaptureFieldOfViewInput`](api/output-capture-geometry.md#calculateactivecapturefieldofviewinput) | Type |
| [`calculateOutputFieldOfView`](api/output-capture-geometry.md#calculateoutputfieldofview) | Runtime |
| [`CalculateOutputFieldOfViewInput`](api/output-capture-geometry.md#calculateoutputfieldofviewinput) | Type |
| [`CaptureOrientation`](api/output-capture-geometry.md#captureorientation) | Type |
| [`ImagePlaneMetricPointMm`](api/output-capture-geometry.md#imageplanemetricpointmm) | Type |
| [`mapImagePlanePointToOrientedPhysicalUv`](api/output-capture-geometry.md#mapimageplanepointtoorientedphysicaluv) | Runtime |
| [`MapImagePlanePointToOrientedPhysicalUvInput`](api/output-capture-geometry.md#mapimageplanepointtoorientedphysicaluvinput) | Type |
| [`MapOrientedPhysicalUvToImagePlaneInput`](api/output-capture-geometry.md#maporientedphysicaluvtoimageplaneinput) | Type |
| [`mapOrientedPhysicalUvToImagePlanePoint`](api/output-capture-geometry.md#maporientedphysicaluvtoimageplanepoint) | Runtime |
| [`NormalizedRasterUv`](api/output-capture-geometry.md#normalizedrasteruv) | Type |
| [`OutputFieldOfView`](api/output-capture-geometry.md#outputfieldofview) | Type |
| [`PhysicalBoundsFromOpticalAxisMm`](api/output-capture-geometry.md#physicalboundsfromopticalaxismm) | Type |
| [`RasterPoint`](api/output-capture-geometry.md#rasterpoint) | Type |
| [`RasterRect`](api/output-capture-geometry.md#rasterrect) | Type |
| [`RasterVector`](api/output-capture-geometry.md#rastervector) | Type |
| [`resolveCaptureGeometry`](api/output-capture-geometry.md#resolvecapturegeometry) | Runtime |
| [`ResolveCaptureGeometryInput`](api/output-capture-geometry.md#resolvecapturegeometryinput) | Type |
| [`ResolvedCaptureGeometry`](api/output-capture-geometry.md#resolvedcapturegeometry) | Type |
| [`transformNativeRasterPointToOriented`](api/output-capture-geometry.md#transformnativerasterpointtooriented) | Runtime |
| [`transformNativeRasterRectToOriented`](api/output-capture-geometry.md#transformnativerasterrecttooriented) | Runtime |
| [`transformNativeRasterVectorToOriented`](api/output-capture-geometry.md#transformnativerastervectortooriented) | Runtime |
| [`transformOrientedRasterPointToNative`](api/output-capture-geometry.md#transformorientedrasterpointtonative) | Runtime |
| [`transformOrientedRasterRectToNative`](api/output-capture-geometry.md#transformorientedrasterrecttonative) | Runtime |
| [`transformOrientedRasterVectorToNative`](api/output-capture-geometry.md#transformorientedrastervectortonative) | Runtime |
| [`TransformRasterPointInput`](api/output-capture-geometry.md#transformrasterpointinput) | Type |
| [`TransformRasterRectInput`](api/output-capture-geometry.md#transformrasterrectinput) | Type |
| [`TransformRasterVectorInput`](api/output-capture-geometry.md#transformrastervectorinput) | Type |

## output/capture-sdr.ts

[Detailed contracts](api/output-capture-sdr.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/output/capture-sdr.ts)

| Export | Kind |
| --- | --- |
| [`calculateCaptureSdr`](api/output-capture-sdr.md#calculatecapturesdr) | Runtime |
| [`CAPTURE_SDR_SCHEMA_VERSION`](api/output-capture-sdr.md#capture_sdr_schema_version) | Runtime |
| [`CaptureSdrInput`](api/output-capture-sdr.md#capturesdrinput) | Type |
| [`CaptureSdrResult`](api/output-capture-sdr.md#capturesdrresult) | Type |
| [`parseCaptureSdrInput`](api/output-capture-sdr.md#parsecapturesdrinput) | Runtime |

## output/crop.ts

[Detailed contracts](api/output-crop.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/output/crop.ts)

| Export | Kind |
| --- | --- |
| [`calculateCenteredCrop`](api/output-crop.md#calculatecenteredcrop) | Runtime |
| [`CalculateCenteredCropInput`](api/output-crop.md#calculatecenteredcropinput) | Type |
| [`CenteredCrop`](api/output-crop.md#centeredcrop) | Type |

## output/geometric-transforms.ts

[Detailed contracts](api/output-geometric-transforms.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/output/geometric-transforms.ts)

| Export | Kind |
| --- | --- |
| [`AffineGeometricTransform`](api/output-geometric-transforms.md#affinegeometrictransform) | Type |
| [`calculateComposedGeometricMapping`](api/output-geometric-transforms.md#calculatecomposedgeometricmapping) | Runtime |
| [`calculateForwardGeometricMapping`](api/output-geometric-transforms.md#calculateforwardgeometricmapping) | Runtime |
| [`calculateGeometricResampling`](api/output-geometric-transforms.md#calculategeometricresampling) | Runtime |
| [`calculateGeometricSamplingPlan`](api/output-geometric-transforms.md#calculategeometricsamplingplan) | Runtime |
| [`DigitalGeometricTransform`](api/output-geometric-transforms.md#digitalgeometrictransform) | Type |
| [`GeometricImageDomain`](api/output-geometric-transforms.md#geometricimagedomain) | Type |
| [`GeometricJacobian`](api/output-geometric-transforms.md#geometricjacobian) | Type |
| [`GeometricMappingPoint`](api/output-geometric-transforms.md#geometricmappingpoint) | Type |
| [`GeometricRaster`](api/output-geometric-transforms.md#geometricraster) | Type |
| [`GeometricResampler`](api/output-geometric-transforms.md#geometricresampler) | Type |
| [`GeometricSamplingPlan`](api/output-geometric-transforms.md#geometricsamplingplan) | Type |
| [`parseDigitalGeometricTransform`](api/output-geometric-transforms.md#parsedigitalgeometrictransform) | Runtime |
| [`PreparedGeometricMapping`](api/output-geometric-transforms.md#preparedgeometricmapping) | Type |
| [`prepareGeometricMapping`](api/output-geometric-transforms.md#preparegeometricmapping) | Runtime |
| [`RadialGeometricTransform`](api/output-geometric-transforms.md#radialgeometrictransform) | Type |

## output/lens-corrections.ts

[Detailed contracts](api/output-lens-corrections.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/output/lens-corrections.ts)

| Export | Kind |
| --- | --- |
| [`calculateLensCorrectedCapture`](api/output-lens-corrections.md#calculatelenscorrectedcapture) | Runtime |
| [`calculatePeripheralIlluminationCorrection`](api/output-lens-corrections.md#calculateperipheralilluminationcorrection) | Runtime |
| [`GenericLensCorrectionProfile`](api/output-lens-corrections.md#genericlenscorrectionprofile) | Type |
| [`GeometricLensCorrection`](api/output-lens-corrections.md#geometriclenscorrection) | Type |
| [`IlluminationLensCorrection`](api/output-lens-corrections.md#illuminationlenscorrection) | Type |
| [`LateralCaLensCorrection`](api/output-lens-corrections.md#lateralcalenscorrection) | Type |
| [`LensCorrectionCapture`](api/output-lens-corrections.md#lenscorrectioncapture) | Type |
| [`LensCorrectionChannel`](api/output-lens-corrections.md#lenscorrectionchannel) | Type |
| [`LensCorrectionComponent`](api/output-lens-corrections.md#lenscorrectioncomponent) | Type |
| [`parseGenericLensCorrectionProfile`](api/output-lens-corrections.md#parsegenericlenscorrectionprofile) | Runtime |
| [`ResolvedLensCorrectionPlan`](api/output-lens-corrections.md#resolvedlenscorrectionplan) | Type |
| [`resolveLensCorrectionPlan`](api/output-lens-corrections.md#resolvelenscorrectionplan) | Runtime |

## output/print-detail.ts

[Detailed contracts](api/output-print-detail.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/output/print-detail.ts)

| Export | Kind |
| --- | --- |
| [`calculatePrintRegionDetail`](api/output-print-detail.md#calculateprintregiondetail) | Runtime |
| [`MAX_PRINT_DETAIL_REGION_SAMPLES`](api/output-print-detail.md#max_print_detail_region_samples) | Runtime |
| [`parsePrintRegionDetailInput`](api/output-print-detail.md#parseprintregiondetailinput) | Runtime |
| [`PRINT_REGION_DETAIL_MODEL_VERSION`](api/output-print-detail.md#print_region_detail_model_version) | Runtime |
| [`PrintDetailRegion`](api/output-print-detail.md#printdetailregion) | Type |
| [`PrintDetailSource`](api/output-print-detail.md#printdetailsource) | Type |
| [`PrintRegionDetailAssessment`](api/output-print-detail.md#printregiondetailassessment) | Type |
| [`PrintRegionDetailInput`](api/output-print-detail.md#printregiondetailinput) | Type |
| [`PrintSinusoidalMeasurement`](api/output-print-detail.md#printsinusoidalmeasurement) | Type |
| [`PrintSinusoidalTarget`](api/output-print-detail.md#printsinusoidaltarget) | Type |

## output/print-plan.ts

[Detailed contracts](api/output-print-plan.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/output/print-plan.ts)

| Export | Kind |
| --- | --- |
| [`calculatePrintPlan`](api/output-print-plan.md#calculateprintplan) | Runtime |
| [`calculatePrintSizeLimit`](api/output-print-plan.md#calculateprintsizelimit) | Runtime |
| [`parsePrintPlanInput`](api/output-print-plan.md#parseprintplaninput) | Runtime |
| [`PrintedImageSize`](api/output-print-plan.md#printedimagesize) | Type |
| [`PrintLength`](api/output-print-plan.md#printlength) | Type |
| [`PrintNativeSource`](api/output-print-plan.md#printnativesource) | Type |
| [`PrintPlan`](api/output-print-plan.md#printplan) | Type |
| [`PrintPlanInput`](api/output-print-plan.md#printplaninput) | Type |
| [`PrintProviderConstraints`](api/output-print-plan.md#printproviderconstraints) | Type |
| [`PrintRasterSampling`](api/output-print-plan.md#printrastersampling) | Type |
| [`PrintSamplingCriterion`](api/output-print-plan.md#printsamplingcriterion) | Type |
| [`PrintSizeLimit`](api/output-print-plan.md#printsizelimit) | Type |
| [`PrintSizeLimitInput`](api/output-print-plan.md#printsizelimitinput) | Type |

## output/sdr-rendering.ts

[Detailed contracts](api/output-sdr-rendering.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/output/sdr-rendering.ts)

| Export | Kind |
| --- | --- |
| [`calculateSdrRendering`](api/output-sdr-rendering.md#calculatesdrrendering) | Runtime |
| [`parseSdrRenderingInput`](api/output-sdr-rendering.md#parsesdrrenderinginput) | Runtime |
| [`parseSdrRenderingProfile`](api/output-sdr-rendering.md#parsesdrrenderingprofile) | Runtime |
| [`SDR_RENDERING_SCHEMA_VERSION`](api/output-sdr-rendering.md#sdr_rendering_schema_version) | Runtime |
| [`SdrRenderingInput`](api/output-sdr-rendering.md#sdrrenderinginput) | Type |
| [`SdrRenderingProfile`](api/output-sdr-rendering.md#sdrrenderingprofile) | Type |
| [`SdrRenderingResult`](api/output-sdr-rendering.md#sdrrenderingresult) | Type |

## output/subject-framing-crop.ts

[Detailed contracts](api/output-subject-framing-crop.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/output/subject-framing-crop.ts)

| Export | Kind |
| --- | --- |
| [`calculateSubjectFramingCrop`](api/output-subject-framing-crop.md#calculatesubjectframingcrop) | Runtime |
| [`CalculateSubjectFramingCropInput`](api/output-subject-framing-crop.md#calculatesubjectframingcropinput) | Type |
| [`SubjectFramingCrop`](api/output-subject-framing-crop.md#subjectframingcrop) | Type |

## schema/camera.ts

[Detailed contracts](api/schema-camera.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/schema/camera.ts)

| Export | Kind |
| --- | --- |
| [`CameraConfiguration`](api/schema-camera.md#cameraconfiguration) | Type |
| [`CameraSupport`](api/schema-camera.md#camerasupport) | Type |
| [`ExposureConfiguration`](api/schema-camera.md#exposureconfiguration) | Type |
| [`FocusConfiguration`](api/schema-camera.md#focusconfiguration) | Type |
| [`LensConfiguration`](api/schema-camera.md#lensconfiguration) | Type |
| [`SensorConfiguration`](api/schema-camera.md#sensorconfiguration) | Type |
| [`StabilizationConfiguration`](api/schema-camera.md#stabilizationconfiguration) | Type |

## schema/illumination-spectral.ts

[Detailed contracts](api/schema-illumination-spectral.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/schema/illumination-spectral.ts)

| Export | Kind |
| --- | --- |
| [`createSceneIlluminationSpectralCoverageParticipant`](api/schema-illumination-spectral.md#createsceneilluminationspectralcoverageparticipant) | Runtime |
| [`CreateSceneIlluminationSpectralCoverageParticipantInput`](api/schema-illumination-spectral.md#createsceneilluminationspectralcoverageparticipantinput) | Type |
| [`resolveSceneIlluminationDiscreteLineMeasure`](api/schema-illumination-spectral.md#resolvesceneilluminationdiscretelinemeasure) | Runtime |
| [`SceneIlluminationDiscreteLineMeasure`](api/schema-illumination-spectral.md#sceneilluminationdiscretelinemeasure) | Type |

## schema/illumination-temporal.ts

[Detailed contracts](api/schema-illumination-temporal.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/schema/illumination-temporal.ts)

| Export | Kind |
| --- | --- |
| [`evaluateSceneIlluminationTemporalMultiplier`](api/schema-illumination-temporal.md#evaluatesceneilluminationtemporalmultiplier) | Runtime |
| [`EvaluateSceneIlluminationTemporalMultiplierInput`](api/schema-illumination-temporal.md#evaluatesceneilluminationtemporalmultiplierinput) | Type |
| [`IntegrateSceneIlluminationTemporalMultiplierInput`](api/schema-illumination-temporal.md#integratesceneilluminationtemporalmultiplierinput) | Type |
| [`integrateSceneIlluminationTemporalMultiplierOverExposureWindow`](api/schema-illumination-temporal.md#integratesceneilluminationtemporalmultiplieroverexposurewindow) | Runtime |
| [`parseSceneIlluminationTemporalProfile`](api/schema-illumination-temporal.md#parsesceneilluminationtemporalprofile) | Runtime |
| [`SCENE_ILLUMINATION_TEMPORAL_PROFILE_SCHEMA_VERSION`](api/schema-illumination-temporal.md#scene_illumination_temporal_profile_schema_version) | Runtime |
| [`SceneIlluminationTemporalExposureIntegration`](api/schema-illumination-temporal.md#sceneilluminationtemporalexposureintegration) | Type |
| [`SceneIlluminationTemporalIntegrationNode`](api/schema-illumination-temporal.md#sceneilluminationtemporalintegrationnode) | Type |
| [`SceneIlluminationTemporalMultiplierEvaluation`](api/schema-illumination-temporal.md#sceneilluminationtemporalmultiplierevaluation) | Type |
| [`SceneIlluminationTemporalProfile`](api/schema-illumination-temporal.md#sceneilluminationtemporalprofile) | Type |
| [`SceneIlluminationTemporalRegistrationUncertainty`](api/schema-illumination-temporal.md#sceneilluminationtemporalregistrationuncertainty) | Type |
| [`SceneIlluminationTemporalScientificStatus`](api/schema-illumination-temporal.md#sceneilluminationtemporalscientificstatus) | Type |
| [`SceneIlluminationTemporalSourceBinding`](api/schema-illumination-temporal.md#sceneilluminationtemporalsourcebinding) | Type |
| [`SceneIlluminationTemporalWaveform`](api/schema-illumination-temporal.md#sceneilluminationtemporalwaveform) | Type |
| [`SceneIlluminationTemporalWaveformSample`](api/schema-illumination-temporal.md#sceneilluminationtemporalwaveformsample) | Type |

## schema/illumination.ts

[Detailed contracts](api/schema-illumination.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/schema/illumination.ts)

| Export | Kind |
| --- | --- |
| [`parseSceneIlluminationProfile`](api/schema-illumination.md#parsesceneilluminationprofile) | Runtime |
| [`SCENE_ILLUMINATION_PROFILE_SCHEMA_VERSION`](api/schema-illumination.md#scene_illumination_profile_schema_version) | Runtime |
| [`SceneIlluminationMagnitude`](api/schema-illumination.md#sceneilluminationmagnitude) | Type |
| [`SceneIlluminationProfile`](api/schema-illumination.md#sceneilluminationprofile) | Type |
| [`SceneIlluminationRelativeSpectrumSample`](api/schema-illumination.md#sceneilluminationrelativespectrumsample) | Type |
| [`SceneIlluminationScientificStatus`](api/schema-illumination.md#sceneilluminationscientificstatus) | Type |
| [`SceneIlluminationSource`](api/schema-illumination.md#sceneilluminationsource) | Type |
| [`SceneIlluminationSourceFamily`](api/schema-illumination.md#sceneilluminationsourcefamily) | Type |
| [`SceneIlluminationSourceGeometry`](api/schema-illumination.md#sceneilluminationsourcegeometry) | Type |
| [`SceneIlluminationSpectrum`](api/schema-illumination.md#sceneilluminationspectrum) | Type |
| [`SceneIlluminationUncertainty`](api/schema-illumination.md#sceneilluminationuncertainty) | Type |

## schema/scene-radiance-temporal.ts

[Detailed contracts](api/schema-scene-radiance-temporal.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/schema/scene-radiance-temporal.ts)

| Export | Kind |
| --- | --- |
| [`createSceneRadianceTemporalSamplingPlan`](api/schema-scene-radiance-temporal.md#createsceneradiancetemporalsamplingplan) | Runtime |
| [`CreateSceneRadianceTemporalSamplingPlanInput`](api/schema-scene-radiance-temporal.md#createsceneradiancetemporalsamplingplaninput) | Type |
| [`ReducedSceneRadianceTemporalExposure`](api/schema-scene-radiance-temporal.md#reducedsceneradiancetemporalexposure) | Type |
| [`reduceSceneRadianceTemporalSamples`](api/schema-scene-radiance-temporal.md#reducesceneradiancetemporalsamples) | Runtime |
| [`ReduceSceneRadianceTemporalSamplesInput`](api/schema-scene-radiance-temporal.md#reducesceneradiancetemporalsamplesinput) | Type |
| [`SCENE_RADIANCE_TEMPORAL_SAMPLING_PLAN_VERSION`](api/schema-scene-radiance-temporal.md#scene_radiance_temporal_sampling_plan_version) | Runtime |
| [`SceneRadianceTemporalEvaluatedSample`](api/schema-scene-radiance-temporal.md#sceneradiancetemporalevaluatedsample) | Type |
| [`SceneRadianceTemporalQuery`](api/schema-scene-radiance-temporal.md#sceneradiancetemporalquery) | Type |
| [`SceneRadianceTemporalSamplingNode`](api/schema-scene-radiance-temporal.md#sceneradiancetemporalsamplingnode) | Type |
| [`SceneRadianceTemporalSamplingPlan`](api/schema-scene-radiance-temporal.md#sceneradiancetemporalsamplingplan) | Type |

## schema/scene-radiance.ts

[Detailed contracts](api/schema-scene-radiance.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/schema/scene-radiance.ts)

| Export | Kind |
| --- | --- |
| [`assessSceneMaterialResponseFidelity`](api/schema-scene-radiance.md#assessscenematerialresponsefidelity) | Runtime |
| [`parseSceneMaterialResponseProfile`](api/schema-scene-radiance.md#parsescenematerialresponseprofile) | Runtime |
| [`parseSceneRadianceEvaluationRequest`](api/schema-scene-radiance.md#parsesceneradianceevaluationrequest) | Runtime |
| [`parseSceneRadianceEvaluationResult`](api/schema-scene-radiance.md#parsesceneradianceevaluationresult) | Runtime |
| [`parseSceneRadianceProviderProfile`](api/schema-scene-radiance.md#parsesceneradianceproviderprofile) | Runtime |
| [`SCENE_MATERIAL_RESPONSE_PROFILE_SCHEMA_VERSION`](api/schema-scene-radiance.md#scene_material_response_profile_schema_version) | Runtime |
| [`SCENE_RADIANCE_EVALUATION_SCHEMA_VERSION`](api/schema-scene-radiance.md#scene_radiance_evaluation_schema_version) | Runtime |
| [`SCENE_RADIANCE_PROVIDER_PROFILE_SCHEMA_VERSION`](api/schema-scene-radiance.md#scene_radiance_provider_profile_schema_version) | Runtime |
| [`SceneMaterialResponseDefinition`](api/schema-scene-radiance.md#scenematerialresponsedefinition) | Type |
| [`SceneMaterialResponseFidelity`](api/schema-scene-radiance.md#scenematerialresponsefidelity) | Type |
| [`SceneMaterialResponseProfile`](api/schema-scene-radiance.md#scenematerialresponseprofile) | Type |
| [`SceneMaterialResponseRepresentation`](api/schema-scene-radiance.md#scenematerialresponserepresentation) | Type |
| [`SceneRadianceDataArtifactReference`](api/schema-scene-radiance.md#sceneradiancedataartifactreference) | Type |
| [`SceneRadianceEvaluationBindingAssessment`](api/schema-scene-radiance.md#sceneradianceevaluationbindingassessment) | Type |
| [`SceneRadianceEvaluationRequest`](api/schema-scene-radiance.md#sceneradianceevaluationrequest) | Type |
| [`SceneRadianceEvaluationResult`](api/schema-scene-radiance.md#sceneradianceevaluationresult) | Type |
| [`SceneRadianceEvaluationTarget`](api/schema-scene-radiance.md#sceneradianceevaluationtarget) | Type |
| [`SceneRadianceProviderProfile`](api/schema-scene-radiance.md#sceneradianceproviderprofile) | Type |
| [`SceneRadianceProviderSpectralFidelity`](api/schema-scene-radiance.md#sceneradianceproviderspectralfidelity) | Type |
| [`SceneRadianceProviderTransportFidelity`](api/schema-scene-radiance.md#sceneradianceprovidertransportfidelity) | Type |
| [`SceneRadianceProviderVisibilityFidelity`](api/schema-scene-radiance.md#sceneradianceprovidervisibilityfidelity) | Type |
| [`SceneRadianceScientificStatus`](api/schema-scene-radiance.md#sceneradiancescientificstatus) | Type |
| [`SceneRadianceUncertainty`](api/schema-scene-radiance.md#sceneradianceuncertainty) | Type |
| [`validateSceneRadianceEvaluationBindings`](api/schema-scene-radiance.md#validatesceneradianceevaluationbindings) | Runtime |
| [`ValidateSceneRadianceEvaluationBindingsInput`](api/schema-scene-radiance.md#validatesceneradianceevaluationbindingsinput) | Type |

## schema/scene.ts

[Detailed contracts](api/schema-scene.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/schema/scene.ts)

| Export | Kind |
| --- | --- |
| [`SceneCapability`](api/schema-scene.md#scenecapability) | Type |
| [`SceneDefinition`](api/schema-scene.md#scenedefinition) | Type |
| [`SceneMotion`](api/schema-scene.md#scenemotion) | Type |
| [`SceneObject`](api/schema-scene.md#sceneobject) | Type |
| [`SceneRadiometry`](api/schema-scene.md#sceneradiometry) | Type |
| [`Vector3`](api/schema-scene.md#vector3) | Type |

## schema/validation.ts

[Detailed contracts](api/schema-validation.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/schema/validation.ts)

| Export | Kind |
| --- | --- |
| [`parseCameraConfiguration`](api/schema-validation.md#parsecameraconfiguration) | Runtime |
| [`parseSceneDefinition`](api/schema-validation.md#parsescenedefinition) | Runtime |

## sensor/accumulated-charge.ts

[Detailed contracts](api/sensor-accumulated-charge.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/sensor/accumulated-charge.ts)

| Export | Kind |
| --- | --- |
| [`composeSensorAccumulatedCharge`](api/sensor-accumulated-charge.md#composesensoraccumulatedcharge) | Runtime |
| [`ComposeSensorAccumulatedChargeInput`](api/sensor-accumulated-charge.md#composesensoraccumulatedchargeinput) | Type |
| [`ComposeSensorPhotoAccumulatedChargeInput`](api/sensor-accumulated-charge.md#composesensorphotoaccumulatedchargeinput) | Type |
| [`parseSensorAccumulatedChargeCompletenessProfile`](api/sensor-accumulated-charge.md#parsesensoraccumulatedchargecompletenessprofile) | Runtime |
| [`parseSensorAdditionalStoredChargeComponent`](api/sensor-accumulated-charge.md#parsesensoradditionalstoredchargecomponent) | Runtime |
| [`SensorAccumulatedChargeCompletenessProfile`](api/sensor-accumulated-charge.md#sensoraccumulatedchargecompletenessprofile) | Type |
| [`SensorAccumulatedChargeComposition`](api/sensor-accumulated-charge.md#sensoraccumulatedchargecomposition) | Type |
| [`SensorAdditionalStoredChargeComponent`](api/sensor-accumulated-charge.md#sensoradditionalstoredchargecomponent) | Type |
| [`SensorAdditionalStoredChargeKind`](api/sensor-accumulated-charge.md#sensoradditionalstoredchargekind) | Type |
| [`SensorPhotoAccumulatedChargeComposition`](api/sensor-accumulated-charge.md#sensorphotoaccumulatedchargecomposition) | Type |

## sensor/architecture.ts

[Detailed contracts](api/sensor-architecture.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/sensor/architecture.ts)

| Export | Kind |
| --- | --- |
| [`parseSensorArchitectureProfile`](api/sensor-architecture.md#parsesensorarchitectureprofile) | Runtime |
| [`SENSOR_ARCHITECTURE_PROFILE_SCHEMA_VERSION`](api/sensor-architecture.md#sensor_architecture_profile_schema_version) | Runtime |
| [`SensorArchitectureFactProvenance`](api/sensor-architecture.md#sensorarchitecturefactprovenance) | Type |
| [`SensorArchitectureProfile`](api/sensor-architecture.md#sensorarchitectureprofile) | Type |
| [`SensorArchitectureProfileV0_2`](api/sensor-architecture.md#sensorarchitectureprofilev0_2) | Type |
| [`SensorArchitectureProfileV0_3`](api/sensor-architecture.md#sensorarchitectureprofilev0_3) | Type |
| [`SensorArchitectureReuseStatus`](api/sensor-architecture.md#sensorarchitecturereusestatus) | Type |
| [`SensorArchitectureSourceKind`](api/sensor-architecture.md#sensorarchitecturesourcekind) | Type |
| [`SensorColorSamplingFamily`](api/sensor-architecture.md#sensorcolorsamplingfamily) | Type |
| [`SensorIlluminationArchitecture`](api/sensor-architecture.md#sensorilluminationarchitecture) | Type |
| [`SensorIntegrationArchitecture`](api/sensor-architecture.md#sensorintegrationarchitecture) | Type |
| [`SensorReadoutArchitecture`](api/sensor-architecture.md#sensorreadoutarchitecture) | Type |
| [`SensorTechnologyFamily`](api/sensor-architecture.md#sensortechnologyfamily) | Type |
| [`SourcedSensorArchitectureFact`](api/sensor-architecture.md#sourcedsensorarchitecturefact) | Type |

## sensor/camera-saturation-capacity.ts

[Detailed contracts](api/sensor-camera-saturation-capacity.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/sensor/camera-saturation-capacity.ts)

| Export | Kind |
| --- | --- |
| [`assessSensorCameraSaturationCapacity`](api/sensor-camera-saturation-capacity.md#assesssensorcamerasaturationcapacity) | Runtime |
| [`AssessSensorCameraSaturationCapacityInput`](api/sensor-camera-saturation-capacity.md#assesssensorcamerasaturationcapacityinput) | Type |
| [`parseSensorCameraSaturationCapacityProfile`](api/sensor-camera-saturation-capacity.md#parsesensorcamerasaturationcapacityprofile) | Runtime |
| [`SensorCameraSaturationCapacityAssessment`](api/sensor-camera-saturation-capacity.md#sensorcamerasaturationcapacityassessment) | Type |
| [`SensorCameraSaturationCapacityProfile`](api/sensor-camera-saturation-capacity.md#sensorcamerasaturationcapacityprofile) | Type |
| [`SensorCameraSaturationSiteApplicability`](api/sensor-camera-saturation-capacity.md#sensorcamerasaturationsiteapplicability) | Type |
| [`SensorCameraSaturationTemperatureApplicability`](api/sensor-camera-saturation-capacity.md#sensorcamerasaturationtemperatureapplicability) | Type |

## sensor/capture-color-sampling-binding.ts

[Detailed contracts](api/sensor-capture-color-sampling-binding.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/sensor/capture-color-sampling-binding.ts)

| Export | Kind |
| --- | --- |
| [`CaptureModeFullFrameSampleIndex`](api/sensor-capture-color-sampling-binding.md#capturemodefullframesampleindex) | Type |
| [`ColorSamplingChannelComposition`](api/sensor-capture-color-sampling-binding.md#colorsamplingchannelcomposition) | Type |
| [`ColorSamplingChannelSiteCount`](api/sensor-capture-color-sampling-binding.md#colorsamplingchannelsitecount) | Type |
| [`ColorSamplingSiteGridDimensions`](api/sensor-capture-color-sampling-binding.md#colorsamplingsitegriddimensions) | Type |
| [`ColorSamplingSiteRect`](api/sensor-capture-color-sampling-binding.md#colorsamplingsiterect) | Type |
| [`GroupedCaptureModeSamplingAnchorDeclaration`](api/sensor-capture-color-sampling-binding.md#groupedcapturemodesamplinganchordeclaration) | Type |
| [`NativeEffectiveRasterColorSamplingBindingProfile`](api/sensor-capture-color-sampling-binding.md#nativeeffectiverastercolorsamplingbindingprofile) | Type |
| [`NativeEffectiveSampleRect`](api/sensor-capture-color-sampling-binding.md#nativeeffectivesamplerect) | Type |
| [`parseNativeEffectiveRasterColorSamplingBindingProfile`](api/sensor-capture-color-sampling-binding.md#parsenativeeffectiverastercolorsamplingbindingprofile) | Runtime |
| [`resolveCaptureModeColorSamplingContributors`](api/sensor-capture-color-sampling-binding.md#resolvecapturemodecolorsamplingcontributors) | Runtime |
| [`ResolveCaptureModeColorSamplingContributorsInput`](api/sensor-capture-color-sampling-binding.md#resolvecapturemodecolorsamplingcontributorsinput) | Type |
| [`ResolvedCaptureModeColorSamplingContributors`](api/sensor-capture-color-sampling-binding.md#resolvedcapturemodecolorsamplingcontributors) | Type |
| [`ResolvedNativeEffectiveRasterColorSamplingBinding`](api/sensor-capture-color-sampling-binding.md#resolvednativeeffectiverastercolorsamplingbinding) | Type |
| [`resolveNativeEffectiveRasterColorSamplingBinding`](api/sensor-capture-color-sampling-binding.md#resolvenativeeffectiverastercolorsamplingbinding) | Runtime |

## sensor/capture-mode-timing.ts

[Detailed contracts](api/sensor-capture-mode-timing.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/sensor/capture-mode-timing.ts)

| Export | Kind |
| --- | --- |
| [`CAPTURE_MODE_TIMING_PROFILE_SCHEMA_VERSION`](api/sensor-capture-mode-timing.md#capture_mode_timing_profile_schema_version) | Runtime |
| [`CaptureModeTimingProfile`](api/sensor-capture-mode-timing.md#capturemodetimingprofile) | Type |
| [`parseCaptureModeTimingProfile`](api/sensor-capture-mode-timing.md#parsecapturemodetimingprofile) | Runtime |
| [`resolveCaptureModeTiming`](api/sensor-capture-mode-timing.md#resolvecapturemodetiming) | Runtime |
| [`ResolveCaptureModeTimingInput`](api/sensor-capture-mode-timing.md#resolvecapturemodetiminginput) | Type |
| [`ResolvedCaptureModeTiming`](api/sensor-capture-mode-timing.md#resolvedcapturemodetiming) | Type |

## sensor/capture-mode.ts

[Detailed contracts](api/sensor-capture-mode.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/sensor/capture-mode.ts)

| Export | Kind |
| --- | --- |
| [`CaptureModeAcquisition`](api/sensor-capture-mode.md#capturemodeacquisition) | Type |
| [`CaptureModeDefinition`](api/sensor-capture-mode.md#capturemodedefinition) | Type |
| [`CaptureModeDependency`](api/sensor-capture-mode.md#capturemodedependency) | Type |
| [`CaptureModePerFrameSampling`](api/sensor-capture-mode.md#capturemodeperframesampling) | Type |
| [`CaptureModeProfile`](api/sensor-capture-mode.md#capturemodeprofile) | Type |
| [`CaptureModeReconstructionStage`](api/sensor-capture-mode.md#capturemodereconstructionstage) | Type |
| [`CaptureModeSampleCombinationDomain`](api/sensor-capture-mode.md#capturemodesamplecombinationdomain) | Type |
| [`CaptureModeSensorOffsetNativeSamples`](api/sensor-capture-mode.md#capturemodesensoroffsetnativesamples) | Type |
| [`DeclaredEffectiveCaptureSampling`](api/sensor-capture-mode.md#declaredeffectivecapturesampling) | Type |
| [`FixedMultiFrameCaptureAcquisition`](api/sensor-capture-mode.md#fixedmultiframecaptureacquisition) | Type |
| [`GroupedNativeCaptureSampling`](api/sensor-capture-mode.md#groupednativecapturesampling) | Type |
| [`NativeEffectiveCaptureSampling`](api/sensor-capture-mode.md#nativeeffectivecapturesampling) | Type |
| [`parseCaptureModeProfile`](api/sensor-capture-mode.md#parsecapturemodeprofile) | Runtime |
| [`resolveCaptureMode`](api/sensor-capture-mode.md#resolvecapturemode) | Runtime |
| [`ResolveCaptureModeInput`](api/sensor-capture-mode.md#resolvecapturemodeinput) | Type |
| [`ResolvedCaptureMode`](api/sensor-capture-mode.md#resolvedcapturemode) | Type |
| [`SingleFrameCaptureAcquisition`](api/sensor-capture-mode.md#singleframecaptureacquisition) | Type |
| [`SourcedCaptureModeFact`](api/sensor-capture-mode.md#sourcedcapturemodefact) | Type |
| [`VariableMultiFrameCaptureAcquisition`](api/sensor-capture-mode.md#variablemultiframecaptureacquisition) | Type |

## sensor/color-sampling.ts

[Detailed contracts](api/sensor-color-sampling.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/sensor/color-sampling.ts)

| Export | Kind |
| --- | --- |
| [`LayeredColorSamplingLayout`](api/sensor-color-sampling.md#layeredcolorsamplinglayout) | Type |
| [`MonochromeColorSamplingLayout`](api/sensor-color-sampling.md#monochromecolorsamplinglayout) | Type |
| [`NativeColorSamplingSiteCoordinateSystem`](api/sensor-color-sampling.md#nativecolorsamplingsitecoordinatesystem) | Type |
| [`NativeColorSamplingSiteIndex`](api/sensor-color-sampling.md#nativecolorsamplingsiteindex) | Type |
| [`parseSensorColorSamplingProfile`](api/sensor-color-sampling.md#parsesensorcolorsamplingprofile) | Runtime |
| [`PeriodicMosaicColorSamplingLayout`](api/sensor-color-sampling.md#periodicmosaiccolorsamplinglayout) | Type |
| [`resolveColorSamplingSite`](api/sensor-color-sampling.md#resolvecolorsamplingsite) | Runtime |
| [`ResolveColorSamplingSiteInput`](api/sensor-color-sampling.md#resolvecolorsamplingsiteinput) | Type |
| [`ResolvedColorSamplingSite`](api/sensor-color-sampling.md#resolvedcolorsamplingsite) | Type |
| [`SensorColorSamplingLayout`](api/sensor-color-sampling.md#sensorcolorsamplinglayout) | Type |
| [`SensorColorSamplingProfile`](api/sensor-color-sampling.md#sensorcolorsamplingprofile) | Type |
| [`SensorColorSamplingProfileCoordinateSystem`](api/sensor-color-sampling.md#sensorcolorsamplingprofilecoordinatesystem) | Type |

## sensor/constant-rate-temporal-integration.ts

[Detailed contracts](api/sensor-constant-rate-temporal-integration.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/sensor/constant-rate-temporal-integration.ts)

| Export | Kind |
| --- | --- |
| [`IntegrateStationarySensorRateInput`](api/sensor-constant-rate-temporal-integration.md#integratestationarysensorrateinput) | Type |
| [`integrateStationarySensorRateOverLocalExposure`](api/sensor-constant-rate-temporal-integration.md#integratestationarysensorrateoverlocalexposure) | Runtime |
| [`parseSensorRateTemporalStationarityProfile`](api/sensor-constant-rate-temporal-integration.md#parsesensorratetemporalstationarityprofile) | Runtime |
| [`SensorEqeExposureIntegration`](api/sensor-constant-rate-temporal-integration.md#sensoreqeexposureintegration) | Type |
| [`SensorRateStationarityStatus`](api/sensor-constant-rate-temporal-integration.md#sensorratestationaritystatus) | Type |
| [`SensorRateTemporalStationarityProfile`](api/sensor-constant-rate-temporal-integration.md#sensorratetemporalstationarityprofile) | Type |
| [`SensorResponsivityExposureIntegration`](api/sensor-constant-rate-temporal-integration.md#sensorresponsivityexposureintegration) | Type |
| [`SensorStationaryRateExposureIntegration`](api/sensor-constant-rate-temporal-integration.md#sensorstationaryrateexposureintegration) | Type |

## sensor/dark-current.ts

[Detailed contracts](api/sensor-dark-current.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/sensor/dark-current.ts)

| Export | Kind |
| --- | --- |
| [`calculateSensorDarkCurrentCharge`](api/sensor-dark-current.md#calculatesensordarkcurrentcharge) | Runtime |
| [`CalculateSensorDarkCurrentChargeInput`](api/sensor-dark-current.md#calculatesensordarkcurrentchargeinput) | Type |
| [`parseSensorDarkCurrentProfile`](api/sensor-dark-current.md#parsesensordarkcurrentprofile) | Runtime |
| [`SensorDarkCurrentCharge`](api/sensor-dark-current.md#sensordarkcurrentcharge) | Type |
| [`SensorDarkCurrentProfile`](api/sensor-dark-current.md#sensordarkcurrentprofile) | Type |
| [`SensorDarkCurrentSiteApplicability`](api/sensor-dark-current.md#sensordarkcurrentsiteapplicability) | Type |
| [`SensorDarkCurrentTemperatureModel`](api/sensor-dark-current.md#sensordarkcurrenttemperaturemodel) | Type |
| [`SensorPhotoDarkCurrentCharge`](api/sensor-dark-current.md#sensorphotodarkcurrentcharge) | Type |
| [`SensorTemporalDarkCurrentCharge`](api/sensor-dark-current.md#sensortemporaldarkcurrentcharge) | Type |

## sensor/environment-photo-signal.ts

[Detailed contracts](api/sensor-environment-photo-signal.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/sensor/environment-photo-signal.ts)

| Export | Kind |
| --- | --- |
| [`calculateEnvironmentSensorPhotoSignal`](api/sensor-environment-photo-signal.md#calculateenvironmentsensorphotosignal) | Runtime |
| [`CalculateEnvironmentSensorPhotoSignalInput`](api/sensor-environment-photo-signal.md#calculateenvironmentsensorphotosignalinput) | Type |
| [`EnvironmentRadianceEvaluator`](api/sensor-environment-photo-signal.md#environmentradianceevaluator) | Type |
| [`EnvironmentSensorPhotoSignal`](api/sensor-environment-photo-signal.md#environmentsensorphotosignal) | Type |

## sensor/eqe-electron-rate.ts

[Detailed contracts](api/sensor-eqe-electron-rate.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/sensor/eqe-electron-rate.ts)

| Export | Kind |
| --- | --- |
| [`calculateSensorEqeElectronRate`](api/sensor-eqe-electron-rate.md#calculatesensoreqeelectronrate) | Runtime |
| [`CalculateSensorEqeElectronRateInput`](api/sensor-eqe-electron-rate.md#calculatesensoreqeelectronrateinput) | Type |
| [`SensorEqeAirPhotonEnergyContext`](api/sensor-eqe-electron-rate.md#sensoreqeairphotonenergycontext) | Type |
| [`SensorEqeAirRefractiveIndexSample`](api/sensor-eqe-electron-rate.md#sensoreqeairrefractiveindexsample) | Type |
| [`SensorEqeElectronRate`](api/sensor-eqe-electron-rate.md#sensoreqeelectronrate) | Type |
| [`SensorEqeWavelengthRateContribution`](api/sensor-eqe-electron-rate.md#sensoreqewavelengthratecontribution) | Type |

## sensor/eqe-local-exposure.ts

[Detailed contracts](api/sensor-eqe-local-exposure.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/sensor/eqe-local-exposure.ts)

| Export | Kind |
| --- | --- |
| [`calculateSensorEqeLocalExposure`](api/sensor-eqe-local-exposure.md#calculatesensoreqelocalexposure) | Runtime |
| [`CalculateSensorEqeLocalExposureInput`](api/sensor-eqe-local-exposure.md#calculatesensoreqelocalexposureinput) | Type |
| [`SensorEqeLocalExposure`](api/sensor-eqe-local-exposure.md#sensoreqelocalexposure) | Type |

## sensor/eqe-temporal-exposure.ts

[Detailed contracts](api/sensor-eqe-temporal-exposure.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/sensor/eqe-temporal-exposure.ts)

| Export | Kind |
| --- | --- |
| [`calculateSensorEqeTemporalExposure`](api/sensor-eqe-temporal-exposure.md#calculatesensoreqetemporalexposure) | Runtime |
| [`CalculateSensorEqeTemporalExposureInput`](api/sensor-eqe-temporal-exposure.md#calculatesensoreqetemporalexposureinput) | Type |
| [`SensorEqeTemporalExposure`](api/sensor-eqe-temporal-exposure.md#sensoreqetemporalexposure) | Type |

## sensor/exposure-window.ts

[Detailed contracts](api/sensor-exposure-window.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/sensor/exposure-window.ts)

| Export | Kind |
| --- | --- |
| [`calculateCaptureExposureWindows`](api/sensor-exposure-window.md#calculatecaptureexposurewindows) | Runtime |
| [`CalculateCaptureExposureWindowsInput`](api/sensor-exposure-window.md#calculatecaptureexposurewindowsinput) | Type |
| [`CaptureExposureBoundaryActuator`](api/sensor-exposure-window.md#captureexposureboundaryactuator) | Type |
| [`CaptureExposureWindows`](api/sensor-exposure-window.md#captureexposurewindows) | Type |
| [`CaptureExposureWindowSample`](api/sensor-exposure-window.md#captureexposurewindowsample) | Type |
| [`ExposureBoundarySchedule`](api/sensor-exposure-window.md#exposureboundaryschedule) | Type |
| [`ResolvedCaptureExposureBoundary`](api/sensor-exposure-window.md#resolvedcaptureexposureboundary) | Type |
| [`SimultaneousExposureBoundarySchedule`](api/sensor-exposure-window.md#simultaneousexposureboundaryschedule) | Type |
| [`SourcedCaptureBoundaryDirection`](api/sensor-exposure-window.md#sourcedcaptureboundarydirection) | Type |
| [`SourcedCaptureTimingSeconds`](api/sensor-exposure-window.md#sourcedcapturetimingseconds) | Type |
| [`UniformLinearExposureBoundarySchedule`](api/sensor-exposure-window.md#uniformlinearexposureboundaryschedule) | Type |

## sensor/iso-signal-chain.ts

[Detailed contracts](api/sensor-iso-signal-chain.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/sensor/iso-signal-chain.ts)

| Export | Kind |
| --- | --- |
| [`GENERIC_ISO_SIGNAL_CHAIN_PRESET_CATALOG_SCHEMA_VERSION`](api/sensor-iso-signal-chain.md#generic_iso_signal_chain_preset_catalog_schema_version) | Runtime |
| [`GENERIC_ISO_SIGNAL_CHAIN_PROFILE_SCHEMA_VERSION`](api/sensor-iso-signal-chain.md#generic_iso_signal_chain_profile_schema_version) | Runtime |
| [`GenericIsoCaptureModeSignalChainBinding`](api/sensor-iso-signal-chain.md#genericisocapturemodesignalchainbinding) | Type |
| [`GenericIsoExpandedRegimeBinding`](api/sensor-iso-signal-chain.md#genericisoexpandedregimebinding) | Type |
| [`GenericIsoSignalChainPreset`](api/sensor-iso-signal-chain.md#genericisosignalchainpreset) | Type |
| [`GenericIsoSignalChainPresetCatalog`](api/sensor-iso-signal-chain.md#genericisosignalchainpresetcatalog) | Type |
| [`GenericIsoSignalChainProfile`](api/sensor-iso-signal-chain.md#genericisosignalchainprofile) | Type |
| [`GenericIsoStandardRegimeBand`](api/sensor-iso-signal-chain.md#genericisostandardregimeband) | Type |
| [`parseGenericIsoSignalChainPresetCatalog`](api/sensor-iso-signal-chain.md#parsegenericisosignalchainpresetcatalog) | Runtime |
| [`parseGenericIsoSignalChainProfile`](api/sensor-iso-signal-chain.md#parsegenericisosignalchainprofile) | Runtime |
| [`ResolvedGenericIsoSignalChain`](api/sensor-iso-signal-chain.md#resolvedgenericisosignalchain) | Type |
| [`resolveGenericIsoSignalChain`](api/sensor-iso-signal-chain.md#resolvegenericisosignalchain) | Runtime |
| [`ResolveGenericIsoSignalChainInput`](api/sensor-iso-signal-chain.md#resolvegenericisosignalchaininput) | Type |
| [`resolveGenericIsoSignalChainPreset`](api/sensor-iso-signal-chain.md#resolvegenericisosignalchainpreset) | Runtime |

## sensor/local-exposure-binding.ts

[Detailed contracts](api/sensor-local-exposure-binding.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/sensor/local-exposure-binding.ts)

| Export | Kind |
| --- | --- |
| [`bindSensorRateToLocalExposure`](api/sensor-local-exposure-binding.md#bindsensorratetolocalexposure) | Runtime |
| [`BindSensorRateToLocalExposureInput`](api/sensor-local-exposure-binding.md#bindsensorratetolocalexposureinput) | Type |
| [`SensorInstantaneousRateResult`](api/sensor-local-exposure-binding.md#sensorinstantaneousrateresult) | Type |
| [`SensorRateLocalExposureBinding`](api/sensor-local-exposure-binding.md#sensorratelocalexposurebinding) | Type |

## sensor/optical-stack.ts

[Detailed contracts](api/sensor-optical-stack.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/sensor/optical-stack.ts)

| Export | Kind |
| --- | --- |
| [`AntiAliasingPointSplitComponent`](api/sensor-optical-stack.md#antialiasingpointsplitcomponent) | Type |
| [`parseSensorOpticalStackProfile`](api/sensor-optical-stack.md#parsesensoropticalstackprofile) | Runtime |
| [`resolveAntiAliasingSpatialKernel`](api/sensor-optical-stack.md#resolveantialiasingspatialkernel) | Runtime |
| [`ResolvedAntiAliasingSpatialKernel`](api/sensor-optical-stack.md#resolvedantialiasingspatialkernel) | Type |
| [`SensorEffectiveAntiAliasingSpatialResponse`](api/sensor-optical-stack.md#sensoreffectiveantialiasingspatialresponse) | Type |
| [`SensorMicrolensDeclaration`](api/sensor-optical-stack.md#sensormicrolensdeclaration) | Type |
| [`SensorOpticalStackComponent`](api/sensor-optical-stack.md#sensoropticalstackcomponent) | Type |
| [`SensorOpticalStackComponentRole`](api/sensor-optical-stack.md#sensoropticalstackcomponentrole) | Type |
| [`SensorOpticalStackProfile`](api/sensor-optical-stack.md#sensoropticalstackprofile) | Type |

## sensor/photon-energy.ts

[Detailed contracts](api/sensor-photon-energy.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/sensor/photon-energy.ts)

| Export | Kind |
| --- | --- |
| [`AirRefractiveIndexConditionPolicy`](api/sensor-photon-energy.md#airrefractiveindexconditionpolicy) | Type |
| [`AirRefractiveIndexReferenceConditions`](api/sensor-photon-energy.md#airrefractiveindexreferenceconditions) | Type |
| [`calculatePhotonEnergyFromWavelength`](api/sensor-photon-energy.md#calculatephotonenergyfromwavelength) | Runtime |
| [`CalculatePhotonEnergyFromWavelengthInput`](api/sensor-photon-energy.md#calculatephotonenergyfromwavelengthinput) | Type |
| [`parseSourcedAirPhaseRefractiveIndex`](api/sensor-photon-energy.md#parsesourcedairphaserefractiveindex) | Runtime |
| [`PhotonEnergyFromWavelength`](api/sensor-photon-energy.md#photonenergyfromwavelength) | Type |
| [`SourcedAirPhaseRefractiveIndex`](api/sensor-photon-energy.md#sourcedairphaserefractiveindex) | Type |

## sensor/physical-charge-capacity.ts

[Detailed contracts](api/sensor-physical-charge-capacity.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/sensor/physical-charge-capacity.ts)

| Export | Kind |
| --- | --- |
| [`assessSensorPhysicalChargeCapacity`](api/sensor-physical-charge-capacity.md#assesssensorphysicalchargecapacity) | Runtime |
| [`AssessSensorPhysicalChargeCapacityInput`](api/sensor-physical-charge-capacity.md#assesssensorphysicalchargecapacityinput) | Type |
| [`parseSensorPhysicalChargeCapacityProfile`](api/sensor-physical-charge-capacity.md#parsesensorphysicalchargecapacityprofile) | Runtime |
| [`SensorPhysicalChargeCapacityAssessment`](api/sensor-physical-charge-capacity.md#sensorphysicalchargecapacityassessment) | Type |
| [`SensorPhysicalChargeCapacityProfile`](api/sensor-physical-charge-capacity.md#sensorphysicalchargecapacityprofile) | Type |
| [`SensorPhysicalChargeCapacitySiteApplicability`](api/sensor-physical-charge-capacity.md#sensorphysicalchargecapacitysiteapplicability) | Type |
| [`SensorPhysicalChargeCapacityTemperatureApplicability`](api/sensor-physical-charge-capacity.md#sensorphysicalchargecapacitytemperatureapplicability) | Type |

## sensor/pixel-pitch.ts

[Detailed contracts](api/sensor-pixel-pitch.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/sensor/pixel-pitch.ts)

| Export | Kind |
| --- | --- |
| [`calculatePixelPitch`](api/sensor-pixel-pitch.md#calculatepixelpitch) | Runtime |
| [`CalculatePixelPitchInput`](api/sensor-pixel-pitch.md#calculatepixelpitchinput) | Type |
| [`PixelPitch`](api/sensor-pixel-pitch.md#pixelpitch) | Type |

## sensor/radiometry-readiness.ts

[Detailed contracts](api/sensor-radiometry-readiness.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/sensor/radiometry-readiness.ts)

| Export | Kind |
| --- | --- |
| [`assessRadiometryReadiness`](api/sensor-radiometry-readiness.md#assessradiometryreadiness) | Runtime |
| [`CalibrationArtifactReference`](api/sensor-radiometry-readiness.md#calibrationartifactreference) | Type |
| [`ExposureIntegrationRequirement`](api/sensor-radiometry-readiness.md#exposureintegrationrequirement) | Type |
| [`OpticalTransmissionRequirement`](api/sensor-radiometry-readiness.md#opticaltransmissionrequirement) | Type |
| [`parseRadiometryReadinessProfile`](api/sensor-radiometry-readiness.md#parseradiometryreadinessprofile) | Runtime |
| [`PhotositeCollectionAreaRequirement`](api/sensor-radiometry-readiness.md#photositecollectionarearequirement) | Type |
| [`PupilVignettingRequirement`](api/sensor-radiometry-readiness.md#pupilvignettingrequirement) | Type |
| [`RadiometryReadinessAssessment`](api/sensor-radiometry-readiness.md#radiometryreadinessassessment) | Type |
| [`RadiometryReadinessProfile`](api/sensor-radiometry-readiness.md#radiometryreadinessprofile) | Type |
| [`RadiometryRequirement`](api/sensor-radiometry-readiness.md#radiometryrequirement) | Type |
| [`RadiometryRequirementId`](api/sensor-radiometry-readiness.md#radiometryrequirementid) | Type |
| [`RadiometryScientificStatus`](api/sensor-radiometry-readiness.md#radiometryscientificstatus) | Type |
| [`RadiometryUncertaintyDeclaration`](api/sensor-radiometry-readiness.md#radiometryuncertaintydeclaration) | Type |
| [`SceneSpectralRadianceRequirement`](api/sensor-radiometry-readiness.md#scenespectralradiancerequirement) | Type |
| [`SensorResponseRequirement`](api/sensor-radiometry-readiness.md#sensorresponserequirement) | Type |

## sensor/raw-readout.ts

[Detailed contracts](api/sensor-raw-readout.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/sensor/raw-readout.ts)

| Export | Kind |
| --- | --- |
| [`calculateExpectedSensorReadout`](api/sensor-raw-readout.md#calculateexpectedsensorreadout) | Runtime |
| [`CalculateExpectedSensorReadoutInput`](api/sensor-raw-readout.md#calculateexpectedsensorreadoutinput) | Type |
| [`parseSensorChargeSamplingProfile`](api/sensor-raw-readout.md#parsesensorchargesamplingprofile) | Runtime |
| [`parseSensorReadoutConversionProfile`](api/sensor-raw-readout.md#parsesensorreadoutconversionprofile) | Runtime |
| [`ResolvedSensorReadoutRegime`](api/sensor-raw-readout.md#resolvedsensorreadoutregime) | Type |
| [`resolveSensorReadoutRegime`](api/sensor-raw-readout.md#resolvesensorreadoutregime) | Runtime |
| [`ResolveSensorReadoutRegimeInput`](api/sensor-raw-readout.md#resolvesensorreadoutregimeinput) | Type |
| [`SENSOR_CHARGE_SAMPLING_PROFILE_SCHEMA_VERSION`](api/sensor-raw-readout.md#sensor_charge_sampling_profile_schema_version) | Runtime |
| [`SENSOR_READOUT_CONVERSION_PROFILE_SCHEMA_VERSION`](api/sensor-raw-readout.md#sensor_readout_conversion_profile_schema_version) | Runtime |
| [`SensorAdditionalChargeSamplingModel`](api/sensor-raw-readout.md#sensoradditionalchargesamplingmodel) | Type |
| [`SensorAdditionalChargeSamplingPolicy`](api/sensor-raw-readout.md#sensoradditionalchargesamplingpolicy) | Type |
| [`SensorChargeRealization`](api/sensor-raw-readout.md#sensorchargerealization) | Type |
| [`SensorChargeSamplingProfile`](api/sensor-raw-readout.md#sensorchargesamplingprofile) | Type |
| [`SensorElectronicReadNoiseComponent`](api/sensor-raw-readout.md#sensorelectronicreadnoisecomponent) | Type |
| [`SensorExpectedReadoutSignal`](api/sensor-raw-readout.md#sensorexpectedreadoutsignal) | Type |
| [`SensorRawCodeSample`](api/sensor-raw-readout.md#sensorrawcodesample) | Type |
| [`SensorReadoutConversionProfile`](api/sensor-raw-readout.md#sensorreadoutconversionprofile) | Type |
| [`SensorReadoutConversionRegime`](api/sensor-raw-readout.md#sensorreadoutconversionregime) | Type |
| [`simulateSensorChargeRealization`](api/sensor-raw-readout.md#simulatesensorchargerealization) | Runtime |
| [`SimulateSensorChargeRealizationInput`](api/sensor-raw-readout.md#simulatesensorchargerealizationinput) | Type |
| [`simulateSensorRawCode`](api/sensor-raw-readout.md#simulatesensorrawcode) | Runtime |
| [`SimulateSensorRawCodeInput`](api/sensor-raw-readout.md#simulatesensorrawcodeinput) | Type |

## sensor/raw-reconstruction.ts

[Detailed contracts](api/sensor-raw-reconstruction.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/sensor/raw-reconstruction.ts)

| Export | Kind |
| --- | --- |
| [`createSensorRawCaptureSample`](api/sensor-raw-reconstruction.md#createsensorrawcapturesample) | Runtime |
| [`CreateSensorRawCaptureSampleInput`](api/sensor-raw-reconstruction.md#createsensorrawcapturesampleinput) | Type |
| [`parseSensorRawReconstructionProfile`](api/sensor-raw-reconstruction.md#parsesensorrawreconstructionprofile) | Runtime |
| [`resolveSensorRawReconstruction`](api/sensor-raw-reconstruction.md#resolvesensorrawreconstruction) | Runtime |
| [`ResolveSensorRawReconstructionInput`](api/sensor-raw-reconstruction.md#resolvesensorrawreconstructioninput) | Type |
| [`SENSOR_RAW_CAPTURE_SAMPLE_VERSION`](api/sensor-raw-reconstruction.md#sensor_raw_capture_sample_version) | Runtime |
| [`SENSOR_RAW_RECONSTRUCTION_PROFILE_SCHEMA_VERSION`](api/sensor-raw-reconstruction.md#sensor_raw_reconstruction_profile_schema_version) | Runtime |
| [`SensorRawCaptureSample`](api/sensor-raw-reconstruction.md#sensorrawcapturesample) | Type |
| [`SensorRawReconstructedPixel`](api/sensor-raw-reconstruction.md#sensorrawreconstructedpixel) | Type |
| [`SensorRawReconstructionChannelKernel`](api/sensor-raw-reconstruction.md#sensorrawreconstructionchannelkernel) | Type |
| [`SensorRawReconstructionKernelContribution`](api/sensor-raw-reconstruction.md#sensorrawreconstructionkernelcontribution) | Type |
| [`SensorRawReconstructionProfile`](api/sensor-raw-reconstruction.md#sensorrawreconstructionprofile) | Type |

## sensor/readout-exposure-linkage.ts

[Detailed contracts](api/sensor-readout-exposure-linkage.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/sensor/readout-exposure-linkage.ts)

| Export | Kind |
| --- | --- |
| [`assessReadoutExposureTimingLinkage`](api/sensor-readout-exposure-linkage.md#assessreadoutexposuretiminglinkage) | Runtime |
| [`AssessReadoutExposureTimingLinkageInput`](api/sensor-readout-exposure-linkage.md#assessreadoutexposuretiminglinkageinput) | Type |
| [`ReadoutExposureBoundaryId`](api/sensor-readout-exposure-linkage.md#readoutexposureboundaryid) | Type |
| [`ReadoutExposureBoundarySpatialLink`](api/sensor-readout-exposure-linkage.md#readoutexposureboundaryspatiallink) | Type |
| [`ReadoutExposureBoundarySpatialLinkAssessment`](api/sensor-readout-exposure-linkage.md#readoutexposureboundaryspatiallinkassessment) | Type |
| [`ReadoutExposureSpatialPhaseOrientation`](api/sensor-readout-exposure-linkage.md#readoutexposurespatialphaseorientation) | Type |
| [`ReadoutExposureTimingLinkageAssessment`](api/sensor-readout-exposure-linkage.md#readoutexposuretiminglinkageassessment) | Type |
| [`ReadoutExposureTimingLinkageDeclaration`](api/sensor-readout-exposure-linkage.md#readoutexposuretiminglinkagedeclaration) | Type |

## sensor/readout-timing.ts

[Detailed contracts](api/sensor-readout-timing.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/sensor/readout-timing.ts)

| Export | Kind |
| --- | --- |
| [`calculateSensorReadoutTiming`](api/sensor-readout-timing.md#calculatesensorreadouttiming) | Runtime |
| [`CalculateSensorReadoutTimingInput`](api/sensor-readout-timing.md#calculatesensorreadouttiminginput) | Type |
| [`CaptureShutterMechanism`](api/sensor-readout-timing.md#captureshuttermechanism) | Type |
| [`GlobalSensorReadoutTimingDeclaration`](api/sensor-readout-timing.md#globalsensorreadouttimingdeclaration) | Type |
| [`NativeSensorReadoutScanDirection`](api/sensor-readout-timing.md#nativesensorreadoutscandirection) | Type |
| [`RollingSensorReadoutTimingDeclaration`](api/sensor-readout-timing.md#rollingsensorreadouttimingdeclaration) | Type |
| [`SensorReadoutMode`](api/sensor-readout-timing.md#sensorreadoutmode) | Type |
| [`SensorReadoutTiming`](api/sensor-readout-timing.md#sensorreadouttiming) | Type |
| [`SensorReadoutTimingDeclaration`](api/sensor-readout-timing.md#sensorreadouttimingdeclaration) | Type |
| [`SensorReadoutTimingSample`](api/sensor-readout-timing.md#sensorreadouttimingsample) | Type |
| [`SourcedSensorReadoutFact`](api/sensor-readout-timing.md#sourcedsensorreadoutfact) | Type |
| [`SourcedSensorTimingSeconds`](api/sensor-readout-timing.md#sourcedsensortimingseconds) | Type |

## sensor/response-application-compatibility.ts

[Detailed contracts](api/sensor-response-application-compatibility.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/sensor/response-application-compatibility.ts)

| Export | Kind |
| --- | --- |
| [`assessSensorResponseApplicationCompatibility`](api/sensor-response-application-compatibility.md#assesssensorresponseapplicationcompatibility) | Runtime |
| [`AssessSensorResponseApplicationCompatibilityInput`](api/sensor-response-application-compatibility.md#assesssensorresponseapplicationcompatibilityinput) | Type |
| [`parseSensorResponseApplicationProfile`](api/sensor-response-application-compatibility.md#parsesensorresponseapplicationprofile) | Runtime |
| [`SensorResponseApplicationCompatibilityAssessment`](api/sensor-response-application-compatibility.md#sensorresponseapplicationcompatibilityassessment) | Type |
| [`SensorResponseApplicationCompatibilityBlocker`](api/sensor-response-application-compatibility.md#sensorresponseapplicationcompatibilityblocker) | Type |
| [`SensorResponseApplicationProfile`](api/sensor-response-application-compatibility.md#sensorresponseapplicationprofile) | Type |
| [`SensorResponseIncidentAreaBasis`](api/sensor-response-application-compatibility.md#sensorresponseincidentareabasis) | Type |
| [`SensorResponseReferenceConditionPolicy`](api/sensor-response-application-compatibility.md#sensorresponsereferenceconditionpolicy) | Type |
| [`SensorResponseSignalPath`](api/sensor-response-application-compatibility.md#sensorresponsesignalpath) | Type |
| [`SensorResponseSourcePlane`](api/sensor-response-application-compatibility.md#sensorresponsesourceplane) | Type |
| [`SensorResponseSpatialModel`](api/sensor-response-application-compatibility.md#sensorresponsespatialmodel) | Type |
| [`SourcedSensorResponseSourcePlane`](api/sensor-response-application-compatibility.md#sourcedsensorresponsesourceplane) | Type |

## sensor/response-operating-range.ts

[Detailed contracts](api/sensor-response-operating-range.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/sensor/response-operating-range.ts)

| Export | Kind |
| --- | --- |
| [`assessSensorResponseOperatingRange`](api/sensor-response-operating-range.md#assesssensorresponseoperatingrange) | Runtime |
| [`AssessSensorResponseOperatingRangeInput`](api/sensor-response-operating-range.md#assesssensorresponseoperatingrangeinput) | Type |
| [`parseSensorResponseOperatingRangeProfile`](api/sensor-response-operating-range.md#parsesensorresponseoperatingrangeprofile) | Runtime |
| [`SensorResponseLinearityCriterion`](api/sensor-response-operating-range.md#sensorresponselinearitycriterion) | Type |
| [`SensorResponseOperatingInputRange`](api/sensor-response-operating-range.md#sensorresponseoperatinginputrange) | Type |
| [`SensorResponseOperatingRangeAssessment`](api/sensor-response-operating-range.md#sensorresponseoperatingrangeassessment) | Type |
| [`SensorResponseOperatingRangeBlocker`](api/sensor-response-operating-range.md#sensorresponseoperatingrangeblocker) | Type |
| [`SensorResponseOperatingRangeProfile`](api/sensor-response-operating-range.md#sensorresponseoperatingrangeprofile) | Type |
| [`SensorResponseOperatingSpatialLinearityModel`](api/sensor-response-operating-range.md#sensorresponseoperatingspatiallinearitymodel) | Type |
| [`SensorResponseOperatingSpectralInputModel`](api/sensor-response-operating-range.md#sensorresponseoperatingspectralinputmodel) | Type |
| [`SensorResponseOperatingWavelengthApplicability`](api/sensor-response-operating-range.md#sensorresponseoperatingwavelengthapplicability) | Type |

## sensor/responsivity-photocurrent.ts

[Detailed contracts](api/sensor-responsivity-photocurrent.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/sensor/responsivity-photocurrent.ts)

| Export | Kind |
| --- | --- |
| [`calculateSensorResponsivityPhotocurrent`](api/sensor-responsivity-photocurrent.md#calculatesensorresponsivityphotocurrent) | Runtime |
| [`CalculateSensorResponsivityPhotocurrentInput`](api/sensor-responsivity-photocurrent.md#calculatesensorresponsivityphotocurrentinput) | Type |
| [`parseSensorResponsivityElectricalApplicabilityProfile`](api/sensor-responsivity-photocurrent.md#parsesensorresponsivityelectricalapplicabilityprofile) | Runtime |
| [`SensorResponsivityBiasCondition`](api/sensor-responsivity-photocurrent.md#sensorresponsivitybiascondition) | Type |
| [`SensorResponsivityElectricalApplicabilityProfile`](api/sensor-responsivity-photocurrent.md#sensorresponsivityelectricalapplicabilityprofile) | Type |
| [`SensorResponsivityElectricalConditionPolicy`](api/sensor-responsivity-photocurrent.md#sensorresponsivityelectricalconditionpolicy) | Type |
| [`SensorResponsivityElectricalConditions`](api/sensor-responsivity-photocurrent.md#sensorresponsivityelectricalconditions) | Type |
| [`SensorResponsivityPhotocurrent`](api/sensor-responsivity-photocurrent.md#sensorresponsivityphotocurrent) | Type |
| [`SensorResponsivityReadoutLoadCondition`](api/sensor-responsivity-photocurrent.md#sensorresponsivityreadoutloadcondition) | Type |
| [`SensorResponsivityWavelengthCurrentContribution`](api/sensor-responsivity-photocurrent.md#sensorresponsivitywavelengthcurrentcontribution) | Type |

## sensor/sampling-aperture.ts

[Detailed contracts](api/sensor-sampling-aperture.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/sensor/sampling-aperture.ts)

| Export | Kind |
| --- | --- |
| [`NativeSensorPhysicalBoundsMm`](api/sensor-sampling-aperture.md#nativesensorphysicalboundsmm) | Type |
| [`NativeSensorPhysicalPointMm`](api/sensor-sampling-aperture.md#nativesensorphysicalpointmm) | Type |
| [`parseSensorSamplingApertureProfile`](api/sensor-sampling-aperture.md#parsesensorsamplingapertureprofile) | Runtime |
| [`ResolvedSensorSamplingAperture`](api/sensor-sampling-aperture.md#resolvedsensorsamplingaperture) | Type |
| [`resolveSensorSamplingAperture`](api/sensor-sampling-aperture.md#resolvesensorsamplingaperture) | Runtime |
| [`ResolveSensorSamplingApertureInput`](api/sensor-sampling-aperture.md#resolvesensorsamplingapertureinput) | Type |
| [`SensorGeometricSensitiveAperture`](api/sensor-sampling-aperture.md#sensorgeometricsensitiveaperture) | Type |
| [`SensorSamplingApertureProfile`](api/sensor-sampling-aperture.md#sensorsamplingapertureprofile) | Type |
| [`SensorSiteCenterLatticeRegistration`](api/sensor-sampling-aperture.md#sensorsitecenterlatticeregistration) | Type |

## sensor/scene-eqe-temporal-exposure.ts

[Detailed contracts](api/sensor-scene-eqe-temporal-exposure.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/sensor/scene-eqe-temporal-exposure.ts)

| Export | Kind |
| --- | --- |
| [`calculateSceneSensorEqeTemporalExposure`](api/sensor-scene-eqe-temporal-exposure.md#calculatescenesensoreqetemporalexposure) | Runtime |
| [`CalculateSceneSensorEqeTemporalExposureInput`](api/sensor-scene-eqe-temporal-exposure.md#calculatescenesensoreqetemporalexposureinput) | Type |
| [`SceneSensorEqeTemporalExposure`](api/sensor-scene-eqe-temporal-exposure.md#scenesensoreqetemporalexposure) | Type |

## sensor/sensor-geometry.ts

[Detailed contracts](api/sensor-sensor-geometry.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/sensor/sensor-geometry.ts)

| Export | Kind |
| --- | --- |
| [`calculateImagingAreaMetrics`](api/sensor-sensor-geometry.md#calculateimagingareametrics) | Runtime |
| [`calculateSensorGeometryMetrics`](api/sensor-sensor-geometry.md#calculatesensorgeometrymetrics) | Runtime |
| [`CalculateSensorGeometryMetricsInput`](api/sensor-sensor-geometry.md#calculatesensorgeometrymetricsinput) | Type |
| [`ImagingAreaMetrics`](api/sensor-sensor-geometry.md#imagingareametrics) | Type |
| [`NativeImageRaster`](api/sensor-sensor-geometry.md#nativeimageraster) | Type |
| [`RasterDimensions`](api/sensor-sensor-geometry.md#rasterdimensions) | Type |
| [`SensorGeometryMetrics`](api/sensor-sensor-geometry.md#sensorgeometrymetrics) | Type |
| [`SensorImagingArea`](api/sensor-sensor-geometry.md#sensorimagingarea) | Type |

## sensor/signal-noise.ts

[Detailed contracts](api/sensor-signal-noise.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/sensor/signal-noise.ts)

| Export | Kind |
| --- | --- |
| [`calculatePhotoelectrons`](api/sensor-signal-noise.md#calculatephotoelectrons) | Runtime |
| [`CalculatePhotoelectronsInput`](api/sensor-signal-noise.md#calculatephotoelectronsinput) | Type |
| [`calculateSignalToNoise`](api/sensor-signal-noise.md#calculatesignaltonoise) | Runtime |
| [`CalculateSignalToNoiseInput`](api/sensor-signal-noise.md#calculatesignaltonoiseinput) | Type |
| [`SignalToNoise`](api/sensor-signal-noise.md#signaltonoise) | Type |

## sensor/spatial-sample-reduction.ts

[Detailed contracts](api/sensor-spatial-sample-reduction.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/sensor/spatial-sample-reduction.ts)

| Export | Kind |
| --- | --- |
| [`reduceSensorSpatialSamplingQuadrature`](api/sensor-spatial-sample-reduction.md#reducesensorspatialsamplingquadrature) | Runtime |
| [`ReduceSensorSpatialSamplingQuadratureInput`](api/sensor-spatial-sample-reduction.md#reducesensorspatialsamplingquadratureinput) | Type |
| [`SensorSpatialQuadratureNodeIdentity`](api/sensor-spatial-sample-reduction.md#sensorspatialquadraturenodeidentity) | Type |
| [`SensorSpatialQuadratureNodeValue`](api/sensor-spatial-sample-reduction.md#sensorspatialquadraturenodevalue) | Type |
| [`SensorSpatialSampleReduction`](api/sensor-spatial-sample-reduction.md#sensorspatialsamplereduction) | Type |
| [`SensorSpatialSampleReductionValue`](api/sensor-spatial-sample-reduction.md#sensorspatialsamplereductionvalue) | Type |
| [`SensorSpatialSampleValueDomain`](api/sensor-spatial-sample-reduction.md#sensorspatialsamplevaluedomain) | Type |

## sensor/spatial-sampling-quadrature.ts

[Detailed contracts](api/sensor-spatial-sampling-quadrature.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/sensor/spatial-sampling-quadrature.ts)

| Export | Kind |
| --- | --- |
| [`calculateSensorSpatialSamplingQuadrature`](api/sensor-spatial-sampling-quadrature.md#calculatesensorspatialsamplingquadrature) | Runtime |
| [`CalculateSensorSpatialSamplingQuadratureInput`](api/sensor-spatial-sampling-quadrature.md#calculatesensorspatialsamplingquadratureinput) | Type |
| [`SensorSpatialSamplingQuadrature`](api/sensor-spatial-sampling-quadrature.md#sensorspatialsamplingquadrature) | Type |
| [`SensorSpatialSamplingQuadratureNode`](api/sensor-spatial-sampling-quadrature.md#sensorspatialsamplingquadraturenode) | Type |

## sensor/spatio-spectral-reduction.ts

[Detailed contracts](api/sensor-spatio-spectral-reduction.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/sensor/spatio-spectral-reduction.ts)

| Export | Kind |
| --- | --- |
| [`reduceSensorSpatioSpectralIrradiance`](api/sensor-spatio-spectral-reduction.md#reducesensorspatiospectralirradiance) | Runtime |
| [`ReduceSensorSpatioSpectralIrradianceInput`](api/sensor-spatio-spectral-reduction.md#reducesensorspatiospectralirradianceinput) | Type |
| [`SensorSpatioSpectralIrradianceReduction`](api/sensor-spatio-spectral-reduction.md#sensorspatiospectralirradiancereduction) | Type |
| [`SensorSpatioSpectralIrradianceSample`](api/sensor-spatio-spectral-reduction.md#sensorspatiospectralirradiancesample) | Type |
| [`SensorSpatioSpectralNodeIdentity`](api/sensor-spatio-spectral-reduction.md#sensorspatiospectralnodeidentity) | Type |
| [`SensorSpatioSpectralWavelengthReduction`](api/sensor-spatio-spectral-reduction.md#sensorspatiospectralwavelengthreduction) | Type |

## sensor/spectral-coverage.ts

[Detailed contracts](api/sensor-spectral-coverage.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/sensor/spectral-coverage.ts)

| Export | Kind |
| --- | --- |
| [`createSensorSpectralCoverageParticipant`](api/sensor-spectral-coverage.md#createsensorspectralcoverageparticipant) | Runtime |
| [`CreateSensorSpectralCoverageParticipantInput`](api/sensor-spectral-coverage.md#createsensorspectralcoverageparticipantinput) | Type |

## sensor/spectral-quadrature.ts

[Detailed contracts](api/sensor-spectral-quadrature.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/sensor/spectral-quadrature.ts)

| Export | Kind |
| --- | --- |
| [`calculateSensorSpectralQuadrature`](api/sensor-spectral-quadrature.md#calculatesensorspectralquadrature) | Runtime |
| [`CalculateSensorSpectralQuadratureInput`](api/sensor-spectral-quadrature.md#calculatesensorspectralquadratureinput) | Type |
| [`SensorSpectralQuadrature`](api/sensor-spectral-quadrature.md#sensorspectralquadrature) | Type |
| [`SensorSpectralQuadratureNode`](api/sensor-spectral-quadrature.md#sensorspectralquadraturenode) | Type |
| [`SensorSpectralWavelengthRangeNanometers`](api/sensor-spectral-quadrature.md#sensorspectralwavelengthrangenanometers) | Type |

## sensor/spectral-response.ts

[Detailed contracts](api/sensor-spectral-response.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/sensor/spectral-response.ts)

| Export | Kind |
| --- | --- |
| [`EffectiveSensorResponseScope`](api/sensor-spectral-response.md#effectivesensorresponsescope) | Type |
| [`parseSensorSpectralResponseProfile`](api/sensor-spectral-response.md#parsesensorspectralresponseprofile) | Runtime |
| [`ResolvedSensorSpectralResponse`](api/sensor-spectral-response.md#resolvedsensorspectralresponse) | Type |
| [`ResolvedSensorSpectralResponseValue`](api/sensor-spectral-response.md#resolvedsensorspectralresponsevalue) | Type |
| [`resolveSensorSpectralResponseAtWavelength`](api/sensor-spectral-response.md#resolvesensorspectralresponseatwavelength) | Runtime |
| [`ResolveSensorSpectralResponseAtWavelengthInput`](api/sensor-spectral-response.md#resolvesensorspectralresponseatwavelengthinput) | Type |
| [`SensorSpectralChannelResponse`](api/sensor-spectral-response.md#sensorspectralchannelresponse) | Type |
| [`SensorSpectralReferenceConditions`](api/sensor-spectral-response.md#sensorspectralreferenceconditions) | Type |
| [`SensorSpectralResponseChannelBinding`](api/sensor-spectral-response.md#sensorspectralresponsechannelbinding) | Type |
| [`SensorSpectralResponseProfile`](api/sensor-spectral-response.md#sensorspectralresponseprofile) | Type |
| [`SensorSpectralResponseScientificStatus`](api/sensor-spectral-response.md#sensorspectralresponsescientificstatus) | Type |
| [`SensorSpectralResponseUncertainty`](api/sensor-spectral-response.md#sensorspectralresponseuncertainty) | Type |
| [`SpectralFractionCurve`](api/sensor-spectral-response.md#spectralfractioncurve) | Type |
| [`SpectralFractionSample`](api/sensor-spectral-response.md#spectralfractionsample) | Type |
| [`SpectralResponsivityCurve`](api/sensor-spectral-response.md#spectralresponsivitycurve) | Type |
| [`SpectralResponsivitySample`](api/sensor-spectral-response.md#spectralresponsivitysample) | Type |

## sensor/temporal-photo-signal.ts

[Detailed contracts](api/sensor-temporal-photo-signal.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/sensor/temporal-photo-signal.ts)

| Export | Kind |
| --- | --- |
| [`createSensorEqeTemporalPhotoSignal`](api/sensor-temporal-photo-signal.md#createsensoreqetemporalphotosignal) | Runtime |
| [`parseSensorEqeTemporalPhotoSignal`](api/sensor-temporal-photo-signal.md#parsesensoreqetemporalphotosignal) | Runtime |
| [`SensorEqePhotoExposure`](api/sensor-temporal-photo-signal.md#sensoreqephotoexposure) | Type |
| [`SensorEqeTemporalPhotoSignal`](api/sensor-temporal-photo-signal.md#sensoreqetemporalphotosignal) | Type |

## simulation/poc-simulation.ts

[Detailed contracts](api/simulation-poc-simulation.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/simulation/poc-simulation.ts)

| Export | Kind |
| --- | --- |
| [`POC_SIMULATION_API_VERSION`](api/simulation-poc-simulation.md#poc_simulation_api_version) | Runtime |
| [`PocSimulationRequest`](api/simulation-poc-simulation.md#pocsimulationrequest) | Type |
| [`PocSimulationResponse`](api/simulation-poc-simulation.md#pocsimulationresponse) | Type |
| [`simulatePocCamera`](api/simulation-poc-simulation.md#simulatepoccamera) | Runtime |

## stabilization/camera-shake.ts

[Detailed contracts](api/stabilization-camera-shake.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/stabilization/camera-shake.ts)

| Export | Kind |
| --- | --- |
| [`CameraShakeBlurSample`](api/stabilization-camera-shake.md#camerashakeblursample) | Type |
| [`CameraShakeEstimate`](api/stabilization-camera-shake.md#camerashakeestimate) | Type |
| [`estimateCameraShakeBlur`](api/stabilization-camera-shake.md#estimatecamerashakeblur) | Runtime |
| [`EstimateCameraShakeBlurInput`](api/stabilization-camera-shake.md#estimatecamerashakeblurinput) | Type |

## stabilization/system.ts

[Detailed contracts](api/stabilization-system.md) · [Source](https://github.com/Photivra/photivra/blob/main/src/stabilization/system.ts)

| Export | Kind |
| --- | --- |
| [`calculateStabilizedCaptureTemporalSamples`](api/stabilization-system.md#calculatestabilizedcapturetemporalsamples) | Runtime |
| [`CalculateStabilizedCaptureTemporalSamplesInput`](api/stabilization-system.md#calculatestabilizedcapturetemporalsamplesinput) | Type |
| [`calculateStabilizedRotationTrajectory`](api/stabilization-system.md#calculatestabilizedrotationtrajectory) | Runtime |
| [`CalculateStabilizedRotationTrajectoryInput`](api/stabilization-system.md#calculatestabilizedrotationtrajectoryinput) | Type |
| [`parseStabilizationDisturbanceTrajectory`](api/stabilization-system.md#parsestabilizationdisturbancetrajectory) | Runtime |
| [`parseStabilizationSystemProfile`](api/stabilization-system.md#parsestabilizationsystemprofile) | Runtime |
| [`PhysicalStabilizationArchitecture`](api/stabilization-system.md#physicalstabilizationarchitecture) | Type |
| [`STABILIZATION_DISTURBANCE_TRAJECTORY_VERSION`](api/stabilization-system.md#stabilization_disturbance_trajectory_version) | Runtime |
| [`STABILIZATION_SYSTEM_PROFILE_SCHEMA_VERSION`](api/stabilization-system.md#stabilization_system_profile_schema_version) | Runtime |
| [`StabilizationAngularStateRad`](api/stabilization-system.md#stabilizationangularstaterad) | Type |
| [`StabilizationAxisResolution`](api/stabilization-system.md#stabilizationaxisresolution) | Type |
| [`StabilizationAxisResponseProfile`](api/stabilization-system.md#stabilizationaxisresponseprofile) | Type |
| [`StabilizationCaptureKind`](api/stabilization-system.md#stabilizationcapturekind) | Type |
| [`StabilizationCoordinatedAllocation`](api/stabilization-system.md#stabilizationcoordinatedallocation) | Type |
| [`StabilizationDisturbanceSample`](api/stabilization-system.md#stabilizationdisturbancesample) | Type |
| [`StabilizationDisturbanceTrajectory`](api/stabilization-system.md#stabilizationdisturbancetrajectory) | Type |
| [`StabilizationPanningPolicy`](api/stabilization-system.md#stabilizationpanningpolicy) | Type |
| [`StabilizationRotationAxis`](api/stabilization-system.md#stabilizationrotationaxis) | Type |
| [`StabilizationSystemProfile`](api/stabilization-system.md#stabilizationsystemprofile) | Type |
| [`StabilizedCaptureTemporalNode`](api/stabilization-system.md#stabilizedcapturetemporalnode) | Type |
| [`StabilizedCaptureTemporalPoint`](api/stabilization-system.md#stabilizedcapturetemporalpoint) | Type |
| [`StabilizedCaptureTemporalSamples`](api/stabilization-system.md#stabilizedcapturetemporalsamples) | Type |
| [`StabilizedRotationSample`](api/stabilization-system.md#stabilizedrotationsample) | Type |
| [`StabilizedRotationTrajectory`](api/stabilization-system.md#stabilizedrotationtrajectory) | Type |
