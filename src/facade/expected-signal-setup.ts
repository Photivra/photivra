// SPDX-License-Identifier: Apache-2.0

/**
 * Internal (#394, not exported from the package): the input of the tabulated expected signal (`createDisplayViewExpectedSignal`)
 * for a resolved `simulateCapture` request, shared by the display view and the capture's tabulated RAW path so both build it
 * the same way: query offsets of each site, the environment's query points, the diffraction kernels and the scene tables.
 */

import { InvalidConfigurationError } from "../core/configuration-error.js";
import type { resolveLensPsfConvolutionKernels } from "../optics/lens-psf-kernels.js";
import { siteDiffractionKernel } from "../optics/site-diffraction-kernel.js";
import { resolveProjectionDistanceMm } from "../motion/camera-rotation.js";
import { hypot3 } from "../core/portable-math.js";
import type { DisplayViewExpectedSignalInput, DisplayViewScene } from "./display-view.js";

type Psf = Parameters<typeof resolveLensPsfConvolutionKernels>[0]["psf"];

export interface ExpectedSignalSetupInput {
  nativeWidth: number;
  nativeHeight: number;
  /** Frame output width (plane coordinates are 2 / width frame units per site). */
  width: number;
  wavelengths: readonly number[];
  /** Per CFA channel (red, green, blue): expected electrons per unit spectral radiance at each node. */
  perNode: readonly [Float64Array, Float64Array, Float64Array];
  /** Pixel-aperture nodes in sites from the site centre (`apertureNodeOffsets(boxSamples)`) and the box sample count. */
  apertureNodes: readonly { x: number; y: number }[];
  boxSamples: number;
  antiAliasing?: { components: readonly { offsetMicrometers: { x: number; y: number }; normalizedWeight: number }[] } | undefined;
  pitch: number;
  /** Object-space diffraction: the kernel radius, the PSF and its profile wavelengths. */
  diffraction?: { radius: number; psf: Psf; profileWavelengths: readonly number[] } | undefined;
  /** Material scenes: the materials (neutral reflectances, or radiance per wavelength), the material lookup and the white radiance. */
  materials?: { list: readonly ({ neutral: number } | { radiance: (nm: number) => number })[]; materialAt(u: number, v: number): number; whiteRadiance(nm: number): number } | undefined;
  radianceAt(u: number, v: number, nm: number): number;
  imagingArea: { widthMm: number; heightMm: number };
  focalLengthMm: number;
  focusDistanceM: number;
  subjectDistanceM: number;
  metresPerFrameUnit: number;
  /** Prefix of the error messages ("simulateDisplayView", "simulateCapture"). */
  caller: string;
}

/** The query offsets of each site and the expected-signal input (see the module comment). */
export function buildExpectedSignalInput(input: ExpectedSignalSetupInput): { offsets: { x: number; y: number; weight: number }[]; signalInput: DisplayViewExpectedSignalInput } {
  const { boxSamples, pitch, wavelengths, imagingArea, subjectDistanceM, metresPerFrameUnit } = input;
  // Query offsets of each site: pixel-aperture nodes minus anti-aliasing split offsets (sites, +x right, +y down), as the environment forms them.
  const spots = input.antiAliasing ? input.antiAliasing.components : [{ offsetMicrometers: { x: 0, y: 0 }, normalizedWeight: 1 }];
  const offsets = input.apertureNodes.flatMap((node) => spots.map((c) => ({ x: node.x - c.offsetMicrometers.x / pitch, y: node.y - c.offsetMicrometers.y / pitch,
    weight: c.normalizedWeight / (boxSamples * boxSamples) })));
  // Diffraction: the same per-node site kernels as the object-space convolution (createDiffractedPlanarProvider).
  let kernels: { radius: number; perNode: Float64Array[] } | undefined;
  const diffraction = input.diffraction;
  if (diffraction) {
    const radius = diffraction.radius;
    kernels = { radius, perNode: wavelengths.map((wavelengthNm) => {
      if (!diffraction.profileWavelengths.includes(wavelengthNm)) throw new InvalidConfigurationError(input.caller + ": a spectral node has no diffraction kernel.");
      return siteDiffractionKernel(diffraction.psf, wavelengthNm, pitch, radius, input.caller + ": diffraction kernels must sample the site pitch exactly.");
    }) };
  }
  // Chart presets and (2.7) caller material scenes take the material path: each material tabulated once per node.
  const materials = input.materials;
  const scene: DisplayViewScene = materials ? { kind: "materials", materialAt: materials.materialAt,
    materials: materials.list.map((m) => ("neutral" in m ? { neutral: m.neutral } : { radiance: Float64Array.from(wavelengths, (nm) => m.radiance(nm)) })),
    whiteRadiance: Float64Array.from(wavelengths, (nm) => materials.whiteRadiance(nm)) } :
    { kind: "radiance", radianceAt: input.radianceAt };
  const channelIndex = (x: number, y: number): number => ((y & 1) === 0 ? ((x & 1) === 0 ? 0 : 1) : ((x & 1) === 0 ? 1 : 2));
  // Without diffraction the environment's own query arithmetic (native-environment-lean.ts `geometry`, then the rectilinear
  // still-camera ray and the planar provider's plane point), so boundary points resolve as in the capture.
  const projectionDistance = resolveProjectionDistanceMm(input.focalLengthMm, input.focusDistanceM).projectionDistanceMm, siteWidthMm = pitch / 1000;
  const nodePhases = input.apertureNodes.flatMap((_, index) => spots.map((c) => ({ xPhase: (index % boxSamples + 0.5) / boxSamples, yPhase: (Math.floor(index / boxSamples) + 0.5) / boxSamples,
    aaX: c.offsetMicrometers.x / 1000, aaY: c.offsetMicrometers.y / 1000 })));
  const queryPoint = (x: number, y: number, o: number, out: Float64Array): void => {
    const node = nodePhases[o]!;
    const centerX = -imagingArea.widthMm / 2 + (pitch / 2 + x * pitch + 0) / 1000, centerY = -imagingArea.heightMm / 2 + (pitch / 2 + y * pitch + 0) / 1000;
    const sourceX = (centerX - siteWidthMm / 2 + node.xPhase * siteWidthMm) - node.aaX, sourceY = (centerY - siteWidthMm / 2 + node.yPhase * siteWidthMm) - node.aaY;
    const rx = projectionDistance * (sourceX / projectionDistance), ry = projectionDistance * (-sourceY / projectionDistance);
    const length = hypot3(rx, ry, projectionDistance), t = subjectDistanceM / (projectionDistance / length);
    out[0] = rx / length * t / metresPerFrameUnit; out[1] = ry / length * t / metresPerFrameUnit;
  };
  return { offsets, signalInput: { nativeWidth: input.nativeWidth, nativeHeight: input.nativeHeight, outputWidth: input.width, wavelengthsNm: wavelengths,
    electronsPerRadiance: input.perNode, offsets, ...(kernels ? { kernels } : { queryPoint }), scene, channelAt: channelIndex } };
}
