# facade/color-patches.ts public contracts

The package and root API versions are recorded once in [Navigation](../API_REFERENCE.md) · [Developer guide](https://github.com/Photivra/photivra/blob/main/docs/DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## COLOR_PATCH_IDS

The ids of the built-in patches, in the order of the `color-patches` chart (row-major, six per row).

```ts
COLOR_PATCH_IDS = Object.freeze([
  "neutral-1", "neutral-2", "neutral-3", "neutral-4", "neutral-5", "neutral-6",
  "red", "yellow", "green", "cyan", "blue", "magenta",
  "red-soft", "yellow-soft", "green-soft", "cyan-soft", "blue-soft", "magenta-soft",
  "skin-pale", "skin-medium", "skin-tan", "skin-deep", "sky-blue", "foliage-green",
  "brick-red", "sand", "teal", "lavender", "deep-orange", "deep-violet"
] as const)
```

## COLOR_PATCH_SET_ID

Identity of the built-in patch set.

```ts
COLOR_PATCH_SET_ID = "photivra-color-patches"
```

## COLOR_PATCH_SET_VERSION

Version of the patch set's spectra and reference values; a change to any spectrum changes it.

```ts
COLOR_PATCH_SET_VERSION = "1.0.0"
```

## COLOR_PATCH_WAVELENGTH_RANGE_NANOMETERS

Wavelengths on which every patch spectrum is defined, nanometres, inclusive.

```ts
COLOR_PATCH_WAVELENGTH_RANGE_NANOMETERS = Object.freeze({ minimum: 360, maximum: 830 })
```

## ColorPatch

One built-in patch: its id, a plain English name, its spectrum definition and its reference colorimetry.

```ts
export interface ColorPatch {
  patchId: ColorPatchId;
  name: string;
  group: ColorPatchGroup;
  /** The constant b of the formula. */
  base: number;
  terms: readonly ColorPatchSpectralTerm[];
  /**
   * Reference colorimetry of the reflectance (not of a rendered capture): CIELAB under CIE illuminant D65 with the CIE
   * 1931 2° observer, the CIE tables at 1 nm over 360–830 nm, white = the perfect diffuser under D65 (Y = 100); and the
   * sRGB colour of that XYZ (CSS Color 4 matrix, after XYZ scaling of the D65 table white to the sRGB white),
   * 8-bit hex. Rounded for publication: L*, a*, b* to 0.01.
   */
  reference: { cielabD65: readonly [number, number, number]; srgbHex: string; inSrgbGamut: boolean };
}
```

## ColorPatchGroup

Groups of the patch set, in chart order.

```ts
export type ColorPatchGroup = "neutral" | "strong" | "soft" | "skin" | "memory" | "gamut-edge";
```

## ColorPatchId

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type ColorPatchId = (typeof COLOR_PATCH_IDS)[number];
```

## ColorPatchSet

The built-in patch set (see {@link getColorPatchSet}).

```ts
export interface ColorPatchSet {
  setId: typeof COLOR_PATCH_SET_ID;
  version: typeof COLOR_PATCH_SET_VERSION;
  wavelengthRangeNanometers: { minimum: number; maximum: number };
  /** Patches per row of the `color-patches` chart's default layout. */
  columns: number;
  patches: readonly ColorPatch[];
}
```

## ColorPatchSpectralTerm

One term of a patch spectrum (see the module formula).

```ts
export type ColorPatchSpectralTerm =
  | { kind: "gaussian"; amplitude: number; centerNanometers: number; standardDeviationNanometers: number }
  | { kind: "logistic-rise" | "logistic-fall"; amplitude: number; midpointNanometers: number; scaleNanometers: number };
```

## evaluateColorPatchReflectance

The reflectance (dimensionless, in [0, 1]) of a built-in colour patch at one wavelength, from its analytic formula.
Labelled `approximation`: the spectra are Photivra's own smooth designs, not measurements of a physical sample.

```ts
export function evaluateColorPatchReflectance(input: EvaluateColorPatchReflectanceInput): CalculationResult<{ reflectance: number }>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## EvaluateColorPatchReflectanceInput

Input of {@link evaluateColorPatchReflectance}.

```ts
export interface EvaluateColorPatchReflectanceInput {
  patchId: ColorPatchId;
  /** Vacuum wavelength, nanometres, in 360–830. */
  wavelengthNanometers: number;
}
```

## getColorPatchSet

The built-in Photivra colour-patch set: every patch's id, name, group, spectrum parameters and reference CIELAB (D65,
CIE 1931 2°) and sRGB values. A static, deeply frozen engine contract. Pass a patch to a chart as
`{ kind: "color-patch", patchId }` wherever a chart reflectance is accepted, or draw the whole set with the
`color-patches` chart preset.

```ts
export function getColorPatchSet(): ColorPatchSet;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.
