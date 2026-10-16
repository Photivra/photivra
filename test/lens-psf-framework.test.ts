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
  it("binds explicit propagation scale without changing normalized pupil shape or the legacy focal-plane result", () => {
    const profile = complexPupil();
    const legacy = calculateLensComplexPupilPsf({ profile }).value;
    const explicit = calculateLensComplexPupilPsf({ profile, propagationDistanceMm: 75 }).value;
    expect(legacy.propagationDistanceMm).toBe(50);
    expect(legacy.propagationDistanceSource).toBe("nominal-focal-plane-reference");
    expect(explicit.propagationDistanceMm).toBe(75);
    expect(explicit.propagationDistanceSource).toBe("explicit");
    expect(explicit.kernel.normalizedIntensity).toEqual(legacy.kernel.normalizedIntensity);
    expect(explicit.kernel.samplePitchMicrometersX).toBeCloseTo(legacy.kernel.samplePitchMicrometersX * 1.5, 14);
    expect(explicit.kernel.samplePitchMicrometersY).toBeCloseTo(legacy.kernel.samplePitchMicrometersY * 1.5, 14);
    for (const value of [0, -1, NaN, Infinity, null, "75"]) {
      expect(() => calculateLensComplexPupilPsf({ profile, propagationDistanceMm: value as number })).toThrow();
    }
  });
  it("matches the analytic Airy pattern for a properly sampled circular pupil", () => {
    // f = 50 mm, f/4, 550 nm: D = 12.5 mm and lambda*N = 2.2 um. 63 pupil
    // samples span D centre to centre (dp = D/62) on a 64 x 64 grid, which as
    // declared gives Q = 64/62 < 2; the engine zero pads to 2S-1 = 125.
    const focalLengthMm = 50;
    const fNumber = 4;
    const wavelengthNm = 550;
    const n = 64;
    const center = 32;
    const radiusSamples = 31;
    const pitchMm = focalLengthMm / fNumber / (2 * radiusSamples);
    const amplitude = Array.from({ length: n * n }, (_, i) =>
      (i % n - center) ** 2 + (Math.floor(i / n) - center) ** 2 <=
      radiusSamples ** 2 ? 1 : 0
    );
    const result = calculateLensComplexPupilPsf({
      profile: complexPupil({
        context: {
          focalLengthMm,
          focus: { kind: "infinity" },
          apertureFNumber: fNumber,
          fieldPointMm: { x: 0, y: 0 },
          wavelengthNm,
          signedDefocusImagePlaneMicrometers: 0
        },
        grid: {
          widthSamples: n,
          heightSamples: n,
          pupilSamplePitchMmX: pitchMm,
          pupilSamplePitchMmY: pitchMm,
          centerSampleX: center,
          centerSampleY: center,
          relativeAmplitude: amplitude,
          opticalPathDifferenceMicrometers: new Array<number>(n * n).fill(0)
        }
      })
    }).value;
    const k = result.kernel;
    expect(result.sampling).toMatchObject({
      pupilSupportSamplesX: 63,
      transformWidthSamples: 125,
      transformHeightSamples: 125,
      zeroPaddingApplied: true
    });
    expect(result.sampling.samplingFactorQX).toBeCloseTo(125 / 62, 12);
    expect(result.sampling.samplingFactorQX!).toBeGreaterThan(2);
    const lambdaNUm = (wavelengthNm / 1000) * fNumber;
    // Q = lambda*N / pitch, as defined by Goodman.
    expect(lambdaNUm / k.samplePitchMicrometersX).toBeCloseTo(125 / 62, 12);
    expect(k.normalizedIntensity.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 13);

    // Analytic Airy irradiance [2 J1(v)/v]^2 with v = pi r/(lambda N);
    // J1 from its Bessel integral (composite Simpson, 2000 intervals).
    const besselJ1 = (x: number): number => {
      const intervals = 2000;
      const h = Math.PI / intervals;
      let sum = 0;
      for (let i = 0; i <= intervals; i += 1) {
        const t = i * h;
        const weight = i === 0 || i === intervals ? 1 : i % 2 === 1 ? 4 : 2;
        sum += weight * Math.cos(t - x * Math.sin(t));
      }
      return (sum * h) / 3 / Math.PI;
    };
    // Equal-area diameter of the sampled disk: each non-zero sample stands
    // for one dp x dp cell of the continuous aperture.
    const sampleCount = amplitude.filter((value) => value > 0).length;
    const equalAreaDiameterMm = 2 * Math.sqrt(sampleCount / Math.PI) * pitchMm;
    const lambdaNEffectiveUm = (wavelengthNm / 1000) * focalLengthMm / equalAreaDiameterMm;
    const airy = (rUm: number): number => {
      const v = (Math.PI * rUm) / lambdaNEffectiveUm;
      return v === 0 ? 1 : (2 * besselJ1(v) / v) ** 2;
    };
    const peak = k.normalizedIntensity[k.centerSampleY * k.widthSamples + k.centerSampleX]!;
    expect(Math.max(...k.normalizedIntensity)).toBe(peak);
    // Compare the peak-normalized shape over the core and first two rings
    // (r <= 3 lambda N) with the Airy pattern of the equal-area aperture. The
    // residual is the non-circular staircase edge of a 63-sample disk: about
    // 4e-4 of the peak. 2e-3 leaves margin while still separating the
    // equal-area aperture from the nominal 12.5 mm one (2.6e-3).
    let maximumError = 0;
    let compared = 0;
    k.normalizedIntensity.forEach((value, i) => {
      const xUm = (i % k.widthSamples - k.centerSampleX) * k.samplePitchMicrometersX;
      const yUm = (Math.floor(i / k.widthSamples) - k.centerSampleY) * k.samplePitchMicrometersY;
      const r = Math.hypot(xUm, yUm);
      if (r <= 3 * lambdaNUm) {
        maximumError = Math.max(maximumError, Math.abs(value / peak - airy(r)));
        compared += 1;
      }
    });
    expect(compared).toBeGreaterThan(100);
    expect(maximumError).toBeLessThan(2e-3);
    expect(equalAreaDiameterMm).toBeCloseTo(focalLengthMm / fNumber, 1);
  });

  it("never returns an aliased kernel: a pupil filling its grid is zero padded to 2S-1", () => {
    // The previously degenerate 3 x 3 uniform pupil declares Q = 3/2 < 2. Its
    // unpadded 3-point DFT collapsed every side lobe into one sample.
    const declared = calculateLensComplexPupilPsf({ profile: complexPupil() }).value;
    expect(declared.sampling).toEqual({
      criterion: "discrete-intensity-alias-free-goodman-q-above-2",
      pupilSupportSamplesX: 3,
      pupilSupportSamplesY: 3,
      pupilSupportDiameterMmX: 2,
      pupilSupportDiameterMmY: 2,
      declaredPupilDiameterMm: 25,
      pupilGridWidthSamples: 3,
      pupilGridHeightSamples: 3,
      transformWidthSamples: 5,
      transformHeightSamples: 5,
      zeroPaddingApplied: true,
      samplingFactorQX: 2.5,
      samplingFactorQY: 2.5
    });
    const k = declared.kernel;
    expect([k.widthSamples, k.heightSamples, k.centerSampleX, k.centerSampleY]).toEqual([5, 5, 2, 2]);
    // Independent separable 1D Dirichlet kernel: |sum_{p=-1..1} e^{-2 pi i k p/5}|^2.
    const lobe = (q: number): number => (1 + 2 * Math.cos((2 * Math.PI * q) / 5)) ** 2;
    const total = [-2, -1, 0, 1, 2].reduce((s, q) => s + lobe(q), 0) ** 2;
    k.normalizedIntensity.forEach((value, i) => {
      expect(value).toBeCloseTo(lobe(i % 5 - 2) * lobe(Math.floor(i / 5) - 2) / total, 14);
    });
    expect(k.normalizedIntensity[12]).toBeLessThan(1);
    // Padding the declaration explicitly gives the identical kernel.
    const padded = calculateLensComplexPupilPsf({
      profile: complexPupil({
        grid: {
          widthSamples: 5,
          heightSamples: 5,
          pupilSamplePitchMmX: 1,
          pupilSamplePitchMmY: 1,
          centerSampleX: 2,
          centerSampleY: 2,
          relativeAmplitude: Array.from({ length: 25 }, (_, i) =>
            i % 5 >= 1 && i % 5 <= 3 && Math.floor(i / 5) >= 1 && Math.floor(i / 5) <= 3 ? 1 : 0),
          opticalPathDifferenceMicrometers: new Array<number>(25).fill(0)
        }
      })
    }).value;
    expect(padded.sampling.zeroPaddingApplied).toBe(false);
    expect(padded.kernel.samplePitchMicrometersX).toBe(k.samplePitchMicrometersX);
    padded.kernel.normalizedIntensity.forEach((value, i) =>
      expect(value).toBeCloseTo(k.normalizedIntensity[i]!, 15));
  });

  it("rejects a pupil support wider than the declared f/N aperture", () => {
    // 50 mm at f/2 allows D = 25 mm; 3 samples at 20 mm pitch span 40 mm.
    const profile = complexPupil({
      grid: {
        widthSamples: 3,
        heightSamples: 3,
        pupilSamplePitchMmX: 20,
        pupilSamplePitchMmY: 1,
        centerSampleX: 1,
        centerSampleY: 1,
        relativeAmplitude: new Array<number>(9).fill(1),
        opticalPathDifferenceMicrometers: new Array<number>(9).fill(0)
      }
    });
    expect(() => calculateLensComplexPupilPsf({ profile })).toThrow(
      /wider than the declared f\/N cone diameter 25\.0000 mm/
    );
  });

  it("bounds the pupil by the cone z/N of its resolved propagation distance (exit pupils)", () => {
    // 2.0-changes review #1: a 30 mm exit pupil at z = 60 mm, f = 50 mm, f/2 has
    // cone D/z = 1/2 = 1/N and is physically consistent.
    const grid = (width: number): LensComplexPupilProfile["grid"] => ({
      widthSamples: width, heightSamples: 1, pupilSamplePitchMmX: 1, pupilSamplePitchMmY: 1,
      centerSampleX: Math.floor(width / 2), centerSampleY: 0,
      relativeAmplitude: new Array<number>(width).fill(1),
      opticalPathDifferenceMicrometers: new Array<number>(width).fill(0)
    });
    const exitPupil = complexPupil({ grid: grid(31) });
    const accepted = calculateLensComplexPupilPsf({ profile: exitPupil, propagationDistanceMm: 60 }).value;
    expect(accepted.sampling.pupilSupportDiameterMmX).toBe(30);
    expect(accepted.sampling.declaredPupilDiameterMm).toBe(30);
    // The same 30 mm support is too wide for the nominal z = f = 50 mm reference (25 mm) and for z = 58 mm.
    expect(() => calculateLensComplexPupilPsf({ profile: exitPupil })).toThrow(/cone diameter 25\.0000 mm/);
    expect(() => calculateLensComplexPupilPsf({ profile: exitPupil, propagationDistanceMm: 58 })).toThrow(/cone diameter 29\.0000 mm/);
    // The bound reduces to f/N when z = f, and a shorter z narrows it.
    const nominal = complexPupil({ grid: grid(26) });
    expect(calculateLensComplexPupilPsf({ profile: nominal }).value.sampling.declaredPupilDiameterMm).toBe(25);
    expect(() => calculateLensComplexPupilPsf({ profile: nominal, propagationDistanceMm: 40 })).toThrow(/cone diameter 20\.0000 mm/);
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

    // A tilt of one wave across the 5-sample aperture displaces the PSF by
    // lambda*z/(5*dp) = 9/5 samples of the zero-padded 9 x 9 kernel; the
    // brightest sample is two samples toward +X on the centre row.
    const k = result.kernel;
    expect([k.widthSamples, k.centerSampleX, k.centerSampleY]).toEqual([9, 4, 4]);
    expect(maxIndex).toBe(
      k.centerSampleY * k.widthSamples +
      (k.centerSampleX + 2)
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
  const validMtf = (): ReturnType<typeof parseLensMtfDiagnosticProfile> => ({
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
