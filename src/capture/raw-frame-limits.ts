// SPDX-License-Identifier: Apache-2.0

/**
 * Count the full native raster before active/output cropping. Structural attachment can preserve
 * up to 65,536 sites, while the bounded reference producer/reconstruction/execution envelope
 * permits 4,096. Equal numeric budgets in other stages do not make their scientific domains
 * interchangeable.
 * @see docs/RELEASE_1_0.md and the corresponding domain guide.
 */

/** Structural attachment budget; it does not authorize reconstruction/export. */
export const RAW_ATTACHMENT_MAX_NATIVE_SITES = 65_536;
/** Shared full-native budget of the reference producer and reconstruction path. */
export const RAW_REFERENCE_MAX_NATIVE_SITES = 4_096;
