import { describe, expect, it } from "vitest";

import {
  simulatePocCamera,
  type PocSimulationRequest
} from "../src/index.js";

describe("POC composed simulation", () => {
  it("rejects meaningfully non-square geometric sampling in the composed POC", () => {
    expect(() =>
      simulatePocCamera({
        sensor: {
          widthMm: 10,
          heightMm: 8,
          pixelWidth: 1000,
          pixelHeight: 400
        },
        lens: {
          focalLengthMm: 50,
          aperture: 5.6
        },
        exposure: {
          shutterSeconds: 1 / 125,
          iso: 100
        },
        focus: {
          focusDistanceM: 5,
          circleOfConfusionMm: 0.03
        },
        crop: {
          factor: 1
        },
        diffraction: {
          wavelengthNm: 550
        },
        motion: {
          positionM: { x: 0, y: 0, z: 5 },
          velocityMps: { x: 0, y: 0, z: 0 }
        }
      })
    ).toThrow("requires approximately square geometric sampling");
  });

  it("rejects duplicate named samples that would make client lookup ambiguous", () => {
    expect(() =>
      simulatePocCamera({
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
          positionM: { x: 0, y: 0, z: 22 },
          velocityMps: { x: 0, y: 0, z: 0 }
        },
        defocusSamples: [
          { id: "background", distanceM: 55 },
          { id: " background ", distanceM: 95 }
        ]
      })
    ).toThrow(
      "defocusSamples[].id values must be unique; duplicate: background"
    );
  });

  it("returns deterministic renderer-facing metrics for a baseline sports setup", () => {
    const result = simulatePocCamera({
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
        equivalentViewingCircleOfConfusion: {
          referenceSensorWidthMm: 36,
          referenceSensorHeightMm: 24,
          referenceCircleOfConfusionMm: 0.03
        }
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
      },
      subject: {
        widthM: 0.7,
        heightM: 1.85,
        distanceM: 22
      },
      defocusSamples: [
        { id: "near-crowd", distanceM: 55 },
        { id: "deep-stadium", distanceM: 95 }
      ],
      samplingSamples: [
        {
          id: "catcher",
          widthM: 0.82,
          heightM: 1.35,
          distanceM: 22.8
        },
        {
          id: "pitcher",
          widthM: 0.72,
          heightM: 1.82,
          distanceM: 39.5
        }
      ],
      subjectCrop: {
        targetSubjectHeightFraction: 0.9
      },
      cameraShake: {
        angularVelocityRadPerSec: {
          yaw: 0.01,
          pitch: -0.004
        },
        stabilizationStopsEquivalent: 3
      },
      apertureShape: {
        bladeCount: 7,
        firstBladeEdgeAngleDegrees: 10
      },
      diagnostics: {
        subjectMotionSampleId: "runner"
      },
      motionSamples: [
        {
          id: "ball",
          positionM: { x: 0.75, y: 0.8, z: 21.8 },
          velocityMps: { x: 35, y: 2, z: 0 }
        },
        {
          id: "runner",
          positionM: { x: 5, y: 0, z: 31 },
          velocityMps: { x: 8, y: 0, z: 0 }
        }
      ]
    });

    expect(result.apiVersion).toBe("0.20.0");
    expect(result.projection.kind).toBe("focus-aware-thin-lens");
    expect(result.projection.imageDistanceMm).toBeCloseTo(201.834862385, 9);
    expect(result.projection.infinityProjectionScale).toBeCloseTo(
      1.00917431193,
      10
    );
    expect(result.projection.provenance.model).toBe(
      "gaussian-thin-lens-image-distance"
    );
    expect(result.fieldOfView.horizontalDegrees).toBeCloseTo(10.1925, 3);
    expect(result.sensor.geometry.imagingArea.cropFactor35Mm).toBeCloseTo(1, 12);
    expect(result.sensor.geometry.nativeRaster.megapixels).toBeCloseTo(24, 12);
    expect(result.sensor.pixelPitchMicrometers).toBeCloseTo(6, 12);
    expect(result.sensor.pitchXMicrometers).toBeCloseTo(6, 12);
    expect(result.sensor.pitchYMicrometers).toBeCloseTo(6, 12);
    expect(result.sensor.pitchAxisRelativeDifference).toBeCloseTo(0, 12);
    expect(result.crop.cropFactor).toBe(1);
    expect(result.crop.megapixels).toBeCloseTo(24, 12);
    expect(result.crop.effectiveFieldOfView).toEqual(result.fieldOfView);
    expect(result.motion.distancePixels).toBeGreaterThan(50);
    expect(result.motion.deltaXPixels).toBeCloseTo(
      result.motion.deltaXMm / (result.sensor.pixelPitchMicrometers / 1000),
      12
    );
    expect(result.diffraction.airyDiameterPixels).toBeGreaterThan(1);
    expect(result.diffraction.pupilModel).toBe("ideal-circular");
    expect(result.diffraction.provenance.model).toBe(
      "ideal-circular-aperture-airy-disk"
    );
    expect(result.focusCriterion.source).toBe(
      "equivalent-viewing-approximation"
    );
    expect(result.focusCriterion.circleOfConfusionMm).toBeCloseTo(0.03, 12);
    if (result.focusCriterion.source !== "equivalent-viewing-approximation") {
      throw new Error("Expected equivalent-viewing focus criterion.");
    }
    expect(result.focusCriterion.targetBasis).toBe("full-sensor");
    expect(result.focusCriterion.targetImagingArea).toEqual({
      widthMm: 36,
      heightMm: 24
    });
    expect(result.subjectSampling?.heightPixels).toBeCloseTo(2828.74617737, 8);
    expect(result.subjectCrop?.subjectHeightFraction).toBeGreaterThanOrEqual(0.9);
    expect(result.subjectCrop?.subjectClipped).toBe(false);
    expect(result.subjectCrop?.additionalCropApplied).toBe(true);
    expect(result.subjectCrop?.additionalCropFactor).toBeGreaterThan(1);
    expect(result.subjectCrop?.totalCropFactor).toBeCloseTo(
      result.subjectCrop?.additionalCropFactor ?? 0,
      12
    );
    expect(result.subjectCrop?.pixelWidth).toBeLessThan(6000);
    expect(
      result.subjectCrop?.effectiveFieldOfView.horizontalDegrees
    ).toBeLessThan(result.fieldOfView.horizontalDegrees);
    expect(
      result.subjectCrop?.effectiveFieldOfView.verticalDegrees
    ).toBeLessThan(result.fieldOfView.verticalDegrees);
    expect(result.subjectCrop?.megapixels).toBeLessThan(24);
    expect(result.cameraShake?.provenance.kind).toBe("approximation");
    expect(result.cameraShake?.residualMotionFactor).toBeCloseTo(0.125, 12);
    expect(result.cameraShake?.stabilized.distancePixels).toBeLessThan(
      result.cameraShake?.unstabilized.distancePixels ?? Infinity
    );
    expect(result.cameraShake?.stabilized.deltaXPixels).toBeDefined();
    expect(result.cameraShake?.stabilized.deltaYPixels).toBeDefined();
    expect(result.apertureShape?.bladeCount).toBe(7);
    expect(result.apertureShape?.sunstarRayCount).toBe(14);
    expect(result.apertureShape?.normalizedVertices).toHaveLength(7);
    expect(result.apertureShape?.provenance.kind).toBe("calculated");
    expect(result.primarySubjectDiagnostics).toBeDefined();
    expect(
      result.primarySubjectDiagnostics?.samplingHeightPixels
    ).toBeCloseTo(2828.74617737, 8);
    expect(
      result.primarySubjectDiagnostics?.defocusDiameterPixels
    ).toBeCloseTo(0, 12);
    expect(
      result.primarySubjectDiagnostics?.diffractionFirstZeroDiameterPixels
    ).toBeGreaterThan(1);
    expect(result.primarySubjectDiagnostics?.subjectMotion?.id).toBe("runner");
    expect(
      result.primarySubjectDiagnostics?.cameraShake?.provenanceKind
    ).toBe("approximation");
    expect(result.primarySubjectDiagnostics?.diffractionModel).toBe(
      "ideal-circular-aperture-airy-disk"
    );
    expect(result.primarySubjectDiagnostics?.comparisonCaution).toMatch(
      /must not be directly summed/u
    );
    expect(result.defocusSamples).toHaveLength(2);
    expect(result.defocusSamples?.[0]?.id).toBe("near-crowd");
    expect(result.defocusSamples?.[0]?.diameterPixels).toBeGreaterThan(0);
    expect(result.defocusSamples?.[1]?.diameterPixels).toBeGreaterThan(
      result.defocusSamples?.[0]?.diameterPixels ?? 0
    );
    expect(result.samplingSamples).toHaveLength(2);
    expect(result.samplingSamples?.[0]?.id).toBe("catcher");
    expect(result.samplingSamples?.[0]?.heightPixels).toBeGreaterThan(
      result.samplingSamples?.[1]?.heightPixels ?? 0
    );
    expect(result.samplingSamples?.[1]?.id).toBe("pitcher");
    expect(result.motionSamples).toHaveLength(2);
    expect(result.motionSamples?.[0]?.id).toBe("ball");
    expect(result.motionSamples?.[0]?.deltaXPixels).toBeDefined();
    expect(result.motionSamples?.[0]?.deltaYPixels).toBeDefined();
    expect(result.motionSamples?.[0]?.distancePixels).toBeGreaterThan(
      result.motionSamples?.[1]?.distancePixels ?? 0
    );
    expect(result.provenance.kind).toBe("mixed");
    expect(result.provenance.components.projection).toBe("calculated");
    expect(result.provenance.components.focusCriterion).toBe("approximation");
    expect(result.provenance.components.cameraShake).toBe("approximation");
  });

  it("composes fixed crop and subject-framing crop in order", () => {
    const result = simulatePocCamera({
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
        factor: 1.1
      },
      diffraction: {
        wavelengthNm: 550
      },
      motion: {
        positionM: { x: 0, y: 0, z: 22 },
        velocityMps: { x: 0, y: 0, z: 0 }
      },
      subject: {
        widthM: 0.7,
        heightM: 1.85,
        distanceM: 22
      },
      subjectCrop: {
        targetSubjectHeightFraction: 0.9
      }
    });

    expect(result.crop.cropFactor).toBe(1.1);
    expect(result.crop.pixelWidth).toBe(5454);
    expect(result.crop.pixelHeight).toBe(3636);
    expect(result.crop.effectiveFieldOfView.horizontalDegrees).toBeLessThan(
      result.fieldOfView.horizontalDegrees
    );

    expect(result.subjectCrop?.additionalCropFactor).toBeGreaterThan(1);
    expect(result.subjectCrop?.totalCropFactor).toBeCloseTo(
      1.1 * (result.subjectCrop?.additionalCropFactor ?? 0),
      12
    );
    expect(result.subjectCrop?.pixelWidth).toBeLessThan(
      result.crop.pixelWidth
    );
    expect(
      result.subjectCrop?.effectiveFieldOfView.horizontalDegrees
    ).toBeLessThan(result.crop.effectiveFieldOfView.horizontalDegrees);
    expect(result.provenance.kind).toBe("calculated");
  });

  it("does not add a framing crop when the fixed crop already clips the subject", () => {
    const result = simulatePocCamera({
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
        factor: 1.5
      },
      diffraction: {
        wavelengthNm: 550
      },
      motion: {
        positionM: { x: 0, y: 0, z: 22 },
        velocityMps: { x: 0, y: 0, z: 0 }
      },
      subject: {
        widthM: 0.7,
        heightM: 1.85,
        distanceM: 22
      },
      subjectCrop: {
        targetSubjectHeightFraction: 0.9
      }
    });

    expect(result.subjectCrop?.additionalCropFactor).toBe(1);
    expect(result.subjectCrop?.totalCropFactor).toBe(1.5);
    expect(result.subjectCrop?.additionalCropApplied).toBe(false);
    expect(result.subjectCrop?.subjectClipped).toBe(true);
    expect(result.subjectCrop?.subjectHeightFraction).toBeGreaterThan(1);
  });

  it("composes portrait capture geometry without redefining legacy native vectors", () => {
    const result = simulatePocCamera({
      sensor: {
        widthMm: 36,
        heightMm: 24,
        pixelWidth: 6000,
        pixelHeight: 4000
      },
      lens: {
        focalLengthMm: 50,
        aperture: 2.8
      },
      exposure: {
        shutterSeconds: 1 / 125,
        iso: 100
      },
      focus: {
        focusDistanceM: 5,
        circleOfConfusionMm: 0.03
      },
      crop: {
        factor: 1
      },
      capture: {
        orientation: "portrait-clockwise"
      },
      diffraction: {
        wavelengthNm: 550
      },
      motion: {
        positionM: { x: 0, y: 0, z: 5 },
        velocityMps: { x: 1, y: 0, z: 0 }
      }
    });

    expect(result.capture).toBeDefined();
    expect(result.capture?.geometry.orientedCapture.raster).toEqual({
      pixelWidth: 4000,
      pixelHeight: 6000
    });
    expect(result.capture?.activeFieldOfView.horizontalDegrees).toBeCloseTo(
      result.fieldOfView.verticalDegrees,
      12
    );
    expect(result.capture?.activeFieldOfView.verticalDegrees).toBeCloseTo(
      result.fieldOfView.horizontalDegrees,
      12
    );
    expect(result.capture?.activeFieldOfView.diagonalDegrees).toBeCloseTo(
      result.fieldOfView.diagonalDegrees,
      12
    );
    expect(result.capture?.focalLength.actualFocalLengthMm).toBe(50);
    expect(result.capture?.focalLength.equivalentFocalLength35Mm).toBeCloseTo(
      50,
      12
    );

    expect(result.motion.deltaXPixels).toBeGreaterThan(0);
    expect(result.motion.deltaYPixels).toBeCloseTo(0, 12);
    expect(
      result.capture?.motion.orientedCaptureDeltaPixels.x
    ).toBeCloseTo(0, 12);
    expect(
      result.capture?.motion.orientedCaptureDeltaPixels.y
    ).toBeCloseTo(result.motion.deltaXPixels, 12);
  });

  it("converts legacy image-plane Y-up motion into raster Y-down before orientation", () => {
    const result = simulatePocCamera({
      sensor: {
        widthMm: 36,
        heightMm: 24,
        pixelWidth: 6000,
        pixelHeight: 4000
      },
      lens: {
        focalLengthMm: 50,
        aperture: 4
      },
      exposure: {
        shutterSeconds: 1 / 125,
        iso: 100
      },
      focus: {
        focusDistanceM: 5,
        circleOfConfusionMm: 0.03
      },
      crop: {
        factor: 1
      },
      capture: {
        orientation: "portrait-clockwise"
      },
      diffraction: {
        wavelengthNm: 550
      },
      motion: {
        positionM: { x: 0, y: 0, z: 5 },
        velocityMps: { x: 0, y: 1, z: 0 }
      }
    });

    expect(result.motion.deltaXPixels).toBeCloseTo(0, 12);
    expect(result.motion.deltaYPixels).toBeGreaterThan(0);
    expect(result.capture?.motion.nativeRasterDeltaPixels.x).toBeCloseTo(
      0,
      12
    );
    expect(result.capture?.motion.nativeRasterDeltaPixels.y).toBeCloseTo(
      -result.motion.deltaYPixels,
      12
    );
    expect(
      result.capture?.motion.orientedCaptureDeltaPixels.x
    ).toBeCloseTo(result.motion.deltaYPixels, 12);
    expect(
      result.capture?.motion.orientedCaptureDeltaPixels.y
    ).toBeCloseTo(0, 12);
  });

  it("keeps active-capture equivalence independent from later output crop and resampling", () => {
    const createRequest = (outputRaster: {
      pixelWidth: number;
      pixelHeight: number;
    }): PocSimulationRequest => ({
      sensor: {
        widthMm: 36,
        heightMm: 24,
        pixelWidth: 6000,
        pixelHeight: 4000
      },
      lens: {
        focalLengthMm: 50,
        aperture: 4
      },
      exposure: {
        shutterSeconds: 1 / 250,
        iso: 100
      },
      focus: {
        focusDistanceM: 10,
        circleOfConfusionMm: 0.03
      },
      crop: {
        factor: 1
      },
      capture: {
        orientation: "landscape" as const,
        activeCaptureRect: {
          x: 1500,
          y: 1000,
          width: 3000,
          height: 2000
        },
        outputCropRect: {
          x: 750,
          y: 500,
          width: 1500,
          height: 1000
        },
        outputRaster
      },
      diffraction: {
        wavelengthNm: 550
      },
      motion: {
        positionM: { x: 0, y: 0, z: 10 },
        velocityMps: { x: 1, y: 0, z: 0 }
      }
    });

    const first = simulatePocCamera(
      createRequest({ pixelWidth: 3000, pixelHeight: 2000 })
    );
    const second = simulatePocCamera(
      createRequest({ pixelWidth: 1500, pixelHeight: 1000 })
    );

    expect(first.capture?.geometry.activeCapture.imagingArea).toEqual({
      widthMm: 18,
      heightMm: 12
    });
    expect(first.capture?.focalLength.cropFactor35Mm).toBeCloseTo(2, 12);
    expect(first.capture?.focalLength.equivalentFocalLength35Mm).toBeCloseTo(
      100,
      12
    );
    expect(
      second.capture?.focalLength.equivalentFocalLength35Mm
    ).toBeCloseTo(first.capture?.focalLength.equivalentFocalLength35Mm ?? 0, 12);
    expect(second.capture?.activeFieldOfView).toEqual(
      first.capture?.activeFieldOfView
    );
    expect(second.capture?.outputFieldOfView).toEqual(
      first.capture?.outputFieldOfView
    );
    expect(
      first.capture?.outputFieldOfView.horizontalDegrees ?? Infinity
    ).toBeLessThan(
      first.capture?.activeFieldOfView.horizontalDegrees ?? 0
    );
    expect(first.capture?.geometry.output.sourceRetainedAreaFraction).toBeCloseTo(
      0.25,
      12
    );
    expect(first.capture?.motion.outputDeltaPixels.x).toBeCloseTo(
      2 * (first.capture?.motion.orientedCaptureDeltaPixels.x ?? 0),
      12
    );
    expect(second.capture?.motion.outputDeltaPixels.x).toBeCloseTo(
      first.capture?.motion.orientedCaptureDeltaPixels.x ?? 0,
      12
    );
    expect(first.capture?.outputSamplingScale).toEqual(
      first.capture?.geometry.output.orientedCaptureToOutputScale
    );
    expect(first.capture?.outputSamplingScale.x).toBeCloseTo(2, 12);
    expect(first.capture?.outputSamplingScale.y).toBeCloseTo(2, 12);
    expect(second.capture?.outputSamplingScale.x).toBeCloseTo(1, 12);
    expect(second.capture?.outputSamplingScale.y).toBeCloseTo(1, 12);
  });

  it("fails closed instead of combining staged capture geometry with legacy crop", () => {
    expect(() =>
      simulatePocCamera({
        sensor: {
          widthMm: 36,
          heightMm: 24,
          pixelWidth: 6000,
          pixelHeight: 4000
        },
        lens: {
          focalLengthMm: 50,
          aperture: 4
        },
        exposure: {
          shutterSeconds: 1 / 125,
          iso: 100
        },
        focus: {
          focusDistanceM: 5,
          circleOfConfusionMm: 0.03
        },
        crop: {
          factor: 1.2
        },
        capture: {
          orientation: "landscape"
        },
        diffraction: {
          wavelengthNm: 550
        },
        motion: {
          positionM: { x: 0, y: 0, z: 5 },
          velocityMps: { x: 0, y: 0, z: 0 }
        }
      })
    ).toThrow("cannot be combined with legacy crop.factor");
  });

  it("keeps an explicit physical CoC unchanged across capture and output crops", () => {
    const result = simulatePocCamera({
      sensor: {
        widthMm: 36,
        heightMm: 24,
        pixelWidth: 6000,
        pixelHeight: 4000
      },
      lens: {
        focalLengthMm: 50,
        aperture: 4
      },
      exposure: {
        shutterSeconds: 1 / 125,
        iso: 100
      },
      focus: {
        focusDistanceM: 5,
        circleOfConfusionMm: 0.03
      },
      crop: {
        factor: 1
      },
      capture: {
        orientation: "portrait-clockwise",
        activeCaptureRect: {
          x: 1500,
          y: 1000,
          width: 3000,
          height: 2000
        },
        outputCropRect: {
          x: 250,
          y: 750,
          width: 1500,
          height: 2250
        },
        outputRaster: {
          pixelWidth: 1000,
          pixelHeight: 1500
        }
      },
      diffraction: {
        wavelengthNm: 550
      },
      motion: {
        positionM: { x: 0, y: 0, z: 5 },
        velocityMps: { x: 0, y: 0, z: 0 }
      }
    });

    expect(result.focusCriterion).toEqual({
      source: "explicit",
      circleOfConfusionMm: 0.03
    });
  });

  it("bases capture-mode equivalent-viewing CoC on retained physical output area, not output pixel count", () => {
    const createRequest = (outputRaster: {
      pixelWidth: number;
      pixelHeight: number;
    }): PocSimulationRequest => ({
      sensor: {
        widthMm: 36,
        heightMm: 24,
        pixelWidth: 6000,
        pixelHeight: 4000
      },
      lens: {
        focalLengthMm: 50,
        aperture: 4
      },
      exposure: {
        shutterSeconds: 1 / 125,
        iso: 100
      },
      focus: {
        focusDistanceM: 5,
        equivalentViewingCircleOfConfusion: {
          referenceSensorWidthMm: 36,
          referenceSensorHeightMm: 24,
          referenceCircleOfConfusionMm: 0.03
        }
      },
      crop: {
        factor: 1
      },
      capture: {
        orientation: "landscape",
        outputCropRect: {
          x: 1500,
          y: 1000,
          width: 3000,
          height: 2000
        },
        outputRaster
      },
      diffraction: {
        wavelengthNm: 550
      },
      motion: {
        positionM: { x: 0, y: 0, z: 5 },
        velocityMps: { x: 0, y: 0, z: 0 }
      }
    });

    const first = simulatePocCamera(
      createRequest({ pixelWidth: 3000, pixelHeight: 2000 })
    );
    const second = simulatePocCamera(
      createRequest({ pixelWidth: 1500, pixelHeight: 1000 })
    );

    expect(first.focusCriterion.source).toBe(
      "equivalent-viewing-approximation"
    );
    if (first.focusCriterion.source !== "equivalent-viewing-approximation") {
      throw new Error("Expected equivalent-viewing focus criterion.");
    }
    if (second.focusCriterion.source !== "equivalent-viewing-approximation") {
      throw new Error("Expected equivalent-viewing focus criterion.");
    }

    expect(first.focusCriterion.targetBasis).toBe("final-retained-output");
    expect(first.focusCriterion.targetImagingArea).toEqual({
      widthMm: 18,
      heightMm: 12
    });
    expect(first.focusCriterion.circleOfConfusionMm).toBeCloseTo(0.015, 12);
    expect(second.focusCriterion.circleOfConfusionMm).toBeCloseTo(
      first.focusCriterion.circleOfConfusionMm,
      12
    );
    expect(second.focusCriterion.scaleFactor).toBeCloseTo(
      first.focusCriterion.scaleFactor,
      12
    );
  });

  it("uses the subject-framed retained area for capture-mode equivalent-viewing CoC", () => {
    const result = simulatePocCamera({
      sensor: {
        widthMm: 36,
        heightMm: 24,
        pixelWidth: 6000,
        pixelHeight: 4000
      },
      lens: {
        focalLengthMm: 50,
        aperture: 4
      },
      exposure: {
        shutterSeconds: 1 / 125,
        iso: 100
      },
      focus: {
        focusDistanceM: 5,
        equivalentViewingCircleOfConfusion: {
          referenceSensorWidthMm: 36,
          referenceSensorHeightMm: 24,
          referenceCircleOfConfusionMm: 0.03
        }
      },
      crop: {
        factor: 1
      },
      capture: {
        orientation: "portrait-clockwise"
      },
      diffraction: {
        wavelengthNm: 550
      },
      motion: {
        positionM: { x: 0, y: 0, z: 5 },
        velocityMps: { x: 0, y: 0, z: 0 }
      },
      subject: {
        widthM: 1,
        heightM: 2,
        distanceM: 5
      },
      subjectCrop: {
        targetSubjectHeightFraction: 0.5
      }
    });

    if (result.focusCriterion.source !== "equivalent-viewing-approximation") {
      throw new Error("Expected equivalent-viewing focus criterion.");
    }
    const retained = result.capture?.subjectFraming?.retainedImagingArea;
    expect(retained).toBeDefined();
    expect(result.focusCriterion.targetBasis).toBe("final-retained-output");
    expect(result.focusCriterion.targetImagingArea).toEqual(retained);
    expect(result.focusCriterion.circleOfConfusionMm).toBeLessThan(0.03);
  });

  it("composes orientation-aware subject framing without reusing legacy total-crop semantics", () => {
    const portrait = simulatePocCamera({
      sensor: {
        widthMm: 36,
        heightMm: 24,
        pixelWidth: 6000,
        pixelHeight: 4000
      },
      lens: {
        focalLengthMm: 50,
        aperture: 4
      },
      exposure: {
        shutterSeconds: 1 / 125,
        iso: 100
      },
      focus: {
        focusDistanceM: 5,
        circleOfConfusionMm: 0.03
      },
      crop: {
        factor: 1
      },
      capture: {
        orientation: "portrait-clockwise"
      },
      diffraction: {
        wavelengthNm: 550
      },
      motion: {
        positionM: { x: 0, y: 0, z: 5 },
        velocityMps: { x: 0, y: 0, z: 0 }
      },
      subject: {
        widthM: 1,
        heightM: 2,
        distanceM: 5
      },
      subjectCrop: {
        targetSubjectHeightFraction: 0.5
      }
    });

    expect(portrait.subjectCrop).toBeUndefined();
    expect(portrait.capture?.subjectFraming).toBeDefined();
    expect(portrait.capture?.subjectFraming?.basis).toBe(
      "centered-output-framing"
    );
    expect(
      portrait.capture?.subjectFraming?.additionalCropApplied
    ).toBe(true);
    expect(
      portrait.capture?.subjectFraming?.effectiveFieldOfView.verticalDegrees ??
        Infinity
    ).toBeLessThan(
      portrait.capture?.outputFieldOfView.verticalDegrees ?? 0
    );
    expect(
      portrait.capture?.subjectFraming?.retainedImagingArea.heightMm ?? 0
    ).toBeLessThan(
      portrait.capture?.geometry.output.imagingArea.heightMm ?? 0
    );

    const landscape = simulatePocCamera({
      sensor: {
        widthMm: 36,
        heightMm: 24,
        pixelWidth: 6000,
        pixelHeight: 4000
      },
      lens: {
        focalLengthMm: 50,
        aperture: 4
      },
      exposure: {
        shutterSeconds: 1 / 125,
        iso: 100
      },
      focus: {
        focusDistanceM: 5,
        circleOfConfusionMm: 0.03
      },
      crop: {
        factor: 1
      },
      capture: {
        orientation: "landscape"
      },
      diffraction: {
        wavelengthNm: 550
      },
      motion: {
        positionM: { x: 0, y: 0, z: 5 },
        velocityMps: { x: 0, y: 0, z: 0 }
      },
      subject: {
        widthM: 1,
        heightM: 2,
        distanceM: 5
      },
      subjectCrop: {
        targetSubjectHeightFraction: 0.5
      }
    });

    expect(
      landscape.capture?.subjectFraming?.additionalCropApplied
    ).toBe(false);
  });

});
