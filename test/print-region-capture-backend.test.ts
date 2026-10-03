// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { createProductionImageFormationPlan, calculatePrintRegionDifference, type SceneRadianceEvaluationResult } from "../src/index.js";
import { tierProductionRequest } from "./helpers/tier-production-fixture.js";
import { evaluator } from "./helpers/environment-raw-fixture.js";
import { printReadoutFrame } from "./helpers/print-readout-backend-fixture.js";

const bytes = readFileSync(new URL("./fixtures/print-detail/capture-backend-reference.json", import.meta.url));
const sha = createHash("sha256").update(bytes).digest("hex");
const reference = JSON.parse(bytes.toString()) as { cases: { radianceScale: number; expectedPhotoElectrons: number; expectedDarkElectrons: number }[] };
it("pins independently predicted source-to-capture SI counts", () => { expect(sha).toBe("fd43590d5ca0359da2d6bd575e9fe7d4b695bc57ba1ac02de80fa33ebf252355"); });
it.each(reference.cases)("executes the owned radiance source at scale $radianceScale through production capture and processing", c => {
  const v = tierProductionRequest("prosumer"), capture = v.environmentCapture.capture;
  let queries = 0;
  capture.sites.forEach(site => {
    const bindings = site.environment.sceneBindings;
    bindings.illuminationTemporalProfile!.waveforms[0]!.samples = bindings.illuminationTemporalProfile!.waveforms[0]!.samples
      .map(sample => ({ ...sample, relativeMagnitudeMultiplier: 1 }));
    const material = bindings.materialResponseProfile.materials[0]!.representation;
    if (material.kind !== "spectral-wavelength-preserving-data") throw Error("owned fixture");
    material.wavelengthRangeNanometers = { minimum: 540, maximum: 560 };
    material.dataArtifact = { id: "owned-print-flat-band-reference-0.1.0", checksumSha256: sha };
  });
  capture.evaluateRadiance = (q): SceneRadianceEvaluationResult => {
    queries++;
    expect(Object.isFrozen(q)).toBe(true);
    expect(q.wavelengthNanometers).toBe(550); expect(q.wavelengthBasis).toBe("vacuum");
    expect(q.target.kind).toBe("environment-direction");
    const result = evaluator(q);
    result.spectralRadianceWattsPerSquareMeterSteradianNanometer = 1e-8 * c.radianceScale;
    result.evidence = [{ sourceOrigin: "photivra", sourceReference: "owned-print-flat-band-reference-0.1.0", reuseStatus: "photivra-owned" }];
    result.limitations = ["Owned constant flat-band radiance source; no real scene, visibility transport or photometric calibration."];
    return result;
  };
  const plan = createProductionImageFormationPlan(v);
  expect(plan.status).toBe("ready"); expect(plan.blockers).toEqual([]); expect(queries).toBe(32);
  const executed = plan.environmentCaptureResult!.value, raw = executed.raw.value;
  expect(executed.providerTransportVerified).toBe(false); expect(raw.upstreamRadiometryVerified).toBe(false);
  executed.sites.forEach((site, i) => {
    expect(site.value.providerCallbackExecuted).toBe(true); expect(site.value.providerEvaluationCount).toBe(8);
    expect(site.value.photo.value.photoSignal.expectedGeneratedElectronCount / c.expectedPhotoElectrons).toBeCloseTo(1, 13);
    expect(raw.sites[i]!.accumulatedCharge.value.darkExpectedElectronCount).toBe(c.expectedDarkElectrons);
  });
  const source = plan.processedOutputResult!.value.source.value;
  expect(source.rawFrame).toEqual(raw.frame); expect(source.linearPlane.samples).toHaveLength(12);
  const before = printReadoutFrame(raw.sites.map(s => s.readout.value.electronEquivalentAfterPreAdcSaturation / c.expectedPhotoElectrons),
    raw, "owned-pre-adc-source", "owned-capture-realization");
  const after = printReadoutFrame(raw.frame.samples.map(s => (s.rawCode - 512) / c.expectedPhotoElectrons),
    raw, "owned-decoded-16bit-source", "owned-capture-realization");
  const difference = calculatePrintRegionDifference({ assessmentId: "actual-production-adc-difference", before, after,
    purpose: "processing-change", realizationPolicy: "same-noise-realization", referenceRange: null }).value;
  expect(difference.status).toBe("diagnostic-only");
  expect(difference.measurement!.maximumAbsoluteDifferenceRelativeLuminance).toBeLessThanOrEqual(.5 / c.expectedPhotoElectrons + 1e-14);
  const previousQueries = queries;
  expect(createProductionImageFormationPlan(v)).toEqual(plan); expect(queries - previousQueries).toBe(32);
  // Physical print enlargement changes geometry, not this immutable capture or
  // acquisition/processing samples. Identical square rasters preserve exact aspect.
  const enlarged = structuredClone({ before, after });
  for (const frame of [enlarged.before, enlarged.after]) frame.print.printedImage = { width: 20, height: 20, unit: "inches" };
  const newSize = calculatePrintRegionDifference({ assessmentId: "physically-enlarged-production-adc-difference", ...enlarged,
    purpose: "processing-change", realizationPolicy: "same-noise-realization", referenceRange: null }).value;
  expect(newSize.measurement).toEqual(difference.measurement); expect(newSize.print.status).toBe("insufficient-native-pixels");
  expect(plan.environmentCaptureResult!.value.raw.value.frame).toEqual(raw.frame);
});
