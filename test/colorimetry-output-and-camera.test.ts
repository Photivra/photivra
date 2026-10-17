// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  InvalidScientificInputError,
  calculateCaptureColorTransform,
  calculateCielabFromXyz,
  calculateGamutMappedColor,
  calculateRgbToXyzMatrices,
  createCaptureWhiteBalanceIntent,
  createColorTemperatureWhiteBalanceIntent,
  createLockedWhiteBalanceState,
  createPlanckianSpectrum,
  createSimulatedCapture,
  evaluateBt709InverseOetf,
  evaluateSrgbDecoding,
  evaluateBt709Oetf,
  evaluateSrgbEncoding,
  estimateCie1931ColorMatchingFunctions,
  estimateCameraColorMatrix,
  integrateSpectrumToXyz,
  parseCaptureColorTransformInput,
  parseResolvedWhiteBalanceState,
  prepareBt1886Eotf,
  prepareRgbGamutMapping,
  resolveCaptureColorModel,
  resolveColorTemperatureWhiteBalance,
  resolveRgbColorSpace,
  type CameraMatrixTrainingPatch,
  type CaptureColorTransformInput,
  type CielabColor,
  type ColorMatchingFunctionsSource,
  type ColorimetricQuadratureNode,
  type ColorimetricSpectrum,
  type ColorMatrix3x3
} from "../src/index.js";
import * as engine from "../src/index.js";
import { loadLinearCaptureInput as captureInput } from "./helpers/linear-capture-fixture.js";

const ANALYTIC: ColorMatchingFunctionsSource = { kind: "analytic-cie-1931-multi-lobe-fit" };
const NODES: ColorimetricQuadratureNode[] = Array.from({ length: 94 }, (_, i) => ({ wavelengthNanometers: 362.5 + 5 * i, wavelengthMeasureNanometers: 5 }));
const RANGE = { minimum: 360, maximum: 830 };
const fn = (evaluate: (nm: number) => number): ColorimetricSpectrum => ({ kind: "function", wavelengthRangeNanometers: RANGE, evaluate });
const gauss = (mu: number, sigma: number) => (nm: number): number => Math.exp(-0.5 * ((nm - mu) / sigma) ** 2);
/** Owned synthetic smooth reflectances (not measured chart data). */
const PATCHES: CameraMatrixTrainingPatch[] = [
  ...[420, 460, 500, 540, 580, 620, 660].map((mu, i) => ({ patchId: "bump-" + i, reflectance: fn((nm) => 0.05 + 0.8 * gauss(mu, 30)(nm)) })),
  { patchId: "ramp-up", reflectance: fn((nm) => 0.05 + 0.85 * (nm - 360) / 470) },
  { patchId: "ramp-down", reflectance: fn((nm) => 0.9 - 0.85 * (nm - 360) / 470) },
  { patchId: "grey", reflectance: fn(() => 0.18) },
  { patchId: "skin-like", reflectance: fn((nm) => 0.15 + 0.4 / (1 + Math.exp(-(nm - 580) / 20))) },
  { patchId: "foliage-like", reflectance: fn((nm) => 0.04 + 0.12 * gauss(550, 25)(nm) + 0.5 / (1 + Math.exp(-(nm - 700) / 12))) }
];

describe("RGB colour spaces and transfer functions", () => {
  it("derives matrices from primaries whose luminance rows match the published coefficients", () => {
    const srgb = resolveRgbColorSpace("srgb").value;
    const ideal = resolveCaptureColorModel();
    srgb.rgbToXyz.forEach((row, i) => row.forEach((v, j) => expect(v).toBeCloseTo(ideal.cameraRgbToXyz[i]![j]!, 15)));
    const rows: Record<string, readonly number[]> = { srgb: [0.2126, 0.7152, 0.0722], rec709: [0.2126, 0.7152, 0.0722], "display-p3": [0.2290, 0.6917, 0.0793], rec2020: [0.2627, 0.6780, 0.0593] };
    for (const id of ["srgb", "rec709", "display-p3", "rec2020"] as const) {
      const space = resolveRgbColorSpace(id).value;
      space.rgbToXyz[1].forEach((v, j) => expect(Math.abs(v - rows[id]![j]!)).toBeLessThan(1e-4)); // BT.709-6, BT.2020-2 Table 4, SMPTE EG 432-1
      const white = space.rgbToXyz.map((r) => r[0] + r[1] + r[2]);
      expect(white[0]).toBeCloseTo(0.3127 / 0.3290, 14); expect(white[1]).toBeCloseTo(1, 14); expect(white[2]).toBeCloseTo((1 - 0.3127 - 0.3290) / 0.3290, 14);
      const id3 = space.rgbToXyz.map((r) => [0, 1, 2].map((j) => r[0] * space.xyzToRgb[0]![j]! + r[1] * space.xyzToRgb[1]![j]! + r[2] * space.xyzToRgb[2]![j]!));
      id3.forEach((r, i) => r.forEach((v, j) => expect(v).toBeCloseTo(i === j ? 1 : 0, 13)));
    }
    expect(() => resolveRgbColorSpace("adobe" as "srgb")).toThrow();
    expect(() => calculateRgbToXyzMatrices({ primaries: { red: { x: 0.64, y: 0.33 }, green: { x: 0.3, y: 0.6 }, blue: { x: 0.15, y: 0.06 } }, whiteChromaticity: { x: 0.7, y: 0.29 } })).toThrow();
  });
  it("derives exactly the matrices published in W3C CSS Color 4 (sample code, CRD 9 October 2026)", () => {
    // Rational matrices from https://www.w3.org/TR/css-color-4/ §"Sample code for color conversions":
    // lin_sRGB_to_XYZ / XYZ_to_lin_sRGB, lin_P3_to_XYZ / XYZ_to_lin_P3, lin_2020_to_XYZ / XYZ_to_lin_2020 (D65 = 0.3127/0.3290).
    const css: Record<"srgb" | "display-p3" | "rec2020", { toXyz: number[][]; fromXyz: number[][] }> = {
      srgb: {
        toXyz: [[506752 / 1228815, 87881 / 245763, 12673 / 70218], [87098 / 409605, 175762 / 245763, 12673 / 175545], [7918 / 409605, 87881 / 737289, 1001167 / 1053270]],
        fromXyz: [[12831 / 3959, -329 / 214, -1974 / 3959], [-851781 / 878810, 1648619 / 878810, 36519 / 878810], [705 / 12673, -2585 / 12673, 705 / 667]]
      },
      "display-p3": {
        toXyz: [[608311 / 1250200, 189793 / 714400, 198249 / 1000160], [35783 / 156275, 247089 / 357200, 198249 / 2500400], [0, 32229 / 714400, 5220557 / 5000800]],
        fromXyz: [[446124 / 178915, -333277 / 357830, -72051 / 178915], [-14852 / 17905, 63121 / 35810, 423 / 17905], [11844 / 330415, -50337 / 660830, 316169 / 330415]]
      },
      rec2020: {
        toXyz: [[63426534 / 99577255, 20160776 / 139408157, 47086771 / 278816314], [26158966 / 99577255, 472592308 / 697040785, 8267143 / 139408157],
          [0, 19567812 / 697040785, 295819943 / 278816314]],
        fromXyz: [[30757411 / 17917100, -6372589 / 17917100, -4539589 / 17917100], [-19765991 / 29648200, 47925759 / 29648200, 467509 / 29648200],
          [792561 / 44930125, -1921689 / 44930125, 42328811 / 44930125]]
      }
    };
    const TOLERANCE = 1e-12;
    for (const [id, published] of [["srgb", css.srgb], ["rec709", css.srgb], ["display-p3", css["display-p3"]], ["rec2020", css.rec2020]] as const) {
      const space = resolveRgbColorSpace(id).value;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        expect(Math.abs(space.rgbToXyz[i]![j]! - published.toXyz[i]![j]!), id + " rgbToXyz " + i + j).toBeLessThan(TOLERANCE);
        expect(Math.abs(space.xyzToRgb[i]![j]! - published.fromXyz[i]![j]!), id + " xyzToRgb " + i + j).toBeLessThan(TOLERANCE);
      }
    }
  });

  it("implements sRGB, BT.709 OETF and BT.1886 EOTF", () => {
    for (const v of [0, 0.001, 0.0031308, 0.2, 1]) expect(evaluateSrgbDecoding(evaluateSrgbEncoding(v))).toBeCloseTo(v, 12);
    expect(evaluateBt709Oetf(0.018)).toBeCloseTo(0.081, 3);
    expect(evaluateBt709Oetf(1)).toBeCloseTo(1, 14);
    for (const v of [0, 0.01, 0.018, 0.5, 1]) expect(evaluateBt709InverseOetf(evaluateBt709Oetf(v))).toBeCloseTo(v, 12);
    const display = prepareBt1886Eotf({ whiteLuminanceCdPerSquareMeter: 100, blackLuminanceCdPerSquareMeter: 0.1 });
    expect(display.decode(1)).toBeCloseTo(100, 10);
    expect(display.decode(0)).toBeCloseTo(0.1, 10);
    expect(display.encode(display.decode(0.4))).toBeCloseTo(0.4, 12);
    expect(prepareBt1886Eotf({ whiteLuminanceCdPerSquareMeter: 100, blackLuminanceCdPerSquareMeter: 0 }).decode(0.5)).toBeCloseTo(100 * 0.5 ** 2.4, 12);
    expect(() => prepareBt1886Eotf({ whiteLuminanceCdPerSquareMeter: 100, blackLuminanceCdPerSquareMeter: 100 })).toThrow();
    expect(() => evaluateSrgbEncoding(Number.NaN)).toThrow();
  });

  it("does not export the BT.2100 PQ or HLG transfer functions (not part of 2.0)", () => {
    // Removed by owner decision (2026-10-17): licence-on-request patent declarations only (THIRD_PARTY.md).
    for (const name of ["evaluatePqEotf", "evaluatePqInverseEotf", "PQ_CONSTANTS", "evaluateHlgOetf", "evaluateHlgInverseOetf", "HLG_CONSTANTS",
      "calculateHlgSystemGamma", "prepareHlgReferenceDisplay"]) expect(Object.hasOwn(engine, name), name).toBe(false);
  });
});

describe("perceptual gamut mapping", () => {
  const rec2020 = resolveRgbColorSpace("rec2020").value;
  const toXyz = (rgb: readonly number[]): [number, number, number] => rec2020.rgbToXyz.map((r) => r[0] * rgb[0]! + r[1] * rgb[1]! + r[2] * rgb[2]!) as unknown as [number, number, number];
  const lab = (xyz: readonly number[]): CielabColor => calculateCielabFromXyz({ xyz: { x: xyz[0]!, y: xyz[1]!, z: xyz[2]! }, referenceWhiteXyz: rec2020.whiteXyz }).value;
  const srgb = resolveRgbColorSpace("srgb").value;
  it("leaves in-gamut colours unchanged when clipping and preserves L* and hue for out-of-gamut colours", () => {
    const clip = prepareRgbGamutMapping({ colorSpace: "srgb", method: "cielab-hue-preserving-chroma-compression", kneeFraction: 1 });
    const inside = clip.map(srgb.rgbToXyz.map((r) => r[0] * 0.2 + r[1] * 0.5 + r[2] * 0.7) as unknown as [number, number, number]);
    expect(inside.adjusted).toBe(false);
    inside.linearRgb.forEach((v, i) => expect(v).toBeCloseTo([0.2, 0.5, 0.7][i]!, 12));
    for (const rgb of [[0, 1, 0], [1, 0, 0], [0, 0, 1], [0.1, 0.9, 0.9]]) {
      const xyz = toXyz(rgb);
      const out = clip.map(xyz);
      expect(out.adjusted).toBe(true);
      expect(out.linearRgb.every((v) => v >= 0 && v <= 1)).toBe(true);
      expect(out.linearRgb.some((v) => v < 1e-9 || v > 1 - 1e-9)).toBe(true); // on the boundary
      const mappedXyz = srgb.rgbToXyz.map((r) => r[0] * out.linearRgb[0] + r[1] * out.linearRgb[1] + r[2] * out.linearRgb[2]);
      const a = lab(xyz), b = lab(mappedXyz);
      expect(b.lStar).toBeCloseTo(a.lStar, 6);
      expect(Math.atan2(b.bStar, b.aStar)).toBeCloseTo(Math.atan2(a.bStar, a.aStar), 6);
      expect(Math.hypot(b.aStar, b.bStar)).toBeLessThan(Math.hypot(a.aStar, a.bStar));
    }
  });
  it("compresses chroma monotonically with a knee and clips lightness", () => {
    const soft = prepareRgbGamutMapping({ colorSpace: "display-p3", method: "cielab-hue-preserving-chroma-compression", kneeFraction: 0.8 });
    let previous = -1;
    for (const s of [0, 0.25, 0.5, 0.75, 1]) {
      const xyz = toXyz([0.5 - 0.4 * s, 0.5 + 0.4 * s, 0.5 - 0.4 * s]);
      const out = soft.map(xyz);
      const p3 = resolveRgbColorSpace("display-p3").value;
      const c = ((): number => { const m = p3.rgbToXyz.map((r) => r[0] * out.linearRgb[0] + r[1] * out.linearRgb[1] + r[2] * out.linearRgb[2]); const l = lab(m); return Math.hypot(l.aStar, l.bStar); })();
      expect(c).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = c;
    }
    expect(soft.map([0, 0, 0])).toEqual({ linearRgb: [0, 0, 0], adjusted: false, lightnessClipped: true });
    const bright = soft.map([2, 2.1, 2.2]);
    expect(bright.linearRgb).toEqual([1, 1, 1]); expect(bright.lightnessClipped).toBe(true);
    const r = calculateGamutMappedColor({ colorSpace: "srgb", method: "cielab-hue-preserving-chroma-compression", kneeFraction: 0, xyz: { x: 0.2, y: 0.2, z: 0.2 } });
    expect(r.provenance.kind).toBe("approximation");
    expect(() => prepareRgbGamutMapping({ colorSpace: "srgb", method: "cielab-hue-preserving-chroma-compression", kneeFraction: 1.5 })).toThrow();
    expect(() => prepareRgbGamutMapping({ colorSpace: "srgb", method: "clip" as "cielab-hue-preserving-chroma-compression", kneeFraction: 1 })).toThrow();
  });
});

describe("camera colour-matrix fitting", () => {
  const illuminant = createPlanckianSpectrum({ temperatureKelvin: 5000, wavelengthRangeNanometers: RANGE });
  it("is exact for a camera satisfying the Luther condition", () => {
    const mix: ColorMatrix3x3 = [[0.9, 0.3, -0.1], [-0.2, 1.1, 0.05], [0.05, -0.1, 0.95]];
    const channel = (row: readonly number[]): ColorimetricSpectrum => fn((nm) => { const c = estimateCie1931ColorMatchingFunctions(nm); return row[0]! * c.x + row[1]! * c.y + row[2]! * c.z; });
    for (const constraint of ["least-squares", "white-point-preserving-least-squares"] as const) {
      const fit = estimateCameraColorMatrix({ quadratureNodes: NODES, illuminant, cameraSpectralSensitivities: { red: channel(mix[0]), green: channel(mix[1]), blue: channel(mix[2]) },
        patches: PATCHES, colorMatchingFunctions: ANALYTIC, constraint }).value;
      expect(fit.maximumDeltaE2000).toBeLessThan(1e-8);
      expect(fit.rmsXyzResidual).toBeLessThan(1e-12);
      // Fitted camera→XYZ equals the inverse mixing matrix up to the camera green normalization.
      const product = mix.map((row) => [0, 1, 2].map((j) => row[0] * fit.cameraRgbToXyz[0]![j]! + row[1] * fit.cameraRgbToXyz[1]![j]! + row[2] * fit.cameraRgbToXyz[2]![j]!));
      const k = product[0]![0]!;
      product.forEach((r, i) => r.forEach((v, j) => expect(v / k).toBeCloseTo(i === j ? 1 : 0, 9)));
      expect(fit.cameraWhiteRgb[1]).toBe(1);
      expect(fit.illuminantWhiteXyz.y).toBeCloseTo(1, 14);
    }
  });
  it("preserves the white exactly when constrained and never beats unconstrained least squares on residual", () => {
    const cam = { red: fn(gauss(600, 35)), green: fn(gauss(535, 40)), blue: fn(gauss(455, 30)) };
    const base = { quadratureNodes: NODES, illuminant, cameraSpectralSensitivities: cam, patches: PATCHES, colorMatchingFunctions: ANALYTIC };
    const free = estimateCameraColorMatrix({ ...base, constraint: "least-squares" });
    const wp = estimateCameraColorMatrix({ ...base, constraint: "white-point-preserving-least-squares" });
    expect(free.provenance.kind).toBe("estimated");
    const w = wp.value.cameraWhiteRgb;
    const predicted = wp.value.cameraRgbToXyz.map((r) => r[0] * w[0] + r[1] * w[1] + r[2] * w[2]);
    expect(predicted[0]).toBeCloseTo(wp.value.illuminantWhiteXyz.x, 12);
    expect(predicted[1]).toBeCloseTo(1, 12);
    expect(predicted[2]).toBeCloseTo(wp.value.illuminantWhiteXyz.z, 12);
    expect(free.value.rmsXyzResidual).toBeLessThanOrEqual(wp.value.rmsXyzResidual + 1e-15);
    expect(free.value.maximumDeltaE2000).toBeGreaterThan(0.01); // non-Luther camera: a real, reported residual
    expect(wp.value.patches.length).toBe(PATCHES.length);
    expect(() => estimateCameraColorMatrix({ ...base, patches: PATCHES.slice(0, 2), constraint: "least-squares" })).toThrow();
    expect(() => estimateCameraColorMatrix({ ...base, patches: [PATCHES[0]!, PATCHES[0]!, PATCHES[1]!], constraint: "least-squares" })).toThrow();
    expect(() => estimateCameraColorMatrix({ ...base, patches: [PATCHES[9]!, { ...PATCHES[9]!, patchId: "g2" }, { ...PATCHES[9]!, patchId: "g3" }], constraint: "least-squares" })).toThrow();
    expect(() => estimateCameraColorMatrix({ ...base, constraint: "ridge" as "least-squares" })).toThrow();
  });
});

describe("Kelvin + tint white balance", () => {
  const xyzToCamera = resolveCaptureColorModel().xyzToCameraRgb;
  const camera = { profileId: "ideal-colorimetric", profileVersion: "0.1.0", xyzToCameraRgb: xyzToCamera };
  const greyCardCameraRgb = (spd: ColorimetricSpectrum, nodes: ColorimetricQuadratureNode[]): number[] => {
    const r = integrateSpectrumToXyz({ quadratureNodes: nodes, spectralDistribution: spd, spectralFactor: fn(() => 0.18), colorMatchingFunctions: ANALYTIC, normalization: { kind: "white-luminance-one" } }).value.xyz;
    return xyzToCamera.map((row) => row[0] * r.x + row[1] * r.y + row[2] * r.z);
  };
  it("neutralizes a grey card under the matching Planckian illuminant", () => {
    for (const kelvin of [2856, 3200, 5500, 9000]) {
      const intent = createColorTemperatureWhiteBalanceIntent({ intentId: "k" + kelvin, colorTemperatureKelvin: kelvin, tint: 0 });
      const exactState = resolveColorTemperatureWhiteBalance({ stateId: "wb-" + kelvin, intent, whiteLocus: "planckian", tintInterpretation: "duv-cie-1960-uv", camera,
        planckianLocus: { kind: "planck-integration", colorMatchingFunctions: ANALYTIC, quadratureNodes: NODES } });
      const rgb = greyCardCameraRgb(createPlanckianSpectrum({ temperatureKelvin: kelvin, wavelengthRangeNanometers: RANGE }), NODES);
      const g = exactState.channelGains;
      const balanced = [rgb[0]! * g.red, rgb[1]! * g.green, rgb[2]! * g.blue];
      expect(balanced[0]! / balanced[1]!).toBeCloseTo(1, 10);
      expect(balanced[2]! / balanced[1]!).toBeCloseTo(1, 10);
      expect(exactState.source).toBe("color-temperature");
      // The default locus integrates the same CMFs on 1 nm nodes instead of these 5 nm nodes; the
      // residual cast is only the quadrature difference.
      const defaultState = resolveColorTemperatureWhiteBalance({ stateId: "wb-default", intent, whiteLocus: "planckian", tintInterpretation: "duv-cie-1960-uv", camera });
      expect(defaultState.colorTemperature!.planckianLocusModel).toBe("planck-analytic-cmf");
      const k = defaultState.channelGains;
      expect(Math.abs((rgb[0]! * k.red) / (rgb[1]! * k.green) - 1)).toBeLessThan(1e-3);
      expect(Math.abs((rgb[2]! * k.blue) / (rgb[1]! * k.green) - 1)).toBeLessThan(1e-3);
    }
  });
  it("neutralizes a daylight-locus white and makes positive tint cast-correct toward magenta", () => {
    const locus = { kind: "planck-analytic-cmf" as const };
    const intent = createColorTemperatureWhiteBalanceIntent({ intentId: "d", colorTemperatureKelvin: 6504, tint: 0 });
    const state = resolveColorTemperatureWhiteBalance({ stateId: "wb-d", intent, whiteLocus: "cie-daylight", tintInterpretation: "duv-cie-1960-uv", camera, planckianLocus: locus });
    const white = state.colorTemperature!.adoptedWhiteChromaticity;
    const xyz = [white.x / white.y, 1, (1 - white.x - white.y) / white.y];
    const rgb = xyzToCamera.map((row) => row[0] * xyz[0]! + row[1] * xyz[1]! + row[2] * xyz[2]!);
    expect(rgb[0]! * state.channelGains.red).toBeCloseTo(rgb[1]!, 12);
    expect(rgb[2]! * state.channelGains.blue).toBeCloseTo(rgb[1]!, 12);
    const green = resolveColorTemperatureWhiteBalance({ stateId: "wb-g", intent: createColorTemperatureWhiteBalanceIntent({ intentId: "g", colorTemperatureKelvin: 6504, tint: 0.01 }),
      whiteLocus: "cie-daylight", tintInterpretation: "duv-cie-1960-uv", camera });
    // A greener declared white needs relatively more red and blue gain.
    expect(green.channelGains.red).toBeGreaterThan(state.channelGains.red);
    expect(green.channelGains.blue).toBeGreaterThan(state.channelGains.blue);
  });
  it("round-trips through the state parser, lock and capture metadata and fails closed", () => {
    const intent = createColorTemperatureWhiteBalanceIntent({ intentId: "k", colorTemperatureKelvin: 4300, tint: -0.004 });
    const state = resolveColorTemperatureWhiteBalance({ stateId: "wb", intent, whiteLocus: "planckian", tintInterpretation: "duv-cie-1960-uv", camera });
    expect(parseResolvedWhiteBalanceState(JSON.parse(JSON.stringify(state)))).toEqual(state);
    const locked = createLockedWhiteBalanceState({ stateId: "wb-lock", sourceState: state });
    expect(parseResolvedWhiteBalanceState(JSON.parse(JSON.stringify(locked))).colorTemperature).toEqual(state.colorTemperature);
    expect(createCaptureWhiteBalanceIntent({ state }).source).toBe("color-temperature");
    const json = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
    expect(() => parseResolvedWhiteBalanceState({ ...json, colorTemperature: undefined })).toThrow();
    expect(() => parseResolvedWhiteBalanceState({ ...json, source: "manual-gains" })).toThrow();
    expect(() => parseResolvedWhiteBalanceState({ ...json, colorTemperature: { ...(json.colorTemperature as object), whiteLocus: "moon" } })).toThrow();
    expect(() => parseResolvedWhiteBalanceState({ ...json, colorTemperature: { ...(json.colorTemperature as object), tintInterpretation: "adobe" } })).toThrow();
    expect(() => parseResolvedWhiteBalanceState({ ...json, colorTemperature: { ...(json.colorTemperature as object), planckianLocusModel: "x" } })).toThrow();
    // States saved with the removed cubic-spline locus are rejected (2.0.0 migration: re-resolve them).
    expect(() => parseResolvedWhiteBalanceState({ ...json, colorTemperature: { ...(json.colorTemperature as object), planckianLocusModel: "kim-2002-cubic-spline" } })).toThrow();
    expect(() => resolveColorTemperatureWhiteBalance({ stateId: "x", intent, whiteLocus: "planckian", tintInterpretation: "adobe" as "duv-cie-1960-uv", camera })).toThrow();
    expect(() => resolveColorTemperatureWhiteBalance({ stateId: "x", intent: { ...intent, version: "9" as "0.1.0" }, whiteLocus: "planckian", tintInterpretation: "duv-cie-1960-uv", camera })).toThrow();
    expect(() => resolveColorTemperatureWhiteBalance({ stateId: "x", intent, whiteLocus: "planckian", tintInterpretation: "duv-cie-1960-uv", camera: { ...camera, xyzToCameraRgb: [[-1, 0, 0], [0, 1, 0], [0, 0, 1]] } })).toThrow();
    expect(() => resolveColorTemperatureWhiteBalance({ stateId: "x", intent: createColorTemperatureWhiteBalanceIntent({ intentId: "t", colorTemperatureKelvin: 5000, tint: 0.2 }), whiteLocus: "planckian", tintInterpretation: "duv-cie-1960-uv", camera })).toThrow();
    // 2000 K with tint (Duv) +0.02 lies outside x + y <= 1. With a camera matrix that keeps every gain positive it used to
    // resolve to an adopted white the engine then rejects as input; it now fails closed before any gain is computed.
    const lenient = { ...camera, xyzToCameraRgb: [[0.8, 0.3, -0.1], [-0.3, 1.2, 0.1], [0, 0.3, 0.7]] as [[number, number, number], [number, number, number], [number, number, number]] };
    expect(() => resolveColorTemperatureWhiteBalance({ stateId: "x", intent: createColorTemperatureWhiteBalanceIntent({ intentId: "t", colorTemperatureKelvin: 2000, tint: 0.02 }),
      whiteLocus: "planckian", tintInterpretation: "duv-cie-1960-uv", camera: lenient })).toThrow(InvalidScientificInputError);
    expect(resolveColorTemperatureWhiteBalance({ stateId: "x", intent: createColorTemperatureWhiteBalanceIntent({ intentId: "t", colorTemperatureKelvin: 2000, tint: 0.005 }),
      whiteLocus: "planckian", tintInterpretation: "duv-cie-1960-uv", camera: lenient }).channelGains.green).toBe(1);
  });
});

describe("capture-colour cone-space adaptation option", () => {
  function request(transform?: "bradford" | "cat16"): CaptureColorTransformInput {
    const value = captureInput();
    const white = { x: 1.0985, y: 1 as const, z: 0.3558 }; // illuminant A-like adopted white
    value.adoptedWhiteXyz = white;
    value.planes = [{ ...value.planes[0]!, encodingReferenceWhiteXyz: white,
      storage: { kind: "inline-float64", samples: [white.x, 1, white.z, 0.2, 0.3, 0.1] } }];
    return { capture: createSimulatedCapture(value).value, sourcePlaneId: "source", outputPlaneId: "rgb", outputImageStateId: "rgb-state",
      whiteBalance: transform === undefined ? { kind: "adopted-white-xyz-scaling" as const } : { kind: "adopted-white-xyz-scaling" as const, transform } };
  }
  it("maps the adopted white to D65 white and records the selected transform", () => {
    for (const transform of ["bradford", "cat16"] as const) {
      const r = calculateCaptureColorTransform(request(transform));
      if (r.value.plane.storage.kind !== "inline-float64") throw new Error("fixture");
      r.value.plane.storage.samples.slice(0, 3).forEach((v) => expect(v).toBeCloseTo(1, 12));
      expect(r.provenance.model).toBe("capture-color-" + transform + "-adaptation");
      expect(r.provenance.kind).toBe("approximation");
      expect(r.value.plane.appliedTransforms.some((t) => t.profile.id === "photivra-" + transform + "-adaptation")).toBe(true);
      expect(r.value.whiteBalance).toEqual({ kind: "adopted-white-xyz-scaling", transform });
    }
    const legacy = calculateCaptureColorTransform(request());
    expect(legacy.provenance.model).toBe("capture-color-xyz-diagonal-adaptation");
    expect(legacy.value.plane.appliedTransforms.some((t) => t.profile.id === "photivra-xyz-diagonal-adaptation")).toBe(true);
    // A non-white colour adapts differently under a cone-space transform than under XYZ scaling.
    const b = calculateCaptureColorTransform(request("bradford"));
    if (b.value.plane.storage.kind !== "inline-float64" || legacy.value.plane.storage.kind !== "inline-float64") throw new Error("fixture");
    expect(Math.abs(b.value.plane.storage.samples[5]! - legacy.value.plane.storage.samples[5]!)).toBeGreaterThan(1e-3);
  });
  it("fails closed on unknown or contradictory transform declarations", () => {
    const r = request("bradford");
    expect(() => parseCaptureColorTransformInput({ ...r, whiteBalance: { kind: "adopted-white-xyz-scaling", transform: "hunt" } })).toThrow();
    // CAT02 is not part of 2.0 (no free source prints its matrix).
    expect(() => parseCaptureColorTransformInput({ ...r, whiteBalance: { kind: "adopted-white-xyz-scaling", transform: "cat02" } })).toThrow();
    expect(() => parseCaptureColorTransformInput({ ...r, whiteBalance: { kind: "adopted-white-xyz-scaling", transform: "von-kries-hpe" } })).toThrow();
    expect(() => parseCaptureColorTransformInput({ ...r, whiteBalance: { kind: "preserve-intent", transform: "bradford" } })).toThrow();
    expect(parseCaptureColorTransformInput(r).whiteBalance).toEqual({ kind: "adopted-white-xyz-scaling", transform: "bradford" });
  });
});
