// SPDX-License-Identifier: Apache-2.0

import {
  calculateFieldOfViewBounds
} from "../camera/field-of-view.js";
import {
  calculatedResult,
  type CalculationProvenance,
  type CalculationResult
} from "../core/calculation-result.js";
import {
  InvalidScientificInputError,
  requirePositiveFinite,
  requirePositiveInteger
} from "../core/validation.js";
import {
  type NativeImageRaster,
  type RasterDimensions,
  type SensorImagingArea
} from "../sensor/sensor-geometry.js";

export type CaptureOrientation =
  | "landscape"
  | "portrait-clockwise"
  | "landscape-inverted"
  | "portrait-counter-clockwise";

const CAPTURE_ORIENTATIONS = new Set<CaptureOrientation>([
  "landscape",
  "portrait-clockwise",
  "landscape-inverted",
  "portrait-counter-clockwise"
]);

const OUTPUT_ASPECT_RATIO_RELATIVE_TOLERANCE = 0.01;

export interface RasterPoint {
  x: number;
  y: number;
}

export interface RasterVector {
  x: number;
  y: number;
}

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

export interface PhysicalBoundsFromOpticalAxisMm {
  left: number;
  right: number;
  top: number;
  bottom: number;
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
   * Defaults to the output-crop dimensions. The output raster must preserve
   * the crop aspect ratio within a small integer-rounding tolerance.
   */
  outputRaster?: RasterDimensions;
}

export interface ResolvedCaptureGeometry {
  native: {
    imagingArea: SensorImagingArea;
    raster: NativeImageRaster;
  };
  activeCapture: {
    nativeRect: RasterRect;
    imagingArea: SensorImagingArea;
    /**
     * Top-left active-area offset from the native imaging-area top-left.
     */
    physicalOffsetMm: {
      x: number;
      y: number;
    };
    /** Active-area center relative to the native optical axis. */
    centerOffsetFromOpticalAxisMm: RasterVector;
    /** Native physical bounds relative to the optical axis. */
    physicalBoundsFromOpticalAxisMm: PhysicalBoundsFromOpticalAxisMm;
    /**
     * Current generic model assumes native image samples uniformly span the
     * declared physical imaging area.
     */
    imagingAreaDerivation: "uniform-native-raster";
    raster: RasterDimensions;
  };
  orientedCapture: {
    orientation: CaptureOrientation;
    imagingArea: SensorImagingArea;
    /** Oriented physical bounds relative to the optical axis. */
    physicalBoundsFromOpticalAxisMm: PhysicalBoundsFromOpticalAxisMm;
    raster: RasterDimensions;
  };
  output: {
    /**
     * Digital/output crop expressed in oriented active-capture coordinates.
     *
     * This crop does not mutate physical sensor identity or active-capture
     * geometry.
     */
    cropRect: RasterRect;
    raster: RasterDimensions;
    sourceRetainedAreaFraction: number;
  };
}

export interface TransformRasterPointInput {
  point: RasterPoint;
  nativeRaster: NativeImageRaster;
  orientation: CaptureOrientation;
}

export interface TransformRasterVectorInput {
  vector: RasterVector;
  orientation: CaptureOrientation;
}

export interface TransformRasterRectInput {
  rect: RasterRect;
  nativeRaster: NativeImageRaster;
  orientation: CaptureOrientation;
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
  /**
   * Larger of the two opposite-corner diagonal angular spans. For centered
   * crops both diagonal spans are equal.
   */
  diagonalDegrees: number;
  horizontalBoundsDegrees: {
    minimum: number;
    maximum: number;
  };
  verticalBoundsDegrees: {
    minimum: number;
    maximum: number;
  };
  diagonalDegreesByCornerPair: {
    topLeftToBottomRight: number;
    topRightToBottomLeft: number;
  };
  activeImagingArea: SensorImagingArea;
  centerOffsetFromOpticalAxisMm: RasterVector;
  projection: {
    projectionDistanceMm: number;
    provenance: CalculationProvenance;
  };
}

function requireCaptureOrientation(
  value: unknown
): asserts value is CaptureOrientation {
  if (
    typeof value !== "string" ||
    !CAPTURE_ORIENTATIONS.has(value as CaptureOrientation)
  ) {
    throw new InvalidScientificInputError("orientation is invalid.");
  }
}

function requireRasterDimensions(
  name: string,
  raster: RasterDimensions
): void {
  requirePositiveInteger(`${name}.pixelWidth`, raster.pixelWidth);
  requirePositiveInteger(`${name}.pixelHeight`, raster.pixelHeight);
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
  bounds: RasterDimensions
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

function validateRasterPoint(
  name: string,
  point: RasterPoint,
  bounds: RasterDimensions
): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new InvalidScientificInputError(
      `${name} coordinates must be finite.`
    );
  }
  if (
    point.x < 0 ||
    point.y < 0 ||
    point.x > bounds.pixelWidth ||
    point.y > bounds.pixelHeight
  ) {
    throw new InvalidScientificInputError(
      `${name} must lie within the raster edge-coordinate bounds.`
    );
  }
}

function validateRasterVector(name: string, vector: RasterVector): void {
  if (!Number.isFinite(vector.x) || !Number.isFinite(vector.y)) {
    throw new InvalidScientificInputError(
      `${name} coordinates must be finite.`
    );
  }
}

function fullRect(raster: RasterDimensions): RasterRect {
  return {
    x: 0,
    y: 0,
    width: raster.pixelWidth,
    height: raster.pixelHeight
  };
}

function orientRaster(
  raster: RasterDimensions,
  orientation: CaptureOrientation
): RasterDimensions {
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

function rotateVector(
  vector: RasterVector,
  orientation: CaptureOrientation
): RasterVector {
  switch (orientation) {
    case "landscape":
      return { x: vector.x, y: vector.y };
    case "portrait-clockwise":
      return { x: -vector.y, y: vector.x };
    case "landscape-inverted":
      return { x: -vector.x, y: -vector.y };
    case "portrait-counter-clockwise":
      return { x: vector.y, y: -vector.x };
  }
}

function inverseRotateVector(
  vector: RasterVector,
  orientation: CaptureOrientation
): RasterVector {
  switch (orientation) {
    case "landscape":
      return { x: vector.x, y: vector.y };
    case "portrait-clockwise":
      return { x: vector.y, y: -vector.x };
    case "landscape-inverted":
      return { x: -vector.x, y: -vector.y };
    case "portrait-counter-clockwise":
      return { x: -vector.y, y: vector.x };
  }
}

/**
 * Transforms a continuous native raster edge-coordinate point into oriented
 * capture coordinates. Pixel centers can be represented with +0.5 offsets.
 */
export function transformNativeRasterPointToOriented(
  input: TransformRasterPointInput
): RasterPoint {
  requireCaptureOrientation(input.orientation);
  requireRasterDimensions("nativeRaster", input.nativeRaster);
  validateRasterPoint("point", input.point, input.nativeRaster);

  const { pixelWidth: width, pixelHeight: height } = input.nativeRaster;
  switch (input.orientation) {
    case "landscape":
      return { ...input.point };
    case "portrait-clockwise":
      return { x: height - input.point.y, y: input.point.x };
    case "landscape-inverted":
      return { x: width - input.point.x, y: height - input.point.y };
    case "portrait-counter-clockwise":
      return { x: input.point.y, y: width - input.point.x };
  }
}

/** Transforms an oriented raster edge-coordinate point back to native coordinates. */
export function transformOrientedRasterPointToNative(
  input: TransformRasterPointInput
): RasterPoint {
  requireCaptureOrientation(input.orientation);
  requireRasterDimensions("nativeRaster", input.nativeRaster);
  const orientedRaster = orientRaster(input.nativeRaster, input.orientation);
  validateRasterPoint("point", input.point, orientedRaster);

  const { pixelWidth: width, pixelHeight: height } = input.nativeRaster;
  switch (input.orientation) {
    case "landscape":
      return { ...input.point };
    case "portrait-clockwise":
      return { x: input.point.y, y: height - input.point.x };
    case "landscape-inverted":
      return { x: width - input.point.x, y: height - input.point.y };
    case "portrait-counter-clockwise":
      return { x: width - input.point.y, y: input.point.x };
  }
}

/** Rotates a native raster vector into oriented coordinates. */
export function transformNativeRasterVectorToOriented(
  input: TransformRasterVectorInput
): RasterVector {
  requireCaptureOrientation(input.orientation);
  validateRasterVector("vector", input.vector);
  return rotateVector(input.vector, input.orientation);
}

/** Rotates an oriented raster vector back into native coordinates. */
export function transformOrientedRasterVectorToNative(
  input: TransformRasterVectorInput
): RasterVector {
  requireCaptureOrientation(input.orientation);
  validateRasterVector("vector", input.vector);
  return inverseRotateVector(input.vector, input.orientation);
}

/** Transforms an integer half-open native raster rectangle into oriented coordinates. */
export function transformNativeRasterRectToOriented(
  input: TransformRasterRectInput
): RasterRect {
  requireCaptureOrientation(input.orientation);
  requireRasterDimensions("nativeRaster", input.nativeRaster);
  validateRasterRect("rect", input.rect, input.nativeRaster);

  const { pixelWidth: width, pixelHeight: height } = input.nativeRaster;
  const { x, y, width: rectWidth, height: rectHeight } = input.rect;
  switch (input.orientation) {
    case "landscape":
      return { ...input.rect };
    case "portrait-clockwise":
      return {
        x: height - (y + rectHeight),
        y: x,
        width: rectHeight,
        height: rectWidth
      };
    case "landscape-inverted":
      return {
        x: width - (x + rectWidth),
        y: height - (y + rectHeight),
        width: rectWidth,
        height: rectHeight
      };
    case "portrait-counter-clockwise":
      return {
        x: y,
        y: width - (x + rectWidth),
        width: rectHeight,
        height: rectWidth
      };
  }
}

/** Transforms an oriented integer half-open rectangle back to native coordinates. */
export function transformOrientedRasterRectToNative(
  input: TransformRasterRectInput
): RasterRect {
  requireCaptureOrientation(input.orientation);
  requireRasterDimensions("nativeRaster", input.nativeRaster);
  const orientedRaster = orientRaster(input.nativeRaster, input.orientation);
  validateRasterRect("rect", input.rect, orientedRaster);

  const { pixelWidth: width, pixelHeight: height } = input.nativeRaster;
  const { x, y, width: rectWidth, height: rectHeight } = input.rect;
  switch (input.orientation) {
    case "landscape":
      return { ...input.rect };
    case "portrait-clockwise":
      return {
        x: y,
        y: height - (x + rectWidth),
        width: rectHeight,
        height: rectWidth
      };
    case "landscape-inverted":
      return {
        x: width - (x + rectWidth),
        y: height - (y + rectHeight),
        width: rectWidth,
        height: rectHeight
      };
    case "portrait-counter-clockwise":
      return {
        x: width - (y + rectHeight),
        y: x,
        width: rectHeight,
        height: rectWidth
      };
  }
}

function nativePhysicalBoundsFromRect(
  imagingArea: SensorImagingArea,
  nativeRaster: NativeImageRaster,
  rect: RasterRect
): PhysicalBoundsFromOpticalAxisMm {
  const pitchX = imagingArea.widthMm / nativeRaster.pixelWidth;
  const pitchY = imagingArea.heightMm / nativeRaster.pixelHeight;

  return {
    left: rect.x * pitchX - imagingArea.widthMm / 2,
    right:
      (rect.x + rect.width) * pitchX - imagingArea.widthMm / 2,
    top: rect.y * pitchY - imagingArea.heightMm / 2,
    bottom:
      (rect.y + rect.height) * pitchY - imagingArea.heightMm / 2
  };
}

function orientPhysicalBounds(
  bounds: PhysicalBoundsFromOpticalAxisMm,
  orientation: CaptureOrientation
): PhysicalBoundsFromOpticalAxisMm {
  const corners = [
    { x: bounds.left, y: bounds.top },
    { x: bounds.right, y: bounds.top },
    { x: bounds.right, y: bounds.bottom },
    { x: bounds.left, y: bounds.bottom }
  ].map((corner) => rotateVector(corner, orientation));

  return {
    left: Math.min(...corners.map((corner) => corner.x)),
    right: Math.max(...corners.map((corner) => corner.x)),
    top: Math.min(...corners.map((corner) => corner.y)),
    bottom: Math.max(...corners.map((corner) => corner.y))
  };
}

function validateOutputAspectRatio(
  cropRect: RasterRect,
  outputRaster: RasterDimensions
): void {
  const sourceAspectRatio = cropRect.width / cropRect.height;
  const outputAspectRatio =
    outputRaster.pixelWidth / outputRaster.pixelHeight;
  const relativeDifference =
    Math.abs(outputAspectRatio - sourceAspectRatio) / sourceAspectRatio;

  if (relativeDifference > OUTPUT_ASPECT_RATIO_RELATIVE_TOLERANCE) {
    throw new InvalidScientificInputError(
      "outputRaster must preserve outputCropRect aspect ratio; implicit geometric stretching is not supported."
    );
  }
}

function angleBetweenSensorRaysDegrees(
  first: RasterVector,
  second: RasterVector,
  projectionDistanceMm: number
): number {
  const firstLength = Math.hypot(
    first.x,
    first.y,
    projectionDistanceMm
  );
  const secondLength = Math.hypot(
    second.x,
    second.y,
    projectionDistanceMm
  );
  const dot =
    first.x * second.x +
    first.y * second.y +
    projectionDistanceMm * projectionDistanceMm;
  const cosine = Math.max(
    -1,
    Math.min(1, dot / (firstLength * secondLength))
  );
  return (Math.acos(cosine) * 180) / Math.PI;
}

/**
 * Resolves native sensor geometry, active capture, physical camera orientation,
 * and final digital/output geometry without conflating their identities.
 */
export function resolveCaptureGeometry(
  input: ResolveCaptureGeometryInput
): CalculationResult<ResolvedCaptureGeometry> {
  requireCaptureOrientation(input.orientation);
  requirePositiveFinite("imagingArea.widthMm", input.imagingArea.widthMm);
  requirePositiveFinite("imagingArea.heightMm", input.imagingArea.heightMm);
  requireRasterDimensions("nativeRaster", input.nativeRaster);

  const activeCaptureRect =
    input.activeCaptureRect ?? fullRect(input.nativeRaster);
  validateRasterRect(
    "activeCaptureRect",
    activeCaptureRect,
    input.nativeRaster
  );

  const nativeBounds = nativePhysicalBoundsFromRect(
    input.imagingArea,
    input.nativeRaster,
    activeCaptureRect
  );
  const activeImagingArea: SensorImagingArea = {
    widthMm: nativeBounds.right - nativeBounds.left,
    heightMm: nativeBounds.bottom - nativeBounds.top
  };
  const activeRaster: RasterDimensions = {
    pixelWidth: activeCaptureRect.width,
    pixelHeight: activeCaptureRect.height
  };
  const orientedBounds = orientPhysicalBounds(
    nativeBounds,
    input.orientation
  );
  const orientedRaster = orientRaster(activeRaster, input.orientation);
  const orientedImagingArea: SensorImagingArea = {
    widthMm: orientedBounds.right - orientedBounds.left,
    heightMm: orientedBounds.bottom - orientedBounds.top
  };

  const outputCropRect =
    input.outputCropRect ?? fullRect(orientedRaster);
  validateRasterRect(
    "outputCropRect",
    outputCropRect,
    orientedRaster
  );

  const outputRaster: RasterDimensions = input.outputRaster ?? {
    pixelWidth: outputCropRect.width,
    pixelHeight: outputCropRect.height
  };
  requireRasterDimensions("outputRaster", outputRaster);
  validateOutputAspectRatio(outputCropRect, outputRaster);

  return calculatedResult(
    {
      native: {
        imagingArea: { ...input.imagingArea },
        raster: { ...input.nativeRaster }
      },
      activeCapture: {
        nativeRect: { ...activeCaptureRect },
        imagingArea: activeImagingArea,
        physicalOffsetMm: {
          x: nativeBounds.left + input.imagingArea.widthMm / 2,
          y: nativeBounds.top + input.imagingArea.heightMm / 2
        },
        centerOffsetFromOpticalAxisMm: {
          x: (nativeBounds.left + nativeBounds.right) / 2,
          y: (nativeBounds.top + nativeBounds.bottom) / 2
        },
        physicalBoundsFromOpticalAxisMm: nativeBounds,
        imagingAreaDerivation: "uniform-native-raster",
        raster: activeRaster
      },
      orientedCapture: {
        orientation: input.orientation,
        imagingArea: orientedImagingArea,
        physicalBoundsFromOpticalAxisMm: orientedBounds,
        raster: orientedRaster
      },
      output: {
        cropRect: { ...outputCropRect },
        raster: { ...outputRaster },
        sourceRetainedAreaFraction:
          (outputCropRect.width * outputCropRect.height) /
          (orientedRaster.pixelWidth * orientedRaster.pixelHeight)
      }
    },
    "capture-geometry-pipeline",
    "1.1.0",
    [
      "Native sensor raster coordinates use a top-left origin with +X right and +Y down.",
      "Raster rectangles are integer half-open extents.",
      "Physical camera orientation does not rotate or redefine the native sensor coordinate system.",
      "The generic active physical area is derived by assuming native image samples uniformly span the declared physical imaging area.",
      "Output crop/resampling is digital geometry and does not mutate physical sensor or active-capture identity.",
      "Output raster aspect ratio must remain consistent with the output crop; implicit geometric stretching is rejected."
    ]
  );
}

/**
 * Calculates asymmetric horizontal/vertical FOV plus opposite-corner diagonal
 * spans for the active physical capture area after physical camera orientation.
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

  const bounds =
    geometry.orientedCapture.physicalBoundsFromOpticalAxisMm;
  const fovInput = {
    focalLengthMm: input.focalLengthMm,
    ...(input.focusDistanceM === undefined
      ? {}
      : { focusDistanceM: input.focusDistanceM })
  };
  const horizontal = calculateFieldOfViewBounds({
    ...fovInput,
    minimumSensorCoordinateMm: bounds.left,
    maximumSensorCoordinateMm: bounds.right
  });
  const vertical = calculateFieldOfViewBounds({
    ...fovInput,
    minimumSensorCoordinateMm: bounds.top,
    maximumSensorCoordinateMm: bounds.bottom
  });

  const projectionDistanceMm =
    horizontal.value.projectionDistanceMm;
  const topLeft = { x: bounds.left, y: bounds.top };
  const topRight = { x: bounds.right, y: bounds.top };
  const bottomRight = { x: bounds.right, y: bounds.bottom };
  const bottomLeft = { x: bounds.left, y: bounds.bottom };
  const topLeftToBottomRight = angleBetweenSensorRaysDegrees(
    topLeft,
    bottomRight,
    projectionDistanceMm
  );
  const topRightToBottomLeft = angleBetweenSensorRaysDegrees(
    topRight,
    bottomLeft,
    projectionDistanceMm
  );

  return calculatedResult(
    {
      orientation: input.orientation,
      horizontalDegrees: horizontal.value.degrees,
      verticalDegrees: vertical.value.degrees,
      diagonalDegrees: Math.max(
        topLeftToBottomRight,
        topRightToBottomLeft
      ),
      horizontalBoundsDegrees: {
        minimum: horizontal.value.minimumDegrees,
        maximum: horizontal.value.maximumDegrees
      },
      verticalBoundsDegrees: {
        minimum: vertical.value.minimumDegrees,
        maximum: vertical.value.maximumDegrees
      },
      diagonalDegreesByCornerPair: {
        topLeftToBottomRight,
        topRightToBottomLeft
      },
      activeImagingArea: {
        ...geometry.orientedCapture.imagingArea
      },
      centerOffsetFromOpticalAxisMm: rotateVector(
        geometry.activeCapture.centerOffsetFromOpticalAxisMm,
        input.orientation
      ),
      projection: {
        projectionDistanceMm,
        provenance: horizontal.provenance
      }
    },
    "oriented-active-capture-field-of-view",
    "1.1.0",
    [
      "Rectilinear projection is evaluated from signed active-area bounds relative to the optical axis.",
      "Off-center active crops preserve asymmetric angular bounds rather than being treated as centered.",
      "Camera orientation rotates physical bounds while leaving the native sensor coordinate system unchanged.",
      "For off-center rectangles the two opposite-corner diagonal spans may differ; diagonalDegrees reports the larger span.",
      "Final digital/output crop is excluded from active-capture FOV."
    ]
  );
}
