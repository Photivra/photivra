// SPDX-License-Identifier: Apache-2.0
/**
 * Per-fixture rollout (#277): method error of the GPU image-formation path against the per-site engine on
 * sampled tiles of a `simulateCapture` frame. Declared, synthetic test setup (not a measured lens):
 *
 * - **Per-site engine (reference):** `calculateEnvironmentSensorPhotoSignal` with the facade's own site
 *   inputs, a sampled lens PSF (`sampled-local`) and the chart provider: per-site radiance queries at every
 *   PSF tap and spectral node. Its expected generated electrons per site are the reference.
 * - **Image-formation method:** scene radiance integrated per channel at site centres
 *   (`calculateChartRadianceBatch`, spectral-integral mode), then the isoplanatic convolution
 *   (`calculateIrradianceConvolution`) of each channel plane with kernels sampled from the same PSF profile
 *   (`resolveLensPsfConvolutionKernels`), then the site's own channel. Static scene: the temporal sum is
 *   one node (identity), so it adds no method error here.
 * - The channel weights are the per-site engine's own spectral weights, read by probing it with
 *   single-wavelength radiance (it is linear in radiance). The facade's optics factor is the same at every
 *   site (checked), so one weight row per channel is exact.
 */
import { calculateChartRadianceBatch, calculateEnvironmentSensorPhotoSignal, calculateIrradianceConvolution, createPlanarSceneRadianceProvider,
  mapEnvironmentDirectionsToChartPoints, resolveLensPsfConvolutionKernels, simulateCapture, type ChartRadianceBatchInput, type ChartScene,
  type IrradianceConvolutionInput, type LensSampledPsfProfile, type SceneRadianceEvaluationRequest, type SceneRadianceEvaluationResult } from "../../src/index.js";
import { gaussianPsfProfile } from "./lens-psf-kernel-fixture.js";

export const ROLLOUT_FRAME = Object.freeze({ width: 192, height: 128, pitchMicrometers: 6, spectralStepNanometers: 40, patch: 8 });
const EVIDENCE = [{ sourceOrigin: "photivra", sourceReference: "test:webgpu-rollout", reuseStatus: "photivra-owned" }];

type Environment = Record<string, unknown> & { optics: { focalLengthMm: number; nominalFNumber: number; focus: { objectDistanceM: number } };
  sceneBindings: { providerProfile: { profileId: string; sceneId: string } } };
interface PhotoValue {
  photo: { value: { photoSignal: { expectedGeneratedElectronCount: number } } };
  instants: { evaluations: { query: { value: { request: SceneRadianceEvaluationRequest & { target: { outgoingDirectionUnitVector: { x: number; y: number; z: number } } } } } }[] }[];
}

export interface RolloutSetup {
  scene: ChartScene;
  nativeWidth: number;
  nativeHeight: number;
  environment(index: number): Environment;
  evaluateRadiance(request: Readonly<SceneRadianceEvaluationRequest>): SceneRadianceEvaluationResult;
  /** The per-site engine's spectral node wavelengths and, per channel (R, G, B), its weight per node. */
  wavelengths: number[];
  channelWeights: [number[], number[], number[]];
  batchBase: Omit<ChartRadianceBatchInput, "points" | "channelWeights" | "wavelengthsNanometers">;
  distanceM: number;
  metresPerFrameUnit: number;
}

/** Bayer RGGB channel of a native site (0 red, 1 green, 2 blue), as the facade's CFA. */
export const channelOf = (x: number, y: number): number => [0, 1, 1, 2][(y % 2) * 2 + (x % 2)]!;

function photo(environment: Environment, evaluate: (r: Readonly<SceneRadianceEvaluationRequest>) => SceneRadianceEvaluationResult, psf?: unknown): PhotoValue {
  return calculateEnvironmentSensorPhotoSignal({ ...environment, ...(psf ? { psf } : {}), evaluateRadiance: evaluate } as never).value as unknown as PhotoValue;
}

export async function rolloutSetup(scene: ChartScene): Promise<RolloutSetup> {
  const f = ROLLOUT_FRAME;
  const capture = await simulateCapture({ scene, output: { width: f.width, height: f.height, format: "srgb-8" },
    sensor: { pixelPitchMicrometers: f.pitchMicrometers, spectralStepNanometers: f.spectralStepNanometers } });
  const nativeWidth = capture.raw.plan.exposure.geometry.nativeRaster.pixelWidth, nativeHeight = capture.raw.plan.exposure.geometry.nativeRaster.pixelHeight;
  const environment = (index: number): Environment => capture.request.siteInput(index).environment as unknown as Environment;
  const ids = environment(0).sceneBindings.providerProfile;
  const batchBase = { schemaVersion: "0.1.0" as const, scene, illuminant: { kind: "planckian" as const, temperatureKelvin: 6500 },
    illuminanceLux: capture.scene.illuminant.illuminanceLux, aspect: f.height / f.width };
  const provider = createPlanarSceneRadianceProvider({ scene, illuminant: batchBase.illuminant, illuminanceLux: batchBase.illuminanceLux, aspect: batchBase.aspect,
    distanceM: capture.scene.distanceM, framedWidthM: capture.scene.framedWidthM, sceneId: ids.sceneId, providerProfileId: ids.profileId });
  const evaluateRadiance = provider.evaluateRadiance.bind(provider);
  const probe = (index: number, value: (nm: number) => number): PhotoValue => photo(environment(index), r =>
    ({ ...evaluateRadiance(r), spectralRadianceWattsPerSquareMeterSteradianNanometer: value(r.wavelengthNanometers) }));
  const cx = Math.floor(nativeWidth / 2) & ~1, cy = Math.floor(nativeHeight / 2) & ~1;
  const references = [cy * nativeWidth + cx, cy * nativeWidth + cx + 1, (cy + 1) * nativeWidth + cx + 1];
  const wavelengths = [...new Set(probe(references[0]!, () => 1).instants[0]!.evaluations.map(e => e.query.value.request.wavelengthNanometers))];
  const channelWeights = references.map(index => wavelengths.map(nm =>
    probe(index, w => (w === nm ? 1 : 0)).photo.value.photoSignal.expectedGeneratedElectronCount)) as [number[], number[], number[]];
  // Precondition: the optics factor is the same everywhere, so a flat probe equals the channel's summed weights at any site.
  for (const [x, y] of [[2, 2], [nativeWidth - 3, 3], [5, nativeHeight - 4], [nativeWidth - 4, nativeHeight - 3]] as const) {
    const flat = probe(y * nativeWidth + x, () => 1).photo.value.photoSignal.expectedGeneratedElectronCount;
    const sum = channelWeights[channelOf(x, y)]!.reduce((s, w) => s + w, 0);
    if (Math.abs(flat - sum) > 1e-9 * sum) throw new Error(`Optics factor varies across the frame (${flat} vs ${sum}); one weight row per channel is not exact.`);
  }
  return { scene, nativeWidth, nativeHeight, environment, evaluateRadiance, wavelengths, channelWeights, batchBase, distanceM: capture.scene.distanceM,
    metresPerFrameUnit: capture.scene.framedWidthM / 2 };
}

/** The synthetic field-varying lens PSF of the rollout (Gaussian, σx = 4 + 10·r µm, σy = 4 + 6·r µm, centroid shift 2 µm/mm). */
export function rolloutPsfProfile(setup: RolloutSetup, pitchMicrometers: number, halfWidth: number): LensSampledPsfProfile {
  const optics = setup.environment(0).optics, field = [-0.8, -0.4, 0, 0.4, 0.8];
  return gaussianPsfProfile({ pitchMicrometers, halfWidth, fieldXmm: field, fieldYmm: field, focalLengthMm: optics.focalLengthMm, apertureFNumber: optics.nominalFNumber,
    focusDiopters: 1 / optics.focus.objectDistanceM,
    shape: (fx, fy) => ({ sigmaX: 4 + 10 * Math.hypot(fx, fy), sigmaY: 4 + 6 * Math.hypot(fx, fy), shiftX: 2 * fx, shiftY: 2 * fy }) });
}

export interface RolloutTile { x: number; y: number; width: number; height: number }
export interface RolloutMethodInputs {
  region: RolloutTile;
  kernelRadius: number;
  radiance: ChartRadianceBatchInput;
  convolution: Omit<IrradianceConvolutionInput, "samples">;
  maximumKernelSum: number;
}

function psfState(setup: RolloutSetup, profile: LensSampledPsfProfile): { profile: LensSampledPsfProfile; focalLengthMm: number; focus: { kind: "finite"; distanceM: number };
  apertureFNumber: number; signedDefocusImagePlaneMicrometers: number } {
  const optics = setup.environment(0).optics;
  return { profile, focalLengthMm: optics.focalLengthMm, focus: { kind: "finite", distanceM: optics.focus.objectDistanceM }, apertureFNumber: optics.nominalFNumber,
    signedDefocusImagePlaneMicrometers: 0 };
}

/** Builds the method's radiance batch and convolution kernels for a tile (the region adds the kernel radius on each side). */
export function rolloutMethodInputs(setup: RolloutSetup, profile: LensSampledPsfProfile, tile: RolloutTile): RolloutMethodInputs {
  const f = ROLLOUT_FRAME, state = psfState(setup, profile);
  const kernels = (region: RolloutTile, kernelRadius?: number): ReturnType<typeof resolveLensPsfConvolutionKernels>["value"] => resolveLensPsfConvolutionKernels({
    schemaVersion: "0.1.0", psf: state, spectralWeights: [{ wavelengthNm: 550, weight: 1 }], patchWidth: f.patch, patchHeight: f.patch,
    grid: { width: region.width, height: region.height, sitePitchMicrometers: { x: f.pitchMicrometers, y: f.pitchMicrometers },
      opticalAxisSite: { x: setup.nativeWidth / 2 - region.x, y: setup.nativeHeight / 2 - region.y } }, ...(kernelRadius === undefined ? {} : { kernelRadius }) }).value;
  const reach = kernels({ ...tile, width: Math.max(tile.width, f.patch), height: Math.max(tile.height, f.patch) }).kernelRadius;
  const region = { x: tile.x - reach, y: tile.y - reach, width: tile.width + 2 * reach, height: tile.height + 2 * reach };
  if (region.x < 0 || region.y < 0 || region.x + region.width > setup.nativeWidth || region.y + region.height > setup.nativeHeight) throw new Error("Tile too close to the frame edge.");
  const k = kernels(region, reach);
  // Site-centre frame points: the per-site engine's own central-ray query direction, converted as evaluateRadiance does.
  const directions = new Float64Array(region.width * region.height * 3);
  for (let j = 0; j < region.height; j++) for (let i = 0; i < region.width; i++) {
    const o = photo(setup.environment((region.y + j) * setup.nativeWidth + region.x + i), setup.evaluateRadiance).instants[0]!.evaluations[0]!
      .query.value.request.target.outgoingDirectionUnitVector;
    directions.set([o.x, o.y, o.z], (j * region.width + i) * 3);
  }
  const points = mapEnvironmentDirectionsToChartPoints({ directions, distanceM: setup.distanceM, metresPerFrameUnit: setup.metresPerFrameUnit });
  return { region, kernelRadius: reach, maximumKernelSum: k.maximumKernelSum,
    radiance: { ...setup.batchBase, points, wavelengthsNanometers: setup.wavelengths, channelWeights: setup.channelWeights },
    convolution: { schemaVersion: "0.1.0", width: region.width, height: region.height, kernelRadius: reach, patchWidth: f.patch, patchHeight: f.patch,
      kernels: k.kernels, boundary: "zero-outside-grid" } };
}

/** Channel planes (R, G, B) from row-major (query, channel) radiance integrals. */
export function channelPlanes(values: ArrayLike<number>, count: number): Float64Array[] {
  return [0, 1, 2].map(c => Float64Array.from({ length: count }, (_, q) => values[q * 3 + c]!));
}

/** The method's expected electrons on the tile, from the three convolved channel planes. */
export function methodTile(inputs: RolloutMethodInputs, tile: RolloutTile, convolved: readonly ArrayLike<number>[]): Float64Array {
  const out = new Float64Array(tile.width * tile.height), r = inputs.kernelRadius;
  for (let j = 0; j < tile.height; j++) for (let i = 0; i < tile.width; i++) {
    out[j * tile.width + i] = convolved[channelOf(tile.x + i, tile.y + j)]![(j + r) * inputs.region.width + i + r]!;
  }
  return out;
}

/** The float64 CPU method on a tile. */
export function cpuMethodTile(inputs: RolloutMethodInputs, tile: RolloutTile): Float64Array {
  const planes = channelPlanes(calculateChartRadianceBatch(inputs.radiance).values, inputs.region.width * inputs.region.height);
  return methodTile(inputs, tile, planes.map(samples => calculateIrradianceConvolution({ ...inputs.convolution, samples }).values));
}

/** The per-site engine's expected generated electrons on a tile, with the sampled PSF. */
export function perSiteTile(setup: RolloutSetup, profile: LensSampledPsfProfile, tile: RolloutTile): Float64Array {
  const psf = { kind: "sampled-local", configuration: { psf: psfState(setup, profile), psfWavelengthBasis: { value: "vacuum", evidence: EVIDENCE },
    spatialModel: { kind: "destination-local-shift-invariant-approximation", evidence: EVIDENCE, limitation: "Synthetic rollout PSF." } } };
  const out = new Float64Array(tile.width * tile.height);
  for (let j = 0; j < tile.height; j++) for (let i = 0; i < tile.width; i++) {
    out[j * tile.width + i] = photo(setup.environment((tile.y + j) * setup.nativeWidth + tile.x + i), setup.evaluateRadiance, psf).photo.value.photoSignal.expectedGeneratedElectronCount;
  }
  return out;
}

/** Method error of a tile: largest and RMS |method − per-site| relative to the tile's peak, and the largest relative error where the reference is ≥ 10 % of the peak. */
export function methodError(method: ArrayLike<number>, reference: ArrayLike<number>): { maximumOfPeak: number; rmsOfPeak: number; maximumRelativeAbove10Percent: number; peak: number } {
  let peak = 0;
  for (let i = 0; i < reference.length; i++) peak = Math.max(peak, Math.abs(reference[i]!));
  let maximum = 0, squares = 0, relative = 0;
  for (let i = 0; i < reference.length; i++) {
    const d = Math.abs(method[i]! - reference[i]!);
    maximum = Math.max(maximum, d); squares += d * d;
    if (reference[i]! >= 0.1 * peak) relative = Math.max(relative, d / reference[i]!);
  }
  return { maximumOfPeak: maximum / peak, rmsOfPeak: Math.sqrt(squares / reference.length) / peak, maximumRelativeAbove10Percent: relative, peak };
}

/**
 * Sampled tiles: the frame centre and an off-axis tile with exact site sampling (6 µm PSF samples), and
 * the off-axis tile with sub-site PSF samples (2 µm, bilinear splatting). Patches are 8 sites.
 */
export const ROLLOUT_TILES = Object.freeze([
  { id: "exact-centre", psfPitchMicrometers: 6, psfHalfWidth: 6, tile: { x: 92, y: 60, width: 8, height: 8 } },
  { id: "exact-off-axis", psfPitchMicrometers: 6, psfHalfWidth: 6, tile: { x: 150, y: 20, width: 8, height: 8 } },
  { id: "subsite-off-axis", psfPitchMicrometers: 2, psfHalfWidth: 18, tile: { x: 150, y: 20, width: 4, height: 4 } }
] as const);
export type RolloutTileId = (typeof ROLLOUT_TILES)[number]["id"];

/**
 * Pinned method error: the largest |method − per-site| over the tile's peak, as measured (SwiftShader and
 * float64 agree to 1e-6) plus 5 %, rounded up to two significant digits.
 */
export const ROLLOUT_PINNED_METHOD_ERROR: Readonly<Record<string, Readonly<Record<RolloutTileId, number>>>> = Object.freeze({
  uniform: { "exact-centre": 0.026, "exact-off-axis": 0.018, "subsite-off-axis": 0.016 },
  "slanted-edge": { "exact-centre": 0.019, "exact-off-axis": 0.018, "subsite-off-axis": 0.016 },
  "siemens-star": { "exact-centre": 0.27, "exact-off-axis": 0.018, "subsite-off-axis": 0.016 },
  "step-wedge": { "exact-centre": 0.025, "exact-off-axis": 0.016, "subsite-off-axis": 0.016 },
  "grey-ramp": { "exact-centre": 0.024, "exact-off-axis": 0.017, "subsite-off-axis": 0.016 },
  checkerboard: { "exact-centre": 0.025, "exact-off-axis": 0.018, "subsite-off-axis": 0.016 },
  "point-grid": { "exact-centre": 0.027, "exact-off-axis": 0.013, "subsite-off-axis": 0.18 },
  patches: { "exact-centre": 0.025, "exact-off-axis": 0.018, "subsite-off-axis": 0.021 }
});
