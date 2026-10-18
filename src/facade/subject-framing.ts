// SPDX-License-Identifier: Apache-2.0

/**
 * Subject distance for framing a chart (2.3). Thin lens: an object at distance d from a lens of focal length f
 * images at v = f·d/(d − f) with magnification m = v/d = f/(d − f), so the distance for a magnification m is
 * d = f·(1 + 1/m). This is the same framing the capture facade uses (`scene.framing`, `chartSize`), so a chart
 * placed at the returned distance with `chartSize` fills the frame as reported.
 *
 * 2.5: `calculateChartFraming` is the inverse question: at a given subject distance (and focus distance), how much of the
 * frame does the chart cover? It uses the facade's own framing, m = v/d with v = f·s/(s − f) at the focus distance s.
 * @see docs/QUICK_START.md, "Fitting a chart to the frame" and "Chart coverage at any distance (2.5)".
 */

import { InvalidConfigurationError } from "../core/configuration-error.js";
import { requireInputObject } from "../core/record-validation.js";
import { calculateEquivalentFocalLength35Mm } from "../camera/equivalent-focal-length.js";
import { calculateGenericPrimeMinimumFocusDistanceM, resolveGenericPrimeLens, GENERIC_PRIME_EQUIVALENT_FOCAL_LENGTHS_MM, type GenericPrimeLens } from "../equipment/generic-prime-lenses.js";
import type { SimulateCaptureAssumption } from "./simulate-capture.js";

/** How the chart fits the frame: `contain` (default; the whole chart is visible and its limiting side touches the frame), `width`, `height` or `cover` (the chart fills the frame and is cropped on its other side). */
export type SubjectFramingFit = "contain" | "width" | "height" | "cover";

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

function positive(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 1e7) throw new InvalidConfigurationError(name + " must be a positive finite number.");
  return value;
}

/** Shared input checks and lens resolution of the two framing functions. */
function resolveFramingInput(input: unknown, name: string, extraKeys: readonly string[]): { record: Record<string, unknown>; sensorW: number; sensorH: number; crop: number;
  equivalent: number; focalLengthMm: number; prime: GenericPrimeLens | null; widthM: number; heightM: number; assumptions: SimulateCaptureAssumption[] } {
  requireInputObject(input, name + " input");
  const record = input as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!["sensor", "focalLengthMm", "equivalentFocalLengthMm", "chart", ...extraKeys].includes(key))
    throw new InvalidConfigurationError(name + " input has unknown field \"" + key + "\".");
  requireInputObject(record.sensor, "sensor");
  requireInputObject(record.chart, "chart");
  const sensor = record.sensor as Record<string, unknown>, chart = record.chart as Record<string, unknown>;
  for (const key of Object.keys(sensor)) if (key !== "widthMm" && key !== "heightMm") throw new InvalidConfigurationError("Unknown sensor field: " + key + ".");
  for (const key of Object.keys(chart)) if (key !== "widthM" && key !== "heightM") throw new InvalidConfigurationError("Unknown chart field: " + key + ".");
  const sensorW = positive(sensor.widthMm, "sensor.widthMm"), sensorH = positive(sensor.heightMm, "sensor.heightMm");
  if ((record.focalLengthMm === undefined) === (record.equivalentFocalLengthMm === undefined)) throw new InvalidConfigurationError("Give exactly one of focalLengthMm and equivalentFocalLengthMm.");
  const crop = calculateEquivalentFocalLength35Mm({ focalLengthMm: 1, activeImagingArea: { widthMm: sensorW, heightMm: sensorH } }).value.cropFactor35Mm;
  const assumptions: SimulateCaptureAssumption[] = [];
  const equivalent = record.equivalentFocalLengthMm === undefined ? positive(record.focalLengthMm, "focalLengthMm") * crop : positive(record.equivalentFocalLengthMm, "equivalentFocalLengthMm");
  const focalLengthMm = record.focalLengthMm === undefined ? equivalent / crop : record.focalLengthMm as number;
  const prime = (GENERIC_PRIME_EQUIVALENT_FOCAL_LENGTHS_MM as readonly number[]).includes(equivalent) && record.equivalentFocalLengthMm !== undefined ?
    resolveGenericPrimeLens({ equivalentFocalLengthMm: equivalent, activeImagingArea: { widthMm: sensorW, heightMm: sensorH } }) : null;
  const widthM = positive(chart.widthM, "chart.widthM");
  const heightM = chart.heightM === undefined ? widthM * sensorH / sensorW : positive(chart.heightM, "chart.heightM");
  if (chart.heightM === undefined) assumptions.push({ id: "chart.heightM", kind: "default", value: heightM, explanation: "The chart has the sensor's shape: height = width × sensor height / sensor width." });
  return { record, sensorW, sensorH, crop, equivalent, focalLengthMm, prime, widthM, heightM, assumptions };
}

/** The subject distance that fits a chart of a given physical size to the frame, with magnification, coverage and the minimum-focus check (2.3). */
export function calculateSubjectDistanceForFraming(input: CalculateSubjectDistanceForFramingInput): SubjectFraming {
  const { sensorW, sensorH, crop, equivalent, focalLengthMm, prime, widthM, heightM, assumptions } = resolveFramingInput(input, "calculateSubjectDistanceForFraming", ["fit"]);
  const fit = input.fit ?? "contain";
  if (!["contain", "width", "height", "cover"].includes(fit)) throw new InvalidConfigurationError("fit must be contain, width, height or cover.");
  if (input.fit === undefined) assumptions.push({ id: "fit", kind: "default", value: "contain", explanation: "The whole chart is visible: the side whose chart-to-sensor ratio is larger (the limiting side) fills the frame." });
  // Magnification that makes each chart side exactly fill the matching sensor side.
  const mWidth = sensorW / (widthM * 1000), mHeight = sensorH / (heightM * 1000);
  const m = fit === "width" ? mWidth : fit === "height" ? mHeight : fit === "contain" ? Math.min(mWidth, mHeight) : Math.max(mWidth, mHeight);
  const f = focalLengthMm / 1000, subjectDistanceM = f * (1 + 1 / m), minimumFocusDistanceM = prime ? prime.minimumFocusDistanceM : calculateGenericPrimeMinimumFocusDistanceM(focalLengthMm);
  assumptions.push({ id: "model.thin-lens-framing", kind: "model", value: { magnification: m, subjectDistanceM },
    explanation: "Thin lens focused on the chart plane: d = f·(1 + 1/m), image distance v = f·(1 + m), the same framing simulateCapture uses. Distances are from the lens; pupil positions, focus breathing and distortion are not modelled." });
  assumptions.push({ id: "minimumFocus", kind: "model", value: { minimumFocusDistanceM, rule: "max(0.10 m, f·(1 + 1/0.15))" },
    explanation: "The generic prime family's minimum focus rule (a thin-lens approximation, not a real lens)" + (prime ? " for " + prime.lensId : " applied to this focal length") + "." });
  if (input.equivalentFocalLengthMm !== undefined) assumptions.push({ id: "focalLengthMm", kind: "derived", value: focalLengthMm,
    explanation: "Equivalent focal length ÷ diagonal crop factor " + crop + " (calculateEquivalentFocalLength35Mm, 36 × 24 mm reference)." });
  return Object.freeze({ subjectDistanceM, magnification: m, imageDistanceMm: focalLengthMm * (1 + m), focalLengthMm, equivalentFocalLengthMm: equivalent, cropFactor35Mm: crop,
    chart: { widthM, heightM }, fit, framedWidthM: sensorW / 1000 / m, framedHeightM: sensorH / 1000 / m,
    coverage: { frameWidthFraction: widthM * 1000 * m / sensorW, frameHeightFraction: heightM * 1000 * m / sensorH }, prime, minimumFocusDistanceM,
    belowMinimumFocus: subjectDistanceM < minimumFocusDistanceM, scientificStatus: "approximation" as const, assumptions: Object.freeze(assumptions.map((a) => Object.freeze(a))) });
}

export interface CalculateChartFramingInput {
  /** Active sensor (or simulated frame) size, mm: for `simulateCapture`, output width × height × pixel pitch. */
  sensor: { widthMm: number; heightMm: number };
  /** Physical focal length, mm. Give exactly one of this and `equivalentFocalLengthMm`. */
  focalLengthMm?: number;
  /** Full-frame-equivalent focal length (diagonal crop factor); a generic prime's value also reports that lens (as `lens.prime`). */
  equivalentFocalLengthMm?: number;
  /** Chart size as for `simulateCapture` `chartSize`: heightM defaults to widthM × the sensor aspect (height / width). */
  chart: { widthM: number; heightM?: number };
  /** Distance from the lens to the chart plane, metres; more than the focal length. */
  subjectDistanceM: number;
  /** Focus distance, metres (as `lens.focusDistanceM`); default the subject distance. More than the focal length. */
  focusDistanceM?: number;
}

export interface ChartFraming {
  subjectDistanceM: number;
  focusDistanceM: number;
  /** Thin-lens image distance at the focus distance, f·s/(s − f), mm. */
  imageDistanceMm: number;
  /** Image size ÷ object size on the chart plane, v/d: f/(d − f) when focused on the chart. */
  magnification: number;
  focalLengthMm: number;
  equivalentFocalLengthMm: number;
  cropFactor35Mm: number;
  chart: { widthM: number; heightM: number };
  /** Plane area the frame covers at the subject distance, metres: sensor side ÷ magnification. */
  framedWidthM: number;
  framedHeightM: number;
  /** Fraction of the frame width and height the chart covers; above 1 means the chart is larger than the frame and cropped. */
  coverage: { frameWidthFraction: number; frameHeightFraction: number };
  /** The chart's image on the sensor, mm. */
  chartImageMm: { width: number; height: number };
  /** The generic prime of this equivalent focal length, when there is one. */
  prime: GenericPrimeLens | null;
  /** The generic prime rule max(0.10 m, f·(1 + 1/0.15)) at this focal length (the prime's own value when there is one). */
  minimumFocusDistanceM: number;
  /** True when the subject or focus distance is closer than the minimum focus distance (`simulateCapture` with `lens.prime` rejects it). */
  belowMinimumFocus: boolean;
  scientificStatus: "approximation";
  assumptions: readonly SimulateCaptureAssumption[];
}

/**
 * How much of the frame a chart of a given physical size covers at any subject distance (2.5): magnification, framed plane size,
 * coverage fractions (above 1 when cropped), the chart's image size and the minimum-focus check. The same thin-lens framing as
 * `simulateCapture` (`scene.framing`, `result.scene.chart`) and `calculateSubjectDistanceForFraming`.
 */
export function calculateChartFraming(input: CalculateChartFramingInput): ChartFraming {
  const { record, sensorW, sensorH, crop, equivalent, focalLengthMm, prime, widthM, heightM, assumptions } = resolveFramingInput(input, "calculateChartFraming",
    ["subjectDistanceM", "focusDistanceM"]);
  const subjectDistanceM = positive(record.subjectDistanceM, "subjectDistanceM");
  const focusDistanceM = record.focusDistanceM === undefined ? subjectDistanceM : positive(record.focusDistanceM, "focusDistanceM");
  if (record.focusDistanceM === undefined) assumptions.push({ id: "focusDistanceM", kind: "default", value: subjectDistanceM, explanation: "The lens is focused on the chart plane." });
  const f = focalLengthMm / 1000;
  if (!(subjectDistanceM > f) || !(focusDistanceM > f)) throw new InvalidConfigurationError("subjectDistanceM and focusDistanceM must be more than the focal length (" + f + " m).");
  // Written exactly as simulateCapture forms it, so the two agree to the last bit.
  const imageDistanceMm = focalLengthMm * focusDistanceM * 1000 / (focusDistanceM * 1000 - focalLengthMm);
  const magnification = imageDistanceMm / (subjectDistanceM * 1000);
  const framedWidthM = sensorW * subjectDistanceM / imageDistanceMm, framedHeightM = sensorH * subjectDistanceM / imageDistanceMm;
  const minimumFocusDistanceM = prime ? prime.minimumFocusDistanceM : calculateGenericPrimeMinimumFocusDistanceM(focalLengthMm);
  assumptions.push({ id: "model.thin-lens-framing", kind: "model", value: { magnification, imageDistanceMm },
    explanation: "Thin lens: image distance v = f·s/(s − f) at the focus distance s, magnification m = v/d on the chart plane at d, and the frame spans sensor side / m, " +
      "the same framing simulateCapture uses. Distances are from the lens; pupil positions, focus breathing and distortion are not modelled." });
  assumptions.push({ id: "minimumFocus", kind: "model", value: { minimumFocusDistanceM, rule: "max(0.10 m, f·(1 + 1/0.15))" },
    explanation: "The generic prime family's minimum focus rule (a thin-lens approximation, not a real lens)" + (prime ? " for " + prime.lensId : " applied to this focal length") + "." });
  if (record.equivalentFocalLengthMm !== undefined) assumptions.push({ id: "focalLengthMm", kind: "derived", value: focalLengthMm,
    explanation: "Equivalent focal length ÷ diagonal crop factor " + crop + " (calculateEquivalentFocalLength35Mm, 36 × 24 mm reference)." });
  return Object.freeze({ subjectDistanceM, focusDistanceM, imageDistanceMm, magnification, focalLengthMm, equivalentFocalLengthMm: equivalent, cropFactor35Mm: crop,
    chart: { widthM, heightM }, framedWidthM, framedHeightM, coverage: { frameWidthFraction: widthM / framedWidthM, frameHeightFraction: heightM / framedHeightM },
    chartImageMm: { width: widthM * 1000 * magnification, height: heightM * 1000 * magnification }, prime, minimumFocusDistanceM,
    belowMinimumFocus: subjectDistanceM < minimumFocusDistanceM || focusDistanceM < minimumFocusDistanceM, scientificStatus: "approximation" as const,
    assumptions: Object.freeze(assumptions.map((a) => Object.freeze(a))) });
}
