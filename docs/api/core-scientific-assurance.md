# core/scientific-assurance.ts public contracts

Package **1.5.0**, root API **1.5.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## ComposedScientificAssurance

Cross-stage status and retained evidence for one declared scientific result.
Required incomplete/approximate children constrain the aggregate; deterministic
processing cannot upgrade approximation to calibration. Uncertainty components
remain independently identified unless an explicit mathematical propagation model
justifies a combination. A count of successful stages is not an accuracy bound.

```ts
export interface ComposedScientificAssurance {
  version:
    typeof SCIENTIFIC_ASSURANCE_CONTRACT_VERSION;
  scientificStatus:
    ScientificAssuranceStatus;
  weakestRequiredComponentIds:
    readonly string[];
  evidenceStatus:
    | "complete"
    | "missing-required-evidence";
  missingRequiredEvidenceComponentIds:
    readonly string[];
  uncertainty:
    ComposedScientificUncertaintyStatus;
  components:
    readonly ScientificAssuranceComponent[];
  componentEvidencePreserved: true;
  componentUncertaintyPreserved: true;
  aggregateNumericUncertaintyFabricated:
    false;
  downstreamStatusPromotedAboveInputs:
    false;
}
```

## ComposedScientificUncertaintyStatus

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type ComposedScientificUncertaintyStatus =
  | {
      kind: "unknown";
      componentIds:
        readonly string[];
      limitation: string;
    }
  | {
      kind: "not-quantified";
      componentIds:
        readonly string[];
      limitation: string;
    }
  | {
      kind: "not-propagated";
      componentIds:
        readonly string[];
      limitation: string;
    }
  | {
      kind: "not-applicable";
      componentIds:
        readonly string[];
      limitation: string;
    };
```

## composeScientificAssurance

Composes scientific-status, evidence and uncertainty semantics without
inventing a numeric aggregate uncertainty.

Required downstream status is bounded by the weakest required input.
Component evidence/uncertainty is preserved verbatim after validation.

```ts
export function composeScientificAssurance(
  input:
    ComposeScientificAssuranceInput
): ComposedScientificAssurance;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ComposeScientificAssuranceInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ComposeScientificAssuranceInput {
  components:
    readonly ScientificAssuranceComponent[];
}
```

## SCIENTIFIC_ASSURANCE_CONTRACT_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
SCIENTIFIC_ASSURANCE_CONTRACT_VERSION =
  "0.1.0" as const
```

## ScientificAssuranceBasisKind

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type ScientificAssuranceBasisKind =
  | "evidence-backed-fact"
  | "photivra-model-assumption"
  | "not-applicable";
```

## ScientificAssuranceComponent

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ScientificAssuranceComponent {
  componentId: string;
  role: string;
  required: boolean;
  sourceIdentity:
    ScientificAssuranceSourceIdentity;
  basisKind:
    ScientificAssuranceBasisKind;
  scientificStatus:
    ScientificAssuranceStatus;
  evidenceRequirement:
    | "required"
    | "not-required";
  evidence:
    readonly EvidenceProvenance[];
  uncertainty:
    ScientificAssuranceComponentUncertainty;
  limitations:
    readonly string[];
}
```

## ScientificAssuranceComponentUncertainty

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type ScientificAssuranceComponentUncertainty =
  | {
      kind: "relative";
      fraction: number;
      basis: string;
    }
  | {
      kind: "absolute";
      plusMinus: number;
      unit: string;
      basis?: string;
    }
  | {
      kind: "calculation-quality";
      quality: CalculationQuality;
    }
  | {
      kind: "not-quantified";
      limitation: string;
    }
  | {
      kind: "unknown";
      limitation: string;
    }
  | {
      kind: "not-applicable";
      reason: string;
    };
```

## ScientificAssuranceSourceIdentity

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ScientificAssuranceSourceIdentity {
  kind: ScientificAssuranceSourceKind;
  id: string;
  version?: string;
}
```

## ScientificAssuranceSourceKind

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type ScientificAssuranceSourceKind =
  | "profile"
  | "result"
  | "model"
  | "fixture";
```

## ScientificAssuranceStatus

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type ScientificAssuranceStatus =
  | "calibrated"
  | "approximation"
  | "unknown";
```
