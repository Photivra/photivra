// SPDX-License-Identifier: Apache-2.0

/**
 * Module boundary and integration notes.
 * Validate the shared record/allowlist mechanics without choosing a domain's schema or diagnostics.
 * Returns the original record; does not clone, freeze, strip fields, require missing fields, or
 * validate child values. As with the existing domain parsers, the allowlist covers own enumerable
 * string keys.
 * Shared opaque public identity grammar: 1–128 ASCII characters, starting with an alphanumeric
 * character, followed by alphanumerics, dot, underscore, colon or hyphen. No trimming, case conversion
 * or path/URL interpretation occurs. A domain retains the meaning of the identity and its exact error
 * message.
 * @see docs/API_STYLE.md for equations, coordinate/unit conventions, blockers and support limits.
 */

import { InvalidConfigurationError } from "./configuration-error.js";

/**
 * Validate the shared record/allowlist mechanics without choosing a domain's
 * schema or diagnostics. Returns the original record; does not clone, freeze,
 * strip fields, require missing fields, or validate child values. As with the
 * existing domain parsers, the allowlist covers own enumerable string keys.
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
 * Shared opaque public identity grammar: 1–128 ASCII characters, starting with
 * an alphanumeric character, followed by alphanumerics, dot, underscore, colon
 * or hyphen. No trimming, case conversion or path/URL interpretation occurs.
 * A domain retains the meaning of the identity and its exact error message.
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
 * Root-function input guard: throws the domain InvalidConfigurationError (never a raw TypeError
 * from a property read) when a public function receives null, a primitive or an array where it
 * requires an input object. Does not validate fields.
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
 * Input object guard for simple scalar calculators that also rejects unknown keys, so a misspelled
 * or wrong-unit field (for example focusDistanceMm next to focusDistanceM) is never silently ignored.
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
