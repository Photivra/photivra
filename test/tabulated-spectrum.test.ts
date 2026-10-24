// SPDX-License-Identifier: Apache-2.0
/**
 * #385: the scene illuminant's spectrum remembered per distinct wavelength returns the same double as evaluating it,
 * and evaluates each wavelength once. The display-view and capture hash locks check the bytes end to end.
 */
import { describe, expect, it } from "vitest";
import { resolveCaptureIlluminant, tabulatedSpectrum, type CaptureIlluminant } from "../src/facade/scene-radiance.js";

const ILLUMINANTS: readonly CaptureIlluminant[] = [
  { kind: "planckian", temperatureKelvin: 6500 },
  "cie-a"
];
const NODES = Array.from({ length: 21 }, (_, i) => 380 + 20 * i);

describe("tabulated illuminant spectrum (#385)", () => {
  it.each(ILLUMINANTS.map((illuminant) => [JSON.stringify(illuminant), illuminant] as const))("%s: the same double as evaluate, on every call", (_, illuminant) => {
    const { shape } = resolveCaptureIlluminant(illuminant);
    const shapeAt = tabulatedSpectrum(shape);
    for (let pass = 0; pass < 3; pass++) {
      for (const nm of [...NODES, 555.5, 412.25]) expect(Object.is(shapeAt(nm), shape.evaluate(nm))).toBe(true);
    }
  });

  it("evaluates each distinct wavelength once", () => {
    const { shape } = resolveCaptureIlluminant({ kind: "planckian", temperatureKelvin: 5000 });
    let calls = 0;
    const counted = { ...shape, evaluate: (nm: number): number => (calls++, shape.evaluate(nm)) };
    const shapeAt = tabulatedSpectrum(counted);
    for (let pass = 0; pass < 100; pass++) for (const nm of NODES) shapeAt(nm);
    expect(calls).toBe(NODES.length);
  });

  it("stays exact past its size limit (later wavelengths are evaluated every time)", () => {
    const { shape } = resolveCaptureIlluminant({ kind: "planckian", temperatureKelvin: 6500 });
    const shapeAt = tabulatedSpectrum(shape);
    for (let i = 0; i < 5000; i++) {
      const nm = 380 + i * 0.08;
      expect(Object.is(shapeAt(nm), shape.evaluate(nm))).toBe(true);
      expect(Object.is(shapeAt(nm), shape.evaluate(nm))).toBe(true);
    }
  });

  it("passes errors through and remembers nothing for them", () => {
    let fail = true;
    const shapeAt = tabulatedSpectrum({ evaluate: (nm: number): number => { if (fail) throw new RangeError("outside"); return nm; } } as never);
    expect(() => shapeAt(10)).toThrow(RangeError);
    fail = false;
    expect(shapeAt(10)).toBe(10);
  });
});
