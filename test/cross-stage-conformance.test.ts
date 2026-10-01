// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import { calculateThinLensImageDistance, calculateFieldOfView, calculateProjectedObjectSize,
  calculateProjectedMotionBlur, calculateExposureValue100, calculateRelativeOpticalExposure,
  calculateAiryDisk, calculateDefocusCircle, type ProjectedMotionBlur } from "../src/index.js";
import { loadBasicReferenceFixture } from "./helpers/basic-reference-fixture.js";
const f = loadBasicReferenceFixture();
const lens = { focalLengthMm: f.lens.focalLengthMm, focusDistanceM: f.focus.distanceM };
const pitch = f.sensor.imagingArea.widthMm*1000/f.sensor.nativeRaster.pixelWidth;
describe("incremental merged-engine cross-stage conformance", () => {
  it("uses one physical focus plane across projection, FOV, object size, motion and defocus", () => {
    const projection = calculateThinLensImageDistance({ focalLengthMm: lens.focalLengthMm, objectDistanceM: lens.focusDistanceM });
    const field = calculateFieldOfView({ ...lens, sensorDimensionMm: f.sensor.imagingArea.widthMm });
    const size = calculateProjectedObjectSize({ ...lens, objectWidthM: f.target.widthM, objectHeightM: f.target.heightM,
      distanceM: f.target.distanceM, pixelPitchMicrometers: pitch });
    const motion = calculateProjectedMotionBlur({ ...lens, shutterSeconds: f.exposure.shutterSeconds, positionM: f.target.centerM,
      velocityMps: f.target.velocityMps, pixelPitchMicrometers: pitch });
    const defocus = calculateDefocusCircle({ ...lens, aperture: f.lens.aperture, subjectDistanceM: f.target.distanceM });
    // Independently solve 1/v=1/f-1/s in millimetres; not a second production API expectation.
    const v = 1/(1/f.lens.focalLengthMm-1/(1000*f.focus.distanceM));
    expect(projection.value.imageDistanceMm).toBeCloseTo(v, 12);
    expect(field.value.projectionDistanceMm).toBeCloseTo(v, 12);
    expect(size.value.projectionDistanceMm).toBeCloseTo(v, 12);
    expect(motion.value.projectionDistanceMm).toBeCloseTo(v, 12);
    expect(2*v*Math.tan(field.value.radians/2)).toBeCloseTo(f.sensor.imagingArea.widthMm, 12);
    expect(size.value.widthPixels!*pitch/1000).toBeCloseTo(v*f.target.widthM/f.target.distanceM, 12);
    expect(motion.value.distancePixels).toBe(0); expect(defocus.value.diameterMm).toBe(0);
    for (const result of [projection, field, size, motion, defocus]) expect(result.provenance.kind).toBe("calculated");
  });
  it("couples a one-stop shutter change to optical exposure and lateral motion without changing projection", () => {
    const base = { aperture: f.lens.aperture, shutterSeconds: f.exposure.shutterSeconds };
    const slower = { ...base, shutterSeconds: 2*base.shutterSeconds };
    const exposure = calculateRelativeOpticalExposure({ ...slower, referenceAperture: base.aperture, referenceShutterSeconds: base.shutterSeconds });
    const m = (shutterSeconds: number): ProjectedMotionBlur => calculateProjectedMotionBlur({ ...lens, shutterSeconds, positionM: f.target.centerM,
      velocityMps: { x: 1, y: 0, z: 0 }, pixelPitchMicrometers: pitch }).value;
    const short = m(base.shutterSeconds), long = m(slower.shutterSeconds);
    expect(exposure.value.factor).toBe(2); expect(exposure.value.stops).toBe(1);
    expect(calculateExposureValue100(slower).value-calculateExposureValue100(base).value).toBeCloseTo(-1, 12);
    expect(long.distanceMm).toBeCloseTo(2*short.distanceMm, 12);
    expect(long.distancePixels).toBeCloseTo(long.distanceMm*1000/pitch, 12);
    expect(long.projectionDistanceMm).toBe(short.projectionDistanceMm);
  });
  it("couples one-stop aperture change to exposure and diffraction while preserving focused projection", () => {
    const aperture = f.lens.aperture, stopped = aperture*Math.SQRT2;
    const relative = calculateRelativeOpticalExposure({ aperture: stopped, shutterSeconds: f.exposure.shutterSeconds,
      referenceAperture: aperture, referenceShutterSeconds: f.exposure.shutterSeconds });
    const airy = (aperture: number): number => calculateAiryDisk({ aperture, wavelengthNm: f.illumination.wavelengthNm }).value.firstZeroDiameterMicrometers;
    expect(relative.value.factor).toBeCloseTo(.5, 14); expect(relative.value.stops).toBeCloseTo(-1, 14);
    expect(airy(stopped)/airy(aperture)).toBeCloseTo(Math.SQRT2, 14);
    for (const n of [aperture, stopped]) expect(calculateDefocusCircle({ ...lens, aperture: n, subjectDistanceM: lens.focusDistanceM }).value.diameterMm).toBe(0);
    expect(calculateExposureValue100({ aperture: stopped, shutterSeconds: f.exposure.shutterSeconds }).value-
      calculateExposureValue100({ aperture, shutterSeconds: f.exposure.shutterSeconds }).value).toBeCloseTo(1, 12);
  });
});
