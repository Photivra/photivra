// SPDX-License-Identifier: Apache-2.0

/**
 * Deterministic JSON text for engine-owned plain data, with object keys sorted.
 *
 * The same data always gives the same text, so records can be compared by identity.
 * This is serialization only. It is not a general input parser, a cryptographic hash or
 * an implementation of a canonical-JSON standard.
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
 * Serializes a parsed, acyclic tree of plain data to JSON text.
 *
 * Object keys (enumerable) are sorted. Arrays keep their order. Numbers must be finite.
 * String escaping and negative zero follow JSON.stringify. The input is never changed.
 *
 * The domain policy decides what happens to undefined object properties. These always
 * fail with the policy's unsupported-value message:
 * - undefined array entries and array holes;
 * - non-plain objects (Map, Set, Date, typed arrays, class instances, or any prototype
 *   other than Object.prototype or null);
 * - unsupported scalar types.
 *
 * The caller must rule out cycles first. This is serialization only. It is not a general
 * input parser, a cryptographic hash or an implementation of a canonical-JSON standard.
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
