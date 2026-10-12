// SPDX-License-Identifier: Apache-2.0

/**
 * Module boundary and integration notes.
 * Serializes a parsed, acyclic plain-data tree with sorted enumerable object keys, original array
 * order and finite JSON numbers. JSON escaping and negative zero representation follow JSON.stringify.
 * The source is never mutated. Undefined object properties follow the explicit domain policy;
 * undefined array entries, array holes, non-plain objects (any prototype other than Object.prototype
 * or null, e.g. Map, Set, Date, typed arrays, class instances) and unsupported scalar types always
 * fail. Callers own cycle validation. This is serialization mechanics, not a general input parser,
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
 * entries, array holes, non-plain objects (Map, Set, Date, typed arrays, class
 * instances or any prototype other than Object.prototype/null) and unsupported
 * scalar types always fail with the policy's unsupported-value message. Callers
 * own cycle validation. This is serialization mechanics, not a
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
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      throw new InvalidConfigurationError(policy.unsupportedValueMessage);
    }
    let serialized = "[";
    for (let index = 0; index < value.length; index += 1) {
      // Holes are not JSON data; Array#map would skip them and emit invalid JSON.
      if (!Object.prototype.hasOwnProperty.call(value, index)) {
        throw new InvalidConfigurationError(policy.unsupportedValueMessage);
      }
      serialized += (index === 0 ? "" : ",") + stringifyCanonicalJson(value[index], policy);
    }
    return serialized + "]";
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value) as unknown;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new InvalidConfigurationError(policy.unsupportedValueMessage);
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((key) => policy.undefinedObjectProperties !== "omit" || record[key] !== undefined)
      .sort();
    return "{" + keys.map((key) => JSON.stringify(key) + ":" + stringifyCanonicalJson(record[key], policy)).join(",") + "}";
  }
  throw new InvalidConfigurationError(policy.unsupportedValueMessage);
}
