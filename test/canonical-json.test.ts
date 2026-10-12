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

  it("rejects non-plain objects so distinct Maps, Dates or typed arrays never share an identity (#276)", () => {
    class Point { x = 1; }
    const nonPlain: unknown[] = [
      new Map([["a", 1]]), new Set([1]), new Date(0), new Float64Array([1, 2]), new Uint8Array(2),
      new ArrayBuffer(2), new Point(), /x/, new Error("x"), Object.create({ inherited: 1 }) as object,
      new Number(1), new String("s"), new Boolean(true), Promise.resolve(1)
    ];
    for (const value of nonPlain) {
      for (const wrapped of [value, [value], { nested: value }]) {
        expect(() => stringifyCanonicalJson(wrapped, strict)).toThrow(InvalidConfigurationError);
        expect(() => stringifyCanonicalJson(wrapped, strict)).toThrow(strict.unsupportedValueMessage);
      }
    }
    class Items extends Array<number> {}
    expect(() => stringifyCanonicalJson(Items.from([1]), strict)).toThrow(strict.unsupportedValueMessage);
  });

  it("rejects sparse arrays instead of emitting invalid JSON", () => {
    // eslint-disable-next-line no-sparse-arrays
    for (const value of [[1, , 2], new Array(2), { nested: [, 1] }]) {
      expect(() => stringifyCanonicalJson(value, strict)).toThrow(strict.unsupportedValueMessage);
    }
  });

  it("keeps output identical to sorted-key JSON.stringify for valid plain data, including null-prototype records", () => {
    const record = Object.assign(Object.create(null) as Record<string, unknown>, { b: [1, -0, 1e-7, "s"], a: { d: null, c: false } });
    const frozen = Object.freeze({ z: Object.freeze([Object.freeze({ y: 2, x: 1 })]) });
    expect(stringifyCanonicalJson(record, strict)).toBe('{"a":{"c":false,"d":null},"b":[1,0,1e-7,"s"]}');
    expect(stringifyCanonicalJson(frozen, strict)).toBe('{"z":[{"x":1,"y":2}]}');
    expect(stringifyCanonicalJson([], strict)).toBe("[]");
    expect(stringifyCanonicalJson({}, strict)).toBe("{}");
    expect(JSON.parse(stringifyCanonicalJson(record, strict))).toEqual(JSON.parse(JSON.stringify(record)));
  });
});
