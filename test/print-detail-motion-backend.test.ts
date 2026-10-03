// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { calculateCaptureTranslationParallaxTemporalQuadrature, calculatePrintRegionDetail,
  parseCaptureModeProfile, parseCaptureModeTimingProfile, resolveCaptureMode, resolveCaptureModeTiming } from "../src/index.js";
import { statisticsFrame } from "./helpers/print-region-statistics-fixture.js";

const bytes = readFileSync(new URL("./fixtures/print-detail/motion-backend-reference.json", import.meta.url));
const reference = JSON.parse(bytes.toString()) as { cases: { depthM: number; cameraVelocityMps: number; subjectVelocityMps: number;
  temporalSampleCount: number; expectedModulation: number; continuousExposureModulation: number }[] };
const evidence = (sourceReference: string): { sourceOrigin: "photivra"; sourceReference: string; reuseStatus: "photivra-owned" }[] =>
  [{ sourceOrigin: "photivra", sourceReference, reuseStatus: "photivra-owned" }];
const nativeRaster = { pixelWidth: 8, pixelHeight: 8 }, imagingArea = { widthMm: 8, heightMm: 8 };
const captureMode = resolveCaptureMode({ nativeRaster, modeId: "owned-motion", profile: parseCaptureModeProfile({ schemaVersion: "0.1.0",
  modes: [{ modeId: "owned-motion", evidence: evidence("owned continuous plane"), acquisition: { kind: "single-frame" },
    perFrameSampling: { kind: "native-effective-raster" }, processedImageRaster: { value: nativeRaster, evidence: evidence("native plane raster") },
    dependencies: ["mode-specific-readout-timing"] }] }) });
const points = Array.from({ length: 64 }, (_, i) => ({ x: .5 + i % 8, y: .5 + Math.floor(i / 8) }));
const timing = resolveCaptureModeTiming({ captureMode, samplePointsNative: points,
  nominalExposureDurationSeconds: { value: .02, unit: "s", evidence: evidence("owned 20ms exposure") },
  timingProfile: parseCaptureModeTimingProfile({ schemaVersion: "0.1.0", profileId: "owned-global", profileVersion: "0.1.0",
    captureModeId: "owned-motion", scientificStatus: "approximation", scheduleFamily: "global-or-uniform-linear-native-scan",
    shutterMechanism: "electronic", opening: { kind: "simultaneous" }, closing: { kind: "simultaneous" },
    readout: { readoutMode: "global", captureReadoutDurationSeconds: { value: .02, unit: "s", evidence: evidence("separate readout") } },
    nonUniformScheduleModeled: false, evidence: evidence("owned global timing"), limitations: ["No changing visibility or depth."] }) });

it("binds the independent motion reference", () => {
  expect(createHash("sha256").update(bytes).digest("hex")).toBe("f26ea45676d3123be1bae6a8b288151c25c0db199c453a8f97c9ded9578b3b51");
});
it.each(reference.cases)("integrates camera $cameraVelocityMps and subject $subjectVelocityMps at depth $depthM with $temporalSampleCount nodes", c => {
  const motion = calculateCaptureTranslationParallaxTemporalQuadrature({ timing, imagingArea, focalLengthMm: 50, focusDistanceM: 5,
    orientation: "landscape", cameraTranslationVelocityMps: { x: c.cameraVelocityMps, y: 0, z: 0 }, temporalSampleCount: c.temporalSampleCount,
    sceneSamples: points.map((destinationPointNative, i) => ({ sampleId: "plane-site-" + i, destinationPointNative,
      positionCameraM: { x: 0, y: 0, z: c.depthM }, subjectVelocityMps: { x: c.subjectVelocityMps, y: 0, z: 0 } })) }).value;
  // Public motion geometry drives actual exposure accumulation of a bounded
  // continuous periodic provider. The provider never substitutes endpoint blur.
  const samples = motion.samples.map((site, i) => site.nodes.reduce((sum, node) => sum + node.normalizedTimeWeight *
    (1 + .5 * Math.cos(2 * Math.PI * .25 * (i % 8 + .5 - 4 - node.deltaFromReferenceImagePlaneMm.x) + .37)), 0));
  const frame = statisticsFrame(samples);
  if (frame.print.source.kind !== "native-retained") throw Error("fixture");
  frame.print.source.geometry = { imagingArea, nativeRaster, orientation: "landscape" };
  frame.print.printedImage = { width: 8, height: 8, unit: "inches" };
  frame.source.raster = nativeRaster; frame.source.processing = { id: "public-translation-temporal-plane-provider", version: "0.1.0" };
  frame.region.rect = { x: 0, y: 0, width: 8, height: 8 };
  const result = calculatePrintRegionDetail({ ...frame, assessmentId: "motion-reference", target: { id: "owned-visible-plane-grating",
    version: "0.1.0", kind: "coherent-sinusoid", cyclesAcrossRegion: { x: 2, y: 0 }, referenceModulation: .5 } }).value;
  expect(result.status).toBe("diagnostic-only");
  expect(Math.abs(result.measurement!.meanRelativeLuminance - 1)).toBeLessThan(1e-12);
  expect(Math.abs(result.measurement!.fundamentalModulation - c.expectedModulation)).toBeLessThan(1e-12);
  expect(motion.visibilityOcclusionModeled).toBe(false); expect(motion.oneGlobalHomographyAuthorized).toBe(false);
  if (c.temporalSampleCount === 32) expect(Math.abs(result.measurement!.fundamentalModulation - c.continuousExposureModulation)).toBeLessThan(.0001);
  const group = reference.cases.filter(q => q.depthM === c.depthM && q.cameraVelocityMps === c.cameraVelocityMps && q.subjectVelocityMps === c.subjectVelocityMps);
  const errors = group.map(q => Math.abs(q.expectedModulation - q.continuousExposureModulation));
  for (let i = 1; i < errors.length; i++) expect(errors[i]).toBeLessThanOrEqual(errors[i - 1]!);
});
