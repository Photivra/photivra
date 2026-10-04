# composition/plan-consumer.ts public contracts

Package **1.4.0**, root API **1.4.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## createProductionPlanConsumerManifest

Creates a deterministic renderer/reference consumption view over one
finalized semantic production plan.

The consumer role changes execution responsibility only. It does not alter
scientific stage/effect identity, temporal sample count, seeds, or physical
results.

```ts
export function createProductionPlanConsumerManifest(
  input:
    CreateProductionPlanConsumerManifestInput
): ProductionPlanConsumerManifest;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CreateProductionPlanConsumerManifestInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CreateProductionPlanConsumerManifestInput {
  plan: ProductionImageFormationPlan;
  consumerKind: RendererConsumerKind;
}
```

## PRODUCTION_PLAN_CONSUMER_MANIFEST_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
PRODUCTION_PLAN_CONSUMER_MANIFEST_VERSION =
  "0.2.0" as const
```

## ProductionPlanConsumerManifest

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ProductionPlanConsumerManifest {
  version:
    typeof PRODUCTION_PLAN_CONSUMER_MANIFEST_VERSION;
  consumerKind: RendererConsumerKind;
  planVersion:
    typeof PRODUCTION_IMAGE_FORMATION_PLAN_VERSION;
  planFingerprint: string;
  planStatus:
    ProductionImageFormationPlan["status"];
  activeOrModeledStages:
    readonly {
      stageId: ImageFormationStageId;
      state: "active" | "modeled-zero";
      modelId?: string;
      modelVersion?: string;
      resultIdentity?: string;
    }[];
  activeOrModeledEffects:
    readonly {
      effectId: ImageFormationEffectId;
      state: "active" | "modeled-zero";
      modelId?: string;
      modelVersion?: string;
    }[];
  blockers:
    readonly ProductionImageFormationBlocker[];
  /** Same immutable executed RAW and output results; consumers cannot re-render a different source. */
  environmentCaptureResult?: ProductionImageFormationPlan["environmentCaptureResult"];
  processedOutputResult?: ProductionImageFormationPlan["processedOutputResult"];
  physicalSceneToSensorResult:
    ProductionImageFormationPlan["physicalSceneToSensorResult"];
  temporalCaptureResult:
    ProductionImageFormationPlan["temporalCaptureResult"];
  scientificAssurance:
    ProductionImageFormationPlan["scientificAssurance"];
  stochastic: {
    captureSeedUint32: number;
    consumerMayReplaceSeed: false;
    backendRandomnessMayRedefineScientificResult:
      false;
  };
  scientificSemanticsSharedAcrossConsumerKinds:
    true;
  consumerMayChangeScientificInputs:
    false;
  consumerMayReorderImageFormationStages:
    false;
  consumerMayReduceCommittedTemporalSampleCount:
    false;
}
```
