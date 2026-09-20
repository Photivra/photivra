// SPDX-License-Identifier: Apache-2.0

import type { PocSimulationRequest } from "../simulation/poc-simulation.js";

type UnknownRecord = Record<string, unknown>;

/**
 * Error thrown when decoded HTTP JSON does not match the POC request shape.
 */
export class InvalidPocRequestError extends TypeError {
  readonly code = "INVALID_POC_REQUEST";

  constructor(message: string) {
    super(message);
    this.name = "InvalidPocRequestError";
  }
}

function requireRecord(value: unknown, path: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidPocRequestError(`${path} must be an object.`);
  }
  return value as UnknownRecord;
}

function requireFiniteNumber(
  record: UnknownRecord,
  key: string,
  path: string
): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new InvalidPocRequestError(
      `${path}.${key} must be a finite number.`
    );
  }
  return value;
}

function requireString(
  record: UnknownRecord,
  key: string,
  path: string
): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw new InvalidPocRequestError(`${path}.${key} must be a string.`);
  }
  return value;
}

function assertVector3(value: unknown, path: string): void {
  const vector = requireRecord(value, path);
  requireFiniteNumber(vector, "x", path);
  requireFiniteNumber(vector, "y", path);
  requireFiniteNumber(vector, "z", path);
}

function assertSensor(value: unknown): void {
  const sensor = requireRecord(value, "sensor");
  requireFiniteNumber(sensor, "widthMm", "sensor");
  requireFiniteNumber(sensor, "heightMm", "sensor");
  requireFiniteNumber(sensor, "pixelWidth", "sensor");
  requireFiniteNumber(sensor, "pixelHeight", "sensor");
}

function assertLens(value: unknown): void {
  const lens = requireRecord(value, "lens");
  requireFiniteNumber(lens, "focalLengthMm", "lens");
  requireFiniteNumber(lens, "aperture", "lens");
}

function assertExposure(value: unknown): void {
  const exposure = requireRecord(value, "exposure");
  requireFiniteNumber(exposure, "shutterSeconds", "exposure");
  requireFiniteNumber(exposure, "iso", "exposure");
}

function assertFocus(value: unknown): void {
  const focus = requireRecord(value, "focus");
  requireFiniteNumber(focus, "focusDistanceM", "focus");

  if (focus.circleOfConfusionMm !== undefined) {
    requireFiniteNumber(focus, "circleOfConfusionMm", "focus");
  }

  if (focus.equivalentViewingCircleOfConfusion !== undefined) {
    const equivalent = requireRecord(
      focus.equivalentViewingCircleOfConfusion,
      "focus.equivalentViewingCircleOfConfusion"
    );
    requireFiniteNumber(
      equivalent,
      "referenceSensorWidthMm",
      "focus.equivalentViewingCircleOfConfusion"
    );
    requireFiniteNumber(
      equivalent,
      "referenceSensorHeightMm",
      "focus.equivalentViewingCircleOfConfusion"
    );
    requireFiniteNumber(
      equivalent,
      "referenceCircleOfConfusionMm",
      "focus.equivalentViewingCircleOfConfusion"
    );
  }
}

function assertMotion(value: unknown, path: string): void {
  const motion = requireRecord(value, path);
  assertVector3(motion.positionM, `${path}.positionM`);
  assertVector3(motion.velocityMps, `${path}.velocityMps`);
}

function assertSubject(value: unknown): void {
  const subject = requireRecord(value, "subject");
  requireFiniteNumber(subject, "widthM", "subject");
  requireFiniteNumber(subject, "heightM", "subject");
  requireFiniteNumber(subject, "distanceM", "subject");
}

function assertDefocusSamples(value: unknown): void {
  if (!Array.isArray(value)) {
    throw new InvalidPocRequestError("defocusSamples must be an array.");
  }

  value.forEach((sampleValue, index) => {
    const path = `defocusSamples[${index}]`;
    const sample = requireRecord(sampleValue, path);
    requireString(sample, "id", path);
    requireFiniteNumber(sample, "distanceM", path);
  });
}

function assertSamplingSamples(value: unknown): void {
  if (!Array.isArray(value)) {
    throw new InvalidPocRequestError("samplingSamples must be an array.");
  }

  value.forEach((sampleValue, index) => {
    const path = `samplingSamples[${index}]`;
    const sample = requireRecord(sampleValue, path);
    requireString(sample, "id", path);
    requireFiniteNumber(sample, "widthM", path);
    requireFiniteNumber(sample, "heightM", path);
    requireFiniteNumber(sample, "distanceM", path);
  });
}

function assertMotionSamples(value: unknown): void {
  if (!Array.isArray(value)) {
    throw new InvalidPocRequestError("motionSamples must be an array.");
  }

  value.forEach((sampleValue, index) => {
    const path = `motionSamples[${index}]`;
    const sample = requireRecord(sampleValue, path);
    requireString(sample, "id", path);
    assertVector3(sample.positionM, `${path}.positionM`);
    assertVector3(sample.velocityMps, `${path}.velocityMps`);
  });
}

/**
 * Validates decoded HTTP JSON before it enters the scientific simulation.
 *
 * This parser checks request structure and JSON value types only. Domain/range
 * rules remain owned by the scientific calculation modules.
 *
 * @param value Decoded request body from the HTTP server.
 * @returns Structurally valid POC simulation request.
 */
export function parsePocSimulationRequest(
  value: unknown
): PocSimulationRequest {
  const request = requireRecord(value, "request");

  assertSensor(request.sensor);
  assertLens(request.lens);
  assertExposure(request.exposure);
  assertFocus(request.focus);

  const crop = requireRecord(request.crop, "crop");
  requireFiniteNumber(crop, "factor", "crop");

  const diffraction = requireRecord(request.diffraction, "diffraction");
  requireFiniteNumber(diffraction, "wavelengthNm", "diffraction");

  assertMotion(request.motion, "motion");

  if (request.subject !== undefined) {
    assertSubject(request.subject);
  }

  if (request.defocusSamples !== undefined) {
    assertDefocusSamples(request.defocusSamples);
  }

  if (request.samplingSamples !== undefined) {
    assertSamplingSamples(request.samplingSamples);
  }

  if (request.motionSamples !== undefined) {
    assertMotionSamples(request.motionSamples);
  }

  if (request.subjectCrop !== undefined) {
    const subjectCrop = requireRecord(request.subjectCrop, "subjectCrop");
    requireFiniteNumber(
      subjectCrop,
      "targetSubjectHeightFraction",
      "subjectCrop"
    );
  }

  if (request.cameraShake !== undefined) {
    const cameraShake = requireRecord(request.cameraShake, "cameraShake");
    const angularVelocity = requireRecord(
      cameraShake.angularVelocityRadPerSec,
      "cameraShake.angularVelocityRadPerSec"
    );
    requireFiniteNumber(
      angularVelocity,
      "yaw",
      "cameraShake.angularVelocityRadPerSec"
    );
    requireFiniteNumber(
      angularVelocity,
      "pitch",
      "cameraShake.angularVelocityRadPerSec"
    );
    requireFiniteNumber(
      cameraShake,
      "stabilizationStopsEquivalent",
      "cameraShake"
    );
  }

  if (request.apertureShape !== undefined) {
    const apertureShape = requireRecord(
      request.apertureShape,
      "apertureShape"
    );
    requireFiniteNumber(apertureShape, "bladeCount", "apertureShape");
    if (apertureShape.firstBladeEdgeAngleDegrees !== undefined) {
      requireFiniteNumber(
        apertureShape,
        "firstBladeEdgeAngleDegrees",
        "apertureShape"
      );
    }
  }

  if (request.diagnostics !== undefined) {
    const diagnostics = requireRecord(request.diagnostics, "diagnostics");
    if (diagnostics.subjectMotionSampleId !== undefined) {
      requireString(
        diagnostics,
        "subjectMotionSampleId",
        "diagnostics"
      );
    }
  }

  return value as PocSimulationRequest;
}
