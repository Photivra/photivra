// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { calculateCenteredCrop, calculateSubjectFramingCrop } from "../src/index.js";

// Independent oracles use exact integer arithmetic on rational crop factors p/q.
function floorDiv(numerator: number, denominator: number): number {
  return Number(BigInt(numerator) / BigInt(denominator));
}

/** Nearest integer to a/b with halves rounded up, matching Math.round for positive values. */
function roundDiv(numerator: number, denominator: number): number {
  return Number((2n * BigInt(numerator) + BigInt(denominator)) / (2n * BigInt(denominator)));
}

function expectedCenteredCrop(width: number, height: number, p: number, q: number): [number, number] {
  const landscape = width >= height;
  const shortSource = landscape ? height : width;
  const longSource = landscape ? width : height;
  const shortAxis = Math.max(1, floorDiv(shortSource * q, p));
  const longAxis = Math.max(1, Math.min(floorDiv(longSource * q, p), roundDiv(shortAxis * longSource, shortSource)));
  return landscape ? [longAxis, shortAxis] : [shortAxis, longAxis];
}

describe("centered crop integer rounding (#276)", () => {
  it("keeps 6000x4000 at 1.7x exactly 3:2 instead of flooring each axis separately", () => {
    const landscape = calculateCenteredCrop({ pixelWidth: 6000, pixelHeight: 4000, cropFactor: 1.7 }).value;
    expect([landscape.pixelWidth, landscape.pixelHeight]).toEqual([3528, 2352]);
    expect(landscape.pixelWidth / landscape.pixelHeight).toBe(1.5);
    const portrait = calculateCenteredCrop({ pixelWidth: 4000, pixelHeight: 6000, cropFactor: 1.7 }).value;
    expect([portrait.pixelWidth, portrait.pixelHeight]).toEqual([2352, 3528]);
  });

  it("matches an exact-integer oracle and never keeps more than 1/cropFactor of either axis", () => {
    const sizes: [number, number][] = [[6000, 4000], [4000, 6000], [8192, 5464], [4480, 2520], [1920, 1080], [1001, 999], [7, 3], [3, 7], [1, 1], [5, 5]];
    const factors: [number, number][] = [[1, 1], [3, 2], [17, 10], [2, 1], [7, 3], [1001, 1000], [10, 1], [1000, 1]];
    for (const [width, height] of sizes) {
      for (const [p, q] of factors) {
        const crop = calculateCenteredCrop({ pixelWidth: width, pixelHeight: height, cropFactor: p / q }).value;
        const [expectedWidth, expectedHeight] = expectedCenteredCrop(width, height, p, q);
        expect([crop.pixelWidth, crop.pixelHeight], `${width}x${height} at ${p}/${q}`).toEqual([expectedWidth, expectedHeight]);
        expect(crop.pixelWidth).toBeLessThanOrEqual(Math.max(1, floorDiv(width * q, p)));
        expect(crop.pixelHeight).toBeLessThanOrEqual(Math.max(1, floorDiv(height * q, p)));
        const shortAxis = Math.min(crop.pixelWidth, crop.pixelHeight);
        // The derived longer axis is within one pixel of the exact source ratio, unless the
        // crop is so extreme that the shorter axis is clamped to its 1-pixel minimum.
        if (floorDiv(Math.min(width, height) * q, p) >= 1) expect(Math.abs(crop.pixelWidth / crop.pixelHeight - width / height) * shortAxis).toBeLessThan(1 + 1e-12);
        expect(crop.retainedAreaFraction).toBe((crop.pixelWidth * crop.pixelHeight) / (width * height));
      }
    }
  });

  it("returns the original dimensions for cropFactor 1", () => {
    for (const [width, height] of [[6000, 4000], [4000, 6000], [6001, 3999], [1, 9]] as const) {
      const crop = calculateCenteredCrop({ pixelWidth: width, pixelHeight: height, cropFactor: 1 }).value;
      expect([crop.pixelWidth, crop.pixelHeight]).toEqual([width, height]);
    }
  });
});

describe("subject framing crop integer rounding (#276)", () => {
  it("does not drop a pixel at H=9 with a 7 px subject at fraction 1", () => {
    const result = calculateSubjectFramingCrop({ pixelWidth: 13, pixelHeight: 9, subjectHeightPixels: 7, targetSubjectHeightFraction: 1 }).value;
    expect(result.pixelHeight).toBe(7);
    expect(result.subjectHeightFraction).toBe(1);
    expect(result.subjectClipped).toBe(false);
  });

  it("never clips an integer subject at fraction 1 for any height in common sensor rasters", () => {
    for (const height of [9, 4000, 4480, 6000]) {
      const width = Math.round(height * 1.5);
      for (let subject = 1; subject < height; subject += 1) {
        const result = calculateSubjectFramingCrop({ pixelWidth: width, pixelHeight: height, subjectHeightPixels: subject, targetSubjectHeightFraction: 1 }).value;
        if (result.pixelHeight !== subject || result.subjectClipped) {
          expect({ height, subject, pixelHeight: result.pixelHeight, clipped: result.subjectClipped }).toEqual({ height, subject, pixelHeight: subject, clipped: false });
        }
        if (result.pixelWidth !== roundDiv(subject * width, height)) {
          expect({ height, subject, pixelWidth: result.pixelWidth }).toEqual({ height, subject, pixelWidth: roundDiv(subject * width, height) });
        }
      }
    }
  });

  it("uses the largest whole-pixel height within the requested crop for rational targets", () => {
    // target = a/b, requested crop = subject * b / a, expected height = floor(subject * b / a).
    const targets: [number, number][] = [[1, 2], [9, 10], [3, 10], [7, 9], [2, 3], [99, 100]];
    for (const [a, b] of targets) {
      for (const subject of [1, 2, 3, 7, 10, 333, 1000, 1999, 2828]) {
        const requestedTimesA = subject * b;
        if (requestedTimesA >= 4000 * a) continue; // no additional crop
        const result = calculateSubjectFramingCrop({ pixelWidth: 6000, pixelHeight: 4000, subjectHeightPixels: subject, targetSubjectHeightFraction: a / b }).value;
        const expectedHeight = Math.max(subject, floorDiv(requestedTimesA, a));
        expect(result.pixelHeight, `${subject} at ${a}/${b}`).toBe(expectedHeight);
        expect(result.pixelWidth).toBe(roundDiv(expectedHeight * 6000, 4000));
        expect(result.subjectHeightFraction).toBeGreaterThanOrEqual(a / b - 1e-15);
        expect(result.subjectClipped).toBe(false);
        expect(result.cropped).toBe(true);
      }
    }
  });

  it("never clips a fractional-pixel subject that fits", () => {
    const result = calculateSubjectFramingCrop({ pixelWidth: 15, pixelHeight: 10, subjectHeightPixels: 6.5, targetSubjectHeightFraction: 1 }).value;
    expect(result.pixelHeight).toBe(7);
    expect(result.pixelWidth).toBe(11);
    expect(result.subjectClipped).toBe(false);
    expect(result.subjectHeightFraction).toBeCloseTo(6.5 / 7, 15);
  });
});
