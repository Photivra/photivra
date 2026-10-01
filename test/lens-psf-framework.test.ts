import { describe, expect, it } from "vitest";

import {
  assessMtfOnlyPsfRenderability,
  calculateLensComplexPupilPsf,
  parseLensComplexPupilProfile,
  parseLensMtfDiagnosticProfile,
  parseLensSampledPsfProfile,
  resolveLensSampledPsf,
  type LensComplexPupilProfile,
  type LensPsfKernel,
  type LensSampledPsfGridCoordinate,
  type LensSampledPsfGridNode,
  type LensSampledPsfProfile
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

function kernelFor(
  fieldXmm: number,
  wavelengthNm: number,
  defocusUm: number
): LensPsfKernel {
  const values =
    new Array<number>(9)
      .fill(0);
  values[4] = 0.4;
  values[
    fieldXmm < 0
      ? 3
      : 5
  ] = 0.3;
  values[
    wavelengthNm < 550
      ? 1
      : 7
  ] = 0.2;
  values[
    defocusUm < 0
      ? 0
      : 8
  ] = 0.1;

  return {
    widthSamples: 3,
    heightSamples: 3,
    samplePitchMicrometersX: 2,
    samplePitchMicrometersY: 2,
    centerSampleX: 1,
    centerSampleY: 1,
    normalizedIntensity:
      values
  };
}

const coordinates =
  (): readonly LensSampledPsfGridCoordinate[] => {
    const result:
      LensSampledPsfGridCoordinate[] =
      [];
    for (
      const fieldXmm of
      [-10, 10]
    ) {
      for (
        const wavelengthNm of
        [500, 600]
      ) {
        for (
          const signedDefocusImagePlaneMicrometers of
          [-50, 50]
        ) {
          result.push({
            focalLengthMm: 50,
            focusDiopters: 0.2,
            apertureFNumber: 2,
            fieldXmm,
            fieldYmm: 0,
            wavelengthNm,
            signedDefocusImagePlaneMicrometers
          });
        }
      }
    }
    return result;
  };

function nodeFor(
  coordinate:
    LensSampledPsfGridCoordinate,
  index: number
): LensSampledPsfGridNode {
  return {
    nodeId:
      "node-" +
      index.toString(),
    coordinate,
    kernel:
      kernelFor(
        coordinate.fieldXmm,
        coordinate.wavelengthNm,
        coordinate
          .signedDefocusImagePlaneMicrometers
      ),
    bestFocusImagePlaneOffsetMicrometers:
      coordinate.fieldXmm *
        0.1 +
      (
        coordinate.wavelengthNm -
        550
      ) *
        0.02,
    relativePupilThroughputFactor:
      coordinate.fieldXmm < 0
        ? 0.85
        : 0.75,
    evidence:
      evidence(
        "node-" +
        index.toString()
      ),
    uncertainty: {
      kind: "not-quantified",
      limitation:
        "Synthetic test profile."
    }
  };
}

function sampledProfile():
  LensSampledPsfProfile {
  const nodes =
    coordinates().map(
      nodeFor
    );
  return parseLensSampledPsfProfile({
    schemaVersion: "0.1.0",
    profileId:
      "generic-sampled-psf",
    profileVersion: "1.0.0",
    scientificStatus:
      "approximation",
    opticalDomain:
      "lens-primary-optical-path-only",
    coordinateSystem:
      "image-plane-metric",
    fieldAxes:
      "+X right, +Y up",
    kernelEnergyNormalization:
      "unit-energy-shape",
    interpolation:
      "bounded-regular-grid-multilinear",
    throughputOwnership:
      "separate-relative-pupil-throughput-factor",
    responseIncludes: {
      diffraction: true,
      aberration: true,
      defocus: true,
      pupilClippingShape:
        true
    },
    sensorOpticalStackIncluded:
      false,
    sensorSamplingIncluded:
      false,
    reconstructionIncluded:
      false,
    strayLightIncluded: false,
    axes: {
      focalLengthMm: [50],
      focusDiopters: [0.2],
      apertureFNumber: [2],
      fieldXmm: [-10, 10],
      fieldYmm: [0],
      wavelengthNm: [
        500,
        600
      ],
      signedDefocusImagePlaneMicrometers: [
        -50,
        50
      ]
    },
    nodes,
    evidence:
      evidence("profile"),
    limitations: [
      "Synthetic sampled PSF test profile."
    ]
  });
}

describe("sampled lens PSF profiles", () => {
  it("resolves an exact grid sample without changing its 2D orientation", () => {
    const profile =
      sampledProfile();
    const result =
      resolveLensSampledPsf({
        profile,
        focalLengthMm: 50,
        focus: {
          kind: "finite",
          distanceM: 5
        },
        apertureFNumber: 2,
        fieldPointMm: {
          x: -10,
          y: 0
        },
        wavelengthNm: 500,
        signedDefocusImagePlaneMicrometers:
          -50
      }).value;

    expect(
      result.resolutionStatus
    ).toBe(
      "exact-grid-sample"
    );
    expect(
      result.sourceNodes
    ).toHaveLength(1);
    expect(
      result.kernel
        .normalizedIntensity
    ).toEqual(
      kernelFor(
        -10,
        500,
        -50
      ).normalizedIntensity
    );
    expect(
      result.kernel
        .normalizedIntensity
        .reduce(
          (sum, value) =>
            sum + value,
          0
        )
    ).toBeCloseTo(1, 14);
    expect(result).toMatchObject({
      throughputOwnership:
        "separate-relative-pupil-throughput-factor",
      geometricDistortionModified:
        false,
      lateralChromaticPositionShiftApplied:
        false,
      sensorOpticalStackIncluded:
        false,
      reconstructionIncluded:
        false,
      strayLightIncluded:
        false,
      scalarSharpnessScoreProduced:
        false
    });
  });

  it("performs bounded multilinear interpolation and preserves unit PSF energy", () => {
    const result =
      resolveLensSampledPsf({
        profile:
          sampledProfile(),
        focalLengthMm: 50,
        focus: {
          kind: "finite",
          distanceM: 5
        },
        apertureFNumber: 2,
        fieldPointMm: {
          x: 0,
          y: 0
        },
        wavelengthNm: 550,
        signedDefocusImagePlaneMicrometers:
          0
      }).value;

    expect(
      result.resolutionStatus
    ).toBe("interpolated");
    expect(
      result.sourceNodes
    ).toHaveLength(8);
    expect(
      result.sourceNodes.reduce(
        (sum, node) =>
          sum + node.weight,
        0
      )
    ).toBeCloseTo(1, 14);
    expect(
      result.kernel
        .normalizedIntensity
        .reduce(
          (sum, value) =>
            sum + value,
          0
        )
    ).toBeCloseTo(1, 14);
    expect(
      result
        .bestFocusImagePlaneOffsetMicrometers
    ).toBeCloseTo(0, 12);
    expect(
      result
        .relativePupilThroughputFactor
    ).toBeCloseTo(0.8, 12);
  });

  it("keeps field curvature and longitudinal chromatic focus as best-focus offsets rather than geometric warps", () => {
    const profile =
      sampledProfile();
    const leftBlue =
      resolveLensSampledPsf({
        profile,
        focalLengthMm: 50,
        focus: {
          kind: "finite",
          distanceM: 5
        },
        apertureFNumber: 2,
        fieldPointMm: {
          x: -10,
          y: 0
        },
        wavelengthNm: 500,
        signedDefocusImagePlaneMicrometers:
          0
      }).value;
    const rightRed =
      resolveLensSampledPsf({
        profile,
        focalLengthMm: 50,
        focus: {
          kind: "finite",
          distanceM: 5
        },
        apertureFNumber: 2,
        fieldPointMm: {
          x: 10,
          y: 0
        },
        wavelengthNm: 600,
        signedDefocusImagePlaneMicrometers:
          0
      }).value;

    expect(
      leftBlue
        .bestFocusImagePlaneOffsetMicrometers
    ).not.toBeCloseTo(
      rightRed
        .bestFocusImagePlaneOffsetMicrometers,
      12
    );
    expect(
      leftBlue
        .longitudinalChromaticFocusMayVaryWithWavelength
    ).toBe(true);
    expect(
      leftBlue
        .fieldCurvatureMayVaryWithFieldPosition
    ).toBe(true);
    expect(
      leftBlue
        .geometricDistortionModified
    ).toBe(false);
    expect(
      leftBlue
        .lateralChromaticPositionShiftApplied
    ).toBe(false);
  });

  it("preserves directional off-axis kernels instead of radial averaging", () => {
    const profile =
      sampledProfile();
    const left =
      resolveLensSampledPsf({
        profile,
        focalLengthMm: 50,
        focus: {
          kind: "finite",
          distanceM: 5
        },
        apertureFNumber: 2,
        fieldPointMm: {
          x: -10,
          y: 0
        },
        wavelengthNm: 500,
        signedDefocusImagePlaneMicrometers:
          -50
      }).value;
    const right =
      resolveLensSampledPsf({
        profile,
        focalLengthMm: 50,
        focus: {
          kind: "finite",
          distanceM: 5
        },
        apertureFNumber: 2,
        fieldPointMm: {
          x: 10,
          y: 0
        },
        wavelengthNm: 500,
        signedDefocusImagePlaneMicrometers:
          -50
      }).value;

    expect(
      left.kernel
        .normalizedIntensity[3]
    ).toBe(0.3);
    expect(
      left.kernel
        .normalizedIntensity[5]
    ).toBe(0);
    expect(
      right.kernel
        .normalizedIntensity[3]
    ).toBe(0);
    expect(
      right.kernel
        .normalizedIntensity[5]
    ).toBe(0.3);
  });

  it("fails closed instead of extrapolating outside the calibrated/profiled grid", () => {
    expect(() =>
      resolveLensSampledPsf({
        profile:
          sampledProfile(),
        focalLengthMm: 50,
        focus: {
          kind: "finite",
          distanceM: 5
        },
        apertureFNumber: 2,
        fieldPointMm: {
          x: 12,
          y: 0
        },
        wavelengthNm: 550,
        signedDefocusImagePlaneMicrometers:
          0
      })
    ).toThrow(
      "extrapolation is not permitted"
    );
  });

  it("requires a complete regular grid and quantified uncertainty for calibrated data", () => {
    const profile =
      sampledProfile();

    expect(() =>
      parseLensSampledPsfProfile({
        ...profile,
        nodes:
          profile.nodes.slice(
            0,
            -1
          )
      })
    ).toThrow(
      "exactly one node for every regular-grid coordinate"
    );

    expect(() =>
      parseLensSampledPsfProfile({
        ...profile,
        scientificStatus:
          "calibrated",
        nodes:
          profile.nodes.map(
            (node) => ({
              ...node,
              uncertainty: {
                kind:
                  "not-quantified",
                limitation:
                  "missing calibration uncertainty"
              }
            })
          )
      })
    ).toThrow(
      "calibrated PSF data must declare quantified"
    );
  });
});

function complexPupil(
  overrides:
    Partial<LensComplexPupilProfile> = {}
): LensComplexPupilProfile {
  return parseLensComplexPupilProfile({
    schemaVersion: "0.1.0",
    profileId:
      "complex-pupil",
    profileVersion: "1.0.0",
    scientificStatus:
      "approximation",
    opticalDomain:
      "lens-primary-optical-path-only",
    representation:
      "complex-pupil-amplitude-plus-opd",
    pupilCoordinateSystem:
      "pupil-plane-metric-aligned-to-image-plane",
    imageFieldAxes:
      "+X right, +Y up",
    amplitudeMeaning:
      "relative-complex-pupil-amplitude-shape",
    wavefrontMeaning:
      "optical-path-difference-micrometers",
    throughputOwnership:
      "separate-relative-pupil-throughput-factor",
    kernelEnergyNormalization:
      "unit-energy-shape",
    propagationModel:
      "scalar-fraunhofer-discrete-reference",
    context: {
      focalLengthMm: 50,
      focus: {
        kind: "finite",
        distanceM: 5
      },
      apertureFNumber: 2,
      fieldPointMm: {
        x: 0,
        y: 0
      },
      wavelengthNm: 500,
      signedDefocusImagePlaneMicrometers:
        0
    },
    responseIncludes: {
      diffraction: true,
      aberration: false,
      defocus: false,
      pupilClippingShape:
        false
    },
    relativePupilThroughputFactor:
      1,
    grid: {
      widthSamples: 3,
      heightSamples: 3,
      pupilSamplePitchMmX:
        1,
      pupilSamplePitchMmY:
        1,
      centerSampleX: 1,
      centerSampleY: 1,
      relativeAmplitude:
        new Array<number>(9)
          .fill(1),
      opticalPathDifferenceMicrometers:
        new Array<number>(9)
          .fill(0)
    },
    sensorOpticalStackIncluded:
      false,
    sensorSamplingIncluded:
      false,
    reconstructionIncluded:
      false,
    strayLightIncluded:
      false,
    evidence:
      evidence("pupil"),
    uncertainty: {
      kind: "not-quantified",
      limitation:
        "Synthetic pupil."
    },
    limitations: [
      "Synthetic complex pupil test profile."
    ],
    ...overrides
  });
}

describe("complex-pupil PSF reference propagation", () => {
  it("maps a uniform unaberrated pupil to a unit-energy central discrete Fraunhofer peak", () => {
    const result =
      calculateLensComplexPupilPsf({
        profile:
          complexPupil()
      }).value;

    expect(
      result.kernel
        .normalizedIntensity
        .reduce(
          (sum, value) =>
            sum + value,
          0
        )
    ).toBeCloseTo(1, 14);
    expect(
      result.kernel
        .normalizedIntensity[4]
    ).toBeCloseTo(1, 12);
    expect(result).toMatchObject({
      diffractionAndAberrationJointlyEvaluated:
        true,
      pupilClippingThroughputAppliedToKernel:
        false,
      scalarFraunhoferReference:
        true,
      sensorOpticalStackIncluded:
        false,
      reconstructionIncluded:
        false,
      strayLightIncluded:
        false,
      scalarSharpnessScoreProduced:
        false
    });
  });

  it("keeps pupil clipping shape in the PSF while throughput remains a separate factor", () => {
    const profile =
      complexPupil({
        responseIncludes: {
          diffraction: true,
          aberration: false,
          defocus: false,
          pupilClippingShape:
            true
        },
        relativePupilThroughputFactor:
          0.4,
        grid: {
          widthSamples: 3,
          heightSamples: 3,
          pupilSamplePitchMmX:
            1,
          pupilSamplePitchMmY:
            1,
          centerSampleX: 1,
          centerSampleY: 1,
          relativeAmplitude: [
            0, 1, 0,
            0, 1, 0,
            0, 1, 0
          ],
          opticalPathDifferenceMicrometers:
            new Array<number>(9)
              .fill(0)
        }
      });

    const result =
      calculateLensComplexPupilPsf({
        profile
      }).value;

    expect(
      result
        .relativePupilThroughputFactor
    ).toBe(0.4);
    expect(
      result
        .pupilClippingShapeIncluded
    ).toBe(true);
    expect(
      result
        .pupilClippingThroughputAppliedToKernel
    ).toBe(false);
    expect(
      result.kernel
        .normalizedIntensity
        .reduce(
          (sum, value) =>
            sum + value,
          0
        )
    ).toBeCloseTo(1, 14);
  });

  it("preserves 2D phase orientation with an explicit +X pupil phase tilt", () => {
    const wavelengthUm =
      0.5;
    const width = 5;
    const center = 2;
    const opd:
      number[] = [];

    for (
      let y = 0;
      y < 5;
      y += 1
    ) {
      for (
        let x = 0;
        x < 5;
        x += 1
      ) {
        const px =
          x - center;
        opd.push(
          wavelengthUm *
          px /
          width
        );
      }
    }

    const profile =
      complexPupil({
        responseIncludes: {
          diffraction: true,
          aberration: true,
          defocus: false,
          pupilClippingShape:
            false
        },
        grid: {
          widthSamples: 5,
          heightSamples: 5,
          pupilSamplePitchMmX:
            1,
          pupilSamplePitchMmY:
            1,
          centerSampleX:
            center,
          centerSampleY:
            center,
          relativeAmplitude:
            new Array<number>(25)
              .fill(1),
          opticalPathDifferenceMicrometers:
            opd
        }
      });
    const result =
      calculateLensComplexPupilPsf({
        profile
      }).value;

    let maxIndex = 0;
    for (
      let index = 1;
      index <
        result.kernel
          .normalizedIntensity
          .length;
      index += 1
    ) {
      if (
        result.kernel
          .normalizedIntensity[index]! >
        result.kernel
          .normalizedIntensity[maxIndex]!
      ) {
        maxIndex = index;
      }
    }

    expect(maxIndex).toBe(
      center * width +
      (center + 1)
    );
    expect(
      result.full2dOrientationPreserved
    ).toBe(true);
  });

  it("requires a non-empty finite pupil and quantified uncertainty for calibrated pupil data", () => {
    expect(() =>
      parseLensComplexPupilProfile({
        ...complexPupil(),
        grid: {
          ...complexPupil().grid,
          relativeAmplitude:
            new Array<number>(9)
              .fill(0)
        }
      })
    ).toThrow(
      "at least one non-zero pupil-amplitude"
    );

    expect(() =>
      parseLensComplexPupilProfile({
        ...complexPupil(),
        scientificStatus:
          "calibrated"
      })
    ).toThrow(
      "must declare quantified relative uncertainty"
    );
  });
});

describe("MTF-only boundary", () => {
  it("permits diagnostic MTF data but never reconstructs a unique PSF from magnitude alone", () => {
    const profile =
      parseLensMtfDiagnosticProfile({
        schemaVersion: "0.1.0",
        profileId: "mtf-only",
        profileVersion: "1.0.0",
        opticalDomain:
          "lens-primary-optical-path-only",
        phaseInformationAvailable:
          false,
        magnitudeMeaning:
          "mtf-magnitude-only",
        fieldPointMm: {
          x: 10,
          y: 0
        },
        focalLengthMm: 50,
        focus: {
          kind: "finite",
          distanceM: 5
        },
        apertureFNumber: 4,
        wavelengthNm: 550,
        samples: [
          {
            spatialFrequencyCyclesPerMm:
              0,
            sagittalMagnitude:
              1,
            tangentialMagnitude:
              1
          },
          {
            spatialFrequencyCyclesPerMm:
              20,
            sagittalMagnitude:
              0.8,
            tangentialMagnitude:
              0.6
          }
        ],
        evidence:
          evidence("mtf"),
        limitations: [
          "Magnitude only."
        ]
      });

    expect(
      assessMtfOnlyPsfRenderability(
        profile
      )
    ).toEqual({
      profileId: "mtf-only",
      psfReconstructionAuthorized:
        false,
      reason:
        "mtf-magnitude-lacks-phase-and-does-not-uniquely-determine-psf",
      diagnosticUseAuthorized:
        true
    });
  });
});


describe("lens PSF profile validation boundaries", () => {
  it("supports explicit optical-infinity focus through the zero-diopter grid point", () => {
    const base =
      sampledProfile();
    const infinityProfile =
      parseLensSampledPsfProfile({
        ...base,
        axes: {
          ...base.axes,
          focusDiopters: [0]
        },
        nodes:
          base.nodes.map(
            (node) => ({
              ...node,
              coordinate: {
                ...node.coordinate,
                focusDiopters: 0
              }
            })
          )
      });

    const result =
      resolveLensSampledPsf({
        profile:
          infinityProfile,
        focalLengthMm: 50,
        focus: {
          kind: "infinity"
        },
        apertureFNumber: 2,
        fieldPointMm: {
          x: -10,
          y: 0
        },
        wavelengthNm: 500,
        signedDefocusImagePlaneMicrometers:
          -50
      }).value;

    expect(result.focus)
      .toEqual({
        kind: "infinity"
      });
    expect(
      result.coordinate
        .focusDiopters
    ).toBe(0);
  });

  it("rejects invalid optical ownership and sensor/stray-light contamination", () => {
    const base =
      sampledProfile();

    expect(() =>
      parseLensSampledPsfProfile({
        ...base,
        opticalDomain:
          "combined-camera-system"
      })
    ).toThrow(
      "opticalDomain"
    );

    expect(() =>
      parseLensSampledPsfProfile({
        ...base,
        sensorOpticalStackIncluded:
          true
      })
    ).toThrow(
      "lens-primary-optical-path-only"
    );

    expect(() =>
      parseLensSampledPsfProfile({
        ...base,
        strayLightIncluded:
          true
      })
    ).toThrow(
      "lens-primary-optical-path-only"
    );

    expect(() =>
      parseLensSampledPsfProfile({
        ...base,
        responseIncludes: {
          ...base.responseIncludes,
          diffraction: "yes"
        }
      })
    ).toThrow(
      "responseIncludes.diffraction"
    );
  });

  it("rejects malformed grid axes and kernel energy/geometry", () => {
    const base =
      sampledProfile();

    expect(() =>
      parseLensSampledPsfProfile({
        ...base,
        axes: {
          ...base.axes,
          wavelengthNm: [
            600,
            500
          ]
        }
      })
    ).toThrow(
      "strictly increasing"
    );

    expect(() =>
      parseLensSampledPsfProfile({
        ...base,
        nodes:
          base.nodes.map(
            (node, index) =>
              index === 0
                ? {
                    ...node,
                    kernel: {
                      ...node.kernel,
                      normalizedIntensity:
                        node.kernel
                          .normalizedIntensity
                          .map(
                            (value) =>
                              value * 0.5
                          )
                    }
                  }
                : node
          )
      })
    ).toThrow(
      "must sum to one"
    );

    expect(() =>
      parseLensSampledPsfProfile({
        ...base,
        nodes:
          base.nodes.map(
            (node, index) =>
              index === 1
                ? {
                    ...node,
                    kernel: {
                      ...node.kernel,
                      samplePitchMicrometersX:
                        3
                    }
                  }
                : node
          )
      })
    ).toThrow(
      "identical PSF kernel grid geometry"
    );
  });

  it("rejects duplicate profile node identities and coordinates", () => {
    const base =
      sampledProfile();

    expect(() =>
      parseLensSampledPsfProfile({
        ...base,
        nodes:
          base.nodes.map(
            (node, index) =>
              index === 1
                ? {
                    ...node,
                    nodeId:
                      base.nodes[0]!
                        .nodeId
                  }
                : node
          )
      })
    ).toThrow(
      "duplicate nodeId"
    );

    expect(() =>
      parseLensSampledPsfProfile({
        ...base,
        nodes:
          base.nodes.map(
            (node, index) =>
              index === 1
                ? {
                    ...node,
                    coordinate: {
                      ...base.nodes[0]!
                        .coordinate
                    }
                  }
                : node
          )
      })
    ).toThrow(
      "duplicate grid coordinates"
    );
  });

  it("rejects non-finite/invalid runtime PSF queries and focus outside profile support", () => {
    const profile =
      sampledProfile();

    expect(() =>
      resolveLensSampledPsf({
        profile,
        focalLengthMm: 0,
        focus: {
          kind: "finite",
          distanceM: 5
        },
        apertureFNumber: 2,
        fieldPointMm: {
          x: 0,
          y: 0
        },
        wavelengthNm: 550,
        signedDefocusImagePlaneMicrometers:
          0
      })
    ).toThrow(
      "focalLengthMm"
    );

    expect(() =>
      resolveLensSampledPsf({
        profile,
        focalLengthMm: 50,
        focus: {
          kind: "finite",
          distanceM: 10
        },
        apertureFNumber: 2,
        fieldPointMm: {
          x: 0,
          y: 0
        },
        wavelengthNm: 550,
        signedDefocusImagePlaneMicrometers:
          0
      })
    ).toThrow(
      "focus lies outside"
    );

    expect(() =>
      resolveLensSampledPsf({
        profile,
        focalLengthMm: 50,
        focus: {
          kind: "finite",
          distanceM: 5
        },
        apertureFNumber: 2,
        fieldPointMm: {
          x: Number.NaN,
          y: 0
        },
        wavelengthNm: 550,
        signedDefocusImagePlaneMicrometers:
          0
      })
    ).toThrow(
      "fieldPointMm.x"
    );
  });

  it("accepts calibrated sampled data only when every node carries quantified uncertainty", () => {
    const base =
      sampledProfile();
    const calibrated =
      parseLensSampledPsfProfile({
        ...base,
        scientificStatus:
          "calibrated",
        nodes:
          base.nodes.map(
            (node) => ({
              ...node,
              uncertainty: {
                kind: "relative",
                fraction: 0.02,
                basis:
                  "synthetic calibration test"
              }
            })
          )
      });

    expect(
      calibrated
        .scientificStatus
    ).toBe("calibrated");
  });
});

describe("complex-pupil validation boundaries", () => {
  it("rejects invalid representation semantics and forbidden downstream content", () => {
    const base =
      complexPupil();

    expect(() =>
      parseLensComplexPupilProfile({
        ...base,
        schemaVersion:
          "9.9.9"
      })
    ).toThrow(
      "schemaVersion"
    );

    expect(() =>
      parseLensComplexPupilProfile({
        ...base,
        propagationModel:
          "geometric-blur"
      })
    ).toThrow(
      "representation/coordinate/energy semantics"
    );

    expect(() =>
      parseLensComplexPupilProfile({
        ...base,
        sensorSamplingIncluded:
          true
      })
    ).toThrow(
      "exclude sensor/reconstruction/stray-light"
    );

    expect(() =>
      parseLensComplexPupilProfile({
        ...base,
        responseIncludes: {
          ...base.responseIncludes,
          diffraction: false
        }
      })
    ).toThrow(
      "diffraction must be included"
    );
  });

  it("rejects invalid pupil-grid cardinality, center, and amplitude values", () => {
    const base =
      complexPupil();

    expect(() =>
      parseLensComplexPupilProfile({
        ...base,
        grid: {
          ...base.grid,
          centerSampleX: 4
        }
      })
    ).toThrow(
      "center must lie within"
    );

    expect(() =>
      parseLensComplexPupilProfile({
        ...base,
        grid: {
          ...base.grid,
          relativeAmplitude: [
            1
          ]
        }
      })
    ).toThrow(
      "relativeAmplitude length"
    );

    expect(() =>
      parseLensComplexPupilProfile({
        ...base,
        grid: {
          ...base.grid,
          opticalPathDifferenceMicrometers: [
            0
          ]
        }
      })
    ).toThrow(
      "opticalPathDifferenceMicrometers length"
    );

    expect(() =>
      parseLensComplexPupilProfile({
        ...base,
        grid: {
          ...base.grid,
          relativeAmplitude:
            base.grid
              .relativeAmplitude
              .map(
                (value, index) =>
                  index === 0
                    ? 1.1
                    : value
              )
        }
      })
    ).toThrow(
      "must lie from zero through one"
    );
  });

  it("supports calibrated complex-pupil data with quantified uncertainty and optical infinity", () => {
    const profile =
      parseLensComplexPupilProfile({
        ...complexPupil(),
        scientificStatus:
          "calibrated",
        context: {
          ...complexPupil()
            .context,
          focus: {
            kind: "infinity"
          }
        },
        uncertainty: {
          kind: "relative",
          fraction: 0.01,
          basis:
            "synthetic pupil calibration"
        }
      });

    const result =
      calculateLensComplexPupilPsf({
        profile
      }).value;

    expect(
      result.scientificStatus
    ).toBe("calibrated");
    expect(
      result.context.focus
    ).toEqual({
      kind: "infinity"
    });
  });

  it("preserves a zero throughput factor separately from normalized PSF energy", () => {
    const result =
      calculateLensComplexPupilPsf({
        profile:
          complexPupil({
            relativePupilThroughputFactor:
              0
          })
      }).value;

    expect(
      result
        .relativePupilThroughputFactor
    ).toBe(0);
    expect(
      result.kernel
        .normalizedIntensity
        .reduce(
          (sum, value) =>
            sum + value,
          0
        )
    ).toBeCloseTo(1, 14);
  });
});

describe("MTF diagnostic validation boundaries", () => {
  const validMtf = () => ({
    schemaVersion: "0.1.0",
    profileId: "mtf-validation",
    profileVersion: "1.0.0",
    opticalDomain:
      "lens-primary-optical-path-only",
    phaseInformationAvailable:
      false,
    magnitudeMeaning:
      "mtf-magnitude-only",
    fieldPointMm: {
      x: 0,
      y: 0
    },
    focalLengthMm: 50,
    focus: {
      kind: "infinity"
    },
    apertureFNumber: 4,
    wavelengthNm: null,
    samples: [
      {
        spatialFrequencyCyclesPerMm:
          0,
        sagittalMagnitude: 1,
        tangentialMagnitude: 1
      },
      {
        spatialFrequencyCyclesPerMm:
          20,
        sagittalMagnitude: 0.7,
        tangentialMagnitude: 0.6
      }
    ],
    evidence:
      evidence("mtf-validation"),
    limitations: [
      "Magnitude only."
    ]
  });

  it("supports broadband/unspecified-wavelength MTF diagnostics without inventing phase", () => {
    const profile =
      parseLensMtfDiagnosticProfile(
        validMtf()
      );
    expect(
      profile.wavelengthNm
    ).toBeNull();
    expect(
      assessMtfOnlyPsfRenderability(
        profile
      ).psfReconstructionAuthorized
    ).toBe(false);
  });

  it("rejects non-increasing frequencies and invalid magnitudes", () => {
    expect(() =>
      parseLensMtfDiagnosticProfile({
        ...validMtf(),
        samples: [
          {
            spatialFrequencyCyclesPerMm:
              20,
            sagittalMagnitude:
              0.7,
            tangentialMagnitude:
              0.6
          },
          {
            spatialFrequencyCyclesPerMm:
              20,
            sagittalMagnitude:
              0.5,
            tangentialMagnitude:
              0.4
          }
        ]
      })
    ).toThrow(
      "strictly increasing"
    );

    expect(() =>
      parseLensMtfDiagnosticProfile({
        ...validMtf(),
        samples: [{
          spatialFrequencyCyclesPerMm:
            0,
          sagittalMagnitude:
            1.1,
          tangentialMagnitude: 1
        }]
      })
    ).toThrow(
      "must lie from zero through one"
    );
  });
});
