import { describe, expect, it } from "vitest";

import {
  calculatePixelPitch,
  calculateSensorGeometryMetrics
} from "../src/index.js";

describe("sensor geometry and native raster", () => {
  it("derives full-frame geometry and 24 MP sampling independently", () => {
    const result = calculateSensorGeometryMetrics({
      imagingArea: { widthMm: 36, heightMm: 24 },
      nativeRaster: { pixelWidth: 6000, pixelHeight: 4000 }
    });

    expect(result.value.imagingArea.diagonalMm).toBeCloseTo(
      Math.hypot(36, 24),
      12
    );
    expect(result.value.imagingArea.cropFactor35Mm).toBeCloseTo(1, 12);
    expect(result.value.imagingArea.aspectRatio).toBeCloseTo(1.5, 12);
    expect(result.value.nativeRaster.totalImageSamples).toBe(24_000_000);
    expect(result.value.nativeRaster.megapixels).toBeCloseTo(24, 12);
    expect(result.value.nativeRaster.aspectRatio).toBeCloseTo(1.5, 12);
    expect(result.value.sampling.pitchXMicrometers).toBeCloseTo(6, 12);
    expect(result.value.sampling.pitchYMicrometers).toBeCloseTo(6, 12);
    expect(result.value.sampling.pitchAspectRatio).toBeCloseTo(1, 12);
  });

  it("changes raster density without changing physical crop factor", () => {
    const lowerResolution = calculateSensorGeometryMetrics({
      imagingArea: { widthMm: 36, heightMm: 24 },
      nativeRaster: { pixelWidth: 6000, pixelHeight: 4000 }
    }).value;
    const higherResolution = calculateSensorGeometryMetrics({
      imagingArea: { widthMm: 36, heightMm: 24 },
      nativeRaster: { pixelWidth: 9000, pixelHeight: 6000 }
    }).value;

    expect(higherResolution.imagingArea.cropFactor35Mm).toBeCloseTo(
      lowerResolution.imagingArea.cropFactor35Mm,
      12
    );
    expect(higherResolution.nativeRaster.megapixels).toBeCloseTo(54, 12);
    expect(higherResolution.sampling.pitchXMicrometers).toBeCloseTo(4, 12);
    expect(higherResolution.sampling.pitchYMicrometers).toBeCloseTo(4, 12);
  });

  it("changes physical crop factor without changing native megapixels", () => {
    const fullFrame = calculateSensorGeometryMetrics({
      imagingArea: { widthMm: 36, heightMm: 24 },
      nativeRaster: { pixelWidth: 6000, pixelHeight: 4000 }
    }).value;
    const apsC = calculateSensorGeometryMetrics({
      imagingArea: { widthMm: 23.5, heightMm: 15.6 },
      nativeRaster: { pixelWidth: 6000, pixelHeight: 4000 }
    }).value;

    expect(apsC.nativeRaster.megapixels).toBe(fullFrame.nativeRaster.megapixels);
    expect(apsC.imagingArea.cropFactor35Mm).toBeGreaterThan(1);
    expect(apsC.sampling.pitchXMicrometers).toBeLessThan(
      fullFrame.sampling.pitchXMicrometers
    );
  });

  it("preserves non-square geometric sampling instead of forcing one pitch", () => {
    const result = calculateSensorGeometryMetrics({
      imagingArea: { widthMm: 10, heightMm: 8 },
      nativeRaster: { pixelWidth: 1000, pixelHeight: 400 }
    }).value;

    expect(result.sampling.pitchXMicrometers).toBeCloseTo(10, 12);
    expect(result.sampling.pitchYMicrometers).toBeCloseTo(20, 12);
    expect(result.sampling.pitchAspectRatio).toBeCloseTo(0.5, 12);
  });

  it("matches the legacy horizontal pixel-pitch calculation", () => {
    const legacy = calculatePixelPitch({
      sensorWidthMm: 36,
      pixelWidth: 6000
    }).value;
    const metrics = calculateSensorGeometryMetrics({
      imagingArea: { widthMm: 36, heightMm: 24 },
      nativeRaster: { pixelWidth: 6000, pixelHeight: 4000 }
    }).value;

    expect(metrics.sampling.pitchXMicrometers).toBeCloseTo(
      legacy.micrometers,
      12
    );
  });

  it("rejects invalid dimensions, raster counts, and unsafe sample products", () => {
    expect(() =>
      calculateSensorGeometryMetrics({
        imagingArea: { widthMm: 0, heightMm: 24 },
        nativeRaster: { pixelWidth: 6000, pixelHeight: 4000 }
      })
    ).toThrow("imagingArea.widthMm");

    expect(() =>
      calculateSensorGeometryMetrics({
        imagingArea: { widthMm: 36, heightMm: 24 },
        nativeRaster: { pixelWidth: 6000.5, pixelHeight: 4000 }
      })
    ).toThrow("nativeRaster.pixelWidth");

    expect(() =>
      calculateSensorGeometryMetrics({
        imagingArea: { widthMm: 36, heightMm: 24 },
        nativeRaster: {
          pixelWidth: Number.MAX_SAFE_INTEGER,
          pixelHeight: 2
        }
      })
    ).toThrow("total image-sample count");
  });

  it("records assumptions that prevent photosite-area and digital-crop misuse", () => {
    const result = calculateSensorGeometryMetrics({
      imagingArea: { widthMm: 36, heightMm: 24 },
      nativeRaster: { pixelWidth: 6000, pixelHeight: 4000 }
    });

    expect(result.provenance.kind).toBe("calculated");
    expect(result.provenance.assumptions).toEqual(
      expect.arrayContaining([
        expect.stringContaining("crop factor is diagonal-based"),
        expect.stringContaining("effective image raster"),
        expect.stringContaining("not physical photodiode active area")
      ])
    );
  });
});
