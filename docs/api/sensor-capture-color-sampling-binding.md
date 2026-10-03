# sensor/capture-color-sampling-binding.ts public contracts

Package **1.2.0**, root API **1.2.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## CaptureModeFullFrameSampleIndex

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CaptureModeFullFrameSampleIndex {
  /**
   * Zero-based index in the selected mode's full-frame per-frame effective
   * sampling raster. Crop-local coordinates must be translated to absolute
   * full-frame mode indices before calling this API.
   */
  x: number;
  y: number;
}
```

## ColorSamplingChannelComposition

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type ColorSamplingChannelComposition =
  | {
      kind: "single-channel";
      channelId: string;
    }
  | {
      kind: "mixed-channels";
      channelIds: readonly string[];
    };
```

## ColorSamplingChannelSiteCount

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ColorSamplingChannelSiteCount {
  channelId: string;
  siteCount: number;
}
```

## ColorSamplingSiteGridDimensions

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ColorSamplingSiteGridDimensions {
  widthSites: number;
  heightSites: number;
}
```

## ColorSamplingSiteRect

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ColorSamplingSiteRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

## GroupedCaptureModeSamplingAnchorDeclaration

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface GroupedCaptureModeSamplingAnchorDeclaration {
  anchor: "native-effective-raster-top-left";
  evidence: readonly EvidenceProvenance[];
}
```

## NativeEffectiveRasterColorSamplingBindingProfile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface NativeEffectiveRasterColorSamplingBindingProfile {
  schemaVersion: "0.1.0";
  bindingId: string;
  colorSamplingProfileId: string;
  /**
   * Exact canonical native effective raster this binding was evidenced for.
   * The binding must not be reused against a different raster merely because
   * another sensor/mode has similar dimensions or a matching aspect ratio.
   */
  nativeRaster: NativeImageRaster;
  /**
   * Evidence supporting the native-effective-grid ↔ color-site-grid
   * relationship itself.
   *
   * Capture-mode and color-topology facts retain separate provenance.
   */
  evidence: readonly EvidenceProvenance[];
  relationship: {
    kind: "regular-native-effective-sample-blocks";
    /**
     * Number of abstract color-sampling sites spanned horizontally by one
     * native effective image sample.
     */
    sitesPerNativeSampleX: number;
    /**
     * Number of abstract color-sampling sites spanned vertically by one
     * native effective image sample.
     */
    sitesPerNativeSampleY: number;
    /**
     * Both grids are anchored to the same native sensor top-left.
     *
     * This keeps phase absolute across later active crops/orientation.
     */
    anchor: "shared-native-top-left";
  };
}
```

## NativeEffectiveSampleRect

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface NativeEffectiveSampleRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

## parseNativeEffectiveRasterColorSamplingBindingProfile

Parses the explicit relationship between the canonical native effective image
raster and the separate native sensor color-sampling-site lattice.

This first binding supports only regular rectangular site blocks with a
shared native top-left anchor. Irregular mappings, sparse exceptions and
mode-specific declared-effective rasters require later explicit contracts.

```ts
export function parseNativeEffectiveRasterColorSamplingBindingProfile(
  value: unknown
): NativeEffectiveRasterColorSamplingBindingProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## resolveCaptureModeColorSamplingContributors

Resolves which color-sampling sites form the pre-reconstruction structural source region for one selected
capture-mode effective sample.

The mode sample index is always absolute in the selected mode's full-frame
per-frame raster. The API intentionally does not accept crop-local indices,
preventing active-crop origins from silently resetting CFA phase.

For grouped-native-sample modes, the returned site rectangle covers all
native effective samples in the declared regular group. This is a structural
pre-reconstruction association only: the engine reports channel-site counts
but never claims complete downstream digital-pixel dependency or invents
signal-combination weights, sum/average semantics, spectral response, or
photon/electron values.

Declared-effective-raster modes fail closed because #68 explicitly says
their relationship to the native effective grid is not safely expressible as
simple integer grouping.

Inter-frame sensor shifts are preserved as capture-mode metadata only. The
sensor and CFA move together, so those offsets do not change site channel
assignment; their optical-registration effect belongs to a later spatial
sampling/image-formation contract.

```ts
export function resolveCaptureModeColorSamplingContributors(
  input: ResolveCaptureModeColorSamplingContributorsInput
): ResolvedCaptureModeColorSamplingContributors;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ResolveCaptureModeColorSamplingContributorsInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolveCaptureModeColorSamplingContributorsInput {
  nativeRaster: NativeImageRaster;
  captureModeProfile: CaptureModeProfile;
  modeId: string;
  colorSamplingProfile: SensorColorSamplingProfile;
  bindingProfile: NativeEffectiveRasterColorSamplingBindingProfile;
  modeSampleIndexFullFrame: CaptureModeFullFrameSampleIndex;
  /**
   * Required for grouped-native-samples modes because #68 declares grouping
   * factors but does not itself prove the grouping phase/origin.
   */
  groupedSamplingAnchor?: GroupedCaptureModeSamplingAnchorDeclaration;
}
```

## ResolvedCaptureModeColorSamplingContributors

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolvedCaptureModeColorSamplingContributors {
  modeId: string;
  colorSamplingProfileId: string;
  modeSampleCoordinateSystem:
    "capture-mode-full-frame-effective-sample-index";
  modeSampleIndexFullFrame: CaptureModeFullFrameSampleIndex;
  modeSampleRaster: {
    pixelWidth: number;
    pixelHeight: number;
  };
  modeSamplingKind:
    | "native-effective-raster"
    | "grouped-native-samples";
  nativeEffectiveSampleRect: NativeEffectiveSampleRect;
  colorSamplingSiteRect: ColorSamplingSiteRect;
  colorSamplingSiteGrid: ColorSamplingSiteGridDimensions;
  totalContributorSites: number;
  channelSiteCounts: readonly ColorSamplingChannelSiteCount[];
  channelComposition: ColorSamplingChannelComposition;
  /**
   * Present only when the selected capture mode groups native effective
   * samples before producing one per-frame effective sample.
   */
  grouping:
    | {
        groupWidthSamples: SourcedCaptureModeFact<number>;
        groupHeightSamples: SourcedCaptureModeFact<number>;
        combinationDomain?: SourcedCaptureModeFact<CaptureModeSampleCombinationDomain>;
        anchor: "native-effective-raster-top-left";
        anchorEvidence: readonly EvidenceProvenance[];
      }
    | null;
  /**
   * Sensor-shift sequence remains attached to the sensor/capture mode.
   *
   * The sensor and its CFA move together, so these offsets must not be applied
   * as changes to color-site channel assignment.
   */
  interFrameSensorOffsetsNativeSamples?: SourcedCaptureModeFact<
    readonly CaptureModeSensorOffsetNativeSamples[]
  >;
  sensorShiftChangesColorSiteAssignment: false;
  sensorShiftOpticalRegistration:
    "outside-this-contract";
  structuralSourceStage: "pre-reconstruction";
  completeDownstreamPixelDependencyEstablished: false;
  signalCombinationWeightingEstablished: false;
  spectralResponseEstablished: false;
  physicalPhotodiodeBindingEstablished: false;
  physicalPhotodiodeCountInference: "not-permitted";
  componentEvidence: {
    binding: readonly EvidenceProvenance[];
    colorSamplingProfile: readonly EvidenceProvenance[];
    captureMode: readonly EvidenceProvenance[];
  };
}
```

## ResolvedNativeEffectiveRasterColorSamplingBinding

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolvedNativeEffectiveRasterColorSamplingBinding {
  bindingId: string;
  colorSamplingProfileId: string;
  nativeRaster: NativeImageRaster;
  relationshipMeaning:
    | "one-native-effective-sample-to-one-color-site"
    | "one-native-effective-sample-to-rectangular-color-site-block";
  relationship: {
    kind: "regular-native-effective-sample-blocks";
    sitesPerNativeSampleX: number;
    sitesPerNativeSampleY: number;
    anchor: "shared-native-top-left";
  };
  colorSamplingSiteGrid: ColorSamplingSiteGridDimensions;
  totalColorSamplingSites: number;
  nativeImageRasterBindingEstablished: true;
  physicalPhotodiodeBindingEstablished: false;
  physicalPhotodiodeCountInference: "not-permitted";
  spectralResponseEstablished: false;
  componentEvidence: {
    binding: readonly EvidenceProvenance[];
    colorSamplingProfile: readonly EvidenceProvenance[];
  };
}
```

## resolveNativeEffectiveRasterColorSamplingBinding

Validates and resolves the sensor-level binding between NativeImageRaster and
an exact monochrome/periodic color-sampling topology.

Matching dimensions are never treated as proof of a 1:1 relationship. The
relationship exists only because the caller supplied this evidence-backed
binding profile.

```ts
export function resolveNativeEffectiveRasterColorSamplingBinding(
  input: {
    nativeRaster: NativeImageRaster;
    colorSamplingProfile: SensorColorSamplingProfile;
    bindingProfile: NativeEffectiveRasterColorSamplingBindingProfile;
  }
): ResolvedNativeEffectiveRasterColorSamplingBinding;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.
