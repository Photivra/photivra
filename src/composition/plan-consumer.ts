// SPDX-License-Identifier: Apache-2.0

/**
 * Module boundary and integration notes.
 * Creates a deterministic renderer/reference consumption view over one finalized semantic production
 * plan. The consumer role changes execution responsibility only. It does not alter scientific
 * stage/effect identity, temporal sample count, seeds, or physical results.
 * @see docs/PRODUCTION_COMPOSITION.md for equations, coordinate/unit conventions, blockers and support
 * limits.
 */

import { InvalidConfigurationError } from "../core/configuration-error.js";
import type {
  ImageFormationEffectId,
  ImageFormationStageId
} from "../core/image-formation.js";
import {
  PRODUCTION_IMAGE_FORMATION_PLAN_VERSION,
  type ProductionImageFormationBlocker,
  type ProductionImageFormationPlan,
  type RendererConsumerKind
} from "./image-formation-plan.js";

export const PRODUCTION_PLAN_CONSUMER_MANIFEST_VERSION =
  "0.2.0" as const;

export interface CreateProductionPlanConsumerManifestInput {
  plan: ProductionImageFormationPlan;
  consumerKind: RendererConsumerKind;
}

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

function requireConsumerKind(
  value: unknown
): RendererConsumerKind {
  if (
    value !== "interactive-optimized" &&
    value !== "reference"
  ) {
    throw new InvalidConfigurationError(
      "consumerKind is invalid."
    );
  }
  return value;
}

function requirePlan(
  plan: ProductionImageFormationPlan
): void {
  if (
    plan.version !==
    PRODUCTION_IMAGE_FORMATION_PLAN_VERSION
  ) {
    throw new InvalidConfigurationError(
      'plan.version must be "' +
        PRODUCTION_IMAGE_FORMATION_PLAN_VERSION +
        '".'
    );
  }
  if (
    typeof plan.fingerprint?.value !==
      "string" ||
    plan.fingerprint.value.length === 0
  ) {
    throw new InvalidConfigurationError(
      "plan fingerprint must be present."
    );
  }
}

/**
 * Creates a deterministic renderer/reference consumption view over one
 * finalized semantic production plan.
 *
 * The consumer role changes execution responsibility only. It does not alter
 * scientific stage/effect identity, temporal sample count, seeds, or physical
 * results.
 */
export function createProductionPlanConsumerManifest(
  input:
    CreateProductionPlanConsumerManifestInput
): ProductionPlanConsumerManifest {
  requirePlan(input.plan);
  const consumerKind =
    requireConsumerKind(
      input.consumerKind
    );

  const activeOrModeledStages =
    input.plan.stagePlan
      .filter(
        (stage) =>
          stage.state ===
            "active" ||
          stage.state ===
            "modeled-zero"
      )
      .map((stage) => ({
        stageId: stage.stageId,
        state: stage.state as
          | "active"
          | "modeled-zero",
        ...(stage.modelId ===
        undefined
          ? {}
          : {
              modelId:
                stage.modelId
            }),
        ...(stage.modelVersion ===
        undefined
          ? {}
          : {
              modelVersion:
                stage.modelVersion
            }),
        ...(stage.resultIdentity ===
        undefined
          ? {}
          : {
              resultIdentity:
                stage.resultIdentity
            })
      }));

  const activeOrModeledEffects =
    input.plan.effectPlan
      .filter(
        (effect) =>
          effect.state ===
            "active" ||
          effect.state ===
            "modeled-zero"
      )
      .map((effect) => ({
        effectId: effect.effectId,
        state: effect.state as
          | "active"
          | "modeled-zero",
        ...(effect.modelId ===
        undefined
          ? {}
          : {
              modelId:
                effect.modelId
            }),
        ...(effect.modelVersion ===
        undefined
          ? {}
          : {
              modelVersion:
                effect.modelVersion
            })
      }));

  return {
    version:
      PRODUCTION_PLAN_CONSUMER_MANIFEST_VERSION,
    consumerKind,
    planVersion:
      PRODUCTION_IMAGE_FORMATION_PLAN_VERSION,
    planFingerprint:
      input.plan.fingerprint.value,
    planStatus:
      input.plan.status,
    activeOrModeledStages,
    activeOrModeledEffects,
    ...(input.plan.environmentCaptureResult === undefined ? {} : { environmentCaptureResult: input.plan.environmentCaptureResult }),
    ...(input.plan.processedOutputResult === undefined ? {} : { processedOutputResult: input.plan.processedOutputResult }),
    blockers:
      input.plan.blockers,
    physicalSceneToSensorResult:
      input.plan
        .physicalSceneToSensorResult,
    temporalCaptureResult:
      input.plan.temporalCaptureResult,
    scientificAssurance:
      input.plan.scientificAssurance,
    stochastic: {
      captureSeedUint32:
        input.plan.stochastic
          .captureSeedUint32,
      consumerMayReplaceSeed: false,
      backendRandomnessMayRedefineScientificResult:
        false
    },
    scientificSemanticsSharedAcrossConsumerKinds:
      true,
    consumerMayChangeScientificInputs:
      false,
    consumerMayReorderImageFormationStages:
      false,
    consumerMayReduceCommittedTemporalSampleCount:
      false
  };
}
