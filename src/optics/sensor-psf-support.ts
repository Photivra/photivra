// SPDX-License-Identifier: Apache-2.0

/**
 * Shared inverse support for a PSF (point-spread function). Support offsets use native sensor
 * coordinates, where +Y is down; the PSF kernel itself uses +Y up.
 * @see docs/PHYSICS_FOUNDATION.md for the equations, units, coordinate conventions, known blockers
 * and support limits.
 */

/**
 * Shared inverse support for a PSF (point-spread function), in native sensor coordinates (+Y down).
 * The PSF kernel itself uses +Y up.
 */
export function sensorPsfSourcePoint(destination: { x: number; y: number }, kernel: {
  centerSampleX: number; centerSampleY: number; samplePitchMicrometersX: number; samplePitchMicrometersY: number;
}, kernelSampleX: number, kernelSampleY: number): { x: number; y: number } {
  return { x: destination.x - (kernelSampleX-kernel.centerSampleX)*kernel.samplePitchMicrometersX/1000,
    y: destination.y + (kernelSampleY-kernel.centerSampleY)*kernel.samplePitchMicrometersY/1000 };
}
