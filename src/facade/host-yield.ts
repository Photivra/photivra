// SPDX-License-Identifier: Apache-2.0

/**
 * Host yield for the capture facade's cooperative tasks. Browsers clamp nested `setTimeout(…, 0)` to
 * at least 4 ms (WHATWG HTML timers, nesting level above 5), so a task that yields every few
 * milliseconds through timers can sit idle for a large share of its run time. The first available
 * mechanism is used:
 *
 * 1. a `MessageChannel` message, a new task without the timer clamp (one channel per yield, closed after
 *    delivery, so no port keeps a Node process alive);
 * 2. `setImmediate` (Node and some other non-browser hosts);
 * 3. `setTimeout(…, 0)` as the last resort.
 *
 * Every yield must let tasks that are already queued run first, so that a caller's cancel message (for
 * example a Web Worker `message` event that aborts the capture's `AbortSignal`) is handled at the next
 * yield. A `MessageChannel` message is queued on the HTML posted message task source, the same source as
 * worker and port `message` events, and tasks from one source run in the order they were queued.
 *
 * `scheduler.yield()` is deliberately not used (engine 2.0.0 used it first). Its continuation inherits
 * the "user-visible" priority and gets a higher effective priority than ordinary tasks; the WICG
 * Prioritized Task Scheduling draft (§ "Task and Continuation Priorities", effective priority table;
 * § "Event loop: processing model" note) intends such continuations to run ahead of most other task
 * sources, and its explainer ("Preventing Task Starvation by Continuations") only bounds that by
 * duration. A capture that yields every 8 ms through `scheduler.yield()` therefore starved a worker's
 * cancel message until the capture finished (measured in Chromium).
 *
 * Only global feature detection is used; nothing is imported, so the browser package surface is unchanged.
 * The yield changes scheduling only, never results.
 */

type YieldGlobals = {
  MessageChannel?: new () => { port1: { onmessage: ((event: unknown) => void) | null; close(): void }; port2: { postMessage(message: unknown): void } };
  setImmediate?: (callback: () => void) => unknown;
};

/** Mechanism chosen by {@link createHostYield}, for diagnostics and tests. */
export type HostYieldMechanism = "message-channel" | "set-immediate" | "set-timeout";

/** Returns a function that yields to the host event loop once per call, and the mechanism it uses. */
export function createHostYield(host: object = globalThis): { mechanism: HostYieldMechanism; yieldControl: () => Promise<void> } {
  const g = host as YieldGlobals;
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
