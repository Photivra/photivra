import { describe, expect, it } from "vitest";

import {
  calculateBrownConradyDistortionMapping,
  calculateCameraRotationImageMapping,
  calculateComposedGeometricMapping,
  calculateForwardGeometricMapping,
  calculateGeometricResampling,
  calculateGeometricSamplingPlan,
  calculateLensProjectionFieldOfView,
  calculateLensProjectionImagePoint,
  calculateRadialDistortionMapping,
  calculateSensorEnvironmentRadianceQuery,
  prepareGeometricMapping,
  type CalculateSensorEnvironmentRadianceQueryInput,
  type DigitalGeometricTransform,
  type LensProjectionModel
} from "../src/index.js";
import { sceneOpticalInput } from "./helpers/scene-optical-quadrature-fixture.js";

const BC_PROFILE = { normalizationRadiusMm: 20, maximumNormalizedRadius: 1, coefficients: { k1: -0.08, k2: 0.01, k3: 0, p1: 0.002, p2: -0.0015 } };

function bc(id = "bc"): DigitalGeometricTransform {
  return { id, version: "1", domain: "reconstructed-linear", purpose: "distortion", kind: "brown-conrady", profile: BC_PROFILE };
}
function remap(destination: LensProjectionModel, fd: number, source: LensProjectionModel, fs: number): DigitalGeometricTransform {
  return { id: "remap", version: "1", domain: "reconstructed-linear", purpose: "projection", kind: "projection-remap",
    destinationProjection: { projectionModel: destination, focalLengthMm: fd }, sourceProjection: { projectionModel: source, focalLengthMm: fs } };
}
function finiteDifference(transforms: readonly DigitalGeometricTransform[], p: { x: number; y: number }): number[] {
  const mapping = prepareGeometricMapping({ transforms, frameTimeSeconds: 0 }).value;
  const at = (q: { x: number; y: number }): { x: number; y: number } => calculateComposedGeometricMapping({ mapping, destinationPointMm: q }).value.sourcePointMm;
  const h = 1e-5;
  const xp = at({ x: p.x+h, y: p.y }), xm = at({ x: p.x-h, y: p.y }), yp = at({ x: p.x, y: p.y+h }), ym = at({ x: p.x, y: p.y-h });
  return [(xp.x-xm.x)/(2*h), (yp.x-ym.x)/(2*h), (xp.y-xm.y)/(2*h), (yp.y-ym.y)/(2*h)];
}

describe("versioned geometric transform kinds (mapping schema 0.2.0)", () => {
  it("keeps affine/radial-only mappings on schema and model version 0.1.0", () => {
    const radial: DigitalGeometricTransform = { id: "r", version: "1", domain: "reconstructed-linear", purpose: "distortion", kind: "radial",
      profile: { normalizationRadiusMm: 20, maximumNormalizedRadius: 1, coefficients: { k1: -0.05, k2: 0, k3: 0 } } };
    const result = prepareGeometricMapping({ transforms: [radial], frameTimeSeconds: 0 });
    expect(result.value.schemaVersion).toBe("0.1.0");
    expect(result.provenance.modelVersion).toBe("0.1.0");
    expect(prepareGeometricMapping({ transforms: [bc()], frameTimeSeconds: 0 }).value.schemaVersion).toBe("0.2.0");
  });

  it("maps a Brown-Conrady correction exactly like the standalone model, with an analytic Jacobian", () => {
    const mapping = prepareGeometricMapping({ transforms: [bc()], frameTimeSeconds: 0 }).value;
    for (const p of [{ x: 7, y: -4 }, { x: -12, y: 9 }, { x: 0, y: 0 }]) {
      const mapped = calculateComposedGeometricMapping({ mapping, destinationPointMm: p }).value;
      const standalone = calculateBrownConradyDistortionMapping({ imagePointMm: p, profile: BC_PROFILE }).value;
      expect(mapped.sourcePointMm.x).toBeCloseTo(standalone.mappedImagePointMm.x, 12);
      expect(mapped.sourcePointMm.y).toBeCloseTo(standalone.mappedImagePointMm.y, 12);
      finiteDifference([bc()], p).forEach((v, i) => expect(mapped.jacobian[i]).toBeCloseTo(v, 7));
      const back = calculateForwardGeometricMapping({ mapping, sourcePointMm: mapped.sourcePointMm }).value;
      expect(back.x).toBeCloseTo(p.x, 10);
      expect(back.y).toBeCloseTo(p.y, 10);
    }
    // Zero tangential terms agree with the radial kind.
    const radialOnly = { ...BC_PROFILE, coefficients: { ...BC_PROFILE.coefficients, p1: 0, p2: 0 } };
    const viaBc = calculateComposedGeometricMapping({ mapping: prepareGeometricMapping({ transforms: [{ ...bc(), profile: radialOnly } as DigitalGeometricTransform], frameTimeSeconds: 0 }).value, destinationPointMm: { x: 5, y: 6 } }).value.sourcePointMm;
    const viaRadial = calculateRadialDistortionMapping({ imagePointMm: { x: 5, y: 6 }, profile: { normalizationRadiusMm: 20, maximumNormalizedRadius: 1, coefficients: { k1: -0.08, k2: 0.01, k3: 0 } } }).value.mappedImagePointMm;
    expect(viaBc.x).toBeCloseTo(viaRadial.x, 13);
    expect(viaBc.y).toBeCloseTo(viaRadial.y, 13);
  });

  it("remaps between ideal projections with analytic Jacobians that match finite differences", () => {
    const cases: [LensProjectionModel, number, LensProjectionModel, number, { x: number; y: number }][] = [
      ["rectilinear", 10, "fisheye-equidistant", 8, { x: 6, y: -3 }],
      ["fisheye-stereographic", 8, "rectilinear", 12, { x: -4, y: 5 }],
      ["equirectangular", 6, "fisheye-equisolid-angle", 7, { x: 3, y: 2 }],
      ["fisheye-orthographic", 9, "equirectangular", 5, { x: 2, y: -6 }],
      ["fisheye-equidistant", 8, "fisheye-orthographic", 8, { x: 0, y: 0 }]
    ];
    for (const [dm, fd, sm, fs, p] of cases) {
      const t = remap(dm, fd, sm, fs);
      const mapping = prepareGeometricMapping({ transforms: [t], frameTimeSeconds: 0 }).value;
      const mapped = calculateComposedGeometricMapping({ mapping, destinationPointMm: p }).value;
      finiteDifference([t], p).forEach((v, i) => expect(mapped.jacobian[i]).toBeCloseTo(v, 6));
      const back = calculateForwardGeometricMapping({ mapping, sourcePointMm: mapped.sourcePointMm }).value;
      expect(back.x).toBeCloseTo(p.x, 10);
      expect(back.y).toBeCloseTo(p.y, 10);
    }
    // Rectilinear destination from an equidistant capture: source = equidistant image of the destination ray.
    const t = remap("rectilinear", 10, "fisheye-equidistant", 8);
    const mapping = prepareGeometricMapping({ transforms: [t], frameTimeSeconds: 0 }).value;
    const source = calculateComposedGeometricMapping({ mapping, destinationPointMm: { x: 6, y: -3 } }).value.sourcePointMm;
    const expected = calculateLensProjectionImagePoint({ projectionModel: "fisheye-equidistant", focalLengthMm: 8, direction: { x: 6, y: -3, z: 10 } }).value.imagePointMm;
    expect(source.x).toBeCloseTo(expected.x, 13);
    expect(source.y).toBeCloseTo(expected.y, 13);
    // Same model and scale is the identity.
    const identity = calculateComposedGeometricMapping({ mapping: prepareGeometricMapping({ transforms: [remap("fisheye-stereographic", 8, "fisheye-stereographic", 8)], frameTimeSeconds: 0 }).value, destinationPointMm: { x: 3, y: 4 } }).value;
    expect(identity.sourcePointMm.x).toBeCloseTo(3, 13);
    identity.jacobian.forEach((v, i) => expect(v).toBeCloseTo([1, 0, 0, 1][i]!, 12));
  });

  it("is rotation-covariant for radial projection remaps in all four orientations", () => {
    const mapping = prepareGeometricMapping({ transforms: [remap("rectilinear", 10, "fisheye-equisolid-angle", 8)], frameTimeSeconds: 0 }).value;
    const base = calculateComposedGeometricMapping({ mapping, destinationPointMm: { x: 5, y: 2 } }).value.sourcePointMm;
    for (const turns of [1, 2, 3]) {
      const a = (turns * Math.PI) / 2;
      const rot = (p: { x: number; y: number }): { x: number; y: number } => ({ x: p.x*Math.cos(a)-p.y*Math.sin(a), y: p.x*Math.sin(a)+p.y*Math.cos(a) });
      const mapped = calculateComposedGeometricMapping({ mapping, destinationPointMm: rot({ x: 5, y: 2 }) }).value.sourcePointMm;
      expect(mapped.x).toBeCloseTo(rot(base).x, 12);
      expect(mapped.y).toBeCloseTo(rot(base).y, 12);
    }
  });

  it("reports fisheye-source angles in the sampling plan and resamples fisheye to rectilinear once", () => {
    const mapping = prepareGeometricMapping({ transforms: [remap("rectilinear", 4, "fisheye-equidistant", 4)], frameTimeSeconds: 0 }).value;
    const sourceRaster = { width: 8, height: 8, centerMm: { x: 0, y: 0 }, pitchMm: 1 };
    const destinationRaster = { width: 4, height: 4, centerMm: { x: 0, y: 0 }, pitchMm: 1 };
    const resampler = { id: "bilinear", version: "1", filter: "bilinear" as const, antialias: "source-prefiltered" as const };
    const plan = calculateGeometricSamplingPlan({ mapping, sourceRaster, destinationRaster, resampler, physicalProjectionDistanceMm: 4, sourceProjectionModel: "fisheye-equidistant" }).value;
    expect(plan.physicalCapturedFovDegrees.horizontal).toBeCloseTo(calculateLensProjectionFieldOfView({ projectionModel: "fisheye-equidistant", focalLengthMm: 4, sensorDimensionMm: 8 }).value.degrees, 12);
    const legacy = calculateGeometricSamplingPlan({ mapping, sourceRaster, destinationRaster, resampler, physicalProjectionDistanceMm: 4 }).value;
    expect(legacy.physicalCapturedFovDegrees.horizontal).toBeCloseTo(2 * Math.atan(1) * 180 / Math.PI, 12);
    const samples = calculateGeometricResampling({ plan, sourceSamples: Array.from({ length: 64 }, (_, i) => i) }).value.samples;
    expect(samples).toHaveLength(16);
    expect(samples.every((v) => v === null || Number.isFinite(v))).toBe(true);
  });

  it("validates the new kinds strictly", () => {
    const prep = (t: unknown): unknown => prepareGeometricMapping({ transforms: [t as DigitalGeometricTransform], frameTimeSeconds: 0 });
    expect(() => prep({ ...remap("rectilinear", 1, "fisheye-equidistant", 1), purpose: "distortion" })).toThrow(/projection/);
    expect(() => prep({ ...bc(), purpose: "projection" })).toThrow(/projection/);
    expect(() => prep({ ...bc(), destinationProjection: { projectionModel: "rectilinear", focalLengthMm: 1 } })).toThrow(/projection declarations/);
    expect(() => prep({ ...remap("rectilinear", 1, "fisheye" as never, 1) })).toThrow(/projectionModel/);
    expect(() => prep({ ...bc(), profile: { ...BC_PROFILE, coefficients: { ...BC_PROFILE.coefficients, p1: 0.4 } } })).toThrow(/Jacobian/);
  });
});

function query(): CalculateSensorEnvironmentRadianceQueryInput {
  const s = sceneOpticalInput().samples[0]!.sceneRadianceRequest;
  const { target, timeSecondsFromExposureStart, ...base } = s;
  void target; void timeSecondsFromExposureStart;
  return { sourcePointNativeSensorMm: { x: 4, y: 3 }, focalLengthMm: 20, focus: { kind: "infinity" },
    angularVelocityRadPerSec: { pitch: 0.3, yaw: -0.2, roll: 0.5 }, timeReference: "first-opening-boundary-phase",
    timeSecondsFromOpeningReference: 0.01, environmentDirectionConvention: "outgoing-radiance-toward-camera", request: base };
}

describe("lens field mapping in the environment ray query", () => {
  it("an identity mapping (rectilinear, no distortion) reproduces the legacy query direction exactly", () => {
    const legacy = calculateSensorEnvironmentRadianceQuery(query()).value;
    const mapped = calculateSensorEnvironmentRadianceQuery({ ...query(), lensFieldMapping: { projectionModel: "rectilinear", distortion: { kind: "none" }, radiometricAreaCorrection: "inverse-distortion-jacobian" } });
    expect(mapped.value.referenceLookDirectionUnitVector).toEqual(legacy.referenceLookDirectionUnitVector);
    expect(mapped.value.request).toEqual(legacy.request);
    expect(mapped.value.lensFieldMapping?.distortionAreaFactor).toBe(1);
    expect(mapped.provenance.model).toBe("lens-mapped-sensor-environment-radiance-query");
    expect(legacy).not.toHaveProperty("lensFieldMapping");
  });

  it("unprojects a fisheye sensor point to the same scene ray as the equivalent rectilinear point, including rotation", () => {
    const fisheye = calculateSensorEnvironmentRadianceQuery({ ...query(), lensFieldMapping: { projectionModel: "fisheye-equidistant", distortion: { kind: "none" }, radiometricAreaCorrection: "inverse-distortion-jacobian" } }).value;
    // Equidistant point (4, -3) mm at f = 20: theta = 5/20; rectilinear point of the same ray is f tan(theta) along the same azimuth.
    const theta = 5 / 20, scale = (20 * Math.tan(theta)) / 5;
    const legacy = calculateSensorEnvironmentRadianceQuery({ ...query(), sourcePointNativeSensorMm: { x: 4 * scale, y: 3 * scale } }).value;
    expect(fisheye.referenceLookDirectionUnitVector.x).toBeCloseTo(legacy.referenceLookDirectionUnitVector.x, 13);
    expect(fisheye.referenceLookDirectionUnitVector.y).toBeCloseTo(legacy.referenceLookDirectionUnitVector.y, 13);
    expect(fisheye.referenceLookDirectionUnitVector.z).toBeCloseTo(legacy.referenceLookDirectionUnitVector.z, 13);
    expect(fisheye.projection).toBeNull();
    // Rays beyond 90 degrees are representable for a fisheye.
    const wide = calculateSensorEnvironmentRadianceQuery({ ...query(), angularVelocityRadPerSec: { pitch: 0, yaw: 0, roll: 0 }, sourcePointNativeSensorMm: { x: 40, y: 0 },
      lensFieldMapping: { projectionModel: "fisheye-equidistant", distortion: { kind: "none" }, radiometricAreaCorrection: "inverse-distortion-jacobian" } }).value;
    expect(wide.referenceLookDirectionUnitVector.z).toBeCloseTo(Math.cos(2), 13);
    void calculateCameraRotationImageMapping;
  });

  it("inverse-distorts the sensor point and reports the area factor 1/det for radial and Brown-Conrady distortion", () => {
    const radialProfile = { normalizationRadiusMm: 20, maximumNormalizedRadius: 1, coefficients: { k1: -0.06, k2: 0.01, k3: 0 } };
    for (const distortion of [{ kind: "radial" as const, profile: radialProfile }, { kind: "brown-conrady" as const, profile: BC_PROFILE }]) {
      const result = calculateSensorEnvironmentRadianceQuery({ ...query(), lensFieldMapping: { projectionModel: "rectilinear", distortion, radiometricAreaCorrection: "inverse-distortion-jacobian" } }).value;
      const ideal = result.lensFieldMapping!.idealImagePointMm;
      const forward = (p: { x: number; y: number }): { x: number; y: number } => distortion.kind === "radial"
        ? calculateRadialDistortionMapping({ imagePointMm: p, profile: radialProfile }).value.mappedImagePointMm
        : calculateBrownConradyDistortionMapping({ imagePointMm: p, profile: BC_PROFILE }).value.mappedImagePointMm;
      const back = forward(ideal);
      expect(back.x).toBeCloseTo(4, 10);
      expect(back.y).toBeCloseTo(-3, 10);
      const h = 1e-5;
      const xp = forward({ x: ideal.x+h, y: ideal.y }), xm = forward({ x: ideal.x-h, y: ideal.y });
      const yp = forward({ x: ideal.x, y: ideal.y+h }), ym = forward({ x: ideal.x, y: ideal.y-h });
      const det = ((xp.x-xm.x)*(yp.y-ym.y)-(yp.x-ym.x)*(xp.y-xm.y))/(4*h*h);
      expect(result.lensFieldMapping!.distortionAreaFactor).toBeCloseTo(1/det, 7);
      // The ray follows the ideal point through the unchanged rectilinear rotation path.
      const legacy = calculateSensorEnvironmentRadianceQuery({ ...query(), sourcePointNativeSensorMm: { x: ideal.x, y: -ideal.y } }).value;
      expect(result.referenceLookDirectionUnitVector).toEqual(legacy.referenceLookDirectionUnitVector);
    }
  });

  it("fails closed on malformed mappings", () => {
    const bad = (m: unknown): unknown => calculateSensorEnvironmentRadianceQuery({ ...query(), lensFieldMapping: m as never });
    expect(() => bad({ projectionModel: "rectilinear", distortion: { kind: "none" } })).toThrow(/radiometricAreaCorrection/);
    expect(() => bad({ projectionModel: "rectilinear", distortion: { kind: "none" }, radiometricAreaCorrection: "inverse-distortion-jacobian", strength: 1 })).toThrow(/unknown field/);
    expect(() => bad({ projectionModel: "rectilinear", distortion: { kind: "barrel" }, radiometricAreaCorrection: "inverse-distortion-jacobian" })).toThrow(/distortion.kind/);
    expect(() => bad({ projectionModel: "rectilinear", distortion: { kind: "radial", profile: { normalizationRadiusMm: 1, maximumNormalizedRadius: 1, coefficients: { k1: -0.5, k2: 0, k3: 0 } } }, radiometricAreaCorrection: "inverse-distortion-jacobian" })).toThrow(/monotonic/);
    expect(() => bad(null)).toThrow(/object/);
  });
});
