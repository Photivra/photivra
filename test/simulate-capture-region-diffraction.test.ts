// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { InvalidConfigurationError, createPlanarSceneRadianceProvider, simulateCapture, type SimulateCaptureOptions, type SimulateCaptureResult } from "../src/index.js";
import { createDiffractedPlanarProvider } from "../src/facade/diffraction-provider.js";
import { scaledTimeout } from "./helpers/test-timeout.js";

type Region = { x: number; y: number; width: number; height: number };

/** The region's samples and native RAW codes cut from the whole render. */
function crop(whole: SimulateCaptureResult, region: Region, nativeRect: Region): { samples: number[]; codes: number[] } {
  const width = whole.image.width, nativeWidth = whole.plan.exposure.geometry.nativeRaster.pixelWidth, samples: number[] = [], codes: number[] = [];
  for (let y = 0; y < region.height; y++) for (let x = 0; x < region.width * 3; x++) samples.push(whole.image.samples[((region.y + y) * width + region.x) * 3 + x]!);
  for (let y = 0; y < nativeRect.height; y++) for (let x = 0; x < nativeRect.width; x++) codes.push(whole.raw.codes[(nativeRect.y + y) * nativeWidth + nativeRect.x + x]!);
  return { samples, codes };
}

/** Regions of a W × H frame: centre, two corners, two edges, 1-pixel-wide strips (vertical at the edge and inside, horizontal) and the whole frame. */
function regions(W: number, H: number): Region[] {
  return [{ x: Math.floor(W / 2) - 6, y: Math.floor(H / 2) - 4, width: 12, height: 8 }, { x: 0, y: 0, width: 7, height: 5 }, { x: W - 7, y: H - 5, width: 7, height: 5 },
    { x: 0, y: Math.floor(H / 2) - 2, width: 6, height: 6 }, { x: Math.floor(W / 2) - 4, y: 0, width: 9, height: 4 }, { x: W - 1, y: 0, width: 1, height: H },
    { x: Math.floor(W / 2), y: 0, width: 1, height: H }, { x: 0, y: Math.floor(H / 2) + 1, width: W, height: 1 }, { x: 0, y: 0, width: W, height: H }];
}

// The Quality options together: diffraction, the four-spot anti-aliasing filter, the box pixel aperture and AHD.
const quality = (pitch: number, fNumber: number, box: 2 | 4 = 2): SimulateCaptureOptions => ({
  scene: { preset: "siemens-star", cycles: 16 }, lens: { fNumber, diffraction: "circular-aperture" },
  sensor: { pixelPitchMicrometers: pitch, antiAliasing: { kind: "four-spot" }, pixelAperture: box === 4 ? "box" : { kind: "box", samplesPerAxis: 2 } },
  output: { width: 32, height: 24, demosaic: "ahd" } });

describe("output.region with lens.diffraction (2.6): region-limited convolution, byte-identical to the whole render", () => {
  const cases: [string, SimulateCaptureOptions, number[]?][] = [
    ["6 µm, f/16 (kernel radius 7)", quality(6, 16)],
    ["6 µm, f/4 (kernel radius 2)", quality(6, 4)],
    ["6 µm, f/8, 4 × 4 box (centre, corner, strip)", quality(6, 8, 4), [0, 1, 6]],
    ["2 µm, f/11 (kernel radius 15)", quality(2, 11)],
    ["48 µm, f/5.6", quality(48, 5.6)],
    ["250 µm, f/16 (whole-frame view pitch)", quality(250, 16)],
    ["6 µm, f/16, bilinear, no filters", { scene: { preset: "slanted-edge" }, lens: { fNumber: 16, diffraction: "circular-aperture" }, output: { width: 32, height: 24 } }]
  ];
  for (const [name, options, subset] of cases) {
    it(name, async () => {
      const whole = await simulateCapture(options);
      expect(whole.request.diffraction!.execution).toBe("object-space-convolution");
      for (const region of regions(32, 24).filter((_, i) => !subset || subset.includes(i))) {
        const part = await simulateCapture({ ...options, output: { ...options.output, region } });
        const expected = crop(whole, region, part.region!.nativeRect);
        expect(Array.from(part.image.samples)).toEqual(expected.samples);
        expect(Array.from(part.raw.codes)).toEqual(expected.codes);
      }
    }, scaledTimeout(240_000));
  }
});

describe("createDiffractedPlanarProvider window (2.6)", () => {
  const base = createPlanarSceneRadianceProvider({ scene: { preset: "siemens-star" }, illuminant: { kind: "planckian", temperatureKelvin: 6500 }, illuminanceLux: 20_000,
    distanceM: 5, framedWidthM: 1, aspect: 0.5, sceneId: "s", providerProfileId: "p" });
  const W = 202, H = 102, outputWidth = 200, metresPerFrameUnit = 0.5;

  async function setup(): Promise<{ R: number; make: (window?: Region, counter?: { calls: number }) => ReturnType<typeof createDiffractedPlanarProvider> }> {
    const r = await simulateCapture({ scene: { preset: "siemens-star" }, lens: { fNumber: 16, diffraction: "circular-aperture" }, output: { width: 4, height: 4 } });
    const d = r.request.diffraction!, R = d.profile.kernelRadiusSamples;
    const offsets = [{ x: -0.75, y: -0.75 }, { x: 0.25, y: -0.75 }, { x: -0.75, y: 0.25 }, { x: 0.25, y: 0.25 }];
    return { R, make: (window, counter) => createDiffractedPlanarProvider({ base: counter ? { ...base, radianceAt: (u: number, v: number, nm: number): number => { counter.calls++; return base.radianceAt(u, v, nm); } } : base,
      psf: d.psf.configuration.psf, wavelengthsNm: [550], kernelRadius: R, nativeWidth: W, nativeHeight: H, outputWidth, sitePitchMicrometers: 6,
      distanceM: 5, metresPerFrameUnit, queryOffsetsSites: offsets, ...(window ? { window } : {}) }) };
  }
  // The direction the environment queries for native site (i, j) at a query offset (sites).
  const query = (i: number, j: number, o: { x: number; y: number }): { x: number; y: number; z: number } => {
    const g = 2 / outputWidth, u = (i + 0.5 + o.x - W / 2) * g, v = -(j + 0.5 + o.y - H / 2) * g, x = -u * metresPerFrameUnit, y = -v * metresPerFrameUnit, n = Math.hypot(x, y, 5);
    return { x: x / n, y: y / n, z: -5 / n };
  };
  const value = (provider: ReturnType<typeof createDiffractedPlanarProvider>, direction: { x: number; y: number; z: number }): number =>
    provider.evaluateRadiance({ schemaVersion: "0.1.0", sampleId: "q", sceneId: "s", providerProfileId: "p", wavelengthNanometers: 550, wavelengthBasis: "resolved-wavelength",
      target: { kind: "environment-direction", outgoingDirectionUnitVector: direction } } as never).spectralRadianceWattsPerSquareMeterSteradianNanometer;

  it("gives bit-identical values inside the window, evaluates only the window plus its halo, and refuses queries outside it", async () => {
    const { make, R } = await setup();
    const window = { x: 90, y: 40, width: 12, height: 9 }, full = make(), counter = { calls: 0 }, narrow = make(window, counter);
    for (let j = window.y; j < window.y + window.height; j++) for (let i = window.x; i < window.x + window.width; i++)
      for (const o of [{ x: -0.75, y: -0.75 }, { x: 0.25, y: 0.25 }]) expect(Object.is(value(narrow, query(i, j, o)), value(full, query(i, j, o)))).toBe(true);
    // One band (window rows + 2M ≤ 32) of (rows + 2M + 2R) × (columns + 2M + 2R) samples: M = 1, and every offset has the fraction 0.25 (one lattice).
    expect(counter.calls).toBe((window.height + 2 + 2 * R) * (window.width + 2 + 2 * R));
    expect(() => value(narrow, query(window.x + window.width + 2, window.y, { x: 0.25, y: 0.25 }))).toThrow(InvalidConfigurationError);
    expect(() => make({ x: W + 5, y: 0, width: 2, height: 2 })).toThrow(InvalidConfigurationError);
  }, scaledTimeout(60_000));
});
