import { describe, expect, it } from "vitest";

import {
  SCENE_ILLUMINATION_PROFILE_SCHEMA_VERSION,
  parseSceneIlluminationProfile
} from "../src/index.js";

const ownedEvidence = (ref: string) => [
  {
    sourceOrigin: "photivra" as const,
    sourceReference: ref,
    reuseStatus: "photivra-owned" as const
  }
];

const relativeMagnitude = () => ({
  kind: "relative-linear-scale" as const,
  scale: 1,
  scientificStatus: "approximation" as const,
  limitation: "Relative educational/reference source only."
});

const sourceBase = {
  enabled: true,
  temporalBehavior: {
    kind: "time-invariant" as const
  },
  evidence: ownedEvidence("test:source")
};

describe("scene illumination profile", () => {
  it("represents mixed renderer-independent source families without calculating radiance", () => {
    const profile = parseSceneIlluminationProfile({
      schemaVersion: "0.1.0",
      profileId: "mixed-lighting",
      sceneId: "room",
      evidence: ownedEvidence("test:profile"),
      sources: [
        {
          ...sourceBase,
          sourceId: "lamp-point",
          family: "point",
          geometry: {
            kind: "point-position",
            positionM: { x: 1, y: 2, z: 3 }
          },
          magnitude: {
            kind: "radiant-intensity",
            wattsPerSteradian: 2,
            scientificStatus: "calibrated",
            uncertainty: {
              kind: "relative",
              fraction: 0.02,
              basis: "test calibration"
            },
            evidence: ownedEvidence("test:intensity")
          },
          spectrum: {
            kind: "continuous-relative-spectrum",
            spectrumId: "lamp-spd",
            wavelengthUnit: "nm",
            wavelengthBasis: "vacuum",
            interpolation: "piecewise-linear",
            outsideRangeBehavior: "fail-closed",
            normalization: "arbitrary-relative-scale",
            scientificStatus: "calibrated-relative-shape",
            uncertainty: {
              kind: "relative",
              fraction: 0.03,
              basis: "test spectral calibration"
            },
            evidence: ownedEvidence("test:spectrum"),
            samples: [
              {
                wavelengthNanometers: 450,
                relativeDensityPerNanometer: 0.2
              },
              {
                wavelengthNanometers: 550,
                relativeDensityPerNanometer: 1
              },
              {
                wavelengthNanometers: 650,
                relativeDensityPerNanometer: 0.3
              }
            ]
          }
        },
        {
          ...sourceBase,
          sourceId: "visible-panel",
          family: "area",
          geometry: {
            kind: "scene-object-binding",
            sceneObjectId: "panel"
          },
          magnitude: {
            kind: "surface-radiance",
            wattsPerSquareMeterSteradian: 4,
            scientificStatus: "approximation",
            uncertainty: {
              kind: "not-quantified",
              limitation: "Reference-only area-source value."
            },
            evidence: ownedEvidence("test:radiance")
          },
          spectrum: {
            kind: "rgb-preview-approximation",
            colorSpace: "linear-srgb",
            red: 1,
            green: 0.2,
            blue: 0.1,
            limitation: "RGB preview is not a measured spectrum."
          }
        },
        {
          ...sourceBase,
          sourceId: "sun-like",
          family: "directional",
          geometry: {
            kind: "directional",
            directionUnitVector: {
              x: 0,
              y: -1,
              z: 0
            }
          },
          magnitude: {
            kind: "reference-plane-irradiance",
            wattsPerSquareMeter: 100,
            referencePlaneId: "scene-ground",
            scientificStatus: "approximation",
            uncertainty: {
              kind: "not-quantified",
              limitation: "Synthetic reference input."
            },
            evidence: ownedEvidence("test:irradiance")
          },
          spectrum: {
            kind: "blackbody-temperature-approximation",
            temperatureKelvin: 5500,
            limitation: "Blackbody is a declared approximation, not universal CCT."
          }
        },
        {
          ...sourceBase,
          sourceId: "environment",
          family: "environment",
          geometry: {
            kind: "environment"
          },
          magnitude: relativeMagnitude(),
          spectrum: {
            kind: "unresolved",
            limitation: "RGB HDR environment has no calibrated SPD."
          }
        },
        {
          ...sourceBase,
          sourceId: "spot",
          family: "spot",
          geometry: {
            kind: "spot",
            origin: {
              kind: "scene-object-binding",
              sceneObjectId: "spot-fixture"
            },
            directionUnitVector: {
              x: 0,
              y: 0,
              z: -1
            },
            outerConeAngleDegrees: 30
          },
          magnitude: relativeMagnitude(),
          spectrum: {
            kind: "unresolved",
            limitation: "Spectrum not characterized."
          }
        }
      ]
    });

    expect(profile.schemaVersion).toBe(
      SCENE_ILLUMINATION_PROFILE_SCHEMA_VERSION
    );
    expect(profile.sources).toHaveLength(5);
    expect(profile.sources.map((source) => source.family)).toEqual([
      "point",
      "area",
      "directional",
      "environment",
      "spot"
    ]);
    expect(profile.sceneRadianceCalculated).toBe(false);
    expect(profile.materialResponseApplied).toBe(false);
    expect(profile.visibilityEvaluated).toBe(false);
    expect(profile.indirectTransportEvaluated).toBe(false);
    expect(profile.fluorescenceModeled).toBe(false);
    expect(profile.volumetricTransportModeled).toBe(false);
    expect(profile.polarizationModeled).toBe(false);
  });

  it("rejects physical quantities that are incompatible with a source family", () => {
    expect(() =>
      parseSceneIlluminationProfile({
        schemaVersion: "0.1.0",
        profileId: "bad-units",
        sceneId: "room",
        evidence: ownedEvidence("test:profile"),
        sources: [
          {
            ...sourceBase,
            sourceId: "bad-point",
            family: "point",
            geometry: {
              kind: "point-position",
              positionM: { x: 0, y: 0, z: 1 }
            },
            magnitude: {
              kind: "reference-plane-irradiance",
              wattsPerSquareMeter: 100,
              referencePlaneId: "ground",
              scientificStatus: "approximation",
              uncertainty: {
                kind: "not-quantified",
                limitation: "test"
              },
              evidence: ownedEvidence("test:bad")
            },
            spectrum: {
              kind: "unresolved",
              limitation: "test"
            }
          }
        ]
      })
    ).toThrow(
      "kind is not supported for source family point"
    );
  });

  it("does not accept a generic CCT source-color representation", () => {
    expect(() =>
      parseSceneIlluminationProfile({
        schemaVersion: "0.1.0",
        profileId: "bad-cct",
        sceneId: "room",
        evidence: ownedEvidence("test:profile"),
        sources: [
          {
            ...sourceBase,
            sourceId: "red-led",
            family: "point",
            geometry: {
              kind: "point-position",
              positionM: { x: 0, y: 0, z: 1 }
            },
            magnitude: relativeMagnitude(),
            spectrum: {
              kind: "cct-kelvin",
              kelvin: 2000
            }
          }
        ]
      })
    ).toThrow("spectrum.kind is invalid.");
  });

  it("requires reusable rights for embedded continuous spectral data", () => {
    expect(() =>
      parseSceneIlluminationProfile({
        schemaVersion: "0.1.0",
        profileId: "bad-rights",
        sceneId: "room",
        evidence: ownedEvidence("test:profile"),
        sources: [
          {
            ...sourceBase,
            sourceId: "source",
            family: "environment",
            geometry: { kind: "environment" },
            magnitude: relativeMagnitude(),
            spectrum: {
              kind: "continuous-relative-spectrum",
              spectrumId: "copied-curve",
              wavelengthUnit: "nm",
              wavelengthBasis: "vacuum",
              interpolation: "piecewise-linear",
              outsideRangeBehavior: "fail-closed",
              normalization: "arbitrary-relative-scale",
              scientificStatus: "approximation",
              uncertainty: {
                kind: "not-quantified",
                limitation: "test"
              },
              evidence: [
                {
                  sourceOrigin: "manufacturer",
                  sourceReference: "public-page",
                  reuseStatus: "factual-reference-only"
                }
              ],
              samples: [
                {
                  wavelengthNanometers: 500,
                  relativeDensityPerNanometer: 1
                },
                {
                  wavelengthNanometers: 600,
                  relativeDensityPerNanometer: 0.5
                }
              ]
            }
          }
        ]
      })
    ).toThrow(
      "must contain reusable-data or photivra-owned evidence"
    );
  });

  it("requires a resolved wavelength basis and quantified uncertainty for calibrated relative spectral shape", () => {
    expect(() =>
      parseSceneIlluminationProfile({
        schemaVersion: "0.1.0",
        profileId: "bad-calibration",
        sceneId: "room",
        evidence: ownedEvidence("test:profile"),
        sources: [
          {
            ...sourceBase,
            sourceId: "source",
            family: "environment",
            geometry: { kind: "environment" },
            magnitude: relativeMagnitude(),
            spectrum: {
              kind: "continuous-relative-spectrum",
              spectrumId: "curve",
              wavelengthUnit: "nm",
              wavelengthBasis: "unspecified",
              interpolation: "piecewise-linear",
              outsideRangeBehavior: "fail-closed",
              normalization: "arbitrary-relative-scale",
              scientificStatus: "calibrated-relative-shape",
              uncertainty: {
                kind: "relative",
                fraction: 0.01,
                basis: "test"
              },
              evidence: ownedEvidence("test:curve"),
              samples: [
                {
                  wavelengthNanometers: 500,
                  relativeDensityPerNanometer: 1
                },
                {
                  wavelengthNanometers: 600,
                  relativeDensityPerNanometer: 0.5
                }
              ]
            }
          }
        ]
      })
    ).toThrow(
      'calibrated-relative-shape spectra must declare wavelengthBasis "air" or "vacuum"'
    );
  });

  it("rejects duplicate source IDs and unsupported temporal behavior", () => {
    const duplicate = {
      ...sourceBase,
      sourceId: "same",
      family: "environment" as const,
      geometry: { kind: "environment" as const },
      magnitude: relativeMagnitude(),
      spectrum: {
        kind: "unresolved" as const,
        limitation: "test"
      }
    };

    expect(() =>
      parseSceneIlluminationProfile({
        schemaVersion: "0.1.0",
        profileId: "duplicates",
        sceneId: "room",
        evidence: ownedEvidence("test:profile"),
        sources: [duplicate, duplicate]
      })
    ).toThrow(
      "sources[].sourceId must not contain duplicates"
    );

    expect(() =>
      parseSceneIlluminationProfile({
        schemaVersion: "0.1.0",
        profileId: "flicker",
        sceneId: "room",
        evidence: ownedEvidence("test:profile"),
        sources: [
          {
            ...duplicate,
            sourceId: "flicker",
            temporalBehavior: {
              kind: "sinusoidal"
            }
          }
        ]
      })
    ).toThrow(
      'temporalBehavior.kind must be "time-invariant"'
    );
  });
});
