// SPDX-License-Identifier: Apache-2.0

/**
 * Internal helper that deep-freezes engine-owned results so callers cannot change them.
 * @see docs/API_STYLE.md for equations, coordinate/unit conventions, blockers and support limits.
 */

/**
 * Freezes an engine-owned, acyclic tree of plain records and arrays in place and
 * returns the same value. Children (enumerable values) are frozen before their parent.
 *
 * It does not validate or copy anything. Parse the domain input first, and copy any
 * caller-owned objects that must stay mutable. Primitives pass through unchanged. A
 * parent that is already frozen is still walked, because a shallow freeze says nothing
 * about its children.
 *
 * Not supported: accessors, cycles, Maps, Sets and typed-array storage. Do not use this
 * as a general guard for untrusted input.
 */
export function freezeOwnedData<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) {
      freezeOwnedData(child);
    }
    Object.freeze(value);
  }
  return value;
}
