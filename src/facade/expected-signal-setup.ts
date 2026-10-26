// SPDX-License-Identifier: Apache-2.0

/**
 * Internal (#394, not exported from the package): the input of the tabulated expected signal (`createDisplayViewExpectedSignal`)
 * for a resolved `simulateCapture` request, shared by the display view and the capture's tabulated RAW path so both build it
 * the same way: query offsets of each site, the environment's query points, the diffraction kernels and the scene tables.
 */

import { InvalidConfigurationError } from "../core/configuration-error.js";
import type { resolveLensPsfConvolutionKernels } from "../optics/lens-psf-kernels.js";
import { siteDiffractionKernel } from "../optics/site-diffraction-kernel.js";
import { calculateAiryCellEnergies } from "../optics/diffraction-psf-profile.js";
import { resolveProjectionDistanceMm } from "../motion/camera-rotation.js";
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
  /**
   * Object-space diffraction: the kernel radius, the PSF and its profile wavelengths. `foldBox` (#398 fast method): the Airy
   * cut-off frequency (cycles per µm) of each spectral node, with which the box nodes are folded into one kernel per node.
   */
  diffraction?: { radius: number; psf: Psf; profileWavelengths: readonly number[]; foldBox?: { cutoffs: ReadonlyMap<number, number> } | undefined } | undefined;
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

/**
 * #398 fast method: the box-N pixel aperture folded into one site kernel per spectral node. The exact sum reads each box node
 * o (at ((k + ½)/N − ½) sites) on its own lattice through the site kernel K; in the continuum limit that is one lattice at the
 * site centre read through K′(t) = (1/N²)·Σ_o (the Airy energy in the site cell centred at t + o). Those cells' edges lie on
 * the boundaries of a profile binned at pitch / N, so K′ sums N × N fine cells per node; it is renormalized to unit sum.
 * The approximation is the scene sampled once per site instead of N² times, which moves hard edges by up to half a site.
 */
function foldedBoxKernel(cutoffCyclesPerMicrometer: number, pitch: number, n: number, radius: number): Float64Array {
  // The Airy energies of cells of side pitch / N (β / N): the same function the profile bins at the site pitch (one quadrant).
  const fineRadius = n * (radius + 1), quadrant = calculateAiryCellEnergies(pitch / n * cutoffCyclesPerMicrometer, fineRadius).cells, size = 2 * radius + 1;
  const fine = (mu: number, mv: number): number => quadrant[Math.abs(mv) * (fineRadius + 1) + Math.abs(mu)]!;
  // Fine cell m (centred at m/N sites) belongs to the site cell centred at t + o_k for m in [N(t − 1) + k + 1, N·t + k].
  const out = new Float64Array(size * size);
  let total = 0;
  for (let tv = -radius, t = 0; tv <= radius; tv++) for (let tu = -radius; tu <= radius; tu++, t++) {
    let sum = 0;
    for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) {
      for (let mv = n * (tv - 1) + b + 1; mv <= n * tv + b; mv++) for (let mu = n * (tu - 1) + a + 1; mu <= n * tu + a; mu++) sum += Math.max(0, fine(mu, mv));
    }
    out[t] = sum;
    total += sum;
  }
  for (let t = 0; t < out.length; t++) out[t] = out[t]! / total;
  return out;
}

/** The query offsets of each site and the expected-signal input (see the module comment). */
export function buildExpectedSignalInput(input: ExpectedSignalSetupInput): { offsets: { x: number; y: number; weight: number }[]; signalInput: DisplayViewExpectedSignalInput } {
  const { boxSamples, pitch, wavelengths, imagingArea, subjectDistanceM, metresPerFrameUnit } = input;
  // Query offsets of each site: pixel-aperture nodes minus anti-aliasing split offsets (sites, +x right, +y down), as the environment forms them.
  const spots = input.antiAliasing ? input.antiAliasing.components : [{ offsetMicrometers: { x: 0, y: 0 }, normalizedWeight: 1 }];
  // #398 fast method: with the box folded into the kernels, each spot reads one lattice at the site centre.
  const fold = input.diffraction?.foldBox !== undefined && boxSamples > 1;
  // The exact path keeps its own expression for the weight (w / N², not w · (1/N²)), so its bits are unchanged for every N.
  const nodes = fold ? [{ x: 0, y: 0 }] : input.apertureNodes;
  const offsets = nodes.flatMap((node) => spots.map((c) => ({ x: node.x - c.offsetMicrometers.x / pitch, y: node.y - c.offsetMicrometers.y / pitch,
    weight: fold ? c.normalizedWeight : c.normalizedWeight / (boxSamples * boxSamples) })));
  // Diffraction: the same per-node site kernels as the object-space convolution (createDiffractedPlanarProvider).
  let kernels: { radius: number; perNode: Float64Array[] } | undefined;
  const diffraction = input.diffraction;
  if (diffraction) {
    const radius = diffraction.radius, cutoffs = fold ? diffraction.foldBox!.cutoffs : undefined;
    for (const wavelengthNm of wavelengths) if (!diffraction.profileWavelengths.includes(wavelengthNm)) throw new InvalidConfigurationError(input.caller + ": a spectral node has no diffraction kernel.");
    kernels = cutoffs ? { radius: radius + 1, perNode: wavelengths.map((wavelengthNm) => {
      const cutoff = cutoffs.get(wavelengthNm);
      if (cutoff === undefined) throw new InvalidConfigurationError(input.caller + ": a spectral node has no Airy cut-off.");
      return foldedBoxKernel(cutoff, pitch, boxSamples, radius + 1);
    }) } :
      { radius, perNode: wavelengths.map((wavelengthNm) => siteDiffractionKernel(diffraction.psf, wavelengthNm, pitch, radius, input.caller + ": diffraction kernels must sample the site pitch exactly.")) };
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
    const length = Math.hypot(rx, ry, projectionDistance), t = subjectDistanceM / (projectionDistance / length);
    out[0] = rx / length * t / metresPerFrameUnit; out[1] = ry / length * t / metresPerFrameUnit;
  };
  return { offsets, signalInput: { nativeWidth: input.nativeWidth, nativeHeight: input.nativeHeight, outputWidth: input.width, wavelengthsNm: wavelengths,
    electronsPerRadiance: input.perNode, offsets, ...(kernels ? { kernels } : { queryPoint }), scene, channelAt: channelIndex } };
}
