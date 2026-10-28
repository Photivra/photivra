// SPDX-License-Identifier: Apache-2.0
/**
 * The WebGPU suites' browser cleanup (test/webgpu/chromium.ts, `cleanupBrowser`): the owner's M5 Pro run of October 27, 2026 failed 5
 * acceptance-harness cases and the rollout suite with `ENOTEMPTY` from removing the Chromium profile right after SIGKILL. The cleanup
 * now waits for the process to exit before removing the profile, removes it with retries, and never throws. Tested with a fake child
 * process that exits late and a profile that cannot be removed while it runs.
 */
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cleanupBrowser, type BrowserProcess } from "./webgpu/chromium.js";

/** A child process that exits `delayMs` after SIGKILL (or never, with `delayMs` null). */
interface FakeChild extends BrowserProcess { exitCode: number | null; signalCode: NodeJS.Signals | null; killed: NodeJS.Signals[]; exited: boolean }
function lateChild(delayMs: number | null): FakeChild {
  const events = new EventEmitter();
  const child: FakeChild = {
    exitCode: null as number | null, signalCode: null as NodeJS.Signals | null, killed: [] as NodeJS.Signals[], exited: false,
    kill(signal: NodeJS.Signals): boolean {
      child.killed.push(signal);
      if (delayMs !== null) setTimeout(() => { child.signalCode = signal; child.exited = true; events.emit("exit"); }, delayMs);
      return true;
    },
    once(event: "exit", listener: () => void): unknown { return events.once(event, listener); }
  };
  return child;
}

describe("browser cleanup of the WebGPU suites (test/webgpu/chromium.ts)", () => {
  it("waits for the browser to exit after SIGKILL before removing the profile, then removes it", async () => {
    const child = lateChild(150), order: string[] = [], logs: string[] = [];
    let removedAfterExit: boolean | null = null;
    await cleanupBrowser(child, async () => { order.push("server"); }, "/profile", {
      remove: (path) => { order.push("remove " + path); removedAfterExit = child.exited; }, log: (m) => logs.push(m) });
    expect(child.killed).toEqual(["SIGKILL"]);
    expect(removedAfterExit).toBe(true);
    expect(order).toEqual(["server", "remove /profile"]);
    expect(logs).toEqual([]);
  });

  it("the default removal (rmSync, recursive, five retries 200 ms apart) removes a non-empty profile once the late process has exited", async () => {
    const profile = mkdtempSync(join(tmpdir(), "photivra-webgpu-test-")), child = lateChild(100), logs: string[] = [];
    mkdirSync(join(profile, "Default"));
    writeFileSync(join(profile, "Default", "Preferences"), "{}");
    await cleanupBrowser(child, async () => undefined, profile, { log: (m) => logs.push(m) });
    expect(existsSync(profile)).toBe(false);
    expect(logs).toEqual([]);
  });

  it("never throws: a removal failure (ENOTEMPTY), a server that fails to close and a process that never exits are logged", async () => {
    const child = lateChild(null), logs: string[] = [];
    const enotempty = Object.assign(new Error("ENOTEMPTY, Directory not empty: /profile"), { code: "ENOTEMPTY" });
    await expect(cleanupBrowser(child, async () => { throw new Error("server busy"); }, "/profile", {
      exitTimeoutMs: 50, remove: () => { throw enotempty; }, log: (m) => logs.push(m) })).resolves.toBeUndefined();
    expect(logs).toHaveLength(3);
    expect(logs[0]).toMatch(/did not exit within 50 ms/u);
    expect(logs[1]).toMatch(/server busy/u);
    expect(logs[2]).toMatch(/ENOTEMPTY.*left in place|left in place.*ENOTEMPTY/u);
  });

  it("a browser that already exited is not killed again", async () => {
    const child = lateChild(0);
    child.exitCode = 0;
    let removed = false;
    await cleanupBrowser(child, async () => undefined, "/profile", { remove: () => { removed = true; }, log: () => undefined });
    expect(child.killed).toEqual([]);
    expect(removed).toBe(true);
  });
});
