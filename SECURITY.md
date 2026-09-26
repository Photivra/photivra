# Security

Please do not open a public issue containing vulnerability details.

## Supported versions

Photivra is pre-1.0. Until a formal support policy exists, security fixes are made against the current development/release line; older snapshots should not be assumed to receive fixes.

## Reporting a vulnerability

For the public GitHub repository, use GitHub's private vulnerability reporting flow ("Report a vulnerability" on the Security tab) when available.

Private vulnerability reporting must be enabled before the repository is made public. If that private reporting entry point is unavailable, contact the repository owner privately before disclosing exploit details.

Please include, when relevant:

- affected commit/package/API version;
- reproduction steps or a minimal proof of concept;
- impact and preconditions;
- whether the issue affects the browser-safe root package, repository-local POC API tooling, development tooling, or the supply chain.

## Security boundaries

The root `@photivra/engine` package is a calculation library. Its browser-facing dependency graph is checked in CI to prevent Node-only modules or the POC HTTP transport from becoming reachable through the root export.

The repository-local `src/api` code is a separate Node-only proof-of-concept development server. It is not exported by or included in the published `@photivra/engine` package:

- it is unauthenticated;
- it binds to loopback/localhost by default;
- it is not a production hosting recommendation;
- CORS is a browser policy, not authentication or authorization;
- exposing it on a non-loopback interface requires separate production-grade protection that this repository does not provide.

## Release and publishing controls

The npm release workflow is designed so verification/build tooling does not receive npm publishing identity:

- release tags must be protected, match the package version, and point at the current `main` commit;
- the `main` branch must report as protected through GitHub before a publish is allowed;
- verification, coverage, build, and package creation run in a job without `id-token: write`;
- only the minimal final publish job receives OIDC permission;
- the verified tarball is transferred between jobs as a short-lived Actions artifact and checked against its SHA-256 before publication;
- GitHub Actions are pinned to immutable commit SHAs;
- checkout credentials are not persisted into later CI steps;
- dependency installation uses the lockfile and `--ignore-scripts`;
- the public package has no runtime npm dependencies.

Repository administrators must keep release tags and the default branch protected; the publish workflow fails closed if either protection is absent. For the strongest npm posture, also use a protected GitHub deployment environment in the npm trusted-publisher configuration and disable traditional token-based publishing after trusted publishing is verified.

## Development rules

- Never commit credentials, API keys, tokens, private keys, private datasets, or proprietary calibration material.
- Keep runtime dependencies minimal; the root package currently has no runtime npm dependencies.
- Dependencies, models, data, and copied/adapted material require explicit license/provenance review before adoption.
- Treat material dependency, secret, supply-chain, unsafe transport, and browser-boundary findings as release blockers.
