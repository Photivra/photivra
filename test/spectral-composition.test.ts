import { describe, expect, it } from "vitest";

import {
  composeSpectralCoverage,
  distributeIntegratedQuantityAcrossDiscreteSpectralLines,
  integrateDiscreteSpectralLineMeasure,
  parseNormalizedDiscreteSpectralLineDistribution,
  parseSpectralCoverageParticipant
} from "../src/index.js";

const participant = (
  participantId: string,
  role:
    | "illumination-source"
    | "scene-radiance"
    | "material-response"
    | "optical-transmission"
    | "sensor-response"
    | "other",
  minimum: number,
  maximum: number,
  breakpointsNanometers:
    readonly number[],
  wavelengthBasis:
    "air" | "vacuum" = "vacuum"
): Record<string, unknown> => ({
  participantId,
  role,
  wavelengthBasis,
  wavelengthRangeNanometers: {
    minimum,
    maximum
  },
  breakpointsNanometers
});

const lineDistribution =
  (): Record<string, unknown> => ({
    wavelengthBasis: "vacuum",
    lineModel: "delta-like-integrated",
    normalization:
      "sum-normalized-integrated-weight-to-one",
    lines: [
      {
        lineId: "blue",
        wavelengthNanometers: 450,
        normalizedIntegratedWeight:
          0.25
      },
      {
        lineId: "red",
        wavelengthNanometers: 650,
        normalizedIntegratedWeight:
          0.75
      }
    ]
  });

describe("shared continuous spectral composition", () => {
  it("intersects support and unions breakpoints across scene, optics, and sensor roles", () => {
    const result =
      composeSpectralCoverage({
        participants: [
          parseSpectralCoverageParticipant(
            participant(
              "scene",
              "scene-radiance",
              400,
              700,
              [500]
            )
          ),
          parseSpectralCoverageParticipant(
            participant(
              "optics",
              "optical-transmission",
              450,
              680,
              [550]
            )
          ),
          parseSpectralCoverageParticipant(
            participant(
              "sensor",
              "sensor-response",
              420,
              650,
              [600]
            )
          )
        ]
      });

    expect(
      result.commonWavelengthRangeNanometers
    ).toEqual({
      minimum: 450,
      maximum: 650
    });
    expect(
      result.segmentBoundariesNanometers
    ).toEqual([
      450,
      500,
      550,
      600,
      650
    ]);
    expect(result.wavelengthBasis).toBe(
      "vacuum"
    );
    expect(
      result.continuousCoverageIntersectionEstablished
    ).toBe(true);
    expect(
      result.breakpointUnionEstablished
    ).toBe(true);
    expect(
      result.responseValuesApplied
    ).toBe(false);
    expect(
      result.spectralDensityIntegrated
    ).toBe(false);
    expect(
      result.discreteLinesIncluded
    ).toBe(false);
    expect(
      result.airVacuumConversionPerformed
    ).toBe(false);
  });

  it("drops participant breakpoints outside the common overlap without changing participant support", () => {
    const result =
      composeSpectralCoverage({
        participants: [
          parseSpectralCoverageParticipant(
            participant(
              "wide",
              "scene-radiance",
              400,
              700,
              [425, 500, 675]
            )
          ),
          parseSpectralCoverageParticipant(
            participant(
              "narrow",
              "sensor-response",
              450,
              650,
              [550]
            )
          )
        ]
      });

    expect(
      result.segmentBoundariesNanometers
    ).toEqual([
      450,
      500,
      550,
      650
    ]);
  });

  it("fails closed on wavelength-basis mismatch, duplicate identity, or empty overlap", () => {
    expect(() =>
      composeSpectralCoverage({
        participants: [
          parseSpectralCoverageParticipant(
            participant(
              "air",
              "scene-radiance",
              400,
              700,
              [],
              "air"
            )
          ),
          parseSpectralCoverageParticipant(
            participant(
              "vacuum",
              "sensor-response",
              400,
              700,
              [],
              "vacuum"
            )
          )
        ]
      })
    ).toThrow(
      "same resolved wavelengthBasis"
    );

    expect(() =>
      composeSpectralCoverage({
        participants: [
          parseSpectralCoverageParticipant(
            participant(
              "same",
              "scene-radiance",
              400,
              500,
              []
            )
          ),
          parseSpectralCoverageParticipant(
            participant(
              "same",
              "sensor-response",
              450,
              550,
              []
            )
          )
        ]
      })
    ).toThrow(
      "participantId must not contain duplicates"
    );

    expect(() =>
      composeSpectralCoverage({
        participants: [
          parseSpectralCoverageParticipant(
            participant(
              "left",
              "scene-radiance",
              400,
              500,
              []
            )
          ),
          parseSpectralCoverageParticipant(
            participant(
              "right",
              "sensor-response",
              500,
              700,
              []
            )
          )
        ]
      })
    ).toThrow(
      "do not share a non-empty wavelength interval"
    );
  });

  it("validates continuous participant breakpoints and resolved basis", () => {
    expect(() =>
      parseSpectralCoverageParticipant(
        participant(
          "bad",
          "optical-transmission",
          400,
          700,
          [400]
        )
      )
    ).toThrow(
      "must lie strictly inside"
    );

    expect(() =>
      parseSpectralCoverageParticipant({
        ...participant(
          "bad-order",
          "other",
          400,
          700,
          []
        ),
        breakpointsNanometers: [
          600,
          500
        ]
      })
    ).toThrow(
      "must be strictly increasing"
    );

    expect(() =>
      parseSpectralCoverageParticipant({
        ...participant(
          "unresolved",
          "scene-radiance",
          400,
          700,
          []
        ),
        wavelengthBasis: "unspecified"
      })
    ).toThrow(
      "must be air or vacuum"
    );
  });
});

describe("discrete spectral line measure", () => {
  it("parses normalized integrated line weights", () => {
    const distribution =
      parseNormalizedDiscreteSpectralLineDistribution(
        lineDistribution()
      );

    expect(
      distribution.lineModel
    ).toBe("delta-like-integrated");
    expect(
      distribution.normalization
    ).toBe(
      "sum-normalized-integrated-weight-to-one"
    );
    expect(
      distribution.lines.map(
        (line) =>
          line.normalizedIntegratedWeight
      )
    ).toEqual([0.25, 0.75]);
  });

  it("distributes and integrates line quantities without multiplying by wavelength width", () => {
    const distribution =
      parseNormalizedDiscreteSpectralLineDistribution(
        lineDistribution()
      );
    const measure =
      distributeIntegratedQuantityAcrossDiscreteSpectralLines(
        {
          distribution,
          totalIntegratedQuantity: 8,
          quantityUnit: "W/sr"
        }
      );

    expect(
      measure.lines.map(
        (line) =>
          line.integratedQuantity
      )
    ).toEqual([2, 6]);
    expect(
      measure.continuousSpectralDensityAssumed
    ).toBe(false);
    expect(
      measure.wavelengthMeasureMultiplicationRequired
    ).toBe(false);

    expect(
      integrateDiscreteSpectralLineMeasure(
        measure
      )
    ).toEqual({
      wavelengthBasis: "vacuum",
      quantityUnit: "W/sr",
      integratedQuantity: 8,
      lineCount: 2,
      continuousQuadratureApplied: false,
      wavelengthMeasureMultiplicationApplied:
        false
    });
  });

  it("preserves an explicit zero integrated quantity", () => {
    const distribution =
      parseNormalizedDiscreteSpectralLineDistribution(
        lineDistribution()
      );
    const measure =
      distributeIntegratedQuantityAcrossDiscreteSpectralLines(
        {
          distribution,
          totalIntegratedQuantity: 0,
          quantityUnit: "relative"
        }
      );

    expect(
      measure.lines.every(
        (line) =>
          line.integratedQuantity === 0
      )
    ).toBe(true);
    expect(
      integrateDiscreteSpectralLineMeasure(
        measure
      ).integratedQuantity
    ).toBe(0);
  });

  it("rejects non-normalized, duplicate, unordered, and unresolved line distributions", () => {
    expect(() =>
      parseNormalizedDiscreteSpectralLineDistribution({
        ...lineDistribution(),
        lines: [
          {
            lineId: "a",
            wavelengthNanometers: 450,
            normalizedIntegratedWeight:
              0.2
          },
          {
            lineId: "b",
            wavelengthNanometers: 650,
            normalizedIntegratedWeight:
              0.2
          }
        ]
      })
    ).toThrow("must sum to 1");

    expect(() =>
      parseNormalizedDiscreteSpectralLineDistribution({
        ...lineDistribution(),
        lines: [
          {
            lineId: "same",
            wavelengthNanometers: 450,
            normalizedIntegratedWeight:
              0.5
          },
          {
            lineId: "same",
            wavelengthNanometers: 650,
            normalizedIntegratedWeight:
              0.5
          }
        ]
      })
    ).toThrow(
      "lineId must not contain duplicates"
    );

    expect(() =>
      parseNormalizedDiscreteSpectralLineDistribution({
        ...lineDistribution(),
        lines: [
          {
            lineId: "red",
            wavelengthNanometers: 650,
            normalizedIntegratedWeight:
              0.5
          },
          {
            lineId: "blue",
            wavelengthNanometers: 450,
            normalizedIntegratedWeight:
              0.5
          }
        ]
      })
    ).toThrow(
      "wavelengths must be strictly increasing"
    );

    expect(() =>
      parseNormalizedDiscreteSpectralLineDistribution({
        ...lineDistribution(),
        wavelengthBasis: "unspecified"
      })
    ).toThrow(
      "must be air or vacuum"
    );
  });

  it("rejects continuous-density semantics or invalid line quantities in the discrete integrator", () => {
    const distribution =
      parseNormalizedDiscreteSpectralLineDistribution(
        lineDistribution()
      );
    const measure =
      distributeIntegratedQuantityAcrossDiscreteSpectralLines(
        {
          distribution,
          totalIntegratedQuantity: 1,
          quantityUnit: "W/m^2/sr"
        }
      );

    expect(() =>
      integrateDiscreteSpectralLineMeasure({
        ...measure,
        continuousSpectralDensityAssumed:
          true as never
      })
    ).toThrow(
      "must not claim continuous-density"
    );

    expect(() =>
      integrateDiscreteSpectralLineMeasure({
        ...measure,
        lines: [
          {
            ...measure.lines[0]!,
            integratedQuantity: -1
          },
          measure.lines[1]!
        ]
      })
    ).toThrow(
      "greater than or equal to zero"
    );
  });
});

describe("discrete spectral line fail-closed measure validation", () => {
  it("rejects unordered and duplicate line identities at integration time", () => {
    const base = {
      wavelengthBasis: "vacuum" as const,
      quantityUnit: "relative" as const,
      lineModel: "delta-like-integrated" as const,
      continuousSpectralDensityAssumed: false as const,
      wavelengthMeasureMultiplicationRequired: false as const
    };

    expect(() =>
      integrateDiscreteSpectralLineMeasure({
        ...base,
        lines: [
          {
            lineId: "red",
            wavelengthNanometers: 650,
            integratedQuantity: 1
          },
          {
            lineId: "blue",
            wavelengthNanometers: 450,
            integratedQuantity: 1
          }
        ]
      })
    ).toThrow(
      "wavelengths must be strictly increasing"
    );

    expect(() =>
      integrateDiscreteSpectralLineMeasure({
        ...base,
        lines: [
          {
            lineId: "same",
            wavelengthNanometers: 450,
            integratedQuantity: 1
          },
          {
            lineId: "same",
            wavelengthNanometers: 650,
            integratedQuantity: 1
          }
        ]
      })
    ).toThrow(
      "lineId must not contain duplicates"
    );
  });

  it("fails closed when summing integrated line quantities overflows", () => {
    expect(() =>
      integrateDiscreteSpectralLineMeasure({
        wavelengthBasis: "vacuum",
        quantityUnit: "W/m^2",
        lineModel: "delta-like-integrated",
        continuousSpectralDensityAssumed: false,
        wavelengthMeasureMultiplicationRequired: false,
        lines: [
          {
            lineId: "a",
            wavelengthNanometers: 450,
            integratedQuantity:
              Number.MAX_VALUE
          },
          {
            lineId: "b",
            wavelengthNanometers: 650,
            integratedQuantity:
              Number.MAX_VALUE
          }
        ]
      })
    ).toThrow(
      "integrated quantity must remain finite"
    );
  });
});
