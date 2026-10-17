# facade/chart-scenes.ts public contracts

The package and root API versions are recorded once in [Navigation](../API_REFERENCE.md) · [Developer guide](https://github.com/Photivra/photivra/blob/main/docs/DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculatePointGridCenters

Centres (frame units) of a point grid: one disk centred in each of columns × rows equal cells, row-major from the top-left.

```ts
export function calculatePointGridCenters(input: { columns: number; rows: number; aspect: number }): { u: number; v: number }[];
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## calculateStepWedgeReflectances

Step reflectances of a step wedge. `equal-density` spaces optical density D = -log10(R) evenly, which
gives geometric reflectance steps, as on a photographic step tablet. `linear` spaces reflectance evenly.

```ts
export function calculateStepWedgeReflectances(input: { steps: number; minimumReflectance: number; maximumReflectance: number;
  spacing: "equal-density" | "linear" }): number[];
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CHART_SCENE_DEFAULTS

Engine-chosen chart parameters, each reported when the caller omitted it.

```ts
CHART_SCENE_DEFAULTS = Object.freeze({
  uniform: Object.freeze({ reflectance: 0.18 }),
  "slanted-edge": Object.freeze({ angleDegrees: 5, darkReflectance: 0.15, lightReflectance: 0.6 }),
  "siemens-star": Object.freeze({ cycles: 36, radiusFraction: 0.9, darkReflectance: 0.05, lightReflectance: 0.8, backgroundReflectance: 0.18 }),
  "step-wedge": Object.freeze({ steps: 11, minimumReflectance: 0.03, maximumReflectance: 0.9, spacing: "equal-density" as const }),
  "grey-ramp": Object.freeze({ minimumReflectance: 0.03, maximumReflectance: 0.9 }),
  checkerboard: Object.freeze({ squaresAcross: 8, darkReflectance: 0.05, lightReflectance: 0.8 }),
  "point-grid": Object.freeze({ columns: 5, rows: 3, radius: 0.01, pointReflectance: 0.9, backgroundReflectance: 0.02 }),
  patches: Object.freeze({ gapFraction: 0.1, backgroundReflectance: 0.18 })
})
```

## CHART_SCENE_PRESETS

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
CHART_SCENE_PRESETS: readonly ChartScenePresetId[] = Object.freeze(["uniform", "slanted-edge", "siemens-star",
  "step-wedge", "grey-ramp", "checkerboard", "point-grid", "patches"] as const)
```

## CHART_SPECTRAL_RANGE_NANOMETERS

Wavelength range every chart spectrum must cover (the facade's sensor quadrature range).

```ts
CHART_SPECTRAL_RANGE_NANOMETERS = Object.freeze({ minimum: 380, maximum: 780 })
```

## ChartReflectance

A neutral (spectrally flat) reflectance in [0, 1], or a caller reflectance spectrum (values in [0, 1]).

```ts
export type ChartReflectance = number | ColorimetricSpectrum;
```

## ChartScene

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type ChartScene = UniformChartScene | SlantedEdgeChartScene | SiemensStarChartScene | StepWedgeChartScene |
  GreyRampChartScene | CheckerboardChartScene | PointGridChartScene | PatchChartScene;
```

## ChartScenePresetId

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type ChartScenePresetId = ChartScene["preset"];
```

## CheckerboardChartScene

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CheckerboardChartScene {
  preset: "checkerboard";
  /** Squares across the frame width, 2..256. Default 8. */
  squaresAcross?: number;
  darkReflectance?: number;
  lightReflectance?: number;
}
```

## GreyRampChartScene

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface GreyRampChartScene {
  preset: "grey-ramp";
  /** Continuous ramp, linear in reflectance from left (minimum) to right (maximum). */
  minimumReflectance?: number;
  maximumReflectance?: number;
}
```

## PatchChartScene

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface PatchChartScene {
  preset: "patches";
  /** Caller reflectance per patch, row-major; the facade bundles no colour-chart data. 1..1024 patches. */
  patches: readonly { patchId: string; reflectance: ChartReflectance }[];
  /** Patches per row. Default ceil(sqrt(patch count)). */
  columns?: number;
  /** Gap between patches as a fraction of the cell size, [0, 0.5). Default 0.1. */
  gapFraction?: number;
  backgroundReflectance?: number;
}
```

## PointGridChartScene

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface PointGridChartScene {
  preset: "point-grid";
  /** Grid columns and rows of small disks centred in equal cells. Defaults 5 × 3. */
  columns?: number;
  rows?: number;
  /** Disk radius in frame units (fraction of the frame half-width). Default 0.01. */
  radius?: number;
  pointReflectance?: number;
  backgroundReflectance?: number;
}
```

## resolveChartScene

Validates a chart description and resolves every default. `aspect` is the frame height/width. Unknown
fields are rejected so that a mistyped parameter never silently falls back to a default.

```ts
export function resolveChartScene(input: { scene: ChartScene; aspect: number }): ResolvedChartScene;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ResolvedChartScene

A validated chart: every parameter resolved, plus which ones came from {@link CHART_SCENE_DEFAULTS}.

```ts
export interface ResolvedChartScene {
  preset: ChartScenePresetId;
  /** Fully resolved parameters (spectra are reported as `"caller-spectrum"`). */
  parameters: Readonly<Record<string, unknown>>;
  /** Names of parameters filled from defaults. */
  defaultedParameters: readonly string[];
  /** Frame aspect (height / width) the chart was resolved for. */
  aspect: number;
  /**
   * Material index at a frame point (u right, v up). The index points into `materials`, starting at 0.
   * Points outside the framed rectangle still evaluate (the pattern continues as defined), so blur and
   * small framing differences stay well defined.
   */
  materialAt(u: number, v: number): number;
  /** Reflectance materials: a neutral number or a prepared caller spectrum. */
  materials: readonly ({ kind: "neutral"; reflectance: number } | { kind: "spectrum"; spectrum: PreparedColorimetricSpectrum })[];
  /** Reflectance in [0, 1] at a frame point and wavelength (nm). */
  reflectanceAt(u: number, v: number, wavelengthNanometers: number): number;
}
```

## SiemensStarChartScene

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SiemensStarChartScene {
  preset: "siemens-star";
  /** Light/dark sector pairs around the star, 2..360. Default 36. */
  cycles?: number;
  /** Star radius as a fraction of the frame half-height, (0, 1]. Default 0.9. */
  radiusFraction?: number;
  darkReflectance?: number;
  lightReflectance?: number;
  /** Reflectance outside the star. Default 0.18. */
  backgroundReflectance?: number;
}
```

## SlantedEdgeChartScene

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SlantedEdgeChartScene {
  preset: "slanted-edge";
  /** Clockwise tilt of the edge from vertical, degrees, in (-45, 45). Default 5. */
  angleDegrees?: number;
  /** Left (dark) side reflectance. Default 0.15. */
  darkReflectance?: number;
  /** Right (light) side reflectance. Default 0.6 (4:1 with the default dark side). */
  lightReflectance?: number;
}
```

## StepWedgeChartScene

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface StepWedgeChartScene {
  preset: "step-wedge";
  /** Number of equal-width vertical steps from left (minimum) to right (maximum), 2..64. Default 11. */
  steps?: number;
  minimumReflectance?: number;
  maximumReflectance?: number;
  /** `equal-density` (geometric, default) or `linear` reflectance spacing. */
  spacing?: "equal-density" | "linear";
}
```

## UniformChartScene

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface UniformChartScene { preset: "uniform"; reflectance?: ChartReflectance }
```
