import { describe, expect, it } from "vitest";

import {
  calculateCaptureRotationInverseMappings,
  calculateInverseCameraRotationImageMapping,
  transformNativeRasterVectorToOriented,
  type CalculateCaptureRotationInverseMappingsInput,
  type CaptureOrientation,
  type CaptureRotationInverseMappingSample,
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

const imagingArea = { widthMm: 36, heightMm: 24 };
const nativeRaster = { pixelWidth: 6000, pixelHeight: 4000 };

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

const baseInput = (): Omit<
  CalculateCaptureRotationInverseMappingsInput,
  "samplePointsNative"
> =>
  ({
    imagingArea,
    nativeRaster,
    shutterMechanism: "electronic" as const,
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
    localExposurePhase: 0.5,
    orientation: "landscape" as const
  });

describe("capture rotation instantaneous inverse mapping", () => {
  it("reduces simultaneous exposure timing to one global camera pose", () => {
    const result = calculateCaptureRotationInverseMappings({
      ...baseInput(),
      samplePointsNative: [
        { x: 3000, y: 1000 },
        { x: 3000, y: 3000 }
      ]
    });

    expect(
      result.value.samples.map(
        (sample) => sample.captureTimeSecondsFromReference
      )
    ).toEqual([0.005, 0.005]);

    for (const sample of result.value.samples) {
      const direct = calculateInverseCameraRotationImageMapping({
        focalLengthMm: 50,
        imagePointMm: sample.destinationImagePointMm,
        timeSecondsFromExposureStart: 0.005,
        angularVelocityRadPerSec: {
          pitch: 0,
          yaw: 0.1,
          roll: 0
        }
      }).value;

      expect(sample.referenceImagePointMm.x).toBeCloseTo(
        direct.referenceImagePointMm.x,
        12
      );
      expect(sample.referenceImagePointMm.y).toBeCloseTo(
        direct.referenceImagePointMm.y,
        12
      );
    }
  });

  it("requires the caller to select start, midpoint, or end geometry explicitly", () => {
    const point = [{ x: 3000, y: 2000 }];
    const calculate = (
      localExposurePhase: number
    ): CaptureRotationInverseMappingSample | undefined =>
      calculateCaptureRotationInverseMappings({
        ...baseInput(),
        localExposurePhase,
        samplePointsNative: point
      }).value.samples[0];

    const start = calculate(0);
    const middle = calculate(0.5);
    const end = calculate(1);

    expect(start?.captureTimeSecondsFromReference).toBeCloseTo(0, 12);
    expect(middle?.captureTimeSecondsFromReference).toBeCloseTo(
      0.005,
      12
    );
    expect(end?.captureTimeSecondsFromReference).toBeCloseTo(0.01, 12);

    expect(
      start?.inverseDisplacementImagePlaneMm.distance
    ).toBeCloseTo(0, 12);
    expect(
      middle?.inverseDisplacementImagePlaneMm.distance ?? 0
    ).toBeGreaterThan(0);
    expect(
      end?.inverseDisplacementImagePlaneMm.distance ?? 0
    ).toBeGreaterThan(
      middle?.inverseDisplacementImagePlaneMm.distance ?? 0
    );
  });

  it("reverses the spatial timing gradient when scan direction reverses", () => {
    const points = [
      { x: 3000, y: 0 },
      { x: 3000, y: 4000 }
    ];

    const calculate = (
      direction: "top-to-bottom" | "bottom-to-top"
    ): readonly CaptureRotationInverseMappingSample[] =>
      calculateCaptureRotationInverseMappings({
        ...baseInput(),
        nominalExposureDurationSeconds: secondsFact(
          0.002,
          "test:nominal-fast"
        ),
        opening: scanned(
          direction,
          0.02,
          "test:opening-" + direction
        ),
        closing: scanned(
          direction,
          0.02,
          "test:closing-" + direction
        ),
        localExposurePhase: 0,
        samplePointsNative: points
      }).value.samples;

    const topToBottom = calculate("top-to-bottom");
    const bottomToTop = calculate("bottom-to-top");

    expect(
      topToBottom.map(
        (sample) => sample.captureTimeSecondsFromReference
      )
    ).toEqual([0, 0.02]);
    expect(
      bottomToTop.map(
        (sample) => sample.captureTimeSecondsFromReference
      )
    ).toEqual([0.02, 0]);

    const ttbGradient =
      (topToBottom[1]?.inverseDisplacementImagePlaneMm.x ?? 0) -
      (topToBottom[0]?.inverseDisplacementImagePlaneMm.x ?? 0);
    const bttGradient =
      (bottomToTop[1]?.inverseDisplacementImagePlaneMm.x ?? 0) -
      (bottomToTop[0]?.inverseDisplacementImagePlaneMm.x ?? 0);

    expect(ttbGradient).toBeCloseTo(-bttGradient, 10);
    expect(Math.abs(ttbGradient)).toBeGreaterThan(0);
  });

  it("rotates native inverse sample displacement into all four capture orientations", () => {
    const orientations: readonly CaptureOrientation[] = [
      "landscape",
      "portrait-clockwise",
      "landscape-inverted",
      "portrait-counter-clockwise"
    ];

    for (const orientation of orientations) {
      const sample = calculateCaptureRotationInverseMappings({
        ...baseInput(),
        orientation,
        samplePointsNative: [{ x: 4200, y: 1200 }]
      }).value.samples[0];

      if (sample === undefined) {
        throw new Error("Expected one inverse mapping sample.");
      }

      const expected = transformNativeRasterVectorToOriented({
        vector: {
          x: sample.inverseDisplacementNativeSamples.x,
          y: sample.inverseDisplacementNativeSamples.y
        },
        orientation
      });

      expect(
        sample.inverseDisplacementOrientedSamples.x
      ).toBeCloseTo(expected.x, 12);
      expect(
        sample.inverseDisplacementOrientedSamples.y
      ).toBeCloseTo(expected.y, 12);
      expect(
        sample.inverseDisplacementOrientedSamples.distance
      ).toBeCloseTo(
        sample.inverseDisplacementNativeSamples.distance,
        12
      );
    }
  });

  it("preserves off-center active-capture physical coordinates", () => {
    const sample = calculateCaptureRotationInverseMappings({
      ...baseInput(),
      activeCaptureRect: {
        x: 0,
        y: 800,
        width: 3000,
        height: 2400
      },
      angularVelocityRadPerSec: {
        pitch: 0,
        yaw: 0,
        roll: 0
      },
      localExposurePhase: 0,
      samplePointsNative: [{ x: 0, y: 800 }]
    }).value.samples[0];

    expect(sample?.destinationImagePointMm.x).toBeCloseTo(-18, 12);
    expect(sample?.destinationImagePointMm.y).toBeCloseTo(7.2, 12);
    expect(sample?.referenceImagePointMm.x).toBeCloseTo(-18, 12);
    expect(sample?.referenceImagePointMm.y).toBeCloseTo(7.2, 12);
  });

  it("does not clamp a valid reference ray merely because motion moves it outside the active frame", () => {
    const sample = calculateCaptureRotationInverseMappings({
      ...baseInput(),
      angularVelocityRadPerSec: {
        pitch: 0,
        yaw: 1.2,
        roll: 0
      },
      localExposurePhase: 1,
      samplePointsNative: [{ x: 5900, y: 2000 }]
    }).value.samples[0];

    expect(sample).toBeDefined();
    expect(
      Math.abs(sample?.referenceImagePointMm.x ?? 0)
    ).toBeGreaterThan(17.4);
  });

  it("keeps zero rotation at identity regardless of capture scan timing", () => {
    const result = calculateCaptureRotationInverseMappings({
      ...baseInput(),
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
      angularVelocityRadPerSec: {
        pitch: 0,
        yaw: 0,
        roll: 0
      },
      localExposurePhase: 0.75,
      samplePointsNative: [
        { x: 1000, y: 500 },
        { x: 5000, y: 3500 }
      ]
    });

    for (const sample of result.value.samples) {
      expect(sample.referenceImagePointMm).toEqual(
        sample.destinationImagePointMm
      );
      expect(sample.inverseDisplacementNativeSamples.distance).toBe(0);
    }
  });

  it("uses full-sensor geometric sample pitch rather than output resolution", () => {
    const sample = calculateCaptureRotationInverseMappings({
      ...baseInput(),
      samplePointsNative: [{ x: 4200, y: 1200 }]
    }).value.samples[0];

    if (sample === undefined) {
      throw new Error("Expected one inverse mapping sample.");
    }

    expect(sample.inverseDisplacementNativeSamples.x).toBeCloseTo(
      sample.inverseDisplacementImagePlaneMm.x / 0.006,
      12
    );
    expect(sample.inverseDisplacementNativeSamples.y).toBeCloseTo(
      -sample.inverseDisplacementImagePlaneMm.y / 0.006,
      12
    );
  });

  it("fails closed on invalid exposure phase and invalid destination points", () => {
    for (const localExposurePhase of [
      -0.01,
      1.01,
      Number.NaN
    ]) {
      expect(() =>
        calculateCaptureRotationInverseMappings({
          ...baseInput(),
          localExposurePhase,
          samplePointsNative: [{ x: 3000, y: 2000 }]
        })
      ).toThrow("localExposurePhase");
    }

    expect(() =>
      calculateCaptureRotationInverseMappings({
        ...baseInput(),
        activeCaptureRect: {
          x: 1000,
          y: 500,
          width: 3000,
          height: 2000
        },
        samplePointsNative: [{ x: 2500, y: 3000 }]
      })
    ).toThrow("activeCaptureRect edge-coordinate bounds");
  });

  it("preserves provenance and explicitly labels the instantaneous model boundary", () => {
    const result = calculateCaptureRotationInverseMappings({
      ...baseInput(),
      samplePointsNative: [{ x: 3000, y: 2000 }]
    });

    expect(result.provenance.kind).toBe("approximation");
    expect(
      result.value.componentProvenance.inverseCameraRotation.kind
    ).toBe("calculated");
    expect(
      result.value.componentProvenance.exposureWindows.kind
    ).toBe("approximation");
    expect(result.provenance.assumptions).toEqual(
      expect.arrayContaining([
        expect.stringContaining("no iterative or fixed-point solver"),
        expect.stringContaining("not finite-exposure integration"),
        expect.stringContaining(
          "Sensor data-readout timing is not an input"
        )
      ])
    );
  });
});
