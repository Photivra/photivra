// SPDX-License-Identifier: Apache-2.0

/** Internal shared count accumulation; time measures are seconds, never normalized weights. */
export function sumTemporalEqeRateExpectations(samples: readonly {
  incidentPhotonRatePerSecond: number;
  expectedGeneratedElectronRatePerSecond: number;
}[], integrationMeasureSeconds: number): { photonCount: number; electronCount: number } {
  let photonCount = 0, electronCount = 0, photonCorrection = 0, electronCorrection = 0;
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
