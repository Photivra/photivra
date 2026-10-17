// SPDX-License-Identifier: Apache-2.0

/**
 * Times the Planckian-locus functions of the built package: locus chromaticity at one temperature,
 * nearest-locus CCT/Duv, the inverse (chromaticity from CCT + Duv), and Kelvin/tint white balance
 * with its default locus. The first CCT call in the process is timed separately because it prepares
 * the shared default locus and its coarse-scan cache.
 *
 * Usage: npm run build && node scripts/benchmark-planckian-locus.mjs [--locus <kind>]
 * `--locus` names the locus model `kind` passed to the CCT functions (default "planck-analytic-cmf").
 */

import "./require-fresh-dist.mjs";
import { performance } from "node:perf_hooks";
import process from "node:process";

import {
  calculateChromaticityFromCorrelatedColorTemperature,
  calculateCorrelatedColorTemperature,
  createColorTemperatureWhiteBalanceIntent,
  estimatePlanckianLocusChromaticity,
  resolveColorTemperatureWhiteBalance
} from "../dist/index.js";

const flag = process.argv.indexOf("--locus");
const locus = { kind: flag === -1 ? "planck-analytic-cmf" : process.argv[flag + 1] };
const REPEATS = 9;
const CALLS = 200;
const TEMPERATURES = [2000, 2856, 4000, 5000, 6504, 9000, 15000];
const camera = { profileId: "benchmark", profileVersion: "1", xyzToCameraRgb: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] };

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

const firstStart = performance.now();
calculateCorrelatedColorTemperature({ chromaticity: { x: 0.3127, y: 0.329 }, locus });
const firstCallMs = performance.now() - firstStart;

const chromaticities = TEMPERATURES.map((t) =>
  calculateChromaticityFromCorrelatedColorTemperature({ correlatedColorTemperatureKelvin: t, duv: 0.003, whiteLocus: "planckian", locus }).value);

const cases = {
  estimatePlanckianLocusChromaticity: (i) => estimatePlanckianLocusChromaticity({ temperatureKelvin: TEMPERATURES[i % TEMPERATURES.length] }),
  calculateCorrelatedColorTemperature: (i) => calculateCorrelatedColorTemperature({ chromaticity: chromaticities[i % chromaticities.length], locus }),
  calculateChromaticityFromCorrelatedColorTemperature: (i) => calculateChromaticityFromCorrelatedColorTemperature({
    correlatedColorTemperatureKelvin: TEMPERATURES[i % TEMPERATURES.length], duv: 0.003, whiteLocus: "planckian", locus }),
  resolveColorTemperatureWhiteBalanceDefaultLocus: (i) => resolveColorTemperatureWhiteBalance({
    stateId: "wb", whiteLocus: "planckian", tintInterpretation: "duv-cie-1960-uv", camera,
    intent: createColorTemperatureWhiteBalanceIntent({ intentId: "k", colorTemperatureKelvin: TEMPERATURES[i % TEMPERATURES.length], tint: 0 }) })
};

const results = {};
for (const [name, run] of Object.entries(cases)) {
  for (let i = 0; i < CALLS; i++) run(i); // warm-up
  const perCall = [];
  for (let r = 0; r < REPEATS; r++) {
    const start = performance.now();
    for (let i = 0; i < CALLS; i++) run(i);
    perCall.push(((performance.now() - start) / CALLS) * 1000);
  }
  results[name] = { medianMicrosecondsPerCall: Number(median(perCall).toFixed(2)), minimumMicrosecondsPerCall: Number(Math.min(...perCall).toFixed(2)) };
}

process.stdout.write(JSON.stringify({
  benchmark: "planckian-locus",
  benchmarkVersion: 1,
  locus: locus.kind,
  node: process.version,
  platform: process.platform + "-" + process.arch,
  repeats: REPEATS,
  callsPerRepeat: CALLS,
  firstCctCallMilliseconds: Number(firstCallMs.toFixed(3)),
  results
}, null, 2) + "\n");
