# color/color-difference.ts public contracts

The package and root API versions are recorded once in [Navigation](../API_REFERENCE.md) · [Developer guide](https://github.com/Photivra/photivra/blob/main/docs/DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateCielabFromCielch

CIE LCh(ab) → CIELAB.

```ts
export function calculateCielabFromCielch(input: { lch: CielchColor }): CalculationResult<CielabColor>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## calculateCielabFromXyz

CIE XYZ → CIELAB relative to a reference white (same XYZ scale).

```ts
export function calculateCielabFromXyz(input: { xyz: CieXyzTristimulus; referenceWhiteXyz: CieXyzTristimulus }): CalculationResult<CielabColor>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## calculateCielchFromCielab

CIELAB → CIE LCh(ab): C*ab = √(a*² + b*²), h_ab = atan2(b*, a*) in degrees.

```ts
export function calculateCielchFromCielab(input: { lab: CielabColor }): CalculationResult<CielchColor>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## calculateColorDifference

Colour difference between two CIELAB colours with an explicit formula.

```ts
export function calculateColorDifference(input: CalculateColorDifferenceInput): CalculationResult<{ deltaE: number; formula: ColorDifferenceFormula }>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateColorDifferenceInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CalculateColorDifferenceInput {
  /** Reference (standard) colour; ΔE94 is asymmetric in it. */
  reference: CielabColor;
  sample: CielabColor;
  formula: ColorDifferenceFormula;
  /** CIEDE2000 only; defaults to 1, 1, 1. */
  parametricFactors?: Ciede2000ParametricFactors;
}
```

## calculateXyzFromCielab

CIELAB → CIE XYZ relative to a reference white.

```ts
export function calculateXyzFromCielab(input: { lab: CielabColor; referenceWhiteXyz: CieXyzTristimulus }): CalculationResult<CieXyzTristimulus>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## Ciede2000ParametricFactors

CIEDE2000 parametric factors (default 1, 1, 1 for reference conditions).

```ts
export interface Ciede2000ParametricFactors {
  lightness: number;
  chroma: number;
  hue: number;
}
```

## CielabColor

CIE 1976 L*a*b* coordinates.

```ts
export interface CielabColor {
  lStar: number;
  aStar: number;
  bStar: number;
}
```

## CielchColor

CIE 1976 L*C*h(ab) coordinates; hue in degrees [0, 360).

```ts
export interface CielchColor {
  lStar: number;
  chromaStar: number;
  hueDegrees: number;
}
```

## ColorDifferenceFormula

Colour-difference formula.

```ts
export type ColorDifferenceFormula = "cie76" | "cie94-graphic-arts" | "cie94-textiles" | "ciede2000";
```
