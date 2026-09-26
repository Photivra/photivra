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
- Update concise documentation when behavior, assumptions, limitations, schemas, version surfaces, or public APIs change.
- Preserve the browser-safe published-package boundary; Node-only transport code is repository-only contributor tooling and must not become a public package export.
- Keep npm/package version, `ENGINE_API_VERSION`, `POC_SIMULATION_API_VERSION`, and schema-specific versions distinct.
- For sensor/capture work, preserve native coordinate conventions, active-capture vs output-crop separation, optical-axis offsets, and independent X/Y sampling.
- For provenance/calibration work, keep evidence origin separate from reuse rights and never treat geometric sample pitch as photon-collection area.
- Do not submit copied or adapted third-party code/data unless its license and provenance are explicitly compatible and recorded.
- If generative tools assisted with code or prose, the contributor remains responsible for originality, licensing, scientific accuracy, confidentiality, and substantive human review.
- Do not rely on an AI system's statement that generated material is original, copyrightable, unpatented, or license-compatible as legal evidence.

## Sensor/capture contribution checklist

Changes in sensor, capture, output, or radiometry code should explicitly answer:

- Which coordinate space does each point/vector/rectangle use?
- Does the change preserve native top-left/+X-right/+Y-down semantics?
- Are physical active capture and digital/output crop still separate?
- Does an off-center crop preserve optical-axis position?
- Are X/Y sampling differences preserved or deliberately rejected?
- Does output resampling preserve geometry unless an explicit transform says otherwise?
- Is physical focal length kept separate from diagonal-based 35 mm equivalence?
- Are unknown sensor facts left unknown instead of inferred?
- Is every evidence record legally usable for the way it is consumed?
- Is any approximate representation still labeled approximation?
- Does any radiometry change accidentally enable photon/noise claims without the readiness gate and defensible calibration?

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
- compatibility impact on the root engine API and/or composed POC simulation API, if applicable;
- coordinate-system/invariance tests for geometry changes;
- evidence, reuse-rights, calibration/approximation status, and uncertainty/limitation treatment for sensor/radiometry changes.

Critical scientific regressions and unsupported scientific claims are release blocking.
