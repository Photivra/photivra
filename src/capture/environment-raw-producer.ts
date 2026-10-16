// SPDX-License-Identifier: Apache-2.0

/**
 * Module boundary and integration notes.
 * Preflight complete native coverage and aggregate support before invoking supplied provider code,
 * then reuse dark/completeness/capacity/noise/ADC ownership. The returned RAW frame feeds the existing
 * reconstruction and paired export APIs.
 * @see docs/ENVIRONMENT_RAW_CAPTURE.md for equations, coordinate/unit conventions, blockers and
 * support limits.
 */

import { parseEvidenceList, type EvidenceProvenance } from "../core/evidence-provenance.js";
import { requirePublicOpaqueId } from "../core/record-validation.js";
import { stringifyCanonicalJson } from "../core/canonical-json.js";
import { approximationResult, type CalculationResult } from "../core/calculation-result.js";
import { InvalidScientificInputError } from "../core/validation.js";
import { parseSimulatedCapture } from "./simulated-capture.js";
import { RAW_REFERENCE_MAX_NATIVE_SITES } from "./raw-frame-limits.js";
import { simulateSensorRawFrame, type SensorRawProducerInput, type SensorRawProducerSiteInput, type NativeRawProducerFrameContext, type SensorRawProducerExposureWindowInput } from "./sensor-raw-producer.js";
import { calculateSensorDarkCurrentCharge, type SensorDarkCurrentProfile } from "../sensor/dark-current.js";
import { planEnvironmentSensorPhotoSignal, executeEnvironmentSensorPhotoSignal,
  type CalculateEnvironmentSensorPhotoSignalInput, type EnvironmentRadianceEvaluator, type EnvironmentApertureRadianceEvaluator } from "../sensor/environment-photo-signal.js";

function canonical(value: unknown): string {
  return stringifyCanonicalJson(value, { undefinedObjectProperties: "omit",
    nonFiniteNumberMessage: "Environment capture binding must be finite.", unsupportedValueMessage: "Environment capture binding requires plain data." });
}

/** Full native site order; generated photo/dark charge cannot be supplied as a shortcut. */
export interface SimulateEnvironmentSensorRawFrameInput {
  frame: SensorRawProducerInput["frame"];
  sceneBinding: { sceneStateId: string; providerSceneId: string; evidence: readonly EvidenceProvenance[] };
  /** Shared shutter schedule is bound to the committed frame duration. */
  exposureWindow: NonNullable<SensorRawProducerInput["exposureWindow"]>;
  sites: readonly {
    environment: Omit<CalculateEnvironmentSensorPhotoSignalInput, "evaluateRadiance" | "evaluateApertureRadiance">;
    darkCurrentProfile: SensorDarkCurrentProfile;
    operatingTemperatureC: number;
    charge: Omit<SensorRawProducerSiteInput["charge"], "photoSignal" | "darkCharge">;
    readout: Omit<SensorRawProducerSiteInput, "charge">;
  }[];
  evaluateRadiance: EnvironmentRadianceEvaluator;
  evaluateApertureRadiance?: EnvironmentApertureRadianceEvaluator;
}
/**
 * Approximate executed provider-to-RAW lineage. sites retain per-site optical/EQE
 * results; raw retains charge, capacity, seeded-noise/readout diagnostics and exact
 * native frame. providerEvaluationCount is actual bounded work, not a quality score.
 * Conservative verification/activation flags belong to this standalone adapter;
 * a parent production plan records its own graph execution without upgrading them.
 */
export interface EnvironmentSensorRawFrame {
  upstreamOrigin: "executed-environment-query-provider-optics-psf-eqe";
  providerTransportVerified: false;
  productionPlanActivated: false;
  providerEvaluationCount: number;
  sceneBinding: SimulateEnvironmentSensorRawFrameInput["sceneBinding"];
  sites: readonly ReturnType<typeof executeEnvironmentSensorPhotoSignal>[];
  raw: ReturnType<typeof simulateSensorRawFrame>;
}

/**
 * Internal per-frame memo of the frame-side canonical strings that every site is compared with (#2, 2.0
 * performance). Each string is computed lazily at the comparison that first needs it, so the first failing
 * comparison and its error are unchanged; it applies only to the exact frame and exposure-window objects it
 * was created for, which callers do not mutate while planning one frame.
 */
export interface EnvironmentRawFrameCanonicalMemo {
  readonly frame: NativeRawProducerFrameContext;
  readonly exposureWindow: SensorRawProducerExposureWindowInput;
  readonly strings: Map<"imagingArea" | "colorSamplingProfile" | "bindingProfile" | "exposureWindow" | "focus", string>;
}
export function createEnvironmentRawFrameCanonicalMemo(frame: NativeRawProducerFrameContext,
  exposureWindow: SensorRawProducerExposureWindowInput): EnvironmentRawFrameCanonicalMemo {
  return { frame, exposureWindow, strings: new Map() };
}
/** Internal frame-binding and scalar optical/EQE planning shared with bounded native execution; ownership as planEnvironmentSensorPhotoSignal. */
export function planEnvironmentRawSite(site: SimulateEnvironmentSensorRawFrameInput["sites"][number], i: number,
  frame: NativeRawProducerFrameContext, sceneBinding: SimulateEnvironmentSensorRawFrameInput["sceneBinding"],
  exposureWindow: SensorRawProducerExposureWindowInput, ownership: "copy" | "engine-owned" = "copy",
  memo?: EnvironmentRawFrameCanonicalMemo, retention: "full" | "photo-only" = "full"): ReturnType<typeof planEnvironmentSensorPhotoSignal> {
  const capture=frame.capture,native=capture.geometry.nativeRaster;
  const strings = memo !== undefined && memo.frame === frame && memo.exposureWindow === exposureWindow ? memo.strings : undefined;
  const frameCanonical = (key: "imagingArea" | "colorSamplingProfile" | "bindingProfile" | "exposureWindow" | "focus", value: () => unknown): string => {
    let text = strings?.get(key);
    if (text === undefined) { text = canonical(value()); strings?.set(key, text); }
    return text;
  };
    const e = site.environment, sensor = e.sensor;
    if (sensor.spatialSampling.site.x !== i%native.pixelWidth || sensor.spatialSampling.site.y !== Math.floor(i/native.pixelWidth) ||
      canonical(sensor.spatialSampling.imagingArea) !== frameCanonical("imagingArea", () => capture.geometry.imagingArea) ||
      canonical(sensor.colorSamplingProfile) !== frameCanonical("colorSamplingProfile", () => frame.colorSamplingProfile) ||
      canonical(sensor.localExposure.bindingProfile) !== frameCanonical("bindingProfile", () => frame.bindingProfile) ||
      canonical(sensor.localExposure.exposureWindowInput) !== frameCanonical("exposureWindow", () => ({ ...exposureWindow, nativeRaster: native })) ||
      e.optics.focalLengthMm !== capture.exposure.focalLengthMm || e.optics.nominalFNumber !== capture.exposure.aperture) {
      throw new InvalidScientificInputError("Environment site, frame geometry/profiles, optics and exact shutter event must match the committed capture.");
    }
    const plan = planEnvironmentSensorPhotoSignal(e, ownership, retention);
    if (canonical(plan.focus) !== frameCanonical("focus", () => capture.focus) ||
      e.sceneBindings.providerProfile.sceneId !== sceneBinding.providerSceneId) throw new InvalidScientificInputError("Environment optical focus and provider scene must match the committed capture binding.");
  return plan;
}
/**
 * Preflight complete native coverage and aggregate support before invoking supplied
 * provider code, then reuse dark/completeness/capacity/noise/ADC ownership. The
 * returned RAW frame feeds the existing reconstruction and paired export APIs.
 */
export function simulateEnvironmentSensorRawFrame(input: SimulateEnvironmentSensorRawFrameInput): CalculationResult<EnvironmentSensorRawFrame> {
  const { evaluateRadiance, evaluateApertureRadiance, ...data } = input;
  if (typeof evaluateRadiance !== "function") throw new InvalidScientificInputError("Environment RAW requires a synchronous evaluator.");
  const owned = structuredClone(data);
  const capture = parseSimulatedCapture(owned.frame.capture), native = capture.geometry.nativeRaster;
  const count = native.pixelWidth*native.pixelHeight;
  if (count > RAW_REFERENCE_MAX_NATIVE_SITES || !Array.isArray(owned.sites) || owned.sites.length !== count ||
    owned.exposureWindow.nominalExposureDurationSeconds.value !== capture.exposure.shutterSeconds) {
    throw new InvalidScientificInputError("Environment RAW requires complete bounded native coverage and the committed shutter duration.");
  }
  requirePublicOpaqueId(owned.sceneBinding.providerSceneId, "Scene binding requires a public provider scene identity.");
  parseEvidenceList(owned.sceneBinding.evidence, "environmentCaptureSceneBinding.evidence");
  if (owned.sceneBinding.sceneStateId !== capture.sceneStateId || capture.sceneTimeSeconds !== 0) throw new InvalidScientificInputError("Environment RAW requires explicit committed scene binding at the opening-reference scene time zero.");
  let evaluations = 0;
  const ids = new Set<string>();
  const sharedState = (e: SimulateEnvironmentSensorRawFrameInput["sites"][number]["environment"]): string => canonical({
    sceneBindings: e.sceneBindings, optics: e.optics, motion: e.motion, psf: e.psf, pupil: e.pupil, fieldThroughput: e.fieldThroughput });
  // Site 0's shared state is serialized once per frame rather than once per site (#2); it is evaluated after the
  // per-site duplicate-ID check and the per-site serialization exactly as before, so the first error is unchanged.
  let firstSharedState: string | undefined;
  const memo = createEnvironmentRawFrameCanonicalMemo(owned.frame, owned.exposureWindow);
  const plans = Array.from(owned.sites, (site, i) => {
    if (!site) throw new InvalidScientificInputError("Environment RAW site array must be dense.");
    const e = site.environment;
    if (ids.has(e.temporalIntegrationId) || sharedState(e) !== (firstSharedState ??= sharedState(owned.sites[0]!.environment))) {
      throw new InvalidScientificInputError("Environment site, frame geometry/profiles, optics and exact shutter event must match the committed capture.");
    }
    const plan = planEnvironmentRawSite(site,i,owned.frame,owned.sceneBinding,owned.exposureWindow,"copy",memo);
    ids.add(e.temporalIntegrationId);
    evaluations += plan.count;
    if (evaluations > 100000) throw new InvalidScientificInputError("Environment RAW exceeds the aggregate 100000-provider-evaluation budget.");
    return plan;
  });
  if (plans.some(plan => plan.owned.pupil !== undefined) && typeof evaluateApertureRadiance !== "function") throw new InvalidScientificInputError("Pupil capture requires an origin-aware aperture evaluator before any callback.");
  const sites = plans.map(plan => executeEnvironmentSensorPhotoSignal(plan, evaluateRadiance, evaluateApertureRadiance));
  const raw = simulateSensorRawFrame({ frame: owned.frame, exposureWindow: owned.exposureWindow,
    sites: owned.sites.map((s, i) => {
      const photoSignal = sites[i]!.value.photo.value.photoSignal;
      const darkCharge = calculateSensorDarkCurrentCharge({ exposure: photoSignal,
        darkCurrentProfile: s.darkCurrentProfile, operatingTemperatureC: s.operatingTemperatureC }).value;
      return { ...s.readout, charge: { ...s.charge, photoSignal, darkCharge } };
    }) });
  return approximationResult({ upstreamOrigin: "executed-environment-query-provider-optics-psf-eqe",
    providerTransportVerified: false, productionPlanActivated: false, providerEvaluationCount: evaluations, sceneBinding: { ...owned.sceneBinding, evidence: parseEvidenceList(owned.sceneBinding.evidence, "sceneBinding.evidence") }, sites, raw
  }, "environment-native-raw-producer", "0.1.0", [
    "Full native capture uses executed supplied environment provider code, not verified scene transport or calibrated photographic truth.",
    "Existing response, charge completeness, capacity, seeded noise and ADC validators remain authoritative; RAW origin flags remain conservative.",
    "Reference native-site and aggregate evaluation budgets remain in force; production-plan activation and full-resolution/editor acceptance remain separate."
  ]);
}
