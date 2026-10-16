// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import * as engine from "../src/index.js";
import {
  InvalidConfigurationError,
  InvalidScientificInputError,
  InvalidScientificResultError
} from "../src/index.js";

/** Domain error classes a caller can handle; anything else escaping a root function is a defect. */
function isDomainError(error: unknown): boolean {
  return error instanceof InvalidConfigurationError ||
    error instanceof InvalidScientificInputError ||
    error instanceof InvalidScientificResultError;
}

const MALFORMED_INPUTS: readonly [string, unknown][] = [
  ["null", null], ["undefined", undefined], ["{}", {}], ["42", 42], ["\"x\"", "x"], ["[]", []]
];

const rootFunctions = Object.entries(engine)
  .filter((entry): entry is [string, (...args: unknown[]) => unknown] => typeof entry[1] === "function")
  // Exported error classes are constructors, not calculations.
  .filter(([, value]) => !/^class\b/u.test(Function.prototype.toString.call(value)));

describe("root exports reject malformed input with domain errors (API review #4)", () => {
  it("covers every root function", () => {
    expect(rootFunctions.length).toBeGreaterThan(250);
  });

  it("never lets a raw TypeError or RangeError escape for null, undefined, {}, 42, \"x\" or []", async () => {
    const escaped: string[] = [];
    for (const [name, fn] of rootFunctions) {
      for (const [label, input] of MALFORMED_INPUTS) {
        try {
          const result = fn(input);
          if (result instanceof Promise) await result;
        } catch (error) {
          if (!isDomainError(error)) {
            escaped.push(`${name}(${label}): ${error instanceof Error ? `${error.constructor.name}: ${error.message}` : String(error)}`);
          }
        }
      }
    }
    expect(escaped).toEqual([]);
  });

  it("rejects unknown fields on the simple scalar calculators", () => {
    const strict = ["calculateEquivalentFocalLength35Mm", "calculateFieldOfView", "calculateFieldOfViewBounds", "calculateProjectedObjectSize",
      "calculateDepthOfField", "calculateDefocusCircle", "estimateEquivalentViewingCircleOfConfusion", "calculateAiryDisk",
      "calculateExposureValue100", "calculateRelativeOpticalExposure", "calculateRelativeRenderedExposure", "calculateEquivalentIso",
      "calculateThinLensImageDistance", "calculateIdealApertureGeometry", "calculatePixelPitch"] as const;
    for (const name of strict) {
      const fn = engine[name] as (input: unknown) => unknown;
      expect(() => fn({ unexpectedField: 1 }), name).toThrow(new InvalidConfigurationError(`${name} input has unknown field "unexpectedField".`));
    }
  });
});
