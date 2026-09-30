# Scientific Assurance and Uncertainty Composition

Photivra keeps **scientific status**, **source evidence**, **uncertainty**, **limitations**, and **reproducibility identity** as related but distinct concepts.

This document defines the cross-engine composition contract used when independently valid scientific modules are combined into a higher-level result.

The public contract is exposed as:

- `SCIENTIFIC_ASSURANCE_CONTRACT_VERSION`;
- `ScientificAssuranceComponent`;
- `composeScientificAssurance()`;
- `ComposedScientificAssurance`.

The first contract version is `0.1.0`.

## Core rule

A composed result must not appear more scientifically certain than the required inputs that produced it.

Photivra therefore:

1. preserves each component's source/profile identity;
2. preserves component evidence records;
3. preserves component uncertainty declarations;
4. identifies the weakest required scientific status;
5. reports missing required evidence explicitly;
6. refuses to invent an aggregate numeric uncertainty without a defensible propagation rule.

A composition helper does **not** turn provenance into a confidence score.

## Scientific status

Composition-level status uses:

- `calibrated` — every required component supports calibrated status and all required evidence is present;
- `approximation` — at least one required component is an explicit approximation and none is unknown/missing required evidence;
- `unknown` — at least one required component has unknown status or required evidence is missing.

A downstream composition cannot promote an approximation to calibrated merely because a later mathematical operation is exact.

For example:

```text
calibrated radiance
  × calibrated transmission
  × approximate paraxial bridge
  = approximation
```

If a required evidence-backed component declares no evidence, the composition status becomes `unknown` and the missing component ID remains visible.

## Evidence basis

Each component declares one basis:

- `evidence-backed-fact`;
- `photivra-model-assumption`;
- `not-applicable`.

An `evidence-backed-fact` requires evidence.

A Photivra model assumption may cite explanatory/reference evidence, but it remains explicitly a model assumption rather than being upgraded into a measured fact.

Evidence continues to use the existing `EvidenceProvenance` contract:

- source origin and reuse rights remain separate;
- factual-reference-only material is not reusable numeric data;
- reusable data requires a license;
- Photivra-owned evidence must originate from Photivra.

## Uncertainty states

Component uncertainty has explicit semantic states.

### Quantified relative uncertainty

```ts
{
  kind: "relative",
  fraction: 0.02,
  basis: "calibration repeatability"
}
```

### Quantified absolute uncertainty

```ts
{
  kind: "absolute",
  plusMinus: 0.1,
  unit: "mm",
  basis: "fixture measurement"
}
```

### Existing CalculationQuality

Modules that already expose multiple quantified `CalculationQuality.uncertainty` components may preserve the whole validated quality object:

```ts
{
  kind: "calculation-quality",
  quality
}
```

This prevents a multi-component uncertainty description from being flattened into one invented scalar.

### Not quantified

```ts
{
  kind: "not-quantified",
  limitation: "Model error exists but no defensible bound is available."
}
```

**Not quantified does not mean zero.**

### Unknown

```ts
{
  kind: "unknown",
  limitation: "No uncertainty characterization is available."
}
```

Use `unknown` when the uncertainty state itself is unavailable, not merely when a known approximation lacks a numeric error bound.

### Not applicable

```ts
{
  kind: "not-applicable",
  reason: "This identity-only component has no numeric quantity."
}
```

## Composed uncertainty

`composeScientificAssurance()` preserves all component declarations but does not automatically calculate a combined numeric uncertainty.

Its aggregate uncertainty state is:

1. `unknown` if any required component uncertainty is unknown;
2. otherwise `not-quantified` if any required component has known-but-unquantified uncertainty;
3. otherwise `not-propagated` when one or more required components have quantified uncertainty but no explicit propagation model has been supplied;
4. otherwise `not-applicable`.

This ordering prevents a quantified component from hiding a less-characterized required component.

### Why no automatic quadrature

Photivra does not assume that uncertainty components are statistically independent.

Do not automatically:

- add relative errors;
- add variances in quadrature;
- choose worst-case sums;
- publish an aggregate confidence interval.

A module may perform analytic propagation when the model, covariance/independence assumptions, and affected quantities are explicitly defined. That propagated result should remain traceable to the component uncertainties it consumed.

Monte Carlo simulation is not required where an analytic treatment or an explicit `not-propagated` state is scientifically more appropriate.

## Source identity and reproducibility

Each assurance component has a stable source identity:

- profile;
- result;
- model;
- fixture.

IDs and versions are preserved where available.

Material evidence/uncertainty changes must participate in the owning result/snapshot/plan's reproducibility identity. The production-plan tests verify that changing scene-radiance uncertainty changes both capture and plan fingerprints.

The canonical `basic-reference-scene` fixture is covered as a Photivra-owned `fixture` assurance source.

## Production composition (#111)

Production image-formation plan contract `0.4.0` adds `scientificAssurance` when the plan has composed scientific results.

The current physical path records required components for:

- scene-radiance result;
- optical throughput profile;
- Photivra primary-optics bridge model;
- each selected front-of-lens filter;
- non-unity field-throughput model when present.

The temporal path records the capture temporal-schedule approximation when temporal composition is active.

The primary optics bridge remains an approximation, so calibrated upstream data alone cannot cause the current scene-radiance → sensor-irradiance composition to claim calibrated status.

Optimized and reference consumer manifests receive the same assurance object unchanged.

## Cross-engine audit

### Scene radiance

Scene-radiance/provider contracts already distinguish:

- calibrated vs approximation status where supported;
- relative quantified uncertainty;
- `not-quantified`;
- evidence and limitations.

#111 maps those declarations into the common assurance component without reinterpreting them.

### Optics

The scene-to-sensor optical bridge already preserves:

- profile/transmission status;
- profile/transmission/working-f-number evidence;
- relative or unquantified uncertainty;
- explicit limitations.

The bridge itself is still an approximation and is represented as a separate Photivra-model component.

Front-of-lens filters preserve each filter's identity, status, evidence and uncertainty separately.

### Sensor

Sensor modules use several domain-specific readiness/profile/result contracts plus `CalculationQuality` where appropriate.

Those domain contracts remain authoritative. The common assurance layer must preserve them rather than replacing sensor-specific physical applicability with one generic score.

When a sensor result exposes multiple `CalculationQuality` uncertainty components, the common contract can retain the whole validated quality object.

### Exposure and metering

Current relative exposure/metering/control paths are deterministic model/policy outputs, often without a calibrated real-camera error distribution.

Do not invent numeric uncertainty merely because an exposure offset or setting is numeric.

Where the source is an educational/generic approximation, composed consumers should use explicit approximation + not-quantified semantics unless a future calibration contract supplies a real uncertainty model.

### Processed output (#112)

The processed-camera/output pipeline is not yet fully implemented.

When #112 composes source scientific results, it must:

- carry upstream assurance/evidence/uncertainty forward;
- add its own processing-model components;
- never upgrade scientific status because the output transform is deterministic;
- distinguish calibrated color/output transforms from generic approximations;
- keep display/encoding choices from erasing upstream limitations.

This is an explicit implementation requirement for #112, not a claim that processed-output assurance is already complete.

## Relationship to provenance

`docs/PROVENANCE.md` remains the source of truth for legal/scientific source provenance and reuse rights.

This contract adds **composition semantics**. It does not replace:

- `CalculationResult.provenance`;
- `CalculationResult.quality`;
- `EvidenceProvenance`;
- module-specific calibration/readiness/applicability contracts.

## Release rule

A public composed result must not:

- convert `not-quantified` or `unknown` into zero uncertainty;
- silently discard required evidence;
- promote scientific status above a weaker required component;
- fabricate a numeric aggregate uncertainty;
- remove materially relevant uncertainty/evidence identity from deterministic serialization.

Violations are scientific correctness defects, not documentation-only issues.
