// SPDX-License-Identifier: Apache-2.0

/**
 * Defocus acceptance of the display view (#492, step 2b): for each case of `scripts/lib/display-view-defocus-cases.mjs`
 * (focus at 0.8× and 1.25× the subject distance; f/2.8, f/8 and f/16; 6 µm and 1.4 µm pitch; Speed, and Quality with
 * diffraction) it renders a block of the display view of a sharp scene with `lens.defocus`, and the same block, in
 * focus, of the scene blurred beforehand by the disc on the site lattice (the capture's defocused radiance; see the
 * library), at display scales of 1, 4 and 8 real pixels per display pixel, and compares their noise-free expected images
 * with the #480 thresholds (`scripts/lib/display-view-acceptance.mjs`): at least 99 % of pixels within ΔE2000 1, none
 * above 2.3, no expected value moved by more than its own noise σ. It also prints the largest difference in 8-bit codes
 * (0 means no difference image can show structure) and the render times.
 *
 * `--capture` also renders the capture (#492, step 2a) of each case's block (`output.region`) both ways at the same
 * noise seed and reports the fraction of identical RAW codes and the largest code difference (on a build whose capture
 * refuses `lens.defocus`, it reports the refusal).
 *
 *   node scripts/accept-display-view-defocus.mjs [--cases 0,1,...] [--scales 1,4,8] [--block 192x128] [--capture]
 *
 * Informational only: no CI gate (the test runs a subset). One process, cases one after another.
 */
import "./require-fresh-dist.mjs";
import console from "node:console";
import process from "node:process";
import { performance } from "node:perf_hooks";
import { URL } from "node:url";
import { DEFAULT_THRESHOLDS, createAcceptanceMetrics, judge } from "./lib/display-view-acceptance.mjs";
import { DEFOCUS_CASES, defocusCaseRequests } from "./lib/display-view-defocus-cases.mjs";

const DIST = new URL("../dist/", import.meta.url);
const { simulateDisplayViewWithInternals } = await import(new URL("facade/simulate-display-view.js", DIST).href);
const { createDefocusDiscSiteKernel } = await import(new URL("optics/defocus-disc-kernel.js", DIST).href);
const { deltaE2000, cielabOfXyz } = await import(new URL("color/color-difference.js", DIST).href);
const { resolveRgbColorSpace } = await import(new URL("color/rgb-color-spaces.js", DIST).href);
const { simulateCapture } = await import(new URL("index.js", DIST).href);
const { compareExpectedImages } = createAcceptanceMetrics({ deltaE2000, cielabOfXyz, srgb: resolveRgbColorSpace("srgb").value });

const argument = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; };
const cases = argument("--cases") ? argument("--cases").split(",").map(Number).map((id) => DEFOCUS_CASES[id]) : DEFOCUS_CASES;
const scales = argument("--scales", "1,4,8").split(",").map(Number);
const [blockWidth, blockHeight] = argument("--block", "192x128").split("x").map(Number);
const withCapture = process.argv.includes("--capture");

/** Same-seed captures of the block both ways (#492 step 2a), or why not. */
async function captureCheck(requests, kernel) {
  const region = { x: requests.view.region.x * (requests.candidate.output.width / requests.view.width), y: requests.view.region.y * (requests.candidate.output.height / requests.view.height),
    width: blockWidth, height: blockHeight };
  const withRegion = (options) => ({ ...options, output: { ...options.output, region: { x: Math.round(region.x), y: Math.round(region.y), width: region.width, height: region.height } } });
  let candidate;
  try { candidate = await simulateCapture(withRegion(requests.candidate)); } catch (error) {
    if (/does not yet support lens\.defocus/u.test(error.message)) return "capture refuses lens.defocus (step 2a not merged)";
    throw error;
  }
  const reference = await simulateCapture(withRegion(requests.referenceFor(kernel)));
  const a = candidate.raw.codes, b = reference.raw.codes;
  let same = 0, largest = 0;
  for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d === 0) same++; largest = Math.max(largest, d); }
  return `RAW codes identical ${(100 * same / a.length).toFixed(3)} %, largest difference ${largest}`;
}

console.log(`Thresholds: ${100 * DEFAULT_THRESHOLDS.withinFraction} % within ΔE2000 ${DEFAULT_THRESHOLDS.withinDeltaE}, none above ${DEFAULT_THRESHOLDS.maximumDeltaE}, |Δ|/σ ≤ ${DEFAULT_THRESHOLDS.maximumSigma}. Block ${blockWidth} × ${blockHeight} real pixels at the frame centre.`);
console.log("");
console.log("| Case | Pitch | f | Focus | Options | Disc (sites) | View kernel radius | Scale | Estimator | Within ΔE 1 | Max ΔE2000 | Max \\|Δ\\|/σ | Max 8-bit Δ | Verdict | View ms | Reference ms |" + (withCapture ? " Capture |" : ""));
console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |" + (withCapture ? " --- |" : ""));
let failures = 0;
for (const c of cases) for (const k of scales) {
  const requests = defocusCaseRequests(c, { k, block: { width: blockWidth, height: blockHeight } });
  let t = performance.now();
  const candidate = await simulateDisplayViewWithInternals(requests.candidate, requests.view);
  const viewMs = performance.now() - t;
  const disc = candidate.result.assumptions.find((a) => a.id === "lens.defocus").value, kernel = createDefocusDiscSiteKernel(disc.diameterSites);
  const viewKernel = candidate.result.assumptions.find((a) => a.id === "view.defocus").value;
  t = performance.now();
  const reference = await simulateDisplayViewWithInternals(requests.referenceFor(kernel), requests.view);
  const referenceMs = performance.now() - t;
  const { width, height } = requests.view.region;
  const m = compareExpectedImages({ width, height, reference: reference.internals.expected, candidate: candidate.internals.expected, referenceNoiseStd: reference.internals.noiseStd });
  const verdict = judge(m);
  if (!verdict.pass) failures++;
  const capture = withCapture && k === scales[0] ? await captureCheck(requests, kernel) : "";
  console.log(`| ${c.id} | ${c.pitch} µm | f/${c.fNumber} | ${c.focusFactor}× | ${c.quality ? "Quality" : "Speed"} | ${disc.diameterSites.toFixed(2)} | ${viewKernel.kernelRadiusSites} | 1:${k} | ` +
    `${candidate.internals.estimation} | ${(100 * m.withinFraction).toFixed(2)} % | ${m.maxDeltaE.toExponential(2)} | ${m.maxSigma.toExponential(2)} | ${m.maxCode8.toExponential(2)} | ` +
    `${verdict.pass ? "pass" : "FAIL: " + verdict.checks.filter((x) => !x.pass).map((x) => x.id).join(", ")} | ${viewMs.toFixed(0)} | ${referenceMs.toFixed(0)} |` + (withCapture ? ` ${capture} |` : ""));
}
console.log("");
console.log(`Node ${process.version}; ${failures === 0 ? "every case passes" : failures + " case(s) fail"}.`);
if (failures) process.exitCode = 1;
