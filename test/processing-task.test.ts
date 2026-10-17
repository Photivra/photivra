// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { createUnsharpMaskTask, InvalidConfigurationError, InvalidScientificInputError, PROCESSING_DEFAULT_MAXIMUM_WORKING_BYTES, type ProcessingTask } from "../src/index.js";
import { createProcessingTask } from "../src/processing/processing-task.js";
import { rgbImage } from "./helpers/processing-fixture.js";

const image = rgbImage(16, 16, (x, y) => (x + y) / 32);

describe("processing task contract", () => {
  it("is single-use, transfers output once and reports progress per row", async () => {
    const seen: number[] = [];
    const task = createUnsharpMaskTask({ image, radiusSigmaPixels: 1, amount: 1 }, { yieldControl: async () => {}, onProgress: (p) => seen.push(p.completedTileCount) });
    expect(task.state).toBe("ready"); expect(task.totalTileCount).toBe(64); expect(task.estimatedWorkingBytes).toBe(16 * 16 * 36);
    await task.run();
    expect(seen).toEqual(Array.from({ length: 64 }, (_, i) => i + 1));
    await expect(task.run()).rejects.toThrow(InvalidConfigurationError);
    task.takeOutput(); expect(task.state).toBe("transferred");
    expect(() => task.takeOutput()).toThrow(InvalidConfigurationError);
  });

  it("cancels between rows, disposes, and fails closed on non-finite input", async () => {
    let task = createUnsharpMaskTask({ image, radiusSigmaPixels: 1, amount: 1 }, { yieldControl: async () => { task.cancel(); } });
    await expect(task.run()).rejects.toThrow(/aborted/u);
    expect(task.state).toBe("cancelled"); expect(() => task.takeOutput()).toThrow(InvalidConfigurationError);
    const disposed = createUnsharpMaskTask({ image, radiusSigmaPixels: 1, amount: 1 }, { yieldControl: async () => {} });
    disposed.dispose(); expect(disposed.state).toBe("disposed"); await expect(disposed.run()).rejects.toThrow(InvalidConfigurationError);
    const bad = rgbImage(4, 4, () => 0.5); bad.data[7] = Number.NaN;
    task = createUnsharpMaskTask({ image: bad, radiusSigmaPixels: 1, amount: 1 }, { yieldControl: async () => {} });
    await expect(task.run()).rejects.toThrow(InvalidScientificInputError); expect(task.state).toBe("failed");
  });

  it("bounds working memory and validates the provider", () => {
    expect(PROCESSING_DEFAULT_MAXIMUM_WORKING_BYTES).toBe(2 ** 30);
    expect(() => createUnsharpMaskTask({ image, radiusSigmaPixels: 1, amount: 1, maximumWorkingBytes: 1000 }, { yieldControl: async () => {} }))
      .toThrow(/exceeds maximumWorkingBytes/u);
    expect(() => createUnsharpMaskTask({ image, radiusSigmaPixels: 1, amount: 1 }, {} as never)).toThrow(InvalidConfigurationError);
    expect(() => createUnsharpMaskTask({ image: { ...image, data: new Float64Array(768) as unknown as Float32Array }, radiusSigmaPixels: 1, amount: 1 },
      { yieldControl: async () => {} })).toThrow(InvalidConfigurationError);
  });

  it("yields on the time-budget cadence without changing output, and rejects progress plan drift", async () => {
    let clock = 0, yields = 0;
    const make = (budget: number): ProcessingTask<number> => createProcessingTask({ provider: { yieldControl: async () => { yields++; } }, totalTileCount: 10, estimatedWorkingBytes: 0,
      maximumWorkingBytes: 1, cadence: { budgetMilliseconds: budget, now: () => (clock += 1) },
      body: function* () { for (let i = 0; i < 10; i++) yield; return 42; } });
    const every = make(0); await every.run(); expect(yields).toBe(11); expect(every.takeOutput()).toBe(42);
    yields = 0; const sparse = make(1000); await sparse.run(); expect(yields).toBe(1); expect(sparse.takeOutput()).toBe(42);
    const drift = createProcessingTask({ provider: { yieldControl: async () => {} }, totalTileCount: 3, estimatedWorkingBytes: 0, maximumWorkingBytes: 1,
      body: function* () { yield; return 0; } });
    await expect(drift.run()).rejects.toThrow(/progress accounting/u);
  });
});
