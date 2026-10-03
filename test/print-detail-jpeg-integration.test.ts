// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { calculatePrintRegionDetail, createPhotographicExportPair, ENGINE_API_VERSION, type PrintRegionDetailInput } from "../src/index.js";
import { PRINT_DETAIL_JPEG_CASES, printDetailJpegInput } from "./helpers/print-detail-jpeg-fixture.js";

const root = new URL("./fixtures/print-detail/jpeg/", import.meta.url);
const manifestBytes = readFileSync(new URL("export-manifest.json", root));
interface Measurement { mean: number; amplitude: number; modulation: number; residual: number }
const manifest = JSON.parse(manifestBytes.toString()) as { cases: {
  name: string; engineCandidate: string; captureId: string; documentIds: string[]; raster: { pixelWidth: number; pixelHeight: number }; jpegSha256: string; preEncodeRgb: number[];
  nativeRawCodes: number[]; referenceModulation: number; roi: { x: number; y: number; width: number; height: number };
  cyclesAcrossRegion: { x: number; y: number } }[] };
const reference = JSON.parse(readFileSync(new URL("independent-reference.json", root), "utf8")) as {
  manifestSha256: string; cases: { name: string; jpegSha256: string; decodedRgbUint8Sha256: string;
    decodedRgb: number[]; roiSamples: number[]; roiFloat64LeSha256: string; preEncode: Measurement; decoded: Measurement }[] };
const sha = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
function floatHash(samples: readonly number[]): string {
  const bytes = Buffer.alloc(samples.length * 8);
  samples.forEach((v, i) => bytes.writeDoubleLE(v, i * 8));
  return sha(bytes);
}
const inverseTransfer = (code: number): number => {
  const s = code / 255;
  return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
};

it("binds the independent decoder record to the exact manifest and complete case family", () => {
  expect(sha(manifestBytes)).toBe(reference.manifestSha256);
  expect(manifest.cases.map(c => c.name)).toEqual(PRINT_DETAIL_JPEG_CASES.map(c => c.name));
  expect(reference.cases.map(c => c.name)).toEqual(PRINT_DETAIL_JPEG_CASES.map(c => c.name));
  expect(new Set(manifest.cases.flatMap(c => c.documentIds)).size).toBe(32);
  expect(new Set(manifest.cases.map(c => c.captureId)).size).toBe(4);
});

it.each(PRINT_DETAIL_JPEG_CASES)("measures exact independently decoded public JPEG in $name", async scenario => {
  const m = manifest.cases.find(c => c.name === scenario.name)!, r = reference.cases.find(c => c.name === scenario.name)!;
  const input = printDetailJpegInput(scenario.orientation, scenario.quantizationStep, m.engineCandidate), before = JSON.stringify(input);
  const pair = await createPhotographicExportPair(input), jpeg = readFileSync(new URL(scenario.name + ".jpg", root));
  expect(pair.jpeg.bytes).toEqual(new Uint8Array(jpeg));
  expect(sha(jpeg)).toBe(m.jpegSha256); expect(r.jpegSha256).toBe(pair.jpeg.sha256);
  expect(pair.source.value.rawFrame.samples.map(s => s.rawCode)).toEqual(m.nativeRawCodes);
  expect(pair.source.value.rawFrame.capture.captureId).toBe(m.captureId);
  expect([input.metadata.raw.documentId, input.metadata.raw.instanceId, input.metadata.jpeg.documentId, input.metadata.jpeg.instanceId]).toEqual(m.documentIds);
  expect(pair.rendering.value.integerSamples).toEqual(m.preEncodeRgb);
  expect(pair.processedOutputView.pixelWidth).toBe(m.raster.pixelWidth);
  expect(pair.processedOutputView.pixelHeight).toBe(m.raster.pixelHeight);
  expect(r.decodedRgb).toHaveLength(m.raster.pixelWidth * m.raster.pixelHeight * 3);
  expect(sha(Uint8Array.from(r.decodedRgb))).toBe(r.decodedRgbUint8Sha256);
  expect(floatHash(r.roiSamples)).toBe(r.roiFloat64LeSha256);
  const luminance = Array.from({ length: r.decodedRgb.length / 3 }, (_, i) => {
    const red = r.decodedRgb[i * 3]!;
    expect(Number.isInteger(red) && red >= 0 && red <= 255).toBe(true);
    expect(r.decodedRgb[i * 3 + 1]).toBe(red); expect(r.decodedRgb[i * 3 + 2]).toBe(red);
    return inverseTransfer(red); // Equal linear channels: neutral relative luminance only.
  });
  const samples = Array.from({ length: m.roi.width * m.roi.height }, (_, i) =>
    luminance[(m.roi.y + Math.floor(i / m.roi.width)) * m.raster.pixelWidth + m.roi.x + i % m.roi.width]!);
  samples.forEach((v, i) => expect(Math.abs(v - r.roiSamples[i]!)).toBeLessThan(1e-12));
  const assessment: PrintRegionDetailInput = { assessmentId: "assessment-" + scenario.name, print: {
    source: { kind: "native-retained", captureId: input.reconstruction.rawFrame.capture.captureId, geometry: input.reconstruction.rawFrame.capture.geometry },
    printedImage: { width: m.raster.pixelWidth, height: m.raster.pixelHeight, unit: "inches" }, viewingDistance: { value: 24, unit: "inches" },
    sampling: { kind: "manual-ppi", pixelsPerInch: 1 }, fit: { kind: "confirmed-native-aspect", maximumRelativeAspectError: 1e-12 } },
    source: { captureId: input.reconstruction.rawFrame.capture.captureId, representationId: scenario.name,
      contentSha256: floatHash(luminance), raster: m.raster, stage: "post-encoding-decoded-linear", domain: "relative-linear-luminance",
      registration: "oriented-retained-unwarped", processing: { id: "owned-pillow-neutral-readback", version: "0.1.0" }, noiseRealizationId: null,
      evidence: [{ sourceOrigin: "photivra", sourceReference: "owned-post-adc-tile-grating-0.1.0", reuseStatus: "photivra-owned" }] },
    region: { id: "registered-jpeg-roi", rect: m.roi, role: "field-diagnostic", subjectDistanceM: null, focusDistanceM: null },
    target: { id: "owned-tile-grating-fundamental", version: "0.1.0", kind: "coherent-sinusoid",
      cyclesAcrossRegion: m.cyclesAcrossRegion, referenceModulation: m.referenceModulation }, samples };
  const result = calculatePrintRegionDetail(assessment).value;
  expect(result.status).toBe("diagnostic-only");
  const actual = result.measurement!;
  for (const [a, b] of [[actual.meanRelativeLuminance, r.decoded.mean],
    [actual.fundamentalAmplitudeRelativeLuminance, r.decoded.amplitude], [actual.fundamentalModulation, r.decoded.modulation],
    [actual.unexplainedResidualRmsRelativeToMean, r.decoded.residual], [actual.declaredGratingTransfer, r.decoded.modulation / m.referenceModulation]]) {
    expect(Math.abs(a! - b!)).toBeLessThan(1e-10);
  }
  if (scenario.quantizationStep === 32) expect(Math.abs(actual.fundamentalModulation - r.preEncode.modulation)).toBeGreaterThan(1e-10);
  else expect(Math.abs(actual.fundamentalModulation - r.preEncode.modulation)).toBeLessThan(1e-10);
  expect(result.input.source.contentSha256).toBe(floatHash(luminance));
  expect(result.sourceArtifactVerification).toBe("caller-declared-unverified");
  expect(result.unassessed).toEqual(expect.arrayContaining(["compression", "perceived-quality", "noise", "captured-system-mtf"]));
  expect(result.overallPrintVerdict).toBe("not-offered"); expect(result.assurance.scientificStatus).toBe("unknown");
  expect(JSON.stringify(input)).toBe(before);
});

it.each(["landscape", "portrait-clockwise", "landscape-inverted", "portrait-counter-clockwise"])("separates encoded-stage detail from unchanged native pixels in %s", orientation => {
  const a = manifest.cases.find(c => c.name === orientation + "-q1")!, b = manifest.cases.find(c => c.name === orientation + "-q32")!;
  const ar = reference.cases.find(c => c.name === a.name)!, br = reference.cases.find(c => c.name === b.name)!;
  expect(a.nativeRawCodes).toEqual(b.nativeRawCodes); expect(a.preEncodeRgb).toEqual(b.preEncodeRgb);
  expect(a.captureId).toBe(b.captureId);
  expect(a.raster).toEqual(b.raster); expect(a.jpegSha256).not.toBe(b.jpegSha256);
  expect(ar.preEncode).toEqual(br.preEncode); expect(ar.decoded.modulation).not.toBe(br.decoded.modulation);
});


it("preserves archived creator replay while current exports record their actual engine", async () => {
  const scenario = PRINT_DETAIL_JPEG_CASES[0]!, m = manifest.cases[0]!;
  const archived = await createPhotographicExportPair(printDetailJpegInput(scenario.orientation, scenario.quantizationStep, m.engineCandidate));
  const current = await createPhotographicExportPair(printDetailJpegInput(scenario.orientation, scenario.quantizationStep));
  expect(archived.source.value.rawFrame.capture.engineApiVersion).toBe(m.engineCandidate);
  expect(current.source.value.rawFrame.capture.engineApiVersion).toBe(ENGINE_API_VERSION);
  expect(current.rendering.value.integerSamples).toEqual(archived.rendering.value.integerSamples);
  if (ENGINE_API_VERSION !== m.engineCandidate) expect(current.jpeg.sha256).not.toBe(archived.jpeg.sha256);
});
