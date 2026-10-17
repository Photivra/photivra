# gpu/chart-radiance-gpu.ts public contracts

The package and root API versions are recorded once in [Navigation](../API_REFERENCE.md) · [Developer guide](https://github.com/Photivra/photivra/blob/main/docs/DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## ChartRadianceResult

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ChartRadianceResult {
  plan: ChartRadianceBatchPlan;
  /** Row-major (query, column): float64 for `cpu-reference`, float32 for `webgpu-f32`. */
  values: Float64Array | Float32Array;
  columns: number;
  execution: ImageKernelExecution;
  /**
   * Queries whose float32 classification fell inside its bound, recomputed on the host with the
   * reference (then rounded to float32). Empty for `cpu-reference`.
   */
  hostRecomputedQueryIndices: Uint32Array;
}
```
