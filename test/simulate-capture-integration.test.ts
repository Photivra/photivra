// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { simulateCapture, type SimulateCaptureOptions, type SimulateCaptureResult } from "../src/index.js";

function sha(data: ArrayBufferView | string): string {
  const hash = createHash("sha256");
  hash.update(typeof data === "string" ? data : new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  return hash.digest("hex");
}
/** Digest of every byte-level facade output: developed samples, packed RAW, JPEG and the executed request. */
function digest(r: SimulateCaptureResult): Record<string, string> {
  const nativeCount = r.plan.pixelCount, sites = [0, Math.floor(nativeCount / 2), nativeCount - 1].map((i) => r.request.siteInput(i));
  return {
    samples: sha(r.image.samples), codes: sha(r.raw.codes), blackLevels: sha(r.raw.blackLevels), flags: sha(r.raw.saturationFlags),
    jpeg: r.image.jpeg ? sha(r.image.jpeg) : "none",
    environmentRaw: sha(JSON.stringify(r.request.environmentRaw)), development: sha(JSON.stringify(r.request.development)),
    sites: sha(JSON.stringify(sites)), sourceSha256: r.scene.sourceSha256
  };
}
const BASELINE_CASES: Record<string, SimulateCaptureOptions> = {
  uniform: { scene: { preset: "uniform" }, output: { width: 4, height: 4 } },
  edge16: { scene: { preset: "slanted-edge" }, output: { width: 6, height: 4, format: "srgb-16" } },
  jpegAuto: { scene: { preset: "checkerboard" }, output: { width: 8, height: 8, format: "jpeg", whiteBalance: "auto" } },
  pupil: { scene: { preset: "siemens-star" }, lens: { pupilSampling: { radialSamples: 1, angularSamples: 4 }, focusDistanceM: 3 }, output: { width: 4, height: 4 } }
};

/** Digests recorded from the 1.0 facade (origin/main 09e4262) before any 2.0 option existed. */
const BASELINE: Record<string, Record<string, string>> = {
  uniform: {
    samples: "45d0d0970877f3a23c6ddfd0ea40c5795ea1a9812e9f9d7ba1c6c3b5ee6fe568",
    codes: "7f545104f9d61669ac558ffa6d08f6732f8fdf5ec931617a2b6fbc78df35b528",
    blackLevels: "85d8c8cdf03881458c326e5ea9b9d1993a0a13a1eab0eafb4f3bf9aa60d25f6b",
    flags: "6db65fd59fd356f6729140571b5bcd6bb3b83492a16e1bf0a3884442fc3c8a0e",
    jpeg: "none",
    environmentRaw: "07d1553828386e668a8df433b854b8ebe14a2c808ab7dbd42082319968603765",
    development: "5eb9d20168ba577baf2523450c593d4f18edcd6b60f4cde1f68a07f88470b108",
    sites: "73703c445f870896e049f91fe6a52895322d7c21687905b8c975ed3e66433456",
    sourceSha256: "6a9f7f6da9604c767ea52a17dade98a8e2887ccafb4e6c09a82c0f429fe572e9"
  },
  edge16: {
    samples: "376cdbcdf9a36f1a4ed23fec04c289084f78a38461a0e35bddcac39d560b1aae",
    codes: "f7c2e91308c49e83bf389ac994e908f35b4518525e886b4dac6de0d30f6250a2",
    blackLevels: "e609dcf9cc04614ef47867ee972ed167a4b405fd41ec28585b86d2907f179f1c",
    flags: "17b0761f87b081d5cf10757ccc89f12be355c70e2e29df288b65b30710dcbcd1",
    jpeg: "none",
    environmentRaw: "661e30ab35e6b9ce61cfd3b15cc0ba52eff599c4f6312bf3ef4759f9ca1ca868",
    development: "ea3c54f5a8ac75edc8e69e5fc77e16769b77060b307454d27f582773c7c78e0d",
    sites: "749285334a9b5b7b34ff012f1eb48c04b826c1a1134e53dffdf9a2455fd6fd81",
    sourceSha256: "3b43a89f6c71e66ded934d2485ab8e49723b2540f8ff8fe54c1608a9f7a51166"
  },
  jpegAuto: {
    samples: "7e7dd20e11236e2ba6fd57d5902e6e5b679f026021acb21a028fdd13f7d5fa8a",
    codes: "1c8484cbcc47084b8c555c2a6c71152ec9c35c3b92b90568b180a0ad55351863",
    blackLevels: "f235651a4bd57afc227c07e0fdb0b4ebe6aa8463eaf8307fec533194c8624a1f",
    flags: "cd00e292c5970d3c5e2f0ffa5171e555bc46bfc4faddfb4a418b6840b86e79a3",
    jpeg: "b4ba0b638197e309fbaadf60c895fa40fc97000e907dd3389c95b9c5d9163a9e",
    environmentRaw: "00f98430ed75f7baf32c2d90429119a9c111c363e05fa16ca2298c382bbe6e16",
    development: "d919bdef431a2156a47488818ffe86288634d1a02f6af0ccd6d7476f18c571e7",
    sites: "f44a9c663218470c97d8bfb45dfecb7a54ec2d9a91e95244f906ae0ae0c5b6f6",
    sourceSha256: "d09e9c4233d2ccc43f00be71dc1b04845c11caad831eeb32b90e1fa278779f80"
  },
  pupil: {
    samples: "f683e121ba489baaa6a1133003a5afa738d1d3054a45de52223ef0883a5f52c0",
    codes: "1e0a3b89351242ed81835e549a44d282c52ae7528648b372bbe72a58a24773ec",
    blackLevels: "85d8c8cdf03881458c326e5ea9b9d1993a0a13a1eab0eafb4f3bf9aa60d25f6b",
    flags: "6db65fd59fd356f6729140571b5bcd6bb3b83492a16e1bf0a3884442fc3c8a0e",
    jpeg: "none",
    environmentRaw: "f2fca265739254dd97a244f53f78f721ec123f04bc9afcd6f0ad7679abfa61d7",
    development: "5eb9d20168ba577baf2523450c593d4f18edcd6b60f4cde1f68a07f88470b108",
    sites: "7a864986cef30ac6b826699ff9b9f1c373ce7ceffd4f99229bbe0f9531ce8063",
    sourceSha256: "a01c6c54d4193eea40a88e8ae802e6887aeb2058b0d43bd73b670a650f4835f0"
  }
};

describe("simulateCapture 2.0 integration", { timeout: 120_000 }, () => {
  it("keeps every 1.0 output byte-identical when no 2.0 option is given", async () => {
    for (const [name, options] of Object.entries(BASELINE_CASES)) expect(digest(await simulateCapture(options)), name).toEqual(BASELINE[name]);
  });
});
