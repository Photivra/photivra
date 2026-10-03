// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { calculatePrintPlan } from "../src/index.js";
import { printDetailJpegInput } from "./helpers/print-detail-jpeg-fixture.js";

const root = new URL("./fixtures/print-detail/", import.meta.url);
const bytes = readFileSync(new URL("proof-layout-reference.json", root));
const inspectedBytes = readFileSync(new URL("proof-inspection-reference.json", root));
const sha = (v: Uint8Array): string => createHash("sha256").update(v).digest("hex");
const reference = JSON.parse(bytes.toString()) as { pdfPath: string; pdfSha256: string; placements: {
  page: number; sourceName: string; captureId: string; jpegSha256: string; archivedCreatorVersion: string;
  fullWidthInches: number; printedCropMm: number[]; roi: { x: number; y: number; width: number; height: number };
}[] };
const inspection = JSON.parse(inspectedBytes.toString()) as { pdfSha256: string; inspectedPages: number; placements: {
  printedCropMm: number[]; jpegSha256: string; interpolationRequested: boolean;
}[] };
it("binds the PDF, independently inspected graphics/DCT record and archived JPEG identity", () => {
  expect(sha(bytes)).toBe("a226c12708d0bff77023dcb57578492bd018314985ff850ba6086fa29fb2cb3d");
  expect(sha(inspectedBytes)).toBe("7595e8ec64145db879b42384c6f440b03b4eb3edde6ba89fb7d40a01fad47b7e");
  expect(sha(readFileSync(new URL("../" + reference.pdfPath, import.meta.url)))).toBe(reference.pdfSha256);
  expect(inspection.pdfSha256).toBe(reference.pdfSha256); expect(inspection.inspectedPages).toBe(2);
  expect(reference.placements[0]!.jpegSha256).toBe(reference.placements[1]!.jpegSha256);
  expect(reference.placements[2]!.printedCropMm).toEqual(reference.placements[3]!.printedCropMm);
  expect(reference.placements[2]!.captureId).toBe(reference.placements[3]!.captureId);
});
it.each(reference.placements)("matches independently inspected crop scale on page $page for $sourceName at $fullWidthInches inch full width", p => {
  const quantizer = p.sourceName.endsWith("q32") ? 32 : 1;
  const input = printDetailJpegInput("landscape", quantizer, p.archivedCreatorVersion);
  const capture = input.reconstruction.rawFrame.capture;
  expect(capture.captureId).toBe(p.captureId); expect(capture.engineApiVersion).toBe("1.1.0");
  expect(sha(readFileSync(new URL("jpeg/" + p.sourceName + ".jpg", root)))).toBe(p.jpegSha256);
  const plan = calculatePrintPlan({ source: { kind: "native-retained", captureId: p.captureId,
    geometry: { imagingArea: capture.geometry.imagingArea, nativeRaster: capture.geometry.nativeRaster,
      orientation: "landscape", outputCropRect: p.roi } },
    printedImage: { width: p.printedCropMm[0]!, height: p.printedCropMm[1]!, unit: "mm" },
    viewingDistance: { value: 24, unit: "inches" }, sampling: { kind: "manual-ppi", pixelsPerInch: 1 },
    fit: { kind: "confirmed-native-aspect", maximumRelativeAspectError: 1e-12 } }).value;
  const i = reference.placements.indexOf(p), actual = inspection.placements[i]!;
  expect(plan.status).toBe("ready");
  expect(plan.printedImageMm).toEqual({ width: actual.printedCropMm[0], height: actual.printedCropMm[1] });
  expect(plan.native!.raster).toEqual({ pixelWidth: 16, pixelHeight: 8 });
  expect(plan.native!.pixelsPerInch.x).toBeCloseTo(20 / p.fullWidthInches, 12);
  expect(plan.native!.pixelsPerInch.y).toBeCloseTo(20 / p.fullWidthInches, 12);
  expect(actual.interpolationRequested).toBe(false);
  expect(plan.capturedDetailAssessment).toBe("unassessed"); expect(plan.deliveryAssessment).toBe("unassessed");
});
