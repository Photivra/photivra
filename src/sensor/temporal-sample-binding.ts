// SPDX-License-Identifier: Apache-2.0

import { InvalidScientificInputError } from "../core/validation.js";

/** Internal temporal identity/aggregate-work preflight shared by optical and irradiance inputs. */
export function bindSensorTemporalSamples<T extends {
  temporalSampleIndex: number;
  timeSecondsFromOpeningReference: number;
}>(samples: readonly T[], nodes: (sample: T) => readonly unknown[]): readonly T[] {
  const count = samples?.length;
  if (!Array.isArray(samples) || !Number.isSafeInteger(count) || count < 1 || count > 256) {
    throw new InvalidScientificInputError("Temporal quadrature requires 1 through 256 samples.");
  }
  const byIndex = new Map<number, T>();
  let nodeCount = 0;
  for (const sample of samples) {
    if (sample === undefined || sample === null || !Number.isSafeInteger(sample.temporalSampleIndex) ||
      sample.temporalSampleIndex < 0 || sample.temporalSampleIndex >= count ||
      byIndex.has(sample.temporalSampleIndex) || !Number.isFinite(sample.timeSecondsFromOpeningReference) ||
      !Array.isArray(nodes(sample))) {
      throw new InvalidScientificInputError("Temporal samples require unique in-range indices, finite times and irradiance arrays.");
    }
    nodeCount += nodes(sample).length;
    if (nodeCount > 100000) {
      throw new InvalidScientificInputError("Temporal Cartesian irradiance coverage exceeds the 100000-node budget.");
    }
    byIndex.set(sample.temporalSampleIndex, sample);
  }
  return Array.from({ length: count }, (_, index) => byIndex.get(index)!);
}
