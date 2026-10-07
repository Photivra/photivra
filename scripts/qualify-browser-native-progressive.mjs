// SPDX-License-Identifier: Apache-2.0
/**
 * Repository-only #250 progressive complete-event qualification.
 *
 * This script intentionally measures only the frozen ladder documented in
 * docs/BROWSER_NATIVE_PROGRESSIVE_EVIDENCE.md. It never projects a 2048x1366
 * runtime and never claims full-native qualification.
 */
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { setImmediate } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { Buffer } from "node:buffer";

const compiled = mkdtempSync(join(tmpdir(), "photivra-progressive-reference-"));
const H = 6.62607015e-34;
const C = 299792458;
const AREA_M2 = 480_000e-12;
const BIN_WIDTH_NM = 50;
const WAVELENGTHS_NM = Object.freeze([425, 475]);
const DEFAULT_RADIANCE = 1e-9;
const PUPIL_RAYS = 128;
const PUPIL = Object.freeze({
  kind: "ideal-uniform-circular-pupil",
  radialSampleCount: 8,
  angularSampleCount: 16
});
const MAX_EVENT_WORK = 2_000_000_000;

const POSITIVE_CASES = Object.freeze([
  {
    evidenceId: "BNCE-PROG-001",
    width: 4,
    height: 4,
    rolling: false,
    aperture: 4,
    focus: { kind: "infinity" },
    radiance: DEFAULT_RADIANCE,
    evidenceBatchSize: 4
  },
  {
    evidenceId: "BNCE-PROG-002",
    width: 8,
    height: 8,
    rolling: false,
    aperture: 4,
    focus: { kind: "infinity" },
    radiance: DEFAULT_RADIANCE,
    evidenceBatchSize: 8
  },
  {
    evidenceId: "BNCE-PROG-003",
    width: 16,
    height: 16,
    rolling: false,
    aperture: 4,
    focus: { kind: "infinity" },
    radiance: DEFAULT_RADIANCE,
    evidenceBatchSize: 16
  },
  {
    evidenceId: "BNCE-PROG-004",
    width: 8,
    height: 8,
    rolling: true,
    aperture: 4,
    focus: { kind: "infinity" },
    radiance: DEFAULT_RADIANCE,
    evidenceBatchSize: 8
  },
  {
    evidenceId: "BNCE-PROG-005",
    width: 4,
    height: 4,
    rolling: false,
    aperture: 8,
    focus: { kind: "finite", distanceM: 5 },
    radiance: DEFAULT_RADIANCE,
    evidenceBatchSize: 4
  }
]);

function elapsed(start) {
  return performance.now() - start;
}

function memorySnapshot() {
  const value = process.memoryUsage();
  return {
    rss: value.rss,
    heapUsed: value.heapUsed,
    arrayBuffers: value.arrayBuffers
  };
}

function forceGc() {
  globalThis.gc?.();
  return memorySnapshot();
}

function updatePeak(peak) {
  const current = memorySnapshot();
  peak.rss = Math.max(peak.rss, current.rss);
  peak.heapUsed = Math.max(peak.heapUsed, current.heapUsed);
  peak.arrayBuffers = Math.max(peak.arrayBuffers, current.arrayBuffers);
}

function clone(value) {
  return globalThis.structuredClone(value);
}

function transmissionAt(wavelengthNm) {
  return 0.8 - 0.004 * (wavelengthNm - 400);
}

function qeAt(wavelengthNm) {
  return 0.2 + 0.004 * (wavelengthNm - 400);
}

function oracleCounts(radiance, aperture, exposureSeconds) {
  const acceptance = Math.PI / (4 * aperture ** 2);
  let photonRate = 0;
  let electronRate = 0;
  for (const wavelengthNm of WAVELENGTHS_NM) {
    const photonEnergy = H * C / (wavelengthNm * 1e-9);
    const radiantPowerPerNm =
      radiance * acceptance * transmissionAt(wavelengthNm) * AREA_M2;
    const photons =
      radiantPowerPerNm * BIN_WIDTH_NM / photonEnergy;
    photonRate += photons;
    electronRate += photons * qeAt(wavelengthNm);
  }
  return {
    expectedIncidentPhotonCount: photonRate * exposureSeconds,
    expectedGeneratedElectronCount: electronRate * exposureSeconds
  };
}

function relativeError(actual, expected) {
  return Math.abs(actual - expected) / Math.max(Math.abs(expected), Number.MIN_VALUE);
}

function arraysEqual(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function outputHash(output) {
  const pieces = [
    output.codes,
    output.blackLevels,
    output.digitalSaturationCodes,
    output.saturationFlags
  ].map((array) =>
    Buffer.from(array.buffer, array.byteOffset, array.byteLength)
  );
  return createHash("sha256").update(Buffer.concat(pieces)).digest("hex");
}

function saturationCounts(output) {
  let physical = 0;
  let preAdc = 0;
  let digital = 0;
  for (const value of output.saturationFlags) {
    if (value & 1) physical += 1;
    if (value & 2) preAdc += 1;
    if (value & 4) digital += 1;
  }
  return { physical, preAdc, digital };
}

try {
  const compile = spawnSync(process.execPath, [
    "node_modules/typescript/bin/tsc",
    "-p",
    "tsconfig.json",
    "--outDir",
    compiled,
    "--declaration",
    "false",
    "--declarationMap",
    "false",
    "--sourceMap",
    "false"
  ], { stdio: "inherit" });
  if (compile.status !== 0) {
    throw new Error("Progressive reference qualification compilation failed.");
  }

  cpSync("test/fixtures", join(compiled, "test/fixtures"), { recursive: true });

  const { frameInput } = await import(
    pathToFileURL(join(compiled, "test/helpers/environment-raw-fixture.js")).href
  );
  const { evidence } = await import(
    pathToFileURL(join(compiled, "test/helpers/eqe-response-fixture.js")).href
  );
  const { calculateCaptureExposureWindows } = await import(
    pathToFileURL(join(compiled, "src/sensor/exposure-window.js")).href
  );
  const {
    BROWSER_NATIVE_REFERENCE_GEOMETRY_VERSION
  } = await import(
    pathToFileURL(join(compiled, "src/capture/browser-native-reference-geometry.js")).href
  );
  const {
    prepareBrowserNativeReferenceEventPlan,
    BROWSER_NATIVE_REFERENCE_EVENT_PLAN_VERSION,
    BROWSER_NATIVE_REFERENCE_INTEGRATOR_VERSION
  } = await import(
    pathToFileURL(join(compiled, "src/capture/browser-native-reference-plan.js")).href
  );
  const {
    prepareBrowserNativeReferenceSite,
    BROWSER_NATIVE_REFERENCE_SITE_PLAN_VERSION
  } = await import(
    pathToFileURL(join(compiled, "src/capture/browser-native-reference-site.js")).href
  );
  const {
    prepareBrowserNativeReferenceSource,
    BROWSER_NATIVE_REFERENCE_SOURCE_VERSION
  } = await import(
    pathToFileURL(join(compiled, "src/capture/browser-native-reference-source.js")).href
  );
  const {
    createBrowserNativeReferenceTask,
    BROWSER_NATIVE_REFERENCE_EXECUTOR_VERSION
  } = await import(
    pathToFileURL(join(compiled, "src/capture/browser-native-reference-executor.js")).href
  );

  function staticSceneBindings(environment) {
    const bindings = environment.sceneBindings;
    const {
      illuminationTemporalProfileId: ignoredTemporalProfileId,
      ...providerProfile
    } = bindings.providerProfile;
    void ignoredTemporalProfileId;
    return {
      providerProfile,
      illuminationProfile: bindings.illuminationProfile,
      materialResponseProfile: bindings.materialResponseProfile
    };
  }

  function buildPreparedCase(definition, geometryMode = "single-plane") {
    const base = frameInput(definition.rolling);
    const baseLattice =
      base.sites[0].environment.sensor.spatialSampling.samplingApertureProfile
        .siteCenterLattice;
    const raster = {
      pixelWidth: definition.width,
      pixelHeight: definition.height
    };
    const imagingArea = {
      widthMm:
        baseLattice.pitchXMicrometers * definition.width / 1000,
      heightMm:
        baseLattice.pitchYMicrometers * definition.height / 1000
    };
    const capture = base.frame.capture;
    const {
      schemaVersion,
      engineApiVersion,
      resolvedGeometry,
      equivalentFocalLength35Mm,
      planes,
      ...exposure
    } = capture;
    void schemaVersion;
    void engineApiVersion;
    void resolvedGeometry;
    void equivalentFocalLength35Mm;
    void planes;

    exposure.geometry = {
      imagingArea,
      nativeRaster: raster,
      orientation: capture.geometry.orientation,
      outputRaster: raster
    };
    exposure.exposure = {
      ...exposure.exposure,
      aperture: definition.aperture
    };
    exposure.focus = clone(definition.focus);

    const captureModeProfile = clone(base.frame.captureModeProfile);
    const mode = captureModeProfile.modes.find(
      (candidate) => candidate.modeId === base.frame.modeId
    );
    if (!mode) throw new Error("Qualification fixture mode missing.");
    mode.processedImageRaster.value = clone(raster);

    const bindingProfile = {
      ...clone(base.frame.bindingProfile),
      nativeRaster: clone(raster)
    };
    const exposureWindow = clone(base.exposureWindow);

    const event = {
      raw: {
        exposure,
        frameId:
          base.frame.frameId + ":" + definition.evidenceId.toLowerCase(),
        modeId: base.frame.modeId,
        captureModeProfile,
        colorSamplingProfile: clone(base.frame.colorSamplingProfile),
        bindingProfile,
        exposureWindow,
        maximumOutputBytes: definition.width * definition.height * 7,
        tileWidth: Math.min(16, definition.width)
      },
      sceneBinding: clone(base.sceneBinding),
      maximumProviderEvaluations: MAX_EVENT_WORK
    };

    const geometryPrimitives =
      geometryMode === "exact-tie"
        ? [
            {
              kind: "axis-aligned-rectangle",
              primitiveId: "tie-a",
              minimumM: { x: -1e6, y: -1e6, z: 10 },
              maximumM: { x: 1e6, y: 1e6, z: 10 }
            },
            {
              kind: "axis-aligned-rectangle",
              primitiveId: "tie-b",
              minimumM: { x: -1e6, y: -1e6, z: 10 },
              maximumM: { x: 1e6, y: 1e6, z: 10 }
            }
          ]
        : [
            {
              kind: "axis-aligned-rectangle",
              primitiveId: "background",
              minimumM: { x: -1e6, y: -1e6, z: 10 },
              maximumM: { x: 1e6, y: 1e6, z: 10 }
            }
          ];

    const sourceRevision =
      definition.evidenceId.toLowerCase() + ":" + geometryMode;
    const eventPlan = prepareBrowserNativeReferenceEventPlan({
      event,
      geometry: {
        schemaVersion: BROWSER_NATIVE_REFERENCE_GEOMETRY_VERSION,
        sourceStateId: event.raw.exposure.sceneStateId,
        providerSceneId: event.sceneBinding.providerSceneId,
        sourceRevision,
        primitives: geometryPrimitives
      }
    });

    const samplePointsNative = Array.from(
      { length: definition.width * definition.height },
      (_, index) => ({
        x: index % definition.width + 0.5,
        y: Math.floor(index / definition.width) + 0.5
      })
    );
    const windows = calculateCaptureExposureWindows({
      ...exposureWindow,
      nativeRaster: raster,
      samplePointsNative
    }).value;

    const sites = Array.from(
      { length: definition.width * definition.height },
      (_, index) => {
        const x = index % definition.width;
        const y = Math.floor(index / definition.width);
        const phaseIndex = (y % 2) * 2 + (x % 2);
        const site = clone(base.sites[phaseIndex]);
        const environment = site.environment;
        environment.temporalIntegrationId =
          definition.evidenceId.toLowerCase() + ":site:" + index;
        environment.temporalSampleCount = 1;
        environment.pupil = {
          ...PUPIL,
          evidence: evidence("qualification:250-pupil"),
          limitation:
            "Owned 128-ray ideal circular pupil for progressive reference evidence."
        };
        environment.psf = {
          kind: "not-applied",
          evidence: evidence("qualification:250-no-psf"),
          limitation:
            "Progressive Path-A reference ladder uses the frozen no-sampled-PSF envelope."
        };
        environment.motion.angularVelocityRadPerSec = {
          pitch: 0,
          yaw: 0,
          roll: 0
        };
        environment.sceneBindings = staticSceneBindings(environment);
        environment.sensor.spatialSampling.site = { x, y };
        environment.sensor.spatialSampling.imagingArea = clone(imagingArea);
        environment.sensor.colorSamplingProfile =
          clone(eventPlan.rawPlan.frame.colorSamplingProfile);
        environment.sensor.localExposure.bindingProfile =
          clone(eventPlan.rawPlan.frame.bindingProfile);
        environment.sensor.localExposure.exposureWindowInput = {
          ...clone(exposureWindow),
          nativeRaster: clone(raster)
        };
        const lattice =
          environment.sensor.spatialSampling.samplingApertureProfile
            .siteCenterLattice;
        lattice.pitchXMicrometers = baseLattice.pitchXMicrometers;
        lattice.pitchYMicrometers = baseLattice.pitchYMicrometers;
        lattice.firstSiteCenterFromImagingAreaTopLeftMicrometers =
          clone(baseLattice.firstSiteCenterFromImagingAreaTopLeftMicrometers);

        environment.optics.focalLengthMm =
          eventPlan.rawPlan.exposure.exposure.focalLengthMm;
        environment.optics.nominalFNumber = definition.aperture;
        environment.optics.profile.applicability.focalLengthMm = {
          minimum: environment.optics.focalLengthMm,
          maximum: environment.optics.focalLengthMm
        };
        environment.optics.profile.applicability.nominalFNumber = {
          minimum: definition.aperture,
          maximum: definition.aperture
        };
        environment.optics.focus =
          definition.focus.kind === "infinity"
            ? { kind: "infinity-focus" }
            : {
                kind: "ideal-symmetric-thin-lens",
                objectDistanceM: definition.focus.distanceM,
                pupilMagnificationAssumption: "unity"
              };

        const window = windows.samples[index];
        if (!window) throw new Error("Qualification shutter window missing.");
        site.charge.completenessProfile.site = { x, y };
        site.charge.completenessProfile.startOffsetSecondsFromOpeningReference =
          window.startOffsetSecondsFromOpeningReference;
        site.charge.completenessProfile.endOffsetSecondsFromOpeningReference =
          window.endOffsetSecondsFromOpeningReference;
        site.darkCurrentProfile.siteApplicability = {
          kind: "exact-site",
          site: { x, y }
        };
        site.readout.capacityProfile.siteApplicability = {
          kind: "exact-site",
          site: { x, y }
        };

        return prepareBrowserNativeReferenceSite(
          eventPlan,
          site,
          index
        );
      }
    );

    const primitiveIds = geometryPrimitives.map(
      (primitive) => primitive.primitiveId
    );
    const source = prepareBrowserNativeReferenceSource(
      eventPlan.geometry,
      {
        version: BROWSER_NATIVE_REFERENCE_SOURCE_VERSION,
        sourceStateId: eventPlan.geometry.sourceStateId,
        providerSceneId: eventPlan.geometry.providerSceneId,
        sourceRevision: eventPlan.geometry.sourceRevision,
        wavelengthBasis: "vacuum",
        primitives: primitiveIds.map((primitiveId) => ({
          primitiveId,
          evidence: evidence("qualification:250-source"),
          limitation:
            "Owned static uniform spectral-radiance source for progressive reference evidence.",
          spectrum: WAVELENGTHS_NM.map((wavelengthNanometers) => ({
            wavelengthNanometers,
            spectralRadianceWattsPerSquareMeterSteradianNanometer:
              definition.radiance
          }))
        }))
      }
    );

    return { eventPlan, source, sites };
  }

  async function runPrepared(prepared, batchSize, capturePhoto) {
    const before = forceGc();
    const peak = { ...before };
    const observed = [];
    let yieldCount = 0;
    const task = createBrowserNativeReferenceTask(
      { ...prepared, batchSize },
      {
        observePhotoBatch(batch) {
          updatePeak(peak);
          if (capturePhoto) observed.push(...batch.sites);
        },
        async yieldControl() {
          yieldCount += 1;
          updatePeak(peak);
          await setImmediate();
        }
      }
    );
    const start = performance.now();
    await task.run();
    const milliseconds = elapsed(start);
    updatePeak(peak);
    const output = task.takeOutput();
    const after = forceGc();
    return {
      milliseconds,
      yieldCount,
      output,
      observed,
      work: clone(task.work),
      memory: { before, sampledPeak: peak, after }
    };
  }

  function compareOutputs(first, second) {
    for (const key of [
      "codes",
      "blackLevels",
      "digitalSaturationCodes",
      "saturationFlags"
    ]) {
      if (!arraysEqual(Array.from(first[key]), Array.from(second[key]))) {
        throw new Error("Progressive evidence output disagreement for " + key + ".");
      }
    }
  }

  async function measurePositive(definition) {
    const beforeCold = forceGc();
    let start = performance.now();
    const cold = buildPreparedCase(definition);
    const coldPreparationMs = elapsed(start);
    const afterCold = forceGc();

    start = performance.now();
    const warm = buildPreparedCase(definition);
    const warmPreparationMs = elapsed(start);
    const afterWarm = forceGc();

    const batchOne = await runPrepared(warm, 1, true);
    const evidenceBatch = await runPrepared(
      warm,
      definition.evidenceBatchSize,
      true
    );
    compareOutputs(batchOne.output, evidenceBatch.output);

    const oracle = oracleCounts(
      definition.radiance,
      definition.aperture,
      warm.eventPlan.rawPlan.exposure.exposure.shutterSeconds
    );
    let maxPhotonRelativeError = 0;
    let maxElectronRelativeError = 0;
    for (const site of evidenceBatch.observed) {
      maxPhotonRelativeError = Math.max(
        maxPhotonRelativeError,
        relativeError(
          site.expectedIncidentPhotonCount,
          oracle.expectedIncidentPhotonCount
        )
      );
      maxElectronRelativeError = Math.max(
        maxElectronRelativeError,
        relativeError(
          site.expectedGeneratedElectronCount,
          oracle.expectedGeneratedElectronCount
        )
      );
    }
    if (
      maxPhotonRelativeError > 5e-12 ||
      maxElectronRelativeError > 5e-12
    ) {
      throw new Error(
        definition.evidenceId + " independent SI photon/electron oracle mismatch."
      );
    }

    const expectedSites = definition.width * definition.height;
    const expectedGeometry = expectedSites * 4 * 1 * PUPIL_RAYS;
    const expectedSpectral = expectedGeometry * 2;
    if (
      evidenceBatch.work.logical.nativeSiteCount !== expectedSites ||
      evidenceBatch.work.planned.uniqueGeometryRequests !== expectedGeometry ||
      evidenceBatch.work.logical.committedSourceSampleCount !== expectedSpectral ||
      evidenceBatch.work.actual.geometryAttempts !== expectedGeometry ||
      evidenceBatch.work.actual.spectralOpticalCompositionAttempts !==
        expectedSpectral ||
      evidenceBatch.work.actual.sourceRadianceAttempts !== expectedSpectral ||
      evidenceBatch.work.actual.sensorSiteAttempts !== expectedSites
    ) {
      throw new Error(definition.evidenceId + " work accounting mismatch.");
    }

    return {
      evidenceId: definition.evidenceId,
      disposition: "pass",
      raster: {
        width: definition.width,
        height: definition.height
      },
      shutter: definition.rolling
        ? "right-to-left-native-scan"
        : "global",
      apertureFNumber: definition.aperture,
      focus: definition.focus,
      sourceRadianceWattsPerSquareMeterSteradianNanometer:
        definition.radiance,
      sampleSupport: {
        spatialNodesPerSite: 4,
        temporalNodesPerSite: 1,
        pupilRaysPerSite: PUPIL_RAYS,
        spectralNodesPerSite: 2
      },
      preparation: {
        coldMilliseconds: coldPreparationMs,
        warmMilliseconds: warmPreparationMs,
        memoryBeforeCold: beforeCold,
        memoryAfterCold: afterCold,
        memoryAfterWarm: afterWarm
      },
      execution: {
        batchOneMilliseconds: batchOne.milliseconds,
        evidenceBatchSize: definition.evidenceBatchSize,
        evidenceBatchMilliseconds: evidenceBatch.milliseconds,
        batchOneYieldCount: batchOne.yieldCount,
        evidenceBatchYieldCount: evidenceBatch.yieldCount
      },
      work: evidenceBatch.work,
      contractAccountedBytes: {
        outputPayloadBytes: evidenceBatch.output.plan.outputBytes,
        typedPreparedBytes: 0,
        typedScratchBytes: 0,
        limitation:
          "Prepared/scratch state is JavaScript object graph memory and is reported empirically, not fabricated as exact bytes."
      },
      empiricalMemory: evidenceBatch.memory,
      oracle: {
        expectedIncidentPhotonCountPerSite:
          oracle.expectedIncidentPhotonCount,
        expectedGeneratedElectronCountPerSite:
          oracle.expectedGeneratedElectronCount,
        maximumPhotonRelativeError: maxPhotonRelativeError,
        maximumElectronRelativeError: maxElectronRelativeError
      },
      output: {
        sha256: outputHash(evidenceBatch.output),
        saturationCounts: saturationCounts(evidenceBatch.output),
        exactBatchParity: true
      },
      fullNativeQualified: false,
      fullNativeRuntimeProjection: null
    };
  }

  async function measureTieControl() {
    const definition = {
      evidenceId: "BNCE-PROG-007",
      width: 4,
      height: 4,
      rolling: false,
      aperture: 4,
      focus: { kind: "infinity" },
      radiance: DEFAULT_RADIANCE,
      evidenceBatchSize: 4
    };
    const prepared = buildPreparedCase(definition, "exact-tie");
    const task = createBrowserNativeReferenceTask(
      { ...prepared, batchSize: 4 },
      { async yieldControl() {} }
    );
    let message = null;
    try {
      await task.run();
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    if (
      task.state !== "failed" ||
      message === null ||
      !message.includes("coincident-distinct-first-hit")
    ) {
      throw new Error("BNCE-PROG-007 exact tie did not fail closed.");
    }
    let outputUnavailable = false;
    try {
      task.takeOutput();
    } catch {
      outputUnavailable = true;
    }
    if (!outputUnavailable) {
      throw new Error("BNCE-PROG-007 exposed partial output.");
    }
    return {
      evidenceId: definition.evidenceId,
      disposition: "expected-fail-closed",
      message,
      work: clone(task.work),
      outputUnavailable,
      fullNativeQualified: false
    };
  }

  async function measureCancellationControl() {
    const definition = {
      evidenceId: "BNCE-PROG-008",
      width: 4,
      height: 4,
      rolling: false,
      aperture: 4,
      focus: { kind: "infinity" },
      radiance: DEFAULT_RADIANCE,
      evidenceBatchSize: 4
    };
    const prepared = buildPreparedCase(definition);
    const holder = {};
    const task = createBrowserNativeReferenceTask(
      { ...prepared, batchSize: 4 },
      {
        observePhotoBatch() {
          holder.task.cancel();
        },
        async yieldControl() {}
      }
    );
    holder.task = task;
    let message = null;
    try {
      await task.run();
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    let outputUnavailable = false;
    try {
      task.takeOutput();
    } catch {
      outputUnavailable = true;
    }
    if (
      task.state !== "cancelled" ||
      !outputUnavailable ||
      task.work.actual.sensorSiteAttempts !== 0
    ) {
      throw new Error("BNCE-PROG-008 cancellation checkpoint failed.");
    }
    return {
      evidenceId: definition.evidenceId,
      disposition: "cancelled-as-expected",
      message,
      work: clone(task.work),
      outputUnavailable,
      fullNativeQualified: false
    };
  }

  async function measureFailureControl() {
    const definition = {
      evidenceId: "BNCE-PROG-009",
      width: 4,
      height: 4,
      rolling: false,
      aperture: 4,
      focus: { kind: "infinity" },
      radiance: DEFAULT_RADIANCE,
      evidenceBatchSize: 4
    };
    const prepared = buildPreparedCase(definition);
    const task = createBrowserNativeReferenceTask(
      { ...prepared, batchSize: 4 },
      {
        observePhotoBatch() {
          throw new Error("qualification observer failure");
        },
        async yieldControl() {}
      }
    );
    let message = null;
    try {
      await task.run();
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    let outputUnavailable = false;
    try {
      task.takeOutput();
    } catch {
      outputUnavailable = true;
    }
    if (
      task.state !== "failed" ||
      !outputUnavailable ||
      task.work.actual.observerAttempts !== 1 ||
      task.work.actual.sensorSiteAttempts !== 0
    ) {
      throw new Error("BNCE-PROG-009 observer failure accounting failed.");
    }
    return {
      evidenceId: definition.evidenceId,
      disposition: "failed-as-expected",
      message,
      work: clone(task.work),
      outputUnavailable,
      fullNativeQualified: false
    };
  }

  const baselineOracleAtUnitRadiance = oracleCounts(1, 4, 0.01);
  const nearFullWellRadiance =
    1000 / baselineOracleAtUnitRadiance.expectedGeneratedElectronCount;
  const cases = [
    ...POSITIVE_CASES,
    {
      evidenceId: "BNCE-PROG-006",
      width: 4,
      height: 4,
      rolling: false,
      aperture: 4,
      focus: { kind: "infinity" },
      radiance: nearFullWellRadiance,
      evidenceBatchSize: 4
    }
  ];

  const revision = spawnSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8"
  }).stdout.trim();
  const workingTreeModified =
    spawnSync("git", ["status", "--porcelain"], {
      encoding: "utf8"
    }).stdout.length > 0;
  const hashedPaths = [
    "src/capture/browser-native-reference-executor.ts",
    "src/capture/browser-native-reference-plan.ts",
    "src/capture/browser-native-reference-site.ts",
    "src/capture/browser-native-reference-source.ts",
    "src/capture/browser-native-reference-geometry.ts",
    "scripts/qualify-browser-native-progressive.mjs",
    "docs/BROWSER_NATIVE_PROGRESSIVE_EVIDENCE.md"
  ];
  const sourceSha256 = Object.fromEntries(
    hashedPaths.map((path) => [
      path,
      createHash("sha256").update(readFileSync(path)).digest("hex")
    ])
  );

  const positive = [];
  for (const definition of cases) {
    positive.push(await measurePositive(definition));
  }
  const controls = [
    await measureTieControl(),
    await measureCancellationControl(),
    await measureFailureControl()
  ];

  process.stdout.write(
    JSON.stringify(
      {
        schemaVersion: "1.0.0",
        kind: "repository-only-250-progressive-complete-event-evidence",
        revision,
        workingTreeModified,
        sourceSha256,
        runtime: process.version,
        platform: process.platform,
        arch: process.arch,
        forcedGcAvailable: typeof globalThis.gc === "function",
        versions: {
          eventPlan: BROWSER_NATIVE_REFERENCE_EVENT_PLAN_VERSION,
          integrator: BROWSER_NATIVE_REFERENCE_INTEGRATOR_VERSION,
          sitePlan: BROWSER_NATIVE_REFERENCE_SITE_PLAN_VERSION,
          source: BROWSER_NATIVE_REFERENCE_SOURCE_VERSION,
          executor: BROWSER_NATIVE_REFERENCE_EXECUTOR_VERSION
        },
        ladderFrozenBy:
          "docs/BROWSER_NATIVE_PROGRESSIVE_EVIDENCE.md",
        evidence: [...positive, ...controls],
        interpretation: {
          completeEventsMeasured: true,
          fullNativeQualified: false,
          fullNativeRuntimeProjection: null,
          fullNativeOwnedByIssue: 251,
          changedMethodActivated: false,
          limitation:
            "Synthetic progressive resource/exactness ladder only. Physical imaging area grows with raster to hold per-site fixture physics constant; full-native product geometry is not inferred."
        }
      },
      null,
      2
    ) + "\n"
  );
} finally {
  rmSync(resolve(compiled), { recursive: true, force: true });
}
