// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { ownedDepthPupilKernel } from "./helpers/print-depth-pupil-fixture.js";

const bytes = readFileSync(new URL("./fixtures/print-detail/pupil-convergence-reference.json", import.meta.url));
const reference = JSON.parse(bytes.toString()) as { cases: {
  subjectDistanceM: number; apertureFNumber: number; gridSamples: number; pupilRadiusSamples: number;
  role: string; expectedFiniteTransfer: number; expectedContinuousTransfer: number;
  continuousReferenceDelta: number; analyticFocusedTransfer: number | null;
}[] };
it("pins the independent continuous-pupil and finite-DFT pilot", () => {
  expect(createHash("sha256").update(bytes).digest("hex")).toBe("f643078ead1c3375a73306bad033d40465241ed70a7c83e09c50ae5da815014e");
});
it.each(reference.cases)("checks $subjectDistanceM m f/$apertureFNumber on $gridSamples grid with $pupilRadiusSamples radius samples ($role)", c => {
  const kernel = ownedDepthPupilKernel(c.subjectDistanceM, c.apertureFNumber, c.gridSamples, c.pupilRadiusSamples);
  const center = (c.gridSamples - 1) / 2;
  let re = 0, im = 0;
  kernel.normalizedIntensity.forEach((weight, i) => {
    const phase = 2 * Math.PI * 25 * (i % c.gridSamples - center) * kernel.samplePitchMicrometersX / 1000;
    re += weight * Math.cos(phase); im -= weight * Math.sin(phase);
  });
  const transfer = Math.hypot(re, im);
  expect(Math.abs(transfer - c.expectedFiniteTransfer)).toBeLessThan(1e-11);
  expect(c.continuousReferenceDelta).toBeLessThan(1e-11);
  if (c.analyticFocusedTransfer !== null) {
    expect(Math.abs(c.expectedContinuousTransfer - c.analyticFocusedTransfer)).toBeLessThan(1e-11);
  }
  // This candidate criterion belongs only to the declared final padded grid,
  // depths/apertures and single frequency. Do not certify the historical 9x9
  // pupil, all frequencies, or a real lens from these checks.
  if (c.gridSamples === 61) expect(Math.abs(transfer - c.expectedContinuousTransfer)).toBeLessThan(.01);
  if (c.role === "unpadded-historical-finite-reference" && c.apertureFNumber === 32) {
    expect(Math.abs(transfer - c.expectedContinuousTransfer)).toBeGreaterThan(.14);
  }
});
