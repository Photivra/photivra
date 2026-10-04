# exposure/exposure-duration-control.ts public contracts

Package **1.3.0**, root API **1.3.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## bindResolvedExposureDurationToCaptureExposureInput

Binds a resolved duration into the authoritative #12 exposure-window input.

The existing shutter mechanism/opening/closing schedules remain untouched.
Only the seconds-valued nominal duration is supplied here.

```ts
export function bindResolvedExposureDurationToCaptureExposureInput(
  input:
    BindResolvedExposureDurationToCaptureExposureInput
): CalculateCaptureExposureWindowsInput;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## BindResolvedExposureDurationToCaptureExposureInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface BindResolvedExposureDurationToCaptureExposureInput {
  resolution:
    Extract<
      ExposureDurationControlResolution,
      { status: "resolved" }
    >;
  durationEvidence:
    readonly EvidenceProvenance[];
  exposureWindowInput:
    Omit<
      CalculateCaptureExposureWindowsInput,
      "nominalExposureDurationSeconds"
    >;
}
```

## EXPOSURE_DURATION_CONTROL_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
EXPOSURE_DURATION_CONTROL_VERSION =
  "0.1.0" as const
```

## ExposureDurationControl

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type ExposureDurationControl =
  | {
      kind: "fixed-duration";
      durationSeconds: number;
    }
  | {
      kind: "bulb";
      timeReference:
        "control-monotonic-seconds";
      pressSeconds: number;
      releaseSeconds?: number;
    }
  | {
      kind: "time";
      timeReference:
        "control-monotonic-seconds";
      startSeconds: number;
      stopSeconds?: number;
    };
```

## ExposureDurationControlResolution

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type ExposureDurationControlResolution =
  | (ExposureDurationControlResolutionBase & {
      status: "resolved";
      durationSeconds: number;
      physicalExposureIntegrationAuthorized:
        true;
    })
  | (ExposureDurationControlResolutionBase & {
      status: "active";
      durationSeconds: null;
      physicalExposureIntegrationAuthorized:
        false;
      waitingFor:
        | "bulb-release"
        | "time-stop";
    });
```

## resolveExposureDurationControl

Resolves shutter-duration control semantics to a concrete positive elapsed
duration before physical exposure integration.

Bulb and Time are control behaviors only. Neither implies a shutter
mechanism, exposure-boundary topology, tripod, stabilization state, long
exposure NR, or temperature model.

```ts
export function resolveExposureDurationControl(
  control: ExposureDurationControl
): ExposureDurationControlResolution;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.
