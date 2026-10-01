import { describe, expect, it } from "vitest";

import {
  createManualFlashIlluminationOverlay,
  evaluateSceneIlluminationTemporalMultiplier,
  integrateSceneIlluminationTemporalMultiplierOverExposureWindow,
  parseFlashSyncCapabilityProfile,
  parseManualFlashProfile,
  parseSceneIlluminationProfile,
  parseSceneIlluminationTemporalProfile,
  resolveCaptureMode,
  resolveCaptureModeTiming,
  resolveManualFlashSync,
  type FlashSyncCapabilityProfile,
  type ManualFlashProfile,
  type ResolvedCaptureModeTiming,
  type ResolvedReleaseFrame,
  type SceneIlluminationProfile,
  type SceneIlluminationTemporalProfile
} from "../src/index.js";

const evidence = (
  ref: string
) => [{
  sourceOrigin: "photivra" as const,
  sourceReference: ref,
  reuseStatus: "photivra-owned" as const
}] as const;

const flash = (
  durationSeconds = 0.001
): ManualFlashProfile =>
  parseManualFlashProfile({
    schemaVersion: "0.1.0",
    profileId: "flash-1",
    profileVersion: "1.0.0",
    sourceTemplate: {
      sourceId: "flash-source",
      family: "spot",
      geometry: {
        kind: "spot",
        origin: {
          kind: "point-position",
          positionM: {
            x: 0,
            y: 1.5,
            z: 0
          }
        },
        directionUnitVector: {
          x: 0,
          y: 0,
          z: 1
        },
        outerConeAngleDegrees: 60
      },
      magnitude: {
        kind: "relative-linear-scale",
        scale: 2,
        scientificStatus:
          "approximation",
        limitation:
          "Generic manual flash relative output."
      },
      spectrum: {
        kind:
          "blackbody-temperature-approximation",
        temperatureKelvin: 5600,
        limitation:
          "Generic flash-spectrum approximation."
      },
      evidence:
        evidence("flash-source"),
      limitations: [
        "Finite spot-source approximation."
      ]
    },
    pulse: {
      waveformId: "flash-pulse",
      scientificStatus:
        "approximation",
      supportDurationSeconds:
        durationSeconds,
      interpolation:
        "piecewise-linear",
      samples: [
        {
          timeSecondsFromWaveformReference:
            0,
          relativeMagnitudeMultiplier:
            0
        },
        {
          timeSecondsFromWaveformReference:
            durationSeconds / 2,
          relativeMagnitudeMultiplier:
            1
        },
        {
          timeSecondsFromWaveformReference:
            durationSeconds,
          relativeMagnitudeMultiplier:
            0
        }
      ],
      normalization:
        "relative-peak-one",
      evidence:
        evidence("flash-waveform"),
      limitations: [
        "Triangular pulse approximation."
      ]
    },
    outputControl: {
      kind:
        "relative-linear-source-scale",
      scale: 0.5,
      flashExposureCompensationStops:
        0
    },
    ttlModeled: false,
    highSpeedSyncModeled: false,
    recycleBehaviorModeled: false,
    redEyePreflashModeled: false,
    modelingLightModeled: false,
    afAssistModeled: false,
    evidence:
      evidence("flash-profile"),
    limitations: [
      "Manual flash only."
    ]
  });

const syncCapabilities =
  (
    modes:
      readonly (
        "front-curtain" |
        "rear-curtain"
      )[] = [
      "front-curtain",
      "rear-curtain"
    ]
  ): FlashSyncCapabilityProfile =>
    parseFlashSyncCapabilityProfile({
      schemaVersion: "0.1.0",
      profileId:
        "flash-sync",
      profileVersion: "1.0.0",
      captureModeId: "still",
      timingProfileId:
        "still-timing",
      supportedOrdinarySyncModes:
        modes,
      highSpeedSyncSupported:
        false,
      ordinarySyncRequiresWholeActiveFrameSimultaneouslyExposed:
        true,
      evidence:
        evidence("flash-sync"),
      limitations: [
        "Generic ordinary-sync capability."
      ]
    });

const resolvedTiming = (
  shutterSeconds = 0.02,
  openingTraversalSeconds =
    0.005
): ResolvedCaptureModeTiming => {
  const nativeRaster = {
    pixelWidth: 100,
    pixelHeight: 100
  };
  const captureMode =
    resolveCaptureMode({
      nativeRaster,
      profile: {
        schemaVersion: "0.1.0",
        modes: [{
          modeId: "still",
          evidence:
            evidence("still-mode"),
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
              evidence("still-raster")
          },
          dependencies: [
            "mode-specific-readout-timing"
          ]
        }]
      },
      modeId: "still"
    });

  return resolveCaptureModeTiming({
    captureMode,
    timingProfile: {
      schemaVersion: "0.1.0",
      profileId:
        "still-timing",
      profileVersion: "1.0.0",
      captureModeId: "still",
      scientificStatus:
        "approximation",
      scheduleFamily:
        "global-or-uniform-linear-native-scan",
      shutterMechanism:
        "mechanical",
      opening: {
        kind:
          "uniform-linear-native-scan",
        directionNative: {
          value: "top-to-bottom",
          evidence:
            evidence("open-direction")
        },
        traversalDurationSeconds: {
          value:
            openingTraversalSeconds,
          unit: "s",
          evidence:
            evidence("open-duration")
        }
      },
      closing: {
        kind:
          "uniform-linear-native-scan",
        directionNative: {
          value: "top-to-bottom",
          evidence:
            evidence("close-direction")
        },
        traversalDurationSeconds: {
          value:
            openingTraversalSeconds,
          unit: "s",
          evidence:
            evidence("close-duration")
        }
      },
      readout: {
        readoutMode: "rolling",
        captureReadoutDurationSeconds: {
          value: 0.012,
          unit: "s",
          evidence:
            evidence("readout-duration")
        },
        scanDirectionNative: {
          value: "top-to-bottom",
          evidence:
            evidence("readout-direction")
        },
        spatialSamplingSkewSeconds: {
          value: 0.012,
          unit: "s",
          evidence:
            evidence("readout-skew")
        }
      },
      nonUniformScheduleModeled:
        false,
      evidence:
        evidence("timing-profile"),
      limitations: [
        "Uniform scan timing approximation."
      ]
    },
    nominalExposureDurationSeconds: {
      value: shutterSeconds,
      unit: "s",
      evidence:
        evidence("shutter")
    },
    samplePointsNative: [{
      x: 50,
      y: 50
    }]
  });
};

const releaseFrame = (
  shutterSeconds = 0.02
): ResolvedReleaseFrame => ({
  sequenceId: "sequence-1",
  frameIndex: 0,
  releaseFrameId:
    "sequence-1:frame:0",
  exposureStartTimeSeconds: 10,
  exposureEndTimeSeconds:
    10 + shutterSeconds,
  sceneTimeSecondsFromSequenceStart:
    0.25,
  startIntervalFromPreviousSeconds:
    null,
  timingConstraints: [
    "exposure-duration"
  ],
  stochasticSeedUint32: 123,
  exposure: {
    aperture: 4,
    shutterSeconds,
    iso: 400
  },
  focus: {
    kind: "finite",
    distanceM: 3
  },
  automation: {
    ae: "manual",
    af: "locked",
    awb: "manual"
  }
});

const baseIllumination =
  (): SceneIlluminationProfile =>
    parseSceneIlluminationProfile({
      schemaVersion: "0.1.0",
      profileId:
        "ambient-profile",
      sceneId: "scene-1",
      evidence:
        evidence("ambient-profile"),
      sources: [{
        sourceId: "ambient",
        family: "environment",
        enabled: true,
        geometry: {
          kind: "environment"
        },
        magnitude: {
          kind:
            "relative-linear-scale",
          scale: 1,
          scientificStatus:
            "approximation",
          limitation:
            "Ambient relative test light."
        },
        spectrum: {
          kind:
            "blackbody-temperature-approximation",
          temperatureKelvin:
            6500,
          limitation:
            "Ambient spectrum approximation."
        },
        temporalBehavior: {
          kind: "time-invariant"
        },
        evidence:
          evidence("ambient")
      }],
      sceneRadianceCalculated:
        false,
      materialResponseApplied:
        false,
      visibilityEvaluated:
        false,
      indirectTransportEvaluated:
        false,
      fluorescenceModeled:
        false,
      volumetricTransportModeled:
        false,
      polarizationModeled:
        false
    });

const ambientTemporal =
  (): SceneIlluminationTemporalProfile =>
    parseSceneIlluminationTemporalProfile({
      schemaVersion: "0.1.0",
      profileId:
        "ambient-temporal",
      sceneId: "scene-1",
      illuminationProfileId:
        "ambient-profile",
      evidence:
        evidence("ambient-temporal"),
      waveforms: [{
        waveformId:
          "ambient-flicker",
        kind:
          "periodic-relative-multiplier",
        timeUnit: "s",
        scientificStatus:
          "approximation",
        uncertainty: {
          kind:
            "not-quantified",
          limitation:
            "Test ambient flicker."
        },
        evidence:
          evidence("ambient-flicker"),
        interpolation:
          "piecewise-linear",
        samples: [
          {
            timeSecondsFromWaveformReference:
              0,
            relativeMagnitudeMultiplier:
              1
          },
          {
            timeSecondsFromWaveformReference:
              0.01,
            relativeMagnitudeMultiplier:
              0.5
          },
          {
            timeSecondsFromWaveformReference:
              0.02,
            relativeMagnitudeMultiplier:
              1
          }
        ],
        periodSeconds: 0.02,
        endpointContinuityRequired:
          true
      }],
      sourceBindings: [{
        bindingId:
          "ambient-binding",
        sourceId: "ambient",
        waveformId:
          "ambient-flicker",
        captureTimeReference:
          "first-opening-boundary-phase",
        waveformTimeZeroSecondsFromCaptureReference:
          0,
        scientificStatus:
          "approximation",
        timingUncertainty: {
          kind:
            "not-quantified",
          limitation:
            "Test temporal registration."
        },
        evidence:
          evidence("ambient-binding")
      }],
      baseIlluminationProfileRemainsAuthoritative:
        true,
      sensorReadoutTimingUsedAsExposureTiming:
        false,
      automaticExposurePolicyIncluded:
        false
    });

describe("manual flash sync timing", () => {
  it("resolves front and rear curtain pulse placement inside the whole-frame-open interval", () => {
    const timing =
      resolvedTiming();
    const front =
      resolveManualFlashSync({
        flashEnabled: true,
        flashProfile: flash(),
        syncCapabilities:
          syncCapabilities(),
        timing,
        syncMode:
          "front-curtain",
        releaseFrame:
          releaseFrame()
      });
    const rear =
      resolveManualFlashSync({
        flashEnabled: true,
        flashProfile: flash(),
        syncCapabilities:
          syncCapabilities(),
        timing,
        syncMode:
          "rear-curtain",
        releaseFrame:
          releaseFrame()
      });

    expect(
      front
        .wholeActiveFrameOpenInterval
    ).toEqual({
      startSecondsFromCaptureReference:
        0.005,
      endSecondsFromCaptureReference:
        0.02,
      durationSeconds: 0.015
    });
    expect(
      front
        .pulseStartSecondsFromCaptureReference
    ).toBeCloseTo(0.005, 12);
    expect(
      front
        .pulseEndSecondsFromCaptureReference
    ).toBeCloseTo(0.006, 12);
    expect(
      rear
        .pulseStartSecondsFromCaptureReference
    ).toBeCloseTo(0.019, 12);
    expect(
      rear
        .pulseEndSecondsFromCaptureReference
    ).toBeCloseTo(0.02, 12);
    expect(
      rear
        .pulseStartSecondsFromCaptureReference
    ).toBeGreaterThan(
      front
        .pulseStartSecondsFromCaptureReference!
    );
    expect(front).toMatchObject({
      syncStatus:
        "ordinary-sync-resolved",
      hssModeled: false,
      ttlModeled: false,
      sensorReadoutTimingUsedAsExposureTiming:
        false,
      whiteBalanceModified: false,
      focusModified: false,
      exposureSettingsModified:
        false,
      driveModeModified: false,
      supportStateModified: false
    });
    expect(
      front.releaseFrameBinding
        ?.sceneTimeSecondsFromSequenceStartAtPulseStart
    ).toBeCloseTo(0.255, 12);
  });

  it("fails ordinary one-pulse sync when the focal-plane timing has no whole-frame-open interval", () => {
    expect(() =>
      resolveManualFlashSync({
        flashEnabled: true,
        flashProfile: flash(),
        syncCapabilities:
          syncCapabilities(),
        timing:
          resolvedTiming(
            0.003,
            0.005
          ),
        syncMode:
          "front-curtain"
      })
    ).toThrow(
      "no whole-frame-open interval"
    );
  });

  it("fails when a flash pulse cannot fit into the ordinary sync interval", () => {
    expect(() =>
      resolveManualFlashSync({
        flashEnabled: true,
        flashProfile:
          flash(0.016),
        syncCapabilities:
          syncCapabilities(),
        timing:
          resolvedTiming(),
        syncMode:
          "front-curtain"
      })
    ).toThrow(
      "does not fit inside"
    );
  });

  it("does not fake HSS with an ordinary single pulse", () => {
    expect(() =>
      resolveManualFlashSync({
        flashEnabled: true,
        flashProfile: flash(),
        syncCapabilities:
          syncCapabilities(),
        timing:
          resolvedTiming(),
        syncMode:
          "high-speed-sync"
      })
    ).toThrow(
      "cannot be used as an HSS substitute"
    );
  });

  it("enforces exact capture-mode/timing capability identity and rear-sync capability", () => {
    expect(() =>
      resolveManualFlashSync({
        flashEnabled: true,
        flashProfile: flash(),
        syncCapabilities:
          parseFlashSyncCapabilityProfile({
            ...syncCapabilities(),
            timingProfileId:
              "other-timing"
          }),
        timing:
          resolvedTiming(),
        syncMode:
          "front-curtain"
      })
    ).toThrow(
      "exactly match"
    );

    expect(() =>
      resolveManualFlashSync({
        flashEnabled: true,
        flashProfile: flash(),
        syncCapabilities:
          syncCapabilities([
            "front-curtain"
          ]),
        timing:
          resolvedTiming(),
        syncMode:
          "rear-curtain"
      })
    ).toThrow(
      "not supported"
    );
  });

  it("binds optional #105 release-frame shutter duration without changing release state", () => {
    expect(() =>
      resolveManualFlashSync({
        flashEnabled: true,
        flashProfile: flash(),
        syncCapabilities:
          syncCapabilities(),
        timing:
          resolvedTiming(),
        syncMode:
          "front-curtain",
        releaseFrame:
          releaseFrame(0.01)
      })
    ).toThrow(
      "shutter duration must match"
    );
  });
});

describe("manual flash illumination overlay", () => {
  it("returns the original illumination semantics when flash is disabled", () => {
    const base =
      baseIllumination();
    const temporal =
      ambientTemporal();
    const sync =
      resolveManualFlashSync({
        flashEnabled: false,
        flashProfile: flash(),
        syncCapabilities:
          syncCapabilities(),
        timing:
          resolvedTiming(),
        syncMode:
          "front-curtain"
      });

    const overlay =
      createManualFlashIlluminationOverlay({
        baseIlluminationProfile:
          base,
        baseTemporalProfile:
          temporal,
        flashProfile: flash(),
        resolvedSync: sync,
        illuminationProfileId:
          "with-disabled-flash",
        temporalProfileId:
          "with-disabled-flash-time"
      });

    expect(
      overlay.flashApplied
    ).toBe(false);
    expect(
      overlay.illuminationProfile
    ).toEqual(base);
    expect(
      overlay.temporalProfile
    ).toEqual(temporal);
    expect(
      overlay.illuminationProfile
        .sources
    ).toHaveLength(1);
  });

  it("adds flash as a spatial scene-light source and preserves existing ambient temporal behavior", () => {
    const timing =
      resolvedTiming();
    const sync =
      resolveManualFlashSync({
        flashEnabled: true,
        flashProfile: flash(),
        syncCapabilities:
          syncCapabilities(),
        timing,
        syncMode:
          "front-curtain"
      });

    const overlay =
      createManualFlashIlluminationOverlay({
        baseIlluminationProfile:
          baseIllumination(),
        baseTemporalProfile:
          ambientTemporal(),
        flashProfile: flash(),
        resolvedSync: sync,
        illuminationProfileId:
          "ambient-plus-flash",
        temporalProfileId:
          "ambient-plus-flash-time"
      });

    expect(
      overlay.flashApplied
    ).toBe(true);
    expect(
      overlay.illuminationProfile
        .sources.map(
          (source) =>
            source.sourceId
        )
    ).toEqual([
      "ambient",
      "flash-source"
    ]);
    expect(
      overlay.temporalProfile
        ?.waveforms.map(
          (waveform) =>
            waveform.waveformId
        )
    ).toEqual([
      "ambient-flicker",
      "flash-pulse"
    ]);
    expect(
      overlay.temporalProfile
        ?.sourceBindings.map(
          (binding) =>
            binding.sourceId
        )
    ).toEqual([
      "ambient",
      "flash-source"
    ]);
    expect(
      overlay
        .ambientTemporalBehaviorPreserved
    ).toBe(true);
    expect(
      overlay
        .postRenderBrightnessMultiplierUsed
    ).toBe(false);
    expect(
      overlay
        .materialTransportOwnedBySceneRadiance
    ).toBe(true);
    expect(
      overlay
        .visibilityOwnedBySceneRadiance
    ).toBe(true);
    expect(
      overlay
        .whiteBalanceModified
    ).toBe(false);

    const flashSource =
      overlay.illuminationProfile
        .sources[1]!;
    expect(
      flashSource.geometry.kind
    ).toBe("spot");
    expect(
      flashSource.magnitude
    ).toMatchObject({
      kind:
        "relative-linear-scale",
      scale: 1
    });

    const peak =
      evaluateSceneIlluminationTemporalMultiplier({
        illuminationProfile:
          overlay
            .illuminationProfile,
        temporalProfile:
          overlay
            .temporalProfile!,
        sourceId:
          "flash-source",
        captureTimeSecondsFromReference:
          0.0055
      });
    expect(
      peak
        .relativeMagnitudeMultiplier
    ).toBeCloseTo(1, 12);
    expect(
      peak
        .sensorReadoutTimingUsed
    ).toBe(false);

    const integrated =
      integrateSceneIlluminationTemporalMultiplierOverExposureWindow({
        illuminationProfile:
          overlay
            .illuminationProfile,
        temporalProfile:
          overlay
            .temporalProfile!,
        sourceId:
          "flash-source",
        exposureWindows:
          timing.exposureWindows,
        sampleIndex: 0,
        temporalSampleCount:
          200
      });
    expect(
      integrated
        .integratedEffectiveRelativeMagnitudeSeconds
    ).toBeGreaterThan(0);
    expect(
      integrated
        .integratedEffectiveRelativeMagnitudeSeconds
    ).toBeLessThan(0.0011);
    expect(
      integrated
        .sensorReadoutTimingUsed
    ).toBe(false);
  });

  it("preserves flash pulse energy timing across longer shutter duration while ambient exposure window changes", () => {
    const shortTiming =
      resolvedTiming(
        0.02,
        0.005
      );
    const longTiming =
      resolvedTiming(
        0.04,
        0.005
      );

    const create = (
      timing:
        ResolvedCaptureModeTiming
    ) => {
      const sync =
        resolveManualFlashSync({
          flashEnabled: true,
          flashProfile: flash(),
          syncCapabilities:
            syncCapabilities(),
          timing,
          syncMode:
            "front-curtain"
        });
      return createManualFlashIlluminationOverlay({
        baseIlluminationProfile:
          baseIllumination(),
        flashProfile: flash(),
        resolvedSync: sync,
        illuminationProfileId:
          "illum-" +
          timing.exposureWindows
            .nominalExposureDurationSeconds
            .value,
        temporalProfileId:
          "time-" +
          timing.exposureWindows
            .nominalExposureDurationSeconds
            .value
      });
    };

    const shortOverlay =
      create(shortTiming);
    const longOverlay =
      create(longTiming);

    const shortFlash =
      integrateSceneIlluminationTemporalMultiplierOverExposureWindow({
        illuminationProfile:
          shortOverlay
            .illuminationProfile,
        temporalProfile:
          shortOverlay
            .temporalProfile!,
        sourceId:
          "flash-source",
        exposureWindows:
          shortTiming
            .exposureWindows,
        sampleIndex: 0,
        temporalSampleCount:
          400
      });
    const longFlash =
      integrateSceneIlluminationTemporalMultiplierOverExposureWindow({
        illuminationProfile:
          longOverlay
            .illuminationProfile,
        temporalProfile:
          longOverlay
            .temporalProfile!,
        sourceId:
          "flash-source",
        exposureWindows:
          longTiming
            .exposureWindows,
        sampleIndex: 0,
        temporalSampleCount:
          800
      });

    expect(
      longTiming
        .exposureWindows
        .samples[0]!
        .localExposureDurationSeconds
    ).toBeGreaterThan(
      shortTiming
        .exposureWindows
        .samples[0]!
        .localExposureDurationSeconds
    );
    expect(
      longFlash
        .integratedEffectiveRelativeMagnitudeSeconds
    ).toBeCloseTo(
      shortFlash
        .integratedEffectiveRelativeMagnitudeSeconds,
      4
    );
  });

  it("fails closed when a flash source collides with an existing source identity", () => {
    const base =
      baseIllumination();
    const collision =
      parseSceneIlluminationProfile({
        ...base,
        sources: [
          ...base.sources,
          {
            ...flash()
              .sourceTemplate,
            enabled: true,
            temporalBehavior: {
              kind:
                "time-invariant"
            }
          }
        ]
      });
    const sync =
      resolveManualFlashSync({
        flashEnabled: true,
        flashProfile: flash(),
        syncCapabilities:
          syncCapabilities(),
        timing:
          resolvedTiming(),
        syncMode:
          "front-curtain"
      });

    expect(() =>
      createManualFlashIlluminationOverlay({
        baseIlluminationProfile:
          collision,
        flashProfile: flash(),
        resolvedSync: sync,
        illuminationProfileId:
          "collision-output",
        temporalProfileId:
          "collision-time"
      })
    ).toThrow(
      "sourceId must be unique"
    );
  });
});

describe("manual flash validation boundaries", () => {
  it("rejects invalid pulse support, non-normalized peak, and unsupported feature claims", () => {
    expect(() =>
      parseManualFlashProfile({
        ...flash(),
        pulse: {
          ...flash().pulse,
          supportDurationSeconds:
            0
        }
      })
    ).toThrow(
      "must be greater than zero"
    );

    expect(() =>
      parseManualFlashProfile({
        ...flash(),
        pulse: {
          ...flash().pulse,
          samples: [
            {
              timeSecondsFromWaveformReference:
                0,
              relativeMagnitudeMultiplier:
                0
            },
            {
              timeSecondsFromWaveformReference:
                0.001,
              relativeMagnitudeMultiplier:
                0.5
            }
          ]
        }
      })
    ).toThrow(
      "peak relative magnitude must equal one"
    );

    expect(() =>
      parseManualFlashProfile({
        ...flash(),
        highSpeedSyncModeled:
          true
      })
    ).toThrow(
      "highSpeedSyncModeled must be false"
    );
  });

  it("rejects sync capability HSS claims and duplicate ordinary modes", () => {
    expect(() =>
      parseFlashSyncCapabilityProfile({
        ...syncCapabilities(),
        highSpeedSyncSupported:
          true
      })
    ).toThrow(
      "must not claim HSS"
    );

    expect(() =>
      parseFlashSyncCapabilityProfile({
        ...syncCapabilities(),
        supportedOrdinarySyncModes: [
          "front-curtain",
          "front-curtain"
        ]
      })
    ).toThrow(
      "must not contain duplicates"
    );
  });

  it("requires an existing temporal profile to match the base illumination identity", () => {
    const sync =
      resolveManualFlashSync({
        flashEnabled: true,
        flashProfile: flash(),
        syncCapabilities:
          syncCapabilities(),
        timing:
          resolvedTiming(),
        syncMode:
          "front-curtain"
      });

    expect(() =>
      createManualFlashIlluminationOverlay({
        baseIlluminationProfile:
          baseIllumination(),
        baseTemporalProfile:
          parseSceneIlluminationTemporalProfile({
            ...ambientTemporal(),
            illuminationProfileId:
              "other-illumination"
          }),
        flashProfile: flash(),
        resolvedSync: sync,
        illuminationProfileId:
          "output",
        temporalProfileId:
          "output-time"
      })
    ).toThrow(
      "must exactly match"
    );
  });
});
