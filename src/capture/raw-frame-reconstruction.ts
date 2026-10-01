// SPDX-License-Identifier: Apache-2.0

import { approximationResult, type CalculationResult } from "../core/calculation-result.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";
import type { RasterRect } from "../output/capture-geometry.js";
import { parseSensorRawReconstructionProfile, resolveSensorRawReconstruction,
  type SensorRawReconstructionProfile, type SensorRawReconstructedPixel } from "../sensor/raw-reconstruction.js";
import { createSensorRawFrame, type SensorRawFrame, type SensorRawFrameInput } from "./sensor-raw-frame.js";

export const RAW_FRAME_RECONSTRUCTION_SCHEMA_VERSION = "0.1.0" as const;
/** Kernel selection is explicit per absolute native CFA repeat phase, not guessed from channel names. */
export interface RawFrameReconstructionPhaseProfile {
  phaseX: number;
  phaseY: number;
  profile: SensorRawReconstructionProfile;
}
/** Bounded reference handoff; region coordinates stay in the full native sensor frame. */
export interface RawFrameReconstructionInput {
  rawFrame: SensorRawFrame;
  region: RasterRect;
  phaseProfiles: readonly RawFrameReconstructionPhaseProfile[];
}
/** Traceable virtual sensor-channel values, not colorimetric RGB or a rendered photograph. */
export interface RawFrameReconstruction {
  schemaVersion: typeof RAW_FRAME_RECONSTRUCTION_SCHEMA_VERSION;
  rawFrame: SensorRawFrame;
  phaseProfiles: readonly RawFrameReconstructionPhaseProfile[];
  region: RasterRect;
  linearPlane: {
    imageState: "virtual-sensor-channels";
    rasterBinding: "native-reconstruction-region";
    pixelWidth: number;
    pixelHeight: number;
    channelIds: readonly string[];
    /** Interleaved native-region row-major values; black-subtracted normalization, signed. */
    samples: readonly number[];
  };
  /** Child envelopes and exact weighted RAW contributions, in matching native-region row-major order. */
  pixels: readonly CalculationResult<SensorRawReconstructedPixel>[];
  lineage: "engine-reconstructed-from-attached-raw";
  producerOriginVerified: false;
  whiteBalanceApplied: false;
  colorTransformApplied: false;
  physicalOrientationApplied: false;
  outputCropApplied: false;
  sharpeningApplied: false;
  denoisingApplied: false;
}
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.keys(value).some((k) => !keys.includes(k))) {
    throw new InvalidConfigurationError("Invalid or non-allowlisted RAW reconstruction fields.");
  }
  return value as Record<string, unknown>;
}
function integer(value: unknown, positive = false): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < (positive ? 1 : 0)) {
    throw new InvalidConfigurationError("RAW reconstruction coordinates require safe integers with valid sign.");
  }
  return Object.is(value, -0) ? 0 : value;
}
function frame(value: unknown): SensorRawFrame {
  const r = object(value, ["frameId", "capture", "modeId", "captureModeProfile", "colorSamplingProfile", "bindingProfile",
    "containerBitDepth", "samples", "schemaVersion", "sampleDomain", "sampleOrder", "producerBinding", "reconstructionApplied",
    "renderingApplied", "nativePixelWidth", "nativePixelHeight"]);
  if (r.schemaVersion !== "0.1.0" || r.sampleDomain !== "native-cfa-raw-code" || r.sampleOrder !== "native-row-major" ||
      r.producerBinding !== "caller-declared-capture-attachment" || r.reconstructionApplied !== false || r.renderingApplied !== false ||
      !Array.isArray(r.samples) || r.samples.length > 4096) {
    throw new InvalidConfigurationError("Reconstruction requires a committed native RAW frame of at most 4,096 samples.");
  }
  const { schemaVersion, sampleDomain, sampleOrder, producerBinding, reconstructionApplied, renderingApplied,
    nativePixelWidth, nativePixelHeight, ...input } = r;
  void schemaVersion; void sampleDomain; void sampleOrder; void producerBinding; void reconstructionApplied; void renderingApplied;
  // The frame input parser checks full native coverage, site/code/seed identities and flags.
  const result = createSensorRawFrame(input as unknown as SensorRawFrameInput);
  if (nativePixelWidth !== result.nativePixelWidth || nativePixelHeight !== result.nativePixelHeight) {
    throw new InvalidConfigurationError("Committed RAW dimensions disagree with capture geometry.");
  }
  return result;
}
function profile(value: unknown): SensorRawReconstructionProfile {
  const r = object(value, ["schemaVersion", "profileId", "profileVersion", "captureModeId", "colorSamplingProfileId", "scientificStatus",
    "method", "normalization", "negativeBlackSubtractedValuesAllowed", "kernels", "evidence", "limitations"]);
  if (!Array.isArray(r.kernels) || r.kernels.length === 0 || r.kernels.length > 16) {
    throw new InvalidConfigurationError("Reconstruction requires one to sixteen output channels.");
  }
  let count = 0;
  for (const kernel of r.kernels) {
    const k = object(kernel, ["outputChannelId", "contributions"]);
    if (!Array.isArray(k.contributions) || k.contributions.length === 0) throw new InvalidConfigurationError("Missing RAW contributions.");
    count += k.contributions.length;
    if (count > 256) throw new InvalidConfigurationError("Reconstruction profile exceeds 256 contributions.");
    for (const c of k.contributions) object(c, ["offsetX", "offsetY", "sourceChannelId", "weight"]);
  }
  return parseSensorRawReconstructionProfile(r);
}
/** Revalidates committed RAW codes/geometry and complete phase dispatch; no external plane may supply output values. */
export function parseRawFrameReconstructionInput(value: unknown): RawFrameReconstructionInput {
  const r = object(value, ["rawFrame", "region", "phaseProfiles"]), rawFrame = frame(r.rawFrame);
  const rect = object(r.region, ["x", "y", "width", "height"]);
  const region = { x: integer(rect.x), y: integer(rect.y), width: integer(rect.width, true), height: integer(rect.height, true) };
  if (region.x + region.width > rawFrame.nativePixelWidth || region.y + region.height > rawFrame.nativePixelHeight) {
    throw new InvalidConfigurationError("Reconstruction region must lie within the full native RAW frame.");
  }
  const layout = rawFrame.colorSamplingProfile.layout;
  if (layout.kind !== "periodic-mosaic") throw new InvalidConfigurationError("Reconstruction requires periodic native CFA.");
  const phaseCount = layout.repeatWidthSites * layout.repeatHeightSites;
  if (phaseCount > 64 || !Array.isArray(r.phaseProfiles) || r.phaseProfiles.length !== phaseCount) {
    throw new InvalidConfigurationError("Every CFA phase requires one profile, with a maximum of 64 phases.");
  }
  const phaseProfiles: RawFrameReconstructionPhaseProfile[] = [];
  const phases = new Set<string>();
  let channels: string[] | undefined;
  for (const value of r.phaseProfiles) {
    const p = object(value, ["phaseX", "phaseY", "profile"]), phaseX = integer(p.phaseX), phaseY = integer(p.phaseY), parsed = profile(p.profile);
    const key = phaseX + ":" + phaseY, ids = parsed.kernels.map((k) => k.outputChannelId);
    if (phaseX >= layout.repeatWidthSites || phaseY >= layout.repeatHeightSites || phases.has(key) ||
        parsed.captureModeId !== rawFrame.modeId || parsed.colorSamplingProfileId !== rawFrame.colorSamplingProfile.profileId ||
        (channels && JSON.stringify(ids) !== JSON.stringify(channels))) {
      throw new InvalidConfigurationError("CFA phase/profile identity or output-channel order is inconsistent.");
    }
    channels = ids; phases.add(key); phaseProfiles.push({ phaseX, phaseY, profile: parsed });
  }
  phaseProfiles.sort((a, b) => a.phaseY - b.phaseY || a.phaseX - b.phaseX);
  return { rawFrame, region, phaseProfiles };
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
/** Delegates each pixel to #14's explicit linear reconstruction using only the attached native RAW samples. */
export function resolveRawFrameReconstruction(input: RawFrameReconstructionInput): CalculationResult<RawFrameReconstruction> {
  const v = parseRawFrameReconstructionInput(input), f = v.rawFrame, layout = f.colorSamplingProfile.layout;
  if (layout.kind !== "periodic-mosaic") throw new InvalidConfigurationError("Reconstruction requires periodic native CFA.");
  const pixels: CalculationResult<SensorRawReconstructedPixel>[] = [], samples: number[] = [];
  for (let y = v.region.y; y < v.region.y + v.region.height; y++) {
    for (let x = v.region.x; x < v.region.x + v.region.width; x++) {
      const phaseIndex = (y % layout.repeatHeightSites) * layout.repeatWidthSites + x % layout.repeatWidthSites;
      const selected = v.phaseProfiles[phaseIndex]!.profile, indices = new Set<number>();
      for (const kernel of selected.kernels) {
        for (const c of kernel.contributions) {
          const sx = x + c.offsetX, sy = y + c.offsetY;
          if (!Number.isSafeInteger(sx) || !Number.isSafeInteger(sy) || sx < 0 || sy < 0 || sx >= f.nativePixelWidth || sy >= f.nativePixelHeight) {
            throw new InvalidConfigurationError("Reconstruction kernel leaves the native RAW frame; no padding or renormalization is allowed.");
          }
          const i = sy * f.nativePixelWidth + sx;
          if (f.samples[i]!.channelId !== c.sourceChannelId) throw new InvalidConfigurationError("Reconstruction source channel disagrees with absolute CFA phase.");
          indices.add(i);
        }
      }
      const pixel = resolveSensorRawReconstruction({ profile: selected, colorSamplingProfile: f.colorSamplingProfile,
        centerSite: { x, y }, samples: [...indices].map((i) => f.samples[i]!) });
      pixels.push(pixel);
      samples.push(...pixel.value.outputChannels.map((c) => c.linearBlackSubtractedNormalizedValue));
    }
  }
  const value: RawFrameReconstruction = { schemaVersion: RAW_FRAME_RECONSTRUCTION_SCHEMA_VERSION,
    rawFrame: f, phaseProfiles: v.phaseProfiles, region: v.region,
    linearPlane: { imageState: "virtual-sensor-channels", rasterBinding: "native-reconstruction-region",
      pixelWidth: v.region.width, pixelHeight: v.region.height,
      channelIds: v.phaseProfiles[0]!.profile.kernels.map((k) => k.outputChannelId), samples }, pixels,
    lineage: "engine-reconstructed-from-attached-raw", producerOriginVerified: false, whiteBalanceApplied: false,
    colorTransformApplied: false, physicalOrientationApplied: false, outputCropApplied: false, sharpeningApplied: false, denoisingApplied: false };
  return freeze(approximationResult(JSON.parse(JSON.stringify(value)) as RawFrameReconstruction,
    "attached-raw-native-region-linear-reconstruction", "0.1.0", [
      "Pixel values come exclusively from exact attached RAW samples through the existing explicit linear-neighborhood resolver.",
      "The RAW producer/capture attachment remains caller-declared; this does not verify producer origin or calibrate sensor color.",
      "Phase-specific kernels are explicit approximation policy; negative values and child provenance are retained.",
      "No edge extension, CFA rephasing, WB, color conversion, orientation, output crop, sharpening, denoising or JPEG processing is applied.",
      "Attached capture float planes are metadata/source history only and are not used to reconstruct these values."
    ]));
}
