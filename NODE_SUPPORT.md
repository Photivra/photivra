# Photivra organization Node.js support policy

Adopted: 2026-09-26. Applies to every Node.js repository in the Photivra organization, including contributor tooling, CI, build/deployment tooling, and supported Node.js execution environments. It does not change browser support or the browser-safe engine boundary.

## Maintained LTS only

"Actively maintained LTS" means an official Node.js release line in either **Active LTS** or **Maintenance LTS**, before its upstream end-of-life date. Current, prerelease/nightly, end-of-life, and commercial extended-support-only releases are not supported.

Use the official lifecycle, not "latest", a version-number parity rule, or an open-ended minimum version as evidence of support:

- https://nodejs.org/en/about/previous-releases
- https://github.com/nodejs/Release
- https://github.com/nodejs/Release/blob/main/schedule.json

As reverified against the official schedule on 2026-10-02 (original policy review 2026-09-26), Node 24 is Active LTS and Node 22 is Maintenance LTS. Node 26 is Current and is not eligible yet. Future dates must be reverified; entering LTS makes a line eligible for review, not automatically supported by every repository.

## Repository baselines

An eligible upstream line is not an untested repository compatibility claim. Each repository must explicitly record and test its supported subset. Prefer the newest qualified Active LTS line for normal development and builds; retain a qualified Maintenance LTS line where compatibility is already supported.

This repository preserves its existing Node 22 and Node 24 CI coverage, including the Node 22.13.0 minimum-version regression job. The normal tooling baseline and pinned `@types/node` major remain **24**. Use current patched releases for ordinary development/deployment; a historical minimum-version regression job is not a deployment recommendation.

Node 22-compatible code must not assume Node 24-only APIs merely because contributor tooling uses Node 24 typings. Keep the Node 22 runtime tests and the public browser-safe package boundary. A broad existing `engines.node` range is a compatibility hint, not permission to claim support for Current or EOL lines. Any manifest-range change must update its lockfile and follow package compatibility/release review; this policy does not rewrite already-published packages.

## CI and dependency enforcement

`.github/node-lts-policy.mjs` checks the actual Node build's LTS marker, this repository's approved major set, a reviewed upstream LTS date window, and the approved pinned typings major before dependency installation. `.github/test-node-lts-policy.mjs` covers acceptance and rejection boundaries. Both run in existing CI jobs; no additional CI matrix or service is introduced.

The lifecycle snapshot is intentionally local and reviewed, not fetched from the network during ordinary CI. It uses UTC dates and fails closed on the recorded end-of-life date. Reverify the official schedule before changing the snapshot, before a baseline/release decision, and during regular dependency maintenance. Do not extend an expired window or add a Current line merely to pass CI.

Routine minor/patch updates within an approved major may follow normal green-PR rules. Do not auto-merge a Node runtime, Node image, or `@types/node` major upgrade independently. Where Dependabot is configured, keep Node typings major upgrades out of its routine update queue while allowing supported-major updates.

## Lifecycle changes

Add a newly eligible LTS line through one coordinated review of the support policy/guard, CI, local version files, build environments, typings, manifest/lockfile compatibility, and tests. Update only files that exist and are relevant; do not introduce a new runtime or infrastructure merely for uniformity. Remove a line from the support set and CI before upstream EOL, documenting downstream compatibility implications. Never silently raise a library's minimum runtime or advertise an untested line.

All existing scientific, security, provenance, regression, artifact, and release gates remain in force. This rule does not authorize npm publication, tags, public release, or a default runtime-major upgrade.
