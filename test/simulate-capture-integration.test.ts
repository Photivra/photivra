// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InvalidConfigurationError, estimateCie1931ColorMatchingFunctions, evaluateBt709InverseOetf, evaluateHlgInverseOetf, evaluatePqEotf, evaluateSrgbDecoding, resolveRgbColorSpace,
  simulateCapture, type LensSampledPsfProfile, type SimulateCaptureOptions, type SimulateCaptureResult } from "../src/index.js";

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

/** PNG chunk payloads by type (signature and CRC are checked by the encoder's own tests). */
function pngChunks(png: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength), out = new Map<string, Uint8Array>();
  for (let o = 8; o < png.length;) {
    const length = view.getUint32(o), type = String.fromCharCode(...png.subarray(o + 4, o + 8));
    out.set(type, png.subarray(o + 8, o + 8 + length));
    o += 12 + length;
  }
  return out;
}
function meanOf(samples: ArrayLike<number>, channel: number): number {
  let sum = 0;
  for (let i = channel; i < samples.length; i += 3) sum += samples[i]!;
  return sum / (samples.length / 3);
}
/** Mean black-subtracted, white-normalized green RAW level in a native-site window. */
function greenLevel(r: SimulateCaptureResult, x0: number, y0: number, x1: number, y1: number): number {
  const raw = r.raw, w = r.plan.exposure.geometry.nativeRaster.pixelWidth;
  let sum = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if ((x + y) % 2 !== 1) continue;
    const i = y * w + x, white = raw.effectiveSaturationCodes[(y % 2) * 2 + (x % 2)]!;
    sum += (raw.codes[i]! - raw.blackLevels[i]!) / (white - raw.blackLevels[i]!); n++;
  }
  return sum / n;
}
/** Sub-pixel x where a row of the green channel crosses the midpoint between its extremes. */
function edgeX(samples: ArrayLike<number>, width: number, y: number): number {
  const row = Array.from({ length: width }, (_, x) => samples[(y * width + x) * 3 + 1]!);
  const mid = (Math.min(...row) + Math.max(...row)) / 2;
  for (let x = 0; x + 1 < width; x++) if ((row[x]! - mid) * (row[x + 1]! - mid) <= 0 && row[x] !== row[x + 1]) return x + (mid - row[x]!) / (row[x + 1]! - row[x]!);
  return NaN;
}
const evidence = [{ sourceOrigin: "photivra" as const, sourceReference: "test:facade-psf", reuseStatus: "photivra-owned" as const }];
/** Engine-owned synthetic sampled PSF bound to the facade defaults (50 mm, f/8, focus 5 m): a 3 × 3 kernel at the pixel pitch. */
function facadePsf(): NonNullable<NonNullable<SimulateCaptureOptions["lens"]>["psf"]> {
  const axes = { focalLengthMm: [50], focusDiopters: [0.2], apertureFNumber: [8], fieldXmm: [-1, 1], fieldYmm: [-1, 1], wavelengthNm: [380, 780], signedDefocusImagePlaneMicrometers: [0] };
  const kernel = { widthSamples: 3, heightSamples: 3, samplePitchMicrometersX: 6, samplePitchMicrometersY: 6, centerSampleX: 1, centerSampleY: 1,
    normalizedIntensity: [0.0625, 0.125, 0.0625, 0.125, 0.25, 0.125, 0.0625, 0.125, 0.0625] };
  const profile: LensSampledPsfProfile = { schemaVersion: "0.1.0", profileId: "test-binomial-psf", profileVersion: "1", scientificStatus: "approximation",
    opticalDomain: "lens-primary-optical-path-only", coordinateSystem: "image-plane-metric", fieldAxes: "+X right, +Y up", kernelEnergyNormalization: "unit-energy-shape",
    interpolation: "bounded-regular-grid-multilinear", throughputOwnership: "separate-relative-pupil-throughput-factor",
    responseIncludes: { diffraction: true, aberration: true, defocus: true, pupilClippingShape: true }, sensorOpticalStackIncluded: false, sensorSamplingIncluded: false,
    reconstructionIncluded: false, strayLightIncluded: false, axes, evidence, limitations: ["Synthetic binomial kernel for a facade test."],
    nodes: axes.fieldXmm.flatMap((x) => axes.fieldYmm.flatMap((y) => axes.wavelengthNm.map((nm) => ({ nodeId: "n-" + x + "-" + y + "-" + nm,
      coordinate: { focalLengthMm: 50, focusDiopters: 0.2, apertureFNumber: 8, fieldXmm: x, fieldYmm: y, wavelengthNm: nm, signedDefocusImagePlaneMicrometers: 0 },
      kernel, bestFocusImagePlaneOffsetMicrometers: 0, relativePupilThroughputFactor: 0.9, evidence, uncertainty: { kind: "not-quantified" as const, limitation: "Synthetic." } })))) };
  return { kind: "sampled-local", configuration: { psf: { profile, focalLengthMm: 50, focus: { kind: "finite", distanceM: 5 }, apertureFNumber: 8, signedDefocusImagePlaneMicrometers: 0 },
    psfWavelengthBasis: { value: "vacuum", evidence }, spatialModel: { kind: "destination-local-shift-invariant-approximation", evidence, limitation: "Synthetic local kernel." } } };
}

describe("simulateCapture 2.0 options", { timeout: 300_000 }, () => {
  it("writes sRGB PNG from exactly the developed sRGB samples, at 8 and 16 bits", async () => {
    const base = { scene: { preset: "checkerboard" as const }, sensor: { noiseSeed: 3 } };
    const srgb8 = await simulateCapture({ ...base, output: { width: 6, height: 4 } }), png8 = await simulateCapture({ ...base, output: { width: 6, height: 4, format: "png" } });
    expect(Array.from(png8.image.samples)).toEqual(Array.from(srgb8.image.samples));
    expect(Array.from(png8.image.png!.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const chunks = pngChunks(png8.image.png!);
    expect(chunks.get("IHDR")![8]).toBe(8);
    expect(chunks.has("sRGB")).toBe(true);
    expect(png8.image.colorEncoding).toBe("srgb");
    expect(png8.assumptions.map((a) => a.id)).toEqual(expect.arrayContaining(["output.colorEncoding", "output.bitDepth", "output.png"]));
    const srgb16 = await simulateCapture({ ...base, output: { width: 6, height: 4, format: "srgb-16" } });
    const png16 = await simulateCapture({ ...base, output: { width: 6, height: 4, format: "png", bitDepth: 16 } });
    expect(png16.image.samples).toBeInstanceOf(Uint16Array);
    expect(Array.from(png16.image.samples)).toEqual(Array.from(srgb16.image.samples));
    expect(pngChunks(png16.image.png!).get("IHDR")![8]).toBe(16);
  });

  it("converts wide-gamut PNG through XYZ from the unclipped linear development", async () => {
    // A saturated green emitter (a 530 nm band on a weak flat floor) lies outside sRGB but inside Display P3 and Rec. 2020.
    const scene = { kind: "radiance-function" as const, sceneId: "green-emitter", evaluate: (p: { wavelengthNanometers: number }): number => 5e-2 * (0.15 + Math.exp(-(((p.wavelengthNanometers - 530) / 30) ** 2))) };
    const options = { scene, sensor: { spectralStepNanometers: 5 }, output: { width: 4, height: 4, whiteBalance: "none" as const, bitDepth: 16 as const } };
    const p3 = await simulateCapture({ ...options, output: { ...options.output, format: "png", colorEncoding: "display-p3" } });
    const rec2020 = await simulateCapture({ ...options, output: { ...options.output, format: "png", colorEncoding: "rec2020" } });
    const srgb = await simulateCapture({ ...options, output: { ...options.output, format: "png", colorEncoding: "srgb" } });
    expect(Array.from(pngChunks(p3.image.png!).get("cICP")!)).toEqual([12, 13, 0, 1]);
    expect(Array.from(pngChunks(rec2020.image.png!).get("cICP")!)).toEqual([9, 1, 0, 1]);
    expect(srgb.diagnostics.rendering.gamutClippedLowSampleCount).toBeGreaterThan(0);
    // Decode each encoding to XYZ: the wide gamuts agree with each other and keep the chroma that sRGB clips.
    const toXyz = (r: SimulateCaptureResult, space: "display-p3" | "rec2020", decode: (v: number) => number): number[] => {
      const m = resolveRgbColorSpace(space).value.rgbToXyz, rgb = [0, 1, 2].map((c) => decode(meanOf(r.image.samples, c) / 65535));
      return m.map((row) => row[0]! * rgb[0]! + row[1]! * rgb[1]! + row[2]! * rgb[2]!);
    };
    const a = toXyz(p3, "display-p3", evaluateSrgbDecoding), b = toXyz(rec2020, "rec2020", evaluateBt709InverseOetf);
    expect(p3.diagnostics.rendering.gamutClippedLowSampleCount).toBe(0);
    expect(rec2020.diagnostics.rendering.gamutClippedLowSampleCount).toBe(0);
    expect(p3.diagnostics.rendering.gamutClippedHighSampleCount + rec2020.diagnostics.rendering.gamutClippedHighSampleCount).toBe(0);
    for (let k = 0; k < 3; k++) expect(a[k]! / b[k]!).toBeCloseTo(1, 2);
    // With the colorimetric (Luther) sensor and no white balance, the wide-gamut result reproduces the emitter's CIE 1931 chromaticity.
    const xy = (xyz: number[]): number[] => [xyz[0]! / (xyz[0]! + xyz[1]! + xyz[2]!), xyz[1]! / (xyz[0]! + xyz[1]! + xyz[2]!)];
    const truth = [0, 0, 0];
    for (let nm = 380; nm <= 780; nm++) { const e = scene.evaluate({ wavelengthNanometers: nm }), c = estimateCie1931ColorMatchingFunctions(nm); truth[0]! += e * c.x; truth[1]! += e * c.y; truth[2]! += e * c.z; }
    const s = resolveRgbColorSpace("srgb").value.rgbToXyz, sRgb = [0, 1, 2].map((c) => evaluateSrgbDecoding(meanOf(srgb.image.samples, c) / 65535));
    const distance = (u: number[], v: number[]): number => Math.hypot(u[0]! - v[0]!, u[1]! - v[1]!);
    expect(distance(xy(a), xy(truth))).toBeLessThan(0.004); // 5 nm spectral quadrature
    expect(distance(xy(s.map((row) => row[0]! * sRgb[0]! + row[1]! * sRgb[1]! + row[2]! * sRgb[2]!)), xy(truth))).toBeGreaterThan(0.015);
    // A neutral grey card is neutral in every encoding and agrees with sRGB in luminance.
    const grey = (colorEncoding: "display-p3" | "rec2100-pq" | "rec2100-hlg"): Promise<SimulateCaptureResult> => simulateCapture({ scene: { preset: "uniform" }, output: { width: 4, height: 4, format: "png", colorEncoding, bitDepth: 16 } });
    const sGrey = await simulateCapture({ scene: { preset: "uniform" }, output: { width: 4, height: 4, format: "srgb-16" } });
    const linearGrey = evaluateSrgbDecoding(meanOf(sGrey.image.samples, 1) / 65535);
    const p3Grey = await grey("display-p3");
    expect(evaluateSrgbDecoding(meanOf(p3Grey.image.samples, 1) / 65535) / linearGrey).toBeCloseTo(1, 2);
    const pq = await grey("rec2100-pq"), hlg = await grey("rec2100-hlg");
    expect(Array.from(pngChunks(pq.image.png!).get("cICP")!)).toEqual([9, 16, 0, 1]);
    expect(Array.from(pngChunks(hlg.image.png!).get("cICP")!)).toEqual([9, 18, 0, 1]);
    // PQ: relative 1.0 = 203 cd/m² (BT.2408); HLG: relative 1.0 at signal 0.75.
    expect(evaluatePqEotf(meanOf(pq.image.samples, 1) / 65535) / 203 / linearGrey).toBeCloseTo(1, 2);
    expect(evaluateHlgInverseOetf(meanOf(hlg.image.samples, 1) / 65535) / evaluateHlgInverseOetf(0.75) / linearGrey).toBeCloseTo(1, 2);
    for (const r of [p3Grey, pq, hlg]) expect(Math.abs(meanOf(r.image.samples, 0) - meanOf(r.image.samples, 1)) / meanOf(r.image.samples, 1)).toBeLessThan(0.01);
    expect(pq.assumptions.find((x) => x.id === "output.colorEncoding.conversion")!.explanation).toMatch(/no highlight headroom/);
  });

  it("refuses DNG output with the reason instead of declaring a linear master that never existed", async () => {
    await expect(simulateCapture({ scene: { preset: "uniform" }, output: { width: 4, height: 4, format: "dng" as never } })).rejects.toThrow(/linear-master source/);
  });

  it("selects built-in demosaic kernels and mirror borders", async () => {
    const base = { scene: { preset: "slanted-edge" as const }, sensor: { noiseSeed: 5 } };
    const legacy = await simulateCapture({ ...base, output: { width: 8, height: 6 } });
    const bilinear = await simulateCapture({ ...base, output: { width: 8, height: 6, demosaic: "bilinear" } });
    // The built-in bilinear kernels reproduce the 1.0 facade's bilinear kernels pixel for pixel.
    expect(Array.from(bilinear.image.samples)).toEqual(Array.from(legacy.image.samples));
    const mhc = await simulateCapture({ ...base, output: { width: 8, height: 6, demosaic: "malvar-he-cutler" } });
    expect(mhc.plan.exposure.geometry.nativeRaster).toEqual({ pixelWidth: 12, pixelHeight: 10 });
    expect(mhc.assumptions.find((a) => a.id === "output.demosaic")!.value).toMatchObject({ kernel: "malvar-he-cutler-2004", kernelReachSites: 2 });
    const mirror = await simulateCapture({ scene: { preset: "uniform" }, output: { width: 6, height: 4, demosaic: "malvar-he-cutler", borderHandling: "mirror" } });
    expect(mirror.plan.exposure.geometry.nativeRaster).toEqual({ pixelWidth: 6, pixelHeight: 4 });
    expect(mirror.request.development.borderHandling).toBe("mirror");
    // Uniform field: the mirrored edge pixels develop like the interior (no lost or darkened border).
    const s = mirror.image.samples, interior = s[(1 * 6 + 2) * 3 + 1]!;
    for (const [x, y] of [[0, 0], [5, 0], [0, 3], [5, 3]]) expect(Math.abs(s[(y! * 6 + x!) * 3 + 1]! - interior)).toBeLessThanOrEqual(6);
  });

  it("maps lens projection and distortion through the environment lens field mapping", async () => {
    const base = { scene: { preset: "uniform" as const }, output: { width: 8, height: 8 }, sensor: { noiseSeed: 7 } };
    const plain = await simulateCapture(base);
    const identity = await simulateCapture({ ...base, lens: { projection: "rectilinear" } });
    expect(Array.from(identity.raw.codes)).toEqual(Array.from(plain.raw.codes));
    expect(identity.request.siteInput(0).environment.lensFieldMapping).toEqual({ projectionModel: "rectilinear", distortion: { kind: "none" }, radiometricAreaCorrection: "inverse-distortion-jacobian" });
    const fisheye = await simulateCapture({ ...base, lens: { projection: "fisheye-equidistant" } });
    expect(fisheye.assumptions.find((a) => a.id === "lens.projection")!.value).toBe("fisheye-equidistant");
    // Barrel distortion compresses the field off axis, so the area factor 1/det(J) brightens the corners of a uniform scene.
    const barrel = await simulateCapture({ ...base, lens: { distortion: { kind: "radial", profile: { normalizationRadiusMm: 0.05, maximumNormalizedRadius: 1, coefficients: { k1: -0.2, k2: 0, k3: 0 } } } } });
    const centre = greenLevel(barrel, 4, 4, 6, 6), corner = greenLevel(barrel, 0, 0, 2, 2);
    expect(corner / centre).toBeGreaterThan(1.5);
    expect(greenLevel(plain, 0, 0, 2, 2) / greenLevel(plain, 4, 4, 6, 6)).toBeCloseTo(1, 1);
    const tangential = await simulateCapture({ ...base, lens: { distortion: { kind: "brown-conrady", profile: { normalizationRadiusMm: 0.05, maximumNormalizedRadius: 1,
      coefficients: { k1: 0, k2: 0, k3: 0, p1: 0.02, p2: 0 } } } } });
    expect(tangential.assumptions.find((a) => a.id === "lens.distortion")!.value).toMatchObject({ kind: "brown-conrady" });
  });

  it("applies caller vignetting and a sampled PSF as environment hooks", async () => {
    const base = { scene: { preset: "uniform" as const }, output: { width: 8, height: 8 }, sensor: { noiseSeed: 9 } };
    const vignetted = await simulateCapture({ ...base, lens: { vignetting: { normalizationRadiusMm: 0.05, maximumNormalizedRadius: 1, coefficients: { r2: -0.8, r4: 0, r6: 0 } } } });
    // Expected ratio: mean of 1 + r2·ρ² over the green sites of each window, ρ = radius / 0.05 mm on the 10 × 10-site, 6 µm frame.
    const throughput = (x0: number, y0: number, x1: number, y1: number): number => { let sum = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if ((x + y) % 2 === 1) { sum += 1 - 0.8 * (((x + 0.5 - 5) ** 2 + (y + 0.5 - 5) ** 2) * 0.006 ** 2) / 0.05 ** 2; n++; }
      return sum / n; };
    expect(greenLevel(vignetted, 0, 0, 2, 2) / greenLevel(vignetted, 4, 4, 6, 6)).toBeCloseTo(throughput(0, 0, 2, 2) / throughput(4, 4, 6, 6), 1);
    expect(vignetted.request.siteInput(0).environment.fieldThroughput.kind).toBe("radial-illumination-vignetting");
    const edge = { scene: { preset: "slanted-edge" as const, angleDegrees: 0 }, output: { width: 8, height: 4 }, sensor: { noiseSeed: 9 } };
    const sharp = await simulateCapture(edge), blurred = await simulateCapture({ ...edge, lens: { psf: facadePsf() } });
    const step = (r: SimulateCaptureResult): number => { let m = 0; for (let x = 0; x < 7; x++) m = Math.max(m, Math.abs(r.image.samples[(8 + x + 1) * 3 + 1]! - r.image.samples[(8 + x) * 3 + 1]!)); return m; };
    expect(step(blurred)).toBeLessThan(step(sharp));
    expect(blurred.assumptions.find((a) => a.id === "lens.psf")!.value).toEqual({ kind: "sampled-local" });
  });

  it("blurs with camera rotation and shears with a rolling shutter", async () => {
    // Yaw ω moves the image by ω·f/pitch = 500 px/s; over 1/125 s that is 4 px of blur.
    const edge = { scene: { preset: "slanted-edge" as const, angleDegrees: 0 }, output: { width: 16, height: 12 }, sensor: { noiseSeed: 11 } };
    const still = await simulateCapture(edge), moving = await simulateCapture({ ...edge, motion: { angularVelocityRadPerSec: { yaw: 0.06 } } });
    expect(moving.assumptions.find((a) => a.id === "sensor.temporalSampleCount")!.value).toBe(8);
    const transition = (r: SimulateCaptureResult): number => { const row = Array.from({ length: 16 }, (_, x) => r.image.samples[(6 * 16 + x) * 3 + 1]!), lo = Math.min(...row), hi = Math.max(...row);
      return row.filter((v) => v > lo + 0.1 * (hi - lo) && v < hi - 0.1 * (hi - lo)).length; };
    expect(transition(moving)).toBeGreaterThan(transition(still) + 1);
    const rolling = await simulateCapture({ ...edge, motion: { angularVelocityRadPerSec: { yaw: 0.06 }, shutter: "rolling", rollingShutterSkewSeconds: 0.01 } });
    // Each native row opens s·τ later: site start offsets grow linearly down the frame (top-to-bottom tier readout).
    const start = (y: number): number => rolling.request.siteInput(y * 18).charge.completenessProfile.startOffsetSecondsFromOpeningReference;
    expect(start(0)).toBeLessThan(start(13));
    expect(start(13) - start(0)).toBeCloseTo(0.01 * 13 / 14, 3);
    // Shear: the edge moves 500 px/s · τ across the frame relative to the global-shutter capture.
    const shear = (r: SimulateCaptureResult): number => edgeX(r.image.samples, 16, 10) - edgeX(r.image.samples, 16, 1);
    expect(Math.abs(shear(moving))).toBeLessThan(0.5);
    expect(Math.abs(shear(rolling))).toBeGreaterThan(2.5);
    expect(Math.abs(shear(rolling))).toBeLessThan(4.5);
    expect(rolling.assumptions.find((a) => a.id === "sensor.shutter")!.value).toMatchObject({ kind: "electronic-rolling", lineScanSkewSeconds: 0.01 });
    const tier = await simulateCapture({ scene: { preset: "uniform" }, output: { width: 4, height: 4 }, motion: { shutter: "rolling" } });
    expect(tier.assumptions.find((a) => a.id === "sensor.shutter")!.explanation).toMatch(/not scaled/);
  });

  it("rejects inconsistent 2.0 options before any radiance work", async () => {
    let calls = 0;
    const scene = { kind: "radiance-function" as const, sceneId: "never", evaluate: (): number => { calls++; return 0.01; } };
    const bad: SimulateCaptureOptions[] = [
      { scene, output: { colorEncoding: "display-p3" } },
      { scene, output: { format: "png", colorEncoding: "rec2100-pq", bitDepth: 8 } },
      { scene, output: { format: "png", colorEncoding: "rec2020", toneCurve: "positive-reinhard-per-channel" } },
      { scene, output: { format: "dng" as never } },
      { scene, output: { format: "png", bitDepth: 12 as never } },
      { scene, output: { demosaic: "ahd" as never } },
      { scene, output: { borderHandling: "wrap" as never } },
      { scene, lens: { projection: "fisheye-equidistant", pupilSampling: { radialSamples: 1, angularSamples: 4 } } },
      { scene, lens: { distortion: { kind: "radial", profile: { normalizationRadiusMm: 1, maximumNormalizedRadius: 1, coefficients: { k1: -2, k2: 0, k3: 0 } } } } },
      { scene, lens: { psf: { kind: "other" } as never } },
      { scene, lens: { pupilSampling: { radialSamples: 1, angularSamples: 3 } } },
      { scene, motion: { rollingShutterSkewSeconds: 0.01 } },
      { scene, motion: { shutter: "focal-plane" as never } },
      { scene, motion: { angularVelocityRadPerSec: { yaw: Number.NaN } } },
      { scene, motion: { spin: 1 } as never }
    ];
    for (const options of bad) await expect(simulateCapture(options), JSON.stringify(options, (_k, v: unknown) => typeof v === "function" ? "fn" : v)).rejects.toThrow(InvalidConfigurationError);
    expect(calls).toBe(0);
  });
});
