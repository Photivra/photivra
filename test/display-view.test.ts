// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InvalidConfigurationError, calculateEnvironmentSensorPhotoSignal, createPlanarSceneRadianceProvider, simulateCapture, simulateDisplayView,
  SIMULATE_DISPLAY_VIEW_DEFAULT_SAMPLES_PER_AXIS, type CalculateEnvironmentSensorPhotoSignalInput, type SimulateCaptureOptions, type SimulateDisplayViewOptions } from "../src/index.js";
import { simulateDisplayViewWithInternals } from "../src/facade/simulate-capture.js";
import { createDiffractedPlanarProvider } from "../src/facade/diffraction-provider.js";
import { axisSums, clearDisplayViewCorrectionStates, displayViewCorrectionStateCount, footprintWeights, reinhardMoments, unitClip, upperClip } from "../src/facade/display-view.js";
import { scaledTimeout as testTimeout } from "./helpers/test-timeout.js";

const decode = (code: number, maximum: number): number => { const e = code / maximum; return e <= 0.04045 ? e / 12.92 : ((e + 0.055) / 1.055) ** 2.4; };
const encode8 = (l: number): number => 255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * Math.min(1, l) ** (1 / 2.4) - 0.055);
/** The reference definition: the full-resolution capture's 16-bit samples decoded, then area-averaged per display pixel. */
function areaAverage(samples: ArrayLike<number>, frameWidth: number, frameHeight: number, viewWidth: number, viewHeight: number): Float64Array {
  const sx = frameWidth / viewWidth, sy = frameHeight / viewHeight, out = new Float64Array(viewWidth * viewHeight * 3);
  for (let j = 0; j < viewHeight; j++) for (let i = 0; i < viewWidth; i++) for (let y = Math.floor(j * sy); y < Math.ceil((j + 1) * sy); y++) {
    const wy = Math.min((j + 1) * sy, y + 1) - Math.max(j * sy, y);
    for (let x = Math.floor(i * sx); x < Math.ceil((i + 1) * sx); x++) {
      const w = wy * (Math.min((i + 1) * sx, x + 1) - Math.max(i * sx, x)) / (sx * sy);
      for (let k = 0; k < 3; k++) out[(j * viewWidth + i) * 3 + k] = out[(j * viewWidth + i) * 3 + k]! + w * decode(samples[(y * frameWidth + x) * 3 + k]!, 65535);
    }
  }
  return out;
}
const channel = (a: ArrayLike<number>, k: number): number[] => Array.from({ length: a.length / 3 }, (_, i) => a[3 * i + k]!);
const mean = (a: readonly number[]): number => a.reduce((s, v) => s + v, 0) / a.length;
const sd = (a: readonly number[]): number => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };

describe("simulateDisplayView", () => {
  it("evaluates each real site's expected electrons exactly as the capture's environment chain does", async () => {
    const red = { kind: "function" as const, wavelengthRangeNanometers: { minimum: 380, maximum: 780 }, evaluate: (nm: number): number => (nm > 600 ? 0.7 : 0.08) };
    const cases: SimulateCaptureOptions[] = [
      { scene: { preset: "siemens-star", cycles: 12 }, output: { width: 24, height: 16 } },
      { scene: { preset: "slanted-edge", angleDegrees: 30 }, sensor: { pixelAperture: { kind: "box", samplesPerAxis: 2 }, antiAliasing: { kind: "four-spot" } }, output: { width: 24, height: 16 } },
      { scene: { preset: "siemens-star", cycles: 12 }, lens: { fNumber: 16, diffraction: "circular-aperture" }, sensor: { antiAliasing: { kind: "four-spot" } }, output: { width: 24, height: 16, demosaic: "ahd" } },
      { scene: { preset: "slanted-edge", angleDegrees: 20 }, lens: { diffraction: "circular-aperture" }, sensor: { pixelAperture: { kind: "box", samplesPerAxis: 2 } }, output: { width: 20, height: 14, borderHandling: "mirror" } },
      { scene: { kind: "reflectance-function", sceneId: "rings", evaluate: (p) => 0.4 + 0.3 * Math.cos(40 * Math.hypot(p.u, p.v)) }, lens: { diffraction: "circular-aperture" }, output: { width: 16, height: 12 } },
      { scene: { preset: "patches", patches: [{ patchId: "a", reflectance: red }, { patchId: "b", reflectance: 0.5 }], columns: 2 }, chartSize: { widthM: 0.002, surroundReflectance: 0.3 },
        lens: { diffraction: "circular-aperture" }, output: { width: 20, height: 16 } },
      { scene: { preset: "patches", patches: [{ patchId: "a", reflectance: red }, { patchId: "b", reflectance: 0.5 }], columns: 2 }, output: { width: 20, height: 16 } }
    ];
    for (const options of cases) {
      const capture = await simulateCapture(options), { signal } = await simulateDisplayViewWithInternals(options, { width: 4, height: 4, samplesPerAxis: 1 });
      const env = capture.request.environmentRaw.raw.exposure.geometry, nativeWidth = env.nativeRaster.pixelWidth, nativeHeight = env.nativeRaster.pixelHeight;
      const base = createPlanarSceneRadianceProvider({ scene: options.scene, illuminant: { kind: "planckian", temperatureKelvin: 6500 }, illuminanceLux: capture.scene.illuminant.illuminanceLux,
        distanceM: capture.scene.distanceM, framedWidthM: capture.scene.framedWidthM, aspect: capture.scene.framedHeightM / capture.scene.framedWidthM, sceneId: "facade-scene",
        providerProfileId: "facade-provider", ...(options.chartSize ? { chartSize: options.chartSize } : {}) });
      // With diffraction the capture answers each query from the object-space convolution (the same internal provider here).
      const d = capture.request.diffraction, pitch = 6, aa = options.sensor?.antiAliasing ? [-0.5, 0.5] : [0];
      const box = typeof options.sensor?.pixelAperture === "object" ? options.sensor.pixelAperture.samplesPerAxis ?? 4 : 1;
      const nodes = Array.from({ length: box }, (_, i) => (i + 0.5) / box - 0.5);
      const provider = d ? createDiffractedPlanarProvider({ base, psf: d.psf.configuration.psf, wavelengthsNm: d.profile.profile.axes.wavelengthNm, kernelRadius: d.profile.kernelRadiusSamples,
        nativeWidth, nativeHeight, outputWidth: options.output!.width!, sitePitchMicrometers: pitch, distanceM: capture.scene.distanceM, metresPerFrameUnit: capture.scene.framedWidthM / 2,
        ...(aa.length > 1 || box > 1 ? { queryOffsetsSites: nodes.flatMap((ny) => nodes.flatMap((nx) => aa.flatMap((ay) => aa.map((ax) => ({ x: nx - ax, y: ny - ay }))))) } : {}) }) : base;
      for (let k = 0; k < 24; k++) {
        const index = (k * 7919 + 13) % (nativeWidth * nativeHeight), x = index % nativeWidth, y = Math.floor(index / nativeWidth);
        const environment = capture.request.siteInput(index).environment as unknown as Record<string, unknown>;
        const engine = (calculateEnvironmentSensorPhotoSignal({ ...environment, evaluateRadiance: provider.evaluateRadiance } as unknown as CalculateEnvironmentSensorPhotoSignalInput)
          .value as unknown as { photo: { value: { photoSignal: { expectedGeneratedElectronCount: number } } } }).photo.value.photoSignal.expectedGeneratedElectronCount;
        expect(Math.abs(signal.site(x, y) - engine)).toBeLessThanOrEqual(1e-9 * engine + 1e-12);
      }
    }
  }, testTimeout(120_000));

  it("computes the demosaic correlation weights B_c = Σ β² in closed form", () => {
    for (const [start, length, margin] of [[3.3, 7.7, 1], [10, 6, 5], [0.25, 15.625, 0], [41.9, 2.6, 1]] as const) {
      const ys = { start: start * 0.7, length: length * 1.3 };
      const out = new Float64Array(4);
      footprintWeights(axisSums(start, start + length, 1000, margin), axisSums(ys.start, ys.start + ys.length, 1000, margin), length * ys.length, out);
      // Brute force: spread each pixel's display weight through the bilinear kernels of its CFA phase onto the sites.
      const beta = new Map<string, number>(), area = length * ys.length;
      const wx = (x: number): number => Math.max(0, Math.min(start + length, x + 1) - Math.max(start, x)), wy = (y: number): number => Math.max(0, Math.min(ys.start + ys.length, y + 1) - Math.max(ys.start, y));
      const channelOf = (x: number, y: number): number => ((y + margin) & 1) === 0 ? (((x + margin) & 1) === 0 ? 0 : 1) : (((x + margin) & 1) === 0 ? 1 : 2);
      for (let y = Math.floor(ys.start); y < ys.start + ys.length; y++) for (let x = Math.floor(start); x < start + length; x++) {
        const w = wx(x) * wy(y) / area;
        if (w === 0) continue;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const c = channelOf(x + dx, y + dy), own = channelOf(x, y);
          let weight = 0;
          if (dx === 0 && dy === 0) weight = 1;
          else if (c === 1 && own !== 1) weight = dx === 0 || dy === 0 ? 0.25 : 0;
          else if (c !== 1 && own === 1) weight = dx === 0 || dy === 0 ? 0.5 : 0;
          else if (c !== 1 && own !== 1 && c !== own) weight = dx !== 0 && dy !== 0 ? 0.25 : 0;
          if (weight === 0) continue;
          const key = (x + dx) + "," + (y + dy) + "," + c;
          beta.set(key, (beta.get(key) ?? 0) + w * weight);
        }
      }
      const sums = [0, 0, 0], totals = [0, 0, 0];
      for (const [key, value] of beta) { const c = Number(key.split(",")[2]); sums[c]! += value * value; totals[c]! += value; }
      for (const c of [0, 1, 2]) { expect(totals[c]).toBeCloseTo(1, 12); expect(out[c]).toBeCloseTo(sums[c]!, 12); }
      let pixels = 0;
      for (let y = Math.floor(ys.start); y < ys.start + ys.length; y++) for (let x = Math.floor(start); x < start + length; x++) pixels += (wx(x) * wy(y) / area) ** 2;
      expect(out[3]).toBeCloseTo(pixels, 12);
    }
  });

  it("propagates normal moments through the clips and the tone curve exactly", () => {
    const integrate = (m: number, v: number, h: (x: number) => number): [number, number] => {
      const s = Math.sqrt(v), n = 200_000;
      let e1 = 0, e2 = 0;
      for (let i = 0; i < n; i++) { const x = m - 10 * s + (i + 0.5) * 20 * s / n, w = Math.exp(-0.5 * ((x - m) / s) ** 2) / (s * Math.sqrt(2 * Math.PI)) * 20 * s / n, y = h(x); e1 += w * y; e2 += w * y * y; }
      return [e1, e2 - e1 * e1];
    };
    const out = new Float64Array(3);
    for (const [m, v] of [[0.95, 0.002], [1.02, 0.0004], [0.4, 0.01], [-0.01, 0.0009], [0.5, 1e-8]] as const) {
      upperClip(m, v, 1, out);
      const [e, variance] = integrate(m, v, (x) => Math.min(x, 1));
      expect(out[0]).toBeCloseTo(e, 6); expect(out[1]).toBeCloseTo(variance, 6);
      unitClip(m, v, out);
      const [eu, vu] = integrate(m, v, (x) => Math.min(1, Math.max(0, x)));
      expect(out[0]).toBeCloseTo(eu, 6); expect(out[1]).toBeCloseTo(vu, 6);
      reinhardMoments(m, v, out);
      const [er, vr] = integrate(m, v, (x) => (x > 0 ? x / (1 + x) : 0));
      expect(out[0]).toBeCloseTo(er, 6); expect(out[1]).toBeCloseTo(vr, 6);
    }
  });

  it("corrects the clip at zero for Poisson skewness", () => {
    // Y = a·N − b with N ~ Poisson(λ): mean, variance and skewness are exact; E[clip(Y, 0, 1)] by summing the probabilities.
    const out = new Float64Array(3);
    for (const [lambda, a, b] of [[6, 0.03, 0.15], [12, 0.02, 0.2], [4, 0.05, 0.12]] as const) {
      let exact = 0, p = Math.exp(-lambda);
      for (let n = 0; n < 200; n++) { exact += p * Math.min(1, Math.max(0, a * n - b)); p *= lambda / (n + 1); }
      const m = a * lambda - b, v = a * a * lambda, gamma = 1 / Math.sqrt(lambda);
      unitClip(m, v, out);
      const normalError = Math.abs(out[0]! - exact);
      unitClip(m, v, out, gamma);
      expect(Math.abs(out[0]! - exact)).toBeLessThan(normalError / 2);
    }
  });

  it("matches the box-downsized full-resolution capture: mean and noise", async () => {
    // 192 × 128 real pixels at 3 µm shown at 24 × 16 (8 × 8 real pixels per display pixel); 16-bit samples for the statistics.
    for (const [reflectance, iso, shutterSeconds] of [[0.18, 100, 1 / 125], [0.18, 6400, 1 / 8000], [0.03, 6400, 1 / 8000]] as const) {
      const options: SimulateCaptureOptions = { scene: { preset: "uniform", reflectance }, exposure: { iso, shutterSeconds }, sensor: { pixelPitchMicrometers: 3 }, output: { width: 192, height: 128 } };
      const capture = await simulateCapture({ ...options, output: { ...options.output, format: "srgb-16" } });
      const reference = areaAverage(capture.image.samples, 192, 128, 24, 16);
      const { result, internals } = await simulateDisplayViewWithInternals(options, { width: 24, height: 16, format: "srgb-16" });
      const view = Float64Array.from(result.image.samples, (c) => decode(c, 65535));
      for (const k of [0, 1, 2]) {
        const r = channel(reference, k), v = channel(view, k);
        // Mean within 0.25 8-bit codes plus three standard errors of the two 384-pixel means.
        const standardError = Math.sqrt(sd(r) ** 2 + sd(v) ** 2) / Math.sqrt(r.length);
        expect(Math.abs(encode8(mean(v)) - encode8(mean(r)))).toBeLessThan(0.25 + 3 * standardError * 255 * 2);
        // Noise: the view's predicted and drawn standard deviations against the reference's, within 20 % (sampling error of 384 pixels: 3.6 %).
        const predicted = Math.sqrt(mean(channel(internals.noiseStd, k).map((s) => s * s)));
        expect(predicted / sd(r)).toBeGreaterThan(0.8); expect(predicted / sd(r)).toBeLessThan(1.2);
        expect(sd(v) / sd(r)).toBeGreaterThan(0.8); expect(sd(v) / sd(r)).toBeLessThan(1.2);
      }
    }
  }, testTimeout(120_000));

  it("matches the box-downsized capture at low signal with AHD, in clipped highlights and with a tone curve", async () => {
    const cases: [SimulateCaptureOptions, number][] = [
      // About six electrons per site: AHD's noise-driven choice and the Poisson skew both matter here.
      [{ scene: { preset: "uniform", reflectance: 0.18 }, exposure: { iso: 6400, shutterSeconds: 1 / 8000 }, sensor: { pixelPitchMicrometers: 1.4 }, output: { width: 192, height: 128, demosaic: "ahd" } }, 1],
      // Two stops over on a light grey: the per-site clip at white and the highlight clip.
      [{ scene: { preset: "uniform", reflectance: 0.6 }, exposure: { shutterSeconds: 1 / 30 }, sensor: { pixelPitchMicrometers: 3 }, output: { width: 192, height: 128 } }, 0.3],
      [{ scene: { preset: "step-wedge" }, exposure: { iso: 3200, shutterSeconds: 1 / 4000 }, sensor: { pixelPitchMicrometers: 3 },
        output: { width: 192, height: 128, toneCurve: "positive-reinhard-per-channel" } }, 0.5]
    ];
    for (const [options, limit] of cases) {
      const capture = await simulateCapture({ ...options, output: { ...options.output, format: "srgb-16" } });
      const reference = areaAverage(capture.image.samples, 192, 128, 24, 16);
      const { internals } = await simulateDisplayViewWithInternals(options, { width: 24, height: 16, format: "srgb-16" });
      for (const k of [0, 1, 2]) {
        const r = channel(reference, k), e = channel(internals.expected, k);
        // Expected value against the reference mean, within the limit plus three standard errors of the reference mean.
        const standardError = sd(r) / Math.sqrt(r.length), m = mean(r);
        expect(Math.abs(encode8(mean(e)) - encode8(m))).toBeLessThan(limit + encode8(m + 3 * standardError) - encode8(m));
      }
    }
  }, testTimeout(120_000));

  it("matches the box-downsized capture of a slanted edge", async () => {
    const options: SimulateCaptureOptions = { scene: { preset: "slanted-edge" }, lens: { diffraction: "circular-aperture" }, sensor: { pixelPitchMicrometers: 3 }, output: { width: 192, height: 128 } };
    const capture = await simulateCapture({ ...options, output: { ...options.output, format: "srgb-16" } });
    const reference = areaAverage(capture.image.samples, 192, 128, 24, 16);
    const { internals } = await simulateDisplayViewWithInternals(options, { width: 24, height: 16, samplesPerAxis: 16 });
    let sq = 0, max = 0;
    for (let i = 0; i < reference.length; i++) { const d = encode8(internals.expected[i]!) - encode8(reference[i]!); sq += d * d; max = Math.max(max, Math.abs(d)); }
    expect(Math.sqrt(sq / reference.length)).toBeLessThan(0.6);
    expect(max).toBeLessThan(3);
  }, testTimeout(60_000));

  it("is labelled, deterministic, region-identical and reports its conventions", async () => {
    const options: SimulateCaptureOptions = { scene: { preset: "dead-leaves" }, sensor: { pixelPitchMicrometers: 2 }, output: { width: 300, height: 200 } };
    const a = await simulateDisplayView(options, { width: 30, height: 20 }), b = await simulateDisplayView(options, { width: 30, height: 20 });
    expect(a.kind).toBe("display-view");
    expect(a.label).toMatch(/not a capture/u);
    expect(a).not.toHaveProperty("raw");
    expect(Array.from(a.image.samples)).toEqual(Array.from(b.image.samples));
    expect(a.view).toMatchObject({ width: 30, height: 20, frameWidth: 300, frameHeight: 200, scaleX: 10, scaleY: 10, samplesPerAxis: SIMULATE_DISPLAY_VIEW_DEFAULT_SAMPLES_PER_AXIS });
    expect(a.assumptions.map((x) => x.id)).toEqual(expect.arrayContaining(["view.definition", "view.estimation", "view.noise", "view.demosaic", "view.source"]));
    const capture = await simulateCapture(options);
    expect(a.exposure.settings).toEqual(capture.exposure.settings);
    expect(a.scene.sourceSha256).toBe(capture.scene.sourceSha256);
    const region = { x: 7, y: 3, width: 11, height: 9 }, crop = await simulateDisplayView(options, { width: 30, height: 20, region });
    expect(crop.view.region).toEqual(region);
    for (let y = 0; y < 9; y++) for (let x = 0; x < 33; x++) expect(crop.image.samples[y * 33 + x]).toBe(a.image.samples[((y + 3) * 30 + 7) * 3 + x]);
    const sixteen = await simulateDisplayView(options, { width: 30, height: 20, format: "srgb-16" });
    expect(sixteen.image.samples).toBeInstanceOf(Uint16Array);
    // A different noise seed draws a different realization of the same statistics.
    const seeded = await simulateDisplayView({ ...options, sensor: { ...options.sensor, noiseSeed: 2 } }, { width: 30, height: 20 });
    expect(Array.from(seeded.image.samples)).not.toEqual(Array.from(a.image.samples));
  }, testTimeout(60_000));

  it("keeps its bytes: hash locks recorded before the exact speed-ups", async () => {
    // SHA-256 of the samples, the expected values, the noise standard deviations and the diagnostics (timings removed),
    // recorded with the display view as merged in #368 (before the filled windows, the one-material sample replay and the
    // shared AHD correction states). Each case exercises one path: non-uniform and uniform diffraction sites, the AHD
    // correction, spectral materials with mirror borders, a radiance scene, AHD with a tone curve, and Speed.
    const red = { kind: "function" as const, wavelengthRangeNanometers: { minimum: 380, maximum: 780 }, evaluate: (nm: number): number => (nm > 600 ? 0.7 : 0.08) };
    const cases: [SimulateCaptureOptions, SimulateDisplayViewOptions, string][] = [
      [{ scene: { preset: "siemens-star" }, lens: { fNumber: 8, diffraction: "circular-aperture" }, sensor: { pixelPitchMicrometers: 1.4, antiAliasing: { kind: "four-spot" } },
        output: { width: 400, height: 300 } }, { width: 20, height: 15 }, "92eed1f8db92ce80b4bf6e8c156ebc58deb14fe5d450e185d3ff2a276e0f0e6e"],
      [{ scene: { preset: "uniform", reflectance: 0.18 }, lens: { fNumber: 8, diffraction: "circular-aperture" }, exposure: { iso: 1600, shutterSeconds: 1 / 2000 },
        sensor: { pixelPitchMicrometers: 1.4 }, output: { width: 200, height: 150, demosaic: "ahd" } }, { width: 10, height: 8 }, "92d0ffc50a2c79832a4cc0a6bf8246a49f7e2e6c6c1d5fa4c93760712a8f2d09"],
      [{ scene: { preset: "patches", patches: [{ patchId: "a", reflectance: red }, { patchId: "b", reflectance: 0.5 }], columns: 2 }, chartSize: { widthM: 0.002, surroundReflectance: 0.3 },
        lens: { diffraction: "circular-aperture" }, sensor: { pixelPitchMicrometers: 2 }, output: { width: 60, height: 40, borderHandling: "mirror" } }, { width: 12, height: 8 },
      "1461b948abc45ee34bf58fd0454f7cb8c2787f6c3b96647dc61b98b5f821c7f0"],
      [{ scene: { kind: "reflectance-function", sceneId: "rings", evaluate: (p) => 0.4 + 0.3 * Math.cos(40 * Math.hypot(p.u, p.v)) }, lens: { diffraction: "circular-aperture" },
        sensor: { pixelAperture: { kind: "box", samplesPerAxis: 2 } }, output: { width: 48, height: 32 } }, { width: 12, height: 8 }, "db00e08a0d83d69fa0b8899c44b8cb695e8a12cb62d3b7b4f9c1efb7eb9c646a"],
      [{ scene: { preset: "dead-leaves" }, lens: { fNumber: 11, diffraction: "circular-aperture" }, sensor: { pixelPitchMicrometers: 4 },
        output: { width: 300, height: 200, demosaic: "ahd", toneCurve: "positive-reinhard-per-channel" } }, { width: 30, height: 20, region: { x: 5, y: 4, width: 9, height: 7 }, format: "srgb-16" },
      "2258352b70d562a2d6ea6726d05c0feda79918812531063c6b413b8cc3803134"],
      [{ scene: { preset: "dead-leaves" }, sensor: { pixelPitchMicrometers: 2 }, output: { width: 300, height: 200 } }, { width: 30, height: 20 }, "ab470cbfe4fb07ee597621f943aed0ce78cd997196a0ea41838c9e598ca830ae"]
    ];
    for (const [options, view, expected] of cases) {
      const { result, internals } = await simulateDisplayViewWithInternals(options, view);
      const diagnostics: Partial<typeof result.diagnostics> = { ...result.diagnostics }, hash = createHash("sha256");
      delete diagnostics.timingsMs;
      for (const a of [result.image.samples, internals.expected, internals.noiseStd]) hash.update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
      hash.update(JSON.stringify(diagnostics));
      expect(hash.digest("hex")).toBe(expected);
    }
  }, testTimeout(120_000));

  it("shares AHD correction states across calls without changing a byte", async () => {
    const options: SimulateCaptureOptions = { scene: { preset: "uniform", reflectance: 0.18 }, exposure: { iso: 1600, shutterSeconds: 1 / 2000 }, sensor: { pixelPitchMicrometers: 1.4 },
      output: { width: 200, height: 150, demosaic: "ahd" } };
    clearDisplayViewCorrectionStates();
    const cold = await simulateDisplayView(options, { width: 10, height: 8 }), states = displayViewCorrectionStateCount();
    expect(cold.diagnostics.ahdCorrectedPixelCount).toBe(80);
    expect(states).toBeGreaterThan(0);
    const warm = await simulateDisplayView(options, { width: 10, height: 8 });
    expect(displayViewCorrectionStateCount()).toBe(states);
    expect(Array.from(warm.image.samples)).toEqual(Array.from(cold.image.samples));
    const region = await simulateDisplayView(options, { width: 10, height: 8, region: { x: 3, y: 2, width: 4, height: 3 } });
    for (let y = 0; y < 3; y++) for (let x = 0; x < 12; x++) expect(region.image.samples[y * 12 + x]).toBe(cold.image.samples[((y + 2) * 10 + 3) * 3 + x]);
    // Another seed is another set of states.
    await simulateDisplayView({ ...options, sensor: { ...options.sensor, noiseSeed: 9 } }, { width: 10, height: 8 });
    expect(displayViewCorrectionStateCount()).toBeGreaterThan(states);
    clearDisplayViewCorrectionStates();
    expect(Array.from((await simulateDisplayView(options, { width: 10, height: 8 })).image.samples)).toEqual(Array.from(cold.image.samples));
  }, testTimeout(60_000));

  it("refuses views and capture options it cannot reproduce", async () => {
    const base: SimulateCaptureOptions = { scene: { preset: "uniform" }, output: { width: 16, height: 16 } };
    for (const view of [undefined, { width: 0, height: 4 }, { width: 17, height: 4 }, { width: 4, height: 4, samplesPerAxis: 33 }, { width: 4, height: 4, format: "png" },
      { width: 4, height: 4, region: { x: 3, y: 0, width: 2, height: 1 } }, { width: 4, height: 4, extra: 1 }])
      await expect(simulateDisplayView(base, view as never)).rejects.toThrow(InvalidConfigurationError);
    for (const extra of [{ lens: { pupilSampling: { radialSamples: 1, angularSamples: 4 } } }, { lens: { projection: "fisheye-equisolid-angle" } },
      { motion: { angularVelocityRadPerSec: { yaw: 0.01 } } }, { output: { width: 16, height: 16, region: { x: 0, y: 0, width: 4, height: 4 } } },
      { output: { width: 16, height: 16, whiteBalance: "auto" } }, { output: { width: 16, height: 16, toneCurve: "extended-reinhard-luminance", toneCurveParameters: { whiteLuminance: 2 } } },
      { output: { width: 16, height: 16, highlightMode: "reconstruct" } },
      { lens: { vignetting: { normalizationRadiusMm: 0.5, maximumNormalizedRadius: 1, coefficients: { r2: -0.3, r4: 0, r6: 0 } } } }] as Partial<SimulateCaptureOptions>[])
      await expect(simulateDisplayView({ ...base, ...extra } as SimulateCaptureOptions, { width: 4, height: 4 })).rejects.toThrow(InvalidConfigurationError);
  });
});
