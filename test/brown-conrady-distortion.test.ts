import { describe, expect, it } from "vitest";

import {
  calculateBrownConradyDistortionMapping,
  calculateInverseBrownConradyDistortionMapping,
  calculateRadialDistortionMapping,
  type BrownConradyDistortionProfile
} from "../src/index.js";

const PROFILE: BrownConradyDistortionProfile = {
  normalizationRadiusMm: 20,
  maximumNormalizedRadius: 1,
  coefficients: { k1: -0.08, k2: 0.01, k3: 0, p1: 0.002, p2: -0.0015 }
};

function rotate(p: { x: number; y: number }, a: number): { x: number; y: number } {
  return { x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) };
}

describe("Brown-Conrady radial + tangential distortion", () => {
  it("matches the closed-form equations at an off-centre point", () => {
    const point = { x: 8, y: -5 };
    const { k1, k2, k3, p1, p2 } = PROFILE.coefficients;
    const x = 8 / 20;
    const y = -5 / 20;
    const r2 = x * x + y * y;
    const s = 1 + k1 * r2 + k2 * r2 * r2 + k3 * r2 ** 3;
    const xd = x * s + 2 * p1 * x * y + p2 * (r2 + 2 * x * x);
    const yd = y * s + p1 * (r2 + 2 * y * y) + 2 * p2 * x * y;
    const result = calculateBrownConradyDistortionMapping({ imagePointMm: point, profile: PROFILE });
    expect(result.value.mappedImagePointMm.x).toBeCloseTo(xd * 20, 13);
    expect(result.value.mappedImagePointMm.y).toBeCloseTo(yd * 20, 13);
    expect(result.provenance.kind).toBe("approximation");
  });

  it("reduces exactly to the radial model when p1 = p2 = 0", () => {
    const radialProfile = { normalizationRadiusMm: 20, maximumNormalizedRadius: 1, coefficients: { k1: -0.08, k2: 0.01, k3: 0.002 } };
    const bc = { ...radialProfile, coefficients: { ...radialProfile.coefficients, p1: 0, p2: 0 } };
    for (const point of [{ x: 3, y: 4 }, { x: -12, y: 7 }, { x: 0, y: -19 }]) {
      const a = calculateBrownConradyDistortionMapping({ imagePointMm: point, profile: bc }).value.mappedImagePointMm;
      const b = calculateRadialDistortionMapping({ imagePointMm: point, profile: radialProfile }).value.mappedImagePointMm;
      expect(a.x).toBeCloseTo(b.x, 13);
      expect(a.y).toBeCloseTo(b.y, 13);
    }
  });

  it("keeps the optical axis fixed and has an analytic Jacobian matching finite differences", () => {
    expect(calculateBrownConradyDistortionMapping({ imagePointMm: { x: 0, y: 0 }, profile: PROFILE }).value.mappedImagePointMm).toEqual({ x: 0, y: 0 });
    const p = { x: 6, y: 9 };
    const h = 1e-5;
    const f = (q: { x: number; y: number }): { x: number; y: number } => calculateBrownConradyDistortionMapping({ imagePointMm: q, profile: PROFILE }).value.mappedImagePointMm;
    const fx1 = f({ x: p.x + h, y: p.y });
    const fx0 = f({ x: p.x - h, y: p.y });
    const fy1 = f({ x: p.x, y: p.y + h });
    const fy0 = f({ x: p.x, y: p.y - h });
    const a = (fx1.x - fx0.x) / (2 * h);
    const c = (fx1.y - fx0.y) / (2 * h);
    const b = (fy1.x - fy0.x) / (2 * h);
    const d = (fy1.y - fy0.y) / (2 * h);
    expect(calculateBrownConradyDistortionMapping({ imagePointMm: p, profile: PROFILE }).value.jacobianDeterminant).toBeCloseTo(a * d - b * c, 8);
  });

  it("is rotation-covariant when (p2, p1) rotates with the image, for all four orientations", () => {
    const point = { x: 7, y: 3 };
    const base = calculateBrownConradyDistortionMapping({ imagePointMm: point, profile: PROFILE }).value.mappedImagePointMm;
    const pVector = { x: PROFILE.coefficients.p2, y: PROFILE.coefficients.p1 };
    for (const turns of [0, 1, 2, 3]) {
      const a = (turns * Math.PI) / 2;
      const rp = rotate(pVector, a);
      const profile = { ...PROFILE, coefficients: { ...PROFILE.coefficients, p2: rp.x, p1: rp.y } };
      const mapped = calculateBrownConradyDistortionMapping({ imagePointMm: rotate(point, a), profile }).value.mappedImagePointMm;
      const expected = rotate(base, a);
      expect(mapped.x).toBeCloseTo(expected.x, 12);
      expect(mapped.y).toBeCloseTo(expected.y, 12);
    }
  });

  it("round-trips forward and inverse over the envelope, including off-centre and boundary points", () => {
    for (let ring = 0; ring <= 8; ring += 1) {
      for (let k = 0; k < 12; k += 1) {
        const rho = ((20 * ring) / 8) * (1 - 1e-12);
        const phi = (2 * Math.PI * k) / 12 + 0.1;
        const point = { x: rho * Math.cos(phi), y: rho * Math.sin(phi) };
        const forward = calculateBrownConradyDistortionMapping({ imagePointMm: point, profile: PROFILE }).value;
        const inverse = calculateInverseBrownConradyDistortionMapping({ distortedImagePointMm: forward.mappedImagePointMm, profile: PROFILE }).value;
        expect(inverse.sourceImagePointMm.x).toBeCloseTo(point.x, 10);
        expect(inverse.sourceImagePointMm.y).toBeCloseTo(point.y, 10);
        expect(inverse.residualMm).toBeLessThan(1e-10);
      }
    }
  });

  it("rejects destinations outside the mapped envelope", () => {
    expect(() => calculateInverseBrownConradyDistortionMapping({ distortedImagePointMm: { x: 40, y: 0 }, profile: PROFILE })).toThrow(/envelope/);
    expect(() => calculateBrownConradyDistortionMapping({ imagePointMm: { x: 21, y: 0 }, profile: PROFILE })).toThrow(/maximumNormalizedRadius/);
  });

  it("rejects profiles that fold (non-positive Jacobian) or whose radial part is non-monotonic", () => {
    // Large tangential terms fold the map near the envelope edge.
    expect(() => calculateBrownConradyDistortionMapping({
      imagePointMm: { x: 1, y: 1 },
      profile: { ...PROFILE, coefficients: { k1: 0, k2: 0, k3: 0, p1: 0.4, p2: 0 } }
    })).toThrow(/Jacobian/);
    // The radial validator is reused unchanged.
    expect(() => calculateBrownConradyDistortionMapping({
      imagePointMm: { x: 1, y: 1 },
      profile: { ...PROFILE, coefficients: { k1: -0.5, k2: 0, k3: 0, p1: 0, p2: 0 } }
    })).toThrow(/monotonic/);
  });

  it("fails closed on malformed input", () => {
    expect(() => calculateBrownConradyDistortionMapping(null as never)).toThrow(/object/);
    expect(() => calculateBrownConradyDistortionMapping({ imagePointMm: { x: 0, y: 0 }, profile: null as never })).toThrow(/object/);
    expect(() => calculateBrownConradyDistortionMapping({ imagePointMm: { x: 0, y: 0 }, profile: { ...PROFILE, coefficients: { ...PROFILE.coefficients, p1: Number.NaN } } })).toThrow(/p1/);
    expect(() => calculateInverseBrownConradyDistortionMapping({ distortedImagePointMm: { x: "1", y: 0 } as never, profile: PROFILE })).toThrow(/finite/);
  });
});
