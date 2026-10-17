// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { createAhdDemosaicTask, createBuiltInBayerDemosaicProfiles, createCfaPlaneReconstructionTask, InvalidConfigurationError,
  InvalidScientificInputError, type AhdDemosaicOutput, type BuiltInBayerDemosaicProfiles, type CfaMosaicPlane, type CfaPlaneReconstructionOutput, type ProcessingRgbImage } from "../src/index.js";
import { calculateRawReconstructionChannel, reflectRawSiteIndex, validateMirrorBorderCfaConsistency } from "../src/sensor/raw-reconstruction.js";
import { bayerProfile, mosaic, psnr, rgbImage, ROLES, runTask } from "./helpers/processing-fixture.js";

const TILES = [["red", "green", "green", "blue"], ["green", "red", "blue", "green"], ["green", "blue", "red", "green"], ["blue", "green", "green", "red"]];
function plane(image: ProcessingRgbImage, tile = TILES[0]!): CfaMosaicPlane {
  return { width: image.width, height: image.height, captureModeId: "native", colorSamplingProfile: bayerProfile(tile), samples: mosaic(image, tile) };
}
function profiles(kernel: "bilinear", tile = TILES[0]!): BuiltInBayerDemosaicProfiles {
  return createBuiltInBayerDemosaicProfiles({ kernel, captureModeId: "native", colorSamplingProfile: bayerProfile(tile), channelRoles: ROLES }).value;
}
async function linear(image: ProcessingRgbImage, kernel: "bilinear", tile = TILES[0]!): Promise<CfaPlaneReconstructionOutput> {
  return runTask((p) => createCfaPlaneReconstructionTask({ plane: plane(image, tile), phaseProfiles: profiles(kernel, tile).phaseProfiles, borderHandling: "mirror" }, p));
}
async function ahd(image: ProcessingRgbImage, tile = TILES[0]!): Promise<AhdDemosaicOutput> {
  return runTask((p) => createAhdDemosaicTask({ plane: plane(image, tile), channelRoles: ROLES }, p));
}

/** Luminance-dominant pattern: grey texture (zone plate, slanted edge, disc) under a smooth colour cast. */
function lumaPattern(size = 96): ProcessingRgbImage {
  return rgbImage(size, size, (x, y, c) => {
    const r2 = (x - size / 2) ** 2 + (y - size / 2) ** 2;
    let l = 0.5 + 0.3 * Math.cos(r2 * 0.006);
    if (x - 0.3 * y > 60) l *= 0.4;
    if ((x - 20) ** 2 + (y - 75) ** 2 < 144) l = 0.9;
    return l * [0.9 - 0.2 * x / size, 0.8, 0.6 + 0.3 * y / size][c]!;
  });
}

/** Synthetic test pattern: smooth colour ramps, hard-edged colour shapes, a slanted edge and a low-frequency zone plate. */
function testPattern(size = 96): ProcessingRgbImage {
  return rgbImage(size, size, (x, y, c) => {
    const u = x / size, v = y / size;
    let value = [0.25 + 0.4 * u, 0.3 + 0.3 * v, 0.5 - 0.3 * u * v][c]!;
    if ((x - 30) ** 2 + (y - 30) ** 2 < 15 ** 2) value = [0.8, 0.2, 0.1][c]!;
    if (x > 55 && x < 85 && y > 10 && y < 40) value = [0.1, 0.6, 0.8][c]!;
    if (y > 50 && x - 0.3 * y > 20) value *= 0.35;
    const r2 = ((x - 48) ** 2 + (y - 75) ** 2);
    if (r2 < 20 ** 2) value = 0.5 + 0.35 * Math.cos(r2 * 0.012);
    return value;
  });
}

describe("built-in Bayer demosaic kernels", () => {
  it("publishes bilinear kernels that sum to one with a one-site reach", () => {
    const bil = profiles("bilinear").phaseProfiles;
    const kernel = (phase: number, out: string): Map<string, number> => new Map(bil[phase]!.profile.kernels.find((k) => k.outputChannelId === out)!.contributions
      .map((c) => [c.offsetX + "," + c.offsetY + "," + c.sourceChannelId, c.weight]));
    expect(kernel(0, "green")).toEqual(new Map([["1,0,green", 0.25], ["-1,0,green", 0.25], ["0,1,green", 0.25], ["0,-1,green", 0.25]]));
    expect(kernel(0, "blue").get("1,1,blue")).toBe(0.25);
    expect(kernel(1, "red")).toEqual(new Map([["1,0,red", 0.5], ["-1,0,red", 0.5]]));
    for (const phase of bil) for (const k of phase.profile.kernels) expect(k.contributions.reduce((s, c) => s + c.weight, 0)).toBe(1);
    expect(kernel(0, "red")).toEqual(new Map([["0,0,red", 1]]));
    expect(profiles("bilinear").kernelReachSites).toBe(1);
    // The Malvar–He–Cutler kernels were removed from 2.0 (patent US 7,502,505 still in force).
    expect(() => createBuiltInBayerDemosaicProfiles({ kernel: "malvar-he-cutler-2004" as "bilinear", captureModeId: "native", colorSamplingProfile: bayerProfile(), channelRoles: ROLES }))
      .toThrow(InvalidConfigurationError);
  });

  it("reproduces per-channel affine signals exactly (interior and mirrored borders) for every Bayer phase", async () => {
    for (const tile of TILES) for (const kernel of ["bilinear"] as const) {
      const image = rgbImage(12, 10, (x, y, c) => [0.1 + 0.03 * x - 0.01 * y, 0.5 - 0.02 * x + 0.025 * y, 0.2 + 0.01 * x + 0.01 * y][c]!);
      const out = await runTask((p) => createCfaPlaneReconstructionTask({ plane: plane(image, tile), phaseProfiles: profiles(kernel, tile).phaseProfiles,
        borderHandling: "reject", region: { x: 2, y: 2, width: 8, height: 6 } }, p));
      for (let y = 0; y < 6; y++) for (let x = 0; x < 8; x++) for (let c = 0; c < 3; c++) {
        expect(out.data[3 * (y * 8 + x) + c]).toBeCloseTo(image.data[3 * ((y + 2) * 12 + x + 2) + c]!, 5);
      }
      const constant = await linear(rgbImage(6, 6, (_x, _y, c) => [0.3, 0.6, 0.9][c]!), kernel, tile);
      for (let i = 0; i < constant.data.length; i++) expect(constant.data[i]).toBeCloseTo([0.3, 0.6, 0.9][i % 3]!, 6);
    }
  });

  it("matches the reference resolver arithmetic exactly, including mirrored edge reads", async () => {
    const image = testPattern(16), pl = plane(image), set = profiles("bilinear").phaseProfiles;
    const out = await runTask((p) => createCfaPlaneReconstructionTask({ plane: pl, phaseProfiles: set, borderHandling: "mirror" }, p));
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      set[(y % 2) * 2 + (x % 2)]!.profile.kernels.forEach((k, c) => {
        const ref = calculateRawReconstructionChannel(k, { x, y }, (sx, sy) => pl.samples[sy * 16 + sx]!, { width: 16, height: 16 });
        expect(out.data[3 * (y * 16 + x) + c]).toBe(Math.fround(ref.linearBlackSubtractedNormalizedValue));
      });
    }
  });

  it("rejects edge neighbourhoods unless mirror borders are requested, and rejects phase-changing mirrors", async () => {
    const image = testPattern(8);
    expect(() => createCfaPlaneReconstructionTask({ plane: plane(image), phaseProfiles: profiles("bilinear").phaseProfiles },
      { yieldControl: async () => {} })).toThrow(InvalidConfigurationError);
    expect(reflectRawSiteIndex(-1, 5)).toBe(1); expect(reflectRawSiteIndex(-2, 5)).toBe(2); expect(reflectRawSiteIndex(5, 5)).toBe(3);
    expect(reflectRawSiteIndex(7, 1)).toBe(0); expect(reflectRawSiteIndex(-9, 4)).toBe(3);
    // A 3-periodic stripe CFA is not mirror-safe: reflecting x=−1 → 1 changes the channel.
    expect(() => validateMirrorBorderCfaConsistency({ repeatWidthSites: 3, repeatHeightSites: 1, siteChannelIds: ["r", "g", "b"] }, 9, 9, 1))
      .toThrow(InvalidConfigurationError);
    expect(() => validateMirrorBorderCfaConsistency({ repeatWidthSites: 2, repeatHeightSites: 2, siteChannelIds: ["r", "g", "g", "b"] }, 2, 9, 2))
      .toThrow(InvalidConfigurationError);
    expect(() => createBuiltInBayerDemosaicProfiles({ kernel: "bilinear", captureModeId: "native", colorSamplingProfile: bayerProfile(["red", "green", "blue", "green"]),
      channelRoles: ROLES })).toThrow(InvalidScientificInputError);
    expect(() => createBuiltInBayerDemosaicProfiles({ kernel: "nearest" as "bilinear", captureModeId: "native", colorSamplingProfile: bayerProfile(), channelRoles: ROLES }))
      .toThrow(InvalidConfigurationError);
    expect(() => createAhdDemosaicTask({ plane: { ...plane(image), colorSamplingProfile: bayerProfile(["red", "green", "blue", "green"]) }, channelRoles: ROLES },
      { yieldControl: async () => {} })).toThrow(InvalidScientificInputError);
  });
});

describe("adaptive homogeneity-directed demosaic", () => {
  it("is exact on constants and follows the edge direction (no zipper) on axis-aligned colour edges", async () => {
    const flat = await ahd(rgbImage(8, 8, (_x, _y, c) => [0.2, 0.4, 0.7][c]!));
    for (let i = 0; i < flat.data.length; i++) expect(flat.data[i]).toBeCloseTo([0.2, 0.4, 0.7][i % 3]!, 6);
    for (const vertical of [true, false]) {
      const image = rgbImage(24, 24, (x, y, c) => ((vertical ? x : y) < 12 ? [0.8, 0.3, 0.1] : [0.1, 0.5, 0.9])[c]!);
      const a = await ahd(image), b = await linear(image, "bilinear");
      // Pixels beside the edge choose interpolation along it, so green there is exact (no zipper).
      for (let t = 4; t < 20; t++) for (const s of [11, 12]) {
        const i = vertical ? t * 24 + s : s * 24 + t;
        expect(a.direction[i]).toBe(vertical ? 1 : 0);
        expect(a.data[3 * i + 1]).toBeCloseTo(image.data[3 * i + 1]!, 5);
      }
      const err = (o: Float32Array): number => psnr(o, image.data);
      // Zipper: alternating error along the edge (truth is constant along it).
      const zipper = (o: Float32Array): number => { let z = 0; for (let t = 4; t < 19; t++) for (const s of [10, 11, 12, 13]) for (let c = 0; c < 3; c++) {
        const i = vertical ? t * 24 + s : s * 24 + t, j = vertical ? i + 24 : i + 1; z += Math.abs(o[3 * i + c]! - o[3 * j + c]!); } return z; };
      expect(zipper(a.data)).toBe(0);
      expect(zipper(b.data)).toBeGreaterThan(1);
      // On this saturated step the colour-difference fill still crosses the edge, so PSNR is not better than bilinear.
      expect(err(a.data)).toBeCloseTo(23.912, 2); expect(err(b.data)).toBeCloseTo(24.025, 2);
    }
  });

  it("reports PSNR of bilinear and AHD on two synthetic test patterns (reported in docs/PROCESSING.md)", async () => {
    const image = testPattern(), interior = (i: number): boolean => { const p = Math.floor(i / 3), x = p % 96, y = Math.floor(p / 96); return x >= 2 && y >= 2 && x < 94 && y < 94; };
    const measure = async (im: ProcessingRgbImage): Promise<Record<"bilinear" | "ahd", number>> => ({ bilinear: psnr((await linear(im, "bilinear")).data, im.data, 1, interior),
      ahd: psnr((await ahd(im)).data, im.data, 1, interior) });
    const results = await measure(image), luma = await measure(lumaPattern());
    // Luminance-dominant content: AHD > bilinear.
    expect(luma.bilinear).toBeCloseTo(33.10, 1); expect(luma.ahd).toBeCloseTo(39.13, 1);
    // Saturated, decorrelated colour shapes: AHD ≈ bilinear.
    expect(results.bilinear).toBeCloseTo(29.80, 1); expect(results.ahd).toBeCloseTo(29.60, 1);


  });
});
