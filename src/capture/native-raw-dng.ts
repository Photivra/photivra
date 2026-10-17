// SPDX-License-Identifier: Apache-2.0
// This product includes DNG technology under license by Adobe.

/**
 * Module boundary and integration notes.
 * Serializes a packed native RAW (`NativeRawOutput`, from the native RAW or native environment RAW tasks)
 * to a lossless, uncompressed 16-bit CFA DNG. It describes only what the packed RAW and the caller's
 * declared colour profile and noise model contain; it never claims a linear-master source or a
 * developed image. The tag layout reuses the TIFF/DNG writers of the paired photographic export
 * (`packExportTiff`, DNG 1.4 tags, Adobe DNG Specification 1.7.1.0):
 *
 * - CFA geometry: CFARepeatPatternDim 2×2, CFAPattern and BlackLevel phases relative to the ActiveArea
 *   origin (DNG applies them to the stage-2, ActiveArea-cropped image); DefaultCropOrigin/Size are the
 *   capture's oriented output crop mapped back to stored (native) coordinates; Orientation from the capture.
 * - Levels: BlackLevel per 2×2 phase (the packed per-site black levels must repeat with the CFA tile);
 *   WhiteLevel is the smallest per-phase effective white code, so no channel is reported unsaturated
 *   above its own saturation point. Saturation flags of sites whose code lies below WhiteLevel cannot be
 *   represented in DNG; they are counted in `unrepresentedSaturationFlagCount`.
 * - Colour: ColorMatrix1 = (camera→XYZ)⁻¹ with CalibrationIlluminant1 D65 (21), ForwardMatrix1 =
 *   Bradford(D65→D50)·M·diag(w), AnalogBalance 1, AsShotNeutral from the capture's white-balance intent
 *   (the same operator native development uses), BaselineExposure as declared (default 0).
 * - Noise: NoiseProfile (51041) per CFA plane, var(x) = S·x + O for x = (code − black)/(WhiteLevel − black),
 *   S = 1/(G·span), O = (σ_read²/G² + 1/12)/span², written only when the caller supplies each channel's
 *   output-referred conversion gain G (electrons per code) and read noise σ_read (electrons). Poisson
 *   photo/dark shot noise, Gaussian read noise and uniform quantization only (an approximation; PRNU,
 *   DSNU and fixed-pattern noise are not included).
 * @see docs/NATIVE_RAW_AND_PRINT.md for the tag table, limits and the round trip through parseDngRawImage.
 */

import { InvalidConfigurationError } from "../core/configuration-error.js";
import { requireAllowlistedRecord } from "../core/record-validation.js";
import { ENGINE_API_VERSION } from "../core/version.js";
import { resolveCaptureColorModel } from "../color/capture-color.js";
import { invertSensorColorMatrix, prepareSensorColorDevelopment, sensorColorReferenceWhite } from "../color/sensor-color-development.js";
import { ICC_D50_WHITE_XYZ } from "../color/srgb-icc.js";
import { chromaticAdaptationMatrix } from "../color/chromatic-adaptation.js";
import { transformOrientedRasterRectToNative } from "../output/capture-geometry.js";
import type { NativeRawOutput } from "./native-raw.js";
import { checkNativeRawIntegrity, validatePackedNativeRaw } from "./native-raw-development.js";
import { parseExportSensorColorProfile, type ExportSensorColorProfile } from "./photographic-export.js";
import { packExportTiff, exportTiffAscii as ascii, exportTiffNumbers as numbers, exportTiffRationals as rationals,
  exportTiffBytes as rawBytes, exportTiffDoubles as doubles } from "./export-tiff.js";

export const NATIVE_RAW_DNG_SCHEMA_VERSION = "1.0.0" as const;

/** Output-referred noise parameters of one CFA channel (see the module notes). */
export interface NativeRawDngChannelNoise {
  /** Electrons per output RAW code (system conversion gain divided by any post-ADC digital gain). */
  conversionGainElectronsPerCode: number;
  /** Combined RMS read noise, electrons. */
  readNoiseRmsElectrons: number;
}
export interface SerializeNativeRawDngInput {
  /** Packed native RAW; read, never consumed or modified. */
  raw: NativeRawOutput;
  /** Declared camera→XYZ (D65) profile bound to the RAW's CFA, the same profile native development uses. */
  colorProfile: ExportSensorColorProfile;
  /** Optional NoiseProfile parameters by channel id; omitted means no NoiseProfile tag. */
  noise?: Readonly<Record<string, NativeRawDngChannelNoise>>;
  /** BaselineExposure in EV. Default 0 (the RAW white level maps to display white, as in native development). */
  baselineExposureEv?: number;
  /** Optional capture-event UTC time, exactly YYYY-MM-DDTHH:mm:ss.sssZ; omitted means no date tags (the engine invents no wall clock). */
  capturedAtUtc?: string;
}
export interface NativeRawDng {
  schemaVersion: typeof NATIVE_RAW_DNG_SCHEMA_VERSION;
  mediaType: "image/dng";
  bytes: Uint8Array;
  sha256: string;
  /** RawDataUniqueID (32 hex digits): the first 128 bits of SHA-256 over a fixed header and the little-endian codes. */
  rawDataUniqueId: string;
  uniqueCameraModel: string;
  /** Stored geometry, levels and colour values exactly as written (rationals as numerator/denominator). */
  activeArea: { x: number; y: number; width: number; height: number };
  defaultCrop: { x: number; y: number; width: number; height: number };
  orientation: number;
  blackLevels: readonly number[];
  whiteLevel: number;
  cfaPattern: readonly number[];
  colorMatrix1: readonly number[];
  asShotNeutral: readonly number[];
  noiseProfile: readonly number[] | null;
  /** Sites flagged saturated whose code is below WhiteLevel; DNG has no field for them. */
  unrepresentedSaturationFlagCount: number;
  source: "packed-native-raw";
  linearMasterDeclared: false;
}

function fail(message: string): never { throw new InvalidConfigurationError("Native RAW DNG: " + message); }
async function sha256(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) fail("needs crypto.subtle (a secure browser context or Node 22+).");
  return Array.from(new Uint8Array(await subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>)), (b) => b.toString(16).padStart(2, "0")).join("");
}
/** Values exactly as stored by a RATIONAL/SRATIONAL tag (numerator / denominator), so reported metadata equals what a reader decodes. */
function stored(tag: ReturnType<typeof rationals>): number[] {
  const view = new DataView(tag.data.buffer, tag.data.byteOffset, tag.data.byteLength);
  return Array.from({ length: tag.count }, (_, i) => (tag.type === 10 ? view.getInt32(i * 8, true) : view.getUint32(i * 8, true)) / view.getUint32(i * 8 + 4, true));
}
const ORIENTATION = { landscape: 1, "portrait-clockwise": 6, "landscape-inverted": 3, "portrait-counter-clockwise": 8 } as const;

/**
 * Serializes packed native RAW codes to a lossless uncompressed CFA DNG (see the module notes for every
 * tag and its source). The input arrays are copied before the first await.
 */
export async function serializeNativeRawDng(input: SerializeNativeRawDngInput): Promise<NativeRawDng> {
  const r = requireAllowlistedRecord(input, ["raw", "colorProfile", "noise", "baselineExposureEv", "capturedAtUtc"], "Invalid native RAW DNG input.");
  const raw = r.raw as NativeRawOutput, plan = validatePackedNativeRaw(raw);
  const mosaic = plan.frame.colorSamplingProfile.layout;
  if (mosaic.kind === "periodic-mosaic") checkNativeRawIntegrity(raw, plan.exposure.geometry.nativeRaster.pixelWidth, mosaic.repeatWidthSites, mosaic.repeatHeightSites, 0, plan.exposure.geometry.nativeRaster.pixelHeight);
  const color = parseExportSensorColorProfile(r.colorProfile), frame = plan.frame, layout = frame.colorSamplingProfile.layout;
  if (layout.kind !== "periodic-mosaic" || layout.repeatWidthSites !== 2 || layout.repeatHeightSites !== 2 ||
    [...layout.siteChannelIds].sort().join() !== "blue,green,green,red" || color.channelIds.join() !== "red,green,blue")
    fail("supports 2×2 RGB Bayer CFAs with red, green, blue colour-profile channels only.");
  if (color.colorSamplingProfileId !== frame.colorSamplingProfile.profileId) fail("colour profile is not bound to the RAW's CFA.");
  const baseline = r.baselineExposureEv === undefined ? 0 : r.baselineExposureEv;
  if (typeof baseline !== "number" || !Number.isFinite(baseline) || Math.abs(baseline) > 16) fail("baselineExposureEv must be finite within ±16.");
  const capturedAtUtc = r.capturedAtUtc as string | undefined;
  if (capturedAtUtc !== undefined && (typeof capturedAtUtc !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(capturedAtUtc) || Number.isNaN(Date.parse(capturedAtUtc))))
    fail("capturedAtUtc must be YYYY-MM-DDTHH:mm:ss.sssZ.");

  const native = plan.exposure.geometry.nativeRaster, width = native.pixelWidth, height = native.pixelHeight, g = plan.exposure.resolvedGeometry;
  const active = g.activeCapture.nativeRect;
  const crop = transformOrientedRasterRectToNative({ rect: g.output.cropRect, nativeRaster: g.activeCapture.raster, orientation: plan.exposure.geometry.orientation });
  // Copy before any await: the caller keeps ownership of the packed arrays.
  const codes = raw.codes.slice(), blacks = raw.blackLevels.slice(), flags = raw.saturationFlags.slice(), whiteByPhase = Array.from(raw.effectiveSaturationCodes);

  // Levels per active-relative phase; the black tile must repeat exactly.
  const blackLevels: number[] = [], cfaPattern: number[] = [], whites: number[] = [], phaseChannel: string[] = [];
  for (let py = 0; py < 2; py++) for (let px = 0; px < 2; px++) {
    const ax = (active.x + px) % 2, ay = (active.y + py) % 2;
    const black = blacks[ay * width + ax]!;
    for (let y = ay; y < height; y += 2) for (let x = ax; x < width; x += 2) if (blacks[y * width + x] !== black) fail("per-site black levels do not repeat with the 2×2 CFA tile.");
    const channel = layout.siteChannelIds[ay * 2 + ax]!;
    blackLevels.push(black); whites.push(whiteByPhase[ay * 2 + ax]!); phaseChannel.push(channel); cfaPattern.push(["red", "green", "blue"].indexOf(channel));
  }
  const whiteLevel = Math.min(...whites);
  if (blackLevels.some((b) => b >= whiteLevel)) fail("black level must be below the effective WhiteLevel.");
  let unrepresented = 0;
  for (let i = 0; i < codes.length; i++) if (flags[i] !== 0 && codes[i]! < whiteLevel) unrepresented++;

  // NoiseProfile: one (S, O) pair per CFA plane colour, only when every phase of a channel shares its black level.
  let noiseProfile: number[] | null = null;
  if (r.noise !== undefined) {
    const noise = requireAllowlistedRecord(r.noise, ["red", "green", "blue"], "Invalid native RAW DNG noise.") as Record<string, NativeRawDngChannelNoise>;
    noiseProfile = [];
    for (const channel of ["red", "green", "blue"]) {
      const n = noise[channel];
      if (!n) fail("noise needs red, green and blue entries.");
      requireAllowlistedRecord(n, ["conversionGainElectronsPerCode", "readNoiseRmsElectrons"], "Invalid native RAW DNG channel noise.");
      const gain = n.conversionGainElectronsPerCode, read = n.readNoiseRmsElectrons;
      if (typeof gain !== "number" || !Number.isFinite(gain) || gain <= 0 || typeof read !== "number" || !Number.isFinite(read) || read < 0) fail("noise gain must be positive and read noise non-negative.");
      const phaseBlacks = blackLevels.filter((_, i) => phaseChannel[i] === channel);
      if (phaseBlacks.some((b) => b !== phaseBlacks[0])) { noiseProfile = null; break; }
      const span = whiteLevel - phaseBlacks[0]!;
      noiseProfile.push(1 / (gain * span), (read * read / (gain * gain) + 1 / 12) / (span * span));
    }
  }

  // Colour tags from the declared profile and the capture's white-balance intent.
  const m = color.normalizedCameraChannelsToXyz, colorMatrix = invertSensorColorMatrix(m), intent = plan.exposure.whiteBalanceIntent;
  const development = prepareSensorColorDevelopment(m, intent ? [intent.channelGains.red, intent.channelGains.green, intent.channelGains.blue] : null);
  const cameraWhite = sensorColorReferenceWhite(colorMatrix);
  const chad = chromaticAdaptationMatrix({ transform: "bradford", sourceWhiteXyz: resolveCaptureColorModel().referenceWhiteXyz,
    destinationWhiteXyz: { x: ICC_D50_WHITE_XYZ[0], y: 1, z: ICC_D50_WHITE_XYZ[2] } }).matrix;
  const forward = chad.map((row) => [0, 1, 2].map((j) => row.reduce((sum, x, k) => sum + x * m[k]![j]! * cameraWhite[j]!, 0)));

  const pixels = new Uint8Array(codes.length * 2), view = new DataView(pixels.buffer);
  codes.forEach((c, i) => view.setUint16(i * 2, c, true));
  const header = new TextEncoder().encode(JSON.stringify({ schema: "photivra-native-raw-data-id-0.1", width, height, cfa: layout.siteChannelIds, containerBitDepth: 16 }));
  const idInput = new Uint8Array(header.length + pixels.length); idInput.set(header); idInput.set(pixels, header.length);
  const rawDataUniqueId = (await sha256(idInput)).slice(0, 32);
  const colorHash = (await sha256(new TextEncoder().encode(JSON.stringify(color)))).slice(0, 16);
  const uniqueCameraModel = "Photivra Virtual Camera " + color.profileId + " " + color.profileVersion + " " + colorHash;
  const orientation = ORIENTATION[plan.exposure.geometry.orientation];
  const e = plan.exposure.exposure, software = "Photivra " + ENGINE_API_VERSION;
  const description = "Simulated capture: packed native RAW from the Photivra engine (" + frame.frameId + "). Source " + plan.exposure.source.kind +
    "; no linear master image or developed rendering is stored.";

  const exif = [rawBytes(36864, 7, new TextEncoder().encode("0232")), rationals(33434, false, [e.shutterSeconds]), rationals(33437, false, [e.aperture]),
    ...(Number.isInteger(e.iso) && e.iso >= 1 && e.iso <= 65535 ? [numbers(34855, 3, [e.iso]), numbers(34864, 3, [2]), numbers(34866, 4, [e.iso])] : []),
    rationals(37386, false, [e.focalLengthMm]), numbers(40961, 3, [65535]), numbers(40962, 4, [crop.width]), numbers(40963, 4, [crop.height]),
    ...(capturedAtUtc === undefined ? [] : [ascii(36867, capturedAtUtc.slice(0, 19).replaceAll("-", ":").replace("T", " ")), ascii(36881, "+00:00"), ascii(37521, capturedAtUtc.slice(20, 23))])];
  const colorMatrixTag = rationals(50721, true, colorMatrix.flat()), neutralTag = rationals(50728, false, [...development.asShotNeutral]);
  const bytes = packExportTiff([ascii(270, description), ascii(271, "Photivra"), ascii(272, "Photivra Virtual Camera"), ascii(305, software), numbers(274, 3, [orientation]),
    numbers(254, 4, [0]), numbers(256, 4, [width]), numbers(257, 4, [height]), numbers(258, 3, [16]), numbers(259, 3, [1]), numbers(262, 3, [32803]),
    { ...numbers(273, 4, [0]), pointer: "pixels" as const }, numbers(277, 3, [1]), numbers(278, 4, [height]), numbers(279, 4, [pixels.length]),
    numbers(284, 3, [1]), numbers(339, 3, [1]), numbers(33421, 3, [2, 2]), numbers(33422, 1, cfaPattern),
    numbers(50706, 1, [1, 4, 0, 0]), numbers(50707, 1, [1, 1, 0, 0]), ascii(50708, uniqueCameraModel), numbers(50710, 1, [0, 1, 2]), numbers(50711, 3, [1]),
    numbers(50713, 3, [2, 2]), rationals(50714, false, blackLevels), numbers(50717, 4, [whiteLevel]), numbers(50719, 4, [crop.x, crop.y]), numbers(50720, 4, [crop.width, crop.height]),
    colorMatrixTag, rationals(50727, false, [1, 1, 1]), neutralTag,
    rationals(50730, true, [baseline]), numbers(50778, 3, [21]),
    rawBytes(50781, 1, Uint8Array.from(rawDataUniqueId.match(/../g)!.map((s) => parseInt(s, 16)))),
    numbers(50829, 4, [active.y, active.x, active.y + active.height, active.x + active.width]),
    rationals(50964, true, forward.flat()), ...(noiseProfile ? [doubles(51041, noiseProfile)] : [])], exif, pixels);
  return Object.freeze({ schemaVersion: NATIVE_RAW_DNG_SCHEMA_VERSION, mediaType: "image/dng" as const, bytes, sha256: await sha256(bytes), rawDataUniqueId, uniqueCameraModel,
    activeArea: { ...active }, defaultCrop: { ...crop }, orientation, blackLevels, whiteLevel, cfaPattern, colorMatrix1: stored(colorMatrixTag), asShotNeutral: stored(neutralTag),
    noiseProfile, unrepresentedSaturationFlagCount: unrepresented, source: "packed-native-raw" as const, linearMasterDeclared: false as const });
}
