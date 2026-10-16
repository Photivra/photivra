# facade/simulate-capture.ts public contracts

The package and root API versions are recorded once in [Navigation](../API_REFERENCE.md) · [Developer guide](https://github.com/Photivra/photivra/blob/main/docs/DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## SIMULATE_CAPTURE_DEFAULT_ILLUMINANCE_LUX

Default illuminance: an 18 % grey card is at the ISO 2720 metered exposure for f/8, 1/125 s, ISO 100.

```ts
SIMULATE_CAPTURE_DEFAULT_ILLUMINANCE_LUX = Math.PI * METER_CALIBRATION_K * DEFAULTS.fNumber ** 2 /
  (DEFAULTS.shutterSeconds * DEFAULTS.iso * GREY_CARD_REFLECTANCE)
```

## SIMULATE_CAPTURE_FACADE_VERSION

Version of the facade's request construction; changes whenever the same input builds a different request.

```ts
SIMULATE_CAPTURE_FACADE_VERSION = "1.0.0" as const
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

## SimulateCaptureExposureMode

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SimulateCaptureExposureMode = "manual" | "aperture-priority" | "shutter-priority" | "program";
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
    /** Aperture for manual and aperture-priority modes. Default 8. */
    fNumber?: number;
    /** Focus distance in metres. Default: the subject distance. */
    focusDistanceM?: number;
    /** Opt-in ideal circular-pupil ray sampling (defocus/depth of field). Default off (central ray only). */
    pupilSampling?: { radialSamples: number; angularSamples: number };
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
  /** Illuminance on the scene plane, lux. Default 17 453 lux (see assumptions). */
  illuminanceLux?: number;
  output?: {
    /** Output pixels; the native sensor raster adds a one-site demosaic border on each side. Defaults 64 × 64. */
    width?: number;
    height?: number;
    /** Default "srgb-8". */
    format?: SimulateCaptureOutputFormat;
    /** Default "identity". */
    toneCurve?: SdrToneCurve;
    /** Default "clip". */
    highlightMode?: RawHighlightMode;
    /** Default "scene-illuminant". */
    whiteBalance?: SimulateCaptureWhiteBalance;
    /** JPEG constant quantization step 1-255 (not a manufacturer 'quality'). Default 2. */
    jpegQuantizationStep?: number;
  };
  sensor?: {
    /** Pixel pitch in micrometres. Default 6. */
    pixelPitchMicrometers?: number;
    /** Maximum spectral quadrature subinterval in nm. Default 20. */
    spectralStepNanometers?: number;
    /** Temporal midpoint samples across the exposure. Default 1. */
    temporalSampleCount?: number;
    /** Noise seed (uint32). Default 1. */
    noiseSeed?: number;
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
export type SimulateCaptureOutputFormat = "srgb-8" | "srgb-16" | "jpeg";
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
    /** Interleaved RGB, sRGB-encoded (IEC 61966-2-1), row-major from the top-left. */
    samples: Uint8Array | Uint16Array;
    /** Baseline JPEG bytes when format is "jpeg". */
    jpeg?: Uint8Array;
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
    /** SHA-256 of the canonical scene description, recorded as the capture source digest. */
    sourceSha256: string;
  };
  diagnostics: {
    providerEvaluationCount: number;
    highlight: RawHighlightDiagnostics;
    rendering: SdrRenderingResult["diagnostics"];
    timingsMs: { raw: number; whiteBalance: number; development: number; jpeg: number; total: number };
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
