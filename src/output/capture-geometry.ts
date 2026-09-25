// SPDX-License-Identifier: Apache-2.0

import {
  calculatedResult,
  type CalculationResult
} from "../core/calculation-result.js";
import {
  InvalidScientificInputError,
  requirePositiveFinite,
  requirePositiveInteger
} from "../core/validation.js";
import {
  type NativeImageRaster,
  type SensorImagingArea
} from "../sensor/sensor-geometry.js";

export type CaptureOrientation =
  | "landscape"
  | "portrait-clockwise"
  | "landscape-inverted"
  | "portrait-counter-clockwise";

/**
 * Integer half-open rectangle in raster coordinates.
 *
 * Coordinates use a top-left origin with +X to the right and +Y downward.
 * The covered extent is [x, x + width) × [y, y + height).
 */
export interface RasterRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ResolveCaptureGeometryInput {
  imagingArea: SensorImagingArea;
  nativeRaster: NativeImageRaster;
  orientation: CaptureOrientation;
  /**
   * Active capture rectangle in native sensor raster coordinates.
   *
   * Defaults to the full native raster.
   */
  activeCaptureRect?: RasterRect;
  /**
   * Final digital/output crop in oriented active-capture raster coordinates.
   *
   * Defaults to the full oriented active capture.
   */
  outputCropRect?: RasterRect;
  /**
   * Final output raster after optional digital crop/resampling.
   *
   * Defaults to the output-crop dimensions.
   */
  outputRaster?: NativeImageRaster;
}

export interface ResolvedCaptureGeometry {
  native: {
    imagingArea: SensorImagingArea;
    raster: NativeImageRaster;
  };
  activeCapture: {
    nativeRect: RasterRect;
    imagingArea: SensorImagingArea;
    physicalOffsetMm: {
      x: number;
      y: number;
    };
    raster: NativeImageRaster;
  };
  orientedCapture: {
    orientation: CaptureOrientation;
    imagingArea: SensorImagingArea;
    raster: NativeImageRaster;
  };
  output: {
    /**
     * Digital/output crop expressed in oriented active-capture coordinates.
     *
     * This crop does not mutate physical sensor identity or active-capture
     * geometry.
     */
    cropRect: RasterRect;
    raster: NativeImageRaster;
    sourceRetainedAreaFraction: number;
  };
}

export interface CalculateActiveCaptureFieldOfViewInput {
  imagingArea: SensorImagingArea;
  nativeRaster: NativeImageRaster;
  orientation: CaptureOrientation;
  activeCaptureRect?: RasterRect;
  focalLengthMm: number;
  focusDistanceM?: number;
}

export interface ActiveCaptureFieldOfView {
  orientation: CaptureOrientation;
  horizontalDegrees: number;
  verticalDegrees: number;
  diagonalDegrees: number;
  activeImagingArea: SensorImagingArea;
}

function requireNonNegativeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new InvalidScientificInputError(
      `${name} must be a non-negative safe integer.`
    );
  }
}

function validateRasterRect(
  name: string,
  rect: RasterRect,
  bounds: NativeImageRaster
): void {
  requireNonNegativeInteger(`${name}.x`, rect.x);
  requireNonNegativeInteger(`${name}.y`, rect.y);
  requirePositiveInteger(`${name}.width`, rect.width);
  requirePositiveInteger(`${name}.height`, rect.height);

  if (
    rect.x + rect.width > bounds.pixelWidth ||
    rect.y + rect.height > bounds.pixelHeight
  ) {
    throw new InvalidScientificInputError(
      `${name} must fit entirely within its raster bounds.`
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

function orientRaster(
  raster: NativeImageRaster,
  orientation: CaptureOrientation
): NativeImageRaster {
  return orientation === "portrait-clockwise" ||
    orientation === "portrait-counter-clockwise"
    ? {
        pixelWidth: raster.pixelHeight,
        pixelHeight: raster.pixelWidth
      }
    : {
        pixelWidth: raster.pixelWidth,
        pixelHeight: raster.pixelHeight
      };
}

function orientImagingArea(
  imagingArea: SensorImagingArea,
  orientation: CaptureOrientation
): SensorImagingArea {
  return orientation === "portrait-clockwise" ||
    orientation === "portrait-counter-clockwise"
    ? {
        widthMm: imagingArea.heightMm,
        heightMm: imagingArea.widthMm
      }
    : {
        widthMm: imagingArea.widthMm,
        heightMm: imagingArea.heightMm
      };
}

/**
 * Resolves native sensor geometry, active capture, physical camera orientation,
 * and final digital/output geometry without conflating their identities.
 *
 * Native coordinates remain invariant when the camera rotates. Physical
 * orientation changes only the oriented capture view. Final output cropping and
 * resampling are digital operations and do not mutate the active sensor area.
 *
 * @param input Native sensor geometry plus capture/output geometry.
 * @returns Fully resolved capture geometry.
 */
export function resolveCaptureGeometry(
  input: ResolveCaptureGeometryInput
): CalculationResult<ResolvedCaptureGeometry> {
  requirePositiveFinite("imagingArea.widthMm", input.imagingArea.widthMm);
  requirePositiveFinite("imagingArea.heightMm", input.imagingArea.heightMm);
  requirePositiveInteger("nativeRaster.pixelWidth", input.nativeRaster.pixelWidth);
  requirePositiveInteger(
    "nativeRaster.pixelHeight",
    input.nativeRaster.pixelHeight
  );

  const activeCaptureRect = input.activeCaptureRect ?? fullRect(input.nativeRaster);
  validateRasterRect("activeCaptureRect", activeCaptureRect, input.nativeRaster);

  const millimetersPerNativePixelX =
    input.imagingArea.widthMm / input.nativeRaster.pixelWidth;
  const millimetersPerNativePixelY =
    input.imagingArea.heightMm / input.nativeRaster.pixelHeight;

  const activeImagingArea: SensorImagingArea = {
    widthMm: activeCaptureRect.width * millimetersPerNativePixelX,
    heightMm: activeCaptureRect.height * millimetersPerNativePixelY
  };
  const activeRaster: NativeImageRaster = {
    pixelWidth: activeCaptureRect.width,
    pixelHeight: activeCaptureRect.height
  };

  const orientedRaster = orientRaster(activeRaster, input.orientation);
  const orientedImagingArea = orientImagingArea(
    activeImagingArea,
    input.orientation
  );

  const outputCropRect = input.outputCropRect ?? fullRect(orientedRaster);
  validateRasterRect("outputCropRect", outputCropRect, orientedRaster);

  const outputRaster = input.outputRaster ?? {
    pixelWidth: outputCropRect.width,
    pixelHeight: outputCropRect.height
  };
  requirePositiveInteger("outputRaster.pixelWidth", outputRaster.pixelWidth);
  requirePositiveInteger("outputRaster.pixelHeight", outputRaster.pixelHeight);

  return calculatedResult(
    {
      native: {
        imagingArea: {
          widthMm: input.imagingArea.widthMm,
          heightMm: input.imagingArea.heightMm
        },
        raster: {
          pixelWidth: input.nativeRaster.pixelWidth,
          pixelHeight: input.nativeRaster.pixelHeight
        }
      },
      activeCapture: {
        nativeRect: { ...activeCaptureRect },
        imagingArea: activeImagingArea,
        physicalOffsetMm: {
          x: activeCaptureRect.x * millimetersPerNativePixelX,
          y: activeCaptureRect.y * millimetersPerNativePixelY
        },
        raster: activeRaster
      },
      orientedCapture: {
        orientation: input.orientation,
        imagingArea: orientedImagingArea,
        raster: orientedRaster
      },
      output: {
        cropRect: { ...outputCropRect },
        raster: {
          pixelWidth: outputRaster.pixelWidth,
          pixelHeight: outputRaster.pixelHeight
        },
        sourceRetainedAreaFraction:
          (outputCropRect.width * outputCropRect.height) /
          (orientedRaster.pixelWidth * orientedRaster.pixelHeight)
      }
    },
    "capture-geometry-pipeline",
    "1.0.0",
    [
      "Native sensor raster coordinates use a top-left origin with +X right and +Y down.",
      "Raster rectangles are integer half-open extents.",
      "Physical camera orientation does not rotate or redefine the native sensor coordinate system.",
      "Output crop/resampling is digital geometry and does not mutate physical sensor or active-capture identity."
    ]
  );
}

function calculateRectilinearFieldOfViewDegrees(
  sensorDimensionMm: number,
  focalLengthMm: number,
  focusDistanceM?: number
): number {
  let projectionDistanceMm = focalLengthMm;

  if (focusDistanceM !== undefined) {
    requirePositiveFinite("focusDistanceM", focusDistanceM);
    const objectDistanceMm = focusDistanceM * 1000;
    if (objectDistanceMm <= focalLengthMm) {
      throw new InvalidScientificInputError(
        "focusDistanceM must place the focus plane beyond the focal length."
      );
    }
    projectionDistanceMm =
      (focalLengthMm * objectDistanceMm) /
      (objectDistanceMm - focalLengthMm);
  }

  return (
    (2 * Math.atan(sensorDimensionMm / (2 * projectionDistanceMm)) * 180) /
    Math.PI
  );
}

/**
 * Calculates horizontal, vertical, and diagonal FOV for the active physical
 * capture area after applying physical camera orientation.
 *
 * Final digital/output crop is intentionally excluded.
 */
export function calculateActiveCaptureFieldOfView(
  input: CalculateActiveCaptureFieldOfViewInput
): CalculationResult<ActiveCaptureFieldOfView> {
  requirePositiveFinite("focalLengthMm", input.focalLengthMm);

  const geometry = resolveCaptureGeometry({
    imagingArea: input.imagingArea,
    nativeRaster: input.nativeRaster,
    orientation: input.orientation,
    ...(input.activeCaptureRect === undefined
      ? {}
      : { activeCaptureRect: input.activeCaptureRect })
  }).value;

  const { widthMm, heightMm } = geometry.orientedCapture.imagingArea;
  const diagonalMm = Math.hypot(widthMm, heightMm);

  return calculatedResult(
    {
      orientation: input.orientation,
      horizontalDegrees: calculateRectilinearFieldOfViewDegrees(
        widthMm,
        input.focalLengthMm,
        input.focusDistanceM
      ),
      verticalDegrees: calculateRectilinearFieldOfViewDegrees(
        heightMm,
        input.focalLengthMm,
        input.focusDistanceM
      ),
      diagonalDegrees: calculateRectilinearFieldOfViewDegrees(
        diagonalMm,
        input.focalLengthMm,
        input.focusDistanceM
      ),
      activeImagingArea: {
        widthMm,
        heightMm
      }
    },
    "oriented-active-capture-field-of-view",
    "1.0.0",
    [
      "Rectilinear projection is evaluated from the active physical capture area.",
      "Camera orientation swaps presentation axes without changing physical diagonal.",
      "Final digital/output crop is excluded from active-capture FOV."
    ]
  );
}
