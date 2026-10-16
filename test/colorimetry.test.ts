// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  calculateChromaticAdaptationMatrix,
  calculateChromaticallyAdaptedXyz,
  calculateChromaticityFromCorrelatedColorTemperature,
  calculateCieDaylightComponentWeights,
  calculateCieIlluminantARelativeSpectralPower,
  calculateCielabFromCielch,
  calculateCielabFromXyz,
  calculateCielchFromCielab,
  calculateColorDifference,
  calculateCorrelatedColorTemperature,
  calculateDegreeOfAdaptation,
  calculatePlanckianChromaticity,
  calculatePlanckianSpectralRadiance,
  calculateXyzFromCielab,
  createCieDaylightSpectrum,
  createCieIlluminantASpectrum,
  createColorimetricMidpointQuadrature,
  createPlanckianSpectrum,
  estimateCie1931ColorMatchingFunctions,
  estimateCorrelatedColorTemperatureMcCamy,
  estimatePlanckianLocusChromaticity,
  integrateSpectrumToXyz,
  parseColorimetricQuadratureNodes,
  prepareColorMatchingFunctions,
  prepareColorimetricSpectrum,
  resolveChromaticAdaptationConeMatrix,
  CHROMATIC_ADAPTATION_TRANSFORMS,
  SECOND_RADIATION_CONSTANT_METER_KELVIN,
  type CielabColor,
  type ColorMatchingFunctionsSource,
  type ColorimetricQuadratureNode
} from "../src/index.js";

const WYMAN: ColorMatchingFunctionsSource = { kind: "wyman-2013-cie-1931-multi-lobe-fit" };
/** CIE 15 summation convention: 1 nm nodes at 360…830 nm, Δλ = 1 nm. */
const NODES_1NM: ColorimetricQuadratureNode[] = Array.from({ length: 471 }, (_, i) => ({ wavelengthNanometers: 360 + i, wavelengthMeasureNanometers: 1 }));
function uv(p: { x: number; y: number }): [number, number] {
  const d = -2 * p.x + 12 * p.y + 3;
  return [(4 * p.x) / d, (6 * p.y) / d];
}

describe("CIE 1931 colour-matching functions", () => {
  it("matches published CIE facts within the Wyman–Sloan–Shirley (2013) documented error", () => {
    // CIE dataset metadata (DOI 10.25039/CIE.DS.xvudnb9b) validation row at 479 nm and 1 nm column sums.
    const c = estimateCie1931ColorMatchingFunctions(479);
    expect(Math.abs(c.x - 0.1042979)).toBeLessThan(0.0142); // √(2.0e-4)
    expect(Math.abs(c.y - 0.1334528)).toBeLessThan(0.0080); // √(6.4e-5)
    expect(Math.abs(c.z - 0.8566193)).toBeLessThan(0.0222); // √(4.9e-4)
    let sx = 0, sy = 0, sz = 0;
    for (const n of NODES_1NM) {
      const v = estimateCie1931ColorMatchingFunctions(n.wavelengthNanometers);
      sx += v.x; sy += v.y; sz += v.z;
    }
    expect(Math.abs(sx / 106.8654694 - 1)).toBeLessThan(0.005);
    expect(Math.abs(sy / 106.8569171 - 1)).toBeLessThan(0.005);
    expect(Math.abs(sz / 106.8922512 - 1)).toBeLessThan(0.005);
    expect(() => estimateCie1931ColorMatchingFunctions(359)).toThrow();
    expect(() => estimateCie1931ColorMatchingFunctions(Number.NaN)).toThrow();
  });

  it("evaluates caller-tabulated CMFs by linear interpolation and fails closed outside the table", () => {
    const table = prepareColorMatchingFunctions({ kind: "tabulated", observer: "cie-1931-2-degree", datasetId: "synthetic",
      samples: [{ wavelengthNanometers: 500, xBar: 0, yBar: 1, zBar: 2 }, { wavelengthNanometers: 510, xBar: 1, yBar: 3, zBar: 2 }] });
    expect(table.evaluate(505)).toEqual({ x: 0.5, y: 2, z: 2 });
    expect(table.evaluate(510)).toEqual({ x: 1, y: 3, z: 2 });
    expect(() => table.evaluate(511)).toThrow();
    expect(() => prepareColorMatchingFunctions({ kind: "tabulated", observer: "cie-1931-2-degree", datasetId: "x",
      samples: [{ wavelengthNanometers: 500, xBar: -1, yBar: 1, zBar: 2 }, { wavelengthNanometers: 510, xBar: 1, yBar: 3, zBar: 2 }] })).toThrow();
    expect(() => prepareColorMatchingFunctions({ kind: "tabulated", observer: "cie-1931-2-degree", datasetId: "x",
      samples: [{ wavelengthNanometers: 510, xBar: 1, yBar: 1, zBar: 2 }, { wavelengthNanometers: 500, xBar: 1, yBar: 3, zBar: 2 }] })).toThrow();
    expect(() => prepareColorMatchingFunctions({ kind: "other" } as unknown as ColorMatchingFunctionsSource)).toThrow();
    const signed = prepareColorMatchingFunctions({ kind: "tabulated", observer: "caller-defined", datasetId: "x",
      samples: [{ wavelengthNanometers: 500, xBar: -1, yBar: 1, zBar: 2 }, { wavelengthNanometers: 510, xBar: 1, yBar: 3, zBar: 2 }] });
    expect(signed.evaluate(500).x).toBe(-1);
  });

  it("integrates spectra with explicit quadrature and white normalization", () => {
    const flat = { kind: "function" as const, wavelengthRangeNanometers: { minimum: 360, maximum: 830 }, evaluate: (): number => 1 };
    const grey = { kind: "tabulated" as const, samples: [{ wavelengthNanometers: 360, value: 0.18 }, { wavelengthNanometers: 830, value: 0.18 }] };
    const r = integrateSpectrumToXyz({ quadratureNodes: NODES_1NM, spectralDistribution: flat, spectralFactor: grey, colorMatchingFunctions: WYMAN, normalization: { kind: "white-luminance-one" } });
    expect(r.provenance.kind).toBe("approximation");
    expect(r.value.whiteXyz.y).toBeCloseTo(1, 14);
    expect(r.value.xyz.y).toBeCloseTo(0.18, 14);
    expect(r.value.xyz.x / r.value.whiteXyz.x).toBeCloseTo(0.18, 14);
    // Equal-energy white: x ≈ y ≈ 1/3 within the fit error.
    expect(Math.abs(r.value.chromaticity!.x - 1 / 3)).toBeLessThan(0.002);
    const tab = integrateSpectrumToXyz({ quadratureNodes: [{ wavelengthNanometers: 505, wavelengthMeasureNanometers: 2 }], spectralDistribution: flat,
      colorMatchingFunctions: { kind: "tabulated", observer: "caller-defined", datasetId: "t", samples: [{ wavelengthNanometers: 500, xBar: 1, yBar: 2, zBar: 3 }, { wavelengthNanometers: 510, xBar: 1, yBar: 2, zBar: 3 }] },
      normalization: { kind: "scale", factor: 683 } });
    expect(tab.provenance.kind).toBe("calculated");
    expect(tab.value.xyz).toEqual({ x: 1366, y: 2732, z: 4098 });
    expect(() => integrateSpectrumToXyz({ quadratureNodes: [{ wavelengthNanometers: 900, wavelengthMeasureNanometers: 1 }], spectralDistribution: flat, colorMatchingFunctions: WYMAN, normalization: { kind: "white-luminance-one" } })).toThrow();
    expect(() => integrateSpectrumToXyz({ quadratureNodes: NODES_1NM, spectralDistribution: { kind: "function", wavelengthRangeNanometers: { minimum: 360, maximum: 830 }, evaluate: () => 0 }, colorMatchingFunctions: WYMAN, normalization: { kind: "white-luminance-one" } })).toThrow();
    expect(() => integrateSpectrumToXyz({ quadratureNodes: NODES_1NM, spectralDistribution: flat, colorMatchingFunctions: WYMAN, normalization: { kind: "scale", factor: 0 } })).toThrow();
  });

  it("builds midpoint nodes whose measures sum to the range and validates nodes and spectra", () => {
    const nodes = createColorimetricMidpointQuadrature({ wavelengthRangeNanometers: { minimum: 380, maximum: 781 }, maximumSubintervalWidthNanometers: 5 });
    expect(nodes.length).toBe(81);
    expect(nodes.reduce((s, n) => s + n.wavelengthMeasureNanometers, 0)).toBeCloseTo(401, 10);
    expect(nodes[0]!.wavelengthNanometers).toBeCloseTo(380 + 401 / 81 / 2, 12);
    expect(() => createColorimetricMidpointQuadrature({ wavelengthRangeNanometers: { minimum: 500, maximum: 400 }, maximumSubintervalWidthNanometers: 5 })).toThrow();
    expect(() => createColorimetricMidpointQuadrature({ wavelengthRangeNanometers: { minimum: 1, maximum: 1e6 }, maximumSubintervalWidthNanometers: 1 })).toThrow();
    expect(() => parseColorimetricQuadratureNodes([])).toThrow();
    expect(() => parseColorimetricQuadratureNodes([{ wavelengthNanometers: 500, wavelengthMeasureNanometers: -1 }])).toThrow();
    expect(() => prepareColorimetricSpectrum({ kind: "function", wavelengthRangeNanometers: { minimum: 400, maximum: 500 }, evaluate: () => Number.NaN }).evaluate(450)).toThrow();
    expect(() => prepareColorimetricSpectrum({ kind: "tabulated", samples: [{ wavelengthNanometers: 400, value: 1 }] })).toThrow();
  });
});

describe("illuminants and correlated colour temperature", () => {
  it("implements Planck's law (Wien displacement and Stefan–Boltzmann checks)", () => {
    expect(SECOND_RADIATION_CONSTANT_METER_KELVIN).toBeCloseTo(1.438776877e-2, 10);
    const t = 5000;
    let peak = 0, peakNm = 0;
    for (let nm = 500; nm <= 660; nm += 0.01) {
      const l = calculatePlanckianSpectralRadiance({ temperatureKelvin: t, wavelengthNanometers: nm });
      if (l > peak) { peak = l; peakNm = nm; }
    }
    expect(Math.abs(peakNm - 2.897771955e6 / t)).toBeLessThan(0.02); // Wien b = 2.897771955e-3 m·K (CODATA)
    const nodes = createColorimetricMidpointQuadrature({ wavelengthRangeNanometers: { minimum: 20, maximum: 200000 }, maximumSubintervalWidthNanometers: 2 });
    const radiance = nodes.reduce((s, n) => s + calculatePlanckianSpectralRadiance({ temperatureKelvin: t, wavelengthNanometers: n.wavelengthNanometers }) * n.wavelengthMeasureNanometers, 0);
    expect(radiance / ((5.670374419e-8 * t ** 4) / Math.PI)).toBeCloseTo(1, 4); // σ (CODATA)
    expect(calculatePlanckianSpectralRadiance({ temperatureKelvin: 10, wavelengthNanometers: 300 })).toBe(0);
    expect(() => calculatePlanckianSpectralRadiance({ temperatureKelvin: 0, wavelengthNanometers: 500 })).toThrow();
  });

  it("evaluates CIE illuminant A from its defining formula and recovers its published chromaticity/CCT", () => {
    expect(calculateCieIlluminantARelativeSpectralPower(560)).toBeCloseTo(100, 12);
    expect(() => calculateCieIlluminantARelativeSpectralPower(299)).toThrow();
    const a = integrateSpectrumToXyz({ quadratureNodes: NODES_1NM, spectralDistribution: createCieIlluminantASpectrum(), colorMatchingFunctions: WYMAN, normalization: { kind: "white-luminance-one" } });
    // CIE 15:2018 illuminant A: x = 0.44758, y = 0.40745; the analytic CMF fit stays within 2e-3.
    expect(Math.abs(a.value.chromaticity!.x - 0.44758)).toBeLessThan(2e-3);
    expect(Math.abs(a.value.chromaticity!.y - 0.40745)).toBeLessThan(2e-3);
    // Illuminant A is a Planckian radiator at 2848 K × 1.4388/1.435 ≈ 2855.5 K under the current c2.
    const cct = calculateCorrelatedColorTemperature({ chromaticity: a.value.chromaticity!, locus: { kind: "planck-integration", colorMatchingFunctions: WYMAN, quadratureNodes: NODES_1NM } });
    expect(cct.value.correlatedColorTemperatureKelvin).toBeCloseTo(2848 * (SECOND_RADIATION_CONSTANT_METER_KELVIN / 1.435e-2), 0);
    expect(Math.abs(cct.value.duv)).toBeLessThan(1e-9);
  });

  it("computes the CIE daylight locus and builds D-series spectra from a caller basis", () => {
    const d65 = calculateCieDaylightComponentWeights({ correlatedColorTemperatureKelvin: 6504, coefficientRounding: "none" }).value;
    // CIE 15 D65 chromaticity (0.31272, 0.32903); the daylight polynomial agrees within 1e-4.
    expect(Math.abs(d65.chromaticity.x - 0.31272)).toBeLessThan(1e-4);
    expect(Math.abs(d65.chromaticity.y - 0.32903)).toBeLessThan(1.5e-4);
    const rounded = calculateCieDaylightComponentWeights({ correlatedColorTemperatureKelvin: 6504, coefficientRounding: "cie-three-decimals" }).value;
    expect(rounded.m1).toBe(Math.round(d65.m1 * 1000) / 1000);
    expect(Number.isInteger(Math.round(rounded.m2 * 1000)) && Math.abs(rounded.m2 * 1000 - Math.round(rounded.m2 * 1000)) < 1e-9).toBe(true);
    // Branch continuity at 7000 K within the published polynomial precision.
    const below = calculateCieDaylightComponentWeights({ correlatedColorTemperatureKelvin: 7000, coefficientRounding: "none" }).value.chromaticity;
    const above = calculateCieDaylightComponentWeights({ correlatedColorTemperatureKelvin: 7000.001, coefficientRounding: "none" }).value.chromaticity;
    expect(Math.abs(below.x - above.x)).toBeLessThan(1e-4);
    expect(() => calculateCieDaylightComponentWeights({ correlatedColorTemperatureKelvin: 3999, coefficientRounding: "none" })).toThrow();
    expect(() => calculateCieDaylightComponentWeights({ correlatedColorTemperatureKelvin: 6504, coefficientRounding: "x" as "none" })).toThrow();
    // Synthetic (owned) basis to check S = S0 + M1 S1 + M2 S2 assembly; not CIE data.
    const basis = {
      datasetId: "synthetic-test-basis",
      s0: [{ wavelengthNanometers: 400, value: 100 }, { wavelengthNanometers: 500, value: 110 }],
      s1: [{ wavelengthNanometers: 400, value: 10 }, { wavelengthNanometers: 500, value: 0 }],
      s2: [{ wavelengthNanometers: 400, value: 0 }, { wavelengthNanometers: 450, value: 4 }, { wavelengthNanometers: 500, value: 2 }]
    };
    const spd = createCieDaylightSpectrum({ correlatedColorTemperatureKelvin: 6504, coefficientRounding: "none", basis });
    if (spd.kind !== "tabulated") throw new Error("expected tabulated");
    expect(spd.samples[0]!.value).toBeCloseTo(100 + 10 * d65.m1, 12);
    expect(spd.samples[1]!.value).toBeCloseTo(110 + 2 * d65.m2, 12);
    expect(() => createCieDaylightSpectrum({ correlatedColorTemperatureKelvin: 6504, coefficientRounding: "none", basis: { ...basis, datasetId: "" } })).toThrow();
  });

  it("estimates CCT with McCamy and the Kim et al. locus consistent with published CIE values", () => {
    expect(estimateCorrelatedColorTemperatureMcCamy({ chromaticity: { x: 0.31272, y: 0.32903 } }).value.correlatedColorTemperatureKelvin).toBeCloseTo(6504, -1);
    expect(Math.abs(estimateCorrelatedColorTemperatureMcCamy({ chromaticity: { x: 0.44758, y: 0.40745 } }).value.correlatedColorTemperatureKelvin - 2856)).toBeLessThan(3);
    const kim = { kind: "kim-2002-cubic-spline" as const };
    const a = calculateCorrelatedColorTemperature({ chromaticity: { x: 0.44758, y: 0.40745 }, locus: kim }).value;
    expect(Math.abs(a.correlatedColorTemperatureKelvin - 2856)).toBeLessThan(10);
    expect(Math.abs(a.duv)).toBeLessThan(2e-4);
    const d65 = calculateCorrelatedColorTemperature({ chromaticity: { x: 0.31272, y: 0.32903 }, locus: kim }).value;
    expect(Math.abs(d65.correlatedColorTemperatureKelvin - 6504)).toBeLessThan(10);
    expect(d65.duv).toBeCloseTo(0.0032, 3); // D65 lies above the Planckian locus
    expect(estimatePlanckianLocusChromaticity({ temperatureKelvin: 6500 }).provenance.kind).toBe("approximation");
    expect(() => estimatePlanckianLocusChromaticity({ temperatureKelvin: 1000 })).toThrow();
    expect(() => calculateCorrelatedColorTemperature({ chromaticity: { x: 0.2, y: 0.6 }, locus: kim })).toThrow();
    expect(() => calculateCorrelatedColorTemperature({ chromaticity: { x: 0.65, y: 0.33 }, locus: kim })).toThrow();
  });

  it("round-trips CCT + Duv through chromaticity with the documented sign convention", () => {
    const kim = { kind: "kim-2002-cubic-spline" as const };
    for (const t of [2000, 3200, 5000, 6500, 12000]) {
      for (const duv of [-0.02, 0, 0.01]) {
        const xy = calculateChromaticityFromCorrelatedColorTemperature({ correlatedColorTemperatureKelvin: t, duv, whiteLocus: "planckian", locus: kim }).value;
        const back = calculateCorrelatedColorTemperature({ chromaticity: xy, locus: kim }).value;
        expect(back.correlatedColorTemperatureKelvin / t).toBeCloseTo(1, 4);
        expect(back.duv).toBeCloseTo(duv, 6);
        if (duv > 0) {
          const base = estimatePlanckianLocusChromaticity({ temperatureKelvin: t }).value;
          expect(xy.y).toBeGreaterThan(base.y); // positive Duv: above the locus, toward green
        }
      }
    }
    const daylight = calculateChromaticityFromCorrelatedColorTemperature({ correlatedColorTemperatureKelvin: 6504, duv: 0, whiteLocus: "cie-daylight", locus: kim });
    expect(daylight.provenance.kind).toBe("calculated");
    expect(daylight.value.x).toBeCloseTo(calculateCieDaylightComponentWeights({ correlatedColorTemperatureKelvin: 6504, coefficientRounding: "none" }).value.chromaticity.x, 12);
    expect(() => calculateChromaticityFromCorrelatedColorTemperature({ correlatedColorTemperatureKelvin: 3000, duv: 0, whiteLocus: "cie-daylight", locus: kim })).toThrow();
    expect(() => calculateChromaticityFromCorrelatedColorTemperature({ correlatedColorTemperatureKelvin: 3000, duv: 0.06, whiteLocus: "planckian", locus: kim })).toThrow();
    const exact = calculatePlanckianChromaticity({ temperatureKelvin: 4000, locus: { kind: "planck-integration", colorMatchingFunctions: WYMAN, quadratureNodes: NODES_1NM } });
    const planck = integrateSpectrumToXyz({ quadratureNodes: NODES_1NM, spectralDistribution: createPlanckianSpectrum({ temperatureKelvin: 4000, wavelengthRangeNanometers: { minimum: 360, maximum: 830 } }), colorMatchingFunctions: WYMAN, normalization: { kind: "white-luminance-one" } });
    expect(exact.value.x).toBeCloseTo(planck.value.chromaticity!.x, 14);
    // Kim spline vs exact Planck integration: bounded by the spline error plus the analytic-CMF error.
    const [ku, kv] = uv(estimatePlanckianLocusChromaticity({ temperatureKelvin: 4000 }).value), [pu, pv] = uv(exact.value);
    expect(Math.hypot(ku - pu, kv - pv)).toBeLessThan(1e-3);
  });
});

describe("chromatic adaptation", () => {
  const d65 = { x: 0.95047, y: 1, z: 1.08883 }, d50 = { x: 0.96422, y: 1, z: 0.82521 };
  it("reproduces the published linear Bradford D65→D50 matrix", () => {
    // Widely published Bradford D65→D50 matrix (e.g. Lindbloom), computed from the same whites.
    const expected = [[1.0478112, 0.0228866, -0.0501270], [0.0295424, 0.9904844, -0.0170491], [-0.0092345, 0.0150436, 0.7521316]];
    const m = calculateChromaticAdaptationMatrix({ transform: "bradford", sourceWhiteXyz: d65, destinationWhiteXyz: d50 }).value.matrix;
    m.forEach((row, i) => row.forEach((v, j) => expect(v).toBeCloseTo(expected[i]![j]!, 6)));
  });
  it("maps the source white to the destination white, honours D and inverts", () => {
    for (const transform of CHROMATIC_ADAPTATION_TRANSFORMS) {
      const r = calculateChromaticallyAdaptedXyz({ transform, sourceWhiteXyz: d65, destinationWhiteXyz: d50, xyz: d65 }).value.xyz;
      expect(r.x).toBeCloseTo(d50.x, 12); expect(r.y).toBeCloseTo(1, 12); expect(r.z).toBeCloseTo(d50.z, 12);
      const none = calculateChromaticAdaptationMatrix({ transform, sourceWhiteXyz: d65, destinationWhiteXyz: d50, degreeOfAdaptation: 0 }).value.matrix;
      none.forEach((row, i) => row.forEach((v, j) => expect(v).toBeCloseTo(i === j ? 1 : 0, 12)));
      const forward = calculateChromaticAdaptationMatrix({ transform, sourceWhiteXyz: d65, destinationWhiteXyz: d50 }).value.matrix;
      const back = calculateChromaticAdaptationMatrix({ transform, sourceWhiteXyz: d50, destinationWhiteXyz: d65 }).value.matrix;
      const p = [0.3, 0.5, 0.2] as const;
      const fp = forward.map((row) => row[0] * p[0] + row[1] * p[1] + row[2] * p[2]);
      const bp = back.map((row) => row[0] * fp[0]! + row[1] * fp[1]! + row[2] * fp[2]!);
      bp.forEach((v, i) => expect(v).toBeCloseTo(p[i]!, 12));
    }
    // Different white luminance: D = 1 preserves the source-white luminance.
    const scaled = calculateChromaticallyAdaptedXyz({ transform: "cat16", sourceWhiteXyz: { x: 95.047, y: 100, z: 108.883 }, destinationWhiteXyz: d50, xyz: { x: 95.047, y: 100, z: 108.883 } }).value.xyz;
    expect(scaled.x).toBeCloseTo(96.422, 10); expect(scaled.y).toBeCloseTo(100, 10);
    expect(resolveChromaticAdaptationConeMatrix("cat16")[0][0]).toBe(0.401288);
    expect(() => calculateChromaticAdaptationMatrix({ transform: "bogus" as "cat16", sourceWhiteXyz: d65, destinationWhiteXyz: d50 })).toThrow();
    expect(() => calculateChromaticAdaptationMatrix({ transform: "cat02", sourceWhiteXyz: d65, destinationWhiteXyz: d50, degreeOfAdaptation: 1.1 })).toThrow();
    expect(() => calculateChromaticAdaptationMatrix({ transform: "bradford", sourceWhiteXyz: { x: 0, y: 1, z: 0 }, destinationWhiteXyz: d50 })).toThrow();
  });
  it("computes the CIECAM02 degree of adaptation", () => {
    expect(calculateDegreeOfAdaptation({ adaptingLuminanceCdPerSquareMeter: 0, surround: "average" }).value.degreeOfAdaptation).toBeCloseTo(1 - Math.exp(-42 / 92) / 3.6, 14);
    expect(calculateDegreeOfAdaptation({ adaptingLuminanceCdPerSquareMeter: 1e4, surround: "dark" }).value.degreeOfAdaptation).toBeCloseTo(0.8, 10);
    expect(calculateDegreeOfAdaptation({ adaptingLuminanceCdPerSquareMeter: 100, surround: "dim" }).value.degreeOfAdaptation).toBeCloseTo(0.9 * (1 - Math.exp(-142 / 92) / 3.6), 14);
    expect(() => calculateDegreeOfAdaptation({ adaptingLuminanceCdPerSquareMeter: 100, surround: "bright" as "dim" })).toThrow();
  });
});

describe("CIELAB and colour difference", () => {
  // Sharma, Wu & Dalal (2005), Color Res. Appl. 30(1):21–30, Table 1 (selected pairs).
  const SHARMA: readonly (readonly [number, number, number, number, number, number, number])[] = [
    [50.0000, 2.6772, -79.7751, 50.0000, 0.0000, -82.7485, 2.0425],
    [50.0000, 3.1571, -77.2803, 50.0000, 0.0000, -82.7485, 2.8615],
    [50.0000, -1.3802, -84.2814, 50.0000, 0.0000, -82.7485, 1.0000],
    [50.0000, 0.0000, 0.0000, 50.0000, -1.0000, 2.0000, 2.3669],
    [50.0000, 2.4900, -0.0010, 50.0000, -2.4900, 0.0009, 7.1792],
    [50.0000, 2.4900, -0.0010, 50.0000, -2.4900, 0.0011, 7.2195],
    [50.0000, -0.0010, 2.4900, 50.0000, 0.0011, -2.4900, 4.7461],
    [50.0000, 2.5000, 0.0000, 73.0000, 25.0000, -18.0000, 27.1492],
    [50.0000, 2.5000, 0.0000, 56.0000, -27.0000, -3.0000, 31.9030],
    [60.2574, -34.0099, 36.2677, 60.4626, -34.1751, 39.4387, 1.2644],
    [22.7233, 20.0904, -46.6940, 23.0331, 14.9730, -42.5619, 2.0373],
    [90.9257, -0.5406, -0.9208, 88.6381, -0.8985, -0.7239, 1.5381],
    [2.0776, 0.0795, -1.1350, 0.9033, -0.0636, -0.5514, 0.9082]
  ];
  const lab = (l: number, a: number, b: number): CielabColor => ({ lStar: l, aStar: a, bStar: b });
  it("reproduces the published CIEDE2000 test pairs symmetrically", () => {
    for (const [l1, a1, b1, l2, a2, b2, expected] of SHARMA) {
      const forward = calculateColorDifference({ reference: lab(l1, a1, b1), sample: lab(l2, a2, b2), formula: "ciede2000" }).value.deltaE;
      const reverse = calculateColorDifference({ reference: lab(l2, a2, b2), sample: lab(l1, a1, b1), formula: "ciede2000" }).value.deltaE;
      expect(forward).toBeCloseTo(expected, 4);
      expect(reverse).toBeCloseTo(forward, 12);
    }
    const k = calculateColorDifference({ reference: lab(50, 0, 0), sample: lab(52, 0, 0), formula: "ciede2000", parametricFactors: { lightness: 2, chroma: 1, hue: 1 } }).value.deltaE;
    expect(k).toBeCloseTo(calculateColorDifference({ reference: lab(50, 0, 0), sample: lab(52, 0, 0), formula: "ciede2000" }).value.deltaE / 2, 12);
    expect(() => calculateColorDifference({ reference: lab(50, 0, 0), sample: lab(52, 0, 0), formula: "cie76", parametricFactors: { lightness: 1, chroma: 1, hue: 1 } })).toThrow();
    expect(() => calculateColorDifference({ reference: lab(50, 0, 0), sample: lab(52, 0, 0), formula: "x" as "cie76" })).toThrow();
  });
  it("computes ΔE*ab and the asymmetric CIE94 formulas", () => {
    expect(calculateColorDifference({ reference: lab(50, 0, 0), sample: lab(53, 4, 0), formula: "cie76" }).value.deltaE).toBe(5);
    // Pure chroma difference from reference C1 = 10: ΔE94 = ΔC / (1 + 0.045·10).
    expect(calculateColorDifference({ reference: lab(50, 10, 0), sample: lab(50, 12, 0), formula: "cie94-graphic-arts" }).value.deltaE).toBeCloseTo(2 / 1.45, 14);
    expect(calculateColorDifference({ reference: lab(50, 10, 0), sample: lab(50, 12, 0), formula: "cie94-textiles" }).value.deltaE).toBeCloseTo(2 / 1.48, 14);
    // Pure hue difference: ΔH = 2C sin(Δh/2) scaled by 1 + 0.015·C.
    const h = calculateColorDifference({ reference: lab(50, 10, 0), sample: lab(50, 10 * Math.cos(0.1), 10 * Math.sin(0.1)), formula: "cie94-graphic-arts" }).value.deltaE;
    expect(h).toBeCloseTo((20 * Math.sin(0.05)) / 1.15, 12);
    expect(calculateColorDifference({ reference: lab(40, 0, 0), sample: lab(44, 0, 0), formula: "cie94-textiles" }).value.deltaE).toBeCloseTo(2, 14);
  });
  it("converts XYZ ↔ CIELAB ↔ LCh exactly and continuously at the linear segment", () => {
    const white = { x: 0.95047, y: 1, z: 1.08883 };
    expect(calculateCielabFromXyz({ xyz: white, referenceWhiteXyz: white }).value).toEqual({ lStar: 100, aStar: 0, bStar: 0 });
    const eps = (6 / 29) ** 3;
    const lo = calculateCielabFromXyz({ xyz: { x: 0, y: eps * (1 - 1e-12), z: 0 }, referenceWhiteXyz: white }).value.lStar;
    const hi = calculateCielabFromXyz({ xyz: { x: 0, y: eps * (1 + 1e-12), z: 0 }, referenceWhiteXyz: white }).value.lStar;
    expect(Math.abs(hi - lo)).toBeLessThan(1e-9);
    expect(lo).toBeCloseTo(8, 9);
    for (const xyz of [{ x: 0.2, y: 0.3, z: 0.4 }, { x: 0.001, y: 0.002, z: 0.0005 }, { x: 1.2, y: 1.1, z: 0.3 }]) {
      const l = calculateCielabFromXyz({ xyz, referenceWhiteXyz: white }).value;
      const back = calculateXyzFromCielab({ lab: l, referenceWhiteXyz: white }).value;
      expect(back.x).toBeCloseTo(xyz.x, 13); expect(back.y).toBeCloseTo(xyz.y, 13); expect(back.z).toBeCloseTo(xyz.z, 13);
      const lch = calculateCielchFromCielab({ lab: l }).value;
      expect(lch.hueDegrees).toBeGreaterThanOrEqual(0); expect(lch.hueDegrees).toBeLessThan(360);
      const l2 = calculateCielabFromCielch({ lch }).value;
      expect(l2.aStar).toBeCloseTo(l.aStar, 12); expect(l2.bStar).toBeCloseTo(l.bStar, 12);
    }
    expect(() => calculateCielabFromXyz({ xyz: { x: 0.2, y: 0.3, z: 0.4 }, referenceWhiteXyz: { x: 0, y: 1, z: 1 } })).toThrow();
    expect(() => calculateCielabFromCielch({ lch: { lStar: 50, chromaStar: -1, hueDegrees: 0 } })).toThrow();
  });
});
