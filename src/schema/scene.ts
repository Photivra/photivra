// SPDX-License-Identifier: Apache-2.0

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
       * Relative linear values preserve light ratios but are not absolutely
       * calibrated for photon-count calculations.
       */
      kind: "relative-linear";
      referenceValue: number;
    }
  | {
      /**
       * Scene package includes an absolute luminance anchor that can support
       * calibrated photometric exposure work. Luminance alone is not
       * sufficient to derive photon counts; photon simulation additionally
       * requires defensible spectral and optical calibration.
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
 * Asset locations are intentionally not part of this scientific schema;
 * callers may bind the metadata to their own asset systems separately.
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
