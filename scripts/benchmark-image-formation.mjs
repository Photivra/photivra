// SPDX-License-Identifier: Apache-2.0

import {
  calculateCameraRotationImageMapping,
  calculateIlluminationVignetting,
  calculateInverseLateralChromaticAberrationMapping,
  calculateInverseRadialDistortionMapping
} from "../dist/index.js";

const GRID_COLUMNS = 33;
const GRID_ROWS = 33;
const ROTATION_TIME_SAMPLES = [0, 1 / 1000, 1 / 500, 1 / 250, 1 / 125];
const REPEATS = 5;
const SENSOR_HALF_WIDTH_MM = 18;
const SENSOR_HALF_HEIGHT_MM = 12;
const NORMALIZATION_RADIUS_MM = Math.hypot(
  SENSOR_HALF_WIDTH_MM,
  SENSOR_HALF_HEIGHT_MM
);

const radialProfile = {
  normalizationRadiusMm: NORMALIZATION_RADIUS_MM,
  maximumNormalizedRadius: 1,
  coefficients: {
    k1: 0.06,
    k2: -0.01,
    k3: 0.002
  }
};

const caProfile = {
  normalizationRadiusMm: NORMALIZATION_RADIUS_MM,
  maximumNormalizedRadius: 1,
  baseDistortionCoefficients: {
    k1: 0.05,
    k2: -0.008,
    k3: 0.001
  },
  redCoefficientOffset: {
    k1: 0.01,
    k2: 0,
    k3: 0
  },
  blueCoefficientOffset: {
    k1: -0.01,
    k2: 0,
    k3: 0
  }
};

const vignettingProfile = {
  normalizationRadiusMm: NORMALIZATION_RADIUS_MM,
  maximumNormalizedRadius: 1,
  coefficients: {
    r2: -0.35,
    r4: 0.08,
    r6: -0.01
  }
};

function gridPoints() {
  const points = [];
  for (let row = 0; row < GRID_ROWS; row += 1) {
    const y =
      -SENSOR_HALF_HEIGHT_MM +
      (2 * SENSOR_HALF_HEIGHT_MM * row) / (GRID_ROWS - 1);
    for (let column = 0; column < GRID_COLUMNS; column += 1) {
      const x =
        -SENSOR_HALF_WIDTH_MM +
        (2 * SENSOR_HALF_WIDTH_MM * column) / (GRID_COLUMNS - 1);
      points.push({ x, y });
    }
  }
  return points;
}

function median(values) {
  const sorted = [...values].sort((first, second) => first - second);
  return sorted[Math.floor(sorted.length / 2)];
}

function measure(label, operationCount, sample) {
  sample();

  const durationsMs = [];
  const retainedHeapDeltasBytes = [];

  for (let repeat = 0; repeat < REPEATS; repeat += 1) {
    globalThis.gc?.();
    const heapBeforeBytes = process.memoryUsage().heapUsed;
    const started = process.hrtime.bigint();

    sample();

    const finished = process.hrtime.bigint();
    globalThis.gc?.();
    const heapAfterBytes = process.memoryUsage().heapUsed;

    durationsMs.push(Number(finished - started) / 1_000_000);
    retainedHeapDeltasBytes.push(heapAfterBytes - heapBeforeBytes);
  }

  const medianMs = median(durationsMs);

  return {
    label,
    operationCount,
    repeats: REPEATS,
    medianMs,
    operationsPerSecond: operationCount / (medianMs / 1000),
    durationSamplesMs: durationsMs,
    retainedHeapDeltaSamplesBytes: retainedHeapDeltasBytes,
    retainedHeapDeltaCaution:
      "Net retained heap after an explicit GC is not an allocation-count measurement."
  };
}

const points = gridPoints();

const results = [
  measure("inverse-radial-distortion-33x33", points.length, () => {
    for (const point of points) {
      calculateInverseRadialDistortionMapping({
        distortedImagePointMm: point,
        profile: radialProfile
      });
    }
  }),
  measure("inverse-lateral-ca-33x33", points.length, () => {
    for (const point of points) {
      calculateInverseLateralChromaticAberrationMapping({
        distortedImagePointMm: point,
        profile: caProfile
      });
    }
  }),
  measure("illumination-vignetting-33x33", points.length, () => {
    for (const point of points) {
      calculateIlluminationVignetting({
        imagePointMm: point,
        profile: vignettingProfile
      });
    }
  }),
  measure(
    "camera-rotation-33x33x5-time-samples",
    points.length * ROTATION_TIME_SAMPLES.length,
    () => {
      for (const timeSecondsFromExposureStart of ROTATION_TIME_SAMPLES) {
        for (const point of points) {
          calculateCameraRotationImageMapping({
            focalLengthMm: 50,
            focusDistanceM: 4,
            imagePointMm: point,
            timeSecondsFromExposureStart,
            angularVelocityRadPerSec: {
              pitch: -0.006,
              yaw: 0.015,
              roll: 0.004
            }
          });
        }
      }
    }
  )
];

console.log(
  JSON.stringify(
    {
      benchmark: "image-formation-scalar-sampling",
      benchmarkVersion: 1,
      enginePackageVersion: "0.4.0",
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      grid: {
        columns: GRID_COLUMNS,
        rows: GRID_ROWS,
        pointCount: points.length,
        physicalBoundsMm: {
          left: -SENSOR_HALF_WIDTH_MM,
          right: SENSOR_HALF_WIDTH_MM,
          top: -SENSOR_HALF_HEIGHT_MM,
          bottom: SENSOR_HALF_HEIGHT_MM
        },
        normalizationRadiusMm: NORMALIZATION_RADIUS_MM
      },
      rotationTimeSamplesSeconds: ROTATION_TIME_SAMPLES,
      results
    },
    null,
    2
  )
);
