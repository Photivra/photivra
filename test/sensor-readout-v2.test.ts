// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  assessSensorPhysicalChargeCapacity,
  calculateExpectedSensorReadout,
  calculateSensorFixedPatternSite,
  createIsoGainReadoutRegimes,
  parseSensorChargeSamplingProfile,
  parseSensorFixedPatternNoiseProfile,
  parseSensorReadoutConversionProfile,
  simulateSensorChargeRealization,
  simulateSensorRawCode,
  SENSOR_FIXED_PATTERN_NOISE_MODEL,
  type SensorAccumulatedChargeComposition,
  type SensorChargeSamplingProfile,
  type SensorFixedPatternNoiseProfile,
  type SensorReadoutConversionProfile
} from "../src/index.js";
import { createPoissonSampler, samplePoisson, samplePoissonStreamForValidation, sampleStandardNormalStreamForValidation } from "../src/sensor/raw-readout.js";
import { createDeterministicUniformStream, createPortableStandardNormalPairs, fmix32, sampleDeterministicStandardNormal, samplePortableStandardNormal } from "../src/sensor/stochastic-seed.js";
import { portableCosTwoPi, portableLog, portableSinTwoPi } from "../src/core/portable-math.js";
import { createHash } from "node:crypto";
import { resolveSensorReadoutRegime } from "../src/index.js";

const evidence = [{ sourceOrigin: "photivra", sourceReference: "test:sensor-readout-v2", reuseStatus: "photivra-owned" }] as const;
const fact = <T>(value: T): { value: T; evidence: typeof evidence } => ({ value, evidence });
const site = { x: 3, y: 5 };

/** Complete expected charge; an optional deterministic fractional component exercises exact rounding. */
function charge(photo: number, dark = 0, extra = 0): SensorAccumulatedChargeComposition {
  const exposure = { stationarity: evidence, exposureBinding: { binding: evidence, colorSamplingProfile: evidence,
    nominalExposureDuration: evidence, openingBoundary: [], closingBoundary: [] } };
  return {
    completenessProfileId: "complete", colorSamplingProfileId: "color", channelId: "green", site, bindingId: "binding",
    timeReference: "first-opening-boundary-phase", startOffsetSecondsFromOpeningReference: 0, endOffsetSecondsFromOpeningReference: 1,
    localExposureDurationSeconds: 1, photoExpectedElectronCount: photo, darkExpectedElectronCount: dark,
    additionalExpectedElectronCount: extra, totalExpectedStoredElectronCount: photo + dark + extra,
    additionalComponents: [{ componentId: "extra", kind: "leakage", expectedElectronCount: extra, scientificStatus: "approximation",
      uncertainty: { kind: "not-quantified", limitation: "test" }, evidence }],
    accumulatedChargeCompleteness: "complete-for-physical-storage-capacity-assessment", completenessScientificStatus: "approximation",
    allCountsAreExpectationValues: true, integerChargeSampled: false, photoSignalIncluded: true, darkChargeIncluded: true,
    otherChargeIncluded: true, darkShotNoiseApplied: false, photoShotNoiseApplied: false, readNoiseApplied: false,
    physicalFullWellAssessmentAuthorized: true, cameraSaturationAssessmentAuthorized: false, saturationAssessed: false,
    bloomingModeled: false, adcQuantizationApplied: false, rawCodeValueProduced: false,
    componentEvidence: { completeness: evidence, photoSignal: exposure, darkCurrent: { darkCurrent: evidence, siteApproximation: [], exposure } }
  } as SensorAccumulatedChargeComposition;
}
function capacity(c: SensorAccumulatedChargeComposition, electrons = 1e7): ReturnType<typeof assessSensorPhysicalChargeCapacity>["value"] {
  return assessSensorPhysicalChargeCapacity({ accumulatedCharge: c, operatingStateId: "state", operatingTemperatureC: 20,
    capacityProfile: { schemaVersion: "0.1.0", profileId: "capacity", colorSamplingProfileId: "color", channelId: "green",
      capacityMeaning: "physical-charge-storage-capacity-electrons", capacityElectrons: electrons, scientificStatus: "approximation",
      uncertainty: { kind: "not-quantified", limitation: "test" }, evidence, siteApplicability: { kind: "exact-site", site },
      operatingState: { stateId: "state", evidence }, temperatureApplicability: { kind: "exact-reference-temperature", temperatureC: 20 } } }).value;
}
const sampling = (model: "poisson" | "deterministic-expected-electron-equivalent" = "deterministic-expected-electron-equivalent"): SensorChargeSamplingProfile =>
  parseSensorChargeSamplingProfile({ schemaVersion: "0.1.0", profileId: "sampling", completenessProfileId: "complete",
    scientificStatus: "approximation", photoShotNoiseModel: "poisson", darkShotNoiseModel: "poisson",
    additionalComponentPolicies: [{ componentId: "extra", model }], evidence, limitations: ["test"] });
function readout(regime: Record<string, unknown> = {}, adc: Record<string, unknown> = {}, readNoise = 0): SensorReadoutConversionProfile {
  return parseSensorReadoutConversionProfile({ schemaVersion: "0.1.0", profileId: "readout", colorSamplingProfileId: "color", channelId: "green",
    regimeSelectionOwnedBy: "explicit-upstream-camera-state-not-inferred-from-iso", evidence,
    regimes: [{ regimeId: "r", scientificStatus: "approximation", systemConversionGainElectronsPerCode: fact(1),
      preAdcSaturationElectronEquivalent: fact(4000), readNoiseComponents: [{ componentId: "read", rmsElectrons: fact(readNoise), evidence }],
      adc: { bitDepth: 12, blackLevelCode: 0, digitalSaturationCode: 4095, transfer: "uniform-round-half-up", ...adc },
      evidence, limitations: ["test"], ...regime }] });
}
function pattern(overrides: Partial<Record<string, unknown>> = {}): SensorFixedPatternNoiseProfile {
  return parseSensorFixedPatternNoiseProfile({ schemaVersion: "0.1.0", profileId: "fpn", colorSamplingProfileId: "color",
    scientificStatus: "approximation", sensorInstanceSeedUint32: 2024, photoResponseNonUniformity: { relativeStandardDeviation: fact(.01) },
    darkSignalNonUniformity: { relativeStandardDeviation: fact(.2) }, hotPixels: { siteFraction: fact(.001), darkCurrentMultiplier: fact(40) },
    rowOffset: { rmsElectrons: fact(.5) }, columnOffset: { rmsElectrons: fact(.25) }, patternDistribution: "normal-factors-truncated-at-zero",
    evidence, limitations: ["Synthetic test pattern."], ...overrides });
}
function rawCode(c: SensorAccumulatedChargeComposition, profile: SensorReadoutConversionProfile, fpn?: SensorFixedPatternNoiseProfile,
  seed = 1): ReturnType<typeof simulateSensorRawCode>["value"] {
  const realization = simulateSensorChargeRealization({ accumulatedCharge: c, samplingProfile: sampling(), seedUint32: seed,
    ...(fpn ? { fixedPatternNoise: fpn } : {}) }).value;
  return simulateSensorRawCode({ chargeRealization: realization, physicalCapacityAssessment: capacity(c), readoutProfile: profile,
    regimeId: "r", readNoiseSeedUint32: seed + 1, ...(fpn ? { fixedPatternNoise: fpn } : {}) }).value;
}

describe("exact ADC rounding (numeric review #7)", () => {
  it("quantizes 0.49999999999999994 to 0 and exact .5 ties up, never returning -0", () => {
    expect(0.49999999999999994 + 0.5).toBe(1); // the old floor(x + 0.5) failure mode
    expect(rawCode(charge(0, 0, 0.49999999999999994), readout()).rawCode).toBe(0);
    expect(rawCode(charge(0, 0, 0.5), readout()).rawCode).toBe(1);
    expect(rawCode(charge(0, 0, 2.5), readout()).rawCode).toBe(3);
    const negative = rawCode(charge(0, 0, 0.4), readout({}, { blackLevelCode: 0 }));
    expect(Object.is(negative.quantizedCodeBeforeDigitalClamp, -0)).toBe(false);
  });
});

describe("Poisson sampler at very large means", () => {
  it("keeps var/mean ≈ 1 and an unbiased mean at 1e14 (normal approximation above 1e9)", () => {
    const mean = 1e14, n = 400_000, draws = samplePoissonStreamForValidation(mean, 99, n);
    let sum = 0;
    for (const d of draws) sum += d - mean;
    const average = sum / n;
    let squares = 0;
    for (const d of draws) squares += (d - mean - average) ** 2;
    const ratio = squares / (n - 1) / mean;
    // Standard error of a variance ratio is sqrt(2/n) ≈ 0.0022; the previous sampler gave 1.012.
    expect(Math.abs(ratio - 1)).toBeLessThan(0.009);
    expect(Math.abs(average)).toBeLessThan(5 * Math.sqrt(mean / n));
    expect(draws.every(Number.isSafeInteger)).toBe(true);
  });
  it("keeps the transformed-rejection path below 1e9 unchanged and integer", () => {
    const draws = samplePoissonStreamForValidation(1e6, 5, 20_000);
    const mean = draws.reduce((a, b) => a + b, 0) / draws.length;
    expect(Math.abs(mean - 1e6)).toBeLessThan(5 * Math.sqrt(1e6 / 20_000));
    expect(samplePoissonStreamForValidation(1e6, 5, 3)).toEqual(draws.slice(0, 3));
  });
});

describe("prepared Poisson sampler and the uniform stream", () => {
  it("draws exactly what samplePoisson draws for the same mean and stream, on every branch", () => {
    for (const mean of [0, 1e-3, 0.7, 5, 29.999, 30, 31.5, 250, 4000, 1e6, 2e9]) {
      const a = createDeterministicUniformStream(77), b = createDeterministicUniformStream(77), sampler = createPoissonSampler(mean);
      for (let i = 0; i < 4000; i++) expect(sampler(b)).toBe(samplePoisson(mean, a));
      expect(b.next()).toBe(a.next());
    }
    expect(() => createPoissonSampler(-1)).toThrow();
    expect(() => createPoissonSampler(Number.NaN)).toThrow();
  });
  it("in its portable form, draws the same in every JavaScript engine and agrees with samplePoisson but for last-bit ties", () => {
    // The portable form uses portableExp, portableLog and the portable Box–Muller instead of Math.exp, Math.log and Math.cos.
    // Its draws can differ from samplePoisson's only where a comparison falls within the last-bit difference of those
    // functions, so almost never; one digest of 44 000 draws locks them (the same on Node 22, 24 and 26 and on Bun, JavaScriptCore); all 44 000 equal samplePoisson's here.
    const bytes = new DataView(new ArrayBuffer(4 * 44_000));
    let o = 0, same = 0;
    for (const mean of [0, 1e-3, 0.7, 5, 29.999, 30, 31.5, 250, 4000, 1e6, 2e9]) {
      const a = createDeterministicUniformStream(77), b = createDeterministicUniformStream(77), sampler = createPoissonSampler(mean, true);
      for (let i = 0; i < 4000; i++) { const k = sampler(b); if (k === samplePoisson(mean, a)) same++; bytes.setUint32(o, k, true); o += 4; }
      expect(Number.isInteger(sampler(b))).toBe(true);
    }
    expect(same).toBeGreaterThanOrEqual(43_990);
    expect(createHash("sha256").update(new Uint8Array(bytes.buffer)).digest("hex")).toBe("c2309c7372de0e0a9ec3c02aa92a0700805c1f9d5821cabdc5507e61c35432ea");
    // Mean and variance of a high-mean portable sampler.
    const sampler = createPoissonSampler(400, true), random = createDeterministicUniformStream(5), draws = Array.from({ length: 20_000 }, () => sampler(random));
    const m = draws.reduce((x, y) => x + y, 0) / draws.length, v = draws.reduce((x, y) => x + (y - m) * (y - m), 0) / (draws.length - 1);
    expect(Math.abs(m - 400)).toBeLessThan(5 * Math.sqrt(400 / 20_000));
    expect(Math.abs(v / 400 - 1)).toBeLessThan(0.05);
  });
  it("draws the portable Box–Muller normal from the same two uniforms, within a few ulps of the native one", () => {
    const a = createDeterministicUniformStream(9), b = createDeterministicUniformStream(9);
    for (let i = 0; i < 20_000; i++) {
      const native = sampleDeterministicStandardNormal(a), portable = samplePortableStandardNormal(b);
      expect(Math.abs(portable - native)).toBeLessThanOrEqual(1e-14 * Math.max(1, Math.abs(native)));
    }
    expect(b.next()).toBe(a.next());
  });
  it("draws portable Box–Muller pairs: r·cos(2πu₂) then r·sin(2πu₂), independent standard normals", () => {
    const pairs = createPortableStandardNormalPairs(createDeterministicUniformStream(3)), check = createDeterministicUniformStream(3);
    for (let i = 0; i < 1000; i++) {
      const u1 = check.next(), u2 = check.next(), r = Math.sqrt(-2 * portableLog(u1));
      expect(pairs()).toBe(r * portableCosTwoPi(u2));
      expect(pairs()).toBe(r * portableSinTwoPi(u2));
    }
    const z = Array.from({ length: 100_000 }, createPortableStandardNormalPairs(createDeterministicUniformStream(11)));
    const m = z.reduce((x, y) => x + y, 0) / z.length, v = z.reduce((x, y) => x + (y - m) * (y - m), 0) / (z.length - 1);
    let c = 0;
    for (let i = 0; i < z.length; i += 2) c += z[i]! * z[i + 1]!;
    expect(Math.abs(m)).toBeLessThan(5 / Math.sqrt(z.length));
    expect(Math.abs(v - 1)).toBeLessThan(0.02);
    expect(Math.abs(c / (z.length / 2))).toBeLessThan(5 / Math.sqrt(z.length / 2));
  });
  it("keeps the xorshift32 stream's values", () => {
    // The stream as first written: the state in a closure variable, reduced with >>> 0.
    const reference = (seed: number): (() => number) => {
      let state = fmix32((seed ^ 0x9e3779b9) >>> 0);
      if (state === 0) state = 0x6d2b79f5;
      return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; state >>>= 0; return (state + 0.5) / 0x1_0000_0000; };
    };
    for (const seed of [0, 1, 0x9e3779b9, 0xffffffff, 123456789]) {
      const stream = createDeterministicUniformStream(seed), next = reference(seed);
      for (let i = 0; i < 10_000; i++) expect(stream.next()).toBe(next());
    }
  });
});

describe("post-ADC digital gain and ADC integral non-linearity", () => {
  it("re-quantizes ADC codes about black, leaving missing codes and reporting both stages", () => {
    const profile = readout({}, { blackLevelCode: 64, digitalGain: 2 });
    const sample = rawCode(charge(0, 0, 100.2), profile);
    expect(sample.adcCodeBeforeDigitalGain).toBe(164);
    expect(sample.digitalGain).toBe(2);
    expect(sample.rawCode).toBe(264);
    // Digital saturation is reached at half the analog code range.
    const clipped = rawCode(charge(0, 0, 3000), profile);
    expect(clipped.rawCode).toBe(4095);
    expect(clipped.digitalSaturationApplied).toBe(true);
    const expected = calculateExpectedSensorReadout({ accumulatedCharge: charge(0, 0, 100.2),
      physicalCapacityAssessment: capacity(charge(0, 0, 100.2)), readoutProfile: profile, regimeId: "r" }).value;
    expect(expected.expectedCodeAfterDigitalGain).toBeCloseTo(64 + 200.4, 10);
  });
  it("adds a piecewise-linear INL offset before quantization and validates its knots", () => {
    const inl = { kind: "piecewise-linear-code-offset", knots: [{ code: 0, offsetCodes: 0 }, { code: 2000, offsetCodes: 2 },
      { code: 4095, offsetCodes: 0 }], evidence };
    const sample = rawCode(charge(0, 0, 1000), readout({}, { integralNonLinearity: inl }));
    expect(sample.adcIntegralNonLinearityOffsetCodes).toBeCloseTo(1, 12);
    expect(sample.rawCode).toBe(1001);
    for (const knots of [[{ code: 1, offsetCodes: 0 }, { code: 4095, offsetCodes: 0 }], [{ code: 0, offsetCodes: 0 }, { code: 4000, offsetCodes: 0 }],
      [{ code: 0, offsetCodes: 0 }, { code: 0, offsetCodes: 0 }, { code: 4095, offsetCodes: 0 }]]) {
      expect(() => readout({}, { integralNonLinearity: { ...inl, knots } })).toThrow();
    }
    expect(() => readout({}, { digitalGain: .5 })).toThrow();
  });
  it("requires an ISO-gain record to agree with the regime's digital gain and exposure-index ratio", () => {
    const gain = { exposureIndex: 400, baseExposureIndex: 100, analogGain: 2, digitalGain: 2, conversionGainMode: "single-conversion-gain", evidence };
    expect(readout({ exposureIndexGain: gain }, { digitalGain: 2 }).regimes[0]!.exposureIndexGain?.analogGain).toBe(2);
    expect(() => readout({ exposureIndexGain: gain })).toThrow();
    expect(() => readout({ exposureIndexGain: { ...gain, analogGain: 3 } }, { digitalGain: 2 })).toThrow();
    expect(() => readout({ exposureIndexGain: { ...gain, conversionGainMode: "turbo" } }, { digitalGain: 2 })).toThrow();
  });
});

describe("ISO gain regime builder", () => {
  const input = { regimeIdPrefix: "t:", scientificStatus: "approximation" as const, baseExposureIndex: 100,
    exposureIndices: [100, 200, 800, 3200], baseSaturationElectronEquivalent: fact(30000), maximumAnalogGain: fact(16),
    adc: { bitDepth: 14, blackLevelCode: 1024, digitalSaturationCode: 16383 },
    conversionGainModes: [{ mode: "low-conversion-gain" as const, minimumExposureIndex: 100, readNoiseRmsElectrons: fact(3) },
      { mode: "high-conversion-gain" as const, minimumExposureIndex: 800, readNoiseRmsElectrons: fact(1.2), maximumChargeElectrons: fact(8000) }],
    evidence, limitations: ["Synthetic."] };
  it("scales DN/e- with ISO, switches read noise by conversion-gain mode and adds digital gain beyond the analog range", () => {
    const { regimes, standardRegimeBands } = createIsoGainReadoutRegimes(input);
    const span = 16383 - 1024;
    expect(regimes.map((r) => r.regimeId)).toEqual(["t:iso-100", "t:iso-200", "t:iso-800", "t:iso-3200"]);
    expect(regimes[0]!.systemConversionGainElectronsPerCode.value).toBeCloseTo(30000 / span, 12);
    for (const [i, s] of [100, 200, 800, 3200].entries()) {
      const r = regimes[i]!, ratio = s / 100;
      expect(r.exposureIndexGain!.analogGain * r.exposureIndexGain!.digitalGain).toBeCloseTo(ratio, 12);
      // The electrons that reach digital saturation follow Q0·S0/S.
      expect(r.preAdcSaturationElectronEquivalent.value / (r.adc.digitalGain ?? 1)).toBeCloseTo(30000 / ratio, 9);
      expect(r.preAdcSaturationElectronEquivalent.value / r.systemConversionGainElectronsPerCode.value).toBeCloseTo(span, 9);
      expect(standardRegimeBands[i]).toEqual({ minimumExposureIndex: s, maximumExposureIndex: s, readoutRegimeId: r.regimeId });
    }
    expect(regimes[3]!.adc.digitalGain).toBe(2);
    expect(regimes[2]!.adc.digitalGain).toBeUndefined();
    expect(regimes.map((r) => r.readNoiseComponents[0]!.rmsElectrons.value)).toEqual([3, 3, 1.2, 1.2]);
    expect(regimes.map((r) => r.exposureIndexGain!.conversionGainMode)).toEqual(["low-conversion-gain", "low-conversion-gain",
      "high-conversion-gain", "high-conversion-gain"]);
  });
  it("fails closed on inconsistent declarations", () => {
    for (const bad of [{ exposureIndices: [50, 100] }, { exposureIndices: [200, 100] }, { maximumAnalogGain: fact(.5) },
      { conversionGainModes: [{ ...input.conversionGainModes[1]!, minimumExposureIndex: 200 }] },
      { conversionGainModes: [input.conversionGainModes[0]!, { ...input.conversionGainModes[1]!, maximumChargeElectrons: fact(1000) }] },
      { regimeIdPrefix: "bad prefix" }, { extra: 1 }]) {
      expect(() => createIsoGainReadoutRegimes({ ...input, ...bad } as typeof input)).toThrow();
    }
  });
});

describe("fixed-pattern noise (EMVA 1288 PRNU/DSNU, hot pixels, row/column offsets)", () => {
  it("is deterministic per sensor instance and independent of the capture seed", () => {
    const a = calculateSensorFixedPatternSite({ profile: pattern(), site: { x: 10, y: 20 } });
    expect(calculateSensorFixedPatternSite({ profile: pattern(), site: { x: 10, y: 20 } })).toEqual(a);
    expect(a.modelVersion).toBe(SENSOR_FIXED_PATTERN_NOISE_MODEL.version);
    const other = calculateSensorFixedPatternSite({ profile: pattern({ sensorInstanceSeedUint32: 7 }), site: { x: 10, y: 20 } });
    expect(other.photoResponseGainFactor).not.toBe(a.photoResponseGainFactor);
    const r1 = simulateSensorChargeRealization({ accumulatedCharge: charge(1000, 10), samplingProfile: sampling(), seedUint32: 1,
      fixedPatternNoise: pattern() }).value;
    const r2 = simulateSensorChargeRealization({ accumulatedCharge: charge(1000, 10), samplingProfile: sampling(), seedUint32: 2,
      fixedPatternNoise: pattern() }).value;
    expect(r2.photoResponseGainFactor).toBe(r1.photoResponseGainFactor);
    expect(r2.darkCurrentFactor).toBe(r1.darkCurrentFactor);
  });
  it("matches the declared spatial statistics and shares row/column offsets", () => {
    const profile = pattern({ hotPixels: { siteFraction: fact(.01), darkCurrentMultiplier: fact(40) } });
    const values = [];
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) values.push(calculateSensorFixedPatternSite({ profile, site: { x, y } }));
    const prnu = values.map((v) => v.photoResponseGainFactor), n = prnu.length;
    const mean = prnu.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(prnu.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
    expect(Math.abs(mean - 1)).toBeLessThan(5 * .01 / Math.sqrt(n));
    expect(Math.abs(sd / .01 - 1)).toBeLessThan(.05);
    const hot = values.filter((v) => v.hotPixel);
    expect(Math.abs(hot.length / n - .01)).toBeLessThan(5 * Math.sqrt(.01 * .99 / n));
    expect(hot.every((v) => v.darkCurrentFactor === 40)).toBe(true);
    const cool = values.filter((v) => !v.hotPixel).map((v) => v.darkCurrentFactor);
    const coolMean = cool.reduce((a, b) => a + b, 0) / cool.length;
    expect(Math.abs(coolMean - 1)).toBeLessThan(5 * .2 / Math.sqrt(cool.length));
    expect(new Set(values.filter((v) => v.site.y === 7).map((v) => v.rowOffsetElectrons)).size).toBe(1);
    expect(new Set(values.filter((v) => v.site.x === 9).map((v) => v.columnOffsetElectrons)).size).toBe(1);
    expect(new Set(values.filter((v) => v.site.x === 0).map((v) => v.rowOffsetElectrons)).size).toBe(128);
  });
  it("multiplies photo and dark Poisson means at the charge stage so the dark excess scales with exposure", () => {
    const fpn = pattern(), p = calculateSensorFixedPatternSite({ profile: fpn, site });
    const short = simulateSensorChargeRealization({ accumulatedCharge: charge(1000, 10), samplingProfile: sampling(), seedUint32: 3,
      fixedPatternNoise: fpn }).value;
    const long = simulateSensorChargeRealization({ accumulatedCharge: charge(1000, 40), samplingProfile: sampling(), seedUint32: 3,
      fixedPatternNoise: fpn }).value;
    expect(short.photoSampledMeanElectronCount).toBe(1000 * p.photoResponseGainFactor);
    expect(short.darkSampledMeanElectronCount).toBe(10 * p.darkCurrentFactor);
    expect(long.darkSampledMeanElectronCount / short.darkSampledMeanElectronCount).toBeCloseTo(4, 12);
    expect(short.photoExpectedElectronCount).toBe(1000);
    expect(short.fixedPatternNoiseProfileId).toBe("fpn");
    const none = simulateSensorChargeRealization({ accumulatedCharge: charge(1000, 10), samplingProfile: sampling(), seedUint32: 3 }).value;
    expect(none).toMatchObject({ fixedPatternNoiseProfileId: null, photoResponseGainFactor: 1, darkCurrentFactor: 1, hotPixel: false,
      photoSampledMeanElectronCount: 1000, darkSampledMeanElectronCount: 10 });
  });
  it("adds static row/column offsets at readout and requires the same profile as the realization", () => {
    const fpn = pattern(), p = calculateSensorFixedPatternSite({ profile: fpn, site });
    const sample = rawCode(charge(100), readout(), fpn);
    expect(sample.fixedPatternReadoutOffsetElectrons).toBe(p.rowOffsetElectrons + p.columnOffsetElectrons);
    expect(sample.electronEquivalentAfterReadNoise).toBe(sample.electronEquivalentAfterPhysicalScalarSaturation + p.readoutOffsetElectrons);
    const c = charge(100), realization = simulateSensorChargeRealization({ accumulatedCharge: c, samplingProfile: sampling(), seedUint32: 1,
      fixedPatternNoise: fpn }).value;
    const base = { chargeRealization: realization, physicalCapacityAssessment: capacity(c), readoutProfile: readout(), regimeId: "r", readNoiseSeedUint32: 2 };
    expect(() => simulateSensorRawCode(base)).toThrow();
    expect(() => simulateSensorRawCode({ ...base, fixedPatternNoise: pattern({ profileId: "other" }) })).toThrow();
    expect(() => simulateSensorChargeRealization({ accumulatedCharge: c, samplingProfile: sampling(), seedUint32: 1,
      fixedPatternNoise: pattern({ colorSamplingProfileId: "elsewhere" }) })).toThrow();
  });
  it("rejects malformed profiles", () => {
    for (const bad of [{ schemaVersion: "9" }, { scientificStatus: "calibrated" }, { sensorInstanceSeedUint32: -1 },
      { photoResponseNonUniformity: { relativeStandardDeviation: fact(.9) } }, { hotPixels: { siteFraction: fact(2), darkCurrentMultiplier: fact(2) } },
      { hotPixels: { siteFraction: fact(.1), darkCurrentMultiplier: fact(.5) } }, { patternDistribution: "uniform" }, { unknown: 1 },
      { rowOffset: { rmsElectrons: fact(-1) } }, { limitations: ["a", "a"] }, { profileId: "has space" }]) {
      expect(() => pattern(bad)).toThrow();
    }
    expect(() => calculateSensorFixedPatternSite({ profile: pattern(), site: { x: -1, y: 0 } })).toThrow();
  });
});

/*
 * Precision noise-statistics checks (test review items 2-3). Each band is a predeclared 5-sigma
 * sampling band for n independent draws with fixed seeds:
 *   mean:     5 sqrt(Var / n)
 *   variance: 5 sqrt((kappa4 + 2 Var^2) / n) / Var   (relative; kappa4 = lambda for Poisson, 0 normal)
 * With n = 400 000 these reject a 2% variance error and a 0.5% mean error at every tested mean
 * (worst case lambda = 3: mean band 0.46%, variance band 1.2%), unlike the #270 per-phase bands.
 */
describe("precision of the seeded Poisson and Gaussian samplers", () => {
  const n = 400_000;
  function moments(draws: readonly number[]): { mean: number; variance: number } {
    let mean = 0;
    for (const d of draws) mean += d;
    mean /= draws.length;
    let variance = 0;
    for (const d of draws) variance += (d - mean) ** 2;
    return { mean, variance: variance / (draws.length - 1) };
  }
  it.each([3, 10, 29, 31, 100, 800])("Poisson(%d) mean and variance within 5-sigma bands of n = 400k", (lambda) => {
    const m = moments(samplePoissonStreamForValidation(lambda, 1000 + lambda, n));
    const meanBand = 5 * Math.sqrt(lambda / n), varianceBand = 5 * Math.sqrt((lambda + 2 * lambda * lambda) / n);
    expect(Math.abs(m.mean - lambda)).toBeLessThan(meanBand);
    expect(Math.abs(m.variance - lambda)).toBeLessThan(varianceBand);
    expect(meanBand / lambda).toBeLessThan(.005);
    expect(varianceBand / lambda).toBeLessThan(.02);
  });
  it("unit normal read-noise draws have variance 1 within 1.1% (rejects a 2% variance error)", () => {
    const m = moments(sampleStandardNormalStreamForValidation(4242, n));
    expect(Math.abs(m.mean)).toBeLessThan(5 / Math.sqrt(n));
    expect(Math.abs(m.variance - 1)).toBeLessThan(5 * Math.sqrt(2 / n));
    expect(5 * Math.sqrt(2 / n)).toBeLessThan(.012);
  });
  it("combines independent read-noise components in quadrature, not linearly", () => {
    const profile = parseSensorReadoutConversionProfile({ ...readout(), regimes: [{ ...readout().regimes[0]!,
      readNoiseComponents: [{ componentId: "a", rmsElectrons: fact(3), evidence }, { componentId: "b", rmsElectrons: fact(4), evidence }] }] });
    expect(resolveSensorReadoutRegime({ profile, regimeId: "r" }).combinedReadNoiseRmsElectrons).toBe(5);
    const c = charge(0);
    expect(calculateExpectedSensorReadout({ accumulatedCharge: c, physicalCapacityAssessment: capacity(c), readoutProfile: profile,
      regimeId: "r" }).value.electronicReadNoiseRmsElectrons).toBe(5);
    const realization = simulateSensorChargeRealization({ accumulatedCharge: c, samplingProfile: sampling(), seedUint32: 1 }).value;
    const assessment = capacity(c), count = 40_000, totals: number[] = [], a: number[] = [], b: number[] = [];
    for (let seed = 0; seed < count; seed++) {
      const r = simulateSensorRawCode({ chargeRealization: realization, physicalCapacityAssessment: assessment, readoutProfile: profile,
        regimeId: "r", readNoiseSeedUint32: seed }).value;
      const [ca, cb] = r.electronicReadNoiseComponents;
      expect(r.totalElectronicReadNoiseElectrons).toBe(ca!.sampledElectrons + cb!.sampledElectrons);
      totals.push(r.totalElectronicReadNoiseElectrons); a.push(ca!.sampledElectrons); b.push(cb!.sampledElectrons);
    }
    const band = 5 * Math.sqrt(2 / count);
    expect(Math.abs(moments(totals).variance / 25 - 1)).toBeLessThan(band);
    expect(Math.abs(moments(a).variance / 9 - 1)).toBeLessThan(band);
    expect(Math.abs(moments(b).variance / 16 - 1)).toBeLessThan(band);
  });
});
