// SPDX-License-Identifier: Apache-2.0

import { createSimulatedCapture, createSensorRawFrame, resolveCaptureColorModel, type PhotographicExportInput } from "../../src/index.js";
import { loadSensorRawFrameInput } from "./sensor-raw-frame-fixture.js";
import { loadRawFrameReconstructionInput } from "./raw-frame-reconstruction-fixture.js";

/** Declared ideal-color interpretation is owned test data only, not a calibrated sensor profile. */
export function loadPhotographicExportInput(): PhotographicExportInput {
  const raw=loadSensorRawFrameInput(), c=raw.capture;
  const {schemaVersion:_s,engineApiVersion:_e,resolvedGeometry:_g,equivalentFocalLength35Mm:_f,...captureInput}=c;
  void _s; void _e; void _g; void _f;
  raw.capture=createSimulatedCapture({...captureInput,captureId:"00000000-0000-4000-8000-000000000001"}).value;
  const reconstruction=loadRawFrameReconstructionInput(); reconstruction.rawFrame=createSensorRawFrame(raw);
  return { reconstruction,colorProfile:{schemaVersion:"0.1.0",profileId:"owned-ideal-rgb-test",profileVersion:"1",colorSamplingProfileId:"cfa",
    channelIds:["red","green","blue"],scientificStatus:"approximation",referenceIlluminant:"D65",normalizedCameraChannelsToXyz:resolveCaptureColorModel().cameraRgbToXyz,
    evidence:raw.colorSamplingProfile.evidence,limitations:["Synthetic ideal test-color declaration, not physical sensor calibration."]},
    whiteBalance:"not-required",rendering:{schemaVersion:"0.1.0",profileId:"neutral",profileVersion:"1",renderingExposureEv:0,toneCurve:"identity",
      gamutHandling:"clip-components",outputDynamicRange:"sdr",transferFunction:"srgb",bitDepth:8,rounding:"nearest-ties-up",dither:"none"},
    metadata:{workflow:"human-directed-non-generative",capturedAtUtc:"2026-10-01T19:00:00.123Z",
      raw:{documentId:"00000000-0000-4000-8000-000000000002",instanceId:"00000000-0000-4000-8000-000000000003"},
      jpeg:{documentId:"00000000-0000-4000-8000-000000000004",instanceId:"00000000-0000-4000-8000-000000000005"}},
    sceneProfile:{id:"owned-basic-test",version:"1",sceneStateId:c.sceneStateId},jpegQuantizationStep:1 };
}
