import { describe, expect, it } from "vitest";

import {
  calculateCaptureTranslationParallaxTemporalQuadrature,
  createSceneRadianceTemporalSamplingPlan,
  parseCaptureModeProfile,
  parseCaptureModeTimingProfile,
  reduceSceneRadianceTemporalSamples,
  resolveCaptureMode,
  resolveCaptureModeTiming,
  type CaptureModeTimingProfile,
  type ResolvedCaptureMode,
  type ResolvedCaptureModeTiming,
  type SceneRadianceEvaluationResult,
  type SceneRadianceTemporalSamplingNode
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

const nativeRaster = {
  pixelWidth: 100,
  pixelHeight: 50
};

const captureMode = (): ResolvedCaptureMode =>
  resolveCaptureMode({
    nativeRaster,
    profile: parseCaptureModeProfile({
      schemaVersion: "0.1.0",
      modes: [{
        modeId: "full-res",
        evidence: evidence("mode"),
        acquisition: {
          kind: "single-frame"
        },
        perFrameSampling: {
          kind:
            "native-effective-raster"
        },
        processedImageRaster: {
          value: nativeRaster,
          evidence:
            evidence("processed-raster")
        },
        dependencies: [
          "mode-specific-readout-timing"
        ]
      }]
    }),
    modeId: "full-res"
  });

const rollingProfile = (): CaptureModeTimingProfile =>
  parseCaptureModeTimingProfile({
    schemaVersion: "0.1.0",
    profileId: "timing-rolling",
    profileVersion: "1.0.0",
    captureModeId: "full-res",
    scientificStatus: "approximation",
    scheduleFamily:
      "global-or-uniform-linear-native-scan",
    shutterMechanism: "electronic",
    opening: {
      kind:
        "uniform-linear-native-scan",
      directionNative: {
        value: "top-to-bottom",
        evidence: evidence("open-direction")
      },
      traversalDurationSeconds: {
        value: 0.01,
        unit: "s",
        evidence: evidence("open-time")
      }
    },
    closing: {
      kind:
        "uniform-linear-native-scan",
      directionNative: {
        value: "top-to-bottom",
        evidence: evidence("close-direction")
      },
      traversalDurationSeconds: {
        value: 0.01,
        unit: "s",
        evidence: evidence("close-time")
      }
    },
    readout: {
      readoutMode: "rolling",
      captureReadoutDurationSeconds: {
        value: 0.02,
        unit: "s",
        evidence: evidence("readout-duration")
      },
      scanDirectionNative: {
        value: "top-to-bottom",
        evidence: evidence("readout-direction")
      },
      spatialSamplingSkewSeconds: {
        value: 0.012,
        unit: "s",
        evidence: evidence("readout-skew")
      }
    },
    nonUniformScheduleModeled: false,
    evidence: evidence("timing-profile"),
    limitations: [
      "Uniform-linear test timing."
    ]
  });

const globalProfile = (): CaptureModeTimingProfile =>
  parseCaptureModeTimingProfile({
    schemaVersion: "0.1.0",
    profileId: "timing-global",
    profileVersion: "1.0.0",
    captureModeId: "full-res",
    scientificStatus: "approximation",
    scheduleFamily:
      "global-or-uniform-linear-native-scan",
    shutterMechanism: "electronic",
    opening: {
      kind: "simultaneous"
    },
    closing: {
      kind: "simultaneous"
    },
    readout: {
      readoutMode: "global",
      captureReadoutDurationSeconds: {
        value: 0.02,
        unit: "s",
        evidence: evidence("global-readout")
      }
    },
    nonUniformScheduleModeled: false,
    evidence: evidence("global-timing"),
    limitations: []
  });

const resolveTiming = (
  profile:
    CaptureModeTimingProfile,
  samplePointsNative:
    readonly {
      x: number;
      y: number;
    }[]
): ResolvedCaptureModeTiming =>
  resolveCaptureModeTiming({
    captureMode: captureMode(),
    timingProfile: profile,
    nominalExposureDurationSeconds: {
      value: 0.02,
      unit: "s",
      evidence:
        evidence("exposure-duration")
    },
    samplePointsNative
  });

const centerPoint = {
  x: 50,
  y: 25
};

describe("capture-mode timing binding", () => {
  it("binds rolling exposure/readout facts to one exact capture mode/profile identity", () => {
    const timing =
      resolveTiming(
        rollingProfile(),
        [
          { x: 50, y: 0 },
          { x: 50, y: 50 }
        ]
      );

    expect(timing).toMatchObject({
      timingProfileId:
        "timing-rolling",
      timingProfileVersion: "1.0.0",
      captureModeId: "full-res",
      captureModeTimingIdentity:
        "exact-mode-and-profile",
      modeDeclaresTimingDependency:
        true,
      timeReference:
        "first-opening-boundary-phase",
      readoutExposureSynchronization:
        "not-assumed",
      nonUniformScheduleModeled:
        false
    });

    expect(
      timing.exposureWindows
        .samples[0]
        ?.startOffsetSecondsFromOpeningReference
    ).toBeCloseTo(0, 12);
    expect(
      timing.exposureWindows
        .samples[1]
        ?.startOffsetSecondsFromOpeningReference
    ).toBeCloseTo(0.01, 12);
    expect(
      timing.exposureWindows
        .samples[0]
        ?.localExposureDurationSeconds
    ).toBeCloseTo(0.02, 12);
    expect(
      timing.exposureWindows
        .samples[1]
        ?.localExposureDurationSeconds
    ).toBeCloseTo(0.02, 12);

    expect(
      timing.readoutTiming
        .samples[0]
        ?.readoutPhaseOffsetSeconds
    ).toBeCloseTo(0, 12);
    expect(
      timing.readoutTiming
        .samples[1]
        ?.readoutPhaseOffsetSeconds
    ).toBeCloseTo(0.012, 12);
  });

  it("keeps global exposure timing simultaneous without inferring readout/exposure synchronization", () => {
    const timing =
      resolveTiming(
        globalProfile(),
        [
          { x: 50, y: 0 },
          { x: 50, y: 50 }
        ]
      );

    expect(
      timing.exposureWindows.samples.map(
        (sample) =>
          sample
            .startOffsetSecondsFromOpeningReference
      )
    ).toEqual([0, 0]);
    expect(
      timing.readoutTiming.samples.map(
        (sample) =>
          sample
            .readoutPhaseOffsetSeconds
      )
    ).toEqual([0, 0]);
    expect(
      timing.readoutExposureSynchronization
    ).toBe("not-assumed");
  });

  it("fails closed on capture-mode drift and unsupported/non-uniform timing families", () => {
    expect(() =>
      resolveCaptureModeTiming({
        captureMode: captureMode(),
        timingProfile:
          parseCaptureModeTimingProfile({
            ...rollingProfile(),
            captureModeId:
              "different-mode"
          }),
        nominalExposureDurationSeconds: {
          value: 0.02,
          unit: "s",
          evidence: evidence("duration")
        }
      })
    ).toThrow(
      "captureModeId must exactly match"
    );

    expect(() =>
      parseCaptureModeTimingProfile({
        ...rollingProfile(),
        scheduleFamily:
          "segmented-readout"
      })
    ).toThrow(
      "unsupported schedule families fail closed"
    );

    expect(() =>
      parseCaptureModeTimingProfile({
        ...rollingProfile(),
        opening: {
          kind: "piecewise-lines"
        }
      })
    ).toThrow(
      "non-uniform schedules are not modeled"
    );
  });
});

describe("depth-dependent translation/parallax temporal geometry", () => {
  const timing = (): ResolvedCaptureModeTiming =>
    resolveTiming(
      rollingProfile(),
      [centerPoint]
    );

  it("moves a nearer point farther on the image plane under the same camera translation", () => {
    const result =
      calculateCaptureTranslationParallaxTemporalQuadrature({
        timing: timing(),
        imagingArea: {
          widthMm: 36,
          heightMm: 24
        },
        focalLengthMm: 50,
        focusDistanceM: 5,
        orientation: "landscape",
        cameraTranslationVelocityMps: {
          x: 1,
          y: 0,
          z: 0
        },
        temporalSampleCount: 2,
        sceneSamples: [
          {
            sampleId: "near",
            destinationPointNative:
              centerPoint,
            positionCameraM: {
              x: 0,
              y: 0,
              z: 5
            }
          },
          {
            sampleId: "far",
            destinationPointNative:
              centerPoint,
            positionCameraM: {
              x: 0,
              y: 0,
              z: 10
            }
          }
        ]
      }).value;

    const near =
      result.samples[0]!
        .nodes[1]!
        .deltaFromReferenceImagePlaneMm
        .distance;
    const far =
      result.samples[1]!
        .nodes[1]!
        .deltaFromReferenceImagePlaneMm
        .distance;

    expect(near)
      .toBeGreaterThan(far);
    expect(result.metricSceneDepthRequired)
      .toBe(true);
    expect(
      result.oneGlobalHomographyAuthorized
    ).toBe(false);
  });

  it("keeps translation physics invariant while rotating the reported sample vector with orientation", () => {
    const common = {
      timing: timing(),
      imagingArea: {
        widthMm: 36,
        heightMm: 24
      },
      focalLengthMm: 50,
      cameraTranslationVelocityMps: {
        x: 1,
        y: 0,
        z: 0
      },
      temporalSampleCount: 1,
      sceneSamples: [{
        sampleId: "point",
        destinationPointNative:
          centerPoint,
        positionCameraM: {
          x: 0,
          y: 0,
          z: 5
        }
      }]
    };

    const landscape =
      calculateCaptureTranslationParallaxTemporalQuadrature({
        ...common,
        orientation: "landscape"
      }).value;
    const portrait =
      calculateCaptureTranslationParallaxTemporalQuadrature({
        ...common,
        orientation:
          "portrait-clockwise"
      }).value;

    expect(
      portrait.samples[0]!
        .nodes[0]!
        .deltaFromReferenceImagePlaneMm
    ).toEqual(
      landscape.samples[0]!
        .nodes[0]!
        .deltaFromReferenceImagePlaneMm
    );
    expect(
      portrait.samples[0]!
        .nodes[0]!
        .deltaOrientedSamples
        .distance
    ).toBeCloseTo(
      landscape.samples[0]!
        .nodes[0]!
        .deltaOrientedSamples
        .distance,
      12
    );
    expect(
      portrait.samples[0]!
        .nodes[0]!
        .deltaOrientedSamples
    ).not.toEqual(
      landscape.samples[0]!
        .nodes[0]!
        .deltaOrientedSamples
    );
  });

  it("lets explicit subject translation coexist with camera translation without reclassifying either", () => {
    const result =
      calculateCaptureTranslationParallaxTemporalQuadrature({
        timing: timing(),
        imagingArea: {
          widthMm: 36,
          heightMm: 24
        },
        focalLengthMm: 50,
        orientation: "landscape",
        cameraTranslationVelocityMps: {
          x: 1,
          y: 0,
          z: 0
        },
        temporalSampleCount: 2,
        sceneSamples: [{
          sampleId: "co-moving",
          destinationPointNative:
            centerPoint,
          positionCameraM: {
            x: 0,
            y: 0,
            z: 5
          },
          subjectVelocityMps: {
            x: 1,
            y: 0,
            z: 0
          }
        }]
      }).value;

    for (
      const node of
      result.samples[0]!.nodes
    ) {
      expect(
        node
          .deltaFromReferenceImagePlaneMm
          .distance
      ).toBe(0);
    }
    expect(
      result.relativeMotionComposition
    ).toBe(
      "subject-minus-camera-translation"
    );
  });

  it("fails closed when relative translation reaches the camera plane", () => {
    expect(() =>
      calculateCaptureTranslationParallaxTemporalQuadrature({
        timing: timing(),
        imagingArea: {
          widthMm: 36,
          heightMm: 24
        },
        focalLengthMm: 50,
        orientation: "landscape",
        cameraTranslationVelocityMps: {
          x: 0,
          y: 0,
          z: 1000
        },
        temporalSampleCount: 2,
        sceneSamples: [{
          sampleId: "cross",
          destinationPointNative:
            centerPoint,
          positionCameraM: {
            x: 0,
            y: 0,
            z: 0.01
          }
        }]
      })
    ).toThrow(
      "must remain in front of the camera plane"
    );
  });
});

describe("temporal scene-radiance sampling on the authoritative exposure clock", () => {
  const timing = (): ResolvedCaptureModeTiming =>
    resolveTiming(
      rollingProfile(),
      [{ x: 50, y: 50 }]
    );

  const plan = (): ReturnType<typeof createSceneRadianceTemporalSamplingPlan> =>
    createSceneRadianceTemporalSamplingPlan({
      planId: "radiance-plan",
      timing: timing(),
      destinationPointNative: {
        x: 50,
        y: 50
      },
      temporalSampleCount: 2,
      query: {
        providerProfileId:
          "provider",
        sceneId: "scene",
        illuminationProfileId:
          "illumination",
        materialResponseProfileId:
          "material",
        target: {
          kind:
            "environment-direction",
          outgoingDirectionUnitVector: {
            x: 0,
            y: 0,
            z: 1
          }
        },
        wavelengthNanometers: 550,
        wavelengthBasis: "air"
      }
    });

  const resultFor = (
    node:
      SceneRadianceTemporalSamplingNode,
    value: number
  ): SceneRadianceEvaluationResult => ({
    schemaVersion: "0.1.0",
    sampleId:
      node.expectedResultSampleId,
    providerProfileId:
      "provider",
    sceneId: "scene",
    wavelengthNanometers: 550,
    wavelengthBasis: "air",
    quantity:
      "outgoing-spectral-radiance",
    unit: "W/m^2/sr/nm",
    spectralRadianceWattsPerSquareMeterSteradianNanometer:
      value,
    scientificStatus:
      "approximation",
    uncertainty: {
      kind: "not-quantified",
      limitation: "test"
    },
    evidence:
      evidence("radiance"),
    limitations: []
  });

  it("places provider evaluation nodes inside the rolling local exposure window and reduces returned radiance", () => {
    const samplingPlan =
      plan();

    expect(
      samplingPlan
        .localExposureWindow
        .startSecondsFromCaptureReference
    ).toBeCloseTo(0.01, 12);
    expect(
      samplingPlan.nodes.map(
        (node) =>
          node
            .captureTimeSecondsFromReference
      )
    ).toEqual([
      0.015,
      0.025
    ]);
    expect(
      samplingPlan
        .sensorReadoutTimingUsedAsExposureTiming
    ).toBe(false);

    const reduced =
      reduceSceneRadianceTemporalSamples({
        plan: samplingPlan,
        samples:
          samplingPlan.nodes.map(
            (node, index) => ({
              nodeId:
                node.nodeId,
              captureTimeSecondsFromReference:
                node
                  .captureTimeSecondsFromReference,
              result:
                resultFor(
                  node,
                  index === 0
                    ? 10
                    : 20
                )
            })
          )
      });

    expect(
      reduced
        .averageSpectralRadianceWattsPerSquareMeterSteradianNanometer
    ).toBeCloseTo(15, 12);
    expect(
      reduced
        .integratedSpectralRadianceWattSecondsPerSquareMeterSteradianNanometer
    ).toBeCloseTo(0.3, 12);
    expect(
      reduced.uncertaintyPropagation
    ).toBe("not-propagated");
  });

  it("fails closed when provider results drift from authoritative node time or identity", () => {
    const samplingPlan =
      plan();
    const node =
      samplingPlan.nodes[0]!;

    expect(() =>
      reduceSceneRadianceTemporalSamples({
        plan: samplingPlan,
        samples: [
          {
            nodeId:
              node.nodeId,
            captureTimeSecondsFromReference:
              node
                .captureTimeSecondsFromReference +
              0.001,
            result:
              resultFor(node, 10)
          },
          {
            nodeId:
              samplingPlan.nodes[1]!
                .nodeId,
            captureTimeSecondsFromReference:
              samplingPlan.nodes[1]!
                .captureTimeSecondsFromReference,
            result:
              resultFor(
                samplingPlan.nodes[1]!,
                20
              )
          }
        ]
      })
    ).toThrow(
      "sample time must match"
    );

    expect(() =>
      reduceSceneRadianceTemporalSamples({
        plan: samplingPlan,
        samples:
          samplingPlan.nodes.map(
            (currentNode) => ({
              nodeId:
                currentNode.nodeId,
              captureTimeSecondsFromReference:
                currentNode
                  .captureTimeSecondsFromReference,
              result: {
                ...resultFor(
                  currentNode,
                  10
                ),
                sceneId:
                  "other-scene"
              }
            })
          )
      })
    ).toThrow(
      "result identity must match"
    );
  });
});
