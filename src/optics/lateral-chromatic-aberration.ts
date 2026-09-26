// SPDX-License-Identifier: Apache-2.0

import {
  approximationResult,
  type CalculationResult
} from "../core/calculation-result.js";
import { InvalidScientificInputError } from "../core/validation.js";
import {
  calculateInverseRadialDistortionMapping,
  calculateInverseRadialDistortionMappings,
  calculateRadialDistortionMapping,
  type LensFieldPointMm,
  type RadialDistortionCoefficients,
  type RadialDistortionProfile
} from "./radial-distortion.js";

export type LateralChromaticAberrationChannel = "red" | "green" | "blue";

export interface LateralChromaticAberrationProfile {
  /** Shared physical image-plane normalization radius in millimetres. */
  normalizationRadiusMm: number;
  /** Shared undistorted normalized-radius operating envelope. */
  maximumNormalizedRadius: number;
  /**
   * Green-reference base geometric distortion.
   *
   * This common mapping is included in every channel. Red/blue CA terms are
   * added to this base, so callers should not apply a second distortion pass.
   */
  baseDistortionCoefficients: RadialDistortionCoefficients;
  /** Additional red-channel radial coefficients relative to green. */
  redCoefficientOffset: RadialDistortionCoefficients;
  /** Additional blue-channel radial coefficients relative to green. */
  blueCoefficientOffset: RadialDistortionCoefficients;
}

export interface CalculateLateralChromaticAberrationMappingInput {
  /** Ideal/undistorted image-plane point shared by all channels. */
  imagePointMm: LensFieldPointMm;
  profile: LateralChromaticAberrationProfile;
}

export interface CalculateInverseLateralChromaticAberrationMappingInput {
  /**
   * Distorted output image-plane destination. Each output channel is inverse-
   * mapped independently to its ideal source coordinate.
   */
  distortedImagePointMm: LensFieldPointMm;
  profile: LateralChromaticAberrationProfile;
}

export interface CalculateInverseLateralChromaticAberrationMappingsInput {
  /**
   * Distorted output image-plane destinations. Each destination is inverse-
   * mapped independently for red, green, and blue after one profile-resolution
   * step for the batch.
   */
  distortedImagePointsMm: readonly LensFieldPointMm[];
  profile: LateralChromaticAberrationProfile;
}

export interface LateralChromaticAberrationChannelMapping {
  mappedImagePointMm: LensFieldPointMm;
  radialScale: number;
  combinedCoefficients: RadialDistortionCoefficients;
}

export interface InverseLateralChromaticAberrationChannelMapping {
  sourceImagePointMm: LensFieldPointMm;
  radialScaleAtSource: number;
  combinedCoefficients: RadialDistortionCoefficients;
}

export interface ChannelSeparationVectorMm {
  x: number;
  y: number;
  distance: number;
}

export interface LateralChromaticAberrationSeparation {
  redGreen: ChannelSeparationVectorMm;
  blueGreen: ChannelSeparationVectorMm;
  redBlue: ChannelSeparationVectorMm;
  maximumPairDistanceMm: number;
}

export interface LateralChromaticAberrationMapping {
  direction: "undistorted-to-channel-distorted";
  referenceChannel: "green";
  sourceImagePointMm: LensFieldPointMm;
  channels: {
    red: LateralChromaticAberrationChannelMapping;
    green: LateralChromaticAberrationChannelMapping;
    blue: LateralChromaticAberrationChannelMapping;
  };
  separation: LateralChromaticAberrationSeparation;
}

export interface InverseLateralChromaticAberrationMapping {
  direction: "distorted-output-to-channel-sources";
  referenceChannel: "green";
  distortedImagePointMm: LensFieldPointMm;
  channels: {
    red: InverseLateralChromaticAberrationChannelMapping;
    green: InverseLateralChromaticAberrationChannelMapping;
    blue: InverseLateralChromaticAberrationChannelMapping;
  };
  sourceSeparation: LateralChromaticAberrationSeparation;
}

export interface InverseLateralChromaticAberrationMappings {
  direction: "distorted-output-to-channel-sources-batch";
  referenceChannel: "green";
  mappings: readonly InverseLateralChromaticAberrationMapping[];
  pointCount: number;
}

interface ChannelProfiles {
  red: RadialDistortionProfile;
  green: RadialDistortionProfile;
  blue: RadialDistortionProfile;
}

function requireFiniteCoefficients(
  path: string,
  coefficients: RadialDistortionCoefficients
): void {
  for (const key of ["k1", "k2", "k3"] as const) {
    if (!Number.isFinite(coefficients[key])) {
      throw new InvalidScientificInputError(
        `${path}.${key} must be finite.`
      );
    }
  }
}

function addCoefficients(
  base: RadialDistortionCoefficients,
  offset: RadialDistortionCoefficients
): RadialDistortionCoefficients {
  return {
    k1: base.k1 + offset.k1,
    k2: base.k2 + offset.k2,
    k3: base.k3 + offset.k3
  };
}

function resolveProfiles(
  profile: LateralChromaticAberrationProfile
): ChannelProfiles {
  requireFiniteCoefficients(
    "profile.baseDistortionCoefficients",
    profile.baseDistortionCoefficients
  );
  requireFiniteCoefficients(
    "profile.redCoefficientOffset",
    profile.redCoefficientOffset
  );
  requireFiniteCoefficients(
    "profile.blueCoefficientOffset",
    profile.blueCoefficientOffset
  );

  const shared = {
    normalizationRadiusMm: profile.normalizationRadiusMm,
    maximumNormalizedRadius: profile.maximumNormalizedRadius
  };

  return {
    red: {
      ...shared,
      coefficients: addCoefficients(
        profile.baseDistortionCoefficients,
        profile.redCoefficientOffset
      )
    },
    green: {
      ...shared,
      coefficients: { ...profile.baseDistortionCoefficients }
    },
    blue: {
      ...shared,
      coefficients: addCoefficients(
        profile.baseDistortionCoefficients,
        profile.blueCoefficientOffset
      )
    }
  };
}

function withChannelContext<T>(
  channel: LateralChromaticAberrationChannel,
  calculate: () => T
): T {
  try {
    return calculate();
  } catch (error: unknown) {
    if (error instanceof InvalidScientificInputError) {
      throw new InvalidScientificInputError(
        `Lateral chromatic aberration ${channel} channel: ${error.message}`
      );
    }
    throw error;
  }
}

function separationVector(
  first: LensFieldPointMm,
  second: LensFieldPointMm
): ChannelSeparationVectorMm {
  const x = first.x - second.x;
  const y = first.y - second.y;
  return {
    x,
    y,
    distance: Math.hypot(x, y)
  };
}

function separations(
  red: LensFieldPointMm,
  green: LensFieldPointMm,
  blue: LensFieldPointMm
): LateralChromaticAberrationSeparation {
  const redGreen = separationVector(red, green);
  const blueGreen = separationVector(blue, green);
  const redBlue = separationVector(red, blue);

  return {
    redGreen,
    blueGreen,
    redBlue,
    maximumPairDistanceMm: Math.max(
      redGreen.distance,
      blueGreen.distance,
      redBlue.distance
    )
  };
}

function assumptions(): readonly string[] {
  return [
    "Generic lateral chromatic aberration is represented as independent radial field mapping for abstract red, green, and blue renderer channels",
    "Green is the reference field mapping; red and blue coefficient offsets are added to the green-reference base distortion rather than applied as a second warp",
    "All channel mappings share one physical normalization radius and declared operating envelope",
    "Each combined channel radial profile must remain one-to-one over the declared operating envelope",
    "The RGB channel labels are representative rendering channels, not calibrated wavelengths, sensor spectral responses, or CFA primaries",
    "This model changes channel field coordinates only; it does not blur, change PSF shape, modify channel intensity, or model longitudinal chromatic aberration",
    "Profiles are generic caller inputs and do not represent a named lens unless separately calibrated with defensible provenance"
  ];
}

/**
 * Calculates generic lateral chromatic-aberration field separation by mapping
 * one ideal image-plane point through a shared green-reference base distortion
 * and red/blue radial coefficient offsets.
 *
 * This is channel-dependent field mapping, not a blur kernel.
 */
export function calculateLateralChromaticAberrationMapping(
  input: CalculateLateralChromaticAberrationMappingInput
): CalculationResult<LateralChromaticAberrationMapping> {
  const profiles = resolveProfiles(input.profile);

  const red = withChannelContext("red", () =>
    calculateRadialDistortionMapping({
      imagePointMm: input.imagePointMm,
      profile: profiles.red
    })
  ).value;
  const green = withChannelContext("green", () =>
    calculateRadialDistortionMapping({
      imagePointMm: input.imagePointMm,
      profile: profiles.green
    })
  ).value;
  const blue = withChannelContext("blue", () =>
    calculateRadialDistortionMapping({
      imagePointMm: input.imagePointMm,
      profile: profiles.blue
    })
  ).value;

  return approximationResult(
    {
      direction: "undistorted-to-channel-distorted",
      referenceChannel: "green",
      sourceImagePointMm: { ...input.imagePointMm },
      channels: {
        red: {
          mappedImagePointMm: { ...red.mappedImagePointMm },
          radialScale: red.radialScale,
          combinedCoefficients: { ...profiles.red.coefficients }
        },
        green: {
          mappedImagePointMm: { ...green.mappedImagePointMm },
          radialScale: green.radialScale,
          combinedCoefficients: { ...profiles.green.coefficients }
        },
        blue: {
          mappedImagePointMm: { ...blue.mappedImagePointMm },
          radialScale: blue.radialScale,
          combinedCoefficients: { ...profiles.blue.coefficients }
        }
      },
      separation: separations(
        red.mappedImagePointMm,
        green.mappedImagePointMm,
        blue.mappedImagePointMm
      )
    },
    "generic-green-reference-lateral-chromatic-aberration",
    "1.0.0",
    assumptions()
  );
}

/**
 * Inverse-maps one distorted output destination independently for the
 * representative red/green/blue channels.
 *
 * Renderers can use the returned per-channel ideal source coordinates for
 * inverse sampling without inventing chromatic-aberration equations.
 */
export function calculateInverseLateralChromaticAberrationMapping(
  input: CalculateInverseLateralChromaticAberrationMappingInput
): CalculationResult<InverseLateralChromaticAberrationMapping> {
  const profiles = resolveProfiles(input.profile);

  const red = withChannelContext("red", () =>
    calculateInverseRadialDistortionMapping({
      distortedImagePointMm: input.distortedImagePointMm,
      profile: profiles.red
    })
  ).value;
  const green = withChannelContext("green", () =>
    calculateInverseRadialDistortionMapping({
      distortedImagePointMm: input.distortedImagePointMm,
      profile: profiles.green
    })
  ).value;
  const blue = withChannelContext("blue", () =>
    calculateInverseRadialDistortionMapping({
      distortedImagePointMm: input.distortedImagePointMm,
      profile: profiles.blue
    })
  ).value;

  return approximationResult(
    {
      direction: "distorted-output-to-channel-sources",
      referenceChannel: "green",
      distortedImagePointMm: { ...input.distortedImagePointMm },
      channels: {
        red: {
          sourceImagePointMm: { ...red.sourceImagePointMm },
          radialScaleAtSource: red.radialScaleAtSource,
          combinedCoefficients: { ...profiles.red.coefficients }
        },
        green: {
          sourceImagePointMm: { ...green.sourceImagePointMm },
          radialScaleAtSource: green.radialScaleAtSource,
          combinedCoefficients: { ...profiles.green.coefficients }
        },
        blue: {
          sourceImagePointMm: { ...blue.sourceImagePointMm },
          radialScaleAtSource: blue.radialScaleAtSource,
          combinedCoefficients: { ...profiles.blue.coefficients }
        }
      },
      sourceSeparation: separations(
        red.sourceImagePointMm,
        green.sourceImagePointMm,
        blue.sourceImagePointMm
      )
    },
    "generic-inverse-green-reference-lateral-chromatic-aberration",
    "1.0.0",
    assumptions()
  );
}

/**
 * Inverse-maps multiple distorted destinations while resolving the shared CA
 * profile once and validating each combined channel profile once for the
 * complete batch.
 *
 * Per-point values match calculateInverseLateralChromaticAberrationMapping();
 * provenance is shared once at the batch boundary.
 */
export function calculateInverseLateralChromaticAberrationMappings(
  input: CalculateInverseLateralChromaticAberrationMappingsInput
): CalculationResult<InverseLateralChromaticAberrationMappings> {
  const profiles = resolveProfiles(input.profile);

  const redBatch = withChannelContext("red", () =>
    calculateInverseRadialDistortionMappings({
      distortedImagePointsMm: input.distortedImagePointsMm,
      profile: profiles.red
    })
  ).value;
  const greenBatch = withChannelContext("green", () =>
    calculateInverseRadialDistortionMappings({
      distortedImagePointsMm: input.distortedImagePointsMm,
      profile: profiles.green
    })
  ).value;
  const blueBatch = withChannelContext("blue", () =>
    calculateInverseRadialDistortionMappings({
      distortedImagePointsMm: input.distortedImagePointsMm,
      profile: profiles.blue
    })
  ).value;

  const mappings = input.distortedImagePointsMm.map((point, index) => {
    const red = redBatch.mappings[index];
    const green = greenBatch.mappings[index];
    const blue = blueBatch.mappings[index];
    if (red === undefined || green === undefined || blue === undefined) {
      throw new Error("Lateral chromatic aberration batch channel lengths diverged.");
    }

    return {
      direction: "distorted-output-to-channel-sources" as const,
      referenceChannel: "green" as const,
      distortedImagePointMm: { ...point },
      channels: {
        red: {
          sourceImagePointMm: { ...red.sourceImagePointMm },
          radialScaleAtSource: red.radialScaleAtSource,
          combinedCoefficients: { ...profiles.red.coefficients }
        },
        green: {
          sourceImagePointMm: { ...green.sourceImagePointMm },
          radialScaleAtSource: green.radialScaleAtSource,
          combinedCoefficients: { ...profiles.green.coefficients }
        },
        blue: {
          sourceImagePointMm: { ...blue.sourceImagePointMm },
          radialScaleAtSource: blue.radialScaleAtSource,
          combinedCoefficients: { ...profiles.blue.coefficients }
        }
      },
      sourceSeparation: separations(
        red.sourceImagePointMm,
        green.sourceImagePointMm,
        blue.sourceImagePointMm
      )
    };
  });

  return approximationResult(
    {
      direction: "distorted-output-to-channel-sources-batch",
      referenceChannel: "green",
      mappings,
      pointCount: mappings.length
    },
    "generic-inverse-green-reference-lateral-chromatic-aberration-batch",
    "1.0.0",
    [
      ...assumptions(),
      "Combined red/green/blue radial profiles are resolved once for the batch",
      "Each channel profile is validated once before batch point sampling"
    ]
  );
}
