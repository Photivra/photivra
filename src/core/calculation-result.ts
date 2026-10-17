// SPDX-License-Identifier: Apache-2.0

/**
 * The standard result envelope that every public calculation returns.
 *
 * An envelope pairs a value with provenance (how it was produced) and, when it can be
 * stated, quality metadata (uncertainty and validity range). This module defines those
 * types, validates quality metadata, and provides one constructor per provenance kind.
 * @see docs/API_STYLE.md for equations, coordinate/unit conventions, blockers and support limits.
 */

import { InvalidScientificResultError } from "./validation.js";
import { requireInputObject } from "./record-validation.js";

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
 * Give a confidence level only when you can state its basis. Do not use it as a
 * general, subjective confidence score.
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
 * The documented parameter range in which a model or calibration is valid.
 * It says where the model applies. It is not a statistical interval.
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
 * Uncertainty components stay separate. Do not add them, combine them in
 * quadrature (root-sum-of-squares) or merge them in any other way, unless you use
 * a scientifically justified method that documents its independence and
 * correlation assumptions.
 */
export interface CalculationQuality {
  uncertainty?: readonly UncertaintyEstimate[];
  validRanges?: readonly CalculationValidRange[];
  notes?: readonly string[];
}

/**
 * Standard result envelope for public scientific calculations.
 *
 * Deterministic analytical results stay lightweight. They omit `quality` when
 * there is no defensible uncertainty or accuracy metadata to report.
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
  requireInputObject(quality, "validateCalculationQuality input");

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

/**
 * Fast check for a non-finite number anywhere in a value tree. It builds no path strings.
 *
 * It walks the tree exactly as assertFiniteNumbers does: own enumerable string keys in
 * Object.keys order (as Object.entries), array indices that are present (as forEach), and
 * each object once. The slower diagnostic walk runs only when this finds a non-finite
 * number, so the thrown error type and path message are unchanged.
 */
function containsNonFiniteNumber(value: unknown, seen: WeakSet<object>): boolean {
  if (typeof value === "number") {
    return !Number.isFinite(value);
  }
  if (typeof value !== "object" || value === null || seen.has(value)) {
    return false;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      if (index in value && containsNonFiniteNumber(value[index], seen)) {
        return true;
      }
    }
    return false;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  for (let index = 0; index < keys.length; index++) {
    if (containsNonFiniteNumber(record[keys[index]!], seen)) {
      return true;
    }
  }
  return false;
}

/** Object visits allowed to the memo-free pre-scan before it defers to the exact visited-set scan. */
const FAST_FINITE_SCAN_MAX_OBJECT_VISITS = 1 << 16;
/** Nesting allowed to the memo-free pre-scan; a cycle or very deep tree defers to the exact scan. */
const FAST_FINITE_SCAN_MAX_DEPTH = 64;
const FAST_SCAN_FINITE = 0, FAST_SCAN_NON_FINITE = 1, FAST_SCAN_UNDECIDED = 2;
/** Remaining object visits of the active pre-scan; saved and restored around nested scans. */
let fastFiniteScanBudget = 0;

/**
 * Faster pre-scan that skips the visited-object WeakSet (a 2.0 performance change).
 *
 * It walks the tree like containsNonFiniteNumber (own enumerable string keys in Object.keys
 * order, present array indices). Without a WeakSet it may visit a shared node more than once.
 * So it gives up and returns UNDECIDED after FAST_FINITE_SCAN_MAX_OBJECT_VISITS objects or
 * FAST_FINITE_SCAN_MAX_DEPTH levels of nesting. Any cycle hits the depth limit.
 *
 * Revisiting cannot change the answer, because the set of reachable numbers is the same
 * either way. A non-finite number it finds is reachable, and a finished scan has seen every
 * reachable number. So any decided answer equals the exact scan's answer. UNDECIDED falls
 * back to the exact scan.
 */
function scanNonFiniteWithoutMemo(value: unknown, depth: number): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? FAST_SCAN_FINITE : FAST_SCAN_NON_FINITE;
  }
  if (typeof value !== "object" || value === null) {
    return FAST_SCAN_FINITE;
  }
  if (depth >= FAST_FINITE_SCAN_MAX_DEPTH || --fastFiniteScanBudget < 0) {
    return FAST_SCAN_UNDECIDED;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      if (index in value) {
        const entry: unknown = value[index];
        if (typeof entry === "number") {
          if (!Number.isFinite(entry)) return FAST_SCAN_NON_FINITE;
        } else if (typeof entry === "object" && entry !== null) {
          const result = scanNonFiniteWithoutMemo(entry, depth + 1);
          if (result !== FAST_SCAN_FINITE) return result;
        }
      }
    }
    return FAST_SCAN_FINITE;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  for (let index = 0; index < keys.length; index++) {
    const entry = record[keys[index]!];
    if (typeof entry === "number") {
      if (!Number.isFinite(entry)) return FAST_SCAN_NON_FINITE;
    } else if (typeof entry === "object" && entry !== null) {
      const result = scanNonFiniteWithoutMemo(entry, depth + 1);
      if (result !== FAST_SCAN_FINITE) return result;
    }
  }
  return FAST_SCAN_FINITE;
}

/** Internal: exact answer of containsNonFiniteNumber, using the memo-free pre-scan when it decides. */
export function calculationValueContainsNonFiniteNumber(value: unknown): boolean {
  const saved = fastFiniteScanBudget;
  fastFiniteScanBudget = FAST_FINITE_SCAN_MAX_OBJECT_VISITS;
  let result: number;
  try {
    result = scanNonFiniteWithoutMemo(value, 0);
  } finally {
    fastFiniteScanBudget = saved;
  }
  return result === FAST_SCAN_UNDECIDED ? containsNonFiniteNumber(value, new WeakSet<object>()) : result === FAST_SCAN_NON_FINITE;
}

/** Internal: the exact visited-set scan, exposed for equivalence tests only. */
export function calculationValueContainsNonFiniteNumberExact(value: unknown): boolean {
  return containsNonFiniteNumber(value, new WeakSet<object>());
}

function assertFiniteCalculationValue(value: unknown): void {
  if (calculationValueContainsNonFiniteNumber(value)) {
    assertFiniteNumbers(value, "value", new WeakSet<object>());
  }
}

function validateProvenanceIdentity(provenance: CalculationProvenance): void {
  for (const field of ["model", "modelVersion"] as const) {
    const entry: unknown = provenance[field];
    if (typeof entry !== "string" || entry.trim().length === 0) {
      throw new InvalidScientificResultError(
        `Calculation provenance ${field} must be a non-empty string.`
      );
    }
  }
}

/**
 * Estimated and calibrated results must carry quality metadata. The TypeScript
 * signature alone cannot stop a JavaScript caller from leaving it out, so check at runtime.
 */
function requireQuality(
  quality: CalculationQuality | undefined,
  kind: "estimated" | "calibrated"
): CalculationQuality {
  if (quality === undefined || quality === null) {
    throw new InvalidScientificResultError(
      `A ${kind} result requires calculation quality metadata.`
    );
  }
  return quality;
}

function createResult<T>(
  value: T,
  provenance: CalculationProvenance,
  quality?: CalculationQuality
): CalculationResult<T> {
  validateProvenanceIdentity(provenance);
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
    requireQuality(quality, "estimated")
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
    requireQuality(quality, "calibrated")
  );
}
