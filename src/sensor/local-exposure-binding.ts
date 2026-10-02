// SPDX-License-Identifier: Apache-2.0

/**
 * Module boundary and integration notes.
 * Binds one engine-produced sensor response-rate result to the local exposure window at the same
 * color-sampling site. This first temporal binding supports only the explicit one-to-one
 * native-effective-sample ↔ color-site relationship. A multi-site block binding proves contributor
 * membership but does not prove each color site's sub-sample timing coordinate, so spatially varying
 * shutter timing fails closed rather than inventing fractional positions. The result establishes
 * timing only. It deliberately does not establish that the optical/electrical rate is stationary
 * through the local exposure window, so rate×duration integration remains unauthorized.
 * @see docs/MOTION_AND_SIGNAL.md for equations, coordinate/unit conventions, blockers and support
 * limits.
 */

import {
  approximationResult,
  type CalculationResult
} from "../core/calculation-result.js";
import type {
  EvidenceProvenance
} from "../core/evidence-provenance.js";
import { InvalidScientificInputError } from "../core/validation.js";
import {
  resolveNativeEffectiveRasterColorSamplingBinding,
  type NativeEffectiveRasterColorSamplingBindingProfile
} from "./capture-color-sampling-binding.js";
import {
  resolveColorSamplingSite,
  type SensorColorSamplingProfile
} from "./color-sampling.js";
import type {
  SensorEqeElectronRate
} from "./eqe-electron-rate.js";
import {
  calculateCaptureExposureWindows,
  type CalculateCaptureExposureWindowsInput,
  type CaptureExposureWindowSample
} from "./exposure-window.js";
import type {
  SensorResponsivityPhotocurrent
} from "./responsivity-photocurrent.js";

export type SensorInstantaneousRateResult =
  | SensorEqeElectronRate
  | SensorResponsivityPhotocurrent;

export interface BindSensorRateToLocalExposureInput {
  rate:
    SensorInstantaneousRateResult;
  colorSamplingProfile:
    SensorColorSamplingProfile;
  bindingProfile:
    NativeEffectiveRasterColorSamplingBindingProfile;
  /**
   * One capture/exposure event. samplePointsNative is owned by this binding
   * function and therefore intentionally excluded.
   */
  exposureWindowInput:
    Omit<
      CalculateCaptureExposureWindowsInput,
      "samplePointsNative"
    >;
}

export interface SensorRateLocalExposureBinding {
  rateDomain:
    | "eqe-electron-rate"
    | "responsivity-photocurrent";
  rateIdentity: {
    responseProfileId: string;
    responseApplicationProfileId: string;
    operatingRangeProfileId: string;
    electricalApplicabilityProfileId?: string;
  };
  colorSamplingProfileId: string;
  channelId: string;
  site: {
    x: number;
    y: number;
  };
  bindingId: string;
  bindingRelationship:
    "one-native-effective-sample-to-one-color-site";
  timingCoordinateRule:
    "one-to-one-color-site-center-equals-native-effective-sample-center";
  nativeRasterPoint: {
    x: number;
    y: number;
  };
  shutterMechanism:
    CalculateCaptureExposureWindowsInput["shutterMechanism"];
  timeReference:
    "first-opening-boundary-phase";
  localExposureWindow:
    CaptureExposureWindowSample;
  localExposureDurationSeconds:
    number;
  exposureEventMeaning:
    "single-capture-local-exposure-window";
  nativeImageRasterBindingEstablished: true;
  channelAtSiteValidated: true;
  physicalPhotodiodeTimingRegistrationEstablished:
    false;
  multiFrameSequenceBindingEstablished:
    false;
  timeStationarityEstablished: false;
  constantRateTemporalIntegrationAuthorized:
    false;
  temporalIntegrationApplied: false;
  componentEvidence: {
    binding:
      readonly EvidenceProvenance[];
    colorSamplingProfile:
      readonly EvidenceProvenance[];
    nominalExposureDuration:
      readonly EvidenceProvenance[];
    openingBoundary:
      readonly EvidenceProvenance[];
    closingBoundary:
      readonly EvidenceProvenance[];
  };
}

function requireSite(
  rate:
    SensorInstantaneousRateResult
): {
  x: number;
  y: number;
} {
  if (
    rate.site === undefined ||
    typeof rate.site !== "object" ||
    rate.site === null ||
    !Number.isSafeInteger(rate.site.x) ||
    rate.site.x < 0 ||
    !Number.isSafeInteger(rate.site.y) ||
    rate.site.y < 0
  ) {
    throw new InvalidScientificInputError(
      "rate.site must be present as a non-negative safe-integer color-sampling-site index."
    );
  }

  return {
    x: rate.site.x,
    y: rate.site.y
  };
}

function validateRateBoundary(
  rate:
    SensorInstantaneousRateResult
): "eqe-electron-rate" |
  "responsivity-photocurrent" {
  if (
    rate.sourceResponseKind ===
      "effective-spectral-responsivity"
  ) {
    const current =
      rate as SensorResponsivityPhotocurrent;

    if (
      current.currentCalculated !==
        true ||
      current.chargeCalculated !==
        false ||
      current.temporalIntegrationApplied !==
        false ||
      current.exposureDurationApplied !==
        false ||
      current.detectorBandwidthModeled !==
        false ||
      current.temporalResponseModel !==
        "quasi-static-steady-state-only"
    ) {
      throw new InvalidScientificInputError(
        "A/W rate must remain a quasi-static pre-temporal photocurrent result."
      );
    }
    return "responsivity-photocurrent";
  }

  const eqe =
    rate as SensorEqeElectronRate;
  if (
    eqe.electronRateCalculated !== true ||
    eqe.photonRateCalculated !== true ||
    eqe.electronCountCalculated !==
      false ||
    eqe.photonCountCalculated !==
      false ||
    eqe.temporalIntegrationApplied !==
      false ||
    eqe.exposureDurationApplied !==
      false
  ) {
    throw new InvalidScientificInputError(
      "EQE rate must remain a pre-temporal photon/electron-rate result."
    );
  }

  return "eqe-electron-rate";
}

function boundaryEvidence(
  boundary:
    ReturnType<
      typeof calculateCaptureExposureWindows
    >["value"]["opening"]
): readonly EvidenceProvenance[] {
  if (
    boundary.schedule.kind ===
      "simultaneous"
  ) {
    return [];
  }

  return [
    ...boundary.schedule.directionNative
      .evidence,
    ...boundary.schedule
      .traversalDurationSeconds.evidence
  ];
}

/**
 * Binds one engine-produced sensor response-rate result to the local exposure
 * window at the same color-sampling site.
 *
 * This first temporal binding supports only the explicit one-to-one
 * native-effective-sample ↔ color-site relationship. A multi-site block
 * binding proves contributor membership but does not prove each color site's
 * sub-sample timing coordinate, so spatially varying shutter timing fails
 * closed rather than inventing fractional positions.
 *
 * The result establishes timing only. It deliberately does not establish that
 * the optical/electrical rate is stationary through the local exposure window,
 * so rate×duration integration remains unauthorized.
 */
export function bindSensorRateToLocalExposure(
  input:
    BindSensorRateToLocalExposureInput
): CalculationResult<SensorRateLocalExposureBinding> {
  const rateDomain =
    validateRateBoundary(input.rate);
  const site = requireSite(input.rate);

  const binding =
    resolveNativeEffectiveRasterColorSamplingBinding({
      nativeRaster:
        input.exposureWindowInput
          .nativeRaster,
      colorSamplingProfile:
        input.colorSamplingProfile,
      bindingProfile:
        input.bindingProfile
    });

  if (
    binding.colorSamplingProfileId !==
      input.rate
        .colorSamplingProfileId
  ) {
    throw new InvalidScientificInputError(
      "Color-sampling binding must reference the same colorSamplingProfileId as the rate result."
    );
  }

  if (
    binding.relationship
      .sitesPerNativeSampleX !== 1 ||
    binding.relationship
      .sitesPerNativeSampleY !== 1
  ) {
    throw new InvalidScientificInputError(
      "Local exposure timing currently requires a one-to-one color-site/native-effective-sample binding; multi-site blocks lack explicit sub-sample timing registration."
    );
  }

  if (
    site.x >=
      binding.colorSamplingSiteGrid
        .widthSites ||
    site.y >=
      binding.colorSamplingSiteGrid
        .heightSites
  ) {
    throw new InvalidScientificInputError(
      "rate.site is outside the color-sampling site grid established by the binding."
    );
  }

  const resolvedSite =
    resolveColorSamplingSite({
      profile:
        input.colorSamplingProfile,
      site
    });
  if (
    resolvedSite.mapping.channelId !==
      input.rate.channelId
  ) {
    throw new InvalidScientificInputError(
      "The rate channelId does not match the color-sampling channel assigned to rate.site."
    );
  }

  const nativeRasterPoint = {
    x: site.x + 0.5,
    y: site.y + 0.5
  };

  const windows =
    calculateCaptureExposureWindows({
      ...input.exposureWindowInput,
      samplePointsNative: [
        nativeRasterPoint
      ]
    }).value;
  const localExposureWindow =
    windows.samples[0];

  if (
    localExposureWindow === undefined ||
    localExposureWindow
      .pointNative.x !==
      nativeRasterPoint.x ||
    localExposureWindow
      .pointNative.y !==
      nativeRasterPoint.y ||
    !Number.isFinite(
      localExposureWindow
        .localExposureDurationSeconds
    ) ||
    localExposureWindow
      .localExposureDurationSeconds <= 0
  ) {
    throw new InvalidScientificInputError(
      "Exposure-window resolution did not return a valid local sample for the bound sensor site."
    );
  }

  return approximationResult(
    {
      rateDomain,
      rateIdentity: {
        responseProfileId:
          input.rate.responseProfileId,
        responseApplicationProfileId:
          input.rate
            .responseApplicationProfileId,
        operatingRangeProfileId:
          input.rate
            .operatingRangeProfileId,
        ...(rateDomain ===
          "responsivity-photocurrent"
          ? {
              electricalApplicabilityProfileId:
                (
                  input.rate as
                    SensorResponsivityPhotocurrent
                )
                  .electricalApplicabilityProfileId
            }
          : {})
      },
      colorSamplingProfileId:
        input.rate
          .colorSamplingProfileId,
      channelId:
        input.rate.channelId,
      site,
      bindingId:
        binding.bindingId,
      bindingRelationship:
        "one-native-effective-sample-to-one-color-site",
      timingCoordinateRule:
        "one-to-one-color-site-center-equals-native-effective-sample-center",
      nativeRasterPoint,
      shutterMechanism:
        windows.shutterMechanism,
      timeReference:
        windows.timeReference,
      localExposureWindow,
      localExposureDurationSeconds:
        localExposureWindow
          .localExposureDurationSeconds,
      exposureEventMeaning:
        "single-capture-local-exposure-window",
      nativeImageRasterBindingEstablished:
        true,
      channelAtSiteValidated:
        true,
      physicalPhotodiodeTimingRegistrationEstablished:
        false,
      multiFrameSequenceBindingEstablished:
        false,
      timeStationarityEstablished:
        false,
      constantRateTemporalIntegrationAuthorized:
        false,
      temporalIntegrationApplied:
        false,
      componentEvidence: {
        binding:
          binding.componentEvidence
            .binding,
        colorSamplingProfile:
          binding.componentEvidence
            .colorSamplingProfile,
        nominalExposureDuration:
          windows
            .nominalExposureDurationSeconds
            .evidence,
        openingBoundary:
          boundaryEvidence(
            windows.opening
          ),
        closingBoundary:
          boundaryEvidence(
            windows.closing
          )
      }
    },
    "sensor-rate-local-exposure-binding",
    "1.0.0",
    [
      "The rate's abstract color-sampling site is mapped to the center of the same-index native effective sample only because an explicit one-to-one shared-top-left binding is present.",
      "Multi-site-per-native-sample relationships are blocked because contributor membership does not establish individual color-site timing coordinates.",
      "The mapped timing coordinate is a native-effective-raster timing coordinate; it does not establish a physical photodiode timing registration.",
      "The exposure schedule is recomputed from the evidence-backed opening/closing timing declarations at the bound point rather than accepting an arbitrary precomputed local duration.",
      "The color-sampling channel at the exact site must match the response-rate channel.",
      "The result represents one local exposure event only; multi-frame/pixel-shift sequence timing and combination remain outside this contract.",
      "This binding does not establish that the optical/electron/current rate is constant through the exposure. Motion, flicker, flash, time-varying illumination/vignetting and detector transients require a time-dependent integrand.",
      "Temporal integration, accumulated charge, saturation, noise, ADC/RAW conversion and reconstruction are not performed."
    ]
  );
}
