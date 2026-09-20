import { describe, expect, it } from "vitest";

import {
  InvalidPocRequestError,
  parsePocSimulationRequest
} from "../src/api/poc-request.js";
import type { PocSimulationRequest } from "../src/simulation/poc-simulation.js";

function createValidRequest(): PocSimulationRequest {
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
      shutterSeconds: 0.001,
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
      positionM: { x: 0, y: 1, z: 22 },
      velocityMps: { x: 30, y: 0, z: 0 }
    },
    subject: {
      widthM: 0.7,
      heightM: 1.85,
      distanceM: 22
    },
    defocusSamples: [
      { id: "deep-stadium", distanceM: 95 }
    ],
    samplingSamples: [
      {
        id: "catcher",
        widthM: 0.82,
        heightM: 1.35,
        distanceM: 22.8
      }
    ],
    motionSamples: [
      {
        id: "ball",
        positionM: { x: 0.2, y: 1.1, z: 21.8 },
        velocityMps: { x: 35, y: 1, z: 0 }
      }
    ],
    subjectCrop: {
      targetSubjectHeightFraction: 0.5
    },
    cameraShake: {
      angularVelocityRadPerSec: {
        yaw: 0.006,
        pitch: -0.004
      },
      stabilizationStopsEquivalent: 3
    },
    apertureShape: {
      bladeCount: 7,
      firstBladeEdgeAngleDegrees: 15
    },
    diagnostics: {
      subjectMotionSampleId: "ball"
    }
  };
}

describe("POC API request parser", () => {
  it("accepts a structurally valid request without changing it", () => {
    const request = createValidRequest();

    expect(parsePocSimulationRequest(request)).toBe(request);
  });

  it("rejects a non-object request body", () => {
    expect(() => parsePocSimulationRequest(null)).toThrow(
      new InvalidPocRequestError("request must be an object.")
    );
  });

  it("rejects a missing required object before simulation", () => {
    const request = createValidRequest();

    expect(() =>
      parsePocSimulationRequest({
        ...request,
        sensor: undefined
      })
    ).toThrow("sensor must be an object.");
  });

  it("rejects a wrong primitive type with a precise path", () => {
    const request = createValidRequest();

    expect(() =>
      parsePocSimulationRequest({
        ...request,
        exposure: {
          shutterSeconds: "fast",
          iso: 800
        }
      })
    ).toThrow("exposure.shutterSeconds must be a finite number.");
  });

  it("rejects malformed optional defocus samples", () => {
    const request = createValidRequest();

    expect(() =>
      parsePocSimulationRequest({
        ...request,
        defocusSamples: [
          {
            id: 42,
            distanceM: 95
          }
        ]
      })
    ).toThrow("defocusSamples[0].id must be a string.");
  });

  it("rejects malformed optional sampling entries", () => {
    const request = createValidRequest();

    expect(() =>
      parsePocSimulationRequest({
        ...request,
        samplingSamples: [
          {
            id: "catcher",
            widthM: 0.82,
            heightM: "tall",
            distanceM: 22.8
          }
        ]
      })
    ).toThrow("samplingSamples[0].heightM must be a finite number.");
  });

  it("rejects malformed optional motion vectors", () => {
    const request = createValidRequest();

    expect(() =>
      parsePocSimulationRequest({
        ...request,
        motionSamples: [
          {
            id: "ball",
            positionM: { x: 0, y: 0 },
            velocityMps: { x: 35, y: 0, z: 0 }
          }
        ]
      })
    ).toThrow("motionSamples[0].positionM.z must be a finite number.");
  });

  it("rejects malformed optional stabilization input", () => {
    const request = createValidRequest();

    expect(() =>
      parsePocSimulationRequest({
        ...request,
        cameraShake: {
          angularVelocityRadPerSec: {
            yaw: "unknown",
            pitch: -0.004
          },
          stabilizationStopsEquivalent: 3
        }
      })
    ).toThrow(
      "cameraShake.angularVelocityRadPerSec.yaw must be a finite number."
    );
  });
});
