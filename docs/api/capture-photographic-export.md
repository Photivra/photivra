# capture/photographic-export.ts public contracts

Package **1.4.0**, root API **1.4.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateProcessedSensorRaw

Reconstruct exact attached RAW, develop color/WB once, correct, orient/crop and encode SDR; no file/display IO.

```ts
export function calculateProcessedSensorRaw(input: ProcessedSensorRawInput): CalculationResult<ProcessedSensorRawResult>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## createPhotographicExportPair

Serialize one authoritative RAW capture to a lossless uncompressed CFA DNG and an independently
packed baseline JPEG. Shared metadata comes from the committed capture; orientation/WB/rendering
never rewrite native RAW codes.

Paired export preserves one revalidated native post-ADC RAW frame for DNG and develops that same
frame through explicit reconstruction, approximate sensor-channel color/WB and SDR policy for JPEG.
File identity and RAW data identity are distinct. Hashing is asynchronous; input data is copied
before the first await. Full-native execution is limited to 4096 sites.

```ts
export async function createPhotographicExportPair(input: PhotographicExportInput): Promise<PhotographicExportPair>;
```

This call is asynchronous; byte hashing uses the caller runtime's Web Crypto.

## ExportSensorColorProfile

Explicit approximation of normalized camera-channel -> scene XYZ/D65, never inferred from RGB/CFA names.

```ts
export interface ExportSensorColorProfile {
  schemaVersion: "0.1.0";
  profileId: string;
  profileVersion: string;
  colorSamplingProfileId: string;
  channelIds: readonly ["red", "green", "blue"];
  scientificStatus: "approximation";
  referenceIlluminant: "D65";
  normalizedCameraChannelsToXyz: Matrix;
  evidence: readonly EvidenceProvenance[];
  limitations: readonly string[];
}
```

## parseExportSensorColorProfile

Validates independently supplied numeric profile evidence and binds the approximation to the exact CFA profile.

```ts
export function parseExportSensorColorProfile(value: unknown): ExportSensorColorProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## parsePhotographicExportInput

Adds file metadata/encoding validation to the shared processed RAW policy.

```ts
export function parsePhotographicExportInput(value: unknown): PhotographicExportInput;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## parseProcessedSensorRawInput

Revalidates one attached RAW snapshot and explicit processing policy.
Crop sampling and reconstruction coverage fail here before
per-pixel execution. Successful parsing does not establish kernel edge support,
correction support or container encoding readiness; those retain execution
checks. Input is copied; no file or display backend runs.

```ts
export function parseProcessedSensorRawInput(value: unknown): ProcessedSensorRawInput;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## PHOTOGRAPHIC_EXPORT_SCHEMA_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
PHOTOGRAPHIC_EXPORT_SCHEMA_VERSION = "0.1.0" as const
```

## PhotographicExportInput

Optional explicit exporter boundary; no files, clocks, randomness, network or encoder dependency.

```ts
export interface PhotographicExportInput {
  reconstruction: RawFrameReconstructionInput;
  colorProfile: ExportSensorColorProfile;
  whiteBalance: "not-required" | "apply-resolved-sensor-gains";
  rendering: SdrRenderingProfile;
  metadata: Omit<CaptureExportMetadataInput, "capture">;
  /** Caller-declared public scene/version, explicitly bound to the committed scene state. */
  sceneProfile: { id: string; version: string; sceneStateId: string };
  /** JPEG constant quantization step 1..255, not an emulated manufacturer's 'quality' scale. */
  jpegQuantizationStep: number;
  /** Optional native-optical post-color correction; JPEG only, RAW records informational intent. */
  correction?: CaptureCorrectedSdrInput["correction"];
}
```

## PhotographicExportPair

Owned byte arrays are mutable; identities/hashes refer to the exact bytes returned at creation.

```ts
export interface PhotographicExportPair {
  schemaVersion: typeof PHOTOGRAPHIC_EXPORT_SCHEMA_VERSION;
  metadata: CaptureExportMetadataPair;
  simulationHashAlgorithm: "sha-256";
  simulationHash: string;
  rawDataUniqueId: string;
  uniqueCameraModel: string;
  source: CalculationResult<RawFrameReconstruction>;
  rendering: CalculationResult<SdrRenderingResult>;
  nativeDefaultCrop: RasterRect;
  /** Derived JPEG rectangle in the declared oriented output; never replaces the RAW default crop. */
  processedOutputView: { rect: RasterRect; pixelWidth: number; pixelHeight: number };
  correction: CalculationResult<CaptureCorrectedSdrResult> | null;
  rawCorrectionIntent: CalculationResult<ResolvedLensCorrectionPlan> | null;
  imageDataPairing: "jpeg-generated-from-exact-attached-raw";
  dng: { mediaType: "image/dng"; bytes: Uint8Array; sha256: string };
  jpeg: { mediaType: "image/jpeg"; bytes: Uint8Array; sha256: string };
  interoperability: "independent-decode-required-editor-validation-pending";
}
```

## ProcessedSensorRawInput

Explicit post-ADC RAW development policy shared by preview and file output.

```ts
export type ProcessedSensorRawInput = Pick<PhotographicExportInput,
  "reconstruction" | "colorProfile" | "whiteBalance" | "rendering" | "correction">;
```

## ProcessedSensorRawResult

Owned derived preview/JPEG processing record for the exact attached native RAW.
Child reconstruction/color/WB/correction/rendering results expose their input
and output domains and independent clipping/cost diagnostics. The output view is
oriented/cropped SDR, while the native default crop and physical capture history
remain unchanged. Returned arrays are pre-file pixels, not a lossy JPEG decode.

```ts
export interface ProcessedSensorRawResult {
  inputDomain: "post-adc-native-sensor-raw";
  colorProfile: ExportSensorColorProfile;
  whiteBalancePolicy: ProcessedSensorRawInput["whiteBalance"];
  outputDomain: "output-referred-srgb-d65-sdr";
  physicalCaptureModified: false;
  displayAdaptationApplied: false;
  whiteBalance: "applied-here" | "not-required";
  source: CalculationResult<RawFrameReconstruction>;
  rendering: CalculationResult<SdrRenderingResult>;
  nativeDefaultCrop: RasterRect;
  processedOutputView: PhotographicExportPair["processedOutputView"];
  correction: CalculationResult<CaptureCorrectedSdrResult> | null;
  rawCorrectionIntent: CalculationResult<ResolvedLensCorrectionPlan> | null;
}
```
