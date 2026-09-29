import { describe, expect, it } from "vitest";

import {
  parseSensorOpticalStackProfile,
  resolveAntiAliasingSpatialKernel,
  type SensorOpticalStackProfile
} from "../src/index.js";

type OwnedEvidence = readonly [
  {
    sourceOrigin: "photivra";
    sourceReference: string;
    reuseStatus: "photivra-owned";
  }
];

const evidence = (
  sourceReference: string
): OwnedEvidence =>
  [
    {
      sourceOrigin: "photivra",
      sourceReference,
      reuseStatus: "photivra-owned"
    }
  ] as const;

function baseProfile(
  extra: Partial<SensorOpticalStackProfile> = {}
): SensorOpticalStackProfile {
  return {
    schemaVersion: "0.1.0",
    profileId: "test-stack",
    evidence: evidence("test:stack"),
    orderedComponents: [
      {
        componentId: "cover",
        roles: [
          "cover-glass",
          "infrared-cut",
          "anti-reflection"
        ],
        evidence: evidence("test:cover")
      }
    ],
    ...extra
  };
}

describe("sensor optical stack foundation", () => {
  it("distinguishes unknown AA response from explicit absence", () => {
    const unknown = parseSensorOpticalStackProfile(
      baseProfile()
    );

    expect(
      unknown.effectiveAntiAliasingSpatialResponse
    ).toBeUndefined();

    expect(() =>
      resolveAntiAliasingSpatialKernel(unknown)
    ).toThrow("unknown/unasserted");

    const absent =
      parseSensorOpticalStackProfile(
        baseProfile({
          effectiveAntiAliasingSpatialResponse: {
            kind: "absent",
            evidence: evidence("test:no-aa")
          }
        })
      );

    const resolved =
      resolveAntiAliasingSpatialKernel(absent);

    expect(resolved.effectiveResponse).toBe(
      "absent"
    );
    expect(resolved.components).toEqual([
      {
        offsetMicrometers: {
          x: 0,
          y: 0
        },
        normalizedWeight: 1
      }
    ]);
  });

  it("keeps physical low-pass hardware separate from net effective AA response", () => {
    const profile =
      parseSensorOpticalStackProfile({
        schemaVersion: "0.1.0",
        profileId: "cancelled-aa",
        evidence: evidence("test:cancelled"),
        orderedComponents: [
          {
            componentId: "splitter-a",
            roles: [
              "birefringent-low-pass"
            ],
            evidence: evidence("test:split-a")
          },
          {
            componentId: "retarder",
            roles: ["wave-plate"],
            evidence: evidence("test:wave")
          },
          {
            componentId: "splitter-b",
            roles: [
              "birefringent-low-pass"
            ],
            evidence: evidence("test:split-b")
          }
        ],
        effectiveAntiAliasingSpatialResponse: {
          kind: "absent",
          evidence: evidence(
            "test:effective-cancelled"
          )
        }
      });

    expect(
      profile.orderedComponents?.map(
        (component) => component.roles
      )
    ).toEqual([
      ["birefringent-low-pass"],
      ["wave-plate"],
      ["birefringent-low-pass"]
    ]);

    expect(
      resolveAntiAliasingSpatialKernel(profile)
        .effectiveResponse
    ).toBe("absent");
  });

  it("supports an arbitrary normalized point-splitting kernel instead of a fixed ray count", () => {
    const components = Array.from(
      { length: 16 },
      (_, index) => {
        const angle =
          (index * 2 * Math.PI) / 16;
        return {
          offsetMicrometers: {
            x: Math.cos(angle) * 1.5,
            y: Math.sin(angle) * 1.5
          },
          normalizedWeight: 1 / 16
        };
      }
    );

    const profile =
      parseSensorOpticalStackProfile({
        schemaVersion: "0.1.0",
        profileId: "sixteen-ray",
        evidence: evidence("test:sixteen-ray"),
        effectiveAntiAliasingSpatialResponse: {
          kind:
            "normalized-point-splitting-kernel",
          evidence: evidence("test:kernel"),
          coordinateSystem:
            "native-sensor-physical",
          scope:
            "field-wavelength-polarization-invariant-approximation",
          components
        }
      });

    const resolved =
      resolveAntiAliasingSpatialKernel(profile);

    expect(resolved.components).toHaveLength(16);
    expect(
      resolved.normalizedWeightSum
    ).toBeCloseTo(1, 12);
    expect(resolved.coordinateSystem).toBe(
      "native-sensor-physical"
    );
  });

  it("preserves anisotropic native sensor physical offsets without orientation transforms", () => {
    const profile =
      parseSensorOpticalStackProfile({
        schemaVersion: "0.1.0",
        profileId: "anisotropic",
        evidence: evidence("test:anisotropic"),
        effectiveAntiAliasingSpatialResponse: {
          kind:
            "normalized-point-splitting-kernel",
          evidence: evidence(
            "test:anisotropic-kernel"
          ),
          coordinateSystem:
            "native-sensor-physical",
          scope:
            "field-wavelength-polarization-invariant-approximation",
          components: [
            {
              offsetMicrometers: {
                x: -2,
                y: 0
              },
              normalizedWeight: 0.5
            },
            {
              offsetMicrometers: {
                x: 2,
                y: 0
              },
              normalizedWeight: 0.5
            }
          ]
        }
      });

    const resolved =
      resolveAntiAliasingSpatialKernel(profile);

    expect(
      resolved.components.map(
        (component) =>
          component.offsetMicrometers
      )
    ).toEqual([
      { x: -2, y: 0 },
      { x: 2, y: 0 }
    ]);
    expect(
      "orientation" in
        (resolved as unknown as Record<
          string,
          unknown
        >)
    ).toBe(false);
  });

  it("keeps normalized spatial weights separate from optical throughput", () => {
    const profile =
      parseSensorOpticalStackProfile({
        schemaVersion: "0.1.0",
        profileId: "weighted",
        evidence: evidence("test:weighted"),
        effectiveAntiAliasingSpatialResponse: {
          kind:
            "normalized-point-splitting-kernel",
          evidence: evidence("test:weighted-aa"),
          coordinateSystem:
            "native-sensor-physical",
          scope:
            "field-wavelength-polarization-invariant-approximation",
          components: [
            {
              offsetMicrometers: {
                x: 0,
                y: 0
              },
              normalizedWeight: 0.6
            },
            {
              offsetMicrometers: {
                x: 1,
                y: 0
              },
              normalizedWeight: 0.4
            }
          ]
        }
      });

    const resolved =
      resolveAntiAliasingSpatialKernel(profile);

    expect(resolved.normalizedWeightSum).toBe(1);
    expect(resolved.throughputIncluded).toBe(false);
    expect(
      resolved.spectralTransmissionIncluded
    ).toBe(false);
    expect(
      resolved.wholeSensorOpticalStackResponse
    ).toBe(false);
  });

  it("allows descriptive cover/filter roles without creating an effect model", () => {
    const profile =
      parseSensorOpticalStackProfile({
        schemaVersion: "0.1.0",
        profileId: "filter-stack",
        evidence: evidence("test:filter-stack"),
        orderedComponents: [
          {
            componentId: "front-pack",
            roles: [
              "cover-glass",
              "infrared-cut",
              "ultraviolet-cut",
              "anti-reflection"
            ],
            evidence: evidence("test:front-pack")
          }
        ]
      });

    expect(profile.orderedComponents).toEqual([
      {
        componentId: "front-pack",
        roles: [
          "cover-glass",
          "infrared-cut",
          "ultraviolet-cut",
          "anti-reflection"
        ],
        evidence: evidence("test:front-pack")
      }
    ]);
    expect(
      profile.effectiveAntiAliasingSpatialResponse
    ).toBeUndefined();
  });

  it("represents microlens presence or absence without inventing angular/QE behavior", () => {
    for (const presence of [
      "present",
      "absent"
    ] as const) {
      const profile =
        parseSensorOpticalStackProfile({
          schemaVersion: "0.1.0",
          profileId: "microlens-" + presence,
          evidence: evidence(
            "test:microlens:" + presence
          ),
          microlens: {
            presence,
            evidence: evidence(
              "test:microlens-fact:" +
                presence
            ),
            opticalEffectModel: "unresolved"
          }
        });

      expect(profile.microlens).toEqual({
        presence,
        evidence: evidence(
          "test:microlens-fact:" + presence
        ),
        opticalEffectModel: "unresolved"
      });
    }
  });

  it("fails closed when an AA response is present but spatially unresolved", () => {
    const profile =
      parseSensorOpticalStackProfile({
        schemaVersion: "0.1.0",
        profileId: "aa-unresolved",
        evidence: evidence("test:unresolved"),
        effectiveAntiAliasingSpatialResponse: {
          kind: "present-unresolved",
          evidence: evidence(
            "test:present-unresolved"
          )
        }
      });

    expect(() =>
      resolveAntiAliasingSpatialKernel(profile)
    ).toThrow("present but unresolved");
  });

  it("rejects malformed or unnormalized point-splitting kernels", () => {
    expect(() =>
      parseSensorOpticalStackProfile({
        schemaVersion: "0.1.0",
        profileId: "bad-sum",
        evidence: evidence("test:bad-sum"),
        effectiveAntiAliasingSpatialResponse: {
          kind:
            "normalized-point-splitting-kernel",
          evidence: evidence("test:bad-kernel"),
          coordinateSystem:
            "native-sensor-physical",
          scope:
            "field-wavelength-polarization-invariant-approximation",
          components: [
            {
              offsetMicrometers: {
                x: 0,
                y: 0
              },
              normalizedWeight: 0.7
            },
            {
              offsetMicrometers: {
                x: 1,
                y: 0
              },
              normalizedWeight: 0.2
            }
          ]
        }
      })
    ).toThrow("must sum to 1");

    expect(() =>
      parseSensorOpticalStackProfile({
        schemaVersion: "0.1.0",
        profileId: "bad-weight",
        evidence: evidence("test:bad-weight"),
        effectiveAntiAliasingSpatialResponse: {
          kind:
            "normalized-point-splitting-kernel",
          evidence: evidence("test:bad-weight-kernel"),
          coordinateSystem:
            "native-sensor-physical",
          scope:
            "field-wavelength-polarization-invariant-approximation",
          components: [
            {
              offsetMicrometers: {
                x: 0,
                y: 0
              },
              normalizedWeight: 0
            }
          ]
        }
      })
    ).toThrow("greater than zero");

    expect(() =>
      parseSensorOpticalStackProfile({
        schemaVersion: "0.1.0",
        profileId: "bad-offset",
        evidence: evidence("test:bad-offset"),
        effectiveAntiAliasingSpatialResponse: {
          kind:
            "normalized-point-splitting-kernel",
          evidence: evidence("test:bad-offset-kernel"),
          coordinateSystem:
            "native-sensor-physical",
          scope:
            "field-wavelength-polarization-invariant-approximation",
          components: [
            {
              offsetMicrometers: {
                x: Number.NaN,
                y: 0
              },
              normalizedWeight: 1
            }
          ]
        }
      })
    ).toThrow("finite number");
  });

  it("rejects duplicate component ids and duplicate component roles", () => {
    expect(() =>
      parseSensorOpticalStackProfile({
        schemaVersion: "0.1.0",
        profileId: "duplicate-components",
        evidence: evidence("test:duplicate-components"),
        orderedComponents: [
          {
            componentId: "same",
            roles: ["cover-glass"],
            evidence: evidence("test:first")
          },
          {
            componentId: "same",
            roles: ["infrared-cut"],
            evidence: evidence("test:second")
          }
        ]
      })
    ).toThrow("duplicate componentId");

    expect(() =>
      parseSensorOpticalStackProfile({
        schemaVersion: "0.1.0",
        profileId: "duplicate-roles",
        evidence: evidence("test:duplicate-roles"),
        orderedComponents: [
          {
            componentId: "one",
            roles: [
              "cover-glass",
              "cover-glass"
            ],
            evidence: evidence("test:roles")
          }
        ]
      })
    ).toThrow("duplicate roles");
  });

  it("requires at least one asserted stack fact and keeps evidence mandatory", () => {
    expect(() =>
      parseSensorOpticalStackProfile({
        schemaVersion: "0.1.0",
        profileId: "empty",
        evidence: evidence("test:empty")
      })
    ).toThrow("at least one");

    expect(() =>
      parseSensorOpticalStackProfile({
        schemaVersion: "0.1.0",
        profileId: "no-evidence",
        evidence: [],
        microlens: {
          presence: "present",
          evidence: evidence("test:microlens"),
          opticalEffectModel: "unresolved"
        }
      })
    ).toThrow("non-empty array");
  });

  it("does not infer whole-stack response from an AA-only kernel", () => {
    const profile =
      parseSensorOpticalStackProfile({
        schemaVersion: "0.1.0",
        profileId: "aa-only",
        evidence: evidence("test:aa-only"),
        orderedComponents: [
          {
            componentId: "ir-cut",
            roles: ["infrared-cut"],
            evidence: evidence("test:ir-cut")
          }
        ],
        microlens: {
          presence: "present",
          evidence: evidence("test:microlens"),
          opticalEffectModel: "unresolved"
        },
        effectiveAntiAliasingSpatialResponse: {
          kind:
            "normalized-point-splitting-kernel",
          evidence: evidence("test:aa-kernel"),
          coordinateSystem:
            "native-sensor-physical",
          scope:
            "field-wavelength-polarization-invariant-approximation",
          components: [
            {
              offsetMicrometers: {
                x: -1,
                y: -1
              },
              normalizedWeight: 0.25
            },
            {
              offsetMicrometers: {
                x: 1,
                y: -1
              },
              normalizedWeight: 0.25
            },
            {
              offsetMicrometers: {
                x: -1,
                y: 1
              },
              normalizedWeight: 0.25
            },
            {
              offsetMicrometers: {
                x: 1,
                y: 1
              },
              normalizedWeight: 0.25
            }
          ]
        }
      });

    const resolved =
      resolveAntiAliasingSpatialKernel(profile);

    expect(
      resolved.coverFilterStackEffectsIncluded
    ).toBe(false);
    expect(
      resolved.microlensResponseIncluded
    ).toBe(false);
    expect(
      resolved.fieldDependenceIncluded
    ).toBe(false);
    expect(
      resolved.wavelengthDependenceIncluded
    ).toBe(false);
    expect(
      resolved.polarizationDependenceIncluded
    ).toBe(false);
  });
});
