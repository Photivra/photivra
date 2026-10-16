// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { calculateEquivalentFocalLength35Mm, calculateImagingAreaMetrics, calculateNativeRawPlan, createNativeRawDevelopmentTask, createSimulatedCapture, parseSimulatedCapture, type NativeRawOutput } from "../src/index.js";
import { nativeRawFixture } from "./helpers/native-raw-fixture.js";
import { equalWithinUlps, portableHypot } from "../src/core/portable-math.js";
import { loadSensorRawFrameInput } from "./helpers/sensor-raw-frame-fixture.js";

describe("engine-portable floating-point helpers (numeric review #1, #2)", () => {
  it("computes the Euclidean norm from correctly rounded operations only", () => {
    expect(portableHypot(3, 4)).toBe(5);
    expect(portableHypot(36, 24)).toBe(Math.sqrt(1872));
    expect(portableHypot(1, 2, 2)).toBe(3);
    expect(portableHypot(0, 0)).toBe(0);
    expect(portableHypot(-0, 0)).toBe(0);
    expect(portableHypot(-5, 12)).toBe(13);
    // In range it is literally sqrt of the in-order sum of squares.
    for (const [x, y] of [[23.6, 15.7], [6.17, 4.55], [17.3, 13], [0.1, 0.2]] as const) {
      expect(portableHypot(x, y)).toBe(Math.sqrt(x * x + y * y));
    }
  });

  it("rescales by exact powers of two instead of overflowing or underflowing", () => {
    expect(portableHypot(3e300, 4e300)).toBe(5e300);
    expect(portableHypot(3e-300, 4e-300)).toBeCloseTo(5e-300, 314);
    expect(Math.abs(portableHypot(3e-300, 4e-300) - 5e-300)).toBeLessThanOrEqual(2 * Number.EPSILON * 5e-300);
    expect(portableHypot(Number.MAX_VALUE, 0)).toBe(Number.MAX_VALUE);
    expect(portableHypot(Number.MIN_VALUE, 0)).toBe(Number.MIN_VALUE);
    expect(portableHypot(Infinity, 1)).toBe(Infinity);
    expect(portableHypot(NaN, 1)).toBeNaN();
  });

  it("compares within a relative ulp budget", () => {
    expect(equalWithinUlps(1, 1 + Number.EPSILON, 1)).toBe(true);
    expect(equalWithinUlps(1, 1 + 4 * Number.EPSILON, 2)).toBe(false);
    expect(equalWithinUlps(27.475525007794076, 27.475525007794072, 8)).toBe(true);
    expect(equalWithinUlps(0, 0, 0)).toBe(true);
    expect(equalWithinUlps(NaN, NaN, 8)).toBe(false);
    expect(equalWithinUlps(Infinity, Infinity, 8)).toBe(false);
  });

  it("derives the 35 mm crop factor as sqrt(1872 / (w^2 + h^2)) bit for bit", () => {
    for (const [widthMm, heightMm] of [[23.5, 15.6], [23.6, 15.7], [22.3, 14.9], [17.3, 13], [13.2, 8.8], [6.17, 4.55], [43.8, 32.9], [35.9, 23.9], [9.8, 7.4], [7.6, 5.7], [36, 24]] as const) {
      const metrics = calculateImagingAreaMetrics({ widthMm, heightMm }).value;
      expect(metrics.cropFactor35Mm).toBe(Math.sqrt(1872 / (widthMm * widthMm + heightMm * heightMm)));
      expect(metrics.diagonalMm).toBe(Math.sqrt(widthMm * widthMm + heightMm * heightMm));
    }
    expect(calculateImagingAreaMetrics({ widthMm: 36, heightMm: 24 }).value.cropFactor35Mm).toBe(1);
    expect(calculateEquivalentFocalLength35Mm({ focalLengthMm: 18, activeImagingArea: { widthMm: 23.6, heightMm: 15.7 } }).value.equivalentFocalLength35Mm)
      .toBe(18 * Math.sqrt(1872 / (23.6 * 23.6 + 15.7 * 15.7)));
    // Extreme but finite areas stay finite and positive.
    expect(calculateImagingAreaMetrics({ widthMm: 1e200, heightMm: 1e200 }).value.cropFactor35Mm).toBeGreaterThan(0);
    expect(Number.isFinite(calculateImagingAreaMetrics({ widthMm: 1e-200, heightMm: 1e-200 }).value.cropFactor35Mm)).toBe(true);
  });

  it("parses a capture whose archived 35 mm equivalent differs by a few ulps (other engine or pre-2.0 Math.hypot)", () => {
    const { schemaVersion: _s, engineApiVersion: _e, resolvedGeometry: _r, equivalentFocalLength35Mm: _q, ...input } = loadSensorRawFrameInput().capture;
    void _s; void _e; void _r; void _q;
    const capture = createSimulatedCapture({
      ...input,
      geometry: { ...input.geometry, imagingArea: { widthMm: 23.6, heightMm: 15.7 } },
      exposure: { ...input.exposure, focalLengthMm: 18 }
    }).value;
    const archived = JSON.parse(JSON.stringify(capture)) as typeof capture;
    const nudged = { ...archived, equivalentFocalLength35Mm: archived.equivalentFocalLength35Mm * (1 + 2 * Number.EPSILON) };
    expect(nudged.equivalentFocalLength35Mm).not.toBe(capture.equivalentFocalLength35Mm);
    expect(parseSimulatedCapture(nudged).equivalentFocalLength35Mm).toBe(capture.equivalentFocalLength35Mm);
    expect(() => parseSimulatedCapture({ ...archived, equivalentFocalLength35Mm: archived.equivalentFocalLength35Mm * (1 + 1e-9) }))
      .toThrow("Archived derived capture metadata is inconsistent.");
    expect(() => parseSimulatedCapture({ ...archived, equivalentFocalLength35Mm: "27.4" }))
      .toThrow("Archived derived capture metadata is inconsistent.");
  });

  it("validates packed RAW metadata with the same few-ulp focal-equivalent tolerance and exact other fields", () => {
    const f = nativeRawFixture(2, 2);
    f.input.exposure.geometry.imagingArea = { widthMm: 23.6, heightMm: 15.7 };
    f.input.exposure.exposure.focalLengthMm = 18;
    const plan = JSON.parse(JSON.stringify(calculateNativeRawPlan(f.input))) as NativeRawOutput["plan"];
    const develop = (p: NativeRawOutput["plan"]) => (): unknown => createNativeRawDevelopmentTask({
      raw: { plan: p, codes: new Uint16Array(4), blackLevels: new Uint16Array(4), digitalSaturationCodes: new Uint16Array(4), saturationFlags: new Uint8Array(4) },
      phaseProfiles: [], colorProfile: {} as never, whiteBalance: "not-required", rendering: {} as never, maximumRetainedPayloadBytes: 1e6
    }, () => Promise.resolve());
    const withEquivalent = (value: number): NativeRawOutput["plan"] => ({ ...plan, exposure: { ...plan.exposure, equivalentFocalLength35Mm: value }, frame: { ...plan.frame, capture: { ...plan.frame.capture, equivalentFocalLength35Mm: value } } }) as NativeRawOutput["plan"];
    // Metadata validation passes; the empty phase list then fails a later, unrelated check.
    expect(develop(plan)).toThrow("Every CFA phase requires one profile");
    expect(develop(withEquivalent(plan.exposure.equivalentFocalLength35Mm * (1 + 2 * Number.EPSILON)))).toThrow("Every CFA phase requires one profile");
    expect(develop(withEquivalent(plan.exposure.equivalentFocalLength35Mm * (1 + 1e-9)))).toThrow("Packed RAW metadata is stale or inconsistent.");
    expect(develop({ ...plan, outputBytes: plan.outputBytes + 1 })).toThrow();
  });
});
