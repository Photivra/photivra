// SPDX-License-Identifier: Apache-2.0

/**
 * Module boundary and integration notes.
 * Strict allowlisted encoding parser; no default clipping/rounding policy is invented.
 * Quantizes one immutable inline float plane without changing its capture data. Mapping: blackCode +
 * (sample-blackValue)/(referenceWhiteValue-blackValue) * (referenceWhiteCode-blackCode). Clips only
 * under explicit policy, then rounds.
 * @see docs/LINEAR_CAPTURE_ENCODING.md for equations, coordinate/unit conventions, blockers and
 * support limits.
 */

import { requireAllowlistedRecord, isPublicOpaqueId } from "../core/record-validation.js";
import { calculatedResult, type CalculationResult } from "../core/calculation-result.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";
import { parseSimulatedCapture, type SimulatedCapture, type CaptureLinearPlane, type CaptureLinearImageState } from "./simulated-capture.js";

export const LINEAR_CAPTURE_ENCODING_SCHEMA_VERSION = "0.1.0" as const;
/** Uniform channel mapping; capture reference white comes from the source plane. */
export interface LinearCaptureEncoding {
  schemaVersion: typeof LINEAR_CAPTURE_ENCODING_SCHEMA_VERSION;
  /** Relative source sample value assigned blackCode; may be negative. */
  blackValue: number;
  /** Integer code at blackValue, 0..65534. An offset can preserve negative samples. */
  blackCode: number;
  /** Code at the plane's referenceWhiteValue, strictly above blackCode, at most 65535. */
  referenceWhiteCode: number;
  negativeValues: "preserve-if-representable" | "reject";
  outOfRange: "clip" | "reject";
  rounding: "nearest-ties-up";
}
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  return requireAllowlistedRecord(value, keys, "Invalid linear encoding fields.");
}
/** Strict allowlisted encoding parser; no default clipping/rounding policy is invented. */
export function parseLinearCaptureEncoding(value: unknown): LinearCaptureEncoding {
  const r = record(value, ["schemaVersion", "blackValue", "blackCode", "referenceWhiteCode", "negativeValues", "outOfRange", "rounding"]);
  if (r.schemaVersion !== LINEAR_CAPTURE_ENCODING_SCHEMA_VERSION || typeof r.blackValue !== "number" || !Number.isFinite(r.blackValue) ||
      typeof r.blackCode !== "number" || !Number.isInteger(r.blackCode) || r.blackCode < 0 || r.blackCode > 65534 ||
      typeof r.referenceWhiteCode !== "number" || !Number.isInteger(r.referenceWhiteCode) || r.referenceWhiteCode <= r.blackCode || r.referenceWhiteCode > 65535 ||
      (r.negativeValues !== "preserve-if-representable" && r.negativeValues !== "reject") ||
      (r.outOfRange !== "clip" && r.outOfRange !== "reject") || r.rounding !== "nearest-ties-up") {
    throw new InvalidConfigurationError("Invalid linear encoding range or explicit policy.");
  }
  return { schemaVersion: LINEAR_CAPTURE_ENCODING_SCHEMA_VERSION, blackValue: Object.is(r.blackValue, -0) ? 0 : r.blackValue,
    blackCode: r.blackCode, referenceWhiteCode: r.referenceWhiteCode, negativeValues: r.negativeValues,
    outOfRange: r.outOfRange, rounding: r.rounding };
}
export interface LinearCaptureEncodingInput {
  capture: SimulatedCapture;
  planeId: string;
  /** Prevents substituting a differently interpreted linear plane. */
  requiredImageState: CaptureLinearImageState;
  encoding: LinearCaptureEncoding;
}
/** Format-neutral 16-bit unsigned codes; metadata retains color/WB/saturation meaning. */
export interface EncodedLinearCapture {
  schemaVersion: typeof LINEAR_CAPTURE_ENCODING_SCHEMA_VERSION;
  captureId: string;
  /** Sanitized geometry/settings/WB/adopted-white/model provenance without float planes. */
  captureMetadata: Omit<SimulatedCapture, "planes">;
  sourcePlane: Omit<CaptureLinearPlane, "storage">;
  encoding: LinearCaptureEncoding;
  sampleLayout: "row-major-interleaved";
  bitDepth: 16;
  codeMinimum: 0;
  codeMaximum: 65535;
  referenceWhiteValue: number;
  /** Codes per relative source unit; same scale for all channels. */
  scale: number;
  minimumRepresentableValue: number;
  maximumRepresentableValue: number;
  /** Maximum above-black value / reference-white above-black value. */
  headroomFactor: number;
  /** 0.5/scale for in-range samples; excludes clipping error. */
  maximumRoundingError: number;
  clippedLowSampleCount: number;
  clippedHighSampleCount: number;
  /** No default rendering exposure/display white is chosen by linear encoding. */
  defaultRenderingExposureEv: null;
  samples: readonly number[];
}
/**
 * Quantizes one immutable inline float plane without changing its capture data.
 * Mapping: blackCode + (sample-blackValue)/(referenceWhiteValue-blackValue)
 * * (referenceWhiteCode-blackCode). Clips only under explicit policy, then rounds.
 */
export function calculateLinearCaptureEncoding(input: LinearCaptureEncodingInput): CalculationResult<EncodedLinearCapture> {
  const r = record(input, ["capture", "planeId", "requiredImageState", "encoding"]);
  const capture = parseSimulatedCapture(r.capture), encoding = parseLinearCaptureEncoding(r.encoding);
  if (!isPublicOpaqueId(r.planeId) ||
      !["scene-referred-xyz", "virtual-sensor-channels", "color-transformed-linear-rgb"].includes(r.requiredImageState as string)) {
    throw new InvalidConfigurationError("Invalid encoding plane/state identity.");
  }
  const plane = capture.planes.find((p) => p.id === r.planeId);
  if (!plane || plane.imageState !== r.requiredImageState || plane.storage.kind !== "inline-float64") {
    throw new InvalidConfigurationError("Encoding requires the exact image state and verified inline samples.");
  }
  const width = plane.referenceWhiteValue-encoding.blackValue;
  const codeWidth = encoding.referenceWhiteCode-encoding.blackCode;
  const scale = codeWidth/width;
  const minimum = encoding.blackValue-encoding.blackCode/scale;
  const maximum = encoding.blackValue+(65535-encoding.blackCode)/scale;
  if (!(width > 0) || ![width, scale, minimum, maximum, maximum-minimum].every(Number.isFinite) || !(scale > 0) ||
      minimum > encoding.blackValue || maximum < plane.referenceWhiteValue || maximum <= minimum ||
      (encoding.blackCode > 0 && minimum === encoding.blackValue)) {
    throw new InvalidConfigurationError("Linear encoding cannot represent the declared finite range.");
  }
  let low = 0, high = 0;
  const samples = plane.storage.samples.map((sample) => {
    if (encoding.negativeValues === "reject" && sample < 0) throw new InvalidConfigurationError("Negative source values are rejected by encoding policy.");
    // Compare in the source domain first: finite extremes can clip without overflowing arithmetic.
    if (sample < minimum || sample > maximum) {
      if (encoding.outOfRange === "reject") throw new InvalidConfigurationError("Source value exceeds the encoded range.");
      if (sample < minimum) { low++; return 0; }
      high++; return 65535;
    }
    if (sample === minimum) return 0;
    if (sample === maximum) return 65535;
    if (sample === encoding.blackValue) return encoding.blackCode;
    if (sample === plane.referenceWhiteValue) return encoding.referenceWhiteCode;
    const mapped = encoding.blackCode+(sample-encoding.blackValue)/width*codeWidth;
    // Round nearest, exact binary64 ties toward the larger code. Clamp roundoff at endpoints only.
    return Math.max(0, Math.min(65535, Math.floor(mapped+.5)));
  });
  const { storage: _storage, ...sourcePlane } = plane;
  const { planes: _planes, ...captureMetadata } = capture;
  void _storage; void _planes; // Float sample arrays are intentionally omitted from encoded metadata.
  return calculatedResult({ schemaVersion: LINEAR_CAPTURE_ENCODING_SCHEMA_VERSION, captureId: capture.captureId, captureMetadata, sourcePlane,
    encoding, sampleLayout: "row-major-interleaved", bitDepth: 16, codeMinimum: 0, codeMaximum: 65535,
    referenceWhiteValue: plane.referenceWhiteValue, scale, minimumRepresentableValue: minimum, maximumRepresentableValue: maximum,
    headroomFactor: (65535-encoding.blackCode)/codeWidth, maximumRoundingError: .5/scale,
    clippedLowSampleCount: low, clippedHighSampleCount: high, defaultRenderingExposureEv: null, samples },
  "uniform-linear-capture-uint16", LINEAR_CAPTURE_ENCODING_SCHEMA_VERSION,
  ["Deterministic unsigned linear codes; no dithering, transfer curve, tone mapping or serializer tags",
    "Reference white, capture saturation history, integer maximum and display white remain separate",
    "In-range error bound covers ideal rounding only; binary64 arithmetic can add floating-point error"]);
}
