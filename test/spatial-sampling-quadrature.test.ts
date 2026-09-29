import { describe, expect, it } from "vitest";

import {
  calculateSensorSpatialSamplingQuadrature,
  type NativeEffectiveRasterColorSamplingBindingProfile,
  type SensorColorSamplingProfile,
  type SensorOpticalStackProfile,
  type SensorSamplingApertureProfile
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

const imagingArea = {
  widthMm: 4,
  heightMm: 2
};

const nativeRaster = {
  pixelWidth: 4,
  pixelHeight: 2
};

const colorProfile =
  (): SensorColorSamplingProfile => ({
    schemaVersion: "0.1.0",
    profileId: "bayer-like",
    evidence: evidence("test:color"),
    coordinateSystem:
      "native-sensor-color-sampling-site-index",
    layout: {
      kind: "periodic-mosaic",
      repeatWidthSites: 2,
      repeatHeightSites: 2,
      siteChannelIds: [
        "red",
        "green",
        "green",
        "blue"
      ],
      anchor: "native-sensor-top-left-site"
    }
  });

const bindingProfile =
  (): NativeEffectiveRasterColorSamplingBindingProfile => ({
    schemaVersion: "0.1.0",
    bindingId: "binding",
    colorSamplingProfileId:
      "bayer-like",
    nativeRaster,
    evidence: evidence("test:binding"),
    relationship: {
      kind:
        "regular-native-effective-sample-blocks",
      sitesPerNativeSampleX: 1,
      sitesPerNativeSampleY: 1,
      anchor: "shared-native-top-left"
    }
  });

const samplingProfile =
  (
    overrides: Partial<SensorSamplingApertureProfile> = {}
  ): SensorSamplingApertureProfile => ({
    schemaVersion: "0.1.0",
    profileId: "sampling",
    colorSamplingProfileId:
      "bayer-like",
    colorSamplingBindingId: "binding",
    evidence: evidence("test:sampling"),
    siteCenterLattice: {
      kind:
        "regular-rectangular-site-center-lattice",
      coordinateSystem:
        "native-sensor-physical",
      pitchXMicrometers: 1000,
      pitchYMicrometers: 1000,
      firstSiteCenterFromImagingAreaTopLeftMicrometers:
        {
          x: 500,
          y: 500
        },
      evidence: evidence("test:lattice")
    },
    geometricSensitiveAperture: {
      kind:
        "uniform-axis-aligned-rectangle",
      widthMicrometers: 800,
      heightMicrometers: 600,
      centerOffsetFromSiteCenterMicrometers:
        {
          x: 0,
          y: 0
        },
      evidence: evidence("test:aperture")
    },
    ...overrides
  });

const opticalStackAbsent =
  (): SensorOpticalStackProfile => ({
    schemaVersion: "0.1.0",
    profileId: "stack-absent",
    evidence: evidence("test:stack"),
    effectiveAntiAliasingSpatialResponse: {
      kind: "absent",
      evidence: evidence("test:no-aa")
    }
  });

const opticalStackSplit =
  (): SensorOpticalStackProfile => ({
    schemaVersion: "0.1.0",
    profileId: "stack-split",
    evidence: evidence("test:stack-split"),
    effectiveAntiAliasingSpatialResponse: {
      kind:
        "normalized-point-splitting-kernel",
      evidence: evidence("test:aa"),
      coordinateSystem:
        "native-sensor-physical",
      scope:
        "field-wavelength-polarization-invariant-approximation",
      components: [
        {
          offsetMicrometers: {
            x: 200,
            y: 0
          },
          normalizedWeight: 0.75
        },
        {
          offsetMicrometers: {
            x: -100,
            y: 100
          },
          normalizedWeight: 0.25
        }
      ]
    }
  });

function calculate(
  options: {
    opticalStackProfile?: SensorOpticalStackProfile;
    site?: { x: number; y: number };
    spatialSampleCountX?: number;
    spatialSampleCountY?: number;
    samplingApertureProfile?: SensorSamplingApertureProfile;
  } = {}
) {
  return calculateSensorSpatialSamplingQuadrature({
    imagingArea,
    nativeRaster,
    colorSamplingProfile: colorProfile(),
    colorSamplingBindingProfile:
      bindingProfile(),
    samplingApertureProfile:
      options.samplingApertureProfile ??
      samplingProfile(),
    opticalStackProfile:
      options.opticalStackProfile ??
      opticalStackAbsent(),
    site: options.site ?? { x: 1, y: 0 },
    spatialSampleCountX:
      options.spatialSampleCountX ?? 1,
    spatialSampleCountY:
      options.spatialSampleCountY ?? 1
  });
}

describe("sensor spatial sampling quadrature", () => {
  it("uses the aperture center for one midpoint sample when AA is absent", () => {
    const result = calculate();

    expect(result.provenance.kind).toBe(
      "approximation"
    );
    expect(
      result.value.quadratureScheme
    ).toBe(
      "tensor-product-uniform-midpoint"
    );
    expect(result.value.totalNodeCount).toBe(1);

    const node = result.value.nodes[0];
    expect(node).toBeDefined();
    expect(
      node?.destinationAperturePointMm.x
    ).toBeCloseTo(-0.5, 12);
    expect(
      node?.destinationAperturePointMm.y
    ).toBeCloseTo(-0.5, 12);
    expect(
      node?.preAntiAliasingSourcePointMm.x
    ).toBeCloseTo(-0.5, 12);
    expect(
      node?.preAntiAliasingSourcePointMm.y
    ).toBeCloseTo(-0.5, 12);
    expect(
      node?.combinedNormalizedSpatialWeight
    ).toBe(1);
    expect(
      node?.combinedAreaMeasureSquareMicrometers
    ).toBe(480_000);
  });

  it("builds deterministic tensor-product midpoint nodes over the aperture", () => {
    const result = calculate({
      spatialSampleCountX: 2,
      spatialSampleCountY: 2
    });

    expect(result.value.totalNodeCount).toBe(4);
    const points = result.value.nodes.map(
      (node) => node.destinationAperturePointMm
    );
    const expected = [
      { x: -0.7, y: -0.65 },
      { x: -0.3, y: -0.65 },
      { x: -0.7, y: -0.35 },
      { x: -0.3, y: -0.35 }
    ];
    expect(points).toHaveLength(expected.length);
    points.forEach((point, index) => {
      const target = expected[index];
      expect(target).toBeDefined();
      expect(point.x).toBeCloseTo(
        target?.x ?? 0,
        12
      );
      expect(point.y).toBeCloseTo(
        target?.y ?? 0,
        12
      );
    });
    expect(
      result.value.normalizedSpatialWeightSum
    ).toBeCloseTo(1, 12);
    expect(
      result.value
        .combinedAreaMeasureSumSquareMicrometers
    ).toBeCloseTo(480_000, 8);
  });

  it("inverse-samples a positive AA displacement using source = destination - offset", () => {
    const result = calculate({
      opticalStackProfile:
        opticalStackSplit()
    });

    expect(result.value.totalNodeCount).toBe(2);

    const first = result.value.nodes[0];
    expect(first).toBeDefined();
    expect(
      first?.antiAliasingOffsetMicrometers
    ).toEqual({
      x: 200,
      y: 0
    });
    expect(
      first?.destinationAperturePointMm.x
    ).toBeCloseTo(-0.5, 12);
    expect(
      first?.preAntiAliasingSourcePointMm.x
    ).toBeCloseTo(-0.7, 12);
    expect(
      first?.preAntiAliasingSourcePointMm.y
    ).toBeCloseTo(-0.5, 12);

    const second = result.value.nodes[1];
    expect(second).toBeDefined();
    expect(
      second?.antiAliasingOffsetMicrometers
    ).toEqual({
      x: -100,
      y: 100
    });
    expect(
      second?.preAntiAliasingSourcePointMm.x
    ).toBeCloseTo(-0.4, 12);
    expect(
      second?.preAntiAliasingSourcePointMm.y
    ).toBeCloseTo(-0.6, 12);
  });

  it("multiplies AA and aperture-average weights while preserving geometric area measure", () => {
    const result = calculate({
      opticalStackProfile:
        opticalStackSplit(),
      spatialSampleCountX: 2,
      spatialSampleCountY: 2
    });

    expect(result.value.totalNodeCount).toBe(8);

    const firstComponentNodes =
      result.value.nodes.filter(
        (node) =>
          node.antiAliasingComponentIndex ===
          0
      );
    const secondComponentNodes =
      result.value.nodes.filter(
        (node) =>
          node.antiAliasingComponentIndex ===
          1
      );

    expect(firstComponentNodes).toHaveLength(4);
    expect(secondComponentNodes).toHaveLength(4);
    expect(
      firstComponentNodes[0]
        ?.normalizedApertureWeight
    ).toBe(0.25);
    expect(
      firstComponentNodes[0]
        ?.normalizedAntiAliasingWeight
    ).toBe(0.75);
    expect(
      firstComponentNodes[0]
        ?.combinedNormalizedSpatialWeight
    ).toBeCloseTo(0.1875, 12);
    expect(
      secondComponentNodes[0]
        ?.combinedNormalizedSpatialWeight
    ).toBeCloseTo(0.0625, 12);

    expect(
      result.value.normalizedSpatialWeightSum
    ).toBeCloseTo(1, 12);
    expect(
      result.value
        .combinedAreaMeasureSumSquareMicrometers
    ).toBeCloseTo(
      result.value
        .geometricApertureAreaSquareMicrometers,
      8
    );
  });

  it("keeps the destination CFA channel for all AA-shifted source nodes", () => {
    const result = calculate({
      opticalStackProfile:
        opticalStackSplit(),
      site: { x: 1, y: 0 }
    });

    expect(result.value.channelId).toBe(
      "green"
    );
    expect(
      result.value
        .destinationCfaChannelAppliesToAllNodes
    ).toBe(true);
    expect(
      result.value
        .cfaReassignmentBySourceCoordinate
    ).toBe(false);
    expect(
      new Set(
        result.value.nodes.map(
          () => result.value.channelId
        )
      )
    ).toEqual(new Set(["green"]));
  });

  it("retains off-imaging-area pre-AA source support without dropping or renormalizing nodes", () => {
    const edgeStack:
      SensorOpticalStackProfile = {
      schemaVersion: "0.1.0",
      profileId: "edge-stack",
      evidence: evidence("test:edge-stack"),
      effectiveAntiAliasingSpatialResponse: {
        kind:
          "normalized-point-splitting-kernel",
        evidence: evidence("test:edge-aa"),
        coordinateSystem:
          "native-sensor-physical",
        scope:
          "field-wavelength-polarization-invariant-approximation",
        components: [
          {
            offsetMicrometers: {
              x: 1200,
              y: 0
            },
            normalizedWeight: 1
          }
        ]
      }
    };

    const result = calculate({
      opticalStackProfile: edgeStack,
      site: { x: 0, y: 0 },
      spatialSampleCountX: 2,
      spatialSampleCountY: 1
    });

    expect(result.value.totalNodeCount).toBe(2);
    expect(
      result.value
        .preAntiAliasingSourceOutsideImagingAreaNodeCount
    ).toBe(2);
    expect(
      result.value.nodes.every(
        (node) =>
          !node
            .preAntiAliasingSourceInsideImagingArea
      )
    ).toBe(true);
    expect(
      result.value.normalizedSpatialWeightSum
    ).toBeCloseTo(1, 12);
    expect(
      result.value.sourceCoveragePolicy
    ).toBe("not-applied");
  });

  it("does not report radiance, photons, RAW values or temporal integration", () => {
    const result = calculate();

    expect(result.value.radianceIncluded).toBe(
      false
    );
    expect(result.value.photonsIncluded).toBe(
      false
    );
    expect(result.value.electronsIncluded).toBe(
      false
    );
    expect(
      result.value.spectralResponseIncluded
    ).toBe(false);
    expect(
      result.value.quantumEfficiencyIncluded
    ).toBe(false);
    expect(
      result.value.opticalThroughputIncluded
    ).toBe(false);
    expect(
      result.value.microlensResponseIncluded
    ).toBe(false);
    expect(
      result.value.temporalIntegrationIncluded
    ).toBe(false);
    expect(
      result.value.rawSampleValueIncluded
    ).toBe(false);
    expect(
      result.value
        .reconstructedPixelValueIncluded
    ).toBe(false);
    expect(
      result.value
        .geometricAreaMeasureIsRadiometricCollectionArea
    ).toBe(false);
  });

  it("fails closed when AA response is unknown", () => {
    const unknown:
      SensorOpticalStackProfile = {
      schemaVersion: "0.1.0",
      profileId: "unknown-aa",
      evidence: evidence("test:unknown"),
      orderedComponents: [
        {
          componentId: "cover",
          roles: ["cover-glass"],
          evidence: evidence("test:cover")
        }
      ]
    };

    expect(() =>
      calculate({
        opticalStackProfile: unknown
      })
    ).toThrow("unknown/unasserted");
  });

  it("fails closed when AA is known present but spatially unresolved", () => {
    const unresolved:
      SensorOpticalStackProfile = {
      schemaVersion: "0.1.0",
      profileId: "unresolved-aa",
      evidence: evidence(
        "test:unresolved-aa"
      ),
      effectiveAntiAliasingSpatialResponse: {
        kind: "present-unresolved",
        evidence: evidence(
          "test:unresolved-response"
        )
      }
    };

    expect(() =>
      calculate({
        opticalStackProfile: unresolved
      })
    ).toThrow("present but unresolved");
  });

  it("fails closed when geometric aperture is unresolved", () => {
    const unresolvedAperture:
      SensorSamplingApertureProfile = {
      ...samplingProfile(),
      geometricSensitiveAperture: {
        kind: "unresolved",
        evidence: evidence(
          "test:unresolved-aperture"
        )
      }
    };

    expect(() =>
      calculate({
        samplingApertureProfile:
          unresolvedAperture
      })
    ).toThrow("aperture is unresolved");
  });

  it("enforces the per-site allocation safety limit", () => {
    expect(() =>
      calculate({
        spatialSampleCountX: 317,
        spatialSampleCountY: 317
      })
    ).toThrow("safety limit");
  });

  it("is deterministic for identical inputs", () => {
    const first = calculate({
      opticalStackProfile:
        opticalStackSplit(),
      spatialSampleCountX: 3,
      spatialSampleCountY: 2
    });
    const second = calculate({
      opticalStackProfile:
        opticalStackSplit(),
      spatialSampleCountX: 3,
      spatialSampleCountY: 2
    });

    expect(first).toEqual(second);
  });

  it("keeps spatial quadrature in invariant native sensor coordinates", () => {
    const result = calculate({
      spatialSampleCountX: 2,
      spatialSampleCountY: 2
    });

    expect(result.value.coordinateSystem).toBe(
      "native-sensor-physical"
    );
    expect(
      "orientation" in
        (result.value as unknown as Record<
          string,
          unknown
        >)
    ).toBe(false);
  });
});
