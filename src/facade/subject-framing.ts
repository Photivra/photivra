// SPDX-License-Identifier: Apache-2.0

/**
 * Subject distance for framing a chart (2.4). Thin lens: an object at distance d from a lens of focal length f
 * images at v = f·d/(d − f) with magnification m = v/d = f/(d − f), so the distance for a magnification m is
 * d = f·(1 + 1/m). This is the same framing the capture facade uses (`scene.framing`, `chartSize`), so a chart
 * placed at the returned distance with `chartSize` fills the frame as reported.
 * @see docs/QUICK_START.md, "Fitting a chart to the frame".
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

/** The subject distance that fits a chart of a given physical size to the frame, with magnification, coverage and the minimum-focus check (2.4). */
export function calculateSubjectDistanceForFraming(input: CalculateSubjectDistanceForFramingInput): SubjectFraming {
  requireInputObject(input, "calculateSubjectDistanceForFraming input");
  for (const key of Object.keys(input)) if (!["sensor", "focalLengthMm", "equivalentFocalLengthMm", "chart", "fit"].includes(key))
    throw new InvalidConfigurationError("calculateSubjectDistanceForFraming input has unknown field \"" + key + "\".");
  requireInputObject(input.sensor, "sensor");
  requireInputObject(input.chart, "chart");
  for (const key of Object.keys(input.sensor)) if (key !== "widthMm" && key !== "heightMm") throw new InvalidConfigurationError("Unknown sensor field: " + key + ".");
  for (const key of Object.keys(input.chart)) if (key !== "widthM" && key !== "heightM") throw new InvalidConfigurationError("Unknown chart field: " + key + ".");
  const sensorW = positive(input.sensor.widthMm, "sensor.widthMm"), sensorH = positive(input.sensor.heightMm, "sensor.heightMm");
  if ((input.focalLengthMm === undefined) === (input.equivalentFocalLengthMm === undefined)) throw new InvalidConfigurationError("Give exactly one of focalLengthMm and equivalentFocalLengthMm.");
  const crop = calculateEquivalentFocalLength35Mm({ focalLengthMm: 1, activeImagingArea: { widthMm: sensorW, heightMm: sensorH } }).value.cropFactor35Mm;
  const assumptions: SimulateCaptureAssumption[] = [];
  const equivalent = input.equivalentFocalLengthMm === undefined ? positive(input.focalLengthMm, "focalLengthMm") * crop : positive(input.equivalentFocalLengthMm, "equivalentFocalLengthMm");
  const focalLengthMm = input.focalLengthMm === undefined ? equivalent / crop : input.focalLengthMm;
  const prime = (GENERIC_PRIME_EQUIVALENT_FOCAL_LENGTHS_MM as readonly number[]).includes(equivalent) && input.equivalentFocalLengthMm !== undefined ?
    resolveGenericPrimeLens({ equivalentFocalLengthMm: equivalent, activeImagingArea: { widthMm: sensorW, heightMm: sensorH } }) : null;
  const widthM = positive(input.chart.widthM, "chart.widthM");
  const heightM = input.chart.heightM === undefined ? widthM * sensorH / sensorW : positive(input.chart.heightM, "chart.heightM");
  if (input.chart.heightM === undefined) assumptions.push({ id: "chart.heightM", kind: "default", value: heightM, explanation: "The chart has the sensor's shape: height = width × sensor height / sensor width." });
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
