# schema/camera.ts public contracts

Package **1.0.1**, root API **1.0.1**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## CameraConfiguration

Renderer-independent camera configuration consumed by simulation modules.

```ts
export interface CameraConfiguration {
  sensor: SensorConfiguration;
  lens: LensConfiguration;
  exposure: ExposureConfiguration;
  focus: FocusConfiguration;
  stabilization?: StabilizationConfiguration;
}
```

## CameraSupport

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type CameraSupport = "handheld" | "braced" | "monopod" | "tripod";
```

## ExposureConfiguration

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ExposureConfiguration {
  shutterSeconds: number;
  iso: number;
}
```

## FocusConfiguration

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface FocusConfiguration {
  focusDistanceM: number;
}
```

## LensConfiguration

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface LensConfiguration {
  focalLengthMm: number;
  aperture: number;
}
```

## SensorConfiguration

The legacy CameraConfiguration is a finite unit-bearing POC setting record, not a complete
equipment capability profile. Its parser lives in schema/validation; newer ISO/exposure
capabilities remain separate so adding a control policy does not reinterpret saved POC data.

```ts
export interface SensorConfiguration {
  widthMm: number;
  heightMm: number;
  pixelWidth: number;
  pixelHeight: number;
}
```

## StabilizationConfiguration

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface StabilizationConfiguration {
  bodyEnabled: boolean;
  lensEnabled: boolean;
  support: CameraSupport;
}
```
