// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import { calculateSdrRendering, parseSdrRenderingInput, parseSdrRenderingProfile, type SdrRenderingInput,
  type SdrRenderingProfile } from "../src/index.js";
import { loadBasicReferenceFixture } from "./helpers/basic-reference-fixture.js";
const fixture = loadBasicReferenceFixture();
const profile: SdrRenderingProfile = { schemaVersion: "0.1.0", profileId: "photivra-generic-neutral-sdr", profileVersion: "1",
  renderingExposureEv: 0, toneCurve: "identity", gamutHandling: "clip-components", outputDynamicRange: "sdr",
  transferFunction: "srgb", bitDepth: 8, rounding: "nearest-ties-up", dither: "none" };
function input(samples: number[] = [0, 1, .18, .0031308, .5, .25]): SdrRenderingInput {
  return { sourceImageStateId: "fixture-color-state", inputImageState: "color-transformed-linear-rgb", inputColorSpace: "linear-srgb-d65",
    whiteBalanceHandling: "already-applied-upstream", pixelWidth: 2, pixelHeight: 1, referenceWhiteValue: 1, samples,
    profile: { ...profile } };
}
describe("standalone SDR rendering foundation", () => {
  it("implements documented sRGB transfer including black, white, breakpoint and reference values", () => {
    const r = calculateSdrRendering(input()).value;
    expect(r.outputEncodedSamples[0]).toBe(0); expect(r.outputEncodedSamples[1]).toBe(1);
    expect(r.outputEncodedSamples[2]).toBeCloseTo(.46135612950044164, 13);
    expect(r.outputEncodedSamples[3]).toBeCloseTo(.040449936, 13);
    expect(r.outputEncodedSamples[4]).toBeCloseTo(.7353569830524495, 13);
    expect(r.integerSamples).toEqual([0, 255, 118, 10, 188, 137]);
    expect(r.outputEncoding.whitePointXy).toEqual([.3127, .3290]);
    expect(r.outputEncoding.referenceWhiteLuminanceCdM2).toBe(80);
    expect(r.displayAdaptation).toEqual({ kind: "external-platform", applied: false, displayCapabilities: "unknown" });
  });
  it("changes rendering exposure independently of canonical physical capture settings and normalizes reference value", () => {
    const physicalBefore = JSON.stringify(fixture), value = input([.125, .25, .5, 0, 1, .0625]);
    value.profile.renderingExposureEv = 1; value.referenceWhiteValue = 2;
    const r = calculateSdrRendering(value).value;
    expect(r.toneMappedLinearSamples).toEqual(value.samples); expect(JSON.stringify(fixture)).toBe(physicalBefore);
    value.profile.renderingExposureEv = 2;
    expect(calculateSdrRendering(value).value.toneMappedLinearSamples).toEqual([.25, .5, 1, 0, 2, .125]);
    expect(calculateSdrRendering(value).value.diagnostics.renderingAboveReferenceSampleCount).toBe(1);
  });
  it("keeps tone mapping and gamut clipping separately inspectable", () => {
    const value = input([-1, 0, 1, 2, 3, 4]); value.profile.toneCurve = "positive-reinhard-per-channel";
    const r = calculateSdrRendering(value).value;
    expect(r.toneMappedLinearSamples).toEqual([-1, 0, .5, 2/3, .75, .8]);
    expect(r.outputLinearSamples).toEqual([0, 0, .5, 2/3, .75, .8]);
    expect(r.diagnostics).toEqual({ renderingNegativeSampleCount: 1, renderingAboveReferenceSampleCount: 3,
      toneChangedSampleCount: 4, gamutClippedLowSampleCount: 1, gamutClippedHighSampleCount: 0, captureSaturation: "not-consumed" });
    const identity = calculateSdrRendering(input([-1, 0, 1, 2, 3, 4])).value;
    expect(identity.diagnostics.toneChangedSampleCount).toBe(0); expect(identity.diagnostics.gamutClippedHighSampleCount).toBe(3);
  });
  it("supports explicit rejection and deterministic 16-bit quantization without mutating inputs", () => {
    const value = input(); value.profile.gamutHandling = "reject-out-of-range"; value.profile.bitDepth = 16;
    const before = JSON.stringify(value), r = calculateSdrRendering(value).value;
    expect(r.outputEncoding.codeMaximum).toBe(65535); expect(r.integerSamples[0]).toBe(0); expect(r.integerSamples[1]).toBe(65535);
    expect(JSON.stringify(value)).toBe(before); expect(calculateSdrRendering(value).value).toEqual(r);
    value.samples = [-.01, 0, 0, 1, 1, 1]; expect(() => calculateSdrRendering(value)).toThrow();
    value.samples = [1.01, 0, 0, 1, 1, 1]; expect(() => calculateSdrRendering(value)).toThrow();
    value.whiteBalanceHandling = "not-required"; value.samples = [0, 0, 0, 1, 1, 1];
    expect(calculateSdrRendering(value).value.whiteBalanceHandling).toBe("not-required");
  });
  it("rejects unresolved WB/color, unsupported HDR/display policies, private metadata and malformed input", () => {
    for (const patch of [{ schemaVersion: "2" }, { profileId: "/private" }, { renderingExposureEv: NaN }, { renderingExposureEv: 33 },
      { toneCurve: "unknown" }, { gamutHandling: "unknown" }, { outputDynamicRange: "hdr" }, { transferFunction: "pq" },
      { bitDepth: 10 }, { rounding: "nearest-even" }, { dither: "random" }, { display: "hidden" }]) {
      expect(() => parseSdrRenderingProfile({ ...profile, ...patch })).toThrow();
    }
    const value = input();
    for (const patch of [{ sourceImageStateId: "https://private" }, { inputImageState: "scene-referred-xyz" },
      { inputColorSpace: "unknown" }, { whiteBalanceHandling: "intent-only" }, { pixelWidth: 1.5 }, { pixelHeight: 0 },
      { referenceWhiteValue: 0 }, { referenceWhiteValue: Infinity }, { samples: Array(6) },
      { samples: [Infinity, 1, 2, 3, 4, 5] }, { samples: [NaN, 1, 2, 3, 4, 5] }, { samples: [0] }, { debug: "private" }]) {
      expect(() => parseSdrRenderingInput({ ...value, ...patch })).toThrow();
    }
    expect(() => parseSdrRenderingInput({ ...value, pixelWidth: 100000, pixelHeight: 1, samples: Array<number>(300000).fill(0) })).toThrow();
    expect(() => parseSdrRenderingInput(null)).toThrow(); expect(() => parseSdrRenderingProfile(null)).toThrow();
  });
  it("fails on non-finite arithmetic before tone/clipping can hide it, preserves signed-zero identity", () => {
    const value = input([Number.MAX_VALUE, 0, 0, 0, 0, 0]); value.profile.renderingExposureEv = 1;
    value.profile.toneCurve = "positive-reinhard-per-channel";
    expect(() => calculateSdrRendering(value)).toThrow();
    value.referenceWhiteValue = Number.MIN_VALUE;
    expect(() => calculateSdrRendering(value)).toThrow();
    const zero = parseSdrRenderingInput(input([-0, 0, 0, 0, 0, 0]));
    expect(Object.is(zero.samples[0], -0)).toBe(false);
    expect(calculateSdrRendering(zero).value.integerSamples).toEqual([0, 0, 0, 0, 0, 0]);
  });
  it("rounds low-branch encoded half-code ties and keeps the power branch distinct at its threshold", () => {
    const r = calculateSdrRendering(input([.5/(255*12.92), 1.5/(255*12.92), 2.5/(255*12.92),
      .0031308, .0031308+1e-12, .0031308-1e-12])).value;
    expect(r.integerSamples.slice(0, 3)).toEqual([1, 2, 3]);
    expect(r.outputEncodedSamples[3]).toBeCloseTo(.040449936, 13);
    expect(r.outputEncodedSamples[4]).toBeCloseTo(.0404499074953966, 10);
    expect(r.outputEncodedSamples[5]).toBeCloseTo(.04044993598708, 13);
  });
});
