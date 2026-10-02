import { describe, expect, it } from "vitest";

import { freezeOwnedData } from "../src/core/owned-data.js";

describe("engine-owned data freezing", () => {
  it("freezes mutable descendants of a shallow-frozen parent without replacing identities", () => {
    const child = { samples: [1, 2], evidence: { source: "owned" } };
    const parent = Object.freeze({ child });

    expect(freezeOwnedData(parent)).toBe(parent);
    expect(parent.child).toBe(child);
    expect(Object.isFrozen(child)).toBe(true);
    expect(Object.isFrozen(child.samples)).toBe(true);
    expect(Object.isFrozen(child.evidence)).toBe(true);
    expect(() => child.samples.push(3)).toThrow(TypeError);
    expect(() => { child.evidence.source = "changed"; }).toThrow(TypeError);
  });

  it("accepts shared acyclic descendants, empty containers and primitive leaves", () => {
    const shared = { value: null };
    const tree = { first: shared, second: shared, empty: [], leaves: [null, undefined, false, 0, ""] };

    expect(freezeOwnedData(tree)).toBe(tree);
    expect(tree.first).toBe(tree.second);
    expect(Object.isFrozen(shared)).toBe(true);
    expect(Object.isFrozen(tree.empty)).toBe(true);
    expect(Object.isFrozen(tree.leaves)).toBe(true);
    for (const value of tree.leaves) expect(freezeOwnedData(value)).toBe(value);
    expect(freezeOwnedData(tree)).toBe(tree);
  });
});
