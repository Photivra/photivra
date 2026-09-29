import { describe, expect, it } from "vitest";

import {
  reduceSensorSpatialSamplingQuadrature,
  type CalculationResult,
  type SensorSpatialQuadratureNodeValue,
  type SensorSpatialSampleReduction,
  type SensorSpatialSamplingQuadrature
} from "../src/index.js";
import {
  makeQuadrature,
  splitStack,
  valuesFor
} from "./helpers/spatial-sample-fixture.js";

function reduceRelative(
  plan: SensorSpatialSamplingQuadrature,
  nodeValues: readonly SensorSpatialQuadratureNodeValue[]
): CalculationResult<SensorSpatialSampleReduction> {
  return reduceSensorSpatialSamplingQuadrature({
    quadrature: plan,
    valueDomain: {
      kind: "relative-linear",
      unit: "relative",
      semantic:
        "nonnegative-sensor-plane-irradiance-proxy"
    },
    nodeValues
  });
}

describe("sensor spatial sample reduction values", () => {
  it("preserves uniform relative and physical irradiance", () => {
    const plan = makeQuadrature(undefined, 2, 2).value;

    const relative = reduceRelative(
      plan,
      valuesFor(plan, () => 2)
    );
    if (relative.value.reducedValue.kind !== "relative-linear") {
      throw new Error("Expected relative result");
    }
    expect(
      relative.value.reducedValue.normalizedSpatialAverageRelative
    ).toBeCloseTo(2, 12);
    expect(
      relative.value.reducedValue
        .geometricAreaIntegralRelativeSquareMicrometers
    ).toBeCloseTo(960_000, 6);

    const physical =
      reduceSensorSpatialSamplingQuadrature({
        quadrature: plan,
        valueDomain: {
          kind: "radiometric-irradiance",
          unit: "W/m^2",
          semantic: "sensor-plane-irradiance"
        },
        nodeValues: valuesFor(plan, () => 100)
      });
    if (
      physical.value.reducedValue.kind !==
      "radiometric-irradiance"
    ) {
      throw new Error("Expected radiometric result");
    }
    expect(
      physical.value.reducedValue
        .normalizedSpatialAverageIrradianceWattsPerSquareMeter
    ).toBeCloseTo(100, 12);
    expect(
      physical.value.reducedValue
        .geometricApertureIncidentFluxWatts
    ).toBeCloseTo(4.8e-5, 14);
  });

  it("uses quadrature weights and node identity rather than array order", () => {
    const plan = makeQuadrature(splitStack()).value;
    const values: SensorSpatialQuadratureNodeValue[] = [
      {
        node: {
          antiAliasingComponentIndex: 0,
          apertureSampleXIndex: 0,
          apertureSampleYIndex: 0
        },
        value: 10
      },
      {
        node: {
          antiAliasingComponentIndex: 1,
          apertureSampleXIndex: 0,
          apertureSampleYIndex: 0
        },
        value: 2
      }
    ];

    const forward = reduceRelative(plan, values);
    const reversed = reduceRelative(
      plan,
      [...values].reverse()
    );

    expect(forward.value.reducedValue).toEqual(
      reversed.value.reducedValue
    );

    if (
      forward.value.reducedValue.kind !==
      "relative-linear"
    ) {
      throw new Error("Expected relative result");
    }
    expect(
      forward.value.reducedValue
        .normalizedSpatialAverageRelative
    ).toBeCloseTo(8, 12);
  });

  it("allows zero but rejects negative and non-finite source values", () => {
    const plan = makeQuadrature().value;

    const zero = reduceRelative(
      plan,
      valuesFor(plan, () => 0)
    );
    if (zero.value.reducedValue.kind !== "relative-linear") {
      throw new Error("Expected relative result");
    }
    expect(
      zero.value.reducedValue.normalizedSpatialAverageRelative
    ).toBe(0);

    for (const value of [
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY
    ]) {
      expect(() =>
        reduceRelative(
          plan,
          valuesFor(plan, () => value)
        )
      ).toThrow(
        "greater than or equal to zero"
      );
    }
  });

  it("keeps CFA labeling descriptive and stops before sensor conversion", () => {
    const plan = makeQuadrature().value;
    const result = reduceRelative(
      plan,
      valuesFor(plan, () => 1)
    );

    expect(result.value.channelId).toBe("green");
    expect(result.value.outputMeaning).toBe(
      "channel-tagged-pre-response-spatial-sample"
    );
    expect(
      result.value.cfaSpectralFilteringApplied
    ).toBe(false);
    expect(
      result.value.channelIdIsSpectralResponse
    ).toBe(false);
    expect(
      result.value.temporalIntegrationApplied
    ).toBe(false);
    expect(
      result.value.quantumEfficiencyApplied
    ).toBe(false);
    expect(result.value.photonsCalculated).toBe(false);
    expect(result.value.electronsCalculated).toBe(false);
    expect(result.value.rawCodeValueProduced).toBe(false);
    expect(
      result.value.demosaicOrReconstructionApplied
    ).toBe(false);
  });

  it("is deterministic for identical identified inputs", () => {
    const plan = makeQuadrature(
      splitStack(),
      2,
      2
    ).value;
    const nodeValues = valuesFor(
      plan,
      (index) => index + 0.5
    );

    expect(reduceRelative(plan, nodeValues)).toEqual(
      reduceRelative(plan, nodeValues)
    );
  });
});
