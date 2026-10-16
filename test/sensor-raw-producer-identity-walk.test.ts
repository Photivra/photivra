// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { calculateNativeRawPlan } from "../src/index.js";
import { parseNativeRawProducerSite, validateNativeRawReadoutIdentity, type SensorRawProducerSiteInput } from "../src/capture/sensor-raw-producer.js";
import { InvalidConfigurationError } from "../src/core/configuration-error.js";
import { nativeRawFixture } from "./helpers/native-raw-fixture.js";

/** Independent copy of the pre-2.0 identity walk (Object.entries and per-key regular expressions). */
function referenceWalk(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (/(?:Id|Version)$/.test(key)) referenceId(child);
    else if (/Ids$/.test(key)) {
      if (!Array.isArray(child) || child.length > 256 || Array.from({ length: child.length }, (_, i) => i in child).includes(false)) {
        throw new InvalidConfigurationError("Expected bounded dense producer array.");
      }
      child.forEach(referenceId);
    } else referenceWalk(child);
  }
}
function referenceId(value: unknown): void {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) throw new InvalidConfigurationError("Expected public producer identity.");
}
function outcome(run: () => void): string {
  try { run(); return "ok"; } catch (error) { return `${(error as Error).constructor.name}: ${(error as Error).message}`; }
}

describe("native RAW identity walk (2.0 performance)", () => {
  const fixture = nativeRawFixture(4, 2), plan = calculateNativeRawPlan(fixture.input);
  const parsed = (): SensorRawProducerSiteInput => parseNativeRawProducerSite(fixture.site(1, 0), 1, plan.frame);

  it("accepts every parsed fixture site exactly as the reference walk does", () => {
    const first = parsed();
    for (let i = 0; i < 8; i++) {
      const site = parseNativeRawProducerSite(fixture.site(i%4, i>>2), i, plan.frame);
      expect(outcome(() => validateNativeRawReadoutIdentity(site, first))).toBe("ok");
      expect(outcome(() => referenceWalk(site))).toBe("ok");
    }
  });

  it("throws the same error for the same seeded identity defects at any depth, repeatedly", () => {
    let state = 0x2750_0006;
    const random = (): number => { state = (Math.imul(state, 1664525)+1013904223) >>> 0; return state/2**32; };
    const pick = <T>(values: readonly T[]): T => values[Math.floor(random()*values.length)]!;
    const keys = ["probeId", "probeVersion", "probeIds", "probe", "Id", "Ids", "id", "probeid", "versionId", "0", "probe0", "IdsX"];
    const values: readonly unknown[] = ["ok-id", "ok.id:2", "", " bad", "-lead", "x".repeat(128), "x".repeat(129), 7, null, undefined, {}, [],
      ["a", "b"], ["a", "bad id"], [, "a"], Array.from({ length: 257 }, () => "a"), { nestedId: "bad id" }, { nestedId: "fine" }, [{ deepId: 3 }], ["0", 1]]; // eslint-disable-line no-sparse-arrays
    const first = parsed();
    let failures = 0;
    for (let trial = 0; trial < 600; trial++) {
      const site = parsed() as unknown as Record<string, unknown>;
      // Descend to a random object in the parsed site, then add one or two random properties.
      let target = site;
      for (let depth = 0; depth < 4; depth++) {
        const objects = Object.values(target).filter((v): v is Record<string, unknown> => v !== null && typeof v === "object");
        if (objects.length === 0 || random() < .3) break;
        target = pick(objects);
      }
      for (let n = 1+Math.floor(random()*2); n > 0; n--) target[pick(keys)] = structuredClone(pick(values));
      const expected = outcome(() => referenceWalk(site));
      // The identity walk runs first, so its error is the validation error whenever the reference walk throws.
      const actual = outcome(() => validateNativeRawReadoutIdentity(site as unknown as SensorRawProducerSiteInput, first));
      if (expected === "ok") expect(actual === "ok" || !actual.includes("producer")).toBe(true);
      else { failures++; expect(actual).toBe(expected); expect(outcome(() => validateNativeRawReadoutIdentity(site as unknown as SensorRawProducerSiteInput, first))).toBe(expected); }
    }
    expect(failures).toBeGreaterThan(100);
  });
});
