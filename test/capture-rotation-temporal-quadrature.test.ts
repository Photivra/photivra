import { describe, expect, it } from "vitest";

import {
  calculateCaptureRotationInverseMappings,
  calculateCaptureRotationTemporalQuadrature,
  type CalculateCaptureRotationTemporalQuadratureInput,
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
  CalculateCaptureRotationTemporalQuadratureInput,
  "samplePointsNative" | "temporalSampleCount"
> => ({
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
  orientation: "landscape"
});

describe("capture rotation temporal quadrature", () => {
  it("uses deterministic midpoint phases and equal normalized weights", () => {
    const result = calculateCaptureRotationTemporalQuadrature({
      ...baseInput(),
      temporalSampleCount: 4,
      samplePointsNative: [{ x: 3000, y: 2000 }]
    });

    const nodes = result.value.points[0]?.nodes ?? [];
    expect(nodes.map((node) => node.localExposurePhase)).toEqual([
      0.125,
      0.375,
      0.625,
      0.875
    ]);
    expect(nodes.map((node) => node.normalizedTimeWeight)).toEqual([
      0.25,
      0.25,
      0.25,
      0.25
    ]);
    expect(nodes.every((node) => node.localExposurePhase > 0)).toBe(
      true
    );
    expect(nodes.every((node) => node.localExposurePhase < 1)).toBe(
      true
    );
  });

  it("makes one temporal sample exactly the local midpoint mapping", () => {
    const quadrature = calculateCaptureRotationTemporalQuadrature({
      ...baseInput(),
      temporalSampleCount: 1,
      samplePointsNative: [{ x: 4200, y: 1200 }]
    }).value;

    const direct = calculateCaptureRotationInverseMappings({
      ...baseInput(),
      localExposurePhase: 0.5,
      samplePointsNative: [{ x: 4200, y: 1200 }]
    }).value;

    const node = quadrature.points[0]?.nodes[0];
    const mapped = direct.samples[0];

    expect(node?.localExposurePhase).toBe(0.5);
    expect(node?.captureTimeSecondsFromReference).toBeCloseTo(
      mapped?.captureTimeSecondsFromReference ?? 0,
      12
    );
    expect(node?.referenceImagePointMm.x).toBeCloseTo(
      mapped?.referenceImagePointMm.x ?? 0,
      12
    );
    expect(node?.referenceImagePointMm.y).toBeCloseTo(
      mapped?.referenceImagePointMm.y ?? 0,
      12
    );
  });

  it("normalizes average weights and seconds-valued measures independently", () => {
    const result = calculateCaptureRotationTemporalQuadrature({
      ...baseInput(),
      temporalSampleCount: 8,
      samplePointsNative: [{ x: 3000, y: 2000 }]
    }).value;

    const point = result.points[0];
    if (point === undefined) {
      throw new Error("Expected one quadrature point.");
    }

    const normalizedSum = point.nodes.reduce(
      (sum, node) => sum + node.normalizedTimeWeight,
      0
    );
    const secondsSum = point.nodes.reduce(
      (sum, node) => sum + node.timeMeasureSeconds,
      0
    );

    expect(normalizedSum).toBeCloseTo(1, 12);
    expect(secondsSum).toBeCloseTo(
      point.localExposureWindow.durationSeconds,
      12
    );
  });

  it("preserves different local durations with different dt measures per point", () => {
    const result = calculateCaptureRotationTemporalQuadrature({
      ...baseInput(),
      nominalExposureDurationSeconds: secondsFact(
        0.02,
        "test:nominal-variable"
      ),
      opening: scanned(
        "top-to-bottom",
        0.01,
        "test:opening"
      ),
      closing: scanned(
        "top-to-bottom",
        0.015,
        "test:closing"
      ),
      temporalSampleCount: 4,
      samplePointsNative: [
        { x: 3000, y: 0 },
        { x: 3000, y: 4000 }
      ]
    }).value;

    const top = result.points[0];
    const bottom = result.points[1];

    expect(top?.localExposureWindow.durationSeconds).toBeCloseTo(
      0.02,
      12
    );
    expect(bottom?.localExposureWindow.durationSeconds).toBeCloseTo(
      0.025,
      12
    );
    expect(top?.nodes[0]?.timeMeasureSeconds).toBeCloseTo(
      0.005,
      12
    );
    expect(bottom?.nodes[0]?.timeMeasureSeconds).toBeCloseTo(
      0.00625,
      12
    );
    expect(top?.nodes[0]?.normalizedTimeWeight).toBe(0.25);
    expect(bottom?.nodes[0]?.normalizedTimeWeight).toBe(0.25);
  });

  it("shifts physical node times with scanned local exposure windows", () => {
    const result = calculateCaptureRotationTemporalQuadrature({
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
      temporalSampleCount: 2,
      samplePointsNative: [
        { x: 3000, y: 0 },
        { x: 3000, y: 4000 }
      ]
    }).value;

    const topTimes =
      result.points[0]?.nodes.map(
        (node) => node.captureTimeSecondsFromReference
      ) ?? [];
    const bottomTimes =
      result.points[1]?.nodes.map(
        (node) => node.captureTimeSecondsFromReference
      ) ?? [];

    expect(topTimes[0]).toBeCloseTo(0.0025, 12);
    expect(topTimes[1]).toBeCloseTo(0.0075, 12);
    expect(bottomTimes[0]).toBeCloseTo(0.0225, 12);
    expect(bottomTimes[1]).toBeCloseTo(0.0275, 12);
  });

  it("keeps zero rotation at one stationary reference ray across all temporal nodes", () => {
    const result = calculateCaptureRotationTemporalQuadrature({
      ...baseInput(),
      opening: scanned(
        "left-to-right",
        0.015,
        "test:opening"
      ),
      closing: scanned(
        "left-to-right",
        0.015,
        "test:closing"
      ),
      angularVelocityRadPerSec: {
        pitch: 0,
        yaw: 0,
        roll: 0
      },
      temporalSampleCount: 7,
      samplePointsNative: [{ x: 4500, y: 1000 }]
    }).value;

    const point = result.points[0];
    if (point === undefined) {
      throw new Error("Expected one quadrature point.");
    }

    for (const node of point.nodes) {
      expect(node.referenceImagePointMm).toEqual(
        point.destinationImagePointMm
      );
      expect(node.inverseDisplacementNativeSamples.distance).toBe(0);
    }
  });

  it("is deterministic for identical inputs", () => {
    const input = {
      ...baseInput(),
      temporalSampleCount: 5,
      samplePointsNative: [
        { x: 1000, y: 500 },
        { x: 5000, y: 3500 }
      ]
    };

    const first = calculateCaptureRotationTemporalQuadrature(input);
    const second = calculateCaptureRotationTemporalQuadrature(input);

    expect(second).toEqual(first);
  });

  it("preserves out-of-frame reference geometry rather than clamping temporal nodes", () => {
    const result = calculateCaptureRotationTemporalQuadrature({
      ...baseInput(),
      angularVelocityRadPerSec: {
        pitch: 0,
        yaw: 1.2,
        roll: 0
      },
      temporalSampleCount: 4,
      samplePointsNative: [{ x: 5900, y: 2000 }]
    }).value;

    const nodes = result.points[0]?.nodes ?? [];
    expect(
      nodes.some(
        (node) => Math.abs(node.referenceImagePointMm.x) > 17.4
      )
    ).toBe(true);
  });

  it("fails closed on invalid temporal sample counts and unsafe output cardinality", () => {
    for (const temporalSampleCount of [
      0,
      -1,
      1.5,
      Number.NaN
    ]) {
      expect(() =>
        calculateCaptureRotationTemporalQuadrature({
          ...baseInput(),
          temporalSampleCount,
          samplePointsNative: [{ x: 3000, y: 2000 }]
        })
      ).toThrow("temporalSampleCount");
    }

    expect(() =>
      calculateCaptureRotationTemporalQuadrature({
        ...baseInput(),
        temporalSampleCount: Number.MAX_SAFE_INTEGER,
        samplePointsNative: [
          { x: 3000, y: 1000 },
          { x: 3000, y: 3000 }
        ]
      })
    ).toThrow("safe integer");
  });

  it("labels the result as temporal geometry, not radiance integration or a blur kernel", () => {
    const result = calculateCaptureRotationTemporalQuadrature({
      ...baseInput(),
      temporalSampleCount: 4,
      samplePointsNative: [{ x: 3000, y: 2000 }]
    });

    expect(result.provenance.kind).toBe("approximation");
    expect(result.value.quadratureScheme).toBe("uniform-midpoint");
    expect(result.value.temporalResponseModel).toBe(
      "uniform-over-local-exposure"
    );
    expect(result.value.outputMeaning).toBe(
      "temporal-geometry-quadrature-nodes"
    );
    expect(result.provenance.assumptions).toEqual(
      expect.arrayContaining([
        expect.stringContaining("No radiance"),
        expect.stringContaining("No geometry-only convergence"),
        expect.stringContaining("shutter transmission")
      ])
    );
  });
});
