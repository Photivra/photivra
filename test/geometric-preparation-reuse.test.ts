// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  prepareGeometricMapping, calculateComposedGeometricMapping, calculateGeometricSamplingPlan,
  type DigitalGeometricTransform, type GeometricJacobian
} from "../src/index.js";
import { transform, resampler } from "./optics-group-fixtures.js";

const raster = { width: 9, height: 7, pitchMm: .5, centerMm: { x: .3, y: -.2 } };
function mapping(transforms: readonly DigitalGeometricTransform[]): ReturnType<typeof prepareGeometricMapping>["value"] {
  return prepareGeometricMapping({ transforms, frameTimeSeconds: .008 }).value;
}
function sample(input: ReturnType<typeof mapping>): ReturnType<typeof calculateGeometricSamplingPlan> {
  return calculateGeometricSamplingPlan({ mapping: input, sourceRaster: raster, destinationRaster: raster,
    resampler, physicalProjectionDistanceMm: 50 });
}
describe("call-local mapping preparation", () => {
  it("agrees exactly with scalar point evaluation for a fixed 32-case affine/radial corpus", () => {
    let seed = 0x43c1374c;
    function random(): number { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0)/4294967296; }
    const orientations: readonly GeometricJacobian[] = [[1,0,0,1],[0,-1,1,0],[-1,0,0,-1],[0,1,-1,0]];
    for (let i = 0; i < 32; i++) {
      const radial: DigitalGeometricTransform = { id: "radial", version: "1", domain: "reconstructed-linear", purpose: "distortion", kind: "radial",
        profile: { normalizationRadiusMm: 10, maximumNormalizedRadius: 1.5,
          coefficients: { k1: (random()-.5)*.1, k2: .001, k3: .0001 } } };
      const transforms: DigitalGeometricTransform[] = [
        { ...transform, id: "quarter-turn", matrix: orientations[i%4]!, offsetMm: { x: .3, y: -.2 } },
        { ...transform, id: "shear-scale", matrix: [.8+random()*.4, .05*random(), .05*random(), .8+random()*.4] }, radial ];
      if (i%2) transforms.reverse();
      const input = mapping(transforms), result = sample(input);
      expect(result.provenance.model).toBe("joint-geometric-sampling-plan");
      for (let y = 0; y < raster.height; y++) for (let x = 0; x < raster.width; x++) {
        const destinationPointMm = { x: raster.centerMm.x+(x+.5-raster.width/2)*raster.pitchMm,
          y: raster.centerMm.y-(y+.5-raster.height/2)*raster.pitchMm };
        expect(result.value.points[y*raster.width+x]).toEqual(calculateComposedGeometricMapping({ mapping: input, destinationPointMm }).value);
      }
      expect(result).toEqual(sample(input));
    }
  });
  it("does not alias affine component derivatives between points, mapping, caller or calls", () => {
    const matrix: [number,number,number,number] = [1,.1,0,1];
    const original = { ...transform, matrix }, input = mapping([original]), first = sample(input).value, second = sample(input).value;
    const a = first.points[0]!.components[0]!.jacobian as [number,number,number,number];
    expect(a).not.toBe(first.points[1]!.components[0]!.jacobian);
    expect(a).not.toBe((first.mapping.transforms[0] as typeof original).matrix);
    a[0] = 99; matrix[0] = 88;
    expect(first.points[1]!.components[0]!.jacobian[0]).toBe(1);
    expect((first.mapping.transforms[0] as typeof original).matrix[0]).toBe(1);
    expect((input.transforms[0] as typeof original).matrix[0]).toBe(1);
    expect(second.points[0]!.components[0]!.jacobian[0]).toBe(1);
    expect(sample(input).value.points[0]!.components[0]!.jacobian[0]).toBe(1);
  });
  it("revalidates external prepared input on every call instead of trusting a prior success", () => {
    const input = mapping([transform]);
    sample(input);
    const bad = { ...input, transforms: [{ ...transform, matrix: [0,0,0,0] as const }] };
    expect(() => sample(bad as typeof input)).toThrow();
    const radial: DigitalGeometricTransform = { id: "radial", version: "1", domain: "reconstructed-linear", purpose: "distortion", kind: "radial",
      profile: { normalizationRadiusMm: 10, maximumNormalizedRadius: 1, coefficients: { k1: -.01, k2: 0, k3: 0 } } };
    const prepared = mapping([radial]); sample(prepared);
    if (prepared.transforms[0]!.kind !== "radial") throw new Error("Expected radial profile");
    prepared.transforms[0]!.profile.coefficients.k1 = -1;
    expect(() => sample(prepared)).toThrow();
  });
  it("keeps every intermediate radial-envelope check during sampling", () => {
    const radial: DigitalGeometricTransform = { id: "radial", version: "1", domain: "reconstructed-linear", purpose: "distortion", kind: "radial",
      profile: { normalizationRadiusMm: 1, maximumNormalizedRadius: 1, coefficients: { k1: .01, k2: 0, k3: 0 } } };
    // Later reverse translation cannot excuse an intermediate point outside the lens domain.
    const input = mapping([{ ...transform, offsetMm: { x: 100, y: 0 } }, radial,
      { ...transform, id: "return", offsetMm: { x: -100, y: 0 } }]);
    expect(() => sample(input)).toThrow();
    expect(() => calculateComposedGeometricMapping({ mapping: input, destinationPointMm: { x: 0, y: 0 } })).toThrow();
  });
});
