// SPDX-License-Identifier: Apache-2.0

import { createSimulatedCapture, type SensorRawFrameInput, type SensorRawCaptureSample } from "../../src/index.js";
import { loadLinearCaptureInput } from "./linear-capture-fixture.js";

export function loadSensorRawFrameInput(): SensorRawFrameInput {
  const raw = loadLinearCaptureInput(), raster = { pixelWidth: 2, pixelHeight: 2 };
  raw.geometry = { ...raw.geometry, nativeRaster: raster, outputRaster: raster };
  raw.planes = [{ ...raw.planes[0]!, pixelWidth: 2, pixelHeight: 2,
    storage: { kind: "inline-float64", samples: Array<number>(12).fill(0) } }];
  const evidence = [{ sourceOrigin: "photivra", sourceReference: "synthetic-frame-test", reuseStatus: "photivra-owned" }] as const;
  const channels = ["red", "green", "green", "blue"];
  const samples: SensorRawCaptureSample[] = channels.map((channelId, i) => ({ version: "0.1.0", captureModeId: "native",
    modeSampleCoordinateSystem: "capture-mode-full-frame-effective-sample-index",
    modeSampleIndexFullFrame: { x: i%2, y: Math.floor(i/2) }, colorSamplingProfileId: "cfa",
    colorSamplingSite: { x: i%2, y: Math.floor(i/2) }, channelId, rawCode: [0, 64, 512, 1023][i]!,
    blackLevelCode: 64, digitalSaturationCode: 1023, blackSubtractedNormalizedCode: ([0, 64, 512, 1023][i]!-64)/959,
    readoutProfileId: "readout", readoutRegimeId: "base", sourceChargeSeedUint32: i, sourceReadNoiseSeedUint32: i+4,
    physicalScalarSaturationApplied: false, digitalSaturationApplied: i===3,
    cfaPhasePreservedInNativeCoordinates: true, physicalOrientationApplied: false, outputRotationApplied: false,
    groupedModeCombinationApplied: false, reconstructionApplied: false, aliasingModeled: false, moireModeled: false }));
  return { frameId: "raw-frame", capture: createSimulatedCapture(raw).value, modeId: "native", containerBitDepth: 16,
    captureModeProfile: { schemaVersion: "0.1.0", modes: [{ modeId: "native", evidence,
      acquisition: { kind: "single-frame" }, perFrameSampling: { kind: "native-effective-raster" },
      processedImageRaster: { value: raster, evidence }, dependencies: ["color-sampling-model"] }] },
    colorSamplingProfile: { schemaVersion: "0.1.0", profileId: "cfa", evidence,
      coordinateSystem: "native-sensor-color-sampling-site-index", layout: { kind: "periodic-mosaic",
        repeatWidthSites: 2, repeatHeightSites: 2, siteChannelIds: channels, anchor: "native-sensor-top-left-site" } },
    bindingProfile: { schemaVersion: "0.1.0", bindingId: "native-cfa", colorSamplingProfileId: "cfa", nativeRaster: raster,
      evidence, relationship: { kind: "regular-native-effective-sample-blocks", sitesPerNativeSampleX: 1,
        sitesPerNativeSampleY: 1, anchor: "shared-native-top-left" } }, samples };
}
