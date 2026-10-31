// SPDX-License-Identifier: Apache-2.0
import { relative } from "node:path";
import { BaseSequencer, type TestSpecification } from "vitest/node";
import weights from "../shard-weights.json" with { type: "json" };

/*
 * `--shard=k/n` by measured time instead of Vitest's hash order (photivra/photivra#510).
 * Vitest's default cuts the hash-sorted file list into n runs of equal file count, so one
 * part can draw several of the slow numerical files: on the October 2026 CI runs coverage
 * shard 2 took 13.5 of its 15 minutes while shard 1 took 7. This assigns files longest
 * first to the part with the least time so far (the LPT rule), from the per-file times in
 * test/shard-weights.json. A file without a recorded time weighs the median. The split is
 * a pure function of the file list, so every part computes the same partition and each
 * file runs in exactly one part (test/weighted-shard-sequencer.test.ts). Within a part the
 * files start longest first, so the slowest file, which no split can shorten, starts at once.
 */
export function partition(files: readonly string[], count: number, recorded: Readonly<Record<string, number>>): string[][] {
  const known = Object.values(recorded).sort((a, b) => a - b);
  const median = known.length === 0 ? 1 : known[Math.floor(known.length / 2)]!;
  const weighted = [...new Set(files)]
    .map((file) => ({ file, weight: recorded[file] ?? median }))
    .sort((a, b) => b.weight - a.weight || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  const parts = Array.from({ length: count }, () => ({ total: 0, files: [] as string[] }));
  for (const { file, weight } of weighted) {
    let lightest = parts[0]!;
    for (const part of parts) if (part.total < lightest.total) lightest = part;
    lightest.files.push(file);
    lightest.total += weight;
  }
  return parts.map((part) => part.files);
}

export default class WeightedShardSequencer extends BaseSequencer {
  private key(spec: TestSpecification): string {
    return relative(this.ctx.config.root, spec.moduleId).split("\\").join("/");
  }

  override async shard(specs: TestSpecification[]): Promise<TestSpecification[]> {
    const { shard } = this.ctx.config;
    if (!shard) return specs;
    const part = new Set(partition(specs.map((spec) => this.key(spec)), shard.count, weights.files)[shard.index - 1]);
    return specs.filter((spec) => part.has(this.key(spec)));
  }

  override async sort(specs: TestSpecification[]): Promise<TestSpecification[]> {
    if (!this.ctx.config.shard) return super.sort(specs);
    const recorded: Readonly<Record<string, number>> = weights.files;
    return [...specs].sort((a, b) => (recorded[this.key(b)] ?? 0) - (recorded[this.key(a)] ?? 0));
  }
}
