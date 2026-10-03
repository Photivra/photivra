// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { calculatePrintRegionDifference, calculatePrintRegionNoise, simulateSensorRawFrame } from "../src/index.js";
import { printReadoutProducer, printReadoutFrame, type PrintReadoutExperiment } from "./helpers/print-readout-backend-fixture.js";

interface ReferenceCase extends PrintReadoutExperiment {
  name: string; expectedStored: number[]; expectedPreAdc: number[]; expectedRawCodes: number[];
  expectedPhysicalClipping: boolean[]; expectedPreAdcClipping: boolean[]; expectedDigitalClipping: boolean[];
  pairs: { stage: string; before: number[]; after: number[]; meanDifference: number; rmsDifference: number; maximumDifference: number }[];
}
const bytes = readFileSync(new URL("./fixtures/print-detail/readout-backend-reference.json", import.meta.url));
const reference = JSON.parse(bytes.toString()) as { cases: ReferenceCase[] };
it("pins the independent high-bit electronic stage reference", () => {
  expect(createHash("sha256").update(bytes).digest("hex")).toBe("e2ac2a2cc6dbc84307184c54d2dc2f2bf1ba7eb28ac0b097a07e3bf3557c366c");
});
it.each(reference.cases)("isolates $name through actual native RAW execution and linear paired statistics", c => {
  const raw = simulateSensorRawFrame(printReadoutProducer(c)).value, readout = raw.sites.map(s => s.readout.value);
  expect(raw.upstreamRadiometryVerified).toBe(false);
  expect(raw.frame.samples.map(s => s.rawCode)).toEqual(c.expectedRawCodes);
  expect(readout.map(s => s.electronEquivalentAfterPhysicalScalarSaturation)).toEqual(c.expectedStored);
  expect(readout.map(s => s.electronEquivalentAfterPreAdcSaturation)).toEqual(c.expectedPreAdc);
  expect(readout.map(s => s.physicalScalarSaturationApplied)).toEqual(c.expectedPhysicalClipping);
  expect(readout.map(s => s.preAdcSaturationApplied)).toEqual(c.expectedPreAdcClipping);
  expect(readout.map(s => s.digitalSaturationApplied)).toEqual(c.expectedDigitalClipping);
  const actual = [readout.map(s => s.realizedStoredElectronEquivalentCountBeforePhysicalCapacity / 100),
    readout.map(s => s.electronEquivalentAfterPhysicalScalarSaturation / 100), readout.map(s => s.electronEquivalentAfterPreAdcSaturation / 100),
    raw.frame.samples.map(s => (s.rawCode - 512) * c.conversionGainElectronsPerCode / 100)];
  c.pairs.forEach((pair, i) => {
    expect(actual[i]).toEqual(pair.before); expect(actual[i + 1]).toEqual(pair.after);
    const before = printReadoutFrame(actual[i]!, raw, "electronic-" + pair.stage + "-before", null);
    const after = printReadoutFrame(actual[i + 1]!, raw, "electronic-" + pair.stage + "-after", null);
    const result = calculatePrintRegionDifference({ assessmentId: "owned-" + c.name + "-" + pair.stage, before, after,
      purpose: "processing-change", realizationPolicy: "deterministic-reference", referenceRange: null }).value;
    expect(result.status).toBe("diagnostic-only");
    expect(Math.abs(result.measurement!.meanSignedDifferenceRelativeLuminance - pair.meanDifference)).toBeLessThan(1e-14);
    expect(Math.abs(result.measurement!.rmsDifferenceRelativeLuminance - pair.rmsDifference)).toBeLessThan(1e-14);
    expect(Math.abs(result.measurement!.maximumAbsoluteDifferenceRelativeLuminance - pair.maximumDifference)).toBeLessThan(1e-14);
    expect(result.acquisitionQualification).toBe("unassessed"); expect(result.overallPrintVerdict).toBe("not-offered");
  });
});

it.each([0, 2])("checks photo + dark + read-noise repeats with RMS read noise %s before and after the 12-bit ADC", rms => {
  const experiment: PrintReadoutExperiment = { capacityElectrons: 8000, preAdcElectronEquivalent: 5000, conversionGainElectronsPerCode: .25,
    injectedElectronEquivalents: [0, 0, 0, 0], photoMean: 200, darkMean: 8, readNoiseRmsElectrons: rms };
  const repeats = Array.from({ length: 256 }, (_, i) => simulateSensorRawFrame(printReadoutProducer(experiment, i)).value);
  repeats.forEach(raw => raw.sites.forEach(site => {
    expect(site.readout.value.physicalScalarSaturationApplied).toBe(false);
    expect(site.readout.value.preAdcSaturationApplied).toBe(false); expect(site.readout.value.digitalSaturationApplied).toBe(false);
    expect(site.readout.value.lowerCodeClampApplied).toBe(false);
  }));
  for (const n of [32, 64, 128, 256]) {
    const frames = repeats.slice(0, n).map((raw, i) => printReadoutFrame(raw.sites.map(s => s.readout.value.electronEquivalentAfterReadNoise / 200),
      raw, "pre-adc-linear-repeat-" + i, "owned-realization-" + i));
    // Processing version must be identical across repeats, while representations
    // and captures identify distinct acquisitions of the same stationary signal.
    frames.forEach(f => { f.source.processing.id = "owned-pre-adc-linear-neutral-reference"; });
    const before = calculatePrintRegionNoise({ assessmentId: "pre-adc-ensemble", ensembleId: "owned-readout-repeats", stationarySceneId: "owned-constant-neutral-signal",
      repeatPolicy: "independent-stationary-captures", frames }).value;
    expect(before.status).toBe("diagnostic-only");
    // Independent compound moments: Poisson(photo+dark) plus Gaussian electronics.
    // Predeclared broad conformance bands are not confidence for any photograph.
    const variance = 208 + rms * rms, expected = variance / 200 ** 2;
    expect(Math.abs(before.measurement!.meanRelativeLuminance - 208 / 200)).toBeLessThan(8 * Math.sqrt(variance / n) / 200);
    expect(Math.abs(before.measurement!.meanTemporalSampleVarianceRelativeLuminanceSquared - expected))
      .toBeLessThan(8 * Math.sqrt(208 / n + 2 * variance ** 2 / (n - 1)) / 200 ** 2);
    const afterFrames = repeats.slice(0, n).map((raw, i) => printReadoutFrame(raw.frame.samples.map(s => (s.rawCode - 512) * .25 / 200),
      raw, "decoded-adc-linear-repeat-" + i, "owned-realization-" + i));
    afterFrames.forEach(f => { f.source.processing.id = "owned-decoded-12bit-linear-neutral-reference"; });
    const after = calculatePrintRegionNoise({ assessmentId: "decoded-adc-ensemble", ensembleId: "owned-readout-repeats", stationarySceneId: "owned-constant-neutral-signal",
      repeatPolicy: "independent-stationary-captures", frames: afterFrames }).value;
    expect(after.status).toBe("diagnostic-only");
    // Deterministic rounding error bound, without a uniform/independent error model.
    const errorBound = .25 / (2 * 200);
    expect(Math.abs(after.measurement!.meanRelativeLuminance - before.measurement!.meanRelativeLuminance)).toBeLessThanOrEqual(errorBound + 1e-14);
    expect(Math.abs(after.measurement!.temporalRmsRelativeLuminance - before.measurement!.temporalRmsRelativeLuminance))
      .toBeLessThanOrEqual(errorBound * Math.sqrt(n / (n - 1)) + 1e-14);
  }
}, 30000);

it("retains signed zero-signal read noise and attributes the positive bias to the final unsigned ADC clamp", () => {
  const repeats = Array.from({ length: 256 }, (_, i) => simulateSensorRawFrame(printReadoutProducer({ capacityElectrons: 8000,
    preAdcElectronEquivalent: 5000, conversionGainElectronsPerCode: .25, injectedElectronEquivalents: [0, 0, 0, 0],
    photoMean: 0, darkMean: 0, readNoiseRmsElectrons: 8, blackLevelCode: 0 }, i)).value);
  const readings = repeats.flatMap(r => r.sites.map(s => s.readout.value));
  expect(readings.some(r => r.electronEquivalentAfterPreAdcSaturation < 0)).toBe(true);
  expect(readings.some(r => r.electronEquivalentAfterPreAdcSaturation > 0)).toBe(true);
  expect(readings.some(r => r.lowerCodeClampApplied)).toBe(true);
  expect(readings.every(r => !r.physicalScalarSaturationApplied && !r.preAdcSaturationApplied && !r.digitalSaturationApplied)).toBe(true);
  const beforeFrames = repeats.map((raw, i) => printReadoutFrame(raw.sites.map(s => s.readout.value.electronEquivalentAfterPreAdcSaturation / 100),
    raw, "signed-dark-reference-" + i, "zero-photo-read-noise-" + i));
  const afterFrames = repeats.map((raw, i) => printReadoutFrame(raw.frame.samples.map(s => s.rawCode * .25 / 100),
    raw, "unsigned-dark-reference-" + i, "zero-photo-read-noise-" + i));
  beforeFrames.forEach(f => { f.source.processing.id = "signed-pre-adc-dark-reference"; });
  afterFrames.forEach(f => { f.source.processing.id = "unsigned-12bit-dark-reference"; });
  const input = { assessmentId: "dark-readout-ensemble", ensembleId: "owned-zero-signal", stationarySceneId: "owned-dark-electronics",
    repeatPolicy: "independent-stationary-captures" as const, frames: beforeFrames };
  const before = calculatePrintRegionNoise(input).value, after = calculatePrintRegionNoise({ ...input, frames: afterFrames }).value;
  expect(before.status).toBe("diagnostic-only"); expect(after.status).toBe("diagnostic-only");
  // Independent moments of X~N(0,sigma²) and max(0,X), plus a deterministic
  // half-code quantization bound. No Gaussian fit to the observed samples.
  const variance = .08 ** 2, positiveMean = .08 / Math.sqrt(2 * Math.PI), positiveVariance = variance * (.5 - 1 / (2 * Math.PI));
  expect(Math.abs(before.measurement!.meanRelativeLuminance)).toBeLessThan(8 * Math.sqrt(variance / 256));
  expect(Math.abs(before.measurement!.meanTemporalSampleVarianceRelativeLuminanceSquared - variance))
    .toBeLessThan(8 * Math.sqrt(2 * variance ** 2 / 255));
  expect(Math.abs(after.measurement!.meanRelativeLuminance - positiveMean)).toBeLessThan(8 * Math.sqrt(positiveVariance / 256) + .25 / 200);
  // Same immutable acquisition and named realization: the paired difference is
  // caused by ADC processing, not by replacing the source with a different draw.
  for (let i = 0; i < repeats.length; i++) {
    const difference = calculatePrintRegionDifference({ assessmentId: "unsigned-clamp-" + i, before: beforeFrames[i]!, after: afterFrames[i]!,
      purpose: "processing-change", realizationPolicy: "same-noise-realization", referenceRange: null }).value;
    expect(difference.status).toBe("diagnostic-only");
    expect(difference.measurement!.meanSignedDifferenceRelativeLuminance).toBeGreaterThanOrEqual(-.25 / 200 - 1e-14);
  }
}, 30000);
