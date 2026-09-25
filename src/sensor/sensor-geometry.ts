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

const REFERENCE_35MM_WIDTH_MM = 36;
const REFERENCE_35MM_HEIGHT_MM = 24;
const REFERENCE_35MM_DIAGONAL_MM = Math.hypot(
  REFERENCE_35MM_WIDTH_MM,
  REFERENCE_35MM_HEIGHT_MM
);

/**
 * Physical photosensitive imaging area used for image formation.
 *
 * This is deliberately not a sensor package/die dimension.
 */
export interface SensorImagingArea {
  /** Physical active imaging width in millimetres. */
  widthMm: number;
  /** Physical active imaging height in millimetres. */
  heightMm: number;
}

/**
 * Native effective image-sampling raster associated with an imaging area.
 *
 * The raster describes effective image samples. It does not imply that each
 * sample corresponds one-to-one with a physical photodiode/photosite.
 */
export interface NativeImageRaster {
  /** Native horizontal image-sample count. */
  pixelWidth: number;
  /** Native vertical image-sample count. */
  pixelHeight: number;
}

export interface CalculateSensorGeometryMetricsInput {
  imagingArea: SensorImagingArea;
  nativeRaster: NativeImageRaster;
}

export interface SensorGeometryMetrics {
  imagingArea: {
    /** Physical imaging-area diagonal in millimetres. */
    diagonalMm: number;
    /** Physical width divided by physical height. */
    aspectRatio: number;
    /**
     * Diagonal crop factor relative to a 36 × 24 mm reference frame.
     *
     * This is a physical imaging-area quantity and does not include later
     * digital/output cropping.
     */
    cropFactor35Mm: number;
  };
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
     * Horizontal geometric sampling pitch in micrometres.
     *
     * This is image-sample spacing, not physical photodiode active area.
     */
    pitchXMicrometers: number;
    /**
     * Vertical geometric sampling pitch in micrometres.
     *
     * This is image-sample spacing, not physical photodiode active area.
     */
    pitchYMicrometers: number;
    /** Horizontal sampling pitch divided by vertical sampling pitch. */
    pitchAspectRatio: number;
  };
}

/**
 * Calculates physical imaging-area, native-raster, and geometric sampling
 * metrics without coupling sensor size to resolution.
 *
 * The supplied raster is assumed to span the supplied imaging area. Derived
 * sampling pitch is geometric sample spacing only and must not be interpreted
 * as photosite fill factor or photon-collection area.
 *
 * @param input Physical imaging area and native effective image raster.
 * @returns Derived imaging-area, raster, and sampling metrics.
 */
export function calculateSensorGeometryMetrics(
  input: CalculateSensorGeometryMetricsInput
): CalculationResult<SensorGeometryMetrics> {
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

  const diagonalMm = Math.hypot(
    input.imagingArea.widthMm,
    input.imagingArea.heightMm
  );
  const pitchXMicrometers =
    (input.imagingArea.widthMm / input.nativeRaster.pixelWidth) * 1000;
  const pitchYMicrometers =
    (input.imagingArea.heightMm / input.nativeRaster.pixelHeight) * 1000;

  return calculatedResult(
    {
      imagingArea: {
        diagonalMm,
        aspectRatio: input.imagingArea.widthMm / input.imagingArea.heightMm,
        cropFactor35Mm: REFERENCE_35MM_DIAGONAL_MM / diagonalMm
      },
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
