# exposure/metering-target.ts public contracts

Package **1.5.0**, root API **1.5.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## createExposureMeterTargetFromMeteringResult

Freezes one metering result into the stable relative exposure target
consumed by downstream camera-control policy.

The target copies the meter snapshot by value. Future scene/light changes do
not mutate this object, which is the engine seam needed for AE-lock behavior.

```ts
export function createExposureMeterTargetFromMeteringResult(
  input:
    CreateExposureMeterTargetInput
): ExposureMeterTarget;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CreateExposureMeterTargetInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CreateExposureMeterTargetInput {
  targetId: string;
  meterResult:
    ExposureMeterTargetSourceResult;
}
```

## EXPOSURE_METER_TARGET_SCHEMA_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
EXPOSURE_METER_TARGET_SCHEMA_VERSION =
  "0.1.0" as const
```

## ExposureMeterSnapshotIdentity

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ExposureMeterSnapshotIdentity {
  sourceKind:
    ExposureMeterTargetSourceKind;
  measurementId: string;
  sceneStateId: string;
  meteringProfileId: string;
}
```

## ExposureMeterTarget

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type ExposureMeterTarget =
  | (ExposureMeterTargetBase & {
      status: "resolved";
      baseRequiredExposureScaleToTarget:
        number;
      baseExposureOffsetStopsToTarget:
        number;
      requiredExposureScaleToTarget:
        number;
      exposureOffsetStopsToTarget:
        number;
    })
  | (ExposureMeterTargetBase & {
      status: "no-signal";
      baseRequiredExposureScaleResolved:
        false;
      baseExposureOffsetStopsResolved:
        false;
      requiredExposureScaleResolved:
        false;
      exposureOffsetStopsResolved:
        false;
    });
```

## ExposureMeterTargetSourceKind

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type ExposureMeterTargetSourceKind =
  | "spatial-metering-result"
  | "temporal-metering-result";
```

## ExposureMeterTargetSourceResult

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type ExposureMeterTargetSourceResult =
  | ExposureMeteringResult
  | SceneRadianceTemporalExposureMeteringResult;
```

## setExposureCompensationOnMeterTarget

Sets an absolute exposure-compensation value on a frozen meter target.

Compensation is always re-derived from the uncompensated base target, so
repeated UI updates cannot accidentally accumulate floating-point/control
drift. Positive compensation requests more exposure.

```ts
export function setExposureCompensationOnMeterTarget(
  input:
    SetExposureCompensationOnMeterTargetInput
): ExposureMeterTarget;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## SetExposureCompensationOnMeterTargetInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SetExposureCompensationOnMeterTargetInput {
  targetId: string;
  baseTarget: ExposureMeterTarget;
  exposureCompensationStops: number;
}
```
