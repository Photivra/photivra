// SPDX-License-Identifier: Apache-2.0

/**
 * Repository-only benchmark of opt-in parallel native environment RAW (#275): one capture run as a single task,
 * then split into row bands (calculateNativeRawRowBands) run in Node worker threads
 * (createNativeEnvironmentRawPartitionTask) and merged (composeNativeEnvironmentRawPartitions).
 *
 * The capture is the `simulateCapture()` request of a benchmark case (scripts/lib/native-environment-cases.mjs) with
 * an analytic radiance provider. Workers receive the site inputs once, at start-up (timed separately as setup);
 * the timed parallel run covers posting "run", every band's acquisition, posting the partitions back (buffers
 * transferred) and the merge. RAW SHA-256 of the merged output must equal the single task's, or the script fails.
 * The single-thread run is also timed with a batched provider (evaluateRadianceBatch), whose RAW must match too.
 * Informational only; host-dependent. Environment: N (default 48), WORKERS (comma list, default 2,4), REPEATS
 * (default 3), CASES (default psf,default).
 */
import "./require-fresh-dist.mjs";
import console from "node:console";
import { createHash } from "node:crypto";
import { availableParallelism } from "node:os";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { setImmediate } from "node:timers/promises";
import { URL } from "node:url";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { createNativeEnvironmentRawPartitionTask, createNativeEnvironmentRawTask, composeNativeEnvironmentRawPartitions, calculateNativeRawRowBands,
  simulateCapture } from "../dist/index.js";
import { analyticRadiance, nativeEnvironmentCases } from "./lib/native-environment-cases.mjs";

/**
 * A provider reading site inputs from an array (absolute native row-major order). Sites share their profile objects,
 * as the facade builds them; the engine copies every tile it reads, so they are passed as they are.
 */
function provider(sites, width, batch = false) {
  return {
    ...(batch ? { evaluateRadianceBatch: (queries) => queries.map(({ request, apertureRay }) => analyticRadiance(request, apertureRay)) } : {}),
    async readTile(request) {
      return { ...request, sites: sites.slice(request.y * width + request.x, request.y * width + request.x + request.width) };
    },
    evaluateRadiance: (request) => analyticRadiance(request),
    evaluateApertureRadiance: (request, ray) => analyticRadiance(request, ray),
    yieldControl: () => setImmediate()
  };
}

if (!isMainThread) {
  const { input, sites, width } = workerData;
  parentPort.on("message", async (band) => {
    const task = createNativeEnvironmentRawPartitionTask(input, band, provider(sites, width));
    await task.run();
    const partition = task.takeOutput();
    parentPort.postMessage(partition, [partition.codes.buffer, partition.blackLevels.buffer, partition.digitalSaturationCodes.buffer,
      partition.saturationFlags.buffer]);
  });
} else {
  const size = Number(process.env.N ?? 48), repeats = Number(process.env.REPEATS ?? 3);
  const workerCounts = (process.env.WORKERS ?? "2,4").split(",").map(Number);
  if (!Number.isSafeInteger(size) || size < 4 || size > 256 || !Number.isSafeInteger(repeats) || repeats < 1 || repeats > 15 ||
    workerCounts.some((n) => !Number.isSafeInteger(n) || n < 1 || n > 64)) throw new Error("Invalid N, REPEATS or WORKERS.");
  const cases = nativeEnvironmentCases(size), sha256 = (view) => createHash("sha256").update(new Uint8Array(view.buffer, view.byteOffset, view.byteLength)).digest("hex");
  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  for (const name of (process.env.CASES ?? "psf,default").split(",")) {
    if (cases[name] === undefined) throw new Error(`Unknown case ${name}.`);
    const capture = await simulateCapture(cases[name]);
    const input = { raw: capture.request.environmentRaw.raw, sceneBinding: capture.request.environmentRaw.sceneBinding,
      maximumProviderEvaluations: capture.request.environmentRaw.maximumProviderEvaluations };
    const native = capture.plan.exposure.geometry.nativeRaster, width = native.pixelWidth;
    const sites = Array.from({ length: native.pixelWidth * native.pixelHeight }, (_, index) => capture.request.siteInput(index));
    const runSingle = async (batch) => { const task = createNativeEnvironmentRawTask(input, provider(sites, width, batch)); await task.run(); return task.takeOutput(); };
    await runSingle(false);
    await runSingle(true);
    // One thread, per-query callbacks and the batched provider (evaluateRadianceBatch), alternated.
    const singleMs = [], batchMs = [];
    let expected;
    for (let repeat = 0; repeat < repeats; repeat++) {
      for (const batch of [false, true]) {
        globalThis.gc?.();
        const start = performance.now();
        const digest = sha256((await runSingle(batch)).raw.codes);
        (batch ? batchMs : singleMs).push(performance.now() - start);
        expected ??= digest;
        if (digest !== expected) throw new Error(`${name}: batched RAW differs from per-query RAW.`);
      }
    }
    const rows = [];
    for (const count of workerCounts) {
      const setupStart = performance.now();
      const workers = Array.from({ length: count }, () => new Worker(new URL(import.meta.url), { workerData: { input, sites, width } }));
      await Promise.all(workers.map((worker) => new Promise((resolve, reject) => { worker.once("online", resolve); worker.once("error", reject); })));
      const setupMs = performance.now() - setupStart, bands = calculateNativeRawRowBands(capture.plan, count);
      const runOnce = async () => {
        const parts = await Promise.all(bands.map((band, i) => new Promise((resolve, reject) => {
          workers[i].once("message", resolve); workers[i].once("error", reject); workers[i].postMessage(band);
        })));
        return composeNativeEnvironmentRawPartitions(input, parts);
      };
      await runOnce();
      const parallelMs = [];
      for (let repeat = 0; repeat < repeats; repeat++) {
        globalThis.gc?.();
        const start = performance.now();
        const merged = await runOnce();
        parallelMs.push(performance.now() - start);
        if (sha256(merged.raw.codes) !== expected) throw new Error(`${name}: merged RAW differs from the single task.`);
      }
      await Promise.all(workers.map((worker) => worker.terminate()));
      rows.push({ workers: count, bands: bands.length, setupMs: Number(setupMs.toFixed(1)), medianRunMs: Number(median(parallelMs).toFixed(1)),
        samplesMs: parallelMs.map((ms) => Number(ms.toFixed(1))), speedup: Number((median(singleMs) / median(parallelMs)).toFixed(2)) });
    }
    console.log(JSON.stringify({ case: name, output: `${size}x${size}`, nativeSites: sites.length, availableParallelism: availableParallelism(),
      singleMedianMs: Number(median(singleMs).toFixed(1)), singleSamplesMs: singleMs.map((ms) => Number(ms.toFixed(1))),
      singleBatchedMedianMs: Number(median(batchMs).toFixed(1)), singleBatchedSamplesMs: batchMs.map((ms) => Number(ms.toFixed(1))), rawSha256: expected,
      parallel: rows, mergedRawIdentical: true, runtime: process.version, platform: `${process.platform}/${process.arch}` }));
  }
}
