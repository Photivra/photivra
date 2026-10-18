# facade/scene-radiance.ts public contracts

The package and root API versions are recorded once in [Navigation](../API_REFERENCE.md) · [Developer guide](https://github.com/Photivra/photivra/blob/main/docs/DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## CallerRadianceScene

Caller absolute spectral radiance in W·m⁻²·sr⁻¹·nm⁻¹; the facade illuminant is not used.

```ts
export interface CallerRadianceScene { kind: "radiance-function"; sceneId: string; evaluate(point: Readonly<ScenePlanePoint>): number }
```

## CallerReflectanceScene

Caller Lambertian reflectance (in [0, 1]) lit by the facade illuminant.

```ts
export interface CallerReflectanceScene { kind: "reflectance-function"; sceneId: string; evaluate(point: Readonly<ScenePlanePoint>): number }
```

## CaptureIlluminant

Illuminant choices. CIE D65 is not bundled: its S0/S1/S2 basis tables must come from the caller
(`daylight`). `planckian` is Planck's law; `cie-a` is CIE illuminant A from its defining formula.

```ts
export type CaptureIlluminant =
  | "cie-a"
  | { kind: "planckian"; temperatureKelvin: number }
  | { kind: "cie-a" }
  | { kind: "daylight"; correlatedColorTemperatureKelvin: number; basis: CieDaylightBasis }
  | { kind: "spectrum"; spectrum: ColorimetricSpectrum; label?: string };
```

## CHART_SIZE_DEFAULT_SURROUND_REFLECTANCE

Default surround of a fixed-size chart: an 18 % grey plane.

```ts
CHART_SIZE_DEFAULT_SURROUND_REFLECTANCE = 0.18
```

## ChartSizeOption

2.3: a chart's physical size on the scene plane (`simulateCapture` `chartSize`, `createPlanarSceneRadianceProvider` `chartSize`).

```ts
export interface ChartSizeOption {
  /** Chart width in metres, (0, 10 000]. */
  widthM: number;
  /** Chart height in metres. Default: widthM × the frame aspect (height / width), so the chart has the frame's shape. */
  heightM?: number;
  /** Neutral reflectance of the plane around the chart, lit by the same illuminant. Default 0.18. */
  surroundReflectance?: number;
}
```

## createPlanarSceneRadianceProvider

Public scene-preset provider. Places an engine chart (or a caller reflectance or radiance function) on
a plane `distanceM` in front of the camera and `framedWidthM` wide (frame units u = ±1 at its edges),
lit by `illuminant` at `illuminanceLux`. The returned `evaluateRadiance` and `evaluateApertureRadiance`
follow the native environment RAW provider contract. They answer requests for scene `sceneId` and
provider `providerProfileId`.

```ts
export function createPlanarSceneRadianceProvider(input: {
  scene: ChartScene | CallerReflectanceScene | CallerRadianceScene;
  illuminant: CaptureIlluminant;
  illuminanceLux: number;
  distanceM: number;
  framedWidthM: number;
  /** Frame height / width. */
  aspect: number;
  sceneId: string;
  providerProfileId: string;
  /**
   * 2.3, opt-in: place the chart at this physical size, centred, instead of filling the frame; the chart preset
   * is resolved with aspect heightM / widthM and the rest of the plane is the surround.
   */
  chartSize?: ChartSizeOption;
}): PlanarSceneRadianceProvider & { chart: ResolvedChartScene | null };
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## PHOTOPIC_MAXIMUM_LUMINOUS_EFFICACY_LM_PER_W

CIE maximum luminous efficacy for photopic vision, lm/W.

```ts
PHOTOPIC_MAXIMUM_LUMINOUS_EFFICACY_LM_PER_W = 683
```

## PlanarSceneRadianceProvider

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface PlanarSceneRadianceProvider {
  sceneId: string;
  providerProfileId: string;
  evaluateRadiance(request: Readonly<SceneRadianceEvaluationRequest>): SceneRadianceEvaluationResult;
  evaluateApertureRadiance(request: Readonly<SceneRadianceEvaluationRequest>, ray: Readonly<SensorApertureRay>): SceneRadianceEvaluationResult;
  /** Spectral radiance at a plane point (frame units), the same value the callbacks return. */
  radianceAt(u: number, v: number, wavelengthNanometers: number): number;
}
```

## resolveCaptureIlluminant

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export function resolveCaptureIlluminant(value: CaptureIlluminant): ResolvedCaptureIlluminant;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ResolvedCaptureIlluminant

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolvedCaptureIlluminant {
  /** Short public description, for example "planckian-6500K". */
  id: string;
  description: string;
  /** Relative spectral shape (arbitrary scale) over at least 380-780 nm. */
  shape: PreparedColorimetricSpectrum;
  /** Original spectrum, for colorimetric white-balance calculations. */
  spectrum: ColorimetricSpectrum;
}
```

## ScenePlanePoint

A point of the scene plane passed to caller scene functions.

```ts
export interface ScenePlanePoint {
  /** Metres on the plane, from the optical axis: +x right, +y up (as seen from the camera). */
  xM: number;
  yM: number;
  /** The same point in frame units (u = ±1 at the left/right frame edges, v up on the same scale). */
  u: number;
  v: number;
  wavelengthNanometers: number;
  /**
   * 2.3, only with a fixed-size chart (`chartSize`): the point in chart-local frame units (±1 at the chart's
   * left/right edges, v up on the same scale, ±chart height/width at its top/bottom). The function is then
   * called only for points on the chart; the surround is the placement's surround reflectance.
   */
  chartU?: number;
  chartV?: number;
}
```
