// SPDX-License-Identifier: Apache-2.0

/**
 * Size limits for the full native sensor, counted before any active-area or output crop.
 *
 * A RAW frame can be attached to a capture with up to 65,536 sites. The bounded reference producer,
 * reconstruction and execution allow 4,096. Another stage having the same numeric limit does not make
 * its scientific domain interchangeable with these.
 * @see docs/RELEASE_1_0.md and the corresponding domain guide.
 */

/** Limit for attaching a RAW frame to a capture. It does not allow reconstruction or export at this size. */
export const RAW_ATTACHMENT_MAX_NATIVE_SITES = 65_536;
/** Full-sensor limit shared by the reference producer and reconstruction. */
export const RAW_REFERENCE_MAX_NATIVE_SITES = 4_096;
