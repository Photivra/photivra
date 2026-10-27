// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { calculateEquivalentFocalLength35Mm, calculateImagingAreaMetrics, calculateNativeRawPlan, createNativeRawDevelopmentTask, createSimulatedCapture, parseSimulatedCapture, type NativeRawOutput } from "../src/index.js";
import { nativeRawFixture } from "./helpers/native-raw-fixture.js";
import { createHash } from "node:crypto";
import { equalWithinUlps, portableAsin, portableCbrt, portableCosTwoPi, portableExp, portableExp2, portableExpm1, portableHypot, portableLog, portableLog2, portablePow,
  portableSinTwoPi } from "../src/core/portable-math.js";
import { encodeSrgbComponent, encodeSrgbComponentPortable } from "../src/color/srgb-transfer.js";
import { loadSensorRawFrameInput } from "./helpers/sensor-raw-frame-fixture.js";

describe("engine-portable floating-point helpers (numeric review #1, #2)", () => {
  it("computes the Euclidean norm from correctly rounded operations only", () => {
    expect(portableHypot(3, 4)).toBe(5);
    expect(portableHypot(36, 24)).toBe(Math.sqrt(1872));
    expect(portableHypot(1, 2, 2)).toBe(3);
    expect(portableHypot(0, 0)).toBe(0);
    expect(portableHypot(-0, 0)).toBe(0);
    expect(portableHypot(-5, 12)).toBe(13);
    // In range it is literally sqrt of the in-order sum of squares.
    for (const [x, y] of [[23.6, 15.7], [6.17, 4.55], [17.3, 13], [0.1, 0.2]] as const) {
      expect(portableHypot(x, y)).toBe(Math.sqrt(x * x + y * y));
    }
  });

  it("rescales by exact powers of two instead of overflowing or underflowing", () => {
    expect(portableHypot(3e300, 4e300)).toBe(5e300);
    expect(portableHypot(3e-300, 4e-300)).toBeCloseTo(5e-300, 314);
    expect(Math.abs(portableHypot(3e-300, 4e-300) - 5e-300)).toBeLessThanOrEqual(2 * Number.EPSILON * 5e-300);
    expect(portableHypot(Number.MAX_VALUE, 0)).toBe(Number.MAX_VALUE);
    expect(portableHypot(Number.MIN_VALUE, 0)).toBe(Number.MIN_VALUE);
    expect(portableHypot(Infinity, 1)).toBe(Infinity);
    expect(portableHypot(NaN, 1)).toBeNaN();
  });

  it("compares within a relative ulp budget", () => {
    expect(equalWithinUlps(1, 1 + Number.EPSILON, 1)).toBe(true);
    expect(equalWithinUlps(1, 1 + 4 * Number.EPSILON, 2)).toBe(false);
    expect(equalWithinUlps(27.475525007794076, 27.475525007794072, 8)).toBe(true);
    expect(equalWithinUlps(0, 0, 0)).toBe(true);
    expect(equalWithinUlps(NaN, NaN, 8)).toBe(false);
    expect(equalWithinUlps(Infinity, Infinity, 8)).toBe(false);
  });

  it("derives the 35 mm crop factor as sqrt(1872 / (w^2 + h^2)) bit for bit", () => {
    for (const [widthMm, heightMm] of [[23.5, 15.6], [23.6, 15.7], [22.3, 14.9], [17.3, 13], [13.2, 8.8], [6.17, 4.55], [43.8, 32.9], [35.9, 23.9], [9.8, 7.4], [7.6, 5.7], [36, 24]] as const) {
      const metrics = calculateImagingAreaMetrics({ widthMm, heightMm }).value;
      expect(metrics.cropFactor35Mm).toBe(Math.sqrt(1872 / (widthMm * widthMm + heightMm * heightMm)));
      expect(metrics.diagonalMm).toBe(Math.sqrt(widthMm * widthMm + heightMm * heightMm));
    }
    expect(calculateImagingAreaMetrics({ widthMm: 36, heightMm: 24 }).value.cropFactor35Mm).toBe(1);
    expect(calculateEquivalentFocalLength35Mm({ focalLengthMm: 18, activeImagingArea: { widthMm: 23.6, heightMm: 15.7 } }).value.equivalentFocalLength35Mm)
      .toBe(18 * Math.sqrt(1872 / (23.6 * 23.6 + 15.7 * 15.7)));
    // Extreme but finite areas stay finite and positive.
    expect(calculateImagingAreaMetrics({ widthMm: 1e200, heightMm: 1e200 }).value.cropFactor35Mm).toBeGreaterThan(0);
    expect(Number.isFinite(calculateImagingAreaMetrics({ widthMm: 1e-200, heightMm: 1e-200 }).value.cropFactor35Mm)).toBe(true);
  });

  it("parses a capture whose archived 35 mm equivalent differs by a few ulps (other engine or pre-2.0 Math.hypot)", () => {
    const { schemaVersion: _s, engineApiVersion: _e, resolvedGeometry: _r, equivalentFocalLength35Mm: _q, ...input } = loadSensorRawFrameInput().capture;
    void _s; void _e; void _r; void _q;
    const capture = createSimulatedCapture({
      ...input,
      geometry: { ...input.geometry, imagingArea: { widthMm: 23.6, heightMm: 15.7 } },
      exposure: { ...input.exposure, focalLengthMm: 18 }
    }).value;
    const archived = JSON.parse(JSON.stringify(capture)) as typeof capture;
    const nudged = { ...archived, equivalentFocalLength35Mm: archived.equivalentFocalLength35Mm * (1 + 2 * Number.EPSILON) };
    expect(nudged.equivalentFocalLength35Mm).not.toBe(capture.equivalentFocalLength35Mm);
    expect(parseSimulatedCapture(nudged).equivalentFocalLength35Mm).toBe(capture.equivalentFocalLength35Mm);
    expect(() => parseSimulatedCapture({ ...archived, equivalentFocalLength35Mm: archived.equivalentFocalLength35Mm * (1 + 1e-9) }))
      .toThrow("Archived derived capture metadata is inconsistent.");
    expect(() => parseSimulatedCapture({ ...archived, equivalentFocalLength35Mm: "27.4" }))
      .toThrow("Archived derived capture metadata is inconsistent.");
  });

  it("validates packed RAW metadata with the same few-ulp focal-equivalent tolerance and exact other fields", () => {
    const f = nativeRawFixture(2, 2);
    f.input.exposure.geometry.imagingArea = { widthMm: 23.6, heightMm: 15.7 };
    f.input.exposure.exposure.focalLengthMm = 18;
    const plan = JSON.parse(JSON.stringify(calculateNativeRawPlan(f.input))) as NativeRawOutput["plan"];
    const develop = (p: NativeRawOutput["plan"]) => (): unknown => createNativeRawDevelopmentTask({
      raw: { plan: p, codes: new Uint16Array(4), blackLevels: new Uint16Array(4), digitalSaturationCodes: new Uint16Array(4), saturationFlags: new Uint8Array(4), effectiveSaturationCodes: new Uint16Array(4) },
      phaseProfiles: [], colorProfile: {} as never, whiteBalance: "not-required", rendering: {} as never, maximumRetainedPayloadBytes: 1e6
    }, () => Promise.resolve());
    const withEquivalent = (value: number): NativeRawOutput["plan"] => ({ ...plan, exposure: { ...plan.exposure, equivalentFocalLength35Mm: value }, frame: { ...plan.frame, capture: { ...plan.frame.capture, equivalentFocalLength35Mm: value } } }) as NativeRawOutput["plan"];
    // Metadata validation passes; the empty phase list then fails a later, unrelated check.
    expect(develop(plan)).toThrow("Every CFA phase requires one profile");
    expect(develop(withEquivalent(plan.exposure.equivalentFocalLength35Mm * (1 + 2 * Number.EPSILON)))).toThrow("Every CFA phase requires one profile");
    expect(develop(withEquivalent(plan.exposure.equivalentFocalLength35Mm * (1 + 1e-9)))).toThrow("Packed RAW metadata is stale or inconsistent.");
    expect(develop({ ...plan, outputBytes: plan.outputBytes + 1 })).toThrow();
  });
});

/** Distance between a and b in units in the last place of b (b ≠ 0, normal). */
function ulps(a: number, b: number): number {
  const exponent = Math.floor(Math.log2(Math.abs(b)));
  return Math.abs(a - b) / 2 ** (Math.max(exponent, -1022) - 52);
}

describe("engine-portable logarithm, exponential, power, cube root and cosine (display view)", () => {
  const functions = { log: portableLog, log2: portableLog2, exp: portableExp, exp2: portableExp2, expm1: portableExpm1, cbrt: portableCbrt,
    cos2pi: portableCosTwoPi, sin2pi: portableSinTwoPi } as const;
  // Correctly rounded values of the exact functions at these binary64 arguments, computed with 60-digit decimal arithmetic
  // (Python decimal: ln, exp, power; cos and sin of 2πx by their Taylor series with 80-digit π), independently of this code.
  const references: [keyof typeof functions | "pow", number | [number, number], number][] = [
    ["log", 0.18, -1.7147984280919266], ["log", 1.5, 0.4054651081081644], ["log", 1e-300, -690.7755278982137], ["log", 7.25e+300, 692.7565293670802],
    ["log", 0.9999999, -1.0000000494736474e-07], ["log", 1.0000001, 9.999999505838704e-08], ["log", 3.0, 1.0986122886681098],
    ["log2", 0.18, -2.473931188332412], ["log2", 1e-10, -33.219280948873624], ["log2", 12345.678, 13.59171844813855], ["log2", 0.7071067811865476, -0.4999999999999999],
    ["exp", -30.0, 9.357622968840175e-14], ["exp", -0.5, 0.6065306597126334], ["exp", 1e-10, 1.0000000001], ["exp", 0.6931471805599453, 2.0],
    ["exp", 20.5, 799902177.4755054], ["exp", 700.0, 1.0142320547350045e+304],
    ["exp2", -20.375, 7.353834273376182e-07], ["exp2", 0.5, 1.4142135623730951], ["exp2", 9.99, 1016.9267153275249],
    ["expm1", 1e-12, 1.0000000000005e-12], ["expm1", -0.3, -0.2591817793182821], ["expm1", 0.75, 1.1170000166126746], ["expm1", 2.5, 11.182493960703473],
    ["expm1", -5.0, -0.9932620530009145],
    ["cbrt", 0.008856451679035631, 0.20689655172413793], ["cbrt", 3.0, 1.4422495703074083], ["cbrt", 1000.5, 10.001666388966024], ["cbrt", -0.2, -0.5848035476425733],
    ["pow", [0.5, 1 / 2.4], 0.7491535384383408], ["pow", [0.0031308, 1 / 2.4], 0.09047384595515653], ["pow", [0.9, 1.4], 0.8628583639627645],
    ["pow", [3e-07, 5.0], 2.4299999999999996e-33], ["pow", [12.0, -2.5], 0.0020046884346862004],
    ["cos2pi", 0.1, 0.8090169943749475], ["cos2pi", 0.3, -0.30901699437494734], ["cos2pi", 0.123456789, 0.7139297395006543], ["cos2pi", 0.99, 0.9980267284282716],
    ["sin2pi", 0.1, 0.5877852522924731], ["sin2pi", 0.4, 0.587785252292473], ["sin2pi", 0.87654321, -0.7002173472133718], ["sin2pi", 0.01, 0.06279051952931337]
  ];

  it("is within its stated error bound of correctly rounded reference values", () => {
    for (const [name, argument, expected] of references) {
      const value = name === "pow" ? portablePow(...(argument as [number, number])) : functions[name](argument as number);
      // 1 ulp for log, log2, exp, exp2, cbrt and pow; 2 for expm1, cos and sin (the bounds in src/core/portable-math.ts).
      expect(ulps(value, expected), name + "(" + String(argument) + ")").toBeLessThanOrEqual(name === "expm1" || name === "cos2pi" || name === "sin2pi" ? 2 : 1);
    }
  });

  it("gives exact results where the exact result is a double", () => {
    for (let k = -1074; k <= 1023; k += 7) { expect(portableExp2(k)).toBe(2 ** k); expect(portableLog2(2 ** k)).toBe(k); }
    expect(portableExp(0)).toBe(1);
    expect(portableLog(1)).toBe(0);
    expect(portableCbrt(8)).toBe(2);
    expect(portableCbrt(-0.125)).toBe(-0.5);
    expect(portablePow(4, 0.5)).toBe(2);
    expect(portablePow(2, 10)).toBe(1024);
    expect(portableCosTwoPi(0)).toBe(1);
    expect(portableCosTwoPi(0.5)).toBe(-1);
    expect(portableSinTwoPi(0.25)).toBe(1);
    expect(portableSinTwoPi(-0.25)).toBe(-1);
  });

  it("handles special values", () => {
    expect(portableLog(0)).toBe(-Infinity); expect(portableLog(-1)).toBeNaN(); expect(portableLog(Infinity)).toBe(Infinity); expect(portableLog(NaN)).toBeNaN();
    expect(portableLog2(Number.MIN_VALUE)).toBe(-1074);
    expect(portableExp(710)).toBe(Infinity); expect(portableExp(-746)).toBe(0); expect(portableExp(NaN)).toBeNaN();
    expect(portableExp(-745)).toBe(Number.MIN_VALUE);
    expect(portableExpm1(0)).toBe(0); expect(Object.is(portableExpm1(-0), -0)).toBe(true); expect(portableExpm1(-800)).toBe(-1);
    expect(portablePow(0, 2)).toBe(0); expect(portablePow(0, -1)).toBe(Infinity); expect(portablePow(5, 0)).toBe(1); expect(portablePow(1, 1e300)).toBe(1);
    expect(portablePow(-2, 0.5)).toBeNaN(); expect(portablePow(Infinity, 1)).toBeNaN();
    expect(Object.is(portableCbrt(-0), -0)).toBe(true); expect(portableCbrt(-Infinity)).toBe(-Infinity);
    expect(portableCosTwoPi(Infinity)).toBeNaN(); expect(portableSinTwoPi(NaN)).toBeNaN();
    expect(portableCosTwoPi(1e20)).toBe(1); // 4·10^20 is an integer, so u is a whole number of turns
  });

  it("agrees with the runtime's Math functions within their combined error", () => {
    let state = 12345;
    const next = (): number => { state ^= state << 13; state >>>= 0; state ^= state >>> 17; state ^= state << 5; state >>>= 0; return (state + 0.5) / 4294967296; };
    for (let i = 0; i < 20_000; i++) {
      const u = next(), x = (u - 0.5) * 60, wide = Math.exp((next() - 0.5) * 1000);
      expect(ulps(portableLog(wide), Math.log(wide))).toBeLessThanOrEqual(2);
      expect(ulps(portableExp(x), Math.exp(x))).toBeLessThanOrEqual(2);
      expect(ulps(portablePow(u, 1 / 2.4), u ** (1 / 2.4))).toBeLessThanOrEqual(2);
      expect(ulps(portablePow(u * 1e-6, 5), (u * 1e-6) ** 5)).toBeLessThanOrEqual(2);
      expect(ulps(portableCbrt(x), Math.cbrt(x))).toBeLessThanOrEqual(2);
      expect(ulps(portableExpm1(x / 20), Math.expm1(x / 20))).toBeLessThanOrEqual(3);
      // cos and sin of 2πu against Math.cos/Math.sin of the rounded angle 2π·u, which itself carries up to half an ulp of the angle.
      expect(Math.abs(portableCosTwoPi(u) - Math.cos(2 * Math.PI * u))).toBeLessThanOrEqual(8 * Number.EPSILON);
      expect(Math.abs(portableSinTwoPi(u) - Math.sin(2 * Math.PI * u))).toBeLessThanOrEqual(8 * Number.EPSILON);
    }
  });

  it("gives the display view's sRGB transfer within 2 ulps of the capture's", () => {
    for (let i = 0; i <= 100_000; i++) {
      const x = i / 100_000, a = encodeSrgbComponent(x), b = encodeSrgbComponentPortable(x);
      if (x <= 0.0031308 || x === 1) expect(b).toBe(a); else expect(Math.abs(b - a)).toBeLessThanOrEqual(2 * Number.EPSILON);
    }
  });

  it("gives the same bits in every JavaScript engine: one digest of 49 152 results", () => {
    // Recorded on Node 24.21.0; the same digest was computed on Node 22.13.0, 22.22.0 and 26.12.0, Chromium 141 and 153
    // and Bun 1.4.2 (JavaScriptCore), whose Math.pow, exp, log, cbrt, sin and cos differ from one another in the last bit.
    const out = new DataView(new ArrayBuffer(8 * 12 * 4096));
    let state = 0x2545f491, o = 0;
    const next = (): number => { state ^= state << 13; state >>>= 0; state ^= state >>> 17; state ^= state << 5; state >>>= 0; return (state + 0.5) / 4294967296; };
    for (let i = 0; i < 4096; i++) {
      const u = next(), w = next(), x = (u - 0.5) * 80, wide = 2 ** Math.floor((w - 0.5) * 200) * (1 + u);
      for (const v of [portableLog(wide), portableLog2(wide), portableExp(x), portableExp2(x), portableExpm1((u - 0.5) * 4), portableCbrt(x),
        portablePow(u, 1 / 2.4), portablePow(u + w, 1.4), portablePow(wide, (w - 0.5) * 8), portablePow(u * 1e-6, 5), portableCosTwoPi(x), portableSinTwoPi(x)]) { out.setFloat64(o, v, true); o += 8; }
    }
    expect(createHash("sha256").update(new Uint8Array(out.buffer)).digest("hex")).toBe("ca9d40f40f487e106b35ebb15f796b613cdea061bd3c644cc95b88ac41eb0dd7");
  });
});

describe("portableAsin (#492: the defocus disc's cell areas)", () => {
  /** |a − b| in units of the last place of b (b ≠ 0). */
  const ulps = (a: number, b: number): number => Math.abs(a - b) / 2 ** (Math.floor(Math.log2(Math.abs(b))) - 52);
  it("is within 2 ulps of Math.asin over [−1, 1] and exact at the anchors", () => {
    let worst = 0;
    for (let k = -100_000; k <= 100_000; k++) {
      if (k === 0) continue;
      const x = k / 100_000;
      worst = Math.max(worst, ulps(portableAsin(x), Math.asin(x)));
    }
    for (const x of [1e-300, 1e-8, 0.4999999999999999, 0.5, 0.5000000000000001, 1 - 2 ** -53, 0.8411240000000001]) worst = Math.max(worst, ulps(portableAsin(x), Math.asin(x)));
    expect(worst).toBeLessThanOrEqual(2);
    expect(portableAsin(1)).toBe(Math.PI / 2);
    expect(portableAsin(-1)).toBe(-Math.PI / 2);
    expect(portableAsin(0)).toBe(0);
    expect(Object.is(portableAsin(-0), -0)).toBe(true);
  });
  it("is odd and returns NaN outside [−1, 1]", () => {
    for (const x of [0.1, 0.3, 0.5, 0.7, 0.9, 0.999]) expect(portableAsin(-x)).toBe(-portableAsin(x));
    for (const x of [1.0000000000000002, -1.0000000000000002, 2, Number.NaN, Number.POSITIVE_INFINITY]) expect(portableAsin(x)).toBeNaN();
  });
});
