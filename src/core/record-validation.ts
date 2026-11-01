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
 * From 2.0.0 an unknown key also names the field: `<message> Unknown field "<field>".`
 */
export function requireAllowlistedRecord(
  value: unknown, allowedKeys: readonly string[], message: string
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new InvalidConfigurationError(message);
  }
  for (const key in value) {
    if (Object.hasOwn(value, key) && !allowedKeys.includes(key)) {
      throw new InvalidConfigurationError(`${message} Unknown field ${JSON.stringify(key)}.`);
    }
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

/**
 * Rejects any own enumerable key of a versioned or engine record that is not on its allowlist, with
 * the message `<path> has unknown field "<field>".` The caller has already checked that `record` is
 * a plain object. Used at every object level of the `parse*()` record parsers, so a misspelled or
 * stale field in a stored profile fails instead of being silently dropped.
 */
export function rejectUnknownFields(record: object, allowedKeys: readonly string[], path: string): void {
  for (const key in record) {
    if (Object.hasOwn(record, key) && !allowedKeys.includes(key)) {
      throw new InvalidConfigurationError(`${path} has unknown field ${JSON.stringify(key)}.`);
    }
  }
}

/**
 * Checks the fixed-value flags that a parser writes into its own output (for example
 * `sceneRadianceCalculated: false`). They may be passed back in, so a parsed record parses again,
 * but only with exactly the fixed value; any other value is rejected rather than ignored.
 */
export function requireFixedFieldsWhenPresent(
  record: Readonly<Record<string, unknown>>, fixed: Readonly<Record<string, boolean | string>>, path: string
): void {
  for (const key of Object.keys(fixed)) {
    if (record[key] !== undefined && record[key] !== fixed[key]) {
      throw new InvalidConfigurationError(`${path}.${key} must be ${JSON.stringify(fixed[key])} when supplied.`);
    }
  }
}

/**
 * Fields of the shared relative / not-quantified uncertainty union used by many evidence-backed
 * profiles: `{ kind: "relative", fraction, basis }` or `{ kind: "not-quantified", limitation }`.
 */
export const UNCERTAINTY_VARIANT_FIELDS: Readonly<Record<string, readonly string[]>> = /* @__PURE__ */ Object.freeze({
  relative: /* @__PURE__ */ Object.freeze(["kind", "fraction", "basis"]),
  "not-quantified": /* @__PURE__ */ Object.freeze(["kind", "limitation"])
});

/**
 * For a record whose allowed fields depend on a discriminator (for example `kind` or
 * `schemaVersion`), rejects fields that the selected variant does not define. An unrecognized
 * discriminator is left to the caller, which reports it with its own message.
 */
export function rejectUnknownVariantFields(
  record: Readonly<Record<string, unknown>>, discriminator: string,
  allowedByVariant: Readonly<Record<string, readonly string[]>>, path: string
): void {
  const variant = record[discriminator];
  if (typeof variant === "string" && Object.hasOwn(allowedByVariant, variant)) {
    rejectUnknownFields(record, allowedByVariant[variant]!, path);
  }
}
