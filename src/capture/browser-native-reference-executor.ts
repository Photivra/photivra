// SPDX-License-Identifier: Apache-2.0

/**
 * Repository-internal #249 bounded prepared Path-A reference executor.
 *
 * This executor consumes the owned event/site contracts from #247/#248. It
 * reuses wavelength-independent visibility only for an identical ray/time
 * request, executes every committed wavelength-dependent source/optical/sensor
 * contribution, and reuses the existing sensor noise/readout/ADC implementation.
 *
 * It is intentionally not exported from the package root.
 */
import { stringifyCanonicalJson } from "../core/canonical-json.js";
import { freezeOwnedData } from "../core/owned-data.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";
import { InvalidScientificInputError } from "../core/validation.js";
import { calculateSensorDarkCurrentCharge } from "../sensor/dark-current.js";
import {
  planEnvironmentSensorPhotoSignal
} from "../sensor/environment-photo-signal.js";
import { createSensorEqeTemporalPhotoSignal } from "../sensor/temporal-photo-signal.js";
import {
  calculateNativeRawSite,
  validateNativeRawReadoutIdentity,
  type SensorRawProducerSiteInput
} from "./sensor-raw-producer.js";
import {
  calculateSceneRadianceToSensorIrradiance
} from "../optics/scene-to-sensor-irradiance.js";
import {
  validateSceneRadianceEvaluationBindings,
  type SceneRadianceEvaluationRequest
} from "../schema/scene-radiance.js";
import {
  intersectBrowserNativeReferenceGeometry,
  type BrowserNativeReferenceHitResult
} from "./browser-native-reference-geometry.js";
import type { SensorApertureRay } from "../optics/sensor-aperture-rays.js";
import type { NativeRawOutput, NativeRawTaskState } from "./native-raw.js";
import type { PreparedBrowserNativeReferenceEventPlan } from "./browser-native-reference-plan.js";
import type { PreparedBrowserNativeReferenceSite } from "./browser-native-reference-site.js";
import {
  evaluateBrowserNativeReferenceSource,
  type PreparedBrowserNativeReferenceSource
} from "./browser-native-reference-source.js";

export const BROWSER_NATIVE_REFERENCE_EXECUTOR_VERSION = "0.1.0" as const;

export interface BrowserNativeReferenceExecutorProvider {
  observePhotoBatch?(
    batch: Readonly<BrowserNativeReferencePhotoBatch>,
    signal: AbortSignal
  ): void | Promise<void>;
  yieldControl(signal: AbortSignal): Promise<void>;
}

export interface BrowserNativeReferencePhotoBatch {
  startNativeIndex: number;
  siteCount: number;
  sites: readonly {
    nativeIndex: number;
    expectedIncidentPhotonCount: number;
    expectedGeneratedElectronCount: number;
  }[];
}

export interface BrowserNativeReferenceWorkAccounting {
  executorVersion: typeof BROWSER_NATIVE_REFERENCE_EXECUTOR_VERSION;
  eventIdentityJson: string;
  sourceIdentityJson: string;
  batchSize: number;
  logical: {
    nativeSiteCount: number;
    spatialNodeTotal: number;
    temporalNodeTotal: number;
    pupilSampleTotal: number;
    spectralNodeTotal: number;
    committedSourceSampleCount: number;
  };
  planned: {
    uniqueGeometryRequests: number;
    spectralOpticalCompositions: number;
    sensorSiteProcessing: number;
    metadataReadAttempts: 0;
    batchCount: number;
    maximumBatchGeometryRequests: number;
    maximumBatchSpectralOpticalCompositions: number;
  };
  actual: {
    geometryAttempts: number;
    geometryReuseHits: number;
    spectralOpticalCompositionAttempts: number;
    sourceRadianceAttempts: number;
    sensorSiteAttempts: number;
    observerAttempts: number;
    completedBatchCount: number;
  };
}

export interface BrowserNativeReferenceTask {
  readonly state: NativeRawTaskState;
  readonly completedBatchCount: number;
  readonly work: BrowserNativeReferenceWorkAccounting;
  run(): Promise<void>;
  cancel(): void;
  dispose(): void;
  takeOutput(): NativeRawOutput;
}

export interface CreateBrowserNativeReferenceTaskInput {
  eventPlan: PreparedBrowserNativeReferenceEventPlan;
  source: PreparedBrowserNativeReferenceSource;
  sites: readonly PreparedBrowserNativeReferenceSite[];
  /** Native sites per bounded execution batch, 1..256. */
  batchSize?: number;
}

type GeometryCacheEntry = {
  timeSecondsFromOpeningReference: number;
  originM: SensorApertureRay["originM"];
  directionUnitVector: SensorApertureRay["directionUnitVector"];
  visibility: BrowserNativeReferenceHitResult;
};

function sameVector(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number }
): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

function createRequest(
  base: SceneRadianceEvaluationRequest,
  ray: SensorApertureRay
): SceneRadianceEvaluationRequest {
  return freezeOwnedData({
    ...base,
    sampleId: base.sampleId + "-a" + ray.pupilSampleIndex,
    target: {
      kind: "environment-direction" as const,
      outgoingDirectionUnitVector: {
        x: -ray.directionUnitVector.x,
        y: -ray.directionUnitVector.y,
        z: -ray.directionUnitVector.z
      }
    }
  });
}

function executePreparedPhotoSignal(
  eventPlan: PreparedBrowserNativeReferenceEventPlan,
  source: PreparedBrowserNativeReferenceSource,
  site: PreparedBrowserNativeReferenceSite,
  accounting: BrowserNativeReferenceWorkAccounting,
  signal: AbortSignal
): ReturnType<typeof createSensorEqeTemporalPhotoSignal>["value"]["photoSignal"] {
  const plan = freezeOwnedData(
    planEnvironmentSensorPhotoSignal(site.environment)
  );
  if (plan.owned.psf.kind !== "not-applied" || plan.owned.pupil === undefined) {
    throw new InvalidConfigurationError(
      "Browser-native prepared reference executor currently requires the frozen ideal-pupil/no-sampled-PSF envelope."
    );
  }

  const spatialCount = plan.spatialQuadrature.nodes.length;
  const spectralCount = plan.spectralQuadrature.nodes.length;
  if (
    spatialCount !== site.logicalSupport.spatialNodeCount ||
    spectralCount !== site.logicalSupport.spectralNodeCount ||
    plan.instants.length !== site.logicalSupport.temporalNodeCount ||
    plan.count !== site.logicalSupport.committedSourceSampleCount
  ) {
    throw new InvalidConfigurationError(
      "Browser-native prepared site logical support changed after preparation."
    );
  }

  const irradiance: {
    temporalSampleIndex: number;
    timeSecondsFromOpeningReference: number;
    irradianceSamples: {
      node: (typeof plan.instants)[number]["groups"][number]["node"];
      spectralIrradianceWattsPerSquareMeterPerNanometer: number;
    }[];
  }[] = [];

  for (const instant of plan.instants) {
    if (signal.aborted) {
      throw new InvalidConfigurationError(
        "Browser-native prepared reference execution aborted."
      );
    }
    const geometryCache = new Map<number, GeometryCacheEntry>();
    const samples: {
      node: (typeof instant.groups)[number]["node"];
      sourceSamples: {
        kernelSampleX: number;
        kernelSampleY: number;
        sourcePointNativeSensorMm: { x: number; y: number };
        timeSecondsFromOpeningReference: number;
        spectralIrradianceWattsPerSquareMeterPerNanometer: number;
      }[];
    }[] = [];

    for (let groupIndex = 0; groupIndex < instant.groups.length; groupIndex++) {
      const group = instant.groups[groupIndex]!;
      if (group.taps.length !== 1) {
        throw new InvalidConfigurationError(
          "Browser-native prepared reference executor does not admit sampled-PSF tap expansion."
        );
      }
      const tap = group.taps[0]!;
      const support = tap.apertureRays;
      if (
        support === undefined ||
        support.length !== site.logicalSupport.pupilSampleCount
      ) {
        throw new InvalidConfigurationError(
          "Browser-native prepared reference pupil support changed after preparation."
        );
      }

      const spatialOrdinal = groupIndex % spatialCount;
      let integratedIrradiance = 0;

      for (const ray of support) {
        if (signal.aborted) {
          throw new InvalidConfigurationError(
            "Browser-native prepared reference execution aborted."
          );
        }

        const geometryKey =
          spatialOrdinal * site.logicalSupport.pupilSampleCount +
          ray.pupilSampleIndex;
        let cached = geometryCache.get(geometryKey);
        if (cached === undefined) {
          accounting.actual.geometryAttempts += 1;
          const visibility = freezeOwnedData(
            intersectBrowserNativeReferenceGeometry(eventPlan.geometry, {
              originM: ray.originM,
              directionUnitVector: ray.directionUnitVector
            })
          );
          if (visibility.kind === "unsupported") {
            throw new InvalidScientificInputError(
              "Browser-native reference geometry is unsupported for this exact ray: " +
                visibility.reason
            );
          }
          cached = {
            timeSecondsFromOpeningReference: instant.time,
            originM: ray.originM,
            directionUnitVector: ray.directionUnitVector,
            visibility
          };
          geometryCache.set(geometryKey, cached);
        } else {
          if (
            cached.timeSecondsFromOpeningReference !== instant.time ||
            !sameVector(cached.originM, ray.originM) ||
            !sameVector(cached.directionUnitVector, ray.directionUnitVector)
          ) {
            throw new InvalidConfigurationError(
              "Browser-native geometry reuse requires an exactly identical ray/time request."
            );
          }
          accounting.actual.geometryReuseHits += 1;
        }

        accounting.actual.spectralOpticalCompositionAttempts += 1;
        const baseRequest = tap.query.value.request;
        const request = createRequest(baseRequest, ray);
        accounting.actual.sourceRadianceAttempts += 1;
        const result = evaluateBrowserNativeReferenceSource(
          source,
          request,
          cached.visibility
        );
        if (signal.aborted) {
          throw new InvalidConfigurationError(
            "Browser-native prepared reference execution aborted."
          );
        }
        validateSceneRadianceEvaluationBindings({
          ...plan.sceneBindings,
          request,
          result
        });
        const optics = calculateSceneRadianceToSensorIrradiance({
          ...plan.owned.optics,
          sceneRadianceRequest: request,
          sceneRadianceResult: result,
          imagePointMm: tap.query.value.sourcePointImagePlaneMm,
          fieldThroughput: tap.fieldThroughput
        });
        integratedIrradiance +=
          optics.value
            .sensorPlaneSpectralIrradianceWattsPerSquareMeterNanometer *
          ray.weight;
      }

      samples.push({
        node: group.node,
        sourceSamples: [
          {
            kernelSampleX: tap.kernelSampleX,
            kernelSampleY: tap.kernelSampleY,
            sourcePointNativeSensorMm: tap.point,
            timeSecondsFromOpeningReference: instant.time,
            spectralIrradianceWattsPerSquareMeterPerNanometer:
              integratedIrradiance
          }
        ]
      });
    }

    irradiance.push({
      temporalSampleIndex: instant.temporalSampleIndex,
      timeSecondsFromOpeningReference: instant.time,
      irradianceSamples: samples.map((sample) => ({
        node: sample.node,
        spectralIrradianceWattsPerSquareMeterPerNanometer:
          sample.sourceSamples[0]!
            .spectralIrradianceWattsPerSquareMeterPerNanometer
      }))
    });
  }

  const photo = createSensorEqeTemporalPhotoSignal({
    temporalIntegrationId: plan.owned.temporalIntegrationId,
    exposure: {
      ...plan.owned.sensor,
      samples: irradiance
    }
  });
  return photo.value.photoSignal;
}

function checkedAdd(a: number, b: number, label: string): number {
  const value = a + b;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new InvalidConfigurationError(
      "Browser-native reference " + label + " exceeds safe-integer accounting."
    );
  }
  return value;
}

function prepareAccounting(
  input: CreateBrowserNativeReferenceTaskInput,
  batchSize: number
): BrowserNativeReferenceWorkAccounting {
  const { eventPlan, source, sites } = input;
  const geometryIdentityJson = stringifyCanonicalJson(eventPlan.geometry, {
    undefinedObjectProperties: "omit",
    nonFiniteNumberMessage:
      "Browser-native reference geometry identity requires finite numbers.",
    unsupportedValueMessage:
      "Browser-native reference geometry identity requires plain serializable data."
  });
  if (
    source.sourceStateId !== eventPlan.geometry.sourceStateId ||
    source.providerSceneId !== eventPlan.geometry.providerSceneId ||
    source.sourceRevision !== eventPlan.geometry.sourceRevision ||
    source.geometryIdentityJson !== geometryIdentityJson
  ) {
    throw new InvalidConfigurationError(
      "Browser-native prepared source identity does not match the exact prepared event geometry."
    );
  }
  if (
    !Array.isArray(sites) ||
    sites.length !== eventPlan.rawPlan.pixelCount ||
    Array.from({ length: sites.length }, (_, index) => index in sites).includes(
      false
    )
  ) {
    throw new InvalidConfigurationError(
      "Browser-native reference executor requires complete dense prepared native-site coverage."
    );
  }

  const sourceWavelengthsByPrimitive = source.primitives.map(
    (primitive) => ({
      primitiveId: primitive.primitiveId,
      wavelengths: new Set(
        primitive.spectrum.map((sample) => sample.wavelengthNanometers)
      )
    })
  );

  let spatialNodeTotal = 0;
  let temporalNodeTotal = 0;
  let pupilSampleTotal = 0;
  let spectralNodeTotal = 0;
  let committedSourceSampleCount = 0;
  let plannedUniqueGeometryCount = 0;
  let maximumBatchGeometryRequests = 0;
  let maximumBatchSpectralOpticalCompositions = 0;

  for (let start = 0; start < sites.length; start += batchSize) {
    let batchGeometry = 0;
    let batchSpectral = 0;
    for (
      let index = start;
      index < Math.min(start + batchSize, sites.length);
      index++
    ) {
      const site = sites[index]!;
      if (
        site.nativeIndex !== index ||
        site.eventIdentityJson !== eventPlan.identityJson
      ) {
        throw new InvalidConfigurationError(
          "Browser-native prepared site identity does not match the exact event/native index."
        );
      }
      if (site.expectedProviderEvaluationCount > 100_000) {
        throw new InvalidConfigurationError(
          "Browser-native prepared site exceeds the existing per-source-tile provider-evaluation bound."
        );
      }

      const angularVelocity =
        site.environment.motion.angularVelocityRadPerSec;
      if (
        angularVelocity.pitch !== 0 ||
        angularVelocity.yaw !== 0 ||
        angularVelocity.roll !== 0 ||
        site.environment.sceneBindings.providerProfile
          .illuminationTemporalProfileId !== undefined ||
        site.environment.sceneBindings.illuminationTemporalProfile !== undefined
      ) {
        throw new InvalidConfigurationError(
          "Browser-native prepared reference executor requires the frozen static-source, zero-camera-motion qualification envelope."
        );
      }

      if (
        site.environment.sensor.spectralSampling.wavelengthBasis !==
          source.wavelengthBasis ||
        sourceWavelengthsByPrimitive.some(({ wavelengths }) =>
          site.logicalSupport.spectralWavelengthsNanometers.some(
            (wavelength: number) => !wavelengths.has(wavelength)
          )
        )
      ) {
        throw new InvalidConfigurationError(
          "Browser-native prepared source must cover every exact committed site wavelength before scientific execution."
        );
      }

      spatialNodeTotal = checkedAdd(
        spatialNodeTotal,
        site.logicalSupport.spatialNodeCount,
        "spatial support"
      );
      temporalNodeTotal = checkedAdd(
        temporalNodeTotal,
        site.logicalSupport.temporalNodeCount,
        "temporal support"
      );
      pupilSampleTotal = checkedAdd(
        pupilSampleTotal,
        site.logicalSupport.pupilSampleCount,
        "pupil support"
      );
      spectralNodeTotal = checkedAdd(
        spectralNodeTotal,
        site.logicalSupport.spectralNodeCount,
        "spectral support"
      );
      committedSourceSampleCount = checkedAdd(
        committedSourceSampleCount,
        site.logicalSupport.committedSourceSampleCount,
        "logical source support"
      );
      plannedUniqueGeometryCount = checkedAdd(
        plannedUniqueGeometryCount,
        site.logicalSupport.plannedUniqueGeometryCount,
        "planned geometry work"
      );
      batchGeometry = checkedAdd(
        batchGeometry,
        site.logicalSupport.plannedUniqueGeometryCount,
        "batch geometry work"
      );
      batchSpectral = checkedAdd(
        batchSpectral,
        site.logicalSupport.committedSourceSampleCount,
        "batch spectral work"
      );
    }
    maximumBatchGeometryRequests = Math.max(
      maximumBatchGeometryRequests,
      batchGeometry
    );
    maximumBatchSpectralOpticalCompositions = Math.max(
      maximumBatchSpectralOpticalCompositions,
      batchSpectral
    );
  }

  if (committedSourceSampleCount > eventPlan.maximumProviderEvaluations) {
    throw new InvalidConfigurationError(
      "Browser-native prepared reference event exceeds the unchanged whole-event dynamic scientific-work budget."
    );
  }

  return {
    executorVersion: BROWSER_NATIVE_REFERENCE_EXECUTOR_VERSION,
    eventIdentityJson: eventPlan.identityJson,
    sourceIdentityJson: source.identityJson,
    batchSize,
    logical: {
      nativeSiteCount: sites.length,
      spatialNodeTotal,
      temporalNodeTotal,
      pupilSampleTotal,
      spectralNodeTotal,
      committedSourceSampleCount
    },
    planned: {
      uniqueGeometryRequests: plannedUniqueGeometryCount,
      spectralOpticalCompositions: committedSourceSampleCount,
      sensorSiteProcessing: sites.length,
      metadataReadAttempts: 0,
      batchCount: Math.ceil(sites.length / batchSize),
      maximumBatchGeometryRequests,
      maximumBatchSpectralOpticalCompositions
    },
    actual: {
      geometryAttempts: 0,
      geometryReuseHits: 0,
      spectralOpticalCompositionAttempts: 0,
      sourceRadianceAttempts: 0,
      sensorSiteAttempts: 0,
      observerAttempts: 0,
      completedBatchCount: 0
    }
  };
}

export function createBrowserNativeReferenceTask(
  input: CreateBrowserNativeReferenceTaskInput,
  provider: BrowserNativeReferenceExecutorProvider
): BrowserNativeReferenceTask {
  if (
    !provider ||
    typeof provider.yieldControl !== "function" ||
    (provider.observePhotoBatch !== undefined &&
      typeof provider.observePhotoBatch !== "function")
  ) {
    throw new InvalidConfigurationError(
      "Browser-native prepared reference executor requires a host yield callback and optional photo observer."
    );
  }

  const batchSize = input.batchSize ?? 1;
  if (
    !Number.isSafeInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > 256
  ) {
    throw new InvalidConfigurationError(
      "Browser-native prepared reference batch size must be an integer from 1 to 256."
    );
  }

  const eventPlan = input.eventPlan;
  const source = input.source;
  const sites = input.sites;
  const work = prepareAccounting(input, batchSize);
  const abort = new AbortController();
  let state: NativeRawTaskState = "ready";
  let output: NativeRawOutput | null = null;
  let firstRawSite: SensorRawProducerSiteInput | undefined;

  function active(): void {
    if (abort.signal.aborted) {
      throw new InvalidConfigurationError(
        "Browser-native prepared reference execution aborted."
      );
    }
  }

  function release(): void {
    if (output !== null) {
      output.codes.fill(0);
      output.blackLevels.fill(0);
      output.digitalSaturationCodes.fill(0);
      output.saturationFlags.fill(0);
    }
    output = null;
    firstRawSite = undefined;
  }

  return {
    get state(): NativeRawTaskState {
      return state;
    },
    get completedBatchCount(): number {
      return work.actual.completedBatchCount;
    },
    get work(): BrowserNativeReferenceWorkAccounting {
      return work;
    },
    async run(): Promise<void> {
      if (state !== "ready") {
        throw new InvalidConfigurationError(
          "Browser-native prepared reference task is single-use."
        );
      }
      state = "running";

      try {
        output = {
          plan: eventPlan.rawPlan,
          codes: new Uint16Array(eventPlan.rawPlan.pixelCount),
          blackLevels: new Uint16Array(eventPlan.rawPlan.pixelCount),
          digitalSaturationCodes: new Uint16Array(eventPlan.rawPlan.pixelCount),
          saturationFlags: new Uint8Array(eventPlan.rawPlan.pixelCount)
        };

        for (let start = 0; start < sites.length; start += batchSize) {
          active();
          const stop = Math.min(start + batchSize, sites.length);
          const pending: {
            nativeIndex: number;
            rawSite: SensorRawProducerSiteInput;
            expectedIncidentPhotonCount: number;
            expectedGeneratedElectronCount: number;
          }[] = [];

          for (let index = start; index < stop; index++) {
            active();
            const site = sites[index]!;
            const photoSignal = executePreparedPhotoSignal(
              eventPlan,
              source,
              site,
              work,
              abort.signal
            );
            const darkCharge = calculateSensorDarkCurrentCharge({
              exposure: photoSignal,
              darkCurrentProfile: site.darkCurrentProfile,
              operatingTemperatureC: site.operatingTemperatureC
            }).value;
            const rawSite: SensorRawProducerSiteInput = {
              charge: {
                photoSignal,
                darkCharge,
                completenessProfile: site.charge.completenessProfile,
                ...(site.charge.additionalChargeComponents === undefined
                  ? {}
                  : {
                      additionalChargeComponents:
                        site.charge.additionalChargeComponents
                    })
              },
              ...site.readout
            };
            firstRawSite ??= rawSite;
            validateNativeRawReadoutIdentity(rawSite, firstRawSite);

            pending.push({
              nativeIndex: index,
              rawSite,
              expectedIncidentPhotonCount:
                photoSignal.expectedIncidentPhotonCount,
              expectedGeneratedElectronCount:
                photoSignal.expectedGeneratedElectronCount
            });
          }

          if (provider.observePhotoBatch !== undefined) {
            work.actual.observerAttempts += 1;
            await provider.observePhotoBatch(
              freezeOwnedData({
                startNativeIndex: start,
                siteCount: pending.length,
                sites: pending.map((entry) => ({
                  nativeIndex: entry.nativeIndex,
                  expectedIncidentPhotonCount:
                    entry.expectedIncidentPhotonCount,
                  expectedGeneratedElectronCount:
                    entry.expectedGeneratedElectronCount
                }))
              }),
              abort.signal
            );
            active();
          }

          for (const entry of pending) {
            active();
            work.actual.sensorSiteAttempts += 1;
            const readout = calculateNativeRawSite(
              entry.rawSite,
              eventPlan.rawPlan.exposure.noise.seedUint32,
              entry.nativeIndex
            ).readout.value;
            output.codes[entry.nativeIndex] = readout.rawCode;
            output.blackLevels[entry.nativeIndex] = readout.blackLevelCode;
            output.digitalSaturationCodes[entry.nativeIndex] =
              readout.digitalSaturationCode;
            output.saturationFlags[entry.nativeIndex] =
              Number(readout.physicalScalarSaturationApplied) |
              (Number(readout.preAdcSaturationApplied) << 1) |
              (Number(readout.digitalSaturationApplied) << 2);
          }

          work.actual.completedBatchCount += 1;
          await provider.yieldControl(abort.signal);
          active();
        }

        if (
          work.actual.geometryAttempts !==
            work.planned.uniqueGeometryRequests ||
          work.actual.geometryAttempts + work.actual.geometryReuseHits !==
            work.logical.committedSourceSampleCount ||
          work.actual.spectralOpticalCompositionAttempts !==
            work.planned.spectralOpticalCompositions ||
          work.actual.sourceRadianceAttempts !==
            work.planned.spectralOpticalCompositions ||
          work.actual.sensorSiteAttempts !==
            work.planned.sensorSiteProcessing
        ) {
          throw new InvalidConfigurationError(
            "Browser-native prepared reference work accounting did not reconcile."
          );
        }

        firstRawSite = undefined;
        state = "completed";
      } catch (error) {
        release();
        if (!abort.signal.aborted) {
          state = "failed";
          abort.abort();
        }
        throw error;
      }
    },
    cancel(): void {
      if (
        state === "ready" ||
        state === "running" ||
        state === "completed"
      ) {
        state = "cancelled";
        abort.abort();
        release();
      }
    },
    dispose(): void {
      if (state !== "transferred") {
        state = "disposed";
        abort.abort();
        release();
      }
    },
    takeOutput(): NativeRawOutput {
      if (state !== "completed" || output === null) {
        throw new InvalidConfigurationError(
          "Browser-native prepared reference output unavailable."
        );
      }
      const result = output;
      output = null;
      firstRawSite = undefined;
      state = "transferred";
      return result;
    }
  };
}
