// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { calculateLensComplexPupilPsf, calculateThinLensImageDistance, calculatePrintRegionDetail, parseLensComplexPupilProfile } from "../src/index.js";
import { statisticsFrame, scalarRasterSha256 } from "./helpers/print-region-statistics-fixture.js";

const bytes = readFileSync(new URL("./fixtures/print-detail/depth-backend-reference.json", import.meta.url));
const reference = JSON.parse(bytes.toString()) as { cases: { subjectDistanceM: number; apertureFNumber: number;
  expectedKernel: number[]; imageSamplePitchMm: number; expectedModulation: number }[] };
const evidence = [{ sourceOrigin: "photivra" as const, sourceReference: "owned finite pupil and visible metric planes", reuseStatus: "photivra-owned" as const }];
const focusImageMm = calculateThinLensImageDistance({ focalLengthMm: 50, objectDistanceM: 5 }).value.imageDistanceMm;
// Three bounded frontoparallel surfaces overlap the viewing field. A nearer
// surface has priority. Coordinates use real metric ray-plane intersections,
// not a depth label attached to an already rendered two-dimensional chart.
const planes = [{ depthM: 2, minimumX: -Infinity, maximumX: -.33 / focusImageMm * 2 },
  { depthM: 5, minimumX: -Infinity, maximumX: .33 / focusImageMm * 5 }, { depthM: 10, minimumX: -Infinity, maximumX: Infinity }];
function visiblePlane(imageXmm: number): typeof planes[number] {
  return planes.find(p => { const surfaceXMetres = imageXmm / focusImageMm * p.depthM;
    return surfaceXMetres >= p.minimumX && surfaceXMetres < p.maximumX; })!;
}
it("binds the independent depth/pupil reference", () => {
  expect(createHash("sha256").update(bytes).digest("hex")).toBe("d1bca3ad17e6730ad3861bd267d60f4601df7c7d50480d31af306e6eea46296f");
  expect([-.66, 0, .66].map(x => visiblePlane(x).depthM)).toEqual([2, 5, 10]);
  expect(visiblePlane(-.330001).depthM).toBe(2); expect(visiblePlane(-.329999).depthM).toBe(5);
  expect(visiblePlane(.329999).depthM).toBe(5); expect(visiblePlane(.330001).depthM).toBe(10);
});
it.each(reference.cases)("propagates a visible $subjectDistanceM m plane at f/$apertureFNumber, focused at 5m", c => {
  const objectImageMm = calculateThinLensImageDistance({ focalLengthMm: 50, objectDistanceM: c.subjectDistanceM }).value.imageDistanceMm;
  const fieldXmm = { 2: -.66, 5: 0, 10: .66 }[c.subjectDistanceM]!;
  const n = 9, center = 4, radius = 50 / (2 * c.apertureFNumber), pitch = radius / center;
  const amplitude = Array.from({ length: 81 }, (_, i) => ((i % n - center) * pitch)**2 + ((Math.floor(i/n) - center) * pitch)**2 <= radius**2 ? 1 : 0);
  // Explicit paraxial wavefront path difference in an owned ideal pupil. Shared
  // thin-lens distances supply focus geometry; no scalar blur radius is converted
  // into a kernel. The finite pupil backend jointly propagates diffraction/defocus.
  const opd = amplitude.map((_, i) => (((i % n - center) * pitch)**2 + ((Math.floor(i/n) - center) * pitch)**2) / 2 *
    (1 / focusImageMm - 1 / objectImageMm) * 1000);
  const kernel = calculateLensComplexPupilPsf({ propagationDistanceMm: focusImageMm, profile: parseLensComplexPupilProfile({ schemaVersion: "0.1.0", profileId: "owned-depth-pupil",
    profileVersion: "0.1.0", scientificStatus: "approximation", opticalDomain: "lens-primary-optical-path-only", representation: "complex-pupil-amplitude-plus-opd",
    pupilCoordinateSystem: "pupil-plane-metric-aligned-to-image-plane", imageFieldAxes: "+X right, +Y up", amplitudeMeaning: "relative-complex-pupil-amplitude-shape",
    wavefrontMeaning: "optical-path-difference-micrometers", throughputOwnership: "separate-relative-pupil-throughput-factor", kernelEnergyNormalization: "unit-energy-shape",
    propagationModel: "scalar-fraunhofer-discrete-reference", context: { focalLengthMm: 50, focus: { kind: "finite", distanceM: 5 },
      apertureFNumber: c.apertureFNumber, fieldPointMm: { x: fieldXmm, y: 0 }, wavelengthNm: 500,
      signedDefocusImagePlaneMicrometers: (focusImageMm - objectImageMm) * 1000 },
    responseIncludes: { diffraction: true, aberration: false, defocus: true, pupilClippingShape: true }, relativePupilThroughputFactor: 1,
    grid: { widthSamples: n, heightSamples: n, pupilSamplePitchMmX: pitch, pupilSamplePitchMmY: pitch, centerSampleX: center, centerSampleY: center,
      relativeAmplitude: amplitude, opticalPathDifferenceMicrometers: opd }, sensorOpticalStackIncluded: false, sensorSamplingIncluded: false,
    reconstructionIncluded: false, strayLightIncluded: false, evidence, uncertainty: { kind: "not-quantified", limitation: "Owned finite pupil; no lens calibration." },
    limitations: ["Owned paraxial field-invariant ideal pupil. Finite discrete scalar pupil; no continuum optics certificate or depth-edge PSF composition."] }) }).value.kernel;
  expect(Math.abs(kernel.samplePitchMicrometersX / 1000 - c.imageSamplePitchMm)).toBeLessThan(1e-14);
  kernel.normalizedIntensity.forEach((v, i) => expect(Math.abs(v - c.expectedKernel[i]!)).toBeLessThan(1e-12));
  const rect = { x: { 2: 32, 5: 98, 10: 164 }[c.subjectDistanceM]!, y: 98, width: 4, height: 4 };
  const row = Array.from({ length: 200 }, (_, column) => {
    const x = (column + .5 - 100) * .01;
    return kernel.normalizedIntensity.reduce((sum, weight, j) => {
      const sourceX = x - (j % n - center) * kernel.samplePitchMicrometersX / 1000;
      if (column >= rect.x && column < rect.x + rect.width) expect(visiblePlane(sourceX).depthM).toBe(c.subjectDistanceM);
      return sum + weight * (1 + .5 * Math.cos(2 * Math.PI * 25 * sourceX + .37));
    }, 0);
  });
  // Actual full row-major reference artifact, including explicit continuation
  // outside the qualified interior ROI. Those other pixels do not certify depth
  // edges or other surfaces; only this ROI has verified same-surface PSF support.
  const raster = Array.from({ length: 40000 }, (_, i) => row[i % 200]!);
  const samples = Array.from({ length: 16 }, (_, i) => raster[(rect.y + Math.floor(i / 4)) * 200 + rect.x + i % 4]!);
  const frame = statisticsFrame(samples);
  if (frame.print.source.kind !== "native-retained") throw Error("fixture");
  frame.print.source.geometry = { imagingArea: { widthMm: 2, heightMm: 2 }, nativeRaster: { pixelWidth: 200, pixelHeight: 200 }, orientation: "landscape" };
  frame.print.printedImage = { width: 8, height: 8, unit: "inches" }; frame.source.raster = { pixelWidth: 200, pixelHeight: 200 };
  frame.source.contentSha256 = scalarRasterSha256(raster);
  frame.source.representationId = `owned-depth-${c.subjectDistanceM}-f${c.apertureFNumber}`;
  frame.source.evidence = [...frame.source.evidence, { sourceOrigin: "photivra", sourceReference: "Full Float64LE row-major ideal-plane continuation artifact; only selected interior ROI is visible-depth qualified", reuseStatus: "photivra-owned" }];
  frame.source.processing = { id: "public-finite-pupil-visible-plane-provider", version: "0.1.0" };
  frame.region.rect = rect; frame.region.subjectDistanceM = c.subjectDistanceM; frame.region.focusDistanceM = 5;
  frame.region.role = c.subjectDistanceM === 5 ? "selected-subject" : "intentional-defocus";
  const detail = calculatePrintRegionDetail({ ...frame, assessmentId: "depth-reference", target: { id: "owned-metric-visible-plane",
    version: "0.1.0", kind: "coherent-sinusoid", cyclesAcrossRegion: { x: 1, y: 0 }, referenceModulation: .5 } }).value;
  expect(detail.status).toBe("diagnostic-only"); expect(Math.abs(detail.measurement!.fundamentalModulation - c.expectedModulation)).toBeLessThan(1e-12);
  expect(detail.input.region.subjectDistanceM).toBe(c.subjectDistanceM); expect(detail.overallPrintVerdict).toBe("not-offered");
});
