import { describe, expect, it } from "vitest";

import {
  createExposureMeterTargetFromMeteringResult,
  meterRelativeExposure,
  parseExposureMeteringProfile,
  parseGenericBodyExposureCapabilityProfile,
  parseGenericLensExposureCapabilityProfile,
  resolveAperturePriorityExposureMode,
  resolveCaptureGeometry,
  resolveGenericEquipmentExposureCapabilities,
  setExposureCompensationOnMeterTarget,
  type ExposureMeterTarget,
  type ResolvedGenericEquipmentExposureCapabilities
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

const capabilities = (
  shutterGrid:
    | "continuous"
    | readonly number[] =
      "continuous"
): ResolvedGenericEquipmentExposureCapabilities => {
  const body =
    parseGenericBodyExposureCapabilityProfile({
      schemaVersion: "0.1.0",
      profileId: "body-prosumer",
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
        settingGrid:
          shutterGrid ===
          "continuous"
            ? {
                kind:
                  "continuous-within-range"
              }
            : {
                kind:
                  "discrete-values",
                values: {
                  value:
                    shutterGrid,
                  evidence:
                    evidence("shutter-grid")
                }
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
      profileId: "lens-normal-prime",
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

const meterTarget = (
  requiredScale: number,
  targetId = "target"
): ExposureMeterTarget => {
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
        measurementId: "measurement",
        sceneStateId: "scene-state",
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
          sampleId: "sample",
          positionOrientedCaptureUv: {
            u: 0.5,
            v: 0.5
          },
          relativeLinearSignal:
            1 / requiredScale,
          areaWeight: 1
        }]
      }
    }).value;

  return createExposureMeterTargetFromMeteringResult({
    targetId,
    meterResult: meter
  });
};

const darkTarget = (): ExposureMeterTarget => {
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
        measurementId: "dark",
        sceneStateId: "dark-state",
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
          sampleId: "sample",
          positionOrientedCaptureUv: {
            u: 0.5,
            v: 0.5
          },
          relativeLinearSignal: 0,
          areaWeight: 1
        }]
      }
    }).value;

  return createExposureMeterTargetFromMeteringResult({
    targetId: "dark",
    meterResult: meter
  });
};

const referenceExposure = {
  aperture: 4,
  shutterSeconds: 1 / 125,
  iso: 100
};

describe("Aperture Priority + manual ISO", () => {
  it("resolves only shutter for a -1 stop scene-light change", () => {
    const result =
      resolveAperturePriorityExposureMode({
        target: meterTarget(2),
        capabilities: capabilities(),
        referenceExposure,
        manualAperture: 4,
        manualIso: 100,
        shutterQuantizationPolicy:
          "nearest-log2-shorter-on-tie"
      });

    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") {
      throw new Error("Expected resolved Aperture Priority.");
    }
    expect(result.resolvedSettings.aperture)
      .toBe(4);
    expect(result.resolvedSettings.iso)
      .toBe(100);
    expect(
      result.resolvedSettings.shutterSeconds
    ).toBeCloseTo(2 / 125, 12);
    expect(
      result.idealShutterSecondsBeforeConstraints
    ).toBeCloseTo(2 / 125, 12);
    expect(
      result.targetResidual.state
    ).toBe("matched");
    expect(
      result.apertureMutatedByResolver
    ).toBe(false);
    expect(
      result.isoMutatedByResolver
    ).toBe(false);
    expect(
      result.shutterResolvedByResolver
    ).toBe(true);
  });

  it("accounts for manual aperture and ISO relative to the explicit reference anchor", () => {
    const result =
      resolveAperturePriorityExposureMode({
        target: meterTarget(1),
        capabilities: capabilities(),
        referenceExposure,
        manualAperture: 5.6,
        manualIso: 200,
        shutterQuantizationPolicy:
          "nearest-log2-shorter-on-tie"
      });

    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") {
      throw new Error("Expected resolved Aperture Priority.");
    }

    const expected =
      (1 / 125) *
      ((5.6 * 5.6) /
        (4 * 4)) *
      (100 / 200);

    expect(
      result.idealShutterSecondsBeforeConstraints
    ).toBeCloseTo(expected, 12);
    expect(
      result.resolvedSettings.shutterSeconds
    ).toBeCloseTo(expected, 12);
    expect(result.resolvedSettings.aperture)
      .toBe(5.6);
    expect(result.resolvedSettings.iso)
      .toBe(200);
  });

  it("consumes exposure compensation from the target without reapplying it", () => {
    const base =
      meterTarget(2, "base");
    const compensated =
      setExposureCompensationOnMeterTarget({
        targetId: "plus-one",
        baseTarget: base,
        exposureCompensationStops: 1
      });

    const result =
      resolveAperturePriorityExposureMode({
        target: compensated,
        capabilities: capabilities(),
        referenceExposure,
        manualAperture: 4,
        manualIso: 100,
        shutterQuantizationPolicy:
          "nearest-log2-shorter-on-tie"
      });

    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") {
      throw new Error("Expected resolved Aperture Priority.");
    }
    expect(
      result.resolvedSettings.shutterSeconds
    ).toBeCloseTo(4 / 125, 12);
    expect(
      result.exposureCompensationAppliedByResolver
    ).toBe(false);
  });

  it("quantizes discrete shutter values in log2 duration space", () => {
    const result =
      resolveAperturePriorityExposureMode({
        target: meterTarget(1.5),
        capabilities: capabilities([
          1 / 125,
          1 / 60,
          1 / 30
        ]),
        referenceExposure,
        manualAperture: 4,
        manualIso: 100,
        shutterQuantizationPolicy:
          "nearest-log2-shorter-on-tie"
      });

    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") {
      throw new Error("Expected resolved Aperture Priority.");
    }
    expect(
      result.idealShutterSecondsBeforeConstraints
    ).toBeCloseTo(1.5 / 125, 12);
    expect(
      result.resolvedSettings.shutterSeconds
    ).toBeCloseTo(1 / 60, 12);
    expect(
      result.shutterResolution.kind
    ).toBe("discrete");
    expect(
      result.shutterResolution.quantized
    ).toBe(true);
    expect(
      result.targetResidual
        .limitingConstraint
    ).toBe("shutter-grid-quantization");
    expect(
      result.targetResidual.state
    ).toBe("over-target");
  });

  it("chooses the shorter shutter on an exact log-space tie", () => {
    const short = 1 / 125;
    const long = 1 / 60;
    const tiedScale =
      Math.sqrt(short * long) /
      referenceExposure.shutterSeconds;

    const result =
      resolveAperturePriorityExposureMode({
        target: meterTarget(tiedScale),
        capabilities: capabilities([
          short,
          long
        ]),
        referenceExposure,
        manualAperture: 4,
        manualIso: 100,
        shutterQuantizationPolicy:
          "nearest-log2-shorter-on-tie"
      });

    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") {
      throw new Error("Expected resolved Aperture Priority.");
    }
    expect(
      result.resolvedSettings.shutterSeconds
    ).toBeCloseTo(short, 15);
  });

  it("clamps at shortest shutter and reports residual over-target exposure", () => {
    const result =
      resolveAperturePriorityExposureMode({
        target: meterTarget(0.01),
        capabilities: capabilities(),
        referenceExposure,
        manualAperture: 4,
        manualIso: 100,
        shutterQuantizationPolicy:
          "nearest-log2-shorter-on-tie"
      });

    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") {
      throw new Error("Expected resolved Aperture Priority.");
    }
    expect(
      result.resolvedSettings.shutterSeconds
    ).toBeCloseTo(1 / 8000, 15);
    expect(
      result.shutterResolution.clamped
    ).toBe("minimum");
    expect(
      result.targetResidual
        .limitingConstraint
    ).toBe("shutter-minimum");
    expect(
      result.targetResidual.state
    ).toBe("over-target");
    expect(
      result.targetResidual.residualStops
    ).toBeLessThan(0);
  });

  it("clamps at longest shutter and reports residual under-target exposure", () => {
    const result =
      resolveAperturePriorityExposureMode({
        target: meterTarget(5000),
        capabilities: capabilities(),
        referenceExposure,
        manualAperture: 4,
        manualIso: 100,
        shutterQuantizationPolicy:
          "nearest-log2-shorter-on-tie"
      });

    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") {
      throw new Error("Expected resolved Aperture Priority.");
    }
    expect(
      result.resolvedSettings.shutterSeconds
    ).toBe(30);
    expect(
      result.shutterResolution.clamped
    ).toBe("maximum");
    expect(
      result.targetResidual
        .limitingConstraint
    ).toBe("shutter-maximum");
    expect(
      result.targetResidual.state
    ).toBe("under-target");
    expect(
      result.targetResidual.residualStops
    ).toBeGreaterThan(0);
  });

  it("blocks no-signal targets without fabricating a shutter duration", () => {
    const result =
      resolveAperturePriorityExposureMode({
        target: darkTarget(),
        capabilities: capabilities(),
        referenceExposure,
        manualAperture: 4,
        manualIso: 100,
        shutterQuantizationPolicy:
          "nearest-log2-shorter-on-tie"
      });

    expect(result).toMatchObject({
      status: "blocked",
      blocker: "target-no-signal",
      resolvedSettings: {
        aperture: 4,
        iso: 100
      }
    });
    if (result.status !== "blocked") {
      throw new Error("Expected blocked Aperture Priority.");
    }
    expect(
      "shutterSeconds" in
      result.resolvedSettings
    ).toBe(false);
  });
});

describe("Aperture Priority fail-closed guards", () => {
  it("rejects unsupported manual aperture and ISO settings", () => {
    expect(() =>
      resolveAperturePriorityExposureMode({
        target: meterTarget(1),
        capabilities: capabilities(),
        referenceExposure,
        manualAperture: 20,
        manualIso: 100,
        shutterQuantizationPolicy:
          "nearest-log2-shorter-on-tie"
      })
    ).toThrow(
      "manualAperture lies outside"
    );

    expect(() =>
      resolveAperturePriorityExposureMode({
        target: meterTarget(1),
        capabilities: capabilities(),
        referenceExposure,
        manualAperture: 4,
        manualIso: 150,
        shutterQuantizationPolicy:
          "nearest-log2-shorter-on-tie"
      })
    ).toThrow(
      "manualIso is not present"
    );
  });

  it("rejects an unknown shutter quantization policy", () => {
    expect(() =>
      resolveAperturePriorityExposureMode({
        target: meterTarget(1),
        capabilities: capabilities(),
        referenceExposure,
        manualAperture: 4,
        manualIso: 100,
        shutterQuantizationPolicy:
          "always-longer"
      } as never)
    ).toThrow(
      "shutterQuantizationPolicy"
    );
  });

  it("fails closed if ideal shutter calculation overflows", () => {
    const target =
      meterTarget(1);
    if (target.status !== "resolved") {
      throw new Error(
        "Expected resolved overflow target."
      );
    }

    const overflowTarget:
      ExposureMeterTarget = {
        ...target,
        requiredExposureScaleToTarget:
          Number.MAX_VALUE,
        exposureOffsetStopsToTarget:
          Math.log2(Number.MAX_VALUE)
      };

    expect(() =>
      resolveAperturePriorityExposureMode({
        target: overflowTarget,
        capabilities: capabilities(),
        referenceExposure: {
          aperture: 16,
          shutterSeconds: 30,
          iso: 12800
        },
        manualAperture: 16,
        manualIso: 100,
        shutterQuantizationPolicy:
          "nearest-log2-shorter-on-tie"
      })
    ).toThrow(
      "Ideal automatic shutter duration must remain finite"
    );
  });
});
