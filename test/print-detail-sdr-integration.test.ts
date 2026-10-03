// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { calculateCaptureSdr, createSimulatedCapture, calculatePrintRegionDetail, LINEAR_CAPTURE_RGB_PROFILE,
  resolveCaptureColorModel, type CaptureOrientation, type PrintRegionDetailInput } from "../src/index.js";
import { loadLinearCaptureInput } from "./helpers/linear-capture-fixture.js";

const bytes = readFileSync(new URL("./fixtures/print-detail/quarter-grating.json", import.meta.url));
const target = JSON.parse(bytes.toString()) as { pixelWidth: number; pixelHeight: number; samples: number[] };
const reference = JSON.parse(readFileSync(new URL("./fixtures/print-detail/sdr-reference.json", import.meta.url), "utf8")) as {
  sourceArtifactSha256: string; cases: { orientation: CaptureOrientation; bitDepth: 8 | 16;
    raster: { pixelWidth: number; pixelHeight: number }; rgbFloat64LeSha256: string; codesUint16LeSha256: string;
    decodedLevels: number[]; levelCodes: number[]; expectedMean: number; expectedModulation: number }[];
};
function hash(samples: readonly number[], integer = false): string {
  const b = Buffer.alloc(samples.length * (integer ? 2 : 8));
  samples.forEach((v, i) => integer ? b.writeUInt16LE(v, i * 2) : b.writeDoubleLE(v, i * 8));
  return createHash("sha256").update(b).digest("hex");
}

it("verifies committed source bytes and explicit target truth before backend execution", () => {
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(reference.sourceArtifactSha256);
  expect(target.samples).toHaveLength(16 * 12);
  target.samples.forEach((v, i) => expect(v).toBe([.6, .4, .2, .4][i % 4]));
});

it.each(reference.cases)("executes capture SDR and selected decoded ROI in $orientation / $bitDepth bit", c => {
  const { pixelWidth: w, pixelHeight: h } = c.raster;
  // Owned discrete permutation establishes plane registration; the adapter itself does not rotate.
  const rgb = Array.from({ length: w * h }, (_, i) => {
    const x = i % w, y = Math.floor(i / w);
    const [nx, ny] = { landscape: [x, y], "portrait-clockwise": [y, 11 - x],
      "landscape-inverted": [15 - x, 11 - y], "portrait-counter-clockwise": [15 - y, x] }[c.orientation];
    return Array<number>(3).fill(target.samples[ny! * 16 + nx!]!);
  }).flat();
  expect(hash(rgb)).toBe(c.rgbFloat64LeSha256);
  const raw = loadLinearCaptureInput();
  raw.captureId = "owned-grating-capture";
  raw.geometry = { imagingArea: { widthMm: 32, heightMm: 24 }, nativeRaster: { pixelWidth: 16, pixelHeight: 12 },
    orientation: c.orientation, outputRaster: c.raster };
  raw.source = { kind: "scene-linear-master", artifactId: "owned-quarter-grating", sha256: reference.sourceArtifactSha256, dynamicRangeHistory: "unknown" };
  raw.planes = [{ ...raw.planes[0]!, pixelWidth: w, pixelHeight: h, imageState: "color-transformed-linear-rgb",
    channelIds: ["red", "green", "blue"], colorProfile: LINEAR_CAPTURE_RGB_PROFILE,
    encodingReferenceWhiteXyz: resolveCaptureColorModel().referenceWhiteXyz,
    appliedTransforms: [{ profile: { id: "owned-neutral-target-encoding", version: "0.1.0" }, kind: "linear-color" }],
    storage: { kind: "inline-float64", samples: rgb } }];
  const capture = createSimulatedCapture(raw).value, before = JSON.stringify(capture);
  const result = calculateCaptureSdr({ capture, sourcePlaneId: "source", color: { kind: "already-transformed" },
    profile: { schemaVersion: "0.1.0", profileId: "owned-neutral-sdr", profileVersion: "1", renderingExposureEv: 0,
      toneCurve: "identity", gamutHandling: "reject-out-of-range", outputDynamicRange: "sdr", transferFunction: "srgb",
      bitDepth: c.bitDepth, rounding: "nearest-ties-up", dither: "none" } }).value;
  const rendering = result.rendering.value;
  expect(hash(rendering.integerSamples, true)).toBe(c.codesUint16LeSha256);
  expect([...new Set(rendering.integerSamples)].sort((a, b) => a - b)).toEqual([...c.levelCodes].sort((a, b) => a - b));
  // Test-only readback of quantized transfer codes; no JPEG or platform decoder qualification.
  const decoded = rendering.integerSamples.map(k => {
    const s = k / (2 ** c.bitDepth - 1);
    return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
  });
  // libm power results may differ in the final bit across supported runtimes.
  expect(decoded.every(Number.isFinite)).toBe(true);
  decoded.forEach((v, i) => {
    const level = c.levelCodes.indexOf(rendering.integerSamples[i]!);
    expect(level).toBeGreaterThanOrEqual(0);
    expect(Math.abs(v - c.decodedLevels[level]!)).toBeLessThan(1e-12);
  });
  const roi = { x: 2, y: 2, width: 8, height: 8 };
  const samples = Array.from({ length: 64 }, (_, i) => decoded[((roi.y + Math.floor(i / 8)) * w + roi.x + i % 8) * 3]!);
  const assessment: PrintRegionDetailInput = { assessmentId: "owned-sdr-assessment", print: {
    source: { kind: "native-retained", captureId: capture.captureId, geometry: raw.geometry },
    printedImage: { width: w, height: h, unit: "inches" }, viewingDistance: { value: 24, unit: "inches" },
    sampling: { kind: "manual-ppi", pixelsPerInch: 1 }, fit: { kind: "confirmed-native-aspect", maximumRelativeAspectError: 1e-12 } },
    source: { captureId: capture.captureId, representationId: "owned-decoded-sdr", contentSha256: hash(decoded), raster: c.raster,
      stage: "post-encoding-decoded-linear", domain: "relative-linear-luminance", registration: "oriented-retained-unwarped",
      processing: { id: "capture-sdr-test-readback", version: "0.1.0" }, noiseRealizationId: null,
      evidence: [{ sourceOrigin: "photivra", sourceReference: "owned-quarter-grating-0.1.0", reuseStatus: "photivra-owned" }] },
    region: { id: "off-center-roi", rect: roi, role: "selected-subject", subjectDistanceM: null, focusDistanceM: null },
    target: { id: "owned-quarter-grating", version: "0.1.0", kind: "coherent-sinusoid", referenceModulation: .5,
      cyclesAcrossRegion: c.orientation.startsWith("portrait") ? { x: 0, y: 2 } : { x: 2, y: 0 } }, samples };
  const detail = calculatePrintRegionDetail(assessment).value;
  expect(detail.status).toBe("diagnostic-only");
  expect(Math.abs(detail.measurement!.meanRelativeLuminance - c.expectedMean)).toBeLessThan(1e-12);
  expect(Math.abs(detail.measurement!.fundamentalModulation - c.expectedModulation)).toBeLessThan(1e-12);
  expect(Math.abs(detail.measurement!.declaredGratingTransfer - c.expectedModulation / .5)).toBeLessThan(1e-12);
  expect(detail.input.source.contentSha256).toBe(hash(decoded));
  expect(detail.sourceArtifactVerification).toBe("caller-declared-unverified");
  expect(detail.unassessed).toContain("compression"); expect(detail.overallPrintVerdict).toBe("not-offered");
  expect(JSON.stringify(capture)).toBe(before);
});
