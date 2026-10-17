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

const evidence = [{ sourceOrigin: "photivra", sourceReference: "photivra:benchmark-native-environment", reuseStatus: "photivra-owned" }];

/** Synthetic binomial 3 × 3 kernel at the pixel pitch, bound to the facade defaults (50 mm, f/8, focus 5 m). */
function sampledPsf() {
  const axes = { focalLengthMm: [50], focusDiopters: [0.2], apertureFNumber: [8], fieldXmm: [-1, 1], fieldYmm: [-1, 1], wavelengthNm: [380, 780],
    signedDefocusImagePlaneMicrometers: [0] };
  const kernel = { widthSamples: 3, heightSamples: 3, samplePitchMicrometersX: 6, samplePitchMicrometersY: 6, centerSampleX: 1, centerSampleY: 1,
    normalizedIntensity: [0.0625, 0.125, 0.0625, 0.125, 0.25, 0.125, 0.0625, 0.125, 0.0625] };
  const profile = { schemaVersion: "0.1.0", profileId: "benchmark-binomial-psf", profileVersion: "1", scientificStatus: "approximation",
    opticalDomain: "lens-primary-optical-path-only", coordinateSystem: "image-plane-metric", fieldAxes: "+X right, +Y up",
    kernelEnergyNormalization: "unit-energy-shape", interpolation: "bounded-regular-grid-multilinear",
    throughputOwnership: "separate-relative-pupil-throughput-factor",
    responseIncludes: { diffraction: true, aberration: true, defocus: true, pupilClippingShape: true }, sensorOpticalStackIncluded: false,
    sensorSamplingIncluded: false, reconstructionIncluded: false, strayLightIncluded: false, axes, evidence,
    limitations: ["Synthetic binomial kernel for a benchmark."],
    nodes: axes.fieldXmm.flatMap((x) => axes.fieldYmm.flatMap((y) => axes.wavelengthNm.map((nm) => ({ nodeId: `n-${x}-${y}-${nm}`,
      coordinate: { focalLengthMm: 50, focusDiopters: 0.2, apertureFNumber: 8, fieldXmm: x, fieldYmm: y, wavelengthNm: nm,
        signedDefocusImagePlaneMicrometers: 0 },
      kernel, bestFocusImagePlaneOffsetMicrometers: 0, relativePupilThroughputFactor: 1, evidence,
      uncertainty: { kind: "not-quantified", limitation: "Synthetic." } })))) };
  return { kind: "sampled-local", configuration: { psf: { profile, focalLengthMm: 50, focus: { kind: "finite", distanceM: 5 }, apertureFNumber: 8,
    signedDefocusImagePlaneMicrometers: 0 }, psfWavelengthBasis: { value: "vacuum", evidence },
  spatialModel: { kind: "destination-local-shift-invariant-approximation", evidence, limitation: "Synthetic local kernel." } } };
}

const size = Number(process.env.N ?? 48), repeats = Number(process.env.REPEATS ?? 3);
if (!Number.isSafeInteger(size) || size < 4 || size > 256 || !Number.isSafeInteger(repeats) || repeats < 1 || repeats > 15) {
  throw new Error("N must be an integer from 4 to 256 and REPEATS from 1 to 15.");
}
const base = { scene: { preset: "slanted-edge" }, output: { width: size, height: size }, sensor: { noiseSeed: 7 } };
const cases = {
  default: base,
  psf: { ...base, lens: { psf: sampledPsf() } },
  distortion: { ...base, lens: { distortion: { kind: "radial", profile: { normalizationRadiusMm: 0.5, maximumNormalizedRadius: 1,
    coefficients: { k1: -0.05, k2: 0, k3: 0 } } } } },
  pupil: { ...base, lens: { pupilSampling: { radialSamples: 1, angularSamples: 4 } } }
};
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
