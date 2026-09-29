import { describe, expect, it } from "vitest";

import {
  calculateCameraRotationImageMapping,
  calculateCaptureRotationTrajectories,
  type ExposureBoundarySchedule,
  type SourcedCaptureTimingSeconds
} from "../src/index.js";

type PhotivraOwnedEvidence = readonly [
  {
    sourceOrigin: "photivra";
    sourceReference: string;
    reuseStatus: "photivra-owned";
  }
];

const nativeRaster = {
  pixelWidth: 6000,
  pixelHeight: 4000
};

const imagingArea = {
  widthMm: 36,
  heightMm: 24
};

const evidence = (
  sourceReference: string
): PhotivraOwnedEvidence =>
  [
    {
      sourceOrigin: "photivra",
      sourceReference,
      reuseStatus: "photivra-owned"
    }
  ] as const;

const secondsFact = (
  value: number,
  sourceReference: string
): SourcedCaptureTimingSeconds => ({
  value,
  unit: "s",
  evidence: evidence(sourceReference)
});

const simultaneous = (): ExposureBoundarySchedule => ({
  kind: "simultaneous"
});

const scanned = (
  direction:
    | "top-to-bottom"
    | "bottom-to-top"
    | "left-to-right"
    | "right-to-left",
  traversalSeconds: number,
  sourceReference: string
): ExposureBoundarySchedule => ({
  kind: "uniform-linear-native-scan",
  directionNative: {
    value: direction,
    evidence: evidence(sourceReference + ":direction")
  },
  traversalDurationSeconds: secondsFact(
    traversalSeconds,
    sourceReference + ":duration"
  )
});

describe("capture rotation exposure trajectories", () => {
  it("binds full-frame center to the optical axis and evaluates its local window", () => {
    const result = calculateCaptureRotationTrajectories({
      imagingArea,
      nativeRaster,
      shutterMechanism: "electronic",
      nominalExposureDurationSeconds: secondsFact(
        0.01,
        "test:nominal"
      ),
      opening: simultaneous(),
      closing: simultaneous(),
      focalLengthMm: 50,
      angularVelocityRadPerSec: {
        pitch: 0,
        yaw: 0.1,
        roll: 0
      },
      samplePointsNative: [{ x: 3000, y: 2000 }]
    });

    const sample = result.value.samples[0];
    expect(sample?.referenceImagePointMm.x).toBeCloseTo(0, 12);
    expect(sample?.referenceImagePointMm.y).toBeCloseTo(0, 12);
    expect(
      sample?.localExposureWindow.startSecondsFromCaptureReference
    ).toBe(0);
    expect(
      sample?.localExposureWindow.endSecondsFromCaptureReference
    ).toBe(0.01);
    expect(sample?.atLocalExposureStart.mappedImagePointMm.x).toBeCloseTo(
      0,
      12
    );
    expect(sample?.atLocalExposureStart.mappedImagePointMm.y).toBeCloseTo(
      0,
      12
    );
    expect(
      Math.abs(sample?.atLocalExposureEnd.mappedImagePointMm.x ?? 0)
    ).toBeGreaterThan(0);
  });

  it("uses local scanned exposure times without importing sensor readout timing", () => {
    const result = calculateCaptureRotationTrajectories({
      imagingArea,
      nativeRaster,
      shutterMechanism: "mechanical",
      nominalExposureDurationSeconds: secondsFact(
        0.005,
        "test:nominal"
      ),
      opening: scanned(
        "top-to-bottom",
        0.02,
        "test:opening"
      ),
      closing: scanned(
        "top-to-bottom",
        0.02,
        "test:closing"
      ),
      focalLengthMm: 50,
      angularVelocityRadPerSec: {
        pitch: 0,
        yaw: 0.2,
        roll: 0
      },
      samplePointsNative: [
        { x: 3000, y: 0 },
        { x: 3000, y: 4000 }
      ]
    });

    const top = result.value.samples[0];
    const bottom = result.value.samples[1];

    expect(
      top?.localExposureWindow.startSecondsFromCaptureReference
    ).toBeCloseTo(0, 12);
    expect(
      top?.localExposureWindow.endSecondsFromCaptureReference
    ).toBeCloseTo(0.005, 12);
    expect(
      bottom?.localExposureWindow.startSecondsFromCaptureReference
    ).toBeCloseTo(0.02, 12);
    expect(
      bottom?.localExposureWindow.endSecondsFromCaptureReference
    ).toBeCloseTo(0.025, 12);
    expect(top?.localExposureWindow.durationSeconds).toBeCloseTo(
      0.005,
      12
    );
    expect(bottom?.localExposureWindow.durationSeconds).toBeCloseTo(
      0.005,
      12
    );

    expect(
      Math.abs(
        bottom?.atLocalExposureStart.deltaFromReferenceMm.x ?? 0
      )
    ).toBeGreaterThan(
      Math.abs(
        top?.atLocalExposureStart.deltaFromReferenceMm.x ?? 0
      )
    );
  });

  it("matches direct low-level camera-rotation evaluation at local start and end", () => {
    const angularVelocityRadPerSec = {
      pitch: 0.01,
      yaw: -0.03,
      roll: 0.02
    };

    const result = calculateCaptureRotationTrajectories({
      imagingArea,
      nativeRaster,
      shutterMechanism: "electronic-first-curtain",
      nominalExposureDurationSeconds: secondsFact(
        0.012,
        "test:nominal"
      ),
      opening: scanned(
        "left-to-right",
        0.006,
        "test:opening"
      ),
      closing: scanned(
        "left-to-right",
        0.008,
        "test:closing"
      ),
      focalLengthMm: 85,
      focusDistanceM: 10,
      angularVelocityRadPerSec,
      samplePointsNative: [{ x: 4500, y: 1000 }]
    });

    const sample = result.value.samples[0];
    if (sample === undefined) {
      throw new Error("Expected one trajectory sample.");
    }

    const directStart = calculateCameraRotationImageMapping({
      focalLengthMm: 85,
      focusDistanceM: 10,
      imagePointMm: sample.referenceImagePointMm,
      timeSecondsFromExposureStart:
        sample.localExposureWindow.startSecondsFromCaptureReference,
      angularVelocityRadPerSec
    }).value;

    const directEnd = calculateCameraRotationImageMapping({
      focalLengthMm: 85,
      focusDistanceM: 10,
      imagePointMm: sample.referenceImagePointMm,
      timeSecondsFromExposureStart:
        sample.localExposureWindow.endSecondsFromCaptureReference,
      angularVelocityRadPerSec
    }).value;

    expect(sample.atLocalExposureStart.mappedImagePointMm.x).toBeCloseTo(
      directStart.mappedImagePointMm.x,
      12
    );
    expect(sample.atLocalExposureStart.mappedImagePointMm.y).toBeCloseTo(
      directStart.mappedImagePointMm.y,
      12
    );
    expect(sample.atLocalExposureEnd.mappedImagePointMm.x).toBeCloseTo(
      directEnd.mappedImagePointMm.x,
      12
    );
    expect(sample.atLocalExposureEnd.mappedImagePointMm.y).toBeCloseTo(
      directEnd.mappedImagePointMm.y,
      12
    );
  });

  it("preserves zero-rotation identity even when exposure windows scan spatially", () => {
    const result = calculateCaptureRotationTrajectories({
      imagingArea,
      nativeRaster,
      shutterMechanism: "electronic",
      nominalExposureDurationSeconds: secondsFact(
        0.01,
        "test:nominal"
      ),
      opening: scanned(
        "right-to-left",
        0.008,
        "test:opening"
      ),
      closing: scanned(
        "right-to-left",
        0.008,
        "test:closing"
      ),
      focalLengthMm: 35,
      angularVelocityRadPerSec: {
        pitch: 0,
        yaw: 0,
        roll: 0
      },
      samplePointsNative: [
        { x: 1000, y: 1000 },
        { x: 5000, y: 3000 }
      ]
    });

    for (const sample of result.value.samples) {
      expect(sample.atLocalExposureStart.mappedImagePointMm).toEqual(
        sample.referenceImagePointMm
      );
      expect(sample.atLocalExposureEnd.mappedImagePointMm).toEqual(
        sample.referenceImagePointMm
      );
      expect(
        sample.localExposureTrajectoryEndpointDeltaMm.distance
      ).toBe(0);
    }
  });

  it("maps off-center active-capture native coordinates to the existing physical image plane", () => {
    const result = calculateCaptureRotationTrajectories({
      imagingArea,
      nativeRaster,
      activeCaptureRect: {
        x: 0,
        y: 800,
        width: 3000,
        height: 2400
      },
      shutterMechanism: "electronic",
      nominalExposureDurationSeconds: secondsFact(
        0.01,
        "test:nominal"
      ),
      opening: simultaneous(),
      closing: simultaneous(),
      focalLengthMm: 50,
      angularVelocityRadPerSec: {
        pitch: 0,
        yaw: 0,
        roll: 0
      },
      samplePointsNative: [{ x: 0, y: 800 }]
    });

    const point = result.value.samples[0]?.referenceImagePointMm;
    expect(point?.x).toBeCloseTo(-18, 12);
    expect(point?.y).toBeCloseTo(7.2, 12);
  });

  it("keeps the endpoint chord explicitly distinct from a rolling-shutter warp or blur", () => {
    const result = calculateCaptureRotationTrajectories({
      imagingArea,
      nativeRaster,
      shutterMechanism: "electronic",
      nominalExposureDurationSeconds: secondsFact(
        0.02,
        "test:nominal"
      ),
      opening: simultaneous(),
      closing: simultaneous(),
      focalLengthMm: 50,
      angularVelocityRadPerSec: {
        pitch: 0.05,
        yaw: 0.03,
        roll: 0.02
      },
      samplePointsNative: [{ x: 4500, y: 1000 }]
    });

    const sample = result.value.samples[0];
    expect(
      sample?.localExposureTrajectoryEndpointDeltaMm.distance
    ).toBeGreaterThan(0);
    expect(result.value.trajectoryMeaning).toBe(
      "forward-stationary-reference-ray"
    );
    expect(result.provenance.assumptions).toEqual(
      expect.arrayContaining([
        expect.stringContaining("not a rolling-shutter image warp"),
        expect.stringContaining("not an integrated blur kernel"),
        expect.stringContaining(
          "Sensor data-readout timing does not participate"
        )
      ])
    );
  });

  it("preserves component provenance and explicit capture time reference", () => {
    const result = calculateCaptureRotationTrajectories({
      imagingArea,
      nativeRaster,
      shutterMechanism: "electronic",
      nominalExposureDurationSeconds: secondsFact(
        0.01,
        "test:nominal"
      ),
      opening: simultaneous(),
      closing: simultaneous(),
      focalLengthMm: 50,
      angularVelocityRadPerSec: {
        pitch: 0,
        yaw: 0.01,
        roll: 0
      },
      samplePointsNative: [{ x: 3000, y: 2000 }]
    });

    expect(result.value.timeReference).toBe(
      "first-opening-boundary-phase"
    );
    expect(result.value.componentProvenance.exposureWindows.kind).toBe(
      "approximation"
    );
    expect(result.value.componentProvenance.cameraRotation.kind).toBe(
      "calculated"
    );
    expect(result.provenance.kind).toBe("approximation");
  });

  it("requires a non-empty sample set and inherits exposure-window fail-closed validation", () => {
    expect(() =>
      calculateCaptureRotationTrajectories({
        imagingArea,
        nativeRaster,
        shutterMechanism: "electronic",
        nominalExposureDurationSeconds: secondsFact(
          0.01,
          "test:nominal"
        ),
        opening: simultaneous(),
        closing: simultaneous(),
        focalLengthMm: 50,
        angularVelocityRadPerSec: {
          pitch: 0,
          yaw: 0,
          roll: 0
        },
        samplePointsNative: []
      })
    ).toThrow("non-empty array");

    expect(() =>
      calculateCaptureRotationTrajectories({
        imagingArea,
        nativeRaster,
        activeCaptureRect: {
          x: 1000,
          y: 500,
          width: 3000,
          height: 2000
        },
        shutterMechanism: "electronic",
        nominalExposureDurationSeconds: secondsFact(
          0.01,
          "test:nominal"
        ),
        opening: simultaneous(),
        closing: simultaneous(),
        focalLengthMm: 50,
        angularVelocityRadPerSec: {
          pitch: 0,
          yaw: 0,
          roll: 0
        },
        samplePointsNative: [{ x: 2500, y: 3000 }]
      })
    ).toThrow("activeCaptureRect edge-coordinate bounds");
  });
});
