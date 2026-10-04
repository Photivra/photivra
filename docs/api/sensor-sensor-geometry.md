# sensor/sensor-geometry.ts public contracts

Package **1.4.0**, root API **1.4.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateImagingAreaMetrics

Calculates physical imaging-area metrics independently from native raster
density.

Crop factor uses the diagonal ratio to a 36 × 24 mm reference frame.
Digital/output crops are not part of this physical imaging-area quantity.

```ts
export function calculateImagingAreaMetrics(
  imagingArea: SensorImagingArea
): CalculationResult<ImagingAreaMetrics>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## calculateSensorGeometryMetrics

Calculates physical imaging-area, native-raster, and geometric sampling
metrics without coupling sensor size to resolution.

The supplied raster is assumed to span the supplied imaging area. Derived
sampling pitch is geometric sample spacing only and must not be interpreted
as photosite fill factor or photon-collection area.

```ts
export function calculateSensorGeometryMetrics(
  input: CalculateSensorGeometryMetricsInput
): CalculationResult<SensorGeometryMetrics>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateSensorGeometryMetricsInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CalculateSensorGeometryMetricsInput {
  imagingArea: SensorImagingArea;
  nativeRaster: NativeImageRaster;
}
```

## ImagingAreaMetrics

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ImagingAreaMetrics {
  /** Physical imaging-area diagonal in millimetres. */
  diagonalMm: number;
  /** Physical width divided by physical height. */
  aspectRatio: number;
  /**
   * Diagonal crop factor relative to a 36 × 24 mm reference frame.
   *
   * This is a physical imaging-area quantity and does not include later
   * digital/output cropping.
   */
  cropFactor35Mm: number;
}
```

## NativeImageRaster

Native effective image-sampling raster associated with an imaging area.

This alias identifies semantic role; generic active/output rasters should
use RasterDimensions instead.

```ts
export type NativeImageRaster = RasterDimensions;
```

## RasterDimensions

Native effective image-sampling raster associated with an imaging area.

The raster describes effective image samples. It does not imply that each
sample corresponds one-to-one with a physical photodiode/photosite.

```ts
export interface RasterDimensions {
  /** Horizontal image-sample/pixel count. */
  pixelWidth: number;
  /** Vertical image-sample/pixel count. */
  pixelHeight: number;
}
```

## SensorGeometryMetrics

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorGeometryMetrics {
  imagingArea: ImagingAreaMetrics;
  nativeRaster: {
    /** Exact product of native raster width and height. */
    totalImageSamples: number;
    /** Derived megapixels from the exact native raster. */
    megapixels: number;
    /** Native raster width divided by native raster height. */
    aspectRatio: number;
  };
  sampling: {
    /**
     * Horizontal geometric sampling pitch in micrometres.
     *
     * This is image-sample spacing, not physical photodiode active area.
     */
    pitchXMicrometers: number;
    /**
     * Vertical geometric sampling pitch in micrometres.
     *
     * This is image-sample spacing, not physical photodiode active area.
     */
    pitchYMicrometers: number;
    /** Horizontal sampling pitch divided by vertical sampling pitch. */
    pitchAspectRatio: number;
  };
}
```

## SensorImagingArea

Physical photosensitive imaging area used for image formation.

This is deliberately not a sensor package/die dimension.

```ts
export interface SensorImagingArea {
  /** Physical active imaging width in millimetres. */
  widthMm: number;
  /** Physical active imaging height in millimetres. */
  heightMm: number;
}
```
