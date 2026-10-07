# output/capture-corrected-sdr.ts public contracts

Package **1.5.0**, root API **1.5.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateCaptureCorrectedSdr

Bounded committed capture → color/WB → native correction → oriented output view → SDR. No physical stage activation.

```ts
export function calculateCaptureCorrectedSdr(input: CaptureCorrectedSdrInput): CalculationResult<CaptureCorrectedSdrResult>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CAPTURE_CORRECTED_SDR_SCHEMA_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
CAPTURE_CORRECTED_SDR_SCHEMA_VERSION = "0.1.0" as const
```

## CaptureCorrectedSdrInput

Explicit native-optical correction binding. Body/lens/mode identities remain producer declarations.

```ts
export interface CaptureCorrectedSdrInput extends CaptureSdrInput {
  correction: {
    profile: GenericLensCorrectionProfile;
    state: OpticalProfileState;
    /** Native optical +X right/+Y up, RGB basis after the selected color/WB operation. */
    coordinateFrame: "native-optical-linear-srgb-d65";
    selections: Readonly<Record<string, "on" | "off" | "auto">>;
    selectionKind: ResolvedLensCorrectionPlan["selectionKind"];
    /** Seconds from exposure start, not the capture's scene-clock time. */
    frameTimeSeconds: number;
    resampler: GeometricResampler;
    clippingLevel: number;
    invalidSupport: "reject" | "joint-valid-crop";
    outputImageStateId: string;
  };
}
```

## CaptureCorrectedSdrResult

Derived output view, never a replacement for the committed capture's physical geometry.

```ts
export interface CaptureCorrectedSdrResult extends Omit<CaptureSdrResult, "schemaVersion"> {
  schemaVersion: typeof CAPTURE_CORRECTED_SDR_SCHEMA_VERSION;
  sceneTimeSeconds: number;
  plan: CalculationResult<ResolvedLensCorrectionPlan>;
  correction: ReturnType<typeof calculateLensCorrectedCapture>;
  projection: ReturnType<typeof calculateFieldOfView>;
  /** Oriented full-output support; child correction plans retain native optical coordinates. */
  validSourceMask: readonly boolean[];
  outputView: { imageStateId: string; rect: RasterRect; pixelWidth: number; pixelHeight: number; samples: readonly number[] };
}
```

## parseCaptureCorrectedSdrInput

Strict boundary; execution also checks capture optics, native raster binding and source history.

```ts
export function parseCaptureCorrectedSdrInput(input: unknown): CaptureCorrectedSdrInput;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.
