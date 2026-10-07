// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { frameInput } from "./helpers/environment-raw-fixture.js";
import {
  BROWSER_NATIVE_REFERENCE_GEOMETRY_VERSION,
  type PrepareBrowserNativeReferenceGeometryInput
} from "../src/capture/browser-native-reference-geometry.js";
import {
  BROWSER_NATIVE_REFERENCE_EVENT_PLAN_VERSION,
  BROWSER_NATIVE_REFERENCE_INTEGRATOR_VERSION,
  prepareBrowserNativeReferenceEventPlan
} from "../src/capture/browser-native-reference-plan.js";
import type { NativeEnvironmentRawInput } from "../src/capture/native-environment-raw.js";

function eventInput(): NativeEnvironmentRawInput {
  const value = frameInput(false);
  const capture = value.frame.capture;
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
  } = value.frame;
  void ignoredCapture;
  void containerBitDepth;

  return {
    raw: {
      ...frame,
      exposure,
      exposureWindow: value.exposureWindow,
      maximumOutputBytes: 28,
      tileWidth: 1
    },
    sceneBinding: value.sceneBinding,
    maximumProviderEvaluations: 100_000
  };
}

function geometry(
  event: NativeEnvironmentRawInput,
  reverse = false
): PrepareBrowserNativeReferenceGeometryInput {
  const primitives = [
    {
      kind: "axis-aligned-rectangle" as const,
      primitiveId: "back",
      minimumM: { x: -2, y: -2, z: 8 },
      maximumM: { x: 2, y: 2, z: 8 }
    },
    {
      kind: "axis-aligned-box" as const,
      primitiveId: "front",
      minimumM: { x: -1, y: -1, z: 3 },
      maximumM: { x: 1, y: 1, z: 5 }
    }
  ];
  return {
    schemaVersion: BROWSER_NATIVE_REFERENCE_GEOMETRY_VERSION,
    sourceStateId: event.raw.exposure.sceneStateId,
    providerSceneId: event.sceneBinding.providerSceneId,
    sourceRevision: "owned-geometry-v1",
    primitives: reverse ? [...primitives].reverse() : primitives
  };
}

describe("repository-internal browser native prepared event plan", () => {
  it("freezes the known Path-A event dependencies with explicit unresolved site-local dependencies", () => {
    const event = eventInput();
    const prepared = prepareBrowserNativeReferenceEventPlan({
      event,
      geometry: geometry(event)
    });

    expect(prepared.version).toBe(
      BROWSER_NATIVE_REFERENCE_EVENT_PLAN_VERSION
    );
    expect(prepared.integrator).toEqual({
      lane: "path-a",
      version: BROWSER_NATIVE_REFERENCE_INTEGRATOR_VERSION,
      arithmetic: "binary64",
      samplingMeaning: "existing-committed-discrete-support"
    });
    expect(prepared.rawPlan.pixelCount).toBe(4);
    expect(prepared.maximumProviderEvaluations).toBe(100_000);
    expect(prepared.reuseScope).toBe("event-envelope-and-geometry-only");
    expect(prepared.unresolvedDynamicDependencies).toEqual([
      "site-environment-profile",
      "site-dark-current-profile",
      "site-charge-profile",
      "site-readout-profile"
    ]);
    expect(prepared.identityJson).toContain(
      '"samplingMeaning":"existing-committed-discrete-support"'
    );
    expect(Object.isFrozen(prepared)).toBe(true);
    expect(Object.isFrozen(prepared.rawPlan)).toBe(true);
    expect(Object.isFrozen(prepared.geometry.primitives)).toBe(true);
  });

  it("canonicalizes primitive array order without making array order a visibility semantic", () => {
    const firstEvent = eventInput();
    const secondEvent = eventInput();
    const first = prepareBrowserNativeReferenceEventPlan({
      event: firstEvent,
      geometry: geometry(firstEvent, false)
    });
    const second = prepareBrowserNativeReferenceEventPlan({
      event: secondEvent,
      geometry: geometry(secondEvent, true)
    });

    expect(second.identityJson).toBe(first.identityJson);
    expect(second.geometry.primitives.map((value) => value.primitiveId)).toEqual([
      "back",
      "front"
    ]);
  });

  it("gives equivalent rigid rotations the same prepared event identity", () => {
    const firstEvent = eventInput();
    const firstBase = geometry(firstEvent);
    const firstGeometry: PrepareBrowserNativeReferenceGeometryInput = {
      ...firstBase,
      primitives: firstBase.primitives.map((primitive, index) =>
        index === 0
          ? {
              ...primitive,
              worldFromLocal: {
                translationM: { x: -0, y: 2, z: 3 },
                rotationQuaternion: {
                  x: 0,
                  y: 2 * Math.SQRT1_2,
                  z: 0,
                  w: 2 * Math.SQRT1_2
                }
              }
            }
          : primitive
      )
    };
    const secondEvent = eventInput();
    const secondBase = geometry(secondEvent);
    const secondGeometry: PrepareBrowserNativeReferenceGeometryInput = {
      ...secondBase,
      primitives: secondBase.primitives.map((primitive, index) =>
        index === 0
          ? {
              ...primitive,
              worldFromLocal: {
                translationM: { x: 0, y: 2, z: 3 },
                rotationQuaternion: {
                  x: -0,
                  y: -4 * Math.SQRT1_2,
                  z: -0,
                  w: -4 * Math.SQRT1_2
                }
              }
            }
          : primitive
      )
    };

    const first = prepareBrowserNativeReferenceEventPlan({
      event: firstEvent,
      geometry: firstGeometry
    });
    const second = prepareBrowserNativeReferenceEventPlan({
      event: secondEvent,
      geometry: secondGeometry
    });

    expect(second.identityJson).toBe(first.identityJson);
  });

  it("changes prepared identity when an owned dependency changes", () => {
    const baselineEvent = eventInput();
    const baseline = prepareBrowserNativeReferenceEventPlan({
      event: baselineEvent,
      geometry: geometry(baselineEvent)
    });

    const revisedEvent = eventInput();
    const revisedGeometry = {
      ...geometry(revisedEvent),
      sourceRevision: "owned-geometry-v2"
    };
    const revised = prepareBrowserNativeReferenceEventPlan({
      event: revisedEvent,
      geometry: revisedGeometry
    });

    const budgetEvent = eventInput();
    budgetEvent.maximumProviderEvaluations = 99_999;
    const budget = prepareBrowserNativeReferenceEventPlan({
      event: budgetEvent,
      geometry: geometry(budgetEvent)
    });

    expect(revised.identityJson).not.toBe(baseline.identityJson);
    expect(budget.identityJson).not.toBe(baseline.identityJson);
  });

  it("owns prepared state so later caller mutation cannot alter it", () => {
    const event = eventInput();
    const source = geometry(event);
    const prepared = prepareBrowserNativeReferenceEventPlan({
      event,
      geometry: source
    });

    event.maximumProviderEvaluations = 90_000;
    source.primitives[0]!.minimumM.x = -99;

    expect(prepared.maximumProviderEvaluations).toBe(100_000);
    expect(
      prepared.geometry.primitives.find((value) => value.primitiveId === "back")!
        .minimumM.x
    ).toBe(-2);
  });

  it("rejects scene/source identity drift before scientific source execution", () => {
    const stateMismatchEvent = eventInput();
    const stateMismatch = {
      ...geometry(stateMismatchEvent),
      sourceStateId: "different-scene-state"
    };
    expect(() =>
      prepareBrowserNativeReferenceEventPlan({
        event: stateMismatchEvent,
        geometry: stateMismatch
      })
    ).toThrow("same source state");

    const providerMismatchEvent = eventInput();
    const providerMismatch = {
      ...geometry(providerMismatchEvent),
      providerSceneId: "different-provider-scene"
    };
    expect(() =>
      prepareBrowserNativeReferenceEventPlan({
        event: providerMismatchEvent,
        geometry: providerMismatch
      })
    ).toThrow("same source state");
  });

  it("preserves the existing whole-event provider ceiling and opening-reference scene rule", () => {
    const tooLarge = eventInput();
    tooLarge.maximumProviderEvaluations = 2_000_000_001;
    expect(() =>
      prepareBrowserNativeReferenceEventPlan({
        event: tooLarge,
        geometry: geometry(tooLarge)
      })
    ).toThrow("whole-event provider-evaluation budget");

    const wrongClock = eventInput();
    wrongClock.raw.exposure = {
      ...wrongClock.raw.exposure,
      sceneTimeSeconds: 1
    };
    expect(() =>
      prepareBrowserNativeReferenceEventPlan({
        event: wrongClock,
        geometry: geometry(wrongClock)
      })
    ).toThrow("same source state");
  });
});
