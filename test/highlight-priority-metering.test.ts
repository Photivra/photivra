// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";

import {
  calculateHighlightPriorityPlacementSignal,
  meterRelativeExposure,
  parseExposureMeteringProfile,
  resolveCaptureGeometry,
  type ExposureMeteringProfile,
  type ExposureMeteringSampleSet
} from "../src/index.js";

const evidence = [{ sourceOrigin: "photivra" as const, sourceReference: "test:highlight-priority",
  reuseStatus: "photivra-owned" as const }];

function profile(policy: Record<string, unknown>, target: number): ExposureMeteringProfile {
  return parseExposureMeteringProfile({ schemaVersion: "0.1.0", profileId: "meter", scientificStatus: "approximation",
    inputDomain: "relative-pre-exposure-linear-signal", captureRegion: "oriented-active-capture", policy,
    target: { kind: "relative-signal-reference", targetRelativeSignal: target, evidence }, evidence,
    limitations: ["Synthetic relative meter for analytic tests."] });
}

function scene(signals: readonly number[], weights?: readonly number[]): ExposureMeteringSampleSet {
  return { measurementId: "m", sceneStateId: "s", inputDomain: "relative-pre-exposure-linear-signal",
    captureRegion: "oriented-active-capture",
    captureGeometry: resolveCaptureGeometry({ imagingArea: { widthMm: 36, heightMm: 24 },
      nativeRaster: { pixelWidth: 60, pixelHeight: 40 }, orientation: "landscape" }).value,
    processingState: { exposureSettingsApplied: false, whiteBalanceApplied: false, toneMappingApplied: false,
      displayGammaApplied: false, sharpeningApplied: false },
    samples: signals.map((relativeLinearSignal, i) => ({ sampleId: "z" + i,
      positionOrientedCaptureUv: { u: (i % 5 + .5) / 5, v: (Math.floor(i / 5) + .5) / 4 },
      relativeLinearSignal, areaWeight: weights?.[i] ?? 1 })) };
}

/** 95 % of the frame at mid-grey 0.18 and 5 % at 0.9 (19 + 1 equal-area zones). */
const greyWithHighlight = scene([...Array.from({ length: 19 }, () => .18), .9]);

describe("highlight-weighted metering (review finding verification)", () => {
  it("is a highlight-emphasis weighted mean placed at the target, so it underexposes this scene relative to uniform", () => {
    const uniform = meterRelativeExposure({ profile: profile({ kind: "multi-zone-uniform" }, .18), sampleSet: greyWithHighlight }).value;
    expect(uniform.meteredRelativeSignal).toBeCloseTo(.95*.18+.05*.9, 15);
    for (const [w0, p] of [[.1, 2], [.2, 2]] as const) {
      const meter = meterRelativeExposure({ profile: profile({ kind: "highlight-weighted", minimumWeightFraction: w0, exponent: p }, .18),
        sampleSet: greyWithHighlight }).value;
      // Closed form: grey weight w0 + (1-w0)(0.18/0.9)^p, highlight weight 1.
      const wg = w0+(1-w0)*Math.pow(.2, p), expected = (19*wg*.18+.9)/(19*wg+1);
      expect(meter.meteredRelativeSignal).toBeCloseTo(expected, 14);
      if (meter.status !== "resolved" || uniform.status !== "resolved") throw new Error("Expected resolved meters.");
      // Underexposure relative to uniform metering: ~0.82 EV (w0 0.1) and ~0.54 EV (w0 0.2, the generic tier preset).
      const underexposureEv = uniform.exposureOffsetStopsToTarget - meter.exposureOffsetStopsToTarget;
      expect(underexposureEv).toBeCloseTo(Math.log2(expected/uniform.meteredRelativeSignal), 12);
      expect(underexposureEv).toBeGreaterThan(w0 === .1 ? .8 : .5);
      expect(meter).not.toHaveProperty("highlightPriority");
    }
  });
});

describe("highlight-priority metering", () => {
  const sat = 1, headroom = .5, placement = calculateHighlightPriorityPlacementSignal(sat, headroom);
  const policy = (highlightPercentile: number): Record<string, unknown> => ({ kind: "highlight-priority", highlightPercentile,
    saturationRelativeSignal: sat, headroomStops: headroom });

  it("places the chosen area-weighted percentile exactly headroomStops below saturation", () => {
    expect(placement).toBeCloseTo(Math.SQRT1_2, 15);
    const meter = meterRelativeExposure({ profile: profile(policy(.99), placement), sampleSet: greyWithHighlight }).value;
    if (meter.status !== "resolved") throw new Error("Expected a resolved meter.");
    expect(meter.policyKind).toBe("highlight-priority");
    expect(meter.meteredRelativeSignal).toBe(.9);
    expect(meter.highlightPriority).toEqual({ highlightPercentile: .99, percentileRelativeSignal: .9, saturationRelativeSignal: 1,
      headroomStops: .5, placementRelativeSignal: placement, quantileDefinition: "area-weighted-lower-quantile-inverse-empirical-cdf" });
    // After applying the exposure scale the highlight lies 0.5 stop below saturation and is not clipped.
    const highlightAfter = .9*meter.requiredExposureScaleToTarget;
    expect(Math.log2(sat/highlightAfter)).toBeCloseTo(headroom, 12);
    expect(meter.selectedSampleCount).toBe(20);
  });

  it("uses the lower weighted quantile, honours area weights and keeps the relative-light invariant", () => {
    // Cumulative weight reaches exactly 95 % at the last grey zone.
    expect(meterRelativeExposure({ profile: profile(policy(.95), placement), sampleSet: greyWithHighlight }).value.meteredRelativeSignal).toBe(.18);
    // Same scene with the bright zone covering half the area: the 0.6 quantile is the highlight.
    const weighted = scene([.18, .9], [1, 1]);
    expect(meterRelativeExposure({ profile: profile(policy(.5), placement), sampleSet: weighted }).value.meteredRelativeSignal).toBe(.18);
    expect(meterRelativeExposure({ profile: profile(policy(.6), placement), sampleSet: weighted }).value.meteredRelativeSignal).toBe(.9);
    expect(meterRelativeExposure({ profile: profile(policy(1), placement), sampleSet: scene([.3, .1, .2]) }).value.meteredRelativeSignal).toBe(.3);
    const base = meterRelativeExposure({ profile: profile(policy(.99), placement), sampleSet: greyWithHighlight }).value;
    const half = meterRelativeExposure({ profile: profile(policy(.99), placement),
      sampleSet: scene([...Array.from({ length: 19 }, () => .09), .45]) }).value;
    if (base.status !== "resolved" || half.status !== "resolved") throw new Error("Expected resolved meters.");
    expect(half.exposureOffsetStopsToTarget - base.exposureOffsetStopsToTarget).toBeCloseTo(1, 14);
  });

  it("reports an explicit no-signal state and validates the declared placement", () => {
    const dark = meterRelativeExposure({ profile: profile(policy(.5), placement), sampleSet: scene([0, 0, .5]) }).value;
    expect(dark.status).toBe("no-signal");
    expect(() => profile(policy(.99), .18)).toThrow("saturationRelativeSignal * 2^-headroomStops");
    expect(() => profile(policy(0), placement)).toThrow("highlightPercentile");
    expect(() => profile(policy(1.1), placement)).toThrow("highlightPercentile must lie in (0, 1]");
    expect(() => profile({ ...policy(.9), headroomStops: -1 }, placement)).toThrow("headroomStops");
    expect(() => profile({ ...policy(.9), saturationRelativeSignal: 0 }, placement)).toThrow("saturationRelativeSignal");
    expect(() => calculateHighlightPriorityPlacementSignal(1, -1)).toThrow("non-negative headroom");
    expect(calculateHighlightPriorityPlacementSignal(2, 0)).toBe(2);
  });
});
