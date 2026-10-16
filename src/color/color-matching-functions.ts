// SPDX-License-Identifier: Apache-2.0

/**
 * Module boundary and integration notes.
 * CIE colour-matching functions (CMFs) and spectrum → CIE XYZ integration.
 *
 * Two CMF sources are supported:
 * 1. The multi-lobe piecewise-Gaussian analytic fit of the CIE 1931 2° observer by
 *    Wyman, Sloan & Shirley (2013), "Simple Analytic Approximations to the CIE XYZ
 *    Color Matching Functions", JCGT 2(2):1–11, Eq. 4 and Table 1. Independently
 *    implemented from the published equation; it is an APPROXIMATION. The paper's
 *    Table 2 reports, relative to the 1 nm CIE 1931 tables, maximum squared errors of
 *    2.0e-4 (x̄), 6.4e-5 (ȳ), 4.9e-4 (z̄) (maximum absolute error ≈ 0.014, 0.008,
 *    0.022) and mean squared errors of 3.1e-5, 7.1e-6, 1.6e-5.
 * 2. Caller-supplied tabulated CMFs (for example the official CIE datasets, which the
 *    CIE distributes under CC BY-SA 4.0 and which are therefore NOT bundled with this
 *    Apache-2.0 package). Tables are linearly interpolated and fail closed outside their
 *    declared range (no extrapolation).
 *
 * Integration uses explicit wavelength quadrature nodes `{wavelengthNanometers,
 * wavelengthMeasureNanometers}`; nodes from `calculateSensorSpectralQuadrature()` are
 * structurally compatible. X = k Σ S(λᵢ) R(λᵢ) x̄(λᵢ) Δλᵢ (CIE 15:2018 §7.1).
 * @see docs/COLORIMETRY.md for equations, coordinate/unit conventions and limits.
 */

import { approximationResult, calculatedResult, type CalculationResult } from "../core/calculation-result.js";
import type { SpectralWavelengthRangeNanometers, SpectralWavelengthSample } from "../core/spectral.js";
import { InvalidScientificInputError } from "../core/validation.js";
import {
  chromaticityOfXyz,
  requireFiniteNumber,
  requireFiniteResult,
  requirePositiveNumber,
  requireRecordValue,
  type CieXyChromaticity,
  type CieXyzTristimulus
} from "./colorimetry-math.js";
import { requireInputObject } from "../core/record-validation.js";

export const COLORIMETRY_MODEL_VERSION = "1.0.0" as const;
/** Upper bound on quadrature nodes per integration call. */
export const MAX_COLORIMETRIC_QUADRATURE_NODES = 100_000;
/** Upper bound on samples in a caller-supplied tabulated spectrum or CMF table. */
export const MAX_COLORIMETRIC_TABLE_SAMPLES = 100_000;

/** Wavelength domain over which the analytic CIE 1931 fit is accepted (CIE table domain). */
export const WYMAN_2013_CMF_DOMAIN_NANOMETERS: Readonly<SpectralWavelengthRangeNanometers> = Object.freeze({ minimum: 360, maximum: 830 });

/** One wavelength quadrature node; d-lambda is in nanometres. */
export interface ColorimetricQuadratureNode {
  wavelengthNanometers: number;
  wavelengthMeasureNanometers: number;
}

/** One tabulated spectral value at one wavelength. */
export interface ColorimetricSpectralSample extends SpectralWavelengthSample {
  value: number;
}

/**
 * A spectral distribution or spectral factor (reflectance, transmittance, relative SPD,
 * sensitivity). `tabulated` is the JSON path: strictly increasing wavelengths, linear
 * interpolation, fail-closed outside the table. `function` is an in-process evaluator
 * (for example a Planckian SPD) that must be finite on its declared range.
 */
export type ColorimetricSpectrum =
  | { kind: "tabulated"; samples: readonly ColorimetricSpectralSample[] }
  | { kind: "function"; wavelengthRangeNanometers: SpectralWavelengthRangeNanometers; evaluate: (wavelengthNanometers: number) => number };

/** One tabulated colour-matching sample. */
export interface TabulatedColorMatchingSample extends SpectralWavelengthSample {
  xBar: number;
  yBar: number;
  zBar: number;
}

export type ColorimetricObserver = "cie-1931-2-degree" | "cie-1964-10-degree" | "caller-defined";

/** Selects a colour-matching-function source. */
export type ColorMatchingFunctionsSource =
  | { kind: "wyman-2013-cie-1931-multi-lobe-fit" }
  | {
      kind: "tabulated";
      observer: ColorimetricObserver;
      /** Caller identity for the dataset (for example a DOI); recorded in provenance. */
      datasetId: string;
      samples: readonly TabulatedColorMatchingSample[];
    };

/** Validated, reusable colour-matching functions. */
export interface PreparedColorMatchingFunctions {
  observer: ColorimetricObserver;
  sourceKind: ColorMatchingFunctionsSource["kind"];
  datasetId: string;
  scientificStatus: "approximation" | "caller-tabulated";
  wavelengthRangeNanometers: SpectralWavelengthRangeNanometers;
  /** x̄, ȳ, z̄ at one wavelength in nm; throws outside the declared range. */
  evaluate(wavelengthNanometers: number): CieXyzTristimulus;
}

// Wyman, Sloan & Shirley (2013) Table 1: α (amplitude), β (centre, nm), γ / δ
// (inverse widths, 1/nm, used left / right of β). Factual model coefficients.
type Lobe = readonly [alpha: number, beta: number, gamma: number, delta: number];
const X_LOBES: readonly Lobe[] = [[0.362, 442.0, 0.0624, 0.0374], [1.056, 599.8, 0.0264, 0.0323], [-0.065, 501.1, 0.0490, 0.0382]];
const Y_LOBES: readonly Lobe[] = [[0.821, 568.8, 0.0213, 0.0247], [0.286, 530.9, 0.0613, 0.0322]];
const Z_LOBES: readonly Lobe[] = [[1.217, 437.0, 0.0845, 0.0278], [0.681, 459.0, 0.0385, 0.0725]];

function lobes(wavelength: number, set: readonly Lobe[]): number {
  let sum = 0;
  for (const [alpha, beta, gamma, delta] of set) {
    const t = (wavelength - beta) * (wavelength < beta ? gamma : delta);
    sum += alpha * Math.exp(-0.5 * t * t);
  }
  return sum;
}

function requireWavelengthIn(wavelength: number, range: SpectralWavelengthRangeNanometers, what: string): void {
  if (!Number.isFinite(wavelength) || wavelength < range.minimum || wavelength > range.maximum) {
    throw new InvalidScientificInputError(what + " is outside its declared wavelength range [" + range.minimum + ", " + range.maximum + "] nm.");
  }
}

/**
 * Evaluates the Wyman–Sloan–Shirley (2013) multi-lobe analytic approximation of the CIE
 * 1931 2° colour-matching functions at one wavelength (nm, standard-air wavelength as in
 * the CIE tables). Approximation: see the module notes for the published error.
 */
export function estimateCie1931ColorMatchingFunctions(wavelengthNanometers: number): CieXyzTristimulus {
  requireWavelengthIn(wavelengthNanometers, WYMAN_2013_CMF_DOMAIN_NANOMETERS, "Analytic CIE 1931 CMF wavelength");
  return { x: lobes(wavelengthNanometers, X_LOBES), y: lobes(wavelengthNanometers, Y_LOBES), z: lobes(wavelengthNanometers, Z_LOBES) };
}

function parseIncreasingSamples<T extends SpectralWavelengthSample>(
  samples: unknown,
  path: string,
  parseValue: (sample: Record<string, unknown>, samplePath: string) => T
): T[] {
  if (!Array.isArray(samples) || samples.length < 2 || samples.length > MAX_COLORIMETRIC_TABLE_SAMPLES) {
    throw new InvalidScientificInputError(path + " must contain between 2 and " + MAX_COLORIMETRIC_TABLE_SAMPLES + " samples.");
  }
  const parsed: T[] = [];
  let previous = -Infinity;
  samples.forEach((raw: unknown, i) => {
    const samplePath = path + "[" + i + "]";
    const record = requireRecordValue(raw, samplePath);
    const wavelength = requirePositiveNumber(record.wavelengthNanometers, samplePath + ".wavelengthNanometers");
    if (!(wavelength > previous)) throw new InvalidScientificInputError(path + " wavelengths must be strictly increasing.");
    previous = wavelength;
    parsed.push(parseValue(record, samplePath));
  });
  return parsed;
}

/** Finds the bracketing interval for linear interpolation (binary search). */
function bracket(samples: readonly SpectralWavelengthSample[], wavelength: number): [number, number] {
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid]!.wavelengthNanometers <= wavelength) lo = mid;
    else hi = mid;
  }
  const a = samples[lo]!.wavelengthNanometers;
  const b = samples[hi]!.wavelengthNanometers;
  return [lo, (wavelength - a) / (b - a)];
}

/**
 * Validates a colour-matching-function source once for repeated evaluation.
 * Tabulated values may be signed only for `caller-defined` observers; CIE observers
 * require non-negative values.
 */
export function prepareColorMatchingFunctions(source: ColorMatchingFunctionsSource): PreparedColorMatchingFunctions {
  const record = requireRecordValue(source, "colorMatchingFunctions");
  if (record.kind === "wyman-2013-cie-1931-multi-lobe-fit") {
    return Object.freeze({
      observer: "cie-1931-2-degree" as const,
      sourceKind: "wyman-2013-cie-1931-multi-lobe-fit" as const,
      datasetId: "wyman-sloan-shirley-2013-jcgt-2-2-eq4",
      scientificStatus: "approximation" as const,
      wavelengthRangeNanometers: { ...WYMAN_2013_CMF_DOMAIN_NANOMETERS },
      evaluate: estimateCie1931ColorMatchingFunctions
    });
  }
  if (record.kind !== "tabulated") throw new InvalidScientificInputError("colorMatchingFunctions.kind is not supported.");
  const observer = record.observer;
  if (observer !== "cie-1931-2-degree" && observer !== "cie-1964-10-degree" && observer !== "caller-defined") {
    throw new InvalidScientificInputError("colorMatchingFunctions.observer is not supported.");
  }
  if (typeof record.datasetId !== "string" || record.datasetId.trim().length === 0) {
    throw new InvalidScientificInputError("colorMatchingFunctions.datasetId must be a non-empty string.");
  }
  const signed = observer === "caller-defined";
  const samples = parseIncreasingSamples<TabulatedColorMatchingSample>(record.samples, "colorMatchingFunctions.samples", (s, p) => {
    const v = (key: "xBar" | "yBar" | "zBar"): number => {
      const n = requireFiniteNumber(s[key], p + "." + key);
      if (!signed && n < 0) throw new InvalidScientificInputError(p + "." + key + " must not be negative for a CIE observer.");
      return n;
    };
    return { wavelengthNanometers: s.wavelengthNanometers as number, xBar: v("xBar"), yBar: v("yBar"), zBar: v("zBar") };
  });
  const range = { minimum: samples[0]!.wavelengthNanometers, maximum: samples[samples.length - 1]!.wavelengthNanometers };
  return Object.freeze({
    observer,
    sourceKind: "tabulated" as const,
    datasetId: record.datasetId.trim(),
    scientificStatus: "caller-tabulated" as const,
    wavelengthRangeNanometers: range,
    evaluate(wavelengthNanometers: number): CieXyzTristimulus {
      requireWavelengthIn(wavelengthNanometers, range, "Tabulated CMF wavelength");
      const [i, t] = bracket(samples, wavelengthNanometers);
      const a = samples[i]!;
      const b = samples[Math.min(i + 1, samples.length - 1)]!;
      return { x: a.xBar + (b.xBar - a.xBar) * t, y: a.yBar + (b.yBar - a.yBar) * t, z: a.zBar + (b.zBar - a.zBar) * t };
    }
  });
}

/** A validated spectrum ready for evaluation. */
export interface PreparedColorimetricSpectrum {
  wavelengthRangeNanometers: SpectralWavelengthRangeNanometers;
  evaluate(wavelengthNanometers: number): number;
}

/** Validates a tabulated or functional spectrum (values must be finite; sign is not restricted). */
export function prepareColorimetricSpectrum(spectrum: ColorimetricSpectrum, path = "spectrum"): PreparedColorimetricSpectrum {
  const record = requireRecordValue(spectrum, path);
  if (record.kind === "function") {
    const range = requireRecordValue(record.wavelengthRangeNanometers, path + ".wavelengthRangeNanometers");
    const minimum = requirePositiveNumber(range.minimum, path + ".wavelengthRangeNanometers.minimum");
    const maximum = requirePositiveNumber(range.maximum, path + ".wavelengthRangeNanometers.maximum");
    if (!(minimum < maximum)) throw new InvalidScientificInputError(path + ".wavelengthRangeNanometers.minimum must be less than maximum.");
    if (typeof record.evaluate !== "function") throw new InvalidScientificInputError(path + ".evaluate must be a function.");
    const evaluate = record.evaluate as (w: number) => number;
    const declared = { minimum, maximum };
    return {
      wavelengthRangeNanometers: declared,
      evaluate(w: number): number {
        requireWavelengthIn(w, declared, path);
        const v = evaluate(w);
        if (typeof v !== "number" || !Number.isFinite(v)) throw new InvalidScientificInputError(path + " evaluated to a non-finite value.");
        return v;
      }
    };
  }
  if (record.kind !== "tabulated") throw new InvalidScientificInputError(path + ".kind is not supported.");
  const samples = parseIncreasingSamples<ColorimetricSpectralSample>(record.samples, path + ".samples", (s, p) => ({
    wavelengthNanometers: s.wavelengthNanometers as number,
    value: requireFiniteNumber(s.value, p + ".value")
  }));
  const range = { minimum: samples[0]!.wavelengthNanometers, maximum: samples[samples.length - 1]!.wavelengthNanometers };
  return {
    wavelengthRangeNanometers: range,
    evaluate(w: number): number {
      requireWavelengthIn(w, range, path);
      const [i, t] = bracket(samples, w);
      const a = samples[i]!.value;
      const b = samples[Math.min(i + 1, samples.length - 1)]!.value;
      return a + (b - a) * t;
    }
  };
}

export interface CreateColorimetricMidpointQuadratureInput {
  wavelengthRangeNanometers: SpectralWavelengthRangeNanometers;
  /** Hard upper bound on each midpoint subinterval width, nm. */
  maximumSubintervalWidthNanometers: number;
}

/**
 * Builds deterministic uniform midpoint wavelength nodes covering the range. Every
 * node carries its d-lambda measure in nm; the measures sum to the range width.
 */
export function createColorimetricMidpointQuadrature(input: CreateColorimetricMidpointQuadratureInput): ColorimetricQuadratureNode[] {
  requireInputObject(input, "createColorimetricMidpointQuadrature input");
  const range = requireRecordValue(input.wavelengthRangeNanometers, "wavelengthRangeNanometers");
  const minimum = requirePositiveNumber(range.minimum, "wavelengthRangeNanometers.minimum");
  const maximum = requirePositiveNumber(range.maximum, "wavelengthRangeNanometers.maximum");
  if (!(minimum < maximum)) throw new InvalidScientificInputError("wavelengthRangeNanometers.minimum must be less than maximum.");
  const width = requirePositiveNumber(input.maximumSubintervalWidthNanometers, "maximumSubintervalWidthNanometers");
  const count = Math.ceil((maximum - minimum) / width - 1e-9);
  if (count > MAX_COLORIMETRIC_QUADRATURE_NODES) throw new InvalidScientificInputError("Quadrature would exceed " + MAX_COLORIMETRIC_QUADRATURE_NODES + " nodes.");
  const step = (maximum - minimum) / count;
  const nodes: ColorimetricQuadratureNode[] = [];
  for (let i = 0; i < count; i++) nodes.push({ wavelengthNanometers: minimum + (i + 0.5) * step, wavelengthMeasureNanometers: step });
  return nodes;
}

/** Validates explicit quadrature nodes (positive wavelengths and positive measures). */
export function parseColorimetricQuadratureNodes(nodes: unknown): ColorimetricQuadratureNode[] {
  if (!Array.isArray(nodes) || nodes.length === 0 || nodes.length > MAX_COLORIMETRIC_QUADRATURE_NODES) {
    throw new InvalidScientificInputError("quadratureNodes must contain between 1 and " + MAX_COLORIMETRIC_QUADRATURE_NODES + " nodes.");
  }
  return nodes.map((raw: unknown, i) => {
    const r = requireRecordValue(raw, "quadratureNodes[" + i + "]");
    return {
      wavelengthNanometers: requirePositiveNumber(r.wavelengthNanometers, "quadratureNodes[" + i + "].wavelengthNanometers"),
      wavelengthMeasureNanometers: requirePositiveNumber(r.wavelengthMeasureNanometers, "quadratureNodes[" + i + "].wavelengthMeasureNanometers")
    };
  });
}

/**
 * Normalization of integrated tristimulus values.
 * - `white-luminance-one`: k = 1 / Σ S ȳ Δλ, so the perfect reflecting diffuser (or the
 *   illuminant itself) has Y = 1 (CIE 15:2018 relative colorimetry with Y scaled to 1).
 * - `scale`: X = factor · Σ …; for example 683.002 lm/W with spectral radiance in
 *   W·m⁻²·sr⁻¹·nm⁻¹ yields luminance in cd/m² (the caller owns the unit semantics).
 */
export type TristimulusNormalization = { kind: "white-luminance-one" } | { kind: "scale"; factor: number };

export interface IntegrateSpectrumToXyzInput {
  quadratureNodes: readonly ColorimetricQuadratureNode[];
  /** Illuminant SPD or emitted spectral radiance S(λ). */
  spectralDistribution: ColorimetricSpectrum;
  /** Optional spectral reflectance/transmittance factor R(λ); omitted means R = 1. */
  spectralFactor?: ColorimetricSpectrum;
  colorMatchingFunctions: ColorMatchingFunctionsSource;
  normalization: TristimulusNormalization;
}

export interface IntegratedSpectrumXyz {
  xyz: CieXyzTristimulus;
  /** Tristimulus values of S(λ) alone under the same normalization (the adopted white). */
  whiteXyz: CieXyzTristimulus;
  chromaticity: CieXyChromaticity | null;
  normalizationFactor: number;
  observer: ColorimetricObserver;
  nodeCount: number;
}

/** Internal: per-node weights S·Δλ and CMF values; reused by matrix fitting. */
export interface SampledColorimetricBasis {
  nodes: readonly ColorimetricQuadratureNode[];
  weights: Float64Array;
  xBar: Float64Array;
  yBar: Float64Array;
  zBar: Float64Array;
  cmf: PreparedColorMatchingFunctions;
}

export function sampleColorimetricBasis(
  quadratureNodes: readonly ColorimetricQuadratureNode[],
  spectralDistribution: PreparedColorimetricSpectrum,
  cmf: PreparedColorMatchingFunctions
): SampledColorimetricBasis {
  const nodes = parseColorimetricQuadratureNodes(quadratureNodes);
  const n = nodes.length;
  const weights = new Float64Array(n), xBar = new Float64Array(n), yBar = new Float64Array(n), zBar = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const node = nodes[i]!;
    const c = cmf.evaluate(node.wavelengthNanometers);
    weights[i] = spectralDistribution.evaluate(node.wavelengthNanometers) * node.wavelengthMeasureNanometers;
    xBar[i] = c.x; yBar[i] = c.y; zBar[i] = c.z;
  }
  return { nodes, weights, xBar, yBar, zBar, cmf };
}

export function sampleFactor(basis: SampledColorimetricBasis, factor: PreparedColorimetricSpectrum | undefined): Float64Array {
  const out = new Float64Array(basis.nodes.length);
  for (let i = 0; i < out.length; i++) out[i] = factor === undefined ? 1 : factor.evaluate(basis.nodes[i]!.wavelengthNanometers);
  return out;
}

export function integrateSampledXyz(basis: SampledColorimetricBasis, factor: Float64Array): CieXyzTristimulus {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < factor.length; i++) {
    const w = basis.weights[i]! * factor[i]!;
    x += w * basis.xBar[i]!; y += w * basis.yBar[i]!; z += w * basis.zBar[i]!;
  }
  return { x, y, z };
}

export function resolveNormalizationFactor(normalization: TristimulusNormalization, unnormalizedWhiteY: number): number {
  const r = requireRecordValue(normalization, "normalization");
  if (r.kind === "white-luminance-one") {
    if (!(unnormalizedWhiteY > 0) || !Number.isFinite(unnormalizedWhiteY)) {
      throw new InvalidScientificInputError("White-luminance normalization requires a positive integrated Y of the spectral distribution.");
    }
    return 1 / unnormalizedWhiteY;
  }
  if (r.kind === "scale") return requirePositiveNumber(r.factor, "normalization.factor");
  throw new InvalidScientificInputError("normalization.kind is not supported.");
}

function scaleXyz(xyz: CieXyzTristimulus, k: number): CieXyzTristimulus {
  return { x: xyz.x * k, y: xyz.y * k, z: xyz.z * k };
}

/**
 * Integrates a spectrum (optionally multiplied by a reflectance/transmittance factor)
 * against colour-matching functions with caller-explicit quadrature (CIE 15:2018 §7).
 * Provenance is `approximation` for the analytic CMF fit and `calculated` for
 * caller-tabulated CMFs; in both cases the quadrature itself is the caller's choice.
 */
export function integrateSpectrumToXyz(input: IntegrateSpectrumToXyzInput): CalculationResult<IntegratedSpectrumXyz> {
  requireInputObject(input, "integrateSpectrumToXyz input");
  const cmf = prepareColorMatchingFunctions(input.colorMatchingFunctions);
  const distribution = prepareColorimetricSpectrum(input.spectralDistribution, "spectralDistribution");
  const factor = input.spectralFactor === undefined ? undefined : prepareColorimetricSpectrum(input.spectralFactor, "spectralFactor");
  const basis = sampleColorimetricBasis(input.quadratureNodes, distribution, cmf);
  const rawWhite = integrateSampledXyz(basis, sampleFactor(basis, undefined));
  const rawSample = factor === undefined ? rawWhite : integrateSampledXyz(basis, sampleFactor(basis, factor));
  const k = resolveNormalizationFactor(input.normalization, rawWhite.y);
  const xyz = scaleXyz(rawSample, k);
  const whiteXyz = scaleXyz(rawWhite, k);
  requireFiniteResult([xyz.x, xyz.y, xyz.z, whiteXyz.x, whiteXyz.y, whiteXyz.z], "Spectral integration");
  const sum = xyz.x + xyz.y + xyz.z;
  const value: IntegratedSpectrumXyz = {
    xyz, whiteXyz, chromaticity: sum > 0 ? chromaticityOfXyz(xyz) : null, normalizationFactor: k,
    observer: cmf.observer, nodeCount: basis.nodes.length
  };
  const assumptions = [
    "Tristimulus integral evaluated as Σ S(λ)·R(λ)·CMF(λ)·Δλ over the caller's quadrature nodes",
    "Caller owns quadrature convergence and wavelength coverage; tabulated inputs are linearly interpolated and fail closed outside their range"
  ];
  return cmf.scientificStatus === "approximation"
    ? approximationResult(value, "cie-xyz-spectral-integration-wyman-2013-cmf", COLORIMETRY_MODEL_VERSION,
      [...assumptions, "CIE 1931 2° CMFs from the Wyman–Sloan–Shirley (2013) multi-lobe analytic fit (max abs CMF error ≈ 0.014/0.008/0.022)"])
    : calculatedResult(value, "cie-xyz-spectral-integration-tabulated-cmf", COLORIMETRY_MODEL_VERSION,
      [...assumptions, "Caller-supplied tabulated CMFs: " + cmf.datasetId]);
}
