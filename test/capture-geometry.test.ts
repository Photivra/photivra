import { describe, expect, it } from "vitest";

import {
  calculateActiveCaptureFieldOfView,
  calculateOutputFieldOfView,
  resolveCaptureGeometry,
  transformNativeRasterPointToOriented,
  transformNativeRasterRectToOriented,
  transformNativeRasterVectorToOriented,
  transformOrientedRasterPointToNative,
  transformOrientedRasterRectToNative,
  transformOrientedRasterVectorToNative,
  type CaptureOrientation
} from "../src/index.js";

const FULL_FRAME = { widthMm: 36, heightMm: 24 };
const RASTER_24MP = { pixelWidth: 6000, pixelHeight: 4000 };
const ORIENTATIONS: readonly CaptureOrientation[] = [
  "landscape",
  "portrait-clockwise",
  "landscape-inverted",
  "portrait-counter-clockwise"
];

describe("capture geometry", () => {
  it("keeps native coordinates stable while portrait orientation swaps presentation axes", () => {
    const portrait = resolveCaptureGeometry({
      imagingArea: FULL_FRAME,
      nativeRaster: RASTER_24MP,
      orientation: "portrait-clockwise"
    }).value;

    expect(portrait.native.raster).toEqual(RASTER_24MP);
    expect(portrait.native.imagingArea).toEqual(FULL_FRAME);
    expect(portrait.activeCapture.nativeRect).toEqual({
      x: 0,
      y: 0,
      width: 6000,
      height: 4000
    });
    expect(portrait.orientedCapture.raster).toEqual({
      pixelWidth: 4000,
      pixelHeight: 6000
    });
    expect(portrait.orientedCapture.imagingArea).toEqual({
      widthMm: 24,
      heightMm: 36
    });
  });

  it("round-trips points, vectors, and half-open rectangles for all four orientations", () => {
    for (const orientation of ORIENTATIONS) {
      const point = { x: 1234.25, y: 987.75 };
      const orientedPoint = transformNativeRasterPointToOriented({
        point,
        nativeRaster: RASTER_24MP,
        orientation
      });
      expect(
        transformOrientedRasterPointToNative({
          point: orientedPoint,
          nativeRaster: RASTER_24MP,
          orientation
        })
      ).toEqual(point);

      const vector = { x: 17.5, y: -9.25 };
      const orientedVector = transformNativeRasterVectorToOriented({
        vector,
        orientation
      });
      expect(
        transformOrientedRasterVectorToNative({
          vector: orientedVector,
          orientation
        })
      ).toEqual(vector);

      const rect = { x: 101, y: 203, width: 1400, height: 700 };
      const orientedRect = transformNativeRasterRectToOriented({
        rect,
        nativeRaster: RASTER_24MP,
        orientation
      });
      expect(
        transformOrientedRasterRectToNative({
          rect: orientedRect,
          nativeRaster: RASTER_24MP,
          orientation
        })
      ).toEqual(rect);
    }
  });

  it("uses distinct clockwise and counter-clockwise transforms", () => {
    const point = { x: 1000, y: 500 };
    expect(
      transformNativeRasterPointToOriented({
        point,
        nativeRaster: RASTER_24MP,
        orientation: "portrait-clockwise"
      })
    ).toEqual({ x: 3500, y: 1000 });
    expect(
      transformNativeRasterPointToOriented({
        point,
        nativeRaster: RASTER_24MP,
        orientation: "portrait-counter-clockwise"
      })
    ).toEqual({ x: 500, y: 5000 });
  });

  it("rejects invalid runtime orientation values instead of treating them as landscape", () => {
    expect(() =>
      resolveCaptureGeometry({
        imagingArea: FULL_FRAME,
        nativeRaster: RASTER_24MP,
        orientation: "sideways" as CaptureOrientation
      })
    ).toThrow("orientation is invalid");
  });

  it("derives active physical area and optical-axis offset from a native crop", () => {
    const result = resolveCaptureGeometry({
      imagingArea: FULL_FRAME,
      nativeRaster: RASTER_24MP,
      orientation: "landscape",
      activeCaptureRect: {
        x: 0,
        y: 800,
        width: 3000,
        height: 2400
      }
    }).value;

    expect(result.native.imagingArea).toEqual(FULL_FRAME);
    expect(result.activeCapture.imagingArea.widthMm).toBeCloseTo(18, 12);
    expect(result.activeCapture.imagingArea.heightMm).toBeCloseTo(14.4, 12);
    expect(result.activeCapture.physicalOffsetMm.x).toBeCloseTo(0, 12);
    expect(result.activeCapture.physicalOffsetMm.y).toBeCloseTo(4.8, 12);
    expect(result.activeCapture.centerOffsetFromOpticalAxisMm.x).toBeCloseTo(
      -9,
      12
    );
    expect(result.activeCapture.imagingAreaDerivation).toBe(
      "uniform-native-raster"
    );
  });

  it("keeps final output crop/raster separate and rejects implicit stretching", () => {
    const result = resolveCaptureGeometry({
      imagingArea: FULL_FRAME,
      nativeRaster: RASTER_24MP,
      orientation: "portrait-clockwise",
      outputCropRect: {
        x: 0,
        y: 1875,
        width: 4000,
        height: 2250
      },
      outputRaster: {
        pixelWidth: 3840,
        pixelHeight: 2160
      }
    }).value;

    expect(result.activeCapture.imagingArea).toEqual(FULL_FRAME);
    expect(result.output.raster).toEqual({
      pixelWidth: 3840,
      pixelHeight: 2160
    });
    expect(result.output.sourceRetainedAreaFraction).toBeCloseTo(0.375, 12);

    expect(() =>
      resolveCaptureGeometry({
        imagingArea: FULL_FRAME,
        nativeRaster: RASTER_24MP,
        orientation: "landscape",
        outputCropRect: {
          x: 0,
          y: 0,
          width: 4000,
          height: 2250
        },
        outputRaster: {
          pixelWidth: 2000,
          pixelHeight: 2000
        }
      })
    ).toThrow("implicit geometric stretching");

    // This mismatch was previously accepted by the fixed 1% tolerance even
    // though it cannot result from nearest-integer rounding of one isotropic
    // scale factor.
    expect(() =>
      resolveCaptureGeometry({
        imagingArea: FULL_FRAME,
        nativeRaster: RASTER_24MP,
        orientation: "landscape",
        outputCropRect: {
          x: 0,
          y: 0,
          width: 4000,
          height: 2250
        },
        outputRaster: {
          pixelWidth: 1920,
          pixelHeight: 1079
        }
      })
    ).toThrow("nearest-integer raster rounding");

    // Legitimate one-pixel integer rounding remains accepted.
    expect(() =>
      resolveCaptureGeometry({
        imagingArea: FULL_FRAME,
        nativeRaster: RASTER_24MP,
        orientation: "landscape",
        outputCropRect: {
          x: 0,
          y: 0,
          width: 3000,
          height: 2000
        },
        outputRaster: {
          pixelWidth: 1000,
          pixelHeight: 667
        }
      })
    ).not.toThrow();
  });

  it("tracks the physical region and scale retained by final output crop", () => {
    const result = resolveCaptureGeometry({
      imagingArea: FULL_FRAME,
      nativeRaster: RASTER_24MP,
      orientation: "portrait-clockwise",
      outputCropRect: {
        x: 0,
        y: 1500,
        width: 4000,
        height: 3000
      },
      outputRaster: {
        pixelWidth: 2000,
        pixelHeight: 1500
      }
    }).value;

    expect(result.output.imagingArea.widthMm).toBeCloseTo(24, 12);
    expect(result.output.imagingArea.heightMm).toBeCloseTo(18, 12);
    expect(result.output.physicalBoundsFromOpticalAxisMm.left).toBeCloseTo(
      -12,
      12
    );
    expect(result.output.physicalBoundsFromOpticalAxisMm.right).toBeCloseTo(
      12,
      12
    );
    expect(result.output.centerOffsetFromOpticalAxisMm.x).toBeCloseTo(0, 12);
    expect(result.output.centerOffsetFromOpticalAxisMm.y).toBeCloseTo(0, 12);
    expect(result.output.orientedCaptureToOutputScale.x).toBeCloseTo(0.5, 12);
    expect(result.output.orientedCaptureToOutputScale.y).toBeCloseTo(0.5, 12);
    expect(
      result.output.orientedCaptureToOutputScale.axisRelativeDifference
    ).toBeCloseTo(0, 12);
  });

  it("narrows final output FOV without changing it when only output resolution changes", () => {
    const active = calculateActiveCaptureFieldOfView({
      imagingArea: FULL_FRAME,
      nativeRaster: RASTER_24MP,
      orientation: "landscape",
      focalLengthMm: 50
    }).value;
    const output = calculateOutputFieldOfView({
      imagingArea: FULL_FRAME,
      nativeRaster: RASTER_24MP,
      orientation: "landscape",
      outputCropRect: {
        x: 1500,
        y: 1000,
        width: 3000,
        height: 2000
      },
      focalLengthMm: 50
    }).value;
    const outputWithDifferentRaster = resolveCaptureGeometry({
      imagingArea: FULL_FRAME,
      nativeRaster: RASTER_24MP,
      orientation: "landscape",
      outputCropRect: {
        x: 1500,
        y: 1000,
        width: 3000,
        height: 2000
      },
      outputRaster: {
        pixelWidth: 1500,
        pixelHeight: 1000
      }
    }).value;

    expect(output.horizontalDegrees).toBeLessThan(active.horizontalDegrees);
    expect(output.verticalDegrees).toBeLessThan(active.verticalDegrees);
    expect(output.outputImagingArea).toEqual({
      widthMm: 18,
      heightMm: 12
    });
    expect(outputWithDifferentRaster.output.imagingArea).toEqual(
      output.outputImagingArea
    );
  });

  it("preserves asymmetric final output bounds for off-center digital crop", () => {
    const output = calculateOutputFieldOfView({
      imagingArea: FULL_FRAME,
      nativeRaster: RASTER_24MP,
      orientation: "landscape",
      outputCropRect: {
        x: 0,
        y: 0,
        width: 3000,
        height: 2000
      },
      focalLengthMm: 50
    }).value;

    expect(output.centerOffsetFromOpticalAxisMm.x).toBeCloseTo(-9, 12);
    expect(output.centerOffsetFromOpticalAxisMm.y).toBeCloseTo(-6, 12);
    expect(output.horizontalBoundsDegrees.maximum).toBeCloseTo(0, 12);
    expect(output.verticalBoundsDegrees.maximum).toBeCloseTo(0, 12);
  });

  it("rejects active and output crop rectangles outside their coordinate spaces", () => {
    expect(() =>
      resolveCaptureGeometry({
        imagingArea: FULL_FRAME,
        nativeRaster: RASTER_24MP,
        orientation: "landscape",
        activeCaptureRect: {
          x: 3000,
          y: 0,
          width: 4000,
          height: 3000
        }
      })
    ).toThrow("activeCaptureRect must fit entirely");

    expect(() =>
      resolveCaptureGeometry({
        imagingArea: FULL_FRAME,
        nativeRaster: RASTER_24MP,
        orientation: "portrait-clockwise",
        outputCropRect: {
          x: 0,
          y: 0,
          width: 5000,
          height: 6000
        }
      })
    ).toThrow("outputCropRect must fit entirely");
  });

  it("swaps horizontal/vertical FOV at 90 degrees and preserves diagonal spans", () => {
    const landscape = calculateActiveCaptureFieldOfView({
      imagingArea: FULL_FRAME,
      nativeRaster: RASTER_24MP,
      orientation: "landscape",
      focalLengthMm: 50
    }).value;
    const portrait = calculateActiveCaptureFieldOfView({
      imagingArea: FULL_FRAME,
      nativeRaster: RASTER_24MP,
      orientation: "portrait-clockwise",
      focalLengthMm: 50
    }).value;

    expect(portrait.horizontalDegrees).toBeCloseTo(
      landscape.verticalDegrees,
      12
    );
    expect(portrait.verticalDegrees).toBeCloseTo(
      landscape.horizontalDegrees,
      12
    );
    expect(portrait.diagonalDegrees).toBeCloseTo(
      landscape.diagonalDegrees,
      12
    );
  });

  it("models off-center active-crop angular bounds instead of recentering them", () => {
    const centered = calculateActiveCaptureFieldOfView({
      imagingArea: FULL_FRAME,
      nativeRaster: RASTER_24MP,
      orientation: "landscape",
      activeCaptureRect: {
        x: 1500,
        y: 1000,
        width: 3000,
        height: 2000
      },
      focalLengthMm: 50
    }).value;
    const offCenter = calculateActiveCaptureFieldOfView({
      imagingArea: FULL_FRAME,
      nativeRaster: RASTER_24MP,
      orientation: "landscape",
      activeCaptureRect: {
        x: 0,
        y: 0,
        width: 3000,
        height: 2000
      },
      focalLengthMm: 50
    }).value;

    expect(offCenter.centerOffsetFromOpticalAxisMm.x).toBeCloseTo(-9, 12);
    expect(offCenter.centerOffsetFromOpticalAxisMm.y).toBeCloseTo(-6, 12);
    expect(offCenter.horizontalBoundsDegrees.maximum).toBeCloseTo(0, 12);
    expect(offCenter.verticalBoundsDegrees.maximum).toBeCloseTo(0, 12);
    expect(offCenter.horizontalBoundsDegrees.minimum).toBeLessThan(0);
    expect(offCenter.verticalBoundsDegrees.minimum).toBeLessThan(0);
    expect(offCenter.horizontalDegrees).toBeLessThan(
      centered.horizontalDegrees
    );
    expect(offCenter.verticalDegrees).toBeLessThan(
      centered.verticalDegrees
    );
    expect(
      offCenter.diagonalDegreesByCornerPair.topLeftToBottomRight
    ).not.toBeCloseTo(
      offCenter.diagonalDegreesByCornerPair.topRightToBottomLeft,
      8
    );
  });

  it("preserves the underlying projection provenance", () => {
    const result = calculateActiveCaptureFieldOfView({
      imagingArea: FULL_FRAME,
      nativeRaster: RASTER_24MP,
      orientation: "landscape",
      focalLengthMm: 50,
      focusDistanceM: 2
    }).value;

    expect(result.projection.provenance.model).toBe(
      "focus-aware-asymmetric-rectilinear-field-of-view"
    );
    expect(result.projection.projectionDistanceMm).toBeGreaterThan(50);
  });
});
