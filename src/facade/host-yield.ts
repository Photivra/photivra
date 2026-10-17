// SPDX-License-Identifier: Apache-2.0

/**
 * Host yield for the capture facade's cooperative tasks. Browsers clamp nested `setTimeout(…, 0)` to
 * at least 4 ms (WHATWG HTML timers, nesting level above 5), so a task that yields every few
 * milliseconds through timers can sit idle for a large share of its run time. These yields are not
 * clamped. The first available mechanism is used:
 *
 * 1. `scheduler.yield()` (Prioritized Task Scheduling API), which also keeps the task's priority;
 * 2. a `MessageChannel` message, a new task without the timer clamp (one channel per yield, closed after
 *    delivery, so no port keeps a Node process alive);
 * 3. `setImmediate` (Node and some other non-browser hosts);
 * 4. `setTimeout(…, 0)` as the last resort.
 *
 * Only global feature detection is used; nothing is imported, so the browser package surface is unchanged.
 * The yield changes scheduling only, never results.
 */

type YieldGlobals = {
  scheduler?: { yield?: () => Promise<unknown> };
  MessageChannel?: new () => { port1: { onmessage: ((event: unknown) => void) | null; close(): void }; port2: { postMessage(message: unknown): void } };
  setImmediate?: (callback: () => void) => unknown;
};

/** Mechanism chosen by {@link createHostYield}, for diagnostics and tests. */
export type HostYieldMechanism = "scheduler.yield" | "message-channel" | "set-immediate" | "set-timeout";

/** Returns a function that yields to the host event loop once per call, and the mechanism it uses. */
export function createHostYield(host: object = globalThis): { mechanism: HostYieldMechanism; yieldControl: () => Promise<void> } {
  const g = host as YieldGlobals;
  const scheduler = g.scheduler;
  if (scheduler !== undefined && typeof scheduler.yield === "function") {
    return { mechanism: "scheduler.yield", yieldControl: async (): Promise<void> => { await scheduler.yield!.call(scheduler); } };
  }
  const Channel = g.MessageChannel;
  if (typeof Channel === "function") {
    return { mechanism: "message-channel", yieldControl: () => new Promise<void>((resolve) => {
      const channel = new Channel();
      channel.port1.onmessage = (): void => { channel.port1.close(); resolve(); };
      channel.port2.postMessage(undefined);
    }) };
  }
  const immediate = g.setImmediate;
  if (typeof immediate === "function") {
    return { mechanism: "set-immediate", yieldControl: () => new Promise<void>((resolve) => { immediate.call(host, resolve); }) };
  }
  return { mechanism: "set-timeout", yieldControl: () => new Promise<void>((resolve) => { setTimeout(resolve, 0); }) };
}
