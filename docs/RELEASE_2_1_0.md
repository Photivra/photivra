# Release 2.1.0 (draft)

A minor release: additive features and fixes only. This record is a draft; the coordinator completes it.

## Fixed: `simulateCapture` cancellation in Web Workers

**Problem.** 2.0.0 (#328) made the capture facade yield to the host with `scheduler.yield()` first, to avoid the browser's ≥ 4 ms clamp on nested `setTimeout(…, 0)`. In a module Web Worker that cancels a capture by posting a message that aborts its `AbortSignal`, the message was not handled until the capture finished.

**Cause, from the specification.** WICG, *Prioritized Task Scheduling* (Community Group draft, https://wicg.github.io/scheduling-apis/; source checked at WICG/scheduling-apis commit `0e7fece`, W3C Software and Document License):

- `scheduler.yield()`: "The priority of the continuation … [is] inherited from the originating task. … If the originating task did not have a priority, then "user-visible" is used." (§ The `Scheduler` Interface).
- "Continuations have a higher effective priority than tasks with the same TaskPriority." A user-visible continuation has effective priority 3, above a user-visible task (2) (§ Task and Continuation Priorities; effective priority table).
- The event-loop patch leaves the choice between scheduler and other task queues implementation-defined, but states the intent that "user-visible" continuations "are typically considered to be more important" than most other event loop tasks, and suggests running effective priority 3 and above "higher than most other task sources" (§ Event loop: processing model, note).
- The explainer (`explainers/yield-and-continuation.md`, "Preventing Task Starvation by Continuations") names the starvation risk and proposes only a duration bound, "e.g. schedule the next continuation as a normal task after one second of recursive continuations"; its "denylist" sketch lists self-directed `postMessage()` and `MessageChannel` among sources continuations may run ahead of.

A capture yields every ~8 ms, so the continuations keep the worker's `message` task from running.

**Fix.** `src/facade/host-yield.ts` yields with a `MessageChannel` message first, else `setImmediate`, else `setTimeout`; `scheduler.yield()` is no longer used. A `MessageChannel` message is a new task on the HTML posted message task source, the same source as worker and port `message` events (WHATWG HTML, § Web messaging / § Task sources, https://html.spec.whatwg.org/multipage/), and tasks of one source run in queue order, so a cancel queued before the next yield runs first. Timers are not involved, so the 4 ms nesting clamp (WHATWG HTML, § Timers) does not apply. This is the only place in `src/` that picks a host yield mechanism; the other tasks await the caller's `yieldControl`.

**Evidence.**

- Output unchanged: yields change scheduling only. The five hash locks and the `simulateCapture` digest baseline (`test/simulate-capture-integration.test.ts`) pass unchanged. Built `dist` digests (SHA-256 of image samples, RAW codes and JPEG bytes; 24 × 16 sRGB and 16 × 16 JPEG captures) are identical for 2.0.0 taking its `scheduler.yield` path (a `scheduler.yield` shim in Node) and this change: `a4788e54b93e4d69…`, `b2177454c2e5b9ea…`.
- Regression tests (fail on 2.0.0, pass now): `test/host-yield.test.ts` ("does not starve queued tasks when the host's scheduler.yield runs continuations first": a fake `scheduler.yield` that resolves on microtasks only; a queued `MessageChannel` message must run within 2 yields) and `test/simulate-capture.test.ts` ("sees an abort queued as a separate task even when the host has a continuation-priority scheduler.yield": an abort queued with `setTimeout` after the first RAW tile must stop the capture within 4 tiles; on 2.0.0 the capture completes).
- Chromium 141.0.7390.37 (headless, Playwright), module worker, 4-vCPU Intel Xeon 2.80 GHz, built `dist` of origin/main vs this change. A 128 × 128 capture starts; after 100 ms the page posts a cancel and a 16 × 16 request. Three rounds:

| Build | 128 px run | 16 px result after cancel |
| --- | --- | --- |
| 2.0.0, `scheduler.yield` present | completed, 258 tiles, 2.12–2.34 s | 2.13–2.35 s |
| 2.0.0, `scheduler` hidden (MessageChannel path) | aborted after 1 tile | 0.17–0.21 s |
| this change | aborted after 1 tile | 0.15–0.20 s |

  Uncancelled 128 × 128 capture, six alternating rounds: median 2.17 s (2.0.0) vs 2.16 s (this change), within run-to-run spread (1.97–2.50 s); no throughput change.
