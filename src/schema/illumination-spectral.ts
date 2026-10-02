// SPDX-License-Identifier: Apache-2.0

/**
 * Module boundary and integration notes.
 * Adapts a continuous scene-illumination spectrum into the shared spectral coverage contract.
 * Discrete-line spectra intentionally use their own measure path and are never broadened into
 * continuous breakpoints.
 * Resolves a discrete illumination spectrum into integrated per-line source quantities. Relative line
 * weights are fractions of the declared wavelength-integrated source magnitude. A disabled source
 * resolves to zero contribution. This helper does not evaluate visibility, material response,
 * transport, outgoing scene radiance, optics, or sensor response.
 * @see docs/SCENE_RADIANCE_AND_ILLUMINATION.md for equations, coordinate/unit conventions, blockers
 * and support limits.
 */

import {
  distributeIntegratedQuantityAcrossDiscreteSpectralLines,
  type DiscreteSpectralLineMeasure,
  type DiscreteSpectralLineQuantityUnit,
  type SpectralCoverageParticipant
} from "../core/spectral-composition.js";
import { InvalidScientificInputError } from "../core/validation.js";
import type {
  SceneIlluminationScientificStatus,
  SceneIlluminationSource
} from "./illumination.js";

export interface CreateSceneIlluminationSpectralCoverageParticipantInput {
  source: SceneIlluminationSource;
  participantId?: string;
}

export interface SceneIlluminationDiscreteLineMeasure {
  sourceId: string;
  sourceFamily:
    SceneIlluminationSource["family"];
  sourceEnabled: boolean;
  spectrumId: string;
  magnitudeKind:
    SceneIlluminationSource["magnitude"]["kind"];
  magnitudeScientificStatus:
    SceneIlluminationScientificStatus;
  spectrumScientificStatus:
    "calibrated-relative-lines" |
    "approximation";
  measure: DiscreteSpectralLineMeasure;
  combinedUncertaintyCalculated: false;
  calibratedAbsoluteLineClaimAuthorized:
    false;
  materialTransportApplied: false;
  sceneRadianceCalculated: false;
}

function nonEmptyParticipantId(
  candidate: string
): string {
  if (candidate.trim().length === 0) {
    throw new InvalidScientificInputError(
      "participantId must be a non-empty string when supplied."
    );
  }
  return candidate;
}

/**
 * Adapts a continuous scene-illumination spectrum into the shared spectral
 * coverage contract.
 *
 * Discrete-line spectra intentionally use their own measure path and are never
 * broadened into continuous breakpoints.
 */
export function createSceneIlluminationSpectralCoverageParticipant(
  input:
    CreateSceneIlluminationSpectralCoverageParticipantInput
): SpectralCoverageParticipant {
  const spectrum = input.source.spectrum;
  if (
    spectrum.kind !==
    "continuous-relative-spectrum"
  ) {
    throw new InvalidScientificInputError(
      "Continuous spectral coverage requires a continuous-relative-spectrum; discrete lines, RGB, blackbody approximation, and unresolved spectra use different semantics."
    );
  }
  if (
    spectrum.wavelengthBasis ===
    "unspecified"
  ) {
    throw new InvalidScientificInputError(
      "Continuous illumination spectral coverage requires a resolved air or vacuum wavelength basis."
    );
  }

  const first = spectrum.samples[0]!;
  const last =
    spectrum.samples[
      spectrum.samples.length - 1
    ]!;
  const participantId =
    nonEmptyParticipantId(
      input.participantId ??
        "illumination-source:" +
          input.source.sourceId +
          ":" +
          spectrum.spectrumId
    );

  return {
    participantId,
    role: "illumination-source",
    wavelengthBasis:
      spectrum.wavelengthBasis,
    wavelengthRangeNanometers: {
      minimum:
        first.wavelengthNanometers,
      maximum:
        last.wavelengthNanometers
    },
    breakpointsNanometers:
      spectrum.samples
        .slice(1, -1)
        .map(
          (sample) =>
            sample.wavelengthNanometers
        )
  };
}

function magnitudeQuantity(
  source: SceneIlluminationSource
): {
  totalIntegratedQuantity: number;
  quantityUnit:
    DiscreteSpectralLineQuantityUnit;
  scientificStatus:
    SceneIlluminationScientificStatus;
} {
  const magnitude = source.magnitude;

  if (
    magnitude.kind ===
    "relative-linear-scale"
  ) {
    return {
      totalIntegratedQuantity:
        magnitude.scale,
      quantityUnit: "relative",
      scientificStatus:
        "approximation"
    };
  }
  if (
    magnitude.kind ===
    "radiant-intensity"
  ) {
    return {
      totalIntegratedQuantity:
        magnitude.wattsPerSteradian,
      quantityUnit: "W/sr",
      scientificStatus:
        magnitude.scientificStatus
    };
  }
  if (
    magnitude.kind ===
    "surface-radiance"
  ) {
    return {
      totalIntegratedQuantity:
        magnitude
          .wattsPerSquareMeterSteradian,
      quantityUnit: "W/m^2/sr",
      scientificStatus:
        magnitude.scientificStatus
    };
  }
  return {
    totalIntegratedQuantity:
      magnitude.wattsPerSquareMeter,
    quantityUnit: "W/m^2",
    scientificStatus:
      magnitude.scientificStatus
  };
}

/**
 * Resolves a discrete illumination spectrum into integrated per-line source
 * quantities.
 *
 * Relative line weights are fractions of the declared wavelength-integrated
 * source magnitude. A disabled source resolves to zero contribution. This
 * helper does not evaluate visibility, material response, transport, outgoing
 * scene radiance, optics, or sensor response.
 */
export function resolveSceneIlluminationDiscreteLineMeasure(
  source:
    SceneIlluminationSource
): SceneIlluminationDiscreteLineMeasure {
  if (
    source.spectrum.kind !==
    "discrete-relative-lines"
  ) {
    throw new InvalidScientificInputError(
      "Discrete line measure resolution requires a discrete-relative-lines spectrum."
    );
  }

  const magnitude =
    magnitudeQuantity(source);
  const effectiveTotal =
    source.enabled
      ? magnitude
          .totalIntegratedQuantity
      : 0;

  return {
    sourceId: source.sourceId,
    sourceFamily: source.family,
    sourceEnabled: source.enabled,
    spectrumId:
      source.spectrum.spectrumId,
    magnitudeKind:
      source.magnitude.kind,
    magnitudeScientificStatus:
      magnitude.scientificStatus,
    spectrumScientificStatus:
      source.spectrum
        .scientificStatus,
    measure:
      distributeIntegratedQuantityAcrossDiscreteSpectralLines(
        {
          distribution:
            source.spectrum
              .distribution,
          totalIntegratedQuantity:
            effectiveTotal,
          quantityUnit:
            magnitude.quantityUnit
        }
      ),
    combinedUncertaintyCalculated:
      false,
    calibratedAbsoluteLineClaimAuthorized:
      false,
    materialTransportApplied: false,
    sceneRadianceCalculated: false
  };
}
