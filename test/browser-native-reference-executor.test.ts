// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  createBrowserNativeReferenceTask,
  type BrowserNativeReferenceTask
} from "../src/capture/browser-native-reference-executor.js";
import {
  BROWSER_NATIVE_REFERENCE_GEOMETRY_VERSION
} from "../src/capture/browser-native-reference-geometry.js";
import {
  prepareBrowserNativeReferenceEventPlan
} from "../src/capture/browser-native-reference-plan.js";
import {
  prepareBrowserNativeReferenceSite
} from "../src/capture/browser-native-reference-site.js";
import type { NativeEnvironmentRawInput } from "../src/capture/native-environment-raw.js";
import { simulateEnvironmentSensorRawFrame } from "../src/capture/environment-raw-producer.js";
import {
  evaluator,
  frameInput
} from "./helpers/environment-raw-fixture.js";
import { evidence } from "./helpers/eqe-response-fixture.js";

function denseFixture(rolling: boolean) {
  const fixture = frameInput(rolling);
  const pupil = {
    kind: "ideal-uniform-circular-pupil" as const,
    radialSampleCount: 2,
    angularSampleCount: 16,
    evidence: evidence("test:249-pupil"),
    limitation: "Owned #249 exact-parity pupil."
  };
  for (const site of fixture.sites) {
    site.environment.pupil = structuredClone(pupil);
  }
  fixture.evaluateApertureRadiance = (request, ray) =>
    evaluator(request, (ray.originM.x > 0 ? 2 : 1) * 1e-9);
  return fixture;
}

function eventInput(
  fixture: ReturnType<typeof denseFixture>,
  maximumProviderEvaluations = 100_000,
  tileWidth?: number
): NativeEnvironmentRawInput {
  const capture = fixture.frame.capture;
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

  const {
    capture: ignoredCapture,
    containerBitDepth,
    ...frame
  } = fixture.frame;
  void ignoredCapture;
  void containerBitDepth;

  return {
    raw: {
      ...frame,
      exposure,
      exposureWindow: fixture.exposureWindow,
      maximumOutputBytes: 28,
      ...(tileWidth === undefined ? {} : { tileWidth })
    },
    sceneBinding: fixture.sceneBinding,
    maximumProviderEvaluations
  };
}

function prepared(
  fixture: ReturnType<typeof denseFixture>,
  maximumProviderEvaluations = 100_000,
  tileWidth?: number
) {
  const event = eventInput(
    fixture,
    maximumProviderEvaluations,
    tileWidth
  );
  const eventPlan = prepareBrowserNativeReferenceEventPlan({
    event,
    geometry: {
      schemaVersion: BROWSER_NATIVE_REFERENCE_GEOMETRY_VERSION,
      sourceStateId: event.raw.exposure.sceneStateId,
      providerSceneId: event.sceneBinding.providerSceneId,
      sourceRevision: "test-249-large-plane-v1",
      primitives: [
        {
          kind: "axis-aligned-rectangle",
          primitiveId: "background",
          minimumM: { x: -1000, y: -1000, z: 10 },
          maximumM: { x: 1000, y: 1000, z: 10 }
        }
      ]
    }
  });
  const sites = fixture.sites.map((site, index) =>
    prepareBrowserNativeReferenceSite(eventPlan, site, index)
  );
  return { eventPlan, sites };
}

function provider(
  fixture: ReturnType<typeof denseFixture>,
  observed: number[] = []
) {
  return {
    evaluateVisibleRadiance(input: Parameters<
      NonNullable<
        Parameters<typeof createBrowserNativeReferenceTask>[1][
          "evaluateVisibleRadiance"
        ]
      >
    >[0]) {
      expect(input.visibility.kind).toBe("hit");
      return fixture.evaluateApertureRadiance!(
        input.request,
        input.apertureRay
      );
    },
    observePhotoBatch(
      batch: Parameters<
        NonNullable<
          Parameters<typeof createBrowserNativeReferenceTask>[1][
            "observePhotoBatch"
          ]
        >
      >[0]
    ) {
      expect(Object.isFrozen(batch)).toBe(true);
      for (const site of batch.sites) observed.push(site.nativeIndex);
    },
    async yieldControl(): Promise<void> {}
  };
}

describe("bounded prepared browser-native Path-A executor", () => {
  it("matches global and native-scan reference photons/RAW while reusing exact visibility across wavelengths", async () => {
    for (const rolling of [false, true]) {
      const fixture = denseFixture(rolling);
      const reference = simulateEnvironmentSensorRawFrame(fixture);
      const { eventPlan, sites } = prepared(fixture);
      const observed: number[] = [];
      const task = createBrowserNativeReferenceTask(
        { eventPlan, sites, batchSize: 2 },
        provider(fixture, observed)
      );

      await task.run();
      const output = task.takeOutput();

      expect(Array.from(output.codes)).toEqual(
        reference.value.raw.value.frame.samples.map((sample) => sample.rawCode)
      );
      expect(observed).toEqual([0, 1, 2, 3]);
      expect(task.work.logical.committedSourceSampleCount).toBe(
        reference.value.providerEvaluationCount
      );
      expect(task.work.actual.spectralOpticalCompositionAttempts).toBe(
        reference.value.providerEvaluationCount
      );
      expect(task.work.actual.sourceRadianceAttempts).toBe(
        reference.value.providerEvaluationCount
      );
      expect(task.work.actual.geometryAttempts).toBe(
        task.work.planned.uniqueGeometryRequests
      );
      expect(
        task.work.actual.geometryAttempts +
          task.work.actual.geometryReuseHits
      ).toBe(reference.value.providerEvaluationCount);
      expect(task.work.actual.geometryReuseHits).toBeGreaterThan(0);
      expect(task.work.actual.sensorSiteAttempts).toBe(4);
      expect(task.work.actual.completedBatchCount).toBe(2);
    }
  });

  it("keeps exact output invariant across legal prepared batch sizes", async () => {
    const fixtureA = denseFixture(false);
    const fixtureB = denseFixture(false);
    const a = prepared(fixtureA);
    const b = prepared(fixtureB);

    const one = createBrowserNativeReferenceTask(
      { ...a, batchSize: 1 },
      provider(fixtureA)
    );
    const four = createBrowserNativeReferenceTask(
      { ...b, batchSize: 4 },
      provider(fixtureB)
    );

    await one.run();
    await four.run();

    const outputOne = one.takeOutput();
    const outputFour = four.takeOutput();
    expect(Array.from(outputFour.codes)).toEqual(Array.from(outputOne.codes));
    expect(Array.from(outputFour.blackLevels)).toEqual(
      Array.from(outputOne.blackLevels)
    );
    expect(Array.from(outputFour.digitalSaturationCodes)).toEqual(
      Array.from(outputOne.digitalSaturationCodes)
    );
    expect(Array.from(outputFour.saturationFlags)).toEqual(
      Array.from(outputOne.saturationFlags)
    );
    expect(one.work.logical).toEqual(four.work.logical);
    expect(one.work.planned.uniqueGeometryRequests).toBe(
      four.work.planned.uniqueGeometryRequests
    );
    expect(one.work.actual.geometryAttempts).toBe(
      four.work.actual.geometryAttempts
    );
    expect(one.work.actual.spectralOpticalCompositionAttempts).toBe(
      four.work.actual.spectralOpticalCompositionAttempts
    );
    expect(one.work.actual.completedBatchCount).toBe(4);
    expect(four.work.actual.completedBatchCount).toBe(1);
  });

  it("rejects the whole event before scientific source callbacks when logical dynamic work exceeds the unchanged budget", () => {
    const fixture = denseFixture(false);
    const { eventPlan, sites } = prepared(fixture, 4);
    let calls = 0;
    expect(() =>
      createBrowserNativeReferenceTask(
        { eventPlan, sites, batchSize: 1 },
        {
          ...provider(fixture),
          evaluateVisibleRadiance(input) {
            calls += 1;
            return fixture.evaluateApertureRadiance!(
              input.request,
              input.apertureRay
            );
          }
        }
      )
    ).toThrow("whole-event dynamic scientific-work budget");
    expect(calls).toBe(0);
  });

  it("counts attempted source/geometry work and withholds output on source failure", async () => {
    const fixture = denseFixture(false);
    const preparedInput = prepared(fixture);
    const task = createBrowserNativeReferenceTask(
      { ...preparedInput, batchSize: 1 },
      {
        ...provider(fixture),
        evaluateVisibleRadiance() {
          throw new Error("source failed");
        }
      }
    );

    await expect(task.run()).rejects.toThrow("source failed");
    expect(task.state).toBe("failed");
    expect(task.work.actual.geometryAttempts).toBe(1);
    expect(task.work.actual.sourceRadianceAttempts).toBe(1);
    expect(task.work.actual.spectralOpticalCompositionAttempts).toBe(1);
    expect(task.work.actual.sensorSiteAttempts).toBe(0);
    expect(() => task.takeOutput()).toThrow("unavailable");
  });

  it("stops new work on cancellation and keeps attempted counters visible", async () => {
    const fixture = denseFixture(false);
    const preparedInput = prepared(fixture);
    let task: BrowserNativeReferenceTask;
    task = createBrowserNativeReferenceTask(
      { ...preparedInput, batchSize: 1 },
      {
        ...provider(fixture),
        evaluateVisibleRadiance(input) {
          task.cancel();
          return fixture.evaluateApertureRadiance!(
            input.request,
            input.apertureRay
          );
        }
      }
    );

    await expect(task.run()).rejects.toThrow("aborted");
    expect(task.state).toBe("cancelled");
    expect(task.work.actual.geometryAttempts).toBe(1);
    expect(task.work.actual.sourceRadianceAttempts).toBe(1);
    expect(task.work.actual.sensorSiteAttempts).toBe(0);
    expect(() => task.takeOutput()).toThrow("unavailable");
  });

  it("rejects mismatched prepared event/site identity before execution", () => {
    const fixtureA = denseFixture(false);
    const fixtureB = denseFixture(false);
    const a = prepared(fixtureA);
    const b = prepared(fixtureB);
    const mismatched = [...a.sites];
    mismatched[0] = b.sites[0]!;

    expect(() =>
      createBrowserNativeReferenceTask(
        {
          eventPlan: a.eventPlan,
          sites: mismatched,
          batchSize: 1
        },
        provider(fixtureA)
      )
    ).toThrow("event/native index");
  });
});
