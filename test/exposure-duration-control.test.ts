import { describe, expect, it } from "vitest";

import {
  bindResolvedExposureDurationToCaptureExposureInput,
  calculateCaptureExposureWindows,
  calculateRelativeRenderedExposure,
  createExposureMeterTargetFromMeteringResult,
  meterRelativeExposure,
  parseExposureMeteringProfile,
  parseExposureProgramLineProfile,
  parseGenericBodyExposureCapabilityProfile,
  parseGenericLensExposureCapabilityProfile,
  resolveCaptureGeometry,
  resolveExposureDurationControl,
  resolveFullAutoExposureMode,
  resolveGenericEquipmentExposureCapabilities,
  resolveManualExposureMode,
  resolveProgramAutoExposureMode
} from "../src/index.js";

const evidence = (ref: string) => [{
  sourceOrigin: "photivra" as const,
  sourceReference: ref,
  reuseStatus: "photivra-owned" as const
}] as const;

const baseExposureWindowInput = {
  nativeRaster: {
    pixelWidth: 100,
    pixelHeight: 100
  },
  shutterMechanism: "electronic" as const,
  opening: {
    kind: "simultaneous" as const
  },
  closing: {
    kind: "simultaneous" as const
  },
  samplePointsNative: [
    {
      x: 50,
      y: 50
    }
  ]
};

describe("Bulb and Time exposure-duration control", () => {
  it("resolves fixed duration and preserves control-only boundaries", () => {
    const result =
      resolveExposureDurationControl({
        kind: "fixed-duration",
        durationSeconds: 45
      });

    expect(result).toEqual({
      version: "0.1.0",
      controlKind: "fixed-duration",
      status: "resolved",
      durationSeconds: 45,
      physicalExposureIntegrationAuthorized: true,
      shutterMechanismInferred: false,
      exposureBoundaryTopologyInferred: false,
      tripodSupportInferred: false,
      stabilizationStateInferred: false,
      longExposureNoiseReductionInferred: false,
      sensorTemperatureBehaviorInferred: false
    });
  });

  it("keeps unfinished Bulb and Time controls out of physical integration", () => {
    const bulb =
      resolveExposureDurationControl({
        kind: "bulb",
        timeReference:
          "control-monotonic-seconds",
        pressSeconds: 10
      });
    const time =
      resolveExposureDurationControl({
        kind: "time",
        timeReference:
          "control-monotonic-seconds",
        startSeconds: 20
      });

    expect(bulb).toMatchObject({
      status: "active",
      durationSeconds: null,
      waitingFor: "bulb-release",
      physicalExposureIntegrationAuthorized: false
    });
    expect(time).toMatchObject({
      status: "active",
      durationSeconds: null,
      waitingFor: "time-stop",
      physicalExposureIntegrationAuthorized: false
    });

    expect(() =>
      bindResolvedExposureDurationToCaptureExposureInput({
        resolution: bulb as never,
        durationEvidence:
          evidence("active-bulb"),
        exposureWindowInput:
          baseExposureWindowInput
      })
    ).toThrow(
      "must be a resolved exposure-duration control result"
    );
  });

  it("resolves Bulb and Time from elapsed control time", () => {
    const bulb =
      resolveExposureDurationControl({
        kind: "bulb",
        timeReference:
          "control-monotonic-seconds",
        pressSeconds: 100,
        releaseSeconds: 112.5
      });
    const time =
      resolveExposureDurationControl({
        kind: "time",
        timeReference:
          "control-monotonic-seconds",
        startSeconds: 200,
        stopSeconds: 212.5
      });

    expect(bulb.status).toBe("resolved");
    expect(time.status).toBe("resolved");
    if (
      bulb.status !== "resolved" ||
      time.status !== "resolved"
    ) {
      throw new Error(
        "Expected resolved Bulb/Time controls."
      );
    }

    expect(bulb.durationSeconds)
      .toBeCloseTo(12.5, 12);
    expect(time.durationSeconds)
      .toBeCloseTo(12.5, 12);
  });

  it("does not impose a universal 30-second maximum", () => {
    const bulb =
      resolveExposureDurationControl({
        kind: "bulb",
        timeReference:
          "control-monotonic-seconds",
        pressSeconds: 0,
        releaseSeconds: 300
      });

    expect(bulb.status).toBe("resolved");
    if (bulb.status !== "resolved") {
      throw new Error(
        "Expected resolved Bulb."
      );
    }

    const input =
      bindResolvedExposureDurationToCaptureExposureInput({
        resolution: bulb,
        durationEvidence:
          evidence("bulb-300s"),
        exposureWindowInput:
          baseExposureWindowInput
      });

    const windows =
      calculateCaptureExposureWindows(
        input
      ).value;

    expect(
      windows
        .nominalExposureDurationSeconds
        .value
    ).toBe(300);
    expect(
      windows
        .localExposureDurationRangeSeconds
    ).toEqual({
      minimum: 300,
      maximum: 300
    });
  });

  it("preserves the caller's shutter mechanism and boundary schedules", () => {
    const duration =
      resolveExposureDurationControl({
        kind: "time",
        timeReference:
          "control-monotonic-seconds",
        startSeconds: 5,
        stopSeconds: 7
      });
    if (duration.status !== "resolved") {
      throw new Error(
        "Expected resolved Time control."
      );
    }

    const input =
      bindResolvedExposureDurationToCaptureExposureInput({
        resolution: duration,
        durationEvidence:
          evidence("time-2s"),
        exposureWindowInput: {
          ...baseExposureWindowInput,
          shutterMechanism:
            "mechanical"
        }
      });

    expect(input.shutterMechanism)
      .toBe("mechanical");
    expect(input.opening)
      .toEqual({
        kind: "simultaneous"
      });
    expect(input.closing)
      .toEqual({
        kind: "simultaneous"
      });
  });

  it("produces identical authoritative exposure windows for equal fixed/Bulb/Time durations", () => {
    const fixed =
      resolveExposureDurationControl({
        kind: "fixed-duration",
        durationSeconds: 8
      });
    const bulb =
      resolveExposureDurationControl({
        kind: "bulb",
        timeReference:
          "control-monotonic-seconds",
        pressSeconds: 1,
        releaseSeconds: 9
      });
    const time =
      resolveExposureDurationControl({
        kind: "time",
        timeReference:
          "control-monotonic-seconds",
        startSeconds: 50,
        stopSeconds: 58
      });

    if (
      fixed.status !== "resolved" ||
      bulb.status !== "resolved" ||
      time.status !== "resolved"
    ) {
      throw new Error(
        "Expected resolved equal-duration controls."
      );
    }

    const windowFor = (
      resolution:
        typeof fixed
    ): ReturnType<
      typeof calculateCaptureExposureWindows
    >["value"] =>
      calculateCaptureExposureWindows(
        bindResolvedExposureDurationToCaptureExposureInput({
          resolution,
          durationEvidence:
            evidence("equal-8s"),
          exposureWindowInput:
            baseExposureWindowInput
        })
      ).value;

    expect(windowFor(bulb))
      .toEqual(windowFor(fixed));
    expect(windowFor(time))
      .toEqual(windowFor(fixed));
  });

  it("fails closed on invalid time references, ordering, and non-positive fixed duration", () => {
    expect(() =>
      resolveExposureDurationControl({
        kind: "fixed-duration",
        durationSeconds: 0
      })
    ).toThrow(
      "durationSeconds must be greater than zero"
    );

    expect(() =>
      resolveExposureDurationControl({
        kind: "bulb",
        timeReference: "wall-clock" as never,
        pressSeconds: 1,
        releaseSeconds: 2
      })
    ).toThrow(
      "Bulb control timeReference"
    );

    expect(() =>
      resolveExposureDurationControl({
        kind: "bulb",
        timeReference:
          "control-monotonic-seconds",
        pressSeconds: 2,
        releaseSeconds: 2
      })
    ).toThrow(
      "releaseSeconds must be greater than pressSeconds"
    );

    expect(() =>
      resolveExposureDurationControl({
        kind: "time",
        timeReference:
          "control-monotonic-seconds",
        startSeconds: 3,
        stopSeconds: 2
      })
    ).toThrow(
      "stopSeconds must be greater than startSeconds"
    );

    expect(() =>
      resolveExposureDurationControl({
        kind: "magic"
      } as never)
    ).toThrow("control.kind is invalid");
  });
});

describe("exposure mode downstream-physics hardening", () => {
  const capabilities = (): ReturnType<
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
            evidence:
              evidence("shutter")
          },
          settingGrid: {
            kind:
              "continuous-within-range"
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
              evidence:
                evidence("iso-grid")
            }
          },
          autoIso: {
            value: "supported",
            evidence:
              evidence("auto-iso")
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
            kind:
              "continuous-within-range"
          }
        }
      });

    return resolveGenericEquipmentExposureCapabilities({
      bodyProfile: body,
      lensProfile: lens,
      selectedFocalLengthMm: 50
    });
  };

  const target = (): ReturnType<
    typeof createExposureMeterTargetFromMeteringResult
  > => {
    const profile =
      parseExposureMeteringProfile({
        schemaVersion: "0.1.0",
        profileId: "meter",
        scientificStatus: "approximation",
        inputDomain:
          "relative-pre-exposure-linear-signal",
        captureRegion:
          "oriented-active-capture",
        policy: {
          kind: "multi-zone-uniform"
        },
        target: {
          kind:
            "relative-signal-reference",
          targetRelativeSignal: 1,
          evidence: evidence("target")
        },
        evidence: evidence("meter"),
        limitations: ["test"]
      });

    const meter =
      meterRelativeExposure({
        profile,
        sampleSet: {
          measurementId: "m",
          sceneStateId: "s",
          inputDomain:
            "relative-pre-exposure-linear-signal",
          captureRegion:
            "oriented-active-capture",
          captureGeometry:
            resolveCaptureGeometry({
              imagingArea: {
                widthMm: 36,
                heightMm: 24
              },
              nativeRaster: {
                pixelWidth: 6000,
                pixelHeight: 4000
              },
              orientation: "landscape"
            }).value,
          processingState: {
            exposureSettingsApplied: false,
            whiteBalanceApplied: false,
            toneMappingApplied: false,
            displayGammaApplied: false,
            sharpeningApplied: false
          },
          samples: [{
            sampleId: "z",
            positionOrientedCaptureUv: {
              u: 0.5,
              v: 0.5
            },
            relativeLinearSignal: 1,
            areaWeight: 1
          }]
        }
      }).value;

    return createExposureMeterTargetFromMeteringResult({
      targetId: "target",
      meterResult: meter
    });
  };

  const line = (): ReturnType<
    typeof parseExposureProgramLineProfile
  > =>
    parseExposureProgramLineProfile({
      schemaVersion: "0.1.0",
      profileId: "line",
      profileVersion: "1.0.0",
      scientificStatus: "approximation",
      policyKind:
        "generic-program-line",
      interpolation:
        "log2-aperture-shutter",
      evidence: evidence("line"),
      limitations: ["test"],
      nodes: [
        {
          nodeId: "minus-one",
          opticalExposureStopsFromReference:
            -1,
          aperture: 5.656854249492381,
          shutterSeconds: 1 / 125
        },
        {
          nodeId: "zero",
          opticalExposureStopsFromReference:
            0,
          aperture: 4,
          shutterSeconds: 1 / 125
        },
        {
          nodeId: "plus-one",
          opticalExposureStopsFromReference:
            1,
          aperture: 4,
          shutterSeconds: 2 / 125
        }
      ]
    });

  it("identical resolved settings produce identical downstream exposure regardless of mode", () => {
    const caps = capabilities();
    const t = target();
    const reference = {
      aperture: 4,
      shutterSeconds: 1 / 125,
      iso: 100
    };

    const manual =
      resolveManualExposureMode({
        target: t,
        capabilities: caps,
        referenceExposure:
          reference,
        manualAperture: 4,
        manualShutterSeconds:
          1 / 125,
        isoControl: {
          kind: "manual",
          iso: 100
        }
      });
    const program =
      resolveProgramAutoExposureMode({
        target: t,
        capabilities: caps,
        referenceExposure:
          reference,
        programLine: line(),
        isoControl: {
          kind: "manual",
          iso: 100
        }
      });
    const full =
      resolveFullAutoExposureMode({
        target: t,
        capabilities: caps,
        referenceExposure:
          reference,
        policy: {
          kind:
            "generic-program-line-minimum-iso",
          programLine: line(),
          isoBaseline:
            "minimum-selectable",
          isoQuantizationPolicy:
            "nearest-log2-lower-on-tie"
        }
      });

    if (
      manual.status !== "resolved" ||
      program.status !== "resolved" ||
      full.status !== "resolved"
    ) {
      throw new Error(
        "Expected resolved exposure modes."
      );
    }

    expect(program.resolvedSettings)
      .toEqual(manual.resolvedSettings);
    expect(full.resolvedSettings)
      .toEqual(manual.resolvedSettings);

    const downstream = (
      settings: {
        aperture: number;
        shutterSeconds: number;
        iso: number;
      }
    ): ReturnType<
      typeof calculateRelativeRenderedExposure
    >["value"] =>
      calculateRelativeRenderedExposure({
        ...settings,
        referenceAperture:
          reference.aperture,
        referenceShutterSeconds:
          reference.shutterSeconds,
        referenceIso:
          reference.iso
      }).value;

    expect(
      downstream(
        program.resolvedSettings
      )
    ).toEqual(
      downstream(
        manual.resolvedSettings
      )
    );
    expect(
      downstream(
        full.resolvedSettings
      )
    ).toEqual(
      downstream(
        manual.resolvedSettings
      )
    );
  });
});
