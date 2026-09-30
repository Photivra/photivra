import { describe, expect, it } from "vitest";

import {
  calculateAiryDisk,
  calculateDefocusCircle,
  calculateDepthOfField,
  calculateExposureValue100,
  calculateFieldOfView,
  calculateProjectedObjectSize,
  calculateSensorGeometryMetrics,
  calculateThinLensImageDistance
} from "../src/index.js";
import { loadBasicReferenceFixture } from "./helpers/basic-reference-fixture.js";

const fixture = loadBasicReferenceFixture();

describe("basic reference scene fixture", () => {
  it("has stable Photivra-owned identity and neutral base-state controls", () => {
    expect(fixture.schemaVersion).toBe("0.1.0");
    expect(fixture.fixtureId).toBe("basic-reference-scene");
    expect(fixture.provenance).toEqual({
      sourceOrigin: "photivra",
      sourceReference: "test:basic-reference-scene",
      reuseStatus: "photivra-owned"
    });
    expect(fixture.target.velocityMps).toEqual({ x: 0, y: 0, z: 0 });
    expect(fixture.support.angularVelocityRadPerSec).toEqual({
      yaw: 0,
      pitch: 0,
      roll: 0
    });
    expect(fixture.stabilization.enabled).toBe(false);
    expect(fixture.corrections).toEqual({
      distortion: false,
      chromaticAberration: false,
      vignetting: false,
      digitalLensCorrection: false
    });
  });

  it("matches independently derived full-frame sensor geometry", () => {
    const result = calculateSensorGeometryMetrics({
      imagingArea: fixture.sensor.imagingArea,
      nativeRaster: fixture.sensor.nativeRaster
    }).value;

    expect(result.imagingArea.diagonalMm).toBeCloseTo(
      fixture.expected.sensor.diagonalMm,
      12
    );
    expect(result.imagingArea.aspectRatio).toBeCloseTo(
      fixture.expected.sensor.aspectRatio,
      12
    );
    expect(result.imagingArea.cropFactor35Mm).toBeCloseTo(
      fixture.expected.sensor.cropFactor35Mm,
      12
    );
    expect(result.sampling.pitchXMicrometers).toBeCloseTo(
      fixture.expected.sensor.pitchXMicrometers,
      12
    );
    expect(result.sampling.pitchYMicrometers).toBeCloseTo(
      fixture.expected.sensor.pitchYMicrometers,
      12
    );
    expect(result.nativeRaster.totalImageSamples).toBe(
      fixture.expected.sensor.totalImageSamples
    );
    expect(result.nativeRaster.megapixels).toBeCloseTo(
      fixture.expected.sensor.megapixels,
      12
    );
  });

  it("matches thin-lens projection and focus-aware field of view", () => {
    const thinLens = calculateThinLensImageDistance({
      focalLengthMm: fixture.lens.focalLengthMm,
      objectDistanceM: fixture.focus.distanceM
    }).value;

    expect(thinLens.imageDistanceMm).toBeCloseTo(
      fixture.expected.projection.imageDistanceMm,
      12
    );
    expect(thinLens.magnification).toBeCloseTo(
      fixture.expected.projection.magnification,
      12
    );
    expect(thinLens.infinityProjectionScale).toBeCloseTo(
      fixture.expected.projection.infinityProjectionScale,
      12
    );

    const horizontal = calculateFieldOfView({
      focalLengthMm: fixture.lens.focalLengthMm,
      sensorDimensionMm: fixture.sensor.imagingArea.widthMm,
      focusDistanceM: fixture.focus.distanceM
    }).value;
    const vertical = calculateFieldOfView({
      focalLengthMm: fixture.lens.focalLengthMm,
      sensorDimensionMm: fixture.sensor.imagingArea.heightMm,
      focusDistanceM: fixture.focus.distanceM
    }).value;
    const diagonal = calculateFieldOfView({
      focalLengthMm: fixture.lens.focalLengthMm,
      sensorDimensionMm: fixture.expected.sensor.diagonalMm,
      focusDistanceM: fixture.focus.distanceM
    }).value;

    expect(horizontal.degrees).toBeCloseTo(
      fixture.expected.projection.horizontalFieldOfViewDegrees,
      12
    );
    expect(vertical.degrees).toBeCloseTo(
      fixture.expected.projection.verticalFieldOfViewDegrees,
      12
    );
    expect(diagonal.degrees).toBeCloseTo(
      fixture.expected.projection.diagonalFieldOfViewDegrees,
      12
    );
  });

  it("projects the on-focus planar target to the independently derived size", () => {
    const result = calculateProjectedObjectSize({
      focalLengthMm: fixture.lens.focalLengthMm,
      objectWidthM: fixture.target.widthM,
      objectHeightM: fixture.target.heightM,
      distanceM: fixture.target.distanceM,
      focusDistanceM: fixture.focus.distanceM,
      pixelPitchMicrometers: fixture.expected.sensor.pitchXMicrometers
    }).value;

    expect(result.widthMm).toBeCloseTo(
      fixture.expected.projection.projectedTargetWidthMm,
      12
    );
    expect(result.heightMm).toBeCloseTo(
      fixture.expected.projection.projectedTargetHeightMm,
      12
    );
    expect(result.widthPixels).toBeCloseTo(
      fixture.expected.projection.projectedTargetWidthPixels,
      12
    );
    expect(result.heightPixels).toBeCloseTo(
      fixture.expected.projection.projectedTargetHeightPixels,
      12
    );
  });

  it("matches the ideal on-focus and depth-of-field reference values", () => {
    const defocus = calculateDefocusCircle({
      focalLengthMm: fixture.lens.focalLengthMm,
      aperture: fixture.lens.aperture,
      focusDistanceM: fixture.focus.distanceM,
      subjectDistanceM: fixture.target.distanceM
    }).value;
    const depth = calculateDepthOfField({
      focalLengthMm: fixture.lens.focalLengthMm,
      aperture: fixture.lens.aperture,
      focusDistanceM: fixture.focus.distanceM,
      circleOfConfusionMm: fixture.focus.circleOfConfusionMm
    }).value;

    expect(defocus.diameterMm).toBeCloseTo(
      fixture.expected.focus.defocusDiameterMm,
      12
    );
    expect(depth.hyperfocalDistanceM).toBeCloseTo(
      fixture.expected.focus.hyperfocalDistanceM,
      12
    );
    expect(depth.nearLimitM).toBeCloseTo(
      fixture.expected.focus.nearLimitM,
      12
    );
    expect(depth.farLimitM).toBeCloseTo(
      fixture.expected.focus.farLimitM,
      12
    );
    expect(depth.totalDepthOfFieldM).toBeCloseTo(
      fixture.expected.focus.totalDepthOfFieldM,
      12
    );
  });

  it("matches the independent Airy and EV100 reference relations", () => {
    const airy = calculateAiryDisk({
      aperture: fixture.lens.aperture,
      wavelengthNm: fixture.expected.diffraction.wavelengthNm
    }).value;
    const exposureValue = calculateExposureValue100({
      aperture: fixture.lens.aperture,
      shutterSeconds: fixture.exposure.shutterSeconds
    }).value;

    expect(airy.firstZeroDiameterMicrometers).toBeCloseTo(
      fixture.expected.diffraction.firstZeroDiameterMicrometers,
      12
    );
    expect(exposureValue).toBeCloseTo(
      fixture.expected.exposure.ev100,
      12
    );
  });

  it("keeps the Lambertian radiance reference independently calculable", () => {
    const expectedRadiance =
      (fixture.illumination.spectralIrradianceWattsPerSquareMeterNanometer *
        fixture.target.reflectance) /
      Math.PI;

    expect(expectedRadiance).toBeCloseTo(
      fixture.expected.radiance
        .lambertianSpectralRadianceWattsPerSquareMeterSteradianNanometer,
      12
    );
  });
});
