// SPDX-License-Identifier: Apache-2.0
/**
 * The defocus fixtures of the GPU display view (#492, step 2c), shared by the float32 emulation test
 * (test/display-view-defocus-gpu.test.ts) and the SwiftShader suite (test/webgpu/display-view.webgpu.ts). They follow the CPU
 * display view's defocus cases (scripts/lib/display-view-defocus-cases.mjs, #492 step 2b): a 24 MP full frame at 6 µm with the
 * 50 mm-equivalent prime and a 12 MP phone sensor at 1.4 µm with the 300 mm-equivalent, the subject at 2 m, focus at 0.8× and
 * 1.25× of it, f/2.8, f/8 and f/16, the Speed request (2 × 2 box, bilinear) and the Quality request (diffraction, the four-spot
 * filter, AHD). The GPU material lookup covers engine charts and declared material-layers scenes, so the sharp scene is the
 * slanted-edge chart (5°), plus the composite under the label layer as a material-layers scene, a bar Siemens star, and the
 * largest kernels the reference builds: the disc at its 64-site cap (Speed) and a combined radius of 94 of the 96 (Quality).
 * Each renders a block at the frame centre (or on the label) of the view at a third of the frame's size (3 real pixels per
 * display pixel, the exact area mean).
 */
import type { SimulateCaptureOptions, SimulateDisplayViewOptions } from "../../src/index.js";
import { labelLayer, layeredScene } from "./chart-composite-fixtures.js";

export const DEFOCUS_GPU_SENSORS = Object.freeze({
  "6": Object.freeze({ width: 6000, height: 4000, pitch: 6, prime: 50 as const }),
  "1.4": Object.freeze({ width: 4000, height: 3000, pitch: 1.4, prime: 300 as const })
});
export type DefocusGpuPitch = keyof typeof DEFOCUS_GPU_SENSORS;
export const DEFOCUS_GPU_SUBJECT_DISTANCE_M = 2;
/** Real pixels per display pixel along each axis. */
export const DEFOCUS_GPU_SCALE = 3;

export interface DefocusGpuCase {
  name: string;
  options: SimulateCaptureOptions;
  view: SimulateDisplayViewOptions;
  /** The kernel radius in sites the reference builds for the case (the disc, plus diffraction for Quality). */
  kernelRadius: number;
  quality: boolean;
}

type Scene = SimulateCaptureOptions["scene"];
const EDGE: Scene = { preset: "slanted-edge", angleDegrees: 5 };

/** One case's request and view: `block` display pixels at the frame centre, or centred on `at` (frame units, v up). */
export function defocusGpuCase(name: string, pitch: DefocusGpuPitch, fNumber: number, focusFactor: number, quality: boolean, kernelRadius: number,
  { scene = EDGE, block = { width: 16, height: 12 }, at, frameHeight }: { scene?: Scene; block?: { width: number; height: number }; at?: { u: number; v: number }; frameHeight?: number } = {}): DefocusGpuCase {
  const sensor = { ...DEFOCUS_GPU_SENSORS[pitch], ...(frameHeight ? { height: frameHeight } : {}) };
  const options: SimulateCaptureOptions = {
    scene, subjectDistanceM: DEFOCUS_GPU_SUBJECT_DISTANCE_M,
    lens: { prime: sensor.prime, fNumber, focusDistanceM: DEFOCUS_GPU_SUBJECT_DISTANCE_M * focusFactor, defocus: { model: "geometric-disc" }, ...(quality ? { diffraction: "circular-aperture" as const } : {}) },
    exposure: { mode: "manual", iso: 100, shutterSeconds: (1 / 125) * (fNumber / 8) ** 2 },
    sensor: { pixelPitchMicrometers: sensor.pitch, pixelAperture: { kind: "box", samplesPerAxis: 2 }, ...(quality ? { antiAliasing: { kind: "four-spot" as const } } : {}) },
    output: { width: sensor.width, height: sensor.height, maximumPixels: sensor.width * sensor.height * 2, format: "srgb-8", ...(quality ? { demosaic: "ahd" as const } : {}) }
  };
  const width = Math.round(sensor.width / DEFOCUS_GPU_SCALE), height = Math.round(sensor.height / DEFOCUS_GPU_SCALE), aspect = sensor.height / sensor.width;
  const cx = at ? Math.round((at.u + 1) / 2 * width) : Math.floor(width / 2), cy = at ? Math.round((aspect - at.v) / (2 * aspect) * height) : Math.floor(height / 2);
  const view = { width, height, region: { x: cx - Math.floor(block.width / 2), y: cy - Math.floor(block.height / 2), width: block.width, height: block.height } };
  return { name, options, view, kernelRadius, quality };
}

/**
 * The kernel radii of the grid, from the reference's `view.defocus` assumption (disc radius; plus the diffraction radius for
 * Quality): [pitch][fNumber][focus factor] → [disc, combined].
 */
const GRID_RADII: Record<DefocusGpuPitch, Record<string, Record<string, [number, number]>>> = {
  "6": { "2.8": { "0.8": [10, 12], "1.25": [8, 10] }, "8": { "0.8": [3, 7], "1.25": [3, 7] }, "16": { "0.8": [2, 9], "1.25": [1, 8] } },
  "1.4": { "2.8": { "0.8": [39, 45], "1.25": [31, 37] }, "8": { "0.8": [14, 29], "1.25": [11, 26] }, "16": { "0.8": [7, 37], "1.25": [5, 35] } }
};

/** The 24 grid cases (both pitches, f/2.8, f/8, f/16, focus 0.8× and 1.25×, Speed and Quality), on the slanted edge. */
export const DEFOCUS_GPU_GRID: readonly DefocusGpuCase[] = Object.freeze(((): DefocusGpuCase[] => {
  const cases: DefocusGpuCase[] = [];
  for (const pitch of ["6", "1.4"] as const) for (const fNumber of [2.8, 8, 16]) for (const focus of [0.8, 1.25]) for (const quality of [false, true]) {
    const radii = GRID_RADII[pitch][String(fNumber)]![String(focus)]!;
    cases.push(defocusGpuCase(`${pitch} µm f/${fNumber} focus ${focus}× ${quality ? "Quality" : "Speed"} (R ${quality ? radii[1] : radii[0]})`, pitch, fNumber, focus, quality, quality ? radii[1] : radii[0]));
  }
  return cases;
})());

/** The label layer's centre in frame units (the composite fixtures' label, at a sensor's aspect). */
function labelCentre(aspect: number): { u: number; v: number } {
  const r = labelLayer(aspect).rectangle;
  return { u: (r.u0 + r.u1) / 2, v: (r.v0 + r.v1) / 2 };
}

/** The extra cases: the composite under the label layer, a bar Siemens star, and the kernels at the caps. */
export const DEFOCUS_GPU_EXTRA: readonly DefocusGpuCase[] = Object.freeze([
  defocusGpuCase("composite under the label layer (material-layers), 6 µm f/2.8 focus 0.8× Quality (R 12)", "6", 2.8, 0.8, true, 12,
    { scene: layeredScene(2 / 3), block: { width: 24, height: 16 }, at: labelCentre(2 / 3) }),
  defocusGpuCase("composite under the label layer (material-layers), 6 µm f/2.8 focus 0.8× Speed (R 10)", "6", 2.8, 0.8, false, 10,
    { scene: layeredScene(2 / 3), block: { width: 24, height: 16 }, at: labelCentre(2 / 3) }),
  defocusGpuCase("Siemens star (bar), 6 µm f/2.8 focus 0.8× Quality (R 12)", "6", 2.8, 0.8, true, 12,
    { scene: { preset: "siemens-star", cycles: 36 }, block: { width: 24, height: 16 }, at: { u: 0.1, v: 0.08 } }),
  defocusGpuCase("disc at its cap, 1.4 µm f/2.8 focus 0.71× Speed (R 64)", "1.4", 2.8, 0.71, false, 64, { block: { width: 8, height: 6 } }),
  defocusGpuCase("combined near the cap, 1.4 µm f/16 focus 0.31× Quality (R 94 = 63 + 31)", "1.4", 16, 0.31, true, 94, { block: { width: 8, height: 6 } }),
  // The composite's elements are laid out for a 3:2 frame: a 4000 × 2667 crop of the 1.4 µm sensor.
  defocusGpuCase("composite under the label layer near the cap, 1.4 µm (3:2 crop) f/16 focus 0.296× Quality (R 94)", "1.4", 16, 0.296, true, 94,
    { scene: layeredScene(2667 / 4000), block: { width: 8, height: 6 }, at: labelCentre(2667 / 4000), frameHeight: 2667 })
]);
