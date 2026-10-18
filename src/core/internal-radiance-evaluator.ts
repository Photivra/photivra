// SPDX-License-Identifier: Apache-2.0

/**
 * Internal (not exported from the package): marks the scene-radiance evaluators that the engine itself builds for
 * `simulateCapture` chart scenes (2.6). Their results are object literals with the schema's exact keys, constant
 * schema/quantity/unit/status fields, the request's identifiers and deep-frozen engine-owned uncertainty, evidence
 * and limitations; the native environment then skips re-parsing those fixed parts (see
 * `parseSceneRadianceEvaluationResultWithValidatedRecords`). Evaluators from callers are never marked and keep the
 * full validation. The mark is on the function object, which only the engine holds.
 */
const INTERNAL_EVALUATORS = new WeakSet<object>();

/** Marks an engine-built evaluator and returns it. */
export function markInternalSceneRadianceEvaluator<T extends object>(evaluator: T): T {
  INTERNAL_EVALUATORS.add(evaluator);
  return evaluator;
}

/** True only for an evaluator marked by the engine. */
export function isInternalSceneRadianceEvaluator(evaluator: unknown): boolean {
  return typeof evaluator === "function" && INTERNAL_EVALUATORS.has(evaluator);
}

/** True when the value and everything reachable from it are frozen (primitives count as frozen). */
export function isDeeplyFrozen(value: unknown): boolean {
  if (value === null || typeof value !== "object") return typeof value !== "function";
  if (!Object.isFrozen(value)) return false;
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (descriptor.get !== undefined || descriptor.set !== undefined || !isDeeplyFrozen(descriptor.value)) return false;
  }
  return true;
}
