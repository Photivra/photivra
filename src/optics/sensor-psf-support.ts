// SPDX-License-Identifier: Apache-2.0

/**
 * Module boundary and integration notes.
 * Shared inverse PSF support in native +Y-down coordinates; kernel +Y is up.
 * @see docs/PHYSICS_FOUNDATION.md for equations, coordinate/unit conventions, blockers and support
 * limits.
 */

/** Shared inverse PSF support in native +Y-down coordinates; kernel +Y is up. */
export function sensorPsfSourcePoint(destination: { x: number; y: number }, kernel: {
  centerSampleX: number; centerSampleY: number; samplePitchMicrometersX: number; samplePitchMicrometersY: number;
}, kernelSampleX: number, kernelSampleY: number): { x: number; y: number } {
  return { x: destination.x - (kernelSampleX-kernel.centerSampleX)*kernel.samplePitchMicrometersX/1000,
    y: destination.y + (kernelSampleY-kernel.centerSampleY)*kernel.samplePitchMicrometersY/1000 };
}
