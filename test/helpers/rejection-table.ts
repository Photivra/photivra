// SPDX-License-Identifier: Apache-2.0
import { expect } from "vitest";

/** Loosely typed JSON-like record for mutating untrusted parser input in rejection tables. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any;

/** One row of a table-driven rejection test: a name, a mutation of a fresh valid input and the message fragment. */
export type RejectionCase = readonly [name: string, mutate: (input: Json) => void, messageFragment: string];

/**
 * Applies `mutate` to a fresh valid input and asserts that `run` throws the declared domain error
 * class with a message containing `messageFragment` (the fail-closed branch, not an incidental error).
 */
export function expectRejection(
  base: () => Json,
  run: (input: Json) => unknown,
  errorClass: new (...args: never[]) => Error,
  mutate: (input: Json) => void,
  messageFragment: string
): void {
  const input = base();
  mutate(input);
  let thrown: unknown;
  try {
    run(input);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(errorClass);
  expect((thrown as Error).message).toContain(messageFragment);
}
