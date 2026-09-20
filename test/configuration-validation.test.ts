import { describe, expect, it } from "vitest";

import {
  parseCameraConfiguration,
  parseSceneDefinition
} from "../src/index.js";

describe("public runtime configuration parsers", () => {
  it("validates an external camera configuration", () => {
    const camera = {
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
        focusDistanceM: 22
      },
      stabilization: {
        bodyEnabled: true,
        lensEnabled: false,
        support: "handheld"
      }
    };

    expect(parseCameraConfiguration(camera)).toBe(camera);
  });

  it("rejects malformed camera data before calculation code sees it", () => {
    expect(() =>
      parseCameraConfiguration({
        sensor: {
          widthMm: 36,
          heightMm: 24,
          pixelWidth: 6000.5,
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
          focusDistanceM: 22
        }
      })
    ).toThrow("camera.sensor.pixelWidth must be a positive safe integer.");
  });

  it("validates scene capabilities and focus references", () => {
    const scene = {
      schemaVersion: "0.1.0",
      id: "test-scene",
      version: "1.0.0",
      radiometry: {
        kind: "relative-linear",
        referenceValue: 0.18
      },
      capabilities: [
        "scene-linear-rgb",
        "focus-targets",
        "multi-resolution-layers"
      ],
      objects: [
        {
          id: "subject",
          distanceM: 20,
          motion: {
            linearVelocityMps: { x: 1, y: 0, z: 0 }
          }
        }
      ],
      focusTargetIds: ["subject"]
    };

    expect(parseSceneDefinition(scene)).toBe(scene);
  });

  it("accepts camera configuration without optional stabilization", () => {
    const camera = {
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
        focusDistanceM: 5
      }
    };

    expect(parseCameraConfiguration(camera)).toBe(camera);
  });

  it("rejects an unsupported camera support mode", () => {
    expect(() =>
      parseCameraConfiguration({
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
          focusDistanceM: 5
        },
        stabilization: {
          bodyEnabled: true,
          lensEnabled: false,
          support: "gimbal"
        }
      })
    ).toThrow("camera.stabilization.support is invalid.");
  });

  it("accepts absolute luminance scenes with optional object metadata", () => {
    const scene = {
      schemaVersion: "0.1.0",
      id: "absolute-scene",
      version: "1.0.0",
      radiometry: {
        kind: "absolute-luminance",
        referenceValue: 0.18,
        referenceLuminanceCdM2: 120
      },
      capabilities: [
        "absolute-radiometry",
        "motion-vectors"
      ],
      objects: [
        {
          id: "subject",
          label: "Subject",
          distanceM: 10,
          tags: ["moving"],
          motion: {
            linearVelocityMps: { x: 1, y: 0, z: 0 },
            angularVelocityRadPerSec: { x: 0, y: 0.1, z: 0 }
          }
        }
      ]
    };

    expect(parseSceneDefinition(scene)).toBe(scene);
  });

  it("rejects unknown radiometry and scene capabilities", () => {
    expect(() =>
      parseSceneDefinition({
        schemaVersion: "0.1.0",
        id: "bad-radiometry",
        version: "1.0.0",
        radiometry: {
          kind: "watts",
          referenceValue: 1
        },
        capabilities: [],
        objects: []
      })
    ).toThrow("scene.radiometry.kind is invalid.");

    expect(() =>
      parseSceneDefinition({
        schemaVersion: "0.1.0",
        id: "bad-capability",
        version: "1.0.0",
        radiometry: {
          kind: "relative-linear",
          referenceValue: 0.18
        },
        capabilities: ["magic-depth"],
        objects: []
      })
    ).toThrow("Unknown scene capability: magic-depth");
  });

  it("rejects duplicate capabilities and object IDs", () => {
    expect(() =>
      parseSceneDefinition({
        schemaVersion: "0.1.0",
        id: "duplicates",
        version: "1.0.0",
        radiometry: {
          kind: "relative-linear",
          referenceValue: 0.18
        },
        capabilities: ["focus-targets", "focus-targets"],
        objects: []
      })
    ).toThrow("scene.capabilities must not contain duplicates.");

    expect(() =>
      parseSceneDefinition({
        schemaVersion: "0.1.0",
        id: "duplicate-objects",
        version: "1.0.0",
        radiometry: {
          kind: "relative-linear",
          referenceValue: 0.18
        },
        capabilities: [],
        objects: [
          { id: "subject", distanceM: 10 },
          { id: "subject", distanceM: 20 }
        ]
      })
    ).toThrow("scene.objects[].id must not contain duplicates.");
  });

  it("rejects malformed scene object collections and optional metadata", () => {
    expect(() =>
      parseSceneDefinition({
        schemaVersion: "0.1.0",
        id: "bad-objects",
        version: "1.0.0",
        radiometry: {
          kind: "relative-linear",
          referenceValue: 0.18
        },
        capabilities: [],
        objects: {}
      })
    ).toThrow("scene.objects must be an array.");

    expect(() =>
      parseSceneDefinition({
        schemaVersion: "0.1.0",
        id: "bad-label",
        version: "1.0.0",
        radiometry: {
          kind: "relative-linear",
          referenceValue: 0.18
        },
        capabilities: [],
        objects: [
          {
            id: "subject",
            label: 42,
            distanceM: 10
          }
        ]
      })
    ).toThrow("scene.objects[0].label must be a string.");
  });

  it("rejects duplicate focus targets", () => {
    expect(() =>
      parseSceneDefinition({
        schemaVersion: "0.1.0",
        id: "duplicate-focus",
        version: "1.0.0",
        radiometry: {
          kind: "relative-linear",
          referenceValue: 0.18
        },
        capabilities: ["focus-targets"],
        objects: [{ id: "subject", distanceM: 10 }],
        focusTargetIds: ["subject", "subject"]
      })
    ).toThrow("scene.focusTargetIds must not contain duplicates.");
  });

  it("rejects a scene focus target that does not exist", () => {
    expect(() =>
      parseSceneDefinition({
        schemaVersion: "0.1.0",
        id: "test-scene",
        version: "1.0.0",
        radiometry: {
          kind: "relative-linear",
          referenceValue: 0.18
        },
        capabilities: ["focus-targets"],
        objects: [{ id: "subject", distanceM: 20 }],
        focusTargetIds: ["missing"]
      })
    ).toThrow("Unknown scene focus target: missing");
  });
});
