// SPDX-License-Identifier: Apache-2.0
/**
 * The built-in Photivra colour patches (2.14): the set contract, the spectral formula, input validation, the
 * `color-patches` chart and the `{ kind: "color-patch" }` reflectance, rendering through the spectral pipeline, and
 * backward compatibility of existing charts.
 *
 * Independent expectations: the formula is re-evaluated here from the published terms; a neutral patch's L* is the
 * closed form 116·R^(1/3) − 16 (a flat reflectance has Y/Yn = R); the sRGB hex is decoded here with the CSS Color 4
 * matrix written out below. The published CIELAB values come from the CIE D65 and CIE 1931 tables, which the repository
 * does not bundle; `scripts/compute-color-patch-reference.mjs` recomputes them (network access needed).
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { COLOR_PATCH_IDS, COLOR_PATCH_SET_ID, COLOR_PATCH_SET_VERSION, CHART_SCENE_DEFAULTS, InvalidConfigurationError, InvalidScientificInputError,
  calculateCielabFromXyz, calculateColorDifference, evaluateColorPatchReflectance, getColorPatchSet, resolveChartScene, simulateCapture,
  simulateDisplayView, simulateIdealReference, type ChartScene, type ColorPatchId, type SimulateCaptureOptions } from "../src/index.js";
import { evaluateUnclampedColorPatchFormula } from "../src/facade/color-patches.js";
import { resolvePortableChartScene } from "../src/facade/chart-scenes.js";
import { portableExp } from "../src/core/portable-math.js";
import { scaledTimeout } from "./helpers/test-timeout.js";

const set = getColorPatchSet();
/** CSS Color 4 §19 `lin_sRGB_to_XYZ` (D65 white, Y = 1), written out. */
const LINEAR_SRGB_TO_XYZ = [[506752 / 1228815, 87881 / 245763, 12673 / 70218], [87098 / 409605, 175762 / 245763, 12673 / 175545],
  [7918 / 409605, 87881 / 737289, 1001167 / 1053270]];
const SRGB_WHITE = { x: 0.3127 / 0.329, y: 1, z: (1 - 0.3127 - 0.329) / 0.329 };
const decode = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const xyzOfLinear = (rgb: readonly number[]): [number, number, number] =>
  LINEAR_SRGB_TO_XYZ.map((row) => row[0]! * rgb[0]! + row[1]! * rgb[1]! + row[2]! * rgb[2]!) as [number, number, number];
const labOf = (xyz: readonly number[], whiteY = 1): { lStar: number; aStar: number; bStar: number } => calculateCielabFromXyz({
  xyz: { x: xyz[0]!, y: xyz[1]!, z: xyz[2]! }, referenceWhiteXyz: { x: SRGB_WHITE.x * whiteY, y: whiteY, z: SRGB_WHITE.z * whiteY } }).value;
const de00 = (a: { lStar: number; aStar: number; bStar: number }, b: { lStar: number; aStar: number; bStar: number }): number =>
  calculateColorDifference({ formula: "ciede2000", reference: a, sample: b }).value.deltaE;
const published = (id: ColorPatchId): { lStar: number; aStar: number; bStar: number } => {
  const [lStar, aStar, bStar] = set.patches.find((p) => p.patchId === id)!.reference.cielabD65;
  return { lStar, aStar, bStar };
};
const hue = (lab: { aStar: number; bStar: number }): number => (Math.atan2(lab.bStar, lab.aStar) * 180 / Math.PI + 360) % 360;
const chroma = (lab: { aStar: number; bStar: number }): number => Math.hypot(lab.aStar, lab.bStar);

/**
 * Mean linear sRGB of the central 40 % (per axis) of each cell of a `color-patches` render of 6 × 5 cells of `cell` × `cell`
 * pixels (the patch itself covers the central 90 %).
 */
function patchMeans(samples: Uint8Array | Uint16Array, cell: number, full: number): number[][] {
  const width = 6 * cell, channels = samples.length / (width * 5 * cell), inset = Math.round(0.3 * cell), side = cell - 2 * inset;
  return COLOR_PATCH_IDS.map((_, index) => {
    const x0 = (index % 6) * cell + inset, y0 = Math.floor(index / 6) * cell + inset, sum = [0, 0, 0];
    for (let y = y0; y < y0 + side; y++) for (let x = x0; x < x0 + side; x++) for (let c = 0; c < 3; c++) sum[c]! += decode(samples[(y * width + x) * channels + c]! / full);
    return sum.map((v) => v / (side * side));
  });
}
/** CIELAB of every patch of a render with `cell`-pixel cells, relative to the sRGB D65 white scaled so that the 90 % neutral has Y = 0.9. */
async function renderedLab(options: Partial<SimulateCaptureOptions>, ideal = true, cell = 10): Promise<{ lStar: number; aStar: number; bStar: number }[]> {
  const request: SimulateCaptureOptions = { scene: { preset: "color-patches" }, ...options, output: { width: 6 * cell, height: 5 * cell, format: "srgb-16", ...options.output } };
  const image = (ideal ? await simulateIdealReference(request) : await simulateCapture(request)).image;
  const xyz = patchMeans(image.samples, cell, 65535).map(xyzOfLinear);
  const whiteY = xyz[0]![1] / 0.9;
  return xyz.map((v) => labOf(v, whiteY));
}

describe("the built-in colour-patch set (2.14)", () => {
  it("lists 30 patches with stable ids, plain names and the documented groups, deeply frozen", () => {
    expect(set.setId).toBe(COLOR_PATCH_SET_ID);
    expect(set.version).toBe(COLOR_PATCH_SET_VERSION);
    expect(set.patches.map((p) => p.patchId)).toEqual([...COLOR_PATCH_IDS]);
    expect(COLOR_PATCH_IDS).toHaveLength(30);
    expect(new Set(set.patches.map((p) => p.name)).size).toBe(30);
    const groups = set.patches.reduce<Record<string, number>>((n, p) => ({ ...n, [p.group]: (n[p.group] ?? 0) + 1 }), {});
    expect(groups).toEqual({ neutral: 6, strong: 6, soft: 6, skin: 4, memory: 6, "gamut-edge": 2 });
    for (const p of set.patches) {
      expect(p.patchId).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(Object.isFrozen(p) && Object.isFrozen(p.terms) && Object.isFrozen(p.reference) && Object.isFrozen(p.reference.cielabD65)).toBe(true);
      for (const t of p.terms) expect(Object.isFrozen(t)).toBe(true);
    }
    expect(Object.isFrozen(set) && Object.isFrozen(set.patches) && Object.isFrozen(COLOR_PATCH_IDS)).toBe(true);
    expect(() => { (set.patches[0] as { name: string }).name = "x"; }).toThrow(TypeError);
  });

  it("evaluates the documented formula, which never needs its clamp: every spectrum stays in [0.02, 0.95]", () => {
    for (const p of set.patches) {
      let minimum = Infinity, maximum = -Infinity;
      for (let i = 0; i <= 4 * 470; i++) {
        const nm = 360 + i / 4;
        // The formula re-evaluated here from the published terms.
        let expected = p.base;
        for (const t of p.terms) expected += t.kind === "gaussian" ? t.amplitude * Math.exp(-0.5 * ((nm - t.centerNanometers) / t.standardDeviationNanometers) ** 2) :
          t.amplitude * (t.kind === "logistic-rise" ? 1 / (1 + Math.exp(-(nm - t.midpointNanometers) / t.scaleNanometers)) : 1 - 1 / (1 + Math.exp(-(nm - t.midpointNanometers) / t.scaleNanometers)));
        const raw = evaluateUnclampedColorPatchFormula(p.patchId, nm), value = evaluateColorPatchReflectance({ patchId: p.patchId, wavelengthNanometers: nm }).value.reflectance;
        expect(Math.abs(raw - expected)).toBeLessThanOrEqual(4 * Number.EPSILON);
        expect(value).toBe(raw);
        // The display view's portable exponential (within 1 ulp of exp) moves a value by a few ulps at most.
        expect(Math.abs(evaluateUnclampedColorPatchFormula(p.patchId, nm, portableExp) - raw)).toBeLessThanOrEqual(8 * Number.EPSILON);
        minimum = Math.min(minimum, raw); maximum = Math.max(maximum, raw);
      }
      expect(minimum).toBeGreaterThanOrEqual(0.02);
      expect(maximum).toBeLessThanOrEqual(0.95);
      if (p.group === "neutral") { expect(p.terms).toHaveLength(0); expect(minimum).toBe(maximum); }
    }
    const result = evaluateColorPatchReflectance({ patchId: "red", wavelengthNanometers: 700 });
    expect(result.provenance.kind).toBe("approximation");
    expect(result.provenance.modelVersion).toBe(COLOR_PATCH_SET_VERSION);
  });

  it("publishes reference values that agree with themselves: neutral L* in closed form, the hex within its 8-bit rounding", () => {
    for (const p of set.patches) {
      const lab = published(p.patchId);
      expect(p.reference.inSrgbGamut).toBe(true);
      const xyz = xyzOfLinear([1, 3, 5].map((i) => decode(parseInt(p.reference.srgbHex.slice(i, i + 2), 16) / 255)));
      // Half an 8-bit code moves CIELAB by well under 1 ΔE*ab at these lightnesses.
      const fromHex = labOf(xyz);
      expect(Math.hypot(fromHex.lStar - lab.lStar, fromHex.aStar - lab.aStar, fromHex.bStar - lab.bStar)).toBeLessThan(0.8);
      if (p.group === "neutral") {
        expect(lab.aStar).toBe(0);
        expect(lab.bStar).toBe(0);
        expect(Math.abs(lab.lStar - (116 * Math.cbrt(p.base) - 16))).toBeLessThanOrEqual(0.005);
      }
    }
    // The neutral ramp runs from white to black in roughly equal lightness steps.
    const ramp = set.patches.filter((p) => p.group === "neutral").map((p) => p.reference.cielabD65[0]);
    for (let i = 1; i < ramp.length; i++) expect(ramp[i - 1]! - ramp[i]!).toBeGreaterThan(14);
    expect(ramp[0]).toBeGreaterThan(95);
    expect(ramp[5]).toBeLessThan(22);
  });
});

describe("validation", () => {
  const resolve = (scene: unknown): ReturnType<typeof resolveChartScene> => resolveChartScene({ scene: scene as ChartScene, aspect: 5 / 6 });
  it("rejects malformed colour-patch reflectances", () => {
    for (const reflectance of [{ kind: "color-patch" }, { kind: "color-patch", patchId: "Red" }, { kind: "color-patch", patchId: 7 },
      { kind: "color-patch", patchId: "red", name: "Red" }, { kind: "colour-patch", patchId: "red" }, { kind: "spectral", patchId: "red" }]) {
      expect(() => resolve({ preset: "uniform", reflectance })).toThrow(InvalidConfigurationError);
      expect(() => resolve({ preset: "patches", patches: [{ patchId: "a", reflectance }] })).toThrow(InvalidConfigurationError);
    }
  });

  it("rejects malformed color-patches charts", () => {
    for (const scene of [{ patchIds: [] }, { patchIds: ["red", "red"] }, { patchIds: ["red", "crimson"] }, { patchIds: "red" },
      { patchIds: [...COLOR_PATCH_IDS, "red"] }, { columns: 0 }, { columns: 31 }, { columns: 2.5 }, { patchIds: ["red", "blue"], columns: 3 },
      { gapFraction: 0.5 }, { gapFraction: -0.1 }, { backgroundReflectance: 1.2 }, { backgroundReflectance: { kind: "color-patch", patchId: "red" } },
      { patches: [] }, { colour: true }]) {
      expect(() => resolve({ preset: "color-patches", ...scene }), JSON.stringify(scene)).toThrow(InvalidConfigurationError);
    }
  });

  it("rejects malformed evaluateColorPatchReflectance inputs with the documented error classes", () => {
    expect(() => evaluateColorPatchReflectance({ patchId: "crimson" as ColorPatchId, wavelengthNanometers: 500 })).toThrow(InvalidConfigurationError);
    expect(() => evaluateColorPatchReflectance({ patchId: "red", wavelengthNanometers: 500, wavelengthNm: 500 } as never)).toThrow(InvalidConfigurationError);
    for (const nm of [359.9, 830.1, Number.NaN, Infinity, "500"]) {
      expect(() => evaluateColorPatchReflectance({ patchId: "red", wavelengthNanometers: nm as number })).toThrow(InvalidScientificInputError);
    }
    expect(() => resolve({ preset: "uniform", reflectance: { kind: "color-patch", patchId: "red" } }).reflectanceAt(0, 0, 900)).toThrow(InvalidScientificInputError);
  });
});

describe("the color-patches chart and the color-patch reflectance", () => {
  it("resolves the whole set by default and reports every default", () => {
    const chart = resolveChartScene({ scene: { preset: "color-patches" }, aspect: 5 / 6 });
    expect(chart.defaultedParameters).toEqual(["patchIds", "columns", "gapFraction", "backgroundReflectance"]);
    expect(chart.parameters).toEqual({ patchSet: COLOR_PATCH_SET_ID, patchSetVersion: COLOR_PATCH_SET_VERSION, patchIds: [...COLOR_PATCH_IDS], columns: 6, rows: 5,
      gapFraction: CHART_SCENE_DEFAULTS["color-patches"].gapFraction, backgroundReflectance: 0.18 });
    expect(chart.materials.map((m) => m.kind)).toEqual([...Array(30).fill("spectrum"), "neutral"]);
    // Row-major, six per row, top left first; the gap shows the background.
    expect(chart.materialAt(-1 + 1 / 6, 5 / 6 - 1 / 6)).toBe(0);
    expect(chart.materialAt(1 - 1 / 6, -5 / 6 + 1 / 6)).toBe(29);
    expect(chart.materialAt(-1 + 1 / 3, 0)).toBe(30);
    const custom = resolveChartScene({ scene: { preset: "color-patches", patchIds: ["deep-violet", "neutral-4"] }, aspect: 0.5 });
    expect(custom.parameters.columns).toBe(2);
    expect(custom.reflectanceAt(-0.5, 0, 450)).toBe(evaluateColorPatchReflectance({ patchId: "deep-violet", wavelengthNanometers: 450 }).value.reflectance);
    expect(custom.reflectanceAt(0.5, 0, 450)).toBe(0.193);
  });

  it("reports a colour-patch reflectance by id and draws exactly what patches with the same reflectances draws", async () => {
    const uniform = resolveChartScene({ scene: { preset: "uniform", reflectance: { kind: "color-patch", patchId: "sky-blue" } }, aspect: 1 });
    expect(uniform.parameters.reflectance).toEqual({ kind: "color-patch", patchId: "sky-blue" });
    const ids: ColorPatchId[] = ["red", "teal", "skin-tan", "neutral-2"];
    const request = (scene: ChartScene): SimulateCaptureOptions => ({ scene, illuminant: "cie-a", output: { width: 32, height: 16 } });
    const viaPreset = await simulateCapture(request({ preset: "color-patches", patchIds: ids, columns: 4 }));
    const viaPatches = await simulateCapture(request({ preset: "patches", columns: 4, patches: ids.map((patchId) => ({ patchId, reflectance: { kind: "color-patch", patchId } })) }));
    expect(Buffer.from(viaPreset.image.samples).equals(Buffer.from(viaPatches.image.samples))).toBe(true);
    // A material scene takes the same reflectance.
    const material = await simulateCapture({ ...request({ preset: "uniform" }), scene: { kind: "material-function", sceneId: "one-patch",
      materials: [{ kind: "color-patch", patchId: "red" }], materialAt: () => 0 } });
    const uniformRed = await simulateCapture(request({ preset: "uniform", reflectance: { kind: "color-patch", patchId: "red" } }));
    expect(Buffer.from(material.image.samples).equals(Buffer.from(uniformRed.image.samples))).toBe(true);
  }, scaledTimeout(30_000));

  it("puts the patch spectra into the scene digest", async () => {
    const digest = async (scene: ChartScene): Promise<string> => (await simulateCapture({ scene, output: { width: 4, height: 4 } })).scene.sourceSha256;
    const a = await digest({ preset: "uniform", reflectance: { kind: "color-patch", patchId: "red" } });
    expect(await digest({ preset: "uniform", reflectance: { kind: "color-patch", patchId: "red" } })).toBe(a);
    expect(await digest({ preset: "uniform", reflectance: { kind: "color-patch", patchId: "red-soft" } })).not.toBe(a);
    expect(await digest({ preset: "color-patches", patchIds: ["red", "blue"] })).not.toBe(await digest({ preset: "color-patches", patchIds: ["blue", "red"] }));
  });

  it("resolves the display view's portable chart with the same geometry and values within a few ulps", () => {
    const scene: ChartScene = { preset: "composite", elements: [{ scene: { preset: "color-patches" }, centerU: 0, centerV: 0, width: 1.2, height: 1 }] };
    const capture = resolveChartScene({ scene, aspect: 5 / 6 }), view = resolvePortableChartScene({ scene, aspect: 5 / 6 });
    expect(view.parameters).toEqual(capture.parameters);
    for (let i = 0; i < 400; i++) {
      const u = -0.6 + 1.2 * (i % 20 + 0.5) / 20, v = -0.5 + (Math.floor(i / 20) + 0.5) / 20;
      expect(view.materialAt(u, v)).toBe(capture.materialAt(u, v));
      for (const nm of [430, 550, 650]) expect(Math.abs(view.reflectanceAt(u, v, nm) - capture.reflectanceAt(u, v, nm))).toBeLessThanOrEqual(8 * Number.EPSILON);
    }
  });
});

describe("rendering through the spectral pipeline", () => {
  // Measured (5 nm quadrature, ideal reference, default Planckian 6500 K): maximum ΔE00 1.21 (deep orange), mean 0.40.
  // The difference is the illuminant: the published values are for CIE D65, which the repository does not bundle. With
  // the CIE D65 table passed as a caller illuminant, the same render agrees within ΔE00 0.26 (scripts/compute-color-patch-reference.mjs
  // --render), the residual being the engine's analytic CIE 1931 observer. The bounds leave about 10 % for rounding.
  it("reproduces the published CIELAB under a 6500 K daylight-like illuminant within the measured illuminant difference", async () => {
    const lab = await renderedLab({ sensor: { spectralStepNanometers: 5 } });
    const differences = COLOR_PATCH_IDS.map((id, i) => de00(published(id), lab[i]!));
    expect(Math.max(...differences)).toBeLessThanOrEqual(1.35);
    expect(differences.reduce((a, b) => a + b, 0) / differences.length).toBeLessThanOrEqual(0.45);
  }, scaledTimeout(30_000));

  // A flat reflectance under any illuminant is the white diffuser's spectrum scaled, so white balance from that white
  // diffuser makes it neutral. With 5 nm nodes the ideal reference measures |a*|, |b*| ≤ 0.03; at the default 20 nm the
  // facade integrates the sensor on 20 nm nodes but measures the white diffuser on 1 nm nodes, which leaves a small cast
  // (measured: white a* 0.17, b* 0.36 under the 6500 K Planckian; b* −0.17 under illuminant A).
  for (const [label, illuminant] of [["6500 K daylight-like Planckian", undefined], ["illuminant A (tungsten)", "cie-a"]] as const) {
    it("keeps the neutral patches neutral after white balance under " + label, async () => {
      const ideal5 = await renderedLab({ ...(illuminant ? { illuminant } : {}), sensor: { spectralStepNanometers: 5 } });
      const ideal20 = await renderedLab(illuminant ? { illuminant } : {});
      // A capture with sensor noise and the mosaic: means of 24 × 24 pixels.
      const captured = await renderedLab({ ...(illuminant ? { illuminant } : {}), sensor: { spectralStepNanometers: 5 } }, false, 80);
      for (let i = 0; i < 6; i++) {
        expect(chroma(ideal5[i]!), "ideal 5 nm " + i).toBeLessThanOrEqual(0.05);
        expect(chroma(ideal20[i]!), "ideal 20 nm " + i).toBeLessThanOrEqual(0.5);
        expect(chroma(captured[i]!), "capture " + i).toBeLessThanOrEqual(0.3);
        expect(Math.abs(ideal5[i]!.lStar - published(COLOR_PATCH_IDS[i]!).lStar)).toBeLessThanOrEqual(0.05);
      }
    }, scaledTimeout(60_000));

    it("orders the coloured patches by hue under " + label, async () => {
      const lab = await renderedLab({ ...(illuminant ? { illuminant } : {}), sensor: { spectralStepNanometers: 5 } });
      const at = (id: ColorPatchId): { lStar: number; aStar: number; bStar: number } => lab[COLOR_PATCH_IDS.indexOf(id)]!;
      for (const suffix of ["", "-soft"]) {
        const hues = ["red", "yellow", "green", "cyan", "blue", "magenta"].map((h) => hue(at((h + suffix) as ColorPatchId)));
        for (let i = 1; i < hues.length; i++) expect(hues[i]!, suffix + " " + i).toBeGreaterThan(hues[i - 1]!);
      }
      for (const h of ["red", "yellow", "green", "cyan", "blue", "magenta"]) expect(chroma(at((h + "-soft") as ColorPatchId))).toBeLessThan(chroma(at(h as ColorPatchId)));
      const skin = (["skin-pale", "skin-medium", "skin-tan", "skin-deep"] as const).map(at);
      for (let i = 1; i < 4; i++) expect(skin[i]!.lStar).toBeLessThan(skin[i - 1]!.lStar);
      for (const s of skin) { expect(hue(s)).toBeGreaterThan(35); expect(hue(s)).toBeLessThan(75); }
      expect(hue(at("sky-blue"))).toBeGreaterThan(240);
      expect(hue(at("sky-blue"))).toBeLessThan(285);
      expect(hue(at("foliage-green"))).toBeGreaterThan(110);
      expect(hue(at("foliage-green"))).toBeLessThan(140);
    }, scaledTimeout(30_000));
  }

  it("renders in the display view on the chart path", async () => {
    const view = await simulateDisplayView({ scene: { preset: "color-patches" }, sensor: { spectralStepNanometers: 5 }, output: { width: 600, height: 500 } }, { width: 60, height: 50 });
    const xyz = patchMeans(view.image.samples, 10, 255).map(xyzOfLinear), whiteY = xyz[0]![1] / 0.9;
    const reference = await renderedLab({ sensor: { spectralStepNanometers: 5 } });
    // 8-bit samples with display-view noise: compare hue ordering and a loose colour agreement with the ideal reference.
    for (let i = 0; i < 30; i++) expect(de00(reference[i]!, labOf(xyz[i]!, whiteY))).toBeLessThan(3);
  }, scaledTimeout(60_000));
});

/**
 * Existing charts render bit-identically: SHA-256 of the scene digest and of the 8-bit samples, recorded with the 2.13.0
 * build (origin/main 9c3fe85) on Node 24 before the colour patches were added. Neutral scalar reflectances, a caller
 * tabulated spectrum and a caller function spectrum.
 */
describe("backward compatibility", () => {
  const warm = { kind: "tabulated" as const, samples: [[380, 0.1], [500, 0.2], [600, 0.6], [780, 0.7]].map(([w, v]) => ({ wavelengthNanometers: w!, value: v! })) };
  const cases: [string, SimulateCaptureOptions, string, string][] = [
    ["composite of grey elements", { scene: { preset: "composite", background: { preset: "line-grid", spacing: 1 / 6, lineWidth: 0.004 }, elements: [
      { scene: { preset: "uniform", reflectance: 0.18 }, centerU: -0.6, centerV: -0.4, width: 0.3, height: 0.2 },
      { scene: { preset: "step-wedge", steps: 12 }, centerU: 0.1, centerV: -0.5, width: 0.9, height: 0.12 },
      { scene: { preset: "siemens-star", profile: "sine", cycles: 64 }, centerU: 0, centerV: 0, width: 0.6, height: 0.6, mask: "ellipse" },
      { scene: { preset: "uniform", reflectance: warm }, centerU: -0.2, centerV: 0.5, width: 0.2, height: 0.1 }] }, output: { width: 48, height: 32 } },
      "2fafa3bef23eb6755f438d56b72ceb92e760984830b2d08f647c8b3cf7cda69d", "c7bbf14af4ceedee39a0a912ca2e81cfb759e4925c9882531c20b56b0aa7bbfe"],
    ["patches with caller spectra under illuminant A", { scene: { preset: "patches", columns: 3, patches: [{ patchId: "a", reflectance: 0.5 }, { patchId: "b", reflectance: warm },
      { patchId: "c", reflectance: { kind: "function", wavelengthRangeNanometers: { minimum: 360, maximum: 830 }, evaluate: (nm: number) => 0.2 + 0.5 * Math.exp(-0.5 * ((nm - 520) / 40) ** 2) } }] },
      illuminant: "cie-a", output: { width: 24, height: 8 } }, "6bffeed35b196b5920cd225b75cfe93b672c84a0bfd4953f99533810c775c388", "b741902e69d9437b9ff4affa90f4719bb85f14d80f410755bd6ab3e6bae5791f"],
    ["uniform scalar", { scene: { preset: "uniform", reflectance: 0.42 }, output: { width: 8, height: 8, format: "srgb-16" } }, "6f35a1b6c5e7e71d8aef3f950ce6385c25828147e003de7eeb54b832fa534bbd", "d5c22471fe6cbd720e9c61d00d69947d0000068e170681016e75fffe20e06f3c"]
  ];
  for (const [label, request, source, samples] of cases) {
    it("renders " + label + " exactly as 2.13.0", async () => {
      const capture = await simulateCapture(request);
      const bytes = capture.image.samples;
      const actual = { source: capture.scene.sourceSha256, samples: createHash("sha256").update(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)).digest("hex") };
      if (process.env.PHOTIVRA_PRINT_COLOR_PATCH_BASELINE) console.log(label, JSON.stringify(actual));
      expect(actual).toEqual({ source, samples });
    }, scaledTimeout(30_000));
  }
});
