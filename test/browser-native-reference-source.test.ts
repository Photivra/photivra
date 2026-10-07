// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { evidence } from "./helpers/eqe-response-fixture.js";
import {
  BROWSER_NATIVE_REFERENCE_GEOMETRY_VERSION,
  prepareBrowserNativeReferenceGeometry
} from "../src/capture/browser-native-reference-geometry.js";
import {
  BROWSER_NATIVE_REFERENCE_SOURCE_VERSION,
  evaluateBrowserNativeReferenceSource,
  prepareBrowserNativeReferenceSource
} from "../src/capture/browser-native-reference-source.js";

function geometry() {
  return prepareBrowserNativeReferenceGeometry({
    schemaVersion: BROWSER_NATIVE_REFERENCE_GEOMETRY_VERSION,
    sourceStateId: "source-state",
    providerSceneId: "room",
    sourceRevision: "source-v1",
    primitives: [
      {
        kind: "axis-aligned-rectangle",
        primitiveId: "target",
        minimumM: { x: -1, y: -1, z: 5 },
        maximumM: { x: 1, y: 1, z: 5 }
      }
    ]
  });
}

function preparedSource() {
  const preparedGeometry = geometry();
  return {
    preparedGeometry,
    source: prepareBrowserNativeReferenceSource(preparedGeometry, {
      version: BROWSER_NATIVE_REFERENCE_SOURCE_VERSION,
      sourceStateId: "source-state",
      providerSceneId: "room",
      sourceRevision: "source-v1",
      wavelengthBasis: "vacuum",
      primitives: [
        {
          primitiveId: "target",
          evidence: evidence("test:owned-source"),
          limitation: "Owned exact-node synthetic spectrum.",
          spectrum: [
            {
              wavelengthNanometers: 425,
              spectralRadianceWattsPerSquareMeterSteradianNanometer: 1e-9
            },
            {
              wavelengthNanometers: 475,
              spectralRadianceWattsPerSquareMeterSteradianNanometer: 2e-9
            }
          ]
        }
      ]
    })
  };
}

function request(wavelengthNanometers = 425) {
  return {
    schemaVersion: "0.1.0" as const,
    sampleId: "sample",
    providerProfileId: "provider",
    sceneId: "room",
    illuminationProfileId: "illumination",
    materialResponseProfileId: "material",
    target: {
      kind: "environment-direction" as const,
      outgoingDirectionUnitVector: { x: 0, y: 0, z: -1 }
    },
    timeSecondsFromExposureStart: 0.005,
    wavelengthNanometers,
    wavelengthBasis: "vacuum" as const
  };
}

describe("browser-native engine-owned primitive radiance", () => {
  it("resolves exact wavelength-node radiance for the visible primitive", () => {
    const { source } = preparedSource();
    const result = evaluateBrowserNativeReferenceSource(
      source,
      request(475),
      {
        kind: "hit",
        primitiveId: "target",
        rayParameter: 5,
        distanceM: 5,
        pointM: { x: 0, y: 0, z: 5 }
      }
    );

    expect(
      result.spectralRadianceWattsPerSquareMeterSteradianNanometer
    ).toBe(2e-9);
    expect(result.sampleId).toBe("sample");
    expect(result.wavelengthNanometers).toBe(475);
  });

  it("fails closed on geometry miss because no background radiance contract exists", () => {
    const { source } = preparedSource();
    expect(() =>
      evaluateBrowserNativeReferenceSource(
        source,
        request(),
        { kind: "miss" }
      )
    ).toThrow("no background-radiance contract");
  });

  it("fails closed when a committed wavelength lacks an exact source sample", () => {
    const { source } = preparedSource();
    expect(() =>
      evaluateBrowserNativeReferenceSource(
        source,
        request(450),
        {
          kind: "hit",
          primitiveId: "target",
          rayParameter: 5,
          distanceM: 5,
          pointM: { x: 0, y: 0, z: 5 }
        }
      )
    ).toThrow("exact radiance sample");
  });

  it("binds radiance to the exact prepared geometry identity and primitive set", () => {
    const preparedGeometry = geometry();
    expect(() =>
      prepareBrowserNativeReferenceSource(preparedGeometry, {
        version: BROWSER_NATIVE_REFERENCE_SOURCE_VERSION,
        sourceStateId: "source-state",
        providerSceneId: "room",
        sourceRevision: "source-v1",
        wavelengthBasis: "vacuum",
        primitives: []
      })
    ).toThrow("one radiance declaration per geometry primitive");

    expect(() =>
      prepareBrowserNativeReferenceSource(preparedGeometry, {
        version: BROWSER_NATIVE_REFERENCE_SOURCE_VERSION,
        sourceStateId: "source-state",
        providerSceneId: "room",
        sourceRevision: "different-revision",
        wavelengthBasis: "vacuum",
        primitives: [
          {
            primitiveId: "target",
            evidence: evidence("test:mismatch"),
            limitation: "Mismatch fixture.",
            spectrum: [
              {
                wavelengthNanometers: 425,
                spectralRadianceWattsPerSquareMeterSteradianNanometer: 1e-9
              }
            ]
          }
        ]
      })
    ).toThrow("same exact source revision");
  });

  it("owns and freezes spectrum data independently of caller mutation", () => {
    const preparedGeometry = geometry();
    const input = {
      version: BROWSER_NATIVE_REFERENCE_SOURCE_VERSION,
      sourceStateId: "source-state",
      providerSceneId: "room",
      sourceRevision: "source-v1",
      wavelengthBasis: "vacuum" as const,
      primitives: [
        {
          primitiveId: "target",
          evidence: evidence("test:mutation"),
          limitation: "Mutation ownership fixture.",
          spectrum: [
            {
              wavelengthNanometers: 425,
              spectralRadianceWattsPerSquareMeterSteradianNanometer: 1e-9
            }
          ]
        }
      ]
    };
    const source = prepareBrowserNativeReferenceSource(
      preparedGeometry,
      input
    );
    input.primitives[0]!.spectrum[0]!
      .spectralRadianceWattsPerSquareMeterSteradianNanometer = 9;

    expect(
      source.primitives[0]!.spectrum[0]!
        .spectralRadianceWattsPerSquareMeterSteradianNanometer
    ).toBe(1e-9);
    expect(Object.isFrozen(source)).toBe(true);
    expect(Object.isFrozen(source.primitives[0]!.spectrum)).toBe(true);
  });
});
