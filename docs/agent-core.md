# Shared Photivra agent rules

This file is the canonical copy of the agent rules that are the same in every
Photivra repository. This repository's `AGENTS.md`, and the `AGENTS.md` of each
other Photivra repository that adopts these rules, carries this exact block,
next to its own repository-specific rules. The repository-specific rules add to
the block; they do not replace it.

The block must stay suitable for this public, Apache-2.0 repository: no
proprietary material and no reference that requires access to a private
repository.

## Changing the shared rules

Changes to this file are changes to shared agent rules and need the owner's
approval for that action, on the exact final diff.

1. Edit the block below, here, in a pull request.
2. Run `node scripts/sync-agent-core.mjs --write`. It records the body's sha256
   and copies the block unchanged into this repository's `AGENTS.md`. Pass
   `--target <path to another AGENTS.md>` (repeatable) to update a checked-out
   copy in another repository.
3. Open one pull request in each other repository that carries the block. Each
   depends on the canonical pull request.

`test/agent-core.test.mjs` is identical in every carrying repository. It fails
when the block in `AGENTS.md` no longer matches its recorded sha256, so an
in-place edit to a copy fails that repository's tests. In this repository it
also fails when `AGENTS.md` differs from this file. Run
`node scripts/sync-agent-core.mjs` without `--write` to list copies that are out
of date with this file.

<!-- BEGIN photivra-agent-core v1 sha256:ef330406c4124e55ba7ce7c278e763727629729d673c82e8bcb0cc003db5d4a6 -->
<!-- Shared Photivra agent rules, copied unchanged from docs/agent-core.md in the public Photivra/photivra repository. Change the canonical file, then recopy this block; test/agent-core.test.mjs fails on in-place edits. -->
## Shared Photivra agent rules

These rules are the same in every Photivra repository that carries this block. The repository-specific rules elsewhere in this file add to them.

### Owner approval policy

The owner's approval policy (October 11, 2026) controls. Once the owner has asked for the work, everything outside the approval column of this repository's agent permissions table needs no further approval.

In every Photivra repository, these need the owner's approval for that action:

- changes to `AGENTS.md`, `CLAUDE.md` or shared agent rules, including this block and its canonical file;
- anything that goes to production, as this repository's agent permissions table lists it, including production data or infrastructure and production DNS/routing;
- spending: a new paid service or spending beyond an approved budget;
- credentials: creating, rotating, granting or deleting tokens, keys or secrets;
- destructive or irreversible actions: deleting data or resources, rewriting history, force-pushing, deleting protected or unmerged branches.

### Shared change discipline

- After a pull request is merged, delete its source branch promptly. If the environment cannot delete branches (the Claude Code cloud git proxy refuses it), say so and leave the deletion to the owner or the repository's automatic head-branch deletion. Do not delete the default branch, protected/release branches, or a branch that is still required by another open PR or documented active dependency. Any retained merged-PR branch must have the reason documented and must be deleted when that dependency ends.
- Prefer the smallest change that fully solves the problem.
- Avoid unrelated refactors, formatting churn, dependency upgrades, and file movement.
- Investigate root causes rather than masking failing tests.

### Cost control

Cost is a project constraint.

Before introducing anything that may cost money—paid APIs, hosted services, storage, CDN or Cloudflare features, SaaS, licensed assets or datasets, commercial dependencies or libraries, or recurring infrastructure—explicitly call out:

- what would cost money;
- expected fixed and usage-based cost at realistic usage;
- a no-cost or lower-cost alternative when practical.

Do not commit the project or product to a paid service without explicit approval.
<!-- END photivra-agent-core -->
