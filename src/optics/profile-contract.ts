// SPDX-License-Identifier: Apache-2.0

import { InvalidScientificInputError } from "../core/validation.js";
import { parseEvidenceList, type EvidenceProvenance } from "../core/evidence-provenance.js";

/** Exact, generic camera/lens and acquisition state; no implicit interpolation. */
export interface OpticalProfileState {
  bodyId: string;
  bodyVersion: string;
  lensId: string;
  lensVersion: string;
  focalLengthMm: number;
  aperture: number;
  focusDistanceM: number;
  captureMode: "still" | "video";
  outputWidth: number;
  outputHeight: number;
  frameRateHz: number;
  stabilizationMode: string;
}

/** Generic approximation evidence; never implies measured calibration. */
export interface GenericOpticalEvidence {
  kind: "generic-parametric";
  basis: string;
  residualNote: string;
  sources: readonly EvidenceProvenance[];
}

/** @internal Strict shared profile parser helpers. */
export function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidScientificInputError("Expected a profile object.");
  }
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !keys.includes(key))) {
    throw new InvalidScientificInputError("Unknown profile field.");
  }
  return result;
}

/** @internal */
export function finite(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new InvalidScientificInputError(`${name} must be finite.`);
  }
  return value;
}

/** @internal */
export function positive(value: unknown, name: string): number {
  const number = finite(value, name);
  if (number <= 0) throw new InvalidScientificInputError(`${name} must be positive.`);
  return number;
}

/** @internal */
export function textValue(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new InvalidScientificInputError("Expected a nonempty identity or evidence string.");
  }
  return value;
}

/** @internal */
export function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  if (!choices.includes(value as T)) throw new InvalidScientificInputError("Unknown profile enum.");
  return value as T;
}

/** @internal Reject holes, duplicates (by consumers), and unbounded work. */
export function list(value: unknown, maximum = 4096): unknown[] {
  if (!Array.isArray(value) || value.length > maximum ||
      Array.from({ length: value.length }, (_, index) => index in value).includes(false)) {
    throw new InvalidScientificInputError("Expected a bounded dense array.");
  }
  return value;
}

/** Parses a complete exact-state binding, including still/video/output settings. */
export function parseOpticalProfileState(value: unknown): OpticalProfileState {
  const r = record(value, ["bodyId", "bodyVersion", "lensId", "lensVersion", "focalLengthMm",
    "aperture", "focusDistanceM", "captureMode", "outputWidth", "outputHeight", "frameRateHz", "stabilizationMode"]);
  const width = positive(r.outputWidth, "outputWidth");
  const height = positive(r.outputHeight, "outputHeight");
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) {
    throw new InvalidScientificInputError("Output dimensions must be safe integers.");
  }
  const mode = choice(r.captureMode, ["still", "video"]);
  const rate = finite(r.frameRateHz, "frameRateHz");
  if (mode === "still" ? rate !== 0 : rate <= 0) {
    throw new InvalidScientificInputError("Still frameRateHz must be zero; video must be positive.");
  }
  return {
    bodyId: textValue(r.bodyId), bodyVersion: textValue(r.bodyVersion),
    lensId: textValue(r.lensId), lensVersion: textValue(r.lensVersion),
    focalLengthMm: positive(r.focalLengthMm, "focalLengthMm"), aperture: positive(r.aperture, "aperture"),
    focusDistanceM: positive(r.focusDistanceM, "focusDistanceM"), captureMode: mode,
    outputWidth: width, outputHeight: height, frameRateHz: rate,
    stabilizationMode: textValue(r.stabilizationMode)
  };
}

/** @internal Exact binding; mismatches fail rather than extrapolate. */
export function requireSameState(expected: OpticalProfileState, actual: OpticalProfileState): void {
  if (JSON.stringify(parseOpticalProfileState(expected)) !== JSON.stringify(parseOpticalProfileState(actual))) {
    throw new InvalidScientificInputError("Profile is not applicable to this exact camera/lens state.");
  }
}

/** @internal */
export function parseEvidence(value: unknown): GenericOpticalEvidence {
  const r = record(value, ["kind", "basis", "residualNote", "sources"]);
  const sources = parseEvidenceList(list(r.sources, 32), "evidence.sources");
  return { kind: choice(r.kind, ["generic-parametric"]), basis: textValue(r.basis), residualNote: textValue(r.residualNote), sources };
}
