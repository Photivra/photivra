// SPDX-License-Identifier: Apache-2.0
import { createSimulatedCapture, createSensorRawFrame, type CaptureOrientation, type PhotographicExportInput } from "../../src/index.js";
import { loadPhotographicExportInput } from "./photographic-export-fixture.js";
import { loadSensorRawFrameInput } from "./sensor-raw-frame-fixture.js";

/** Owned post-ADC tile grating. No optical/radiometric/noise acquisition claim. */
export function printDetailJpegInput(orientation: CaptureOrientation, quantizationStep: number): PhotographicExportInput {
  const input = loadPhotographicExportInput(), raw = loadSensorRawFrameInput(), c = input.reconstruction.rawFrame.capture;
  const { schemaVersion: _s, engineApiVersion: _e, resolvedGeometry: _g, equivalentFocalLength35Mm: _f, ...capture } = c;
  void _s; void _e; void _g; void _f;
  const native = { pixelWidth: 20, pixelHeight: 16 };
  const orientationIndex = ["landscape", "portrait-clockwise", "landscape-inverted", "portrait-counter-clockwise"].indexOf(orientation);
  const caseIndex = orientationIndex * 2 + (quantizationStep === 1 ? 0 : 1);
  const uuid = (n: number): string => "00000000-0000-4000-8000-" + n.toString(16).padStart(12, "0");
  const portrait = orientation.startsWith("portrait");
  const output = portrait ? { pixelWidth: 16, pixelHeight: 20 } : native;
  raw.capture = createSimulatedCapture({ ...capture, captureId: uuid(0x300 + orientationIndex), geometry: { imagingArea: { widthMm: 40, heightMm: 32 },
    nativeRaster: native, outputRaster: output, orientation },
    planes: [{ ...capture.planes[0]!, ...output, storage: { kind: "inline-float64", samples: Array<number>(20 * 16 * 3).fill(0) } }] }).value;
  raw.bindingProfile.nativeRaster = native;
  raw.captureModeProfile.modes = raw.captureModeProfile.modes.map(m => ({ ...m, processedImageRaster: { ...m.processedImageRaster, value: native } }));
  const templates = raw.samples;
  raw.samples = Array.from({ length: 20 * 16 }, (_, i) => {
    const x = i % 20, y = Math.floor(i / 20), template = templates[(y % 2) * 2 + x % 2]!;
    // Each complete Bayer tile has equal channel codes: neutral under the declared ideal test profile.
    const code = 64 + [576, 384, 192, 384][Math.floor(x / 2) % 4]!;
    return { ...template, modeSampleIndexFullFrame: { x, y }, colorSamplingSite: { x, y }, rawCode: code,
      blackSubtractedNormalizedCode: (code - 64) / 959, digitalSaturationApplied: false,
      sourceChargeSeedUint32: i, sourceReadNoiseSeedUint32: i + 320 };
  });
  input.reconstruction = { ...input.reconstruction, rawFrame: createSensorRawFrame(raw), region: { x: 0, y: 0, width: 20, height: 16 } };
  input.sceneProfile.id = "owned-post-adc-tile-grating";
  input.metadata.raw = { documentId: uuid(0x3000 + caseIndex * 4), instanceId: uuid(0x3001 + caseIndex * 4) };
  input.metadata.jpeg = { documentId: uuid(0x3002 + caseIndex * 4), instanceId: uuid(0x3003 + caseIndex * 4) };
  input.jpegQuantizationStep = quantizationStep;
  return input;
}

export const PRINT_DETAIL_JPEG_CASES = (["landscape", "portrait-clockwise", "landscape-inverted", "portrait-counter-clockwise"] as const)
  .flatMap(orientation => [1, 32].map(quantizationStep => ({ orientation, quantizationStep, name: orientation + "-q" + quantizationStep })));
