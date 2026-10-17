// SPDX-License-Identifier: Apache-2.0

/**
 * Connects light-source spectra to the shared spectral helpers in core/spectral-composition.
 *
 * Continuous spectra become wavelength coverage with breakpoints. Discrete-line spectra keep
 * their own path and are never widened into continuous spectra.
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
import { requireInputObject, requireInputKeys } from "../core/record-validation.js";
import { parseSceneIlluminationSource } from "./illumination.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";

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
    throw new InvalidConfigurationError(
      "participantId must be a non-empty string when supplied."
    );
  }
  return candidate;
}

/**
 * Converts a continuous light-source spectrum into the shared spectral coverage
 * type (wavelength range plus breakpoints).
 *
 * Discrete-line spectra are handled separately and are never widened into
 * continuous breakpoints.
 */
export function createSceneIlluminationSpectralCoverageParticipant(
  input:
    CreateSceneIlluminationSpectralCoverageParticipantInput
): SpectralCoverageParticipant {
  requireInputKeys(input, "createSceneIlluminationSpectralCoverageParticipant", ["source", "participantId"]);
  requireInputObject(input.source, "source");
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
 * Splits a discrete-line light source into the amount carried by each line.
 *
 * Each relative line weight is a fraction of the source's declared total (integrated
 * over wavelength). A disabled source contributes zero. This helper does not handle
 * visibility, material response, light transport, outgoing scene radiance, optics or
 * sensor response.
 */
export function resolveSceneIlluminationDiscreteLineMeasure(
  source:
    SceneIlluminationSource
): SceneIlluminationDiscreteLineMeasure {
  requireInputObject(source, "resolveSceneIlluminationDiscreteLineMeasure input");
  // 2.0.0: the whole source is validated, so an unknown field at any level is rejected.
  parseSceneIlluminationSource(source, "source");
  requireInputObject(source.spectrum, "source.spectrum");
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
