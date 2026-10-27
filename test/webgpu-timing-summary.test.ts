// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { formatSpeedRatio, summarizeTimingReport } from "./webgpu/timing-summary.js";

describe("bench:webgpu per-stage summary lines", () => {
  it("prints one line per frame and stage with the CPU ÷ GPU ratio taken from the report", () => {
    // The 24 MP frame of the hardware report recorded on #277 (October 27, 2026), values as posted.
    const lines = summarizeTimingReport({
      softwareAdapter: false,
      runs: [{ width: 6000, height: 4000, megapixels: 24, stages: {
        temporalSum8Nodes: { gpuMilliseconds: 84.2, cpuMilliseconds: 3516 },
        convolutionRadius7: { gpuMilliseconds: 177.3, cpuMilliseconds: 10444.9 },
        sensorStage: { gpuMilliseconds: 348.4, cpuMilliseconds: 3228.5 }
      } }]
    });
    expect(lines).toEqual([
      "24 MP (6000×4000) temporalSum8Nodes: GPU 84.2 ms, CPU 3516.0 ms, CPU ÷ GPU 42×",
      "24 MP (6000×4000) convolutionRadius7: GPU 177.3 ms, CPU 10444.9 ms, CPU ÷ GPU 59×",
      "24 MP (6000×4000) sensorStage: GPU 348.4 ms, CPU 3228.5 ms, CPU ÷ GPU 9.3×"
    ]);
  });

  it("rounds the frame size, says when the CPU was not timed and labels a software adapter", () => {
    const lines = summarizeTimingReport({
      softwareAdapter: true,
      runs: [{ width: 4242, height: 2828, megapixels: 11.996376, stages: { sensorStage: { gpuMilliseconds: 184.4, cpuMilliseconds: null } } }]
    });
    expect(lines).toEqual([
      "12 MP (4242×2828) sensorStage: GPU 184.4 ms, CPU not timed (set PHOTIVRA_WEBGPU_TIMING_CPU=1 for the ratio) [software adapter: not GPU performance]"
    ]);
  });

  it("formats the ratio with two decimals below 1, one below 10 and none above", () => {
    expect(formatSpeedRatio(0.8213)).toBe("0.82×");
    expect(formatSpeedRatio(7.0652)).toBe("7.1×");
    expect(formatSpeedRatio(58.91)).toBe("59×");
    expect(formatSpeedRatio(Number.NaN)).toBe("n/a");
    expect(formatSpeedRatio(Number.POSITIVE_INFINITY)).toBe("n/a");
  });

  it("returns no lines for an empty report", () => {
    expect(summarizeTimingReport({ softwareAdapter: false, runs: [] })).toEqual([]);
  });
});
