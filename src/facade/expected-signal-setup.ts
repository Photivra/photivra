// SPDX-License-Identifier: Apache-2.0

/**
 * Internal (#394, not exported from the package): the input of the tabulated expected signal (`createDisplayViewExpectedSignal`)
 * for a resolved `simulateCapture` request, shared by the display view and the capture's tabulated RAW path so both build it
 * the same way: query offsets of each site, the environment's query points, the diffraction kernels and the scene tables.
 *
 * Defocus (#492, `lens.defocus`): the geometric disc D on the site lattice (`createDefocusDiscSiteKernel`) enters as a site
 * kernel, so every query stays on the lattice. Without diffraction every spectral node takes D itself (a wavelength-independent
 * kernel). With diffraction node λ takes K_λ ∗ D, the full 2-D convolution of the diffraction kernel with the disc (radius
 * R_diff + R_defocus): a labelled approximation, since the defocused wave's PSF is not the in-focus Airy pattern convolved
 * with a geometric disc. The convolution is linear, so Σ_t (K_λ ∗ D)(t)·L(p − t) is the diffracted radiance blurred by D, the
 * order the capture's object-space convolutions apply them in.
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
  /** Defocus (#492): the geometric disc on the site lattice, (2R + 1)² row-major weights; absent or null in focus. */
  defocus?: { radius: number; weights: Float64Array } | null | undefined;
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
  // Defocus (#492): the disc alone at every node (one shared array), or each node's diffraction kernel convolved with it.
  const defocus = input.defocus;
  if (defocus) {
    const diffracted = kernels;
    kernels = diffracted ? { radius: diffracted.radius + defocus.radius, perNode: diffracted.perNode.map((k) => convolveSiteKernels(k, diffracted.radius, defocus.weights, defocus.radius)) } :
      { radius: defocus.radius, perNode: wavelengths.map(() => defocus.weights) };
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

/**
 * The full 2-D convolution of two square row-major site kernels, a of radius ra and b of radius rb: radius ra + rb,
 * (a ∗ b)(t) = Σ_s a(s)·b(t − s), accumulated in a fixed order (a's taps row by row, then b's), so the result is the same bits
 * in every engine. Zero taps of either kernel (the disc's corners) add nothing and are skipped.
 */
export function convolveSiteKernels(a: Float64Array, ra: number, b: Float64Array, rb: number): Float64Array {
  const wa = 2 * ra + 1, wb = 2 * rb + 1, w = wa + wb - 1;
  if (a.length !== wa * wa || b.length !== wb * wb) throw new InvalidConfigurationError("Site kernels must be (2R + 1)² taps.");
  const out = new Float64Array(w * w);
  for (let ay = 0; ay < wa; ay++) for (let ax = 0; ax < wa; ax++) {
    const va = a[ay * wa + ax]!;
    if (va === 0) continue;
    for (let by = 0; by < wb; by++) {
      const row = (ay + by) * w + ax;
      for (let bx = 0; bx < wb; bx++) { const vb = b[by * wb + bx]!; if (vb !== 0) out[row + bx] = out[row + bx]! + va * vb; }
    }
  }
  return out;
}
