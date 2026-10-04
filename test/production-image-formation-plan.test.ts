import { correctionProfile as executedCorrectionProfile, state as executedCorrectionState } from "./optics-group-fixtures.js";
import { frameInput as environmentFrameInput, evaluator as environmentEvaluator } from "./helpers/environment-raw-fixture.js";
import { simulateEnvironmentSensorRawFrame } from "../src/index.js";
import { loadSensorRawFrameInput } from "./helpers/sensor-raw-frame-fixture.js";
import { loadPhotographicExportInput } from "./helpers/photographic-export-fixture.js";
import { describe, expect, it } from "vitest";

import {
  POC_SIMULATION_API_VERSION,
  RELEASE_SEQUENCE_VERSION,
  PRODUCTION_IMAGE_FORMATION_PLAN_VERSION,
  calculateIlluminationVignetting,
  createSimulatedCapture,
  createSensorRawFrame,
  resolveManualWhiteBalance,
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
      engineApi: "1.4.0",
      imageFormationContract:
        "0.4.0",
      plan: "0.7.0",
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
            "field-wavelength-psf",
          message:
            "Production plan schema " +
            PRODUCTION_IMAGE_FORMATION_PLAN_VERSION +
            " does not yet compose required stage field-wavelength-psf."
        }),
        expect.objectContaining({
          code:
            "engine-effect-not-composed",
          effectId:
            "non-circular-diffraction",
          message:
            "Production plan schema " +
            PRODUCTION_IMAGE_FORMATION_PLAN_VERSION +
            " does not yet compose required effect non-circular-diffraction."
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
      "captureSnapshot.outputStateId must match the prepared outputGeometryProfileId in plan schema " +
      PRODUCTION_IMAGE_FORMATION_PLAN_VERSION +
      "."
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


describe("committed processed RAW production stages", () => {
  function request(): Parameters<typeof createProductionImageFormationPlan>[0] & {processedOutput: NonNullable<Parameters<typeof createProductionImageFormationPlan>[0]["processedOutput"]>} {
    const {reconstruction,colorProfile,whiteBalance,rendering}=loadPhotographicExportInput(), c=reconstruction.rawFrame.capture;
    const captureSnapshot=createProductionCaptureSnapshot({captureId:c.captureId,releaseFrameId:"release-raw",
      sceneStateId:c.sceneStateId,sceneTimeSecondsFromExposureStart:c.sceneTimeSeconds,outputStateId:"output-v1",
      exposure:{aperture:c.exposure.aperture,shutterSeconds:c.exposure.shutterSeconds,iso:c.exposure.iso},stochasticSeedUint32:c.noise.seedUint32});
    return {preparedContext:prepared({rendererOverride:{supportedStages:getImageFormationContract().stages.map(s=>s.id)},
      fidelityOverride:{requiredStages:["display-processing"],requiredEffects:[]}}),captureSnapshot,
      processedOutput:{outputStateId:"output-v1",processing:{reconstruction,colorProfile,whiteBalance,rendering}}};
  }
  it("executes the authoritative four downstream stages and preserves missing upstream blockers", () => {
    const v=request(), plan=createProductionImageFormationPlan(v);
    for (const id of ["reconstruction","physical-orientation-transform","output-crop-resample","display-processing"]) {
      expect(plan.stagePlan.find(s=>s.stageId===id)?.state).toBe("active");
    }
    expect(plan.processedOutputResult?.value.source.value.rawFrame).toEqual(v.processedOutput.processing.reconstruction.rawFrame);
    expect(plan.blockers.some(b=>b.code==="engine-stage-not-composed" && b.stageId==="adc-quantization")).toBe(true);
    expect(plan.processedOutputResult?.value.colorProfile.profileId).toBe("owned-ideal-rgb-test");
    expect(plan.scientificAssurance?.components.some(c=>c.componentId==="processed-sensor-raw-sdr")).toBe(true);
    expect(Object.isFrozen(plan.processedOutputResult?.value.rendering.value.integerSamples)).toBe(true);
    const before=serializeProductionImageFormationPlan(plan);
    v.processedOutput.processing.rendering.renderingExposureEv=3;
    expect(serializeProductionImageFormationPlan(plan)).toBe(before);
    expect(createProductionImageFormationPlan(v).fingerprint.value).not.toBe(plan.fingerprint.value);
  });
  it.each(["output","capture","scene","time","seed","exposure"])("blocks %s state drift rather than executing an unrelated capture", kind => {
    const v=request();
    if(kind==="output") v.processedOutput.outputStateId="other";
    else {
      const s=v.captureSnapshot;
      v.captureSnapshot=createProductionCaptureSnapshot({captureId:kind==="capture" ? "other" : s.captureId,
        releaseFrameId:s.releaseFrameId,sceneStateId:kind==="scene" ? "other" : s.sceneStateId,
        sceneTimeSecondsFromExposureStart:s.sceneTimeSecondsFromExposureStart+(kind==="time" ? 1 : 0),
        outputStateId:s.outputStateId,exposure:{...s.exposure,iso:kind==="exposure" ? 200 : s.exposure.iso},
        stochasticSeedUint32:s.stochasticSeedUint32+(kind==="seed" ? 1 : 0)});
    }
    const plan=createProductionImageFormationPlan(v);
    expect(plan.processedOutputResult).toBeUndefined();
    expect(plan.blockers.some(b=>b.code==="processed-output-evaluation-blocked")).toBe(true);
    expect(plan.stagePlan.find(s=>s.stageId==="display-processing")?.state).toBe("unsupported");
  });
  it("binds resolved WB gains and blocks a second state with the same identity but different gains", () => {
    const v=request(), raw=loadSensorRawFrameInput(), c=v.processedOutput.processing.reconstruction.rawFrame.capture;
    const {schemaVersion:_s,engineApiVersion:_e,resolvedGeometry:_g,equivalentFocalLength35Mm:_f,...ci}=c;
    void _s;void _e;void _g;void _f;
    const wb=resolveManualWhiteBalance({stateId:"wb",channelGains:{red:2,green:1,blue:.5}});
    raw.capture=createSimulatedCapture({...ci,whiteBalanceIntent:{stateId:wb.stateId,source:wb.source,locked:wb.locked,
      channelGains:wb.channelGains,sourceProfile:null},planes:ci.planes.map(p=>({...p,whiteBalanceApplication:"intent-only"}))}).value;
    v.processedOutput.processing.reconstruction.rawFrame=createSensorRawFrame(raw);
    v.processedOutput.processing.whiteBalance="apply-resolved-sensor-gains";
    const s=v.captureSnapshot;
    const snapshotInput={captureId:s.captureId,releaseFrameId:s.releaseFrameId,sceneStateId:s.sceneStateId,
      sceneTimeSecondsFromExposureStart:s.sceneTimeSecondsFromExposureStart,outputStateId:s.outputStateId,
      exposure:s.exposure,stochasticSeedUint32:s.stochasticSeedUint32};
    v.captureSnapshot=createProductionCaptureSnapshot({...snapshotInput,whiteBalanceState:wb});
    expect(createProductionImageFormationPlan(v).processedOutputResult?.value.whiteBalance).toBe("applied-here");
    v.captureSnapshot=createProductionCaptureSnapshot({...snapshotInput,whiteBalanceState:
      resolveManualWhiteBalance({stateId:"wb",channelGains:{red:1,green:1,blue:1}})});
    const blocked=createProductionImageFormationPlan(v);
    expect(blocked.processedOutputResult).toBeUndefined();
    expect(blocked.blockers.some(b=>b.code==="processed-output-evaluation-blocked")).toBe(true);
  });
  it("binds attached RAW focus to an available committed release frame", () => {
    const v=request(), s=v.captureSnapshot, focus=v.processedOutput.processing.reconstruction.rawFrame.capture.focus;
    const snapshotInput={captureId:s.captureId,releaseFrameId:s.releaseFrameId,sceneStateId:s.sceneStateId,
      sceneTimeSecondsFromExposureStart:s.sceneTimeSecondsFromExposureStart,outputStateId:s.outputStateId,
      exposure:s.exposure,stochasticSeedUint32:s.stochasticSeedUint32,
      releaseFrameBinding:{releaseSequenceVersion:RELEASE_SEQUENCE_VERSION,sequenceId:"sequence",releaseFrameId:s.releaseFrameId,
        frameIndex:0,exposure:s.exposure,stochasticSeedUint32:s.stochasticSeedUint32,exposureStartTimeSeconds:0,
        exposureEndTimeSeconds:s.exposure.shutterSeconds,sceneTimeSecondsFromSequenceStart:0,startIntervalFromPreviousSeconds:null,
        timingConstraints:[],focus,automation:{ae:"locked" as const,af:"locked" as const,awb:"locked" as const}}};
    v.captureSnapshot=createProductionCaptureSnapshot(snapshotInput);
    expect(createProductionImageFormationPlan(v).processedOutputResult).toBeDefined();
    v.captureSnapshot=createProductionCaptureSnapshot({...snapshotInput,
      releaseFrameBinding:{...snapshotInput.releaseFrameBinding,focus:{kind:"infinity"}}});
    const blocked=createProductionImageFormationPlan(v);
    expect(blocked.processedOutputResult).toBeUndefined();
    expect(blocked.blockers.some(b=>b.message.includes("focus differs"))).toBe(true);
  });
  it("blocks an undeclared renderer stage even when attached RAW processing succeeds", () => {
    const v=request();
    v.preparedContext=prepared({rendererOverride:{supportedStages:getImageFormationContract().stages.map(s=>s.id).filter(id=>id!=="display-processing")},
      fidelityOverride:{requiredStages:["display-processing"],requiredEffects:[]}});
    const plan=createProductionImageFormationPlan(v);
    expect(plan.processedOutputResult).toBeDefined();
    expect(plan.stagePlan.find(s=>s.stageId==="display-processing")?.state).toBe("blocked");
    expect(plan.blockers.some(b=>b.code==="renderer-stage-unsupported" && b.stageId==="display-processing")).toBe(true);
  });
  it("requires renderer declarations and preserves the legacy no-attachment blocker", () => {
    const v=request();
    const legacy=createProductionImageFormationPlan({preparedContext:v.preparedContext,captureSnapshot:v.captureSnapshot});
    expect(legacy.processedOutputResult).toBeUndefined();
    expect(legacy.stagePlan.find(s=>s.stageId==="display-processing")?.state).toBe("unsupported");
    v.preparedContext=prepared({rendererOverride:{sensorDomainProcessing:false},
      fidelityOverride:{requiredStages:["display-processing"],requiredEffects:[]}});
    const blocked=createProductionImageFormationPlan(v);
    expect(blocked.processedOutputResult).toBeUndefined();
    expect(blocked.blockers.some(b=>b.code==="processed-output-evaluation-blocked")).toBe(true);
  });
});


describe("executed environment production graph", () => {
  function request(rolling = false, psf = true): Parameters<typeof createProductionImageFormationPlan>[0] & { environmentCapture: Required<NonNullable<Parameters<typeof createProductionImageFormationPlan>[0]["environmentCapture"]>> } {
    const {evaluateRadiance,...captureData} = environmentFrameInput(rolling, psf);
    const capture = {...structuredClone(captureData),evaluateRadiance}, c = capture.frame.capture, e = capture.sites[0]!.environment;
    const base = prepared({rendererOverride:{supportedStages:getImageFormationContract().stages.map(s=>s.id),
      temporalSampling:{kind:"bounded",maximumSamples:256}},
      fidelityOverride:{requiredStages:["display-processing"],requiredEffects:[]}});
    const preparedContext = prepareImageFormationContext({...base, sceneId:e.sceneBindings.providerProfile.sceneId,
      sceneRadianceProviderProfileId:e.sceneBindings.providerProfile.profileId,opticalBridgeProfile:e.optics.profile});
    const captureSnapshot = createProductionCaptureSnapshot({captureId:c.captureId,releaseFrameId:"release-environment",
      sceneStateId:c.sceneStateId,sceneTimeSecondsFromExposureStart:c.sceneTimeSeconds,outputStateId:"output-v1",
      exposure:c.exposure,stochasticSeedUint32:c.noise.seedUint32,
      temporalCapture:{exposureWindowInput:{...capture.exposureWindow,nativeRaster:c.geometry.nativeRaster,
        samplePointsNative:capture.sites.map((_,i)=>({x:i%2+.5,y:Math.floor(i/2)+.5}))},
        imagingArea:c.geometry.imagingArea,orientation:c.geometry.orientation,
        rotation:{angularVelocityRadPerSec:e.motion.angularVelocityRadPerSec,temporalSampleCount:e.temporalSampleCount,
          ...(c.focus.kind === "finite" ? {focusDistanceM:c.focus.distanceM} : {})}}});
    const {reconstruction,colorProfile,whiteBalance,rendering}=loadPhotographicExportInput();
    const {rawFrame:_,...policy}=reconstruction;void _;
    return {preparedContext,captureSnapshot,environmentCapture:{capture,
      processing:{reconstruction:policy,colorProfile,whiteBalance,rendering}}};
  }
  it.each([[false,false],[false,true],[true,false],[true,true]])("executes the complete authoritative graph and preserves replay (rolling=%s psf=%s)",(rolling,psf)=>{
    const v=request(rolling,psf), raw=simulateEnvironmentSensorRawFrame(v.environmentCapture.capture);
    const plan=createProductionImageFormationPlan(v);
    expect(plan.blockers).toEqual([]);
    expect(plan.status).toBe("ready");
    expect(plan.stagePlan.filter(s=>s.state==="active" || s.state==="modeled-zero")).toHaveLength(14);
    expect(plan.stagePlan.find(s=>s.stageId==="field-wavelength-psf")?.state).toBe(psf ? "active" : "modeled-zero");
    expect(plan.environmentCaptureResult).toEqual(raw);
    expect(plan.processedOutputResult?.value.source.value.rawFrame).toEqual(raw.value.raw.value.frame);
    expect(plan.environmentCaptureResult?.value.providerTransportVerified).toBe(false);
    expect(plan.environmentCaptureResult?.value.raw.value.upstreamRadiometryVerified).toBe(false);
    expect(Object.isFrozen(plan.environmentCaptureResult?.value.sites)).toBe(true);
    expect(createProductionImageFormationPlan(v)).toEqual(plan);
    expect(plan.scientificAssurance).toBeDefined();
    for(const kind of ["reference","interactive-optimized"] as const){
      const manifest=createProductionPlanConsumerManifest({plan,consumerKind:kind});
      expect(manifest.activeOrModeledStages).toHaveLength(14);
      expect(manifest.environmentCaptureResult).toBe(plan.environmentCaptureResult);
      expect(manifest.processedOutputResult).toBe(plan.processedOutputResult);
      expect(manifest.planFingerprint).toBe(plan.fingerprint.value);
    }
    v.environmentCapture.capture.evaluateRadiance=(q): SceneRadianceEvaluationResult=>environmentEvaluator(q,2e-9);
    expect(createProductionImageFormationPlan(v).fingerprint.value).not.toBe(plan.fingerprint.value);
  });
  it.each(["scene","provider","optics","seed","capture","exposure","motion","time-count","renderer-stage","renderer-temporal","geometry","schedule","focus","external-raw","effect"])("rejects mismatched %s before source callbacks",fault=>{
    const v=request(), e=v.environmentCapture.capture.sites[0]!.environment;
    let calls=0;v.environmentCapture.capture.evaluateRadiance=(q): SceneRadianceEvaluationResult=>{calls++;return environmentEvaluator(q,1e-9);};
    if(fault==="scene")v.preparedContext=prepareImageFormationContext({...v.preparedContext,sceneId:"other"});
    if(fault==="provider")v.preparedContext=prepareImageFormationContext({...v.preparedContext,sceneRadianceProviderProfileId:"other"});
    if(fault==="optics")e.optics.profile.profileVersion="stale";
    if(fault==="seed")v.environmentCapture.capture.frame.capture.noise.seedUint32++;
    if(fault==="capture")v.environmentCapture.capture.frame.capture.captureId="other";
    if(fault==="exposure")v.environmentCapture.capture.frame.capture.exposure.iso=200;
    if(fault==="motion")e.motion.angularVelocityRadPerSec.yaw=9;
    if(fault==="time-count")e.temporalSampleCount=1;
    if(fault==="renderer-stage")v.preparedContext=prepareImageFormationContext({...v.preparedContext,renderer:{...v.preparedContext.renderer,
      supportedStages:v.preparedContext.renderer.supportedStages.filter(s=>s!=="adc-quantization")}});
    if(fault==="renderer-temporal")v.preparedContext=prepareImageFormationContext({...v.preparedContext,renderer:{...v.preparedContext.renderer,temporalSampling:{kind:"bounded",maximumSamples:1}}});
    if(fault==="geometry")v.captureSnapshot=createProductionCaptureSnapshot({...v.captureSnapshot,temporalCapture:{...v.captureSnapshot.temporalCapture!,orientation:"portrait-clockwise"}});
    if(fault==="schedule")v.captureSnapshot=createProductionCaptureSnapshot({...v.captureSnapshot,temporalCapture:{...v.captureSnapshot.temporalCapture!,exposureWindowInput:{...v.captureSnapshot.temporalCapture!.exposureWindowInput,shutterMechanism:"mechanical"}}});
    if(fault==="focus")v.captureSnapshot=createProductionCaptureSnapshot({...v.captureSnapshot,temporalCapture:{...v.captureSnapshot.temporalCapture!,rotation:{...v.captureSnapshot.temporalCapture!.rotation!,focusDistanceM:10}}});
    if(fault==="effect")v.preparedContext=prepareImageFormationContext({...v.preparedContext,fidelity:{...v.preparedContext.fidelity,requiredEffects:[{effectId:"field-curvature",modelId:"unimplemented",modelVersion:"1"}]}});
    const supplied=fault==="external-raw" ? {...v,processedOutput:{outputStateId:"output-v1",processing:loadPhotographicExportInput()}} : v;
    const plan=createProductionImageFormationPlan(supplied);
    expect(plan.status).toBe("blocked");expect(plan.environmentCaptureResult).toBeUndefined();expect(calls).toBe(0);
    expect(plan.blockers.some(b=>b.code==="environment-capture-evaluation-blocked")).toBe(true);
  });
  it.each(["landscape","portrait-clockwise","landscape-inverted","portrait-counter-clockwise"] as const)("keeps exact realized native codes through %s and an output crop",orientation=>{
    const v=request(), old=v.environmentCapture.capture.frame.capture;
    const {schemaVersion:_s,engineApiVersion:_e,resolvedGeometry:_g,equivalentFocalLength35Mm:_f,...captureInput}=old;
    void _s;void _e;void _g;void _f;
    const capture=createSimulatedCapture({...captureInput,geometry:{...old.geometry,orientation,
      outputCropRect:{x:0,y:0,width:1,height:2},outputRaster:{pixelWidth:1,pixelHeight:2}},
      planes:old.planes.map(p=>({...p,rasterBinding:"oriented-active-capture" as const}))}).value;
    v.environmentCapture.capture.frame.capture=capture;
    v.captureSnapshot=createProductionCaptureSnapshot({...v.captureSnapshot,temporalCapture:{...v.captureSnapshot.temporalCapture!,orientation}});
    const plan=createProductionImageFormationPlan(v);
    expect(plan.blockers).toEqual([]);
    expect(plan.processedOutputResult?.value.source.value.rawFrame.samples).toEqual(plan.environmentCaptureResult?.value.raw.value.frame.samples);
    expect(plan.processedOutputResult?.value.rendering.value.integerSamples).toHaveLength(6);
    expect(plan.processedOutputResult?.value.processedOutputView).toMatchObject({pixelWidth:1,pixelHeight:2});
  });
  it("rejects incompatible output resampling without claiming a ready graph",()=>{
    const v=request(), old=v.environmentCapture.capture.frame.capture;
    const {schemaVersion:_s,engineApiVersion:_e,resolvedGeometry:_g,equivalentFocalLength35Mm:_f,...captureInput}=old;
    void _s;void _e;void _g;void _f;
    v.environmentCapture.capture.frame.capture=createSimulatedCapture({...captureInput,geometry:{...old.geometry,
      outputRaster:{pixelWidth:4,pixelHeight:4}},planes:old.planes.map(p=>({...p,rasterBinding:"oriented-active-capture" as const}))}).value;
    const plan=createProductionImageFormationPlan(v);
    expect(plan.status).toBe("blocked");
    expect(plan.processedOutputResult).toBeUndefined();
    expect(plan.blockers.some(b=>b.code==="environment-capture-evaluation-blocked")).toBe(true);
  });
  it("applies committed WB once and selected native correction without changing realized RAW",()=>{
    const v=request(), old=v.environmentCapture.capture.frame.capture;
    const {schemaVersion:_s,engineApiVersion:_e,resolvedGeometry:_g,equivalentFocalLength35Mm:_f,...captureInput}=old;
    void _s;void _e;void _g;void _f;
    const wb=resolveManualWhiteBalance({stateId:"executed-wb",channelGains:{red:2,green:1,blue:.5}});
    const capture=createSimulatedCapture({...captureInput,geometry:{...old.geometry,imagingArea:{widthMm:36,heightMm:36}},whiteBalanceIntent:{stateId:wb.stateId,source:wb.source,locked:wb.locked,
      channelGains:wb.channelGains,sourceProfile:null},planes:old.planes.map(p=>({...p,whiteBalanceApplication:"intent-only"}))}).value;
    v.environmentCapture.capture.frame.capture=capture;
    for (const site of v.environmentCapture.capture.sites) {
      const spatial=site.environment.sensor.spatialSampling;
      spatial.imagingArea=capture.geometry.imagingArea;
      spatial.samplingApertureProfile.siteCenterLattice={...spatial.samplingApertureProfile.siteCenterLattice,
        pitchYMicrometers:18000,firstSiteCenterFromImagingAreaTopLeftMicrometers:{x:9000,y:9000}};
    }
    v.captureSnapshot=createProductionCaptureSnapshot({...v.captureSnapshot,whiteBalanceState:wb,
      temporalCapture:{...v.captureSnapshot.temporalCapture!,imagingArea:capture.geometry.imagingArea}});
    v.environmentCapture.processing.whiteBalance="apply-resolved-sensor-gains";
    const plain=createProductionImageFormationPlan(v);
    const state={...executedCorrectionState,focalLengthMm:capture.exposure.focalLengthMm,aperture:capture.exposure.aperture,
      focusDistanceM:capture.focus.kind === "finite" ? capture.focus.distanceM : 3,outputWidth:2,outputHeight:2};
    v.environmentCapture.processing.correction={profile:{...executedCorrectionProfile,state,components:executedCorrectionProfile.components.map(c=>
      c.kind === "peripheral-illumination" ? {...c,profile:{...c.profile,normalizationRadiusMm:30,maximumNormalizedRadius:1}} : c)},
      state,coordinateFrame:"native-optical-linear-srgb-d65",selections:{geometry:"on",gain:"on"},selectionKind:"camera-selectable",frameTimeSeconds:0,
      resampler:{id:"executed-linear",version:"1",filter:"bilinear",antialias:"none"},clippingLevel:10,invalidSupport:"reject",outputImageStateId:"executed-correction"};
    const corrected=createProductionImageFormationPlan(v);
    expect(plain.blockers).toEqual([]);expect(corrected.blockers).toEqual([]);
    expect(corrected.environmentCaptureResult).toEqual(plain.environmentCaptureResult);
    expect(corrected.processedOutputResult?.value.whiteBalance).toBe("applied-here");
    expect(corrected.processedOutputResult?.value.correction).not.toBeNull();
    expect(corrected.processedOutputResult?.value.source.value.rawFrame.samples).toEqual(plain.environmentCaptureResult?.value.raw.value.frame.samples);
    expect(corrected.fingerprint.value).not.toBe(plain.fingerprint.value);
  });
  it("owns downstream policy against a provider mutating the caller and preserves RAW on rendering changes",()=>{
    const v=request(), expected=createProductionImageFormationPlan(v);
    v.environmentCapture.capture.evaluateRadiance=(q): SceneRadianceEvaluationResult=>{
      v.environmentCapture.processing.rendering.renderingExposureEv=9;
      v.environmentCapture.capture.sites[0]!.environment.optics.focalLengthMm=999;
      return environmentEvaluator(q,1e-9);
    };
    expect(createProductionImageFormationPlan(v)).toEqual(expected);
    const brighter=request();brighter.environmentCapture.processing.rendering.renderingExposureEv=3;
    const changed=createProductionImageFormationPlan(brighter);
    expect(changed.environmentCaptureResult).toEqual(expected.environmentCaptureResult);
    expect(changed.fingerprint.value).not.toBe(expected.fingerprint.value);
  });
});
