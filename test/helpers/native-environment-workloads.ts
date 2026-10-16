// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { createNativeEnvironmentRawTask, createNativeRawDevelopmentTask, type NativeEnvironmentRawInput,
  type NativeEnvironmentRawProvider, type NativeEnvironmentRawTile, type SceneRadianceEvaluationResult } from "../../src/index.js";
import { frameInput, evaluator } from "./environment-raw-fixture.js";
import { evidence } from "./eqe-response-fixture.js";
import { loadPhotographicExportInput } from "./photographic-export-fixture.js";

/** Representative native environment RAW workloads covering PSF+radial field, flat emitter, pupil rays and temporal samples. */
export type NativeEnvironmentWorkload = "psf-radial-field" | "flat-emitter" | "pupil-rays" | "temporal-samples";
export const nativeEnvironmentWorkloads: readonly NativeEnvironmentWorkload[] = ["psf-radial-field", "flat-emitter", "pupil-rays", "temporal-samples"];

/** Spatially varying synthetic radiance so PSF taps, field points, pupil rays and instants all contribute distinct values. */
function patterned(request: Parameters<typeof evaluator>[0], scale: number): SceneRadianceEvaluationResult {
  const target = request.target.kind === "environment-direction" ? request.target.outgoingDirectionUnitVector : { x: 0, y: 0, z: 1 };
  return evaluator(request, scale*(1+.5*Math.sin(37*target.x)*Math.cos(23*target.y)));
}

export function nativeEnvironmentWorkload(kind: NativeEnvironmentWorkload): { input: NativeEnvironmentRawInput; provider: NativeEnvironmentRawProvider } {
  const v = frameInput(kind === "temporal-samples", kind === "psf-radial-field"), c = v.frame.capture;
  const { schemaVersion, engineApiVersion, resolvedGeometry, equivalentFocalLength35Mm, planes, ...exposure } = c;
  void schemaVersion; void engineApiVersion; void resolvedGeometry; void equivalentFocalLength35Mm; void planes;
  const { capture, containerBitDepth, ...frame } = v.frame; void capture; void containerBitDepth;
  for (const site of v.sites) {
    const e = site.environment;
    if (kind === "psf-radial-field") e.fieldThroughput = { kind: "radial-illumination-vignetting", profile: { normalizationRadiusMm: 25,
      maximumNormalizedRadius: 1, coefficients: { r2: -.25, r4: .05, r6: 0 } }, evidence: evidence("test:workload-radial-field"),
      limitation: "Constructed radial profile; no named-lens calibration or pupil attenuation." };
    if (kind === "pupil-rays") e.pupil = { kind: "ideal-uniform-circular-pupil", radialSampleCount: 2, angularSampleCount: 4,
      evidence: evidence("test:workload-pupil"), limitation: "Constructed ideal pupil; no convergence or calibration claim." };
    if (kind === "temporal-samples") e.temporalSampleCount = 8;
  }
  const scale = kind === "flat-emitter" ? 1e-9 : 2e-9;
  const evaluate = kind === "flat-emitter" ? (q: Parameters<typeof evaluator>[0]): SceneRadianceEvaluationResult => evaluator(q, scale)
    : (q: Parameters<typeof evaluator>[0]): SceneRadianceEvaluationResult => patterned(q, scale);
  const input: NativeEnvironmentRawInput = { raw: { ...frame, exposure, exposureWindow: v.exposureWindow, maximumOutputBytes: 28 },
    sceneBinding: v.sceneBinding, maximumProviderEvaluations: 1_000_000 };
  const provider: NativeEnvironmentRawProvider = {
    readTile: async (r): Promise<NativeEnvironmentRawTile> => ({ ...r, sites: Array.from({ length: r.width }, (_, j) => {
      const index = r.y*2+r.x+j, site = structuredClone(v.sites[index]!);
      site.environment.temporalIntegrationId = v.frame.frameId+":native:"+index; return site;
    }) }),
    evaluateRadiance: evaluate,
    ...(kind === "pupil-rays" ? { evaluateApertureRadiance: (q: Parameters<typeof evaluator>[0]): SceneRadianceEvaluationResult =>
      patterned(q, scale) } : {}),
    yieldControl: async (): Promise<void> => {}
  };
  return { input, provider };
}

const sha256 = (bytes: ArrayBufferView): string => createHash("sha256").update(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)).digest("hex");

/**
 * Runs a workload through native environment acquisition and native development. Returns SHA-256 of the
 * exact float64 photo expectations (incident photons, generated electrons per site), the packed RAW codes
 * and the developed integer samples.
 */
export async function runNativeEnvironmentWorkload(kind: NativeEnvironmentWorkload, options: {
  /** Rewrites each supplied tile before the engine reads it, e.g. to share or reorder shared-state objects. */
  mutateTile?: (tile: NativeEnvironmentRawTile) => void;
  tileWidth?: number;
} = {}): Promise<{ photoSha256: string; rawSha256: string;
  developedSha256: string; providerEvaluationCount: number }> {
  const { input: base, provider } = nativeEnvironmentWorkload(kind), mutate = options.mutateTile;
  const input = options.tileWidth === undefined ? base : { ...base, raw: { ...base.raw, tileWidth: options.tileWidth } };
  const readTile = mutate === undefined ? provider.readTile : async (r: Parameters<NativeEnvironmentRawProvider["readTile"]>[0],
    signal: AbortSignal): Promise<NativeEnvironmentRawTile> => { const tile = await provider.readTile(r, signal); mutate(tile); return tile; };
  const photo: number[] = [];
  const task = createNativeEnvironmentRawTask(input, { ...provider, readTile, observePhotoTile: (tile): void => {
    for (const site of tile.sites) photo.push(site.nativeIndex, site.expectedIncidentPhotonCount, site.expectedGeneratedElectronCount);
  } });
  await task.run();
  const output = task.takeOutput(); task.dispose();
  const policy = loadPhotographicExportInput();
  const development = createNativeRawDevelopmentTask({ raw: output.raw, phaseProfiles: policy.reconstruction.phaseProfiles,
    colorProfile: policy.colorProfile, whiteBalance: policy.whiteBalance, rendering: policy.rendering,
    maximumRetainedPayloadBytes: output.raw.codes.length*10 }, async (): Promise<void> => {});
  await development.run();
  const developed = development.takeOutput(); development.dispose();
  // Development took ownership of the RAW arrays; the developed output returns the same RAW.
  return { photoSha256: sha256(Float64Array.from(photo)), rawSha256: sha256(developed.raw.codes),
    developedSha256: sha256(developed.integerSamples), providerEvaluationCount: output.providerEvaluationCount };
}
