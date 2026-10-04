# sensor/capture-mode.ts public contracts

Package **1.3.0**, root API **1.3.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## CaptureModeAcquisition

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type CaptureModeAcquisition =
  | SingleFrameCaptureAcquisition
  | FixedMultiFrameCaptureAcquisition
  | VariableMultiFrameCaptureAcquisition;
```

## CaptureModeDefinition

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CaptureModeDefinition {
  modeId: string;
  /**
   * Evidence supporting the existence/overall acquisition behavior of this
   * mode. Field-level facts below retain their own evidence when needed.
   */
  evidence: readonly EvidenceProvenance[];
  acquisition: CaptureModeAcquisition;
  perFrameSampling: CaptureModePerFrameSampling;
  /**
   * Optional ordered sensor-displacement sequence for fixed multi-frame modes.
   * The whole sequence is one evidence-backed fact because published mode
   * documentation commonly describes the sequence as a unit.
   */
  interFrameSensorOffsetsNativeSamples?: SourcedCaptureModeFact<
    readonly CaptureModeSensorOffsetNativeSamples[]
  >;
  /**
   * Ordered reconstruction/combination stages owned by later reconstruction
   * work. These labels reserve semantics; they do not implement algorithms.
   */
  reconstructionStages?: readonly SourcedCaptureModeFact<CaptureModeReconstructionStage>[];
  /**
   * Image raster produced by the capture-mode/reconstruction pipeline before
   * final output crop/resampling.
   *
   * This raster does not redefine physical sensor geometry or field of view.
   */
  processedImageRaster: SourcedCaptureModeFact<RasterDimensions>;
  /**
   * Explicit downstream scientific/model dependencies for this mode.
   */
  dependencies?: readonly CaptureModeDependency[];
}
```

## CaptureModeDependency

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type CaptureModeDependency =
  | "color-sampling-model"
  | "mode-specific-readout-timing"
  | "radiometric-calibration"
  | "inter-frame-registration";
```

## CaptureModePerFrameSampling

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type CaptureModePerFrameSampling =
  | NativeEffectiveCaptureSampling
  | GroupedNativeCaptureSampling
  | DeclaredEffectiveCaptureSampling;
```

## CaptureModeProfile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CaptureModeProfile {
  schemaVersion: "0.1.0";
  modes: readonly CaptureModeDefinition[];
}
```

## CaptureModeReconstructionStage

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type CaptureModeReconstructionStage =
  | "remosaic"
  | "pixel-shift-combination"
  | "multi-frame-computational-combination";
```

## CaptureModeSampleCombinationDomain

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type CaptureModeSampleCombinationDomain =
  | "charge-domain"
  | "pre-conversion-analog"
  | "post-conversion-digital";
```

## CaptureModeSensorOffsetNativeSamples

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CaptureModeSensorOffsetNativeSamples {
  /**
   * Horizontal sensor displacement in units of the native effective sampling
   * pitch. This is not a claim about physical photodiode pitch.
   */
  x: number;
  /**
   * Vertical sensor displacement in units of the native effective sampling
   * pitch. This is not a claim about physical photodiode pitch.
   */
  y: number;
}
```

## DeclaredEffectiveCaptureSampling

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface DeclaredEffectiveCaptureSampling {
  kind: "declared-effective-raster";
  /**
   * Per-frame effective sampling raster for a mode whose sampling relationship
   * to the native grid is not safely expressible as simple integer grouping.
   */
  raster: SourcedCaptureModeFact<RasterDimensions>;
}
```

## FixedMultiFrameCaptureAcquisition

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface FixedMultiFrameCaptureAcquisition {
  kind: "fixed-multi-frame";
  frameCount: SourcedCaptureModeFact<number>;
}
```

## GroupedNativeCaptureSampling

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface GroupedNativeCaptureSampling {
  kind: "grouped-native-samples";
  groupWidthSamples: SourcedCaptureModeFact<number>;
  groupHeightSamples: SourcedCaptureModeFact<number>;
  /**
   * Omitted means unknown/unasserted. Do not infer where combination occurs
   * from the word "binning" or from the raster ratio.
   */
  combinationDomain?: SourcedCaptureModeFact<CaptureModeSampleCombinationDomain>;
}
```

## NativeEffectiveCaptureSampling

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface NativeEffectiveCaptureSampling {
  kind: "native-effective-raster";
}
```

## parseCaptureModeProfile

Parses a capture-mode profile without inferring sensor physics from output
resolution or marketing mode names.

The profile is intentionally orthogonal: acquisition frame sequence,
per-frame sampling, optional inter-frame sensor shift, reconstruction stages,
processed raster and downstream dependencies are independent axes.

```ts
export function parseCaptureModeProfile(
  value: unknown
): CaptureModeProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## resolveCaptureMode

Resolves one capture mode against the selected sensor's native effective
image-sampling raster.

Resolution changes do not mutate physical sensor geometry. The returned
processed raster is pre-output geometry and must not be used to infer crop
factor, field of view or physical photosite count.

```ts
export function resolveCaptureMode(
  input: ResolveCaptureModeInput
): ResolvedCaptureMode;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ResolveCaptureModeInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolveCaptureModeInput {
  nativeRaster: NativeImageRaster;
  profile: CaptureModeProfile;
  modeId: string;
}
```

## ResolvedCaptureMode

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolvedCaptureMode {
  modeId: string;
  modeEvidence: readonly EvidenceProvenance[];
  nativeRaster: NativeImageRaster;
  nativeRasterSemantic:
    "effective-image-sampling-grid-not-photosite-count";
  acquisition:
    | {
        kind: "single-frame";
        frameCount: 1;
      }
    | {
        kind: "fixed-multi-frame";
        frameCount: SourcedCaptureModeFact<number>;
      }
    | {
        kind: "variable-multi-frame";
        evidence: readonly EvidenceProvenance[];
        minimumFrameCount?: SourcedCaptureModeFact<number>;
        maximumFrameCount?: SourcedCaptureModeFact<number>;
      };
  perFrameSampling:
    | {
        kind: "native-effective-raster";
        raster: NativeImageRaster;
      }
    | {
        kind: "grouped-native-samples";
        raster: RasterDimensions;
        groupWidthSamples: SourcedCaptureModeFact<number>;
        groupHeightSamples: SourcedCaptureModeFact<number>;
        combinationDomain?: SourcedCaptureModeFact<CaptureModeSampleCombinationDomain>;
      }
    | {
        kind: "declared-effective-raster";
        raster: SourcedCaptureModeFact<RasterDimensions>;
      };
  interFrameSensorOffsetsNativeSamples?: SourcedCaptureModeFact<
    readonly CaptureModeSensorOffsetNativeSamples[]
  >;
  reconstructionStages: readonly SourcedCaptureModeFact<CaptureModeReconstructionStage>[];
  processedImageRaster: SourcedCaptureModeFact<RasterDimensions>;
  processedImageMegapixels: number;
  dependencies: readonly CaptureModeDependency[];
  physicalSensorGeometryMutation: false;
  photositeCountInference:
    "not-permitted-from-native-or-processed-raster";
  finalOutputRasterOwnership:
    "downstream-capture-output-geometry";
}
```

## SingleFrameCaptureAcquisition

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SingleFrameCaptureAcquisition {
  kind: "single-frame";
}
```

## SourcedCaptureModeFact

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SourcedCaptureModeFact<T> = EvidenceBackedFact<T>;
```

## VariableMultiFrameCaptureAcquisition

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface VariableMultiFrameCaptureAcquisition {
  kind: "variable-multi-frame";
  /**
   * Evidence that the mode is variable/multi-frame, even when exact count
   * bounds are not published.
   */
  evidence: readonly EvidenceProvenance[];
  minimumFrameCount?: SourcedCaptureModeFact<number>;
  maximumFrameCount?: SourcedCaptureModeFact<number>;
}
```
