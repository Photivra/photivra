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

## Development rules

- Never commit credentials, API keys, tokens, private keys, private datasets, or proprietary calibration material.
- Keep runtime dependencies minimal; the root package currently has no runtime npm dependencies.
- Dependencies, models, data, and copied/adapted material require explicit license/provenance review before adoption.
- Treat material dependency, secret, supply-chain, unsafe transport, and browser-boundary findings as release blockers.
