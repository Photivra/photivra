// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from "node:fs";
import process from "node:process";
import { URL } from "node:url";

import {
  calculateCameraRotationImageMapping,
  calculateIlluminationVignetting,
  calculateInverseLateralChromaticAberrationMapping,
  calculateInverseLateralChromaticAberrationMappings,
  calculateInverseRadialDistortionMapping,
  calculateInverseRadialDistortionMappings
} from "../dist/index.js";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
);

const GRID_COLUMNS = 33;
const GRID_ROWS = 33;
const ROTATION_TIME_SAMPLES = [0, 1 / 1000, 1 / 500, 1 / 250, 1 / 125];
const WARMUP_REPEATS = 3;
const REPEATS = 9;
const INNER_REPEATS = 5;
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

function runInner(sample) {
  for (let inner = 0; inner < INNER_REPEATS; inner += 1) {
    sample();
  }
}

function warm(sample) {
  for (let repeat = 0; repeat < WARMUP_REPEATS; repeat += 1) {
    runInner(sample);
  }
}

function measureOne(sample) {
  globalThis.gc?.();
  const heapBeforeBytes = process.memoryUsage().heapUsed;
  const started = process.hrtime.bigint();

  runInner(sample);

  const finished = process.hrtime.bigint();
  globalThis.gc?.();
  const heapAfterBytes = process.memoryUsage().heapUsed;

  return {
    durationMs: Number(finished - started) / 1_000_000,
    retainedHeapDeltaBytes: heapAfterBytes - heapBeforeBytes
  };
}

function summarize(label, operationCountPerInner, samples) {
  const durationsMs = samples.map((sample) => sample.durationMs);
  const retainedHeapDeltasBytes = samples.map(
    (sample) => sample.retainedHeapDeltaBytes
  );
  const medianMs = median(durationsMs);
  const operationCount = operationCountPerInner * INNER_REPEATS;

  return {
    label,
    operationCount,
    repeats: REPEATS,
    innerRepeats: INNER_REPEATS,
    medianMs,
    operationsPerSecond: operationCount / (medianMs / 1000),
    durationSamplesMs: durationsMs,
    retainedHeapDeltaSamplesBytes: retainedHeapDeltasBytes,
    retainedHeapDeltaCaution:
      "Net retained heap after an explicit GC is not an allocation-count measurement."
  };
}

function measure(label, operationCountPerInner, sample) {
  warm(sample);
  const samples = [];
  for (let repeat = 0; repeat < REPEATS; repeat += 1) {
    samples.push(measureOne(sample));
  }
  return summarize(label, operationCountPerInner, samples);
}

function measureAlternatingPair(first, second) {
  warm(first.sample);
  warm(second.sample);

  const firstSamples = [];
  const secondSamples = [];
  for (let repeat = 0; repeat < REPEATS; repeat += 1) {
    const order =
      repeat % 2 === 0
        ? [
            [first, firstSamples],
            [second, secondSamples]
          ]
        : [
            [second, secondSamples],
            [first, firstSamples]
          ];

    for (const [definition, samples] of order) {
      samples.push(measureOne(definition.sample));
    }
  }

  const firstResult = summarize(
    first.label,
    first.operationCountPerInner,
    firstSamples
  );
  const secondResult = summarize(
    second.label,
    second.operationCountPerInner,
    secondSamples
  );

  return {
    results: [firstResult, secondResult],
    comparison: {
      baselineLabel: first.label,
      comparisonLabel: second.label,
      comparisonToBaselineMedianRatio:
        secondResult.medianMs / firstResult.medianMs
    }
  };
}

const points = gridPoints();

const inverseRadialScalar = () => {
  for (const point of points) {
    calculateInverseRadialDistortionMapping({
      distortedImagePointMm: point,
      profile: radialProfile
    });
  }
};
const inverseRadialBatch = () => {
  calculateInverseRadialDistortionMappings({
    distortedImagePointsMm: points,
    profile: radialProfile
  });
};
const inverseCaScalar = () => {
  for (const point of points) {
    calculateInverseLateralChromaticAberrationMapping({
      distortedImagePointMm: point,
      profile: caProfile
    });
  }
};
const inverseCaBatch = () => {
  calculateInverseLateralChromaticAberrationMappings({
    distortedImagePointsMm: points,
    profile: caProfile
  });
};

const radialPair = measureAlternatingPair(
  {
    label: "inverse-radial-distortion-33x33",
    operationCountPerInner: points.length,
    sample: inverseRadialScalar
  },
  {
    label: "inverse-radial-distortion-batch-33x33",
    operationCountPerInner: points.length,
    sample: inverseRadialBatch
  }
);

const caPair = measureAlternatingPair(
  {
    label: "inverse-lateral-ca-33x33",
    operationCountPerInner: points.length,
    sample: inverseCaScalar
  },
  {
    label: "inverse-lateral-ca-batch-33x33",
    operationCountPerInner: points.length,
    sample: inverseCaBatch
  }
);

const results = [
  ...radialPair.results,
  ...caPair.results,
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

process.stdout.write(
  `${JSON.stringify(
    {
      benchmark: "image-formation-sampling",
      benchmarkVersion: 2,
      enginePackageVersion: packageJson.version,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      measurementPolicy: "informational-only-no-ci-threshold",
      warmupRepeats: WARMUP_REPEATS,
      repeats: REPEATS,
      innerRepeats: INNER_REPEATS,
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
      comparisons: [radialPair.comparison, caPair.comparison],
      results
    },
    null,
    2
  )}\n`
);
