// SPDX-License-Identifier: Apache-2.0

/** Shared inverse PSF support in native +Y-down coordinates; kernel +Y is up. */
export function sensorPsfSourcePoint(destination: { x: number; y: number }, kernel: {
  centerSampleX: number; centerSampleY: number; samplePitchMicrometersX: number; samplePitchMicrometersY: number;
}, kernelSampleX: number, kernelSampleY: number): { x: number; y: number } {
  return { x: destination.x - (kernelSampleX-kernel.centerSampleX)*kernel.samplePitchMicrometersX/1000,
    y: destination.y + (kernelSampleY-kernel.centerSampleY)*kernel.samplePitchMicrometersY/1000 };
}
