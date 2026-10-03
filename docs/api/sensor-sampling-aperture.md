# sensor/sampling-aperture.ts public contracts

Package **1.2.0**, root API **1.2.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## NativeSensorPhysicalBoundsMm

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface NativeSensorPhysicalBoundsMm {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
```

## NativeSensorPhysicalPointMm

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface NativeSensorPhysicalPointMm {
  x: number;
  y: number;
}
```

## parseSensorSamplingApertureProfile

Parses physical registration of the color-site lattice plus a first geometric
photosensitive-aperture model.

Site-center pitch/origin are explicit facts and are never derived from
NativeImageRaster. The rectangle, when resolved, is a geometric sensitive
region only. It does not include microlens redirection, charge diffusion,
electrical crosstalk, QE, throughput, spectral response, or an effective
radiometric collection area.

```ts
export function parseSensorSamplingApertureProfile(
  value: unknown
): SensorSamplingApertureProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ResolvedSensorSamplingAperture

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolvedSensorSamplingAperture {
  profileId: string;
  colorSamplingProfileId: string;
  colorSamplingBindingId: string;
  coordinateSystem: "native-sensor-physical";
  site: NativeColorSamplingSiteIndex;
  channelId: string;
  siteGrid: {
    widthSites: number;
    heightSites: number;
  };
  lattice: {
    pitchXMicrometers: number;
    pitchYMicrometers: number;
    firstSiteCenterFromImagingAreaTopLeftMicrometers: {
      x: number;
      y: number;
    };
    siteCenterFromImagingAreaTopLeftMicrometers: {
      x: number;
      y: number;
    };
    siteCenterFromOpticalAxisMm: NativeSensorPhysicalPointMm;
    nominalCellAreaSquareMicrometers: number;
  };
  geometricSensitiveAperture: {
    kind: "uniform-axis-aligned-rectangle";
    widthMicrometers: number;
    heightMicrometers: number;
    centerOffsetFromSiteCenterMicrometers: {
      x: number;
      y: number;
    };
    centerFromOpticalAxisMm: NativeSensorPhysicalPointMm;
    boundsFromOpticalAxisMm: NativeSensorPhysicalBoundsMm;
    areaSquareMicrometers: number;
    geometricSensitiveAreaFractionOfLatticeCell: number;
    spatialWeighting:
      "uniform-unit-area-average";
    neighboringGeometricApertureOverlap:
      "none-by-model";
  };
  /**
   * Hard scientific boundaries.
   */
  sitePitchDerivedFromNativeImageRaster: false;
  apertureDerivedFromSitePitch: false;
  antiAliasingResponseIncluded: false;
  microlensSpatialRedistributionIncluded: false;
  chargeDiffusionIncluded: false;
  electricalCrosstalkIncluded: false;
  spectralResponseIncluded: false;
  quantumEfficiencyIncluded: false;
  opticalThroughputIncluded: false;
  radiometricCollectionAreaEstablished: false;
  physicalPhotodiodeGeometryEstablished: false;
  provenance: {
    profile: readonly EvidenceProvenance[];
    lattice: readonly EvidenceProvenance[];
    aperture: readonly EvidenceProvenance[];
  };
}
```

## resolveSensorSamplingAperture

Resolves one geometric sampling aperture in native sensor physical space.

The result provides a normalized uniform-area spatial averaging footprint for
future image sampling, plus its geometric physical area/fill-fraction
diagnostics. It deliberately does not promote that geometric area into
radiometric collection efficiency or physical photodiode truth.

```ts
export function resolveSensorSamplingAperture(
  input: ResolveSensorSamplingApertureInput
): ResolvedSensorSamplingAperture;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ResolveSensorSamplingApertureInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolveSensorSamplingApertureInput {
  imagingArea: SensorImagingArea;
  nativeRaster: NativeImageRaster;
  colorSamplingProfile: SensorColorSamplingProfile;
  colorSamplingBindingProfile: NativeEffectiveRasterColorSamplingBindingProfile;
  samplingApertureProfile: SensorSamplingApertureProfile;
  site: NativeColorSamplingSiteIndex;
}
```

## SensorGeometricSensitiveAperture

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorGeometricSensitiveAperture =
  | {
      /**
       * The physical/light-sensitive spatial aperture is known to matter but
       * its geometry is not defensibly resolved.
       */
      kind: "unresolved";
      evidence: readonly EvidenceProvenance[];
    }
  | {
      /**
       * First geometric sensitive-region approximation.
       *
       * This rectangle is constrained to remain inside one regular lattice
       * cell, so neighboring geometric sensitive regions do not overlap in
       * schema 0.1.0.
       */
      kind: "uniform-axis-aligned-rectangle";
      widthMicrometers: number;
      heightMicrometers: number;
      centerOffsetFromSiteCenterMicrometers: {
        x: number;
        y: number;
      };
      evidence: readonly EvidenceProvenance[];
    };
```

## SensorSamplingApertureProfile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorSamplingApertureProfile {
  schemaVersion: "0.1.0";
  profileId: string;
  colorSamplingProfileId: string;
  colorSamplingBindingId: string;
  evidence: readonly EvidenceProvenance[];
  siteCenterLattice: SensorSiteCenterLatticeRegistration;
  geometricSensitiveAperture: SensorGeometricSensitiveAperture;
}
```

## SensorSiteCenterLatticeRegistration

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorSiteCenterLatticeRegistration {
  kind: "regular-rectangular-site-center-lattice";
  coordinateSystem: "native-sensor-physical";
  /** Horizontal site-center pitch in micrometres. */
  pitchXMicrometers: number;
  /** Vertical site-center pitch in micrometres. */
  pitchYMicrometers: number;
  /**
   * First site center relative to the imaging area's physical top-left edge.
   *
   * +X right, +Y down. Units: micrometres.
   */
  firstSiteCenterFromImagingAreaTopLeftMicrometers: {
    x: number;
    y: number;
  };
  evidence: readonly EvidenceProvenance[];
}
```
