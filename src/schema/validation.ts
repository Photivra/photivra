// SPDX-License-Identifier: Apache-2.0

import { InvalidConfigurationError } from "../core/configuration-error.js";
export { InvalidConfigurationError } from "../core/configuration-error.js";

import type {
  CameraConfiguration,
  CameraSupport
} from "./camera.js";
import type {
  SceneCapability,
  SceneDefinition
} from "./scene.js";

type UnknownRecord = Record<string, unknown>;

const CAMERA_SUPPORTS = new Set<CameraSupport>([
  "handheld",
  "braced",
  "monopod",
  "tripod"
]);

const SCENE_CAPABILITIES = new Set<SceneCapability>([
  "scene-linear-rgb",
  "metric-depth",
  "segmentation",
  "occlusion-layers",
  "motion-vectors",
  "focus-targets",
  "multi-resolution-layers",
  "absolute-radiometry"
]);

function requireRecord(value: unknown, path: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidConfigurationError(`${path} must be an object.`);
  }
  return value as UnknownRecord;
}

function requireString(
  record: UnknownRecord,
  key: string,
  path: string
): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidConfigurationError(
      `${path}.${key} must be a non-empty string.`
    );
  }
  return value;
}

function requireBoolean(
  record: UnknownRecord,
  key: string,
  path: string
): boolean {
  const value = record[key];
  if (typeof value !== "boolean") {
    throw new InvalidConfigurationError(
      `${path}.${key} must be a boolean.`
    );
  }
  return value;
}

function requirePositiveNumber(
  record: UnknownRecord,
  key: string,
  path: string
): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new InvalidConfigurationError(
      `${path}.${key} must be a finite number greater than zero.`
    );
  }
  return value;
}

function requirePositiveIntegerValue(
  record: UnknownRecord,
  key: string,
  path: string
): number {
  const value = record[key];
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new InvalidConfigurationError(
      `${path}.${key} must be a positive safe integer.`
    );
  }
  return value as number;
}

function assertVector3(value: unknown, path: string): void {
  const vector = requireRecord(value, path);
  for (const component of ["x", "y", "z"] as const) {
    const coordinate = vector[component];
    if (typeof coordinate !== "number" || !Number.isFinite(coordinate)) {
      throw new InvalidConfigurationError(
        `${path}.${component} must be a finite number.`
      );
    }
  }
}

function assertStringArray(value: unknown, path: string): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.some(
      (entry) => typeof entry !== "string" || entry.trim().length === 0
    )
  ) {
    throw new InvalidConfigurationError(
      `${path} must be an array of non-empty strings.`
    );
  }
  return value as readonly string[];
}

function assertUniqueStrings(values: readonly string[], path: string): void {
  const normalized = values.map((value) => value.trim());
  if (new Set(normalized).size !== normalized.length) {
    throw new InvalidConfigurationError(`${path} must not contain duplicates.`);
  }
}

/**
 * Parses and validates an untrusted camera configuration.
 *
 * @param value Unknown external data.
 * @returns The original value narrowed to CameraConfiguration.
 */
export function parseCameraConfiguration(
  value: unknown
): CameraConfiguration {
  const camera = requireRecord(value, "camera");

  const sensor = requireRecord(camera.sensor, "camera.sensor");
  requirePositiveNumber(sensor, "widthMm", "camera.sensor");
  requirePositiveNumber(sensor, "heightMm", "camera.sensor");
  requirePositiveIntegerValue(sensor, "pixelWidth", "camera.sensor");
  requirePositiveIntegerValue(sensor, "pixelHeight", "camera.sensor");

  const lens = requireRecord(camera.lens, "camera.lens");
  requirePositiveNumber(lens, "focalLengthMm", "camera.lens");
  requirePositiveNumber(lens, "aperture", "camera.lens");

  const exposure = requireRecord(camera.exposure, "camera.exposure");
  requirePositiveNumber(exposure, "shutterSeconds", "camera.exposure");
  requirePositiveNumber(exposure, "iso", "camera.exposure");

  const focus = requireRecord(camera.focus, "camera.focus");
  requirePositiveNumber(focus, "focusDistanceM", "camera.focus");

  if (camera.stabilization !== undefined) {
    const stabilization = requireRecord(
      camera.stabilization,
      "camera.stabilization"
    );
    requireBoolean(stabilization, "bodyEnabled", "camera.stabilization");
    requireBoolean(stabilization, "lensEnabled", "camera.stabilization");
    const support = requireString(
      stabilization,
      "support",
      "camera.stabilization"
    );
    if (!CAMERA_SUPPORTS.has(support as CameraSupport)) {
      throw new InvalidConfigurationError(
        "camera.stabilization.support is invalid."
      );
    }
  }

  return value as CameraConfiguration;
}

/**
 * Parses and validates an untrusted renderer-independent scene definition.
 *
 * @param value Unknown external data.
 * @returns The original value narrowed to SceneDefinition.
 */
export function parseSceneDefinition(value: unknown): SceneDefinition {
  const scene = requireRecord(value, "scene");
  requireString(scene, "schemaVersion", "scene");
  requireString(scene, "id", "scene");
  requireString(scene, "version", "scene");

  const radiometry = requireRecord(scene.radiometry, "scene.radiometry");
  const radiometryKind = requireString(
    radiometry,
    "kind",
    "scene.radiometry"
  );
  requirePositiveNumber(radiometry, "referenceValue", "scene.radiometry");

  if (radiometryKind === "absolute-luminance") {
    requirePositiveNumber(
      radiometry,
      "referenceLuminanceCdM2",
      "scene.radiometry"
    );
  } else if (radiometryKind !== "relative-linear") {
    throw new InvalidConfigurationError("scene.radiometry.kind is invalid.");
  }

  const capabilities = assertStringArray(
    scene.capabilities,
    "scene.capabilities"
  );
  assertUniqueStrings(capabilities, "scene.capabilities");
  for (const capability of capabilities) {
    if (!SCENE_CAPABILITIES.has(capability as SceneCapability)) {
      throw new InvalidConfigurationError(
        `Unknown scene capability: ${capability}`
      );
    }
  }

  if (!Array.isArray(scene.objects)) {
    throw new InvalidConfigurationError("scene.objects must be an array.");
  }

  const objectIds: string[] = [];
  scene.objects.forEach((objectValue, index) => {
    const path = `scene.objects[${index}]`;
    const object = requireRecord(objectValue, path);
    objectIds.push(requireString(object, "id", path));
    requirePositiveNumber(object, "distanceM", path);

    if (object.label !== undefined && typeof object.label !== "string") {
      throw new InvalidConfigurationError(`${path}.label must be a string.`);
    }
    if (object.tags !== undefined) {
      assertStringArray(object.tags, `${path}.tags`);
    }
    if (object.motion !== undefined) {
      const motion = requireRecord(object.motion, `${path}.motion`);
      assertVector3(
        motion.linearVelocityMps,
        `${path}.motion.linearVelocityMps`
      );
      if (motion.angularVelocityRadPerSec !== undefined) {
        assertVector3(
          motion.angularVelocityRadPerSec,
          `${path}.motion.angularVelocityRadPerSec`
        );
      }
    }
  });
  assertUniqueStrings(objectIds, "scene.objects[].id");

  if (scene.focusTargetIds !== undefined) {
    const focusTargetIds = assertStringArray(
      scene.focusTargetIds,
      "scene.focusTargetIds"
    );
    assertUniqueStrings(focusTargetIds, "scene.focusTargetIds");
    const knownIds = new Set(objectIds);
    for (const focusTargetId of focusTargetIds) {
      if (!knownIds.has(focusTargetId)) {
        throw new InvalidConfigurationError(
          `Unknown scene focus target: ${focusTargetId}`
        );
      }
    }
  }

  return value as SceneDefinition;
}
