// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { simulatePocCamera, calculateDefocusCircle, calculateDepthOfField, calculateThinLensImageDistance, type PocSimulationRequest } from "../src/index.js";
import { calculateDefocusCircleUsingFocusProjection } from "../src/optics/depth-of-field.js";

const reference = JSON.parse(readFileSync(new URL("./fixtures/poc-projection-reuse-reference.json", import.meta.url), "utf8")) as {
  referenceCommit: string; cases: { id: string; input: PocSimulationRequest; responseSha256: string }[];
};
// Complete d01d04b responses for the same 64 cases. They are anchored to the historical hashes
// below by pure JSON hashing, which is engine-independent, so the corpus needs no per-platform
// override (the former darwin-arm64 hash override is retired).
const stored = JSON.parse(readFileSync(new URL("./fixtures/poc-projection-reuse-responses.json", import.meta.url), "utf8")) as {
  referenceCommit: string; responses: Record<string, Record<string, unknown>>;
};
// Intentional post-reference changes. #276: centered-crop width is now derived from the floored
// height at the source aspect ratio, so only crop.pixelWidth/megapixels/retainedAreaFraction differ
// (e.g. 600x400 at 2.1414x: 280x186 -> 279x186, exactly 3:2). All other fields are unchanged.
const intentionalResponseSha256: Record<string, string> = {
  "equivalence-11": "15aaf5e30d228a996173ce549d5fd9368d190a4fa4183e0dcdd4502494d99547",
  "equivalence-25": "513f7679bfa105995b0f17661d903167a8f6d19a39591d7b1358dfa52b586696",
  "equivalence-33": "7be90166b6cd791e6778c5b511f7ec49e28579c0587421ee2031d9a6c2b48798",
  "equivalence-46": "1e50030d40ed215c07fa39e0a8fe0944a2e057bbf1c9bc9ac363b4f38397a018",
  "equivalence-47": "256ff249de63a24b78ca2072bbbe1bf54599f8606c14bcd57b1a659f4244490c"
};

// #271 replaced the approximate DOF limits Hs/(H +/- (s - f)) with the exact
// thin-lens limits. The historical response hashes predate that intentional
// science change, so the corpus re-applies the pre-#271 expression (same
// floating-point operation order) to the depthOfField field only. Every other
// response byte remains compared against the historical reference.
function preIssue271DepthOfField(input: PocSimulationRequest): Record<string, number | null> {
  const f = input.lens.focalLengthMm, n = input.lens.aperture, c = input.focus.circleOfConfusionMm;
  if (c === undefined || input.focus.equivalentViewingCircleOfConfusion !== undefined) throw new Error("Corpus case needs an explicit circle of confusion.");
  const s = input.focus.focusDistanceM * 1000;
  const h = (f * f) / (n * c) + f;
  const near = (h * s) / (h + (s - f));
  const farDenominator = h - (s - f);
  const far = farDenominator <= 0 ? null : (h * s) / farDenominator;
  return { hyperfocalDistanceM: h / 1000, nearLimitM: near / 1000, farLimitM: far === null ? null : far / 1000, totalDepthOfFieldM: far === null ? null : (far - near) / 1000 };
}
/**
 * Corpus comparison policy (docs/NUMERICAL_CORRECTNESS.md#cross-engine-determinism): discrete
 * fields (strings, booleans, null, array lengths, key sets) must match exactly. Numbers must match
 * within CORPUS_ULPS units of binary64 relative precision, because continuous fields pass through
 * implementation-approximated Math functions (atan, tan, exp, ...) whose last bit differs between
 * JavaScript engines and platforms. Integers below 2^50 are therefore still compared exactly.
 */
const CORPUS_ULPS = 8;
function compareWithinUlps(actual: unknown, expected: unknown, path: string, out: string[]): void {
  if (typeof expected === "number" && typeof actual === "number") {
    const scale = Math.max(Math.abs(actual), Math.abs(expected));
    if (actual !== expected && !(Math.abs(actual - expected) <= CORPUS_ULPS * Number.EPSILON * scale)) out.push(`${path}: ${actual} vs ${expected}`);
    return;
  }
  if (typeof expected !== "object" || expected === null || typeof actual !== "object" || actual === null) {
    if (actual !== expected) out.push(`${path}: ${JSON.stringify(actual)} vs ${JSON.stringify(expected)}`);
    return;
  }
  if (Array.isArray(expected) !== Array.isArray(actual)) { out.push(`${path}: array/object mismatch`); return; }
  const actualKeys = Object.keys(actual), expectedKeys = Object.keys(expected);
  if (actualKeys.join() !== expectedKeys.join()) { out.push(`${path}: keys ${actualKeys.join()} vs ${expectedKeys.join()}`); return; }
  for (const key of expectedKeys) compareWithinUlps((actual as Record<string, unknown>)[key], (expected as Record<string, unknown>)[key], `${path}.${key}`, out);
}

/** Intentional 2.0.0 response changes relative to the d01d04b reference responses. */
function apply200ResponseChanges(response: Record<string, unknown>, input: PocSimulationRequest): Record<string, unknown> {
  const migrated = structuredClone(response);
  migrated.apiVersion = "1.0.0";
  // Defocus model 1.1.0 evaluates the stable closed form c = (f/N)(|s - d|/d)(f/(s - f)) instead of
  // subtracting two nearly equal image distances; its numerical accuracy is checked independently
  // against an exact rational oracle in optics.test.ts.
  const f = input.lens.focalLengthMm, s = input.focus.focusDistanceM * 1000;
  const pitchMm = (migrated.sensor as { pixelPitchMicrometers: number }).pixelPitchMicrometers / 1000;
  for (const sample of (migrated.defocusSamples ?? []) as { distanceM: number; diameterMm: number; diameterPixels: number }[]) {
    const d = sample.distanceM * 1000;
    sample.diameterMm = (f / input.lens.aperture) * (Math.abs(s - d) / d) * (f / (s - f));
    sample.diameterPixels = sample.diameterMm / pitchMm;
  }
  const visit = (value: unknown): void => {
    if (typeof value !== "object" || value === null) return;
    const record = value as Record<string, unknown>;
    // Crop model 2.0.0 (few-ulp whole-pixel snapping) and stable closed-form defocus 1.1.0.
    if ((record.model === "centered-same-aspect-crop" || record.model === "subject-height-framing-crop") && record.modelVersion === "1.0.0") record.modelVersion = "2.0.0";
    if (record.model === "thin-lens-defocus-circle" && record.modelVersion === "1.0.0") record.modelVersion = "1.1.0";
    Object.values(record).forEach(visit);
  };
  visit(migrated);
  return migrated;
}

describe("request-local defocus focus projection", () => {
  it("anchors the stored complete responses to the historical corpus hashes (engine-independent)", () => {
    expect(reference.referenceCommit).toBe("c1374c31473f893310d1ce4f0d5a737aaba43ab5");
    expect(reference.cases).toHaveLength(64);
    expect(stored.referenceCommit).toBe("d01d04b41551210fc6a35c5b607fc53115c17a48");
    for (const fixture of reference.cases) {
      const response = { ...stored.responses[fixture.id], depthOfField: preIssue271DepthOfField(fixture.input) };
      expect(createHash("sha256").update(JSON.stringify(response)).digest("hex"), fixture.id)
        .toBe(intentionalResponseSha256[fixture.id] ?? fixture.responseSha256);
    }
  });

  it("preserves every discrete field and every number within a few ulps across the fixed 64-case corpus", () => {
    const differences: string[] = [];
    for (const fixture of reference.cases) {
      const current = simulatePocCamera(fixture.input);
      expect(current.depthOfField, fixture.id).toEqual(calculateDepthOfField({
        focalLengthMm: fixture.input.lens.focalLengthMm, aperture: fixture.input.lens.aperture,
        focusDistanceM: fixture.input.focus.focusDistanceM, circleOfConfusionMm: fixture.input.focus.circleOfConfusionMm!
      }).value);
      compareWithinUlps(JSON.parse(JSON.stringify(current)), apply200ResponseChanges(stored.responses[fixture.id]!, fixture.input), fixture.id, differences);
    }
    expect(differences).toEqual([]);
  });
  it("keeps the scalar calculation and provenance as the defocus oracle", () => {
    for (const focalLengthMm of [15, 50, 200]) for (const focusDistanceM of [.3, 5, 50]) {
      const context = Object.freeze({ focalLengthMm, focusDistanceM, imageDistanceMm: calculateThinLensImageDistance({ focalLengthMm, objectDistanceM: focusDistanceM }).value.imageDistanceMm });
      for (const subjectDistanceM of [.3, 1, 5, 50]) {
        const input = { focalLengthMm, focusDistanceM, subjectDistanceM, aperture: 4 };
        expect(calculateDefocusCircleUsingFocusProjection(input, context)).toEqual(calculateDefocusCircle(input));
      }
    }
  });
  it("rejects stale focal/focus identities and non-finite borrowed projections", () => {
    const input = { focalLengthMm: 50, focusDistanceM: 5, subjectDistanceM: 3, aperture: 4 };
    const context = { focalLengthMm: 50, focusDistanceM: 5, imageDistanceMm: 50.505050505050505 };
    for (const modified of [{ ...context, focalLengthMm: 35 }, { ...context, focusDistanceM: 4 }, { ...context, imageDistanceMm: NaN },
      { ...context, imageDistanceMm: Infinity }, { ...context, imageDistanceMm: 0 }]) {
      expect(() => calculateDefocusCircleUsingFocusProjection(input, modified)).toThrow();
    }
  });
  it("preserves scalar invalid-input errors under context reuse", () => {
    const context = { focalLengthMm: 50, focusDistanceM: 5, imageDistanceMm: 50.505050505050505 };
    const valid = { focalLengthMm: 50, focusDistanceM: 5, subjectDistanceM: 3, aperture: 4 };
    function error(action: () => unknown): unknown {
      try { action(); return null; } catch (e) {
        if (!(e instanceof Error)) throw e;
        return { name: e.name, message: e.message };
      }
    }
    for (const change of [{ subjectDistanceM: .05 }, { subjectDistanceM: 0 }, { subjectDistanceM: NaN }, { aperture: 0 }, { aperture: Infinity }]) {
      const input = { ...valid, ...change };
      expect(error(() => calculateDefocusCircleUsingFocusProjection(input, context))).toEqual(error(() => calculateDefocusCircle(input)));
      expect(error(() => calculateDefocusCircle(input))).not.toBeNull();
    }
  });
  it("cannot reuse a projection across subsequent request identities", () => {
    const input = reference.cases[3]!.input, changed = { ...input, focus: { ...input.focus, focusDistanceM: 12 } };
    const first = simulatePocCamera(input);
    const second = simulatePocCamera(changed);
    expect(second.projection.imageDistanceMm).not.toBe(first.projection.imageDistanceMm);
    expect(simulatePocCamera(input)).toEqual(first);
    for (const sample of second.defocusSamples ?? []) {
      expect(sample.diameterMm).toBe(calculateDefocusCircle({ focalLengthMm: changed.lens.focalLengthMm, aperture: changed.lens.aperture,
        focusDistanceM: changed.focus.focusDistanceM, subjectDistanceM: sample.distanceM }).value.diameterMm);
    }
  });
});
