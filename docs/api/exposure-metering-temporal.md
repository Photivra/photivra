# exposure/metering-temporal.ts public contracts

Package **1.2.0**, root API **1.2.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## meterSceneRadianceTemporalExposure

Meters a declared weighted time-average of scene-radiance-derived relative
pre-exposure samples.

Every temporal sample must already be explicitly bound to one #85 temporal
illumination profile and one capture time in the
first-opening-boundary-phase reference. Spatial metering is performed first
in the same declared profile, then those scalar pre-exposure measurements are
combined linearly by caller-declared normalized time weights.

```ts
export function meterSceneRadianceTemporalExposure(
  input:
    MeterSceneRadianceTemporalExposureInput
): CalculationResult<
  SceneRadianceTemporalExposureMeteringResult
>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## MeterSceneRadianceTemporalExposureInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface MeterSceneRadianceTemporalExposureInput {
  temporalMeasurementId: string;
  profile: ExposureMeteringProfile;
  policy: {
    kind: "weighted-time-average";
    timeReference:
      "first-opening-boundary-phase";
  };
  temporalSamples:
    readonly SceneRadianceTemporalMeteringSample[];
}
```

## SceneRadianceTemporalExposureMeteringResult

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SceneRadianceTemporalExposureMeteringResult =
  | (SceneRadianceTemporalExposureMeteringResultBase & {
      status: "resolved";
      requiredExposureScaleToTarget:
        number;
      exposureOffsetStopsToTarget:
        number;
    })
  | (SceneRadianceTemporalExposureMeteringResultBase & {
      status: "no-signal";
      requiredExposureScaleResolved:
        false;
      exposureOffsetStopsResolved:
        false;
    });
```

## SceneRadianceTemporalMeteringSample

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SceneRadianceTemporalMeteringSample {
  normalizedTimeWeight: number;
  sampleSet:
    SceneRadianceDerivedExposureMeteringSampleSet;
}
```
