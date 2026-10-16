// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import { calculateSdrRendering, parseSdrRenderingInput, parseSdrRenderingProfile, type SdrRenderingInput,
  type SdrRenderingProfile } from "../src/index.js";
import { loadBasicReferenceFixture } from "./helpers/basic-reference-fixture.js";
import { resolveCaptureColorModel } from "../src/color/capture-color.js";
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
  it("adds luminance tone curves that preserve chromaticity and map the declared white to 1", () => {
    const y = resolveCaptureColorModel().cameraRgbToXyz[1]!, lum = (r: number, g: number, b: number): number => y[0]!*r+y[1]!*g+y[2]!*b;
    const white = 2.5, ext = input([white, white, white, .18, .18, .18]);
    ext.profile = { ...profile, toneCurve: "extended-reinhard-luminance", toneCurveParameters: { whiteLuminance: white } };
    const e = calculateSdrRendering(ext).value;
    // Reinhard et al. 2002 eq. 4: Ld = L(1+L/Lw²)/(1+L); L=Lw maps to 1 (within rounding).
    for (const v of e.toneMappedLinearSamples.slice(0, 3)) expect(v).toBeCloseTo(1, 14);
    const l18 = lum(.18, .18, .18);
    for (const v of e.toneMappedLinearSamples.slice(3)) expect(v).toBeCloseTo(.18*(l18*(1+l18/(white*white))/(1+l18))/l18, 14);
    // Chromaticity: channel ratios survive tone mapping for a coloured pixel.
    const colour = input([.9, .4, .1, 3, 2, 1]); colour.profile = ext.profile;
    const c = calculateSdrRendering(colour).value.toneMappedLinearSamples;
    expect(c[0]!/c[1]!).toBeCloseTo(.9/.4, 12); expect(c[2]!/c[1]!).toBeCloseTo(.1/.4, 12);
    expect(c[3]!/c[4]!).toBeCloseTo(1.5, 12); expect(lum(c[3]!, c[4]!, c[5]!)).toBeLessThan(lum(3, 2, 1));
    // Naka-Rushton: g(L)=Lⁿ/(Lⁿ+σⁿ) normalized by g(Lw); σ maps to 0.5/g(Lw) and Lw to 1.
    const nr = input([1, 1, 1, .4, .4, .4]), n = 1.4, sigma = .4;
    nr.profile = { ...profile, toneCurve: "naka-rushton-luminance", toneCurveParameters: { exponent: n, semiSaturation: sigma, whiteLuminance: lum(1, 1, 1) } };
    const t = calculateSdrRendering(nr).value.toneMappedLinearSamples, gw = 1/(1+(sigma/lum(1, 1, 1))**n);
    for (const v of t.slice(0, 3)) expect(v).toBeCloseTo(1, 14);
    const l4 = lum(.4, .4, .4);
    for (const v of t.slice(3)) expect(v).toBeCloseTo(.4*(1/(1+(sigma/l4)**n))/gw/l4, 14);
    // Monotone in luminance; zero/negative luminance is left for gamut handling.
    const ramp = input([.01, .01, .01, .1, .1, .1]); ramp.profile = nr.profile; ramp.pixelWidth = 2;
    const rr = calculateSdrRendering(ramp).value.toneMappedLinearSamples; expect(rr[3]!).toBeGreaterThan(rr[0]!);
    const neg = input([-.2, 0, 0, 0, 0, 0]); neg.profile = nr.profile;
    expect(calculateSdrRendering(neg).value.toneMappedLinearSamples.slice(0, 3)).toEqual([-.2, 0, 0]);
  });
  it("validates tone-curve parameters exactly and keeps existing curves parameter-free", () => {
    for (const patch of [{ toneCurve: "identity", toneCurveParameters: { whiteLuminance: 1 } },
      { toneCurve: "extended-reinhard-luminance" }, { toneCurve: "extended-reinhard-luminance", toneCurveParameters: { whiteLuminance: 0 } },
      { toneCurve: "extended-reinhard-luminance", toneCurveParameters: { whiteLuminance: 1, exponent: 1 } },
      { toneCurve: "naka-rushton-luminance", toneCurveParameters: { exponent: .1, semiSaturation: .2, whiteLuminance: 1 } },
      { toneCurve: "naka-rushton-luminance", toneCurveParameters: { exponent: 1, semiSaturation: 65, whiteLuminance: 1 } },
      { toneCurve: "naka-rushton-luminance", toneCurveParameters: { exponent: 1, semiSaturation: .2 } }]) {
      expect(() => parseSdrRenderingProfile({ ...profile, ...patch })).toThrow();
    }
    expect(parseSdrRenderingProfile(profile)).not.toHaveProperty("toneCurveParameters");
    expect(parseSdrRenderingProfile({ ...profile, toneCurve: "extended-reinhard-luminance", toneCurveParameters: { whiteLuminance: 4 } }).toneCurveParameters)
      .toEqual({ whiteLuminance: 4 });
    const provenance = calculateSdrRendering(input()).provenance; expect([provenance.model, provenance.modelVersion]).toEqual(["generic-sdr-rendering-reference", "0.2.0"]);
  });
});
