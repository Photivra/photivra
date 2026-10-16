// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  calculateStabilizedCaptureTemporalSamples,
  calculateStabilizedRotationTrajectory,
  resolveCaptureMode,
  resolveCaptureModeTiming,
  type ResolvedCaptureModeTiming
} from "../src/index.js";

// Regression evidence for #275/#276: indexed (binary-search) stabilization evaluation must stay
// bit-identical to the original linear-scan evaluator. The digests below were produced by the
// linear-scan implementation at d3a704b and must not be regenerated to make a change pass.

type Evidence = { sourceOrigin: "photivra"; sourceReference: string; reuseStatus: "photivra-owned" }[];
const evidence = (ref: string): Evidence => [{
  sourceOrigin: "photivra" as const,
  sourceReference: ref,
  reuseStatus: "photivra-owned" as const
}];

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Angles = { pitch: number; yaw: number; roll: number };

function disturbance(
  times: readonly number[],
  angles: readonly Angles[],
  id = "identity-disturbance"
): unknown {
  return {
    version: "0.1.0",
    trajectoryId: id,
    timeReference: "first-opening-boundary-phase",
    samples: times.map((time, index) => ({
      timeSecondsFromCaptureReference: time,
      angularDisplacementRad: angles[index]!
    })),
    initialAngularDisplacementIsZero: true,
    cameraTranslationIncluded: false,
    subjectMotionIncluded: false,
    supportStateEncoded: false,
    evidence: evidence("disturbance"),
    limitations: ["Synthetic deterministic disturbance."]
  };
}

/** Irregular strictly increasing support on [0, span] with pseudo-random angles. */
function randomDisturbance(count: number, seed: number, span = 0.05): unknown {
  const random = mulberry32(seed);
  const increments = Array.from({ length: count - 1 }, () => 0.25 + random());
  const total = increments.reduce((sum, value) => sum + value, 0);
  const times = [0];
  let cumulative = 0;
  for (const increment of increments) {
    cumulative += increment;
    times.push((cumulative / total) * span);
  }
  times[times.length - 1] = span;
  const angles: Angles[] = times.map((_, index) =>
    index === 0
      ? { pitch: 0, yaw: 0, roll: 0 }
      : {
          pitch: (random() - 0.5) * 0.02,
          yaw: (random() - 0.5) * 0.02,
          roll: (random() - 0.5) * 0.01
        });
  return disturbance(times, angles);
}

/** Uniform grid k/10000 s, so latency-delayed times can land exactly on support samples. */
function gridDisturbance(count: number, seed: number): unknown {
  const random = mulberry32(seed);
  const times = Array.from({ length: count }, (_, index) => index / 10_000);
  const angles: Angles[] = times.map((_, index) =>
    index === 0
      ? { pitch: 0, yaw: 0, roll: 0 }
      : {
          pitch: (random() - 0.5) * 0.03,
          yaw: (random() - 0.5) * 0.03,
          roll: (random() - 0.5) * 0.03
        });
  return disturbance(times, angles, "grid-disturbance");
}

function axisResponse(
  axis: "pitch" | "yaw" | "roll",
  gain: number,
  latency: number,
  limit: number
): unknown {
  return {
    axis,
    correctionGain: { value: gain, evidence: evidence(axis + "-gain") },
    latencySeconds: { value: latency, evidence: evidence(axis + "-latency") },
    maximumCorrectionAngleRad: { value: limit, evidence: evidence(axis + "-limit") }
  };
}

function profile(
  architecture: "off" | "sensor-shift",
  axisResponses: unknown[],
  panningPolicy: unknown = { kind: "none" }
): unknown {
  return {
    schemaVersion: "0.1.0",
    profileId: "identity-" + architecture,
    profileVersion: "1.0.0",
    profileKind: "generic-synthetic",
    scientificStatus: "approximation",
    architecture,
    captureKind: "still",
    axisResponses,
    panningPolicy,
    controlTransientModeled: false,
    spontaneousDriftModeled: false,
    cameraTranslationCorrectionModeled: false,
    digitalStabilizationIncluded: false,
    supportPolicyIncluded: false,
    stopRatingUsedAsDynamicResponse: false,
    evidence: evidence("profile"),
    limitations: ["Synthetic response."]
  };
}

const profiles = (): unknown[] => [
  profile("off", []),
  profile("sensor-shift", [
    axisResponse("pitch", 0.9, 0.0003, 0.004),
    axisResponse("yaw", 0.97, 0.00017, 0.006),
    axisResponse("roll", 0.75, 0, 1)
  ]),
  profile(
    "sensor-shift",
    [axisResponse("pitch", 1, 0.001, 1), axisResponse("yaw", 0.5, 0.0001, 0.002)],
    {
      kind: "declared-axis-bypass",
      axis: "yaw",
      evidence: evidence("pan")
    }
  )
];

function timing(points: readonly { x: number; y: number }[]): ResolvedCaptureModeTiming {
  const nativeRaster = { pixelWidth: 100, pixelHeight: 100 };
  const mode = resolveCaptureMode({
    nativeRaster,
    profile: {
      schemaVersion: "0.1.0",
      modes: [{
        modeId: "still",
        evidence: evidence("mode"),
        acquisition: { kind: "single-frame" },
        perFrameSampling: { kind: "native-effective-raster" },
        processedImageRaster: { value: nativeRaster, evidence: evidence("raster") },
        dependencies: ["mode-specific-readout-timing"]
      }]
    },
    modeId: "still"
  });
  const scan = (ref: string): {
    kind: "uniform-linear-native-scan";
    directionNative: { value: "top-to-bottom"; evidence: Evidence };
    traversalDurationSeconds: { value: number; unit: "s"; evidence: Evidence };
  } => ({
    kind: "uniform-linear-native-scan" as const,
    directionNative: { value: "top-to-bottom" as const, evidence: evidence(ref + "-direction") },
    traversalDurationSeconds: { value: 0.004, unit: "s" as const, evidence: evidence(ref + "-time") }
  });
  return resolveCaptureModeTiming({
    captureMode: mode,
    timingProfile: {
      schemaVersion: "0.1.0",
      profileId: "timing",
      profileVersion: "1.0.0",
      captureModeId: "still",
      scientificStatus: "approximation",
      scheduleFamily: "global-or-uniform-linear-native-scan",
      shutterMechanism: "electronic",
      opening: scan("open"),
      closing: scan("close"),
      readout: {
        readoutMode: "rolling",
        captureReadoutDurationSeconds: { value: 0.01, unit: "s", evidence: evidence("readout") },
        scanDirectionNative: { value: "top-to-bottom", evidence: evidence("readout-dir") },
        spatialSamplingSkewSeconds: { value: 0.01, unit: "s", evidence: evidence("readout-skew") }
      },
      nonUniformScheduleModeled: false,
      evidence: evidence("timing"),
      limitations: ["Synthetic timing."]
    },
    nominalExposureDurationSeconds: { value: 0.012, unit: "s", evidence: evidence("exposure") },
    samplePointsNative: [...points]
  } as Parameters<typeof resolveCaptureModeTiming>[0]);
}

const digest = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Every IEEE-754 bit of every number, including the sign of zero, so JSON rounding cannot hide drift. */
function numericBits(value: unknown, out: string[] = []): string[] {
  if (typeof value === "number") {
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, value);
    out.push(view.getBigUint64(0).toString(16));
  } else if (Array.isArray(value)) {
    for (const entry of value) numericBits(entry, out);
  } else if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value).sort()) numericBits((value as Record<string, unknown>)[key], out);
  }
  return out;
}

const fingerprint = (value: unknown): string => digest([digest(value), digest(numericBits(value))]);

function rotationFingerprints(): string[] {
  const disturbances = [
    randomDisturbance(2, 1),
    randomDisturbance(3, 2),
    randomDisturbance(257, 3),
    randomDisturbance(1024, 4),
    gridDisturbance(501, 5)
  ];
  return disturbances.flatMap((input) =>
    profiles().map((profileInput) =>
      fingerprint(
        calculateStabilizedRotationTrajectory({
          disturbance: input as never,
          profile: profileInput as never,
          captureKind: "still"
        }).value
      )));
}

function temporalFingerprints(): string[] {
  const points = Array.from({ length: 48 }, (_, index) => ({
    x: (index * 37) % 100,
    y: (index * 61) % 100
  }));
  const resolved = timing(points);
  return [randomDisturbance(400, 7), gridDisturbance(501, 8)].flatMap((input) =>
    profiles().flatMap((profileInput) =>
      [1, 3, 16].map((temporalSampleCount) =>
        fingerprint(
          calculateStabilizedCaptureTemporalSamples({
            disturbance: input as never,
            profile: profileInput as never,
            captureKind: "still",
            timing: resolved,
            samplePointsNative: [...points].reverse(),
            temporalSampleCount
          }).value
        ))));
}

describe("indexed stabilization evaluation is bit-identical to the linear-scan evaluator", () => {
  it("reproduces the linear-scan rotation trajectory digests", () => {
    expect(digest(rotationFingerprints())).toBe(
      "3c09c208c43830fe0527980b7fc0fcabfa46754accf870ae1a1f1b279781e2e6"
    );
  });

  it("reproduces the linear-scan capture temporal sample digests", () => {
    expect(digest(temporalFingerprints())).toBe(
      "4acee2ef8784d9f67a7843ec87ce50f85ce1ba8f427139283256ffc279eb29eb"
    );
  });

  it("interpolates an exact interior support time on the left segment, as the linear scan did", () => {
    // 0.7 + (0.1 - 0.7) * 1 === 0.09999999999999998, not the stored 0.1. The linear scan matched
    // the earlier segment whose right endpoint equals the requested time, so that arithmetic is the
    // contract; the final support sample alone returns its stored value.
    const times = [0, 0.01, 0.02, 0.03];
    const values = [0, 0.7, 0.1, 0.4];
    const input = disturbance(
      times,
      values.map((pitch) => ({ pitch, yaw: -pitch, roll: pitch / 3 }))
    );
    const result = calculateStabilizedRotationTrajectory({
      disturbance: input as never,
      profile: profile("off", []) as never,
      captureKind: "still"
    }).value;
    const pitch = result.samples.map((sample) => sample.disturbanceAngularDisplacementRad.pitch);
    const legacy = (index: number): number => {
      if (index === 0) return 0;
      if (index === times.length - 1) return values[index]!;
      const a = values[index - 1]!;
      const b = values[index]!;
      const phase = (times[index]! - times[index - 1]!) / (times[index]! - times[index - 1]!);
      return a + (b - a) * phase;
    };
    expect(pitch).toEqual(times.map((_, index) => legacy(index)));
    expect(Object.is(pitch[2], 0.09999999999999998)).toBe(true);
    expect(Object.is(pitch[3], 0.4)).toBe(true);
    expect(Object.is(pitch[0], 0)).toBe(true);
  });

  it("uses the left segment for latency-delayed times that land exactly on interior support samples", () => {
    const times = [0, 0.25, 0.5, 0.75, 1];
    const values = [0, 0.7, 0.1, 0.4, 0.2];
    const input = disturbance(times, values.map((pitch) => ({ pitch, yaw: 0, roll: 0 })));
    const result = calculateStabilizedRotationTrajectory({
      disturbance: input as never,
      profile: profile("sensor-shift", [axisResponse("pitch", 1, 0.25, 10)]) as never,
      captureKind: "still"
    }).value;
    // t − 0.25 is exact on this dyadic grid, so each delayed time equals the previous support time.
    const delayed = result.samples.map((sample) => sample.axes[0]!.delayedMeasuredAngleRad);
    expect(Object.is(delayed[0], 0)).toBe(true);
    expect(Object.is(delayed[1], 0)).toBe(true);
    expect(Object.is(delayed[2], 0.7)).toBe(true);
    expect(Object.is(delayed[3], 0.09999999999999998)).toBe(true);
    expect(Object.is(delayed[4], 0.4)).toBe(true);
  });

  it("still rejects out-of-support and non-finite evaluation times", () => {
    const input = disturbance([0, 0.001], [{ pitch: 0, yaw: 0, roll: 0 }, { pitch: 0.1, yaw: 0, roll: 0 }]);
    expect(() =>
      calculateStabilizedCaptureTemporalSamples({
        disturbance: input as never,
        profile: profile("off", []) as never,
        captureKind: "still",
        timing: timing([{ x: 50, y: 75 }]),
        samplePointsNative: [{ x: 50, y: 75 }],
        temporalSampleCount: 2
      })).toThrow("outside the disturbance trajectory support");
  });

  it("keeps exactly-one exposure-window matching for duplicate, missing and NaN points", () => {
    const resolved = timing([{ x: 50, y: 25 }, { x: 50, y: 75 }]);
    const run = (timingInput: ResolvedCaptureModeTiming, point: { x: number; y: number }) => (): unknown =>
      calculateStabilizedCaptureTemporalSamples({
        disturbance: gridDisturbance(501, 9) as never,
        profile: profile("off", []) as never,
        captureKind: "still",
        timing: timingInput,
        samplePointsNative: [point],
        temporalSampleCount: 1
      });
    const message = "must match exactly one committed #12 exposure-window sample point";
    const duplicated = {
      ...resolved,
      exposureWindows: {
        ...resolved.exposureWindows,
        samples: [...resolved.exposureWindows.samples, resolved.exposureWindows.samples[0]!]
      }
    };
    expect(run(duplicated, { x: 50, y: 25 })).toThrow(message);
    expect(run(duplicated, { x: 50, y: 75 })).not.toThrow();
    expect(run(resolved, { x: 25, y: 50 })).toThrow(message);
    const nanWindow = {
      ...resolved,
      exposureWindows: {
        ...resolved.exposureWindows,
        samples: resolved.exposureWindows.samples.map((sample) => ({
          ...sample,
          pointNative: { x: Number.NaN, y: sample.pointNative.y }
        }))
      }
    };
    expect(run(nanWindow, { x: Number.NaN, y: 25 })).toThrow(message);
    // Signed zero compares equal under ===, as before.
    const zero = timing([{ x: 0, y: 50 }]);
    expect(run(zero, { x: -0, y: 50 })).not.toThrow();
  });
});

/*
 * Independent spot values beside the digests above, so a digest change can be diagnosed. The
 * controller is re-derived here from its documented equation (delayed linear image-equivalent
 * response): for each active axis, residual(t) = d(t) - clamp(g * d(t - tau), +-L), where d is the
 * piecewise-linear disturbance and d(t < 0) = 0; "off" and bypassed axes keep residual = d(t).
 * No engine helper is used. Tolerances are absolute 1e-15 rad on angles below 0.03 rad.
 */
type DisturbanceSamples = { samples: { timeSecondsFromCaptureReference: number; angularDisplacementRad: Angles }[] };
type AxisSpec = { axis: keyof Angles; gain: number; latency: number; limit: number };

function independentDisturbance(input: unknown, time: number, axis: keyof Angles): number {
  const samples = (input as DisturbanceSamples).samples;
  if (time < 0) return 0;
  for (let i = 1; i < samples.length; i++) {
    const t0 = samples[i - 1]!.timeSecondsFromCaptureReference, t1 = samples[i]!.timeSecondsFromCaptureReference;
    if (time <= t1) {
      const a = samples[i - 1]!.angularDisplacementRad[axis], b = samples[i]!.angularDisplacementRad[axis];
      return a + (b - a) * ((time - t0) / (t1 - t0));
    }
  }
  throw new Error("time outside support");
}

function independentResidual(input: unknown, time: number, axis: keyof Angles, specs: readonly AxisSpec[]): number {
  const current = independentDisturbance(input, time, axis), spec = specs.find((entry) => entry.axis === axis);
  if (spec === undefined) return current;
  const requested = spec.gain * independentDisturbance(input, time - spec.latency, axis);
  return current - Math.max(-spec.limit, Math.min(spec.limit, requested));
}

// Same declarations as profiles(): index 0 off; 1 three-axis sensor shift; 2 yaw bypassed for panning.
const profileSpecs: readonly (readonly AxisSpec[])[] = [
  [],
  [{ axis: "pitch", gain: 0.9, latency: 0.0003, limit: 0.004 }, { axis: "yaw", gain: 0.97, latency: 0.00017, limit: 0.006 },
    { axis: "roll", gain: 0.75, latency: 0, limit: 1 }],
  [{ axis: "pitch", gain: 1, latency: 0.001, limit: 1 }]
];

describe("independent spot values beside the stabilization digests", () => {
  it("matches the delayed, gained and clamped controller on every digest disturbance and profile", () => {
    let limited = 0, delayedBeforeStart = 0;
    for (const input of [randomDisturbance(2, 1), randomDisturbance(3, 2), randomDisturbance(257, 3), gridDisturbance(501, 5)]) {
      profiles().forEach((profileInput, index) => {
        const result = calculateStabilizedRotationTrajectory({ disturbance: input as never, profile: profileInput as never,
          captureKind: "still" }).value;
        const support = (input as DisturbanceSamples).samples;
        expect(result.samples.map((sample) => sample.timeSecondsFromCaptureReference))
          .toEqual(support.map((sample) => sample.timeSecondsFromCaptureReference));
        for (const sample of result.samples) {
          const t = sample.timeSecondsFromCaptureReference;
          for (const axis of ["pitch", "yaw", "roll"] as const) {
            expect(Math.abs(sample.residualAngularDisplacementRad[axis] - independentResidual(input, t, axis, profileSpecs[index]!)))
              .toBeLessThanOrEqual(1e-15);
          }
          for (const resolution of sample.axes) {
            if (resolution.correctionLimitReached) limited++;
            if (resolution.latencySeconds > t) delayedBeforeStart++;
          }
        }
      });
    }
    // The spot set exercises both the clamp and the pre-start (d = 0) latency branch.
    expect(limited).toBeGreaterThan(0);
    expect(delayedBeforeStart).toBeGreaterThan(0);
  });

  it("places capture temporal nodes at uniform midpoints of each rolling local exposure window", () => {
    // Opening and closing scan top-to-bottom in 0.004 s over 100 rows, so a point at row y opens at
    // 0.004 * y / 100 s and stays open for the 0.012 s nominal exposure; n midpoint nodes sit at
    // start + (k + 1/2) * 0.012 / n with equal weight 1/n.
    const points = [{ x: 10, y: 0 }, { x: 50, y: 25 }, { x: 90, y: 75 }];
    const input = randomDisturbance(400, 7);
    for (const [index, specs] of profileSpecs.entries()) {
      for (const n of [1, 3, 16]) {
        const result = calculateStabilizedCaptureTemporalSamples({ disturbance: input as never, profile: profiles()[index] as never,
          captureKind: "still", timing: timing(points), samplePointsNative: points, temporalSampleCount: n }).value;
        result.points.forEach((point, p) => {
          const start = 0.004 * points[p]!.y / 100;
          expect(point.localExposureWindow.startSecondsFromCaptureReference).toBeCloseTo(start, 15);
          expect(point.localExposureWindow.durationSeconds).toBeCloseTo(0.012, 15);
          point.nodes.forEach((node, k) => {
            expect(node.captureTimeSecondsFromReference).toBeCloseTo(start + (k + 0.5) * 0.012 / n, 15);
            expect(node.normalizedTimeWeight).toBeCloseTo(1 / n, 15);
            for (const axis of ["pitch", "yaw", "roll"] as const) {
              expect(Math.abs(node.stabilization.residualAngularDisplacementRad[axis] -
                independentResidual(input, node.captureTimeSecondsFromReference, axis, specs))).toBeLessThanOrEqual(1e-15);
            }
          });
        });
      }
    }
  });
});

