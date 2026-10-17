# capture/native-raw-dng.ts public contracts

The package and root API versions are recorded once in [Navigation](../API_REFERENCE.md) · [Developer guide](https://github.com/Photivra/photivra/blob/main/docs/DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## NATIVE_RAW_DNG_SCHEMA_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
NATIVE_RAW_DNG_SCHEMA_VERSION = "1.0.0" as const
```

## NativeRawDng

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
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
```

## NativeRawDngChannelNoise

Output-referred noise parameters of one CFA channel (see the module notes).

```ts
export interface NativeRawDngChannelNoise {
  /** Electrons per output RAW code (system conversion gain divided by any post-ADC digital gain). */
  conversionGainElectronsPerCode: number;
  /** Combined RMS read noise, electrons. */
  readNoiseRmsElectrons: number;
}
```

## serializeNativeRawDng

Serializes packed native RAW codes to a lossless uncompressed CFA DNG (see the module notes for every
tag and its source). The input arrays are copied before the first await.

```ts
export async function serializeNativeRawDng(input: SerializeNativeRawDngInput): Promise<NativeRawDng>;
```

This call is asynchronous; byte hashing uses the caller runtime's Web Crypto.

## SerializeNativeRawDngInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
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
```
