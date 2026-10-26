// SPDX-License-Identifier: Apache-2.0
/**
 * #446: site diffraction kernels are kept by value. Records built from the same `createDiffractionLimitedPsfProfile` input
 * and PSF fields share their kernels; any change of a kernel input misses; a kept kernel is bit for bit the freshly resolved
 * one; callers get copies. Through the facade, a repeated prepare and a prepare after an ISO, white-balance or shutter change
 * resolve no kernel and render the bytes of a cold prepare; an f-number, focus, focal-length or pitch change resolves again.
 */
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { createDiffractionLimitedPsfProfile } from "../src/optics/diffraction-psf-profile.js";
import { resolveLensPsfConvolutionKernels } from "../src/optics/lens-psf-kernels.js";
import { clearSiteDiffractionKernelCache, registerDiffractionPsfKey, siteDiffractionKernel, siteDiffractionKernelCacheState, SITE_DIFFRACTION_KERNEL_CACHE_SIZE } from "../src/optics/site-diffraction-kernel.js";
import { prepareDisplayView, simulateCapture, type DisplayViewResult, type SimulateCaptureOptions, type SimulateCaptureResult } from "../src/index.js";
import { scaledTimeout as testTimeout } from "./helpers/test-timeout.js";

type ProfileInput = Parameters<typeof createDiffractionLimitedPsfProfile>[0];
type Psf = Parameters<typeof siteDiffractionKernel>[0];

const BASE: ProfileInput = { aperture: "circular", focalLengthMm: 50, apertureFNumber: 8, focus: { kind: "finite", distanceM: 2 }, wavelengthsNm: [450, 550, 650],
  samplePitchMicrometers: 4, kernelRadiusSamples: 3, fieldHalfExtentMm: { x: 18, y: 12 }, profileId: "facade-diffraction-airy" };

/** A PSF record as the facade builds it (simulate-capture.ts), registered by value. */
function record(input: ProfileInput, register = true): Psf {
  const profile = createDiffractionLimitedPsfProfile(input).value.profile;
  const psf = { profile, focalLengthMm: input.focalLengthMm, focus: input.focus, apertureFNumber: input.apertureFNumber, signedDefocusImagePlaneMicrometers: 0 } as unknown as Psf;
  if (register) registerDiffractionPsfKey(psf, input);
  return psf;
}

/** The kernel resolved afresh, outside the cache (the module's own resolve). */
function fresh(psf: Psf, wavelengthNm: number, pitch: number, radius: number): Float64Array {
  return Float64Array.from(resolveLensPsfConvolutionKernels({ schemaVersion: "0.1.0", psf, spectralWeights: [{ wavelengthNm, weight: 1 }],
    grid: { width: 1, height: 1, sitePitchMicrometers: { x: pitch, y: pitch }, opticalAxisSite: { x: 0.5, y: 0.5 } }, patchWidth: 1, patchHeight: 1, kernelRadius: radius }).value.kernels);
}

function expectBitIdentical(a: Float64Array, b: Float64Array): void {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) expect.fail("element " + i + ": " + a[i] + " vs " + b[i]);
}

const kernel = (psf: Psf, nm: number, input: ProfileInput): Float64Array => siteDiffractionKernel(psf, nm, input.samplePitchMicrometers, input.kernelRadiusSamples, "failure");
const resolves = (): number => siteDiffractionKernelCacheState().resolves;

describe("site diffraction kernels kept by value (#446)", () => {
  it("equal inputs share kernels that equal fresh ones; mutating a returned kernel changes nothing", () => {
    clearSiteDiffractionKernelCache();
    // Pitches 1.0–8.4 µm, f/1.4–f/22, two focal lengths and focus distances, an explicit radius and the facade's default
    // (the third dark ring at the longest node, capped at 32).
    const third = (input: ProfileInput): number => Math.min(32, Math.max(1, Math.ceil(10.173468135062722 / Math.PI * 0.65 * input.apertureFNumber * 1.05 / input.samplePitchMicrometers)));
    const cases: ProfileInput[] = [];
    for (const samplePitchMicrometers of [1, 2.4, 8.4]) for (const apertureFNumber of [1.4, 22]) for (const focalLengthMm of [35, 85]) for (const distanceM of [0.6, 4]) {
      cases.push({ ...BASE, samplePitchMicrometers, apertureFNumber, focalLengthMm, focus: { kind: "finite", distanceM }, kernelRadiusSamples: 2 });
    }
    for (const [samplePitchMicrometers, apertureFNumber] of [[1, 8], [6, 11], [8.4, 22]] as const) {
      const input = { ...BASE, samplePitchMicrometers, apertureFNumber, wavelengthsNm: [450, 650] };
      cases.push({ ...input, kernelRadiusSamples: third(input) });
    }
    for (const input of cases) {
      const a = record(input), b = record(structuredClone(input));
      expect(a).not.toBe(b);
      for (const nm of input.wavelengthsNm) {
        const before = resolves(), cold = kernel(a, nm, input);
        expect(resolves()).toBe(before + 1);
        const hit = kernel(b, nm, input);
        expect(resolves()).toBe(before + 1);
        const reference = fresh(b, nm, input.samplePitchMicrometers, input.kernelRadiusSamples);
        expect(cold.length).toBe((2 * input.kernelRadiusSamples + 1) ** 2);
        expectBitIdentical(cold, reference);
        expectBitIdentical(hit, reference);
        // Each caller gets its own copy: writing to one leaves the kept kernel and later callers untouched.
        expect(hit).not.toBe(cold);
        hit.fill(Number.NaN); cold.fill(-1);
        expectBitIdentical(kernel(a, nm, input), reference);
        expect(resolves()).toBe(before + 1);
      }
    }
  }, testTimeout(60_000));

  it("a change of any kernel input misses", () => {
    clearSiteDiffractionKernelCache();
    const base = record(BASE);
    kernel(base, 550, BASE);
    const variants: [string, ProfileInput][] = [
      ["f-number", { ...BASE, apertureFNumber: 8.000000000000002 }], ["focal length", { ...BASE, focalLengthMm: 51 }],
      ["focus distance", { ...BASE, focus: { kind: "finite", distanceM: 2.5 } }], ["focus at infinity", { ...BASE, focus: { kind: "infinity" } }],
      ["pitch", { ...BASE, samplePitchMicrometers: 4.5 }], ["wavelength nodes", { ...BASE, wavelengthsNm: [450, 550, 660] }],
      ["radius", { ...BASE, kernelRadiusSamples: 4 }], ["field extent", { ...BASE, fieldHalfExtentMm: { x: 18, y: 12.5 } }], ["profile id", { ...BASE, profileId: "other" }]];
    for (const [name, input] of variants) {
      const before = resolves();
      kernel(record(input), 550, input);
      expect(resolves(), name).toBe(before + 1);
    }
    // The aperture model (only "circular" is built today) and the record's own fields are part of the key.
    const twin = record(BASE, false);
    registerDiffractionPsfKey(twin, { ...BASE, aperture: "hexagonal" } as unknown as ProfileInput);
    let before = resolves();
    kernel(twin, 550, BASE);
    expect(resolves(), "aperture model").toBe(before + 1);
    const defocused = { ...(record(BASE, false) as object), signedDefocusImagePlaneMicrometers: -0 } as unknown as Psf;
    registerDiffractionPsfKey(defocused, BASE);
    before = resolves();
    kernel(defocused, 550, BASE);
    expect(resolves(), "record field").toBe(before + 1);
    // The query's own wavelength, pitch and radius: the radius check fails for another radius and pitch, so query another node.
    before = resolves();
    kernel(base, 450, BASE);
    expect(resolves(), "query wavelength").toBe(before + 1);
    // An unregistered record keeps its kernels by identity only.
    const unregistered = record(BASE, false);
    before = resolves();
    kernel(unregistered, 550, BASE); kernel(unregistered, 550, BASE);
    expect(resolves()).toBe(before + 1);
    expect(siteDiffractionKernelCacheState(unregistered).registered).toBe(false);
    expect(siteDiffractionKernelCacheState(base).registered).toBe(true);
  }, testTimeout(30_000));

  it("keeps at most SITE_DIFFRACTION_KERNEL_CACHE_SIZE records, least recently used out first", () => {
    clearSiteDiffractionKernelCache();
    const inputs = Array.from({ length: SITE_DIFFRACTION_KERNEL_CACHE_SIZE + 1 }, (_, i) => ({ ...BASE, focalLengthMm: 40 + i }));
    for (const input of inputs.slice(0, SITE_DIFFRACTION_KERNEL_CACHE_SIZE)) kernel(record(input), 550, input);
    expect(siteDiffractionKernelCacheState().valueEntries).toBe(SITE_DIFFRACTION_KERNEL_CACHE_SIZE);
    kernel(record(inputs[0]!), 550, inputs[0]!); // the oldest becomes the newest
    const last = inputs[SITE_DIFFRACTION_KERNEL_CACHE_SIZE]!;
    kernel(record(last), 550, last); // evicts inputs[1]
    expect(siteDiffractionKernelCacheState().valueEntries).toBe(SITE_DIFFRACTION_KERNEL_CACHE_SIZE);
    let before = resolves();
    kernel(record(inputs[0]!), 550, inputs[0]!);
    expect(resolves()).toBe(before);
    before = resolves();
    kernel(record(inputs[1]!), 550, inputs[1]!);
    expect(resolves()).toBe(before + 1);
  }, testTimeout(30_000));
});

/** The result without its timings, as a SHA-256. */
function viewHash(result: DisplayViewResult): string {
  const diagnostics: Partial<DisplayViewResult["diagnostics"]> = { ...result.diagnostics };
  delete diagnostics.timingsMs;
  return createHash("sha256").update(JSON.stringify({ ...result, image: { ...result.image, samples: Array.from(result.image.samples) }, diagnostics })).digest("hex");
}
function captureHash(result: SimulateCaptureResult): string {
  const diagnostics: Partial<SimulateCaptureResult["diagnostics"]> = { ...result.diagnostics };
  delete diagnostics.timingsMs;
  return createHash("sha256").update(JSON.stringify({ samples: Array.from(result.image.samples), raw: Array.from(result.raw.codes as ArrayLike<number>), diagnostics, assumptions: result.assumptions })).digest("hex");
}

describe("prepared display view and captures reuse the kernels (#446)", () => {
  const options: SimulateCaptureOptions = { scene: { preset: "siemens-star" }, lens: { prime: 50, fNumber: 11, diffraction: "circular-aperture" },
    exposure: { mode: "manual", iso: 100, shutterSeconds: 1 / 125 }, sensor: { pixelPitchMicrometers: 6, pixelAperture: { kind: "box", samplesPerAxis: 2 }, antiAliasing: { kind: "four-spot" } },
    output: { width: 48, height: 32, demosaic: "ahd" } };
  const view = { width: 16, height: 11 };
  const withOptions = (change: (o: SimulateCaptureOptions) => void): SimulateCaptureOptions => { const o = structuredClone(options); change(o); return o; };
  /** Prepares and renders `o`, returning the hash and the kernels resolved; `cold` empties the cache first. */
  async function prepared(o: SimulateCaptureOptions, cold = false): Promise<{ hash: string; resolved: number }> {
    if (cold) clearSiteDiffractionKernelCache();
    const before = resolves(), view_ = await prepareDisplayView(o), resolved = resolves() - before;
    return { hash: viewHash(await view_.render(view)), resolved };
  }

  it("a repeat and an ISO, white-balance or shutter change hit and render the cold bytes; an optics change misses", async () => {
    const first = await prepared(options, true);
    expect(first.resolved).toBeGreaterThan(0);
    const changes: [string, SimulateCaptureOptions, boolean][] = [
      ["same request", options, true],
      ["ISO 400", withOptions((o) => { o.exposure!.iso = 400; }), true],
      ["ISO 100 again", options, true],
      ["white balance", withOptions((o) => { o.output!.whiteBalance = { kelvin: 3200 }; }), true],
      ["shutter", withOptions((o) => { o.exposure!.shutterSeconds = 1 / 30; }), true],
      ["f-number", withOptions((o) => { o.lens!.fNumber = 16; }), false],
      ["focal length", withOptions((o) => { o.lens!.prime = 85; }), false],
      ["focus", withOptions((o) => { o.lens!.focusDistanceM = 1.5; }), false],
      ["pitch", withOptions((o) => { o.sensor!.pixelPitchMicrometers = 4; }), false]];
    for (const [name, o, hit] of changes) {
      const warm = await prepared(o);
      if (hit) expect(warm.resolved, name).toBe(0);
      else expect(warm.resolved, name).toBeGreaterThan(0);
      const cold = await prepared(o, true);
      expect(cold.resolved, name).toBeGreaterThan(0);
      expect(warm.hash, name).toBe(cold.hash);
    }
  }, testTimeout(240_000));

  it("captures after a prepare (tabulated path and object-space convolution) hit and equal cold captures", async () => {
    const rings = (p: { u: number; v: number }): number => { const t = 20 * (p.u * p.u + p.v * p.v), f = t - Math.floor(t); return 0.1 + 0.6 * (f < 0.5 ? 2 * f : 2 - 2 * f); };
    for (const o of [options, withOptions((x) => { x.scene = { kind: "reflectance-function", sceneId: "rings", evaluate: rings }; })]) {
      clearSiteDiffractionKernelCache();
      let before = resolves();
      const cold = captureHash(await simulateCapture(o));
      expect(resolves()).toBeGreaterThan(before);
      await prepareDisplayView(o);
      before = resolves();
      const warm = captureHash(await simulateCapture(o));
      expect(resolves()).toBe(before);
      expect(warm).toBe(cold);
    }
  }, testTimeout(240_000));
});
