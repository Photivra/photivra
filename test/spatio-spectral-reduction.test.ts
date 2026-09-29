import { describe, expect, it } from "vitest";

import {
  calculateSensorSpectralQuadrature,
  reduceSensorSpatioSpectralIrradiance,
  type SensorColorSamplingProfile,
  type SensorSpectralResponseProfile,
  type SensorSpatioSpectralIrradianceSample
} from "../src/index.js";
import {
  makeQuadrature,
  splitStack
} from "./helpers/spatial-sample-fixture.js";

const evidence = (sourceReference: string) =>
  [{
    sourceOrigin: "photivra" as const,
    sourceReference,
    reuseStatus: "photivra-owned" as const
  }] as const;

const spectralProfile =
(): SensorSpectralResponseProfile => ({
  schemaVersion: "0.1.0",
  profileId: "spectral",
  colorSamplingProfileId: "bayer-like",
  evidence: evidence("test:spectral"),
  channels: [{
    channelId: "green",
    kind:
      "effective-external-quantum-efficiency",
    responseScope:
      "site-incident-effective-channel-response",
    scientificStatus: "approximation",
    uncertainty: {
      kind: "not-quantified",
      limitation: "test only"
    },
    evidence: evidence("test:green"),
    conditionDependence: "not-modeled",
    externalQuantumEfficiency: {
      wavelengthUnit: "nm",
      wavelengthBasis: "air",
      interpolation: "piecewise-linear",
      outsideRangeBehavior: "fail-closed",
      evidence: evidence("test:curve"),
      samples: [
        {
          wavelengthNanometers: 400,
          value: 0.2
        },
        {
          wavelengthNanometers: 500,
          value: 0.4
        },
        {
          wavelengthNanometers: 700,
          value: 0.1
        }
      ]
    }
  }]
});

const colorProfile =
(): SensorColorSamplingProfile => ({
  schemaVersion: "0.1.0" as const,
  profileId: "bayer-like",
  evidence: evidence("test:color"),
  coordinateSystem:
    "native-sensor-color-sampling-site-index" as const,
  layout: {
    kind: "periodic-mosaic" as const,
    repeatWidthSites: 2,
    repeatHeightSites: 2,
    siteChannelIds: [
      "red",
      "green",
      "green",
      "blue"
    ],
    anchor:
      "native-sensor-top-left-site" as const
  }
});

function spectralPlan(
  maximumSubintervalWidthNanometers = 50,
  range = {
    minimum: 400,
    maximum: 500
  }
): ReturnType<
  typeof calculateSensorSpectralQuadrature
> {
  return calculateSensorSpectralQuadrature({
    colorSamplingProfile: colorProfile(),
    spectralResponseProfile:
      spectralProfile(),
    channelId: "green",
    wavelengthBasis: "air",
    wavelengthRangeNanometers: range,
    maximumSubintervalWidthNanometers
  });
}

function samplesFor(
  spatial: ReturnType<typeof makeQuadrature>["value"],
  spectral:
    ReturnType<typeof spectralPlan>["value"],
  fn: (
    spatialIndex: number,
    spectralIndex: number
  ) => number
): SensorSpatioSpectralIrradianceSample[] {
  const samples:
    SensorSpatioSpectralIrradianceSample[] =
      [];

  spectral.nodes.forEach(
    (spectralNode, spectralIndex) => {
      spatial.nodes.forEach(
        (spatialNode, spatialIndex) => {
          samples.push({
            node: {
              spatialNode: {
                antiAliasingComponentIndex:
                  spatialNode
                    .antiAliasingComponentIndex,
                apertureSampleXIndex:
                  spatialNode
                    .apertureSampleXIndex,
                apertureSampleYIndex:
                  spatialNode
                    .apertureSampleYIndex
              },
              spectralSampleIndex:
                spectralNode
                  .spectralSampleIndex,
              wavelengthNanometers:
                spectralNode
                  .wavelengthNanometers
            },
            spectralIrradianceWattsPerSquareMeterPerNanometer:
              fn(
                spatialIndex,
                spectralIndex
              )
          });
        }
      );
    }
  );

  return samples;
}

describe(
  "sensor spatio-spectral irradiance reduction",
  () => {
    it("preserves exact color-profile linkage in spatial quadrature", () => {
      const spatial =
        makeQuadrature().value;

      expect(
        spatial.colorSamplingProfileId
      ).toBe("bayer-like");
    });

    it("integrates a constant spectral irradiance field with explicit per-nanometre units", () => {
      const spatial =
        makeQuadrature().value;
      const spectral =
        spectralPlan().value;
      const result =
        reduceSensorSpatioSpectralIrradiance({
          spatialQuadrature: spatial,
          spectralQuadrature:
            spectral,
          sampleValues: samplesFor(
            spatial,
            spectral,
            () => 10
          )
        });

      expect(
        result.value.spatialNodeCount
      ).toBe(1);
      expect(
        result.value.spectralNodeCount
      ).toBe(2);
      expect(
        result.value.combinedSampleCount
      ).toBe(2);
      expect(
        result.value.perWavelength.map(
          (entry) =>
            entry
              .normalizedSpatialAverageSpectralIrradianceWattsPerSquareMeterPerNanometer
        )
      ).toEqual([10, 10]);
      expect(
        result.value.perWavelength.map(
          (entry) =>
            entry
              .geometricApertureIncidentSpectralFluxWattsPerNanometer
        )
      ).toEqual([
        10 * 480_000 * 1e-12,
        10 * 480_000 * 1e-12
      ]);
      expect(
        result.value
          .wavelengthIntegratedSpatialAverageIrradianceWattsPerSquareMeter
      ).toBeCloseTo(1_000, 12);
      expect(
        result.value
          .wavelengthIntegratedGeometricApertureIncidentFluxWatts
      ).toBeCloseTo(
        1_000 *
          480_000 *
          1e-12,
        15
      );
    });

    it("composes AA spatial weights with wavelength measure without applying sensor response", () => {
      const spatial =
        makeQuadrature(
          splitStack()
        ).value;
      const spectral =
        spectralPlan().value;

      const result =
        reduceSensorSpatioSpectralIrradiance({
          spatialQuadrature: spatial,
          spectralQuadrature:
            spectral,
          sampleValues: samplesFor(
            spatial,
            spectral,
            (
              spatialIndex,
              spectralIndex
            ) => {
              if (spectralIndex === 0) {
                return spatialIndex ===
                  0
                  ? 2
                  : 6;
              }
              return spatialIndex === 0
                ? 4
                : 8;
            }
          )
        }).value;

      expect(
        result.perWavelength[0]
          ?.normalizedSpatialAverageSpectralIrradianceWattsPerSquareMeterPerNanometer
      ).toBeCloseTo(3, 12);
      expect(
        result.perWavelength[1]
          ?.normalizedSpatialAverageSpectralIrradianceWattsPerSquareMeterPerNanometer
      ).toBeCloseTo(5, 12);
      expect(
        result.perWavelength[0]
          ?.geometricApertureIncidentSpectralFluxWattsPerNanometer
      ).toBeCloseTo(
        3 * 480_000 * 1e-12,
        15
      );
      expect(
        result.wavelengthIntegratedSpatialAverageIrradianceWattsPerSquareMeter
      ).toBeCloseTo(400, 12);
      expect(
        result.wavelengthIntegratedGeometricApertureIncidentFluxWatts
      ).toBeCloseTo(
        400 *
          480_000 *
          1e-12,
        15
      );

      expect(
        result.spectralResponseApplicationPerformed
      ).toBe(false);
      expect(
        result.quantumEfficiencyApplied
      ).toBe(false);
      expect(
        result.responseScopeMatchedToSourcePlane
      ).toBe(false);
      expect(
        result.temporalIntegrationApplied
      ).toBe(false);
      expect(
        result.photonsCalculated
      ).toBe(false);
      expect(
        result.electronsCalculated
      ).toBe(false);
      expect(
        result.currentCalculated
      ).toBe(false);
    });

    it("matches samples by explicit identity rather than array order", () => {
      const spatial =
        makeQuadrature(
          splitStack()
        ).value;
      const spectral =
        spectralPlan().value;
      const samples =
        samplesFor(
          spatial,
          spectral,
          (
            spatialIndex,
            spectralIndex
          ) =>
            1 +
            spatialIndex +
            spectralIndex
        );

      const forward =
        reduceSensorSpatioSpectralIrradiance({
          spatialQuadrature: spatial,
          spectralQuadrature:
            spectral,
          sampleValues: samples
        });
      const reversed =
        reduceSensorSpatioSpectralIrradiance({
          spatialQuadrature: spatial,
          spectralQuadrature:
            spectral,
          sampleValues: [
            ...samples
          ].reverse()
        });

      expect(reversed).toEqual(forward);
    });

    it("fails closed when spatial and spectral plans are not exactly linked", () => {
      const spatial =
        makeQuadrature().value;
      const spectral =
        spectralPlan().value;
      const samples =
        samplesFor(
          spatial,
          spectral,
          () => 1
        );

      expect(() =>
        reduceSensorSpatioSpectralIrradiance({
          spatialQuadrature: {
            ...spatial,
            colorSamplingProfileId:
              "other-color"
          },
          spectralQuadrature:
            spectral,
          sampleValues: samples
        })
      ).toThrow(
        "same colorSamplingProfileId"
      );

      expect(() =>
        reduceSensorSpatioSpectralIrradiance({
          spatialQuadrature: {
            ...spatial,
            channelId: "red"
          },
          spectralQuadrature:
            spectral,
          sampleValues: samples
        })
      ).toThrow(
        "same exact channelId"
      );
    });

    it("rejects incomplete, duplicate, unknown, mismatched-wavelength, and negative samples", () => {
      const spatial =
        makeQuadrature().value;
      const spectral =
        spectralPlan().value;
      const samples =
        samplesFor(
          spatial,
          spectral,
          () => 1
        );

      expect(() =>
        reduceSensorSpatioSpectralIrradiance({
          spatialQuadrature: spatial,
          spectralQuadrature:
            spectral,
          sampleValues:
            samples.slice(1)
        })
      ).toThrow(
        "exactly one value"
      );

      expect(() =>
        reduceSensorSpatioSpectralIrradiance({
          spatialQuadrature: spatial,
          spectralQuadrature:
            spectral,
          sampleValues: [
            samples[0]!,
            samples[0]!
          ]
        })
      ).toThrow("duplicate");

      expect(() =>
        reduceSensorSpatioSpectralIrradiance({
          spatialQuadrature: spatial,
          spectralQuadrature:
            spectral,
          sampleValues: [
            {
              ...samples[0]!,
              node: {
                ...samples[0]!.node,
                spectralSampleIndex:
                  99
              }
            },
            samples[1]!
          ]
        })
      ).toThrow(
        "spectral node"
      );

      expect(() =>
        reduceSensorSpatioSpectralIrradiance({
          spatialQuadrature: spatial,
          spectralQuadrature:
            spectral,
          sampleValues: [
            {
              ...samples[0]!,
              node: {
                ...samples[0]!.node,
                wavelengthNanometers:
                  451
              }
            },
            samples[1]!
          ]
        })
      ).toThrow(
        "wavelengthNanometers"
      );

      expect(() =>
        reduceSensorSpatioSpectralIrradiance({
          spatialQuadrature: spatial,
          spectralQuadrature:
            spectral,
          sampleValues: [
            {
              ...samples[0]!,
              spectralIrradianceWattsPerSquareMeterPerNanometer:
                -1
            },
            samples[1]!
          ]
        })
      ).toThrow(
        "greater than or equal to zero"
      );
    });

    it("rejects malformed spectral quadrature instead of trusting typed input", () => {
      const spatial =
        makeQuadrature().value;
      const spectral =
        spectralPlan().value;
      const samples =
        samplesFor(
          spatial,
          spectral,
          () => 1
        );

      expect(() =>
        reduceSensorSpatioSpectralIrradiance({
          spatialQuadrature: spatial,
          spectralQuadrature: {
            ...spectral,
            wavelengthMeasureSumNanometers:
              99
          },
          sampleValues: samples
        })
      ).toThrow(
        "aggregate wavelength measures"
      );
    });

    it("rejects malformed spectral partition structure before composition", () => {
      const spatial =
        makeQuadrature().value;
      const spectral =
        spectralPlan().value;
      const samples =
        samplesFor(
          spatial,
          spectral,
          () => 1
        );

      expect(() =>
        reduceSensorSpatioSpectralIrradiance({
          spatialQuadrature: spatial,
          spectralQuadrature: {
            ...spectral,
            maximumSubintervalWidthNanometers:
              25
          },
          sampleValues: samples
        })
      ).toThrow(
        "node width exceeds"
      );

      expect(() =>
        reduceSensorSpatioSpectralIrradiance({
          spatialQuadrature: spatial,
          spectralQuadrature: {
            ...spectral,
            segmentBoundariesNanometers:
              [400, 500, 450]
          },
          sampleValues: samples
        })
      ).toThrow(
        "strictly increasing"
      );

      expect(() =>
        reduceSensorSpatioSpectralIrradiance({
          spatialQuadrature: spatial,
          spectralQuadrature: {
            ...spectral,
            segmentCount: 2
          },
          sampleValues: samples
        })
      ).toThrow(
        "match the boundary count"
      );

      expect(() =>
        reduceSensorSpatioSpectralIrradiance({
          spatialQuadrature: spatial,
          spectralQuadrature: {
            ...spectral,
            nodes: spectral.nodes.map(
              (node, index) =>
                index === 1
                  ? {
                      ...node,
                      spectralSampleIndex:
                        0
                    }
                  : node
            )
          },
          sampleValues: samples
        })
      ).toThrow(
        "duplicate spectralSampleIndex"
      );
    });

    it("caps the Cartesian product independently of individual quadrature caps", () => {
      const spatial =
        makeQuadrature(
          undefined,
          400,
          1
        ).value;
      const spectral =
        spectralPlan(
          1,
          {
            minimum: 400,
            maximum: 700
          }
        ).value;

      expect(
        spatial.totalNodeCount
      ).toBe(400);
      expect(
        spectral.totalNodeCount
      ).toBe(300);

      expect(() =>
        reduceSensorSpatioSpectralIrradiance({
          spatialQuadrature: spatial,
          spectralQuadrature:
            spectral,
          sampleValues: []
        })
      ).toThrow(
        "exceeds the safety limit"
      );
    });

    it("requires explicit spatial profile identity for the new composition boundary", () => {
      const spatial =
        makeQuadrature().value;
      const spectral =
        spectralPlan().value;
      const samples =
        samplesFor(
          spatial,
          spectral,
          () => 1
        );
      const withoutIdentity = {
        ...spatial
      };
      delete withoutIdentity
        .colorSamplingProfileId;

      expect(() =>
        reduceSensorSpatioSpectralIrradiance({
          spatialQuadrature:
            withoutIdentity,
          spectralQuadrature:
            spectral,
          sampleValues: samples
        })
      ).toThrow(
        "colorSamplingProfileId is required"
      );
    });

    it("rejects malformed and unknown spatial sample identities", () => {
      const spatial =
        makeQuadrature().value;
      const spectral =
        spectralPlan().value;
      const samples =
        samplesFor(
          spatial,
          spectral,
          () => 1
        );

      expect(() =>
        reduceSensorSpatioSpectralIrradiance({
          spatialQuadrature: spatial,
          spectralQuadrature:
            spectral,
          sampleValues: [
            null as never,
            samples[1]!
          ]
        })
      ).toThrow(
        "complete spatio-spectral node identity"
      );

      expect(() =>
        reduceSensorSpatioSpectralIrradiance({
          spatialQuadrature: spatial,
          spectralQuadrature:
            spectral,
          sampleValues: [
            {
              ...samples[0]!,
              node: {
                ...samples[0]!.node,
                spatialNode: {
                  ...samples[0]!.node
                    .spatialNode,
                  apertureSampleXIndex:
                    99
                }
              }
            },
            samples[1]!
          ]
        })
      ).toThrow(
        "spatial node"
      );
    });

    it("rejects mutated spectral-plan identity and semantics", () => {
      const spatial =
        makeQuadrature().value;
      const spectral =
        spectralPlan().value;
      const samples =
        samplesFor(
          spatial,
          spectral,
          () => 1
        );

      expect(() =>
        reduceSensorSpatioSpectralIrradiance({
          spatialQuadrature: spatial,
          spectralQuadrature: {
            ...spectral,
            nodes:
              spectral.nodes.map(
                (node, index) =>
                  index === 0
                    ? {
                        ...node,
                        spectralSampleIndex:
                          2
                      }
                    : node
              )
          },
          sampleValues: samples
        })
      ).toThrow(
        "contiguous range"
      );

      expect(() =>
        reduceSensorSpatioSpectralIrradiance({
          spatialQuadrature: spatial,
          spectralQuadrature: {
            ...spectral,
            responseApplicationPerformed:
              true
          } as unknown as typeof spectral,
          sampleValues: samples
        })
      ).toThrow(
        "incompatible with pre-response"
      );
    });

    it("avoids premature overflow when converting geometric area units", () => {
      const spatial =
        makeQuadrature().value;
      const spectral =
        spectralPlan(
          100,
          {
            minimum: 400,
            maximum: 500
          }
        ).value;
      const value = 1e300;

      const result =
        reduceSensorSpatioSpectralIrradiance({
          spatialQuadrature: spatial,
          spectralQuadrature:
            spectral,
          sampleValues: samplesFor(
            spatial,
            spectral,
            () => value
          )
        }).value;

      const expectedSpectralFlux =
        value *
        (
          480_000 *
          1e-12
        );
      const actualSpectralFlux =
        result.perWavelength[0]
          ?.geometricApertureIncidentSpectralFluxWattsPerNanometer;
      expect(
        (actualSpectralFlux ?? 0) /
          expectedSpectralFlux
      ).toBeCloseTo(1, 12);
      expect(
        Number.isFinite(
          result
            .wavelengthIntegratedGeometricApertureIncidentFluxWatts
        )
      ).toBe(true);
    });

    it("fails closed when wavelength integration overflows", () => {
      const spatial =
        makeQuadrature().value;
      const spectral =
        spectralPlan(
          100,
          {
            minimum: 400,
            maximum: 500
          }
        ).value;

      expect(() =>
        reduceSensorSpatioSpectralIrradiance({
          spatialQuadrature: spatial,
          spectralQuadrature:
            spectral,
          sampleValues: samplesFor(
            spatial,
            spectral,
            () => 1e307
          )
        })
      ).toThrow(
        "Wavelength-integrated"
      );
    });

    it("labels geometric area, response, temporal, and convergence boundaries explicitly", () => {
      const spatial =
        makeQuadrature().value;
      const spectral =
        spectralPlan().value;
      const result =
        reduceSensorSpatioSpectralIrradiance({
          spatialQuadrature: spatial,
          spectralQuadrature:
            spectral,
          sampleValues: samplesFor(
            spatial,
            spectral,
            () => 1
          )
        });

      expect(
        result.provenance.kind
      ).toBe("approximation");
      expect(
        result.value.inputValueDomain
      ).toEqual({
        kind:
          "radiometric-spectral-irradiance",
        unit: "W/m^2/nm",
        semantic:
          "pre-aa-pre-response-sensor-plane-spectral-irradiance"
      });
      expect(
        result.value
          .radiometricCollectionAreaEstablished
      ).toBe(false);
      expect(
        result.value
          .spectralResponsePlanUsedForWavelengthSupport
      ).toBe(true);
      expect(
        result.value
          .spectralResponseApplicationPerformed
      ).toBe(false);
      expect(
        result.value
          .convergenceErrorEstimated
      ).toBe(false);

      const assumptions =
        result.provenance.assumptions ??
        [];
      for (const expected of [
        "W/m^2/nm",
        "matching channel label alone",
        "100,000",
        "No extra 1e-9",
        "not promoted",
        "not applied"
      ]) {
        expect(
          assumptions.some(
            (entry) =>
              entry.includes(expected)
          )
        ).toBe(true);
      }
    });
  }
);
