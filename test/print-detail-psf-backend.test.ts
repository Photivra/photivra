// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { calculatePrintRegionDetail, type PrintRegionDetailInput, type CaptureOrientation } from "../src/index.js";
import { renderPrintPsfExperiment, type PrintPsfExperiment } from "./helpers/print-psf-backend-fixture.js";
import { statisticsFrame, scalarRasterSha256 } from "./helpers/print-region-statistics-fixture.js";

const bytes = readFileSync(new URL("./fixtures/print-detail/psf-backend-reference.json", import.meta.url));
const reference = JSON.parse(bytes.toString()) as { cases: (PrintPsfExperiment & { expectedMean: number; expectedModulation: number; continuousApertureModulation: number })[] };
it("binds the independent PSF/source/aperture reference", () => {
  expect(createHash("sha256").update(bytes).digest("hex")).toBe("acafebedfed3ce2837cde6db121c80ac652de44a54c3ae2b2516b7369aa921fd");
});
it.each(reference.cases)("executes $kernel $frequencyCyclesPerMm with $spatialSampleCount aperture nodes per axis, phase $phaseRadians", c => {
  const samples = renderPrintPsfExperiment(c), frame = statisticsFrame(samples);
  if (frame.print.source.kind !== "native-retained") throw Error("fixture");
  frame.print.source.geometry = { imagingArea: { widthMm: 8, heightMm: 8 }, nativeRaster: { pixelWidth: 8, pixelHeight: 8 }, orientation: "landscape" };
  frame.print.printedImage = { width: 8, height: 8, unit: "inches" };
  frame.source.raster = { pixelWidth: 8, pixelHeight: 8 }; frame.source.processing = { id: "public-local-psf-aperture-backend", version: "0.1.0" };
  frame.region.rect = { x: 0, y: 0, width: 8, height: 8 };
  const input: PrintRegionDetailInput = { ...frame, assessmentId: "psf-detail-reference", target: { id: "owned-continuous-spectral-grating",
    version: "0.1.0", kind: "coherent-sinusoid", cyclesAcrossRegion: { x: c.frequencyCyclesPerMm.x * 8, y: c.frequencyCyclesPerMm.y * 8 }, referenceModulation: .5 } };
  const detail = calculatePrintRegionDetail(input).value;
  expect(detail.status).toBe("diagnostic-only");
  expect(Math.abs(detail.measurement!.meanRelativeLuminance - c.expectedMean)).toBeLessThan(1e-12);
  expect(Math.abs(detail.measurement!.fundamentalModulation - c.expectedModulation)).toBeLessThan(1e-12);
  // Independent continuous-aperture truth provides a convergence target; the
  // finite midpoint result is not silently promoted to exact area integration.
  const same = reference.cases.filter(r => r.kernel === c.kernel && r.phaseRadians === c.phaseRadians && JSON.stringify(r.frequencyCyclesPerMm) === JSON.stringify(c.frequencyCyclesPerMm));
  const errors = same.map(r => Math.abs(r.expectedModulation - r.continuousApertureModulation));
  for (let i = 1; i < errors.length; i++) expect(errors[i]).toBeLessThan(errors[i - 1]!);
  if (c.spatialSampleCount === 8) expect(Math.abs(detail.measurement!.fundamentalModulation - c.continuousApertureModulation)).toBeLessThan(.001);
  expect(detail.unassessed).toContain("captured-system-mtf"); expect(detail.overallPrintVerdict).toBe("not-offered");
  for (const orientation of ["landscape", "portrait-clockwise", "landscape-inverted", "portrait-counter-clockwise"] as CaptureOrientation[]) {
    const q = structuredClone(input), native = samples;
    if (q.print.source.kind !== "native-retained") throw Error("fixture");
    q.print.source.geometry.orientation = orientation;
    const oriented = Array.from({ length: 64 }, (_, i) => {
      const x = i % 8, y = Math.floor(i / 8);
      const [nx, ny] = { landscape: [x, y], "portrait-clockwise": [y, 7 - x],
        "landscape-inverted": [7 - x, 7 - y], "portrait-counter-clockwise": [7 - y, x] }[orientation];
      return native[ny! * 8 + nx!]!;
    });
    q.source.contentSha256 = scalarRasterSha256(oriented);
    q.source.representationId = `owned-psf-${orientation}`;
    // Off-center selected region remains on the known target and excludes other
    // field/background regions; orientation does not reset source phase.
    q.region.rect = { x: 1, y: 2, width: 4, height: 4 };
    q.samples = Array.from({ length: 16 }, (_, i) => oriented[(2 + Math.floor(i / 4)) * 8 + 1 + i % 4]!);
    const fx = c.frequencyCyclesPerMm.x * 4, fy = c.frequencyCyclesPerMm.y * 4;
    q.target.cyclesAcrossRegion = { landscape: { x: fx, y: fy }, "portrait-clockwise": { x: -fy, y: fx },
      "landscape-inverted": { x: -fx, y: -fy }, "portrait-counter-clockwise": { x: fy, y: -fx } }[orientation];
    const r = calculatePrintRegionDetail(q).value;
    expect(r.status).toBe("diagnostic-only"); expect(Math.abs(r.measurement!.fundamentalModulation - c.expectedModulation)).toBeLessThan(1e-12);
  }
});
