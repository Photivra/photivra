// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import {
  approximationResult,
  calculateDepthOfField,
  calculateSceneToSensorIrradianceQuadrature,
  calculateSignalToNoise,
  calculatedResult,
  calibratedResult,
  estimatedResult,
  type CalculationQuality
} from "../src/index.js";
import { sceneOpticalInput } from "./helpers/scene-optical-quadrature-fixture.js";

/** Collects every plain record or array in a tree that is frozen (typed arrays are skipped). */
function frozenNodes(value: unknown, path = "input", out: string[] = [], seen = new WeakSet<object>()): string[] {
  if (value === null || typeof value !== "object" || ArrayBuffer.isView(value) || seen.has(value)) return out;
  seen.add(value);
  if (Object.isFrozen(value)) out.push(path);
  for (const [key, entry] of Object.entries(value)) frozenNodes(entry, `${path}.${key}`, out, seen);
  return out;
}

const quality: CalculationQuality = {
  uncertainty: [{ quantityPath: "value.x", source: "calibration", kind: "relative", fraction: 0.02,
    confidence: { level: 0.95, basis: "test" } }],
  validRanges: [{ parameterPath: "input.x", unit: "1", minimum: 0, maximum: 1 }],
  notes: ["test note"]
};

describe("read-only result envelopes (2.0.0, #276)", () => {
  it("freezes the envelope, the provenance with its assumptions, and the top level of value", () => {
    const result = calculateSignalToNoise({ signalElectrons: 100, readNoiseElectrons: 2 });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.provenance)).toBe(true);
    expect(Object.isFrozen(result.provenance.assumptions)).toBe(true);
    expect(() => { (result.value as { snrLinear: number }).snrLinear = 0; }).toThrow(TypeError);
    expect(() => { (result as { value: unknown }).value = {}; }).toThrow(TypeError);
    expect(() => { (result.provenance as { model: string }).model = "x"; }).toThrow(TypeError);
    expect(() => { (result.provenance.assumptions as string[]).push("x"); }).toThrow(TypeError);
    expect(result.value.snrLinear).toBeCloseTo(100 / Math.sqrt(104), 12);
  });

  it("freezes quality metadata deeply, for every factory", () => {
    for (const make of [estimatedResult, calibratedResult, approximationResult, calculatedResult]) {
      const result = make({ x: 0.5 }, "test-model", "1.0.0", ["assumption"], structuredClone(quality));
      const q = result.quality!;
      for (const node of [result, result.value, q, q.uncertainty!, q.uncertainty![0]!, q.uncertainty![0]!.confidence!,
        q.validRanges!, q.validRanges![0]!, q.notes!]) {
        expect(Object.isFrozen(node)).toBe(true);
      }
    }
  });

  it("keeps nested value objects and typed arrays as supplied, and keeps identical serialization", () => {
    const nested = { y: 1 };
    const samples = new Float64Array([1, 2, 3]);
    const result = calculatedResult({ nested, samples, list: [nested] }, "test-model", "1.0.0");
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.list)).toBe(false);
    expect(Object.isFrozen(nested)).toBe(false);
    samples[0] = 9;
    expect(result.value.samples[0]).toBe(9);
    expect(Object.keys(result)).toEqual(["value", "provenance"]);
    const depth = calculateDepthOfField({ focalLengthMm: 50, aperture: 8, focusDistanceM: 5, circleOfConfusionMm: 0.03 });
    expect(JSON.parse(JSON.stringify(depth))).toEqual({ value: { ...depth.value }, provenance: { ...depth.provenance } });
  });

  it("leaves the caller's input exactly as frozen or mutable as it was", () => {
    const input = sceneOpticalInput();
    // The fixture's quadratures are engine result values, so their top level is already read-only.
    const before = frozenNodes(input);
    expect(before).toEqual(["input.spatialQuadrature", "input.spectralQuadrature"]);
    const result = calculateSceneToSensorIrradianceQuadrature(input);
    expect(Object.isFrozen(result)).toBe(true);
    expect(frozenNodes(input)).toEqual(before);
    input.spatialQuadrature.nodes[0]!.preAntiAliasingSourcePointMm.x = 999;
    expect(input.spatialQuadrature.nodes[0]!.preAntiAliasingSourcePointMm.x).toBe(999);
  });
});
