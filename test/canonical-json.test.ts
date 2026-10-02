import { describe, expect, it } from "vitest";
import { InvalidConfigurationError } from "../src/core/configuration-error.js";
import { stringifyCanonicalJson, type CanonicalJsonPolicy } from "../src/core/canonical-json.js";

const strict: CanonicalJsonPolicy = {
  undefinedObjectProperties: "reject",
  nonFiniteNumberMessage: "domain finite-number error",
  unsupportedValueMessage: "domain unsupported-type error"
};

describe("internal canonical JSON mechanics", () => {
  it("sorts nested keys, retains array order and escapes strings without changing source data", () => {
    const value = { z: [3, { b: true, a: null }], a: '"\n', negativeZero: -0 };
    expect(stringifyCanonicalJson(value, strict)).toBe('{"a":"\\"\\n","negativeZero":0,"z":[3,{"a":null,"b":true}]}');
    expect(Object.keys(value)).toEqual(["z", "a", "negativeZero"]);
    expect(Object.is(value.negativeZero, -0)).toBe(true);
  });

  it("keeps omitted object properties separate from rejected scalar/array values", () => {
    const omit: CanonicalJsonPolicy = { ...strict, undefinedObjectProperties: "omit" };
    expect(stringifyCanonicalJson({ b: undefined, a: { x: undefined, y: 1 } }, omit)).toBe('{"a":{"y":1}}');
    expect(() => stringifyCanonicalJson({ b: undefined }, strict)).toThrow(strict.unsupportedValueMessage);
    for (const policy of [strict, omit]) {
      for (const value of [undefined, [undefined], { nested: [undefined] }, 1n, Symbol("x"), (): number => 0]) {
        expect(() => stringifyCanonicalJson(value, policy)).toThrow(InvalidConfigurationError);
        expect(() => stringifyCanonicalJson(value, policy)).toThrow(strict.unsupportedValueMessage);
      }
    }
  });

  it("retains domain-specific finite-number errors at every nesting level", () => {
    for (const value of [NaN, Infinity, -Infinity]) {
      for (const nested of [value, [value], { nested: value }]) {
        expect(() => stringifyCanonicalJson(nested, strict)).toThrow(InvalidConfigurationError);
        expect(() => stringifyCanonicalJson(nested, strict)).toThrow(strict.nonFiniteNumberMessage);
      }
    }
  });
});
