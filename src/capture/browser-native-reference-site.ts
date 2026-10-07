// SPDX-License-Identifier: Apache-2.0

/**
 * Repository-internal #234 dynamic site preparation.
 *
 * One native site's environment, dark-current, charge-completeness and readout
 * dependencies are validated, copied, canonically identified and frozen once.
 * Photo/dark signal realization, accumulated charge, stochastic noise and RAW
 * remain execution-time state.
 */
import { stringifyCanonicalJson } from "../core/canonical-json.js";
import { freezeOwnedData } from "../core/owned-data.js";
import {
  requireAllowlistedRecord,
  requirePublicOpaqueId
} from "../core/record-validation.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";
import { InvalidScientificInputError } from "../core/validation.js";
import {
  parseSensorAccumulatedChargeCompletenessProfile,
  parseSensorAdditionalStoredChargeComponent
} from "../sensor/accumulated-charge.js";
import { resolveCaptureModeColorSamplingContributors } from "../sensor/capture-color-sampling-binding.js";
import { parseSensorDarkCurrentProfile } from "../sensor/dark-current.js";
import { parseSensorPhysicalChargeCapacityProfile } from "../sensor/physical-charge-capacity.js";
import {
  parseSensorChargeSamplingProfile,
  parseSensorReadoutConversionProfile,
  resolveSensorReadoutRegime
} from "../sensor/raw-readout.js";
import {
  planEnvironmentRawSite,
  type SimulateEnvironmentSensorRawFrameInput
} from "./environment-raw-producer.js";
import type { PreparedBrowserNativeReferenceEventPlan } from "./browser-native-reference-plan.js";

export const BROWSER_NATIVE_REFERENCE_SITE_PLAN_VERSION = "0.1.0" as const;

export interface PreparedBrowserNativeReferenceSite {
  version: typeof BROWSER_NATIVE_REFERENCE_SITE_PLAN_VERSION;
  nativeIndex: number;
  eventIdentityJson: string;
  environment: ReturnType<typeof planEnvironmentRawSite>["owned"];
  expectedProviderEvaluationCount: number;
  darkCurrentProfile: ReturnType<typeof parseSensorDarkCurrentProfile>;
  operatingTemperatureC: number;
  charge: {
    completenessProfile: ReturnType<
      typeof parseSensorAccumulatedChargeCompletenessProfile
    >;
    additionalChargeComponents?: readonly ReturnType<
      typeof parseSensorAdditionalStoredChargeComponent
    >[];
  };
  readout: {
    samplingProfile: ReturnType<typeof parseSensorChargeSamplingProfile>;
    capacityProfile: ReturnType<typeof parseSensorPhysicalChargeCapacityProfile>;
    operatingStateId: string;
    readoutProfile: ReturnType<typeof parseSensorReadoutConversionProfile>;
    regimeId: string;
  };
  unresolvedExecutionDependencies: readonly [
    "photo-signal",
    "dark-charge",
    "accumulated-charge",
    "stochastic-realization",
    "raw-code"
  ];
  identityJson: string;
}

function canonical(value: unknown): string {
  return stringifyCanonicalJson(value, {
    undefinedObjectProperties: "omit",
    nonFiniteNumberMessage:
      "Browser-native prepared site identity requires finite numbers.",
    unsupportedValueMessage:
      "Browser-native prepared site identity requires plain serializable data."
  });
}

function validateDarkCurrentTemperature(
  profile: ReturnType<typeof parseSensorDarkCurrentProfile>,
  operatingTemperatureC: number
): void {
  if (!Number.isFinite(operatingTemperatureC)) {
    throw new InvalidScientificInputError(
      "Browser-native prepared site operating temperature must be finite."
    );
  }
  const model = profile.temperatureModel;
  if (model.kind === "fixed-reference-temperature") {
    if (operatingTemperatureC !== model.referenceTemperatureC) {
      throw new InvalidScientificInputError(
        "Browser-native prepared site dark current requires its exact fixed reference temperature."
      );
    }
    return;
  }
  const first = model.samples[0]!;
  const last = model.samples[model.samples.length - 1]!;
  if (
    operatingTemperatureC < first.temperatureC ||
    operatingTemperatureC > last.temperatureC
  ) {
    throw new InvalidScientificInputError(
      "Browser-native prepared site temperature is outside the dark-current measured range."
    );
  }
}

function validateCapacityApplicability(
  profile: ReturnType<typeof parseSensorPhysicalChargeCapacityProfile>,
  operatingStateId: string,
  operatingTemperatureC: number,
  colorSamplingProfileId: string,
  channelId: string,
  colorSamplingSite: { x: number; y: number }
): void {
  if (
    profile.colorSamplingProfileId !== colorSamplingProfileId ||
    profile.channelId !== channelId
  ) {
    throw new InvalidConfigurationError(
      "Browser-native prepared site capacity color/channel identity must match the bound CFA site."
    );
  }
  if (
    profile.siteApplicability.kind === "exact-site" &&
    (profile.siteApplicability.site.x !== colorSamplingSite.x ||
      profile.siteApplicability.site.y !== colorSamplingSite.y)
  ) {
    throw new InvalidConfigurationError(
      "Browser-native prepared site exact-site capacity must match the bound color-sampling site."
    );
  }
  if (profile.operatingState.stateId !== operatingStateId) {
    throw new InvalidConfigurationError(
      "Browser-native prepared site operating state must match the charge-capacity profile."
    );
  }
  if (
    profile.temperatureApplicability.kind === "exact-reference-temperature" &&
    profile.temperatureApplicability.temperatureC !== operatingTemperatureC
  ) {
    throw new InvalidConfigurationError(
      "Browser-native prepared site temperature must match the charge-capacity reference temperature."
    );
  }
}

/**
 * Prepare one native site without retaining the existing per-sample execution
 * graph. planEnvironmentRawSite() remains the authoritative environment parser
 * and cross-binding validator for this bounded slice.
 */
export function prepareBrowserNativeReferenceSite(
  eventPlan: PreparedBrowserNativeReferenceEventPlan,
  siteInput: SimulateEnvironmentSensorRawFrameInput["sites"][number],
  nativeIndex: number
): PreparedBrowserNativeReferenceSite {
  if (
    !Number.isSafeInteger(nativeIndex) ||
    nativeIndex < 0 ||
    nativeIndex >= eventPlan.rawPlan.pixelCount
  ) {
    throw new InvalidConfigurationError(
      "Browser-native prepared site requires an in-range absolute native index."
    );
  }

  const exposureWindow = eventPlan.rawPlan.exposureWindow;
  if (exposureWindow === undefined) {
    throw new InvalidConfigurationError(
      "Browser-native prepared site requires the explicit committed shutter event."
    );
  }

  const site = structuredClone(siteInput);
  requireAllowlistedRecord(
    site,
    ["environment", "darkCurrentProfile", "operatingTemperatureC", "charge", "readout"],
    "Invalid browser-native prepared site fields."
  );
  requireAllowlistedRecord(
    site.charge,
    ["completenessProfile", "additionalChargeComponents"],
    "Invalid browser-native prepared charge fields."
  );
  requireAllowlistedRecord(
    site.readout,
    [
      "samplingProfile",
      "capacityProfile",
      "operatingStateId",
      "readoutProfile",
      "regimeId"
    ],
    "Invalid browser-native prepared readout fields."
  );

  const environmentPlan = planEnvironmentRawSite(
    site,
    nativeIndex,
    eventPlan.rawPlan.frame,
    eventPlan.sceneBinding,
    exposureWindow
  );

  if (environmentPlan.count > 100_000) {
    throw new InvalidConfigurationError(
      "Browser-native prepared site alone exceeds the existing per-source-tile provider-evaluation bound."
    );
  }

  const darkCurrentProfile = parseSensorDarkCurrentProfile(
    site.darkCurrentProfile
  );
  validateDarkCurrentTemperature(
    darkCurrentProfile,
    site.operatingTemperatureC
  );

  const completenessProfile =
    parseSensorAccumulatedChargeCompletenessProfile(
      site.charge.completenessProfile
    );
  const additionalChargeComponents =
    site.charge.additionalChargeComponents === undefined
      ? undefined
      : site.charge.additionalChargeComponents.map(
          (component) => parseSensorAdditionalStoredChargeComponent(component)
        );

  const samplingProfile = parseSensorChargeSamplingProfile(
    site.readout.samplingProfile
  );
  const capacityProfile = parseSensorPhysicalChargeCapacityProfile(
    site.readout.capacityProfile
  );
  const operatingStateId = requirePublicOpaqueId(
    site.readout.operatingStateId,
    "Browser-native prepared site requires a public operating-state ID."
  );
  const readoutProfile = parseSensorReadoutConversionProfile(
    site.readout.readoutProfile
  );
  const regimeId = requirePublicOpaqueId(
    site.readout.regimeId,
    "Browser-native prepared site requires a public readout-regime ID."
  );

  const native = eventPlan.rawPlan.exposure.geometry.nativeRaster;
  const expectedSite = {
    x: nativeIndex % native.pixelWidth,
    y: Math.floor(nativeIndex / native.pixelWidth)
  };
  const contributors = resolveCaptureModeColorSamplingContributors({
    nativeRaster: native,
    captureModeProfile: eventPlan.rawPlan.frame.captureModeProfile,
    modeId: eventPlan.rawPlan.frame.modeId,
    colorSamplingProfile: eventPlan.rawPlan.frame.colorSamplingProfile,
    bindingProfile: eventPlan.rawPlan.frame.bindingProfile,
    modeSampleIndexFullFrame: expectedSite
  });
  if (
    contributors.totalContributorSites !== 1 ||
    contributors.channelComposition.kind !== "single-channel"
  ) {
    throw new InvalidConfigurationError(
      "Browser-native prepared site requires one exact native CFA contributor."
    );
  }

  const channelId = contributors.channelComposition.channelId;
  if (
    readoutProfile.colorSamplingProfileId !==
      eventPlan.rawPlan.frame.colorSamplingProfile.profileId ||
    readoutProfile.channelId !== channelId ||
    darkCurrentProfile.colorSamplingProfileId !==
      eventPlan.rawPlan.frame.colorSamplingProfile.profileId ||
    darkCurrentProfile.channelId !== channelId ||
    capacityProfile.colorSamplingProfileId !==
      eventPlan.rawPlan.frame.colorSamplingProfile.profileId ||
    capacityProfile.channelId !== channelId ||
    completenessProfile.profileId !== samplingProfile.completenessProfileId
  ) {
    throw new InvalidConfigurationError(
      "Browser-native prepared site readout, dark-current, sampling, and CFA identities must agree."
    );
  }

  if (
    darkCurrentProfile.siteApplicability.kind === "exact-site" &&
    (darkCurrentProfile.siteApplicability.site.x !==
      contributors.colorSamplingSiteRect.x ||
      darkCurrentProfile.siteApplicability.site.y !==
        contributors.colorSamplingSiteRect.y)
  ) {
    throw new InvalidConfigurationError(
      "Browser-native prepared site dark-current exact-site applicability must match the bound color-sampling site."
    );
  }

  validateCapacityApplicability(
    capacityProfile,
    operatingStateId,
    site.operatingTemperatureC,
    eventPlan.rawPlan.frame.colorSamplingProfile.profileId,
    channelId,
    {
      x: contributors.colorSamplingSiteRect.x,
      y: contributors.colorSamplingSiteRect.y
    }
  );

  const readout = resolveSensorReadoutRegime({
    profile: readoutProfile,
    regimeId
  });
  if (
    readout.regime.adc.bitDepth > 16 ||
    readout.regime.adc.digitalSaturationCode <=
      readout.regime.adc.blackLevelCode
  ) {
    throw new InvalidConfigurationError(
      "Browser-native prepared site requires a positive uint16 readout code span."
    );
  }

  const unresolvedExecutionDependencies = [
    "photo-signal",
    "dark-charge",
    "accumulated-charge",
    "stochastic-realization",
    "raw-code"
  ] as const;

  const prepared = {
    version: BROWSER_NATIVE_REFERENCE_SITE_PLAN_VERSION,
    nativeIndex,
    eventIdentityJson: eventPlan.identityJson,
    environment: environmentPlan.owned,
    expectedProviderEvaluationCount: environmentPlan.count,
    darkCurrentProfile,
    operatingTemperatureC: site.operatingTemperatureC,
    charge: {
      completenessProfile,
      ...(additionalChargeComponents === undefined
        ? {}
        : { additionalChargeComponents })
    },
    readout: {
      samplingProfile,
      capacityProfile,
      operatingStateId,
      readoutProfile,
      regimeId
    },
    unresolvedExecutionDependencies
  };

  return freezeOwnedData({
    ...prepared,
    identityJson: canonical(prepared)
  });
}
