# Scientific Assurance and Uncertainty Composition

> **Release context.** This page was written for package 1.2.0 (root API 1.2.0) and has not been re-reviewed for later releases. The [changelog](../CHANGELOG.md) describes the current release. Model and subsystem version numbers on this page, and any dated records, are separate from the package version. See also the [developer guide](DEVELOPERS.md) and the [1.2.0 release contract](RELEASE_1_2_0.md).

When Photivra combines several scientific modules into one result, it has to say how trustworthy the combined result is. This page defines the rules for that, across the whole engine.

Photivra treats these as related but separate ideas:

- **scientific status** (calibrated, approximation or unknown);
- **source evidence**;
- **uncertainty**;
- **limitations**;
- **reproducibility identity** (what makes a result repeatable).

The public contract is:

- `SCIENTIFIC_ASSURANCE_CONTRACT_VERSION`;
- `ScientificAssuranceComponent`;
- `composeScientificAssurance()`;
- `ComposedScientificAssurance`.

The first contract version is `0.1.0`.

## Core rule

A combined result must never look more certain than the required inputs it was made from.

So Photivra:

1. keeps each component's source and profile identity;
2. keeps each component's evidence records;
3. keeps each component's uncertainty declarations;
4. identifies the weakest required scientific status;
5. reports missing required evidence explicitly;
6. refuses to invent a combined numeric uncertainty without a defensible propagation rule.

Combining results does **not** turn provenance into a confidence score.

## Scientific status

The combined status is one of:

- `calibrated`: every required component supports calibrated status, and all required evidence is present.
- `approximation`: at least one required component is an explicit approximation, and none is unknown or missing required evidence.
- `unknown`: at least one required component has unknown status, or required evidence is missing.

A later step cannot upgrade an approximation to calibrated just because its own maths is exact. For example:

```text
calibrated radiance
  × calibrated transmission
  × approximate paraxial bridge
  = approximation
```

If a required component that should be evidence-backed declares no evidence, the combined status becomes `unknown`, and the ID of that component stays visible.

## Evidence basis

Each component declares one basis:

- `evidence-backed-fact`;
- `photivra-model-assumption`;
- `not-applicable`.

An `evidence-backed-fact` requires evidence.

A Photivra model assumption may cite explanatory or reference evidence. It is still explicitly a model assumption; citing a source does not upgrade it into a measured fact.

Evidence uses the existing `EvidenceProvenance` contract:

- where a source came from, and whether it may be reused, are recorded separately;
- material usable only as a factual reference is not reusable numeric data;
- reusable data requires a licence;
- Photivra-owned evidence must come from Photivra.

## Uncertainty states

Each component's uncertainty is in one of these explicit states.

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

Modules that already expose several quantified `CalculationQuality.uncertainty` components can keep the whole validated quality object:

```ts
{
  kind: "calculation-quality",
  quality
}
```

This stops an uncertainty description with several parts from being squashed into one invented number.

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

Use `unknown` when nothing is known about the uncertainty at all. If the model is a known approximation that just lacks a numeric error bound, use `not-quantified` instead.

### Not applicable

```ts
{
  kind: "not-applicable",
  reason: "This identity-only component has no numeric quantity."
}
```

## Composed uncertainty

`composeScientificAssurance()` keeps every component's declaration, but does not automatically calculate a combined numeric uncertainty.

The combined uncertainty state is the first of these that applies:

1. `unknown`, if any required component's uncertainty is unknown;
2. otherwise `not-quantified`, if any required component has a known but unquantified uncertainty;
3. otherwise `not-propagated`, when one or more required components have quantified uncertainty but no explicit propagation model has been supplied;
4. otherwise `not-applicable`.

This order stops a well-quantified component from hiding a required component that is less well understood.

### Why no automatic quadrature

Photivra does not assume that uncertainty components are statistically independent.

Do not automatically:

- add relative errors;
- add variances in quadrature;
- choose worst-case sums;
- publish a combined confidence interval.

A module may propagate uncertainty analytically when the model, the covariance or independence assumptions, and the affected quantities are all explicitly defined. The propagated result should stay traceable to the component uncertainties it used.

Monte Carlo simulation is not required where an analytic treatment, or an explicit `not-propagated` state, is scientifically more appropriate.

## Source identity and reproducibility

Each assurance component has a stable source identity, which is one of:

- profile;
- result;
- model;
- fixture.

IDs and versions are kept where available.

A meaningful change to evidence or uncertainty must change the reproducibility identity of the result, snapshot or plan that owns it. The production-plan tests check that changing scene-radiance uncertainty changes both the capture and plan fingerprints.

The canonical `basic-reference-scene` fixture is covered as a Photivra-owned `fixture` assurance source.

## Production composition (#111)

Production image-formation plan contract `0.4.0` adds `scientificAssurance` whenever the plan has composed scientific results.

The physical path records required components for:

- the scene-radiance result;
- the optical throughput profile;
- the Photivra primary-optics bridge model;
- each selected front-of-lens filter;
- the field-throughput model, when it is not unity.

When temporal composition is active, the temporal path records the capture's temporal-schedule approximation.

The primary-optics bridge is an approximation. So calibrated upstream data alone can never make the scene-radiance → sensor-irradiance result claim calibrated status.

Optimised and reference consumer manifests receive the same assurance object, unchanged.

## Cross-engine audit

### Scene radiance

Scene-radiance and provider contracts already distinguish:

- calibrated versus approximation status, where supported;
- quantified relative uncertainty;
- `not-quantified`;
- evidence and limitations.

Production composition maps those declarations into the common assurance component without reinterpreting them.

### Optics

The scene-to-sensor optical bridge already keeps:

- profile and transmission status;
- evidence for the profile, transmission and working f-number;
- relative or unquantified uncertainty;
- explicit limitations.

The bridge itself is still an approximation. It is represented as a separate Photivra-model component.

Front-of-lens filters keep each filter's identity, status, evidence and uncertainty separately.

### Sensor

Sensor modules use several sensor-specific readiness, profile and result contracts, plus `CalculationQuality` where it fits.

Those sensor contracts stay authoritative. The common assurance layer must keep them, not replace sensor-specific physical applicability with one generic score.

When a sensor result exposes several `CalculationQuality` uncertainty components, the common contract can keep the whole validated quality object.

### Exposure and metering

The current relative exposure, metering and control paths produce deterministic model or policy outputs. They usually have no calibrated error distribution from a real camera.

Do not invent a numeric uncertainty just because an exposure offset or setting is a number.

Where the source is an educational or generic approximation, consumers should use `approximation` status with `not-quantified` uncertainty, unless a future calibration contract supplies a real uncertainty model.

### Processed output (#112)

The bounded processed camera output pipeline is in place. It keeps the detailed records of reconstruction, rendering and correction, and conservative upstream assurance. It does not infer calibrated colour from deterministic processing.

When the processed output path combines source scientific results, it must:

- carry upstream assurance, evidence and uncertainty forward;
- add its own processing-model components;
- never upgrade scientific status because the output transform is deterministic;
- distinguish calibrated colour or output transforms from generic approximations;
- not let display or encoding choices erase upstream limitations.

These requirements apply to the shared processed-RAW / paired-JPEG path. Wider output and colour combinations that are unsupported stay explicitly unsupported; see [processed output](PROCESSED_OUTPUT.md).

## Relationship to provenance

`docs/PROVENANCE.md` is still the source of truth for legal and scientific source provenance and reuse rights.

This contract adds rules for **combining** results. It does not replace:

- `CalculationResult.provenance`;
- `CalculationResult.quality`;
- `EvidenceProvenance`;
- module-specific calibration, readiness and applicability contracts.

## Release rule

A public composed result must not:

- turn `not-quantified` or `unknown` into zero uncertainty;
- silently discard required evidence;
- raise scientific status above a weaker required component;
- fabricate a combined numeric uncertainty;
- remove relevant uncertainty or evidence identity from deterministic serialisation.

Breaking these rules is a scientific correctness defect, not just a documentation issue.
