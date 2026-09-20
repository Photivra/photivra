# Contributing

Contributions are welcome when they preserve scientific integrity, source provenance, API consistency, and the Apache-2.0 licensing boundary.

## Development setup

Node.js 22.13 or newer is required for the repository's development/tooling workflow. The reproducible npm path is:

```sh
npm ci
npm run check
npm run coverage
npm run build
npm run pack:check
```

CI verifies Node.js 22.13 and Node.js 24.

## Before submitting

- Follow [docs/API_STYLE.md](docs/API_STYLE.md).
- Follow [docs/PROVENANCE.md](docs/PROVENANCE.md).
- Add meaningful analytical/regression tests.
- Update concise documentation when behavior, assumptions, limitations, or public APIs change.
- Preserve the browser-safe published-package boundary; Node-only transport code is repository-only contributor tooling and must not become a public package export.
- Do not submit copied or adapted third-party code/data unless its license and provenance are explicitly compatible and recorded.
- If generative tools assisted with code or prose, the contributor remains responsible for originality, licensing, scientific accuracy, confidentiality, and substantive human review.
- Do not rely on an AI system's statement that generated material is original, copyrightable, unpatented, or license-compatible as legal evidence.

## Contributor certification

Contributions are made under the [Developer Certificate of Origin 1.1](DCO).

Every commit intended for inclusion should contain a `Signed-off-by` line. The simplest workflow is:

```sh
git commit -s
```

By signing off, the contributor certifies the DCO for that contribution, including the right to submit it under the project's open-source license and the public/indefinite nature of the contribution record.

## Scientific changes

A pull request that changes calculations should include:

- the equation/model being implemented or changed;
- assumptions, coordinate conventions, and units;
- provenance/references;
- analytical or independently reproducible test cases;
- any numerical behavior change;
- uncertainty/approximation notes where relevant;
- compatibility impact on the composed engine API, if applicable.

Critical scientific regressions and unsupported scientific claims are release blocking.
