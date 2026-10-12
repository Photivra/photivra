// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { approximationResult, calculatedResult, InvalidScientificResultError } from "../src/index.js";

/** Independent copy of the diagnostic path walk: the error message contract that must not change. */
function referencePath(value: unknown, path = "value", seen = new WeakSet<object>()): string | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? undefined : path;
  if (typeof value !== "object" || value === null || seen.has(value)) return undefined;
  seen.add(value);
  if (Array.isArray(value)) {
    let found: string | undefined;
    value.forEach((entry, index) => { found ??= referencePath(entry, `${path}[${index}]`, seen); });
    return found;
  }
  for (const [key, entry] of Object.entries(value)) {
    const found = referencePath(entry, `${path}.${key}`, seen);
    if (found !== undefined) return found;
  }
  return undefined;
}

function thrown(value: unknown): unknown {
  try { calculatedResult(value, "finite-test", "1"); } catch (error) { return error; }
  return undefined;
}

describe("calculation result finite-number validation", () => {
  it.each([
    ["top level", NaN, "value"],
    ["nested arrays and records", { a: { b: [1, 2, { c: NaN }] } }, "value.a.b[2].c"],
    ["first failure in key order", { a: 1, b: Infinity, c: -Infinity }, "value.b"],
    ["nested result envelope", { inner: approximationResult({ x: [1, 2] }, "m", "1", ["a"]), tail: { y: [0, -Infinity] } }, "value.tail.y[1]"],
    ["sparse array holes skipped", [, , NaN], "value[2]"], // eslint-disable-line no-sparse-arrays
    ["typed-array entries", { t: Float64Array.of(1, 2, NaN) }, "value.t.2"]
  ])("throws the unchanged error type and path for %s", (_name, value, path) => {
    const error = thrown(value);
    expect(error).toBeInstanceOf(InvalidScientificResultError);
    expect((error as Error).message).toBe(`Calculation produced a non-finite number at ${path}.`);
  });

  it("reports the first path through shared references and skips cycles", () => {
    const shared = { x: NaN }, cyclic: Record<string, unknown> = { n: 1 };
    cyclic.self = cyclic; cyclic.bad = -Infinity;
    expect((thrown({ a: shared, b: shared }) as Error).message).toBe("Calculation produced a non-finite number at value.a.x.");
    expect((thrown({ c: cyclic }) as Error).message).toBe("Calculation produced a non-finite number at value.c.bad.");
    const finite: Record<string, unknown> = { n: 1, list: [1, 2] };
    finite.self = finite;
    expect(calculatedResult({ a: finite, b: finite }, "finite-test", "1").value.a).toBe(finite);
  });

  it("matches the diagnostic walk on seeded random nested values", () => {
    let state = 0x2750_0001;
    const random = (): number => { state = (Math.imul(state, 1664525)+1013904223) >>> 0; return state/2**32; };
    const leaf = (): unknown => { const r = random();
      return r < .03 ? NaN : r < .05 ? Infinity : r < .07 ? -Infinity : r < .5 ? random()*1e6-5e5 : r < .7 ? "s" : r < .8 ? null : true; };
    const pool: object[] = [];
    const tree = (depth: number): unknown => {
      const r = random();
      if (depth > 4 || r < .35) return leaf();
      if (r < .4 && pool.length > 0) return pool[Math.floor(random()*pool.length)];
      const node: unknown = r < .7 ? Array.from({ length: Math.floor(random()*5) }, () => tree(depth+1))
        : Object.fromEntries(Array.from({ length: Math.floor(random()*5) }, (_, i) => [`k${i}`, tree(depth+1)]));
      pool.push(node as object);
      return node;
    };
    let failures = 0;
    for (let trial = 0; trial < 400; trial++) {
      pool.length = 0;
      const value = tree(0), path = referencePath(value), error = thrown(value);
      if (path === undefined) { expect(error).toBeUndefined(); continue; }
      failures++;
      expect(error).toBeInstanceOf(InvalidScientificResultError);
      expect((error as Error).message).toBe(`Calculation produced a non-finite number at ${path}.`);
    }
    expect(failures).toBeGreaterThan(50);
  });
});
