// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  prepareGeometricMapping, calculateComposedGeometricMapping, calculateForwardGeometricMapping,
  calculateGeometricSamplingPlan, calculateGeometricResampling, parseDigitalGeometricTransform,
  type DigitalGeometricTransform, type PreparedGeometricMapping, type GeometricSamplingPlan
} from "../src/index.js";
import { raster, resampler, transform } from "./optics-group-fixtures.js";

function prepared(transforms: readonly DigitalGeometricTransform[] = []): PreparedGeometricMapping {
  return prepareGeometricMapping({ transforms, frameTimeSeconds: 0 }).value;
}
function plan(mapping = prepared(), filter = resampler): GeometricSamplingPlan {
  return calculateGeometricSamplingPlan({ mapping, sourceRaster: raster, destinationRaster: raster,
    resampler: filter, physicalProjectionDistanceMm: 50 }).value;
}
describe("composed digital geometry", () => {
  it("samples identity exactly with bilinear and nearest and deterministic full crop", () => {
    const values = Array.from({ length: 25 }, (_, i) => i);
    for (const filter of ["bilinear", "nearest"] as const) {
      const p = plan(prepared(), { ...resampler, filter });
      expect(p.jointCrop).toEqual({ x: 0, y: 0, width: 5, height: 5 });
      expect(p.validSourceMask.every(Boolean)).toBe(true);
      expect(calculateGeometricResampling({ plan: p, sourceSamples: values }).value.samples).toEqual(values);
      expect(p).toEqual(plan(prepared(), { ...resampler, filter }));
      expect(p.physicalCapturedFovDegrees.horizontal).toBeCloseTo(2*Math.atan(2.5/50)*180/Math.PI, 12);
    }
  });
  it("composes noncommuting distortion, breathing, rotation/stabilization once", () => {
    const distortion: DigitalGeometricTransform = { id: "radial", version: "1", domain: "reconstructed-linear",
      purpose: "distortion", kind: "radial", profile: { normalizationRadiusMm: 10, maximumNormalizedRadius: 1,
        coefficients: { k1: -.1, k2: 0, k3: 0 } } };
    const breathing = { ...transform, matrix: [1.2, 0, 0, 1.1] as const };
    const stabilization = { ...transform, id: "stabilization", purpose: "digital-stabilization" as const,
      matrix: [0, -1, 1, 0] as const, offsetMm: { x: .2, y: -.1 } };
    const mapping = prepared([stabilization, breathing, distortion]);
    const point = { x: .4, y: -.3 };
    const mapped = calculateComposedGeometricMapping({ mapping, destinationPointMm: point }).value;
    expect(mapped.components.map((c) => c.id)).toEqual(["stabilization", "warp", "radial"]);
    const back = calculateForwardGeometricMapping({ mapping, sourcePointMm: mapped.sourcePointMm }).value;
    expect(back.x).toBeCloseTo(point.x, 12); expect(back.y).toBeCloseTo(point.y, 12);
    const p = plan(mapping);
    expect(calculateGeometricResampling({ plan: p, sourceSamples: Array<number>(25).fill(1) }).value.resamplePasses).toBe(1);
    expect(mapping.semanticKey).toBe(prepared([stabilization, breathing, distortion]).semanticKey);
    expect(mapping.semanticKey).not.toBe(prepareGeometricMapping({ transforms: mapping.transforms, frameTimeSeconds: 1 }).value.semanticKey);
  });
  it("checks full Jacobian against independent centered differences and preserves anisotropy", () => {
    const mapping = prepared([{ ...transform, matrix: [1.5, .3, .2, .8] },
      { id: "radial", version: "1", domain: "reconstructed-linear", purpose: "distortion", kind: "radial",
        profile: { normalizationRadiusMm: 4, maximumNormalizedRadius: 2, coefficients: { k1: .1, k2: -.002, k3: .001 } } }]);
    const p = { x: 1, y: .5 }, h = 1e-5;
    const value = calculateComposedGeometricMapping({ mapping, destinationPointMm: p }).value;
    for (const [axis, indices] of [["x", [0, 2]], ["y", [1, 3]]] as const) {
      const plus = calculateComposedGeometricMapping({ mapping, destinationPointMm: { ...p, [axis]: p[axis]+h } }).value.sourcePointMm;
      const minus = calculateComposedGeometricMapping({ mapping, destinationPointMm: { ...p, [axis]: p[axis]-h } }).value.sourcePointMm;
      expect(value.jacobian[indices[0]]).toBeCloseTo((plus.x-minus.x)/(2*h), 8);
      expect(value.jacobian[indices[1]]).toBeCloseTo((plus.y-minus.y)/(2*h), 8);
    }
    expect(value.anisotropy).toBeGreaterThan(1.5);
    expect(value.principalStretches[0]*value.principalStretches[1]).toBeCloseTo(Math.abs(value.determinant), 12);
  });
  it("round trips all quarter turns with off-center captured support", () => {
    for (const matrix of [[1, 0, 0, 1], [0, -1, 1, 0], [-1, 0, 0, -1], [0, 1, -1, 0]] as const) {
      const mapping = prepared([{ ...transform, purpose: "orientation-crop", matrix, offsetMm: { x: 3, y: -2 } }]);
      const p = { x: .3, y: -.7 };
      const source = calculateComposedGeometricMapping({ mapping, destinationPointMm: p }).value.sourcePointMm;
      const roundTrip = calculateForwardGeometricMapping({ mapping, sourcePointMm: source }).value;
      expect(roundTrip.x).toBeCloseTo(p.x, 12); expect(roundTrip.y).toBeCloseTo(p.y, 12);
      const sampling = calculateGeometricSamplingPlan({ mapping, sourceRaster: { ...raster, centerMm: { x: 3, y: -2 } },
        destinationRaster: raster, resampler, physicalProjectionDistanceMm: 50 }).value;
      expect(sampling.validSourceMask.every(Boolean)).toBe(true);
      expect(sampling.jointCrop).toEqual({ x: 0, y: 0, width: 5, height: 5 });
    }
  });
  it("requires prefiltering for compression, independent of geometry/resampler identity", () => {
    const mapping = prepared([{ ...transform, matrix: [2, 0, 0, .5] }]);
    const blocked = plan(mapping, { ...resampler, antialias: "none" });
    expect(blocked.requiresPrefilter).toBe(true); expect(blocked.canResample).toBe(false);
    expect(() => calculateGeometricResampling({ plan: blocked, sourceSamples: Array<number>(25).fill(1) })).toThrow();
    expect(plan(mapping).canResample).toBe(true);
  });
  it("joint crop avoids opposing sequential translations and masks unavailable samples", () => {
    const a = { ...transform, offsetMm: { x: 3, y: 0 } }, b = { ...transform, id: "return", offsetMm: { x: -3, y: 0 } };
    expect(plan(prepared([a, b])).jointCrop).toEqual({ x: 0, y: 0, width: 5, height: 5 });
    const p = plan(prepared([a]));
    expect(p.jointCrop).toEqual({ x: 0, y: 0, width: 2, height: 5 });
    expect(calculateGeometricResampling({ plan: p, sourceSamples: Array<number>(25).fill(9) }).value.samples[2]).toBe(null);
    const empty = plan(prepared([{ ...a, offsetMm: { x: 20, y: 0 } }]));
    expect(empty.jointCrop).toBe(null); expect(empty.retainedSampleRayEnvelopeDegrees).toBe(null);
  });
  it("bilinear samples a linear ramp exactly without manufacturing border data", () => {
    const p = plan(prepared([{ ...transform, offsetMm: { x: .5, y: -.5 } }]));
    const data = Array.from({ length: 25 }, (_, i) => i%5+10*Math.floor(i/5));
    const result = calculateGeometricResampling({ plan: p, sourceSamples: data }).value.samples;
    expect(result[0]).toBe(5.5); expect(result[4]).toBe(null); expect(result[24]).toBe(null);
  });
  it("preserves a nonrectangular support mask before choosing a joint safe crop", () => {
    const c = Math.SQRT1_2;
    const p = plan(prepared([{ ...transform, matrix: [c, -c, c, c], purpose: "orientation-crop" }]));
    expect(p.validSourceMask.map((v) => v ? 1 : 0)).toEqual([
      0, 0, 1, 0, 0,
      0, 1, 1, 1, 0,
      1, 1, 1, 1, 1,
      0, 1, 1, 1, 0,
      0, 0, 1, 0, 0
    ]);
    expect(p.jointCrop).toEqual({ x: 1, y: 1, width: 3, height: 3 });
  });
  it("keeps incompatible domains separate and rejects a fused pass", () => {
    const mapping = prepared([transform, { ...transform, id: "raw", domain: "raw-channel" }]);
    expect(mapping.groups.length).toBe(2); expect(() => plan(mapping)).toThrow();
  });
  it("warps existing blur rather than regenerating a sharp point", () => {
    const source = Array<number>(25).fill(0); source[11] = 1; source[12] = 2; source[13] = 1;
    const p = plan(prepared([{ ...transform, matrix: [.5, 0, 0, 1] }]));
    const image = calculateGeometricResampling({ plan: p, sourceSamples: source }).value.samples;
    expect(image.slice(10, 15)).toEqual([1, 1.5, 2, 1.5, 1]);
    expect(source.slice(10, 15)).toEqual([0, 1, 2, 1, 0]);
  });
  it("rejects unsupported enums, holes, singular maps, folded radial profiles and invalid work", () => {
    for (const value of [null, { ...transform, purpose: "fake" }, { ...transform, extra: true },
      { ...transform, matrix: [0, 0, 0, 0] }, { ...transform, matrix: [1, 0] },
      { ...transform, matrix: [1, 0, 0, Infinity] }, { ...transform, offsetMm: { x: NaN, y: 0 } },
      { ...transform, profile: {} }, { ...transform, matrix: Array(4) },
      { ...transform, kind: "radial", profile: { normalizationRadiusMm: 1, maximumNormalizedRadius: 1, coefficients: { k1: -1, k2: 0, k3: 0 } } }]) {
      expect(() => parseDigitalGeometricTransform(value)).toThrow();
    }
    expect(() => prepared([transform, transform])).toThrow();
    expect(() => prepareGeometricMapping({ transforms: [], frameTimeSeconds: -1 })).toThrow();
    expect(() => calculateGeometricSamplingPlan({ mapping: prepared(), sourceRaster: { ...raster, width: 1.5 },
      destinationRaster: raster, resampler, physicalProjectionDistanceMm: 50 })).toThrow();
    expect(() => calculateGeometricResampling({ plan: plan(), sourceSamples: [1] })).toThrow();
  });
});
