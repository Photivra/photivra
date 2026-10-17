// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createNativeEnvironmentRawPartitionTask, createNativeEnvironmentRawTask, composeNativeEnvironmentRawPartitions, calculateNativeRawRowBands,
  simulateCapture, type NativeEnvironmentRadianceQuery, type NativeEnvironmentRawInput, type NativeEnvironmentRawOutput,
  type NativeEnvironmentRawProvider, type NativeEnvironmentRawTile, type SceneRadianceEvaluationRequest, type SceneRadianceEvaluationResult,
  type SensorApertureRay } from "../src/index.js";
import { nativeEnvironmentLeanStatistics } from "../src/capture/native-environment-lean.js";
import { nativeEnvironmentWorkload, nativeEnvironmentWorkloads } from "./helpers/native-environment-workloads.js";
import { scaledTimeout } from "./helpers/test-timeout.js";

/*
 * Batched light sampling (2.0, additive, #275): a provider's evaluateRadianceBatch receives every query of a tile in
 * per-query callback order. With the same results, RAW, photo expectations, evaluation counts and errors must equal
 * those of the per-query provider, and the batch must see exactly the requests the per-query callbacks would see.
 */
const sha = (bytes: ArrayBufferView): string => createHash("sha256").update(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)).digest("hex");
type Evaluate = NativeEnvironmentRawProvider["evaluateRadiance"];
type Aperture = NonNullable<NativeEnvironmentRawProvider["evaluateApertureRadiance"]>;
interface Recorded { summary: Record<string, unknown>; requests: string[]; batchCalls: number; perQueryCalls: number }

/** The same provider, run per query or batched (synchronously or through a promise). */
async function run(input: NativeEnvironmentRawInput, base: NativeEnvironmentRawProvider, mode: "per-query" | "batch" | "async-batch",
  options: { corrupt?: (results: SceneRadianceEvaluationResult[]) => unknown } = {}): Promise<Recorded> {
  const requests: string[] = [], photo: number[] = [];
  let batchCalls = 0, perQueryCalls = 0;
  const record = (q: Readonly<SceneRadianceEvaluationRequest>, ray?: Readonly<SensorApertureRay>): void => {
    requests.push(JSON.stringify([q, ray ?? null, Object.isFrozen(q), Object.isFrozen(q.target), ray ? Object.isFrozen(ray) : null]));
  };
  const evaluate: Evaluate = q => { perQueryCalls++; record(q); return base.evaluateRadiance(q); };
  const aperture: Aperture | undefined = base.evaluateApertureRadiance ? (q, ray): SceneRadianceEvaluationResult => { perQueryCalls++; record(q, ray); return base.evaluateApertureRadiance!(q, ray); } : undefined;
  const answer = (queries: readonly NativeEnvironmentRadianceQuery[]): SceneRadianceEvaluationResult[] => queries.map(({ request, apertureRay }) => {
    record(request, apertureRay);
    return apertureRay === undefined ? base.evaluateRadiance(request) : base.evaluateApertureRadiance!(request, apertureRay);
  });
  const provider: NativeEnvironmentRawProvider = { ...base, evaluateRadiance: evaluate, ...(aperture ? { evaluateApertureRadiance: aperture } : {}),
    observePhotoTile: (tile): void => { for (const s of tile.sites) photo.push(s.nativeIndex, s.expectedIncidentPhotonCount, s.expectedGeneratedElectronCount); },
    ...(mode === "per-query" ? {} : { evaluateRadianceBatch: (queries: readonly NativeEnvironmentRadianceQuery[]): SceneRadianceEvaluationResult[] |
      Promise<SceneRadianceEvaluationResult[]> => {
      batchCalls++;
      expect(Object.isFrozen(queries)).toBe(true);
      const results = answer(queries), returned = (options.corrupt ? options.corrupt(results) : results) as SceneRadianceEvaluationResult[];
      return mode === "async-batch" ? Promise.resolve(returned) : returned;
    } }) };
  const summary: Record<string, unknown> = {};
  try {
    const task = createNativeEnvironmentRawTask(input, provider);
    await task.run();
    const o: NativeEnvironmentRawOutput = task.takeOutput();
    Object.assign(summary, { codes: sha(o.raw.codes), black: sha(o.raw.blackLevels), saturation: sha(o.raw.digitalSaturationCodes), flags: sha(o.raw.saturationFlags),
      white: Array.from(o.raw.effectiveSaturationCodes), evaluations: o.providerEvaluationCount, photo: sha(Float64Array.from(photo)) });
  } catch (error) {
    summary.error = `${(error as Error).constructor.name}: ${(error as Error).message}`;
  }
  return { summary, requests, batchCalls, perQueryCalls };
}

const evidence = [{ sourceOrigin: "photivra" as const, sourceReference: "photivra:batch-test", reuseStatus: "photivra-owned" as const }];
function result(q: Readonly<SceneRadianceEvaluationRequest>, ray?: Readonly<SensorApertureRay>): SceneRadianceEvaluationResult {
  const d = q.target.kind === "environment-direction" ? q.target.outgoingDirectionUnitVector : { x: 0, y: 0, z: 1 };
  return { schemaVersion: "0.1.0", sampleId: q.sampleId, sceneId: q.sceneId, providerProfileId: q.providerProfileId,
    wavelengthNanometers: q.wavelengthNanometers, wavelengthBasis: q.wavelengthBasis, quantity: "outgoing-spectral-radiance", unit: "W/m^2/sr/nm",
    spectralRadianceWattsPerSquareMeterSteradianNanometer: 0.02*(1+0.6*Math.sin(900*d.x)*Math.cos(700*d.y))*(ray ? 1+0.1*ray.pupilSampleIndex : 1),
    scientificStatus: "approximation", uncertainty: { kind: "not-quantified", limitation: "Test analytic field." }, evidence, limitations: ["Test analytic field."] };
}
let facade: (lens?: Record<string, unknown>) => Promise<{ input: NativeEnvironmentRawInput; provider: NativeEnvironmentRawProvider }>;
beforeAll(() => {
  facade = async (lens): Promise<{ input: NativeEnvironmentRawInput; provider: NativeEnvironmentRawProvider }> => {
    const capture = await simulateCapture({ scene: { preset: "slanted-edge" }, output: { width: 6, height: 6 }, ...(lens ? { lens } : {}) } as Parameters<typeof simulateCapture>[0]);
    const input = { ...capture.request.environmentRaw, raw: { ...capture.request.environmentRaw.raw, tileWidth: 4 } };
    const width = input.raw.exposure.geometry.nativeRaster.pixelWidth;
    return { input, provider: { readTile: async (r): Promise<NativeEnvironmentRawTile> => ({ ...r, sites: Array.from({ length: r.width },
      (_, j) => capture.request.siteInput(r.y*width+r.x+j)) }), evaluateRadiance: (q): SceneRadianceEvaluationResult => result(q), evaluateApertureRadiance: (q, ray): SceneRadianceEvaluationResult => result(q, ray),
    yieldControl: async (): Promise<void> => {} } };
  };
});

describe("batched light sampling (evaluateRadianceBatch)", () => {
  it.each(nativeEnvironmentWorkloads)("equals the per-query provider for %s", async kind => {
    const { input, provider } = nativeEnvironmentWorkload(kind);
    const perQuery = await run(input, provider, "per-query");
    for (const mode of ["batch", "async-batch"] as const) {
      const batched = await run(input, provider, mode);
      expect(batched.summary).toEqual(perQuery.summary);
      expect(batched.requests).toEqual(perQuery.requests);
      expect(batched.perQueryCalls).toBe(0);
      expect(batched.batchCalls).toBe(input.raw.exposure.geometry.nativeRaster.pixelHeight);
    }
    expect(perQuery.summary.error).toBeUndefined();
  });

  it("equals the per-query provider for facade captures on the lean path (default optics, pupil rays, lens field mapping)", async () => {
    for (const lens of [undefined, { pupilSampling: { radialSamples: 1, angularSamples: 4 } }, { distortion: { kind: "radial",
      profile: { normalizationRadiusMm: 0.05, maximumNormalizedRadius: 1, coefficients: { k1: -0.2, k2: 0, k3: 0 } } } }]) {
      const { input, provider } = await facade(lens), before = nativeEnvironmentLeanStatistics.executedSites;
      const perQuery = await run(input, provider, "per-query"), batched = await run(input, provider, "batch");
      expect(perQuery.summary.error).toBeUndefined();
      expect(batched.summary).toEqual(perQuery.summary);
      expect(batched.requests).toEqual(perQuery.requests);
      expect(nativeEnvironmentLeanStatistics.executedSites - before).toBeGreaterThan(0);
    }
  }, scaledTimeout(120_000));

  it("validates batch results like per-query results", async () => {
    const { input, provider } = nativeEnvironmentWorkload("pupil-rays");
    for (const corrupt of [(r: SceneRadianceEvaluationResult[]): unknown => r.map((x, i) => i === 37 ? { ...x, sampleId: "other" } : x),
      (r: SceneRadianceEvaluationResult[]): unknown => r.map((x, i) => i === 5 ? { ...x, spectralRadianceWattsPerSquareMeterSteradianNanometer: Number.NaN } : x),
      (r: SceneRadianceEvaluationResult[]): unknown => r.map((x, i) => i === 70 ? { ...x, evidence: [] } : x)]) {
      const perQueryProvider: NativeEnvironmentRawProvider = { ...provider, evaluateRadiance: q => provider.evaluateRadiance(q),
        evaluateApertureRadiance: (q, ray) => provider.evaluateApertureRadiance!(q, ray) };
      // The per-query reference with the same corruption at the same query position.
      let calls = 0;
      const corruptOne = (x: SceneRadianceEvaluationResult): SceneRadianceEvaluationResult => {
        const position = calls++;
        return (corrupt(Array.from({ length: position+1 }, (_, i) => i === position ? x : { ...x })) as SceneRadianceEvaluationResult[])[position]!;
      };
      const reference = await run(input, { ...perQueryProvider, evaluateApertureRadiance: (q, ray) => corruptOne(provider.evaluateApertureRadiance!(q, ray)) }, "per-query");
      calls = 0;
      const batched = await run(input, provider, "batch", { corrupt });
      expect(reference.summary.error).toBeTypeOf("string");
      expect(batched.summary.error).toBe(reference.summary.error);
    }
    for (const corrupt of [(r: SceneRadianceEvaluationResult[]): unknown => r.slice(1), (): unknown => "not an array",
      (r: SceneRadianceEvaluationResult[]): unknown => { const sparse = [...r]; delete sparse[3]; return sparse; }]) {
      expect((await run(input, provider, "batch", { corrupt })).summary.error).toMatch(/one result per query/);
    }
    expect(() => createNativeEnvironmentRawTask(input, { ...provider, evaluateRadianceBatch: 1 as never })).toThrow(/callbacks/);
  });

  it("works inside row-band partitions", async () => {
    const { input, provider } = await facade();
    const expected = (await run(input, provider, "per-query")).summary;
    const batchProvider: NativeEnvironmentRawProvider = { ...provider, evaluateRadianceBatch: queries => queries.map(q => result(q.request, q.apertureRay)) };
    const plan = createNativeEnvironmentRawTask(input, provider).plan;
    const parts = await Promise.all(calculateNativeRawRowBands(plan, 3).map(async band => {
      const task = createNativeEnvironmentRawPartitionTask(input, band, batchProvider); await task.run(); return task.takeOutput();
    }));
    const merged = composeNativeEnvironmentRawPartitions(input, parts);
    expect({ codes: sha(merged.raw.codes), evaluations: merged.providerEvaluationCount }).toEqual({ codes: expected.codes, evaluations: expected.evaluations });
  }, scaledTimeout(120_000));
});
