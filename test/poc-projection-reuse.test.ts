// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { simulatePocCamera, calculateDefocusCircle, calculateThinLensImageDistance, type PocSimulationRequest } from "../src/index.js";
import { calculateDefocusCircleUsingFocusProjection } from "../src/optics/depth-of-field.js";

const reference = JSON.parse(readFileSync(new URL("./fixtures/poc-projection-reuse-reference.json", import.meta.url), "utf8")) as {
  referenceCommit: string; cases: { id: string; input: PocSimulationRequest; responseSha256: string }[];
};
// Independently executed pre-optimization source; preserve the historical corpus.
const darwinReference = JSON.parse(readFileSync(new URL("./fixtures/poc-projection-reuse-darwin-arm64-reference.json", import.meta.url), "utf8")) as {
  referenceCommit: string; platform: string; architecture: string; verifiedNodeMajors: number[];
  responseSha256Overrides: Record<string, string>;
};
describe("request-local defocus focus projection", () => {
  it("preserves complete pre-change POC response/provenance across the fixed 64-case corpus", () => {
    expect(reference.referenceCommit).toBe("c1374c31473f893310d1ce4f0d5a737aaba43ab5");
    expect(reference.cases).toHaveLength(64);
    expect(darwinReference.referenceCommit).toBe(reference.referenceCommit);
    const useDarwinReference = process.platform === darwinReference.platform && process.arch === darwinReference.architecture
      && darwinReference.verifiedNodeMajors.includes(Number(process.versions.node.split(".")[0]));
    for (const fixture of reference.cases) {
      const response = simulatePocCamera(fixture.input);
      const expected = (useDarwinReference ? darwinReference.responseSha256Overrides[fixture.id] : undefined) ?? fixture.responseSha256;
      expect(createHash("sha256").update(JSON.stringify(response)).digest("hex"), fixture.id).toBe(expected);
    }
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
