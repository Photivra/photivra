# color/chromatic-adaptation.ts public contracts

The package and root API versions are recorded once in [Navigation](../API_REFERENCE.md) · [Developer guide](https://github.com/Photivra/photivra/blob/main/docs/DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateChromaticAdaptationMatrix

Calculates a linear chromatic-adaptation matrix between two whites. Linear CATs are
standard models, but they predict corresponding colours only approximately. The matrix
itself is calculated exactly from the declared transform.

```ts
export function calculateChromaticAdaptationMatrix(input: CalculateChromaticAdaptationMatrixInput): CalculationResult<ChromaticAdaptationMatrix>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateChromaticAdaptationMatrixInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CalculateChromaticAdaptationMatrixInput {
  transform: ChromaticAdaptationTransform;
  /** White of the source viewing/illumination condition (relative XYZ, Y > 0). */
  sourceWhiteXyz: CieXyzTristimulus;
  /** White of the destination condition (relative XYZ, Y > 0). */
  destinationWhiteXyz: CieXyzTristimulus;
  /** Degree of adaptation D in [0, 1]; defaults to 1 (complete adaptation). */
  degreeOfAdaptation?: number;
}
```

## calculateChromaticallyAdaptedXyz

Adapts one XYZ colour between whites with the selected transform.

```ts
export function calculateChromaticallyAdaptedXyz(input: CalculateChromaticAdaptationMatrixInput & { xyz: CieXyzTristimulus }): CalculationResult<{ xyz: CieXyzTristimulus; matrix: ColorMatrix3x3 }>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## calculateDegreeOfAdaptation

CIECAM02 degree of adaptation D = F[1 − (1/3.6) exp((−L_A − 42)/92)] (Moroney et al. 2002; also CIE 159:2004),
clamped to [0, 1]. L_A is the adapting-field luminance in cd/m².

```ts
export function calculateDegreeOfAdaptation(input: { adaptingLuminanceCdPerSquareMeter: number; surround: ViewingSurround }): CalculationResult<{ degreeOfAdaptation: number }>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CHROMATIC_ADAPTATION_TRANSFORMS

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
CHROMATIC_ADAPTATION_TRANSFORMS: readonly ChromaticAdaptationTransform[] = Object.freeze(["bradford", "cat16", "von-kries-hpe", "xyz-scaling"])
```

## ChromaticAdaptationMatrix

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ChromaticAdaptationMatrix {
  transform: ChromaticAdaptationTransform;
  degreeOfAdaptation: number;
  /** Row-major XYZ_source → XYZ_destination matrix. */
  matrix: ColorMatrix3x3;
  /** The per-channel cone-space gains Dᵢ. */
  coneGains: readonly [number, number, number];
}
```

## ChromaticAdaptationTransform

Supported linear chromatic-adaptation transforms.

```ts
export type ChromaticAdaptationTransform = "bradford" | "cat16" | "von-kries-hpe" | "xyz-scaling";
```

## resolveChromaticAdaptationConeMatrix

Returns a copy of the XYZ → cone-space matrix of a transform.

```ts
export function resolveChromaticAdaptationConeMatrix(transform: ChromaticAdaptationTransform): ColorMatrix3x3;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ViewingSurround

CIECAM02 surround factor F.

```ts
export type ViewingSurround = "average" | "dim" | "dark";
```
