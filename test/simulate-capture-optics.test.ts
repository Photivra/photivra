// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { InvalidConfigurationError, simulateCapture, type SimulateCaptureOptions } from "../src/index.js";

const scene = { preset: "slanted-edge" } as const;

describe("simulateCapture lens.diffraction (2.1)", () => {
  it("builds Airy kernels at the resolved f-number and passes them as a sampled environment PSF", async () => {
    const r = await simulateCapture({ scene, output: { width: 6, height: 6 }, lens: { fNumber: 4, diffraction: "circular-aperture" } });
    const record = r.assumptions.find((a) => a.id === "lens.diffraction")!;
    expect(record.kind).toBe("model");
    const value = record.value as { fNumber: number; kernelRadiusSamples: number; workingFNumber: number; truncatedEnergyByWavelength: { wavelengthNm: number }[] };
    expect(value.fNumber).toBe(4);
    expect(value.workingFNumber).toBeCloseTo(4 * 5000 / 4950, 12);
    // Third dark ring at 770 nm: 3.2383 × 0.77 µm × 4.04 / 6 µm = 1.68 → 2 sites.
    expect(value.kernelRadiusSamples).toBe(2);
    expect(value.truncatedEnergyByWavelength.map((w) => w.wavelengthNm)).toEqual(Array.from({ length: 20 }, (_, k) => 390 + 20 * k));
    expect(r.assumptions.some((a) => a.id === "lens.psf")).toBe(false);
    expect(r.provenance.composedContracts).toContain("createDiffractionLimitedPsfProfile");
    const explicit = await simulateCapture({ scene, output: { width: 6, height: 6 }, lens: { fNumber: 4, diffraction: { aperture: "circular-aperture", kernelRadiusSamples: 1 } } });
    expect((explicit.assumptions.find((a) => a.id === "lens.diffraction")!.value as { kernelRadiusSamples: number }).kernelRadiusSamples).toBe(1);
  });

  it("rejects malformed or double-counting combinations", async () => {
    const psf = { kind: "sampled-local", configuration: {} } as never;
    for (const lens of [{ diffraction: "hexagonal" }, { diffraction: { aperture: "circular-aperture", kernelRadiusSamples: 33 } },
      { diffraction: { aperture: "circular-aperture", extra: 1 } }, { diffraction: "circular-aperture", psf },
      { diffraction: "circular-aperture", pupilSampling: { radialSamples: 1, angularSamples: 4 } }]) {
      await expect(simulateCapture({ scene, output: { width: 4, height: 4 }, lens: lens as never })).rejects.toThrow(InvalidConfigurationError);
    }
  });
});

/*
 * Hash lock: the 2.1 optics and demosaic options are opt-in, so captures that do not use them are byte-identical
 * to 2.0.0. Digests of the RAW codes and every output byte, and of the assumptions, composed contracts and
 * diagnostics (timings zeroed), recorded from the 2.0.0 source (commit 0e4c63e).
 */
describe("simulateCapture without the 2.1 options is byte-identical to 2.0.0", () => {
  const cases: Record<string, [SimulateCaptureOptions, string, string]> = {
    edge: [{ scene: { preset: "slanted-edge" }, output: { width: 24, height: 16 } },
      "0cce9455f8a541eed2ebe6f652556d7ea0d10601f2a35f8529768311e8ec0acf", "422bcaf90482a44f41d61a77bae181a76fef232beb8dc04462bf2b6411a6acf7"],
    star: [{ scene: { preset: "siemens-star" }, output: { width: 20, height: 20, format: "png" }, lens: { fNumber: 4 } },
      "775575f46b684c0eb44196270893632995c8ae7ca9400e878efcf2e29c9a7f1b", "d16b3b90999bdf5574605fd9f1c5dc883383fc700efd418b1403e696a98ef5e9"],
    jpeg: [{ scene: { preset: "checkerboard" }, output: { width: 16, height: 16, format: "jpeg", whiteBalance: "auto" } },
      "afeb03932b61751778c2ac285ce8245cd6feec4d0c18ffe7732f0a2d0588b70c", "aaf9a9015f62ed38988396350f068ab215970a02b0f9721e41c375129e449084"],
    mirror: [{ scene: { preset: "grey-ramp" }, output: { width: 16, height: 12, demosaic: "bilinear", borderHandling: "mirror", format: "srgb-16" } },
      "f8f7c5dc63ba0ad1ee0390d03ac08f3ee202bf57a560f9a834942303e3924c39", "677a22ecf6dfe9e715abdb8008577760a204411396416303afbb65214a30be48"],
    p3: [{ scene: { preset: "step-wedge" }, output: { width: 16, height: 8, format: "png", colorEncoding: "display-p3" } },
      "ffd78b35089083915e69cccbf16476a79690ce31095c1e428d6edc8672ecca0c", "11882d84e2f5e8b3d61f88db01f867368e5eb93e65fb5b8e82413075cc084880"],
    dng: [{ scene: { preset: "point-grid" }, output: { width: 12, height: 12, format: "dng" }, exposure: { mode: "program" } },
      "faaf9e2bf9ae86261adb153f4aea04a29476b4e38c3e3acc616d4aee3fe3a106", "ef701613a0b0790895c4652840af0ab5fe64aa5623b65fa02409dae8cbc33392"]
  };
  const hex = (data: Buffer | string): string => createHash("sha256").update(data).digest("hex");
  for (const [name, [options, bytes, meta]] of Object.entries(cases)) {
    it(name, async () => {
      const r = await simulateCapture(options);
      const parts = [r.raw.codes, r.image.samples, r.image.jpeg, r.image.png, r.image.dng].filter((a) => a !== undefined)
        .map((a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength));
      expect(hex(Buffer.concat(parts))).toBe(bytes);
      expect(hex(JSON.stringify({ a: r.assumptions, c: r.provenance.composedContracts, d: { ...r.diagnostics, timingsMs: 0 } }))).toBe(meta);
    });
  }
});
