// SPDX-License-Identifier: Apache-2.0

/**
 * Configuration failure is distinct from a scientifically well-formed unsupported request. Parsers
 * throw this typed error rather than coercing invalid schema/policy data; assessment/production
 * layers retain structured blockers for their declared incomplete capability cases.
 * @see docs/RELEASE_1_0.md and the corresponding domain guide.
 */

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
