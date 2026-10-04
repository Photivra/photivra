// SPDX-License-Identifier: Apache-2.0
/** Ideal symmetric thin-lens pupil rays; no scene intersection or radiometry is performed. */
import { approximationResult, type CalculationResult } from "../core/calculation-result.js";
import { parseEvidenceList, type EvidenceProvenance } from "../core/evidence-provenance.js";
import { InvalidScientificInputError, requirePositiveFinite } from "../core/validation.js";
import { calculateFocusPlaneImageDistance, parseFocusPlane, type FocusPlane } from "./focus-state.js";
import { calculateInverseCameraRotationImageMapping, rotateVectorByAxisAngle,
  type CameraAngularVelocityRadPerSec } from "../motion/camera-rotation.js";
export interface IdealCircularPupil {
  kind: "ideal-uniform-circular-pupil";
  radialSampleCount: number;
  angularSampleCount: number;
  evidence: readonly EvidenceProvenance[];
  limitation: string;
}
export interface SensorApertureRay {
  /** Lens principal-plane origin and look direction in exposure-opening camera axes. */
  originM: { x: number; y: number; z: number };
  directionUnitVector: { x: number; y: number; z: number };
  pupilPointMm: { x: number; y: number };
  weight: number;
  pupilSampleIndex: number;
}
export interface CalculateSensorApertureRaysInput {
  sourcePointNativeSensorMm: { x: number; y: number };
  focalLengthMm: number;
  nominalFNumber: number;
  focus: FocusPlane;
  pupil: IdealCircularPupil;
  angularVelocityRadPerSec: CameraAngularVelocityRadPerSec;
  timeSecondsFromOpeningReference: number;
}
export interface SensorApertureRays {
  rays: readonly SensorApertureRay[];
  projectionDistanceMm: number;
  pupilRadiusMm: number;
  focus: FocusPlane;
  pupil: IdealCircularPupil;
  sceneVisibilityCalculated: false;
  radiometryCalculated: false;
  apertureAreaApplied: false;
}
/** Uniform-area polar midpoint rule, normalized as an average, never a second f-number factor. */
export function calculateSensorApertureRays(input: CalculateSensorApertureRaysInput): CalculationResult<SensorApertureRays> {
  const owned = structuredClone(input), pupil = owned.pupil;
  requirePositiveFinite("nominalFNumber", owned.nominalFNumber);
  if (!pupil || pupil.kind !== "ideal-uniform-circular-pupil" ||
    !Number.isSafeInteger(pupil.radialSampleCount) || pupil.radialSampleCount < 1 || pupil.radialSampleCount > 32 ||
    !Number.isSafeInteger(pupil.angularSampleCount) || pupil.angularSampleCount < 4 || pupil.angularSampleCount > 64 ||
    pupil.radialSampleCount*pupil.angularSampleCount > 256 || typeof pupil.limitation !== "string" || !pupil.limitation.trim()) {
    throw new InvalidScientificInputError("Circular pupil requires 1..32 radial, 4..64 angular midpoints, at most 256 rays and explicit limitations.");
  }
  pupil.evidence = parseEvidenceList(pupil.evidence, "circularPupil.evidence");
  const focus = parseFocusPlane(owned.focus);
  const v = calculateFocusPlaneImageDistance({ focalLengthMm: owned.focalLengthMm, focus }).value.imageDistanceMm;
  // Reuse the established rotation/time validation and forward-hemisphere gate.
  const inverse = calculateInverseCameraRotationImageMapping({ focalLengthMm: owned.focalLengthMm,
    imagePointMm: { x: owned.sourcePointNativeSensorMm.x, y: -owned.sourcePointNativeSensorMm.y },
    angularVelocityRadPerSec: owned.angularVelocityRadPerSec, timeSecondsFromExposureStart: owned.timeSecondsFromOpeningReference,
    ...(focus.kind === "finite" ? { focusDistanceM: focus.distanceM } : {}) }).value;
  const displacement = inverse.angularDisplacementRad, angle = displacement.magnitude;
  const axis = angle === 0 ? { x: 0, y: 0, z: 1 } : { x: displacement.pitch/angle, y: displacement.yaw/angle, z: displacement.roll/angle };
  const radius = owned.focalLengthMm/(2*owned.nominalFNumber), count = pupil.radialSampleCount*pupil.angularSampleCount;
  if (!Number.isFinite(radius) || radius <= 0) throw new InvalidScientificInputError("Pupil radius must remain positive and finite.");
  const rays = Array.from({ length: count }, (_, i): SensorApertureRay => {
    const r = radius*Math.sqrt((Math.floor(i/pupil.angularSampleCount)+.5)/pupil.radialSampleCount);
    const theta = 2*Math.PI*((i%pupil.angularSampleCount)+.5)/pupil.angularSampleCount;
    const point = { x: r*Math.cos(theta), y: r*Math.sin(theta) };
    const origin = { x: point.x/1000, y: point.y/1000, z: 0 };
    const x = owned.sourcePointNativeSensorMm.x/v, y = -owned.sourcePointNativeSensorMm.y/v;
    const direction = focus.kind === "finite" ? { x: x*focus.distanceM-origin.x, y: y*focus.distanceM-origin.y, z: focus.distanceM }
      : { x, y, z: 1 };
    const length = Math.hypot(direction.x,direction.y,direction.z);
    const unit = { x: direction.x/length, y: direction.y/length, z: direction.z/length };
    const rotatedOrigin = rotateVectorByAxisAngle(origin, axis, angle), rotatedDirection = rotateVectorByAxisAngle(unit, axis, angle);
    if (![...Object.values(rotatedOrigin),...Object.values(rotatedDirection)].every(Number.isFinite) || rotatedDirection.z <= 0) {
      throw new InvalidScientificInputError("A pupil ray leaves the supported forward hemisphere or finite coordinate domain.");
    }
    return { originM: rotatedOrigin, directionUnitVector: rotatedDirection, pupilPointMm: point, weight: 1/count, pupilSampleIndex: i };
  });
  return approximationResult({ rays, projectionDistanceMm: v, pupilRadiusMm: radius, focus, pupil,
    sceneVisibilityCalculated: false, radiometryCalculated: false, apertureAreaApplied: false }, "ideal-thin-lens-circular-pupil-rays", "0.1.0", [
    "Ideal symmetric paraxial thin lens, unity pupil magnification and uniform circular pupil; no diffraction, aberrations, lens housing or pupil clipping.",
    "Normalized pupil averaging is separate from the existing working-f-number radiometric factor; no aperture area or solid-angle factor is applied here.",
    "Pure camera rotation about the lens principal-plane origin; no translation or depth-dependent camera motion.",
    "Finite polar midpoint quadrature does not establish scene visibility, transport calibration or convergence."
  ]);
}
