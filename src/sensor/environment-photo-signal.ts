// SPDX-License-Identifier: Apache-2.0

import { approximationResult, type CalculationResult } from "../core/calculation-result.js";
import { freezeOwnedData } from "../core/owned-data.js";
import { requirePublicOpaqueId } from "../core/record-validation.js";
import { parseEvidenceList, type EvidenceProvenance } from "../core/evidence-provenance.js";
import { InvalidScientificInputError } from "../core/validation.js";
import { parseSceneIlluminationProfile } from "../schema/illumination.js";
import { parseSceneIlluminationTemporalProfile } from "../schema/illumination-temporal.js";
import { parseSceneMaterialResponseProfile, parseSceneRadianceProviderProfile, parseSceneRadianceEvaluationResult,
  validateSceneRadianceEvaluationBindings, type SceneRadianceEvaluationRequest,
  type SceneRadianceEvaluationResult } from "../schema/scene-radiance.js";
import { calculateSensorEnvironmentRadianceQuery, type CalculateSensorEnvironmentRadianceQueryInput } from "../optics/sensor-environment-query.js";
import { calculateSceneRadianceToSensorIrradiance, type CalculateSceneRadianceToSensorIrradianceInput } from "../optics/scene-to-sensor-irradiance.js";
import { calculateSensorPsfIrradianceQuadrature, type CalculateSensorPsfIrradianceQuadratureInput } from "../optics/sensor-psf-quadrature.js";
import { sensorPsfSourcePoint } from "../optics/sensor-psf-support.js";
import { resolveLensSampledPsf } from "../optics/lens-psf-profile.js";
import { calculateSensorSpatialSamplingQuadrature } from "./spatial-sampling-quadrature.js";
import { calculateSensorSpectralQuadrature } from "./spectral-quadrature.js";
import { resolveNativeEffectiveRasterColorSamplingBinding } from "./capture-color-sampling-binding.js";
import { calculateCaptureExposureWindows } from "./exposure-window.js";
import { createSensorEqeTemporalPhotoSignal } from "./temporal-photo-signal.js";
import type { CalculateSensorEqeTemporalExposureInput } from "./eqe-temporal-exposure.js";
import type { CalculateSceneToSensorIrradianceQuadratureInput } from "../optics/scene-to-sensor-quadrature.js";

/** Supplied synchronous code executes locally. Invocation does not prove physical transport. */
export type EnvironmentRadianceEvaluator = (request: Readonly<SceneRadianceEvaluationRequest>) => SceneRadianceEvaluationResult;
export interface CalculateEnvironmentSensorPhotoSignalInput {
  temporalIntegrationId: string;
  sensor: Omit<CalculateSensorEqeTemporalExposureInput, "samples">;
  sceneBindings: CalculateSceneToSensorIrradianceQuadratureInput["sceneBindings"];
  optics: Omit<CalculateSceneRadianceToSensorIrradianceInput,
    "sceneRadianceRequest" | "sceneRadianceResult" | "imagePointMm" | "fieldThroughput">;
  motion: Pick<CalculateSensorEnvironmentRadianceQueryInput,
    "angularVelocityRadPerSec" | "timeReference" | "environmentDirectionConvention">;
  temporalSampleCount: number;
  /** Explicit unity field throughput; spatial vignetting is not inferred or applied. */
  fieldThroughput: { kind: "unity"; evidence: readonly EvidenceProvenance[]; limitation: string };
  psf: { kind: "not-applied"; evidence: readonly EvidenceProvenance[]; limitation: string } | {
    kind: "sampled-local";
    configuration: Pick<CalculateSensorPsfIrradianceQuadratureInput, "psf" | "psfWavelengthBasis" | "spatialModel">;
  };
  evaluateRadiance: EnvironmentRadianceEvaluator;
}
export interface EnvironmentSensorPhotoSignal {
  sourceTargetProjectionCalculated: true;
  providerCallbackExecuted: true;
  providerTransportVerified: false;
  sceneVisibilityCalculated: false;
  productionPlanActivated: false;
  providerEvaluationCount: number;
  sourcePlane: "sensor-package-incident";
  fieldThroughputEvidence: readonly EvidenceProvenance[];
  fieldThroughputLimitation: string;
  psfOmission: { evidence: readonly EvidenceProvenance[]; limitation: string } | null;
  psfRedistributionApplied: boolean;
  photo: ReturnType<typeof createSensorEqeTemporalPhotoSignal>;
  instants: readonly {
    temporalSampleIndex: number;
    timeSecondsFromOpeningReference: number;
    psf: ReturnType<typeof calculateSensorPsfIrradianceQuadrature> | null;
    evaluations: readonly {
      query: ReturnType<typeof calculateSensorEnvironmentRadianceQuery>;
      result: SceneRadianceEvaluationResult;
      bindings: ReturnType<typeof validateSceneRadianceEvaluationBindings>;
      optics: ReturnType<typeof calculateSceneRadianceToSensorIrradiance>;
    }[];
  }[];
}

/** Internal preflight is shared with the full-frame composer to bound all work before callbacks. */
interface EnvironmentPhotoPlan {
  owned: Omit<CalculateEnvironmentSensorPhotoSignalInput, "evaluateRadiance">;
  sceneBindings: CalculateSceneToSensorIrradianceQuadratureInput["sceneBindings"];
  fieldThroughputEvidence: readonly EvidenceProvenance[];
  spatialQuadrature: ReturnType<typeof calculateSensorSpatialSamplingQuadrature>["value"];
  spectralQuadrature: ReturnType<typeof calculateSensorSpectralQuadrature>["value"];
  count: number;
  focus: CalculateSensorEnvironmentRadianceQueryInput["focus"];
  instants: { temporalSampleIndex: number; time: number; groups: {
    node: CalculateSensorPsfIrradianceQuadratureInput["samples"][number]["node"];
    taps: { kernelSampleX: number; kernelSampleY: number; point: { x: number; y: number };
      query: ReturnType<typeof calculateSensorEnvironmentRadianceQuery> }[];
  }[] }[];
}
export function planEnvironmentSensorPhotoSignal(input: Omit<CalculateEnvironmentSensorPhotoSignalInput, "evaluateRadiance">): EnvironmentPhotoPlan {
  const owned = structuredClone(input);
  requirePublicOpaqueId(owned.temporalIntegrationId, "Environment integration requires a public identity.");
  if (!Number.isSafeInteger(owned.temporalSampleCount) || owned.temporalSampleCount < 1 || owned.temporalSampleCount > 256 ||
    owned.sensor.responseApplication.sourcePlane.value !== "sensor-package-incident" ||
    owned.fieldThroughput?.kind !== "unity" || typeof owned.fieldThroughput.limitation !== "string" || !owned.fieldThroughput.limitation.trim()) {
    throw new InvalidScientificInputError("Environment exposure requires package-incident response, 1..256 midpoints and explicit unity throughput.");
  }
  const fieldThroughputEvidence = parseEvidenceList(owned.fieldThroughput.evidence, "environmentFieldThroughput.evidence");
  const sceneBindings = { providerProfile: parseSceneRadianceProviderProfile(owned.sceneBindings.providerProfile),
    illuminationProfile: parseSceneIlluminationProfile(owned.sceneBindings.illuminationProfile),
    materialResponseProfile: parseSceneMaterialResponseProfile(owned.sceneBindings.materialResponseProfile),
    ...(owned.sceneBindings.illuminationTemporalProfile === undefined ? {} : {
      illuminationTemporalProfile: parseSceneIlluminationTemporalProfile(owned.sceneBindings.illuminationTemporalProfile) }) };
  if (sceneBindings.providerProfile.fidelity.spectral !== "wavelength-resolved") throw new InvalidScientificInputError("Environment exposure requires wavelength-resolved provider fidelity.");
  const sensor = owned.sensor;
  const nativeRaster = sensor.localExposure.exposureWindowInput.nativeRaster;
  const binding = resolveNativeEffectiveRasterColorSamplingBinding({ nativeRaster, colorSamplingProfile: sensor.colorSamplingProfile,
    bindingProfile: sensor.localExposure.bindingProfile });
  if (binding.relationshipMeaning !== "one-native-effective-sample-to-one-color-site") throw new InvalidScientificInputError("Environment exposure requires explicit one-to-one native/color timing.");
  const spatialQuadrature = calculateSensorSpatialSamplingQuadrature({ ...sensor.spatialSampling, nativeRaster,
    colorSamplingProfile: sensor.colorSamplingProfile, colorSamplingBindingProfile: sensor.localExposure.bindingProfile }).value;
  const spectralQuadrature = calculateSensorSpectralQuadrature({ ...sensor.spectralSampling,
    colorSamplingProfile: sensor.colorSamplingProfile, spectralResponseProfile: sensor.spectralResponseProfile }).value;
  if (spectralQuadrature.wavelengthBasis === "unspecified") throw new InvalidScientificInputError("Environment spectral basis must be explicit.");
  const wavelengthBasis = spectralQuadrature.wavelengthBasis;
  const site = sensor.spatialSampling.site;
  const window = calculateCaptureExposureWindows({ ...sensor.localExposure.exposureWindowInput,
    samplePointsNative: [{ x: site.x+.5, y: site.y+.5 }] }).value.samples[0]!;
  const focus = owned.optics.focus.kind === "infinity-focus" ? { kind: "infinity" as const } :
    owned.optics.focus.kind === "ideal-symmetric-thin-lens" ? { kind: "finite" as const, distanceM: owned.optics.focus.objectDistanceM } :
    owned.optics.focus.focus.kind === "infinity" ? { kind: "infinity" as const } : { kind: "finite" as const, distanceM: owned.optics.focus.focus.objectDistanceM };
  if (owned.psf.kind === "not-applied") {
    parseEvidenceList(owned.psf.evidence, "environmentPsfOmission.evidence");
    if (typeof owned.psf.limitation !== "string" || !owned.psf.limitation.trim()) throw new InvalidScientificInputError("PSF omission needs an explicit limitation.");
  } else if (owned.psf.kind !== "sampled-local") throw new InvalidScientificInputError("Unknown environment PSF selection.");
  if (owned.psf.kind === "sampled-local") {
    const p = owned.psf.configuration.psf;
    if (p.focalLengthMm !== owned.optics.focalLengthMm || p.apertureFNumber !== owned.optics.nominalFNumber ||
      p.focus.kind !== focus.kind || (p.focus.kind === "finite" && focus.kind === "finite" && p.focus.distanceM !== focus.distanceM)) {
      throw new InvalidScientificInputError("PSF and optical focal/aperture/focus state must match exactly.");
    }
  }
  let count = 0;
  const nodes = spectralQuadrature.nodes.flatMap(spectral => spatialQuadrature.nodes.map(spatial => {
    const node = { spatialNode: { antiAliasingComponentIndex: spatial.antiAliasingComponentIndex,
      apertureSampleXIndex: spatial.apertureSampleXIndex, apertureSampleYIndex: spatial.apertureSampleYIndex },
      spectralSampleIndex: spectral.spectralSampleIndex, wavelengthNanometers: spectral.wavelengthNanometers };
    const destination = spatial.preAntiAliasingSourcePointMm;
    const resolved = owned.psf.kind === "sampled-local" ? resolveLensSampledPsf({ ...owned.psf.configuration.psf,
      wavelengthNm: spectral.wavelengthNanometers, fieldPointMm: { x: destination.x, y: -destination.y } }) : null;
    const kernel = resolved?.value.kernel;
    const taps = kernel ? kernel.widthSamples*kernel.heightSamples : 1;
    count += taps*owned.temporalSampleCount;
    if (count > 100000) throw new InvalidScientificInputError("Environment exposure exceeds the 100000-provider-evaluation budget.");
    const points = Array.from({ length: taps }, (_, i) => ({ kernelSampleX: kernel ? i%kernel.widthSamples : 0,
      kernelSampleY: kernel ? Math.floor(i/kernel.widthSamples) : 0,
      point: kernel ? sensorPsfSourcePoint(destination, kernel, i%kernel.widthSamples, Math.floor(i/kernel.widthSamples)) : { ...destination } }));
    return { node, points };
  }));
  const measure = window.localExposureDurationSeconds/owned.temporalSampleCount;
  let previous = -Infinity;
  const instants = Array.from({ length: owned.temporalSampleCount }, (_, temporalSampleIndex) => {
    const time = window.startOffsetSecondsFromOpeningReference+(temporalSampleIndex+.5)*measure;
    if (!(time > window.startOffsetSecondsFromOpeningReference && time > previous && time < window.endOffsetSecondsFromOpeningReference)) throw new InvalidScientificInputError("Local midpoints must be representable and strictly ordered.");
    previous = time;
    const groups = nodes.map((n, ni) => ({ node: n.node, taps: n.points.map((p, pi) => ({ ...p,
      query: calculateSensorEnvironmentRadianceQuery({ ...owned.motion, sourcePointNativeSensorMm: p.point,
        focalLengthMm: owned.optics.focalLengthMm, focus, timeSecondsFromOpeningReference: time,
        request: { schemaVersion: "0.1.0", sampleId: `${owned.temporalIntegrationId}-t${temporalSampleIndex}-n${ni}-p${pi}`,
          providerProfileId: sceneBindings.providerProfile.profileId, sceneId: sceneBindings.providerProfile.sceneId,
          illuminationProfileId: sceneBindings.illuminationProfile.profileId, materialResponseProfileId: sceneBindings.materialResponseProfile.profileId,
          wavelengthNanometers: n.node.wavelengthNanometers, wavelengthBasis } }) })) }));
    // Validate PSF evidence/basis/support before supplied code is invoked.
    if (owned.psf.kind === "sampled-local") calculateSensorPsfIrradianceQuadrature({ ...owned.psf.configuration,
      spatialQuadrature, spectralQuadrature, timeSecondsFromOpeningReference: time,
      inputMeaning: "pre-psf-pre-sensor-stack-pre-aa-spectral-irradiance", samples: groups.map(g => ({ node: g.node,
        sourceSamples: g.taps.map(t => ({ kernelSampleX: t.kernelSampleX, kernelSampleY: t.kernelSampleY,
          sourcePointNativeSensorMm: t.point, timeSecondsFromOpeningReference: time, spectralIrradianceWattsPerSquareMeterPerNanometer: 0 })) })) });
    return { temporalSampleIndex, time, groups };
  });
  return { owned, sceneBindings, fieldThroughputEvidence, spatialQuadrature, spectralQuadrature, instants, count, focus };
}

/** Internal executor consumes a completed bounded geometric plan; returns no partial success on failure. */
export function executeEnvironmentSensorPhotoSignal(plan: ReturnType<typeof planEnvironmentSensorPhotoSignal>, evaluate: EnvironmentRadianceEvaluator): CalculationResult<EnvironmentSensorPhotoSignal> {
  if (typeof evaluate !== "function") throw new InvalidScientificInputError("Environment radiance evaluator must be synchronous callable code.");
  const { owned } = plan;
  const irradiance = [];
  const instants: EnvironmentSensorPhotoSignal["instants"][number][] = [];
  for (const instant of plan.instants) {
    const evaluations: EnvironmentSensorPhotoSignal["instants"][number]["evaluations"][number][] = [];
    const samples = instant.groups.map(group => ({ node: group.node, sourceSamples: group.taps.map(tap => {
      const request = freezeOwnedData(structuredClone(tap.query.value.request));
      const result = parseSceneRadianceEvaluationResult(evaluate(request));
      const bindings = validateSceneRadianceEvaluationBindings({ ...plan.sceneBindings, request, result });
      const optics = calculateSceneRadianceToSensorIrradiance({ ...owned.optics, sceneRadianceRequest: request,
        sceneRadianceResult: result, imagePointMm: tap.query.value.sourcePointImagePlaneMm, fieldThroughput: { kind: "unity" } });
      evaluations.push({ query: tap.query, result, bindings, optics });
      return { kernelSampleX: tap.kernelSampleX, kernelSampleY: tap.kernelSampleY, sourcePointNativeSensorMm: tap.point,
        timeSecondsFromOpeningReference: instant.time,
        spectralIrradianceWattsPerSquareMeterPerNanometer: optics.value.sensorPlaneSpectralIrradianceWattsPerSquareMeterNanometer };
    }) }));
    const psf = owned.psf.kind === "sampled-local" ? calculateSensorPsfIrradianceQuadrature({ ...owned.psf.configuration,
      spatialQuadrature: plan.spatialQuadrature, spectralQuadrature: plan.spectralQuadrature,
      timeSecondsFromOpeningReference: instant.time, inputMeaning: "pre-psf-pre-sensor-stack-pre-aa-spectral-irradiance", samples }) : null;
    irradiance.push({ temporalSampleIndex: instant.temporalSampleIndex, timeSecondsFromOpeningReference: instant.time,
      irradianceSamples: psf ? psf.value.irradianceSamples : samples.map(s => ({ node: s.node,
        spectralIrradianceWattsPerSquareMeterPerNanometer: s.sourceSamples[0]!.spectralIrradianceWattsPerSquareMeterPerNanometer })) });
    instants.push({ temporalSampleIndex: instant.temporalSampleIndex, timeSecondsFromOpeningReference: instant.time, psf, evaluations });
  }
  const photo = createSensorEqeTemporalPhotoSignal({ temporalIntegrationId: owned.temporalIntegrationId,
    exposure: { ...owned.sensor, samples: irradiance } });
  return approximationResult({ sourceTargetProjectionCalculated: true, providerCallbackExecuted: true,
    providerTransportVerified: false, sceneVisibilityCalculated: false, productionPlanActivated: false,
    providerEvaluationCount: plan.count, sourcePlane: "sensor-package-incident", fieldThroughputEvidence: plan.fieldThroughputEvidence,
    fieldThroughputLimitation: owned.fieldThroughput.limitation,
    psfOmission: owned.psf.kind === "not-applied" ? { evidence: parseEvidenceList(owned.psf.evidence, "psfOmission.evidence"), limitation: owned.psf.limitation } : null,
    psfRedistributionApplied: owned.psf.kind === "sampled-local", photo, instants
  }, "environment-sensor-photo-signal", "0.1.0", [
    "Supplied synchronous provider code was invoked at each generated environment query; physical transport and visibility are not verified.",
    "Ideal focus-aware rotation/projection, explicit unity field throughput and optional destination-local sampled PSF are bounded approximations.",
    "PSF pupil throughput is not applied; child uncertainty, finite-support and quadrature convergence are not combined or established."
  ]);
}

/** Generate, evaluate and integrate one site's actual local midpoint environment support. */
export function calculateEnvironmentSensorPhotoSignal(input: CalculateEnvironmentSensorPhotoSignalInput): CalculationResult<EnvironmentSensorPhotoSignal> {
  const { evaluateRadiance, ...data } = input;
  return executeEnvironmentSensorPhotoSignal(planEnvironmentSensorPhotoSignal(data), evaluateRadiance);
}
