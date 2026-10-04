# sensor/color-sampling.ts public contracts

Package **1.4.0**, root API **1.4.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## LayeredColorSamplingLayout

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface LayeredColorSamplingLayout {
  kind: "layered";
  /**
   * Semantic layer/channel identifiers only. They do not define spectral
   * response, depth ordering, spatial sampling density, or registration.
   */
  layerChannelIds: readonly string[];
  /**
   * The first layered representation is deliberately structural only because
   * real layered sensors may use unequal per-layer spatial sampling.
   */
  spatialSamplingRelationship: "not-resolved";
}
```

## MonochromeColorSamplingLayout

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface MonochromeColorSamplingLayout {
  kind: "monochrome";
  /**
   * Semantic measurement-channel identifier only. It is not a spectral
   * response curve, wavelength, colorimetric primary, or calibration.
   */
  channelId: string;
}
```

## NativeColorSamplingSiteCoordinateSystem

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type NativeColorSamplingSiteCoordinateSystem =
  "native-sensor-color-sampling-site-index";
```

## NativeColorSamplingSiteIndex

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface NativeColorSamplingSiteIndex {
  /**
   * Zero-based integer site index from the native sensor's left edge.
   *
   * This is an abstract color-sampling-site lattice index. It is not a
   * NativeImageRaster coordinate and does not assert one site = one physical
   * photodiode.
   */
  x: number;
  /**
   * Zero-based integer site index from the native sensor's top edge.
   *
   * +Y points downward in native sensor-facing coordinates.
   */
  y: number;
}
```

## parseSensorColorSamplingProfile

Parses an exact color-sampling topology declaration without binding it to
NativeImageRaster, physical photodiodes, spectral response, or a
manufacturer-specific family enum.

Periodic mosaics use an abstract native sensor color-sampling-site lattice
with zero-based integer indices, top-left origin, +X right and +Y down.
The repeat phase is anchored to the sensor lattice, so later active crops or
orientation transforms must preserve the original native site indices.

Layered layouts are structural-only in this first contract because real
layered sensors may use unequal spatial sampling density/registration across
layers. No per-site layered resolver is exposed until that relationship is
modeled explicitly.

```ts
export function parseSensorColorSamplingProfile(
  value: unknown
): SensorColorSamplingProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## PeriodicMosaicColorSamplingLayout

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface PeriodicMosaicColorSamplingLayout {
  kind: "periodic-mosaic";
  /**
   * Number of color-sampling sites in one horizontal repeat period.
   */
  repeatWidthSites: number;
  /**
   * Number of color-sampling sites in one vertical repeat period.
   */
  repeatHeightSites: number;
  /**
   * Row-major semantic channel IDs for one repeating tile.
   *
   * Length must equal repeatWidthSites × repeatHeightSites.
   */
  siteChannelIds: readonly string[];
  /**
   * The repeat tile is anchored at native sensor sampling-site index (0, 0).
   *
   * Active crops and physical orientation must not silently reset this phase.
   */
  anchor: "native-sensor-top-left-site";
}
```

## resolveColorSamplingSite

Resolves the semantic measurement-channel assignment at one abstract native
sensor color-sampling-site index for monochrome or periodic-mosaic layouts.

This API intentionally has no NativeImageRaster input. A later explicit
binding must establish how a selected capture mode's effective raster maps
to this color-sampling-site lattice before RAW/CFA sampling can be simulated.

Layered layouts fail closed because their per-layer spatial relationship is
not resolved by the first structural contract.

```ts
export function resolveColorSamplingSite(
  input: ResolveColorSamplingSiteInput
): ResolvedColorSamplingSite;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ResolveColorSamplingSiteInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolveColorSamplingSiteInput {
  profile: SensorColorSamplingProfile;
  site: NativeColorSamplingSiteIndex;
}
```

## ResolvedColorSamplingSite

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolvedColorSamplingSite {
  profileId: string;
  coordinateSystem: NativeColorSamplingSiteCoordinateSystem;
  site: NativeColorSamplingSiteIndex;
  mapping:
    | {
        kind: "monochrome";
        channelId: string;
      }
    | {
        kind: "periodic-mosaic";
        channelId: string;
        repeatCoordinate: {
          x: number;
          y: number;
        };
        repeatWidthSites: number;
        repeatHeightSites: number;
      };
  /**
   * Explicit scientific boundaries for downstream consumers.
   */
  spectralResponseEstablished: false;
  nativeImageRasterBindingEstablished: false;
  physicalPhotodiodeBindingEstablished: false;
}
```

## SensorColorSamplingLayout

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorColorSamplingLayout =
  | MonochromeColorSamplingLayout
  | PeriodicMosaicColorSamplingLayout
  | LayeredColorSamplingLayout;
```

## SensorColorSamplingProfile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorColorSamplingProfile {
  schemaVersion: "0.1.0";
  profileId: string;
  /**
   * Evidence supporting this exact topology declaration.
   *
   * Descriptive architecture-family metadata remains a separate contract.
   */
  evidence: readonly EvidenceProvenance[];
  coordinateSystem: SensorColorSamplingProfileCoordinateSystem;
  layout: SensorColorSamplingLayout;
}
```

## SensorColorSamplingProfileCoordinateSystem

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorColorSamplingProfileCoordinateSystem =
  | NativeColorSamplingSiteCoordinateSystem
  | "native-sensor-layered-spatial-relationship-not-resolved";
```
