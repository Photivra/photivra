// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { createSimulatedCapture, simulateEnvironmentSensorRawFrame, calculatePrintRegionDetail,
  calculatePrintRegionDifference, type SceneRadianceEvaluationResult } from "../src/index.js";
import { tierProductionRequest } from "./helpers/tier-production-fixture.js";
import { evaluator } from "./helpers/environment-raw-fixture.js";
import { statisticsFrame } from "./helpers/print-region-statistics-fixture.js";
const bytes = readFileSync(new URL("./fixtures/print-detail/native-detail-reference.json", import.meta.url));
const hash = createHash("sha256").update(bytes).digest("hex");
const reference = JSON.parse(bytes.toString()) as { cases: { axis: "x" | "y"; phaseRadians: number;
  spatialSampleCount: number; scales: number[]; expectedModulation: number; continuousModulation: number; maximumContinuousModulationError: number }[] };
const base = JSON.parse(readFileSync(new URL("./fixtures/print-detail/capture-backend-reference.json", import.meta.url), "utf8")) as { cases: { radianceScale: number; expectedPhotoElectrons: number }[] };
it("pins the independent patterned and uniform source references", () => {
  expect(hash).toBe("112d188997ee421b5a3b969522263a07ed427e0f16f75e394feeae4ba20c6117");
  expect(createHash("sha256").update(readFileSync(new URL("./fixtures/print-detail/capture-backend-reference.json", import.meta.url))).digest("hex"))
    .toBe("fd43590d5ca0359da2d6bd575e9fe7d4b695bc57ba1ac02de80fa33ebf252355");
});
const photo = base.cases.find(c => c.radianceScale === 1)!.expectedPhotoElectrons;
/** Rebind owned test profile coordinates. This creates no optical/charge equation. */
function rebind(value: unknown, x?: number, y?: number): void {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) { value.forEach(v => rebind(v, x, y)); return; }
  const r = value as Record<string, unknown>;
  for (const [key, v] of Object.entries(r)) {
    if (key === "nativeRaster") r[key] = { pixelWidth: 4, pixelHeight: 4 };
    else if (key === "site" && x !== undefined && y !== undefined) r[key] = { x, y };
    else rebind(v, x, y);
  }
}
it.each(reference.cases)("qualifies native capture detail along $axis at phase $phaseRadians and $spatialSampleCount aperture nodes", c => {
  const capture = tierProductionRequest("prosumer").environmentCapture.capture;
  capture.frame = structuredClone(capture.frame);
  rebind(capture.frame);
  const old = capture.frame.capture;
  const { schemaVersion: _s, engineApiVersion: _e, resolvedGeometry: _g, equivalentFocalLength35Mm: _f, ...input } = old;
  void _s; void _e; void _g; void _f;
  capture.frame.capture = createSimulatedCapture({ ...input, captureId: `owned-native-grating-${c.axis}-${c.phaseRadians}-${c.spatialSampleCount}`,
    geometry: { ...input.geometry, nativeRaster: { pixelWidth: 4, pixelHeight: 4 }, outputRaster: { pixelWidth: 4, pixelHeight: 4 } },
    planes: input.planes.map(p => ({ ...p, pixelWidth: 4, pixelHeight: 4, storage: { kind: "inline-float64", samples: Array<number>(48).fill(0) } })) }).value;
  capture.frame.captureModeProfile.modes[0]!.processedImageRaster.value = { pixelWidth: 4, pixelHeight: 4 };
  const prototypes = capture.sites;
  capture.sites = Array.from({ length: 16 }, (_, i): (typeof prototypes)[number] => {
    const x = i % 4, y = Math.floor(i / 4), site = structuredClone(prototypes[(y % 2) * 2 + x % 2]!);
    rebind(site, x, y);
    site.environment.temporalIntegrationId = `native-grating-site-${i}`;
    const spatial = site.environment.sensor.spatialSampling;
    spatial.spatialSampleCountX = c.spatialSampleCount; spatial.spatialSampleCountY = c.spatialSampleCount;
    const lattice = spatial.samplingApertureProfile.siteCenterLattice;
    lattice.pitchXMicrometers = 9000; lattice.pitchYMicrometers = 6000;
    lattice.firstSiteCenterFromImagingAreaTopLeftMicrometers = { x: 4500, y: 3000 };
    const bindings = site.environment.sceneBindings;
    bindings.illuminationTemporalProfile!.waveforms[0]!.samples = bindings.illuminationTemporalProfile!.waveforms[0]!.samples.map(s => ({ ...s, relativeMagnitudeMultiplier: 1 }));
    const material = bindings.materialResponseProfile.materials[0]!.representation;
    if (material.kind !== "spectral-wavelength-preserving-data") throw Error("Owned source required");
    material.wavelengthRangeNanometers = { minimum: 540, maximum: 560 };
    material.dataArtifact = { id: "owned-angular-grating-v0.1.0", checksumSha256: hash };
    return site;
  });
  let calls = 0;
  capture.evaluateRadiance = (q): SceneRadianceEvaluationResult => {
    calls++;
    if (!Object.isFrozen(q) || q.target.kind !== "environment-direction" || q.wavelengthNanometers !== 550) throw Error("Unexpected provider query");
    const d = q.target.outgoingDirectionUnitVector;
    // Declared angular pattern frequency: one cycle across 36/24 mm at the
    // stipulated 50.505... mm image distance. This defines the source; the
    // engine owns the projection from native aperture sites to look rays.
    const angularPeriod = (c.axis === "x" ? 36 : 24) * .0198;
    const result: SceneRadianceEvaluationResult = evaluator(q);
    result.spectralRadianceWattsPerSquareMeterSteradianNanometer = 1e-8 * (1 + .5 * Math.cos(2 * Math.PI * d[c.axis] / d.z / angularPeriod + c.phaseRadians));
    result.evidence = [{ sourceOrigin: "photivra", sourceReference: "owned-angular-grating-v0.1.0", reuseStatus: "photivra-owned" }];
    result.limitations = ["Owned angular grating with point optics; no private renderer, natural-image visibility or device calibration."];
    return result;
  };
  const executed = simulateEnvironmentSensorRawFrame(capture).value;
  expect(calls).toBe(32 * c.spatialSampleCount ** 2);
  const samples = executed.sites.map(s => s.value.photo.value.photoSignal.expectedGeneratedElectronCount / photo);
  samples.forEach((v, i) => expect(Math.abs(v - c.scales[i]!)).toBeLessThan(1e-12));
  const frame = statisticsFrame(samples, executed.raw.value.frame.capture.captureId, "owned-native-photo-expectation");
  if (frame.print.source.kind !== "native-retained") throw Error("Native source required");
  frame.print.source.geometry = executed.raw.value.frame.capture.geometry;
  frame.print.printedImage = { width: 4, height: 4, unit: "inches" };
  frame.source.raster = { pixelWidth: 4, pixelHeight: 4 }; frame.region.rect = { x: 0, y: 0, width: 4, height: 4 };
  frame.region.role = "field-diagnostic";
  const detailInput = { ...frame, assessmentId: "owned-native-photo-detail", target: { id: "owned-angular-grating", version: "0.1.0",
    kind: "coherent-sinusoid" as const, cyclesAcrossRegion: { x: c.axis === "x" ? 1 : 0, y: c.axis === "y" ? 1 : 0 }, referenceModulation: .5 } };
  const detail = calculatePrintRegionDetail(detailInput).value;
  expect(detail.status).toBe("diagnostic-only");
  expect(Math.abs(detail.measurement!.fundamentalModulation - c.expectedModulation)).toBeLessThan(1e-12);
  expect(Math.abs(detail.measurement!.fundamentalModulation - c.continuousModulation)).toBeLessThanOrEqual(c.maximumContinuousModulationError + 1e-12);
  executed.raw.value.sites.forEach(s => {
    expect(s.readout.value.physicalScalarSaturationApplied).toBe(false);
    expect(s.readout.value.preAdcSaturationApplied).toBe(false);
    expect(s.readout.value.digitalSaturationApplied).toBe(false);
  });
  const afterSamples = executed.raw.value.frame.samples.map((s, i) => (s.rawCode - s.blackLevelCode) * executed.raw.value.sites[i]!.readout.value.systemConversionGainElectronsPerCode / photo);
  const beforeSamples = executed.raw.value.sites.map(s => s.readout.value.electronEquivalentAfterPreAdcSaturation / photo);
  const before = { ...frame, ...statisticsFrame(beforeSamples, frame.source.captureId, "owned-grating-before-adc", "owned-grating-noise") };
  const after = { ...frame, ...statisticsFrame(afterSamples, frame.source.captureId, "owned-grating-after-adc", "owned-grating-noise") };
  for (const f of [before, after]) { f.print = frame.print; f.region = frame.region; f.source.raster = frame.source.raster; }
  const difference = calculatePrintRegionDifference({ assessmentId: "owned-native-grating-readout", before, after,
    purpose: "processing-change", realizationPolicy: "same-noise-realization", referenceRange: null }).value;
  expect(difference.status).toBe("diagnostic-only");
  const halfCodeBound = Math.max(...executed.raw.value.sites.map(s => s.readout.value.systemConversionGainElectronsPerCode / (2 * photo)));
  expect(difference.measurement!.maximumAbsoluteDifferenceRelativeLuminance).toBeLessThanOrEqual(halfCodeBound + 1e-14);
  // Assess the actual noisy, quantized representation separately from its
  // optical/EQE expectation. Never promote expected transfer to captured MTF.
  const actualDetail = calculatePrintRegionDetail({ ...detailInput, source: after.source, samples: after.samples, assessmentId: "owned-native-readout-detail" }).value;
  expect(actualDetail.status).toBe("diagnostic-only");
  expect(actualDetail.input.source.contentSha256).toBe(after.source.contentSha256);
  expect(actualDetail.unassessed).toEqual(expect.arrayContaining(["captured-system-mtf", "perceived-quality", "noise"]));
  const larger = structuredClone(detailInput); larger.assessmentId = "owned-grating-physical-enlargement";
  larger.print.printedImage = { width: 40, height: 40, unit: "inches" };
  expect(calculatePrintRegionDetail(larger).value.measurement).toEqual(detail.measurement);
  expect(executed.providerTransportVerified).toBe(false); expect(executed.raw.value.upstreamRadiometryVerified).toBe(false);
  expect(detail.overallPrintVerdict).toBe("not-offered");
});
