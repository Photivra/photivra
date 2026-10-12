# Photivra engine agent rules: Public interfaces and tooling

These rules moved verbatim from [the domain rules index](AGENT_DOMAIN_RULES.md) and **remain binding** for public API/compatibility, version and runtime/browser/package-boundary changes and their tests, reviews, documentation and APIs. The index's scientific-integrity rules apply to every domain; for cross-domain work, also read every other affected domain file. This file is not a substitute for the canonical API, scientific, provenance or numerical specifications.

## Public API and compatibility

Backward compatibility matters.

- Preserve existing public exports, argument semantics, units, return shapes, error behavior, and schema meaning unless an explicit breaking change is approved.
- Prefer typed/config-object inputs for multi-parameter functions.
- Follow the conventions in `docs/API_STYLE.md`.
- Keep result/provenance structures consistent across modules.
- Keep `ENGINE_API_VERSION` aligned with the package version; keep `POC_SIMULATION_API_VERSION` and schema/model versions independent.
- Runtime parsers must fail closed on unknown enum/string values; TypeScript unions are not validation.
- Do not silently reinterpret an existing field or unit.
- If behavior must change, add regression tests and document compatibility impact.

## Runtime and package boundary

- The root package must remain browser-safe and ESM-only.
- Node-only code must not become reachable from the root public export.
- The repository-local POC HTTP code under `src/api` is contributor tooling, not a supported package subpath or production architecture.
- Keep the published npm tarball limited to the intended root scientific surface.
- Do not add runtime dependencies without a concrete need, provenance/license review, and explicit approval.
- Reuse existing helpers/modules before adding parallel abstractions.
