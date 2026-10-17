// SPDX-License-Identifier: Apache-2.0

/**
 * Repository-only benchmark of native environment RAW through `simulateCapture()` (#275).
 *
 * Cases: the facade's default optics, a 3 × 3 sampled lens PSF, radial distortion (a lens field mapping) and
 * ideal pupil rays, all on the slanted-edge scene. Each case is warmed once, then timed REPEATS times; the
 * median wall time and the SHA-256 of the packed RAW codes and the developed samples are printed, so a
 * speed change can be checked for bit-identical output. Informational only: no CI threshold, and timings are
 * host-dependent. Environment: N (output width and height, default 48), REPEATS (default 3), CASES
 * (comma-separated subset).
 */
import "./require-fresh-dist.mjs";
import console from "node:console";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { simulateCapture } from "../dist/index.js";
import { nativeEnvironmentCases } from "./lib/native-environment-cases.mjs";

const size = Number(process.env.N ?? 48), repeats = Number(process.env.REPEATS ?? 3);
if (!Number.isSafeInteger(size) || size < 4 || size > 256 || !Number.isSafeInteger(repeats) || repeats < 1 || repeats > 15) {
  throw new Error("N must be an integer from 4 to 256 and REPEATS from 1 to 15.");
}
const cases = nativeEnvironmentCases(size);
const selected = process.env.CASES ? process.env.CASES.split(",") : Object.keys(cases);
const sha256 = (view) => createHash("sha256").update(new Uint8Array(view.buffer, view.byteOffset, view.byteLength)).digest("hex");

for (const name of selected) {
  const options = cases[name];
  if (options === undefined) throw new Error(`Unknown case ${name}.`);
  await simulateCapture(options);
  const samples = [];
  let result;
  for (let repeat = 0; repeat < repeats; repeat++) {
    globalThis.gc?.();
    const start = performance.now();
    result = await simulateCapture(options);
    samples.push(performance.now() - start);
  }
  const sorted = [...samples].sort((a, b) => a - b), native = result.plan.exposure.geometry.nativeRaster;
  console.log(JSON.stringify({ case: name, output: `${size}x${size}`, nativeSites: native.pixelWidth * native.pixelHeight,
    medianWallMs: Number(sorted[Math.floor(repeats / 2)].toFixed(1)), samplesMs: samples.map((ms) => Number(ms.toFixed(1))),
    rawSha256: sha256(result.raw.codes), imageSha256: sha256(result.image.samples), runtime: process.version, platform: `${process.platform}/${process.arch}` }));
}
