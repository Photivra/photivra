// SPDX-License-Identifier: Apache-2.0

/**
 * Version of the public root-engine release, aligned with the npm package since 1.0.1.
 * New captures and plans record this creator identity; archived records retain theirs.
 * POC, schema and model contracts keep their independent versions.
 * Release checks enforce equality with package.json and the packed distribution.
 * @see docs/RELEASE_1_0_1.md
 */
export const ENGINE_API_VERSION = "1.1.0" as const;
