// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { ownedDepthPupilKernel } from "./helpers/print-depth-pupil-fixture.js";

const bytes = readFileSync(new URL("./fixtures/print-detail/pupil-convergence-reference.json", import.meta.url));
const reference = JSON.parse(bytes.toString()) as { cases: {
  subjectDistanceM: number; apertureFNumber: number; gridSamples: number; transformSamples: number; pupilRadiusSamples: number;
  role: string; expectedFiniteTransfer: number; expectedContinuousTransfer: number;
  continuousReferenceDelta: number; analyticFocusedTransfer: number | null;
}[] };
it("pins the independent continuous-pupil and finite-DFT pilot", () => {
  expect(createHash("sha256").update(bytes).digest("hex")).toBe("a8c5ab888ade59281a6ecc8a98b01ad3472c22a60af29424b1647c6655ae6282");
});
it.each(reference.cases)("checks $subjectDistanceM m f/$apertureFNumber on $gridSamples grid with $pupilRadiusSamples radius samples ($role)", c => {
  const kernel = ownedDepthPupilKernel(c.subjectDistanceM, c.apertureFNumber, c.gridSamples, c.pupilRadiusSamples);
  // The engine zero pads to at least 2S-1 samples (Goodman Q > 2).
  expect(kernel.widthSamples).toBe(c.transformSamples);
  let re = 0, im = 0;
  kernel.normalizedIntensity.forEach((weight, i) => {
    const phase = 2 * Math.PI * 25 * (i % kernel.widthSamples - kernel.centerSampleX) * kernel.samplePitchMicrometersX / 1000;
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
  // The historical 9x9 declaration used to wrap its intensity PSF (f/32 was
  // more than 0.14 from the continuous transfer). Automatic zero padding now
  // makes it identical to the explicit 17x17 pilot of the same pupil.
  if (c.role === "historical-9-grid-engine-zero-padded") {
    const padded = reference.cases.find(p => p.role === "padded-pupil-pilot" && p.gridSamples === 17 &&
      p.subjectDistanceM === c.subjectDistanceM && p.apertureFNumber === c.apertureFNumber)!;
    expect(Math.abs(transfer - padded.expectedFiniteTransfer)).toBeLessThan(1e-11);
  }
});
