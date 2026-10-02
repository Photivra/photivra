// SPDX-License-Identifier: Apache-2.0

import console from "node:console";
import { URL } from "node:url";

// Node-only file loading is example infrastructure, not part of the engine root.
import { readFileSync } from "node:fs";
import { createProductionImageFormationPlan, createPhotographicExportPair } from "@photivra/engine";
const request = JSON.parse(readFileSync(new URL("./production-request.json", import.meta.url), "utf8"));
const source = request.environmentCapture.capture;
source.evaluateRadiance = (q) => ({
  schemaVersion: "0.1.0", sampleId: q.sampleId, sceneId: q.sceneId,
  providerProfileId: q.providerProfileId, wavelengthNanometers: q.wavelengthNanometers,
  wavelengthBasis: q.wavelengthBasis, quantity: "outgoing-spectral-radiance", unit: "W/m^2/sr/nm",
  spectralRadianceWattsPerSquareMeterSteradianNanometer: 1e-9 * (1 + 200 * q.timeSecondsFromExposureStart),
  scientificStatus: "approximation", uncertainty: { kind: "not-quantified", limitation: "Owned analytic environment only." },
  evidence: source.sceneBinding.evidence, limitations: ["Synthetic time-varying uniform angular field; transport unverified."]
});
const plan = createProductionImageFormationPlan(request);
if (plan.blockers.length !== 0 || !plan.environmentCaptureResult || !plan.processedOutputResult) throw new Error("Production example blocked");
const raw = plan.environmentCaptureResult.value.raw.value.frame;
const pair = await createPhotographicExportPair({
  ...request.environmentCapture.processing,
  reconstruction: { ...request.environmentCapture.processing.reconstruction, rawFrame: raw },
  metadata: { workflow: "human-directed-non-generative", capturedAtUtc: "2026-10-01T19:00:00.123Z",
    raw: { documentId: "00000000-0000-4000-8000-000000000012", instanceId: "00000000-0000-4000-8000-000000000013" },
    jpeg: { documentId: "00000000-0000-4000-8000-000000000014", instanceId: "00000000-0000-4000-8000-000000000015" } },
  sceneProfile: { id: "owned-basic-test", version: "1", sceneStateId: raw.capture.sceneStateId },
  jpegQuantizationStep: 1
});
const replay = createProductionImageFormationPlan(request);
if (JSON.stringify(plan) !== JSON.stringify(replay)) throw new Error("Deterministic plan replay changed");
console.log({ providerEvaluations: plan.environmentCaptureResult.value.providerEvaluationCount,
  rawCodes: raw.samples.map(s => s.rawCode), dngBytes: pair.dng.bytes.length, jpegBytes: pair.jpeg.bytes.length });
