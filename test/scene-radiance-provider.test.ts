import { describe, expect, it } from "vitest";

import {
  assessSceneMaterialResponseFidelity,
  parseSceneIlluminationProfile,
  parseSceneMaterialResponseProfile,
  parseSceneRadianceEvaluationRequest,
  parseSceneRadianceEvaluationResult,
  parseSceneRadianceProviderProfile,
  validateSceneRadianceEvaluationBindings
} from "../src/index.js";

const ownedEvidence = (
  ref: string
): readonly [{
  sourceOrigin: "photivra";
  sourceReference: string;
  reuseStatus: "photivra-owned";
}] => [
  {
    sourceOrigin: "photivra",
    sourceReference: ref,
    reuseStatus: "photivra-owned"
  }
];

const artifact = {
  id: "material-spectrum",
  checksumSha256:
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
};

const rgbMaterial = (
  id = "rgb"
): Record<string, unknown> => ({
  materialResponseId: id,
  evidence: ownedEvidence("test:" + id),
  representation: {
    kind: "rgb-pbr-approximation",
    colorSpace: "linear-srgb",
    baseColor: {
      red: 0.4,
      green: 0.5,
      blue: 0.6
    },
    metallic: 0.1,
    roughness: 0.5,
    limitation: "Renderer-oriented RGB/PBR approximation."
  }
});

const spectralMaterial = (
  id = "spectral"
): Record<string, unknown> => ({
  materialResponseId: id,
  evidence: ownedEvidence("test:" + id),
  representation: {
    kind: "spectral-wavelength-preserving-data",
    dataArtifact: artifact,
    wavelengthBasis: "vacuum",
    wavelengthRangeNanometers: {
      minimum: 400,
      maximum: 700
    },
    scatteringModel:
      "provider-defined-wavelength-preserving",
    scientificStatus: "calibrated",
    uncertainty: {
      kind: "relative",
      fraction: 0.02,
      basis: "test calibration"
    },
    wavelengthChangingBehaviorModeled: false,
    emissionModeled: false
  }
});

const materialProfileInput = (
  materials: readonly unknown[]
): Record<string, unknown> => ({
  schemaVersion: "0.1.0",
  profileId: "materials",
  sceneId: "room",
  evidence: ownedEvidence("test:materials"),
  materials,
  fluorescenceModeled: false,
  volumetricMaterialTransportModeled: false,
  polarizationModeled: false
});

const illuminationProfile = () =>
  parseSceneIlluminationProfile({
    schemaVersion: "0.1.0",
    profileId: "lights",
    sceneId: "room",
    evidence: ownedEvidence("test:lights"),
    sources: [
      {
        sourceId: "environment",
        family: "environment",
        enabled: true,
        geometry: {
          kind: "environment"
        },
        magnitude: {
          kind: "relative-linear-scale",
          scale: 1,
          scientificStatus: "approximation",
          limitation: "test"
        },
        spectrum: {
          kind: "unresolved",
          limitation: "test"
        },
        temporalBehavior: {
          kind: "time-invariant"
        },
        evidence: ownedEvidence("test:environment")
      }
    ]
  });

const providerInput = (
  material:
    | "spectral-data"
    | "rgb-pbr-approximation"
    | "mixed"
    | "unresolved" = "spectral-data"
): Record<string, unknown> => ({
  schemaVersion: "0.1.0",
  profileId: "provider",
  sceneId: "room",
  illuminationProfileId: "lights",
  materialResponseProfileId: "materials",
  outputQuantity: "outgoing-spectral-radiance",
  outputUnit: "W/m^2/sr/nm",
  scientificStatus: "approximation",
  uncertainty: {
    kind: "not-quantified",
    limitation: "Renderer/provider result is not calibrated."
  },
  fidelity: {
    spectral: "wavelength-resolved",
    material,
    visibility: "resolved",
    directTransport: "resolved",
    indirectTransport: "approximation"
  },
  wavelengthChangingTransportModeled: false,
  volumetricTransportModeled: false,
  polarizationModeled: false,
  evidence: ownedEvidence("test:provider"),
  limitations: [
    "Fluorescence is not modeled.",
    "Indirect transport is approximate."
  ]
});

const surfaceRequestInput = (): Record<string, unknown> => ({
  schemaVersion: "0.1.0",
  sampleId: "sample-1",
  providerProfileId: "provider",
  sceneId: "room",
  illuminationProfileId: "lights",
  materialResponseProfileId: "materials",
  target: {
    kind: "surface-point",
    sceneObjectId: "wall",
    materialResponseId: "spectral",
    positionM: {
      x: 0,
      y: 1,
      z: 2
    },
    outgoingDirectionUnitVector: {
      x: 0,
      y: 0,
      z: -1
    }
  },
  timeSecondsFromExposureStart: 0.005,
  wavelengthNanometers: 550,
  wavelengthBasis: "vacuum"
});

const resultInput = (): Record<string, unknown> => ({
  schemaVersion: "0.1.0",
  sampleId: "sample-1",
  providerProfileId: "provider",
  sceneId: "room",
  wavelengthNanometers: 550,
  wavelengthBasis: "vacuum",
  quantity: "outgoing-spectral-radiance",
  unit: "W/m^2/sr/nm",
  spectralRadianceWattsPerSquareMeterSteradianNanometer:
    0.012,
  scientificStatus: "approximation",
  uncertainty: {
    kind: "relative",
    fraction: 0.1,
    basis: "test comparison"
  },
  evidence: ownedEvidence("test:result"),
  limitations: [
    "Provider output remains approximation-only."
  ]
});

describe("scene material-response boundary", () => {
  it("parses wavelength-preserving spectral material metadata", () => {
    const profile =
      parseSceneMaterialResponseProfile(
        materialProfileInput([
          spectralMaterial()
        ])
      );

    expect(profile.materials[0]?.representation).toMatchObject({
      kind: "spectral-wavelength-preserving-data",
      wavelengthBasis: "vacuum",
      scatteringModel:
        "provider-defined-wavelength-preserving",
      wavelengthChangingBehaviorModeled: false,
      emissionModeled: false
    });
    expect(
      assessSceneMaterialResponseFidelity(profile)
    ).toBe("spectral-data");
  });

  it("keeps RGB/PBR material data explicitly approximate", () => {
    const profile =
      parseSceneMaterialResponseProfile(
        materialProfileInput([
          rgbMaterial()
        ])
      );

    expect(profile.materials[0]?.representation).toMatchObject({
      kind: "rgb-pbr-approximation",
      colorSpace: "linear-srgb",
      metallic: 0.1,
      roughness: 0.5
    });
    expect(
      assessSceneMaterialResponseFidelity(profile)
    ).toBe("rgb-pbr-approximation");
  });

  it("reports mixed, unresolved, and empty profiles conservatively", () => {
    const mixed =
      parseSceneMaterialResponseProfile(
        materialProfileInput([
          spectralMaterial("s"),
          rgbMaterial("r")
        ])
      );
    expect(
      assessSceneMaterialResponseFidelity(mixed)
    ).toBe("mixed");

    const unresolved =
      parseSceneMaterialResponseProfile(
        materialProfileInput([
          {
            materialResponseId: "unknown",
            evidence: ownedEvidence("test:unknown"),
            representation: {
              kind: "unresolved",
              limitation: "Material response not characterized."
            }
          }
        ])
      );
    expect(
      assessSceneMaterialResponseFidelity(
        unresolved
      )
    ).toBe("unresolved");

    const empty =
      parseSceneMaterialResponseProfile(
        materialProfileInput([])
      );
    expect(
      assessSceneMaterialResponseFidelity(empty)
    ).toBe("unresolved");
  });

  it("fails closed on material profile identity and schema errors", () => {
    expect(() =>
      parseSceneMaterialResponseProfile({
        ...materialProfileInput([]),
        schemaVersion: "0.2.0"
      })
    ).toThrow("schemaVersion");

    expect(() =>
      parseSceneMaterialResponseProfile({
        ...materialProfileInput([]),
        materials: {}
      })
    ).toThrow("materials must be an array");

    expect(() =>
      parseSceneMaterialResponseProfile(
        materialProfileInput([
          rgbMaterial("same"),
          rgbMaterial("same")
        ])
      )
    ).toThrow(
      "materialResponseId must not contain duplicates"
    );
  });

  it("validates RGB/PBR value and color-space boundaries", () => {
    expect(() =>
      parseSceneMaterialResponseProfile(
        materialProfileInput([
          {
            ...rgbMaterial(),
            representation: {
              ...(rgbMaterial().representation as Record<
                string,
                unknown
              >),
              colorSpace: "display-p3"
            }
          }
        ])
      )
    ).toThrow('colorSpace must be "linear-srgb"');

    expect(() =>
      parseSceneMaterialResponseProfile(
        materialProfileInput([
          {
            ...rgbMaterial(),
            representation: {
              ...(rgbMaterial().representation as Record<
                string,
                unknown
              >),
              roughness: 2
            }
          }
        ])
      )
    ).toThrow(
      "roughness must be a finite fraction from 0 through 1"
    );
  });

  it("validates spectral artifact, basis, uncertainty, and wavelength-changing boundaries", () => {
    const base =
      spectralMaterial().representation as Record<
        string,
        unknown
      >;

    expect(() =>
      parseSceneMaterialResponseProfile(
        materialProfileInput([
          {
            ...spectralMaterial(),
            representation: {
              ...base,
              dataArtifact: {
                id: "bad",
                checksumSha256: "abc"
              }
            }
          }
        ])
      )
    ).toThrow("64-character SHA-256");

    expect(() =>
      parseSceneMaterialResponseProfile(
        materialProfileInput([
          {
            ...spectralMaterial(),
            representation: {
              ...base,
              wavelengthBasis: "unspecified"
            }
          }
        ])
      )
    ).toThrow(
      "calibrated spectral material data requires an air or vacuum wavelength basis"
    );

    expect(() =>
      parseSceneMaterialResponseProfile(
        materialProfileInput([
          {
            ...spectralMaterial(),
            representation: {
              ...base,
              uncertainty: {
                kind: "not-quantified",
                limitation: "test"
              }
            }
          }
        ])
      )
    ).toThrow(
      "requires quantified relative uncertainty"
    );

    expect(() =>
      parseSceneMaterialResponseProfile(
        materialProfileInput([
          {
            ...spectralMaterial(),
            representation: {
              ...base,
              wavelengthChangingBehaviorModeled: true
            }
          }
        ])
      )
    ).toThrow(
      "wavelengthChangingBehaviorModeled must be false"
    );

    expect(() =>
      parseSceneMaterialResponseProfile(
        materialProfileInput([
          {
            ...spectralMaterial(),
            representation: {
              ...base,
              emissionModeled: true
            }
          }
        ])
      )
    ).toThrow(
      "emissionModeled must be false"
    );
  });

  it("keeps fluorescence, volumetrics, and polarization explicitly off", () => {
    for (const key of [
      "fluorescenceModeled",
      "volumetricMaterialTransportModeled",
      "polarizationModeled"
    ]) {
      expect(() =>
        parseSceneMaterialResponseProfile({
          ...materialProfileInput([]),
          [key]: true
        })
      ).toThrow("must be false");
    }
  });
});

describe("scene-radiance provider profile", () => {
  it("parses an approximation-only provider with explicit fidelity axes", () => {
    const provider =
      parseSceneRadianceProviderProfile(
        providerInput()
      );

    expect(provider).toMatchObject({
      profileId: "provider",
      outputQuantity:
        "outgoing-spectral-radiance",
      outputUnit: "W/m^2/sr/nm",
      scientificStatus: "approximation",
      fidelity: {
        spectral: "wavelength-resolved",
        material: "spectral-data",
        visibility: "resolved",
        directTransport: "resolved",
        indirectTransport: "approximation"
      },
      wavelengthChangingTransportModeled:
        false,
      volumetricTransportModeled: false,
      polarizationModeled: false
    });
  });

  it("rejects calibrated promotion and wrong output semantics", () => {
    expect(() =>
      parseSceneRadianceProviderProfile({
        ...providerInput(),
        scientificStatus: "calibrated"
      })
    ).toThrow(
      'scientificStatus must be "approximation"'
    );

    expect(() =>
      parseSceneRadianceProviderProfile({
        ...providerInput(),
        outputQuantity: "irradiance"
      })
    ).toThrow("outputQuantity");

    expect(() =>
      parseSceneRadianceProviderProfile({
        ...providerInput(),
        outputUnit: "lux"
      })
    ).toThrow("outputUnit");
  });

  it("rejects unsupported fidelity and transport claims", () => {
    expect(() =>
      parseSceneRadianceProviderProfile({
        ...providerInput(),
        fidelity: {
          ...(providerInput().fidelity as Record<
            string,
            unknown
          >),
          spectral: "rgb-magic"
        }
      })
    ).toThrow("fidelity.spectral is invalid");

    expect(() =>
      parseSceneRadianceProviderProfile({
        ...providerInput(),
        fidelity: {
          ...(providerInput().fidelity as Record<
            string,
            unknown
          >),
          visibility: "perfect"
        }
      })
    ).toThrow("fidelity.visibility is invalid");

    expect(() =>
      parseSceneRadianceProviderProfile({
        ...providerInput(),
        wavelengthChangingTransportModeled: true
      })
    ).toThrow(
      "transport flags must all be false"
    );
  });
});

describe("scene-radiance evaluation request/result", () => {
  it("parses an exact surface request and provider result", () => {
    const request =
      parseSceneRadianceEvaluationRequest(
        surfaceRequestInput()
      );
    const result =
      parseSceneRadianceEvaluationResult(
        resultInput()
      );

    expect(request.target).toMatchObject({
      kind: "surface-point",
      sceneObjectId: "wall",
      materialResponseId: "spectral"
    });
    expect(request.timeSecondsFromExposureStart).toBe(
      0.005
    );
    expect(result).toMatchObject({
      quantity: "outgoing-spectral-radiance",
      unit: "W/m^2/sr/nm",
      spectralRadianceWattsPerSquareMeterSteradianNanometer:
        0.012,
      scientificStatus: "approximation"
    });
  });

  it("supports environment-direction targets without inventing a surface point", () => {
    const request =
      parseSceneRadianceEvaluationRequest({
        ...surfaceRequestInput(),
        target: {
          kind: "environment-direction",
          outgoingDirectionUnitVector: {
            x: 0,
            y: 1,
            z: 0
          }
        }
      });

    expect(request.target).toEqual({
      kind: "environment-direction",
      outgoingDirectionUnitVector: {
        x: 0,
        y: 1,
        z: 0
      }
    });
  });

  it("rejects invalid temporal, wavelength, direction, and target semantics", () => {
    expect(() =>
      parseSceneRadianceEvaluationRequest({
        ...surfaceRequestInput(),
        timeSecondsFromExposureStart: -0.1
      })
    ).toThrow(
      "timeSecondsFromExposureStart must be greater than or equal to zero"
    );

    expect(() =>
      parseSceneRadianceEvaluationRequest({
        ...surfaceRequestInput(),
        wavelengthNanometers: 0
      })
    ).toThrow(
      "wavelengthNanometers must be greater than zero"
    );

    expect(() =>
      parseSceneRadianceEvaluationRequest({
        ...surfaceRequestInput(),
        wavelengthBasis: "unspecified"
      })
    ).toThrow(
      "must be air or vacuum for outgoing spectral radiance"
    );

    expect(() =>
      parseSceneRadianceEvaluationRequest({
        ...surfaceRequestInput(),
        target: {
          kind: "surface-point",
          sceneObjectId: "wall",
          materialResponseId: "spectral",
          positionM: {
            x: 0,
            y: 0,
            z: 0
          },
          outgoingDirectionUnitVector: {
            x: 0,
            y: 0,
            z: -2
          }
        }
      })
    ).toThrow(
      "must be a unit-length direction vector"
    );

    expect(() =>
      parseSceneRadianceEvaluationRequest({
        ...surfaceRequestInput(),
        target: {
          kind: "screen-pixel"
        }
      })
    ).toThrow("target.kind is invalid");
  });

  it("rejects invalid result units, negative radiance, and calibrated promotion", () => {
    expect(() =>
      parseSceneRadianceEvaluationResult({
        ...resultInput(),
        unit: "W/m^2"
      })
    ).toThrow("unit must be");

    expect(() =>
      parseSceneRadianceEvaluationResult({
        ...resultInput(),
        spectralRadianceWattsPerSquareMeterSteradianNanometer:
          -1
      })
    ).toThrow(
      "must be greater than or equal to zero"
    );

    expect(() =>
      parseSceneRadianceEvaluationResult({
        ...resultInput(),
        scientificStatus: "calibrated"
      })
    ).toThrow(
      'scientificStatus must be "approximation"'
    );
  });
});

describe("scene-radiance provider binding validation", () => {
  const context = () => {
    const materialResponseProfile =
      parseSceneMaterialResponseProfile(
        materialProfileInput([
          spectralMaterial()
        ])
      );
    const providerProfile =
      parseSceneRadianceProviderProfile(
        providerInput("spectral-data")
      );
    const request =
      parseSceneRadianceEvaluationRequest(
        surfaceRequestInput()
      );
    const result =
      parseSceneRadianceEvaluationResult(
        resultInput()
      );
    return {
      providerProfile,
      illuminationProfile:
        illuminationProfile(),
      materialResponseProfile,
      request,
      result
    };
  };

  it("validates exact provider/profile/request/result identity without recomputing radiance", () => {
    const assessment =
      validateSceneRadianceEvaluationBindings(
        context()
      );

    expect(assessment).toEqual({
      providerBindingsMatched: true,
      requestResultIdentityMatched: true,
      materialResponseFidelity:
        "spectral-data",
      calibratedRadianceClaimAuthorized:
        false,
      sensorPlaneIrradianceCalculated:
        false,
      opticsApplied: false,
      photonsCalculated: false
    });
  });

  it("rejects material-fidelity drift", () => {
    const value = context();
    value.providerProfile = {
      ...value.providerProfile,
      fidelity: {
        ...value.providerProfile.fidelity,
        material: "rgb-pbr-approximation"
      }
    };

    expect(() =>
      validateSceneRadianceEvaluationBindings(
        value
      )
    ).toThrow(
      "Provider material fidelity must match"
    );
  });

  it("rejects undeclared surface material response", () => {
    const value = context();
    if (
      value.request.target.kind !==
      "surface-point"
    ) {
      throw new Error("Expected surface target");
    }
    value.request = {
      ...value.request,
      target: {
        ...value.request.target,
        materialResponseId: "missing"
      }
    };

    expect(() =>
      validateSceneRadianceEvaluationBindings(
        value
      )
    ).toThrow(
      "materialResponseId is not declared"
    );
  });

  it("rejects provider/profile binding drift", () => {
    const value = context();
    value.providerProfile = {
      ...value.providerProfile,
      illuminationProfileId:
        "other-lights"
    };
    expect(() =>
      validateSceneRadianceEvaluationBindings(
        value
      )
    ).toThrow(
      "Provider illuminationProfileId must match"
    );
  });

  it("rejects request and result identity drift", () => {
    const requestDrift = context();
    requestDrift.request = {
      ...requestDrift.request,
      sceneId: "other-scene"
    };
    expect(() =>
      validateSceneRadianceEvaluationBindings(
        requestDrift
      )
    ).toThrow(
      "Request sceneId must match"
    );

    const resultDrift = context();
    resultDrift.result = {
      ...resultDrift.result,
      wavelengthNanometers: 560
    };
    expect(() =>
      validateSceneRadianceEvaluationBindings(
        resultDrift
      )
    ).toThrow(
      "Result wavelengthNanometers must match"
    );
  });
});
