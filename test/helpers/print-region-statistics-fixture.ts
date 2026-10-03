// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import type { PrintRegionRaster, PrintRegionDifferenceInput, PrintRegionNoiseInput } from "../../src/index.js";

/** Exact row-major scalar artifact encoding used by the owned backend evidence. */
export function scalarRasterSha256(samples: readonly number[]): string {
  const bytes = Buffer.alloc(samples.length * 8);
  samples.forEach((v, i) => bytes.writeDoubleLE(v, i * 8));
  return createHash("sha256").update(bytes).digest("hex");
}

/** Scalar linear samples with owned analytic signal identity; no sensor calibration. */
export function statisticsFrame(samples: readonly number[], capture = "owned-capture", representation = "owned-before", realization: string | null = null): PrintRegionRaster {
  return {
    print: { source: { kind: "native-retained", captureId: capture, geometry: { imagingArea: { widthMm: 32, heightMm: 8 },
      nativeRaster: { pixelWidth: samples.length, pixelHeight: 1 }, orientation: "landscape" } },
      printedImage: { width: samples.length, height: 1, unit: "inches" }, viewingDistance: { value: 24, unit: "inches" },
      sampling: { kind: "manual-ppi", pixelsPerInch: 1 }, fit: { kind: "confirmed-native-aspect", maximumRelativeAspectError: 0 } },
    source: { captureId: capture, representationId: representation, contentSha256: scalarRasterSha256(samples),
      raster: { pixelWidth: samples.length, pixelHeight: 1 }, stage: "native-retained-linear", domain: "relative-linear-luminance",
      registration: "oriented-retained-unwarped", processing: { id: "owned-scalar-reference", version: "0.1.0" },
      noiseRealizationId: realization, evidence: [{ sourceOrigin: "photivra", sourceReference: "owned-finite-statistics-reference", reuseStatus: "photivra-owned" }] },
    region: { id: "selected-region", rect: { x: 0, y: 0, width: samples.length, height: 1 }, role: "selected-subject", subjectDistanceM: null, focusDistanceM: null },
    samples: [...samples]
  };
}
export function statisticsDifference(before = [.2, .2, .8, .8], after = [.2, .1, .9, .8]): PrintRegionDifferenceInput {
  return { assessmentId: "owned-processing-difference", before: statisticsFrame(before), after: statisticsFrame(after, "owned-capture", "owned-after"),
    purpose: "processing-change", realizationPolicy: "deterministic-reference", referenceRange: { lowerRelativeLuminance: .2, upperRelativeLuminance: .8 } };
}
export function statisticsNoise(frames = [[-2, 2, 5, 0], [-1, 3, 3, 2], [0, 4, 4, 1]]): PrintRegionNoiseInput {
  return { assessmentId: "owned-repeat-noise", ensembleId: "owned-ensemble", stationarySceneId: "owned-stationary-scene",
    repeatPolicy: "independent-stationary-captures", frames: frames.map((values, i) => statisticsFrame(values, `capture-${i}`, `representation-${i}`, `noise-${i}`)) };
}
