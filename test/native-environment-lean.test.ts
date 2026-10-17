// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { calculateCaptureExposureWindows, createNativeEnvironmentRawTask, createNativeEnvironmentSensorStageTask, simulateCapture,
  type NativeEnvironmentRawInput, type NativeEnvironmentRawProvider, type NativeEnvironmentRawTile, type SceneRadianceEvaluationRequest,
  type SceneRadianceEvaluationResult, type SensorApertureRay } from "../src/index.js";
import { nativeEnvironmentLeanStatistics, setNativeEnvironmentLeanExecutionEnabled } from "../src/capture/native-environment-lean.js";
import { scaledTimeout } from "./helpers/test-timeout.js";

/*
 * The lean executor (2.0 performance) must be invisible: identical RAW codes, levels, flags, white levels, photo
 * expectations, optical-stage reuse, provider callbacks (same frozen requests and aperture rays in the same order)
 * and identical errors at the same point, compared with the full path on the same inputs. Workloads come from the
 * capture facade's own request so most sites are lean-eligible (a 2×2 fixture has one site per CFA phase and
 * would only exercise template candidates).
 */
type Site = NativeEnvironmentRawTile["sites"][number];
type Mutable = Record<string, unknown> & { environment: Record<string, unknown> & { sensor: Record<string, unknown> } };
const evidence = [{ sourceOrigin: "photivra" as const, sourceReference: "photivra:lean-executor-test", reuseStatus: "photivra-owned" as const }];
const sha = (bytes: ArrayBufferView): string => createHash("sha256").update(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)).digest("hex");

let input: NativeEnvironmentRawInput, siteInput: (index: number) => Site, width = 0, height = 0;
beforeAll(async () => {
  const capture = await simulateCapture({ scene: { preset: "slanted-edge" }, output: { width: 6, height: 6 } });
  input = { ...capture.request.environmentRaw, maximumProviderEvaluations: 2_000_000_000,
    raw: { ...capture.request.environmentRaw.raw, tileWidth: 8 } };
  siteInput = capture.request.siteInput;
  width = input.raw.exposure.geometry.nativeRaster.pixelWidth; height = input.raw.exposure.geometry.nativeRaster.pixelHeight;
}, scaledTimeout(60_000));
afterEach(() => setNativeEnvironmentLeanExecutionEnabled(true));

function result(q: Readonly<SceneRadianceEvaluationRequest>, radiance: number): SceneRadianceEvaluationResult {
  return { schemaVersion: "0.1.0", sampleId: q.sampleId, sceneId: q.sceneId, providerProfileId: q.providerProfileId,
    wavelengthNanometers: q.wavelengthNanometers, wavelengthBasis: q.wavelengthBasis, quantity: "outgoing-spectral-radiance", unit: "W/m^2/sr/nm",
    spectralRadianceWattsPerSquareMeterSteradianNanometer: radiance, scientificStatus: "approximation",
    uncertainty: { kind: "not-quantified", limitation: "Test analytic field." }, evidence, limitations: ["Test analytic field."] };
}
function radiance(q: Readonly<SceneRadianceEvaluationRequest>): number {
  const d = q.target.kind === "environment-direction" ? q.target.outgoingDirectionUnitVector : { x: 0, y: 0, z: 1 };
  return 0.02*(1+0.6*Math.sin(900*d.x)*Math.cos(700*d.y))*(0.5+q.wavelengthNanometers/1000)*(1+40*q.timeSecondsFromExposureStart);
}
interface Options {
  site?: (site: Mutable, index: number) => void;
  raw?: (raw: NativeEnvironmentRawInput["raw"]) => NativeEnvironmentRawInput["raw"];
  bad?: { at: number; result: (r: SceneRadianceEvaluationResult) => SceneRadianceEvaluationResult };
  retain?: boolean;
}
interface Summary { [key: string]: unknown }
async function run(options: Options, lean: boolean): Promise<Summary> {
  setNativeEnvironmentLeanExecutionEnabled(lean);
  const requests: string[] = [], photo: number[] = [];
  let calls = 0;
  const answer = (q: Readonly<SceneRadianceEvaluationRequest>, ray?: Readonly<SensorApertureRay>): SceneRadianceEvaluationResult => {
    calls++;
    requests.push(JSON.stringify([q, ray ?? null, Object.isFrozen(q), Object.isFrozen(q.target), ray ? Object.isFrozen(ray) : null]));
    const r = result(q, radiance(q)*(ray ? 1+0.1*ray.pupilSampleIndex : 1));
    return options.bad && calls === options.bad.at ? options.bad.result(r) : r;
  };
  const provider: NativeEnvironmentRawProvider = {
    readTile: async (r): Promise<NativeEnvironmentRawTile> => ({ ...r, sites: Array.from({ length: r.width }, (_, j) => {
      const index = r.y*width+r.x+j, site = siteInput(index);
      options.site?.(site as unknown as Mutable, index);
      return site;
    }) }),
    evaluateRadiance: q => answer(q), evaluateApertureRadiance: (q, ray) => answer(q, ray),
    observePhotoTile: (tile): void => { for (const s of tile.sites) photo.push(s.nativeIndex, s.expectedIncidentPhotonCount, s.expectedGeneratedElectronCount); },
    yieldControl: async (): Promise<void> => {}
  };
  const summary: Summary = {};
  try {
    const raw = options.raw ? options.raw(input.raw) : input.raw;
    const task = createNativeEnvironmentRawTask({ ...input, raw, ...(options.retain ? { opticalStage: { maximumRetainedBytes: 1e9 } } : {}) }, provider);
    await task.run();
    const o = task.takeOutput();
    Object.assign(summary, { codes: sha(o.raw.codes), black: sha(o.raw.blackLevels), saturation: sha(o.raw.digitalSaturationCodes),
      flags: sha(o.raw.saturationFlags), white: Array.from(o.raw.effectiveSaturationCodes), evaluations: o.providerEvaluationCount });
    if (o.opticalStage) {
      const reuse = createNativeEnvironmentSensorStageTask({ raw: { ...raw, exposure: { ...raw.exposure, noise: { ...raw.exposure.noise, seedUint32: 99 } } },
        sceneBinding: input.sceneBinding }, o.opticalStage, { readTile: provider.readTile, yieldControl: async () => {} });
      await reuse.run();
      summary.reuse = sha(reuse.takeOutput().raw.codes);
      o.opticalStage.dispose();
    }
  } catch (error) {
    summary.error = `${(error as Error).constructor.name}: ${(error as Error).message}`;
  }
  return { ...summary, calls, requests: createHash("sha256").update(requests.join("\n")).digest("hex"), photo: sha(Float64Array.from(photo)) };
}
/** Runs both paths; asserts identity and that the lean path did lean work. */
async function same(options: Options, expectLean = true): Promise<Summary> {
  const full = await run(options, false);
  const before = { ...nativeEnvironmentLeanStatistics };
  const lean = await run(options, true);
  expect(lean).toEqual(full);
  if (expectLean) {
    expect(nativeEnvironmentLeanStatistics.executedSites - before.executedSites).toBeGreaterThan(0);
    expect(nativeEnvironmentLeanStatistics.plannedSites - before.plannedSites).toBeGreaterThan(0);
  }
  return lean;
}
const motion = { angularVelocityRadPerSec: { pitch: 0.3, yaw: -0.2, roll: 0.5 }, timeReference: "first-opening-boundary-phase",
  environmentDirectionConvention: "outgoing-radiance-toward-camera" };
const fact = <T>(value: T): { value: T; evidence: typeof evidence } => ({ value, evidence });

describe("lean native environment executor (2.0 performance)", () => {
  it("reproduces the full path bit for bit, with most sites on the lean path", async () => {
    const before = { ...nativeEnvironmentLeanStatistics };
    const summary = await same({});
    expect(summary.error).toBeUndefined();
    const sites = width*height;
    expect(nativeEnvironmentLeanStatistics.executedSites - before.executedSites).toBeGreaterThan(sites/2);
    expect(nativeEnvironmentLeanStatistics.sensorSites - before.sensorSites).toBeGreaterThan(sites/2);
  }, scaledTimeout(60_000));

  it("covers rotation, temporal samples, vignetting, pupil rays and optical-stage reuse", async () => {
    await same({ site: s => { s.environment.motion = structuredClone(motion); s.environment.temporalSampleCount = 3; }, retain: true });
    await same({ site: s => { s.environment.fieldThroughput = { kind: "radial-illumination-vignetting", profile: { normalizationRadiusMm: 0.15,
      maximumNormalizedRadius: 1, coefficients: { r2: -0.3, r4: 0.05, r6: 0 } }, evidence, limitation: "Test radial profile." }; } });
    await same({ site: s => { s.environment.pupil = { kind: "ideal-uniform-circular-pupil", radialSampleCount: 1, angularSampleCount: 4, evidence,
      limitation: "Test pupil." }; s.environment.motion = structuredClone(motion); } });
  }, scaledTimeout(120_000));

  it("covers rolling-shutter windows and fixed-pattern noise", async () => {
    const scan = { kind: "uniform-linear-native-scan", directionNative: fact("top-to-bottom"), traversalDurationSeconds: { value: 0.003, unit: "s", evidence } };
    const schedule = { ...input.raw.exposureWindow!, opening: scan, closing: scan } as NonNullable<NativeEnvironmentRawInput["raw"]["exposureWindow"]>;
    const windows = calculateCaptureExposureWindows({ ...schedule, nativeRaster: input.raw.exposure.geometry.nativeRaster,
      samplePointsNative: Array.from({ length: width*height }, (_, i) => ({ x: i%width+0.5, y: Math.floor(i/width)+0.5 })) }).value.samples;
    const pattern = { schemaVersion: "0.1.0", profileId: "test-fpn", colorSamplingProfileId: input.raw.colorSamplingProfile.profileId,
      scientificStatus: "approximation", sensorInstanceSeedUint32: 2024, photoResponseNonUniformity: { relativeStandardDeviation: fact(0.02) },
      darkSignalNonUniformity: { relativeStandardDeviation: fact(0.3) }, hotPixels: { siteFraction: fact(0.05), darkCurrentMultiplier: fact(40) },
      rowOffset: { rmsElectrons: fact(0.5) }, columnOffset: { rmsElectrons: fact(0.25) }, patternDistribution: "normal-factors-truncated-at-zero",
      evidence, limitations: ["Test pattern."] };
    await same({ raw: raw => ({ ...raw, exposureWindow: schedule }), site: (s, i) => {
      s.environment.sensor.localExposure = { ...(s.environment.sensor.localExposure as object),
        exposureWindowInput: { ...schedule, nativeRaster: input.raw.exposure.geometry.nativeRaster } };
      const charge = s.charge as { completenessProfile: Record<string, unknown> };
      charge.completenessProfile = { ...charge.completenessProfile, startOffsetSecondsFromOpeningReference: windows[i]!.startOffsetSecondsFromOpeningReference,
        endOffsetSecondsFromOpeningReference: windows[i]!.endOffsetSecondsFromOpeningReference };
      s.readout = { ...(s.readout as object), fixedPatternNoise: structuredClone(pattern) };
    } });
  }, scaledTimeout(120_000));

  it("keeps differing, reordered and negative-zero sites identical (they fall back to the full path)", async () => {
    const reorder = (v: unknown): unknown => Array.isArray(v) ? v.map(reorder) : v && typeof v === "object" ?
      Object.fromEntries(Object.keys(v).reverse().map(k => [k, reorder((v as Record<string, unknown>)[k])])) : v;
    await same({ site: (s, i) => { if (i%5 === 2) s.environment.sensor.operatingRangeProfile = reorder(s.environment.sensor.operatingRangeProfile); } });
    await same({ site: (s, i) => { if (i%3 === 1) (s.readout as Record<string, unknown>).readoutProfile = reorder((s.readout as Record<string, unknown>).readoutProfile); } });
    await same({ site: (s, i) => { if (i === width*3) (s.environment.sensor.spatialSampling as Record<string, unknown>).site = { x: -0, y: 3 }; } });
    await same({ site: (s, i) => { if (i%7 === 3) { const dark = s.darkCurrentProfile as { temperatureModel: Record<string, unknown> };
      s.darkCurrentProfile = { ...dark, temperatureModel: { ...dark.temperatureModel, darkCurrentElectronsPerSecond: 3 } }; } } });
    await same({ site: s => { s.environment.lensFieldMapping = { projectionModel: "rectilinear", distortion: { kind: "none" },
      radiometricAreaCorrection: "inverse-distortion-jacobian" }; } }, false);
  }, scaledTimeout(120_000));

  it("throws the same error after the same callbacks for invalid sites and provider defects", async () => {
    const mid = Math.floor(width*height/2)+3, late = width*height*20-30;
    for (const site of [(s: Mutable, i: number): void => { if (i === mid) s.environment.temporalIntegrationId = "wrong"; },
      (s: Mutable, i: number): void => { if (i === mid) (s.readout as Record<string, unknown>).regimeId = "missing-regime"; },
      (s: Mutable, i: number): void => { if (i === mid) { const c = s.charge as { completenessProfile: Record<string, unknown> };
        c.completenessProfile = { ...c.completenessProfile, endOffsetSecondsFromOpeningReference: 1 }; } },
      (s: Mutable, i: number): void => { if (i === mid) s.operatingTemperatureC = 26; }]) {
      expect((await same({ site }, false)).error).toBeTypeOf("string");
    }
    for (const bad of [(r: SceneRadianceEvaluationResult): SceneRadianceEvaluationResult => ({ ...r, sampleId: "other" }),
      (r: SceneRadianceEvaluationResult): SceneRadianceEvaluationResult => ({ ...r, evidence: [] }),
      (r: SceneRadianceEvaluationResult): SceneRadianceEvaluationResult => ({ ...r, spectralRadianceWattsPerSquareMeterSteradianNanometer: Number.NaN }),
      (r: SceneRadianceEvaluationResult): SceneRadianceEvaluationResult => ({ ...r, spectralRadianceWattsPerSquareMeterSteradianNanometer: 1.7e308 }),
      (r: SceneRadianceEvaluationResult): SceneRadianceEvaluationResult => ({ ...r, wavelengthNanometers: r.wavelengthNanometers+1e-9 })]) {
      const summary = await same({ bad: { at: late, result: bad } });
      expect(summary.error).toBeTypeOf("string");
      // Result defects fail at their callback; an overflowing radiance fails after the site's last callback.
      expect(summary.calls).toBeGreaterThanOrEqual(late);
      expect(summary.calls).toBeLessThanOrEqual(late+20);
    }
  }, scaledTimeout(120_000));

  it("rejects an out-of-range lean site with the operating-range error at the same callback", async () => {
    // Bisect (full path) a range bound that the first site satisfies but some later site does not, then compare both paths.
    const bounded = (key: "minimumInclusive" | "maximumInclusive", bound: number): Options => ({ site: (s): void => {
      const p = s.environment.sensor.operatingRangeProfile as { inputRange: Record<string, unknown> };
      s.environment.sensor.operatingRangeProfile = { ...p, inputRange: { ...p.inputRange, [key]: bound } }; } });
    const firstSiteFails = async (key: "minimumInclusive" | "maximumInclusive", bound: number): Promise<boolean> => {
      const summary = await run(bounded(key, bound), false);
      return typeof summary.error === "string" && (summary.calls as number) <= 20;
    };
    const outcomes: Summary[] = [];
    for (const key of ["maximumInclusive", "minimumInclusive"] as const) {
      // maximum: small fails; minimum: large fails. Bisect in log space between 1e-16 and 1e-8.
      let failing = key === "maximumInclusive" ? 1e-16 : 1e-8, passing = key === "maximumInclusive" ? 1e-8 : 1e-16;
      for (let i = 0; i < 40; i++) {
        const middle = Math.sqrt(failing*passing);
        if (await firstSiteFails(key, middle)) failing = middle; else passing = middle;
      }
      outcomes.push(await same(bounded(key, passing), false));
    }
    expect(outcomes.some(o => typeof o.error === "string" && (o.calls as number) > 20)).toBe(true);
  }, scaledTimeout(120_000));
});
