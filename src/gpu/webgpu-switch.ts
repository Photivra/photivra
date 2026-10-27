// SPDX-License-Identifier: Apache-2.0

/**
 * One switch for every GPU path in the engine (#474). The GPU is opt-in per call: nothing runs on WebGPU
 * unless a caller asks for the `webgpu-f32` backend. This switch is the veto a developer flips to keep the
 * whole engine on the float64 CPU reference regardless of what callers ask, for example while debugging,
 * measuring or reproducing a result.
 *
 * - `true` (the default) lets a request for `webgpu-f32` go ahead.
 * - `false` makes every such request behave as if WebGPU were unavailable: with `fallback: "cpu-reference"`
 *   the reference runs and the result's label says `fallbackReason: "webgpu-disabled"`; with `fallback: "fail"`
 *   the request throws an `ImageKernelExecutionError` with that reason.
 *
 * The switch is per JavaScript realm: a Web Worker has its own, and a page's setting does not reach its
 * workers. Flipping it never changes a result that has already been computed; accelerators created while the
 * switch was on keep their device until they are disposed.
 */
import { InvalidConfigurationError } from "../core/configuration-error.js";

let webGpuEnabled = true;

/** Whether this realm may use WebGPU when a caller asks for it. */
export function getWebGpuEnabled(): boolean {
  return webGpuEnabled;
}

/** Turns WebGPU on (`true`, the default) or off (`false`) for this realm. Anything but a boolean is refused. */
export function setWebGpuEnabled(enabled: boolean): void {
  if (typeof enabled !== "boolean") throw new InvalidConfigurationError("setWebGpuEnabled expects a boolean.");
  webGpuEnabled = enabled;
}
