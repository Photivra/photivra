import { describe, expect, it } from "vitest";

import {
  meterRelativeExposure,
  parseExposureMeteringProfile,
  resolveCaptureGeometry,
  type ExposureMeteringProfile,
  type ExposureMeteringSampleSet,
  type ResolvedCaptureGeometry
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

const geometry = (
  orientation:
    | "landscape"
    | "portrait-clockwise" =
      "landscape",
  withOutputCrop = false
): ResolvedCaptureGeometry =>
  resolveCaptureGeometry({
    imagingArea: {
      widthMm: 36,
      heightMm: 24
    },
    nativeRaster: {
      pixelWidth: 6000,
      pixelHeight: 4000
    },
    orientation,
    ...(withOutputCrop
      ? {
          outputCropRect: {
            x: 1000,
            y: 1000,
            width: 4000,
            height: 2000
          },
          outputRaster: {
            pixelWidth: 2000,
            pixelHeight: 1000
          }
        }
      : {})
  }).value;

const profileInput = (
  policy: Record<string, unknown> = {
    kind: "multi-zone-uniform"
  }
): Record<string, unknown> => ({
  schemaVersion: "0.1.0",
  profileId: "generic-meter",
  scientificStatus: "approximation",
  inputDomain:
    "relative-pre-exposure-linear-signal",
  captureRegion:
    "oriented-active-capture",
  policy,
  target: {
    kind: "relative-signal-reference",
    targetRelativeSignal: 1,
    evidence: evidence("target")
  },
  evidence: evidence("meter"),
  limitations: [
    "Generic educational relative meter."
  ]
});

const profile = (
  policy?: Record<string, unknown>
): ExposureMeteringProfile =>
  parseExposureMeteringProfile(
    profileInput(policy)
  );

const sampleSet = (
  signals: readonly number[],
  options: {
    positions?: readonly {
      u: number;
      v: number;
    }[];
    areaWeights?: readonly number[];
    captureGeometry?:
      ResolvedCaptureGeometry;
    processingOverride?:
      Partial<
        ExposureMeteringSampleSet["processingState"]
      >;
    measurementId?: string;
    sceneStateId?: string;
  } = {}
): ExposureMeteringSampleSet => {
  const positions =
    options.positions ??
    signals.map(
      (_, index) => ({
        u:
          signals.length === 1
            ? 0.5
            : index /
              (signals.length - 1),
        v: 0.5
      })
    );
  const weights =
    options.areaWeights ??
    signals.map(() => 1);

  return {
    measurementId:
      options.measurementId ??
      "measurement-1",
    sceneStateId:
      options.sceneStateId ??
      "scene-state-1",
    inputDomain:
      "relative-pre-exposure-linear-signal",
    captureRegion:
      "oriented-active-capture",
    captureGeometry:
      options.captureGeometry ??
      geometry(),
    processingState: {
      exposureSettingsApplied: false,
      whiteBalanceApplied: false,
      toneMappingApplied: false,
      displayGammaApplied: false,
      sharpeningApplied: false,
      ...options.processingOverride
    },
    samples: signals.map(
      (relativeLinearSignal, index) => ({
        sampleId:
          "sample-" + index,
        positionOrientedCaptureUv:
          positions[index]!,
        relativeLinearSignal,
        areaWeight: weights[index]!
      })
    )
  };
};

describe("exposure metering profile", () => {
  it("parses all four explicit generic metering policy families", () => {
    expect(
      profile().policy.kind
    ).toBe("multi-zone-uniform");

    expect(
      profile({
        kind:
          "center-weighted-radial",
        edgeWeight: 0.2,
        exponent: 2
      }).policy
    ).toEqual({
      kind:
        "center-weighted-radial",
      edgeWeight: 0.2,
      exponent: 2
    });

    expect(
      profile({
        kind: "spot",
        centerOrientedCaptureUv: {
          u: 0.25,
          v: 0.75
        },
        radiusFractionOfCaptureDiagonal:
          0.05
      }).policy
    ).toEqual({
      kind: "spot",
      centerOrientedCaptureUv: {
        u: 0.25,
        v: 0.75
      },
      radiusFractionOfCaptureDiagonal:
        0.05
    });

    expect(
      profile({
        kind: "highlight-weighted",
        minimumWeightFraction: 0.1,
        exponent: 2
      }).policy
    ).toEqual({
      kind: "highlight-weighted",
      minimumWeightFraction: 0.1,
      exponent: 2
    });
  });

  it("keeps schema 0.1.0 relative and approximation-only", () => {
    expect(() =>
      parseExposureMeteringProfile({
        ...profileInput(),
        scientificStatus: "calibrated"
      })
    ).toThrow(
      'scientificStatus must be "approximation"'
    );

    expect(() =>
      parseExposureMeteringProfile({
        ...profileInput(),
        inputDomain: "luminance-cd-m2"
      })
    ).toThrow("inputDomain");

    expect(() =>
      parseExposureMeteringProfile({
        ...profileInput(),
        captureRegion: "output-crop"
      })
    ).toThrow("captureRegion");
  });

  it("fails closed on invalid policy parameters and target semantics", () => {
    expect(() =>
      profile({
        kind: "spot",
        centerOrientedCaptureUv: {
          u: 0.5,
          v: 0.5
        },
        radiusFractionOfCaptureDiagonal:
          2
      })
    ).toThrow(
      "radiusFractionOfCaptureDiagonal must be at most 1"
    );

    expect(() =>
      profile({
        kind:
          "center-weighted-radial",
        edgeWeight: 0.2,
        exponent: 0
      })
    ).toThrow(
      "exponent must be greater than zero"
    );

    expect(() =>
      profile({
        kind: "highlight-weighted",
        minimumWeightFraction: 1.5,
        exponent: 1
      })
    ).toThrow(
      "minimumWeightFraction must be a finite fraction"
    );

    expect(() =>
      parseExposureMeteringProfile({
        ...profileInput(),
        target: {
          kind:
            "relative-signal-reference",
          targetRelativeSignal: 0,
          evidence: evidence("target")
        }
      })
    ).toThrow(
      "targetRelativeSignal must be greater than zero"
    );

    expect(() =>
      profile({
        kind: "manufacturer-magic"
      })
    ).toThrow("policy.kind is invalid");
  });
});

describe("relative exposure metering", () => {
  it("preserves the controlled -1 EV scene-light -> +1 stop-to-target invariant", () => {
    const meterProfile = profile();

    const baseline =
      meterRelativeExposure({
        profile: meterProfile,
        sampleSet: sampleSet([
          1,
          1,
          1,
          1
        ], {
          sceneStateId:
            "scene-baseline"
        })
      });
    const darker =
      meterRelativeExposure({
        profile: meterProfile,
        sampleSet: sampleSet([
          0.5,
          0.5,
          0.5,
          0.5
        ], {
          sceneStateId:
            "scene-minus-one-stop",
          measurementId:
            "measurement-2"
        })
      });

    expect(
      baseline.value.status
    ).toBe("resolved");
    expect(
      darker.value.status
    ).toBe("resolved");

    if (
      baseline.value.status !==
        "resolved" ||
      darker.value.status !==
        "resolved"
    ) {
      throw new Error(
        "Expected resolved relative meter results."
      );
    }

    expect(
      baseline.value
        .exposureOffsetStopsToTarget
    ).toBeCloseTo(0, 12);
    expect(
      darker.value
        .exposureOffsetStopsToTarget
    ).toBeCloseTo(1, 12);
    expect(
      darker.value
        .requiredExposureScaleToTarget
    ).toBeCloseTo(2, 12);
    expect(
      darker.value.sceneStateId
    ).toBe("scene-minus-one-stop");
    expect(
      darker.value
        .automaticExposureResolved
    ).toBe(false);
  });

  it("uses active capture geometry and ignores final output crop", () => {
    const meterProfile = profile();
    const full =
      meterRelativeExposure({
        profile: meterProfile,
        sampleSet: sampleSet([
          0.5,
          1
        ])
      }).value;
    const cropped =
      meterRelativeExposure({
        profile: meterProfile,
        sampleSet: sampleSet(
          [0.5, 1],
          {
            captureGeometry:
              geometry(
                "landscape",
                true
              ),
            measurementId:
              "cropped-output"
          }
        )
      }).value;

    expect(
      cropped.meteredRelativeSignal
    ).toBeCloseTo(
      full.meteredRelativeSignal,
      12
    );
    expect(
      cropped.outputCropUsedForMetering
    ).toBe(false);
    expect(
      cropped
        .activeCaptureImagingAreaMm
    ).toEqual({
      width: 36,
      height: 24
    });
  });

  it("carries physical orientation without treating the display box as meter geometry", () => {
    const result =
      meterRelativeExposure({
        profile: profile(),
        sampleSet: sampleSet(
          [1],
          {
            captureGeometry:
              geometry(
                "portrait-clockwise"
              )
          }
        )
      }).value;

    expect(result.orientation).toBe(
      "portrait-clockwise"
    );
    expect(
      result
        .activeCaptureImagingAreaMm
    ).toEqual({
      width: 24,
      height: 36
    });
    expect(
      result.finalToneMappingUsed
    ).toBe(false);
    expect(
      result.displayGammaUsed
    ).toBe(false);
  });

  it("weights the physical frame center explicitly", () => {
    const positions = [
      {
        u: 0.5,
        v: 0.5
      },
      {
        u: 0,
        v: 0
      }
    ];
    const multi =
      meterRelativeExposure({
        profile: profile(),
        sampleSet: sampleSet(
          [1, 0],
          { positions }
        )
      }).value;
    const center =
      meterRelativeExposure({
        profile: profile({
          kind:
            "center-weighted-radial",
          edgeWeight: 0.2,
          exponent: 1
        }),
        sampleSet: sampleSet(
          [1, 0],
          {
            positions,
            measurementId:
              "center"
          }
        )
      }).value;

    expect(
      multi.meteredRelativeSignal
    ).toBeCloseTo(0.5, 12);
    expect(
      center.meteredRelativeSignal
    ).toBeGreaterThan(
      multi.meteredRelativeSignal
    );
    expect(center.policyKind).toBe(
      "center-weighted-radial"
    );
  });

  it("spot metering selects only samples inside its physical-frame spot", () => {
    const result =
      meterRelativeExposure({
        profile: profile({
          kind: "spot",
          centerOrientedCaptureUv: {
            u: 0.5,
            v: 0.5
          },
          radiusFractionOfCaptureDiagonal:
            0.05
        }),
        sampleSet: sampleSet(
          [0.8, 0.1, 0.2],
          {
            positions: [
              {
                u: 0.5,
                v: 0.5
              },
              {
                u: 0.1,
                v: 0.1
              },
              {
                u: 0.9,
                v: 0.9
              }
            ]
          }
        )
      }).value;

    expect(
      result.selectedSampleCount
    ).toBe(1);
    expect(
      result.meteredRelativeSignal
    ).toBeCloseTo(0.8, 12);
  });

  it("highlight weighting increases the influence of bright samples without clipping them", () => {
    const uniform =
      meterRelativeExposure({
        profile: profile(),
        sampleSet: sampleSet([
          1,
          0.1
        ])
      }).value;
    const highlight =
      meterRelativeExposure({
        profile: profile({
          kind:
            "highlight-weighted",
          minimumWeightFraction: 0.1,
          exponent: 1
        }),
        sampleSet: sampleSet(
          [1, 0.1],
          {
            measurementId:
              "highlight"
          }
        )
      }).value;

    expect(
      highlight.meteredRelativeSignal
    ).toBeGreaterThan(
      uniform.meteredRelativeSignal
    );
    expect(highlight.policyKind)
      .toBe("highlight-weighted");
  });

  it("respects producer area weights independently from policy weights", () => {
    const result =
      meterRelativeExposure({
        profile: profile(),
        sampleSet: sampleSet(
          [1, 0],
          {
            areaWeights: [3, 1]
          }
        )
      }).value;

    expect(
      result.meteredRelativeSignal
    ).toBeCloseTo(0.75, 12);
  });

  it("returns a finite no-signal state instead of fabricating infinite exposure", () => {
    const result =
      meterRelativeExposure({
        profile: profile(),
        sampleSet: sampleSet([
          0,
          0
        ])
      }).value;

    expect(result.status).toBe(
      "no-signal"
    );
    if (
      result.status !==
      "no-signal"
    ) {
      throw new Error(
        "Expected no-signal meter result."
      );
    }
    expect(
      result.requiredExposureScaleResolved
    ).toBe(false);
    expect(
      result.exposureOffsetStopsResolved
    ).toBe(false);
    expect(
      result.resultReusableForAeLock
    ).toBe(true);
  });

  it("rejects final/display processing and domain drift", () => {
    expect(() =>
      meterRelativeExposure({
        profile: profile(),
        sampleSet: sampleSet(
          [1],
          {
            processingOverride: {
              toneMappingApplied:
                true as never
            }
          }
        )
      })
    ).toThrow(
      "requires pre-exposure linear samples"
    );

    expect(() =>
      meterRelativeExposure({
        profile: profile(),
        sampleSet: {
          ...sampleSet([1]),
          inputDomain:
            "display-rgb" as never
        }
      })
    ).toThrow(
      "inputDomain must match"
    );

    expect(() =>
      meterRelativeExposure({
        profile: profile(),
        sampleSet: {
          ...sampleSet([1]),
          captureRegion:
            "output-crop" as never
        }
      })
    ).toThrow(
      "captureRegion must match"
    );
  });

  it("rejects malformed samples and duplicate sample identity", () => {
    expect(() =>
      meterRelativeExposure({
        profile: profile(),
        sampleSet: {
          ...sampleSet([1]),
          samples: []
        }
      })
    ).toThrow(
      "samples must be a non-empty array"
    );

    const duplicate =
      sampleSet([1, 1]);
    expect(() =>
      meterRelativeExposure({
        profile: profile(),
        sampleSet: {
          ...duplicate,
          samples:
            duplicate.samples.map(
              (sample) => ({
                ...sample,
                sampleId: "same"
              })
            )
        }
      })
    ).toThrow(
      "sampleId must not contain duplicates"
    );

    expect(() =>
      meterRelativeExposure({
        profile: profile(),
        sampleSet: {
          ...sampleSet([1]),
          samples: [
            {
              sampleId: "bad",
              positionOrientedCaptureUv: {
                u: 1.1,
                v: 0.5
              },
              relativeLinearSignal:
                1,
              areaWeight: 1
            }
          ]
        }
      })
    ).toThrow(
      "coordinates must lie within [0, 1]"
    );

    expect(() =>
      meterRelativeExposure({
        profile: profile(),
        sampleSet: {
          ...sampleSet([1]),
          samples: [
            {
              sampleId: "bad",
              positionOrientedCaptureUv: {
                u: 0.5,
                v: 0.5
              },
              relativeLinearSignal:
                -1,
              areaWeight: 1
            }
          ]
        }
      })
    ).toThrow(
      "relativeLinearSignal must be greater than or equal to zero"
    );
  });

  it("fails closed when a spot policy selects no samples", () => {
    expect(() =>
      meterRelativeExposure({
        profile: profile({
          kind: "spot",
          centerOrientedCaptureUv: {
            u: 0,
            v: 0
          },
          radiusFractionOfCaptureDiagonal:
            0.001
        }),
        sampleSet: sampleSet(
          [1],
          {
            positions: [
              {
                u: 1,
                v: 1
              }
            ]
          }
        )
      })
    ).toThrow(
      "selected no samples with positive weight"
    );
  });
});
