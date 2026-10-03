// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { calculatePrintRegionDifference, calculatePrintRegionNoise, parsePrintRegionDifferenceInput, parsePrintRegionNoiseInput,
  type PrintRegionDifferenceMeasurement, type PrintRegionNoiseMeasurement } from "../src/index.js";
import { statisticsDifference, statisticsNoise } from "./helpers/print-region-statistics-fixture.js";

const bytes = readFileSync(new URL("./fixtures/print-detail/statistics-reference.json", import.meta.url));
const reference = JSON.parse(bytes.toString()) as {
  difference: { name: string; before: number[]; after: number[]; bounds: [number, number] | null; expected: PrintRegionDifferenceMeasurement }[];
  noise: { name: string; frames: number[][]; expected: PrintRegionNoiseMeasurement }[];
};
function compare(actual: unknown, expected: unknown): void {
  if (typeof expected === "number") {
    expect(typeof actual).toBe("number");
    if (expected === 0) expect(Math.abs(actual as number)).toBeLessThan(1e-14);
    else expect(Math.abs((actual as number) / expected - 1)).toBeLessThan(2e-14);
  } else if (expected === null) expect(actual).toBeNull();
  else if (Array.isArray(expected)) {
    expect(actual).toHaveLength(expected.length); expected.forEach((v, i) => compare((actual as unknown[])[i], v));
  } else for (const [key, value] of Object.entries(expected as object)) compare((actual as Record<string, unknown>)[key], value);
}

it("binds the independent exact-rational reference artifact", () => {
  expect(createHash("sha256").update(bytes).digest("hex")).toBe("f7599612838f18ccc4eaa6e1876e5ea0fc1c5b2c59651531f10e29fda8df1f5b");
});
it.each(reference.difference)("matches the independent paired reference: $name", c => {
  const input = statisticsDifference(c.before, c.after);
  input.referenceRange = c.bounds ? { lowerRelativeLuminance: c.bounds[0], upperRelativeLuminance: c.bounds[1] } : null;
  const snapshot = structuredClone(input), result = calculatePrintRegionDifference(input);
  expect(result.value.status).toBe("diagnostic-only"); compare(result.value.measurement, c.expected);
  expect(input).toEqual(snapshot); expect(Object.isFrozen(result.value.input.after.samples)).toBe(true);
  expect(result.value).toMatchObject({ acquisitionQualification: "unassessed", uncertainty: "not-quantified", overallPrintVerdict: "not-offered" });
});
it.each(reference.noise)("matches the independent temporal reference: $name", c => {
  const input = statisticsNoise(c.frames), snapshot = structuredClone(input), result = calculatePrintRegionNoise(input);
  expect(result.value.status).toBe("diagnostic-only"); compare(result.value.measurement, c.expected);
  expect(input).toEqual(snapshot); expect(Object.isFrozen(result.value.measurement!.perSiteSampleVariancesRelativeLuminanceSquared)).toBe(true);
});
it("retains the same realization and requires exact pre-encode/decoded stages", () => {
  const input = statisticsDifference(); input.realizationPolicy = "same-noise-realization";
  expect(calculatePrintRegionDifference(input).value.blockers).toContain("same-noise-realization-required");
  input.before.source.noiseRealizationId = input.after.source.noiseRealizationId = "same-draw";
  expect(calculatePrintRegionDifference(input).value.status).toBe("diagnostic-only");
  input.after.source.noiseRealizationId = "different-draw";
  expect(calculatePrintRegionDifference(input).value.status).toBe("blocked");
  input.after.source.noiseRealizationId = "same-draw"; input.purpose = "decoded-file-change";
  expect(calculatePrintRegionDifference(input).value.blockers).toContain("exact-pre-encode-and-decoded-stages-required");
  input.before.source.stage = "post-resampling-linear"; input.after.source.stage = "post-encoding-decoded-linear";
  expect(calculatePrintRegionDifference(input).value.status).toBe("diagnostic-only");
});
it.each(["capture", "noise", "deterministic", "representation", "roi", "domain", "warp", "native", "upscale", "aspect", "missing", "print"])("blocks paired %s without a measurement", fault => {
  const r = statisticsDifference();
  if (fault === "capture") r.after.source.captureId = "other";
  if (fault === "noise") r.realizationPolicy = "same-noise-realization";
  if (fault === "deterministic") r.after.source.noiseRealizationId = "draw";
  if (fault === "representation") r.after.source.representationId = r.before.source.representationId;
  if (fault === "roi") r.after.region.role = "intentional-defocus";
  if (fault === "domain") r.after.source.domain = "transfer-encoded-luma";
  if (fault === "warp") r.after.source.registration = "correction-or-warp-unqualified";
  if (fault === "native" && r.after.print.source.kind === "native-retained") r.after.print.source.geometry.nativeRaster.pixelWidth = 8;
  if (fault === "upscale") r.after.source.raster.pixelWidth = 8;
  if (fault === "aspect") { r.after.source.raster.pixelWidth = 5; r.after.source.stage = "post-resampling-linear"; }
  if (fault === "missing") r.after.print.source = { kind: "unavailable", reason: "missing-native-raster" };
  if (fault === "print") r.after.print.printedImage.height = 2;
  const result = calculatePrintRegionDifference(r).value; expect(result.status).toBe("blocked"); expect(result.measurement).toBeNull();
});
it.each(["capture", "representation", "missing-realization", "reused-realization", "processing", "stage", "geometry"])("blocks repeat %s", fault => {
  const r = statisticsNoise(), first = r.frames[0]!, frame = r.frames[1]!;
  if (fault === "capture") { frame.source.captureId = first.source.captureId; if (frame.print.source.kind === "native-retained") frame.print.source.captureId = first.source.captureId; }
  if (fault === "representation") frame.source.representationId = first.source.representationId;
  if (fault === "missing-realization") frame.source.noiseRealizationId = null;
  if (fault === "reused-realization") frame.source.noiseRealizationId = first.source.noiseRealizationId;
  if (fault === "processing") frame.source.processing.version = "different";
  if (fault === "stage") frame.source.stage = "post-resampling-linear";
  if (fault === "geometry") frame.region.subjectDistanceM = 10;
  const result = calculatePrintRegionNoise(r).value; expect(result.status).toBe("blocked"); expect(result.measurement).toBeNull();
});
it("keeps viewing conditions out of captured statistics and preserves sampling shortfalls", () => {
  const before = calculatePrintRegionNoise(statisticsNoise()).value, r = statisticsNoise();
  r.frames.forEach(frame => { frame.print.printedImage.width *= 10; frame.print.printedImage.height *= 10; frame.print.viewingDistance.value *= 10; });
  const after = calculatePrintRegionNoise(r).value;
  expect(after.measurement).toEqual(before.measurement); expect(after.print.status).toBe("insufficient-native-pixels");
});
it("returns finite JSON and explicit unsupported numeric ranges", () => {
  const subnormal = calculatePrintRegionNoise(statisticsNoise([[Number.MIN_VALUE], [Number.MIN_VALUE], [Number.MIN_VALUE]])).value;
  expect(subnormal.measurement!.meanRelativeLuminance).toBe(Number.MIN_VALUE); expect(subnormal.measurement!.temporalRmsRelativeLuminance).toBe(0);
  const overflow = statisticsDifference([Number.MAX_VALUE], [-Number.MAX_VALUE]); overflow.referenceRange = null;
  const r = calculatePrintRegionDifference(overflow).value; expect(r.status).toBe("unsupported"); expect(r.measurement).toBeNull();
  const underflow = calculatePrintRegionNoise(statisticsNoise([[1e-200], [-1e-200]])).value;
  expect(underflow.status).toBe("unsupported"); expect(underflow.blockers).toContain("noise-numeric-range-unsupported");
  const range = statisticsDifference([0], [-Number.MAX_VALUE]); range.referenceRange = { lowerRelativeLuminance: Number.MAX_VALUE / 2, upperRelativeLuminance: Number.MAX_VALUE };
  expect(calculatePrintRegionDifference(range).value.status).toBe("unsupported");
  const lost = statisticsDifference([0, 0], [Number.MIN_VALUE, Number.MAX_VALUE]); lost.referenceRange = null;
  expect(calculatePrintRegionDifference(lost).value.blockers).toContain("difference-dynamic-range-unsupported");
  for (const result of [r, underflow]) expect(JSON.stringify(result)).not.toMatch(/NaN|Infinity/);
});
it("preserves subnormal constant levels across multiple sites rather than dividing them into zero", () => {
  const level = Number.MIN_VALUE;
  const r = calculatePrintRegionNoise(statisticsNoise([[level, level, level, level], [level, level, level, level]])).value;
  expect(r.blockers).toEqual([]);
  expect(r.status).toBe("diagnostic-only");
  expect(r.measurement!.meanRelativeLuminance).toBe(level);
  expect(r.measurement!.perSiteMeansRelativeLuminance).toEqual([level, level, level, level]);
  expect(r.measurement!.temporalRmsRelativeLuminance).toBe(0);
});
it("strictly parses, copies and bounds untrusted requests", () => {
  const r = statisticsDifference(), parsed = parsePrintRegionDifferenceInput(r); (r.after.samples as number[])[0] = 99;
  expect(parsed.after.samples[0]).toBe(.2);
  for (const bad of [null, {}, { ...r, path: "/private" }, { ...r, purpose: "noise" }, { ...r, referenceRange: { lowerRelativeLuminance: 1, upperRelativeLuminance: 0 } },
    { ...r, after: { ...r.after, samples: new Array(4) } }, { ...r, after: { ...r.after, samples: [NaN, 0, 0, 0] } }]) expect(() => parsePrintRegionDifferenceInput(bad)).toThrow();
  const tooLarge = statisticsDifference(new Array(32769).fill(1), new Array(32769).fill(1));
  expect(() => parsePrintRegionDifferenceInput(tooLarge)).toThrow(/budget/);
  const maximum = statisticsDifference(new Array(32768).fill(1), new Array(32768).fill(1)); maximum.referenceRange = null;
  expect(calculatePrintRegionDifference(maximum).value.status).toBe("diagnostic-only");
  const noise = statisticsNoise(); const copy = parsePrintRegionNoiseInput(noise); (noise.frames[0]!.samples as number[])[0] = 999;
  expect(copy.frames[0]!.samples[0]).toBe(-2);
  for (const frames of [[], [copy.frames[0]], new Array(2), new Array(257).fill(copy.frames[0])]) expect(() => parsePrintRegionNoiseInput({ ...copy, frames })).toThrow();
  expect(() => parsePrintRegionNoiseInput({ ...copy, frames: new Array(3).fill(maximum.before) })).toThrow(/budget/);
  expect(() => parsePrintRegionNoiseInput({ ...copy, repeatPolicy: "single-image-spatial-variance" })).toThrow();
});
