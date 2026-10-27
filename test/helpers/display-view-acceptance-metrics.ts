// SPDX-License-Identifier: Apache-2.0
/**
 * The preview acceptance harness's reduction (#480, scripts/lib/display-view-acceptance.mjs) typed for the GPU display-view
 * tests: the per-pixel ΔE2000 and |Δ|/σ metrics of two expected images and the verdict against the #473 thresholds.
 */
import { cielabOfXyz, deltaE2000 } from "../../src/color/color-difference.js";
import { resolveRgbColorSpace } from "../../src/color/rgb-color-spaces.js";
// @ts-expect-error -- the harness's script module has no declarations; its contract is documented in the module.
import { DEFAULT_THRESHOLDS, createAcceptanceMetrics, judge } from "../../scripts/lib/display-view-acceptance.mjs";

export interface AcceptanceMetrics {
  pixels: number; withinFraction: number; maxDeltaE: number; meanDeltaE: number; maxSigma: number; maxCode8: number; identicalFraction: number;
  maxNoiseStdRelativeDifference: number | undefined;
}
export interface AcceptanceVerdict { pass: boolean; checks: { id: string; label: string; value: number; pass: boolean }[] }
export const ACCEPTANCE_THRESHOLDS: { withinDeltaE: number; withinFraction: number; maximumDeltaE: number; maximumSigma: number } = DEFAULT_THRESHOLDS;

/** The harness's metrics and verdict for a candidate render against the CPU reference of the same view. */
export function acceptanceOf(width: number, height: number, reference: { expected: Float64Array; noiseStd: Float64Array }, candidate: { expected: Float64Array; noiseStd: Float64Array }):
  { metrics: AcceptanceMetrics; verdict: AcceptanceVerdict } {
  const { compareExpectedImages } = createAcceptanceMetrics({ deltaE2000, cielabOfXyz, srgb: resolveRgbColorSpace("srgb").value }) as
    { compareExpectedImages(input: Record<string, unknown>): AcceptanceMetrics & { deltaE: Float64Array; sigma: Float64Array } };
  const { deltaE, sigma, ...metrics } = compareExpectedImages({ width, height, reference: reference.expected, candidate: candidate.expected, referenceNoiseStd: reference.noiseStd,
    candidateNoiseStd: candidate.noiseStd, withinDeltaE: ACCEPTANCE_THRESHOLDS.withinDeltaE });
  void deltaE; void sigma;
  return { metrics, verdict: judge(metrics, ACCEPTANCE_THRESHOLDS) as AcceptanceVerdict };
}
