// SPDX-License-Identifier: Apache-2.0

import type {
  SpectralCoverageParticipant
} from "../core/spectral-composition.js";
import { InvalidScientificInputError } from "../core/validation.js";
import {
  parseSensorSpectralResponseProfile,
  type SensorSpectralChannelResponse,
  type SensorSpectralResponseProfile
} from "./spectral-response.js";

export interface CreateSensorSpectralCoverageParticipantInput {
  spectralResponseProfile:
    SensorSpectralResponseProfile;
  channelId: string;
  participantId?: string;
}

type ResponseCurve =
  | Extract<
      SensorSpectralChannelResponse,
      {
        kind:
          "effective-external-quantum-efficiency";
      }
    >["externalQuantumEfficiency"]
  | Extract<
      SensorSpectralChannelResponse,
      {
        kind:
          "effective-spectral-responsivity";
      }
    >["spectralResponsivity"]
  | Extract<
      SensorSpectralChannelResponse,
      {
        kind:
          "separable-channel-filter-and-detector-eqe";
      }
    >["channelFilterTransmittance"];

function responseCurves(
  response:
    SensorSpectralChannelResponse
): readonly ResponseCurve[] {
  if (
    response.kind ===
    "effective-external-quantum-efficiency"
  ) {
    return [
      response.externalQuantumEfficiency
    ];
  }
  if (
    response.kind ===
    "effective-spectral-responsivity"
  ) {
    return [
      response.spectralResponsivity
    ];
  }
  return [
    response.channelFilterTransmittance,
    response.detectorExternalQuantumEfficiency
  ];
}

/**
 * Adapts one parsed sensor response channel into the shared continuous
 * spectral-coverage contract.
 *
 * This exposes support and interpolation knots only. It does not apply QE or
 * A/W responsivity and does not establish scene/optics coverage.
 */
export function createSensorSpectralCoverageParticipant(
  input:
    CreateSensorSpectralCoverageParticipantInput
): SpectralCoverageParticipant {
  const profile =
    parseSensorSpectralResponseProfile(
      input.spectralResponseProfile
    );

  if (
    typeof input.channelId !==
      "string" ||
    input.channelId.trim().length === 0
  ) {
    throw new InvalidScientificInputError(
      "channelId must be a non-empty string."
    );
  }

  const response =
    profile.channels.find(
      (entry) =>
        entry.channelId ===
        input.channelId
    );
  if (response === undefined) {
    throw new InvalidScientificInputError(
      "No spectral response is declared for the requested channelId."
    );
  }

  const curves =
    responseCurves(response);
  const wavelengthBasis =
    curves[0]!.wavelengthBasis;
  if (wavelengthBasis === "unspecified") {
    throw new InvalidScientificInputError(
      "Sensor spectral coverage requires a resolved air or vacuum wavelength basis."
    );
  }
  if (
    curves.some(
      (curve) =>
        curve.wavelengthBasis !==
        wavelengthBasis
    )
  ) {
    throw new InvalidScientificInputError(
      "Sensor response component curves must share one wavelengthBasis before coverage composition."
    );
  }

  const minimum = Math.max(
    ...curves.map(
      (curve) =>
        curve.samples[0]!
          .wavelengthNanometers
    )
  );
  const maximum = Math.min(
    ...curves.map(
      (curve) =>
        curve.samples[
          curve.samples.length - 1
        ]!.wavelengthNanometers
    )
  );
  if (!(minimum < maximum)) {
    throw new InvalidScientificInputError(
      "Sensor response component curves do not share a non-empty wavelength interval."
    );
  }

  const breakpoints =
    new Set<number>();
  for (const curve of curves) {
    for (const sample of curve.samples) {
      if (
        sample.wavelengthNanometers >
          minimum &&
        sample.wavelengthNanometers <
          maximum
      ) {
        breakpoints.add(
          sample.wavelengthNanometers
        );
      }
    }
  }

  const participantId =
    input.participantId ??
    "sensor-response:" +
      profile.profileId +
      ":" +
      input.channelId;

  if (
    participantId.trim().length === 0
  ) {
    throw new InvalidScientificInputError(
      "participantId must be a non-empty string when supplied."
    );
  }

  return {
    participantId,
    role: "sensor-response",
    wavelengthBasis,
    wavelengthRangeNanometers: {
      minimum,
      maximum
    },
    breakpointsNanometers:
      [...breakpoints].sort(
        (a, b) => a - b
      )
  };
}
