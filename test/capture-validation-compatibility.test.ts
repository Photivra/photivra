// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  InvalidConfigurationError, parseSensorEqeTemporalPhotoSignal, parseSimulatedCapture, parseSensorRawFrameInput,
  parseRawFrameReconstructionInput, parseCaptureExportMetadataInput,
  parsePhotographicExportInput, parseSensorRawProducerInput, parseLinearCaptureEncoding,
  parseCaptureColorTransformInput, parseSdrRenderingProfile, parseCaptureSdrInput,
  parseCaptureCorrectedSdrInput, createSimulatedCapture
} from "../src/index.js";
import { loadLinearCaptureInput } from "./helpers/linear-capture-fixture.js";
import { loadSensorRawFrameInput } from "./helpers/sensor-raw-frame-fixture.js";
import { loadPhotographicExportInput } from "./helpers/photographic-export-fixture.js";

const boundaries: [string, (value: unknown) => unknown, string][] = [
  ["temporal photo", parseSensorEqeTemporalPhotoSignal, "Invalid temporal photo-signal fields."],
  ["capture", parseSimulatedCapture, "Invalid or non-allowlisted capture metadata."],
  ["RAW attachment", parseSensorRawFrameInput, "Invalid RAW-frame fields."],
  ["RAW reconstruction", parseRawFrameReconstructionInput, "Invalid or non-allowlisted RAW reconstruction fields."],
  ["export metadata", parseCaptureExportMetadataInput, "Export metadata must contain only allowlisted fields."],
  ["photographic export", parsePhotographicExportInput, "Invalid photographic export fields."],
  ["RAW producer", parseSensorRawProducerInput, "Invalid sensor RAW producer fields."],
  ["linear encoding", parseLinearCaptureEncoding, "Invalid linear encoding fields."],
  ["color", parseCaptureColorTransformInput, "Invalid color-transform fields."],
  ["SDR", parseSdrRenderingProfile, "Invalid SDR fields."],
  ["capture SDR", parseCaptureSdrInput, "Invalid capture-SDR fields."],
  ["correction", parseCaptureCorrectedSdrInput, "Invalid capture correction fields."]
];

describe("capture validation domain compatibility", () => {
  it.each(boundaries)("preserves %s rejection class and diagnostic", (_name, parse, message) => {
    for (const value of [null, undefined, [], 1, "record", { secretPath: "/private/source" }]) {
      expect(() => parse(value)).toThrow(InvalidConfigurationError);
      expect(() => parse(value)).toThrow(message);
    }
  });

  it.each(["a", "A0._:-", "a".repeat(128)])("preserves valid public identity %s without normalization", id => {
    const capture = createSimulatedCapture(loadLinearCaptureInput()).value;
    expect(parseSimulatedCapture({ ...capture, captureId: id }).captureId).toBe(id);
    expect(parseSensorRawFrameInput({ ...loadSensorRawFrameInput(), frameId: id }).frameId).toBe(id);
    const exported = loadPhotographicExportInput();
    expect(parsePhotographicExportInput({ ...exported,
      colorProfile: { ...exported.colorProfile, profileId: id } }).colorProfile.profileId).toBe(id);
  });

  it.each(["", "_leading", "/private/file", "https://example.com", "contains space", "é", "a".repeat(129)])(
    "rejects unsafe identity %s consistently without changing domain diagnostics", id => {
      const capture = createSimulatedCapture(loadLinearCaptureInput()).value;
      expect(() => parseSimulatedCapture({ ...capture, captureId: id }))
        .toThrow("Expected a public opaque ID, not a path or URL.");
      expect(() => parseSensorRawFrameInput({ ...loadSensorRawFrameInput(), frameId: id }))
        .toThrow("Invalid public RAW-frame ID.");
      const exported = loadPhotographicExportInput();
      expect(() => parsePhotographicExportInput({ ...exported,
        colorProfile: { ...exported.colorProfile, profileId: id } }))
        .toThrow("Invalid public export profile identity.");
    }
  );
});
