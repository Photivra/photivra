import { describe, expect, it } from "vitest";

import {
  calculateActiveCaptureFieldOfView,
  resolveCaptureGeometry
} from "../src/index.js";

const FULL_FRAME = { widthMm: 36, heightMm: 24 };
const RASTER_24MP = { pixelWidth: 6000, pixelHeight: 4000 };

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

  it("keeps clockwise and counter-clockwise portrait orientations distinct", () => {
    const clockwise = resolveCaptureGeometry({
      imagingArea: FULL_FRAME,
      nativeRaster: RASTER_24MP,
      orientation: "portrait-clockwise"
    }).value;
    const counterClockwise = resolveCaptureGeometry({
      imagingArea: FULL_FRAME,
      nativeRaster: RASTER_24MP,
      orientation: "portrait-counter-clockwise"
    }).value;

    expect(clockwise.orientedCapture.raster).toEqual(
      counterClockwise.orientedCapture.raster
    );
    expect(clockwise.orientedCapture.orientation).not.toBe(
      counterClockwise.orientedCapture.orientation
    );
  });

  it("derives active physical area from a native sensor crop without mutating sensor identity", () => {
    const result = resolveCaptureGeometry({
      imagingArea: FULL_FRAME,
      nativeRaster: RASTER_24MP,
      orientation: "landscape",
      activeCaptureRect: {
        x: 1000,
        y: 800,
        width: 4000,
        height: 2400
      }
    }).value;

    expect(result.native.imagingArea).toEqual(FULL_FRAME);
    expect(result.native.raster).toEqual(RASTER_24MP);
    expect(result.activeCapture.imagingArea.widthMm).toBeCloseTo(24, 12);
    expect(result.activeCapture.imagingArea.heightMm).toBeCloseTo(14.4, 12);
    expect(result.activeCapture.physicalOffsetMm.x).toBeCloseTo(6, 12);
    expect(result.activeCapture.physicalOffsetMm.y).toBeCloseTo(4.8, 12);
    expect(result.activeCapture.raster).toEqual({
      pixelWidth: 4000,
      pixelHeight: 2400
    });
  });

  it("keeps final output crop and raster separate from active capture geometry", () => {
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
    expect(result.orientedCapture.raster).toEqual({
      pixelWidth: 4000,
      pixelHeight: 6000
    });
    expect(result.output.cropRect).toEqual({
      x: 0,
      y: 1875,
      width: 4000,
      height: 2250
    });
    expect(result.output.raster).toEqual({
      pixelWidth: 3840,
      pixelHeight: 2160
    });
    expect(result.output.sourceRetainedAreaFraction).toBeCloseTo(0.375, 12);
  });

  it("rejects active and output crop rectangles outside their declared coordinate spaces", () => {
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

  it("swaps horizontal and vertical FOV at 90 degrees while preserving diagonal FOV", () => {
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

  it("uses active physical capture area for FOV rather than pretending the sensor changed", () => {
    const full = calculateActiveCaptureFieldOfView({
      imagingArea: FULL_FRAME,
      nativeRaster: RASTER_24MP,
      orientation: "landscape",
      focalLengthMm: 50
    }).value;
    const cropped = calculateActiveCaptureFieldOfView({
      imagingArea: FULL_FRAME,
      nativeRaster: RASTER_24MP,
      orientation: "landscape",
      activeCaptureRect: {
        x: 1000,
        y: 666,
        width: 4000,
        height: 2668
      },
      focalLengthMm: 50
    }).value;

    expect(cropped.horizontalDegrees).toBeLessThan(full.horizontalDegrees);
    expect(cropped.verticalDegrees).toBeLessThan(full.verticalDegrees);
    expect(cropped.activeImagingArea.widthMm).toBeCloseTo(24, 12);
    expect(full.activeImagingArea).toEqual(FULL_FRAME);
  });

  it("records coordinate and digital-output separation in provenance", () => {
    const result = resolveCaptureGeometry({
      imagingArea: FULL_FRAME,
      nativeRaster: RASTER_24MP,
      orientation: "landscape-inverted"
    });

    expect(result.provenance.assumptions).toEqual(
      expect.arrayContaining([
        expect.stringContaining("top-left origin"),
        expect.stringContaining("half-open"),
        expect.stringContaining("does not mutate physical sensor")
      ])
    );
  });
});
