// SPDX-License-Identifier: Apache-2.0
import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { partition } from "./helpers/weighted-shard-sequencer.js";
import weights from "./shard-weights.json" with { type: "json" };

describe("weighted coverage shards", () => {
  const files = readdirSync("test").filter((name) => /\.test\.(ts|mjs)$/.test(name)).map((name) => `test/${name}`);

  it("runs every test file in exactly one part, for every part count CI uses", () => {
    for (const count of [2, 4, 6]) {
      const parts = partition(files, count, weights.files);
      expect(parts).toHaveLength(count);
      expect(parts.flat().sort()).toEqual([...files].sort());
    }
  });

  it("gives the same partition whatever order the files come in", () => {
    expect(partition([...files].reverse(), 6, weights.files)).toEqual(partition(files, 6, weights.files));
  });

  it("assigns longest first to the lightest part", () => {
    const parts = partition(["a", "b", "c", "d", "e"], 2, { a: 5, b: 4, c: 3, d: 3, e: 1 });
    expect(parts).toEqual([["a", "d"], ["b", "c", "e"]]);
  });

  it("weighs a file without a recorded time as the median", () => {
    expect(partition(["new", "a", "b", "c"], 2, { a: 1, b: 2, c: 9 })).toEqual([["c"], ["b", "new", "a"]]);
  });
});
