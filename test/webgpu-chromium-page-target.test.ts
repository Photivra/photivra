// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { awaitPageTarget, type DevToolsTarget } from "./webgpu/chromium.js";

const page: DevToolsTarget = { type: "page", webSocketDebuggerUrl: "ws://127.0.0.1:1/devtools/page/1" };
const noWait = async (): Promise<void> => {};

describe("awaitPageTarget (test/webgpu/chromium.ts)", () => {
  it("returns the page target once Chromium lists it, after an empty list and a refused connection", async () => {
    const replies: (() => Promise<DevToolsTarget[]>)[] = [
      async (): Promise<DevToolsTarget[]> => [],
      async (): Promise<DevToolsTarget[]> => { throw new Error("fetch failed"); },
      async (): Promise<DevToolsTarget[]> => [{ type: "browser", webSocketDebuggerUrl: "ws://127.0.0.1:1/devtools/browser/0" }],
      async (): Promise<DevToolsTarget[]> => [page]
    ];
    let calls = 0;
    const waits: number[] = [];
    const target = await awaitPageTarget(() => replies[calls++]!(), 10, 25, async (ms) => { waits.push(ms); });
    expect(target).toBe(page);
    expect(calls).toBe(4);
    expect(waits).toEqual([25, 25, 25]);
  });

  it("gives up after the attempt budget with the elapsed time and the last error", async () => {
    let calls = 0;
    await expect(awaitPageTarget(async () => { calls++; throw new Error("ECONNREFUSED"); }, 3, 100, noWait))
      .rejects.toThrow("Chromium exposed no page target within 300 ms. Last error: ECONNREFUSED");
    expect(calls).toBe(3);
  });
});
