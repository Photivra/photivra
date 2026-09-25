import { describe, expect, it } from "vitest";

import {
  calculateSensorGeometryMetrics,
  parseSensorArchitectureProfile
} from "../src/index.js";

const manufacturerEvidence = [
  {
    sourceOrigin: "manufacturer",
    sourceReference: "manufacturer-spec:example",
    reuseStatus: "factual-reference-only"
  }
] as const;

describe("sensor architecture metadata", () => {
  it("represents independent BSI + stacked + rolling + Bayer facts", () => {
    const profile = parseSensorArchitectureProfile({
      schemaVersion: "0.2.0",
      illumination: {
        value: "bsi",
        evidence: manufacturerEvidence
      },
      integration: {
        value: "stacked",
        evidence: manufacturerEvidence
      },
      readoutCapabilities: [
        {
          value: "rolling",
          evidence: manufacturerEvidence
        }
      ],
      colorSamplingFamily: {
        value: "bayer",
        evidence: manufacturerEvidence
      }
    });

    expect(profile.illumination?.value).toBe("bsi");
    expect(profile.integration?.value).toBe("stacked");
    expect(profile.readoutCapabilities?.map((fact) => fact.value)).toEqual([
      "rolling"
    ]);
    expect(profile.colorSamplingFamily?.value).toBe("bayer");
  });

  it("allows manufacturer-origin reusable data when an explicit license exists", () => {
    const profile = parseSensorArchitectureProfile({
      schemaVersion: "0.2.0",
      illumination: {
        value: "bsi",
        evidence: [
          {
            sourceOrigin: "manufacturer",
            sourceReference: "manufacturer-open-data:example",
            reuseStatus: "reusable-data",
            license: "CC-BY-4.0"
          }
        ]
      }
    });

    expect(profile.illumination?.evidence[0]?.reuseStatus).toBe(
      "reusable-data"
    );
  });

  it("keeps evidence independent for multi-valued readout capabilities", () => {
    const profile = parseSensorArchitectureProfile({
      schemaVersion: "0.2.0",
      readoutCapabilities: [
        {
          value: "rolling",
          evidence: manufacturerEvidence
        },
        {
          value: "global",
          evidence: [
            {
              sourceOrigin: "third-party",
              sourceReference: "open-dataset:global-readout",
              reuseStatus: "reusable-data",
              license: "CC0-1.0"
            }
          ]
        }
      ]
    });

    expect(profile.readoutCapabilities?.[0]?.evidence[0]?.sourceOrigin).toBe(
      "manufacturer"
    );
    expect(profile.readoutCapabilities?.[1]?.evidence[0]?.sourceOrigin).toBe(
      "third-party"
    );
  });

  it("leaves unknown architecture facts omitted rather than inferred", () => {
    const profile = parseSensorArchitectureProfile({
      schemaVersion: "0.2.0",
      illumination: {
        value: "bsi",
        evidence: manufacturerEvidence
      }
    });

    expect(profile.integration).toBeUndefined();
    expect(profile.readoutCapabilities).toBeUndefined();
    expect(profile.colorSamplingFamily).toBeUndefined();
  });

  it("requires evidence and licenses reusable data", () => {
    expect(() =>
      parseSensorArchitectureProfile({
        schemaVersion: "0.2.0",
        illumination: { value: "bsi", evidence: [] }
      })
    ).toThrow("must be a non-empty array");

    expect(() =>
      parseSensorArchitectureProfile({
        schemaVersion: "0.2.0",
        illumination: {
          value: "bsi",
          evidence: [
            {
              sourceOrigin: "third-party",
              sourceReference: "dataset:example",
              reuseStatus: "reusable-data"
            }
          ]
        }
      })
    ).toThrow("license is required");
  });

  it("rejects impossible ownership claims and duplicate capabilities", () => {
    expect(() =>
      parseSensorArchitectureProfile({
        schemaVersion: "0.2.0",
        illumination: {
          value: "bsi",
          evidence: [
            {
              sourceOrigin: "manufacturer",
              sourceReference: "manufacturer:example",
              reuseStatus: "photivra-owned"
            }
          ]
        }
      })
    ).toThrow("photivra-owned");

    expect(() =>
      parseSensorArchitectureProfile({
        schemaVersion: "0.2.0",
        readoutCapabilities: [
          { value: "rolling", evidence: manufacturerEvidence },
          { value: "rolling", evidence: manufacturerEvidence }
        ]
      })
    ).toThrow("duplicate capability values");
  });

  it("keeps architecture metadata scientifically inert", () => {
    const before = calculateSensorGeometryMetrics({
      imagingArea: { widthMm: 36, heightMm: 24 },
      nativeRaster: { pixelWidth: 6000, pixelHeight: 4000 }
    }).value;

    parseSensorArchitectureProfile({
      schemaVersion: "0.2.0",
      illumination: {
        value: "bsi",
        evidence: manufacturerEvidence
      },
      integration: {
        value: "stacked",
        evidence: manufacturerEvidence
      },
      readoutCapabilities: [
        { value: "global", evidence: manufacturerEvidence }
      ],
      colorSamplingFamily: {
        value: "quad-bayer",
        evidence: manufacturerEvidence
      }
    });

    const after = calculateSensorGeometryMetrics({
      imagingArea: { widthMm: 36, heightMm: 24 },
      nativeRaster: { pixelWidth: 6000, pixelHeight: 4000 }
    }).value;

    expect(after).toEqual(before);
  });
});
