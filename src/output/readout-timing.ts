// SPDX-License-Identifier: Apache-2.0

import {
  calculatedResult,
  type CalculationResult
} from "../core/calculation-result.js";
import {
  parseEvidenceList,
  type EvidenceProvenance
} from "../core/evidence-provenance.js";
import {
  InvalidScientificInputError,
  requirePositiveInteger
} from "../core/validation.js";
import type { NativeImageRaster } from "../sensor/sensor-geometry.js";
import {
  transformNativeRasterVectorToOriented,
  type CaptureOrientation,
  type RasterPoint,
  type RasterRect,
  type RasterVector
} from "./capture-geometry.js";

export type SensorReadoutMode = "rolling" | "global";

export type NativeSensorReadoutScanDirection =
  | "top-to-bottom"
  | "bottom-to-top"
  | "left-to-right"
  | "right-to-left";

export type CaptureShutterMechanism =
  | "mechanical"
  | "electronic-first-curtain"
  | "electronic";

export interface CalculateSensorReadoutTimingInput {
  nativeRaster: NativeImageRaster;
  activeCaptureRect?: RasterRect;
  orientation: CaptureOrientation;
  readoutMode: SensorReadoutMode;
  scanDirectionNative?: NativeSensorReadoutScanDirection;
  captureReadoutDurationSeconds: number;
  shutterMechanism: CaptureShutterMechanism;
  exposureStartSeconds?: number;
  exposureDurationSeconds: number;
  readoutEvidence: readonly EvidenceProvenance[];
  samplePointsNative?: readonly RasterPoint[];
}

export interface SensorReadoutTimingSample {
  pointNative: RasterPoint;
  normalizedScanPosition: number | null;
  exposureStartOffsetSeconds: number;
  exposureStartSeconds: number;
  exposureEndSeconds: number;
}

export interface SensorReadoutTiming {
  readoutMode: SensorReadoutMode;
  shutterMechanism: CaptureShutterMechanism;
  nativeRaster: NativeImageRaster;
  activeCaptureRect: RasterRect;
  orientation: CaptureOrientation;
  captureReadoutDurationSeconds: number;
  exposureDurationSeconds: number;
  maximumExposureStartOffsetSeconds: number;
  scan:
    | {
        directionNative: NativeSensorReadoutScanDirection;
        unitVectorNative: RasterVector;
        unitVectorOriented: RasterVector;
      }
    | null;
  samples: readonly SensorReadoutTimingSample[];
  readoutEvidence: readonly EvidenceProvenance[];
}

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
const ORIENTATIONS = new Set<CaptureOrientation>([
  "landscape",
  "portrait-clockwise",
  "landscape-inverted",
  "portrait-counter-clockwise"
]);

function requireFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new InvalidScientificInputError(`${name} must be finite.`);
  }
}

function requireNonNegativeFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new InvalidScientificInputError(
      `${name} must be a finite number greater than or equal to zero.`
    );
  }
}

function requirePositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new InvalidScientificInputError(
      `${name} must be a finite number greater than zero.`
    );
  }
}

function requireNonNegativeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new InvalidScientificInputError(
      `${name} must be a non-negative safe integer.`
    );
  }
}

function fullRect(raster: NativeImageRaster): RasterRect {
  return {
    x: 0,
    y: 0,
    width: raster.pixelWidth,
    height: raster.pixelHeight
  };
}

function validateNativeRaster(raster: NativeImageRaster): void {
  requirePositiveInteger("nativeRaster.pixelWidth", raster.pixelWidth);
  requirePositiveInteger("nativeRaster.pixelHeight", raster.pixelHeight);
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

function validateOrientation(
  orientation: unknown
): asserts orientation is CaptureOrientation {
  if (
    typeof orientation !== "string" ||
    !ORIENTATIONS.has(orientation as CaptureOrientation)
  ) {
    throw new InvalidScientificInputError("orientation is invalid.");
  }
}

function validateReadoutMode(
  readoutMode: unknown
): asserts readoutMode is SensorReadoutMode {
  if (
    typeof readoutMode !== "string" ||
    !READOUT_MODES.has(readoutMode as SensorReadoutMode)
  ) {
    throw new InvalidScientificInputError("readoutMode is invalid.");
  }
}

function validateShutterMechanism(
  shutterMechanism: unknown
): asserts shutterMechanism is CaptureShutterMechanism {
  if (
    typeof shutterMechanism !== "string" ||
    !SHUTTER_MECHANISMS.has(
      shutterMechanism as CaptureShutterMechanism
    )
  ) {
    throw new InvalidScientificInputError(
      "shutterMechanism is invalid."
    );
  }
}

function scanVector(
  direction: NativeSensorReadoutScanDirection
): RasterVector {
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

function validatePointWithinActiveCapture(
  point: RasterPoint,
  rect: RasterRect,
  index: number
): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new InvalidScientificInputError(
      `samplePointsNative[${index}] coordinates must be finite.`
    );
  }

  if (
    point.x < rect.x ||
    point.x > rect.x + rect.width ||
    point.y < rect.y ||
    point.y > rect.y + rect.height
  ) {
    throw new InvalidScientificInputError(
      `samplePointsNative[${index}] must lie within activeCaptureRect edge-coordinate bounds.`
    );
  }
}

function normalizedRollingScanPosition(
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
 * Resolves a capture-specific sensor readout/exposure-start timing schedule.
 *
 * Rolling readout uses a linear scan-time interpolation across the declared
 * active capture in native sensor coordinates. Global readout gives every
 * location the same exposure start even when the caller supplies a non-zero
 * transfer/readout duration.
 *
 * This foundation calculates timing only. It does not warp image geometry,
 * integrate scene/camera motion, model shutter-curtain travel, or infer a
 * readout duration from sensor size, active crop, output resolution, or camera
 * identity.
 */
export function calculateSensorReadoutTiming(
  input: CalculateSensorReadoutTimingInput
): CalculationResult<SensorReadoutTiming> {
  validateNativeRaster(input.nativeRaster);
  validateOrientation(input.orientation);
  validateReadoutMode(input.readoutMode);
  validateShutterMechanism(input.shutterMechanism);
  requireNonNegativeFinite(
    "captureReadoutDurationSeconds",
    input.captureReadoutDurationSeconds
  );
  requirePositiveFinite(
    "exposureDurationSeconds",
    input.exposureDurationSeconds
  );

  const exposureStartSeconds = input.exposureStartSeconds ?? 0;
  requireFinite("exposureStartSeconds", exposureStartSeconds);

  const activeCaptureRect =
    input.activeCaptureRect ?? fullRect(input.nativeRaster);
  validateActiveCaptureRect(activeCaptureRect, input.nativeRaster);

  const evidence = parseEvidenceList(
    input.readoutEvidence,
    "readoutEvidence"
  );

  let scan: SensorReadoutTiming["scan"] = null;
  if (input.readoutMode === "rolling") {
    if (
      typeof input.scanDirectionNative !== "string" ||
      !SCAN_DIRECTIONS.has(input.scanDirectionNative)
    ) {
      throw new InvalidScientificInputError(
        "scanDirectionNative is required and must be valid for rolling readout."
      );
    }
    requirePositiveFinite(
      "captureReadoutDurationSeconds",
      input.captureReadoutDurationSeconds
    );
    const unitVectorNative = scanVector(input.scanDirectionNative);
    scan = {
      directionNative: input.scanDirectionNative,
      unitVectorNative,
      unitVectorOriented: transformNativeRasterVectorToOriented({
        vector: unitVectorNative,
        orientation: input.orientation
      })
    };
  } else if (input.scanDirectionNative !== undefined) {
    throw new InvalidScientificInputError(
      "scanDirectionNative must be omitted for global readout."
    );
  }

  if (
    input.samplePointsNative !== undefined &&
    !Array.isArray(input.samplePointsNative)
  ) {
    throw new InvalidScientificInputError(
      "samplePointsNative must be an array when supplied."
    );
  }

  const samples = (input.samplePointsNative ?? []).map((point, index) => {
    validatePointWithinActiveCapture(point, activeCaptureRect, index);

    const normalizedScanPosition =
      scan === null
        ? null
        : normalizedRollingScanPosition(
            point,
            activeCaptureRect,
            scan.directionNative
          );
    const exposureStartOffsetSeconds =
      normalizedScanPosition === null
        ? 0
        : input.captureReadoutDurationSeconds * normalizedScanPosition;
    const sampleExposureStartSeconds =
      exposureStartSeconds + exposureStartOffsetSeconds;

    return {
      pointNative: { x: point.x, y: point.y },
      normalizedScanPosition,
      exposureStartOffsetSeconds,
      exposureStartSeconds: sampleExposureStartSeconds,
      exposureEndSeconds:
        sampleExposureStartSeconds + input.exposureDurationSeconds
    };
  });

  return calculatedResult(
    {
      readoutMode: input.readoutMode,
      shutterMechanism: input.shutterMechanism,
      nativeRaster: { ...input.nativeRaster },
      activeCaptureRect: { ...activeCaptureRect },
      orientation: input.orientation,
      captureReadoutDurationSeconds:
        input.captureReadoutDurationSeconds,
      exposureDurationSeconds: input.exposureDurationSeconds,
      maximumExposureStartOffsetSeconds:
        input.readoutMode === "rolling"
          ? input.captureReadoutDurationSeconds
          : 0,
      scan,
      samples,
      readoutEvidence: evidence
    },
    "capture-specific-sensor-readout-timing",
    "1.0.0",
    [
      "Physical time is measured in seconds from the caller-declared exposure start.",
      "Exposure integration duration and sensor readout duration are independent inputs.",
      "Rolling readout exposure-start time varies linearly across the selected active capture in native sensor coordinates.",
      "Global readout has simultaneous exposure start across the active capture; a non-zero transfer/readout duration does not create line-by-line exposure-start skew.",
      "Physical camera orientation rotates the reported scan direction but does not redefine native sensor coordinates.",
      "Shutter mechanism is represented independently and does not modify sensor readout timing in this foundation.",
      "Readout duration is caller-declared for the selected capture mode and is never inferred from output resolution or generic sensor metadata.",
      "This timing foundation does not yet calculate rolling-shutter image distortion, shutter-curtain travel, flash/flicker interaction, or camera/subject motion integration."
    ]
  );
}
