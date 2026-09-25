// SPDX-License-Identifier: Apache-2.0

import {
  approximationResult,
  type CalculationResult
} from "../core/calculation-result.js";
import { InvalidScientificInputError } from "../core/validation.js";
import {
  calculateInverseRadialDistortionMapping,
  calculateRadialDistortionMapping,
  type LensFieldPointMm,
  type RadialDistortionCoefficients,
  type RadialDistortionProfile
} from "./radial-distortion.js";

export type LateralChromaticAberrationChannel = "red" | "green" | "blue";

export interface LateralChromaticAberrationProfile {
  /**
   * Shared physical image-plane normalization radius in millimetres.
   *
   * All channel coefficient sets use this same normalization so pairwise
   * separation has one unambiguous physical basis.
   */
  normalizationRadiusMm: number;
  /**
   * Shared maximum undistorted normalized radius over which every channel
   * profile must remain one-to-one/invertible.
   */
  maximumNormalizedRadius: number;
  channelCoefficients: {
    red: RadialDistortionCoefficients;
    green: RadialDistortionCoefficients;
    blue: RadialDistortionCoefficients;
  };
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

export interface LateralChromaticAberrationChannelMapping {
  mappedImagePointMm: LensFieldPointMm;
  radialScale: number;
  deltaMm: {
    x: number;
    y: number;
    distance: number;
  };
}

export interface InverseLateralChromaticAberrationChannelMapping {
  sourceImagePointMm: LensFieldPointMm;
  radialScaleAtSource: number;
  deltaMm: {
    x: number;
    y: number;
    distance: number;
  };
}

export interface ChannelSeparationMm {
  redGreen: number;
  blueGreen: number;
  redBlue: number;
  maximum: number;
}

export interface LateralChromaticAberrationMapping {
  direction: "undistorted-to-channel-distorted";
  sourceImagePointMm: LensFieldPointMm;
  channels: {
    red: LateralChromaticAberrationChannelMapping;
    green: LateralChromaticAberrationChannelMapping;
    blue: LateralChromaticAberrationChannelMapping;
  };
  pairwiseSeparationMm: ChannelSeparationMm;
}

export interface InverseLateralChromaticAberrationMapping {
  direction: "distorted-output-to-channel-sources";
  distortedImagePointMm: LensFieldPointMm;
  channels: {
    red: InverseLateralChromaticAberrationChannelMapping;
    green: InverseLateralChromaticAberrationChannelMapping;
    blue: InverseLateralChromaticAberrationChannelMapping;
  };
  pairwiseSourceSeparationMm: ChannelSeparationMm;
}

const CHANNELS = ["red", "green", "blue"] as const satisfies readonly LateralChromaticAberrationChannel[];

function channelProfile(
  profile: LateralChromaticAberrationProfile,
  channel: LateralChromaticAberrationChannel
): RadialDistortionProfile {
  return {
    normalizationRadiusMm: profile.normalizationRadiusMm,
    maximumNormalizedRadius: profile.maximumNormalizedRadius,
    coefficients: {
      ...profile.channelCoefficients[channel]
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

function distanceMm(
  first: LensFieldPointMm,
  second: LensFieldPointMm
): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function separations(
  red: LensFieldPointMm,
  green: LensFieldPointMm,
  blue: LensFieldPointMm
): ChannelSeparationMm {
  const redGreen = distanceMm(red, green);
  const blueGreen = distanceMm(blue, green);
  const redBlue = distanceMm(red, blue);

  return {
    redGreen,
    blueGreen,
    redBlue,
    maximum: Math.max(redGreen, blueGreen, redBlue)
  };
}

function assumptions(): readonly string[] {
  return [
    "Generic lateral chromatic aberration is represented as independent radial field mapping for abstract red, green, and blue renderer channels",
    "All channel mappings share one physical normalization radius and declared operating envelope",
    "Each channel radial profile must remain one-to-one over the declared operating envelope",
    "This RGB-channel model is not a spectral lens model, sensor CFA calibration, or colorimetric camera profile",
    "Longitudinal chromatic aberration, wavelength-dependent PSF behavior, tangential/decentered chromatic effects, and named-lens calibration are not modeled",
    "Renderer implementations should inverse-map each destination channel to its engine-derived source coordinate rather than applying a finished-image RGB blur"
  ];
}

/**
 * Calculates generic lateral chromatic-aberration field separation by mapping
 * one ideal image-plane point independently through red/green/blue radial
 * profiles.
 *
 * This is channel-dependent field mapping, not a blur kernel. It is intended
 * for generic renderer experimentation and deterministic regression, not
 * spectral or named-lens calibration.
 */
export function calculateLateralChromaticAberrationMapping(
  input: CalculateLateralChromaticAberrationMappingInput
): CalculationResult<LateralChromaticAberrationMapping> {
  const mapped = Object.fromEntries(
    CHANNELS.map((channel) => {
      const result = withChannelContext(channel, () =>
        calculateRadialDistortionMapping({
          imagePointMm: input.imagePointMm,
          profile: channelProfile(input.profile, channel)
        })
      );

      return [
        channel,
        {
          mappedImagePointMm: {
            ...result.value.mappedImagePointMm
          },
          radialScale: result.value.radialScale,
          deltaMm: {
            ...result.value.deltaMm
          }
        }
      ];
    })
  ) as LateralChromaticAberrationMapping["channels"];

  return approximationResult(
    {
      direction: "undistorted-to-channel-distorted",
      sourceImagePointMm: { ...input.imagePointMm },
      channels: mapped,
      pairwiseSeparationMm: separations(
        mapped.red.mappedImagePointMm,
        mapped.green.mappedImagePointMm,
        mapped.blue.mappedImagePointMm
      )
    },
    "generic-rgb-lateral-chromatic-aberration",
    "1.0.0",
    assumptions()
  );
}

/**
 * Inverse-maps one distorted output destination independently for red, green,
 * and blue so a renderer can sample each channel from the correct ideal source
 * coordinate.
 *
 * This preserves the image-formation contract's destination-to-source warp
 * semantics and avoids backend-specific chromatic-aberration equations.
 */
export function calculateInverseLateralChromaticAberrationMapping(
  input: CalculateInverseLateralChromaticAberrationMappingInput
): CalculationResult<InverseLateralChromaticAberrationMapping> {
  const mapped = Object.fromEntries(
    CHANNELS.map((channel) => {
      const result = withChannelContext(channel, () =>
        calculateInverseRadialDistortionMapping({
          distortedImagePointMm: input.distortedImagePointMm,
          profile: channelProfile(input.profile, channel)
        })
      );

      return [
        channel,
        {
          sourceImagePointMm: {
            ...result.value.sourceImagePointMm
          },
          radialScaleAtSource: result.value.radialScaleAtSource,
          deltaMm: {
            ...result.value.deltaMm
          }
        }
      ];
    })
  ) as InverseLateralChromaticAberrationMapping["channels"];

  return approximationResult(
    {
      direction: "distorted-output-to-channel-sources",
      distortedImagePointMm: {
        ...input.distortedImagePointMm
      },
      channels: mapped,
      pairwiseSourceSeparationMm: separations(
        mapped.red.sourceImagePointMm,
        mapped.green.sourceImagePointMm,
        mapped.blue.sourceImagePointMm
      )
    },
    "generic-inverse-rgb-lateral-chromatic-aberration",
    "1.0.0",
    assumptions()
  );
}
