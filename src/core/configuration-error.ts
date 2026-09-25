// SPDX-License-Identifier: Apache-2.0

/**
 * Error thrown when external configuration data does not match a public
 * runtime schema.
 */
export class InvalidConfigurationError extends TypeError {
  readonly code = "INVALID_CONFIGURATION";

  constructor(message: string) {
    super(message);
    this.name = "InvalidConfigurationError";
  }
}
