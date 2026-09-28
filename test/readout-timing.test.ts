import { describe, expect, it } from "vitest";

import {
  calculateSensorReadoutTiming,
  type CaptureOrientation
} from "../src/index.js";

const evidence = [
  {
    sourceOrigin: "photivra",
    sourceReference: "test:readout-timing",
    reuseStatus: "photivra-owned"
  }
] as const;

const nativeRaster = { pixelWidth: 6000, pixelHeight: 4000 };

describe("sensor readout timing", () => {
  it("maps rolling readout time across the active capture in native coordinates", () => {
    const result = calculateSensorReadoutTiming({
      nativeRaster,
      orientation: "landscape",
      readoutMode: "rolling",
      scanDirectionNative: "top-to-bottom",
      captureReadoutDurationSeconds: 0.02,
      shutterMechanism: "electronic",
      exposureStartSeconds: 1,
      exposureDurationSeconds: 0.01,
      readoutEvidence: evidence,
      samplePointsNative: [
        { x: 3000, y: 0 },
        { x: 3000, y: 2000 },
        { x: 3000, y: 4000 }
      ]
    });

    expect(result.value.maximumExposureStartOffsetSeconds).toBeCloseTo(
      0.02,
      12
    );
    expect(
      result.value.samples.map((sample) => sample.normalizedScanPosition)
    ).toEqual([0, 0.5, 1]);
    expect(
      result.value.samples.map((sample) => sample.exposureStartSeconds)
    ).toEqual([1, 1.01, 1.02]);
    expect(
      result.value.samples.map((sample) => sample.exposureEndSeconds)
    ).toEqual([1.01, 1.02, 1.03]);
    expect(result.value.scan?.unitVectorNative).toEqual({ x: 0, y: 1 });
  });

  it("preserves native scan direction while orientation rotates the reported capture-basis vector", () => {
    const orientations: readonly CaptureOrientation[] = [
      "landscape",
      "portrait-clockwise",
      "landscape-inverted",
      "portrait-counter-clockwise"
    ];

    const vectors = orientations.map(
      (orientation) =>
        calculateSensorReadoutTiming({
          nativeRaster,
          orientation,
          readoutMode: "rolling",
          scanDirectionNative: "top-to-bottom",
          captureReadoutDurationSeconds: 0.02,
          shutterMechanism: "electronic",
          exposureDurationSeconds: 0.01,
          readoutEvidence: evidence
        }).value.scan?.unitVectorOriented
    );

    expect(vectors).toEqual([
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 0, y: -1 },
      { x: 1, y: 0 }
    ]);
  });

  it("supports active-crop-specific rolling timing without inferring it from output geometry", () => {
    const result = calculateSensorReadoutTiming({
      nativeRaster,
      activeCaptureRect: { x: 1000, y: 500, width: 3000, height: 2000 },
      orientation: "landscape",
      readoutMode: "rolling",
      scanDirectionNative: "right-to-left",
      captureReadoutDurationSeconds: 0.008,
      shutterMechanism: "electronic-first-curtain",
      exposureDurationSeconds: 0.004,
      readoutEvidence: evidence,
      samplePointsNative: [
        { x: 4000, y: 1500 },
        { x: 2500, y: 1500 },
        { x: 1000, y: 1500 }
      ]
    });

    expect(
      result.value.samples.map((sample) => sample.exposureStartOffsetSeconds)
    ).toEqual([0, 0.004, 0.008]);
    expect(result.value.activeCaptureRect).toEqual({
      x: 1000,
      y: 500,
      width: 3000,
      height: 2000
    });
  });

  it("keeps global exposure start simultaneous even with non-zero readout duration", () => {
    const result = calculateSensorReadoutTiming({
      nativeRaster,
      orientation: "portrait-clockwise",
      readoutMode: "global",
      captureReadoutDurationSeconds: 0.012,
      shutterMechanism: "mechanical",
      exposureStartSeconds: 2,
      exposureDurationSeconds: 0.005,
      readoutEvidence: evidence,
      samplePointsNative: [
        { x: 0, y: 0 },
        { x: 3000, y: 2000 },
        { x: 6000, y: 4000 }
      ]
    });

    expect(result.value.scan).toBeNull();
    expect(result.value.maximumExposureStartOffsetSeconds).toBe(0);
    expect(
      result.value.samples.map((sample) => sample.exposureStartSeconds)
    ).toEqual([2, 2, 2]);
    expect(
      result.value.samples.map((sample) => sample.normalizedScanPosition)
    ).toEqual([null, null, null]);
  });

  it("keeps shutter mechanism independent from rolling/global readout behavior", () => {
    const electronic = calculateSensorReadoutTiming({
      nativeRaster,
      orientation: "landscape",
      readoutMode: "rolling",
      scanDirectionNative: "left-to-right",
      captureReadoutDurationSeconds: 0.01,
      shutterMechanism: "electronic",
      exposureDurationSeconds: 0.002,
      readoutEvidence: evidence,
      samplePointsNative: [{ x: 3000, y: 2000 }]
    }).value;

    const mechanical = calculateSensorReadoutTiming({
      nativeRaster,
      orientation: "landscape",
      readoutMode: "rolling",
      scanDirectionNative: "left-to-right",
      captureReadoutDurationSeconds: 0.01,
      shutterMechanism: "mechanical",
      exposureDurationSeconds: 0.002,
      readoutEvidence: evidence,
      samplePointsNative: [{ x: 3000, y: 2000 }]
    }).value;

    expect(electronic.samples).toEqual(mechanical.samples);
    expect(electronic.scan).toEqual(mechanical.scan);
    expect(electronic.shutterMechanism).toBe("electronic");
    expect(mechanical.shutterMechanism).toBe("mechanical");
  });

  it("fails closed on invalid runtime combinations and out-of-bounds samples", () => {
    expect(() =>
      calculateSensorReadoutTiming({
        nativeRaster,
        orientation: "landscape",
        readoutMode: "rolling",
        captureReadoutDurationSeconds: 0.01,
        shutterMechanism: "electronic",
        exposureDurationSeconds: 0.002,
        readoutEvidence: evidence
      })
    ).toThrow("scanDirectionNative");

    expect(() =>
      calculateSensorReadoutTiming({
        nativeRaster,
        orientation: "landscape",
        readoutMode: "global",
        scanDirectionNative: "top-to-bottom",
        captureReadoutDurationSeconds: 0.01,
        shutterMechanism: "electronic",
        exposureDurationSeconds: 0.002,
        readoutEvidence: evidence
      })
    ).toThrow("must be omitted");

    expect(() =>
      calculateSensorReadoutTiming({
        nativeRaster,
        activeCaptureRect: { x: 1000, y: 500, width: 3000, height: 2000 },
        orientation: "landscape",
        readoutMode: "rolling",
        scanDirectionNative: "top-to-bottom",
        captureReadoutDurationSeconds: 0.01,
        shutterMechanism: "electronic",
        exposureDurationSeconds: 0.002,
        readoutEvidence: evidence,
        samplePointsNative: [{ x: 2500, y: 3000 }]
      })
    ).toThrow("activeCaptureRect edge-coordinate bounds");
  });

  it("requires evidence for caller-declared readout timing facts", () => {
    expect(() =>
      calculateSensorReadoutTiming({
        nativeRaster,
        orientation: "landscape",
        readoutMode: "global",
        captureReadoutDurationSeconds: 0,
        shutterMechanism: "electronic",
        exposureDurationSeconds: 0.002,
        readoutEvidence: []
      })
    ).toThrow("readoutEvidence must be a non-empty array");
  });
});
