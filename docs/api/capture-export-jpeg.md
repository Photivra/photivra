# capture/export-jpeg.ts public contracts

The package and root API versions are recorded once in [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## EXPORT_JPEG_ENCODER_ID

Identifies the exact byte behaviour of the baseline encoder. Version 2 (engine 2.0.0) uses the fixed
cosine table below instead of runtime `Math.cos` and rounds quantized coefficients half away from zero.
Relative to version 1, bytes can differ only where a coefficient's pre-rounding value was within about
one ulp of a half-integer, or was exactly a negative half-integer; the repository corpus is unchanged.

```ts
EXPORT_JPEG_ENCODER_ID = "photivra-baseline-jpeg-444-v2" as const
```
