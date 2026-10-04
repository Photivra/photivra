# optics/profile-contract.ts public contracts

Package **1.4.0**, root API **1.4.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## GenericOpticalEvidence

Generic approximation evidence; never implies measured calibration.

```ts
export interface GenericOpticalEvidence {
  kind: "generic-parametric";
  basis: string;
  residualNote: string;
  sources: readonly EvidenceProvenance[];
}
```

## OpticalProfileState

Exact, generic camera/lens and acquisition state; no implicit interpolation.

```ts
export interface OpticalProfileState {
  bodyId: string;
  bodyVersion: string;
  lensId: string;
  lensVersion: string;
  focalLengthMm: number;
  aperture: number;
  focusDistanceM: number;
  captureMode: "still" | "video";
  outputWidth: number;
  outputHeight: number;
  frameRateHz: number;
  stabilizationMode: string;
}
```

## parseOpticalProfileState

Parses a complete exact-state binding, including still/video/output settings.

```ts
export function parseOpticalProfileState(value: unknown): OpticalProfileState;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.
