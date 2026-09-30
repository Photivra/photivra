import { describe, expect, it } from "vitest";

import {
  SENSOR_ARCHITECTURE_PROFILE_SCHEMA_VERSION,
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


describe("sensor technology-family metadata", () => {
  it("exposes schema 0.3.0 as the current sensor-architecture schema", () => {
    expect(SENSOR_ARCHITECTURE_PROFILE_SCHEMA_VERSION).toBe("0.3.0");
  });

  it("represents CMOS independently from BSI, stacking, rolling readout, and Bayer sampling", () => {
    const profile = parseSensorArchitectureProfile({
      schemaVersion: "0.3.0",
      technologyFamily: {
        value: "cmos",
        evidence: manufacturerEvidence
      },
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

    expect(profile.schemaVersion).toBe("0.3.0");
    expect(profile.technologyFamily?.value).toBe("cmos");
    expect(profile.illumination?.value).toBe("bsi");
    expect(profile.integration?.value).toBe("stacked");
    expect(profile.readoutCapabilities?.[0]?.value).toBe("rolling");
    expect(profile.colorSamplingFamily?.value).toBe("bayer");
  });

  it("allows CCD + BSI + monochrome without treating the combination as contradictory", () => {
    const profile = parseSensorArchitectureProfile({
      schemaVersion: "0.3.0",
      technologyFamily: {
        value: "ccd",
        evidence: manufacturerEvidence
      },
      illumination: {
        value: "bsi",
        evidence: manufacturerEvidence
      },
      colorSamplingFamily: {
        value: "monochrome",
        evidence: manufacturerEvidence
      }
    });

    expect(profile.technologyFamily?.value).toBe("ccd");
    expect(profile.illumination?.value).toBe("bsi");
    expect(profile.colorSamplingFamily?.value).toBe("monochrome");
  });

  it("allows CMOS + FSI + global readout without inferring another architecture fact", () => {
    const profile = parseSensorArchitectureProfile({
      schemaVersion: "0.3.0",
      technologyFamily: {
        value: "cmos",
        evidence: manufacturerEvidence
      },
      illumination: {
        value: "fsi",
        evidence: manufacturerEvidence
      },
      readoutCapabilities: [
        {
          value: "global",
          evidence: manufacturerEvidence
        }
      ]
    });

    expect(profile.technologyFamily?.value).toBe("cmos");
    expect(profile.illumination?.value).toBe("fsi");
    expect(profile.readoutCapabilities?.[0]?.value).toBe("global");
    expect(profile.integration).toBeUndefined();
    expect(profile.colorSamplingFamily).toBeUndefined();
  });

  it("preserves legacy 0.2.0 schema identity and does not invent technology family", () => {
    const profile = parseSensorArchitectureProfile({
      schemaVersion: "0.2.0",
      illumination: {
        value: "bsi",
        evidence: manufacturerEvidence
      }
    });

    expect(profile.schemaVersion).toBe("0.2.0");
    expect(profile.technologyFamily).toBeUndefined();
    expect(profile.illumination?.value).toBe("bsi");
  });

  it("requires schema 0.3.0 before technologyFamily can be asserted", () => {
    expect(() =>
      parseSensorArchitectureProfile({
        schemaVersion: "0.2.0",
        technologyFamily: {
          value: "cmos",
          evidence: manufacturerEvidence
        }
      })
    ).toThrow("schema 0.2.0 does not support technologyFamily");
  });

  it("fails closed on unsupported technology-family values", () => {
    expect(() =>
      parseSensorArchitectureProfile({
        schemaVersion: "0.3.0",
        technologyFamily: {
          value: "scmos",
          evidence: manufacturerEvidence
        }
      })
    ).toThrow("technologyFamily.value is invalid");

    expect(() =>
      parseSensorArchitectureProfile({
        schemaVersion: "0.3.0",
        technologyFamily: {
          value: "emccd",
          evidence: manufacturerEvidence
        }
      })
    ).toThrow("technologyFamily.value is invalid");
  });

  it("keeps omitted technology family unknown rather than defaulting to CMOS", () => {
    const profile = parseSensorArchitectureProfile({
      schemaVersion: "0.3.0",
      illumination: {
        value: "bsi",
        evidence: manufacturerEvidence
      }
    });

    expect(profile.technologyFamily).toBeUndefined();
  });

  it("keeps CMOS/CCD technology metadata scientifically inert", () => {
    const before = calculateSensorGeometryMetrics({
      imagingArea: { widthMm: 36, heightMm: 24 },
      nativeRaster: { pixelWidth: 6000, pixelHeight: 4000 }
    }).value;

    parseSensorArchitectureProfile({
      schemaVersion: "0.3.0",
      technologyFamily: {
        value: "ccd",
        evidence: manufacturerEvidence
      },
      illumination: {
        value: "bsi",
        evidence: manufacturerEvidence
      },
      readoutCapabilities: [
        {
          value: "global",
          evidence: manufacturerEvidence
        }
      ]
    });

    const after = calculateSensorGeometryMetrics({
      imagingArea: { widthMm: 36, heightMm: 24 },
      nativeRaster: { pixelWidth: 6000, pixelHeight: 4000 }
    }).value;

    expect(after).toEqual(before);
  });
});
