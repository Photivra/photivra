// SPDX-License-Identifier: Apache-2.0
/**
 * #449: the verified native site readout of the tabulated RAW path (createVerifiedNativeSiteReadout) computes each site with a
 * flat sensor stage: the readout regime's constants read once, the dark Poisson threshold kept while the dark mean repeats,
 * adcTransfer's arithmetic inline without integral non-linearity (adcTransfer itself with it) and one reused output record.
 * Every site must give calculateNativeRawSite's codes, levels and flags, for the facade's readout and for readouts with
 * fixed-pattern noise, digital gain, integral non-linearity, extra read-noise components and saturation.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { simulateCapture, type SceneRadianceEvaluationRequest, type SceneRadianceEvaluationResult, type SimulateCaptureResult } from "../src/index.js";
import { admitNativeEnvironmentInput } from "../src/capture/native-environment-raw.js";
import { createEnvironmentRawFrameCanonicalMemo, planEnvironmentRawSite } from "../src/capture/environment-raw-producer.js";
import { executeEnvironmentSensorPhotoSignal } from "../src/sensor/environment-photo-signal.js";
import { calculateCaptureExposureWindows } from "../src/sensor/exposure-window.js";
import { composeNativeEnvironmentSensorSite } from "../src/capture/native-environment-optical-stage.js";
import { calculateNativeRawSite, parseNativeRawProducerSite } from "../src/capture/sensor-raw-producer.js";
import { calculateSiteEffectiveSaturationCode } from "../src/capture/raw-white-level.js";
import { createVerifiedNativeSiteReadout } from "../src/capture/native-environment-lean.js";
import { scaledTimeout } from "./helpers/test-timeout.js";

type Rec = Record<string, unknown>;
const evidence = [{ sourceOrigin: "photivra" as const, sourceReference: "photivra:flat-sensor-stage-test", reuseStatus: "photivra-owned" as const }];
const fact = (value: unknown): Rec => ({ value, evidence });

function result(q: Readonly<SceneRadianceEvaluationRequest>, radiance: number): SceneRadianceEvaluationResult {
  return { schemaVersion: "0.1.0", sampleId: q.sampleId, sceneId: q.sceneId, providerProfileId: q.providerProfileId,
    wavelengthNanometers: q.wavelengthNanometers, wavelengthBasis: q.wavelengthBasis, quantity: "outgoing-spectral-radiance", unit: "W/m^2/sr/nm",
    spectralRadianceWattsPerSquareMeterSteradianNanometer: radiance, scientificStatus: "approximation",
    uncertainty: { kind: "not-quantified", limitation: "Test analytic field." }, evidence, limitations: ["Test analytic field."] };
}
/** An analytic field with a dark-to-bright range; `scale` pushes the bright sites past the full well. */
const field = (scale: number) => (q: Readonly<SceneRadianceEvaluationRequest>): SceneRadianceEvaluationResult => {
  const d = q.target.kind === "environment-direction" ? q.target.outgoingDirectionUnitVector : { x: 0, y: 0, z: 1 };
  return result(q, scale * 0.02 * (1 + 0.9 * Math.sin(900 * d.x) * Math.cos(700 * d.y)) * (0.5 + q.wavelengthNanometers / 1000));
};

let base: SimulateCaptureResult, gainedCapture: SimulateCaptureResult;
beforeAll(async () => {
  base = await simulateCapture({ scene: { preset: "slanted-edge" }, output: { width: 8, height: 6 } });
  // The consumer tier's ISO 6400 regime has a digital gain of 2.
  gainedCapture = await simulateCapture({ camera: "consumer", exposure: { mode: "manual", iso: 6400, shutterSeconds: 1 / 4000 }, scene: { preset: "slanted-edge" },
    output: { width: 8, height: 6 } });
}, scaledTimeout(60_000));

type Variant = (readout: Rec, colorSamplingProfileId: string) => Rec;
function regimes(readout: Rec, change: (regime: Rec) => Rec): Rec {
  const profile = readout.readoutProfile as Rec;
  return { ...readout, readoutProfile: { ...profile, regimes: (profile.regimes as Rec[]).map(change) } };
}
/** Piecewise-linear integral non-linearity over the regime's ADC range. */
const inlOf = (adc: Rec): Rec => { const maximum = 2 ** (adc.bitDepth as number) - 1; return { kind: "piecewise-linear-code-offset", knots: [{ code: 0, offsetCodes: 0 },
  { code: Math.round(maximum * 0.09), offsetCodes: 1.5 }, { code: Math.round(maximum * 0.37), offsetCodes: -2.25 }, { code: maximum, offsetCodes: 0.5 }], evidence }; };
/** The regime's own digital gain (2), or an inexact 1.75 with the analog gain making up the exposure index; optionally with INL. */
const gained = (digitalGain: number | undefined, withInl: boolean): Variant => (r) => regimes(r, (g) => {
  const gain = g.exposureIndexGain as Rec, total = (gain.exposureIndex as number) / (gain.baseExposureIndex as number), d = digitalGain ?? (gain.digitalGain as number);
  return { ...g, adc: { ...(g.adc as Rec), digitalGain: d, ...(withInl ? { integralNonLinearity: inlOf(g.adc as Rec) } : {}) }, exposureIndexGain: { ...gain, analogGain: total / d, digitalGain: d } };
});
/** The site with its dark current set to `rate` e⁻/s (the dark mean then repeats at every site: 0, below and past samplePoisson's 30 e⁻ switch). */
function withDarkCurrent(site: Rec, rate: number): Rec {
  const profile = site.darkCurrentProfile as Rec;
  return { ...site, darkCurrentProfile: { ...profile, temperatureModel: { ...(profile.temperatureModel as Rec), darkCurrentElectronsPerSecond: rate } } };
}
const variants: [string, Variant, number, boolean?][] = [
  ["the facade's readout", (r): Rec => r, 1],
  ["saturating sites", (r): Rec => r, 400],
  ["dark current 0", (r): Rec => r, 0],
  ["dark current 10³ e⁻/s (8 e⁻ per site)", (r): Rec => r, 1e3],
  ["dark current 10⁴ e⁻/s (80 e⁻ per site)", (r): Rec => r, 1e4],
  ["fixed-pattern noise with hot pixels", (r, id): Rec => ({ ...r, fixedPatternNoise: { schemaVersion: "0.1.0", profileId: "test-fpn", colorSamplingProfileId: id,
    scientificStatus: "approximation", sensorInstanceSeedUint32: 2024, photoResponseNonUniformity: { relativeStandardDeviation: fact(0.02) },
    darkSignalNonUniformity: { relativeStandardDeviation: fact(0.3) }, hotPixels: { siteFraction: fact(0.2), darkCurrentMultiplier: fact(4000) },
    rowOffset: { rmsElectrons: fact(0.5) }, columnOffset: { rmsElectrons: fact(0.25) }, patternDistribution: "normal-factors-truncated-at-zero",
    evidence, limitations: ["Test pattern."] } }), 1],
  ["digital gain", gained(undefined, false), 1 / 64, true],
  ["digital gain at saturation", gained(undefined, false), 2, true],
  ["inexact digital gain", gained(1.75, false), 1 / 64, true],
  ["integral non-linearity", (r): Rec => regimes(r, (g): Rec => ({ ...g, adc: { ...(g.adc as Rec), integralNonLinearity: inlOf(g.adc as Rec) } })), 1],
  ["integral non-linearity and digital gain", gained(1.75, true), 1 / 64, true],
  ["several read-noise components, one of them zero", (r): Rec => regimes(r, (g): Rec => ({ ...g, readNoiseComponents: [...(g.readNoiseComponents as Rec[]),
    { componentId: "zero", rmsElectrons: fact(0), evidence }, { componentId: "extra", rmsElectrons: fact(1.5), evidence }] })), 1]
];

describe("flat sensor stage of the verified native site readout (#449)", () => {
  for (const [name, variant, scale, highIso] of variants) {
    it("gives calculateNativeRawSite's outputs at every site: " + name, () => {
      const capture = highIso ? gainedCapture : base, input = capture.request.environmentRaw, { plan, sceneBinding } = admitNativeEnvironmentInput(input);
      const native = plan.exposure.geometry.nativeRaster, W = native.pixelWidth, H = native.pixelHeight, schedule = plan.exposureWindow!;
      const memo = createEnvironmentRawFrameCanonicalMemo(plan.frame, schedule), seed = plan.exposure.noise.seedUint32, evaluate = field(name.startsWith("dark current") ? 1 : scale);
      const readouts: ReturnType<typeof createVerifiedNativeSiteReadout>[] = [];
      let compared = 0, flagged = 0, record: object | undefined;
      const darkMeans = new Set<number>();
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const index = y * W + x, base = capture.request.siteInput(index) as unknown as Rec;
        const changed = name.startsWith("dark current") ? withDarkCurrent(base, scale) : base;
        const site = { ...changed, readout: variant(changed.readout as Rec, input.raw.colorSamplingProfile.profileId) } as unknown as ReturnType<typeof capture.request.siteInput>;
        const full = planEnvironmentRawSite(site, index, plan.frame, sceneBinding, schedule, "engine-owned", memo, "photo-only");
        const photo = executeEnvironmentSensorPhotoSignal(full, evaluate, undefined, "photo-only").value.photo.value.photoSignal;
        const timing = calculateCaptureExposureWindows({ ...schedule, nativeRaster: native, samplePointsNative: [{ x: x + 0.5, y: y + 0.5 }] }).value.samples[0]!;
        const parsed = parseNativeRawProducerSite(composeNativeEnvironmentSensorSite(site, photo), index, plan.frame, timing);
        darkMeans.add(parsed.charge.darkCharge.expectedDarkElectronCount);
        const r = calculateNativeRawSite(parsed, seed, index), readout = r.readout.value;
        const phase = (y & 1) * 2 + (x & 1);
        if (y < 2 && x < 2) {
          // The verification site of this CFA phase: the flat stage must reproduce it, or the tabulated path is not taken.
          const whiteCode = calculateSiteEffectiveSaturationCode(readout, parsed.readoutProfile, parsed.regimeId);
          readouts[phase] = createVerifiedNativeSiteReadout(parsed, r, whiteCode, photo, x, y, index, seed);
          expect(readouts[phase]).toBeDefined();
        }
        const o = readouts[phase]!.compute(photo.expectedGeneratedElectronCount, timing.localExposureDurationSeconds, x, y, index, seed)!;
        expect(o).toBeDefined();
        // One record serves every site of a readout (the tabulated loop copies its fields at once).
        if (phase === 0) { if (record === undefined) record = o; else expect(o).toBe(record); }
        const flags = Number(readout.physicalScalarSaturationApplied) | Number(readout.preAdcSaturationApplied) << 1 | Number(readout.digitalSaturationApplied) << 2;
        expect([o.rawCode, o.blackLevelCode, o.digitalSaturationCode, o.flags]).toEqual([readout.rawCode, readout.blackLevelCode, readout.digitalSaturationCode, flags]);
        compared++;
        if (flags !== 0) flagged++;
      }
      expect(compared).toBe(W * H);
      if (name.startsWith("dark current")) { expect([...darkMeans]).toEqual([scale * 0.008]); expect(flagged).toBe(0); }
      else if (scale > 1) expect(flagged).toBeGreaterThan(0);
      else expect(flagged).toBe(0);
    }, scaledTimeout(60_000));
  }
});
