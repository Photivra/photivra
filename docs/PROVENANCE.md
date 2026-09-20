# Scientific and Source Provenance

Every scientific or calculation module in this repository must have a traceable, legally clean origin.

## Allowed foundations

An implementation may be based on:

1. Public-domain facts and mathematics.
2. Established mathematical identities and physical laws.
3. Scientific methods described in public technical literature, standards, patents, or papers, provided protected text/code/tables/figures are not copied unless separately licensed for that use and any applicable third-party patent rights are separately considered.
4. Third-party code, datasets, model weights, or calibration material only when the applicable license explicitly permits the intended copying, modification, redistribution, and commercial use and is compatible with this project.

"Available on the internet" is not sufficient permission.

A paper, standard, or patent publication may explain a method without granting copyright permission to copy its expression and without granting a patent license. Independent implementation addresses source-code/prose provenance; it does not by itself resolve active third-party patent claims.

## Independent implementation

When a reference explains a method but does not license its implementation or text for reuse:

- understand the mathematical/scientific method;
- write a fresh implementation from the method, not from proprietary source structure;
- do not translate, mechanically rewrite, or adapt proprietary source code;
- do not copy protected tables, diagrams, explanatory prose, calibration datasets, waveform files, or model weights;
- add tests based on independently derived analytical cases or clearly reusable data;
- record material references and any known licensing/patent constraints.

## AI-assisted work

AI-assisted code, documentation, tests, or research notes are treated as untrusted draft material until substantively reviewed by a human contributor.

A contributor using an AI system remains responsible for:

- confirming that the submitted expression is appropriate to distribute under Apache-2.0;
- checking for suspiciously copied/source-like output;
- validating scientific and technical correctness;
- ensuring no confidential or restricted third-party material was supplied to the tool;
- making the DCO certification for the final submitted contribution.

An AI system's assertion about originality, copyrightability, patents, or license compatibility is not accepted as provenance evidence.

## Module record

Meaningful scientific modules should document, in JSDoc or an adjacent reference document:

- mathematical/physical basis;
- assumptions and valid range;
- units and coordinate conventions;
- whether the implementation is independent;
- public references used to understand or validate the method;
- third-party code/data incorporated, if any;
- the license for any incorporated third-party material;
- uncertainty or approximation status where applicable.

## Provenance labels

Scientific calculation envelopes use these labels:

- `calculated`: directly computed from the documented model.
- `calibrated`: uses measurement/calibration data with documented reuse rights.
- `estimated`: an input or result is inferred rather than known exactly.
- `approximation`: a deliberately simplified model is used.

The composed `simulatePocCamera()` response is not itself a `CalculationResult<T>`; it reports aggregate/component provenance separately and uses `mixed` when calculated components are combined with explicitly approximate components.

## Uncertainty and quality metadata

Provenance answers **how a result was produced**; uncertainty answers **what quantitative accuracy/variability is defensibly known**. They are related but must not be conflated.

When available, `CalculationResult.quality` records uncertainty components by affected quantity and source:

- `measurement`: variability/uncertainty originating in measured inputs or observations;
- `calibration`: uncertainty originating in a calibration or calibrated reference;
- `model-approximation`: quantified error attributed to a simplified/inexact model.

An approximation label does not by itself justify a numeric model-error estimate. If no defensible bound exists, retain the approximation provenance and assumptions without fabricating quality metadata.

Confidence/coverage levels are optional and must include a stated basis. They are not subjective confidence scores.

Valid-range metadata describes where a model/calibration is considered applicable. It is not an uncertainty interval.

When composing models, preserve uncertainty components separately unless a documented model provides a defensible combination rule. Do not imply statistical independence, add errors in quadrature, or publish a single aggregate confidence score without evidence.

## Release gate

Ambiguous licensing, unresolved material patent risk, uncertain provenance, unexplained copied material, fabricated uncertainty, undocumented uncertainty combination, or unsupported scientific claims block release until resolved.
