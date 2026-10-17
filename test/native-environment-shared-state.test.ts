// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { createNativeEnvironmentRawTask, type NativeEnvironmentRawTile } from "../src/index.js";
import { createNativeEnvironmentRawTaskWithCadence } from "../src/capture/native-environment-raw.js";
import { nativeEnvironmentWorkload } from "./helpers/native-environment-workloads.js";

type Environment = Record<string, unknown> & { temporalIntegrationId: string };
const environments = (tile: NativeEnvironmentRawTile): Environment[] => tile.sites.map(site => site.environment as unknown as Environment);

/** Runs a one-site-tile workload whose native site `index` is rewritten by `mutate`; resolves to the error message or the RAW codes. */
async function runWithSite(index: number, mutate: (environment: Environment) => void): Promise<string | number[]> {
  const { input, provider } = nativeEnvironmentWorkload("psf-radial-field");
  const task = createNativeEnvironmentRawTask({ ...input, raw: { ...input.raw, tileWidth: 1 } }, { ...provider,
    readTile: async (request, signal): Promise<NativeEnvironmentRawTile> => {
      const tile = await provider.readTile(request, signal);
      for (const environment of environments(tile)) if (environment.temporalIntegrationId.endsWith(":native:"+index)) mutate(environment);
      return tile;
    } });
  try { await task.run(); } catch (error) { return (error as Error).message; }
  return Array.from(task.takeOutput().raw.codes);
}

describe("native environment shared-state admission (2.0 performance)", () => {
  it("rejects a later site whose shared state differs, with the same error as the serialized comparison", async () => {
    const message = "Native event requires one shared source/optical/motion state.";
    expect(await runWithSite(2, e => { (e.motion as { angularVelocityRadPerSec: { pitch: number } }).angularVelocityRadPerSec.pitch = .21; })).toBe(message);
    expect(await runWithSite(3, e => { const p = e.psf as { configuration: { psf: { profile: { nodes: { kernel: { normalizedIntensity: number[] } }[] } } } };
      p.configuration.psf.profile.nodes[0]!.kernel.normalizedIntensity[0]! += 1e-12; })).toBe(message);
    expect(await runWithSite(1, e => { (e.optics as Record<string, unknown>).extra = "x"; })).toBe(message);
  });

  it("keeps the serialized errors for non-finite and non-plain shared values", async () => {
    const invalid = "Invalid native scene binding.";
    expect(await runWithSite(2, e => { (e.motion as { angularVelocityRadPerSec: { pitch: number } }).angularVelocityRadPerSec.pitch = NaN; })).toBe(invalid);
    expect(await runWithSite(1, e => { (e.optics as Record<string, unknown>).when = new Date(0); })).toBe(invalid);
    expect(await runWithSite(3, e => { (e.fieldThroughput as Record<string, unknown>).table = new Map(); })).toBe(invalid);
  });

  it("accepts canonically equal shared state that is not strictly equal and keeps its RAW", async () => {
    const reference = await runWithSite(-1, () => {});
    expect(Array.isArray(reference)).toBe(true);
    // An undefined property and a non-index array property are omitted by the canonical comparison.
    expect(await runWithSite(2, e => { (e.optics as Record<string, unknown>).omitted = undefined; })).toEqual(reference);
    expect(await runWithSite(3, e => { const evidence = (e.fieldThroughput as { evidence: unknown[] & { note?: string } }).evidence; evidence.note = "kept"; }))
      .toEqual(reference);
  });
});

describe("native environment host yields inside a tile (2.0 performance)", () => {
  it("honors cancel() after one site of work instead of after the whole tile", async () => {
    const { input, provider } = nativeEnvironmentWorkload("psf-radial-field");
    let clock = 0, evaluations = 0, atCancel = -1;
    const evaluate = provider.evaluateRadiance;
    // Deterministic clock: every radiance evaluation costs 1 ms, so the 8 ms budget is spent within one site (144 queries).
    const task: ReturnType<typeof createNativeEnvironmentRawTaskWithCadence> = createNativeEnvironmentRawTaskWithCadence(input, { ...provider,
      evaluateRadiance: q => { clock++; evaluations++; return evaluate(q); },
      yieldControl: async (): Promise<void> => { if (atCancel < 0) { atCancel = evaluations; task.cancel(); } } },
    { budgetMilliseconds: 8, now: () => clock });
    await expect(task.run()).rejects.toThrow("aborted");
    expect(task.state).toBe("cancelled");
    expect(atCancel).toBe(144);
    expect(evaluations).toBe(atCancel);
    expect(() => task.takeOutput()).toThrow();
  });

  it("yields between every site on a zero budget without changing RAW codes or callbacks", async () => {
    const { input, provider } = nativeEnvironmentWorkload("pupil-rays");
    const baseline = createNativeEnvironmentRawTask(input, provider);
    await baseline.run();
    const expected = baseline.takeOutput();
    let yields = 0;
    const eager = createNativeEnvironmentRawTaskWithCadence(input, { ...provider, yieldControl: async (): Promise<void> => { yields++; } },
      { budgetMilliseconds: 0, now: () => 0 });
    await eager.run();
    const output = eager.takeOutput();
    expect(Array.from(output.raw.codes)).toEqual(Array.from(expected.raw.codes));
    expect(Array.from(output.raw.saturationFlags)).toEqual(Array.from(expected.raw.saturationFlags));
    expect(output.providerEvaluationCount).toBe(expected.providerEvaluationCount);
    // Two 2-site tiles: one planning yield, two execution yields and the tile-boundary yield per tile.
    expect(yields).toBe(8);
  });
});
