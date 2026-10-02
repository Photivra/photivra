// SPDX-License-Identifier: Apache-2.0

/**
 * The root contract identity is embedded in capture/plan data. Package 1.0.0 deliberately retains
 * 0.116.0 so documentation/release metadata changes do not alter serialized scientific identity.
 * Distribution SemVer and independent model/schema versions remain separate.
 * @see docs/RELEASE_1_0.md and the corresponding domain guide.
 */

/**
 * Version of the public root-engine API contract.
 *
 * This is distinct from the npm package version and all subsystem/schema
 * contract versions.
 */
export const ENGINE_API_VERSION = "0.116.0" as const;
