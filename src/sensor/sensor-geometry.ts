// SPDX-License-Identifier: Apache-2.0

/**
 * Sensor geometry: physical size of the imaging area (diagonal, aspect ratio, 35 mm crop factor) and
 * the native pixel grid (megapixels, pixel pitch).
 *
 * Sensor size and resolution are kept independent. Crop factor is the ratio of diagonals to a
 * 36 × 24 mm frame, and does not include any digital or output crop. Pixel pitch here is only the
 * spacing between samples; it is not the photosite's fill factor or light-collecting area.
 * @see docs/MOTION_AND_SIGNAL.md for equations, coordinate/unit conventions, blockers and support
 * limits.
 */

import {
  calculatedResult,
  type CalculationResult
} from "../core/calculation-result.js";
import {
  InvalidScientificInputError,
  requirePositiveFinite,
  requirePositiveInteger
} from "../core/validation.js";
import { portableHypot } from "../core/portable-math.js";
import { requireInputObject } from "../core/record-validation.js";

const REFERENCE_35MM_WIDTH_MM = 36;
const REFERENCE_35MM_HEIGHT_MM = 24;
/** 36² + 24² mm²: the squared diagonal of the 35 mm reference frame (exact as a double). */
const REFERENCE_35MM_DIAGONAL_SQUARED_MM2 =
  REFERENCE_35MM_WIDTH_MM * REFERENCE_35MM_WIDTH_MM +
  REFERENCE_35MM_HEIGHT_MM * REFERENCE_35MM_HEIGHT_MM;

/**
 * Diagonal 35 mm crop factor, √(1872 / (w² + h²)). It uses only correctly rounded operations, so the
 * stored value is bit-identical in every JavaScript engine (see core/portable-math.ts).
 */
function diagonalCropFactor35Mm(widthMm: number, heightMm: number, diagonalMm: number): number {
  const diagonalSquaredMm2 = widthMm * widthMm + heightMm * heightMm;
  return Number.isFinite(diagonalSquaredMm2) && diagonalSquaredMm2 > 0
    ? Math.sqrt(REFERENCE_35MM_DIAGONAL_SQUARED_MM2 / diagonalSquaredMm2)
    : Math.sqrt(REFERENCE_35MM_DIAGONAL_SQUARED_MM2) / diagonalMm;
}

/**
 * The physical light-sensitive imaging area used for image formation.
 *
 * It is deliberately not the size of the sensor package or die.
 */
export interface SensorImagingArea {
  /** Physical active imaging width in millimetres. */
  widthMm: number;
  /** Physical active imaging height in millimetres. */
  heightMm: number;
}

/**
 * Width and height of an image grid in pixels.
 *
 * Pixels here are image samples. That does not mean each sample matches one
 * physical photodiode (photosite).
 */
export interface RasterDimensions {
  /** Horizontal image-sample/pixel count. */
  pixelWidth: number;
  /** Vertical image-sample/pixel count. */
  pixelHeight: number;
}

/**
 * The native pixel grid of an imaging area.
 *
 * This alias names the role. For other grids, such as active or output
 * images, use RasterDimensions.
 */
export type NativeImageRaster = RasterDimensions;

export interface ImagingAreaMetrics {
  /** Physical imaging-area diagonal in millimetres. */
  diagonalMm: number;
  /** Physical width divided by physical height. */
  aspectRatio: number;
  /**
   * Diagonal crop factor relative to a 36 × 24 mm reference frame.
   *
   * It describes the physical imaging area only, and does not include any
   * later digital or output crop.
   */
  cropFactor35Mm: number;
}

export interface CalculateSensorGeometryMetricsInput {
  imagingArea: SensorImagingArea;
  nativeRaster: NativeImageRaster;
}

export interface SensorGeometryMetrics {
  imagingArea: ImagingAreaMetrics;
  nativeRaster: {
    /** Exact product of native raster width and height. */
    totalImageSamples: number;
    /** Derived megapixels from the exact native raster. */
    megapixels: number;
    /** Native raster width divided by native raster height. */
    aspectRatio: number;
  };
  sampling: {
    /**
     * Horizontal sample spacing (pitch) in micrometres.
     *
     * This is the spacing between image samples, not the photodiode's active area.
     */
    pitchXMicrometers: number;
    /**
     * Vertical sample spacing (pitch) in micrometres.
     *
     * This is the spacing between image samples, not the photodiode's active area.
     */
    pitchYMicrometers: number;
    /** Horizontal sampling pitch divided by vertical sampling pitch. */
    pitchAspectRatio: number;
  };
}

/**
 * Calculates metrics of the physical imaging area, independent of pixel count.
 *
 * Crop factor is the ratio of diagonals to a 36 × 24 mm reference frame. It
 * does not include any digital or output crop.
 *
 * @param imagingArea Physical photosensitive imaging area.
 * @returns Physical diagonal, aspect ratio, and diagonal 35 mm crop factor.
 */
export function calculateImagingAreaMetrics(
  imagingArea: SensorImagingArea
): CalculationResult<ImagingAreaMetrics> {
  requireInputObject(imagingArea, "calculateImagingAreaMetrics input");
  requirePositiveFinite("imagingArea.widthMm", imagingArea.widthMm);
  requirePositiveFinite("imagingArea.heightMm", imagingArea.heightMm);

  const diagonalMm = portableHypot(imagingArea.widthMm, imagingArea.heightMm);

  return calculatedResult(
    {
      diagonalMm,
      aspectRatio: imagingArea.widthMm / imagingArea.heightMm,
      cropFactor35Mm: diagonalCropFactor35Mm(imagingArea.widthMm, imagingArea.heightMm, diagonalMm)
    },
    "sensor-imaging-area",
    "1.0.0",
    [
      "35 mm reference frame is 36 × 24 mm and crop factor is diagonal-based.",
      "Digital/output cropping is excluded from physical imaging-area crop factor."
    ]
  );
}

/**
 * Calculates metrics of the physical imaging area, the native pixel grid and
 * the sample spacing, keeping sensor size and resolution independent.
 *
 * The grid is assumed to cover the whole imaging area. The derived pitch is
 * only the spacing between samples. Do not read it as the photosite's fill
 * factor or light-collecting area.
 *
 * @param input Physical imaging area and native effective image raster.
 * @returns Derived imaging-area, raster, and sampling metrics.
 */
export function calculateSensorGeometryMetrics(
  input: CalculateSensorGeometryMetricsInput
): CalculationResult<SensorGeometryMetrics> {
  requireInputObject(input, "calculateSensorGeometryMetrics input");
  requireInputObject(input.imagingArea, "imagingArea");
  requirePositiveFinite("imagingArea.widthMm", input.imagingArea.widthMm);
  requirePositiveFinite("imagingArea.heightMm", input.imagingArea.heightMm);
  requirePositiveInteger(
    "nativeRaster.pixelWidth",
    input.nativeRaster.pixelWidth
  );
  requirePositiveInteger(
    "nativeRaster.pixelHeight",
    input.nativeRaster.pixelHeight
  );

  const totalImageSamples =
    input.nativeRaster.pixelWidth * input.nativeRaster.pixelHeight;
  if (!Number.isSafeInteger(totalImageSamples)) {
    throw new InvalidScientificInputError(
      "nativeRaster total image-sample count must be a positive safe integer."
    );
  }

  const imagingAreaMetrics = calculateImagingAreaMetrics(
    input.imagingArea
  ).value;
  const pitchXMicrometers =
    (input.imagingArea.widthMm / input.nativeRaster.pixelWidth) * 1000;
  const pitchYMicrometers =
    (input.imagingArea.heightMm / input.nativeRaster.pixelHeight) * 1000;

  return calculatedResult(
    {
      imagingArea: imagingAreaMetrics,
      nativeRaster: {
        totalImageSamples,
        megapixels: totalImageSamples / 1_000_000,
        aspectRatio:
          input.nativeRaster.pixelWidth / input.nativeRaster.pixelHeight
      },
      sampling: {
        pitchXMicrometers,
        pitchYMicrometers,
        pitchAspectRatio: pitchXMicrometers / pitchYMicrometers
      }
    },
    "sensor-imaging-area-native-raster",
    "1.0.0",
    [
      "35 mm reference frame is 36 × 24 mm and crop factor is diagonal-based.",
      "The native effective image raster is assumed to span the supplied physical imaging area.",
      "Derived sampling pitch is geometric image-sample spacing, not physical photodiode active area or fill factor."
    ]
  );
}
