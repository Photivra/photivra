// SPDX-License-Identifier: Apache-2.0
/**
 * Repository-only #234 baseline profiler.
 *
 * Measures small owned reference cases by phase before the compact Path-A executor
 * changes runtime behavior. Results are informational evidence only: no CI threshold,
 * full-native qualification, device claim, or extrapolated acceptance is implied.
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

const compiled = mkdtempSync(join(tmpdir(), "photivra-reference-profile-"));
const CASES = Object.freeze([
  { pupilRays: 32, rolling: false },
  { pupilRays: 128, rolling: false },
  { pupilRays: 128, rolling: true }
]);
const REPEATS = 2;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function memorySnapshot() {
  const value = process.memoryUsage();
  return {
    rss: value.rss,
    heapUsed: value.heapUsed,
    arrayBuffers: value.arrayBuffers
  };
}

function forceGcAndSnapshot() {
  globalThis.gc?.();
  return memorySnapshot();
}

function elapsed(start) {
  return performance.now() - start;
}

function rawCodes(result) {
  return result.value.raw.value.frame.samples.map((sample) => sample.rawCode);
}

function assertCodes(label, actual, expected) {
  const a = Array.from(actual);
  if (a.length !== expected.length || a.some((value, index) => value !== expected[index])) {
    throw new Error(`${label} RAW disagreement.`);
  }
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
  if (compile.status !== 0) throw new Error("Reference profiling compilation failed.");

  cpSync("test/fixtures", join(compiled, "test/fixtures"), { recursive: true });

  const { frameInput, evaluator } = await import(
    pathToFileURL(join(compiled, "test/helpers/environment-raw-fixture.js")).href
  );
  const { evidence } = await import(
    pathToFileURL(join(compiled, "test/helpers/eqe-response-fixture.js")).href
  );
  const {
    planEnvironmentRawSite,
    simulateEnvironmentSensorRawFrame
  } = await import(
    pathToFileURL(join(compiled, "src/capture/environment-raw-producer.js")).href
  );
  const { executeEnvironmentSensorPhotoSignal } = await import(
    pathToFileURL(join(compiled, "src/sensor/environment-photo-signal.js")).href
  );
  const { calculateSensorDarkCurrentCharge } = await import(
    pathToFileURL(join(compiled, "src/sensor/dark-current.js")).href
  );
  const { simulateSensorRawFrame } = await import(
    pathToFileURL(join(compiled, "src/capture/sensor-raw-producer.js")).href
  );
  const { createNativeEnvironmentRawTask } = await import(
    pathToFileURL(join(compiled, "src/capture/native-environment-raw.js")).href
  );

  function configuredInput(pupilRays, rolling) {
    const value = frameInput(rolling);
    const pupil = {
      kind: "ideal-uniform-circular-pupil",
      radialSampleCount: pupilRays / 16,
      angularSampleCount: 16,
      evidence: evidence("profile:234-owned-pupil"),
      limitation: "Owned synthetic profiler pupil; no convergence or calibration claim."
    };
    for (const site of value.sites) site.environment.pupil = structuredClone(pupil);
    value.evaluateApertureRadiance = (request, ray) =>
      evaluator(request, (ray.originM.x > 0 ? 2 : 0) * 1e-9);
    return value;
  }

  function phaseProbe(input, expectedCodes) {
    const { evaluateRadiance, evaluateApertureRadiance, ...data } = input;

    const memoryBefore = forceGcAndSnapshot();
    const prepareStart = performance.now();
    const owned = structuredClone(data);
    const plans = owned.sites.map((site, index) =>
      planEnvironmentRawSite(
        site,
        index,
        owned.frame,
        owned.sceneBinding,
        owned.exposureWindow
      )
    );
    const preparationMs = elapsed(prepareStart);
    const memoryAfterPreparation = forceGcAndSnapshot();

    let sourceCallbackMs = 0;
    let sourceCallbackCount = 0;
    const wrap = (fn) => (...args) => {
      sourceCallbackCount += 1;
      const start = performance.now();
      try {
        return fn(...args);
      } finally {
        sourceCallbackMs += elapsed(start);
      }
    };

    const executionStart = performance.now();
    const siteResults = plans.map((plan) =>
      executeEnvironmentSensorPhotoSignal(
        plan,
        wrap(evaluateRadiance),
        evaluateApertureRadiance === undefined ? undefined : wrap(evaluateApertureRadiance)
      )
    );
    const sourceOpticalExecutionMs = elapsed(executionStart);
    const memoryAfterSourceOptical = forceGcAndSnapshot();

    const sensorStart = performance.now();
    const rawSites = owned.sites.map((site, index) => {
      const photoSignal = siteResults[index].value.photo.value.photoSignal;
      const darkCharge = calculateSensorDarkCurrentCharge({
        exposure: photoSignal,
        darkCurrentProfile: site.darkCurrentProfile,
        operatingTemperatureC: site.operatingTemperatureC
      }).value;
      return {
        ...site.readout,
        charge: { ...site.charge, photoSignal, darkCharge }
      };
    });
    const raw = simulateSensorRawFrame({
      frame: owned.frame,
      exposureWindow: owned.exposureWindow,
      sites: rawSites
    });
    const sensorAndRawMs = elapsed(sensorStart);
    const memoryAfterSensorRaw = forceGcAndSnapshot();

    assertCodes(
      "Decomposed reference probe",
      raw.value.frame.samples.map((sample) => sample.rawCode),
      expectedCodes
    );

    return {
      preparationMs,
      sourceOpticalExecutionMs,
      sourceCallbackMs,
      nonCallbackSourceOpticalMs: Math.max(0, sourceOpticalExecutionMs - sourceCallbackMs),
      sensorAndRawMs,
      sourceCallbackCount,
      plannedProviderEvaluationCount: plans.reduce((sum, plan) => sum + plan.count, 0),
      retainedMemorySnapshots: {
        before: memoryBefore,
        afterPreparation: memoryAfterPreparation,
        afterSourceOptical: memoryAfterSourceOptical,
        afterSensorRaw: memoryAfterSensorRaw
      }
    };
  }

  function nativeTaskInput(input) {
    const capture = input.frame.capture;
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

    const { capture: ignoredCapture, containerBitDepth, ...frame } = input.frame;
    void ignoredCapture;
    void containerBitDepth;

    const native = capture.geometry.nativeRaster;
    return {
      input: {
        raw: {
          ...frame,
          exposure,
          exposureWindow: input.exposureWindow,
          maximumOutputBytes: native.pixelWidth * native.pixelHeight * 7,
          tileWidth: 1
        },
        sceneBinding: input.sceneBinding,
        maximumProviderEvaluations: 100_000
      },
      native
    };
  }

  async function taskProbe(input, expectedCodes) {
    const { input: taskInput, native } = nativeTaskInput(input);
    let readTileMs = 0;
    let readTileCount = 0;
    let sourceCallbackMs = 0;
    let sourceCallbackCount = 0;
    let yieldMs = 0;
    let yieldCount = 0;

    const provider = {
      async readTile(request) {
        readTileCount += 1;
        const start = performance.now();
        try {
          return {
            ...request,
            sites: Array.from({ length: request.width }, (_, offset) => {
              const index = request.y * native.pixelWidth + request.x + offset;
              const site = structuredClone(input.sites[index]);
              site.environment.temporalIntegrationId =
                input.frame.frameId + ":native:" + index;
              return site;
            })
          };
        } finally {
          readTileMs += elapsed(start);
        }
      },
      evaluateRadiance(request) {
        sourceCallbackCount += 1;
        const start = performance.now();
        try {
          return input.evaluateRadiance(request);
        } finally {
          sourceCallbackMs += elapsed(start);
        }
      },
      evaluateApertureRadiance(request, ray) {
        sourceCallbackCount += 1;
        const start = performance.now();
        try {
          return input.evaluateApertureRadiance(request, ray);
        } finally {
          sourceCallbackMs += elapsed(start);
        }
      },
      async yieldControl() {
        yieldCount += 1;
        const start = performance.now();
        await setImmediate();
        yieldMs += elapsed(start);
      }
    };

    const memoryBefore = forceGcAndSnapshot();
    const taskCreateStart = performance.now();
    const task = createNativeEnvironmentRawTask(taskInput, provider);
    const taskCreationMs = elapsed(taskCreateStart);
    const memoryAfterTaskCreation = forceGcAndSnapshot();

    const runStart = performance.now();
    await task.run();
    const runMs = elapsed(runStart);
    const memoryAfterRun = forceGcAndSnapshot();
    const output = task.takeOutput();

    assertCodes("Bounded native task probe", output.raw.codes, expectedCodes);

    return {
      taskCreationMs,
      runMs,
      readTileMs,
      sourceCallbackMs,
      yieldMs,
      nonProviderRunMs: Math.max(0, runMs - readTileMs - sourceCallbackMs - yieldMs),
      readTileCount,
      sourceCallbackCount,
      yieldCount,
      providerEvaluationCount: output.providerEvaluationCount,
      completedTileCount: task.completedTileCount,
      outputBytes:
        output.raw.codes.byteLength +
        output.raw.blackLevels.byteLength +
        output.raw.digitalSaturationCodes.byteLength +
        output.raw.saturationFlags.byteLength,
      retainedMemorySnapshots: {
        before: memoryBefore,
        afterTaskCreation: memoryAfterTaskCreation,
        afterRunBeforeTransfer: memoryAfterRun,
        afterTransfer: forceGcAndSnapshot()
      }
    };
  }

  const revision = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
  const workingTreeModified =
    spawnSync("git", ["status", "--porcelain"], { encoding: "utf8" }).stdout.length > 0;
  const sourceSha256 = Object.fromEntries([
    "src/capture/environment-raw-producer.ts",
    "src/capture/native-environment-raw.ts",
    "src/capture/native-raw.ts",
    "src/sensor/environment-photo-signal.ts",
    "test/helpers/environment-raw-fixture.ts",
    "scripts/profile-native-reference-path.mjs"
  ].map((path) => [
    path,
    createHash("sha256").update(readFileSync(path)).digest("hex")
  ]));

  const results = [];
  for (const definition of CASES) {
    // Untimed warmup.
    simulateEnvironmentSensorRawFrame(
      configuredInput(definition.pupilRays, definition.rolling)
    );

    const monolithicMs = [];
    const phaseSamples = [];
    const taskSamples = [];

    for (let repeat = 0; repeat < REPEATS; repeat += 1) {
      const monolithicInput = configuredInput(
        definition.pupilRays,
        definition.rolling
      );
      forceGcAndSnapshot();
      const start = performance.now();
      const expected = simulateEnvironmentSensorRawFrame(monolithicInput);
      monolithicMs.push(elapsed(start));
      const expectedCodes = rawCodes(expected);

      phaseSamples.push(
        phaseProbe(
          configuredInput(definition.pupilRays, definition.rolling),
          expectedCodes
        )
      );
      taskSamples.push(
        await taskProbe(
          configuredInput(definition.pupilRays, definition.rolling),
          expectedCodes
        )
      );
    }

    results.push({
      case: {
        raster: { width: 2, height: 2 },
        spatialNodes: 4,
        temporalNodes: 2,
        spectralNodes: 2,
        pupilRays: definition.pupilRays,
        shutter: definition.rolling
          ? "right-to-left-native-scan"
          : "global"
      },
      repeats: REPEATS,
      medianMonolithicReferenceMs: median(monolithicMs),
      monolithicReferenceSamplesMs: monolithicMs,
      phaseSamples,
      taskSamples
    });
  }

  process.stdout.write(
    JSON.stringify({
      schemaVersion: "1.0.0",
      kind: "repository-only-234-reference-path-profile",
      revision,
      workingTreeModified,
      sourceSha256,
      runtime: process.version,
      platform: process.platform,
      arch: process.arch,
      forcedGcAvailable: typeof globalThis.gc === "function",
      measurementPolicy: "informational-only-no-ci-threshold",
      profilerScope:
        "Complete owned 2x2 synthetic reference events only; phase probes intentionally re-execute reference stages and are not additive accounting for production code.",
      memoryCaution:
        "Memory snapshots are process observations after explicit GC where available, not exact allocation counts or browser/device qualification.",
      extrapolationPolicy:
        "No full-native timing is extrapolated from these measurements.",
      results
    }, null, 2) + "\n"
  );
} finally {
  rmSync(resolve(compiled), { recursive: true, force: true });
}
