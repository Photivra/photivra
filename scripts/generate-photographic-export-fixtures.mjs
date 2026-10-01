// SPDX-License-Identifier: Apache-2.0

import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { performance } from "node:perf_hooks";
import { createPhotographicExportPair, parsePhotographicExportInput, ENGINE_API_VERSION } from "../dist/index.js";

// Repository-only owned test fixture, not scientific sensor calibration.
// Usage after npm run build: node scripts/generate-photographic-export-fixtures.mjs OUTPUT_DIRECTORY
const outputDirectory = process.argv[2];
if (!outputDirectory) throw new Error("Supply a fixture output directory.");
const input = JSON.parse(await readFile(new URL("../test/fixtures/photographic-export-reference.json", import.meta.url), "utf8"));
// This pinned input represents the draft API; keep stale versions visible.
if (input.reconstruction.rawFrame.capture.engineApiVersion !== ENGINE_API_VERSION) throw new Error("Reference fixture engine version needs review.");
const start = performance.now(), heapBefore = process.memoryUsage().heapUsed;
const pair = await createPhotographicExportPair(parsePhotographicExportInput(input));
const elapsedMs = performance.now()-start, heapAfter = process.memoryUsage().heapUsed;
await mkdir(outputDirectory, { recursive: true });
await writeFile(path.join(outputDirectory,"reference.dng"),pair.dng.bytes);
await writeFile(path.join(outputDirectory,"reference.jpg"),pair.jpeg.bytes);
await writeFile(path.join(outputDirectory,"reference.json"),JSON.stringify({
  fixture:"owned-2x2-reference-not-calibration",nativeWidth:2,nativeHeight:2,
  codes:pair.source.value.rawFrame.samples.map((s) => s.rawCode),
  rgb:pair.rendering.value.integerSamples,hash:pair.simulationHash,
  dngHash:pair.dng.sha256,jpegHash:pair.jpeg.sha256,
  fileBytes:{dng:pair.dng.bytes.length,jpeg:pair.jpeg.bytes.length},
  measured:{elapsedMs,heapUsedBefore:heapBefore,heapUsedAfter:heapAfter,
    scope:"single tiny fixture; no peak-memory or typical-resolution claim"}
},null,2)+"\n");
process.stdout.write(`Wrote reference.dng, reference.jpg and reference.json to ${outputDirectory}\n`);
