// SPDX-License-Identifier: Apache-2.0

/**
 * Shared input checks used by the domain parsers: plain-record and allowed-key checks, the
 * public identifier grammar, and guards for the top-level argument of a public function.
 * Each domain keeps its own schema and error messages.
 * @see docs/API_STYLE.md for equations, coordinate/unit conventions, blockers and support limits.
 */

import { InvalidConfigurationError } from "./configuration-error.js";

/**
 * Checks that a value is a plain record whose keys are all on an allowlist. The caller
 * supplies the domain's schema and error messages.
 *
 * Returns the original record. It does not copy, freeze or strip fields, require missing
 * fields, or check child values. Like the domain parsers, it checks own enumerable string keys.
 */
export function requireAllowlistedRecord(
  value: unknown, allowedKeys: readonly string[], message: string
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some(key => !allowedKeys.includes(key))) {
    throw new InvalidConfigurationError(message);
  }
  return value as Record<string, unknown>;
}

/**
 * Shared grammar for public identifiers: 1–128 ASCII characters. The first is a letter or
 * digit. The rest are letters, digits, dot, underscore, colon or hyphen.
 *
 * The identifier is opaque: no trimming, case conversion or path/URL interpretation. Each
 * domain decides what the identifier means and keeps its exact error message.
 */
export function requirePublicOpaqueId(value: unknown, message: string): string {
  if (!isPublicOpaqueId(value)) {
    throw new InvalidConfigurationError(message);
  }
  return value;
}

/** Same grammar for domains that combine ID rejection with other field checks. */
export function isPublicOpaqueId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}

/**
 * Guard for a public function's input object. If it receives null, a primitive or an array,
 * it throws the domain's InvalidConfigurationError, never a raw TypeError from reading a
 * property. It does not check fields.
 */
export function requireInputObject(value: unknown, label: string): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new InvalidConfigurationError(`${label} must be an object.`);
  }
}

/** Root-function input guard for a required array argument; see requireInputObject. */
export function requireInputArray(value: unknown, label: string): void {
  if (!Array.isArray(value)) {
    throw new InvalidConfigurationError(`${label} must be an array.`);
  }
}

/**
 * Input object guard for simple scalar calculators that also rejects unknown keys. A misspelled
 * or wrong-unit field (for example focusDistanceMm instead of focusDistanceM) is never silently ignored.
 */
export function requireInputKeys(value: unknown, functionName: string, allowedKeys: readonly string[]): void {
  requireInputObject(value, `${functionName} input`);
  // for-in over own keys avoids allocating a key array on hot scalar paths.
  for (const key in value as object) {
    if (Object.hasOwn(value as object, key) && !allowedKeys.includes(key)) {
      throw new InvalidConfigurationError(`${functionName} input has unknown field ${JSON.stringify(key)}.`);
    }
  }
}
