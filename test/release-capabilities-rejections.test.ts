// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { InvalidConfigurationError, parseGenericReleaseCapabilityProfile } from "../src/index.js";
import { expectRejection, type Json, type RejectionCase } from "./helpers/rejection-table.js";

const evidence = [{ sourceOrigin: "photivra", sourceReference: "test:release-rejections", reuseStatus: "photivra-owned" }];
const fact = (value: unknown): Json => ({ value, evidence });

function base(): Json {
  return { schemaVersion: "0.1.0", profileId: "generic-release", profileVersion: "1.0.0", scientificStatus: "approximation", evidence,
    supportedDriveModes: fact(["single", "burst", "self-timer"]), maximumLogicalFramesPerSequence: fact(20), maximumCadenceFps: fact(10),
    minimumInterFrameGapSeconds: fact(0.01), overlappingOrdinaryStillExposures: false,
    exposureBracketing: { availability: fact("supported"), supportedAxes: ["shutter", "iso", "aperture"] },
    focusBracketing: { availability: fact("unknown") } };
}

const cases: RejectionCase[] = [
  ["a non-object bracketing record", (p): void => { p.focusBracketing = []; }, "focusBracketing must be an object."],
  ["a blank profile id", (p): void => { p.profileId = " "; }, ".profileId must be a non-empty string."],
  ["a zero cadence", (p): void => { p.maximumCadenceFps.value = 0; }, ".maximumCadenceFps.value must be finite and greater than zero."],
  ["a negative inter-frame gap", (p): void => { p.minimumInterFrameGapSeconds.value = -0.001; },
    ".minimumInterFrameGapSeconds.value must be finite and greater than or equal to zero."],
  ["a fractional frame count", (p): void => { p.maximumLogicalFramesPerSequence.value = 2.5; }, " must be a positive safe integer."],
  ["an unknown availability", (p): void => { p.focusBracketing.availability.value = "maybe"; }, ".availability.value is invalid."],
  ["empty drive modes", (p): void => { p.supportedDriveModes.value = []; }, ".supportedDriveModes.value must be a non-empty array."],
  ["an unknown drive mode", (p): void => { p.supportedDriveModes.value = ["single", "continuous-high"]; }, ".supportedDriveModes.value[1]"],
  ["duplicate drive modes", (p): void => { p.supportedDriveModes.value = ["single", "single"]; }, ".supportedDriveModes.value must not contain duplicates."],
  ["non-array bracket axes", (p): void => { p.exposureBracketing.supportedAxes = "iso"; }, ".supportedAxes must be an array."],
  ["an unknown bracket axis", (p): void => { p.exposureBracketing.supportedAxes = ["focus"]; }, ".supportedAxes[0]"],
  ["duplicate bracket axes", (p): void => { p.exposureBracketing.supportedAxes = ["iso", "iso"]; }, ".supportedAxes must not contain duplicates."],
  ["axes on unsupported bracketing", (p): void => { p.exposureBracketing.availability.value = "unsupported"; },
    "Unsupported/unknown exposure bracketing must not declare supported axes."],
  ["a calibrated status", (p): void => { p.scientificStatus = "calibrated"; }, 'scientificStatus must be "approximation".'],
  ["overlapping exposures", (p): void => { p.overlappingOrdinaryStillExposures = true; }, "overlappingOrdinaryStillExposures must be false"]
];

describe("generic release capability profile rejection branches", () => {
  it("accepts the valid base profile", () => {
    expect(parseGenericReleaseCapabilityProfile(base()).focusBracketing.availability.value).toBe("unknown");
  });
  it.each(cases)("rejects %s", (_name, mutate, message) => {
    expectRejection(base, parseGenericReleaseCapabilityProfile, InvalidConfigurationError, mutate, message);
  });
});
