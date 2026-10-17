// SPDX-License-Identifier: Apache-2.0
import type { NativeEnvironmentRawTile } from "../../src/index.js";

/**
 * Supplier-side rewrites of a native environment tile that keep every physical value but change how the shared
 * source/optical/motion state is represented. They exercise the strict shared-state adoption fast path and its
 * canonical fallback; each must reproduce the RAW computed on main before that optimization.
 */
export type NativeEnvironmentTileVariant = "shared-references" | "reordered-keys" | "negative-zero";
export const nativeEnvironmentTileVariants: readonly NativeEnvironmentTileVariant[] = ["shared-references", "reordered-keys", "negative-zero"];

const SHARED_KEYS = ["sceneBindings", "optics", "motion", "psf", "pupil", "fieldThroughput"] as const;

function reversedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reversedKeys);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).reverse().map(key => [key, reversedKeys((value as Record<string, unknown>)[key])]));
}

export function applyNativeEnvironmentTileVariant(variant: NativeEnvironmentTileVariant, tile: NativeEnvironmentRawTile): void {
  const sites = tile.sites as unknown as { environment: Record<string, unknown> }[];
  if (variant === "shared-references") {
    // One object per shared field across the tile: the engine's whole-tile clone preserves that sharing.
    const first = sites[0]!.environment;
    for (const site of sites) for (const key of SHARED_KEYS) if (key in first) site.environment[key] = first[key];
  } else if (variant === "reordered-keys") {
    // Canonically equal but not strictly equal to native site 0: takes the canonical comparison path.
    for (const site of sites) if (!String(site.environment.temporalIntegrationId).endsWith(":native:0")) site.environment.optics = reversedKeys(site.environment.optics);
  } else {
    // Native site 3 carries -0 where the others carry 0: canonically equal, never adopted as strictly equal.
    for (const site of sites) {
      const motion = site.environment.motion as { angularVelocityRadPerSec: Record<string, number> };
      site.environment.motion = { ...motion, angularVelocityRadPerSec: { ...motion.angularVelocityRadPerSec,
        pitch: String(site.environment.temporalIntegrationId).endsWith(":native:3") ? -0 : 0 } };
    }
  }
}
