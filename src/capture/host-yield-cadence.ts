// SPDX-License-Identifier: Apache-2.0

/**
 * Internal: decides how often native tile loops yield to the host (browser) event loop.
 *
 * Tiles stay small, for bounded memory and exact tile identity. But the host's `yieldControl`
 * callback is awaited only once the work since the last yield reaches a time budget, and always
 * after the final tile. This only changes when the host gets to run. Tile requests, absolute CFA
 * (colour filter array) and noise-seed indexing, and every output value are unaffected.
 * Not exported from the package.
 */

/** Default work budget between host yields: about half of a 60 Hz frame. */
export const HOST_YIELD_BUDGET_MILLISECONDS = 8;

export interface HostYieldCadence {
  /** Yield once at least this many milliseconds (monotonic clock) have passed since the last yield. 0 yields after every tile. */
  readonly budgetMilliseconds: number;
  /** Monotonic clock in milliseconds. */
  readonly now: () => number;
}

export const DEFAULT_HOST_YIELD_CADENCE: HostYieldCadence = /* @__PURE__ */ Object.freeze({
  budgetMilliseconds: HOST_YIELD_BUDGET_MILLISECONDS,
  now: (): number => performance.now()
});

export interface HostYieldGate {
  /** Restarts the budget, for example at the start of a run and after each host yield finishes. */
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
