// SPDX-License-Identifier: Apache-2.0

/**
 * Internal (#443): one channel's expected photo electrons per unit spectral radiance at each spectral node, from one
 * execution of the environment photo-signal chain. Used by the facade's `axisChannelResponse` (display view, ideal
 * reference and the capture's tabulated RAW path).
 */

import { InvalidConfigurationError } from "../core/configuration-error.js";
import type { SceneRadianceEvaluationRequest, SceneRadianceEvaluationResult } from "../schema/scene-radiance.js";
import { executeEnvironmentSensorPhotoSignal, planEnvironmentSensorPhotoSignal } from "../sensor/environment-photo-signal.js";

type PlanInput = Parameters<typeof planEnvironmentSensorPhotoSignal>[0];
interface PerNodeExposure { photo: { value: { exposure: { value: { samples: readonly { integrationMeasureSeconds: number;
  stages: { electronRate: { value: { perWavelength: readonly { wavelengthNanometers: number; expectedGeneratedElectronRatePerSecond: number }[] } } } }[] } } } } }

/**
 * Electrons per unit spectral radiance at each node, sorted by wavelength, for an environment record with one temporal
 * sample. The chain runs once with radiance 1 at every node; each node's value is its own rate term times the time step.
 *
 * Exact: the spatial reduction and the per-node rate are per spectral node, the spectral sum is a compensated sum of
 * per-node terms and the temporal sum is rate × time step. An execution with radiance 1 at one node and 0 elsewhere (the
 * earlier method, one execution per node) therefore adds +0 terms that leave the compensated sum unchanged and returns
 * exactly `rate_n × integrationMeasureSeconds` (test/channel-response.test.ts compares both with Object.is).
 *
 * The environment record must be the engine's own (built by the caller, never shown to supplied code or changed after):
 * it is planned as engine-owned data without a copy. Retention is photo-only, as on the capture path; photo values are
 * identical for either retention.
 */
export function calculateChannelElectronsPerRadiance(environment: Record<string, unknown>,
  evaluateRadiance: (request: Readonly<SceneRadianceEvaluationRequest>) => SceneRadianceEvaluationResult, caller: string): Map<number, number> {
  const plan = planEnvironmentSensorPhotoSignal(environment as unknown as PlanInput, "engine-owned", "photo-only");
  const result = executeEnvironmentSensorPhotoSignal(plan, (request) =>
    ({ ...evaluateRadiance(request), spectralRadianceWattsPerSquareMeterSteradianNanometer: 1 }), undefined, "photo-only");
  const samples = (result.value as unknown as PerNodeExposure).photo.value.exposure.value.samples;
  if (samples.length !== 1) throw new InvalidConfigurationError(caller + ": the channel response expects one temporal sample.");
  const sample = samples[0]!;
  return new Map(sample.stages.electronRate.value.perWavelength
    .map((node): [number, number] => [node.wavelengthNanometers, node.expectedGeneratedElectronRatePerSecond * sample.integrationMeasureSeconds])
    .sort((a, b) => a[0] - b[0]));
}
