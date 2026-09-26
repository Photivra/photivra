import { describe, expect, it } from "vitest";

import {
  calculateAiryDisk,
  calculateCenteredCrop,
  calculateDefocusCircle,
  calculateDepthOfField,
  calculateEquivalentFocalLength35Mm,
  calculateEquivalentIso,
  calculateExposureValue100,
  calculateFieldOfView,
  calculateInverseRadialDistortionMapping,
  calculateRadialDistortionMapping,
  mapImagePlanePointToOrientedPhysicalUv,
  mapOrientedPhysicalUvToImagePlanePoint,
  resolveCaptureGeometry,
  transformNativeRasterPointToOriented,
  transformNativeRasterRectToOriented,
  transformNativeRasterVectorToOriented,
  transformOrientedRasterPointToNative,
  transformOrientedRasterRectToNative,
  transformOrientedRasterVectorToNative,
  calculatePhotoelectrons,
  calculatePixelPitch,
  calculateProjectedMotionBlur,
  calculateProjectedObjectSize,
  calculateRelativeOpticalExposure,
  calculateSignalToNoise,
  calculateSubjectFramingCrop,
  estimateCameraShakeBlur,
  estimateEquivalentViewingCircleOfConfusion,
  parseCameraConfiguration,
  parseSceneDefinition,
  simulatePocCamera,
  type CalculateProjectedMotionBlurInput
} from "../src/index.js";
import { parsePocSimulationRequest } from "../src/api/poc-request.js";

interface SeededRandom {
  next(): number;
  between(minimum: number, maximum: number): number;
  integer(minimum: number, maximum: number): number;
}

function createSeededRandom(seed: number): SeededRandom {
  let state = seed >>> 0;

  const next = (): number => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };

  return {
    next,
    between(minimum: number, maximum: number): number {
      return minimum + (maximum - minimum) * next();
    },
    integer(minimum: number, maximum: number): number {
      return Math.floor(this.between(minimum, maximum + 1));
    }
  };
}

function expectFiniteTree(value: unknown): void {
  if (typeof value === "number") {
    expect(Number.isFinite(value)).toBe(true);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(expectFiniteTree);
    return;
  }
  if (typeof value === "object" && value !== null) {
    Object.values(value).forEach(expectFiniteTree);
  }
}

function createBaselineSimulationRequest(): Parameters<typeof simulatePocCamera>[0] {
  return {
    sensor: {
      widthMm: 36,
      heightMm: 24,
      pixelWidth: 6000,
      pixelHeight: 4000
    },
    lens: {
      focalLengthMm: 200,
      aperture: 5.6
    },
    exposure: {
      shutterSeconds: 1 / 1000,
      iso: 800
    },
    focus: {
      focusDistanceM: 22,
      circleOfConfusionMm: 0.03
    },
    crop: {
      factor: 1
    },
    diffraction: {
      wavelengthNm: 550
    },
    motion: {
      positionM: { x: 0.75, y: 0.8, z: 21.8 },
      velocityMps: { x: 35, y: 2, z: 0 }
    }
  };
}

describe("deterministic scientific fuzz corpus", () => {
  it("keeps representative positive-domain calculations finite across a seeded corpus", () => {
    const random = createSeededRandom(0x5eedc0de);

    for (let index = 0; index < 300; index += 1) {
      const focalLengthMm = random.between(8, 1200);
      const aperture = random.between(1, 32);
      const distanceM = random.between(2, 500);
      const shutterSeconds = random.between(1 / 16000, 2);
      const pixelPitchMicrometers = random.between(2, 12);
      const wavelengthNm = random.between(380, 780);

      const results = [
        calculateFieldOfView({
          focalLengthMm,
          sensorDimensionMm: random.between(4, 70)
        }),
        calculatePixelPitch({
          sensorWidthMm: random.between(4, 70),
          pixelWidth: random.integer(640, 12000)
        }),
        calculateProjectedObjectSize({
          focalLengthMm,
          objectWidthM: random.between(0.02, 4),
          objectHeightM: random.between(0.02, 4),
          distanceM,
          pixelPitchMicrometers
        }),
        calculateDepthOfField({
          focalLengthMm,
          aperture,
          focusDistanceM: Math.max(distanceM, focalLengthMm / 1000 + 0.01),
          circleOfConfusionMm: random.between(0.005, 0.08)
        }),
        calculateDefocusCircle({
          focalLengthMm,
          aperture,
          focusDistanceM: Math.max(distanceM, focalLengthMm / 1000 + 0.01),
          subjectDistanceM: Math.max(
            random.between(2, 500),
            focalLengthMm / 1000 + 0.01
          )
        }),
        calculateAiryDisk({
          aperture,
          wavelengthNm
        }),
        calculateExposureValue100({
          aperture,
          shutterSeconds
        }),
        calculateRelativeOpticalExposure({
          aperture,
          shutterSeconds,
          referenceAperture: random.between(1, 32),
          referenceShutterSeconds: random.between(1 / 16000, 2)
        }),
        calculateEquivalentIso({
          baseIso: random.between(25, 204800),
          baseAperture: random.between(1, 32),
          baseShutterSeconds: random.between(1 / 16000, 2),
          aperture,
          shutterSeconds
        }),
        calculatePhotoelectrons({
          incidentPhotons: random.between(0, 1e9),
          quantumEfficiency: random.between(0, 1)
        }),
        calculateSignalToNoise({
          signalElectrons: random.between(0, 1e7),
          readNoiseElectrons: random.between(0, 100)
        }),
        estimateEquivalentViewingCircleOfConfusion({
          sensorWidthMm: random.between(4, 70),
          sensorHeightMm: random.between(3, 50),
          referenceSensorWidthMm: 36,
          referenceSensorHeightMm: 24,
          referenceCircleOfConfusionMm: 0.03
        }),
        calculateProjectedMotionBlur({
          focalLengthMm,
          shutterSeconds,
          positionM: {
            x: random.between(-20, 20),
            y: random.between(-10, 10),
            z: random.between(2, 500)
          },
          velocityMps: {
            x: random.between(-100, 100),
            y: random.between(-50, 50),
            z: random.between(-0.5, 0.5)
          },
          pixelPitchMicrometers
        }),
        estimateCameraShakeBlur({
          focalLengthMm,
          shutterSeconds,
          angularVelocityRadPerSec: {
            yaw: random.between(-0.03, 0.03),
            pitch: random.between(-0.03, 0.03)
          },
          stabilizationStopsEquivalent: random.between(0, 8),
          pixelPitchMicrometers
        })
      ];

      results.forEach(expectFiniteTree);
    }
  });

  it("preserves capture-geometry invariants across a seeded corpus", () => {
    const random = createSeededRandom(0xc4a7e123);
    const orientations = [
      "landscape",
      "portrait-clockwise",
      "landscape-inverted",
      "portrait-counter-clockwise"
    ] as const;

    for (let index = 0; index < 200; index += 1) {
      const pixelWidth = random.integer(1000, 12000);
      const pixelHeight = random.integer(800, 9000);
      const widthMm = random.between(4, 70);
      const heightMm = random.between(3, 50);
      const rectWidth = random.integer(1, pixelWidth);
      const rectHeight = random.integer(1, pixelHeight);
      const rect = {
        x: random.integer(0, pixelWidth - rectWidth),
        y: random.integer(0, pixelHeight - rectHeight),
        width: rectWidth,
        height: rectHeight
      };
      const nativeRaster = { pixelWidth, pixelHeight };
      const point = {
        x: random.between(0, pixelWidth),
        y: random.between(0, pixelHeight)
      };
      const vector = {
        x: random.between(-500, 500),
        y: random.between(-500, 500)
      };

      for (const orientation of orientations) {
        const orientedPoint = transformNativeRasterPointToOriented({
          point,
          nativeRaster,
          orientation
        });
        const roundTripPoint = transformOrientedRasterPointToNative({
          point: orientedPoint,
          nativeRaster,
          orientation
        });
        expect(roundTripPoint.x).toBeCloseTo(point.x, 10);
        expect(roundTripPoint.y).toBeCloseTo(point.y, 10);

        const orientedVector = transformNativeRasterVectorToOriented({
          vector,
          orientation
        });
        expect(
          transformOrientedRasterVectorToNative({
            vector: orientedVector,
            orientation
          })
        ).toEqual(vector);

        const orientedRect = transformNativeRasterRectToOriented({
          rect,
          nativeRaster,
          orientation
        });
        expect(
          transformOrientedRasterRectToNative({
            rect: orientedRect,
            nativeRaster,
            orientation
          })
        ).toEqual(rect);

        const geometry = resolveCaptureGeometry({
          imagingArea: { widthMm, heightMm },
          nativeRaster,
          orientation,
          activeCaptureRect: rect
        }).value;
        expect(geometry.activeCapture.nativeRect).toEqual(rect);
        expect(geometry.output.sourceRetainedAreaFraction).toBeCloseTo(1, 12);

        const uv = {
          u: random.next(),
          v: random.next()
        };
        const imagePlanePointMm = mapOrientedPhysicalUvToImagePlanePoint({
          uv,
          orientedPhysicalBoundsFromOpticalAxisMm:
            geometry.output.physicalBoundsFromOpticalAxisMm,
          orientation
        });
        const uvRoundTrip = mapImagePlanePointToOrientedPhysicalUv({
          imagePlanePointMm,
          orientedPhysicalBoundsFromOpticalAxisMm:
            geometry.output.physicalBoundsFromOpticalAxisMm,
          orientation
        });
        expect(uvRoundTrip.u).toBeCloseTo(uv.u, 10);
        expect(uvRoundTrip.v).toBeCloseTo(uv.v, 10);
      }

      const baseGeometry = resolveCaptureGeometry({
        imagingArea: { widthMm, heightMm },
        nativeRaster,
        orientation: "landscape"
      }).value;
      const resizedOutput = resolveCaptureGeometry({
        imagingArea: { widthMm, heightMm },
        nativeRaster,
        orientation: "landscape",
        outputRaster: {
          pixelWidth: Math.max(1, Math.round(pixelWidth / 2)),
          pixelHeight: Math.max(1, Math.round(pixelHeight / 2))
        }
      }).value;

      const focalLengthMm = random.between(4, 600);
      const baseEquivalent = calculateEquivalentFocalLength35Mm({
        focalLengthMm,
        activeImagingArea: baseGeometry.activeCapture.imagingArea
      }).value.equivalentFocalLength35Mm;
      const resizedEquivalent = calculateEquivalentFocalLength35Mm({
        focalLengthMm,
        activeImagingArea: resizedOutput.activeCapture.imagingArea
      }).value.equivalentFocalLength35Mm;
      expect(resizedEquivalent).toBeCloseTo(baseEquivalent, 12);
    }
  });

  it("round-trips invertible radial profiles across a seeded corpus", () => {
    const random = createSeededRandom(0xd1570a7);

    for (let index = 0; index < 200; index += 1) {
      const normalizationRadiusMm = random.between(4, 50);
      const angle = random.between(-Math.PI, Math.PI);
      const normalizedRadius = random.between(0, 0.95);
      const source = {
        x: Math.cos(angle) * normalizedRadius * normalizationRadiusMm,
        y: Math.sin(angle) * normalizedRadius * normalizationRadiusMm
      };
      const profile = {
        normalizationRadiusMm,
        maximumNormalizedRadius: 1,
        coefficients: {
          k1: random.between(-0.08, 0.08),
          k2: random.between(-0.02, 0.02),
          k3: random.between(-0.005, 0.005)
        }
      };

      const forward = calculateRadialDistortionMapping({
        imagePointMm: source,
        profile
      });
      const inverse = calculateInverseRadialDistortionMapping({
        distortedImagePointMm: forward.value.mappedImagePointMm,
        profile
      });

      expect(inverse.value.sourceImagePointMm.x).toBeCloseTo(source.x, 10);
      expect(inverse.value.sourceImagePointMm.y).toBeCloseTo(source.y, 10);
    }
  });

  it("rejects seeded invalid numeric domains instead of producing permissive garbage", () => {
    const invalidValues = [0, -1, -1e6, Number.NaN, Infinity, -Infinity];

    for (const value of invalidValues) {
      expect(() =>
        calculateFieldOfView({
          focalLengthMm: value,
          sensorDimensionMm: 36
        })
      ).toThrow();

      expect(() =>
        calculatePixelPitch({
          sensorWidthMm: value,
          pixelWidth: 6000
        })
      ).toThrow();

      expect(() =>
        calculateAiryDisk({
          aperture: value,
          wavelengthNm: 550
        })
      ).toThrow();

      expect(() =>
        calculateCenteredCrop({
          pixelWidth: 6000,
          pixelHeight: 4000,
          cropFactor: value
        })
      ).toThrow();

      expect(() =>
        calculateSubjectFramingCrop({
          pixelWidth: 6000,
          pixelHeight: 4000,
          subjectHeightPixels: 1000,
          targetSubjectHeightFraction: value
        })
      ).toThrow();
    }
  });

  it("rejects incomplete or non-finite vectors through direct JavaScript calls", () => {
    const invalidVectors: unknown[] = [
      {},
      { x: 0, y: 0 },
      { x: Number.NaN, y: 0, z: 20 },
      { x: Infinity, y: 0, z: 20 },
      { x: 0, y: 0, z: 0 }
    ];

    for (const vector of invalidVectors) {
      expect(() =>
        calculateProjectedMotionBlur({
          focalLengthMm: 200,
          shutterSeconds: 1 / 1000,
          positionM:
            vector as CalculateProjectedMotionBlurInput["positionM"],
          velocityMps: { x: 1, y: 0, z: 0 }
        })
      ).toThrow();
    }
  });

  it("rejects malformed structural JSON across deterministic request-shape mutations", () => {
    const random = createSeededRandom(0xa11d17);
    const baseline = createBaselineSimulationRequest();

    const invalidLeaves: unknown[] = [
      null,
      "invalid",
      [],
      {},
      Number.NaN,
      Infinity
    ];

    for (let index = 0; index < 100; index += 1) {
      const mutation = random.integer(0, 4);
      const invalid = invalidLeaves[random.integer(0, invalidLeaves.length - 1)];

      let request: unknown;
      if (mutation === 0) {
        request = { ...baseline, sensor: invalid };
      } else if (mutation === 1) {
        request = { ...baseline, lens: invalid };
      } else if (mutation === 2) {
        request = { ...baseline, exposure: invalid };
      } else if (mutation === 3) {
        request = { ...baseline, motion: invalid };
      } else {
        request = { ...baseline, diffraction: invalid };
      }

      expect(() => parsePocSimulationRequest(request)).toThrow();
    }
  });

  it("rejects malformed public camera and scene configurations from seeded mutations", () => {
    const random = createSeededRandom(0xc0ffee);
    const invalidLeaves: unknown[] = [
      null,
      false,
      "invalid",
      [],
      {},
      Number.NaN,
      Infinity,
      -1
    ];

    for (let index = 0; index < 100; index += 1) {
      const invalid = invalidLeaves[random.integer(0, invalidLeaves.length - 1)];

      expect(() =>
        parseCameraConfiguration({
          sensor: invalid,
          lens: {
            focalLengthMm: 50,
            aperture: 2.8
          },
          exposure: {
            shutterSeconds: 1 / 125,
            iso: 100
          },
          focus: {
            focusDistanceM: 5
          }
        })
      ).toThrow();

      expect(() =>
        parseSceneDefinition({
          schemaVersion: "0.1.0",
          id: "fuzz-scene",
          version: "1.0.0",
          radiometry: invalid,
          capabilities: ["focus-targets"],
          objects: [{ id: "subject", distanceM: 5 }],
          focusTargetIds: ["subject"]
        })
      ).toThrow();
    }
  });

  it("keeps composed simulation JSON-safe across seeded sports-like configurations", () => {
    const random = createSeededRandom(0xba5eba11);

    for (let index = 0; index < 120; index += 1) {
      const request = createBaselineSimulationRequest();
      request.lens.focalLengthMm = random.between(24, 600);
      request.lens.aperture = random.between(1.4, 16);
      request.exposure.shutterSeconds = random.between(1 / 8000, 1 / 30);
      request.exposure.iso = random.between(100, 12800);
      request.focus.focusDistanceM = random.between(10, 100);
      request.crop.factor = random.between(1, 2.5);
      request.motion.velocityMps = {
        x: random.between(-50, 50),
        y: random.between(-20, 20),
        z: random.between(-0.25, 0.25)
      };

      const result = simulatePocCamera(request);
      expectFiniteTree(result);
      expect(() => JSON.stringify(result)).not.toThrow();
    }
  });
});
