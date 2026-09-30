// SPDX-License-Identifier: Apache-2.0

import { InvalidConfigurationError } from "../core/configuration-error.js";
import {
  parseEvidenceList,
  type EvidenceBackedFact,
  type EvidenceProvenance
} from "../core/evidence-provenance.js";
import {
  parseSpectralWavelengthBasis,
  type SpectralWavelengthBasis
} from "../core/spectral.js";
import { InvalidScientificInputError } from "../core/validation.js";

type UnknownRecord = Record<string, unknown>;

export const FRONT_OF_LENS_FILTER_PROFILE_SCHEMA_VERSION =
  "0.1.0" as const;

export type FrontOfLensFilterScientificStatus =
  | "calibrated"
  | "approximation";

export type FrontOfLensFilterUncertainty =
  | {
      kind: "relative";
      fraction: number;
      basis: string;
    }
  | {
      kind: "not-quantified";
      limitation: string;
    };

export interface FrontOfLensFilterSpectralSample {
  wavelengthNanometers: number;
  linearTransmissionFactor: number;
}

export type FrontOfLensFilterTransmissionModel =
  | {
      kind: "neutral-linear-transmission";
      linearTransmissionFactor:
        EvidenceBackedFact<number>;
    }
  | {
      kind: "neutral-optical-density";
      opticalDensityBase10:
        EvidenceBackedFact<number>;
    }
  | {
      kind: "spectral-transmission";
      samples:
        EvidenceBackedFact<
          readonly FrontOfLensFilterSpectralSample[]
        >;
    };

export interface FrontOfLensFilterProfile {
  schemaVersion:
    typeof FRONT_OF_LENS_FILTER_PROFILE_SCHEMA_VERSION;
  filterId: string;
  profileVersion: string;
  identityScope:
    "photivra-generic-unbranded";
  position: "front-of-lens";
  scientificStatus:
    FrontOfLensFilterScientificStatus;
  wavelengthBasis:
    Exclude<
      SpectralWavelengthBasis,
      "unspecified"
    >;
  wavelengthRangeNanometers: {
    minimum: number;
    maximum: number;
  };
  transmission:
    FrontOfLensFilterTransmissionModel;
  uncertainty:
    FrontOfLensFilterUncertainty;
  polarizationModeled: false;
  wavelengthChangingBehaviorModeled:
    false;
  evidence: readonly EvidenceProvenance[];
  limitations: readonly string[];
}

export interface ResolveFrontOfLensFilterTransmissionInput {
  profile: FrontOfLensFilterProfile;
  wavelengthNanometers: number;
  wavelengthBasis:
    Exclude<
      SpectralWavelengthBasis,
      "unspecified"
    >;
}

export interface ResolvedFrontOfLensFilterTransmission {
  schemaVersion:
    typeof FRONT_OF_LENS_FILTER_PROFILE_SCHEMA_VERSION;
  filterId: string;
  profileVersion: string;
  identityScope:
    "photivra-generic-unbranded";
  position: "front-of-lens";
  scientificStatus:
    FrontOfLensFilterScientificStatus;
  wavelengthNanometers: number;
  wavelengthBasis:
    Exclude<
      SpectralWavelengthBasis,
      "unspecified"
    >;
  transmissionKind:
    FrontOfLensFilterTransmissionModel["kind"];
  linearTransmissionFactor: number;
  attenuationStops: number;
  opticalDensityBase10: number;
  polarizationModeled: false;
  wavelengthChangingBehaviorModeled:
    false;
  lensTransmissionIncluded: false;
  sensorOpticalStackIncluded: false;
  fieldThroughputIncluded: false;
  uncertainty:
    FrontOfLensFilterUncertainty;
  evidence: readonly EvidenceProvenance[];
  limitations: readonly string[];
}

export interface ComposeFrontOfLensFilterTransmissionInput {
  filters:
    readonly FrontOfLensFilterProfile[];
  wavelengthNanometers: number;
  wavelengthBasis:
    Exclude<
      SpectralWavelengthBasis,
      "unspecified"
    >;
}

export interface ComposedFrontOfLensFilterTransmission {
  schemaVersion:
    typeof FRONT_OF_LENS_FILTER_PROFILE_SCHEMA_VERSION;
  wavelengthNanometers: number;
  wavelengthBasis:
    Exclude<
      SpectralWavelengthBasis,
      "unspecified"
    >;
  appliedFilterCount: number;
  components:
    readonly ResolvedFrontOfLensFilterTransmission[];
  combinedLinearTransmissionFactor:
    number;
  combinedAttenuationStops: number;
  scientificStatus:
    FrontOfLensFilterScientificStatus;
  uncertaintyPropagation:
    "not-propagated";
  uncertaintyLimitation: string;
  compositionModel:
    "independent-multiplicative-unpolarized-transmission-no-inter-filter-reflections";
  polarizationModeled: false;
  wavelengthChangingBehaviorModeled:
    false;
  lensTransmissionIncluded: false;
  sensorOpticalStackIncluded: false;
  fieldThroughputIncluded: false;
}

function requireRecord(
  value: unknown,
  path: string
): UnknownRecord {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new InvalidConfigurationError(
      path + " must be an object."
    );
  }
  return value as UnknownRecord;
}

function requireNonEmptyString(
  value: unknown,
  path: string
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new InvalidConfigurationError(
      path + " must be a non-empty string."
    );
  }
  return value.trim();
}

function requireFinite(
  value: unknown,
  path: string
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    throw new InvalidConfigurationError(
      path + " must be finite."
    );
  }
  return value;
}

function requirePositiveFinite(
  value: unknown,
  path: string
): number {
  const parsed = requireFinite(
    value,
    path
  );
  if (parsed <= 0) {
    throw new InvalidConfigurationError(
      path +
        " must be greater than zero."
    );
  }
  return parsed;
}

function requireNonNegativeFinite(
  value: unknown,
  path: string
): number {
  const parsed = requireFinite(
    value,
    path
  );
  if (parsed < 0) {
    throw new InvalidConfigurationError(
      path +
        " must be greater than or equal to zero."
    );
  }
  return parsed;
}

function requirePassiveTransmission(
  value: unknown,
  path: string
): number {
  const parsed = requirePositiveFinite(
    value,
    path
  );
  if (parsed > 1) {
    throw new InvalidConfigurationError(
      path +
        " must be less than or equal to one for a passive filter."
    );
  }
  return parsed;
}

function parseRange(
  value: unknown,
  path: string
): {
  minimum: number;
  maximum: number;
} {
  const record = requireRecord(
    value,
    path
  );
  const minimum =
    requirePositiveFinite(
      record.minimum,
      path + ".minimum"
    );
  const maximum =
    requirePositiveFinite(
      record.maximum,
      path + ".maximum"
    );
  if (minimum > maximum) {
    throw new InvalidConfigurationError(
      path +
        ".minimum must be less than or equal to maximum."
    );
  }
  return {
    minimum,
    maximum
  };
}

function parseResolvedBasis(
  value: unknown,
  path: string
): Exclude<
  SpectralWavelengthBasis,
  "unspecified"
> {
  const parsed =
    parseSpectralWavelengthBasis(
      value,
      path
    );
  if (parsed === "unspecified") {
    throw new InvalidConfigurationError(
      path +
        ' must resolve to "air" or "vacuum".'
    );
  }
  return parsed;
}

function parseScientificStatus(
  value: unknown,
  path: string
): FrontOfLensFilterScientificStatus {
  if (
    value !== "calibrated" &&
    value !== "approximation"
  ) {
    throw new InvalidConfigurationError(
      path + " is invalid."
    );
  }
  return value;
}

function parseUncertainty(
  value: unknown,
  path: string
): FrontOfLensFilterUncertainty {
  const record = requireRecord(
    value,
    path
  );

  if (record.kind === "relative") {
    const fraction =
      requireNonNegativeFinite(
        record.fraction,
        path + ".fraction"
      );
    if (fraction > 1) {
      throw new InvalidConfigurationError(
        path +
          ".fraction must be less than or equal to one."
      );
    }
    return {
      kind: "relative",
      fraction,
      basis:
        requireNonEmptyString(
          record.basis,
          path + ".basis"
        )
    };
  }

  if (
    record.kind ===
    "not-quantified"
  ) {
    return {
      kind: "not-quantified",
      limitation:
        requireNonEmptyString(
          record.limitation,
          path + ".limitation"
        )
    };
  }

  throw new InvalidConfigurationError(
    path + ".kind is invalid."
  );
}

function parseLimitations(
  value: unknown,
  path: string
): readonly string[] {
  if (!Array.isArray(value)) {
    throw new InvalidConfigurationError(
      path + " must be an array."
    );
  }
  const parsed = value.map(
    (entry, index) =>
      requireNonEmptyString(
        entry,
        path +
          "[" +
          index +
          "]"
      )
  );
  if (
    new Set(parsed).size !==
    parsed.length
  ) {
    throw new InvalidConfigurationError(
      path +
        " must not contain duplicates."
    );
  }
  return parsed;
}

function parseReusableNumericEvidence(
  value: unknown,
  path: string
): readonly EvidenceProvenance[] {
  const evidence =
    parseEvidenceList(
      value,
      path
    );
  if (
    evidence.some(
      (entry) =>
        entry.reuseStatus ===
        "factual-reference-only"
    )
  ) {
    throw new InvalidConfigurationError(
      path +
        " for embedded numeric filter data must be reusable-data or photivra-owned."
    );
  }
  return evidence;
}

function parseSpectralSamples(
  value: unknown,
  path: string
): readonly FrontOfLensFilterSpectralSample[] {
  if (
    !Array.isArray(value) ||
    value.length < 2
  ) {
    throw new InvalidConfigurationError(
      path +
        " must contain at least two samples."
    );
  }

  let previous =
    Number.NEGATIVE_INFINITY;
  return value.map(
    (entry, index) => {
      const samplePath =
        path +
        "[" +
        index +
        "]";
      const record =
        requireRecord(
          entry,
          samplePath
        );
      const wavelengthNanometers =
        requirePositiveFinite(
          record.wavelengthNanometers,
          samplePath +
            ".wavelengthNanometers"
        );
      if (
        wavelengthNanometers <=
        previous
      ) {
        throw new InvalidConfigurationError(
          path +
            " wavelengths must be strictly increasing."
        );
      }
      previous =
        wavelengthNanometers;
      return {
        wavelengthNanometers,
        linearTransmissionFactor:
          requirePassiveTransmission(
            record.linearTransmissionFactor,
            samplePath +
              ".linearTransmissionFactor"
          )
      };
    }
  );
}

function parseTransmission(
  value: unknown,
  path: string
): FrontOfLensFilterTransmissionModel {
  const record = requireRecord(
    value,
    path
  );

  if (
    record.kind ===
    "neutral-linear-transmission"
  ) {
    const fact = requireRecord(
      record.linearTransmissionFactor,
      path +
        ".linearTransmissionFactor"
    );
    return {
      kind:
        "neutral-linear-transmission",
      linearTransmissionFactor: {
        value:
          requirePassiveTransmission(
            fact.value,
            path +
              ".linearTransmissionFactor.value"
          ),
        evidence:
          parseEvidenceList(
            fact.evidence,
            path +
              ".linearTransmissionFactor.evidence"
          )
      }
    };
  }

  if (
    record.kind ===
    "neutral-optical-density"
  ) {
    const fact = requireRecord(
      record.opticalDensityBase10,
      path +
        ".opticalDensityBase10"
    );
    return {
      kind:
        "neutral-optical-density",
      opticalDensityBase10: {
        value:
          requireNonNegativeFinite(
            fact.value,
            path +
              ".opticalDensityBase10.value"
          ),
        evidence:
          parseEvidenceList(
            fact.evidence,
            path +
              ".opticalDensityBase10.evidence"
          )
      }
    };
  }

  if (
    record.kind ===
    "spectral-transmission"
  ) {
    const fact = requireRecord(
      record.samples,
      path + ".samples"
    );
    return {
      kind:
        "spectral-transmission",
      samples: {
        value:
          parseSpectralSamples(
            fact.value,
            path +
              ".samples.value"
          ),
        evidence:
          parseReusableNumericEvidence(
            fact.evidence,
            path +
              ".samples.evidence"
          )
      }
    };
  }

  throw new InvalidConfigurationError(
    path + ".kind is invalid."
  );
}

/**
 * Parses one generic front-of-lens transmission filter.
 *
 * Schema 0.1.0 is explicitly unbranded and unpolarized. It models only
 * passive transmission placed before the lens. Reflections between stacked
 * filters, polarization, flare/ghosting and wavelength-changing behavior are
 * outside this contract.
 */
export function parseFrontOfLensFilterProfile(
  value: unknown
): FrontOfLensFilterProfile {
  const record = requireRecord(
    value,
    "frontOfLensFilterProfile"
  );

  if (
    record.schemaVersion !==
    FRONT_OF_LENS_FILTER_PROFILE_SCHEMA_VERSION
  ) {
    throw new InvalidConfigurationError(
      'frontOfLensFilterProfile.schemaVersion must be "' +
        FRONT_OF_LENS_FILTER_PROFILE_SCHEMA_VERSION +
        '".'
    );
  }
  if (
    record.identityScope !==
    "photivra-generic-unbranded"
  ) {
    throw new InvalidConfigurationError(
      'frontOfLensFilterProfile.identityScope must be "photivra-generic-unbranded".'
    );
  }
  if (
    record.position !==
    "front-of-lens"
  ) {
    throw new InvalidConfigurationError(
      'frontOfLensFilterProfile.position must be "front-of-lens".'
    );
  }
  if (
    record.polarizationModeled !==
      false ||
    record.wavelengthChangingBehaviorModeled !==
      false
  ) {
    throw new InvalidConfigurationError(
      "frontOfLensFilterProfile must explicitly keep polarization and wavelength-changing behavior unmodeled in schema 0.1.0."
    );
  }

  const status =
    parseScientificStatus(
      record.scientificStatus,
      "frontOfLensFilterProfile.scientificStatus"
    );
  const uncertainty =
    parseUncertainty(
      record.uncertainty,
      "frontOfLensFilterProfile.uncertainty"
    );

  if (
    status === "calibrated" &&
    uncertainty.kind !==
      "relative"
  ) {
    throw new InvalidConfigurationError(
      "A calibrated filter profile requires quantified relative uncertainty."
    );
  }

  const range =
    parseRange(
      record.wavelengthRangeNanometers,
      "frontOfLensFilterProfile.wavelengthRangeNanometers"
    );
  const transmission =
    parseTransmission(
      record.transmission,
      "frontOfLensFilterProfile.transmission"
    );

  if (
    transmission.kind ===
    "spectral-transmission"
  ) {
    const samples =
      transmission.samples.value;
    if (
      samples[0]!
        .wavelengthNanometers >
        range.minimum ||
      samples[
        samples.length - 1
      ]!.wavelengthNanometers <
        range.maximum
    ) {
      throw new InvalidConfigurationError(
        "Spectral filter samples must cover the declared wavelength range."
      );
    }
  }

  return {
    schemaVersion:
      FRONT_OF_LENS_FILTER_PROFILE_SCHEMA_VERSION,
    filterId:
      requireNonEmptyString(
        record.filterId,
        "frontOfLensFilterProfile.filterId"
      ),
    profileVersion:
      requireNonEmptyString(
        record.profileVersion,
        "frontOfLensFilterProfile.profileVersion"
      ),
    identityScope:
      "photivra-generic-unbranded",
    position:
      "front-of-lens",
    scientificStatus:
      status,
    wavelengthBasis:
      parseResolvedBasis(
        record.wavelengthBasis,
        "frontOfLensFilterProfile.wavelengthBasis"
      ),
    wavelengthRangeNanometers:
      range,
    transmission,
    uncertainty,
    polarizationModeled:
      false,
    wavelengthChangingBehaviorModeled:
      false,
    evidence:
      parseEvidenceList(
        record.evidence,
        "frontOfLensFilterProfile.evidence"
      ),
    limitations:
      parseLimitations(
        record.limitations,
        "frontOfLensFilterProfile.limitations"
      )
  };
}

function interpolateSpectralTransmission(
  samples:
    readonly FrontOfLensFilterSpectralSample[],
  wavelengthNanometers: number
): number {
  const first =
    samples[0]!;
  const last =
    samples[
      samples.length - 1
    ]!;

  if (
    wavelengthNanometers ===
    first.wavelengthNanometers
  ) {
    return first
      .linearTransmissionFactor;
  }

  for (
    let index = 1;
    index < samples.length;
    index += 1
  ) {
    const right =
      samples[index]!;
    if (
      wavelengthNanometers <=
      right.wavelengthNanometers
    ) {
      const left =
        samples[
          index - 1
        ]!;
      if (
        wavelengthNanometers ===
        right.wavelengthNanometers
      ) {
        return right
          .linearTransmissionFactor;
      }
      const phase =
        (wavelengthNanometers -
          left.wavelengthNanometers) /
        (right.wavelengthNanometers -
          left.wavelengthNanometers);
      return (
        left
          .linearTransmissionFactor +
        phase *
          (right
              .linearTransmissionFactor -
            left
              .linearTransmissionFactor)
      );
    }
  }

  return last
    .linearTransmissionFactor;
}

function scientificWavelength(
  value: number
): number {
  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new InvalidScientificInputError(
      "wavelengthNanometers must be finite and greater than zero."
    );
  }
  return value;
}

function transmissionEvidence(
  transmission:
    FrontOfLensFilterTransmissionModel
): readonly EvidenceProvenance[] {
  if (
    transmission.kind ===
    "neutral-linear-transmission"
  ) {
    return transmission
      .linearTransmissionFactor
      .evidence;
  }
  if (
    transmission.kind ===
    "neutral-optical-density"
  ) {
    return transmission
      .opticalDensityBase10
      .evidence;
  }
  return transmission
    .samples.evidence;
}

/**
 * Resolves one passive filter at one wavelength.
 */
export function resolveFrontOfLensFilterTransmission(
  input:
    ResolveFrontOfLensFilterTransmissionInput
): ResolvedFrontOfLensFilterTransmission {
  const profile =
    parseFrontOfLensFilterProfile(
      input.profile
    );
  const wavelength =
    scientificWavelength(
      input.wavelengthNanometers
    );

  if (
    input.wavelengthBasis !==
    profile.wavelengthBasis
  ) {
    throw new InvalidScientificInputError(
      "Filter and requested wavelength bases must match; implicit air/vacuum conversion is not performed."
    );
  }
  if (
    wavelength <
      profile
        .wavelengthRangeNanometers
        .minimum ||
    wavelength >
      profile
        .wavelengthRangeNanometers
        .maximum
  ) {
    throw new InvalidScientificInputError(
      "Requested wavelength lies outside the filter applicability range."
    );
  }

  let factor: number;
  const transmission =
    profile.transmission;

  if (
    transmission.kind ===
    "neutral-linear-transmission"
  ) {
    factor =
      transmission
        .linearTransmissionFactor
        .value;
  } else if (
    transmission.kind ===
    "neutral-optical-density"
  ) {
    factor =
      Math.pow(
        10,
        -transmission
          .opticalDensityBase10
          .value
      );
  } else {
    factor =
      interpolateSpectralTransmission(
        transmission.samples.value,
        wavelength
      );
  }

  if (
    !Number.isFinite(factor) ||
    factor <= 0 ||
    factor > 1
  ) {
    throw new InvalidScientificInputError(
      "Resolved passive filter transmission must remain finite and in (0, 1]."
    );
  }

  const attenuationStops =
    -Math.log2(factor);
  const opticalDensityBase10 =
    -Math.log10(factor);

  if (
    !Number.isFinite(
      attenuationStops
    ) ||
    !Number.isFinite(
      opticalDensityBase10
    )
  ) {
    throw new InvalidScientificInputError(
      "Resolved filter attenuation diagnostics must remain finite."
    );
  }

  return {
    schemaVersion:
      FRONT_OF_LENS_FILTER_PROFILE_SCHEMA_VERSION,
    filterId:
      profile.filterId,
    profileVersion:
      profile.profileVersion,
    identityScope:
      "photivra-generic-unbranded",
    position:
      "front-of-lens",
    scientificStatus:
      profile.scientificStatus,
    wavelengthNanometers:
      wavelength,
    wavelengthBasis:
      input.wavelengthBasis,
    transmissionKind:
      transmission.kind,
    linearTransmissionFactor:
      factor,
    attenuationStops,
    opticalDensityBase10,
    polarizationModeled:
      false,
    wavelengthChangingBehaviorModeled:
      false,
    lensTransmissionIncluded:
      false,
    sensorOpticalStackIncluded:
      false,
    fieldThroughputIncluded:
      false,
    uncertainty:
      profile.uncertainty,
    evidence: [
      ...profile.evidence,
      ...transmissionEvidence(
        transmission
      )
    ],
    limitations: [
      ...profile.limitations,
      "Front-of-lens transmission is independent of lens aperture geometry, focus/DOF, diffraction and sensor optical-stack response.",
      "Polarization and inter-filter reflections/flare/ghosting are not modeled."
    ]
  };
}

/**
 * Composes multiple passive front-of-lens filters multiplicatively at one
 * wavelength while preserving each component's identity.
 */
export function composeFrontOfLensFilterTransmission(
  input:
    ComposeFrontOfLensFilterTransmissionInput
): ComposedFrontOfLensFilterTransmission {
  if (
    !Array.isArray(
      input.filters
    ) ||
    input.filters.length === 0
  ) {
    throw new InvalidScientificInputError(
      "filters must be a non-empty array."
    );
  }

  const components =
    input.filters.map(
      (profile) =>
        resolveFrontOfLensFilterTransmission({
          profile,
          wavelengthNanometers:
            input.wavelengthNanometers,
          wavelengthBasis:
            input.wavelengthBasis
        })
    );

  let combined = 1;
  for (
    const component of
    components
  ) {
    combined *=
      component
        .linearTransmissionFactor;
  }

  if (
    !Number.isFinite(combined) ||
    combined <= 0 ||
    combined > 1
  ) {
    throw new InvalidScientificInputError(
      "Combined passive filter transmission must remain finite and in (0, 1]."
    );
  }

  const stops =
    -Math.log2(combined);
  if (!Number.isFinite(stops)) {
    throw new InvalidScientificInputError(
      "Combined filter attenuation must remain finite."
    );
  }

  return {
    schemaVersion:
      FRONT_OF_LENS_FILTER_PROFILE_SCHEMA_VERSION,
    wavelengthNanometers:
      scientificWavelength(
        input.wavelengthNanometers
      ),
    wavelengthBasis:
      input.wavelengthBasis,
    appliedFilterCount:
      components.length,
    components,
    combinedLinearTransmissionFactor:
      combined,
    combinedAttenuationStops:
      stops,
    scientificStatus:
      components.some(
        (component) =>
          component
            .scientificStatus ===
          "approximation"
      )
        ? "approximation"
        : "calibrated",
    uncertaintyPropagation:
      "not-propagated",
    uncertaintyLimitation:
      "Component filter uncertainties are preserved individually; aggregate numeric uncertainty is not propagated because independence/correlation is not assumed.",
    compositionModel:
      "independent-multiplicative-unpolarized-transmission-no-inter-filter-reflections",
    polarizationModeled:
      false,
    wavelengthChangingBehaviorModeled:
      false,
    lensTransmissionIncluded:
      false,
    sensorOpticalStackIncluded:
      false,
    fieldThroughputIncluded:
      false
  };
}
