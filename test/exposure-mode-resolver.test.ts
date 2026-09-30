import { describe, expect, it } from "vitest";

import {
  createExposureMeterTargetFromMeteringResult,
  meterRelativeExposure,
  parseExposureMeteringProfile,
  parseGenericBodyExposureCapabilityProfile,
  parseGenericLensExposureCapabilityProfile,
  resolveCaptureGeometry,
  resolveGenericEquipmentExposureCapabilities,
  resolveManualExposureMode,
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
  autoIso:
    | "supported"
    | "unsupported"
    | "unknown" = "supported",
  isoValues: readonly number[] = [
    100,
    200,
    400,
    800,
    1600,
    3200,
    6400,
    12800
  ]
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
            value: isoValues,
            evidence: evidence("iso-grid")
          }
        },
        autoIso: {
          value: autoIso,
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

const targetForScale = (
  requiredScale: number,
  targetId = "target"
): ExposureMeterTarget => {
  const meterProfile =
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
        kind: "relative-signal-reference",
        targetRelativeSignal: 1,
        evidence: evidence("target")
      },
      evidence: evidence("meter"),
      limitations: ["test"]
    });

  const signal =
    1 / requiredScale;
  const result =
    meterRelativeExposure({
      profile: meterProfile,
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
          relativeLinearSignal: signal,
          areaWeight: 1
        }]
      }
    }).value;

  return createExposureMeterTargetFromMeteringResult({
    targetId,
    meterResult: result
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
        kind: "relative-signal-reference",
        targetRelativeSignal: 1,
        evidence: evidence("target")
      },
      evidence: evidence("meter"),
      limitations: ["test"]
    });

  const result =
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
    targetId: "dark-target",
    meterResult: result
  });
};

const referenceExposure = {
  aperture: 4,
  shutterSeconds: 1 / 125,
  iso: 100
};

describe("Manual + Auto ISO exposure resolver", () => {
  it("responds to a uniform -1 stop scene-light change with +1 stop ISO", () => {
    const resolved =
      resolveManualExposureMode({
        target: targetForScale(2),
        capabilities: capabilities(),
        referenceExposure,
        manualAperture: 4,
        manualShutterSeconds: 1 / 125,
        isoControl: {
          kind: "automatic",
          quantizationPolicy:
            "nearest-log2-lower-on-tie"
        }
      });

    expect(resolved.status).toBe("resolved");
    expect(resolved.isoControl).toBe("automatic");
    if (
      resolved.status !== "resolved" ||
      resolved.isoControl !== "automatic"
    ) {
      throw new Error("Expected resolved Auto ISO.");
    }

    expect(resolved.resolvedSettings).toEqual({
      aperture: 4,
      shutterSeconds: 1 / 125,
      iso: 200
    });
    expect(
      resolved.idealIsoBeforeConstraints
    ).toBeCloseTo(200, 12);
    expect(
      resolved.targetResidual.state
    ).toBe("matched");
    expect(
      resolved.apertureMutatedByResolver
    ).toBe(false);
    expect(
      resolved.shutterMutatedByResolver
    ).toBe(false);
    expect(
      resolved.isoNoiseOrGainTopologyInferred
    ).toBe(false);
  });

  it("accounts for manual optical settings relative to the explicit reference anchor", () => {
    const resolved =
      resolveManualExposureMode({
        target: targetForScale(2),
        capabilities: capabilities(),
        referenceExposure,
        manualAperture: 4,
        manualShutterSeconds: 1 / 250,
        isoControl: {
          kind: "automatic",
          quantizationPolicy:
            "nearest-log2-lower-on-tie"
        }
      });

    expect(resolved.status).toBe("resolved");
    if (
      resolved.status !== "resolved" ||
      resolved.isoControl !== "automatic"
    ) {
      throw new Error("Expected resolved Auto ISO.");
    }
    expect(
      resolved.idealIsoBeforeConstraints
    ).toBeCloseTo(400, 12);
    expect(
      resolved.resolvedSettings.iso
    ).toBe(400);
    expect(
      resolved.resolvedSettings.shutterSeconds
    ).toBe(1 / 250);
  });

  it("consumes compensated targets without reapplying compensation", () => {
    const base =
      targetForScale(2, "base");
    const compensated =
      setExposureCompensationOnMeterTarget({
        targetId: "plus-one",
        baseTarget: base,
        exposureCompensationStops: 1
      });

    const resolved =
      resolveManualExposureMode({
        target: compensated,
        capabilities: capabilities(),
        referenceExposure,
        manualAperture: 4,
        manualShutterSeconds: 1 / 125,
        isoControl: {
          kind: "automatic",
          quantizationPolicy:
            "nearest-log2-lower-on-tie"
        }
      });

    expect(resolved.status).toBe("resolved");
    if (
      resolved.status !== "resolved" ||
      resolved.isoControl !== "automatic"
    ) {
      throw new Error("Expected resolved Auto ISO.");
    }
    expect(
      resolved.resolvedSettings.iso
    ).toBe(400);
    expect(
      resolved.exposureCompensationAppliedByResolver
    ).toBe(false);
  });

  it("quantizes to the nearest ISO in log2 exposure space", () => {
    const resolved =
      resolveManualExposureMode({
        target:
          targetForScale(3),
        capabilities:
          capabilities(
            "supported",
            [100, 200, 400, 800]
          ),
        referenceExposure,
        manualAperture: 4,
        manualShutterSeconds: 1 / 125,
        isoControl: {
          kind: "automatic",
          quantizationPolicy:
            "nearest-log2-lower-on-tie"
        }
      });

    expect(resolved.status).toBe("resolved");
    if (
      resolved.status !== "resolved" ||
      resolved.isoControl !== "automatic"
    ) {
      throw new Error("Expected resolved Auto ISO.");
    }
    expect(
      resolved.idealIsoBeforeConstraints
    ).toBeCloseTo(300, 12);
    expect(
      resolved.resolvedSettings.iso
    ).toBe(400);
    expect(
      resolved.isoResolution.quantized
    ).toBe(true);
    expect(
      resolved.targetResidual
        .limitingConstraint
    ).toBe("iso-grid-quantization");
    expect(
      resolved.targetResidual.state
    ).toBe("over-target");
  });

  it("uses the lower ISO on an exact log-space tie", () => {
    const tieIso =
      Math.sqrt(200 * 400);
    const resolved =
      resolveManualExposureMode({
        target:
          targetForScale(
            tieIso / 100
          ),
        capabilities:
          capabilities(
            "supported",
            [100, 200, 400, 800]
          ),
        referenceExposure,
        manualAperture: 4,
        manualShutterSeconds: 1 / 125,
        isoControl: {
          kind: "automatic",
          quantizationPolicy:
            "nearest-log2-lower-on-tie"
        }
      });

    expect(resolved.status).toBe("resolved");
    if (
      resolved.status !== "resolved" ||
      resolved.isoControl !== "automatic"
    ) {
      throw new Error("Expected resolved Auto ISO.");
    }
    expect(
      resolved.resolvedSettings.iso
    ).toBe(200);
  });

  it("clamps at ISO maximum and reports residual under-target exposure", () => {
    const resolved =
      resolveManualExposureMode({
        target: targetForScale(256),
        capabilities: capabilities(),
        referenceExposure,
        manualAperture: 4,
        manualShutterSeconds: 1 / 125,
        isoControl: {
          kind: "automatic",
          quantizationPolicy:
            "nearest-log2-lower-on-tie"
        }
      });

    expect(resolved.status).toBe("resolved");
    if (
      resolved.status !== "resolved" ||
      resolved.isoControl !== "automatic"
    ) {
      throw new Error("Expected resolved Auto ISO.");
    }

    expect(
      resolved.idealIsoBeforeConstraints
    ).toBeCloseTo(25600, 12);
    expect(
      resolved.resolvedSettings.iso
    ).toBe(12800);
    expect(
      resolved.isoResolution.clamped
    ).toBe("maximum");
    expect(
      resolved.targetResidual
        .limitingConstraint
    ).toBe("iso-maximum");
    expect(
      resolved.targetResidual.state
    ).toBe("under-target");
    expect(
      resolved.targetResidual
        .residualStops
    ).toBeCloseTo(1, 12);
  });

  it("clamps at ISO minimum and reports residual over-target exposure", () => {
    const resolved =
      resolveManualExposureMode({
        target: targetForScale(0.25),
        capabilities: capabilities(),
        referenceExposure,
        manualAperture: 4,
        manualShutterSeconds: 1 / 125,
        isoControl: {
          kind: "automatic",
          quantizationPolicy:
            "nearest-log2-lower-on-tie"
        }
      });

    expect(resolved.status).toBe("resolved");
    if (
      resolved.status !== "resolved" ||
      resolved.isoControl !== "automatic"
    ) {
      throw new Error("Expected resolved Auto ISO.");
    }
    expect(
      resolved.resolvedSettings.iso
    ).toBe(100);
    expect(
      resolved.isoResolution.clamped
    ).toBe("minimum");
    expect(
      resolved.targetResidual.state
    ).toBe("over-target");
    expect(
      resolved.targetResidual
        .residualStops
    ).toBeCloseTo(-2, 12);
  });

  it("blocks unsupported, unknown, and no-signal Auto ISO without fabricating ISO", () => {
    const unsupported =
      resolveManualExposureMode({
        target: targetForScale(2),
        capabilities:
          capabilities("unsupported"),
        referenceExposure,
        manualAperture: 4,
        manualShutterSeconds: 1 / 125,
        isoControl: {
          kind: "automatic",
          quantizationPolicy:
            "nearest-log2-lower-on-tie"
        }
      });
    expect(unsupported).toMatchObject({
      status: "blocked",
      blocker:
        "auto-iso-unsupported"
    });

    const unknown =
      resolveManualExposureMode({
        target: targetForScale(2),
        capabilities:
          capabilities("unknown"),
        referenceExposure,
        manualAperture: 4,
        manualShutterSeconds: 1 / 125,
        isoControl: {
          kind: "automatic",
          quantizationPolicy:
            "nearest-log2-lower-on-tie"
        }
      });
    expect(unknown).toMatchObject({
      status: "blocked",
      blocker: "auto-iso-unknown"
    });

    const dark =
      resolveManualExposureMode({
        target: darkTarget(),
        capabilities: capabilities(),
        referenceExposure,
        manualAperture: 4,
        manualShutterSeconds: 1 / 125,
        isoControl: {
          kind: "automatic",
          quantizationPolicy:
            "nearest-log2-lower-on-tie"
        }
      });
    expect(dark).toMatchObject({
      status: "blocked",
      blocker: "target-no-signal"
    });
    if (dark.status !== "blocked") {
      throw new Error("Expected blocked Auto ISO.");
    }
    expect(
      "iso" in dark.resolvedSettings
    ).toBe(false);
  });
});

describe("Manual + manual ISO exposure resolver", () => {
  it("preserves all three manual axes and reports target residual only", () => {
    const result =
      resolveManualExposureMode({
        target: targetForScale(2),
        capabilities: capabilities(),
        referenceExposure,
        manualAperture: 4,
        manualShutterSeconds: 1 / 125,
        isoControl: {
          kind: "manual",
          iso: 100
        }
      });

    expect(result.status).toBe("resolved");
    expect(result.isoControl).toBe("manual");
    if (
      result.status !== "resolved" ||
      result.isoControl !== "manual"
    ) {
      throw new Error("Expected resolved manual ISO.");
    }
    expect(result.resolvedSettings).toEqual({
      aperture: 4,
      shutterSeconds: 1 / 125,
      iso: 100
    });
    expect(
      result.targetResidual.status
    ).toBe("resolved");
    if (
      result.targetResidual.status !==
      "resolved"
    ) {
      throw new Error(
        "Expected resolved target residual."
      );
    }
    expect(
      result.targetResidual.state
    ).toBe("under-target");
    expect(
      result.targetResidual
        .residualStops
    ).toBeCloseTo(1, 12);
  });

  it("changes diagnostics but not settings when compensation changes", () => {
    const base =
      targetForScale(2, "base");
    const compensated =
      setExposureCompensationOnMeterTarget({
        targetId: "plus",
        baseTarget: base,
        exposureCompensationStops: 1
      });

    const result =
      resolveManualExposureMode({
        target: compensated,
        capabilities: capabilities(),
        referenceExposure,
        manualAperture: 4,
        manualShutterSeconds: 1 / 125,
        isoControl: {
          kind: "manual",
          iso: 100
        }
      });

    expect(result.status).toBe("resolved");
    if (
      result.status !== "resolved" ||
      result.isoControl !== "manual"
    ) {
      throw new Error("Expected resolved manual ISO.");
    }
    expect(result.resolvedSettings.iso)
      .toBe(100);
    expect(
      result.targetResidual.status
    ).toBe("resolved");
    if (
      result.targetResidual.status !==
      "resolved"
    ) {
      throw new Error(
        "Expected resolved target residual."
      );
    }
    expect(
      result.targetResidual
        .residualStops
    ).toBeCloseTo(2, 12);
  });

  it("preserves manual settings even when the target is no-signal", () => {
    const result =
      resolveManualExposureMode({
        target: darkTarget(),
        capabilities: capabilities(),
        referenceExposure,
        manualAperture: 4,
        manualShutterSeconds: 1 / 125,
        isoControl: {
          kind: "manual",
          iso: 100
        }
      });

    expect(result.status).toBe("resolved");
    if (
      result.status !== "resolved" ||
      result.isoControl !== "manual"
    ) {
      throw new Error("Expected resolved manual ISO.");
    }
    expect(result.resolvedSettings.iso)
      .toBe(100);
    expect(
      result.targetResidual
    ).toEqual({
      status:
        "target-unresolved",
      state:
        "target-unresolved",
      reason: "no-signal-target"
    });
  });
});

describe("Manual resolver fail-closed capability and input guards", () => {
  it("rejects unsupported manual settings instead of silently clamping them", () => {
    expect(() =>
      resolveManualExposureMode({
        target: targetForScale(1),
        capabilities: capabilities(),
        referenceExposure,
        manualAperture: 20,
        manualShutterSeconds: 1 / 125,
        isoControl: {
          kind: "manual",
          iso: 100
        }
      })
    ).toThrow(
      "manualAperture lies outside"
    );

    expect(() =>
      resolveManualExposureMode({
        target: targetForScale(1),
        capabilities: capabilities(),
        referenceExposure,
        manualAperture: 4,
        manualShutterSeconds: 1 / 125,
        isoControl: {
          kind: "manual",
          iso: 150
        }
      })
    ).toThrow(
      "isoControl.iso is not present"
    );
  });

  it("rejects an invalid relative reference anchor", () => {
    expect(() =>
      resolveManualExposureMode({
        target: targetForScale(1),
        capabilities: capabilities(),
        referenceExposure: {
          ...referenceExposure,
          iso: 150
        },
        manualAperture: 4,
        manualShutterSeconds: 1 / 125,
        isoControl: {
          kind: "automatic",
          quantizationPolicy:
            "nearest-log2-lower-on-tie"
        }
      })
    ).toThrow(
      "referenceExposure.iso is not present"
    );
  });

  it("rejects unknown ISO-control and quantization policies at runtime", () => {
    expect(() =>
      resolveManualExposureMode({
        target: targetForScale(1),
        capabilities: capabilities(),
        referenceExposure,
        manualAperture: 4,
        manualShutterSeconds: 1 / 125,
        isoControl: {
          kind: "magic"
        } as never
      })
    ).toThrow(
      "isoControl.kind is invalid"
    );

    expect(() =>
      resolveManualExposureMode({
        target: targetForScale(1),
        capabilities: capabilities(),
        referenceExposure,
        manualAperture: 4,
        manualShutterSeconds: 1 / 125,
        isoControl: {
          kind: "automatic",
          quantizationPolicy:
            "always-up"
        } as never
      })
    ).toThrow(
      "quantizationPolicy"
    );
  });

  it("rejects forged capability ranges and target boundary drift", () => {
    const caps = capabilities();
    expect(() =>
      resolveManualExposureMode({
        target: targetForScale(1),
        capabilities: {
          ...caps,
          iso: {
            ...caps.iso,
            minimum: 1000,
            maximum: 100
          }
        },
        referenceExposure,
        manualAperture: 4,
        manualShutterSeconds: 1 / 125,
        isoControl: {
          kind: "manual",
          iso: 100
        }
      })
    ).toThrow(
      "capabilities ISO range is invalid"
    );

    expect(() =>
      resolveManualExposureMode({
        target: {
          ...targetForScale(1),
          automaticExposureResolved:
            true as never
        },
        capabilities: capabilities(),
        referenceExposure,
        manualAperture: 4,
        manualShutterSeconds: 1 / 125,
        isoControl: {
          kind: "manual",
          iso: 100
        }
      })
    ).toThrow(
      "does not satisfy the exposure-mode resolver boundary"
    );
  });
});

describe("Manual + continuous Auto ISO resolution", () => {
  const continuousCapabilities = (): ResolvedGenericEquipmentExposureCapabilities => {
    const base = capabilities();
    return {
      ...base,
      iso: {
        ...base.iso,
        settingGrid: {
          kind: "continuous-within-range"
        }
      }
    };
  };

  it("uses the exact ideal ISO when it lies inside a continuous range", () => {
    const result =
      resolveManualExposureMode({
        target: targetForScale(2.5),
        capabilities:
          continuousCapabilities(),
        referenceExposure,
        manualAperture: 4,
        manualShutterSeconds: 1 / 125,
        isoControl: {
          kind: "automatic",
          quantizationPolicy:
            "nearest-log2-lower-on-tie"
        }
      });

    expect(result.status).toBe("resolved");
    if (
      result.status !== "resolved" ||
      result.isoControl !== "automatic"
    ) {
      throw new Error("Expected resolved Auto ISO.");
    }
    expect(
      result.resolvedSettings.iso
    ).toBeCloseTo(250, 12);
    expect(
      result.isoResolution.kind
    ).toBe("continuous");
    expect(
      result.isoResolution.quantized
    ).toBe(false);
    expect(
      result.isoResolution.clamped
    ).toBe(false);
    expect(
      result.targetResidual.state
    ).toBe("matched");
  });

  it("clamps a continuous ISO range at its minimum and maximum", () => {
    const low =
      resolveManualExposureMode({
        target: targetForScale(0.5),
        capabilities:
          continuousCapabilities(),
        referenceExposure,
        manualAperture: 4,
        manualShutterSeconds: 1 / 125,
        isoControl: {
          kind: "automatic",
          quantizationPolicy:
            "nearest-log2-lower-on-tie"
        }
      });
    const high =
      resolveManualExposureMode({
        target: targetForScale(256),
        capabilities:
          continuousCapabilities(),
        referenceExposure,
        manualAperture: 4,
        manualShutterSeconds: 1 / 125,
        isoControl: {
          kind: "automatic",
          quantizationPolicy:
            "nearest-log2-lower-on-tie"
        }
      });

    if (
      low.status !== "resolved" ||
      low.isoControl !== "automatic" ||
      high.status !== "resolved" ||
      high.isoControl !== "automatic"
    ) {
      throw new Error("Expected resolved continuous Auto ISO.");
    }

    expect(low.resolvedSettings.iso)
      .toBe(100);
    expect(low.isoResolution.clamped)
      .toBe("minimum");
    expect(
      low.targetResidual
        .limitingConstraint
    ).toBe("iso-minimum");

    expect(high.resolvedSettings.iso)
      .toBe(12800);
    expect(high.isoResolution.clamped)
      .toBe("maximum");
    expect(
      high.targetResidual
        .limitingConstraint
    ).toBe("iso-maximum");
  });

  it("fails closed if the ideal ISO calculation overflows", () => {
    const target = targetForScale(1);
    if (target.status !== "resolved") {
      throw new Error(
        "Expected resolved overflow-test target."
      );
    }
    const overflowTarget:
      ExposureMeterTarget = {
        ...target,
        requiredExposureScaleToTarget:
          Number.MAX_VALUE,
        exposureOffsetStopsToTarget:
          Math.log2(
            Number.MAX_VALUE
          )
      };

    expect(() =>
      resolveManualExposureMode({
        target: overflowTarget,
        capabilities:
          continuousCapabilities(),
        referenceExposure: {
          ...referenceExposure,
          iso: 12800
        },
        manualAperture: 4,
        manualShutterSeconds: 1 / 125,
        isoControl: {
          kind: "automatic",
          quantizationPolicy:
            "nearest-log2-lower-on-tie"
        }
      })
    ).toThrow(
      "Ideal Auto ISO must remain finite"
    );
  });
});

