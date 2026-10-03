// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { createProductionImageFormationPlan, createProductionCaptureSnapshot, createSimulatedCapture,
  type SceneRadianceEvaluationResult } from "../src/index.js";
import { tierProductionRequest } from "./helpers/tier-production-fixture.js";
import { evaluator } from "./helpers/environment-raw-fixture.js";

const bytes = readFileSync(new URL("./fixtures/print-detail/visibility-backend-reference.json", import.meta.url));
const sha = createHash("sha256").update(bytes).digest("hex");
const reference = JSON.parse(bytes.toString()) as { cases: {
  motionAxis: "x" | "y"; temporalSampleCount: number; maximumAbsoluteRadianceScaleError: number;
  sites: { siteIndex: number; finiteRadianceScale: number; continuousRadianceScale: number; foregroundCountsByAxis: number[] }[];
}[] };
const sourceBytes = readFileSync(new URL("./fixtures/print-detail/capture-backend-reference.json", import.meta.url));
const sourceReference = JSON.parse(sourceBytes.toString()) as { cases: { radianceScale: number; expectedPhotoElectrons: number }[] };
const referencePhoto = sourceReference.cases.find(c => c.radianceScale === 1)!.expectedPhotoElectrons;
it("pins independently predicted moving visibility and source radiometry", () => {
  expect(sha).toBe("228c2a50c4661612c93c2c316ebdd26eacd0c3cc8eb234f0dd9110748b753cb8");
  expect(createHash("sha256").update(sourceBytes).digest("hex")).toBe("fd43590d5ca0359da2d6bd575e9fe7d4b695bc57ba1ac02de80fa33ebf252355");
});
it.each(reference.cases)("executes actual production capture with a foreground moving along $motionAxis at $temporalSampleCount time nodes", c => {
  const v = tierProductionRequest("prosumer", "prosumer", 100, c.temporalSampleCount);
  const capture = v.environmentCapture.capture;
  const old = capture.frame.capture;
  const { schemaVersion: _s, engineApiVersion: _e, resolvedGeometry: _g, equivalentFocalLength35Mm: _f, ...input } = old;
  void _s; void _e; void _g; void _f;
  capture.frame.capture = createSimulatedCapture({ ...input,
    captureId: `owned-visible-${c.motionAxis}-capture-${c.temporalSampleCount}`, sceneStateId: "owned-visible-planes-v0.1.0" }).value;
  capture.sceneBinding.sceneStateId = capture.frame.capture.sceneStateId;
  const { version: _v, fingerprint: _h, ...snapshot } = v.captureSnapshot;
  void _v; void _h;
  v.captureSnapshot = createProductionCaptureSnapshot({ ...snapshot, captureId: capture.frame.capture.captureId,
    sceneStateId: capture.frame.capture.sceneStateId });
  capture.sites.forEach(site => {
    const bindings = site.environment.sceneBindings;
    bindings.illuminationTemporalProfile!.waveforms[0]!.samples = bindings.illuminationTemporalProfile!.waveforms[0]!.samples
      .map(sample => ({ ...sample, relativeMagnitudeMultiplier: 1 }));
    const material = bindings.materialResponseProfile.materials[0]!.representation;
    if (material.kind !== "spectral-wavelength-preserving-data") throw Error("owned source");
    material.wavelengthRangeNanometers = { minimum: 540, maximum: 560 };
    material.dataArtifact = { id: "owned-moving-visible-planes-0.1.0", checksumSha256: sha };
    expect(site.environment.psf.kind).toBe("not-applied");
  });
  let queries = 0;
  const foreground = Array.from({ length: 4 }, () => [0, 0]);
  capture.evaluateRadiance = (q): SceneRadianceEvaluationResult => {
    queries++;
    // Validate every provider query without thousands of assertion-library
    // invocations inside the scientific accumulation loop.
    if (!Object.isFrozen(q) || q.target.kind !== "environment-direction" || q.wavelengthNanometers !== 550) {
      throw Error("Unexpected owned ray query or mutability");
    }
    const d = q.target.outgoingDirectionUnitVector;
    if (!(d.z < 0)) throw Error("Owned outgoing ray must point toward camera");
    // Provider ray intersection, not a second camera projection. Engine-owned
    // outgoing direction supplies the exact look-ray slope toward two planes.
    const nearX = 2 * d.x / d.z, column = nearX < 0 ? 0 : 1;
    const row = d.y / d.z > 0 ? 0 : 1;
    const nearY = 2 * d.y / d.z;
    const coordinate = c.motionAxis === "x" ? nearX : nearY;
    const apertureIndex = c.motionAxis === "x" ? (nearX < (column === 0 ? -.3564 : .3564) ? 0 : 1) :
      (nearY > (row === 0 ? .2376 : -.2376) ? 0 : 1);
    const nearVisible = coordinate <= -.5 + 125 * q.timeSecondsFromExposureStart;
    if (nearVisible) foreground[row * 2 + column]![apertureIndex]!++;
    const result = evaluator(q);
    result.spectralRadianceWattsPerSquareMeterSteradianNanometer = 1e-8 * (nearVisible ? .5 : 1.5);
    result.evidence = [{ sourceOrigin: "photivra", sourceReference: "owned-moving-visible-planes-0.1.0", reuseStatus: "photivra-owned" }];
    result.limitations = ["Owned moving half-plane source; no PSF/defocus, corrections, camera translation, private renderer or device calibration."];
    return result;
  };
  const plan = createProductionImageFormationPlan(v);
  expect(plan.status).toBe("ready"); expect(plan.blockers).toEqual([]);
  expect(queries).toBe(16 * c.temporalSampleCount);
  const executed = plan.environmentCaptureResult!.value;
  expect(executed.providerTransportVerified).toBe(false);
  expect(executed.raw.value.upstreamRadiometryVerified).toBe(false);
  executed.sites.forEach((site, i) => {
    expect(site.value.sceneVisibilityCalculated).toBe(false);
    expect(site.value.psfRedistributionApplied).toBe(false);
    expect(site.value.instants).toHaveLength(c.temporalSampleCount);
    expect(site.value.photo.value.photoSignal.timeVaryingSignalIntegrated).toBe(true);
    // Two equal orthogonal aperture nodes for every moving-axis/time node. These independent
    // exact occupancy counts validate which metric surface actually supplied L.
    expect(foreground[i]).toEqual(c.sites[i]!.foregroundCountsByAxis.map(n => 2 * n));
    const scale = site.value.photo.value.photoSignal.expectedGeneratedElectronCount / referencePhoto;
    expect(Math.abs(scale - c.sites[i]!.finiteRadianceScale)).toBeLessThan(1e-12);
    expect(Math.abs(scale - c.sites[i]!.continuousRadianceScale)).toBeLessThanOrEqual(c.maximumAbsoluteRadianceScaleError + 1e-12);
  });
  expect(plan.processedOutputResult!.value.source.value.rawFrame).toEqual(executed.raw.value.frame);
  const beforeReplay = queries;
  const replay = createProductionImageFormationPlan(v);
  // Compare every serializable scientific result and identity. A byte digest
  // avoids recursive assertion-library traversal of thousands of ray records;
  // schema-validated result values are finite and contain no provider functions.
  const digest = (value: typeof plan): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  expect(digest(replay)).toBe(digest(plan));
  expect(queries - beforeReplay).toBe(16 * c.temporalSampleCount);
});
