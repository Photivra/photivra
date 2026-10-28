// SPDX-License-Identifier: Apache-2.0
/**
 * The rounding barrier of the composite chart arithmetic (2.11.0, the owner's M5 Pro runs of October 27, 2026): every
 * operation of the double-float32 error-free transforms, and every value of the bound arithmetic, is wrapped in `ob`, whose
 * bits are XORed with a word the host sets to 0, so a compiler can neither reassociate nor fuse across it (W3C WGSL § 15.7.5
 * permits both). Before the barrier, Metal's compiler simplified the transforms (probe class `reassociated`); with it, the probe
 * on that device is `exact` on the Dekker path. On the hardware the probe decides; these tests guard the shader text and
 * the host's zero words, which a broken substitution (the placeholder left in a shader) or a non-zero word would break.
 */
import { describe, expect, it } from "vitest";
import { CHART_COMPOSITE_PROBE_WGSL, chartCompositeWgsl } from "../src/gpu/wgsl-chart-composite-kernel.js";
import { chartCompositeMaterialWgsl, DISPLAY_VIEW_LATTICE, displayViewLatticeConstants } from "../src/gpu/display-view-composite-material-module.js";
import { SMALL_FRAME, SMALL_VIEW, displayViewGpuFixture } from "./helpers/display-view-gpu-fixture.js";
import { FIXTURE_ASPECT, layeredScene } from "./helpers/chart-composite-fixtures.js";

/** Each shader that holds the arithmetic, with the expression of its zero word. */
const SHADERS: [string, string, string][] = [
  ["probe", CHART_COMPOSITE_PROBE_WGSL, "probe_zero.x"],
  ["composite kernel (Dekker path)", chartCompositeWgsl("dekker"), "params.zero"],
  ["composite kernel (fma path)", chartCompositeWgsl("fma"), "params.zero"],
  ["display-view material module (Dekker path)", chartCompositeMaterialWgsl("dekker"), "lattice.zero"],
  ["display-view material module (fma path)", chartCompositeMaterialWgsl("fma"), "lattice.zero"]
];
const TRANSFORMS = ["two_sum", "quick_two_sum", "split", "two_prod_dekker", "d_mul_dekker", "two_prod_fma", "d_mul_fma", "d_add"];
const BOUNDED_VALUES = ["badd", "bsub", "bmul", "bdiv"];

/** The body of `fn name(...)` in a WGSL source, by brace matching. */
function body(source: string, name: string): string {
  const start = source.indexOf(`fn ${name}(`);
  expect(start, `fn ${name}`).toBeGreaterThanOrEqual(0);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(open + 1, i);
  }
  throw new Error(`fn ${name} is not closed`);
}

/** Every binary + − × ÷ in `code` whose innermost enclosing call is not `ob(...)` (binary operators are written with spaces around them). */
function unwrappedOperations(code: string): string[] {
  const stack: string[] = [], found: string[] = [];
  for (let i = 0; i < code.length; i++) {
    const c = code[i]!;
    if (c === "(") stack.push(/([A-Za-z_][A-Za-z_0-9]*)\s*$/u.exec(code.slice(0, i))?.[1] ?? "");
    else if (c === ")") stack.pop();
    else if ("+-*/".includes(c) && code[i - 1] === " " && code[i + 1] === " " && stack.at(-1) !== "ob") found.push(code.slice(Math.max(0, i - 24), i + 24).trim());
  }
  return found;
}

describe("the rounding barrier in the composite chart shaders", () => {
  it.each(SHADERS)("%s: ob() reads the host's zero word, and no placeholder is left", (_name, source, zero) => {
    expect(source).not.toContain("BARRIER_ZERO");
    expect(body(source, "ob").trim()).toBe(`return bitcast<f32>(bitcast<u32>(x) ^ ${zero});`);
  });

  it.each(SHADERS)("%s: every operation of the error-free transforms is wrapped, and every bounded value", (_name, source) => {
    for (const name of TRANSFORMS) expect(unwrappedOperations(body(source, name)), name).toEqual([]);
    for (const name of BOUNDED_VALUES) expect(body(source, name), name).toMatch(/let v = ob\(a\.v [-+*/] b\.v\);/u);
  });

  it("the host's zero words: the display-view lattice uniform holds 0 in the word `lattice.zero` reads", async () => {
    const sensor = { pixelPitchMicrometers: 6, pixelAperture: { kind: "box" as const, samplesPerAxis: 2 } };
    const fixture = await displayViewGpuFixture({ scene: layeredScene(FIXTURE_ASPECT), lens: { prime: 50, fNumber: 8 }, sensor, output: { ...SMALL_FRAME, format: "srgb-8" } },
      { ...SMALL_VIEW, region: { x: 0, y: 0, width: 8, height: 8 } });
    const lattice = displayViewLatticeConstants(fixture.input.signalInput, null, 7);
    expect(DISPLAY_VIEW_LATTICE.zero).toBe(11);
    expect(new Uint32Array(lattice.params)[DISPLAY_VIEW_LATTICE.zero]).toBe(0);
    expect(chartCompositeMaterialWgsl()).toMatch(/offsets: u32, placed: u32, surround: u32, zero: u32,/u);
  });
});
