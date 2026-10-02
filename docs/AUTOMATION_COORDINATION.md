# Public-engine automation coordination

Release context: **package 1.0.1 candidate / root API 1.0.1**. Subsystem/model versions and dated introduction or measurement records below are independent historical identities; they are not distribution versions. See [developer navigation](DEVELOPERS.md) and [release contract](RELEASE_1_0_1.md).

This document coordinates the two recurring automation lanes that work only in the public
`Photivra/photivra` repository. It is process guidance, not a scientific roadmap. Open issues and
the repository's scientific/API documentation remain authoritative for product and model semantics.

## Lanes

- **Engine Science** (`engine-science`) owns scientific/foundational roadmap work.
- **Export & Performance** (`export-performance`) owns `SimulatedCapture`, TIFF/DNG export,
  measured performance work, and CI-efficiency work.

Each roadmap issue should contain a short **Automation coordination** block identifying its owner
lane, dependencies, and cross-lane handoff. That block coordinates work; it does not override the
issue's scientific acceptance criteria.

## Control plane

Automation coordination state lives on the repository's dedicated `automation-state` branch:

- `coordination/registry.v1.json`
- `coordination/registry.schema.json`

The control branch belongs to this public repository. No private repository or other project is a
coordination dependency.

Before any automation-owned project write:

1. Read current `main`, open PRs, recent merges, the target issue, and applicable `AGENTS.md` /
   scientific/API documentation.
2. Read the registry from `automation-state` together with its exact blob SHA.
3. Acquire the lane mutex and every shared resource required for the intended mutation in one
   SHA-guarded registry update.
4. If the registry changed, re-read and retry the compare-and-swap at most three times.
5. Never steal an unexpired lease. A lease may be reclaimed only after its `expiresAt` is at
   least two minutes in the past.
6. Use a lease duration no longer than 55 minutes. If work cannot safely finish inside that
   window, stop at a clean boundary and continue on the next scheduled run rather than holding a
   resource indefinitely.
7. Release every registry entry carrying the exact `leaseId` when the task is merged, abandoned,
   or safely stopped.

If the registry cannot be read or validated, automation may inspect and plan but must not mutate
the repository.

## Resource names

Every mutating run acquires exactly one lane mutex:

- `lane:engine-science`
- `lane:export-performance`

Acquire additional shared resources only when the change touches them:

- `shared:ci` — `.github/workflows/**`, CI policy/scripts, or test-runner configuration.
- `shared:package` — root `package.json`, `package-lock.json`, package exports, or dependency
  changes.
- `shared:api-version` — `ENGINE_API_VERSION`, `POC_SIMULATION_API_VERSION`, or public schema
  version surfaces.
- `shared:changelog` — `CHANGELOG.md` when both lanes could plausibly update it.
- `issue:<number>` — when mutating issue state/body/comments as part of active implementation.
- `path:<repository-path>` — for another high-collision file not covered by a shared resource.

Do not acquire broad resources speculatively. The registry is intended to prevent collisions, not
serialize unrelated science and export work.

## Branch and PR ownership

Use focused branches:

- Engine Science: `science/*`, `sensor/*`, `motion/*`, `optics/*`, or another clearly
  science-owned prefix.
- Export & Performance: `export/*`, `dng/*`, `perf/*`, or `ci/*`.

Normally each lane has at most one active behavioral PR. Before creating new work, inspect existing
open PRs and reuse an automation-owned branch/PR when it represents the same task.

Never modify another lane's active branch. A dependent lane consumes prerequisite work only after it
is merged to `main`, unless the project owner explicitly approves another integration path.

After every merge, rescan open PRs and the relevant dependency issues before selecting the next task.

## Cross-lane handoff

When one lane lands a prerequisite for the other:

1. Merge the prerequisite independently with its own tests and contract documentation.
2. Record the exact merged commit and public API/contract surface on the dependent issue when a
   handoff note materially helps.
3. The dependent lane starts from current `main`; it does not continue on the prerequisite
   lane's branch.
4. If a downstream task exposes a missing scientific contract, Export & Performance records the
   dependency and moves to independent work instead of implementing science locally.
5. If Engine Science needs a benchmark/CI change, it records the requirement and lets Export &
   Performance own the shared implementation unless the change is inseparable from the science
   patch.

## DCO and automated commits

The repository requires Developer Certificate of Origin sign-off for commits intended for
inclusion.

Automation must fail closed rather than invent a contributor identity. When operating through the
repository owner's authenticated GitHub connection under explicit owner authorization, use the
owner's established DCO identity from existing signed-off commits. Otherwise, do not create a
merge-intended commit until an authorized sign-off identity/path is available.

Every automation-created merge-intended commit must contain a valid `Signed-off-by:` trailer.

## Merge discipline

Automation-owned non-breaking PRs may be merged only when:

- the exact final head is current and mergeable;
- required checks for that head are green;
- no expected check is missing or silently skipped;
- the complete final diff is reviewed;
- the lane still owns every required lease;
- issue dependencies are satisfied;
- DCO sign-off is present;
- scientific, provenance/licensing, security, browser/package-boundary, compatibility, and release
  gates remain satisfied.

Intentional breaking public API/schema changes, releases/publication, new paid services, ambiguous
provenance/legal decisions, or other owner-gated actions still require explicit human approval.

## Productive-run contract

A scheduled implementation run is successful only when it produces at least one concrete delivery
outcome:

1. a safe roadmap PR is merged;
2. an active roadmap PR contains substantive implementation/documentation changes and exact-head CI
   is running or has produced actionable results;
3. a roadmap issue is closed or materially narrowed with repository evidence because current
   `main` already satisfies part or all of its acceptance criteria; or
4. a specific blocker that truly requires external/human action is recorded with the exact missing
   prerequisite and the lane immediately moves to another independent ready issue when one exists.

A general audit, plan, status recap, repeated inspection, or rediscovery of an already-known blocker
does **not** count as a productive outcome while actionable work exists.

Before starting implementation, read the issue's latest **Roadmap reconciliation** section when
present. Do not redo capabilities already verified on `main`. If reconciliation evidence shows the
issue is already complete, close it with evidence and continue to the next ready issue in the same
run when practical.

## Stalled-progress rule

A lane must not spend repeated scheduled runs on the same non-productive state.

If two consecutive expected lane runs have produced none of the productive outcomes above:

1. rescan current `main`, open PRs, recent merges, reconciliation state, dependencies, and leases;
2. stop repeating the same audit or retry path;
3. choose the next independent ready issue owned by the lane; or
4. if no owned issue is actionable, record the precise blocker/dependency and surface it through the
   health process.

An ordinary CI failure, owned merge conflict, stale automation branch, test regression, or expired
lease is an implementation problem to resolve, not by itself a reason to declare the lane blocked.
Only owner-gated decisions, unavailable external prerequisites, unresolved legal/provenance
questions, release gates, or another genuinely external dependency qualify as persistent blockers
after safe remediation paths are exhausted.

The health watch should treat an enabled/on-cadence lane with two consecutive scheduled windows and
no concrete delivery outcome as potentially stalled when a reconciled ready issue exists. It should
identify the lane and ready issue rather than disabling the lane.

## Roadmap reconciliation discipline

Open issues are the roadmap, but issue state must reflect current `main`.

- Periodically reconcile issue acceptance criteria against merged implementation and tests.
- Close an issue when all of its open-source acceptance criteria are demonstrably satisfied.
- For partially completed issues, record the landed capability and the exact remaining scope in the
  issue itself so future runs do not recreate completed work.
- Unmerged historical branches are evidence to inspect, not authoritative project state.
- A private/product requirement outside the current open-source scope does not keep an otherwise
  completed public-engine issue open.
- After reconciliation or a merge, select work from the remaining dependency graph rather than issue
  age.

## Avoiding coordination drift

Do not duplicate scientific requirements or rewrite roadmap acceptance criteria in this document or
the registry. If issue ownership/dependencies change, update the issue's coordination block and the
automation prompt together. The issue remains authoritative for the work itself.
