// SPDX-License-Identifier: Apache-2.0

/**
 * Illuminant spectra and correlated-colour-temperature (CCT) helpers.
 *
 * - Planckian radiator: exact Planck law (BIPM Mise en pratique for the kelvin, Absolute Primary
 *   Radiometry 2018, Eq. 1, free) with the exact SI defining constants (h, c, k; BIPM SI Brochure
 *   9th ed. 2019), so c₂ = hc/k = 1.438776877…e-2 m·K (NIST CODATA 2022). Wavelength is the vacuum
 *   wavelength.
 * - CIE standard illuminant A: Planck's law relative to 560 nm with the CIE's defining constants
 *   c₂ = 1.435e-2 m·K and T = 2848 K (also CIE 15:2018 Eq. 4.1 / ISO/CIE 11664-2, paid):
 *   S_A(λ) = 100 (560/λ)^5 (exp(1.435e7/(2848·560)) − 1)/(exp(1.435e7/(2848 λ)) − 1)
 *   (≈ 2856 K with the exact c₂). Computed from the formula, not a copied table; it reproduces the
 *   free CIE 1 nm table (DOI 10.25039/CIE.DS.8jsxjrsn) to its six significant digits.
 * - CIE daylight: the CIE daylight-locus chromaticity polynomial and the M₁/M₂ weights (CIE 15:2018,
 *   paid; no free text of the formulas found). With three-decimal rounding they reproduce the free
 *   CIE D55 and D65 tables. The S₀/S₁/S₂ basis is a CIE dataset (CC BY-SA 4.0, not bundled);
 *   callers supply it.
 * - Planckian locus: the chromaticity of a Planckian radiator at T, computed by integrating Planck's
 *   law against colour-matching functions. The default uses the engine's analytic CIE 1931 fit with
 *   1 nm nodes from 360 to 830 nm (so it inherits that fit's approximation); callers may select
 *   tabulated CMFs and their own nodes. Valid 1000–100000 K.
 * - CCT from chromaticity: McCamy (1992) cubic (approximation), or a nearest-point
 *   search on the Planckian locus in the CIE 1960 UCS (CCT and signed Duv as defined in Smet et al.,
 *   LEUKOS 2023, free archival copy from the US DOE; also CIE 15:2018). Duv sign: positive above the
 *   locus (toward green), negative below (toward magenta), following Ohno, "Calculation of CCT and Duv
 *   and Practical Conversion Formulae", CORM 2011 slides (free), slide 5; the engine documents and
 *   tests it.
 * @see docs/COLORIMETRY.md for equations, coordinate/unit conventions and limits.
 */

import { approximationResult, calculatedResult, type CalculationResult } from "../core/calculation-result.js";
import type { SpectralWavelengthRangeNanometers } from "../core/spectral.js";
import { InvalidScientificInputError } from "../core/validation.js";
import {
  COLORIMETRY_MODEL_VERSION,
  integrateSampledXyz,
  prepareColorMatchingFunctions,
  prepareColorimetricSpectrum,
  sampleColorimetricBasis,
  type ColorMatchingFunctionsSource,
  type ColorimetricQuadratureNode,
  type ColorimetricSpectralSample,
  type ColorimetricSpectrum
} from "./color-matching-functions.js";
import {
  chromaticityOfUv,
  chromaticityOfXyz,
  parseChromaticity,
  requireFiniteNumber,
  requirePositiveNumber,
  requireRecordValue,
  uvOfChromaticity,
  type Cie1960UvChromaticity,
  type CieXyChromaticity
} from "./colorimetry-math.js";
import { requireInputObject, requireInputKeys } from "../core/record-validation.js";

/** Exact SI defining constants (BIPM SI Brochure, 9th edition, 2019). */
export const PLANCK_CONSTANT_JOULE_SECONDS = 6.62607015e-34;
export const SPEED_OF_LIGHT_METERS_PER_SECOND = 299_792_458;
export const BOLTZMANN_CONSTANT_JOULES_PER_KELVIN = 1.380649e-23;
/** Second radiation constant c₂ = hc/k in m·K (derived from the exact constants). */
export const SECOND_RADIATION_CONSTANT_METER_KELVIN = (PLANCK_CONSTANT_JOULE_SECONDS * SPEED_OF_LIGHT_METERS_PER_SECOND) / BOLTZMANN_CONSTANT_JOULES_PER_KELVIN;
const FIRST_RADIATION_CONSTANT_RADIANCE = 2 * PLANCK_CONSTANT_JOULE_SECONDS * SPEED_OF_LIGHT_METERS_PER_SECOND ** 2;

/** Temperature range of the Planckian-locus models, K. */
export const PLANCKIAN_LOCUS_RANGE_KELVIN = Object.freeze({ minimum: 1000, maximum: 100000 });
/** CIE daylight-locus validity, K. */
export const CIE_DAYLIGHT_LOCUS_RANGE_KELVIN = Object.freeze({ minimum: 4000, maximum: 25000 });
/**
 * Engine limit: no CCT beyond |Duv| = 0.05, the range over which Smet et al. (2023, free) evaluate CCT
 * methods for nominally white light (CIE 15:2018 §9.5, paid, gives the same limit).
 */
export const MAX_CORRELATED_COLOR_TEMPERATURE_DUV = 0.05;

/**
 * Planck's law for blackbody spectral radiance per unit (vacuum) wavelength:
 * L(λ, T) = 2hc² / λ⁵ / (exp(hc/(λkT)) − 1). Returns W·m⁻²·sr⁻¹·nm⁻¹.
 */
export function calculatePlanckianSpectralRadiance(input: { temperatureKelvin: number; wavelengthNanometers: number }): number {
  requireInputKeys(input, "calculatePlanckianSpectralRadiance", ["temperatureKelvin", "wavelengthNanometers"]);
  const t = requirePositiveNumber(input.temperatureKelvin, "temperatureKelvin");
  const nm = requirePositiveNumber(input.wavelengthNanometers, "wavelengthNanometers");
  const lambda = nm * 1e-9;
  const exponent = SECOND_RADIATION_CONSTANT_METER_KELVIN / (lambda * t);
  // expm1 keeps precision in the Rayleigh–Jeans limit; overflow gives radiance 0.
  const radiancePerMeter = FIRST_RADIATION_CONSTANT_RADIANCE / lambda ** 5 / Math.expm1(exponent);
  return radiancePerMeter * 1e-9;
}

/** Planckian spectral radiance (W·m⁻²·sr⁻¹·nm⁻¹) as a function spectrum over the given range. */
export function createPlanckianSpectrum(input: { temperatureKelvin: number; wavelengthRangeNanometers: SpectralWavelengthRangeNanometers }): ColorimetricSpectrum {
  requireInputObject(input, "createPlanckianSpectrum input");
  const temperatureKelvin = requirePositiveNumber(input.temperatureKelvin, "temperatureKelvin");
  const range = requireRecordValue(input.wavelengthRangeNanometers, "wavelengthRangeNanometers");
  const spectrum: ColorimetricSpectrum = {
    kind: "function",
    wavelengthRangeNanometers: { minimum: range.minimum as number, maximum: range.maximum as number },
    evaluate: (wavelengthNanometers) => calculatePlanckianSpectralRadiance({ temperatureKelvin, wavelengthNanometers })
  };
  prepareColorimetricSpectrum(spectrum, "planckianSpectrum");
  return spectrum;
}

/** CIE illuminant A defining range (nm). */
export const CIE_ILLUMINANT_A_RANGE_NANOMETERS = Object.freeze({ minimum: 300, maximum: 830 });

/**
 * CIE standard illuminant A relative SPD from its defining formula (100 at 560 nm),
 * with c₂ = 1.435e-2 m·K and T = 2848 K as in the standard (≈ 2856 K with the
 * current c₂). Valid 300–830 nm.
 */
export function calculateCieIlluminantARelativeSpectralPower(wavelengthNanometers: number): number {
  const nm = requireFiniteNumber(wavelengthNanometers, "wavelengthNanometers");
  if (nm < CIE_ILLUMINANT_A_RANGE_NANOMETERS.minimum || nm > CIE_ILLUMINANT_A_RANGE_NANOMETERS.maximum) {
    throw new InvalidScientificInputError("CIE illuminant A is defined from 300 nm to 830 nm.");
  }
  const c = 1.435e7 / 2848; // nm·K / K
  return 100 * (560 / nm) ** 5 * (Math.expm1(c / 560) / Math.expm1(c / nm));
}

/** CIE illuminant A as a function spectrum over its defining range. */
export function createCieIlluminantASpectrum(): ColorimetricSpectrum {
  return { kind: "function", wavelengthRangeNanometers: { ...CIE_ILLUMINANT_A_RANGE_NANOMETERS }, evaluate: calculateCieIlluminantARelativeSpectralPower };
}

function requireTemperatureIn(t: unknown, range: { minimum: number; maximum: number }, what: string): number {
  const value = requirePositiveNumber(t, what);
  if (value < range.minimum || value > range.maximum) {
    throw new InvalidScientificInputError(what + " must lie in [" + range.minimum + ", " + range.maximum + "] K.");
  }
  return value;
}

function daylightChromaticity(t: number): CieXyChromaticity {
  const x = t <= 7000
    ? -4.6070e9 / t ** 3 + 2.9678e6 / t ** 2 + 0.09911e3 / t + 0.244063
    : -2.0064e9 / t ** 3 + 1.9018e6 / t ** 2 + 0.24748e3 / t + 0.237040;
  return { x, y: -3.000 * x * x + 2.870 * x - 0.275 };
}

export interface CieDaylightComponentWeights {
  correlatedColorTemperatureKelvin: number;
  chromaticity: CieXyChromaticity;
  m1: number;
  m2: number;
  coefficientRounding: "none" | "cie-three-decimals";
}

/**
 * CIE daylight-locus chromaticity and S₁/S₂ weights for a CCT in 4000–25000 K
 * (CIE 15:2018 §4.1.2, paid; no free text of the formulas found). M₁, M₂ rounded to three decimals
 * reproduce the free CIE D55 and D65 tables (DOI 10.25039/CIE.DS.qewfb3kp, 10.25039/CIE.DS.hjfjmt59)
 * to their rounding; `coefficientRounding` makes that rounding explicit.
 * The temperature is used as given: D65's nominal 6500 K corresponds to 6504 K here.
 */
export function calculateCieDaylightComponentWeights(input: {
  correlatedColorTemperatureKelvin: number;
  coefficientRounding: "none" | "cie-three-decimals";
}): CalculationResult<CieDaylightComponentWeights> {
  requireInputObject(input, "calculateCieDaylightComponentWeights input");
  const t = requireTemperatureIn(input.correlatedColorTemperatureKelvin, CIE_DAYLIGHT_LOCUS_RANGE_KELVIN, "correlatedColorTemperatureKelvin");
  if (input.coefficientRounding !== "none" && input.coefficientRounding !== "cie-three-decimals") {
    throw new InvalidScientificInputError("coefficientRounding must be \"none\" or \"cie-three-decimals\".");
  }
  const xy = daylightChromaticity(t);
  const m = 0.0241 + 0.2562 * xy.x - 0.7341 * xy.y;
  let m1 = (-1.3515 - 1.7703 * xy.x + 5.9114 * xy.y) / m;
  let m2 = (0.0300 - 31.4424 * xy.x + 30.0717 * xy.y) / m;
  if (input.coefficientRounding === "cie-three-decimals") {
    m1 = Math.round(m1 * 1000) / 1000;
    m2 = Math.round(m2 * 1000) / 1000;
  }
  return calculatedResult({ correlatedColorTemperatureKelvin: t, chromaticity: xy, m1, m2, coefficientRounding: input.coefficientRounding },
    "cie-daylight-locus", COLORIMETRY_MODEL_VERSION, ["CIE daylight-locus polynomial and M1/M2 weights, checked against the free CIE D55 and D65 datasets (no free formula text found); valid 4000–25000 K"]);
}

/** Caller-supplied CIE daylight basis S₀, S₁, S₂ (tabulated; CIE dataset not bundled). */
export interface CieDaylightBasis {
  s0: readonly ColorimetricSpectralSample[];
  s1: readonly ColorimetricSpectralSample[];
  s2: readonly ColorimetricSpectralSample[];
  /** Caller identity of the basis dataset (for example a DOI). */
  datasetId: string;
}

/**
 * Builds a CIE D-series relative SPD S(λ) = S₀ + M₁S₁ + M₂S₂ on the S₀ wavelengths from
 * caller-supplied basis tables (S₁, S₂ linearly interpolated; fail closed outside range).
 */
export function createCieDaylightSpectrum(input: {
  correlatedColorTemperatureKelvin: number;
  coefficientRounding: "none" | "cie-three-decimals";
  basis: CieDaylightBasis;
}): ColorimetricSpectrum {
  requireInputObject(input, "createCieDaylightSpectrum input");
  const weights = calculateCieDaylightComponentWeights(input).value;
  const basis = requireRecordValue(input.basis, "basis");
  if (typeof basis.datasetId !== "string" || basis.datasetId.trim().length === 0) {
    throw new InvalidScientificInputError("basis.datasetId must be a non-empty string.");
  }
  const s0 = prepareColorimetricSpectrum({ kind: "tabulated", samples: input.basis.s0 }, "basis.s0");
  const s1 = prepareColorimetricSpectrum({ kind: "tabulated", samples: input.basis.s1 }, "basis.s1");
  const s2 = prepareColorimetricSpectrum({ kind: "tabulated", samples: input.basis.s2 }, "basis.s2");
  const samples = input.basis.s0.map((sample) => {
    const w = sample.wavelengthNanometers;
    return { wavelengthNanometers: w, value: s0.evaluate(w) + weights.m1 * s1.evaluate(w) + weights.m2 * s2.evaluate(w) };
  });
  return { kind: "tabulated", samples };
}

/** Selects how the Planckian locus is evaluated. */
export type PlanckianLocusModel =
  | {
      /** Planck's law integrated against the engine's analytic CIE 1931 CMFs, 1 nm nodes 360–830 nm (the default). */
      kind: "planck-analytic-cmf";
    }
  | {
      kind: "planck-integration";
      colorMatchingFunctions: ColorMatchingFunctionsSource;
      quadratureNodes: readonly ColorimetricQuadratureNode[];
    };

/** Number of intervals of the coarse reciprocal-temperature scan that brackets the CCT search. */
const CCT_SCAN_STEPS = 200;

interface PreparedLocus {
  range: { minimum: number; maximum: number };
  approximation: boolean;
  model: string;
  chromaticity(t: number): CieXyChromaticity;
  /** CIE 1960 uv at the coarse scan temperatures; computed once per prepared locus. */
  scan(): readonly Cie1960UvChromaticity[];
}

/**
 * Prepares a Planck-integration locus: the CMF values and 1/λ⁵ factors are sampled once, so each
 * temperature costs one exponential per node. Planck's constant factor 2hc² cancels in chromaticity.
 */
function preparePlanckIntegrationLocus(cmfSource: ColorMatchingFunctionsSource, quadratureNodes: readonly ColorimetricQuadratureNode[], model: string): PreparedLocus {
  const cmf = prepareColorMatchingFunctions(cmfSource);
  const unit = prepareColorimetricSpectrum({ kind: "function", wavelengthRangeNanometers: cmf.wavelengthRangeNanometers, evaluate: () => 1 });
  const basis = sampleColorimetricBasis(quadratureNodes, unit, cmf);
  const n = basis.nodes.length;
  const exponentPerKelvin = new Float64Array(n), inverseFifth = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const lambda = basis.nodes[i]!.wavelengthNanometers * 1e-9;
    exponentPerKelvin[i] = SECOND_RADIATION_CONSTANT_METER_KELVIN / lambda;
    inverseFifth[i] = 1 / lambda ** 5;
  }
  const factor = new Float64Array(n);
  const range = PLANCKIAN_LOCUS_RANGE_KELVIN;
  let scanCache: readonly Cie1960UvChromaticity[] | undefined;
  const locus: PreparedLocus = {
    range,
    approximation: cmf.scientificStatus === "approximation",
    model,
    chromaticity(t: number): CieXyChromaticity {
      // expm1 keeps precision at long wavelengths; overflow at short ones gives 0, as in Planck's law.
      for (let i = 0; i < n; i++) factor[i] = inverseFifth[i]! / Math.expm1(exponentPerKelvin[i]! / t);
      return chromaticityOfXyz(integrateSampledXyz(basis, factor));
    },
    scan(): readonly Cie1960UvChromaticity[] {
      if (scanCache === undefined) {
        const lo = 1e6 / range.maximum, hi = 1e6 / range.minimum;
        scanCache = Array.from({ length: CCT_SCAN_STEPS + 1 }, (_, i) => uvOfChromaticity(locus.chromaticity(1e6 / (lo + ((hi - lo) * i) / CCT_SCAN_STEPS))));
      }
      return scanCache;
    }
  };
  return locus;
}

/** 1 nm nodes at 360, 361, …, 830 nm with Δλ = 1 nm (the CIE 15 summation convention). */
const DEFAULT_LOCUS_NODES: readonly ColorimetricQuadratureNode[] = Object.freeze(
  Array.from({ length: 471 }, (_, i) => Object.freeze({ wavelengthNanometers: 360 + i, wavelengthMeasureNanometers: 1 }))
);
let defaultLocus: PreparedLocus | undefined;

/** The default locus, prepared on first use and shared (its scan cache is computed once). */
function analyticCmfLocus(): PreparedLocus {
  defaultLocus ??= preparePlanckIntegrationLocus({ kind: "analytic-cie-1931-multi-lobe-fit" }, DEFAULT_LOCUS_NODES, "planck-analytic-cmf");
  return defaultLocus;
}

/**
 * Planckian-locus chromaticity at T (1000–100000 K): Planck's law integrated against the engine's
 * analytic CIE 1931 CMFs with 1 nm nodes from 360 to 830 nm. An approximation, because the CMFs are
 * an analytic fit; with tabulated CMFs use {@link calculatePlanckianChromaticity}.
 */
export function estimatePlanckianLocusChromaticity(input: { temperatureKelvin: number }): CalculationResult<CieXyChromaticity> {
  requireInputKeys(input, "estimatePlanckianLocusChromaticity", ["temperatureKelvin"]);
  const t = requireTemperatureIn(input.temperatureKelvin, PLANCKIAN_LOCUS_RANGE_KELVIN, "temperatureKelvin");
  return approximationResult(analyticCmfLocus().chromaticity(t), "planckian-locus-planck-analytic-cmf", COLORIMETRY_MODEL_VERSION,
    ["Planck's law integrated against the engine's analytic CIE 1931 CMF fit, 1 nm nodes 360–830 nm; valid 1000–100000 K"]);
}

function prepareLocus(model: PlanckianLocusModel): PreparedLocus {
  const record = requireRecordValue(model, "locus");
  if (record.kind === "planck-analytic-cmf") return analyticCmfLocus();
  if (record.kind !== "planck-integration") throw new InvalidScientificInputError("locus.kind is not supported.");
  const m = model as Extract<PlanckianLocusModel, { kind: "planck-integration" }>;
  const cmf = prepareColorMatchingFunctions(m.colorMatchingFunctions);
  return preparePlanckIntegrationLocus(m.colorMatchingFunctions, m.quadratureNodes, "planck-integration-" + cmf.sourceKind);
}

/** Planckian chromaticity at T using either locus model. */
export function calculatePlanckianChromaticity(input: { temperatureKelvin: number; locus: PlanckianLocusModel }): CalculationResult<CieXyChromaticity> {
  requireInputObject(input, "calculatePlanckianChromaticity input");
  const locus = prepareLocus(input.locus);
  const t = requireTemperatureIn(input.temperatureKelvin, locus.range, "temperatureKelvin");
  const value = locus.chromaticity(t);
  const assumptions = ["Planckian locus model: " + locus.model];
  return locus.approximation
    ? approximationResult(value, "planckian-chromaticity", COLORIMETRY_MODEL_VERSION, assumptions)
    : calculatedResult(value, "planckian-chromaticity", COLORIMETRY_MODEL_VERSION, assumptions);
}

/**
 * McCamy (1992) cubic estimate of CCT from CIE 1931 xy:
 * n = (x − 0.3320)/(0.1858 − y), CCT = 449 n³ + 3525 n² + 6823.3 n + 5520.33.
 * An approximation that carries no Duv. Measured for this engine (October 17, 2026) on points of a
 * Planckian locus integrated from the CIE 1931 2° 1 nm table (360–830 nm, exact c₂): it deviates by up
 * to 10 K over 2856–6504 K (largest near 3500 K), 19 K at 2000 K, 17 K at 8000 K, 118 K at 10000 K
 * and 442 K at 12500 K. See docs/COLORIMETRY.md.
 */
export function estimateCorrelatedColorTemperatureMcCamy(input: { chromaticity: CieXyChromaticity }): CalculationResult<{ correlatedColorTemperatureKelvin: number }> {
  requireInputObject(input, "estimateCorrelatedColorTemperatureMcCamy input");
  const xy = parseChromaticity(input.chromaticity, "chromaticity");
  const n = (xy.x - 0.3320) / (0.1858 - xy.y);
  const cct = 449 * n ** 3 + 3525 * n ** 2 + 6823.3 * n + 5520.33;
  if (!Number.isFinite(cct) || cct <= 0) throw new InvalidScientificInputError("Chromaticity is outside the McCamy approximation domain.");
  return approximationResult({ correlatedColorTemperatureKelvin: cct }, "cct-mccamy-1992", COLORIMETRY_MODEL_VERSION,
    ["McCamy (1992) cubic; intended for chromaticities near the Planckian locus, about 2000–12500 K"]);
}

function locusUv(locus: PreparedLocus, t: number): Cie1960UvChromaticity {
  return uvOfChromaticity(locus.chromaticity(t));
}

/** Unit tangent (direction of increasing T) and the "above-locus" unit normal at T. */
function locusFrame(locus: PreparedLocus, t: number): { point: Cie1960UvChromaticity; normal: Cie1960UvChromaticity; tangent: Cie1960UvChromaticity } {
  const h = t * 1e-4;
  const lo = Math.max(locus.range.minimum, t - h), hi = Math.min(locus.range.maximum, t + h);
  const a = locusUv(locus, lo), b = locusUv(locus, hi);
  const du = b.u - a.u, dv = b.v - a.v, len = Math.hypot(du, dv);
  const tangent = { u: du / len, v: dv / len };
  // Rotating the increasing-T tangent (u decreases with T) by −90° points toward larger v (above).
  return { point: locusUv(locus, t), tangent, normal: { u: tangent.v, v: -tangent.u } };
}

export interface CorrelatedColorTemperatureResult {
  correlatedColorTemperatureKelvin: number;
  /** Signed CIE 1960 uv distance from the locus; positive above (greenish), negative below (the engine's convention). */
  duv: number;
}

/**
 * CCT and Duv of a chromaticity as the nearest point of the Planckian locus in the CIE
 * 1960 UCS (Smet et al. 2023; also CIE 15:2018). Uses a golden-section search in reciprocal
 * temperature (mired). Throws (fails closed) when the nearest point is at the model's range limit,
 * or when |Duv| > 0.05 (see {@link MAX_CORRELATED_COLOR_TEMPERATURE_DUV}). Duv is positive above the
 * locus (toward green) and negative below it, the engine's documented sign convention.
 */
export function calculateCorrelatedColorTemperature(input: { chromaticity: CieXyChromaticity; locus: PlanckianLocusModel }): CalculationResult<CorrelatedColorTemperatureResult> {
  requireInputObject(input, "calculateCorrelatedColorTemperature input");
  const xy = parseChromaticity(input.chromaticity, "chromaticity");
  const locus = prepareLocus(input.locus);
  const target = uvOfChromaticity(xy);
  const distance2 = (mired: number): number => {
    const p = locusUv(locus, 1e6 / mired);
    return (p.u - target.u) ** 2 + (p.v - target.v) ** 2;
  };
  // Coarse scan (cached per locus) to bracket the global minimum, then golden-section refinement.
  let lo = 1e6 / locus.range.maximum, hi = 1e6 / locus.range.minimum;
  const steps = CCT_SCAN_STEPS;
  const scan = locus.scan();
  let best = 0, bestValue = Infinity;
  for (let i = 0; i <= steps; i++) {
    const p = scan[i]!;
    const v = (p.u - target.u) ** 2 + (p.v - target.v) ** 2;
    if (v < bestValue) { bestValue = v; best = i; }
  }
  const step = (hi - lo) / steps;
  const atEdge = best === 0 || best === steps;
  const a0 = lo + step * Math.max(0, best - 1), b0 = lo + step * Math.min(steps, best + 1);
  lo = a0; hi = b0;
  const g = (Math.sqrt(5) - 1) / 2;
  let c = hi - g * (hi - lo), d = lo + g * (hi - lo), fc = distance2(c), fd = distance2(d);
  for (let i = 0; i < 100 && hi - lo > 1e-10; i++) {
    if (fc < fd) { hi = d; d = c; fd = fc; c = hi - g * (hi - lo); fc = distance2(c); }
    else { lo = c; c = d; fc = fd; d = lo + g * (hi - lo); fd = distance2(d); }
  }
  const mired = (lo + hi) / 2;
  const t = 1e6 / mired;
  if (atEdge) throw new InvalidScientificInputError("Chromaticity's nearest Planckian point lies outside the locus model range.");
  const frame = locusFrame(locus, t);
  const du = target.u - frame.point.u, dv = target.v - frame.point.v;
  const duv = du * frame.normal.u + dv * frame.normal.v;
  if (Math.abs(duv) > MAX_CORRELATED_COLOR_TEMPERATURE_DUV) {
    throw new InvalidScientificInputError("|Duv| exceeds 0.05; no CCT is reported this far from the Planckian locus (the range evaluated by Smet et al. 2023).");
  }
  const value = { correlatedColorTemperatureKelvin: t, duv };
  const assumptions = ["Nearest point on the Planckian locus in CIE 1960 uv; locus model: " + locus.model, "Duv sign: positive above the locus (toward green), negative below (engine convention)"];
  return locus.approximation
    ? approximationResult(value, "cct-duv-locus-search", COLORIMETRY_MODEL_VERSION, assumptions)
    : calculatedResult(value, "cct-duv-locus-search", COLORIMETRY_MODEL_VERSION, assumptions);
}

/** Locus whose temperature defines a white for CCT + Duv. */
export type WhiteLocus = "planckian" | "cie-daylight";

/**
 * Chromaticity for CCT and Duv: the locus point (Planckian or CIE daylight) offset by
 * Duv along the unit normal of the Planckian locus at the same temperature in the CIE
 * 1960 UCS. For `cie-daylight`, Duv = 0 returns the daylight-locus point itself.
 */
export function calculateChromaticityFromCorrelatedColorTemperature(input: {
  correlatedColorTemperatureKelvin: number;
  duv: number;
  whiteLocus: WhiteLocus;
  locus: PlanckianLocusModel;
}): CalculationResult<CieXyChromaticity> {
  requireInputObject(input, "calculateChromaticityFromCorrelatedColorTemperature input");
  const locus = prepareLocus(input.locus);
  const duv = requireFiniteNumber(input.duv, "duv");
  if (Math.abs(duv) > MAX_CORRELATED_COLOR_TEMPERATURE_DUV) throw new InvalidScientificInputError("|duv| must not exceed 0.05.");
  if (input.whiteLocus !== "planckian" && input.whiteLocus !== "cie-daylight") throw new InvalidScientificInputError("whiteLocus is not supported.");
  const range = input.whiteLocus === "cie-daylight"
    ? { minimum: Math.max(locus.range.minimum, CIE_DAYLIGHT_LOCUS_RANGE_KELVIN.minimum), maximum: Math.min(locus.range.maximum, CIE_DAYLIGHT_LOCUS_RANGE_KELVIN.maximum) }
    : locus.range;
  const t = requireTemperatureIn(input.correlatedColorTemperatureKelvin, range, "correlatedColorTemperatureKelvin");
  const frame = locusFrame(locus, t);
  const base = input.whiteLocus === "cie-daylight" ? uvOfChromaticity(daylightChromaticity(t)) : frame.point;
  const value = chromaticityOfUv({ u: base.u + duv * frame.normal.u, v: base.v + duv * frame.normal.v });
  const assumptions = ["White locus: " + input.whiteLocus + "; Duv offset along the Planckian-locus normal (" + locus.model + ") in CIE 1960 uv"];
  const exactDaylightPoint = input.whiteLocus === "cie-daylight" && duv === 0;
  return locus.approximation && !exactDaylightPoint
    ? approximationResult(value, "chromaticity-from-cct-duv", COLORIMETRY_MODEL_VERSION, assumptions)
    : calculatedResult(value, "chromaticity-from-cct-duv", COLORIMETRY_MODEL_VERSION, assumptions);
}
