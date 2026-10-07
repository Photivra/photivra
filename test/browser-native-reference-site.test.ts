// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { frameInput } from "./helpers/environment-raw-fixture.js";
import {
  BROWSER_NATIVE_REFERENCE_GEOMETRY_VERSION
} from "../src/capture/browser-native-reference-geometry.js";
import {
  prepareBrowserNativeReferenceEventPlan
} from "../src/capture/browser-native-reference-plan.js";
import {
  BROWSER_NATIVE_REFERENCE_SITE_PLAN_VERSION,
  prepareBrowserNativeReferenceSite
} from "../src/capture/browser-native-reference-site.js";
import type { NativeEnvironmentRawInput } from "../src/capture/native-environment-raw.js";

function eventInput(
  fixture: ReturnType<typeof frameInput>
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
      tileWidth: 1
    },
    sceneBinding: fixture.sceneBinding,
    maximumProviderEvaluations: 100_000
  };
}

function prepareEvent(
  fixture: ReturnType<typeof frameInput>,
  sourceRevision = "site-prep-v1"
): ReturnType<typeof prepareBrowserNativeReferenceEventPlan> {
  const event = eventInput(fixture);
  return prepareBrowserNativeReferenceEventPlan({
    event,
    geometry: {
      schemaVersion: BROWSER_NATIVE_REFERENCE_GEOMETRY_VERSION,
      sourceStateId: event.raw.exposure.sceneStateId,
      providerSceneId: event.sceneBinding.providerSceneId,
      sourceRevision,
      primitives: [
        {
          kind: "axis-aligned-rectangle",
          primitiveId: "target",
          minimumM: { x: -1, y: -1, z: 5 },
          maximumM: { x: 1, y: 1, z: 5 }
        }
      ]
    }
  });
}

describe("browser-native prepared site ownership", () => {
  it("owns parsed site-local dependencies without retaining the per-sample execution graph", () => {
    const fixture = frameInput(false);
    const event = prepareEvent(fixture);
    const prepared = prepareBrowserNativeReferenceSite(
      event,
      fixture.sites[0]!,
      0
    );

    expect(prepared.version).toBe(BROWSER_NATIVE_REFERENCE_SITE_PLAN_VERSION);
    expect(prepared.nativeIndex).toBe(0);
    expect(prepared.eventIdentityJson).toBe(event.identityJson);
    expect(prepared.expectedProviderEvaluationCount).toBeGreaterThan(0);
    expect(prepared.unresolvedExecutionDependencies).toEqual([
      "photo-signal",
      "dark-charge",
      "accumulated-charge",
      "stochastic-realization",
      "raw-code"
    ]);
    expect("instants" in prepared.environment).toBe(false);
    expect(Object.isFrozen(prepared)).toBe(true);
    expect(Object.isFrozen(prepared.environment)).toBe(true);
    expect(Object.isFrozen(prepared.readout.readoutProfile)).toBe(true);
  });

  it("is immune to caller mutation after preparation", () => {
    const fixture = frameInput(false);
    const event = prepareEvent(fixture);
    const site = fixture.sites[0]!;
    const expectedDarkId = site.darkCurrentProfile.profileId;
    const expectedFocalLength = site.environment.optics.focalLengthMm;
    const prepared = prepareBrowserNativeReferenceSite(event, site, 0);

    site.darkCurrentProfile.profileId = "mutated-dark";
    site.environment.optics.focalLengthMm = 999;

    expect(prepared.darkCurrentProfile.profileId).toBe(expectedDarkId);
    expect(prepared.environment.optics.focalLengthMm).toBe(expectedFocalLength);
  });

  it("changes identity when site-local or event-level dependencies change", () => {
    const firstFixture = frameInput(false);
    const first = prepareBrowserNativeReferenceSite(
      prepareEvent(firstFixture, "source-v1"),
      firstFixture.sites[0]!,
      0
    );

    const changedSiteFixture = frameInput(false);
    changedSiteFixture.sites[0]!.darkCurrentProfile.profileId =
      "different-dark-profile";
    const changedSite = prepareBrowserNativeReferenceSite(
      prepareEvent(changedSiteFixture, "source-v1"),
      changedSiteFixture.sites[0]!,
      0
    );

    const changedEventFixture = frameInput(false);
    const changedEvent = prepareBrowserNativeReferenceSite(
      prepareEvent(changedEventFixture, "source-v2"),
      changedEventFixture.sites[0]!,
      0
    );

    expect(changedSite.identityJson).not.toBe(first.identityJson);
    expect(changedEvent.identityJson).not.toBe(first.identityJson);
  });

  it("rejects native-site, dark-current and readout identity drift before signal execution", () => {
    const fixture = frameInput(false);
    const event = prepareEvent(fixture);

    expect(() =>
      prepareBrowserNativeReferenceSite(event, fixture.sites[0]!, 4)
    ).toThrow("in-range absolute native index");

    const wrongDarkSite = structuredClone(fixture.sites[0]!);
    if (wrongDarkSite.darkCurrentProfile.siteApplicability.kind !== "exact-site") {
      throw new Error("fixture must use exact-site dark current");
    }
    wrongDarkSite.darkCurrentProfile.siteApplicability = {
      kind: "exact-site",
      site: {
        ...wrongDarkSite.darkCurrentProfile.siteApplicability.site,
        x: 1
      }
    };
    expect(() =>
      prepareBrowserNativeReferenceSite(event, wrongDarkSite, 0)
    ).toThrow("exact-site applicability");

    const wrongReadout = structuredClone(fixture.sites[0]!);
    wrongReadout.readout.readoutProfile.channelId = "wrong-channel";
    expect(() =>
      prepareBrowserNativeReferenceSite(event, wrongReadout, 0)
    ).toThrow("identities must agree");
  });

  it("rejects unknown provider fields and static capacity drift during preparation", () => {
    const fixture = frameInput(false);
    const event = prepareEvent(fixture);

    const unknownSite = structuredClone(fixture.sites[0]!);
    Object.assign(unknownSite, { unexpected: true });
    expect(() =>
      prepareBrowserNativeReferenceSite(event, unknownSite, 0)
    ).toThrow("prepared site fields");

    const unknownReadout = structuredClone(fixture.sites[0]!);
    Object.assign(unknownReadout.readout, { unexpected: true });
    expect(() =>
      prepareBrowserNativeReferenceSite(event, unknownReadout, 0)
    ).toThrow("prepared readout fields");

    const wrongCapacityChannel = structuredClone(fixture.sites[0]!);
    wrongCapacityChannel.readout.capacityProfile.channelId = "wrong-channel";
    expect(() =>
      prepareBrowserNativeReferenceSite(event, wrongCapacityChannel, 0)
    ).toThrow("capacity, sampling, and CFA identities");

    const wrongOperatingState = structuredClone(fixture.sites[0]!);
    wrongOperatingState.readout.operatingStateId = "wrong-state";
    expect(() =>
      prepareBrowserNativeReferenceSite(event, wrongOperatingState, 0)
    ).toThrow("operating state");
  });

  it("rejects fixed-temperature misuse during preparation", () => {
    const fixture = frameInput(false);
    const event = prepareEvent(fixture);
    const wrongTemperature = structuredClone(fixture.sites[0]!);
    wrongTemperature.operatingTemperatureC = 21;

    expect(() =>
      prepareBrowserNativeReferenceSite(event, wrongTemperature, 0)
    ).toThrow("fixed reference temperature");
  });
});
