import { describe, expect, it } from "vitest";

import {
  reduceSensorSpatialSamplingQuadrature,
  type SensorSpatialQuadratureNodeValue,
  type SensorSpatialSamplingQuadrature
} from "../src/index.js";
import {
  makeQuadrature,
  valuesFor
} from "./helpers/spatial-sample-fixture.js";

describe("sensor spatial sample reduction validation", () => {
  it("requires complete unique node identities", () => {
    const plan = makeQuadrature(undefined, 2, 2).value;
    const complete = valuesFor(plan, () => 1);

    expect(() =>
      reduceSensorSpatialSamplingQuadrature({
        quadrature: plan,
        valueDomain: {
          kind: "relative-linear",
          unit: "relative",
          semantic:
            "nonnegative-sensor-plane-irradiance-proxy"
        },
        nodeValues: complete.slice(0, -1)
      })
    ).toThrow(
      "exactly one value for every quadrature node"
    );

    const duplicate = [...complete];
    duplicate[1] = complete[0]!;
    expect(() =>
      reduceSensorSpatialSamplingQuadrature({
        quadrature: plan,
        valueDomain: {
          kind: "relative-linear",
          unit: "relative",
          semantic:
            "nonnegative-sensor-plane-irradiance-proxy"
        },
        nodeValues: duplicate
      })
    ).toThrow("duplicate node identities");
  });

  it("rejects node identities not present in the quadrature", () => {
    const plan = makeQuadrature(undefined, 2).value;
    const nodeValues = valuesFor(plan, () => 1);
    nodeValues[0] = {
      node: {
        antiAliasingComponentIndex: 99,
        apertureSampleXIndex: 0,
        apertureSampleYIndex: 0
      },
      value: 1
    };

    expect(() =>
      reduceSensorSpatialSamplingQuadrature({
        quadrature: plan,
        valueDomain: {
          kind: "relative-linear",
          unit: "relative",
          semantic:
            "nonnegative-sensor-plane-irradiance-proxy"
        },
        nodeValues
      })
    ).toThrow("not present in quadrature");
  });

  it("rejects unsupported or inconsistent value-domain declarations", () => {
    const plan = makeQuadrature().value;
    const nodeValues = valuesFor(plan, () => 1);

    expect(() =>
      reduceSensorSpatialSamplingQuadrature({
        quadrature: plan,
        valueDomain: {
          kind: "relative-linear",
          unit: "W/m^2",
          semantic:
            "nonnegative-sensor-plane-irradiance-proxy"
        } as never,
        nodeValues
      })
    ).toThrow("relative-linear valueDomain");

    expect(() =>
      reduceSensorSpatialSamplingQuadrature({
        quadrature: plan,
        valueDomain: {
          kind: "rgb"
        } as never,
        nodeValues
      })
    ).toThrow("valueDomain.kind is invalid");
  });

  it("fails closed on forged quadrature summary weights", () => {
    const plan = makeQuadrature(undefined, 2).value;
    const forged: SensorSpatialSamplingQuadrature = {
      ...plan,
      normalizedSpatialWeightSum: 0.5
    };

    expect(() =>
      reduceSensorSpatialSamplingQuadrature({
        quadrature: forged,
        valueDomain: {
          kind: "relative-linear",
          unit: "relative",
          semantic:
            "nonnegative-sensor-plane-irradiance-proxy"
        },
        nodeValues: valuesFor(plan, () => 1)
      })
    ).toThrow(
      "normalizedSpatialWeightSum does not match"
    );
  });

  it("fails closed on duplicate quadrature identities", () => {
    const plan = makeQuadrature(undefined, 2).value;
    const first = plan.nodes[0];
    const second = plan.nodes[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();

    const forged: SensorSpatialSamplingQuadrature = {
      ...plan,
      nodes: [
        first!,
        {
          ...second!,
          antiAliasingComponentIndex:
            first!.antiAliasingComponentIndex,
          apertureSampleXIndex:
            first!.apertureSampleXIndex,
          apertureSampleYIndex:
            first!.apertureSampleYIndex
        }
      ]
    };

    expect(() =>
      reduceSensorSpatialSamplingQuadrature({
        quadrature: forged,
        valueDomain: {
          kind: "relative-linear",
          unit: "relative",
          semantic:
            "nonnegative-sensor-plane-irradiance-proxy"
        },
        nodeValues:
          valuesFor(plan, () => 1)
      })
    ).toThrow("duplicate node identities");
  });

  it("does not silently create values for omitted support", () => {
    const plan = makeQuadrature(undefined, 2).value;
    const values =
      valuesFor(plan, () => 1);
    const shortValues:
      SensorSpatialQuadratureNodeValue[] =
      values.slice(0, 1);

    expect(() =>
      reduceSensorSpatialSamplingQuadrature({
        quadrature: plan,
        valueDomain: {
          kind: "radiometric-irradiance",
          unit: "W/m^2",
          semantic: "sensor-plane-irradiance"
        },
        nodeValues: shortValues
      })
    ).toThrow(
      "exactly one value for every quadrature node"
    );
  });
});
