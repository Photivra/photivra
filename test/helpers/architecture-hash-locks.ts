// SPDX-License-Identifier: Apache-2.0
/**
 * #508: some hash locks cover results that use V8's `Math` transcendental functions (`sin`, `cos`, `asin`, `atan2`, `log`).
 * Their results differ by one ulp between V8 on arm64 and on x64 for some arguments (measured on Node 24.19.0 and
 * 24.22.1, V8 13.6: the same on macOS and Linux within each architecture), neither being more accurate. The locks were
 * recorded on x64 and hold there unchanged. On arm64 a lock whose bytes differ is checked against its own recorded arm64
 * hash instead, so arm64 stays locked (docs/NUMERICAL_CORRECTNESS.md, "Test hash locks and platforms").
 */

/** `true` on arm64 (Apple silicon, Linux arm64), where the recorded arm64 hashes apply. */
export const ARM64 = process.arch === "arm64";

/**
 * The hash to expect on this architecture: on arm64 the arm64 hash recorded for this x64 lock, if its bytes differ there;
 * otherwise (x64 and every other architecture, or a lock that is the same on arm64) the x64 lock itself.
 */
export function hashLockOnThisArchitecture(x64Lock: string, arm64ByX64Lock: Readonly<Record<string, string>>): string {
  return ARM64 ? arm64ByX64Lock[x64Lock] ?? x64Lock : x64Lock;
}
