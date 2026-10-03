// SPDX-License-Identifier: Apache-2.0
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createPhotographicExportPair, ENGINE_API_VERSION } from "../src/index.js";
import { printDetailJpegInput, PRINT_DETAIL_JPEG_CASES } from "../test/helpers/print-detail-jpeg-fixture.js";

const directory = process.argv[2];
if (!directory) throw Error("Supply a JPEG evidence directory.");
await mkdir(directory, { recursive: true });
const cases = [];
for (const scenario of PRINT_DETAIL_JPEG_CASES) {
  const input = printDetailJpegInput(scenario.orientation, scenario.quantizationStep);
  const pair = await createPhotographicExportPair(input);
  await writeFile(path.join(directory, scenario.name + ".jpg"), pair.jpeg.bytes);
  cases.push({ ...scenario, engineCandidate: ENGINE_API_VERSION, jpegSha256: pair.jpeg.sha256,
    captureId: input.reconstruction.rawFrame.capture.captureId,
    documentIds: [input.metadata.raw.documentId, input.metadata.raw.instanceId, input.metadata.jpeg.documentId, input.metadata.jpeg.instanceId],
    raster: { pixelWidth: pair.processedOutputView.pixelWidth, pixelHeight: pair.processedOutputView.pixelHeight },
    preEncodeRgb: pair.rendering.value.integerSamples,
    nativeRawCodes: pair.source.value.rawFrame.samples.map(s => s.rawCode),
    referenceModulation: .5 * Math.cos(Math.PI / 8),
    roi: scenario.orientation.startsWith("portrait") ? { x: 2, y: 2, width: 8, height: 16 } : { x: 2, y: 2, width: 16, height: 8 },
    cyclesAcrossRegion: scenario.orientation.startsWith("portrait") ? { x: 0, y: 2 } : { x: 2, y: 0 } });
}
// Keep numeric pixel/code arrays compact so the independent records remain reviewable.
const manifest = JSON.stringify({ evidenceVersion: "0.1.0", cases }, null, 2)
  .replace(/\[\s*([\d.eE+,\-\s]+)\]/g, (_, numbers: string) => "[" + numbers.split(",").map(v => v.trim()).join(", ") + "]");
await writeFile(path.join(directory, "export-manifest.json"), manifest + "\n");
console.log("Wrote eight bounded paired-export JPEG evidence cases.");
