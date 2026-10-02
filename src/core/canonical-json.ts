// SPDX-License-Identifier: Apache-2.0

/**
 * Module boundary and integration notes.
 * Serializes a parsed, acyclic plain-data tree with sorted enumerable object keys, original array
 * order and finite JSON numbers. JSON escaping and negative zero representation follow JSON.stringify.
 * The source is never mutated. Undefined object properties follow the explicit domain policy;
 * undefined array entries and unsupported scalar types always fail. Callers own dense-array,
 * plain-record and cycle validation. This is serialization mechanics, not a general input parser,
 * cryptographic hash or standardized canonical-JSON claim.
 * @see docs/API_STYLE.md for equations, coordinate/unit conventions, blockers and support limits.
 */

import { InvalidConfigurationError } from "./configuration-error.js";

/** Domain-specific omissions and diagnostics are part of serialized identity. */
export interface CanonicalJsonPolicy {
  undefinedObjectProperties: "omit" | "reject";
  nonFiniteNumberMessage: string;
  unsupportedValueMessage: string;
}

/**
 * Serializes a parsed, acyclic plain-data tree with sorted enumerable object
 * keys, original array order and finite JSON numbers. JSON escaping and negative
 * zero representation follow JSON.stringify. The source is never mutated.
 *
 * Undefined object properties follow the explicit domain policy; undefined array
 * entries and unsupported scalar types always fail. Callers own dense-array,
 * plain-record and cycle validation. This is serialization mechanics, not a
 * general input parser, cryptographic hash or standardized canonical-JSON claim.
 */
export function stringifyCanonicalJson(value: unknown, policy: CanonicalJsonPolicy): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new InvalidConfigurationError(policy.nonFiniteNumberMessage);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map((entry) => stringifyCanonicalJson(entry, policy)).join(",") + "]";
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((key) => policy.undefinedObjectProperties !== "omit" || record[key] !== undefined)
      .sort();
    return "{" + keys.map((key) => JSON.stringify(key) + ":" + stringifyCanonicalJson(record[key], policy)).join(",") + "}";
  }
  throw new InvalidConfigurationError(policy.unsupportedValueMessage);
}
