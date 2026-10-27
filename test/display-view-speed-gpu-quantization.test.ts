// SPDX-License-Identifier: Apache-2.0
/**
 * #496: the Speed host's variance bound carries the output quantization term's dependence on the mean. The host evaluates
 * q(m) = s(e)²·Δ²/12 (`quantizationVariance`) at the GPU's mean, so the variance moves by Σ(w/A)²·|q(m_gpu) − q(m_ref)|; the
 * added term `displayViewSpeedQuantizationBound` must cover that change for every mean the bound allows, the sRGB segment
 * join included. The fixtures' agreement with the term in place is test/display-view-speed-gpu.test.ts and
 * test/display-view-composite-gpu.test.ts (every component inside its bound).
 */
import { describe, expect, it } from "vitest";
import { quantizationVariance } from "../src/facade/display-view.js";
import { displayViewSpeedQuantizationBound } from "../src/gpu/display-view-speed-gpu.js";

describe("Speed: the quantization term of the variance bound (#496)", () => {
  const step = 1 / 255, pixels = 0.114;
  it("covers the change of Σ(w/A)²·q(m) over every mean within the bound, on [−0.1, 1.1] and at the segment join", () => {
    const means: number[] = [];
    for (let k = 0; k <= 12_000; k++) means.push(-0.1 + 1.2 * k / 12_000);
    for (let k = -50; k <= 50; k++) means.push(0.0031308 + k * 1e-6);
    // One assertion over all samples (about 580 000); asserting per sample was slow enough to time out on a loaded CI runner.
    let largestRatio = 0, checked = 0;
    const violations: string[] = [];
    for (const relative of [0, 1.5e-5, 1e-3]) for (const absolute of [0, 1e-7, 1e-5, 1e-3]) for (const m of means) {
      const bound = displayViewSpeedQuantizationBound([m, m, m], relative, absolute, pixels, step), delta = relative * Math.abs(m) + absolute;
      for (const t of [-1, -0.5, 0.5, 1]) {
        const change = pixels * Math.abs(quantizationVariance(m + t * delta, step) - quantizationVariance(m, step));
        checked++;
        if (!(change <= bound) && violations.length < 5) violations.push(`m=${m} relative=${relative} absolute=${absolute} t=${t}: change ${change} > bound ${bound}`);
        if (bound > 0) largestRatio = Math.max(largestRatio, change / bound);
      }
    }
    expect(checked).toBe(12 * 4 * (12_001 + 101));
    expect(violations).toEqual([]);
    // The slope constant 6.04 is the maximum of 2·s′(e) on [0, 1], reached at white; the margin is 2 (MARGIN).
    expect(largestRatio).toBeGreaterThan(0.4);
    expect(largestRatio).toBeLessThanOrEqual(0.5 + 1e-9);
  }, 60_000);
  it("is the largest of the three components, linear in the mean's bound, zero for an exact mean away from the join", () => {
    expect(displayViewSpeedQuantizationBound([0.5, 0.5, 0.5], 0, 0, pixels, step)).toBe(0);
    const one = displayViewSpeedQuantizationBound([0.2, 0.2, 0.2], 0, 1e-6, pixels, step), two = displayViewSpeedQuantizationBound([0.2, 0.2, 0.2], 0, 2e-6, pixels, step);
    expect(two).toBeCloseTo(2 * one, 20);
    expect(one).toBeCloseTo(2 * pixels * 6.04 * 1e-6 * step * step / 12, 25);
    expect(displayViewSpeedQuantizationBound([0.2, 0.9, 0.1], 1e-5, 0, pixels, step)).toBe(displayViewSpeedQuantizationBound([0.9, 0.9, 0.9], 1e-5, 0, pixels, step));
    // A mean interval that holds the sRGB segment join adds the jump.
    expect(displayViewSpeedQuantizationBound([0.0031308, 0.5, 0.5], 0, 0, pixels, step)).toBeCloseTo(2 * pixels * 2.1e-4 * step * step / 12, 25);
  });
});
