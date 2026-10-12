// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { createNativeEnvironmentRawTask, createNativeEnvironmentSensorStageTask, createNativeRawDevelopmentTask,
  NATIVE_ENVIRONMENT_OPTICAL_STAGE_LIMITS, type NativeEnvironmentOpticalStage, type NativeEnvironmentRawInput,
  type NativeEnvironmentRawOutput, type NativeEnvironmentRawProvider, type NativeEnvironmentRawTile } from "../src/index.js";
import { nativeEnvironmentWorkload, nativeEnvironmentWorkloads, type NativeEnvironmentWorkload } from "./helpers/native-environment-workloads.js";
import { loadPhotographicExportInput } from "./helpers/photographic-export-fixture.js";

type Site = NativeEnvironmentRawTile["sites"][number];
/** Post-optics settings: a full recompute and an optical-stage reuse with these must agree bit for bit. */
interface PostOptics { seed?: number; iso?: number; gain?: number; whiteBalance?: boolean; renderingEv?: number; darkCurrent?: number }
const noYield = async (): Promise<void> => {};

function withSites(provider: NativeEnvironmentRawProvider, edit: (site: Site, index: number) => void): NativeEnvironmentRawProvider {
  const read = provider.readTile;
  return { ...provider, readTile: async (r, signal): Promise<NativeEnvironmentRawTile> => {
    const tile = await read(r, signal);
    tile.sites.forEach((site, j) => edit(site, r.y*2+r.x+j));
    return tile;
  } };
}
function postOptics(kind: NativeEnvironmentWorkload, settings: PostOptics): { input: NativeEnvironmentRawInput; provider: NativeEnvironmentRawProvider } {
  const { input, provider } = nativeEnvironmentWorkload(kind), exposure = input.raw.exposure;
  if (settings.seed !== undefined) exposure.noise = { ...exposure.noise, seedUint32: settings.seed };
  if (settings.iso !== undefined) exposure.exposure = { ...exposure.exposure, iso: settings.iso };
  if (settings.whiteBalance) exposure.whiteBalanceIntent = { stateId: "wb-edit", source: "manual-gains", locked: true,
    channelGains: { red: 1.75, green: 1, blue: 1.4 }, sourceProfile: null };
  return { input, provider: withSites(provider, site => {
    if (settings.gain !== undefined) for (const regime of site.readout.readoutProfile.regimes) regime.systemConversionGainElectronsPerCode.value = settings.gain;
    if (settings.darkCurrent !== undefined && site.darkCurrentProfile.temperatureModel.kind === "fixed-reference-temperature")
      site.darkCurrentProfile.temperatureModel.darkCurrentElectronsPerSecond = settings.darkCurrent;
  }) };
}
async function develop(raw: NativeEnvironmentRawOutput["raw"], settings: PostOptics): Promise<Uint8Array | Uint16Array> {
  const policy = loadPhotographicExportInput();
  const task = createNativeRawDevelopmentTask({ raw, phaseProfiles: policy.reconstruction.phaseProfiles, colorProfile: policy.colorProfile,
    whiteBalance: settings.whiteBalance ? "apply-resolved-sensor-gains" : "not-required",
    rendering: { ...policy.rendering, renderingExposureEv: settings.renderingEv ?? 0 }, maximumRetainedPayloadBytes: raw.codes.length*10 }, noYield);
  await task.run();
  const out = task.takeOutput(); task.dispose();
  return out.integerSamples;
}
function snapshot(raw: NativeEnvironmentRawOutput["raw"], developed: Uint8Array | Uint16Array): Record<string, number[]> {
  return { codes: Array.from(raw.codes), blackLevels: Array.from(raw.blackLevels), digitalSaturationCodes: Array.from(raw.digitalSaturationCodes),
    saturationFlags: Array.from(raw.saturationFlags), developed: Array.from(developed) };
}
async function full(kind: NativeEnvironmentWorkload, settings: PostOptics): Promise<Record<string, number[]>> {
  const { input, provider } = postOptics(kind, settings), task = createNativeEnvironmentRawTask(input, provider);
  await task.run();
  const out = task.takeOutput(); task.dispose();
  return snapshot(out.raw, await develop(out.raw, settings));
}
async function prepare(kind: NativeEnvironmentWorkload, settings: PostOptics = {}): Promise<{ stage: NativeEnvironmentOpticalStage; output: NativeEnvironmentRawOutput }> {
  const { input, provider } = postOptics(kind, settings);
  const task = createNativeEnvironmentRawTask({ ...input, opticalStage: { maximumRetainedBytes: 1_000_000 } }, provider);
  await task.run();
  const output = task.takeOutput(); task.dispose();
  return { stage: output.opticalStage!, output };
}
async function reuse(kind: NativeEnvironmentWorkload, stage: NativeEnvironmentOpticalStage, settings: PostOptics): Promise<Record<string, number[]>> {
  const { input, provider } = postOptics(kind, settings);
  const task = createNativeEnvironmentSensorStageTask({ raw: input.raw, sceneBinding: input.sceneBinding }, stage,
    { readTile: provider.readTile, yieldControl: provider.yieldControl });
  await task.run();
  const out = task.takeOutput(); task.dispose();
  expect(out.providerEvaluationCount).toBe(0);
  return snapshot(out.raw, await develop(out.raw, settings));
}

const edits: readonly [string, PostOptics][] = [
  ["noise seed", { seed: 987654321 }],
  ["ISO metadata with readout gain", { iso: 1600, gain: .25 }],
  ["white balance", { whiteBalance: true }],
  ["rendering exposure", { renderingEv: 1.5 }],
  ["dark current", { darkCurrent: 400 }],
  ["all post-optics settings together", { seed: 42, iso: 800, gain: .5, whiteBalance: true, renderingEv: -1, darkCurrent: 40 }]
];

describe("native environment optical-stage reuse", () => {
  it.each(nativeEnvironmentWorkloads)("reuses the %s optical stage bit-identically across post-optics edits", async kind => {
    const { stage, output } = await prepare(kind);
    expect(stage.providerEvaluationCount).toBe(output.providerEvaluationCount);
    const baseline = await full(kind, {});
    expect(snapshot(output.raw, await develop(output.raw, {}))).toEqual(baseline);
    expect(await reuse(kind, stage, {})).toEqual(baseline);
    for (const [, settings] of edits) {
      const recomputed = await full(kind, settings);
      expect(await reuse(kind, stage, settings)).toEqual(recomputed);
    }
    // The edits are material: seed and gain change RAW codes, rendering EV changes developed output.
    expect((await full(kind, { seed: 987654321 })).codes).not.toEqual(baseline.codes);
    expect((await full(kind, { gain: .25 })).codes).not.toEqual(baseline.codes);
    expect((await full(kind, { renderingEv: 1.5 })).developed).not.toEqual(baseline.developed);
    stage.dispose();
  });

  it("reuses a stage produced under different post-optics settings and leaves default output unchanged", async () => {
    const { stage } = await prepare("flat-emitter", { seed: 7, gain: .5, whiteBalance: true });
    expect(await reuse("flat-emitter", stage, {})).toEqual(await full("flat-emitter", {}));
    const { input, provider } = nativeEnvironmentWorkload("flat-emitter"), task = createNativeEnvironmentRawTask(input, provider);
    await task.run();
    expect("opticalStage" in task.takeOutput()).toBe(false);
  });

  it("reports and bounds retained storage per site", async () => {
    const L = NATIVE_ENVIRONMENT_OPTICAL_STAGE_LIMITS;
    expect(L.fixedBytesPerSite).toBe(2+7*8);
    expect(L.bytesPerTemporalSamplePerSite).toBe(3*8);
    for (const [kind, samples] of [["flat-emitter", 2], ["temporal-samples", 8]] as const) {
      const { stage } = await prepare(kind);
      expect(stage.temporalSampleCount).toBe(samples);
      expect(stage.pixelCount).toBe(4);
      expect(stage.retainedBytes).toBe(4*(L.fixedBytesPerSite+L.bytesPerTemporalSamplePerSite*samples));
      stage.dispose();
    }
    const { input, provider } = nativeEnvironmentWorkload("temporal-samples");
    let calls = 0;
    const counted = { ...provider, evaluateRadiance: (q: Parameters<typeof provider.evaluateRadiance>[0]): ReturnType<typeof provider.evaluateRadiance> => {
      calls++; return provider.evaluateRadiance(q); } };
    const task = createNativeEnvironmentRawTask({ ...input, opticalStage: { maximumRetainedBytes: 4*(L.fixedBytesPerSite+L.bytesPerTemporalSamplePerSite*8)-1 } }, counted);
    await expect(task.run()).rejects.toThrow("byte budget");
    expect(calls).toBe(0);
    expect(() => task.takeOutput()).toThrow();
    for (const bad of [0, -1, 1.5, Number.NaN, "64", null, { maximumRetainedBytes: 64, extra: 1 }])
      expect(() => createNativeEnvironmentRawTask({ ...input, opticalStage: (typeof bad === "object" && bad !== null ? bad : { maximumRetainedBytes: bad }) as never }, provider)).toThrow();
  });

  it("refuses a mixed temporal sample count before radiance callbacks", async () => {
    const { input, provider } = nativeEnvironmentWorkload("flat-emitter");
    let calls = 0;
    const edited = withSites({ ...provider, evaluateRadiance: q => { calls++; return provider.evaluateRadiance(q); } },
      (site, i) => { if (i === 1) site.environment.temporalSampleCount = 3; });
    const task = createNativeEnvironmentRawTask({ ...input, opticalStage: { maximumRetainedBytes: 1_000_000 } }, edited);
    await expect(task.run()).rejects.toThrow("temporal sample count");
    expect(calls).toBe(0);
  });

  it("disposes, refuses disposed or forged stages and survives repeated reuse", async () => {
    const { stage } = await prepare("flat-emitter");
    const settings = { seed: 3 };
    const first = await reuse("flat-emitter", stage, settings);
    expect(await reuse("flat-emitter", stage, settings)).toEqual(first);
    expect(stage.disposed).toBe(false);
    const { input, provider } = postOptics("flat-emitter", {});
    const forged = { ...stage, disposed: false, dispose: (): void => {} };
    expect(() => createNativeEnvironmentSensorStageTask({ raw: input.raw, sceneBinding: input.sceneBinding }, forged, provider)).toThrow("engine-produced");
    // Disposal while a reuse is running stops it at the next tile without output.
    const running = createNativeEnvironmentSensorStageTask({ raw: { ...input.raw, tileWidth: 1 }, sceneBinding: input.sceneBinding }, stage,
      { readTile: provider.readTile, yieldControl: async (): Promise<void> => { stage.dispose(); } });
    await expect(running.run()).rejects.toThrow("disposed");
    expect(() => running.takeOutput()).toThrow();
    expect(stage.disposed).toBe(true);
    stage.dispose();
    expect(() => createNativeEnvironmentSensorStageTask({ raw: input.raw, sceneBinding: input.sceneBinding }, stage, provider)).toThrow("disposed");
  });

  it("transfers stage ownership with the output; task cancellation before transfer releases it", async () => {
    const { input, provider } = nativeEnvironmentWorkload("flat-emitter");
    const task = createNativeEnvironmentRawTask({ ...input, opticalStage: { maximumRetainedBytes: 1_000_000 } }, provider);
    await task.run();
    await expect(task.run()).rejects.toThrow("single-use");
    const output = task.takeOutput();
    task.cancel(); task.dispose();
    expect(output.opticalStage!.disposed).toBe(false);
    const cancelled = createNativeEnvironmentRawTask({ ...input, opticalStage: { maximumRetainedBytes: 1_000_000 } }, provider);
    await cancelled.run(); cancelled.cancel();
    expect(() => cancelled.takeOutput()).toThrow();
    output.opticalStage!.dispose();
  });
});

type Raw = NativeEnvironmentRawInput["raw"];
type Environment = Site["environment"];
/** Nudges the first finite nonzero number found depth-first, so any nested optical datum can be perturbed. */
function nudge(value: unknown): boolean {
  if (Array.isArray(value) || (typeof value === "object" && value !== null)) {
    for (const [key, child] of Object.entries(value)) {
      if (typeof child === "number" && Number.isFinite(child) && child !== 0) { (value as Record<string, number>)[key] = child*(1+2**-40); return true; }
      if (nudge(child)) return true;
    }
  }
  return false;
}
const captureEdits: readonly [string, NativeEnvironmentWorkload, (raw: Raw, sceneBinding: NativeEnvironmentRawInput["sceneBinding"]) => void][] = [
  ["aperture", "flat-emitter", (raw): void => { raw.exposure.exposure.aperture *= 1.4; }],
  ["focal length", "flat-emitter", (raw): void => { raw.exposure.exposure.focalLengthMm += 1; }],
  ["shutter time", "flat-emitter", (raw): void => { raw.exposure.exposure.shutterSeconds *= 2; raw.exposureWindow!.nominalExposureDurationSeconds.value *= 2; }],
  ["focus", "flat-emitter", (raw): void => { raw.exposure.focus = raw.exposure.focus.kind === "infinity" ? { kind: "finite", distanceM: 3 } : { kind: "infinity" }; }],
  ["orientation", "flat-emitter", (raw): void => { raw.exposure.geometry.orientation = "portrait-clockwise"; }],
  ["imaging-area geometry", "flat-emitter", (raw): void => { raw.exposure.geometry.imagingArea = { ...raw.exposure.geometry.imagingArea,
    widthMm: raw.exposure.geometry.imagingArea.widthMm*1.01 }; }],
  ["rolling exposure window (temporal sampling)", "temporal-samples", (raw): void => {
    raw.exposureWindow!.opening = { kind: "simultaneous" }; raw.exposureWindow!.closing = { kind: "simultaneous" }; }],
  ["frame identity", "flat-emitter", (raw): void => { raw.frameId = raw.frameId+"-b"; }],
  ["provider scene identity", "flat-emitter", (_raw, binding): void => { binding.providerSceneId = "other-room"; }]
];
const environmentEdits: readonly [string, NativeEnvironmentWorkload, (e: Environment) => void][] = [
  ["PSF kernel data", "psf-radial-field", (e): void => { if (e.psf.kind !== "sampled-local" || !nudge(e.psf.configuration.psf.profile)) throw Error("no PSF datum"); }],
  ["PSF selection", "psf-radial-field", (e): void => { e.psf = { kind: "not-applied", evidence: e.fieldThroughput.evidence, limitation: "Point optics." }; }],
  ["vignetting profile", "psf-radial-field", (e): void => { if (e.fieldThroughput.kind !== "radial-illumination-vignetting") throw Error("no field");
    e.fieldThroughput.profile.coefficients.r2 = -.3; }],
  ["spectral nodes", "flat-emitter", (e): void => { if (!nudge(e.sensor.spectralSampling)) throw Error("no spectral datum"); }],
  ["spectral response (EQE)", "flat-emitter", (e): void => { if (!nudge(e.sensor.spectralResponseProfile)) throw Error("no EQE datum"); }],
  ["temporal sample count", "temporal-samples", (e): void => { e.temporalSampleCount = 4; }],
  ["motion", "temporal-samples", (e): void => { e.motion.angularVelocityRadPerSec = { ...e.motion.angularVelocityRadPerSec, yaw: e.motion.angularVelocityRadPerSec.yaw+.01 }; }],
  ["pupil sampling", "pupil-rays", (e): void => { if (!e.pupil) throw Error("no pupil"); e.pupil.radialSampleCount = 3; }],
  ["provider profile", "flat-emitter", (e): void => { e.sceneBindings.providerProfile = { ...e.sceneBindings.providerProfile, profileId: "other-provider" }; }],
  ["optical profile", "flat-emitter", (e): void => { if (!nudge(e.optics.profile)) throw Error("no optics datum"); }],
  ["signed zero", "flat-emitter", (e): void => { e.motion.angularVelocityRadPerSec = { ...e.motion.angularVelocityRadPerSec, pitch: e.motion.angularVelocityRadPerSec.pitch === 0 ? -0 : 0 }; }],
  ["added field", "flat-emitter", (e): void => { (e as unknown as Record<string, unknown>).extra = undefined; }],
  ["integration identity", "flat-emitter", (e): void => { e.temporalIntegrationId += "-x"; }],
  ["site coordinate", "flat-emitter", (e): void => { e.sensor.spatialSampling.site = { x: e.sensor.spatialSampling.site.x, y: e.sensor.spatialSampling.site.y+1 }; }]
];

describe("native environment optical-stage invalidation", () => {
  it.each(captureEdits)("refuses a changed %s before any tile is read", async (_name, kind, edit) => {
    const { stage } = await prepare(kind), { input: shared, provider } = postOptics(kind, {}), input = structuredClone(shared);
    edit(input.raw, input.sceneBinding);
    let reads = 0;
    expect(() => createNativeEnvironmentSensorStageTask({ raw: input.raw, sceneBinding: input.sceneBinding }, stage,
      { readTile: (r, s) => { reads++; return provider.readTile(r, s); }, yieldControl: noYield })).toThrow("recompute the optical stage");
    expect(reads).toBe(0);
    stage.dispose();
  });
  it.each(environmentEdits)("refuses a changed site %s without output", async (_name, kind, edit) => {
    const { stage } = await prepare(kind), { input, provider } = postOptics(kind, {});
    // Edit only the last site so earlier tiles pass and failure still withholds all output.
    const task = createNativeEnvironmentSensorStageTask({ raw: { ...input.raw, tileWidth: 1 }, sceneBinding: input.sceneBinding }, stage,
      { readTile: withSites(provider, (site, i) => { if (i === 3) edit(site.environment); }).readTile, yieldControl: noYield });
    await expect(task.run()).rejects.toThrow("recompute the optical stage");
    expect(task.completedTileCount).toBe(3);
    expect(() => task.takeOutput()).toThrow();
    expect(stage.disposed).toBe(false);
    stage.dispose();
  });
});
