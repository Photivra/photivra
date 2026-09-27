# CI and dependency instructions

Follow the repository-root `AGENTS.md` and `NODE_SUPPORT.md` together. These instructions add Node.js lifecycle requirements; they do not replace any existing release, security, licensing, scientific, or package-boundary rule.

- Use only the repository-approved subset of official Active LTS or Maintenance LTS Node.js lines.
- Preserve the maintained-LTS policy check before dependency installation in every Node CI job.
- Do not use `node`, `latest`, or an automatically moving `lts/*` alias to adopt an unreviewed major.
- Keep Node runtime/build baselines, pinned typings, local version files, and compatibility tests aligned through coordinated review.
- Do not merge a typings-only major update or remove a compatibility job merely because current tests pass.
- Reverify the official Node.js schedule when updating lifecycle windows; never extend expired support to clear a failure.
