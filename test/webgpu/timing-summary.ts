// SPDX-License-Identifier: Apache-2.0
/**
 * One-line summaries of a `bench:webgpu` timing report (`test/webgpu/stage-timings.timing.ts`): for every
 * frame and stage, the GPU and CPU milliseconds the report already holds and their ratio, CPU ÷ GPU, so the
 * hardware record (docs/WEBGPU_DEVICES.md) needs no hand arithmetic. It reads the report and changes no
 * measurement.
 */

/** One stage of one frame of the report: GPU wall-clock milliseconds and, if timed, the float64 CPU reference's. */
export interface StageTimingRecord { gpuMilliseconds: number; cpuMilliseconds: number | null }

/** One frame of the report. */
export interface TimingRunRecord { width: number; height: number; megapixels: number; stages: Record<string, StageTimingRecord> }

/** The parts of the report the summary reads. */
export interface TimingReportSummaryInput { softwareAdapter: boolean; runs: readonly TimingRunRecord[] }

/** CPU ÷ GPU formatted for a record: two decimals below 1, one below 10, none above (`0.82×`, `7.1×`, `59×`). */
export function formatSpeedRatio(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio < 0) return "n/a";
  return `${ratio.toFixed(ratio < 1 ? 2 : ratio < 10 ? 1 : 0)}×`;
}

/** One line per frame and stage, in report order, for example `6 MP (3000×2000) convolutionRadius7: GPU 55.1 ms, CPU 2610.5 ms, CPU ÷ GPU 47×`. */
export function summarizeTimingReport(report: TimingReportSummaryInput): string[] {
  const lines: string[] = [];
  const adapterNote = report.softwareAdapter ? " [software adapter: not GPU performance]" : "";
  for (const run of report.runs) {
    const frame = `${Number(run.megapixels.toFixed(1))} MP (${run.width}×${run.height})`;
    for (const [stage, timing] of Object.entries(run.stages)) {
      const gpu = `GPU ${timing.gpuMilliseconds.toFixed(1)} ms`;
      const cpu = timing.cpuMilliseconds === null
        ? "CPU not timed (set PHOTIVRA_WEBGPU_TIMING_CPU=1 for the ratio)"
        : `CPU ${timing.cpuMilliseconds.toFixed(1)} ms, CPU ÷ GPU ${formatSpeedRatio(timing.cpuMilliseconds / timing.gpuMilliseconds)}`;
      lines.push(`${frame} ${stage}: ${gpu}, ${cpu}${adapterNote}`);
    }
  }
  return lines;
}
