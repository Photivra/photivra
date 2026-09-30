// SPDX-License-Identifier: Apache-2.0

import {
  approximationResult,
  calculatedResult,
  type CalculationResult
} from "../core/calculation-result.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";
import {
  parseEvidenceList,
  type EvidenceProvenance
} from "../core/evidence-provenance.js";
import { InvalidScientificInputError } from "../core/validation.js";
import type {
  SensorEqeExposureIntegration
} from "./constant-rate-temporal-integration.js";
import type {
  SensorSpectralResponseScientificStatus,
  SensorSpectralResponseUncertainty
} from "./spectral-response.js";

type UnknownRecord = Record<string, unknown>;

export type SensorDarkCurrentSiteApplicability =
  | {
      kind: "exact-site";
      site: {
        x: number;
        y: number;
      };
    }
  | {
      kind:
        "uniform-site-mean-approximation";
      limitation: string;
      evidence:
        readonly EvidenceProvenance[];
    };

export type SensorDarkCurrentTemperatureModel =
  | {
      kind:
        "fixed-reference-temperature";
      referenceTemperatureC: number;
      darkCurrentElectronsPerSecond:
        number;
    }
  | {
      kind:
        "piecewise-linear-temperature-table";
      interpolation: "piecewise-linear";
      outsideRangeBehavior:
        "fail-closed";
      samples: readonly {
        temperatureC: number;
        darkCurrentElectronsPerSecond:
          number;
      }[];
    };

export interface SensorDarkCurrentProfile {
  schemaVersion: "0.1.0";
  profileId: string;
  colorSamplingProfileId: string;
  channelId: string;
  scientificStatus:
    SensorSpectralResponseScientificStatus;
  uncertainty:
    SensorSpectralResponseUncertainty;
  evidence: readonly EvidenceProvenance[];
  chargeMeaning:
    "pre-compensation-thermally-generated-electrons";
  siteApplicability:
    SensorDarkCurrentSiteApplicability;
  temperatureModel:
    SensorDarkCurrentTemperatureModel;
  darkCurrentCompensationIncluded: false;
  spatialDarkCurrentNonuniformityModeled:
    boolean;
}

export interface CalculateSensorDarkCurrentChargeInput {
  exposure:
    SensorEqeExposureIntegration;
  darkCurrentProfile:
    SensorDarkCurrentProfile;
  operatingTemperatureC: number;
}

export interface SensorDarkCurrentCharge {
  darkCurrentProfileId: string;
  colorSamplingProfileId: string;
  channelId: string;
  site: {
    x: number;
    y: number;
  };
  operatingTemperatureC: number;
  temperatureModel:
    SensorDarkCurrentTemperatureModel["kind"];
  temperatureInterpolationUsed:
    boolean;
  darkCurrentElectronsPerSecond:
    number;
  localExposureDurationSeconds:
    number;
  expectedDarkElectronCount:
    number;
  countMeaning:
    "expected-thermally-generated-electrons";
  expectationValueOnly: true;
  integerDarkElectronCountSampled:
    false;
  darkShotNoiseApplied: false;
  darkCurrentCompensationApplied:
    false;
  spatialDarkCurrentNonuniformityModeled:
    boolean;
  photoSignalIncluded: false;
  otherChargeIncluded: false;
  physicalFullWellAssessmentAuthorized:
    false;
  saturationAssessed: false;
  componentEvidence: {
    darkCurrent:
      readonly EvidenceProvenance[];
    siteApproximation:
      readonly EvidenceProvenance[];
    exposure:
      SensorEqeExposureIntegration["componentEvidence"];
  };
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
  return value;
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

function requireNonNegativeFinite(
  value: unknown,
  path: string
): number {
  const parsed =
    requireFinite(value, path);
  if (parsed < 0) {
    throw new InvalidConfigurationError(
      path +
        " must be greater than or equal to zero."
    );
  }
  return parsed;
}

function requireSiteIndex(
  value: unknown,
  path: string
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new InvalidConfigurationError(
      path +
        " must be a non-negative safe integer."
    );
  }
  return value;
}

function parseUncertainty(
  value: unknown,
  path: string
): SensorSpectralResponseUncertainty {
  const record =
    requireRecord(value, path);

  if (record.kind === "relative") {
    const fraction =
      requireNonNegativeFinite(
        record.fraction,
        path + ".fraction"
      );
    if (
      typeof record.basis !== "string" ||
      record.basis.trim().length === 0
    ) {
      throw new InvalidConfigurationError(
        path +
          ".basis must be a non-empty string."
      );
    }
    return {
      kind: "relative",
      fraction,
      basis: record.basis
    };
  }

  if (
    record.kind === "not-quantified"
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

function parseSiteApplicability(
  value: unknown
): SensorDarkCurrentSiteApplicability {
  const record = requireRecord(
    value,
    "sensorDarkCurrent.siteApplicability"
  );

  if (record.kind === "exact-site") {
    const site = requireRecord(
      record.site,
      "sensorDarkCurrent.siteApplicability.site"
    );
    return {
      kind: "exact-site",
      site: {
        x: requireSiteIndex(
          site.x,
          "sensorDarkCurrent.siteApplicability.site.x"
        ),
        y: requireSiteIndex(
          site.y,
          "sensorDarkCurrent.siteApplicability.site.y"
        )
      }
    };
  }

  if (
    record.kind ===
    "uniform-site-mean-approximation"
  ) {
    return {
      kind:
        "uniform-site-mean-approximation",
      limitation:
        requireNonEmptyString(
          record.limitation,
          "sensorDarkCurrent.siteApplicability.limitation"
        ),
      evidence: parseEvidenceList(
        record.evidence,
        "sensorDarkCurrent.siteApplicability.evidence"
      )
    };
  }

  throw new InvalidConfigurationError(
    "sensorDarkCurrent.siteApplicability.kind is invalid."
  );
}

function parseTemperatureModel(
  value: unknown
): SensorDarkCurrentTemperatureModel {
  const record = requireRecord(
    value,
    "sensorDarkCurrent.temperatureModel"
  );

  if (
    record.kind ===
      "fixed-reference-temperature"
  ) {
    return {
      kind:
        "fixed-reference-temperature",
      referenceTemperatureC:
        requireFinite(
          record.referenceTemperatureC,
          "sensorDarkCurrent.temperatureModel.referenceTemperatureC"
        ),
      darkCurrentElectronsPerSecond:
        requireNonNegativeFinite(
          record.darkCurrentElectronsPerSecond,
          "sensorDarkCurrent.temperatureModel.darkCurrentElectronsPerSecond"
        )
    };
  }

  if (
    record.kind !==
      "piecewise-linear-temperature-table"
  ) {
    throw new InvalidConfigurationError(
      "sensorDarkCurrent.temperatureModel.kind is invalid."
    );
  }
  if (
    record.interpolation !==
      "piecewise-linear"
  ) {
    throw new InvalidConfigurationError(
      'sensorDarkCurrent.temperatureModel.interpolation must be "piecewise-linear".'
    );
  }
  if (
    record.outsideRangeBehavior !==
      "fail-closed"
  ) {
    throw new InvalidConfigurationError(
      'sensorDarkCurrent.temperatureModel.outsideRangeBehavior must be "fail-closed".'
    );
  }
  if (
    !Array.isArray(record.samples) ||
    record.samples.length < 2
  ) {
    throw new InvalidConfigurationError(
      "sensorDarkCurrent.temperatureModel.samples must contain at least two samples."
    );
  }

  let previousTemperature =
    Number.NEGATIVE_INFINITY;
  const samples =
    record.samples.map(
      (sample, index) => {
        const parsed = requireRecord(
          sample,
          "sensorDarkCurrent.temperatureModel.samples[" +
            index +
            "]"
        );
        const temperatureC =
          requireFinite(
            parsed.temperatureC,
            "sensorDarkCurrent.temperatureModel.samples[" +
              index +
              "].temperatureC"
          );
        if (
          temperatureC <=
          previousTemperature
        ) {
          throw new InvalidConfigurationError(
            "sensorDarkCurrent.temperatureModel.samples must be strictly increasing in temperature."
          );
        }
        previousTemperature =
          temperatureC;
        return {
          temperatureC,
          darkCurrentElectronsPerSecond:
            requireNonNegativeFinite(
              parsed.darkCurrentElectronsPerSecond,
              "sensorDarkCurrent.temperatureModel.samples[" +
                index +
                "].darkCurrentElectronsPerSecond"
            )
        };
      }
    );

  return {
    kind:
      "piecewise-linear-temperature-table",
    interpolation: "piecewise-linear",
    outsideRangeBehavior:
      "fail-closed",
    samples
  };
}

export function parseSensorDarkCurrentProfile(
  value: unknown
): SensorDarkCurrentProfile {
  const record = requireRecord(
    value,
    "sensorDarkCurrent"
  );

  if (
    record.schemaVersion !== "0.1.0"
  ) {
    throw new InvalidConfigurationError(
      'sensorDarkCurrent.schemaVersion must be "0.1.0".'
    );
  }
  if (
    record.chargeMeaning !==
      "pre-compensation-thermally-generated-electrons"
  ) {
    throw new InvalidConfigurationError(
      "sensorDarkCurrent.chargeMeaning is invalid."
    );
  }
  if (
    record.scientificStatus !==
      "calibrated" &&
    record.scientificStatus !==
      "approximation"
  ) {
    throw new InvalidConfigurationError(
      "sensorDarkCurrent.scientificStatus is invalid."
    );
  }
  if (
    record.darkCurrentCompensationIncluded !==
      false
  ) {
    throw new InvalidConfigurationError(
      "sensorDarkCurrent.darkCurrentCompensationIncluded must be false."
    );
  }
  if (
    typeof record
      .spatialDarkCurrentNonuniformityModeled !==
      "boolean"
  ) {
    throw new InvalidConfigurationError(
      "sensorDarkCurrent.spatialDarkCurrentNonuniformityModeled must be boolean."
    );
  }

  const uncertainty =
    parseUncertainty(
      record.uncertainty,
      "sensorDarkCurrent.uncertainty"
    );
  if (
    record.scientificStatus ===
      "calibrated" &&
    uncertainty.kind ===
      "not-quantified"
  ) {
    throw new InvalidConfigurationError(
      "A calibrated dark-current profile must declare quantified relative uncertainty."
    );
  }

  const siteApplicability =
    parseSiteApplicability(
      record.siteApplicability
    );
  if (
    siteApplicability.kind ===
      "uniform-site-mean-approximation" &&
    record.scientificStatus !==
      "approximation"
  ) {
    throw new InvalidConfigurationError(
      "Uniform site-mean dark current must remain an approximation."
    );
  }
  if (
    siteApplicability.kind ===
      "uniform-site-mean-approximation" &&
    record
      .spatialDarkCurrentNonuniformityModeled !==
      false
  ) {
    throw new InvalidConfigurationError(
      "Uniform site-mean dark current cannot claim spatial dark-current nonuniformity is modeled."
    );
  }

  return {
    schemaVersion: "0.1.0",
    profileId:
      requireNonEmptyString(
        record.profileId,
        "sensorDarkCurrent.profileId"
      ),
    colorSamplingProfileId:
      requireNonEmptyString(
        record.colorSamplingProfileId,
        "sensorDarkCurrent.colorSamplingProfileId"
      ),
    channelId:
      requireNonEmptyString(
        record.channelId,
        "sensorDarkCurrent.channelId"
      ),
    scientificStatus:
      record.scientificStatus,
    uncertainty,
    evidence: parseEvidenceList(
      record.evidence,
      "sensorDarkCurrent.evidence"
    ),
    chargeMeaning:
      "pre-compensation-thermally-generated-electrons",
    siteApplicability,
    temperatureModel:
      parseTemperatureModel(
        record.temperatureModel
      ),
    darkCurrentCompensationIncluded:
      false,
    spatialDarkCurrentNonuniformityModeled:
      record
        .spatialDarkCurrentNonuniformityModeled
  };
}

function sameSite(
  a: { x: number; y: number },
  b: { x: number; y: number }
): boolean {
  return a.x === b.x && a.y === b.y;
}

function resolveDarkCurrentRate(
  model:
    SensorDarkCurrentTemperatureModel,
  operatingTemperatureC: number
): {
  rate: number;
  interpolationUsed: boolean;
} {
  if (
    !Number.isFinite(
      operatingTemperatureC
    )
  ) {
    throw new InvalidScientificInputError(
      "operatingTemperatureC must be finite."
    );
  }

  if (
    model.kind ===
      "fixed-reference-temperature"
  ) {
    if (
      operatingTemperatureC !==
      model.referenceTemperatureC
    ) {
      throw new InvalidScientificInputError(
        "Fixed-reference dark current may only be used at its exact reference temperature."
      );
    }
    return {
      rate:
        model
          .darkCurrentElectronsPerSecond,
      interpolationUsed: false
    };
  }

  const first =
    model.samples[0]!;
  const last =
    model.samples[
      model.samples.length - 1
    ]!;
  if (
    operatingTemperatureC <
      first.temperatureC ||
    operatingTemperatureC >
      last.temperatureC
  ) {
    throw new InvalidScientificInputError(
      "operatingTemperatureC is outside the measured dark-current temperature range; extrapolation is not permitted."
    );
  }

  const exact =
    model.samples.find(
      (sample) =>
        sample.temperatureC ===
        operatingTemperatureC
    );
  if (exact !== undefined) {
    return {
      rate:
        exact
          .darkCurrentElectronsPerSecond,
      interpolationUsed: false
    };
  }

  for (
    let index = 0;
    index < model.samples.length - 1;
    index += 1
  ) {
    const lower =
      model.samples[index]!;
    const upper =
      model.samples[index + 1]!;
    if (
      operatingTemperatureC >
        lower.temperatureC &&
      operatingTemperatureC <
        upper.temperatureC
    ) {
      const alpha =
        (operatingTemperatureC -
          lower.temperatureC) /
        (upper.temperatureC -
          lower.temperatureC);
      const rate =
        lower
          .darkCurrentElectronsPerSecond +
        alpha *
          (
            upper
              .darkCurrentElectronsPerSecond -
            lower
              .darkCurrentElectronsPerSecond
          );
      if (
        !Number.isFinite(rate) ||
        rate < 0
      ) {
        throw new InvalidScientificInputError(
          "Interpolated dark current must remain finite and nonnegative."
        );
      }
      return {
        rate,
        interpolationUsed: true
      };
    }
  }

  throw new InvalidScientificInputError(
    "Unable to bracket operatingTemperatureC inside the dark-current table."
  );
}

function validateExposure(
  exposure:
    SensorEqeExposureIntegration
): void {
  if (
    exposure.kind !==
      "eqe-expected-counts" ||
    exposure.temporalIntegrationApplied !==
      true ||
    exposure.exposureDurationApplied !==
      true ||
    exposure.accumulatedSignalCompleteness !==
      "photo-signal-only" ||
    exposure.darkChargeIncluded !== false ||
    exposure.otherChargeIncluded !== false ||
    exposure
      .physicalFullWellAssessmentAuthorized !==
      false
  ) {
    throw new InvalidScientificInputError(
      "Dark-current composition requires an unmodified photo-signal-only EQE exposure integration."
    );
  }

  if (
    typeof exposure
      .localExposureDurationSeconds !==
      "number" ||
    !Number.isFinite(
      exposure
        .localExposureDurationSeconds
    ) ||
    exposure
      .localExposureDurationSeconds <=
      0
  ) {
    throw new InvalidScientificInputError(
      "EQE exposure local duration must be finite and positive."
    );
  }
}

export function calculateSensorDarkCurrentCharge(
  input:
    CalculateSensorDarkCurrentChargeInput
): CalculationResult<SensorDarkCurrentCharge> {
  validateExposure(input.exposure);
  const profile =
    parseSensorDarkCurrentProfile(
      input.darkCurrentProfile
    );

  if (
    profile.colorSamplingProfileId !==
      input.exposure
        .colorSamplingProfileId ||
    profile.channelId !==
      input.exposure.channelId
  ) {
    throw new InvalidScientificInputError(
      "Dark-current profile color/channel identity must match the EQE exposure."
    );
  }

  const site =
    input.exposure.site;
  if (
    profile.siteApplicability.kind ===
      "exact-site" &&
    !sameSite(
      profile.siteApplicability.site,
      site
    )
  ) {
    throw new InvalidScientificInputError(
      "Exact-site dark-current profile does not apply to the exposure site."
    );
  }

  const resolved =
    resolveDarkCurrentRate(
      profile.temperatureModel,
      input.operatingTemperatureC
    );
  const expectedDarkElectronCount =
    resolved.rate *
    input.exposure
      .localExposureDurationSeconds;

  if (
    !Number.isFinite(
      expectedDarkElectronCount
    ) ||
    expectedDarkElectronCount < 0
  ) {
    throw new InvalidScientificInputError(
      "Expected dark-electron count must remain finite and nonnegative."
    );
  }

  const result:
    SensorDarkCurrentCharge = {
      darkCurrentProfileId:
        profile.profileId,
      colorSamplingProfileId:
        input.exposure
          .colorSamplingProfileId,
      channelId:
        input.exposure.channelId,
      site: {
        ...site
      },
      operatingTemperatureC:
        input.operatingTemperatureC,
      temperatureModel:
        profile.temperatureModel.kind,
      temperatureInterpolationUsed:
        resolved.interpolationUsed,
      darkCurrentElectronsPerSecond:
        resolved.rate,
      localExposureDurationSeconds:
        input.exposure
          .localExposureDurationSeconds,
      expectedDarkElectronCount,
      countMeaning:
        "expected-thermally-generated-electrons",
      expectationValueOnly: true,
      integerDarkElectronCountSampled:
        false,
      darkShotNoiseApplied: false,
      darkCurrentCompensationApplied:
        false,
      spatialDarkCurrentNonuniformityModeled:
        profile
          .spatialDarkCurrentNonuniformityModeled,
      photoSignalIncluded: false,
      otherChargeIncluded: false,
      physicalFullWellAssessmentAuthorized:
        false,
      saturationAssessed: false,
      componentEvidence: {
        darkCurrent:
          profile.evidence,
        siteApproximation:
          profile.siteApplicability.kind ===
            "uniform-site-mean-approximation"
            ? profile
                .siteApplicability
                .evidence
            : [],
        exposure:
          input.exposure
            .componentEvidence
      }
    };

  const assumptions = [
    "Dark current is modeled as pre-compensation thermally generated electron rate in electrons per second.",
    "Release 4.0 style temperature handling is data-driven: no universal exponential or doubling-temperature law is inferred.",
    "Piecewise-linear interpolation is allowed only inside an explicitly sampled temperature table; extrapolation fails closed.",
    "Dark-current compensation, dark offset, hot-pixel/defect excess, leakage and charge injection remain separate from this thermal dark-current expectation.",
    "Expected dark-electron count is rate × the exact local exposure duration; no integer sampling or dark-current shot-noise realization is performed.",
    "This result is dark charge only. Photo-signal and other accumulated charge are not included, so physical full-well assessment remains unauthorized.",
    "A/W current-domain exposure results cannot enter this electron-storage path without a separate carrier/storage mapping."
  ];

  return profile.scientificStatus ===
    "calibrated"
    ? calculatedResult(
        result,
        "sensor-dark-current-charge",
        "1.0.0",
        assumptions
      )
    : approximationResult(
        result,
        "sensor-dark-current-charge",
        "1.0.0",
        [
          ...assumptions,
          ...(profile
            .siteApplicability.kind ===
            "uniform-site-mean-approximation"
            ? [
                profile
                  .siteApplicability
                  .limitation
              ]
            : [])
        ]
      );
}
