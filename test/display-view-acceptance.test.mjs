// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { cielabOfXyz, deltaE2000 } from "../src/color/color-difference.ts";
import { resolveRgbColorSpace } from "../src/color/rgb-color-spaces.ts";
import { DEFAULT_THRESHOLDS, createAcceptanceMetrics, differenceImage8, judge, srgbCode8, summarize } from "../scripts/lib/display-view-acceptance.mjs";

const srgb = resolveRgbColorSpace("srgb").value;
const { labOfLinearSrgb, deltaEOfLinearSrgb, compareExpectedImages } = createAcceptanceMetrics({ deltaE2000, cielabOfXyz, srgb });

/*
 * No published CIEDE2000 test pairs are asserted (owner decision, THIRD_PARTY.md: the Sharma et al. data file carries no
 * licence). The colour checks below are identities computed in the test from the definitions: the engine's own CIEDE2000
 * is the formula under test for the harness only in that the harness calls it.
 */
describe("display-view acceptance colour metrics (scripts/lib/display-view-acceptance.mjs)", () => {
  it("maps sRGB display values to CIELAB with the D65 white at L* = 100 on a neutral axis, clamping to the display range", () => {
    const white = labOfLinearSrgb(1, 1, 1);
    expect(white.lStar).toBeCloseTo(100, 9); expect(white.aStar).toBeCloseTo(0, 9); expect(white.bStar).toBeCloseTo(0, 9);
    expect(labOfLinearSrgb(0, 0, 0)).toEqual({ lStar: 0, aStar: 0, bStar: 0 });
    // 18 % grey: Y = 0.18, L* = 116 · 0.18^(1/3) − 16 (CIE 15, above the linear segment); neutral because RGB (1, 1, 1) is the white.
    const grey = labOfLinearSrgb(0.18, 0.18, 0.18);
    expect(grey.lStar).toBeCloseTo(116 * Math.cbrt(0.18) - 16, 9); expect(grey.aStar).toBeCloseTo(0, 9); expect(grey.bStar).toBeCloseTo(0, 9);
    expect(labOfLinearSrgb(1.5, 1.5, 1.5)).toEqual(labOfLinearSrgb(1, 1, 1));
    expect(labOfLinearSrgb(-0.2, 0.5, 0.5)).toEqual(labOfLinearSrgb(0, 0.5, 0.5));
    // A red display colour has positive a* (CIELAB's red–green axis).
    expect(labOfLinearSrgb(1, 0, 0).aStar).toBeGreaterThan(0);
    expect(srgbCode8(1.5)).toBeCloseTo(255, 9); expect(srgbCode8(-0.1)).toBe(0); expect(srgbCode8(1)).toBeCloseTo(255, 9);
    expect(srgbCode8(0.0031308)).toBeCloseTo(255 * 0.0031308 * 12.92, 9);
  });
  it("ΔE2000 of display colours is zero for identical colours, symmetric, and on the neutral axis equals |ΔL*| / S_L of the definition", () => {
    for (const c of [[0, 0, 0], [1, 1, 1], [0.18, 0.18, 0.18], [0.7, 0.2, 0.1], [0.1, 0.3, 0.9]]) expect(deltaEOfLinearSrgb(c, c)).toBe(0);
    const a = [0.7, 0.2, 0.1], b = [0.1, 0.3, 0.9];
    expect(deltaEOfLinearSrgb(a, b)).toBeCloseTo(deltaEOfLinearSrgb(b, a), 12);
    expect(deltaEOfLinearSrgb(a, b)).toBeGreaterThan(2.3);
    // Two neutrals: a* = b* = 0, so C' = 0, ΔC' = ΔH' = 0 and ΔE00 = |ΔL'| / S_L with S_L = 1 + 0.015 (L̄ − 50)² / √(20 + (L̄ − 50)²).
    const l1 = labOfLinearSrgb(0.18, 0.18, 0.18).lStar, l2 = labOfLinearSrgb(0.2, 0.2, 0.2).lStar, lBar50 = ((l1 + l2) / 2 - 50) ** 2;
    expect(deltaEOfLinearSrgb([0.18, 0.18, 0.18], [0.2, 0.2, 0.2])).toBeCloseTo(Math.abs(l2 - l1) / (1 + 0.015 * lBar50 / Math.sqrt(20 + lBar50)), 12);
    // A one-code step of 18 % grey (code 118 → 119) is well within ΔE 1; the harness's within-ΔE-1 criterion resolves such steps.
    const code = (v) => Math.pow((v / 255 + 0.055) / 1.055, 2.4);
    expect(deltaEOfLinearSrgb([code(118), code(118), code(118)], [code(119), code(119), code(119)])).toBeLessThan(1);
    expect(deltaEOfLinearSrgb([code(118), code(118), code(118)], [code(119), code(119), code(119)])).toBeGreaterThan(0.2);
  });
});

describe("display-view acceptance reduction (scripts/lib/display-view-acceptance.mjs)", () => {
  // Four display pixels: identical; moved by half its σ in one component; moved by 2 σ in one component; a σ of zero with a non-zero difference.
  const width = 4, height = 1, g = 0.18;
  const reference = Float64Array.from([g, g, g, g, g, g, g, g, g, g, g, g]);
  const sigma = Float64Array.from([0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.02, 0.01, 0.01, 0, 0.01]);
  const candidate = Float64Array.from([g, g, g, g + 0.005, g, g, g, g + 0.04, g, g, g + 1e-6, g]);

  it("reports the identical image as exactly zero everywhere", () => {
    const m = compareExpectedImages({ width, height, reference, candidate: reference, referenceNoiseStd: sigma, candidateNoiseStd: sigma });
    expect(m).toMatchObject({ pixels: 4, withinFraction: 1, maxDeltaE: 0, meanDeltaE: 0, maxSigma: 0, maxCode8: 0, identicalPixels: 4, identicalFraction: 1, maxNoiseStdRelativeDifference: 0 });
    expect([...m.deltaE]).toEqual([0, 0, 0, 0]); expect([...m.sigma]).toEqual([0, 0, 0, 0]);
    expect(judge(m).pass).toBe(true);
    expect([...differenceImage8(reference, reference)]).toEqual(Array(12).fill(0));
  });
  it("measures each pixel's ΔE2000 and largest |Δ| / σ and locates the maxima", () => {
    const m = compareExpectedImages({ width, height, reference, candidate, referenceNoiseStd: sigma });
    expect(m.identicalPixels).toBe(1);
    expect(m.deltaE[0]).toBe(0);
    expect(m.deltaE[1]).toBeCloseTo(deltaEOfLinearSrgb([g, g, g], [g + 0.005, g, g]), 12);
    expect(m.deltaE[2]).toBeCloseTo(deltaEOfLinearSrgb([g, g, g], [g, g + 0.04, g]), 12);
    expect(m.sigma[1]).toBeCloseTo(0.5, 12); expect(m.sigma[2]).toBeCloseTo(2, 12); expect(m.sigma[3]).toBe(Infinity);
    expect(m.maxSigma).toBe(Infinity); expect(m.maxSigmaAt).toEqual({ x: 3, y: 0 });
    expect(m.maxDeltaE).toBe(m.deltaE[2]); expect(m.maxDeltaEAt).toEqual({ x: 2, y: 0 });
    expect(m.meanDeltaE).toBeCloseTo((m.deltaE[0] + m.deltaE[1] + m.deltaE[2] + m.deltaE[3]) / 4, 12);
    expect(m.maxDeltaE).toBeGreaterThan(1);
    expect(m.withinFraction).toBe(0.75);
    expect(m.maxCode8).toBeCloseTo(srgbCode8(g + 0.04) - srgbCode8(g), 12);
    expect(m.maxNoiseStdRelativeDifference).toBeUndefined();
    const v = judge(m);
    expect(v.pass).toBe(false);
    expect(v.checks.map((c) => [c.id, c.pass])).toEqual([["within", false], ["maxDeltaE", false], ["maxSigma", false]]);
    // Thresholds are parameters: loose ones pass the same metrics.
    expect(judge({ ...m, maxSigma: 2 }, { withinDeltaE: 1, withinFraction: 0.75, maximumDeltaE: m.maxDeltaE, maximumSigma: 2 }).pass).toBe(true);
    expect(DEFAULT_THRESHOLDS).toEqual({ withinDeltaE: 1, withinFraction: 0.99, maximumDeltaE: 2.3, maximumSigma: 1 });
  });
  it("counts the within-ΔE fraction against the given ΔE and compares the candidate's σ when given", () => {
    const loose = compareExpectedImages({ width, height, reference, candidate, referenceNoiseStd: sigma, withinDeltaE: 100 });
    expect(loose.withinFraction).toBe(1); expect(loose.withinDeltaE).toBe(100);
    const candidateSigma = Float64Array.from(sigma, (v, i) => (i === 1 ? v * 1.1 : v));
    const m = compareExpectedImages({ width, height, reference, candidate: reference, referenceNoiseStd: sigma, candidateNoiseStd: candidateSigma });
    expect(m.maxNoiseStdRelativeDifference).toBeCloseTo(0.1, 12);
  });
  it("amplifies the difference image by the gain, in 8-bit codes, clamped", () => {
    const image = differenceImage8(reference, candidate, 16);
    expect(image.length).toBe(12);
    expect(image[0]).toBe(0);
    expect(image[3]).toBe(Math.min(255, Math.round(16 * (srgbCode8(g + 0.005) - srgbCode8(g)))));
    expect(image[7]).toBe(Math.min(255, Math.round(16 * (srgbCode8(g + 0.04) - srgbCode8(g)))));
    expect(image[7]).toBeGreaterThan(image[3]);
    expect(differenceImage8(Float64Array.of(0, 0, 0), Float64Array.of(1, 1, 1), 1)[0]).toBe(255);
    expect(differenceImage8(Float64Array.of(0, 0, 0), Float64Array.of(1, 1, 1), 16)[1]).toBe(255);
  });
  it("rejects mismatched array sizes", () => {
    expect(() => compareExpectedImages({ width, height, reference, candidate: reference.subarray(0, 9), referenceNoiseStd: sigma })).toThrow(/candidate has 9 values/u);
    expect(() => differenceImage8(reference, reference.subarray(0, 9))).toThrow(/differ in size/u);
  });
  it("summarizes a run: every case must pass every threshold", () => {
    const pass = compareExpectedImages({ width, height, reference, candidate: reference, referenceNoiseStd: sigma });
    const fail = compareExpectedImages({ width, height, reference, candidate, referenceNoiseStd: sigma });
    const { deltaE: _d, sigma: _s, ...passMetrics } = pass; const { deltaE: _e, sigma: _t, ...failMetrics } = fail;
    void _d; void _s; void _e; void _t;
    expect(summarize([{ id: 0, metrics: passMetrics }, { id: 1, metrics: passMetrics }])).toMatchObject({ pass: true, failing: [] });
    expect(summarize([{ id: 0, metrics: passMetrics }, { id: 1, metrics: failMetrics }])).toMatchObject({ pass: false, failing: [1] });
    expect(summarize([]).pass).toBe(false);
  });
});
