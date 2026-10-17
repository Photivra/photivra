// SPDX-License-Identifier: Apache-2.0

/**
 * `simulateCapture()` is the easy starting point. It turns a small input into a complete native
 * environment RAW request: scene radiance → optics → spectral EQE (external quantum efficiency) →
 * charge → readout and ADC. That request then runs through the existing native RAW development task
 * and, optionally, the existing JPEG encoder.
 *
 * It adds no physics of its own. Every number comes from existing public contracts: generic tier
 * presets, exposure metering and mode resolution, colorimetry, native environment RAW, native RAW
 * development and print JPEG.
 *
 * Everything the facade decides for the caller is listed in `result.assumptions`: defaults, derived
 * values and fixed modelling choices. Nothing is hidden. The complete underlying request is returned
 * in `result.request`; get the per-site inputs with `request.siteInput(index)`.
 *
 * The 2.0 options are opt-in and only combine existing public contracts. If none is given, the
 * request, RAW, samples and JPEG are byte-identical to the 1.0 facade:
 * - output formats: `png` (`serializePngImage`; sRGB, or Display P3 / Rec. 2020 through the colorimetry
 *   matrices and transfer functions) and `dng`
 *   (`serializeNativeRawDng` of the packed native RAW; no linear master is declared);
 * - demosaic: `createBuiltInBayerDemosaicProfiles` (bilinear) and mirror borders;
 * - optics: the environment `lensFieldMapping` (projection, radial / Brown–Conrady distortion), radial
 *   illumination vignetting as field throughput and a caller sampled lens PSF;
 * - motion: constant camera angular velocity and the electronic rolling-shutter exposure schedule.
 * The 2.1 options are opt-in in the same way: `lens.diffraction`, `output.demosaic: "ahd"` and
 * `sensor.antiAliasing` (a birefringent point-splitting low-pass filter in the sensor optical stack).
 * @see docs/QUICK_START.md
 */

import { InvalidConfigurationError } from "../core/configuration-error.js";
import { requireInputObject } from "../core/record-validation.js";
import { ENGINE_API_VERSION } from "../core/version.js";
import type { EvidenceProvenance } from "../core/evidence-provenance.js";
import { GENERIC_TIER_ASSETS, type GenericEquipmentTier, type GenericEquipmentTierPreset } from "../equipment/generic-tier-assets.js";
import { parseCallerCameraPreset } from "./camera-preset.js";
import { createHostYield } from "./host-yield.js";
import { resolveGenericEquipmentExposureCapabilities } from "../equipment/exposure-capabilities.js";
import { resolveGenericIsoSignalChain } from "../sensor/iso-signal-chain.js";
import { meterRelativeExposure } from "../exposure/metering.js";
import { createExposureMeterTargetFromMeteringResult, setExposureCompensationOnMeterTarget } from "../exposure/metering-target.js";
import { resolveManualExposureMode, resolveAperturePriorityExposureMode, resolveShutterPriorityExposureMode,
  resolveProgramAutoExposureMode } from "../exposure/exposure-mode-resolver.js";
import { parseExposureProgramLineProfile, type ExposureProgramLineProfile } from "../exposure/program-line.js";
import { resolveCaptureGeometry } from "../output/capture-geometry.js";
import { estimateCie1931ColorMatchingFunctions, type PreparedColorimetricSpectrum } from "../color/color-matching-functions.js";
import { createColorTemperatureWhiteBalanceIntent, resolveColorTemperatureWhiteBalance, resolveCustomWhiteBalance,
  resolveManualWhiteBalance, estimateAutoWhiteBalance, type ResolvedWhiteBalanceState } from "../color/white-balance.js";
import { createCaptureWhiteBalanceIntent, type CaptureWhiteBalanceIntent } from "../capture/simulated-capture.js";
import { SENSOR_RAW_PRODUCER_NOISE_MODEL } from "../capture/sensor-raw-producer.js";
import { calculateNativeRawPlan, nativeRawMaximumProviderEvaluations, NATIVE_RAW_LIMITS, type NativeRawInput, type NativeRawOutput, type NativeRawPlan } from "../capture/native-raw.js";
import { createNativeEnvironmentRawTask, type NativeEnvironmentRawInput,
  type NativeEnvironmentRawTask, type NativeEnvironmentRawTile } from "../capture/native-environment-raw.js";
import { createNativeRawDevelopmentTask, type NativeRawDevelopmentInput, type RawHighlightDiagnostics } from "../capture/native-raw-development.js";
import type { RawFrameReconstructionPhaseProfile } from "../capture/raw-frame-reconstruction.js";
import type { ExportSensorColorProfile } from "../capture/photographic-export.js";
import { parseSdrRenderingProfile, type SdrRenderingProfile, type SdrToneCurve, type SdrToneCurveParameters, type SdrRenderingResult } from "../output/sdr-rendering.js";
import type { RawHighlightMode } from "../color/sensor-color-development.js";
import { createPrintJpegTask, PRINT_JPEG_LIMITS } from "../output/print-jpeg.js";
import type { SimulateEnvironmentSensorRawFrameInput } from "../capture/environment-raw-producer.js";
import { checkNativeRawIntegrity, prepareNativeRawDevelopment } from "../capture/native-raw-development.js";
import { createRawPixelDeveloper, normalizedRawSite, rawSiteSaturated, type RawDevelopmentSource } from "../capture/raw-development-kernel.js";
import { createAhdDemosaicTask } from "../processing/demosaic.js";
import { PROCESSING_MAX_PIXELS } from "../processing/processing-task.js";
import { renderSdrRunInto, type SdrPixelCounts } from "../output/native-capture-sdr.js";
import { prepareSdrPixelTone } from "../output/sdr-rendering.js";
import { BUILT_IN_BAYER_DEMOSAIC_MODEL_VERSION as BUILT_IN_DEMOSAIC_VERSION, createBuiltInBayerDemosaicProfiles } from "../sensor/raw-reconstruction.js";
import { transformOrientedRasterPointToNative } from "../output/capture-geometry.js";
import { resolveCaptureColorModel } from "../color/capture-color.js";
import { evaluateBt709Oetf, evaluateSrgbEncoding, resolveRgbColorSpace } from "../color/rgb-color-spaces.js";
import { serializePngImage, PNG_ENCODER_LIMITS, type PngColourEncoding } from "../output/png-encoder.js";
import { parseLensProjectionModel, type LensProjectionModel } from "../camera/lens-projection.js";
import { prepareEnvironmentLensFieldMapping, type EnvironmentLensFieldMapping } from "../optics/sensor-environment-query.js";
import type { RadialDistortionProfile } from "../optics/radial-distortion.js";
import type { BrownConradyDistortionProfile } from "../optics/brown-conrady-distortion.js";
import type { IlluminationVignettingProfile } from "../optics/illumination-vignetting.js";
import type { CalculateEnvironmentSensorPhotoSignalInput } from "../sensor/environment-photo-signal.js";
import { createRollingShutterCaptureExposureSchedule, resolveElectronicRollingShutterExposureSchedule,
  type ElectronicRollingShutterExposureSchedule } from "../sensor/readout-exposure-linkage.js";
import { calculateCaptureExposureWindows } from "../sensor/exposure-window.js";
import { calculateSensorSpectralQuadrature } from "../sensor/spectral-quadrature.js";
import { createDiffractionLimitedPsfProfile, type DiffractionLimitedPsfProfile } from "../optics/diffraction-psf-profile.js";
import { createDiffractedPlanarProvider } from "./diffraction-provider.js";
import { resolveAntiAliasingSpatialKernel, type AntiAliasingPointSplitComponent, type SensorOpticalStackProfile } from "../sensor/optical-stack.js";
import { multiplyMatrices, type ColorMatrix3x3, type ColorVector3 } from "../color/colorimetry-math.js";
import { prepareRgbGamutMapping, type PreparedRgbGamutMapping } from "../color/gamut-mapping.js";
import { serializeNativeRawDng, type NativeRawDng } from "../capture/native-raw-dng.js";
import { parseSensorReadoutConversionProfile, resolveSensorReadoutRegime } from "../sensor/raw-readout.js";
import { resolveChartScene, CHART_SCENE_PRESETS, type ChartScene, type ResolvedChartScene } from "./chart-scenes.js";
import { resolveCaptureIlluminant, calculateIlluminantIrradianceScale, buildPlanarSceneRadianceProvider, requireCallerScene, FACADE_SPECTRAL_RANGE_NANOMETERS,
  PHOTOPIC_MAXIMUM_LUMINOUS_EFFICACY_LM_PER_W, type CaptureIlluminant, type CallerRadianceScene, type CallerReflectanceScene,
  type PlanarSceneRadianceProvider, type ResolvedCaptureIlluminant } from "./scene-radiance.js";

/** Version of how the facade builds requests. It changes whenever the same input would build a different request. */
export const SIMULATE_CAPTURE_FACADE_VERSION = "1.0.0" as const;

export type SimulateCaptureExposureMode = "manual" | "aperture-priority" | "shutter-priority" | "program";
export type SimulateCaptureOutputFormat = "srgb-8" | "srgb-16" | "jpeg" | "png" | "dng";
export type SimulateCaptureWhiteBalance =
  | "scene-illuminant"
  | "auto"
  | "none"
  | { kelvin: number; tint?: number }
  | { channelGains: { red: number; green: number; blue: number } };
/**
 * PNG colour encoding. `srgb` is the developed sRGB output. The others take the developed linear
 * colour (camera → XYZ → linear sRGB/D65, unclipped) and convert it through CIE XYZ into the target
 * primaries:
 * - `display-p3`: Display P3 primaries (W3C CSS Color 4 `display-p3`; also SMPTE EG 432-1) with the
 *   sRGB transfer function;
 * - `rec2020`: ITU-R BT.2020 primaries and OETF.
 * PQ and HLG (BT.2100) are not part of 2.0; see THIRD_PARTY.md.
 */
export type SimulateCaptureColorEncoding = "srgb" | "display-p3" | "rec2020";
/**
 * Demosaic. `bilinear`: the built-in Bayer kernels (`createBuiltInBayerDemosaicProfiles`). `ahd` (2.1): adaptive
 * homogeneity-directed demosaicing (`createAhdDemosaicTask`, after Hirakawa & Parks 2005), a non-linear
 * edge-directed method that reduces zipper and false colour on sharp edges.
 */
export type SimulateCaptureDemosaic = "bilinear" | "ahd";
/**
 * `margin` renders extra native sites around the output, as far as the kernel reaches. `mirror` renders
 * exactly the output and reads mirrored (reflect-101) copies of the missing border sites. Mirroring is
 * checked to keep the CFA (colour filter array) pattern consistent.
 */
export type SimulateCaptureBorderHandling = "margin" | "mirror";
export type SimulateCaptureLensDistortion =
  | { kind: "radial"; profile: RadialDistortionProfile }
  | { kind: "brown-conrady"; profile: BrownConradyDistortionProfile };
/** Diffraction model (2.1): the shorthand or a record with an explicit kernel radius in sites. */
export type SimulateCaptureLensDiffraction = "circular-aperture" | { aperture: "circular-aperture"; kernelRadiusSamples?: number };
/**
 * Optical anti-aliasing (low-pass) filter (2.1), modelled as birefringent point splitting: each image point is
 * split into equally bright copies (the engine's `normalized-point-splitting-kernel` optical-stack response).
 * - `four-spot`: two crossed birefringent plates; copies at (±d/2, ±d/2), weight 1/4 each, MTF |cos(π·f_x·d)·cos(π·f_y·d)|.
 * - `two-spot`: one plate splitting along `axis`; copies at ±d/2, weight 1/2 each, MTF |cos(π·f·d)|.
 * - `point-splitting`: the engine contract itself, offsets in micrometres (+x right, +y down) and positive weights
 *   summing to 1 (at most 16 components, each within 4 sites).
 * d = `separationSites` × pixel pitch, 0 < separationSites ≤ 4, default 1 (first MTF zero at the sensor's Nyquist
 * frequency 1/(2·pitch)).
 */
export type SimulateCaptureSensorAntiAliasing =
  | { kind: "four-spot"; separationSites?: number }
  | { kind: "two-spot"; axis: "horizontal" | "vertical"; separationSites?: number }
  | { kind: "point-splitting"; components: readonly AntiAliasingPointSplitComponent[] };
export interface SimulateCaptureMotion {
  /** Constant camera angular velocity, rad/s, in the engine's pitch/yaw/roll convention. Missing axes are 0. */
  angularVelocityRadPerSec?: { pitch?: number; yaw?: number; roll?: number };
  /** Default "global". `rolling` derives the exposure schedule from the body's rolling readout declaration. */
  shutter?: "global" | "rolling";
  /** Rolling shutter only: time from the first to the last line over the simulated frame, in s. Default: the body's declared readout skew. */
  rollingShutterSkewSeconds?: number;
}

export interface SimulateCaptureOptions {
  /** Generic tier preset id or a full preset record (for example a modified copy of a catalog entry). Default "professional". */
  camera?: GenericEquipmentTier | GenericEquipmentTierPreset;
  lens?: {
    /** Must lie in the lens capability (the generic primes are 50 mm). Default: the lens's shortest focal length. */
    focalLengthMm?: number;
    /** Aperture for manual and aperture-priority modes. Default 8. */
    fNumber?: number;
    /** Focus distance in metres. Default: the subject distance. */
    focusDistanceM?: number;
    /** Opt-in ideal circular-pupil ray sampling (defocus/depth of field). Default off (central ray only). */
    pupilSampling?: { radialSamples: number; angularSamples: number };
    /** Ideal lens projection (`LENS_PROJECTION_MODELS`). Default "rectilinear". Not combinable with pupilSampling. */
    projection?: LensProjectionModel;
    /** Caller-declared radial or Brown–Conrady distortion profile. Default none. Not combinable with pupilSampling. */
    distortion?: SimulateCaptureLensDistortion;
    /** Caller-declared radial relative-illumination (vignetting) profile, applied as environment field throughput. */
    vignetting?: IlluminationVignettingProfile;
    /**
     * Caller sampled lens PSF, passed unchanged to the environment contract. Its focal length, f-number and
     * focus must equal the resolved capture settings exactly. Not combinable with pupilSampling.
     */
    psf?: Extract<CalculateEnvironmentSensorPhotoSignalInput["psf"], { kind: "sampled-local" }>;
    /**
     * Opt-in (2.1) diffraction blur of an ideal, aberration-free, in-focus lens with a circular pupil at the
     * capture's resolved f-number: the engine builds the Airy kernels (`createDiffractionLimitedPsfProfile`)
     * on the site pitch. `kernelRadiusSamples` (0–32) sets the kernel window; default: the third dark ring at
     * the longest spectral node. Not combinable with `psf` or `pupilSampling`. Default off.
     */
    diffraction?: SimulateCaptureLensDiffraction;
  };
  exposure?: {
    /** Default "manual". */
    mode?: SimulateCaptureExposureMode;
    /** Default 100. */
    iso?: number;
    /** Shutter for manual and shutter-priority modes. Default 1/125 s. */
    shutterSeconds?: number;
    /** Exposure compensation applied to the meter target, in stops. Default 0. */
    compensationStops?: number;
  };
  /** Required: an engine chart (for example `{ preset: "uniform" }`, an 18 % grey card) or a caller reflectance/radiance function. */
  scene: ChartScene | CallerReflectanceScene | CallerRadianceScene;
  /** Distance from the camera to the scene plane in metres. Default 5. */
  subjectDistanceM?: number;
  /** Default: Planckian 6500 K (a blackbody stand-in for daylight; CIE D65 is not bundled). */
  illuminant?: CaptureIlluminant;
  /** Illuminance on the scene plane, lux. Default about 21 481 lux (see `SIMULATE_CAPTURE_DEFAULT_ILLUMINANCE_LUX` and the assumptions). */
  illuminanceLux?: number;
  output?: {
    /** Output pixels; the native sensor raster adds a one-site demosaic border on each side. Defaults 64 × 64. */
    width?: number;
    height?: number;
    /** Default "srgb-8". */
    format?: SimulateCaptureOutputFormat;
    /** Default "identity". */
    toneCurve?: SdrToneCurve;
    /** Required by the luminance tone curves (see `SdrToneCurveParameters`). The facade does not make one up. */
    toneCurveParameters?: SdrToneCurveParameters;
    /** Default "clip". */
    highlightMode?: RawHighlightMode;
    /** Default "scene-illuminant". */
    whiteBalance?: SimulateCaptureWhiteBalance;
    /** JPEG constant quantization step 1-255 (not a manufacturer 'quality'). Default 2. */
    jpegQuantizationStep?: number;
    /** PNG only. Default "srgb". */
    colorEncoding?: SimulateCaptureColorEncoding;
    /** PNG only: 8 or 16 bits per sample. Default 8. */
    bitDepth?: 8 | 16;
    /**
     * PNG SDR encodings only. Default "clip" (per-component clip to the target gamut). "perceptual" maps
     * through `prepareRgbGamutMapping`: constant CIELAB L* and hue, chroma above 90 % of the boundary compressed.
     */
    gamutMapping?: "clip" | "perceptual";
    /** Default: the 1.0 facade's bilinear RGGB kernels. */
    demosaic?: SimulateCaptureDemosaic;
    /** Default "margin". */
    borderHandling?: SimulateCaptureBorderHandling;
    /** DNG only: optional capture-event time (YYYY-MM-DDTHH:mm:ss.sssZ); without it no date tags are written. */
    dng?: { capturedAtUtc?: string };
    /**
     * Opt-in large images: the most native sensor sites (the output plus the demosaic margin on each side) the
     * capture may allocate, an integer up to `NATIVE_RAW_LIMITS.ceilingPixels` (2^27). With it, `width` and
     * `height` may each reach 16 384 sites including the margin; without it they stay at most 4094. Time and
     * memory grow with the pixel count (see "Large images" in the quick start); browsers may fail at large sizes.
     */
    maximumPixels?: number;
  };
  /** Camera motion and shutter type. Default: still camera, global electronic shutter. */
  motion?: SimulateCaptureMotion;
  sensor?: {
    /** Pixel pitch in micrometres. Default 6. */
    pixelPitchMicrometers?: number;
    /** Maximum spectral quadrature subinterval in nm. Default 20. */
    spectralStepNanometers?: number;
    /** Temporal midpoint samples across the exposure. Default 1. */
    temporalSampleCount?: number;
    /** Noise seed (uint32). Default 1. */
    noiseSeed?: number;
    /**
     * Opt-in (2.1) optical anti-aliasing filter (birefringent point splitting, `SimulateCaptureSensorAntiAliasing`).
     * Multiplies the scene queries by the number of split points. Default off (the tiers declare no filter).
     */
    antiAliasing?: SimulateCaptureSensorAntiAliasing;
  };
  /** Aborting cancels the running task; the promise rejects with a domain error and returns no partial image. */
  signal?: AbortSignal;
  /** Called after each committed RAW, development or JPEG tile. Cannot change output. */
  onProgress?: (progress: SimulateCaptureProgress) => void;
}

/**
 * Options reported in `diagnostics.options` (2.1), in this order, when they ran: the ones that change how much work
 * a capture does. `motion.rotation` is a non-zero angular velocity; `sensor.temporalSampleCount` a count above 1.
 */
export const SIMULATE_CAPTURE_COST_OPTIONS = Object.freeze(["lens.pupilSampling", "lens.projection", "lens.distortion", "lens.vignetting", "lens.psf",
  "lens.diffraction", "sensor.antiAliasing", "sensor.temporalSampleCount", "motion.rotation", "motion.shutter.rolling", "output.borderHandling.mirror",
  "output.whiteBalance.auto", "output.demosaic.ahd", "output.highlightMode.reconstruct", "output.colorEncoding.wide-gamut", "output.gamutMapping.perceptual",
  "output.format.jpeg", "output.format.png", "output.format.dng"] as const);
export type SimulateCaptureCostOption = typeof SIMULATE_CAPTURE_COST_OPTIONS[number];

export interface SimulateCaptureProgress {
  stage: "raw" | "white-balance" | "development" | "jpeg";
  completedTileCount: number;
  totalTileCount: number;
}

/** One decision the facade made: a default, a derived value or a fixed modelling choice. */
export interface SimulateCaptureAssumption {
  /** Dotted option path or modelling topic, for example "exposure.shutterSeconds" or "model.lens-psf". */
  id: string;
  kind: "default" | "derived" | "model";
  value: unknown;
  explanation: string;
}

export interface SimulateCaptureResult {
  facadeVersion: typeof SIMULATE_CAPTURE_FACADE_VERSION;
  engineApiVersion: string;
  image: {
    width: number;
    height: number;
    format: SimulateCaptureOutputFormat;
    /** Interleaved RGB, row by row from the top-left. sRGB-encoded (W3C CSS Color 4 sRGB; also IEC 61966-2-1) unless `colorEncoding` says otherwise. */
    samples: Uint8Array | Uint16Array;
    /** Baseline JPEG bytes when format is "jpeg". */
    jpeg?: Uint8Array;
    /** PNG file bytes when format is "png". */
    png?: Uint8Array;
    /** Encoding of `samples` and `png` when format is "png". */
    colorEncoding?: SimulateCaptureColorEncoding;
    /** Lossless uncompressed CFA DNG of the packed RAW when format is "dng" (`serializeNativeRawDng`); `samples` are then sRGB 8-bit. */
    dng?: Uint8Array;
  };
  /** Packed native RAW (codes, black levels, saturation flags) as produced by the native environment RAW task. */
  raw: NativeRawOutput;
  plan: NativeRawPlan;
  /** The complete underlying request. */
  request: {
    environmentRaw: NativeEnvironmentRawInput;
    /** Rebuilds the exact physical site input the provider supplied for a native row-major index. */
    siteInput(nativeIndex: number): SimulateEnvironmentSensorRawFrameInput["sites"][number];
    development: Omit<NativeRawDevelopmentInput, "raw">;
    whiteBalanceState: ResolvedWhiteBalanceState | null;
    /**
     * Present with lens.diffraction (2.1): the engine-built Airy profile, the equivalent environment sampled PSF
     * selection, and how it was applied. With `object-space-convolution` the site inputs declare no PSF and the
     * provider answers with the PSF-convolved radiance; putting `psf` into each site input and using the plain
     * scene provider gives the same expected signal (to float rounding) through the per-tap environment quadrature.
     */
    diffraction?: { profile: DiffractionLimitedPsfProfile; psf: Extract<CalculateEnvironmentSensorPhotoSignalInput["psf"], { kind: "sampled-local" }>;
      execution: "object-space-convolution" | "environment-psf-quadrature" };
  };
  exposure: {
    mode: SimulateCaptureExposureMode;
    settings: { fNumber: number; shutterSeconds: number; iso: number };
    /** Exposure value at ISO 100 of the settings, log2(N²/t). */
    ev100: number;
    meteredSceneLuminanceCdPerSquareMeter: number;
    /** Full output of the existing exposure-mode resolver. */
    resolution: unknown;
  };
  scene: {
    sceneId: string;
    preset: string;
    parameters: Readonly<Record<string, unknown>>;
    illuminant: { id: string; description: string; illuminanceLux: number };
    distanceM: number;
    /** Physical size of the framed scene plane, metres. */
    framedWidthM: number;
    framedHeightM: number;
    /**
     * SHA-256 of the canonical scene description, recorded as the capture source digest. Caller spectra (a
     * `spectrum` or `daylight` illuminant, chart reflectance spectra) are part of the description: tabulated
     * data exactly, function spectra sampled at 1 nm over 380-780 nm, plus the daylight basis datasetId.
     * The body of a caller scene's evaluate function is not hashed.
     */
    sourceSha256: string;
  };
  diagnostics: {
    providerEvaluationCount: number;
    highlight: RawHighlightDiagnostics;
    rendering: SdrRenderingResult["diagnostics"];
    /** Present with output.gamutMapping "perceptual": pixels whose chroma or lightness the mapping changed. */
    gamutMapping?: { method: "cielab-hue-preserving-chroma-compression"; kneeFraction: number; adjustedPixelCount: number; lightnessClippedPixelCount: number };
    /**
     * Wall-clock milliseconds per stage. `raw`, `whiteBalance` (the second RAW pass of auto white balance), `development`
     * (includes DNG writing), `jpeg` and `total` are whole milliseconds (`Date.now()`). Since 2.1, where a stage ran:
     * `diffraction` (the object-space convolution of `lens.diffraction`; part of `raw` and `whiteBalance`), `demosaic`
     * (the AHD demosaic; part of `development`) and `encode` (PNG, JPEG or DNG serialization), with sub-millisecond
     * resolution where the host has `performance.now()`. Timings vary from run to run and never enter any digest or output byte.
     */
    timingsMs: { raw: number; whiteBalance: number; development: number; jpeg: number; total: number; diffraction?: number; demosaic?: number; encode?: number };
    /**
     * 2.1: the opt-in options that changed the work of this run, in a fixed order (see `SIMULATE_CAPTURE_COST_OPTIONS`).
     * Empty for a capture with every default. With `timingsMs` it lets an application measure each option's cost on
     * the user's device.
     */
    options: readonly SimulateCaptureCostOption[];
  };
  provenance: {
    scientificStatus: "approximation";
    cameraPresetId: string;
    cameraPresetVersion: string;
    evidence: readonly EvidenceProvenance[];
    /** Existing engine contracts the facade composed, in execution order. */
    composedContracts: readonly string[];
    limitations: readonly string[];
  };
  assumptions: readonly SimulateCaptureAssumption[];
}

const FACADE_EVIDENCE: readonly EvidenceProvenance[] = Object.freeze([Object.freeze({ sourceOrigin: "photivra" as const,
  sourceReference: "photivra:simulate-capture-facade", reuseStatus: "photivra-owned" as const })]);
const DEFAULTS = Object.freeze({ camera: "professional" as const, fNumber: 8, shutterSeconds: 1 / 125, iso: 100, compensationStops: 0,
  subjectDistanceM: 5, width: 64, height: 64, format: "srgb-8" as const, toneCurve: "identity" as const, highlightMode: "clip" as const,
  whiteBalance: "scene-illuminant" as const, jpegQuantizationStep: 2, pixelPitchMicrometers: 6, spectralStepNanometers: 20,
  temporalSampleCount: 1, noiseSeed: 1, illuminantKelvin: 6500 });
/** Standard output sensitivity S = 10 / H (CIPA DC-004-2020 §3.2): the reference exposure in lx·s is 10 / S. */
const SOS_REFERENCE_EXPOSURE_NUMERATOR_LUX_SECONDS = 10;
/** Camera equation H = 0.65·L·t/N² (CIPA DC-004-2020 §5.5 (4); 0.65 = τ·π/4 with τ = 0.828, Explanation 4). */
const CAMERA_EQUATION_CONSTANT = 0.65;
/** Neutral reference reflectance: DC-004 ties the SOS reference level to an 18 % grey (Explanation 1 and 2.2). */
const GREY_CARD_REFLECTANCE = 0.18;
/** Scene luminance (cd/m²) whose focal-plane exposure 0.65·L·t/N² equals the SOS reference exposure 10/S. */
function sosReferenceLuminance(fNumber: number, shutterSeconds: number, iso: number): number {
  return SOS_REFERENCE_EXPOSURE_NUMERATOR_LUX_SECONDS * fNumber ** 2 / (CAMERA_EQUATION_CONSTANT * shutterSeconds * iso);
}
/**
 * Default illuminance, lux: an 18 % Lambertian grey card (L = 0.18·E/π) then gets exactly the CIPA DC-004 standard
 * output sensitivity reference exposure H = 10/S at f/8, 1/125 s, ISO 100:
 * E = π·10·N²/(0.65·t·S·0.18) = π·80 000/11.7 ≈ 21 480.98 lux.
 */
export const SIMULATE_CAPTURE_DEFAULT_ILLUMINANCE_LUX = Math.PI * sosReferenceLuminance(DEFAULTS.fNumber, DEFAULTS.shutterSeconds, DEFAULTS.iso) /
  GREY_CARD_REFLECTANCE;
/**
 * Sensitive-aperture area (µm²) at which the tier's ISO signal chain applies unchanged: the default 6 µm square
 * aperture with fill factor 1. At other areas the facade scales the electron-domain readout values by
 * area / this reference, so the same focal-plane exposure H gives the same output code (see `isoAreaScaledReadout`).
 */
const ISO_REFERENCE_APERTURE_AREA_SQUARE_MICROMETERS = DEFAULTS.pixelPitchMicrometers * DEFAULTS.pixelPitchMicrometers;
/** Demosaic border, native sites per side. */
const MARGIN = 1;
/**
 * AHD border, native sites per side: an AHD output pixel depends on sites up to 5 away (directional green ±2,
 * colour differences ±1 of it, the homogeneity's 4-neighbours and its 3 × 3 sum), so a 5-site rendered margin keeps
 * every output pixel off the plane's mirrored edge.
 */
const AHD_MARGIN = 5;
/** Sites whose values enter an AHD output pixel (interpolation reach), for the saturated-pixel count. */
const AHD_VALUE_REACH = 3;

/** Anti-aliasing filter limits: split points, and the largest offset in sites (bounds the scene work and the convolution margin). */
const AA_MAXIMUM_COMPONENTS = 16;
const AA_MAXIMUM_OFFSET_SITES = 4;
/** Default birefringent separation in sites: the two-spot MTF |cos(π·f·d)| then has its first zero at Nyquist, f = 1/(2·pitch). */
const AA_DEFAULT_SEPARATION_SITES = 1;
interface ParsedAntiAliasing { kind: SimulateCaptureSensorAntiAliasing["kind"]; separationSites?: number; axis?: "horizontal" | "vertical";
  components: AntiAliasingPointSplitComponent[] }
/** Parses `sensor.antiAliasing` into engine point-splitting components (offsets in µm, +x right, +y down). */
function parseAntiAliasing(value: unknown, pitch: number): ParsedAntiAliasing {
  requireInputObject(value, "sensor.antiAliasing");
  const kind = (value as { kind?: unknown }).kind;
  const separation = (record: Record<string, unknown>): number => {
    if (record.separationSites === undefined) return AA_DEFAULT_SEPARATION_SITES;
    const d = positive(record.separationSites, "sensor.antiAliasing.separationSites");
    if (d > AA_MAXIMUM_OFFSET_SITES) fail("sensor.antiAliasing.separationSites must be greater than 0 and at most " + AA_MAXIMUM_OFFSET_SITES + ".");
    return d;
  };
  if (kind === "four-spot") {
    const record = allowKeys(value, "sensor.antiAliasing", ["kind", "separationSites"]), d = separation(record), h = d * pitch / 2;
    return { kind, separationSites: d, components: [[-h, -h], [h, -h], [-h, h], [h, h]].map(([x, y]) => ({ offsetMicrometers: { x: x!, y: y! }, normalizedWeight: 0.25 })) };
  }
  if (kind === "two-spot") {
    const record = allowKeys(value, "sensor.antiAliasing", ["kind", "axis", "separationSites"]), d = separation(record), h = d * pitch / 2;
    if (record.axis !== "horizontal" && record.axis !== "vertical") fail("sensor.antiAliasing.axis must be horizontal or vertical.");
    const axis = record.axis as "horizontal" | "vertical";
    return { kind, axis, separationSites: d, components: [-h, h].map((o) => ({ offsetMicrometers: axis === "horizontal" ? { x: o, y: 0 } : { x: 0, y: o }, normalizedWeight: 0.5 })) };
  }
  if (kind === "point-splitting") {
    const record = allowKeys(value, "sensor.antiAliasing", ["kind", "components"]);
    if (!Array.isArray(record.components) || record.components.length === 0 || record.components.length > AA_MAXIMUM_COMPONENTS) {
      fail("sensor.antiAliasing.components must be an array of 1 to " + AA_MAXIMUM_COMPONENTS + " components.");
    }
    // The engine's optical-stack parser checks shape, finiteness, positive weights and the unit sum (1e-12).
    const kernel = resolveAntiAliasingSpatialKernel({ schemaVersion: "0.1.0", profileId: "facade-aa-check", evidence: FACADE_EVIDENCE,
      effectiveAntiAliasingSpatialResponse: { kind: "normalized-point-splitting-kernel", evidence: FACADE_EVIDENCE, coordinateSystem: "native-sensor-physical",
        scope: "field-wavelength-polarization-invariant-approximation", components: record.components as AntiAliasingPointSplitComponent[] } });
    for (const c of kernel.components) if (Math.max(Math.abs(c.offsetMicrometers.x), Math.abs(c.offsetMicrometers.y)) > AA_MAXIMUM_OFFSET_SITES * pitch) {
      fail("sensor.antiAliasing.components offsets must lie within " + AA_MAXIMUM_OFFSET_SITES + " sites (" + AA_MAXIMUM_OFFSET_SITES * pitch + " µm) of the site centre.");
    }
    return { kind, components: kernel.components.map((c) => ({ offsetMicrometers: { ...c.offsetMicrometers }, normalizedWeight: c.normalizedWeight })) };
  }
  return fail("sensor.antiAliasing.kind must be four-spot, two-spot or point-splitting.");
}

/** Third dark ring of the Airy pattern in units of λ·N_w (j₁,₃/π, j₁,₃ = 10.1734681351): the default diffraction kernel reach. */
const AIRY_THIRD_ZERO_PER_LAMBDA_N = 10.173468135062722 / Math.PI;
/** Default temporal midpoints when the camera rotates (2.0 motion option). */
const ROTATING_TEMPORAL_SAMPLE_COUNT = 8;
const IDS = Object.freeze({ frame: "facade-frame", mode: "native-still", cfa: "photivra-generic-bayer", binding: "facade-native-cfa",
  sceneState: "facade-scene-state", scene: "facade-scene", provider: "facade-provider", lights: "facade-lights", materials: "facade-materials",
  capture: "facade-capture", spectral: "facade-colorimetric-eqe", sampling: "facade-sampling", stack: "facade-no-aa", stackAa: "facade-aa",
  stationarity: "facade-stationarity", operatingState: "facade-operating-state", dark: "facade-dark", completeness: "facade-completeness",
  chargeSampling: "facade-charge-sampling", capacity: "facade-capacity" });
const CHANNELS = ["red", "green", "blue"] as const;
type Channel = typeof CHANNELS[number];
/**
 * Synthetic colorimetric sensor: channel EQE(λ) = a·cmf(λ)·(555 nm/λ), with cmf = x̄, ȳ, z̄. The λ factor turns
 * the energy-weighted CMF (colour-matching function) into a photon-counting response. So channel counts are
 * proportional to CIE XYZ (the Luther–Ives condition holds, up to quadrature error), and the camera→XYZ
 * matrix is diagonal.
 */
const EQE_SCALE: Readonly<Record<Channel, number>> = Object.freeze({ red: 0.5, green: 0.5, blue: 0.25 });
const CMF_KEY: Readonly<Record<Channel, "x" | "y" | "z">> = Object.freeze({ red: "x", green: "y", blue: "z" });
const CAMERA_TO_XYZ: readonly (readonly number[])[] = Object.freeze([[EQE_SCALE.green / EQE_SCALE.red, 0, 0], [0, 1, 0], [0, 0, EQE_SCALE.green / EQE_SCALE.blue]].map((r) => Object.freeze(r)));
const XYZ_TO_CAMERA = [[EQE_SCALE.red / EQE_SCALE.green, 0, 0], [0, 1, 0], [0, 0, EQE_SCALE.blue / EQE_SCALE.green]] as const;
/** Synthetic dark current per site at the operating temperature, e⁻/s. */
const DARK_CURRENT_ELECTRONS_PER_SECOND = 1;
const OPERATING_TEMPERATURE_C = 20;

function fail(message: string): never { throw new InvalidConfigurationError(message); }
type ReadoutProfile = GenericEquipmentTierPreset["body"]["readout"][number]["profile"];
/**
 * The readout profile with every regime's charge-domain transfer scaled by `areaScale`: system conversion gain
 * (e⁻ per code) and pre-ADC saturation (e⁻ equivalent) are multiplied by it, so codes per unit focal-plane exposure
 * stay those of the reference aperture. Read noise stays in electrons per pixel; codes, black level, ADC and digital
 * gain are unchanged. The result is re-checked by the readout parser.
 */
function isoAreaScaledReadout(profile: ReadoutProfile, areaScale: number): ReadoutProfile {
  return parseSensorReadoutConversionProfile({ ...profile, regimes: profile.regimes.map((regime) => ({ ...regime,
    systemConversionGainElectronsPerCode: { ...regime.systemConversionGainElectronsPerCode, value: regime.systemConversionGainElectronsPerCode.value * areaScale },
    preAdcSaturationElectronEquivalent: { ...regime.preAdcSaturationElectronEquivalent, value: regime.preAdcSaturationElectronEquivalent.value * areaScale } })) });
}
/** Diagnostic clock for the 2.1 stage timings: `performance.now()` where the host has it. Never affects output. */
function clockMs(): number { return globalThis.performance?.now() ?? Date.now(); }
function positive(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) fail(name + " must be a positive finite number.");
  return value as number;
}
function integerIn(value: unknown, name: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) fail(name + " must be an integer from " + minimum + " to " + maximum + ".");
  return value as number;
}
function allowKeys(value: unknown, name: string, keys: readonly string[]): Record<string, unknown> {
  if (value === undefined) return {};
  requireInputObject(value, name);
  for (const key of Object.keys(value as object)) if (!keys.includes(key)) fail("Unknown " + name + " field: " + key + ".");
  return value as Record<string, unknown>;
}
function sampled(values: readonly { nm: number; value: number }[]): { wavelengthUnit: "nm"; wavelengthBasis: "vacuum"; interpolation: "piecewise-linear";
  outsideRangeBehavior: "fail-closed"; evidence: readonly EvidenceProvenance[]; samples: { wavelengthNanometers: number; value: number }[] } {
  return { wavelengthUnit: "nm", wavelengthBasis: "vacuum", interpolation: "piecewise-linear", outsideRangeBehavior: "fail-closed", evidence: FACADE_EVIDENCE,
    samples: values.map((s) => ({ wavelengthNanometers: s.nm, value: s.value })) };
}
async function sha256Hex(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) fail("simulateCapture needs crypto.subtle (a secure browser context or Node 22+) to digest the scene description.");
  const bytes = new Uint8Array(await subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
/**
 * The form in which a caller spectrum enters the scene digest. Tabulated data is hashed exactly as its
 * (wavelength, value) pairs. A function spectrum has no data to hash, so it is sampled at the facade's
 * 1 nm integer nodes over 380-780 nm (the grid the facade also uses to normalize illuminance).
 */
function spectrumDigestForm(raw: unknown, prepared: PreparedColorimetricSpectrum): unknown {
  const record = raw as { kind?: unknown; samples?: readonly { wavelengthNanometers: number; value: number }[] };
  if (record.kind === "tabulated" && Array.isArray(record.samples)) {
    return { kind: "tabulated", samples: record.samples.map((sample) => [sample.wavelengthNanometers, sample.value]) };
  }
  const values: number[] = [];
  for (let nm = FACADE_SPECTRAL_RANGE_NANOMETERS.minimum; nm <= FACADE_SPECTRAL_RANGE_NANOMETERS.maximum; nm++) values.push(prepared.evaluate(nm));
  return { kind: "function-sampled-1nm", rangeNanometers: [FACADE_SPECTRAL_RANGE_NANOMETERS.minimum, FACADE_SPECTRAL_RANGE_NANOMETERS.maximum], values };
}
function luminanceOf(radiance: (nm: number) => number): number {
  let sum = 0;
  for (let nm = FACADE_SPECTRAL_RANGE_NANOMETERS.minimum; nm <= FACADE_SPECTRAL_RANGE_NANOMETERS.maximum; nm += 5) {
    const w = nm === FACADE_SPECTRAL_RANGE_NANOMETERS.minimum || nm === FACADE_SPECTRAL_RANGE_NANOMETERS.maximum ? 2.5 : 5;
    sum += w * radiance(nm) * estimateCie1931ColorMatchingFunctions(nm).y;
  }
  return PHOTOPIC_MAXIMUM_LUMINOUS_EFFICACY_LM_PER_W * sum;
}
function illuminantXyz(illuminant: ResolvedCaptureIlluminant): [number, number, number] {
  let x = 0, y = 0, z = 0;
  for (let nm = FACADE_SPECTRAL_RANGE_NANOMETERS.minimum; nm <= FACADE_SPECTRAL_RANGE_NANOMETERS.maximum; nm++) {
    const s = illuminant.shape.evaluate(nm), c = estimateCie1931ColorMatchingFunctions(nm);
    x += s * c.x; y += s * c.y; z += s * c.z;
  }
  return [x / y, 1, z / y];
}
/** Bilinear RGGB demosaic as explicit linear neighbourhood kernels (weights sum to one per output channel). */
function bilinearPhaseProfiles(): RawFrameReconstructionPhaseProfile[] {
  const cross = [[1, 0], [-1, 0], [0, 1], [0, -1]], diagonal = [[1, 1], [1, -1], [-1, 1], [-1, -1]], horizontal = [[1, 0], [-1, 0]], vertical = [[0, 1], [0, -1]];
  type Contribution = { offsetX: number; offsetY: number; sourceChannelId: Channel; weight: number };
  const average = (offsets: number[][], channel: Channel): Contribution[] => offsets.map(([x, y]) => ({ offsetX: x!, offsetY: y!, sourceChannelId: channel, weight: 1 / offsets.length }));
  const self = (channel: Channel): Contribution[] => [{ offsetX: 0, offsetY: 0, sourceChannelId: channel, weight: 1 }];
  const kernels: Record<string, Record<Channel, ReturnType<typeof self>>> = {
    "0,0": { red: self("red"), green: average(cross, "green"), blue: average(diagonal, "blue") },
    "1,0": { red: average(horizontal, "red"), green: self("green"), blue: average(vertical, "blue") },
    "0,1": { red: average(vertical, "red"), green: self("green"), blue: average(horizontal, "blue") },
    "1,1": { red: average(diagonal, "red"), green: average(cross, "green"), blue: self("blue") }
  };
  return [[0, 0], [1, 0], [0, 1], [1, 1]].map(([px, py], index) => ({ phaseX: px!, phaseY: py!, profile: { schemaVersion: "0.1.0" as const,
    profileId: "facade-bilinear-phase-" + index, profileVersion: "1", captureModeId: IDS.mode, colorSamplingProfileId: IDS.cfa,
    scientificStatus: "approximation" as const, method: "explicit-linear-native-neighborhood" as const,
    normalization: "weights-sum-to-one-per-output-channel" as const, negativeBlackSubtractedValuesAllowed: true,
    kernels: CHANNELS.map((c) => ({ outputChannelId: c, contributions: kernels[px + "," + py]![c] })), evidence: FACADE_EVIDENCE,
    limitations: ["Bilinear interpolation of the RGGB mosaic; no edge-directed demosaic, false-colour suppression or calibration."] } })) as unknown as RawFrameReconstructionPhaseProfile[];
}
function defaultProgramLine(): ExposureProgramLineProfile {
  // Generic educational program line written for the engine, relative to the f/8, 1/125 s reference. For less light
  // it first opens the aperture toward f/4, then lengthens the shutter. For more light it first closes toward
  // f/16, then shortens the shutter.
  return parseExposureProgramLineProfile({ schemaVersion: "0.1.0", profileId: "facade-generic-program-line", profileVersion: "1.0.0",
    scientificStatus: "approximation", policyKind: "generic-program-line", interpolation: "log2-aperture-shutter", evidence: FACADE_EVIDENCE,
    limitations: ["Generic educational program line authored for the capture facade; not any manufacturer's program."],
    nodes: [
      { nodeId: "minus-6", opticalExposureStopsFromReference: -6, aperture: 16, shutterSeconds: 1 / 2000 },
      { nodeId: "minus-2", opticalExposureStopsFromReference: -2, aperture: 16, shutterSeconds: 1 / 125 },
      { nodeId: "zero", opticalExposureStopsFromReference: 0, aperture: 8, shutterSeconds: 1 / 125 },
      { nodeId: "plus-2", opticalExposureStopsFromReference: 2, aperture: 4, shutterSeconds: 1 / 125 },
      { nodeId: "plus-9", opticalExposureStopsFromReference: 9, aperture: 4, shutterSeconds: 128 / 125 }
    ] });
}

/** PNG colour signalling: the sRGB chunk for sRGB, ITU-T H.273 code points through cICP otherwise. */
function pngColourEncoding(encoding: SimulateCaptureColorEncoding): PngColourEncoding {
  if (encoding === "srgb") return { kind: "srgb", renderingIntent: "perceptual" };
  if (encoding === "display-p3") return { kind: "cicp", primaries: "display-p3", transfer: "srgb", fullRange: true };
  return { kind: "cicp", primaries: "bt2020", transfer: "bt709", fullRange: true };
}
/**
 * Develops the packed RAW to unclipped linear sRGB/D65, using the exact operator inside
 * `createNativeRawDevelopmentTask`. Validation, demosaic kernels, border handling, per-site white-level
 * clipping, white balance, highlight mode and the camera→XYZ→linear-sRGB matrices are all the same. It
 * stops before tone mapping, gamut clipping and quantization. It reads the RAW without taking ownership.
 */
async function developLinearSrgb(input: NativeRawDevelopmentInput, afterRow: (completed: number, total: number) => Promise<void>,
  ahd?: { yieldControl: () => Promise<void>; checkAbort: () => void; onDemosaicMs?: (milliseconds: number) => void }): Promise<{ rgb: Float64Array; highlight: RawHighlightDiagnostics }> {
  const v = prepareNativeRawDevelopment(input), plan = v.plan, raw = input.raw, layout = plan.frame.colorSamplingProfile.layout;
  if (layout.kind !== "periodic-mosaic") fail("Development requires a periodic CFA.");
  const native = plan.exposure.geometry.nativeRaster, g = plan.exposure.resolvedGeometry, active = g.activeCapture.nativeRect;
  checkNativeRawIntegrity(raw, native.pixelWidth, layout.repeatWidthSites, layout.repeatHeightSites, 0, native.pixelHeight);
  const developer = createRawPixelDeveloper({ nativeWidth: native.pixelWidth, repeatWidth: layout.repeatWidthSites, repeatHeight: layout.repeatHeightSites,
    codes: raw.codes, blackLevels: raw.blackLevels, saturationFlags: raw.saturationFlags, whiteByPhase: raw.effectiveSaturationCodes }, v.phases, v.development, v.mirror);
  const width = v.raster.pixelWidth, height = v.raster.pixelHeight, rgb = new Float64Array(width * height * 3), row = new Float64Array(width * 3);
  const at = (x: number, y: number): { x: number; y: number } => {
    const q = transformOrientedRasterPointToNative({ point: { x: v.crop.x + x + 0.5, y: v.crop.y + y + 0.5 }, nativeRaster: g.activeCapture.raster, orientation: plan.exposure.geometry.orientation });
    return { x: Math.floor(q.x) + active.x, y: Math.floor(q.y) + active.y };
  };
  if (ahd) return developAhd(v, raw, layout.repeatWidthSites, layout.repeatHeightSites, width, height, at, afterRow, ahd);
  for (let y = 0; y < height; y++) {
    const first = at(0, y), second = width > 1 ? at(1, y) : first;
    developer.developRun(first.x, first.y, second.x - first.x, second.y - first.y, width, row);
    rgb.set(row, y * width * 3);
    await afterRow(y + 1, height);
  }
  const c = developer.counts;
  return { rgb, highlight: { mode: v.highlightMode, saturatedPixelCount: c.saturatedPixelCount, whiteBalanceClippedSampleCount: c.whiteBalanceClippedSampleCount,
    reconstructedPixelCount: c.reconstructedPixelCount } };
}
/**
 * AHD development (2.1): the same site normalization as the native development kernel (flagged or white-level sites
 * are 1, others (code − black)/(white − black)) on the whole native raster, demosaiced by `createAhdDemosaicTask`
 * (mirrored plane edges), then the native development's own colour operator (`developInto`: WB, highlight mode,
 * camera → XYZ → linear sRGB) per output pixel. The AHD homogeneity metric sees white-balanced colour: its
 * camera → XYZ matrix is the profile's matrix times the WB gains (the output values are not transformed by it).
 * The mosaic is stored in float32, as the AHD task requires.
 */
async function developAhd(v: ReturnType<typeof prepareNativeRawDevelopment>, raw: NativeRawOutput, repeatWidth: number, repeatHeight: number, width: number, height: number,
  at: (x: number, y: number) => { x: number; y: number }, afterRow: (completed: number, total: number) => Promise<void>,
  host: { yieldControl: () => Promise<void>; checkAbort: () => void; onDemosaicMs?: (milliseconds: number) => void }): Promise<{ rgb: Float64Array; highlight: RawHighlightDiagnostics }> {
  const native = v.plan.exposure.geometry.nativeRaster, W = native.pixelWidth, H = native.pixelHeight;
  const source: RawDevelopmentSource = { nativeWidth: W, repeatWidth, repeatHeight, codes: raw.codes, blackLevels: raw.blackLevels,
    saturationFlags: raw.saturationFlags, whiteByPhase: raw.effectiveSaturationCodes };
  const samples = new Float32Array(W * H), saturated = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    samples[y * W + x] = normalizedRawSite(source, x, y);
    if (rawSiteSaturated(source, x, y)) saturated[y * W + x] = 1;
  }
  const intent = v.plan.exposure.whiteBalanceIntent, gains = intent ? [intent.channelGains.red, intent.channelGains.green, intent.channelGains.blue] : [1, 1, 1];
  const m = v.color.normalizedCameraChannelsToXyz;
  const cameraToXyz = [0, 1, 2].map((r) => [0, 1, 2].map((c) => m[r]![c]! * gains[c]!)) as unknown as ColorMatrix3x3;
  // A caller-raised pixel limit already bounds the raster, so its working memory is not capped again at the 1 GiB default.
  const task = createAhdDemosaicTask({ plane: { width: W, height: H, captureModeId: v.plan.frame.modeId, colorSamplingProfile: v.plan.frame.colorSamplingProfile, samples },
    channelRoles: { red: "red", green: "green", blue: "blue" }, cameraToXyz, ...(v.plan.maximumPixels === undefined ? {} : { maximumWorkingBytes: Number.MAX_SAFE_INTEGER }) }, { yieldControl: async () => { await host.yieldControl(); host.checkAbort(); } });
  const demosaicStarted = clockMs();
  await task.run();
  host.onDemosaicMs?.(clockMs() - demosaicStarted);
  const demosaiced = task.takeOutput().data, rgb = new Float64Array(width * height * 3);
  const counts = { saturatedPixelCount: 0, whiteBalanceClippedSampleCount: 0, reconstructedPixelCount: 0 };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = at(x, y), i = p.y * W + p.x;
      let clipped = false;
      for (let dy = -AHD_VALUE_REACH; dy <= AHD_VALUE_REACH && !clipped; dy++) for (let dx = -AHD_VALUE_REACH; dx <= AHD_VALUE_REACH; dx++) {
        const sx = p.x + dx, sy = p.y + dy;
        if (sx >= 0 && sy >= 0 && sx < W && sy < H && saturated[sy * W + sx] !== 0) { clipped = true; break; }
      }
      if (clipped) counts.saturatedPixelCount++;
      v.development.developInto(demosaiced[3 * i]!, demosaiced[3 * i + 1]!, demosaiced[3 * i + 2]!, rgb, (y * width + x) * 3, counts);
    }
    await afterRow(y + 1, height);
  }
  return { rgb, highlight: { mode: v.highlightMode, saturatedPixelCount: counts.saturatedPixelCount, whiteBalanceClippedSampleCount: counts.whiteBalanceClippedSampleCount,
    reconstructedPixelCount: counts.reconstructedPixelCount } };
}
/** Linear sRGB/D65 → CIE XYZ (inverse of the development's XYZ → sRGB matrix) → linear target RGB/D65. */
function linearSrgbToTarget(target: "srgb" | "display-p3" | "rec2020"): readonly (readonly number[])[] {
  return multiplyMatrices(resolveRgbColorSpace(target).value.xyzToRgb, resolveCaptureColorModel().cameraRgbToXyz as unknown as ColorMatrix3x3);
}
/** Knee of the `perceptual` gamut mapping: chroma below 90 % of the gamut-boundary chroma (at constant L*, h) is untouched. */
const PERCEPTUAL_GAMUT_KNEE_FRACTION = 0.9;
/**
 * SDR encoding from linear sRGB/D65:
 * 1. Convert to the target primaries with a matrix.
 * 2. Either clip each component to [0, 1], or, with `mapping`, compress chroma while keeping CIELAB hue
 *    and lightness (`prepareRgbGamutMapping`).
 * 3. Apply the target transfer function and round to the nearest code (ties round up).
 */
function encodeSdrFromLinear(rgb: Float64Array, encoding: "srgb" | "display-p3" | "rec2020", bitDepth: 8 | 16, mapping?: PreparedRgbGamutMapping):
  { samples: Uint8Array | Uint16Array; diagnostics: SdrRenderingResult["diagnostics"]; adjustedPixelCount: number; lightnessClippedPixelCount: number } {
  const m = linearSrgbToTarget(encoding), toXyz = resolveCaptureColorModel().cameraRgbToXyz, maximum = 2 ** bitDepth - 1;
  const transfer = encoding === "rec2020" ? evaluateBt709Oetf : evaluateSrgbEncoding;
  const samples = bitDepth === 8 ? new Uint8Array(rgb.length) : new Uint16Array(rgb.length);
  let low = 0, high = 0, adjusted = 0, lightnessClipped = 0;
  for (let i = 0; i < rgb.length; i += 3) {
    const r = rgb[i]!, g = rgb[i + 1]!, b = rgb[i + 2]!;
    if (mapping) {
      const xyz = [0, 1, 2].map((k) => toXyz[k]![0]! * r + toXyz[k]![1]! * g + toXyz[k]![2]! * b) as unknown as ColorVector3;
      const mapped = mapping.map(xyz);
      if (mapped.adjusted) adjusted++;
      if (mapped.lightnessClipped) lightnessClipped++;
      for (let k = 0; k < 3; k++) samples[i + k] = Math.floor(transfer(mapped.linearRgb[k]!) * maximum + 0.5);
      continue;
    }
    for (let k = 0; k < 3; k++) {
      const row = m[k]!;
      let value = row[0]! * r + row[1]! * g + row[2]! * b;
      if (value < 0) { value = 0; low++; } else if (value > 1) { value = 1; high++; }
      samples[i + k] = Math.floor(transfer(value) * maximum + 0.5);
    }
  }
  return { samples, adjustedPixelCount: adjusted, lightnessClippedPixelCount: lightnessClipped, diagnostics: { renderingNegativeSampleCount: low,
    renderingAboveReferenceSampleCount: high, toneChangedSampleCount: 0, gamutClippedLowSampleCount: low, gamutClippedHighSampleCount: high, captureSaturation: "consumed-in-raw-development" } };
}

/**
 * Simulates one still capture of a planar scene and returns the developed image, the packed RAW, the full
 * underlying request/plan, provenance and every assumption made. See docs/QUICK_START.md.
 */
export async function simulateCapture(options: SimulateCaptureOptions): Promise<SimulateCaptureResult> {
  const started = Date.now();
  requireInputObject(options, "simulateCapture options");
  const top = allowKeys(options, "simulateCapture options", ["camera", "lens", "exposure", "scene", "subjectDistanceM", "illuminant",
    "illuminanceLux", "output", "sensor", "motion", "signal", "onProgress"]);
  const signal = top.signal as AbortSignal | undefined, onProgress = top.onProgress as SimulateCaptureOptions["onProgress"];
  if (signal !== undefined && (typeof signal !== "object" || signal === null || typeof (signal as AbortSignal).aborted !== "boolean")) fail("signal must be an AbortSignal.");
  if (onProgress !== undefined && typeof onProgress !== "function") fail("onProgress must be a function.");
  const assumptions: SimulateCaptureAssumption[] = [];
  const assume = (id: string, kind: SimulateCaptureAssumption["kind"], value: unknown, explanation: string): void => { assumptions.push({ id, kind, value, explanation }); };
  function pick<T>(record: Record<string, unknown>, key: string, path: string, fallback: T, explanation: string): T {
    if (record[key] !== undefined) return record[key] as T;
    assume(path, "default", fallback, explanation);
    return fallback;
  }
  const checkAbort = (): void => { if (signal?.aborted) fail("simulateCapture aborted."); };
  checkAbort();

  // Camera
  const cameraOption = pick<GenericEquipmentTier | GenericEquipmentTierPreset>(top, "camera", "camera", DEFAULTS.camera,
    "Generic Photivra tier preset 2.0.0 (synthetic educational values, not a real camera).");
  let preset: GenericEquipmentTierPreset;
  if (typeof cameraOption === "string") preset = GENERIC_TIER_ASSETS.find((p) => p.tier === cameraOption) ?? fail("Unknown camera tier.");
  else preset = parseCallerCameraPreset(cameraOption);
  const body = preset.body, lens = preset.lens;

  // Lens
  const lensOptions = allowKeys(top.lens, "lens", ["focalLengthMm", "fNumber", "focusDistanceM", "pupilSampling", "projection", "distortion", "vignetting", "psf", "diffraction"]);
  const focalDefault = lens.exposure.focalLengthMmRange.value.minimum;
  const focalLengthMm = positive(pick(lensOptions, "focalLengthMm", "lens.focalLengthMm", focalDefault, "The preset lens's focal length (the generic primes are 50 mm)."), "lens.focalLengthMm");
  const capabilities = resolveGenericEquipmentExposureCapabilities({ bodyProfile: body.exposure, lensProfile: lens.exposure, selectedFocalLengthMm: focalLengthMm });
  const subjectDistanceM = positive(pick(top, "subjectDistanceM", "subjectDistanceM", DEFAULTS.subjectDistanceM, "Scene plane 5 m in front of the camera (the generic tiers' reference focus distance)."), "subjectDistanceM");
  if (subjectDistanceM * 1000 <= focalLengthMm * 2) fail("subjectDistanceM must exceed twice the focal length.");
  const focusDistanceM = positive(pick(lensOptions, "focusDistanceM", "lens.focusDistanceM", subjectDistanceM, "Focused on the scene plane."), "lens.focusDistanceM");
  if (focusDistanceM * 1000 <= focalLengthMm) fail("lens.focusDistanceM must exceed the focal length.");
  let pupil: { radialSamples: number; angularSamples: number } | undefined;
  if (lensOptions.pupilSampling === undefined) assume("lens.pupilSampling", "default", null,
    "No pupil sampling: each scene query follows the central (chief) ray, so defocus and depth of field are not rendered. Enable lens.pupilSampling for an ideal circular pupil.");
  else {
    const p = allowKeys(lensOptions.pupilSampling, "lens.pupilSampling", ["radialSamples", "angularSamples"]);
    // The environment pupil contract admits 4..64 azimuthal midpoints and at most 256 rays.
    pupil = { radialSamples: integerIn(p.radialSamples, "lens.pupilSampling.radialSamples", 1, 16), angularSamples: integerIn(p.angularSamples, "lens.pupilSampling.angularSamples", 4, 64) };
    if (pupil.radialSamples * pupil.angularSamples > 256) fail("lens.pupilSampling needs at most 256 rays (radialSamples × angularSamples).");
  }
  // 2.0 optics hooks: only what the environment site contract accepts.
  const projection: LensProjectionModel | undefined = lensOptions.projection === undefined ? undefined : parseLensProjectionModel(lensOptions.projection);
  let distortion: SimulateCaptureLensDistortion | undefined;
  if (lensOptions.distortion !== undefined) {
    const d = allowKeys(lensOptions.distortion, "lens.distortion", ["kind", "profile"]);
    if (d.kind !== "radial" && d.kind !== "brown-conrady") fail("lens.distortion.kind must be radial or brown-conrady.");
    distortion = d as unknown as SimulateCaptureLensDistortion;
  }
  const lensFieldMapping: EnvironmentLensFieldMapping | undefined = projection === undefined && distortion === undefined ? undefined :
    { projectionModel: projection ?? "rectilinear", distortion: distortion ?? { kind: "none" }, radiometricAreaCorrection: "inverse-distortion-jacobian" };
  if (lensFieldMapping) {
    if (pupil) fail("lens.projection and lens.distortion cannot be combined with lens.pupilSampling: ideal pupil rays use the rectilinear, distortion-free projection.");
    try { prepareEnvironmentLensFieldMapping(lensFieldMapping); } catch (error) { fail("Invalid lens projection or distortion: " + (error as Error).message); }
  }
  let vignetting: IlluminationVignettingProfile | undefined;
  if (lensOptions.vignetting !== undefined) { requireInputObject(lensOptions.vignetting, "lens.vignetting"); vignetting = lensOptions.vignetting as IlluminationVignettingProfile; }
  let lensPsf: NonNullable<NonNullable<SimulateCaptureOptions["lens"]>["psf"]> | undefined;
  if (lensOptions.psf !== undefined) {
    const p = allowKeys(lensOptions.psf, "lens.psf", ["kind", "configuration"]);
    if (p.kind !== "sampled-local") fail("lens.psf.kind must be sampled-local.");
    requireInputObject(p.configuration, "lens.psf.configuration");
    if (pupil) fail("lens.psf cannot be combined with lens.pupilSampling: geometric defocus would be counted twice.");
    lensPsf = p as unknown as typeof lensPsf;
  }
  // Diffraction (2.1): validated here, built once the f-number is resolved.
  let diffractionRadiusOption: number | null | undefined;
  if (lensOptions.diffraction !== undefined) {
    const d = lensOptions.diffraction;
    if (d === "circular-aperture") diffractionRadiusOption = null;
    else {
      const record = allowKeys(d, "lens.diffraction", ["aperture", "kernelRadiusSamples"]);
      if (record.aperture !== "circular-aperture") fail("lens.diffraction must be \"circular-aperture\" or { aperture: \"circular-aperture\", kernelRadiusSamples }.");
      diffractionRadiusOption = record.kernelRadiusSamples === undefined ? null : integerIn(record.kernelRadiusSamples, "lens.diffraction.kernelRadiusSamples", 0, 32);
    }
    if (lensPsf) fail("lens.diffraction cannot be combined with lens.psf: diffraction would be counted twice.");
    if (pupil) fail("lens.diffraction cannot be combined with lens.pupilSampling: the environment contract does not mix a sampled PSF with pupil rays.");
  }

  // Motion (2.0): constant camera rotation and the shutter type.
  const motionOptions = allowKeys(top.motion, "motion", ["angularVelocityRadPerSec", "shutter", "rollingShutterSkewSeconds"]);
  const angular = { pitch: 0, yaw: 0, roll: 0 };
  if (motionOptions.angularVelocityRadPerSec !== undefined) {
    const a = allowKeys(motionOptions.angularVelocityRadPerSec, "motion.angularVelocityRadPerSec", ["pitch", "yaw", "roll"]);
    for (const axis of ["pitch", "yaw", "roll"] as const) if (a[axis] !== undefined) {
      const value = a[axis];
      if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 100) fail("motion.angularVelocityRadPerSec." + axis + " must be a finite number within ±100 rad/s.");
      angular[axis] = value as number;
    }
  }
  const rotating = angular.pitch !== 0 || angular.yaw !== 0 || angular.roll !== 0;
  const shutterKind = motionOptions.shutter === undefined ? "global" : motionOptions.shutter;
  if (shutterKind !== "global" && shutterKind !== "rolling") fail("motion.shutter must be global or rolling.");
  if (motionOptions.rollingShutterSkewSeconds !== undefined && shutterKind !== "rolling") fail("motion.rollingShutterSkewSeconds needs motion.shutter \"rolling\".");
  const rollingSkewOption = motionOptions.rollingShutterSkewSeconds === undefined ? undefined : positive(motionOptions.rollingShutterSkewSeconds, "motion.rollingShutterSkewSeconds");
  // Diffraction runs as an object-space convolution when every PSF tap's source is another site centre seen
  // through one linear map (still camera, rectilinear, no distortion or field throughput); otherwise per tap.
  const diffractionObjectSpace = diffractionRadiusOption !== undefined && !rotating && !lensFieldMapping && !vignetting;

  // Output and sensor
  const outputOptions = allowKeys(top.output, "output", ["width", "height", "format", "toneCurve", "toneCurveParameters", "highlightMode", "whiteBalance", "jpegQuantizationStep",
    "colorEncoding", "bitDepth", "gamutMapping", "demosaic", "borderHandling", "dng", "maximumPixels"]);
  // Opt-in large images: a caller-raised native pixel limit. Without it the 4094-pixel sides are unchanged.
  const raisedPixels = outputOptions.maximumPixels === undefined ? undefined : integerIn(outputOptions.maximumPixels, "output.maximumPixels", 1, NATIVE_RAW_LIMITS.ceilingPixels);
  const maximumSide = raisedPixels === undefined ? 4094 : NATIVE_RAW_LIMITS.maximumDimension;
  const width = integerIn(pick(outputOptions, "width", "output.width", DEFAULTS.width, "64 × 64 output pixels."), "output.width", 1, maximumSide);
  const height = integerIn(pick(outputOptions, "height", "output.height", DEFAULTS.height, "64 × 64 output pixels."), "output.height", 1, maximumSide);
  const format = pick<SimulateCaptureOutputFormat>(outputOptions, "format", "output.format", DEFAULTS.format, "8-bit sRGB samples.");
  if (!["srgb-8", "srgb-16", "jpeg", "png", "dng"].includes(format)) fail("output.format must be srgb-8, srgb-16, jpeg, png or dng.");
  let dngCapturedAtUtc: string | undefined;
  if (format === "dng") {
    const d = allowKeys(outputOptions.dng, "output.dng", ["capturedAtUtc"]);
    dngCapturedAtUtc = d.capturedAtUtc as string | undefined;
    if (dngCapturedAtUtc === undefined) assume("output.dng.capturedAtUtc", "default", null, "No capture time: the DNG carries no DateTimeOriginal (the engine never invents a wall clock).");
  } else if (outputOptions.dng !== undefined) fail("output.dng applies only to output.format \"dng\".");
  let colorEncoding: SimulateCaptureColorEncoding | undefined, pngBitDepth: 8 | 16 | undefined;
  if (format === "png") {
    colorEncoding = pick<SimulateCaptureColorEncoding>(outputOptions, "colorEncoding", "output.colorEncoding", "srgb",
      "sRGB (W3C CSS Color 4 srgb) samples signalled with the PNG sRGB chunk (perceptual intent) and its prescribed gAMA/cHRM values.");
    if (!["srgb", "display-p3", "rec2020"].includes(colorEncoding)) fail("output.colorEncoding must be srgb, display-p3 or rec2020.");
    pngBitDepth = pick<8 | 16>(outputOptions, "bitDepth", "output.bitDepth", 8, "8 bits per sample.");
    if (pngBitDepth !== 8 && pngBitDepth !== 16) fail("output.bitDepth must be 8 or 16.");
  } else if (outputOptions.colorEncoding !== undefined || outputOptions.bitDepth !== undefined) fail("output.colorEncoding and output.bitDepth apply only to output.format \"png\".");
  let perceptual = false;
  if (format === "png") {
    const gamutMapping = pick<"clip" | "perceptual">(outputOptions, "gamutMapping", "output.gamutMapping", "clip", "Out-of-gamut components are clipped to [0, 1] in the target space.");
    if (gamutMapping !== "clip" && gamutMapping !== "perceptual") fail("output.gamutMapping must be clip or perceptual.");
    perceptual = gamutMapping === "perceptual";
  } else if (outputOptions.gamutMapping !== undefined) fail("output.gamutMapping applies only to output.format \"png\".");
  const wideGamut = colorEncoding !== undefined && colorEncoding !== "srgb";
  // The linear development path serves wide-gamut encodings and perceptual gamut mapping.
  const linearPath = wideGamut || perceptual;
  const toneCurve = pick<SdrToneCurve>(outputOptions, "toneCurve", "output.toneCurve", DEFAULTS.toneCurve, "Identity tone curve: scene-linear values are clipped at display white, then sRGB-encoded.");
  if (linearPath && toneCurve !== "identity") fail("output.toneCurve other than identity is available only for sRGB output; wide-gamut encodings are converted from the linear developed colour.");
  const highlightMode = pick<RawHighlightMode>(outputOptions, "highlightMode", "output.highlightMode", DEFAULTS.highlightMode, "Saturated RAW highlights are clipped to neutral.");
  const whiteBalanceOption = pick<SimulateCaptureWhiteBalance>(outputOptions, "whiteBalance", "output.whiteBalance", DEFAULTS.whiteBalance,
    "White balance measured from a perfect white diffuser under the scene illuminant (a custom/grey-card white balance).");
  const jpegStep = format === "jpeg" ? integerIn(pick(outputOptions, "jpegQuantizationStep", "output.jpegQuantizationStep", DEFAULTS.jpegQuantizationStep,
    "Constant JPEG quantization step 2 (not a manufacturer quality scale)."), "output.jpegQuantizationStep", 1, 255) : undefined;
  if (format !== "jpeg" && outputOptions.jpegQuantizationStep !== undefined) fail("output.jpegQuantizationStep applies only to output.format \"jpeg\".");
  const sensorOptions = allowKeys(top.sensor, "sensor", ["pixelPitchMicrometers", "spectralStepNanometers", "temporalSampleCount", "noiseSeed", "antiAliasing"]);
  const pitch = positive(pick(sensorOptions, "pixelPitchMicrometers", "sensor.pixelPitchMicrometers", DEFAULTS.pixelPitchMicrometers,
    "6 µm pixels (about a 24 MP full-frame sensor). The simulated sensor is width × pitch wide, so small images are a central crop of a large sensor, not a downscaled full frame."), "sensor.pixelPitchMicrometers");
  if (pitch < 0.5 || pitch > 100) fail("sensor.pixelPitchMicrometers must be 0.5-100.");
  const spectralStep = positive(pick(sensorOptions, "spectralStepNanometers", "sensor.spectralStepNanometers", DEFAULTS.spectralStepNanometers,
    "Spectral midpoint quadrature over 380-780 nm with subintervals of at most 20 nm."), "sensor.spectralStepNanometers");
  if (spectralStep < 1 || spectralStep > 100) fail("sensor.spectralStepNanometers must be 1-100.");
  const temporalSampleCount = integerIn(rotating ? pick(sensorOptions, "temporalSampleCount", "sensor.temporalSampleCount", ROTATING_TEMPORAL_SAMPLE_COUNT,
    "Eight temporal midpoints across each site's exposure window sample the camera rotation (motion blur); raise it for long exposures or fast rotation.") :
    pick(sensorOptions, "temporalSampleCount", "sensor.temporalSampleCount", DEFAULTS.temporalSampleCount,
      "One temporal sample: the static scene and still camera make more samples unnecessary."), "sensor.temporalSampleCount", 1, 256);
  const noiseSeed = integerIn(pick(sensorOptions, "noiseSeed", "sensor.noiseSeed", DEFAULTS.noiseSeed, "Fixed noise seed 1 (deterministic output)."), "sensor.noiseSeed", 0, 0xffffffff);
  const antiAliasing = sensorOptions.antiAliasing === undefined ? undefined : parseAntiAliasing(sensorOptions.antiAliasing, pitch);

  const colorSamplingProfile = { schemaVersion: "0.1.0" as const, profileId: IDS.cfa, evidence: FACADE_EVIDENCE, coordinateSystem: "native-sensor-color-sampling-site-index" as const,
    layout: { kind: "periodic-mosaic" as const, repeatWidthSites: 2, repeatHeightSites: 2, siteChannelIds: ["red", "green", "green", "blue"], anchor: "native-sensor-top-left-site" as const } };
  // Demosaic (2.0): built-in Bayer kernels and border handling. Omitted, the 1.0 bilinear kernels and a
  // one-site rendered border are used unchanged.
  const demosaicOption = outputOptions.demosaic as SimulateCaptureDemosaic | undefined, borderOption = outputOptions.borderHandling as SimulateCaptureBorderHandling | undefined;
  if (demosaicOption !== undefined && demosaicOption !== "bilinear" && demosaicOption !== "ahd") fail("output.demosaic must be bilinear or ahd.");
  const ahd = demosaicOption === "ahd";
  if (borderOption !== undefined && borderOption !== "margin" && borderOption !== "mirror") fail("output.borderHandling must be margin or mirror.");
  const builtInDemosaic = demosaicOption === undefined ? undefined : createBuiltInBayerDemosaicProfiles({ kernel: "bilinear",
    captureModeId: IDS.mode, colorSamplingProfile, channelRoles: { red: "red", green: "green", blue: "blue" } }).value;
  const mirrorBorder = borderOption === "mirror";
  const margin = mirrorBorder ? 0 : ahd ? AHD_MARGIN : builtInDemosaic ? builtInDemosaic.kernelReachSites : MARGIN;
  if (mirrorBorder && (width < 2 || height < 2)) fail("output.borderHandling \"mirror\" needs an output of at least 2 × 2 pixels.");
  if (ahd && mirrorBorder && (width < 3 || height < 3)) fail("output.demosaic \"ahd\" with mirror borders needs an output of at least 3 × 3 pixels.");

  // Geometry: the demosaic border (if any) on each side; output crop is the active area.
  const nativeWidth = width + 2 * margin, nativeHeight = height + 2 * margin;
  if (raisedPixels !== undefined) {
    if (nativeWidth > NATIVE_RAW_LIMITS.maximumDimension || nativeHeight > NATIVE_RAW_LIMITS.maximumDimension || nativeWidth * nativeHeight > raisedPixels) {
      fail("output.maximumPixels (" + raisedPixels + ") must cover the native sensor raster of " + nativeWidth + " × " + nativeHeight +
        " sites (the output plus the demosaic margin), at most " + NATIVE_RAW_LIMITS.maximumDimension + " per side.");
    }
    if (ahd && nativeWidth * nativeHeight > PROCESSING_MAX_PIXELS) fail("output.demosaic \"ahd\" admits at most " + PROCESSING_MAX_PIXELS + " native sites.");
  }
  const imagingArea = { widthMm: nativeWidth * pitch / 1000, heightMm: nativeHeight * pitch / 1000 };
  const geometry = { imagingArea, nativeRaster: { pixelWidth: nativeWidth, pixelHeight: nativeHeight }, orientation: "landscape" as const,
    activeCaptureRect: { x: margin, y: margin, width, height }, outputRaster: { pixelWidth: width, pixelHeight: height } };
  const resolvedGeometry = resolveCaptureGeometry(geometry).value;
  const imageDistanceMm = focalLengthMm * focusDistanceM * 1000 / (focusDistanceM * 1000 - focalLengthMm);
  const metresPerFrameUnit = (width * pitch / 2000) * subjectDistanceM / imageDistanceMm;
  const aspect = height / width;
  assume("scene.framing", "derived", { framedWidthM: 2 * metresPerFrameUnit, framedHeightM: 2 * metresPerFrameUnit * aspect },
    "The scene plane is perpendicular to the optical axis and the chart is sized to fill the active frame exactly.");
  if (demosaicOption === undefined && borderOption === undefined) {
    assume("output.demosaic", "model", "bilinear-rggb", "Bilinear RGGB demosaic through explicit linear kernels; the native raster has a one-site border on each side so every output pixel has full support.");
  } else {
    if (demosaicOption === undefined) assume("output.demosaic", "default", "bilinear-rggb", "The 1.0 facade's bilinear RGGB kernels (explicit linear neighbourhood weights).");
    else if (ahd) assume("output.demosaic", "model", { method: "ahd-hirakawa-parks-2005", dependenceReachSites: AHD_MARGIN },
      "Adaptive homogeneity-directed demosaicing (createAhdDemosaicTask, after Hirakawa & Parks, IEEE TIP 14(3), 2005): directional green, red/blue from colour differences, and per pixel the more homogeneous of the horizontal and vertical candidates in CIELAB (white-balanced camera colour); the paper's iterative median step is not applied. Non-linear; the mosaic is normalized and white-level clipped as in the native development and stored in float32, and the native development's colour operator follows. request.development keeps the built-in bilinear kernels, which validate the development but are not used for these pixels.");
    else assume("output.demosaic", "model", { kernel: builtInDemosaic!.kernel, modelVersion: BUILT_IN_DEMOSAIC_VERSION, kernelReachSites: builtInDemosaic!.kernelReachSites },
      "Built-in bilinear Bayer kernels (createBuiltInBayerDemosaicProfiles): nearest same-channel averages.");
    if (borderOption === undefined) assume("output.borderHandling", "default", "margin", "The native raster adds the kernel reach (" + margin + " site(s)) on each side, so every output pixel is reconstructed from rendered sites.");
    else assume("output.borderHandling", "model", borderOption, mirrorBorder ?
      "No rendered border: the native raster equals the output and reconstruction reads reflect-101 mirror images of the missing sites (CFA consistency validated), so edge pixels use mirrored rather than rendered neighbours." :
      "The native raster adds the kernel reach (" + margin + " site(s)) on each side, so every output pixel is reconstructed from rendered sites.");
  }

  // Radiance queries per native site: spectral subintervals × temporal midpoints × pupil rays × PSF taps.
  const psfTaps = lensPsf ? Math.max(1, ...((lensPsf.configuration.psf.profile.nodes ?? []) as readonly { kernel?: { widthSamples?: unknown; heightSamples?: unknown } }[])
    .map((node) => Number(node.kernel?.widthSamples) * Number(node.kernel?.heightSamples)).filter((taps) => Number.isSafeInteger(taps) && taps > 0)) : 1;
  const queriesPerSite = temporalSampleCount * (Math.ceil((FACADE_SPECTRAL_RANGE_NANOMETERS.maximum - FACADE_SPECTRAL_RANGE_NANOMETERS.minimum) / spectralStep) + 1) *
    (pupil ? pupil.radialSamples * pupil.angularSamples : 1) * psfTaps * (antiAliasing ? antiAliasing.components.length : 1);

  // Scene and illuminant
  // The scene is the one required input: the facade never guesses what is being photographed.
  if (top.scene === undefined) fail("simulateCapture needs a scene, for example { preset: \"uniform\" } (an 18 % grey card) or { preset: \"slanted-edge\" }.");
  const sceneOption = top.scene;
  requireInputObject(sceneOption, "scene");
  const illuminantOption = pick<CaptureIlluminant>(top, "illuminant", "illuminant", { kind: "planckian", temperatureKelvin: DEFAULTS.illuminantKelvin },
    "Planckian (blackbody) 6500 K as a stand-in for daylight. CIE D65 is not bundled; pass its S0/S1/S2 basis as a daylight illuminant to use it.");
  const illuminant = resolveCaptureIlluminant(illuminantOption);
  const illuminanceLux = positive(pick(top, "illuminanceLux", "illuminanceLux", SIMULATE_CAPTURE_DEFAULT_ILLUMINANCE_LUX,
    "π·10·N²/(0.65·t·S·0.18) lux at f/8, 1/125 s, ISO 100 (CIPA DC-004 standard output sensitivity H = 10/S and camera equation H = 0.65·L·t/N²): an 18 % grey card then gets the reference exposure for the default settings. It does not follow the caller's exposure settings."), "illuminanceLux");
  const irradianceScale = calculateIlluminantIrradianceScale(illuminant.shape, illuminanceLux);
  let chart: ResolvedChartScene | undefined, callerScene: CallerReflectanceScene | CallerRadianceScene | undefined;
  const sceneRecord = sceneOption as Record<string, unknown>;
  if ("kind" in sceneRecord) {
    callerScene = requireCallerScene(sceneOption);
  } else {
    chart = resolveChartScene({ scene: sceneOption as ChartScene, aspect });
    for (const key of chart.defaultedParameters) assume("scene." + key, "default", chart.parameters[key], "Chart default for " + chart.preset + ".");
  }
  const scenePreset = chart ? chart.preset : callerScene!.kind;
  // Caller spectra enter the digest as data (see spectrumDigestForm). Without caller spectra the description is unchanged,
  // so default captures keep their digests.
  const illuminantRecord = typeof illuminantOption === "object" ? illuminantOption as { kind?: unknown; basis?: { datasetId?: unknown } } : undefined;
  const illuminantSpectrum = illuminantRecord?.kind === "spectrum" ? { spectrum: spectrumDigestForm(illuminant.spectrum, illuminant.shape) } :
    illuminantRecord?.kind === "daylight" ? { basisDatasetId: illuminantRecord.basis?.datasetId, spectrum: spectrumDigestForm(illuminant.spectrum, illuminant.shape) } : undefined;
  const sceneSpectra = chart ? chart.materials.flatMap((m, index) => {
    if (m.kind !== "spectrum") return [];
    const raw = chart!.preset === "uniform" ? sceneRecord.reflectance : (sceneRecord.patches as readonly { reflectance: unknown }[])[index]!.reflectance;
    return [{ material: index, spectrum: spectrumDigestForm(raw, m.spectrum) }];
  }) : [];
  const sceneDescription = { facadeVersion: SIMULATE_CAPTURE_FACADE_VERSION, scene: chart ? { preset: chart.preset, parameters: chart.parameters } :
    { kind: callerScene!.kind, sceneId: callerScene!.sceneId }, illuminant: illuminant.id, illuminanceLux, subjectDistanceM, framedWidthM: 2 * metresPerFrameUnit, aspect,
    ...(illuminantSpectrum === undefined ? {} : { illuminantSpectrum }), ...(sceneSpectra.length === 0 ? {} : { sceneSpectra }) };
  if (callerScene) assume("scene.digest", "model", "caller-function-not-hashed", "The source digest covers the caller's sceneId and the framing, not the body of the caller's evaluate function.");
  const sourceSha256 = await sha256Hex(JSON.stringify(sceneDescription, (_key, value: unknown) => (typeof value === "object" && value !== null && "evaluate" in value ? "caller-spectrum" : value)));
  checkAbort();
  const provider: PlanarSceneRadianceProvider = buildPlanarSceneRadianceProvider({ scene: chart ?? callerScene!, sceneId: IDS.scene, providerProfileId: IDS.provider,
    illuminant, irradianceScale, geometry: { distanceM: subjectDistanceM, metresPerFrameUnit }, evidence: FACADE_EVIDENCE,
    limitations: ["Planar Lambertian scene under uniform illumination; no shadows, inter-reflection, gloss or fluorescence."] });
  assume("model.scene-radiometry", "model", "lambertian-plane", "Radiance = reflectance × irradiance / π on one plane; illuminance from K_m = 683 lm/W and the engine's analytic CIE 1931 ȳ fit.");

  // Metering (CIPA DC-004 standard output sensitivity and camera equation) and exposure-mode resolution
  const exposureOptions = allowKeys(top.exposure, "exposure", ["mode", "iso", "shutterSeconds", "compensationStops"]);
  const mode = pick<SimulateCaptureExposureMode>(exposureOptions, "mode", "exposure.mode", "manual", "Manual exposure.");
  if (!["manual", "aperture-priority", "shutter-priority", "program"].includes(mode)) fail("Unknown exposure mode.");
  const iso = positive(pick(exposureOptions, "iso", "exposure.iso", DEFAULTS.iso, "ISO 100, the tiers' base ISO."), "exposure.iso");
  const compensation = exposureOptions.compensationStops === undefined ? DEFAULTS.compensationStops : exposureOptions.compensationStops;
  if (typeof compensation !== "number" || !Number.isFinite(compensation) || Math.abs(compensation) > 10) fail("exposure.compensationStops must be within ±10.");
  if (exposureOptions.compensationStops === undefined) assume("exposure.compensationStops", "default", 0, "No exposure compensation.");
  const reference = { aperture: DEFAULTS.fNumber, shutterSeconds: DEFAULTS.shutterSeconds, iso: DEFAULTS.iso };
  const referenceLuminance = sosReferenceLuminance(reference.aperture, reference.shutterSeconds, reference.iso);
  assume("exposure.referenceExposure", "model", { ...reference, meteredLuminanceCdPerSquareMeter: referenceLuminance },
    "Exposure anchor: f/8, 1/125 s, ISO 100 gives the CIPA DC-004 standard output sensitivity reference exposure H = 10/S = 0.1 lx·s for an average scene luminance of 10·N²/(0.65·t·S) ≈ 1230.77 cd/m² (camera equation H = 0.65·L·t/N²).");
  const meterProfile = body.metering[0]!.profile, zones = 16, zoneSamples = [];
  let luminanceSum = 0;
  for (let j = 0; j < zones; j++) for (let i = 0; i < zones; i++) {
    const u = -1 + (i + 0.5) * 2 / zones, v = aspect - (j + 0.5) * 2 * aspect / zones;
    const luminance = luminanceOf((nm) => provider.radianceAt(u, v, nm));
    luminanceSum += luminance;
    zoneSamples.push({ sampleId: "zone-" + i + "-" + j, positionOrientedCaptureUv: { u: (i + 0.5) / zones, v: (j + 0.5) / zones },
      relativeLinearSignal: meterProfile.target.targetRelativeSignal * luminance / referenceLuminance, areaWeight: 1 });
  }
  const meteredLuminance = luminanceSum / (zones * zones);
  assume("exposure.metering", "model", { policy: meterProfile.policy.kind, zones: zones * zones },
    "The body's " + meterProfile.policy.kind + " meter reads scene luminance on a 16 × 16 zone grid, before the lens (no lens transmission, vignetting or flare).");
  const meterResult = meterRelativeExposure({ profile: meterProfile, sampleSet: { measurementId: "facade-meter", sceneStateId: IDS.sceneState,
    inputDomain: "relative-pre-exposure-linear-signal", captureRegion: "oriented-active-capture", captureGeometry: resolvedGeometry,
    processingState: { exposureSettingsApplied: false, whiteBalanceApplied: false, toneMappingApplied: false, displayGammaApplied: false, sharpeningApplied: false },
    samples: zoneSamples } });
  let target = createExposureMeterTargetFromMeteringResult({ targetId: "facade-target", meterResult: meterResult.value });
  if (compensation !== 0) target = setExposureCompensationOnMeterTarget({ targetId: "facade-target-ec", baseTarget: target, exposureCompensationStops: compensation });
  let resolution: { status: string; resolvedSettings?: { aperture?: number; shutterSeconds?: number; iso?: number } };
  let fNumber: number, shutterSeconds: number;
  if (mode === "manual" || mode === "aperture-priority") {
    fNumber = positive(pick(lensOptions, "fNumber", "lens.fNumber", DEFAULTS.fNumber, "f/8."), "lens.fNumber");
  } else {
    if (lensOptions.fNumber !== undefined) fail("lens.fNumber is resolved automatically in " + mode + " mode; omit it.");
    fNumber = NaN;
  }
  if (mode === "manual" || mode === "shutter-priority") {
    shutterSeconds = positive(pick(exposureOptions, "shutterSeconds", "exposure.shutterSeconds", DEFAULTS.shutterSeconds, "1/125 s."), "exposure.shutterSeconds");
  } else {
    if (exposureOptions.shutterSeconds !== undefined) fail("exposure.shutterSeconds is resolved automatically in " + mode + " mode; omit it.");
    shutterSeconds = NaN;
  }
  if (mode === "manual") {
    resolution = resolveManualExposureMode({ target, capabilities, referenceExposure: reference, manualAperture: fNumber, manualShutterSeconds: shutterSeconds,
      isoControl: { kind: "manual", iso } });
  } else if (mode === "aperture-priority") {
    resolution = resolveAperturePriorityExposureMode({ target, capabilities, referenceExposure: reference, manualAperture: fNumber, manualIso: iso,
      shutterQuantizationPolicy: "nearest-log2-shorter-on-tie" });
  } else if (mode === "shutter-priority") {
    resolution = resolveShutterPriorityExposureMode({ target, capabilities, referenceExposure: reference, manualShutterSeconds: shutterSeconds,
      isoControl: { kind: "manual", iso, apertureQuantizationPolicy: "nearest-log2-narrower-on-tie" } });
  } else {
    assume("exposure.programLine", "model", "facade-generic-program-line", "Engine-authored generic program line (f/16 1/2000 s … f/8 1/125 s … f/4 1.024 s); not a manufacturer program.");
    resolution = resolveProgramAutoExposureMode({ target, capabilities, referenceExposure: reference, programLine: defaultProgramLine(), isoControl: { kind: "manual", iso } });
  }
  if (resolution.status !== "resolved" || !resolution.resolvedSettings) fail("Exposure could not be resolved (" + resolution.status + "); the scene may have no signal.");
  fNumber = resolution.resolvedSettings.aperture ?? fNumber;
  shutterSeconds = resolution.resolvedSettings.shutterSeconds ?? shutterSeconds;
  const resolvedIso = resolution.resolvedSettings.iso ?? iso;

  // Sensor readout for the ISO setting. Standard output sensitivity S = 10/H (CIPA DC-004 §3.2) is defined at the
  // output, independent of pixel size, while the collected charge is proportional to the sensitive-aperture area
  // (EMVA 1288 Release 4.0, Eq. 3). The tier's signal chain is anchored to the 6 µm aperture; at another area the
  // charge-domain readout scales with the area so the same H gives the same code. At 6 µm nothing is changed.
  const areaScale = pitch * pitch / ISO_REFERENCE_APERTURE_AREA_SQUARE_MICROMETERS;
  const regimeByChannel = {} as Record<Channel, { readoutProfile: ReadoutProfile; regimeId: string }>;
  for (const channel of CHANNELS) {
    const asset = body.readout.find((a) => a.profile.channelId === channel) ?? fail("Camera readout lacks channel " + channel + ".");
    const chain = resolveGenericIsoSignalChain({ profile: body.signalChain, isoCapability: body.iso, requestedIsoSetting: { kind: "standard", exposureIndex: resolvedIso },
      captureModeId: IDS.mode, readoutProfile: asset.profile });
    regimeByChannel[channel] = { readoutProfile: areaScale === 1 ? asset.profile : isoAreaScaledReadout(asset.profile, areaScale), regimeId: chain.readout.regime.regimeId };
  }
  const capacityRegimes = (areaScale === 1 ? body.readout[0]!.profile : isoAreaScaledReadout(body.readout[0]!.profile, areaScale)).regimes;
  const baseRegime = capacityRegimes[0]! as unknown as { preAdcSaturationElectronEquivalent: { value: number } };
  const capacityElectrons = Math.max(...capacityRegimes.map((r) => (r as unknown as { preAdcSaturationElectronEquivalent: { value: number } }).preAdcSaturationElectronEquivalent.value),
    baseRegime.preAdcSaturationElectronEquivalent.value);
  assume("sensor.capacityElectrons", "derived", capacityElectrons, "Physical charge capacity set to the body's largest declared pre-ADC saturation (its base-ISO saturation signal), so storage never clips before the declared readout white.");
  if (areaScale !== 1) {
    assume("sensor.isoAreaNormalization", "model", { referenceApertureAreaSquareMicrometers: ISO_REFERENCE_APERTURE_AREA_SQUARE_MICROMETERS,
      apertureAreaSquareMicrometers: pitch * pitch, areaScale },
    "Approximation. The tier's ISO signal chain is declared for a 6 µm square aperture. Standard output sensitivity S = 10/H (CIPA DC-004-2020 §3.2) is defined at the output, " +
      "independent of pixel size, and the collected charge is proportional to the aperture area (EMVA 1288 Release 4.0, Eq. 3), so the system conversion gain (e⁻ per code) and the " +
      "pre-ADC saturation of every ISO regime are multiplied by area / 36 µm² = " + areaScale + ". The same exposure gives the same output code at any pitch; per-pixel shot-noise SNR " +
      "falls with smaller pixels. Read noise and dark current stay per pixel in electrons. The charge capacity follows the scaled base-ISO saturation, so it is proportional to " +
      "the aperture area: a design consequence of holding the tier's ISO rating and highlight headroom fixed, not a measured full-well model (published sensor data grow less than " +
      "proportionally with area across technologies).");
  }
  assume("sensor.darkCurrent", "model", { electronsPerSecond: DARK_CURRENT_ELECTRONS_PER_SECOND, temperatureC: OPERATING_TEMPERATURE_C },
    "Synthetic uniform dark current of 1 e⁻/s per site at 20 °C (the tier presets declare none); dark shot noise follows from it.");
  assume("sensor.spectralResponse", "model", { kind: "colorimetric-cmf-eqe", peakScale: EQE_SCALE },
    "Idealized colorimetric sensor: channel EQE = a·{x̄, ȳ, z̄}(λ)·555/λ (the engine's analytic CIE 1931 fit), so RAW channels are proportional to CIE XYZ (Luther–Ives) and the camera matrix is diagonal. Not a real camera's response; CMF air wavelengths are used as vacuum wavelengths (difference about 0.03 %).");
  if (!antiAliasing) assume("sensor.fillFactor", "model", 1, "Square sensitive aperture equal to the pixel pitch; no microlens or anti-aliasing filter.");
  else {
    assume("sensor.fillFactor", "model", 1, "Square sensitive aperture equal to the pixel pitch; no microlens.");
    assume("sensor.antiAliasing", "model", { kind: antiAliasing.kind, ...(antiAliasing.axis ? { axis: antiAliasing.axis } : {}),
      ...(antiAliasing.separationSites === undefined ? {} : { separationSites: antiAliasing.separationSites, separationMicrometers: antiAliasing.separationSites * pitch }),
      components: antiAliasing.components },
      "Optical low-pass (anti-aliasing) filter as a normalized point-splitting kernel in the sensor optical stack (resolveAntiAliasingSpatialKernel): every site integrates the light that would " +
      "otherwise land at its centre minus each offset, weighted. " + (antiAliasing.kind === "point-splitting" ? "Caller-declared components. " :
        "This is the ideal birefringent " + (antiAliasing.kind === "four-spot" ? "two-plate (crossed) splitter: four equal spots at (±d/2, ±d/2), MTF |cos(π·f_x·d)·cos(π·f_y·d)|" :
          "single-plate splitter: two equal spots at ±d/2 along the " + antiAliasing.axis + " axis, MTF |cos(π·f·d)|") + ", d = " + antiAliasing.separationSites + " site(s); first zero at f = 1/(2d). ") +
      "Approximations: the split is the same at every wavelength, field point and polarization (birefringence dispersion and the thickness-dependent displacement are not modelled), the spots are exact points with equal weights for unpolarized light, " +
      "and the filter's transmission, reflections and focus shift are not modelled. Not a measured filter; the tier presets declare none. The scene queries are multiplied by " + antiAliasing.components.length + ".");
  }
  // Shutter (2.0): the electronic rolling-shutter schedule derived from the body's rolling readout declaration.
  let rollingSchedule: ElectronicRollingShutterExposureSchedule | undefined;
  if (shutterKind === "rolling") {
    const declared = (body as { rollingReadoutTiming?: { profile: unknown } }).rollingReadoutTiming?.profile as Parameters<typeof resolveElectronicRollingShutterExposureSchedule>[0]["readout"] | undefined;
    if (!declared || declared.readoutMode !== "rolling") fail("motion.shutter \"rolling\" needs a camera body with a rolling readout timing declaration.");
    const readout = rollingSkewOption === undefined ? declared : { ...declared, spatialSamplingSkewSeconds: { value: rollingSkewOption, unit: "s" as const, evidence: FACADE_EVIDENCE } };
    rollingSchedule = resolveElectronicRollingShutterExposureSchedule({ readout, linkageEvidence: FACADE_EVIDENCE,
      nominalExposureDurationSeconds: { value: shutterSeconds, unit: "s", evidence: FACADE_EVIDENCE } });
    assume("sensor.shutter", "model", { kind: "electronic-rolling", modelId: rollingSchedule.modelId, modelVersion: rollingSchedule.modelVersion,
      lineScanSkewSeconds: rollingSchedule.lineScanSkewSeconds, scanDirection: readout.scanDirectionNative.value },
      "Electronic rolling shutter (line reset/read linkage): a site at normalized scan position s integrates over [s·τ, s·τ + T]. " +
      (rollingSkewOption === undefined ? "τ is the body's declared full-frame data-readout skew, applied unchanged across the simulated frame (it is not scaled to the cropped sensor), so a small frame shows the skew of a full-sensor readout." :
        "τ is the caller-declared skew across the simulated frame."));
  } else assume("sensor.shutter", "model", "global-electronic", "Global electronic shutter: every site integrates the same exposure window.");
  if (rotating) assume("motion.angularVelocityRadPerSec", "model", { ...angular },
    "Constant camera angular velocity applied to every scene ray at each temporal midpoint of each site's exposure window (engine rotation convention, docs/SENSOR_ENVIRONMENT_QUERY.md); motion blur is the midpoint quadrature over sensor.temporalSampleCount samples.");
  if (lensPsf) assume("lens.psf", "model", { kind: "sampled-local" }, "Caller-supplied sampled lens PSF redistributes irradiance through the environment PSF quadrature; its evidence and limits are the caller's.");
  // With lens.diffraction the PSF is recorded as lens.diffraction once its kernels are built.
  else if (diffractionRadiusOption === undefined) assume("lens.psf", "model", "not-applied", "No lens PSF or diffraction blur is applied (point optics); the generic tiers' optical data are declared only at f/4.");
  assume("lens.transmission", "model", lens.matchedReference.transmission,
    "The tier lens's spectrally flat transmission is used at every f-number and focus in the lens capability; the tier declares it only at its f/4, 5 m reference state.");
  if (!vignetting && !lensFieldMapping) assume("lens.fieldThroughput", "model", "unity", "No vignetting, distortion, lateral colour or stray light.");
  else {
    if (vignetting) assume("lens.vignetting", "model", { kind: "radial-illumination-vignetting", profile: vignetting },
      "Caller-declared radial relative illumination 1 + r2·ρ² + r4·ρ⁴ + r6·ρ⁶, applied once as environment field throughput at the physical sensor point before any PSF.");
    else assume("lens.fieldThroughput", "model", "unity", "No vignetting, lateral colour or stray light.");
    if (distortion) assume("lens.distortion", "model", distortion,
      "Caller-declared " + distortion.kind + " distortion: each sensor point is inverse-distorted before the scene-ray query and irradiance is multiplied exactly once by the area factor 1/det(J).");
  }
  if (projection === undefined) assume("lens.projection", "default", "rectilinear", "Ideal rectilinear (pinhole) projection.");
  else assume("lens.projection", "model", projection, "Ideal " + projection + " projection through the environment lens field mapping. At finite focus its scale is the thin-lens image distance (an approximation); the chart is still sized with the rectilinear thin-lens scale, so its edges move with the projection.");

  // White balance
  let whiteBalanceState: ResolvedWhiteBalanceState | null = null, needsAuto = false;
  if (whiteBalanceOption === "none") whiteBalanceState = null;
  else if (whiteBalanceOption === "auto") needsAuto = true;
  else if (whiteBalanceOption === "scene-illuminant") {
    const xyz = illuminantXyz(illuminant), camera = XYZ_TO_CAMERA.map((row) => row[0] * xyz[0] + row[1] * xyz[1] + row[2] * xyz[2]);
    whiteBalanceState = resolveCustomWhiteBalance({ stateId: "facade-wb-scene-illuminant", sampleSet: { imageStateId: "facade-white-diffuser",
      inputDomain: "relative-pre-wb-camera-linear-rgb", samples: [{ sampleId: "white", red: camera[0]!, green: camera[1]!, blue: camera[2]!, weight: 1, clipped: false }] } });
  } else if (typeof whiteBalanceOption === "object" && whiteBalanceOption !== null && "kelvin" in whiteBalanceOption) {
    const wb = allowKeys(whiteBalanceOption, "output.whiteBalance", ["kelvin", "tint"]);
    const intent = createColorTemperatureWhiteBalanceIntent({ intentId: "facade-wb-cct", colorTemperatureKelvin: positive(wb.kelvin, "output.whiteBalance.kelvin"),
      tint: wb.tint === undefined ? 0 : wb.tint as number });
    whiteBalanceState = resolveColorTemperatureWhiteBalance({ stateId: "facade-wb-cct", intent, whiteLocus: "planckian", tintInterpretation: "duv-cie-1960-uv",
      camera: { profileId: IDS.spectral, profileVersion: SIMULATE_CAPTURE_FACADE_VERSION, xyzToCameraRgb: XYZ_TO_CAMERA.map((r) => [...r]) as unknown as Parameters<typeof resolveColorTemperatureWhiteBalance>[0]["camera"]["xyzToCameraRgb"] } });
  } else if (typeof whiteBalanceOption === "object" && whiteBalanceOption !== null && "channelGains" in whiteBalanceOption) {
    allowKeys(whiteBalanceOption, "output.whiteBalance", ["channelGains"]);
    requireInputObject(whiteBalanceOption.channelGains, "output.whiteBalance.channelGains");
    allowKeys(whiteBalanceOption.channelGains, "output.whiteBalance.channelGains", ["red", "green", "blue"]);
    whiteBalanceState = resolveManualWhiteBalance({ stateId: "facade-wb-manual", channelGains: whiteBalanceOption.channelGains });
  } else fail("Unknown output.whiteBalance.");
  const intentOf = (state: ResolvedWhiteBalanceState | null): CaptureWhiteBalanceIntent | null => (state ? createCaptureWhiteBalanceIntent({ state }) : null);

  const rendering: SdrRenderingProfile = { schemaVersion: "0.1.0", profileId: "facade-sdr", profileVersion: "1", renderingExposureEv: 0, toneCurve,
    ...(outputOptions.toneCurveParameters === undefined ? {} : { toneCurveParameters: outputOptions.toneCurveParameters as SdrToneCurveParameters }),
    gamutHandling: "clip-components", outputDynamicRange: "sdr", transferFunction: "srgb", bitDepth: format === "srgb-16" || (format === "png" && !wideGamut && pngBitDepth === 16) ? 16 : 8, rounding: "nearest-ties-up", dither: "none" };
  if (!linearPath) assume("output.rendering", "model", { renderingExposureEv: 0, gamutHandling: "clip-components" },
    "Developed linear sRGB/D65 with the RAW white level mapped to display white, no exposure push, out-of-gamut components clipped.");
  else assume("output.rendering", "model", { renderingExposureEv: 0, gamutHandling: "clip-components-in-target-gamut", sdrRendererUsed: false },
    "The sRGB SDR renderer is not used: the linear development (RAW white level = relative 1.0, no exposure push) is converted to the target encoding; request.development.rendering is validated but only its exposure and tone curve (identity) apply.");
  // Rendering choices are validated before any radiance work, so a bad tone curve fails fast.
  parseSdrRenderingProfile(rendering);
  if (highlightMode !== "clip" && highlightMode !== "reconstruct") fail("output.highlightMode must be clip or reconstruct.");

  // Frame profiles
  const evidence = FACADE_EVIDENCE;
  const nativeRaster = { pixelWidth: nativeWidth, pixelHeight: nativeHeight };
  const captureModeProfile = { schemaVersion: "0.1.0" as const, modes: [{ modeId: IDS.mode, evidence, acquisition: { kind: "single-frame" as const },
    perFrameSampling: { kind: "native-effective-raster" as const }, reconstructionStages: [], processedImageRaster: { value: nativeRaster, evidence },
    dependencies: ["color-sampling-model"] }] } as unknown as NativeRawInput["captureModeProfile"];
  const bindingProfile = { schemaVersion: "0.1.0" as const, bindingId: IDS.binding, colorSamplingProfileId: IDS.cfa, nativeRaster, evidence,
    relationship: { kind: "regular-native-effective-sample-blocks" as const, sitesPerNativeSampleX: 1, sitesPerNativeSampleY: 1, anchor: "shared-native-top-left" as const } };
  const exposureWindow = rollingSchedule ? createRollingShutterCaptureExposureSchedule(rollingSchedule) as unknown as {
    shutterMechanism: "electronic"; nominalExposureDurationSeconds: { value: number; unit: "s"; evidence: readonly EvidenceProvenance[] };
    opening: { kind: "simultaneous" }; closing: { kind: "simultaneous" } } :
    { shutterMechanism: "electronic" as const, nominalExposureDurationSeconds: { value: shutterSeconds, unit: "s" as const, evidence },
      opening: { kind: "simultaneous" as const }, closing: { kind: "simultaneous" as const } };
  const buildRawInput = (intent: CaptureWhiteBalanceIntent | null): NativeRawInput => ({
    exposure: { captureId: IDS.capture, sceneStateId: IDS.sceneState, sceneTimeSeconds: 0, geometry,
      exposure: { focalLengthMm, aperture: fNumber, shutterSeconds, iso: resolvedIso }, focus: { kind: "finite", distanceM: focusDistanceM },
      noise: { seedUint32: noiseSeed, realizationId: "facade-noise", model: { ...SENSOR_RAW_PRODUCER_NOISE_MODEL } },
      source: { kind: "scene-radiance-source", artifactId: "facade-scene-" + scenePreset, sha256: sourceSha256, dynamicRangeHistory: "no-loss-declared" },
      whiteBalanceIntent: intent, adoptedWhiteXyz: null,
      models: [{ profile: { id: "photivra-simulate-capture", version: SIMULATE_CAPTURE_FACADE_VERSION }, scientificStatus: "approximation", publicEvidenceIds: ["photivra:simulate-capture-facade"] }] },
    frameId: IDS.frame, modeId: IDS.mode, captureModeProfile, colorSamplingProfile, bindingProfile, exposureWindow,
    maximumOutputBytes: nativeWidth * nativeHeight * 7, tileWidth, ...(raisedPixels === undefined ? {} : { maximumPixels: raisedPixels }) });
  const sceneBinding = { sceneStateId: IDS.sceneState, providerSceneId: IDS.scene, evidence };

  // Shared per-site environment pieces (identical objects for every site keep the native task's shared-state fast path).
  const range = { ...FACADE_SPECTRAL_RANGE_NANOMETERS };
  // EQE breakpoints coincide with the quadrature subintervals, so the quadrature is not split further.
  const eqeSpacing = (range.maximum - range.minimum) / Math.ceil((range.maximum - range.minimum) / spectralStep);
  const eqeSamples = (channel: Channel): { nm: number; value: number }[] => {
    const out: { nm: number; value: number }[] = [];
    for (let nm = range.minimum; nm <= range.maximum + 1e-9; nm += eqeSpacing) out.push({ nm, value: EQE_SCALE[channel] * estimateCie1931ColorMatchingFunctions(nm)[CMF_KEY[channel]] * 555 / nm });
    return out;
  };
  const operatingConditions = { temperatureC: 25, incidenceAngleDegreesFromNormal: 0, polarization: "unpolarized" as const };
  // One single-channel response profile per CFA channel keeps each site's response data small.
  const spectralResponseProfiles = Object.fromEntries(CHANNELS.map((only) => [only, { schemaVersion: "0.1.0" as const, profileId: IDS.spectral, colorSamplingProfileId: IDS.cfa, evidence,
    channels: [only].map((channelId) => ({ channelId, kind: "effective-external-quantum-efficiency" as const, responseScope: "sensor-package-incident-effective-channel-response" as const,
      scientificStatus: "approximation" as const, uncertainty: { kind: "not-quantified" as const, limitation: "Idealized colorimetric response; not a measured sensor." },
      evidence, referenceConditions: operatingConditions, conditionDependence: "not-modeled" as const, externalQuantumEfficiency: sampled(eqeSamples(channelId)) })) }])) as Record<Channel, unknown>;
  const apertureArea = pitch * pitch;
  const samplingApertureProfile = { schemaVersion: "0.1.0" as const, profileId: IDS.sampling, colorSamplingProfileId: IDS.cfa, colorSamplingBindingId: IDS.binding, evidence,
    siteCenterLattice: { kind: "regular-rectangular-site-center-lattice" as const, coordinateSystem: "native-sensor-physical" as const, pitchXMicrometers: pitch, pitchYMicrometers: pitch,
      firstSiteCenterFromImagingAreaTopLeftMicrometers: { x: pitch / 2, y: pitch / 2 }, evidence },
    geometricSensitiveAperture: { kind: "uniform-axis-aligned-rectangle" as const, widthMicrometers: pitch, heightMicrometers: pitch, centerOffsetFromSiteCenterMicrometers: { x: 0, y: 0 }, evidence } };
  const stackId = antiAliasing ? IDS.stackAa : IDS.stack;
  const opticalStackProfile: SensorOpticalStackProfile = antiAliasing ? { schemaVersion: "0.1.0", profileId: stackId, evidence, effectiveAntiAliasingSpatialResponse: {
    kind: "normalized-point-splitting-kernel", evidence, coordinateSystem: "native-sensor-physical", scope: "field-wavelength-polarization-invariant-approximation",
    components: antiAliasing.components } } : { schemaVersion: "0.1.0" as const, profileId: IDS.stack, evidence, effectiveAntiAliasingSpatialResponse: { kind: "absent" as const, evidence } };
  const perChannel = Object.fromEntries(CHANNELS.map((channelId) => [channelId, {
    applicationProfile: { schemaVersion: "0.1.0" as const, profileId: "facade-application-" + channelId, spectralResponseProfileId: IDS.spectral, colorSamplingProfileId: IDS.cfa, channelId,
      samplingApertureProfileId: IDS.sampling, opticalStackProfileId: stackId, evidence, incidentAreaBasis: { kind: "geometric-sensitive-aperture" as const, areaSquareMicrometers: apertureArea },
      spatialResponseModel: { kind: "uniform-over-geometric-sensitive-aperture" as const, scientificStatus: "approximation" as const, evidence, limitation: "Uniform response over the square aperture." },
      referenceConditionPolicy: { kind: "exact-match-required" as const } },
    operatingRangeProfile: { schemaVersion: "0.1.0" as const, profileId: "facade-linearity-" + channelId, responseApplicationProfileId: "facade-application-" + channelId,
      spectralResponseProfileId: IDS.spectral, colorSamplingProfileId: IDS.cfa, channelId, scientificStatus: "approximation" as const,
      uncertainty: { kind: "not-quantified" as const, limitation: "Declared linear photo response for the idealized sensor." }, evidence,
      inputRange: { kind: "wavelength-integrated-geometric-aperture-radiant-power" as const, unit: "W" as const, minimumInclusive: 0, maximumInclusive: 1 },
      wavelengthApplicability: { wavelengthBasis: "vacuum" as const, minimumNanometers: range.minimum, maximumNanometers: range.maximum, containment: "requested-range-must-be-contained" as const },
      linearityCriterion: { maximumAbsoluteRelativeDeviation: 0.01 },
      spatialLinearityModel: { kind: "linear-superposition-over-geometric-aperture" as const, scientificStatus: "approximation" as const, evidence, limitation: "Declared linear superposition." },
      spectralInputModel: { kind: "per-spectral-bin" as const, maximumBinWidthNanometers: Math.max(spectralStep, 20), scientificStatus: "approximation" as const, evidence, limitation: "Declared per-bin linearity." },
      referenceConditions: operatingConditions, referenceConditionPolicy: { kind: "exact-match-required" as const } } }])) as Record<Channel, { applicationProfile: unknown; operatingRangeProfile: unknown }>;
  const sourcePlane = { value: "sensor-package-incident" as const, evidence };
  const localExposure = { bindingProfile, exposureWindowInput: { ...exposureWindow, nativeRaster } };
  const sceneBindings = {
    illuminationProfile: { schemaVersion: "0.1.0" as const, profileId: IDS.lights, sceneId: IDS.scene, evidence, sources: [{ sourceId: "illuminant", family: "environment" as const,
      enabled: true, geometry: { kind: "environment" as const }, magnitude: { kind: "relative-linear-scale" as const, scale: 1, scientificStatus: "approximation" as const,
        limitation: "Absolute level is carried by the provider radiance (" + illuminanceLux + " lux)." },
      spectrum: { kind: "unresolved" as const, limitation: "Spectral radiance is supplied numerically by the provider (" + illuminant.id + ")." },
      temporalBehavior: { kind: "time-invariant" as const }, evidence }] },
    materialResponseProfile: { schemaVersion: "0.1.0" as const, profileId: IDS.materials, sceneId: IDS.scene, evidence, materials: [{ materialResponseId: "facade-surface", evidence,
      representation: { kind: "spectral-wavelength-preserving-data" as const, dataArtifact: { id: "facade-scene-" + scenePreset, checksumSha256: sourceSha256 },
        wavelengthBasis: "vacuum" as const, wavelengthRangeNanometers: range, scatteringModel: "provider-defined-wavelength-preserving" as const, scientificStatus: "approximation" as const,
        uncertainty: { kind: "not-quantified" as const, limitation: "Analytic Lambertian reflectance." }, wavelengthChangingBehaviorModeled: false, emissionModeled: false } }],
      fluorescenceModeled: false, volumetricMaterialTransportModeled: false, polarizationModeled: false },
    providerProfile: { schemaVersion: "0.1.0" as const, profileId: IDS.provider, sceneId: IDS.scene, illuminationProfileId: IDS.lights, materialResponseProfileId: IDS.materials,
      outputQuantity: "outgoing-spectral-radiance" as const, outputUnit: "W/m^2/sr/nm" as const, scientificStatus: "approximation" as const,
      uncertainty: { kind: "not-quantified" as const, limitation: "Analytic planar scene." },
      fidelity: { spectral: "wavelength-resolved" as const, material: "spectral-data" as const, visibility: "resolved" as const, directTransport: "approximation" as const, indirectTransport: "not-modeled" as const },
      wavelengthChangingTransportModeled: false, volumetricTransportModeled: false, polarizationModeled: false, evidence, limitations: ["Engine-authored planar chart or caller scene function.",
        ...(diffractionObjectSpace ? ["Radiance is the scene radiance convolved with the lens diffraction PSF mapped onto the scene plane (object-space convolution, request.diffraction)."] : [])] } };
  const lensId = lens.exposure.profileId;
  const opticsProfile = { schemaVersion: "0.1.0" as const, profileId: lensId + ":facade-transmission", profileVersion: SIMULATE_CAPTURE_FACADE_VERSION, lensProfileId: lensId,
    scientificStatus: "approximation" as const, applicability: { focalLengthMm: { minimum: capabilities.selectedFocalLengthMm, maximum: capabilities.selectedFocalLengthMm },
      nominalFNumber: { minimum: capabilities.aperture.widestAvailableFNumber, maximum: capabilities.aperture.narrowestAvailableFNumber }, focus: { kind: "any" as const } },
    transmission: { kind: "spectral-transmission" as const, scientificStatus: "approximation" as const, wavelengthBasis: "vacuum" as const,
      samples: { value: [{ wavelengthNanometers: range.minimum, linearTransmissionFactor: lens.matchedReference.transmission },
        { wavelengthNanometers: range.maximum, linearTransmissionFactor: lens.matchedReference.transmission }], evidence: preset.evidence },
      uncertainty: { kind: "not-quantified" as const, limitation: "Synthetic spectrally flat transmission from the tier preset." } },
    distortionAreaMappingOwnership: "not-applied-by-bridge" as const, psfRedistributionOwnership: "downstream-normalized-energy-redistribution" as const,
    sensorOpticalStackIncluded: false, strayLightIncluded: false, polarizationModeled: false, wavelengthChangingBehaviorModeled: false, volumetricScatteringModeled: false,
    evidence: preset.evidence, limitations: [...lens.limitations, "Flat transmission applied across the lens capability by the capture facade."] };
  const optics = { profile: opticsProfile, focalLengthMm, nominalFNumber: fNumber,
    focus: { kind: "ideal-symmetric-thin-lens" as const, objectDistanceM: focusDistanceM, pupilMagnificationAssumption: "unity" as const } };
  const motion = { angularVelocityRadPerSec: angular, timeReference: "first-opening-boundary-phase" as const, environmentDirectionConvention: "outgoing-radiance-toward-camera" as const };
  const fieldThroughput = vignetting ? { kind: "radial-illumination-vignetting" as const, profile: vignetting, evidence,
    limitation: "Caller-declared radial relative illumination applied by the capture facade; not a measured lens." } :
    { kind: "unity" as const, evidence, limitation: "No vignetting or field throughput loss applied by the facade." };
  const spectralSamplingByChannel = Object.fromEntries(CHANNELS.map((channelId) => [channelId, { channelId, wavelengthBasis: "vacuum" as const, wavelengthRangeNanometers: range,
    maximumSubintervalWidthNanometers: spectralStep }])) as Record<Channel, unknown>;
  // Diffraction (2.1): Airy kernels at the resolved f-number on the site pitch, one per spectral node of the sensor quadrature.
  let diffraction: DiffractionLimitedPsfProfile | undefined, diffractionPsf: typeof lensPsf | undefined;
  if (diffractionRadiusOption !== undefined) {
    const wavelengths = [...new Set(CHANNELS.flatMap((channelId) => calculateSensorSpectralQuadrature({ ...(spectralSamplingByChannel[channelId] as { channelId: string;
      wavelengthBasis: "vacuum"; wavelengthRangeNanometers: { minimum: number; maximum: number }; maximumSubintervalWidthNanometers: number }), colorSamplingProfile,
    spectralResponseProfile: spectralResponseProfiles[channelId] as never }).value.nodes.map((node) => node.wavelengthNanometers)))].sort((a, b) => a - b);
    const lambdaN = wavelengths[wavelengths.length - 1]! / 1000 * fNumber * imageDistanceMm / focalLengthMm;
    // The environment resolves the PSF at each pre-filter source point, up to the largest split offset outside the imaging area.
    const aaReachMm = antiAliasing ? Math.max(...antiAliasing.components.map((c) => Math.max(Math.abs(c.offsetMicrometers.x), Math.abs(c.offsetMicrometers.y)))) / 1000 : 0;
    const kernelRadiusSamples = diffractionRadiusOption ?? Math.min(32, Math.max(1, Math.ceil(AIRY_THIRD_ZERO_PER_LAMBDA_N * lambdaN / pitch)));
    diffraction = createDiffractionLimitedPsfProfile({ aperture: "circular", focalLengthMm, apertureFNumber: fNumber, focus: { kind: "finite", distanceM: focusDistanceM },
      wavelengthsNm: wavelengths, samplePitchMicrometers: pitch, kernelRadiusSamples, fieldHalfExtentMm: aaReachMm === 0 ? { x: imagingArea.widthMm / 2, y: imagingArea.heightMm / 2 } :
        { x: imagingArea.widthMm / 2 + aaReachMm, y: imagingArea.heightMm / 2 + aaReachMm },
      profileId: "facade-diffraction-airy" }).value;
    diffractionPsf = { kind: "sampled-local", configuration: { psf: { profile: diffraction.profile, focalLengthMm, focus: { kind: "finite", distanceM: focusDistanceM },
      apertureFNumber: fNumber, signedDefocusImagePlaneMicrometers: 0 }, psfWavelengthBasis: { value: "vacuum", evidence },
    spatialModel: { kind: "destination-local-shift-invariant-approximation", evidence, limitation: "Diffraction-limited Airy PSF, the same at every field point." } } };
    assume("lens.diffraction", "model", { model: diffraction.model, aperture: "circular-aperture", fNumber, workingFNumber: diffraction.workingFNumber,
      kernelRadiusSamples, samplePitchMicrometers: pitch, maximumTruncatedEnergyFraction: diffraction.maximumTruncatedEnergyFraction,
      truncatedEnergyByWavelength: diffraction.wavelengths.map((w) => ({ wavelengthNm: w.wavelengthNm, truncatedEnergyFraction: w.truncatedEnergyFraction })),
      execution: diffractionObjectSpace ? "object-space-convolution" : "environment-psf-quadrature" },
      "Scalar Fraunhofer diffraction of an ideal, aberration-free circular pupil (Airy pattern, createDiffractionLimitedPsfProfile) at the resolved f-number, in focus, with D = f/N and the thin-lens image distance (working f-number N·v/f). " +
      "One kernel per spectral node, binned into site-sized cells over a " + (2 * kernelRadiusSamples + 1) + " × " + (2 * kernelRadiusSamples + 1) + " window" +
      (diffractionRadiusOption === null ? " (reaching the third dark ring at the longest node)" : "") + "; the Airy tail energy outside it (listed per wavelength) is put back by unit-sum renormalization. " +
      (diffractionObjectSpace ? "Applied as an object-space convolution: the scene radiance on the site lattice is convolved once per spectral node (calculateIrradianceConvolution) and the provider answers each site query with it, so the site inputs declare no PSF; this equals the per-tap environment PSF quadrature for this still, distortion-free planar scene (request.diffraction.psf). " :
        "Applied through the environment PSF quadrature (one scene query per kernel tap), because camera rotation, a lens field mapping or vignetting moves the taps off the site lattice. ") +
      "No defocus, aberration or pupil clipping; the sensor pixel aperture is still point-sampled at the site centre.");
  }
  const psf = lensPsf ?? (diffractionObjectSpace ? { kind: "not-applied" as const, evidence,
    limitation: "No environment PSF: lens diffraction is applied upstream by the scene provider as an object-space convolution (request.diffraction)." } : undefined) ??
    diffractionPsf ?? { kind: "not-applied" as const, evidence, limitation: "No lens PSF (point optics)." };
  const pupilRecord = pupil ? { kind: "ideal-uniform-circular-pupil" as const, radialSampleCount: pupil.radialSamples, angularSampleCount: pupil.angularSamples, evidence,
    limitation: "Ideal uniform circular pupil; finite ray sampling, no convergence claim." } : undefined;
  const chargeSamplingProfile = { schemaVersion: "0.1.0" as const, profileId: IDS.chargeSampling, completenessProfileId: IDS.completeness, scientificStatus: "approximation" as const,
    photoShotNoiseModel: "poisson" as const, darkShotNoiseModel: "poisson" as const, additionalComponentPolicies: [], evidence, limitations: ["Poisson photo and dark shot noise."] };
  const channelAt = (x: number, y: number): Channel => (["red", "green", "green", "blue"] as const)[(y % 2) * 2 + (x % 2)]!;
  function siteInput(index: number): SimulateEnvironmentSensorRawFrameInput["sites"][number] {
    if (!Number.isSafeInteger(index) || index < 0 || index >= nativeWidth * nativeHeight) fail("Native site index out of range.");
    const x = index % nativeWidth, y = Math.floor(index / nativeWidth), channel = channelAt(x, y), site = { x, y }, c = perChannel[channel], r = regimeByChannel[channel];
    const environment = { temporalIntegrationId: IDS.frame + ":native:" + index,
      sensor: { spatialSampling: { imagingArea, samplingApertureProfile, opticalStackProfile, site, spatialSampleCountX: 1, spatialSampleCountY: 1 },
        spectralSampling: spectralSamplingByChannel[channel], colorSamplingProfile, spectralResponseProfile: spectralResponseProfiles[channel],
        responseApplication: { applicationProfile: c.applicationProfile, sourcePlane, operatingConditions }, operatingRangeProfile: c.operatingRangeProfile, localExposure },
      sceneBindings, optics, motion, temporalSampleCount, fieldThroughput, psf, ...(pupilRecord ? { pupil: pupilRecord } : {}), ...(lensFieldMapping ? { lensFieldMapping } : {}) };
    // The charge completeness profile must cover the site's own exposure window (shifted by s·τ under a rolling shutter).
    const window = rollingSchedule ? calculateCaptureExposureWindows({ ...exposureWindow, nativeRaster, samplePointsNative: [{ x: x + 0.5, y: y + 0.5 }] }).value.samples[0]! :
      { startOffsetSecondsFromOpeningReference: 0, endOffsetSecondsFromOpeningReference: shutterSeconds };
    return { environment, operatingTemperatureC: OPERATING_TEMPERATURE_C,
      darkCurrentProfile: { schemaVersion: "0.1.0", profileId: IDS.dark, colorSamplingProfileId: IDS.cfa, channelId: channel, scientificStatus: "approximation", evidence,
        uncertainty: { kind: "not-quantified", limitation: "Synthetic dark current for the capture facade." }, chargeMeaning: "pre-compensation-thermally-generated-electrons",
        siteApplicability: { kind: "exact-site", site }, temperatureModel: { kind: "fixed-reference-temperature", referenceTemperatureC: OPERATING_TEMPERATURE_C,
          darkCurrentElectronsPerSecond: DARK_CURRENT_ELECTRONS_PER_SECOND }, darkCurrentCompensationIncluded: false, spatialDarkCurrentNonuniformityModeled: false },
      charge: { completenessProfile: { schemaVersion: "0.1.0", profileId: IDS.completeness, colorSamplingProfileId: IDS.cfa, channelId: channel, site, bindingId: IDS.binding,
        timeReference: "first-opening-boundary-phase", startOffsetSecondsFromOpeningReference: window.startOffsetSecondsFromOpeningReference,
        endOffsetSecondsFromOpeningReference: window.endOffsetSecondsFromOpeningReference,
        darkCurrentProfileId: IDS.dark, includedAdditionalComponentIds: [], coverageMeaning: "all-material-stored-electron-contributors-accounted-for",
        scientificStatus: "approximation", evidence, limitation: "Photo and dark charge only." } },
      readout: { samplingProfile: chargeSamplingProfile, capacityProfile: { schemaVersion: "0.1.0", profileId: IDS.capacity, colorSamplingProfileId: IDS.cfa, channelId: channel,
        capacityMeaning: "physical-charge-storage-capacity-electrons", capacityElectrons, scientificStatus: "approximation",
        uncertainty: { kind: "not-quantified", limitation: "Derived from the tier's declared saturation signal." }, evidence, siteApplicability: { kind: "exact-site", site },
        operatingState: { stateId: IDS.operatingState, evidence }, temperatureApplicability: { kind: "exact-reference-temperature", temperatureC: OPERATING_TEMPERATURE_C } },
        operatingStateId: IDS.operatingState, readoutProfile: r.readoutProfile, regimeId: r.regimeId } } as unknown as SimulateEnvironmentSensorRawFrameInput["sites"][number];
  }
  const readTile = async (request: { captureId: string; frameId: string; x: number; y: number; width: number; height: number }): Promise<NativeEnvironmentRawTile> =>
    ({ ...request, sites: Array.from({ length: request.width }, (_, j) => siteInput(request.y * nativeWidth + request.x + j)) });
  const yieldControl = createHostYield().yieldControl;
  const perSite = queriesPerSite * (diffraction && psf === diffractionPsf ? (2 * diffraction.kernelRadiusSamples + 1) ** 2 : 1);
  let diffractionMs = 0, demosaicMs: number | undefined, encodeMs: number | undefined;
  const rawProvider = diffraction && diffractionObjectSpace ? createDiffractedPlanarProvider({ base: provider, psf: diffractionPsf!.configuration.psf,
    wavelengthsNm: diffraction.profile.axes.wavelengthNm, kernelRadius: diffraction.kernelRadiusSamples, nativeWidth, nativeHeight, outputWidth: width,
    sitePitchMicrometers: pitch, distanceM: subjectDistanceM, metresPerFrameUnit, onConvolution: (ms) => { diffractionMs += ms; },
    // The environment queries each site at its centre minus each split offset (sites, +x right, +y down).
    ...(antiAliasing ? { queryOffsetsSites: antiAliasing.components.map((c) => ({ x: -c.offsetMicrometers.x / pitch, y: -c.offsetMicrometers.y / pitch })) } : {}) }) : provider;
  if (antiAliasing && perSite > 100_000) fail("sensor.antiAliasing with these options needs " + perSite + " scene queries per site; the environment admits at most 100000.");
  const evaluations = nativeWidth * nativeHeight * perSite;
  // The native task admits at most 100 000 radiance queries per tile.
  const tileWidth = Math.max(1, Math.min(256, Math.floor(100_000 / perSite)));
  const environmentRaw: NativeEnvironmentRawInput = { raw: buildRawInput(intentOf(whiteBalanceState)), sceneBinding,
    maximumProviderEvaluations: Math.min(nativeRawMaximumProviderEvaluations(raisedPixels === undefined ? {} : { maximumPixels: raisedPixels }),
      Math.max(nativeWidth * nativeHeight, evaluations)) };

  async function runTask<T extends { run(): Promise<void>; cancel(): void; dispose(): void; readonly state: string }>(task: T): Promise<void> {
    const onAbort = (): void => task.cancel();
    signal?.addEventListener("abort", onAbort, { once: true });
    try { checkAbort(); await task.run(); checkAbort(); } catch (error) { task.dispose(); if (signal?.aborted) fail("simulateCapture aborted."); throw error; } finally { signal?.removeEventListener("abort", onAbort); }
  }
  const rawStarted = Date.now();
  const plan = calculateNativeRawPlan(environmentRaw.raw);
  const progress = (stage: SimulateCaptureProgress["stage"], total: number) => {
    let completed = 0;
    return (): void => { completed++; onProgress?.({ stage, completedTileCount: completed, totalTileCount: total }); };
  };
  const rawTick = progress("raw", plan.tileCount);
  const rawTask: NativeEnvironmentRawTask = createNativeEnvironmentRawTask(environmentRaw, {
    readTile: async (request) => { const tile = await readTile(request); rawTick(); return tile; },
    evaluateRadiance: rawProvider.evaluateRadiance, ...(pupil ? { evaluateApertureRadiance: provider.evaluateApertureRadiance } : {}), yieldControl });
  await runTask(rawTask);
  let rawOutput = rawTask.takeOutput();
  const providerEvaluationCount = rawOutput.providerEvaluationCount;
  const rawMs = Date.now() - rawStarted, wbStarted = Date.now();
  let finalRawInput = environmentRaw;
  if (needsAuto) {
    // Grey-world AWB over pre-WB RAW: black-subtracted, white-normalized channel means of each 2×2 CFA block on a coarse grid.
    const raw = rawOutput.raw, step = Math.max(2, 2 * Math.floor(Math.sqrt(width * height / 4096) / 1)), samples = [];
    for (let y = margin - (margin % 2); y + 1 < nativeHeight; y += step) for (let x = margin - (margin % 2); x + 1 < nativeWidth; x += step) {
      const value = (dx: number, dy: number): number => { const i = (y + dy) * nativeWidth + x + dx; return (raw.codes[i]! - raw.blackLevels[i]!) / (raw.effectiveSaturationCodes[dy * 2 + dx]! - raw.blackLevels[i]!); };
      let clipped = false;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (raw.saturationFlags[(y + dy!) * nativeWidth + x + dx!]! !== 0) clipped = true;
      samples.push({ sampleId: "block-" + x + "-" + y, red: Math.max(1e-9, value(0, 0)), green: Math.max(1e-9, (value(1, 0) + value(0, 1)) / 2), blue: Math.max(1e-9, value(1, 1)), weight: 1, clipped });
    }
    const policy = body.whiteBalance.awbPolicies[0]!;
    assume("output.whiteBalance.auto", "model", { policyId: policy.policyId, samples: samples.length },
      "Grey-world AWB of the body's " + policy.policyId + " policy over 2×2 CFA block means of the pre-WB RAW; the RAW is then rendered again with that intent (the same radiance queries are repeated).");
    whiteBalanceState = estimateAutoWhiteBalance({ stateId: "facade-wb-auto", profile: body.whiteBalance, policyId: policy.policyId,
      sampleSet: { imageStateId: "facade-pre-wb-raw", inputDomain: "relative-pre-wb-camera-linear-rgb", samples } });
    finalRawInput = { raw: buildRawInput(intentOf(whiteBalanceState)), sceneBinding, maximumProviderEvaluations: environmentRaw.maximumProviderEvaluations };
    const wbTick = progress("white-balance", plan.tileCount);
    // A second lean RAW pass with the measured intent. It gives the same RAW as re-running the sensor stage on a
    // retained optical stage, and is faster: retaining the optical stage takes the first pass off the lean executor.
    const wbTask = createNativeEnvironmentRawTask(finalRawInput, {
      readTile: async (request) => { const tile = await readTile(request); wbTick(); return tile; },
      evaluateRadiance: rawProvider.evaluateRadiance, ...(pupil ? { evaluateApertureRadiance: provider.evaluateApertureRadiance } : {}), yieldControl });
    await runTask(wbTask);
    rawOutput = wbTask.takeOutput();
  }
  const wbMs = Date.now() - wbStarted, devStarted = Date.now();
  const colorProfile: ExportSensorColorProfile = { schemaVersion: "0.1.0", profileId: IDS.spectral, profileVersion: SIMULATE_CAPTURE_FACADE_VERSION, colorSamplingProfileId: IDS.cfa,
    channelIds: ["red", "green", "blue"], scientificStatus: "approximation", referenceIlluminant: "D65", normalizedCameraChannelsToXyz: CAMERA_TO_XYZ,
    evidence, limitations: ["Diagonal camera→XYZ matrix of the idealized colorimetric (Luther–Ives) sensor; exact up to spectral quadrature."] };
  const phaseProfiles = builtInDemosaic ? builtInDemosaic.phaseProfiles : bilinearPhaseProfiles();
  const developmentWhiteBalance = whiteBalanceState ? "apply-resolved-sensor-gains" as const : "not-required" as const;


  // DNG (2.0): the packed native RAW itself, before development takes ownership of it.
  let dng: NativeRawDng | undefined;
  if (format === "dng") {
    const noise = Object.fromEntries(CHANNELS.map((channel) => {
      const resolved = resolveSensorReadoutRegime({ profile: regimeByChannel[channel].readoutProfile as Parameters<typeof resolveSensorReadoutRegime>[0]["profile"], regimeId: regimeByChannel[channel].regimeId });
      return [channel, { conversionGainElectronsPerCode: resolved.regime.systemConversionGainElectronsPerCode.value / (resolved.regime.adc.digitalGain ?? 1),
        readNoiseRmsElectrons: resolved.combinedReadNoiseRmsElectrons }];
    }));
    const dngStarted = clockMs();
    dng = await serializeNativeRawDng({ raw: rawOutput.raw, colorProfile, noise, ...(dngCapturedAtUtc === undefined ? {} : { capturedAtUtc: dngCapturedAtUtc }) });
    encodeMs = clockMs() - dngStarted;
    checkAbort();
    assume("output.dng", "model", { writer: "serializeNativeRawDng", schemaVersion: dng.schemaVersion, whiteLevel: dng.whiteLevel, blackLevels: dng.blackLevels,
      noiseProfile: dng.noiseProfile, unrepresentedSaturationFlagCount: dng.unrepresentedSaturationFlagCount },
      "Lossless uncompressed 16-bit CFA DNG of exactly the packed native RAW codes: per-phase BlackLevel, WhiteLevel = smallest per-phase effective white, ActiveArea and DefaultCrop from the capture geometry, ColorMatrix1/ForwardMatrix1 from the facade's diagonal camera→XYZ profile (D65), AsShotNeutral from the white-balance intent, BaselineExposure 0, and NoiseProfile from each channel's readout regime (conversion gain ÷ digital gain, combined read noise; Poisson + Gaussian + quantization only). No linear master or developed image is declared; saturation flags below WhiteLevel are not representable and are counted.");
  }

  // Development
  const development: Omit<NativeRawDevelopmentInput, "raw"> = { phaseProfiles, colorProfile,
    whiteBalance: developmentWhiteBalance, rendering, highlightMode, ...(mirrorBorder ? { borderHandling: "mirror" as const } : {}),
    maximumRetainedPayloadBytes: plan.outputBytes + width * height * 3 * (rendering.bitDepth / 8) };
  let developed: { raw: NativeRawOutput; integerSamples: Uint8Array | Uint16Array; highlight: RawHighlightDiagnostics; diagnostics: SdrRenderingResult["diagnostics"] };
  let gamutMappingDiagnostics: { method: "cielab-hue-preserving-chroma-compression"; kneeFraction: number; adjustedPixelCount: number; lightnessClippedPixelCount: number } | undefined;
  if (ahd) {
    let lastYield = Date.now();
    const linear = await developLinearSrgb({ ...development, raw: rawOutput.raw }, async (completed, total) => {
      onProgress?.({ stage: "development", completedTileCount: completed, totalTileCount: total });
      if (Date.now() - lastYield >= 8) { await yieldControl(); checkAbort(); lastYield = Date.now(); }
    }, { yieldControl: () => yieldControl(), checkAbort, onDemosaicMs: (ms) => { demosaicMs = ms; } });
    if (!linearPath) {
      // The native development's SDR kernel, row by row, on the AHD-developed linear sRGB.
      const maximum = 2 ** rendering.bitDepth - 1, tone = prepareSdrPixelTone(rendering), scratch = new Float64Array(3);
      const codes = rendering.bitDepth === 8 ? new Uint8Array(width * height * 3) : new Uint16Array(width * height * 3);
      const counts: SdrPixelCounts = { negative: 0, above: 0, changed: 0, low: 0, high: 0, outOfGamut: false };
      for (let y = 0; y < height; y++) renderSdrRunInto(linear.rgb, y * width * 3, width, rendering, tone, 2 ** rendering.renderingExposureEv, maximum, codes, y * width * 3, scratch, counts);
      developed = { raw: rawOutput.raw, integerSamples: codes, highlight: linear.highlight, diagnostics: { renderingNegativeSampleCount: counts.negative,
        renderingAboveReferenceSampleCount: counts.above, toneChangedSampleCount: counts.changed, gamutClippedLowSampleCount: counts.low,
        gamutClippedHighSampleCount: counts.high, captureSaturation: "consumed-in-raw-development" } };
    } else {
      const mapping = perceptual ? prepareRgbGamutMapping({ colorSpace: colorEncoding!, method: "cielab-hue-preserving-chroma-compression", kneeFraction: PERCEPTUAL_GAMUT_KNEE_FRACTION }) : undefined;
      const encoded = encodeSdrFromLinear(linear.rgb, colorEncoding!, pngBitDepth!, mapping);
      developed = { raw: rawOutput.raw, integerSamples: encoded.samples, highlight: linear.highlight, diagnostics: encoded.diagnostics };
      if (mapping) gamutMappingDiagnostics = { method: "cielab-hue-preserving-chroma-compression", kneeFraction: PERCEPTUAL_GAMUT_KNEE_FRACTION,
        adjustedPixelCount: encoded.adjustedPixelCount, lightnessClippedPixelCount: encoded.lightnessClippedPixelCount };
    }
  } else if (!linearPath) {
    const devTask = createNativeRawDevelopmentTask({ ...development, raw: rawOutput.raw }, { yieldControl,
      onProgress: (p) => onProgress?.({ stage: "development", completedTileCount: p.completedTileCount, totalTileCount: p.totalTileCount }) });
    await runTask(devTask);
    developed = devTask.takeOutput();
  } else {
    // Wide gamut: the native development operator up to linear sRGB/D65 (unclipped), then XYZ → target primaries.
    let lastYield = Date.now();
    const linear = await developLinearSrgb({ ...development, raw: rawOutput.raw }, async (completed, total) => {
      onProgress?.({ stage: "development", completedTileCount: completed, totalTileCount: total });
      if (Date.now() - lastYield >= 8) { await yieldControl(); checkAbort(); lastYield = Date.now(); }
    });
    {
      const mapping = perceptual ? prepareRgbGamutMapping({ colorSpace: colorEncoding!, method: "cielab-hue-preserving-chroma-compression", kneeFraction: PERCEPTUAL_GAMUT_KNEE_FRACTION }) : undefined;
      const encoded = encodeSdrFromLinear(linear.rgb, colorEncoding!, pngBitDepth!, mapping);
      developed = { raw: rawOutput.raw, integerSamples: encoded.samples, highlight: linear.highlight, diagnostics: encoded.diagnostics };
      if (mapping) {
        gamutMappingDiagnostics = { method: "cielab-hue-preserving-chroma-compression", kneeFraction: PERCEPTUAL_GAMUT_KNEE_FRACTION,
          adjustedPixelCount: encoded.adjustedPixelCount, lightnessClippedPixelCount: encoded.lightnessClippedPixelCount };
        assume("output.gamutMapping", "model", { method: "cielab-hue-preserving-chroma-compression", kneeFraction: PERCEPTUAL_GAMUT_KNEE_FRACTION, colorSpace: colorEncoding },
          "prepareRgbGamutMapping: CIELAB L* and hue held, chroma above 90 % of the boundary chroma C_max(L*, h) compressed with a tanh knee so it never reaches C_max (Morovič 2008, §10). In-gamut colours below the knee are unchanged; saturated in-gamut colours above it are desaturated slightly. L* ≥ 100 (above the RAW white) maps to white. CIELAB hue is not perceptually constant for saturated blues, so they can shift toward purple.");
      }
      assume("output.colorEncoding.conversion", "model", { from: "linear-srgb-d65 (unclipped)", via: "CIE XYZ", to: colorEncoding, gamutHandling: perceptual ? "cielab-hue-preserving-chroma-compression" : "clip-components",
        transfer: colorEncoding === "rec2020" ? "bt2020-oetf (= BT.709 OETF)" : "srgb (W3C CSS Color 4)" },
        "Developed with the native development operator (demosaic, per-site white-level clip, WB, highlight mode, diagonal camera→XYZ, XYZ→linear sRGB) but before any sRGB clipping, so colours outside sRGB are kept; converted to " +
        colorEncoding + " through XYZ (matrices from primaries and D65, as in W3C CSS Color 4), " + (perceptual ? "gamut-mapped perceptually (output.gamutMapping)" : "components clipped to [0, 1] in the target gamut") +
        ", then encoded and rounded to nearest. RAW white maps to display white, as in the sRGB path.");
    }
  }
  const devMs = Date.now() - devStarted, jpegStarted = Date.now();
  let jpeg: Uint8Array | undefined;
  if (format === "jpeg") {
    const samples = developed.integerSamples as Uint8Array;
    const jpegSha = await sha256Hex(Array.from(samples.subarray(0, Math.min(samples.length, 4096))).join(",") + ":" + samples.length + ":" + sourceSha256);
    const source = { captureId: IDS.capture, imageStateId: "facade-developed", artifactId: "facade-developed-srgb8", sha256: jpegSha, width, height, encoding: "encoded-srgb-8-rgb" as const };
    // The encoder reads every pixel once, in source tiles of at most 256 × 32 aligned to the crop origin.
    const reads = Math.ceil(height / 32) * Math.ceil(width / 256), jpegTick = progress("jpeg", reads);
    const jpegTask = createPrintJpegTask({ source, crop: { x: 0, y: 0, width, height }, outputWidth: width, outputHeight: height, quantizationStep: jpegStep!,
      maximumEncodedBytes: Math.max(65536, width * height * 6), maximumProviderReads: reads,
      // The JPEG records its admission plan, so the raised limit is passed (and recorded) only when the image needs it.
      ...(raisedPixels === undefined || width * height <= PRINT_JPEG_LIMITS.maximumPixels ? {} : { maximumPixels: raisedPixels }) }, {
      readTile: async (request) => {
        jpegTick();
        const out = new Uint8Array(request.width * request.height * 3);
        for (let row = 0; row < request.height; row++) out.set(samples.subarray(((request.y + row) * width + request.x) * 3, ((request.y + row) * width + request.x + request.width) * 3), row * request.width * 3);
        return { ...request, samples: out };
      }, yieldControl });
    const jpegEncodeStarted = clockMs();
    await runTask(jpegTask);
    jpeg = jpegTask.takeOutput().bytes;
    encodeMs = clockMs() - jpegEncodeStarted;
    assume("output.jpeg", "model", { encoder: "photivra-print-jpeg", iccProfile: "photivra-srgb" }, "Baseline JPEG from the existing print JPEG encoder with an embedded sRGB ICC profile; the source digest covers a sample prefix, length and scene digest.");
  }
  const jpegMs = Date.now() - jpegStarted;
  let png: Uint8Array | undefined;
  if (format === "png") {
    const pngStarted = clockMs();
    png = serializePngImage({ width, height, bitDepth: pngBitDepth!, samples: developed.integerSamples, colourEncoding: pngColourEncoding(colorEncoding!),
      ...(raisedPixels === undefined || width * height <= PNG_ENCODER_LIMITS.maximumPixels ? {} : { maximumPixels: raisedPixels }) });
    encodeMs = clockMs() - pngStarted;
    assume("output.png", "model", { encoder: "serializePngImage", bitDepth: pngBitDepth, colourEncoding: pngColourEncoding(colorEncoding!) },
      "Deterministic PNG (8/16-bit RGB, in-house zlib) with the colour encoding signalled in the file: the sRGB chunk for sRGB, otherwise a cICP chunk with ITU-T H.273 primaries/transfer code points. No mastering-display (mDCV) or content-light-level (cLLI) metadata is written.");
  }

  const ranOptions = new Set<SimulateCaptureCostOption>([...(pupil ? ["lens.pupilSampling" as const] : []), ...(projection !== undefined ? ["lens.projection" as const] : []),
    ...(distortion ? ["lens.distortion" as const] : []), ...(vignetting ? ["lens.vignetting" as const] : []), ...(lensPsf ? ["lens.psf" as const] : []),
    ...(diffraction ? ["lens.diffraction" as const] : []), ...(antiAliasing ? ["sensor.antiAliasing" as const] : []),
    ...(temporalSampleCount > 1 ? ["sensor.temporalSampleCount" as const] : []), ...(rotating ? ["motion.rotation" as const] : []),
    ...(rollingSchedule ? ["motion.shutter.rolling" as const] : []), ...(mirrorBorder ? ["output.borderHandling.mirror" as const] : []),
    ...(needsAuto ? ["output.whiteBalance.auto" as const] : []), ...(ahd ? ["output.demosaic.ahd" as const] : []),
    ...(highlightMode === "reconstruct" ? ["output.highlightMode.reconstruct" as const] : []), ...(wideGamut ? ["output.colorEncoding.wide-gamut" as const] : []),
    ...(perceptual ? ["output.gamutMapping.perceptual" as const] : []), ...(format === "jpeg" || format === "png" || format === "dng" ? ["output.format." + format as SimulateCaptureCostOption] : [])]);
  return Object.freeze({
    facadeVersion: SIMULATE_CAPTURE_FACADE_VERSION, engineApiVersion: ENGINE_API_VERSION,
    image: { width, height, format, samples: developed.integerSamples, ...(jpeg ? { jpeg } : {}), ...(png ? { png, colorEncoding: colorEncoding! } : {}), ...(dng ? { dng: dng.bytes } : {}) },
    raw: developed.raw, plan,
    request: { environmentRaw: finalRawInput, siteInput, development, whiteBalanceState,
      ...(diffraction ? { diffraction: { profile: diffraction, psf: diffractionPsf!, execution: diffractionObjectSpace ? "object-space-convolution" as const : "environment-psf-quadrature" as const } } : {}) },
    exposure: { mode, settings: { fNumber, shutterSeconds, iso: resolvedIso }, ev100: Math.log2(fNumber ** 2 / shutterSeconds),
      meteredSceneLuminanceCdPerSquareMeter: meteredLuminance, resolution },
    scene: { sceneId: chart ? "chart:" + chart.preset : callerScene!.sceneId, preset: scenePreset, parameters: chart ? chart.parameters : {},
      illuminant: { id: illuminant.id, description: illuminant.description, illuminanceLux }, distanceM: subjectDistanceM,
      framedWidthM: 2 * metresPerFrameUnit, framedHeightM: 2 * metresPerFrameUnit * aspect, sourceSha256 },
    diagnostics: { providerEvaluationCount, highlight: developed.highlight, rendering: developed.diagnostics, ...(gamutMappingDiagnostics ? { gamutMapping: gamutMappingDiagnostics } : {}),
      timingsMs: { raw: rawMs, whiteBalance: wbMs, development: devMs, jpeg: jpegMs, total: Date.now() - started,
        ...(diffraction && diffractionObjectSpace ? { diffraction: diffractionMs } : {}), ...(demosaicMs === undefined ? {} : { demosaic: demosaicMs }),
        ...(encodeMs === undefined ? {} : { encode: encodeMs }) },
      options: Object.freeze(SIMULATE_CAPTURE_COST_OPTIONS.filter((option) => ranOptions.has(option))) },
    provenance: { scientificStatus: "approximation" as const, cameraPresetId: preset.presetId, cameraPresetVersion: preset.presetVersion,
      evidence: [...FACADE_EVIDENCE, ...preset.evidence],
      composedContracts: ["resolveGenericEquipmentExposureCapabilities", "meterRelativeExposure", "createExposureMeterTargetFromMeteringResult",
        "resolve" + (mode === "manual" ? "Manual" : mode === "aperture-priority" ? "AperturePriority" : mode === "shutter-priority" ? "ShutterPriority" : "ProgramAuto") + "ExposureMode",
        ...(rollingSchedule ? ["resolveElectronicRollingShutterExposureSchedule", "createRollingShutterCaptureExposureSchedule"] : []),
        ...(diffraction ? ["createDiffractionLimitedPsfProfile", ...(diffractionObjectSpace ? ["resolveLensPsfConvolutionKernels", "calculateIrradianceConvolution"] : [])] : []),
        ...(antiAliasing ? ["resolveAntiAliasingSpatialKernel"] : []), "resolveGenericIsoSignalChain", "createNativeEnvironmentRawTask", ...(needsAuto ? ["estimateAutoWhiteBalance"] : []),
        ...(builtInDemosaic ? ["createBuiltInBayerDemosaicProfiles"] : []), ...(ahd ? ["createAhdDemosaicTask"] : []),
        ...(ahd ? ["native RAW development operator (colour, after AHD)", ...(linearPath ? ["resolveRgbColorSpace", ...(perceptual ? ["prepareRgbGamutMapping"] : [])] : ["SDR rendering kernel"])] : linearPath ? ["native RAW development operator (linear, pre-clip)", "resolveRgbColorSpace", ...(perceptual ? ["prepareRgbGamutMapping"] : [])] : ["createNativeRawDevelopmentTask"]),
        ...(jpeg ? ["createPrintJpegTask"] : []), ...(png ? ["serializePngImage"] : []), ...(dng ? ["resolveSensorReadoutRegime", "serializeNativeRawDng"] : [])],
      limitations: ["Educational approximation: synthetic tier sensor values, idealized colorimetric sensor, planar Lambertian scene and point optics; not a calibrated camera emulation.",
        "Not offered by the facade: atmospheric haze and polarizers (the scene-radiance provider contract declares no volumetric transport or polarization), flash, video, HDR brackets and processing operators; compose those APIs directly."] },
    assumptions: Object.freeze(assumptions.map((a) => Object.freeze(a)))
  });
}

/** Chart preset ids accepted by `simulateCapture({ scene: { preset } })`. */
export const SIMULATE_CAPTURE_CHART_PRESETS = CHART_SCENE_PRESETS;
