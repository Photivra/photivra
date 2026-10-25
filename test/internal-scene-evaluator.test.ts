// SPDX-License-Identifier: Apache-2.0
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CHART_SCENE_PRESETS, InvalidConfigurationError, createNativeEnvironmentRawTask, createPlanarSceneRadianceProvider, simulateCapture,
  type NativeEnvironmentRawProvider, type NativeEnvironmentRawTile, type SceneRadianceEvaluationRequest,
  type SimulateCaptureOptions } from "../src/index.js";
import { isDeeplyFrozen, isInternalSceneRadianceEvaluator, markInternalSceneRadianceEvaluator } from "../src/core/internal-radiance-evaluator.js";
import { parseSceneRadianceEvaluationResult, parseSceneRadianceEvaluationResultWithValidatedRecords } from "../src/schema/scene-radiance.js";
import { scaledTimeout } from "./helpers/test-timeout.js";
import { setTabulatedNativeRawEnabled } from "../src/capture/native-environment-tabulated.js";

/*
 * 2.6: results of the engine's own chart evaluators skip the unknown-key scan and the re-parse of their (deep-frozen,
 * already validated) uncertainty, evidence and limitations. Every reduced parse below also runs the full parse on the
 * same value and requires it to succeed with a deep-equal result, so each test checks the safety argument on the
 * actual results; caller scenes and caller providers must never take the reduced parse.
 */
const audit = vi.hoisted(() => ({ reduced: 0, mismatches: [] as string[] }));
vi.mock("../src/schema/scene-radiance.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/schema/scene-radiance.js")>();
  return { ...actual, parseSceneRadianceEvaluationResultWithValidatedRecords: (value: unknown, validated: Parameters<typeof actual.parseSceneRadianceEvaluationResultWithValidatedRecords>[1]): ReturnType<typeof actual.parseSceneRadianceEvaluationResult> => {
    audit.reduced++;
    const reduced = actual.parseSceneRadianceEvaluationResultWithValidatedRecords(value, validated);
    let full: unknown;
    try { full = actual.parseSceneRadianceEvaluationResult(value); } catch (error) { audit.mismatches.push("full parse throws: " + (error as Error).message); return reduced; }
    if (JSON.stringify(full) !== JSON.stringify(reduced)) audit.mismatches.push("different parse: " + JSON.stringify(value));
    return reduced;
  } };
});

const sceneFor = (preset: string): SimulateCaptureOptions["scene"] => (preset === "composite" ?
  { preset: "composite", elements: [{ scene: { preset: "zone-plate" }, centerU: -0.4, centerV: 0, width: 0.7, height: 0.7 }, { scene: { preset: "dead-leaves" }, centerU: 0.4, centerV: 0, width: 0.7, height: 0.7, mask: "ellipse" }] } :
  preset === "patches" ? { preset: "patches", patches: [{ patchId: "a", reflectance: 0.05 }, { patchId: "b", reflectance: 0.6 }], columns: 2 } : { preset }) as SimulateCaptureOptions["scene"];

describe("engine-built scene evaluators (2.6)", () => {
  // The environment path itself is under test (#394: chart captures otherwise take the tabulated RAW path).
  beforeAll(() => setTabulatedNativeRawEnabled(false));
  afterAll(() => setTabulatedNativeRawEnabled(true));
  it("every reduced parse of a chart result equals the full parse, for every chart preset and the Quality options", async () => {
    const before = audit.reduced;
    for (const preset of CHART_SCENE_PRESETS) await simulateCapture({ scene: sceneFor(preset), output: { width: 8, height: 6 } });
    await simulateCapture({ scene: { preset: "siemens-star" }, chartSize: { widthM: 0.2 }, lens: { fNumber: 11, diffraction: "circular-aperture" },
      sensor: { antiAliasing: { kind: "four-spot" }, pixelAperture: { kind: "box", samplesPerAxis: 2 } }, output: { width: 12, height: 8, demosaic: "ahd", region: { x: 2, y: 1, width: 6, height: 5 } } });
    await simulateCapture({ scene: { preset: "slanted-edge" }, illuminant: "cie-a", sensor: { pixelPitchMicrometers: 750 }, output: { width: 8, height: 6, whiteBalance: "auto" } });
    expect(audit.reduced - before).toBeGreaterThan(10_000);
    expect(audit.mismatches).toEqual([]);
  }, scaledTimeout(120_000));

  it("caller scenes keep the full validation", async () => {
    const before = audit.reduced;
    await simulateCapture({ scene: { kind: "reflectance-function", sceneId: "caller", evaluate: (p: { u: number }) => (p.u > 0 ? 0.7 : 0.1) }, output: { width: 8, height: 6 } } as never);
    await simulateCapture({ scene: { kind: "reflectance-function", sceneId: "caller", evaluate: () => 0.4 }, lens: { diffraction: "circular-aperture" }, output: { width: 8, height: 6 } } as never);
    expect(audit.reduced).toBe(before);
  }, scaledTimeout(60_000));

  it("caller providers keep the full validation on every result, including the public planar provider", async () => {
    const capture = await simulateCapture({ scene: { preset: "slanted-edge" }, output: { width: 6, height: 6 } });
    const input = capture.request.environmentRaw, width = input.raw.exposure.geometry.nativeRaster.pixelWidth;
    const planar = createPlanarSceneRadianceProvider({ scene: { preset: "slanted-edge" }, illuminant: { kind: "planckian", temperatureKelvin: 6500 },
      illuminanceLux: capture.scene.illuminant.illuminanceLux, distanceM: capture.scene.distanceM, framedWidthM: capture.scene.framedWidthM, aspect: 1,
      sceneId: "facade-scene", providerProfileId: "facade-provider" });
    expect(isInternalSceneRadianceEvaluator(planar.evaluateRadiance)).toBe(false);
    const frozen = Object.freeze({ uncertainty: Object.freeze({ kind: "not-quantified", limitation: "Test." }),
      evidence: Object.freeze([Object.freeze({ sourceOrigin: "photivra", sourceReference: "photivra:test", reuseStatus: "photivra-owned" })]), limitations: Object.freeze(["Test."]) });
    const run = async (evaluate: (q: Readonly<SceneRadianceEvaluationRequest>) => unknown): Promise<unknown> => {
      const provider: NativeEnvironmentRawProvider = { readTile: async (r): Promise<NativeEnvironmentRawTile> => ({ ...r, sites: Array.from({ length: r.width }, (_, j) => capture.request.siteInput(r.y * width + r.x + j)) }),
        evaluateRadiance: evaluate as NativeEnvironmentRawProvider["evaluateRadiance"], yieldControl: async (): Promise<void> => {} };
      const task = createNativeEnvironmentRawTask(input, provider);
      await task.run();
      return task.takeOutput().raw.codes;
    };
    const before = audit.reduced;
    // The public provider reproduces the capture's RAW through the full parse.
    expect(Array.from((await run(planar.evaluateRadiance.bind(planar))) as Uint16Array)).toEqual(Array.from(capture.raw.codes));
    // Deep-frozen records do not unlock the reduced parse for a caller: an unknown key late in the run is still refused.
    let calls = 0;
    await expect(run((q) => ({ ...planar.evaluateRadiance(q), ...frozen, ...(++calls === 500 ? { extra: 1 } : {}) }))).rejects.toThrow(/unknown field "extra"/);
    expect(calls).toBe(500);
    expect(audit.reduced).toBe(before);
  }, scaledTimeout(60_000));

  it("marks only functions the engine marked; deep-frozen means every reachable value is frozen without accessors", () => {
    const f = (): void => {};
    expect([isInternalSceneRadianceEvaluator(f), isInternalSceneRadianceEvaluator({}), isInternalSceneRadianceEvaluator(undefined)]).toEqual([false, false, false]);
    expect(isInternalSceneRadianceEvaluator(markInternalSceneRadianceEvaluator(f))).toBe(true);
    expect(isDeeplyFrozen(Object.freeze({ a: Object.freeze([1, "x"]) }))).toBe(true);
    expect(isDeeplyFrozen(Object.freeze({ a: [1] }))).toBe(false);
    expect(isDeeplyFrozen(Object.freeze(Object.defineProperty({}, "a", { get: () => 1, enumerable: true })))).toBe(false);
    expect(isDeeplyFrozen(Object.freeze({ f: Object.freeze(() => 1) }))).toBe(false);
    expect([isDeeplyFrozen(1), isDeeplyFrozen(null), isDeeplyFrozen("s")]).toEqual([true, true, true]);
  });

  it("the reduced parse keeps every scalar check with the full parse's messages, and falls back for other records", () => {
    const records = { uncertainty: Object.freeze({ kind: "not-quantified" as const, limitation: "T." }),
      evidence: Object.freeze([Object.freeze({ sourceOrigin: "photivra" as const, sourceReference: "photivra:t", reuseStatus: "photivra-owned" as const })]), limitations: Object.freeze(["T."]) };
    const good = { schemaVersion: "0.1.0", quantity: "outgoing-spectral-radiance", unit: "W/m^2/sr/nm", scientificStatus: "approximation", sampleId: "s", providerProfileId: "p",
      sceneId: "c", wavelengthNanometers: 550, wavelengthBasis: "vacuum", spectralRadianceWattsPerSquareMeterSteradianNanometer: 0.1, ...records };
    const parsed = parseSceneRadianceEvaluationResult(good), validated = { ...records, parsed };
    expect(parseSceneRadianceEvaluationResultWithValidatedRecords({ ...good, spectralRadianceWattsPerSquareMeterSteradianNanometer: 0.3 }, validated))
      .toEqual(parseSceneRadianceEvaluationResult({ ...good, spectralRadianceWattsPerSquareMeterSteradianNanometer: 0.3 }));
    const message = (f: () => unknown): string => { try { f(); return "no error"; } catch (error) { expect(error).toBeInstanceOf(InvalidConfigurationError); return (error as Error).message; } };
    for (const bad of [null, [], 3, { ...good, spectralRadianceWattsPerSquareMeterSteradianNanometer: Number.NaN }, { ...good, spectralRadianceWattsPerSquareMeterSteradianNanometer: -1 },
      { ...good, spectralRadianceWattsPerSquareMeterSteradianNanometer: Infinity }, { ...good, sampleId: "" }, { ...good, sceneId: 4 }, { ...good, providerProfileId: undefined },
      { ...good, wavelengthNanometers: 0 }, { ...good, wavelengthBasis: "air?" }, { ...good, unit: "W" }, { ...good, quantity: "x" }, { ...good, schemaVersion: "9" },
      { ...good, scientificStatus: "calibrated" }, { ...good, evidence: [{ sourceOrigin: "nowhere" }] }, { ...good, limitations: [""] }, { ...good, uncertainty: { kind: "x" } }]) {
      const full = message(() => parseSceneRadianceEvaluationResult(bad));
      expect(full).not.toBe("no error");
      expect(message(() => parseSceneRadianceEvaluationResultWithValidatedRecords(bad, validated))).toBe(full);
    }
    // Another key is accepted only because records come from an engine-built evaluator; with other records the full parse runs.
    expect(message(() => parseSceneRadianceEvaluationResultWithValidatedRecords({ ...good, limitations: ["T."], extra: 1 }, validated))).toMatch(/unknown field/);
  });
});
