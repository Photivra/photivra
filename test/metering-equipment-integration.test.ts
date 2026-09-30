import { describe, expect, it } from "vitest";

import {
  assessExposureMeteringProfileCompatibility,
  createExposureMeterTargetFromMeteringResult,
  meterRelativeExposure,
  parseExposureMeteringProfile,
  parseGenericBodyExposureCapabilityProfile,
  parseGenericBodyMeteringCapabilityProfile,
  parseGenericLensExposureCapabilityProfile,
  resolveCaptureGeometry,
  resolveGenericEquipmentExposureCapabilities,
  resolveManualExposureMode,
  setExposureCompensationOnMeterTarget
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

const meteringProfile = (): ReturnType<typeof parseExposureMeteringProfile> =>
  parseExposureMeteringProfile({
    schemaVersion: "0.1.0",
    profileId: "generic-multi-zone",
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
      evidence: evidence("meter-target")
    },
    evidence: evidence("meter-profile"),
    limitations: [
      "Educational relative metering profile."
    ]
  });

const bodyMeteringCapabilities = (): ReturnType<typeof parseGenericBodyMeteringCapabilityProfile> =>
  parseGenericBodyMeteringCapabilityProfile({
    schemaVersion: "0.1.0",
    profileId: "generic-body-metering",
    profileVersion: "1.0.0",
    scientificStatus: "approximation",
    evidence: evidence("body-metering"),
    supportedMeteringProfiles: [
      {
        meteringProfileId:
          "generic-multi-zone",
        policyKind:
          "multi-zone-uniform",
        evidence: evidence("multi-zone")
      },
      {
        meteringProfileId:
          "generic-spot",
        policyKind: "spot",
        evidence: evidence("spot")
      }
    ],
    spotFocusPointLinkage: {
      availability: "supported",
      evidence: evidence("spot-focus-link")
    }
  });

const exposureCapabilities = (): ReturnType<typeof resolveGenericEquipmentExposureCapabilities> => {
  const body =
    parseGenericBodyExposureCapabilityProfile({
      schemaVersion: "0.1.0",
      profileId: "generic-body-exposure",
      profileVersion: "1.0.0",
      scientificStatus: "approximation",
      evidence: evidence("body-exposure"),
      shutter: {
        durationSecondsRange: {
          value: {
            minimum: 1 / 8000,
            maximum: 30
          },
          evidence: evidence("shutter-range")
        },
        settingGrid: {
          kind: "continuous-within-range"
        }
      },
      iso: {
        range: {
          value: {
            minimum: 100,
            maximum: 6400
          },
          evidence: evidence("iso-range")
        },
        settingGrid: {
          kind: "continuous-within-range"
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
      profileId: "generic-lens",
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

const captureGeometry =
  resolveCaptureGeometry({
    imagingArea: {
      widthMm: 36,
      heightMm: 24
    },
    nativeRaster: {
      pixelWidth: 600,
      pixelHeight: 400
    },
    orientation: "landscape"
  }).value;

const meter = (
  relativeLinearSignal: number,
  sceneStateId: string
): ReturnType<typeof meterRelativeExposure> =>
  meterRelativeExposure({
    profile: meteringProfile(),
    sampleSet: {
      measurementId:
        "measurement-" + sceneStateId,
      sceneStateId,
      inputDomain:
        "relative-pre-exposure-linear-signal",
      captureRegion:
        "oriented-active-capture",
      captureGeometry,
      processingState: {
        exposureSettingsApplied: false,
        whiteBalanceApplied: false,
        toneMappingApplied: false,
        displayGammaApplied: false,
        sharpeningApplied: false
      },
      samples: [
        {
          sampleId: "center",
          positionOrientedCaptureUv: {
            u: 0.5,
            v: 0.5
          },
          relativeLinearSignal,
          areaWeight: 1
        }
      ]
    }
  });

describe("generic body metering capabilities", () => {
  it("accepts a declared metering profile without duplicating its target policy", () => {
    const assessment =
      assessExposureMeteringProfileCompatibility({
        bodyCapabilities:
          bodyMeteringCapabilities(),
        meteringProfile:
          meteringProfile()
      });

    expect(assessment).toMatchObject({
      status: "compatible",
      meteringProfile: {
        profileId:
          "generic-multi-zone",
        policyKind:
          "multi-zone-uniform"
      },
      targetPolicyOwnership:
        "metering-profile",
      targetCalibrationDuplicatedInEquipmentProfile:
        false,
      spotFocusPointLinkageAvailability:
        "supported",
      blockers: []
    });
  });

  it("fails closed when a profile ID is unsupported or its declared policy drifts", () => {
    const unsupported =
      assessExposureMeteringProfileCompatibility({
        bodyCapabilities:
          bodyMeteringCapabilities(),
        meteringProfile:
          parseExposureMeteringProfile({
            ...meteringProfile(),
            profileId: "other-profile"
          })
      });

    expect(unsupported).toMatchObject({
      status: "blocked",
      blockers: [
        "metering-profile-unsupported"
      ]
    });

    const mismatch =
      assessExposureMeteringProfileCompatibility({
        bodyCapabilities:
          bodyMeteringCapabilities(),
        meteringProfile:
          parseExposureMeteringProfile({
            ...meteringProfile(),
            profileId: "generic-spot"
          })
      });

    expect(mismatch).toMatchObject({
      status: "blocked",
      blockers: [
        "metering-policy-mismatch"
      ]
    });
  });
});

describe("metering to automatic-exposure integration", () => {
  it("turns a uniform minus-one-EV scene-light change into plus-one-EV Auto ISO", () => {
    const bright =
      createExposureMeterTargetFromMeteringResult({
        targetId: "bright-target",
        meterResult:
          meter(1, "scene-bright").value
      });
    const dark =
      createExposureMeterTargetFromMeteringResult({
        targetId: "dark-target",
        meterResult:
          meter(0.5, "scene-dark").value
      });

    const input = {
      capabilities:
        exposureCapabilities(),
      referenceExposure: {
        aperture: 4,
        shutterSeconds: 1 / 125,
        iso: 100
      },
      manualAperture: 4,
      manualShutterSeconds: 1 / 125,
      isoControl: {
        kind: "automatic" as const,
        quantizationPolicy:
          "nearest-log2-lower-on-tie" as const
      }
    };

    const brightResolved =
      resolveManualExposureMode({
        target: bright,
        ...input
      });
    const darkResolved =
      resolveManualExposureMode({
        target: dark,
        ...input
      });

    expect(brightResolved.status)
      .toBe("resolved");
    expect(darkResolved.status)
      .toBe("resolved");

    if (
      brightResolved.status !==
        "resolved" ||
      darkResolved.status !==
        "resolved"
    ) {
      throw new Error(
        "Expected resolved Auto ISO."
      );
    }

    expect(
      brightResolved.resolvedSettings.iso
    ).toBeCloseTo(100, 12);
    expect(
      darkResolved.resolvedSettings.iso
    ).toBeCloseTo(200, 12);
    expect(
      Math.log2(
        darkResolved.resolvedSettings.iso /
          brightResolved.resolvedSettings.iso
      )
    ).toBeCloseTo(1, 12);
  });

  it("keeps exposure compensation downstream and preserves the frozen meter snapshot for AE lock", () => {
    const meterResult =
      meter(0.5, "scene-a").value;
    const base =
      createExposureMeterTargetFromMeteringResult({
        targetId: "base",
        meterResult
      });
    const compensated =
      setExposureCompensationOnMeterTarget({
        targetId: "plus-one",
        baseTarget: base,
        exposureCompensationStops: 1
      });

    expect(base.sourceMeterSnapshot)
      .toEqual(
        compensated.sourceMeterSnapshot
      );
    expect(base.exposureCompensationStops)
      .toBe(0);
    expect(
      compensated.exposureCompensationStops
    ).toBe(1);
    expect(
      compensated.meterMeasurementMutated
    ).toBe(false);

    const resolved =
      resolveManualExposureMode({
        target: compensated,
        capabilities:
          exposureCapabilities(),
        referenceExposure: {
          aperture: 4,
          shutterSeconds: 1 / 125,
          iso: 100
        },
        manualAperture: 4,
        manualShutterSeconds: 1 / 125,
        isoControl: {
          kind: "automatic",
          quantizationPolicy:
            "nearest-log2-lower-on-tie"
        }
      });

    if (resolved.status !== "resolved") {
      throw new Error(
        "Expected resolved compensated Auto ISO."
      );
    }

    expect(
      resolved.resolvedSettings.iso
    ).toBeCloseTo(400, 12);
    expect(
      resolved.exposureCompensationAppliedByResolver
    ).toBe(false);
  });

  it("is deterministic for identical final meter and resolver state", () => {
    const target =
      createExposureMeterTargetFromMeteringResult({
        targetId: "locked",
        meterResult:
          meter(0.5, "scene-locked").value
      });
    const input = {
      target,
      capabilities:
        exposureCapabilities(),
      referenceExposure: {
        aperture: 4,
        shutterSeconds: 1 / 125,
        iso: 100
      },
      manualAperture: 4,
      manualShutterSeconds: 1 / 125,
      isoControl: {
        kind: "automatic" as const,
        quantizationPolicy:
          "nearest-log2-lower-on-tie" as const
      }
    };

    expect(
      resolveManualExposureMode(input)
    ).toEqual(
      resolveManualExposureMode(input)
    );
  });
});
