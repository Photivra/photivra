// SPDX-License-Identifier: Apache-2.0

import {
  approximationResult,
  type CalculationResult
} from "../core/calculation-result.js";
import {
  InvalidScientificInputError,
  requirePositiveFinite
} from "../core/validation.js";

export interface RadialDistortionCoefficients {
  /** Dimensionless r² coefficient. */
  k1: number;
  /** Dimensionless r⁴ coefficient. */
  k2: number;
  /** Dimensionless r⁶ coefficient. */
  k3: number;
}

export interface RadialDistortionProfile {
  /**
   * Physical image-plane radius used to normalize field position, in mm.
   * Coefficients are meaningful only with this declared normalization.
   */
  normalizationRadiusMm: number;
  /**
   * Maximum undistorted normalized radius over which this profile is declared
   * valid and must remain one-to-one/invertible.
   */
  maximumNormalizedRadius: number;
  coefficients: RadialDistortionCoefficients;
}

export interface LensFieldPointMm {
  /** Image-plane X coordinate relative to the optical axis, in mm. */
  x: number;
  /** Image-plane Y coordinate relative to the optical axis, in mm. */
  y: number;
}

export interface CalculateRadialDistortionMappingInput {
  /** Ideal/undistorted image-plane point. */
  imagePointMm: LensFieldPointMm;
  profile: RadialDistortionProfile;
}

export interface CalculateInverseRadialDistortionMappingInput {
  /** Distorted image-plane point to inverse-map back to ideal coordinates. */
  distortedImagePointMm: LensFieldPointMm;
  profile: RadialDistortionProfile;
}

export interface CalculateInverseRadialDistortionMappingsInput {
  /** Distorted image-plane destinations to inverse-map in one validated batch. */
  distortedImagePointsMm: readonly LensFieldPointMm[];
  profile: RadialDistortionProfile;
}

export interface RadialDistortionMapping {
  direction: "undistorted-to-distorted";
  sourceImagePointMm: LensFieldPointMm;
  mappedImagePointMm: LensFieldPointMm;
  sourceNormalizedRadius: number;
  mappedNormalizedRadius: number;
  radialScale: number;
  deltaMm: {
    x: number;
    y: number;
    distance: number;
  };
  profileMinimumRadialDerivative: number;
}

export interface InverseRadialDistortionMapping {
  direction: "distorted-to-undistorted";
  distortedImagePointMm: LensFieldPointMm;
  sourceImagePointMm: LensFieldPointMm;
  distortedNormalizedRadius: number;
  sourceNormalizedRadius: number;
  radialScaleAtSource: number;
  deltaMm: {
    x: number;
    y: number;
    distance: number;
  };
  profileMinimumRadialDerivative: number;
}

export interface InverseRadialDistortionMappings {
  direction: "distorted-to-undistorted-batch";
  mappings: readonly InverseRadialDistortionMapping[];
  pointCount: number;
  profileMinimumRadialDerivative: number;
}

/** @internal Shared by composite lens-field batch evaluators; not root-exported. */
export interface ValidatedRadialProfile {
  normalizationRadiusMm: number;
  maximumNormalizedRadius: number;
  coefficients: RadialDistortionCoefficients;
  minimumRadialDerivative: number;
  maximumMappedNormalizedRadius: number;
}

const INVERSE_BISECTION_ITERATIONS = 80;
const INVERSE_MAPPED_RADIUS_FLOATING_TOLERANCE_ULPS = 16;

function requireFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new InvalidScientificInputError(`${name} must be finite.`);
  }
}

function inverseMappedRadiusTolerance(
  distortedNormalizedRadius: number,
  maximumMappedNormalizedRadius: number
): number {
  return (
    Number.EPSILON *
    INVERSE_MAPPED_RADIUS_FLOATING_TOLERANCE_ULPS *
    Math.max(
      1,
      Math.abs(distortedNormalizedRadius),
      Math.abs(maximumMappedNormalizedRadius)
    )
  );
}

function radialScale(
  normalizedRadius: number,
  coefficients: RadialDistortionCoefficients
): number {
  const r2 = normalizedRadius * normalizedRadius;
  const r4 = r2 * r2;
  const r6 = r4 * r2;
  return (
    1 +
    coefficients.k1 * r2 +
    coefficients.k2 * r4 +
    coefficients.k3 * r6
  );
}

function mappedNormalizedRadius(
  normalizedRadius: number,
  coefficients: RadialDistortionCoefficients
): number {
  return normalizedRadius * radialScale(normalizedRadius, coefficients);
}

function radialDerivativeFromSquaredRadius(
  squaredRadius: number,
  coefficients: RadialDistortionCoefficients
): number {
  return (
    1 +
    3 * coefficients.k1 * squaredRadius +
    5 * coefficients.k2 * squaredRadius * squaredRadius +
    7 *
      coefficients.k3 *
      squaredRadius *
      squaredRadius *
      squaredRadius
  );
}

function derivativeCriticalSquaredRadii(
  coefficients: RadialDistortionCoefficients
): number[] {
  // d/dr² of the radial derivative:
  // 3 k1 + 10 k2 s + 21 k3 s² = 0, where s = r².
  //
  // Scale the quadratic before solving so finite caller coefficients cannot
  // overflow the discriminant calculation. Use the stable q-form roots so a
  // tiny quadratic term cannot erase the smaller physical root through
  // cancellation and accidentally let a non-monotonic profile pass.
  const a = 21 * coefficients.k3;
  const b = 10 * coefficients.k2;
  const c = 3 * coefficients.k1;
  const coefficientScale = Math.max(
    Math.abs(a),
    Math.abs(b),
    Math.abs(c)
  );

  if (coefficientScale === 0) {
    return [];
  }

  const scaledA = a / coefficientScale;
  const scaledB = b / coefficientScale;
  const scaledC = c / coefficientScale;

  if (scaledA === 0) {
    return scaledB === 0 ? [] : [-scaledC / scaledB];
  }

  const squaredB = scaledB * scaledB;
  const fourAC = 4 * scaledA * scaledC;
  const discriminant = squaredB - fourAC;
  const discriminantTolerance =
    Number.EPSILON *
    16 *
    Math.max(1, Math.abs(squaredB), Math.abs(fourAC));

  if (discriminant < -discriminantTolerance) {
    return [];
  }

  const root = Math.sqrt(Math.max(0, discriminant));
  if (root === 0) {
    return [-scaledB / (2 * scaledA)];
  }

  const q =
    -0.5 *
    (scaledB + (scaledB >= 0 ? root : -root));
  if (q === 0) {
    return [-scaledB / (2 * scaledA)];
  }

  return [q / scaledA, scaledC / q];
}

/** @internal Validates/copies one profile for repeated in-package evaluation. */
export function validateRadialDistortionProfile(
  profile: RadialDistortionProfile
): ValidatedRadialProfile {
  requirePositiveFinite(
    "profile.normalizationRadiusMm",
    profile.normalizationRadiusMm
  );
  requirePositiveFinite(
    "profile.maximumNormalizedRadius",
    profile.maximumNormalizedRadius
  );
  requireFinite("profile.coefficients.k1", profile.coefficients.k1);
  requireFinite("profile.coefficients.k2", profile.coefficients.k2);
  requireFinite("profile.coefficients.k3", profile.coefficients.k3);

  const maximumSquaredRadius =
    profile.maximumNormalizedRadius * profile.maximumNormalizedRadius;
  if (!Number.isFinite(maximumSquaredRadius)) {
    throw new InvalidScientificInputError(
      "profile.maximumNormalizedRadius is too large to evaluate safely."
    );
  }

  const candidates = [
    0,
    maximumSquaredRadius,
    ...derivativeCriticalSquaredRadii(profile.coefficients).filter(
      (value) => value > 0 && value < maximumSquaredRadius
    )
  ];
  const minimumRadialDerivative = Math.min(
    ...candidates.map((squaredRadius) =>
      radialDerivativeFromSquaredRadius(
        squaredRadius,
        profile.coefficients
      )
    )
  );

  if (
    !Number.isFinite(minimumRadialDerivative) ||
    minimumRadialDerivative <= 0
  ) {
    throw new InvalidScientificInputError(
      "Radial distortion profile must remain strictly monotonic over maximumNormalizedRadius so inverse mapping is single-valued."
    );
  }

  const maximumMappedRadius = mappedNormalizedRadius(
    profile.maximumNormalizedRadius,
    profile.coefficients
  );
  if (!Number.isFinite(maximumMappedRadius) || maximumMappedRadius <= 0) {
    throw new InvalidScientificInputError(
      "Radial distortion profile produces an invalid mapped operating radius."
    );
  }

  return {
    normalizationRadiusMm: profile.normalizationRadiusMm,
    maximumNormalizedRadius: profile.maximumNormalizedRadius,
    coefficients: { ...profile.coefficients },
    minimumRadialDerivative,
    maximumMappedNormalizedRadius: maximumMappedRadius
  };
}

function requirePoint(name: string, point: LensFieldPointMm): void {
  if (typeof point !== "object" || point === null) {
    throw new InvalidScientificInputError(
      `${name} must be an object with finite numeric x and y coordinates.`
    );
  }
  if (
    typeof point.x !== "number" ||
    typeof point.y !== "number" ||
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y)
  ) {
    throw new InvalidScientificInputError(
      `${name} must contain finite numeric x and y coordinates.`
    );
  }
}

function mappingAssumptions(): readonly string[] {
  return [
    "Generic rotationally symmetric radial polynomial field mapping",
    "Distortion is centered on the optical axis; decentering and tangential distortion are not modeled",
    "Normalized radius is image-plane radius divided by the caller-declared normalizationRadiusMm",
    "Radial scale is 1 + k1 r^2 + k2 r^4 + k3 r^6",
    "The declared operating radius is required to remain strictly monotonic so inverse mapping is single-valued",
    "Coefficients are generic caller inputs and do not represent a named lens unless separately calibrated with defensible provenance"
  ];
}

/**
 * Applies a generic radial lens-distortion field mapping to one ideal
 * image-plane point.
 *
 * The mapping is rotationally symmetric about the optical axis:
 *
 *   p_distorted = p_ideal * (1 + k1 r² + k2 r⁴ + k3 r⁶)
 *
 * where r is normalized by the caller-declared physical reference radius.
 *
 * The profile is accepted only when the radial mapping is strictly monotonic
 * over its declared operating radius, which makes inverse destination-to-source
 * sampling well-defined.
 */
export function calculateRadialDistortionMapping(
  input: CalculateRadialDistortionMappingInput
): CalculationResult<RadialDistortionMapping> {
  requirePoint("imagePointMm", input.imagePointMm);
  const profile = validateRadialDistortionProfile(input.profile);

  const sourceRadiusMm = Math.hypot(
    input.imagePointMm.x,
    input.imagePointMm.y
  );
  const sourceNormalizedRadius =
    sourceRadiusMm / profile.normalizationRadiusMm;
  requireFinite("imagePointMm normalized radius", sourceNormalizedRadius);

  if (sourceNormalizedRadius > profile.maximumNormalizedRadius) {
    throw new InvalidScientificInputError(
      "imagePointMm lies outside the radial distortion profile maximumNormalizedRadius."
    );
  }

  const scale = radialScale(
    sourceNormalizedRadius,
    profile.coefficients
  );
  const mappedImagePointMm = {
    x: input.imagePointMm.x * scale,
    y: input.imagePointMm.y * scale
  };
  const mappedRadius = sourceNormalizedRadius * scale;
  const deltaX = mappedImagePointMm.x - input.imagePointMm.x;
  const deltaY = mappedImagePointMm.y - input.imagePointMm.y;

  return approximationResult(
    {
      direction: "undistorted-to-distorted",
      sourceImagePointMm: { ...input.imagePointMm },
      mappedImagePointMm,
      sourceNormalizedRadius,
      mappedNormalizedRadius: mappedRadius,
      radialScale: scale,
      deltaMm: {
        x: deltaX,
        y: deltaY,
        distance: Math.hypot(deltaX, deltaY)
      },
      profileMinimumRadialDerivative:
        profile.minimumRadialDerivative
    },
    "generic-radial-lens-distortion",
    "1.0.0",
    mappingAssumptions()
  );
}

/**
 * Inverse-maps one distorted image-plane point to its ideal/undistorted source
 * coordinate for destination-to-source renderer sampling.
 *
 * The same profile monotonicity requirement used by the forward mapping makes
 * the inverse unique over the declared operating radius. A deterministic fixed
 * bisection count is used rather than an unconstrained iterative solver.
 */
export interface InverseRadialSourcePointValue {
  sourceImagePointMm: LensFieldPointMm;
  distortedNormalizedRadius: number;
  sourceNormalizedRadius: number;
  radialScaleAtSource: number;
}

/**
 * @internal Minimal inverse evaluation used by composite in-package batch
 * models that do not need the standalone radial delta/provenance envelope.
 */
export function calculateInverseRadialSourcePointValue(
  distortedImagePointMm: LensFieldPointMm,
  profile: ValidatedRadialProfile,
  pointPath: string
): InverseRadialSourcePointValue {
  requirePoint(pointPath, distortedImagePointMm);

  const distortedRadiusMm = Math.hypot(
    distortedImagePointMm.x,
    distortedImagePointMm.y
  );
  const distortedNormalizedRadius =
    distortedRadiusMm / profile.normalizationRadiusMm;
  requireFinite(
    `${pointPath} normalized radius`,
    distortedNormalizedRadius
  );

  const mappedRadiusTolerance = inverseMappedRadiusTolerance(
    distortedNormalizedRadius,
    profile.maximumMappedNormalizedRadius
  );
  if (
    distortedNormalizedRadius >
    profile.maximumMappedNormalizedRadius + mappedRadiusTolerance
  ) {
    throw new InvalidScientificInputError(
      `${pointPath} lies outside the mapped radial distortion profile operating radius.`
    );
  }
  const solverDistortedNormalizedRadius = Math.min(
    distortedNormalizedRadius,
    profile.maximumMappedNormalizedRadius
  );

  let sourceNormalizedRadius = 0;
  if (
    solverDistortedNormalizedRadius ===
    profile.maximumMappedNormalizedRadius
  ) {
    sourceNormalizedRadius = profile.maximumNormalizedRadius;
  } else if (solverDistortedNormalizedRadius > 0) {
    const { k1, k2, k3 } = profile.coefficients;
    if (k1 === 0 && k2 === 0 && k3 === 0) {
      sourceNormalizedRadius = solverDistortedNormalizedRadius;
    } else {
      let lower = 0;
      let upper = profile.maximumNormalizedRadius;

      for (
        let iteration = 0;
        iteration < INVERSE_BISECTION_ITERATIONS;
        iteration += 1
      ) {
        const midpoint = (lower + upper) / 2;
        if (midpoint === lower || midpoint === upper) {
          break;
        }

        const mapped = mappedNormalizedRadius(
          midpoint,
          profile.coefficients
        );
        if (mapped < solverDistortedNormalizedRadius) {
          lower = midpoint;
        } else {
          upper = midpoint;
        }
      }
      sourceNormalizedRadius = (lower + upper) / 2;
    }
  }

  const radialScaleAtSource = radialScale(
    sourceNormalizedRadius,
    profile.coefficients
  );
  const sourceImagePointMm =
    distortedNormalizedRadius === 0
      ? { x: 0, y: 0 }
      : solverDistortedNormalizedRadius === distortedNormalizedRadius
        ? {
            x: distortedImagePointMm.x / radialScaleAtSource,
            y: distortedImagePointMm.y / radialScaleAtSource
          }
        : {
            x:
              distortedImagePointMm.x *
              (sourceNormalizedRadius / distortedNormalizedRadius),
            y:
              distortedImagePointMm.y *
              (sourceNormalizedRadius / distortedNormalizedRadius)
          };

  return {
    sourceImagePointMm,
    distortedNormalizedRadius,
    sourceNormalizedRadius,
    radialScaleAtSource
  };
}

function calculateInverseRadialDistortionMappingValue(
  distortedImagePointMm: LensFieldPointMm,
  profile: ValidatedRadialProfile,
  pointPath: string
): InverseRadialDistortionMapping {
  const source = calculateInverseRadialSourcePointValue(
    distortedImagePointMm,
    profile,
    pointPath
  );
  const deltaX =
    source.sourceImagePointMm.x - distortedImagePointMm.x;
  const deltaY =
    source.sourceImagePointMm.y - distortedImagePointMm.y;

  return {
    direction: "distorted-to-undistorted",
    distortedImagePointMm: { ...distortedImagePointMm },
    sourceImagePointMm: source.sourceImagePointMm,
    distortedNormalizedRadius: source.distortedNormalizedRadius,
    sourceNormalizedRadius: source.sourceNormalizedRadius,
    radialScaleAtSource: source.radialScaleAtSource,
    deltaMm: {
      x: deltaX,
      y: deltaY,
      distance: Math.hypot(deltaX, deltaY)
    },
    profileMinimumRadialDerivative: profile.minimumRadialDerivative
  };
}

export function calculateInverseRadialDistortionMapping(
  input: CalculateInverseRadialDistortionMappingInput
): CalculationResult<InverseRadialDistortionMapping> {
  const profile = validateRadialDistortionProfile(input.profile);
  const mapping = calculateInverseRadialDistortionMappingValue(
    input.distortedImagePointMm,
    profile,
    "distortedImagePointMm"
  );

  return approximationResult(
    mapping,
    "generic-inverse-radial-lens-distortion",
    "1.0.0",
    [
      ...mappingAssumptions(),
      `Inverse radius uses exact center/identity/boundary solutions where applicable and otherwise up to ${INVERSE_BISECTION_ITERATIONS} deterministic bisection iterations, stopping when IEEE-754 bounds can no longer narrow`
    ]
  );
}

/**
 * Inverse-maps multiple distorted image-plane destinations while validating
 * and resolving the radial profile only once for the complete batch.
 *
 * The returned per-point mappings are numerically identical to the scalar API;
 * provenance and profile validation are shared once at the batch boundary.
 */
export function calculateInverseRadialDistortionMappings(
  input: CalculateInverseRadialDistortionMappingsInput
): CalculationResult<InverseRadialDistortionMappings> {
  const profile = validateRadialDistortionProfile(input.profile);
  if (!Array.isArray(input.distortedImagePointsMm)) {
    throw new InvalidScientificInputError(
      "distortedImagePointsMm must be an array of image-plane points."
    );
  }

  const mappings: InverseRadialDistortionMapping[] = [];
  for (
    let index = 0;
    index < input.distortedImagePointsMm.length;
    index += 1
  ) {
    const point = input.distortedImagePointsMm[index];
    if (point === undefined) {
      throw new InvalidScientificInputError(
        `distortedImagePointsMm[${index}] must be an image-plane point.`
      );
    }
    mappings.push(
      calculateInverseRadialDistortionMappingValue(
        point,
        profile,
        `distortedImagePointsMm[${index}]`
      )
    );
  }

  return approximationResult(
    {
      direction: "distorted-to-undistorted-batch",
      mappings,
      pointCount: mappings.length,
      profileMinimumRadialDerivative: profile.minimumRadialDerivative
    },
    "generic-inverse-radial-lens-distortion-batch",
    "1.0.0",
    [
      ...mappingAssumptions(),
      `Inverse radius uses exact center/identity/boundary solutions where applicable and otherwise up to ${INVERSE_BISECTION_ITERATIONS} deterministic bisection iterations per point, stopping when IEEE-754 bounds can no longer narrow`,
      "The radial profile is validated and its invariant extrema are resolved once for the batch"
    ]
  );
}
