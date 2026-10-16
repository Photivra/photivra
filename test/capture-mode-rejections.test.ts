// SPDX-License-Identifier: Apache-2.0
import { describe, it } from "vitest";
import { InvalidConfigurationError, InvalidScientificInputError, parseCaptureModeProfile, resolveCaptureMode } from "../src/index.js";
import { expectRejection, type Json, type RejectionCase } from "./helpers/rejection-table.js";

const evidence = [{ sourceOrigin: "photivra", sourceReference: "test:capture-mode-rejections", reuseStatus: "photivra-owned" }];
const fact = (value: unknown): Json => ({ value, evidence });

/** Valid profile exercising every axis: fixed multi-frame shift, grouped sampling, stages, dependencies. */
function base(): Json {
  return {
    schemaVersion: "0.1.0",
    modes: [
      { modeId: "single", evidence, acquisition: { kind: "single-frame" }, perFrameSampling: { kind: "native-effective-raster" },
        processedImageRaster: fact({ pixelWidth: 60, pixelHeight: 40 }) },
      { modeId: "shift", evidence, acquisition: { kind: "fixed-multi-frame", frameCount: fact(2) },
        perFrameSampling: { kind: "grouped-native-samples", groupWidthSamples: fact(2), groupHeightSamples: fact(2),
          combinationDomain: fact("charge-domain") },
        interFrameSensorOffsetsNativeSamples: fact([{ x: 0, y: 0 }, { x: 1, y: 0 }]),
        reconstructionStages: [fact("pixel-shift-combination")], processedImageRaster: fact({ pixelWidth: 30, pixelHeight: 20 }),
        dependencies: ["inter-frame-registration"] },
      { modeId: "burst", evidence, acquisition: { kind: "variable-multi-frame", evidence, minimumFrameCount: fact(2), maximumFrameCount: fact(8) },
        perFrameSampling: { kind: "declared-effective-raster", raster: fact({ pixelWidth: 60, pixelHeight: 40 }) },
        processedImageRaster: fact({ pixelWidth: 60, pixelHeight: 40 }) }
    ]
  };
}

const cases: RejectionCase[] = [
  ["a non-object mode", (p): void => { p.modes[0] = []; }, "captureModes.modes[0] must be an object."],
  ["a blank modeId", (p): void => { p.modes[0].modeId = " "; }, ".modeId must be a non-empty string."],
  ["a non-integer frame count", (p): void => { p.modes[1].acquisition.frameCount.value = 2.5; }, " must be a positive safe integer."],
  ["a raster whose sample count overflows", (p): void => { p.modes[0].processedImageRaster.value = { pixelWidth: 2 ** 30, pixelHeight: 2 ** 30 }; },
    "total sample count must be a safe integer."],
  ["an unknown combination domain", (p): void => { p.modes[1].perFrameSampling.combinationDomain.value = "optical"; }, "combinationDomain.value is invalid."],
  ["single-frame acquisition with a frame count", (p): void => { p.modes[0].acquisition.frameCount = fact(1); },
    "single-frame acquisition must omit frame-count and evidence fields."],
  ["fixed-multi-frame acquisition with bounds", (p): void => { p.modes[1].acquisition.minimumFrameCount = fact(2); },
    "fixed-multi-frame acquisition must use frameCount only."],
  ["fixed-multi-frame acquisition of one frame", (p): void => { p.modes[1].acquisition.frameCount = fact(1); },
    ".frameCount.value must be at least 2 for fixed-multi-frame acquisition."],
  ["variable-multi-frame acquisition with a fixed count", (p): void => { p.modes[2].acquisition.frameCount = fact(3); },
    ".frameCount must be omitted for variable-multi-frame acquisition."],
  ["a variable minimum below 2", (p): void => { p.modes[2].acquisition.minimumFrameCount = fact(1); },
    ".minimumFrameCount.value must be at least 2 for variable-multi-frame acquisition."],
  ["a variable maximum below 2", (p): void => { delete p.modes[2].acquisition.minimumFrameCount; p.modes[2].acquisition.maximumFrameCount = fact(1); },
    ".maximumFrameCount.value must be at least 2 for variable-multi-frame acquisition."],
  ["an unknown acquisition kind", (p): void => { p.modes[0].acquisition = { kind: "video" }; }, ".acquisition.kind is invalid."],
  ["native sampling with grouping fields", (p): void => { p.modes[0].perFrameSampling.raster = fact({ pixelWidth: 1, pixelHeight: 1 }); },
    "native-effective-raster sampling must omit grouping/raster fields."],
  ["grouped sampling with a raster", (p): void => { p.modes[1].perFrameSampling.raster = fact({ pixelWidth: 1, pixelHeight: 1 }); },
    ".raster must be omitted for grouped-native-samples sampling."],
  ["declared sampling with grouping fields", (p): void => { p.modes[2].perFrameSampling.groupWidthSamples = fact(2); },
    "declared-effective-raster sampling must omit grouping fields."],
  ["an unknown sampling kind", (p): void => { p.modes[0].perFrameSampling = { kind: "binned" }; }, ".perFrameSampling.kind is invalid."],
  ["empty sensor offsets", (p): void => { p.modes[1].interFrameSensorOffsetsNativeSamples.value = []; }, ".value must be a non-empty array."],
  ["a non-finite sensor offset", (p): void => { p.modes[1].interFrameSensorOffsetsNativeSamples.value[1].x = Number.NaN; },
    ".value[1] x/y must be finite numbers."],
  ["non-array reconstruction stages", (p): void => { p.modes[1].reconstructionStages = fact("remosaic"); }, ".reconstructionStages must be an array."],
  ["an unknown reconstruction stage", (p): void => { p.modes[1].reconstructionStages = [fact("super-resolution")]; }, ".reconstructionStages[0].value is invalid."],
  ["non-array dependencies", (p): void => { p.modes[1].dependencies = "inter-frame-registration"; }, ".dependencies must be an array."],
  ["an unknown dependency", (p): void => { p.modes[1].dependencies = ["lens-calibration"]; }, ".dependencies[0] is invalid."],
  ["sensor offsets on variable acquisition", (p): void => { p.modes[2].interFrameSensorOffsetsNativeSamples = fact([{ x: 0, y: 0 }]); },
    ".interFrameSensorOffsetsNativeSamples is supported only for fixed-multi-frame acquisition."],
  ["an unsupported schema version", (p): void => { p.schemaVersion = "0.2.0"; }, 'captureModes.schemaVersion must be "0.1.0".']
];

describe("capture-mode profile rejection branches", () => {
  it("accepts the valid base profile", () => { parseCaptureModeProfile(base()); });
  it.each(cases)("rejects %s", (_name, mutate, message) => {
    expectRejection(base, parseCaptureModeProfile, InvalidConfigurationError, mutate, message);
  });

  const resolve = (input: Json): unknown => resolveCaptureMode(input);
  const resolveBase = (): Json => ({ nativeRaster: { pixelWidth: 60, pixelHeight: 40 }, profile: base(), modeId: "shift" });
  it.each([
    ["a native raster whose sample count overflows", (i: Json): void => { i.nativeRaster = { pixelWidth: 2 ** 30, pixelHeight: 2 ** 30 }; },
      "nativeRaster total image-sample count must be a safe integer."],
    ["a blank modeId", (i: Json): void => { i.modeId = ""; }, "modeId must be a non-empty string."],
    ["an undeclared modeId", (i: Json): void => { i.modeId = "night"; }, "modeId does not exist in the supplied capture-mode profile."]
  ] as RejectionCase[])("resolution rejects %s", (_name, mutate, message) => {
    expectRejection(resolveBase, resolve, InvalidScientificInputError, mutate, message);
  });
});
