# Scientific and Source Provenance

Release context (dated historical note): this page was written for the **package 1.2.0 candidate / root API 1.2.0**. It has not been re-reviewed for later releases; see the [changelog](../CHANGELOG.md) for the current release. Subsystem and model versions, and dated introduction or measurement records below, are independent historical identities. They are not distribution versions. See [developer navigation](DEVELOPERS.md) and the [release contract](RELEASE_1_2_0.md).

Every scientific or calculation module in this repository must have a traceable, legally clean origin. This page says what that means.

## Allowed foundations

An implementation may be based on:

1. Public-domain facts and mathematics.
2. Established mathematical identities and physical laws.
3. Scientific methods described in public technical literature, standards, patents or papers. Protected text, code, tables and figures must not be copied unless they are separately licensed for that use. Any applicable third-party patent rights must be considered separately.
4. Third-party code, datasets, model weights or calibration material, but only when the licence explicitly permits the intended copying, modification, redistribution and commercial use, and is compatible with this project.

"Available on the internet" is not permission.

A paper, standard or patent publication can explain a method without giving copyright permission to copy its wording, and without giving a patent licence. Writing your own implementation settles where the source code and prose came from. It does not, by itself, resolve active third-party patent claims.

## Source evidence and reuse rights

Evidence records keep **where a fact came from** (origin) separate from **what Photivra may do with it** (reuse rights).

- `sourceOrigin` says who originated the fact or data: the manufacturer, a third party, or Photivra.
- `reuseStatus` says how Photivra may use it: factual-reference-only, reusable-data, or Photivra-owned.
- Reusable data needs an explicit licence.
- Photivra-owned material must originate from Photivra.
- Manufacturer and third-party sources may be factual-reference-only, or explicitly reusable when the licence supports that use.

One evidence record must not silently support unrelated facts. Scalar metadata may cite several evidence records. Capabilities with several values should carry evidence for each value.

Evidence provenance is not a confidence score, and on its own it does not show a scientific effect. Descriptive hardware facts affect calculations only when a separate, documented model explicitly uses them.

## Independent implementation

When a reference explains a method but does not license its code or text for reuse:

- understand the mathematical or scientific method;
- write a fresh implementation from the method, not from the structure of proprietary source;
- do not translate, mechanically rewrite or adapt proprietary source code;
- do not copy protected tables, diagrams, explanatory prose, calibration datasets, waveform files or model weights;
- add tests based on independently derived analytical cases, or on clearly reusable data;
- record the important references and any known licensing or patent constraints.

## AI-assisted work

AI-assisted code, documentation, tests and research notes are untrusted drafts until a human contributor has reviewed them substantively.

A contributor who uses an AI system remains responsible for:

- confirming that the submitted text and code may be distributed under Apache-2.0;
- checking for output that looks copied or source-like;
- checking scientific and technical correctness;
- making sure no confidential or restricted third-party material was given to the tool;
- making the DCO certification for the final contribution.

An AI system's statement about originality, copyrightability, patents or licence compatibility is not accepted as provenance evidence.

## Module record

Each meaningful scientific module should document, in JSDoc or a reference document next to it:

- the mathematical or physical basis;
- assumptions and valid range;
- units and coordinate conventions;
- whether the implementation is independent;
- public references used to understand or check the method;
- any third-party code or data it incorporates;
- the licence of any incorporated third-party material;
- uncertainty or approximation status, where applicable.

## Provenance labels

Scientific calculation envelopes use these labels:

- `calculated`: computed directly from the documented model.
- `calibrated`: uses measurement or calibration data with documented reuse rights.
- `estimated`: an input or result is inferred rather than known exactly.
- `approximation`: a deliberately simplified model is used.

The composed `simulatePocCamera()` response is not itself a `CalculationResult<T>`. It reports aggregate and component provenance separately, and uses `mixed` when calculated components are combined with explicitly approximate ones.

## Uncertainty and quality metadata

How these rules apply across engines is defined in [Scientific Assurance and Uncertainty Composition](SCIENTIFIC_ASSURANCE.md). That contract keeps each module's provenance and quality; it does not replace them.

Provenance answers **how a result was produced**. Uncertainty answers **how accurate or variable it is, as far as can be defended with numbers**. The two are related, but must not be mixed up.

When available, `CalculationResult.quality` records uncertainty components by affected quantity and by source:

- `measurement`: variability or uncertainty from measured inputs or observations;
- `calibration`: uncertainty from a calibration or calibrated reference;
- `model-approximation`: quantified error caused by a simplified or inexact model.

An approximation label alone does not justify a numeric model-error estimate. If no defensible bound exists, keep the approximation provenance and assumptions, and do not make up quality metadata.

Confidence or coverage levels are optional and must state their basis. They are not subjective confidence scores.

Valid-range metadata says where a model or calibration is considered applicable. It is not an uncertainty interval.

When composing models, keep uncertainty components separate unless a documented model gives a defensible rule for combining them. Without evidence, do not imply statistical independence, add errors in quadrature, or publish a single aggregate confidence score.

## Radiometry readiness evidence

Radiometry readiness is a declaration and validation gate. It does not prove that a calibration is correct.

A component labelled `calibrated` must name its model and version, its supporting evidence, and a quantified uncertainty. If the uncertainty cannot be quantified yet, the component can still be represented, but the overall assessment cannot become `calibrated-ready`.

Calibration artifacts that carry data are referenced by a stable identifier plus a SHA-256 checksum. Curves or tables that are publicly viewable but have no reuse rights must not be copied into those artifacts. Factual specifications published by a manufacturer may support independently written models. Copied calibration datasets need an explicit reusable licence or Photivra ownership.

An `approximation` stays explicitly approximate even when every prerequisite category is present. Readiness must never be used to upgrade approximation provenance into calibration provenance.

## Release gate

Any of the following blocks a release until it is resolved: ambiguous licensing, unresolved material patent risk, uncertain provenance, unexplained copied material, made-up uncertainty, an undocumented way of combining uncertainties, or unsupported scientific claims.
