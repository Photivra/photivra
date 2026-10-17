// SPDX-License-Identifier: Apache-2.0
/** Synthetic packed sensor-stage and temporal-sum inputs (declared test values, not calibration). */
import type { PackedSensorRawInput, SensorFixedPatternNoiseProfile, SensorReadoutConversionProfile, TemporalExposureSumInput } from "../../src/index.js";
import { loadSensorRawProducerInput } from "./sensor-raw-producer-fixture.js";

export interface ReadoutOptions {
  gain?: number; black?: number; bitDepth?: number; saturation?: number; preAdc?: number; sigmas?: number[]; digitalGain?: number;
  inl?: { code: number; offsetCodes: number }[];
}

/** The producer fixture's readout profile with the given regime values. */
export function readoutProfile(o: ReadoutOptions = {}): SensorReadoutConversionProfile {
  const profile = structuredClone(loadSensorRawProducerInput().sites[0]!.readoutProfile);
  const regime = profile.regimes[0]!, evidence = regime.evidence;
  const bitDepth = o.bitDepth ?? 12;
  regime.systemConversionGainElectronsPerCode = { value: o.gain ?? 1, evidence };
  regime.preAdcSaturationElectronEquivalent = { value: o.preAdc ?? 1e6, evidence };
  regime.readNoiseComponents = (o.sigmas ?? [2]).map((s, i) => ({ componentId: `read-${i}`, rmsElectrons: { value: s, evidence }, evidence }));
  regime.adc = { bitDepth, blackLevelCode: o.black ?? 64, digitalSaturationCode: o.saturation ?? 2 ** bitDepth - 1, transfer: "uniform-round-half-up",
    ...(o.digitalGain === undefined ? {} : { digitalGain: o.digitalGain }),
    ...(o.inl === undefined ? {} : { integralNonLinearity: { kind: "piecewise-linear-code-offset" as const, knots: o.inl, evidence } }) };
  return profile;
}

/** Deterministic pseudo-random generator for corpus values (not the engine's noise streams). */
export function corpusRandom(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 2 ** 32; };
}

export interface SensorInputOptions {
  width: number; height: number; nativeWidth?: number; nativeHeight?: number; x?: number; y?: number; seed?: number;
  capacity?: number; readout?: SensorReadoutConversionProfile;
  photo: (i: number, column: number, row: number) => number; dark?: (i: number) => number;
}

export function sensorStageInput(o: SensorInputOptions): PackedSensorRawInput {
  const count = o.width * o.height, photo = new Float64Array(count), dark = new Float64Array(count);
  for (let i = 0; i < count; i++) { photo[i] = o.photo(i, i % o.width, Math.floor(i / o.width)); dark[i] = o.dark?.(i) ?? 0; }
  return { schemaVersion: "0.1.0", nativeWidth: o.nativeWidth ?? o.width, nativeHeight: o.nativeHeight ?? o.height,
    region: { x: o.x ?? 0, y: o.y ?? 0, width: o.width, height: o.height }, captureSeedUint32: o.seed ?? 0x5eed,
    photoElectrons: photo, darkElectrons: dark, physicalChargeCapacityElectrons: o.capacity ?? 60_000,
    readoutProfile: o.readout ?? readoutProfile(), regimeId: "base" };
}

/**
 * A corpus that reaches every sampler branch: zero means, the multiplication method (< 30), PTRS
 * (30 to 1e9, including values far above capacity), the normal approximation (≥ 1e9), near-capacity and pre-ADC-saturating values, with
 * a dark signal on some sites.
 */
export function sensorCorpus(width: number, height: number, seed: number, readout = readoutProfile(), capacity = 60_000): PackedSensorRawInput {
  const random = corpusRandom(seed);
  const levels = [0, 0.3, 4, 29.9, 30, 150, 2_500, 20_000, 59_000, 75_000, 2e6, 1.02e9];
  return sensorStageInput({ width, height, seed, capacity, readout,
    photo: () => { const level = levels[Math.floor(random() * levels.length)]!; return level === 0 ? 0 : level >= 1e9 ? level + 1e7 * random() : level * (0.9 + 0.2 * random()); },
    dark: () => (random() < 0.3 ? 5 * random() : 0) });
}

const fpnEvidence = [{ sourceOrigin: "photivra", sourceReference: "test:packed-fixed-pattern", reuseStatus: "photivra-owned" }] as const;
const fpnFact = <T>(value: T): { value: T; evidence: typeof fpnEvidence } => ({ value, evidence: fpnEvidence });

/** A synthetic fixed-pattern profile (declared test values, not a measured sensor). */
export function fixedPatternProfile(o: { prnu?: number; dsnu?: number; hotFraction?: number; hotMultiplier?: number; row?: number; column?: number;
  seed?: number } = {}): SensorFixedPatternNoiseProfile {
  return { schemaVersion: "0.1.0", profileId: "fpn-test", colorSamplingProfileId: "color", scientificStatus: "approximation",
    sensorInstanceSeedUint32: o.seed ?? 2024, photoResponseNonUniformity: { relativeStandardDeviation: fpnFact(o.prnu ?? 0.01) },
    darkSignalNonUniformity: { relativeStandardDeviation: fpnFact(o.dsnu ?? 0.2) },
    hotPixels: { siteFraction: fpnFact(o.hotFraction ?? 0.01), darkCurrentMultiplier: fpnFact(o.hotMultiplier ?? 40) },
    rowOffset: { rmsElectrons: fpnFact(o.row ?? 1.5) }, columnOffset: { rmsElectrons: fpnFact(o.column ?? 0.75) },
    patternDistribution: "normal-factors-truncated-at-zero", evidence: fpnEvidence, limitations: ["Synthetic test pattern."] };
}

/**
 * The sensor corpus plus fixed-pattern noise and three additional stored-charge components: a Poisson
 * leakage, a fractional deterministic charge and a second Poisson component.
 */
export function fixedPatternCorpus(width: number, height: number, seed: number, readout = readoutProfile(), capacity = 60_000,
  fpn = fixedPatternProfile()): PackedSensorRawInput {
  const base = sensorCorpus(width, height, seed, readout, capacity), random = corpusRandom(seed * 7 + 1), count = width * height;
  const leak = new Float64Array(count), offset = new Float64Array(count), glow = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    leak[i] = random() < 0.5 ? 0 : 40 * random();
    offset[i] = random() < 0.2 ? 0 : 3.3 * random() + (random() < 0.1 ? 1000 * random() : 0);
    glow[i] = random() < 0.8 ? 0 : 2_000 * random();
  }
  return { ...base, fixedPatternNoise: { profile: fpn, colorSamplingProfileId: "color", siteOrigin: { x: 3, y: 11 } },
    additionalChargeComponents: [{ componentId: "leak", model: "poisson", expectedElectrons: leak },
      { componentId: "offset", model: "deterministic-expected-electron-equivalent", expectedElectrons: offset },
      { componentId: "glow", model: "poisson", expectedElectrons: glow }] };
}

/** Temporal-sum corpus: nine-decade samples, `nodes` displacements along a path, rolling row windows. */
export function temporalCorpus(width: number, height: number, nodes: number, seed: number, rolling = true, subSite = true): TemporalExposureSumInput {
  const random = corpusRandom(seed), samples = new Float64Array(width * height), displacements = new Float64Array(2 * nodes);
  for (let i = 0; i < samples.length; i++) samples[i] = 10 ** (9 * random() - 4) * (random() < 0.05 ? 0 : 1);
  for (let k = 0; k < nodes; k++) {
    const t = nodes === 1 ? 0 : k / (nodes - 1);
    displacements[2 * k] = subSite ? 3.7 * t - 1.3 : Math.round(4 * t - 2);
    displacements[2 * k + 1] = subSite ? -2.2 * t + 0.4 : Math.round(-2 * t);
  }
  const rowWeights = new Float64Array(nodes * height);
  for (let k = 0; k < nodes; k++) for (let y = 0; y < height; y++) {
    // Rolling: each row's window covers a sliding subset of nodes; global: every node, every row.
    const centre = rolling ? (y / Math.max(1, height - 1)) * (nodes - 1) : k;
    rowWeights[k * height + y] = Math.abs(k - centre) <= nodes / 3 ? (1 / 1000) * (0.5 + random()) : 0;
  }
  return { schemaVersion: "0.1.0", width, height, samples, displacements, rowWeights, boundary: "zero-outside-grid" };
}
