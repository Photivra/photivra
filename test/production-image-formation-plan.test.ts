import { describe, expect, it } from "vitest";

import {
  POC_SIMULATION_API_VERSION,
  calculateIlluminationVignetting,
  createProductionCaptureSnapshot,
  createProductionImageFormationPlan,
  createProductionPlanConsumerManifest,
  getImageFormationContract,
  parseFrontOfLensFilterProfile,
  parseGenericBodyExposureCapabilityProfile,
  parseGenericLensExposureCapabilityProfile,
  parseImageFormationFidelityProfile,
  parsePreparedImageFormationContext,
  parseProductionCaptureSnapshot,
  parseRendererCapabilityDeclaration,
  parseSceneToSensorIrradianceProfile,
  prepareImageFormationContext,
  resolveGenericEquipmentExposureCapabilities,
  serializeProductionImageFormationPlan,
  type CreateProductionCaptureSnapshotInput,
  type ImageFormationFidelityProfile,
  type PreparedImageFormationContext,
  type ProductionTemporalCaptureInput,
  type RendererCapabilityDeclaration,
  type SceneRadianceEvaluationRequest,
  type SceneRadianceEvaluationResult,
  type SceneToSensorIrradianceProfile
} from "../src/index.js";

const evidence = (
  ref: string
): readonly [{
  sourceOrigin: "photivra";
  sourceReference: string;
  reuseStatus: "photivra-owned";
}] => [{
  sourceOrigin: "photivra",
  sourceReference: ref,
  reuseStatus: "photivra-owned"
}];

const equipment = (): ReturnType<
  typeof resolveGenericEquipmentExposureCapabilities
> => {
  const body =
    parseGenericBodyExposureCapabilityProfile({
      schemaVersion: "0.1.0",
      profileId: "body",
      profileVersion: "1.0.0",
      scientificStatus: "approximation",
      evidence: evidence("body"),
      shutter: {
        durationSecondsRange: {
          value: {
            minimum: 1 / 8000,
            maximum: 30
          },
          evidence: evidence("shutter")
        },
        settingGrid: {
          kind: "continuous-within-range"
        }
      },
      iso: {
        range: {
          value: {
            minimum: 100,
            maximum: 12800
          },
          evidence: evidence("iso")
        },
        settingGrid: {
          kind: "discrete-values",
          values: {
            value: [
              100,
              200,
              400,
              800,
              1600,
              3200,
              6400,
              12800
            ],
            evidence: evidence("iso-grid")
          }
        },
        autoIso: {
          value: "supported",
          evidence: evidence("auto-iso")
        }
      }
    });

  const lens =
    parseGenericLensExposureCapabilityProfile({
      schemaVersion: "0.1.0",
      profileId: "lens",
      profileVersion: "1.0.0",
      scientificStatus: "approximation",
      evidence: evidence("lens"),
      focalLengthMmRange: {
        value: {
          minimum: 50,
          maximum: 50
        },
        evidence: evidence("focal")
      },
      aperture: {
        widestAvailableFNumber: {
          kind: "constant",
          fNumber: {
            value: 1.8,
            evidence: evidence("wide")
          }
        },
        narrowestAvailableFNumber: {
          value: 16,
          evidence: evidence("narrow")
        },
        settingGrid: {
          kind: "continuous-within-range"
        }
      }
    });

  return resolveGenericEquipmentExposureCapabilities({
    bodyProfile: body,
    lensProfile: lens,
    selectedFocalLengthMm: 50
  });
};

const opticalProfile = (): SceneToSensorIrradianceProfile =>
  parseSceneToSensorIrradianceProfile({
    schemaVersion: "0.1.0",
    profileId: "optics",
    profileVersion: "1.0.0",
    lensProfileId: "lens",
    scientificStatus: "approximation",
    applicability: {
      focalLengthMm: {
        minimum: 50,
        maximum: 50
      },
      nominalFNumber: {
        minimum: 1.8,
        maximum: 16
      },
      focus: {
        kind: "any"
      }
    },
    transmission: {
      kind: "spectral-transmission",
      scientificStatus: "approximation",
      wavelengthBasis: "air",
      samples: {
        value: [
          {
            wavelengthNanometers: 450,
            linearTransmissionFactor: 0.8
          },
          {
            wavelengthNanometers: 550,
            linearTransmissionFactor: 0.7
          },
          {
            wavelengthNanometers: 650,
            linearTransmissionFactor: 0.6
          }
        ],
        evidence: evidence("curve")
      },
      uncertainty: {
        kind: "not-quantified",
        limitation: "test approximation"
      }
    },
    distortionAreaMappingOwnership:
      "not-applied-by-bridge",
    psfRedistributionOwnership:
      "downstream-normalized-energy-redistribution",
    sensorOpticalStackIncluded: false,
    strayLightIncluded: false,
    polarizationModeled: false,
    wavelengthChangingBehaviorModeled: false,
    volumetricScatteringModeled: false,
    evidence: evidence("optics"),
    limitations: ["test profile"]
  });

const frontFilter = (
  factor = 0.5
): ReturnType<
  typeof parseFrontOfLensFilterProfile
> =>
  parseFrontOfLensFilterProfile({
    schemaVersion: "0.1.0",
    filterId: "generic-front-filter",
    profileVersion: "1.0.0",
    identityScope:
      "photivra-generic-unbranded",
    position: "front-of-lens",
    scientificStatus: "approximation",
    wavelengthBasis: "air",
    wavelengthRangeNanometers: {
      minimum: 450,
      maximum: 650
    },
    transmission: {
      kind:
        "neutral-linear-transmission",
      linearTransmissionFactor: {
        value: factor,
        evidence:
          evidence("front-filter")
      }
    },
    uncertainty: {
      kind: "not-quantified",
      limitation: "test"
    },
    polarizationModeled: false,
    wavelengthChangingBehaviorModeled:
      false,
    evidence:
      evidence("front-filter-profile"),
    limitations: []
  });

const sceneRequest = (
  target:
    "environment-direction" |
    "surface-point" =
      "environment-direction",
  wavelengthNanometers = 550
): SceneRadianceEvaluationRequest => ({
  schemaVersion: "0.1.0",
  sampleId: "sample-1",
  providerProfileId: "provider",
  sceneId: "scene",
  illuminationProfileId: "illumination",
  materialResponseProfileId: "materials",
  target:
    target === "environment-direction"
      ? {
          kind: "environment-direction",
          outgoingDirectionUnitVector: {
            x: 0,
            y: 0,
            z: 1
          }
        }
      : {
          kind: "surface-point",
          sceneObjectId: "object",
          materialResponseId: "material",
          positionM: {
            x: 0,
            y: 0,
            z: 2
          },
          outgoingDirectionUnitVector: {
            x: 0,
            y: 0,
            z: 1
          }
        },
  timeSecondsFromExposureStart: 0.1,
  wavelengthNanometers,
  wavelengthBasis: "air"
});

const sceneResult = (
  wavelengthNanometers = 550
): SceneRadianceEvaluationResult => ({
  schemaVersion: "0.1.0",
  sampleId: "sample-1",
  providerProfileId: "provider",
  sceneId: "scene",
  wavelengthNanometers,
  wavelengthBasis: "air",
  quantity: "outgoing-spectral-radiance",
  unit: "W/m^2/sr/nm",
  spectralRadianceWattsPerSquareMeterSteradianNanometer: 10,
  scientificStatus: "approximation",
  uncertainty: {
    kind: "not-quantified",
    limitation: "test"
  },
  evidence: evidence("radiance"),
  limitations: ["test"]
});

const renderer = (
  overrides: Partial<
    RendererCapabilityDeclaration
  > = {}
): RendererCapabilityDeclaration =>
  parseRendererCapabilityDeclaration({
    schemaVersion: "0.1.0",
    rendererId: "renderer",
    rendererVersion: "1.0.0",
    consumerKind: "reference",
    supportedStages: [
      "scene-ray-projection",
      "scene-radiance-evaluation",
      "lens-field-pupil-evaluation"
    ],
    supportedEffects: [
      "illumination-vignetting"
    ],
    spectralCapability:
      "wavelength-resolved",
    temporalSampling: {
      kind: "bounded",
      maximumSamples: 32
    },
    depthCapability: "per-layer",
    inverseFieldMapping: true,
    alphaRepresentation: "premultiplied",
    preservesDepthOrderAcrossWarps: true,
    sensorDomainProcessing: true,
    ...overrides
  });

const fidelity = (
  overrides: Partial<
    ImageFormationFidelityProfile
  > = {}
): ImageFormationFidelityProfile =>
  parseImageFormationFidelityProfile({
    schemaVersion: "0.1.0",
    profileId: "physical-sample",
    profileVersion: "1.0.0",
    requiredStages: [
      "lens-field-pupil-evaluation"
    ],
    requiredEffects: [
      {
        effectId: "illumination-vignetting",
        modelId: "generic-vignetting",
        modelVersion: "1.0.0"
      }
    ],
    rendererRequirements: {
      spectral:
        "wavelength-resolved",
      sensorDomainProcessing: false,
      depth: "none"
    },
    ...overrides
  });

const prepared = (
  options: {
    includeOptics?: boolean;
    rendererOverride?: Partial<
      RendererCapabilityDeclaration
    >;
    fidelityOverride?: Partial<
      ImageFormationFidelityProfile
    >;
  } = {}
): PreparedImageFormationContext =>
  prepareImageFormationContext({
    contextId: "context",
    sceneId: "scene",
    sceneRadianceProviderProfileId:
      "provider",
    outputGeometryProfileId:
      "output-v1",
    equipmentCapabilities:
      equipment(),
    ...(options.includeOptics ===
    false
      ? {}
      : {
          opticalBridgeProfile:
            opticalProfile()
        }),
    renderer:
      renderer(
        options.rendererOverride
      ),
    fidelity:
      fidelity(
        options.fidelityOverride
      )
  });

const captureInput = (
  options: {
    seed?: number;
    target?:
      | "environment-direction"
      | "surface-point";
    field?: "unity" | "vignetted";
    wavelengthNanometers?: number;
    includePhysical?: boolean;
    frontFilter?: boolean;
  } = {}
): CreateProductionCaptureSnapshotInput => {
  const field =
    options.field === "vignetted"
      ? {
          kind:
            "illumination-vignetting-result" as const,
          result:
            calculateIlluminationVignetting({
              imagePointMm: {
                x: 10,
                y: 0
              },
              profile: {
                normalizationRadiusMm: 20,
                maximumNormalizedRadius: 1,
                coefficients: {
                  r2: -0.4,
                  r4: 0,
                  r6: 0
                }
              }
            }).value
        }
      : {
          kind: "unity" as const
        };

  return {
    captureId: "capture-1",
    releaseFrameId: "release-1",
    sceneStateId: "scene-state-1",
    sceneTimeSecondsFromExposureStart:
      0.1,
    outputStateId: "output-v1",
    exposure: {
      aperture: 4,
      shutterSeconds: 1 / 125,
      iso: 100
    },
    stochasticSeedUint32:
      options.seed ?? 12345,
    ...(options.includePhysical ===
    false
      ? {}
      : {
          physicalSceneSample: {
            sceneRadianceRequest:
              sceneRequest(
                options.target,
                options.wavelengthNanometers
              ),
            sceneRadianceResult:
              sceneResult(
                options.wavelengthNanometers
              ),
            focus: {
              kind: "infinity-focus" as const
            },
            imagePointMm:
              options.field ===
              "vignetted"
                ? {
                    x: 10,
                    y: 0
                  }
                : {
                    x: 0,
                    y: 0
                  },
            fieldThroughput:
              field,
            ...(options.frontFilter
              ? {
                  frontOfLensFilters: [
                    frontFilter()
                  ]
                }
              : {})
          }
        })
  };
};

const capture = (
  options: Parameters<
    typeof captureInput
  >[0] = {}
): ReturnType<
  typeof createProductionCaptureSnapshot
> =>
  createProductionCaptureSnapshot(
    captureInput(options)
  );

describe("production image-formation preparation", () => {
  it("prepares one immutable static context with independent version identity", () => {
    const context = prepared();

    expect(context.version).toBe(
      "0.1.0"
    );
    expect(
      context.fingerprint.algorithm
    ).toBe(
      "fnv1a-32-non-cryptographic"
    );
    expect(context.renderer.rendererId)
      .toBe("renderer");
    expect(
      context
        .equipmentCapabilities
        .lensProfile.profileId
    ).toBe("lens");
    expect(Object.isFrozen(context))
      .toBe(true);
    expect(
      Object.isFrozen(
        context.renderer
      )
    ).toBe(true);
  });

  it("canonicalizes set-like renderer/fidelity order into the same prepared fingerprint", () => {
    const first = prepared();

    const second =
      prepareImageFormationContext({
        contextId: "context",
        sceneId: "scene",
        sceneRadianceProviderProfileId:
          "provider",
        outputGeometryProfileId:
          "output-v1",
        equipmentCapabilities:
          equipment(),
        opticalBridgeProfile:
          opticalProfile(),
        renderer:
          parseRendererCapabilityDeclaration({
            ...renderer(),
            supportedStages: [
              "lens-field-pupil-evaluation",
              "scene-radiance-evaluation",
              "scene-ray-projection"
            ],
            supportedEffects: [
              "illumination-vignetting"
            ]
          }),
        fidelity:
          parseImageFormationFidelityProfile({
            ...fidelity(),
            requiredStages: [
              "lens-field-pupil-evaluation"
            ],
            requiredEffects: [
              {
                effectId:
                  "illumination-vignetting",
                modelId:
                  "generic-vignetting",
                modelVersion:
                  "1.0.0"
              }
            ]
          })
      });

    expect(
      second.fingerprint.value
    ).toBe(
      first.fingerprint.value
    );
  });

  it("copies inputs so later UI/profile mutation cannot alter prepared state", () => {
    const capabilities =
      equipment();
    const inputRenderer =
      renderer();

    const context =
      prepareImageFormationContext({
        contextId: "context",
        sceneId: "scene",
        sceneRadianceProviderProfileId:
          "provider",
        outputGeometryProfileId:
          "output-v1",
        equipmentCapabilities:
          capabilities,
        opticalBridgeProfile:
          opticalProfile(),
        renderer:
          inputRenderer,
        fidelity: fidelity()
      });

    (
      capabilities.aperture as {
        widestAvailableFNumber: number;
      }
    ).widestAvailableFNumber = 99;

    expect(
      context
        .equipmentCapabilities
        .aperture
        .widestAvailableFNumber
    ).toBe(1.8);
  });

  it("round-trips only when the prepared fingerprint matches content", () => {
    const context = prepared();

    expect(
      parsePreparedImageFormationContext(
        context
      ).fingerprint.value
    ).toBe(
      context.fingerprint.value
    );

    expect(() =>
      parsePreparedImageFormationContext({
        ...context,
        contextId: "tampered"
      })
    ).toThrow(
      "fingerprint does not match"
    );
  });

  it("rejects an optical profile bound to another lens profile", () => {
    expect(() =>
      prepareImageFormationContext({
        contextId: "context",
        sceneId: "scene",
        sceneRadianceProviderProfileId:
          "provider",
        outputGeometryProfileId:
          "output-v1",
        equipmentCapabilities:
          equipment(),
        opticalBridgeProfile: {
          ...opticalProfile(),
          lensProfileId: "other-lens"
        },
        renderer: renderer(),
        fidelity: fidelity()
      })
    ).toThrow(
      "lensProfileId must match"
    );
  });
});

describe("immutable production capture snapshots", () => {
  it("freezes capture identity, selected state, scene sample, and seed", () => {
    const snapshot = capture();

    expect(snapshot.version)
      .toBe("0.3.0");
    expect(snapshot.captureId)
      .toBe("capture-1");
    expect(snapshot.stochasticSeedUint32)
      .toBe(12345);
    expect(Object.isFrozen(snapshot))
      .toBe(true);
    expect(
      Object.isFrozen(
        snapshot.exposure
      )
    ).toBe(true);
    expect(
      Object.isFrozen(
        snapshot
          .physicalSceneSample!
      )
    ).toBe(true);
  });

  it("copies capture inputs so later app-state mutation cannot alter committed state", () => {
    const input =
      captureInput();
    const snapshot =
      createProductionCaptureSnapshot(
        input
      );

    input.exposure.aperture = 8;
    input
      .physicalSceneSample!
      .sceneRadianceResult
      .spectralRadianceWattsPerSquareMeterSteradianNanometer =
      999;

    expect(snapshot.exposure.aperture)
      .toBe(4);
    expect(
      snapshot
        .physicalSceneSample!
        .sceneRadianceResult
        .spectralRadianceWattsPerSquareMeterSteradianNanometer
    ).toBe(10);
  });

  it("rejects scene-time drift between capture and #85 request", () => {
    const input =
      captureInput();
    input
      .physicalSceneSample!
      .sceneRadianceRequest =
      {
        ...input
          .physicalSceneSample!
          .sceneRadianceRequest,
        timeSecondsFromExposureStart:
          0.2
      };

    expect(() =>
      createProductionCaptureSnapshot(
        input
      )
    ).toThrow(
      "must equal the capture snapshot scene time"
    );
  });

  it("round-trips only with an untampered capture fingerprint", () => {
    const snapshot = capture();

    expect(
      parseProductionCaptureSnapshot(
        snapshot
      ).fingerprint.value
    ).toBe(
      snapshot.fingerprint.value
    );

    expect(() =>
      parseProductionCaptureSnapshot({
        ...snapshot,
        sceneStateId: "tampered"
      })
    ).toThrow(
      "fingerprint does not match"
    );
  });
});

describe("ready physical production plan", () => {
  it("expands graph dependencies, computes #110, and preserves contract order", () => {
    const plan =
      createProductionImageFormationPlan({
        preparedContext:
          prepared(),
        captureSnapshot:
          capture()
      });

    expect(plan.status).toBe(
      "ready"
    );
    expect(plan.versions).toMatchObject({
      engineApi: "0.97.0",
      imageFormationContract:
        "0.4.0",
      plan: "0.5.0",
      scientificAssurance:
        "0.1.0"
    });
    expect(
      plan
        .physicalSceneToSensorResult
        ?.outputQuantity
    ).toBe(
      "sensor-plane-spectral-irradiance"
    );

    const required =
      plan.stagePlan.filter(
        (stage) =>
          stage.requiredByFidelity
      );
    expect(
      required.map(
        (stage) =>
          stage.stageId
      )
    ).toEqual([
      "scene-ray-projection",
      "scene-radiance-evaluation",
      "lens-field-pupil-evaluation"
    ]);

    expect(
      plan.stagePlan.map(
        (stage) => stage.stageId
      )
    ).toEqual(
      getImageFormationContract()
        .stages.map(
          (stage) => stage.id
        )
    );
  });

  it("preserves evidence and uncertainty identity in the production plan", () => {
    const plan =
      createProductionImageFormationPlan({
        preparedContext:
          prepared(),
        captureSnapshot:
          capture()
      });

    expect(
      plan.scientificAssurance
    ).toMatchObject({
      version: "0.1.0",
      scientificStatus:
        "approximation",
      evidenceStatus: "complete",
      uncertainty: {
        kind:
          "not-quantified",
        componentIds: [
          "scene-radiance",
          "optical-throughput-profile",
          "primary-optics-bridge-model"
        ]
      },
      componentEvidencePreserved:
        true,
      componentUncertaintyPreserved:
        true,
      aggregateNumericUncertaintyFabricated:
        false,
      downstreamStatusPromotedAboveInputs:
        false
    });

    expect(
      plan
        .scientificAssurance
        ?.components.map(
          (component) =>
            component.componentId
        )
    ).toEqual([
      "scene-radiance",
      "optical-throughput-profile",
      "primary-optics-bridge-model"
    ]);

    expect(
      plan
        .scientificAssurance
        ?.components[0]
        ?.evidence
    ).toEqual(
      evidence("radiance")
    );
    expect(
      plan
        .scientificAssurance
        ?.components[0]
        ?.uncertainty
    ).toEqual({
      kind: "not-quantified",
      limitation: "test"
    });
    expect(
      plan
        .scientificAssurance
        ?.components[1]
        ?.sourceIdentity
    ).toEqual({
      kind: "profile",
      id: "optics",
      version: "1.0.0"
    });
  });

  it("distinguishes a modeled-zero projection/effect from effects omitted by fidelity", () => {
    const plan =
      createProductionImageFormationPlan({
        preparedContext:
          prepared(),
        captureSnapshot:
          capture()
      });

    const projection =
      plan.stagePlan.find(
        (stage) =>
          stage.stageId ===
          "scene-ray-projection"
      );
    const vignetting =
      plan.effectPlan.find(
        (effect) =>
          effect.effectId ===
          "illumination-vignetting"
      );
    const distortion =
      plan.effectPlan.find(
        (effect) =>
          effect.effectId ===
          "geometric-distortion"
      );

    expect(projection?.state)
      .toBe("modeled-zero");
    expect(vignetting?.state)
      .toBe("modeled-zero");
    expect(distortion?.state)
      .toBe(
        "omitted-by-fidelity"
      );
  });

  it("marks a surface-point projection and non-unity vignetting active", () => {
    const plan =
      createProductionImageFormationPlan({
        preparedContext:
          prepared(),
        captureSnapshot:
          capture({
            target: "surface-point",
            field: "vignetted"
          })
      });

    expect(
      plan.stagePlan.find(
        (stage) =>
          stage.stageId ===
          "scene-ray-projection"
      )?.state
    ).toBe("active");
    expect(
      plan.effectPlan.find(
        (effect) =>
          effect.effectId ===
          "illumination-vignetting"
      )?.state
    ).toBe("active");
    expect(
      plan
        .physicalSceneToSensorResult
        ?.fieldThroughputFactor
    ).toBeLessThan(1);
    expect(
      plan
        .scientificAssurance
        ?.components.find(
          (component) =>
            component.componentId ===
            "field-throughput-model"
        )
        ?.uncertainty.kind
    ).toBe("not-quantified");
  });

  it("composes front-of-lens filter transmission into immutable physical capture identity", () => {
    const withoutFilter =
      createProductionImageFormationPlan({
        preparedContext:
          prepared(),
        captureSnapshot:
          capture()
      });
    const withFilter =
      createProductionImageFormationPlan({
        preparedContext:
          prepared(),
        captureSnapshot:
          capture({
            frontFilter: true
          })
      });

    expect(withFilter.status)
      .toBe("ready");
    expect(
      withFilter
        .physicalSceneToSensorResult
        ?.frontOfLensFilterCount
    ).toBe(1);
    expect(
      withFilter
        .physicalSceneToSensorResult
        ?.frontOfLensFilterTransmissionFactor
    ).toBe(0.5);
    expect(
      withFilter
        .physicalSceneToSensorResult
        ?.sensorPlaneSpectralIrradianceWattsPerSquareMeterNanometer
    ).toBeCloseTo(
      (withoutFilter
        .physicalSceneToSensorResult
        ?.sensorPlaneSpectralIrradianceWattsPerSquareMeterNanometer ??
        0) * 0.5,
      12
    );
    expect(
      withFilter
        .captureIdentity
        .captureSnapshotFingerprint
    ).not.toBe(
      withoutFilter
        .captureIdentity
        .captureSnapshotFingerprint
    );
    expect(
      withFilter.fingerprint.value
    ).not.toBe(
      withoutFilter.fingerprint.value
    );
    expect(
      withFilter
        .scientificAssurance
        ?.components.some(
          (component) =>
            component.componentId ===
            "front-filter:0" &&
            component.sourceIdentity.id ===
            "generic-front-filter"
        )
    ).toBe(true);
  });

  it("is deterministic for identical semantic inputs", () => {
    const context = prepared();
    const snapshot = capture();

    const first =
      createProductionImageFormationPlan({
        preparedContext: context,
        captureSnapshot: snapshot
      });
    const second =
      createProductionImageFormationPlan({
        preparedContext: context,
        captureSnapshot: snapshot
      });

    expect(
      second.fingerprint.value
    ).toBe(
      first.fingerprint.value
    );
    expect(
      serializeProductionImageFormationPlan(
        second
      )
    ).toBe(
      serializeProductionImageFormationPlan(
        first
      )
    );
  });

  it("changes reproducibility identity when material uncertainty metadata changes", () => {
    const baseSnapshot =
      capture();

    const changedInput =
      captureInput();
    const physical =
      changedInput
        .physicalSceneSample;
    if (physical === undefined) {
      throw new Error(
        "Expected physical scene sample."
      );
    }

    physical.sceneRadianceResult = {
      ...physical
        .sceneRadianceResult,
      uncertainty: {
        kind: "relative",
        fraction: 0.05,
        basis:
          "alternate test uncertainty"
      }
    };

    const changedSnapshot =
      createProductionCaptureSnapshot(
        changedInput
      );

    const basePlan =
      createProductionImageFormationPlan({
        preparedContext:
          prepared(),
        captureSnapshot:
          baseSnapshot
      });
    const changedPlan =
      createProductionImageFormationPlan({
        preparedContext:
          prepared(),
        captureSnapshot:
          changedSnapshot
      });

    expect(
      changedSnapshot
        .fingerprint.value
    ).not.toBe(
      baseSnapshot
        .fingerprint.value
    );
    expect(
      changedPlan
        .fingerprint.value
    ).not.toBe(
      basePlan.fingerprint.value
    );
    expect(
      changedPlan
        .scientificAssurance
        ?.components.find(
          (component) =>
            component.componentId ===
            "scene-radiance"
        )
        ?.uncertainty
    ).toEqual({
      kind: "relative",
      fraction: 0.05,
      basis:
        "alternate test uncertainty"
    });
  });

  it("keeps prepared context stable while capture identity/seed can vary", () => {
    const context = prepared();
    const first =
      createProductionImageFormationPlan({
        preparedContext: context,
        captureSnapshot:
          capture({
            seed: 1
          })
      });
    const second =
      createProductionImageFormationPlan({
        preparedContext: context,
        captureSnapshot:
          capture({
            seed: 2
          })
      });

    expect(
      second
        .contextIdentity
        .preparedContextFingerprint
    ).toBe(
      first
        .contextIdentity
        .preparedContextFingerprint
    );
    expect(
      second
        .captureIdentity
        .captureSnapshotFingerprint
    ).not.toBe(
      first
        .captureIdentity
        .captureSnapshotFingerprint
    );
    expect(
      second.fingerprint.value
    ).not.toBe(
      first.fingerprint.value
    );
  });

  it("keeps legacy POC explicitly untouched", () => {
    const plan =
      createProductionImageFormationPlan({
        preparedContext:
          prepared(),
        captureSnapshot:
          capture()
      });

    expect(plan.legacyPocModified)
      .toBe(false);
    expect(
      POC_SIMULATION_API_VERSION
    ).toBe("0.20.0");
  });
});

describe("structured plan blockers", () => {
  it("blocks a required stage unsupported by the renderer", () => {
    const context =
      prepared({
        rendererOverride: {
          supportedStages: [
            "scene-ray-projection",
            "scene-radiance-evaluation"
          ]
        }
      });

    const plan =
      createProductionImageFormationPlan({
        preparedContext: context,
        captureSnapshot:
          capture()
      });

    expect(plan.status)
      .toBe("blocked");
    expect(
      plan.blockers
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code:
            "renderer-stage-unsupported",
          stageId:
            "lens-field-pupil-evaluation"
        })
      ])
    );
  });

  it("blocks renderer fidelity mismatches without silently degrading", () => {
    const context =
      prepared({
        rendererOverride: {
          spectralCapability:
            "wavelength-independent-approximation",
          inverseFieldMapping:
            false,
          alphaRepresentation:
            "straight",
          preservesDepthOrderAcrossWarps:
            false
        }
      });

    const plan =
      createProductionImageFormationPlan({
        preparedContext: context,
        captureSnapshot:
          capture()
      });

    const codes =
      new Set(
        plan.blockers.map(
          (blocker) =>
            blocker.code
        )
      );

    expect(codes.has(
      "renderer-spectral-capability-insufficient"
    )).toBe(true);
    expect(codes.has(
      "renderer-inverse-field-mapping-required"
    )).toBe(true);
    expect(codes.has(
      "renderer-premultiplied-alpha-required"
    )).toBe(true);
    expect(codes.has(
      "renderer-depth-order-preservation-required"
    )).toBe(true);
  });

  it("blocks requested sensor/depth fidelity that the renderer cannot express", () => {
    const context =
      prepared({
        rendererOverride: {
          sensorDomainProcessing:
            false,
          depthCapability: "none"
        },
        fidelityOverride: {
          rendererRequirements: {
            spectral:
              "wavelength-resolved",
            sensorDomainProcessing:
              true,
            depth: "per-layer"
          }
        }
      });

    const plan =
      createProductionImageFormationPlan({
        preparedContext: context,
        captureSnapshot:
          capture()
      });

    expect(
      plan.blockers.map(
        (blocker) =>
          blocker.code
      )
    ).toEqual(
      expect.arrayContaining([
        "renderer-sensor-domain-processing-unavailable",
        "renderer-depth-capability-insufficient"
      ])
    );
  });

  it("reports unsupported engine stages/effects rather than silently skipping them", () => {
    const context =
      prepared({
        rendererOverride: {
          supportedStages: [
            ...renderer()
              .supportedStages,
            "field-wavelength-psf"
          ],
          supportedEffects: [
            ...renderer()
              .supportedEffects,
            "non-circular-diffraction"
          ]
        },
        fidelityOverride: {
          requiredStages: [
            "lens-field-pupil-evaluation"
          ],
          requiredEffects: [
            {
              effectId:
                "non-circular-diffraction",
              modelId:
                "polygon-diffraction",
              modelVersion:
                "future"
            }
          ]
        }
      });

    const plan =
      createProductionImageFormationPlan({
        preparedContext: context,
        captureSnapshot:
          capture()
      });

    expect(
      plan.blockers
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code:
            "engine-stage-not-composed",
          stageId:
            "field-wavelength-psf"
        }),
        expect.objectContaining({
          code:
            "engine-effect-not-composed",
          effectId:
            "non-circular-diffraction"
        })
      ])
    );
  });

  it("blocks missing physical inputs/profile as structured scientific blockers", () => {
    const noProfile =
      createProductionImageFormationPlan({
        preparedContext:
          prepared({
            includeOptics: false
          }),
        captureSnapshot:
          capture()
      });
    const noSample =
      createProductionImageFormationPlan({
        preparedContext:
          prepared(),
        captureSnapshot:
          capture({
            includePhysical:
              false
          })
      });

    expect(
      noProfile.blockers
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code:
            "missing-optical-bridge-profile"
        })
      ])
    );
    expect(
      noSample.blockers
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code:
            "missing-physical-scene-sample"
        })
      ])
    );
  });

  it("blocks hidden non-unity field throughput when fidelity omitted vignetting", () => {
    const context =
      prepared({
        fidelityOverride: {
          requiredEffects: []
        }
      });
    const plan =
      createProductionImageFormationPlan({
        preparedContext: context,
        captureSnapshot:
          capture({
            field: "vignetted"
          })
      });

    expect(
      plan.blockers
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code:
            "undeclared-field-throughput-effect",
          effectId:
            "illumination-vignetting"
        })
      ])
    );
  });

  it("converts #110 applicability failure into a structured plan blocker", () => {
    const plan =
      createProductionImageFormationPlan({
        preparedContext:
          prepared(),
        captureSnapshot:
          capture({
            wavelengthNanometers:
              700
          })
      });

    expect(plan.status)
      .toBe("blocked");
    expect(
      plan.blockers
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code:
            "physical-radiometry-evaluation-blocked"
        })
      ])
    );
  });
});

describe("plan input fail-closed guards", () => {
  it("rejects selected exposure state outside prepared equipment capabilities", () => {
    const invalid =
      createProductionCaptureSnapshot({
        ...captureInput(),
        exposure: {
          aperture: 32,
          shutterSeconds:
            1 / 125,
          iso: 100
        }
      });

    expect(() =>
      createProductionImageFormationPlan({
        preparedContext:
          prepared(),
        captureSnapshot:
          invalid
      })
    ).toThrow(
      "lies outside the prepared equipment capability range"
    );
  });

  it("rejects scene/provider/output binding drift instead of creating a plan", () => {
    const wrongScene =
      createProductionCaptureSnapshot({
        ...captureInput(),
        physicalSceneSample: {
          ...captureInput()
            .physicalSceneSample!,
          sceneRadianceRequest: {
            ...sceneRequest(),
            sceneId: "other-scene"
          },
          sceneRadianceResult: {
            ...sceneResult(),
            sceneId: "other-scene"
          }
        }
      });

    expect(() =>
      createProductionImageFormationPlan({
        preparedContext:
          prepared(),
        captureSnapshot:
          wrongScene
      })
    ).toThrow(
      "sceneId must match"
    );

    const wrongOutput =
      createProductionCaptureSnapshot({
        ...captureInput(),
        outputStateId:
          "other-output"
      });

    expect(() =>
      createProductionImageFormationPlan({
        preparedContext:
          prepared(),
        captureSnapshot:
          wrongOutput
      })
    ).toThrow(
      "outputStateId must match"
    );
  });

  it("rejects malformed renderer/fidelity declarations at their JSON boundary", () => {
    expect(() =>
      parseRendererCapabilityDeclaration({
        ...renderer(),
        consumerKind: "magic"
      })
    ).toThrow(
      "consumerKind is invalid"
    );

    expect(() =>
      parseRendererCapabilityDeclaration({
        ...renderer(),
        supportedStages: [
          "scene-ray-projection",
          "scene-ray-projection"
        ]
      })
    ).toThrow(
      "duplicate stage IDs"
    );

    expect(() =>
      parseImageFormationFidelityProfile({
        ...fidelity(),
        requiredEffects: [
          {
            effectId:
              "illumination-vignetting",
            modelId: "a",
            modelVersion: "1"
          },
          {
            effectId:
              "illumination-vignetting",
            modelId: "b",
            modelVersion: "1"
          }
        ]
      })
    ).toThrow(
      "duplicate effect IDs"
    );
  });
});

describe("production-plan parser and blocker coverage", () => {
  it("covers renderer temporal modes and fail-closed enum/boolean guards", () => {
    expect(
      parseRendererCapabilityDeclaration({
        ...renderer(),
        temporalSampling: {
          kind: "none"
        }
      }).temporalSampling
    ).toEqual({
      kind: "none"
    });

    expect(() =>
      parseRendererCapabilityDeclaration({
        ...renderer(),
        schemaVersion: "9.9.9"
      })
    ).toThrow(
      "schemaVersion must be"
    );

    expect(() =>
      parseRendererCapabilityDeclaration({
        ...renderer(),
        spectralCapability: "rgb"
      })
    ).toThrow(
      "spectralCapability is invalid"
    );

    expect(() =>
      parseRendererCapabilityDeclaration({
        ...renderer(),
        temporalSampling: {
          kind: "bounded",
          maximumSamples: 0
        }
      })
    ).toThrow(
      "maximumSamples must be a positive safe integer"
    );

    expect(() =>
      parseRendererCapabilityDeclaration({
        ...renderer(),
        temporalSampling: {
          kind: "magic"
        }
      })
    ).toThrow(
      "temporalSampling.kind is invalid"
    );

    expect(() =>
      parseRendererCapabilityDeclaration({
        ...renderer(),
        depthCapability: "per-pixel"
      })
    ).toThrow(
      "depthCapability is invalid"
    );

    expect(() =>
      parseRendererCapabilityDeclaration({
        ...renderer(),
        alphaRepresentation: "opaque"
      })
    ).toThrow(
      "alphaRepresentation is invalid"
    );

    expect(() =>
      parseRendererCapabilityDeclaration({
        ...renderer(),
        inverseFieldMapping: "yes"
      })
    ).toThrow(
      "inverseFieldMapping must be boolean"
    );

    expect(() =>
      parseRendererCapabilityDeclaration({
        ...renderer(),
        supportedEffects: [
          "illumination-vignetting",
          "illumination-vignetting"
        ]
      })
    ).toThrow(
      "duplicate effect IDs"
    );
  });

  it("covers fidelity schema and renderer-requirement guards", () => {
    expect(() =>
      parseImageFormationFidelityProfile({
        ...fidelity(),
        schemaVersion: "9.9.9"
      })
    ).toThrow(
      "schemaVersion must be"
    );

    expect(() =>
      parseImageFormationFidelityProfile({
        ...fidelity(),
        requiredEffects: null
      })
    ).toThrow(
      "requiredEffects must be an array"
    );

    expect(() =>
      parseImageFormationFidelityProfile({
        ...fidelity(),
        requiredEffects: [{
          effectId: "magic-effect",
          modelId: "x",
          modelVersion: "1"
        }]
      })
    ).toThrow(
      "effectId is not a declared"
    );

    expect(() =>
      parseImageFormationFidelityProfile({
        ...fidelity(),
        requiredStages: [
          "magic-stage"
        ]
      })
    ).toThrow(
      "not a declared image-formation stage"
    );

    expect(() =>
      parseImageFormationFidelityProfile({
        ...fidelity(),
        rendererRequirements: {
          spectral: "rgb",
          sensorDomainProcessing: false,
          depth: "none"
        }
      })
    ).toThrow(
      "rendererRequirements.spectral is invalid"
    );

    expect(() =>
      parseImageFormationFidelityProfile({
        ...fidelity(),
        rendererRequirements: {
          spectral: "wavelength-resolved",
          sensorDomainProcessing: "yes",
          depth: "none"
        }
      })
    ).toThrow(
      "sensorDomainProcessing must be boolean"
    );

    expect(() =>
      parseImageFormationFidelityProfile({
        ...fidelity(),
        rendererRequirements: {
          spectral: "wavelength-resolved",
          sensorDomainProcessing: false,
          depth: "world"
        }
      })
    ).toThrow(
      "rendererRequirements.depth is invalid"
    );
  });

  it("covers capture/prepared fingerprint and numeric guards", () => {
    expect(() =>
      parsePreparedImageFormationContext({
        ...prepared(),
        version: "9.9.9"
      })
    ).toThrow(
      "version must be"
    );

    const context = prepared();
    const withoutFingerprint:
      Record<string, unknown> = {
        ...context
      };
    delete withoutFingerprint.fingerprint;

    expect(() =>
      parsePreparedImageFormationContext(
        withoutFingerprint
      )
    ).toThrow(
      "fingerprint must be present"
    );

    expect(() =>
      createProductionCaptureSnapshot({
        ...captureInput(),
        sceneTimeSecondsFromExposureStart:
          -1
      })
    ).toThrow(
      "must be greater than or equal to zero"
    );

    expect(() =>
      createProductionCaptureSnapshot({
        ...captureInput(),
        stochasticSeedUint32:
          0x1_0000_0000
      })
    ).toThrow(
      "must be an unsigned 32-bit integer"
    );

    expect(() =>
      parseProductionCaptureSnapshot({
        ...capture(),
        version: "9.9.9"
      })
    ).toThrow(
      "version must be"
    );
  });

  it("blocks a required effect missing from renderer capability", () => {
    const context =
      prepared({
        rendererOverride: {
          supportedEffects: []
        }
      });

    const plan =
      createProductionImageFormationPlan({
        preparedContext: context,
        captureSnapshot: capture()
      });

    expect(plan.status).toBe("blocked");
    expect(plan.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code:
            "renderer-effect-unsupported",
          effectId:
            "illumination-vignetting"
        })
      ])
    );
  });

  it("allows an empty fidelity plan and leaves every stage/effect omitted", () => {
    const context =
      prepared({
        fidelityOverride: {
          requiredStages: [],
          requiredEffects: [],
          rendererRequirements: {
            spectral:
              "wavelength-independent-approximation",
            sensorDomainProcessing: false,
            depth: "none"
          }
        }
      });

    const plan =
      createProductionImageFormationPlan({
        preparedContext: context,
        captureSnapshot:
          capture({
            includePhysical: false
          })
      });

    expect(plan.status).toBe("ready");
    expect(
      plan.stagePlan.every(
        stage =>
          stage.state ===
          "omitted-by-fidelity"
      )
    ).toBe(true);
    expect(
      plan.effectPlan.every(
        effect =>
          effect.state ===
          "omitted-by-fidelity"
      )
    ).toBe(true);
    expect(
      plan.physicalSceneToSensorResult
    ).toBeUndefined();
  });

  it("rejects discrete selected-state drift and provider identity drift", () => {
    const badIso =
      createProductionCaptureSnapshot({
        ...captureInput(),
        exposure: {
          aperture: 4,
          shutterSeconds: 1 / 125,
          iso: 150
        }
      });

    expect(() =>
      createProductionImageFormationPlan({
        preparedContext: prepared(),
        captureSnapshot: badIso
      })
    ).toThrow(
      "not present in the prepared discrete equipment setting grid"
    );

    const input = captureInput();
    input.physicalSceneSample = {
      ...input.physicalSceneSample!,
      sceneRadianceRequest: {
        ...sceneRequest(),
        providerProfileId:
          "other-provider"
      },
      sceneRadianceResult: {
        ...sceneResult(),
        providerProfileId:
          "other-provider"
      }
    };
    const wrongProvider =
      createProductionCaptureSnapshot(
        input
      );

    expect(() =>
      createProductionImageFormationPlan({
        preparedContext: prepared(),
        captureSnapshot:
          wrongProvider
      })
    ).toThrow(
      "providerProfileId must match"
    );
  });

  it("blocks a downstream sensor stage rather than inventing a shortcut", () => {
    const context =
      prepared({
        rendererOverride: {
          supportedStages: [
            ...renderer().supportedStages,
            "field-wavelength-psf",
            "temporal-exposure-readout",
            "sensor-optical-stack",
            "photosite-cfa-sampling",
            "sensor-charge-statistics"
          ]
        },
        fidelityOverride: {
          requiredStages: [
            "sensor-charge-statistics"
          ],
          requiredEffects: []
        }
      });

    const plan =
      createProductionImageFormationPlan({
        preparedContext: context,
        captureSnapshot: capture()
      });

    expect(plan.status).toBe("blocked");
    expect(plan.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code:
            "engine-stage-not-composed",
          stageId:
            "sensor-charge-statistics"
        })
      ])
    );
  });
});

const temporalCapture = (
  options: {
    rotation?:
      | "active"
      | "zero"
      | "missing";
    readout?:
      | "rolling"
      | "global"
      | "missing";
    temporalSampleCount?: number;
  } = {}
): ProductionTemporalCaptureInput => {
  const rotation =
    options.rotation ??
    "active";
  const readout =
    options.readout ??
    "rolling";

  return {
    exposureWindowInput: {
      nativeRaster: {
        pixelWidth: 6000,
        pixelHeight: 4000
      },
      shutterMechanism:
        "electronic" as const,
      nominalExposureDurationSeconds: {
        value: 1 / 125,
        unit: "s" as const,
        evidence:
          evidence("exposure-duration")
      },
      opening: {
        kind: "simultaneous" as const
      },
      closing: {
        kind: "simultaneous" as const
      },
      samplePointsNative: [
        {
          x: 3000,
          y: 2000
        }
      ]
    },
    imagingArea: {
      widthMm: 36,
      heightMm: 24
    },
    orientation:
      "landscape" as const,
    ...(readout === "missing"
      ? {}
      : {
          readout:
            readout === "global"
              ? {
                  readoutMode:
                    "global" as const,
                  captureReadoutDurationSeconds:
                    {
                      value: 0.02,
                      unit: "s" as const,
                      evidence:
                        evidence("readout-duration")
                    }
                }
              : {
                  readoutMode:
                    "rolling" as const,
                  captureReadoutDurationSeconds:
                    {
                      value: 0.02,
                      unit: "s" as const,
                      evidence:
                        evidence("readout-duration")
                    },
                  scanDirectionNative: {
                    value:
                      "top-to-bottom" as const,
                    evidence:
                      evidence("readout-direction")
                  },
                  spatialSamplingSkewSeconds:
                    {
                      value: 0.01,
                      unit: "s" as const,
                      evidence:
                        evidence("readout-skew")
                    }
                }
        }),
    ...(rotation === "missing"
      ? {}
      : {
          rotation: {
            angularVelocityRadPerSec:
              rotation === "zero"
                ? {
                    pitch: 0,
                    yaw: 0,
                    roll: 0
                  }
                : {
                    pitch: 0,
                    yaw: 0.1,
                    roll: 0
                  },
            temporalSampleCount:
              options.temporalSampleCount ??
              4
          }
        })
  };
};

const temporalPrepared = (
  options: {
    maximumTemporalSamples?: number;
    includeRotationEffect?: boolean;
    includeReadoutEffect?: boolean;
  } = {}
): PreparedImageFormationContext => {
  const effects = [
    {
      effectId:
        "illumination-vignetting" as const,
      modelId: "generic-vignetting",
      modelVersion: "1.0.0"
    },
    ...(options.includeRotationEffect ===
    false
      ? []
      : [{
          effectId:
            "spatial-camera-rotation" as const,
          modelId:
            "pure-rotation-midpoint",
          modelVersion: "1.0.0"
        }]),
    ...(options.includeReadoutEffect ===
    false
      ? []
      : [{
          effectId:
            "rolling-readout" as const,
          modelId:
            "native-readout-schedule",
          modelVersion: "1.0.0"
        }])
  ];

  return prepared({
    rendererOverride: {
      supportedStages: [
        "scene-ray-projection",
        "scene-radiance-evaluation",
        "lens-field-pupil-evaluation",
        "field-wavelength-psf",
        "temporal-exposure-readout"
      ],
      supportedEffects: [
        "illumination-vignetting",
        "spatial-camera-rotation",
        "rolling-readout"
      ],
      temporalSampling: {
        kind: "bounded",
        maximumSamples:
          options
            .maximumTemporalSamples ??
          8
      }
    },
    fidelityOverride: {
      requiredStages: [
        "temporal-exposure-readout"
      ],
      requiredEffects:
        effects
    }
  });
};

describe("production temporal capture composition", () => {
  it("composes exposure windows, separate rolling readout timing, and rotation quadrature", () => {
    const snapshot =
      createProductionCaptureSnapshot({
        ...captureInput(),
        temporalCapture:
          temporalCapture()
      });

    const plan =
      createProductionImageFormationPlan({
        preparedContext:
          temporalPrepared(),
        captureSnapshot:
          snapshot
      });

    expect(
      plan.temporalCaptureResult
        ?.exposureTimeReference
    ).toBe(
      "first-opening-boundary-phase"
    );
    expect(
      plan.temporalCaptureResult
        ?.sensorReadoutTiming
        ?.readoutMode
    ).toBe("rolling");
    expect(
      plan.temporalCaptureResult
        ?.rotationQuadrature
        ?.temporalSampleCount
    ).toBe(4);
    expect(
      plan.temporalCaptureResult
        ?.readoutExposureSynchronization
    ).toBe("not-assumed");
    expect(
      plan.temporalCaptureResult
        ?.temporalRadianceIntegrated
    ).toBe(false);

    expect(
      plan.stagePlan.find(
        stage =>
          stage.stageId ===
          "temporal-exposure-readout"
      )?.state
    ).toBe("active");
    expect(
      plan.effectPlan.find(
        effect =>
          effect.effectId ===
          "spatial-camera-rotation"
      )?.state
    ).toBe("active");
    expect(
      plan.effectPlan.find(
        effect =>
          effect.effectId ===
          "rolling-readout"
      )?.state
    ).toBe("active");

    expect(
      plan.blockers
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code:
            "engine-stage-not-composed",
          stageId:
            "field-wavelength-psf"
        })
      ])
    );
  });

  it("preserves zero rotation and global readout as modeled-zero effects", () => {
    const snapshot =
      createProductionCaptureSnapshot({
        ...captureInput(),
        temporalCapture:
          temporalCapture({
            rotation: "zero",
            readout: "global"
          })
      });

    const plan =
      createProductionImageFormationPlan({
        preparedContext:
          temporalPrepared(),
        captureSnapshot:
          snapshot
      });

    expect(
      plan.effectPlan.find(
        effect =>
          effect.effectId ===
          "spatial-camera-rotation"
      )?.state
    ).toBe("modeled-zero");
    expect(
      plan.effectPlan.find(
        effect =>
          effect.effectId ===
          "rolling-readout"
      )?.state
    ).toBe("modeled-zero");
  });

  it("blocks insufficient renderer temporal sampling without changing committed quadrature", () => {
    const snapshot =
      createProductionCaptureSnapshot({
        ...captureInput(),
        temporalCapture:
          temporalCapture({
            temporalSampleCount: 6
          })
      });

    const plan =
      createProductionImageFormationPlan({
        preparedContext:
          temporalPrepared({
            maximumTemporalSamples: 4
          }),
        captureSnapshot:
          snapshot
      });

    expect(
      plan.blockers
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code:
            "renderer-temporal-sampling-insufficient",
          effectId:
            "spatial-camera-rotation"
        })
      ])
    );
    expect(
      plan.temporalCaptureResult
        ?.rotationQuadrature
        ?.temporalSampleCount
    ).toBe(6);
  });

  it("blocks missing rotation/readout models when those effects are requested", () => {
    const snapshot =
      createProductionCaptureSnapshot({
        ...captureInput(),
        temporalCapture:
          temporalCapture({
            rotation: "missing",
            readout: "missing"
          })
      });

    const plan =
      createProductionImageFormationPlan({
        preparedContext:
          temporalPrepared(),
        captureSnapshot:
          snapshot
      });

    const codes =
      new Set(
        plan.blockers.map(
          blocker =>
            blocker.code
        )
      );

    expect(
      codes.has(
        "missing-camera-rotation-model"
      )
    ).toBe(true);
    expect(
      codes.has(
        "missing-sensor-readout-timing"
      )
    ).toBe(true);
  });

  it("blocks the temporal stage when immutable temporal capture input is absent", () => {
    const plan =
      createProductionImageFormationPlan({
        preparedContext:
          temporalPrepared({
            includeRotationEffect:
              false,
            includeReadoutEffect:
              false
          }),
        captureSnapshot:
          capture()
      });

    expect(
      plan.blockers
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code:
            "missing-temporal-capture-input",
          stageId:
            "temporal-exposure-readout"
        })
      ])
    );
  });

  it("fails closed when temporal nominal duration drifts from committed shutter", () => {
    expect(() =>
      createProductionCaptureSnapshot({
        ...captureInput(),
        temporalCapture: {
          ...temporalCapture(),
          exposureWindowInput: {
            ...temporalCapture()
              .exposureWindowInput,
            nominalExposureDurationSeconds:
              {
                value: 1 / 60,
                unit: "s",
                evidence:
                  evidence("wrong-duration")
              }
          }
        }
      })
    ).toThrow(
      "must match exposure.shutterSeconds"
    );
  });
});

describe("production plan consumer manifests", () => {
  it("projects the same semantic plan to optimized and reference consumers without changing science", () => {
    const plan =
      createProductionImageFormationPlan({
        preparedContext:
          temporalPrepared(),
        captureSnapshot:
          createProductionCaptureSnapshot({
            ...captureInput(),
            temporalCapture:
              temporalCapture()
          })
      });

    const optimized =
      createProductionPlanConsumerManifest({
        plan,
        consumerKind:
          "interactive-optimized"
      });
    const reference =
      createProductionPlanConsumerManifest({
        plan,
        consumerKind:
          "reference"
      });

    expect(
      optimized.planFingerprint
    ).toBe(
      reference.planFingerprint
    );
    expect(
      optimized.activeOrModeledStages
    ).toEqual(
      reference.activeOrModeledStages
    );
    expect(
      optimized.activeOrModeledEffects
    ).toEqual(
      reference.activeOrModeledEffects
    );
    expect(
      optimized.temporalCaptureResult
    ).toEqual(
      reference.temporalCaptureResult
    );
    expect(
      optimized.physicalSceneToSensorResult
    ).toEqual(
      reference.physicalSceneToSensorResult
    );
    expect(
      optimized.stochastic
    ).toEqual(reference.stochastic);
    expect(
      optimized.scientificAssurance
    ).toEqual(
      reference.scientificAssurance
    );
    expect(
      optimized.scientificAssurance
    ).toEqual(
      plan.scientificAssurance
    );
    expect(
      optimized
        .consumerMayReduceCommittedTemporalSampleCount
    ).toBe(false);
    expect(
      reference
        .consumerMayChangeScientificInputs
    ).toBe(false);
  });

  it("preserves structured blockers in consumer views", () => {
    const plan =
      createProductionImageFormationPlan({
        preparedContext:
          temporalPrepared(),
        captureSnapshot:
          createProductionCaptureSnapshot({
            ...captureInput(),
            temporalCapture:
              temporalCapture()
          })
      });

    expect(plan.status).toBe(
      "blocked"
    );

    const manifest =
      createProductionPlanConsumerManifest({
        plan,
        consumerKind: "reference"
      });

    expect(manifest.planStatus)
      .toBe("blocked");
    expect(manifest.blockers)
      .toEqual(plan.blockers);
  });

  it("fails closed on an invalid consumer role", () => {
    const plan =
      createProductionImageFormationPlan({
        preparedContext:
          prepared(),
        captureSnapshot:
          capture()
      });

    expect(() =>
      createProductionPlanConsumerManifest({
        plan,
        consumerKind:
          "magic" as never
      })
    ).toThrow(
      "consumerKind is invalid"
    );
  });
});
