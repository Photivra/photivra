// SPDX-License-Identifier: Apache-2.0

/**
 * Error thrown when a public scientific calculation receives invalid input.
 */
export class InvalidScientificInputError extends RangeError {
  readonly code = "INVALID_SCIENTIFIC_INPUT";

  constructor(message: string) {
    super(message);
    this.name = "InvalidScientificInputError";
  }
}

/**
 * Error thrown when a scientific calculation would return a non-finite
 * numeric value that is unsafe for JSON and downstream consumers.
 */
export class InvalidScientificResultError extends RangeError {
  readonly code = "INVALID_SCIENTIFIC_RESULT";

  constructor(message: string) {
    super(message);
    this.name = "InvalidScientificResultError";
  }
}

/**
 * Requires a finite number greater than zero.
 *
 * @param name Public parameter name.
 * @param value Value to validate.
 */
export function requirePositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new InvalidScientificInputError(
      `${name} must be a finite number greater than zero.`
    );
  }
}

/**
 * Requires a positive safe integer.
 *
 * @param name Public parameter name.
 * @param value Value to validate.
 */
export function requirePositiveInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new InvalidScientificInputError(
      `${name} must be a positive safe integer.`
    );
  }
}
