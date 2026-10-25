# facade/simulate-capture.ts public contracts

The package and root API versions are recorded once in [Navigation](../API_REFERENCE.md) · [Developer guide](https://github.com/Photivra/photivra/blob/main/docs/DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## DisplayViewResult

Result of {@link simulateDisplayView }: the full-resolution capture resized for display, estimated; not a capture.

```ts
export interface DisplayViewResult {
  kind: "display-view";
  /** Human-readable label for a user interface. */
  label: string;
  facadeVersion: typeof SIMULATE_CAPTURE_FACADE_VERSION;
  engineApiVersion: string;
  /** The display view (or its region): interleaved sRGB samples, row by row from the top-left. */
  image: { width: number; height: number; format: "srgb-8" | "srgb-16"; samples: Uint8Array | Uint16Array };
  /**
   * The view: display size, the capture frame it shows (output pixels), real pixels per display pixel along each axis,
   * the samples per axis and, with `view.region`, the rendered rectangle.
   */
  view: { width: number; height: number; frameWidth: number; frameHeight: number; scaleX: number; scaleY: number; samplesPerAxis: number;
    region?: { x: number; y: number; width: number; height: number } };
  /** The resolved exposure of the capture this view shows. */
  exposure: { mode: SimulateCaptureExposureMode; settings: { fNumber: number; shutterSeconds: number; iso: number }; ev100: number };
  scene: SimulateCaptureResult["scene"];
  /**
   * Work done: real pixels sampled, real-site expectations evaluated, scene queries, display pixels sampled in full (detail) or with
   * a quarter of the samples per axis (uniform), display pixels whose value includes the AHD low-signal correction, and wall-clock
   * milliseconds (diagnostic only; never affects the samples).
   */
  diagnostics: { sampleCount: number; siteEvaluations: number; sceneLookups: number; detailPixelCount: number; uniformPixelCount: number; ahdCorrectedPixelCount: number;
    timingsMs: { view: number; total: number } };
  provenance: { scientificStatus: "approximation"; cameraPresetId: string; cameraPresetVersion: string; evidence: readonly EvidenceProvenance[];
    composedContracts: readonly string[]; limitations: readonly string[] };
  /** The capture request's assumptions, then `view.definition`, `view.estimation`, `view.noise`, `view.demosaic` and `view.source`. */
  assumptions: readonly SimulateCaptureAssumption[];
}
```

## IdealReferenceResult

Result of {@link simulateIdealReference}: an ideal reference image, not a capture (no RAW, plan or request).

```ts
export interface IdealReferenceResult {
  kind: "ideal-reference";
  /** Human-readable label for a user interface. */
  label: string;
  facadeVersion: typeof SIMULATE_CAPTURE_FACADE_VERSION;
  engineApiVersion: string;
  image: { width: number; height: number; format: SimulateCaptureOutputFormat; samples: Uint8Array | Uint16Array; png?: Uint8Array; colorEncoding?: SimulateCaptureColorEncoding };
  /** The resolved exposure of the capture this reference matches. */
  exposure: { mode: SimulateCaptureExposureMode; settings: { fNumber: number; shutterSeconds: number; iso: number }; ev100: number };
  scene: SimulateCaptureResult["scene"];
  region?: { x: number; y: number; width: number; height: number; frameWidth: number; frameHeight: number };
  diagnostics: { sampleCount: number; timingsMs: { reference: number; total: number } };
  provenance: { scientificStatus: "approximation"; cameraPresetId: string; cameraPresetVersion: string; evidence: readonly EvidenceProvenance[];
    composedContracts: readonly string[]; limitations: readonly string[] };
  /** The capture request's assumptions, then `reference.kind`, `reference.excludes`, `reference.exposure` and `reference.sampling`. */
  assumptions: readonly SimulateCaptureAssumption[];
}
```

## serializeSimulatedCaptureDngFromParts

Writes the whole-frame DNG of `options` (`output.format: "dng"`, no `output.region`) from the packed RAW of region renders of
the same request (#391), so the RAW can render in parallel. A region render's native sites are the same sites as the whole
render's (each site's seeds come from its index in the whole raster), so the joined RAW is the whole render's RAW, and the
request is resolved and written exactly as `simulateCapture` writes its DNG: the bytes are the same. The parts must cover
every native site of the frame; where they overlap (each region carries the demosaic margin) their sites must agree. Region
renders of the request with any format serve (a region's own `output.format` does not change its RAW). A region cannot take
`output.whiteBalance: "auto"` or `output.dng`: render the parts with a fixed white balance (the RAW codes do not depend on the
white-balance intent) and pass the DNG's own options here, where auto white balance is measured over the joined frame.

```ts
export async function serializeSimulatedCaptureDngFromParts(options: SimulateCaptureOptions, parts: readonly SimulateCaptureDngPart[]): Promise<NativeRawDng>;
```

This call is asynchronous; byte hashing uses the caller runtime's Web Crypto.

## SIMULATE_CAPTURE_BOX_APERTURE_DEFAULT_SAMPLES

Default midpoint samples per axis of `sensor.pixelAperture: "box"`.

```ts
SIMULATE_CAPTURE_BOX_APERTURE_DEFAULT_SAMPLES = 4
```

## SIMULATE_CAPTURE_COST_OPTIONS

Options reported in `diagnostics.options` (2.1), in this order, when they ran: the ones that change how much work
a capture does. `motion.rotation` is a non-zero angular velocity; `sensor.temporalSampleCount` a count above 1.

```ts
SIMULATE_CAPTURE_COST_OPTIONS = Object.freeze(["lens.pupilSampling", "lens.projection", "lens.distortion", "lens.vignetting", "lens.psf",
  "lens.diffraction", "sensor.antiAliasing", "sensor.pixelAperture.box", "sensor.temporalSampleCount", "motion.rotation", "motion.shutter.rolling", "output.borderHandling.mirror", "output.region",
  "output.whiteBalance.auto", "output.demosaic.ahd", "output.highlightMode.reconstruct", "output.colorEncoding.wide-gamut", "output.gamutMapping.perceptual",
  "output.format.jpeg", "output.format.png", "output.format.dng"] as const)
```

## SIMULATE_CAPTURE_DEFAULT_ILLUMINANCE_LUX

Default illuminance, lux: an 18 % Lambertian grey card (L = 0.18·E/π) then gets exactly the CIPA DC-004 standard
output sensitivity reference exposure H = 10/S at f/8, 1/125 s, ISO 100:
E = π·10·N²/(0.65·t·S·0.18) = π·80 000/11.7 ≈ 21 480.98 lux.

```ts
SIMULATE_CAPTURE_DEFAULT_ILLUMINANCE_LUX = Math.PI * sosReferenceLuminance(DEFAULTS.fNumber, DEFAULTS.shutterSeconds, DEFAULTS.iso) /
  GREY_CARD_REFLECTANCE
```

## SIMULATE_CAPTURE_FACADE_VERSION

Version of how the facade builds requests. It changes whenever the same input would build a different request.

```ts
SIMULATE_CAPTURE_FACADE_VERSION = "1.0.0" as const
```

## SIMULATE_DISPLAY_VIEW_DEFAULT_SAMPLES_PER_AXIS

Default stratified samples per axis of a display view (`view.samplesPerAxis`): 16 × 16 sampled real pixels per display pixel with detail, 4 × 4 where it is uniform.

```ts
SIMULATE_DISPLAY_VIEW_DEFAULT_SAMPLES_PER_AXIS = 16
```

## simulateCapture

Simulates one still capture of a planar scene and returns the developed image, the packed RAW, the full
underlying request/plan, provenance and every assumption made. See docs/QUICK_START.md.

```ts
export async function simulateCapture(options: SimulateCaptureOptions): Promise<SimulateCaptureResult>;
```

This call is asynchronous; byte hashing uses the caller runtime's Web Crypto.

## SimulateCaptureAssumption

One decision the facade made: a default, a derived value or a fixed modelling choice.

```ts
export interface SimulateCaptureAssumption {
  /** Dotted option path or modelling topic, for example "exposure.shutterSeconds" or "model.lens-psf". */
  id: string;
  kind: "default" | "derived" | "model";
  value: unknown;
  explanation: string;
}
```

## SimulateCaptureBorderHandling

`margin` renders extra native sites around the output, as far as the kernel reaches. `mirror` renders
exactly the output and reads mirrored (reflect-101) copies of the missing border sites. Mirroring is
checked to keep the CFA (colour filter array) pattern consistent.

```ts
export type SimulateCaptureBorderHandling = "margin" | "mirror";
```

## SimulateCaptureColorEncoding

PNG colour encoding. `srgb` is the developed sRGB output. The others take the developed linear
colour (camera → XYZ → linear sRGB/D65, unclipped) and convert it through CIE XYZ into the target
primaries:
- `display-p3`: Display P3 primaries (W3C CSS Color 4 `display-p3`; also SMPTE EG 432-1) with the
  sRGB transfer function;
- `rec2020`: ITU-R BT.2020 primaries and OETF.
PQ and HLG (BT.2100) are not part of 2.0; see THIRD_PARTY.md.

```ts
export type SimulateCaptureColorEncoding = "srgb" | "display-p3" | "rec2020";
```

## SimulateCaptureCostOption

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SimulateCaptureCostOption = typeof SIMULATE_CAPTURE_COST_OPTIONS[number];
```

## SimulateCaptureDemosaic

Demosaic. `bilinear`: the built-in Bayer kernels (`createBuiltInBayerDemosaicProfiles`). `ahd` (2.1): adaptive
homogeneity-directed demosaicing (`createAhdDemosaicTask`, after Hirakawa & Parks 2005), a non-linear
edge-directed method that reduces zipper and false colour on sharp edges.

```ts
export type SimulateCaptureDemosaic = "bilinear" | "ahd";
```

## SimulateCaptureDngPart

One part of a whole-frame DNG (#391): a region render's packed RAW and where its native sites lie (`result.raw`, `result.region`).

```ts
export interface SimulateCaptureDngPart {
  raw: Pick<NativeRawOutput, "codes" | "blackLevels" | "digitalSaturationCodes" | "saturationFlags" | "effectiveSaturationCodes">;
  region: { nativeRect: { x: number; y: number; width: number; height: number } };
}
```

## SimulateCaptureExposureMode

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SimulateCaptureExposureMode = "manual" | "aperture-priority" | "shutter-priority" | "program";
```

## SimulateCaptureLensDistortion

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SimulateCaptureLensDistortion =
  | { kind: "radial"; profile: RadialDistortionProfile }
  | { kind: "brown-conrady"; profile: BrownConradyDistortionProfile };
```

## SimulateCaptureMotion

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SimulateCaptureMotion {
  /** Constant camera angular velocity, rad/s, in the engine's pitch/yaw/roll convention. Missing axes are 0. */
  angularVelocityRadPerSec?: { pitch?: number; yaw?: number; roll?: number };
  /** Default "global". `rolling` derives the exposure schedule from the body's rolling readout declaration. */
  shutter?: "global" | "rolling";
  /** Rolling shutter only: time from the first to the last line over the simulated frame, in s. Default: the body's declared readout skew. */
  rollingShutterSkewSeconds?: number;
}
```

## SimulateCaptureOptions

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SimulateCaptureOptions {
  /** Generic tier preset id or a full preset record (for example a modified copy of a catalog entry). Default "professional". */
  camera?: GenericEquipmentTier | GenericEquipmentTierPreset;
  lens?: {
    /** Must lie in the lens capability (the generic primes are 50 mm). Default: the lens's shortest focal length. */
    focalLengthMm?: number;
    /**
     * Opt-in (2.3): a lens of the generic prime family by its full-frame-equivalent focal length
     * (`GENERIC_PRIME_EQUIVALENT_FOCAL_LENGTHS_MM`). Its physical focal length is the equivalent ÷ the diagonal crop
     * factor of the simulated frame (output width × height × pixel pitch); it replaces the tier lens's focal length and
     * f-number range (the tier lens's transmission is kept). An f-number outside the prime's range, or a subject or
     * focus distance below its minimum focus distance, is rejected. Not combinable with `focalLengthMm`.
     */
    prime?: number;
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
     * the longest spectral node, capped at 32 sites. Not combinable with `psf` or `pupilSampling`. Default off.
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
  scene: ChartScene | CallerReflectanceScene | CallerRadianceScene | CallerMaterialScene;
  /** Distance from the camera to the scene plane in metres. Default 5. */
  subjectDistanceM?: number;
  /**
   * Opt-in (2.3) fixed-size chart: place the scene at this physical size on the plane at the subject distance,
   * centred on the optical axis, instead of sizing it to fill the frame. Outside it the plane is a neutral surround
   * (default 18 %). Chart presets are resolved in the chart's own frame (aspect heightM / widthM); caller functions
   * are called only on the chart and receive chart-local `chartU`, `chartV`. `result.scene.chart` reports the
   * framed width, the fraction of the frame the chart covers and the thin-lens magnification.
   */
  chartSize?: ChartSizeOption;
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
     * Opt-in (2.4) text written into the file for formats "jpeg", "png" and "dng": the caller's description,
     * software, copyright and comment, unchanged (JPEG XMP + COM, PNG tEXt/iTXt, DNG TIFF tags + XMP; see the
     * quick start). Each field is 1–2048 UTF-8 bytes with no control characters except line feed. Default: none.
     */
    metadata?: OutputTextMetadata;
    /**
     * Opt-in large images: the most native sensor sites (the output plus the demosaic margin on each side) the
     * capture may allocate, an integer up to `NATIVE_RAW_LIMITS.ceilingPixels` (2^27). With it, `width` and
     * `height` may each reach 16 384 sites including the margin; without it they stay at most 4094. Time and
     * memory grow with the pixel count (see "Large images" in the quick start); browsers may fail at large sizes.
     */
    maximumPixels?: number;
    /**
     * Opt-in (2.3) region rendering: render only this rectangle, in output-pixel coordinates of the whole frame
     * `width` × `height` (x right, y down from its top-left). The pixels are byte-identical to the same pixels of
     * the whole render: framing, metering, exposure, noise seeds (absolute native site indices), rolling-shutter row
     * timing, diffraction and demosaic all use the whole frame. Use it to tile a large frame across workers or to
     * render a 100 % crop. `result.image` is the region; `result.region` reports it. Not combinable with
     * `whiteBalance: "auto"`, whose statistics would come from the region only. From 2.6 the diffraction convolution
     * covers only the region plus the kernel and filter reach, so a small region of a large frame costs about as much
     * as a capture of the region's size.
     */
    region?: { x: number; y: number; width: number; height: number };
  };
  /** Camera motion and shutter type. Default: still camera, global electronic shutter. */
  motion?: SimulateCaptureMotion;
  sensor?: {
    /**
     * Pixel pitch in micrometres, 0.5–1000. Default 6. The simulated sensor is output width × pitch wide. 2.5: above 100 µm the
     * capture is a downsized view of a whole frame (for example 36 mm / 48 pixels = 750 µm), recorded in the assumption
     * `sensor.wholeFrameView`: brightness is unchanged and the noise is that of a binned view, not of the real sensor's pixels.
     */
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
    /**
     * Opt-in (2.3) pixel aperture. `"point"` (default): each site samples the irradiance at its centre.
     * `"box"`: each site integrates the irradiance over its whole square photosite (fill factor 1) with an
     * N × N midpoint rule, N = `samplesPerAxis` (1–16, default 4), so detail finer than a pixel averages out as
     * on a real sensor (pixel MTF |sinc(f·p)|) instead of aliasing. Multiplies the scene queries by N².
     */
    pixelAperture?: SimulateCapturePixelAperture;
  };
  /** Aborting cancels the running task; the promise rejects with a domain error and returns no partial image. */
  signal?: AbortSignal;
  /** Called after each committed RAW, development or JPEG tile. Cannot change output. */
  onProgress?: (progress: SimulateCaptureProgress) => void;
}
```

## SimulateCaptureOutputFormat

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SimulateCaptureOutputFormat = "srgb-8" | "srgb-16" | "jpeg" | "png" | "dng";
```

## SimulateCapturePixelAperture

Pixel aperture (2.3): centre sampling, or the square photosite integrated with an N × N midpoint rule.

```ts
export type SimulateCapturePixelAperture = "point" | "box" | { kind: "box"; samplesPerAxis?: number };
```

## SimulateCaptureProgress

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SimulateCaptureProgress {
  stage: "raw" | "white-balance" | "development" | "jpeg";
  completedTileCount: number;
  totalTileCount: number;
}
```

## SimulateCaptureResult

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
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
  /**
   * Packed native RAW (codes, black levels, saturation flags) as produced by the native environment RAW task. With
   * `output.region` (2.3): the region's native sites only, with `plan` describing that raster (its active area is the
   * region); `request.environmentRaw` and `request.siteInput` stay those of the whole frame.
   */
  raw: NativeRawOutput;
  plan: NativeRawPlan;
  /**
   * 2.3, present with `output.region`: the rendered rectangle in output pixels of the whole `frameWidth` × `frameHeight`
   * frame, and the native sites rendered for it (`nativeRect`, in the whole frame's native raster: the region, the
   * demosaic reach on each side clipped to the raster, and its origin rounded down to the 2 × 2 CFA repeat).
   */
  region?: { x: number; y: number; width: number; height: number; frameWidth: number; frameHeight: number; nativeRect: { x: number; y: number; width: number; height: number } };
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
     * 2.3, present with `chartSize`: the chart's physical size and surround, the fraction of the frame width and
     * height it covers (above 1 when it is larger than the frame and cropped), the thin-lens magnification
     * v/d (image distance over subject distance, the scale the facade's framing uses) and the chart's size on the
     * sensor in millimetres and output pixels.
     */
    chart?: { widthM: number; heightM: number; surroundReflectance: number; frameWidthFraction: number; frameHeightFraction: number;
      magnification: number; imageWidthMm: number; imageHeightMm: number; imageWidthPixels: number; imageHeightPixels: number };
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
```

## SimulateCaptureSensorAntiAliasing

Optical anti-aliasing (low-pass) filter (2.1), modelled as birefringent point splitting: each image point is
split into equally bright copies (the engine's `normalized-point-splitting-kernel` optical-stack response).
- `four-spot`: two crossed birefringent plates; copies at (±d/2, ±d/2), weight 1/4 each, MTF |cos(π·f_x·d)·cos(π·f_y·d)|.
- `two-spot`: one plate splitting along `axis`; copies at ±d/2, weight 1/2 each, MTF |cos(π·f·d)|.
- `point-splitting`: the engine contract itself, offsets in micrometres (+x right, +y down) and positive weights
  summing to 1 (at most 16 components, each within 4 sites).
d = `separationSites` × pixel pitch, 0 < separationSites ≤ 4, default 1 (first MTF zero at the sensor's Nyquist
frequency 1/(2·pitch)).

```ts
export type SimulateCaptureSensorAntiAliasing =
  | { kind: "four-spot"; separationSites?: number }
  | { kind: "two-spot"; axis: "horizontal" | "vertical"; separationSites?: number }
  | { kind: "point-splitting"; components: readonly AntiAliasingPointSplitComponent[] };
```

## SimulateCaptureWhiteBalance

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SimulateCaptureWhiteBalance =
  | "scene-illuminant"
  | "auto"
  | "none"
  | { kelvin: number; tint?: number }
  | { channelGains: { red: number; green: number; blue: number } };
```

## SimulateDisplayViewOptions

The display size and sampling of {@link simulateDisplayView }.

```ts
export interface SimulateDisplayViewOptions {
  /** Display pixels, 1 to the capture's output width and height. */
  width: number;
  height: number;
  /** Stratified Monte Carlo samples per axis for each display pixel's expected value (1–32, default 8: 64 real pixels). */
  samplesPerAxis?: number;
  /** "srgb-8" (default) or "srgb-16". */
  format?: "srgb-8" | "srgb-16";
  /** Render only this rectangle of the display view, in display pixels; byte-identical to the same pixels of the whole view. */
  region?: { x: number; y: number; width: number; height: number };
}
```

## simulateIdealReference

The ideal reference of a capture request (2.3): the same scene, framing, chart size, output size, region and pixel
grid as `simulateCapture(options)` would use, rendered with no camera effects (no lens blur, diffraction, defocus,
distortion, vignetting, anti-aliasing filter, mosaic or demosaic, noise, dark signal or motion), at the capture's
own exposure and developed with its white balance, colour matrices, tone curve and encoding (the
`reference.exposure` assumption). Deterministic and cheap: no RAW is simulated. Formats srgb-8, srgb-16 and png.
The result is labelled `kind: "ideal-reference"`; it is not a capture.

```ts
export async function simulateIdealReference(options: SimulateCaptureOptions): Promise<IdealReferenceResult>;
```

This call is asynchronous; byte hashing uses the caller runtime's Web Crypto.
