// SPDX-License-Identifier: Apache-2.0

/**
 * Internal: sums rate × time step over time samples to get expected photon and electron counts.
 * @see docs/MOTION_AND_SIGNAL.md for equations, coordinate/unit conventions, blockers and support
 * limits.
 */

/** Internal: sums expected counts over time samples. Time steps are in seconds, never normalized weights. */
export function sumTemporalEqeRateExpectations(samples: readonly {
  incidentPhotonRatePerSecond: number;
  expectedGeneratedElectronRatePerSecond: number;
}[], integrationMeasureSeconds: number): { photonCount: number; electronCount: number } {
  let photonCount = 0, electronCount = 0, photonCorrection = 0, electronCorrection = 0;
/**
 * Separate compensated sums keep small photon and electron contributions from being
 * lost next to large ones. Multiply rates by the time step in seconds, never by a
 * normalized time-average weight, which is a different quantity.
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
