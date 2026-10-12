// SPDX-License-Identifier: Apache-2.0

/**
 * Internal host-yield cadence for native tile loops (#275). Execution chunks stay small for bounded
 * memory and exact tile identity, but the host `yieldControl` callback is awaited only after the
 * elapsed work since the previous yield reaches a time budget, and always after the final tile.
 * Cadence changes only when the host event loop runs: tile requests, absolute CFA/seed indexing and
 * every output value are independent of it. Not a root export.
 */

/** Default work budget between host yields: about half of a 60 Hz frame. */
export const HOST_YIELD_BUDGET_MILLISECONDS = 8;

export interface HostYieldCadence {
  /** Yield once at least this much monotonic time has elapsed since the previous yield. 0 yields after every tile. */
  readonly budgetMilliseconds: number;
  /** Monotonic clock in milliseconds. */
  readonly now: () => number;
}

export const DEFAULT_HOST_YIELD_CADENCE: HostYieldCadence = Object.freeze({
  budgetMilliseconds: HOST_YIELD_BUDGET_MILLISECONDS,
  now: (): number => performance.now()
});

export interface HostYieldGate {
  /** Restart the budget, e.g. at run start and after each host yield settles. */
  restart(): void;
  /** True once the budget since the last restart is spent. */
  due(): boolean;
}

export function createHostYieldGate(cadence: HostYieldCadence = DEFAULT_HOST_YIELD_CADENCE): HostYieldGate {
  const {budgetMilliseconds, now} = cadence;
  let since = now();
  return {
    restart(): void { since = now(); },
    due(): boolean { return budgetMilliseconds <= 0 || now() - since >= budgetMilliseconds; }
  };
}
