// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { createHostYield } from "../src/facade/host-yield.js";

describe("capture facade host yield", () => {
  it("prefers scheduler.yield, then MessageChannel, then setImmediate, then setTimeout", async () => {
    let schedulerCalls = 0;
    const withScheduler = createHostYield({ scheduler: { yield: async () => { schedulerCalls++; } }, MessageChannel, setImmediate });
    expect(withScheduler.mechanism).toBe("scheduler.yield");
    await withScheduler.yieldControl();
    expect(schedulerCalls).toBe(1);

    const withChannel = createHostYield({ MessageChannel, setImmediate });
    expect(withChannel.mechanism).toBe("message-channel");
    await withChannel.yieldControl();

    let immediateCalls = 0;
    const withImmediate = createHostYield({ setImmediate: (callback: () => void) => { immediateCalls++; return setImmediate(callback); } });
    expect(withImmediate.mechanism).toBe("set-immediate");
    await withImmediate.yieldControl();
    expect(immediateCalls).toBe(1);

    const fallback = createHostYield({});
    expect(fallback.mechanism).toBe("set-timeout");
    await fallback.yieldControl();
  });

  it("returns to the event loop: a task queued before the yield runs before it resolves", async () => {
    for (const host of [{ MessageChannel }, { setImmediate }, {}]) {
      const { yieldControl } = createHostYield(host);
      const order: string[] = [];
      setTimeout(() => order.push("queued task"), 0);
      // A timer queued earlier may still be pending after one macrotask; repeat until it runs (bounded).
      for (let i = 0; i < 50 && order.length === 0; i++) await yieldControl();
      order.push("after yield");
      expect(order).toEqual(["queued task", "after yield"]);
    }
  });

  it("uses an unclamped yield on this host (Node exposes MessageChannel globally)", () => {
    expect(createHostYield().mechanism).toBe(typeof (globalThis as { scheduler?: { yield?: unknown } }).scheduler?.yield === "function" ? "scheduler.yield" : "message-channel");
  });
});
