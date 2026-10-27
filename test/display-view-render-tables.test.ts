// SPDX-License-Identifier: Apache-2.0
/**
 * #442: the display view's per-render tables. The slot offset tables give the integers the render loop computed with a
 * modulo and a division per site read, and the flat candidate tables hold the same typed arrays as the nested per-phase
 * tables at phase·2 + candidate (·3 + channel), with every phase required to have the same number of candidates (1 or 2).
 * The renders themselves are locked byte for byte by the hash locks in display-view.test.ts.
 */
import { describe, expect, it } from "vitest";
import { InvalidConfigurationError } from "../src/core/configuration-error.js";
import { ahdCandidateKernels, displayViewSlotOffsets, flatDisplayViewCandidateTables, type DisplayViewKernelTap } from "../src/facade/display-view.js";

describe("display view slot offsets (#442)", () => {
  it("are (slot mod side) − reach and ⌊slot / side⌋ − reach for every slot of the window", () => {
    for (let reach = 1; reach <= 5; reach++) {
      const side = 2 * reach + 1, { dx, dy } = displayViewSlotOffsets(reach);
      expect(dx).toBeInstanceOf(Int32Array);
      expect(dy).toBeInstanceOf(Int32Array);
      expect(dx.length).toBe(side * side);
      expect(dy.length).toBe(side * side);
      for (let slot = 0; slot < side * side; slot++) {
        expect(dx[slot]).toBe((slot % side) - reach);
        expect(dy[slot]).toBe(Math.floor(slot / side) - reach);
        // The inverse of the render's slot numbering, (dy + reach)·side + dx + reach.
        expect((dy[slot]! + reach) * side + dx[slot]! + reach).toBe(slot);
      }
    }
  });
});

/** The nested tables as renderDisplayView builds them from candidates[phase][candidate][channel] tap lists. */
interface Nested { slots: Int32Array[][][]; weights: Float64Array[][][]; dense: Float64Array[][]; list: Int32Array[][] }
function nested(candidates: DisplayViewKernelTap[][][][], reach: number): Nested {
  const side = 2 * reach + 1, slotsCount = side * side, slotOf = (t: DisplayViewKernelTap): number => (t.dy + reach) * side + t.dx + reach;
  const slots = candidates.map((phase) => phase.map((candidate) => candidate.map((list) => Int32Array.from(list, slotOf))));
  const weights = candidates.map((phase) => phase.map((candidate) => candidate.map((list) => Float64Array.from(list, (t) => t.weight))));
  const dense = candidates.map((phase) => phase.map((candidate) => {
    const out = new Float64Array(3 * slotsCount);
    candidate.forEach((list, c) => { for (const t of list) out[c * slotsCount + slotOf(t)] = out[c * slotsCount + slotOf(t)]! + t.weight; });
    return out;
  }));
  const list = dense.map((phase) => phase.map((d) => Int32Array.from({ length: slotsCount }, (_, s) => s).filter((s) => d[s] !== 0 || d[slotsCount + s] !== 0 || d[2 * slotsCount + s] !== 0)));
  return { slots, weights, dense, list };
}
const ahd = (): DisplayViewKernelTap[][][][] => [0, 1, 2, 3].map((p) => ahdCandidateKernels(p % 2, Math.floor(p / 2)));
/** One candidate per phase (as the bilinear demosaic): the centre site in every channel. */
const single = (): DisplayViewKernelTap[][][][] => [0, 1, 2, 3].map((p) => [[0, 1, 2].map((c) => [{ dx: 0, dy: 0, weight: 1 + p + c / 4 }, { dx: 1, dy: -1, weight: 0.5 }])]);

describe("flat display view candidate tables (#442)", () => {
  it("hold the nested tables' own typed arrays at phase·2 + candidate and ·3 + channel", () => {
    for (const [name, candidates, count] of [["AHD", ahd(), 2], ["one candidate", single(), 1]] as const) {
      const t = nested(candidates as DisplayViewKernelTap[][][][], 3), flat = flatDisplayViewCandidateTables(t.slots, t.weights, t.dense, t.list);
      expect(flat.count, name).toBe(count);
      for (let p = 0; p < 4; p++) for (let d = 0; d < count; d++) {
        expect(flat.denseAt[p * 2 + d]).toBe(t.dense[p]![d]);
        expect(flat.listAt[p * 2 + d]).toBe(t.list[p]![d]);
        for (let c = 0; c < 3; c++) {
          expect(flat.slotsAt[(p * 2 + d) * 3 + c]).toBe(t.slots[p]![d]![c]);
          expect(flat.weightsAt[(p * 2 + d) * 3 + c]).toBe(t.weights[p]![d]![c]);
        }
      }
      // Nothing else is stored (with one candidate the odd entries stay empty and are never read).
      expect(flat.denseAt.filter((a) => a !== undefined)).toHaveLength(4 * count);
      expect(flat.slotsAt.filter((a) => a !== undefined)).toHaveLength(12 * count);
    }
  });

  it("refuse phases with different candidate counts, a count other than 1 or 2, and candidates without three channels", () => {
    const build = (candidates: DisplayViewKernelTap[][][][]): (() => unknown) => { const t = nested(candidates, 3); return () => flatDisplayViewCandidateTables(t.slots, t.weights, t.dense, t.list); };
    const mixed = ahd(); mixed[2] = [mixed[2]![0]!];
    expect(build(mixed)).toThrow(InvalidConfigurationError);
    const three = ahd().map((phase) => [...phase, phase[0]!]);
    expect(build(three)).toThrow(InvalidConfigurationError);
    expect(build([[], [], [], []])).toThrow(InvalidConfigurationError);
    expect(build(ahd().slice(0, 3))).toThrow(InvalidConfigurationError);
    const twoChannels = ahd(); twoChannels[1] = twoChannels[1]!.map((candidate) => candidate.slice(0, 2));
    expect(build(twoChannels)).toThrow(InvalidConfigurationError);
  });
});
