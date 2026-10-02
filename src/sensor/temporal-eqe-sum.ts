// SPDX-License-Identifier: Apache-2.0

/**
 * Module boundary and integration notes.
 * Internal shared count accumulation; time measures are seconds, never normalized weights.
 * @see docs/MOTION_AND_SIGNAL.md for equations, coordinate/unit conventions, blockers and support
 * limits.
 */

/** Internal shared count accumulation; time measures are seconds, never normalized weights. */
export function sumTemporalEqeRateExpectations(samples: readonly {
  incidentPhotonRatePerSecond: number;
  expectedGeneratedElectronRatePerSecond: number;
}[], integrationMeasureSeconds: number): { photonCount: number; electronCount: number } {
  let photonCount = 0, electronCount = 0, photonCorrection = 0, electronCorrection = 0;
/**
 * Separate compensated sums preserve small photon/electron contributions beside
 * large terms. Multiply rates by seconds-valued measure, never by normalized time
 * average weight: those weights describe a different mathematical quantity.
 */
  for (const sample of samples) {
    const photons = sample.incidentPhotonRatePerSecond * integrationMeasureSeconds;
    const electrons = sample.expectedGeneratedElectronRatePerSecond * integrationMeasureSeconds;
    const adjustedPhotons = photons - photonCorrection;
    const nextPhotons = photonCount + adjustedPhotons;
    photonCorrection = (nextPhotons - photonCount) - adjustedPhotons;
    photonCount = nextPhotons;
    const adjustedElectrons = electrons - electronCorrection;
    const nextElectrons = electronCount + adjustedElectrons;
    electronCorrection = (nextElectrons - electronCount) - adjustedElectrons;
    electronCount = nextElectrons;
  }
  return { photonCount, electronCount };
}
