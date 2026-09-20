import { describe, expect, it } from "vitest";

import { simulatePocCamera } from "../src/index.js";

describe("POC composed simulation", () => {
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

    expect(result.apiVersion).toBe("0.17.0");
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
    expect(result.sensor.pixelPitchMicrometers).toBeCloseTo(6, 12);
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
});
