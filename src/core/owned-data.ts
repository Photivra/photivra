// SPDX-License-Identifier: Apache-2.0

/**
 * Freezes an engine-owned, acyclic tree of plain records and arrays in place,
 * visiting enumerable child values before their parent. Returns the same value.
 *
 * This internal helper does not validate or clone data. Callers must first parse
 * their domain contract and copy any caller-owned references that need to remain
 * mutable. Primitives pass through unchanged. Already-frozen parents are still
 * traversed because a shallow freeze does not establish descendant immutability.
 *
 * Accessors, cyclic graphs, Maps, Sets and typed-array storage are outside this
 * helper's contract. Do not use it as a general-purpose untrusted-input boundary.
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
