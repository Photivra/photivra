// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { nativeEnvironmentWorkloads, runNativeEnvironmentWorkload } from "./helpers/native-environment-workloads.js";
import { applyNativeEnvironmentTileVariant, nativeEnvironmentTileVariants } from "./helpers/native-environment-variants.js";

/**
 * SHA-256 of float64 photo expectations, RAW codes and developed samples computed on main d3a704b before the #275
 * validation/clone/PSF-parse changes. Those changes are performance-only, so every hash must stay identical. An
 * intended scientific change that alters these values must update them deliberately with its own evidence.
 */
const expected = {
  "psf-radial-field": { providerEvaluationCount: 576,
    photoSha256: "049f995c1dca2b171b9b832769228da54d2fb78f8cc154c3fecfb9c1263c29bf",
    rawSha256: "612bca8d7c3434d58bba46ba9aa1a49f6f2de4287b7de8f1383f2623085bf02a",
    developedSha256: "5485526b4299bd30bb1b8895cd2d7772674da178a7bbc9308b9f324c49eb6d13" },
  "flat-emitter": { providerEvaluationCount: 64,
    photoSha256: "1894035d1ce66fdae20e9485e4d7a8c6668cae5b82566d99d32bc1c2028c4e75",
    rawSha256: "a6822e782bf23a8baed26ae46ab93f44f7f5d61b2a852ef19dbdb7a73d051cd3",
    developedSha256: "0b0e085bdbac57cc69daf0983a1f06d9dcabe9216266fac100487a35af2b0c41" },
  "pupil-rays": { providerEvaluationCount: 512,
    photoSha256: "ada95dc906cd583120a526ae94c3b6b45b5c69ddf60060713943e7a591e41af3",
    rawSha256: "92c37fecee24c4d21e25ed9ea5ebee26cefd96fb69f4abe269f10ddb9a79c988",
    developedSha256: "e11910a731448f430504e47505a24c7bfe9d4037a3255744b88cf9e0f2ca3b71" },
  "temporal-samples": { providerEvaluationCount: 256,
    photoSha256: "97dc3f03a47eb80b29d8eb2718d2e298924d3a8fc9bc101ae2e15b75e930fc52",
    rawSha256: "2ffbbcc04aa19dc4ca196f4c4439db4fd1c0b2688cac4b7650d9f93f1df43143",
    developedSha256: "28841a6a748eae1f74043466dd001247260636ac6ddfa023d44cf3efba3aa2a8" }
} as const;

/**
 * Photo hashes computed on main d01d04b (before the 2.0 shared-state adoption) for the negative-zero tile
 * variant, whose motion differs from the base workload. RAW and developed hashes equal the base workload's.
 */
const negativeZeroPhotoSha256 = {
  "psf-radial-field": "5cdf8bd2204b585acfdb422a2385567449348f44f634eaebfa69585df8f46980",
  "flat-emitter": expected["flat-emitter"].photoSha256,
  "pupil-rays": "37cd32a9aa3b361e6da851a1385a443ba1399172709c50c4b67f7f02772a184f",
  "temporal-samples": "5bcaf338d547837712da776d3dd03c2c227d28dcf812a1160af842cf23c4d025"
} as const;

describe("native environment RAW bit identity", () => {
  it.each(nativeEnvironmentWorkloads)("keeps photo expectations, RAW codes and developed output bit-identical for %s", async kind => {
    expect(await runNativeEnvironmentWorkload(kind)).toEqual(expected[kind]);
  });

  // Shared references take the identity fast path; reordered keys and -0 take the canonical fallback (2.0 performance).
  it.each(nativeEnvironmentWorkloads.flatMap(kind => nativeEnvironmentTileVariants.map(variant => [kind, variant] as const)))(
    "keeps %s bit-identical to main with %s shared state", async (kind, variant) => {
      const result = await runNativeEnvironmentWorkload(kind, { mutateTile: tile => applyNativeEnvironmentTileVariant(variant, tile) });
      expect(result).toEqual(variant === "negative-zero" ? { ...expected[kind], photoSha256: negativeZeroPhotoSha256[kind] } : expected[kind]);
    });

  it.each(nativeEnvironmentWorkloads)("keeps %s bit-identical to main with one-site tiles", async kind => {
    expect(await runNativeEnvironmentWorkload(kind, { tileWidth: 1 })).toEqual(expected[kind]);
  });
});
