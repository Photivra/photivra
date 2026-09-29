// SPDX-License-Identifier: Apache-2.0

import { approximationResult, type CalculationResult } from "../core/calculation-result.js";
import {
  parseEvidenceList,
  type EvidenceBackedFact
} from "../core/evidence-provenance.js";
import { InvalidScientificInputError, requirePositiveInteger } from "../core/validation.js";
import type { RasterPoint, RasterRect } from "../output/capture-geometry.js";
import type { NativeImageRaster } from "./sensor-geometry.js";
import type { SensorReadoutArchitecture } from "./architecture.js";

/**
 * Readout architecture selected for one capture.
 *
 * This reuses the architecture vocabulary but is not a hardware-capability
 * assertion. SensorArchitectureProfile.readoutCapabilities remains descriptive
 * metadata and is not consulted automatically.
 */
export type SensorReadoutMode = SensorReadoutArchitecture;

export type NativeSensorReadoutScanDirection =
  | "top-to-bottom"
  | "bottom-to-top"
  | "left-to-right"
  | "right-to-left";

export type CaptureShutterMechanism =
  | "mechanical"
  | "electronic-first-curtain"
  | "electronic";

/**
 * Evidence-backed timing value with an explicit seconds unit.
 */
export interface SourcedSensorTimingSeconds
  extends EvidenceBackedFact<number> {
  unit: "s";
}

export type SourcedSensorReadoutFact<T> = EvidenceBackedFact<T>;

export interface GlobalSensorReadoutTimingDeclaration {
  readoutMode: "global";
  /**
   * Capture-specific sensor data-readout duration.
   *
   * This is deliberately not interpreted as spatial exposure/readout skew.
   */
  captureReadoutDurationSeconds: SourcedSensorTimingSeconds;
  scanDirectionNative?: never;
  spatialSamplingSkewSeconds?: never;
}

export interface RollingSensorReadoutTimingDeclaration {
  readoutMode: "rolling";
  /**
   * Capture-specific sensor data-readout duration.
   *
   * This fact is retained independently from spatial sampling skew because
   * published/declared readout duration and the spatial timing span need not be
   * treated as the same quantity.
   */
  captureReadoutDurationSeconds: SourcedSensorTimingSeconds;
  /**
   * Native-sensor scan direction for the selected capture mode.
   */
  scanDirectionNative: SourcedSensorReadoutFact<NativeSensorReadoutScanDirection>;
  /**
   * Time difference between the first and last spatial scan positions in the
   * uniform-linear timing approximation.
   */
  spatialSamplingSkewSeconds: SourcedSensorTimingSeconds;
}

export type SensorReadoutTimingDeclaration =
  | GlobalSensorReadoutTimingDeclaration
  | RollingSensorReadoutTimingDeclaration;

export interface CalculateSensorReadoutTimingInput {
  nativeRaster: NativeImageRaster;
  /**
   * Active capture rectangle in invariant native raster coordinates.
   *
   * Defaults to the complete native raster. Timing is never inferred by
   * scaling a full-frame value to this rectangle.
   */
  activeCaptureRect?: RasterRect;
  /**
   * Selected shutter mechanism for the capture.
   *
   * It is reported independently and does not modify the sensor timing
   * schedule in this foundation.
   */
  shutterMechanism: CaptureShutterMechanism;
  readout: SensorReadoutTimingDeclaration;
  /**
   * Optional continuous native raster edge-coordinate points for timing
   * diagnostics. Pixel centers may be represented with +0.5 offsets.
   */
  samplePointsNative?: readonly RasterPoint[];
}

export interface SensorReadoutTimingSample {
  pointNative: RasterPoint;
  normalizedScanPosition: number | null;
  /**
   * Relative native-sensor readout phase in seconds.
   *
   * Zero is the first spatial scan position. This is not automatically an
   * exposure-start time or shutter-curtain time.
   */
  readoutPhaseOffsetSeconds: number;
}

export interface SensorReadoutTiming {
  readoutMode: SensorReadoutMode;
  shutterMechanism: CaptureShutterMechanism;
  nativeRaster: NativeImageRaster;
  activeCaptureRect: RasterRect;
  captureReadoutDurationSeconds: SourcedSensorTimingSeconds;
  maximumSpatialSamplingSkewSeconds: number;
  scan:
    | {
        pattern: "uniform-linear-single-axis";
        directionNative: SourcedSensorReadoutFact<NativeSensorReadoutScanDirection>;
        unitVectorNative: { x: number; y: number };
        spatialSamplingSkewSeconds: SourcedSensorTimingSeconds;
      }
    | null;
  samples: readonly SensorReadoutTimingSample[];
}

type UnknownRecord = Record<string, unknown>;

const READOUT_MODES = new Set<SensorReadoutMode>(["rolling", "global"]);
const SCAN_DIRECTIONS = new Set<NativeSensorReadoutScanDirection>([
  "top-to-bottom",
  "bottom-to-top",
  "left-to-right",
  "right-to-left"
]);
const SHUTTER_MECHANISMS = new Set<CaptureShutterMechanism>([
  "mechanical",
  "electronic-first-curtain",
  "electronic"
]);

function requireRecord(value: unknown, path: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidScientificInputError(path + " must be an object.");
  }
  return value as UnknownRecord;
}

function requireNonNegativeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new InvalidScientificInputError(
      name + " must be a non-negative safe integer."
    );
  }
}

function requireNonNegativeFinite(name: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new InvalidScientificInputError(
      name + " must be a finite number greater than or equal to zero."
    );
  }
  return value;
}

function requirePositiveFinite(name: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new InvalidScientificInputError(
      name + " must be a finite number greater than zero."
    );
  }
  return value;
}

function parseSecondsFact(
  value: unknown,
  path: string,
  positive: boolean
): SourcedSensorTimingSeconds {
  const record = requireRecord(value, path);
  if (record.unit !== "s") {
    throw new InvalidScientificInputError(path + '.unit must be "s".');
  }

  const seconds = positive
    ? requirePositiveFinite(path + ".value", record.value)
    : requireNonNegativeFinite(path + ".value", record.value);

  return {
    value: seconds,
    unit: "s",
    evidence: parseEvidenceList(record.evidence, path + ".evidence")
  };
}

function parseDirectionFact(
  value: unknown,
  path: string
): SourcedSensorReadoutFact<NativeSensorReadoutScanDirection> {
  const record = requireRecord(value, path);
  if (
    typeof record.value !== "string" ||
    !SCAN_DIRECTIONS.has(
      record.value as NativeSensorReadoutScanDirection
    )
  ) {
    throw new InvalidScientificInputError(path + ".value is invalid.");
  }

  return {
    value: record.value as NativeSensorReadoutScanDirection,
    evidence: parseEvidenceList(record.evidence, path + ".evidence")
  };
}

function parseReadoutDeclaration(
  value: unknown
): SensorReadoutTimingDeclaration {
  const record = requireRecord(value, "readout");
  if (
    typeof record.readoutMode !== "string" ||
    !READOUT_MODES.has(record.readoutMode as SensorReadoutMode)
  ) {
    throw new InvalidScientificInputError("readout.readoutMode is invalid.");
  }

  const captureReadoutDurationSeconds = parseSecondsFact(
    record.captureReadoutDurationSeconds,
    "readout.captureReadoutDurationSeconds",
    false
  );

  if (record.readoutMode === "global") {
    if (record.scanDirectionNative !== undefined) {
      throw new InvalidScientificInputError(
        "readout.scanDirectionNative must be omitted for global readout."
      );
    }
    if (record.spatialSamplingSkewSeconds !== undefined) {
      throw new InvalidScientificInputError(
        "readout.spatialSamplingSkewSeconds must be omitted for global readout."
      );
    }

    return {
      readoutMode: "global",
      captureReadoutDurationSeconds
    };
  }

  return {
    readoutMode: "rolling",
    captureReadoutDurationSeconds,
    scanDirectionNative: parseDirectionFact(
      record.scanDirectionNative,
      "readout.scanDirectionNative"
    ),
    spatialSamplingSkewSeconds: parseSecondsFact(
      record.spatialSamplingSkewSeconds,
      "readout.spatialSamplingSkewSeconds",
      true
    )
  };
}

function validateNativeRaster(raster: NativeImageRaster): void {
  requirePositiveInteger("nativeRaster.pixelWidth", raster.pixelWidth);
  requirePositiveInteger("nativeRaster.pixelHeight", raster.pixelHeight);
}

function fullRect(raster: NativeImageRaster): RasterRect {
  return {
    x: 0,
    y: 0,
    width: raster.pixelWidth,
    height: raster.pixelHeight
  };
}

function validateActiveCaptureRect(
  rect: RasterRect,
  raster: NativeImageRaster
): void {
  requireNonNegativeInteger("activeCaptureRect.x", rect.x);
  requireNonNegativeInteger("activeCaptureRect.y", rect.y);
  requirePositiveInteger("activeCaptureRect.width", rect.width);
  requirePositiveInteger("activeCaptureRect.height", rect.height);

  if (
    rect.x + rect.width > raster.pixelWidth ||
    rect.y + rect.height > raster.pixelHeight
  ) {
    throw new InvalidScientificInputError(
      "activeCaptureRect must fit entirely within nativeRaster."
    );
  }
}

function validateShutterMechanism(
  value: unknown
): asserts value is CaptureShutterMechanism {
  if (
    typeof value !== "string" ||
    !SHUTTER_MECHANISMS.has(value as CaptureShutterMechanism)
  ) {
    throw new InvalidScientificInputError("shutterMechanism is invalid.");
  }
}

function validatePointWithinActiveCapture(
  point: RasterPoint,
  rect: RasterRect,
  index: number
): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new InvalidScientificInputError(
      "samplePointsNative[" + index + "] coordinates must be finite."
    );
  }

  if (
    point.x < rect.x ||
    point.x > rect.x + rect.width ||
    point.y < rect.y ||
    point.y > rect.y + rect.height
  ) {
    throw new InvalidScientificInputError(
      "samplePointsNative[" +
        index +
        "] must lie within activeCaptureRect edge-coordinate bounds."
    );
  }
}

function scanVector(
  direction: NativeSensorReadoutScanDirection
): { x: number; y: number } {
  switch (direction) {
    case "top-to-bottom":
      return { x: 0, y: 1 };
    case "bottom-to-top":
      return { x: 0, y: -1 };
    case "left-to-right":
      return { x: 1, y: 0 };
    case "right-to-left":
      return { x: -1, y: 0 };
  }
}

function normalizedScanPosition(
  point: RasterPoint,
  rect: RasterRect,
  direction: NativeSensorReadoutScanDirection
): number {
  switch (direction) {
    case "top-to-bottom":
      return (point.y - rect.y) / rect.height;
    case "bottom-to-top":
      return 1 - (point.y - rect.y) / rect.height;
    case "left-to-right":
      return (point.x - rect.x) / rect.width;
    case "right-to-left":
      return 1 - (point.x - rect.x) / rect.width;
  }
}

/**
 * Resolves a capture-specific native sensor readout scan schedule.
 *
 * Rolling readout uses a uniform-linear single-axis approximation across the
 * declared active capture. The caller supplies the spatial timing span
 * explicitly; it is never inferred from total data-readout duration, active
 * crop dimensions, native raster density, output resolution, sensor
 * architecture metadata, or shutter mechanism.
 *
 * Global readout has no spatial phase skew in this model even when a non-zero
 * data-readout duration is declared.
 *
 * This foundation does not define local exposure start/end times, mechanical
 * curtain travel, EFCS curtain behavior, rolling-shutter image distortion,
 * flash/flicker interactions, or motion integration.
 */
export function calculateSensorReadoutTiming(
  input: CalculateSensorReadoutTimingInput
): CalculationResult<SensorReadoutTiming> {
  validateNativeRaster(input.nativeRaster);
  validateShutterMechanism(input.shutterMechanism);

  const readout = parseReadoutDeclaration(input.readout);
  const activeCaptureRect =
    input.activeCaptureRect ?? fullRect(input.nativeRaster);
  validateActiveCaptureRect(activeCaptureRect, input.nativeRaster);

  if (
    input.samplePointsNative !== undefined &&
    !Array.isArray(input.samplePointsNative)
  ) {
    throw new InvalidScientificInputError(
      "samplePointsNative must be an array when supplied."
    );
  }

  const scan =
    readout.readoutMode === "rolling"
      ? {
          pattern: "uniform-linear-single-axis" as const,
          directionNative: readout.scanDirectionNative,
          unitVectorNative: scanVector(readout.scanDirectionNative.value),
          spatialSamplingSkewSeconds: readout.spatialSamplingSkewSeconds
        }
      : null;

  const samples = (input.samplePointsNative ?? []).map((point, index) => {
    validatePointWithinActiveCapture(point, activeCaptureRect, index);

    if (scan === null) {
      return {
        pointNative: { x: point.x, y: point.y },
        normalizedScanPosition: null,
        readoutPhaseOffsetSeconds: 0
      };
    }

    const normalized = normalizedScanPosition(
      point,
      activeCaptureRect,
      scan.directionNative.value
    );

    return {
      pointNative: { x: point.x, y: point.y },
      normalizedScanPosition: normalized,
      readoutPhaseOffsetSeconds:
        normalized * scan.spatialSamplingSkewSeconds.value
    };
  });

  return approximationResult(
    {
      readoutMode: readout.readoutMode,
      shutterMechanism: input.shutterMechanism,
      nativeRaster: { ...input.nativeRaster },
      activeCaptureRect: { ...activeCaptureRect },
      captureReadoutDurationSeconds:
        readout.captureReadoutDurationSeconds,
      maximumSpatialSamplingSkewSeconds:
        readout.readoutMode === "rolling"
          ? readout.spatialSamplingSkewSeconds.value
          : 0,
      scan,
      samples
    },
    "native-sensor-readout-scan-timing",
    "1.0.0",
    [
      "Native raster coordinates use top-left origin, +X right and +Y down and remain invariant under physical camera orientation.",
      "Rolling timing uses a uniform-linear single-axis approximation over continuous effective native-raster coordinates.",
      "NativeImageRaster is an effective image-sampling grid; the timing map does not assert one raster row or column equals one physical photodiode or hardware readout line.",
      "Capture data-readout duration and spatial sampling skew are independently declared facts; no equality or ordering relationship is inferred between them.",
      "Global readout has zero spatial sampling skew in this model even when capture data-readout duration is non-zero.",
      "Active-capture timing is caller-declared and is not inferred by scaling full-frame timing by crop dimensions.",
      "Physical orientation and digital output crop/resolution are downstream of this invariant native timing schedule.",
      "Shutter mechanism is reported independently and does not alter the sensor scan schedule in this foundation.",
      "The model does not represent segmented, center-out, interleaved, multi-tap or other non-uniform readout patterns.",
      "The model does not define exposure windows, shutter-curtain travel, rolling-shutter geometry distortion, flash/flicker interaction or camera/subject motion integration."
    ]
  );
}
