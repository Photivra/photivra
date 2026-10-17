// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { calculateSensorApertureRays, sensorApertureRayValues } from "../src/optics/sensor-aperture-rays.js";
import { parseFocusPlane } from "../src/optics/focus-state.js";
import { apertureRadianceQuery, prebuildApertureRadianceQuery } from "../src/sensor/environment-photo-signal.js";
import type { SceneRadianceEvaluationRequest } from "../src/index.js";

/*
 * 2.0 performance (#275): the lean executor computes pupil rays with calculateSensorApertureRays' own core after one
 * validation per template, and copies each ray for the provider key by key instead of with structuredClone. Both must
 * give exactly what the full functions give.
 */
const evidence = [{ sourceOrigin: "photivra" as const, sourceReference: "photivra:aperture-fast-path-test", reuseStatus: "photivra-owned" as const }];
const pupil = { kind: "ideal-uniform-circular-pupil" as const, radialSampleCount: 3, angularSampleCount: 8, evidence, limitation: "Test pupil." };
const cases = [
  { sourcePointNativeSensorMm: { x: 0.3, y: -0.2 }, focus: { kind: "finite" as const, distanceM: 2.5 }, angularVelocityRadPerSec: { pitch: 0.2, yaw: -0.1, roll: 0.4 },
    timeSecondsFromOpeningReference: 0.004 },
  { sourcePointNativeSensorMm: { x: -0, y: 0 }, focus: { kind: "infinity" as const }, angularVelocityRadPerSec: { pitch: 0, yaw: 0, roll: 0 },
    timeSecondsFromOpeningReference: 0 }
];

describe("pupil ray fast path (2.0 performance)", () => {
  it("computes the same rays as calculateSensorApertureRays", () => {
    for (const c of cases) {
      const input = { ...c, focalLengthMm: 50, nominalFNumber: 2.8, pupil };
      const full = calculateSensorApertureRays(input).value;
      const fast = sensorApertureRayValues(input, pupil, parseFocusPlane(c.focus));
      expect(fast.rays).toStrictEqual(full.rays);
      expect(JSON.stringify(fast.rays)).toBe(JSON.stringify(full.rays));
      expect(Object.is(fast.v, full.projectionDistanceMm) && Object.is(fast.radius, full.pupilRadiusMm)).toBe(true);
    }
    expect(() => sensorApertureRayValues({ ...cases[0]!, focalLengthMm: 50, nominalFNumber: 2.8, timeSecondsFromOpeningReference: -1 }, pupil,
      parseFocusPlane(cases[0]!.focus))).toThrow();
  });

  it("copies rays and builds pupil requests exactly as structuredClone would, frozen, and hands prebuilt queries over once", () => {
    const ray = calculateSensorApertureRays({ ...cases[0]!, focalLengthMm: 50, nominalFNumber: 2.8, pupil }).value.rays[5]!;
    const base = Object.freeze({ schemaVersion: "0.1.0", sampleId: "s-t0-n0-p0", providerProfileId: "p", sceneId: "s", illuminationProfileId: "i",
      materialResponseProfileId: "m", target: Object.freeze({ kind: "environment-direction", outgoingDirectionUnitVector: Object.freeze({ x: 0, y: 0, z: -1 }) }),
      timeSecondsFromExposureStart: 0.001, wavelengthNanometers: 550, wavelengthBasis: "vacuum" }) as SceneRadianceEvaluationRequest;
    const query = apertureRadianceQuery(base, ray);
    expect(query.apertureRay).toStrictEqual(structuredClone(ray));
    expect(JSON.stringify(query.apertureRay)).toBe(JSON.stringify(structuredClone(ray)));
    expect(query.apertureRay).not.toBe(ray);
    expect(Object.isFrozen(query.apertureRay) && Object.isFrozen(query.apertureRay.originM) && Object.isFrozen(query.request.target)).toBe(true);
    expect(query.request.sampleId).toBe("s-t0-n0-p0-a5");
    expect(query.request.target).toStrictEqual({ kind: "environment-direction", outgoingDirectionUnitVector: {
      x: -ray.directionUnitVector.x, y: -ray.directionUnitVector.y, z: -ray.directionUnitVector.z } });
    const prebuilt = prebuildApertureRadianceQuery(base, ray), handed = apertureRadianceQuery(base, ray), fresh = apertureRadianceQuery(base, ray);
    expect(handed.request).toBe(prebuilt.request);
    expect(handed.apertureRay).toBe(prebuilt.apertureRay);
    expect(fresh.request).not.toBe(prebuilt.request);
    expect(fresh).toStrictEqual(prebuilt);
  });
});
