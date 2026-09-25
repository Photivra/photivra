import { describe, expect, it } from "vitest";

import {
  calculateEquivalentFocalLength35Mm,
  calculateImagingAreaMetrics,
  resolveCaptureGeometry
} from "../src/index.js";

describe("35 mm-equivalent focal length", () => {
  it("keeps actual and equivalent focal length equal on 36 × 24 mm capture", () => {
    const result = calculateEquivalentFocalLength35Mm({
      focalLengthMm: 50,
      activeImagingArea: { widthMm: 36, heightMm: 24 }
    });

    expect(result.value.actualFocalLengthMm).toBe(50);
    expect(result.value.equivalentFocalLength35Mm).toBeCloseTo(50, 12);
    expect(result.value.cropFactor35Mm).toBeCloseTo(1, 12);
    expect(result.value.basis).toBe("diagonal");
  });

  it("increases equivalent focal length on a smaller active area without changing the physical lens", () => {
    const result = calculateEquivalentFocalLength35Mm({
      focalLengthMm: 50,
      activeImagingArea: { widthMm: 23.5, heightMm: 15.6 }
    }).value;

    expect(result.actualFocalLengthMm).toBe(50);
    expect(result.equivalentFocalLength35Mm).toBeGreaterThan(50);
    expect(result.equivalentFocalLength35Mm).toBeCloseTo(
      50 * result.cropFactor35Mm,
      12
    );
  });

  it("uses active capture geometry from the coordinate pipeline", () => {
    const geometry = resolveCaptureGeometry({
      imagingArea: { widthMm: 36, heightMm: 24 },
      nativeRaster: { pixelWidth: 6000, pixelHeight: 4000 },
      orientation: "landscape",
      activeCaptureRect: {
        x: 1000,
        y: 666,
        width: 4000,
        height: 2668
      }
    }).value;

    const result = calculateEquivalentFocalLength35Mm({
      focalLengthMm: 50,
      activeImagingArea: geometry.activeCapture.imagingArea
    }).value;

    expect(result.actualFocalLengthMm).toBe(50);
    expect(result.equivalentFocalLength35Mm).toBeCloseTo(75, 1);
  });

  it("does not change equivalent focal length when only output resolution/crop changes", () => {
    const base = resolveCaptureGeometry({
      imagingArea: { widthMm: 36, heightMm: 24 },
      nativeRaster: { pixelWidth: 6000, pixelHeight: 4000 },
      orientation: "landscape"
    }).value;

    const digitalOutput = resolveCaptureGeometry({
      imagingArea: { widthMm: 36, heightMm: 24 },
      nativeRaster: { pixelWidth: 6000, pixelHeight: 4000 },
      orientation: "landscape",
      outputCropRect: {
        x: 1000,
        y: 875,
        width: 4000,
        height: 2250
      },
      outputRaster: {
        pixelWidth: 1920,
        pixelHeight: 1080
      }
    }).value;

    const baseEquivalent = calculateEquivalentFocalLength35Mm({
      focalLengthMm: 50,
      activeImagingArea: base.activeCapture.imagingArea
    }).value.equivalentFocalLength35Mm;
    const outputEquivalent = calculateEquivalentFocalLength35Mm({
      focalLengthMm: 50,
      activeImagingArea: digitalOutput.activeCapture.imagingArea
    }).value.equivalentFocalLength35Mm;

    expect(outputEquivalent).toBeCloseTo(baseEquivalent, 12);
  });

  it("is invariant to physical camera orientation because diagonal is invariant", () => {
    const landscape = resolveCaptureGeometry({
      imagingArea: { widthMm: 36, heightMm: 24 },
      nativeRaster: { pixelWidth: 6000, pixelHeight: 4000 },
      orientation: "landscape"
    }).value;
    const portrait = resolveCaptureGeometry({
      imagingArea: { widthMm: 36, heightMm: 24 },
      nativeRaster: { pixelWidth: 6000, pixelHeight: 4000 },
      orientation: "portrait-clockwise"
    }).value;

    const a = calculateEquivalentFocalLength35Mm({
      focalLengthMm: 35,
      activeImagingArea: landscape.orientedCapture.imagingArea
    }).value;
    const b = calculateEquivalentFocalLength35Mm({
      focalLengthMm: 35,
      activeImagingArea: portrait.orientedCapture.imagingArea
    }).value;

    expect(b.equivalentFocalLength35Mm).toBeCloseTo(
      a.equivalentFocalLength35Mm,
      12
    );
  });

  it("supports real few-millimetre phone focal lengths without replacing them", () => {
    const result = calculateEquivalentFocalLength35Mm({
      focalLengthMm: 4.5,
      activeImagingArea: { widthMm: 6.17, heightMm: 4.55 }
    }).value;

    expect(result.actualFocalLengthMm).toBe(4.5);
    expect(result.equivalentFocalLength35Mm).toBeGreaterThan(20);
    expect(result.equivalentFocalLength35Mm).toBeLessThan(30);
  });

  it("reuses the canonical imaging-area crop factor", () => {
    const area = { widthMm: 23.5, heightMm: 15.6 };
    const crop = calculateImagingAreaMetrics(area).value.cropFactor35Mm;
    const equivalent = calculateEquivalentFocalLength35Mm({
      focalLengthMm: 50,
      activeImagingArea: area
    }).value;

    expect(equivalent.cropFactor35Mm).toBeCloseTo(crop, 12);
  });

  it("rejects invalid focal length and records output-crop separation", () => {
    expect(() =>
      calculateEquivalentFocalLength35Mm({
        focalLengthMm: 0,
        activeImagingArea: { widthMm: 36, heightMm: 24 }
      })
    ).toThrow("focalLengthMm");

    const result = calculateEquivalentFocalLength35Mm({
      focalLengthMm: 50,
      activeImagingArea: { widthMm: 36, heightMm: 24 }
    });

    expect(result.provenance.assumptions).toEqual(
      expect.arrayContaining([
        expect.stringContaining("diagonal-based"),
        expect.stringContaining("Actual focal length remains"),
        expect.stringContaining("Digital/output cropping")
      ])
    );
  });
});
