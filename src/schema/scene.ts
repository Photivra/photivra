// SPDX-License-Identifier: Apache-2.0

/**
 * The legacy SceneConfiguration: the proof-of-concept (POC) subject and its representative
 * constant motion, plus the curated scene description types.
 *
 * It is not a spectral scene-radiance provider, a surface visibility solver or a physical
 * light-transport model. Keep this simpler request contract separate from the production
 * scene and provider types.
 * @see docs/RELEASE_1_0.md and the corresponding domain guide.
 */

/**
 * Three-dimensional value in scene/world coordinates.
 */
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Describes how scene-linear image values relate to physical light.
 */
export type SceneRadiometry =
  | {
      /**
       * Relative linear values keep light ratios correct but have no absolute
       * calibration, so they cannot be used to compute photon counts.
       */
      kind: "relative-linear";
      referenceValue: number;
    }
  | {
      /**
       * The scene package includes an absolute luminance reference, which can
       * support calibrated photometric exposure work. Luminance alone cannot give
       * photon counts. Simulating photons also needs defensible spectral and
       * optical calibration.
       */
      kind: "absolute-luminance";
      referenceValue: number;
      referenceLuminanceCdM2: number;
    };

/**
 * Motion attached to an independently controllable scene object or region.
 */
export interface SceneMotion {
  /** World-space linear velocity in metres per second. */
  linearVelocityMps: Vector3;
  /** Optional world-space angular velocity in radians per second. */
  angularVelocityRadPerSec?: Vector3;
}

/**
 * Semantic object/region within a curated synthetic scene.
 */
export interface SceneObject {
  id: string;
  label?: string;
  /** Representative distance from the camera origin in metres. */
  distanceM: number;
  motion?: SceneMotion;
  tags?: readonly string[];
}

/**
 * Capabilities intentionally advertised by a scene package.
 */
export type SceneCapability =
  | "scene-linear-rgb"
  | "metric-depth"
  | "segmentation"
  | "occlusion-layers"
  | "motion-vectors"
  | "focus-targets"
  | "multi-resolution-layers"
  | "absolute-radiometry";

/**
 * Versioned, renderer-independent description of a curated synthetic scene.
 *
 * Asset locations are deliberately left out of this scientific schema. Callers
 * can link the metadata to their own asset systems.
 */
export interface SceneDefinition {
  schemaVersion: string;
  id: string;
  version: string;
  radiometry: SceneRadiometry;
  capabilities: readonly SceneCapability[];
  objects: readonly SceneObject[];
  focusTargetIds?: readonly string[];
}
