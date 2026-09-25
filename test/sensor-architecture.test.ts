import { describe, expect, it } from "vitest";

import {
  calculateSensorGeometryMetrics,
  parseSensorArchitectureProfile
} from "../src/index.js";

const manufacturerProvenance = {
  sourceKind: "manufacturer-published",
  sourceReference: "manufacturer-spec:example",
  reuseStatus: "factual-reference-only"
} as const;

describe("sensor architecture metadata", () => {
  it("represents BSI + stacked + rolling + Bayer independently", () => {
    const profile = parseSensorArchitectureProfile({
      schemaVersion: "0.1.0",
      illumination: {
        value: "bsi",
        provenance: manufacturerProvenance
      },
      integration: {
        value: "stacked",
        provenance: manufacturerProvenance
      },
      readoutCapabilities: {
        value: ["rolling"],
        provenance: manufacturerProvenance
      },
      colorSamplingFamily: {
        value: "bayer",
        provenance: manufacturerProvenance
      }
    });

    expect(profile.illumination?.value).toBe("bsi");
    expect(profile.integration?.value).toBe("stacked");
    expect(profile.readoutCapabilities?.value).toEqual(["rolling"]);
    expect(profile.colorSamplingFamily?.value).toBe("bayer");
  });

  it("represents BSI + monolithic + rolling independently", () => {
    const profile = parseSensorArchitectureProfile({
      schemaVersion: "0.1.0",
      illumination: {
        value: "bsi",
        provenance: manufacturerProvenance
      },
      integration: {
        value: "monolithic",
        provenance: manufacturerProvenance
      },
      readoutCapabilities: {
        value: ["rolling"],
        provenance: manufacturerProvenance
      },
      colorSamplingFamily: {
        value: "bayer",
        provenance: manufacturerProvenance
      }
    });

    expect(profile.integration?.value).toBe("monolithic");
    expect(profile.readoutCapabilities?.value).toEqual(["rolling"]);
  });

  it("does not couple global readout capability to stacking", () => {
    const profile = parseSensorArchitectureProfile({
      schemaVersion: "0.1.0",
      integration: {
        value: "monolithic",
        provenance: manufacturerProvenance
      },
      readoutCapabilities: {
        value: ["rolling", "global"],
        provenance: manufacturerProvenance
      }
    });

    expect(profile.integration?.value).toBe("monolithic");
    expect(profile.readoutCapabilities?.value).toEqual([
      "rolling",
      "global"
    ]);
  });

  it("leaves unknown architecture facts omitted rather than inferred", () => {
    const profile = parseSensorArchitectureProfile({
      schemaVersion: "0.1.0",
      illumination: {
        value: "bsi",
        provenance: manufacturerProvenance
      }
    });

    expect(profile.illumination?.value).toBe("bsi");
    expect(profile.integration).toBeUndefined();
    expect(profile.readoutCapabilities).toBeUndefined();
    expect(profile.colorSamplingFamily).toBeUndefined();
  });

  it("requires field-level provenance and a license for reusable data", () => {
    expect(() =>
      parseSensorArchitectureProfile({
        schemaVersion: "0.1.0",
        illumination: { value: "bsi" }
      })
    ).toThrow("provenance");

    expect(() =>
      parseSensorArchitectureProfile({
        schemaVersion: "0.1.0",
        illumination: {
          value: "bsi",
          provenance: {
            sourceKind: "openly-reusable",
            sourceReference: "dataset:example",
            reuseStatus: "reusable-data"
          }
        }
      })
    ).toThrow("license is required");

    const profile = parseSensorArchitectureProfile({
      schemaVersion: "0.1.0",
      illumination: {
        value: "bsi",
        provenance: {
          sourceKind: "openly-reusable",
          sourceReference: "dataset:example",
          reuseStatus: "reusable-data",
          license: "CC0-1.0"
        }
      }
    });

    expect(profile.illumination?.provenance.license).toBe("CC0-1.0");
  });

  it("rejects unsupported architecture vocabulary and duplicate capabilities", () => {
    expect(() =>
      parseSensorArchitectureProfile({
        schemaVersion: "0.1.0",
        integration: {
          value: "super-stacked",
          provenance: manufacturerProvenance
        }
      })
    ).toThrow("integration.value is invalid");

    expect(() =>
      parseSensorArchitectureProfile({
        schemaVersion: "0.1.0",
        readoutCapabilities: {
          value: ["rolling", "rolling"],
          provenance: manufacturerProvenance
        }
      })
    ).toThrow("must not contain duplicates");
  });

  it("keeps architecture metadata scientifically inert until a downstream model consumes it", () => {
    const before = calculateSensorGeometryMetrics({
      imagingArea: { widthMm: 36, heightMm: 24 },
      nativeRaster: { pixelWidth: 6000, pixelHeight: 4000 }
    }).value;

    parseSensorArchitectureProfile({
      schemaVersion: "0.1.0",
      illumination: {
        value: "bsi",
        provenance: manufacturerProvenance
      },
      integration: {
        value: "stacked",
        provenance: manufacturerProvenance
      },
      readoutCapabilities: {
        value: ["global"],
        provenance: manufacturerProvenance
      },
      colorSamplingFamily: {
        value: "quad-bayer",
        provenance: manufacturerProvenance
      }
    });

    const after = calculateSensorGeometryMetrics({
      imagingArea: { widthMm: 36, heightMm: 24 },
      nativeRaster: { pixelWidth: 6000, pixelHeight: 4000 }
    }).value;

    expect(after).toEqual(before);
  });
});
