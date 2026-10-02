// SPDX-License-Identifier: Apache-2.0

/**
 * Module boundary and integration notes.
 * Validate an untrusted declaration and return the normalized typed contract. Unknown enum values,
 * missing required fields and incompatible scientific data fail at this boundary. Rate times duration
 * is allowed only by explicit stationarity bound to the exact site and local shutter interval. EQE
 * integrates to expected photons/electrons; A/W integrates current magnitude to coulombs without an
 * implicit carrier mapping. Counts remain fractional expectations before stochastic sampling.
 * Integrates one explicitly stationary response-rate result over its exact bound local exposure
 * window. This function is intentionally limited to the constant-rate approximation. It does not
 * sample or integrate a time-varying signal.
 * @see docs/MOTION_AND_SIGNAL.md for equations, coordinate/unit conventions, blockers and support
 * limits.
 */

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
  SensorEqeElectronRate
} from "./eqe-electron-rate.js";
import type {
  SensorInstantaneousRateResult,
  SensorRateLocalExposureBinding
} from "./local-exposure-binding.js";
import type {
  SensorResponsivityPhotocurrent
} from "./responsivity-photocurrent.js";

type UnknownRecord = Record<string, unknown>;

export type SensorRateStationarityStatus =
  | "established"
  | "approximation";

export interface SensorRateTemporalStationarityProfile {
  schemaVersion: "0.1.0";
  profileId: string;
  rateDomain:
    SensorRateLocalExposureBinding["rateDomain"];
  colorSamplingProfileId: string;
  channelId: string;
  site: {
    x: number;
    y: number;
  };
  bindingId: string;
  localExposureWindow: {
    timeReference:
      "first-opening-boundary-phase";
    startOffsetSecondsFromOpeningReference:
      number;
    endOffsetSecondsFromOpeningReference:
      number;
  };
  stationarityMeaning:
    "reported-rate-constant-through-bound-local-exposure";
  status:
    SensorRateStationarityStatus;
  evidence: readonly EvidenceProvenance[];
  limitation?: string;
}

export interface IntegrateStationarySensorRateInput {
  rate:
    SensorInstantaneousRateResult;
  exposureBinding:
    SensorRateLocalExposureBinding;
  stationarityProfile:
    SensorRateTemporalStationarityProfile;
}

interface SensorTemporalIntegrationCommon {
  colorSamplingProfileId: string;
  channelId: string;
  site: {
    x: number;
    y: number;
  };
  bindingId: string;
  stationarityProfileId: string;
  stationarityStatus:
    SensorRateStationarityStatus;
  timeReference:
    "first-opening-boundary-phase";
  startOffsetSecondsFromOpeningReference:
    number;
  endOffsetSecondsFromOpeningReference:
    number;
  localExposureDurationSeconds:
    number;
  integrationMethod:
    "constant-rate-times-local-exposure-duration";
  timeStationarityEstablished: true;
  temporalIntegrationApplied: true;
  exposureDurationApplied: true;
  timeVaryingSignalIntegrated: false;
  multiFrameSequenceIntegrated: false;
  darkChargeIncluded: false;
  otherChargeIncluded: false;
  accumulatedSignalCompleteness:
    "photo-signal-only";
  physicalFullWellAssessmentAuthorized:
    false;
  cameraSaturationAssessmentAuthorized:
    false;
  saturationAssessed: false;
  shotNoiseApplied: false;
  readNoiseApplied: false;
  adcQuantizationApplied: false;
  rawCodeValueProduced: false;
  componentEvidence: {
    stationarity:
      readonly EvidenceProvenance[];
    exposureBinding:
      SensorRateLocalExposureBinding["componentEvidence"];
  };
}

export interface SensorEqeExposureIntegration
  extends SensorTemporalIntegrationCommon {
  kind: "eqe-expected-counts";
  incidentPhotonRatePerSecond: number;
  expectedGeneratedElectronRatePerSecond:
    number;
  expectedIncidentPhotonCount: number;
  expectedGeneratedElectronCount:
    number;
  countsAreExpectationValues: true;
  integerPhotonCountSampled: false;
  integerElectronCountSampled: false;
  chargeCalculated: false;
  currentCalculated: false;
}

export interface SensorResponsivityExposureIntegration
  extends SensorTemporalIntegrationCommon {
  kind:
    "responsivity-photocurrent-charge";
  photocurrentMagnitudeAmperes: number;
  photochargeMagnitudeCoulombs:
    number;
  currentSignConvention:
    "magnitude-only-no-circuit-polarity";
  chargeSignConvention:
    "magnitude-only-no-carrier-or-circuit-polarity";
  carrierCountInferred: false;
  electronCountCalculated: false;
  photonCountCalculated: false;
  detectorBandwidthModeled: false;
}

export type SensorStationaryRateExposureIntegration =
  | SensorEqeExposureIntegration
  | SensorResponsivityExposureIntegration;

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

function requireNonNegativeSafeInteger(
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

/**
 * Validate an untrusted declaration and return the normalized typed contract. Unknown enum values,
 * missing required fields and incompatible scientific data fail at this boundary.
 *
 * Rate times duration is allowed only by explicit stationarity bound to the exact site and local
 * shutter interval. EQE integrates to expected photons/electrons; A/W integrates current magnitude to
 * coulombs without an implicit carrier mapping. Counts remain fractional expectations before
 * stochastic sampling.
 * @param value - unknown. Treated as untrusted data; static typing alone is not validation.
 * @returns SensorRateTemporalStationarityProfile. Return shape and scientific status are explicit; no calibration is inferred from successful execution.
 *
 * @see docs/API_REFERENCE.md for the root export and exact type graph.
 */
export function parseSensorRateTemporalStationarityProfile(
  value: unknown
): SensorRateTemporalStationarityProfile {
  const record = requireRecord(
    value,
    "sensorRateTemporalStationarity"
  );

  if (
    record.schemaVersion !== "0.1.0"
  ) {
    throw new InvalidConfigurationError(
      'sensorRateTemporalStationarity.schemaVersion must be "0.1.0".'
    );
  }

  if (
    record.rateDomain !==
      "eqe-electron-rate" &&
    record.rateDomain !==
      "responsivity-photocurrent"
  ) {
    throw new InvalidConfigurationError(
      "sensorRateTemporalStationarity.rateDomain is invalid."
    );
  }

  const site = requireRecord(
    record.site,
    "sensorRateTemporalStationarity.site"
  );
  const localExposureWindow =
    requireRecord(
      record.localExposureWindow,
      "sensorRateTemporalStationarity.localExposureWindow"
    );

  if (
    localExposureWindow.timeReference !==
    "first-opening-boundary-phase"
  ) {
    throw new InvalidConfigurationError(
      'sensorRateTemporalStationarity.localExposureWindow.timeReference must be "first-opening-boundary-phase".'
    );
  }

  if (
    record.stationarityMeaning !==
    "reported-rate-constant-through-bound-local-exposure"
  ) {
    throw new InvalidConfigurationError(
      "sensorRateTemporalStationarity.stationarityMeaning is invalid."
    );
  }

  if (
    record.status !== "established" &&
    record.status !== "approximation"
  ) {
    throw new InvalidConfigurationError(
      "sensorRateTemporalStationarity.status is invalid."
    );
  }

  const limitation =
    record.limitation === undefined
      ? undefined
      : requireNonEmptyString(
          record.limitation,
          "sensorRateTemporalStationarity.limitation"
        );

  if (
    record.status === "approximation" &&
    limitation === undefined
  ) {
    throw new InvalidConfigurationError(
      "sensorRateTemporalStationarity.limitation is required for an approximation."
    );
  }

  const start =
    requireFinite(
      localExposureWindow
        .startOffsetSecondsFromOpeningReference,
      "sensorRateTemporalStationarity.localExposureWindow.startOffsetSecondsFromOpeningReference"
    );
  const end =
    requireFinite(
      localExposureWindow
        .endOffsetSecondsFromOpeningReference,
      "sensorRateTemporalStationarity.localExposureWindow.endOffsetSecondsFromOpeningReference"
    );

  if (!(end > start)) {
    throw new InvalidConfigurationError(
      "sensorRateTemporalStationarity.localExposureWindow end must be greater than start."
    );
  }

  return {
    schemaVersion: "0.1.0",
    profileId:
      requireNonEmptyString(
        record.profileId,
        "sensorRateTemporalStationarity.profileId"
      ),
    rateDomain:
      record.rateDomain,
    colorSamplingProfileId:
      requireNonEmptyString(
        record.colorSamplingProfileId,
        "sensorRateTemporalStationarity.colorSamplingProfileId"
      ),
    channelId:
      requireNonEmptyString(
        record.channelId,
        "sensorRateTemporalStationarity.channelId"
      ),
    site: {
      x: requireNonNegativeSafeInteger(
        site.x,
        "sensorRateTemporalStationarity.site.x"
      ),
      y: requireNonNegativeSafeInteger(
        site.y,
        "sensorRateTemporalStationarity.site.y"
      )
    },
    bindingId:
      requireNonEmptyString(
        record.bindingId,
        "sensorRateTemporalStationarity.bindingId"
      ),
    localExposureWindow: {
      timeReference:
        "first-opening-boundary-phase",
      startOffsetSecondsFromOpeningReference:
        start,
      endOffsetSecondsFromOpeningReference:
        end
    },
    stationarityMeaning:
      "reported-rate-constant-through-bound-local-exposure",
    status:
      record.status,
    evidence:
      parseEvidenceList(
        record.evidence,
        "sensorRateTemporalStationarity.evidence"
      ),
    ...(limitation === undefined
      ? {}
      : { limitation })
  };
}

function sameSite(
  a: { x: number; y: number },
  b: { x: number; y: number }
): boolean {
  return a.x === b.x && a.y === b.y;
}

function requireRateSite(
  rate:
    SensorInstantaneousRateResult
): {
  x: number;
  y: number;
} {
  if (
    rate.site === undefined ||
    !Number.isSafeInteger(rate.site.x) ||
    rate.site.x < 0 ||
    !Number.isSafeInteger(rate.site.y) ||
    rate.site.y < 0
  ) {
    throw new InvalidScientificInputError(
      "rate.site is required for temporal integration."
    );
  }
  return {
    x: rate.site.x,
    y: rate.site.y
  };
}

function validateBinding(
  rate:
    SensorInstantaneousRateResult,
  binding:
    SensorRateLocalExposureBinding
): {
  rateDomain:
    SensorRateLocalExposureBinding["rateDomain"];
  site: {
    x: number;
    y: number;
  };
  duration: number;
} {
  const site = requireRateSite(rate);

  if (
    !sameSite(site, binding.site) ||
    binding.colorSamplingProfileId !==
      rate.colorSamplingProfileId ||
    binding.channelId !==
      rate.channelId
  ) {
    throw new InvalidScientificInputError(
      "rate and exposureBinding must reference the same color site/channel."
    );
  }

  const rateDomain =
    rate.sourceResponseKind ===
      "effective-spectral-responsivity"
      ? "responsivity-photocurrent"
      : "eqe-electron-rate";

  if (
    binding.rateDomain !==
      rateDomain ||
    binding
      .nativeImageRasterBindingEstablished !==
      true ||
    binding.channelAtSiteValidated !==
      true ||
    binding
      .constantRateTemporalIntegrationAuthorized !==
      false ||
    binding.timeStationarityEstablished !==
      false ||
    binding.temporalIntegrationApplied !==
      false ||
    binding
      .multiFrameSequenceBindingEstablished !==
      false
  ) {
    throw new InvalidScientificInputError(
      "exposureBinding must remain an unintegrated local timing binding for the same rate domain."
    );
  }

  if (
    binding.rateIdentity
      .responseProfileId !==
      rate.responseProfileId ||
    binding.rateIdentity
      .responseApplicationProfileId !==
      rate.responseApplicationProfileId ||
    binding.rateIdentity
      .operatingRangeProfileId !==
      rate.operatingRangeProfileId
  ) {
    throw new InvalidScientificInputError(
      "exposureBinding response-rate identity must match the rate."
    );
  }

  if (
    rateDomain ===
      "responsivity-photocurrent"
  ) {
    const current =
      rate as SensorResponsivityPhotocurrent;
    if (
      binding.rateIdentity
        .electricalApplicabilityProfileId !==
      current
        .electricalApplicabilityProfileId
    ) {
      throw new InvalidScientificInputError(
        "exposureBinding electrical applicability identity must match the A/W rate."
      );
    }
  } else if (
    binding.rateIdentity
      .electricalApplicabilityProfileId !==
      undefined
  ) {
    throw new InvalidScientificInputError(
      "EQE exposureBinding must not carry an A/W electrical applicability identity."
    );
  }

  const window =
    binding.localExposureWindow;
  const duration =
    window
      .endOffsetSecondsFromOpeningReference -
    window
      .startOffsetSecondsFromOpeningReference;

  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    !Number.isFinite(
      binding.localExposureDurationSeconds
    ) ||
    binding.localExposureDurationSeconds !==
      duration
  ) {
    throw new InvalidScientificInputError(
      "exposureBinding local duration must exactly equal end minus start and remain positive."
    );
  }

  return {
    rateDomain,
    site,
    duration
  };
}

function validateStationarity(
  stationarity:
    SensorRateTemporalStationarityProfile,
  binding:
    SensorRateLocalExposureBinding,
  rateDomain:
    SensorRateLocalExposureBinding["rateDomain"],
  site: {
    x: number;
    y: number;
  }
): void {
  if (
    stationarity.rateDomain !==
      rateDomain ||
    stationarity
      .colorSamplingProfileId !==
      binding.colorSamplingProfileId ||
    stationarity.channelId !==
      binding.channelId ||
    !sameSite(
      stationarity.site,
      site
    ) ||
    stationarity.bindingId !==
      binding.bindingId ||
    stationarity
      .localExposureWindow
      .timeReference !==
      binding.timeReference ||
    stationarity
      .localExposureWindow
      .startOffsetSecondsFromOpeningReference !==
      binding.localExposureWindow
        .startOffsetSecondsFromOpeningReference ||
    stationarity
      .localExposureWindow
      .endOffsetSecondsFromOpeningReference !==
      binding.localExposureWindow
        .endOffsetSecondsFromOpeningReference
  ) {
    throw new InvalidScientificInputError(
      "stationarityProfile must apply to the exact bound rate domain, site, binding, and local exposure window."
    );
  }
}

function requireNonNegativeFiniteRate(
  value: unknown,
  path: string
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new InvalidScientificInputError(
      path +
        " must be finite and greater than or equal to zero."
    );
  }
  return value;
}

/**
 * Integrates one explicitly stationary response-rate result over its exact
 * bound local exposure window.
 *
 * This function is intentionally limited to the constant-rate approximation.
 * It does not sample or integrate a time-varying signal.
 */
export function integrateStationarySensorRateOverLocalExposure(
  input:
    IntegrateStationarySensorRateInput
): CalculationResult<SensorStationaryRateExposureIntegration> {
  const binding =
    validateBinding(
      input.rate,
      input.exposureBinding
    );
  const stationarity =
    parseSensorRateTemporalStationarityProfile(
      input.stationarityProfile
    );
  validateStationarity(
    stationarity,
    input.exposureBinding,
    binding.rateDomain,
    binding.site
  );

  const common = {
    colorSamplingProfileId:
      input.rate
        .colorSamplingProfileId,
    channelId:
      input.rate.channelId,
    site: binding.site,
    bindingId:
      input.exposureBinding.bindingId,
    stationarityProfileId:
      stationarity.profileId,
    stationarityStatus:
      stationarity.status,
    timeReference:
      input.exposureBinding
        .timeReference,
    startOffsetSecondsFromOpeningReference:
      input.exposureBinding
        .localExposureWindow
        .startOffsetSecondsFromOpeningReference,
    endOffsetSecondsFromOpeningReference:
      input.exposureBinding
        .localExposureWindow
        .endOffsetSecondsFromOpeningReference,
    localExposureDurationSeconds:
      binding.duration,
    integrationMethod:
      "constant-rate-times-local-exposure-duration" as const,
    timeStationarityEstablished:
      true as const,
    temporalIntegrationApplied:
      true as const,
    exposureDurationApplied:
      true as const,
    timeVaryingSignalIntegrated:
      false as const,
    multiFrameSequenceIntegrated:
      false as const,
    darkChargeIncluded:
      false as const,
    otherChargeIncluded:
      false as const,
    accumulatedSignalCompleteness:
      "photo-signal-only" as const,
    physicalFullWellAssessmentAuthorized:
      false as const,
    cameraSaturationAssessmentAuthorized:
      false as const,
    saturationAssessed:
      false as const,
    shotNoiseApplied:
      false as const,
    readNoiseApplied:
      false as const,
    adcQuantizationApplied:
      false as const,
    rawCodeValueProduced:
      false as const,
    componentEvidence: {
      stationarity:
        stationarity.evidence,
      exposureBinding:
        input.exposureBinding
          .componentEvidence
    }
  };

  const assumptions = [
    "The reported instantaneous rate is explicitly declared constant through this exact bound local exposure window.",
    "The integration is therefore rate × local duration; no temporal quadrature or time-varying signal samples are generated.",
    "Motion, flicker, flash, time-varying illumination/vignetting, shutter modulation and other temporal scene/optical effects are excluded unless already proven irrelevant by the stationarity evidence.",
    "A/W stationarity additionally treats the quasi-static detector-terminal photocurrent result as valid throughout the window; detector bandwidth/transient response remains unmodeled.",
    "This result contains photo-signal accumulation only. Dark current, defects, leakage, charge injection and other charge contributors are not included.",
    "Physical full-well and camera/digital saturation must not be assessed from this incomplete photo-signal accumulation alone.",
    "Shot/read noise, conversion gain, ADC/RAW conversion and reconstruction remain downstream."
  ];

  if (
    binding.rateDomain ===
      "eqe-electron-rate"
  ) {
    const rate =
      input.rate as
        SensorEqeElectronRate;
    const photonRate =
      requireNonNegativeFiniteRate(
        rate.incidentPhotonRatePerSecond,
        "rate.incidentPhotonRatePerSecond"
      );
    const electronRate =
      requireNonNegativeFiniteRate(
        rate
          .expectedGeneratedElectronRatePerSecond,
        "rate.expectedGeneratedElectronRatePerSecond"
      );
    const photonCount =
      photonRate *
      binding.duration;
    const electronCount =
      electronRate *
      binding.duration;

    if (
      !Number.isFinite(photonCount) ||
      !Number.isFinite(electronCount)
    ) {
      throw new InvalidScientificInputError(
        "EQE constant-rate temporal integration must remain finite."
      );
    }

    const result:
      SensorEqeExposureIntegration = {
        ...common,
        kind:
          "eqe-expected-counts",
        incidentPhotonRatePerSecond:
          photonRate,
        expectedGeneratedElectronRatePerSecond:
          electronRate,
        expectedIncidentPhotonCount:
          photonCount,
        expectedGeneratedElectronCount:
          electronCount,
        countsAreExpectationValues:
          true,
        integerPhotonCountSampled:
          false,
        integerElectronCountSampled:
          false,
        chargeCalculated: false,
        currentCalculated: false
      };

    return stationarity.status ===
      "established"
      ? calculatedResult(
          result,
          "sensor-stationary-eqe-exposure-integration",
          "1.0.0",
          assumptions
        )
      : approximationResult(
          result,
          "sensor-stationary-eqe-exposure-integration",
          "1.0.0",
          [
            ...assumptions,
            stationarity.limitation!
          ]
        );
  }

  const rate =
    input.rate as
      SensorResponsivityPhotocurrent;
  const current =
    requireNonNegativeFiniteRate(
      rate.photocurrentMagnitudeAmperes,
      "rate.photocurrentMagnitudeAmperes"
    );

  if (
    rate.temporalResponseModel !==
      "quasi-static-steady-state-only" ||
    rate.detectorBandwidthModeled !==
      false ||
    rate.chargeCalculated !== false
  ) {
    throw new InvalidScientificInputError(
      "A/W input must remain a quasi-static current result with no prior charge integration."
    );
  }

  const charge =
    current * binding.duration;
  if (!Number.isFinite(charge)) {
    throw new InvalidScientificInputError(
      "A/W constant-current temporal integration must remain finite."
    );
  }

  const result:
    SensorResponsivityExposureIntegration =
      {
        ...common,
        kind:
          "responsivity-photocurrent-charge",
        photocurrentMagnitudeAmperes:
          current,
        photochargeMagnitudeCoulombs:
          charge,
        currentSignConvention:
          rate.currentSignConvention,
        chargeSignConvention:
          "magnitude-only-no-carrier-or-circuit-polarity",
        carrierCountInferred: false,
        electronCountCalculated:
          false,
        photonCountCalculated:
          false,
        detectorBandwidthModeled:
          false
      };

  return stationarity.status ===
    "established"
    ? calculatedResult(
        result,
        "sensor-stationary-responsivity-exposure-integration",
        "1.0.0",
        assumptions
      )
    : approximationResult(
        result,
        "sensor-stationary-responsivity-exposure-integration",
        "1.0.0",
        [
          ...assumptions,
          stationarity.limitation!
        ]
      );
}
