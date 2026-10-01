// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { createSimulatedCapture, createSensorRawFrame, parseSensorRawFrameInput,
  type SensorRawFrameInput, type SensorRawCaptureSample } from "../src/index.js";
import { loadLinearCaptureInput } from "./helpers/linear-capture-fixture.js";

function input(): SensorRawFrameInput {
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
describe("sensor RAW frame attachment", () => {
  it("preserves exact native codes, below-black values, CFA phase and capture metadata without rendering", () => {
    const v = input(), before = JSON.stringify(v), r = createSensorRawFrame(v);
    expect(r.samples.map((s) => s.rawCode)).toEqual([0, 64, 512, 1023]);
    expect(r.samples[0]!.blackSubtractedNormalizedCode).toBe(-64/959);
    expect(r.samples.map((s) => s.channelId)).toEqual(["red", "green", "green", "blue"]);
    expect(r.capture.exposure).toEqual(v.capture.exposure); expect(r.capture.noise).toEqual(v.capture.noise);
    expect(r.producerBinding).toBe("caller-declared-capture-attachment"); expect(r.renderingApplied).toBe(false);
    expect(JSON.stringify(v)).toBe(before); expect(createSensorRawFrame(v)).toEqual(r);
    expect(Object.isFrozen(r.samples[0])).toBe(true); expect(Object.isFrozen(v.samples[0])).toBe(false);
    v.samples[0]!.rawCode = 12; expect(r.samples[0]!.rawCode).toBe(0);
  });
  it("keeps RAW native coordinates through all physical orientations and off-center active crops", () => {
    for (const orientation of ["landscape", "portrait-clockwise", "landscape-inverted", "portrait-counter-clockwise"] as const) {
      const v = input(), c = loadLinearCaptureInput();
      c.geometry = { ...c.geometry, nativeRaster: { pixelWidth: 2, pixelHeight: 2 }, orientation,
        activeCaptureRect: { x: 1, y: 0, width: 1, height: 2 }, outputRaster: { pixelWidth: 1, pixelHeight: 1 } };
      c.planes = [{ ...c.planes[0]!, pixelWidth: 1, pixelHeight: 1, storage: { kind: "inline-float64", samples: [0, 0, 0] } }];
      v.capture = createSimulatedCapture(c).value;
      const r = createSensorRawFrame(v); expect(r.capture.geometry.orientation).toBe(orientation);
      expect(r.samples.map((s) => s.colorSamplingSite)).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }]);
      expect(r.nativePixelWidth).toBe(2); expect(r.nativePixelHeight).toBe(2);
    }
  });
  it("rejects missing, duplicate, reordered, sparse and wrong-channel sites", () => {
    const v = input();
    expect(() => parseSensorRawFrameInput({ ...v, samples: v.samples.slice(1) })).toThrow();
    expect(() => parseSensorRawFrameInput({ ...v, samples: [v.samples[0], v.samples[0], ...v.samples.slice(2)] })).toThrow();
    expect(() => parseSensorRawFrameInput({ ...v, samples: [...v.samples].reverse() })).toThrow();
    expect(() => parseSensorRawFrameInput({ ...v, samples: Array(4) })).toThrow();
    v.samples[0]!.channelId = "green"; expect(() => createSensorRawFrame(v)).toThrow();
  });
  it("rejects processed/grouped flags, malformed code metadata, private fields and mixed readout identity", () => {
    for (const patch of [{ reconstructionApplied: true }, { physicalOrientationApplied: true }, { outputRotationApplied: true },
      { groupedModeCombinationApplied: true }, { cfaPhasePreservedInNativeCoordinates: false }, { version: "2" },
      { rawCode: NaN }, { rawCode: 1.5 }, { rawCode: 1024 }, { blackLevelCode: 1023 }, { digitalSaturationCode: 70000 },
      { blackSubtractedNormalizedCode: 0 }, { sourceChargeSeedUint32: -1 }, { sourceReadNoiseSeedUint32: 4294967296 },
      { physicalScalarSaturationApplied: "unknown" }, { debug: "private" }, { colorSamplingSite: { x: 1, y: 0 } }]) {
      const v = input(); expect(() => parseSensorRawFrameInput({ ...v, samples: [{ ...v.samples[0], ...patch }, ...v.samples.slice(1)] })).toThrow();
    }
    const v = input(); v.samples[1]!.readoutProfileId = "other"; expect(() => createSensorRawFrame(v)).toThrow();
    for (const patch of [{ frameId: "/private" }, { modeId: "missing" }, { containerBitDepth: 8 }, { debug: true }, { samples: null }]) {
      expect(() => parseSensorRawFrameInput({ ...input(), ...patch })).toThrow();
    }
    expect(() => parseSensorRawFrameInput(null)).toThrow();
  });
  it("requires the exact one-site binding and periodic native single-frame mode", () => {
    const v = input(); v.bindingProfile.nativeRaster = { pixelWidth: 3, pixelHeight: 2 };
    expect(() => createSensorRawFrame(v)).toThrow();
    const other = input(); other.bindingProfile.relationship.sitesPerNativeSampleX = 2;
    expect(() => createSensorRawFrame(other)).toThrow();
    const mono = input(); mono.colorSamplingProfile.layout = { kind: "monochrome", channelId: "mono" };
    expect(() => createSensorRawFrame(mono)).toThrow();
    const mode = input(); mode.captureModeProfile.modes = [];
    expect(() => createSensorRawFrame(mode)).toThrow();
    const remosaic = input(); remosaic.captureModeProfile.modes[0]!.reconstructionStages = [{ value: "remosaic",
      evidence: remosaic.colorSamplingProfile.evidence }]; expect(() => createSensorRawFrame(remosaic)).toThrow();
    const multi = input(); multi.captureModeProfile.modes[0]!.acquisition = { kind: "fixed-multi-frame",
      frameCount: { value: 2, evidence: multi.colorSamplingProfile.evidence } };
    expect(() => createSensorRawFrame(multi)).toThrow();
  });
  it("rejects frames beyond the declared execution bound before per-site materialization", () => {
    const v = input(), raw = loadLinearCaptureInput(), raster = { pixelWidth: 300, pixelHeight: 300 };
    raw.geometry = { ...raw.geometry, nativeRaster: raster, outputRaster: { pixelWidth: 2, pixelHeight: 1 } };
    v.capture = createSimulatedCapture(raw).value;
    expect(() => parseSensorRawFrameInput({ ...v, samples: Array(90000).fill(v.samples[0]) })).toThrow();
  });
});
