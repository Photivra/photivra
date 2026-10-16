// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { executeEnvironmentSensorPhotoSignal, planEnvironmentSensorPhotoSignal } from "../src/sensor/environment-photo-signal.js";
import { evaluator, frameInput } from "./helpers/environment-raw-fixture.js";

function planInput(psf: boolean): Parameters<typeof planEnvironmentSensorPhotoSignal>[0] {
  return frameInput(false, psf).sites[1]!.environment;
}

describe("photo-only environment plan retention (2.0 performance)", () => {
  it.each([true, false])("keeps only the frozen request and image point per tap and identical photo values (sampled PSF %s)", psf => {
    const full = planEnvironmentSensorPhotoSignal(planInput(psf)), compact = planEnvironmentSensorPhotoSignal(planInput(psf), "copy", "photo-only");
    expect(compact.count).toBe(full.count);
    const fullTaps = full.instants.flatMap(i => i.groups.flatMap(g => g.taps)), compactTaps = compact.instants.flatMap(i => i.groups.flatMap(g => g.taps));
    expect(compactTaps.length).toBe(fullTaps.length);
    compactTaps.forEach((tap, index) => {
      const reference = fullTaps[index]!;
      expect(tap.query).toBeUndefined();
      expect(reference.request).toBe(reference.query!.value.request);
      expect(reference.sourcePointImagePlaneMm).toBe(reference.query!.value.sourcePointImagePlaneMm);
      expect(tap.request).toEqual(reference.request);
      expect(Object.isFrozen(tap.request)).toBe(true);
      expect(tap.sourcePointImagePlaneMm).toEqual(reference.sourcePointImagePlaneMm);
      expect({ ...tap, request: undefined, sourcePointImagePlaneMm: undefined }).toEqual({ ...reference, query: undefined, request: undefined, sourcePointImagePlaneMm: undefined });
    });
    const evaluate = (q: Parameters<typeof evaluator>[0]): ReturnType<typeof evaluator> => evaluator(q, 1e-9);
    const expected = executeEnvironmentSensorPhotoSignal(full, evaluate, undefined, "photo-only");
    expect(executeEnvironmentSensorPhotoSignal(compact, evaluate, undefined, "photo-only")).toEqual(expected);
    expect(executeEnvironmentSensorPhotoSignal(full, evaluate).value.photo).toEqual(expected.value.photo);
  });

  it("refuses full execution records from a photo-only plan before any callback", () => {
    let calls = 0;
    const compact = planEnvironmentSensorPhotoSignal(planInput(false), "copy", "photo-only");
    expect(() => executeEnvironmentSensorPhotoSignal(compact, q => { calls++; return evaluator(q, 1e-9); })).toThrow("require a full plan");
    expect(calls).toBe(0);
  });
});
