import { describe, expect, it } from "vitest";

import {
  InvalidPocRequestError,
  parsePocSimulationRequest
} from "../src/api/poc-request.js";
import { simulatePocCamera, type PocSimulationRequest } from "../src/simulation/poc-simulation.js";
import { InvalidConfigurationError } from "../src/core/configuration-error.js";
import { InvalidScientificInputError } from "../src/core/validation.js";

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

  it("accepts opt-in staged capture geometry", () => {
    const request = {
      ...createValidRequest(),
      crop: { factor: 1 },
      capture: {
        orientation: "portrait-clockwise",
        activeCaptureRect: {
          x: 500,
          y: 250,
          width: 5000,
          height: 3500
        },
        outputCropRect: {
          x: 250,
          y: 500,
          width: 3000,
          height: 4000
        },
        outputRaster: {
          pixelWidth: 1500,
          pixelHeight: 2000
        }
      }
    } satisfies PocSimulationRequest;

    expect(parsePocSimulationRequest(request)).toBe(request);
  });

  it("rejects an unknown capture orientation at the transport boundary", () => {
    const request = createValidRequest();

    expect(() =>
      parsePocSimulationRequest({
        ...request,
        capture: {
          orientation: "sideways"
        }
      })
    ).toThrow("capture.orientation must be one of");
  });

  it("rejects malformed capture rectangles with precise paths", () => {
    const request = createValidRequest();

    expect(() =>
      parsePocSimulationRequest({
        ...request,
        capture: {
          orientation: "landscape",
          activeCaptureRect: {
            x: 0,
            y: 0,
            width: "wide",
            height: 4000
          }
        }
      })
    ).toThrow("capture.activeCaptureRect.width must be a finite number.");
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

describe("POC request leaf fuzz (2.0-changes review #4)", () => {
  it("never lets a parsed request raise a non-client error for any numeric leaf substitution", () => {
    const base = (): Record<string, unknown> => ({
      sensor: { widthMm: 36, heightMm: 24, pixelWidth: 6000, pixelHeight: 4000 },
      lens: { focalLengthMm: 200, aperture: 5.6 },
      exposure: { shutterSeconds: 0.001, iso: 800 },
      focus: { focusDistanceM: 22, circleOfConfusionMm: 0.03 },
      crop: { factor: 1 },
      diffraction: { wavelengthNm: 550 },
      motion: { positionM: { x: 0, y: 0, z: 22 }, velocityMps: { x: 0, y: 0, z: 0 } },
      cameraShake: { angularVelocityRadPerSec: { yaw: 0.01, pitch: 0.01 }, stabilizationStopsEquivalent: 2 }
    });
    const paths = (value: object, prefix: string[] = []): string[][] =>
      Object.entries(value).flatMap(([key, child]) =>
        typeof child === "object" && child !== null ? paths(child as object, [...prefix, key]) : [[...prefix, key]]);
    const substitutes: unknown[] = [0, -1, 1e-300, 1e300, 1e-9, 1e9, "x", null, {}, [], true, 0.5, 2, 1e15, -0, 4294967296, 65536];
    const nonClient: string[] = [];
    for (const path of paths(base())) {
      for (const substitute of substitutes) {
        const request = base();
        let parent = request;
        for (const key of path.slice(0, -1)) parent = parent[key] as Record<string, unknown>;
        parent[path.at(-1)!] = substitute;
        try {
          simulatePocCamera(parsePocSimulationRequest(JSON.parse(JSON.stringify(request))));
        } catch (error) {
          if (!(error instanceof InvalidPocRequestError || error instanceof InvalidConfigurationError ||
            error instanceof InvalidScientificInputError)) {
            nonClient.push(`${path.join(".")}=${JSON.stringify(substitute)}: ${String(error)}`);
          }
        }
      }
    }
    expect(nonClient).toEqual([]);
  });
});
