// SPDX-License-Identifier: Apache-2.0

import { createSensorRawFrame, type RawFrameReconstructionInput, type SensorRawReconstructionKernelContribution } from "../../src/index.js";
import { loadSensorRawFrameInput } from "./sensor-raw-frame-fixture.js";

export function loadRawFrameReconstructionInput(): RawFrameReconstructionInput {
  const rawFrame = createSensorRawFrame(loadSensorRawFrameInput());
  const phaseProfiles = [0, 1, 2, 3].map((i) => {
    const phaseX = i%2, phaseY = Math.floor(i/2);
    const c = (x: number, y: number, sourceChannelId: string, weight: number): SensorRawReconstructionKernelContribution =>
      ({ offsetX: x-phaseX, offsetY: y-phaseY, sourceChannelId, weight });
    return { phaseX, phaseY, profile: { schemaVersion: "0.1.0", profileId: "phase-"+i, profileVersion: "1",
      captureModeId: "native", colorSamplingProfileId: "cfa", scientificStatus: "approximation",
      method: "explicit-linear-native-neighborhood", normalization: "weights-sum-to-one-per-output-channel",
      negativeBlackSubtractedValuesAllowed: true,
      kernels: [
        { outputChannelId: "red", contributions: [c(0, 0, "red", 1)] },
        { outputChannelId: "green", contributions: [c(1, 0, "green", .5), c(0, 1, "green", .5)] },
        { outputChannelId: "blue", contributions: [c(1, 1, "blue", 1)] }
      ], evidence: rawFrame.colorSamplingProfile.evidence, limitations: ["Synthetic tile-average regression policy, not calibrated demosaic."] } as const };
  });
  return { rawFrame, phaseProfiles, region: { x: 0, y: 0, width: 2, height: 2 } };
}
