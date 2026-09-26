// SPDX-License-Identifier: Apache-2.0

import { InvalidScientificResultError } from "./validation.js";

/**
 * Scientific provenance labels used throughout the public API.
 */
export type ProvenanceKind =
  | "calculated"
  | "calibrated"
  | "estimated"
  | "approximation";

/**
 * Metadata describing how a numerical result was produced.
 */
export interface CalculationProvenance {
  /** Classification of the result's scientific origin. */
  kind: ProvenanceKind;
  /** Stable identifier for the model or equation set. */
  model: string;
  /** Version of the model, independent of the package version. */
  modelVersion: string;
  /** Concise assumptions that materially affect interpretation. */
  assumptions?: readonly string[];
}

/**
 * Source category for a quantified uncertainty estimate.
 */
export type UncertaintySource =
  | "measurement"
  | "model-approximation"
  | "calibration";

/**
 * Optional confidence metadata for a quantified uncertainty estimate.
 *
 * A confidence level is only meaningful when the basis can be stated. It must
 * not be used as a generic subjective confidence score.
 */
export interface UncertaintyConfidence {
  /** Confidence/coverage level as a fraction in the interval (0, 1]. */
  level: number;
  /** Concise description of the statistical/empirical basis. */
  basis: string;
}

interface UncertaintyEstimateBase {
  /** JSON-style path to the affected result quantity, e.g. value.distanceM. */
  quantityPath: string;
  /** Physical/statistical origin of this uncertainty component. */
  source: UncertaintySource;
  /** Optional confidence/coverage metadata when scientifically meaningful. */
  confidence?: UncertaintyConfidence;
  /** Concise interpretation note, if needed. */
  note?: string;
}

/**
 * Absolute symmetric uncertainty around a result quantity.
 */
export interface AbsoluteUncertaintyEstimate extends UncertaintyEstimateBase {
  kind: "absolute";
  /** Symmetric ± magnitude in the explicitly named unit. */
  plusMinus: number;
  /** Explicit unit such as mm, m, px, or "1" for dimensionless values. */
  unit: string;
}

/**
 * Relative symmetric uncertainty around a result quantity.
 */
export interface RelativeUncertaintyEstimate extends UncertaintyEstimateBase {
  kind: "relative";
  /** Symmetric ± fractional magnitude; 0.05 means ±5%. */
  fraction: number;
}

export type UncertaintyEstimate =
  | AbsoluteUncertaintyEstimate
  | RelativeUncertaintyEstimate;

/**
 * Documented parameter range over which a model/calibration is considered
 * valid. This is model applicability metadata, not a statistical interval.
 */
export interface CalculationValidRange {
  /** JSON-style input/model parameter path, e.g. input.focusDistanceM. */
  parameterPath: string;
  /** Explicit unit such as m, mm, ISO, or "1" for dimensionless values. */
  unit: string;
  minimum?: number;
  maximum?: number;
  note?: string;
}

/**
 * Optional quality metadata for a calculation result.
 *
 * Components remain separate by default. Callers must not add, combine in
 * quadrature, or otherwise collapse uncertainty components unless a
 * scientifically justified composition method explicitly documents
 * independence/correlation assumptions.
 */
export interface CalculationQuality {
  uncertainty?: readonly UncertaintyEstimate[];
  validRanges?: readonly CalculationValidRange[];
  notes?: readonly string[];
}

/**
 * Standard result envelope for public scientific calculations.
 *
 * Deterministic analytical results remain lightweight: quality is omitted when
 * there is no defensible uncertainty/accuracy metadata to report.
 *
 * @typeParam T Serializable value returned by the calculation.
 */
export interface CalculationResult<T> {
  value: T;
  provenance: CalculationProvenance;
  quality?: CalculationQuality;
}

const UNCERTAINTY_SOURCES = new Set<UncertaintySource>([
  "measurement",
  "model-approximation",
  "calibration"
]);

function requireNonEmptyString(path: string, value: unknown): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidScientificResultError(
      `Calculation quality field ${path} must not be empty.`
    );
  }
}

function requireNonNegativeFinite(path: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new InvalidScientificResultError(
      `Calculation quality field ${path} must be finite and greater than or equal to zero.`
    );
  }
}

function validateConfidence(
  confidence: UncertaintyConfidence | undefined,
  path: string
): void {
  if (confidence === undefined) {
    return;
  }

  if (
    !Number.isFinite(confidence.level) ||
    confidence.level <= 0 ||
    confidence.level > 1
  ) {
    throw new InvalidScientificResultError(
      `Calculation quality field ${path}.level must be in (0, 1].`
    );
  }
  requireNonEmptyString(`${path}.basis`, confidence.basis);
}

function validateUncertaintyEstimate(
  estimate: UncertaintyEstimate,
  index: number
): void {
  const path = `uncertainty[${index}]`;
  requireNonEmptyString(`${path}.quantityPath`, estimate.quantityPath);
  if (!UNCERTAINTY_SOURCES.has(estimate.source as UncertaintySource)) {
    throw new InvalidScientificResultError(
      `Calculation quality field ${path}.source is invalid.`
    );
  }
  validateConfidence(estimate.confidence, `${path}.confidence`);

  if (estimate.note !== undefined) {
    requireNonEmptyString(`${path}.note`, estimate.note);
  }

  if (estimate.kind === "absolute") {
    requireNonNegativeFinite(`${path}.plusMinus`, estimate.plusMinus);
    requireNonEmptyString(`${path}.unit`, estimate.unit);
    return;
  }

  if (estimate.kind === "relative") {
    requireNonNegativeFinite(`${path}.fraction`, estimate.fraction);
    return;
  }

  throw new InvalidScientificResultError(
    `Calculation quality field ${path}.kind is invalid.`
  );
}

function validateValidRange(
  range: CalculationValidRange,
  index: number
): void {
  const path = `validRanges[${index}]`;
  requireNonEmptyString(`${path}.parameterPath`, range.parameterPath);
  requireNonEmptyString(`${path}.unit`, range.unit);

  if (range.minimum === undefined && range.maximum === undefined) {
    throw new InvalidScientificResultError(
      `Calculation quality field ${path} must include minimum or maximum.`
    );
  }

  if (range.minimum !== undefined && !Number.isFinite(range.minimum)) {
    throw new InvalidScientificResultError(
      `Calculation quality field ${path}.minimum must be finite.`
    );
  }
  if (range.maximum !== undefined && !Number.isFinite(range.maximum)) {
    throw new InvalidScientificResultError(
      `Calculation quality field ${path}.maximum must be finite.`
    );
  }
  if (
    range.minimum !== undefined &&
    range.maximum !== undefined &&
    range.minimum > range.maximum
  ) {
    throw new InvalidScientificResultError(
      `Calculation quality field ${path} minimum must not exceed maximum.`
    );
  }
  if (range.note !== undefined) {
    requireNonEmptyString(`${path}.note`, range.note);
  }
}

/**
 * Validates result-quality metadata before it enters a public result envelope.
 *
 * @param quality Optional calculation quality metadata.
 */
export function validateCalculationQuality(
  quality: CalculationQuality | undefined
): void {
  if (quality === undefined) {
    return;
  }

  if (quality.uncertainty !== undefined) {
    if (quality.uncertainty.length === 0) {
      throw new InvalidScientificResultError(
        "Calculation quality uncertainty must be omitted rather than empty."
      );
    }
    quality.uncertainty.forEach(validateUncertaintyEstimate);
  }

  if (quality.validRanges !== undefined) {
    if (quality.validRanges.length === 0) {
      throw new InvalidScientificResultError(
        "Calculation quality validRanges must be omitted rather than empty."
      );
    }
    quality.validRanges.forEach(validateValidRange);
  }

  if (quality.notes !== undefined) {
    if (quality.notes.length === 0) {
      throw new InvalidScientificResultError(
        "Calculation quality notes must be omitted rather than empty."
      );
    }
    quality.notes.forEach((note, index) => {
      requireNonEmptyString(`notes[${index}]`, note);
    });
  }

  if (
    quality.uncertainty === undefined &&
    quality.validRanges === undefined &&
    quality.notes === undefined
  ) {
    throw new InvalidScientificResultError(
      "Calculation quality must contain uncertainty, validRanges, or notes."
    );
  }
}

function assertFiniteNumbers(
  value: unknown,
  path: string,
  seen: WeakSet<object>
): void {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new InvalidScientificResultError(
        `Calculation produced a non-finite number at ${path}.`
      );
    }
    return;
  }

  if (typeof value !== "object" || value === null) {
    return;
  }

  if (seen.has(value)) {
    return;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      assertFiniteNumbers(entry, `${path}[${index}]`, seen);
    });
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    assertFiniteNumbers(entry, `${path}.${key}`, seen);
  }
}

function assertFiniteCalculationValue(value: unknown): void {
  assertFiniteNumbers(value, "value", new WeakSet<object>());
}

function createResult<T>(
  value: T,
  provenance: CalculationProvenance,
  quality?: CalculationQuality
): CalculationResult<T> {
  assertFiniteCalculationValue(value);
  validateCalculationQuality(quality);

  return {
    value,
    provenance,
    ...(quality === undefined ? {} : { quality })
  };
}

/**
 * Creates a deterministic calculated-result envelope.
 */
export function calculatedResult<T>(
  value: T,
  model: string,
  modelVersion: string,
  assumptions?: readonly string[],
  quality?: CalculationQuality
): CalculationResult<T> {
  return createResult(
    value,
    {
      kind: "calculated",
      model,
      modelVersion,
      ...(assumptions === undefined ? {} : { assumptions })
    },
    quality
  );
}

/**
 * Creates an approximation-result envelope.
 */
export function approximationResult<T>(
  value: T,
  model: string,
  modelVersion: string,
  assumptions: readonly string[],
  quality?: CalculationQuality
): CalculationResult<T> {
  return createResult(
    value,
    {
      kind: "approximation",
      model,
      modelVersion,
      assumptions
    },
    quality
  );
}

/**
 * Creates an estimated-result envelope with explicit quality metadata.
 */
export function estimatedResult<T>(
  value: T,
  model: string,
  modelVersion: string,
  assumptions: readonly string[],
  quality: CalculationQuality
): CalculationResult<T> {
  return createResult(
    value,
    {
      kind: "estimated",
      model,
      modelVersion,
      assumptions
    },
    quality
  );
}

/**
 * Creates a calibrated-result envelope with explicit quality metadata.
 */
export function calibratedResult<T>(
  value: T,
  model: string,
  modelVersion: string,
  assumptions: readonly string[],
  quality: CalculationQuality
): CalculationResult<T> {
  return createResult(
    value,
    {
      kind: "calibrated",
      model,
      modelVersion,
      assumptions
    },
    quality
  );
}
