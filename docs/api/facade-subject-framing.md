# facade/subject-framing.ts public contracts

The package and root API versions are recorded once in [Navigation](../API_REFERENCE.md) · [Developer guide](https://github.com/Photivra/photivra/blob/main/docs/DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateSubjectDistanceForFraming

The subject distance that fits a chart of a given physical size to the frame, with magnification, coverage and the minimum-focus check (2.3).

```ts
export function calculateSubjectDistanceForFraming(input: CalculateSubjectDistanceForFramingInput): SubjectFraming;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateSubjectDistanceForFramingInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CalculateSubjectDistanceForFramingInput {
  /** Active sensor (or simulated frame) size, mm. */
  sensor: { widthMm: number; heightMm: number };
  /** Physical focal length, mm. Give exactly one of this and `equivalentFocalLengthMm`. */
  focalLengthMm?: number;
  /** Full-frame-equivalent focal length (diagonal crop factor); a generic prime's value also reports that lens. */
  equivalentFocalLengthMm?: number;
  /** Chart size as for `simulateCapture` `chartSize`: heightM defaults to widthM × the sensor aspect (height / width). */
  chart: { widthM: number; heightM?: number };
  fit?: SubjectFramingFit;
}
```

## SubjectFraming

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SubjectFraming {
  /** Distance from the lens to the chart plane, metres: f·(1 + 1/m). */
  subjectDistanceM: number;
  /** Image size ÷ object size, f/(d − f). */
  magnification: number;
  /** Thin-lens image distance f·(1 + m), mm. */
  imageDistanceMm: number;
  focalLengthMm: number;
  equivalentFocalLengthMm: number;
  cropFactor35Mm: number;
  chart: { widthM: number; heightM: number };
  fit: SubjectFramingFit;
  /** Plane area the frame covers at that distance, metres. */
  framedWidthM: number;
  framedHeightM: number;
  /** Fraction of the frame width and height the chart covers (1 on the fitted side; above 1 means cropped). */
  coverage: { frameWidthFraction: number; frameHeightFraction: number };
  /** The generic prime of this equivalent focal length, when there is one. */
  prime: GenericPrimeLens | null;
  /** The generic prime rule max(0.10 m, f·(1 + 1/0.15)) at this focal length (the prime's own value when there is one). */
  minimumFocusDistanceM: number;
  /** True when the fit distance is closer than the minimum focus distance: the chart cannot be framed this way. */
  belowMinimumFocus: boolean;
  scientificStatus: "approximation";
  assumptions: readonly SimulateCaptureAssumption[];
}
```

## SubjectFramingFit

How the chart fits the frame: `contain` (default; the whole chart is visible and its limiting side touches the frame), `width`, `height` or `cover` (the chart fills the frame and is cropped on its other side).

```ts
export type SubjectFramingFit = "contain" | "width" | "height" | "cover";
```
