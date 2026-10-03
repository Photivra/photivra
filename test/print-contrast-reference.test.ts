// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { calculatePrintContrastReference, parsePrintContrastReferenceInput, PRINT_CONTRAST_REFERENCE_UPSTREAM_REVISION, type PrintContrastReferenceInput } from "../src/index.js";

const bytes = readFileSync(new URL("./fixtures/print-detail/contrast-reference.json", import.meta.url));
const reference = JSON.parse(bytes.toString()) as { upstreamRevision: string; cases: {
  meanLuminanceCdPerSquareMeter: number; spatialFrequencyCyclesPerDegree: number; contrastSensitivity: number; thresholdModulationMichelson: number }[] };
function input(): PrintContrastReferenceInput {
  return { referenceId: "owned-contrast-reference", stimulus: "static-neutral-d65-gabor", observer: "published-binocular-natural-pupil-reference",
    meanLuminanceCdPerSquareMeter: 50, spatialFrequencyCyclesPerDegree: 4, gaussianEnvelopeSigmaDegrees: 1.5,
    temporalFrequencyHz: 0, eccentricityDegrees: 0, modulationMichelson: .1 };
}
it("binds the independent high precision reference and exact licensed source revision", () => {
  expect(createHash("sha256").update(bytes).digest("hex")).toBe("0fb9cd0f6e3e7f9eaff59fdfe6b570285c566f4da15ed55d19a1de9d0df88a8b");
  expect(reference.upstreamRevision).toBe(PRINT_CONTRAST_REFERENCE_UPSTREAM_REVISION);
});
it.each(reference.cases)("matches 80-digit scalar equations at $meanLuminanceCdPerSquareMeter cd/m² and $spatialFrequencyCyclesPerDegree cpd", c => {
  const r = calculatePrintContrastReference({ ...input(), meanLuminanceCdPerSquareMeter: c.meanLuminanceCdPerSquareMeter,
    spatialFrequencyCyclesPerDegree: c.spatialFrequencyCyclesPerDegree });
  expect(r.provenance.kind).toBe("estimated"); expect(r.value.status).toBe("model-estimate");
  expect(Math.abs(r.value.estimate!.contrastSensitivity / c.contrastSensitivity - 1)).toBeLessThan(1e-12);
  expect(Math.abs(r.value.estimate!.thresholdModulationMichelson / c.thresholdModulationMichelson - 1)).toBeLessThan(1e-12);
  expect(r.value.estimate!.suppliedModulationToModelThresholdRatio).toBe(r.value.estimate!.contrastSensitivity * .1);
  expect(r.value).toMatchObject({ observerApplicability: "population-reference-unverified-for-individual", naturalImageVisibility: "unassessed",
    printStimulusMatch: "unassessed", uncertainty: "not-quantified", overallPrintVerdict: "not-offered" });
});
it("changes reference conditions without changing a captured-image diagnostic or inventing an acuity pass", () => {
  const dark = calculatePrintContrastReference({ ...input(), meanLuminanceCdPerSquareMeter: 1 }).value;
  const bright = calculatePrintContrastReference({ ...input(), meanLuminanceCdPerSquareMeter: 100 }).value;
  expect(bright.estimate!.contrastSensitivity).toBeGreaterThan(dark.estimate!.contrastSensitivity);
  const zero = calculatePrintContrastReference({ ...input(), modulationMichelson: 0 }).value;
  expect(zero.estimate!.suppliedModulationToModelThresholdRatio).toBe(0); expect(zero.overallPrintVerdict).toBe("not-offered");
});
it.each([{ meanLuminanceCdPerSquareMeter: .99 }, { meanLuminanceCdPerSquareMeter: 1000.01 }, { spatialFrequencyCyclesPerDegree: .2499 },
  { spatialFrequencyCyclesPerDegree: 16.01 }, { gaussianEnvelopeSigmaDegrees: 1.50001 }, { temporalFrequencyHz: 1 }, { eccentricityDegrees: .1 }])("fails closed outside reference conditions %j", patch => {
  const r = calculatePrintContrastReference({ ...input(), ...patch }).value;
  expect(r.status).toBe("unsupported"); expect(r.estimate).toBeNull(); expect(r.blockers).toContain("outside-static-neutral-reference-domain");
});
it("strictly parses, copies and freezes explicit conditions", () => {
  const r = input(), parsed = parsePrintContrastReferenceInput(r), result = calculatePrintContrastReference(r).value;
  r.meanLuminanceCdPerSquareMeter = 99; expect(parsed.meanLuminanceCdPerSquareMeter).toBe(50);
  expect(Object.isFrozen(result.input)).toBe(true);
  for (const value of [null, {}, { ...input(), camera: "commercial-profile" }, { ...input(), stimulus: "natural-photograph" }, { ...input(), observer: "20-20" },
    { ...input(), modulationMichelson: 1.1 }, { ...input(), eccentricityDegrees: -1 }, { ...input(), meanLuminanceCdPerSquareMeter: NaN },
    { ...input(), spatialFrequencyCyclesPerDegree: "4" }, { ...input(), gaussianEnvelopeSigmaDegrees: 0 }]) expect(() => parsePrintContrastReferenceInput(value)).toThrow();
});
